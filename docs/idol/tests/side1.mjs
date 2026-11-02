/**
 * 此刻番外：开场在输入框点「番外」→ 淡粉「!」还回去、开头只留她写的 → 写场外推进 → 新人不进通讯录、世界时间不动、写法换成他们的视角
 * → 结束时「不计入」不记账不进记忆；另一场「计入主线」只记他们自己的事；以前的场景分主线/番外
 * 跑法：node docs/idol/tests/side1.mjs /tmp/side   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 300)); } };
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-side-${Date.now()}`, protocolTimeout: 300000 });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
let scenePrompt = "", closePrompt = "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (!r.url().includes("mock.test")) { r.continue(); return; }
  const s = r.postData() || "";
  let c = "{}";
  if (s.includes("这一场的写法")) { scenePrompt = s; c = `<content>
<scene bg="便利店">
便利店的灯白得发冷。韩智元蹲在冰柜前，挑了半天也没拿。
门口进来一个戴棒球帽的男生，是他高中同学崔允浩。
崔允浩|"智元？你怎么在这儿？"
韩智元|"……刚练完。"
</scene>
</content>
[新人:崔允浩|韩智元的高中同学]
[时间:+40分钟]
<summary>韩智元深夜在便利店碰到高中同学崔允浩。</summary>`; }
  else if (s.includes("把这场番外记下来")) { closePrompt = s; c = JSON.stringify({ summary: "韩智元在便利店碰到高中同学崔允浩。", people: [{ name: "韩智元", event: "在便利店碰到高中同学崔允浩，聊起以前", relation: "same", heart: "same" }] }); }
  else if (s.includes("把这场戏记下来")) c = JSON.stringify({ summary: "主线记账（不该出现）", people: [] });
  else if (s.includes("命运里的八个彩蛋")) c = JSON.stringify({ cards: [] });
  else if (s.includes("排接下来几天")) c = JSON.stringify({ events: [], newPeople: [], status: [], posts: [], scene: null });
  r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) });
});
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__worldClock && window.__idolTest, { timeout: 240000, polling: 1000 }); await sleep(2000);
const T0 = new Date("2015-03-28T21:00:00").getTime();
await p.evaluate(async (t) => {
  const now = new Date().toISOString();
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([{ id: "c1", name: "韩智元", avatar: null, persona: "", wechatID: "c1", tags: [], createdAt: now, updatedAt: now }]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ c1: { layer: "main", group: "", age: "18", publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "见过几次", met: true, events: [], note: "", charId: "c1", role: "同期练习生" } }) });
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m" }]) });
  st.put({ key: "ai_phone_user_identities_v1", value: JSON.stringify([{ id: "identity-1", name: "沈清仪", bio: "", gender: "女", age: "16", occupation: "", customSettings: "" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2015-03-01", trainLength: "一年半", family: "normal", talents: [], company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: t - 90 * 864e5, facts: [], offers: [], offersMadeAt: 1, nodes: [] }) });
  st.put({ key: "idol_destiny_v1", value: JSON.stringify({ cards: [] }) });
  st.put({ key: "idol_events_v1", value: JSON.stringify({ plannedUntil: t + 5 * 864e5, events: [], posts: [], feed: [], setbacks: [], fame: 5, happenings: [{ id: "hap1", at: t - 3600e3, until: t + 3 * 3600e3, place: "便利店", about: "便利店收银员和客人吵起来", seed: "收银台前一个醉汉在和店员吵架。" }] }) });
  await new Promise(r => tx.oncomplete = r);
}, T0);
await p.evaluate(t => { const wc = window.__worldClock; wc.offset = t - wc.RealDate.now(); localStorage.setItem("idol_world_clock_v1", JSON.stringify({ real: false, offset: wc.offset, world: t })); }, T0);
await p.reload({ waitUntil: "networkidle2" }); await sleep(3000);
const kv = k => p.evaluate(k => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get(k); g.onsuccess = () => res(g.result?.value); }; }), k);
const worldNow = () => p.evaluate(() => Date.now());
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(3500);

console.log("[1] 进便利店（挂着淡粉「!」）→ 开场点「番外」");
await p.evaluate(() => [...document.querySelectorAll(".stg-mpin, .stg-card")].find(x => x.textContent.includes("便利店")).click()); await sleep(800);
await p.evaluate(() => document.querySelector(".stg-go").click()); await sleep(2500);
ok(JSON.parse(await kv("idol_events_v1")).happenings[0].opened === true, "进去时「!」先用掉了");
await p.evaluate(() => document.querySelector(".vn-stage-open")?.click()); await sleep(600);
const hasSide = await p.evaluate(() => Boolean(document.querySelector(".vn-side-btn")));
ok(hasSide, "输入框那里有「番外」");
await p.evaluate(() => document.querySelector(".vn-side-btn").click()); await sleep(800);
await p.screenshot({ path: OUT + "/side_input.png" });
ok(!JSON.parse(await kv("idol_events_v1")).happenings[0].opened, "切成番外：「!」还回去了");
const scenes0 = JSON.parse(await kv("idol_stage_scenes_v1") || "{}");
const sc0 = Object.values(scenes0)[0];
ok(sc0?.side === true && !String(sc0.premise).includes("醉汉"), "这一场是番外，开头不带那件事", sc0);

console.log("[2] 写场外推进");
const t1 = await worldNow();
await p.evaluate(() => [...document.querySelectorAll(".vn-mode-btn")].find(x => x.textContent.includes("场外")).click()); await sleep(200);
await p.evaluate(() => { const i = document.querySelector(".vn-input-field"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(i, "让韩智元练完去便利店"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll(".vn-send-btn")].at(-1).click()); await sleep(6000);
ok(scenePrompt.includes("这一场是番外") && scenePrompt.includes("这一场发生在「便利店」"), "写法换成他们的视角");
ok(!scenePrompt.includes("整场戏都用「你」称呼"), "不强制第二人称");
const t2 = await worldNow();
ok(t2 - t1 < 30 * 60e3, "世界时间没被拨走 40 分钟", (t2 - t1) / 60e3);
const chars = JSON.parse(await kv("ai_phone_characters_v1"));
const yh = chars.find(c => c.name === "崔允浩");
const people = JSON.parse(await kv("idol_people_v1"));
ok(yh && people[yh.id]?.met === false, "新人建了档但她没见过", people[yh?.id]);
const contacts = JSON.parse(await kv("ai_phone_chat_contacts_v1") || "[]");
ok(!contacts.some(c => c.characterId === yh?.id), "新人没进她的通讯录");
await p.screenshot({ path: OUT + "/side_play.png" });

console.log("[3] 结束：不计入");
const endScene = async () => {
  await p.evaluate(() => document.querySelector(".vn-topbar-btn[title='更多']")?.click()); await sleep(500);
  await p.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "结束这一场")?.click()); await sleep(600);
};
await endScene();
await p.screenshot({ path: OUT + "/side_end_ask.png" });
const btns = await p.evaluate(() => [...document.querySelectorAll(".vn-end-btn")].map(x => x.textContent));
ok(btns.includes("不计入") && btns.includes("计入主线"), "结束时问要不要计入主线", btns);
await p.evaluate(() => [...document.querySelectorAll(".vn-end-btn")].find(x => x.textContent === "不计入").click()); await sleep(1500);
await p.screenshot({ path: OUT + "/side_end.png" });
ok(!closePrompt, "不计入：没调记账");
const scenes1 = JSON.parse(await kv("idol_stage_scenes_v1"));
const sc1 = Object.values(scenes1)[0];
ok(sc1.ended && sc1.sideCounted === false, "这一场结束了，标着没计入", sc1);
const p1 = JSON.parse(await kv("idol_people_v1"));
ok(!p1.c1.events.length, "韩智元没记一笔");

console.log("[4] 再开一场番外：计入主线");
await p.evaluate(() => document.querySelector(".vn-end-btn.vn-stage-jump, .vn-stage-jumps button")?.click()); await sleep(300);
await p.goto(URL, { waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__worldClock && window.__idolTest, { timeout: 240000 }); await sleep(2500);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(3500);
await p.evaluate(() => [...document.querySelectorAll(".stg-mpin, .stg-card")].find(x => x.textContent.includes("便利店")).click()); await sleep(800);
await p.evaluate(() => document.querySelector(".stg-go").click()); await sleep(2500);
await p.evaluate(() => document.querySelector(".vn-stage-open")?.click()); await sleep(600);
await p.evaluate(() => document.querySelector(".vn-side-btn").click()); await sleep(600);
await p.evaluate(() => [...document.querySelectorAll(".vn-mode-btn")].find(x => x.textContent.includes("场外")).click()); await sleep(200);
await p.evaluate(() => { const i = document.querySelector(".vn-input-field"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(i, "继续"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll(".vn-send-btn")].at(-1).click()); await sleep(6000);
await endScene();
await p.evaluate(() => [...document.querySelectorAll(".vn-end-btn")].find(x => x.textContent === "计入主线").click()); await sleep(3000);
await p.screenshot({ path: OUT + "/side_counted.png" });
ok(closePrompt.includes("把这场番外记下来"), "计入：走番外记账");
const p2 = JSON.parse(await kv("idol_people_v1"));
ok(p2.c1.events.some(e => e.text.includes("崔允浩")), "韩智元记了自己经历的事", p2.c1.events);
const scenes2 = Object.values(JSON.parse(await kv("idol_stage_scenes_v1")));
ok(scenes2.some(s => s.side && s.sideCounted === true), "标着计入了主线");

console.log("[5] 以前的场景分主线/番外");
await p.evaluate(() => [...document.querySelectorAll("button")].find(x => /回到地图|返回地图|回地图/.test(x.textContent))?.click()); await sleep(800);
await p.goto(URL, { waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__worldClock && window.__idolTest, { timeout: 240000 }); await sleep(2500);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(3500);
await p.evaluate(() => [...document.querySelectorAll(".stg-ic")].at(-1).click()); await sleep(400);
await p.evaluate(() => [...document.querySelectorAll(".stg-menu button")].find(x => x.textContent === "以前的场景").click()); await sleep(800);
const mainRows = await p.evaluate(() => document.querySelectorAll(".stg-history-card").length);
await p.evaluate(() => [...document.querySelectorAll(".stg-history-tabs button")].find(x => x.textContent === "番外").click()); await sleep(500);
const sideRows = await p.evaluate(() => [...document.querySelectorAll(".stg-history-card small")].map(x => x.textContent));
await p.screenshot({ path: OUT + "/side_past.png" });
ok(mainRows === 0 && sideRows.length === 2, "主线里没有，番外里两场", { mainRows, sideRows });
ok(sideRows.some(t => t.includes("没计入")) && sideRows.some(t => t.includes("计入了主线")), "番外标着计没计入");
console.log(`\n${pass} 过 / ${fail} 没过`, errs.length ? "页面报错：" + errs.slice(0, 3).join(" | ") : "");
await b.close();
