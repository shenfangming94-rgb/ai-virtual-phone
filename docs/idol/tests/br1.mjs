/**
 * 同期支线引擎端到端：按关系筛人、每天最多开一条、活跃上限 3、完成腾名额、结果保存。
 * 跑法：node docs/idol/tests/br1.mjs /tmp/br1   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-br1-${Date.now()}`, protocolTimeout: 300000 });
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
const signedAt = Date.now() - 40 * 864e5;
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await kvPut("idol_plots_v1", { intro_new_trainee: { key: "intro_new_trainee", state: "done", firedCount: 1 } });
await setClock(new Date(new Date().getFullYear(), 7, 12, 10, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();

// 1. 认识几个同期 + 有关系:三个熟人以上 + 有互动记录
await p.evaluate(() => {
  const people = window.__idolTest.people;
  const roster = window.__idolNew.loadRoster();
  const names = ["林娜英", "吴素妍", "南艺琳", "白智恩"];
  roster.npcs.slice(0, 4).forEach((n, i) => {
    const prof = people.getProfile(n.charId);
    prof.met = true;
    prof.role = "同期练习生";
    prof.group = "同期练习生";
    prof.relation = i === 0 ? "好朋友" : "熟人";
    prof.events = [{ id: "e1", at: Date.now(), place: "公司", text: "一起练过舞" }];
    prof.privateLines = i === 0 ? ["喜欢摄影,周末常出去拍照"] : [];
    people.saveProfile(prof);
  });
  void names;
});

// 2. 开第一条支线
await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__idolNew?.branchesTick?.(); });
await sleep(800);
let st = await p.evaluate(() => window.__idolNew?.branchesState?.());
ok((st.branches ?? []).length === 1, "第一天开了一条支线", JSON.stringify(st.branches?.map(b => b.type)));
ok(st.branches?.[0]?.active === true, "支线在活跃推进");
const career1 = JSON.parse(await kvGet("idol_career_v1"));
const branchNode = career1.nodes.find(n => n.occasion === "branch");
ok(Boolean(branchNode), "支线排了日程节点", career1.nodes.filter(n => n.occasion === "branch").map(n => n.title));

// 3. 同一天再开:不给(一天一条)
await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__idolNew?.branchesTick?.(); });
await sleep(500);
st = await p.evaluate(() => window.__idolNew?.branchesState?.());
ok((st.branches ?? []).length === 1, "同一天不再开第二条", st.branches?.length);

// 4. 跳一天:开第二条;再跳:第三条;第四条被 3 条上限挡
for (const day of [13, 14, 15]) {
  await setClock(new Date(new Date().getFullYear(), 7, day, 10, 0, 0).getTime());
  await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
  await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__idolNew?.branchesTick?.(); });
  await sleep(800);
}
st = await p.evaluate(() => window.__idolNew?.branchesState?.());
const activeCount = (st.branches ?? []).filter(b => b.active).length;
ok(activeCount === 3, "活跃支线最多 3 条", activeCount);
ok((st.branches ?? []).length <= 4, "总记录不超过 4 条(第 4 天被上限挡)", st.branches?.length);

// 5. 完成一条 → 腾名额 + 记历史
const first = st.branches[0];
const doneNode = career1.nodes.find(n => n.occasion === "branch");
await p.evaluate((id) => window.__idol?.checkNode?.(id, "一起去了,很开心"), doneNode.id);
await sleep(1200);
await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__idolNew?.branchesTick?.(); });
await sleep(800);
st = await p.evaluate(() => window.__idolNew?.branchesState?.());
const rec = st.branches.find(b => b.charId === first.charId);
ok(rec?.active === false, "完成的支线告一段落", rec?.active);
ok((rec?.history?.length ?? 0) >= 1, "结果记进历史(延续优先)", JSON.stringify(rec?.history));
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
