/**
 * 编辑页「有心动线（AI 判断）」流程测试（假 AI、独立浏览器存档，不碰用户的浏览器数据）
 *
 * 验的是：
 *   1. 编辑页心动下拉有「有心动线（AI 判断）」这一项
 *   2. 选它点完成 → 保存时用这个人的戏文原文调一次 AI
 *   3. AI 回的档位写进档案（canCrush=true + heart=AI 判断结果）
 *   4. 没有戏文的人也能走通，AI 没回按没感觉兜底
 *
 * 跑法：node docs/idol/tests/heart-judge.mjs
 * 前提：本项目 dev 服务在跑（默认 http://127.0.0.1:3001/，可用 IDOL_TEST_URL 覆盖）
 */
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
  userDataDir: `/tmp/idol-heart-judge-${Date.now()}`,
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String(e.message)));

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
let mockReply = "有点在意";
await page.setRequestInterception(true);
page.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) {
    r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: mockReply }, finish_reason: "stop" }] }) });
    return;
  }
  r.continue();
});

await page.goto(TEST_URL, { waitUntil: "networkidle2", timeout: 180000 });
await sleep(1500);
await page.waitForFunction(() => window.__idolTest?.people && window.__idolTest?.characters && window.__idolTest?.world, { timeout: 90000 });

const putKv = (key, value) => page.evaluate(async (key, value) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = db.transaction("entries", "readwrite");
  const st = tx.objectStore("entries");
  st.put({ key, value });
  await new Promise(r => tx.oncomplete = r);
}, key, value);

const readKv = key => page.evaluate(async key => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = db.transaction("entries", "readonly");
  const rec = await new Promise(res => { const q = tx.objectStore("entries").get(key); q.onsuccess = () => res(q.result); });
  return rec?.value ?? null;
}, key);

console.log("[1] seed：API 站、身份、练习生卡");
await putKv("ai_phone_api_configs_v1", JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m", enableImageRecognition: false, enableImageGeneration: false }]));
await putKv("ai_phone_user_identities_v1", JSON.stringify([{ id: "identity-1", name: "Flora", bio: "", gender: "女", age: "19", occupation: "", customSettings: "" }]));
await putKv("idol_trainee_card_v1", JSON.stringify({ name: "Flora", photo: null, birthday: "1998-04-11", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "child", familyCustom: "", familyNote: "", talents: ["vocal"], talentNote: "", weakness: "", other: "", signature: null, company: "", no: "x", createdAt: 1 }));

console.log("[2] seed：俊锡这个人和清潭洞那场戏");
const charId = await page.evaluate(() => {
  const { people } = window.__idolTest;
  const base = people.emptyProfile("tmp");
  const profile = { ...base, layer: "main", group: "JYP", role: "JYP 前辈", age: "23", gender: "男", canCrush: false, heart: undefined, rolled: true, relation: "认识", met: true, metAt: { at: Date.now(), place: "清潭洞街角" }, heightCm: 185 };
  delete profile.charId;
  const char = people.createPerson("俊锡", profile);
  return char.id;
});
ok(!!charId, "俊锡已建号", charId);

await page.evaluate(async (charId, worldId) => {
  const iso = new Date().toISOString();
  const vn = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneVnDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = vn.transaction(["sessions", "messages"], "readwrite");
  const sst = tx.objectStore("sessions");
  sst.put({ id: "vn_heart_test", characterId: worldId, updatedAt: iso, chapters: [{ id: "ch_heart_1", index: 0, title: "清潭洞咖啡店", subtitle: "傍晚", startMessageId: "hm1", archived: false }], activeChapterIndex: 0, lastMessageId: "hm3", lastMessagePreview: "" });
  const mst = tx.objectStore("messages");
  mst.put({ id: "hm1", sessionId: "vn_heart_test", role: "user", rawContent: "秀珍…姐？所以你是 JYP 的练习生还是艺人？", chapterIndex: 0, createdAt: iso });
  mst.put({ id: "hm2", sessionId: "vn_heart_test", role: "assistant", rawContent: "俊锡（压低了嗓音，隔着口罩轻笑了一声）\n他脚步放慢了半拍，眼神在你脸上停顿了一秒。", chapterIndex: 0, createdAt: iso });
  mst.put({ id: "hm3", sessionId: "vn_heart_test", role: "user", rawContent: "所以如果我考虑一下要不要进 JYP 的话，前辈能给我点福利吗。", chapterIndex: 0, createdAt: iso });
  await new Promise(r => tx.oncomplete = r);
  const kv = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const ktx = kv.transaction("entries", "readwrite");
  ktx.objectStore("entries").put({ key: "idol_stage_scenes_v1", value: JSON.stringify({ ch_heart_1: { chapterId: "ch_heart_1", bg: "cafe", ids: [worldId, charId], place: "清潭洞街角", premise: "清潭洞偶遇", startAt: Date.now(), newFaces: ["俊锡"], ended: false } }) });
  await new Promise(r => ktx.oncomplete = r);
}, charId, await page.evaluate(() => window.__idolTest.world.WORLD_CHAR_ID));

await page.reload({ waitUntil: "networkidle2", timeout: 180000 });
await sleep(2000);
await page.waitForFunction(() => window.__idolTest?.people, { timeout: 90000 });

console.log("[3] 编辑页：心动下拉有「有心动线（AI 判断）」");
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "通讯录");
  if (btn) btn.click();
});
await sleep(1200);
await page.evaluate(() => {
  const el = [...document.querySelectorAll("span, b, div")].find(e => e.children.length === 0 && e.textContent.trim() === "俊锡");
  if (el) el.click();
});
await sleep(800);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "编辑");
  if (btn) btn.click();
});
await sleep(800);
const autoOption = await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label="心动程度"]');
  return sel ? [...sel.options].some(o => o.value === "auto") : false;
});
ok(autoOption, "下拉里有 auto 这一项");

