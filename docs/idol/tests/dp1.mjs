/**
 * 出道管道端到端：最终选拔完算名单(玩家必进+前4同期+多样性)、名单公布节点注入名单、
 * 正式出道完成→身份切 idol+出道关注度结算。
 * 跑法：node docs/idol/tests/dp1.mjs /tmp/dp1   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-dp1-${Date.now()}`, protocolTimeout: 300000 });
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

// 种三个主线节点:最终选拔 done、名单公布 pending、正式出道 pending
await p.evaluate(() => {
  const career = window.__idolTest.career;
  const c = career.loadCareer();
  c.nodes.push(
    { id: "ml_sel", kind: "event", title: "出道最终选拔", place: "公司 考核室", premise: "x", dueAt: Date.now() - 864e5, status: "done", occasion: "mainline" },
    { id: "ml_reveal", kind: "event", title: "最终出道名单公布", place: "公司 会议室", premise: "公司正式公布新女团的最终成员名单。", dueAt: Date.now() + 864e5, status: "pending", occasion: "mainline" },
    { id: "ml_debut", kind: "event", title: "正式出道", place: "演唱会场馆 舞台", premise: "公司推出新女团,完成正式出道。", dueAt: Date.now() + 2 * 864e5, status: "pending", occasion: "mainline" },
  );
  career.saveCareer(c);
});
await sleep(800);

// 1. 名单算出来:玩家必进 + 4 同期 = 5 人
for (let i = 0; i < 4; i++) { await p.evaluate(() => window.__idolNew?.pipelineTick?.()); await sleep(500); }
const st1 = await p.evaluate(() => window.__idolNew?.pipelineState?.());
ok(st1?.lineup?.length === 5, "名单 5 人(玩家+4 同期)", JSON.stringify(st1?.lineup?.length));
ok(st1?.lineup?.includes("player"), "玩家必进", JSON.stringify(st1?.lineup?.slice(0, 2)));
const rosterNow = await p.evaluate(() => window.__idolNew?.loadRoster());
const npcIds = st1.lineup.filter(id => id !== "player");
ok(npcIds.every(id => rosterNow.npcs.some(n => n.id === id)), "成员都是真实同期", JSON.stringify(npcIds));

// 2. 名单公布节点注入名单
const career2 = JSON.parse(await kvGet("idol_career_v1"));
const reveal = career2.nodes.find(n => n.id === "ml_reveal");
ok((reveal?.premise ?? "").includes("【最终名单】"), "公布节点开场带名单", reveal?.premise?.slice(-80));

// 3. 正式出道完成 → 身份切 idol + 出道结算
await p.evaluate(() => window.__idol?.checkNode?.("ml_debut", "出道舞台顺利完成"));
await sleep(1200);
for (let i = 0; i < 4; i++) { await p.evaluate(() => window.__idolNew?.pipelineTick?.()); await sleep(500); }
const career3 = JSON.parse(await kvGet("idol_career_v1"));
ok(career3.stage === "idol", "出道后身份切 idol", career3.stage);
ok((career3.facts ?? []).some(f => f.includes("出道成员")), "出道成员写进公司事实", JSON.stringify(career3.facts?.filter(f => f.includes("出道成员"))));
const fame = JSON.parse(await kvGet("idol_fame_v1") ?? "{}");
ok((fame.log ?? []).some(l => l.size === "debut"), "出道关注度结算(人气+30)", JSON.stringify((fame.log ?? []).filter(l => l.size === "debut").length));
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
