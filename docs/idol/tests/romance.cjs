// 内存存档 + 假模型，运行真实知情账/剧情结算/Ins tick/处理规划；不联网、不读取真实存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require('typescript'), ROOT = path.resolve(__dirname, '../../../lib');
const kv = new Map(), calls = [], queued = [], feed = [], notes = [], cache = {};
let now = Date.parse('2026-10-29T04:00:00Z'), plan = {action:'observe',reason:'先观察，不急着询问'}, sceneReply = {}, blocked = null;
class Clock extends Date { constructor(...xs){super(...(xs.length ? xs : [now]));} static now(){return now;} }
const chars = [{id:'teacher',name:'林老师'},{id:'boy',name:'俊'},{id:'friend',name:'夏琳'},{id:'other',name:'美娜'}];
const profiles = Object.fromEntries(chars.map(c=>[c.id,{charId:c.id,role:c.id==='teacher'?'声乐老师':'练习生',met:true,events:[],privateLines:[],secret:{kind:'none'}}]));
const career = {companyId:'test',stage:'trainee',facts:['练习生有恋爱禁令，老师可酌情处理'],nodes:[]};
const mocks = {
 './kv-db':{kvGet:k=>kv.get(k)||null,kvSet:(k,v)=>kv.set(k,v)},
 './character-storage':{loadCharacters:()=>chars,loadAllCharacters:()=>chars,HIDDEN_WORLD_CHAR_ID:'idol_world'},
 './chat-storage':{loadChatContacts:()=>chars.map(c=>({characterId:c.id}))},
 './settings-storage':{loadApiConfigs:()=>[{id:'fake'}],loadBindingConfig:()=>({}),resolveBinding:()=>({apiConfigId:'fake'})},
 './trainee-card':{loadTraineeCard:()=>({name:'小花',birthday:'2005-01-01'})},
 './idol-people':{getProfile:id=>profiles[id],loadProfiles:()=>profiles,saveProfile:p=>profiles[p.charId]=p,composePersona:p=>`${p.role}；温和谨慎，会先了解情况`,relationOf:()=> '朋友',stepRelation:p=>p},
 './idol-career':{loadCareer:()=>career,companyOf:()=>({name:'测试公司'}),nodeById:()=>null,completeNode:async()=>null},
 './idol-reminders':{teacherOf:()=>chars[0],queueMessage:(...args)=>queued.push(args)},
 './idol-events':{addWorldFeed:t=>feed.push(t),addFame:()=>{}},
 './idol-fame':{fameEvent:()=>{}},
 './idol-starroad':{onScenePractice:()=>{}},
 './idol-kakao':{afterNodeScene:async()=>{}},
 './image-generation-service':{SELF_REFERENCE_ID:'me'},
 './api-helpers':{simpleLLMCall:async(_config,m,opts)=>{calls.push({m,label:opts?.label});if(blocked)await blocked;return {content:JSON.stringify(opts?.label==='剧情记账'?sceneReply:plan)};}},
};
function load(name) {
 if(mocks[name])return mocks[name]; if(cache[name])return cache[name].exports;
 if(!['./idol-romance','./idol-romance-reactions','./idol-world','./idol-ins'].includes(name))return {};
 const module={exports:{}};cache[name]=module;
 const code=ts.transpileModule(fs.readFileSync(path.join(ROOT,name.slice(2)+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:load,Date:Clock,console,window:{dispatchEvent:()=>{}},Event:class{},setTimeout,clearTimeout},{filename:name}); return module.exports;
}
const r=load('./idol-romance'), reactions=load('./idol-romance-reactions'), tick=async()=>{reactions.romanceTick();await new Promise(resolve=>setImmediate(resolve));};
function record(quote,over={}) {return r.recordSceneRomance({sourceId:'scene:a',at:now,transcript:quote,present:chars,playerName:'小花',observations:[{observer:'林老师',partner:'俊',level:'confirmed',source:'disclosure',sourceName:'小花',quote,...over}]});}
function fresh(){kv.clear();queued.length=0;calls.length=0;}
(async()=>{
 fresh();
 for(const q of ['林老师看到小花和俊一起吃饭。','林老师好像看到小花和俊接吻了。','林老师告诉俊不要恋爱。','小花对林老师说：我和俊没有在交往。','小花对林老师说：我和俊是不是在交往？','林老师看到小花和俊排练接吻的台词。']) record(q);
 assert.equal(r.loadRomance().knowledge.length,0,'普通约会、猜测、禁令、否认、假设或表演不能记成发现');
 const kiss='林老师走进来，亲眼看到小花亲吻了俊。';
 record(kiss,{source:'witness',level:'confirmed'});assert.equal(r.loadRomance().knowledge.length,0,'目击亲密不能升级确认交往');
 assert.equal(record(kiss,{source:'witness',level:'intimacy'}).length,1);
 record(kiss,{source:'witness',level:'intimacy'});assert.equal(r.loadRomance().knowledge.length,1,'重复结算不重复发现');
 assert(!r.romanceActorHint('friend').includes(kiss),'别人的原始证据不得传入此人的私有提示');
 assert.equal(r.loadRomance().exposures.length,0,'私下发现不是公开曝光');
 await tick();assert.equal(queued.length,0);assert.equal(r.loadRomance().knowledge[0].reaction.action,'observe');await tick();assert.equal(calls.length,1,'观察不会持续模拟或重复规划');

 fresh();const disclosure='小花对林老师说：我和俊正在交往。';
 r.recordSceneRomance({sourceId:'scene:private',at:now,transcript:disclosure,present:[chars[0]],people:chars,playerName:'小花',observations:[{observer:'林老师',partner:'俊',source:'disclosure',sourceName:'小花',level:'confirmed',quote:disclosure}]});
 assert.equal(r.loadRomance().knowledge.length,1,'对象不在现场也可以主动告知老师');
 plan={action:'talk',reason:'先私下听她说明，不直接处罚',intent:'想听她说说具体情况',at:new Clock(now+3*3600e3).toISOString(),place:'声乐教室'};
 await tick();assert.equal(queued.length,1);let options=queued[0][3];assert(options.node&&options.strictPersona&&options.romanceId);assert.equal(career.nodes.length,0,'规划不会先保存谈话事项');assert.equal(r.loadRomance().knowledge[0].reaction.status,'queued');
 r.romanceMessageDelivered(options.romanceId,{id:'actual-msg',sessionId:'teacher-chat',content:'方便的话，下午来聊聊？'});assert.equal(r.loadRomance().knowledge[0].reaction.status,'done');assert(r.romanceActorHint('teacher').includes('下午来聊聊'));await tick();assert.equal(queued.length,1);
 const outcome='林老师说：既然说明白了，只要不影响训练，我暂时不会告诉其他管理。';
 r.recordSceneRomance({sourceId:'scene:talk',at:now,transcript:outcome,present:chars,observations:[],outcomes:[{observer:'林老师',partner:'俊',quote:outcome,text:'老师已了解情况，要求不影响训练，暂不告知其他管理。'}]});
 assert(r.romanceActorHint('teacher').includes('暂时不会告诉其他管理'));assert(!r.romanceActorHint('other').includes('暂时不会告诉其他管理'));await tick();assert.equal(queued.length,1);
 const relay='林老师告诉夏琳：小花和俊正在交往。';
 r.recordSceneRomance({sourceId:'scene:relay',at:now,transcript:relay,present:chars,observations:[{observer:'夏琳',partner:'俊',source:'relay',sourceName:'美娜',level:'confirmed',quote:relay}]});assert.equal(r.loadRomance().knowledge.length,1,'不知情者不能转告');
 record(relay,{observer:'夏琳',source:'relay',sourceName:'林老师'});assert.equal(r.loadRomance().knowledge.length,2,'实际知情者明确转告后只增加接收人');
 assert(!r.loadRomance().knowledge.some(k=>k.observerId==='other'));

 fresh();r.recordSceneRomance({sourceId:'scene:left',at:now,transcript:kiss,present:chars,witnessTranscript:()=>'',observations:[{observer:'林老师',partner:'俊',source:'witness',level:'intimacy',quote:kiss}]});assert.equal(r.loadRomance().knowledge.length,0,'离场段落不能成为目击证据');
 r.recordSceneRomance({sourceId:'scene:fakequote',at:now,transcript:'只有两人吃饭。',present:chars,observations:[{observer:'林老师',partner:'俊',source:'witness',level:'intimacy',quote:kiss}]});assert.equal(r.loadRomance().knowledge.length,0,'不能捏造证据原文');

 // 两个App确实共用的真实结算入口：旧的普通记忆照常写，私密事实单独存。
 const world=load('./idol-world');let meta={place:'练习室',startAt:now,newFaces:[]};
 sceneReply={summary:'老师听到了当事人的说明',people:[],romanceObservations:[{observer:'林老师',partner:'俊',source:'disclosure',sourceName:'小花',level:'confirmed',quote:disclosure}]};
 const host={key:'actual-close',meta:()=>meta,saveMeta:m=>meta=m,ids:()=>chars.map(c=>c.id),setIds:()=>{},transcript:()=>disclosure,fallbackPlace:'练习室'};
 await world.closeSceneWith(host);assert.equal(r.loadRomance().knowledge.length,1);assert(meta.ended);const count=calls.length;await world.closeSceneWith(host);assert.equal(calls.length,count,'已经结算的场景不重复调用模型');

 fresh();const ins=load('./idol-ins');
 kv.set('idol_ins_v1',JSON.stringify({posts:[{id:'p1',at:now-10000,by:'me',imgs:[{desc:'合照',who:['me','boy']}],cap:'',comments:[],likes:0,risk:{love:true,level:'high',why:'合照被解读为恋情线索',leakAt:now-1}}]}));
 ins.insTick(n=>notes.push(n));assert.equal(r.loadRomance().exposures.length,1);assert.equal(r.loadRomance().knowledge[0].level,'report');assert.equal(queued.length,0,'曝光不再固定排严厉约谈');assert.equal(notes.length,1);assert.equal(feed.length,1);
 ins.insTick(n=>notes.push(n));assert.equal(notes.length,1);assert.equal(r.loadRomance().exposures.length,1);
 plan={action:'ignore',reason:'未核实网上说法，暂不干涉'};await tick();assert.equal(queued.length,0);assert.equal(r.loadRomance().knowledge[0].reaction.action,'ignore');
 assert(!r.romanceActorHint('other').includes('被明确告知交往'));

 for(const action of ['observe','ignore','ask','remind','talk']){
  fresh();record(disclosure);plan={action,reason:'按人物性格处理',intent:'先了解实际情况',at:new Clock(now+2*3600e3).toISOString(),place:'办公室'};await tick();
  assert.equal(r.loadRomance().knowledge[0].reaction.action,action);assert.equal(queued.length,['observe','ignore'].includes(action)?0:1);
 }
 fresh();record(disclosure);plan={action:'talk',reason:'想了解情况',intent:'先问问',at:'无效时间',place:''};await tick();assert.equal(queued[0][3].node,undefined);assert.equal(r.loadRomance().knowledge[0].reaction.action,'ask','无有效时间地点不造事项');
 fresh();record(disclosure);plan={action:'punish',reason:'不允许的自动处罚'};for(let i=0;i<4;i++){await tick();now+=6*60e3;}assert.equal(calls.length,3);assert.equal(queued.length,0,'无效规划有重试上限，不能自动处罚');
 fresh();record(disclosure,{sourceName:'夏琳'});assert.equal(r.loadRomance().knowledge.length,0,'不知情第三人不能冒充当事人确认');
 // 从亲密目击升级为当事人确认，只按新事实规划，不再反复首次发现。
 fresh();record(kiss,{source:'witness',level:'intimacy'});record(disclosure);assert(r.loadRomance().knowledge[0].supersededBy);plan={action:'observe',reason:'已得到明确说明，继续正常相处'};await tick();await tick();assert.equal(calls.length,1);assert(!r.romanceActorHint('teacher').includes('仅目击明确亲密行为，关系未确认'));
 // 切档后异步结果丢弃，不往另一个世界写任务。
 fresh();record(disclosure);let release;blocked=new Promise(resolve=>release=resolve);reactions.romanceTick();kv.clear();release();blocked=null;await new Promise(resolve=>setImmediate(resolve));assert.equal(r.loadRomance().knowledge.length,0);assert.equal(queued.length,0);
 console.log(JSON.stringify({ok:true,realApiCalls:0,conservativeEvidence:true,scopedKnowledge:true,relayRequiresSource:true,sceneCloseIntegrated:true,insExposureIntegrated:true,personalityChoices:true,noTaskBeforeDelivery:true,idempotent:true,worldSwitchSafe:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
