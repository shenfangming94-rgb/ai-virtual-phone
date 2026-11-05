/**
 * 月评换血端到端：新档月考 = 40 人真实数值硬排名（玩家不保送不限幅）、分班写回名册、
 * 升降班/被调离剧情在下一节课接上、旧发动机在新档停用。
 * 跑法：node docs/idol/tests/mr1.mjs /tmp/mr1   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-mr1-${Date.now()}`, protocolTimeout: 300000 });
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
const pump = async (n = 8) => {
  for (let i = 0; i < n; i++) {
    await p.evaluate(() => { try { window.__idolNew?.rosterTick?.(); window.__idolNew?.plotTick?.(); window.__idolNew?.plotDateTick?.(); } catch { /* 不管 */ } try { window.__idol?.run?.(); } catch { /* 不管 */ } });
    await sleep(500);
  }
};
const ensureRoster = async () => { for (let i = 0; i < 20; i++) { await p.evaluate(() => window.__idolNew?.rosterTick?.()); await sleep(500); if (await kvGet("idol_roster_v1")) return true; } return false; };

// 1. 播种：签约 3 天，直接打勾月考（演了或打勾都算完成）
const signedAt = Date.now() - 3 * 864e5;
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await kvPut("idol_plots_v1", { intro_new_trainee: { key: "intro_new_trainee", state: "done", firedCount: 1 } });
await setClock(new Date(new Date().getFullYear(), 6, 3, 9, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();

// 2. 打勾月考节点（careerTick 会自动排周评/月考）
for (let i = 0; i < 20; i++) {
  await p.evaluate(() => window.__idol?.run?.());
  await sleep(700);
  const career = JSON.parse(await kvGet("idol_career_v1") ?? "{}");
  if (career.nodes?.some(n => n.kind === "monthly")) break;
}
const career1 = JSON.parse(await kvGet("idol_career_v1"));
const monthly = career1.nodes.find(n => n.kind === "monthly");
ok(Boolean(monthly), "月考排出来了", career1.nodes.map(n => n.kind).join(","));
// 把她的数值拉满：模拟练到顶，月评应该第一 + 升 A 班（验证不保送、按真数值排）
const rosterBoost = JSON.parse(await kvGet("idol_roster_v1"));
rosterBoost.player.stats = { vocal: 95, dance: 95, rap: 95, variety: 90, acting: 90, visual: 90, compose: 90, language: 90 };
// 从页面里写（kv-db 有内存缓存，直接写 IndexedDB 页面看不见）
await p.evaluate((s) => window.__idolNew?.saveRoster?.(s), rosterBoost);
const afterBoost = JSON.parse(await kvGet("idol_roster_v1"));
await p.evaluate((id) => window.__idol?.checkNode?.(id, "认真考完了"), monthly.id);
await sleep(1500);
await p.evaluate((id) => window.__idolNew?.publishMonthly?.(id), monthly.id);
await sleep(2000);

// 3. 断言：40 人硬排名出来了
const ledger = JSON.parse(await kvGet("idol_ledger_v1") ?? "{}");
const month = ledger.months?.[ledger.months.length - 1];
ok(Boolean(month), "排名发布了", JSON.stringify(ledger.months?.length));
ok(month?.total === 40, "40 人全在表上", month?.total);
ok(month?.rows?.length === 40, "排名图 40 行", month?.rows?.length);
ok(month?.rank === 1, "数值拉满就该第一(不保送、按真数值)", month?.rank);
const roster = JSON.parse(await kvGet("idol_roster_v1"));
const dist = ["A", "B", "C", "D"].map(k => roster.npcs.filter(n => n.klass === k).length);
ok(dist.join(",") === "9,10,10,10", `分班写回名册(她占 A 班一个坑):${dist.join(",")}`, dist.join(","));
ok(roster.player.klass === "A", `她升进 A 班(${roster.player.klass})`, roster.player.klass);

// 4. 旧发动机在新档停用：现场/事件不该有
const oldEvents = JSON.parse(await kvGet("idol_events_v1") ?? "{}");
ok(!(oldEvents.happenings ?? []).length, "旧发动机的现场不生成", JSON.stringify(oldEvents.happenings));
ok(!(oldEvents.events ?? []).length, "旧发动机的事件不生成", JSON.stringify(oldEvents.events));

// 5. 升降班/被调离剧情进 ready（班级已经重排过）
await p.evaluate(() => { for (let i = 0; i < 5; i++) window.__idolNew?.plotTick?.(); });
await sleep(800);
const records = await p.evaluate(() => window.__idolNew?.plotRecords?.());
ok(records?.promote_demote?.state === "ready" || records?.promote_demote?.state === "done", "升降班剧情条件接上了", JSON.stringify(records?.promote_demote?.state));
ok(records?.moved_out?.extra?.klasses != null, "被调离剧情有了班级快照", JSON.stringify(records?.moved_out?.extra?.klasses != null));
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
