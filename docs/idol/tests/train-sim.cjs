// node docs/idol/tests/train-sim.cjs
// 一年养成数值模拟器：同一套纯函数真实跑 48 周 × 500 种子，输出平衡报告。不联网、不碰存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '../../../lib');
function loadModule() {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'idol-training.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require, console }, { filename: 'idol-training.ts' });
  return module.exports;
}
const T = loadModule();
function mulberry32(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 玩家基准：vocal 45 / dance 45 / rap 45，Dance 特长 → dance 55
function makePlayer(T) {
  return {
    id: 'player', name: '玩家', specialty: 'dance',
    stats: { vocal: 45, dance: 55, rap: 45, variety: 45, acting: 45, visual: 50 },
    progress: { vocal: 0, dance: 0, rap: 0, variety: 0, acting: 0, visual: 0 },
    attitude: 'extreme', practicePreference: 'none', initialClass: 'C', klass: 'C',
  };
}
const ROUTES = {
  'A 只上课': { weekly: 0, opps: [] },
  'B 每周加练1节': { weekly: 1, opps: [] },
  'C 每周加练2节': { weekly: 2, opps: [] },
  'D 每周加练3节': { weekly: 3, opps: [] },
  'E 每周加练5节': { weekly: 5, opps: [] },
  'F 3节+2次中机遇(+5)': { weekly: 3, opps: [5, 5] },
  'G 4节+4次大机遇(+10)': { weekly: 4, opps: [10, 10, 10, 10] },
  'H 5节+6次大机遇(+10)': { weekly: 5, opps: [10, 10, 10, 10, 10, 10] },
  'I 3节+4次大机遇(+10)': { weekly: 3, opps: [10, 10, 10, 10] },
};
const STRATEGIES = {
  '主练舞蹈': t => 'dance',
  '三项均衡': t => ['vocal', 'dance', 'rap'][t.week % 3],
  '补最弱': t => ['vocal', 'dance', 'rap'].sort((a, b) => t.p.stats[a] - t.p.stats[b])[0],
};
// 机遇分布：第 2/4/6/8/10/12 月（不同训练月份，不在年末叠加）
const OPP_MONTHS = [2, 4, 6, 8, 10, 12];
function oppSubject(strategyKey, t) {
  if (strategyKey === '主练舞蹈') return 'dance';
  if (strategyKey === '三项均衡') return ['vocal', 'dance', 'rap'][t.week % 3];
  return ['vocal', 'dance', 'rap'].sort((a, b) => t.p.stats[a] - t.p.stats[b])[0];
}
function simulate(T, route, strategyKey, pickSubject, tt, seed, attitudePool) {
  const rng = mulberry32(seed);
  const roster = T.generateRoster(rng, attitudePool);
  const player = makePlayer(T);
  const all = [player, ...roster];
  let oppIdx = 0;
  for (let week = 1; week <= 48; week++) {
    // NPC 自动成长
    for (const n of roster) T.settleWeek(n, tt, rng);
    // 玩家上课：课表每科全上（路线假设课全勤）
    for (const s of T.TRAINABLE_SUBJECTS) {
      for (let i = 0; i < (tt.weekly[s] || 0); i++) T.settleProgress(player, s, T.coursePoints(player, s));
    }
    // 玩家加练：每周 N 节，练策略科目
    for (let i = 0; i < route.weekly; i++) {
      const s = pickSubject({ week, p: player });
      T.settleProgress(player, s, T.coursePoints(player, s));
    }
    // 机遇：指定月份第一周直接加能力（不占加练、不超 100）
    const month = Math.floor((week - 1) / 4) + 1;
    while (oppIdx < route.opps.length && OPP_MONTHS[oppIdx] === month) {
      const s = oppSubject(strategyKey, { week, p: player });
      player.stats[s] = Math.min(100, player.stats[s] + route.opps[oppIdx]);
      oppIdx++;
    }
    // 每 4 周月考
    if (week % 4 === 0) {
      const scores = all.map(t => T.examScore(t, rng));
      T.applyMonthlyRank(all, scores);
    }
  }
  return { player, roster, all };
}
function runRoute(T, name, route, strategyKey, pickSubject, tt, seeds, attitudePool) {
  const res = { first: 0, runaway: 0, classA: 0, ranks: [], gaps: [], finals: [], npcTop: [], base: [] };
  for (let seed = 1; seed <= seeds; seed++) {
    const { player, roster } = simulate(T, route, strategyKey, pickSubject, tt, seed * 7919 + 13, attitudePool);
    const score = T.examBase(player);
    const npcScores = roster.map(n => T.examBase(n));
    const npcTop = Math.max(...npcScores);
    const finalRank = 1 + [...npcScores].sort((a, b) => b - a).filter(s => s > score).length;
    res.ranks.push(finalRank);
    res.gaps.push(npcTop - score);
    res.finals.push(score);
    res.npcTop.push(npcTop);
    res.base.push({ v: player.stats.vocal, d: player.stats.dance, r: player.stats.rap });
    if (finalRank === 1) res.first++;
    if (finalRank === 1 && score - [...npcScores].sort((a, b) => b - a)[0] > 8) res.runaway++;
    if (player.klass === 'A') res.classA++;
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const pct = n => (n / seeds * 100).toFixed(1) + '%';
  const b = res.base;
  return {
    name, strategy: strategyKey,
    final: `V${avg(b.map(x => x.v)).toFixed(1)} D${avg(b.map(x => x.d)).toFixed(1)} R${avg(b.map(x => x.r)).toFixed(1)}`,
    exam: avg(res.finals).toFixed(1),
    npcTop: avg(res.npcTop).toFixed(1),
    rankAvg: avg(res.ranks).toFixed(1),
    rankMid: res.ranks.sort((a, b) => a - b)[Math.floor(seeds / 2)],
    first: pct(res.first), runaway: pct(res.runaway), classA: pct(res.classA),
    gapToTop: avg(res.gaps).toFixed(1),
  };
}
const SEEDS = Number(process.argv[2] || 500);
for (const tt of [['方案课表(v4d3r2)', T.TIMETABLE_PLAN], ['现有课表(v3d3r2)', T.TIMETABLE_CURRENT]]) {
  console.log(`\n========== ${tt[0]} · 态度均匀分布(25%各) · ${SEEDS} 种子 ==========`);
  console.log('路线 | 策略 | 最终三项 | 综合分 | 最强NPC | 平均名次(中位) | 第一名 | 断层 | A班率 | 距第一分差');
  for (const [rn, route] of Object.entries(ROUTES)) {
    for (const [sk, pick] of Object.entries(STRATEGIES)) {
      const r = runRoute(T, rn, route, sk, pick, tt[1], SEEDS, T.ATTITUDE_POOL_UNIFORM);
      console.log(`${r.name} | ${r.strategy} | ${r.final} | ${r.exam} | ${r.npcTop} | ${r.rankAvg}(${r.rankMid}) | ${r.first} | ${r.runaway} | ${r.classA} | ${r.gapToTop}`);
    }
  }
}
for (const tt of [['方案课表(v4d3r2)', T.TIMETABLE_PLAN], ['现有课表(v3d3r2)', T.TIMETABLE_CURRENT]]) {
  console.log(`\n========== ${tt[0]} · 现实分布(自律10%/勤奋30%/普通45%/懈怠15%) · ${SEEDS} 种子 ==========`);
  console.log('路线 | 策略 | 最终三项 | 综合分 | 最强NPC | 平均名次(中位) | 第一名 | 断层 | A班率 | 距第一分差');
  for (const [rn, route] of Object.entries(ROUTES)) {
    for (const [sk, pick] of Object.entries(STRATEGIES)) {
      const r = runRoute(T, rn, route, sk, pick, tt[1], SEEDS, T.ATTITUDE_POOL_REALISTIC);
      console.log(`${r.name} | ${r.strategy} | ${r.final} | ${r.exam} | ${r.npcTop} | ${r.rankAvg}(${r.rankMid}) | ${r.first} | ${r.runaway} | ${r.classA} | ${r.gapToTop}`);
    }
  }
}
