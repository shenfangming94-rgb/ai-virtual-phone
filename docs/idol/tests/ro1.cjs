// node docs/idol/tests/ro1.cjs
// 名册(idol-roster)+ 行动点(idol-actionpoints)纯函数测试:不联网、不碰存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '../../../lib');
function loadModule(file, shim = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  const req = (id) => (shim[id] ? shim[id] : require(id));
  vm.runInNewContext(code, { module, exports: module.exports, require: req, console }, { filename: file });
  return module.exports;
}
function mulberry32(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const T = loadModule('idol-training.ts');
const R = loadModule('idol-roster.ts', { './idol-training': T });
const AP = loadModule('idol-actionpoints.ts');

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? '✅ ' : '❌ ') + name + (cond ? '' : '  ← ' + extra)); if (!cond) fails++; };

// ── 名册生成 ──
const rng = mulberry32(20261106);
const state = R.generateRosterState(['dance', 'compose'], rng, new Date('2026-07-01T09:00:00Z').getTime());

check('39 名同期', state.npcs.length === 39, `实际 ${state.npcs.length}`);
const dist = ['A', 'B', 'C', 'D'].map(k => state.npcs.filter(n => n.klass === k).length);
check('班级分布 A10 B10 C9 D10', dist.join(',') === '10,10,9,10', dist.join(','));
check('玩家开局 C 班', state.player.klass === 'C');
check('玩家特长 dance、数值 55', state.player.specialty === 'dance' && state.player.stats.dance === 55, JSON.stringify(state.player.stats));
const spDist = ['vocal', 'dance', 'rap', 'none'].map(s => state.npcs.filter(n => n.specialty === s).length);
check('特长池 vocal10/dance10/rap9/none10', spDist.join(',') === '10,10,9,10', spDist.join(','));
check('生日全是合法 MM-DD 且不重复', state.npcs.every(n => /^\d{2}-\d{2}$/.test(n.birthday)) && new Set(state.npcs.map(n => n.birthday)).size === 39);
check('态度只有四种', state.npcs.every(n => ['extreme', 'diligent', 'normal', 'lazy'].includes(n.attitude)));
check('宿舍都分配了且 2~3 人一间', state.npcs.every(n => /^\d{3}$/.test(n.dorm)) && [...new Set(state.npcs.map(n => n.dorm))].every(d => { const c = state.npcs.filter(n => n.dorm === d).length; return c >= 2 && c <= 3; }));
check('朋友圈写双边', state.npcs.every(n => n.friends.every(f => state.npcs.find(x => x.id === f.charId)?.friends.some(g => g.charId === n.id))));
check('不是所有人都有朋友圈(有独行侠)', state.npcs.some(n => n.friends.length === 0));
check('初始数值在合理范围(三科 25~75)', state.npcs.every(n => ['vocal', 'dance', 'rap'].every(s => n.stats[s] >= 25 && n.stats[s] <= 75)));

// ── 周结算 ──
const total3 = n => n.stats.vocal + n.stats.dance + n.stats.rap;
const before = state.npcs.reduce((a, n) => a + total3(n), 0);
R.settleNpcWeeks(state, 4, mulberry32(777));
const after = state.npcs.reduce((a, n) => a + total3(n), 0);
check('补算 4 周后 NPC 整体有成长', after > before, `before=${before} after=${after}`);
const single = JSON.parse(JSON.stringify(state.npcs[0]));
R.settleNpcWeeks(state, 1, mulberry32(1));
check('结算不破坏结构(每人都有进度)', state.npcs.every(n => n.progress && ['vocal', 'dance', 'rap'].every(s => n.progress[s] >= 0)));

// ── 上课结算（settleProgress 要把涨的数和升级报出来，上课管线靠它打数字） ──
const pupil = JSON.parse(JSON.stringify(state.player));
pupil.progress.vocal = 4.5; // 还差 0.5 进度升 1 点（0-59 段 5 进度升 1）
const r1 = T.settleProgress(pupil, 'vocal', 1);
check('结算返回涨了多少', r1.gained === 1);
check('差 0.5 升 1 点时能升出来', r1.levels.length === 1 && r1.levels[0].from === 45 && r1.levels[0].to === 46, JSON.stringify(r1));
check('升完剩 0.5 进度(带着走)', Math.abs(pupil.progress.vocal - 0.5) < 1e-9, String(pupil.progress.vocal));
const r2 = T.settleProgress(pupil, 'vocal', 10);
check('10 点进度 = 升 2 点(5+5)', r2.levels.length === 2 && pupil.stats.vocal === 48, JSON.stringify(r2.levels));
check('特长课 ×1.5、别的课 ×1', T.coursePoints(pupil, 'dance') === 1.5 && T.coursePoints(pupil, 'vocal') === 1);

// ── 行动点 ──
const now = new Date(2026, 6, 1, 10, 30).getTime(); // 本地时间 10:30
let ap = AP.emptyAp(now);
check('新的一天 8 点', AP.apRemaining(ap, now) === 8);
check('10:30 落在 10-12 格', AP.apSlotOf(now) === 1, String(AP.apSlotOf(now)));
ap = AP.apConsume(ap, now, [1], '声乐课');
check('上一节课扣 1 点', AP.apRemaining(ap, now) === 7);
ap = AP.apConsume(ap, now, [1], '声乐课(重复占)');
check('同一格重复不重复扣', AP.apRemaining(ap, now) === 7);
check('凌晨 1 点不在行动点范围(夜里不占点)', AP.apSlotOf(new Date(2026, 6, 2, 1, 0).getTime()) === null);
const nextDay = new Date(2026, 6, 2, 9, 0).getTime();
ap = AP.apResetIfNewDay(ap, nextDay);
check('跨天重置回 8 点', AP.apRemaining(ap, nextDay) === 8);
check('约会 5 小时占 3 格', JSON.stringify(AP.apDateSlots(new Date(2026, 6, 2, 15, 0).getTime(), 5)) === JSON.stringify([3, 4, 5]));
check('约会 2 小时只占 1 格', AP.apDateSlots(new Date(2026, 6, 2, 15, 0).getTime(), 2).length === 1);
check('约会哪怕 10 分钟也至少 1 点', AP.apDateSlots(new Date(2026, 6, 2, 15, 0).getTime(), 0.2).length === 1);

console.log(fails === 0 ? '\n全绿 ✅' : `\n${fails} 项没过 ❌`);
process.exit(fails ? 1 : 0);
