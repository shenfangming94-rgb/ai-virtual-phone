// 文风对比（真 API）：两个预设的 KakaoTalk（暧昧调情 / 朋友闲聊）+ 日月西剧情（月末考核群像 / 汉江暧昧约会，人物先韩后中 vs 全韩语再翻中文）
// 用法：K=key node vo1.mjs OUT [setup|run]
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const OUT = process.argv[2] || ".";
const KEY = process.env.K;
const MODEL = "摇光-gemini-3.8-flash";
const P1 = fs.readFileSync("/Users/flora/Downloads/【日月西】float v0.2 @电波系.json", "utf8");
const P2 = fs.readFileSync("/Users/flora/Downloads/This World【Float】1.5修正ver—————by我是树.json", "utf8");
const STYLE = fs.readFileSync(new URL("./vo-style.txt", import.meta.url), "utf8");
const BUBBLE = fs.readFileSync(new URL("./vo-style-bubble.txt", import.meta.url), "utf8");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
let calls = 0, blocked = 0;
let allow = null; // 当前允许的请求必须包含这段文字
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("qimingx") && r.method() === "POST") {
    const body = r.postData() || "";
    const isGen = body.includes("沉浸式") || body.includes("当前剧情 APP");
    if (!process.env.DRY && allow && body.includes(allow) && isGen && calls < 4) { calls++; console.log("  → API 调用", calls); r.continue(); }
    else { blocked++; if (process.env.DRY && allow) fs.writeFileSync(`${OUT}/body_${blocked}_${allow.slice(0, 6)}.json`, body); r.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "test blocked" } }) }); }
    return;
  }
  r.continue();
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(5000);
// 开局资料
await p.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "2006-04-12", nationality: "中国", mbti: "INFP", looks: "黑长直，笑起来眼睛弯", start: "2025-03-01", trainLength: "两年", family: "normal", familyCustom: "", familyNote: "", talents: ["vocal"], talentNote: "声音干净", weakness: "舞蹈底子弱", other: "", signature: null, company: "JYP", no: "x", createdAt: 1 }) });
  st.put({ key: "idol_career_v1", value: JSON.stringify({ stage: "trainee", companyId: "jyp", signedAt: new Date("2025-03-02T09:00:00").getTime(), facts: [], offers: [], offersMadeAt: 1, nodes: [] }) });
  await new Promise(r => tx.oncomplete = r);
});
await p.reload({ waitUntil: "networkidle2" }); await sleep(6000);
await p.evaluate(() => { const wc = window.__worldClock; wc.offset = new Date("2025-06-30T22:00:00").getTime() - wc.RealDate.now(); });
await sleep(7000);
const ids = await p.evaluate(async ({ KEY, MODEL, P1, P2, STYLE, BUBBLE }) => {
  const { settings, people, story } = window.__idolTest;
  settings.saveApiConfigs([{ id: "qmx", name: "启明星", provider: "openai", apiKey: KEY, baseUrl: "https://api2.qimingx.net/v1", defaultModel: MODEL, enableImageRecognition: false, enableImageGeneration: false }]);
  const a = settings.parsePresetFromJson(P1, "日月西"); a.id = "p_rys";
  const t = settings.parsePresetFromJson(P2, "This World"); t.id = "p_tw";
  const on = ["对话专注", "一个人类", "去油腻八股", "生活颗粒感"];
  const onIds = t.prompts.filter(x => on.some(n => (x.name || "").includes(n))).map(x => x.identifier);
  t.prompts = t.prompts.map(x => onIds.includes(x.identifier) ? { ...x, enabled: true } : x);
  if (t.prompt_order) t.prompt_order = t.prompt_order.map(o => onIds.includes(o.identifier) ? { ...o, enabled: true } : o);
  settings.savePresets([...settings.loadPresets().filter(x => x.id !== "p_rys" && x.id !== "p_tw"), a, t]);
  const cfg = settings.loadBindingConfig();
  cfg.globalDefaults = { ...cfg.globalDefaults, apiConfigId: "qmx", presetId: "p_rys" };
  settings.saveBindingConfig(cfg);
  // 文风方案
  const repo = story.loadStorySchemeRepository();
  story.saveStorySchemeRepository({ ...repo, proseStyleSchemes: [{ id: "ps_life", name: "来点生活", prompt: STYLE }, { id: "ps_bubble", name: "气泡水", prompt: BUBBLE }, ...repo.proseStyleSchemes.filter(x => x.id !== "ps_life" && x.id !== "ps_bubble")] });
  const base = { ...people.emptyProfile(""), layer: "main", met: true };
  const mk = (name, extra) => people.createPerson(name, { ...base, ...extra }).id;
  const jiwon = mk("韩智元", { group: "同期练习生", role: "JYP 男练习生，和她同期", age: "19", gender: "男", isIdol: true, mbti: "ISTJ", privateLines: ["话少，回消息慢，害羞的时候会突然很正经", "深夜喜欢一个人在练习室录 cover", "嘴上不说，会默默记住她随口说过的话"], speech: "句子短，偶尔冒出一句很直白的话把人噎住", relation: "暧昧", canCrush: true, heart: "很喜欢", withYou: "第一次见她觉得她唱歌的声音很干净", status: { text: "在准备下个月的月末评价，排名在中间", kakao: "", at: 1 }, events: [{ id: "e1", at: new Date("2025-06-20T23:30:00").getTime(), place: "便利店", text: "她把最后一盒香蕉牛奶让给了他" }, { id: "e2", at: new Date("2025-06-27T01:00:00").getTime(), place: "练习室", text: "两个人练到凌晨，他送她回宿舍，在门口站了很久没说话" }] });
  const daeun = mk("申多恩", { group: "同期练习生", role: "JYP 女练习生，她的同期和室友", age: "18", gender: "女", isIdol: true, mbti: "ENFP", privateLines: ["嘴硬心软，嫌弃人的时候其实在关心", "练完舞要去便利店买香蕉牛奶", "一紧张就话多"], speech: "话多，爱用ㅋㅋ，喜欢给人起外号", relation: "好朋友", status: { text: "脚踝有点旧伤，没跟老师说", kakao: "", at: 1 }, events: [{ id: "e3", at: new Date("2025-06-24T21:00:00").getTime(), place: "练习室", text: "她替多恩挡了老师的一顿骂" }] });
  const seoyeon = mk("李瑞妍", { group: "同期练习生", role: "JYP 女练习生，同期里排名最靠前", age: "19", gender: "女", isIdol: true, privateLines: ["要强，对自己狠，对别人客气但有距离", "考核前会一个人对着镜子默念动作"], relation: "认识" });
  const teacher = mk("朴珍熙", { group: "公司", role: "JYP 练习生管理老师（室长）", age: "34", gender: "女", isIdol: false, privateLines: ["说话直，骂人不带脏字但很扎心", "其实很护着练习生，只是不表现"], relation: "认识" });
  return { jiwon, daeun, seoyeon, teacher };
}, { KEY, MODEL, P1, P2, STYLE, BUBBLE });
const yunho = await p.evaluate(() => {
  const { people } = window.__idolTest;
  const ch = people.createPerson("姜允浩", { ...people.emptyProfile(""), layer: "main", met: true, group: "同期练习生", role: "韩国人，JYP 男练习生，和她同期", age: "20", gender: "男", isIdol: true, mbti: "ENFP",
    privateLines: ["狗狗一样黏人，见到她眼睛就亮，藏不住", "话多爱笑，撩人是本能，直球，说完自己先耳朵红", "会故意凑很近、找各种借口碰她，被她瞪就笑着往后躲一点又凑回来", "认真起来眼神很烫，嗓音会突然压低"],
    speech: "黏糊糊地叫她名字，爱拖长音撒娇，偶尔冒出一句很直的情话", relation: "暧昧", canCrush: true, heart: "很喜欢", withYou: "第一次见她就觉得完了，一眼就喜欢",
    status: { text: "月末评价排名升了五名，心情很好", kakao: "", at: 1 },
    events: [{ id: "y1", at: new Date("2025-06-28T23:00:00").getTime(), place: "练习室", text: "他手把手教她 wave，贴得很近，两个人都没说话" }, { id: "y2", at: new Date("2025-06-29T22:30:00").getTime(), place: "宿舍楼下", text: "下雨，他把外套罩在她头上，自己淋着跑回男生宿舍" }] });
  const p = people.getProfile(ch.id); people.saveProfile({ ...p, relation: "暧昧", canCrush: true, heart: "很喜欢" });
  return ch.id;
});
console.log("环境好了", ids, "errs", errs);
fs.writeFileSync(OUT + "/ids.json", JSON.stringify(ids));
// ── KakaoTalk ──
const kkt = async (preset, charId, line, tag) => {
  await p.evaluate(async ({ preset, charId, line }) => {
    const { settings, chat, follow } = window.__idolTest;
    const cfg = settings.loadBindingConfig(); cfg.globalDefaults = { ...cfg.globalDefaults, presetId: preset }; settings.saveBindingConfig(cfg);
    const s = chat.createOrGetSession(charId);
    chat.pushChatMessage({ sessionId: s.id, role: "user", content: line, status: "sent" });
    await follow.requestBackgroundChatReply(s.id);
  }, { preset, charId, line });
  const msgs = await p.evaluate(charId => { const { chat } = window.__idolTest; const s = chat.createOrGetSession(charId); return chat.loadChatMessages(s.id).map(m => `${m.role === "user" ? "我" : "他"}：${m.content}`); }, charId);
  fs.writeFileSync(`${OUT}/kkt_${tag}.txt`, msgs.join("\n"));
  console.log(`\n== ${tag}\n` + msgs.join("\n"));
};

