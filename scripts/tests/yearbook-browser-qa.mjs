import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const output = path.join(root, "previews/yearbook");
const port = 3093;
const url = `http://127.0.0.1:${port}/`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yearbook-qa-"));
let serverOutput = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, NEXT_DIST_DIR: ".next-yearbook-review", NEXT_PUBLIC_SELF_HOSTED_MODE: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-5000); });
server.stderr.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-5000); });

let chrome;
let socket;
let debugPort;
let commandId = 0;
const pending = new Map();
const eventHandlers = new Map();
const errors = [];
const mockBatches = [];
const appLogs = [];
const mockErrors = [];
let qaPhase = "boot";

function send(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 300000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function onEvent(method, handler) {
  eventHandlers.set(method, [...(eventHandlers.get(method) ?? []), handler]);
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
}

async function waitFor(expression, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

/* 截图前等游戏通知横幅消失（4.2s 自动关闭），别把暗色横幅拍进截图 */
async function waitForBannerGone(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!(await evaluate(`Boolean(document.querySelector('.idol-banner'))`))) return;
    await delay(300);
  }
  throw new Error("Timed out waiting for banner to clear");
}

async function click(selector, index = 0) {
  const clicked = await evaluate(`(() => { const e = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!e) return false; e.click(); return true; })()`);
  assert.ok(clicked, `Missing clickable element: ${selector}[${index}]`);
}

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name), Buffer.from(result.data, "base64"));
}

async function readKv(key) {
  return evaluate(`(async () => {
    const request = indexedDB.open("AiPhoneKvDB");
    const db = await new Promise(resolve => request.onsuccess = () => resolve(request.result));
    const get = db.transaction("entries").objectStore("entries").get(${JSON.stringify(key)});
    const row = await new Promise(resolve => get.onsuccess = () => resolve(get.result));
    db.close();
    return row?.value ? JSON.parse(row.value) : null;
  })()`);
}

async function writeKv(values) {
  return evaluate(`(async () => {
    const request = indexedDB.open("AiPhoneKvDB");
    const db = await new Promise(resolve => request.onsuccess = () => resolve(request.result));
    const tx = db.transaction("entries", "readwrite");
    const values = ${JSON.stringify(values)};
    for (const [key, value] of Object.entries(values)) tx.objectStore("entries").put({ key, value: JSON.stringify(value) });
    await new Promise(resolve => tx.oncomplete = resolve);
    db.close();
  })()`);
}

