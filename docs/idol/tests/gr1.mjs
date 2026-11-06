/**
 * 大机遇成长通道端到端：数值级涨能力、一场戏只结一次、amount 钳到 1~10、100 封顶、存档落盘。
 * 跑法：node docs/idol/tests/gr1.mjs /tmp/gr1   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-gr1-${Date.now()}`, protocolTimeout: 300000 });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));

const setClock = async (target) => {
  await p.evaluate(world => {
    const wc = window.__worldClock;
    if (wc) { wc.frozen = null; wc.offset = world - wc.RealDate.now(); }
    const offset = wc ? wc.offset : world - Date.now();
    localStorage.setItem("idol_world_clock_v1", JSON.stringify({ real: false, offset, world }));
  }, target);
};
const kvGet = async (key) => p.evaluate(async k => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readonly"); const st = tx.objectStore("entries");
  return await new Promise(res => { const q = st.get(k); q.onsuccess = () => res(q.result?.value ?? null); });
}, key);
const kvPut = async (key, value) => p.evaluate(async (k, v) => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: k, value: JSON.stringify(v) });
  await new Promise(res => tx.oncomplete = res);
}, key, value);
const ensureRoster = async () => { for (let i = 0; i < 20; i++) { await p.evaluate(() => window.__idolNew?.rosterTick?.()); await sleep(500); if (await kvGet("idol_roster_v1")) return true; } return false; };

await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
const signedAt = Date.now() - 300 * 864e5; // 签约近一年
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await kvPut("idol_plots_v1", { intro_new_trainee: { key: "intro_new_trainee", state: "done", firedCount: 1 } });
await setClock(new Date(new Date().getFullYear(), 8, 20, 10, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();

// 1. 数值级成长：acting +10
const before = await p.evaluate(() => window.__idolNew?.loadRoster()?.player?.stats?.acting);
const g1 = await p.evaluate(() => window.__idolNew?.settleGrowth?.("acting", 10, "scene:test1"));
ok(g1?.gained === 10, "大机遇 +10 数值级涨", JSON.stringify(g1));
const after = await p.evaluate(() => window.__idolNew?.loadRoster()?.player?.stats?.acting);
ok(after === before + 10, "能力值直接 +10", JSON.stringify([before, after]));

// 2. 同一场戏只结一次
const g2 = await p.evaluate(() => window.__idolNew?.settleGrowth?.("acting", 10, "scene:test1"));
ok(g2 === null, "同一场戏不重复结算", JSON.stringify(g2));

// 3. amount 钳到 1~10
const g3 = await p.evaluate(() => window.__idolNew?.settleGrowth?.("vocal", 99, "scene:test2"));
ok(g3?.gained === 10, "amount 99 钳到 10", JSON.stringify(g3));
const g4 = await p.evaluate(() => window.__idolNew?.settleGrowth?.("vocal", -5, "scene:test3"));
ok(g4?.gained === 1, "amount -5 钳到 1", JSON.stringify(g4));

// 4. 100 封顶
const g5 = await p.evaluate(() => { const r = window.__idolNew.loadRoster(); r.player.stats.visual = 96; window.__idolNew.saveRoster(r); return window.__idolNew.settleGrowth("visual", 10, "scene:test4"); });
ok(g5?.gained === 4, "100 封顶只涨到 100", JSON.stringify(g5));
const vis = await p.evaluate(() => window.__idolNew?.loadRoster()?.player?.stats?.visual);
ok(vis === 100, "封顶后就是 100", vis);

// 5. 非法科目不结算
const g6 = await p.evaluate(() => { try { return window.__idolNew?.settleGrowth?.("cooking", 10, "scene:test5"); } catch (e) { return "threw"; } });
ok(g6 === null || g6 === "threw" || g6 === undefined, "非法科目不涨", JSON.stringify(g6));

// 6. 结算记录落盘
const settled = JSON.parse(await kvGet("idol_growth_settled_v1") ?? "[]");
ok(settled.includes("scene:test1") && settled.includes("scene:test4"), "去重记录写进存档", JSON.stringify(settled));
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
