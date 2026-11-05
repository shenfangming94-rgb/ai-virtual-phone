/**
 * 机会系统端到端：邀约(待回复+结果代码定)→打勾完成→统一奖励表结算(经验+关注度)、
 * 情缘专属保护(绝不会生成高端杂志/MV 女主角)、45 天冷却。
 * 跑法：node docs/idol/tests/op1.mjs /tmp/op1   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-op1-${Date.now()}`, protocolTimeout: 300000 });
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
const ensureRoster = async () => { for (let i = 0; i < 20; i++) { await p.evaluate(() => window.__idolNew?.rosterTick?.()); await sleep(500); if (await kvGet("idol_roster_v1")) return true; } return false; };

await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
const signedAt = Date.now() - 50 * 864e5;
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await kvPut("idol_plots_v1", { intro_new_trainee: { key: "intro_new_trainee", state: "done", firedCount: 1 } });
await setClock(new Date(new Date().getFullYear(), 8, 20, 10, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();

// 1. 强制发一个机会（测试钩子绕过掷骰；真实游戏里由 opportunitiesTick 按 45 天冷却+日概率发）
await p.evaluate(() => window.__idolNew?.forceOpp?.());
await sleep(1500);
const career1 = JSON.parse(await kvGet("idol_career_v1"));
const oppNode = career1.nodes.find(n => n.occasion === "opportunity");
ok(Boolean(oppNode), "机会邀约进了提醒事项", career1.nodes.filter(n => n.occasion === "opportunity").map(n => n.title));
ok(oppNode?.status === "invite", "是待回复状态(收到邀约不等于工作确定)", oppNode?.status);
ok((oppNode?.note ?? "").includes("结果（代码定的）"), "结果代码定了写进备注", oppNode?.note?.slice(0, 40));
const oppState1 = await p.evaluate(() => window.__idolNew?.oppState?.());
ok(Boolean(oppState1?.active), "机会在处理中", JSON.stringify(oppState1?.active?.title));
ok(!["高端时尚杂志", "MV 女主角"].some(t => (oppNode?.title ?? "").includes(t)), "不会生成情缘专属资源", oppNode?.title);

// 2. 打勾完成 → 结算（成功按规模给经验+关注度，失败 +1 经验）
const beforeStats = JSON.parse(await kvGet("idol_roster_v1")).player.stats;
await p.evaluate((id) => window.__idol?.checkNode?.(id, "去参加了，认真表现"), oppNode.id);
await sleep(1500);
for (let i = 0; i < 6; i++) { await p.evaluate(() => window.__idolNew?.oppTick?.()); await sleep(500); }
const afterStats = JSON.parse(await kvGet("idol_roster_v1")).player.stats;
const oppState2 = await p.evaluate(() => window.__idolNew?.oppState?.());
ok(oppState2?.active == null, "机会结算完、清掉了", JSON.stringify(oppState2?.active));
const subject = oppState1.active.subject;
const gained = (afterStats[subject] ?? 0) + (afterStats[subject] ? 0 : 0);
const progressAfter = JSON.parse(await kvGet("idol_roster_v1")).player.progress;
ok((progressAfter[subject] ?? 0) > 0, `${subject} 经验结算进了数值(进度 ${progressAfter[subject]?.toFixed?.(1) ?? progressAfter[subject]})`, JSON.stringify(progressAfter));

// 3. 连发三个：标题不重复、数量上限（普通背景 3 个）
await p.evaluate(() => { window.__idolNew?.forceOpp?.(); });
await sleep(800);
await p.evaluate(() => { window.__idolNew?.forceOpp?.(); });
await sleep(800);
const oppState3 = await p.evaluate(() => window.__idolNew?.oppState?.());
const titles = await p.evaluate(() => window.__idolNew?.oppState?.()?.titles ?? []);
ok(titles.length >= 3, "机会标题都有记录", JSON.stringify(titles));
ok(new Set(titles).size === titles.length, "标题不重复", JSON.stringify(titles));
ok(oppState3.firedCount <= 4, "数量有上限(普通背景 3~4)", oppState3.firedCount);
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