const LINE1 = "考完试你跑哪去了 我找了你半天";
allow = null;
const LANG_B = "【语言】人物说话：韩国人先写韩语原句，下一行用括号写中文翻译；旁白用中文。";
const LANG_K = "【语言】旁白和人物说话全部先用韩语写；每一段韩语写完，紧跟着另起一段写这一段的完整中文翻译。";
const scene = async (place, premise, peopleIds, lang, tag, style = "ps_life") => {
  const sid = await p.evaluate(({ place, premise, peopleIds, lang, style }) => {
    const { settings, world, story } = window.__idolTest;
    const cfg = settings.loadBindingConfig(); cfg.globalDefaults = { ...cfg.globalDefaults, presetId: "p_rys" }; settings.saveBindingConfig(cfg);
    const { session } = world.createWorldScene(place, premise, peopleIds);
    story.updateStorySession(session.id, { settings: { minChars: 800, maxChars: 1000, userPerspective: "second", activeProseStyleSchemeId: style, extraPrompt: lang } });
    story.saveStoryLaunchTarget({ ...session });
    return session.id;
  }, { place, premise, peopleIds, lang, style });
  allow = premise.slice(0, 12);
  await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "story" }, "*"));
  let text = "";
  for (let i = 0; i < (process.env.DRY ? 4 : 90) && !text; i++) {
    await sleep(3000);
    text = await p.evaluate(sid => { const m = window.__idolTest.story.loadStoryMessages(sid).filter(x => x.role === "assistant"); return m.length ? (m[m.length - 1].renderedContent || m[m.length - 1].rawContent) : ""; }, sid);
  }
  allow = null;
  await sleep(2500);
  fs.writeFileSync(`${OUT}/story_${tag}.txt`, text);
  console.log(`\n== ${tag}（${text.length} 字）\n${text.slice(0, 300)}…`);
  // 截长图：把剧情滚动区一屏屏截下来
  const scroller = `[...document.querySelectorAll("*")].filter(e => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== "visible" && e.clientHeight > 300).sort((a, b) => b.clientHeight - a.clientHeight)[0]`;
  await p.evaluate(`(() => { const el = ${scroller}; if (el) el.scrollTop = 0; })()`); await sleep(500);
  for (let k = 0; k < 7; k++) {
    await p.screenshot({ path: `${OUT}/story_${tag}_${k}.png` });
    const more = await p.evaluate(`(() => { const el = ${scroller}; if (!el) return false; const b = el.scrollTop; el.scrollTop += el.clientHeight * 0.85; return el.scrollTop > b; })()`);
    await sleep(500);
    if (!more) break;
  }
  await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "clock" }, "*")); await sleep(2000);
};
await p.evaluate(() => document.querySelector(".lock-swipe")?.click()); await sleep(800);
const P_DATE = "凌晨一点，她和姜允浩偷溜出宿舍来汉江约会，两个人坐在江边便利店门口的塑料椅上分一碗拉面，他的膝盖一直有意无意碰着她的膝盖";
await scene("汉江公园", P_DATE, [yunho], LANG_B, "自然_先韩后中", "style-natural");
await scene("汉江公园", P_DATE, [yunho], LANG_K, "自然_全韩语", "style-natural");
await scene("汉江公园", P_DATE, [yunho], LANG_B, "气泡水_先韩后中", "ps_bubble");
await scene("汉江公园", P_DATE, [yunho], LANG_K, "气泡水_全韩语", "ps_bubble");
console.log("errs", errs.slice(0, 5), "calls", calls, "blocked", blocked);
await b.close();
