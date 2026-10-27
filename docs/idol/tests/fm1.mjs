// 关注度：名片上的证 + 点开详情
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(1500);
await p.evaluate(async () => {
  const D = 864e5, t0 = new Date("2015-03-28T21:00:00").getTime();
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: ["vocal"], talentNote: "", weakness: "", other: "", signature: null, company: "BLUE", no: "2015-0312", createdAt: 1 }) });
  st.put({ key: "idol_fame_v1", value: JSON.stringify({ pop: 7, heat: 10, at: t0, log: [
    { at: t0 - 27 * D, text: "开局 · 普通家庭", size: "start", pop: 5, heat: 0 },
    { at: t0 - 8 * D, text: "公司频道上传了练习生舞蹈视频", size: "medium", pop: 1, heat: 5 },
    { at: t0 - 14 * D, until: t0 - 7 * D, text: "热度慢慢退了", size: "cool", pop: 0, heat: -3 },
    { at: t0 - 1 * D, text: "伴舞视频被转了几百次", size: "medium", pop: 1, heat: 5 },
  ] }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => { const wc = window.__worldClock; wc.offset = new Date("2015-03-28T21:30:00").getTime() - wc.RealDate.now(); });
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "contacts" }, "*")); await sleep(2000);
await p.evaluate(() => document.querySelector(".ct-me")?.click()); await sleep(1500);
await p.evaluate(() => document.querySelector(".fm-id")?.scrollIntoView({ block: "center" })); await sleep(500);
await p.screenshot({ path: OUT + "/fm1.png" });
await p.evaluate(() => document.querySelector(".fm-id")?.click()); await sleep(1000);
await p.screenshot({ path: OUT + "/fm2.png" });
console.log(errs.slice(0, 3));
await b.close();
