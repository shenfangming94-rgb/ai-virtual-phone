// 圈内名册：大事记先写的团，官网照着来；别家官网抢不走；重写官网改不了成员
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let siteRound = 0; const prompts = [];
function reply(s) {
  if (s.includes("圈内大事记")) return JSON.stringify({ items: [{ day: 5, company: "SM", group: "Aurora", title: "Aurora 回归", note: "" }, { day: 9, company: "", group: "", title: "金唱片颁奖", note: "" }] });
  if (s.includes("的官网")) {
    prompts.push(s);
    if (s.includes("「JYP」")) return JSON.stringify({ about: [{ h_ko: "a", h_zh: "a", ko: "a", zh: "a" }], history: [], notices: [], artists: [{ name: "Aurora", kind: "女团", members: ["抢人甲"], debut: 2011 }, { name: "LUMINA", kind: "女团", members: ["朴智恩", "崔叙允"], debut: 2012 }] });
    siteRound++;
    const members = siteRound === 1 ? ["金瑞雅", "宋夏妍", "林恩"] : ["换人乙", "换人丙"];
    return JSON.stringify({ about: [{ h_ko: "a", h_zh: "a", ko: "a", zh: "a" }], history: [], notices: [], artists: [{ name: "Aurora", kind: "女团", size: 3, debut: 2013, members, recent: siteRound === 1 ? "准备回归" : "回归一位" }] });
  }
  return "{}";
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("mock.test") && r.method() === "OPTIONS") { r.respond({ status: 204, headers: CORS }); return; }
  if (r.url().includes("mock.test")) { const c = reply(r.postData() || ""); r.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: c }, finish_reason: "stop" }] }) }); }
  else r.continue();
});
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(1500);
await p.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  for (const k of ["idol_groups_v1", "idol_search_v1", "idol_almanac_v1"]) st.delete(k);
  st.put({ key: "ai_phone_api_configs_v1", value: JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m" }]) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: [], talentNote: "", weakness: "", other: "", signature: null, company: "", no: "x", createdAt: 1 }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(3000);
const G = () => p.evaluate(() => window.__idolGroups.load());
await p.evaluate(() => window.__idolGroups.month("2015-03", true));
console.log("1 大事记先写：", JSON.stringify(await G()));
await p.evaluate(() => window.__idolGroups.site("sm", true));
console.log("2 SM 官网补成员：", JSON.stringify((await G()).aurora));
console.log("   SM 官网提示词里有 Aurora 要照抄：", prompts[0].includes("Aurora（SM"));
await p.evaluate(() => window.__idolGroups.site("jyp", true));
const g3 = await G();
console.log("3 JYP 想抢 Aurora：", g3.aurora.companyId, g3.aurora.members.join("、"), "| LUMINA 进了 JYP：", g3.lumina?.companyId);
await p.evaluate(() => window.__idolGroups.site("sm", true));
const g4 = await G();
console.log("4 SM 官网重写换成员：", g4.aurora.members.join("、"), "| 最近：", g4.aurora.recent);
console.log(errs.slice(0, 3));
await b.close();
