// 社交 app 统一身份：装上微博、豆瓣 → 宿主写 idol_mode（出道爱豆是公众人物、她的档位）→ 打开豆瓣看设置
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const OUT = process.argv[2] || ".";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pkg = n => ({ html: readFileSync(new URL(`../../../custom-apps/${n}/dist/index.html`, import.meta.url), "utf8"), manifest: JSON.parse(readFileSync(new URL(`../../../custom-apps/${n}/dist/manifest.json`, import.meta.url), "utf8")) });
const apps = [pkg("weibo"), pkg("douban")];
await p.goto("http://localhost:3031/", { waitUntil: "networkidle2", timeout: 300000 }); await sleep(4000);
await p.evaluate(async apps => {
  const now = new Date().toISOString();
  const mk = (id, name) => ({ id, name, avatar: null, persona: "", wechatID: id, tags: [], createdAt: now, updatedAt: now });
  const base = { layer: "main", group: "", age: "18", publicLabels: [], publicText: "", face: "mixed", privateLines: [], speech: "", taboo: "", withYou: "", met: true, events: [], note: "" };
  const db = await new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => res(r.result); });
  const tx = db.transaction("entries", "readwrite"); const st = tx.objectStore("entries");
  st.put({ key: "ai_phone_characters_v1", value: JSON.stringify([mk("c1", "韩智元"), mk("c2", "韩书俊")]) });
  st.put({ key: "idol_people_v1", value: JSON.stringify({ c1: { ...base, charId: "c1", role: "同期练习生", group: "同期练习生", isIdol: true }, c2: { ...base, charId: "c2", role: "Vertex 成员，前辈", group: "前辈", isIdol: true } }) });
  st.put({ key: "idol_trainee_card_v1", value: JSON.stringify({ name: "Flora", photo: null, birthday: "1999-04-12", nationality: "中国", mbti: "", looks: "", start: "2015-03-01", trainLength: "一年半", family: "normal", familyCustom: "", familyNote: "", talents: [], talentNote: "", weakness: "", other: "", signature: null, company: "BLUE", no: "x", createdAt: 1 }) });
  st.put({ key: "ai_phone_custom_apps_v1", value: JSON.stringify(apps.map(a => ({ id: a.manifest.id, manifest: a.manifest, entryHtml: a.html, assets: {}, installedAt: now, updatedAt: now }))) });
  await new Promise(r => tx.oncomplete = r);
}, apps);
await p.reload({ waitUntil: "networkidle2" }); await sleep(7000);
const kv = async k => p.evaluate(k => new Promise(res => { const r = indexedDB.open("AiPhoneKvDB"); r.onsuccess = () => { const g = r.result.transaction("entries").objectStore("entries").get(k); g.onsuccess = () => res(g.result?.value); }; }), k);
for (const id of ["nox.weibo", "nox.douban"]) {
  const rows = JSON.parse(await kv(`ai_phone_custom_app_data_v1:${id}/meta`) || "[]");
  console.log(id, JSON.stringify(rows.find(r => r.id === "idol_mode")));
}
console.log(errs.slice(0, 3));
await b.close();
