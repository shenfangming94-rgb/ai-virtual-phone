/* 微博 · 小手机自定义 APP（第一期：首页 / 评论区 / 个人主页 / 发微博） */
(function () {
  "use strict";
  const api = window.AiPhone || window.AiPhoneApp;

  // ───────────────────────── 工具 ─────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const nowIso = () => new Date().toISOString();
  const clampInt = (v, d = 0) => { const n = parseInt(String(v || "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : d; };

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 0 : 1).replace(/\.0$/, "") + "亿";
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "万";
    return String(n);
  }

  function fmtTime(iso) {
    const t = new Date(iso); const now = new Date();
    if (isNaN(t)) return "";
    const diff = (now - t) / 1000;
    const pad = x => String(x).padStart(2, "0");
    const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    const sameDay = t.toDateString() === now.toDateString();
    if (sameDay) return `今天 ${hm}`;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (t.toDateString() === y.toDateString()) return `昨天 ${hm}`;
    if (t.getFullYear() === now.getFullYear()) return `${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }

  /** 把「8分钟前」「昨天 21:30」「2024-05-01」之类换算成时间戳 */
  function parseRelTime(s) {
    s = String(s || "").trim(); const now = Date.now();
    let m;
    if (!s || /刚刚/.test(s)) return new Date(now - rand(10, 50) * 1000).toISOString();
    if ((m = s.match(/(\d+)\s*秒/))) return new Date(now - m[1] * 1000).toISOString();
    if ((m = s.match(/(\d+)\s*分钟/))) return new Date(now - m[1] * 60000).toISOString();
    if ((m = s.match(/(\d+)\s*(个)?小时/))) return new Date(now - m[1] * 3600000 - rand(0, 600) * 1000).toISOString();
    if ((m = s.match(/(\d+)\s*天/))) return new Date(now - m[1] * 86400000 - rand(0, 36000) * 1000).toISOString();
    if ((m = s.match(/(\d+)\s*(周|星期)/))) return new Date(now - m[1] * 7 * 86400000).toISOString();
    if ((m = s.match(/(\d+)\s*(个)?月/))) return new Date(now - m[1] * 30 * 86400000).toISOString();
    if ((m = s.match(/(\d+)\s*年/)) && !/\d{4}/.test(s)) return new Date(now - m[1] * 365 * 86400000).toISOString();
    if ((m = s.match(/昨天\s*(\d{1,2}):(\d{2})/))) { const d = new Date(now - 86400000); d.setHours(+m[1], +m[2], 0, 0); return d.toISOString(); }
    if ((m = s.match(/(今天\s*)?(\d{1,2}):(\d{2})/)) && !/\d{4}-/.test(s) && !/\d{1,2}-\d{1,2}/.test(s)) { const d = new Date(); d.setHours(+m[2], +m[3], 0, 0); if (d > now) d.setDate(d.getDate() - 1); return d.toISOString(); }
    if ((m = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/))) { const d = new Date(+m[1], m[2] - 1, +m[3], rand(8, 23), rand(0, 59)); return (d > now ? new Date(now) : d).toISOString(); }
    if ((m = s.match(/(\d{1,2})[-/.月](\d{1,2})/))) { const d = new Date(new Date().getFullYear(), m[1] - 1, +m[2], rand(8, 23), rand(0, 59)); if (d > now) d.setFullYear(d.getFullYear() - 1); return d.toISOString(); }
    return new Date(now - rand(1, 50) * 60000).toISOString();
  }

  function hashHue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
  function gradientFor(s) { const h = hashHue(s); return `linear-gradient(135deg, hsl(${h} 62% 66%), hsl(${(h + 40) % 360} 58% 52%))`; }

  // ───────────────────────── 图标 ─────────────────────────
  const I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z"/></svg>',
    homeOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z"/></svg>',
    find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z" stroke-linejoin="round"/></svg>',
    msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" stroke-linecap="round"/></svg>',
    meOn: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8.5" r="4.5"/><path d="M4 20.5c1.2-4 4.2-6 8-6s6.8 2 8 6z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>',
    repost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3.5 20.5 7 17 10.5"/><path d="M4 12V10a3 3 0 0 1 3-3h13.5M7 20.5 3.5 17 7 13.5"/><path d="M20 12v2a3 3 0 0 1-3 3H3.5"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M7.5 10.5v9.5H4.5v-9.5zM7.5 10.5 11 3.5c1.6 0 2.5 1 2.3 2.6l-.5 3.4h5.6c1.3 0 2.2 1.2 1.9 2.4l-1.6 6.3c-.2.9-1 1.5-1.9 1.5H7.5"/></svg>',
    liked: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.8 10.3h3.6v10.2H3.8zM8.6 10.2 11.9 3c1.9 0 3 1.3 2.7 3.1l-.4 3h5c1.5 0 2.6 1.4 2.2 2.8l-1.7 6.6c-.3 1.1-1.2 1.9-2.4 1.9H8.6z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>',
    at: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.4a2.6 2.6 0 0 0 5.2 0V12A8.8 8.8 0 1 0 17 19.3" stroke-linecap="round"/></svg>',
    topic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h16M3.5 15h16"/></svg>',
    emoji: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c.9 1.3 2 2 3.5 2s2.6-.7 3.5-2"/><path d="M9 9.8h.01M15 9.8h.01" stroke-width="2.6"/></svg>',
    loc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    crown: '<svg class="crown" viewBox="0 0 24 24"><path fill="#ffb300" d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 11H5z"/><path fill="#ff8a00" d="M5 17h14l-.4 2H5.4z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  };

  // ───────────────────────── 数据层 ─────────────────────────
  const COL = { posts: "posts", accounts: "accounts", meta: "meta" };
  const MAX_ROWS = 460; // db.list 一次最多拿 500 条，留余量

  const S = {
    identity: null,      // { id, name, avatarUrl }
    chars: [],           // 当前身份下的角色
    accounts: {},        // charId -> 角色微博账号
    accountRows: {},     // charId -> db row id
    meta: null,          // 当前身份的「我」
    posts: [],           // 当前身份下的全部微博
    allPostRows: 0,
    tab: "home",
    homeTab: "follow",
    feedBusy: false,
    jobs: new Set(),
    mediaCache: new Map(),
  };

  async function dbList(c) { try { return (await api.db.list(c, { limit: 500 })) || []; } catch (e) { console.warn(e); return []; } }
  async function dbUpsert(c, row) {
    try {
      const updated = await api.db.update(c, row.id, row);
      if (updated) return updated;
    } catch (e) { /* 不存在时 update 可能报错，走 create */ }
    return api.db.create(c, row);
  }

  function serializePost(p) { const { _media, ...rest } = p; return rest; }
  const saveQueue = new Map();
  function savePost(p) {
    // 合并同一条微博的连续写入，避免整表反复序列化
    clearTimeout(saveQueue.get(p.id));
    saveQueue.set(p.id, setTimeout(() => {
      saveQueue.delete(p.id);
      dbUpsert(COL.posts, serializePost(p)).catch(e => console.warn("保存微博失败", e));
    }, 250));
  }
  async function deletePost(p) {
    S.posts = S.posts.filter(x => x.id !== p.id);
    try { await api.db.delete(COL.posts, p.id); } catch (e) { console.warn(e); }
    for (const img of p.images || []) if (img.ref) api.media.delete({ ref: img.ref }).catch(() => {});
  }
  function saveMeta() { if (S.meta) dbUpsert(COL.meta, S.meta).catch(e => console.warn(e)); }
  function saveAccount(charId) {
    const acc = S.accounts[charId]; if (!acc) return;
    dbUpsert(COL.accounts, { ...acc, id: `acc_${charId}`, charId }).catch(e => console.warn(e));
  }

  /** 总行数快满时，删最旧的、没互动过的路人微博 */
  async function pruneIfNeeded() {
    if (S.allPostRows < MAX_ROWS) return;
    const rows = await dbList(COL.posts);
    S.allPostRows = rows.length;
    if (rows.length < MAX_ROWS) return;
    const victims = rows
      .filter(r => r.authorType === "npc" && !r.liked && !(r.comments || []).some(c => c.authorType === "user"))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, rows.length - MAX_ROWS + 60);
    for (const v of victims) { try { await api.db.delete(COL.posts, v.id); } catch (e) { /* ignore */ } }
    const ids = new Set(victims.map(v => v.id));
    S.posts = S.posts.filter(p => !ids.has(p.id));
    S.allPostRows -= victims.length;
  }

  async function loadAll() {
    const identity = await api.user.getProfile({}).catch(() => null);
    S.identity = identity || { id: "default", name: "我" };
    const chars = await api.characters.list().catch(() => []);
    // 只留绑定当前身份的角色（和微信的身份分区一致）
    const owners = await Promise.all(chars.map(c => api.user.getProfile({ characterId: c.id }).catch(() => null)));
    S.chars = chars.filter((c, i) => !owners[i] || !identity || owners[i].id === identity.id);

    const [postRows, accRows, metaRows] = await Promise.all([dbList(COL.posts), dbList(COL.accounts), dbList(COL.meta)]);
    S.allPostRows = postRows.length;
    S.posts = postRows.filter(p => p.scope === S.identity.id).map(p => ({ ...p, comments: p.comments || [] }));
    S.accounts = {};
    for (const a of accRows) if (a.charId) S.accounts[a.charId] = a;
    S.meta = metaRows.find(m => m.id === `meta_${S.identity.id}`) || {
      id: `meta_${S.identity.id}`,
      nickname: S.identity.name || "微博用户",
      bio: "",
      ip: "",
      cover: 0,
      followers: rand(18, 120),
      followNpc: [],
      unfollowChars: [],
      pinnedPostId: null,
    };
    if (!metaRows.some(m => m.id === S.meta.id)) saveMeta();
  }

  // ───────────────────────── 账号 / 头像 ─────────────────────────
  const charById = id => S.chars.find(c => c.id === id);
  function charByName(name) {
    name = String(name || "").trim(); if (!name || name === "无") return null;
    return S.chars.find(c => c.name === name)
      || S.chars.find(c => S.accounts[c.id] && S.accounts[c.id].nickname === name)
      || S.chars.find(c => name.includes(c.name) || c.name.includes(name));
  }
  function charNickname(charId) { const a = S.accounts[charId]; const c = charById(charId); return (a && a.nickname) || (c && c.name) || "微博用户"; }
  function ensureAccount(charId, patch) {
    const before = S.accounts[charId];
    const acc = { charId, nickname: charById(charId)?.name || "", verified: "无", vip: false, bio: "", ip: "", followers: 0, following: 0, ...before, ...patch };
    S.accounts[charId] = acc;
    if (JSON.stringify(before) !== JSON.stringify(acc)) saveAccount(charId);
    return acc;
  }
  const vClass = v => (/黄|橙|个人/.test(v) ? "yellow" : /蓝|机构|官方/.test(v) ? "blue" : /金/.test(v) ? "gold" : "");
  const isFollowingChar = id => !(S.meta.unfollowChars || []).includes(id);
  const isFollowingNpc = name => (S.meta.followNpc || []).includes(name);

  /** 统一的作者信息：{ type, charId, name, verified, vip, avatar } */
  function authorOf(x) {
    if (x.authorType === "user") return { type: "user", name: S.meta.nickname, verified: "无", vip: !!S.meta.vip, avatar: S.identity.avatarUrl, avatarRef: S.meta.avatarRef, seed: "me" };
    if (x.authorType === "char") {
      const acc = S.accounts[x.charId] || {}; const c = charById(x.charId) || {};
      return { type: "char", charId: x.charId, name: acc.nickname || x.authorName || c.name || "微博用户", verified: acc.verified || x.verified || "无",
        vip: acc.vip != null ? acc.vip : x.vip, avatar: c.avatar, seed: x.charId };
    }
    return { type: "npc", name: x.authorName || "微博用户", verified: x.verified || "无", vip: !!x.vip, avatar: null, seed: x.authorName || "npc" };
  }

  function avatarHtml(a, size) {
    const v = vClass(a.verified);
    const face = a.avatarRef
      ? `<img class="face" data-ref="${esc(a.avatarRef)}" alt="" style="background:${gradientFor(a.seed)}">`
      : a.avatar
      ? `<img class="face" src="${esc(a.avatar)}" alt="" onerror="this.outerHTML='<div class=&quot;face&quot; style=&quot;background:${gradientFor(a.seed)}&quot;>${esc((a.name || "?").slice(0, 1))}</div>'">`
      : `<div class="face" style="background:${gradientFor(a.seed)}">${esc((a.name || "?").slice(0, 1))}</div>`;
    return `<div class="avatar"${size ? ` style="width:${size}px;height:${size}px"` : ""}>${face}${v ? `<span class="v ${v}">V</span>` : ""}</div>`;
  }
  function profileAttrs(a) {
    if (a.type === "user") return `data-act="open-me"`;
    if (a.type === "char") return `data-act="open-profile" data-char="${esc(a.charId)}"`;
    return `data-act="open-npc" data-name="${esc(a.name)}"`;
  }

  // ───────────────────────── 表情 ─────────────────────────
  const EMOJI = {
    "微笑": "🙂", "嘻嘻": "😄", "哈哈": "😆", "可爱": "🥰", "可怜": "🥺", "挖鼻": "👃", "吃惊": "😮", "害羞": "😳", "挤眼": "😜", "闭嘴": "🤐",
    "鄙视": "😒", "爱你": "😍", "泪": "😭", "偷笑": "🤭", "亲亲": "😘", "生病": "🤒", "太开心": "😁", "白眼": "🙄", "右哼哼": "😤", "左哼哼": "😤",
    "嘘": "🤫", "衰": "😞", "委屈": "🥹", "吐": "🤮", "哈欠": "🥱", "抱抱": "🤗", "怒": "😠", "疑问": "❓", "馋嘴": "🤤", "拜拜": "👋",
    "思考": "🤔", "汗": "😓", "困": "😪", "睡": "😴", "钱": "🤑", "失望": "😔", "酷": "😎", "色": "😍", "哼": "😤", "鼓掌": "👏",
    "晕": "😵", "悲伤": "😢", "抓狂": "😫", "黑线": "😑", "阴险": "😏", "怒骂": "🤬", "笑cry": "😂", "允悲": "😅", "二哈": "🐺", "doge": "🐶",
    "喵喵": "🐱", "吃瓜": "🍉", "酸": "🍋", "裂开": "💔", "awsl": "😇", "跪了": "🧎", "摊手": "🤷", "坏笑": "😼", "舔屏": "😋", "打call": "📣",
    "心": "❤️", "伤心": "💔", "赞": "👍", "good": "👍", "ok": "👌", "耶": "✌️", "加油": "💪", "握手": "🤝", "作揖": "🙏", "来": "👉",
    "NO": "🙅", "蜡烛": "🕯️", "给力": "🔥", "单身狗": "🐕", "哆啦A梦花心": "🥀", "费解": "😵‍💫", "并不简单": "🧐", "憧憬": "🤩", "污": "🙈", "互粉": "🤝",
  };
  function emojiPanelHtml() {
    return `<div class="emoji-panel">${Object.entries(EMOJI).map(([k, v]) => `<button class="emoji-btn" data-act="insert-emoji" data-name="${esc(k)}" title="[${esc(k)}]">${v}</button>`).join("")}</div>`;
  }

  // ───────────────────────── 文本渲染 ─────────────────────────
  function richText(t) {
    return esc(t)
      .replace(/#([^#\n]{1,40})#/g, '<span class="link">#$1#</span>')
      .replace(/@([一-龥\w\-·]{1,24})/g, '<span class="link">@$1</span>')
      .replace(/\[([一-龥a-zA-Z]{1,8})\]/g, (m0, k) => EMOJI[k] ? `<span class="emoji" title="[${k}]">${EMOJI[k]}</span>` : `<span class="emo">[${k}]</span>`)
      .replace(/(https?:\/\/[^\s<]+)/g, '<span class="link">🔗网页链接</span>');
  }

  // ───────────────────────── 图片 ─────────────────────────
  async function mediaUrl(ref) {
    if (!ref) return "";
    if (S.mediaCache.has(ref)) return S.mediaCache.get(ref);
    try { const r = await api.media.get({ ref }); S.mediaCache.set(ref, r.dataUrl); return r.dataUrl; } catch (e) { return ""; }
  }
  function hydrateImages(root) {
    root.querySelectorAll("[data-bg-ref]").forEach(async el => {
      const url = await mediaUrl(el.dataset.bgRef);
      if (url) el.style.background = `center / cover no-repeat url("${url}")`;
      el.removeAttribute("data-bg-ref");
    });
    root.querySelectorAll("img[data-ref]").forEach(async img => {
      const url = await mediaUrl(img.dataset.ref);
      if (url) img.src = url;
      img.removeAttribute("data-ref");
    });
  }
  function picTile(img, postId, idx) {
    if (img.ref) return `<div class="pic" data-act="view-pic" data-post="${esc(postId)}" data-idx="${idx}"><img data-ref="${esc(img.ref)}" alt=""></div>`;
    return `<div class="pic placeholder" style="background:${gradientFor(img.desc || idx)}" data-act="view-pic" data-post="${esc(postId)}" data-idx="${idx}"><span>${esc(img.desc || "图片")}</span></div>`;
  }
  function picsHtml(images, postId) {
    if (!images || !images.length) return "";
    const list = images.slice(0, 9);
    return `<div class="pics n${list.length}">${list.map((img, i) => picTile(img, postId, i)).join("")}</div>`;
  }

  async function compressImage(dataUrl, max = 1280) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // ───────────────────────── 提示 ─────────────────────────
  function toast(msg) {
    const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
    document.body.appendChild(el); setTimeout(() => el.remove(), 1800);
  }
  function banner(author, title, text, onTap) {
    document.querySelectorAll(".banner").forEach(b => b.remove());
    const el = document.createElement("div"); el.className = "banner";
    el.innerHTML = `${avatarHtml(author)}<div class="banner-text"><b>${esc(title)}</b><div>${esc(text)}</div></div>`;
    el.onclick = () => { el.remove(); onTap && onTap(); };
    document.body.appendChild(el); setTimeout(() => el.remove(), 4200);
  }
  function sheet(title, items) {
    return new Promise(resolve => {
      const mask = document.createElement("div"); mask.className = "sheet-mask";
      mask.innerHTML = `<div class="sheet">${title ? `<div class="sheet-title">${esc(title)}</div>` : ""}${items.map((it, i) =>
        `<button class="sheet-item ${it.danger ? "danger" : ""} ${it.on ? "on" : ""}" data-i="${i}">${esc(it.label)}</button>`).join("")}<div class="sheet-gap"></div><button class="sheet-item" data-i="-1">取消</button></div>`;
      mask.onclick = e => {
        const b = e.target.closest("[data-i]"); if (!b && e.target !== mask) return;
        mask.remove(); resolve(b ? items[+b.dataset.i]?.value ?? null : null);
      };
      document.body.appendChild(mask);
    });
  }

  // ───────────────────────── AI 输出解析 ─────────────────────────
  const KEYS = ["角色", "作者", "认证", "认证说明", "会员", "来源", "时间", "配图", "转评赞", "转发自", "原文", "转发链", "正文", "编号", "回复", "赞", "内容",
    "点赞角色", "转发", "路人点赞", "新增粉丝", "昵称", "简介", "IP属地", "粉丝", "关注"];
  const KEY_ALT = KEYS.slice().sort((a, b) => b.length - a.length).join("|");
  // 支持「作者：xx」「作者: xx」「[作者]xx」「【作者】：xx」「**作者**：xx」「- 作者：xx」
  const KEY_RE = new RegExp(`^\\s*(?:[-*•]\\s*)?(?:[\\[【]\\s*(${KEY_ALT})\\s*[\\]】]\\s*[：:]?|(${KEY_ALT})\\s*[：:])\\s*(.*)$`);
  const KINDS = "微博|评论|互动|主页|结束";

  /** 把模型常见的格式偏差统一成 ===xx=== 块 */
  function normalizeOutput(text) {
    return String(text || "")
      .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
      .replace(/^[\s\S]*?<\/think(?:ing)?>/i, "")
      .replace(/```[a-zA-Z]*\s*/g, "")
      .replace(/\*\*/g, "")
      .replace(new RegExp(`^[ \\t]*(?:={2,}|-{2,}|#{1,4}|[\\[【<])?[ \\t]*(${KINDS})[ \\t]*\\d*[ \\t]*(?:={2,}|-{2,}|[\\]】>])?[ \\t]*$`, "gm"), (m0, k) => `===${k}===`)
      .replace(/^[ \t]*-{3,}[ \t]*$/gm, "");
  }

  /** 一段文字里可能挤着好几条（模型漏了分隔标记）：同一个字段名再次出现就算下一条 */
  function recordsOf(chunk) {
    const list = []; let fields = {}; let cur = null;
    const push = () => {
      for (const k in fields) fields[k] = fields[k].replace(/^\n+|\s+$/g, "");
      if (Object.keys(fields).length) list.push(fields);
      fields = {}; cur = null;
    };
    for (const line of chunk.split(/\r?\n/)) {
      const km = line.match(KEY_RE);
      if (km) {
        const key = km[1] || km[2];
        if (key in fields) push();
        cur = key; fields[cur] = (km[3] || "").trim();
      } else if (cur) fields[cur] = (fields[cur] ? fields[cur] + "\n" : "") + line;
    }
    push();
    return list;
  }

  function parseBlocks(raw, kind) {
    const text = normalizeOutput(raw);
    const bodyKey = { 微博: "正文", 评论: "内容", 互动: "点赞角色", 主页: "昵称" }[kind];
    // 按分隔标记切段；标记之外的散段（模型漏写标记）也一并按字段解析，最后按必需字段筛
    const out = [];
    let label = null;
    for (const seg of text.split(new RegExp(`(===(?:${KINDS})===)`))) {
      const mk = seg.match(/^===(.+)===$/);
      if (mk) { label = mk[1]; continue; }
      if (label === kind || label === null || label === "结束") out.push(...recordsOf(seg));
    }
    if (kind === "互动") return out.filter(f => "点赞角色" in f || "新增粉丝" in f || "转发" in f || "路人点赞" in f).slice(0, 1);
    if (kind === "主页") return out.filter(f => "昵称" in f && ("粉丝" in f || "简介" in f)).slice(0, 1);
    return out.filter(f => f[bodyKey]);
  }
  const none = v => !v || /^(无|没有|none|null|-|—)$/i.test(String(v).trim());
  const yes = v => /^(是|有|true|yes)/i.test(String(v || "").trim());

  function parseCounts(s) {
    const nums = String(s || "").split(/[\/|｜,，、 ]+/).map(x => {
      x = x.trim(); if (!x) return null;
      const n = parseFloat(x); if (!Number.isFinite(n)) return null;
      return /万/.test(x) ? Math.round(n * 1e4) : /亿/.test(x) ? Math.round(n * 1e8) : Math.round(n);
    }).filter(x => x != null);
    return { reposts: nums[0] || 0, comments: nums[1] || 0, likes: nums[2] || 0 };
  }

  function postFromBlock(b, extra) {
    const ch = charByName(b["角色"]) || (none(b["角色"]) ? null : charByName(b["作者"]));
    const images = none(b["配图"]) ? [] : b["配图"].split(/\s*[|｜]\s*/).filter(Boolean).slice(0, 9).map(desc => ({ desc }));
    let repost = null;
    if (!none(b["转发自"]) || !none(b["原文"])) {
      repost = {
        author: none(b["转发自"]) ? "微博用户" : b["转发自"].replace(/^@/, ""),
        text: none(b["原文"]) ? "" : b["原文"],
        chain: none(b["转发链"]) ? [] : b["转发链"].split(/\s*\|\|\s*/).map(seg => {
          const i = seg.search(/[：:]/); return i > 0 ? { name: seg.slice(0, i).replace(/^@/, "").trim(), text: seg.slice(i + 1).trim() } : null;
        }).filter(Boolean),
      };
    }
    const post = {
      id: uid("wb"), scope: S.identity.id,
      authorType: ch ? "char" : "npc", charId: ch ? ch.id : undefined,
      authorName: (b["作者"] || (ch && ch.name) || "微博用户").replace(/^@/, ""),
      verified: b["认证"] || "无", vip: yes(b["会员"]),
      source: none(b["来源"]) ? "" : b["来源"],
      createdAt: parseRelTime(b["时间"]),
      text: (b["正文"] || "").trim(),
      images, repost,
      counts: parseCounts(b["转评赞"]),
      liked: false, comments: [], commentsGenerated: false,
      ...extra,
    };
    if (ch) {
      const acc = S.accounts[ch.id];
      if (!acc || !acc.nickname || acc.nickname === ch.name) ensureAccount(ch.id, { nickname: post.authorName, verified: post.verified, vip: post.vip });
      post.authorName = S.accounts[ch.id].nickname;
    }
    return post;
  }

  function commentsFromBlocks(blocks, post, idMap) {
    const out = [];
    for (const b of blocks) {
      const ch = charByName(b["角色"]);
      const name = (b["作者"] || (ch && charNickname(ch.id)) || "微博用户").replace(/^@/, "");
      const isPostAuthor = (post.authorType === "char" && ch && ch.id === post.charId) || (post.authorType === "npc" && !ch && name === post.authorName);
      if (ch) { const acc = S.accounts[ch.id]; if (!acc || !acc.nickname) ensureAccount(ch.id, { nickname: name }); }
      const c = {
        id: uid("c"), parentId: null, replyToName: "",
        authorType: ch ? "char" : "npc", charId: ch ? ch.id : undefined,
        authorName: ch ? charNickname(ch.id) : name,
        text: (b["内容"] || "").trim(), likes: clampInt(b["赞"], rand(0, 30)), liked: false,
        isPostAuthor, createdAt: new Date(Date.now() - rand(5, 3000) * 1000).toISOString(),
      };
      if (!c.text) continue;
      const code = String(b["编号"] || "").trim();
      if (code) { idMap[code] = c; c._local = code; }
      const replyCode = String(b["回复"] || "").trim();
      if (!none(replyCode)) {
        const target = idMap[replyCode] || (post.comments || []).find(x => x.code === replyCode) || out.find(x => x._local === replyCode);
        if (target) {
          c.parentId = target.parentId || target.id; c.replyToName = target.parentId ? target.authorName : "";
          const after = new Date(target.createdAt).getTime() + rand(20, 900) * 1000;
          c.createdAt = new Date(Math.min(after, Date.now())).toISOString();
        }
      }
      out.push(c);
    }
    for (const c of out) { delete c._local; c.code = nextCode(post); }
    return out;
  }
  function nextCode(post) { post.codeSeq = (post.codeSeq || 0) + 1; return `F${post.codeSeq}`; }
  function codeOf(post, c) { if (!c.code) c.code = nextCode(post); return c.code; }
  function cmtLine(post, c) {
    const who = c.authorType === "user" ? `${S.meta.nickname}（用户本人）` : c.authorType === "char" ? `${c.authorName}（角色 ${charById(c.charId)?.name || ""}）` : c.authorName;
    const parent = c.parentId ? post.comments.find(x => x.id === c.parentId) : null;
    return `[${codeOf(post, c)}] ${who}${parent ? ` 回复 ${c.replyToName || parent.authorName}` : ""}：${c.text}`;
  }
  /** 一层楼（主评论 + 楼中楼）的完整对话 */
  function floorLines(post, c) {
    const rootId = c.parentId || c.id;
    return post.comments.filter(x => x.id === rootId || x.parentId === rootId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(-14).map(x => cmtLine(post, x)).join("\n");
  }
  function reservedLine() {
    const names = Array.from(new Set([S.meta.nickname, S.identity.name, ...S.chars.flatMap(c => [c.name, S.accounts[c.id] && S.accounts[c.id].nickname])].filter(Boolean)));
    return `以下名字属于角色或用户，路人严禁使用或起近似的名字：${names.join("、")}`;
  }

  // ───────────────────────── AI 调用 ─────────────────────────
  function charsForPrompt(list) {
    return list.map(c => {
      const a = S.accounts[c.id];
      return `- ${c.name}${a && a.nickname ? `（微博昵称：${a.nickname}，必须沿用）` : "（还没有微博账号，自取一个昵称）"}`;
    }).join("\n");
  }
  function nowText() {
    const d = new Date(); const w = "日一二三四五六"[d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${w} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const FORMAT_HINT = {
    feed: "===微博===", comments: "===评论===", reaction: "===评论=== 和 ===互动===", reply: "===评论===", profile: "===主页=== 和 ===微博===",
  };
  async function generate(payload, label) {
    const job = uid("job"); S.jobs.add(job);
    const scene = (payload.appTags || [])[1];
    if (FORMAT_HINT[scene]) payload = { ...payload, instruction: `${payload.instruction}\n\n【输出要求】这不是聊天回复：不要用聊天格式，不要写旁白、动作或心理描写，不要加任何解释，只输出 ${FORMAT_HINT[scene]} 格式的内容，字段名照抄。` };
    try {
      const r = await api.ai.generate(payload);
      const text = (r && r.text) || "";
      S.lastRaw = { label, text, at: nowIso() };
      return text;
    } catch (e) {
      console.error(label, e);
      toast(`${label}失败：${(e && e.message) || e}`.slice(0, 80));
      return null;
    } finally { S.jobs.delete(job); }
  }
  /** 解析不出内容时，让用户能看到 AI 原始返回，方便排查 */
  async function parseFailed(label) {
    const choice = await sheet(`${label}：没认出 AI 返回的内容`, [{ label: "查看 AI 原始返回", value: "raw" }]);
    if (choice === "raw") openRaw();
  }
  function openRaw() {
    const r = S.lastRaw;
    openPage("raw", pg => {
      $(".page-body", pg.el).innerHTML = r
        ? `<div class="form-note">${esc(r.label)} · ${fmtTime(r.at)} · 共 ${r.text.length} 字。截图发给 Nox 就能修～</div><pre style="margin:0;padding:12px 16px;white-space:pre-wrap;word-break:break-all;font-size:12px;line-height:1.5;background:var(--wb-card);user-select:text;-webkit-user-select:text">${esc(r.text || "（空的，AI 什么都没返回）")}</pre>`
        : `<div class="empty">还没有调用过 AI</div>`;
    }, { title: "AI 原始返回" });
  }

  function remember(charId, summary, eventId) {
    if (!charId || !api.memory || !api.memory.addTimeline) return;
    api.memory.addTimeline({ characterId: charId, appLabel: "微博", detail: "weibo", summary, appEventId: eventId }).catch(e => console.warn("写入记忆失败", e));
  }

  /** 首页刷新 */
  async function refreshFeed() {
    if (S.feedBusy) return;
    if (!S.chars.length) { toast("当前身份还没有角色好友，先去微信加个好友吧"); return; }
    S.feedBusy = true; renderHome();
    const followTab = S.homeTab === "follow";
    const followed = S.chars.filter(c => isFollowingChar(c.id));
    const cast = shuffle(followed.length ? followed : S.chars).slice(0, followTab ? 4 : 2);
    const charCount = followTab ? Math.min(cast.length + 1, rand(2, 4)) : 1;
    const npcCount = followTab ? Math.min((S.meta.followNpc || []).length, rand(1, 2)) : rand(5, 7);
    const followNpc = (S.meta.followNpc || []).slice(0, 6);
    const recent = S.posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8)
      .map(p => `- ${authorOf(p).name}：${p.text.slice(0, 40)}`).join("\n");
    const instruction = [
      `当前时间：${nowText()}`,
      `本轮生成 ${charCount + npcCount} 条微博：角色本人发的约 ${charCount} 条，路人博主 ${npcCount} 条${followTab && npcCount ? `（路人只能是用户关注的这些博主，昵称一字不差：${followNpc.join("、")}）` : ""}。`,
      `角色微博昵称（已注册的必须沿用）：\n${charsForPrompt(cast)}`,
      `角色是否发博、发什么，按他此刻的状态和心情决定；同一个角色本轮最多 2 条。`,
      `${S.meta.nickname ? `用户的微博昵称是「${S.meta.nickname}」，角色如果在微博里提到用户要用这个昵称 @。` : ""}`,
      recent ? `首页最近已有的微博（不要重复类似内容）：\n${recent}` : "",
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["weibo", "feed"], instruction }, "刷新");
    S.feedBusy = false;
    if (text == null) { renderHome(); return; }
    const posts = parseBlocks(text, "微博").map(b => postFromBlock(b, { origin: "feed" })).filter(p => p.text || p.images.length || p.repost);
    if (!posts.length) { renderHome(); parseFailed("刷新"); return; }
    for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; }
    S.lastRefreshCount = posts.filter(p => followTab ? inFollowFeed(p) : p.authorType === "npc").length || posts.length;
    pruneIfNeeded();
    renderHome(true);
  }

  /** 打开正文页时生成评论区 */
  async function ensureComments(post) {
    if (post.commentsGenerated || post.authorType === "user" || post._genComments) return;
    if (!S.chars.length) return;
    post._genComments = true; rerenderDetail(post);
    const others = shuffle(S.chars.filter(c => c.id !== post.charId)).slice(0, 3);
    const cast = post.authorType === "char" ? [charById(post.charId), ...others].filter(Boolean) : others.length ? others : S.chars.slice(0, 1);
    const author = authorOf(post);
    const want = Math.min(Math.max(post.counts.comments, 3), rand(9, 14));
    const instruction = [
      `当前时间：${nowText()}`,
      `博主：${author.name}${post.authorType === "char" ? `（就是角色 ${charById(post.charId)?.name}）` : "（路人博主）"}`,
      `微博发布于：${fmtTime(post.createdAt)}`,
      `微博正文：\n${post.text}`,
      post.images.length ? `配图：${post.images.map(i => i.desc || "图片").join(" | ")}` : "",
      post.repost ? `这是一条转发，原微博 @${post.repost.author}：${post.repost.text}` : "",
      `可能来评论的其他角色（符合关系才来，不来就不写）：\n${charsForPrompt(others) || "无"}`,
      `用户的微博昵称：${S.meta.nickname}（用户本人不要出现在评论里）`,
      `生成约 ${want} 条评论，其中楼中楼回复 2~5 条${post.authorType === "char" ? "，博主本人至少回复 1 条" : ""}。`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["weibo", "comments"], instruction }, "加载评论");
    post._genComments = false;
    if (text != null) {
      const list = commentsFromBlocks(parseBlocks(text, "评论"), post, {});
      if (!list.length) parseFailed("加载评论");
      post.comments = [...list, ...post.comments];
      post.commentsGenerated = true;
      post.counts.comments = Math.max(post.counts.comments, post.comments.length);
      savePost(post);
    }
    rerenderDetail(post);
  }

  /** 用户发博后：角色和路人的反应 */
  async function reactToUserPost(post) {
    if (post.visibility === "self" || !S.chars.length) return;
    const cast = shuffle(S.chars).slice(0, 6);
    const instruction = [
      `当前时间：${nowText()}`,
      `用户的微博昵称：${S.meta.nickname}，粉丝 ${S.meta.followers} 人。`,
      post.repost ? `用户转发了 @${post.repost.author} 的微博：「${post.repost.text}」，转发语：` : `用户的微博正文：`,
      post.text || "（无文字）",
      post.images.length ? `配图：${post.images.map(i => i.desc || "一张用户自己上传的照片").join(" | ")}（看不到图片时不要臆测细节）` : "",
      post.location ? `定位：${post.location}` : "",
      post.visibility === "friends" ? "这条微博仅好友圈可见：只有角色能看到，不要生成路人评论。" : `路人评论 ${rand(2, 6)} 条左右。`,
      `可能来互动的角色：\n${charsForPrompt(cast)}`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["weibo", "reaction"], instruction }, "获取互动");
    if (text == null) return;
    const list = commentsFromBlocks(parseBlocks(text, "评论"), post, {});
    const sum = parseBlocks(text, "互动")[0] || {};
    if (!list.length && !Object.keys(sum).length) { parseFailed("发博后的互动"); return; }
    const likedChars = none(sum["点赞角色"]) ? [] : sum["点赞角色"].split(/[、,，\s]+/).map(charByName).filter(Boolean);
    const reposts = none(sum["转发"]) ? [] : sum["转发"].split(/\s*\|\|\s*/).map(seg => {
      const i = seg.search(/[：:]/); if (i <= 0) return null;
      const ch = charByName(seg.slice(0, i));
      return { name: ch ? charNickname(ch.id) : seg.slice(0, i).trim(), charId: ch ? ch.id : undefined, text: seg.slice(i + 1).trim(), createdAt: nowIso() };
    }).filter(Boolean);

    // 评论陆续到达，更像真的
    const fresh = S.posts.find(p => p.id === post.id); if (!fresh) return;
    fresh.likedBy = Array.from(new Set([...(fresh.likedBy || []), ...likedChars.map(c => c.id)]));
    fresh.counts.likes += likedChars.length + clampInt(sum["路人点赞"], 0);
    fresh.reposts = [...(fresh.reposts || []), ...reposts];
    fresh.counts.reposts += reposts.length;
    S.meta.followers += clampInt(sum["新增粉丝"], 0); saveMeta();
    let delay = 600;
    for (const c of list) {
      setTimeout(() => {
        const p = S.posts.find(x => x.id === post.id); if (!p) return;
        c.createdAt = nowIso(); p.comments.push(c); p.counts.comments = Math.max(p.counts.comments + 1, p.comments.length); savePost(p);
        if (c.authorType === "char") banner(authorOf(c), c.authorName, c.parentId ? `回复：${c.text}` : `评论了你的微博：${c.text}`, () => openDetail(p.id));
        refreshVisible(p);
      }, delay);
      delay += rand(1200, 3500);
    }
    savePost(fresh); refreshVisible(fresh);
    // 让角色记住
    const snippet = (post.text || "（图片）").slice(0, 60);
    const userName = S.identity.name || S.meta.nickname;
    for (const ch of new Set([...list.filter(c => c.charId).map(c => c.charId), ...likedChars.map(c => c.id), ...reposts.filter(r => r.charId).map(r => r.charId)])) {
      const mine = list.filter(c => c.charId === ch).map(c => c.text).join(" / ");
      const did = [likedChars.some(c => c.id === ch) ? "点了赞" : "", mine ? `评论：「${mine.slice(0, 80)}」` : "", reposts.some(r => r.charId === ch) ? "转发了" : ""].filter(Boolean).join("，");
      remember(ch, `${userName}在微博发了「${snippet}」，${charById(ch)?.name || "我"}${did}`, `weibo_post_${post.id}_${ch}`);
    }
  }

  /** 用户评论 / 回复后，相关角色回复 */
  async function replyFromChar(post, userComment, targetComment) {
    let charId = null;
    if (targetComment && targetComment.authorType === "char") charId = targetComment.charId;
    else if (!targetComment && post.authorType === "char") charId = post.charId;
    else if (targetComment && targetComment.authorType === "user" && post.authorType === "char") charId = post.charId;
    if (!charId || !charById(charId)) return;
    const ch = charById(charId);
    const thread = targetComment ? floorLines(post, userComment) : "";
    const uCode = codeOf(post, userComment);
    const instruction = [
      `当前时间：${nowText()}`,
      `微博博主：${authorOf(post).name}${post.authorType === "user" ? "（就是用户）" : post.charId === charId ? "（就是你）" : ""}`,
      `微博正文：${post.text.slice(0, 300)}`,
      thread ? `这条评论楼里的对话：\n${thread}` : "",
      `用户（微博昵称 ${S.meta.nickname}）刚刚${targetComment ? `回复了 ${targetComment.authorType === "char" ? "你" : targetComment.authorName}` : "评论了你的微博"}：「${userComment.text}」，这条评论的编号是 ${uCode}。`,
      `你的微博昵称：${charNickname(charId)}。回复用户时「回复」字段填 ${uCode}。`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterId: charId, appTags: ["weibo", "reply"], instruction }, `${ch.name}回复`);
    if (text == null) return;
    const list = commentsFromBlocks(parseBlocks(text, "评论"), post, {});
    const fresh = S.posts.find(p => p.id === post.id); if (!fresh) return;
    let delay = rand(1500, 4000);
    for (const c of list) {
      if (!c.parentId) { c.parentId = userComment.parentId || userComment.id; c.replyToName = S.meta.nickname; }
      setTimeout(() => {
        c.createdAt = nowIso(); fresh.comments.push(c); fresh.counts.comments++; savePost(fresh);
        if (c.authorType === "char") banner(authorOf(c), c.authorName, `回复了你：${c.text}`, () => openDetail(fresh.id));
        refreshVisible(fresh);
      }, delay);
      delay += rand(1500, 3000);
    }
    const said = list.filter(c => c.charId === charId).map(c => c.text).join(" / ");
    remember(charId, `${S.identity.name || S.meta.nickname}在微博${post.authorType === "char" && post.charId === charId ? "我的微博下" : ""}评论：「${userComment.text.slice(0, 60)}」${said ? `，我回复：「${said.slice(0, 80)}」` : ""}`, `weibo_reply_${userComment.id}`);
  }

  const NPC_SYSTEM = [
    "你在模拟微博评论区里的陌生网友（路人），只输出评论，不要任何解释。",
    "活人感要求：",
    "- 回复像真实评论区接话：短、口语、就事论事，可用黑话、梗、不完整句、微博表情（[doge] [允悲] [二哈] [笑cry] [吃瓜]）；不写小作文、不煽情。",
    "- 接住对方具体那句话往下聊：调侃、反问、附和、轻怼、阴阳、跑题都行。*绝对禁止说教、爹味、强行升华或客服式回应*。",
    "- 每个路人保持自己的性格和立场。之前在抬杠、阴阳的人被反驳后会继续嘴硬、换角度怼、或者拉别人站队，不会突然认错道歉或变成和事佬；被怼得没话说时可以转移话题、发 [允悲] 或「你急了」。",
    "- 多个路人之间性格各异、可以站不同队，禁止集体吹捧或集体围攻同一个人。",
    "- *绝对禁止「引用对方原话 + 这句太真实了」这种格式*。",
    "- 绝对不能以用户本人的身份说话。",
  ].join("\n");
  const CMT_FORMAT = "每条严格用以下格式：\n===评论===\n编号：n1、n2……\n角色：无\n作者：昵称\n回复：被回复评论的编号\n赞：点赞数\n内容：回复内容\n===结束===";

  /** 用户回复路人后，路人接话（可以吵很多层） */
  async function replyFromNpc(post, userComment, targetComment) {
    const targetName = targetComment ? targetComment.authorName : post.authorName;
    const uCode = codeOf(post, userComment);
    const prompt = [
      `微博博主：${authorOf(post).name}${post.authorType === "user" ? "（就是用户本人）" : ""}`,
      `微博正文：${post.text.slice(0, 300)}`,
      targetComment ? `这层评论楼的完整对话（按时间）：\n${floorLines(post, userComment)}` : "",
      `用户（微博昵称「${S.meta.nickname}」）刚刚${targetComment ? `回复了「${targetName}」` : `评论了博主「${targetName}」的微博`}：「${userComment.text}」，编号 ${uCode}。`,
      `生成 1~3 条回复：「${targetName}」一定要回（昵称必须一字不差是「${targetName}」），其他路人可以看热闹插嘴。回复用户的「回复」字段填 ${uCode}，回复本次新评论的填本次编号。`,
      reservedLine(),
      CMT_FORMAT,
    ].filter(Boolean).join("\n\n");
    const job = uid("job"); S.jobs.add(job);
    let text = null;
    try { const r = await api.ai.chat({ system: NPC_SYSTEM, prompt, timeoutMs: 90000 }); text = (r && r.text) || ""; S.lastRaw = { label: "路人回复", text, at: nowIso() }; }
    catch (e) { console.error(e); toast(`路人回复失败：${(e && e.message) || e}`.slice(0, 60)); }
    finally { S.jobs.delete(job); }
    if (!text) return;
    const fresh = S.posts.find(p => p.id === post.id); if (!fresh) return;
    const list = commentsFromBlocks(parseBlocks(text, "评论"), fresh, {}).map(c => ({ ...c, authorType: "npc", charId: undefined }));
    if (!list.length) { parseFailed("路人回复"); return; }
    let delay = rand(1500, 4000);
    for (const c of list) {
      if (!c.parentId) { c.parentId = userComment.parentId || userComment.id; c.replyToName = S.meta.nickname; }
      if (c.authorName === post.authorName && post.authorType === "npc") c.isPostAuthor = true;
      setTimeout(() => {
        c.createdAt = nowIso(); fresh.comments.push(c); fresh.counts.comments++; savePost(fresh);
        if (c.replyToName === S.meta.nickname) banner(authorOf(c), c.authorName, `回复了你：${c.text}`, () => openDetail(fresh.id));
        refreshVisible(fresh);
      }, delay);
      delay += rand(1800, 4000);
    }
  }

  /** 评论区「加载更多」：继续生成新评论，可以回复已有评论 */
  async function moreComments(post) {
    if (post._genComments || !S.chars.length) return;
    post._genComments = true; rerenderDetail(post);
    const others = shuffle(S.chars.filter(c => c.id !== post.charId)).slice(0, 3);
    const cast = post.authorType === "char" ? [charById(post.charId), ...others].filter(Boolean) : others.length ? others : S.chars.slice(0, 1);
    const existing = post.comments.slice().sort((a, b) => b.likes - a.likes).slice(0, 18).map(c => cmtLine(post, c)).join("\n");
    const instruction = [
      `当前时间：${nowText()}`,
      `博主：${authorOf(post).name}${post.authorType === "user" ? "（就是用户本人，用户不要出现在新评论里）" : post.authorType === "char" ? `（就是角色 ${charById(post.charId)?.name}）` : "（路人博主）"}`,
      `微博正文：\n${post.text}`,
      `已有评论（方括号里是编号）：\n${existing || "无"}`,
      `继续生成 ${rand(5, 8)} 条新评论：可以是新的一级评论，也可以回复已有评论（「回复」字段填已有编号）或本次新评论（填本次编号）。新评论的编号用 n1、n2……`,
      `可能来评论的其他角色（符合关系才来）：\n${charsForPrompt(others) || "无"}`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["weibo", "comments"], instruction }, "加载评论");
    post._genComments = false;
    if (text != null) {
      const list = commentsFromBlocks(parseBlocks(text, "评论"), post, {});
      post.comments.push(...list);
      post.counts.comments = Math.max(post.counts.comments, post.comments.length);
      savePost(post);
    }
    rerenderDetail(post);
  }

  /** 角色主页：建号 + 历史微博 */
  async function ensureCharProfile(charId, more) {
    const acc = S.accounts[charId];
    if ((acc && acc.profileGenerated && !more) || S[`_gen_${charId}`]) return;
    S[`_gen_${charId}`] = true; rerenderProfile(charId);
    const ch = charById(charId);
    const mine = S.posts.filter(p => p.charId === charId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const instruction = [
      `当前时间：${nowText()}`,
      acc && acc.nickname ? `你的微博昵称已经是「${acc.nickname}」，必须沿用。` : "",
      acc && acc.profileGenerated ? "主页资料已经有了，这次只输出更早的历史微博，不要输出 ===主页===。" : "",
      mine.length ? `你最近已经发过的微博（不要重复，历史微博要比这些更早）：\n${mine.slice(0, 8).map(p => `- ${fmtTime(p.createdAt)}：${p.text.slice(0, 40)}`).join("\n")}` : "",
      `写 ${more ? rand(4, 6) : rand(5, 7)} 条历史微博${mine.length ? `，时间都早于 ${fmtTime(mine[mine.length - 1].createdAt)}` : ""}。`,
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterId: charId, appTags: ["weibo", "profile"], instruction }, "加载主页");
    S[`_gen_${charId}`] = false;
    if (text != null) {
      const pb = parseBlocks(text, "主页")[0];
      if (pb) {
        ensureAccount(charId, {
          nickname: (acc && acc.nickname) || (pb["昵称"] || ch.name).replace(/^@/, ""),
          bio: none(pb["简介"]) ? "" : pb["简介"], verified: pb["认证"] || "无", verifiedNote: none(pb["认证说明"]) ? "" : pb["认证说明"],
          vip: yes(pb["会员"]), ip: none(pb["IP属地"]) ? "" : pb["IP属地"],
          followers: clampInt(pb["粉丝"], rand(80, 3000)), following: clampInt(pb["关注"], rand(30, 400)),
        });
      }
      const oldest = mine.length ? new Date(mine[mine.length - 1].createdAt).getTime() : Date.now();
      const posts = parseBlocks(text, "微博").map(b => postFromBlock(b, { origin: "profile" }))
        .filter(p => p.text || p.images.length || p.repost)
        .map(p => {
          p.authorType = "char"; p.charId = charId; p.authorName = charNickname(charId);
          if (new Date(p.createdAt).getTime() >= oldest) p.createdAt = new Date(oldest - rand(1, 20) * 86400000).toISOString();
          return p;
        });
      for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; }
      ensureAccount(charId, { profileGenerated: true });
      pruneIfNeeded();
    }
    rerenderProfile(charId);
  }

  // ───────────────────────── 渲染：卡片 ─────────────────────────
  function cardHtml(p, opts = {}) {
    const a = authorOf(p);
    const showFollow = !opts.noFollow && a.type !== "user" && S.tab === "home" && S.homeTab === "recommend"
      && !(a.type === "char" ? isFollowingChar(a.charId) : isFollowingNpc(a.name));
    const pinned = opts.showPin && S.meta.pinnedPostId === p.id;
    const long = !opts.full && p.text.length > 140;
    const meta = [fmtTime(p.createdAt), p.source ? `来自 ${esc(p.source)}` : "", p.visibility === "friends" ? "好友圈" : p.visibility === "self" ? "仅自己可见" : ""].filter(Boolean).join(" ");
    let quote = "";
    if (p.repost) {
      const chain = (p.repost.chain || []).map(c => `//<span class="link">@${esc(c.name)}</span>:${richText(c.text)}`).join("");
      const orig = p.repost.postId ? S.posts.find(x => x.id === p.repost.postId) : null;
      quote = `<div class="quote" ${orig ? `data-act="open-detail" data-post="${esc(orig.id)}"` : ""}>
        ${p.repost.deleted ? '<div class="deleted">抱歉，此微博已被作者删除。</div>' : `<div class="text"><span class="link">@${esc(p.repost.author)}</span>:${richText(p.repost.text)}</div>
        ${picsHtml(p.repost.images, orig ? orig.id : p.id)}
        ${orig ? `<div class="quote-stats">转发 ${fmtNum(orig.counts.reposts)} · 评论 ${fmtNum(orig.counts.comments)} · 赞 ${fmtNum(orig.counts.likes)}</div>` : ""}`}
      </div>`;
      p._chainHtml = chain;
    }
    return `<article class="card ${opts.full ? "detail-card" : ""}" ${opts.full ? "" : `data-act="open-detail" data-post="${esc(p.id)}"`}>
      <div class="card-head">
        <div ${profileAttrs(a)}>${avatarHtml(a)}</div>
        <div class="head-main" ${profileAttrs(a)}>
          <div class="name ${a.vip ? "vip" : ""}"><span>${esc(a.name)}</span>${a.vip ? I.crown : ""}</div>
          <div class="meta">${meta}</div>
        </div>
        ${showFollow ? `<button class="follow-btn" data-act="follow" data-post="${esc(p.id)}">+ 关注</button>` : ""}
        <button class="more-btn" data-act="post-menu" data-post="${esc(p.id)}">${I.more}</button>
      </div>
      <div class="text ${long ? "clamp" : ""}">${pinned ? '<span class="pin-tag">置顶</span>' : ""}${richText(p.text)}${p.repost ? p._chainHtml : ""}</div>
      ${long ? '<div class="expand">全文</div>' : ""}
      ${picsHtml(p.images, p.id)}
      ${p.location ? `<div class="meta" style="margin-top:8px;color:var(--wb-link)">📍 ${esc(p.location)}</div>` : ""}
      ${quote}
      <div class="actions">
        <button class="act" data-act="repost" data-post="${esc(p.id)}">${I.repost}<span>${p.counts.reposts ? fmtNum(p.counts.reposts) : "转发"}</span></button>
        <button class="act" data-act="${opts.full ? "focus-reply" : "open-detail"}" data-post="${esc(p.id)}">${I.comment}<span>${p.counts.comments ? fmtNum(p.counts.comments) : "评论"}</span></button>
        <button class="act ${p.liked ? "liked" : ""}" data-act="like" data-post="${esc(p.id)}">${p.liked ? I.liked : I.like}<span>${p.counts.likes ? fmtNum(p.counts.likes) : "赞"}</span></button>
      </div>
    </article>`;
  }

  // ───────────────────────── 首页 ─────────────────────────
  const inFollowFeed = p => p.authorType === "user" || (p.authorType === "char" && isFollowingChar(p.charId)) || (p.authorType === "npc" && isFollowingNpc(p.authorName));
  function feedPosts() {
    const list = S.posts.filter(p => p.origin !== "profile" || p.authorType === "user");
    const filtered = S.homeTab === "follow" ? list.filter(inFollowFeed) : list.filter(p => p.authorType === "npc" || p.authorType === "char");
    return filtered.filter(p => p.visibility !== "self" || p.authorType === "user").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  let feedLimit = 30;
  function renderHome(justRefreshed) {
    if (S.tab !== "home") return;
    const top = $("#topbar");
    top.innerHTML = `<div class="topbar-inner">
      <button class="top-tab ${S.homeTab === "follow" ? "active" : ""}" data-act="home-tab" data-tab="follow">关注</button>
      <button class="top-tab ${S.homeTab === "recommend" ? "active" : ""}" data-act="home-tab" data-tab="recommend">推荐</button>
      <button class="top-icon" data-act="refresh" aria-label="刷新">${I.refresh}</button>
    </div>`;
    const view = $("#view");
    const posts = feedPosts();
    const tip = justRefreshed && S.lastRefreshCount ? `<div class="refresh-tip">更新了 ${S.lastRefreshCount} 条微博</div>` : "";
    const busy = S.feedBusy ? `<div class="gen-tip"><span class="spinner"></span>正在刷新，大家正在发微博…</div>` : "";
    if (!posts.length && !S.feedBusy) {
      view.innerHTML = `<div class="ptr" id="ptr"></div><div class="empty"><div class="big">📰</div>${S.homeTab === "follow" ? "关注的人还没发微博" : "推荐页空空的"}<br>刷新一下看看大家在发什么吧
        <div><button class="btn-primary" data-act="refresh">${I.refresh.replace("<svg", '<svg width="16" height="16"')}刷新</button></div></div>`;
    } else {
      view.innerHTML = `<div class="ptr" id="ptr"></div>${busy}${tip}${posts.slice(0, feedLimit).map(p => cardHtml(p)).join("")}
        ${posts.length > feedLimit ? '<button class="load-more" data-act="feed-more">查看更早的微博</button>' : `<div class="load-more">${posts.length ? "没有更多了" : ""}</div>`}`;
    }
    if (justRefreshed) view.scrollTop = 0;
    hydrateImages(view);
    if (justRefreshed) setTimeout(() => { const t = $(".refresh-tip", view); t && t.remove(); }, 2500);
  }

  // 下拉刷新
  (function setupPullToRefresh() {
    let startY = 0, pulling = false, dist = 0;
    document.addEventListener("touchstart", e => {
      const view = e.target.closest && e.target.closest("#view");
      if (!view || S.tab !== "home" || view.scrollTop > 0 || S.feedBusy) return;
      startY = e.touches[0].clientY; pulling = true; dist = 0;
    }, { passive: true });
    document.addEventListener("touchmove", e => {
      if (!pulling) return;
      dist = Math.max(0, e.touches[0].clientY - startY);
      const ptr = $("#ptr"); if (!ptr) return;
      ptr.classList.add("pulling");
      const h = Math.min(70, dist * 0.45);
      ptr.style.height = h + "px";
      ptr.innerHTML = `<div class="ptr-inner">${h >= 50 ? "松开刷新" : "下拉刷新"}</div>`;
    }, { passive: true });
    document.addEventListener("touchend", () => {
      if (!pulling) return; pulling = false;
      const ptr = $("#ptr"); if (!ptr) return;
      ptr.classList.remove("pulling"); ptr.style.height = "0px";
      if (dist * 0.45 >= 50) refreshFeed();
    });
  })();

  // ───────────────────────── 我 ─────────────────────────
  const COVERS = ["linear-gradient(135deg,#ffb36b,#ff7a45)", "linear-gradient(135deg,#a1c4fd,#c2e9fb)", "linear-gradient(135deg,#fbc2eb,#a6c1ee)",
    "linear-gradient(135deg,#84fab0,#8fd3f4)", "linear-gradient(135deg,#30cfd0,#330867)", "linear-gradient(135deg,#434343,#000)"];
  let meTab = "posts";
  function myPosts() {
    const mine = S.posts.filter(p => p.authorType === "user").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const pin = mine.find(p => p.id === S.meta.pinnedPostId);
    return pin ? [pin, ...mine.filter(p => p !== pin)] : mine;
  }
  function profileHeaderHtml(a, info) {
    return `<div class="profile-cover" style="background:${info.cover}" ${info.coverRef ? `data-bg-ref="${esc(info.coverRef)}"` : ""}></div>
      <div class="profile-box">
        ${avatarHtml(a)}
        <div class="profile-actions">${info.actions || ""}</div>
        <div class="profile-name ${a.vip ? "vip" : ""}">${esc(a.name)}${a.vip ? I.crown : ""}</div>
        ${info.verifiedNote ? `<div class="profile-verify"><span class="v ${vClass(a.verified)}" style="position:static;width:14px;height:14px;display:inline-grid;place-items:center;border-radius:50%;color:#fff;font-size:9px;font-weight:800;font-style:italic">V</span>${esc(info.verifiedNote)}</div>` : ""}
        <div class="profile-bio">简介：${esc(info.bio || "暂无简介")}</div>
        ${info.ip ? `<div class="profile-ip">IP属地：${esc(info.ip)}</div>` : ""}
        <div class="profile-stats"><span><b>${fmtNum(info.posts)}</b>微博</span><span><b>${fmtNum(info.following)}</b>关注</span><span><b>${fmtNum(info.followers)}</b>粉丝</span></div>
      </div>`;
  }
  function renderMe() {
    if (S.tab !== "me") return;
    $("#topbar").innerHTML = `<div class="topbar-inner"><span class="top-title">我</span></div>`;
    const a = authorOf({ authorType: "user" });
    const posts = myPosts();
    const liked = S.posts.filter(p => p.liked && p.authorType !== "user").sort((x, y) => new Date(y.likedAt || y.createdAt) - new Date(x.likedAt || x.createdAt));
    const following = S.chars.filter(c => isFollowingChar(c.id)).length + (S.meta.followNpc || []).length;
    let body = "";
    if (meTab === "posts") body = posts.length ? posts.map(p => cardHtml(p, { showPin: true })).join("") : `<div class="empty"><div class="big">✏️</div>还没有发过微博<div><button class="btn-primary" data-act="compose">发一条</button></div></div>`;
    if (meTab === "album") {
      const pics = posts.flatMap(p => (p.images || []).map((img, i) => picTile(img, p.id, i)));
      body = pics.length ? `<div class="album">${pics.join("")}</div>` : `<div class="empty">还没有图片</div>`;
    }
    if (meTab === "liked") body = liked.length ? liked.map(p => cardHtml(p, { noFollow: true })).join("") : `<div class="empty">还没有赞过微博</div>`;
    $("#view").innerHTML = profileHeaderHtml(a, {
      cover: COVERS[S.meta.cover || 0], coverRef: S.meta.coverRef, bio: S.meta.bio, ip: S.meta.ip, posts: posts.length, following, followers: S.meta.followers,
      actions: `<button class="btn-ghost" data-act="edit-me">编辑资料</button>`,
    }) + `<div class="profile-tabs">
        <button class="${meTab === "posts" ? "on" : ""}" data-act="me-tab" data-tab="posts">微博</button>
        <button class="${meTab === "album" ? "on" : ""}" data-act="me-tab" data-tab="album">相册</button>
        <button class="${meTab === "liked" ? "on" : ""}" data-act="me-tab" data-tab="liked">赞过</button>
      </div>${body}`;
    hydrateImages($("#view"));
  }

  function renderComing(title, icon, what) {
    $("#topbar").innerHTML = `<div class="topbar-inner"><span class="top-title">${title}</span></div>`;
    $("#view").innerHTML = `<div class="coming"><div class="big">${icon}</div><b>${title}正在装修中</b>${what}</div>`;
  }

  function renderTabbar() {
    const t = S.tab;
    $("#tabbar").innerHTML = `
      <button class="tab ${t === "home" ? "active" : ""}" data-act="tab" data-tab="home">${t === "home" ? I.homeOn : I.home}<span>首页</span></button>
      <button class="tab ${t === "find" ? "active" : ""}" data-act="tab" data-tab="find">${I.find}<span>发现</span></button>
      <button class="tab-compose" data-act="compose" aria-label="发微博"><span>${I.plus}</span></button>
      <button class="tab ${t === "msg" ? "active" : ""}" data-act="tab" data-tab="msg">${I.msg}<span>消息</span></button>
      <button class="tab ${t === "me" ? "active" : ""}" data-act="tab" data-tab="me">${t === "me" ? I.meOn : I.me}<span>我</span></button>`;
  }
  function renderTab() {
    renderTabbar();
    if (S.tab === "home") renderHome();
    else if (S.tab === "me") renderMe();
    else if (S.tab === "find") renderComing("发现", "🔥", "热搜榜、话题页、搜索会在第二期上线");
    else renderComing("消息", "💌", "@我的、评论、赞和私信会在第三期上线");
  }

  // ───────────────────────── 页面栈 ─────────────────────────
  const pages = [];
  function openPage(key, render, opts = {}) {
    const el = document.createElement("section"); el.className = "page"; el.dataset.key = key;
    el.innerHTML = `<header class="page-head ${opts.clearHead ? "clear" : ""}"><div class="page-head-inner"><button class="back" data-act="back">${I.back}</button>
      <div class="page-title">${esc(opts.title || "")}</div>${opts.action || ""}</div></header><div class="page-body"></div>${opts.footer || ""}`;
    document.body.appendChild(el);
    const page = { key, el, render, opts };
    pages.push(page); render(page);
    return page;
  }
  function closePage() {
    const p = pages.pop(); if (!p) return;
    p.el.classList.add("closing"); setTimeout(() => p.el.remove(), 200);
    p.opts.onClose && p.opts.onClose();
    refreshAll();
  }
  function refreshAll() {
    for (const p of pages) p.render(p);
    renderTab();
  }
  function refreshVisible(post) {
    for (const p of pages) if (!post || p.key === `detail:${post.id}` || p.key.startsWith("profile") || p.key === "me") p.render(p);
    if (!pages.length || true) { if (S.tab === "home") renderHome(); else if (S.tab === "me") renderMe(); }
  }
  function rerenderDetail(post) { const p = pages.find(x => x.key === `detail:${post.id}`); if (p) p.render(p); }
  function rerenderProfile(charId) { const p = pages.find(x => x.key === `profile:${charId}`); if (p) p.render(p); }

  // ───────────────────────── 正文页 ─────────────────────────
  function openDetail(postId) {
    const post = S.posts.find(p => p.id === postId); if (!post) return;
    let sort = "hot"; let replyTarget = null;
    const page = openPage(`detail:${postId}`, pg => {
      const p = S.posts.find(x => x.id === postId);
      const body = $(".page-body", pg.el);
      if (!p) { body.innerHTML = `<div class="empty">微博已被删除</div>`; return; }
      const scroll = body.scrollTop;
      const top = p.comments.filter(c => !c.parentId);
      const sorted = sort === "hot" ? top.slice().sort((a, b) => b.likes - a.likes + (b.isPostAuthor - a.isPostAuthor) * 5) : top.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const subs = id => p.comments.filter(c => c.parentId === id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const authorLikes = new Set(p.comments.filter(c => c.likedByAuthor).map(c => c.id));
      const cmtHtml = c => {
        const a = c.authorType === "user" ? authorOf({ authorType: "user" }) : authorOf(c);
        const sub = subs(c.id);
        return `<div class="cmt"><div ${profileAttrs(a)}>${avatarHtml(a)}</div><div class="cmt-main" data-act="reply-to" data-cmt="${esc(c.id)}">
          <div class="cmt-top"><span class="cmt-name ${a.vip ? "vip" : ""}">${esc(a.name)}${a.vip ? I.crown : ""}</span>
            ${c.isPostAuthor || (c.authorType === "user" && p.authorType === "user") ? '<span class="tag author">博主</span>' : ""}
            ${authorLikes.has(c.id) ? '<span class="tag liked-by-author">博主赞过</span>' : ""}
            <button class="cmt-like ${c.liked ? "liked" : ""}" data-act="like-cmt" data-cmt="${esc(c.id)}">${c.liked ? I.liked : I.like}${c.likes ? fmtNum(c.likes) : ""}</button></div>
          <div class="cmt-text">${richText(c.text)}</div>
          <div class="cmt-meta"><span>${fmtTime(c.createdAt)}</span>${c.authorType === "user" ? `<button data-act="del-cmt" data-cmt="${esc(c.id)}">删除</button>` : ""}</div>
          ${sub.length ? `<div class="sub-box">${sub.slice(0, c._open ? 99 : 2).map(s => {
            const sa = s.authorType === "user" ? authorOf({ authorType: "user" }) : authorOf(s);
            return `<div class="sub-line" data-act="reply-to" data-cmt="${esc(s.id)}"><span class="who">${esc(sa.name)}</span>${s.isPostAuthor || (s.authorType === "user" && p.authorType === "user") ? ' <span class="tag author">博主</span>' : ""}${s.replyToName ? ` 回复 <span class="who">@${esc(s.replyToName)}</span>` : ""}：${richText(s.text)}</div>`;
          }).join("")}${sub.length > 2 && !c._open ? `<div class="sub-more" data-act="open-sub" data-cmt="${esc(c.id)}">共${sub.length}条回复 &gt;</div>` : ""}</div>` : ""}
        </div></div>`;
      };
      const spin = `<div class="gen-tip"><span class="spinner"></span>评论加载中…</div>`;
      const commentsBody = sorted.length
        ? sorted.map(cmtHtml).join("") + (p._genComments ? spin : `<button class="load-more" data-act="more-cmts" data-post="${esc(p.id)}">加载更多评论</button>`)
        : p._genComments ? spin
        : `<div class="empty">${p.authorType === "user" ? "还没有人评论" : "还没有评论"}<div><button class="btn-primary" data-act="more-cmts" data-post="${esc(p.id)}">${p.authorType === "user" ? "看看有没有人来评论" : "加载评论"}</button></div></div>`;
      const reposts = (p.reposts || []).slice().reverse();
      const tabBody = pg.tab === "reposts"
        ? (reposts.length ? reposts.map(r => {
            const a = r.charId ? authorOf({ authorType: "char", charId: r.charId }) : authorOf({ authorType: "npc", authorName: r.name });
            return `<div class="cmt"><div ${profileAttrs(a)}>${avatarHtml(a)}</div><div class="cmt-main"><div class="cmt-top"><span class="cmt-name">${esc(a.name)}</span></div>
              <div class="cmt-text">${richText(r.text || "转发微博")}</div><div class="cmt-meta"><span>${fmtTime(r.createdAt)}</span></div></div></div>`;
          }).join("") : `<div class="empty">${p.counts.reposts ? "转发列表暂时只显示你的微博的转发" : "还没有人转发"}</div>`)
        : pg.tab === "likes"
          ? ((p.likedBy || []).length ? p.likedBy.map(id => { const a = authorOf({ authorType: "char", charId: id }); return `<div class="list-cell" ${profileAttrs(a)}>${avatarHtml(a)}<div class="cell-main">${esc(a.name)}</div></div>`; }).join("")
            + `<div class="load-more">共 ${fmtNum(p.counts.likes)} 人赞过</div>` : `<div class="empty">共 ${fmtNum(p.counts.likes)} 人赞过</div>`)
          : commentsBody;
      body.innerHTML = cardHtml(p, { full: true, noFollow: true }) + `<div class="detail-tabs">
          <button class="${pg.tab === "reposts" ? "on" : ""}" data-act="detail-tab" data-tab="reposts">转发 ${fmtNum(p.counts.reposts)}</button>
          <button class="${!pg.tab || pg.tab === "comments" ? "on" : ""}" data-act="detail-tab" data-tab="comments">评论 ${fmtNum(p.counts.comments)}</button>
          <span class="right"><button class="${pg.tab === "likes" ? "on" : ""}" data-act="detail-tab" data-tab="likes">赞 ${fmtNum(p.counts.likes)}</button></span>
        </div>${!pg.tab || pg.tab === "comments" ? `<div class="list-cell" style="padding:8px 16px"><span class="sort" data-act="toggle-sort">按 <b>${sort === "hot" ? "热度" : "时间"}</b> ▾</span></div>` : ""}${tabBody}`;
      body.scrollTop = scroll;
      hydrateImages(body);
      const target = $(".reply-target", pg.el);
      target.innerHTML = replyTarget ? `回复 @${esc(replyTarget.authorType === "user" ? S.meta.nickname : replyTarget.authorName)}<button data-act="cancel-reply" style="color:var(--wb-link);font-size:12px">取消</button>` : "";
      target.classList.toggle("hidden", !replyTarget);
    }, {
      title: "微博正文",
      footer: `<div class="reply-target hidden"></div><div class="reply-bar"><textarea class="reply-input" rows="1" placeholder="写评论…" maxlength="500"></textarea><button class="tool" data-act="toggle-emoji" style="width:32px;height:32px">${I.emoji}</button><button class="reply-send" disabled>发送</button></div><div class="emoji-wrap hidden">${emojiPanelHtml()}</div>`,
    });
    page.tab = "comments";
    page.toggleSort = () => { sort = sort === "hot" ? "time" : "hot"; page.render(page); };
    page.setReply = c => { replyTarget = c; page.render(page); const i = $(".reply-input", page.el); i.placeholder = `回复 @${c.authorType === "user" ? S.meta.nickname : c.authorName}`; i.focus(); };
    page.cancelReply = () => { replyTarget = null; $(".reply-input", page.el).placeholder = "写评论…"; page.render(page); };
    const input = $(".reply-input", page.el); const send = $(".reply-send", page.el);
    input.addEventListener("input", () => { send.disabled = !input.value.trim(); input.style.height = "auto"; input.style.height = Math.min(100, input.scrollHeight) + "px"; });
    send.addEventListener("click", () => {
      const p = S.posts.find(x => x.id === postId); const text = input.value.trim(); if (!p || !text) return;
      const c = { id: uid("c"), parentId: replyTarget ? (replyTarget.parentId || replyTarget.id) : null, replyToName: replyTarget && replyTarget.parentId ? (replyTarget.authorType === "user" ? S.meta.nickname : replyTarget.authorName) : "",
        authorType: "user", authorName: S.meta.nickname, text, likes: 0, liked: false, isPostAuthor: p.authorType === "user", createdAt: nowIso() };
      p.comments.push(c); p.counts.comments++; savePost(p);
      const target = replyTarget; replyTarget = null; input.value = ""; send.disabled = true; input.placeholder = "写评论…"; input.style.height = "";
      page.render(page); toast("评论成功");
      const charTarget = (target && target.authorType === "char") || (!target && p.authorType === "char") || (target && target.authorType === "user" && p.authorType === "char");
      if (charTarget) replyFromChar(p, c, target);
      else if ((target && target.authorType === "npc") || (!target && p.authorType === "npc")) replyFromNpc(p, c, target);
    });
    ensureComments(post);
  }

  // ───────────────────────── 角色 / 路人主页 ─────────────────────────
  function openCharProfile(charId) {
    if (!charById(charId)) return;
    let tab = "posts";
    const page = openPage(`profile:${charId}`, pg => {
      const body = $(".page-body", pg.el); const scroll = body.scrollTop;
      const acc = S.accounts[charId] || {};
      const a = authorOf({ authorType: "char", charId });
      const posts = S.posts.filter(p => p.charId === charId && p.authorType === "char").sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
      const following = isFollowingChar(charId);
      const busy = S[`_gen_${charId}`];
      let list = "";
      if (tab === "posts") list = posts.map(p => cardHtml(p, { noFollow: true })).join("")
        + (busy ? `<div class="gen-tip"><span class="spinner"></span>${acc.profileGenerated ? "加载更早的微博…" : "正在打开TA的主页…"}</div>`
          : acc.profileGenerated ? `<button class="load-more" data-act="char-more" data-char="${esc(charId)}">查看更早的微博</button>` : "");
      else {
        const pics = posts.flatMap(p => (p.images || []).map((img, i) => picTile(img, p.id, i)));
        list = pics.length ? `<div class="album">${pics.join("")}</div>` : `<div class="empty">还没有图片</div>`;
      }
      body.innerHTML = profileHeaderHtml(a, {
        cover: gradientFor(charId + "cover"), bio: acc.bio, ip: acc.ip, verifiedNote: acc.verifiedNote, posts: Math.max(posts.length, acc.postCount || 0),
        following: acc.following || 0, followers: acc.followers || 0,
        actions: `<button class="follow-btn ${following ? "on" : ""}" style="height:32px;padding:0 16px;font-size:14px" data-act="toggle-follow-char" data-char="${esc(charId)}">${following ? "已关注" : "+ 关注"}</button>`,
      }) + `<div class="profile-tabs"><button class="${tab === "posts" ? "on" : ""}" data-act="profile-tab" data-tab="posts">微博</button>
          <button class="${tab === "album" ? "on" : ""}" data-act="profile-tab" data-tab="album">相册</button></div>${list}`;
      body.scrollTop = scroll; hydrateImages(body);
    }, { clearHead: true });
    page.setTab = t => { tab = t; page.render(page); };
    ensureCharProfile(charId);
  }

  function openNpcProfile(name) {
    let tab = "posts";
    const page = openPage(`profile-npc:${name}`, pg => {
      const body = $(".page-body", pg.el);
      const posts = S.posts.filter(p => p.authorType === "npc" && p.authorName === name).sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
      const sample = posts[0] || { authorType: "npc", authorName: name };
      const a = authorOf(sample);
      const following = isFollowingNpc(name);
      const fakeFans = (hashHue(name) * 97) % 50000 + (vClass(a.verified) ? 200000 : 300);
      const list = tab === "posts" ? (posts.map(p => cardHtml(p, { noFollow: true })).join("") || `<div class="empty">暂无微博</div>`)
        : (() => { const pics = posts.flatMap(p => (p.images || []).map((img, i) => picTile(img, p.id, i))); return pics.length ? `<div class="album">${pics.join("")}</div>` : `<div class="empty">还没有图片</div>`; })();
      body.innerHTML = profileHeaderHtml(a, {
        cover: gradientFor(name + "cover"), bio: "", posts: posts.length + (hashHue(name) % 900), following: hashHue(name) % 300 + 20, followers: fakeFans,
        actions: `<button class="follow-btn ${following ? "on" : ""}" style="height:32px;padding:0 16px;font-size:14px" data-act="toggle-follow-npc" data-name="${esc(name)}">${following ? "已关注" : "+ 关注"}</button>`,
      }) + `<div class="profile-tabs"><button class="${tab === "posts" ? "on" : ""}" data-act="profile-tab" data-tab="posts">微博</button>
          <button class="${tab === "album" ? "on" : ""}" data-act="profile-tab" data-tab="album">相册</button></div>${list}`;
      hydrateImages(body);
    }, { clearHead: true });
    page.setTab = t => { tab = t; page.render(page); };
  }

  // ───────────────────────── 发微博 ─────────────────────────
  function openCompose(repostOf) {
    const draft = { text: "", images: [], location: "", visibility: "public" };
    if (repostOf) {
      const a = authorOf(repostOf);
      // 转发转发微博时，接上转发链
      if (repostOf.repost) draft.text = `//@${a.name}:${repostOf.text}`;
    }
    const page = openPage("compose", pg => {
      const body = $(".page-body", pg.el);
      if (!pg.built) {
        pg.built = true;
        body.outerHTML = `<div class="compose-body">
          <textarea class="compose-text" placeholder="${repostOf ? "说说分享心得…" : "分享新鲜事…"}" maxlength="2000"></textarea>
          <div class="compose-pics"></div>
          <div class="compose-quote"></div>
          <div class="compose-loc-wrap"></div>
        </div>`;
        const ta = $(".compose-text", pg.el); ta.value = draft.text;
        ta.addEventListener("input", () => { draft.text = ta.value; updateSend(); });
        setTimeout(() => { ta.focus(); ta.setSelectionRange(0, 0); }, 250);
      }
      const pics = $(".compose-pics", pg.el);
      pics.innerHTML = draft.images.map((img, i) => `<div class="pic"><img src="${img.dataUrl}" alt=""><button class="rm" data-act="compose-rm" data-idx="${i}">×</button></div>`).join("")
        + (!repostOf && draft.images.length < 9 ? `<button class="compose-add" data-act="compose-pic">＋</button>` : "");
      if (repostOf) {
        const src = repostOf.repost && !repostOf.repost.deleted ? { author: repostOf.repost.author, text: repostOf.repost.text } : { author: authorOf(repostOf).name, text: repostOf.text };
        $(".compose-quote", pg.el).innerHTML = `<div class="quote" style="margin:12px 0 0;border-radius:4px"><div class="text"><span class="link">@${esc(src.author)}</span>:${richText(src.text.slice(0, 120))}</div></div>`;
      }
      $(".compose-loc-wrap", pg.el).innerHTML = draft.location ? `<span class="compose-loc">${I.loc.replace("<svg", '<svg width="13" height="13"')}${esc(draft.location)}</span>` : "";
      const vis = { public: "公开", friends: "好友圈", self: "仅自己" }[draft.visibility];
      $(".visibility", pg.el).textContent = `${vis} ▾`;
      updateSend();
      function updateSend() { $(".page-action", pg.el).disabled = !repostOf && !draft.text.trim() && !draft.images.length; }
    }, {
      title: repostOf ? "转发微博" : "发微博",
      action: `<button class="page-action" data-act="compose-send">发送</button>`,
      footer: `<div class="compose-tools">
        ${repostOf ? "" : `<button class="tool" data-act="compose-pic">${I.image}</button>`}
        <button class="tool" data-act="compose-insert" data-text="#">${I.topic}</button>
        <button class="tool" data-act="compose-at">${I.at}</button>
        <button class="tool" data-act="toggle-emoji">${I.emoji}</button>
        <button class="tool" data-act="compose-loc">${I.loc}</button>
        <button class="visibility" data-act="compose-vis"></button></div><div class="emoji-wrap hidden">${emojiPanelHtml()}</div>`,
    });
    page.draft = draft; page.repostOf = repostOf;
  }

  async function sendCompose(page) {
    const { draft, repostOf } = page;
    const btn = $(".page-action", page.el); btn.disabled = true;
    const images = [];
    for (const img of draft.images) {
      try { const r = await api.media.put({ dataUrl: img.dataUrl }); images.push({ ref: r.ref, desc: "" }); S.mediaCache.set(r.ref, img.dataUrl); }
      catch (e) { console.warn(e); }
    }
    const post = {
      id: uid("wb"), scope: S.identity.id, authorType: "user", authorName: S.meta.nickname, verified: "无", vip: !!S.meta.vip,
      source: S.meta.device || "iPhone客户端", createdAt: nowIso(), text: draft.text.trim() || (repostOf ? "转发微博" : ""), images,
      location: draft.location, visibility: draft.visibility, repost: null, counts: { reposts: 0, comments: 0, likes: 0 },
      liked: false, comments: [], commentsGenerated: true, origin: "user",
    };
    if (repostOf) {
      const a = authorOf(repostOf);
      const base = repostOf.repost && !repostOf.repost.deleted ? repostOf.repost : null;
      post.repost = base
        ? { ...base, chain: [{ name: a.name, text: repostOf.text }, ...(base.chain || [])].slice(0, 6) }
        : { author: a.name, text: repostOf.text, images: repostOf.images, postId: repostOf.id, chain: [] };
      if (draft.text.includes(`//@${a.name}:`)) { post.text = draft.text.split(`//@${a.name}:`)[0].trim() || "转发微博"; }
      repostOf.counts.reposts++; savePost(repostOf);
      if (repostOf.authorType === "char") remember(repostOf.charId, `${S.identity.name || S.meta.nickname}在微博转发了我的微博「${repostOf.text.slice(0, 40)}」，转发语：「${post.text.slice(0, 60)}」`, `weibo_repost_${post.id}`);
    }
    S.posts.push(post); savePost(post); S.allPostRows++;
    closePage(); toast("发送成功");
    S.tab = "home"; S.homeTab = "follow"; renderTab();
    setTimeout(() => reactToUserPost(post), rand(2500, 6000));
  }

  function openEditMe() {
    openPage("edit-me", pg => {
      // 重绘时保留还没保存的输入
      const keep = {};
      for (const id of ["f-nick", "f-bio", "f-ip", "f-dev"]) { const el = $("#" + id, pg.el); if (el) keep[id] = el.value; }
      const vipEl = $("#f-vip", pg.el);
      $(".page-body", pg.el).innerHTML = `<div class="form">
        <div class="form-row"><label>昵称</label><input id="f-nick" maxlength="30" value="${esc(S.meta.nickname)}"></div>
        <div class="form-row"><label>简介</label><textarea id="f-bio" maxlength="140" placeholder="介绍一下自己">${esc(S.meta.bio)}</textarea></div>
        <div class="form-row"><label>IP属地</label><input id="f-ip" maxlength="20" placeholder="如 上海" value="${esc(S.meta.ip)}"></div>
        <div class="form-row"><label>发布设备</label><input id="f-dev" maxlength="30" placeholder="如 iPhone 16 Pro" value="${esc(S.meta.device || "")}"></div>
        <div class="form-row"><label>会员</label><input type="checkbox" id="f-vip" ${S.meta.vip ? "checked" : ""} style="flex:none;width:20px;height:20px"></div>
        <div class="form-row"><label>头像</label>${avatarHtml(authorOf({ authorType: "user" }), 44)}<button class="btn-ghost" data-act="upload-avatar">上传图片</button>${S.meta.avatarRef ? `<button class="btn-ghost" data-act="reset-avatar">用身份头像</button>` : ""}</div>
        <div class="form-row" style="display:block;padding-top:12px"><label>封面</label>
          <div class="profile-cover" style="height:90px;border-radius:8px;margin-top:8px;background:${COVERS[S.meta.cover || 0]}" ${S.meta.coverRef ? `data-bg-ref="${esc(S.meta.coverRef)}"` : ""}></div>
          <div class="swatches"><button class="btn-ghost" data-act="upload-cover">上传图片</button>${COVERS.map((c, i) => `<button class="swatch ${!S.meta.coverRef && S.meta.cover === i ? "on" : ""}" style="background:${c}" data-act="pick-cover" data-idx="${i}"></button>`).join("")}</div></div>
      </div><div class="form-note"><button class="link" data-act="open-raw" style="font-size:12px">调试：查看最近一次 AI 原始返回</button></div><div class="form-note">头像默认用小手机里的身份头像，也可以单独上传。昵称是你在微博上的名字，角色在微博里会用它称呼你。</div>`;
      for (const id in keep) $("#" + id, pg.el).value = keep[id];
      if (vipEl) $("#f-vip", pg.el).checked = vipEl.checked;
      hydrateImages(pg.el);
    }, { title: "编辑资料", action: `<button class="page-action" data-act="save-me">保存</button>` });
  }

  // ───────────────────────── 看图 ─────────────────────────
  async function openViewer(post, idx) {
    const imgs = post.images && post.images.length ? post.images : (post.repost && post.repost.images) || [];
    const img = imgs[idx]; if (!img) return;
    const el = document.createElement("div"); el.className = "viewer";
    const draw = async () => {
      const url = img.ref ? await mediaUrl(img.ref) : "";
      el.innerHTML = `<div class="idx">${idx + 1}/${imgs.length}</div>
        ${url ? `<img src="${url}" alt="">` : `<div class="placeholder-big" style="background:${gradientFor(img.desc || idx)}">${esc(img.desc || "图片")}</div>`}
        ${img.desc && url ? `<div class="desc">${esc(img.desc)}</div>` : ""}
        <div class="tools">${!url && img.desc ? `<button data-v="gen">生成这张图</button>` : ""}<button data-v="close">关闭</button></div>`;
    };
    el.onclick = async e => {
      const b = e.target.closest("[data-v]");
      if (!b || b.dataset.v === "close") { if (!b && e.target.tagName === "BUTTON") return; el.remove(); return; }
      if (b.dataset.v === "gen") {
        b.disabled = true; b.textContent = "生成中…（10~30 秒）";
        try {
          const r = await api.ai.generateImage({ prompt: img.desc, characterId: post.charId, useReferenceImage: !!post.charId, timeoutMs: 120000 });
          if (r && r.dataUrl) {
            const stored = await api.media.put({ dataUrl: await compressImage(r.dataUrl, 1400) });
            img.ref = stored.ref; S.mediaCache.set(stored.ref, r.dataUrl); savePost(post); await draw(); refreshAll();
          }
        } catch (err) { toast(`生图失败：${(err && err.message) || err}`.slice(0, 60)); b.disabled = false; b.textContent = "生成这张图"; }
      }
    };
    document.body.appendChild(el); draw();
  }

  // ───────────────────────── 交互 ─────────────────────────
  function findPost(id) { return S.posts.find(p => p.id === id); }
  function findComment(id) { for (const p of S.posts) { const c = (p.comments || []).find(x => x.id === id); if (c) return [p, c]; } return [null, null]; }
  const topPage = () => pages[pages.length - 1];

  document.addEventListener("click", async e => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const act = el.dataset.act;
    // 阻止冒泡到外层卡片的点击
    e.stopPropagation();
    const post = el.dataset.post ? findPost(el.dataset.post) : null;
    switch (act) {
      case "tab":
        if (S.tab === el.dataset.tab && S.tab === "home") { $("#view").scrollTop = 0; refreshFeed(); return; }
        S.tab = el.dataset.tab; feedLimit = 30; renderTab(); $("#view").scrollTop = 0; return;
      case "home-tab": S.homeTab = el.dataset.tab; feedLimit = 30; renderHome(); $("#view").scrollTop = 0; return;
      case "refresh": refreshFeed(); return;
      case "feed-more": feedLimit += 30; renderHome(); return;
      case "back": closePage(); return;
      case "open-detail": if (post) openDetail(post.id); return;
      case "open-me": while (pages.length) closePage(); S.tab = "me"; renderTab(); return;
      case "open-profile": openCharProfile(el.dataset.char); return;
      case "open-npc": openNpcProfile(el.dataset.name); return;
      case "like": {
        if (!post) return;
        post.liked = !post.liked; post.counts.likes += post.liked ? 1 : -1; post.likedAt = post.liked ? nowIso() : undefined; savePost(post);
        if (post.liked && post.authorType === "char") remember(post.charId, `${S.identity.name || S.meta.nickname}在微博给我的「${post.text.slice(0, 30)}」点了赞`, `weibo_like_${post.id}`);
        refreshVisible(post); return;
      }
      case "repost": if (post) openCompose(post); return;
      case "focus-reply": { const pg = topPage(); pg && $(".reply-input", pg.el)?.focus(); return; }
      case "follow": {
        if (!post) return; const a = authorOf(post);
        if (a.type === "char") S.meta.unfollowChars = (S.meta.unfollowChars || []).filter(x => x !== a.charId);
        else S.meta.followNpc = Array.from(new Set([...(S.meta.followNpc || []), a.name]));
        saveMeta(); toast("关注成功"); refreshAll(); return;
      }
      case "toggle-follow-char": {
        const id = el.dataset.char; const on = isFollowingChar(id);
        S.meta.unfollowChars = on ? [...(S.meta.unfollowChars || []), id] : (S.meta.unfollowChars || []).filter(x => x !== id);
        saveMeta(); toast(on ? "已取消关注" : "关注成功"); refreshAll(); return;
      }
      case "toggle-follow-npc": {
        const n = el.dataset.name; const on = isFollowingNpc(n);
        S.meta.followNpc = on ? S.meta.followNpc.filter(x => x !== n) : [...(S.meta.followNpc || []), n];
        saveMeta(); toast(on ? "已取消关注" : "关注成功"); refreshAll(); return;
      }
      case "post-menu": {
        if (!post) return;
        const mine = post.authorType === "user";
        const choice = await sheet("", mine
          ? [{ label: S.meta.pinnedPostId === post.id ? "取消置顶" : "置顶", value: "pin" }, { label: "删除", value: "del", danger: true }]
          : [{ label: "收藏", value: "fav" }, { label: "不感兴趣", value: "hide" }, { label: "举报", value: "report" }]);
        if (choice === "pin") { S.meta.pinnedPostId = S.meta.pinnedPostId === post.id ? null : post.id; saveMeta(); toast(S.meta.pinnedPostId ? "已置顶" : "已取消置顶"); refreshAll(); }
        if (choice === "del") {
          for (const p of S.posts) if (p.repost && p.repost.postId === post.id) { p.repost.deleted = true; savePost(p); }
          await deletePost(post); toast("已删除");
          const pg = topPage(); if (pg && pg.key === `detail:${post.id}`) closePage(); else refreshAll();
        }
        if (choice === "hide") { await deletePost(post); toast("将减少此类内容推荐"); refreshAll(); }
        if (choice === "fav") toast("已收藏");
        if (choice === "report") toast("举报已提交");
        return;
      }
      case "detail-tab": { const pg = topPage(); pg.tab = el.dataset.tab; pg.render(pg); return; }
      case "toggle-sort": topPage().toggleSort(); return;
      case "reply-to": { const [, c] = findComment(el.dataset.cmt); if (c) topPage().setReply(c); return; }
      case "cancel-reply": topPage().cancelReply(); return;
      case "open-sub": { const [p, c] = findComment(el.dataset.cmt); if (c) { c._open = true; rerenderDetail(p); } return; }
      case "more-cmts": if (post) moreComments(post); return;
      case "like-cmt": {
        const [p, c] = findComment(el.dataset.cmt); if (!c) return;
        c.liked = !c.liked; c.likes += c.liked ? 1 : -1; savePost(p); rerenderDetail(p); return;
      }
      case "del-cmt": {
        const [p, c] = findComment(el.dataset.cmt); if (!c) return;
        p.comments = p.comments.filter(x => x.id !== c.id && x.parentId !== c.id); p.counts.comments = Math.max(0, p.counts.comments - 1); savePost(p); rerenderDetail(p); return;
      }
      case "view-pic": { const p = findPost(el.dataset.post); if (p) openViewer(p, +el.dataset.idx); return; }
      case "me-tab": meTab = el.dataset.tab; renderMe(); return;
      case "edit-me": openEditMe(); return;
      case "open-raw": openRaw(); return;
      case "pick-cover": {
        if (S.meta.coverRef) { api.media.delete({ ref: S.meta.coverRef }).catch(() => {}); S.meta.coverRef = null; }
        S.meta.cover = +el.dataset.idx; saveMeta(); const pg = topPage(); pg.render(pg); hydrateImages(pg.el); return;
      }
      case "upload-avatar": case "upload-cover": {
        const isAvatar = act === "upload-avatar";
        try {
          const r = await api.media.pick({ accept: "image/*" });
          const f = r && (r.file || (r.files || [])[0]); if (!f) return;
          const dataUrl = await compressImage(f.dataUrl, isAvatar ? 400 : 1280);
          const stored = await api.media.put({ dataUrl });
          S.mediaCache.set(stored.ref, dataUrl);
          const key = isAvatar ? "avatarRef" : "coverRef";
          if (S.meta[key]) api.media.delete({ ref: S.meta[key] }).catch(() => {});
          S.meta[key] = stored.ref; saveMeta();
          const pg = topPage(); pg.render(pg); hydrateImages(pg.el); toast("已更换");
        } catch (err) { toast("上传失败"); }
        return;
      }
      case "reset-avatar": {
        if (S.meta.avatarRef) api.media.delete({ ref: S.meta.avatarRef }).catch(() => {});
        S.meta.avatarRef = null; saveMeta(); const pg = topPage(); pg.render(pg); hydrateImages(pg.el); return;
      }
      case "save-me": {
        const pg = topPage();
        S.meta.nickname = $("#f-nick", pg.el).value.trim() || S.meta.nickname;
        S.meta.bio = $("#f-bio", pg.el).value.trim(); S.meta.ip = $("#f-ip", pg.el).value.trim();
        S.meta.device = $("#f-dev", pg.el).value.trim(); S.meta.vip = $("#f-vip", pg.el).checked;
        saveMeta(); toast("已保存"); closePage(); return;
      }
      case "profile-tab": topPage().setTab(el.dataset.tab); return;
      case "char-more": ensureCharProfile(el.dataset.char, true); return;
      case "compose": openCompose(null); return;
      case "toggle-emoji": { const pg = topPage(); const w = pg && $(".emoji-wrap", pg.el); if (w) w.classList.toggle("hidden"); return; }
      case "insert-emoji": {
        const pg = topPage(); const ta = pg && ($(".compose-text", pg.el) || $(".reply-input", pg.el)); if (!ta) return;
        const ins = `[${el.dataset.name}]`; const pos = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, pos) + ins + ta.value.slice(ta.selectionEnd ?? pos);
        ta.setSelectionRange(pos + ins.length, pos + ins.length);
        if (pg.draft) pg.draft.text = ta.value;
        ta.dispatchEvent(new Event("input")); return;
      }
      case "compose-send": sendCompose(topPage()); return;
      case "compose-pic": {
        const pg = topPage();
        try {
          const r = await api.media.pick({ accept: "image/*", multiple: true, limit: 9 - pg.draft.images.length });
          for (const f of (r && r.files) || []) pg.draft.images.push({ dataUrl: await compressImage(f.dataUrl) });
          pg.render(pg);
        } catch (err) { toast("选择图片失败"); }
        return;
      }
      case "compose-rm": { const pg = topPage(); pg.draft.images.splice(+el.dataset.idx, 1); pg.render(pg); return; }
      case "compose-insert": case "compose-at-name": {
        const pg = topPage(); const ta = $(".compose-text", pg.el);
        const ins = act === "compose-insert" && el.dataset.text === "#" ? "##" : el.dataset.text;
        const pos = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, pos) + ins + ta.value.slice(pos); pg.draft.text = ta.value;
        const caret = pos + (ins === "##" ? 1 : ins.length);
        ta.focus(); ta.setSelectionRange(caret, caret); ta.dispatchEvent(new Event("input")); return;
      }
      case "compose-at": {
        const choice = await sheet("@ 谁", S.chars.map(c => ({ label: charNickname(c.id), value: charNickname(c.id) })));
        if (choice) { const pg = topPage(); const ta = $(".compose-text", pg.el); const pos = ta.selectionStart ?? ta.value.length;
          ta.value = ta.value.slice(0, pos) + `@${choice} ` + ta.value.slice(pos); pg.draft.text = ta.value; ta.dispatchEvent(new Event("input")); }
        return;
      }
      case "compose-loc": {
        const pg = topPage();
        const v = window.prompt ? window.prompt("所在位置", pg.draft.location || "") : null;
        if (v != null) { pg.draft.location = v.trim(); pg.render(pg); }
        return;
      }
      case "compose-vis": {
        const pg = topPage();
        const v = await sheet("谁可以看", [
          { label: "公开", value: "public", on: pg.draft.visibility === "public" },
          { label: "好友圈（只有角色能看到）", value: "friends", on: pg.draft.visibility === "friends" },
          { label: "仅自己可见", value: "self", on: pg.draft.visibility === "self" }]);
        if (v) { pg.draft.visibility = v; pg.render(pg); }
        return;
      }
    }
  });

  // ───────────────────────── 启动 ─────────────────────────
  async function boot() {
    document.body.innerHTML = `<header class="topbar" id="topbar"></header><main class="view" id="view"><div class="gen-tip"><span class="spinner"></span>加载中…</div></main><nav class="tabbar" id="tabbar"></nav>`;
    if (!api) { $("#view").innerHTML = `<div class="empty">请在小手机里打开这个 APP</div>`; return; }
    try { await loadAll(); } catch (e) { console.error(e); $("#view").innerHTML = `<div class="empty">加载失败：${esc(e.message || e)}</div>`; return; }
    renderTab();
  }
  boot();
})();
