const fs = require('fs'), vm = require('vm'), ts = require('typescript'), assert = require('node:assert/strict');
const now = new Date(2030, 4, 10, 10).getTime();
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
let career, messages, calendars, notices, hydrated, sessions, saved, bus;
const modules = {}, listeners = new Map();
const window = { addEventListener: (key, fn) => listeners.set(key, fn), dispatchEvent: e => { if (e.type === 'idol-invite-notice') notices.push(e.detail); listeners.get(e.type)?.(e); } };
class Event { constructor(type, data) { this.type = type; Object.assign(this, data); } }
const storage = new Map();
const mocks = {
  './kv-db': { kvGet: k => storage.get(k), kvSet: (k,v) => storage.set(k,v) },
  './character-storage': { loadCharacters: () => [{id:'a',name:'他'},{id:'b',name:'别人'}] },
  './chat-storage': {
    isChatStorageHydrated: () => hydrated, loadChatSessions: () => sessions, loadChatMessages: id => messages.filter(m => m.sessionId === id),
    loadChatContacts: () => [{characterId:'a'}], createOrGetSession: () => sessions[0],
    pushChatMessage: m => { const out = {...m,id:`new${messages.length}`,createdAt:new Clock().toISOString()}; messages.push(out); return out; },
    updateChatMessage: (id, patch) => { const i = messages.findIndex(m => m.id === id); if(i<0)return null; messages[i]={...messages[i],...patch}; return messages[i]; },
  },
  './idol-career': { CAREER_EVENT:'career', loadCareer:()=>career, saveCareer: c => {career=c;saved++;modules.bridge?.syncMeetingCards();}, addToCalendar:n=>{if(n.status==='pending')calendars.push(n.id);} },
  './idol-schedule-notices': { noticeTime:t=>new Clock(t).toISOString(), chatNotice:(s,id,a)=>({sessionId:s,refId:id,senderId:a,at:now}), recordScheduleReply:()=>{} },
  './idol-people': { getProfile:()=>({events:[]}), saveProfile:()=>{} },
  './idol-actionpoints': { apDayKey: t => new Clock(t).toDateString() },
  './idol-ap-live': { apLeft:()=>5 },
  './chat-plugin-hooks': { getChatPluginHookBus:()=>bus },
};
function moduleFrom(file, name) {
  const exports={}; modules[name]=exports;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports, require:n=>n==='./idol-meeting-invites'?modules.bridge:n==='./idol-invitation-chat'?modules.actions:mocks[n]||{}, Date:Clock,Math,JSON,Set,Map,console,window,Event,CustomEvent:Event,performance:{now:()=>100000}}, {filename:file});
  return exports;
}
const bridge = moduleFrom('lib/idol-meeting-invites.ts','bridge');
const actions = moduleFrom('lib/idol-invitation-chat.ts','actions');
const reminders = moduleFrom('lib/idol-reminders.ts','reminders');
function reset(){career={nodes:[],offers:[]};messages=[];calendars=[];notices=[];hydrated=true;sessions=[{id:'s',contactId:'a'}];saved=0;storage.clear();}
function card(extra={}) {const m={id:`c${messages.length}`,sessionId:'s',role:'assistant',status:'sent',createdAt:new Clock().toISOString(),mediaType:'meeting_invite',content:'吃饭',mediaData:{meetingInviteTitle:'吃饭',meetingInviteRaw:'时间=2030-05-12 19:00\n地点=江南·烤肉店',...extra.mediaData},...extra}; messages.push(m);return m;}
function node(extra={}) {return {id:'old',kind:'date',title:'吃饭',place:'江南·烤肉店',status:'invite',fromId:'a',dueAt:new Clock(2030,4,12,19).getTime(),...extra};}
let tests=0;
function test(name,fn){reset();fn();tests++;console.log('PASS',name);}
test('new card creates one pending invitation and one notice',()=>{const m=card();const n=bridge.restoreMeetingCard(m);assert.equal(n.status,'invite');assert.equal(career.nodes.length,1);assert.equal(notices.length,1);bridge.restoreMeetingCard(messages[0]);assert.equal(career.nodes.length,1);assert.equal(notices.length,1);assert.equal(calendars.length,0);});
test('old accepted card restored to plans and calendar, idempotent',()=>{card({mediaData:{meetingInviteStatus:'accepted',meetingInviteAt:'2030-05-12 19:00',meetingInvitePlace:'店'}});bridge.repairMeetingCards();bridge.repairMeetingCards();assert.equal(career.nodes.length,1);assert.equal(career.nodes[0].status,'pending');assert.equal(calendars.length,1);assert.equal(notices.length,1);});
test('missing dates, declined, expired, rejected, retracted, group, blacklisted do not create events',()=>{for(const extra of [{mediaData:{}},{mediaData:{meetingInviteStatus:'declined'}},{mediaData:{meetingInviteAt:'2020-05-12 19:00',meetingInvitePlace:'店'}},{status:'rejected'},{isRetracted:true}]){bridge.restoreMeetingCard(card(extra));}assert.equal(career.nodes.length,0);sessions[0].isGroup=true;bridge.restoreMeetingCard(card());sessions[0].isGroup=false;sessions[0].isBlacklisted=true;bridge.restoreMeetingCard(card());assert.equal(career.nodes.length,0);});
test('restore waits for hydration',()=>{card();hydrated=false;bridge.repairMeetingCards();assert.equal(career.nodes.length,0);hydrated=true;bridge.repairMeetingCards();assert.equal(career.nodes.length,1);});
test('conflicts with custom reminders shift date and reopen accepted card for confirmation',()=>{career.nodes=[node({id:'busy',kind:'custom',status:'pending',fromId:undefined})];const m=card({mediaData:{meetingInviteStatus:'accepted',meetingInviteAt:'2030-05-12 19:00',meetingInvitePlace:'店'}});const n=bridge.restoreMeetingCard(m);assert.equal(new Clock(n.dueAt).getDate(),13);assert.equal(n.status,'invite');assert.equal(messages[0].mediaData.meetingInviteStatus,'pending');assert.match(messages[0].mediaData.meetingInviteDescription,/顺延/);assert.equal(career.nodes[0].dueAt,new Clock(2030,4,12,19).getTime());});
test('full window has no fallback to conflicting time',()=>{for(let i=0;i<15;i++)career.nodes.push(node({id:`busy${i}`,fromId:'b',dueAt:new Clock(2030,4,12+i,19).getTime()}));assert.equal(bridge.restoreMeetingCard(card()),undefined);assert.equal(career.nodes.length,15);});
test('relative dates use original message time and strict dates reject invalid inputs',()=>{assert.equal(bridge.invitationAt('明晚七点',new Clock(2030,4,10).getTime()),new Clock(2030,4,11,19).getTime());assert.equal(bridge.invitationAt('5月12日晚上七点',now),new Clock(2030,4,12,19).getTime());assert.equal(bridge.invitationAt('2030-02-30 19:00',now),null);assert.equal(bridge.invitationAt('2030-05-12 25:00',now),null);});
test('same exact invitation links existing record; other actor remains separate',()=>{career.nodes=[node()];bridge.restoreMeetingCard(card());assert.equal(career.nodes.length,1);assert.equal(messages[0].mediaData.meetingInviteNodeId,'old');});
test('same reply batch marker and card share one record even if display title differs',()=>{messages.push({id:'text',sessionId:'s',responseBatchId:'batch'});career.nodes=[node({notice:{sessionId:'s',refId:'text'}})];bridge.restoreMeetingCard(card({responseBatchId:'batch',mediaData:{meetingInviteTitle:'你来吗'}}));assert.equal(career.nodes.length,1);assert.equal(messages[1].mediaData.meetingInviteNodeId,'old');});
test('deleted linked invitation is not resurrected',()=>{const m=card();bridge.restoreMeetingCard(m);career.nodes=[];bridge.repairMeetingCards();assert.equal(career.nodes.length,0);});
test('reminder status and reschedule propagate to card and custom HTML fields',()=>{bridge.restoreMeetingCard(card());const n=career.nodes[0];n.status='pending';bridge.syncMeetingCards();assert.equal(messages[0].mediaData.meetingInviteStatus,'accepted');n.status='invite';n.dueAt+=864e5;bridge.syncMeetingCards();assert.match(messages[0].mediaData.meetingInviteRaw,/时间=2030-05-13/);assert.equal(messages[0].mediaData.meetingInviteStatus,'pending');n.status='declined';bridge.syncMeetingCards();assert.equal(messages[0].mediaData.meetingInviteStatus,'declined');});
test('marker-only invite now creates a linked card and avoids existing reminders',()=>{career.nodes=[node({id:'busy',fromId:'b'})];const m={id:'text',sessionId:'s',role:'assistant',status:'sent',content:'一起吃饭',createdAt:new Clock().toISOString()};messages.push(m);actions.applyInvitationActions(m,[{kind:'new',value:{title:'新约',at:'2030-05-12 19:00',place:'店'}}],{notify:()=>{},accept:()=>{},decline:()=>{}});assert.equal(career.nodes.length,2);assert.equal(new Clock(career.nodes[1].dueAt).getDate(),13);assert.equal(messages.filter(m=>m.mediaType==='meeting_invite').length,1);});
test('a model card in the same raw reply does not get a synthetic duplicate',()=>{const m={id:'t',sessionId:'s',role:'assistant',status:'sent',content:'邀请',rawResponseText:'[邀请见面]标题=约[/邀请见面]',responseBatchId:'r'};messages.push(m);const n=node({notice:{sessionId:'s',refId:'t'}});career.nodes=[n];bridge.ensureMeetingCard(n,m);assert.equal(messages.length,1);bridge.restoreMeetingCard(card({responseBatchId:'r'}));assert.equal(career.nodes.length,1);assert.equal(messages.length,2);});
test('acceptance updates reminders, calendar, and card together',()=>{const n=bridge.restoreMeetingCard(card());const accepted=reminders.acceptInvite(n.id);assert.equal(accepted.status,'pending');assert.equal(messages[0].mediaData.meetingInviteStatus,'accepted');assert.equal(calendars.length,1);assert.equal(reminders.acceptInvite(n.id),undefined);assert.equal(calendars.length,1);});
test('declining from reminders updates the same card without a new event',()=>{const n=bridge.restoreMeetingCard(card());reminders.declineInvite(n.id);assert.equal(career.nodes[0].status,'declined');assert.equal(messages[0].mediaData.meetingInviteStatus,'declined');bridge.repairMeetingCards();assert.equal(career.nodes.length,1);});
test('a conflict added before acceptance requires confirmation again',()=>{const n=bridge.restoreMeetingCard(card());career.nodes.push(node({id:'later',fromId:'b'}));assert.equal(reminders.acceptInvite(n.id),undefined);const moved=career.nodes.find(x=>x.id===n.id);assert.equal(moved.status,'invite');assert.equal(new Clock(moved.dueAt).getDate(),13);assert.equal(calendars.length,0);assert.equal(messages[0].mediaData.meetingInviteStatus,'pending');assert.equal(reminders.acceptInvite(n.id).status,'pending');assert.equal(calendars.length,1);});
test('legacy natural description can recover an explicit location and relative date',()=>{const m=card({mediaData:{meetingInviteDescription:'后天晚上七点来公司楼下咖啡馆见面'}});const n=bridge.restoreMeetingCard(m);assert.equal(n.place,'公司楼下咖啡馆');assert.equal(n.dueAt,new Clock(2030,4,12,19).getTime());});
test('vague location and old expired relative dates never become invented future meetings',()=>{bridge.restoreMeetingCard(card({mediaData:{meetingInviteDescription:'明天晚上七点到时候我们见面'}}));bridge.restoreMeetingCard(card({createdAt:'2020-05-10T10:00:00',mediaData:{meetingInviteDescription:'明天晚上七点来公司楼下咖啡馆见面'}}));assert.equal(career.nodes.length,0);});
test('legacy raw schedule marker repairs a card without explicit media fields',()=>{const m=card({mediaData:{meetingInviteTitle:'见面'},rawResponseText:'[新增邀约:{"title":"见面","at":"2030-05-12 19:00","place":"店"}]'});assert.equal(bridge.restoreMeetingCard(m).place,'店');});
test('sync is stable and preserves original card facts',()=>{bridge.restoreMeetingCard(card());const once=JSON.stringify(messages[0]);bridge.syncMeetingCards();bridge.syncMeetingCards();assert.equal(JSON.stringify(messages[0]),once);assert.match(messages[0].mediaData.meetingInviteOriginalRaw,/时间=2030-05-12/);});
console.log(`${tests} invitation bridge checks passed`);
