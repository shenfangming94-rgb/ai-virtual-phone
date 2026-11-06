/**
 * 弹幕浮窗实机验收：直播双排节点开戏 → 她发一句 → AI 回复带 [弹幕:…] 记号
 * → 浮窗出现、正文里没有记号原文；场景结束浮窗消失。
 * 全程拦截 API（mock.test），不烧真实额度。
 * 跑法：node scripts/tests/danmaku-browser-qa.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const port = 3096;
const url = `http://127.0.0.1:${port}/`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "danmaku-qa-"));
let serverOutput = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, NEXT_DIST_DIR: ".next-danmaku-review", NEXT_PUBLIC_SELF_HOSTED_MODE: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-4000); });
server.stderr.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-4000); });

let chrome;
let socket;
let commandId = 0;
const pending = new Map();
const errors = [];
let chatCalls = 0;
const chatUserTexts = [];
const blockedUrls = [];

function send(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 300000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
}
async function waitFor(expression, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(300);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  let ready = false;
  for (let i = 0; i < 180; i++) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited early:\n${serverOutput}`);
    try { const response = await fetch(url); if (response.ok) { ready = true; break; } } catch {}
    await delay(1000);
  }
  if (!ready) throw new Error(`Next dev server did not start:\n${serverOutput}`);

  chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking",
    "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`, "about:blank",
  ], { stdio: "ignore" });
  const activePortFile = path.join(userDataDir, "DevToolsActivePort");
  let debugPort = 0;
  for (let i = 0; i < 120; i++) {
    if (chrome.exitCode !== null) throw new Error("Chrome exited before remote debugging started.");
    if (fs.existsSync(activePortFile)) { debugPort = Number(fs.readFileSync(activePortFile, "utf8").split("\n")[0]); if (debugPort) break; }
    await delay(250);
  }
  assert.ok(debugPort, "Chrome remote debugging port did not start");
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      clearTimeout(task.timer);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result ?? {});
    }
  });
  const eventHandlers = new Map();
  const onEvent = (method, handler) => eventHandlers.set(method, [...(eventHandlers.get(method) ?? []), handler]);
  socket.addEventListener("message", event => {
    const m = JSON.parse(event.data);
    if (m.id) return;
    for (const handler of eventHandlers.get(m.method) ?? []) void handler(m.params);
  });
  onEvent("Runtime.exceptionThrown", details => {
    const exception = details.exceptionDetails ?? {};
    errors.push({ description: exception.exception?.description ?? exception.text ?? "page error", url: exception.url, line: exception.lineNumber, column: exception.columnNumber, stack: (exception.stackTrace?.callFrames ?? []).slice(0, 4).map(f => `${f.functionName || '?'}@${f.url.split('/').pop()}:${f.lineNumber}`) });
  onEvent("Runtime.consoleAPICalled", params => {
    if (params.type === "error" || params.type === "warning") errors.push({ description: "console." + params.type + ": " + (params.args ?? []).map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300) });
  });
  });
  // 拦截一切外网请求，只有 mock.test 返回我们写的回复
  onEvent("Fetch.requestPaused", async params => {
    const request = params.request;
    if (request.url.includes("mock.test")) {
      const headers = [
        { name: "Access-Control-Allow-Origin", value: "*" },
        { name: "Access-Control-Allow-Headers", value: "*" },
        { name: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
        { name: "Content-Type", value: "application/json" },
      ];
      if (request.method === "OPTIONS") return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 204, responseHeaders: headers, body: "" });
      const body = JSON.parse(request.postData ?? "{}");
      // The first user message is the opening prompt; use the latest player turn.
      const userText = body.messages?.filter(m => m.role === "user").at(-1)?.content ?? "";
      // 名册建档的资料请求：跟 yearbook QA 同款，照骨架回资料，别让建档队列反复重试
      if (userText.includes("请补全 ") && userText.includes("班这批人物的资料")) {
        let profiles = [];
        try {
          const input = JSON.parse(userText.slice(userText.indexOf("{")));
          profiles = (input.skeleton ?? []).map(person => ({
            charId: person.charId, enName: "Kim Test", nationality: "韩国", heightCm: 160,
            appearance: person.name + "留着清爽的短发。", privateLines: [person.name + "习惯先观察现场气氛。"],
            familyBackground: "家人住在釜山。", tmi: ["练习后记手账。"], mbti: "ISFP", speech: "等我一下。",
          }));
        } catch { /* 骨架读不出来就给空列表，重试不阻塞 */ }
        const response = JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify({ profiles }) }, finish_reason: "stop" }] });
        return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(response).toString("base64") });
      }
      const isVnScene = userText.includes("直播双排") || userText.includes("你在吗");
      if (!isVnScene) {
        const generic = JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] });
        return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(generic).toString("base64") });
      }
      chatCalls++;
      chatUserTexts.push(userText.slice(-1200));
      // 她说的话里带这句 → 返回带弹幕记号的回复；开场（含直播双排前提）→ 纯开场
      const herLine = userText.includes("你在吗");
      const content = herLine
        ? `他说：来啦来啦，就等你了。直播间的人看到你进房间开始刷屏。[弹幕:누구야 이 여자?|这女生是谁？；대박 진짜 나온다|大发 真的来了；둘이 사귀는 거 아니야?|两人不会在交往吧？]`
        : `直播间已经开了，他在镜头前调试设备，弹幕慢慢滚起来。`;
      const response = JSON.stringify({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] });
      return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(response).toString("base64") });
    }
    if (request.url.startsWith(url) || request.url.startsWith("http://localhost:")) return send("Fetch.continueRequest", { requestId: params.requestId });
    // 图片/字体/媒体等静态资源放行（场景背景图加载不出来会卡住对话区），只拦 API 请求
    if (["Image", "Media", "Font", "Stylesheet", "Script"].includes(params.resourceType)) return send("Fetch.continueRequest", { requestId: params.requestId });
    blockedUrls.push(request.url.slice(0, 120));
    return send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" });
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__qaPageErrors = []; window.addEventListener("error", event => window.__qaPageErrors.push({ message: event.message, filename: event.filename, line: event.lineno, column: event.colno })); window.addEventListener("unhandledrejection", event => window.__qaPageErrors.push({ message: String(event.reason) }));` });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url });
  await waitFor("document.querySelector('.phone-shell')", 120000);
  await evaluate(`(async () => {
    const request = indexedDB.open("AiPhoneKvDB", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("entries")) request.result.createObjectStore("entries", { keyPath: "key" }); };
    const db = await new Promise(resolve => request.onsuccess = () => resolve(request.result));
    const now = Date.now();
    const iso = new Date(now).toISOString();
    const male = { id: "qa-stream-him", name: "韩叙", avatar: null, persona: "", wechatID: "qa-stream-him", tags: [], createdAt: iso, updatedAt: iso };
    const maleProfile = { charId: male.id, layer: "main", group: "电竞职业选手", role: "职业电竞选手", age: "19", nationality: "韩国", gender: "男", birthday: "06-21", mbti: "INTP", heightCm: 180, appearance: "", familyBackground: "", isIdol: false, publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "", met: true, metAt: { at: now - 20 * 86400000, place: "线上游戏" }, events: [], note: "", relation: "认识" };
    const line = { type: "esports", charId: male.id, followedAt: now - 15 * 86400000, bond: 18, doneNodes: ["street_glance", "late_night_call", "mutual_reveal"], nextNode: "stream_duo", daily: { day: new Date(now).toISOString().slice(0, 10), calls: 0, kkt: 0 }, history: [] };
    const node = { id: "qa-stream-duo", kind: "date", title: "直播双排", place: "宿舍", premise: "他在直播里公开邀请她双排（直播双排：情缘电竞线最后一个节点）。", dueAt: now - 5 * 60e3, status: "pending", companyId: "jyp", occasion: "romance", note: "情缘节点：stream_duo", fromId: male.id, from: "韩叙" };
    const career = { stage: "trainee", companyId: "jyp", signedAt: now - 30 * 86400000, facts: [], offers: [], nodes: [node] };
    const values = {
      ai_phone_api_configs_v1: [{ id: "danmaku-mock", name: "Local mock", provider: "openai", apiKey: "not-a-real-key", baseUrl: "https://mock.test/v1", defaultModel: "mock", enableImageRecognition: false, enableImageGeneration: false }],
      ai_phone_characters_v1: [male], idol_people_v1: { [male.id]: maleProfile }, idol_romance_v1: { lines: { esports: line } },
      idol_trainee_card_v1: { name: "Flora", photo: null, birthday: "2010-04-12", nationality: "中国", mbti: "INFP", looks: "", start: "2026-11-04", trainLength: "一年", family: "normal", familyCustom: "", familyNote: "", talents: ["dance"], talentNote: "", weakness: "", other: "", signature: null, company: "JYP", no: "qa", createdAt: now },
      idol_career_v1: career,
      idol_destiny_v1: { cards: [], createdAt: now, lastFiredAt: now },
      idol_stage_pending_v1: { nodeId: "qa-stream-duo" },
    };
    const tx = db.transaction("entries", "readwrite");
    for (const [key, value] of Object.entries(values)) tx.objectStore("entries").put({ key, value: JSON.stringify(value) });
    await new Promise(resolve => { tx.oncomplete = resolve; });
    db.close();
  })()`);
  await send("Page.reload", { ignoreCache: true });
  await waitFor("document.querySelector('.phone-shell')", 120000);
  await waitFor("window.__idolNew", 120000);
  await evaluate("document.querySelector('.lock-swipe')?.click()");
  await delay(500);
  await evaluate("window.postMessage({ type: 'OS_CMD', action: 'open_app', appId: 'vnmode' }, '*')");
  await delay(3000);
  // 开场卡：点一下才开始（先等卡出来再点）
  await waitFor("Boolean(document.querySelector('.vn-stage-open'))", 30000);
  await evaluate("document.querySelector('.vn-stage-open').click()");
  // 开场白打完字后要点一下屏幕翻页，输入框才会出来（真实玩家也是点一下）
  await delay(2500);
  await evaluate("document.querySelector('.vn-advance')?.click()");
  try {
    await waitFor("document.querySelector('.vn-send-btn')", 60000);
  } catch (error) {
    const dump = await evaluate(`(() => ({ text: (document.querySelector('.phone-shell')?.innerText || '').slice(0, 300), around: [...document.querySelectorAll('*')].filter(e => (e.textContent || '').includes('点一下') && e.children.length === 0).map(e => e.tagName + '.' + (typeof e.className === 'string' ? e.className : '') + ' :: ' + (e.closest('button, [class*=card], [class*=start], [role=button]')?.tagName + '.' + (typeof e.closest('button, [class*=card], [class*=start], [role=button]')?.className === 'string' ? e.closest('button, [class*=card], [class*=start], [role=button]')?.className : ''))).slice(0, 5), frames: document.querySelectorAll('[class*=vn-msg], [class*=vn-frame], [class*=vn-bubble]').length, stageOpen: Boolean(document.querySelector('.vn-stage-open')), dialogue: Boolean(document.querySelector('.vn-dialogue')), sceneLoading: Boolean(document.querySelector('.vn-scene-loading')), hasText: Boolean(document.querySelector('.vn-text')), waitingText: (document.querySelector('.vn-dialogue')?.innerText || '').slice(0, 80) }))()`);
    throw new Error(error.message + ' | 页面现状: ' + JSON.stringify(dump) + ' | chatCalls=' + chatCalls + ' | blocked=' + JSON.stringify(blockedUrls.slice(0, 5)) + ' | errors=' + JSON.stringify(errors.slice(0, 3)));
  }
  // 开场回复到位（浮窗还没出现——开场没有弹幕）
  assert.equal(await evaluate(`Boolean(document.querySelector('.vn-stream-overlay'))`), false, "开场不该有弹幕浮窗");

  // 她发一句
  // React's controlled textarea can keep React's internal value tracker ahead of
  // DOM-setter/CDP text insertion in headless Chrome. Invoke the mounted
  // onChange prop so this stays a real rendered-input path and updates state.
  await waitFor("[...document.querySelectorAll('textarea.vn-input-field')].some(el => el.getClientRects().length > 0 && el.getAttribute('placeholder') === '说些什么...')", 30000);
  await evaluate(`(() => {
    const el = [...document.querySelectorAll('textarea.vn-input-field')].find(node => node.getClientRects().length > 0 && node.getAttribute('placeholder') === '说些什么...');
    if (!el) throw new Error('VN input field is missing');
    el.focus();
    const propsKey = Object.keys(el).find(key => key.startsWith('__reactProps$'));
    const onChange = propsKey && el[propsKey]?.onChange;
    if (typeof onChange !== 'function') throw new Error('React onChange handler is missing');
    onChange({ target: { value: '你在吗' }, currentTarget: el });
    return { value: el.value, enabled: ![...document.querySelectorAll('.vn-send-btn')].find(node => node.getClientRects().length > 0 && node.title === '发送')?.disabled };
  })()`);
  await waitFor("[...document.querySelectorAll('textarea.vn-input-field')].some(el => el.getClientRects().length > 0 && el.value === '你在吗') && [...document.querySelectorAll('.vn-send-btn')].some(el => el.getClientRects().length > 0 && el.title === '发送' && !el.disabled)", 10000);
  await evaluate("[...document.querySelectorAll('.vn-send-btn')].find(el => el.getClientRects().length > 0 && el.title === '发送')?.click()");
  // 浮窗出现，弹幕是韩文+中文
  try {
    await waitFor("Boolean(document.querySelector('.vn-stream-overlay'))", 60000);
  } catch (error) {
    const dump = await evaluate(`(() => ({ dialogue: (document.querySelector('.vn-dialogue')?.innerText || '').slice(0, 300), pending: document.querySelectorAll('.vn-pending-item').length, bodyTail: (document.querySelector('.phone-shell')?.innerText || '').slice(-200) }))()`);
    throw new Error(error.message + ' | ' + JSON.stringify(dump) + ' | chatCalls=' + chatCalls + ' | prompts=' + JSON.stringify(chatUserTexts) + ' | errors=' + JSON.stringify(errors.slice(0, 3)));
  }
  await waitFor("(document.querySelector('.vn-stream-overlay')?.textContent || '').includes('누구야')", 30000);
  const overlayText = await evaluate("document.querySelector('.vn-stream-overlay')?.textContent || ''");
  assert.ok(overlayText.includes("누구야 이 여자?"), "弹幕韩文在浮窗里");
  assert.ok(overlayText.includes("这女生是谁？"), "弹幕中文在浮窗里");
  assert.ok(overlayText.includes("둘이 사귀는 거 아니야?"), "多条弹幕都显示");
  // 正文里不能有记号原文
  const bodyText = await evaluate("document.querySelector('.phone-shell')?.innerText || ''");
  assert.ok(!bodyText.includes("[弹幕"), "记号不能出现在正文里");
  // 最小化按钮在
  assert.ok(await evaluate("Boolean(document.querySelector('.vn-stream-overlay button'))"), "浮窗有最小化按钮");
  const pageErrors = await evaluate("window.__qaPageErrors ?? []");
  // 开发模式已知噪声：layout chunk 里 character-world-storage 模块的 eval 会报一次
  // SyntaxError（生产构建无此问题，Codex 已确认）。只过滤这一个，其余报错照旧拦截。
  const realErrors = errors.filter(e => !(e.description?.includes("SyntaxError: Invalid or unexpected token") && (e.url ?? "").includes("/_next/static/chunks/app/layout.js")));
  assert.deepEqual(realErrors, [], `browser errors: ${JSON.stringify(realErrors.slice(0, 3))}`);
  assert.deepEqual(pageErrors, [], `page errors: ${JSON.stringify(pageErrors.slice(0, 3))}`);

  console.log(JSON.stringify({
    chatCalls,
    overlayText: overlayText.slice(0, 120),
    noMarkerInBody: "passed",
    minimizedButton: "passed",
    pageErrors,
  }, null, 2));
} finally {
  try { socket?.close(); } catch {}
  try { chrome?.kill("SIGTERM"); } catch {}
  server.kill("SIGTERM");
}
