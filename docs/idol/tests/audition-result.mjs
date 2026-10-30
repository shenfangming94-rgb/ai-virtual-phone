/**
 * 试镜结果流程测试（假 AI、独立浏览器存档，不碰用户的浏览器数据）
 *
 * 验的是：
 *   1. 邮箱 app 随站点自带装到桌面
 *   2. 试镜演完不当场签约，排 1~3 天后的公司回信
 *   3. 到点发录取信（只发一次）
 *   4. 邮箱里点「接受录取」才签约、排日程，其他公司全部收尾成「已接受别家录取」
 *   5. 点「拒绝」不签约，别家不受影响
 *   6. 演得明显不行（bad）收到的是拒信
 *
 * 跑法：node docs/idol/tests/audition-result.mjs
 * 前提：本项目 dev 服务在跑（默认 http://127.0.0.1:3001/，可用 IDOL_TEST_URL 覆盖）
 */
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const TEST_URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra === "" ? "" : `→ ${JSON.stringify(extra)}`); }
};

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  userDataDir: `/tmp/idol-audition-test-${Date.now()}`,
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String(e.message)));
page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await page.setRequestInterception(true);
page.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) {
    r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: "好的。" }, finish_reason: "stop" }] }) });
    return;
  }
  r.continue();
});

await page.goto(TEST_URL, { waitUntil: "networkidle2", timeout: 180000 });
await sleep(1500);