console.log("[4] 选 auto 点完成：AI 判断结果写进档案");
await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label="心动程度"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
  setter.call(sel, "auto");
  sel.dispatchEvent(new Event("change", { bubbles: true }));
});
await sleep(300);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "完成");
  if (btn) btn.click();
});
await page.waitForFunction(async () => {
  const raw = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = raw.transaction("entries", "readonly");
  const rec = await new Promise(res => { const q = tx.objectStore("entries").get("idol_people_v1"); q.onsuccess = () => res(q.result); });
  if (!rec?.value) return false;
  const all = JSON.parse(rec.value);
  const j = Object.values(all).find(p => p.role === "JYP 前辈");
  return Boolean(j && j.canCrush && j.heart);
}, { timeout: 20000 });
const saved = await page.evaluate(async () => {
  const raw = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = raw.transaction("entries", "readonly");
  const rec = await new Promise(res => { const q = tx.objectStore("entries").get("idol_people_v1"); q.onsuccess = () => res(q.result); });
  const j = Object.values(JSON.parse(rec.value)).find(p => p.role === "JYP 前辈");
  return { canCrush: j.canCrush, heart: j.heart, rolled: j.rolled };
});
ok(saved.canCrush === true, "canCrush 开了", saved);
ok(saved.heart === "有点在意", "heart 记成 AI 判断的「有点在意」", saved.heart);

console.log("[5] 没戏文也能判断；AI 没回按没感觉兜底");
const noScene = await page.evaluate(async () => {
  const { people } = window.__idolTest;
  const base = people.emptyProfile("tmp");
  const profile = { ...base, layer: "main", group: "HYBE", role: "HYBE 同期", age: "19", gender: "男", canCrush: true, heart: undefined, rolled: true, relation: "认识", met: true, metAt: { at: Date.now(), place: "HYBE 大楼" }, heightCm: 182 };
  delete profile.charId;
  const char = people.createPerson("朴叙", profile);
  const p = people.getProfile(char.id);
  return await people.judgeHeartStart(p, "朴叙");
});
ok(noScene === "有点在意", "没有戏文也走通，返回 mock 的「有点在意」", noScene);

mockReply = "我想想啊，这个有点复杂。";
const fallback = await page.evaluate(async () => {
  const { people } = window.__idolTest;
  const p = Object.values(people.loadProfiles()).find(x => x.role === "HYBE 同期");
  return await people.judgeHeartStart(p, "朴叙");
});
ok(fallback === "没感觉", "AI 回的不是档位时按没感觉兜底", fallback);

console.log("\n页面报错：", errs.length ? errs.slice(0, 5) : "无");

await browser.close();
console.log(`\n${pass} 过 / ${fail} 挂`);
process.exit(fail ? 1 : 0);
