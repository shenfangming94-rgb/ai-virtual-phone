/**
 * 缺席豁免测试（独立浏览器存档）
 *
 * 验的是：
 *   1. 戏还开着（未结束）时，超时的节点不被判缺席
 *   2. 没有开着的戏时，超时节点照常判缺席
 *   3. 提醒事项里缺席的事项左滑有「删除」
 *
 * 跑法：node docs/idol/tests/absent-exempt.mjs（前提：dev 服务在跑，IDOL_TEST_URL 可覆盖）
 */
import puppeteer from "puppeteer-core";
const TEST_URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, JSON.stringify(extra)); } };

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
async function newPage(withOpenScene) {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
    userDataDir: `/tmp/idol-absent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
  await page.setRequestInterception(true);
  page.on("request", r => {
    if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
    if (r.url().includes("mock.test")) { r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: "好的。" }, finish_reason: "stop" }] }) }); return; }
    r.continue();
  });
  await page.goto(TEST_URL, { waitUntil: "networkidle2", timeout: 180000 });
  await sleep(2000);
  await page.waitForFunction(() => window.__idolTest?.people, { timeout: 90000 });
  const overdue = Date.now() - 3 * 3600e3;
  await page.evaluate(async (overdue, withOpenScene) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
    const tx = db.transaction("entries", "readwrite");
    const st = tx.objectStore("entries");
    st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "pre", companyId: undefined, nodes: [
      { id: "n_report", kind: "first_day", title: "公司报到", place: "JYP 公司大楼 大厅", dueAt: overdue, status: "pending", companyId: "jyp" },
    ], offers: [] }) });
    if (withOpenScene) {
      st.put({ key: "idol_stage_scenes_v1", value: JSON.stringify({ ch_report: { chapterId: "ch_report", bg: "company", ids: ["world"], place: "JYP 公司大楼 大厅", premise: "报到", startAt: overdue, newFaces: [], ended: false, nodeId: "n_report" } }) });
    }
    await new Promise(r => tx.oncomplete = r);
  }, overdue, withOpenScene);
  await page.reload({ waitUntil: "networkidle2", timeout: 180000 });
  await sleep(2000);
  await page.waitForFunction(() => window.__idolTest?.career, { timeout: 90000 });
  return { browser, page };
}
const nodeStatus = page => page.evaluate(async () => {
  const { career } = window.__idolTest;
  return career.loadCareer().nodes.find(n => n.id === "n_report")?.status ?? "gone";
});

console.log("[1] 戏开着：超时节点不被判缺席（等两个 tick 周期）");
{
  const { browser, page } = await newPage(true);
  await sleep(12000);
  ok((await nodeStatus(page)) === "pending", "还是 pending，没判缺席", await nodeStatus(page));
  await browser.close();
}

console.log("[2] 没开着的戏：超时节点照常判缺席");
{
  const { browser, page } = await newPage(false);
  await sleep(12000);
  ok((await nodeStatus(page)) === "absent", "判成缺席了", await nodeStatus(page));
  await browser.close();
}

console.log("[3] 提醒事项里缺席的事项左滑有删除");
{
  const { browser, page } = await newPage(false);
  await sleep(12000);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "提醒事项"); b?.click(); });
  await sleep(1000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.includes("请假"));
    b?.click();
  });
  await sleep(800);
  const hasDel = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll(".rm-swipe")];
    const row = rows.find(r => r.textContent.includes("公司报到"));
    if (!row) return "no-row";
    const el = row.querySelector("[data-swipe]") || row.firstElementChild || row;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x - 120, clientY: y, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x - 120, clientY: y, pointerId: 1 }));
    await new Promise(res => setTimeout(res, 400));
    return [...document.querySelectorAll(".rm-acts .a-del")].some(b => b.textContent.includes("删除")) ? "has-del" : "no-del";
  });
  ok(hasDel === "has-del", "左滑出现删除按钮", hasDel);
  await browser.close();
}

console.log(`\n${pass} 过 / ${fail} 挂`);
process.exit(fail ? 1 : 0);
