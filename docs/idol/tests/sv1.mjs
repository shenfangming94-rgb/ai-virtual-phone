// 存档：A 档 → 开新档 → B 档 → 切回 A
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kv = k => p.evaluate(k => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get(k); g.onsuccess = () => res(g.result?.value); }; }), k);
const put = (entries) => p.evaluate(async entries => { const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); }); const tx = db.transaction("entries", "readwrite"); for (const [k, v] of entries) tx.objectStore("entries").put({ key: k, value: v }); await new Promise(r => tx.oncomplete = r); }, entries);
const card = (name, company) => JSON.stringify({ name, photo: null, birthday: "1998-06-17", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年", family: "normal", familyCustom: "", familyNote: "", talents: ["vocal"], talentNote: "", weakness: "", other: "", signature: null, company, no: "x", createdAt: 1 });
const now = new Date().toISOString();
const unlock = async () => { for (let i = 0; i < 20; i++) { const has = await p.evaluate(() => { const b = document.querySelector(".lock-swipe"); if (b) b.click(); return Boolean(b); }); if (has) { await sleep(1000); return; } await sleep(1000); } };
const reload = async () => { await p.reload({ waitUntil: "domcontentloaded", timeout: 120000 }); await sleep(6000); };
const state = async (tag) => {
  const c = JSON.parse(await kv("idol_trainee_card_v1") || "null");
  const chars = JSON.parse(await kv("ai_phone_characters_v1") || "[]").map(x => x.name);
  const api = JSON.parse(await kv("ai_phone_api_configs_v1") || "[]").length;
  const wc = await p.evaluate(() => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); });
  console.log(tag, "card:", c?.name ?? "无", "chars:", chars.join(","), "api:", api, "world:", wc);
};
await p.goto("http://localhost:3031/", { waitUntil: "domcontentloaded", timeout: 120000 }); console.log("goto ok"); await sleep(2000);
console.log("loaded"); await p.waitForFunction(() => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const ok = r.result.objectStoreNames.contains("entries"); r.result.close(); res(ok); }; r.onerror = () => res(false); }), { timeout: 120000, polling: 1000 }).catch(e => console.log("wait fail", e.message)); console.log("db ready");
await put([["ai_phone_characters_v1", JSON.stringify([{ id: "c2", name: "申多恩", avatar: null, persona: "", wechatID: "a", tags: [], createdAt: now, updatedAt: now }])], ["ai_phone_api_configs_v1", JSON.stringify([{ id: "m1", name: "mock", provider: "openai", apiKey: "x", baseUrl: "https://mock.test/v1", defaultModel: "m" }])], ["idol_trainee_card_v1", card("Flora", "JYP")], ["ai_phone_user_identities_v1", JSON.stringify([{ id: "identity-1", name: "Flora", bio: "", gender: "女", age: "17", occupation: "", customSettings: "" }])]]);
await reload();
await p.evaluate(() => { const wc = window.__worldClock; wc.offset = new Date("2015-08-20T10:00:00").getTime() - wc.RealDate.now(); });
await state("A 开始");
await unlock();
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "contacts" }, "*")); await sleep(2500);
// 我的名片
{ const box = await p.evaluate(() => { const el = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && e.textContent.trim() === "我的名片"); const r = el?.getBoundingClientRect(); return r ? { x: r.left + 20, y: r.top } : null; }); if (box) await p.mouse.click(box.x, box.y); await sleep(1500); }
await p.evaluate(() => { const s = [...document.querySelectorAll("*")].find(e => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== "visible"); if (s) s.scrollTop = 99999; }); await sleep(500);
await p.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent.includes("存档 · 开新档"))?.click()); await sleep(1500);
await p.screenshot({ path: OUT + "/sv_panel.png" });
await p.evaluate(() => [...document.querySelectorAll(".sv-btns button")].find(x => x.textContent === "开新档")?.click()); await sleep(600);
{ const nav = p.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 }).catch(e => console.log("no reload", e.message));
await p.evaluate(() => [...document.querySelectorAll(".sv-sheet .sv-btns button")].find(x => x.textContent === "开新档")?.click()); await nav; await sleep(6000); }
await p.screenshot({ path: OUT + "/sv_new.png" });
await state("开新档后");
await put([["idol_trainee_card_v1", card("Mina", "SM")], ["ai_phone_characters_v1", JSON.stringify([{ id: "c9", name: "金智秀", avatar: null, persona: "", wechatID: "b", tags: [], createdAt: now, updatedAt: now }])]]);
await reload();
await p.evaluate(() => { const wc = window.__worldClock; wc.offset = new Date("2016-01-05T10:00:00").getTime() - wc.RealDate.now(); });
await state("B 档");
await unlock();
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "settings" }, "*")); await sleep(2500);
await p.evaluate(() => { const el = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && e.textContent.trim() === "存档"); (el.closest("button,[role=button]") || el).click(); }); await sleep(2000);
await p.screenshot({ path: OUT + "/sv_settings.png" });
{ const nav = p.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 }).catch(e => console.log("no reload", e.message));
await p.evaluate(() => [...document.querySelectorAll(".sv-btns button")].find(x => x.textContent === "切换")?.click()); await nav; await sleep(6000); }
await state("切回 A");
await unlock();
await p.evaluate(() => window.postMessage({ type: "OS_CMD", action: "open_app", appId: "settings" }, "*")); await sleep(2500);
await p.evaluate(() => { const el = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && e.textContent.trim() === "存档"); (el?.closest("button,[role=button]") || el)?.click(); }); await sleep(2000);
await p.screenshot({ path: OUT + "/sv_back.png" });
console.log("errs", errs.slice(0, 3));
await b.close();
