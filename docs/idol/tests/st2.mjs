// 场景 app「此刻」：首页地图（没图/有图）→ 点地点选碰见谁 → 开场卡 → 她说第一句 → 世界回（假 AI，带记号）→ 结束这一场记账；主线到点横幅 → 点进去开那一场
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const MAP = process.argv[3];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const asked = [];
const SEGS = ['江面上的风有点凉，草坪上零零散散坐着几拨人，远处的桥亮着一串灯。', '江面上的风有点凉，草坪上零零散散坐着几拨人，远处的桥亮着一串灯。长椅那头的人摘下一只耳机，侧过脸来，是韩智元。', '江面上的风有点凉，草坪上零零散散坐着几拨人，远处的桥亮着一串灯。长椅那头的人摘下一只耳机，侧过脸来，是韩智元。他愣了一下，然后把放在身边的便利店袋子往自己那边挪了挪。', '江面上的风有点凉，草坪上零零散散坐着几拨人，远处的桥亮着一串灯。长椅那头的人摘下一只耳机，侧过脸来，是韩智元。他愣了一下，然后把放在身边的便利店袋子往自己那边挪了挪，空出半张长椅。袋子里的泡面还冒着热气，盖子上压着一双没拆的筷子。'];

function reply(s) {
  if (s.includes("这一场的写法")) return `<content>\n<scene bg="汉江公园">\n${SEGS.join("\n")}\n韩智元|"……你也一个人来？坐吧，泡面还热着。"\n</scene>\n</content>\n<summary>测试</summary>`;
  if (s.includes("把这场戏记下来")) return JSON.stringify({ summary: "她在汉江边碰到了韩智元，两个人坐着吃了泡面，聊了月考。", segments: ["晚上九点多，她拎着便利店的袋子走到汉江边，长椅上坐着一个人在听歌，是韩智元。他摘下一只耳机，往旁边挪了挪给她让座。", "韩智元的泡面还热着，问她听没听说这次月考要加 vocal 单项。她说听说了，有点慌，他笑了一下说自己更慌，高音一直上不去。", "两个人对着江面吃完了泡面。临走他说明天早上要不要一起去练习室占个位置，她答应了。"], people: [{ name: "韩智元", event: "在汉江边碰到她，把长椅让了一半给她，一起吃泡面。聊到月考加 vocal 单项，他承认自己高音上不去，约她明早一起去练习室占位置。", impression: "", relation: "up", heart: "same", secretLearned: "", status: "", kakao: "", stay: "stay", stayWhy: "跟她聊完轻松了点" }], video: null });
  if (s.includes("合成一段完整的总结")) return "晚上她在汉江边碰到一个人听歌的韩智元，他让出半张长椅，分了她泡面。两个人聊到月考要加 vocal 单项，韩智元说自己高音一直上不去，比她还慌。吃完他约她明早一起去练习室占位置，她答应了。";
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
<summary>她拎着便利店袋子走到汉江边，碰到一个人坐着听歌的韩智元。他摘下耳机让出半张长椅，说泡面还热着，问她有没有听说月考的事。</summary>
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

await p.evaluate(() => [...document.querySelectorAll(".stg-mpin")].find(x => x.textContent.includes("汉江公园")).click()); await sleep(500);
await p.evaluate(() => document.querySelector(".stg-go").click()); await sleep(1200);
await p.evaluate(() => document.querySelector(".vn-stage-open").click()); await sleep(400);
await p.evaluate(() => { const i = document.querySelector(".vn-input-field"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(i, "……智元？"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll(".vn-send-btn")][1].click()); await sleep(2500);
const names = ["len40", "len60", "len80", "len110", "dialogue"];
for (let i = 0; i < 5; i++) {
  await sleep(4500);
  await p.screenshot({ path: OUT + "/f_" + names[i] + ".png" });
  await p.evaluate(() => document.querySelector(".vn-shell").click()); await sleep(200);
  await p.evaluate(() => document.querySelector(".vn-shell").click()); await sleep(300);
}
await b.close();
