// node docs/idol/tests/rm1.cjs
// 情缘系统纯函数测试：羁绊值、日上限、门槛、节点推进。不联网、不碰存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '../../../lib');
function loadModule(file) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require, console }, { filename: file });
  return module.exports;
}
const R = loadModule('idol-romance-lines.ts');

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? '✅ ' : '❌ ') + name + (cond ? '' : '  ← ' + extra)); if (!cond) fails++; };

const t0 = new Date(2026, 6, 1, 12, 0, 0).getTime();

// 六线节点数:4/4/5/4/4/4 = 25
const counts = Object.values(R.ROUTE_NODES).map(ns => ns.length);
check('25 个恋爱前固定节点(4/4/5/4/4/4)', counts.join(',') === '4,4,5,4,4,4', counts.join(','));

// 门槛表
check('四节点线门槛 12/28/48/72', JSON.stringify(R.LINE_THRESHOLDS.idol) === '[12,28,48,72]');
check('电竞线门槛 12/25/40/58/78', JSON.stringify(R.LINE_THRESHOLDS.esports) === '[12,25,40,58,78]');

// 关注起算
let l = R.newLine('idol', 'char_x', t0);
check('关注时羁绊 0', l.bond === 0);
check('第一节点 = 演唱会邀请', l.nextNode === 'concert_invite');

// 见面 +5（她定的：同一世界日只见一次算一次）
l = R.addMeet(l, t0);
l = R.addMeet(l, t0 + 60e3); // 同一天第二次见面：只算一次
check('同一天两次见面只算一次(+5)', l.bond === 5, String(l.bond));
const nextDay = new Date(2026, 6, 2, 9, 0, 0).getTime();
l = R.addMeet(l, nextDay); // 第二天再见：再 +5
check('第二天见面再计一次(+5)', l.bond === 10, String(l.bond));

// 电话日上限
l = R.addCall(l, t0); l = R.addCall(l, t0 + 60e3); l = R.addCall(l, t0 + 120e3);
check('电话每天只计一次(+3)', l.bond === 13, String(l.bond));
l = R.addCall(l, nextDay);
check('第二天电话再计一次(+3)', l.bond === 16, String(l.bond));

// KKT 日上限
l = R.addKkt(l, nextDay); l = R.addKkt(l, nextDay + 1e3); l = R.addKkt(l, nextDay + 2e3);
check('KKT 每天上限 +2', l.bond === 18, String(l.bond));

// 门槛与推进
check('羁绊 18 ≥ 12:节点待触发', R.nodeReady(l));
l = R.advanceNode(l);
check('推进后下一节点 = 练习室指导', l.nextNode === 'practice_guide');
check('门槛变成 28', R.nextThreshold(l) === 28);
check('18 < 28:第二个节点还没到', !R.nodeReady(l));

// 走到最后:四节点线 72
let l2 = R.newLine('idol', 'c', t0);
for (let i = 0; i < 20; i++) l2 = R.addMeet(l2, t0 + i * 864e5); // 20 次见面 = 100 羁绊
check('20 次见面 100 羁绊', l2.bond === 100, String(l2.bond));
for (let i = 0; i < 4; i++) l2 = R.advanceNode(l2);
check('四节点全走完', l2.doneNodes.length === 4 && l2.nextNode === '', JSON.stringify(l2.doneNodes));
check('走完没有下一门槛', R.nextThreshold(l2) === null);

// 电竞线五个节点
let l3 = R.newLine('esports', 'c', t0);
for (let i = 0; i < 20; i++) l3 = R.addMeet(l3, t0 + i * 864e5);
let seq = [];
while (l3.nextNode) { seq.push(l3.nextNode); l3 = R.advanceNode(l3); }
check('电竞线五节点顺序(擦肩→电话→掉马→比赛→双排)', seq.join(',') === 'street_glance,late_night_call,mutual_reveal,match_invite,stream_duo', seq.join(','));

// 触发方式分布
const triggers = {};
for (const [type, nodes] of Object.entries(R.ROUTE_NODES)) for (const n of nodes) triggers[n.key] = n.trigger;
check('掉马是 encounter(世界事实给机会)', triggers.mutual_reveal === 'encounter');
check('私生骚扰是 event(事情砸过来)', triggers.sasaeng === 'event');
check('演唱会邀请是 invite(他约)', triggers.concert_invite === 'invite');
check('路演偶遇是 encounter', triggers.busking_meet === 'encounter');

console.log(fails === 0 ? '\n全绿 ✅' : `\n${fails} 项没过 ❌`);
process.exit(fails ? 1 : 0);
