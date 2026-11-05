/**
 * 上课管线端到端：主动进公司上课 → 55 段固定文本 → 下课结算数字 → 扣行动点 → 世界时间走到下课；
 * 不去的课 = 旷课（新存档模式）。
 * 跑法：node docs/idol/tests/cl1.mjs /tmp/cl1   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-cl1-${Date.now()}`, protocolTimeout: 300000 });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));

const pad = n => String(n).padStart(2, "0");
/** 下一个「周几」的本地时间戳 */
function nextDow(dow, hour, min = 0) {
  const d = new Date(); d.setHours(hour, min, 0, 0);
  const add = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + add);
  return d.getTime();
}
const setClock = async (target) => {
  // 从页面里拨（直接写 localStorage 会被旧页面的 pagehide 存档盖回现实时间）
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

// 1. 播种：练习生 + 签约 3 天（JYP），世界时间 = 下周一 08:00（课前）
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__idolTest, { timeout: 240000, polling: 1000 });
const nowIso = new Date().toISOString();
const signedAt = Date.now() - 3 * 864e5;
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await setClock(nextDow(1, 8, 0));
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolTest, { timeout: 240000, polling: 1000 }); await sleep(2500);

// 2. 等名册生成（39 同期自动建档）
let roster = null;
for (let i = 0; i < 30 && !roster; i++) { await sleep(1000); roster = await kvGet("idol_roster_v1"); }
ok(Boolean(roster), "名册已生成");
const parsed = roster ? JSON.parse(roster) : null;
ok(parsed?.npcs?.length === 39, "39 名同期", parsed?.npcs?.length);
ok(parsed?.player?.klass === "C", "玩家 C 班");

// 3. 找哪天有课（等星路状态长出来再读课表；Parity 两周一次的课要跟目标周对上）
const clockTarget = async () => {
  for (let dow = 1; dow <= 5; dow++) {
    await setClock(nextDow(dow, 8, 0)); await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolTest, { timeout: 240000, polling: 1000 });
    let raw = null;
    for (let i = 0; i < 30 && !raw; i++) { await sleep(1000); raw = await kvGet("idol_starroad_v1"); }
    const s = raw ? JSON.parse(raw) : null;
    const monday = new Date(nextDow(dow, 8, 0)); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const parity = Math.floor(monday.getTime() / (7 * 864e5)) % 2;
    const slot = (s?.slots ?? []).find(x => x.dow === dow && x.subject && (x.parity == null || x.parity === parity));
    if (slot) {
      const [h, m] = slot.start.split(":").map(Number);
      return { dow, start: nextDow(dow, h, m), end: nextDow(dow, h + 2, m), subject: slot.subject, label: slot.label };
    }
  }
  return null;
};
const cls = await clockTarget();
ok(Boolean(cls), "这一周有课可上", JSON.stringify(cls));

// 4. 世界时间拨到上课 20 分钟后（迟到 30 分钟内算到）
await setClock(cls.start + 20 * 60e3); await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolTest, { timeout: 240000, polling: 1000 }); await sleep(2000);

// 5. 打开此刻 → 首尔 → 公司 → 练习室
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(2500);
ok(await p.evaluate(() => document.body.innerText.includes("首尔")), "此刻打开(首尔地图)");
const tapByName = async (name) => {
  const hit = await p.evaluate(n => {
    const els = [...document.querySelectorAll(".stg-mpin, .stg-card")];
    const el = els.find(e => (e.querySelector(".stg-card-name")?.textContent ?? e.textContent ?? "").includes(n));
    if (!el) return false;
    el.click(); return true;
  }, name);
  return hit;
};
ok(await tapByName("公司"), "点进公司(上课场景直接开)");
await sleep(2000);
if (!(JSON.parse(await kvGet("idol_stage_scenes_v1") ?? "{}").class)) {
  const bodyNow = await p.evaluate(() => document.body.innerText.slice(0, 220).replace(/\n/g, " | "));
  console.log("  点击后画面:", bodyNow);
}
console.log("  pageerrors:", JSON.stringify(errs.slice(0, 5)));

