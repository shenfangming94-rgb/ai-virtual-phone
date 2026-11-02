/**
 * 世界上正在发生的事（淡粉「!」）+ 日历活动上地图（独立浏览器存档，假 AI）
 * 验：发动机读日历活动 → 长出一件现场 → 地图挂淡粉「!」和活动粉字 → 撞在一起弹二选一 → 选「那边好像有事」开场用那件事
 * 跑法：node docs/idol/tests/hap1.mjs /tmp/hap   前提：dev 服务在跑（默认 3001）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, x === "" ? "" : JSON.stringify(x).slice(0, 300)); } };
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-hap-${Date.now()}` });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
let planReq = "";
const SEED = "观众席入场口排着长队，两个站姐为了前排位置吵起来，旁边的 staff 拿着对讲机满头大汗。";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (!r.url().includes("mock.test")) { r.continue(); return; }
  const s = r.postData() || "";
  let c = "嗯嗯";
  if (s.includes("排接下来几天")) { planReq = s; c = JSON.stringify({ events: [], newPeople: [], status: [], posts: [], scene: { at: "2015-03-04 11:00", place: "场馆·观众席", about: "NMIXX 演唱会入场时两个站姐为了前排吵起来", seed: SEED, from: "NMIXX 演唱会" } }); }
  else if (s.includes("命运里的八个彩蛋")) c = JSON.stringify({ cards: [] });
  else if (s.includes("配地点")) { globalThis.fillReq = s; c = JSON.stringify({ places: { "4": "弘大", "3": "" } }); }
  r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) });
});
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 }); await sleep(1500);
// 等页面把数据库建好（新开的服务第一次编译慢）
await p.waitForFunction(() => window.__worldClock && window.__idolTest, { timeout: 240000, polling: 1000 }); await sleep(2000);
await p.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: "[]" });
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m", enableImageRecognition: false, enableImageGeneration: false }]) });
  st.put({ key: "ai_phone_user_identities_v1", value: JSON.stringify([{ id: "identity-1", name: "金智允", bio: "", gender: "女", age: "16", occupation: "", customSettings: "" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "金智允", photo: null, birthday: "2001-04-16", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: ["vocal"], talentNote: "", weakness: "", other: "", signature: null, company: "JYP", no: "x", createdAt: 1 }) });
  const t0 = new Date("2015-03-01T09:00:00").getTime();
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: t0, facts: [], offers: [], offersMadeAt: 1, nodes: [{ id: "n1", kind: "first_day", title: "进公司第一天", place: "JYP 公司大楼", premise: "", dueAt: t0 + 86400000, status: "done", companyId: "jyp", remindedEve: true, remindedDue: true },
    // 远的月考故意存在前面：发动机要拿到的是最近的周评
    { id: "n9", kind: "monthly", title: "九月月考", place: "公司·练习室", premise: "", dueAt: new Date("2015-09-28T15:00:00").getTime(), status: "pending", companyId: "jyp" },
    { id: "n2", kind: "weekly", title: "周评", place: "公司·练习室", premise: "", dueAt: new Date("2015-03-06T17:00:00").getTime(), status: "pending", companyId: "jyp" }] }) });
  st.put({ key: "idol_almanac_v1", value: JSON.stringify({ mine: [], world: { "2015-03": [
    { id: "w1", date: "2015-03-04", title: "NMIXX 首尔演唱会", note: "巡演首站", kind: "world", place: "场馆·观众席" },
    { id: "w2", date: "2015-03-04", title: "TWICE 明洞签售", kind: "world", place: "明洞" },
    { id: "w3", date: "2015-03-12", title: "某团回归 MV 公开", kind: "world" },
    { id: "w4", date: "2015-03-04", title: "ITZY 弘大校庆舞台", kind: "world" },
  ] } }) });
  st.put({ key: "idol_destiny_v1", value: JSON.stringify({ cards: [] }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.evaluate(() => { const wc = window.__worldClock; const t = new Date("2015-03-04T10:00:00").getTime(); wc.offset = t - wc.RealDate.now(); localStorage.setItem("idol_world_clock_v1", JSON.stringify({ real: false, offset: wc.offset, world: t })); });
await p.reload({ waitUntil: "networkidle2", timeout: 300000 }); await sleep(12000);
const kv = k => p.evaluate(k => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get(k); g.onsuccess = () => res(g.result?.value); }; }), k);

console.log("[1] 发动机读日历、长出现场");
ok(planReq.includes("【日历上的圈内活动】") && planReq.includes("NMIXX 首尔演唱会"), "排事情时带上了日历活动");
ok(planReq.includes("可以写一件 scene"), "这次允许写现场");
const sched = planReq.match(/【接下来的日程】\d[^【]*/)?.[0] ?? "";
ok(sched.startsWith("【接下来的日程】3月6日") && !sched.includes("9月"), "日程按日期排，最近的在前，远的九月不混进来", sched);
ok(planReq.includes("你不要在群里或私聊发日程通知"), "发动机不发日程通知");
ok(planReq.includes("不写成 invite"), "行政事务不写成 invite 的规矩在");
const ev = JSON.parse(await kv("idol_events_v1") || "null");
ok(ev?.happenings?.length === 1 && ev.happenings[0].place === "场馆·观众席", "现场存下来了", ev?.happenings);

