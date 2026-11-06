/**
 * 情缘系统端到端：六类身份才有关注、关注锁线、羁绊(见面/KKT)起算、到门槛他约你(待回复)、
 * 节点完成推进、MV 女主角奖励结算。
 * 跑法：node docs/idol/tests/rm2.mjs /tmp/rm2   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 400)); } };

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-rm2-${Date.now()}`, protocolTimeout: 300000 });
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
const signedAt = Date.now() - 20 * 864e5;
await kvPut("idol_trainee_card_v1", { name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2016-03-01", trainLength: "一年", family: "normal", talents: ["dance"], company: "JYP", no: "x", createdAt: 1 });
await kvPut("idol_career_v1", { stage: "trainee", companyId: "jyp", signedAt, facts: [], offers: [], offersMadeAt: Date.now(), nodes: [] });
await kvPut("idol_plots_v1", { intro_new_trainee: { key: "intro_new_trainee", state: "done", firedCount: 1 } });
await setClock(new Date(new Date().getFullYear(), 7, 10, 10, 0, 0).getTime());
await p.reload({ waitUntil: "networkidle2" }); await p.waitForFunction(() => window.__idolNew, { timeout: 240000, polling: 500 });
await ensureRoster();

// 1. 捏一个男爱豆（男团成员）+ 一个男练习生
await p.evaluate(() => {
  const people = window.__idolTest.people;
  const idol = people.createPerson("郑曜汉", { ...people.emptyProfile(""), layer: "main", group: "前辈男团", role: "NOVA 主唱 · 同公司前辈", gender: "男", age: "20", isIdol: true, met: true, relation: "认识", publicLabels: ["主唱"], publicText: "NOVA 的主唱" }, null, "nova_yohan");
  const trainee = people.createPerson("金度允", { ...people.emptyProfile(""), layer: "main", group: "男练习生", role: "男练习生", gender: "男", age: "18", met: true, relation: "认识" }, null, "doyun_1");
  return { idol: idol.id, trainee: trainee.id };
});
await sleep(800);

// 2. 六类身份判定 + 关注锁线
const ids = await p.evaluate(() => {
  const chars = window.__idolTest.characters.loadCharacters();
  const idol = chars.find(c => c.name === "郑曜汉");
  const trainee = chars.find(c => c.name === "金度允");
  return { idol: idol?.id, trainee: trainee?.id };
});
const canI = await p.evaluate((id) => window.__idolNew?.canFollow?.(id), ids.idol);
const canT = await p.evaluate((id) => window.__idolNew?.canFollow?.(id), ids.trainee);
ok(canI === "idol", "男团主唱 → 爱豆线候选", canI);
ok(canT === "trainee", "男练习生 → 练习生线候选", canT);
const female = await p.evaluate(() => {
  const roster = window.__idolNew?.loadRoster();
  const first = roster.npcs[0];
  const r = window.__idolNew?.canFollow?.(first.charId);
  return r === null || r === undefined;
});
ok(female === true, "女同期不给关注按钮", female);
const follow = await p.evaluate((id) => window.__idolNew?.followRoute?.(id), ids.idol);
ok(follow?.ok === true, "关注成功进线", JSON.stringify(follow));
const again = await p.evaluate((id) => window.__idolNew?.followRoute?.(id), ids.idol);
ok(again?.ok === false, "同一条线重复关注被拒(线锁了)", JSON.stringify(again));
// 练习生线还没人,金度允能关注(各线各一个)
const follow2 = await p.evaluate((id) => window.__idolNew?.followRoute?.(id), ids.trainee);
ok(follow2?.ok === true, "练习生线也能关注(各线各一个)", JSON.stringify(follow2));

// 3. 羁绊:见面 3 次 + KKT 2 条 → 爱豆线 15+2 = 17 ≥ 12 → 他约你(演唱会邀请,待回复)
for (let i = 0; i < 3; i++) { await p.evaluate((id) => window.__idolNew?.recordMeet?.(id), ids.idol); await sleep(200); }
await p.evaluate((id) => { window.__idolNew?.recordKkt?.(id); window.__idolNew?.recordKkt?.(id); }, ids.idol);
await sleep(300);
await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__idolNew?.romanceTick?.(); });
await sleep(800);
const career1 = JSON.parse(await kvGet("idol_career_v1"));
const inviteNode = career1.nodes.find(n => n.occasion === "romance" && n.note === "情缘节点：concert_invite");
ok(Boolean(inviteNode), "羁绊到了他发来演唱会邀请(待回复)", career1.nodes.filter(n => n.occasion === "romance").map(n => `${n.title}:${n.status}`));
ok(inviteNode?.status === "invite" && inviteNode?.from === "郑曜汉", "邀请来自他、等她接", `${inviteNode?.status} ${inviteNode?.from}`);

// 4. 打勾完成 → 节点推进
await p.evaluate((id) => window.__idol?.checkNode?.(id, "去看了,现场很好"), inviteNode.id);
await sleep(1200);
for (let i = 0; i < 4; i++) { await p.evaluate(() => window.__idolNew?.romanceTick?.()); await sleep(500); }
const state1 = await p.evaluate(() => window.__idolNew?.romanceState?.());
const idolLine = state1.lines.idol;
ok(idolLine?.doneNodes?.includes("concert_invite"), "演唱会邀请完成了", JSON.stringify(idolLine?.doneNodes));
ok(idolLine?.nextNode === "practice_guide", "下一个节点 = 练习室指导", idolLine?.nextNode);

// 5. MV 女主角奖励:把线推进到 mv_lead,种一个 done 节点 → 演技经验结算
await p.evaluate(() => {
  const s = window.__idolNew?.romanceState();
  s.lines.idol.nextNode = "mv_lead";
  window.__idolNew?.saveRomance?.(s);
});
await p.evaluate(() => {
  const career = window.__idolTest.career;
  const c = career.loadCareer();
  c.nodes.push({ id: "rmv_test", kind: "event", title: "回归 MV 女主角", place: "电视台 舞台", premise: "x", dueAt: Date.now(), status: "done", occasion: "romance", note: "情缘节点：mv_lead", from: "郑曜汉" });
  career.saveCareer(c);
});
await sleep(500);
const beforeAct = JSON.parse(await kvGet("idol_roster_v1")).player.stats.acting;
await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__idolNew?.romanceTick?.(); });
await sleep(800);
const afterAct = JSON.parse(await kvGet("idol_roster_v1")).player.stats.acting;
const state2 = await p.evaluate(() => window.__idolNew?.romanceState?.());
ok(afterAct > beforeAct || state2.lines.idol?.doneNodes?.includes("mv_lead"), "MV 女主角结算了演技经验", `acting ${beforeAct}→${afterAct}`);
ok(errs.length === 0, "没有页面报错", JSON.stringify(errs.slice(0, 3)));

console.log(`\n${fail === 0 ? "全部通过 ✅" : fail + " 项没过 ❌"}(${pass} 项)`);
await b.close();
process.exit(fail ? 1 : 0);
