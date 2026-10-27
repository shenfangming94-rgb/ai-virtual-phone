// ins：点 Instagram 退出、快拍顶端对齐、发快拍用自己的图（截图看样子，不调 AI）
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
  const now = Date.now();
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: [], talentNote: "", weakness: "", other: "", signature: null, company: "BLUE", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_ins_v1", value: JSON.stringify({ me: { handle: "flora_0412", name: "Flora", bio: "练习中", private: true, riskHint: true },
    accs: { a1: { id: "a1", handle: "jiwon.h", name: "智媛", private: true, followers: 80, bio: "", hue: 200, kind: "npc" } },
    following: ["a1"], followers: [], requested: [], incoming: [], posts: [],
    stories: [{ id: "s1", by: "a1", at: now - 3600e3, text: "还在练", img: { desc: "凌晨的练习室，镜子里只剩一盏灯" }, bg: "linear-gradient(160deg,#3a3a52,#7a6a8e)", viewers: [] }],
    notes: [], dms: {}, askedMe: [], filledAt: now, strangersAt: now }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "ins" }, "*")); await sleep(2500);
// 别人的快拍
await p.evaluate(() => [...document.querySelectorAll(".ig-st")].find(x => x.textContent.includes("jiwon"))?.click()); await sleep(600);
await p.screenshot({ path: OUT + "/s1_view.png" });
await p.evaluate(() => { const i = document.querySelector(".ig-sv-reply input"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "加油！"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.evaluate(() => document.querySelectorAll(".ig-sv-reply button")[0].click()); await sleep(300);
await p.screenshot({ path: OUT + "/s1b_reply.png" });
await p.evaluate(() => document.querySelectorAll(".ig-sv-reply button")[1].click()); await sleep(300);
await p.evaluate(() => document.querySelectorAll(".ig-sv-btns button")[1].click()); await sleep(400);
// 发快拍
await p.evaluate(() => document.querySelector(".ig-st.me").click()); await sleep(600);
await p.screenshot({ path: OUT + "/s2_new.png" });
const [fc] = await Promise.all([p.waitForFileChooser(), p.evaluate(() => [...document.querySelectorAll(".ig-stn-add button")].find(x => x.textContent.includes("上传")).click())]);
await fc.accept([process.argv[3]]); await sleep(1200);
await p.evaluate(() => { const t = document.querySelector(".ig-sv-card textarea"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, "今天也辛苦了"); t.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(200);
await p.screenshot({ path: OUT + "/s3_up.png" });
await p.evaluate(() => document.querySelector(".ig-stn-post").click()); await sleep(600);
await p.evaluate(() => document.querySelector(".ig-st.me").click()); await sleep(800);
await p.screenshot({ path: OUT + "/s4_mine.png" });
await p.evaluate(() => document.querySelectorAll(".ig-sv-btns button")[1].click()); await sleep(400);
// 点 Instagram 退出
await p.evaluate(() => document.querySelector(".ig-wm").click()); await sleep(800);
console.log("ins still open:", await p.evaluate(() => !!document.querySelector(".ig-app")), "errs", errs);
await p.screenshot({ path: OUT + "/s5_out.png" });
await b.close();
