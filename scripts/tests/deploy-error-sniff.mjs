/** 部署白屏诊断：headless Chrome 打开目标 URL，抓启动期报错。跑法：node scripts/tests/deploy-error-sniff.mjs <url> */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const url = process.argv[2] || "https://seoul-am-dev--stunning-alpaca-cc3e72.netlify.app";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sniff-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`, "about:blank",
], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });

const activePortFile = path.join(userDataDir, "DevToolsActivePort");
let debugPort = 0;
for (let i = 0; i < 120; i++) {
  if (fs.existsSync(activePortFile)) { debugPort = Number(fs.readFileSync(activePortFile, "utf8").split("\n")[0]); if (debugPort) break; }
  await delay(250);
}
if (!debugPort) { console.error("no debug port"); process.exit(1); }
const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.addEventListener("open", res, { once: true }); socket.addEventListener("error", rej, { once: true }); });
let commandId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++commandId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, 30000);
  pending.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
const errors = [];
socket.addEventListener("message", event => {
  const m = JSON.parse(event.data);
  if (m.id) { const t = pending.get(m.id); if (!t) return; pending.delete(m.id); clearTimeout(t.timer); m.error ? t.reject(new Error(m.error.message)) : t.resolve(m.result ?? {}); return; }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails ?? {};
    errors.push(`EXCEPTION: ${d.exception?.description ?? d.text ?? ""} @ ${d.url ?? ""}:${d.lineNumber ?? ""}`);
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    errors.push(`CONSOLE: ${m.params.args?.map(a => a.value ?? a.description ?? "").join(" ")}`);
  }
  if (m.method === "Log.entryAdded" && m.params.entry?.level === "error") {
    errors.push(`LOG: ${m.params.entry.text}`);
  }
});
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await delay(20000);
const evalRes = await send("Runtime.evaluate", { expression: `(() => ({ shell: Boolean(document.querySelector('.phone-shell')), opening: Boolean(document.querySelector('[class*=\"opening\"]')), body: document.body?.innerText?.slice(0, 200) ?? "" }))()`, returnByValue: true });
console.log("PAGE:", JSON.stringify(evalRes.result?.value ?? null));
console.log("ERRORS:", errors.length ? errors.join("\n") : "(none)");
process.exit(0);
