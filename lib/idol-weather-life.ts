/** A small seasonal event, not a reaction generator for every rainy day. */
import { kvGet, kvSet } from './kv-db';
import { seasonFirstSnow } from './idol-weather';
import { loadCareer } from './idol-career';
import { loadTraineeCard } from './trainee-card';
import { loadCharacters } from './character-storage';
import { composePersona, getProfile } from './idol-people';
import { loadChatContacts, loadChatSessions, createOrGetSession, pushChatMessage } from './chat-storage';
import { addMomentPost, updateMomentPost } from './moments-storage';
import { loadApiConfigs, loadBindingConfig, resolveBinding } from './settings-storage';
import { simpleLLMCall } from './api-helpers';
import { realNow } from './world-clock';
const KEY='idol_weather_life_v1';
type State=Record<string,{done?:boolean;retryAt?:number;postId?:string;messageSent?:boolean}>;
function load():State{try{return JSON.parse(kvGet(KEY)||'{}');}catch{return {};}}
function save(value:State){kvSet(KEY,JSON.stringify(value));}
let busy=false;
let checkedAt=0;
let checkedWorld=0;
function hash(s:string){let n=0;for(const c of s)n=(Math.imul(n,31)+c.charCodeAt(0))>>>0;return n;}
export async function firstSnowTick():Promise<void>{
  const card=loadTraineeCard(),now=Date.now();if(busy||!card||loadCareer().stage==='pre')return;
  if(now===checkedWorld&&realNow()-checkedAt<60000)return;
  // Most ticks stay local after the seasonal proof has been cached.
  busy=true;checkedAt=realNow();checkedWorld=now;
  const identity=kvGet('idol_trainee_card_v1');
  try{
    const snow=await seasonFirstSnow(now);if(!snow)return;
    const id=String(snow.season),state=load(),record=state[id]??{};
    if(record.done||realNow()<(record.retryAt??0))return;
    const start=new Date(`${card.start}T00:00:00`).getTime();
    if(Number.isFinite(start)&&snow.at<start){save({...state,[id]:{done:true}});return;}
    // No unsolicited interruptions while a scene/replay is being watched.
    if(typeof document!=='undefined'&&document.querySelector('.vn-shell[data-stage]'))return;
    const friendIds=loadChatContacts().map(x=>x.characterId);
    const people=loadCharacters().filter(c=>friendIds.includes(c.id)&&getProfile(c.id).met&&!getProfile(c.id).familyMemberId&&getProfile(c.id).leave?.phase!=='left'&&!/老师|管理/.test(getProfile(c.id).role));
    if(!people.length)return;
    const person=people[hash(id)%people.length],profile=getProfile(person.id);
    const slot=resolveBinding(loadBindingConfig(),person.id,'chat');
    const config=loadApiConfigs().find(c=>c.id===slot.apiConfigId)??loadApiConfigs()[0];if(!config)return;
    const fresh=now-snow.at<=6*3600e3;
    let groupId:string|undefined;try{groupId=JSON.parse(kvGet('idol_kakao_v1')||'{}').groupId;}catch{/* no group */}
    const group=loadChatSessions().find(s=>s.id===groupId);
    const canGroup=Boolean(group?.participantIds?.includes(person.id));
    const channel=fresh?(canGroup&&hash(id+'group')%2===0?'group':'private'):'none';
    // One small request per season, with retry backoff; never generates the weather or images.
    save({...state,[id]:{...record,retryAt:realNow()+10*60000}});
    const result=await simpleLLMCall(config,[{role:'system',content:'为韩国娱乐圈生活模拟器写一条非常日常的初雪动态。只输出JSON：{"post":"一两句动态正文","photo":"随手拍的雪景描述","message":"一句KKT消息，允许空字符串"}。按给定人物性格说话，韩语台词后用|附中文。不要写用户的反应。不夸张，不全员狂欢，不强行浪漫告白，不重复播报天气。照片只是普通人手机随手拍，不能写成已生成的图片。'},{role:'user',content:`人物：${person.name}\n${composePersona(profile)||person.persona}\n首尔这个秋冬季第一次下雪，发生于${new Date(snow.at).toLocaleString('zh-CN')}。动态记在当时，可拍窗边或下班路的雪；不要假定用户也在外面。${channel==='none'?'用户已经跳过这一天，只写当时留下的动态，message必须为空，不能补发过期消息。':`现在仍在初雪发生后几小时内；${channel==='group'?'可以在练习生群里随口提一句':'可以私下给用户随口发一句'}，不需要每个人都回应，message也可为空。`}`}],{temperature:0.8,label:'初雪生活片段'});
    if(!result.content)throw Error('初雪片段暂未生成');
    const data=JSON.parse(result.content.match(/\{[\s\S]*\}/)?.[0]??'{}') as {post?:string;photo?:string;message?:string};
    if(!data.post?.trim())throw Error('初雪动态为空');
    // A save switch, time jump, or scene opened while waiting invalidates this attempt.
    if(kvGet('idol_trainee_card_v1')!==identity||Math.abs(Date.now()-now)>10*60000||document.querySelector('.vn-shell[data-stage]'))return;
    const latest=load(),entry=latest[id]??{};if(entry.done)return;
    if(!entry.postId){
      const post=addMomentPost({authorType:'character',authorId:person.id,content:data.post.trim().slice(0,600),photoDescription:data.photo?.trim().slice(0,800)||undefined,visibility:friendIds});
      if(!post)return;
      updateMomentPost(post.id,{createdAt:new Date(snow.at).toISOString()});entry.postId=post.id;
      save({...latest,[id]:entry});
    }
    if(fresh&&Date.now()-snow.at<=6*3600e3&&!entry.messageSent&&data.message?.trim()){
      // Re-check membership; never add a stranger or create a new group for this event.
      const target=channel==='group'?loadChatSessions().find(s=>s.id===groupId&&s.participantIds?.includes(person.id)):createOrGetSession(person.id);
      if(target){pushChatMessage({sessionId:target.id,role:'assistant',content:data.message.trim().slice(0,600),...(channel==='group'?{senderCharacterId:person.id,senderName:person.name}:{}),createdAt:new Date().toISOString(),status:'sent'});entry.messageSent=true;}
    }
    save({...load(),[id]:{...entry,done:true}});
  }finally{busy=false;}
}
