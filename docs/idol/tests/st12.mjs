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
  if (s.includes("这一场的写法")) return `<content>
<scene bg="便利店">
门口的自动售货机亮着一排灯，雪落在你的肩上，很快就化了。
雨棚底下站着一个人，手插在外套口袋里，正盯着售货机发呆。
是韩智元。他听见脚步声回过头，愣了一下。
韩智元|"……这么晚还出来？"
他往旁边让了半步，把售货机前的位置空出来。
韩智元|"热的只剩玉米茶了。你要的话，我请。"
</scene>
</content>
<summary>Flora 深夜下雪去便利店，在门口售货机前碰到韩智元，他说热饮只剩玉米茶，要请她。</summary>`;
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

await p.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 2000)); });
await p.screenshot({ path: OUT + "/y_map.png" });
await p.evaluate(() => [...document.querySelectorAll(".stg-mpin")].find(x => x.textContent.includes("公司")).click()); await sleep(800);
await p.screenshot({ path: OUT + "/y_company.png" });
await p.evaluate(() => document.querySelector('.stg-ic[aria-label="返回"]').click()); await sleep(800);
await p.evaluate(() => [...document.querySelectorAll(".stg-mpin")].find(x => x.textContent.includes("便利店")).click()); await sleep(600);
{
  const [fc] = await Promise.all([p.waitForFileChooser(), p.evaluate(() => [...document.querySelectorAll(".stg-row button")].find(x => x.textContent.includes("加一张")).click())]);
  await fc.accept([MAP2]); await sleep(2000);
}
await p.screenshot({ path: OUT + "/c1_sheet.png" });
await p.evaluate(() => document.querySelector(".stg-go").click()); await sleep(2500);
await p.screenshot({ path: OUT + "/c2_open.png" });
await p.evaluate(() => document.querySelector(".vn-stage-open").click()); await sleep(400);
await p.evaluate(() => { const i = document.querySelector(".vn-input-field"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(i, "……智元？"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.evaluate(() => [...document.querySelectorAll(".vn-send-btn")][1].click()); await sleep(1200);
await p.screenshot({ path: OUT + "/c3_me.png" });
await sleep(3500);
await sleep(2600);
await p.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 1500)); });
await p.screenshot({ path: OUT + "/y_scene.png" });
await p.evaluate(() => document.querySelector('.vn-topbar-btn[title="更多"]').click()); await sleep(400);
await p.screenshot({ path: OUT + "/y_menu.png" });
await p.evaluate(() => [...document.querySelectorAll(".vn-stage-menu button")].find(b => b.textContent.includes("隐藏时间")).click()); await sleep(400);
await p.screenshot({ path: OUT + "/y_hidden.png" });
await p.evaluate(() => document.querySelector('.vn-topbar-btn[title="更多"]').click()); await sleep(300);
await p.evaluate(() => [...document.querySelectorAll(".vn-stage-menu button")].find(b => b.textContent.includes("显示时间")).click()); await sleep(300);
await p.evaluate(() => document.querySelector(".vn-hud").click()); await sleep(400);
await p.screenshot({ path: OUT + "/y_clock.png" });
console.log(JSON.stringify({ errs }));
await b.close();
