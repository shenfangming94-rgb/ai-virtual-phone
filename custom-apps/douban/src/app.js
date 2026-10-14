/* 豆瓣 · 小手机自定义 APP（第一期：小组。书影音、广播、日记、豆邮、同城后面几期） */
(function () {
  "use strict";
  const api = window.AiPhone || window.AiPhoneApp;
  const VERSION = "/*__VERSION__*/";

  // ───────────────────────── 工具 ─────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let uidN = 0; // 同一毫秒里也不会撞号
  const uid = p => `${p}_${Date.now().toString(36)}${(uidN++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const nowIso = () => new Date().toISOString();
  const clampInt = (v, d = 0) => { const s = String(v || ""); const n = parseFloat(s.replace(/[^\d.]/g, "")); if (!Number.isFinite(n)) return d; return Math.round(/万/.test(s) ? n * 1e4 : n); };
  const none = v => !v || /^(无|没有|none|null|-|—)$/i.test(String(v).trim());
  const yes = v => /^(是|有|true|yes)/i.test(String(v || "").trim());
  const pickCast = (list, n) => shuffle(list).slice(0, n);

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, "") + "亿";
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "万";
    return String(n);
  }
  function fmtTime(iso) {
    const t = new Date(iso); const now = new Date(); if (isNaN(t)) return "";
    const diff = (now - t) / 1000; const pad = x => String(x).padStart(2, "0"); const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (t.toDateString() === now.toDateString()) return `今天 ${hm}`;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (t.toDateString() === y.toDateString()) return `昨天 ${hm}`;
    if (t.getFullYear() === now.getFullYear()) return `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${hm}`;
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }
  /** 「3小时前」「昨天 21:30」「2天前」→ 时间戳 */
  function parseRelTime(s, fallbackMin = 60) {
    s = String(s || "").trim(); const now = Date.now(); let m;
    if (!s || /刚刚/.test(s)) return new Date(now - rand(10, 50) * 1000).toISOString();
    if ((m = s.match(/(\d+)\s*分钟/))) return new Date(now - m[1] * 60000).toISOString();
    if ((m = s.match(/(\d+)\s*(个)?小时/))) return new Date(now - m[1] * 3600000 - rand(0, 600) * 1000).toISOString();
    if ((m = s.match(/(\d+)\s*天/))) return new Date(now - m[1] * 86400000 - rand(0, 36000) * 1000).toISOString();
    if ((m = s.match(/昨天\s*(\d{1,2}):(\d{2})/))) { const d = new Date(now - 86400000); d.setHours(+m[1], +m[2], 0, 0); return d.toISOString(); }
    if ((m = s.match(/(\d{1,2}):(\d{2})/))) { const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); if (d > now) d.setDate(d.getDate() - 1); return d.toISOString(); }
    return new Date(now - rand(5, fallbackMin) * 60000).toISOString();
  }
  function hashHue(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h % 360; }
  const gradientFor = s => { const h = hashHue(s); return `linear-gradient(135deg, hsl(${h},55%,62%), hsl(${(h + 40) % 360},55%,52%))`; };

  const I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M7.5 10.5v9.5H4.5v-9.5zM7.5 10.5 11 3.5c1.6 0 2.5 1 2.3 2.6l-.5 3.4h5.6c1.3 0 2.2 1.2 1.9 2.4l-1.6 6.3c-.2.9-1 1.5-1.9 1.5H7.5"/></svg>',
    liked: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.8 10.3h3.6v10.2H3.8zM8.6 10.2 11.9 3c1.9 0 3 1.3 2.7 3.1l-.4 3h5c1.5 0 2.6 1.4 2.2 2.8l-1.7 6.6c-.3 1.1-1.2 1.9-2.4 1.9H8.6z"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 5.5h16v11H9l-5 3.5z"/></svg>',
    bubble: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-7.2L7 20.5v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 6.5h16M4 12h16M4 17.5h16"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4 8h3.2l1.6-2.5h6.4L16.8 8H20v11H4z"/><circle cx="12" cy="13.3" r="3.3"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5l1.2-4.6L15.9 4.7a1.8 1.8 0 0 1 2.6 0l.8.8a1.8 1.8 0 0 1 0 2.6L9.1 18.3z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10.5v6M14 10.5v6"/></svg>',
    repost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3.5 20.5 7 17 10.5"/><path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7h14M7 20.5 3.5 17 7 13.5"/><path d="M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5h-14"/></svg>',
    fav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>',
    favOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>',
    // 底栏（线条，选中时填色）
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/></svg>',
    homeOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4.5 5.5c2.5-1 5-1 7.5.5v13c-2.5-1.5-5-1.5-7.5-.5zM19.5 5.5c-2.5-1-5-1-7.5.5v13c2.5-1.5 5-1.5 7.5-.5z"/></svg>',
    bookOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5.2c2.6-1.1 5.3-1.1 7.5.3v13.9c-2.4-1.4-4.9-1.5-7.5-.5zM20 5.2c-2.6-1.1-5.3-1.1-7.5.3v13.9c2.4-1.4 4.9-1.5 7.5-.5z"/></svg>',
    group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle cx="9" cy="9" r="3.3"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.4c1.8.6 3 2.1 3.5 4.6"/></svg>',
    groupOn: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="9" r="3.6"/><path d="M2.8 19.5c.5-3.6 3-5.8 6.2-5.8s5.7 2.2 6.2 5.8z"/><path d="M15.3 5.6a3.6 3.6 0 0 1 0 6.8zM17.4 13.8c2 .7 3.3 2.6 3.8 5.7h-4.5c-.2-2.3-.9-4.2-2.3-5.6z"/></svg>',
    market: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
    marketOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.6 7.4h14.8L18.1 20.6H5.9z"/><path d="M9 7.4V6.5a3 3 0 0 1 6 0v.9h-1.6v-.9a1.4 1.4 0 0 0-2.8 0v.9z"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-4 3.8-6 7.5-6s6.6 2 7.5 6"/></svg>',
    meOn: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8.5" r="4"/><path d="M4.2 20.3c.9-4.3 3.9-6.6 7.8-6.6s6.9 2.3 7.8 6.6z"/></svg>',
    // 「我的」宫格
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4"/></svg>',
    diary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h3.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r=".8" fill="currentColor"/><circle cx="5" cy="12" r=".8" fill="currentColor"/><circle cx="5" cy="17" r=".8" fill="currentColor"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V11M10 20V5M15 20v-7M20 20V8"/></svg>',
    posts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4.5 5.5h15v10H10l-4 3.5v-3.5H4.5z"/></svg>',
    debug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 7 3.5 12 8 17M16 7l4.5 5L16 17M13.5 5l-3 14"/></svg>',
  };
  const G_COLORS = ["#42bd56", "#3ba1d8", "#f4a137", "#e86a8f", "#8a6be0", "#4cb5a8", "#e3664f", "#5b8ad9"];
  const groupColor = g => G_COLORS[hashHue(g.name) % G_COLORS.length];
  const groupAva = (g, size) => `<div class="g-ava ${size || ""}" style="background:${groupColor(g)}">${esc((g.name || "?").replace(/^[^\p{L}\p{N}]+/u, "").slice(0, 1) || "组")}</div>`;

  // ───────────────────────── 数据 ─────────────────────────
  // groups：小组（搜出来的、建的）；topics：帖子（楼层在帖子里）；meta：我的资料、搜索缓存、调试记录
  const COL = { groups: "groups", topics: "topics", meta: "meta" };
  const S = { identity: null, chars: [], meta: null, groups: [], topics: [], tab: "group", debug: [], jobs: new Set(), mediaCache: new Map() };
  async function dbList(c) { try { return (await api.db.list(c, { limit: 500 })) || []; } catch (e) { console.warn(e); return []; } }
  async function dbUpsert(c, row) {
    try { const u = await api.db.update(c, row.id, row); if (u) return u; } catch (e) { /* 没有就 create */ }
    const created = await api.db.create(c, row);
    if (row.createdAt && created && created.createdAt !== row.createdAt) { try { await api.db.update(c, row.id, { createdAt: row.createdAt }); } catch (e) { console.warn(e); } }
    return created;
  }
  async function dbDelete(c, id) { try { await api.db.delete(c, id); } catch (e) { console.warn(e); } }
  let metaTimer = null;
  function saveMeta() { clearTimeout(metaTimer); metaTimer = setTimeout(() => dbUpsert(COL.meta, S.meta).catch(e => console.warn(e)), 250); }
  const saveGroup = g => dbUpsert(COL.groups, g).catch(e => console.warn(e));
  const saveTopic = t => dbUpsert(COL.topics, t).catch(e => console.warn(e));

  async function loadAll() {
    const identity = await api.user.getProfile({}).catch(() => null);
    S.identity = identity || { id: "default", name: "我" };
    const chars = await api.characters.list().catch(() => []);
    const owners = await Promise.all(chars.map(c => api.user.getProfile({ characterId: c.id }).catch(() => null)));
    S.chars = chars.filter((c, i) => !owners[i] || !identity || owners[i].id === identity.id);
    const [groups, topics, metas] = await Promise.all([dbList(COL.groups), dbList(COL.topics), dbList(COL.meta)]);
    const scope = S.identity.id;
    S.groups = groups.filter(g => g.scope === scope);
    S.topics = topics.filter(t => t.scope === scope).map(t => ({ ...t, floors: t.floors || [] }));
    S.debug = (metas.find(m => m.id === "debug_log") || {}).entries || [];
    S.meta = metas.find(m => m.id === `meta_${scope}`) || { id: `meta_${scope}`, nickname: S.identity.name || "豆友", sign: "", avatarRef: null,
      joined: [], searches: {}, charNicks: {}, excludedChars: [], avatarPool: [] };
    for (const k of ["joined", "excludedChars", "avatarPool"]) if (!Array.isArray(S.meta[k])) S.meta[k] = [];
    for (const k of ["searches", "charNicks"]) if (!S.meta[k] || typeof S.meta[k] !== "object") S.meta[k] = {};
  }

  // ───────────────────────── 人 ─────────────────────────
  const activeChars = () => S.chars.filter(c => !(S.meta.excludedChars || []).includes(c.id));
  const charById = id => S.chars.find(c => c.id === id);
  const charByName = n => { n = String(n || "").trim(); return n ? S.chars.find(c => c.name === n || S.meta.charNicks[c.id] === n) : null; };
  const charNick = id => S.meta.charNicks[id] || (charById(id) || {}).name || "豆友";
  const herName = () => S.identity.name || S.meta.nickname;
  const isUserName = n => !!n && [S.meta.nickname, S.identity.name].filter(Boolean).includes(String(n).trim());
  /**
   * 帖子和楼层的作者：{ type: "npc" | "char" | "user", name, charId, anon }
   * 匿名的一律显示成「匿名豆友」+ 按身份固定的随机头像；char 的马甲只有她看得到（小标记）
   */
  function whoOf(a) {
    if (a.anon) { const seed = `anon_${a.type}_${a.charId || a.name || ""}`; const pool = S.meta.avatarPool || [];
      return { name: "匿名豆友", seed, avatarRef: pool.length ? pool[hashHue(seed) % pool.length] : null, avatar: null }; }
    if (a.type === "user") return { name: S.meta.nickname, seed: "me", avatarRef: S.meta.avatarRef, avatar: S.meta.avatarRef ? null : S.identity.avatarUrl };
    if (a.type === "char") { const c = charById(a.charId) || {}; return { name: charNick(a.charId), seed: a.charId, avatar: c.avatar }; }
    const pool = S.meta.avatarPool || [];
    return { name: a.name, seed: a.name, avatarRef: pool.length ? pool[hashHue(a.name) % pool.length] : null };
  }
  function avatarHtml(w) {
    const face = w.avatarRef ? `<img class="face" data-ref="${esc(w.avatarRef)}" alt="" style="background:${gradientFor(w.seed)}">`
      : w.avatar ? `<img class="face" src="${esc(w.avatar)}" alt="">`
      : `<div class="face" style="background:${gradientFor(w.seed)}">${esc((w.name || "?").slice(0, 1))}</div>`;
    return `<div class="avatar">${face}</div>`;
  }
  async function mediaUrl(ref) {
    if (!ref) return ""; if (S.mediaCache.has(ref)) return S.mediaCache.get(ref);
    try { const r = await api.media.get({ ref }); S.mediaCache.set(ref, r.dataUrl); return r.dataUrl; } catch (e) { return ""; }
  }
  function hydrateImages(root) {
    root.querySelectorAll("img[data-ref]").forEach(async img => { const url = await mediaUrl(img.dataset.ref); if (url) img.src = url; img.removeAttribute("data-ref"); });
  }
  async function pickImages(max, size) {
    const r = await api.media.pick({ accept: "image/*", multiple: max > 1, limit: max });
    const files = (r && (r.files || (r.file ? [r.file] : []))) || []; const refs = [];
    for (const f of files.slice(0, max)) {
      const dataUrl = await new Promise(res => { const img = new Image(); img.onload = () => { const k = Math.min(1, size / Math.max(img.width, img.height)); const cv = document.createElement("canvas"); cv.width = img.width * k; cv.height = img.height * k; cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL("image/jpeg", .86)); }; img.onerror = () => res(f.dataUrl); img.src = f.dataUrl; });
      const stored = await api.media.put({ dataUrl }); S.mediaCache.set(stored.ref, dataUrl); refs.push(stored.ref);
    }
    return refs;
  }
  /** 写进 char 的记忆（豆瓣里他做过、看到的事） */
  function remember(charId, summary, eventId) {
    if (!charId || !api.memory || !api.memory.addTimeline) return;
    api.memory.addTimeline({ characterId: charId, appLabel: "豆瓣", detail: "douban", summary, appEventId: eventId }).catch(e => console.warn(e));
  }

  function forget(events) {
    if (!api.memory || !api.memory.deleteTimeline) return;
    for (const e of events) api.memory.deleteTimeline({ characterId: e.charId, appEventId: e.eventId }).catch(() => {});
  }
  /** 一条帖子写过的全部记忆：char 发的帖子、char 回的楼 */
  function memEventsOfTopic(t) {
    const ev = [];
    if (t.author.type === "char") ev.push({ charId: t.author.charId, eventId: `douban_topic_${t.id}` });
    for (const f of t.floors || []) if (f.author.type === "char") ev.push({ charId: f.author.charId, eventId: `douban_floor_${t.id}_${f.n}` });
    return ev;
  }
  async function deleteTopic(t) {
    forget(memEventsOfTopic(t));
    S.topics = S.topics.filter(x => x !== t); await dbDelete(COL.topics, t.id);
  }
  // ───────────────────────── 提示 ─────────────────────────
  function toast(msg) { const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 1800); }
  function sheet(title, items) {
    return new Promise(resolve => {
      const mask = document.createElement("div"); mask.className = "sheet-mask";
      mask.innerHTML = `<div class="sheet">${title ? `<div class="sheet-title">${esc(title)}</div>` : ""}${items.map((it, i) => `<button class="sheet-item ${it.danger ? "danger" : ""}" data-i="${i}">${esc(it.label)}</button>`).join("")}<div class="sheet-gap"></div><button class="sheet-item" data-i="-1">取消</button></div>`;
      mask.onclick = e => { const b = e.target.closest("[data-i]"); if (!b && e.target !== mask) return; mask.remove(); resolve(b ? (items[+b.dataset.i] || {}).value ?? null : null); };
      document.body.appendChild(mask);
    });
  }
  function inputSheet(title, { placeholder = "", value = "", maxlength = 30, ok = "确定", area = false } = {}) {
    return new Promise(resolve => {
      const mask = document.createElement("div"); mask.className = "sheet-mask";
      mask.innerHTML = `<form class="sheet input-sheet" action="#">${title ? `<div class="sheet-title">${esc(title)}</div>` : ""}<div class="input-sheet-row">${area ? `<textarea class="search-input" rows="4" style="height:auto;padding:10px;line-height:1.5" maxlength="${maxlength}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="search-input" maxlength="${maxlength}" placeholder="${esc(placeholder)}" value="${esc(value)}">`}</div><button class="sheet-item ok" type="submit">${esc(ok)}</button><div class="sheet-gap"></div><button class="sheet-item" type="button" data-cancel>取消</button></form>`;
      const input = $("input, textarea", mask); const done = v => { mask.remove(); resolve(v); };
      $("form", mask).onsubmit = e => { e.preventDefault(); done(input.value.trim()); };
      mask.onclick = e => { if (e.target === mask || e.target.closest("[data-cancel]")) done(null); };
      document.body.appendChild(mask); setTimeout(() => input.focus(), 50);
    });
  }

  // ───────────────────────── AI ─────────────────────────
  /** 豆瓣小组的写法（随请求发送，不依赖预设）。参考了小手机「捡手机文学」论坛体的手感，但她能参与 */
  const DOUBAN_RULE = `【豆瓣小组】这是仿真的豆瓣 App 小组。写法手感（是参考，不是公式，好看比合规更重要）：
- 豆瓣是文艺青年和吃瓜群众的地盘：比微博安静、比小红书话多。帖子标题像真人随手起的（求助、吐槽、分享、讨论、碎碎念、「有没有人和我一样……」），正文口语，长短不一。
- 回应的是一群各有性格的豆友：蹲后续的、接梗玩梗的、一针见血锐评的、认真分析给建议的、跑题的、站队吵起来的。每层都像真人随手打的字，短句为主，不写小作文。常见的豆瓣味：dd、mark、蹲、码住、沙发、楼主好人、哈哈哈哈哈哈、这个组真的笑死、楼主更新了吗。
- 楼层之间要有来往：引用楼上、楼主下场回复、豆友互相接梗，笑点靠一来一回打出来。
- 赞数是隐形叙事：最好笑或最扎心的那层赞最高。
- 楼主是不可靠叙述者时（嘴上一套，心里一套），让楼下豆友替读者把真实心思扒出来。
- 一次不要把事讲完，留点让人想蹲后续的地方。
- 豆友的昵称像真豆瓣：有中文有英文有颜文字、有的很文艺有的很随便（「一只不想上班的猫」「Lemon」「已注销的豆友」「今天也要早睡」），同一个帖子里不要撞名。
- 用户本人绝不能出现在你写的内容里，除非下面明确写了她发的楼；不能替用户说话，也不能编造她做过的事。`;
  const WHO_LINE = () => `用户的豆瓣昵称是「${S.meta.nickname}」，真名「${herName()}」：你写的豆友不能用这两个名字。${activeChars().length ? `认识的角色（他们的豆瓣昵称）：${activeChars().map(c => `${c.name}「${charNick(c.id)}」`).join("、")}，豆友不能撞这些名字。` : ""}`;

  /** 借来的角色资料只是世界背景（宿主规定调用必须带一个角色）：没轮到出场的人不许出现，也不许被提起 */
  const bgLine = appear => `【这次谁出场】${appear.length ? `只有 ${appear.map(c => c.name).join("、")} 可以出场（按下面说的方式）。` : "这次没有任何角色出场。"}你拿到的角色人设、世界书、记忆只是这个世界的背景：其他角色本人不出现，豆友也不认识他们，不要提他们的名字、外号、身份（比如「X姐」「班长」），也不要编和他们有关的人和事。豆友都是普通路人，聊的是自己的事。`;
  function logAi(entry) {
    S.debug = [{ at: nowIso(), ...entry, text: String(entry.text || "").slice(0, 6000) }, ...S.debug].slice(0, 10);
    dbUpsert(COL.meta, { id: "debug_log", entries: S.debug }).catch(() => {});
  }
  async function generate(charIds, scene, instruction, label) {
    if (!charIds.length) { toast("没有参与的角色：先去微信加个好友，或者在设置里打开"); return null; }
    const job = uid("job"); S.jobs.add(job); refreshAll();
    try {
      const payload = { appTags: ["nox_douban", scene], instruction: [DOUBAN_RULE, WHO_LINE(), instruction, "【输出要求】只输出本轮说明要求的块，字段名照抄，不要解释、不要旁白、不要 markdown。"].join("\n\n") };
      const r = await api.ai.generate(charIds.length === 1 ? { ...payload, characterId: charIds[0] } : { ...payload, characterIds: charIds });
      const text = (r && r.text) || ""; logAi({ label, ok: true, text }); return text;
    } catch (e) {
      console.error(e); logAi({ label, ok: false, error: String((e && e.message) || e) }); toast(`${label}失败：${(e && e.message) || e}`.slice(0, 60)); return null;
    } finally { S.jobs.delete(job); refreshAll(); }
  }
  /** ===块=== 解析：字段「名：值」，值可以多行（接到上一个字段） */
  const KEYS = ["IP", "组长", "成员称呼", "分区", "发言规则", "配图", "精华", "名称", "成员", "简介", "标题", "作者", "角色", "匿名", "时间", "回应数", "正文", "楼主", "赞", "引用", "内容", "层"];
  function parseBlocks(raw, kind) {
    const text = String(raw || "").replace(/```[a-z]*\n?/g, "").replace(/\r/g, "");
    const out = []; let label = null;
    for (const seg of text.split(/(===[^=\n]+===)/)) {
      const mk = seg.match(/^===(.+)===$/); if (mk) { label = mk[1].trim(); continue; }
      if (label !== kind) continue;
      let f = {}, cur = null;
      for (const line of seg.split("\n")) {
        const m = line.match(new RegExp(`^\\s*(?:[-*]\\s*)?(${KEYS.join("|")})\\s*[：:]\\s*(.*)$`));
        if (m) { cur = m[1]; f[cur] = m[2].trim(); } else if (cur) f[cur] = (f[cur] ? f[cur] + "\n" : "") + line;
      }
      for (const k in f) f[k] = String(f[k]).replace(/\n+$/, "").trim();
      if (Object.keys(f).length) out.push(f);
    }
    return out;
  }
  /** AI 写的作者 → 作者对象（角色本名/豆瓣昵称认得出来；匿名的 char 记下是谁） */
  function authorFrom(b) {
    const anon = yes(b["匿名"]) || /^匿名/.test(String(b["作者"] || ""));
    const ch = charByName(b["角色"]) || (!anon ? charByName(b["作者"]) : null);
    if (ch) {
      const nick = String(b["作者"] || "").trim();
      if (!anon && nick && nick !== ch.name && !S.meta.charNicks[ch.id] && !isUserName(nick)) { S.meta.charNicks[ch.id] = nick.slice(0, 20); saveMeta(); }
      return { type: "char", charId: ch.id, anon };
    }
    if (anon) return { type: "npc", name: `anon_${uid("a")}`, anon: true };
    const name = String(b["作者"] || "").replace(/^@/, "").trim().slice(0, 24) || "豆友";
    return { type: "npc", name: isUserName(name) ? `${name}_${rand(10, 99)}` : name };
  }
  const sameAuthor = (a, b) => a && b && a.type === b.type && (a.type === "user" ? !!a.anon === !!b.anon : a.type === "char" ? a.charId === b.charId && !!a.anon === !!b.anon : a.name === b.name);

  // ───────────────────────── 小组 ─────────────────────────
  const groupById = id => S.groups.find(g => g.id === id);
  const isJoined = g => g.mine || (S.meta.joined || []).includes(g.id);
  const myGroups = () => S.groups.filter(isJoined);
  /** 搜小组：本地有的先列，没搜过的词让 AI 一口气写 5～8 个风格各异的组（只写名字简介，点进去才生成帖子） */
  async function searchGroups(term, again) {
    term = term.trim(); if (!term) return [];
    const cached = S.meta.searches[term];
    if (cached && !again) return cached.map(groupById).filter(Boolean);
    const have = S.groups.filter(g => g.name.includes(term)).map(g => g.name);
    const text = await generate(pickCast(activeChars(), 2).map(c => c.id), "groupsearch", [
      `用户在豆瓣搜索小组：「${term}」。写 ${rand(5, 8)} 个搜得出来的小组。`,
      "名字要五花八门、像真豆瓣：有大组也有小众组，有正经讨论组也有玩梗组、吐槽组、互助组；名字不用都带搜索词，但都和它有关（比如搜「足球」可以有「皇马死忠团」「凌晨三点看球的人」「我们这些踢野球的」）。如果搜的词是世界书或剧情里的地名、学校、圈子，就按剧情写那里的组。",
      have.length ? `这些已经有了，不要重复：${have.join("、")}` : "",
      "名字和简介要像真豆瓣：大多数组名简单直白，简介很短很平实（一句话介绍，或者几条组规：禁广告、禁人身攻击、标题加 tag……），只有少数组有点个性。不要文艺抒情、不要排比、不要「这里只存放……」这种句子；也不要写网上烂大街的梗（比如食堂阿姨手抖、颠勺）。",
      bgLine([]),
      "每个小组：\n===小组===\n名称：小组名\n成员：成员数（纯数字，大组几十万，小众组几百几千）\n成员称呼：这个组对成员的叫法（豆瓣特色，像「小不知道」「组员」「豆友」「病友」，很多组就叫「成员」）\n组长：组长的豆瓣昵称\n简介：一句小组介绍\n发言规则：一两条组规（没有写 无）\n分区：3～4 个讨论分区的名字，用、分隔（像「求助」「吐槽」「分享」或者有组内梗的名字）\n===结束===",
    ].filter(Boolean).join("\n\n"), `搜小组「${term}」`);
    if (text == null) return cached ? cached.map(groupById).filter(Boolean) : [];
    const made = [];
    for (const b of parseBlocks(text, "小组")) {
      const name = String(b["名称"] || "").trim().slice(0, 30); if (!name || S.groups.some(g => g.name === name)) continue;
      const g = { id: uid("g"), scope: S.identity.id, name, members: clampInt(b["成员"], rand(800, 90000)), intro: b["简介"] || "", topicsHint: "", mine: false, admin: false, createdAt: nowIso(), from: term };
      fillGroupInfo(g, b);
      S.groups.push(g); saveGroup(g); made.push(g);
    }
    const local = S.groups.filter(g => g.name.includes(term) && !made.includes(g));
    S.meta.searches[term] = [...made, ...local].map(g => g.id); saveMeta();
    return [...made, ...local];
  }
  /** AI 写的组长、成员称呼、发言规则、分区 → 存到小组上（已经有的不覆盖） */
  function fillGroupInfo(g, b) {
    const nick = String(b["组长"] || "").replace(/^@/, "").trim();
    if (!g.leader && nick && !none(nick) && !isUserName(nick)) g.leader = nick.slice(0, 20);
    if (!g.memberNoun && !none(b["成员称呼"])) g.memberNoun = String(b["成员称呼"]).trim().slice(0, 8);
    if (!g.rules && !none(b["发言规则"])) g.rules = String(b["发言规则"]).trim().slice(0, 200);
    if (!(g.sections || []).length && !none(b["分区"])) g.sections = String(b["分区"]).split(/[、,，/｜|]+/).map(x => x.trim()).filter(Boolean).slice(0, 5);
  }
  /**
   * 进组 / 刷新：写一批新帖子（标题、楼主、首帖正文、回应数），点进帖子才写楼层。
   * 代码掷骰子决定这批里有没有 char 出场：约 30% 有一个，出场时 60% 匿名（马甲，只有她看得到标记）
   */
  async function genTopics(g) {
    if (g._busy) return; g._busy = true; refreshAll();
    const cast = pickCast(activeChars(), 3);
    const hit = cast.length && Math.random() < 0.3 ? cast[0] : null;
    const anon = hit && Math.random() < 0.6;
    const needInfo = !g.memberNoun || !(g.sections || []).length || (!g.leader && !(g.mine && g.admin));
    const recent = S.topics.filter(t => t.groupId === g.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10).map(t => `- ${t.title}`).join("\n");
    const text = await generate((hit ? [hit] : cast.slice(0, 2)).map(c => c.id), "topics", [
      `当前时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      `小组：「${g.name}」（${fmtNum(g.members)} 个成员）\n小组介绍：${g.intro || "无"}${g.topicsHint ? `\n组里讨论：${g.topicsHint}` : ""}`,
      `写这个组里最近的 ${rand(5, 7)} 个帖子，大部分是路人豆友发的，话题贴着小组主题，五花八门。`,
      hit ? (anon
        ? `其中 1 个帖子是 ${hit.name} 本人用匿名发的（作者写 匿名，角色写 ${hit.name}，匿名写 是）：按他的人设、近况和心事写，可以是关于用户的事（不点名）。他可以是不可靠叙述者，嘴上一套心里一套。`
        : `其中 1 个帖子是 ${hit.name} 本人用自己的豆瓣号发的（作者写他的豆瓣昵称${S.meta.charNicks[hit.id] ? `「${S.meta.charNicks[hit.id]}」` : "，自己起一个像豆瓣的"}，角色写 ${hit.name}，匿名写 否）：按他的人设写。`)
        : "这批帖子全是路人发的，角色都不出现。",
      recent ? `组里已经有这些帖子，不要重复：\n${recent}` : "",
      bgLine(hit ? [hit] : []),
      (g.sections || []).length ? `组里的分区：${g.sections.join("、")}。每个帖子归到一个分区（闲聊的可以不归，写 无）。` : "",
      "大约四分之一的帖子带图（晒东西、现场、截图这类才带），写在「配图」里；最多 1 个帖子是组长加精的（内容特别好、特别有用的才加，没有就都写 否）。",
      needInfo ? `先补全这个小组的信息（只写一次）：\n===小组信息===\n组长：组长的豆瓣昵称${g.mine && g.admin ? "（组长是用户本人，这行写 无）" : ""}\n成员称呼：这个组对成员的叫法（像「小不知道」「组员」「病友」，很多组就叫「成员」）\n发言规则：一两条组规（没有写 无）\n分区：3～4 个讨论分区的名字，用、分隔\n===结束===` : "",
      "每个帖子：\n===帖子===\n标题：帖子标题（不用自己加分区前缀）\n作者：豆友昵称（匿名发的写 匿名）\n角色：角色本名（路人写 无）\n匿名：是 / 否\n分区：分区名（没有写 无）\n时间：发帖时间（如 3小时前、昨天 21:30、2天前）\nIP：这个人的 IP 属地（省份或城市，按他在哪写；同校同城的组大多一样）\n回应数：目前有多少条回应（纯数字）\n配图：图片描述，多张用 | 分隔（不带图写 无）\n精华：是 / 否\n正文：\n楼主的首帖正文\n===结束===",
    ].filter(Boolean).join("\n\n"), `「${g.name}」的帖子`);
    g._busy = false;
    if (text == null) { refreshAll(); return; }
    const info = parseBlocks(text, "小组信息")[0]; if (info) fillGroupInfo(g, info);
    let n = 0, elite = 0;
    for (const b of parseBlocks(text, "帖子")) {
      const title = String(b["标题"] || "").trim().slice(0, 60); const body = String(b["正文"] || "").trim();
      if (!title || !body) continue;
      const author = authorFrom(b);
      if (author.type === "char" && (!hit || author.charId !== hit.id)) continue; // 只让掷中的那个出场
      const createdAt = parseRelTime(b["时间"], 600);
      const sec = String(b["分区"] || "").trim(); const replyCount = clampInt(b["回应数"], rand(3, 80));
      const isElite = yes(b["精华"]) && elite < 1; if (isElite) elite++;
      const t = { id: uid("t"), scope: S.identity.id, groupId: g.id, title: title.replace(/^[^|｜]{1,8}\s*[|｜]\s*/, ""), author, body, createdAt, lastReplyAt: createdAt, replyCount, floors: [], liked: false,
        section: !none(sec) && (g.sections || []).includes(sec) ? sec : "", elite: isElite || undefined, ip: none(b["IP"]) ? "" : String(b["IP"]).trim().slice(0, 8),
        images: none(b["配图"]) ? [] : String(b["配图"]).split(/[|｜]/).map(x => x.trim()).filter(Boolean).slice(0, 4).map(desc => ({ desc })),
        likes: Math.round(replyCount * (0.2 + Math.random() * 0.8)), favs: Math.round(replyCount * Math.random() * 0.4), reposts: Math.round(replyCount * Math.random() * 0.15) };
      S.topics.push(t); saveTopic(t); n++;
      if (author.type === "char") remember(author.charId, `我在豆瓣小组「${g.name}」${author.anon ? "匿名" : ""}发了个帖子《${title}》：${body.slice(0, 80)}`, `douban_topic_${t.id}`);
    }
    g.refreshedAt = nowIso(); saveGroup(g);
    if (!n) toast("这次没写出能用的帖子，去「我的 → 调试记录」看看");
    refreshAll();
  }

  // ───────────────────────── 帖子：楼层 ─────────────────────────
  const topicById = id => S.topics.find(t => t.id === id);
  const opOf = t => t.author;
  const floorLine = (t, f) => `${f.n}楼 ${f.author.type === "user" ? (f.author.anon ? "匿名豆友（其实是用户本人，大家不知道）" : `${S.meta.nickname}（用户本人）`) : sameAuthor(f.author, t.author) ? `${whoOf(f.author).name}（楼主）` : f.author.type === "char" ? `${whoOf(f.author).name}（${f.author.anon ? `匿名，其实是角色 ${charById(f.author.charId)?.name}` : `角色 ${charById(f.author.charId)?.name}`}）` : whoOf(f.author).name}${f.quote ? ` 引用${f.quote}楼` : ""}：${f.text.slice(0, 120)}`;
  function opDesc(t) {
    const a = t.author;
    if (a.type === "user") return a.anon ? "楼主是用户本人用匿名发的：除了作者自己，谁都不知道是她。" : `楼主是用户本人（豆瓣昵称「${S.meta.nickname}」）：她的楼只能是下面已有的，不能替她写新的楼。`;
    if (a.type === "char") { const c = charById(a.charId); return a.anon ? `楼主是角色 ${c.name} 本人匿名发的：豆友们不知道是谁（可以随口猜，但永远不会坐实）。楼主下场回复时就是他本人在说话，按他的人设。` : `楼主是角色 ${c.name}（豆瓣昵称「${charNick(a.charId)}」）本人。`; }
    return `楼主是路人豆友「${a.name.startsWith("anon_") ? "匿名豆友" : a.name}」。`;
  }
  /** 写楼层：首次打开 / 加载更多 / 她回了一楼之后（mine = 她刚发的那楼） */
  async function genFloors(t, mine) {
    if (t._busy) return; t._busy = true; refreshAll();
    const g = groupById(t.groupId) || { name: "小组" };
    const next = (t.floors.length ? t.floors[t.floors.length - 1].n : 1) + 1;
    const charsInFloor = new Set(t.floors.filter(f => f.author.type === "char").map(f => f.author.charId));
    if (t.author.type === "char") charsInFloor.add(t.author.charId);
    // 她回的是 char 的楼 / char 的帖子：叫那个 char 来；否则偶尔有一个 char 路过（实名或匿名）
    const target = mine && mine.quote ? t.floors.find(f => f.n === mine.quote) : null;
    const askChar = target && target.author.type === "char" ? target.author.charId : mine && t.author.type === "char" ? t.author.charId : null;
    const passer = !askChar && !mine && Math.random() < 0.15 ? pickCast(activeChars().filter(c => !charsInFloor.has(c.id)), 1)[0] : null;
    const cast = [...new Set([...charsInFloor, askChar, passer && passer.id].filter(Boolean))].map(charById).filter(Boolean);
    const castIds = (cast.length ? cast : pickCast(activeChars(), 1)).map(c => c.id).slice(0, 3);
    const n = mine ? rand(2, 4) : t.floors.length ? rand(6, 10) : Math.min(Math.max(t.replyCount, 6), rand(10, 15));
    const history = t.floors.slice(-30).map(f => floorLine(t, f)).join("\n");
    const text = await generate(castIds, "floors", [
      `当前时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      `小组「${g.name}」里的帖子《${t.title}》（${fmtTime(t.createdAt)} 发的）`,
      opDesc(t),
      `楼主首帖（1楼）：\n${t.body}${(t.images || []).length ? `\n（配图：${t.images.map(im => im.desc || "一张照片").join(" | ")}）` : ""}`,
      history ? `已有的楼层：\n${history}` : "",
      mine ? `用户刚刚${mine.author.anon ? "匿名" : ""}回了 ${mine.n} 楼${mine.quote ? `（引用了 ${mine.quote} 楼）` : ""}：「${mine.text}」。接下来 ${n} 层里要有人回应她这层（引用 ${mine.n}），${askChar ? `${charById(askChar).name} 一定会回${mine.author.anon ? "（他不知道这是用户，当陌生豆友回）" : "（他知道这是用户）"}，按他的人设和你们的关系；` : ""}其他豆友可以接着聊。` : "",
      passer ? `${passer.name} 刷到了这个帖子，可能会顺手回一层（按人设决定实名还是匿名，不来也行）。` : "",
      bgLine(cast),
      `从 ${next} 楼开始，往下写 ${n} 层回应。${t.floors.length ? "接着已有的话题自然往下聊，楼主可以更新进展或下场回复。" : "楼主可以下场回复几层。"}`,
      `每层：\n===楼===\n层：楼层号\n作者：豆友昵称（楼主就写楼主${t.author.anon ? "；匿名的写 匿名" : ""}）\n角色：角色本名（路人写 无）\n匿名：是 / 否\n楼主：是 / 否\n引用：引用了第几楼（没引用写 无）\nIP：这个人的 IP 属地（省份或城市；楼主的和帖子一致）\n赞：点赞数（纯数字）\n内容：\n这层的内容\n===结束===`,
    ].filter(Boolean).join("\n\n"), `《${t.title.slice(0, 12)}》的回应`);
    t._busy = false;
    if (text == null) { refreshAll(); return; }
    let at = Math.max(new Date(t.lastReplyAt || t.createdAt).getTime(), new Date(t.createdAt).getTime());
    const span = Math.max(60e3, Date.now() - at);
    let made = 0, num = next;
    const aiMap = {}; const dropped = new Set(); // AI 写的楼层号 → 实际楼层号；被删掉的楼（不许出场的 char）
    for (const b of parseBlocks(text, "楼")) {
      const aiN = clampInt(b["层"], 0);
      const txt = String(b["内容"] || "").trim(); if (!txt) { if (aiN) dropped.add(aiN); continue; }
      const q0 = clampInt(b["引用"], 0);
      if (q0 && dropped.has(q0)) { if (aiN) dropped.add(aiN); continue; } // 在回被删掉的楼：一起删，不留对着空气说话的楼
      const claimsOp = yes(b["楼主"]) || String(b["作者"] || "").trim() === "楼主";
      if (claimsOp && t.author.type === "user") { if (aiN) dropped.add(aiN); continue; } // 她自己的帖子：楼主的楼只能她自己发，AI 不能替她说
      let author = claimsOp ? { ...t.author } : authorFrom(b);
      if (author.type === "user" || (author.type === "char" && !cast.some(c => c.id === author.charId))) { if (aiN) dropped.add(aiN); continue; }
      at = mine ? Date.now() - (n - made) * rand(20, 90) * 1000 : at + Math.random() * span / n;
      const fn = num++; if (aiN) aiMap[aiN] = fn;
      const q = q0 >= next ? aiMap[q0] || 0 : q0; // 本批的楼按实际楼层号换算；只能引用前面已有的楼，不能引用自己
      const fip = claimsOp ? t.ip : none(b["IP"]) ? "" : String(b["IP"]).trim().slice(0, 8);
      const f = { n: fn, author, ip: fip || undefined, text: txt, likes: clampInt(b["赞"], rand(0, 20)), quote: q > 0 && q < fn ? q : null, createdAt: new Date(Math.min(Date.now(), at)).toISOString() };
      t.floors.push(f); made++;
      if (author.type === "char" && mine && !mine.author.anon) remember(author.charId, `${herName()}在豆瓣小组「${g.name}」的帖子《${t.title}》里回复：「${mine.text.slice(0, 60)}」，我回：「${txt.slice(0, 60)}」`, `douban_floor_${t.id}_${f.n}`);
      else if (author.type === "char" && !sameAuthor(author, t.author)) remember(author.charId, `我在豆瓣小组「${g.name}」的帖子《${t.title}》里${author.anon ? "匿名" : ""}回了一层：「${txt.slice(0, 60)}」`, `douban_floor_${t.id}_${f.n}`);
    }
    if (made) { t.lastReplyAt = t.floors[t.floors.length - 1].createdAt; t.replyCount = Math.max(t.replyCount, t.floors.length); }
    else toast("这次没写出能用的回应，去「我的 → 调试记录」看看");
    saveTopic(t); refreshAll();
  }

  // ───────────────────────── 页面栈 ─────────────────────────
  const pages = [];
  function openPage(key, render, opts = {}) {
    const old = pages.find(p => p.key === key); if (old && pages[pages.length - 1] === old) { old.render(old); return old; }
    const el = document.createElement("section"); el.className = `page ${opts.cls || ""}`; el.dataset.key = key;
    el.innerHTML = `<header class="page-head"><div class="page-head-inner"><button class="back" data-act="back">${I.back}</button><div class="page-title">${opts.head || esc(opts.title || "")}</div>${opts.action || ""}</div></header><div class="page-body"></div>${opts.footer || ""}${opts.after || ""}`;
    document.body.appendChild(el);
    const page = { key, el, render, opts }; pages.push(page); render(page); return page;
  }
  function closePage() { const p = pages.pop(); if (!p) return; p.el.classList.add("closing"); setTimeout(() => p.el.remove(), 200); refreshAll(); }
  const topPage = () => pages[pages.length - 1];
  function refreshAll() { for (const p of pages) p.render(p); renderTab(); }
  function body(pg, html) { const b = $(".page-body", pg.el); const sc = b.scrollTop; b.innerHTML = html; b.scrollTop = sc; hydrateImages(b); }

  // ───────────────────────── 底栏 & 各个标签 ─────────────────────────
  const TABS = [["home", "首页", "home"], ["book", "书影音", "book"], ["group", "小组", "group"], ["market", "市集", "market"], ["me", "我的", "me"]];
  function renderTabbar() {
    $("#tabbar").innerHTML = TABS.map(([k, label, ic]) => `<button class="tab ${S.tab === k ? "active" : ""}" data-act="tab" data-tab="${k}">${S.tab === k ? I[ic + "On"] : I[ic]}<span>${label}</span></button>`).join("");
  }
  function renderTab() {
    if (!S.meta) return;
    renderTabbar();
    $("#topbar").className = `topbar ${S.tab === "me" ? "clear" : ""}`; $("#view").className = `view ${S.tab === "me" ? "under-top" : ""}`;
    ({ home: renderHome, book: renderBook, group: renderGroupTab, market: renderMarket, me: renderMe })[S.tab]();
    hydrateImages($("#view"));
  }
  const topSearch = (ph, act, right) => `<div class="topbar-inner"><button class="db-search" data-act="${act}">${I.search}<span>${esc(ph)}</span></button>${right === "trash"
    ? `<button class="top-icon" data-act="wipe-all" aria-label="清空豆瓣" style="margin-left:0">${I.trash}</button>`
    : `<button class="top-icon" data-act="coming" data-what="mail" aria-label="豆邮" style="margin-left:0">${I.mail}</button>`}</div>`;
  /** 还没做的：写清楚第几期上线 */
  const COMING = {
    feed: ["关注的人的动态（广播）", "第三期", "豆瓣式的动态：char 发广播、转发你的标记、给你点赞，比微博安静"],
    recommend: ["为你推荐", "第三期", "按你标记过的书影音推荐"],
    book: ["书影音标记", "第二期", "想看 / 在看 / 看过，打星写短评；用真实存在的作品"],
    charbook: ["char 的书影音", "第二期", "他看过什么、他的短评；「你们都看过」；他看到你的短评会回应"],
    diary: ["日记", "第三期", "char 写长日记，可以设成仅自己可见……然后被你看到"],
    doulist: ["豆列", "第二期", "把书影音收进自己的片单"],
    report: ["年度报告", "第二期", "你的书影音年度总结"],
    album: ["相册", "第三期", "你发过的图都收在这里"],
    mail: ["豆邮", "第四期", "豆瓣私信：char 和豆友找你聊，像微博私信那样"],
    event: ["同城活动", "第五期", "一起去看展、音乐节、话剧，可以约 char"],
    market: ["市集", "以后", "豆瓣好物，暂时不开"],
  };
  const comingHtml = keys => `<div class="coming-list">${keys.map(k => { const [t, p, d] = COMING[k]; return `<div class="coming-item"><span class="phase">${p}上线</span><b>${t}</b><p>${d}</p></div>`; }).join("")}</div>`;
  function openComing(k) { const [t, p, d] = COMING[k] || ["这个功能", "以后", ""]; openPage(`coming:${k}`, pg => body(pg, `<div class="empty"><div class="big">🌱</div><b>${esc(t)}</b>正在装修中，${esc(p)}上线<br><span style="font-size:13px">${esc(d)}</span></div>`), { title: t }); }

  /** 小组头像：她换过就用图，没换就是色块 + 首字 */
  function groupAvaHtml(g, cls) {
    return g.avatarRef ? `<img class="g-ava ${cls || ""} img" data-ref="${esc(g.avatarRef)}" alt="">` : groupAva(g, cls);
  }
  const heatColor = n => n >= 300 ? "#f05a4a" : n >= 100 ? "#f7884f" : n >= 30 ? "#f9a46a" : "#f6c66b";
  /**
   * 帖子行（照真豆瓣）：左边气泡 + 回应数；标题前有「精」和「分区 |」；下面一行在小组页里是作者，在小组讨论里是小组头像 + 组名；有图的话缩略图在右边
   * where = "group"（小组内页）/ "feed"（小组标签、首页）
   */
  function topicCard(t, where) {
    const g = groupById(t.groupId) || { name: "" }; const n = Math.max(t.replyCount, t.floors.length);
    const mask = t.author.type === "char" && t.author.anon ? `<span class="role-tag mask">${esc(charById(t.author.charId)?.name || "")}的马甲</span>` : t.author.type === "user" ? `<span class="role-tag mask">我</span>` : "";
    const meta = where === "group" ? (w => `${avatarHtml(w)}<span>${esc(w.name)}</span>${mask}`)(whoOf(t.author)) : `${groupAvaHtml(g, "xs")}<span>${esc(g.name)}</span>${mask}`;
    const img = (t.images || [])[0];
    return `<div class="trow" data-act="open-topic" data-id="${esc(t.id)}"><div class="trow-n"><i style="color:${heatColor(n)}">${I.bubble}</i><span>${fmtNum(n)}</span></div>
      <div class="trow-main"><div class="trow-title">${t.elite ? '<span class="elite">精</span>' : ""}${t.section ? `${esc(t.section)}<span class="sep">|</span>` : ""}${esc(t.title)}</div>
        <div class="trow-meta">${meta}<span class="upd">${fmtTime(t.lastReplyAt || t.createdAt)}更新</span></div></div>
      ${img ? `<div class="trow-pic">${img.ref ? `<img data-ref="${esc(img.ref)}" alt="">` : placeholderImg()}</div>` : ""}</div>`;
  }
  const DEFAULT_PLACEHOLDER = "/*__PLACEHOLDER__*/";
  const placeholderImg = () => `<img src="${DEFAULT_PLACEHOLDER}" alt="">`;
  const feedTopics = () => S.topics.filter(t => { const g = groupById(t.groupId); return g && isJoined(g); }).sort((a, b) => new Date(b.lastReplyAt || b.createdAt) - new Date(a.lastReplyAt || a.createdAt));

  function renderHome() {
    $("#topbar").innerHTML = topSearch("搜索书影音、小组", "open-search", "trash");
    const list = feedTopics().slice(0, 30);
    $("#view").innerHTML = `<div class="db-sec">动态</div>${comingHtml(["feed"])}
      <div class="db-sec">我的小组新帖<button data-act="tab" data-tab="group">全部 ›</button></div>
      ${list.length ? `<div class="db-white">${list.slice(0, 8).map(t => topicCard(t, "feed")).join("")}</div>` : `<div class="empty" style="padding:30px">还没有加入小组，去「小组」搜一个感兴趣的吧</div>`}`;
  }
  function renderBook() {
    $("#topbar").innerHTML = `<div class="topbar-inner"><span class="top-title">书影音</span></div>`;
    $("#view").innerHTML = `<div class="empty" style="padding:36px 30px 10px"><div class="big">🎬</div>书影音第二期上线</div>${comingHtml(["book", "charbook", "doulist", "report"])}`;
  }
  function renderMarket() {
    $("#topbar").innerHTML = `<div class="topbar-inner"><span class="top-title">市集</span></div>`;
    $("#view").innerHTML = `<div class="empty" style="padding:36px 30px 10px"><div class="big">🛍️</div>市集暂时不开</div>${comingHtml(["event"])}`;
  }
  function renderGroupTab() {
    $("#topbar").innerHTML = topSearch("搜索小组", "open-search");
    const mine = myGroups();
    const chip = S.groupChip && mine.some(g => g.id === S.groupChip) ? S.groupChip : "all";
    const list = feedTopics().filter(t => chip === "all" || t.groupId === chip);
    $("#view").innerHTML = `<div class="db-white">
      <div class="db-sec2">我的小组<button data-act="all-groups">全部 ›</button></div>
      <div class="gtiles">${mine.slice(0, 9).map(g => `<button data-act="open-group" data-id="${esc(g.id)}">${groupAvaHtml(g)}<span>${esc(g.name)}</span></button>`).join("")}
        <button data-act="create-group"><div class="g-ava add">${I.plus}</div><span>创建小组</span></button></div>
      <div class="db-sec2">正在讨论</div>
      <div class="chips"><button class="${chip === "all" ? "on" : ""}" data-act="g-chip" data-id="all">全部</button>${mine.map(g => `<button class="${chip === g.id ? "on" : ""}" data-act="g-chip" data-id="${esc(g.id)}">${esc(g.name)}</button>`).join("")}</div>
      ${list.length ? list.slice(0, 40).map(t => topicCard(t, "feed")).join("") : `<div class="empty" style="padding:30px">${mine.length ? "加入的小组还没有帖子，点进小组看看" : "还没有加入小组：上面搜一个，或者自己建一个"}</div>`}</div>`;
  }
  /** 「我」：背景图 + 居中头像 + 昵称签名；下面白色大卡片里一栏一栏的模块（书影音、日记、豆列可以左右划，我的小组） */
  function renderMe() {
    $("#topbar").innerHTML = `<div class="topbar-inner me-bar"><button class="top-icon" data-act="me-menu" aria-label="菜单" style="margin-left:0">${I.menu}</button></div>`;
    const w = whoOf({ type: "user" });
    const mine = myGroups();
    const myTopics = S.topics.filter(t => t.author.type === "user").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const slots = (k, n, label) => `<div class="hscroll">${Array.from({ length: n }, () => `<div class="slot" data-act="coming" data-what="${k}"><div class="slot-cover"></div><span>${label}</span></div>`).join("")}</div>`;
    $("#view").innerHTML = `<div class="me-hero" ${S.meta.coverRef ? `data-bg-ref="${esc(S.meta.coverRef)}"` : ""}>
        <div class="me-ava" data-act="me-avatar">${avatarHtml(w)}<i>${I.camera}</i></div>
        <h2>${esc(w.name)}</h2>
        <div class="me-id" data-act="edit-me">IP：${esc(S.meta.ip || "未填写（编辑资料里填）")}</div>
        <div class="me-sign" data-act="edit-me">${I.pen}${esc(S.meta.sign || "介绍下自己")}</div>
        <div class="me-follow"><span>关注 ${activeChars().length}</span><span>被关注 ${activeChars().length + (S.meta.fansExtra || 0)}</span></div>
      </div>
      <div class="me-sheet">
        <div class="me-tabs"><button class="on">主页</button><button data-act="coming" data-what="feed">动态</button><button data-act="coming" data-what="album">相册</button></div>
        <div class="mcard"><div class="mcard-h" data-act="coming" data-what="book">书影音<span class="soon">第二期</span><i>›</i></div>${slots("book", 6, "想看")}</div>
        <div class="mcard"><div class="mcard-h" data-act="all-groups">我的小组 ${mine.length}<i>›</i></div>
          ${mine.length ? `<div class="hscroll">${mine.map(g => `<button class="gtile" data-act="open-group" data-id="${esc(g.id)}">${groupAvaHtml(g)}<span>${esc(g.name)}</span></button>`).join("")}</div>` : `<div class="mcard-empty">还没有加入小组</div>`}</div>
        <div class="mcard"><div class="mcard-h" data-act="my-posts">我的帖子 ${myTopics.length}<i>›</i></div>
          ${myTopics.length ? myTopics.slice(0, 3).map(t => `<div class="mline" data-act="open-topic" data-id="${esc(t.id)}">${esc(t.title)}<span>${fmtTime(t.createdAt)}</span></div>`).join("") : `<div class="mcard-empty">还没发过帖子</div>`}</div>
        <div class="mcard"><div class="mcard-h" data-act="coming" data-what="diary">日记<span class="soon">第三期</span><i>›</i></div>${slots("diary", 4, "日记")}</div>
        <div class="mcard"><div class="mcard-h" data-act="coming" data-what="doulist">豆列<span class="soon">第二期</span><i>›</i></div>${slots("doulist", 4, "豆列")}</div>
        <div class="form-note" style="text-align:center">豆瓣 v${VERSION} · 第一期：小组</div>
      </div>
      <button class="fab" data-act="fab-me" aria-label="发帖">${I.pen}</button>`;
    const hero = $(".me-hero"); if (hero && hero.dataset.bgRef) mediaUrl(hero.dataset.bgRef).then(u => { if (u) hero.style.backgroundImage = `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.35)),url("${u}")`; });
  }

  // ───────────────────────── 搜索 / 建组 / 小组页 ─────────────────────────
  function openSearch() {
    let term = "", results = null, busy = false;
    const page = openPage("search", pg => {
      body(pg, `<div style="padding:10px 16px;background:var(--wb-card)"><form class="db-search" id="sform" style="height:38px">${I.search}<input id="sq" placeholder="搜索小组，比如：足球、考研、平南一高" value="${esc(term)}" enterkeyhint="search"></form></div>`
        + (busy ? `<div class="gen-tip"><span class="spinner"></span>正在找「${esc(term)}」相关的小组…</div>` : "")
        + (results ? (results.length ? results.map(g => `<div class="g-row" data-act="open-group" data-id="${esc(g.id)}">${groupAva(g)}<div class="cell-main"><b>${esc(g.name)}</b><div class="cell-sub">${fmtNum(g.members)} 个成员 · ${esc(g.intro)}</div></div>
            <button class="g-join ${isJoined(g) ? "on" : ""}" data-act="toggle-join" data-id="${esc(g.id)}">${isJoined(g) ? "已加入" : "加入"}</button></div>`).join("")
          + (busy ? "" : `<button class="load-more" data-act="search-again">换一批（会用 1 次 API）</button>`) : `<div class="empty">没找到</div>`) : "")
        + (!results && !busy && Object.keys(S.meta.searches).length ? `<div class="db-sec">搜过的</div><div style="padding:0 16px 16px;display:flex;flex-wrap:wrap;gap:8px">${Object.keys(S.meta.searches).slice(-12).reverse().map(k => `<button class="anon-chip" data-act="search-term" data-term="${esc(k)}">${esc(k)}</button>`).join("")}</div>` : ""));
      const f = $("#sform", pg.el); const q = $("#sq", pg.el);
      f.onsubmit = e => { e.preventDefault(); pg.run(q.value); };
      if (!results && !busy) setTimeout(() => q.focus(), 60);
    }, { title: "搜索小组" });
    page.run = async (v, again) => {
      term = String(v || "").trim(); if (!term || busy) return;
      busy = true; results = again ? results : null; page.render(page);
      results = await searchGroups(term, again); busy = false; page.render(page);
    };
    return page;
  }
  async function createGroup() {
    let draft = { name: "", intro: "", topicsHint: "", admin: true };
    const page = openPage("create-group", pg => {
      body(pg, `<div class="form">
        <div class="form-row"><label>小组名</label><input id="cg-name" maxlength="30" placeholder="比如：平南一高吐槽组" value="${esc(draft.name)}"></div>
        <div class="form-row"><label>简介</label><textarea id="cg-intro" maxlength="300" placeholder="小组介绍、组规">${esc(draft.intro)}</textarea></div>
        <div class="form-row"><label>讨论什么</label><textarea id="cg-topics" maxlength="300" placeholder="这个组平时聊些什么，AI 会照着写帖子">${esc(draft.topicsHint)}</textarea></div>
        <div class="list-cell"><div class="cell-main"><div>我当组长</div><div class="cell-sub">关掉就是你建了组，但组长是别人（AI 会写一个）</div></div><button class="switch ${draft.admin ? "on" : ""}" data-act="cg-admin"><span></span></button></div>
      </div><div style="padding:20px 16px"><button class="btn-primary" style="width:100%;height:42px;border-radius:21px;background:var(--wb-orange);color:#fff" data-act="cg-submit">创建小组</button></div>`);
      for (const [id, k] of [["cg-name", "name"], ["cg-intro", "intro"], ["cg-topics", "topicsHint"]]) $(`#${id}`, pg.el).oninput = e => { draft[k] = e.target.value; };
    }, { title: "创建小组" });
    page.toggleAdmin = () => { draft.admin = !draft.admin; page.render(page); };
    page.submit = () => {
      const name = draft.name.trim(); if (!name) { toast("先给小组起个名字"); return; }
      if (S.groups.some(g => g.name === name)) { toast("已经有同名小组了"); return; }
      const g = { id: uid("g"), scope: S.identity.id, name, intro: draft.intro.trim(), topicsHint: draft.topicsHint.trim(), members: rand(3, 30), mine: true, admin: draft.admin, createdAt: nowIso() };
      S.groups.push(g); saveGroup(g); closePage(); openGroup(g.id); toast("小组建好了");
    };
  }
  /** 小组内页（照真豆瓣）：整块彩色/自选背景的头，组头像 + 名字 + 「N 成员称呼 · 组长 xx」+ 右边加入；简介和发言规则；分区标签；最新/热门/精华；右下角笔 */
  function openGroup(id) {
    const g = groupById(id); if (!g) return;
    let sec = "all", sort = "new";
    const page = openPage(`group:${id}`, pg => {
      const all = S.topics.filter(t => t.groupId === id);
      let list = all.filter(t => sec === "all" || t.section === sec);
      if (sort === "elite") list = list.filter(t => t.elite);
      list.sort(sort === "hot" ? (a, b) => Math.max(b.replyCount, b.floors.length) - Math.max(a.replyCount, a.floors.length) : (a, b) => new Date(b.lastReplyAt || b.createdAt) - new Date(a.lastReplyAt || a.createdAt));
      const leader = g.mine && g.admin ? `${S.meta.nickname}（你）` : g.leader || "";
      body(pg, `<div class="g-hero" style="background:${g.coverRef ? "#333" : `linear-gradient(160deg, ${groupColor(g)}, ${groupColor(g)}cc)`}" ${g.coverRef ? `data-bg-ref="${esc(g.coverRef)}"` : ""}>
          <div class="g-hero-top">${groupAvaHtml(g, "lg")}<div class="cell-main"><h2>${esc(g.name)}</h2><div class="g-sub">${fmtNum(g.members)} ${esc(g.memberNoun || "成员")}${leader ? ` · 组长 ${esc(leader)}` : ""}</div></div>
            ${g.mine ? `<button class="g-join2 on" data-act="edit-group" data-id="${esc(id)}">管理</button>` : `<button class="g-join2 ${isJoined(g) ? "on" : ""}" data-act="toggle-join" data-id="${esc(id)}">${isJoined(g) ? "已加入" : "加入"}</button>`}</div>
          ${g.intro ? `<div class="g-line"><b>小组简介：</b>${esc(g.intro)}</div>` : ""}
          ${g.rules ? `<div class="g-line"><b>发言规则：</b>${esc(g.rules)}</div>` : ""}
        </div>
        <div class="db-white">
        <div class="sec-tabs"><button class="${sec === "all" ? "on" : ""}" data-act="g-sec" data-v="all">全部</button>${(g.sections || []).map(x => `<button class="${sec === x ? "on" : ""}" data-act="g-sec" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>
        <div class="list-head">讨论列表<div class="seg3">${[["new", "最新"], ["hot", "热门"], ["elite", "精华"]].map(([k, l]) => `<button class="${sort === k ? "on" : ""}" data-act="g-sort" data-v="${k}">${l}</button>`).join("")}</div></div>
        ${g._busy && !all.length ? `<div class="gen-tip"><span class="spinner"></span>正在进组看看大家在聊什么…</div>` : ""}
        ${list.map(t => topicCard(t, "group")).join("")}
        ${!list.length && !g._busy ? `<div class="empty" style="padding:30px">${sort === "elite" ? "还没有精华帖" : "还没有帖子"}</div>` : ""}
        ${all.length ? (g._busy ? `<div class="gen-tip"><span class="spinner"></span>刷新中…</div>` : `<button class="load-more" data-act="g-refresh" data-id="${esc(id)}">看看有没有新帖（会用 1 次 API）</button>`) : ""}
        </div>`);
      const hero = $(".g-hero", pg.el); if (hero && hero.dataset.bgRef) mediaUrl(hero.dataset.bgRef).then(u => { if (u) hero.style.background = `linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.45)),center/cover url("${u}")`; });
    }, { title: "", cls: "gpage", action: `<button class="top-icon" data-act="group-menu" data-id="${esc(id)}" aria-label="更多">${I.more}</button>`, after: `<button class="fab" data-act="new-topic" data-id="${esc(id)}" aria-label="发帖">${I.pen}</button>` });
    page.setSec = v => { sec = v; page.render(page); };
    page.setSort = v => { sort = v; page.render(page); };
    if (!S.topics.some(t => t.groupId === id)) genTopics(g);
  }
  function editGroup(id) {
    const g = groupById(id); if (!g) return;
    openPage(`edit-group:${id}`, pg => {
      body(pg, `<div class="form"><div class="form-row"><label>简介</label><textarea id="eg-intro" maxlength="300">${esc(g.intro)}</textarea></div>
        <div class="form-row"><label>讨论什么</label><textarea id="eg-topics" maxlength="300">${esc(g.topicsHint || "")}</textarea></div>
        <div class="list-cell"><div class="cell-main"><div>我当组长</div></div><button class="switch ${g.admin ? "on" : ""}" data-act="eg-admin" data-id="${esc(id)}"><span></span></button></div></div>
        <div style="padding:20px 16px;display:grid;gap:10px"><button class="btn-primary" style="height:42px;border-radius:21px;background:var(--wb-orange);color:#fff" data-act="eg-save" data-id="${esc(id)}">保存</button>
        <button class="load-more" style="color:var(--wb-red)" data-act="del-group" data-id="${esc(id)}">解散小组（帖子一起删掉）</button></div>`);
    }, { title: "编辑小组" });
  }

  // ───────────────────────── 帖子页 ─────────────────────────
  function roleTags(t, a) {
    const g = groupById(t.groupId) || {};
    return [sameAuthor(a, t.author) ? `<span class="role-tag op">楼主</span>` : "",
      a.type === "user" && !a.anon && g.mine && g.admin ? `<span class="role-tag admin">组长</span>` : "",
      a.type === "user" && a.anon ? `<span class="role-tag mask">我</span>` : "",
      a.type === "char" && a.anon ? `<span class="role-tag mask">${esc(charById(a.charId)?.name || "")}的马甲</span>` : ""].join("");
  }
  /** 帖子页（照真豆瓣）：顶部作者 + 关注；标题、正文、配图；回复/赞/转发/收藏；全部回复 + 「楼主」筛选；底部 实名匿名 + 写回复 + 赞转发收藏 */
  function openTopic(id) {
    const t0 = topicById(id); if (!t0) return;
    let onlyOp = false; let quote = null; let anon = false;
    const w0 = whoOf(t0.author);
    const page = openPage(`topic:${id}`, pg => {
      const t = topicById(id); if (!t) { body(pg, `<div class="empty">帖子已删除</div>`); return; }
      const g = groupById(t.groupId) || { name: "" }; const w = whoOf(t.author);
      const floors = onlyOp ? t.floors.filter(f => sameAuthor(f.author, t.author)) : t.floors;
      const n = Math.max(t.replyCount, t.floors.length);
      const follow = t.author.type === "user" || t.author.anon ? "" : `<button class="follow-mini ${isFollowing(t.author) ? "on" : ""}" data-act="follow-author">${isFollowing(t.author) ? "已关注" : "＋关注"}</button>`;
      body(pg, `<div class="post-head"><div class="post-author">${avatarHtml(w)}<div class="cell-main"><div class="pa-name">${esc(w.name)}${roleTags(t, t.author).replace('<span class="role-tag op">楼主</span>', "")}</div>
            <div class="post-from">${fmtTime(t.createdAt)}${ipOf(t.author, t.ip) ? ` · ${esc(ipOf(t.author, t.ip))}` : ""}</div></div>${follow}</div>
          <h1>${t.section ? `${esc(t.section)}<span class="sep">|</span>` : ""}${esc(t.title)}${t.elite ? '<span class="elite after">精</span>' : ""}</h1></div>
        <div class="post-body">${esc(t.body)}</div>
        ${(t.images || []).length ? `<div class="post-pics">${t.images.map((im, k) => `<div class="post-pic" data-act="topic-pic" data-idx="${k}">${im.ref ? `<img data-ref="${esc(im.ref)}" alt="">` : placeholderImg()}${!im.ref && im.desc ? `<span>${esc(im.desc)}</span>` : ""}</div>`).join("")}</div>` : ""}
        <div class="post-stats"><span class="on">回复 ${fmtNum(n)}</span><span>赞 ${fmtNum(t.likes || 0)}</span><span>转发 ${fmtNum(t.reposts || 0)}</span><span>收藏 ${fmtNum(t.favs || 0)}</span></div>
        <div class="list-head">全部回复<button class="op-filter ${onlyOp ? "on" : ""}" data-act="only-op">楼主</button></div>
        ${floors.map(f => { const fw = whoOf(f.author); const q = f.quote ? t.floors.find(x => x.n === f.quote) : null;
          return `<div class="floor" data-act="floor" data-n="${f.n}">${avatarHtml(fw)}<div class="cell-main"><div class="floor-top"><span class="nm">${esc(fw.name)}</span>${roleTags(t, f.author)}<span class="fl-t">${fmtTime(f.createdAt)}${ipOf(f.author, f.ip) ? ` · ${esc(ipOf(f.author, f.ip))}` : ""} · ${f.n}楼</span>
              <button class="fl-like ${f.liked ? "on" : ""}" data-act="floor-like" data-n="${f.n}">${f.likes ? fmtNum(f.likes) : ""}${f.liked ? I.liked : I.like}</button></div>
            ${q ? `<div class="floor-quote">${esc(whoOf(q.author).name)}：${esc(q.text)}</div>` : f.quote === 1 ? `<div class="floor-quote">${esc(w.name)}：${esc(t.body.slice(0, 80))}</div>` : ""}
            <div class="floor-text">${esc(f.text)}</div></div></div>`; }).join("")}
        ${t._busy ? `<div class="gen-tip"><span class="spinner"></span>${t.floors.length ? "楼下有人在打字…" : "正在加载回应…"}</div>` : t.floors.length ? `<button class="load-more" data-act="more-floors">加载更多回应（会用 1 次 API）</button>` : ""}`);
      const qb = $(".reply-quote", pg.el); qb.classList.toggle("hidden", !quote);
      if (quote) { const f = t.floors.find(x => x.n === quote); qb.innerHTML = `<div class="cell-main">回复 ${esc(f ? whoOf(f.author).name : "")}：${esc(f ? f.text : "")}</div><button data-act="unquote">✕</button>`; }
      const chip = $(".anon-chip", pg.el); chip.classList.toggle("on", anon); chip.textContent = anon ? "匿名" : "实名";
      $(".bb-like", pg.el).classList.toggle("on", !!t.liked); $(".bb-like", pg.el).innerHTML = t.liked ? I.liked : I.like;
      $(".bb-fav", pg.el).classList.toggle("on", !!t.faved); $(".bb-fav", pg.el).innerHTML = t.faved ? I.favOn : I.fav;
      // 滑过发帖人那一行后，顶栏才出现头像、名字和关注（关注在最右）
      const th = $(".topic-head", pg.el); if (th) { const fb = th.querySelector(".follow-mini"); if (fb) { fb.classList.toggle("on", isFollowing(t.author)); fb.textContent = isFollowing(t.author) ? "已关注" : "＋关注"; } }
    }, { cls: "tpage", action: `<button class="top-icon" data-act="topic-menu" aria-label="更多">${I.more}</button>`, head: `<div class="topic-head" data-act="noop">${avatarHtml(w0)}<span>${esc(w0.name)}</span>${t0.author.type === "user" || t0.author.anon ? "" : `<button class="follow-mini ${isFollowing(t0.author) ? "on" : ""}" data-act="follow-author">${isFollowing(t0.author) ? "已关注" : "＋关注"}</button>`}</div>`,
      footer: `<div class="reply-quote hidden"></div><div class="reply-bar bb"><button class="anon-chip" data-act="toggle-anon">实名</button><textarea class="reply-input" rows="1" placeholder="写回复" maxlength="500"></textarea><button class="reply-send hidden">发送</button>
        <span class="bb-icons"><button class="bb-like" data-act="topic-like">${I.like}</button><button data-act="topic-repost">${I.repost}</button><button class="bb-fav" data-act="topic-fav">${I.fav}</button></span></div>` });
    page.setOnlyOp = () => { onlyOp = !onlyOp; page.render(page); };
    page.setQuote = n => { quote = n; page.render(page); $(".reply-input", page.el).focus(); };
    page.toggleAnon = () => { anon = !anon; page.render(page); };
    const pb = $(".page-body", page.el); const onScroll = () => { const a = $(".post-author", page.el); page.el.classList.toggle("scrolled", !!a && pb.scrollTop > a.offsetTop + a.offsetHeight - 10); };
    pb.addEventListener("scroll", onScroll, { passive: true });
    const input = $(".reply-input", page.el); const send = $(".reply-send", page.el); const icons = $(".bb-icons", page.el);
    input.addEventListener("input", () => { const has = !!input.value.trim(); send.classList.toggle("hidden", !has); icons.classList.toggle("hidden", has); input.style.height = "auto"; input.style.height = Math.min(100, input.scrollHeight) + "px"; });
    send.addEventListener("click", () => {
      const t = topicById(id); const text = input.value.trim(); if (!t || !text) return;
      const n = (t.floors.length ? t.floors[t.floors.length - 1].n : 1) + 1;
      const f = { n, author: { type: "user", anon }, text, likes: 0, quote, createdAt: nowIso() };
      t.floors.push(f); t.lastReplyAt = f.createdAt; t.replyCount = Math.max(t.replyCount, t.floors.length); saveTopic(t);
      quote = null; input.value = ""; send.classList.add("hidden"); icons.classList.remove("hidden"); input.style.height = "";
      page.render(page); const b = $(".page-body", page.el); b.scrollTop = b.scrollHeight;
      genFloors(t, f);
    });
    if (!t0.floors.length) genFloors(t0);
  }
  /** IP 属地：AI 写的优先；她自己用资料里填的；老数据按名字固定分一个省 */
  const PROVS = ["北京", "上海", "广东", "浙江", "江苏", "四川", "湖北", "湖南", "山东", "河南", "福建", "陕西", "重庆", "天津", "安徽", "辽宁"];
  function ipOf(a, ip) {
    if (a.type === "user") return S.meta.ip || "";
    if (ip) return ip;
    return PROVS[hashHue(a.type === "char" ? a.charId : a.name) % PROVS.length];
  }
  const followKey = a => a.type === "char" ? `c:${a.charId}` : `n:${a.name}`;
  const isFollowing = a => !a.anon && (S.meta.follows || []).includes(followKey(a));
  /** 看大图：描述图可以「生成这张图」 */
  function openViewer(images, idx, onSave, charId) {
    const img = images[idx]; if (!img) return;
    const el = document.createElement("div"); el.className = "viewer";
    const draw = async () => {
      const url = img.ref ? await mediaUrl(img.ref) : "";
      el.innerHTML = `<div class="idx">${idx + 1}/${images.length}</div>${url ? `<img src="${url}" alt="">` : placeholderImg()}${img.desc ? `<div class="desc">${esc(img.desc)}</div>` : ""}
        <div class="tools">${!url && img.desc && api.ai.generateImage ? `<button data-v="gen">生成这张图</button>` : ""}<button data-v="close">关闭</button></div>`;
    };
    el.onclick = async e => {
      const b = e.target.closest("[data-v]"); if (!b) { el.remove(); return; }
      if (b.dataset.v === "close") { el.remove(); return; }
      b.disabled = true; b.textContent = "生成中…（10~30 秒）";
      try {
        const r = await api.ai.generateImage({ prompt: img.desc, characterId: charId, useReferenceImage: false, timeoutMs: 120000 });
        if (r && r.dataUrl) { const st = await api.media.put({ dataUrl: r.dataUrl }); img.ref = st.ref; S.mediaCache.set(st.ref, r.dataUrl); onSave && onSave(); await draw(); refreshAll(); }
      } catch (err) { toast(`生图失败：${(err && err.message) || err}`.slice(0, 60)); b.disabled = false; b.textContent = "生成这张图"; }
    };
    document.body.appendChild(el); draw();
  }
  /** 她发帖：标题、正文、分区、配图（相册或描述）、实名/匿名 → 楼下来人 */
  function newTopic(groupId) {
    const g = groupById(groupId); if (!g) return;
    const d = { title: "", body: "", anon: false, section: "", images: [] };
    openPage(`new-topic:${groupId}`, pg => {
      body(pg, `<div class="form"><div class="form-note" style="margin:0">发到「${esc(g.name)}」</div>
        ${(g.sections || []).length ? `<div class="chips" style="padding:10px 16px;background:var(--wb-card)"><button class="${!d.section ? "on" : ""}" data-act="nt-sec" data-v="">不选分区</button>${g.sections.map(x => `<button class="${d.section === x ? "on" : ""}" data-act="nt-sec" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}
        <div class="form-row"><label>标题</label><input id="nt-title" maxlength="60" placeholder="帖子标题" value="${esc(d.title)}"></div>
        <div class="form-row" style="align-items:flex-start"><label style="padding-top:14px">正文</label><textarea id="nt-body" style="min-height:160px" maxlength="3000" placeholder="说点什么……">${esc(d.body)}</textarea></div>
        <div class="nt-pics">${d.images.map((im, k) => `<div class="post-pic sm" data-act="nt-pic-rm" data-idx="${k}">${im.ref ? `<img data-ref="${esc(im.ref)}" alt="">` : placeholderImg()}${!im.ref ? `<span>${esc(im.desc)}</span>` : ""}</div>`).join("")}
          ${d.images.length < 4 ? `<button class="nt-add" data-act="nt-pic">＋<span>配图</span></button>` : ""}</div>
        <div class="list-cell"><div class="cell-main"><div>匿名发帖</div><div class="cell-sub">显示成「匿名豆友」，char 和豆友都不知道是你</div></div><button class="switch ${d.anon ? "on" : ""}" data-act="nt-anon"><span></span></button></div></div>`);
      $("#nt-title", pg.el).oninput = e => { d.title = e.target.value; }; $("#nt-body", pg.el).oninput = e => { d.body = e.target.value; };
    }, { title: "发帖", action: `<button class="top-icon" style="width:auto;color:var(--wb-orange);font-size:15px" data-act="nt-send">发布</button>` }).draft = d;
  }
  function sendTopic(pg) {
    const d = pg.draft; const groupId = pg.key.split(":")[1];
    if (!d.title.trim() || !d.body.trim()) { toast("标题和正文都要写"); return; }
    const t = { id: uid("t"), scope: S.identity.id, groupId, title: d.title.trim(), author: { type: "user", anon: d.anon }, body: d.body.trim(), createdAt: nowIso(), lastReplyAt: nowIso(), replyCount: 0, floors: [],
      section: d.section || "", images: d.images, likes: 0, favs: 0, reposts: 0 };
    S.topics.push(t); saveTopic(t);
    const g = groupById(groupId); if (g && !isJoined(g)) { S.meta.joined.push(g.id); saveMeta(); }
    closePage(); openTopic(t.id); toast(d.anon ? "匿名发出去了" : "发布成功");
  }

  // ───────────────────────── 我的 ─────────────────────────
  function openMyPosts() {
    openPage("my-posts", pg => {
      const list = S.topics.filter(t => t.author.type === "user" || t.floors.some(f => f.author.type === "user")).sort((a, b) => new Date(b.lastReplyAt) - new Date(a.lastReplyAt));
      body(pg, list.length ? `<div class="db-white">${list.map(t => topicCard(t, "feed")).join("")}</div>` : `<div class="empty">还没有发过帖子或回应</div>`);
    }, { title: "我的帖子和回应" });
  }
  function openEditMe() {
    openPage("edit-me", pg => {
      body(pg, `<div class="form"><div class="form-row"><label>头像</label>${avatarHtml(whoOf({ type: "user" }))}<button class="btn-ghost" data-act="me-avatar">上传</button>${S.meta.avatarRef ? `<button class="btn-ghost" data-act="me-avatar-reset">用身份头像</button>` : ""}</div>
        <div class="form-row"><label>昵称</label><input id="em-nick" maxlength="20" value="${esc(S.meta.nickname)}"></div>
        <div class="form-row"><label>签名</label><input id="em-sign" maxlength="60" value="${esc(S.meta.sign || "")}"></div>
        <div class="form-row"><label>IP属地</label><input id="em-ip" maxlength="12" placeholder="比如 平南" value="${esc(S.meta.ip || "")}"></div></div>
        <div style="padding:20px 16px"><button class="btn-primary" style="width:100%;height:42px;border-radius:21px;background:var(--wb-orange);color:#fff" data-act="em-save">保存</button></div>`);
    }, { title: "编辑资料" });
  }
  function openSettings() {
    openPage("settings", pg => {
      const pool = S.meta.avatarPool || [];
      body(pg, `<div class="form-note">参与豆瓣的角色 · 关掉的人不会出现在小组里</div>
        ${S.chars.map(c => { const on = !(S.meta.excludedChars || []).includes(c.id);
          return `<div class="list-cell">${avatarHtml({ name: c.name, seed: c.id, avatar: c.avatar })}<div class="cell-main"><div>${esc(c.name)}</div><div class="cell-sub">豆瓣昵称：${esc(S.meta.charNicks[c.id] || "还没有（第一次实名出场时起）")}</div></div>
            <button class="btn-ghost" data-act="set-char-nick" data-id="${esc(c.id)}" style="height:28px;padding:0 10px;font-size:12px">改昵称</button><button class="switch ${on ? "on" : ""}" data-act="toggle-char" data-id="${esc(c.id)}"><span></span></button></div>`; }).join("") || `<div class="empty" style="padding:24px">这个身份还没有角色好友</div>`}
        <div class="form-note" style="margin-top:8px">豆友头像库 · 豆友从这里分头像，同一个人一直是同一张。点图片可以删除</div>
        <div class="album avatar-pool">${pool.map((ref, i) => `<div class="pic" data-act="pool-rm" data-idx="${i}"><img data-ref="${esc(ref)}" alt=""></div>`).join("")}<button class="compose-add" data-act="pool-add">＋</button></div>`);
    }, { title: "设置" });
  }
  function openDebug() {
    openPage("debug", pg => {
      body(pg, S.debug.length ? S.debug.map(e => `<div class="list-cell" style="display:block"><div><b>${esc(e.label || "")}</b> <span class="cell-sub">${fmtTime(e.at)} ${e.ok ? "" : "❗ 失败"}</span></div><pre style="white-space:pre-wrap;font-size:12px;margin:6px 0 0;color:var(--wb-text-2)">${esc(e.ok ? e.text : e.error)}</pre></div>`).join("") : `<div class="empty">还没有 AI 调用</div>`);
    }, { title: "调试记录（最近 10 次）" });
  }

  // ───────────────────────── 点击 ─────────────────────────
  document.addEventListener("click", async e => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    e.stopPropagation();
    const act = el.dataset.act; const pg = topPage();
    switch (act) {
      case "back": closePage(); return;
      case "tab": while (pages.length) { const p = pages.pop(); p.el.remove(); } S.tab = el.dataset.tab; renderTab(); $("#view").scrollTop = 0; return;
      case "coming": openComing(el.dataset.what === "_posts" ? "book" : el.dataset.what); return;
      case "open-search": openSearch(); return;
      case "search-term": if (pg && pg.run) pg.run(el.dataset.term); return;
      case "search-again": { const q = pg && $("#sq", pg.el); if (pg && pg.run && q) pg.run(q.value, true); return; }
      case "create-group": createGroup(); return;
      case "cg-admin": if (pg && pg.toggleAdmin) pg.toggleAdmin(); return;
      case "cg-submit": if (pg && pg.submit) pg.submit(); return;
      case "open-group": openGroup(el.dataset.id); return;
      case "g-fold": if (pg && pg.unfold) pg.unfold(); return;
      case "g-refresh": { const g = groupById(el.dataset.id); if (g) genTopics(g); return; }
      case "toggle-join": {
        const g = groupById(el.dataset.id); if (!g || g.mine) return;
        const on = isJoined(g); S.meta.joined = on ? S.meta.joined.filter(x => x !== g.id) : [...S.meta.joined, g.id]; saveMeta();
        toast(on ? "已退出小组" : "加入成功"); refreshAll(); return;
      }
      case "edit-group": editGroup(el.dataset.id); return;
      case "eg-admin": { const g = groupById(el.dataset.id); if (g) { g.admin = !g.admin; saveGroup(g); refreshAll(); } return; }
      case "eg-save": { const g = groupById(el.dataset.id); if (!g) return; g.intro = $("#eg-intro", pg.el).value.trim(); g.topicsHint = $("#eg-topics", pg.el).value.trim(); saveGroup(g); closePage(); toast("保存了"); return; }
      case "del-group": {
        const g = groupById(el.dataset.id); if (!g) return;
        if (await sheet(`解散「${g.name}」？组里的帖子会一起删掉`, [{ label: "解散", value: "yes", danger: true }]) !== "yes") return;
        for (const t of S.topics.filter(x => x.groupId === g.id)) await deleteTopic(t); S.groups = S.groups.filter(x => x !== g); dbDelete(COL.groups, g.id);
        while (pages.length) { const p = pages.pop(); p.el.remove(); } renderTab(); toast("已解散"); return;
      }
      case "new-topic": newTopic(el.dataset.id); return;
      case "noop": return;
      case "topic-menu": {
        const t = topicById(pg.key.split(":")[1]); if (!t) return;
        const v = await sheet("", [{ label: t.faved ? "取消收藏" : "收藏", value: "fav" }, { label: "删除这条帖子（相关记忆一起删）", value: "del", danger: true }]);
        if (v === "fav") { t.faved = !t.faved; t.favs = Math.max(0, (t.favs || 0) + (t.faved ? 1 : -1)); saveTopic(t); pg.render(pg); toast(t.faved ? "已收藏" : "已取消收藏"); }
        if (v === "del") {
          if (await sheet(`删除《${t.title.slice(0, 20)}》？楼层和相关记忆会一起删掉`, [{ label: "删除", value: "yes", danger: true }]) !== "yes") return;
          await deleteTopic(t); closePage(); toast("已删除");
        }
        return;
      }
      case "wipe-all": {
        if (await sheet("清空豆瓣的全部内容？小组、帖子、回应、搜索记录和相关记忆都会删掉，删了不能恢复（你的昵称、头像、IP 和设置会留着）", [{ label: "全部删除", value: "yes", danger: true }]) !== "yes") return;
        for (const t of S.topics) forget(memEventsOfTopic(t));
        await Promise.all([...S.topics.map(t => dbDelete(COL.topics, t.id)), ...S.groups.map(g => dbDelete(COL.groups, g.id))]);
        S.topics = []; S.groups = []; S.groupChip = null;
        Object.assign(S.meta, { joined: [], searches: {}, follows: [], charNicks: {} }); saveMeta();
        renderTab(); toast("豆瓣已清空"); return;
      }
      case "all-groups": {
        const mine = myGroups(); if (!mine.length) { toast("还没有加入小组"); return; }
        openPage("all-groups", p2 => body(p2, `<div class="db-white">${mine.map(g => `<div class="g-row" data-act="open-group" data-id="${esc(g.id)}">${groupAvaHtml(g)}<div class="cell-main"><b>${esc(g.name)}</b><div class="cell-sub">${fmtNum(g.members)} ${esc(g.memberNoun || "成员")}${g.mine ? " · 你创建的" : ""}</div></div></div>`).join("")}</div>`), { title: `我的小组 ${mine.length}` });
        return;
      }
      case "g-chip": S.groupChip = el.dataset.id; renderTab(); return;
      case "g-sec": if (pg && pg.setSec) pg.setSec(el.dataset.v); return;
      case "g-sort": if (pg && pg.setSort) pg.setSort(el.dataset.v); return;
      case "group-menu": {
        const g = groupById(el.dataset.id); if (!g) return;
        const v = await sheet(g.name, [{ label: "换小组头像", value: "ava" }, { label: "换背景", value: "cover" }, ...(g.avatarRef || g.coverRef ? [{ label: "恢复默认头像和背景", value: "reset" }] : []),
          { label: "看看有没有新帖（1 次 API）", value: "refresh" }, ...(g.mine ? [{ label: "编辑小组", value: "edit" }] : isJoined(g) ? [{ label: "退出小组", value: "quit", danger: true }] : [])]);
        if (v === "ava" || v === "cover") { try { const [ref] = await pickImages(1, v === "ava" ? 400 : 1200); if (ref) { g[v === "ava" ? "avatarRef" : "coverRef"] = ref; saveGroup(g); refreshAll(); } } catch (err) { toast("上传失败"); } }
        if (v === "reset") { g.avatarRef = null; g.coverRef = null; saveGroup(g); refreshAll(); }
        if (v === "refresh") genTopics(g);
        if (v === "edit") editGroup(g.id);
        if (v === "quit") { S.meta.joined = S.meta.joined.filter(x => x !== g.id); saveMeta(); toast("已退出小组"); refreshAll(); }
        return;
      }
      case "fab-me": {
        const mine = myGroups(); if (!mine.length) { toast("先加入或创建一个小组"); return; }
        const v = await sheet("发到哪个小组", mine.map(g => ({ label: g.name, value: g.id }))); if (v) newTopic(v); return;
      }
      case "me-menu": {
        const v = await sheet("", [{ label: "编辑资料", value: "edit" }, { label: "换背景图", value: "cover" }, ...(S.meta.coverRef ? [{ label: "恢复默认背景", value: "uncover" }] : []), { label: "设置", value: "set" }, { label: "调试记录", value: "debug" }]);
        if (v === "edit") openEditMe(); if (v === "set") openSettings(); if (v === "debug") openDebug();
        if (v === "cover") { try { const [ref] = await pickImages(1, 1200); if (ref) { S.meta.coverRef = ref; saveMeta(); renderTab(); } } catch (err) { toast("上传失败"); } }
        if (v === "uncover") { S.meta.coverRef = null; saveMeta(); renderTab(); }
        return;
      }
      case "topic-like": case "topic-fav": case "topic-repost": {
        const t = topicById(pg.key.split(":")[1]); if (!t) return;
        if (act === "topic-like") { t.liked = !t.liked; t.likes = Math.max(0, (t.likes || 0) + (t.liked ? 1 : -1)); }
        if (act === "topic-fav") { t.faved = !t.faved; t.favs = Math.max(0, (t.favs || 0) + (t.faved ? 1 : -1)); toast(t.faved ? "已收藏" : "已取消收藏"); }
        if (act === "topic-repost") { t.reposts = (t.reposts || 0) + 1; toast("转发到广播的功能第三期上线，先帮你记一笔转发数"); }
        saveTopic(t); pg.render(pg); return;
      }
      case "follow-author": {
        const t = topicById(pg.key.split(":")[1]); if (!t || t.author.anon) { toast("匿名豆友没法关注"); return; }
        const k = followKey(t.author); const on = (S.meta.follows || []).includes(k);
        S.meta.follows = on ? S.meta.follows.filter(x => x !== k) : [...(S.meta.follows || []), k]; saveMeta();
        toast(on ? "已取消关注" : "关注成功"); pg.render(pg); return;
      }
      case "topic-pic": { const t = topicById(pg.key.split(":")[1]); if (t) openViewer(t.images, +el.dataset.idx, () => saveTopic(t), t.author.charId); return; }
      case "nt-sec": if (pg && pg.draft) { pg.draft.section = el.dataset.v; pg.render(pg); } return;
      case "nt-pic": {
        if (!pg || !pg.draft) return;
        const how = await sheet("配图", [{ label: "从相册选", value: "pick" }, { label: "写一段描述当图片", value: "desc" }]);
        if (how === "pick") { try { const refs = await pickImages(4 - pg.draft.images.length, 1280); pg.draft.images.push(...refs.map(ref => ({ ref, desc: "" }))); } catch (err) { toast("上传失败"); } }
        if (how === "desc") { const desc = await inputSheet("图片描述", { placeholder: "画面里有什么", maxlength: 200, area: true }); if (desc) pg.draft.images.push({ desc }); }
        pg.render(pg); return;
      }
      case "nt-pic-rm": if (pg && pg.draft) { pg.draft.images.splice(+el.dataset.idx, 1); pg.render(pg); } return;
      case "nt-anon": if (pg && pg.draft) { pg.draft.anon = !pg.draft.anon; pg.render(pg); } return;
      case "nt-send": if (pg && pg.draft) sendTopic(pg); return;
      case "open-topic": openTopic(el.dataset.id); return;
      case "only-op": if (pg && pg.setOnlyOp) pg.setOnlyOp(); return;
      case "toggle-anon": if (pg && pg.toggleAnon) pg.toggleAnon(); return;
      case "unquote": if (pg && pg.setQuote) pg.setQuote(null); return;
      case "floor-quote": if (pg && pg.setQuote) pg.setQuote(+el.dataset.n); return;
      case "floor": {
        if (!pg || !pg.setQuote) return;
        const v = await sheet("", [{ label: "回应这一楼", value: "q" }]); if (v === "q") pg.setQuote(+el.dataset.n); return;
      }
      case "floor-like": {
        const t = topicById(pg.key.split(":")[1]); const f = t && t.floors.find(x => x.n === +el.dataset.n); if (!f) return;
        f.liked = !f.liked; f.likes = Math.max(0, (f.likes || 0) + (f.liked ? 1 : -1)); saveTopic(t); pg.render(pg); return;
      }
      case "more-floors": { const t = topicById(pg.key.split(":")[1]); if (t) genFloors(t); return; }
      case "my-posts": openMyPosts(); return;
      case "edit-me": openEditMe(); return;
      case "em-save": { S.meta.nickname = $("#em-nick", pg.el).value.trim() || S.meta.nickname; S.meta.sign = $("#em-sign", pg.el).value.trim(); S.meta.ip = $("#em-ip", pg.el).value.trim(); saveMeta(); closePage(); toast("保存了"); return; }
      case "me-avatar": { try { const [ref] = await pickImages(1, 400); if (ref) { S.meta.avatarRef = ref; saveMeta(); refreshAll(); } } catch (err) { toast("上传失败"); } return; }
      case "me-avatar-reset": S.meta.avatarRef = null; saveMeta(); refreshAll(); return;
      case "open-settings": openSettings(); return;
      case "open-debug": openDebug(); return;
      case "toggle-char": { const id = el.dataset.id; const ex = S.meta.excludedChars || []; S.meta.excludedChars = ex.includes(id) ? ex.filter(x => x !== id) : [...ex, id]; saveMeta(); refreshAll(); return; }
      case "set-char-nick": { const id = el.dataset.id; const v = await inputSheet(`${charById(id)?.name || ""}的豆瓣昵称`, { value: S.meta.charNicks[id] || "", maxlength: 20 }); if (v != null) { if (v) S.meta.charNicks[id] = v; else delete S.meta.charNicks[id]; saveMeta(); refreshAll(); } return; }
      case "pool-add": { try { const refs = await pickImages(20, 300); if (refs.length) { S.meta.avatarPool = [...S.meta.avatarPool, ...refs]; saveMeta(); toast(`加了 ${refs.length} 张`); refreshAll(); } } catch (err) { toast("上传失败"); } return; }
      case "pool-rm": { const i = +el.dataset.idx; if (await sheet("从头像库删除这张？", [{ label: "删除", value: "yes", danger: true }]) !== "yes") return; S.meta.avatarPool.splice(i, 1); saveMeta(); refreshAll(); return; }
    }
  });

  // ───────────────────────── 启动 ─────────────────────────
  async function boot() {
    document.body.insertAdjacentHTML("afterbegin", `<header class="topbar" id="topbar"></header><main class="view" id="view"><div class="gen-tip"><span class="spinner"></span>加载中…</div></main><nav class="tabbar" id="tabbar"></nav>`);
    if (!api) { $("#view").innerHTML = `<div class="empty">请在小手机里打开这个 APP</div>`; return; }
    try { await loadAll(); } catch (e) { console.error(e); $("#view").innerHTML = `<div class="empty">加载失败：${esc(e.message || e)}</div>`; return; }
    renderTab();
  }
  boot();
})();
