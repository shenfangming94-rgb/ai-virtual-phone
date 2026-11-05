/**
 * 剧情池端到端：第一次课=老师介绍(前置)、第二节课后触发「竞争同一个机会」、入社满 90 天排宿舍重分配。
 * 跑法：node docs/idol/tests/pl1.mjs /tmp/pl1   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-pl1-${Date.now()}`, protocolTimeout: 300000 });
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
function nextDow(dow, hour, min = 0) { const d = new Date(); d.setHours(hour, min, 0, 0); const add = (dow - d.getDay() + 7) % 7; d.setDate(d.getDate() + add); return d.getTime(); }
const pump = async () => {
  await p.evaluate(() => { try { window.__idolNew?.rosterTick?.(); window.__idolNew?.plotTick?.(); window.__idolNew?.plotDateTick?.(); } catch { /* 不管 */ } });
  await sleep(600);
};
const ensureRoster = async () => { for (let i = 0; i < 20; i++) { await p.evaluate(() => window.__idolNew?.rosterTick?.()); await sleep(500); if (await kvGet("idol_roster_v1")) return true; } return false; };

// 1. 播种：签约 40 天（竞争机会条件满，宿舍重分配还没到）
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
const signedAt = Date.now() - 40 * 864e5;
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await setClock(nextDow(1, 8, 0));
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();
for (let i = 0; i < 6; i++) await pump();
const records1 = await p.evaluate(() => window.__idolNew?.plotRecords?.());
ok(records1?.compete?.state === "ready", "签约 40 天:竞争机会进 ready", JSON.stringify(records1?.compete));
ok(records1?.dorm_shuffle?.state === "watching", "签约 40 天:宿舍重分配还 watching", records1?.dorm_shuffle?.state);

// 2. 第一次课：找课、进公司 → 前置剧情「老师介绍新练习生」
const findClass = async (skipDow) => {
  for (let dow = 1; dow <= 5; dow++) {
    if (dow === skipDow) continue;
    await setClock(nextDow(dow, 8, 0)); await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
    let raw = null;
    for (let i = 0; i < 30 && !raw; i++) { await sleep(1000); raw = await kvGet("idol_starroad_v1"); }
    const s = raw ? JSON.parse(raw) : null;
    const monday = new Date(nextDow(dow, 8, 0)); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const parity = Math.floor(monday.getTime() / (7 * 864e5)) % 2;
    const slot = (s?.slots ?? []).find(x => x.dow === dow && x.subject && (x.parity == null || x.parity === parity));
    if (slot) { const [h, m] = slot.start.split(":").map(Number); return { dow, start: nextDow(dow, h, m), end: nextDow(dow, h + 2, m), subject: slot.subject }; }
  }
  return null;
};
const cls1 = await findClass(null);
ok(Boolean(cls1), "找了第一节要上的课");
await setClock(cls1.start + 20 * 60e3);
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 }); await sleep(1500);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(2500);
await p.evaluate(() => { const el = [...document.querySelectorAll(".stg-mpin, .stg-card")].find(e => (e.textContent ?? "").includes("公司")); el?.click(); }); await sleep(2000);
const scenes1 = JSON.parse(await kvGet("idol_stage_scenes_v1") ?? "{}");
const introScene = Object.values(scenes1).find(s => s.class?.preScene === "intro");
ok(Boolean(introScene), "第一次课开了前置剧情(老师介绍)", Object.values(scenes1).map(s => s.class?.preScene));
ok((introScene?.premise ?? "").includes("介绍"), "开场是介绍新练习生", introScene?.premise?.slice(0, 40));
ok((introScene?.class?.text ?? "") === "", "第一次课不放固定文本", introScene?.class?.text);
// 开场卡点一下 → AI 直接开场（测试环境没配 API，AI 失败后照样能下课）
await p.evaluate(() => document.querySelector(".vn-stage-open")?.click()); await sleep(2500);
let gotEnd = false;
for (let i = 0; i < 30 && !gotEnd; i++) {
  gotEnd = await p.evaluate(() => document.body.innerText.includes("下课"));
  if (!gotEnd) { await p.evaluate(() => document.querySelector(".vn-shell")?.click()); await sleep(350); }
}
ok(gotEnd, "介绍开场卡点完出现下课");
await p.evaluate(() => { [...document.querySelectorAll("button")].find(x => x.textContent?.includes("下课") && !x.textContent.includes("中"))?.click(); }); await sleep(2500);
const records2 = await p.evaluate(() => window.__idolNew?.plotRecords?.());
ok(records2?.intro_new_trainee?.firedCount === 1, "介绍剧情记成已触发", JSON.stringify(records2?.intro_new_trainee));
ok(await p.evaluate(() => document.body.innerText.includes("这节课结束了")), "第一次课下课收尾");

