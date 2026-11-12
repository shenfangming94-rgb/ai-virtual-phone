const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../lib/idol-romance-storage.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const entries = new Map();
let hydrated = true;
const exportsObject = {};
vm.runInNewContext(js, { exports: exportsObject, require: name => name === './idol-romance-recovery' ? { recoverConfirmedRomanceIncident: () => null } : ({
  kvGet: key => entries.get(key) ?? null,
  kvSet: (key, value) => entries.set(key, value),
  isKvHydrated: () => hydrated,
}) });
const { readRomanceRoutes: read, writeRomanceRoutes: write, ROMANCE_ROUTE_KEY: key, ROMANCE_ROUTE_BACKUP_KEY: backup } = exportsObject;
const state = { lines: { underground: { type: 'underground', charId: 'han', bond: 53, history: [], doneNodes: ['bar_reunion'] } } };
const knowledge = JSON.stringify({ knowledge: [], exposures: [] });
entries.set('idol_romance_v1', JSON.stringify(state));
assert.equal(read().lines.underground.bond, 53);
assert.ok(entries.has(key));
entries.set('idol_romance_v1', knowledge); // stale client overwrites the old shared key
assert.equal(read().lines.underground.bond, 53);
state.lines.underground.bond = 54;
write(state);
assert.equal(entries.get('idol_romance_v1'), knowledge);
assert.equal(JSON.parse(entries.get(backup)).lines.underground.bond, 54);
assert.throws(() => write({ lines: {} }));
assert.throws(() => write({ lines: { underground: { ...state.lines.underground, doneNodes: [] } } }));
assert.equal(JSON.parse(entries.get('idol_romance_routes_history_v2'))[0], JSON.stringify({ lines: { underground: { ...state.lines.underground, bond: 53 } } }));
entries.set(key, '{broken');
assert.equal(read().lines.underground.bond, 54);
assert.throws(() => write({ knowledge: [], exposures: [] }));
entries.clear();
entries.set('idol_romance_v1', knowledge);
entries.set('idol_romance_before_meet_ledger_v1', JSON.stringify(state));
assert.equal(Object.keys(read().lines).length, 0); // no automatic restoration of inflated historical scores
assert.equal(entries.has(key), false);
hydrated = false;
assert.throws(() => write(state));
entries.set('idol_romance_v1', JSON.stringify(state));
read();
assert.equal(entries.has(key), false); // no migration before database hydration
console.log('PASS: legacy migration, stale-client overwrite isolation, independent snapshot, corrupt-primary fallback, invalid-state rejection, historical-backup safety, hydration guard');