// 6. 断言：这场是课，55 段文本直接显示（不走 AI、不等打字）
const scenes = JSON.parse(await kvGet("idol_stage_scenes_v1") ?? "{}");
const classScene = Object.values(scenes).find(s => s.class);
ok(Boolean(classScene), "开的是上课场景", Object.keys(scenes).length);
ok(classScene?.class?.subjectKey === cls.subject, "科目对上了", `${classScene?.class?.subjectKey} vs ${cls.subject}`);
ok(classScene?.class?.text?.length > 30, "固定课堂文本写进了这一场", classScene?.class?.text?.slice(0, 40));

// 7. 点完全部帧，等「下课」出来
let gotClassEnd = false;
for (let i = 0; i < 40 && !gotClassEnd; i++) {
  gotClassEnd = await p.evaluate(() => document.body.innerText.includes("下课"));
  if (!gotClassEnd) { await p.evaluate(() => { const el = document.querySelector(".vn-shell"); el?.click(); }); await sleep(350); }
}
ok(gotClassEnd, "文本点完后出现「下课」");

// 8. 下课：结算数字、扣点、时间走到下课
await p.evaluate(() => { const btns = [...document.querySelectorAll("button")]; btns.find(x => x.textContent?.includes("下课") && !x.textContent.includes("中"))?.click(); });
await sleep(2500);
const afterScenes = JSON.parse(await kvGet("idol_stage_scenes_v1") ?? "{}");
const afterScene = Object.values(afterScenes).find(s => s.class);
ok(afterScene?.class?.settled === true, "下课后标记已结算");
const ap = JSON.parse(await kvGet("idol_actionpoints_v1") ?? "null");
ok(ap?.used?.length === 1, "扣了 1 个行动点", JSON.stringify(ap));
const rosterAfter = JSON.parse(await kvGet("idol_roster_v1"));
const prog = rosterAfter?.player?.progress?.[cls.subject];
ok(prog > 0, `名册里涨了 ${cls.label}(进度 ${prog})`, JSON.stringify(rosterAfter?.player?.progress));
const att = JSON.parse(await kvGet("idol_class_attended_v1") ?? "{}");
ok(Boolean(att[String(cls.start)]), "这节课记了到场");
const clock = await p.evaluate(() => JSON.parse(localStorage.getItem("idol_world_clock_v1")));
const worldNow = Date.now() + (clock?.offset ?? 0);
ok(Math.abs(worldNow - cls.end) < 60e3, "世界时间走到了下课", new Date(worldNow).toLocaleString("zh-CN"));
ok(await p.evaluate(() => document.body.innerText.includes("这节课结束了")), "画面写了「这节课结束了」");

// 9. 第二天另一节课不去上 = 旷课
const skipTarget = await (async () => {
  for (let dow = 1; dow <= 5; dow++) {
    if (dow === cls.dow) continue;
    await setClock(nextDow(dow, 8, 0)); await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolTest, { timeout: 240000, polling: 1000 });
    let raw = null;
    for (let i = 0; i < 30 && !raw; i++) { await sleep(1000); raw = await kvGet("idol_starroad_v1"); }
    const s = raw ? JSON.parse(raw) : null;
    const monday = new Date(nextDow(dow, 8, 0)); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const parity = Math.floor(monday.getTime() / (7 * 864e5)) % 2;
    const slot = (s?.slots ?? []).find(x => x.dow === dow && x.subject && (x.parity == null || x.parity === parity));
    if (slot) { const [h, m] = slot.start.split(":").map(Number); return { start: nextDow(dow, h, m) }; }
  }
  return null;
})();
ok(Boolean(skipTarget), "找了一节不去的课");
if (skipTarget) {
  await setClock(skipTarget.start + 3 * 60 * 60e3); // 上完课 3 小时后（没去）
  await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolTest, { timeout: 240000, polling: 1000 }); await sleep(8000);
  const marks = JSON.parse(await kvGet("idol_starroad_v1") ?? "null")?.marks ?? [];
  const m = marks.find(x => x.at === skipTarget.start);
  ok(m?.status === "skip", "没去的课记成旷课", JSON.stringify(m));
  const att2 = marks.find(x => x.at === cls.start);
  ok(att2?.status === "attend", "上过的那节记成到场", JSON.stringify(att2));
}

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
