/** 生日：统一规划庆祝与祝福人选，祝福逐人走原KKT引擎。 */
import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import { loadChatContacts, loadChatMessages, loadChatSessions } from "./chat-storage";
import { composePersona, getProfile, kinshipOf, relationOf } from "./idol-people";
import { companyOf, loadCareer, type CareerNode } from "./idol-career";
import { loadTraineeCard, describeTrainee } from "./trainee-card";
import { orderedFamilyMembers } from "./idol-family-data";
import { queueMessage } from "./idol-reminders";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { allScenePlaces, placeLocked } from "./idol-stage";

const KEY = "idol_birthday_v1", HOUR = 3600e3, MIN = 60e3;
type BirthdayPlan = { year: number; date: string; family: string[]; friends: string[]; parties: CareerNode[] };
function load(): Record<string, BirthdayPlan> { try { return JSON.parse(kvGet(KEY) || "{}"); } catch { return {}; } }
const rank: Record<string, number> = { 恋人: 9, 暧昧: 8, 好朋友: 7, 朋友: 5, 熟人: 2 };
export function birthdayCandidates(): { family: string[]; friends: string[] } {
  const chars = loadCharacters(), blocked = new Set(loadChatSessions().filter(s => !s.isGroup && s.isBlacklisted).map(s => s.contactId)), contacts = new Set(loadChatContacts().map(c => c.characterId).filter(id => !blocked.has(id)));
  const family = [...new Set([...orderedFamilyMembers().flatMap(m => m.charId ? [m.charId] : []), ...chars.filter(c => kinshipOf(getProfile(c.id)) !== "none").map(c => c.id)])].filter(id => contacts.has(id) && chars.some(c => c.id === id));
  const friends = chars.filter(c => !family.includes(c.id) && contacts.has(c.id) && getProfile(c.id).met && (rank[relationOf(getProfile(c.id))] || loadCareer().roommates?.includes(c.id)))
    .sort((a,b) => (rank[relationOf(getProfile(b.id))] || 0) - (rank[relationOf(getProfile(a.id))] || 0) || getProfile(b.id).events.length - getProfile(a.id).events.length).map(c => c.id);
  return { family, friends };
}
function canHost(id: string): boolean {
  const p = getProfile(id), age = parseInt(p.age, 10);
  return (!Number.isFinite(age) || age >= 14) && (!p.location || /韩国|首尔|釜山|仁川|大邱|大田/.test(p.location));
}
function freeAt(at: number, parties: CareerNode[] = []): boolean {
  return ![...loadCareer().nodes.filter(n => n.status === "pending"), ...parties].some(n => Math.abs(n.dueAt-at) < 2*HOUR);
}
function fallbackParty(year: number, now: number, hosts: string[]): CareerNode[] {
  const host = hosts.find(canHost); if (!host) return [];
  const d = new Date(now + 3*HOUR); d.setMinutes(0,0,0);
  for (let i=0;i<36;i++,d.setHours(d.getHours()+1)) {
    if (d.getHours()<10 || d.getHours()>22 || !freeAt(d.getTime())) continue;
    const p=getProfile(host), text=[...p.privateLines,p.speech].join(" ");
    const place=loadCareer().roommates?.includes(host)?"宿舍":/唱歌|音乐|热闹|KTV/.test(text)?"江南·KTV":"江南·咖啡店";
    return [{id:`birthday_${year}_party_0`,kind:"date",title:"生日庆祝",place,dueAt:d.getTime(),status:"invite",fromId:host,from:loadCharacters().find(c=>c.id===host)?.name,inviterIds:[host],participantIds:hosts.slice(0,6),occasion:`birthday-${year}`,replyBy:d.getTime()-20*MIN,premise:"熟悉的人准备了一场生日庆祝，具体相处结合各自性格和近期经历展开，是否参加由她决定。"}];
  }
  return [];
}
export function normalizeBirthdayPlan(raw: unknown, year: number, now: number, candidates = birthdayCandidates()): BirthdayPlan {
  const v=raw&&typeof raw==="object"?raw as {friends?:unknown[];celebrations?:Record<string,unknown>[]} : {};
  const selected=[...new Set((Array.isArray(v.friends)?v.friends:[]).filter((id):id is string=>typeof id==="string"&&candidates.friends.includes(id)))];
  const minimum=Math.min(3,candidates.friends.length);
  for(const id of candidates.friends)if(selected.length<minimum&&!selected.includes(id))selected.push(id);
  if(!selected.length)selected.push(...candidates.friends.slice(0,6));
  const available=[...candidates.family,...selected], parties:CareerNode[]=[], used=new Set<string>();
  for(const x of (Array.isArray(v.celebrations)?v.celebrations:[]).filter(x=>x&&typeof x==="object").slice(0,2)) {
    const hostIds=[...new Set((Array.isArray(x.hostIds)?x.hostIds:[]).filter((id):id is string=>typeof id==="string"&&available.includes(id)&&canHost(id)&&!used.has(id)))].slice(0,Math.max(0,2-used.size));
    const at=typeof x.at==="string"?new Date(x.at.replace(" ","T")).getTime():NaN, place=typeof x.place==="string"?x.place.trim().slice(0,100):"";
    if(!hostIds.length||!Number.isFinite(at)||at<now+2*HOUR||at>now+48*HOUR||!place||!freeAt(at,parties))continue;
    hostIds.forEach(id=>used.add(id));
    parties.push({id:`birthday_${year}_party_${parties.length}`,kind:"date",title:typeof x.title==="string"?x.title.slice(0,50):"生日庆祝",place,dueAt:at,status:"invite",fromId:hostIds[0],from:loadCharacters().find(c=>c.id===hostIds[0])?.name,inviterIds:hostIds,participantIds:(Array.isArray(x.participantIds)?x.participantIds:available).filter((id):id is string=>typeof id==="string"&&available.includes(id)),occasion:`birthday-${year}`,replyBy:at-20*MIN,premise:typeof x.premise==="string"?x.premise.slice(0,1000):"熟悉的人准备生日庆祝，结合各自性格和近期剧情展开。"});
  }
  if(!parties.length)parties.push(...fallbackParty(year,now,[...selected,...candidates.family]));
  return {year,date:`${year}-${loadTraineeCard()?.birthday.slice(5) || "01-01"}`,family:candidates.family,friends:selected,parties};
}
function schedule(plan: BirthdayPlan): void {
  const hosts=[...new Set(plan.parties.flatMap(n=>n.inviterIds||[]))];
  const people=[...new Set([...hosts,...plan.family,...plan.friends])];
  people.forEach((id,i)=>{
    const party=plan.parties.find(n=>n.inviterIds?.includes(id));
    const family=plan.family.includes(id);
    const background=family?"你是她的家人，今天保证向她送上生日祝福；语气按你们的家庭关系，不要求她回家或回复。":"今天是她的生日，按你们的性格、实际关系和近期互动送上属于你自己的祝福。";
    const instruction=`${background}沿用当前KKT预设、记忆和语言规则，不读其他人的祝福，不统一大家的口吻。${party?`你${party.inviterIds!.length>1?"和另一位朋友共同":""}张罗了「${party.title}」：${new Date(party.dueAt).toLocaleString("zh-CN")}，${party.place}。${party.premise}先祝她生日快乐，再自然邀请她，问她愿不愿意。`:"庆祝已有统一安排，不另外擅自约一场，不替她做决定。"}`;
    queueMessage(id,instruction,(hosts.includes(id)?5+i*5:15+i*13)*MIN,{node:party,strictPersona:true,important:true,birthdayDate:plan.date,dedupeKey:`birthday:${plan.year}:${id}`});
  });
}
let planning=false;
export function birthdayTick(year:number, now:number, done:()=>void):void {
  const stored=load()[String(year)];if(stored){schedule(stored);done();return;}
  if(planning)return;
  planning=true;
  const snapshot=kvGet("idol_trainee_card_v1"), saveId=typeof window!=="undefined"?window.localStorage.getItem("idol_current_save_id"):null, candidates=birthdayCandidates();
  const card=loadTraineeCard();
  void (async()=>{
    let raw:unknown={friends:candidates.friends.slice(0,6)};
    const slot=resolveBinding(loadBindingConfig(),undefined,"chat"),config=loadApiConfigs().find(c=>c.id===slot.apiConfigId)||loadApiConfigs()[0];
    if(config&&candidates.friends.length+candidates.family.length) {
      const descriptions=[...candidates.family,...candidates.friends].map(id=>{
        const char=loadCharacters().find(c=>c.id===id),session=loadChatSessions().find(s=>!s.isGroup&&s.contactId===id);
        return `编号${id} ${char?.name}\n${composePersona(getProfile(id))}\n最近聊天：${session?loadChatMessages(session.id).filter(m=>m.role==="user"||m.role==="assistant").slice(-4).map(m=>m.content.slice(0,200)).join("；"):"暂无"}`;
      }).join("\n\n");
      try {
        const response=await simpleLLMCall(config,[{role:"system",content:'规划她的生日，只输出JSON：{"friends":["角色编号"],"celebrations":[{"hostIds":["1至2个发起人编号"],"participantIds":["参与者编号"],"title":"庆祝标题","at":"YYYY-MM-DD HH:mm","place":"具体地点","premise":"结合人设和当前剧情的庆祝安排"}]}。不生成任何人的祝福台词，不把私人聊天或未公开秘密写成其他人已经知道的事实，不替她决定参加或反应。家人独立祝福不占朋友名额；朋友有足够人时至少3位、通常5至6位，按实际关系与近期互动选，不能造人。庆祝最多两场、合计最多两位发起人，也可以两人共同张罗同一场；必须是真正可进入的庆祝场景，不固定餐厅或七点。时间在现在两小时后至两天内，避开已定日程，结合身份、关系、住处、年龄与近期剧情；海外家人不突然到首尔。没有在身边的合适人时celebrations可以为空。'},{role:"user",content:`现在${new Date(now).toLocaleString("sv-SE")}\n${card?describeTrainee(card):""}\n公司：${companyOf(loadCareer().companyId)?.name||"还没进公司"}\n家人编号：${candidates.family.join("、")}\n朋友候选：${candidates.friends.join("、")}\n已定日程：${loadCareer().nodes.filter(n=>n.status==="pending").map(n=>`${n.title} ${new Date(n.dueAt).toLocaleString("sv-SE")}`).join("；")}\n可用地点：${allScenePlaces().filter(p=>!placeLocked(p)).map(p=>p.key).join("、")}\n人物：\n${descriptions}`}],{temperature:0.85,label:"生日安排"});
        raw=JSON.parse(response.content?.match(/\{[\s\S]*\}/)?.[0]||"{}");
      }catch{/* 本地安排兜底，祝福仍逐人走原KKT，不退回通用口吻。 */}
    }
    if(kvGet("idol_trainee_card_v1")!==snapshot||(typeof window!=="undefined"&&window.localStorage.getItem("idol_current_save_id")!==saveId))return;
    const plan=normalizeBirthdayPlan(raw,year,now,candidates);kvSet(KEY,JSON.stringify({...load(),[year]:plan}));schedule(plan);done();
  })().finally(()=>{planning=false;});
}
