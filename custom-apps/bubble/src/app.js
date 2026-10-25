/* bubble · 小手机自定义 APP：订阅 char 的泡泡房；她也是爱豆，有自己的泡泡房，他会偷偷订阅混在粉丝里回她 */
(function () {
  "use strict";
  const api = window.AiPhone || window.AiPhoneApp;
  const VERSION = "/*__VERSION__*/";

  // ───────────────────────── 工具 ─────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let uidN = 0;
  const uid = p => `${p}_${Date.now().toString(36)}${(uidN++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const nowIso = () => new Date().toISOString();
  const none = v => !v || /^(无|没有|不回|none|null|-|—)$/i.test(String(v).trim());
  const pad = x => String(x).padStart(2, "0");
  const hm = iso => { const t = new Date(iso); return isNaN(t) ? "" : `${pad(t.getHours())}:${pad(t.getMinutes())}`; };
  const dayLabel = iso => { const t = new Date(iso); return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日 星期${"日一二三四五六"[t.getDay()]}`; };
  function listTime(iso) {
    const t = new Date(iso); const now = new Date(); if (isNaN(t)) return "";
    if (t.toDateString() === now.toDateString()) return hm(iso);
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (t.toDateString() === y.toDateString()) return "昨天";
    return `${t.getMonth() + 1}/${t.getDate()}`;
  }
  function hashHue(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return (h >>> 8) % 360; }
  const PASTEL = ["#FFD6E0", "#D6E9FF", "#DDF5E4", "#FFE9C7", "#E7DDFB", "#FCE1F4", "#D9F1F6"];
  const pastelFor = s => PASTEL[hashHue(s) % PASTEL.length];

  const sv = (d, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 1.8}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    back: sv('<path d="M15 5 8 12l7 7"/>', 2), down: sv('<path d="m7 10 5 5 5-5"/>', 1.8), more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
    send: sv('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.4), x: sv('<path d="M6 6l12 12M18 6 6 18"/>', 2),
    bubble: sv('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', 2), photo: sv('<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>', 2),
    smile: sv('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>', 2), swap: sv('<path d="M4 8h14l-3-3M20 16H6l3 3"/>', 2),
    spark: sv('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>', 2), pen: sv('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', 2),
    palette: sv('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.9-9-7.9z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/>', 1.8),
    plus: sv('<path d="M12 5v14M5 12h14"/>', 2), quote: sv('<path d="M7 7h4v4H8c0 2 1 3 3 3v2c-3 0-5-2-5-5zM14 7h4v4h-3c0 2 1 3 3 3v2c-3 0-5-2-5-5z"/>', 1.6),
    check: sv('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.2),
    heart: sv('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', 1.8), cmt: sv('<path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4.5 20l1.2-4.1A7.5 7.5 0 1 1 20 12z"/>', 1.8),
  };

  // ───────────────────────── 数据 ─────────────────────────
  // rooms：每个泡泡房一条 { id, scope, kind: "char" | "me", charId, items, pending, ... }
  //   char 房 items: { id, by: "char" | "me", text, at, quote, fans: [{ t, tr, me }], fanN }
  //   我的房 items: { id, by: "me" | "fan" | "him", name, charId, text, tr, at, quote }
  // meta：{ me: { name, avatar }, theme, bg, bgOpacity, myColor, subN, secret: [charId] }
  const COL = { rooms: "rooms", meta: "meta", plaza: "plaza" };
  const S = { identity: null, chars: [], meta: null, rooms: [], plaza: [], debug: [], busy: new Set(), view: { page: "home", roomId: null }, quote: null, fanSheet: null };
  async function dbList(c) { try { return (await api.db.list(c, { limit: 500 })) || []; } catch (e) { console.warn(e); return []; } }
  async function dbUpsert(c, row) {
    try { const u = await api.db.update(c, row.id, row); if (u) return u; } catch (e) { /* 没有就 create */ }
    return api.db.create(c, row);
  }
  async function dbDelete(c, id) { try { await api.db.delete(c, id); } catch (e) { console.warn(e); } }
  let metaTimer = null;
  function saveMeta() { clearTimeout(metaTimer); metaTimer = setTimeout(() => dbUpsert(COL.meta, S.meta).catch(e => console.warn(e)), 250); }
  const saveRoom = r => dbUpsert(COL.rooms, r).catch(e => console.warn(e));

  async function loadAll() {
    const identity = await api.user.getProfile({}).catch(() => null);
    S.identity = identity || { id: "default", name: "我" };
    const chars = await api.characters.list().catch(() => []);
    const owners = await Promise.all(chars.map(c => api.user.getProfile({ characterId: c.id }).catch(() => null)));
    S.chars = chars.filter((c, i) => !owners[i] || !identity || owners[i].id === identity.id);
    const [rooms, metas, plaza] = await Promise.all([dbList(COL.rooms), dbList(COL.meta), dbList(COL.plaza)]);
    const scope = S.identity.id;
    S.plaza = plaza.filter(b => b.scope === scope).map(b => ({ ...b, posts: b.posts || [] }));
    S.rooms = rooms.filter(r => r.scope === scope).map(r => ({ ...r, items: r.items || [], pending: r.pending || [] }));
    S.debug = (metas.find(m => m.id === "debug_log") || {}).entries || [];
    S.meta = metas.find(m => m.id === `meta_${scope}`) || { id: `meta_${scope}` };
    S.meta = { me: {}, theme: "journal", bg: "", bgOpacity: 0.6, myColor: "#F7AFC0", subN: (rand(30, 180) / 10).toFixed(1), secret: [], publicWith: [], alt: "", stickers: [], ...S.meta };
    if (!S.meta.alt) S.meta.alt = pick(["柠檬不酸", "今天也在冲浪", "小熊软糖", "momo_1029", "云朵不在家"]);
    if (!S.rooms.some(r => r.kind === "me")) {
      const me = { id: `room_${scope}_me`, scope, kind: "me", items: [], pending: [], createdAt: nowIso() };
      S.rooms.push(me); saveRoom(me);
    }
  }
  const charById = id => S.chars.find(c => c.id === id);
  // 认马甲：他不知道哪个号是她时，0 没察觉 / 1 有点眼熟 / 2 八成是她 / 3 确定是她
  const SUS = ["没察觉", "有点眼熟", "八成是她", "确定是她"];
  const SUS_LINE = ["你没察觉那个账号是谁。", "你觉得那个账号有点眼熟，说话像她，但不确定。", "你八成觉得那个账号是她。", "你确定那个账号就是她，只是没说破。"];
  const myRoom = () => S.rooms.find(r => r.kind === "me");
  const roomById = id => S.rooms.find(r => r.id === id);
  const herName = () => S.identity.name || "她";
  const myStage = () => S.meta.me.name || herName();
  const myAvatar = () => S.meta.me.avatar || S.identity.avatarUrl || "";
  const stageName = r => (r && r.stage) || (charById(r && r.charId) || {}).name || "TA";
  const roomAvatar = r => (r && r.avatar) || (charById(r && r.charId) || {}).avatar || "";
  const subDays = r => Math.max(1, Math.floor((Date.now() - new Date(r.createdAt || Date.now()).getTime()) / 86400e3) + 1);
  function remember(charId, summary) {
    if (!charId || !api.memory || !api.memory.addTimeline) return "";
    const ev = uid("ev");
    api.memory.addTimeline({ characterId: charId, appLabel: "bubble", detail: "bubble", summary, appEventId: ev }).catch(e => console.warn(e));
    return ev;
  }

  // ───────────────────────── 提示 ─────────────────────────
  function toast(msg) { const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 1800); }
  function sheet(title, items) {
    return new Promise(resolve => {
      const mask = document.createElement("div"); mask.className = "mask";
      mask.innerHTML = `<div class="sheet"><div class="grab"></div>${title ? `<div class="sheet-h">${esc(title)}</div>` : ""}${items.map((it, i) => `<button class="opt ${it.danger ? "danger" : ""}" data-i="${i}"><div class="cell-main">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</div>${it.on ? `<span class="ck">${I.check}</span>` : ""}</button>`).join("")}</div>`;
      mask.onclick = e => { const b = e.target.closest("[data-i]"); if (!b && e.target !== mask) return; mask.remove(); resolve(b ? items[+b.dataset.i].value : null); };
      document.body.appendChild(mask);
    });
  }
  function inputSheet(title, value, opts = {}) {
    return new Promise(resolve => {
      const mask = document.createElement("div"); mask.className = "mask";
      const field = opts.long ? `<textarea class="field" rows="4" maxlength="${opts.max || 300}" placeholder="${esc(opts.ph || "")}">${esc(value || "")}</textarea>` : `<input class="field" maxlength="${opts.max || 40}" placeholder="${esc(opts.ph || "")}" value="${esc(value || "")}">`;
      mask.innerHTML = `<form class="sheet" action="#"><div class="grab"></div><div class="sheet-h">${esc(title)}</div>${opts.hint ? `<div class="sheet-hint">${esc(opts.hint)}</div>` : ""}<div style="padding:0 18px 12px">${field}</div><button class="opt ok" type="submit"><div class="cell-main">确定</div></button></form>`;
      const input = $(".field", mask);
      $("form", mask).onsubmit = e => { e.preventDefault(); mask.remove(); resolve(input.value.trim()); };
      mask.onclick = e => { if (e.target === mask) { mask.remove(); resolve(null); } };
      document.body.appendChild(mask); setTimeout(() => input.focus(), 50);
    });
  }
  /** 选图：压到 maxSize 转 dataURL 存起来 */
  function pickImage(maxSize) {
    return new Promise(resolve => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.onchange = () => {
        const f = inp.files && inp.files[0]; if (!f) return resolve(null);
        const img = new Image(); const url = URL.createObjectURL(f);
        img.onload = () => {
          let w = img.width, h = img.height; const k = Math.min(1, maxSize / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
          const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url); resolve(cv.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      };
      inp.click();
    });
  }

  // ───────────────────────── AI ─────────────────────────
  function logAi(entry) {
    S.debug = [{ at: nowIso(), ...entry, text: String(entry.text || "").slice(0, 6000) }, ...S.debug].slice(0, 10);
    dbUpsert(COL.meta, { id: "debug_log", entries: S.debug }).catch(() => {});
  }
  const FAN_MOOD = "粉丝绝对不能接受爱豆谈恋爱：嗅到一点恋爱苗头就紧张、否认、生气、阴阳、喊着要脱粉，不会祝福。";
  const isPublic = charId => (S.meta.publicWith || []).includes(charId);
  const LOVE_RULE = (charId, who) => isPublic(charId)
    ? `你们的恋情已经公开了，可以大方一点，但粉丝大多还是接受不了。`
    : `爱豆不许谈恋爱，你们的关系没公开：不能直接秀恩爱、不能说破你们的关系，想对${who}好只能暗戳戳、让别人看不出来。`;
  /** 不许冒充她：她的艺名、名字、小号都不能当粉丝昵称 */
  const herNames = () => [S.meta.alt, myStage(), herName()].filter(Boolean).map(n => String(n).trim().toLowerCase());
  const isHerName = n => herNames().includes(String(n || "").trim().toLowerCase());
  const NO_HER = () => `【不许冒充她】不许出现昵称「${S.meta.alt}」，也不许用「${myStage()}」「${herName()}」的名义说话；不许假装是她或她的小号发言。`;
  const FAN_FORMAT = "每行一条粉丝回复，开头写「- 昵称：」，昵称要像这个爱豆自己的粉丝会起的，不能带别的爱豆的名字。像真实追星粉丝：短、口语、情绪直接，有尖叫有心疼有玩梗有关心身体。句子要通顺，按正常说话断句，该用标点就用标点，不能一长串连着不断。大部分用中文，也要有几条韩语、日语、英文；外语那条写成「原文｜中文翻译」。";
  async function busyWrap(label, fn) {
    const job = uid("job"); S.busy.add(job); render();
    try { return await fn(); } catch (e) { console.error(e); logAi({ label, ok: false, error: String((e && e.message) || e) }); toast(`${label}失败：${(e && e.message) || e}`.slice(0, 60)); return null; } finally { S.busy.delete(job); render(); }
  }
  async function charGen(charId, scene, instruction, label) {
    return busyWrap(label, async () => {
      const r = await api.ai.generate({ characterId: charId, appTags: ["nox_bubble", scene], instruction: [`当前时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`, instruction, "【输出要求】只输出要求的块，字段名照抄，不要解释、不要旁白、不要 markdown。"].join("\n\n") });
      const text = (r && r.text) || ""; logAi({ label, ok: true, text }); return text;
    });
  }
  async function plainGen(instruction, label) {
    return busyWrap(label, async () => {
      const r = await api.ai.chat({ system: "你负责模拟追星 app 里粉丝的回复，只输出要求的格式，不要任何解释。", prompt: instruction, timeoutMs: 120000 });
      const text = (r && r.text) || ""; logAi({ label, ok: true, text }); return text;
    });
  }
  function parseFans(block) {
    return String(block || "").split("\n").map(l => l.trim()).filter(l => l && !/^=+/.test(l)).map(l => l.replace(/^[-*•·\d.、]+\s*/, "")).filter(Boolean).map(l => {
      const m = l.match(/^([^：:]{1,16})[：:]\s*(.+)$/);
      const name = m ? m[1].trim() : pick(["momo", "晚风", "小土豆", "sunny", "北北北"]);
      const body = (m ? m[2] : l).trim();
      const [t, tr] = body.split(/[｜|]/).map(x => x.trim());
      return t && !isHerName(name) ? { name, t, tr: tr || "" } : null;
    }).filter(Boolean).slice(0, 14);
  }
  const blockOf = (text, name) => { const m = String(text || "").match(new RegExp(`===\\s*${name}\\s*===([\\s\\S]*?)(?====|$)`)); return m ? m[1].trim() : ""; };
  const field = (text, name) => (String(text || "").match(new RegExp(`${name}[：:][ \\t]*([^\\n]*)`)) || [])[1]?.trim() || "";

  // 他的泡泡房：催他发泡泡 / 她把留言发出去之后他回
  async function charBubbles(room, opts = {}) {
    const c = charById(room.charId); if (!c) return toast("找不到这个人了");
    const name = stageName(room);
    const recent = room.items.filter(i => i.by === "char").slice(-8).map(i => `- ${i.text}`).join("\n");
    const lastChar = [...room.items].reverse().find(i => i.by === "char");
    const fanPool = lastChar && lastChar.fans ? lastChar.fans.filter(f => !f.me).slice(0, 6) : [];
    const hers = opts.sent || [];
    const sus = room.sus || 0;
    const herAcct = room.known ? "（这条是她的账号发的）" : sus >= 1 ? "（这条是你在留意的那个账号发的）" : "";
    const mixed = [...fanPool.map(f => f.t), ...hers.map(t => `${t}${herAcct}`)].sort(() => Math.random() - 0.5);
    const judge = !room.known && !room.susLock && hers.length && sus < 3;
    const raw = await charGen(room.charId, "room", [
      `【bubble 是什么】你是爱豆「${name}」，在付费粉丝通讯 app bubble 上给订阅你的粉丝发消息（泡泡）。泡泡是群发的，所有订阅的人都看得到；粉丝的回复只有你看得到，粉丝之间互相看不到。`,
      `【${herName()}】她也订阅了你的泡泡，用的是一个粉丝账号。${room.known ? "你知道哪个账号是她。可以装作不知道，也可以引用她的话暗戳戳回应，但不能在泡泡里点破她是谁。" : `你不知道哪个账号是她。${SUS_LINE[sus]}${sus >= 1 ? "可以暗戳戳试探或者引用那个账号的话，但不能在泡泡里点破。" : ""}`}你们现实里的关系按你的记忆来。`,
      recent ? `你最近发过的泡泡：\n${recent}` : "这是你第一次在这个泡泡房发泡泡。",
      mixed.length ? `粉丝刚发来的回复（随便挑了几条）：\n${mixed.map(t => `- ${t}`).join("\n")}` : "",
      `【恋爱】${LOVE_RULE(room.charId, herName())}`,
      `【粉丝】${FAN_MOOD}`, NO_HER(),
      opts.hint ? `【这次重写】上一版不满意，这次照这个要求写：${opts.hint}` : "",
      (() => { const pb = S.plaza.find(x => x.board === room.charId); const hotP = pb ? pb.posts.filter(p => p.by !== "him").slice(0, 3) : []; return hotP.length && Math.random() < 0.3 ? `【粉丝广场】你偶尔会看一眼自己的粉丝广场，最近在聊：${hotP.map(p => `「${p.text.slice(0, 40)}」`).join("")}。一般明星不太当回事，泡泡里不用提；除非事情闹得很大，才可能顺口回应一下。` : ""; })(),
      opts.direction ? `【这次的情况】${opts.direction}` : "",
      "【这次】发 1~4 条新泡泡。像真爱豆发泡泡：短、口语、分享此刻在干嘛和心情，偶尔引用某条粉丝回复再回它。不要每条都引用，不要写成公告。偶尔可以配一张照片，大多数时候不配。",
      opts.wantPhoto ? "【这次】粉丝在催照片，这次至少有一条泡泡配照片。" : "",
      "【输出】每条泡泡一个块：\n===泡泡===\n引用：被引用的那条粉丝回复原话（不引用写 无）\n内容：泡泡内容（只发照片可以写 无）\n照片：照片画面描述（不配照片写 无）\n出镜：照片里有没有你本人（是/否）\n所有泡泡写完后：\n===粉丝回复===\n" + FAN_FORMAT + "写 8~12 条，是粉丝对你这几条泡泡的反应（看得到照片）。",
      judge ? `【顺便判断】刚才那几条粉丝回复里${sus ? "，你在留意的那个账号" : "，有没有哪条"}像不像${herName()}发的？按她平时说话的样子和你们的事来判断，只会越来越确定、不会变回去。最后单独写：\n===疑心===\n档位：${SUS.join(" / ")} 选一个` : "",
    ].filter(Boolean).join("\n\n"), "他发泡泡");
    if (!raw) return;
    const bubbles = String(raw).split(/===\s*泡泡\s*===/).slice(1).map(b => {
      const photo = field(b, "照片");
      const text = field(b, "内容");
      return { quote: field(b, "引用"), text: none(text) ? "" : text, photo: none(photo) ? null : { desc: photo.slice(0, 200), self: /^是/.test(field(b, "出镜")) } };
    }).filter(b => b.text || b.photo).slice(0, 4);
    if (judge) { const lv = SUS.findIndex(x => field(blockOf(raw, "疑心"), "档位").includes(x)); if (lv > sus) { room.sus = lv; toast(`${name} 对你的账号：${SUS[lv]}`); } }
    if (!bubbles.length) return toast("他没发出来，再催一次");
    const fans = parseFans(blockOf(raw, "粉丝回复"));
    const base = Date.now();
    bubbles.forEach((b, i) => {
      room.items.push({ id: uid("b"), by: "char", text: b.text.slice(0, 300), ...(b.photo ? { photo: b.photo } : {}), quote: none(b.quote) ? "" : b.quote.slice(0, 120), at: new Date(base + i * 1000).toISOString(), ...(i === bubbles.length - 1 ? { fans: fans.map(f => ({ t: f.t, tr: f.tr })), fanN: rand(120, 980) } : {}) });
    });
    const evSum = `你在 bubble（粉丝通讯 app）上以爱豆「${name}」的身份给粉丝发了泡泡：${bubbles.map(b => `「${b.text}${b.photo ? `［照片：${b.photo.desc}］` : ""}」`).join("")}。${hers.length ? `${herName()}用粉丝账号回过你：${hers.map(t => `「${t}」`).join("")}${room.known ? "（你知道是她）" : "（你不知道是她）"}。` : ""}`;
    const ev = remember(room.charId, evSum);
    const batch = uid("bt");
    room.items.slice(-bubbles.length).forEach(it => { it.ev = ev; it.evChar = room.charId; it.evSum = evSum; it.batch = batch; it.ropt = { sent: hers, wantPhoto: !!opts.wantPhoto }; });
    room.lastAt = nowIso(); saveRoom(room);
  }

  // 我的泡泡房：粉丝回一波，偷偷订阅的他可能混进来
  async function fanWave() {
    const room = myRoom();
    const mine = room.items.filter(i => i.by === "me").slice(-6);
    const mineText = mine.map(i => `- ${i.quote ? `（引用了「${i.quote}」）` : ""}${i.text}${i.photo ? `［照片：${i.photo.desc || "一张照片"}］` : ""}${i.sticker ? `［表情包：${i.sticker.name}］` : ""}`).join("\n");
    const secret = S.meta.secret.filter(id => charById(id));
    const lastHim = {}; room.items.forEach(i => { if (i.by === "him") lastHim[i.charId] = i.at; });
    const him = secret.find(id => Math.random() < 0.45 && (!lastHim[id] || Date.now() - new Date(lastHim[id]).getTime() > 20 * 60e3)) || null;
    const head = mine.length
      ? `爱豆「${myStage()}」在粉丝通讯 app bubble 上给订阅的粉丝发了这些泡泡（最新的在最后）：\n${mineText}`
      : `爱豆「${myStage()}」还没在粉丝通讯 app bubble 上发过泡泡。订阅她的粉丝自己来留言：想她、问她在干嘛、催她发泡泡、聊自己的日常。`;
    let raw;
    if (him) {
      const hc = charById(him);
      raw = await charGen(him, "secret", [
        `【bubble 是什么】bubble 是付费粉丝通讯 app：爱豆发泡泡，订阅的粉丝能回复，粉丝之间看不到彼此的回复，只有爱豆能看到所有回复。`,
        `【你】${herName()}（艺名「${myStage()}」）也是爱豆。你偷偷订阅了她的泡泡，用的是一个普通粉丝账号，别的粉丝不知道是你；她看得到是你。你们现实里的关系按你的记忆来。`,
        head,
        `【恋爱】${LOVE_RULE(him, "她")}`,
        `【粉丝】${FAN_MOOD}`, NO_HER(),
        (mine.length ? "【这次】先写其他粉丝对这几条泡泡的回复，再决定你要不要也回一条。" : "【这次】她最近没发泡泡。先写其他粉丝主动发来的留言，再决定你要不要也留一条。") + "你回的话按你的人设和你们的关系，像你会对她说的话，一两句；不想回就写 无。",
        "【输出】\n===粉丝回复===\n" + FAN_FORMAT + "写 8~12 条。\n===你的回复===\n内容：你的回复（不回写 无）",
      ].join("\n\n"), "粉丝回一波");
      if (!raw) return;
      const mineReply = field(blockOf(raw, "你的回复"), "内容") || blockOf(raw, "你的回复");
      const fans = parseFans(blockOf(raw, "粉丝回复"));
      pushFans(room, fans, none(mineReply) ? null : { charId: him, text: mineReply.slice(0, 200) });
      if (!none(mineReply)) {
        const evSum = `你用粉丝小号偷偷回了${herName()}的泡泡（bubble，她是爱豆「${myStage()}」）：${mine.length ? `她发的是${mine.slice(-2).map(i => `「${i.text}」`).join("")}，你回` : "她最近没发泡泡，你在她的泡泡房留言"}「${mineReply.slice(0, 200)}」。别的粉丝不知道是你。`;
        const ev = remember(him, evSum);
        const hi = [...room.items].reverse().find(i => i.by === "him" && i.charId === him);
        if (hi) { hi.ev = ev; hi.evChar = him; hi.evSum = evSum; saveRoom(room); }
      }
      else if (mine.length) remember(him, `你刷到了${herName()}在 bubble 发的泡泡${mine.slice(-2).map(i => `「${i.text}」`).join("")}，看了没回。`);
      if (hc) S.lastHimName = hc.name;
    } else {
      raw = await plainGen([head, `【粉丝】${FAN_MOOD}`, NO_HER(), (mine.length ? "【这次】写粉丝们对这几条泡泡的回复。" : "【这次】写粉丝们主动发来的留言。"), "【输出】\n===粉丝回复===\n" + FAN_FORMAT + "写 8~12 条。"].join("\n\n"), "粉丝回一波");
      if (!raw) return;
      pushFans(room, parseFans(blockOf(raw, "粉丝回复") || raw), null);
    }
  }
  function pushFans(room, fans, himReply) {
    const list = fans.map(f => ({ id: uid("f"), by: "fan", name: f.name, text: f.t, tr: f.tr }));
    if (himReply) list.splice(rand(1, Math.min(4, list.length)), 0, { id: uid("h"), by: "him", charId: himReply.charId, text: himReply.text });
    const base = Date.now();
    list.forEach((it, i) => { it.at = new Date(base + i * 700).toISOString(); room.items.push(it); });
    room.lastAt = nowIso(); saveRoom(room);
  }

  // ───────────────────────── 粉丝广场 ─────────────────────────
  // plaza：每个广场一条 { id, scope, board: charId | "me", posts: [{ id, by, name, charId, text, shot, likes, cmtN, hot, at, comments, loaded }], at }
  //   by: fan | me（大号）| meAlt（小号）| him（他大号）| himAlt（他小号）
  const boardKey = b => b || "me";
  function boardOf(key) {
    let b = S.plaza.find(x => x.board === key);
    if (!b) { b = { id: `plaza_${S.identity.id}_${key}`, scope: S.identity.id, board: key, posts: [] }; S.plaza.push(b); }
    return b;
  }
  const savePlaza = b => dbUpsert(COL.plaza, b).catch(e => console.warn(e));
  const boardName = key => key === "me" ? myStage() : stageName(S.rooms.find(r => r.kind === "char" && r.charId === key));
  /** 这个广场能看到的东西：爱豆发的泡泡，和被引用的那几句（不带 ID 名字） */
  function visibleBubbles(key) {
    const room = key === "me" ? myRoom() : S.rooms.find(r => r.kind === "char" && r.charId === key);
    if (!room) return [];
    return room.items.filter(i => (key === "me" ? i.by === "me" : i.by === "char")).slice(-10);
  }
  const bubbleLine = i => `${hm(i.at)} ${i.quote ? `（引用了一条粉丝回复「${i.quote}」）` : ""}${i.text}${i.photo ? `［照片：${i.photo.desc || "一张照片"}］` : ""}`;
  /** 他是不是爱豆：在 bubble 里有自己的泡泡房 */
  const isIdol = charId => S.rooms.some(r => r.kind === "char" && r.charId === charId);
  const PLAZA_RULE = "【广场是什么】bubble 的粉丝广场：粉丝自己发帖讨论爱豆。粉丝只看得到爱豆发的泡泡；粉丝回复别人看不到，只有被爱豆引用的那句会出现在泡泡里，而且不显示是谁发的。说到爱豆时只能根据泡泡、被引用的句子和帖子里的内容，不能编出别人看不到的东西。";
  function parsePosts(raw) {
    return String(raw || "").split(/===\s*帖子\s*===/).slice(1).map(b => ({
      name: field(b, "昵称") || pick(["momo", "晚风", "北北北"]),
      text: field(b, "内容"),
      shot: field(b, "截图"),
      likes: parseInt(field(b, "点赞").replace(/[^\d]/g, ""), 10) || rand(20, 900),
      cmtN: parseInt(field(b, "评论数").replace(/[^\d]/g, ""), 10) || rand(3, 200),
    })).filter(p => p.text && !isHerName(p.name)).slice(0, 8);
  }
  function matchShot(key, text) {
    if (none(text)) return null;
    const t = String(text).replace(/[「」“”"]/g, "").trim();
    const hit = visibleBubbles(key).find(i => i.text.includes(t.slice(0, 8)) || t.includes(i.text.slice(0, 8)));
    return hit ? { text: hit.text, quote: hit.quote || "", at: hit.at } : null;
  }
  async function refreshPlaza(key) {
    const b = boardOf(key);
    const bubbles = visibleBubbles(key);
    if (!bubbles.length) return toast(key === "me" ? "你还没发过泡泡，广场没什么可聊" : "他还没发过泡泡，广场没什么可聊");
    const idolName = boardName(key);
    const recentPosts = b.posts.slice(0, 8).map(p => `- ${p.name}：${p.text.slice(0, 40)}`).join("\n");
    const herMain = b.posts.filter(p => p.by === "me").slice(0, 2).map(p => p.text).join("；");
    const raw = await plainGen([
      PLAZA_RULE,
      `【这是谁的广场】爱豆「${idolName}」的粉丝广场。`,
      `【${idolName} 最近的泡泡】\n${bubbles.map(bubbleLine).join("\n")}`,
      herMain ? `【大事】爱豆「${myStage()}」本人用大号在这里发过帖：${herMain}。这件事大家一定会议论。` : "",
      recentPosts ? `【广场上已经有的帖】（不要重复）\n${recentPosts}` : "",
      `【粉丝】${FAN_MOOD}`, NO_HER(),
      "【这次】写 5~7 条新帖：有讨论泡泡的、扒被引用那句是谁的（只有泡泡里真引用了才会扒）、心疼、玩梗、吐槽公司，也要有粉丝发自己的日常，但日常一定和这个爱豆沾边。大部分中文，也有韩语日语英文，外语写成「原文｜中文翻译」。",
      "【输出】每条（昵称要像这个爱豆自己的粉丝会起的，不能带别的爱豆的名字）：\n===帖子===\n昵称：\n内容：\n截图：帖子里截图的那条泡泡原文（没截图写 无）\n点赞：数字\n评论数：数字",
    ].filter(Boolean).join("\n\n"), "刷新广场");
    if (!raw) return;
    const posts = parsePosts(raw).map(p => ({ id: uid("p"), by: "fan", name: p.name, ...splitTr(p.text), shot: matchShot(key, p.shot), likes: p.likes, cmtN: p.cmtN, comments: [], at: nowIso() }));
    // 他偶尔来逛：自己的广场用大号；别人的广场是爱豆只能小号
    const him = key !== "me" ? (Math.random() < 0.2 ? key : null) : S.meta.secret.concat(S.rooms.filter(r => r.kind === "char").map(r => r.charId)).find(id => charById(id) && Math.random() < 0.15);
    if (him) {
      const own = key === him;
      const alt = own ? false : (isIdol(him) ? true : Math.random() < 0.5);
      const hc = charById(him);
      const r2 = await charGen(him, "plaza", [
        PLAZA_RULE,
        `【你】你刷到了「${idolName}」的粉丝广场。${own ? "这是你自己的粉丝广场，你用的是大号（爱豆本人），大家都知道是你。" : alt ? `你用的是一个小号，没人知道是你；${herName()}看得出来。` : "你用的是大号，大家都知道是你。"}一般明星只是看看、不太当回事。`,
        `【${idolName} 最近的泡泡】\n${bubbles.slice(-5).map(bubbleLine).join("\n")}`,
        `【广场上的帖】\n${posts.map(p => `- ${p.name}：${p.text}`).join("\n")}`,
        `【恋爱】${LOVE_RULE(him, herName())}`,
        "【这次】按你的人设决定要不要发一条帖子。大多数时候不发，写 无。",
        "【输出】\n===你的帖子===\n内容：（不发写 无）",
      ].join("\n\n"), "他逛广场");
      const t = field(blockOf(r2, "你的帖子"), "内容") || "";
      if (r2 && !none(t)) {
        posts.splice(rand(0, 2), 0, { id: uid("p"), by: alt ? "himAlt" : "him", charId: him, name: alt ? `${(hc.name || "x").slice(0, 1).toLowerCase()}_${rand(1000, 9999)}` : (own ? stageName(S.rooms.find(r => r.charId === him)) : hc.name), text: t.slice(0, 300), likes: rand(50, 9000), cmtN: rand(10, 900), comments: [], at: nowIso() });
        remember(him, `你${alt ? "用小号" : "用大号"}在「${idolName}」的 bubble 粉丝广场发了帖：「${t}」。`);
      }
    }
    b.posts = [...posts, ...b.posts].slice(0, 60);
    b.at = nowIso(); savePlaza(b);
    if (key !== "me" && Math.random() < 0.3) remember(key, `你刷了一眼自己在 bubble 的粉丝广场，大家在聊：${posts.slice(0, 3).map(p => `「${p.text.slice(0, 30)}」`).join("")}。一般不当回事。`);
  }
  function splitTr(text) { const [t, tr] = String(text).split(/[｜|]/).map(x => x.trim()); return { text: t, tr: tr || "" }; }
  async function loadComments(key, post) {
    const b = boardOf(key);
    const mine = post.comments.filter(c => c.by === "me" || c.by === "meAlt").slice(-2).map(c => `${c.by === "me" ? `爱豆「${myStage()}」本人（大号）` : "某个粉丝"}说：${c.text}`).join("\n");
    const raw = await plainGen([
      PLAZA_RULE,
      `【帖子】（在爱豆「${boardName(key)}」的粉丝广场）${post.by === "me" ? `这帖是爱豆「${myStage()}」本人用大号发的！` : ""}\n${post.name}：${post.text}${post.shot ? `\n（截图了泡泡：${post.shot.quote ? `引用「${post.shot.quote}」` : ""}${post.shot.text}）` : ""}`,
      post.comments.length ? `【已有评论】\n${post.comments.slice(-10).map(c => `- ${c.name}：${c.text}`).join("\n")}` : "",
      mine ? `【要接住的】\n${mine}` : "",
      `【粉丝】${FAN_MOOD}`, NO_HER(),
      "【这次】写 6~10 条新评论，可以互相吵、互相回。" + "每行一条，开头写「- 昵称：」，昵称要像这个爱豆自己的粉丝会起的，不能带别的爱豆的名字。大部分中文，也有韩语日语英文，外语写成「原文｜中文翻译」。",
    ].filter(Boolean).join("\n\n"), "看评论");
    if (!raw) return;
    const list = parseFans(raw).map(f => ({ id: uid("c"), by: "fan", name: f.name, text: f.t, tr: f.tr, at: nowIso() }));
    post.comments = [...post.comments, ...list].slice(-80); post.loaded = true; post.cmtN = Math.max(post.cmtN || 0, post.comments.length);
    savePlaza(b);
  }
  function herPostSaid(key, by, text, where) {
    // 她用大号在他的广场说话是大事：他会知道
    if (by === "me" && key !== "me") remember(key, `${herName()}（爱豆「${myStage()}」）用大号在你的 bubble 粉丝广场${where}：「${text}」。所有粉丝都看到了。`);
  }

  // ───────────────────────── 渲染 ─────────────────────────
  const app = () => $("#app");
  function avatarEl(src, seed, cls) { return src ? `<img class="ava ${cls || ""}" src="${esc(src)}" alt="">` : `<div class="ava ${cls || ""}" style="background:${seed === "me" ? "linear-gradient(135deg,#f6d3dc,#c98a9c)" : `linear-gradient(135deg,hsl(${hashHue(seed)},50%,72%),hsl(${(hashHue(seed) + 40) % 360},50%,58%))`}"></div>`; }
  function header(title, sub, opts = {}) {
    return `<div class="hd"><div class="hd-t"><b>${esc(title)}${opts.caret ? `<i>${I.down}</i>` : ""}</b>${sub ? `<small>${sub}</small>` : ""}</div><div class="hd-in">${opts.back ? `<button class="ic" data-act="back">${I.back}</button>` : `<span class="ic"></span>`}${opts.more ? `<button class="ic" data-act="more">${I.more}</button>` : `<span class="ic"></span>`}</div></div>`;
  }
  function render() {
    const v = S.view;
    if (v.page === "room") return renderRoom(roomById(v.roomId));
    if (v.page === "plaza") return renderPlaza();
    if (v.page === "post") return renderPost();
    if (v.page === "mine") return renderMine();
    renderHome();
  }
  const tabbar = on => `<nav class="tabbar">${[["home", "泡泡"], ["plaza", "广场"], ["mine", "我的"]].map(([k, l]) => `<button data-tab="${k}" class="${on === k ? "on" : ""}">${l}</button>`).join("")}</nav>`;
  function postAuthor(p) {
    if (p.by === "me") return `${avatarEl(myAvatar(), "me", "pa")}<div class="pn"><b>${esc(myStage())}<em class="art">ARTIST</em></b>`;
    if (p.by === "meAlt") return `<div class="ava pa" style="background:#C9CDD3"></div><div class="pn"><b>${esc(p.name)}<em class="alt">我的小号</em></b>`;
    if (p.by === "him") { const r = S.rooms.find(x => x.charId === p.charId); return `${avatarEl((r && r.avatar) || (charById(p.charId) || {}).avatar, p.charId, "pa")}<div class="pn"><b>${esc(p.name)}${isIdol(p.charId) ? `<em class="art">ARTIST</em>` : ""}</b>`; }
    if (p.by === "himAlt") return `<div class="ava pa him-ava" style="background:linear-gradient(135deg,#8a7a6a,#4b4038)"></div><div class="pn"><b>${esc(p.name)}<span class="himtag">是${esc((charById(p.charId) || {}).name || "他")}的小号</span></b>`;
    return `<div class="ava pa" style="background:${pastelFor(p.name)}"></div><div class="pn"><b>${esc(p.name)}</b>`;
  }
  const ago = iso => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? "刚刚" : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : listTime(iso); };
  const fmtN = n => n >= 10000 ? `${(n / 10000).toFixed(1)}w` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0);
  function shotHtml(key, shot) {
    if (!shot) return "";
    return `<div class="shot"><div class="sw"><em>ARTIST</em>${esc(boardName(key))} · ${hm(shot.at)}</div>${shot.quote ? `<div class="sq">${esc(shot.quote)}<small>被引用的粉丝回复</small></div>` : ""}<span class="sb">${esc(shot.text)}</span></div>`;
  }
  function postCard(key, p, full) {
    return `<div class="post ${p.by === "himAlt" || p.by === "him" ? "is-him" : ""} ${p.by === "me" || p.by === "meAlt" ? "is-mine" : ""}" ${full ? "" : `data-post="${p.id}"`}><div class="ph">${postAuthor(p)}<small>${ago(p.at)}</small></div></div>
      <div class="pt">${p.likes > 1500 && !full ? `<i class="hot">热</i>` : ""}${esc(p.text)}${p.tr ? `<div class="tr">${esc(p.tr)}</div>` : ""}</div>${shotHtml(key, p.shot)}
      <div class="pf"><span>${I.heart}${fmtN(p.likes)}</span><span>${I.cmt}${fmtN(p.cmtN)}</span></div></div>`;
  }
  function boardsBar(key) {
    const rooms = S.rooms.filter(r => r.kind === "char" && charById(r.charId));
    return `<div class="boards">${rooms.map(r => `<button data-board="${r.charId}" class="${key === r.charId ? "on" : ""}">${avatarEl(roomAvatar(r), r.charId)}${esc(stageName(r))}</button>`).join("")}<button data-board="me" class="${key === "me" ? "on" : ""}">${avatarEl(myAvatar(), "me")}${esc(myStage())}</button></div>`;
  }
  function renderPlaza() {
    const key = S.view.board || (S.rooms.find(r => r.kind === "char" && charById(r.charId)) || {}).charId || "me";
    S.view.board = key;
    const b = boardOf(key);
    const busy = S.busy.size > 0;
    app().innerHTML = `${header("广场", "bubble")}<div class="plaza">${boardsBar(key)}
      <div class="pbar"><span>${b.at ? `${listTime(b.at)} 刷新过` : "还没刷新过"}</span><button data-act="refreshPlaza" ${busy ? "disabled" : ""}>${busy ? "刷新中…" : "↻ 刷新广场"}</button></div>
      <div class="feed">${b.posts.map(p => postCard(key, p)).join("") || `<div class="empty">点「刷新广场」，看看大家在聊什么</div>`}</div>
      <button class="fab" data-act="newPost">${I.plus}</button></div>${tabbar("plaza")}`;
  }
  function renderPost() {
    const key = S.view.board; const b = boardOf(key); const p = b.posts.find(x => x.id === S.view.postId);
    if (!p) { S.view = { page: "plaza", board: key }; return renderPlaza(); }
    const busy = S.busy.size > 0;
    const canAlt = key !== "me";
    const acct = canAlt && S.view.acct === "alt" ? "alt" : "main";
    app().innerHTML = `${header("帖子", `${esc(boardName(key))}的广场`, { back: true })}<div class="postpage">
      ${postCard(key, p, true)}
      <div class="cms">${p.comments.map(c => `<div class="cm ${c.by === "himAlt" ? "is-him" : ""} ${c.by === "me" || c.by === "meAlt" ? "is-mine" : ""}">${c.by === "me" ? avatarEl(myAvatar(), "me", "ca") : `<div class="ava ca" style="background:${c.by === "meAlt" ? "#C9CDD3" : pastelFor(c.name)}"></div>`}<div><b>${esc(c.by === "me" ? myStage() : c.name)}${c.by === "me" ? `<em class="art">ARTIST</em>` : c.by === "meAlt" ? `<em class="alt">我的小号</em>` : ""}</b><p>${esc(c.text)}</p>${c.tr ? `<div class="tr">${esc(c.tr)}</div>` : ""}</div></div>`).join("")}
        <button class="more-cm" data-act="loadCm" ${busy ? "disabled" : ""}>${busy ? "加载中…" : p.loaded ? "看看新评论" : `看看大家怎么说（${fmtN(p.cmtN)}）`}</button></div>
    </div>
    <form class="composer pc">${canAlt ? `<button type="button" class="acct" data-act="acct">${acct === "alt" ? `<i style="background:#C9CDD3"></i>小号` : `${avatarEl(myAvatar(), "me")}大号`} ⌄</button>` : ""}<input class="ta" maxlength="200" placeholder="说点什么…"><button class="send" type="submit">${I.send}</button></form>`;
  }
  function renderMine() {
    app().innerHTML = `${header("我的", "")}<div class="home">
      <div class="me-card">${avatarEl(myAvatar(), "me")}<div><b><em class="art">ARTIST</em>${esc(myStage())}</b><small>我的泡泡房 · 订阅 ${esc(S.meta.subN)} 万</small></div></div>
      <button class="opt" data-act="myAva"><div class="cell-main">我的泡泡头像<small>只在 bubble 里用</small></div></button>
      <button class="opt" data-act="myName"><div class="cell-main">我的艺名<small>${esc(myStage())}</small></div></button>
      <button class="opt" data-act="altName"><div class="cell-main">广场小号昵称<small>${esc(S.meta.alt)}</small></div></button>
      <button class="opt" data-act="secret"><div class="cell-main">谁偷偷订阅了我<small>${esc(S.meta.secret.map(id => (charById(id) || {}).name).filter(Boolean).join("、") || "还没有人")}</small></div></button>
      <button class="opt" data-act="dress"><div class="cell-main">我的泡泡房装扮</div></button>
      <div class="ver">bubble ${esc(VERSION)} · <button data-act="debug">调试记录</button></div>
    </div>${tabbar("mine")}`;
  }
  function renderHome() {
    const me = myRoom();
    const lastMine = [...me.items].reverse().find(i => i.by === "me");
    const charRooms = S.rooms.filter(r => r.kind === "char" && charById(r.charId)).sort((a, b) => String(b.lastAt || b.createdAt).localeCompare(String(a.lastAt || a.createdAt)));
    app().innerHTML = `${header("", "")}<div class="home">
      <div class="brand">bubble<i></i></div>
      <div class="sec">我的泡泡房</div>
      <button class="row" data-room="${me.id}">${avatarEl(myAvatar(), "me")}<div class="cell-main"><b><em class="art">ARTIST</em>${esc(myStage())}</b><small>${esc(lastMine ? lastMine.text : "还没发过泡泡")}</small></div><span class="tm">${lastMine ? listTime(lastMine.at) : ""}</span></button>
      <div class="sec">订阅中<button class="sec-btn" data-act="sub">${I.plus}订阅</button></div>
      ${charRooms.map(r => { const last = [...r.items].reverse().find(i => i.by === "char"); return `<button class="row" data-room="${r.id}">${avatarEl(roomAvatar(r), r.charId)}<div class="cell-main"><b>${esc(stageName(r))}<span class="days">💜 +${subDays(r)}</span></b><small>${esc(last ? last.text : "还没有泡泡，进去催一催")}</small></div><span class="tm">${last ? listTime(last.at) : ""}</span></button>`; }).join("") || `<div class="empty">还没订阅谁。点右边「订阅」，选一个你的 char 当爱豆</div>`}
    </div>${tabbar("home")}`;
  }

  function journalDeco() {
    return `<div class="deco-layer">
      <i class="plaid" style="left:-20px;top:90px;width:90px;height:70px;transform:rotate(-6deg)"></i><i class="plaid" style="right:-30px;top:300px;width:110px;height:80px;transform:rotate(8deg)"></i><i class="plaid" style="left:-10px;bottom:60px;width:80px;height:90px;transform:rotate(4deg)"></i>
      <i class="tape" style="left:20px;top:270px;width:70px;transform:rotate(-14deg)"></i><i class="tape" style="right:30px;top:60px;width:60px;transform:rotate(18deg)"></i>
      <i class="dots" style="left:120px;top:16px"></i><i class="dots" style="right:40px;bottom:140px"></i>
      <span class="script" style="left:14px;top:40px">a little<br>bright<br>today</span><span class="script" style="right:20px;top:200px;transform:rotate(-18deg)">stars in my<br>heart ♡</span>
      <span class="script" style="right:16px;top:440px;transform:rotate(-10deg)">keep<br>going ♡</span><span class="script" style="left:30px;bottom:24px;transform:rotate(-14deg)">good things<br>await ♡</span>
      <svg class="dg" style="right:40px;top:110px" width="30" height="30" viewBox="0 0 24 24" fill="#ECE6EA"><circle cx="9" cy="9" r="4"/><circle cx="15" cy="9" r="4"/><circle cx="9" cy="15" r="4"/><circle cx="15" cy="15" r="4"/></svg>
      <svg class="dg" style="left:18px;top:230px" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E6D3DA" stroke-width="1.4"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>
      <svg class="dg" style="right:22px;top:380px" width="50" height="36" viewBox="0 0 60 40" fill="none" stroke="#EBC9D3" stroke-width="1.6"><path d="M30 20c-8-12-24-12-22 0s16 2 22 0zM30 20c8-12 24-12 22 0s-16 2-22 0zM30 20l-8 18M30 20l8 18"/></svg>
    </div>`;
  }

  function renderRoom(room) {
    if (!room) { S.view = { page: "home" }; return renderHome(); }
    const isMe = room.kind === "me";
    const busy = S.busy.size > 0;
    const title = isMe ? myStage() : stageName(room);
    const sub = isMe ? `我的泡泡房 · 订阅 ${esc(S.meta.subN)} 万` : `bubble 💜 +${subDays(room)}`;
    const theme = isMe ? S.meta.theme : "plain";
    const bgStyle = isMe && theme === "custom" && S.meta.bg ? `style="--bg-img:url('${S.meta.bg}');--bg-op:${S.meta.bgOpacity}"` : "";
    const scroll = $(".scroll", app());
    const keepBottom = !scroll || scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
    app().innerHTML = `${header(title, sub, { back: true, more: true, caret: true })}
      <div class="room ${isMe ? "is-me" : "is-char"} theme-${theme}" ${bgStyle} style="--mine:${isMe ? S.meta.myColor : "#B07CE8"}">
        ${theme === "journal" ? journalDeco() : ""}${theme === "custom" ? `<div class="bg-layer"></div>` : ""}
        <div class="scroll">${isMe ? renderMyItems(room) : renderCharItems(room)}${busy ? `<div class="typing">${isMe ? "粉丝们在回复…" : `${esc(title)} 正在输入…`}</div>` : ""}</div>
      </div>
      <div class="bottom">
        ${S.quote && S.quote.roomId === room.id ? `<div class="qbar"><span>引用：${esc(S.quote.text)}</span><button data-act="unquote">${I.x}</button></div>` : ""}
        <div class="tray">${isMe
          ? `<button class="tchip" data-act="wave" ${busy ? "disabled" : ""}>${I.bubble}让粉丝回一波</button><button class="tchip" data-act="myPhoto">${I.photo}照片</button><button class="tchip" data-act="myStk">${I.smile}表情</button><button class="tchip" data-act="dress">${I.palette}装扮</button>`
          : `<button class="tchip" data-act="urge" ${busy ? "disabled" : ""}>${I.bubble}催TA发泡泡</button><button class="tchip" data-act="urgePhoto" ${busy ? "disabled" : ""}>${I.photo}催TA发照片</button><button class="tchip" data-act="switch">${I.swap}换个人</button><button class="tchip" data-act="direct">${I.spark}场外指示</button><button class="tchip" data-act="handwrite">${I.pen}手写TA的话</button>`}</div>
        ${!isMe && room.pending.length ? `<div class="sendbar"><span>${room.pending.length} 条还没发出去</span><button data-act="flush" ${busy ? "disabled" : ""}>发出去</button></div>` : ""}
        <form class="composer"><button type="button" class="x" data-act="clear">${I.x}</button><input class="ta" maxlength="200" placeholder="${isMe ? "发个泡泡…" : "给TA留言…"}"><button class="send" type="submit">${I.send}</button></form>
      </div>`;
    const sc = $(".scroll", app());
    if (keepBottom || S.forceBottom) { sc.scrollTop = sc.scrollHeight; S.forceBottom = false; }
    hydrateImages();
  }

  /** 连着的同一个人归成一组：头像和名字跟着第一条 */
  function groups(items, keyOf) {
    const out = [];
    for (const it of items) { const k = keyOf(it); const g = out[out.length - 1]; if (g && g.key === k) g.items.push(it); else out.push({ key: k, items: [it] }); }
    return out;
  }
  function dayChips(items, render1) {
    let lastDay = ""; let html = "";
    for (const g of items) { const d = new Date(g.items[0].at).toDateString(); if (d !== lastDay) { html += `<div class="chip"><span>${dayLabel(g.items[0].at)}</span></div>`; lastDay = d; } html += render1(g); }
    return html;
  }
  const quoteHtml = q => q ? `<div class="quote">${esc(q)}</div>` : "";
  const IMG = {};
  /** 泡泡里面：引用 + 照片 + 文字 */
  /** 一条泡泡：照片单独一个，说的话另起一个气泡；时间跟着这一组第一条 */
  function lineHtml(it, stamp) {
    const st = stamp ? `<span class="stamp">${hm(it.at)}</span>` : "";
    if (it.sticker) return `<div class="line"><div class="bub ph-only" data-item="${it.id}">${stickerHtml(it.sticker)}</div>${st}</div>`;
    const photo = it.photo ? `<div class="line"><div class="bub ph-only" data-item="${it.id}">${bubInner({ photo: it.photo, id: it.id })}</div>${st}</div>` : "";
    const words = it.text || (it.quote && !it.photo) ? `<div class="line"><div class="bub" data-item="${it.id}">${bubInner({ text: it.text, quote: it.quote })}</div>${it.photo ? "" : st}</div>` : "";
    return photo + words;
  }
  function stickerHtml(st) {
    const src = st.url || IMG[st.ref] || "";
    return `<img class="stk" ${st.ref && !st.url ? `data-ref="${esc(st.ref)}"` : ""} ${src ? `src="${esc(src)}"` : ""} alt="${esc(st.name)}">`;
  }
  function bubInner(it) {
    const ph = it.photo;
    const photo = !ph ? "" : ph.ref
      ? `<img class="ph-img" data-ph="${it.id}" data-ref="${esc(ph.ref)}" ${IMG[ph.ref] ? `src="${IMG[ph.ref]}"` : ""} alt="">`
      : `<div class="ph-text" data-ph="${it.id}"><i class="ph-cam">${I.photo}</i><p>${esc(ph.desc || "一张照片")}</p>${ph.busy ? `<span class="ph-gen">生成中…</span>` : `<button class="ph-gen" data-gen="${it.id}">点一下生成</button>`}</div>`;
    return `${quoteHtml(it.quote)}${photo}${it.text ? `<div class="bt">${esc(it.text)}</div>` : ""}`;
  }
  function hydrateImages() {
    document.querySelectorAll("img[data-ref]:not([src])").forEach(el => {
      const ref = el.dataset.ref;
      if (IMG[ref]) { el.src = IMG[ref]; return; }
      api.media.get({ ref }).then(r => { if (r && r.dataUrl) { IMG[ref] = r.dataUrl; document.querySelectorAll(`img[data-ref="${CSS.escape(ref)}"]`).forEach(x => { x.src = r.dataUrl; }); } }).catch(e => console.warn(e));
    });
    document.querySelectorAll("img.ph-img").forEach(el => {
      const mark = () => { if (el.naturalWidth > el.naturalHeight) el.classList.add("wide"); };
      if (el.complete) mark(); else el.addEventListener("load", mark, { once: true });
    });
  }
  async function storeDataUrl(dataUrl) {
    const r = await api.media.put({ dataUrl });
    if (r && r.ref) IMG[r.ref] = dataUrl;
    return r && r.ref;
  }
  async function genPhoto(room, itemId) {
    const it = room.items.find(i => i.id === itemId); if (!it || !it.photo || it.photo.ref || it.photo.busy) return;
    it.photo.busy = true; render();
    try {
      const isHim = it.by === "char";
      // 跟微博配图一模一样的写法：只发描述；是他发的就带上他，本人出镜才用参考图
      const who = isHim ? room.charId : undefined;
      const r = await api.ai.generateImage({ prompt: it.photo.desc, characterId: who, useReferenceImage: !!who && !!it.photo.self, timeoutMs: 120000 });
      if (!r || !r.dataUrl) throw new Error("没有生成出图片");
      it.photo.ref = await storeDataUrl(r.dataUrl);
    } catch (e) { toast(`生图失败：${(e && e.message) || e}`.slice(0, 60)); }
    finally { delete it.photo.busy; saveRoom(room); render(); }
  }
  /** 记忆跟着改：同一批共用一个事件，先删旧的，有剩下的话按新内容重记 */
  function refreshMemory(room, it, oldPiece, newPiece) {
    if (!it.ev) return false;
    const same = room.items.filter(i => i.ev === it.ev);
    if (api.memory && api.memory.deleteTimeline) api.memory.deleteTimeline({ characterId: it.evChar, appEventId: it.ev }).catch(e => console.warn(e));
    let sum = it.evSum || "";
    if (oldPiece) sum = sum.replace(oldPiece, newPiece);
    const keep = same.filter(i => room.items.includes(i));
    if (!keep.length || !sum || /泡泡：。/.test(sum)) { keep.forEach(i => { delete i.ev; delete i.evSum; }); return true; }
    const ev = remember(it.evChar, sum);
    keep.forEach(i => { i.ev = ev; i.evSum = sum; });
    return true;
  }
  const pieceOf = it => it.by === "char" ? `「${it.text}${it.photo ? `［照片：${it.photo.desc}］` : ""}」` : it.by === "him" ? `你回「${it.text}」` : "";
  async function itemMenu(room, itemId) {
    const it = room.items.find(i => i.id === itemId); if (!it) return;
    const canEdit = !it.sticker && (it.text || !it.photo);
    const lastBatch = it.by === "char" && it.batch && ![...room.items].reverse().find(i => i.by === "char" && i.batch !== it.batch && room.items.indexOf(i) > room.items.indexOf(it));
    const v = await sheet("", [...(canEdit ? [{ label: "编辑", value: "edit" }] : []), ...(lastBatch ? [{ label: "重 roll（他这一批重新发）", value: "reroll" }] : []), { label: it.ev ? "删除（他也不记得了）" : "删除", danger: true, value: "del" }]);
    if (!v) return;
    if (v === "reroll") {
      const same = room.items.filter(i => i.batch === it.batch);
      if (it.ev && api.memory && api.memory.deleteTimeline) api.memory.deleteTimeline({ characterId: it.evChar, appEventId: it.ev }).catch(e => console.warn(e));
      const hint = await inputSheet("重 roll", "", { long: true, max: 300, ph: "想让他这次怎么改，可以不填", hint: "他这一批泡泡和记忆会删掉，按你写的重新发" });
      if (hint == null) return;
      room.items = room.items.filter(i => !same.includes(i)); saveRoom(room); render();
      await charBubbles(room, { ...(it.ropt || {}), hint });
      S.forceBottom = true; render();
      return;
    }
    const oldPiece = pieceOf(it);
    if (v === "edit") {
      const t = await inputSheet("编辑", it.text, { long: true, max: 300 });
      if (t == null || t === it.text) return;
      if (!t) return toast("不能是空的，不要就删掉");
      it.text = t;
      const changed = refreshMemory(room, it, oldPiece, pieceOf(it));
      saveRoom(room); render();
      toast(changed ? "改好了，他记得的也改了" : it.by === "char" || it.by === "him" ? "改好了（这条是之前发的，他记得的那句没法跟着改）" : "改好了");
    } else {
      const ok = await sheet(it.ev ? "删掉这条，他也会忘掉" : "删掉这条？", [{ label: "删除", danger: true, value: 1 }]); if (!ok) return;
      const idx = room.items.indexOf(it);
      if (it.fans) { const prev = [...room.items.slice(0, idx)].reverse().find(i => i.by === it.by && i.ev && i.ev === it.ev); if (prev) { prev.fans = it.fans; prev.fanN = it.fanN; } }
      room.items.splice(idx, 1);
      const changed = refreshMemory(room, it, oldPiece, "");
      saveRoom(room); render();
      toast(changed ? "删掉了，他也不记得了" : it.by === "char" || it.by === "him" ? "删掉了（这条是之前发的，他记得的那句没法跟着删）" : "删掉了");
    }
  }
  /** 点照片：看完整描述 / 大图，改描述，生成或重新生成 */
  function photoSheet(room, itemId) {
    const it = room.items.find(i => i.id === itemId); if (!it || !it.photo) return;
    const ph = it.photo;
    const mask = document.createElement("div"); mask.className = "mask";
    mask.innerHTML = `<form class="sheet" action="#"><div class="grab"></div>
      ${ph.ref ? `<div class="ph-view"><img data-ref="${esc(ph.ref)}" ${IMG[ph.ref] ? `src="${IMG[ph.ref]}"` : ""} alt=""></div>` : ""}
      <div class="sheet-h">照片描述</div>
      <div style="padding:0 18px 12px"><textarea class="field" rows="5" maxlength="600">${esc(ph.desc || "")}</textarea></div>
      <button class="opt ok" type="submit" data-v="save"><div class="cell-main">保存描述</div></button>
      ${ph.busy ? "" : `<button class="opt" type="submit" data-v="gen" style="justify-content:center;text-align:center"><div class="cell-main">${ph.ref ? "按这个描述重新生成" : "保存并生成"}</div></button>`}
    </form>`;
    hydrateImages();
    const input = $(".field", mask);
    let v = "save";
    mask.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => { v = b.dataset.v; }));
    $("form", mask).onsubmit = e => {
      e.preventDefault(); mask.remove();
      const desc = input.value.trim();
      if (desc) ph.desc = desc;
      if (v === "gen") { if (ph.ref) delete ph.ref; saveRoom(room); genPhoto(room, itemId); }
      else { saveRoom(room); render(); toast("改好了"); }
    };
    mask.onclick = e => { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }
  async function myStickers(room) {
    const list = S.meta.stickers;
    const mask = document.createElement("div"); mask.className = "mask";
    const draw = () => {
      mask.innerHTML = `<div class="sheet"><div class="grab"></div><div class="sheet-t2">我的表情包</div>
        <div class="stk-grid">${list.map((st, i) => `<button class="stk-cell" data-send="${i}">${stickerHtml(st)}<small>${esc(st.name)}</small></button>`).join("")}
          <button class="stk-cell add" data-add="album">＋<small>相册</small></button><button class="stk-cell add" data-add="paste">＋<small>粘贴链接</small></button></div>
        ${list.length ? `<div class="sheet-hint">点一下发出去；长按删掉</div>` : `<div class="sheet-hint">还没有表情包。可以从相册加，也可以一次粘贴多行「名字：图片链接」</div>`}</div>`;
      hydrateImages();
    };
    draw();
    let pressT = null;
    mask.addEventListener("pointerdown", e => { const c = e.target.closest("[data-send]"); if (!c) return; pressT = setTimeout(() => { pressT = "del"; const i = +c.dataset.send; list.splice(i, 1); saveMeta(); draw(); toast("删掉了"); }, 600); });
    mask.addEventListener("pointerup", () => { if (pressT && pressT !== "del") clearTimeout(pressT); });
    mask.onclick = async e => {
      if (e.target === mask) { mask.remove(); return; }
      if (pressT === "del") { pressT = null; return; }
      const send = e.target.closest("[data-send]"); const add = e.target.closest("[data-add]");
      if (send) {
        const st = list[+send.dataset.send]; mask.remove();
        room.items.push({ id: uid("m"), by: "me", text: "", sticker: { ...st }, at: nowIso() }); room.lastAt = nowIso(); saveRoom(room); S.forceBottom = true; render();
      } else if (add && add.dataset.add === "album") {
        const d = await pickImage(360); if (!d) return;
        const name = await inputSheet("给这个表情包起个名", "", { ph: "粉丝靠名字知道是什么表情" }); if (!name) return;
        const ref = await storeDataUrl(d).catch(() => ""); if (!ref) return toast("没存上");
        list.push({ name, ref }); saveMeta(); draw();
      } else if (add && add.dataset.add === "paste") {
        const t = await inputSheet("粘贴表情包", "", { long: true, max: 4000, ph: "一行一个：名字：图片链接" }); if (!t) return;
        let n = 0;
        for (const line of t.split("\n")) { const m = line.trim().match(/^(.+?)[：:]\s*(https?:\/\/\S+)$/); if (m) { list.push({ name: m[1].trim().slice(0, 20), url: m[2] }); n++; } }
        saveMeta(); draw(); toast(n ? `加了 ${n} 个` : "没认出来，格式是 名字：链接");
      }
    };
    document.body.appendChild(mask);
  }
  async function myPhoto(room) {
    const v = await sheet("发照片", [{ label: "从相册选", value: "album" }, { label: "写一句描述（文字照片）", value: "text" }, { label: "写描述，让 AI 画", value: "ai" }]);
    if (!v) return;
    let ref = "", desc = "";
    if (v === "album") {
      const d = await pickImage(1280); if (!d) return;
      ref = await storeDataUrl(d).catch(() => "");
      if (!ref) return toast("照片没存上");
      desc = (await inputSheet("这张照片拍的是什么", "", { long: true, ph: "粉丝和他靠这句话知道照片内容，可以不写" })) || "";
    } else {
      desc = await inputSheet("照片描述", "", { long: true, ph: "照片里是什么" });
      if (!desc) return;
    }
    const it = { id: uid("m"), by: "me", text: "", photo: { desc, ...(ref ? { ref } : {}) }, at: nowIso() };
    room.items.push(it); room.lastAt = nowIso(); saveRoom(room); S.forceBottom = true; render();
    if (v === "ai") await genPhoto(room, it.id);
  }
  const trHtml = tr => tr ? `<div class="tr">${esc(tr)}</div>` : "";

  function renderCharItems(room) {
    if (!room.items.length) return `<div class="empty-room">${esc(stageName(room))} 还没发泡泡<br><small>点下面「催TA发泡泡」</small></div>`;
    const gs = groups(room.items, it => it.by);
    return dayChips(gs, g => {
      const last = g.items[g.items.length - 1];
      if (g.key === "me") {
        return `<div class="grp me"><div class="stack">${g.items.map((it, i) => lineHtml(it, i === 0)).join("")}</div>${avatarEl(myAvatar(), "me", "me-ava")}</div>`;
      }
      const fold = last.fans && last.fans.length ? `<button class="fold" data-fans="${last.id}"><span class="heads"><i style="background:#FFD6E0"></i><i style="background:#D6E9FF"></i><i style="background:#DDF5E4"></i></span><span class="n">粉丝回复 ${last.fanN || last.fans.length} ›</span></button>` : "";
      return `<div class="grp">${avatarEl(roomAvatar(room), room.charId, "artist-ava")}<div class="stack"><div class="who"><em class="art">ARTIST</em>${esc(stageName(room))}</div>${g.items.map((it, i) => lineHtml(it, i === 0)).join("")}</div></div>${fold}`;
    });
  }

  function renderMyItems(room) {
    if (!room.items.length) return `<div class="empty-room">这是你的泡泡房<br><small>发个泡泡，再点「让粉丝回一波」</small></div>`;
    const gs = groups(room.items, it => it.by === "me" ? "me" : `${it.by}:${it.name || it.charId}`);
    return dayChips(gs, g => {
      const f = g.items[0];
      if (g.key === "me") {
        return `<div class="grp me"><div class="stack"><div class="who"><em class="art">ARTIST</em>${esc(myStage())}</div>${g.items.map((it, i) => lineHtml(it, i === 0)).join("")}</div>${avatarEl(myAvatar(), "me", "me-ava")}</div>`;
      }
      if (f.by === "him") {
        const c = charById(f.charId) || {}; const r = S.rooms.find(x => x.kind === "char" && x.charId === f.charId);
        return `<div class="grp fan him">${avatarEl(r && r.avatar || c.avatar, f.charId, "him-ava")}<div class="stack"><div class="fn">${esc(c.name || "他")}<small>粉丝看不到是他</small></div>${g.items.map(it => `<div class="line"><div class="card" data-quote="${it.id}" data-item="${it.id}">${esc(it.text)}</div><span class="stamp">${hm(it.at)}</span></div>`).join("")}</div></div>`;
      }
      return `<div class="grp fan"><div class="ava fan-ava" style="background:${pastelFor(f.name)}"></div><div class="stack"><div class="fn">${esc(f.name || "粉丝")}</div>${g.items.map(it => `<div class="line"><div class="card" data-quote="${it.id}" data-item="${it.id}">${esc(it.text)}${trHtml(it.tr)}</div></div>`).join("")}</div></div>`;
    });
  }

  function openFans(room, itemId) {
    const it = room.items.find(i => i.id === itemId); if (!it) return;
    const mask = document.createElement("div"); mask.className = "mask";
    mask.innerHTML = `<div class="sheet fans"><div class="grab"></div><div class="sheet-t">粉丝回复 · ${it.fanN || it.fans.length}</div><div class="fl-wrap">${it.fans.map(f => `<div class="fl ${f.me ? "me" : ""}">${esc(f.t)}${f.tr ? `<div class="tr">${esc(f.tr)}</div>` : ""}</div>`).join("")}</div></div>`;
    mask.onclick = e => { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }

  // ───────────────────────── 交互 ─────────────────────────
  async function subscribe() {
    const taken = new Set(S.rooms.filter(r => r.kind === "char").map(r => r.charId));
    const list = S.chars.filter(c => !taken.has(c.id));
    if (!list.length) return toast(S.chars.length ? "都订阅啦" : "还没有角色");
    const id = await sheet("订阅谁的泡泡", list.map(c => ({ label: c.name, value: c.id })));
    if (!id) return;
    const r = { id: `room_${S.identity.id}_${id}`, scope: S.identity.id, kind: "char", charId: id, items: [], pending: [], known: false, createdAt: nowIso() };
    S.rooms.push(r); saveRoom(r);
    S.view = { page: "room", roomId: r.id }; S.forceBottom = true; render();
  }

  async function roomMenu(room) {
    if (room.kind === "me") {
      const secretNames = S.meta.secret.map(id => (charById(id) || {}).name).filter(Boolean).join("、");
      const v = await sheet("", [
        { label: "装扮", value: "dress" },
        { label: "我的泡泡头像", sub: "只在 bubble 里用", value: "ava" },
        { label: "我的艺名", sub: myStage(), value: "name" },
        { label: "谁偷偷订阅了我", sub: secretNames || "还没有人", value: "secret" },
        { label: "清空我的泡泡房", danger: true, value: "clear" },
      ]);
      if (v === "dress") return dressPanel();
      if (v === "ava") { const d = await pickImage(320); if (d) { S.meta.me.avatar = d; saveMeta(); render(); } return; }
      if (v === "name") { const n = await inputSheet("我的艺名", myStage()); if (n) { S.meta.me.name = n; saveMeta(); render(); } return; }
      if (v === "secret") return pickSecret();
      if (v === "clear") { const ok = await sheet("清空后泡泡和粉丝回复都没了", [{ label: "清空", danger: true, value: 1 }]); if (ok) { room.items = []; saveRoom(room); render(); } }
      return;
    }
    const v = await sheet("", [
      { label: "他的泡泡头像", sub: "只在 bubble 里用，不设就用原来的", value: "ava" },
      { label: "他的艺名", sub: stageName(room), value: "name" },
      { label: room.known ? "他知道哪个号是你" : "他不知道哪个号是你", sub: "点一下切换", value: "known" },
      ...(room.known ? [] : [{ label: `他的疑心：${SUS[room.sus || 0]}${room.susLock ? "（锁定）" : ""}`, sub: "按你回的话慢慢起疑；点进去可以锁定", value: "sus" }]),
      { label: isPublic(room.charId) ? "你们已经公开了" : "你们没公开", sub: "点一下切换；没公开他只能暗戳戳", value: "public" },
      { label: "清空这个泡泡房", danger: true, value: "clear" },
      { label: "退订", danger: true, value: "unsub" },
    ]);
    if (v === "ava") { const d = await pickImage(320); if (d) { room.avatar = d; saveRoom(room); render(); } }
    else if (v === "name") { const n = await inputSheet("他的艺名", stageName(room)); if (n) { room.stage = n; saveRoom(room); render(); } }
    else if (v === "public") { const on = !isPublic(room.charId); S.meta.publicWith = on ? [...(S.meta.publicWith || []), room.charId] : (S.meta.publicWith || []).filter(x => x !== room.charId); saveMeta(); toast(on ? "公开了" : "改回没公开"); }
    else if (v === "sus") {
      const lv = await sheet("他的疑心", [{ label: "自动（按你回的话慢慢起疑）", value: "auto", on: !room.susLock }, ...SUS.map((x, i) => ({ label: `锁定：${x}`, value: String(i), on: room.susLock && (room.sus || 0) === i }))]);
      if (lv === "auto") { room.susLock = false; } else if (lv != null) { room.sus = +lv; room.susLock = true; }
      if (lv != null) { saveRoom(room); toast(room.susLock ? `锁在「${SUS[room.sus]}」` : "改回自动"); }
    }
    else if (v === "known") { room.known = !room.known; saveRoom(room); render(); toast(room.known ? "他知道哪个账号是你了" : "他不知道哪个是你"); }
    else if (v === "clear") { const ok = await sheet("清空后泡泡都没了", [{ label: "清空", danger: true, value: 1 }]); if (ok) { room.items = []; room.pending = []; saveRoom(room); render(); } }
    else if (v === "unsub") { const ok = await sheet(`退订 ${stageName(room)}？记录会一起删掉`, [{ label: "退订", danger: true, value: 1 }]); if (ok) { S.rooms = S.rooms.filter(r => r !== room); dbDelete(COL.rooms, room.id); S.view = { page: "home" }; render(); } }
  }

  async function pickSecret() {
    const v = await sheet("谁偷偷订阅了你的泡泡（选了的人会混在粉丝里回你）", S.chars.map(c => ({ label: c.name, value: c.id, on: S.meta.secret.includes(c.id) })));
    if (!v) return;
    S.meta.secret = S.meta.secret.includes(v) ? S.meta.secret.filter(x => x !== v) : [...S.meta.secret, v];
    saveMeta(); toast(S.meta.secret.includes(v) ? `${(charById(v) || {}).name} 偷偷订阅了你` : "取消了"); pickSecret();
  }

  function dressPanel() {
    const mask = document.createElement("div"); mask.className = "mask";
    const colors = ["#F7AFC0", "#FFC9D6", "#B9A8F0", "#9FD3C7"];
    const draw = () => {
      mask.innerHTML = `<div class="sheet dress"><div class="grab"></div><div class="sheet-t2">泡泡房装扮</div>
        <div class="themes">
          <button class="th ${S.meta.theme === "plain" ? "on" : ""}" data-th="plain"><div class="pv pv-plain"><i></i><i></i><i></i></div><b>简洁</b><small>默认</small></button>
          <button class="th ${S.meta.theme === "journal" ? "on" : ""}" data-th="journal"><div class="pv pv-journal"><i></i><i></i><i></i></div><b>粉色手账</b><small>${S.meta.theme === "journal" ? "使用中" : ""}</small></button>
          <button class="th ${S.meta.theme === "custom" ? "on" : ""}" data-th="custom"><div class="pv pv-custom" ${S.meta.bg ? `style="background-image:url('${S.meta.bg}')"` : ""}>${S.meta.bg ? "" : "＋"}</div><b>上传背景图</b><small>${S.meta.bg ? "点一下换一张" : "相册里选一张"}</small></button>
        </div>
        ${S.meta.theme === "custom" ? `<div class="drow">背景图透明度<input type="range" min="0.15" max="1" step="0.05" value="${S.meta.bgOpacity}" data-op></div>` : ""}
        <div class="drow">我的气泡颜色<span class="cols">${colors.map(c => `<button data-col="${c}" class="${S.meta.myColor === c ? "on" : ""}" style="background:${c}"></button>`).join("")}</span></div>
      </div>`;
    };
    draw();
    mask.onclick = async e => {
      if (e.target === mask) { mask.remove(); return; }
      const th = e.target.closest("[data-th]"); const col = e.target.closest("[data-col]");
      if (th) {
        if (th.dataset.th === "custom") { const d = await pickImage(1000); if (d) S.meta.bg = d; if (!S.meta.bg) return; }
        S.meta.theme = th.dataset.th; saveMeta(); draw(); render();
      } else if (col) { S.meta.myColor = col.dataset.col; saveMeta(); draw(); render(); }
    };
    mask.oninput = e => { if (e.target.matches("[data-op]")) { S.meta.bgOpacity = +e.target.value; saveMeta(); render(); } };
    document.body.appendChild(mask);
  }

  async function onAct(act, el) {
    const room = roomById(S.view.roomId);
    switch (act) {
      case "back": S.view = S.view.page === "post" ? { page: "plaza", board: S.view.board } : { page: "home" }; S.quote = null; return render();
      case "more": return room && roomMenu(room);
      case "sub": return subscribe();
      case "debug": return showDebug();
      case "myPhoto": return myPhoto(room);
      case "myStk": return myStickers(room);
      case "urgePhoto": await charBubbles(room, { wantPhoto: true }); S.forceBottom = true; return render();
      case "dress": return dressPanel();
      case "wave": await fanWave(); S.forceBottom = true; return render();
      case "urge": await charBubbles(room); S.forceBottom = true; return render();
      case "flush": {
        const sent = room.pending.map(p => p.text);
        const base = Date.now();
        room.pending.forEach((p, i) => room.items.push({ id: uid("m"), by: "me", text: p.text, at: new Date(base + i * 500).toISOString() }));
        const lastChar = [...room.items].reverse().find(i => i.by === "char");
        if (lastChar) { lastChar.fans = [...(lastChar.fans || []), ...sent.map(t => ({ t, me: true }))]; lastChar.fanN = (lastChar.fanN || 0) + sent.length; }
        room.pending = []; saveRoom(room); S.forceBottom = true; render();
        await charBubbles(room, { sent, direction: room.direction }); room.direction = ""; saveRoom(room); S.forceBottom = true; return render();
      }
      case "switch": {
        const rooms = S.rooms.filter(r => r.kind === "char" && r !== room && charById(r.charId));
        if (!rooms.length) return toast("只订阅了这一个");
        const id = await sheet("换个人", rooms.map(r => ({ label: stageName(r), value: r.id })));
        if (id) { S.view = { page: "room", roomId: id }; S.forceBottom = true; render(); }
        return;
      }
      case "direct": {
        const t = await inputSheet("场外指示", room.direction || "", { long: true, ph: "这次他发泡泡的情况，比如刚下练习、在外地拍摄", hint: "只用在下一次他发泡泡" });
        if (t != null) { room.direction = t; saveRoom(room); toast(t ? "下次他发泡泡会照这个来" : "清掉了"); }
        return;
      }
      case "handwrite": {
        const t = await inputSheet(`替 ${stageName(room)} 写一条泡泡`, "", { long: true, max: 300 });
        if (t) { room.items.push({ id: uid("b"), by: "char", text: t, at: nowIso() }); room.lastAt = nowIso(); saveRoom(room); S.forceBottom = true; render(); }
        return;
      }
      case "clear": { const inp = $(".composer .ta", app()); if (inp) inp.value = ""; if (room && room.kind === "char" && room.pending.length) { room.pending = []; saveRoom(room); render(); } return; }
      case "unquote": S.quote = null; return render();
      case "refreshPlaza": await refreshPlaza(S.view.board); return render();
      case "loadCm": { const b = boardOf(S.view.board); const p = b.posts.find(x => x.id === S.view.postId); if (p) await loadComments(S.view.board, p); return render(); }
      case "acct": { const v = await sheet("", [{ label: `${myStage()}（大号）`, sub: "所有人都知道是你，会炸", value: "main", on: S.view.acct !== "alt" }, { label: `${S.meta.alt}（小号）`, sub: "没人知道是你", value: "alt", on: S.view.acct === "alt" }]); if (v) { S.view.acct = v; render(); } return; }
      case "newPost": {
        const key = S.view.board;
        let by = "me";
        if (key !== "me") { const v = await sheet("用哪个号发", [{ label: `${myStage()}（大号）`, sub: "所有人都知道是你，会炸", value: "me" }, { label: `${S.meta.alt}（小号）`, sub: "没人知道是你", value: "meAlt" }]); if (!v) return; by = v; }
        const t = await inputSheet(`发帖 · ${boardName(key)}的广场`, "", { long: true, max: 300 });
        if (!t) return;
        const b = boardOf(key);
        const post = { id: uid("p"), by, name: by === "meAlt" ? S.meta.alt : myStage(), text: t, likes: by === "me" ? rand(20000, 90000) : rand(0, 30), cmtN: 0, comments: [], at: nowIso() };
        b.posts.unshift(post); savePlaza(b); herPostSaid(key, by, t, "发帖");
        S.view = { page: "post", board: key, postId: post.id, acct: by === "meAlt" ? "alt" : "main" }; render();
        await loadComments(key, post); return render();
      }
      case "myAva": { const d = await pickImage(320); if (d) { S.meta.me.avatar = d; saveMeta(); render(); } return; }
      case "myName": { const n = await inputSheet("我的艺名", myStage()); if (n) { S.meta.me.name = n; saveMeta(); render(); } return; }
      case "altName": { const n = await inputSheet("广场小号昵称", S.meta.alt); if (n) { S.meta.alt = n; saveMeta(); render(); } return; }
      case "secret": await pickSecret(); return render();
    }
  }

  function onSend(text) {
    const room = roomById(S.view.roomId); if (!room || !text) return;
    if (room.kind === "char") { room.pending.push({ text }); saveRoom(room); return render(); }
    const q = S.quote && S.quote.roomId === room.id ? S.quote : null;
    room.items.push({ id: uid("m"), by: "me", text, at: nowIso(), quote: q ? q.text : "" });
    room.lastAt = nowIso(); saveRoom(room);
    if (q && q.charId) remember(q.charId, `${herName()}在她的泡泡房（bubble，艺名「${myStage()}」）引用了你用粉丝小号回的那句「${q.text}」，回了「${text}」。所有粉丝都看得到这条，但不知道被引用的是你。`);
    S.quote = null; S.forceBottom = true; render();
  }

  async function onComment(text) {
    if (!text) return;
    const key = S.view.board; const b = boardOf(key); const p = b.posts.find(x => x.id === S.view.postId); if (!p) return;
    const by = key !== "me" && S.view.acct === "alt" ? "meAlt" : "me";
    p.comments.push({ id: uid("c"), by, name: by === "meAlt" ? S.meta.alt : myStage(), text, at: nowIso() });
    p.cmtN = (p.cmtN || 0) + 1; savePlaza(b); herPostSaid(key, by, text, "评论"); render();
    await loadComments(key, p); render();
  }

  async function showDebug() {
    const mask = document.createElement("div"); mask.className = "mask";
    mask.innerHTML = `<div class="sheet"><div class="grab"></div><div class="sheet-h">调试记录（最近 10 次）</div><div class="dbg">${S.debug.map(d => `<div><b>${esc(d.label)} ${d.ok ? "✓" : "✗"}</b> <small>${esc(d.at.slice(5, 16).replace("T", " "))}</small><pre>${esc(d.ok ? d.text : d.error)}</pre></div>`).join("") || "还没有"}</div></div>`;
    mask.onclick = e => { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }

  // 长按一条泡泡 / 回复：编辑、删除
  let press = null, pressFired = false;
  document.addEventListener("pointerdown", e => {
    const el = e.target.closest("[data-item]"); if (!el || e.target.closest(".mask") || e.target.closest("[data-gen]")) return;
    pressFired = false;
    const x = e.clientX, y = e.clientY;
    press = { x, y, t: setTimeout(() => { press = null; pressFired = true; const room = roomById(S.view.roomId); if (room) itemMenu(room, el.dataset.item); }, 550) };
  });
  document.addEventListener("pointermove", e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.t); press = null; } });
  ["pointerup", "pointercancel"].forEach(t => document.addEventListener(t, () => { if (press) { clearTimeout(press.t); press = null; } }));
  document.addEventListener("contextmenu", e => { if (e.target.closest("[data-item]")) e.preventDefault(); });
  document.addEventListener("click", e => { if (pressFired) { pressFired = false; e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-act]"); if (a && !a.disabled) { e.preventDefault(); onAct(a.dataset.act, a); return; }
    const tb = e.target.closest("[data-tab]"); if (tb) { S.view = { page: tb.dataset.tab, board: S.view.board }; render(); return; }
    const bd = e.target.closest("[data-board]"); if (bd) { S.view = { page: "plaza", board: bd.dataset.board }; render(); return; }
    const po = e.target.closest("[data-post]"); if (po) { S.view = { page: "post", board: S.view.board, postId: po.dataset.post }; render(); return; }
    const r = e.target.closest("[data-room]"); if (r) { S.view = { page: "room", roomId: r.dataset.room }; S.forceBottom = true; render(); return; }
    const gp = e.target.closest("[data-gen]"); if (gp) { genPhoto(roomById(S.view.roomId), gp.dataset.gen); return; }
    const pv = e.target.closest("[data-ph]"); if (pv) { photoSheet(roomById(S.view.roomId), pv.dataset.ph); return; }
    const f = e.target.closest("[data-fans]"); if (f) { openFans(roomById(S.view.roomId), f.dataset.fans); return; }
    const q = e.target.closest("[data-quote]");
    if (q) {
      const room = roomById(S.view.roomId); const it = room && room.items.find(i => i.id === q.dataset.quote); if (!it) return;
      sheet(it.text.slice(0, 40), [{ label: "引用这条回复", value: 1 }]).then(v => { if (v) { S.quote = { roomId: room.id, text: it.text, charId: it.by === "him" ? it.charId : null }; render(); const inp = $(".composer .ta", app()); inp && inp.focus(); } });
    }
  });
  document.addEventListener("submit", e => {
    if (!e.target.matches(".composer")) return; e.preventDefault();
    const inp = $(".ta", e.target); const t = inp.value.trim(); inp.value = "";
    if (S.view.page === "post") return onComment(t);
    onSend(t);
  });

  (async function boot() {
    app().innerHTML = `<div class="loading">bubble</div>`;
    await loadAll();
    render();
  })();
})();
