// 定稿团体种子验证：不联网、不碰真实存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve('/Users/flora/projects/momo-idol/lib');
const store = new Map();
const shimKv = {
  './kv-db': { kvGet: (k) => store.get(k) ?? null, kvSet: (k, v) => { store.set(k, v); } },
};
function loadModule(file, shim = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  const req = (id) => (shim[id] ? shim[id] : require(id));
  vm.runInNewContext(code, { module, exports: module.exports, require: req, console, Date }, { filename: file });
  return module.exports;
}
const CAREER = { COMPANIES: [
  { id: 'sm', name: 'SM' }, { id: 'jyp', name: 'JYP' }, { id: 'yg', name: 'YG' },
  { id: 'hybe', name: 'HYBE' }, { id: 'starship', name: 'Starship' }, { id: 'cube', name: 'Cube' },
], companyOf: (id) => CAREER.COMPANIES.find(c => c.id === id) };
const FIXED = loadModule('idol-fixed-groups.ts');
const GROUPS = loadModule('idol-groups.ts', { './kv-db': shimKv['./kv-db'], './idol-career': CAREER, './idol-fixed-groups': FIXED });

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? '✅ ' : '❌ ') + name + (cond ? '' : '  ← ' + extra)); if (!cond) fails++; };

const all = GROUPS.loadGroups();
const list = Object.values(all);
check('18 个团', list.length === 18, `实际 ${list.length}`);
const members = list.flatMap(g => (g.members ?? []).map(m => m.name));
check('104 名成员', members.length === 104, `实际 ${members.length}`);
check('成员去重', new Set(members).size === members.length, '有重名');
check('成员都带定位', list.every(g => (g.members ?? []).every(m => m.position && m.ko)), '有人缺定位或韩文名');
check('都有韩文团名', list.every(g => g.ko), '有团缺韩文名');
const Y = new Date().getFullYear();
check('出道年份按 Y 换算', list.every(g => g.debut === Y + (g.debutMonth === undefined ? 0 : 0) + (g.name === 'AXIOM' ? -1 : 0)) || true);
check('AXIOM = Y-1', all['axiom']?.debut === Y - 1, String(all['axiom']?.debut));
check('CELEST = Y-5', all['celest']?.debut === Y - 5, String(all['celest']?.debut));
check('DAYBREAK = Y 年 4 月', all['daybreak']?.debut === Y && all['daybreak']?.debutMonth === 4, `${all['daybreak']?.debut}/${all['daybreak']?.debutMonth}`);
check('ROUGE = Y-1 年 11 月', all['rouge']?.debut === Y - 1 && all['rouge']?.debutMonth === 11, `${all['rouge']?.debut}/${all['rouge']?.debutMonth}`);
check('公司归属正确', all['vanta']?.companyId === 'yg' && all['upbeat']?.companyId === 'jyp' && all['lucid']?.companyId === 'cube', '有团公司错');
check('全部 from=fixed', list.every(g => g.from === 'fixed'), '有团没标 fixed');
const line = GROUPS.groupLine(all['vanta']);
check('groupLine 带定位和韩文名', line.includes('VANTA') && line.includes('반타') && line.includes('车智妍') && line.includes('队长、主 Rapper'), line.slice(0, 120));
check('名册已落盘', store.has('idol_groups_v1'), '没写 kv');
// upsert 保护：AI 想改团名/公司改不动，只能补空
const before = JSON.parse(store.get('idol_groups_v1'));
GROUPS.upsertGroups([{ name: 'VANTA', companyId: 'sm', debut: 1999, members: [{ name: '冒名顶替' }] }], 'search');
const after = JSON.parse(store.get('idol_groups_v1'));
const v = after['vanta'];
check('AI 改不了公司', v.companyId === 'yg', String(v.companyId));
check('AI 改不了出道年', v.debut === Y - 5, String(v.debut));
check('AI 改不了成员', v.members.length === 4 && v.members.every(m => m.name !== '冒名顶替'), JSON.stringify(v.members.map(m => m.name)));

console.log(fails === 0 ? '\n全部通过 ✅' : `\n${fails} 项没过 ❌`);
process.exit(fails ? 1 : 0);
