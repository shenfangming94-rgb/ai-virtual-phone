import puppeteer from "puppeteer-core";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-ma1dbg-${Date.now()}`, protocolTimeout: 300000 });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const consoleErrs = [];
p.on("console", m => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 250)); });
const setClock = async (target) => {
  await p.evaluate(world => {
    const wc = window.__worldClock;
    if (wc) { wc.frozen = null; wc.offset = world - wc.RealDate.now(); }
    const offset = wc ? wc.offset : world - Date.now();
    localStorage.setItem("idol_world_clock_v1", JSON.stringify({ real: false, offset, world }));
  }, target);
};
const kvGet = async (key) => p.evaluate(async k => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readonly"); const st = tx.objectStore("entries");
  return await new Promise(res => { const q = st.get(k); q.onsuccess = () => res(q.result?.value ?? null); });
}, key);
const kvPut = async (key, value) => p.evaluate(async (k, v) => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: k, value: JSON.stringify(v) });
  await new Promise(res => tx.oncomplete = res);
}, key, value);
const year = new Date().getFullYear();
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__idolTest, { timeout: 240000, polling: 1000 });
const signedAt = new Date(year, 6, 1, 9, 0, 0).getTime();
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await setClock(new Date(year, 6, 25, 10, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" });
await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 300 });
console.log("roster before:", (await kvGet("idol_roster_v1")) ? "有" : "无");
for (let j = 0; j < 10; j++) {
  const rr = await p.evaluate(() => { try { window.__idolNew?.rosterTick?.(); return "ok"; } catch (e) { return "throw: " + e.message; } });
  await sleep(800);
  if (await kvGet("idol_roster_v1")) { console.log(`rosterTick 第${j + 1}次后生成(${rr})`); break; }
}
console.log("roster after:", (await kvGet("idol_roster_v1")) ? "有" : "无");
for (let i = 0; i < 6; i++) {
  const r = await p.evaluate(() => { try { window.__idolNew?.mainlineTick?.(); return "ok"; } catch (e) { return "throw: " + e.message; } });
  await sleep(600);
  const ml = await kvGet("idol_mainline_v1");
  const c = JSON.parse(await kvGet("idol_career_v1") ?? "{}");
  console.log(`tick${i} ${r} | ml=${ml ? "有" : "无"} | mainline nodes=${c.nodes.filter(n => n.occasion === "mainline").length}`);
}
console.log("errors:", JSON.stringify(consoleErrs.slice(0, 5)));
await b.close();
