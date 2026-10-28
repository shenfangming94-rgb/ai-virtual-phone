// 场景 app「此刻」：首页地图（没图/有图）→ 点地点选碰见谁 → 开场卡 → 她说第一句 → 世界回（假 AI，带记号）→ 结束这一场记账；主线到点横幅 → 点进去开那一场
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const MAP = process.argv[3];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const asked = [];
function reply(s) {
  if (s.includes("把这场戏记下来")) return JSON.stringify({ summary: "她在汉江边碰到了韩智元，两个人坐着吃了泡面，聊了月考。", people: [{ name: "韩智元", event: "在汉江边和她一起吃泡面，聊月考压力", impression: "", relation: "up", heart: "same", secretLearned: "", status: "", kakao: "", stay: "stay", stayWhy: "跟她聊完轻松了点" }], video: null });
  if (s.includes("这一场的写法")) {
    asked.push(s);
    return `<content>
<scene bg="汉江公园">
晚风从江面上吹过来，草坪上零零散散坐着几拨人。便利店的塑料袋在长椅上沙沙响。
韩智元|"……你也一个人来？"
他把耳机摘下来一只，往旁边挪了挪，给你让出半张长椅。
韩智元|"坐吧，泡面还热着。月考的事，你听说了没？"
</scene>
</content>
[时间:+20分钟]`;
  }
  return "{}";
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) { asked.push("REQ " + (r.postData() || "").slice(0, 80)); const c = reply(r.postData() || ""); r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) }); }
  else r.continue();
});
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(4000);
const T0 = new Date("2015-03-28T21:00:00").getTime();
await p.evaluate(async (t) => {
  const now = new Date().toISOString();
  const mk = (id, name) => ({ id, name, avatar: null, persona: "", wechatID: id, tags: [], createdAt: now, updatedAt: now });
  const base = { layer: "main", group: "", age: "18", publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "见过几次", met: true, events: [], note: "" };
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([mk("c1", "韩智元"), mk("c2", "金智妍"), mk("c3", "朴书雅")]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ c1: { ...base, charId: "c1", role: "同期练习生" }, c2: { ...base, charId: "c2", role: "室友" }, c3: { ...base, layer: "background", charId: "c3", role: "前辈练习生" } }) });
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: [], talentNote: "", weakness: "", other: "", signature: null, company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: t - 90 * 864e5, facts: [], offers: [], nodes: [
    { id: "n_eval", kind: "eval", title: "周评", place: "JYP 公司 练习室", premise: "每周五晚上的周评，老师们坐成一排。", dueAt: t + 30 * 60e3, status: "pending", companyId: "jyp", remindedEve: true } ] }) });
  await new Promise(r => tx.oncomplete = r);
}, T0);
const setClock = (ms) => p.evaluate((ms) => { const wc = window.__worldClock; wc.offset = ms - wc.RealDate.now(); }, ms);
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await setClock(T0);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.screenshot({ path: OUT + "/s0_desk.png" });
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(2000);
await p.screenshot({ path: OUT + "/s1_home.png" });
// 点汉江公园
await p.evaluate(() => [...document.querySelectorAll(".stg-card")].find(x => x.textContent.includes("汉江公园")).click()); await sleep(500);
// 想碰见韩智元、不想碰见金智妍（点两下）
await p.evaluate(() => { const c = [...document.querySelectorAll(".stg-chip")]; c.find(x => x.textContent.includes("韩智元")).click(); });
await p.evaluate(() => { const c = [...document.querySelectorAll(".stg-chip")]; c.find(x => x.textContent.includes("金智妍")).click(); });
await p.evaluate(() => { const c = [...document.querySelectorAll(".stg-chip")]; c.find(x => x.textContent.includes("金智妍")).click(); });
await sleep(300);
await p.screenshot({ path: OUT + "/s2_sheet.png" });
await p.evaluate(() => document.querySelector(".stg-go").click()); await sleep(1500);
await p.screenshot({ path: OUT + "/s3_open.png" });
await p.evaluate(() => document.querySelector(".vn-stage-open").click()); await sleep(500);
// 输入第一句
await p.evaluate(() => { const i = document.querySelector(".vn-input-field"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(i, "拎着便利店的袋子走到江边"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.evaluate(() => document.querySelector('.vn-mode-btn:nth-child(2)').click());
await p.evaluate(() => { const i = document.querySelector(".vn-input-field"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(i, "拎着便利店的袋子走到江边"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll(".vn-send-btn")][0].click()); await sleep(200);
await p.screenshot({ path: OUT + "/s4_input.png" });
await p.evaluate(() => [...document.querySelectorAll(".vn-send-btn")][1].click()); await sleep(3500);
await p.screenshot({ path: OUT + "/s5_reply.png" });
for (let i = 0; i < 6; i++) { await p.evaluate(() => document.querySelector(".vn-shell").click()); await sleep(1400); }
await p.screenshot({ path: OUT + "/s6_reply2.png" });
// 结束这一场
await p.evaluate(() => document.querySelector('.vn-topbar-btn[title="结束这一场"]').click()); await sleep(300);
await p.evaluate(() => [...document.querySelectorAll(".vn-end-btn")].find(x => x.textContent.includes("确认")).click()); await sleep(2500);
await p.screenshot({ path: OUT + "/s7_end.png" });
await p.evaluate(() => [...document.querySelectorAll(".vn-end-btn")].find(x => x.textContent.includes("就这样")).click()); await sleep(800);
const people = await p.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const v = await new Promise(res => { const r = db.transaction("entries").objectStore("entries").get("idol_people_v1"); r.onsuccess = () => res(r.result?.value); });
  return JSON.parse(v || "{}").c1?.events;
});
// 有地图图片：上传 + 摆两个钉子
if (MAP) {
  await p.evaluate(() => document.querySelector('.stg-ic[aria-label="地图设置"]').click()); await sleep(300);
  const [fc] = await Promise.all([p.waitForFileChooser(), p.evaluate(() => document.querySelector(".stg-menu button").click())]);
  await fc.accept([MAP]); await sleep(2500);
  await p.evaluate(() => document.querySelector('.stg-ic[aria-label="地图设置"]').click()); await sleep(300);
  await p.evaluate(() => [...document.querySelectorAll(".stg-menu button")].find(x => x.textContent.includes("摆")).click()); await sleep(300);
  for (const [name, x, y] of [["汉江公园", 0.55, 0.55], ["公司", 0.3, 0.6], ["便利店", 0.5, 0.85]]) {
    await p.evaluate((n) => [...document.querySelectorAll(".stg-pinbar-list button")].find(b => b.textContent.includes(n)).click(), name); await sleep(100);
    const box = await p.evaluate(() => { const r = document.querySelector(".stg-map-inner").getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    const sl = await p.evaluate(() => document.querySelector(".stg-map").scrollLeft);
    await p.mouse.click(box.l + box.w * x, box.t + box.h * y).catch(() => undefined);
    await sleep(150);
  }
  await p.screenshot({ path: OUT + "/s8_pins.png" });
  await p.evaluate(() => [...document.querySelectorAll(".stg-pinbar-head button")][0].click()); await sleep(300);
  await p.screenshot({ path: OUT + "/s9_map.png" });
}
// 主线：时间到周评 → 横幅 → 点进去
await p.evaluate(() => document.querySelector('.stg-ic[aria-label="返回"]').click()); await sleep(500);
await setClock(T0 + 31 * 60e3); await sleep(7000);
await p.screenshot({ path: OUT + "/s10_banner.png" });
await p.evaluate(() => document.querySelector(".idol-banner")?.click()); await sleep(2000);
await p.screenshot({ path: OUT + "/s11_node.png" });
// 小地图 + 加歌
await p.evaluate(() => document.querySelector('.vn-topbar-btn')?.click()); await sleep(800);
await p.evaluate(() => document.querySelector('.stg-ic[aria-label="地图设置"]').click()); await sleep(300);
await p.evaluate(() => [...document.querySelectorAll(".stg-menu button")].find(x => x.textContent.includes("去掉")).click()); await sleep(500);
await p.evaluate(() => [...document.querySelectorAll(".stg-card")].find(x => x.textContent.includes("公司")).click()); await sleep(500);
await p.screenshot({ path: OUT + "/s12_company.png" });
await p.evaluate(() => [...document.querySelectorAll(".stg-card")].find(x => x.textContent.includes("练习室")).click()); await sleep(500);
await p.evaluate(() => [...document.querySelectorAll(".stg-row button")].find(x => x.textContent.includes("加歌")).click()); await sleep(800);
await p.screenshot({ path: OUT + "/s13_songs.png" });
await p.evaluate(() => [...document.querySelectorAll(".stg-seg button")][1].click()); await sleep(500);
await p.screenshot({ path: OUT + "/s14_netease.png" });
const icons = await p.evaluate(() => { const all = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.trim() === "此刻"); return all.length; });
console.log(JSON.stringify({ icons, errs, people, promptHasAvoid: asked.find(a => a.includes("这一场的写法"))?.includes("【这一场不出场的人】金智妍"), promptHasHan: asked.find(a => a.includes("这一场的写法"))?.includes("## 韩智元"), asked: asked.map(a => a.slice(0, 120)) }, null, 1));
await b.close();
