// 有人真的走了：想走涨到动摇（苗头、群里八卦）→ 涨到决定（私聊告诉她、约饭进待回复）→ 到日子退群、名片已离开；月末排名路人退群；假 AI
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
function reply(s) {
  if (s.includes("开始想离开公司了")) return JSON.stringify({ status: "最近总是一个人在练习室待到很晚", kakao: "…", rumor: "다은이 요즘 실장님이랑 자주 면담하더라\n（多恩最近老跟室长谈话）" });
  if (s.includes("决定离开公司了")) return JSON.stringify({ kind: "放弃", why: "脚伤反复，家里也一直劝她回去读书，她撑不下去了", to: "回釜山准备高考", status: "回釜山了，在准备高考", kakao: "새로운 시작" });
  if (s.includes("在 KakaoTalk") || s.includes("私聊")) return "其实……我下周就走了。先别跟别人说。";
  return "{}";
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) { const c = reply(r.postData() || ""); log.push(c.slice(0, 24)); r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) }); }
  else r.continue();
});
const kv = k => p.evaluate(k => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get(k); g.onsuccess = () => res(g.result?.value ? JSON.parse(g.result.value) : null); }; }), k);
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(4000);
const now = new Date().toISOString();
await p.evaluate(async (now) => {
  const mk = (id, name) => ({ id, name, avatar: null, persona: "", wechatID: id, tags: [], createdAt: now, updatedAt: now });
  const base = { layer: "main", group: "同期练习生", role: "同期练习生", age: "17", gender: "女", isIdol: false, publicLabels: [], publicText: "", face: "mixed", privateLines: ["练完舞会去便利店买香蕉牛奶"], speech: "", taboo: "", withYou: "", met: true, events: [], note: "", relation: "好朋友" };
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([mk("t1", "朴珍熙"), mk("c2", "申多恩")]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ t1: { ...base, charId: "t1", role: "练习生管理老师", group: "公司" }, c2: { ...base, charId: "c2", leave: { score: 5, log: [{ at: 1, d: 1, text: "脚踝旧伤又犯了" }], phase: "ok" } } }) });
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1998-06-17", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "三年", family: "normal", familyCustom: "", familyNote: "", talents: [], talentNote: "", weakness: "", other: "", signature: null, company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: new Date("2015-03-02T09:00:00").getTime(), roommates: ["c2"], facts: [], offers: [], offersMadeAt: 1, nodes: [] }) });
  await new Promise(r => tx.oncomplete = r);
}, now);
await p.reload({ waitUntil: "networkidle2" }); await sleep(5000);
const setT = iso => p.evaluate(iso => { const wc = window.__worldClock; wc.offset = new Date(iso).getTime() - wc.RealDate.now(); }, iso);
await setT("2015-06-01T10:00:00");
await p.evaluate(() => { const L = window.__idolLeave; L.dm("c2"); L.nudge("c2", 1.5, "月末评价排到第 38 名"); L.tick(); }); await sleep(2500);
let pp = await kv("idol_people_v1"); console.log("1 phase", pp.c2.leave.phase, pp.c2.leave.score, "| status", pp.c2.status?.text);
// 一周后又出事，涨到 9 以上
await setT("2015-06-09T10:00:00");
await p.evaluate(() => { const L = window.__idolLeave; L.nudge("c2", 2, "家里打电话让她回去读书"); L.nudge("c2", 1, "又被老师说了一顿"); L.tick(); }); await sleep(3000);
pp = await kv("idol_people_v1"); const dec = pp.c2.leave.decided; console.log("2 phase", pp.c2.leave.phase, "| why", dec?.why, "| leaveAt", dec && new Date(dec.leaveAt).toISOString());
let rem = await kv("idol_reminders_v1"); console.log("   outbox", (rem?.outbox ?? []).map(o => o.instruction.slice(0, 30)));
let car = await kv("idol_career_v1"); console.log("   invite", car.nodes.filter(n => n.status === "invite").map(n => `${n.title} ${new Date(n.dueAt).toISOString()}`));
// 到走的那天
await p.evaluate(at => { const wc = window.__worldClock; wc.offset = at + 3600e3 - wc.RealDate.now(); window.__idolLeave.tick(); }, dec.leaveAt); await sleep(1500);
pp = await kv("idol_people_v1"); car = await kv("idol_career_v1");
console.log("3 phase", pp.c2.leave.phase, "| role", pp.c2.role, "| group", pp.c2.group, "| roommates", car.roommates);
// 名片
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "contacts" }, "*")); await sleep(2500);
await sleep(4000); await p.evaluate(() => [...document.querySelectorAll(".ct-row")].find(x => x.textContent.includes("申多恩"))?.click()); await sleep(1200);
await p.screenshot({ path: OUT + "/lv_card.png" });
console.log("ai", log, "errs", errs);
await b.close();
