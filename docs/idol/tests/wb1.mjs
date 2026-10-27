// 世界书自动生成 + 用户身份只留一个
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(2000);
await p.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_user_identities_v1", value: JSON.stringify([{ id: "identity-1", name: "Flora", bio: "", gender: "女", age: "17", occupation: "", customSettings: "性格温和，说话带有一点理性逻辑。" }, { id: "identity-2", name: "匿名用户", bio: "神秘的过客。", gender: "保密", age: "未知", occupation: "自由职业者", customSettings: "说话简短，带有神秘色彩。" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1998-06-17", nationality: "中国", mbti: "INFP", looks: "圆眼睛", start: "2015-03-01", trainLength: "一年", family: "normal", familyCustom: "", familyNote: "", talents: ["vocal", "dance"], talentNote: "", weakness: "", other: "", signature: null, company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: new Date("2015-03-02T09:00:00").getTime(), facts: [], offers: [], offersMadeAt: 1, nodes: [] }) });
  st.put({ key: "idol_almanac_v1", value: JSON.stringify({ mine: [], world: { "2015-03": [{ id: "w1", date: "2015-03-20", title: "VANTA 回归", note: "夏季回归", kind: "world", company: "JYP" }, { id: "w2", date: "2015-03-28", title: "年度音乐颁奖礼", kind: "world" }] } }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2", timeout: 300000 }); await sleep(2500);
await p.evaluate(() => { const wc = window.__worldClock; wc.offset = new Date("2015-03-15T10:00:00").getTime() - wc.RealDate.now(); });
await p.evaluate(() => window.__idol?.run()); await sleep(2500);
const ids = await p.evaluate(() => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get("ai_phone_user_identities_v1"); g.onsuccess = () => res(g.result?.value); }; }));
console.log("identities", ids);
const wb = await p.evaluate(() => new Promise(res => { const r = indexedDB.open("AiPhoneSettingsDB"); r.onsuccess = () => { const g = r.result.transaction("worldBooks").objectStore("worldBooks").get("wb_idol_world_auto"); g.onsuccess = () => res(g.result); }; }));
console.log("worldbook:", wb?.name); for (const e of wb?.entries ?? []) console.log("==", e.comment, "\n" + e.content);
console.log("errs", errs.slice(0, 3));
await b.close();
