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
    if (t.getFullYear() === now.getFullYear()) return `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${hm}`;
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
  // 路人和 char 小号主页的默认背景（Flora 挑的三张，按名字固定分一张）
  const NPC_COVERS = ["/*__NPC_COVERS__*/"];
  const NPC_COVER_POS = ["center 64%", "center 20%", "center 40%"];
  const npcCover = name => { const i = hashNum(name) % NPC_COVERS.length; return NPC_COVERS[i].startsWith("data:") ? `#222 url(${NPC_COVERS[i]}) ${NPC_COVER_POS[i] || "center"} / cover no-repeat` : gradientFor(name + "cover"); };
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
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M10.08 4.85 L10.58 2.51 L13.42 2.51 L13.92 4.85 L15.70 5.59 L17.71 4.28 L19.72 6.29 L18.41 8.30 L19.15 10.08 L21.49 10.58 L21.49 13.42 L19.15 13.92 L18.41 15.70 L19.72 17.71 L17.71 19.72 L15.70 18.41 L13.92 19.15 L13.42 21.49 L10.58 21.49 L10.08 19.15 L8.30 18.41 L6.29 19.72 L4.28 17.71 L5.59 15.70 L4.85 13.92 L2.51 13.42 L2.51 10.58 L4.85 10.08 L5.59 8.30 L4.28 6.29 L6.29 4.28 L8.30 5.59Z"/><circle cx="12" cy="12" r="3.1"/></svg>',
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
    threads: [],         // 当前身份的私信对话
    alt: null,           // 小号 { id, nickname, bio, avatarRef, ..., knownBy: [charId], posted }
    acct: "main",        // 当前登录的账号：main 大号 / alt 小号
    calts: null,         // char 小号 { id, map: { charId: { nick, state, wait, appeared, strangerDm, createdAt } } }
    supers: null,        // 超话 { id, map: { 名称: {...} }, recommend: [], charSupers: { charId: { about, haunts } } }          // 生成过主页的路人 { id, map: { 昵称: { bio, gender, verified, verifiedNote, vip, ip, followers, following, at } } }
  };

  // ── 大号 / 小号：S.me 是当前账号的资料（大号就是 S.meta） ──
  const isAlt = () => S.acct === "alt" && !!S.alt;
  Object.defineProperty(S, "me", { get: () => (isAlt() ? S.alt : S.meta) });
  const acctOf = x => (x && x.acct === "alt" ? "alt" : "main");
  const profOf = x => (acctOf(x) === "alt" && S.alt ? S.alt : S.meta);
  const curAcct = () => (isAlt() ? "alt" : "main");
  const sameAcct = x => acctOf(x) === curAcct();
  /** 当前账号自己发的 */
  const isMe = x => x.authorType === "user" && sameAcct(x);
  const acctTag = () => (isAlt() ? { acct: "alt" } : {});
  const knowsAlt = charId => !!S.alt && (S.alt.knownBy || []).includes(charId);
  const LK = () => (isAlt() ? "likedAlt" : "liked");
  const LKAT = () => (isAlt() ? "likedAtAlt" : "likedAt");
  /** 超话里的加入 / 经验 / 签到按账号分开 */
  const su = sp => (isAlt() ? (sp.alt || (sp.alt = {})) : sp);
  /** 小号相关的一句话：写进 prompt，告诉 AI 谁知道、谁不知道 */
  function altLine() {
    if (!isAlt()) return "";
    const known = S.chars.filter(c => knowsAlt(c.id)).map(c => c.name);
    return `【小号】用户现在登录的是自己的微博小号「${S.alt.nickname}」（不认证、粉丝很少，和大号「${S.meta.nickname}」是同一个人）。${known.length ? `知道这个小号是用户的角色：${known.join("、")}。除此之外所有人（其他角色和全部路人）` : "所有人（全部角色和路人）"}都不知道这个小号是用户，只把它当成一个普通陌生网友：不会认出来，不会提用户的真名、大号或任何只有熟人才知道的事。`;
  }

  // ── char 小号：资料存在路人主页（S.npcs.map[昵称]，带 altOf），状态存 S.calts.map[charId] ──
  // state：hidden 藏着（她不知道）/ aware 默默记住（她知道，他以为她不知道）/ open 公开（都知道）
  const calt = charId => (S.calts && S.calts.map[charId]) || null;
  const altOwner = name => { if (!S.calts || !name) return null; for (const id in S.calts.map) if (S.calts.map[id].nick === name) return id; return null; };
  const altSeen = charId => !!calt(charId) && calt(charId).state !== "hidden";
  const altOpen = charId => !!calt(charId) && calt(charId).state === "open";
  /** 路人主页资料；藏着的小号还没「生成主页」时当作没有，和普通路人一样 */
  const npcInfo = name => { const i = S.npcs && S.npcs.map[name]; return i && i.pending && !altSeen(altOwner(name)) ? null : i || null; };
  function saveCalts() { if (S.calts) dbUpsert(COL.meta, S.calts).catch(e => console.warn(e)); }
  /**
   * 这一次 char 用哪个号（代码定，不交给 AI）：
   * 她小号发的、他知道她小号 → 小号；超话里（不是她大号的帖）→ 小号；其余都是大号
   */
  function acctFor(charId, ctx = {}) {
    if (!calt(charId)) return "main";
    const up = ctx.post && ctx.post.authorType === "user" ? ctx.post : null;
    if (up) return acctOf(up) === "alt" && knowsAlt(charId) ? "alt" : "main";
    if (ctx.post && ctx.post.altOf === charId) return "alt";
    if (ctx.super || (ctx.post && ctx.post.superName)) return "alt";
    return "main";
  }
  /** 本轮用小号的 char：告诉 AI 用哪个昵称、怎么说话 */
  function caltLine(cast, ctx) {
    return cast.filter(c => c && acctFor(c.id, ctx) === "alt").map(c => {
      const a = calt(c.id);
      return `${c.name} 这次用他自己的微博小号「${a.nick}」出现（不认证、粉丝很少；${altOpen(c.id) ? "用户已经知道这个号是他" : "他没告诉过用户这是他的号，他以为用户不知道"}）：他写的内容「角色」填 ${c.name}，「作者」填「${a.nick}」，不要再用他的大号。小号就是他本人：口癖、性格、在意的事都不变，只是更随意、更真实，不用端着；${altOpen(c.id) ? "" : "不自称是谁，不提自己的真名和大号，不用只有他和用户之间才用的称呼，但说话习惯会不经意露出一点马脚；"}低调，宁可少说。`;
    }).join("\n");
  }
  /** AI 写出来的评论 / 帖子：按 acctFor 统一成一个号（小号 → npc 作者 + altOf） */
  function fixAltAuthors(list, ctx) {
    for (const x of list) {
      const owner = x.authorType === "char" ? x.charId : x.authorType === "npc" ? altOwner(x.authorName) : null;
      if (!owner || !calt(owner)) continue;
      if (acctFor(owner, { ...ctx, post: ctx.post || x }) === "alt") {
        Object.assign(x, { authorType: "npc", charId: undefined, authorName: calt(owner).nick, altOf: owner, verified: "无", vip: false });
        if (ctx.post) x.isPostAuthor = ctx.post.altOf === owner;
      } else {
        Object.assign(x, { authorType: "char", charId: owner, authorName: charNickname(owner) }); delete x.altOf;
        if (ctx.post) x.isPostAuthor = ctx.post.authorType === "char" && ctx.post.charId === owner;
      }
    }
    return list;
  }

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
  function saveMeta() {
    if (S.meta) dbUpsert(COL.meta, S.meta).catch(e => console.warn(e));
    if (S.alt) dbUpsert(COL.meta, S.alt).catch(e => console.warn(e));
  }
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
      .filter(r => r.authorType === "npc" && r.origin !== "profile" && !r.altOf && !r.liked && !r.likedAlt && !isFavAny(r.id) && !(r.comments || []).some(c => c.authorType === "user"))
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
    S.alt = metaRows.find(m => m.id === `alt_${S.identity.id}` && m.nickname) || null;
    S.allPostRows = postRows.length;
    S.posts = postRows.filter(p => p.scope === S.identity.id).map(p => ({ ...p, comments: p.comments || [] }));
    S.accounts = {};
    for (const a of accRows) if (a.charId) S.accounts[a.charId] = a;
    S.debug = (metaRows.find(m => m.id === "debug_log") || {}).entries || [];
    S.hot = metaRows.find(m => m.id === `hot_${S.identity.id}`) || { id: `hot_${S.identity.id}`, at: null, items: [] };
    S.topics = metaRows.find(m => m.id === `topics_${S.identity.id}`) || { id: `topics_${S.identity.id}`, map: {} };
    S.npcs = metaRows.find(m => m.id === `npcs_${S.identity.id}`) || { id: `npcs_${S.identity.id}`, map: {} };
    S.supers = metaRows.find(m => m.id === `supers_${S.identity.id}`) || { id: `supers_${S.identity.id}`, map: {}, recommend: [], charSupers: {} };
    S.calts = metaRows.find(m => m.id === `calts_${S.identity.id}`) || { id: `calts_${S.identity.id}`, map: {} };
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
    if (S.alt) for (const k of ["fans", "visits", "history", "favs", "drafts", "knownBy"]) if (!Array.isArray(S.alt[k])) S.alt[k] = [];
    S.acct = S.alt && S.meta.acct === "alt" ? "alt" : "main";
    S.threads = dmRows.filter(t => t.scope === S.identity.id && t.peer && acctOf(t) === S.acct).map(t => ({ ...t, messages: t.messages || [] }));
    // 第一次有消息页：以前的评论和赞都算已读，列表里照样能看到
    if (!S.me.seen) { const t = nowIso(); S.me.seen = { at: t, comment: t, like: t, follow: t }; saveMeta(); }
    if (!metaRows.some(m => m.id === S.meta.id)) saveMeta();
  }

  // ───────────────────────── 账号 / 头像 ─────────────────────────
  const charById = id => S.chars.find(c => c.id === id);
  const isStarred = id => (S.meta.starredChars || []).includes(id);
  const loverSolo = id => !(S.meta.soloOff || []).includes(id);
  /** 公众人物：用户在编辑资料里开、角色在微博设置里开（按身份分开存） */
  const isPublic = id => id === "user" ? !!S.meta.publicFigure : (S.meta.publicChars || []).includes(id);
  // ── 恋情状态（按身份存 S.meta.love[charId] = { state: none|secret|open, announcedAt } ） ──
  const LOVE_LABEL = { none: "不是恋人", secret: "地下恋", open: "已公开" };
  const LOVE_NOTE = {
    none: "按你们现在的关系来，不额外设定",
    secret: "大号只能暗戳戳：只有你懂的歌词、深夜的月亮、不经意的细节；他绝不在公开场合直接秀",
    open: "公开很久了，大家早习惯了：自然互动，朋友偶尔起哄，不会每条都刷「99」",
  };
  const loveOf = id => ((S.meta.love || {})[id]) || { state: "none" };
  const loveFresh = id => { const l = loveOf(id); return l.state === "open" && l.announcedAt && Date.now() - new Date(l.announcedAt).getTime() < 3 * 864e5; };
  /** 角色怎么称呼用户：按关系和平时的叫法；恋人单独点名 */
  function nameLine() {
    const lovers = S.chars.filter(c => loveOf(c.id).state !== "none" && activeChars().includes(c));
    return "【称呼】角色叫用户什么，按你们的关系和平时的叫法来，聊天记录和记忆里怎么叫就怎么叫：同学、朋友叫全名或外号都正常，照常就行；不要突然换成一个平时不用的叫法。"
      + (lovers.length ? `${lovers.map(c => c.name).join("、")} 和用户是恋人：私信里用你们平时的爱称、昵称（看聊天记录），不要连名带姓叫全名${lovers.some(c => loveOf(c.id).state === "secret") ? "；地下恋的在评论、发博这些公开场合不能用爱称露馅" : ""}。` : "");
  }
  /** 恋人在微博上（发博、评论）怎么提到用户：按人设选叫法，日常不硬 @ */
  function loverPostLine() {
    const lovers = activeChars().filter(c => loveOf(c.id).state !== "none");
    if (!lovers.length) return "";
    return "【恋人怎么提到用户】" + lovers.map(c => loveOf(c.id).state === "open"
      ? `${c.name} 和用户已公开：在微博上提到她怎么叫，先看聊天记录里他平时怎么叫她，照着用；没有现成的，就按他的性格、年龄感和你们的相处模式自己想一个他会用的叫法，不要套用常见的模板称呼。他不避讳就大方叫。`
      : `${c.name} 和用户是地下恋：提到她只能用不暴露身份的说法：从你们的相处里找只有她看得懂的代称或细节，按他的人设来选；不 @ 她、不用你们私下的爱称。`).join("")
      + "日常博的语气和性格要像他平时和用户聊天时的样子（黏不黏人、嘴硬还是直球都要像他）；会自然想到她，但不是每条都提。只有内容真和她有关（想她、你们一起做的事、要给她看的）才 @ 她的微博昵称，吃饭上课这种日常不在句尾硬加 @。";
  }
  /** 别人的微博下面，角色 @ 用户：每批评论约 30% 留 1 条，其余丢掉 */
  function dropCharAtUser(list, post) {
    if (post.authorType === "user" || !S.meta.nickname) return list;
    let quota = Math.random() < 0.3 ? 1 : 0;
    return list.filter(c => !(c.charId && (c.text || "").includes(`@${S.meta.nickname}`)) || quota-- > 0);
  }
  const OTHERS_CMT_LINE = "【别人的微博下面】角色主要是在评论这条微博本身；偶尔看到想跟用户分享的，可以 @ 她一下，但不是每次都 @，也不在别人的评论区里跟她交代事情。";
  /** 告诉 AI 每个人和用户的恋情状态（只写不是「不是恋人」的） */
  function loveLine() {
    return S.chars.filter(c => loveOf(c.id).state !== "none" && c.id !== S._announcing).map(c => {
      const pub = isPublic(c.id); const l = loveOf(c.id);
      if (l.state === "secret") return `【恋情】${c.name} 和用户在谈恋爱，但*没有公开*（地下恋）：他的大号只能暗戳戳——发只有用户懂的歌词、深夜的月亮、不经意的细节，绝不在公开场合直接秀恩爱，被问也不承认；${pub ? "粉丝会猜、CP 粉会扒细节、有人嗑有人坚决否认" : "同学朋友隐约嗅到不对劲，但没有实锤"}。`;
      if (loveFresh(c.id)) return `【恋情】${c.name} 和用户${(d => d ? `${d} 天前` : "今天")(Math.floor((Date.now() - new Date(l.announcedAt).getTime()) / 864e5))}刚在微博官宣：评论区还在沸腾，祝福、起哄、「我就知道」${pub ? "、哭着脱粉、黑粉阴阳、营销号搬运" : ""}；他可以大方互动。`;
      return `【恋情】${c.name} 和用户的恋情*公开很久了*，大家早就习惯：他可以自然地互动、互相 @、偶尔秀一下；朋友${pub ? "和粉丝" : ""}偶尔起哄，大多数时候就正常聊，不会每条互动都刷「99」「锁死」，也不会像刚知道一样惊讶。`;
    }).join("\n");
  }
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
  // ── 路人和用户（大号）的关系：粉丝 meta.fans、互关、回关待定 meta.followAsk、小本子 meta.npcLog ──
  const isFanNpc = name => (S.meta.fans || []).some(f => f.name === name);
  const isMutualNpc = name => isFanNpc(name) && isFollowingNpc(name);
  /** 关注了的 / 关注用户的路人：记最近几次和用户的来往 */
  function logNpc(name, line) {
    if (!name || altOwner(name) || !(isFollowingNpc(name) || isFanNpc(name))) return;
    const log = S.meta.npcLog || (S.meta.npcLog = {}); const d = new Date();
    log[name] = [...(log[name] || []), `${d.getMonth() + 1}月${d.getDate()}日 ${line}`].slice(-6); saveMeta();
  }
  /** 给 AI 的路人资料卡：关系、简介、最近的博、小本子 */
  function npcCard(name) {
    const info = S.npcs.map[name] && !S.npcs.map[name].pending ? S.npcs.map[name] : null;
    const posts = S.posts.filter(p => p.authorType === "npc" && p.authorName === name && !p.altOf).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 2).map(p => `「${p.text.slice(0, 30)}」`);
    const rel = isMutualNpc(name) ? "和用户互关" : isFanNpc(name) ? "关注了用户，用户没回关" : isFollowingNpc(name) ? "用户关注了 TA，TA 没关注用户" : "";
    const log = (S.meta.npcLog || {})[name] || [];
    return `「${name}」${rel ? `（${rel}）` : ""}${info && info.bio ? `；简介：${info.bio}` : ""}${info && info.gender ? `；${info.gender}` : ""}${info && !none(info.verified) ? `；认证：${info.verified}` : ""}${posts.length ? `；最近发过：${posts.join(" ")}` : ""}${log.length ? `；跟用户的来往：${log.join(" / ")}` : ""}`;
  }
  function addFanNpc(name) {
    if (!name || isFanNpc(name)) return;
    S.meta.fans = [{ name, at: nowIso() }, ...(S.meta.fans || [])].slice(0, 200); S.meta.followers = (S.meta.followers || 0) + 1;
    saveMeta(); setTimeout(refreshMsgViews, 0);
  }
  function removeFanNpc(name) {
    if (!isFanNpc(name)) return;
    S.meta.fans = S.meta.fans.filter(f => f.name !== name); S.meta.followers = Math.max(0, (S.meta.followers || 0) - 1); saveMeta();
  }
  /** 用户关注了一个路人：TA 不是粉丝的话，下次刷新时按人设决定回不回关 */
  function onFollowNpc(name, on) {
    S.meta.followAsk = (S.meta.followAsk || []).filter(n => n !== name);
    if (on && !isAlt() && !altOwner(name) && !isFanNpc(name)) S.meta.followAsk.push(name);
  }

  /** 统一的作者信息：{ type, charId, name, verified, vip, avatar } */
  function authorOf(x) {
    if (x.authorType === "user") { const m = profOf(x); const alt = m !== S.meta;
      return { type: "user", acct: alt ? "alt" : undefined, name: m.nickname, verified: "无", vip: !!m.vip, avatar: alt ? "" : S.identity.avatarUrl, avatarRef: m.avatarRef, seed: alt ? "me_alt" : "me" }; }
    if (x.authorType === "char") {
      const acc = S.accounts[x.charId] || {}; const c = charById(x.charId) || {};
      return { type: "char", charId: x.charId, name: acc.nickname || x.authorName || c.name || "微博用户", verified: acc.verified || x.verified || "无",
        vip: acc.vip != null ? acc.vip : x.vip, avatar: c.avatar, seed: x.charId };
    }
    const pool = S.meta.avatarPool || [];
    const npcName = x.authorName || "微博用户";
    const info = npcInfo(npcName);
    return { type: "npc", name: npcName, verified: (info && info.verified) || x.verified || "无", vip: info ? !!info.vip : !!x.vip, avatar: null, seed: npcName,
      avatarRef: (info && info.avatarRef) || (pool.length ? pool[hashNum(npcName) % pool.length] : null) };
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

  /** 应用内输入框（宿主 iframe 里 window.prompt 可能被禁用） */
  function inputSheet(title, { placeholder = "", value = "", maxlength = 30, ok = "确定" } = {}) {
    return new Promise(resolve => {
      const mask = document.createElement("div"); mask.className = "sheet-mask";
      mask.innerHTML = `<form class="sheet input-sheet" action="#">${title ? `<div class="sheet-title">${esc(title)}</div>` : ""}<div class="input-sheet-row"><input class="search-input" maxlength="${maxlength}" placeholder="${esc(placeholder)}" value="${esc(value)}" enterkeyhint="done"></div><button class="sheet-item ok" type="submit">${esc(ok)}</button><div class="sheet-gap"></div><button class="sheet-item" type="button" data-cancel>取消</button></form>`;
      const input = $("input", mask); const done = v => { mask.remove(); resolve(v); };
      $("form", mask).onsubmit = e => { e.preventDefault(); done(input.value.trim()); };
      mask.onclick = e => { if (e.target === mask || e.target.closest("[data-cancel]")) done(null); };
      document.body.appendChild(mask); setTimeout(() => input.focus(), 50);
    });
  }

  /** 分享面板：选一个 char + 可选附言 → { charId, note } */
  function shareSheet() {
    return new Promise(resolve => {
      const chars = S.chars || [];
      const mask = document.createElement("div"); mask.className = "sheet-mask";
      mask.innerHTML = `<form class="sheet share-sheet" action="#"><div class="sheet-title">分享给</div>
        <div class="share-grid">${chars.map(c => `<button type="button" class="share-pick" data-id="${esc(c.id)}">${avatarHtml({ type: "char", avatar: c.avatar, seed: c.id, name: c.name, verified: "无" }, 48)}<span>${esc(c.name)}</span></button>`).join("") || `<div class="cell-sub" style="padding:12px">还没有可以分享的人</div>`}</div>
        <div class="input-sheet-row"><input class="search-input" maxlength="200" placeholder="说点什么吧（可不填）" enterkeyhint="send"></div>
        <button class="sheet-item ok" type="submit" disabled>发送</button><div class="sheet-gap"></div><button class="sheet-item" type="button" data-cancel>取消</button></form>`;
      let picked = null; const send = $(".ok", mask);
      const done = v => { mask.remove(); resolve(v); };
      mask.onclick = e => {
        if (e.target === mask || e.target.closest("[data-cancel]")) return done(null);
        const b = e.target.closest(".share-pick"); if (!b) return;
        picked = b.dataset.id; mask.querySelectorAll(".share-pick").forEach(x => x.classList.toggle("on", x === b)); send.disabled = false;
      };
      $("form", mask).onsubmit = e => { e.preventDefault(); if (picked) done({ charId: picked, note: $("input", mask).value.trim() }); };
      document.body.appendChild(mask);
    });
  }
  async function sharePost(post) {
    const r = await shareSheet(); if (!r) return;
    const ch = charById(r.charId); if (!ch) return;
    const a = authorOf(post); const me = S.identity.name || S.meta.nickname || "我";
    const isHim = post.authorType === "char" && post.charId === ch.id;
    const imgs = post.images || [];
    const brief = t => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > 90 ? t.slice(0, 90) + "…" : t; };
    const top = (post.comments || []).filter(c => !c.parentId).slice().sort((x, y) => (y.likes || 0) - (x.likes || 0)).slice(0, 3);
    const history = [
      `[微博分享] ${me}在微博刷到一条微博，分享给了${ch.name}${isHim ? "（就是你自己发的这条）" : ""}`,
      `博主：@${a.name}${post.authorType === "user" ? `（${me}自己的微博）` : post.authorType === "char" && !isHim ? `（${charById(post.charId)?.name || ""}）` : ""}`,
      post.superName ? `来自「${post.superName}」超话` : "",
      `正文：${post.text}`,
      imgs.length ? `配图：${imgs.map(i => i.desc || "图片").join(" | ")}` : "",
      post.repost ? `转发的原微博 @${post.repost.author}：${post.repost.text}` : "",
      top.length ? `热评：${top.map(c => `${authorOf(c).name}：${c.text}`).join("；")}` : "",
    ].filter(Boolean).join("\n");
    try {
      await api.chat.sendCard({
        characterId: ch.id, role: "user", historyRole: "user",
        summary: `[微博] @${a.name}：${brief(post.text)}`, historyText: history,
        sceneId: post.id, sceneTag: "weibo_share",
        card: {
          appLabel: "微博", title: `@${a.name}`, ...(post.superName ? { subtitle: `${post.superName}超话` } : {}),
          body: brief(post.text) + (imgs.length ? " [图片]" : "") + (post.repost ? `\n//@${post.repost.author}：${brief(post.repost.text)}` : ""),
          accentColor: "#ff8200",
        },
      });
      if (r.note) await api.chat.sendMessage({ characterId: ch.id, role: "user", content: r.note });
      toast(`已分享给${ch.name}`);
    } catch (e) { console.error(e); toast("分享失败：" + (e.message || e)); }
  }

  // ───────────────────────── AI 输出解析 ─────────────────────────
  const KEYS = ["回关", "取关", "转发语", "口吻", "发博原因", "角色", "作者", "认证", "认证说明", "会员", "来源", "时间", "配图", "转评赞", "转发自", "原文", "转发链", "正文", "编号", "回复", "赞", "内容",
    "性别", "点赞角色", "转发", "路人点赞", "新增粉丝", "昵称", "简介", "IP属地", "粉丝", "关注",
    "热搜词", "热度", "标签", "相关", "来自", "新粉丝", "名称", "分类", "帖子数", "粉丝数", "导语", "主持人", "阅读", "讨论", "分区", "词条", "热搜", "阅读量", "讨论量",
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
  const KINDS = "微博|评论|互动|主页|热搜|话题|私信|超话|转发|结束";

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
  /** 模型写歪的格式：单独一行的 ===、句尾挂着的 ===、混进来的「转发平：无」这种空字段行，都清掉 */
  function cleanField(v) {
    return String(v || "").split("\n")
      .filter(l => !/^\s*=+\s*(结束)?\s*=*\s*$/.test(l) && !/^\s*[\u4e00-\u9fa5]{2,5}\s*[：:]\s*(无|没有)\s*$/.test(l))
      .map(l => l.replace(/\s*=+\s*(结束)?\s*=*\s*$/, ""))
      .join("\n").replace(/^\n+|\s+$/g, "");
  }
  function recordsOf(chunk) {
    const list = []; let fields = {}; let cur = null;
    const push = () => {
      for (const k in fields) fields[k] = cleanField(fields[k]);
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
    const bodyKey = { 转发: "转发语", 微博: "正文", 评论: "内容", 互动: "点赞角色", 主页: "昵称", 热搜: "热搜词", 话题: "导语", 私信: "内容", 超话: "名称" }[kind];
    // 按分隔标记切段；标记之外的散段（模型漏写标记）也一并按字段解析，最后按必需字段筛
    const out = [];
    let label = null;
    for (const seg of text.split(new RegExp(`(===(?:${KINDS})===)`))) {
      const mk = seg.match(/^===(.+)===$/);
      if (mk) { label = mk[1]; continue; }
      if (label === kind || label === null || label === "结束") out.push(...recordsOf(seg));
    }
    if (kind === "互动") return out.filter(f => "点赞角色" in f || "新增粉丝" in f || "转发" in f || "路人点赞" in f || "回关" in f || "取关" in f).slice(0, 1);
    if (kind === "主页") return out.filter(f => "昵称" in f && ("粉丝" in f || "简介" in f)).slice(0, 1);
    if (kind === "话题") return out.filter(f => f["导语"] && !f["正文"]).slice(0, 1);
    if (kind === "私信") return out.filter(f => f["内容"] && f["来自"]);
    if (kind === "转发") return out.filter(f => f["昵称"] && "转发语" in f && !f["正文"]);
    if (kind === "超话") return out.filter(f => f["名称"] && !f["正文"]);
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

  /** 角色发的「班级通知」：规则管不住时代码兜底丢掉（官方 / 机构号的路人博不管） */
  const NOTICE_RE = /各位同学|同学们[，,！!：:\s]|全班同学|请大家|提醒大家|大家注意|注意事项|温馨提示|通知[：:]|收齐|按时(交|到|上交)|不要忘[了记]带|记得带好|班级(通知|事务)|通报|公告[：:]|紧急通知/;
  // 角色发的博：通知腔、「某些人」暗指、@ 用户还对她下命令的，代码直接丢掉
  const HINT_RE = /某人|某些|某位|某个人|有些人|有的人/;
  const BOSSY_RE = /别|不准|不许|记得|给我|乖乖|听话|等下|等会/;
  const isCharNotice = p => p.authorType === "char" && (NOTICE_RE.test(p.text || "") || HINT_RE.test(p.text || "")
    || (!!S.meta.nickname && (p.text || "").includes(`@${S.meta.nickname}`) && BOSSY_RE.test(p.text || "")));
  /** 兜底：一批 3 条以上的原创博全带图时，挑 1～2 条像吐槽、有感而发的拿掉配图；晒东西的、本人出镜的不动，没有合适的就不拿 */
  const VENT_RE = /烦|累|困|无语|服了|麻了|崩溃|为什么|凭什么|emo|睡不着|失眠|难过|想哭|唉|救命|笑死|好想|又是|受不了|离谱|破防|吐槽|感觉|突然觉得|有时候/;
  const SHOW_RE = /吃|饭|喝|奶茶|咖啡|买|拍|晒|打卡|新[剪买入到]|这家|好看|可爱|猫|狗|风景|天空|日落|花|穿搭|自拍|合照|看了|演唱会|展/;
  function thinPics(posts) {
    const own = posts.filter(p => !p.repost);
    if (own.length < 3 || own.some(p => !p.images.length)) return posts;
    own.map(p => ({ p, score: (VENT_RE.test(p.text || "") ? 2 : 0) - (SHOW_RE.test(p.text || "") ? 2 : 0) }))
      .filter(x => x.score > 0 && !x.p.images.some(i => i.withFace)).sort((a, b) => b.score - a.score)
      .slice(0, own.length >= 5 ? 2 : 1).forEach(x => { x.p.images = []; });
    return posts;
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
    if (ch && !altOwner(post.authorName)) {
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
    return [S.meta.nickname, S.alt && S.alt.nickname, S.identity.name].filter(x => x && x.length >= 2).some(x => n === x || n.includes(x));
  }

  function commentsFromBlocks(blocks, post, idMap) {
    const out = [];
    for (const b of blocks) {
      if (b["来自"] || isUserName(b["作者"]) || isUserName(b["角色"])) continue;
      const ch = charByName(b["角色"]) || charByName(b["作者"] || b["昵称"], true);
      const name = (b["作者"] || b["昵称"] || (ch && charNickname(ch.id)) || "微博用户").replace(/^@/, "");
      const isPostAuthor = (post.authorType === "char" && ch && ch.id === post.charId) || (post.authorType === "npc" && !ch && name === post.authorName);
      if (ch && !altOwner(name)) { const acc = S.accounts[ch.id]; if (!acc || !acc.nickname) ensureAccount(ch.id, { nickname: name }); }
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
          c.parentId = target.parentId || target.id; c.replyToName = target.parentId ? target.authorName : ""; c.replyToId = target.id;
          const after = new Date(target.createdAt).getTime() + rand(20, 900) * 1000;
          c.createdAt = new Date(Math.min(after, Date.now())).toISOString();
        }
      }
      out.push(c);
    }
    for (const c of out) { delete c._local; c.code = nextCode(post); }
    return out;
  }
  /** 删一条评论时要一起删的：它自己、它楼里的回复、专门回它的（一层层往下找） */
  function repliesTo(post, c) {
    const gone = new Set([c]);
    if (!c.parentId) for (const x of post.comments) if (x.parentId === c.id) gone.add(x);
    // 旧数据没有 replyToId：同一楼里、在它之后、回复对象是它作者的，且这楼里它是这个作者唯一一条
    const sameAuthor = post.comments.filter(x => x.parentId === c.parentId && x.authorName === c.authorName && x.authorType === c.authorType);
    let grew = true;
    while (grew) {
      grew = false;
      for (const x of post.comments) {
        if (gone.has(x)) continue;
        const hit = [...gone].some(g => x.replyToId === g.id)
          || (c.parentId && !x.replyToId && sameAuthor.length === 1 && x.parentId === c.parentId && x.replyToName === c.authorName && new Date(x.createdAt) >= new Date(c.createdAt));
        if (hit) { gone.add(x); grew = true; }
      }
    }
    return [...gone];
  }
  function nextCode(post) { post.codeSeq = (post.codeSeq || 0) + 1; return `F${post.codeSeq}`; }
  function codeOf(post, c) { if (!c.code) c.code = nextCode(post); return c.code; }
  /** aware：看这段对话的人知道小号是用户（不知道的只看到一个陌生网友） */
  function cmtLine(post, c, aware) {
    const who = c.authorType === "user" ? (acctOf(c) === "alt" ? `${profOf(c).nickname}${aware ? "（用户的小号）" : ""}` : `${S.meta.nickname}（用户本人）`) : c.authorType === "char" ? `${c.authorName}（角色 ${charById(c.charId)?.name || ""}）` : c.authorName;
    const parent = c.parentId ? post.comments.find(x => x.id === c.parentId) : null;
    return `[${codeOf(post, c)}] ${who}${parent ? ` 回复 ${c.replyToName || parent.authorName}` : ""}：${c.text}`;
  }
  /** 一层楼（主评论 + 楼中楼）的完整对话 */
  function floorLines(post, c, aware) {
    const rootId = c.parentId || c.id;
    return post.comments.filter(x => x.id === rootId || x.parentId === rootId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(-14).map(x => cmtLine(post, x, aware)).join("\n");
  }
  function reservedLine() {
    const names = Array.from(new Set([S.meta.nickname, S.alt && S.alt.nickname, S.identity.name, ...S.chars.flatMap(c => [c.name, S.accounts[c.id] && S.accounts[c.id].nickname, calt(c.id) && calt(c.id).nick])].filter(Boolean)));
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
  // 天气：Open-Meteo 免费接口，不用 key；天气跟着人走（用户/每个角色的城市），路人不套用。真名只用来查，提示词里只出现「微博里叫」
  const WX_NAME = c => c === 0 ? "晴" : c === 1 ? "晴间多云" : c === 2 ? "多云" : c === 3 ? "阴" : c <= 48 ? "雾" : c <= 57 ? "毛毛雨"
    : c <= 67 ? (c === 61 ? "小雨" : c === 63 ? "中雨" : "大雨") : c <= 77 ? "雪" : c <= 82 ? "阵雨" : c <= 86 ? "阵雪" : "雷阵雨";
  S.wx = {};
  async function wxOf(q) {
    const hit = S.wx[q];
    if (hit && Date.now() - hit.at < (hit.v ? 3600e3 : 600e3)) return hit.v;
    let v = null;
    try {
      const js = r => r && (r.json || (r.text ? JSON.parse(r.text) : null));
      const g = (js(await api.network.fetch({ url: "https://geocoding-api.open-meteo.com/v1/search", query: { name: q, count: 1, language: "zh" }, timeoutMs: 8000 })) || {}).results?.[0];
      if (g) {
        const f = js(await api.network.fetch({ url: "https://api.open-meteo.com/v1/forecast", timeoutMs: 8000,
          query: { latitude: g.latitude, longitude: g.longitude, current: "temperature_2m,weather_code", daily: "temperature_2m_max,temperature_2m_min", timezone: "auto", forecast_days: 1 } }));
        if (f && f.current) v = `${WX_NAME(f.current.weather_code)}，今天 ${Math.round(f.daily.temperature_2m_min[0])}～${Math.round(f.daily.temperature_2m_max[0])}°C，现在 ${Math.round(f.current.temperature_2m)}°C`;
      }
    } catch (e) { console.warn("天气", e); }
    S.wx[q] = { at: Date.now(), v }; return v;
  }
  const myCity = () => (S.meta.city && S.meta.city.q ? S.meta.city : null);
  const charCityCfg = id => ((S.meta.charCity || {})[id]) || { mode: "same" };
  function cityOf(id) {
    const c = charCityCfg(id);
    return c.mode === "none" ? null : c.mode === "custom" ? (c.q ? c : null) : myCity();
  }
  const cityLabel = c => c ? (c.name ? `${c.q}（微博里叫 ${c.name}）` : c.q) : "";
  async function weatherLine(charIds) {
    const people = [["用户那边", myCity()], ...charIds.map(id => [charById(id)?.name, cityOf(id)]).filter(x => x[0])];
    const lines = await Promise.all(people.map(async ([who, c]) => {
      const w = c && await wxOf(c.q);
      return w ? `- ${who}：在${c.name || c.q}，${w}` : `- ${who}：不知道那边的天气`;
    }));
    if (lines.every(l => l.endsWith("不知道那边的天气"))) return "【天气】你不知道今天任何地方的天气和气温：不要写具体温度，也不要编下雪、零下、高温、暴雨这类天气事实。";
    return `【天气】下面是今天的真实天气，只是背景，用来别写错（下雨别写晒太阳，热天别喊冷），不是要写的内容。没有理由就不提天气；提到也只说感受，不写具体度数。\n${lines.join("\n")}\n写「不知道」的人，不要写他那边的天气和温度。路人分散在全国各地，各地天气都不一样，不要套用上面的天气，也不要给路人编具体温度。`;
  }
  // 规则和输出格式在预设条目里（presets.json，按 nox_weibo 标签命中）；这里只在末尾再提醒一次格式
  const FORMAT_HINT = {
    feed: "===微博===（需要时加 ===私信=== 和 ===互动===）", comments: "===评论===（本轮说明要求时，评论后面加 ===转发===）", reaction: "===评论=== 和 ===互动===（需要时加 ===私信===）", reply: "===评论===（需要时加 ===私信=== 和 ===互动===）", profile: "===主页=== 和 ===微博===",
    dm: "===私信===", super: "===超话=== 或 ===微博===（按本轮说明要的输出）",
    hot: "===热搜===", topic: "===话题=== 和 ===微博===", search: "===微博===", npc: "===主页=== 和 ===微博===", charalt: "===主页=== 和 ===微博===（主页按本轮说明决定要不要）",
  };
  // 调试记录：最近 10 次 AI 调用，存进 db，关掉 APP 也在
  S.debug = [];
  function logAi(entry) {
    S.debug = [{ at: nowIso(), ...entry, text: String(entry.text || "").slice(0, 6000) }, ...S.debug].slice(0, 10);
    dbUpsert(COL.meta, { id: "debug_log", entries: S.debug }).catch(() => {});
  }
  function noteParsed(summary) { if (S.debug[0]) { S.debug[0].parsed = summary; dbUpsert(COL.meta, { id: "debug_log", entries: S.debug }).catch(() => {}); } }

  // 带图不带图看内容，大约五五开（随请求发送，不靠预设）
  const PIC_SCENES = new Set(["feed", "profile", "super", "topic", "search", "npc", "charalt"]);
  const PIC_LINE = "【配图】带图不带图看内容，整体大约一半一半：晒美食、晒日常、出去玩、买了东西、看演出、自拍、秀恩爱这类要带图；吐槽、有感而发、碎碎念、深夜 emo、追星尖叫、纯转发这类一般不带图，「配图」写 无。不要每条都带图。";
  const TIME_LINE = "【时间要对得上】每条微博的内容不能和它的发布时间冲突（不用特意去写天气和季节）：季节、节日、学期节奏（九月开学、一月和六七月期末、寒暑假）、星期几（工作日白天在上课上班，周末才休息）、几点发的（凌晨是失眠熬夜，早上是起床通勤）、事情的先后（先有考试才有出成绩，先在一起才有纪念日）。这些只是不能写错的背景，不是要写的内容，不要拿来报备自己在上课、在通勤。写历史微博时先定好日期，再按那一天的情况写，日期从近到远，不要两条写在同一天。";
  // 角色发的博要像微博、不像聊天（随请求发送，不靠预设）
  const CHAR_POST_SCENES = new Set(["feed", "profile", "super", "topic", "search", "charalt"]);
  const CHAR_POST_LINE = `【角色发的博：像真人随手发】
- 真人发微博很懒：大多很短，句子不用完整，标点随意，结尾不一定是句号，情绪直接喊出来，不靠铺垫。
- 不描写场景，不罗列物件和动作，不写成有画面感的小短文。带图的博，图自己会说话，字只是一句配文，不再描述图里的东西。
- 本轮说明里有角色的「发博参考」：形态和题材从候选里挑最像他此刻的一个，长度照写的来；候选都不合适就按他此刻真实的状态写。
- 微博是对着空气自言自语，不是说给用户或某个具体的人听的：不报备、不交代、不提醒，不对她喊话、下命令，不预设她看到后的反应。秀恩爱、想她可以，那是分享自己的幸福，不是在跟她说话，也不用每次都 @ 她。
- 他的聊天记录、日程、记忆只是背景，不复述最近和用户聊过的事；题材要和此刻的日期、他的日程对得上（上课时间人不会在外面玩，可以是想去、在等、抢票）。
- 同一批里每条博的事情和情绪都不一样，口吻要比路人更有他的个人色彩。
- 角色发的每条微博，在「正文：」前面先多写两行（只给你自己看，不会显示）：
  口吻：他说话是什么感觉（语气、节奏、性格，看他平时和用户聊天的样子），正文照这个感觉写；不用每条都塞口头禅
  发博原因：一句话写他此刻想分享的情绪，以及是什么引起的；不能是「说给用户听」「让她看到」，也不能只是「记录一下」
  路人的微博不用写这两行。`;
  // 发博骰子：代码给每条角色博抽形态、题材、长度的候选，AI 挑最像他的（只写类别，不放例句，免得照抄）
  const POST_FORMS = ["一句情绪直接喊出来", "晒图加一句短配文（字不描述图）", "问大家一句", "分享一首歌、一部剧、一个视频或一样东西，加一句感受",
    "突然冒出来的一个念头、碎碎念", "只发几个字、一个表情或符号", "自拍或对镜拍，配一句很短的话", "转发别人的微博，只写几个字"];
  const LONG_FORM = "讲一件真发生的事，用口语有感而发";
  const POST_TOPICS = ["吃的喝的", "追剧、看综艺", "听歌", "游戏", "刷到的好笑视频或梗", "看的书、小说、漫画", "买了或想买的东西", "穿搭、新发型",
    "身体状态（困、饿、累、生病）", "熬夜失眠", "朋友干的蠢事", "家里人", "宠物或路边的小猫小狗", "追星", "天空和风景", "发呆想事情", "深夜 emo",
    "回忆以前、翻到旧照片", "做了个奇怪的梦", "运动", "种草拔草", "放假倒计时"];
  const OUT_TOPICS = ["出门玩", "旅游", "看演出或演唱会", "逛街", "和朋友聚餐"];
  const WORK_TOPIC = "学习或工作上的事";
  const PUB_TOPICS = ["新作品宣传（杂志、海报、新歌、专辑、剧、综艺，要和设定里已有的作品对得上，不凭空宣布大事）", "活动或演出结束后感谢粉丝",
    "自拍营业、宠粉", "工作花絮和行程碎片", "节日问候粉丝", "给粉丝分享一点自己的生活"];
  const LOVE_TOPICS = {
    open: ["分享幸福、秀恩爱（不一定 @ 她）", "突然很想她", "又被她可爱到了", "晒和她有关的照片（合照、她的背影或剪影）"],
    secret: ["心情好得藏不住，但不说是因为谁", "只有她看得懂的小暗号（不暴露她）"],
    none: ["按他的人设：心动、暗恋、想谈恋爱、吐槽单身（人设里没有这些就换别的题材）"],
  };
  /** 放假、周末才放出出门类题材（历史博日期不定，交给 AI 按那天判断） */
  const isOffDay = d => { const w = d.getDay(); const md = (d.getMonth() + 1) * 100 + d.getDate();
    return w === 0 || w === 6 || (md >= 1001 && md <= 1007) || md <= 103 || (md >= 501 && md <= 505) || (md >= 115 && md <= 225) || (md >= 710 && md <= 831); };
  const pickN = (arr, n, avoid = []) => { const pool = arr.filter(x => !avoid.includes(x)); return shuffle(pool.length >= n ? pool : arr).slice(0, n); };
  function postPlan(charId, { history = false } = {}) {
    if (Math.random() < 0.25) return "自由发挥，按他此刻最想发的来";
    const log = (S.meta.formLog || {})[charId] || [];
    const r = Math.random(); const len = r < 0.6 ? "15 字以内" : r < 0.9 ? "40 字以内" : "不限";
    const forms = len === "不限" ? [...pickN(POST_FORMS, 2, log), LONG_FORM] : pickN(POST_FORMS, 3, log);
    S.meta.formLog = { ...(S.meta.formLog || {}), [charId]: [...forms, ...log].slice(0, 6) };
    const off = history || isOffDay(new Date());
    let topics = pickN([...POST_TOPICS, ...(off ? OUT_TOPICS : []), WORK_TOPIC, ...(off ? [] : [WORK_TOPIC, WORK_TOPIC])], 3);
    topics = [...new Set(topics)];
    const love = loveOf(charId).state;
    if (Math.random() < (love === "none" ? 0.12 : 0.3)) topics[0] = pickN(LOVE_TOPICS[love] || LOVE_TOPICS.none, 1)[0];
    if (isPublic(charId) && Math.random() < 0.5) topics = [...pickN(PUB_TOPICS, 2), topics[0]];
    return `形态：${forms.join(" / ")}｜题材：${topics.join(" / ")}｜正文长度：${len}${history ? "｜题材要和那条博的日期对得上" : ""}`;
  }
  const PLAN_HEAD = "发博参考（代码抽的候选：形态、题材各挑一个最像他此刻的，长度照写；都不合适就按他此刻真实的状态写）";
  // 随请求发送的规则（build 时从 rules.json 打进来）：用户预设里没有这条也能生效
  const INLINE_RULES = "/*__INLINE_RULES__*/";
  async function generate(payload, label, opts = {}) {
    const job = uid("job"); S.jobs.add(job);
    const scene = (payload.appTags || [])[1];
    const inline = typeof INLINE_RULES === "object" && INLINE_RULES[scene];
    if (inline) payload = { ...payload, instruction: `【微博：${scene === "charalt" ? "角色小号" : scene}规则】\n${inline}\n\n${payload.instruction}` };
    const who = `用户的名字是「${S.identity.name || "用户"}」，微博昵称是「${S.meta.nickname}」。${scene === "hot" ? "" : `\n${nameLine()}`}` + (scene === "hot" ? "" : `\n${publicLine(false)}`) + (loveLine() ? `\n${loveLine()}` : "") + (scene === "hot" || !isAlt() ? "" : `\n${altLine()}`);
    const wx = scene === "hot" ? "" : await weatherLine(payload.characterIds || (payload.characterId ? [payload.characterId] : []));
    if (scene === "dm") payload = { ...payload, instruction: [
      who, payload.instruction, wx,
      "【输出要求】只输出 ===私信=== 块，一句话一个块，字段名照抄「私信聊天」规则里的格式；不要写旁白、动作或心理描写，不要加任何解释，不能替用户说话。",
    ].join("\n\n") };
    else if (FORMAT_HINT[scene]) payload = { ...payload, instruction: [
      who, payload.instruction, PIC_SCENES.has(scene) ? `${PIC_LINE}\n${TIME_LINE}` : "", wx, CHAR_POST_SCENES.has(scene) ? CHAR_POST_LINE : "",
      ["feed", "profile", "super", "topic", "search", "comments", "reaction", "reply"].includes(scene) ? loverPostLine() : "",
      scene === "comments" ? OTHERS_CMT_LINE : "",
      `【输出要求】这不是聊天回复：不要用聊天格式，不要写旁白、动作或心理描写，不要加任何解释，除了本轮说明要求的「口吻」「发博原因」，不要自创字段名或用【】标题，只输出 ${FORMAT_HINT[scene]} 格式的内容，字段名和分隔线照抄「微博」规则里的格式。${scene === "hot" ? "用户是公众人物、或剧情里真的发生了大事时，热搜词条可以和用户有关，但只写事件，不替用户说话。" : "用户本人不能出现在你生成的内容里。"}不要用「某人」「某些人」「有些人」暗指谁；不要对用户发号施令或叮嘱（「不准……」「记得……」），人设不是爹系就不能有家长口吻。`,
    ].filter(Boolean).join("\n\n") };
    try {
      const r = await api.ai.generate(payload);
      const text = (r && r.text) || "";
      logAi({ label, ok: true, text: opts.secret ? "（小号内容保密：掉马后在设置里查看小号）" : text });
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
  /** 调试记录里藏住还没掉马的小号：小号写的块里「角色」改成 无 */
  function maskSecrets(text) {
    const hidden = Object.entries((S.calts && S.calts.map) || {}).filter(([, a]) => a.state === "hidden");
    if (!hidden.length || !text) return text;
    return String(text).split(/(?====)/).map(seg => {
      for (const [id, a] of hidden) if (seg.includes(a.nick)) {
        const ch = charById(id);
        if (ch) seg = seg.replace(new RegExp(`((?:角色|来自)\\s*[：:]\\s*)${ch.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), (m0, k) => k.startsWith("来自") ? `${k}${a.nick}` : `${k}无`);
      }
      return seg;
    }).join("");
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
            ${r.ok ? `<pre style="margin:6px 0 0;white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;max-height:320px;overflow:auto;color:var(--wb-text-2);user-select:text;-webkit-user-select:text">${esc(maskSecrets(r.text) || "（空的，AI 什么都没返回）")}</pre>` : ""}
          </div>`).join("")
        : `<div class="empty">还没有调用过 AI</div>`;
    }, { title: "调试记录" });
  }

  /** 清空当前身份的全部微博内容：微博、评论、角色主页、我的主页 */
  async function wipeAll() {
    const ok = await sheet("清空后不能恢复。会删除当前身份下所有微博和评论、角色的微博主页和小号，你的微博主页也会恢复初始。", [{ label: "清空微博所有内容", value: "yes", danger: true }]);
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
    if (S.alt) { const t = nowIso(); Object.assign(S.alt, { followers: rand(0, 12), fans: [], seen: { at: t, comment: t, like: t, follow: t }, favs: [], drafts: [], history: [], visits: [], pinnedPostId: null, posted: false }); }
    S.meta.acct = S.acct;
    saveMeta();
    S.hot = { id: S.hot.id, at: null, items: [] }; saveHot();
    S.topics = { id: S.topics.id, map: {}, recent: [] }; saveTopics();
    S.npcs = { id: S.npcs.id, map: {} }; saveNpcs();
    S.supers = { id: S.supers.id, map: {}, recommend: [], charSupers: {} }; saveSupers();
    forget(Object.keys(S.calts.map).map(charId => ({ charId, eventId: `weibo_charalt_${charId}` })));
    S.calts = { id: S.calts.id, map: {} }; saveCalts();
    for (const t of (await dbList(COL.dms)).filter(t => t.scope === S.identity.id)) { try { await api.db.delete(COL.dms, t.id); } catch (e) { /* ignore */ } }
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
    if (p.authorType === "char") list.push({ charId: p.charId, eventId: `weibo_own_${p.id}` }, { charId: p.charId, eventId: `weibo_like_${p.id}` }, { charId: p.charId, eventId: `weibo_like_alt_${p.id}` });
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
    const fullCast = pickCast(followed.length ? followed : activeChars(), followTab ? 4 : 2);
    // 恋人（恋情开关是地下恋/已公开）单独调用一次写他的博：像私信一样只有他，人设和聊天记录最完整
    const lovers = isAlt() ? [] : fullCast.filter(c => loveOf(c.id).state !== "none" && loverSolo(c.id));
    const cast = fullCast.filter(c => !lovers.includes(c));
    const charCount = Math.max(0, (followTab ? Math.min(fullCast.length + 1, rand(2, 4)) : 1) - lovers.length);
    const npcCount = followTab ? rand(2, 3) : rand(5, 7);
    const followNpc = (S.meta.followNpc || []).filter(n => !altOwner(n)).slice(0, 6);
    const asks = isAlt() ? [] : (S.meta.followAsk || []).filter(n => isFollowingNpc(n) && !isFanNpc(n)).slice(0, 4);
    const recent = S.posts.filter(p => acctOf(p) !== "alt").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8)
      .map(p => `- ${authorOf(p).name}：${p.text.slice(0, 40)}`).join("\n");
    // 刷新时私信也掷骰子：没掷中就不来；上一条没回的不再追
    const dmPick = isAlt() ? null : rollCharDm(fullCast);
    const dmLine = c => dmPick === c ? `如果你有话想单独跟用户说，可以顺便私信用户（1～3 条，一句一个块）。${charDmRecent(c)}` : "这次不私信用户，不要输出 ===私信===。";
    const instruction = [
      `当前时间：${nowText()}`,
      `本轮生成 ${charCount + npcCount} 条微博：角色本人发的约 ${charCount} 条，路人博主 ${npcCount} 条。`,
      followTab && followNpc.length ? `路人里可以有用户关注的博主（昵称一字不差，发的内容接着 TA 的人设和最近的博，跟用户有来往的可以自然带出来）：\n${followNpc.map(n => `- ${npcCard(n)}`).join("\n")}` : "",
      asks.length ? `用户最近关注了这些路人：\n${asks.map(n => `- ${npcCard(n)}`).join("\n")}\n按 TA 们各自的人设决定回不回关用户：营销号、bot、官方号、大 V 基本不回关；普通网友看心情和缘分，也可以不回。在最后输出：\n===互动===\n回关：回关了的昵称，用、分隔（都没回关写 无）\n===结束===` : "",
      `角色微博昵称（已注册的必须沿用）：\n${charsForPrompt(cast) || "无（本轮不写角色的微博）"}`,
      lovers.length ? `${lovers.map(c => c.name).join("、")} 的微博这次另外写，本轮不要写他们发的博。` : "",
      `角色是否发博、发什么，看他此刻有没有想分享的情绪；同一个角色本轮最多 2 条。`,
      cast.length ? `${PLAN_HEAD}：\n${cast.map(c => `- ${c.name}：${postPlan(c.id)}`).join("\n")}\n同一个人写第 2 条时自由发挥，和第 1 条不一样。` : "",
      "角色发的是个人微博：自己的心情、吐槽、碎碎念、想分享的东西。*绝对不发通知、提醒、注意事项、班级事务*（不写「各位同学」「同学们」「请大家」「记得带好…」），就算他是班长、班干部、老师也一样——这些在班级群里说，不在微博说。",
      `${S.meta.nickname ? `用户的微博昵称是「${S.meta.nickname}」：角色发的博只有内容真和用户有关时才 @ 这个昵称，日常博不硬加 @。` : ""}`,
      recent ? `首页最近已有的微博（不要重复类似内容）：\n${recent}` : "",
      dmPick && !lovers.includes(dmPick) ? `这次 ${dmPick.name} 如果发了博、又有话想单独跟用户说，可以顺便私信用户（1～3 条，一句一个块）；其他人都不私信。${charDmRecent(dmPick)}` : "这次没有人私信用户，不要输出 ===私信===。",
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const loverInstr = c => [
      `当前时间：${nowText()}`,
      `${PLAN_HEAD}：${postPlan(c.id)}`,
      `这次只写你自己（${c.name}）此刻想发的 1 条微博，不写别人和路人的。${(S.accounts[c.id] || {}).nickname ? `你的微博昵称是「${S.accounts[c.id].nickname}」，必须沿用。` : "你还没有微博账号，自取一个昵称。"}`,
      (m => m.length ? `你最近发过的微博（不要重复类似内容）：\n${m.map(p => `- ${p.text.slice(0, 40)}`).join("\n")}` : "")(S.posts.filter(p => p.charId === c.id && p.origin !== "profile").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)),
      recent ? `首页最近别人发的微博（不要和它们撞同一类事）：\n${recent}` : "",
      "发的是个人微博：*绝对不发通知、提醒、注意事项、班级事务*。",
      `${S.meta.nickname ? `用户的微博昵称是「${S.meta.nickname}」：只有内容真和用户有关时才 @ 这个昵称，日常博不硬加 @。` : ""}`,
      dmLine(c),
    ].filter(Boolean).join("\n\n");
    // 大调用和恋人的单独调用同时发
    const [text, ...loverTexts] = await Promise.all([
      generate({ characterIds: (cast.length ? cast : fullCast).map(c => c.id), appTags: ["nox_weibo", "feed"], instruction }, "刷新"),
      ...lovers.map(c => generate({ characterId: c.id, appTags: ["nox_weibo", "feed"], instruction: loverInstr(c) }, `刷新·${c.name}`)),
    ]);
    S.feedBusy = false; saveMeta();
    if (text == null && loverTexts.every(t => t == null)) { renderHome(); return; }
    // 在「关注」页刷出来的路人微博也留在关注页（像关注页里混进来的推荐）
    const toPosts = (t, as) => fixAltAuthors(parseBlocks(t || "", "微博").filter(b => !isUserName(b["作者"])).map(b => postFromBlock(as ? { ...b, 角色: as.name } : b, { origin: "feed", followFeed: followTab || undefined })), {})
      .filter(p => (p.text || p.images.length || p.repost) && !isCharNotice(p));
    const posts = [
      ...toPosts(text).filter(p => !lovers.some(c => c.id === p.charId)),
      ...lovers.flatMap((c, i) => toPosts(loverTexts[i], c).filter(p => p.charId === c.id).slice(0, 1)),
    ];
    // 回关：AI 给了答案才算定了，没写 ===互动=== 就留到下次
    const fb = asks.length ? parseBlocks(text || "", "互动")[0] : null;
    if (fb && "回关" in fb) {
      const back = none(fb["回关"]) ? [] : fb["回关"].split(/[、,，\s]+/).map(x => x.replace(/^@/, "").trim());
      for (const n of asks) if (back.includes(n)) addFanNpc(n);
      S.meta.followAsk = (S.meta.followAsk || []).filter(n => !asks.includes(n)); saveMeta();
    }
    if (!posts.length) { renderHome(); parseFailed("刷新"); return; }
    thinPics(posts); for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; rememberOwnPost(p); }
    const dmText = dmPick && lovers.includes(dmPick) ? loverTexts[lovers.indexOf(dmPick)] : text;
    const feedDms = dmPick ? parseBlocks(dmText || "", "私信").filter(b => (charByName(b["角色"]) || charByName(b["来自"], true)) === dmPick) : [];
    if (feedDms.length) deliverDms(feedDms, { acct: curAcct(), delay: rand(5000, 12000) });
    const charPosts = posts.filter(p => p.authorType === "char");
    noteParsed(`${posts.length} 条微博（角色 ${charPosts.length} 条${charPosts.length ? "：" + charPosts.map(p => charById(p.charId)?.name).join("、") : ""}；路人 ${posts.length - charPosts.length} 条）`);
    const visibleHere = posts.filter(p => followTab ? inFollowFeed(p) : true).length;
    if (!visibleHere && followTab) { S.homeTab = "recommend"; toast("刷出来的都是路人微博，在「推荐」里"); }
    S.lastRefreshCount = visibleHere || posts.length;
    pruneIfNeeded();
    renderHome(true);
  }

  /** 评论区 prompt 里的博主说明：角色大号 / 角色小号 / 路人 */
  function altBloggerNote(post) {
    if (post.authorType === "char") return `（就是角色 ${charById(post.charId)?.name}）`;
    if (post.altOf && charById(post.altOf)) return `（这是角色 ${charById(post.altOf).name} 的微博小号，评论区的人${altOpen(post.altOf) ? "大多" : "都"}不知道是他；他本人回复时「作者」也填「${post.authorName}」）`;
    return "（路人博主）";
  }

  /** 打开正文页时生成评论区 */
  /** 别人微博的转发列表：只有路人，只用来看，不生成真的转发微博 */
  const repostWant = post => post.authorType !== "user" && !post.repostsGenerated && post.counts.reposts > 0 ? Math.min(post.counts.reposts, rand(5, 8)) : 0;
  const REPOST_FMT = n => `评论写完后，再写这条微博转发列表里的 ${n} 条转发：转发的都是路人（不能是角色或用户），转发语很短，像真人随手转发，有的只写「转发微博」，有的带一句态度或玩梗，彼此不要雷同。每条格式：\n===转发===\n昵称：路人微博昵称\n转发语：一句话\n===结束===`;
  function takeReposts(post, text) {
    const list = parseBlocks(text, "转发").map(b => ({ name: b["昵称"].replace(/^@/, "").trim(), text: none(b["转发语"]) ? "转发微博" : b["转发语"].trim() }))
      .filter(r => r.name && !isUserName(r.name) && !charByName(r.name, true) && !charByName(r.name) && !altOwner(r.name)).slice(0, 10);
    if (!list.length) return 0;
    const from = new Date(post.createdAt).getTime() || Date.now() - 3600e3, span = Math.max(60e3, Date.now() - from);
    list.forEach(r => { r.createdAt = new Date(from + Math.random() * span).toISOString(); });
    post.reposts = [...(post.reposts || []), ...list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))];
    post.repostsGenerated = true;
    return list.length;
  }
  /** 评论早就加载过的旧博：点「转发」再单独要一次 */
  async function loadReposts(post) {
    const n = repostWant(post); if (!n || post._genReposts) return;
    post._genReposts = true; rerenderDetail(post);
    const instruction = [`当前时间：${nowText()}`, `博主：${authorOf(post).name}${altBloggerNote(post)}`, `微博正文：\n${post.text}`,
      post.repost ? `这是一条转发，原微博 @${post.repost.author}：${post.repost.text}` : "", "这次只写转发列表，不写评论。", REPOST_FMT(n).replace("评论写完后，再写", "写"), reservedLine()].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: pickCast(activeChars(), 1).map(c => c.id), appTags: ["nox_weibo", "comments"], instruction }, "加载转发");
    post._genReposts = false;
    if (text != null) { const k = takeReposts(post, text); if (k) { noteParsed(`${k} 条转发`); savePost(post); } else parseFailed("加载转发"); }
    rerenderDetail(post);
  }

  async function ensureComments(post) {
    if (post.commentsGenerated || post.authorType === "user" || post._genComments) return;
    if (!activeChars().length) return;
    post._genComments = true; rerenderDetail(post);
    const owner = post.charId || post.altOf;
    const others = post.superName ? superChars(post.superName).filter(c => c.id !== owner).slice(0, 3) : pickCast(activeChars().filter(c => c.id !== owner), 3);
    const cast = owner ? [charById(owner), ...others].filter(Boolean) : others.length ? others : activeChars().slice(0, 1);
    const author = authorOf(post);
    const want = Math.min(Math.max(post.counts.comments, 3), rand(9, 14));
    const rpN = repostWant(post);
    const instruction = [
      `当前时间：${nowText()}`,
      `博主：${author.name}${altBloggerNote(post)}`,
      post.superName ? `这是「${post.superName}」超话里的帖子：评论的都是超话里的同好，用圈内的口吻和梗；没列出来的角色看不到，不会来评论。` : "",
      `微博发布于：${fmtTime(post.createdAt)}`,
      genderLine(post),
      `微博正文：\n${post.text}`,
      post.images.length ? `配图：${post.images.map(i => i.desc || "图片").join(" | ")}` : "",
      post.repost ? `这是一条转发，原微博 @${post.repost.author}：${post.repost.text}` : "",
      `可能来评论的其他角色（符合关系才来，不来就不写）：\n${charsForPrompt(others) || "无"}`,
      `用户的微博昵称：${S.meta.nickname}（用户本人不要出现在评论里）`,
      `生成约 ${want} 条评论，其中楼中楼回复 2~5 条${owner ? "，博主本人至少回复 1 条" : ""}。`,
      rpN ? REPOST_FMT(rpN) : "",
      caltLine(cast, { post }),
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "comments"], instruction }, "加载评论");
    post._genComments = false;
    if (text != null) {
      const list = dropCharAtUser(fixAltAuthors(commentsFromBlocks(parseComments(text), post, {}), { post }), post);
      const rk = rpN ? takeReposts(post, text) : 0;
      if (list.length) noteParsed(`${list.length} 条评论${rk ? `，${rk} 条转发` : ""}`); else parseFailed("加载评论");
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
  /** char 小号用小号点一个赞（只记名字，通知里和路人混在一起） */
  function likeAsAlt(p, nick) {
    if ((p.npcLikers || []).includes(nick)) return false;
    p.npcLikers = [...(p.npcLikers || []), nick]; p.counts.likes++; p.likeAt = nowIso(); savePost(p);
    return true;
  }
  /**
   * 她大号发博后，char 的小号偷偷行动（代码直接加，不靠 AI）：
   * 第一次出场在生成后第 1～3 次发博，而且要这批新粉丝里至少有 2 个路人才混进去；之后偶尔点赞
   */
  function altLurk(post, fanCount) {
    if (post.visibility && post.visibility !== "public") return;
    let changed = false;
    for (const c of activeChars()) {
      const a = calt(c.id); if (!a) continue;
      if (!a.appeared) {
        a.wait = (a.wait == null ? 1 : a.wait) - 1; changed = true;
        if (a.wait > 0) continue;
        // 有这批新粉丝就插在他们中间（时间也夹在中间），没有就自己悄悄关注
        const fans = S.meta.fans || (S.meta.fans = []);
        if (fanCount >= 2 && fans.length >= 2) {
          const i = rand(1, Math.min(fanCount, fans.length) - 1);
          fans.splice(i, 0, { name: a.nick, at: new Date(new Date(fans[i - 1].at).getTime() - 500).toISOString() });
        } else fans.unshift({ name: a.nick, at: new Date(Date.now() + rand(20, 90) * 1000).toISOString() });
        S.meta.followers = (S.meta.followers || 0) + 1;
        likeAsAlt(post, a.nick);
        const older = shuffle(S.posts.filter(p => p.authorType === "user" && acctOf(p) === "main" && p.id !== post.id && p.visibility !== "self" && p.visibility !== "friends")).slice(0, rand(1, 3));
        for (const p of older) likeAsAlt(p, a.nick);
        a.appeared = true; a.appearedAt = nowIso();
      } else if (Math.random() < 0.35) likeAsAlt(post, a.nick);
    }
    if (changed) saveCalts();
  }

  /** char 能不能主动私信：上一条是他发的、用户还没回，12 小时内不再来 */
  function charDmOk(ch) {
    const t = S.threads.find(x => x.peer.type === "char" && x.peer.charId === ch.id && (x.acct || "main") === curAcct());
    const last = t && t.messages[t.messages.length - 1];
    return !(last && last.from === "peer" && Date.now() - new Date(last.at || t.updatedAt).getTime() < 12 * 3600e3);
  }
  /** 他最近私信过的话：让 AI 别重复 */
  function charDmRecent(ch) {
    const t = S.threads.find(x => x.peer.type === "char" && x.peer.charId === ch.id && (x.acct || "main") === curAcct());
    const mine = t ? t.messages.filter(m => m.from === "peer").slice(-6).map(m => m.text) : [];
    return mine.length ? `${ch.name} 最近在微博私信里说过：「${mine.join(" / ").slice(0, 160)}」，这次换新的话题和说法，不要重复。` : "";
  }
  /** 掷骰子挑一个来私信的 char：15%，有特别关注的 25% 并优先挑他们 */
  function rollCharDm(pool, rate) {
    pool = pool.filter(charDmOk);
    const starred = pool.filter(c => isStarred(c.id));
    if (!pool.length || Math.random() >= (rate != null ? rate : starred.length ? 0.25 : 0.15)) return null;
    return shuffle(starred.length ? starred : pool)[0];
  }

  /** 发博后谁来私信：陌生人大号 30%（带热搜或公众人物 50%）、小号 20%；角色 15%，有特别关注的 25%，超话帖 10% */
  function planPostDms(post, { alt, sup, cast }) {
    if (post.visibility === "friends") return { line: "这次没有人私信用户，不要输出 ===私信===。" };
    const hot = topicsIn(post.text).some(hotItem);
    const stranger = Math.random() < (alt ? 0.2 : hot || S.meta.publicFigure ? 0.5 : 0.3);
    const kinds = [
      [sup ? "同一个超话的同好来搭话、找用户聊这个话题" : "看了这条博来搭话的同好（「姐妹你也去了吗」「求链接」「同款！」这种）", 4],
      ["之前在用户微博评论区杠过、吵过的路人：继续吵或者来道歉（没有吵过的人就换成来搭话的同好）", alt ? 0 : 1],
      ["求互粉、求回关的", 1], ["约稿、代购、小广告、刷粉这类营销号", 1],
      ["粉丝：表白、求回关、问近况", !alt && S.meta.publicFigure ? 3 : 0], ["黑粉：阴阳怪气", !alt && S.meta.publicFigure ? 0.5 : 0],
    ].filter(k => k[1] > 0);
    let r = Math.random() * kinds.reduce((a, k) => a + k[1], 0); const kind = kinds.find(k => (r -= k[1]) < 0) || kinds[0];
    const pick = rollCharDm(cast.filter(c => !alt || knowsAlt(c.id)), sup ? 0.1 : null);
    const lines = [
      stranger ? `这次要有 1 个陌生路人私信用户：${kind[0]}。1～3 条，一句一个块，短、口语，像真人。` : "",
      pick ? `这次 ${pick.name} 想私信用户（他不在评论区评论这条，改成私信，内容比较私人、公开说不方便，语气按人设）。1～4 条，一句一个块。${charDmRecent(pick)}` : "",
      !stranger && !pick ? "这次没有人私信用户，不要输出 ===私信===。" : !pick ? "角色这次都不私信。" : !stranger ? "路人这次都不私信。" : "",
    ];
    return { stranger, charId: pick && pick.id, line: lines.filter(Boolean).join("") };
  }

  /** char 转发了用户的博：给他生成一条真正的转发微博（主页、首页都看得到），转发列表里记下 postId 防重复 */
  function charRepostPost(src, r) {
    if (!r.charId || r.postId || !charById(r.charId) || src.visibility === "friends" || src.visibility === "self") return null;
    const a = authorOf(src); const acc = S.accounts[r.charId] || {};
    const base = src.repost && !src.repost.deleted ? src.repost : null;
    const post = {
      id: uid("wb"), scope: S.identity.id, authorType: "char", charId: r.charId, authorName: charNickname(r.charId),
      verified: acc.verified || "无", vip: !!acc.vip, source: "", createdAt: r.createdAt || nowIso(), text: (r.text || "").trim() || "转发微博", images: [],
      repost: base ? { ...base, chain: [{ name: a.name, text: src.text }, ...(base.chain || [])].slice(0, 6), viaPostId: src.id }
        : { author: a.name, text: src.text, images: src.images, postId: src.id, chain: [] },
      counts: { reposts: 0, comments: rand(0, 3), likes: rand(0, 20) }, liked: false, comments: [], commentsGenerated: false, origin: "repost",
    };
    r.postId = post.id;
    S.posts.push(post); savePost(post); S.allPostRows++;
    return post;
  }
  /** 旧数据：以前转发过但没生成转发微博的，打开他主页时补上 */
  function backfillCharReposts(charId) {
    for (const p of S.posts.filter(x => x.authorType === "user" && (x.reposts || []).some(r => r.charId === charId && !r.postId))) {
      let made = false;
      for (const r of p.reposts) if (r.charId === charId && charRepostPost(p, r)) made = true;
      if (made) savePost(p);
    }
  }

  /** 用户发博后：角色和路人的反应 */
  async function reactToUserPost(post) {
    if (post.visibility === "self" || !activeChars().length || post._genComments || post.reacted) return;
    post.reacted = true; post._genComments = true; savePost(post); rerenderDetail(post);
    // 超话帖：只有也逛这个超话的角色会来，特别关注的人偶尔撞见，其他人看不到
    const sup = post.superName;
    const alt = acctOf(post) === "alt"; const prof = profOf(post);
    // 小号：知道的人会来；不知道的只在逛同一个超话、或内容直接跟他有关时偶尔撞见
    const altKnown = alt ? activeChars().filter(c => knowsAlt(c.id)) : [];
    const altStrangers = alt ? shuffle(activeChars().filter(c => !knowsAlt(c.id) && ((sup && superChars(sup).includes(c))
      || (post.text || "").includes(c.name) || (post.text || "").includes(charNickname(c.id))))).filter(() => Math.random() < 0.3).slice(0, 2) : [];
    const lurkers = sup && !alt ? superChars(sup) : [];
    const peekers = sup && !alt ? activeChars().filter(c => isStarred(c.id) && !lurkers.includes(c)) : [];
    const cast = alt ? [...altKnown.slice(0, 4), ...altStrangers] : sup ? [...lurkers, ...peekers].slice(0, 6) : pickCast(activeChars(), 6);
    const castIds = (cast.length ? cast : pickCast(activeChars(), 1)).map(c => c.id);
    const altPostLine = alt ? [
      `这是用户用小号「${prof.nickname}」发的${sup ? `「${sup}」超话帖` : "微博"}：小号只有 ${prof.followers} 个粉丝，来互动的大多是路过的陌生网友（比大号冷清一些，但正常有人回）${sup ? "（超话里的同好，用圈内的口吻和梗）" : ""}；不会上热搜。`,
      altKnown.length ? `${altKnown.map(c => c.name).join("、")} 知道这个小号是用户：刷到了可能来点赞、评论或私信，语气就是平时对用户的语气（可以调侃用户在小号上发的东西），也可以不来。` : "",
      altStrangers.length ? `${altStrangers.map(c => c.name).join("、")} 不知道这个小号是用户：只是偶然刷到一个陌生网友的${sup ? "超话帖" : "微博"}。来不来看内容戳不戳他，大多数时候不来；来了也只当是陌生人，绝对认不出是用户，不私信、不点名用户。` : "",
      cast.length ? "除此之外的角色都看不到这条，绝对不会出现。" : "没有角色会刷到这条，绝对不会出现。",
    ].filter(Boolean).join("") : "";
    const superLine = alt ? "" : sup ? [
      `这是用户在「${sup}」超话里发的帖：只有超话里的同好看得到，路人评论用圈内的口吻和梗，不会有新粉丝。`,
      lurkers.length ? `${lurkers.map(c => c.name).join("、")} 也逛这个超话，看到了可能来评论。` : "",
      peekers.length ? `${peekers.map(c => c.name).join("、")} 特别关注用户，很少见地可能刷到这条（概率很低，大多数时候不来；来了就是意外撞见的语气，比如「你还玩这个？」）。` : "",
      "除此之外的角色都看不到这条帖子，绝对不会出现。大多数时候没有角色来评论，私信也一样。",
    ].filter(Boolean).join("") : "";
    // 私信由代码掷骰子：掷中了明确要 AI 写，没掷中就不要
    const dmPlan = planPostDms(post, { alt, sup, cast });
    // 粉丝刷到：互关的一半概率来 1 个，单向粉丝四分之一概率来 1 个
    const myFans = alt || sup || post.visibility === "friends" ? [] : (S.meta.fans || []).map(f => f.name).filter(n => n && !altOwner(n) && !isUserName(n));
    const mutualFans = myFans.filter(isFollowingNpc), oneWayFans = myFans.filter(n => !isFollowingNpc(n));
    const fanPick = [...(mutualFans.length && Math.random() < 0.5 ? [shuffle(mutualFans)[0]] : []), ...(oneWayFans.length && Math.random() < 0.25 ? [shuffle(oneWayFans)[0]] : [])];
    const instruction = [
      `当前时间：${nowText()}`,
      superLine, altPostLine,
      `用户的微博昵称：${prof.nickname}，粉丝 ${prof.followers} 人。用户性别：${S.identity.gender || "未知（评论里用「博主」「ta」）"}，评论称呼一定要用对性别。`,
      post.repost ? `用户转发了 @${post.repost.author} 的微博：「${post.repost.text}」，转发语：` : `用户的微博正文：`,
      post.text || "（无文字）",
      post.images.length ? `配图：${post.images.map(i => i.desc || "一张用户自己上传的照片").join(" | ")}（看不到图片时不要臆测细节）` : "",
      post.location ? `定位：${post.location}` : "",
      topicLine(post),
      post.visibility === "friends" ? "这条微博仅好友圈可见：只有角色能看到，不要生成路人评论。" : `路人评论 ${alt ? rand(3, 7) : topicsIn(post.text).some(hotItem) ? rand(5, 9) : rand(2, 6)} 条左右${alt ? "，路人点赞十几到几十个，新增粉丝 0～2 个" : ""}。`,
      `可能来互动的角色：\n${charsForPrompt(cast) || "无（没有角色会来）"}`,
      sup || alt ? "" : starredLine(cast),
      caltLine(cast, { post }),
      dmPlan.line,
      fanPick.length ? `用户的粉丝刷到了这条：\n${fanPick.map(n => `- ${npcCard(n)}`).join("\n")}\n符合 TA 的人设和兴趣就来评论（「作者」一字不差、「角色」写 无，算在路人评论里），不感兴趣也可以不来。` : "",
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: castIds, appTags: ["nox_weibo", "reaction"], instruction }, "获取互动");
    post._genComments = false; rerenderDetail(post);
    if (text == null) { post.reacted = false; savePost(post); return; }
    const list = fixAltAuthors(commentsFromBlocks(parseComments(text), post, {}), { post }).filter(c => !alt || !(c.charId || c.altOf) || cast.some(x => x.id === (c.charId || c.altOf)));
    for (const c of list) if (c.authorType === "npc" && !c.parentId) logNpc(c.authorName, `在用户的博「${(post.text || "（图片）").slice(0, 20)}」下评论：${c.text.slice(0, 40)}`);
    const sum = parseBlocks(text, "互动")[0] || {};
    const dms = parseBlocks(text, "私信").filter(b => { const ch = charByName(b["角色"]) || charByName(b["来自"], true); return ch ? dmPlan.charId === ch.id : dmPlan.stranger; });
    if (!list.length && !Object.keys(sum).length && !dms.length) { parseFailed("发博后的互动"); return; }
    noteParsed(`${list.length} 条评论，点赞角色：${sum["点赞角色"] || "无"}${dms.length ? `，私信 ${dms.length} 条` : ""}`);
    const castSet = new Set(cast.map(c => c.id));
    const likedChars = none(sum["点赞角色"]) ? [] : sum["点赞角色"].split(/[、,，\s]+/).map(charByName).filter(c => c && (!alt || castSet.has(c.id)));
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
    for (const r of reposts) charRepostPost(fresh, r);
    prof.followers = (prof.followers || 0) + Math.min(clampInt(sum["新增粉丝"], 0), alt ? 3 : 1e9);
    const fanNames = none(sum["新粉丝"]) ? [] : sum["新粉丝"].split(/[、,，\s]+/).map(x => x.replace(/^@/, "").trim()).filter(x => x && !isUserName(x) && !charByName(x, true));
    if (fanNames.length) prof.fans = [...fanNames.slice(0, alt ? 3 : 8).map((name, i) => ({ name, at: new Date(Date.now() - i * 1000).toISOString() })), ...(prof.fans || [])].slice(0, 200);
    if (!alt) altLurk(fresh, fanNames.length);
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
    // 角色评论过就不再私信（谁来私信已经在 planPostDms 掷过骰子）
    const isCharDm = b => charByName(b["角色"]) || charByName(b["来自"], true);
    const commented = new Set(list.map(c => c.charId || c.altOf).filter(Boolean));
    const dmsOk = dms.filter(b => { const ch = isCharDm(b); return !ch || ((!alt || knowsAlt(ch.id)) && !commented.has(ch.id)); });
    if (dmsOk.length) deliverDms(dmsOk, { acct: acctOf(post), about: `看到用户${post.superName ? `在「${post.superName}」超话` : ""}发的「${(post.text || "（图片）").slice(0, 50)}」后来私信`, delay: delay + rand(2000, 6000) });
    setTimeout(refreshMsgViews, delay + 500);
    savePost(fresh); refreshVisible(fresh);
    // 让角色记住
    const snippet = (post.text || "（图片）").slice(0, 60);
    const userName = alt ? `${S.identity.name || S.meta.nickname}用小号「${prof.nickname}」` : S.identity.name || S.meta.nickname;
    const by = c => c.charId || (c.altOf && altOpen(c.altOf) ? c.altOf : null);
    for (const ch of new Set([...list.map(by).filter(Boolean), ...likedChars.map(c => c.id), ...reposts.filter(r => r.charId).map(r => r.charId)])) {
      const mine = list.filter(c => by(c) === ch).map(c => c.text).join(" / ");
      const did = [likedChars.some(c => c.id === ch) ? "点了赞" : "", mine ? `评论：「${mine.slice(0, 80)}」` : "", reposts.some(r => r.charId === ch) ? "转发了" : ""].filter(Boolean).join("，");
      if (alt && !knowsAlt(ch)) continue; // 不知道小号的人：只当是陌生网友，不写记忆
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
  async function replyFromChar(post, userComment, targetComment, viaAlt) {
    let charId = viaAlt || null;
    if (charId) { /* 回复的是 char 小号的评论 / 小号自己的博 */ }
    else if (targetComment && targetComment.authorType === "char") charId = targetComment.charId;
    else if (!targetComment && post.authorType === "char") charId = post.charId;
    else if (targetComment && targetComment.authorType === "user" && post.authorType === "char") charId = post.charId;
    if (!charId || !charById(charId)) return;
    const ch = charById(charId);
    const alt = acctOf(userComment) === "alt"; const knows = !alt || knowsAlt(charId); const nick = profOf(userComment).nickname;
    const thread = targetComment ? floorLines(post, userComment, knows) : "";
    const uCode = codeOf(post, userComment);
    const ca = viaAlt ? calt(charId) : null;
    const instruction = [
      `当前时间：${nowText()}`,
      `微博博主：${authorOf(post).name}${post.authorType === "user" ? (acctOf(post) === "alt" ? (knowsAlt(charId) ? "（用户的小号）" : "") : "（就是用户）") : post.charId === charId || (ca && post.altOf === charId) ? "（就是你）" : ""}`,
      ca ? `你这次在用自己的微博小号「${ca.nick}」（不认证、粉丝很少；${altOpen(charId) ? "用户已经知道这是你的小号" : "你没告诉过用户这是你，你以为用户不知道；不自称是谁、不提真名和大号、不用只有你们俩才用的称呼，心虚了可以装傻或少说"}）。小号就是你本人，口癖性格不变，只是更随意。「作者」填「${ca.nick}」。` : "",
      `微博正文：${post.text.slice(0, 300)}`,
      thread ? `这条评论楼里的对话：\n${thread}` : "",
      `${!alt ? `用户（微博昵称 ${nick}）` : knows ? `用户用小号「${nick}」` : `陌生网友「${nick}」（你不认识这个人，就当普通网友回）`}刚刚${targetComment ? `回复了 ${targetComment.authorType === "char" ? "你" : targetComment.authorName}` : "评论了你的微博"}：「${userComment.text}」，这条评论的编号是 ${uCode}。`,
      `你的微博昵称：${ca ? ca.nick : charNickname(charId)}。回复${knows ? "用户" : "这个网友"}时「回复」字段填 ${uCode}。${knows && !ca ? "" : "不要私信。"}`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterId: charId, appTags: ["nox_weibo", "reply"], instruction }, `${ca && !altSeen(charId) ? "路人" : ch.name}回复`);
    if (text == null) return;
    // 等回复的时候用户把评论删了：这轮回复整个作废
    const alive = () => { const p = S.posts.find(x => x.id === post.id); return p && p.comments.some(c => c.id === userComment.id); };
    if (!alive()) { noteParsed("用户已删除评论，回复作废"); return; }
    const list = commentsFromBlocks(parseComments(text), post, {});
    if (ca) for (const c of list) if (c.charId === charId || c.authorName === ca.nick) Object.assign(c, { authorType: "npc", charId: undefined, authorName: ca.nick, altOf: charId, verified: "无", vip: false, isPostAuthor: post.altOf === charId });
    // 评论区已经回了：私信只偶尔放行，免得回一句评论就追来私信；用小号回的不私信
    const dms = knows && !ca && Math.random() < 0.3 ? parseBlocks(text, "私信") : []; const sum = parseBlocks(text, "互动")[0];
    if (list.length || dms.length) noteParsed(`${list.length} 条回复${dms.length ? `，私信 ${dms.length} 条` : ""}`); else { parseFailed(`${ca && !altSeen(charId) ? "路人" : ch.name}回复`); return; }
    const fresh = S.posts.find(p => p.id === post.id); if (!fresh) return;
    likeUserComment(fresh, userComment, sum);
    let delay = rand(1500, 4000);
    for (const c of list) {
      if (!c.parentId) { c.parentId = userComment.parentId || userComment.id; c.replyToName = nick; c.replyToId = userComment.id; }
      setTimeout(() => {
        if (!alive()) return;
        c.createdAt = nowIso(); fresh.comments.push(c); fresh.counts.comments++; savePost(fresh);
        if ((c.authorType === "char" || c.altOf) && sameAcct(userComment)) banner(authorOf(c), c.authorName, `回复了你：${c.text}`, () => openDetail(fresh.id));
        refreshVisible(fresh);
      }, delay);
      delay += rand(1500, 3000);
    }
    if (dms.length) deliverDms(dms, { onlyChar: charId, acct: acctOf(userComment), delay: delay + rand(3000, 8000) });
    const said = list.filter(c => c.charId === charId || c.altOf === charId).map(c => c.text).join(" / ");
    if (knows && (!ca || altOpen(charId))) remember(charId, `${S.identity.name || S.meta.nickname}${alt ? `用小号「${nick}」` : ""}在微博${post.authorType === "char" && post.charId === charId ? "我的微博下" : ""}评论：「${userComment.text.slice(0, 60)}」${said ? `，我回复：「${said.slice(0, 80)}」` : ""}`, `weibo_reply_${userComment.id}`, null, userComment);
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
    const uCode = codeOf(post, userComment); const nick = profOf(userComment).nickname;
    const prompt = [
      `微博博主：${authorOf(post).name}${post.authorType === "user" ? "（就是用户本人）" : ""}`,
      genderLine(post),
      `用户本人的性别：${S.identity.gender || "未知（用 ta 称呼）"}`,
      `微博正文：${post.text.slice(0, 300)}`,
      targetComment ? `这层评论楼的完整对话（按时间）：\n${floorLines(post, userComment)}` : "",
      isFollowingNpc(targetName) || isFanNpc(targetName) ? `关于「${targetName}」：${npcCard(targetName)}` : "",
      isFanNpc(targetName) && sameAcct(userComment) && !isAlt() ? `「${targetName}」是用户的粉丝。只有这次真的吵翻了、TA 实在受不了时才会取关用户（很少发生，大多数时候不会）：取关的话在最后的 ===互动=== 里加一行「取关：是」。` : "",
      `用户（微博昵称「${nick}」）刚刚${targetComment ? `回复了「${targetName}」` : `评论了博主「${targetName}」的微博`}：「${userComment.text}」，编号 ${uCode}。`,
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
    const npcSum = parseBlocks(text, "互动")[0];
    likeUserComment(fresh, userComment, npcSum);
    const said = list.filter(c => c.authorName === targetName).map(c => c.text).join(" / ");
    if (said) logNpc(targetName, `评论区里用户说「${userComment.text.slice(0, 30)}」，TA 回「${said.slice(0, 40)}」`);
    if (npcSum && yes(npcSum["取关"]) && isFanNpc(targetName) && !isAlt()) { removeFanNpc(targetName); logNpc(targetName, "吵完取关了用户"); }
    let delay = rand(1500, 4000);
    for (const c of list) {
      if (!c.parentId) { c.parentId = userComment.parentId || userComment.id; c.replyToName = nick; c.replyToId = userComment.id; }
      if (c.authorName === post.authorName && post.authorType === "npc") c.isPostAuthor = true;
      setTimeout(() => {
        if (!alive()) return;
        c.createdAt = nowIso(); fresh.comments.push(c); fresh.counts.comments++; savePost(fresh);
        if (c.replyToName === nick && sameAcct(userComment)) banner(authorOf(c), c.authorName, `回复了你：${c.text}`, () => openDetail(fresh.id));
        refreshVisible(fresh);
      }, delay);
      delay += rand(1800, 4000);
    }
    if (dms.length) deliverDms(dms, { acct: acctOf(userComment), about: `在 @${authorOf(fresh).name} 的微博评论区和用户你来我往过：\n${floorLines(fresh, userComment).slice(0, 500)}`, delay: delay + rand(4000, 10000) });
    setTimeout(refreshMsgViews, delay + 500);
  }

  /** 评论区「加载更多」：继续生成新评论，可以回复已有评论 */
  async function moreComments(post) {
    if (post._genComments || !activeChars().length) return;
    post._genComments = true; rerenderDetail(post);
    const altPost = post.authorType === "user" && acctOf(post) === "alt";
    const owner = post.charId || post.altOf;
    const others = altPost ? activeChars().filter(c => knowsAlt(c.id)).slice(0, 3) : post.superName ? superChars(post.superName).filter(c => c.id !== owner).slice(0, 3) : pickCast(activeChars().filter(c => c.id !== owner), 3);
    const cast = owner ? [charById(owner), ...others].filter(Boolean) : others.length ? others : activeChars().slice(0, 1);
    const existing = post.comments.slice().sort((a, b) => b.likes - a.likes).slice(0, 18).map(c => cmtLine(post, c)).join("\n");
    const instruction = [
      `当前时间：${nowText()}`,
      `博主：${authorOf(post).name}${post.authorType === "user" ? (altPost ? "（用户的小号：粉丝很少，来的大多是陌生网友；除了下面列出的角色，没人知道这是用户。用户不要出现在新评论里）" : "（就是用户本人，用户不要出现在新评论里）") : altBloggerNote(post)}`,
      `微博正文：\n${post.text}`,
      genderLine(post),
      `已有评论（方括号里是编号）：\n${existing || "无"}`,
      `继续生成 ${altPost ? rand(4, 7) : rand(5, 8)} 条新评论：可以是新的一级评论，也可以回复已有评论（「回复」字段填已有编号）或本次新评论（填本次编号）。新评论的编号用 n1、n2……`,
      `可能来评论的其他角色（符合关系才来）：\n${charsForPrompt(others) || "无"}`,
      caltLine(cast, { post }),
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "comments"], instruction }, "加载评论");
    post._genComments = false;
    if (text != null) {
      const list = dropCharAtUser(fixAltAuthors(commentsFromBlocks(parseComments(text), post, {}), { post }), post).filter(c => !altPost || !(c.charId || c.altOf) || others.some(x => x.id === (c.charId || c.altOf)));
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

  /** 主页历史微博的时间（只在生成时定一次，之后不再动）：AI 写的日期照用（内容是按那天写的）。没写、写成未来或太近的往前挪 1～4 天；和后一条挤在一小时内的，同一天里错开几个小时 */
  function spreadHistory(posts, before) {
    if (!posts.length) return false;
    const order = posts.map((p, i) => ({ p, i, t: new Date(p.createdAt).getTime() }))
      .sort((a, b) => (b.t || 0) - (a.t || 0) || a.i - b.i);
    let prev = before; let moved = false;
    for (const o of order) {
      let t = o.t;
      if (!t || t > before - 12 * 3600e3 || t > prev) {
        const d = new Date(prev - (prev === before ? 0.5 + Math.random() * 2.5 : 1 + Math.random() * 3) * 86400e3);
        d.setHours(rand(7, 23), rand(0, 59), rand(0, 59));
        t = Math.min(d.getTime(), prev - 12 * 3600e3);
      } else if (t > prev - 3600e3) t = prev - rand(2 * 3600, 6 * 3600) * 1000;
      if (t !== o.t) { o.p.createdAt = new Date(t).toISOString(); moved = true; }
      prev = t;
    }
    return moved;
  }

  /** 角色主页：建号 + 历史微博 */
  async function ensureCharProfile(charId, more) {
    const acc = S.accounts[charId];
    if ((acc && acc.profileGenerated && !more) || S[`_gen_${charId}`]) return;
    S[`_gen_${charId}`] = true; rerenderProfile(charId);
    const ch = charById(charId);
    const mine = S.posts.filter(p => p.charId === charId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const n = more ? rand(4, 6) : rand(5, 7);
    const instruction = [
      `当前时间：${nowText()}`,
      acc && acc.nickname ? `你的微博昵称已经是「${acc.nickname}」，必须沿用。` : "",
      acc && acc.profileGenerated ? "主页资料已经有了，这次只输出更早的历史微博，不要输出 ===主页===。" : "",
      mine.length ? `你最近已经发过的微博（不要重复，历史微博要比这些更早）：\n${mine.slice(0, 8).map(p => `- ${fmtTime(p.createdAt)}：${p.text.slice(0, 40)}`).join("\n")}` : "",
      `写 ${n} 条历史微博${mine.length ? `，时间都早于 ${fmtTime(mine[mine.length - 1].createdAt)}` : ""}。`,
      `每条的${PLAN_HEAD}：\n${Array.from({ length: n }, (_, i) => `- 第 ${i + 1} 条：${postPlan(charId, { history: true })}`).join("\n")}`,
    ].filter(Boolean).join("\n\n");
    saveMeta();
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
        .map(p => { p.authorType = "char"; p.charId = charId; p.authorName = charNickname(charId); return p; }).filter(p => !isCharNotice(p));
      spreadHistory(posts, oldest);
      thinPics(posts); for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; }
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
    const pinned = opts.showPin && S.me.pinnedPostId === p.id;
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
      <div class="text ${long ? "clamp" : ""}">${pinned ? '<span class="pin-tag">置顶</span>' : ""}${p.superName ? `<span class="link super-tag" data-act="open-super" data-name="${esc(p.superName)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M10 4 8 9l4 11 4-11-2-5"/></svg>${esc(p.superName)}超话</span> ` : ""}${richText(p.text)}${p.repost ? p._chainHtml : ""}</div>
      ${long ? '<div class="expand">全文</div>' : ""}
      ${picsHtml(p.images, p.id)}
      ${p.location ? `<div class="meta" style="margin-top:8px;color:var(--wb-link)">📍 ${esc(p.location)}</div>` : ""}
      ${quote}
      <div class="actions">
        <button class="act" data-act="repost" data-post="${esc(p.id)}">${I.repost}<span>${p.counts.reposts ? fmtNum(p.counts.reposts) : "转发"}</span></button>
        <button class="act" data-act="${opts.full ? "focus-reply" : "open-detail"}" data-post="${esc(p.id)}">${I.comment}<span>${p.counts.comments ? fmtNum(p.counts.comments) : "评论"}</span></button>
        <button class="act ${p[LK()] ? "liked" : ""}" data-act="like" data-post="${esc(p.id)}">${p[LK()] ? I.liked : I.like}<span>${p.counts.likes ? fmtNum(p.counts.likes) : "赞"}</span></button>
      </div>
    </article>`;
  }

  // ───────────────────────── 首页 ─────────────────────────
  const inFollowFeed = p => isMe(p) || p.followFeed || (p.authorType === "char" && isFollowingChar(p.charId)) || (p.authorType === "npc" && isFollowingNpc(p.authorName));
  function feedPosts() {
    // 话题页、搜索、超话里的微博只在那边看，不混进首页
    const list = S.posts.filter(p => !p.superName && (p.authorType !== "user" || isMe(p)) && (p.authorType === "user" || !["profile", "topic", "search", "super"].includes(p.origin)));
    const filtered = S.homeTab === "follow" ? list.filter(inFollowFeed) : list.filter(p => p.authorType === "npc" || p.authorType === "char");
    return filtered.filter(p => (p.visibility !== "self" || isMe(p)) && !isCharNotice(p)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
    const mine = S.posts.filter(isMe).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const pin = mine.find(p => p.id === S.me.pinnedPostId);
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
    const a = authorOf({ authorType: "user", ...acctTag() });
    const posts = myPosts();
    const liked = S.posts.filter(p => p[LK()] && !isMe(p)).sort((x, y) => new Date(y[LKAT()] || y.createdAt) - new Date(x[LKAT()] || x.createdAt));
    let body = "";
    if (meTab === "posts") body = posts.length ? posts.map(p => cardHtml(p, { showPin: true })).join("") : `<div class="empty"><div class="big">✏️</div>还没有发过微博<div><button class="btn-primary" data-act="compose">发一条</button></div></div>`;
    if (meTab === "album") {
      const pics = posts.flatMap(p => (p.images || []).map((img, i) => picTile(img, p.id, i)));
      body = pics.length ? `<div class="album">${pics.join("")}</div>` : `<div class="empty">还没有图片</div>`;
    }
    if (meTab === "liked") body = liked.length ? liked.map(p => cardHtml(p, { noFollow: true })).join("") : `<div class="empty">还没有赞过微博</div>`;
    return profileHeaderHtml(a, {
      cover: COVERS[S.me.cover || 0], coverRef: S.me.coverRef, bio: S.me.bio, ip: S.me.ip, posts: posts.length, following: followingCount(), followers: S.me.followers, mine: true,
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
    $("#topbar").innerHTML = `<div class="topbar-inner"><span class="top-title">我</span><button class="acct-switch" data-act="switch-acct">切换账号</button><button class="top-icon" data-act="open-settings" aria-label="设置">${I.gear}</button></div>`;
    const a = authorOf({ authorType: "user", ...acctTag() });
    const visits = (S.me.visits || []).slice(0, 12);
    const visitHtml = visits.length ? visits.map(v => { const va = v.type === "char" ? authorOf({ authorType: "char", charId: v.charId }) : authorOf({ authorType: "npc", authorName: v.name });
      return `<div class="visit" ${profileAttrs(va)}>${avatarHtml(va)}<span>${esc(va.name)}</span><em>访问${v.count || 1}次</em></div>`; }).join("")
      : `<div class="visit-empty">点进谁的主页，这里就会记下来</div>`;
    $("#view").innerHTML = `<div class="me-head" data-act="open-my-home">${avatarHtml(a)}<div class="cell-main">
        <div class="profile-name ${a.vip ? "vip" : ""}">${esc(a.name)}${a.vip ? I.crown : ""}${isAlt() ? `<span class="alt-tag">小号</span>` : ""}</div>
        <div class="me-bio">简介：${esc(S.me.bio || "暂无简介")}</div></div><span class="me-home-link">我的主页 ›</span></div>
      <div class="me-stats">
        <button data-act="open-my-home"><b>${fmtNum(myPosts().length)}</b>微博</button>
        <button data-act="open-following"><b>${fmtNum(followingCount())}</b>关注</button>
        <button data-act="open-fans"><b>${fmtNum(S.me.followers)}</b>粉丝</button>
        <button data-act="open-visitors"><b>${fmtNum((S.me.visitors || []).length)}</b>访客</button>
      </div>
      <div class="me-grid">${ME_GRID.map(g => `<button data-act="${g.act}">${g.icon}<span>${g.label}</span></button>`).join("")}</div>
      <div class="me-card"><div class="me-card-head"><b>我的访问记录</b>${visits.length ? `<button data-act="open-visits">查看全部 ›</button>` : ""}</div><div class="visit-row">${visitHtml}</div></div>`;
    hydrateImages($("#view"));
  }
  /** 访问记录：点进谁的主页记一笔（最近 50 个） */
  function noteVisit(v) {
    const key = v.type === "char" ? `c_${v.charId}` : `n_${v.name}`;
    const old = (S.me.visits || []).find(x => x.key === key);
    S.me.visits = [{ ...v, key, at: nowIso(), count: (old ? old.count || 1 : 0) + 1 }, ...(S.me.visits || []).filter(x => x.key !== key)].slice(0, 50);
    saveMeta();
  }
  function noteHistory(postId) {
    S.me.history = [{ id: postId, at: nowIso() }, ...(S.me.history || []).filter(x => x.id !== postId)].slice(0, 100);
    saveMeta();
  }
  const isFav = id => (S.me.favs || []).some(f => f.id === id);
  const isFavAny = id => [S.meta, S.alt].some(m => m && (m.favs || []).some(f => f.id === id));
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
        ...npcs.map(n => personRow(authorOf({ authorType: "npc", authorName: n }), { sub: (npcInfo(n) || {}).bio || "", right: `<button class="follow-btn on" data-act="toggle-follow-npc" data-name="${esc(n)}">已关注</button>` }))];
      return rows.length ? `<div class="form-note">共 ${rows.length} 人</div>${rows.join("")}` : `<div class="empty">还没有关注任何人</div>`;
    });
  }
  function openFans() {
    openListPage("fans", "我的粉丝", () => {
      const chars = isAlt() ? [] : S.chars.filter(c => isFollowingChar(c.id));
      const fans = (S.me.fans || []);
      const rows = [...chars.map(c => personRow(authorOf({ authorType: "char", charId: c.id }), { sub: charSub(c.id), right: `<span class="cell-sub">互相关注</span>` })),
        ...fans.map(f => personRow(authorOf({ authorType: "npc", authorName: f.name }), { sub: `${fmtTime(f.at)} 关注了你`, right: isFollowingNpc(f.name) ? `<span class="cell-sub">互相关注</span>` : `<button class="follow-btn" data-act="toggle-follow-npc" data-name="${esc(f.name)}">回关</button>` }))];
      const rest = Math.max(0, (S.me.followers || 0) - rows.length);
      return `<div class="form-note">共 ${fmtNum(S.me.followers)} 位粉丝</div>${rows.join("")}${rest ? `<div class="load-more">还有 ${fmtNum(rest)} 位粉丝</div>` : ""}`;
    });
  }
  function openVisitors() {
    openListPage("visitors", "访客", () => `<div class="empty"><div class="big">👀</div>谁来看过你的主页，会在「char 自动发博」那期上线<br>到时候 char 偷偷来看你、路人来翻你老底，这里都会记着</div>`);
  }
  function openVisits() {
    openListPage("visits", "我的访问记录", () => {
      const list = S.me.visits || [];
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
      const favs = (S.me.favs || []).map(f => S.posts.find(p => p.id === f.id)).filter(Boolean);
      const liked = S.posts.filter(p => p[LK()] && !isMe(p)).sort((x, y) => new Date(y[LKAT()] || y.createdAt) - new Date(x[LKAT()] || x.createdAt));
      const list = tab === "fav" ? favs : liked;
      b.innerHTML = `<div class="profile-tabs"><button class="${tab === "fav" ? "on" : ""}" data-act="profile-tab" data-tab="fav">收藏 ${favs.length}</button><button class="${tab === "liked" ? "on" : ""}" data-act="profile-tab" data-tab="liked">赞过 ${liked.length}</button></div>`
        + (list.length ? list.map(p => cardHtml(p, { noFollow: true })).join("") : `<div class="empty">${tab === "fav" ? "还没有收藏，微博右上角「…」里可以收藏" : "还没有赞过微博"}</div>`);
      hydrateImages(b);
    }, { title: "赞/收藏" });
    page.setTab = t => { tab = t; page.render(page); };
  }
  function openHistory() {
    openListPage("history", "浏览记录", () => {
      const list = (S.me.history || []).map(h => S.posts.find(p => p.id === h.id)).filter(Boolean);
      return list.length ? list.map(p => cardHtml(p, { noFollow: true })).join("") + `<div class="form-note"><button class="link" data-act="clear-history">清空浏览记录</button></div>` : `<div class="empty">还没有浏览记录</div>`;
    });
  }
  function openDrafts() {
    openListPage("drafts", "草稿箱", () => {
      const list = S.me.drafts || [];
      return list.length ? `<div class="form-note">发微博写到一半退出时可以存成草稿（只存文字）</div>` + list.map(d => `<div class="list-cell draft" data-act="open-draft" data-id="${esc(d.id)}"><div class="cell-main"><div class="draft-text">${esc(d.text)}</div><div class="cell-sub">${fmtTime(d.at)}</div></div>
          <button class="btn-ghost" data-act="del-draft" data-id="${esc(d.id)}">删除</button></div>`).join("") : `<div class="empty">草稿箱是空的</div>`;
    });
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
    return S.posts.filter(p => p.authorType !== "user" && p.origin !== "profile" && p.origin !== "super" && p.visibility !== "self")
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
      && (p.visibility !== "self" || isMe(p)));
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
      .map(p => `- ${authorOf(p).name}${p.authorType === "user" && acctOf(p) === "main" ? "（用户本人）" : ""}：${p.text.slice(0, 60)}`).join("\n");
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
      const posts = fixAltAuthors(parseBlocks(text, "微博").filter(b => !isUserName(b["作者"])).map(b => postFromBlock(b, { origin: "topic", topic: title })), {})
        .filter(p => p.text || p.images.length || p.repost);
      if (!S.topics.map[title] && (tb || posts.length)) {
        const reads = parseNum(tb && tb["阅读"]) || (h ? h.heat * rand(8, 30) : rand(2, 400) * 1e4);
        S.topics.map[title] = { lead: tb ? tb["导语"].trim() : "", host: tb && !none(tb["主持人"]) ? tb["主持人"].replace(/^@/, "").trim() : "",
          reads, discussions: parseNum(tb && tb["讨论"]) || Math.round(reads / rand(60, 300)), at: nowIso() };
        saveTopics();
      }
      thinPics(posts); for (const p of posts) {
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
    return S.posts.filter(p => (p.visibility !== "self" || isMe(p))
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
      const posts = fixAltAuthors(parseBlocks(text, "微博").filter(b => !isUserName(b["作者"])).map(b => postFromBlock(b, { origin: "search", searchQuery: q })), {})
        .filter(p => p.text || p.images.length || p.repost);
      thinPics(posts); for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; rememberOwnPost(p); }
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
  const userName = () => (S.identity.name || S.meta.nickname) + (isAlt() ? `（用小号「${S.alt.nickname}」）` : "");
  function getThread(peer) {
    const key = threadKey(peer);
    let t = S.threads.find(x => x.key === key);
    if (!t) { t = { id: `dm_${S.identity.id}_${isAlt() ? "alt_" : ""}${key}`, scope: S.identity.id, ...acctTag(), key, peer, about: "", messages: [], unread: 0, updatedAt: nowIso() }; S.threads.push(t); }
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
    // 生成期间切了账号：这批私信作废（发给的是另一个号）
    if ((ctx.acct || curAcct()) !== curAcct()) return;
    const groups = new Map();
    for (const b of blocks) {
      if (isUserName(b["来自"]) || isUserName(b["角色"])) continue;
      const ch = charByName(b["角色"]) || charByName(b["来自"], true);
      if (ch && isAlt() && !knowsAlt(ch.id)) continue; // 不知道小号的人不会私信小号
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
    const nick = S.me.nickname; const out = [];
    const mine = S.posts.filter(isMe);
    if (type === "comment") {
      for (const p of S.posts) for (const c of p.comments || []) {
        if (c.authorType === "user") continue;
        const parent = c.parentId ? p.comments.find(x => x.id === c.parentId) : null;
        const toMe = c.replyToName ? c.replyToName === nick : parent && isMe(parent);
        if (toMe) out.push({ at: c.createdAt, who: authorOf(c), action: "回复了你的评论", text: c.text, post: p });
        else if (isMe(p) && !c.parentId) out.push({ at: c.createdAt, who: authorOf(c), action: "评论了你的微博", text: c.text, post: p });
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
        const n = p.counts.likes - (p.liked ? 1 : 0) - (p.likedAlt ? 1 : 0); if (n <= 0) continue;
        const names = (p.likedBy || []).map(charNickname);
        // 没有角色点赞时，从这条博的路人评论 / 路人点赞里挑一个名字放前面（小号也混在这里）
        const npcPool = [...(p.npcLikers || []), ...(p.comments || []).filter(c => c.authorType === "npc").slice(0, 2).map(c => c.authorName)];
        const npcName = names.length || !npcPool.length ? "" : npcPool[hashNum(p.id) % npcPool.length];
        const who = (p.likedBy || []).length ? authorOf({ authorType: "char", charId: p.likedBy[0] }) : npcName ? authorOf({ authorType: "npc", authorName: npcName }) : { type: "npc", name: "路人", seed: p.id };
        out.push({ at: p.likeAt || p.createdAt, who, title: likeTitle(npcName ? [npcName] : names, n), action: "赞了你的微博", text: "", post: p });
      }
      for (const p of S.posts) for (const c of p.comments || []) {
        if (!isMe(c)) continue;
        const n = c.likes - (c.liked ? 1 : 0) - (c.likedAlt ? 1 : 0); if (n <= 0) continue;
        const names = (c.likedBy || []).map(charNickname);
        const who = (c.likedBy || []).length ? authorOf({ authorType: "char", charId: c.likedBy[0] }) : { type: "npc", name: "路人", seed: c.id };
        out.push({ at: c.likeAt || c.createdAt, who, title: likeTitle(names, n), action: "赞了你的评论", text: c.text, post: p });
      }
    }
    if (type === "follow") {
      for (const f of S.me.fans || []) out.push({ at: f.at, who: authorOf({ authorType: "npc", authorName: f.name }), action: "关注了你", text: "", post: null });
    }
    return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 200);
  }
  const unreadNotes = type => { const seen = new Date((S.me.seen || {})[type] || 0); return noteItems(type).filter(x => new Date(x.at) > seen).length; };
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
        const go = x.post && type === "like" && x.action === "赞了你的微博" ? `data-act="open-likers" data-post="${esc(x.post.id)}"` : x.post ? `data-act="open-detail" data-post="${esc(x.post.id)}"` : x.who.type === "npc" ? `data-act="open-npc" data-name="${esc(x.who.name)}"` : "";
        const quote = x.post ? `<div class="note-quote">${isMe(x.post) ? "我的微博：" : `@${esc(authorOf(x.post).name)}：`}${esc((x.post.text || "（图片）").slice(0, 60))}</div>` : "";
        return `<div class="note-item" ${go}><div ${x.who.type === "char" || (x.who.type === "npc" && x.who.name !== "路人") ? profileAttrs(x.who) : ""}>${avatarHtml(x.who)}</div><div class="cell-main">
          <div class="dm-top"><b>${esc(x.title || x.who.name)}</b><span>${fmtTime(x.at)}</span></div><div class="note-action">${esc(x.action)}</div>
          ${x.text ? `<div class="note-text">${richText(x.text)}</div>` : ""}${quote}</div></div>`;
      }).join("") : `<div class="empty">还没有${def.label === "关注" ? "新粉丝" : def.label}通知</div>`;
      hydrateImages(pg.el);
    }, { title: def.label });
    S.me.seen = { ...(S.me.seen || {}), [type]: nowIso() }; saveMeta(); renderTabbar(); if (S.tab === "msg") renderMsg();
  }

  /** 赞过这条微博的人：角色、有名字的路人（小号也混在里面），其余只给人数 */
  function openLikers(post) {
    openListPage(`likers:${post.id}`, "赞", () => {
      const chars = (post.likedBy || []).map(id => authorOf({ authorType: "char", charId: id }));
      const npcs = (post.npcLikers || []).map(n => authorOf({ authorType: "npc", authorName: n }));
      const total = post.counts.likes - (post.liked ? 1 : 0) - (post.likedAlt ? 1 : 0);
      // 陪跑：再列几个见过的真路人（评论区、粉丝、关注的人、别的微博），小号混在里面不显眼；每条微博挑的人固定
      const taken = new Set([...(post.npcLikers || []), ...S.chars.map(c => c.name), ...S.chars.map(c => charNickname(c.id)), S.meta.nickname, S.alt && S.alt.nickname].filter(Boolean));
      const pool = [...new Set([...(post.comments || []).filter(c => c.authorType === "npc" && !c.altOf).map(c => c.authorName),
        ...(S.meta.fans || []).map(f => f.name), ...(S.meta.followNpc || []),
        ...S.posts.filter(p => p.authorType === "npc" && !p.altOf).map(p => p.authorName)])].filter(n => n && !taken.has(n) && !altOwner(n));
      const want = Math.max(0, Math.min(total - chars.length, 4 + hashNum(post.id) % 3) - npcs.length);
      const decoys = pool.sort((a, b) => hashNum(post.id + a) - hashNum(post.id + b)).slice(0, want).map(n => authorOf({ authorType: "npc", authorName: n }));
      const people = [...chars, ...[...npcs, ...decoys].sort((a, b) => hashNum(post.id + a.name) - hashNum(post.id + b.name))];
      const rest = Math.max(0, total - people.length);
      return `<div class="note-quote" style="margin:10px 16px">${esc((post.text || "（图片）").slice(0, 60))}</div>`
        + people.map(a => personRow(a, { sub: "赞了这条微博" })).join("")
        + (rest ? `<div class="load-more">还有 ${fmtNum(rest)} 位路人赞过</div>` : "")
        + (total > 0 ? "" : `<div class="empty">还没有人赞</div>`);
    });
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
      const a = peerAuthor(th); const me = authorOf({ authorType: "user", ...acctTag() });
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
    // 点了「戳穿他」又没发：当没发生
    page.opts.onClose = () => { const th = S.threads.find(x => x.key === key); if (th && th.outing) { th.outing = false; saveThread(th); } };
    const input = $(".reply-input", page.el); const send = $(".reply-send", page.el);
    input.addEventListener("input", () => { send.disabled = !input.value.trim(); input.style.height = "auto"; input.style.height = Math.min(100, input.scrollHeight) + "px"; if (dmTimers.has(key)) scheduleDmReply(key); });
    send.addEventListener("click", () => {
      const th = S.threads.find(x => x.key === key); const text = input.value.trim(); if (!th || !text) return;
      const msg = { id: uid("m"), from: "me", text, at: nowIso() };
      th.messages.push(msg); th.updatedAt = msg.at;
      const o = th.peer.type === "npc" ? altOwner(th.peer.name) : null;
      if (o && th.outing && !isAlt() && !altOpen(o)) { revealAlt(o, "outed"); th.outedMsg = msg.id; toast("戳穿了！"); }
      else if (o && calt(o).state === "aware" && !isAlt()) { calt(o).strangerDm = true; saveCalts(); }
      th.outing = false; saveThread(th);
      input.value = ""; send.disabled = true; input.style.height = "";
      page.render(page); refreshMsgViews();
      scheduleDmReply(key);
    });
  }
  // 发完私信不马上回：停手几秒（还在打字就继续等）再回，可以连发好几条；点 ✨ 立刻回
  const dmTimers = new Map();
  const DM_WAIT = 7000;
  function scheduleDmReply(key, now) {
    clearTimeout(dmTimers.get(key)); dmTimers.delete(key);
    const fire = () => {
      dmTimers.delete(key);
      const th = S.threads.find(x => x.key === key); if (!th) return;
      const last = th.messages[th.messages.length - 1];
      if (last && last.from === "me") replyDm(th, last);
    };
    if (now) fire(); else dmTimers.set(key, setTimeout(fire, DM_WAIT));
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
    // 她连发的几条（上一条对方消息之后的全部）一起回
    let pendStart = th.messages.length;
    if (lastIsMine) while (pendStart > 0 && th.messages[pendStart - 1].from === "me") pendStart--;
    const pending = lastIsMine ? th.messages.slice(pendStart) : [];
    const pendText = pending.map(m => `「${m.text}」`).join("");
    const aOwner = th.peer.type === "npc" ? altOwner(th.peer.name) : null; // 私信的是 char 的小号
    const pc = th.peer.type === "char" ? th.peer.charId : aOwner;
    const history = (lastIsMine ? th.messages.slice(Math.max(0, pendStart - 20), pendStart) : th.messages.slice(-20)).map(m => `${m.from === "me" ? (acctOf(th) === "alt" && !(pc && knowsAlt(pc)) ? S.alt.nickname : "用户") : (pc ? "你" : th.peer.name)}：${m.text}`).join("\n");
    const altDm = acctOf(th) === "alt"; const knows = !altDm || (!!pc && knowsAlt(pc));
    const recentMine = S.posts.filter(p => p.authorType === "user" && acctOf(p) === acctOf(th) && p.visibility !== "self").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 2)
      .map(p => `- ${fmtTime(p.createdAt)}：${(p.text || "（图片）").slice(0, 60)}`).join("\n");
    th._typing = true; refreshMsgViews();
    let text = null;
    if (pc) {
      const ch = charById(pc);
      if (!ch) { th._typing = false; refreshMsgViews(); return; }
      const a = aOwner ? calt(aOwner) : null;
      const outedNow = a && lastIsMine && pending.some(m => m.id === th.outedMsg);
      const instruction = [
        `当前时间：${nowText()}`,
        a ? [
          `这是微博私信。你在用自己的微博小号「${a.nick}」（不认证、粉丝很少）收发私信，不是大号。`,
          !knows ? `给你小号发私信的是陌生网友「${S.alt.nickname}」：你不知道这是谁，就当陌生人回（按你的性格，可以冷淡、礼貌或不太想理），绝对不要把对方当成用户。`
            : outedNow ? `用户刚刚戳穿了你：她已经知道「${a.nick}」就是你的小号。你心里清楚瞒不住了：可以先嘴硬一两句、装傻、害羞，按你的性格来，但最后会承认。`
            : altOpen(aOwner) ? "用户知道这是你的小号，你们都心知肚明。"
            : `给你小号发私信的是用户（她的大号「${S.meta.nickname}」）。你没告诉过她这个小号是你，你以为她不知道：她可能只是随手私信一个网友，也可能在试探你。按你的性格来：可以装作陌生网友、心虚、旁敲侧击她是不是知道了；不要主动承认，不自称是谁，不提你的真名和大号，不用只有你们俩才用的称呼，但说话习惯可能会露出马脚。`,
        ].join("") : altDm ? (knows ? `这是微博私信。你的微博昵称：${charNickname(ch.id)}；用户在用她的小号「${S.alt.nickname}」私信你（你知道这是用户的小号）。` : `这是微博私信。你的微博昵称：${charNickname(ch.id)}。给你发私信的是陌生网友「${S.alt.nickname}」：你不知道这是谁，就当陌生人回（按你的性格，可以冷淡、礼貌或不太想理），绝对不要把对方当成用户。`)
          : `这是微博私信。你的微博昵称：${charNickname(ch.id)}；用户的微博昵称：${S.meta.nickname}。`,
        recentMine ? `${knows ? "用户" : "这个网友"}最近在微博上发的：\n${recentMine}` : "",
        history ? `你们最近的私信记录：\n${history}` : "这是你们在微博私信里的第一句话。",
        lastIsMine ? `${knows ? "用户" : "对方"}刚刚${pending.length > 1 ? "连着" : ""}发来：${pendText}` : "对方还没有新消息：你接着刚才的话往下说，或者主动找个话题（按你此刻的状态和心情），不要重复你说过的话。",
        a ? `「来自」写「${a.nick}」，「角色」写 无。` : `「来自」写 ${ch.name}，「角色」写 ${ch.name}。`,
      ].filter(Boolean).join("\n\n");
      text = await generate({ characterId: ch.id, appTags: ["nox_weibo", "dm"], instruction }, `${a && !altSeen(aOwner) ? "路人" : ch.name}私信`);
    } else {
      const prompt = [
        `你是微博用户「${th.peer.name}」。${th.about ? `你和用户的交集：${th.about}` : "你是用户的一个陌生网友。"}`,
        isFollowingNpc(th.peer.name) || isFanNpc(th.peer.name) ? `关于你：${npcCard(th.peer.name)}` : "",
        !altDm && isFollowingNpc(th.peer.name) && !isFanNpc(th.peer.name) ? "用户关注了你，你还没有回关。按你的人设决定要不要回关：如果这次聊天里你决定回关（被说动了、聊得投缘），在私信后面多写：\n===互动===\n回关：是\n===结束===\n不回关就不写。" : "",
        `用户的微博昵称：${S.me.nickname}，性别：${S.identity.gender || "未知（用 ta 称呼）"}`,
        history ? `你们的私信记录：\n${history}` : "",
        lastIsMine ? `用户刚刚${pending.length > 1 ? "连着" : ""}私信你：${pendText}` : "用户还没有回你：你接着刚才的话往下说，不要重复说过的话。",
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
    if (!lines.length) lines = normalizeOutput(text).replace(/===[^=\n]+===/g, "").split(/\n+/).map(x => x.replace(/^(来自|角色|内容|回关|取关)\s*[：:].*$/, "").trim()).filter(Boolean).slice(0, 4);
    if (!lines.length) { refreshMsgViews(); parseFailed("私信"); return; }
    noteParsed(`${lines.length} 条私信`);
    if (!pc) {
      logNpc(th.peer.name, `私信里用户说${pendText.slice(0, 30) || "（没说话）"}，TA 回「${lines.join(" / ").slice(0, 40)}」`);
      const fb = parseBlocks(text, "互动")[0];
      if (fb && yes(fb["回关"]) && !altDm && isFollowingNpc(th.peer.name) && !isFanNpc(th.peer.name)) { addFanNpc(th.peer.name); logNpc(th.peer.name, "私信聊完回关了用户"); }
    }
    fresh._typing = true; refreshMsgViews();
    const replies = lines.slice(0, 5).map(text => ({ id: uid("m"), from: "peer", text, at: null }));
    if (pc && knows && (!aOwner || altOpen(aOwner))) {
      const mine = lastIsMine ? fresh.messages.find(m => m.id === msg.id) : null;
      remember(pc, lastIsMine ? `${userName()}在微博私信我${aOwner ? `的小号「${th.peer.name}」` : ""}：${pendText.slice(0, 120)}，我回：「${lines.join(" / ").slice(0, 100)}」` : `我在微博私信跟${userName()}说：「${lines.join(" / ").slice(0, 100)}」`,
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

  // ───────────────────────── 超话 ─────────────────────────
  const SUPER_LV = [0, 5, 15, 30, 50, 80, 120, 170, 230, 300, 380, 470, 570, 680, 800, 930, 1070, 1220];
  const superLevel = exp => SUPER_LV.reduce((lv, t, i) => (exp >= t ? i + 1 : lv), 1);
  const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const normSuper = t => String(t || "").replace(/超话$/, "").replace(/^[#\s]+|[#\s]+$/g, "").slice(0, 30);
  const getSuper = name => S.supers.map[name];
  function saveSupers() { dbUpsert(COL.meta, S.supers).catch(e => console.warn(e)); }
  const KIND = { 兴趣: "interest", 个人: "person", CP: "cp", 学校: "school" };
  const KIND_LABEL = { interest: "兴趣", person: "个人", cp: "CP", school: "学校" };
  /** 存超话信息：保留用户自己的加入、经验、签到 */
  function upsertSuper(b, extra = {}) {
    const name = normSuper(b["名称"]); if (!name) return null;
    const old = S.supers.map[name] || {};
    const kindRaw = Object.keys(KIND).find(k => String(b["分类"] || "").toUpperCase().includes(k)) || "兴趣";
    S.supers.map[name] = {
      ...old, name, intro: (b["简介"] || old.intro || "").trim(), kind: KIND[kindRaw] || old.kind || "interest",
      host: none(b["主持人"]) ? (old.host || "") : b["主持人"].replace(/^@/, "").trim(),
      postCount: parseNum(b["帖子数"]) || old.postCount || rand(200, 20000), fans: parseNum(b["粉丝数"]) || old.fans || rand(500, 50000),
      rel: none(b["相关"]) ? (old.rel || "") : b["相关"].trim(), ...extra,
    };
    return S.supers.map[name];
  }
  /** 逛这个超话的角色：他的「常逛 / 关于他的」里有，或者超话信息里标了相关 */
  function superChars(name) {
    const cs = S.supers.charSupers || {}; const info = getSuper(name) || {};
    const rel = String(info.rel || "").split(/[、,，\s]+/);
    return activeChars().filter(c => (cs[c.id] && ((cs[c.id].haunts || []).includes(name) || (cs[c.id].about || []).includes(name))) || rel.includes(c.name));
  }
  function addExp(name, n) { const s = getSuper(name); if (!s) return; su(s).exp = (su(s).exp || 0) + n; saveSupers(); }
  const superPosts = name => S.posts.filter(p => p.superName === name && (p.visibility !== "self" || isMe(p)));
  function superIcon(s, size = 44, attrs = "") {
    return s.iconRef
      ? `<div class="super-icon" ${attrs} style="width:${size}px;height:${size}px;background:${gradientFor(s.name)}"><img data-ref="${esc(s.iconRef)}" alt=""></div>`
      : `<div class="super-icon" ${attrs} style="width:${size}px;height:${size}px;background:${gradientFor(s.name)}">${esc(s.name.slice(0, 1))}</div>`;
  }
  function superRowHtml(s) {
    const signed = su(s).lastSign === dayKey(new Date());
    const right = su(s).joined
      ? `<button class="follow-btn ${signed ? "on" : ""}" data-act="super-sign" data-name="${esc(s.name)}">${signed ? "已签到" : "签到"}</button>`
      : `<button class="follow-btn" data-act="super-join" data-name="${esc(s.name)}">+ 加入</button>`;
    return `<div class="list-cell super-row" data-act="open-super" data-name="${esc(s.name)}">${superIcon(s)}<div class="cell-main"><div>${esc(s.name)}超话 <span class="super-kind">${KIND_LABEL[s.kind] || "兴趣"}</span></div>
      <div class="cell-sub">${su(s).joined ? `LV${superLevel(su(s).exp || 0)} · ` : ""}帖子 ${fmtNum(s.postCount || 0)} · 粉丝 ${fmtNum(s.fans || 0)}</div></div>${right}</div>`;
  }

  function openSuperHome() {
    let q = "";
    const page = openPage("super-home", pg => {
      const body = $(".page-body", pg.el); const sc = body.scrollTop;
      const all = Object.values(S.supers.map);
      const mine = all.filter(s => su(s).joined);
      const rec = (S.supers.recommend || []).map(getSuper).filter(s => s && !su(s).joined);
      let results = "";
      if (q) {
        const hits = all.filter(s => s.name.includes(q) || q.includes(s.name));
        results = `<div class="find-sec">搜索「${esc(q)}」</div>${hits.map(superRowHtml).join("")}`
          + (hits.some(s => s.name === q) ? "" : `<button class="load-more search-more" data-act="super-create" data-name="${esc(q)}">✨ 生成「${esc(q)}」超话（会用一次 API）</button>`);
      }
      body.innerHTML = `<div class="super-search"><form class="search-form super-form" action="#"><input class="search-input" type="search" maxlength="30" placeholder="搜超话，比如 动漫、平南一高" enterkeyhint="search" value="${esc(q)}"></form></div>
        ${results}
        <div class="find-sec">我关注的超话</div>${mine.length ? mine.map(superRowHtml).join("") : `<div class="list-cell"><div class="cell-sub">还没有加入超话，搜一个或者看看推荐吧</div></div>`}
        <div class="find-sec super-rec-head">推荐超话<button class="hot-refresh" data-act="super-rec" ${pg.busy ? "disabled" : ""}>${I.refresh}${pg.busy ? "生成中" : rec.length ? "换一批" : "看看推荐"}</button></div>
        ${pg.busy ? `<div class="gen-tip"><span class="spinner"></span>正在找你可能喜欢的超话…</div>` : ""}
        ${rec.map(superRowHtml).join("") || (pg.busy ? "" : `<div class="list-cell"><div class="cell-sub">点「看看推荐」，按你们的世界和兴趣推荐 6 个超话（会用一次 API）</div></div>`)}`;
      body.scrollTop = sc; hydrateImages(body);
      const form = $(".super-form", body);
      form.addEventListener("submit", e => { e.preventDefault(); q = normSuper($(".search-input", form).value); page.render(page); });
    }, { title: "超话社区" });
    page.superHome = true;
  }

  async function genRecommend(page) {
    if (page.busy) return;
    if (!activeChars().length) { toast("没有参与微博的角色：先去微信加个好友，或在设置里打开角色"); return; }
    page.busy = true; page.render(page);
    const known = Object.keys(S.supers.map);
    const cast = pickCast(activeChars(), 4);
    const instruction = [
      `当前时间：${nowText()}`,
      "这次只输出超话信息，不要输出帖子：推荐 6 个用户可能会喜欢的超话。",
      "按世界书里的世界（学校、城市、娱乐圈、流行的东西）、角色们的人设和爱好、用户的设定和你们最近聊过的东西来推荐，题材要多样（学校、追星、动漫游戏、运动、生活兴趣都可以），不要全和角色有关。",
      known.length ? `已经有的超话（不要重复）：${known.slice(0, 40).join("、")}` : "",
      `角色微博昵称：\n${charsForPrompt(cast)}`,
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "super"], instruction }, "推荐超话");
    page.busy = false;
    if (text != null) {
      const got = parseBlocks(text, "超话").map(b => upsertSuper(b)).filter(Boolean)
        .filter(s => s.kind !== "person" || superChars(s.name).every(c => isPublic(c.id)));
      if (got.length) { S.supers.recommend = got.slice(0, 8).map(s => s.name); saveSupers(); noteParsed(`${got.length} 个超话`); } else parseFailed("推荐超话");
    }
    page.render(page);
  }

  function openSuper(name) {
    name = normSuper(name); if (!name) return;
    if (topPage() && topPage().key === `super:${name}`) return;
    if (!getSuper(name)) { S.supers.map[name] = { name, intro: "", kind: "interest", postCount: 0, fans: 0 }; saveSupers(); }
    let tab = "new";
    const page = openPage(`super:${name}`, pg => {
      const s = getSuper(name); const body = $(".page-body", pg.el); const sc = body.scrollTop;
      if (!s) { body.innerHTML = `<div class="empty">超话不存在</div>`; return; }
      const posts = superPosts(name);
      const list = tab === "hot" ? posts.slice().sort((a, b) => heatOf(b) - heatOf(a)) : posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const signed = su(s).lastSign === dayKey(new Date()); const lv = superLevel(su(s).exp || 0);
      // 今日签到人数：按粉丝数和日期定一个稳定的数，自己签了再 +1
      const signers = Math.max(1, Math.round((s.fans || 100) / (40 + (hashNum(name + dayKey(new Date())) % 60)))) + (signed ? 1 : 0);
      body.innerHTML = `<div class="super-top" ${s.coverRef ? `data-bg-ref="${esc(s.coverRef)}"` : ""} style="background:${gradientFor(name + "super")}">
        <div class="super-shade"></div>
        <button class="cover-btn super-cover-btn" data-act="super-cover" data-name="${esc(name)}">${I.camera}换背景</button>
        <div class="super-top-inner">
          ${superIcon(s, 76, `data-act="super-icon" data-name="${esc(name)}" title="点击更换头像"`)}
          <div class="cell-main">
            <div class="super-title">${esc(name)}<span class="super-badge">超话</span></div>
            <div class="super-stats"><b>${fmtNum(s.postCount || posts.length)}</b> 帖子<i>|</i><b>${fmtNum(s.fans || 0)}</b> 粉丝</div>
            <div class="super-chips"><span>${KIND_LABEL[s.kind] || "兴趣"}超话</span><span>今日签到 ${fmtNum(signers)} 人</span></div>
          </div>
          <button class="super-sign ${signed ? "done" : ""}" data-act="${su(s).joined ? "super-sign" : "super-join"}" data-name="${esc(name)}">
            <span>${signed ? "✓" : su(s).joined ? "签" : "+"}</span><em>${signed ? "已签到" : su(s).joined ? "签到" : "加入"}</em></button>
        </div>
      </div>
      <div class="super-info">
        ${s.host ? `<div class="super-host">主持人：<span class="link">${esc(s.host)}</span></div>` : ""}
        ${s.intro ? `<div class="super-intro">简介：${richText(s.intro)}</div>` : ""}
        ${su(s).joined ? `<div class="super-mine"><span class="super-lv">LV${lv}</span><span>经验 ${su(s).exp || 0}${lv < SUPER_LV.length ? ` / ${SUPER_LV[lv]}` : ""}</span>${su(s).streak ? `<span>已连续签到 ${su(s).streak} 天</span>` : ""}<button class="link" data-act="super-join" data-name="${esc(name)}">退出超话</button></div>` : ""}
      </div>
        <div class="profile-tabs"><button class="${tab === "new" ? "on" : ""}" data-act="profile-tab" data-tab="new">最新</button><button class="${tab === "hot" ? "on" : ""}" data-act="profile-tab" data-tab="hot">精华</button></div>
        ${list.map(p => cardHtml(p, { noFollow: true })).join("")}
        ${pg.busy ? `<div class="gen-tip"><span class="spinner"></span>${s.generated ? "正在加载更多帖子…" : "正在进入超话…"}</div>`
          : `<button class="load-more" data-act="super-more">${s.generated ? "加载更多帖子" : "进入超话（会用一次 API）"}</button>`}`;
      body.scrollTop = sc; hydrateImages(body);
    }, { title: `${name}超话`, footer: `<div class="topic-join"><button class="btn-primary" data-act="super-post" data-name="${esc(name)}">${I.edit.replace("<svg", '<svg width="16" height="16"')}发帖</button></div>` });
    page.superName = name;
    page.setTab = t => { tab = t; page.render(page); };
    if (!getSuper(name).generated) genSuperPosts(page, false);
  }

  async function genSuperPosts(page, more) {
    const name = page.superName; const s = getSuper(name);
    if (!s || page.busy) return;
    if (!activeChars().length) { toast("没有参与微博的角色：先去微信加个好友，或在设置里打开角色"); return; }
    page.busy = true; page.render(page);
    const lurkers = superChars(name);
    const cast = lurkers.length ? lurkers.slice(0, 3) : pickCast(activeChars(), 1);
    const existing = superPosts(name).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8)
      .map(p => `- ${authorOf(p).name}${p.authorType === "user" && acctOf(p) === "main" ? "（用户本人）" : ""}：${p.text.slice(0, 50)}`).join("\n");
    const instruction = [
      `当前时间：${nowText()}`,
      `超话：「${name}」${s.intro ? `\n简介：${s.intro}` : ""}${s.kind ? `\n分类：${KIND_LABEL[s.kind]}` : ""}`,
      s.intro ? "" : `这个超话还没有资料：先输出一个 ===超话===（名称写「${name}」），再输出帖子。`,
      lurkers.length ? `也逛这个超话的角色：${lurkers.map(c => c.name).join("、")}（可以在帖子里出现 0～1 条他们发的，按人设来）` : "没有角色逛这个超话：帖子全是超话里的路人，不要出现任何角色。",
      lurkers.some(c => !calt(c.id)) ? `角色微博昵称（已注册的必须沿用）：\n${charsForPrompt(lurkers.filter(c => !calt(c.id)))}` : "",
      caltLine(lurkers, { super: true }),
      existing ? `超话里已经有的帖子（不要重复，接着往下聊）：\n${existing}` : "",
      `生成 ${more ? rand(5, 7) : rand(7, 9)} 条帖子，时间分散，从刚刚到几天前都有。`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterIds: cast.map(c => c.id), appTags: ["nox_weibo", "super"], instruction }, "加载超话");
    page.busy = false;
    if (text != null) {
      const info = parseBlocks(text, "超话")[0];
      if (info && !s.intro) upsertSuper({ ...info, 名称: name });
      const lurkIds = new Set(lurkers.map(c => c.id));
      const posts = fixAltAuthors(parseBlocks(text, "微博").filter(b => !isUserName(b["作者"])).map(b => postFromBlock(b, { origin: "super", superName: name })), { super: true })
        .filter(p => (p.text || p.images.length) && (p.authorType !== "char" || lurkIds.has(p.charId)) && (!p.altOf || lurkIds.has(p.altOf)));
      thinPics(posts); for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; rememberOwnPost(p); }
      getSuper(name).generated = true; saveSupers();
      if (posts.length || info) noteParsed(`${info ? "超话资料 + " : ""}${posts.length} 条帖子`); else parseFailed("加载超话");
      pruneIfNeeded();
    }
    page.render(page);
  }

  // ── char 主页里的「TA 的超话」 ──
  function openCharSupers(charId) {
    const ch = charById(charId); if (!ch) return;
    const page = openPage(`char-supers:${charId}`, pg => {
      const info = (S.supers.charSupers || {})[charId];
      const body = $(".page-body", pg.el);
      if (!info) { body.innerHTML = pg.busy ? `<div class="gen-tip"><span class="spinner"></span>正在看看TA在逛哪些超话…</div>` : `<div class="empty">还没看过TA的超话<div><button class="btn-primary" data-act="char-supers-gen" data-char="${esc(charId)}">看看（会用一次 API）</button></div></div>`; return; }
      const rows = names => names.map(getSuper).filter(Boolean).map(sp => superRowHtml(sp).replace(/<\/div>$/, `<button class="btn-ghost csup-rm" data-act="char-super-rm" data-char="${esc(charId)}" data-name="${esc(sp.name)}">移除</button></div>`)).join("");
      const ta = charById(charId)?.name || "TA";
      body.innerHTML = `<div class="find-sec">关于TA的</div>${rows(info.about || []) || `<div class="list-cell"><div class="cell-sub">${isPublic(charId) ? "暂时没有" : "TA不是公众人物，没有个人超话；你们的 CP 超话可以去超话社区搜"}</div></div>`}
        <div class="find-sec">TA常逛的</div>${rows(info.haunts || []) || `<div class="list-cell"><div class="cell-sub">TA好像不怎么逛超话</div></div>`}
        <button class="load-more search-more" data-act="char-super-add" data-char="${esc(charId)}">＋ 让${esc(ta)}关注一个超话</button>
        ${pg.busy ? `<div class="gen-tip"><span class="spinner"></span>重新生成中…</div>` : `<button class="load-more" data-act="char-supers-gen" data-char="${esc(charId)}">重新生成（会用一次 API）</button>`}`;
      hydrateImages(body);
    }, { title: `${charNickname(charId)}的超话` });
    page.charId = charId;
    if (!(S.supers.charSupers || {})[charId]) genCharSupers(page);
  }
  async function genCharSupers(page) {
    const charId = page.charId; const ch = charById(charId); if (!ch || page.busy) return;
    page.busy = true; page.render(page);
    const both = isPublic(charId) && isPublic("user"); const one = isPublic(charId) !== isPublic("user");
    const old = (S.supers.charSupers || {})[charId];
    const instruction = [
      `当前时间：${nowText()}`,
      "这次只输出超话信息，不要输出帖子：列出和你有关的超话、以及你自己常逛的超话。",
      isPublic(charId) ? "你是公众人物：有你的个人超话（分类写 个人）。" : "你不是公众人物：*没有*个人超话。",
      both ? `你和用户都是公众人物：你们有 CP 超话（分类写 CP，名称用粉丝会起的 CP 名）。`
        : one ? (loveOf(charId).state === "open" ? "你们的恋情已经公开，有你们的 CP 超话（分类写 CP，名称用粉丝会起的 CP 名）。"
          : loveOf(charId).state === "secret" ? "你们是地下恋，没公开：只有剧情里有过曝光和风吹草动、被粉丝扒到蛛丝马迹，才会有你们的 CP 超话（分类写 CP）；否则不要输出 CP 超话。"
          : "你们只有一方是公众人物：只有剧情里有过曝光和风吹草动，才会有你们的 CP 超话（分类写 CP）；否则不要输出 CP 超话。")
        : "你们都是普通人：只有剧情里你们已经被同学嗑出名了（比如上过学校表白墙），才可能有同学建的 CP 超话（分类写 CP）；否则不要输出 CP 超话。",
      "你常逛的超话 2～4 个（分类写 兴趣 或 学校），按你的人设、爱好、学校来，「相关」写你的本名。",
      old && (old.haunts || []).length ? `这是重新生成：你之前常逛的是 ${old.haunts.map(n => `「${n}」`).join("")}，这次整个换一批，常逛的超话*不要*再出现这些。关于你的个人/CP 超话照实写。` : "",
      `你的微博昵称：${charNickname(charId)}`,
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterId: charId, appTags: ["nox_weibo", "super"], instruction }, `${ch.name}的超话`);
    page.busy = false;
    if (text != null) {
      const about = [], haunts = [];
      const blocks = parseBlocks(text, "超话");
      if (blocks.length && old) for (const n of [...(old.about || []), ...(old.haunts || [])]) {
        const sp = getSuper(n); if (sp) sp.rel = String(sp.rel || "").split(/[、,，\s]+/).filter(x => x && x !== ch.name).join("、");
      }
      for (const b of blocks) {
        const s = upsertSuper(b); if (!s) continue;
        if (s.kind === "person") { if (!isPublic(charId)) { delete S.supers.map[s.name]; continue; } about.push(s.name); }
        else if (s.kind === "cp") about.push(s.name);
        else haunts.push(s.name);
        if (!String(s.rel || "").includes(ch.name)) s.rel = [s.rel, ch.name].filter(x => x && !none(x)).join("、");
      }
      if (about.length || haunts.length) S.supers.charSupers = { ...(S.supers.charSupers || {}), [charId]: { about, haunts, at: nowIso() } };
      saveSupers();
      if (about.length || haunts.length) noteParsed(`关于TA ${about.length} 个，常逛 ${haunts.length} 个`); else parseFailed(`${ch.name}的超话`);
    }
    page.render(page);
  }

  function superSign(name) {
    const s0 = getSuper(name); if (!s0) return; const s = su(s0);
    const today = dayKey(new Date());
    if (s.lastSign === today) { toast("今天已经签过啦"); return; }
    const y = new Date(); y.setDate(y.getDate() - 1);
    s.streak = s.lastSign === dayKey(y) ? (s.streak || 0) + 1 : 1;
    s.lastSign = today; s.joined = true; s.exp = (s.exp || 0) + 4; saveSupers();
    toast(`签到成功 经验+4 · 已连续签到 ${s.streak} 天`); refreshAll();
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
    for (const p of pages) if (!post || p.key === `detail:${post.id}` || p.key.startsWith("profile") || p.key.startsWith("topic:") || p.key === "search" || p.key === "me-home" || p.key.startsWith("super") || ["likefav", "history", "album", "following", "fans"].includes(p.key)) p.render(p);
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
        const a = authorOf(c);
        const sub = subs(c.id);
        return `<div class="cmt"><div ${profileAttrs(a)}>${avatarHtml(a)}</div><div class="cmt-main" data-act="reply-to" data-cmt="${esc(c.id)}">
          <div class="cmt-top"><span class="cmt-name ${a.vip ? "vip" : ""}">${esc(a.name)}${a.vip ? I.crown : ""}</span>
            ${c.isPostAuthor || (c.authorType === "user" && p.authorType === "user" && acctOf(c) === acctOf(p)) ? '<span class="tag author">博主</span>' : ""}
            ${authorLikes.has(c.id) ? '<span class="tag liked-by-author">博主赞过</span>' : ""}
            <button class="cmt-like ${c[LK()] ? "liked" : ""}" data-act="like-cmt" data-cmt="${esc(c.id)}">${c[LK()] ? I.liked : I.like}${c.likes ? fmtNum(c.likes) : ""}</button></div>
          <div class="cmt-text">${richText(c.text)}</div>
          <div class="cmt-meta"><span>${fmtTime(c.createdAt)}</span>${c.authorType === "user" ? `<button data-act="del-cmt" data-cmt="${esc(c.id)}">删除</button>` : ""}</div>
          ${sub.length ? `<div class="sub-box">${sub.slice(0, c._open ? 99 : 2).map(s => {
            const sa = authorOf(s);
            return `<div class="sub-line" data-act="reply-to" data-cmt="${esc(s.id)}"><span class="who">${esc(sa.name)}</span>${s.isPostAuthor || (s.authorType === "user" && p.authorType === "user" && acctOf(s) === acctOf(p)) ? ' <span class="tag author">博主</span>' : ""}${s.replyToName ? ` 回复 <span class="who">@${esc(s.replyToName)}</span>` : ""}：${richText(s.text)}</div>`;
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
          }).join("") : p._genComments || p._genReposts ? `<div class="empty"><span class="spinner"></span> 转发加载中…</div>`
          : repostWant(p) ? `<div class="empty">还没加载转发<div><button class="btn-primary" data-act="load-reposts" data-post="${esc(p.id)}">看看谁转发了（用 1 次 API）</button></div></div>`
          : `<div class="empty">${p.counts.reposts ? "转发列表暂时只显示你的微博的转发" : "还没有人转发"}</div>`)
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
      target.innerHTML = replyTarget ? `回复 @${esc(replyTarget.authorType === "user" ? profOf(replyTarget).nickname : replyTarget.authorName)}<button data-act="cancel-reply" style="color:var(--wb-link);font-size:12px">取消</button>` : "";
      target.classList.toggle("hidden", !replyTarget);
    }, {
      title: "微博正文",
      footer: `<div class="reply-target hidden"></div><div class="reply-bar"><textarea class="reply-input" rows="1" placeholder="写评论…" maxlength="500"></textarea><button class="tool" data-act="toggle-emoji" style="width:32px;height:32px">${I.emoji}</button><button class="reply-send" disabled>发送</button></div><div class="emoji-wrap hidden">${emojiPanelHtml()}</div>`,
    });
    page.tab = "comments";
    page.toggleSort = () => { sort = sort === "hot" ? "time" : "hot"; page.render(page); };
    page.setReply = c => { replyTarget = c; page.render(page); const i = $(".reply-input", page.el); i.placeholder = `回复 @${c.authorType === "user" ? profOf(c).nickname : c.authorName}`; i.focus(); };
    page.cancelReply = () => { replyTarget = null; $(".reply-input", page.el).placeholder = "写评论…"; page.render(page); };
    const input = $(".reply-input", page.el); const send = $(".reply-send", page.el);
    input.addEventListener("input", () => { send.disabled = !input.value.trim(); input.style.height = "auto"; input.style.height = Math.min(100, input.scrollHeight) + "px"; });
    send.addEventListener("click", () => {
      const p = S.posts.find(x => x.id === postId); const text = input.value.trim(); if (!p || !text) return;
      const c = { id: uid("c"), parentId: replyTarget ? (replyTarget.parentId || replyTarget.id) : null, replyToName: replyTarget && replyTarget.parentId ? (replyTarget.authorType === "user" ? profOf(replyTarget).nickname : replyTarget.authorName) : "",
        authorType: "user", ...acctTag(), authorName: S.me.nickname, text, likes: 0, liked: false, isPostAuthor: isMe(p), createdAt: nowIso() };
      p.comments.push(c); p.counts.comments++; savePost(p);
      if (p.superName && getSuper(p.superName) && su(getSuper(p.superName)).joined) addExp(p.superName, 2);
      const target = replyTarget; replyTarget = null; input.value = ""; send.disabled = true; input.placeholder = "写评论…"; input.style.height = "";
      page.render(page); toast("评论成功");
      const charTarget = (target && target.authorType === "char") || (!target && p.authorType === "char") || (target && target.authorType === "user" && p.authorType === "char");
      const altTarget = target ? target.altOf || (target.authorType === "user" && p.altOf) : p.altOf;
      if (altTarget && calt(altTarget)) replyFromChar(p, c, target, altTarget);
      else if (charTarget) replyFromChar(p, c, target);
      else if ((target && target.authorType === "npc") || (!target && p.authorType === "npc")) replyFromNpc(p, c, target);
    });
    ensureComments(post);
  }

  // ───────────────────────── 角色 / 路人主页 ─────────────────────────
  function openCharProfile(charId) {
    if (!charById(charId)) return;
    noteVisit({ type: "char", charId });
    backfillCharReposts(charId);
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
      }) + `<div class="list-cell char-super-link" data-act="open-char-supers" data-char="${esc(charId)}"><div class="cell-main">⭐ ${acc.gender === "女" ? "她" : acc.gender === "男" ? "他" : "TA"}的超话</div><span class="cell-sub">›</span></div>
        <div class="profile-tabs"><button class="${tab === "posts" ? "on" : ""}" data-act="profile-tab" data-tab="posts">微博</button>
          <button class="${tab === "album" ? "on" : ""}" data-act="profile-tab" data-tab="album">相册</button></div>${list}`;
      body.scrollTop = scroll; hydrateImages(body);
    }, { clearHead: true });
    page.setTab = t => { tab = t; page.render(page); };
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
      const info = npcInfo(name);
      const following = isFollowingNpc(name);
      const fakeFans = (hashHue(name) * 97) % 50000 + (vClass(a.verified) ? 200000 : 300);
      const busy = pg.busy ? `<div class="gen-tip"><span class="spinner"></span>${info ? "加载更早的微博…" : "正在生成TA的主页…"}</div>` : "";
      const more = !pg.busy && info ? `<button class="load-more" data-act="npc-gen">查看更早的微博</button>` : "";
      const list = tab === "posts" ? (posts.map(p => cardHtml(p, { noFollow: true })).join("") || (pg.busy ? "" : `<div class="empty">暂无微博</div>`)) + busy + more
        : (() => { const pics = posts.flatMap(p => (p.images || []).map((img, i) => picTile(img, p.id, i))); return pics.length ? `<div class="album">${pics.join("")}</div>` : `<div class="empty">还没有图片</div>`; })();
      const genBtn = info ? "" : `<button class="follow-btn gen-btn" style="height:32px;padding:0 12px;font-size:14px" data-act="npc-gen" ${pg.busy ? "disabled" : ""}>${pg.busy ? "生成中…" : "✨ 生成主页"}</button>`;
      const owner = altOwner(name); const seen = owner && altSeen(owner);
      const outBtn = seen && !altOpen(owner) ? `<button class="follow-btn out-btn" style="height:32px;padding:0 12px;font-size:14px" data-act="out-alt" data-char="${esc(owner)}">💥 戳穿他</button>` : "";
      const menuBtn = `<button class="follow-btn on" style="height:32px;width:32px;padding:0;font-size:14px" data-act="npc-menu" data-name="${esc(name)}" aria-label="更多">${I.more}</button>`;
      body.innerHTML = profileHeaderHtml(a, {
        realName: seen ? `${altOpen(owner) ? "💬" : "🤫"} ${charById(owner)?.name || ""}的小号${altOpen(owner) ? "" : "（只有你看得到）"}` : "",
        cover: npcCover(name), coverRef: seen ? calt(owner).coverRef : undefined,
        coverAction: seen ? `<button class="cover-btn" data-act="alt-cover" data-char="${esc(owner)}">${I.camera}换背景</button>` : "",
        bio: info ? info.bio : "", ip: info && info.ip, verifiedNote: info && info.verifiedNote,
        posts: info ? Math.max(posts.length, info.postCount || 0) : posts.length + (hashHue(name) % 900),
        following: info ? info.following : hashHue(name) % 300 + 20, followers: info ? info.followers : fakeFans,
        actions: `${genBtn}${outBtn}${menuBtn}<button class="follow-btn on" style="height:32px;padding:0 12px;font-size:14px" data-act="open-dm" data-name="${esc(name)}">私信</button><button class="follow-btn ${following ? "on" : ""}" style="height:32px;padding:0 16px;font-size:14px" data-act="toggle-follow-npc" data-name="${esc(name)}">${following ? "已关注" : "+ 关注"}</button>`,
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
    if (altOwner(name)) return genAltPosts(altOwner(name), page);
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
      thinPics(posts); for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; }
      if (S.npcs.map[name]) { S.npcs.map[name].postCount = Math.max(S.npcs.map[name].postCount || 0, mine.length + posts.length + rand(20, 400)); saveNpcs(); }
      if (posts.length || pb) noteParsed(`${pb ? "主页资料 + " : ""}${posts.length} 条历史微博`); else parseFailed("生成路人主页");
      pruneIfNeeded();
    }
    page.render(page);
  }

  // ───────────────────────── char 小号 ─────────────────────────
  /** 生成小号：1 次 API，资料 + 3～5 条旧博。how：hidden 藏起来让我找 / told 他主动告诉我的 */
  async function genCharAlt(charId, how) {
    const ch = charById(charId); if (!ch || calt(charId) || S[`_galt_${charId}`]) return;
    S[`_galt_${charId}`] = true; refreshAll(); toast(`正在给${ch.name}生成小号…`);
    const instruction = [
      `当前时间：${nowText()}`,
      `你的微博大号：「${charNickname(charId)}」${isPublic(charId) ? "（你是公众人物，大号有很多粉丝盯着）" : ""}。`,
      how === "told" ? `现在写出你偷偷注册的微博小号：先输出 ===主页===，再写 ${rand(3, 5)} 条小号以前发过的微博（时间从近到远，分布在过去几天到几个月）。`
        : "现在写出你偷偷注册的微博小号：这次只输出 ===主页===，不要写微博。",
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterId: charId, appTags: ["nox_weibo", "charalt"], instruction }, "生成小号", { secret: how !== "told" });
    S[`_galt_${charId}`] = false;
    if (text == null) { refreshAll(); return; }
    const pb = parseBlocks(text, "主页")[0];
    let nick = String((pb && pb["昵称"]) || "").replace(/^@/, "").trim().slice(0, 24);
    const taken = n => !n || isUserName(n) || S.chars.some(c => c.name === n || charNickname(c.id) === n) || altOwner(n) || S.posts.some(p => p.authorName === n);
    if (taken(nick)) nick = `${nick || "用户"}${rand(1000, 9999)}`;
    S.npcs.map[nick] = {
      bio: pb && !none(pb["简介"]) ? pb["简介"] : "", gender: /女/.test((pb && pb["性别"]) || "") ? "女" : /男/.test((pb && pb["性别"]) || "") ? "男" : (S.accounts[charId] || {}).gender || "",
      verified: "无", verifiedNote: "", vip: !!(pb && yes(pb["会员"])), ip: pb && !none(pb["IP属地"]) ? pb["IP属地"] : (S.accounts[charId] || {}).ip || "",
      followers: Math.min(clampInt(pb && pb["粉丝"], rand(3, 60)), 300), following: clampInt(pb && pb["关注"], rand(20, 150)), at: nowIso(), altOf: charId,
    };
    // 藏起来的：先不写博，等她点「✨ 生成主页」再写（和路人一样）
    if (how !== "told") S.npcs.map[nick].pending = true;
    const posts = how !== "told" ? [] : parseBlocks(text, "微博").map(b => postFromBlock(b, { origin: "profile" })).filter(p => p.text || p.images.length || p.repost)
      .map(p => Object.assign(p, { authorType: "npc", charId: undefined, authorName: nick, altOf: charId, verified: "无", vip: S.npcs.map[nick].vip }));
    spreadHistory(posts, Date.now() - rand(2, 30) * 3600e3);
    thinPics(posts); for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; }
    S.npcs.map[nick].postCount = posts.length + rand(5, 60); saveNpcs();
    S.calts.map[charId] = { nick, state: how === "told" ? "open" : "hidden", wait: rand(1, 3), appeared: false, strangerDm: false, createdAt: nowIso() };
    if (how === "told") revealAlt(charId, "told"); else saveCalts();
    noteParsed(how === "told" ? `小号「${nick}」+ ${posts.length} 条旧博` : "小号已生成（身份保密）");
    toast(how === "told" ? `${ch.name}告诉你他的小号是「${nick}」` : `${ch.name}的小号生成好了 🔒 去找找看吧`);
    refreshAll();
  }

  /** 小号主页「查看更早的微博」：按他本人的人设写，不当路人 */
  async function genAltPosts(charId, page) {
    const a = calt(charId); if (!a || page.busy) return;
    page.busy = true; page.render(page);
    const mine = S.posts.filter(p => p.altOf === charId && p.authorType === "npc").sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    const oldest = mine.length ? mine[mine.length - 1] : null;
    const instruction = [
      `当前时间：${nowText()}`,
      `你的微博小号「${a.nick}」已经有了（简介：${(S.npcs.map[a.nick] || {}).bio || "无"}），这次不要输出 ===主页===。`,
      mine.length ? `小号最近发过的（不要重复）：\n${mine.slice(0, 8).map(p => `- ${fmtTime(p.createdAt)}：${p.text.slice(0, 50)}`).join("\n")}` : "",
      (S.npcs.map[a.nick] || {}).pending ? `写 ${rand(4, 6)} 条小号以前发过的微博（时间从近到远，分布在过去几天到几个月${oldest ? `，都早于 ${fmtTime(oldest.createdAt)}` : ""}）。`
        : `写 ${rand(3, 5)} 条小号更早的微博${oldest ? `，时间都早于 ${fmtTime(oldest.createdAt)}` : ""}。`,
      reservedLine(),
    ].filter(Boolean).join("\n\n");
    const text = await generate({ characterId: charId, appTags: ["nox_weibo", "charalt"], instruction }, altSeen(charId) ? "加载小号微博" : "生成路人主页");
    page.busy = false;
    if (text != null) {
      const posts = parseBlocks(text, "微博").map(b => postFromBlock(b, { origin: "profile" })).filter(p => p.text || p.images.length || p.repost)
        .map(p => Object.assign(p, { authorType: "npc", charId: undefined, authorName: a.nick, altOf: charId, verified: "无" }));
      spreadHistory(posts, oldest ? new Date(oldest.createdAt).getTime() : Date.now());
      thinPics(posts); for (const p of posts) { S.posts.push(p); savePost(p); S.allPostRows++; }
      const info = S.npcs.map[a.nick];
      if (posts.length && info && info.pending) { delete info.pending; info.postCount = mine.length + posts.length + rand(5, 60); saveNpcs(); }
      if (posts.length) noteParsed(altSeen(charId) ? `${posts.length} 条小号旧博` : `${mine.length ? "" : "主页资料 + "}${posts.length} 条历史微博`); else parseFailed(altSeen(charId) ? "加载小号微博" : "生成路人主页");
    }
    page.render(page);
  }

  /** 掉马：told 他主动告诉的 / outed 被她戳穿。写一条总结进他的记忆，之后小号的事正常记 */
  function revealAlt(charId, how) {
    const a = calt(charId); const ch = charById(charId); if (!a || !ch) return;
    a.state = "open"; a.revealedAt = nowIso(); a.how = how; saveCalts();
    const who = S.identity.name || S.meta.nickname;
    const liked = S.posts.filter(p => (p.npcLikers || []).includes(a.nick)).length;
    const did = [a.appeared ? "关注了她" : "", liked ? `给她的微博点过 ${liked} 次赞` : "",
      S.posts.some(p => p.altOf === charId && p.superName) ? "在超话里发过帖" : ""].filter(Boolean).join("、");
    const text = how === "told" ? `我有个微博小号叫「${a.nick}」，我主动告诉了${who}。`
      : `${who}发现了我的微博小号「${a.nick}」，直接戳穿了我。${a.strangerDm ? "她其实早就知道了，之前还装作不知道、私信过我的小号，陪我演了半天。" : ""}${did ? `我之前用小号${did}。` : ""}`;
    remember(charId, text, `weibo_charalt_${charId}`);
  }

  /** 删除小号：资料、博、评论、点赞、关注、私信、记忆全清 */
  async function deleteCharAlt(charId) {
    const a = calt(charId); if (!a) return;
    const nick = a.nick;
    for (const p of S.posts.filter(p => p.altOf === charId)) await deletePost(p);
    for (const p of S.posts) {
      let dirty = false;
      const gone = p.comments.filter(c => c.altOf === charId);
      if (gone.length) {
        const ids = new Set(gone.map(c => c.id));
        forget(gone.flatMap(c => c.memEvents || []));
        p.comments = p.comments.filter(c => !ids.has(c.id) && !ids.has(c.parentId)); p.counts.comments = Math.max(p.comments.length, p.counts.comments - gone.length); dirty = true;
      }
      if ((p.npcLikers || []).includes(nick)) { p.npcLikers = p.npcLikers.filter(n => n !== nick); p.counts.likes = Math.max(0, p.counts.likes - 1); dirty = true; }
      if (dirty) savePost(p);
    }
    for (const m of [S.meta, S.alt].filter(Boolean)) {
      const before = (m.fans || []).length; m.fans = (m.fans || []).filter(f => f.name !== nick);
      if (m.fans.length < before) m.followers = Math.max(0, (m.followers || 0) - 1);
      m.followNpc = (m.followNpc || []).filter(n => n !== nick);
    }
    for (const t of (await dbList(COL.dms)).filter(t => t.scope === S.identity.id && t.peer && t.peer.type === "npc" && t.peer.name === nick)) {
      forget((t.messages || []).flatMap(m => m.memEvents || []));
      try { await api.db.delete(COL.dms, t.id); } catch (e) { /* ignore */ }
    }
    S.threads = S.threads.filter(t => !(t.peer.type === "npc" && t.peer.name === nick));
    forget([{ charId, eventId: `weibo_charalt_${charId}` }]);
    delete S.npcs.map[nick]; saveNpcs();
    delete S.calts.map[charId]; saveCalts(); saveMeta();
    toast("小号已删除"); refreshAll(); refreshMsgViews();
  }

  /** 改小号资料（昵称改了要把博、评论、点赞、粉丝、私信里的名字一起换掉） */
  function renameAlt(charId, nick) {
    const a = calt(charId); const old = a && a.nick; if (!old || !nick || nick === old) return;
    for (const p of S.posts) {
      let dirty = false;
      if (p.altOf === charId && p.authorName === old) { p.authorName = nick; dirty = true; }
      for (const c of p.comments || []) {
        if (c.altOf === charId && c.authorName === old) { c.authorName = nick; dirty = true; }
        if (c.replyToName === old) { c.replyToName = nick; dirty = true; }
      }
      if ((p.npcLikers || []).includes(old)) { p.npcLikers = p.npcLikers.map(n => (n === old ? nick : n)); dirty = true; }
      if (dirty) savePost(p);
    }
    for (const m of [S.meta, S.alt].filter(Boolean)) {
      for (const f of m.fans || []) if (f.name === old) f.name = nick;
      m.followNpc = (m.followNpc || []).map(n => (n === old ? nick : n));
    }
    for (const t of S.threads) if (t.peer.type === "npc" && t.peer.name === old) {
      api.db.delete(COL.dms, t.id).catch(() => {});
      t.peer = { ...t.peer, name: nick }; t.key = threadKey(t.peer); t.id = `dm_${S.identity.id}_${acctOf(t) === "alt" ? "alt_" : ""}${t.key}`; saveThread(t);
    }
    S.npcs.map[nick] = S.npcs.map[old]; delete S.npcs.map[old];
    a.nick = nick; saveCalts(); saveNpcs(); saveMeta();
  }

  function openEditAlt(charId) {
    const a = calt(charId); if (!a) return;
    openPage(`edit-alt:${charId}`, pg => {
      const keep = {}; for (const id of ["fa-nick", "fa-bio", "fa-ip", "fa-fans"]) { const el = $("#" + id, pg.el); if (el) keep[id] = el.value; }
      const info = S.npcs.map[a.nick] || {};
      $(".page-body", pg.el).innerHTML = `<div class="form">
        <div class="form-note" style="margin:0">${esc(charById(charId)?.name || "")}的小号 · 头像默认从路人头像库分，也可以单独上传</div>
        <div class="form-row"><label>昵称</label><input id="fa-nick" maxlength="24" value="${esc(a.nick)}"></div>
        <div class="form-row"><label>简介</label><textarea id="fa-bio" maxlength="140">${esc(info.bio || "")}</textarea></div>
        <div class="form-row"><label>IP属地</label><input id="fa-ip" maxlength="20" value="${esc(info.ip || "")}"></div>
        <div class="form-row"><label>粉丝数</label><input id="fa-fans" maxlength="6" inputmode="numeric" value="${esc(info.followers || 0)}"></div>
        <div class="form-row"><label>头像</label>${avatarHtml(authorOf({ authorType: "npc", authorName: a.nick }), 44)}<button class="btn-ghost" data-act="alt-avatar" data-char="${esc(charId)}">上传图片</button>${info.avatarRef ? `<button class="btn-ghost" data-act="alt-avatar-reset" data-char="${esc(charId)}">用头像库</button>` : ""}</div>
      </div>`;
      for (const id in keep) $("#" + id, pg.el).value = keep[id];
      hydrateImages(pg.el);
    }, { title: "小号资料", action: `<button class="page-action" data-act="save-alt" data-char="${esc(charId)}">保存</button>` });
  }
  function saveEditAlt(charId) {
    const a = calt(charId); const pg = topPage(); if (!a || !pg) return;
    const nick = $("#fa-nick", pg.el).value.trim().replace(/^@/, "");
    if (!nick) { toast("昵称不能为空"); return; }
    if (nick !== a.nick && (isUserName(nick) || S.chars.some(c => c.name === nick || charNickname(c.id) === nick) || altOwner(nick) || S.npcs.map[nick] || S.posts.some(p => p.authorName === nick))) { toast("这个昵称已经有人用了"); return; }
    renameAlt(charId, nick);
    Object.assign(S.npcs.map[a.nick], { bio: $("#fa-bio", pg.el).value.trim(), ip: $("#fa-ip", pg.el).value.trim(), followers: clampInt($("#fa-fans", pg.el).value, 0) });
    saveNpcs(); closePage(); toast("已保存");
  }

  /** 设置里每个 char 的「小号」按钮 */
  async function charAltMenu(charId) {
    const ch = charById(charId); if (!ch) return;
    if (S[`_galt_${charId}`]) { toast("正在生成，稍等一下"); return; }
    const a = calt(charId);
    if (!a) {
      const v = await sheet(`给${ch.name}生成一个微博小号（用一次 API）`, [
        { label: "🔒 藏起来，让我自己找", value: "hidden" }, { label: "💬 他主动告诉我的（直接给我看）", value: "told" }]);
      if (v) genCharAlt(charId, v);
      return;
    }
    if (a.state === "hidden") {
      const v = await sheet(`${ch.name}的小号 · 🔒 身份保密`, [{ label: "查看 / 编辑小号（看了就算你知道啦）", value: "peek" }, { label: "删除小号（内容和记忆一起删）", value: "del", danger: true }]);
      if (v === "peek") {
        const ok = await sheet("看了就算你知道这是他的小号啦（他不知道你发现了）", [{ label: "确定要看", value: "yes" }]);
        if (ok === "yes") { a.state = "aware"; a.seenAt = nowIso(); saveCalts(); refreshAll(); openNpcProfile(a.nick); }
      }
      if (v === "del") confirmDeleteAlt(charId);
      return;
    }
    const v = await sheet(`${ch.name}的小号「${a.nick}」· ${a.state === "open" ? "你们都知道" : "🤫 你知道，他不知道你发现了"}`, [
      { label: "去他的小号主页", value: "home" }, { label: "编辑小号资料", value: "edit" }, { label: "删除小号（内容和记忆一起删）", value: "del", danger: true }]);
    if (v === "home") openNpcProfile(a.nick);
    if (v === "edit") openEditAlt(charId);
    if (v === "del") confirmDeleteAlt(charId);
  }
  async function confirmDeleteAlt(charId) {
    const ok = await sheet("删除后不能恢复：小号的资料、发过的博、评论、点赞、关注、私信和相关记忆都会删掉", [{ label: "删除小号", value: "yes", danger: true }]);
    if (ok === "yes") deleteCharAlt(charId);
  }

  /** 路人主页「…」：这是谁的小号？（本地对答案，不花 API） */
  async function guessAlt(name) {
    const pool = activeChars(); if (!pool.length) return;
    const id = await sheet("这是谁的小号？", pool.map(c => ({ label: c.name, value: c.id })));
    if (!id) return;
    const a = calt(id);
    if (!a || a.nick !== name) { toast("好像不是哦"); return; }
    if (a.state === "hidden") { a.state = "aware"; a.guessedAt = nowIso(); saveCalts(); }
    toast(`猜对了！这就是${charById(id).name}的小号 🤫`); refreshAll();
  }
  /** 戳穿他：弹出和小号的私信，她发出第一句才算 */
  function outAlt(charId) {
    const a = calt(charId); if (!a) return;
    if (isAlt()) { toast("切回大号再去戳穿他吧"); return; }
    const t = getThread({ type: "npc", name: a.nick }); t.outing = true; saveThread(t);
    openThread(t);
    toast("写点什么戳穿他吧～发出去才算");
  }

  // ───────────────────────── 发微博 ─────────────────────────
  function openCompose(repostOf, init) {
    const draft = { text: (init && init.text) || "", images: [], location: "", visibility: "public", superName: init && init.superName };
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
      title: repostOf ? "转发微博" : draft.superName ? `发帖到 ${draft.superName}超话` : "发微博",
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
      id: uid("wb"), scope: S.identity.id, authorType: "user", ...acctTag(), authorName: S.me.nickname, verified: "无", vip: !!S.me.vip,
      source: S.me.device || "iPhone客户端", createdAt: nowIso(), text: draft.text.trim() || (repostOf ? "转发微博" : ""), images,
      location: draft.location, visibility: draft.visibility, repost: null, counts: { reposts: 0, comments: 0, likes: 0 },
      liked: false, comments: [], commentsGenerated: true, origin: "user",
      ...(draft.superName ? { superName: draft.superName } : {}),
    };
    if (draft.superName) addExp(draft.superName, 5);
    if (repostOf) {
      const a = authorOf(repostOf);
      const base = repostOf.repost && !repostOf.repost.deleted ? repostOf.repost : null;
      post.repost = base
        ? { ...base, chain: [{ name: a.name, text: repostOf.text }, ...(base.chain || [])].slice(0, 6) }
        : { author: a.name, text: repostOf.text, images: repostOf.images, postId: repostOf.id, chain: [] };
      if (draft.text.includes(`//@${a.name}:`)) { post.text = draft.text.split(`//@${a.name}:`)[0].trim() || "转发微博"; }
      repostOf.counts.reposts++; savePost(repostOf);
      if (repostOf.authorType === "char" && (!isAlt() || knowsAlt(repostOf.charId))) remember(repostOf.charId, `${S.identity.name || S.meta.nickname}${isAlt() ? `用小号「${S.alt.nickname}」` : ""}在微博转发了我的微博「${repostOf.text.slice(0, 40)}」，转发语：「${post.text.slice(0, 60)}」`, `weibo_repost_${post.id}`, null, post, repostOf);
    }
    S.posts.push(post); savePost(post); S.allPostRows++;
    if (isAlt() && !S.alt.posted) { S.alt.posted = true; saveMeta(); }
    page.sent = true;
    if (page.draftId) { S.me.drafts = (S.me.drafts || []).filter(d => d.id !== page.draftId); saveMeta(); }
    closePage(); toast("发送成功");
    const under = topPage();
    if (under && under.topic) under.setTab("live");
    else if (under && under.superName) under.setTab("new");
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
        const love = loveOf(c.id).state;
        const tags = [isPublic(c.id) ? "公众人物" : "普通人", isStarred(c.id) ? `<em class="ic">★</em> 特别关注` : "", love !== "none" ? `<em class="ic">♥</em> ${LOVE_LABEL[love]}` : ""].filter(Boolean)
          .map(t => `<i>${t}</i>`).join("") + (calt(c.id) ? `<i class="alt">${altSeen(c.id) ? "小号" : "小号🔒"}</i>` : "");
        return `<div class="list-cell char-set-row" data-act="open-char-set" data-char="${esc(c.id)}">${avatarHtml(a)}<div class="cell-main"><div>${esc(c.name)}</div><div class="set-tags">${tags}</div></div>
          <button class="switch ${on ? "on" : ""}" data-act="toggle-part" data-char="${esc(c.id)}" aria-label="参与"><span></span></button><span class="set-chev">›</span></div>`;
      }).join("") : `<div class="empty" style="padding:24px">这个身份还没有角色好友</div>`;
      const pool = S.meta.avatarPool || [];
      const altHtml = isAlt() ? `<div class="form-note">谁知道这个小号「${esc(S.alt.nickname)}」· 打开的人知道是你，会来点赞、评论、私信；没打开的人只把它当陌生网友。${S.alt.posted ? "现在打开算他自己发现的" : "发博前打开算你告诉他的"}（会写进他的记忆，关掉就删掉）</div>
        ${S.chars.map(c => { const a = authorOf({ authorType: "char", charId: c.id }); const on = knowsAlt(c.id);
          return `<div class="list-cell">${avatarHtml(a)}<div class="cell-main"><div>${esc(c.name)}</div><div class="cell-sub">${on ? "知道是你" : "不知道"}</div></div>
          <button class="switch ${on ? "on" : ""}" data-act="toggle-alt-know" data-char="${esc(c.id)}" aria-label="知道小号"><span></span></button></div>`; }).join("")}
        <div style="height:8px"></div>` : "";
      body.innerHTML = `${altHtml}
        <div class="form-note">参与的角色 · 开关关掉的人不发微博也不来评论；点那一行进去设置身份、特别关注、小号、恋情状态</div>
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

  /** 单个角色的微博设置：参与、特别关注、身份、小号、恋情状态 */
  function openCharSettings(charId) {
    const ch = charById(charId); if (!ch) return;
    openPage(`char-set:${charId}`, pg => {
      const body = $(".page-body", pg.el); const sc = body.scrollTop;
      const a = authorOf({ authorType: "char", charId }); const on = !(S.meta.excludedChars || []).includes(charId);
      const love = loveOf(charId).state; const al = calt(charId);
      const seg = (act, opts, cur) => `<div class="seg">${opts.map(([v, label]) => `<button class="${v === cur ? "on" : ""}" data-act="${act}" data-char="${esc(charId)}" data-v="${v}">${label}</button>`).join("")}</div>`;
      const altSub = S[`_galt_${charId}`] ? "生成中…" : !al ? "＋ 给他生成一个小号（会用一次 API）" : al.state === "hidden" ? "🔒 藏着，名字保密（你还没找到）" : `${al.nick} · ${al.state === "open" ? "公开" : "你知道了，他以为你不知道"}`;
      body.innerHTML = `<div class="cs-head">${avatarHtml(a, 52)}<div><div class="cs-name">${esc(ch.name)}</div><div class="cs-s">${esc(a.name !== ch.name ? `微博：${a.name}` : "还没有微博账号")}</div></div></div>
        <div class="cs-row cs-flex"><div><div class="cs-t">参与微博</div><div class="cs-s">关掉后他不发微博也不来评论</div></div><button class="switch ${on ? "on" : ""}" data-act="toggle-part" data-char="${esc(charId)}"><span></span></button></div>
        <div class="cs-row cs-flex"><div><div class="cs-t">★ 特别关注</div><div class="cs-s">刷新和你发博时一定会叫到他</div></div><button class="switch ${isStarred(charId) ? "on" : ""}" data-act="toggle-star" data-char="${esc(charId)}"><span></span></button></div>
        <div class="cs-row"><div class="cs-t">身份</div>${seg("set-public", [["0", "普通人"], ["1", "公众人物"]], isPublic(charId) ? "1" : "0")}<div class="cs-s">公众人物才会上热搜、有粉丝控评</div></div>
        <div class="cs-row cs-flex" data-act="char-alt" data-char="${esc(charId)}"><div><div class="cs-t">微博小号</div><div class="cs-s">${esc(altSub)}</div></div><span class="set-chev">›</span></div>
        <div class="cs-row"><div class="cs-t">所在城市</div>${seg("set-city", [["same", "跟我同城"], ["custom", "别的城市"], ["none", "不设置"]], charCityCfg(charId).mode)}<div class="cs-s">${(m => m === "none" ? "他的博不带天气，AI 也不会给他编温度" : m === "custom" ? (cityOf(charId) ? `${esc(cityLabel(cityOf(charId)))} · <button class="link" data-act="set-city" data-char="${esc(charId)}" data-v="custom">改</button>` : "还没填城市") : myCity() ? `跟你一样：${esc(cityLabel(myCity()))}` : "你还没填所在城市（编辑资料里填）")(charCityCfg(charId).mode)}</div></div>
        <div class="cs-row"><div class="cs-t">恋情状态</div>${seg("set-love", Object.entries(LOVE_LABEL), love)}<div class="cs-s">${love === "open" && loveFresh(charId) ? "刚官宣，前三天评论区沸腾，之后慢慢变成「公开很久了」" : LOVE_NOTE[love]}</div></div>
        ${love !== "none" ? `<div class="cs-row cs-flex"><div><div class="cs-t">刷新时单独写他的博</div><div class="cs-s">他出场的那次刷新多用 1 次 API，人设和聊天记录更完整，更像他本人</div></div><button class="switch ${loverSolo(charId) ? "on" : ""}" data-act="toggle-solo" data-char="${esc(charId)}"><span></span></button></div>` : ""}
        ${love === "secret" ? (pg.busy ? `<div class="gen-tip"><span class="spinner"></span>他正在写官宣微博…</div>` : `<button class="cs-btn" data-act="love-announce" data-char="${esc(charId)}">📢 让他发官宣微博（会用 1～2 次 API）</button>`) : ""}
        <div class="form-note" style="text-align:center">选「已公开」= 公开很久了，大家早习惯了；点官宣 = 刚官宣，前三天评论区沸腾<br>切换恋情状态会写进他的记忆</div>`;
      body.scrollTop = sc; hydrateImages(body);
    }, { title: `${ch.name}的微博设置` });
  }
  /** 切换恋情状态：换掉他记忆里的那一条 */
  function setLove(charId, state, announced) {
    const ch = charById(charId); if (!ch) return;
    const who = S.identity.name || S.meta.nickname;
    S.meta.love = { ...(S.meta.love || {}), [charId]: { state, ...(announced ? { announcedAt: nowIso() } : {}) } };
    saveMeta();
    const evt = `weibo_love_${charId}`;
    forget([{ charId, eventId: evt }]);
    const text = state === "secret" ? `我和${who}在谈恋爱，但在微博上还没公开，是地下恋：公开场合我只能暗戳戳的`
      : state === "open" ? (announced ? `我在微博上官宣了和${who}的恋情` : `我和${who}的恋情在微博上早就公开了，大家都知道`) : "";
    if (text) setTimeout(() => remember(charId, text, evt), 300);
  }
  async function announceLove(page, charId) {
    const ch = charById(charId); if (!ch || page.busy) return;
    page.busy = true; page.render(page);
    const nick = charNickname(charId);
    const instruction = [
      `当前时间：${nowText()}`,
      `本轮*只生成 1 条微博*：${ch.name} 本人用大号发的官宣微博，宣布和用户在一起了。不要生成路人微博，不要生成别的角色的微博。`,
      `按他的人设和说话方式来写：可以 @ 用户的微博昵称「${S.meta.nickname}」，可以配图（合照、牵手、两杯饮料之类，出镜的标注规则照常）。别写成通稿，像他本人会发的样子。`,
      `他的微博昵称：${nick}`,
      reservedLine(),
    ].join("\n\n");
    S._announcing = charId; // 正在官宣：不再提醒 AI「地下恋不能秀」
    const text = await generate({ characterId: charId, appTags: ["nox_weibo", "feed"], instruction }, `${ch.name}官宣`).finally(() => { S._announcing = null; });
    page.busy = false;
    if (text == null) { page.render(page); return; }
    const post = parseBlocks(text, "微博").filter(b => !isUserName(b["作者"])).map(b => postFromBlock(b, { origin: "feed", followFeed: true }))
      .filter(p => p.text || p.images.length).map(p => Object.assign(p, { authorType: "char", charId, authorName: nick, createdAt: nowIso(), loveAnnounce: true }))[0];
    if (!post) { page.render(page); parseFailed(`${ch.name}官宣`); return; }
    if (isPublic(charId)) post.counts.likes = Math.max(post.counts.likes, rand(50, 300) * 1000);
    S.posts.push(post); savePost(post); S.allPostRows++; rememberOwnPost(post);
    setLove(charId, "open", true);
    // 公众人物官宣直接上热搜（不花 API）
    if (isPublic(charId)) {
      const title = `${ch.name}官宣`;
      S.hot.items = [{ title, heat: rand(300, 900) * 10000, tag: "爆", rel: `${ch.name}、用户` }, ...(S.hot.items || []).filter(x => x.title !== title)].slice(0, HOT_COUNT);
      saveHot();
    }
    noteParsed(`官宣微博：${post.text.slice(0, 30)}`);
    page.render(page); refreshAll(); toast(`${ch.name}官宣了！`);
    openDetail(post.id);
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

  async function switchAcct(to) {
    if (to === curAcct()) return;
    if (S.feedBusy || S.jobs.size) { toast("还有内容在生成，等一下再切换"); return; }
    S.acct = to; S.meta.acct = to; saveMeta();
    await new Promise(r => setTimeout(r, 300)); // 等私信存完
    const rows = await dbList(COL.dms);
    S.threads = rows.filter(t => t.scope === S.identity.id && t.peer && acctOf(t) === S.acct).map(t => ({ ...t, messages: t.messages || [] }));
    while (pages.length) closePage();
    renderTab(); toast(`已切换到${to === "alt" ? "小号" : "大号"}「${S.me.nickname}」`);
  }
  function newAlt() {
    const t = nowIso();
    S.alt = { id: `alt_${S.identity.id}`, nickname: "", bio: "", ip: S.meta.ip || "", device: S.meta.device || "", cover: 3, followers: rand(0, 12),
      fans: [], seen: { at: t, comment: t, like: t, follow: t }, favs: [], drafts: [], history: [], visits: [], knownBy: [], posted: false, createdAt: t };
    S.acct = "alt"; S.threads = [];
    while (pages.length) closePage();
    renderTab(); openEditMe();
  }
  /** 设置里「谁知道这个小号」：打开时写一条记忆，关掉时删掉 */
  function toggleAltKnow(charId) {
    const ch = charById(charId); if (!ch || !S.alt) return;
    const evt = `weibo_altknow_${charId}`; const on = !knowsAlt(charId);
    S.alt.knownBy = on ? [...(S.alt.knownBy || []), charId] : (S.alt.knownBy || []).filter(x => x !== charId);
    const who = S.identity.name || S.meta.nickname;
    if (on) remember(charId, S.alt.posted ? `我发现了${who}的微博小号「${S.alt.nickname}」` : `${who}告诉我自己有个微博小号叫「${S.alt.nickname}」`, evt);
    else forget([{ charId, eventId: evt }]);
    saveMeta(); toast(on ? `${ch.name}${S.alt.posted ? "发现了" : "知道了"}你的小号` : `${ch.name}不再知道你的小号`);
  }

  function openEditMe() {
    openPage("edit-me", pg => {
      // 重绘时保留还没保存的输入
      const keep = {};
      for (const id of ["f-nick", "f-bio", "f-ip", "f-dev", "f-city", "f-cityname"]) { const el = $("#" + id, pg.el); if (el) keep[id] = el.value; }
      const vipEl = $("#f-vip", pg.el); const pubEl = $("#f-pub", pg.el);
      $(".page-body", pg.el).innerHTML = `<div class="form">
        ${isAlt() ? `<div class="form-note" style="margin:0">这是你的小号${S.alt.nickname ? "" : "：先给它起个名字吧"}。除了你在设置里打开的人，谁都不知道是你</div>` : ""}
        <div class="form-row"><label>昵称</label><input id="f-nick" maxlength="30" placeholder="${isAlt() ? "比如 今天也在嗑、不想起床的猫" : ""}" value="${esc(S.me.nickname || "")}"></div>
        <div class="form-row"><label>简介</label><textarea id="f-bio" maxlength="140" placeholder="介绍一下自己">${esc(S.me.bio)}</textarea></div>
        <div class="form-row"><label>IP属地</label><input id="f-ip" maxlength="20" placeholder="如 上海" value="${esc(S.me.ip)}"></div>
        <div class="form-row"><label>所在城市</label><input id="f-city" maxlength="20" placeholder="真实城市，用来查天气，如 杭州" value="${esc((S.meta.city || {}).q || "")}"></div>
        <div class="form-row"><label>微博里叫</label><input id="f-cityname" maxlength="20" placeholder="不填就用真名，如 临江市" value="${esc((S.meta.city || {}).name || "")}"></div>
        <div class="form-row"><label>发布设备</label><input id="f-dev" maxlength="30" placeholder="如 iPhone 16 Pro" value="${esc(S.me.device || "")}"></div>
        <div class="form-row"><label>会员</label><input type="checkbox" id="f-vip" ${S.me.vip ? "checked" : ""} style="flex:none;width:20px;height:20px"></div>
        ${isAlt() ? "" : `<div class="form-row"><label>公众人物</label><input type="checkbox" id="f-pub" ${S.meta.publicFigure ? "checked" : ""} style="flex:none;width:20px;height:20px"><span class="cell-sub" style="margin-left:8px">打开后会上热搜、有粉丝</span></div>`}
        <div class="form-row"><label>头像</label>${avatarHtml(authorOf({ authorType: "user", ...acctTag() }), 44)}<button class="btn-ghost" data-act="upload-avatar">上传图片</button>${S.me.avatarRef ? `<button class="btn-ghost" data-act="reset-avatar">${isAlt() ? "删除头像" : "用身份头像"}</button>` : ""}</div>
        <div class="form-row" style="display:block;padding-top:12px"><label>封面</label>
          <div class="profile-cover" style="height:90px;border-radius:8px;margin-top:8px;background:${COVERS[S.me.cover || 0]}" ${S.me.coverRef ? `data-bg-ref="${esc(S.me.coverRef)}"` : ""}></div>
          <div class="swatches"><button class="btn-ghost" data-act="upload-cover">上传图片</button>${COVERS.map((c, i) => `<button class="swatch ${!S.me.coverRef && S.me.cover === i ? "on" : ""}" style="background:${c}" data-act="pick-cover" data-idx="${i}"></button>`).join("")}</div></div>
      </div><div class="form-note"><button class="link" data-act="open-raw" style="font-size:12px">调试记录：查看最近 10 次 AI 调用</button></div><div class="form-note">头像默认用小手机里的身份头像，也可以单独上传。昵称是你在微博上的名字，角色在微博里会用它称呼你。</div><div class="form-note">所在城市用来查今天的真实天气，AI 只会看到「微博里叫」的名字。角色默认跟你同城，可以在每个角色的微博设置里改。</div>`;
      for (const id in keep) $("#" + id, pg.el).value = keep[id];
      if (vipEl) $("#f-vip", pg.el).checked = vipEl.checked;
      if (pubEl) $("#f-pub", pg.el).checked = pubEl.checked;
      hydrateImages(pg.el);
    }, { title: isAlt() ? "小号资料" : "编辑资料", action: `<button class="page-action" data-act="save-me">保存</button>`,
      // 新注册的小号没起名就退出：当没注册过
      onClose: () => { if (S.alt && !S.alt.nickname) { S.alt = null; S.acct = "main"; S.meta.acct = "main"; saveMeta(); renderTab(); } } });
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
          const who = post.charId || post.altOf;
          const r = await api.ai.generateImage({ prompt: img.desc, characterId: who, useReferenceImage: !!who && withFace, timeoutMs: 120000 });
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
            S.me.drafts = [{ id, text: pg.draft.text.trim(), at: nowIso() }, ...(S.me.drafts || []).filter(d => d.id !== id)].slice(0, 50);
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
      case "clear-history": S.me.history = []; saveMeta(); refreshAll(); return;
      case "open-drafts": openDrafts(); return;
      case "open-draft": { const d = (S.me.drafts || []).find(x => x.id === el.dataset.id); if (d) openCompose(null, { text: d.text, draftId: d.id }); return; }
      case "del-draft": S.me.drafts = (S.me.drafts || []).filter(x => x.id !== el.dataset.id); saveMeta(); refreshAll(); return;
      case "open-super": if (el.dataset.name) openSuper(el.dataset.name); else openSuperHome(); return;
      case "super-join": { const sp = getSuper(el.dataset.name); if (sp) { su(sp).joined = !su(sp).joined; saveSupers(); toast(su(sp).joined ? "已加入" : "已退出"); refreshAll(); } return; }
      case "super-sign": superSign(el.dataset.name); return;
      case "super-icon": case "super-cover": {
        const sp = getSuper(el.dataset.name); if (!sp) return;
        const isIcon = act === "super-icon";
        try {
          const [ref] = await pickImages(1, isIcon ? 400 : 1280); if (!ref) return;
          const key = isIcon ? "iconRef" : "coverRef";
          if (sp[key]) api.media.delete({ ref: sp[key] }).catch(() => {});
          sp[key] = ref; saveSupers(); toast("已更换"); refreshAll();
        } catch (err) { toast("上传失败"); }
        return;
      }
      case "super-rec": { const pg = topPage(); if (pg && pg.superHome) genRecommend(pg); return; }
      case "super-create": openSuper(el.dataset.name); return;
      case "super-more": { const pg = topPage(); if (pg && pg.superName) genSuperPosts(pg, !!(getSuper(pg.superName) || {}).generated); return; }
      case "super-post": openCompose(null, { superName: el.dataset.name }); return;
      case "open-char-supers": openCharSupers(el.dataset.char); return;
      case "char-supers-gen": { const pg = topPage(); if (pg && pg.charId) genCharSupers(pg); return; }
      case "char-super-rm": {
        const id = el.dataset.char, name = el.dataset.name; const ch = charById(id); const info = (S.supers.charSupers || {})[id]; if (!info || !ch) return;
        const ok = await sheet(`让${ch.name}不再关注「${name}超话」？`, [{ label: "移除", value: "yes", danger: true }]); if (ok !== "yes") return;
        info.about = (info.about || []).filter(n => n !== name); info.haunts = (info.haunts || []).filter(n => n !== name);
        const sp = getSuper(name); if (sp) sp.rel = String(sp.rel || "").split(/[、,，\s]+/).filter(n => n && n !== ch.name).join("、");
        saveSupers(); refreshAll(); return;
      }
      case "char-super-add": {
        const id = el.dataset.char; const ch = charById(id); if (!ch) return;
        const info = (S.supers.charSupers || {})[id] || { about: [], haunts: [] };
        const name = normSuper(await inputSheet(`让${ch.name}关注哪个超话？`, { placeholder: "超话名，不用写「超话」两个字", ok: "关注" }));
        if (!name) return;
        if ([...(info.about || []), ...(info.haunts || [])].includes(name)) { toast(`${ch.name}已经关注了「${name}超话」`); return; }
        if (!getSuper(name)) S.supers.map[name] = { name, intro: "", kind: "interest", postCount: 0, fans: 0 };
        const sp = getSuper(name);
        if (sp.kind === "person" || sp.kind === "cp") info.about = [...(info.about || []), name]; else info.haunts = [...(info.haunts || []), name];
        if (!String(sp.rel || "").includes(ch.name)) sp.rel = [sp.rel, ch.name].filter(x => x && !none(x)).join("、");
        S.supers.charSupers = { ...(S.supers.charSupers || {}), [id]: info }; saveSupers(); toast(`${ch.name}关注了「${name}超话」`); refreshAll(); return;
      }
      case "open-profile": openCharProfile(el.dataset.char); return;
      case "open-npc": openNpcProfile(el.dataset.name); return;
      case "like": {
        if (!post) return;
        const k = LK(); const on = post[k] = !post[k]; post.counts.likes += on ? 1 : -1; post[LKAT()] = on ? nowIso() : undefined; savePost(post);
        const likeEvt = `weibo_like_${isAlt() ? "alt_" : ""}${post.id}`;
        if (on && post.authorType === "char" && (!isAlt() || knowsAlt(post.charId))) remember(post.charId, `${S.identity.name || S.meta.nickname}${isAlt() ? `用小号「${S.alt.nickname}」` : ""}在微博给我的「${post.text.slice(0, 30)}」点了赞`, likeEvt, null, post);
        if (!on && post.authorType === "char") forget([{ charId: post.charId, eventId: likeEvt }]);
        refreshVisible(post); return;
      }
      case "repost": if (post) openCompose(post); return;
      case "focus-reply": { const pg = topPage(); pg && $(".reply-input", pg.el)?.focus(); return; }
      case "follow": {
        if (!post) return; const a = authorOf(post);
        if (a.type === "char") S.meta.unfollowChars = (S.meta.unfollowChars || []).filter(x => x !== a.charId);
        else { S.meta.followNpc = Array.from(new Set([...(S.meta.followNpc || []), a.name])); onFollowNpc(a.name, true); }
        saveMeta(); toast("关注成功"); refreshAll(); return;
      }
      case "toggle-follow-char": {
        const id = el.dataset.char; const on = isFollowingChar(id);
        S.meta.unfollowChars = on ? [...(S.meta.unfollowChars || []), id] : (S.meta.unfollowChars || []).filter(x => x !== id);
        saveMeta(); toast(on ? "已取消关注" : "关注成功"); refreshAll(); return;
      }
      case "toggle-follow-npc": {
        const n = el.dataset.name; const on = isFollowingNpc(n);
        S.meta.followNpc = on ? S.meta.followNpc.filter(x => x !== n) : [...(S.meta.followNpc || []), n]; onFollowNpc(n, !on);
        saveMeta(); toast(on ? "已取消关注" : "关注成功"); refreshAll(); return;
      }
      case "post-menu": {
        if (!post) return;
        const mine = post.authorType === "user";
        const choice = await sheet("", mine
          ? [{ label: "分享给…", value: "share" }, { label: S.me.pinnedPostId === post.id ? "取消置顶" : "置顶", value: "pin" }, { label: "删除（相关记忆一起删）", value: "del", danger: true }]
          : [{ label: "分享给…", value: "share" }, { label: isFav(post.id) ? "取消收藏" : "收藏", value: "fav" }, { label: "不感兴趣", value: "hide" }, { label: "举报", value: "report" },
            { label: "删除这条微博（相关记忆一起删）", value: "del", danger: true }]);
        if (choice === "share") sharePost(post);
        if (choice === "hide") { await deletePost(post); toast("将减少此类内容推荐"); refreshAll(); }
        if (choice === "fav") {
          const on = isFav(post.id);
          S.me.favs = on ? S.me.favs.filter(f => f.id !== post.id) : [{ id: post.id, at: nowIso() }, ...(S.me.favs || [])];
          saveMeta(); toast(on ? "已取消收藏" : "已收藏"); refreshAll();
        }
        if (choice === "report") toast("举报已提交");
        if (choice === "pin") { S.me.pinnedPostId = S.me.pinnedPostId === post.id ? null : post.id; saveMeta(); toast(S.me.pinnedPostId ? "已置顶" : "已取消置顶"); refreshAll(); }
        if (choice === "del") {
          for (const p of S.posts) if (p.repost && p.repost.postId === post.id) { p.repost.deleted = true; savePost(p); } else if (p.repost && p.repost.viaPostId === post.id) { p.repost.chain = (p.repost.chain || []).filter(c => c.name !== authorOf(post).name || c.text !== post.text); delete p.repost.viaPostId; savePost(p); }
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
            const gone = repliesTo(p, c);
            forget(gone.flatMap(x => x.memEvents || []));
            p.comments = p.comments.filter(x => !gone.includes(x)); p.counts.comments = Math.max(0, p.counts.comments - gone.length); savePost(p); rerenderDetail(p); refreshMsgViews();
          }
          if (v !== "reply") return;
        }
        topPage().setReply(c); return;
      }
      case "cancel-reply": topPage().cancelReply(); return;
      case "open-sub": { const [p, c] = findComment(el.dataset.cmt); if (c) { c._open = true; rerenderDetail(p); } return; }
      case "load-reposts":
        if (post) loadReposts(post);
        return;
      case "more-cmts":
        if (!post) return;
        // 自己的博还没人来过：走发博后那一整套（评论、点赞、新粉丝、私信）
        if (post.authorType === "user" && !post.reacted && !post.comments.some(c => c.authorType !== "user")) reactToUserPost(post);
        else moreComments(post);
        return;
      case "like-cmt": {
        const [p, c] = findComment(el.dataset.cmt); if (!c) return;
        const k = LK(); c[k] = !c[k]; c.likes += c[k] ? 1 : -1; savePost(p); rerenderDetail(p); return;
      }
      case "del-cmt": {
        const [p, c] = findComment(el.dataset.cmt); if (!c) return;
        if (await sheet("确定删除这条评论吗？回复它的评论和相关记忆会一起删掉", [{ label: "删除", value: "yes", danger: true }]) !== "yes") return;
        const gone = repliesTo(p, c);
        forget(gone.flatMap(x => x.memEvents || []));
        p.comments = p.comments.filter(x => !gone.includes(x)); p.counts.comments = Math.max(0, p.counts.comments - gone.length); savePost(p); rerenderDetail(p); return;
      }
      case "view-pic": { const p = findPost(el.dataset.post); if (p) openViewer(p, +el.dataset.idx); return; }
      case "me-tab": meTab = el.dataset.tab; refreshAll(); return;
      case "edit-me": openEditMe(); return;
      case "switch-acct": {
        const items = [{ label: `大号：${S.meta.nickname}`, value: "main", on: !isAlt() }];
        if (S.alt && S.alt.nickname) items.push({ label: `小号：${S.alt.nickname}`, value: "alt", on: isAlt() });
        else items.push({ label: "＋ 注册一个小号", value: "new" });
        const v = await sheet("切换账号", items); if (!v) return;
        if (v === "new") newAlt(); else switchAcct(v);
        return;
      }
      case "toggle-alt-know": toggleAltKnow(el.dataset.char); { const pg = topPage(); pg && pg.render(pg); } return;
      case "open-raw": openRaw(); return;
      case "open-settings": openSettings(); return;
      case "toggle-solo": {
        const id = el.dataset.char; const on = loverSolo(id);
        S.meta.soloOff = on ? [...(S.meta.soloOff || []), id] : (S.meta.soloOff || []).filter(x => x !== id);
        saveMeta(); toast(on ? "已关闭：刷新时和大家一起写" : "已打开：刷新时单独写他的博"); refreshAll(); return;
      }
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
      case "open-char-set": openCharSettings(el.dataset.char); return;
      case "set-city": {
        const id = el.dataset.char; const v = el.dataset.v; const ch = charById(id); if (!ch) return;
        let cfg = { mode: v };
        if (v === "custom") {
          const old = charCityCfg(id);
          const q = await inputSheet(`${ch.name}在哪个城市？（真实城市名，用来查天气）`, { placeholder: "如 北京", value: old.q || "", maxlength: 20 });
          if (q == null || !q.trim()) return;
          const name = await inputSheet("在微博里叫什么？（不填就用真名）", { placeholder: "如 北城", value: old.name || "", maxlength: 20, ok: "保存" });
          if (name == null) return;
          cfg = { mode: "custom", q: q.trim(), name: name.trim() };
        }
        S.meta.charCity = { ...(S.meta.charCity || {}), [id]: cfg }; saveMeta(); refreshAll(); return;
      }
      case "set-public": {
        const id = el.dataset.char; const want = el.dataset.v === "1";
        if (want !== isPublic(id)) { S.meta.publicChars = want ? [...(S.meta.publicChars || []), id] : (S.meta.publicChars || []).filter(x => x !== id); saveMeta(); }
        refreshAll(); return;
      }
      case "set-love": {
        const id = el.dataset.char; const v = el.dataset.v; const ch = charById(id); if (!ch || loveOf(id).state === v) return;
        setLove(id, v, false); toast(v === "none" ? `${ch.name}：不是恋人` : `${ch.name}：${LOVE_LABEL[v]}（已写进他的记忆）`); refreshAll(); return;
      }
      case "love-announce": {
        const pg = topPage(); const id = el.dataset.char; const ch = charById(id); if (!pg || !ch) return;
        if (await sheet(`让${ch.name}在微博官宣？会发一条官宣微博${isPublic(id) ? "，还会上热搜" : ""}`, [{ label: "官宣！", value: "yes" }]) !== "yes") return;
        announceLove(pg, id); return;
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
      case "alt-cover": {
        const id = el.dataset.char; const a = calt(id); if (!a) return;
        try {
          const [ref] = await pickImages(1, 1280); if (!ref) return;
          if (a.coverRef) api.media.delete({ ref: a.coverRef }).catch(() => {});
          a.coverRef = ref; saveCalts(); toast("已更换"); refreshAll();
        } catch (err) { toast("上传失败"); }
        return;
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
        if (S.me.coverRef) { api.media.delete({ ref: S.me.coverRef }).catch(() => {}); S.me.coverRef = null; }
        S.me.cover = +el.dataset.idx; saveMeta(); const pg = topPage(); pg.render(pg); hydrateImages(pg.el); return;
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
          if (S.me[key]) api.media.delete({ ref: S.me[key] }).catch(() => {});
          S.me[key] = stored.ref; saveMeta();
          const pg = topPage(); pg.render(pg); hydrateImages(pg.el); toast("已更换");
        } catch (err) { toast("上传失败"); }
        return;
      }
      case "reset-avatar": {
        if (S.me.avatarRef) api.media.delete({ ref: S.me.avatarRef }).catch(() => {});
        S.me.avatarRef = null; saveMeta(); const pg = topPage(); pg.render(pg); hydrateImages(pg.el); return;
      }
      case "save-me": {
        const pg = topPage();
        const nick = $("#f-nick", pg.el).value.trim();
        if (isAlt() && !nick) { toast("给小号起个名字吧"); return; }
        if (isAlt() && nick === S.meta.nickname) { toast("小号不能和大号同名"); return; }
        const isNew = isAlt() && !S.alt.nickname;
        S.me.nickname = nick || S.me.nickname; if (isNew) S.meta.acct = "alt";
        S.me.bio = $("#f-bio", pg.el).value.trim(); S.me.ip = $("#f-ip", pg.el).value.trim();
        S.me.device = $("#f-dev", pg.el).value.trim(); S.me.vip = $("#f-vip", pg.el).checked; if (!isAlt()) S.meta.publicFigure = $("#f-pub", pg.el).checked;
        S.meta.city = { q: $("#f-city", pg.el).value.trim(), name: $("#f-cityname", pg.el).value.trim() };
        saveMeta(); toast(isNew ? "小号注册好啦，现在登录的是小号" : "已保存"); closePage(); return;
      }
      case "profile-tab": topPage().setTab(el.dataset.tab); return;
      case "char-more": ensureCharProfile(el.dataset.char, true); return;
      case "compose": openCompose(null); return;
      case "hot-refresh": refreshHot(); return;
      case "open-hot-all": openHotAll(); return;
      case "open-notes": openNotes(el.dataset.type); return;
      case "open-likers": { const p = findPost(el.dataset.post); if (p) openLikers(p); return; }
      case "open-strangers": openStrangers(); return;
      case "open-thread": openThread(el.dataset.key); return;
      case "open-dm": {
        const peer = el.dataset.char ? { type: "char", charId: el.dataset.char } : { type: "npc", name: el.dataset.name };
        const t = getThread(peer); saveThread(t); openThread(t); return;
      }
      case "dm-msg": {
        const pg = topPage(); const th = pg && S.threads.find(x => x.key === pg.thread); if (!th) return;
        const m = th.messages.find(x => x.id === el.dataset.id); if (!m) return;
        const v = await sheet("", [{ label: th.peer.type === "char" || altOpen(altOwner(th.peer.name)) ? "删除这条（相关记忆一起删）" : "删除这条", value: "del", danger: true }]);
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
        if (dmTimers.has(th.key)) { scheduleDmReply(th.key, true); return; }
        const lastMine = [...th.messages].reverse().find(m => m.from === "me");
        replyDm(th, lastMine || null); return;
      }
      case "thread-menu": {
        const pg = topPage(); const th = pg && S.threads.find(x => x.key === pg.thread); if (!th) return;
        const choice = await sheet("", th.peer.type === "char" || altOpen(altOwner(th.peer.name))
          ? [{ label: "只删聊天记录（他还记得）", value: "del", danger: true }, { label: "删除聊天记录和相关记忆", value: "delmem", danger: true }]
          : [{ label: "删除对话", value: "del", danger: true }]);
        if (choice === "delmem") forget(th.messages.flatMap(m => m.memEvents || []));
        if (choice === "del" || choice === "delmem") { S.threads = S.threads.filter(x => x !== th); try { await api.db.delete(COL.dms, th.id); } catch (e) { /* ignore */ } closePage(); refreshMsgViews(); }
        return;
      }
      case "npc-gen": { const pg = topPage(); if (pg && pg.npc) genNpcProfile(pg); return; }
      case "char-alt": charAltMenu(el.dataset.char); return;
      case "out-alt": outAlt(el.dataset.char); return;
      case "save-alt": saveEditAlt(el.dataset.char); return;
      case "npc-menu": {
        const name = el.dataset.name; const owner = altOwner(name);
        const items = owner && altSeen(owner) ? [{ label: "编辑小号资料", value: "edit" }] : [{ label: "这是谁的小号？", value: "guess" }];
        const v = await sheet("", items);
        if (v === "guess") guessAlt(name);
        if (v === "edit") openEditAlt(owner);
        return;
      }
      case "alt-avatar": case "alt-avatar-reset": {
        const a = calt(el.dataset.char); const info = a && S.npcs.map[a.nick]; if (!info) return;
        if (act === "alt-avatar-reset") { if (info.avatarRef) api.media.delete({ ref: info.avatarRef }).catch(() => {}); delete info.avatarRef; }
        else { try { const [ref] = await pickImages(1, 400); if (!ref) return; if (info.avatarRef) api.media.delete({ ref: info.avatarRef }).catch(() => {}); info.avatarRef = ref; } catch (err) { toast("上传失败"); return; } }
        saveNpcs(); refreshAll(); return;
      }
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
        const v = await inputSheet("所在位置", { value: pg.draft.location || "", placeholder: "如 上海·外滩", ok: "好" });
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
    try { // 从聊天里的分享卡片点进来：直接打开那条微博
      const lc = api.app && api.app.getLaunchContext ? await api.app.getLaunchContext() : null;
      if (lc && lc.sceneTag === "weibo_share" && lc.sceneId) {
        if (S.posts.some(p => p.id === lc.sceneId)) openDetail(lc.sceneId); else toast("这条微博已经被删除了");
      }
    } catch (e) { console.error(e); }
  }
  boot();
})();
