// 截查手机里的 ins 长什么样（塞假快照）
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(2000);
await p.evaluate(async () => {
  const now = new Date().toISOString();
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([{ id: "c9", name: "韩智元", avatar: null, persona: "", wechatID: "jiwon", tags: [], createdAt: now, updatedAt: now }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: [], talentNote: "", weakness: "", other: "", signature: null, company: "", no: "x", createdAt: 1 }) });
  await new Promise(r => tx.oncomplete = r);
  const cdb = await new Promise(res => { const r = indexedDB.open("AiPhoneCheckPhoneDB"); r.onsuccess = () => res(r.result); });
  const t2 = cdb.transaction("snapshots", "readwrite");
  const post = (id, icon, desc, cap, likes, cm) => ({ id, coverIcon: icon, imageDescription: desc, createdAt: new Date(Date.now() - likes * 3600e3).toISOString(), location: "Seoul", caption: cap, likeCount: likes * 7, commentCount: cm.length, shareCount: 3, comments: cm.map((t, i) => ({ id: id + i, authorName: ["dawn_0712", "yuna.k", "minjun__"][i % 3], text: t, createdAt: now, likeCount: 2 })) });
  t2.objectStore("snapshots").put({ id: "c9:instagram", characterId: "c9", appId: "instagram", generatedAt: now, updatedAt: now, payload: {
    headerTitle: "jiwon.h", headerSubtitle: "Instagram",
    profile: { name: "韩智元", username: "jiwon.h", bio: "練習中 🎧\n今天也是汗湿的一天", followingCount: 88, followerCount: 132 },
    highlights: [{ id: "h1", title: "练习室", coverIcon: "🎧", description: "凌晨三点的练习室" }, { id: "h2", title: "宿舍", coverIcon: "🛏️", description: "室友的泡面" }, { id: "h3", title: "首尔", coverIcon: "🌃", description: "汉江" }],
    posts: [post("p1", "🌃", "汉江夜景，路灯倒在水里", "今天跑完步 坐了一会儿", 5, ["好美！", "下次叫我", "又一个人跑步"]), post("p2", "🎧", "练习室镜子里的背影", "月考前一周", 20, ["加油加油", "我们组也在通宵"]), post("p3", "🍜", "便利店泡面和三角饭团", "夜宵", 40, ["又是这个"]), post("p4", "☕", "咖啡和乐谱", "", 60, []), post("p5", "🌸", "樱花", "春天", 80, []), post("p6", "📸", "四人合照", "同期", 100, ["我闭眼了"])] } });
  await new Promise(r => t2.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "checkphone" }, "*")); await sleep(2500);
await p.screenshot({ path: OUT + "/ig0_a.png" });
const clickText = t => p.evaluate(t => { const el = [...document.querySelectorAll("button,div,span")].filter(x => x.children.length < 4 && x.textContent.trim() === t)[0]; el?.click(); return !!el; }, t);
console.log(await clickText("韩智元")); await sleep(2000);
await p.screenshot({ path: OUT + "/ig0_b.png" });
console.log(await clickText("Instagram")); await sleep(2500);
await p.screenshot({ path: OUT + "/ig0_c.png" });
await p.evaluate(() => document.querySelector(".cp-instagram-tile")?.click()); await sleep(1200);
await p.screenshot({ path: OUT + "/ig0_d.png" });
await b.close();
