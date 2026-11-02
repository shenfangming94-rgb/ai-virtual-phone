/**
 * YouTube 编辑出镜：AI 把她的姓写错了 → 她改成「是我」→ 出镜、标题、评论里的错名字一起换掉
 * 跑法：node docs/idol/tests/yt-cast.mjs /tmp/ytc   前提：dev 服务在跑（默认 3001）
 */
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const URL = process.env.IDOL_TEST_URL || "http://127.0.0.1:3001/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, JSON.stringify(x).slice(0, 300)); } };
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: `/tmp/idol-ytc-${Date.now()}` });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(URL, { waitUntil: "networkidle2", timeout: 300000 }); await sleep(1500);
await p.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "沈清仪", photo: null, birthday: "2001-04-16", nationality: "中国", start: "2015-03-01", trainLength: "一年半", family: "normal", talents: ["vocal"], company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: 1, facts: [], offers: [], offersMadeAt: 1, nodes: [] }) });
  const t = Date.now();
  st.put({ key: "idol_youtube_v1", value: JSON.stringify({ channels: { co_jyp: { id: "co_jyp", name: "JYP Entertainment", handle: "@JYPEntertainment", kind: "company", companyId: "jyp", subs: 28000000 } }, subs: [], me: { handle: "blue_hour_04" },
    videos: [{ id: "v_me", ch: "co_jyp", title: "[JYP TRAINEE] 林清仪 cover", titleZh: "练习生林清仪翻唱", kind: "练习生", at: t - 2 * 864e5, dur: "2:58", img: { desc: "林清仪站在中间唱歌" }, cast: [{ pos: "中间", name: "林清仪" }, { pos: "左一", name: "韩智元" }], target: 9000, likes: 600, mine: true, announced: true,
      cmts: [{ id: "c1", by: "fan_01", text: "林清仪 목소리 너무 좋다", zh: "林清仪声音太好听了", at: t - 864e5, likes: 12, replies: [{ id: "c2", by: "fan_02", text: "林清仪 데뷔하자", zh: "林清仪快出道", at: t - 800e5, likes: 3 }] }] }] }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "youtube" }, "*")); await sleep(3000);
await p.evaluate(() => [...document.querySelectorAll("*")].find(x => x.children.length === 0 && x.textContent.includes("林清仪"))?.closest("button,a,div[role=button],.yt-card,.yt-vrow,article")?.click()); await sleep(1500);
await p.evaluate(() => document.querySelector(".yt-cast")?.click()); await sleep(800);
await p.screenshot({ path: OUT + "/ytc_edit.png" });
ok(await p.evaluate(() => Boolean(document.querySelector(".yt-castedit"))), "点出镜打开编辑");
await p.evaluate(() => [...document.querySelectorAll(".yt-castedit-row")][0].querySelectorAll("button")[0].click()); await sleep(300);
await p.evaluate(() => document.querySelector(".yt-castedit-head .on").click()); await sleep(1500);
await p.screenshot({ path: OUT + "/ytc_after.png" });
const v = await p.evaluate(() => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get("idol_youtube_v1"); g.onsuccess = () => res(JSON.parse(g.result.value).videos[0]); }; }));
ok(v.cast[0].me === true && v.cast[0].name === "你", "第一行变成她", v.cast);
ok(v.cast[1].name === "韩智元", "别人没动", v.cast);
ok(!JSON.stringify(v).includes("林清仪"), "错名字全换掉了", JSON.stringify(v).match(/.{10}林清仪.{10}/g));
ok(v.title.includes("沈清仪") && v.cmts[0].zh.includes("沈清仪") && v.cmts[0].replies[0].text.includes("沈清仪"), "标题、评论、回复都是对的名字", [v.title, v.cmts[0].zh, v.cmts[0].replies[0].text]);
console.log(`\n${pass} 过 / ${fail} 没过`, errs.length ? "页面报错：" + errs.slice(0, 3).join(" | ") : "");
await b.close();