async function installMocks() {
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
      try {
        const body = JSON.parse(request.postData ?? "{}");
        const userText = body.messages?.find(message => message.role === "user")?.content ?? "";
        if (!userText.includes("请补全 ") || !userText.includes("班这批人物的资料")) {
          const generic = JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] });
          return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(generic).toString("base64") });
        }
        const input = JSON.parse(userText.slice(userText.indexOf("{")));
        const skeleton = input.skeleton ?? [];
        if (!Array.isArray(skeleton)) throw new Error("Mock request skeleton is not a list");
        if (!skeleton.length) {
          const generic = JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] });
          return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(generic).toString("base64") });
        }
        const klass = userText.match(/请补全 (.) 班/)?.[1] ?? "?";
        const classIndex = Math.max(0, "ABCD".indexOf(klass));
        mockBatches.push({ count: skeleton.length, class: klass });
        const profiles = skeleton.map((person, index) => ({
          charId: person.charId,
          enName: index === 0 && mockBatches.length === 2 ? "Tanaka Mika" : `Kim ${["Seoyeon", "Jieun", "Mina", "Yuna", "Hana", "Sora"][index % 6]}`,
          nationality: index === 0 && mockBatches.length === 2 ? "日本" : "韩国",
          heightCm: 157 + (index % 13),
          appearance: `${person.name}留着清爽的短发，笑起来眼尾会轻轻弯起。`,
          privateLines: ["练习编号 " + String(classIndex * 12 + index + 1).padStart(2, "0") + "：" + person.name + "习惯先观察现场气氛，熟悉后会主动照顾身边的人。"],
          familyBackground: `家人住在${index % 2 ? "釜山" : "大田"}，平时会在周末通电话。`,
          tmi: ["她把练习后的心情记在手账第 " + (classIndex * 12 + index + 1) + " 页。"],
          mbti: index % 2 ? "ENFJ" : "ISFP",
          speech: "等我一下，我把这段再练一次。",
        }));
        const response = JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify({ profiles }) }, finish_reason: "stop" }] });
        return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(response).toString("base64") });
      } catch (error) {
        mockErrors.push({ error: String(error), postData: request.postData?.slice(0, 500) ?? "" });
        const generic = JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] });
        return send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(generic).toString("base64") });
      }
    }
    if (request.url.startsWith(url) || request.url.startsWith("http://localhost:")) return send("Fetch.continueRequest", { requestId: params.requestId });
    return send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" });
  });
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
  let activePortFile = path.join(userDataDir, "DevToolsActivePort");
  for (let i = 0; i < 120; i++) {
    if (chrome.exitCode !== null) throw new Error("Chrome exited before remote debugging started.");
    if (fs.existsSync(activePortFile)) { debugPort = Number(fs.readFileSync(activePortFile, "utf8").split("\n")[0]); if (debugPort) break; }
    await delay(250);
  }
  assert.ok(debugPort, "Chrome remote debugging port did not start");
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
  const target = await targetResponse.json();
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
      return;
    }
    for (const handler of eventHandlers.get(message.method) ?? []) void handler(message.params);
  });
  onEvent("Runtime.exceptionThrown", details => {
    const exception = details.exceptionDetails ?? {};
    errors.push({
      description: exception.exception?.description ?? exception.text ?? "page error",
      url: exception.url,
      line: exception.lineNumber,
      column: exception.columnNumber,
      scriptId: exception.scriptId,
      phase: qaPhase,
      stack: exception.stackTrace?.callFrames?.slice(0, 3).map(frame => `${frame.url}:${frame.lineNumber}:${frame.columnNumber}`),
    });
  });
  onEvent("Runtime.consoleAPICalled", details => {
    if (details.type === "warning" || details.type === "error") appLogs.push((details.args ?? []).map(arg => arg.value ?? arg.description ?? "").join(" "));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__qaPageErrors = []; window.addEventListener("error", event => window.__qaPageErrors.push({ message: event.message, filename: event.filename, line: event.lineno, column: event.colno, stack: event.error?.stack })); window.addEventListener("unhandledrejection", event => window.__qaPageErrors.push({ message: String(event.reason), stack: event.reason?.stack }));` });
  await installMocks();
  await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 2, mobile: false });

  qaPhase = "initial render";
  await send("Page.navigate", { url });
  await waitFor("document.querySelector('.phone-shell')", 120000);
  await evaluate(`(async () => {
    const request = indexedDB.open("AiPhoneKvDB", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("entries")) request.result.createObjectStore("entries", { keyPath: "key" }); };
    const db = await new Promise(resolve => request.onsuccess = () => resolve(request.result));
    const now = Date.now();
    const iso = new Date(now).toISOString();
    const male = { id: "qa-esports", name: "韩叙", avatar: null, persona: "", wechatID: "qa-esports", tags: [], createdAt: iso, updatedAt: iso };
    const maleProfile = { charId: male.id, layer: "main", group: "电竞职业选手", role: "职业电竞选手", age: "19", nationality: "韩国", gender: "男", birthday: "06-21", mbti: "INTP", heightCm: 180, appearance: "", familyBackground: "", isIdol: false, publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "", met: true, metAt: { at: now - 20 * 86400000, place: "线上游戏" }, events: [], note: "", relation: "认识" };
    const line = { type: "esports", charId: male.id, followedAt: now - 15 * 86400000, bond: 18, doneNodes: ["street_glance"], nextNode: "late_night_call", daily: { day: new Date(now).toISOString().slice(0, 10), calls: 0, kkt: 0 }, history: [{ at: now - 86400000, type: "meet", d: 5 }, { at: now - 3600000, type: "kkt", d: 1 }] };
    const career = { stage: "trainee", companyId: "jyp", signedAt: now - 2 * 86400000, facts: [], offers: [], nodes: [{ id: "qa-street-glance", kind: "date", title: "街角擦肩", place: "弘大", premise: "", dueAt: now - 7 * 86400000, doneAt: now - 7 * 86400000, status: "done", note: "情缘节点：street_glance" }] };
    const values = {
      ai_phone_api_configs_v1: [{ id: "yearbook-mock", name: "Local mock", provider: "openai", apiKey: "not-a-real-key", baseUrl: "https://mock.test/v1", defaultModel: "mock", enableImageRecognition: false, enableImageGeneration: false }],
      ai_phone_characters_v1: [male], idol_people_v1: { [male.id]: maleProfile }, idol_romance_v1: { lines: { esports: line } },
      idol_trainee_card_v1: { name: "Flora", photo: null, birthday: "2010-04-12", nationality: "中国", mbti: "INFP", looks: "", start: "2026-11-04", trainLength: "一年", family: "normal", familyCustom: "", familyNote: "", talents: ["dance"], talentNote: "", weakness: "", other: "", signature: null, company: "JYP", no: "qa", createdAt: now },
      idol_career_v1: career,
      idol_destiny_v1: { cards: [], createdAt: now, lastFiredAt: now },
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
  await evaluate("window.dispatchEvent(new CustomEvent('open-app', { detail: { appId: 'yearbook' } }))");
  await waitFor("document.querySelector('.yb-app')", 30000);

  let roster = null;
  for (let i = 0; i < 120; i++) {
    roster = await readKv("idol_roster_v1");
    if (roster?.npcs?.length === 39 && (roster.profilePending ?? []).length === 0) break;
    await delay(1000);
  }
  assert.equal(roster?.npcs?.length, 39, "signing should create the existing 39-person cohort");
  assert.equal((roster?.profilePending ?? []).length, 0, `mock-generated cohort profiles should leave the retry queue; pending=${JSON.stringify(roster?.profilePending)} batches=${JSON.stringify(mockBatches)} logs=${JSON.stringify(appLogs)} mockErrors=${JSON.stringify(mockErrors)}`);
  assert.equal(mockBatches.length, 4, "profile drafts should be requested in four class batches");
  const profiles = await readKv("idol_people_v1");
  const filled = roster.npcs.filter(n => profiles[n.charId]?.nationality && profiles[n.charId]?.heightCm && profiles[n.charId]?.appearance && profiles[n.charId]?.privateLines?.length && profiles[n.charId]?.familyBackground && profiles[n.charId]?.tmi?.length && profiles[n.charId]?.mbti && profiles[n.charId]?.speech);
  assert.equal(filled.length, 39, "all 39 NPC profiles should persist every requested field");
  const allTmi = roster.npcs.flatMap(n => profiles[n.charId]?.tmi ?? []);
  assert.equal(new Set(allTmi).size, allTmi.length, "TMI should be unique across the whole cohort");
  const characters = await readKv("ai_phone_characters_v1");
  const firstProfile = profiles[roster.npcs[0].charId];
  const firstCharacter = characters.find(character => character.id === roster.npcs[0].charId);
  assert.ok(firstCharacter && !firstCharacter.persona.includes(firstProfile.mbti), "cohort MBTI stays out of the character prompt/persona");

  const first = roster.npcs[0];
  const career = await readKv("idol_career_v1");
  career.roommates = [first.charId];
  const people = await readKv("idol_people_v1");
  people[first.charId].events = [{ id: "qa-event", at: Date.now() - 86400000, place: "练习室", text: "一起练习到很晚" }];
  const ledger = { entries: [], levels: {}, months: [{ month: new Date().toISOString().slice(0, 7), nodeId: "qa-rank", rank: 6, total: 40, comment: "", rows: [{ id: first.id, name: first.name, group: "舞蹈组", rank: 3, change: "↑2", klass: first.klass }], image: "", at: Date.now() }], ranked: [] };
  await writeKv({ idol_career_v1: career, idol_people_v1: people, idol_ledger_v1: ledger });
  await waitFor("document.querySelector('.yb-appbar')");
  await evaluate("document.fonts.ready");
  await waitForBannerGone();
  await screenshot("impl-01-bookshelf.png");

  await click(".yb-book", 0);
  await click(".yb-cover-page");
  await waitFor("document.querySelector('.yb-directory')");
  await waitForBannerGone();
  await screenshot("impl-02-directory.png");
  await click(".yb-mini", 0);
  await waitFor("document.querySelector('.yb-classmate')");
  await waitForBannerGone();
  await screenshot("impl-03-classmate.png");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await delay(300);
  const widthCheck = await evaluate(`(() => {
    const app = document.querySelector('.yb-app'), scroll = document.querySelector('.yb-scroll'), shell = document.querySelector('.phone-shell');
    const overflow = [...document.querySelectorAll('*')].map(e => ({ tag: e.tagName, cls: typeof e.className === 'string' ? e.className : '', left: Math.round(e.getBoundingClientRect().left), right: Math.round(e.getBoundingClientRect().right) })).filter(e => e.right > innerWidth + 1 || e.left < -1).slice(0, 8);
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, phone: [shell.clientWidth, shell.scrollWidth], app: app.scrollWidth <= app.clientWidth, scroll: scroll.scrollWidth <= scroll.clientWidth, overflow };
  })()`);
  assert.ok(widthCheck.document <= widthCheck.viewport && widthCheck.app && widthCheck.scroll, `430px app content overflows: ${JSON.stringify(widthCheck)}`);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await delay(300);
  const narrowWidthCheck = await evaluate(`(() => {
    const app = document.querySelector('.yb-app'), scroll = document.querySelector('.yb-scroll'), shell = document.querySelector('.phone-shell');
    const overflow = [...document.querySelectorAll('*')].map(e => ({ tag: e.tagName, cls: typeof e.className === 'string' ? e.className : '', left: Math.round(e.getBoundingClientRect().left), right: Math.round(e.getBoundingClientRect().right) })).filter(e => e.right > innerWidth + 1 || e.left < -1).slice(0, 8);
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, phone: [shell.clientWidth, shell.scrollWidth], app: app.scrollWidth <= app.clientWidth, scroll: scroll.scrollWidth <= scroll.clientWidth, overflow };
  })()`);
  assert.ok(narrowWidthCheck.document <= narrowWidthCheck.viewport && narrowWidthCheck.app && narrowWidthCheck.scroll, `390px app content overflows: ${JSON.stringify(narrowWidthCheck)}`);
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 2, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });

  qaPhase = "yearbook interactions and persistence";
  await evaluate(`(() => {
    const input = document.querySelector('.yb-note textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, 'QA：这条印象需要持久保存。');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await delay(150);
  assert.equal((await readKv("idol_people_v1"))[first.charId].note, "QA：这条印象需要持久保存。");
  await click(".yb-appbar button", 0);
  await click(".yb-mini", 1);
  assert.equal(await evaluate("document.querySelector('.yb-note textarea').value"), "", "each cohort member has an independent note");
  await send("Page.reload", { ignoreCache: true });
  await waitFor("document.querySelector('.phone-shell')", 120000);
  await waitFor("window.__idolNew", 120000);
  await evaluate("document.querySelector('.lock-swipe')?.click()");
  await delay(500);
  await evaluate("window.dispatchEvent(new CustomEvent('open-app', { detail: { appId: 'yearbook' } }))");
  await waitFor("document.querySelector('.yb-app')");
  await click(".yb-book", 0);
  await click(".yb-cover-page");
  await click(".yb-mini", 0);
  assert.equal(await evaluate("document.querySelector('.yb-note textarea').value"), "QA：这条印象需要持久保存。", "personal note survives reload");

  await click(".yb-appbar button", 0);
  await click(".yb-appbar button", 0);
  await click(".yb-appbar button", 0);
  await click(".yb-book", 1);
  await click(".yb-cover-page.rose");
  await waitFor("document.querySelector('.yb-fates')");
  await waitForBannerGone();
  await screenshot("impl-04-fates.png");
  const fatesText = await evaluate("document.querySelector('.yb-fates').innerText");
  for (const hidden of ["IDOL", "UNDERGROUND", "HEIR", "TRAINEE", "CAMPUS"]) assert.ok(!fatesText.includes(hidden), `unfollowed route leaked: ${hidden}`);
  await click(".yb-slot:not(.empty)");
  await waitFor("document.querySelector('.yb-fate-page')");
  await waitForBannerGone();
  await screenshot("impl-05-fate.png");

  qaPhase = "contacts cohort deep link";
  await evaluate(`(() => {
    sessionStorage.setItem('contacts-open-character', ${JSON.stringify(first.charId)});
    window.dispatchEvent(new CustomEvent('open-app', { detail: { appId: 'contacts' } }));
  })()`);
  await waitFor("document.querySelector('.yb-embedded .yb-classmate')", 30000);
  assert.ok(await evaluate("document.querySelectorAll('.yb-embedded .yb-pagebar').length"), "cohort contact cards should use the yearbook page");
  const pageErrors = await evaluate("window.__qaPageErrors ?? []");
  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify({ errors, pageErrors })}`);
  const fontInfo = await evaluate(`(() => ({
    playfair500: document.fonts.check('500 21px "Playfair Display"', 'FATE'),
    ost400: document.fonts.check('400 9px "Old Standard TT"', 'Memento'),
    ostItalic: document.fonts.check('italic 400 12px "Old Standard TT"', 'III'),
    noto: document.fonts.check('500 12px "Noto Serif SC"', '同期'),
  }))()`);
  const glyphWidths = await evaluate(`(() => {
    const canvas = document.createElement('canvas').getContext('2d');
    const measure = (font, text) => { canvas.font = font; return Array.from(text).map(ch => ch + ':' + Math.round(canvas.measureText(ch).width * 10) / 10); };
    return {
      titlePlayfair: measure('500 21px "Playfair Display", serif', 'FATE CARD'),
      titleGeorgia: measure('500 21px Georgia, serif', 'FATE CARD'),
    };
  })()`);
  console.log(JSON.stringify({
    createdNpcCount: roster.npcs.length,
    profileBatches: mockBatches,
    persistedProfileCount: filled.length,
    uniqueTmiCount: allTmi.length,
    mbtiPromptPrivacy: "passed",
    independentNotes: "passed",
    notePersistence: "passed across reload",
    hiddenUnfollowedRouteNames: "passed",
    contactsCohortPage: "passed",
    overflow430: widthCheck,
    overflow390: narrowWidthCheck,
    fontInfo,
    glyphWidths,
    pageErrors,
    screenshots: ["impl-01-bookshelf.png", "impl-02-directory.png", "impl-03-classmate.png", "impl-04-fates.png", "impl-05-fate.png"],
  }, null, 2));
} finally {
  try { socket?.close(); } catch {}
  try { chrome?.kill("SIGTERM"); } catch {}
  server.kill("SIGTERM");
}
