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

await p.evaluate(() => {
  const st = document.createElement("style");
  st.textContent = `
  .stg-title{display:none!important}
  .pv-row{position:absolute;left:14px;top:calc(var(--page-header-safe-top,44px) + 50px);display:flex;align-items:center;gap:8px;z-index:6}
  .pv-pill{display:inline-flex;align-items:center;height:34px;padding:0 14px;border-radius:999px;
    background:linear-gradient(180deg,rgba(255,255,255,.96) 0%,rgba(236,238,250,.92) 100%);
    border:1.5px solid rgba(255,255,255,.95);
    box-shadow:0 2px 6px rgba(60,70,120,.18), inset 0 -2px 3px rgba(150,160,210,.25);
    color:#36405c;font-family:"Source Han Serif CN VF","Songti SC",serif;font-weight:700;white-space:nowrap}
  .pv-date{font-size:15px;letter-spacing:.5px}
  .pv-date b{font-size:19px;font-weight:800;margin:0 1px}
  .pv-date i{font-style:normal;margin-left:10px}
  .pv-city{font-size:15px;padding:0 14px;letter-spacing:.5px}.pv-city em{font-style:normal;margin:0 6px;opacity:.5}
  .stg-ic{width:36px!important;height:36px!important;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(236,238,250,.92))!important;border:1.5px solid rgba(255,255,255,.95)!important;box-shadow:0 2px 6px rgba(60,70,120,.18),inset 0 -2px 3px rgba(150,160,210,.25)!important;color:#36405c!important}
  .stg-bar{gap:8px!important}
  .stg-bar{background:none!important}`;
  document.head.appendChild(st);
  const bar = document.querySelector(".stg-bar");
  const row = document.createElement("div"); row.className = "pv-row";
  const d = new Date();
  row.innerHTML = `<span class="pv-pill pv-date">${d.getFullYear()}<b>年</b> ${d.getMonth()+1}<b>月</b> ${d.getDate()}<b>日</b><i>星期${"日一二三四五六"[d.getDay()]}</i></span><span class="pv-pill pv-city">首尔<em>·</em>${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}</span>`;
  bar.parentElement.appendChild(row);
  const sp = document.createElement("div"); sp.style.flex = "1"; bar.insertBefore(sp, bar.querySelector(".stg-title"));
});
await p.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 2500)); await document.fonts.ready; });
await p.screenshot({ path: OUT + "/h1.png" });
await b.close();
