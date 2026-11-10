const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
let career, outbox, messages, backups, deleted;
const run = () => {
  const exports = {};
  const source = fs.readFileSync('lib/idol-reminders.ts', 'utf8') + '\nexport { repairLegacyInvitations };';
  const storage = new Map();
  const mocks = {
    './idol-career': { loadCareer: () => career, CAREER_EVENT: 'career' },
    './chat-storage': { loadChatMessages: () => messages, deleteChatMessage: id => deleted.push(id) },
    './kv-db': { kvGet: k => k === 'idol_reminders_v1' ? JSON.stringify({ outbox }) : storage.get(k), kvSet: (k,v) => { storage.set(k,v); if(k === 'idol_career_v1') career=JSON.parse(v); if(k.startsWith('idol_legacy_invite_backup:')) backups.push(JSON.parse(v)); } },
  };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require: name=>mocks[name]||{},Date,Math,Set,Map,console,window:{dispatchEvent(){}},Event:class{}});
  exports.repairLegacyInvitations();
  return storage;
};
const base = { id:'a',fromId:'friend',title:'吃饭',status:'invite',dueAt:Date.now()+86400000,notice:{sessionId:'s',refId:'m'} };
for(const status of ['invite','pending','done']) {
 career={nodes:[{...base,status}]};outbox=[];messages=[{id:'m',role:'assistant',content:'安排通知\n「吃饭」；请回复是否参加'}];backups=[];deleted=[];
 run();
 assert.equal(deleted.length,status==='invite'?1:0);
 assert.equal(backups.length,deleted.length);
 assert.equal(Boolean(career.nodes[0].notice),status!=='invite');
}
career={nodes:[base]};outbox=[];messages=[{id:'m',role:'assistant',content:'明天一起吃饭吗？'}];backups=[];deleted=[];run();assert.equal(deleted.length,0);
console.log('PASS: legacy invite backed up and cleared; accepted/completed and natural messages preserved');
