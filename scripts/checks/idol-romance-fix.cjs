const fs = require('fs'), ts = require('typescript'), vm = require('vm'), a = require('assert/strict');
const now = Date.now();
const store = new Map([['idol_roster_v1', '1']]);
let career, calendar = 0;
const kvdb = {
  kvGet: k => (store.has(k) ? store.get(k) : null),
  kvSet: (k, v) => { store.set(k, v); },
  isKvHydrated: () => true,
};
function moduleFrom(file, name, extraMocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: n => (extraMocks[n] ?? {}), Date, Set, JSON, Math, console, Map, Object, String, Number, Array, Error }, { filename: file });
  return exports;
}
const storage = moduleFrom('lib/idol-romance-storage.ts', 'storage', {
  './kv-db': kvdb,
  './idol-romance-recovery': { recoverConfirmedRomanceIncident: () => null },
});
const lines = moduleFrom('lib/idol-romance-lines.ts', 'lines', {});
const live = moduleFrom('lib/idol-romance-live.ts', 'live', {
  './kv-db': kvdb,
  './idol-romance-storage': storage,
  './idol-romance-lines': lines,
  './idol-career': { loadCareer: () => career, saveCareer: c => { career = c; }, addToCalendar: () => { calendar++; } },
  './idol-people': { loadProfiles: () => ({}) },
  './character-storage': { loadCharacters: () => [{ id: 'a', name: '他' }] },
  './idol-roster-live': { settlePlayerExp: () => {} },
  './idol-mainline': { mainlineState: () => [] },
  './idol-kakao': { isKakaoFriend: () => false },
});
function setRoutes(linesState) { kvdb.kvSet('idol_romance_routes_v2', JSON.stringify({ lines: linesState })); }
function rline(extra = {}) {
  return { type: 'underground', charId: 'a', followedAt: now - 9 * 864e5, bond: 90,
    meetDays: [], doneNodes: ['bar_reunion', 'band_mates', 'song_for_her'], nextNode: 'scandal_talk',
    daily: { day: 'x', calls: 0, kkt: 0 }, history: [], ...extra };
}
function node(extra = {}) {
  return { id: 'n', kind: 'event', title: '绯闻曝光与公司谈话', place: '公司 会议室', premise: 'p', dueAt: now - 3600e3, status: 'pending',
    from: '他', fromId: 'a', occasion: 'romance', note: '情缘节点：scandal_talk', ...extra };
}
let tests = 0;
function test(name, fn) { try { fn(); tests++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message); process.exitCode = 1; } }

test('future-scheduled romance node is never completed by class settle or scene end', () => {
  career = { stage: 'trainee', nodes: [node({ dueAt: now + 2 * 864e5 })] };
  live.markPlayedBeatNodes([], false);
  live.markPlayedBeatNodes(['a'], true);
  a.equal(career.nodes[0].status, 'pending');
});
test('class settle completes only classBeat nodes due within 8h, never others', () => {
  career = { stage: 'trainee', nodes: [node({ id: 'cb', classBeat: true }), node({ id: 'ev' })] };
  live.markPlayedBeatNodes([], false);
  a.equal(career.nodes.find(n => n.id === 'cb').status, 'done');
  a.equal(career.nodes.find(n => n.id === 'ev').status, 'pending');
});
test('scene end completes only nodes whose character was present', () => {
  career = { stage: 'trainee', nodes: [node({ id: 'p' })] };
  live.markPlayedBeatNodes(['b'], true);
  a.equal(career.nodes[0].status, 'pending');
  live.markPlayedBeatNodes(['a'], true);
  a.equal(career.nodes[0].status, 'done');
});
test('revert goes through the rollback writer, pops the fake chapter, deletes its record', () => {
  setRoutes({ underground: rline({ doneNodes: ['bar_reunion', 'band_mates', 'song_for_her', 'scandal_talk'], nextNode: '' }) });
  career = { stage: 'trainee', nodes: [node({ status: 'done', doneAt: now - 864e5, dueAt: now + 864e5 }), node({ id: 'other', note: '情缘节点：band_mates', status: 'done', doneAt: now + 864e5, dueAt: now - 864e5 })] };
  a.equal(live.revertLastRomanceNode('underground'), '绯闻曝光与公司谈话');
  const s = storage.readRomanceRoutes();
  a.deepEqual(s.lines.underground.doneNodes, ['bar_reunion', 'band_mates', 'song_for_her']);
  a.equal(s.lines.underground.nextNode, 'scandal_talk');
  a.equal(career.nodes.length, 1);
  a.equal(career.nodes[0].id, 'other');
});
test('ordinary route writes still refuse any rollback', () => {
  setRoutes({ underground: rline({ doneNodes: ['bar_reunion', 'band_mates', 'song_for_her', 'scandal_talk'], nextNode: '' }) });
  const popped = rline({ doneNodes: ['bar_reunion', 'band_mates', 'song_for_her'], nextNode: 'scandal_talk' });
  a.throws(() => storage.writeRomanceRoutes({ lines: { underground: popped } }), /回退/);
});
test('revert refuses genuinely played chapters (doneAt not before dueAt) and empty lines', () => {
  setRoutes({ underground: rline({ doneNodes: ['bar_reunion', 'band_mates', 'song_for_her', 'scandal_talk'], nextNode: '' }) });
  career = { stage: 'trainee', nodes: [node({ status: 'done', doneAt: now + 2 * 864e5, dueAt: now - 864e5 })] };
  a.equal(live.revertLastRomanceNode('underground'), null);
  a.equal(live.revertLastRomanceNode('heir'), null);
  a.equal(storage.readRomanceRoutes().lines.underground.doneNodes.length, 4);
});
test('scandal waits for a real meeting before scheduling, regardless of bond', () => {
  setRoutes({ underground: rline() });
  career = { stage: 'trainee', nodes: [] };
  live.romanceTick();
  a.equal(career.nodes.length, 0);
  setRoutes({ underground: rline({ meetDays: ['2026-11-10'] }) });
  live.romanceTick();
  a.equal(career.nodes.length, 1);
  a.equal(career.nodes[0].note, '情缘节点：scandal_talk');
  a.equal(career.nodes[0].status, 'pending');
  a.ok(career.nodes[0].dueAt > now);
  live.romanceTick(); // 已排过不再重复排
  a.equal(career.nodes.length, 1);
});
console.log(`${tests} romance fix checks passed`);
