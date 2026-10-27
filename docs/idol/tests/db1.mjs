// 出道整条线：选拔 → 名单 d1 → 定位群 d2 → 队名 d3 → D-30 锁屏 d4 → 出道当天 d5；日历大事记 + 帮我排这周
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (/idol-debut|idol-calendar/.test(m.text())) console.log("CONSOLE", m.text().slice(0, 300)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const asked = [];
function reply(s) {
  if (s.includes("定「新女团出道组」的设定")) return JSON.stringify({
    members: [
      { name: "Flora", ko: "플로라", nation: "中国", positions: [{ zh: "主唱", ko: "메인보컬" }] },
      { name: "申多恩", ko: "신다은", nation: "韩国", positions: [{ zh: "队长", ko: "리더" }, { zh: "领舞", ko: "리드댄서" }] },
      { name: "李瑞妍", ko: "이서연", nation: "韩国", positions: [{ zh: "主舞", ko: "메인댄서" }, { zh: "Rapper", ko: "래퍼" }] },
      { name: "中村美咲", ko: "나카무라 미사키", nation: "日本", positions: [{ zh: "副唱", ko: "서브보컬" }, { zh: "门面", ko: "비주얼" }] },
      { name: "林夏琳", ko: "임하린", nation: "美国", positions: [{ zh: "副唱", ko: "서브보컬" }, { zh: "忙内", ko: "막내" }] },
    ],
    team: { en: "Lumina", ko: "루미나", meaning: "拉丁语里「光」的意思。做彼此的光，也做别人的光。", meaningKo: "서로의 빛이 되고, 누군가의 빛이 되기를" },
    song: "First Light（第一道光）",
    teacherMsg: "恭喜你，进出道组了。名单发你，先别往外说哦。",
    managerMsg: "各位好，我是以后负责你们的经纪人崔振宇。今天开会定下来的位置发在下面，有疑问私下找我。",
    d2React: [{ who: "申多恩", text: "队长……我？？😳" }, { who: "林夏琳", text: "欧尼们以后请多关照🙇‍♀️" }],
    d3Msg: "队名定下来了，以后我们就是 LUMINA。", d3React: [{ who: "李瑞妍", text: "好好听！！" }, { who: "中村美咲", text: "光……好喜欢🥹" }],
    ddayGroup: { who: "申多恩", text: "大家醒了没！！今天是我们的日子了😭😭" },
    momMsg: "宝贝今天出道快乐！！妈妈和爸爸晚上守着电视看 ❤️",
    news: { title: "JYP 新女团 LUMINA 今日正式出道", text: "五人女团 LUMINA 今天下午 6 点发行出道曲，晚上举行出道 Showcase。" },
  });
  if (s.includes("新女团（") && s.includes("经纪人")) return JSON.stringify({ name: "崔振宇", gender: "男", birthday: "05-03", role: "新女团经纪人", group: "公司", age: "31", isIdol: false, privateLines: ["说话很快", "车里永远放着能量饮料"], speech: "干脆", taboo: "" });
  if (s.includes("一起进了新女团出道组")) return JSON.stringify({ name: "林夏琳", gender: "女", birthday: "01-25", role: "同期女练习生", group: "同期练习生", age: "16", isIdol: false, privateLines: ["英语比韩语好"], speech: "软软的", taboo: "" });
  if (s.includes("发日程通知")) return "明天的事别迟到，提前到。";
  if (s.includes("圈内大事记")) return JSON.stringify({ items: [{ day: 3, title: "VANTA 回归", note: "同公司前辈团的夏季回归" }, { day: 12, title: "AURORA 首尔演唱会", note: "" }, { day: 20, title: "《周末偶像》播出", note: "前辈上综艺" }] });
  if (s.includes("排这一周空着的时间")) {
    const m = s.match(/这周：(\d{4}-\d{2}-\d{2})/); const d0 = new Date(m[1] + "T00:00:00");
    const iso = k => { const d = new Date(d0.getTime() + k * 864e5); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    return [`${iso(0)}|周一|07:30|08:30|宿舍楼下|🏃|晨跑`, `${iso(0)}|周一|20:00|22:00|B2 练习室|💃|加练出道曲副歌`, `${iso(1)}|周二|19:00|20:00|便利店|🛒|买洗发水和面膜`, `${iso(2)}|周三|21:00|22:30|宿舍|🎧|看前辈打歌舞台`, `${iso(5)}|周六|14:00|17:00|弘大|🛍️|跟室友逛街`].join("\n");
  }
  if (s.includes("帮一个韩国公司的练习生")) return JSON.stringify({ title: "第一次录音", note: "在录音室里待了四个小时" });
  return "好的～";
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) { const c = reply(r.postData() || ""); asked.push(c.slice(0, 24)); r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) }); }
  else r.continue();
});
const kv = k => p.evaluate(k => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get(k); g.onsuccess = () => res(g.result?.value); }; }), k);
const setWorld = iso => p.evaluate(iso => { const wc = window.__worldClock; const t = new Date(iso).getTime(); wc.offset = t - wc.RealDate.now(); }, iso);
const unlock = async () => { await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(700); };
const tick = async () => { await p.evaluate(() => window.__idol?.run()); };
const career = async () => JSON.parse(await kv("idol_career_v1") || "null");
const saveImgs = async (prefix) => {
  const srcs = await p.evaluate(() => [...document.querySelectorAll("img")].map(i => i.src).filter(s => s.startsWith("data:image/jpeg") && s.length > 20000));
  srcs.forEach((s, i) => fs.writeFileSync(`${OUT}/${prefix}_${i}.jpg`, Buffer.from(s.split(",")[1], "base64")));
  return srcs.length;
};
const openChat = async (name) => {
  await p.reload({ waitUntil: "networkidle2", timeout: 300000 }); await sleep(2000);
  await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
  await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "chat" }, "*")); await sleep(2500);
  const box = await p.evaluate(name => { const el = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && e.textContent.trim().startsWith(name) && e.getBoundingClientRect().top > 300); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, name);
  if (box) await p.mouse.click(box.x, box.y);
  await sleep(3000); return Boolean(box);
};

