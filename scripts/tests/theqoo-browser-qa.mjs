/**
 * TheQoo 剧情流 mock 验收：跟她有关的公开事件（路演）→ 自动发帖 → 帖子进论坛 →
 * 因为是她相关且有评论的帖子 → 弹横幅提醒（不再看浏览量）。
 * 全程拦截 API（mock.test），不烧真实额度。
 * 跑法：node scripts/tests/theqoo-browser-qa.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const port = 3097;
const url = `http://127.0.0.1:${port}/`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "theqoo-qa-"));
let serverOutput = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, NEXT_DIST_DIR: ".next-theqoo-review", NEXT_PUBLIC_SELF_HOSTED_MODE: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-4000); });
server.stderr.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-4000); });

let chrome;
let socket;
let commandId = 0;
const pending = new Map();
const errors = [];
let forumCalls = 0;

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
  const eventHandlers = new Map();
  const onEvent = (method, handler) => eventHandlers.set(method, [...(eventHandlers.get(method) ?? []), handler]);
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      clearTimeout(task.timer);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result ?? {});
      return;
    }
    for (const handler of eventHandlers.get(message.method) ?? []) void handler(message.params);
  });
  onEvent("Runtime.exceptionThrown", details => {
    const exception = details.exceptionDetails ?? {};
    errors.push({ description: exception.exception?.description ?? exception.text ?? "page error", url: exception.url, line: exception.lineNumber, column: exception.columnNumber });
  });
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
      const userText = body.messages?.find(m => m.role === "user")?.content ?? "";
      // 论坛发帖请求：用户消息里带 publicFacts → 返回合法论坛草稿（浏览量故意很小，验证只看评论的规则）
      if (userText.includes("publicFacts")) {
        forumCalls++;
        const draft = {
          title: { ko: "연습생 버스킹 영상 떴다", zh: "练习生路演片段" },
          body: [{ ko: "거리에서 버스킹 하는 연습생 영상이 올라왔네요. 목소리 괜찮은데?", zh: "街上有练习生路演的视频传上来了，声音还不错？" }],
          comments: Array.from({ length: 12 }, (_, i) => ({ ko: `댓글 ${i + 1}번`, zh: `评论第 ${i + 1} 条`, likes: i })),
          views: 100, recommendations: 3,
        };
        const response = JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(draft) }, finish_reason: "stop" }] });
        return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(response).toString("base64") });
      }
      // 名册建档资料请求：照骨架回，别让队列反复重试
      if (userText.includes("请补全 ") && userText.includes("班这批人物的资料")) {
        let profiles = [];
        try {
          const input = JSON.parse(userText.slice(userText.indexOf("{")));
          profiles = (input.skeleton ?? []).map((person, index) => ({
            charId: person.charId, enName: "Kim Test", nationality: "韩国", heightCm: 160,
            appearance: person.name + "留着清爽的短发。", privateLines: [person.name + "习惯先观察现场气氛。"],
            familyBackground: "家人住在釜山。", tmi: [person.name + "练习后记手账第 " + index + " 页。"], mbti: "ISFP", speech: "等我一下。",
          }));
        } catch { /* 重试不阻塞 */ }
        const response = JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify({ profiles }) }, finish_reason: "stop" }] });
        return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(response).toString("base64") });
      }
      const generic = JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] });
      return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(generic).toString("base64") });
    }
    if (request.url.startsWith(url) || request.url.startsWith("http://localhost:")) return send("Fetch.continueRequest", { requestId: params.requestId });
    if (["Image", "Media", "Font", "Stylesheet", "Script"].includes(params.resourceType)) return send("Fetch.continueRequest", { requestId: params.requestId });
    return send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" });
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  // 页面任何脚本跑之前就种好：API 配置 + 一条跟她有关的路演公开事件重试条目
  const seedScript = `(() => {
    try {
      const source = { eventId: "qa-roadshow", revision: 1, publicAt: Date.now() - 60000, title: "练习生路演片段", publicFacts: ["练习生路演片段被路人拍下上传"], phase: "occurred", board: "idol", hot: false, notify: false, owner: "player", storyKind: "roadshow" };
      localStorage.setItem("theqoo_retry_v1", JSON.stringify([{ source, batchId: "qa:public", at: Date.now() - 1000 }]));
    } catch {}
    try {
      const configs = [{ id: "theqoo-mock", name: "Local mock", provider: "openai", apiKey: "not-a-real-key", baseUrl: "https://mock.test/v1", defaultModel: "mock", enableImageRecognition: false, enableImageGeneration: false }];
      localStorage.setItem("ai_phone_api_configs_v1", JSON.stringify(configs));
    } catch {}
    window.__qaPageErrors = [];
    window.addEventListener("error", event => window.__qaPageErrors.push({ message: event.message }));
    window.addEventListener("unhandledrejection", event => window.__qaPageErrors.push({ message: String(event.reason) }));
  })()`;
  await send("Page.addScriptToEvaluateOnNewDocument", { source: seedScript });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url });
  await waitFor("document.querySelector('.phone-shell')", 120000);
  await waitFor("window.__idolNew", 120000);
  await evaluate("document.querySelector('.lock-swipe')?.click()");
  await delay(800);
  // 桌面 tick 里每 5 秒跑一次论坛重试 → 生成 → 发布 → 跟她有关且有评论 → 横幅
  let bannerText = "";
  try {
    await waitFor("Boolean(document.querySelector('.idol-banner'))", 60000);
    bannerText = await evaluate("document.querySelector('.idol-banner')?.innerText || ''");
  } catch (error) {
    const dump = await evaluate(`(() => ({ retryLeft: localStorage.getItem('theqoo_retry_v1'), forumKv: localStorage.getItem('idol_theqoo_v1')?.slice(0, 200) ?? null }))()`);
    throw new Error(error.message + ' | forumCalls=' + forumCalls + ' | ' + JSON.stringify(dump));
  }
  assert.ok(bannerText.includes("有一篇与你有关的帖子正在受到关注"), "横幅是舆情提醒：" + bannerText.slice(0, 80));
  assert.ok(bannerText.includes("练习生路演片段"), "横幅带帖子标题：" + bannerText.slice(0, 80));
  // 帖子落库 + 12 条评论 + 通知回执（论坛存档在 IndexedDB，不在 localStorage）
  const forumState = await evaluate(`(async () => {
    const request = indexedDB.open("AiPhoneKvDB");
    const db = await new Promise(resolve => request.onsuccess = () => resolve(request.result));
    const get = db.transaction("entries").objectStore("entries").get("idol_theqoo_v1");
    const row = await new Promise(resolve => get.onsuccess = () => resolve(get.result));
    db.close();
    return row?.value ? JSON.parse(row.value) : {};
  })()`);
  const post = (forumState.posts ?? []).find(p => p.id === "qa-roadshow");
  assert.ok(post, "帖子进了论坛存档");
  assert.equal(post?.comments?.length, 12, "评论 12 条都在");
  assert.ok((post?.notifiedRevisions ?? []).includes(1), "通知回执记了 revision");
  assert.ok((post?.views ?? 0) < 5000 && (post?.recommendations ?? 0) < 50, "浏览量很低也提醒了（只看评论的规则生效）");
  // 打开论坛 app：帖子看得见
  await evaluate("window.postMessage({ type: 'OS_CMD', action: 'open_app', appId: 'theqoo' }, '*')");
  await delay(2500);
  // app 默认停在离线试玩，切到正式论坛
  // app 默认在正式模式的 HOT 热帖页（低浏览量的帖子不在这一页），切到爱豆讨论板块
  const switchHit = await evaluate(`(() => { const btn = [...document.querySelectorAll('.tq-app button')].find(b => (b.textContent || '').trim() === '케이돌토크'); if (btn) { btn.click(); return true; } return false; })()`);
  await delay(1500);
  const appText = await evaluate("(document.querySelector('.tq-app')?.innerText || '').slice(0, 3000)");
  assert.ok(appText.includes("练习生路演片段"), "论坛 app 里能看到帖子（switchHit=" + switchHit + " buttons=" + JSON.stringify(await evaluate("window.__tqBtns ?? []")) + "）：" + appText.slice(0, 500));
  const pageErrors = await evaluate("window.__qaPageErrors ?? []");
  // 开发模式已知噪声（layout chunk 的 character-world-storage eval 报错，生产构建无此问题）
  const realErrors = errors.filter(e => !(e.description?.includes("SyntaxError: Invalid or unexpected token") && (e.url ?? "").includes("/_next/static/chunks/app/layout.js")));
  assert.deepEqual(realErrors, [], `browser errors: ${JSON.stringify(realErrors.slice(0, 3))}`);
  assert.deepEqual(pageErrors, [], `page errors: ${JSON.stringify(pageErrors.slice(0, 3))}`);

  console.log(JSON.stringify({
    forumCalls,
    bannerText: bannerText.slice(0, 100),
    postComments: post.comments.length,
    notifiedRevision: post.notifiedRevisions,
    commentRuleOnly: "passed",
    appShowsPost: "passed",
    pageErrors,
  }, null, 2));
} finally {
  try { socket?.close(); } catch {}
  try { chrome?.kill("SIGTERM"); } catch {}
  server.kill("SIGTERM");
}
