// ins：点图放大（生成图片/编辑文字）、彻底删除菜单（截图看样子，不调 AI）
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(4000);
await p.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  const now = window.__worldClock ? Date.now() : Date.now();
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: [], talentNote: "", weakness: "", other: "", signature: null, company: "BLUE", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_ins_v1", value: JSON.stringify({ me: { handle: "flora_0412", name: "Flora", bio: "练习中", private: true, riskHint: true },
    accs: { a1: { id: "a1", handle: "jiwon.h", name: "智媛", private: true, followers: 80, bio: "", hue: 200, kind: "npc" } },
    following: ["a1"], followers: [], requested: [], incoming: [],
    posts: [{ id: "p1", by: "a1", at: now - 3600e3, imgs: [{ desc: "练习室地板上一双磨旧的舞鞋，鞋带散着" }], cap: "오늘도", capZh: "今天也是", likes: 12, comments: [{ by: "minji.dance", text: "수고했어", zh: "辛苦了", at: now - 1800e3 }] }],
    stories: [], notes: [], dms: {}, askedMe: [], filledAt: now, strangersAt: now }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "ins" }, "*")); await sleep(2500);
await p.screenshot({ path: OUT + "/v1_feed.png" });
await p.evaluate(() => document.querySelector(".ig-car .ig-desc").click()); await sleep(500);
await p.screenshot({ path: OUT + "/v2_viewer.png" });
await p.evaluate(() => [...document.querySelectorAll(".ig-iv-bar button")].find(x => x.textContent.includes("编辑文字")).click()); await sleep(300);
await p.screenshot({ path: OUT + "/v3_edit.png" });
await p.evaluate(() => { const t = document.querySelector(".ig-iv-ta"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, "练习室地板上一双磨旧的白色舞鞋"); t.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(200);
await p.evaluate(() => [...document.querySelectorAll(".ig-iv-bar button")].find(x => x.textContent.includes("保存")).click()); await sleep(300);
await p.evaluate(() => document.querySelector(".ig-iv-top button").click()); await sleep(300);
await p.evaluate(() => document.querySelector(".cp-instagram-post-head > button:last-child").click()); await sleep(400);
await p.screenshot({ path: OUT + "/v4_menu.png" });
await p.evaluate(() => [...document.querySelectorAll(".ig-sheet button")].find(x => x.textContent.includes("彻底删除")).click()); await sleep(500);
const left = await p.evaluate(async () => { const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); }); return await new Promise(res => { const q = db.transaction("entries").objectStore("entries").get("idol_ins_v1"); q.onsuccess = () => res(JSON.parse(q.result.value).posts.length); }); });
console.log("posts left", left, "errs", errs);
await b.close();
