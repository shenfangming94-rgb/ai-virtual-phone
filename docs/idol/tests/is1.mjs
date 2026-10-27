// IdolSearch + 邮箱：普通家境没人来找 → 搜公司 → 官网三页 → 投递 → 过几天出结果（保底邀请）→ 邮件进邮箱 app → 在邮箱里接受 → 提醒事项多了试镜
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
function reply(s) {
  if (s.includes("实时热搜")) return JSON.stringify({ trends: [{ q: "LUMINA 回归预告", move: "up3" }, { q: "音乐银行 一位", move: "same" }, { q: "JYP 全球公开试镜", move: "new" }, { q: "Vertex 恩宇 机场", move: "up5" }, { q: "首尔 樱花", move: "new" }, { q: "月光宝盒 第6集", move: "down2" }, { q: "新人女团 出道日", move: "up1" }, { q: "SEVEN DAYS 抢票", move: "down4" }, { q: "Starship 练习生 路透", move: "up2" }, { q: "梨泰院 咖啡店", move: "same" }], news: [{ title: "JYP 上半年全球公开试镜开启", src: "星闻日报", ago: "2小时前" }, { title: "LUMINA 下周回归", src: "K-pop Now", ago: "昨天" }] });
  if (s.includes("官网")) return JSON.stringify({ motto_ko: "진실 · 성실 · 겸손", motto_zh: "真诚 · 诚实 · 谦虚", founded: "1997", hq_ko: "서울 강남구 청담동", hq_zh: "首尔 江南区 清潭洞", nameNote: "", about: [{ h_ko: "우리는 누구인가", h_zh: "我们是谁", ko: "1997년에 설립된 기획사입니다.", zh: "1997 年成立的经纪公司。" }, { h_ko: "연습생 육성", h_zh: "我们怎样培养练习生", ko: "매달 월말평가를 합니다.", zh: "每月一次月考。" }], history: [{ year: "1997", ko: "회사 설립", zh: "公司成立" }, { year: "2012", ko: "걸그룹 LUMINA 데뷔", zh: "女团 LUMINA 出道" }], artists: [{ name: "LUMINA", kind: "女团", size: 5, debut: 2012, style: "明亮少女感", fandom: "Lumi", recent: "下周回归", members: ["朴智恩", "崔叙允", "韩夏恩", "李多仁", "Mina"], songs: [{ title: "Starlight", year: 2012, note: "出道曲" }] }, { name: "Vertex", kind: "男团", size: 6, debut: 2010, style: "力量感", fandom: "Vex", recent: "亚洲巡演" }], notices: [{ tag: "오디션", ko: "2015 글로벌 오디션 접수 시작", zh: "2015 全球试镜开始报名", date: "03.12" }] });
  if (s.includes("搜索结果")) return JSON.stringify({ snippet: "", results: [{ title: "相关新闻一", src: "星闻日报", ago: "3小时前" }, { title: "相关新闻二", src: "娱乐周刊", ago: "昨天" }] });
  if (s.includes("审核组")) return JSON.stringify({ result: "invite", why: "视频里跳舞的节奏感让人印象很深", subject_ko: "[JYP] 서류 심사 결과 안내", subject_zh: "资料审核结果", body: [{ ko: "Flora 님, 안녕하세요. 지원해 주셔서 감사합니다.", zh: "Flora 你好，感谢你的报名。" }, { ko: "실기 오디션에 초대하게 되었습니다.", zh: "我们邀请你参加线下试镜。" }], prep: "自由曲一首，动作方便的衣服" });
  return "好的";
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) { const c = reply(r.postData() || ""); log.push(c.slice(0, 24)); r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) }); }
  else r.continue();
});
const mailHtml = readFileSync(new URL("../../../custom-apps/mail/dist/index.html", import.meta.url), "utf8");
const mailManifest = JSON.parse(readFileSync(new URL("../../../custom-apps/mail/dist/manifest.json", import.meta.url), "utf8"));
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(2000);
await p.evaluate(async (mailHtml, mailManifest) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  for (const k of ["idol_search_v1", "idol_mail_v1", "idol_career_v1", "ai_phone_custom_app_data_v1:nox.mail/mails", "ai_phone_custom_app_data_v1:nox.mail/meta"]) st.delete(k);
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m", enableImageRecognition: false, enableImageGeneration: false }]) });
  st.put({ key: "ai_phone_user_identities_v1", value: JSON.stringify([{ id: "identity-1", name: "Flora", bio: "", gender: "女", age: "16", occupation: "", customSettings: "" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "INFP", looks: "165cm，清纯", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: ["vocal", "dance"], talentNote: "", weakness: "", other: "", signature: null, company: "", no: "x", createdAt: 1 }) });
  st.put({ key: "ai_phone_custom_apps_v1", value: JSON.stringify([{ id: "nox.mail", manifest: mailManifest, entryHtml: mailHtml, assets: {}, installedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]) });
  await new Promise(r => tx.oncomplete = r);
}, mailHtml, mailManifest);
await p.reload({ waitUntil: "networkidle2" }); await sleep(3000);
await p.evaluate(() => { const wc = window.__worldClock; wc.offset = new Date("2015-03-14T21:40:00").getTime() - wc.RealDate.now(); });
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(6000);
const kv = async k => p.evaluate(k => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get(k); g.onsuccess = () => res(g.result?.value); }; }), k);
console.log("offers（普通家境应该没有）", JSON.parse(await kv("idol_career_v1") || "{}").offers?.length);
const open = id => p.evaluate(id => window.postMessage({ type: "OS_CMD", action: "open_app", appId: id }, "*"), id);
const clickText = (sel, t) => p.evaluate((sel, t) => { const el = [...document.querySelectorAll(sel)].find(x => x.textContent.trim() === t || x.textContent.includes(t)); if (el) { el.click(); return true; } return false; }, sel, t);
await open("idolsearch"); await sleep(3500);
await p.screenshot({ path: OUT + "/is1_home.png" });
await p.type(".is-sbox input", "JYP"); await p.keyboard.press("Enter"); await sleep(3000);
await p.screenshot({ path: OUT + "/is2_results.png" });
await clickText(".is-offi", "官网"); await sleep(3500);
await p.screenshot({ path: OUT + "/is3_about.png" });
await clickText(".is-jh button", "Artists"); await sleep(800);
await p.screenshot({ path: OUT + "/is4_artists.png" });
await clickText(".is-gc", "LUMINA"); await sleep(2000);
await p.screenshot({ path: OUT + "/is5_group.png" });
await p.evaluate(() => document.querySelector(".is-ghb").click()); await sleep(500);
await clickText(".is-jh button", "Audition"); await sleep(800);
await p.screenshot({ path: OUT + "/is6_audition.png" });
await clickText(".is-apply .ab", "写投递资料"); await sleep(800);
await p.type(".is-form input[placeholder^='不附']", "练习室跳《Love Shot》一分钟");
await p.type(".is-form textarea", "从小学开始跟着视频学跳舞。");
await p.screenshot({ path: OUT + "/is7_form.png" });
await clickText(".is-cta", "提交"); await sleep(1500);
await p.screenshot({ path: OUT + "/is8_apps.png" });
// 过 9 天：出结果
await p.evaluate(() => { const wc = window.__worldClock; wc.offset += 9 * 864e5; }); await sleep(9000);
console.log("apps", JSON.stringify(JSON.parse(await kv("idol_search_v1")).apps.map(a => [a.status, a.reason, a.forced])));
await p.screenshot({ path: OUT + "/is9_banner.png" });
await clickText(".is-tabbar button", "我的投递"); await sleep(800);
await p.screenshot({ path: OUT + "/is10_apps2.png" });
// 打开邮箱 app
await p.evaluate(() => { const b = document.querySelector(".is-ap"); b?.click(); }); await sleep(800);
await p.screenshot({ path: OUT + "/is11_detail.png" });
await clickText(".is-gbtn", "去邮箱"); await sleep(5000);
const frame = () => p.frames().find(f => f !== p.mainFrame() && f.url() !== "about:blank") || p.frames()[1];
await p.screenshot({ path: OUT + "/is12_mail.png" });
const fr = p.frames().find(f => f !== p.mainFrame());
console.log("frames", p.frames().length);
if (fr) {
  await fr.evaluate(() => { const el = [...document.querySelectorAll("[data-act]")].find(x => x.textContent.includes("JYP") && x.textContent.includes("오디션")); el?.click(); }); await sleep(1500);
  await p.screenshot({ path: OUT + "/is13_read.png" });
  await fr.evaluate(() => document.querySelector('[data-act="idol-accept"]')?.click()); await sleep(7000);
  await p.screenshot({ path: OUT + "/is14_accepted.png" });
}
console.log("nodes", JSON.parse(await kv("idol_career_v1")).nodes.map(n => `${n.kind}:${n.title}:${new Date(n.dueAt).toLocaleString()}`).join(" | "));
console.log(log, errs.slice(0, 5));
await b.close();
