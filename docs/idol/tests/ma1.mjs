/**
 * 年度固定主线排期端到端：签约后按窗口排期、避让周评月考、大活动留准备期、不提前、不跳过。
 * 跑法：node docs/idol/tests/ma1.mjs /tmp/ma1   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-ma1-${Date.now()}`, protocolTimeout: 300000 });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));

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
/** 名册先长出来（主线排期以它为门） */
const ensureRoster = async () => {
  for (let i = 0; i < 20; i++) {
    await p.evaluate(() => { try { window.__idolNew?.rosterTick?.(); } catch { /* 不管 */ } });
    await sleep(500);
    if (await kvGet("idol_roster_v1")) return true;
  }
  return false;
};
/** 手动泵几轮 tick（主线排期 + 全量 run 把缺席等一起跑了） */
const pumpTicks = async (n = 10) => {
  for (let i = 0; i < n; i++) {
    await p.evaluate(() => { try { window.__idolNew?.mainlineTick?.(); } catch { /* 不管 */ } try { window.__idol?.run?.(); } catch { /* 不管 */ } });
    await sleep(400);
  }
};

// 1. 播种：2026-07-01 签约（JYP），世界时间 7 月 10 日（窗口还没开）
const year = new Date().getFullYear();
const signedAt = new Date(year, 6, 1, 9, 0, 0).getTime();
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await setClock(new Date(year, 6, 10, 10, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();
await pumpTicks(6);
const career1 = JSON.parse(await kvGet("idol_career_v1"));
ok(!career1.nodes.some(n => n.occasion === "mainline"), "窗口没开不排主线", career1.nodes.filter(n => n.occasion === "mainline").map(n => n.title).join("、"));

// 2. 7 月 25 日：路演窗口已开 → 排出来，留准备期，避让周评/月考
await setClock(new Date(year, 6, 25, 10, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();
await pumpTicks(12);
const career2 = JSON.parse(await kvGet("idol_career_v1"));
const ml1 = JSON.parse(await kvGet("idol_mainline_v1") ?? "{}");
const roadshow = career2.nodes.find(n => n.occasion === "mainline" && n.title.includes("路演"));
ok(Boolean(roadshow), "路演排出来了", career2.nodes.filter(n => n.occasion === "mainline").map(n => n.title));
if (roadshow) {
  const d = new Date(roadshow.dueAt);
  ok(d.getMonth() === 6 && d.getDate() >= 23 && d.getDate() <= 31, `排期在窗口内且留了准备期(${d.getMonth() + 1}/${d.getDate()})`, roadshow.dueAt);
  ok(d.getDay() !== 0 && d.getDay() !== 6, "不排周末", String(d.getDay()));
  const weekly = career2.nodes.filter(n => n.kind === "weekly" && n.status === "pending");
  const monthly = career2.nodes.filter(n => n.kind === "monthly" && n.status === "pending");
  ok(![...weekly, ...monthly].some(n => { const x = new Date(n.dueAt); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); }), "不撞周评月考");
  ok(roadshow.status === "pending", "状态是待办");
}
ok(ml1.nodes?.find(n => n.key === "roadshow")?.state === "scheduled", "主线状态机:已安排", ml1.nodes?.find(n => n.key === "roadshow")?.state);

// 3. 8 月 20 日：合作舞台排出来，路演已算过去（缺席）
await setClock(new Date(year, 7, 20, 10, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pumpTicks(12);
const career3 = JSON.parse(await kvGet("idol_career_v1"));
const collab = career3.nodes.find(n => n.occasion === "mainline" && n.title.includes("合作舞台"));
ok(Boolean(collab), "合作舞台排出来了");
const roadshow2 = career3.nodes.find(n => n.occasion === "mainline" && n.title.includes("路演"));
ok(roadshow2?.status === "done" || roadshow2?.status === "absent", "路演已经过去了(演完或缺席)", roadshow2?.status);

// 4. 次年 1 月：第一年五场都排过（没跳过的），出道企划也排出来
await setClock(new Date(year + 1, 0, 8, 10, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pumpTicks(12);
const career4 = JSON.parse(await kvGet("idol_career_v1"));
const ml4 = JSON.parse(await kvGet("idol_mainline_v1") ?? "{}");
const plan = career4.nodes.find(n => n.occasion === "mainline" && n.title.includes("出道企划"));
ok(Boolean(plan), "次年 1 月出道企划排出来了");
const all = career4.nodes.filter(n => n.occasion === "mainline").map(n => n.title);
ok(["路演", "合作舞台", "表演视频", "伴舞选拔", "家族演唱会"].every(t => all.some(x => x.includes(t))), "第一年的五场主线都排过了", all.join("、"));
ok(ml4.nodes?.filter(n => n.state === "scheduled" || n.state === "done").length >= 6, "状态机里至少六场已安排或完成", ml4.nodes?.filter(n => n.state === "scheduled" || n.state === "done").length);
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
