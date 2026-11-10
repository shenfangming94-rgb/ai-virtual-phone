const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const e={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/idol-romance-lines.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:e,require:()=>({}),Date,Set});
const day=864e5, now=Date.now();let l=e.newLine('idol','c',now-10*day);
for(let i=0;i<1000;i++){l=e.addMeet(l,now-2*day);l=e.addMeet(l,now-day)}assert.equal(l.bond,10);
l={...l,history:[]};assert.equal(e.addMeet(l,now-day).bond,10);
assert.equal(e.addMeet(l,now-11*day).bond,10);assert.equal(e.addMeet(l,now+day).bond,10);
let old={...e.newLine('idol','c',now-10*day),bond:9000,history:[{at:now-day,type:'meet',d:5}]};assert.equal(e.addMeet(old,now-day).bond,9000);
console.log('PASS: 1000 repeated two-day scans add only 10; ledger survives truncated history; pre-follow/future ignored; old balance preserved');

const stage=fs.readFileSync("lib/idol-stage.ts","utf8");const heal=stage.slice(stage.indexOf("export async function healSceneEventGaps"),stage.indexOf("export async function writeSummaryFor"));assert.ok(!heal.includes("recordMeetAt"));
let normal=e.newLine("idol","normal",now-day);normal=e.addMeet(normal,now);normal=e.addKkt(normal,now);normal=e.addKkt(normal,now);normal=e.addKkt(normal,now);normal=e.addCall(normal,now);normal=e.addCall(normal,now);assert.equal(normal.bond,10);console.log("PASS: background healing never awards bond; meet 5 + KKT daily 2 + call daily 3 unchanged");
