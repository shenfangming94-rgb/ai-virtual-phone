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

  const DEFAULT_PLACEHOLDER = "/*__PLACEHOLDER__*/";
  function hashNum(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
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
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.6 2.3 2.8-.5.9 2.7 2.6 1.2-.6 2.8 1.6 2.3-2.1 1.9.2 2.8-2.8.6-1.3 2.5-2.7-.9-2.2 1.7-2.2-1.7-2.7.9-1.3-2.5-2.8-.6.2-2.8-2.1-1.9 1.6-2.3-.6-2.8 2.6-1.2.9-2.7 2.8.5z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  };

  // ───────────────────────── 数据层 ─────────────────────────
  const COL = { posts: "posts", accounts: "accounts", meta: "meta", dms: "dms" };
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
    hot: null,           // 当前身份的热搜榜 { id, at, items: [{ title, heat, tag, rel }] }
    topics: null,        // 当前身份生成过的话题页 { id, map: { 话题: { lead, host, reads, discussions, at } } }
    hotBusy: false,
    npcs: null,
    threads: [],         // 当前身份的私信对话          // 生成过主页的路人 { id, map: { 昵称: { bio, gender, verified, verifiedNote, vip, ip, followers, following, at } } }
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
    forget(memEventsOfPost(p));
    try { await api.db.delete(COL.posts, p.id); } catch (e) { console.warn(e); }
    for (const img of p.images || []) if (img.ref) api.media.delete({ ref: img.ref }).catch(() => {});
  }
  function saveMeta() { if (S.meta) dbUpsert(COL.meta, S.meta).catch(e => console.warn(e)); }
  function saveHot() { if (S.hot) dbUpsert(COL.meta, S.hot).catch(e => console.warn(e)); }
  function saveTopics() { if (S.topics) dbUpsert(COL.meta, S.topics).catch(e => console.warn(e)); }
  function saveNpcs() { if (S.npcs) dbUpsert(COL.meta, S.npcs).catch(e => console.warn(e)); }
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
      .filter(r => r.authorType === "npc" && r.origin !== "profile" && !r.liked && !isFav(r.id) && !(r.comments || []).some(c => c.authorType === "user"))
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

    const [postRows, accRows, metaRows, dmRows] = await Promise.all([dbList(COL.posts), dbList(COL.accounts), dbList(COL.meta), dbList(COL.dms)]);
    S.threads = dmRows.filter(t => t.scope === S.identity.id && t.peer).map(t => ({ ...t, messages: t.messages || [] }));
    S.allPostRows = postRows.length;
    S.posts = postRows.filter(p => p.scope === S.identity.id).map(p => ({ ...p, comments: p.comments || [] }));
    S.accounts = {};
    for (const a of accRows) if (a.charId) S.accounts[a.charId] = a;
    S.debug = (metaRows.find(m => m.id === "debug_log") || {}).entries || [];
    S.hot = metaRows.find(m => m.id === `hot_${S.identity.id}`) || { id: `hot_${S.identity.id}`, at: null, items: [] };
    S.topics = metaRows.find(m => m.id === `topics_${S.identity.id}`) || { id: `topics_${S.identity.id}`, map: {} };
    S.npcs = metaRows.find(m => m.id === `npcs_${S.identity.id}`) || { id: `npcs_${S.identity.id}`, map: {} };
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
    for (const k of ["excludedChars", "starredChars", "avatarPool", "fans", "publicChars", "visits", "history", "favs", "drafts"]) if (!Array.isArray(S.meta[k])) S.meta[k] = [];
    // 第一次有消息页：以前的评论和赞都算已读，列表里照样能看到
    if (!S.meta.seen) { const t = nowIso(); S.meta.seen = { at: t, comment: t, like: t, follow: t }; saveMeta(); }
    if (!metaRows.some(m => m.id === S.meta.id)) saveMeta();
  }

  // ───────────────────────── 账号 / 头像 ─────────────────────────
  const charById = id => S.chars.find(c => c.id === id);
  const isStarred = id => (S.meta.starredChars || []).includes(id);
  /** 公众人物：用户在编辑资料里开、角色在微博设置里开（按身份分开存） */
  const isPublic = id => id === "user" ? !!S.meta.publicFigure : (S.meta.publicChars || []).includes(id);
  function publicLine(forHot) {
    const pubs = [S.meta.publicFigure ? `用户（${S.meta.nickname}）` : "", ...S.chars.filter(c => isPublic(c.id)).map(c => c.name)].filter(Boolean);
    const plain = [S.meta.publicFigure ? "" : "用户", ...S.chars.filter(c => !isPublic(c.id)).map(c => c.name)].filter(Boolean);
    return [
      pubs.length ? `公众人物（有粉丝、会被关注和讨论）：${pubs.join("、")}${forHot ? "。每人最多上 3 条热搜" : ""}` : "",
      plain.length ? `普通人（不是公众人物）：${plain.join("、")}${forHot ? "。不上热搜，除非真的发生了全网讨论的重大事件（考了全省状元、做了什么事突然走红），这种整个榜单最多 1 条；聊天里聊过的话题、日常小事、恋情八卦都不会上热搜" : "，评论区按普通人的生态来"}` : "",
    ].filter(Boolean).join("\n");
  }
  /** 参与微博的角色（设置里关掉的不发博、不来评论） */
  const activeChars = () => S.chars.filter(c => !(S.meta.excludedChars || []).includes(c.id));
  /** 抽角色：特别关注的一定在，其余随机补满 */
  function pickCast(pool, n) {
    const starred = pool.filter(c => isStarred(c.id));
    const rest = shuffle(pool.filter(c => !isStarred(c.id)));
    return [...starred, ...rest].slice(0, Math.max(n, starred.length));
  }
  function starredLine(cast) {
    const names = cast.filter(c => isStarred(c.id)).map(c => c.name);
    return names.length ? `用户特别关注的人：${names.join("、")}。他们和用户关系特别近，一定会刷到用户的动态。` : "";
  }
  /** strict：只认本名或已登记的微博昵称（用来从「作者」反查，避免「沈砚的粉丝」被认成沈砚） */
  function charByName(name, strict) {
    name = String(name || "").replace(/^@/, "").trim(); if (!name || none(name)) return null;
    return S.chars.find(c => c.name === name)
      || S.chars.find(c => S.accounts[c.id] && S.accounts[c.id].nickname === name)
      || (strict ? null : S.chars.find(c => name.includes(c.name) || (name.length >= 2 && c.name.includes(name))));
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
    const pool = S.meta.avatarPool || [];
    const npcName = x.authorName || "微博用户";
    const info = S.npcs && S.npcs.map[npcName];
    return { type: "npc", name: npcName, verified: (info && info.verified) || x.verified || "无", vip: info ? !!info.vip : !!x.vip, avatar: null, seed: npcName,
      avatarRef: pool.length ? pool[hashNum(npcName) % pool.length] : null };
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
      .replace(/#([^#\n]{1,40})#/g, (m0, t) => `<span class="link" data-act="open-topic" data-topic="${t}">#${t}#</span>`)
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
    return `<div class="pic" data-act="view-pic" data-post="${esc(postId)}" data-idx="${idx}">${placeholderImg()}</div>`;
  }
  function placeholderImg() {
    return S.meta && S.meta.placeholderRef
      ? `<img data-ref="${esc(S.meta.placeholderRef)}" src="${DEFAULT_PLACEHOLDER}" alt="">`
      : `<img src="${DEFAULT_PLACEHOLDER}" alt="">`;
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
    "性别", "点赞角色", "转发", "路人点赞", "新增粉丝", "昵称", "简介", "IP属地", "粉丝", "关注",
    "热搜词", "热度", "标签", "相关", "来自", "新粉丝", "导语", "主持人", "阅读", "讨论", "分区", "词条", "热搜", "阅读量", "讨论量",
    // 模型常换的叫法
    "博主昵称", "发博时间", "发布时间", "图片描述", "配图描述", "转评赞数据", "互动数据", "热评列表", "评论列表", "热评", "评论区",
    "微博昵称", "博主", "发布者", "发博人", "用户名", "评论者", "评论人", "角色本名", "本名", "角色名", "微博正文", "评论内容", "回复内容", "正文内容"];
  const ALIAS = { 博主昵称: "作者", 发博时间: "时间", 发布时间: "时间", 图片描述: "配图", 配图描述: "配图", 转评赞数据: "转评赞", 互动数据: "转评赞",
    热评列表: "热评", 评论列表: "热评", 评论区: "热评", 微博昵称: "作者", 博主: "作者", 发布者: "作者", 发博人: "作者", 用户名: "作者", 评论者: "作者", 评论人: "作者",
    角色本名: "角色", 本名: "角色", 角色名: "角色", 微博正文: "正文", 正文内容: "正文", 评论内容: "内容", 回复内容: "内容",
    词条: "热搜词", 热搜: "热搜词", 阅读量: "阅读", 讨论量: "讨论" };
  const KEY_ALT = KEYS.slice().sort((a, b) => b.length - a.length).join("|");
  // 支持「作者：xx」「作者: xx」「[作者]xx」「【作者】：xx」「**作者**：xx」「- 作者：xx」
  const KEY_RE = new RegExp(`^\\s*(?:[-*•]\\s*)?(?:[\\[【]\\s*(${KEY_ALT})\\s*[\\]】]\\s*[：:]?|(${KEY_ALT})\\s*[：:])\\s*(.*)$`);
  const KINDS = "微博|评论|互动|主页|热搜|话题|私信|结束";

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
        let key = km[1] || km[2];
        key = ALIAS[key] || key;
        if (key in fields) push();
        cur = key; fields[cur] = (km[3] || "").trim();
      } else if (cur) fields[cur] = (fields[cur] ? fields[cur] + "\n" : "") + line;
    }
    push();
    return list;
  }

  function parseBlocks(raw, kind) {
    const text = normalizeOutput(raw);
    const bodyKey = { 微博: "正文", 评论: "内容", 互动: "点赞角色", 主页: "昵称", 热搜: "热搜词", 话题: "导语", 私信: "内容" }[kind];
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
    if (kind === "话题") return out.filter(f => f["导语"] && !f["正文"]).slice(0, 1);
    if (kind === "私信") return out.filter(f => f["内容"] && f["来自"]);
    return out.filter(f => f[bodyKey]);
  }
  const none = v => !v || /^(无|没有|none|null|-|—)$/i.test(String(v).trim());
  const yes = v => /^(是|有|true|yes)/i.test(String(v || "").trim());

  function parseCounts(s) {
    s = String(s || "");
    const num = x => { if (!x) return null; const n = parseFloat(x); return /万/.test(x) ? Math.round(n * 1e4) : /亿/.test(x) ? Math.round(n * 1e8) : Math.round(n); };
    const lab = re => { const m = s.match(re); return m ? num(m[1]) : null; };
    const r = lab(/转发\D{0,3}?([\d.]+\s*[万亿]?)/), c = lab(/评论\D{0,3}?([\d.]+\s*[万亿]?)/), l = lab(/(?:点赞|赞)\D{0,3}?([\d.]+\s*[万亿]?)/);
    if (r != null || c != null || l != null) return { reposts: r || 0, comments: c || 0, likes: l || 0 };
    return parseCountsPlain(s);
  }
  function parseNum(x, d = 0) {
    x = String(x || "").replace(/[,，\s]/g, ""); const n = parseFloat(x);
    if (!Number.isFinite(n)) return d;
    return /亿/.test(x) ? Math.round(n * 1e8) : /万/.test(x) ? Math.round(n * 1e4) : Math.round(n);
  }
  function parseCountsPlain(s) {
    const nums = String(s || "").split(/[\/|｜,，、 ]+/).map(x => {
      x = x.trim(); if (!x) return null;
      const n = parseFloat(x); if (!Number.isFinite(n)) return null;
      return /万/.test(x) ? Math.round(n * 1e4) : /亿/.test(x) ? Math.round(n * 1e8) : Math.round(n);
    }).filter(x => x != null);
    return { reposts: nums[0] || 0, comments: nums[1] || 0, likes: nums[2] || 0 };
  }

  function postFromBlock(b, extra) {
    const ch = charByName(b["角色"]) || charByName(b["作者"] || b["昵称"], true);
    const images = none(b["配图"]) ? [] : b["配图"].split(/\s*[|｜]\s*/).filter(Boolean).slice(0, 9).map(raw => {
      const withFace = /^[【\[(（]\s*本人\s*[】\])）]/.test(raw);
      return { desc: raw.replace(/^[【\[(（]\s*本人\s*[】\])）]\s*/, ""), withFace };
    });
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
      authorName: (b["作者"] || b["昵称"] || (ch && ch.name) || "微博用户").replace(/^@/, ""),
      verified: b["认证"] || "无", vip: yes(b["会员"]),
      gender: /女/.test(b["性别"] || "") ? "女" : /男/.test(b["性别"] || "") ? "男" : "",
      source: none(b["来源"]) ? "" : b["来源"],
      createdAt: parseRelTime(b["时间"]),
      text: (b["正文"] || "").trim(),
      images, repost,
      counts: parseCounts(b["转评赞"]),
      liked: false, comments: [], commentsGenerated: false,
      ...(b["分区"] ? { section: /实时/.test(b["分区"]) ? "live" : "hot" } : {}),
      ...extra,
    };
    if (b["热评"]) {
      post.comments = commentsFromBlocks(inlineComments(b["热评"]), post, {});
      if (post.comments.length >= 3) post.commentsGenerated = true;
      post.counts.comments = Math.max(post.counts.comments, post.comments.length);
    }
    if (ch) {
      const acc = S.accounts[ch.id];
      if (!acc || !acc.nickname || acc.nickname === ch.name) ensureAccount(ch.id, { nickname: post.authorName, verified: post.verified, vip: post.vip });
      if (post.gender && !S.accounts[ch.id].gender) ensureAccount(ch.id, { gender: post.gender });
      post.authorName = S.accounts[ch.id].nickname;
    }
    return post;
  }

  /** 模型自创的评论列表：「- 昵称：内容」「↳ A 回复 B：内容」 */
  function inlineComments(text) {
    const out = [];
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.replace(/\*\*/g, "").trim(); if (!line) continue;
      let m = line.match(/^[↳└┗╰>→]+[─—\-\s]*([^：:\s][^：:]{0,30}?)\s*回复\s*@?([^：:]{1,30}?)\s*[：:]\s*(.+)$/);
      if (m) { out.push({ 作者: m[1].trim(), 内容: m[3].trim(), _replyToName: m[2].trim() }); continue; }
      m = line.match(/^(?:[-*•·]|\d+[.、])\s*([^：:]{1,30}?)\s*[：:]\s*(.+)$/);
      if (m) { out.push({ 作者: m[1].trim(), 内容: m[2].trim() }); continue; }
      if (out.length && !/^[【=]/.test(line)) out[out.length - 1].内容 += line;
    }
    return out;
  }
  /** 评论块解析，失败时退回到自由格式 */
  function parseComments(text) {
    const blocks = parseBlocks(text, "评论");
    return blocks.length ? blocks : inlineComments(normalizeOutput(text).replace(/===[^=\n]+===/g, ""));
  }
  /** 是不是在冒充用户本人 */
  function isUserName(name) {
    const n = String(name || "").replace(/\s/g, "");
    return [S.meta.nickname, S.identity.name].filter(x => x && x.length >= 2).some(x => n === x || n.includes(x));
  }

  function commentsFromBlocks(blocks, post, idMap) {
    const out = [];
    for (const b of blocks) {
      if (b["来自"] || isUserName(b["作者"]) || isUserName(b["角色"])) continue;
      const ch = charByName(b["角色"]) || charByName(b["作者"] || b["昵称"], true);
      const name = (b["作者"] || b["昵称"] || (ch && charNickname(ch.id)) || "微博用户").replace(/^@/, "");
      const isPostAuthor = (post.authorType === "char" && ch && ch.id === post.charId) || (post.authorType === "npc" && !ch && name === post.authorName);
      if (ch) { const acc = S.accounts[ch.id]; if (!acc || !acc.nickname) ensureAccount(ch.id, { nickname: name }); }
      const c = {
        id: uid("c"), parentId: null, replyToName: "",
        authorType: ch ? "char" : "npc", charId: ch ? ch.id : undefined,
        authorName: ch ? charNickname(ch.id) : name,
        text: (b["内容"] || "").trim(), likes: clampInt(b["赞"], rand(0, 30)), liked: false,
        isPostAuthor, createdAt: new Date(Math.min(Date.now(), Math.max(Date.now() - rand(5, 3000) * 1000, new Date(post.createdAt).getTime() + rand(30, 600) * 1000))).toISOString(),
      };
      if (!c.text) continue;
      const code = String(b["编号"] || "").trim();
      if (code) { idMap[code] = c; c._local = code; }
      const replyCode = String(b["回复"] || "").trim();
      if (b._replyToName) {
        const t = [...out].reverse().find(x => x.authorName === b._replyToName)
          || (post.comments || []).slice().reverse().find(x => x.authorName === b._replyToName || (x.authorType === "user" && isUserName(b._replyToName)));
        if (t) { c.parentId = t.parentId || t.id; c.replyToName = t.parentId ? t.authorName : ""; }
      } else if (!none(replyCode)) {
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
  function genderOf(post) {
    if (post.authorType === "user") return S.identity.gender || "";
    if (post.authorType === "char") return (S.accounts[post.charId] || {}).gender || post.gender || "";
    return post.gender || "";
  }
  function genderLine(post) {
    const g = genderOf(post);
    const who = post.authorType === "char" ? `（角色 ${charById(post.charId)?.name}，以角色设定为准）` : "";
    return g ? `博主性别：${g}${who}。评论里称呼博主一定要用对性别。` : `博主性别：${post.authorType === "char" ? "以角色设定为准" : "不确定，评论里用「博主」「ta」称呼"}。`;
  }
  function nowText() {
    const d = new Date(); const w = "日一二三四五六"[d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${w} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  // 规则和输出格式在预设条目里（presets.json，按 nox_weibo 标签命中）；这里只在末尾再提醒一次格式
  const FORMAT_HINT = {
    feed: "===微博===（需要时加 ===私信===）", comments: "===评论===", reaction: "===评论=== 和 ===互动===（需要时加 ===私信===）", reply: "===评论===（需要时加 ===私信=== 和 ===互动===）", profile: "===主页=== 和 ===微博===",
    dm: "===私信===",
    hot: "===热搜===", topic: "===话题=== 和 ===微博===", search: "===微博===", npc: "===主页=== 和 ===微博===",
  };
  // 调试记录：最近 10 次 AI 调用，存进 db，关掉 APP 也在
  S.debug = [];
  function logAi(entry) {
    S.debug = [{ at: nowIso(), ...entry, text: String(entry.text || "").slice(0, 6000) }, ...S.debug].slice(0, 10);
    dbUpsert(COL.meta, { id: "debug_log", entries: S.debug }).catch(() => {});
  }
  function noteParsed(summary) { if (S.debug[0]) { S.debug[0].parsed = summary; dbUpsert(COL.meta, { id: "debug_log", entries: S.debug }).catch(() => {}); } }

  async function generate(payload, label) {
    const job = uid("job"); S.jobs.add(job);
    const scene = (payload.appTags || [])[1];
    const who = `用户的名字是「${S.identity.name || "用户"}」，微博昵称是「${S.meta.nickname}」。` + (scene === "hot" ? "" : `\n${publicLine(false)}`);
    if (scene === "dm") payload = { ...payload, instruction: [
      who, payload.instruction,
      "【输出要求】只输出 ===私信=== 块，一句话一个块，字段名照抄「私信聊天」规则里的格式；不要写旁白、动作或心理描写，不要加任何解释，不能替用户说话。",
    ].join("\n\n") };
    else if (FORMAT_HINT[scene]) payload = { ...payload, instruction: [
      who, payload.instruction,
      `【输出要求】这不是聊天回复：不要用聊天格式，不要写旁白、动作或心理描写，不要加任何解释，不要自创字段名或用【】标题，只输出 ${FORMAT_HINT[scene]} 格式的内容，字段名和分隔线照抄「微博」规则里的格式。${scene === "hot" ? "用户是公众人物、或剧情里真的发生了大事时，热搜词条可以和用户有关，但只写事件，不替用户说话。" : "用户本人不能出现在你生成的内容里。"}`,
    ].join("\n\n") };
    try {
      const r = await api.ai.generate(payload);
      const text = (r && r.text) || "";
      logAi({ label, ok: true, text });
      return text;
    } catch (e) {
      console.error(label, e);
      logAi({ label, ok: false, error: String((e && e.message) || e) });
      toast(`${label}失败：${(e && e.message) || e}`.slice(0, 80));
      return null;
    } finally { S.jobs.delete(job); }
  }
  /** 解析不出内容时，让用户能看到 AI 原始返回，方便排查 */
  async function parseFailed(label) {
    noteParsed("❗ 没认出任何内容");
    const choice = await sheet(`${label}：没认出 AI 返回的内容`, [{ label: "查看 AI 原始返回", value: "raw" }]);
    if (choice === "raw") openRaw();
  }
  function openRaw() {
    openPage("raw", pg => {
      const list = S.debug;
      $(".page-body", pg.el).innerHTML = list.length
        ? `<div class="form-note">最近 ${list.length} 次 AI 调用，最新的在最上面。截图发给 Nox 就能修～</div>` + list.map(r => `
          <div style="background:var(--wb-card);margin-bottom:8px;padding:10px 16px">
            <div style="font-size:13px;font-weight:600">${r.ok ? "✅" : "❌"} ${esc(r.label)} <span style="font-weight:400;color:var(--wb-text-3)">· ${fmtTime(r.at)}${r.ok ? ` · ${String(r.text || "").length} 字` : ""}</span></div>
            ${r.parsed ? `<div style="font-size:12px;color:var(--wb-orange);margin-top:2px">解析结果：${esc(r.parsed)}</div>` : ""}
            ${r.error ? `<div style="font-size:12px;color:var(--wb-red);margin-top:4px">${esc(r.error)}</div>` : ""}
            ${r.ok ? `<pre style="margin:6px 0 0;white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;max-height:320px;overflow:auto;color:var(--wb-text-2);user-select:text;-webkit-user-select:text">${esc(r.text || "（空的，AI 什么都没返回）")}</pre>` : ""}
          </div>`).join("")
        : `<div class="empty">还没有调用过 AI</div>`;
    }, { title: "调试记录" });
  }

  /** 清空当前身份的全部微博内容：微博、评论、角色主页、我的主页 */
  async function wipeAll() {
    const ok = await sheet("清空后不能恢复。会删除当前身份下所有微博和评论、角色的微博主页，你的微博主页也会恢复初始。", [{ label: "清空微博所有内容", value: "yes", danger: true }]);
    if (ok !== "yes") return;
    if (S.feedBusy || S.jobs.size) { toast("还有内容在生成，等一下再清空"); return; }
    toast("正在清空…");
    for (const p of S.posts.slice()) await deletePost(p);
    for (const c of S.chars) {
      const acc = S.accounts[c.id]; if (!acc) continue;
      // 上传的主页背景算设置，留着
      if (acc.coverRef) { S.accounts[c.id] = { charId: c.id, coverRef: acc.coverRef }; saveAccount(c.id); continue; }
      delete S.accounts[c.id];
      try { await api.db.delete(COL.accounts, `acc_${c.id}`); } catch (e) { /* ignore */ }
    }
    for (const key of ["avatarRef", "coverRef"]) if (S.meta[key]) api.media.delete({ ref: S.meta[key] }).catch(() => {});
    // 设置（参与角色、特别关注、头像库、默认配图）保留，只清内容
    S.meta = { id: S.meta.id, nickname: S.identity.name || "微博用户", bio: "", ip: "", cover: 0, followers: rand(18, 120), followNpc: [], unfollowChars: [], pinnedPostId: null,
      excludedChars: S.meta.excludedChars || [], starredChars: S.meta.starredChars || [], avatarPool: S.meta.avatarPool || [], placeholderRef: S.meta.placeholderRef || null,
      publicFigure: !!S.meta.publicFigure, publicChars: S.meta.publicChars || [], fans: [], seen: { at: nowIso(), comment: nowIso(), like: nowIso(), follow: nowIso() } };
    saveMeta();
    S.hot = { id: S.hot.id, at: null, items: [] }; saveHot();
    S.topics = { id: S.topics.id, map: {}, recent: [] }; saveTopics();
    S.npcs = { id: S.npcs.id, map: {} }; saveNpcs();
    for (const t of S.threads) { try { await api.db.delete(COL.dms, t.id); } catch (e) { /* ignore */ } }
    S.threads = [];
    S.allPostRows = (await dbList(COL.posts)).length;
    S.homeTab = "follow"; feedLimit = 30;
    while (pages.length) closePage();
    renderTab(); toast("已清空");
  }

  /** 写记忆并登记到相关的微博/评论上，删除时能一起删掉 */
  function remember(charId, summary, eventId, createdAt, ...owners) {
    if (!charId || !api.memory || !api.memory.addTimeline) return;
    for (const o of owners) {
      if (!o) continue;
      o.memEvents = (o.memEvents || []).filter(e => !(e.charId === charId && e.eventId === eventId));
      o.memEvents.push({ charId, eventId });
    }
    api.memory.addTimeline({ characterId: charId, appLabel: "微博", detail: "weibo", summary, appEventId: eventId, ...(createdAt ? { createdAt } : {}) })
      .catch(e => console.warn("写入记忆失败", e));
  }
  function forget(events) {
    if (!api.memory || !api.memory.deleteTimeline) return;
    for (const e of events || []) api.memory.deleteTimeline({ characterId: e.charId, appEventId: e.eventId }).catch(() => {});
  }
  /** 一条微博相关的全部记忆：登记过的 + 旧数据按规则推出来的 */
  function memEventsOfPost(p) {
    const list = [...(p.memEvents || [])];
    for (const c of p.comments || []) list.push(...(c.memEvents || []));
    if (p.authorType === "char") list.push({ charId: p.charId, eventId: `weibo_own_${p.id}` }, { charId: p.charId, eventId: `weibo_like_${p.id}` });
    if (p.authorType === "user") {
      const chars = new Set([...(p.comments || []).filter(c => c.charId).map(c => c.charId), ...(p.likedBy || []), ...(p.reposts || []).filter(r => r.charId).map(r => r.charId)]);
      for (const ch of chars) list.push({ charId: ch, eventId: `weibo_post_${p.id}_${ch}` });
    }
    return list;
  }

  /** 角色自己发的微博也记进他的记忆，回微信聊天时接得上 */
  function rememberOwnPost(p) {
    if (p.authorType !== "char") return;
    const pics = p.images && p.images.length ? `（配图：${p.images.map(i => i.desc || "图片").join("、").slice(0, 60)}）` : "";
    const what = p.repost ? `转发了 @${p.repost.author} 的微博「${p.repost.text.slice(0, 40)}」，转发语：「${p.text.slice(0, 60)}」` : `发了一条微博：「${p.text.slice(0, 120)}」${pics}`;
    remember(p.charId, `${charById(p.charId)?.name || "我"}在微博${what}`, `weibo_own_${p.id}`, p.createdAt, p);
  }

  /** 首页刷新 */
  async function refreshFeed() {
    if (S.feedBusy) return;
    if (!activeChars().length) { toast("没有参与微博的角色：先去微信加个好友，或在设置里打开角色"); return; }
    S.feedBusy = true; renderHome();
    const followTab = S.homeTab === "follow";
    const followed = activeChars().filter(c => isFollowingChar(c.id));
    const cast = pickCast(followed.length ? followed : activeChars(), followTab ? 4 : 2);
    const charCount = followTab ? Math.min(cast.length + 1, rand(2, 4)) : 1;
    const npcCount = followTab ? rand(2, 3) : rand(5, 7);
    const followNpc = (S.meta.followNpc || []).slice(0, 6);
    const recent = S.posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8)
      .map(p => `- ${authorOf(p).name}：${p.text.slice(0, 40)}`).join("\n");
    const instruction = [
      `当前时间：${nowText()}`,
      `本轮生成 ${charCount + npcCount} 条微博：角色本人发的约 ${charCount} 条，路人博主 ${npcCount} 条${followTab && followNpc.length ? `（路人里可以有用户关注的博主：${followNpc.join("、")}，昵称一字不差）` : ""}。`,
      `角色微博昵称（已注册的必须沿用）：\n${charsForPrompt(cast)}`,
      `角色是否发博、发什么，按他此刻的状态和心情决定；同一个角色本轮最多 2 条。`,
      `${S.meta.nickname ? `用户的微博昵称是「${S.meta.nickname}」，角色如果在微博里提到用户要用这个昵称 @。` : ""}`,
      recent ? `首页最近已有的微博（不要重复类似内容）：\n${recent}` : "",
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "feed"], instruction }, "刷新");
    S.feedBusy = false;
    if (text == null) { renderHome(); return; }
    // 在「关注」页刷出来的路人微博也留在关注页（像关注页里混进来的推荐）
    const posts = parseBlocks(text, "微博").filter(b => !isUserName(b["作者"])).map(b => postFromBlock(b, { origin: "feed", followFeed: followTab || undefined }))
      .filter(p => p.text || p.images.length || p.repost);
    if (!posts.length) { renderHome(); parseFailed("刷新"); return; }
    for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; rememberOwnPost(p); }
    const feedDms = parseBlocks(text, "私信").filter(b => charByName(b["角色"]) || charByName(b["来自"], true));
    if (feedDms.length) deliverDms(feedDms, { delay: rand(5000, 12000) });
    const charPosts = posts.filter(p => p.authorType === "char");
    noteParsed(`${posts.length} 条微博（角色 ${charPosts.length} 条${charPosts.length ? "：" + charPosts.map(p => charById(p.charId)?.name).join("、") : ""}；路人 ${posts.length - charPosts.length} 条）`);
    const visibleHere = posts.filter(p => followTab ? inFollowFeed(p) : true).length;
    if (!visibleHere && followTab) { S.homeTab = "recommend"; toast("刷出来的都是路人微博，在「推荐」里"); }
    S.lastRefreshCount = visibleHere || posts.length;
    pruneIfNeeded();
    renderHome(true);
  }

  /** 打开正文页时生成评论区 */
  async function ensureComments(post) {
    if (post.commentsGenerated || post.authorType === "user" || post._genComments) return;
    if (!activeChars().length) return;
    post._genComments = true; rerenderDetail(post);
    const others = pickCast(activeChars().filter(c => c.id !== post.charId), 3);
    const cast = post.authorType === "char" ? [charById(post.charId), ...others].filter(Boolean) : others.length ? others : activeChars().slice(0, 1);
    const author = authorOf(post);
    const want = Math.min(Math.max(post.counts.comments, 3), rand(9, 14));
    const instruction = [
      `当前时间：${nowText()}`,
      `博主：${author.name}${post.authorType === "char" ? `（就是角色 ${charById(post.charId)?.name}）` : "（路人博主）"}`,
      `微博发布于：${fmtTime(post.createdAt)}`,
      genderLine(post),
      `微博正文：\n${post.text}`,
      post.images.length ? `配图：${post.images.map(i => i.desc || "图片").join(" | ")}` : "",
      post.repost ? `这是一条转发，原微博 @${post.repost.author}：${post.repost.text}` : "",
      `可能来评论的其他角色（符合关系才来，不来就不写）：\n${charsForPrompt(others) || "无"}`,
      `用户的微博昵称：${S.meta.nickname}（用户本人不要出现在评论里）`,
      `生成约 ${want} 条评论，其中楼中楼回复 2~5 条${post.authorType === "char" ? "，博主本人至少回复 1 条" : ""}。`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "comments"], instruction }, "加载评论");
    post._genComments = false;
    if (text != null) {
      const list = commentsFromBlocks(parseComments(text), post, {});
      if (list.length) noteParsed(`${list.length} 条评论`); else parseFailed("加载评论");
      post.comments = [...list, ...post.comments];
      post.commentsGenerated = true;
      post.counts.comments = Math.max(post.counts.comments, post.comments.length);
      savePost(post);
    }
    rerenderDetail(post);
  }

  function topicLine(post) {
    const ts = topicsIn(post.text); if (!ts.length) return "";
    const hot = ts.filter(hotItem);
    return `这条微博带了话题 ${ts.map(t => `#${t}#`).join(" ")}${hot.length ? `，其中 ${hot.map(t => `#${t}#`).join(" ")} 正在热搜上：逛话题的路人也会刷到，评论里会有从话题点进来的陌生人` : ""}。`;
  }
  /** 用户发博后：角色和路人的反应 */
  async function reactToUserPost(post) {
    if (post.visibility === "self" || !activeChars().length || post._genComments || post.reacted) return;
    post.reacted = true; post._genComments = true; savePost(post); rerenderDetail(post);
    const cast = pickCast(activeChars(), 6);
    const instruction = [
      `当前时间：${nowText()}`,
      `用户的微博昵称：${S.meta.nickname}，粉丝 ${S.meta.followers} 人。用户性别：${S.identity.gender || "未知（评论里用「博主」「ta」）"}，评论称呼一定要用对性别。`,
      post.repost ? `用户转发了 @${post.repost.author} 的微博：「${post.repost.text}」，转发语：` : `用户的微博正文：`,
      post.text || "（无文字）",
      post.images.length ? `配图：${post.images.map(i => i.desc || "一张用户自己上传的照片").join(" | ")}（看不到图片时不要臆测细节）` : "",
      post.location ? `定位：${post.location}` : "",
      topicLine(post),
      post.visibility === "friends" ? "这条微博仅好友圈可见：只有角色能看到，不要生成路人评论。" : `路人评论 ${topicsIn(post.text).some(hotItem) ? rand(5, 9) : rand(2, 6)} 条左右。`,
      `可能来互动的角色：\n${charsForPrompt(cast)}`,
      starredLine(cast),
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "reaction"], instruction }, "获取互动");
    post._genComments = false; rerenderDetail(post);
    if (text == null) { post.reacted = false; savePost(post); return; }
    const list = commentsFromBlocks(parseComments(text), post, {});
    const sum = parseBlocks(text, "互动")[0] || {};
    const dms = parseBlocks(text, "私信");
    if (!list.length && !Object.keys(sum).length && !dms.length) { parseFailed("发博后的互动"); return; }
    noteParsed(`${list.length} 条评论，点赞角色：${sum["点赞角色"] || "无"}${dms.length ? `，私信 ${dms.length} 条` : ""}`);
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
    if (likedChars.length || clampInt(sum["路人点赞"], 0)) fresh.likeAt = nowIso();
    fresh.reposts = [...(fresh.reposts || []), ...reposts];
    fresh.counts.reposts += reposts.length;
    S.meta.followers += clampInt(sum["新增粉丝"], 0);
    const fanNames = none(sum["新粉丝"]) ? [] : sum["新粉丝"].split(/[、,，\s]+/).map(x => x.replace(/^@/, "").trim()).filter(x => x && !isUserName(x) && !charByName(x, true));
    if (fanNames.length) S.meta.fans = [...fanNames.slice(0, 8).map((name, i) => ({ name, at: new Date(Date.now() - i * 1000).toISOString() })), ...(S.meta.fans || [])].slice(0, 200);
    saveMeta();
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
    if (dms.length) deliverDms(dms, { about: `看到用户发的微博「${(post.text || "（图片）").slice(0, 50)}」后来私信`, delay: delay + rand(2000, 6000) });
    setTimeout(refreshMsgViews, delay + 500);
    savePost(fresh); refreshVisible(fresh);
    // 让角色记住
    const snippet = (post.text || "（图片）").slice(0, 60);
    const userName = S.identity.name || S.meta.nickname;
    for (const ch of new Set([...list.filter(c => c.charId).map(c => c.charId), ...likedChars.map(c => c.id), ...reposts.filter(r => r.charId).map(r => r.charId)])) {
      const mine = list.filter(c => c.charId === ch).map(c => c.text).join(" / ");
      const did = [likedChars.some(c => c.id === ch) ? "点了赞" : "", mine ? `评论：「${mine.slice(0, 80)}」` : "", reposts.some(r => r.charId === ch) ? "转发了" : ""].filter(Boolean).join("，");
      remember(ch, `${userName}在微博发了「${snippet}」，${charById(ch)?.name || "我"}${did}`, `weibo_post_${post.id}_${ch}`, null, fresh);
    }
    savePost(fresh);
  }

  /** 回复里顺便带的「给用户评论点赞」 */
  function likeUserComment(post, userComment, sum) {
    if (!sum) return;
    const c = post.comments.find(x => x.id === userComment.id); if (!c) return;
    const chars = none(sum["点赞角色"]) ? [] : sum["点赞角色"].split(/[、,，\s]+/).map(charByName).filter(Boolean);
    const n = chars.length + clampInt(sum["路人点赞"], 0); if (!n) return;
    c.likedBy = Array.from(new Set([...(c.likedBy || []), ...chars.map(x => x.id)]));
    c.likes += n; c.likeAt = nowIso();
    savePost(post); refreshMsgViews();
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
    const text = await generate({ characterId: charId, appTags: ["nox_weibo", "reply"], instruction }, `${ch.name}回复`);
    if (text == null) return;
    // 等回复的时候用户把评论删了：这轮回复整个作废
    const alive = () => { const p = S.posts.find(x => x.id === post.id); return p && p.comments.some(c => c.id === userComment.id); };
    if (!alive()) { noteParsed("用户已删除评论，回复作废"); return; }
    const list = commentsFromBlocks(parseComments(text), post, {});
    const dms = parseBlocks(text, "私信"); const sum = parseBlocks(text, "互动")[0];
    if (list.length || dms.length) noteParsed(`${list.length} 条回复${dms.length ? `，私信 ${dms.length} 条` : ""}`); else { parseFailed(`${ch.name}回复`); return; }
    const fresh = S.posts.find(p => p.id === post.id); if (!fresh) return;
    likeUserComment(fresh, userComment, sum);
    let delay = rand(1500, 4000);
    for (const c of list) {
      if (!c.parentId) { c.parentId = userComment.parentId || userComment.id; c.replyToName = S.meta.nickname; }
      setTimeout(() => {
        if (!alive()) return;
        c.createdAt = nowIso(); fresh.comments.push(c); fresh.counts.comments++; savePost(fresh);
        if (c.authorType === "char") banner(authorOf(c), c.authorName, `回复了你：${c.text}`, () => openDetail(fresh.id));
        refreshVisible(fresh);
      }, delay);
      delay += rand(1500, 3000);
    }
    if (dms.length) deliverDms(dms, { onlyChar: charId, delay: delay + rand(3000, 8000) });
    const said = list.filter(c => c.charId === charId).map(c => c.text).join(" / ");
    remember(charId, `${S.identity.name || S.meta.nickname}在微博${post.authorType === "char" && post.charId === charId ? "我的微博下" : ""}评论：「${userComment.text.slice(0, 60)}」${said ? `，我回复：「${said.slice(0, 80)}」` : ""}`, `weibo_reply_${userComment.id}`, null, userComment);
    savePost(fresh);
  }

  const NPC_SYSTEM = [
    "你在模拟微博评论区里的陌生网友（路人），只输出评论，不要任何解释。",
    "活人感要求：",
    "- 回复像真实评论区接话：短、口语、就事论事，可用黑话、梗、微博表情（[doge] [允悲] [二哈] [笑cry] [吃瓜]）；正常打标点（可以用空格代替逗号），但不能整句没标点；不写小作文、不煽情。",
    "- 接住对方具体那句话往下聊：调侃、反问、附和、轻怼、阴阳、跑题都行。*绝对禁止说教、爹味、强行升华或客服式回应*。",
    "- 每个路人保持自己的性格和立场。之前在抬杠、阴阳的人被反驳后会继续嘴硬、换角度怼、或者拉别人站队，不会突然认错道歉或变成和事佬；被怼得没话说时可以转移话题、发 [允悲] 或「你急了」。",
    "- 多个路人之间性格各异、可以站不同队，禁止集体吹捧或集体围攻同一个人。",
    "- 这是微博：节奏快、说话冲，围观的人会复读、玩梗、拱火、站队；如果博主是公众人物，粉丝会冲进来反黑控评，黑粉也会继续嘴。",
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
      genderLine(post),
      `用户本人的性别：${S.identity.gender || "未知（用 ta 称呼）"}`,
      `微博正文：${post.text.slice(0, 300)}`,
      targetComment ? `这层评论楼的完整对话（按时间）：\n${floorLines(post, userComment)}` : "",
      `用户（微博昵称「${S.meta.nickname}」）刚刚${targetComment ? `回复了「${targetName}」` : `评论了博主「${targetName}」的微博`}：「${userComment.text}」，编号 ${uCode}。`,
      `生成 1~3 条回复：「${targetName}」一定要回（昵称必须一字不差是「${targetName}」），其他路人可以看热闹插嘴。回复用户的「回复」字段填 ${uCode}，回复本次新评论的填本次编号。`,
      reservedLine(),
      CMT_FORMAT,
      `吵完不服的、或者有话想单独跟用户说的路人，可以再私信用户（大多数时候不用）：\n${DM_FMT}`,
      `认同用户的路人会给用户这条评论点赞，最后输出：\n===互动===\n路人点赞：给用户这条评论点赞的人数（纯数字）\n===结束===`,
    ].filter(Boolean).join("\n\n");
    const job = uid("job"); S.jobs.add(job);
    let text = null;
    try { const r = await api.ai.chat({ system: NPC_SYSTEM, prompt, timeoutMs: 90000 }); text = (r && r.text) || ""; logAi({ label: "路人回复", ok: true, text }); }
    catch (e) { console.error(e); logAi({ label: "路人回复", ok: false, error: String((e && e.message) || e) }); toast(`路人回复失败：${(e && e.message) || e}`.slice(0, 60)); }
    finally { S.jobs.delete(job); }
    if (!text) return;
    const fresh = S.posts.find(p => p.id === post.id); if (!fresh) return;
    const alive = () => fresh.comments.some(c => c.id === userComment.id) && S.posts.includes(fresh);
    if (!alive()) { noteParsed("用户已删除评论，回复作废"); return; }
    const list = commentsFromBlocks(parseComments(text), fresh, {}).map(c => ({ ...c, authorType: "npc", charId: undefined }));
    const dms = parseBlocks(text, "私信").filter(b => !charByName(b["角色"]) && !charByName(b["来自"], true));
    if (!list.length && !dms.length) { parseFailed("路人回复"); return; }
    noteParsed(`${list.length} 条回复${dms.length ? `，私信 ${dms.length} 条` : ""}`);
    likeUserComment(fresh, userComment, parseBlocks(text, "互动")[0]);
    let delay = rand(1500, 4000);
    for (const c of list) {
      if (!c.parentId) { c.parentId = userComment.parentId || userComment.id; c.replyToName = S.meta.nickname; }
      if (c.authorName === post.authorName && post.authorType === "npc") c.isPostAuthor = true;
      setTimeout(() => {
        if (!alive()) return;
        c.createdAt = nowIso(); fresh.comments.push(c); fresh.counts.comments++; savePost(fresh);
        if (c.replyToName === S.meta.nickname) banner(authorOf(c), c.authorName, `回复了你：${c.text}`, () => openDetail(fresh.id));
        refreshVisible(fresh);
      }, delay);
      delay += rand(1800, 4000);
    }
    if (dms.length) deliverDms(dms, { about: `在 @${authorOf(fresh).name} 的微博评论区和用户你来我往过：\n${floorLines(fresh, userComment).slice(0, 500)}`, delay: delay + rand(4000, 10000) });
    setTimeout(refreshMsgViews, delay + 500);
  }

  /** 评论区「加载更多」：继续生成新评论，可以回复已有评论 */
  async function moreComments(post) {
    if (post._genComments || !activeChars().length) return;
    post._genComments = true; rerenderDetail(post);
    const others = pickCast(activeChars().filter(c => c.id !== post.charId), 3);
    const cast = post.authorType === "char" ? [charById(post.charId), ...others].filter(Boolean) : others.length ? others : activeChars().slice(0, 1);
    const existing = post.comments.slice().sort((a, b) => b.likes - a.likes).slice(0, 18).map(c => cmtLine(post, c)).join("\n");
    const instruction = [
      `当前时间：${nowText()}`,
      `博主：${authorOf(post).name}${post.authorType === "user" ? "（就是用户本人，用户不要出现在新评论里）" : post.authorType === "char" ? `（就是角色 ${charById(post.charId)?.name}）` : "（路人博主）"}`,
      `微博正文：\n${post.text}`,
      genderLine(post),
      `已有评论（方括号里是编号）：\n${existing || "无"}`,
      `继续生成 ${rand(5, 8)} 条新评论：可以是新的一级评论，也可以回复已有评论（「回复」字段填已有编号）或本次新评论（填本次编号）。新评论的编号用 n1、n2……`,
      `可能来评论的其他角色（符合关系才来）：\n${charsForPrompt(others) || "无"}`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "comments"], instruction }, "加载评论");
    post._genComments = false;
    if (text != null) {
      const list = commentsFromBlocks(parseComments(text), post, {});
      if (list.length) noteParsed(`${list.length} 条评论`); else parseFailed("加载评论");
      if (post.authorType === "user" && list.length) {
        // 自己的博：新评论算刚到的，顺便来几个赞，通知里能看到
        list.forEach((c, i) => { c.createdAt = new Date(Date.now() - (list.length - i) * rand(5, 40) * 1000).toISOString(); });
        post.counts.likes += rand(1, Math.max(2, list.length)); post.likeAt = nowIso();
        setTimeout(refreshMsgViews, 0);
      }
      post.comments.push(...list);
      post.counts.comments = Math.max(post.counts.comments, post.comments.length);
      savePost(post);
    }
    rerenderDetail(post);
  }

  /**
   * 历史微博的时间挤在一起（模型写成「20分钟前」之类）时，按给出的顺序（近→远）往前铺开：
   * 第一条在 before 之前 0.5～3 天，之后每条再往前 1～40 天。
   */
  function spreadHistory(posts, before) {
    const times = posts.map(p => new Date(p.createdAt).getTime());
    const span = Math.max(...times) - Math.min(...times);
    const tooRecent = times.some(t => t > before - 12 * 3600e3);
    if (posts.length < 2 ? !tooRecent : span > 3 * 86400e3 && !tooRecent) return false;
    let t = before - (0.5 + Math.random() * 2.5) * 86400e3;
    for (const p of posts) {
      p.createdAt = new Date(t - rand(0, 12 * 3600) * 1000).toISOString();
      t -= (1 + Math.random() * 39) * 86400e3;
    }
    return true;
  }
  /** 修旧数据：主页历史微博时间都挤在一起的，重新铺开 */
  function repairHistoryTimes(charId) {
    const hist = S.posts.filter(p => p.charId === charId && p.origin === "profile");
    if (hist.length < 2 || S.accounts[charId]?.historyFixed) return;
    const feed = S.posts.filter(p => p.charId === charId && p.origin !== "profile").map(p => new Date(p.createdAt).getTime());
    const before = feed.length ? Math.min(...feed) : Date.now();
    const ordered = hist.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (spreadHistory(ordered, before)) ordered.forEach(savePost);
    ensureAccount(charId, { historyFixed: true });
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
    const text = await generate({ characterId: charId, appTags: ["nox_weibo", "profile"], instruction }, "加载主页");
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
        .map(p => { p.authorType = "char"; p.charId = charId; p.authorName = charNickname(charId); return p; });
      spreadHistory(posts, oldest);
      for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; }
      ensureAccount(charId, { profileGenerated: true, historyFixed: true });
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
  const inFollowFeed = p => p.authorType === "user" || p.followFeed || (p.authorType === "char" && isFollowingChar(p.charId)) || (p.authorType === "npc" && isFollowingNpc(p.authorName));
  function feedPosts() {
    // 话题页、搜索出来的微博只在那边看，不混进首页
    const list = S.posts.filter(p => p.authorType === "user" || !["profile", "topic", "search"].includes(p.origin));
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
      <button class="top-icon" style="margin-left:0" data-act="wipe" aria-label="清空微博">${I.trash}</button>
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
    return `<div class="profile-cover" style="background:${info.cover}" ${info.coverRef ? `data-bg-ref="${esc(info.coverRef)}"` : ""}>${info.coverAction || ""}</div>
      <div class="profile-box">
        ${avatarHtml(a)}
        <div class="profile-actions">${info.actions || ""}</div>
        <div class="profile-name ${a.vip ? "vip" : ""}">${esc(a.name)}${a.vip ? I.crown : ""}</div>
        ${info.realName ? `<div class="profile-real">${esc(info.realName)}</div>` : ""}
        ${info.verifiedNote ? `<div class="profile-verify"><span class="v ${vClass(a.verified)}" style="position:static;width:14px;height:14px;display:inline-grid;place-items:center;border-radius:50%;color:#fff;font-size:9px;font-weight:800;font-style:italic">V</span>${esc(info.verifiedNote)}</div>` : ""}
        <div class="profile-bio">简介：${esc(info.bio || "暂无简介")}</div>
        ${info.ip ? `<div class="profile-ip">IP属地：${esc(info.ip)}</div>` : ""}
        <div class="profile-stats"><span><b>${fmtNum(info.posts)}</b>微博</span><span ${info.mine ? 'data-act="open-following"' : ""}><b>${fmtNum(info.following)}</b>关注</span><span ${info.mine ? 'data-act="open-fans"' : ""}><b>${fmtNum(info.followers)}</b>粉丝</span></div>
      </div>`;
  }
  /** 我的主页（点头像进）：背景图 + 微博 / 相册 / 赞过 */
  function myHomeHtml() {
    const a = authorOf({ authorType: "user" });
    const posts = myPosts();
    const liked = S.posts.filter(p => p.liked && p.authorType !== "user").sort((x, y) => new Date(y.likedAt || y.createdAt) - new Date(x.likedAt || x.createdAt));
    let body = "";
    if (meTab === "posts") body = posts.length ? posts.map(p => cardHtml(p, { showPin: true })).join("") : `<div class="empty"><div class="big">✏️</div>还没有发过微博<div><button class="btn-primary" data-act="compose">发一条</button></div></div>`;
    if (meTab === "album") {
      const pics = posts.flatMap(p => (p.images || []).map((img, i) => picTile(img, p.id, i)));
      body = pics.length ? `<div class="album">${pics.join("")}</div>` : `<div class="empty">还没有图片</div>`;
    }
    if (meTab === "liked") body = liked.length ? liked.map(p => cardHtml(p, { noFollow: true })).join("") : `<div class="empty">还没有赞过微博</div>`;
    return profileHeaderHtml(a, {
      cover: COVERS[S.meta.cover || 0], coverRef: S.meta.coverRef, bio: S.meta.bio, ip: S.meta.ip, posts: posts.length, following: followingCount(), followers: S.meta.followers, mine: true,
      actions: `<button class="btn-ghost icon-only" data-act="open-settings" aria-label="设置">${I.gear}</button><button class="btn-ghost" data-act="edit-me">编辑资料</button>`,
    }) + `<div class="profile-tabs">
        <button class="${meTab === "posts" ? "on" : ""}" data-act="me-tab" data-tab="posts">微博</button>
        <button class="${meTab === "album" ? "on" : ""}" data-act="me-tab" data-tab="album">相册</button>
        <button class="${meTab === "liked" ? "on" : ""}" data-act="me-tab" data-tab="liked">赞过</button>
      </div>${body}`;
  }
  function openMyHome() {
    if (topPage() && topPage().key === "me-home") return;
    openPage("me-home", pg => { const b = $(".page-body", pg.el); const sc = b.scrollTop; b.innerHTML = myHomeHtml(); b.scrollTop = sc; hydrateImages(b); }, { clearHead: true });
  }
  const followingCount = () => S.chars.filter(c => isFollowingChar(c.id)).length + (S.meta.followNpc || []).length;
  const ME_GRID = [
    { act: "open-album", label: "我的相册", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>' },
    { act: "open-likefav", label: "赞/收藏", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4-6 4z"/><path d="m12 7 1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 13l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z"/></svg>' },
    { act: "open-history", label: "浏览记录", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>' },
    { act: "open-drafts", label: "草稿箱", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 3.5h10l4 4v13H5z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" stroke-linecap="round"/></svg>' },
    { act: "open-super", label: "超话社区", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.5 14.6 9l6 .7-4.4 4.1 1.2 5.9L12 16.8l-5.4 2.9 1.2-5.9L3.4 9.7l6-.7z"/></svg>' },
    { act: "edit-me", label: "编辑资料", icon: I.edit },
    { act: "open-settings", label: "微博设置", icon: I.gear },
  ];
  function renderMe() {
    if (S.tab !== "me") return;
    $("#topbar").innerHTML = `<div class="topbar-inner"><span class="top-title">我</span><button class="top-icon" data-act="open-settings" aria-label="设置">${I.gear}</button></div>`;
    const a = authorOf({ authorType: "user" });
    const visits = (S.meta.visits || []).slice(0, 12);
    const visitHtml = visits.length ? visits.map(v => { const va = v.type === "char" ? authorOf({ authorType: "char", charId: v.charId }) : authorOf({ authorType: "npc", authorName: v.name });
      return `<div class="visit" ${profileAttrs(va)}>${avatarHtml(va)}<span>${esc(va.name)}</span><em>访问${v.count || 1}次</em></div>`; }).join("")
      : `<div class="visit-empty">点进谁的主页，这里就会记下来</div>`;
    $("#view").innerHTML = `<div class="me-head" data-act="open-my-home">${avatarHtml(a)}<div class="cell-main">
        <div class="profile-name ${a.vip ? "vip" : ""}">${esc(a.name)}${a.vip ? I.crown : ""}</div>
        <div class="me-bio">简介：${esc(S.meta.bio || "暂无简介")}</div></div><span class="me-home-link">我的主页 ›</span></div>
      <div class="me-stats">
        <button data-act="open-my-home"><b>${fmtNum(myPosts().length)}</b>微博</button>
        <button data-act="open-following"><b>${fmtNum(followingCount())}</b>关注</button>
        <button data-act="open-fans"><b>${fmtNum(S.meta.followers)}</b>粉丝</button>
        <button data-act="open-visitors"><b>${fmtNum((S.meta.visitors || []).length)}</b>访客</button>
      </div>
      <div class="me-grid">${ME_GRID.map(g => `<button data-act="${g.act}">${g.icon}<span>${g.label}</span></button>`).join("")}</div>
      <div class="me-card"><div class="me-card-head"><b>我的访问记录</b>${visits.length ? `<button data-act="open-visits">查看全部 ›</button>` : ""}</div><div class="visit-row">${visitHtml}</div></div>`;
    hydrateImages($("#view"));
  }
  /** 访问记录：点进谁的主页记一笔（最近 50 个） */
  function noteVisit(v) {
    const key = v.type === "char" ? `c_${v.charId}` : `n_${v.name}`;
    const old = (S.meta.visits || []).find(x => x.key === key);
    S.meta.visits = [{ ...v, key, at: nowIso(), count: (old ? old.count || 1 : 0) + 1 }, ...(S.meta.visits || []).filter(x => x.key !== key)].slice(0, 50);
    saveMeta();
  }
  function noteHistory(postId) {
    S.meta.history = [{ id: postId, at: nowIso() }, ...(S.meta.history || []).filter(x => x.id !== postId)].slice(0, 100);
    saveMeta();
  }
  const isFav = id => (S.meta.favs || []).some(f => f.id === id);
  function personRow(a, extra) {
    return `<div class="list-cell" ${profileAttrs(a)}>${avatarHtml(a)}<div class="cell-main"><div class="${a.vip ? "vip" : ""}">${esc(a.name)}</div>${extra && extra.sub ? `<div class="cell-sub">${esc(extra.sub)}</div>` : ""}</div>${(extra && extra.right) || ""}</div>`;
  }
  function charSub(id) { const acc = S.accounts[id] || {}; return acc.bio || (acc.verifiedNote ? acc.verifiedNote : `TA是${charById(id)?.name || ""}`); }
  function openListPage(key, title, render) { openPage(key, pg => { const b = $(".page-body", pg.el); const sc = b.scrollTop; b.innerHTML = render(pg); b.scrollTop = sc; hydrateImages(b); }, { title }); }
  function openFollowing() {
    openListPage("following", "我的关注", () => {
      const chars = S.chars.filter(c => isFollowingChar(c.id));
      const npcs = S.meta.followNpc || [];
      const rows = [...chars.map(c => personRow(authorOf({ authorType: "char", charId: c.id }), { sub: charSub(c.id), right: `<button class="follow-btn on mutual" data-act="toggle-follow-char" data-char="${esc(c.id)}">互相关注</button>` })),
        ...npcs.map(n => personRow(authorOf({ authorType: "npc", authorName: n }), { sub: (S.npcs.map[n] || {}).bio || "", right: `<button class="follow-btn on" data-act="toggle-follow-npc" data-name="${esc(n)}">已关注</button>` }))];
      return rows.length ? `<div class="form-note">共 ${rows.length} 人</div>${rows.join("")}` : `<div class="empty">还没有关注任何人</div>`;
    });
  }
  function openFans() {
    openListPage("fans", "我的粉丝", () => {
      const chars = S.chars.filter(c => isFollowingChar(c.id));
      const fans = (S.meta.fans || []);
      const rows = [...chars.map(c => personRow(authorOf({ authorType: "char", charId: c.id }), { sub: charSub(c.id), right: `<span class="cell-sub">互相关注</span>` })),
        ...fans.map(f => personRow(authorOf({ authorType: "npc", authorName: f.name }), { sub: `${fmtTime(f.at)} 关注了你`, right: isFollowingNpc(f.name) ? `<span class="cell-sub">互相关注</span>` : `<button class="follow-btn" data-act="toggle-follow-npc" data-name="${esc(f.name)}">回关</button>` }))];
      const rest = Math.max(0, (S.meta.followers || 0) - rows.length);
      return `<div class="form-note">共 ${fmtNum(S.meta.followers)} 位粉丝</div>${rows.join("")}${rest ? `<div class="load-more">还有 ${fmtNum(rest)} 位粉丝</div>` : ""}`;
    });
  }
  function openVisitors() {
    openListPage("visitors", "访客", () => `<div class="empty"><div class="big">👀</div>谁来看过你的主页，会在「char 自动发博」那期上线<br>到时候 char 偷偷来看你、路人来翻你老底，这里都会记着</div>`);
  }
  function openVisits() {
    openListPage("visits", "我的访问记录", () => {
      const list = S.meta.visits || [];
      return list.length ? list.map(v => { const va = v.type === "char" ? authorOf({ authorType: "char", charId: v.charId }) : authorOf({ authorType: "npc", authorName: v.name });
        return personRow(va, { sub: `${fmtTime(v.at)} · 访问${v.count || 1}次` }); }).join("") : `<div class="empty">还没有访问记录</div>`;
    });
  }
  function openAlbum() {
    openListPage("album", "我的相册", () => {
      const pics = myPosts().flatMap(p => (p.images || []).map((img, i) => picTile(img, p.id, i)));
      return pics.length ? `<div class="album">${pics.join("")}</div>` : `<div class="empty">还没有图片</div>`;
    });
  }
  function openLikeFav() {
    let tab = "fav";
    const page = openPage("likefav", pg => {
      const b = $(".page-body", pg.el);
      const favs = (S.meta.favs || []).map(f => S.posts.find(p => p.id === f.id)).filter(Boolean);
      const liked = S.posts.filter(p => p.liked && p.authorType !== "user").sort((x, y) => new Date(y.likedAt || y.createdAt) - new Date(x.likedAt || x.createdAt));
      const list = tab === "fav" ? favs : liked;
      b.innerHTML = `<div class="profile-tabs"><button class="${tab === "fav" ? "on" : ""}" data-act="profile-tab" data-tab="fav">收藏 ${favs.length}</button><button class="${tab === "liked" ? "on" : ""}" data-act="profile-tab" data-tab="liked">赞过 ${liked.length}</button></div>`
        + (list.length ? list.map(p => cardHtml(p, { noFollow: true })).join("") : `<div class="empty">${tab === "fav" ? "还没有收藏，微博右上角「…」里可以收藏" : "还没有赞过微博"}</div>`);
      hydrateImages(b);
    }, { title: "赞/收藏" });
    page.setTab = t => { tab = t; page.render(page); };
  }
  function openHistory() {
    openListPage("history", "浏览记录", () => {
      const list = (S.meta.history || []).map(h => S.posts.find(p => p.id === h.id)).filter(Boolean);
      return list.length ? list.map(p => cardHtml(p, { noFollow: true })).join("") + `<div class="form-note"><button class="link" data-act="clear-history">清空浏览记录</button></div>` : `<div class="empty">还没有浏览记录</div>`;
    });
  }
  function openDrafts() {
    openListPage("drafts", "草稿箱", () => {
      const list = S.meta.drafts || [];
      return list.length ? `<div class="form-note">发微博写到一半退出时可以存成草稿（只存文字）</div>` + list.map(d => `<div class="list-cell draft" data-act="open-draft" data-id="${esc(d.id)}"><div class="cell-main"><div class="draft-text">${esc(d.text)}</div><div class="cell-sub">${fmtTime(d.at)}</div></div>
          <button class="btn-ghost" data-act="del-draft" data-id="${esc(d.id)}">删除</button></div>`).join("") : `<div class="empty">草稿箱是空的</div>`;
    });
  }
  function openSuper() {
    openListPage("super", "超话社区", () => `<div class="coming"><div class="big">⭐</div><b>超话社区正在装修中</b>你关注的超话、搜超话、推荐超话、char 的个人超话和 CP 超话，下一期见～</div>`);
  }
  function renderComing(title, icon, what) {
    $("#topbar").innerHTML = `<div class="topbar-inner"><span class="top-title">${title}</span></div>`;
    $("#view").innerHTML = `<div class="coming"><div class="big">${icon}</div><b>${title}正在装修中</b>${what}</div>`;
  }

  // ───────────────────────── 发现：热搜 / 话题 / 搜索 ─────────────────────────
  const HOT_COUNT = 20;
  const TAG_CLASS = { 爆: "boom", 沸: "boil", 热: "hot", 新: "new" };
  const normTopic = t => String(t || "").replace(/^[#\s]+|[#\s]+$/g, "").slice(0, 40);
  const hotItem = title => (S.hot.items || []).find(x => x.title === title);
  const hotRank = title => (S.hot.items || []).findIndex(x => x.title === title) + 1;
  const topicsIn = text => Array.from(new Set([...String(text || "").matchAll(/#([^#\n]{1,40})#/g)].map(m => normTopic(m[1]))));
  /** 和话题有关的角色：热搜上标了的，加上名字或昵称出现在话题里的 */
  function charsOfTopic(title, rel) {
    const set = new Set();
    for (const n of String(rel || "").split(/[、,，\s]+/)) { const c = charByName(n, true); if (c) set.add(c); }
    for (const c of activeChars()) {
      const nick = S.accounts[c.id] && S.accounts[c.id].nickname;
      if (title.includes(c.name) || (nick && nick.length >= 2 && title.includes(nick))) set.add(c);
    }
    const active = activeChars();
    return [...set].filter(c => active.includes(c));
  }
  /** 热搜词条牵扯到谁：AI 标的「相关」+ 词条里出现的名字、昵称。返回 ["user", charId…] */
  function hotPeople(x) {
    const out = new Set();
    const has = n => n && n.length >= 2 && x.title.includes(n);
    if (/用户/.test(x.rel || "") || has(S.identity.name) || has(S.meta.nickname)) out.add("user");
    for (const c of S.chars) {
      if (has(c.name) || has(S.accounts[c.id] && S.accounts[c.id].nickname)) out.add(c.id);
      else if (x.rel && String(x.rel).split(/[、,，\s]+/).some(n => n === c.name)) out.add(c.id);
    }
    if (x.rel && !none(x.rel) && !out.size) out.add("?");
    return [...out];
  }
  const isRelatedHot = x => hotPeople(x).length > 0;
  /** 按公众人物开关砍：公众人物每人最多 3 条，其余的人加起来最多 1 条 */
  function capHotByPeople(items) {
    const per = {}; let plain = 0;
    return items.filter(x => {
      const ppl = hotPeople(x); if (!ppl.length) return true;
      const pub = ppl.filter(isPublic);
      if (pub.length) { if (pub.some(id => (per[id] || 0) >= 3)) return false; pub.forEach(id => { per[id] = (per[id] || 0) + 1; }); return true; }
      return ++plain <= 1;
    });
  }
  function recentFeedLines(n) {
    return S.posts.filter(p => p.authorType !== "user" && p.origin === "feed").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, n)
      .map(p => `- ${authorOf(p).name}：${p.text.slice(0, 40)}`).join("\n");
  }

  /** 热搜榜：只有点刷新才重新生成 */
  async function refreshHot() {
    if (S.hotBusy) return;
    if (!activeChars().length) { toast("没有参与微博的角色：先去微信加个好友，或在设置里打开角色"); return; }
    S.hotBusy = true; renderFind();
    const cast = pickCast(activeChars(), 5);
    // 上一版里和角色、用户有关的不带过去，免得一直残留在榜上
    const prevItems = (S.hot.items || []).filter(x => !isRelatedHot(x));
    const gapH = S.hot.at ? (Date.now() - new Date(S.hot.at)) / 3600e3 : 99;
    const keep = gapH < 1 ? "8～10" : gapH < 3 ? "4～6" : gapH < 12 ? "2～3" : "0～1";
    const gapText = gapH < 1 ? `${Math.max(1, Math.round(gapH * 60))} 分钟` : gapH < 48 ? `${Math.round(gapH)} 小时` : `${Math.round(gapH / 24)} 天`;
    const prev = prevItems.map(x => `- ${x.title}`).join("\n");
    const recent = recentFeedLines(6);
    const instruction = [
      `当前时间：${nowText()}`,
      `本轮生成 ${HOT_COUNT + 2} 条热搜。`,
      publicLine(true),
      `角色微博昵称：\n${charsForPrompt(cast)}`,
      prev ? `上一版热搜是 ${gapText}前的，只保留其中 ${keep} 条（热度变了），其余全部换成新的：\n${prev}` : "",
      recent ? `首页最近大家在发的（有的可能发酵成热搜）：\n${recent}` : "",
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "hot"], instruction }, "刷新热搜");
    S.hotBusy = false;
    if (text == null) { renderFind(); return; }
    const seen = new Set();
    const items = parseBlocks(text, "热搜").map(b => ({
      title: normTopic(b["热搜词"]), heat: parseNum(b["热度"]),
      tag: (String(b["标签"] || "").match(/[爆沸热新]/) || [""])[0], rel: none(b["相关"]) ? "" : b["相关"].trim(),
    })).filter(x => x.title && !seen.has(x.title) && seen.add(x.title));
    // 兜底：公众人物每人最多 3 条，其他人加起来最多 1 条
    const capped = capHotByPeople(items).slice(0, HOT_COUNT);
    items.length = 0; items.push(...capped);
    if (!items.length) { renderFind(); parseFailed("刷新热搜"); return; }
    // 模型漏写热度时按名次补
    items.forEach((x, i) => { if (!x.heat) x.heat = Math.round(8e6 / (i + 1) + rand(1e4, 9e4)); });
    items.sort((a, b) => b.heat - a.heat);
    noteParsed(`${items.length} 条热搜`);
    S.hot = { ...S.hot, at: nowIso(), items }; saveHot();
    renderFind(true);
  }

  function hotRowHtml(x, i) {
    return `<div class="hot-row" data-act="open-topic" data-topic="${esc(x.title)}"><span class="hot-rank r${i + 1}">${i + 1}</span>
      <span class="hot-title">${esc(x.title)}</span><span class="hot-heat">${fmtNum(x.heat)}</span>${x.tag ? `<span class="hot-tag ${TAG_CLASS[x.tag]}">${x.tag}</span>` : ""}</div>`;
  }
  function hotHeadHtml() {
    return `<div class="hot-head"><b>🔥 微博热搜</b><span class="hot-time">${S.hot.at ? `${fmtTime(S.hot.at)} 更新` : ""}</span>
      <button class="hot-refresh" data-act="hot-refresh" ${S.hotBusy ? "disabled" : ""}>${I.refresh}${S.hotBusy ? "刷新中" : "刷新"}</button></div>
      ${S.hotBusy ? `<div class="gen-tip"><span class="spinner"></span>正在刷新热搜，看看大家在吃什么瓜…</div>` : ""}`;
  }
  /** 发现页下面的热门微博：已有的微博按热度排，越新越靠前，不花 API */
  function hotFeedPosts() {
    const now = Date.now();
    const score = p => heatOf(p) / (1 + Math.max(0, now - new Date(p.createdAt)) / 86400e3);
    return S.posts.filter(p => p.authorType !== "user" && p.origin !== "profile" && p.visibility !== "self")
      .sort((a, b) => score(b) - score(a));
  }
  let findLimit = 20;
  let findTab = "hot";
  /** 看过的话题：按最近看的排，只留最近 20 个；旧版本没记录的按生成时间补在后面 */
  function seenTopics() {
    const recent = (S.topics.recent || []).filter(t => S.topics.map[t]);
    const rest = Object.keys(S.topics.map).filter(t => !recent.includes(t))
      .sort((a, b) => new Date(S.topics.map[b].at || 0) - new Date(S.topics.map[a].at || 0));
    return [...recent, ...rest].slice(0, 20);
  }
  function renderFind(justRefreshed) {
    for (const pg of pages) if (pg.key === "hot-all") pg.render(pg);
    if (S.tab !== "find") return;
    $("#topbar").innerHTML = `<div class="topbar-inner"><button class="search-box" data-act="open-search">${I.search}<span>搜索微博、用户</span></button></div>`;
    const items = S.hot.items || [];
    const hot = items.length
      ? `<div class="hot-grid">${items.slice(0, 9).map((x, i) => `<div class="hot-cell" data-act="open-topic" data-topic="${esc(x.title)}">
          <span class="hot-rank r${i + 1}">${i + 1}</span><span class="hot-title">${esc(x.title)}</span>${x.tag ? `<span class="hot-tag ${TAG_CLASS[x.tag]}">${x.tag}</span>` : ""}</div>`).join("")}
          <div class="hot-cell hot-more" data-act="open-hot-all">更多热搜 ›</div></div>`
      : S.hotBusy ? "" : `<div class="empty"><div class="big">🔥</div>热搜榜还空着<br>刷新一下看看大家在聊什么
        <div><button class="btn-primary" data-act="hot-refresh">${I.refresh.replace("<svg", '<svg width="16" height="16"')}生成热搜</button></div></div>`;
    const tabs = `<div class="profile-tabs find-tabs"><button class="${findTab === "hot" ? "on" : ""}" data-act="find-tab" data-tab="hot">热门微博</button>
      <button class="${findTab === "seen" ? "on" : ""}" data-act="find-tab" data-tab="seen">看过的话题</button></div>`;
    let below = "";
    if (findTab === "seen") {
      const seen = seenTopics();
      below = seen.length ? `<div class="hot-list">${seen.map(t => { const info = S.topics.map[t]; const rank = hotRank(t);
          return `<div class="hot-row" data-act="open-topic" data-topic="${esc(t)}"><span class="hot-title link">#${esc(t)}#</span>
            <span class="hot-heat">${[rank ? `热搜第${rank}` : "", info.reads ? `阅读${fmtNum(info.reads)}` : ""].filter(Boolean).join(" · ")}</span></div>`; }).join("")}</div>`
        : `<div class="empty">还没有看过话题<br>点热搜或微博里的 #话题# 进去看看吧</div>`;
    } else {
      const feed = hotFeedPosts();
      below = feed.length ? feed.slice(0, findLimit).map(p => cardHtml(p, { noFollow: true })).join("")
        + (feed.length > findLimit ? '<button class="load-more" data-act="find-more">查看更多</button>' : '<div class="load-more">没有更多了</div>')
        : `<div class="empty">还没有微博<br>去首页刷新，或者点开热搜看看</div>`;
    }
    $("#view").innerHTML = hotHeadHtml() + hot + tabs + below;
    if (justRefreshed) $("#view").scrollTop = 0;
    hydrateImages($("#view"));
  }
  function openHotAll() {
    openPage("hot-all", pg => {
      const items = S.hot.items || [];
      $(".page-body", pg.el).innerHTML = hotHeadHtml() + (items.length ? `<div class="hot-list">${items.map(hotRowHtml).join("")}</div>` : `<div class="empty">热搜榜还空着</div>`);
    }, { title: "微博热搜" });
  }

  // ── 话题页 ──
  function topicPosts(title) {
    const tag = `#${title}#`;
    return S.posts.filter(p => (p.topic === title || (p.text || "").includes(tag) || (p.repost && (p.repost.text || "").includes(tag)))
      && (p.visibility !== "self" || p.authorType === "user"));
  }
  const heatOf = p => p.counts.likes + p.counts.comments * 3 + p.counts.reposts * 2;
  function openTopic(title) {
    title = normTopic(title); if (!title) return;
    const top = topPage(); if (top && top.key === `topic:${title}`) return;
    let tab = "hot";
    const page = openPage(`topic:${title}`, pg => {
      const body = $(".page-body", pg.el); const scroll = body.scrollTop;
      const info = S.topics.map[title];
      const h = hotItem(title); const rank = hotRank(title);
      const all = topicPosts(title);
      const list = tab === "hot"
        ? all.filter(p => p.section !== "live" || p.authorType === "char").sort((a, b) => heatOf(b) - heatOf(a))
        : all.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const stats = [info && info.reads ? `阅读 ${fmtNum(info.reads)}` : "", info && info.discussions ? `讨论 ${fmtNum(info.discussions)}` : "", rank ? `热搜第 ${rank}` : ""].filter(Boolean).join(" · ");
      const spin = `<div class="gen-tip"><span class="spinner"></span>${info ? "正在加载更多微博…" : "正在打开话题…"}</div>`;
      body.innerHTML = `<div class="topic-head">
          <div class="topic-title">#${esc(title)}#${h && h.tag ? `<span class="hot-tag ${TAG_CLASS[h.tag]}">${h.tag}</span>` : ""}</div>
          ${stats ? `<div class="topic-stats">${stats}</div>` : ""}
          ${info && info.lead ? `<div class="topic-lead"><b>导语</b>${richText(info.lead)}${info.host ? `<div class="topic-host">主持人：${esc(info.host)}</div>` : ""}</div>` : ""}
        </div>
        <div class="profile-tabs"><button class="${tab === "hot" ? "on" : ""}" data-act="profile-tab" data-tab="hot">热门</button>
          <button class="${tab === "live" ? "on" : ""}" data-act="profile-tab" data-tab="live">实时</button></div>
        ${list.map(p => cardHtml(p, { noFollow: true })).join("")}
        ${pg.busy ? spin
          : info ? `<button class="load-more" data-act="topic-more">${list.length ? "加载更多微博" : "还没有微博，点这里加载"}</button>`
          : `<div class="empty">话题还没加载出来<div><button class="btn-primary" data-act="topic-more">重新加载</button></div></div>`}`;
      body.scrollTop = scroll; hydrateImages(body);
    }, {
      title: `#${title}#`,
      footer: `<div class="topic-join"><button class="btn-primary" data-act="join-topic" data-topic="${esc(title)}">${I.edit.replace("<svg", '<svg width="16" height="16"')}参与话题</button></div>`,
    });
    page.topic = title;
    page.setTab = t => { tab = t; page.render(page); };
    S.topics.recent = [title, ...(S.topics.recent || []).filter(t => t !== title)].slice(0, 20); saveTopics();
    if (!S.topics.map[title]) genTopic(page, false);
  }

  async function genTopic(page, more) {
    const title = page.topic;
    if (page.busy) return;
    if (!activeChars().length) { toast("没有参与微博的角色：先去微信加个好友，或在设置里打开角色"); return; }
    page.busy = true; page.render(page);
    const h = hotItem(title); const rank = hotRank(title);
    const related = charsOfTopic(title, h && h.rel);
    // 候选角色：话题相关的优先，没有就随便给两个让 AI 挑；最终最多出现 1 个
    // 话题页不按特别关注排：随机给 3 个候选让 AI 挑最贴近的，免得每次都是同一个人
    const cast = (related.length ? related : shuffle(activeChars()).slice(0, 3)).slice(0, 3);
    const hasChar = topicPosts(title).some(p => p.authorType === "char");
    const existing = topicPosts(title).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8)
      .map(p => `- ${authorOf(p).name}${p.authorType === "user" ? "（用户本人）" : ""}：${p.text.slice(0, 60)}`).join("\n");
    const instruction = [
      `当前时间：${nowText()}`,
      `话题：#${title}#`,
      h ? `这是微博热搜第 ${rank} 名，热度 ${fmtNum(h.heat)}${h.tag ? `，标签「${h.tag}」` : ""}。` : "这个话题不在热搜榜上，热度按话题本身来，小话题就冷清一点。",
      related.length ? `和这个话题有关的角色：${related.map(c => c.name).join("、")}` : "",
      `最多 1 个角色发博：从下面的角色里挑和话题最贴近的那一个${hasChar ? "（话题里已经有角色发过博了，这次不要再有角色）" : ""}，都不贴近就一个都不出现，其余全是路人和媒体。`,
      h && /用户/.test(h.rel) ? `这个话题和用户本人有关（用户的微博昵称「${S.meta.nickname}」）：大家会讨论用户，但用户本人不发言。` : "",
      `角色微博昵称（已注册的必须沿用）：\n${charsForPrompt(cast)}`,
      existing ? `话题里已经有的微博（不要重复，${more ? "接着往下聊" : "说法保持一致"}）：\n${existing}` : "",
      more ? `这次不要输出 ===话题===，只生成 ${rand(5, 7)} 条新的微博，大部分是实时（刚发的）。` : `先输出 ===话题===，再生成 ${rand(7, 9)} 条微博：热门 4 条左右，其余是实时。`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "topic"], instruction }, "加载话题");
    page.busy = false;
    if (text != null) {
      const tb = parseBlocks(text, "话题")[0];
      const posts = parseBlocks(text, "微博").filter(b => !isUserName(b["作者"])).map(b => postFromBlock(b, { origin: "topic", topic: title }))
        .filter(p => p.text || p.images.length || p.repost);
      if (!S.topics.map[title] && (tb || posts.length)) {
        const reads = parseNum(tb && tb["阅读"]) || (h ? h.heat * rand(8, 30) : rand(2, 400) * 1e4);
        S.topics.map[title] = { lead: tb ? tb["导语"].trim() : "", host: tb && !none(tb["主持人"]) ? tb["主持人"].replace(/^@/, "").trim() : "",
          reads, discussions: parseNum(tb && tb["讨论"]) || Math.round(reads / rand(60, 300)), at: nowIso() };
        saveTopics();
      }
      for (const p of posts) {
        if (!p.section) p.section = more ? "live" : "hot";
        if (!p.text.includes(`#${title}#`)) p.text = `#${title}# ${p.text}`;
        S.posts.push(p); savePost(p); S.allPostRows++; rememberOwnPost(p);
      }
      if (posts.length) noteParsed(`${tb ? "导语 + " : ""}${posts.length} 条微博`); else parseFailed("加载话题");
      pruneIfNeeded();
    }
    page.render(page);
  }

  // ── 搜索 ──
  function searchUsers(q) {
    const ql = q.toLowerCase(); const hit = n => n && String(n).toLowerCase().includes(ql);
    const out = S.chars.filter(c => hit(c.name) || hit(S.accounts[c.id] && S.accounts[c.id].nickname)).map(c => authorOf({ authorType: "char", charId: c.id }));
    const seen = new Set();
    for (const p of S.posts) if (p.authorType === "npc" && hit(p.authorName) && !seen.has(p.authorName)) { seen.add(p.authorName); out.push(authorOf(p)); }
    if (hit(S.meta.nickname)) out.push(authorOf({ authorType: "user" }));
    return out;
  }
  function searchPosts(q) {
    const ql = q.toLowerCase(); const hit = s => s && String(s).toLowerCase().includes(ql);
    return S.posts.filter(p => (p.visibility !== "self" || p.authorType === "user")
      && (hit(p.text) || hit(p.repost && p.repost.text) || hit(authorOf(p).name) || p.searchQuery === q))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 80);
  }
  function userCellHtml(a) {
    let sub = "";
    if (a.type === "char") { const acc = S.accounts[a.charId] || {}; sub = [acc.verifiedNote, acc.followers ? `粉丝 ${fmtNum(acc.followers)}` : "", acc.bio].filter(Boolean).join(" · ") || `TA是${charById(a.charId)?.name || ""}`; }
    else if (a.type === "user") sub = "我自己";
    else sub = `微博 ${S.posts.filter(p => p.authorType === "npc" && p.authorName === a.name).length} 条`;
    return `<div class="list-cell" ${profileAttrs(a)}>${avatarHtml(a)}<div class="cell-main"><div class="${a.vip ? "vip" : ""}">${esc(a.name)}</div><div class="cell-sub">${esc(sub)}</div></div></div>`;
  }
  function openSearch(initial) {
    let q = initial || ""; let tab = "posts";
    const page = openPage("search", pg => {
      const body = $(".page-body", pg.el); const scroll = body.scrollTop;
      if (!q) {
        const items = (S.hot.items || []).slice(0, 10);
        body.innerHTML = items.length
          ? `<div class="form-note">大家都在搜</div><div class="hot-list">${items.map(hotRowHtml).join("")}</div>`
          : `<div class="empty">搜搜你想看的人和事～<br>站内没有的，还可以点「搜更多」让大家现发</div>`;
        return;
      }
      const users = searchUsers(q); const posts = searchPosts(q);
      const more = pg.busy ? `<div class="gen-tip"><span class="spinner"></span>正在搜更多「${esc(q)}」…</div>`
        : `<button class="load-more search-more" data-act="search-more">🔍 搜更多「${esc(q)}」相关微博</button>`;
      const list = tab === "users"
        ? (users.length ? users.map(userCellHtml).join("") : `<div class="empty">没有找到相关用户</div>`)
        : (posts.length ? posts.map(p => cardHtml(p, { noFollow: true })).join("") : `<div class="empty">站内还没有「${esc(q)}」相关的微博</div>`) + more;
      body.innerHTML = `<div class="profile-tabs"><button class="${tab === "posts" ? "on" : ""}" data-act="profile-tab" data-tab="posts">微博 ${posts.length}</button>
        <button class="${tab === "users" ? "on" : ""}" data-act="profile-tab" data-tab="users">用户 ${users.length}</button></div>${list}`;
      body.scrollTop = pg.lastQ === q ? scroll : 0; pg.lastQ = q;
      hydrateImages(body);
    }, { title: "", action: `<button class="page-action" data-act="do-search">搜索</button>` });
    $(".page-title", page.el).outerHTML = `<form class="search-form" action="#"><input class="search-input" type="search" maxlength="40" placeholder="搜索微博、用户" enterkeyhint="search"></form>`;
    const input = $(".search-input", page.el); input.value = q;
    page.setTab = t => { tab = t; page.render(page); };
    page.search = () => { q = input.value.trim(); input.blur(); tab = "posts"; page.render(page); };
    page.query = () => q;
    $(".search-form", page.el).addEventListener("submit", e => { e.preventDefault(); page.search(); });
    if (!q) setTimeout(() => input.focus(), 250);
  }

  async function searchMore(page) {
    const q = page.query(); if (!q || page.busy) return;
    if (!activeChars().length) { toast("没有参与微博的角色：先去微信加个好友，或在设置里打开角色"); return; }
    page.busy = true; page.render(page);
    const related = activeChars().filter(c => { const nick = S.accounts[c.id] && S.accounts[c.id].nickname; return q.includes(c.name) || c.name.includes(q) || (nick && (q.includes(nick) || nick.includes(q))); });
    const cast = [...related, ...shuffle(activeChars().filter(c => !related.includes(c))).slice(0, Math.max(0, 2 - related.length))].slice(0, 4);
    const existing = searchPosts(q).slice(0, 8).map(p => `- ${authorOf(p).name}：${p.text.slice(0, 50)}`).join("\n");
    const instruction = [
      `当前时间：${nowText()}`,
      `用户在微博搜索的关键词：「${q}」`,
      related.length ? `关键词和这些角色有关：${related.map(c => c.name).join("、")}` : "",
      `角色微博昵称（已注册的必须沿用）：\n${charsForPrompt(cast)}`,
      existing ? `已经搜到的微博（不要重复）：\n${existing}` : "",
      `生成 ${rand(6, 8)} 条搜索结果微博。`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "search"], instruction }, "搜索");
    page.busy = false;
    if (text != null) {
      const posts = parseBlocks(text, "微博").filter(b => !isUserName(b["作者"])).map(b => postFromBlock(b, { origin: "search", searchQuery: q }))
        .filter(p => p.text || p.images.length || p.repost);
      for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; rememberOwnPost(p); }
      if (posts.length) noteParsed(`${posts.length} 条搜索结果`); else parseFailed("搜索");
      pruneIfNeeded();
    }
    page.render(page);
  }

  // ───────────────────────── 消息：通知 / 私信 ─────────────────────────
  const DM_FMT = "===私信===\n来自：发私信的人（角色写本名，路人写昵称）\n角色：角色本名（路人写 无）\n内容：一条私信（一句一条，连发几条就写几个块）\n===结束===";
  const threadKey = peer => peer.type === "char" ? `c_${peer.charId}` : `n_${peer.name}`;
  const peerAuthor = t => t.peer.type === "char" ? authorOf({ authorType: "char", charId: t.peer.charId }) : authorOf({ authorType: "npc", authorName: t.peer.name });
  const isStrangerThread = t => t.peer.type === "npc" && !isFollowingNpc(t.peer.name);
  const userName = () => S.identity.name || S.meta.nickname;
  function getThread(peer) {
    const key = threadKey(peer);
    let t = S.threads.find(x => x.key === key);
    if (!t) { t = { id: `dm_${S.identity.id}_${key}`, scope: S.identity.id, key, peer, about: "", messages: [], unread: 0, updatedAt: nowIso() }; S.threads.push(t); }
    return t;
  }
  const dmSaveQueue = new Map();
  function saveThread(t) {
    clearTimeout(dmSaveQueue.get(t.id));
    dmSaveQueue.set(t.id, setTimeout(() => { dmSaveQueue.delete(t.id); const { _typing, ...row } = t; dbUpsert(COL.dms, row).catch(e => console.warn("保存私信失败", e)); }, 250));
  }
  function refreshMsgViews() {
    renderTabbar();
    if (S.tab === "msg") renderMsg();
    for (const pg of pages) if (pg.key.startsWith("dm:") || pg.key === "strangers" || pg.key.startsWith("notes:")) pg.render(pg);
  }

  /** 搭车来的私信：按发信人分组，一条一条冒出来 */
  function deliverDms(blocks, ctx = {}) {
    const groups = new Map();
    for (const b of blocks) {
      if (isUserName(b["来自"]) || isUserName(b["角色"])) continue;
      const ch = charByName(b["角色"]) || charByName(b["来自"], true);
      if (ctx.onlyChar && (!ch || ch.id !== ctx.onlyChar)) continue;
      if (ctx.onlyNpc && (ch || b["来自"].replace(/^@/, "").trim() !== ctx.onlyNpc)) continue;
      const peer = ch ? { type: "char", charId: ch.id } : { type: "npc", name: b["来自"].replace(/^@/, "").trim() };
      if (!ch && !peer.name) continue;
      const key = threadKey(peer);
      if (!groups.has(key)) groups.set(key, { peer, texts: [] });
      groups.get(key).texts.push(b["内容"].trim());
    }
    let chars = 0, npcs = 0; let delay = ctx.delay || rand(3000, 8000);
    for (const g of groups.values()) {
      if (g.peer.type === "char" ? ++chars > 1 : ++npcs > 2) continue;
      const t = getThread(g.peer);
      if (g.peer.type === "npc" && !t.about && ctx.about) t.about = ctx.about;
      const texts = g.texts.slice(0, 5);
      const msgs = texts.map(text => ({ id: uid("m"), from: "peer", text, at: null }));
      if (g.peer.type === "char") remember(g.peer.charId, `我在微博私信了${userName()}：「${texts.join(" / ").slice(0, 120)}」`, `weibo_dmout_${uid("e")}`, null, ...msgs);
      msgs.forEach((m, i) => setTimeout(() => {
        const text = m.text;
        const fresh = S.threads.find(x => x.key === t.key); if (!fresh) return;
        m.at = nowIso(); fresh.messages.push(m);
        fresh.updatedAt = nowIso();
        if (!pages.some(pg => pg.key === `dm:${fresh.key}`)) fresh.unread = (fresh.unread || 0) + 1;
        saveThread(fresh);
        if (i === 0) banner(peerAuthor(fresh), peerAuthor(fresh).name, `私信：${text}`, () => openThread(fresh));
        refreshMsgViews();
      }, delay + i * rand(1200, 2600)));
      delay += texts.length * 2600 + rand(2000, 5000);
    }
  }

  // ── 通知：评论 / @ / 赞 从已有数据推出来，关注存在 meta.fans ──
  const NOTE_TYPES = [
    { type: "at", label: "@我的", color: "#6aaed6", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><path d="M15.2 12v1.3a2.2 2.2 0 0 0 4.4 0V12" stroke-linecap="round"/></svg>' },
    { type: "comment", label: "评论", color: "#5bb67f", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><path d="M4 5.5h16v10.5H10l-4 3.5V16H4z"/><path d="M8.5 10.8h.01M12 10.8h.01M15.5 10.8h.01" stroke-width="2.4" stroke-linecap="round"/></svg>' },
    { type: "like", label: "赞", color: "#f0a33a", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><path d="M7.5 10.5v9.5H4.5v-9.5zM7.5 10.5 11 3.5c1.6 0 2.5 1 2.3 2.6l-.5 3.4h5.6c1.3 0 2.2 1.2 1.9 2.4l-1.6 6.3c-.2.9-1 1.5-1.9 1.5H7.5"/></svg>' },
    { type: "follow", label: "关注", color: "#a58be6", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="8.5" r="3.6"/><path d="M3.5 19.5c1-3.3 3.5-5 6.5-5s5.5 1.7 6.5 5M18.5 8v6M15.5 11h6"/></svg>' },
  ];
  function noteItems(type) {
    const nick = S.meta.nickname; const out = [];
    const mine = S.posts.filter(p => p.authorType === "user");
    if (type === "comment") {
      for (const p of S.posts) for (const c of p.comments || []) {
        if (c.authorType === "user") continue;
        const parent = c.parentId ? p.comments.find(x => x.id === c.parentId) : null;
        const toMe = c.replyToName ? isUserName(c.replyToName) : parent && parent.authorType === "user";
        if (toMe) out.push({ at: c.createdAt, who: authorOf(c), action: "回复了你的评论", text: c.text, post: p });
        else if (p.authorType === "user" && !c.parentId) out.push({ at: c.createdAt, who: authorOf(c), action: "评论了你的微博", text: c.text, post: p });
      }
    }
    if (type === "at" && nick) {
      const tag = `@${nick}`;
      for (const p of S.posts) {
        if (p.authorType !== "user" && (p.text || "").includes(tag)) out.push({ at: p.createdAt, who: authorOf(p), action: "在微博中@了你", text: p.text, post: p });
        for (const c of p.comments || []) if (c.authorType !== "user" && (c.text || "").includes(tag)) out.push({ at: c.createdAt, who: authorOf(c), action: "在评论中@了你", text: c.text, post: p });
      }
    }
    if (type === "like") {
      const likeTitle = (names, n) => names.length ? `${names.slice(0, 2).join("、")}${n > Math.min(names.length, 2) ? ` 等${fmtNum(n)}人` : ""}` : `${fmtNum(n)}人`;
      for (const p of mine) {
        const n = p.counts.likes - (p.liked ? 1 : 0); if (n <= 0) continue;
        const names = (p.likedBy || []).map(charNickname);
        const who = (p.likedBy || []).length ? authorOf({ authorType: "char", charId: p.likedBy[0] }) : { type: "npc", name: "路人", seed: p.id };
        out.push({ at: p.likeAt || p.createdAt, who, title: likeTitle(names, n), action: "赞了你的微博", text: "", post: p });
      }
      for (const p of S.posts) for (const c of p.comments || []) {
        if (c.authorType !== "user") continue;
        const n = c.likes - (c.liked ? 1 : 0); if (n <= 0) continue;
        const names = (c.likedBy || []).map(charNickname);
        const who = (c.likedBy || []).length ? authorOf({ authorType: "char", charId: c.likedBy[0] }) : { type: "npc", name: "路人", seed: c.id };
        out.push({ at: c.likeAt || c.createdAt, who, title: likeTitle(names, n), action: "赞了你的评论", text: c.text, post: p });
      }
    }
    if (type === "follow") {
      for (const f of S.meta.fans || []) out.push({ at: f.at, who: authorOf({ authorType: "npc", authorName: f.name }), action: "关注了你", text: "", post: null });
    }
    return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 200);
  }
  const unreadNotes = type => { const seen = new Date((S.meta.seen || {})[type] || 0); return noteItems(type).filter(x => new Date(x.at) > seen).length; };
  const unreadDms = () => S.threads.reduce((n, t) => n + (t.unread || 0), 0);
  const badgeHtml = n => n ? `<span class="badge">${n > 99 ? "99+" : n}</span>` : "";

  function renderMsg() {
    if (S.tab !== "msg") return;
    $("#topbar").innerHTML = `<div class="topbar-inner"><span class="top-title">消息</span></div>`;
    const chevron = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>';
    const icons = NOTE_TYPES.map(n => `<div class="dm-row note-row" data-act="open-notes" data-type="${n.type}">
        <div class="note-circle" style="background:${n.color}">${n.icon}</div><div class="cell-main note-label">${n.label}</div>${badgeHtml(unreadNotes(n.type))}${chevron}</div>`).join("");
    const main = S.threads.filter(t => !isStrangerThread(t) && t.messages.length).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const strangers = S.threads.filter(t => isStrangerThread(t) && t.messages.length).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const row = t => { const a = peerAuthor(t); const last = t.messages[t.messages.length - 1];
      return `<div class="dm-row" data-act="open-thread" data-key="${esc(t.key)}">${avatarHtml(a)}<div class="cell-main"><div class="dm-top"><b class="${a.vip ? "vip" : ""}">${esc(a.name)}</b><span>${fmtTime(last.at)}</span></div>
        <div class="dm-bottom"><div class="dm-last">${last.from === "me" ? "我：" : ""}${esc(last.text)}</div>${badgeHtml(t.unread)}</div></div></div>`; };
    const strangerRow = strangers.length ? `<div class="dm-row" data-act="open-strangers"><div class="note-circle" style="background:#6f8fe8"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg></div><div class="cell-main"><div class="dm-top"><b>陌生人私信</b><span>${fmtTime(strangers[0].updatedAt)}</span></div>
        <div class="dm-bottom"><div class="dm-last">${esc(peerAuthor(strangers[0]).name)}：${esc(strangers[0].messages[strangers[0].messages.length - 1].text)}</div>${badgeHtml(strangers.reduce((n, t) => n + (t.unread || 0), 0))}</div></div></div>` : "";
    $("#view").innerHTML = `<div class="dm-list">${icons}${main.map(row).join("")}${strangerRow}</div>`
      + (main.length || strangers.length ? "" : `<div class="empty">还没有私信<br>去 char 的主页点「私信」，或者发条微博等人来找你</div>`);
    hydrateImages($("#view"));
  }

  function openNotes(type) {
    const def = NOTE_TYPES.find(n => n.type === type); if (!def) return;
    openPage(`notes:${type}`, pg => {
      const items = noteItems(type);
      $(".page-body", pg.el).innerHTML = items.length ? items.map(x => {
        const go = x.post ? `data-act="open-detail" data-post="${esc(x.post.id)}"` : x.who.type === "npc" ? `data-act="open-npc" data-name="${esc(x.who.name)}"` : "";
        const quote = x.post ? `<div class="note-quote">${x.post.authorType === "user" ? "我的微博：" : `@${esc(authorOf(x.post).name)}：`}${esc((x.post.text || "（图片）").slice(0, 60))}</div>` : "";
        return `<div class="note-item" ${go}><div ${x.who.type === "char" || (x.who.type === "npc" && x.who.name !== "路人") ? profileAttrs(x.who) : ""}>${avatarHtml(x.who)}</div><div class="cell-main">
          <div class="dm-top"><b>${esc(x.title || x.who.name)}</b><span>${fmtTime(x.at)}</span></div><div class="note-action">${esc(x.action)}</div>
          ${x.text ? `<div class="note-text">${richText(x.text)}</div>` : ""}${quote}</div></div>`;
      }).join("") : `<div class="empty">还没有${def.label === "关注" ? "新粉丝" : def.label}通知</div>`;
      hydrateImages(pg.el);
    }, { title: def.label });
    S.meta.seen = { ...(S.meta.seen || {}), [type]: nowIso() }; saveMeta(); renderTabbar(); if (S.tab === "msg") renderMsg();
  }

  function openStrangers() {
    openPage("strangers", pg => {
      const list = S.threads.filter(t => isStrangerThread(t) && t.messages.length).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      $(".page-body", pg.el).innerHTML = `<div class="form-note">没关注的人发来的私信</div><div class="dm-list">${list.map(t => { const a = peerAuthor(t); const last = t.messages[t.messages.length - 1];
        return `<div class="dm-row" data-act="open-thread" data-key="${esc(t.key)}">${avatarHtml(a)}<div class="cell-main"><div class="dm-top"><b>${esc(a.name)}</b><span>${fmtTime(last.at)}</span></div>
          <div class="dm-bottom"><div class="dm-last">${last.from === "me" ? "我：" : ""}${esc(last.text)}</div>${badgeHtml(t.unread)}</div></div></div>`; }).join("")}</div>`
        + (list.length ? "" : `<div class="empty">没有陌生人私信</div>`);
      hydrateImages(pg.el);
    }, { title: "陌生人私信" });
  }

  function openThread(t) {
    if (typeof t === "string") t = S.threads.find(x => x.key === t);
    if (!t) return;
    const key = t.key;
    if (topPage() && topPage().key === `dm:${key}`) return;
    const page = openPage(`dm:${key}`, pg => {
      const th = S.threads.find(x => x.key === key); const body = $(".page-body", pg.el);
      if (!th) { body.innerHTML = `<div class="empty">对话已删除</div>`; return; }
      const a = peerAuthor(th); const me = authorOf({ authorType: "user" });
      let lastAt = 0;
      body.innerHTML = `<div class="dm-chat">${th.messages.map(m => {
        const t0 = new Date(m.at).getTime(); const stamp = t0 - lastAt > 5 * 60e3 ? `<div class="dm-stamp">${fmtTime(m.at)}</div>` : ""; lastAt = t0;
        const who = m.from === "me" ? me : a;
        return `${stamp}<div class="dm-msg ${m.from === "me" ? "me" : ""}"><div ${profileAttrs(who)}>${avatarHtml(who, 36)}</div><div class="dm-bubble" data-act="dm-msg" data-id="${esc(m.id)}">${richText(m.text)}</div></div>`;
      }).join("")}${th._typing ? `<div class="dm-msg"><div>${avatarHtml(a, 36)}</div><div class="dm-bubble dm-dots"><i></i><i></i><i></i></div></div>` : ""}</div>`;
      body.scrollTop = body.scrollHeight; hydrateImages(body);
      if (th.unread) { th.unread = 0; saveThread(th); setTimeout(() => { renderTabbar(); if (S.tab === "msg") renderMsg(); }, 0); }
    }, {
      title: peerAuthor(t).name,
      action: `<button class="top-icon" data-act="thread-menu" aria-label="更多">${I.more}</button>`,
      footer: `<div class="reply-bar"><textarea class="reply-input dm-input" rows="1" placeholder="发私信…" maxlength="500"></textarea><button class="tool" data-act="toggle-emoji" style="width:32px;height:32px">${I.emoji}</button><button class="tool dm-regen" data-act="dm-regen" aria-label="让对方回复" style="width:32px;height:32px">✨</button><button class="reply-send" disabled>发送</button></div><div class="emoji-wrap hidden">${emojiPanelHtml()}</div>`,
    });
    page.thread = key;
    const input = $(".reply-input", page.el); const send = $(".reply-send", page.el);
    input.addEventListener("input", () => { send.disabled = !input.value.trim(); input.style.height = "auto"; input.style.height = Math.min(100, input.scrollHeight) + "px"; });
    send.addEventListener("click", () => {
      const th = S.threads.find(x => x.key === key); const text = input.value.trim(); if (!th || !text) return;
      const msg = { id: uid("m"), from: "me", text, at: nowIso() };
      th.messages.push(msg); th.updatedAt = msg.at; saveThread(th);
      input.value = ""; send.disabled = true; input.style.height = "";
      page.render(page); refreshMsgViews();
      replyDm(th, msg);
    });
  }

  const NPC_DM_SYSTEM = [
    "你在模拟微博私信里的一个陌生网友（路人），只输出私信，不要任何解释。",
    "- 保持你自己的性格和立场：之前在评论区跟用户吵过架的，可以继续嘴硬，也可以服软道歉，看用户怎么说；粉丝就是粉丝的语气；发广告的就是广告腔。",
    "- 像真人发私信：一句一条，短，口语，可以连发 1～3 条，可以用微博表情。不写小作文，不说教，不客服式回应。",
    "- 绝对不能以用户本人的身份说话。",
  ].join("\n");

  /** 你发私信后对方回复：char 走角色预设（带记忆），路人走普通对话 */
  async function replyDm(th, msg) {
    if (th._typing) return;
    const lastIsMine = msg && th.messages.length && th.messages[th.messages.length - 1].id === msg.id;
    const history = (lastIsMine ? th.messages.slice(-21, -1) : th.messages.slice(-20)).map(m => `${m.from === "me" ? "用户" : (th.peer.type === "char" ? "你" : th.peer.name)}：${m.text}`).join("\n");
    const recentMine = S.posts.filter(p => p.authorType === "user" && p.visibility !== "self").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 2)
      .map(p => `- ${fmtTime(p.createdAt)}：${(p.text || "（图片）").slice(0, 60)}`).join("\n");
    th._typing = true; refreshMsgViews();
    let text = null;
    if (th.peer.type === "char") {
      const ch = charById(th.peer.charId);
      if (!ch) { th._typing = false; refreshMsgViews(); return; }
      const instruction = [
        `当前时间：${nowText()}`,
        `这是微博私信。你的微博昵称：${charNickname(ch.id)}；用户的微博昵称：${S.meta.nickname}。`,
        recentMine ? `用户最近在微博上发的：\n${recentMine}` : "",
        history ? `你们最近的私信记录：\n${history}` : "这是你们在微博私信里的第一句话。",
        lastIsMine ? `用户刚刚发来：「${msg.text}」` : "用户还没有新消息：你接着刚才的话往下说，或者主动找个话题（按你此刻的状态和心情），不要重复你说过的话。",
        `「来自」写 ${ch.name}，「角色」写 ${ch.name}。`,
      ].filter(Boolean).join("\n\n");
      text = await generate({ characterId: ch.id, appTags: ["nox_weibo", "dm"], instruction }, `${ch.name}私信`);
    } else {
      const prompt = [
        `你是微博用户「${th.peer.name}」。${th.about ? `你和用户的交集：${th.about}` : "你是用户的一个陌生网友。"}`,
        `用户的微博昵称：${S.meta.nickname}，性别：${S.identity.gender || "未知（用 ta 称呼）"}`,
        history ? `你们的私信记录：\n${history}` : "",
        lastIsMine ? `用户刚刚私信你：「${msg.text}」` : "用户还没有回你：你接着刚才的话往下说，不要重复说过的话。",
        `「来自」写 ${th.peer.name}，「角色」写 无。`,
        DM_FMT,
      ].filter(Boolean).join("\n\n");
      const job = uid("job"); S.jobs.add(job);
      try { const r = await api.ai.chat({ system: NPC_DM_SYSTEM, prompt, timeoutMs: 90000 }); text = (r && r.text) || ""; logAi({ label: "路人私信", ok: true, text }); }
      catch (e) { console.error(e); logAi({ label: "路人私信", ok: false, error: String((e && e.message) || e) }); toast(`私信回复失败：${(e && e.message) || e}`.slice(0, 60)); }
      finally { S.jobs.delete(job); }
    }
    const fresh = S.threads.find(x => x.key === th.key);
    if (fresh) fresh._typing = false;
    if (!text || !fresh) { refreshMsgViews(); return; }
    if (lastIsMine && !fresh.messages.some(m => m.id === msg.id)) { noteParsed("用户已删除这条私信，回复作废"); refreshMsgViews(); return; }
    let lines = parseBlocks(text, "私信").map(b => b["内容"].trim());
    if (!lines.length) lines = normalizeOutput(text).replace(/===[^=\n]+===/g, "").split(/\n+/).map(x => x.replace(/^(来自|角色|内容)\s*[：:].*$/, "").trim()).filter(Boolean).slice(0, 4);
    if (!lines.length) { refreshMsgViews(); parseFailed("私信"); return; }
    noteParsed(`${lines.length} 条私信`);
    fresh._typing = true; refreshMsgViews();
    const replies = lines.slice(0, 5).map(text => ({ id: uid("m"), from: "peer", text, at: null }));
    if (th.peer.type === "char") {
      const mine = lastIsMine ? fresh.messages.find(m => m.id === msg.id) : null;
      remember(th.peer.charId, lastIsMine ? `${userName()}在微博私信我：「${msg.text.slice(0, 60)}」，我回：「${lines.join(" / ").slice(0, 100)}」` : `我在微博私信跟${userName()}说：「${lines.join(" / ").slice(0, 100)}」`,
        lastIsMine ? `weibo_dm_${msg.id}` : `weibo_dmout_${uid("e")}`, null, mine, ...replies);
      if (mine) saveThread(fresh);
    }
    replies.forEach((m, i) => setTimeout(() => {
      const line = m.text;
      const t2 = S.threads.find(x => x.key === th.key); if (!t2) return;
      m.at = nowIso(); t2.messages.push(m); t2.updatedAt = nowIso();
      if (i === Math.min(lines.length, 5) - 1) t2._typing = false;
      if (!pages.some(pg => pg.key === `dm:${t2.key}`)) { t2.unread = (t2.unread || 0) + 1; if (i === 0) banner(peerAuthor(t2), peerAuthor(t2).name, `私信：${line}`, () => openThread(t2)); }
      saveThread(t2); refreshMsgViews();
    }, 600 + i * rand(1100, 2400)));

  }

  function renderTabbar() {
    const t = S.tab;
    $("#tabbar").innerHTML = `
      <button class="tab ${t === "home" ? "active" : ""}" data-act="tab" data-tab="home">${t === "home" ? I.homeOn : I.home}<span>首页</span></button>
      <button class="tab ${t === "find" ? "active" : ""}" data-act="tab" data-tab="find">${I.find}<span>发现</span></button>
      <button class="tab-compose" data-act="compose" aria-label="发微博"><span>${I.plus}</span></button>
      <button class="tab ${t === "msg" ? "active" : ""}" data-act="tab" data-tab="msg">${I.msg}<span>消息</span>${badgeHtml(NOTE_TYPES.reduce((n, x) => n + unreadNotes(x.type), 0) + unreadDms())}</button>
      <button class="tab ${t === "me" ? "active" : ""}" data-act="tab" data-tab="me">${t === "me" ? I.meOn : I.me}<span>我</span></button>`;
  }
  function renderTab() {
    renderTabbar();
    if (S.tab === "home") renderHome();
    else if (S.tab === "me") renderMe();
    else if (S.tab === "find") renderFind();
    else renderMsg();
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
    for (const p of pages) if (!post || p.key === `detail:${post.id}` || p.key.startsWith("profile") || p.key.startsWith("topic:") || p.key === "search" || p.key === "me-home" || ["likefav", "history", "album", "following", "fans"].includes(p.key)) p.render(p);
    if (!pages.length || true) { if (S.tab === "home") renderHome(); else if (S.tab === "me") renderMe(); }
  }
  function rerenderDetail(post) { const p = pages.find(x => x.key === `detail:${post.id}`); if (p) p.render(p); }
  function rerenderProfile(charId) { const p = pages.find(x => x.key === `profile:${charId}`); if (p) p.render(p); }

  // ───────────────────────── 正文页 ─────────────────────────
  function openDetail(postId) {
    const post = S.posts.find(p => p.id === postId); if (!post) return;
    noteHistory(postId);
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
    noteVisit({ type: "char", charId });
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
        realName: `${acc.gender === "女" ? "她" : acc.gender === "男" ? "他" : "TA"}是${charById(charId)?.name || ""}`,
        cover: gradientFor(charId + "cover"), coverRef: acc.coverRef, bio: acc.bio,
        coverAction: `<button class="cover-btn" data-act="char-cover" data-char="${esc(charId)}">${I.camera}换背景</button>`, ip: acc.ip, verifiedNote: acc.verifiedNote, posts: Math.max(posts.length, acc.postCount || 0),
        following: acc.following || 0, followers: acc.followers || 0,
        actions: `<button class="follow-btn ${isStarred(charId) ? "star-on" : "on"}" style="height:32px;padding:0 12px;font-size:14px" data-act="toggle-star" data-char="${esc(charId)}">${isStarred(charId) ? "★ 特别关注" : "☆ 特别关注"}</button>
          <button class="follow-btn on" style="height:32px;padding:0 12px;font-size:14px" data-act="open-dm" data-char="${esc(charId)}">私信</button>
          <button class="follow-btn ${following ? "on" : ""}" style="height:32px;padding:0 16px;font-size:14px" data-act="toggle-follow-char" data-char="${esc(charId)}">${following ? "已关注" : "+ 关注"}</button>`,
      }) + `<div class="profile-tabs"><button class="${tab === "posts" ? "on" : ""}" data-act="profile-tab" data-tab="posts">微博</button>
          <button class="${tab === "album" ? "on" : ""}" data-act="profile-tab" data-tab="album">相册</button></div>${list}`;
      body.scrollTop = scroll; hydrateImages(body);
    }, { clearHead: true });
    page.setTab = t => { tab = t; page.render(page); };
    repairHistoryTimes(charId);
    ensureCharProfile(charId);
  }

  function openNpcProfile(name) {
    noteVisit({ type: "npc", name });
    let tab = "posts";
    const page = openPage(`profile-npc:${name}`, pg => {
      const body = $(".page-body", pg.el); const scroll = body.scrollTop;
      const posts = S.posts.filter(p => p.authorType === "npc" && p.authorName === name).sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
      const sample = posts[0] || { authorType: "npc", authorName: name };
      const a = authorOf(sample);
      const info = S.npcs.map[name];
      const following = isFollowingNpc(name);
      const fakeFans = (hashHue(name) * 97) % 50000 + (vClass(a.verified) ? 200000 : 300);
      const busy = pg.busy ? `<div class="gen-tip"><span class="spinner"></span>${info ? "加载更早的微博…" : "正在生成TA的主页…"}</div>` : "";
      const more = !pg.busy && info ? `<button class="load-more" data-act="npc-gen">查看更早的微博</button>` : "";
      const list = tab === "posts" ? (posts.map(p => cardHtml(p, { noFollow: true })).join("") || (pg.busy ? "" : `<div class="empty">暂无微博</div>`)) + busy + more
        : (() => { const pics = posts.flatMap(p => (p.images || []).map((img, i) => picTile(img, p.id, i))); return pics.length ? `<div class="album">${pics.join("")}</div>` : `<div class="empty">还没有图片</div>`; })();
      const genBtn = info ? "" : `<button class="follow-btn gen-btn" style="height:32px;padding:0 12px;font-size:14px" data-act="npc-gen" ${pg.busy ? "disabled" : ""}>${pg.busy ? "生成中…" : "✨ 生成主页"}</button>`;
      body.innerHTML = profileHeaderHtml(a, {
        cover: gradientFor(name + "cover"), bio: info ? info.bio : "", ip: info && info.ip, verifiedNote: info && info.verifiedNote,
        posts: info ? Math.max(posts.length, info.postCount || 0) : posts.length + (hashHue(name) % 900),
        following: info ? info.following : hashHue(name) % 300 + 20, followers: info ? info.followers : fakeFans,
        actions: `${genBtn}<button class="follow-btn on" style="height:32px;padding:0 12px;font-size:14px" data-act="open-dm" data-name="${esc(name)}">私信</button><button class="follow-btn ${following ? "on" : ""}" style="height:32px;padding:0 16px;font-size:14px" data-act="toggle-follow-npc" data-name="${esc(name)}">${following ? "已关注" : "+ 关注"}</button>`,
      }) + (info ? "" : `<div class="form-note">点「✨ 生成主页」，按TA发过的微博和评论生成简介、资料和以前的微博（会用一次 API）</div>`)
        + `<div class="profile-tabs"><button class="${tab === "posts" ? "on" : ""}" data-act="profile-tab" data-tab="posts">微博</button>
          <button class="${tab === "album" ? "on" : ""}" data-act="profile-tab" data-tab="album">相册</button></div>${list}`;
      body.scrollTop = scroll; hydrateImages(body);
    }, { clearHead: true });
    page.npc = name;
    page.setTab = t => { tab = t; page.render(page); };
  }

  /** 路人主页：点了才生成，按他发过的博和评论定人设；生成过的再点就是加载更早的微博 */
  async function genNpcProfile(page) {
    const name = page.npc; if (!name || page.busy) return;
    if (!activeChars().length) { toast("没有参与微博的角色：先去微信加个好友，或在设置里打开角色"); return; }
    const info = S.npcs.map[name];
    page.busy = true; page.render(page);
    const mine = S.posts.filter(p => p.authorType === "npc" && p.authorName === name).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const said = [];
    for (const p of S.posts) for (const c of p.comments || []) if (c.authorType === "npc" && c.authorName === name) said.push(`- 在 ${authorOf(p).name} 的微博「${p.text.slice(0, 24)}」下评论：${c.text.slice(0, 60)}`);
    const oldest = mine.length ? mine[mine.length - 1] : null;
    const instruction = [
      `当前时间：${nowText()}`,
      `这个路人的微博昵称：「${name}」${mine[0] && mine[0].verified && !none(mine[0].verified) ? `（认证：${mine[0].verified}，主页的认证必须一致）` : ""}`,
      mine.length ? `TA发过的微博：\n${mine.slice(0, 8).map(p => `- ${fmtTime(p.createdAt)}：${p.text.slice(0, 80)}`).join("\n")}` : "",
      said.length ? `TA在别人微博下的评论：\n${said.slice(-10).join("\n")}` : "",
      !mine.length && !said.length ? "关于TA的信息很少，按昵称推断一个合理的普通网友。" : "",
      info ? `主页资料已经有了（简介：${info.bio || "无"}），这次不要输出 ===主页===，只写 ${rand(4, 6)} 条更早的历史微博${oldest ? `，时间都早于 ${fmtTime(oldest.createdAt)}` : ""}。`
        : `写 ${rand(5, 7)} 条历史微博${oldest ? `，时间都早于 ${fmtTime(oldest.createdAt)}` : ""}。`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: pickCast(activeChars(), 1).map(c => c.id), appTags: ["nox_weibo", "npc"], instruction }, "生成路人主页");
    page.busy = false;
    if (text != null) {
      const pb = parseBlocks(text, "主页")[0];
      if (pb && !info) {
        S.npcs.map[name] = {
          bio: none(pb["简介"]) ? "" : pb["简介"], gender: /女/.test(pb["性别"] || "") ? "女" : /男/.test(pb["性别"] || "") ? "男" : "",
          verified: pb["认证"] || "无", verifiedNote: none(pb["认证说明"]) ? "" : pb["认证说明"], vip: yes(pb["会员"]),
          ip: none(pb["IP属地"]) ? "" : pb["IP属地"], followers: clampInt(pb["粉丝"], rand(30, 3000)), following: clampInt(pb["关注"], rand(30, 600)), at: nowIso(),
        };
      }
      const posts = parseBlocks(text, "微博").map(b => postFromBlock(b, { origin: "profile" }))
        .filter(p => p.text || p.images.length || p.repost)
        .map(p => { p.authorType = "npc"; p.charId = undefined; p.authorName = name; p.verified = (S.npcs.map[name] || {}).verified || p.verified; return p; });
      spreadHistory(posts, oldest ? new Date(oldest.createdAt).getTime() : Date.now());
      for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; }
      if (S.npcs.map[name]) { S.npcs.map[name].postCount = Math.max(S.npcs.map[name].postCount || 0, mine.length + posts.length + rand(20, 400)); saveNpcs(); }
      if (posts.length || pb) noteParsed(`${pb ? "主页资料 + " : ""}${posts.length} 条历史微博`); else parseFailed("生成路人主页");
      pruneIfNeeded();
    }
    page.render(page);
  }

  // ───────────────────────── 发微博 ─────────────────────────
  function openCompose(repostOf, init) {
    const draft = { text: (init && init.text) || "", images: [], location: "", visibility: "public" };
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
        setTimeout(() => { ta.focus(); const at = repostOf ? 0 : ta.value.length; ta.setSelectionRange(at, at); }, 250);
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
    page.draft = draft; page.repostOf = repostOf; page.draftId = init && init.draftId; page.initText = init && init.draftId ? "" : (init && init.text) || "";
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
      if (repostOf.authorType === "char") remember(repostOf.charId, `${S.identity.name || S.meta.nickname}在微博转发了我的微博「${repostOf.text.slice(0, 40)}」，转发语：「${post.text.slice(0, 60)}」`, `weibo_repost_${post.id}`, null, post, repostOf);
    }
    S.posts.push(post); savePost(post); S.allPostRows++;
    page.sent = true;
    if (page.draftId) { S.meta.drafts = (S.meta.drafts || []).filter(d => d.id !== page.draftId); saveMeta(); }
    closePage(); toast("发送成功");
    const under = topPage();
    if (under && under.topic) under.setTab("live");
    else { S.tab = "home"; S.homeTab = "follow"; renderTab(); }
    if (S.meta.autoReact !== false) setTimeout(() => reactToUserPost(post), rand(2500, 6000));
  }

  function openSettings() {
    openPage("settings", pg => {
      const body = $(".page-body", pg.el); const scroll = body.scrollTop;
      const excluded = new Set(S.meta.excludedChars || []);
      const charsHtml = S.chars.length ? S.chars.map(c => {
        const a = authorOf({ authorType: "char", charId: c.id });
        const on = !excluded.has(c.id);
        return `<div class="list-cell">${avatarHtml(a)}<div class="cell-main"><div>${esc(c.name)}</div><div class="cell-sub">${esc(a.name !== c.name ? `微博：${a.name}` : "还没有微博账号")}</div></div>
          <button class="pub-btn ${isPublic(c.id) ? "on" : ""}" data-act="toggle-public" data-char="${esc(c.id)}">${isPublic(c.id) ? "公众人物" : "普通人"}</button>
          <button class="star-btn ${isStarred(c.id) ? "on" : ""}" data-act="toggle-star" data-char="${esc(c.id)}" aria-label="特别关注">${isStarred(c.id) ? "★" : "☆"}</button>
          <button class="switch ${on ? "on" : ""}" data-act="toggle-part" data-char="${esc(c.id)}" aria-label="参与"><span></span></button></div>`;
      }).join("") : `<div class="empty" style="padding:24px">这个身份还没有角色好友</div>`;
      const pool = S.meta.avatarPool || [];
      body.innerHTML = `
        <div class="form-note">参与的角色 · 开关关掉的人不发微博也不来评论；★ 特别关注的人每次刷新和你发博时一定会被叫到；点「普通人 / 公众人物」切换，公众人物才会上热搜、有粉丝控评</div>
        ${charsHtml}
        <div class="list-cell"><div class="cell-main"><div>发博后自动来互动</div><div class="cell-sub">关掉后发完是安静的，想要互动时点「看看有没有人来评论」</div></div>
          <button class="switch ${S.meta.autoReact !== false ? "on" : ""}" data-act="toggle-auto-react" aria-label="发博后自动来互动"><span></span></button></div>
        <div class="form-note" style="margin-top:8px">路人头像库 · 路人从这里分头像，同一个路人一直是同一张。点图片可以删除</div>
        <div class="album avatar-pool">${pool.map((ref, i) => `<div class="pic" data-act="pool-rm" data-idx="${i}"><img data-ref="${esc(ref)}" alt=""></div>`).join("")}
          <button class="compose-add" data-act="pool-add">＋</button></div>
        <div class="form-note" style="margin-top:8px">默认配图 · 还没生成的配图显示这张，点开能看到图片描述和「生成这张图」</div>
        <div class="list-cell"><div class="pic" style="width:72px;flex:none">${placeholderImg()}</div><div class="cell-main"></div>
          <button class="btn-ghost" data-act="ph-upload">上传更换</button>${S.meta.placeholderRef ? `<button class="btn-ghost" data-act="ph-reset">恢复默认</button>` : ""}</div>
        <div class="form-note"><button class="link" data-act="open-raw" style="font-size:12px">调试记录：查看最近 10 次 AI 调用</button></div>
        <div class="form-note" style="text-align:center">微博 v/*__VERSION__*/</div>`;
      body.scrollTop = scroll; hydrateImages(body);
    }, { title: "微博设置" });
  }

  async function pickImages(max, size) {
    const r = await api.media.pick({ accept: "image/*", multiple: max > 1, limit: max });
    const files = (r && (r.files || (r.file ? [r.file] : []))) || [];
    const refs = [];
    for (const f of files.slice(0, max)) {
      const dataUrl = await compressImage(f.dataUrl, size);
      const stored = await api.media.put({ dataUrl });
      S.mediaCache.set(stored.ref, dataUrl); refs.push(stored.ref);
    }
    return refs;
  }

  function openEditMe() {
    openPage("edit-me", pg => {
      // 重绘时保留还没保存的输入
      const keep = {};
      for (const id of ["f-nick", "f-bio", "f-ip", "f-dev"]) { const el = $("#" + id, pg.el); if (el) keep[id] = el.value; }
      const vipEl = $("#f-vip", pg.el); const pubEl = $("#f-pub", pg.el);
      $(".page-body", pg.el).innerHTML = `<div class="form">
        <div class="form-row"><label>昵称</label><input id="f-nick" maxlength="30" value="${esc(S.meta.nickname)}"></div>
        <div class="form-row"><label>简介</label><textarea id="f-bio" maxlength="140" placeholder="介绍一下自己">${esc(S.meta.bio)}</textarea></div>
        <div class="form-row"><label>IP属地</label><input id="f-ip" maxlength="20" placeholder="如 上海" value="${esc(S.meta.ip)}"></div>
        <div class="form-row"><label>发布设备</label><input id="f-dev" maxlength="30" placeholder="如 iPhone 16 Pro" value="${esc(S.meta.device || "")}"></div>
        <div class="form-row"><label>会员</label><input type="checkbox" id="f-vip" ${S.meta.vip ? "checked" : ""} style="flex:none;width:20px;height:20px"></div>
        <div class="form-row"><label>公众人物</label><input type="checkbox" id="f-pub" ${S.meta.publicFigure ? "checked" : ""} style="flex:none;width:20px;height:20px"><span class="cell-sub" style="margin-left:8px">打开后会上热搜、有粉丝</span></div>
        <div class="form-row"><label>头像</label>${avatarHtml(authorOf({ authorType: "user" }), 44)}<button class="btn-ghost" data-act="upload-avatar">上传图片</button>${S.meta.avatarRef ? `<button class="btn-ghost" data-act="reset-avatar">用身份头像</button>` : ""}</div>
        <div class="form-row" style="display:block;padding-top:12px"><label>封面</label>
          <div class="profile-cover" style="height:90px;border-radius:8px;margin-top:8px;background:${COVERS[S.meta.cover || 0]}" ${S.meta.coverRef ? `data-bg-ref="${esc(S.meta.coverRef)}"` : ""}></div>
          <div class="swatches"><button class="btn-ghost" data-act="upload-cover">上传图片</button>${COVERS.map((c, i) => `<button class="swatch ${!S.meta.coverRef && S.meta.cover === i ? "on" : ""}" style="background:${c}" data-act="pick-cover" data-idx="${i}"></button>`).join("")}</div></div>
      </div><div class="form-note"><button class="link" data-act="open-raw" style="font-size:12px">调试记录：查看最近 10 次 AI 调用</button></div><div class="form-note">头像默认用小手机里的身份头像，也可以单独上传。昵称是你在微博上的名字，角色在微博里会用它称呼你。</div>`;
      for (const id in keep) $("#" + id, pg.el).value = keep[id];
      if (vipEl) $("#f-vip", pg.el).checked = vipEl.checked;
      if (pubEl) $("#f-pub", pg.el).checked = pubEl.checked;
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
        ${url ? `<img src="${url}" alt="">` : placeholderImg()}
        ${img.desc ? `<div class="desc">${esc(img.desc)}</div>` : ""}
        <div class="tools">${!url && img.desc ? `<button data-v="gen">生成这张图</button>` : ""}<button data-v="close">关闭</button></div>`;
    };
    el.onclick = async e => {
      const b = e.target.closest("[data-v]");
      if (!b || b.dataset.v === "close") { if (!b && e.target.tagName === "BUTTON") return; el.remove(); return; }
      if (b.dataset.v === "gen") {
        b.disabled = true; b.textContent = "生成中…（10~30 秒）";
        try {
          // 只有本人出镜的图才带参考图；旧数据没有标注，按描述里的词猜
          const withFace = img.withFace ?? /自拍|合照|合影|镜子|对镜|露脸|侧脸|正脸|背影|本人|我的手|穿搭|自己/.test(img.desc || "");
          const r = await api.ai.generateImage({ prompt: img.desc, characterId: post.charId, useReferenceImage: !!post.charId && withFace, timeoutMs: 120000 });
          if (r && r.dataUrl) {
            const stored = await api.media.put({ dataUrl: await compressImage(r.dataUrl, 1400) });
            img.ref = stored.ref; S.mediaCache.set(stored.ref, r.dataUrl); savePost(post); await draw(); refreshAll();
          }
        } catch (err) { toast(`生图失败：${(err && err.message) || err}`.slice(0, 60)); b.disabled = false; b.textContent = "生成这张图"; }
      }
    };
    document.body.appendChild(el); await draw(); hydrateImages(el);
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
        S.tab = el.dataset.tab; feedLimit = 30; findLimit = 20; renderTab(); $("#view").scrollTop = 0; return;
      case "home-tab": S.homeTab = el.dataset.tab; feedLimit = 30; renderHome(); $("#view").scrollTop = 0; return;
      case "refresh": refreshFeed(); return;
      case "wipe": wipeAll(); return;
      case "feed-more": feedLimit += 30; renderHome(); return;
      case "back": {
        const pg = topPage();
        if (pg && pg.key === "compose" && !pg.repostOf && !pg.sent && (pg.draft.text || "").trim() && (pg.draft.text || "").trim() !== (pg.initText || "").trim()) {
          const v = await sheet("要保存草稿吗？", [{ label: "保存草稿", value: "save" }, { label: "不保存", value: "drop", danger: true }]);
          if (!v) return;
          if (v === "save") {
            const id = pg.draftId || uid("d");
            S.meta.drafts = [{ id, text: pg.draft.text.trim(), at: nowIso() }, ...(S.meta.drafts || []).filter(d => d.id !== id)].slice(0, 50);
            saveMeta(); toast("已存到草稿箱");
          }
        }
        closePage(); return;
      }
      case "open-detail": if (post) openDetail(post.id); return;
      case "open-me": case "open-my-home": openMyHome(); return;
      case "open-following": openFollowing(); return;
      case "open-fans": openFans(); return;
      case "open-visitors": openVisitors(); return;
      case "open-visits": openVisits(); return;
      case "open-album": openAlbum(); return;
      case "open-likefav": openLikeFav(); return;
      case "open-history": openHistory(); return;
      case "clear-history": S.meta.history = []; saveMeta(); refreshAll(); return;
      case "open-drafts": openDrafts(); return;
      case "open-draft": { const d = (S.meta.drafts || []).find(x => x.id === el.dataset.id); if (d) openCompose(null, { text: d.text, draftId: d.id }); return; }
      case "del-draft": S.meta.drafts = (S.meta.drafts || []).filter(x => x.id !== el.dataset.id); saveMeta(); refreshAll(); return;
      case "open-super": openSuper(); return;
      case "open-profile": openCharProfile(el.dataset.char); return;
      case "open-npc": openNpcProfile(el.dataset.name); return;
      case "like": {
        if (!post) return;
        post.liked = !post.liked; post.counts.likes += post.liked ? 1 : -1; post.likedAt = post.liked ? nowIso() : undefined; savePost(post);
        if (post.liked && post.authorType === "char") remember(post.charId, `${S.identity.name || S.meta.nickname}在微博给我的「${post.text.slice(0, 30)}」点了赞`, `weibo_like_${post.id}`, null, post);
        if (!post.liked && post.authorType === "char") forget([{ charId: post.charId, eventId: `weibo_like_${post.id}` }]);
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
          ? [{ label: S.meta.pinnedPostId === post.id ? "取消置顶" : "置顶", value: "pin" }, { label: "删除（相关记忆一起删）", value: "del", danger: true }]
          : [{ label: isFav(post.id) ? "取消收藏" : "收藏", value: "fav" }, { label: "不感兴趣", value: "hide" }, { label: "举报", value: "report" },
            { label: "删除这条微博（相关记忆一起删）", value: "del", danger: true }]);
        if (choice === "hide") { await deletePost(post); toast("将减少此类内容推荐"); refreshAll(); }
        if (choice === "fav") {
          const on = isFav(post.id);
          S.meta.favs = on ? S.meta.favs.filter(f => f.id !== post.id) : [{ id: post.id, at: nowIso() }, ...(S.meta.favs || [])];
          saveMeta(); toast(on ? "已取消收藏" : "已收藏"); refreshAll();
        }
        if (choice === "report") toast("举报已提交");
        if (choice === "pin") { S.meta.pinnedPostId = S.meta.pinnedPostId === post.id ? null : post.id; saveMeta(); toast(S.meta.pinnedPostId ? "已置顶" : "已取消置顶"); refreshAll(); }
        if (choice === "del") {
          for (const p of S.posts) if (p.repost && p.repost.postId === post.id) { p.repost.deleted = true; savePost(p); }
          await deletePost(post); toast("已删除");
          const pg = topPage(); if (pg && pg.key === `detail:${post.id}`) closePage(); else refreshAll();
        }
        return;
      }
      case "detail-tab": { const pg = topPage(); pg.tab = el.dataset.tab; pg.render(pg); return; }
      case "toggle-sort": topPage().toggleSort(); return;
      case "reply-to": {
        const [p, c] = findComment(el.dataset.cmt); if (!c) return;
        if (c.authorType === "user") {
          const v = await sheet("", [{ label: "回复", value: "reply" }, { label: "删除（相关记忆一起删）", value: "del", danger: true }]);
          if (v === "del") {
            const gone = p.comments.filter(x => x.id === c.id || x.parentId === c.id);
            forget(gone.flatMap(x => x.memEvents || []));
            p.comments = p.comments.filter(x => !gone.includes(x)); p.counts.comments = Math.max(0, p.counts.comments - gone.length); savePost(p); rerenderDetail(p); refreshMsgViews();
          }
          if (v !== "reply") return;
        }
        topPage().setReply(c); return;
      }
      case "cancel-reply": topPage().cancelReply(); return;
      case "open-sub": { const [p, c] = findComment(el.dataset.cmt); if (c) { c._open = true; rerenderDetail(p); } return; }
      case "more-cmts":
        if (!post) return;
        // 自己的博还没人来过：走发博后那一整套（评论、点赞、新粉丝、私信）
        if (post.authorType === "user" && !post.reacted && !post.comments.some(c => c.authorType !== "user")) reactToUserPost(post);
        else moreComments(post);
        return;
      case "like-cmt": {
        const [p, c] = findComment(el.dataset.cmt); if (!c) return;
        c.liked = !c.liked; c.likes += c.liked ? 1 : -1; savePost(p); rerenderDetail(p); return;
      }
      case "del-cmt": {
        const [p, c] = findComment(el.dataset.cmt); if (!c) return;
        const gone = p.comments.filter(x => x.id === c.id || x.parentId === c.id);
        forget(gone.flatMap(x => x.memEvents || []));
        p.comments = p.comments.filter(x => !gone.includes(x)); p.counts.comments = Math.max(0, p.counts.comments - gone.length); savePost(p); rerenderDetail(p); return;
      }
      case "view-pic": { const p = findPost(el.dataset.post); if (p) openViewer(p, +el.dataset.idx); return; }
      case "me-tab": meTab = el.dataset.tab; refreshAll(); return;
      case "edit-me": openEditMe(); return;
      case "open-raw": openRaw(); return;
      case "open-settings": openSettings(); return;
      case "toggle-star": {
        const id = el.dataset.char; const on = isStarred(id);
        S.meta.starredChars = on ? S.meta.starredChars.filter(x => x !== id) : [...(S.meta.starredChars || []), id];
        saveMeta(); toast(on ? "已取消特别关注" : "已设为特别关注"); refreshAll(); return;
      }
      case "toggle-public": {
        const id = el.dataset.char; const on = isPublic(id);
        S.meta.publicChars = on ? S.meta.publicChars.filter(x => x !== id) : [...(S.meta.publicChars || []), id];
        saveMeta(); refreshAll(); return;
      }
      case "toggle-auto-react": S.meta.autoReact = S.meta.autoReact === false; saveMeta(); refreshAll(); return;
      case "toggle-part": {
        const id = el.dataset.char; const off = (S.meta.excludedChars || []).includes(id);
        S.meta.excludedChars = off ? S.meta.excludedChars.filter(x => x !== id) : [...(S.meta.excludedChars || []), id];
        saveMeta(); refreshAll(); return;
      }
      case "pool-add": {
        try { const refs = await pickImages(20, 300); if (refs.length) { S.meta.avatarPool = [...(S.meta.avatarPool || []), ...refs]; saveMeta(); toast(`加了 ${refs.length} 张`); refreshAll(); } }
        catch (err) { toast("上传失败"); }
        return;
      }
      case "pool-rm": {
        const i = +el.dataset.idx; const ref = (S.meta.avatarPool || [])[i]; if (!ref) return;
        const ok = await sheet("从头像库删除这张？", [{ label: "删除", value: "yes", danger: true }]);
        if (ok !== "yes") return;
        S.meta.avatarPool.splice(i, 1); api.media.delete({ ref }).catch(() => {}); saveMeta(); refreshAll(); return;
      }
      case "ph-upload": {
        try {
          const [ref] = await pickImages(1, 900); if (!ref) return;
          if (S.meta.placeholderRef) api.media.delete({ ref: S.meta.placeholderRef }).catch(() => {});
          S.meta.placeholderRef = ref; saveMeta(); toast("已更换"); refreshAll();
        } catch (err) { toast("上传失败"); }
        return;
      }
      case "ph-reset": {
        if (S.meta.placeholderRef) api.media.delete({ ref: S.meta.placeholderRef }).catch(() => {});
        S.meta.placeholderRef = null; saveMeta(); refreshAll(); return;
      }
      case "char-cover": {
        const id = el.dataset.char;
        try {
          const [ref] = await pickImages(1, 1280); if (!ref) return;
          const acc = S.accounts[id] || {};
          if (acc.coverRef) api.media.delete({ ref: acc.coverRef }).catch(() => {});
          ensureAccount(id, { coverRef: ref }); toast("已更换"); refreshAll();
        } catch (err) { toast("上传失败"); }
        return;
      }
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
        S.meta.device = $("#f-dev", pg.el).value.trim(); S.meta.vip = $("#f-vip", pg.el).checked; S.meta.publicFigure = $("#f-pub", pg.el).checked;
        saveMeta(); toast("已保存"); closePage(); return;
      }
      case "profile-tab": topPage().setTab(el.dataset.tab); return;
      case "char-more": ensureCharProfile(el.dataset.char, true); return;
      case "compose": openCompose(null); return;
      case "hot-refresh": refreshHot(); return;
      case "open-hot-all": openHotAll(); return;
      case "open-notes": openNotes(el.dataset.type); return;
      case "open-strangers": openStrangers(); return;
      case "open-thread": openThread(el.dataset.key); return;
      case "open-dm": {
        const peer = el.dataset.char ? { type: "char", charId: el.dataset.char } : { type: "npc", name: el.dataset.name };
        const t = getThread(peer); saveThread(t); openThread(t); return;
      }
      case "dm-msg": {
        const pg = topPage(); const th = pg && S.threads.find(x => x.key === pg.thread); if (!th) return;
        const m = th.messages.find(x => x.id === el.dataset.id); if (!m) return;
        const v = await sheet("", [{ label: th.peer.type === "char" ? "删除这条（相关记忆一起删）" : "删除这条", value: "del", danger: true }]);
        if (v === "del") {
          // 同一轮对话共用一条记忆：删掉其中一句，这条记忆就删掉，其他消息上的登记也清掉
          const evs = m.memEvents || [];
          forget(evs);
          const ids = new Set(evs.map(e => e.eventId));
          for (const x of th.messages) if (x.memEvents) x.memEvents = x.memEvents.filter(e => !ids.has(e.eventId));
          th.messages = th.messages.filter(x => x.id !== m.id); saveThread(th); refreshMsgViews();
        }
        return;
      }
      case "dm-regen": {
        const pg = topPage(); const th = pg && S.threads.find(x => x.key === pg.thread); if (!th || th._typing) return;
        const lastMine = [...th.messages].reverse().find(m => m.from === "me");
        replyDm(th, lastMine || null); return;
      }
      case "thread-menu": {
        const pg = topPage(); const th = pg && S.threads.find(x => x.key === pg.thread); if (!th) return;
        const choice = await sheet("", th.peer.type === "char"
          ? [{ label: "只删聊天记录（他还记得）", value: "del", danger: true }, { label: "删除聊天记录和相关记忆", value: "delmem", danger: true }]
          : [{ label: "删除对话", value: "del", danger: true }]);
        if (choice === "delmem") forget(th.messages.flatMap(m => m.memEvents || []));
        if (choice === "del" || choice === "delmem") { S.threads = S.threads.filter(x => x !== th); try { await api.db.delete(COL.dms, th.id); } catch (e) { /* ignore */ } closePage(); refreshMsgViews(); }
        return;
      }
      case "npc-gen": { const pg = topPage(); if (pg && pg.npc) genNpcProfile(pg); return; }
      case "find-more": findLimit += 20; renderFind(); return;
      case "find-tab": findTab = el.dataset.tab; findLimit = 20; renderFind(); return;
      case "open-topic": openTopic(el.dataset.topic); return;
      case "topic-more": { const pg = topPage(); if (pg && pg.topic) genTopic(pg, !!S.topics.map[pg.topic]); return; }
      case "join-topic": openCompose(null, { text: `#${el.dataset.topic}# ` }); return;
      case "open-search": openSearch(); return;
      case "do-search": { const pg = topPage(); if (pg && pg.search) pg.search(); return; }
      case "search-more": searchMore(topPage()); return;
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