// 3. 第二次课：正常固定文本 → 下课 → 竞争机会接在课后
const cls2 = await findClass(cls1.dow);
ok(Boolean(cls2), "找了第二节课");
await setClock(cls2.start + 20 * 60e3);
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 }); await sleep(1500);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(2500);
await p.evaluate(() => { const el = [...document.querySelectorAll(".stg-mpin, .stg-card")].find(e => (e.textContent ?? "").includes("公司")); el?.click(); }); await sleep(2000);
const scenes2 = JSON.parse(await kvGet("idol_stage_scenes_v1") ?? "{}");
const clsScene2 = Object.values(scenes2).find(s => s.class && !s.class.preScene && !s.class.settled);
ok(Boolean(clsScene2), "第二次课是普通课(固定文本)", clsScene2?.class?.text?.slice(0, 30));
let gotEnd2 = false;
for (let i = 0; i < 50 && !gotEnd2; i++) {
  gotEnd2 = await p.evaluate(() => document.body.innerText.includes("下课"));
  if (!gotEnd2) { await p.evaluate(() => document.querySelector(".vn-shell")?.click()); await sleep(350); }
}
ok(gotEnd2, "文本点完出现下课");
await p.evaluate(() => { [...document.querySelectorAll("button")].find(x => x.textContent?.includes("下课") && !x.textContent.includes("中"))?.click(); }); await sleep(3000);
const records3 = await p.evaluate(() => window.__idolNew?.plotRecords?.());
ok(records3?.compete?.firedCount === 1 && records3?.compete?.state === "done", "竞争机会触发了一次", JSON.stringify(records3?.compete));
ok(Array.isArray(records3?.compete?.extra?.subjects) && records3.compete.extra.subjects.length === 1, "记了用过的课程", JSON.stringify(records3?.compete?.extra));
const scenes3 = JSON.parse(await kvGet("idol_stage_scenes_v1") ?? "{}");
const afterScene2 = Object.values(scenes3).find(s => s.class && s.class.settled && s.startAt === clsScene2.startAt);
ok(afterScene2?.ended !== true, "挂了剧情的课不归档(接着演)", afterScene2?.ended);

// 4. 入社满 90 天：宿舍重分配 + 集体外出排出来
await setClock(signedAt + 95 * 864e5);
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
for (let i = 0; i < 8; i++) await pump();
const career = JSON.parse(await kvGet("idol_career_v1") ?? "{}");
const plotNodes = career.nodes?.filter(n => n.occasion === "plot") ?? [];
ok(plotNodes.some(n => n.title.includes("宿舍重新分配")), "宿舍重新分配排出来了", plotNodes.map(n => n.title));
ok(plotNodes.some(n => n.title.includes("集体外出")), "集体外出排出来了", plotNodes.map(n => n.title));
ok(plotNodes.every(n => n.status === "pending" || n.status === "absent"), "剧情日程都是待办或已过期", plotNodes.map(n => `${n.title}:${n.status}`));
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
