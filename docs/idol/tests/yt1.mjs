// YouTube：首页自动刷一批 → 看自己出镜的视频（出镜行）→ 评论第一批、楼中楼、她评论 → 搜索团 → 频道订阅 → 订阅页；假 AI
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
function reply(s) {
  if (s.includes("YouTube 首页这段时间")) return JSON.stringify({ videos: [
    { channel: "LUMINA", channelKind: "group", company: "JYP", at: "2015-03-26 18:00", title: "[Choreography Video] LUMINA(루미나) 'Afterglow' Dance Practice", titleZh: "LUMINA《Afterglow》练习室舞蹈", kind: "练习室", dur: "3:41", img: "镜子墙前五个女生一字排开，最后一个八拍定格，有人笑出了声", views: 4120000, comments: [{ handle: "lumi_forever", text: "3:12 이 부분 미쳤다", zh: "3:12 这段疯了" }] },
    { channel: "JYP Entertainment", channelKind: "company", company: "JYP", at: "2015-03-27 12:00", title: "LUMINA 'Afterglow' M/V", titleZh: "LUMINA《Afterglow》MV", kind: "MV", dur: "3:29", img: "废弃游乐园，五个人坐在旋转木马上", views: 41080000, comments: [] },
    { channel: "NOVA", channelKind: "group", company: "Starship", at: "2015-03-25 20:00", title: "[NOVA-LOG] 컴백 전날 밤", titleZh: "回归前一晚", kind: "团综", dur: "18:02", img: "宿舍客厅，五个人抢一盒炸鸡", views: 960000, comments: [] } ],
    groups: [{ name: "NOVA", company: "Starship", kind: "男团", debut: 2013, members: ["道允", "珉浩"] }] });
  if (s.includes("YouTube 频道的页面")) return JSON.stringify({ desc: "LUMINA 공식 유튜브 채널입니다.", descZh: "LUMINA 官方 YouTube 频道。", subs: 5300000, videos: [{ at: "2015-02-01 18:00", title: "LUMINA 'Spark' M/V", titleZh: "LUMINA《Spark》MV", kind: "MV", dur: "3:15", img: "雨夜天台，五个人撑着透明伞", views: 62000000 }] });
  if (s.includes("某条评论下面的回复")) return JSON.stringify({ comments: [{ handle: "jyp_trainee_watch", text: "중국인 연습생이래요 작년에 들어왔대", zh: "听说是中国练习生，去年进来的", likes: 40 }, { handle: "用户-晚风", text: "真的吗！！那我先关注一下", likes: 12 }] });
  if (s.includes("评论区新冒出来的评论")) return JSON.stringify({ comments: [
    { handle: "luminarchive", text: "왼쪽에서 두 번째 연습생 누구예요?? 이름 좀 알려주세요 ㅠㅠ", zh: "左边第二个练习生是谁？？求名字呜呜", likes: 412 },
    { handle: "seoul_daydream", text: "1:52 the girl second from left is SO precise", zh: "1:52 左二那个女生也太利落了", likes: 186 },
    { handle: "m00n_sleeper", text: "2:31 넘어질 뻔했는데 끝까지 안 멈췄네", zh: "2:31 差点摔了，还是跳完了", likes: 4, char: "韩智元" } ] });
  return "{}";
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) { const c = reply(r.postData() || ""); log.push(c.slice(0, 30)); r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) }); }
  else r.continue();
});
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(4000);
await p.evaluate(async () => {
  const now = new Date().toISOString();
  const mk = (id, name) => ({ id, name, avatar: null, persona: "", wechatID: id, tags: [], createdAt: now, updatedAt: now });
  const base = { layer: "main", group: "", age: "18", publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "", met: true, events: [], note: "" };
  const t = new Date("2015-03-28T12:00:00").getTime();
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([mk("c1", "韩智元"), mk("c2", "金智妍")]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ c1: { ...base, charId: "c1", role: "同期练习生", isIdol: false }, c2: { ...base, charId: "c2", role: "同期练习生", isIdol: false } }) });
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: [], talentNote: "", weakness: "", other: "", signature: null, company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: t - 90 * 864e5, facts: [], offers: [], nodes: [] }) });
  st.put({ key: "idol_groups_v1", value: JSON.stringify({ lumina: { name: "LUMINA", companyId: "jyp", kind: "女团", debut: 2013, members: ["瑞拉", "夏恩", "智秀", "妍熙", "宥娜"], from: "site", at: 1 } }) });
  st.put({ key: "idol_youtube_v1", value: JSON.stringify({ channels: {}, videos: [], subs: [], me: { handle: "blue_hour_04" } }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => { const wc = window.__worldClock; wc.offset = new Date("2015-03-28T12:00:00").getTime() - wc.RealDate.now(); });
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
// 直接写一条她出镜的视频到 kv（等同 recordSceneVideo 的结果）
await p.evaluate(async () => {
  const t = Date.now();
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "idol_youtube_v1", value: JSON.stringify({ channels: { co_jyp: { id: "co_jyp", name: "JYP Entertainment", handle: "@JYPEntertainment", kind: "company", companyId: "jyp", subs: 28000000 } }, subs: [], me: { handle: "blue_hour_04" },
    videos: [{ id: "v_me", ch: "co_jyp", title: "[JYP TRAINEE] 연습생 커버 댄스 #3 | LUMINA 'Spark'", titleZh: "练习生翻跳第三期｜LUMINA《Spark》", kind: "练习生", at: t - 2 * 864e5, dur: "2:58",
      img: { desc: "Flora 站在左二，旁边是金智妍和韩智元，四个人穿同款白 T 翻跳 LUMINA 的《Spark》" }, cast: [{ pos: "左一", name: "朴书雅" }, { pos: "左二", name: "你", me: true }, { pos: "右二", name: "金智妍", charId: "c2" }, { pos: "右一", name: "韩智元", charId: "c1" }],
      target: 15000, likes: 800, cmts: [], mine: true, announced: true }] }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => { const wc = window.__worldClock; wc.offset = new Date("2015-03-28T12:00:00").getTime() - wc.RealDate.now(); });
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "youtube" }, "*")); await sleep(3500);
await p.screenshot({ path: OUT + "/y1_home.png" });
// 看自己的视频
await p.evaluate(() => [...document.querySelectorAll(".yt-card")].find(x => x.textContent.includes("TRAINEE"))?.click()); await sleep(800);
await p.screenshot({ path: OUT + "/y2_watch.png" });
await p.evaluate(() => document.querySelector(".yt-cbox").click()); await sleep(1500);
await p.screenshot({ path: OUT + "/y3_cmts.png" });
await p.evaluate(() => [...document.querySelectorAll(".yt-cm .yt-more")][0]?.click()); await sleep(1500);
await p.evaluate(() => { const i = document.querySelector(".yt-input input"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "跳得好整齐！"); i.dispatchEvent(new Event("input", { bubbles: true })); });
await p.evaluate(() => document.querySelector(".yt-send").click()); await sleep(500);
await p.screenshot({ path: OUT + "/y4_replies.png" });
await p.evaluate(() => document.querySelector(".yt-sh-h button").click()); await sleep(300);
// 点画面
await p.evaluate(() => document.querySelector(".yt-player").click()); await sleep(400);
await p.screenshot({ path: OUT + "/y5_viewer.png" });
await p.evaluate(() => document.querySelector(".yt-iv-top button").click()); await sleep(300);
await p.evaluate(() => document.querySelector(".yt-pback").click()); await sleep(400);
// 搜索
await p.evaluate(() => document.querySelector(".yt-top > button:last-child").click()); await sleep(400);
await p.type(".yt-sbar input", "lumi"); await p.keyboard.press("Enter"); await sleep(500);
await p.screenshot({ path: OUT + "/y6_search.png" });
await p.evaluate(() => document.querySelector(".yt-chrow").click()); await sleep(2000);
await p.evaluate(() => document.querySelector(".yt-wide").click()); await sleep(300);
await p.screenshot({ path: OUT + "/y7_channel.png" });
await p.evaluate(() => document.querySelector(".yt-bar button").click()); await sleep(400);
await p.evaluate(() => document.querySelectorAll(".yt-tab button")[3].click()); await sleep(500);
await p.screenshot({ path: OUT + "/y8_subs.png" });
await p.evaluate(() => document.querySelectorAll(".yt-tab button")[4].click()); await sleep(500);
await p.evaluate(() => [...document.querySelectorAll(".yt-pill")].find(x => x.textContent.includes("换头像")).click()); await sleep(400);
await p.screenshot({ path: OUT + "/y9_me.png" });
console.log("ai calls", log, "errs", errs);
await b.close();
