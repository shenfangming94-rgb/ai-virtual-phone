/**
 * 记忆库：新增短期记忆 → 出现在短期记忆里 → 再点能编辑
 * 跑法：node docs/idol/tests/st-add.mjs /tmp/st-add   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 300)); } };
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-stadd-${Date.now()}`, protocolTimeout: 300000 });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__worldClock && window.__idolTest, { timeout: 240000, polling: 1000 }); await sleep(2000);
await p.evaluate(async () => {
  const now = new Date().toISOString();
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([{ id: "c1", name: "韩智元", avatar: null, persona: "", wechatID: "c1", tags: [], createdAt: now, updatedAt: now }]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ c1: { layer: "main", group: "", age: "18", publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "", met: true, events: [], note: "", charId: "c1", role: "同期练习生" } }) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2015-03-01", trainLength: "一年半", family: "normal", talents: [], company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: 1, facts: [], offers: [], offersMadeAt: 1, nodes: [] }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(3000);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "resources" }, "*")); await sleep(2500);
await p.evaluate(() => [...document.querySelectorAll("*")].find(x => x.children.length === 0 && x.textContent.trim() === "韩智元")?.closest("button,[role=button],div")?.click()); await sleep(2000);
await p.evaluate(() => [...document.querySelectorAll(".memo-segmented-tab")].find(x => x.textContent.includes("短期"))?.click()); await sleep(800);
const hasBtn = await p.evaluate(() => [...document.querySelectorAll(".mem-entry-add-btn")].some(x => x.textContent.includes("新增短期记忆")));
ok(hasBtn, "短期记忆页有「新增短期记忆」");
await p.evaluate(() => [...document.querySelectorAll(".mem-entry-add-btn")].find(x => x.textContent.includes("新增短期记忆")).click()); await sleep(600);
await p.evaluate(() => { const t = document.querySelector(".mem-edit-textarea"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, "昨晚在汉江公园，她说想家了"); t.dispatchEvent(new Event("input", { bubbles: true })); });
await p.screenshot({ path: OUT + "/st_add_sheet.png" });
await p.evaluate(() => document.querySelector(".mem-edit-save-btn").click()); await sleep(1500);
await p.screenshot({ path: OUT + "/st_add_after.png" });
const shown = await p.evaluate(() => document.body.innerText.includes("汉江公园，她说想家了"));
ok(shown, "加的那条出现在短期记忆里");
const stored = await p.evaluate(() => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get("nox_short_term_manual_v1"); g.onsuccess = () => res(g.result?.value); }; }));
ok(String(stored).includes("想家了") && String(stored).includes("c1"), "存进了韩智元的短期记忆", stored);
console.log(`\n${pass} 过 / ${fail} 没过`, errs.length ? "页面报错：" + errs.slice(0, 3).join(" | ") : "");
await b.close();
