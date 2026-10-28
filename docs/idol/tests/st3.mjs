// 此刻第三批（st3）：自带地图、地图音乐、设置、场外指令、台词兜底、长旁白切帧、离场。原 st1：首页地图（没图/有图）→ 点地点选碰见谁 → 开场卡 → 她说第一句 → 世界回（假 AI，带记号）→ 结束这一场记账；主线到点横幅 → 点进去开那一场
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const MAP2 = process.argv[3];
const MAP = process.argv[3];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const asked = [];
function reply(s) {
  if (s.includes("这一场的写法")) {
    asked.push(s);
    return `<content>
<scene bg="汉江公园">
江面上的风有点凉，草坪上零零散散坐着几拨人，远处的桥亮着一串灯。长椅那头的人摘下一只耳机，侧过脸来，是韩智元。他愣了一下，然后把放在身边的便利店袋子往自己那边挪了挪，空出半张长椅。
韩智元笑着说：「坐吧，泡面还热着。」
韩智元|"안 추워? 바람 많이 부는데.|不冷吗？风挺大的。"
朴书雅从后面跑过来，拍了一下韩智元的肩膀。
朴书雅|"我先回去了啊，明天见。"
</scene>
</content>
[离场:朴书雅]
<summary>Flora 在汉江边碰到韩智元，他让出半张长椅请她吃泡面。朴书雅路过打了个招呼先走了。</summary>`;
  }
  return "{}";
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) { asked.push(r.postData() || ""); const c = reply(r.postData() || ""); r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) }); }
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
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(3000);

await p.screenshot({ path: OUT + "/t1_home.png" });
// 地图音乐
await p.evaluate(() => document.querySelector('.stg-ic[aria-label="地图设置"]').click()); await sleep(300);
await p.screenshot({ path: OUT + "/t2_menu.png" });
await p.evaluate(() => [...document.querySelectorAll(".stg-menu button")].find(x => x.textContent.includes("地图的音乐")).click()); await sleep(500);
await p.screenshot({ path: OUT + "/t3_mapmusic.png" });
await p.evaluate(() => document.querySelector(".stg-sheet .stg-done").click()); await sleep(300);
// 设置
await p.evaluate(() => document.querySelector('.stg-ic[aria-label="地图设置"]').click()); await sleep(300);
await p.evaluate(() => [...document.querySelectorAll(".stg-menu button")].find(x => x.textContent.includes("设置")).click()); await sleep(500);
await p.screenshot({ path: OUT + "/t4_settings.png" });
await p.evaluate(() => document.querySelector(".stg-done").click()); await sleep(300);
// 点汉江公园钉子
await p.evaluate(() => { const m = document.querySelector(".stg-map"); m.scrollLeft = m.scrollWidth * 0.3; }); await sleep(300);
await p.evaluate(() => [...document.querySelectorAll(".stg-mpin")].find(x => x.textContent.includes("汉江公园")).click()); await sleep(500);
await p.evaluate(() => { const c = [...document.querySelectorAll(".stg-chip")]; c.find(x => x.textContent.includes("韩智元")).click(); });
await p.screenshot({ path: OUT + "/t5_sheet.png" });
await p.evaluate(() => document.querySelector(".stg-go").click()); await sleep(1200);
await p.evaluate(() => document.querySelector(".vn-stage-open").click()); await sleep(400);
// 场外指令
await p.evaluate(() => [...document.querySelectorAll(".vn-mode-btn")].find(x => x.textContent.includes("场外")).click()); await sleep(200);
await p.evaluate(() => { const i = document.querySelector(".vn-input-field"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(i, "让朴书雅路过一下然后走掉"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.screenshot({ path: OUT + "/t6_director.png" });
await p.evaluate(() => [...document.querySelectorAll(".vn-send-btn")][1].click()); await sleep(3500);
const frames = [];
for (let i = 0; i < 8; i++) {
  frames.push(await p.evaluate(() => [document.querySelector(".vn-name")?.textContent || "", document.querySelector(".vn-text")?.textContent || ""].join(" | ")));
  await p.screenshot({ path: OUT + `/t7_f${i}.png` });
  await p.evaluate(() => document.querySelector(".vn-shell").click()); await sleep(150);
  await p.evaluate(() => document.querySelector(".vn-shell").click()); await sleep(600);
}
await p.evaluate(() => document.querySelector('.vn-topbar-btn[title="切换场景"]')?.click()); await sleep(500);
await p.screenshot({ path: OUT + "/t8_places.png" });
await p.evaluate(() => document.querySelector(".vn-history-close")?.click()); await sleep(300);
await p.evaluate(() => document.querySelector('.vn-topbar-btn[title="回顾"]').click()); await sleep(500);
await p.screenshot({ path: OUT + "/t9_history.png" });
const stage = await p.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const v = await new Promise(res => { const r = db.transaction("entries").objectStore("entries").get("idol_stage_scenes_v1"); r.onsuccess = () => res(r.result?.value); });
  return Object.values(JSON.parse(v || "{}")).map(x => ({ ids: x.ids, spans: x.spans }));
});
// 重 roll（带要求）
await p.evaluate(() => [...document.querySelectorAll(".vn-history-close")].forEach(b => b.click())); await sleep(300);
await p.evaluate(() => document.querySelector('.vn-history-overlay')?.click()); await sleep(300);
await p.evaluate(() => document.querySelector('.vn-ctrl-btn[title="重roll这段"]')?.click()); await sleep(400);
await p.evaluate(() => { const i = document.querySelector(".vn-retry textarea"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(i, "韩智元话少一点，更冷淡"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.screenshot({ path: OUT + "/t10_retry.png" });
await p.evaluate(() => [...document.querySelectorAll(".vn-retry-btns button")].find(b => b.textContent.includes("按这个改")).click()); await sleep(3000);
const retryAsked = asked.filter(a => a.includes("这一场的写法")).length;
const retryHasHint = asked.some(a => a.includes("韩智元话少一点"));
// 回到地图：菜单、自己写地点、多张背景
await p.evaluate(() => document.querySelector('.vn-topbar-btn').click()); await sleep(800);
await p.evaluate(() => document.querySelector('.stg-ic[aria-label="地图设置"]').click()); await sleep(300);
await p.screenshot({ path: OUT + "/t11_menu.png" });
await p.evaluate(() => [...document.querySelectorAll(".stg-menu button")].find(x => x.textContent.includes("自己写")).click()); await sleep(400);
await p.evaluate(() => { const i = document.querySelector(".stg-write-in"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "智元家楼下"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.evaluate(() => document.querySelector(".stg-write .stg-done").click()); await sleep(600);
for (const img of [MAP2, MAP2]) {
  const [fc] = await Promise.all([p.waitForFileChooser(), p.evaluate(() => [...document.querySelectorAll(".stg-row button")].find(x => x.textContent.includes("加一张")).click())]);
  await fc.accept([img]); await sleep(1500);
}
await p.screenshot({ path: OUT + "/t12_custom.png" });
const vnReq = asked.find(a => a.includes("这一场的写法")) || "";
console.log(JSON.stringify({ placeList: asked.some(a => a.includes("地点名单") && a.includes("江南·烤肉店")), retryAsked, retryHasHint, errs, frames, stage, hasDirector: vnReq.includes("场外指令：让朴书雅"), hasWords: vnReq.includes("大约 800 字"), noOldBilingual: !vnReq.includes("对白双语规则") }, null, 1));
await b.close();