await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(2000);
await p.evaluate(async () => {
  const now = new Date().toISOString();
  const mk = (id, name) => ({ id, name, avatar: null, persona: "", wechatID: id + "_k", tags: [], createdAt: now, updatedAt: now });
  const base = { layer: "main", group: "同期练习生", role: "同期练习生", age: "17", gender: "女", isIdol: false, publicLabels: [], publicText: "", face: "mixed", privateLines: ["爱笑"], speech: "", taboo: "", withYou: "", met: true, events: [], note: "", relation: "朋友" };
  const db = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([mk("t1", "朴珍熙"), mk("c2", "申多恩"), mk("c3", "李瑞妍"), mk("c4", "中村美咲")]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ t1: { ...base, charId: "t1", role: "练习生管理老师", group: "公司", age: "34", relation: "认识" }, c2: { ...base, charId: "c2", age: "18", birthday: "03-21" }, c3: { ...base, charId: "c3", age: "18", birthday: "11-08" }, c4: { ...base, charId: "c4", birthday: "09-02" } }) });
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m", enableImageRecognition: false, enableImageGeneration: false }]) });
  st.put({ key: "ai_phone_user_identities_v1", value: JSON.stringify([{ id: "identity-1", name: "Flora", bio: "", gender: "女", age: "17", occupation: "", customSettings: "" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1998-06-17", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "半年", family: "normal", familyCustom: "", familyNote: "", talents: ["vocal"], talentNote: "", weakness: "", other: "", signature: null, company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_kakao_v1", value: JSON.stringify({ incoming: [], noticed: [], teacherId: "t1" }) });
  st.put({ key: "idol_ledger_v1", value: JSON.stringify({ entries: [], levels: { c2: 70, c3: 66, c4: 60 }, months: [{ month: "2015-05", rank: 4, total: 40, rows: [], image: "", comment: "", nodeId: "x", at: 1 }], ranked: [] }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: new Date("2015-03-02T09:00:00").getTime(), facts: [], offers: [], offersMadeAt: 1, nodes: [] }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2", timeout: 300000 }); await sleep(2500);
await setWorld("2015-03-10T10:00:00"); await unlock(); await tick(); await sleep(1500);
let c = await career();
const sel = c.nodes.find(n => n.kind === "selection");
console.log("debut init", c.debut?.codename, new Date(c.debut?.targetAt).toLocaleDateString(), "selection", new Date(sel.dueAt).toLocaleString());

// 选拔：打勾
await setWorld(new Date(sel.dueAt + 30 * 60e3).toISOString());
await p.evaluate(id => window.__idol.checkNode(id, "发挥得很好，评委说很惊艳"), sel.id); await sleep(4000);
c = await career();
console.log("after selection", c.debut?.status, c.debut?.members?.map(m => m.name + ":" + m.positions.map(x => x.zh).join("/") + ":" + m.birthday + ":" + m.nation).join(" | "));
console.log("debut nodes", c.nodes.filter(n => n.kind === "debut").map(n => n.title + " " + new Date(n.dueAt).toLocaleString()).join(" ; "));

// d1：第二天上午老师私聊发名单
await setWorld(new Date(c.debut.steps[0].at + 60e3).toISOString()); await tick(); await sleep(3000);
await p.screenshot({ path: OUT + "/db_banner.png" });
await openChat("朴珍熙"); await sleep(1500);
await p.screenshot({ path: OUT + "/db_d1_chat.png" });
console.log("d1 imgs", await saveImgs("db_d1"));

// d2：五天后拉群
await setWorld(new Date(c.debut.steps[1].at + 60e3).toISOString()); await tick(); await sleep(5000);
await openChat("PROJECT"); await sleep(1500);
await p.screenshot({ path: OUT + "/db_d2_chat.png" });
console.log("d2 imgs", await saveImgs("db_d2"));

// d3：队名公布那项打勾
c = await career();
const nameNode = c.nodes.find(n => n.step === "name");
await setWorld(new Date(nameNode.dueAt + 30 * 60e3).toISOString());
await p.evaluate(id => window.__idol.checkNode(id, ""), nameNode.id); await sleep(3000);
await openChat("LUMINA"); await sleep(1500);
await p.screenshot({ path: OUT + "/db_d3_chat.png" });
console.log("d3 imgs", await saveImgs("db_d3"));

// d4：出道前 30 天早上锁屏
c = await career();
const d30 = new Date(c.debut.debutAt - 30 * 864e5); d30.setHours(7, 12, 0, 0);
await setWorld(d30.toISOString());
await p.evaluate(() => window.dispatchEvent(new Event("idol-lock-now"))); await sleep(1500);
await p.screenshot({ path: OUT + "/db_d4_lock.png" });

// d5：出道当天
await unlock();
const dd = new Date(c.debut.debutAt); dd.setHours(6, 31, 0, 0);
await setWorld(dd.toISOString()); await tick(); await sleep(2500);
await p.screenshot({ path: OUT + "/db_d5_lock.png" });
c = await career(); console.log("stage", c.stage, c.debut.status);

// 日历
await unlock();
await setWorld(new Date(nameNode.dueAt - 3 * 864e5).toISOString());
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "calendar" }, "*")); await sleep(4000);
await p.screenshot({ path: OUT + "/db_cal_month.png" });
await p.evaluate(() => [...document.querySelectorAll(".idol-cal-bar button")][0].click()); await sleep(800);
await p.screenshot({ path: OUT + "/db_cal_almanac.png" });
await p.evaluate(() => document.querySelector(".calendar-edit-modal-overlay").click()); await sleep(400);
await p.evaluate(() => [...document.querySelectorAll(".idol-cal-bar button")][1].click()); await sleep(600);
await p.screenshot({ path: OUT + "/db_cal_plan.png" });
await p.evaluate(() => [...document.querySelectorAll(".idol-cal-actions button")].find(x => x.textContent === "排").click()); await sleep(2500);
await p.evaluate(() => { const t = [...document.querySelectorAll('.calendar-month-cell')].find(x => x.getAttribute("aria-label")?.startsWith("7月13日")); t?.click(); }); await sleep(1500);
await p.screenshot({ path: OUT + "/db_cal_detail.png" });
{ const cal = JSON.parse(await kv("ai_phone_calendar_plans_v1") || "null"); const all = JSON.stringify(cal); console.log("plan items", (all.match(/"id":"plan_/g) || []).length, "notice", await p.evaluate(() => document.body.innerText.match(/排好了[^\n]*|AI[^\n]*看不懂[^\n]*/)?.[0])); }
console.log("asked", asked.join(" / "));
console.log("errs", errs.slice(0, 5));
await b.close();
