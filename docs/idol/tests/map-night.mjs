/**
 * 此刻大地图日/夜版切换测试（独立浏览器存档，不碰用户的浏览器数据）
 *
 * 验的是：
 *   1. 世界时间 18:00～6:00 → 首尔地图用夜版图，钉子同一套
 *   2. 其余时间 → 日版图
 *
 * 跑法：node docs/idol/tests/map-night.mjs
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
  userDataDir: `/tmp/idol-map-night-${Date.now()}`,
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String(e.message)));

await page.goto(TEST_URL, { waitUntil: "networkidle2", timeout: 180000 });
await sleep(1500);
await page.waitForFunction(() => window.__idolTest?.people, { timeout: 90000 });

// 设世界时间到某个小时（改内存 offset，等 useWorldNow 的 20s 心跳刷 UI）
const setHour = async hour => {
  await page.evaluate(h => {
    const wc = window.__worldClock;
    const t = new wc.RealDate(wc.RealDate.now());
    t.setHours(h, 0, 0, 0);
    wc.offset = t.getTime() - wc.RealDate.now();
  }, hour);
  await sleep(22500);
};
const mapSrc = () => page.evaluate(() => document.querySelector(".stg-map img")?.getAttribute("src") ?? "");

// 打开此刻 app
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "此刻");
  if (btn) btn.click();
});
await sleep(1200);
const opened = await page.evaluate(() => Boolean(document.querySelector(".stg-hud")));
ok(opened, "此刻 app 打开了");
const src0 = await mapSrc();
ok(Boolean(src0), "首尔地图图已加载", src0);

console.log("[1] 白天 12:00 → 日版");
await setHour(12);
const srcDay = await mapSrc();
ok(srcDay.includes("seoul.jpg") && !srcDay.includes("night"), "用日版", srcDay);

console.log("[2] 晚上 22:00 → 夜版");
await setHour(22);
const srcNight = await mapSrc();
ok(srcNight.includes("seoul-night.jpg"), "用夜版", srcNight);

console.log("[3] 凌晨 05:00 → 还是夜版");
await setHour(5);
const srcDawn = await mapSrc();
ok(srcDawn.includes("seoul-night.jpg"), "凌晨仍用夜版", srcDawn);

console.log("[4] 早上 07:00 → 换回日版");
await setHour(7);
const srcMorning = await mapSrc();
ok(srcMorning.includes("seoul.jpg") && !srcMorning.includes("night"), "换回日版", srcMorning);

console.log("[5] 钉子还在（夜版和日版同一套）");
await setHour(22);
const pins = await page.evaluate(() => document.querySelectorAll(".stg-mpin").length);
ok(pins >= 10, "夜版地图上钉子没少", pins);

console.log("\n页面报错：", errs.length ? errs.slice(0, 5) : "无");

await browser.close();
console.log(`\n${pass} 过 / ${fail} 挂`);
process.exit(fail ? 1 : 0);
