/**
 * KKT 外观预览：无真实存档，用遗留 localStorage 键种一套最小聊天数据
 * （initChatDb 会自动迁进 IndexedDB），打开聊天 app 截列表和对话两张图。
 * 全程 API 走 mock.test，不烧额度。跑法：node scripts/tests/kkt-appearance-qa.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const port = 3099;
const url = `http://127.0.0.1:${port}/`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kkt-qa-"));
const outDir = path.join(root, "previews");
fs.mkdirSync(outDir, { recursive: true });

const cleanup = () => { try { server?.kill("SIGKILL"); } catch {} try { chrome?.kill("SIGKILL"); } catch {} };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });

let serverOutput = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, NEXT_DIST_DIR: ".next-kkt-review", NEXT_PUBLIC_SELF_HOSTED_MODE: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-4000); });
server.stderr.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-4000); });

const iso = t => new Date(t).toISOString();
const T = Date.now();
const chars = [
  { id: "c1", name: "权知韩", avatar: null, persona: "地下乐队吉他手兼主唱，在梨泰院 SIDE B 驻唱。", createdAt: iso(T - 864e5), updatedAt: iso(T - 864e5), wechatID: "01012345678" },
  { id: "c2", name: "裴夏民", avatar: null, persona: "财阀家的小儿子，正在学做家族生意。", createdAt: iso(T - 864e5), updatedAt: iso(T - 864e5), wechatID: "01023456789" },
  { id: "c3", name: "宋元赫", avatar: null, persona: "电竞选手，正在首尔打比赛。", createdAt: iso(T - 864e5), updatedAt: iso(T - 864e5), wechatID: "01034567890" },
];
const contacts = chars.map((c, i) => ({ id: `ct${i}`, characterId: c.id, addedAt: iso(T - 864e5) }));
const mkMsg = (id, sessionId, role, content, at, sender) => ({ id, sessionId, role, content, status: "sent", createdAt: iso(at), ...(sender ? { senderCharacterId: sender } : {}) });
const convo = (sid, who, lines) => lines.map((l, i) => mkMsg(`${sid}-m${i}`, sid, i % 2 === 0 ? "user" : "assistant", l, T - 6e5 + i * 6e4, i % 2 === 1 ? who : undefined));
const m1 = convo("s1", "c1", [
  "你周六晚上还在 SIDE B 驻唱吗？",
  "네, 토요일 밤에 무대 서요. | 在的，周六晚上有我的台。",
  "那我到时候去看你。",
  "와줘요. 노래 하나 바쳤다고 생각할게요. | 来吧，就当是给你唱一首。",
]);
const m2 = convo("s2", "c2", [
  "上次说好的炸鸡，还算数吗？",
  "当然算。你挑地方。",
]);
const m3 = convo("s3", "c3", [
  "双排吗？",
  "지금? | 现在？",
  "来。",
  "들어와요. | 进房吧。",
]);
const sessions = [
  { id: "s1", contactId: "ct0", unreadCount: 1, isPinned: true, updatedAt: iso(T - 6e4), lastMessagePreview: m1.at(-1).content },
  { id: "s2", contactId: "ct1", unreadCount: 0, isPinned: false, updatedAt: iso(T - 36e5), lastMessagePreview: m2.at(-1).content },
  { id: "s3", contactId: "ct2", unreadCount: 2, isPinned: false, updatedAt: iso(T - 18e5), lastMessagePreview: m3.at(-1).content },
];
const seed = `(() => {
  try { localStorage.setItem("ai_phone_api_configs_v1", JSON.stringify([{ id: "kkt-mock", name: "Local mock", provider: "openai", apiKey: "not-a-real-key", baseUrl: "https://mock.test/v1", defaultModel: "mock", enableImageRecognition: false, enableImageGeneration: false }])); } catch {}
  try { localStorage.setItem("ai_phone_characters_v1", JSON.stringify(${JSON.stringify(chars)})); } catch {}
  try { localStorage.setItem("ai_phone_chat_contacts_v1", JSON.stringify(${JSON.stringify(contacts)})); } catch {}
  try { localStorage.setItem("ai_phone_chat_sessions_v1", JSON.stringify(${JSON.stringify(sessions)})); } catch {}
  try { localStorage.setItem("ai_phone_chat_messages_v1", JSON.stringify(${JSON.stringify([...m1, ...m2, ...m3])})); } catch {}
  try { localStorage.setItem("ai_phone_chat_settings_v1", JSON.stringify({ timeAware: true, promptViewerEnabled: false, quickActionEnabled: false, enterToSendEnabled: false, floatingDockEnabled: false })); } catch {}
})()`;

let chrome;
let socket;
let commandId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
const eventHandlers = new Map();
const onEvent = (method, handler) => eventHandlers.set(method, [...(eventHandlers.get(method) ?? []), handler]);

async function main() {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok) { ready = true; break; } } catch {}
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
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.addEventListener("open", res, { once: true }); socket.addEventListener("error", rej, { once: true }); });
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
  onEvent("Fetch.requestPaused", async params => {
    const request = params.request;
    if (request.url.includes("mock.test")) {
      const headers = [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Content-Type", value: "application/json" }];
      if (request.method === "OPTIONS") return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 204, responseHeaders: headers, body: "" });
      const body = JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] });
      return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(body).toString("base64") });
    }
    if (request.url.startsWith(url) || request.url.startsWith("http://localhost:")) return send("Fetch.continueRequest", { requestId: params.requestId });
    if (["Image", "Media", "Font", "Stylesheet", "Script"].includes(params.resourceType)) return send("Fetch.continueRequest", { requestId: params.requestId });
    return send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" });
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: seed });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url });
  const evaluate = async expression => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "evaluate failed");
    return r.result?.value;
  };
  const waitFor = async (expr, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const ok = await evaluate(`Boolean(${expr})`);
      if (ok) return;
      await delay(500);
    }
    throw new Error(`waitFor timeout: ${expr}`);
  };
  await waitFor("document.querySelector('.phone-shell')", 120000);
  await delay(2500);
  // 直接往 kv-db 的 IndexedDB 里塞一张练习生证，绕过开局页（刷新后生效）
  await evaluate(`(async () => {
    const open = (name, version, stores) => new Promise((res, rej) => {
      const r = indexedDB.open(name, version);
      r.onupgradeneeded = () => { for (const [s, key] of stores) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: key }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const kv = await open("AiPhoneKvDB", 1, [["entries", "key"]]);
    const card = { name: "林彩娜", nationality: "韩国", birthday: "04-12", family: "normal", talents: ["vocal"] };
    await new Promise((res, rej) => {
      const tx = kv.transaction("entries", "readwrite");
      tx.objectStore("entries").put({ key: "idol_trainee_card_v1", value: JSON.stringify(card) });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    kv.close();
    return true;
  })()`);
  await send("Page.reload");
  await waitFor("document.querySelector('.phone-shell')", 120000);
  await delay(2500);
  await evaluate("document.querySelector('.lock-swipe')?.click()");
  await delay(1500);
  await evaluate(`window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "chat" } }))`);
  await waitFor("document.querySelector('.chat-app, .chat-list, [class*=\"chat\"]')", 20000);
  await delay(1500);

  const shot = async name => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(outDir, name), Buffer.from(r.data, "base64"));
    console.log("saved", name);
  };
  await shot("kkt-list.png");
  // 点进第一个会话（权知韩）
  await evaluate(`(() => {
    const node = [...document.querySelectorAll('*')].find(el => el.textContent.includes('权知韩') && el.children.length === 0);
    node?.parentElement?.click();
    return Boolean(node);
  })()`);
  await delay(1500);
  await shot("kkt-room.png");
  console.log("DONE");
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
