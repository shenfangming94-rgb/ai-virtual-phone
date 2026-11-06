/**
 * 条件特殊生活剧情端到端：深夜电话(场景)、同期生日、休息日邀约、秘密恋情(配对+发现)、室友退社、没收到邀请。
 * 跑法：node docs/idol/tests/pl3.mjs /tmp/pl3   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-pl3-${Date.now()}`, protocolTimeout: 300000 });
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
const pump = async (n = 8) => {
  for (let i = 0; i < n; i++) {
    await p.evaluate(() => { try { window.__idolNew?.rosterTick?.(); window.__idolNew?.plotTick?.(); window.__idolNew?.plotDateTick?.(); } catch { /* 不管 */ } try { window.__idol?.run?.(); } catch { /* 不管 */ } });
    await sleep(500);
  }
};
const ensureRoster = async () => { for (let i = 0; i < 20; i++) { await p.evaluate(() => window.__idolNew?.rosterTick?.()); await sleep(500); if (await kvGet("idol_roster_v1")) return true; } return false; };
const plotTitles = async () => {
  const career = JSON.parse(await kvGet("idol_career_v1") ?? "{}");
  return (career.nodes ?? []).filter(n => n.occasion === "plot").map(n => n.title);
};

await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
const signedAt = Date.now() - 50 * 864e5;
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await kvPut("idol_plots_v1", { intro_new_trainee: { key: "intro_new_trainee", state: "done", firedCount: 1 } });
await setClock(new Date(new Date().getFullYear(), 7, 15, 9, 0, 0).getTime()); // 8/15(周六前后)
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();

// 把三个同期调成:一个好朋友、五个认识、一个室友(left)——直接改页面里的档案缓存
await p.evaluate(() => {
  const people = window.__idolTest.people;
  const career = window.__idolTest.career;
  const roster = window.__idolNew.loadRoster();
  const npcs = roster.npcs.slice(0, 7);
  const friend = npcs[0];
  const met = npcs.slice(1, 6);
  const roommate = npcs[6];
  for (const n of [friend, ...met, roommate]) {
    const prof = people.getProfile(n.charId);
    prof.met = true;
    prof.group = "同期练习生";
    prof.role = "同期练习生";
    if (n === friend) prof.relation = "好朋友";
    if (met.includes(n)) prof.relation = "认识";
    if (n === roommate) { prof.relation = "认识"; prof.leave = { score: 10, log: [], phase: "left" }; }
    people.saveProfile(prof);
  }
  // 新设计：组织者跟她朋友以上才发 KKT 邀请。名册里有朋友圈的同期都设成朋友，保证能生成邀请节点。
  for (const n of roster.npcs) {
    if (!(n.friends?.length > 0) || n.id === roommate.id) continue;
    const prof = people.getProfile(n.charId);
    if (!prof) continue;
    prof.met = true;
    prof.group = "同期练习生";
    prof.role = "同期练习生";
    if (prof.relation === "陌生") prof.relation = "朋友";
    people.saveProfile(prof);
  }
  const c = career.loadCareer();
  c.roommates = [roommate.charId];
  career.saveCareer(c);
  return true;
});
await sleep(1000);

// 1. 没收到邀请(认识≥5 同期 + 朋友圈)→ ready → 排出来
await pump(6);
let titles = await plotTitles();
ok(titles.some(t => t.includes("同期私下聚会")), "没收到邀请排出来了", JSON.stringify(titles));

// 2. 同期生日:把某 npc 生日改成今天,关系朋友
await p.evaluate(() => {
  const roster = window.__idolNew.loadRoster();
  const now = new Date();
  const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  roster.npcs[0].birthday = md; // 好朋友那个
  window.__idolNew.saveRoster(roster);
});
await pump(6);
titles = await plotTitles();
ok(titles.some(t => t.includes("的生日")), "同期生日排出来了", JSON.stringify(titles));

// 3. 休息日邀约:挑个周六
await setClock(new Date(2026, 8, 12, 10, 0, 0).getTime()); // 2026-09-12 周六
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pump(6);
titles = await plotTitles();
ok(titles.some(t => t.includes("出去")), "休息日邀约排出来了", JSON.stringify(titles));

// 4. 室友退社 → ready(下一节课接)
await p.evaluate(() => window.__idolNew?.plotTick?.());
await sleep(600);
let records = await p.evaluate(() => window.__idolNew?.plotRecords?.());
ok(records?.roommate_left?.state === "ready", "室友退社剧情进 ready", records?.roommate_left?.state);

// 5. 秘密恋情:种一对已存在恋情 + 当事同期 met → ready(发现剧情)
await p.evaluate(() => {
  const plots = window.__idolNew.plotRecords();
  const roster = window.__idolNew.loadRoster();
  plots.mate_romance = { key: "mate_romance", state: "watching", firedCount: 0, extra: { lastCheck: Date.now(), romances: [{ charId: roster.npcs[2].charId, partner: "公司外认识的人", since: Date.now() }] } };
  window.__idolNew.savePlots(plots);
});
await p.evaluate(() => window.__idolNew?.plotTick?.());
await sleep(600);
records = await p.evaluate(() => window.__idolNew?.plotRecords?.());
ok(records?.mate_romance?.state === "ready", "秘密恋情发现剧情进 ready", records?.mate_romance?.state);

// 6. 深夜电话:晚上 23 点开自由场景 → 开场接上
await setClock(new Date(2026, 8, 13, 23, 0, 0).getTime()); // 周日晚上
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await pump(4);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "vnmode" }, "*")); await sleep(2500);
await p.evaluate(() => { const el = [...document.querySelectorAll(".stg-mpin, .stg-card")].find(e => (e.textContent ?? "").includes("宿舍")); el?.click(); }); await sleep(1500);
await p.evaluate(() => { const el = [...document.querySelectorAll("button")].find(e => e.textContent?.trim() === "进去"); el?.click(); }); await sleep(2500);
const scenes = JSON.parse(await kvGet("idol_stage_scenes_v1") ?? "{}");
const nightScene = Object.values(scenes).find(s => (s.premise ?? "").includes("秘密电话") || (s.premise ?? "").includes("打电话"));
ok(Boolean(nightScene), "深夜场景接上了秘密电话开场", Object.values(scenes).map(s => s.premise?.slice(0, 15)));
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
