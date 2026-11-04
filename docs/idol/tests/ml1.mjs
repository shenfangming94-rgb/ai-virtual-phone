/**
 * Melon：世界资料进目录、榜单、收藏、我的评论、现实歌曲不冒充歌词、歌手主页
 * 跑法：node docs/idol/tests/ml1.mjs /tmp/ml1   前提：dev 服务在跑（默认 3001，IDOL_TEST_URL 覆盖）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 300)); } };
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-ml1-${Date.now()}`, protocolTimeout: 300000 });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 });
await p.waitForFunction(() => window.__worldClock && window.__idolTest, { timeout: 240000, polling: 1000 }); await sleep(2000);
await p.evaluate(async () => {
  const now = new Date().toISOString();
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([{ id: "c1", name: "韩智元", avatar: null, persona: "", wechatID: "c1", tags: [], createdAt: now, updatedAt: now }]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ c1: { layer: "main", group: "", age: "18", publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "", met: true, events: [], note: "", charId: "c1", role: "同期练习生" } }) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "沈清仪", photo: null, birthday: "2001-04-12", nationality: "中国", start: "2015-03-01", trainLength: "一年半", family: "normal", talents: [], company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: 1, facts: [], offers: [], offersMadeAt: 1, nodes: [] }) });
  // 世界资料：LUMINA 三首歌（一张专辑两首 + 单曲），One Way 一首现实翻唱
  st.put({ key: "idol_groups_v1", value: JSON.stringify({
    lumina: { name: "LUMINA", companyId: "jyp", kind: "女团", debut: 2013, members: ["瑞拉", "夏恩", "智秀", "妍熙", "宥娜"], from: "site", at: 1, tier: "mid", songs: [
      { title: "月光信号", year: 2024, album: "LUNA", releasedAt: "2024-03-01", track: 1, note: "主打曲" },
      { title: "银河列车", year: 2024, album: "LUNA", releasedAt: "2024-03-01", track: 2, note: "收录曲" },
      { title: "夏日尽头", year: 2025, releasedAt: "2025-07-20", note: "夏日单曲" },
    ] },
    oneway: { name: "One Way", companyId: "hybe", kind: "男团", debut: 2020, members: ["金道允", "朴序", "李在焕"], from: "site", at: 1, tier: "top", songs: [
      { title: "Love Dive", year: 2021, releasedAt: "2021-04-05", real: true, note: "现实歌曲翻唱舞台" },
    ] },
  }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "melon" }, "*")); await sleep(2500);
ok(await p.evaluate(() => document.body.innerText.includes("今天，听点什么？")), "Melon 首页打开");
await p.screenshot({ path: OUT + "/ml_home.png" });
// 世界里的作品出现在首页（新歌或热度榜）
const homeText = await p.evaluate(() => document.body.innerText);
ok(homeText.includes("月光信号"), "专辑曲出现在首页");
ok(homeText.includes("夏日尽头"), "单曲出现在首页");
ok(homeText.includes("Love Dive"), "现实歌曲出现在首页");
ok(homeText.includes("LUMINA"), "组合名出现在首页");
// 热搜榜页
await p.evaluate(() => [...document.querySelectorAll(".ml-link")].find(x => x.textContent.includes("全部"))?.click()); await sleep(1200);
ok(await p.evaluate(() => document.body.innerText.includes("TOP100") && document.body.innerText.includes("世界热度榜")), "TOP100 榜单页打开");
await p.screenshot({ path: OUT + "/ml_chart.png" });
const rankOrder = await p.evaluate(() => [...document.querySelectorAll(".ml-rank")].map(x => x.textContent));
ok(rankOrder.join(",") === rankOrder.map((_, i) => String(i + 1)).join(","), "榜单名次从 1 连续排");
// 回到首页 → 搜索
await p.evaluate(() => document.querySelector(".ml-bar button")?.click()); await sleep(600);
await p.evaluate(() => [...document.querySelectorAll(".ml-nav button")].find(x => x.textContent.includes("搜索"))?.click()); await sleep(800);
await p.evaluate(() => { const i = document.querySelector(".ml-search input"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "LUMINA"); i.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(800);
const searchText = await p.evaluate(() => document.body.innerText);
ok(searchText.includes("LUMINA") && searchText.includes("2013 出道"), "搜索出歌手与出道年份");
ok(searchText.includes("月光信号"), "搜索出该歌手作品");
await p.screenshot({ path: OUT + "/ml_search.png" });
// 歌手主页
await p.evaluate(() => [...document.querySelectorAll(".ml-row")].find(x => x.textContent.includes("LUMINA") && x.textContent.includes("2013"))?.click()); await sleep(1000);
const artistText = await p.evaluate(() => document.body.innerText);
ok(artistText.includes("历年作品") && artistText.includes("LUNA"), "歌手主页有历年作品（专辑去重一张卡）");
const lunaCount = await p.evaluate(() => [...document.querySelectorAll(".ml-cards button")].filter(x => x.textContent.includes("LUNA")).length);
ok(lunaCount === 1, "同专辑两首歌只出一张专辑卡");
await p.screenshot({ path: OUT + "/ml_artist.png" });
// 点专辑卡进专辑详情 → 曲目两首
await p.evaluate(() => [...document.querySelectorAll(".ml-cards button")].find(x => x.textContent.includes("LUNA"))?.click()); await sleep(1000);
const albumText = await p.evaluate(() => document.body.innerText);
ok(albumText.includes("曲目") && albumText.includes("月光信号") && albumText.includes("银河列车"), "专辑详情列出两首曲目");
ok(albumText.includes("2024"), "专辑显示发行日期年份");
await p.screenshot({ path: OUT + "/ml_album.png" });
// 单曲详情：收藏 + 发评论
// 专辑页返回歌手页 → 点「夏日尽头」单曲详情
await p.evaluate(() => document.querySelector(".ml-bar button")?.click()); await sleep(600);
await p.evaluate(() => [...document.querySelectorAll(".ml-cards button")].find(x => x.textContent.includes("夏日尽头"))?.click()); await sleep(1000);
ok(await p.evaluate(() => document.body.innerText.includes("生成作品介绍与歌词")), "未生成详情的歌有生成按钮");
await p.evaluate(() => [...document.querySelectorAll(".ml-actions button")].find(x => x.textContent.includes("收藏"))?.click()); await sleep(600);
// 封面进播放器 → 评论区发一条
await p.evaluate(() => document.querySelector(".ml-cover-open")?.click()); await sleep(1000);
await p.evaluate(() => document.querySelector('button[aria-label="歌曲评论"]')?.click()); await sleep(800);
await p.evaluate(() => { const t = document.querySelector(".ml-compose textarea"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, "这首歌陪我度过了整个夏天"); t.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(300);
await p.evaluate(() => document.querySelector(".ml-compose button").click()); await sleep(800);
const commentText = await p.evaluate(() => document.body.innerText);
ok(commentText.includes("这首歌陪我度过了整个夏天") && commentText.includes("沈清仪"), "自己发的评论出现，署名是我");
await p.screenshot({ path: OUT + "/ml_comments.png" });
// 我的音乐：收藏的歌在（评论区没有底栏，返回四级：评论→播放器→详情→歌手→首页）
for (let i = 0; i < 4; i++) {
  await p.evaluate(() => document.querySelector(".ml-bar button")?.click()); await sleep(600);
}
await p.evaluate(() => [...document.querySelectorAll(".ml-nav button")].find(x => x.textContent.includes("我的"))?.click()); await sleep(1000);
const meText = await p.evaluate(() => document.body.innerText);
ok(meText.includes("我的收藏") && meText.includes("夏日尽头"), "收藏的歌出现在我的音乐");
await p.screenshot({ path: OUT + "/ml_me.png" });
// 现实歌曲详情：不生成歌词
await p.evaluate(() => [...document.querySelectorAll(".ml-nav button")].find(x => x.textContent.includes("搜索"))?.click()); await sleep(800);
await p.evaluate(() => { const i = document.querySelector(".ml-search input"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "Love Dive"); i.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(600);
await p.evaluate(() => [...document.querySelectorAll(".ml-row")].find(x => x.textContent.includes("Love Dive"))?.click()); await sleep(1000);
const realText = await p.evaluate(() => document.body.innerText);
ok(realText.includes("现实作品"), "现实歌曲标注现实作品");
ok(!realText.includes("韩中歌词"), "现实歌曲不显示原创歌词区块");
// 打开播放器（现实歌）：点封面切歌词面板 → 不给歌词
await p.evaluate(() => document.querySelector(".ml-cover-open")?.click()); await sleep(800);
await p.evaluate(() => document.querySelector('button[aria-label="切换到歌词"]')?.click()); await sleep(500);
ok(await p.evaluate(() => document.body.innerText.includes("现实歌曲暂无可展示歌词")), "播放器里现实歌曲不给歌词");
await p.screenshot({ path: OUT + "/ml_player_real.png" });
// 存档隔离：idol_melon_v1 写进当前存档作用域
const stored = await p.evaluate(() => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get("idol_melon_v1"); g.onsuccess = () => res(g.result?.value); }; }));
ok(!!stored && JSON.parse(stored).likes.length >= 1, "收藏写入 idol_melon_v1");
if (errs.length) { console.log("  页面报错：", errs.slice(0, 6)); fail += errs.length; }
console.log(`\n${pass} 过 / ${fail} 挂`);
await b.close();
process.exit(fail ? 1 : 0);