console.log("[2] 地图");
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(1000);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(4000);
const pins = await p.evaluate(() => [...document.querySelectorAll(".stg-mpin, .stg-card")].map(x => ({ t: x.querySelector("b,.stg-card-name")?.textContent, d: x.getAttribute("data-destiny"), a: x.querySelector("u,.stg-card-act")?.textContent })).filter(x => x.d || x.a));
console.log("   ", JSON.stringify(pins));
ok(pins.some(x => x.t?.includes("演唱会场馆") && x.d === "life" && x.a?.includes("NMIXX")), "演唱会场馆：淡粉「!」+ 活动粉字");
ok(pins.some(x => x.t?.includes("明洞") && x.a?.includes("TWICE") && !x.d), "明洞：只有活动粉字");
await sleep(2000);
const pins2 = await p.evaluate(() => [...document.querySelectorAll(".stg-mpin, .stg-card")].map(x => ({ t: x.querySelector("b,.stg-card-name")?.textContent, a: x.querySelector("u,.stg-card-act")?.textContent })).filter(x => x.a));
const alm = JSON.parse(await kv("idol_almanac_v1"));
ok(alm.world["2015-03"].find(i => i.id === "w4")?.place === "弘大" && alm.placed?.includes("2015-03"), "没地点的旧大事补上了地点", alm.world["2015-03"]);
ok(alm.world["2015-03"].find(i => i.id === "w1")?.title === "NMIXX 首尔演唱会", "已有的大事没被动");
ok(pins2.some(x => x.t?.includes("弘大") && x.a?.includes("ITZY")), "补完弘大上地图", pins2);
await p.evaluate(() => { const m = document.querySelector(".stg-map"); if (m) m.scrollLeft = m.scrollWidth; }); await sleep(500);
await p.screenshot({ path: OUT + "/hap_map.png" });

console.log("[3] 点进去");
await p.evaluate(() => [...document.querySelectorAll(".stg-mpin, .stg-card")].find(x => x.textContent.includes("演唱会场馆")).click()); await sleep(1500);
await p.screenshot({ path: OUT + "/hap_arena.png" });
await p.evaluate(() => [...document.querySelectorAll(".stg-mpin, .stg-card")].find(x => x.textContent.includes("观众席")).click()); await sleep(800);
const choice = await p.evaluate(() => [...document.querySelectorAll(".stg-choose button")].map(x => x.textContent));
ok(choice.length === 2 && choice[0].includes("NMIXX") && choice[1] === "那边好像有事", "撞在一起弹二选一", choice);
await p.screenshot({ path: OUT + "/hap_choose.png" });
await p.evaluate(() => [...document.querySelectorAll(".stg-choose button")][1].click()); await sleep(800);
await p.evaluate(() => document.querySelector(".stg-go")?.click()); await sleep(3000);
const all = await p.evaluate(() => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").getAll(); g.onsuccess = () => res(g.result.filter(x => typeof x.value === "string" && x.value.includes("站姐")).map(x => x.key)); }; }));
ok(all.some(k => k !== "idol_events_v1"), "开场带上了那件事", all);
const ev2 = JSON.parse(await kv("idol_events_v1"));
ok(ev2.happenings[0].opened === true, "淡粉「!」用掉了");
console.log(`\n${pass} 过 / ${fail} 没过`, errs.length ? "页面报错：" + errs.slice(0, 3).join(" | ") : "");
await b.close();
