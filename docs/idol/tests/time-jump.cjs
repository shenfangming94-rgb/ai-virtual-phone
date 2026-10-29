// node docs/idol/tests/time-jump.cjs
// 运行真实模块，时钟/世界/存储均为内存替身；不联网、不使用用户存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '../../../lib');
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
let now = new Date(2026, 9, 29, 9).getTime(), clock = { real: false }, activeId;
let career, planned, annual, destiny, jumps, modeChanges, calls, kv;
const modules = {};
class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const mocks = {
  './kv-db': { kvGet: k => kv.get(k) || null, kvSet: (k,v) => kv.set(k,v) },
  './world-clock': { setWorldTime: t => { now=t; jumps.push(t); clock.real=false; }, loadWorldClock: () => clock, realNow: () => new Date(2030,0,1).getTime(), setWorldClockReal: real => { clock.real=real; modeChanges.push(real); } },
  './idol-career': { loadCareer: () => career, saveCareer: c => career=c, companyOf: () => ({name:'测试公司'}) },
  './idol-events': { plannedStops: () => planned, fameNow: () => 0 },
  './idol-yearly': { yearlyStops: () => annual },
  './idol-destiny': { destinyStops: () => destiny },
  './api-helpers': { simpleLLMCall: () => { calls++; throw Error('快进不应调用模型'); } },
  './trainee-card': { loadTraineeCard: () => ({name:'测试用户', birthday:'2000-10-29'}), describeTrainee: () => '' },
  './idol-ledger': { recordAbsent: () => {} },
  './idol-people': {}, './idol-family-data': {familyContext:()=>''},
  './idol-calendar': { findLunar: (y,m) => m==='正月' ? `${y}-02-17` : `${y}-09-25`, nthWeekday: y => `${y}-12-19` },
};
function load(name, real = false) {
  if (!real && mocks[name]) return mocks[name];
  if (modules[name]) return modules[name].exports;
  if (!['./idol-reminders','./idol-time-jump','./idol-yearly','./idol-scenes'].includes(name)) return {};
  const module = {exports:{}};modules[name]=module;
  const code = ts.transpileModule(fs.readFileSync(path.join(root,name.slice(2)+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:load,console,Date:FakeDate,window:{dispatchEvent:()=>{}},Event:class{},CustomEvent:class{},document:{querySelector:()=>activeId?{getAttribute:()=>activeId}:null}},{filename:name});
  return module.exports;
}
function reset() { now=new Date(2026,9,29,9).getTime();career={stage:'trainee',nodes:[],offers:[],facts:[]};planned=[];annual=[];destiny=[];jumps=[];modeChanges=[];calls=0;kv=new Map();clock={real:false};activeId=undefined; }
function node(delta, patch={}) { return {id:'exam',kind:'monthly',status:'pending',title:'月考',dueAt:now+delta,...patch}; }
reset(); const reminder=load('./idol-reminders');
career.nodes=[node(HOUR)];assert(reminder.jumpWorld(now+7*DAY).includes('月考'));assert.equal(jumps[0],new Date(2026,9,29,9,30).getTime());
// 提醒后可继续走到开始时间，但不能第三次快进跨过尚未处理的考试。
reminder.jumpWorld(now+7*DAY);assert.equal(new Date(now).getHours(),10);const dueNow=now;reminder.jumpWorld(now+7*DAY);assert.equal(now,dueNow);
career.nodes[0].status='done';assert.equal(reminder.jumpWorld(now+DAY),'');assert.equal(now,dueNow+DAY);
reset();career.nodes=[node(15*MIN)];reminder.jumpWorld(now+DAY);assert.equal(new Date(now).getMinutes(),15,'不足半小时也截停');
reset();career.nodes=[node(15*MIN)];const before=now;assert.equal(reminder.jumpWorld(now+5*MIN),'');assert.equal(now,before+5*MIN,'临近前仍可小幅推进');
reset();career.nodes=[node(DAY,{status:'invite',replyBy:now+HOUR})];const begin=now;reminder.jumpWorld(now+7*DAY);assert.equal(now,begin+30*MIN,'按回复截止，而非活动开始前七天');reminder.jumpWorld(now+7*DAY);assert.equal(now,begin+59*MIN);reminder.jumpWorld(now+7*DAY);assert.equal(now,begin+59*MIN,'截止前停住，不反复递增一分钟');
career.nodes[0].status='declined';assert.equal(reminder.jumpWorld(now+DAY),'');
reset();career.nodes=[node(DAY,{status:'invite',replyBy:now-MIN})];assert.equal(reminder.jumpWorld(now+HOUR),'','已过期不无限拦截');
reset();career.nodes=[node(HOUR,{status:'leave'})];assert.equal(reminder.jumpWorld(now+DAY),'');
reset();career.nodes=[node(HOUR,{kind:'practice'})];assert(reminder.jumpWorld(now+DAY),'保留原有已安排日程的截停范围');
for(const kind of ['practice','custom']){reset();career.nodes=[node(-HOUR,{kind})];assert.equal(reminder.jumpWorld(now+DAY),'','过时自选条目不永久锁住时钟');}
for(const key of ['planned','annual','destiny']) {reset();const stop={at:now+10*MIN,title:key};if(key==='planned')planned=[stop];if(key==='annual')annual=[stop];if(key==='destiny')destiny=[stop];reminder.jumpWorld(now+DAY);assert.equal(now,stop.at);}
reset();planned=[{at:now-MIN,title:'到点未执行的邀请'}];const current=now;reminder.jumpWorld(now+DAY);assert.equal(now,current,'到点尚未tick的事件不漏掉');
reset();career.offers=[{id:'offer',companyId:'jyp',status:'new',notified:false,at:now+5*MIN}];const offerAt=career.offers[0].at;reminder.jumpWorld(now+DAY);assert.equal(now,offerAt);
reset();career.nodes=[node(HOUR)];const back=now-DAY;assert.equal(reminder.jumpWorld(back),'');assert.equal(now,back,'回拨不重演或撤销剧情');const old=now;assert(reminder.jumpWorld(NaN));assert.equal(now,old);
reset();career.nodes=[node(-3*HOUR)];const oldNow=now;assert(reminder.jumpWorld(now+DAY));assert.equal(now,oldNow,'未结算的日程不再跨过去');
reset();career.nodes=[node(-3*HOUR)];activeId='exam';reminder.reminderTick(()=>{});assert.equal(career.nodes[0].status,'pending','正在演的日程不误算缺席');const startScene=now;reminder.jumpWorld(now+HOUR);assert.equal(now,startScene+HOUR);career.nodes.push(node(15*MIN,{id:'other',title:'别的约见'}));reminder.jumpWorld(now+HOUR,{activeNodeId:'exam'});assert.equal(career.nodes[1].dueAt,now,'仍拦截其他日程');
reset();career.nodes=[node(-3*HOUR)];reminder.reminderTick(()=>{});assert.equal(career.nodes[0].status,'absent','没有在演的过期日程仍按原机制结算');
reset();career.nodes=[node(HOUR)];assert(reminder.sceneTimeBoundaryHint().includes('30分钟'));assert.equal(calls,0);
reset();career.nodes=[node(HOUR)];const realStop=now+30*MIN;assert(reminder.switchWorldClockMode(true).includes('月考'));assert.equal(now,realStop);assert.equal(clock.real,false);assert.equal(modeChanges.length,0,'现实时间开关不能绕过');
reset();assert.equal(reminder.switchWorldClockMode(true),'');assert.equal(clock.real,true);
reset();const yearly=load('./idol-yearly',true);let stops=yearly.yearlyStops();assert(stops.some(s=>s.title==='你的生日'&&s.at===now),'当天已经过八点但未执行的生日仍截停');kv.set('idol_yearly_v1',JSON.stringify({done:['bday-2026']}));stops=yearly.yearlyStops();assert(!stops.some(s=>s.title==='你的生日'&&s.at===now),'已处理的生日不重复截停');
reset();career.nodes=[node(HOUR)];assert(load('./idol-scenes').runTimeCommand('$过一周').includes('月考'));assert.equal(new Date(now).getMinutes(),30,'文字指令沿用截停');
reset();career.nodes=[node(-HOUR)];const prompt=reminder.sceneTimeBoundaryHint();assert(prompt.includes('0分钟'),'生成前限制正文与时间标记，不写到已到期日程之后');
// 所有用户入口使用统一入口；仅开局起点和底层时钟保留直接校时接口。
for (const file of ['components/clock-app.tsx','components/settings/world-time-settings.tsx','components/scene/scene-app.tsx','components/vn/vn-player.tsx','components/story/story-app-base.tsx','lib/idol-world.ts','lib/idol-scenes.ts']) {
 const source=fs.readFileSync(path.resolve(root,'..',file),'utf8');assert(!/\b(?:shiftWorldTime|setWorldTime|setWorldClockReal)\s*\(/.test(source),file+'存在绕过入口');
}
assert.equal(calls,0);console.log(JSON.stringify({ok:true,realApiCalls:0,nearDueProtected:true,replyDeadlineProtected:true,noMinuteLoop:true,allJumpEntrancesUnified:true,activeSceneProtected:true,realClockSwitchProtected:true,unprocessedAnnualEventProtected:true},null,2));
