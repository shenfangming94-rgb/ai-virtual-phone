// 平常日子有人来找你：新的一天排一两个时间 → 到点挑一个好友发消息（看给 AI 的话）；跳几天后落地不久就来；假 AI
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const asks = [];
function reply(s) { if (s.includes("平常的一天")) { asks.push(JSON.parse(s).messages.at(-1).content); return "腿还酸吗\n我今天差点在练习室睡着"; } return "{}"; }
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) { const c = reply(r.postData() || ""); r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) }); }
  else r.continue();
});
const kv = k => p.evaluate(k => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get(k); g.onsuccess = () => res(g.result?.value ? JSON.parse(g.result.value) : null); }; }), k);
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(4000);
await p.evaluate(async (now) => {
  const mk = (id, name) => ({ id, name, avatar: null, persona: "", wechatID: id, tags: [], createdAt: now, updatedAt: now });
  const base = { layer: "main", group: "同期练习生", role: "同期练习生", age: "17", gender: "女", isIdol: false, publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "", met: true, events: [], note: "" };
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  for (const k of ["idol_casual_v1", "idol_reminders_v1"]) st.delete(k);
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([mk("c2", "申多恩"), mk("c3", "李瑞妍")]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ c2: { ...base, charId: "c2", relation: "好朋友", birthday: "06-07", status: { text: "在准备月考的独舞", kakao: "", at: 1 }, events: [{ id: "e1", at: new Date("2015-06-01T22:00:00").getTime(), place: "练习室", text: "和她一起练舞练到半夜" }] }, c3: { ...base, charId: "c3", relation: "熟人" } }) });
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1998-06-17", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "三年", family: "normal", familyCustom: "", familyNote: "", talents: [], talentNote: "", weakness: "", other: "", signature: null, company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: 1, facts: [], offers: [], offersMadeAt: 1, nodes: [{ id: "n1", kind: "monthly", title: "6月月考", place: "", premise: "", dueAt: new Date("2015-06-05T14:00:00").getTime(), status: "pending" }] }) });
  await new Promise(r => tx.oncomplete = r);
}, new Date().toISOString());
await p.reload({ waitUntil: "networkidle2" }); await sleep(4000);
await p.evaluate(() => { window.__idolLeave.dm("c2"); window.__idolLeave.dm("c3"); }); await sleep(1000);
const setT = iso => p.evaluate(iso => { const wc = window.__worldClock; wc.offset = new Date(iso).getTime() - wc.RealDate.now(); window.__idolLeave.casual(); }, iso);
await setT("2015-06-02T08:00:00"); await sleep(500);
let s = await kv("idol_casual_v1"); console.log("day1 slots", s.slots.map(x => new Date(x).toLocaleTimeString()));
for (const at of s.slots) { await p.evaluate(at => { const wc = window.__worldClock; wc.offset = at + 60e3 - wc.RealDate.now(); window.__idolLeave.casual(); }, at); await sleep(7000); }
// 跳 3 天
await setT("2015-06-05T09:00:00"); await sleep(500);
s = await kv("idol_casual_v1"); console.log("after jump slots", s.slots.map(x => new Date(x).toLocaleString()), "gap", s.gap);
if (s.slots[0]) { await p.evaluate(at => { const wc = window.__worldClock; wc.offset = at + 60e3 - wc.RealDate.now(); window.__idolLeave.casual(); }, s.slots[0]); await sleep(7000); }
console.log("asks:\n" + asks.map(a => "----\n" + a).join("\n"));
console.log("errs", errs);
await b.close();
