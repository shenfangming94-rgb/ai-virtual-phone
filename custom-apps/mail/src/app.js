/* 邮箱 · 小手机自定义 APP（Gmail 的样子：char 的信、你写信他回、贺卡、定时发送、垃圾邮件、推广和更新） */
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
  const ts = iso => new Date(iso).getTime() || 0;
  const pad = x => String(x).padStart(2, "0");
  const none = v => !v || /^(无|没有|none|null|-|—)$/i.test(String(v).trim());
  function hashHue(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h % 360; }
  const AVA_COLORS = ["#5c6bc0", "#ef6c00", "#00897b", "#8e24aa", "#d81b60", "#3949ab", "#6d4c41", "#43a047", "#f4511e", "#546e7a", "#c2185b", "#1e88e5"];
  const colorFor = s => AVA_COLORS[hashHue(s) % AVA_COLORS.length];

  /** 列表里的时间：今天 22:47 / 10月19日 / 2025/10/19 */
  function fmtList(iso) {
    const t = new Date(iso), now = new Date(); if (isNaN(t)) return "";
    if (t.toDateString() === now.toDateString()) return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    if (t.getFullYear() === now.getFullYear()) return `${t.getMonth() + 1}月${t.getDate()}日`;
    return `${t.getFullYear()}/${t.getMonth() + 1}/${t.getDate()}`;
  }
  function fmtFull(iso) {
    const t = new Date(iso), now = new Date(); if (isNaN(t)) return "";
    const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    if (t.toDateString() === now.toDateString()) return hm;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (t.toDateString() === y.toDateString()) return `昨天 ${hm}`;
    return `${t.getFullYear() === now.getFullYear() ? "" : t.getFullYear() + "年"}${t.getMonth() + 1}月${t.getDate()}日 ${hm}`;
  }
  const toLocalInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const I = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6.5h16M4 12h16M4 17.5h16"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/></svg>',
    starOn: '<svg viewBox="0 0 24 24" fill="#f4b400" stroke="#f4b400" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6l2-8z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>',
    sendFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg>',
    draft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M14 3H6v18h12V7l-4-4z"/><path d="M14 3v4h4"/></svg>',
    spam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4M12 17v.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M10 9V5l-7 7 7 7v-4c5 0 8 1.5 11 5-1-5-4-10-11-11z"/></svg>',
    forward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M14 9V5l7 7-7 7v-4C9 15 6 16.5 3 20c1-5 4-10 11-11z"/></svg>',
    unread: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/><circle cx="19" cy="5" r="3" fill="currentColor" stroke="none"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 15c-3-2-4.5-3.5-4.5-5a2.2 2.2 0 0 1 4.5-.6 2.2 2.2 0 0 1 4.5.6c0 1.5-1.5 3-4.5 5z"/></svg>',
    cardFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm6 12c3-2 4.5-3.5 4.5-5a2.2 2.2 0 0 0-4.5-.6A2.2 2.2 0 0 0 7.5 10c0 1.5 1.5 3 4.5 5z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-4 3.8-6 7.5-6s6.6 2 7.5 6"/></svg>',
    restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></svg>',
    debug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 7 3.5 12 8 17M16 7l4.5 5L16 17M13.5 5l-3 14"/></svg>',
  };

  // ───────────────────────── 数据 ─────────────────────────
  // mails：一封一行 { id, scope, folder: inbox|sent|draft|spam|trash, cat: primary|promo|update, from, to, subject, body, at, status, read, star, att, thread }
  //   from/to：{ kind: me|char|npc|sys, charId, name, addr, brand }
  //   status：ok（正常）/ pending（回信还在路上，at 到了才出现）/ scheduled（我定时的，at 到了才寄出）/ draft
  // meta：我的资料、char 邮箱号、开关、各种上次时间
  const COL = { mails: "mails", meta: "meta" };
  const S = { identity: null, chars: [], meta: null, mails: [], debug: [], jobs: new Set(), mediaCache: new Map(), stack: [], folder: "inbox", tab: "mail" };
  async function dbList(c) { try { return (await api.db.list(c, { limit: 500 })) || []; } catch (e) { console.warn(e); return []; } }
  async function dbUpsert(c, row) {
    try { const u = await api.db.update(c, row.id, row); if (u) return u; } catch (e) { /* 没有就 create */ }
    return api.db.create(c, row);
  }
  async function dbDelete(c, id) { try { await api.db.delete(c, id); } catch (e) { console.warn(e); } }
  let metaTimer = null;
  function saveMeta() { clearTimeout(metaTimer); metaTimer = setTimeout(() => dbUpsert(COL.meta, S.meta).catch(e => console.warn(e)), 250); }
  // 同一封信的保存排队：两次同时到的话宿主都以为没有这行，会各建一行（重复来信就是这么来的）
  const mailQueue = new Map();
  function saveMail(m) {
    const next = (mailQueue.get(m.id) || Promise.resolve()).then(() => dbUpsert(COL.mails, m)).catch(e => console.warn(e));
    mailQueue.set(m.id, next);
    next.then(() => { if (mailQueue.get(m.id) === next) mailQueue.delete(m.id); });
    return next;
  }
  /** 以前撞车存出来的重复行：同一个 id 只留最新的一份 */
  async function dedupeMails(rows) {
    const by = new Map(), dup = new Set();
    for (const r of rows) {
      const o = by.get(r.id);
      if (o) dup.add(r.id);
      if (!o || String(r.updatedAt || "") >= String(o.updatedAt || "")) by.set(r.id, r);
    }
    for (const id of dup) { await dbDelete(COL.mails, id); try { await api.db.create(COL.mails, by.get(id)); } catch (e) { console.warn(e); } }
    return [...by.values()];
  }

  async function loadAll() {
    const identity = await api.user.getProfile({}).catch(() => null);
    S.identity = identity || { id: "default", name: "我" };
    const chars = await api.characters.list().catch(() => []);
    const owners = await Promise.all(chars.map(c => api.user.getProfile({ characterId: c.id }).catch(() => null)));
    S.chars = chars.filter((c, i) => !owners[i] || !identity || owners[i].id === identity.id);
    const [mails, metas] = await Promise.all([dbList(COL.mails), dbList(COL.meta)]);
    const scope = S.identity.id;
    S.mails = (await dedupeMails(mails)).filter(m => m.scope === scope || m.idol).map(m => ({ ...m, att: m.att || [] }));
    // 爱豆小手机：宿主写进来的开关。开着时 char 不主动写信，信箱里多了公司来信
    S.idol = Boolean((metas.find(m => m.id === "idol_mode") || {}).on);
    S.debug = (metas.find(m => m.id === "debug_log") || {}).entries || [];
    S.meta = metas.find(m => m.id === `meta_${scope}`) || { id: `meta_${scope}` };
    const d = { myName: S.identity.name || "我", myAddr: "", charAddrs: {}, excluded: [], quiet: [], freq: "sometimes", instant: false, promos: true, lastByChar: {}, npcs: [], cardsSeen: 0 };
    for (const k in d) if (S.meta[k] == null) S.meta[k] = d[k];
  }

  // ───────────────────────── 人 ─────────────────────────
  const charById = id => S.chars.find(c => c.id === id);
  const activeChars = () => S.chars.filter(c => !S.meta.excluded.includes(c.id));
  const herName = () => S.identity.name || S.meta.myName || "她";
  const myAddr = () => S.meta.myAddr || "";
  const charAddr = id => S.meta.charAddrs[id] || "";
  const isAddr = s => /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(String(s || "").trim());
  function me() { return { kind: "me", name: S.meta.myName || herName(), addr: myAddr() }; }
  function charParty(id) { const c = charById(id) || {}; return { kind: "char", charId: id, name: c.name || "TA", addr: charAddr(id) }; }
  /** 显示用：名字、头像 */
  function nameOf(p) { if (!p) return ""; if (p.kind === "me") return "我"; if (p.kind === "char") return (charById(p.charId) || {}).name || p.name; return p.name || p.addr || "未知"; }
  function avatarHtml(p, size) {
    const cls = `ava${size ? " " + size : ""}`;
    if (!p) return `<div class="${cls}"></div>`;
    if (p.kind === "char") { const c = charById(p.charId); if (c && c.avatar) return `<div class="${cls}"><img src="${esc(c.avatar)}" alt=""></div>`; }
    if (p.kind === "me" && S.identity.avatarUrl) return `<div class="${cls}"><img src="${esc(S.identity.avatarUrl)}" alt=""></div>`;
    if (p.kind === "sys" && p.color) return `<div class="${cls}" style="background:${esc(p.color)};font-size:${String(p.short || "").length > 2 ? 10 : 14}px">${esc(p.short || (p.name || "?").slice(0, 1))}</div>`;
    if (p.kind === "sys" && p.brand) { const b = BRANDS[p.brand]; if (b) return `<div class="${cls}" style="background:${b.color}">${esc(b.short || b.name.slice(0, 1))}</div>`; }
    const n = nameOf(p); return `<div class="${cls}" style="background:${colorFor(n)}">${esc((n || "?").replace(/^[^\p{L}\p{N}]+/u, "").slice(0, 1) || "?")}</div>`;
  }
  /** 一个人的唯一键（联系人页、往来都靠它） */
  const personKey = p => !p ? "" : p.kind === "char" ? `c:${p.charId}` : p.kind === "me" ? "me" : `n:${(p.addr || p.name || "").toLowerCase()}`;
  const otherOf = m => m.from && m.from.kind === "me" ? m.to : m.from;

  // ───────────────────────── 图片 ─────────────────────────
  async function mediaUrl(ref) {
    if (!ref) return ""; if (S.mediaCache.has(ref)) return S.mediaCache.get(ref);
    for (let i = 0; i < 2; i++) { try { const r = await api.media.get({ ref }); if (r && r.dataUrl) { S.mediaCache.set(ref, r.dataUrl); if (S.mediaCache.size > 60) S.mediaCache.delete(S.mediaCache.keys().next().value); return r.dataUrl; } } catch (e) { /* 再试一次 */ } }
    return "";
  }
  const refSrc = ref => S.mediaCache.has(ref) ? `src="${esc(S.mediaCache.get(ref))}"` : `data-ref="${esc(ref)}"`;
  function hydrate(root) {
    root.querySelectorAll("img[data-ref]").forEach(async img => { const url = await mediaUrl(img.dataset.ref); if (url) { img.src = url; img.removeAttribute("data-ref"); } });
  }
  function shrink(dataUrl, size = 1000) {
    return new Promise(res => { const img = new Image(); img.onload = () => { const k = Math.min(1, size / Math.max(img.width, img.height)); const cv = document.createElement("canvas"); cv.width = img.width * k; cv.height = img.height * k; cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL("image/jpeg", .86)); }; img.onerror = () => res(dataUrl); img.src = dataUrl; });
  }
  async function pickImage() {
    const r = await api.media.pick({ accept: "image/*", multiple: false, limit: 1 });
    const f = r && (r.file || (r.files || [])[0]); if (!f) return null;
    const d = await shrink(f.dataUrl); const st = await api.media.put({ dataUrl: d }); S.mediaCache.set(st.ref, d); return st.ref;
  }

  // ───────────────────────── 记忆 ─────────────────────────
  function attText(att) {
    const xs = (att || []).map(a => a.kind === "photo" ? `照片「${a.desc || "一张照片"}」` : a.kind === "song" ? `歌《${a.title}》${a.artist ? " - " + a.artist : ""}` : a.kind === "card" ? `贺卡「${(CARDS.STYLES[a.style] || {}).name || "贺卡"}」${cardWords(a) ? `，卡上写着：${cardWords(a)}` : ""}` : "").filter(Boolean);
    return xs.length ? `（附件：${xs.join("；")}）` : "";
  }
  function cardWords(a) {
    const st = CARDS.STYLES[a.style]; if (!st) return "";
    return st.fields.map(fd => (a.f && a.f[fd.k]) || (a.style === "season" ? "" : fd.def)).filter(Boolean).join(" / ").replace(/\n/g, " ");
  }
  /** 原样写进记忆：她说不用总结 */
  function remember(m) {
    if (m.memDone) return;
    const ch = m.from.kind === "char" ? m.from.charId : m.to && m.to.kind === "char" ? m.to.charId : null;
    m.memDone = true; saveMail(m);
    if (!ch || !api.memory || !api.memory.addTimeline) return;
    const her = herName();
    const head = m.from.kind === "char" ? `我给${her}发了一封邮件。` : `${her}给我发了一封邮件。`;
    const summary = `${head}\n主题：${m.subject || "（无主题）"}\n${m.body || ""}${attText(m.att) ? "\n" + attText(m.att) : ""}`;
    api.memory.addTimeline({ characterId: ch, appLabel: "邮箱", detail: "mail", summary, appEventId: m.id, createdAt: m.at }).catch(e => console.warn(e));
  }
  /** 永久删掉 / 改了内容：他记得的那封也删掉 */
  function forget(m) {
    const ch = m.from.kind === "char" ? m.from.charId : m.to && m.to.kind === "char" ? m.to.charId : null;
    if (!ch || !m.memDone || !api.memory || !api.memory.deleteTimeline) return;
    api.memory.deleteTimeline({ characterId: ch, appEventId: m.id }).catch(e => console.warn(e));
  }

  // ───────────────────────── 推广和更新（模板，不花 API） ─────────────────────────
  const BRANDS = {
    meituan: { name: "美团", color: "#ffc300", ink: "#222", short: "美", addr: "noreply@meituan.com" },
    taobao: { name: "淘宝", color: "#ff5000", short: "淘", addr: "service@taobao.com" },
    netease: { name: "网易云音乐", color: "#e60026", short: "云", addr: "music@service.netease.com" },
    jd: { name: "京东", color: "#e1251b", short: "京", addr: "newsletter@jd.com" },
    xhs: { name: "小红书", color: "#ff2442", short: "书", addr: "no-reply@xiaohongshu.com" },
    bili: { name: "哔哩哔哩", color: "#fb7299", short: "B", addr: "noreply@bilibili.com" },
    luckin: { name: "瑞幸咖啡", color: "#16336c", short: "瑞", addr: "member@luckincoffee.com" },
    starbucks: { name: "星巴克", color: "#00704a", short: "星", addr: "starbucks@e.starbucks.com.cn" },
    heytea: { name: "喜茶", color: "#1a1a1a", short: "喜", addr: "go@heytea.com" },
    ctrip: { name: "携程旅行", color: "#287dfa", short: "携", addr: "noreply@ctrip.com" },
    keep: { name: "Keep", color: "#584f60", short: "K", addr: "hello@keep.com" },
    douban: { name: "豆瓣", color: "#42bd56", short: "豆", addr: "noreply@douban.com" },
    zhihu: { name: "知乎", color: "#0066ff", short: "知", addr: "noreply@zhihu.com" },
    pdd: { name: "拼多多", color: "#e02e24", short: "拼", addr: "service@pinduoduo.com" },
    eleme: { name: "饿了么", color: "#0097ff", short: "饿", addr: "noreply@ele.me" },
    hema: { name: "盒马", color: "#1677ff", short: "盒", addr: "service@freshhema.com" },
    sf: { name: "顺丰速运", color: "#1a1a1a", short: "顺", addr: "service@sf-express.com" },
    zto: { name: "中通快递", color: "#1d64b1", short: "中", addr: "noreply@zto.com" },
    alipay: { name: "支付宝", color: "#1677ff", short: "支", addr: "service@mail.alipay.com" },
    cmb: { name: "招商银行", color: "#c8152d", short: "招", addr: "creditcard@message.cmbchina.com" },
    apple: { name: "Apple", color: "#111", short: "", addr: "no_reply@email.apple.com" },
    rail: { name: "铁路12306", color: "#1f62b0", short: "铁", addr: "12306@rails.com.cn" },
    weread: { name: "微信读书", color: "#2a72e5", short: "读", addr: "weread@qq.com" },
    mail: { name: "邮箱团队", color: "#c58af9", short: "邮", addr: "team@mail.local" },
  };
  const R = {
    food: ["麻辣烫", "螺蛳粉", "黄焖鸡米饭", "烤肉拌饭", "酸菜鱼", "生煎包", "冒菜", "轻食沙拉", "牛肉面", "炸鸡汉堡", "寿司拼盘", "煲仔饭", "杨枝甘露", "芋泥波波奶茶", "烤冷面", "砂锅粥"],
    shop: ["老街麻辣烫", "阿姨家的小厨房", "一碗好面", "深夜食堂", "小林寿司", "陈记烧腊", "春风轻食", "王婆大虾", "好运来炸鸡", "巷子里的粥铺"],
    item: ["羊毛开衫", "加湿器", "落地灯", "香薰蜡烛", "帆布包", "毛绒拖鞋", "保温杯", "蓝牙耳机", "护手霜", "电热毯", "珊瑚绒睡衣", "格子围巾", "马克杯", "手账本", "拍立得相纸", "四件套"],
    song: [["晴天", "周杰伦"], ["后来", "刘若英"], ["小幸运", "田馥甄"], ["夜空中最亮的星", "逃跑计划"], ["稻香", "周杰伦"], ["想自由", "林宥嘉"], ["爱人错过", "告五人"], ["慢冷", "梁静茹"], ["那些年", "胡夏"], ["如果可以", "韦礼安"], ["起风了", "买辣椒也用券"], ["少年", "梦然"]],
    drink: ["生椰拿铁", "橙C美式", "厚乳拿铁", "多肉葡萄", "芝芝莓莓", "焦糖玛奇朵", "抹茶拿铁"],
    city: ["大理", "厦门", "成都", "青岛", "杭州", "西安", "三亚", "长沙", "重庆", "苏州", "哈尔滨", "丽江"],
    book: ["《我与地坛》", "《小王子》", "《云边有个小卖部》", "《额尔古纳河右岸》", "《人间草木》", "《一句顶一万句》", "《夜晚的潜水艇》"],
    up: ["何同学", "影视飓风", "老番茄", "罗翔说刑法", "小约翰可汗", "盗月社食遇记", "半佛仙人"],
  };
  const money = (a, b) => (rand(a * 100, b * 100) / 100).toFixed(2);
  const tail4 = () => String(rand(1000, 9999));
  const sfNo = () => `SF${rand(1000, 9999)}${rand(100000, 999999)}${rand(10, 99)}`;
  function nearDouble11() { const d = new Date(); const m = d.getMonth() + 1, day = d.getDate(); return (m === 10 && day >= 20) || (m === 11 && day <= 11); }
  /** 推广：{ b: 品牌, s: 主题, h: 大字, l: 几行, btn } */
  const PROMOS = [
    () => { const f = pick(R.food); return { b: "meituan", s: `你常点的${f}今天满30减12`, h: `嘴馋了吗？`, l: [`你常点的「${pick(R.shop)}」${f}今日特惠`, `满 30 减 12 · 限今天 23:59 前`], btn: "去点一份" }; },
    () => ({ b: "meituan", s: "你有 3 个红包即将过期", h: "红包快过期啦", l: ["外卖红包 ×2、到店红包 ×1", `最高可减 ${rand(8, 20)} 元，明天 0 点失效`], btn: "去使用" }),
    () => { const it = pick(R.item); return { b: "taobao", s: `你收藏的「${it}」降价了`, h: "收藏的宝贝降价啦", l: [`${it}`, `比你收藏时便宜了 ¥${rand(8, 60)}`, "库存不多了"], btn: "去看看" }; },
    () => ({ b: "taobao", s: "你的购物车还在等你", h: "购物车里的宝贝想你了", l: [`${pick(R.item)}、${pick(R.item)} 等 ${rand(3, 9)} 件`, "今日下单享跨店满减"], btn: "去结算" }),
    () => { const [t, a] = pick(R.song); return { b: "netease", s: "你的每日推荐已更新", h: "今天的歌单好了", l: [`第一首：《${t}》- ${a}`, `根据你最近常听的歌，为你挑选了 30 首`], btn: "去听听" }; },
    () => ({ b: "netease", s: "黑胶 VIP 限时 5 折", h: "黑胶 VIP · 限时 5 折", l: ["无损音质、会员专属歌曲", "首月仅需 ¥7.5"], btn: "立即开通" }),
    () => ({ b: "jd", s: "你关注的商品到货了", h: "到货提醒", l: [`你关注的 ${pick(R.item)} 已到货`, "京东自营 · 次日达"], btn: "去购买" }),
    () => ({ b: "xhs", s: "你可能感兴趣的笔记", h: "今日份灵感", l: [`「${pick(R.city)} 三天两夜 citywalk 路线」`, `「秋冬氛围感穿搭｜${pick(R.item)}怎么搭」`, `「打工人 10 分钟${pick(R.food)}」`], btn: "去看看" }),
    () => ({ b: "bili", s: `你关注的 UP 主「${pick(R.up)}」更新了`, h: "你关注的 UP 主更新啦", l: [`${pick(R.up)}：新视频已发布`, "快去当第一个三连的人"], btn: "去看看" }),
    () => { const d = pick(R.drink); return { b: "luckin", s: `${d} 9.9 元喝`, h: `${d} ¥9.9`, l: ["每周四限定", "领券后下单，到店自取"], btn: "领券" }; },
    () => ({ b: "starbucks", s: "你的星星快过期了", h: "你有星星即将过期", l: [`${rand(3, 12)} 颗星星将在本月底过期`, "可兑换一杯中杯饮品"], btn: "去兑换" }),
    () => ({ b: "heytea", s: "秋天的第一杯喜茶", h: "新品上市", l: [`${pick(R.drink)} 回归`, "喜茶 GO 小程序下单立减 3 元"], btn: "去下单" }),
    () => { const c = pick(R.city); return { b: "ctrip", s: `${c}机票低至 ${rand(3, 6)} 折`, h: `想去${c}吗`, l: [`往返机票低至 ${rand(3, 6)} 折`, "周末说走就走"], btn: "查看航班" }; },
    () => ({ b: "keep", s: "你已经 7 天没运动啦", h: "该动一动啦", l: ["今天来一节 15 分钟的拉伸吧", "坚持就是胜利 💪"], btn: "开始训练" }),
    () => ({ b: "douban", s: "你可能想看的新片", h: "本周新片", l: [`豆瓣评分 ${(rand(75, 92) / 10).toFixed(1)} 的新片已上映`, `${rand(2, 9)} 位你关注的人标记了想看`], btn: "去看看" }),
    () => ({ b: "zhihu", s: "你关注的问题有了新回答", h: "新回答", l: ["「一个人生活久了是什么感觉？」", `${rand(120, 3000)} 人赞同了这个回答`], btn: "去看看" }),
    () => ({ b: "pdd", s: "你有一份免单待领取", h: "恭喜你获得免单资格", l: ["邀请 3 位好友助力即可领取", "仅剩最后 2 小时"], btn: "去领取" }),
    () => ({ b: "eleme", s: "下雨天，热汤面送到家", h: "今天想吃点热乎的", l: [`${pick(R.food)}、${pick(R.food)} 限时满减`, "准时宝 · 超时赔付"], btn: "去点餐" }),
    () => ({ b: "hema", s: "今日鲜：草莓到了", h: "今日鲜", l: ["丹东草莓 · 今天现摘", "30 分钟送到家"], btn: "去买" }),
    () => ({ b: "weread", s: "你的书架上有书更新了", h: "书架更新", l: [`${pick(R.book)} 有 ${rand(2, 30)} 位好友在读`, "本周阅读时长 3 小时 12 分钟"], btn: "继续阅读" }),
  ];
  const PROMOS_D11 = [
    () => ({ b: "taobao", s: "双11 预售开始，定金膨胀", h: "双11 来了", l: ["定金 10 抵 50", `你收藏的 ${pick(R.item)} 已加入预售`], btn: "去付定金" }),
    () => ({ b: "jd", s: "11.11 大促 · 每满 300 减 50", h: "11.11 狂欢", l: ["每满 300 减 50，上不封顶", "晚 8 点开抢"], btn: "去逛逛" }),
    () => ({ b: "taobao", s: "你的双11 购物清单", h: "清单已备好", l: [`${pick(R.item)}、${pick(R.item)}、${pick(R.item)}`, "付尾款时间：11 月 1 日 20:00"], btn: "去看看" }),
  ];
  /** 更新：{ b, s, body } 纯文字的系统通知 */
  const UPDATES = [
    () => { const no = sfNo(); return { b: "sf", s: "您的快件已签收", body: `尊敬的客户：\n\n您的快件 ${no} 已于今天由本人签收，感谢使用顺丰速运。\n\n如有疑问请致电 95338。` }; },
    () => ({ b: "sf", s: "您的快件正在派送中", body: `尊敬的客户：\n\n您的快件 ${sfNo()} 正在派送途中，快递员将尽快为您送达，请保持电话畅通。` }),
    () => ({ b: "zto", s: "包裹已到驿站", body: `您好，您的包裹已到达菜鸟驿站，取件码 ${rand(1, 9)}-${rand(1, 4)}-${rand(1000, 9999)}，请于 3 天内取件。` }),
    () => ({ b: "alipay", s: "支付宝余额宝收益到账", body: `你的余额宝昨日收益 ${money(0.3, 3)} 元已到账。\n\n累计收益 ${money(20, 300)} 元。` }),
    () => ({ b: "cmb", s: `招商银行信用卡消费提醒`, body: `您尾号 ${tail4()} 的信用卡于今天消费人民币 ${money(18, 260)} 元。\n\n如非本人操作请致电 95555。` }),
    () => ({ b: "apple", s: "你的订阅即将续订", body: `你好：\n\n你的 iCloud+ 订阅（50 GB）将于 ${new Date(Date.now() + 3 * 864e5).getMonth() + 1} 月 ${new Date(Date.now() + 3 * 864e5).getDate()} 日自动续订，费用 ¥6.00。\n\n如需取消，请前往「设置」>「Apple ID」>「订阅」。` }),
    () => ({ b: "netease", s: "你的会员将在 3 天后到期", body: "你的黑胶 VIP 将在 3 天后到期，续费后可继续享受无损音质和会员专属歌曲。" }),
    () => ({ b: "rail", s: "网上购票系统-用户注册信息核验", body: "尊敬的用户：\n\n为保障您的账户安全，请定期核验手机号码。\n\n此邮件为系统自动发送，请勿回复。" }),
    () => ({ b: "taobao", s: "你的订单已发货", body: `你购买的「${pick(R.item)}」已发货，预计 ${rand(1, 3)} 天内送达。\n\n物流单号：${sfNo()}` }),
    () => ({ b: "meituan", s: "你的订单已送达", body: `你在「${pick(R.shop)}」点的${pick(R.food)}已送达，祝你用餐愉快！\n\n吃得满意的话，记得给骑手一个好评哦。` }),
  ];
  function monthBill() { const d = new Date(); const m = d.getMonth() === 0 ? 12 : d.getMonth(); return { b: "alipay", s: `你的 ${m} 月账单已出`, body: `${m} 月你共支出 ${money(800, 4000)} 元，收入 ${money(0, 800)} 元。\n\n支出最多的是「餐饮美食」，占 ${rand(28, 46)}%。\n\n打开支付宝查看完整账单。` }; }

  function makePromo(at) {
    const pool = nearDouble11() && Math.random() < .45 ? PROMOS_D11 : PROMOS;
    const p = pick(pool)(); const b = BRANDS[p.b];
    return { id: uid("m"), scope: S.identity.id, folder: "inbox", cat: "promo", from: { kind: "sys", brand: p.b, name: b.name, addr: b.addr }, to: me(), subject: p.s, body: "", promo: { h: p.h, l: p.l, btn: p.btn }, at, status: "ok", read: false, star: false, att: [], thread: null };
  }
  function makeUpdate(at, tpl) {
    const p = (tpl || pick(UPDATES))(); const b = BRANDS[p.b];
    return { id: uid("m"), scope: S.identity.id, folder: "inbox", cat: "update", from: { kind: "sys", brand: p.b, name: b.name, addr: b.addr }, to: me(), subject: p.s, body: p.body, at, status: "ok", read: false, star: false, att: [], thread: null };
  }
  /** 按真实时间补推广和更新：隔得越久越多，时间铺开在空档里 */
  function fillSystemMail() {
    if (!S.meta.promos) return;
    const now = Date.now(); const first = !S.meta.lastSysAt; const last = first ? now - 30 * 3600e3 : ts(S.meta.lastSysAt);
    const hours = (now - last) / 3600e3; if (hours < 2 && !first) return;
    const nP = Math.min(6, Math.floor(hours / 7 + Math.random())), nU = Math.min(3, Math.floor(hours / 14 + Math.random()));
    const at = () => new Date(last + Math.random() * (now - last)).toISOString();
    const add = [];
    for (let i = 0; i < nP; i++) add.push(makePromo(at()));
    for (let i = 0; i < nU; i++) add.push(makeUpdate(at()));
    // 每月月初来一封账单（每月一次）
    const d = new Date(); const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (d.getDate() <= 5 && S.meta.billMonth !== key) { S.meta.billMonth = key; add.push(makeUpdate(new Date(now - rand(1, 60) * 60e3).toISOString(), monthBill)); }
    S.meta.lastSysAt = nowIso(); saveMeta();
    for (const m of add) { S.mails.push(m); saveMail(m); }
    pruneSystem();
  }
  /** 推广和更新只留最近的 60 封（没加星标的） */
  function pruneSystem() {
    const sys = S.mails.filter(m => m.from.kind === "sys" && !m.star && m.cat !== "primary").sort((a, b) => ts(b.at) - ts(a.at));
    for (const m of sys.slice(60)) { S.mails = S.mails.filter(x => x !== m); dbDelete(COL.mails, m.id); }
  }

  // ───────────────────────── AI ─────────────────────────
  function logAi(entry) {
    S.debug = [{ at: nowIso(), ...entry, text: String(entry.text || "").slice(0, 6000) }, ...S.debug].slice(0, 10);
    dbUpsert(COL.meta, { id: "debug_log", entries: S.debug }).catch(() => {});
  }
  function toast(msg) { document.querySelectorAll(".toast").forEach(x => x.remove()); const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 2000); }
  const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];
  function nowLine() { const d = new Date(); return `【现在】${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK_ZH[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}。`; }
  const CARD_LIST = () => CARDS.ORDER.map(k => `${CARDS.STYLES[k].name}（${CARDS.STYLES[k].occ}）`).join("、");
  const FORMAT = ask => `【输出格式】只输出下面这一块，字段名照抄，不要解释、不要 markdown：
===邮件===
${ask ? "邮箱：你的邮箱地址（按你的人设、年代和习惯起一个，只写地址）\n" : ""}主题：邮件主题
照片：随信附的照片的画面描述，多张用｜隔开；不附就写无
歌：附一首歌就写「歌名 - 歌手」，只写真实存在的歌；不附就写无
贺卡：寄贺卡就写「款式｜卡上的字」，款式只能从这些里选：${CARD_LIST()}；场合不合适或不想寄就写无
正文：
（邮件正文，可以多段）`;
  /** 这封信写多长：大多是长信，偶尔短一点（代码掷骰子，不让模型每次都一个长度） */
  const lenLine = () => Math.random() < .7 ? "【这封的长度】长信：正文至少三四段、三百字以上，想说的多就写得更长。" : "【这封的长度】短一点的信：一两段、一两百字，但仍然是一封信，不是一两句话的聊天消息。";
  const MAIL_RULE = `【写邮件的规矩】这是邮件，不是聊天消息：有主题，正文成段，有称呼有落款都按你的习惯来。写什么、什么语气全按你的人设和你们现在的关系。只写你记得的、聊过的、你自己这边的事，不编她没做过的事，不编你记忆里没有的共同经历。附件可有可无，大部分邮件不带附件。`;

  /** 一封信的往来历史（同一个 thread，最近几封） */
  function threadText(thread, uptoAt) {
    const xs = S.mails.filter(m => m.thread === thread && visible(m) && m.folder !== "draft" && ts(m.at) <= uptoAt).sort((a, b) => ts(a.at) - ts(b.at)).slice(-6);
    return xs.map(m => `【${m.from.kind === "me" ? herName() : nameOf(m.from)} ${fmtFull(m.at)}】主题：${m.subject || "（无主题）"}\n${m.body || ""}${attText(m.att) ? "\n" + attText(m.att) : ""}`).join("\n\n");
  }
  function parseMail(raw) {
    const text = String(raw || "").replace(/```[a-z]*\n?/g, "").replace(/\r/g, "");
    const seg = (text.split(/===邮件===/)[1] || text).split(/===结束===/)[0];
    const f = {}; let cur = null;
    for (const line of seg.split("\n")) {
      const mm = cur === "正文" ? null : line.match(/^\s*(邮箱|主题|照片|歌|贺卡|正文)\s*[：:]\s*(.*)$/);
      if (mm) { cur = mm[1]; f[cur] = mm[2]; } else if (cur) f[cur] = (f[cur] ? f[cur] + "\n" : "") + line;
    }
    for (const k in f) f[k] = String(f[k]).replace(/^\n+|\n+$/g, "").trim();
    return f;
  }
  function attFrom(f) {
    const att = [];
    if (!none(f["照片"])) for (const d of String(f["照片"]).split(/[｜|]/).map(s => s.trim()).filter(Boolean).slice(0, 4)) att.push({ kind: "photo", desc: d.slice(0, 200) });
    if (!none(f["歌"])) { const [t, a] = String(f["歌"]).replace(/[《》]/g, "").split(/\s*[-—–]\s*/); if (t) att.push({ kind: "song", title: t.trim().slice(0, 40), artist: (a || "").trim().slice(0, 30) }); }
    if (!none(f["贺卡"])) { const [n, ...rest] = String(f["贺卡"]).split(/[｜|]/); const style = CARDS.styleByName(n); if (style) { const k = CARDS.mainField(style); const words = rest.join("|").trim(); att.push({ kind: "card", style, f: k && words ? { [k]: words.slice(0, 300) } : {} }); } }
    return att;
  }
  async function aiGenerate(charId, scene, instruction, label, vision) {
    const job = uid("job"); S.jobs.add(job); renderTop();
    try {
      const payload = { characterId: charId, appTags: ["nox_mail", scene], instruction, ...(vision ? { appMessages: vision } : {}) };
      let r;
      try { r = await api.ai.generate(payload); } catch (e) { if (!vision) throw e; delete payload.appMessages; r = await api.ai.generate(payload); }
      const text = (r && r.text) || ""; logAi({ label, ok: true, text }); return text;
    } catch (e) { console.error(e); logAi({ label, ok: false, error: String((e && e.message) || e) }); return null; }
    finally { S.jobs.delete(job); renderTop(); }
  }
  async function aiChat(system, prompt, label) {
    const job = uid("job"); S.jobs.add(job); renderTop();
    try { const r = await api.ai.chat({ system, prompt, timeoutMs: 90000 }); const text = (r && r.text) || ""; logAi({ label, ok: true, text }); return text; }
    catch (e) { console.error(e); logAi({ label, ok: false, error: String((e && e.message) || e) }); return null; }
    finally { S.jobs.delete(job); renderTop(); }
  }
  /** char 写的信 → 存成一封（pending 的到点才出现） */
  function storeIncoming(f, from, at, thread, extra) {
    if (from.kind === "char" && !charAddr(from.charId) && isAddr(f["邮箱"])) { S.meta.charAddrs[from.charId] = f["邮箱"].trim(); saveMeta(); from.addr = f["邮箱"].trim(); }
    if (from.kind === "npc" && !from.addr && isAddr(f["邮箱"])) from.addr = f["邮箱"].trim();
    const body = (f["正文"] || "").trim(); if (!body) return null;
    const m = { id: uid("m"), scope: S.identity.id, folder: "inbox", cat: "primary", from, to: me(), subject: (f["主题"] || "（无主题）").slice(0, 80), body, at, status: ts(at) > Date.now() ? "pending" : "ok",
      read: false, star: false, att: attFrom(f), thread: thread || null, ...(extra || {}) };
    if (!m.thread) m.thread = m.id;
    S.mails.push(m); saveMail(m);
    if (m.status === "ok") arrive(m);
    return m;
  }
  /** 一封信到了：写记忆 */
  function arrive(m) { if (m.from.kind === "char") remember(m); }

  /** 她的信寄出去以后：char / 路人回信（到达时间往后推） */
  async function genReply(mine) {
    const to = mine.to; if (!to || (to.kind !== "char" && to.kind !== "npc")) return;
    mine.replyTries = (mine.replyTries || 0) + 1; saveMail(mine);
    // 回信在路上的时间：设置里开了「立刻到」就写完马上到
    const delay = (Math.random() < .5 ? rand(12, 60) : rand(60, 240)) * 60e3;
    const at = () => S.meta.instant ? nowIso() : new Date(Math.max(ts(mine.at) + delay, Date.now() + 60e3)).toISOString();
    const hist = threadText(mine.thread, ts(mine.at));
    let f = null;
    if (to.kind === "char") {
      const c = charById(to.charId); if (!c) return;
      const photo = (mine.att || []).find(a => a.kind === "photo" && a.ref);
      const vision = photo ? [{ role: "user", content: "（她邮件里附的照片）", image: await mediaUrl(photo.ref) }] : null;
      const ins = [nowLine(), MAIL_RULE, lenLine(), `【这次要做的】${herName()}给你（${c.name}）发了一封邮件，你现在回她。下面是你们这一串邮件，最后一封是她刚寄来的。${myAddr() ? `她的邮箱是 ${myAddr()}。` : ""}`, hist, mine.att.some(a => a.kind === "card") ? "她寄了贺卡，回信里可以提到。" : "", FORMAT(!charAddr(to.charId))].filter(Boolean).join("\n\n");
      const raw = await aiGenerate(to.charId, "reply", ins, `${c.name}回信`, vision); if (raw == null) return;
      f = parseMail(raw);
      if (!storeIncoming(f, charParty(to.charId), at(), mine.thread, { replyOf: mine.id })) return;
    } else {
      const sys = `你扮演收件人「${to.name || to.addr}」${to.addr ? `（邮箱 ${to.addr}）` : ""}，替这个身份回一封邮件。按这个身份平时回邮件的方式写：客服就是客服的口吻，机构就是机构的格式，普通人就是普通人。只回应邮件里写到的内容，不编寄信人没说过的事。\n\n${FORMAT(!to.addr)}`;
      const raw = await aiChat(sys, `${nowLine()}\n\n寄信人是「${S.meta.myName || herName()}」${myAddr() ? `（${myAddr()}）` : ""}。下面是这一串邮件，最后一封是刚收到的：\n\n${hist}`, `${to.name || to.addr}回信`);
      if (raw == null) return; f = parseMail(raw);
      if (!storeIncoming(f, { kind: "npc", name: to.name, addr: to.addr }, at(), mine.thread, { replyOf: mine.id })) return;
    }
    mine.replied = true; saveMail(mine); renderAll();
  }

  /** 主动来信：挑一个 char 单独写，按多久没写排 */
  const FREQ_H = { often: 8, sometimes: 20, rare: 48 };
  function proactiveDue() {
    const gap = (FREQ_H[S.meta.freq] || 20) * 3600e3;
    if (!S.meta.lastProactiveAt) { S.meta.lastProactiveAt = new Date(Date.now() - gap * .6).toISOString(); saveMeta(); return false; }
    return Date.now() - ts(S.meta.lastProactiveAt) >= gap;
  }
  function pickWriter() {
    const xs = activeChars().filter(c => !S.meta.quiet.includes(c.id));
    if (!xs.length) return null;
    xs.sort((a, b) => ts(S.meta.lastByChar[a.id] || 0) - ts(S.meta.lastByChar[b.id] || 0));
    return xs[0];
  }
  async function genProactive(c, manual) {
    const prev = S.mails.filter(m => visible(m) && (personKey(m.from) === `c:${c.id}` || personKey(m.to) === `c:${c.id}`)).sort((a, b) => ts(b.at) - ts(a.at)).slice(0, 3);
    const ins = [nowLine(), MAIL_RULE, lenLine(), `【这次要做的】你（${c.name}）主动给${herName()}写一封邮件${myAddr() ? `，她的邮箱是 ${myAddr()}` : ""}。写什么从你最近的生活、你们聊过的事、想对她说但没在聊天里说的话里找。`,
      prev.length ? `你们最近几封邮件（别重复写一样的事）：\n${prev.map(m => `· ${m.from.kind === "me" ? "她写给你" : "你写给她"}《${m.subject}》${fmtFull(m.at)}`).join("\n")}` : "", FORMAT(!charAddr(c.id))].filter(Boolean).join("\n\n");
    const raw = await aiGenerate(c.id, "letter", ins, `${c.name}来信`); if (raw == null) { if (manual) toast("没写成，稍后再试"); return null; }
    const f = parseMail(raw);
    // 时间铺在空档里：上次打开到现在之间
    const lo = Math.max(ts(S.meta.lastOpenAt || 0), Date.now() - 6 * 3600e3);
    const at = manual ? nowIso() : new Date(lo + Math.random() * Math.max(0, Date.now() - lo)).toISOString();
    const spam = !manual && Math.random() < .08;
    const m = storeIncoming(f, charParty(c.id), at, null, spam ? { folder: "spam" } : null);
    if (!m) { if (manual) toast("没写成，稍后再试"); return null; }
    S.meta.lastByChar[c.id] = nowIso(); saveMeta(); renderAll();
    return m;
  }

  // ───────────────────────── 时间推进 ─────────────────────────
  const visible = m => m.status === "draft" || m.status === "scheduled" || ts(m.at) <= Date.now();
  let ticking = false;
  /** 爱豆小手机：宿主往信箱里塞的公司来信，打开着也要收得到 */
  async function pullIdolMail() {
    const rows = await dbList(COL.mails); let got = false;
    for (const r of rows) {
      if (!r.idol) continue;
      const have = S.mails.find(m => m.id === r.id);
      if (!have) { S.mails.push({ ...r, att: r.att || [] }); got = true; }
      else if (JSON.stringify(have.idol) !== JSON.stringify(r.idol) && r.idol.action && have.idol.action && r.idol.action.nodeId && !have.idol.action.nodeId) { have.idol = r.idol; got = true; }
    }
    if (got) renderAll();
    return got;
  }
  async function tick() {
    if (ticking) return; ticking = true;
    try {
      const now = Date.now(); let changed = false;
      for (const m of S.mails) {
        if (m.status === "pending" && ts(m.at) <= now) { m.status = "ok"; saveMail(m); arrive(m); changed = true; }
        if (m.status === "scheduled" && ts(m.at) <= now) { m.status = "ok"; m.folder = "sent"; saveMail(m); if (m.to.kind === "char") remember(m); changed = true; }
      }
      if (changed) renderAll();
      fillSystemMail();
      // 寄出去还没回的：补回信（失败最多试 3 次）
      for (const m of S.mails.filter(x => x.from.kind === "me" && x.status === "ok" && x.folder !== "draft" && x.needReply && !x.replied && (x.replyTries || 0) < 3 && ts(x.at) <= now)) await genReply(m);
      if (await pullIdolMail()) changed = true;
      if (!S.idol && proactiveDue()) { const c = pickWriter(); S.meta.lastProactiveAt = nowIso(); saveMeta(); if (c) await genProactive(c); }
      renderAll();
    } finally { ticking = false; }
  }

  // ───────────────────────── 列表 ─────────────────────────
  const FOLDERS = {
    inbox: { name: "收件箱", icon: "inbox", test: m => m.folder === "inbox" && m.cat === "primary" && m.from.kind !== "me" },
    promo: { name: "推广", icon: "tag", test: m => m.folder === "inbox" && m.cat === "promo" },
    update: { name: "更新", icon: "info", test: m => m.folder === "inbox" && m.cat === "update" },
    starred: { name: "已加星标", icon: "star", test: m => m.star && m.folder !== "trash" },
    scheduled: { name: "已定时", icon: "clock", test: m => m.status === "scheduled" },
    sent: { name: "已发送", icon: "send", test: m => m.from.kind === "me" && m.status === "ok" && m.folder === "sent" },
    draft: { name: "草稿", icon: "draft", test: m => m.folder === "draft" },
    spam: { name: "垃圾邮件", icon: "spam", test: m => m.folder === "spam" },
    trash: { name: "已删除", icon: "trash", test: m => m.folder === "trash" },
  };
  /** 按 thread 合成会话：每个会话显示最新那封 */
  function threadsOf(test) {
    const hit = S.mails.filter(m => visible(m) && test(m)); const map = new Map();
    for (const m of hit) { const k = m.thread || m.id; const cur = map.get(k); if (!cur || ts(m.at) > ts(cur.at)) map.set(k, m); }
    return [...map.values()].sort((a, b) => ts(b.at) - ts(a.at)).map(m => {
      const all = m.thread ? S.mails.filter(x => x.thread === m.thread && visible(x) && x.folder !== "draft" && x.folder !== "trash") : [m];
      const first = all.slice().sort((a, b) => ts(a.at) - ts(b.at))[0] || m;
      return { m, subject: first.subject, n: all.length, unread: all.some(x => !x.read && x.from.kind !== "me"), people: [...new Set(all.sort((a, b) => ts(a.at) - ts(b.at)).map(x => x.from.kind === "me" ? "我" : nameOf(x.from)))] };
    });
  }
  const unreadCount = key => threadsOf(FOLDERS[key].test).filter(t => t.unread).length;

  function rowHtml(t) {
    const m = t.m; const who = m.from.kind === "me" ? `收件人：${nameOf(m.to)}` : t.people.join(", ");
    const chips = (m.att || []).slice(0, 3).map(a => a.kind === "photo" ? `<span class="chip">${I.image}<em>${esc((a.desc || "照片").slice(0, 8))}</em></span>` : a.kind === "song" ? `<span class="chip">${I.music}<em>${esc(a.title)}</em></span>` : `<span class="chip ck">${I.card}<em>${esc((CARDS.STYLES[a.style] || {}).name || "贺卡")}</em></span>`).join("");
    const preview = m.promo ? m.promo.l.join(" · ") : (m.body || "").replace(/\s+/g, " ");
    return `<div class="row${t.unread ? " u" : ""}" data-act="open" data-id="${m.id}">
      <div class="row-ava">${avatarHtml(m.from.kind === "me" ? m.to : m.from)}</div>
      <div class="row-bd"><div class="l1"><span class="who">${esc(who)}${t.n > 1 ? ` <i>${t.n}</i>` : ""}</span>${m.status === "scheduled" ? `<span class="sched">${I.clock}</span>` : ""}<span class="tm">${esc(fmtList(m.at))}</span></div>
      <div class="sub">${m.folder === "draft" ? `<b class="red">草稿</b> ` : ""}${esc(t.subject || m.subject || "（无主题）")}</div>
      <div class="pv"><span>${esc(preview)}</span><button class="star-btn" data-act="star" data-id="${m.id}">${m.star ? I.starOn : I.star}</button></div>
      ${chips ? `<div class="chips">${chips}</div>` : ""}</div></div>`;
  }
  function catRow(key, color) {
    const ts_ = threadsOf(FOLDERS[key].test); if (!ts_.length) return "";
    const n = ts_.filter(t => t.unread).length; const names = [...new Set(ts_.slice(0, 6).map(t => nameOf(t.m.from)))].slice(0, 3).join("、");
    return `<div class="cat" data-act="folder" data-f="${key}"><div class="cat-ic" style="color:${color}">${I[FOLDERS[key].icon]}</div><div class="cat-bd"><b>${FOLDERS[key].name}</b><small>${esc(names)}</small></div>${n ? `<span class="pill" style="background:${color}">${n} 封新邮件</span>` : ""}</div>`;
  }

  // ───────────────────────── 页面 ─────────────────────────
  const root = () => $("#app");
  /** 页面栈：底层是收件箱，上面一层层推 */
  function push(kind, data) { S.stack.push({ kind, data: data || {}, el: null }); renderTop(true); }
  function pop() { const p = S.stack.pop(); if (p && p.el) { p.el.classList.add("out"); setTimeout(() => p.el.remove(), 200); } renderAll(); }
  function renderAll() { renderBase(); for (const p of S.stack) renderPage(p); }
  function renderTop(anim) { if (!S.stack.length) return renderBase(); const p = S.stack[S.stack.length - 1]; renderPage(p, anim); }

  function renderBase() {
    let el = $("#base"); if (!el) { el = document.createElement("div"); el.id = "base"; el.className = "page base"; root().appendChild(el); }
    const busy = S.jobs.size ? `<div class="busy"></div>` : "";
    if (S.tab === "cards") { el.innerHTML = cardsTabHtml() + navHtml() + busy; hydrate(el); return; }
    const f = FOLDERS[S.folder] || FOLDERS.inbox; const list = threadsOf(f.test);
    const head = S.folder === "inbox" ? catRow("promo", "#188038") + catRow("update", "#e37400") : "";
    const tools = S.folder === "trash" && list.length ? `<div class="banner">已删除的邮件不会自动清空<button data-act="empty-trash">清空</button></div>` : S.folder === "spam" && list.length ? `<div class="banner">垃圾邮件里也可能有人给你写的信哦</div>` : "";
    el.innerHTML = `<div class="sbar"><button class="ib" data-act="drawer">${I.menu}</button><div class="sb-q" data-act="search">在邮件中搜索</div><button class="me-ava" data-act="settings">${avatarHtml(me(), "sm")}</button></div>
      <div class="lb">${f.name}</div>${tools}<div class="scroll">${head}${list.map(rowHtml).join("") || `<div class="empty">${S.folder === "inbox" ? "还没有信。<br>可以先写一封给谁，或者等他们来信～" : "这里空空的"}</div>`}<div class="pad-b"></div></div>
      ${S.folder === "inbox" || S.folder === "sent" ? `<button class="fab" data-act="compose">${I.pen}<span>写邮件</span></button>` : `<button class="fab sm" data-act="compose">${I.pen}</button>`}
      ${navHtml()}${busy}`;
    hydrate(el);
  }
  function navHtml() {
    const n = unreadCount("inbox"); const cn = myCards().length;
    return `<div class="bnav"><div class="${S.tab === "mail" ? "on" : ""}" data-act="tab" data-t="mail"><i>${I.mail}${n ? `<u>${n > 99 ? "99+" : n}</u>` : ""}</i>邮件</div>
      <div class="${S.tab === "cards" ? "on" : ""}" data-act="tab" data-t="cards"><i>${S.tab === "cards" ? I.cardFill : I.card}${cn > S.meta.cardsSeen && S.tab !== "cards" ? `<u class="dot"></u>` : ""}</i>卡册</div></div>`;
  }
  /** 卡册：收到和寄出的所有贺卡 */
  function myCards() {
    const out = [];
    for (const m of S.mails) { if (!visible(m) || m.folder === "trash" || m.folder === "draft" || m.status === "scheduled") continue; (m.att || []).forEach((a, i) => { if (a.kind === "card") out.push({ m, a, i }); }); }
    return out.sort((a, b) => ts(b.m.at) - ts(a.m.at));
  }
  function cardsTabHtml() {
    const xs = myCards();
    const tile = x => `<div class="ctile" data-act="view-card" data-id="${x.m.id}" data-i="${x.i}">${CARDS.cardBox(x.a.style, x.a.f, x.a.at || x.m.at, 150, x.a.photoRef ? S.mediaCache.get(x.a.photoRef) : null)}<div class="ct-cap">${x.m.from.kind === "me" ? `寄给 ${esc(nameOf(x.m.to))}` : `来自 ${esc(nameOf(x.m.from))}`} · ${esc(fmtList(x.m.at))}</div></div>`;
    const got = xs.filter(x => x.m.from.kind !== "me"), sent = xs.filter(x => x.m.from.kind === "me");
    return `<div class="topbar"><b>卡册</b><button class="tb-btn" data-act="card-new">${I.pen}寄一张</button></div><div class="scroll">
      ${xs.length ? "" : `<div class="empty">还没有贺卡。<br>写邮件时点回形针就能寄一张～</div>`}
      ${got.length ? `<div class="lb">收到的</div><div class="cgrid">${got.map(tile).join("")}</div>` : ""}
      ${sent.length ? `<div class="lb">寄出的</div><div class="cgrid">${sent.map(tile).join("")}</div>` : ""}<div class="pad-b"></div></div>`;
  }

  function renderPage(p, anim) {
    if (!p.el) { p.el = document.createElement("div"); p.el.className = `page ${p.kind}${anim ? " in" : ""}`; root().appendChild(p.el); if (anim) setTimeout(() => p.el && p.el.classList.remove("in"), 220); }
    const R_ = PAGES[p.kind]; if (R_) { p.el.innerHTML = R_(p) + (S.jobs.size ? `<div class="busy"></div>` : ""); hydrate(p.el); if (R_.after) R_.after(p); }
  }

  const PAGES = {};
  // 抽屉
  PAGES.drawer = () => {
    const item = (k, extra) => { const f = FOLDERS[k]; const n = ["inbox", "spam"].includes(k) ? unreadCount(k) : k === "draft" || k === "scheduled" ? threadsOf(f.test).length : 0;
      return `<div class="fd${S.folder === k && S.tab === "mail" ? " on" : ""}" data-act="folder" data-f="${k}">${I[f.icon]}${f.name}${n ? `<em class="${k === "spam" ? "red" : ""}">${n}</em>` : ""}${extra || ""}</div>`; };
    const people = S.idol ? [] : activeChars();
    return `<div class="dim" data-act="back"></div><div class="drawer"><div class="logo"><b>M</b> 邮箱</div>
      ${item("inbox")}${item("promo")}${item("update")}<div class="dline"></div>
      ${item("starred")}${item("scheduled")}${item("sent")}${item("draft")}${item("spam")}${item("trash")}
      ${people.length ? `<div class="dline"></div><div class="dlb">联系人</div>${people.map(c => `<div class="fd" data-act="contact" data-k="c:${c.id}">${avatarHtml(charParty(c.id), "xs")}${esc(c.name)}</div>`).join("")}` : ""}
      ${(S.meta.npcs || []).slice(0, 6).map(n => `<div class="fd" data-act="contact" data-k="n:${esc((n.addr || n.name).toLowerCase())}">${avatarHtml({ kind: "npc", ...n }, "xs")}${esc(n.name || n.addr)}</div>`).join("")}
      <div class="dline"></div><div class="fd" data-act="settings">${I.gear}设置</div><div class="ver">v${VERSION}</div></div>`;
  };

  // 读信（整串）
  PAGES.read = p => {
    const m0 = S.mails.find(m => m.id === p.data.id); if (!m0) return `<div class="topbar"><button class="ib" data-act="back">${I.back}</button></div><div class="empty">这封邮件不见了</div>`;
    const all = (m0.thread ? S.mails.filter(x => x.thread === m0.thread && visible(x) && x.folder !== "draft" && (m0.folder === "trash" || x.folder !== "trash")) : [m0]).sort((a, b) => ts(a.at) - ts(b.at));
    const last = all[all.length - 1] || m0; p.data.open = p.data.open || {};
    const labelOf = m => m.folder === "spam" ? "垃圾邮件" : m.folder === "trash" ? "已删除" : m.cat === "promo" ? "推广" : m.cat === "update" ? "更新" : m.from.kind === "me" ? "已发送" : "收件箱";
    const msgs = all.map(m => {
      const open = m === last || p.data.open[m.id];
      if (!open) return `<div class="msg fold" data-act="unfold" data-id="${m.id}">${avatarHtml(m.from)}<div class="mbd"><b>${esc(nameOf(m.from))}</b><span>${esc((m.body || "").replace(/\s+/g, " ").slice(0, 60))}</span></div><time>${esc(fmtList(m.at))}</time></div>`;
      const toLine = m.from.kind === "me" ? `发送至 ${esc(nameOf(m.to))}${m.to.addr ? ` &lt;${esc(m.to.addr)}&gt;` : ""}` : `发送至 我`;
      return `<div class="msg"><div class="from">${avatarHtml(m.from)}<div class="mbd"><b>${esc(nameOf(m.from))}<small>${esc(fmtFull(m.at))}</small></b><div>${m.from.addr ? `&lt;${esc(m.from.addr)}&gt; · ` : ""}${toLine}</div></div>${m.from.kind !== "me" && m.from.kind !== "sys" ? `<button class="ib" data-act="reply" data-id="${m.id}">${I.reply}</button>` : ""}${m.from.kind === "char" && !m.promo ? `<button class="ib" data-act="mail-more" data-id="${m.id}">${I.more}</button>` : ""}</div>
        ${m.status === "scheduled" ? `<div class="banner blue">${I.clock}将于 ${esc(fmtFull(m.at))} 发送<button data-act="unschedule" data-id="${m.id}">取消定时</button></div>` : ""}
        ${m.promo ? promoHtml(m) : m.idol ? idolHtml(m) : `<div class="body">${esc(m.body || "")}</div>`}
        ${(m.att || []).length ? `<div class="att">${m.att.map((a, i) => attHtml(m, a, i)).join("")}</div>` : ""}</div>`;
    }).join("");
    const canReply = last.from.kind !== "sys" && !(last.from.kind === "me" && last.to.kind === "sys");
    return `<div class="topbar"><button class="ib" data-act="back">${I.back}</button><span class="sp"></span>
      ${m0.folder === "trash" ? `<button class="ib" data-act="restore" data-id="${m0.id}">${I.restore}</button><button class="ib" data-act="purge" data-id="${m0.id}">${I.trash}</button>` : `<button class="ib" data-act="delete" data-id="${m0.id}">${I.trash}</button>`}
      <button class="ib" data-act="mark-unread" data-id="${last.id}">${I.unread}</button></div>
      <div class="scroll"><div class="rt"><span>${esc((all[0] || m0).subject || "（无主题）")}<span class="lbl">${labelOf(m0)}</span></span><button class="ib" data-act="star" data-id="${m0.id}">${m0.star ? I.starOn : I.star}</button></div>
      ${m0.folder === "spam" ? `<div class="banner warn">${I.spam}这封邮件被放进了垃圾邮件<button data-act="not-spam" data-id="${m0.id}">不是垃圾邮件</button></div>` : ""}
      ${msgs}
      ${canReply ? `<div class="reply-bar"><div data-act="reply" data-id="${last.from.kind === "me" ? last.id : last.id}">${I.reply}回复</div><div data-act="forward" data-id="${last.id}">${I.forward}转发</div></div>` : ""}<div class="pad-b"></div></div>`;
  };
  PAGES.read.after = p => {
    const m0 = S.mails.find(m => m.id === p.data.id); if (!m0) return;
    const all = m0.thread ? S.mails.filter(x => x.thread === m0.thread) : [m0]; let ch = false;
    for (const m of all) if (!m.read && visible(m)) { m.read = true; saveMail(m); ch = true; }
    if (ch) setTimeout(renderBase, 0);
  };
  const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];
  function whenCn(ms) { const d = new Date(ms); return `${d.getMonth() + 1}月${d.getDate()}日（周${WEEK_CN[d.getDay()]}）${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function idolHtml(m) {
    const paras = (m.idol.paras || []).map(p => `${p.ko ? `<p class="ko">${esc(p.ko)}</p>` : ""}<p class="${p.ko ? "zh" : "zh solo"}">${esc(p.zh || "")}</p>`).join("");
    const a = m.idol.action;
    let inv = "";
    if (a && (a.kind || "invite") === "invite") {
      const btns = a.status === "new"
        ? `<div class="iv-acts"><button class="iv-a" data-act="idol-accept" data-id="${m.id}">接受 · 进提醒事项</button><button class="iv-b" data-act="idol-resched" data-id="${m.id}">改时间</button></div><button class="iv-no" data-act="idol-decline" data-id="${m.id}">不去了</button>`
        : a.status === "accepted" ? `<div class="iv-done">✓ 已接受${a.nodeId ? "，在提醒事项里" : "，正在放进提醒事项……"}</div>` : `<div class="iv-done no">已经回绝了</div>`;
      inv = `<div class="inv"><div><span>时间</span>${esc(whenCn(a.at))}</div><div><span>地点</span>${esc(a.place)}</div><div><span>准备</span>${esc(a.prep)}</div></div>${btns}`;
    } else if (a && a.kind === "offer") {
      const btns = a.status === "new"
        ? `<div class="iv-acts"><button class="iv-a" data-act="idol-accept" data-id="${m.id}">接受录取</button></div><button class="iv-no" data-act="idol-decline" data-id="${m.id}">拒绝</button>`
        : a.status === "accepted" ? `<div class="iv-done">✓ 已接受录取，日程排好了</div>` : `<div class="iv-done no">已经拒绝了</div>`;
      inv = `<div class="inv"><div><span>入社日</span>${esc(whenCn(a.at))}</div><div><span>地点</span>${esc(a.place)}</div></div>${btns}`;
    }
    return `<div class="body idol">${m.idol.subjectZh ? `<p class="zh solo sub">${esc(m.idol.subjectZh)}</p>` : ""}${paras}${inv}</div>`;
  }
  function promoHtml(m) {
    const b = BRANDS[m.from.brand] || BRANDS.mail;
    return `<div class="promo"><div class="promo-hd" style="background:${b.color};color:${b.ink || "#fff"}">${esc(b.name)}</div><div class="promo-bd"><h3>${esc(m.promo.h)}</h3>${m.promo.l.map(x => `<p>${esc(x)}</p>`).join("")}<span class="promo-btn" style="background:${b.color};color:${b.ink || "#fff"}" data-act="promo-btn">${esc(m.promo.btn || "去看看")}</span></div><div class="promo-ft">此邮件由系统自动发送，请勿直接回复 · 退订</div></div>`;
  }
  function attHtml(m, a, i) {
    if (a.kind === "photo") return `<div class="aphoto" data-act="photo" data-id="${m.id}" data-i="${i}">${a.ref ? `<img ${refSrc(a.ref)} alt="">` : `<div class="ph-fake" style="--h:${hashHue(a.desc || "")}"></div>`}<span>${esc((a.desc || "照片").slice(0, 18))}</span></div>`;
    if (a.kind === "song") return `<div class="asong" data-act="song" data-id="${m.id}" data-i="${i}"><div class="s-top"><div class="cv" style="--h:${hashHue(a.title)}"></div><div><b>${esc(a.title)}</b><small>${esc(a.artist || "")}</small></div></div><small class="s-play">${I.play}点开去听</small></div>`;
    if (a.kind === "card") return `<div class="acard" data-act="view-card" data-id="${m.id}" data-i="${i}">${CARDS.cardBox(a.style, a.f, a.at || m.at, CARDS.STYLES[a.style] && CARDS.STYLES[a.style].wide ? 170 : 110, a.photoRef ? S.mediaCache.get(a.photoRef) : null)}<span>贺卡 · ${esc((CARDS.STYLES[a.style] || {}).name || "")}</span></div>`;
    return "";
  }

  // 写信
  PAGES.compose = p => {
    const d = p.data; d.att = d.att || [];
    const toChip = d.to ? `<span class="to">${avatarHtml(d.to, "xs")}${esc(nameOf(d.to))}${d.to.addr ? `<small>${esc(d.to.addr)}</small>` : ""}<button data-act="to-clear">${I.close}</button></span>` : `<input id="to-q" placeholder="选一个人，或者直接输入名字、邮箱" value="${esc(d.toQ || "")}" autocomplete="off">`;
    const sugg = !d.to ? toSuggestions(d.toQ || "") : "";
    return `<div class="topbar"><button class="ib" data-act="compose-close">${I.back}</button><b class="tt">写邮件</b>
      <button class="ib" data-act="attach">${I.clip}</button><button class="ib send" data-act="send">${I.sendFill}</button><button class="ib" data-act="compose-more">${I.more}</button></div>
      <div class="scroll compose"><div class="fld">发件人<span class="v">${esc(myAddr() || S.meta.myName || "我")}${myAddr() ? "" : `<small data-act="settings" class="link">设置邮箱号</small>`}</span></div>
      <div class="fld to-fld">收件人${toChip}</div>${sugg}
      <div class="fld"><input id="subj" placeholder="主题" value="${esc(d.subject || "")}"></div>
      ${d.sendAt ? `<div class="banner blue">${I.clock}定时：${esc(fmtFull(d.sendAt))} 寄出<button data-act="sched-clear">取消</button></div>` : ""}
      <textarea id="body" placeholder="撰写电子邮件">${esc(d.body || "")}</textarea>
      ${d.att.length ? `<div class="att edit">${d.att.map((a, i) => `<div class="att-w">${attHtml({ id: "draft", at: nowIso() }, a, i)}<button class="att-x" data-act="att-rm" data-i="${i}">${I.close}</button></div>`).join("")}</div>` : ""}
      ${d.quote ? `<div class="quote">${esc(d.quote)}</div>` : ""}<div class="pad-b"></div></div>`;
  };
  PAGES.compose.after = p => {
    const d = p.data; const el = p.el;
    const q = $("#to-q", el); if (q) { q.oninput = () => { d.toQ = q.value; const s = $(".sugg", el); const h = toSuggestions(q.value); if (s) s.outerHTML = h || `<div class="sugg"></div>`; else if (h) q.closest(".fld").insertAdjacentHTML("afterend", h); hydrate(el); }; }
    const s = $("#subj", el); if (s) s.oninput = () => { d.subject = s.value; };
    const b = $("#body", el); if (b) { b.oninput = () => { d.body = b.value; b.style.height = "auto"; b.style.height = Math.max(200, b.scrollHeight) + "px"; }; b.style.height = Math.max(200, b.scrollHeight) + "px"; }
  };
  function toSuggestions(q) {
    q = String(q || "").trim().toLowerCase();
    const cs = activeChars().filter(c => !q || c.name.toLowerCase().includes(q) || charAddr(c.id).toLowerCase().includes(q));
    const ns = (S.meta.npcs || []).filter(n => !q || (n.name || "").toLowerCase().includes(q) || (n.addr || "").toLowerCase().includes(q)).slice(0, 5);
    const rows = [...cs.map(c => `<div class="sg" data-act="to-char" data-id="${c.id}">${avatarHtml(charParty(c.id), "sm")}<div><b>${esc(c.name)}</b><small>${esc(charAddr(c.id) || "还没有邮箱号（第一次写信时他会告诉你）")}</small></div></div>`),
      ...ns.map(n => `<div class="sg" data-act="to-npc" data-name="${esc(n.name || "")}" data-addr="${esc(n.addr || "")}">${avatarHtml({ kind: "npc", ...n }, "sm")}<div><b>${esc(n.name || n.addr)}</b><small>${esc(n.addr || "")}</small></div></div>`)];
    if (q && !cs.some(c => c.name.toLowerCase() === q)) rows.push(`<div class="sg" data-act="to-free">${avatarHtml({ kind: "npc", name: q }, "sm")}<div><b>写给「${esc(q)}」</b><small>${isAddr(q) ? "这个邮箱" : "可以是客服、编辑部、十年后的自己……对方会按这个身份回信"}</small></div></div>`);
    return rows.length ? `<div class="sugg">${rows.join("")}</div>` : "";
  }

  // 贺卡：挑款式
  PAGES.cardpick = p => {
    const groups = {}; for (const k of CARDS.ORDER) (groups[CARDS.STYLES[k].occ] = groups[CARDS.STYLES[k].occ] || []).push(k);
    return `<div class="topbar"><button class="ib" data-act="back">${I.back}</button><b class="tt">挑一张贺卡</b></div><div class="scroll">
      ${Object.entries(groups).map(([occ, ks]) => `<div class="lb">${occ}</div><div class="cgrid">${ks.map(k => `<div class="ctile" data-act="card-pick" data-k="${k}">${CARDS.cardBox(k, {}, nowIso(), CARDS.STYLES[k].wide ? 200 : 150)}<div class="ct-cap">${esc(CARDS.STYLES[k].name)}</div></div>`).join("")}</div>`).join("")}<div class="pad-b"></div></div>`;
  };
  // 贺卡：改字
  PAGES.cardedit = p => {
    const d = p.data; const st = CARDS.STYLES[d.style]; d.f = d.f || {};
    const photoUrl = d.photoRef ? S.mediaCache.get(d.photoRef) : null;
    return `<div class="topbar"><button class="ib" data-act="back">${I.back}</button><b class="tt">${esc(st.name)}</b><button class="tb-btn blue" data-act="card-done">放进邮件</button></div>
      <div class="scroll"><div class="cprev" id="cprev">${CARDS.cardBox(d.style, d.f, nowIso(), st.wide ? 330 : 250, photoUrl)}</div>
      <div class="form">${st.photo ? `<div class="frow"><label>照片</label><button class="btn-ghost" data-act="card-photo">${d.photoRef ? "换一张" : "从相册选"}</button></div>` : ""}
      ${st.fields.map(fd => `<div class="frow col"><label>${esc(fd.label)}</label>${fd.multi ? `<textarea data-k="${fd.k}" rows="4" placeholder="${esc(fd.def || "（留空用这一季的默认句子）")}">${esc(d.f[fd.k] || "")}</textarea>` : `<input data-k="${fd.k}" ${fd.max ? `maxlength="${fd.max}"` : ""} placeholder="${esc(fd.def)}" value="${esc(d.f[fd.k] || "")}">`}</div>`).join("")}
      ${!st.fields.length ? `<div class="hint">这张卡上的字是固定的，想说的话写在邮件里就好～</div>` : `<div class="hint">留空就用灰色的默认句子</div>`}
      ${d.style === "season" ? `<div class="hint">颜色跟着寄出那天的季节变：春绿、夏黄、秋橙、冬蓝</div>` : ""}</div><div class="pad-b"></div></div>`;
  };
  PAGES.cardedit.after = p => {
    const d = p.data; const st = CARDS.STYLES[d.style];
    p.el.querySelectorAll("[data-k]").forEach(inp => { inp.oninput = () => { d.f[inp.dataset.k] = inp.value; const box = $("#cprev", p.el); if (box) box.innerHTML = CARDS.cardBox(d.style, d.f, nowIso(), st.wide ? 330 : 250, d.photoRef ? S.mediaCache.get(d.photoRef) : null); }; });
  };
  // 看贺卡（翻开）
  PAGES.cardview = p => {
    const m = S.mails.find(x => x.id === p.data.id); const a = m && m.att[p.data.i]; if (!a) return "";
    const st = CARDS.STYLES[a.style] || {}; const w = Math.min(window.innerWidth - 40, st.wide ? 360 : 300);
    return `<div class="cv-dim" data-act="back"></div><div class="cv-wrap"><div class="cv-card">${CARDS.cardBox(a.style, a.f, a.at || m.at, w, a.photoRef ? S.mediaCache.get(a.photoRef) : null)}</div>
      <div class="cv-cap">${m.from.kind === "me" ? `寄给 ${esc(nameOf(m.to))}` : `${esc(nameOf(m.from))} 寄来的`} · ${esc(fmtFull(m.at))}</div><button class="cv-x" data-act="back">${I.close}</button></div>`;
  };
  PAGES.cardview.after = p => { const m = S.mails.find(x => x.id === p.data.id); const a = m && m.att[p.data.i]; if (a && a.photoRef && !S.mediaCache.has(a.photoRef)) mediaUrl(a.photoRef).then(u => { if (u) renderTop(); }); };
  // 看照片
  PAGES.photo = p => {
    const m = S.mails.find(x => x.id === p.data.id) || p.data.m; const a = m && m.att[p.data.i]; if (!a) return "";
    return `<div class="pv-page"><div class="topbar dark"><button class="ib" data-act="back">${I.back}</button></div>
      <div class="pv-body">${a.ref ? `<img ${refSrc(a.ref)} alt="">` : `<div class="ph-fake big" style="--h:${hashHue(a.desc || "")}"></div>`}<p>${esc(a.desc || "")}</p>
      ${!a.ref && api.ai.generateImage ? `<button class="btn-blue" data-act="gen-photo" data-id="${m.id}" data-i="${p.data.i}">生成这张图（会用 1 次生图）</button>` : ""}</div></div>`;
  };
  // 搜索
  PAGES.search = p => {
    const q = (p.data.q || "").trim().toLowerCase();
    const hits = q ? threadsOf(m => m.folder !== "trash" && m.folder !== "draft" && [m.subject, m.body, nameOf(m.from), nameOf(m.to), m.from.addr, (m.promo || {}).h].join(" ").toLowerCase().includes(q)) : [];
    return `<div class="topbar"><button class="ib" data-act="back">${I.back}</button><input id="sq" class="sq" placeholder="在邮件中搜索" value="${esc(p.data.q || "")}" autocomplete="off"></div>
      <div class="scroll">${q ? hits.map(rowHtml).join("") || `<div class="empty">没有找到</div>` : `<div class="lb">联系人</div>${activeChars().map(c => `<div class="sg" data-act="contact" data-k="c:${c.id}">${avatarHtml(charParty(c.id), "sm")}<div><b>${esc(c.name)}</b><small>${esc(charAddr(c.id))}</small></div></div>`).join("")}`}</div>`;
  };
  PAGES.search.after = p => { const i = $("#sq", p.el); if (!i) return; i.oninput = () => { p.data.q = i.value; const pos = i.selectionStart; renderTop(); const j = $("#sq", p.el); j.focus(); j.setSelectionRange(pos, pos); }; if (!p.data.focused) { p.data.focused = true; setTimeout(() => i.focus(), 60); } };
  // 联系人
  PAGES.contact = p => {
    const k = p.data.k; const isChar = k.startsWith("c:"); const cid = isChar ? k.slice(2) : null;
    const npc = !isChar ? (S.meta.npcs || []).find(n => `n:${(n.addr || n.name).toLowerCase()}` === k) || { name: k.slice(2) } : null;
    const party = isChar ? charParty(cid) : { kind: "npc", ...npc };
    const list = threadsOf(m => m.folder !== "draft" && m.folder !== "trash" && (personKey(m.from) === k || personKey(m.to) === k));
    const nLetters = S.mails.filter(m => visible(m) && m.folder !== "draft" && (personKey(m.from) === k || personKey(m.to) === k));
    const cards = nLetters.reduce((n, m) => n + (m.att || []).filter(a => a.kind === "card").length, 0);
    return `<div class="topbar"><button class="ib" data-act="back">${I.back}</button></div><div class="scroll">
      <div class="ct-head">${avatarHtml(party, "lg")}<b>${esc(nameOf(party))}</b><small>${esc(party.addr || (isChar ? "还没有邮箱号" : ""))}</small>
      <div class="ct-stat">往来 ${nLetters.length} 封 · 贺卡 ${cards} 张</div>
      <div class="ct-btns"><button class="btn-blue" data-act="compose-to" data-k="${esc(k)}">${I.pen}写邮件</button>${isChar ? `<button class="btn-ghost" data-act="ask-letter" data-id="${cid}">让他现在写一封</button>` : ""}</div></div>
      ${list.map(rowHtml).join("") || `<div class="empty">还没有往来</div>`}<div class="pad-b"></div></div>`;
  };
  // 设置
  PAGES.settings = () => {
    const sw = (on, act, extra) => `<button class="sw${on ? " on" : ""}" data-act="${act}" ${extra || ""}><i></i></button>`;
    const fq = S.meta.freq;
    return `<div class="topbar"><button class="ib" data-act="back">${I.back}</button><b class="tt">设置</b></div><div class="scroll settings">
      <div class="lb">我</div>
      <div class="srow"><label>名字</label><input data-m="myName" value="${esc(S.meta.myName || "")}" placeholder="${esc(herName())}"></div>
      <div class="srow"><label>邮箱号</label><input data-m="myAddr" value="${esc(S.meta.myAddr || "")}" placeholder="比如 flora@xxx.com" autocapitalize="off"></div>
      <div class="lb">来信</div>
      <div class="srow"><label>主动来信</label><div class="seg">${[["often", "常常"], ["sometimes", "偶尔"], ["rare", "很少"]].map(([k, n]) => `<button class="${fq === k ? "on" : ""}" data-act="freq" data-v="${k}">${n}</button>`).join("")}</div></div>
      <div class="srow"><label>回信立刻到<small>关着的话，回信要过十几分钟到几小时才到</small></label>${sw(S.meta.instant, "instant")}</div>
      <div class="srow"><label>推广和更新<small>广告、快递、账单这些（不花 API）</small></label>${sw(S.meta.promos, "promos")}</div>
      <div class="lb">角色</div>
      ${S.chars.map(c => { const on = !S.meta.excluded.includes(c.id); return `<div class="crow">${avatarHtml(charParty(c.id), "sm")}<div class="cr-bd"><b>${esc(c.name)}</b><input data-addr="${c.id}" value="${esc(charAddr(c.id))}" placeholder="邮箱号（第一次写信时他自己起）" autocapitalize="off"></div></div>
        <div class="crow2"><span>参与</span>${sw(on, "c-on", `data-id="${c.id}"`)}<span>会主动给我写信</span>${sw(on && !S.meta.quiet.includes(c.id), "c-quiet", `data-id="${c.id}"`)}</div>`; }).join("") || `<div class="empty">还没有角色</div>`}
      <div class="lb">其他</div><div class="srow" data-act="debug"><label>调试记录<small>最近 10 次调用</small></label>${I.debug}</div>
      <div class="ver">邮箱 v${VERSION}</div><div class="pad-b"></div></div>`;
  };
  PAGES.settings.after = p => {
    p.el.querySelectorAll("[data-m]").forEach(i => { i.onchange = () => { S.meta[i.dataset.m] = i.value.trim(); saveMeta(); }; });
    p.el.querySelectorAll("[data-addr]").forEach(i => { i.onchange = () => { const v = i.value.trim(); if (v && !isAddr(v)) { toast("邮箱号格式不对"); return; } S.meta.charAddrs[i.dataset.addr] = v; saveMeta(); }; });
  };
  PAGES.debug = () => `<div class="topbar"><button class="ib" data-act="back">${I.back}</button><b class="tt">调试记录</b></div><div class="scroll">${S.debug.map(d => `<div class="dbg"><b>${esc(d.label)} · ${esc(fmtFull(d.at))} ${d.ok ? "" : "❌"}</b><pre>${esc(d.ok ? d.text : d.error)}</pre></div>`).join("") || `<div class="empty">还没有记录</div>`}</div>`;

  // ───────────────────────── 弹层 ─────────────────────────
  function sheet(title, options) {
    return new Promise(res => {
      const el = document.createElement("div"); el.className = "sheet-wrap";
      el.innerHTML = `<div class="dim"></div><div class="sheet"><div class="h"></div>${title ? `<div class="st">${esc(title)}</div>` : ""}${options.map((o, i) => `<div class="op${o.blue ? " c" : ""}" data-i="${i}">${o.icon ? I[o.icon] : ""}<span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</div>`).join("")}</div>`;
      document.body.appendChild(el);
      el.onclick = e => { const op = e.target.closest(".op"); el.remove(); res(op ? options[+op.dataset.i].value : null); };
    });
  }
  function promptBox(title, fields) {
    return new Promise(res => {
      const el = document.createElement("div"); el.className = "sheet-wrap";
      el.innerHTML = `<div class="dim"></div><div class="dialog"><div class="st">${esc(title)}</div>${fields.map((f, i) => `<label>${esc(f.label)}</label>${f.type === "textarea" ? `<textarea data-i="${i}" rows="${f.rows || 3}" placeholder="${esc(f.ph || "")}">${esc(f.value || "")}</textarea>` : `<input data-i="${i}" type="${f.type || "text"}" placeholder="${esc(f.ph || "")}" value="${esc(f.value || "")}">`}`).join("")}
        <div class="dbtns"><button data-v="0">取消</button><button data-v="1" class="blue">确定</button></div></div>`;
      document.body.appendChild(el);
      el.onclick = e => { const b = e.target.closest("[data-v]"); if (!b && !e.target.classList.contains("dim")) return; const ok = b && b.dataset.v === "1"; const vals = fields.map((f, i) => el.querySelector(`[data-i="${i}"]`).value); el.remove(); res(ok ? vals : null); };
      setTimeout(() => { const f = el.querySelector("[data-i]"); f && f.focus(); }, 50);
    });
  }

  // ───────────────────────── 写信动作 ─────────────────────────
  function openCompose(data) { push("compose", { att: [], ...data }); }
  function composePage() { for (let i = S.stack.length - 1; i >= 0; i--) if (S.stack[i].kind === "compose") return S.stack[i]; return null; }
  function rememberNpc(p) {
    if (!p || p.kind !== "npc") return; const k = (p.addr || p.name || "").toLowerCase(); if (!k) return;
    S.meta.npcs = [{ name: p.name, addr: p.addr }, ...(S.meta.npcs || []).filter(n => (n.addr || n.name || "").toLowerCase() !== k)].slice(0, 20); saveMeta();
  }
  function saveDraft(d) {
    if (!d.to && !d.subject && !d.body && !(d.att || []).length) return;
    const m = d.draftId && S.mails.find(x => x.id === d.draftId) || { id: uid("m"), scope: S.identity.id };
    Object.assign(m, { folder: "draft", cat: "primary", from: me(), to: d.to || { kind: "npc", name: "" }, subject: d.subject || "", body: d.body || "", at: nowIso(), status: "draft", read: true, star: false, att: d.att || [], thread: d.thread || null, quote: d.quote || "", sendAt: d.sendAt || null });
    if (!S.mails.includes(m)) S.mails.push(m); saveMail(m); d.draftId = m.id;
  }
  async function send(d) {
    if (!d.to) { toast("还没选收件人"); return; }
    if (!(d.body || "").trim() && !(d.att || []).length) { toast("写点什么吧"); return; }
    const sched = d.sendAt && ts(d.sendAt) > Date.now() + 30e3;
    const m = d.draftId && S.mails.find(x => x.id === d.draftId) || { id: uid("m"), scope: S.identity.id };
    const att = (d.att || []).map(a => a.kind === "card" ? { ...a, at: sched ? d.sendAt : nowIso() } : a);
    Object.assign(m, { folder: sched ? "sent" : "sent", cat: "primary", from: me(), to: d.to, subject: (d.subject || "").trim() || "（无主题）", body: (d.body || "").trim() + (d.quote ? `\n\n${d.quote}` : ""), at: sched ? new Date(d.sendAt).toISOString() : nowIso(),
      status: sched ? "scheduled" : "ok", read: true, star: false, att, needReply: d.to.kind === "char" || d.to.kind === "npc", thread: d.thread || null });
    if (!m.thread) m.thread = m.id;
    if (!S.mails.includes(m)) S.mails.push(m); saveMail(m); rememberNpc(d.to);
    pop();
    if (sched) { toast(`已定时：${fmtFull(m.at)} 寄出`); renderAll(); return; }
    if (m.to.kind === "char") remember(m);
    toast("已发送"); renderAll();
    if (m.needReply) genReply(m);
  }

  // ───────────────────────── 点击 ─────────────────────────
  document.addEventListener("click", async e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const act = t.dataset.act; const id = t.dataset.id; const top = S.stack[S.stack.length - 1];
    const mail = id ? S.mails.find(m => m.id === id) : null;
    switch (act) {
      case "back": pop(); return;
      case "idol-accept": case "idol-decline": case "idol-resched": {
        if (!mail || !mail.idol || !mail.idol.action) return;
        const a = mail.idol.action;
        if (act === "idol-resched") {
          const opts = [1, 2, 3].map(n => { const d = new Date(a.at); d.setDate(d.getDate() + n); return { label: whenCn(d.getTime()), value: String(d.getTime()) }; });
          const v = await sheet("换一个时间（公司那边说这几个都可以）", opts); if (!v) return;
          a.at = +v;
        }
        a.status = act === "idol-decline" ? "declined" : "accepted";
        mail.read = true; await saveMail(mail); renderTop();
        const isOffer = a.kind === "offer";
        toast(act === "idol-decline" ? (isOffer ? "拒绝了" : "回绝了") : (isOffer ? "太好了，去提醒事项看日程" : "接受了，去提醒事项看看"));
        // 宿主几秒内就会排好日程，回头拉一下好把「正在放进」换成「在提醒事项里」
        if (act !== "idol-decline") for (const ms of [6000, 12000]) setTimeout(() => { pullIdolMail().catch(() => {}); }, ms);
        return;
      }
      case "drawer": push("drawer"); return;
      case "folder": S.folder = t.dataset.f; S.tab = "mail"; while (S.stack.length) pop(); renderAll(); return;
      case "tab": S.tab = t.dataset.t; if (S.tab === "cards") { S.meta.cardsSeen = myCards().length; saveMeta(); } renderAll(); return;
      case "search": push("search"); return;
      case "settings": while (S.stack.length && S.stack[S.stack.length - 1].kind === "drawer") pop(); push("settings"); return;
      case "debug": push("debug"); return;
      case "contact": while (S.stack.length && ["drawer", "search"].includes(S.stack[S.stack.length - 1].kind)) pop(); push("contact", { k: t.dataset.k }); return;
      case "open": {
        if (e.target.closest(".star-btn")) return;
        if (mail && mail.folder === "draft") { openCompose({ to: mail.to && mail.to.name !== "" ? mail.to : null, subject: mail.subject, body: mail.body, att: mail.att || [], thread: mail.thread, quote: mail.quote, draftId: mail.id, sendAt: mail.sendAt }); return; }
        push("read", { id }); return;
      }
      case "unfold": top.data.open[id] = true; renderTop(); return;
      case "star": e.stopPropagation(); if (mail) { mail.star = !mail.star; saveMail(mail); renderAll(); } return;
      case "mark-unread": if (mail) { mail.read = false; saveMail(mail); pop(); } return;
      case "delete": { const all = mail.thread ? S.mails.filter(x => x.thread === mail.thread && x.folder !== "draft") : [mail]; for (const m of all) { m.prevFolder = m.folder; m.folder = "trash"; saveMail(m); } toast("已移到「已删除」"); pop(); return; }
      case "restore": { const all = mail.thread ? S.mails.filter(x => x.thread === mail.thread && x.folder === "trash") : [mail]; for (const m of all) { m.folder = m.prevFolder || (m.from.kind === "me" ? "sent" : "inbox"); saveMail(m); } toast("已移回"); pop(); return; }
      case "purge": { const all = mail.thread ? S.mails.filter(x => x.thread === mail.thread && x.folder === "trash") : [mail]; for (const m of all) { forget(m); S.mails = S.mails.filter(x => x !== m); dbDelete(COL.mails, m.id); } toast("已永久删除"); pop(); return; }
      case "empty-trash": { const v = await sheet("清空「已删除」？删了就找不回来了", [{ label: "清空", value: "y", blue: true }, { label: "算了", value: null }]); if (v !== "y") return; for (const m of S.mails.filter(x => x.folder === "trash")) { forget(m); dbDelete(COL.mails, m.id); } S.mails = S.mails.filter(x => x.folder !== "trash"); renderAll(); return; }
      case "mail-more": {
        if (!mail) return;
        const v = await sheet("", [{ label: "编辑这封", icon: "pen", value: "edit" }, { label: "删除这封", icon: "trash", value: "del", sub: "永久删除后他就不记得了" }]);
        if (v === "edit") {
          const vals = await promptBox("编辑邮件", [{ label: "主题", value: mail.subject }, { label: "正文", type: "textarea", rows: 14, value: mail.body }]);
          if (!vals) return;
          const [subject, body] = vals.map(x => x.trim());
          if (!body) return toast("正文不能是空的，不要就删掉");
          if (subject === mail.subject && body === mail.body) return;
          mail.subject = subject || "（无主题）"; mail.body = body;
          const had = mail.memDone; forget(mail); mail.memDone = false;
          if (had) remember(mail); else saveMail(mail);
          toast(had ? "改好了，他记得的也改了" : "改好了"); renderAll();
        } else if (v === "del") {
          mail.prevFolder = mail.folder; mail.folder = "trash"; saveMail(mail);
          toast("已移到「已删除」");
          const rest = mail.thread ? S.mails.filter(x => x.thread === mail.thread && x.folder !== "trash" && x.folder !== "draft" && visible(x)) : [];
          if (rest.length) renderAll(); else pop();
        }
        return;
      }
      case "not-spam": mail.folder = "inbox"; saveMail(mail); toast("已移到收件箱"); renderAll(); return;
      case "unschedule": { mail.status = "draft"; mail.folder = "draft"; mail.sendAt = null; saveMail(mail); toast("已取消定时，放进了草稿"); pop(); return; }
      case "promo-btn": toast("这只是一封广告邮件啦"); return;
      case "song": { const a = mail.att[+t.dataset.i]; toast(`去音乐里搜《${a.title}》${a.artist ? " - " + a.artist : ""}`); return; }
      case "photo": push("photo", { id, i: +t.dataset.i, m: mail || (composePage() && { att: composePage().data.att }) }); return;
      case "gen-photo": {
        if (!mail) { toast("寄出去以后再生成吧"); return; }
        const a = mail.att[+t.dataset.i]; t.disabled = true; t.textContent = "生成中……";
        try { const r = await api.ai.generateImage({ prompt: a.desc, ...(mail.from.kind === "char" ? { characterId: mail.from.charId } : {}), useReferenceImage: false, timeoutMs: 120000 });
          if (r && r.dataUrl) { const sm = await shrink(r.dataUrl); const st = await api.media.put({ dataUrl: sm }); S.mediaCache.set(st.ref, sm); a.ref = st.ref; saveMail(mail); renderAll(); } else toast("没生成出来"); }
        catch (err) { toast(`生图失败：${(err && err.message) || err}`.slice(0, 50)); renderTop(); }
        return;
      }
      case "view-card": {
        const cp = composePage(); if (id === "draft" && cp) return;
        push("cardview", { id, i: +t.dataset.i }); return;
      }
      case "card-new": openCompose({}); setTimeout(() => push("cardpick"), 50); return;
      // 写信
      case "compose": openCompose({}); return;
      case "compose-to": { const k = t.dataset.k; const to = k.startsWith("c:") ? charParty(k.slice(2)) : (() => { const n = (S.meta.npcs || []).find(x => `n:${(x.addr || x.name).toLowerCase()}` === k) || { name: k.slice(2) }; return { kind: "npc", name: n.name, addr: n.addr || "" }; })(); openCompose({ to }); return; }
      case "ask-letter": { const c = charById(id); if (!c) return; toast(`${c.name} 在写了，写好会出现在收件箱`); const m = await genProactive(c, true); if (m) toast(`收到 ${c.name} 的信`); return; }
      case "reply": {
        const src = mail; const to = src.from.kind === "me" ? src.to : src.from;
        openCompose({ to: to.kind === "char" ? charParty(to.charId) : { ...to }, subject: /^回复[：:]/.test(src.subject) ? src.subject : `回复：${src.subject}`, thread: src.thread || src.id }); return;
      }
      case "forward": {
        const src = mail; openCompose({ subject: `转发：${src.subject}`, att: (src.att || []).map(a => ({ ...a })), quote: `---------- 转发的邮件 ----------\n发件人：${nameOf(src.from)}${src.from.addr ? ` <${src.from.addr}>` : ""}\n时间：${fmtFull(src.at)}\n主题：${src.subject}\n\n${src.promo ? [src.promo.h, ...src.promo.l].join("\n") : src.body || ""}` }); return;
      }
      case "to-char": { const cp = composePage(); cp.data.to = charParty(id); cp.data.toQ = ""; renderTop(); return; }
      case "to-npc": { const cp = composePage(); cp.data.to = { kind: "npc", name: t.dataset.name || t.dataset.addr.split("@")[0], addr: t.dataset.addr || "" }; renderTop(); return; }
      case "to-free": { const cp = composePage(); const q = (cp.data.toQ || "").trim(); cp.data.to = isAddr(q) ? { kind: "npc", name: q.split("@")[0], addr: q } : { kind: "npc", name: q, addr: "" }; cp.data.toQ = ""; renderTop(); return; }
      case "to-clear": { const cp = composePage(); cp.data.to = null; renderTop(); return; }
      case "compose-close": { const cp = composePage(); saveDraft(cp.data); if (cp.data.draftId) toast("已存为草稿"); pop(); return; }
      case "send": send(composePage().data); return;
      case "sched-clear": composePage().data.sendAt = null; renderTop(); return;
      case "compose-more": {
        const cp = composePage();
        const v = await sheet("", [{ label: "定时发送", value: "sched", icon: "clock" }, { label: "存为草稿", value: "draft", icon: "draft" }, { label: "舍弃", value: "discard", icon: "trash" }]);
        if (v === "sched") {
          const d = new Date(); const t8 = new Date(d); t8.setDate(d.getDate() + 1); t8.setHours(8, 0, 0, 0); const t13 = new Date(t8); t13.setHours(13); const night = new Date(d); night.setHours(23, 59, 0, 0); if (night < d) night.setDate(night.getDate() + 1);
          const opts = [{ label: "今晚零点前", sub: fmtFull(night.toISOString()), value: night.toISOString() }, { label: "明天早上", sub: fmtFull(t8.toISOString()), value: t8.toISOString() }, { label: "明天下午", sub: fmtFull(t13.toISOString()), value: t13.toISOString() }, { label: "选择日期和时间", value: "custom", icon: "cal", blue: true }];
          let at = await sheet("定时发送", opts);
          if (at === "custom") { const r = await promptBox("选择日期和时间", [{ label: "寄出时间", type: "datetime-local", value: toLocalInput(new Date(Date.now() + 3600e3)) }]); if (!r || !r[0]) return; at = new Date(r[0]).toISOString(); }
          if (!at) return; if (ts(at) <= Date.now()) { toast("要选以后的时间哦"); return; }
          cp.data.sendAt = at; renderTop(); toast("点发送按钮就会按这个时间寄出");
        } else if (v === "draft") { saveDraft(cp.data); toast("已存为草稿"); pop(); }
        else if (v === "discard") { if (cp.data.draftId) { S.mails = S.mails.filter(x => x.id !== cp.data.draftId); dbDelete(COL.mails, cp.data.draftId); } pop(); }
        return;
      }
      case "attach": {
        const cp = composePage();
        const v = await sheet("添加附件", [{ label: "从相册选照片", value: "pick", icon: "image" }, { label: "描述一张照片", sub: "不用真图，写画面就行", value: "desc", icon: "image" }, { label: "分享一首歌", value: "song", icon: "music" }, { label: "贺卡", value: "card", icon: "card" }]);
        if (v === "pick") { try { const ref = await pickImage(); if (ref) { const r = await promptBox("给照片写一句说明（选填，对方会看到）", [{ label: "说明", ph: "比如：今天的晚霞" }]); cp.data.att.push({ kind: "photo", ref, desc: (r && r[0]) || "" }); renderTop(); } } catch (err) { toast("没选成"); } }
        else if (v === "desc") { const r = await promptBox("描述一张照片", [{ label: "画面", type: "textarea", ph: "比如：窗台上晒太阳的猫" }]); if (r && r[0].trim()) { cp.data.att.push({ kind: "photo", desc: r[0].trim() }); renderTop(); } }
        else if (v === "song") { const r = await promptBox("分享一首歌", [{ label: "歌名", ph: "晴天" }, { label: "歌手", ph: "周杰伦" }]); if (r && r[0].trim()) { cp.data.att.push({ kind: "song", title: r[0].trim(), artist: r[1].trim() }); renderTop(); } }
        else if (v === "card") push("cardpick");
        return;
      }
      case "att-rm": { const cp = composePage(); cp.data.att.splice(+t.dataset.i, 1); renderTop(); return; }
      case "card-pick": push("cardedit", { style: t.dataset.k, f: {} }); return;
      case "card-photo": { try { const ref = await pickImage(); if (ref) { top.data.photoRef = ref; renderTop(); } } catch (err) { toast("没选成"); } return; }
      case "card-done": {
        const d = top.data; const f = {}; for (const k in d.f) if (String(d.f[k] || "").trim()) f[k] = d.f[k].trim();
        const card = { kind: "card", style: d.style, f, ...(d.photoRef ? { photoRef: d.photoRef } : {}) };
        pop(); pop(); const cp = composePage(); if (cp) { cp.data.att.push(card); renderTop(); }
        return;
      }
      // 设置
      case "freq": S.meta.freq = t.dataset.v; saveMeta(); renderTop(); return;
      case "instant": S.meta.instant = !S.meta.instant; saveMeta(); renderTop(); return;
      case "promos": S.meta.promos = !S.meta.promos; saveMeta(); renderTop(); return;
      case "c-on": { const x = S.meta.excluded; S.meta.excluded = x.includes(id) ? x.filter(i => i !== id) : [...x, id]; saveMeta(); renderTop(); return; }
      case "c-quiet": { if (S.meta.excluded.includes(id)) return; const x = S.meta.quiet; S.meta.quiet = x.includes(id) ? x.filter(i => i !== id) : [...x, id]; saveMeta(); renderTop(); return; }
    }
  });
  // 安卓返回键 / 手势
  window.addEventListener("popstate", () => { if (S.stack.length) pop(); });

  // ───────────────────────── 启动 ─────────────────────────
  async function boot() {
    root().innerHTML = `<div class="loading">打开邮箱……</div>`;
    await loadAll();
    root().innerHTML = "";
    // 第一次打开：一封欢迎信
    if (!S.mails.length && !S.idol) {
      const w = { id: uid("m"), scope: S.identity.id, folder: "inbox", cat: "primary", from: { kind: "sys", brand: "mail", name: "邮箱团队", addr: BRANDS.mail.addr }, to: me(), subject: "欢迎使用邮箱", at: nowIso(), status: "ok", read: false, star: false, att: [{ kind: "card", style: "daily1", f: { body: "欢迎来到邮箱\n这里会收到他们的信\n也可以写信给任何人" } }],
        body: `你好呀！\n\n· 先去右上角头像（设置）里填一个你的邮箱号。\n· 点「写邮件」可以写给角色，也可以随便写给谁：客服、编辑部、十年后的自己，对方都会回信。\n· 回信要过一阵才到，像真的在等信；不想等可以在设置里打开「回信立刻到」。\n· 他们也会主动给你写信。偶尔有信会掉进垃圾邮件，记得翻翻。\n· 回形针里可以寄贺卡，收到和寄出的贺卡都在底下的「卡册」里。\n\n—— 邮箱团队`, thread: null };
      w.thread = w.id; S.mails.push(w); saveMail(w);
    }
    renderAll();
    await tick();
    S.meta.lastOpenAt = nowIso(); saveMeta();
    setInterval(() => { tick(); }, 60e3);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); else { S.meta.lastOpenAt = nowIso(); saveMeta(); } });
  }
  boot().catch(e => { console.error(e); root().innerHTML = `<div class="loading">打开失败：${esc((e && e.message) || e)}</div>`; });
})();
