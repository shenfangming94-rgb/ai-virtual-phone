/**
 * 固定生活剧情端到端：生日(分支)、春节长假、樱花季、暴雨、音乐节、年末聚餐、初雪(场景剧情)。
 * 跑法：node docs/idol/tests/pl2.mjs /tmp/pl2   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-pl2-${Date.now()}`, protocolTimeout: 300000 });
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
    await p.evaluate(() => { try { window.__idolNew?.rosterTick?.(); window.__idolNew?.plotTick?.(); window.__idolNew?.plotDateTick?.(); } catch { /* 不管 */ } });
    await sleep(500);
  }
};
const ensureRoster = async () => { for (let i = 0; i < 20; i++) { await p.evaluate(() => window.__idolNew?.rosterTick?.()); await sleep(500); if (await kvGet("idol_roster_v1")) return true; } return false; };
const plotTitles = async () => {
  const career = JSON.parse(await kvGet("idol_career_v1") ?? "{}");
  return (career.nodes ?? []).filter(n => n.occasion === "plot").map(n => ({ title: n.title, status: n.status }));
};

const year = new Date().getFullYear();
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
const signedAt = new Date(year, 6, 1, 9, 0, 0).getTime();
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
// 老师介绍演过了，别来抢戏
await kvPut("idol_plots_v1", { intro_new_trainee: { key: "intro_new_trainee", state: "done", firedCount: 1 } });
await setClock(new Date(year, 6, 1, 9, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();

// 1. 她的生日（4/12）→ 生日节点 + 没有好朋友走 C 分支
await setClock(new Date(year + 1, 3, 12, 9, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pump();
let nodes = await plotTitles();
const bd = nodes.find(n => n.title.includes("我的生日"));
ok(Boolean(bd), "生日排出来了", JSON.stringify(nodes));
const bdNode = JSON.parse(await kvGet("idol_career_v1")).nodes.find(n => n.occasion === "plot" && n.title.includes("我的生日"));
ok((bdNode?.premise ?? "").includes("不强制安排生日聚会"), "没有好朋友 → 走 C 分支(不强制聚会)", bdNode?.premise?.slice(0, 50));

// 2. 樱花季（次年 3 月下旬，同一次跳时间里已经过了窗口，单独再跳一次）
await setClock(new Date(year + 1, 2, 25, 9, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pump();
nodes = await plotTitles();
ok(nodes.some(n => n.title.includes("樱花季")), "樱花季排出来了", JSON.stringify(nodes));

// 3. 暴雨（第一年 7 月下旬）
await setClock(new Date(year, 6, 25, 9, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pump();
nodes = await plotTitles();
ok(nodes.some(n => n.title.includes("夏日暴雨")), "夏日暴雨排出来了", JSON.stringify(nodes));

// 4. 音乐节（第一年 9 月）
await setClock(new Date(year, 8, 10, 9, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pump();
nodes = await plotTitles();
ok(nodes.some(n => n.title.includes("大学音乐节")), "大学音乐节排出来了", JSON.stringify(nodes));

// 5. 年末聚餐：主线家族演唱会 done 之后（直接种主线状态）
await kvPut("idol_mainline_v1", { nodes: [{ key: "family_concert", title: "公司年末家族演唱会", state: "done" }] });
await setClock(new Date(year, 11, 26, 9, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pump();
nodes = await plotTitles();
ok(nodes.some(n => n.title.includes("年末聚餐")), "家族演唱会后排了年末聚餐", JSON.stringify(nodes));

// 6. 春节长假（2026 年春节 = 2 月 17 日）
await setClock(new Date(year, 1, 17, 9, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pump();
nodes = await plotTitles();
ok(nodes.some(n => n.title.includes("放长假")), "春节放了长假剧情", JSON.stringify(nodes));

// 7. 初雪：种一个「今天初雪」的天气记录 → 开一场自由场景 → 开场就是初雪剧情
const now = new Date(year, 10, 20, 14, 0, 0); // 冬天，无课时间挑个下午——先确保没课再进
await setClock(now.getTime());
const season = year;
await kvPut(`idol_weather_first_snow_v1:${season}`, { through: `${year}-11-20`, at: new Date(year, 10, 20, 13, 0, 0).getTime() });
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pump();
const records = await p.evaluate(() => window.__idolNew?.plotRecords?.());
ok(records?.first_snow?.state === "ready", "初雪剧情进 ready", JSON.stringify(records?.first_snow));
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(2500);
await p.evaluate(() => { const el = [...document.querySelectorAll(".stg-mpin, .stg-card")].find(e => (e.textContent ?? "").includes("汉江公园")); el?.click(); }); await sleep(1500);
await p.evaluate(() => { const el = [...document.querySelectorAll("button")].find(e => e.textContent?.trim() === "进去"); el?.click(); }); await sleep(2500);
const scenes = JSON.parse(await kvGet("idol_stage_scenes_v1") ?? "{}");
const snowScene = Object.values(scenes).find(s => (s.premise ?? "").includes("初雪"));
ok(Boolean(snowScene), "自由场景接上了初雪开场", Object.values(scenes).map(s => s.premise?.slice(0, 20)));
ok(snowScene?.plotAuto === true, "初雪场景是 AI 直接开场", snowScene?.plotAuto);
ok(await p.evaluate(() => document.body.innerText.includes("这场戏开始了") || document.body.innerText.includes("说你的第一句") || document.body.innerText.includes("初雪")), "开场卡显示");
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
