// ins：起账号 → 搜人关注/申请 → 过几小时通过 → 刷首页 → 发帖（风险灰字）→ 发快拍 → 私信「让他回」
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
function reply(s) {
  if (s.includes("起 ins 账号")) return JSON.stringify({ accounts: [{ name: "韩智元", handle: "jiwon.h", bio: "연습 중", private: true }, { name: "韩书俊", handle: "seojun_vtx", bio: "Vertex", private: false, alt: "sleepy__0901" }] });
  if (s.includes("ins 首页上的新内容")) return JSON.stringify({ posts: [{ handle: "seojun_vtx", at: "2015-03-28 19:00", imgs: [{ desc: "后台镜子前比耶", who: ["seojun_vtx"] }, { desc: "便当" }], cap: "오늘도 수고했어", capZh: "今天也辛苦了", likes: 48213, comments: [{ handle: "vex_lover", text: "오빠 사랑해", zh: "哥哥我爱你" }] }, { handle: "jiwon.h", at: "2015-03-28 22:10", imgs: [{ desc: "练习室地板上的旧舞鞋" }], cap: "", likes: 12, comments: [] }], stories: [{ handle: "jiwon.h", at: "2015-03-28 23:40", text: "还在练", img: "" }] });
  if (s.includes("她刚在 ins 上发了一条帖子")) return JSON.stringify({ likes: 9, likers: ["jiwon.h"], comments: [{ handle: "jiwon.h", text: "누구랑?", zh: "跟谁？" }], risk: { level: "mid", why: "看不到脸，但那块手表关注你的人可能认得", love: true } });
  if (s.includes("ins 私信")) return JSON.stringify({ lines: [{ text: "지난번 백댄서 너 맞지?", zh: "上次伴舞那个是你吧" }, { text: "中间那个" }] });
  if (s.includes("探索")) return JSON.stringify({ posts: [{ handle: "hongdae_daily", name: "弘大日常", img: "弘大街头有人在路演", cap: "주말", capZh: "周末", likes: 820 }, { handle: "cafe.seoul", name: "首尔咖啡", img: "咖啡拉花", cap: "", likes: 300 }, { handle: "lumina_official", name: "LUMINA", official: true, img: "五个人在练习室比心", cap: "D-7", likes: 52000 }] });
  return "{}";
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) { const c = reply(r.postData() || ""); log.push(c.slice(0, 20)); r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) }); }
  else r.continue();
});
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(4000);
await p.evaluate(async () => {
  const now = new Date().toISOString();
  const mk = (id, name) => ({ id, name, avatar: null, persona: "", wechatID: id, tags: [], createdAt: now, updatedAt: now });
  const base = { layer: "main", group: "", age: "18", publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "", met: true, events: [], note: "" };
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  for (const k of ["idol_ins_v1"]) st.delete(k);
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([mk("c1", "韩智元"), mk("c2", "韩书俊")]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ c1: { ...base, charId: "c1", role: "同期练习生", group: "同期练习生", isIdol: false, gender: "男", heart: "有好感", canCrush: true }, c2: { ...base, charId: "c2", role: "Vertex 成员，前辈", group: "前辈", isIdol: true, gender: "男" } }) });
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: ["vocal"], talentNote: "", weakness: "", other: "", signature: null, company: "BLUE", no: "x", createdAt: 1 }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => { const wc = window.__worldClock; wc.offset = new Date("2015-03-28T12:00:00").getTime() - wc.RealDate.now(); });
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
const open = () => p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "ins" }, "*"));
const clickText = (sel, t) => p.evaluate((sel, t) => { const el = [...document.querySelectorAll(sel)].find(x => x.textContent.trim() === t || x.textContent.includes(t)); if (el) { el.click(); return true; } return false; }, sel, t);
await open(); await sleep(3500);
await p.screenshot({ path: OUT + "/ig1_home.png" });
await p.evaluate(() => document.querySelectorAll(".ig-tabbar button")[1].click()); await sleep(2500);
await p.screenshot({ path: OUT + "/ig2_search.png" });
await p.type(".ig-sbar input", "韩"); await sleep(600);
await p.screenshot({ path: OUT + "/ig3_found.png" });
// 关注智元（锁着→申请）和书俊大号（公开→直接关注）
await p.evaluate(() => { for (const row of document.querySelectorAll(".ig-ac")) { const h = row.querySelector("b")?.textContent || ""; if (h.startsWith("jiwon.h") || h.startsWith("seojun_vtx")) row.querySelector(".ig-fb").click(); } }); await sleep(600);
await p.screenshot({ path: OUT + "/ig4_after.png" });
// 过 9 小时：申请通过，再打开刷首页
await p.evaluate(() => { const wc = window.__worldClock; wc.offset += 11 * 3600e3; }); await sleep(7000);
await p.evaluate(() => document.querySelectorAll(".ig-tabbar button")[0].click()); await sleep(500);
await p.evaluate(async () => { const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); }); const g = db.transaction("entries").objectStore("entries").get("idol_ins_v1"); const v = await new Promise(res => g.onsuccess = () => res(g.result?.value)); const s = JSON.parse(v); s.filledAt = 0; const tx = db.transaction("entries", "readwrite"); tx.objectStore("entries").put({ key: "idol_ins_v1", value: JSON.stringify(s) }); await new Promise(r => tx.oncomplete = r); });
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await open(); await sleep(4000);
await p.screenshot({ path: OUT + "/ig5_feed.png" });
// 发帖：写画面
await p.evaluate(() => document.querySelectorAll(".ig-tabbar button")[2].click()); await sleep(600);
await clickText(".ig-np-add button", "写画面"); await sleep(400);
await p.type(".ig-ta", "两只手隔着桌子各拿一杯冰美式，一只手戴着男士手表");
await clickText(".ig-link", "添加"); await sleep(400);
await p.type(".ig-cap", "今天的咖啡比平时甜");
await p.screenshot({ path: OUT + "/ig6_compose.png" });
await clickText(".ig-share", "分享"); await sleep(3500);
await p.screenshot({ path: OUT + "/ig7_posted.png" });
// 快拍
await p.evaluate(() => document.querySelector(".ig-st.me").click()); await sleep(500);
await p.type(".ig-st-text", "凌晨三点\n练习室只剩我一个");
await clickText(".ig-link", "发布"); await sleep(800);
await p.evaluate(() => { const wc = window.__worldClock; wc.offset += 14 * 3600e3; }); await sleep(1500);
await p.evaluate(() => document.querySelector(".ig-st.me").click()); await sleep(600);
await p.evaluate(() => document.querySelector(".ig-sv-seen")?.click()); await sleep(600);
await p.screenshot({ path: OUT + "/ig8_story.png" });
await p.evaluate(() => document.querySelector(".ig-seen .hd button")?.click()); await sleep(200);
await p.evaluate(() => document.querySelector(".ig-sv-h button")?.click()); await sleep(400);
// 私信书俊
await p.evaluate(() => document.querySelectorAll(".ig-tabbar button")[1].click()); await sleep(600);
await p.type(".ig-sbar input", "seojun"); await sleep(400);
await p.evaluate(() => document.querySelector(".ig-ac > div").click()); await sleep(800);
await clickText(".cp-instagram-profile-actions button", "发消息"); await sleep(600);
await p.type(".ig-inp input", "前辈好"); await p.keyboard.press("Enter"); await sleep(300);
await p.evaluate(() => document.querySelector(".ig-plus").click()); await sleep(400);
await p.screenshot({ path: OUT + "/ig9_panel.png" });
await clickText(".ig-panel button", "让他回"); await sleep(3000);
await p.screenshot({ path: OUT + "/ig10_chat.png" });
const kv = async k => p.evaluate(k => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get(k); g.onsuccess = () => res(g.result?.value); }; }), k);
const s = JSON.parse(await kv("idol_ins_v1"));
console.log("following", s.following.length, "requested", s.requested.length, "posts", s.posts.length, "risk", JSON.stringify(s.posts.find(x => x.by === "me")?.risk));
console.log(log, errs.slice(0, 5));
await b.close();