await page.evaluate(async () => {
  const now = new Date().toISOString();
  const db = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = db.transaction("entries", "readwrite");
  const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m", enableImageRecognition: false, enableImageGeneration: false }]) });
  st.put({ key: "ai_phone_user_identities_v1", value: JSON.stringify([{ id: "identity-1", name: "Flora", bio: "", gender: "女", age: "16", occupation: "", customSettings: "" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1998-04-11", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "child", familyCustom: "", familyNote: "", talents: ["vocal"], talentNote: "", weakness: "", other: "", signature: null, company: "", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_search_v1", value: JSON.stringify({ apps: [
    { id: "app_sm", companyId: "sm", at: Date.now() - 5 * 864e5, name: "Flora", birthday: "1998-04-11", height: "", email: "f@naver.com", areas: ["声乐"], photos: [], video: "", intro: "", status: "review", decideAt: Date.now() + 5 * 864e5 },
    { id: "app_jyp", companyId: "jyp", at: Date.now() - 4 * 864e5, name: "Flora", birthday: "1998-04-11", height: "", email: "f@naver.com", areas: ["声乐"], photos: [], video: "", intro: "", status: "invited", decideAt: Date.now() - 2 * 864e5 },
  ] }) });
  await new Promise(r => tx.oncomplete = r);
});

await page.reload({ waitUntil: "networkidle2" });
await sleep(4000);
await page.waitForFunction(() => window.__idolTest?.career && window.__idolTest?.search && window.__idolTest?.customAppStorage, { timeout: 90000 });

const readKv = key => page.evaluate(async key => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = db.transaction("entries", "readonly");
  const rec = await new Promise(res => { const q = tx.objectStore("entries").get(key); q.onsuccess = () => res(q.result); });
  return rec?.value ?? null;
}, key);

console.log("\n[1] 邮箱 app 是不是自带装上了");
const mailInstalled = await page.evaluate(() => window.__idolTest.customAppStorage.loadInstalledCustomApps().some(a => a.manifest?.id === "nox.mail"));
ok(mailInstalled, "nox.mail 已安装");
const mailOnDesktop = await page.evaluate(() => [...document.querySelectorAll("button")].some(b => b.textContent.trim() === "邮箱"));
ok(mailOnDesktop, "桌面上有「邮箱」图标");

console.log("\n[2] 试镜演完：不当场签约，排 1~3 天后的回信");
const r2 = await page.evaluate(async () => {
  const { career } = window.__idolTest;
  const c = career.loadCareer();
  career.saveCareer({ ...c, stage: "pre", companyId: undefined, nodes: [...c.nodes, { id: "n_aud", kind: "audition", title: "Starship 试镜", place: "Starship 公司大楼 试镜室", premise: "试镜", dueAt: Date.now() - 3600e3, status: "pending", companyId: "starship" }] });
  const msg = await career.completeNode("n_aud", "good");
  const after = career.loadCareer();
  const n = after.nodes.find(x => x.id === "n_aud");
  return { msg, stage: after.stage, resultAt: n?.resultAt, resultPass: n?.resultPass, resultSent: n?.resultSent, status: n?.status, hasFirstDay: after.nodes.some(x => x.kind === "first_day") };
});
ok(r2.stage === "pre", "演完仍是 pre（没签约）", r2.stage);
ok(!!r2.resultAt, "排了公司回信时间");
const waitDays = (r2.resultAt - Date.now()) / 864e5;
ok(waitDays >= 0.9 && waitDays <= 3.2, `回信在 1~3 天内（${waitDays.toFixed(2)} 天）`, waitDays);
ok(r2.resultPass === true, "表现 good → 会录取");
ok(r2.hasFirstDay === false, "没有提前排「进公司第一天」");

console.log("\n[3] 到点发录取信，只发一次");
const r3 = await page.evaluate(() => {
  const { career } = window.__idolTest;
  const c = career.loadCareer();
  career.saveCareer({ ...c, nodes: c.nodes.map(n => n.id === "n_aud" ? { ...n, resultAt: Date.now() - 1000 } : n) });
  const notices = [];
  career.deliverAuditionResults(m => notices.push(m));
  career.deliverAuditionResults(m => notices.push(m));
  const n = career.loadCareer().nodes.find(x => x.id === "n_aud");
  return { notices, sent: n?.resultSent };
});
ok(r3.notices.some(m => m.includes("录取通知")), "通知里说收到录取通知", r3.notices);
ok(r3.sent === true, "标记已发");
ok(r3.notices.length === 1, "重复跑只发一次", r3.notices.length);

const mails = JSON.parse((await readKv("idol_mail_v1")) || "[]");
const offer = mails.find(m => m.action?.kind === "offer");
ok(!!offer, "邮箱里有录取信");
ok(offer?.action?.companyId === "starship", "录取信来自 Starship");
ok(offer?.action?.status === "new", "录取信在等她回复");
ok((offer?.body?.length ?? 0) >= 2, "录取信有正文");

console.log("\n[4] 邮箱里点「接受录取」→ 才签约，其他公司收尾");
const r4 = await page.evaluate(async () => {
  const { search, customAppStorage } = window.__idolTest;
  const appId = search.mailAppId();
  search.mailAppTick(() => {});
  const rows = customAppStorage.readCustomAppCollection(appId, "mails");
  const row = rows.find(r => r.idol?.action?.kind === "offer");
  if (!row) return { error: "app 里没同步到录取信" };
  row.idol.action.status = "accepted"; // 等于邮箱里点了「接受录取」
  customAppStorage.writeCustomAppCollection(appId, "mails", rows);
  const notices = [];
  search.mailAppTick(m => notices.push(m));
  await new Promise(r => setTimeout(r, 4000));
  const c = window.__idolTest.career.loadCareer();
  return {
    notices,
    stage: c.stage, company: c.companyId,
    hasFirstDay: c.nodes.some(n => n.kind === "first_day"),
    hasWeekly: c.nodes.some(n => n.kind === "weekly"),
  };
});
ok(!r4.error, "邮箱 app 里同步到了录取信", r4.error);
ok(r4.stage === "trainee", "接受后才变成练习生", r4.stage);
ok(r4.company === "starship", "进的是 Starship", r4.company);
ok(r4.hasFirstDay === true, "排了「进公司第一天」");

const appsAfter = JSON.parse((await readKv("idol_search_v1")) || "{}").apps ?? [];
const sm = appsAfter.find(a => a.companyId === "sm");
const jyp = appsAfter.find(a => a.companyId === "jyp");
ok(sm?.status === "signed" && sm?.signedBy === "starship", "SM 的审核自动收尾成「已接受 Starship」", sm);
ok(jyp?.status === "signed" && jyp?.signedBy === "starship", "JYP 的邀请也自动收尾", jyp);

const mailAfter = JSON.parse((await readKv("idol_mail_v1")) || "[]").find(m => m.action?.kind === "offer");
ok(mailAfter?.action?.status === "accepted", "邮件状态记成已接受", mailAfter?.action?.status);

console.log("\n[5] 拒绝录取：不签约，别家不受影响");
const r5 = await page.evaluate(async () => {
  const { career, search, customAppStorage } = window.__idolTest;
  // 回到还没有公司的状态，重新来一次
  career.saveCareer({ stage: "pre", facts: [], offers: [], nodes: [] });
  const c = career.loadCareer();
  career.saveCareer({ ...c, nodes: [{ id: "n_aud2", kind: "audition", title: "Cube 试镜", place: "Cube 公司大楼", premise: "试镜", dueAt: Date.now() - 3600e3, status: "pending", companyId: "cube" }] });
  await career.completeNode("n_aud2", "ok");
  const c2 = career.loadCareer();
  career.saveCareer({ ...c2, nodes: c2.nodes.map(n => n.id === "n_aud2" ? { ...n, resultAt: Date.now() - 1000 } : n) });
  career.deliverAuditionResults(() => {});
  search.mailAppTick(() => {});
  const appId = search.mailAppId();
  const rows = customAppStorage.readCustomAppCollection(appId, "mails");
  const row = rows.filter(r => r.idol?.action?.kind === "offer" && r.idol.action.status === "new").pop();
  if (!row) return { error: "没找到新的录取信" };
  row.idol.action.status = "declined";
  customAppStorage.writeCustomAppCollection(appId, "mails", rows);
  search.mailAppTick(() => {});
  await new Promise(r => setTimeout(r, 2500));
  const after = career.loadCareer();
  return { stage: after.stage, company: after.companyId, hasFirstDay: after.nodes.some(n => n.kind === "first_day") };
});
ok(!r5.error, "收到了第二封录取信", r5.error);
ok(r5.stage === "pre", "拒绝后还是 pre", r5.stage);
ok(r5.hasFirstDay === false, "拒绝后没排日程");

console.log("\n[6] 演得明显不行（bad）→ 拒信，不到公司");
const r6 = await page.evaluate(async () => {
  const { career, search } = window.__idolTest;
  career.saveCareer({ stage: "pre", facts: [], offers: [], nodes: [] });
  const c = career.loadCareer();
  career.saveCareer({ ...c, nodes: [{ id: "n_aud3", kind: "audition", title: "YG 试镜", place: "YG 公司大楼", premise: "试镜", dueAt: Date.now() - 3600e3, status: "pending", companyId: "yg" }] });
  await career.completeNode("n_aud3", "bad");
  const c2 = career.loadCareer();
  const n0 = c2.nodes.find(n => n.id === "n_aud3");
  career.saveCareer({ ...c2, nodes: c2.nodes.map(n => n.id === "n_aud3" ? { ...n, resultAt: Date.now() - 1000 } : n) });
  const notices = [];
  career.deliverAuditionResults(m => notices.push(m));
  const c3 = career.loadCareer();
  return { pass: n0?.resultPass, notices, stage: c3.stage, hasFirstDay: c3.nodes.some(n => n.kind === "first_day") };
});
ok(r6.pass === false, "bad → 判定不录取");
ok(r6.notices.some(m => m.includes("试镜结果")), "通知是试镜结果（不是录取）", r6.notices);
ok(r6.stage === "pre" && r6.hasFirstDay === false, "没进公司、没排日程");

const mailsAll = JSON.parse((await readKv("idol_mail_v1")) || "[]");
const reject = mailsAll.find(m => m.subjectZh === "试镜结果通知");
ok(!!reject, "拒信也发到邮箱了");
ok(!reject?.action, "拒信没有接受/拒绝按钮");

console.log("\n[7] 跳时间会停在公司回信那一刻");
const r7 = await page.evaluate(() => {
  const { timeJump } = window.__idolTest;
  const now = Date.now();
  const resultAt = now + 2 * 864e5;
  const nodes = [{ id: "n_wait", kind: "audition", title: "JYP 试镜", place: "JYP", premise: "", dueAt: now - 864e5, status: "done", companyId: "jyp", resultAt, resultPass: true, resultSent: false }];
  const hit = timeJump.findTimeJumpStop(now, now + 10 * 864e5, nodes, [], []);
  const after = timeJump.findTimeJumpStop(now, now + 10 * 864e5, nodes.map(n => ({ ...n, resultSent: true })), [], []);
  return { target: hit.target, stoppedBy: hit.stoppedBy, afterSent: after.target, afterStoppedBy: after.stoppedBy };
});
ok(r7.stoppedBy === "公司回信", "停点是「公司回信」", r7.stoppedBy);
const diffDays = (r7.target - Date.now()) / 864e5;
ok(Math.abs(diffDays - 2) < 0.05, "正好停在 2 天后那一刻", diffDays.toFixed(3));
ok(r7.afterSent > r7.target, "信发过之后就不再挡路", { afterSent: r7.afterSent, afterStoppedBy: r7.afterStoppedBy });

console.log("\n[8] 打包进站点的邮箱 app 里有录取按钮");
const pkgOk = await page.evaluate(async () => {
  const res = await fetch("/apps/mail.zip");
  return res.ok && (await res.arrayBuffer()).byteLength > 1000;
});
ok(pkgOk, "public/apps/mail.zip 能拉到");
const mailSrc = readFileSync(new URL("../../../custom-apps/mail/src/app.js", import.meta.url), "utf8");
ok(mailSrc.includes("接受录取"), "邮箱源里有「接受录取」按钮");
ok(mailSrc.includes('a.kind === "offer"'), "邮箱区分录取信和邀请信");
const bundled = JSON.parse(readFileSync(new URL("../../../public/apps/bundled.json", import.meta.url), "utf8"));
ok(bundled.some(x => x.id === "nox.mail"), "bundled.json 里列了邮箱");

console.log(`\n结果：${pass} 项通过，${fail} 项失败`);
if (errs.length) console.log("页面报错：", errs.slice(0, 8));
await browser.close();
process.exit(fail ? 1 : 0);
