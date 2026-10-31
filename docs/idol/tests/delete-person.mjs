/**
 * 通讯录删除人物流程测试（独立浏览器存档）
 *
 * 验的是：
 *   1. 编辑页滚到底点「删除这个人」，确认框在视口内（之前 absolute 定位会在滚到底时飘出视口）
 *   2. 点删除后：档案和角色都没了、列表刷新、聊天联系人一并清掉
 *
 * 跑法：node docs/idol/tests/delete-person.mjs
 * 前提：本项目 dev 服务在跑（默认 http://127.0.0.1:3001/，可用 IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const TEST_URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, JSON.stringify(extra)); } };

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  userDataDir: `/tmp/idol-delete-test-${Date.now()}`,
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String(e.message)));

await page.goto(TEST_URL, { waitUntil: "networkidle2", timeout: 180000 });
await sleep(2000);
await page.waitForFunction(() => window.__idolTest?.people, { timeout: 90000 });

// 建一个人物并加进 KKT 联系人
const info = await page.evaluate(() => {
  const { people, chat } = window.__idolTest;
  const base = people.emptyProfile("tmp");
  const profile = { ...base, layer: "main", group: "测试", role: "测试人物", age: "20", gender: "男", rolled: true };
  delete profile.charId;
  const char = people.createPerson("测试人物", profile);
  chat.addChatContact(char.id);
  return { id: char.id };
});
console.log("created:", info.id);

await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "通讯录"); b?.click(); });
await sleep(1000);
await page.evaluate(() => { const el = [...document.querySelectorAll("span,b")].find(e => e.children.length === 0 && e.textContent.trim() === "测试人物"); el?.click(); });
await sleep(700);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "编辑"); b?.click(); });
await sleep(700);
await page.evaluate(() => { const pg = document.querySelector(".ct-edit"); pg.scrollTop = pg.scrollHeight; });
await sleep(300);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "删除这个人"); b?.click(); });
await sleep(400);

console.log("[1] 滚到底点删除，确认框在视口内");
const vis = await page.evaluate(() => {
  const d = document.querySelector(".ct-dialog")?.getBoundingClientRect();
  return d ? { top: d.top, bottom: d.bottom, vh: window.innerHeight } : null;
});
ok(Boolean(vis) && vis.top >= 0 && vis.bottom <= vis.vh, "确认框完整可见", vis);

console.log("[2] 点删除：档案、角色、聊天联系人都清掉");
await page.evaluate(() => { const b = [...document.querySelectorAll(".ct-dialog-btns button")].find(x => x.textContent.trim() === "删除"); b?.click(); });
await sleep(1500);
const after = await page.evaluate(async (id) => {
  const { people, characters, chat } = window.__idolTest;
  const p = Object.values(people.loadProfiles()).some(x => x.charId === id);
  const c = characters.loadCharacters().some(x => x.id === id);
  const k = chat.loadChatContacts().some(x => x.characterId === id);
  const rows = [...document.querySelectorAll(".ct-row-name")].map(x => x.textContent);
  return { profile: p, char: c, kakao: k, inList: rows.includes("测试人物") };
}, info.id);
ok(after.profile === false, "档案删了", after);
ok(after.char === false, "角色删了", after);
ok(after.kakao === false, "KKT 联系人也清了", after);
ok(after.inList === false, "列表里没了", after);

console.log("\n页面报错：", errs.length ? errs.slice(0, 5) : "无");
await browser.close();
console.log(`\n${pass} 过 / ${fail} 挂`);
process.exit(fail ? 1 : 0);
