/* QQ2008 · 小手机自定义 APP：仿 2008 年的 QQ。两个号——2008 号里是 2008 年的人（两边差 18 年、同月同日同一时刻），2026 号里是现在的 char */
(function () {
  "use strict";
  const api = window.AiPhone || window.AiPhoneApp;
  const VERSION = "/*__VERSION__*/";
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const TS = () => window.__TIME_SCALE || 1; // 测试页用来把等待时间缩短
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  // ───────────────────────── 两个号、两个年代 ─────────────────────────
  const ACCTS = { a08: { year: 2008, gap: 18, label: "2008" }, a26: { year: 2026, gap: 0, label: "2026" } };
  const thereDate = (acct, d = new Date()) => { const t = new Date(d); t.setFullYear(t.getFullYear() - ACCTS[acct].gap); return t; };
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hms = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const WEEK = "日一二三四五六";
  /** 访客、留言那种短时间：刚刚 / x分钟前 / x小时前 / 昨天 / 月-日 */
  function ago(acct, iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000; const t = thereDate(acct, new Date(iso));
    if (s < 120) return "刚刚"; if (s < 3600) return `${Math.floor(s / 60)}分钟前`; if (s < 86400) return `${Math.floor(s / 3600)}小时前`; if (s < 172800) return "昨天";
    return `${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }

  // ───────────────────────── 年代规矩（照请回答2008 的，短信那几条换成 QQ 的） ─────────────────────────
  const thereText = (acct, d) => { const t = thereDate(acct, d || new Date()); return `${t.getFullYear()}/${pad(t.getMonth() + 1)}/${pad(t.getDate())} 周${WEEK[t.getDay()]} ${hm(t)}`; };
  const ERA_RULE = (acct, d) => acct === "a08" ? `【QQ · 2008】
- 你那边现在是 ${thereText(acct, d)}。你的日子和用户同步往前走：用户过一天，你也过一天。
- 你只知道你那边今天以前发生的事。以后的事你一概不知道，不会说出来，也不会碰巧说中。
- 你身边的一切都属于你那边的年份：电脑、手机、上网方式、物价、流行的歌和剧、网络用语。那一年还没有的东西，你没见过也没听说过。
- 如果用户提到自己来自 2026 年，按你的人设反应：可以不信、好奇、惊讶、怀疑、激动等等，依照人设决定。用户提到你没听过的东西也一样。` : `【QQ】
- 现在是 ${thereText(acct, d)}。`;
  const COMMON_RULE = `- 像真人聊天：不写旁白、动作和心理描写。
- 事情多大情绪就多大，不放大、不戏剧化。禁止无缘无故贬低、嘲讽、阴阳、吐槽用户。`;

  // 未来的东西：每个词标上出现的年月，他那边到了才算有（只管 2008 号）
  const FUTURE = [["微博", "2009-08"], ["饿了么", "2009-04"], ["B站", "2009-06"], ["哔哩哔哩", "2010-01"], ["英雄联盟", "2009-10"], ["美团", "2010-03"], ["小米手机", "2011-08"], ["iPad", "2010-04"],
    ["微信", "2011-01"], ["知乎", "2011-01"], ["朋友圈", "2012-04"], ["滴滴", "2012-09"], ["打车软件", "2012-06"], ["快手", "2012-11"], ["表情包", "2012-01"], ["小红书", "2013-06"], ["余额宝", "2013-06"],
    ["微信支付", "2013-08"], ["扫码", "2013-06"], ["二维码支付", "2014-01"], ["4G", "2013-12"], ["Apple Watch", "2014-09"], ["拼多多", "2015-09"], ["王者荣耀", "2015-11"], ["共享单车", "2016-01"], ["摩拜", "2016-04"],
    ["抖音", "2016-09"], ["直播带货", "2016-05"], ["短视频", "2013-09"], ["刷脸", "2017-09"], ["5G", "2019-06"], ["健康码", "2020-02"], ["新冠", "2020-01"], ["原神", "2020-09"], ["元宇宙", "2021-10"], ["ChatGPT", "2022-11"], ["AI 聊天", "2022-11"], ["QQ农场", "2009-01"], ["开心网", "2008-03"]];
  const futureIn = (acct, text) => { if (acct !== "a08") return []; const t = thereDate(acct); const now = `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; return FUTURE.filter(([w, at]) => at > now && String(text || "").toLowerCase().includes(w.toLowerCase())).map(x => x[0]); };

  // ───────────────────────── 经典黄脸表情（自己画的，/名字） ─────────────────────────
  // [名字, 眼睛, 嘴, 附加]
  const FACES = [["微笑", "dot", "smile"], ["撇嘴", "dot", "pout"], ["色", "heart", "open"], ["发呆", "big", "o"], ["得意", "cool", "smirk"], ["流泪", "dot", "frown", "tear"], ["害羞", "happy", "smile", "blush"], ["闭嘴", "dot", "zip"],
    ["睡", "line", "o", "zzz"], ["大哭", "happyDown", "cry", "tears"], ["尴尬", "dot", "flat", "sweat"], ["发怒", "angry", "frown", "vein"], ["调皮", "wink", "tongue"], ["呲牙", "happy", "grin"], ["惊讶", "big", "bigO"], ["难过", "sad", "frown"],
    ["酷", "cool", "flat"], ["冷汗", "dot", "wavy", "sweat"], ["抓狂", "x", "bigO", "vein"], ["偷笑", "happy", "cover"], ["可爱", "sparkle", "smile", "blush"], ["白眼", "roll", "flat"], ["傲慢", "half", "smirk"], ["困", "half", "o"],
    ["憨笑", "happy", "open", "blush"], ["疑问", "dot", "flat", "q"], ["嘘", "dot", "shh"], ["晕", "spiral", "wavy"], ["衰", "sad", "wavy", "gloom"], ["再见", "happy", "smile", "wave"], ["坏笑", "half", "grin"], ["委屈", "sad", "pout", "tear"],
    ["亲亲", "happy", "kiss", "blush"], ["可怜", "sparkle", "pout"], ["爱心", "heart", "smile", "heartx"], ["鄙视", "half", "pout"]];
  const FACE_NAMES = FACES.map(f => f[0]);
  const faceCache = {};
  function faceSvg(name, size = 20) {
    const k = name + size; if (faceCache[k]) return faceCache[k];
    const f = FACES.find(x => x[0] === name); if (!f) return esc(`/${name}`);
    const [, eye, mouth, extra] = f; const S = "#3a2a00";
    const eyes = {
      dot: `<ellipse cx="7.3" cy="8.6" rx="1.3" ry="1.8" fill="${S}"/><ellipse cx="12.7" cy="8.6" rx="1.3" ry="1.8" fill="${S}"/>`,
      big: `<circle cx="7.2" cy="8.4" r="2.4" fill="#fff" stroke="${S}" stroke-width=".8"/><circle cx="12.8" cy="8.4" r="2.4" fill="#fff" stroke="${S}" stroke-width=".8"/><circle cx="7.2" cy="8.6" r="1" fill="${S}"/><circle cx="12.8" cy="8.6" r="1" fill="${S}"/>`,
      happy: `<path d="M5.6 9 Q7.3 6.6 9 9 M11 9 Q12.7 6.6 14.4 9" stroke="${S}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      happyDown: `<path d="M5.6 7.6 Q7.3 10 9 7.6 M11 7.6 Q12.7 10 14.4 7.6" stroke="${S}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      line: `<path d="M5.8 8.8h3M11.2 8.8h3" stroke="${S}" stroke-width="1.2" stroke-linecap="round"/>`,
      heart: `<path d="M7.3 10.4 5.4 8.5a1.1 1.1 0 0 1 1.9-1.3 1.1 1.1 0 0 1 1.9 1.3z M12.7 10.4 10.8 8.5a1.1 1.1 0 0 1 1.9-1.3 1.1 1.1 0 0 1 1.9 1.3z" fill="#e8262a"/>`,
      cool: `<path d="M4.4 7.4h11.2v1.4c0 1.4-1 2.3-2.4 2.3s-2.3-.9-2.6-2.1h-1.2c-.3 1.2-1.2 2.1-2.6 2.1s-2.4-.9-2.4-2.3z" fill="#1d1d1d"/>`,
      wink: `<ellipse cx="7.3" cy="8.6" rx="1.3" ry="1.8" fill="${S}"/><path d="M11 9 Q12.7 6.8 14.4 9" stroke="${S}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      angry: `<path d="M5.4 6.6 9 8.2M14.6 6.6 11 8.2" stroke="${S}" stroke-width="1.2" stroke-linecap="round"/><circle cx="7.4" cy="9.4" r="1.1" fill="${S}"/><circle cx="12.6" cy="9.4" r="1.1" fill="${S}"/>`,
      sad: `<path d="M5.6 7.6 8.8 6.8M14.4 7.6 11.2 6.8" stroke="${S}" stroke-width="1" stroke-linecap="round"/><circle cx="7.3" cy="9.2" r="1.1" fill="${S}"/><circle cx="12.7" cy="9.2" r="1.1" fill="${S}"/>`,
      x: `<path d="M5.8 7.2l2.8 2.8M8.6 7.2 5.8 10M11.4 7.2l2.8 2.8M14.2 7.2 11.4 10" stroke="${S}" stroke-width="1.1" stroke-linecap="round"/>`,
      sparkle: `<circle cx="7.3" cy="8.6" r="2" fill="${S}"/><circle cx="12.7" cy="8.6" r="2" fill="${S}"/><circle cx="7.9" cy="7.9" r=".7" fill="#fff"/><circle cx="13.3" cy="7.9" r=".7" fill="#fff"/>`,
      roll: `<circle cx="7.3" cy="8.6" r="2" fill="#fff" stroke="${S}" stroke-width=".7"/><circle cx="12.7" cy="8.6" r="2" fill="#fff" stroke="${S}" stroke-width=".7"/><circle cx="7.6" cy="7.2" r=".9" fill="${S}"/><circle cx="13" cy="7.2" r=".9" fill="${S}"/>`,
      half: `<path d="M5.6 8.4h3.4M11 8.4h3.4" stroke="${S}" stroke-width="1.1" stroke-linecap="round"/><path d="M6.2 8.6a1.2 1 0 0 0 2.2 0M11.6 8.6a1.2 1 0 0 0 2.2 0" fill="${S}"/>`,
      spiral: `<path d="M7.3 8.6m-.6 0a.6.6 0 1 1 1.2 0 1.2 1.2 0 1 1-2.4 0 1.8 1.8 0 1 1 3.6 0M12.7 8.6m-.6 0a.6.6 0 1 1 1.2 0 1.2 1.2 0 1 1-2.4 0 1.8 1.8 0 1 1 3.6 0" stroke="${S}" stroke-width=".7" fill="none"/>`,
    }[eye];
    const mouths = {
      smile: `<path d="M6.4 12.4 Q10 15.4 13.6 12.4" stroke="${S}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      pout: `<path d="M7.4 14 Q10 12.4 12.6 14" stroke="${S}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      frown: `<path d="M6.8 14.4 Q10 11.8 13.2 14.4" stroke="${S}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      open: `<path d="M6.2 12.2 Q10 12.8 13.8 12.2 Q13 16 10 16 Q7 16 6.2 12.2z" fill="#7a2a12"/><path d="M7.6 14.6 Q10 13.6 12.4 14.6 Q11.4 15.8 10 15.8 Q8.6 15.8 7.6 14.6z" fill="#ff7d7d"/>`,
      o: `<ellipse cx="10" cy="13.6" rx="1.3" ry="1.5" fill="${S}"/>`,
      bigO: `<ellipse cx="10" cy="13.8" rx="2.2" ry="2.5" fill="#7a2a12"/>`,
      smirk: `<path d="M7.2 13.4 Q10.4 14.6 13.4 12.2" stroke="${S}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      zip: `<path d="M6.6 13.4h6.8" stroke="${S}" stroke-width="1.2" stroke-linecap="round"/><path d="M7.6 12.6v1.6M9 12.6v1.6M10.4 12.6v1.6M11.8 12.6v1.6" stroke="${S}" stroke-width=".6"/>`,
      cry: `<path d="M6.4 15 Q10 10.6 13.6 15z" fill="#7a2a12"/>`,
      flat: `<path d="M7.2 13.4h5.6" stroke="${S}" stroke-width="1.2" stroke-linecap="round"/>`,
      tongue: `<path d="M6.6 12.4 Q10 14.6 13.4 12.4" stroke="${S}" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M9 13.4h2.6v1.4a1.3 1.3 0 0 1-2.6 0z" fill="#ff6b6b"/>`,
      grin: `<path d="M5.8 12 H14.2 Q13.6 15.8 10 15.8 Q6.4 15.8 5.8 12z" fill="#fff" stroke="${S}" stroke-width=".9"/><path d="M6.2 13.4h7.6" stroke="${S}" stroke-width=".5"/>`,
      wavy: `<path d="M6.6 13.6 Q7.8 12.4 9 13.6 T11.4 13.6 T13.8 13.6" stroke="${S}" stroke-width="1" fill="none"/>`,
      cover: `<path d="M6.4 12.6 Q10 15 13.6 12.6" stroke="${S}" stroke-width="1.1" fill="none"/><ellipse cx="13.4" cy="14.4" rx="3" ry="2.2" fill="#f5c542" stroke="#d99a00" stroke-width=".6"/>`,
      shh: `<ellipse cx="10" cy="13.6" rx="1.2" ry="1" fill="${S}"/><rect x="9.4" y="10.6" width="1.4" height="6" rx=".7" fill="#f5c542" stroke="#d99a00" stroke-width=".5"/>`,
      kiss: `<path d="M9.4 12.4 Q11.4 13 9.8 13.6 Q11.6 14.2 9.4 14.8" stroke="${S}" stroke-width="1" fill="none" stroke-linecap="round"/>`,
    }[mouth];
    const extras = {
      tear: `<path d="M6.4 10.6 q-.9 1.6 0 2.2 q.9-.6 0-2.2z" fill="#4aa8ff"/>`,
      tears: `<path d="M5.2 9.6v5M14.8 9.6v5" stroke="#4aa8ff" stroke-width="1.4" stroke-linecap="round"/>`,
      blush: `<ellipse cx="5.4" cy="11.6" rx="1.4" ry=".8" fill="#ff8a8a" opacity=".8"/><ellipse cx="14.6" cy="11.6" rx="1.4" ry=".8" fill="#ff8a8a" opacity=".8"/>`,
      sweat: `<path d="M15.4 3.8 q-1.3 2.2 0 3 q1.3-.8 0-3z" fill="#7cc4ff"/>`,
      zzz: `<text x="13.6" y="5.6" font-size="5" font-weight="bold" fill="#3a6fd8">z</text>`,
      vein: `<path d="M13.4 3.2l.8 1.6 1.6-.8M15.8 5.4l-1.6.8.8 1.6" stroke="#e8262a" stroke-width=".9" fill="none"/>`,
      q: `<text x="14.2" y="6" font-size="6.5" font-weight="bold" fill="#3a6fd8">?</text>`,
      gloom: `<path d="M5.6 3.6v3M8 3v3M10.4 3v3" stroke="#6b5fa8" stroke-width=".8" opacity=".8"/>`,
      wave: `<ellipse cx="16.2" cy="12.4" rx="2" ry="2.6" fill="#f5c542" stroke="#d99a00" stroke-width=".6"/>`,
      heartx: `<path d="M16 6.2 14.6 4.8a.8.8 0 0 1 1.4-1 .8.8 0 0 1 1.4 1z" fill="#e8262a"/>`,
    }[extra] || "";
    const svg = `<svg class="qf" width="${size}" height="${size}" viewBox="0 0 20 20"><defs><radialGradient id="qfg" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff3a0"/><stop offset=".6" stop-color="#ffd23a"/><stop offset="1" stop-color="#f2a900"/></radialGradient></defs><circle cx="10" cy="10" r="8.6" fill="url(#qfg)" stroke="#d48c00" stroke-width=".8"/>${eyes}${mouths}${extras}</svg>`;
    return (faceCache[k] = svg);
  }
  /** 一段文字：转义后把 /表情名 换成小黄脸（长名字先换） */
  const FACE_RE = new RegExp(`/(${[...FACE_NAMES].sort((a, b) => b.length - a.length).join("|")})`, "g");
  const richText = t => esc(t).replace(FACE_RE, (_, n) => faceSvg(n, 20));

  // ───────────────────────── 企鹅（照她发的 QQ2011 登录图画的：黑身白肚、一只眼眨、大黄嘴、红围巾） ─────────────────────────
  const PENG_IMG = "/*__PENGUIN__*/"; // 她发的那张企鹅（白底抠掉），构建时内联
  const PENGUIN = (w, h) => `<img class="peng" src="${PENG_IMG}" alt="" style="width:${w}px;height:${h}px;object-fit:contain">`;

  // ───────────────────────── 状态和存档 ─────────────────────────
  // meta：{ accts: { a08|a26: { nick, qq, sig, avatarRef, status, zone } }, cur, last, auto, font, music: [{id,name,ref}], queue, sound }
  // friends：{ id: 号_charId, acct, charId, remark, sig, lv, sleep:[入睡,起床]（小时，入睡可以超过 24）, offUntil, zone }
  // chats：{ id: friend id, msgs: [{ id, from: me|him|sys, text, at, color, bold, shake, read }] }
  // zone：{ name, sig, bgm: [歌的 id]（她的）或 bgmName（他挂的歌名）+ bgm, posts: [{id,text,at,comments:[{who,text,at}]}], board: [{id,who,text,at,reply,replyAt}], visitors: [{who,at}] }
  const S = { view: "login", fid: null, zoneOf: null, zoneTab: "home", tab: "friends", search: "", collapsed: {}, chars: [], friends: [], chats: [], profile: {},
    meta: { id: "meta", accts: {}, cur: null, last: "a08", auto: false, font: { color: "#000000", bold: false }, music: [], queue: [], sound: true } };
  const COL = { meta: "meta", friends: "friends", chats: "chats" };
  async function dbList(c) { try { return (await api.db.list(c, { limit: 500 })) || []; } catch (e) { console.warn(e); return []; } }
  async function dbPut(c, row) { try { const u = await api.db.update(c, row.id, row); if (u) return; } catch (e) { /* 没有就建 */ } try { await api.db.create(c, row); } catch (e) { console.warn(e); } }
  async function dbDel(c, id) { try { await api.db.delete(c, id); } catch (e) { console.warn(e); } }
  let metaT = null;
  function saveMeta() { clearTimeout(metaT); metaT = setTimeout(() => dbPut(COL.meta, S.meta), 200); }
  const saveFriend = f => dbPut(COL.friends, f);
  const saveChat = c => dbPut(COL.chats, c);
  const emptyZone = name => ({ name, sig: "", posts: [], board: [], visitors: [] });
  async function loadAll() {
    const [metas, friends, chats] = await Promise.all([dbList(COL.meta), dbList(COL.friends), dbList(COL.chats)]);
    const m = metas.find(r => r.id === "meta"); if (m) S.meta = { ...S.meta, ...m };
    for (const k of ["queue", "music"]) if (!Array.isArray(S.meta[k])) S.meta[k] = [];
    S.friends = friends; S.chats = chats.map(c => ({ ...c, msgs: c.msgs || [] }));
    S.chars = (await api.characters.list().catch(() => [])) || [];
    S.profile = (await api.user.getProfile().catch(() => null)) || {};
    const nick = S.profile.name || "我";
    if (!S.meta.accts.a08) S.meta.accts.a08 = { nick, qq: String(rand(10000, 999999999)).padStart(5, "1").slice(0, rand(6, 9)), sig: "", status: "online", zone: emptyZone(`${nick}的空间`), since: new Date().toISOString() };
    if (!S.meta.accts.a26) S.meta.accts.a26 = { nick, qq: String(rand(1000000000, 3999999999)), sig: "", status: "online", zone: emptyZone(`${nick}的空间`), since: new Date().toISOString() };
    saveMeta();
  }
  const A = () => S.meta.accts[S.meta.cur];
  const charOf = id => S.chars.find(c => c.id === id) || {};
  const friendById = id => S.friends.find(f => f.id === id);
  const myFriends = () => S.friends.filter(f => f.acct === S.meta.cur && !f.pending);
  const nameOf = f => f.remark || charOf(f.charId).name || "好友";
  const chatOf = fid => { let c = S.chats.find(x => x.id === fid); if (!c) { c = { id: fid, msgs: [] }; S.chats.push(c); } return c; };
  const unreadOf = fid => chatOf(fid).msgs.filter(m => m.from === "him" && !m.read).length;
  /** QQ 等级：太阳 16 级、月亮 4 级、星星 1 级。2008 号从 18 级起（像用了好几年），每用一天涨一级 */
  const levelOf = acct => { const a = S.meta.accts[acct]; return (acct === "a08" ? 18 : 12) + Math.floor((Date.now() - new Date(a.since).getTime()) / 864e5); };
  const lvIcons = lv => { let s = ""; const sun = Math.floor(lv / 16), moon = Math.floor((lv % 16) / 4), star = lv % 4;
    for (let i = 0; i < sun; i++) s += `<i class="sun"></i>`; for (let i = 0; i < moon; i++) s += `<i class="moon"></i>`; for (let i = 0; i < star; i++) s += `<i class="star">★</i>`; return s; };

  // ───────────────────────── 在线状态：他会睡觉、离开、突然下线 ─────────────────────────
  // 入睡 23:00～01:30、起床 06:30～08:00（按人固定）；白天每个小时有 15% 是「离开」；===下线=== 以后 offUntil 之前不在
  function statusOf(f, d = new Date()) {
    if (window.__FORCE_STATUS) return window.__FORCE_STATUS; // 测试页用
    const t = d.getTime(); if (f.offUntil && t < new Date(f.offUntil).getTime()) return "offline";
    const [s, e] = f.sleep || [24, 7]; const h = d.getHours() + d.getMinutes() / 60;
    const asleep = s >= 24 ? (h >= s - 24 && h < e) : (h >= s || h < e); if (asleep) return "offline";
    if (hash(`${f.id}${d.toDateString()}${d.getHours()}`) % 100 < 15) return "away";
    return "online";
  }
  /** 他下一次上线的时间（往后一格格找，最多一天） */
  function nextOnline(f) { const now = Date.now(); for (let m = 10; m <= 1440; m += 10) { const d = new Date(now + m * 60e3); if (statusOf(f, d) !== "offline") return d; } return new Date(now + 3600e3); }
  const STATUS_NAME = { online: "在线", away: "离开", offline: "离线", hidden: "隐身" };
  const statusColor = s => ({ online: "#2c8a2c", away: "#d17a00" }[s] || "#888");

  // ───────────────────────── 声音：上线咳嗽、来消息滴滴（WebAudio 现场合成） ─────────────────────────
  let actx = null;
  const ac = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) { actx = null; } return actx; };
  function beep(freq, at, dur, vol = 0.18, type = "sine") { const c = ac(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, c.currentTime + at); g.gain.linearRampToValueAtTime(vol, c.currentTime + at + 0.01); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + at + dur); o.connect(g).connect(c.destination); o.start(c.currentTime + at); o.stop(c.currentTime + at + dur + 0.05); }
  function cough(at) { const c = ac(); if (!c) return; const len = 0.16, buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const x = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 2) * (x < 0.04 ? x / 0.04 : 1); }
    const s = c.createBufferSource(); s.buffer = buf; const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 650; bp.Q.value = 1.2; const g = c.createGain(); g.gain.value = 0.9;
    s.connect(bp).connect(g).connect(c.destination); s.start(c.currentTime + at); }
  const SND = {
    msg: () => { beep(1318, 0, 0.09); beep(1318, 0.13, 0.11); },
    online: () => { cough(0); cough(0.24); },
    shake: () => { for (let i = 0; i < 6; i++) beep(i % 2 ? 180 : 140, i * 0.07, 0.07, 0.12, "square"); },
  };
  const play = k => { if (S.meta.sound !== false) try { SND[k](); } catch (e) { /* 没声音就算了 */ } };
  function shakeScreen() { const el = $("#app"); el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); play("shake"); }

  // ───────────────────────── 媒体（头像、歌） ─────────────────────────
  const mediaCache = new Map();
  async function mediaUrl(ref) { if (!ref) return ""; if (mediaCache.has(ref)) return mediaCache.get(ref); try { const r = await api.media.get({ ref }); const u = (r && r.dataUrl) || ""; if (u) mediaCache.set(ref, u); return u; } catch (e) { return ""; } }
  /** 页面里 <img data-ref> 画完以后补上图 */
  function hydrate(root) { (root || document).querySelectorAll("img[data-ref]").forEach(async img => { const u = await mediaUrl(img.dataset.ref); if (u) img.src = u; }); }
  const GRADS = ["#9ad0ff,#4b8fe0", "#ffe08a,#f2a33a", "#b6e3b0,#4fae6a", "#d6c4ff,#8b6ee0", "#ffb7a8,#e0604b", "#ffc9de,#ff8fb7", "#a8e6e0,#3aa89c"];
  const gradFor = seed => `linear-gradient(135deg,${GRADS[hash(seed) % GRADS.length]})`;
  /** 头像：她的（上传的 / 小手机资料里的）、char 的（档案库头像）、路人（渐变方块） */
  function avatar(who, size, gray) {
    const st = `width:${size}px;height:${size}px`; const cls = `av${gray ? " gray" : ""}`;
    if (who.ref) return `<div class="${cls}" style="${st}"><img data-ref="${esc(who.ref)}" alt="" style="background:${gradFor(who.seed || "me")}"></div>`;
    if (who.url) return `<div class="${cls}" style="${st}"><img src="${esc(who.url)}" alt="" onerror="this.remove()" style="background:${gradFor(who.seed || "x")}"></div>`;
    return `<div class="${cls}" style="${st}"><i style="background:${gradFor(who.seed || who.name || "x")}"></i></div>`;
  }
  const myAv = size => avatar({ ref: A().avatarRef, url: A().avatarRef ? "" : S.profile.avatarUrl, seed: "me" }, size);
  const fAv = (f, size, gray) => avatar({ ref: f.avatarRef, url: f.avatarRef ? "" : charOf(f.charId).avatar, seed: f.charId, name: nameOf(f) }, size, gray);
  /** 空间里出现的人：me 是她，f:好友 id 是 char，别的字符串是他身边的人（只有昵称） */
  const whoName = w => w === "me" ? A().nick : w && w.startsWith("f:") ? nameOf(friendById(w.slice(2)) || {}) : w;
  const whoAv = (w, size) => w === "me" ? myAv(size) : w && w.startsWith("f:") ? fAv(friendById(w.slice(2)) || {}, size) : avatar({ seed: w, name: w }, size);
  /** 他身边的人的赞和评论是排好时间的，到点才显示 */
  const shown = x => !x.at || new Date(x.at) <= new Date();
  async function pickFile(accept) { const r = await api.media.pick({ accept }); return r && (r.file || (r.files || [])[0]); }
  async function compressImage(dataUrl, max = 256) {
    return new Promise(res => { const i = new Image(); i.onload = () => { const k = Math.min(1, max / Math.max(i.width, i.height)); const c = document.createElement("canvas"); c.width = Math.round(i.width * k); c.height = Math.round(i.height * k); c.getContext("2d").drawImage(i, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.85)); }; i.onerror = () => res(dataUrl); i.src = dataUrl; });
  }
  // ───────────────────────── 照片：她发的（2008 号做旧）、他发的（只给画面，她点了才生成） ─────────────────────────
  // ph = { ref（有图才有）, desc（他拍的画面）, seen（她的照片 AI 看过的样子） }
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  /** 做旧（照请回答2008）：缩到 320 宽、发灰偏黄绿、暗部发闷、高光过曝、噪点、四角发暗、压两遍 JPEG；有时右下角印那边的日期 */
  async function oldify(dataUrl, acct, at) {
    const img = await loadImg(dataUrl);
    const k = 320 / Math.max(img.width, img.height), w = Math.round(img.width * k), h = Math.round(img.height * k);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d");
    g.filter = "blur(0.6px)"; g.drawImage(img, 0, 0, w, h); g.filter = "none";
    const d = g.getImageData(0, 0, w, h), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const y = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11, n = (Math.random() - 0.5) * 26;
      const f = c => { let v = c * 0.7 + y * 0.3; v = 22 + v * 0.86; if (v > 215) v = 215 + (v - 215) * 2; return Math.max(0, Math.min(255, v + n)); };
      px[i] = f(px[i] * 1.03); px[i + 1] = f(px[i + 1] * 1.05); px[i + 2] = f(px[i + 2] * 0.86);
    }
    g.putImageData(d, 0, 0);
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.38)"); g.fillStyle = vg; g.fillRect(0, 0, w, h);
    if (at && Math.random() < 0.4) { const t = thereDate(acct, new Date(at)); g.font = "bold 13px monospace"; g.fillStyle = "#ff9a2e"; g.textAlign = "right"; g.fillText(`'${String(t.getFullYear()).slice(2)} ${pad(t.getMonth() + 1)} ${pad(t.getDate())}`, w - 8, h - 8); }
    const once = await loadImg(cv.toDataURL("image/jpeg", 0.35)); g.drawImage(once, 0, 0);
    return cv.toDataURL("image/jpeg", 0.55);
  }
  /** 2008 号的照片做旧，2026 号的只压缩 */
  const photoize = (acct, dataUrl, at) => acct === "a08" ? oldify(dataUrl, acct, at) : compressImage(dataUrl, 1080);
  const SELFIE = /自拍|合照|合影|镜子|对镜|本人|我自己|我的脸/;
  /** 写给 AI 看：她的照片用 AI 看过的样子，他的用画面描述 */
  const photoText = (ph, hers) => ph ? (hers ? `[照片${ph.seen ? `：${ph.seen}` : ""}]` : `[照片：${ph.desc || "一张照片"}]`) : "";
  async function pickPhotoFor(acct) {
    try {
      const f = await pickFile("image/*"); if (!f || !f.dataUrl) return null;
      const d = await photoize(acct, f.dataUrl, new Date().toISOString()); const st = await api.media.put({ dataUrl: d }); mediaCache.set(st.ref, d); return { ref: st.ref };
    } catch (e) { toast("照片没选上"); return null; }
  }
  /** 她发的照片：借他的识图看一眼，存成 seen（他回的时候就知道照片里有什么）。每张只看一次 */
  async function seePhoto(f, ph) {
    if (!ph || !ph.ref || ph.seen) return; const url = await mediaUrl(ph.ref); if (!url) return;
    try {
      const r = await api.ai.generate({ characterId: f.charId, appTags: ["nox_qq", "vision"], instruction: "这一轮不扮演任何人，只做一件事：用一两句话客观描述上面这张照片里有什么（人物、物品、场景、文字、光线），不评价、不加戏、不要任何格式，直接输出描述。", appMessages: [{ role: "user", content: "（要描述的照片）", image: url }] });
      const t = String((r && r.text) || "").replace(/^[\s"「]+|[\s"」]+$/g, "").slice(0, 200); if (t) ph.seen = t;
    } catch (e) { logErr(`看照片：${(e && e.message) || e}`); }
  }
  /** 他拍的照片：按画面生成（点了才生成，费生图 API），2008 号再做旧 */
  async function genPhoto(f, ph, at) {
    const prompt = f.acct === "a08" ? `${ph.desc}。2008 年的数码相机或拍照手机随手拍的照片：画面有点糊、有噪点、颜色发灰偏色、构图随意，没有美颜和滤镜，像真实生活里的抓拍，画面里的东西都是 2008 年的样子。` : `${ph.desc}。手机随手拍的照片，像真实生活里的抓拍。`;
    const r = await api.ai.generateImage({ prompt, characterId: f.charId, useReferenceImage: SELFIE.test(ph.desc || ""), timeoutMs: 120000 });
    if (!r || !r.dataUrl) throw new Error("没有拿到图片");
    const d = await photoize(f.acct, r.dataUrl, at); const st = await api.media.put({ dataUrl: d }); mediaCache.set(st.ref, d); ph.ref = st.ref;
  }
  const photoBusy = new Set();
  /** 照片：有图显示图；他发的还没生成就显示画面文字 + 「生成照片」 */
  function photoHtml(ph, loc, key) {
    if (!ph) return "";
    if (ph.ref) return `<div class="pic"><img data-ref="${esc(ph.ref)}" data-act="view-photo" alt=""></div>`;
    return `<div class="pic none"><span>[图片] ${esc(ph.desc || "")}</span><button data-act="gen-photo" ${loc} ${photoBusy.has(key) ? "disabled" : ""}>${photoBusy.has(key) ? "正在接收…" : "生成照片"}</button></div>`;
  }


  // ───────────────────────── 背景音乐：她的歌单（mp3 存进媒体库），空间里挑几首轮着放 ─────────────────────────
  const audio = new Audio(); audio.preload = "auto";
  let bgmList = [], bgmIdx = 0, bgmName = "";
  async function playBgm(ids, startIdx = 0) {
    bgmList = ids.map(id => S.meta.music.find(x => x.id === id)).filter(Boolean); bgmIdx = startIdx;
    if (!bgmList.length) { stopBgm(); return; }
    const song = bgmList[bgmIdx % bgmList.length]; const url = await mediaUrl(song.ref); bgmName = song.name;
    if (!url) { bgmName = `${song.name}（找不到文件）`; renderBgmBar(); return; }
    audio.src = url; audio.play().catch(() => {}); renderBgmBar();
  }
  audio.addEventListener("ended", () => { if (bgmList.length) playBgm(bgmList.map(s => s.id), bgmIdx + 1); });
  function stopBgm() { audio.pause(); bgmList = []; bgmName = ""; }
  function renderBgmBar() { const b = $("#bgmbar"); if (b) b.outerHTML = bgmBarHtml(); const m = $("#minibar"); if (m) m.outerHTML = miniBarHtml(); }
  audio.addEventListener("play", renderBgmBar); audio.addEventListener("pause", renderBgmBar);
  /** 离开空间歌接着放：好友面板和聊天窗口里有个小播放条 */
  const miniBarHtml = () => bgmList.length ? `<div class="minibar" id="minibar"><span>♫</span><div class="marq"><span>${esc(bgmName)}</span></div><button data-act="bgm-toggle">${audio.paused ? "▶" : "▮▮"}</button><button data-act="bgm-next">⏭</button><button data-act="bgm-stop">✕</button></div>` : `<div id="minibar"></div>`;
  function bgmBarHtml() {
    const z = curZone(); const mine = S.zoneOf === "me";
    const name = mine ? (bgmName || (z.bgm && z.bgm.length ? "" : "还没有背景音乐")) : (bgmName || (z.bgmName ? z.bgmName : "没有背景音乐"));
    return `<div class="music" id="bgmbar"><span>♫</span><div class="marq"><span>${bgmName ? "正在播放：" : ""}${esc(name || "点 ▶ 播放")}</span></div>${bgmList.length ? `<button data-act="bgm-toggle">${audio.paused ? "▶" : "▮▮"}</button><button data-act="bgm-next">⏭</button>` : (mine && z.bgm && z.bgm.length) || (!mine && z.bgm && z.bgm.length) ? `<button data-act="bgm-toggle">▶</button>` : ""}<button data-act="bgm-set">${mine ? "换歌" : "配歌"}</button></div>`;
  }

  // ───────────────────────── 皮肤：每套是一整套设计（themes.css 里按 html[data-theme] 写） ─────────────────────────
  const THEMES = [["classic", "经典蓝天", "2008 原版"], ["fzl", "非主流", "黑底蕾丝闪星星"], ["memo", "手账日记", "横格纸和胶带"], ["xp", "Windows XP", "网吧的蓝天绿地"], ["pixel", "像素绿屏", "手机 QQ"], ["dark", "炫酷黑", "磨砂玻璃"], ["fresh", "小清新", "白底和木头"], ["modern", "现代", "现在的 QQ 和 iOS 气泡"]];
  const applyTheme = k => { document.documentElement.dataset.theme = THEMES.some(t => t[0] === k) ? k : "classic"; };

  // ───────────────────────── 画界面 ─────────────────────────
  function render() {
    // 空间里点赞、评论完重画：滚动位置和没发出去的评论别丢
    const zb = $(".zone .zbody"); const keep = S.view === "zone" && zb && zb.dataset.k === `${S.zoneOf}|${S.zoneTab}` ? zb.scrollTop : null;
    const keepIds = ["postin", "bt", "bbody", "bcat", "bpriv", "bbgm"].map(id => [id, ($(`#${id}`) || {}).value]).filter(x => x[1]);
    const drafts = [...document.querySelectorAll(".cmform input")].filter(i => i.value).map(i => [i.dataset.post, i.value, i.dataset.to || "", i.placeholder]);
    const v = V[S.view] || V.login; $("#app").innerHTML = v(); hydrate($("#app"));
    if (keep != null) { const z2 = $(".zone .zbody"); if (z2) z2.scrollTop = keep; }
    for (const [id, v] of keepIds) { const el = $(`#${id}`); if (el) el.value = v; }
    for (const [pid, val, to, ph] of drafts) { const i = $(`.cmform input[data-post="${pid}"]`); if (i) { i.value = val; i.dataset.to = to; i.placeholder = ph; } }
    if (S.view === "chat") { const log = $("#log"); if (log) log.scrollTop = log.scrollHeight; }
  }
  const V = {};
  // 右上角是小手机自己的胶囊按钮：标题栏让开右边，返回键放左边
  const titlebar = (title, back) => `<div class="tbar">${back ? `<button class="bk" data-act="${back}">‹</button>` : ""}${PENGUIN(22, 22)}<span>${esc(title)}</span></div>`;

  V.login = () => {
    const sel = S.meta.last || "a08";
    return `<div class="login">
      ${titlebar("QQ2008 用户登录")}
      <div class="logo">${PENGUIN(120, 118)}<b>QQ2008</b><small>弹指间 心无间</small></div>
      <div class="card">
        <div class="lab">选择要登录的号码</div>
        ${["a08", "a26"].map(k => { const a = S.meta.accts[k]; if (!a) return ""; return `<button class="acc ${sel === k ? "on" : ""}" data-act="pick-acct" data-k="${k}">${avatar({ ref: a.avatarRef, url: a.avatarRef ? "" : S.profile.avatarUrl, seed: "me" }, 40)}<div><b>${esc(a.nick)}</b><small>QQ：${esc(a.qq)}</small></div><span class="yr ${k === "a26" ? "n" : ""}">${ACCTS[k].label}</span></button>`; }).join("")}
        <div class="opt"><label><input type="checkbox" checked disabled> 记住密码</label><label><input type="checkbox" id="auto" ${S.meta.auto ? "checked" : ""}> 自动登录</label></div>
        <button class="go" data-act="login">登　录</button>
        <div class="st">状态：<select id="st0">${["online", "away", "hidden"].map(s => `<option value="${s}" ${S.meta.accts[sel] && S.meta.accts[sel].status === s ? "selected" : ""}>${{ online: "我在线上", away: "离开", hidden: "隐身" }[s]}</option>`).join("")}</select></div>
      </div>
      <div class="tip">· 2008 号里是 2008 年的人<br>· 2026 号里是现在的人<br>· 两个号的好友、空间、留言板都分开</div>
    </div>`;
  };
  V.logging = () => `<div class="login">${titlebar("QQ2008")}<div class="logo">${PENGUIN(120, 118)}<b>正在登录…</b><div class="pbar"><i></i></div></div></div>`;

  V.main = () => {
    const a = A(); const lv = levelOf(S.meta.cur); const fs = myFriends();
    const q = S.search.trim(); const shown = fs.filter(f => !q || nameOf(f).includes(q));
    const order = { online: 0, away: 1, offline: 2 };
    const sorted = [...shown].sort((x, y) => order[statusOf(x)] - order[statusOf(y)] || nameOf(x).localeCompare(nameOf(y)));
    const online = fs.filter(f => statusOf(f) !== "offline").length;
    const recent = [...fs].filter(f => chatOf(f.id).msgs.length).sort((x, y) => (chatOf(y.id).msgs.slice(-1)[0].at).localeCompare(chatOf(x.id).msgs.slice(-1)[0].at));
    const row = f => { const st = statusOf(f); const n = unreadOf(f.id); const last = chatOf(f.id).msgs.filter(m => m.from !== "sys").slice(-1)[0];
      return `<button class="fr ${n ? "blink" : ""}" data-act="open-chat" data-id="${esc(f.id)}">${fAv(f, 34, st === "offline")}<div class="fm"><b>${esc(nameOf(f))}</b>${st !== "offline" ? ` <span style="color:${statusColor(st)}">[${STATUS_NAME[st]}]</span>` : ""}${n ? ` <em>(${n})</em>` : ""}<small>${S.tab === "recent" && last ? richText(last.text || (last.shake ? "[窗口抖动]" : last.photo ? "[图片]" : "")) : esc(f.sig || "")}</small></div>${last ? `<i class="ft">${esc(ago(S.meta.cur, last.at))}</i>` : ""}</button>`; };
    return `<div class="main">
      ${titlebar(`QQ${ACCTS[S.meta.cur].label === "2008" ? "2008" : "2008 · 2026 号"}`)}
      <div class="me">
        <button class="avbtn" data-act="my-avatar">${myAv(50)}</button>
        <div class="mi"><div><b>${esc(a.nick)}</b> <select class="stsel" data-act="status">${["online", "away", "hidden"].map(s => `<option value="${s}" ${a.status === s ? "selected" : ""}>${STATUS_NAME[s]}</option>`).join("")}</select></div>
          <button class="sig" data-act="edit-sig">${a.sig ? richText(a.sig) : `<span class="ph">编辑个性签名</span>`}</button>
          <div class="lv">${lvIcons(lv)}<span>LV ${lv}</span><button class="qsbtn" data-act="open-show" data-who="me">👗 QQ秀${newGift() ? `<i class="dot"></i>` : ""}</button></div></div>
      </div>
      <div class="search"><input id="srch" placeholder="🔍 搜索联系人" value="${esc(S.search)}"></div>
      <div class="tabs"><button class="${S.tab === "friends" ? "on" : ""}" data-act="tab" data-t="friends">联系人</button><button class="${S.tab === "recent" ? "on" : ""}" data-act="tab" data-t="recent">最近联系人</button></div>
      <div class="list">
        ${S.tab === "friends" ? `<button class="grp" data-act="fold">${S.collapsed.f ? "▶" : "▼"} 我的好友 (${online}/${fs.length})</button>
          ${S.collapsed.f ? "" : sorted.map(row).join("") || `<div class="empty">还没有好友<br>点下面的「查找」加一个吧</div>`}` : recent.map(row).join("") || `<div class="empty">还没有聊过天</div>`}
      </div>
      ${miniBarHtml()}
      <div class="bot"><button class="btn" data-act="menu">菜单</button><button class="btn" data-act="find">查找</button><button class="btn" data-act="open-zone" data-who="me">QQ空间</button></div>
    </div>`;
  };

  // 查找：输入他告诉她的 QQ 号 → 选这个号是档案库里的谁 → 写验证信息 → 等他通过
  V.find = () => {
    const waiting = S.friends.filter(f => f.acct === S.meta.cur && f.pending);
    return `<div class="main">${titlebar("查找联系人", "back-main")}
      <div class="findbox"><div class="lab">精确查找</div><div class="frow"><input id="qqno" inputmode="numeric" maxlength="12" placeholder="输入对方的 QQ 号码"><button class="btn s" data-act="search-qq">查找</button></div>
      <p class="findtip">加到「${ACCTS[S.meta.cur].label} 号」里的人，就是活在 ${ACCTS[S.meta.cur].year} 年的人。</p></div>
      ${waiting.length ? `<div class="grp">等待对方验证</div>${waiting.map(f => `<div class="fr">${fAv(f, 34, true)}<div class="fm"><b>${esc(nameOf(f))}</b><small>QQ：${esc(f.qq)} · 验证信息：${esc(f.verify || "")}</small></div></div>`).join("")}` : ""}
    </div>`;
  };

  // 聊天窗口
  V.chat = () => {
    const f = friendById(S.fid); const st = statusOf(f); const c = chatOf(f.id);
    let lastDay = ""; const me = A();
    const lastHim = c.msgs.map(m => m.from).lastIndexOf("him");
    const lines = c.msgs.map((m, idx) => {
      const d = thereDate(S.meta.cur, new Date(m.at)); const day = ymd(d); const sep = day !== lastDay ? `<div class="sys">—— ${day} ——</div>` : ""; lastDay = day;
      if (m.from === "sys") return `${sep}<div class="sys">${esc(m.text)}</div>`;
      const who = m.from === "me" ? me.nick : nameOf(f);
      const body = m.shake ? `<div class="shk">${m.from === "me" ? "您发送了一个窗口抖动。" : `${esc(who)} 给您发送了一个窗口抖动。`}</div>` : `${photoHtml(m.photo, `data-kind="chat" data-fid="${esc(f.id)}" data-mid="${esc(m.id)}"`, m.id)}${m.text || !m.photo ? `<div class="t" style="${m.color ? `color:${m.color};` : ""}${m.bold ? "font-weight:bold;" : ""}">${richText(m.text)}</div>` : ""}`;
      // .mav（头像）和 .mt（时间、已读）平时藏着，「现代」皮肤才露出来
      return `${sep}<div class="m ${m.from === "me" ? "o" : "i"}"><span class="mav">${m.from === "me" ? myAv(40) : fAv(f, 40)}</span><div class="mb2"><div class="h">${esc(who)}　${hms(d)}</div>${body}<div class="mt">${m.from === "me" ? `<span>${idx < lastHim ? "已读" : "送达"}</span><span>${hm(d)}</span>` : `<span>${hm(d)}</span><span>已读</span>`}</div></div></div>`;
    }).join("");
    if (c.msgs.some(m => m.from === "him" && !m.read)) { c.msgs.forEach(m => { m.read = true; }); saveChat(c); }
    const typing = S.meta.queue.some(q => q.fid === f.id && q.kind === "reply" && q.typing);
    return `<div class="chat">
      <div class="ct"><button class="bk" data-act="back-main">‹</button>${fAv(f, 40, st === "offline")}<div class="ctn"><b>${esc(nameOf(f))}</b> <span>[${STATUS_NAME[st]}]</span><small>${esc(f.sig || "")}</small></div><button class="more" data-act="open-zone" data-who="${esc(f.id)}">更多</button></div>
      <div class="tools"><button data-act="nope" data-t="对方没有安装摄像头">📹 视频</button><button data-act="nope" data-t="对方没有麦克风">🎤 语音</button><button data-act="nope" data-t="文件太大了，传了半天还是失败">📁 传文件</button><button data-act="open-zone" data-who="${esc(f.id)}">🌐 空间</button><button data-act="open-show" data-who="${esc(f.id)}">👗 QQ秀</button></div>
      ${miniBarHtml()}
      <div class="log" id="log">${lines || `<div class="sys">${st === "offline" ? `${esc(nameOf(f))} 现在不在线，消息会在他上线后收到` : "开始聊天吧"}</div>`}${typing && st === "online" ? `<div class="sys">对方正在输入…</div>` : ""}${c.msgs.length && c.msgs[c.msgs.length - 1].from === "him" && c.msgs.some(m => m.from === "me") && !S.meta.queue.some(q => q.fid === f.id && q.kind === "reply") ? `<div class="rr"><button data-act="reroll">↻ 重新回复</button></div>` : ""}</div>
      <div class="itools"><button data-act="font"><b style="color:${S.meta.font.color}">A</b> 字体</button><button data-act="faces">${faceSvg("微笑", 16)} 表情</button><button data-act="shake">〰 抖动</button><button data-act="send-photo">📷 图片</button><span class="sp"></span><button data-act="history">消息记录</button></div>
      <div class="pop-wrap" id="popwrap"></div>
      <div class="ibar"><textarea class="inp" id="inp" style="color:${S.meta.font.color};${S.meta.font.bold ? "font-weight:bold" : ""}" placeholder=""></textarea>
      <div class="send"><button class="btn" data-act="back-main">关闭(C)</button><button class="btn s" data-act="send">发送(S)</button></div></div>
    </div>`;
  };

  // QQ 空间（她的 / 他的）
  const curZone = () => S.zoneOf === "me" ? A().zone : (friendById(S.zoneOf) || {}).zone || emptyZone("");
  V.zone = () => {
    const mine = S.zoneOf === "me"; const f = mine ? null : friendById(S.zoneOf); const z = curZone(); const acct = S.meta.cur;
    const ownerName = mine ? A().nick : nameOf(f);
    const visitors = (z.visitors || []).slice(0, mine ? 4 : 8);
    const board = [...(z.board || [])].sort((x, y) => y.at.localeCompare(x.at));
    const posts = [...(z.posts || [])].filter(shown).sort((x, y) => y.at.localeCompare(x.at));
    const own = mine ? "me" : f.id;
    // 日志：列表 / 一篇 / 写（她自己的）。她能看到的：自己的全部，他的「所有人」「仅好友」
    const blogs = [...(z.blogs || [])].filter(shown).sort((x, y) => y.at.localeCompare(x.at));
    const PRIV = { all: "所有人可见", friends: "仅好友可见", self: "仅自己可见" };
    const blogSum = b => esc(b.text.replace(/\s+/g, " ").slice(0, 70));
    const postHtml = (owner, p) => {
      const of = owner === "me" ? null : friendById(owner);
      const likes = (p.likes || []).filter(shown); const iLike = likes.some(l => l.who === "me"); const cms = (p.comments || []).filter(shown).sort((x, y) => (x.at || "").localeCompare(y.at || ""));
      return `<div class="post"><div class="ph">${of ? fAv(of, 26) : myAv(26)}<b>${esc(of ? nameOf(of) : A().nick)}</b><em>${esc(ago(acct, p.at))}</em></div>${p.text ? `<div class="pt">${richText(p.text)}</div>` : ""}${photoHtml(p.photo, `data-kind="post" data-owner="${esc(owner)}" data-post="${esc(p.id)}"`, p.id)}
      <div class="pa"><button class="${iLike ? "on" : ""}" data-act="like" data-owner="${esc(owner)}" data-post="${esc(p.id)}">${iLike ? "已赞" : "赞"}(${likes.length})</button><span>|</span><button data-act="focus-cm" data-post="${esc(p.id)}">评论(${cms.length})</button></div>
      ${likes.length ? `<div class="lk">${[...likes].sort((x, y) => (y.who === "me") - (x.who === "me")).map(l => `<b>${esc(l.who === "me" ? "我" : whoName(l.who))}</b>`).join("、")} 觉得很赞</div>` : ""}
      ${cms.map(cm => `<div class="cm" data-act="reply-cm" data-post="${esc(p.id)}" data-who="${esc(cm.who)}"><b>${esc(whoName(cm.who))}</b>${cm.to ? ` 回复 <b>${esc(whoName(cm.to))}</b>` : ""}：${richText(cm.text)}</div>`).join("")}
      <div class="cmform"><input placeholder="评论…" data-post="${esc(p.id)}"><button data-act="comment" data-owner="${esc(owner)}" data-post="${esc(p.id)}">评论</button></div></div>`;
    };
    const boardHtml = b => `<div class="msg">${whoAv(b.who, 30)}<div class="mb"><b>${esc(whoName(b.who))}</b><em>${esc(ago(acct, b.at))}</em><div>${richText(b.text)}</div>${b.reply ? `<div class="re">主人回复：${richText(b.reply)}</div>` : mine && b.who !== "me" ? `<button class="rbtn" data-act="board-reply" data-id="${esc(b.id)}">回复</button>` : ""}</div></div>`;
    const tab = S.zoneTab;
    const visBox = `<div class="box"><h3><span>最近访客</span><span>共 ${(z.visitors || []).length} 人</span></h3>
        <div class="vis">${visitors.map(v => `<div>${whoAv(v.who, 44)}<span>${esc(whoName(v.who))}</span><small>${esc(ago(acct, v.at))}</small></div>`).join("") || `<div class="empty" style="grid-column:1/-1">还没有人来过</div>`}</div></div>`;
    const writeBox = `<div class="box"><h3><span>写说说</span></h3><textarea class="zin" id="postin" placeholder="说点什么吧…"></textarea>${S.draftPhoto ? `<div class="dph"><img data-ref="${esc(S.draftPhoto.ref)}" alt=""><button data-act="post-photo-del">✕</button></div>` : ""}<div class="zbtn"><button class="btn" data-act="post-photo">📷 照片</button>&nbsp;<button class="btn s" data-act="post">发表</button></div></div>`;
    // 她的主页是好友动态：自己和好友的说说按时间排在一起
    const feed = mine ? [...posts.map(p => ["me", p]), ...myFriends().flatMap(fr => (fr.zone.posts || []).filter(shown).map(p => [fr.id, p])),
      ...(A().zone.blogs || []).map(b => ["me", b, 1]), ...myFriends().flatMap(fr => (fr.zone.blogs || []).filter(b => shown(b) && b.priv !== "self").map(b => [fr.id, b, 1]))].sort((x, y) => y[1].at.localeCompare(x[1].at)).slice(0, 40) : [];
    const feedBlog = (o, b) => { const of = o === "me" ? null : friendById(o);
      return `<div class="post"><div class="ph">${of ? fAv(of, 26) : myAv(26)}<b>${esc(of ? nameOf(of) : A().nick)}</b><em>${esc(ago(acct, b.at))}</em></div><div class="fb" data-act="open-blog" data-owner="${esc(o)}" data-id="${esc(b.id)}">发表了日志 <b>《${esc(b.title)}》</b><div class="sum">${blogSum(b)}</div></div></div>`; };
    const home = mine ? `${writeBox}${visBox}
      <div class="box"><h3><span>好友动态</span></h3>${feed.map(([o, p, isBlog]) => isBlog ? feedBlog(o, p) : postHtml(o, p)).join("") || `<div class="empty">还没有动态</div>`}</div>` : `${visBox}
      <div class="cai"><button data-act="step">👣 踩一踩</button><button data-act="zone-tab" data-t="board">✎ 留言</button></div>
      ${posts.length ? `<div class="box"><h3><span>说说</span><span>(${posts.length})</span></h3>${postHtml(own, posts[0])}</div>` : ""}
      <div class="box"><h3><span>留言板</span><span>(${board.length})</span></h3>${board.slice(0, 3).map(boardHtml).join("") || `<div class="empty">还没有留言</div>`}</div>`;
    const postsTab = `${mine ? writeBox : ""}
      <div class="box"><h3><span>说说</span><span>(${posts.length})</span></h3>${posts.map(p => postHtml(own, p)).join("") || `<div class="empty">还没有说说</div>`}</div>`;
    const boardTab = `${mine ? "" : `<div class="box"><h3><span>给 ${esc(ownerName)} 留言</span></h3><textarea class="zin" id="boardin" placeholder="踩踩~"></textarea><div class="zbtn"><button class="btn s" data-act="leave-msg">发表</button></div></div>`}
      <div class="box"><h3><span>留言板</span><span>(${board.length})</span></h3>${board.map(boardHtml).join("") || `<div class="empty">还没有留言</div>`}</div>`;
    const blogRow = b => `<div class="bl" data-act="open-blog" data-id="${esc(b.id)}"><div class="t">${esc(b.title)}${b.priv !== "all" ? " 🔒" : ""}</div><div class="meta"><span class="tag">${esc(b.cat || "个人日记")}</span><span>${esc(ago(acct, b.at))}</span><span>${b.priv !== "all" ? PRIV[b.priv] : `阅读(${b.reads || 0})`}</span><span>评论(${(b.comments || []).filter(shown).length})</span></div><div class="sum">${blogSum(b)}</div></div>`;
    const blogTab = `${mine ? `<div class="wbtn"><button class="btn s" data-act="zone-tab" data-t="blogWrite">✎ 写日志</button></div>` : ""}<div class="box"><h3><span>日志</span><span>(${blogs.length})</span></h3>${blogs.map(blogRow).join("") || `<div class="empty">还没有日志</div>`}</div>`;
    const bv = blogs.find(b => b.id === S.blogId);
    const bgmLine = b => b.bgm ? (S.meta.music.find(m => m.id === b.bgm) || {}).name || "" : b.bgmName || "";
    const blogView = bv ? `<div class="wbtn" style="justify-content:flex-start"><button class="lnk" data-act="zone-tab" data-t="blog">‹ 返回日志列表</button></div>
      <div class="box"><div class="art"><h2>${esc(bv.title)}</h2><div class="meta">${esc(ymd(thereDate(acct, new Date(bv.at))))} ${esc(hm(thereDate(acct, new Date(bv.at))))} · ${esc(bv.cat || "个人日记")} · ${PRIV[bv.priv] || PRIV.all}</div>
        ${bgmLine(bv) ? `<div class="bgm">♫ 背景音乐：${esc(bgmLine(bv))}</div>` : ""}<div class="body">${richText(bv.text)}</div>${photoHtml(bv.photo, `data-kind="post" data-owner="${esc(own)}" data-post="${esc(bv.id)}"`, bv.id)}
        <div class="foot">阅读(${bv.reads || 0}) · 评论(${(bv.comments || []).filter(shown).length})${mine ? ` · <button class="lnk" data-act="del-blog" data-id="${esc(bv.id)}">删除</button>` : ""}</div></div>
        <div style="padding:0 8px 8px">${(bv.comments || []).filter(shown).sort((x, y) => (x.at || "").localeCompare(y.at || "")).map(cm => `<div class="cm" data-act="reply-cm" data-post="${esc(bv.id)}" data-who="${esc(cm.who)}"><b>${esc(whoName(cm.who))}</b>${cm.to ? ` 回复 <b>${esc(whoName(cm.to))}</b>` : ""}：${richText(cm.text)}</div>`).join("")}
        <div class="cmform"><input placeholder="评论…" data-post="${esc(bv.id)}"><button data-act="comment" data-owner="${esc(own)}" data-post="${esc(bv.id)}">评论</button></div></div></div>` : `<div class="empty">这篇日志找不到了</div>`;
    const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    const blogWrite = `<div class="box"><h3><span>写日志</span></h3><div class="bw">
      <input id="bt" maxlength="40" placeholder="标题">
      <div class="row"><span>分类</span>${sel("bcat", ["个人日记", "心情随笔", "学习笔记", "转载"].map(x => [x, x]))}<span class="sp"></span><span>权限</span>${sel("bpriv", Object.entries(PRIV))}</div>
      <textarea id="bbody" placeholder="写点什么…"></textarea>
      <div class="row"><span>♫ 背景音乐</span>${sel("bbgm", [["", "不要"], ...S.meta.music.map(m => [m.id, m.name])])}</div>
      ${S.draftBlogPhoto ? `<div class="dph"><img data-ref="${esc(S.draftBlogPhoto.ref)}" alt=""><button data-act="blog-photo-del">✕</button></div>` : ""}
      <div class="zbtn"><button class="btn" data-act="zone-tab" data-t="blog">取消</button>&nbsp;<button class="btn" data-act="blog-photo">📷 插图</button>&nbsp;<button class="btn s" data-act="blog-post">发表</button></div></div></div>`;
    const prof = mine ? A() : f;
    const profTab = `<div class="box"><h3><span>QQ秀</span></h3><div class="qs-mini" data-act="open-show" data-who="${mine ? "me" : esc(f.id)}"><img src="${stageUrl(showOf(mine ? "me" : f.id))}" alt=""><span>点这里换装 ›</span></div></div><div class="box"><h3><span>个人档</span></h3><div class="prof">${mine ? myAv(64) : fAv(f, 64)}<div><p><b>${esc(ownerName)}</b></p><p>QQ：${esc(mine ? A().qq : f.qq || "")}</p><p>等级：${mine ? levelOf(acct) : f.lv || 20}</p><p>签名：${richText(prof.sig || "")}</p></div></div><div class="zbtn">${mine ? `<button class="btn" data-act="my-avatar">换头像</button>&nbsp;<button class="btn" data-act="edit-zone">修改空间名字和签名</button>` : `<button class="btn" data-act="his-avatar">换 QQ 头像</button>&nbsp;<button class="btn" data-act="remark">修改备注</button>&nbsp;<button class="btn" data-act="his-font">他的字体</button>`}</div></div>`;
    return `<div class="zone">
      ${titlebar(`${ownerName}的QQ空间`, S.zoneBack || "back-main")}
      <div class="banner${z.cover ? " has-cover" : ""}">${z.cover ? `<img class="cov" data-ref="${esc(z.cover)}" alt="">` : CLOUDS}<button class="covbtn" data-act="cover">换背景</button><span class="yz">黄钻 LV${mine ? 3 : 1 + (hash(f.id) % 5)}</span><h1>${esc(z.name || `${ownerName}的空间`)}</h1><p>${esc(z.sig ? `[ ${z.sig} ]` : "")}</p>${bgmBarHtml()}</div>
      <div class="nav">${[["home", mine ? "好友动态" : "主页"], ["posts", "说说"], ["blog", "日志"], ["board", "留言板"], ["prof", "个人档"]].map(([k, t]) => `<button class="${tab === k || (k === "blog" && /^blog/.test(tab)) ? "on" : ""}" data-act="zone-tab" data-t="${k}">${t}</button>`).join("")}</div>
      <div class="zbody" data-k="${esc(`${S.zoneOf}|${tab}`)}">${{ home, posts: postsTab, blog: blogTab, blogView, blogWrite: mine ? blogWrite : blogTab, board: boardTab, prof: profTab }[tab]}</div>
    </div>`;
  };
  const CLOUD = (pos, w, op) => `<svg viewBox="0 0 120 50" style="position:absolute;${pos};width:${w}px"><g fill="#fff" opacity="${op}"><circle cx="34" cy="30" r="16"/><circle cx="56" cy="21" r="20"/><circle cx="80" cy="28" r="15"/><circle cx="96" cy="35" r="10"/><rect x="20" y="30" width="86" height="16" rx="8"/></g></svg>`;
  const CLOUDS = CLOUD("right:70px;top:16px", 120, ".95") + CLOUD("right:6px;top:46px", 80, ".8") + CLOUD("left:30px;top:96px", 70, ".55");

  // ───────────────────────── 弹层：小表单 / 字体 / 表情 / 菜单 ─────────────────────────
  function sheet(html, onClick) {
    const s = $("#sheet"); s.innerHTML = `<div class="paper">${html}</div>`; s.classList.add("on");
    s.onclick = e => { if (e.target === s) return closeSheet(); const b = e.target.closest("[data-v]"); if (b) onClick(b.dataset.v, b); };
  }
  function closeSheet() { const s = $("#sheet"); s.classList.remove("on"); s.innerHTML = ""; s.onclick = null; }
  function ask(title, fields, okText = "确定") {
    return new Promise(res => {
      sheet(`<h3>${esc(title)}</h3>${fields.map((f, i) => `<label>${esc(f.label)}${f.long ? `<textarea id="f${i}" rows="3" maxlength="${f.max || 200}">${esc(f.value || "")}</textarea>` : `<input id="f${i}" maxlength="${f.max || 40}" value="${esc(f.value || "")}" placeholder="${esc(f.ph || "")}">`}</label>`).join("")}<div class="btns"><button data-v="no">取消</button><button data-v="ok" class="pri">${esc(okText)}</button></div>`,
        v => { const vals = fields.map((_, i) => $(`#f${i}`).value.trim()); closeSheet(); res(v === "ok" ? vals : null); });
      setTimeout(() => { const i = $("#f0"); if (i) i.focus(); }, 60);
    });
  }
  function toast(t) { const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 1800); }
  /** 右下角黄色小窗：QQ 提示 */
  function qqPop(title, html) { const el = document.createElement("div"); el.className = "qpop"; el.innerHTML = `<div class="qh">${esc(title)}</div><div class="qb">${html}</div>`; $("#pops").appendChild(el); hydrate(el); setTimeout(() => el.classList.add("out"), 3600); setTimeout(() => el.remove(), 4200); }
  const FONT_COLORS = ["#000000", "#e0218a", "#ff69b4", "#8e44ad", "#1f6fd1", "#0a8f3c", "#e67e22", "#c0392b"];
  const FONT_NAMES = ["黑色", "玫红", "粉色", "紫色", "蓝色", "绿色", "橙色", "红色"];
  /** 他的 QQ 字体：AI 写「颜色名 加粗/不加粗」 */
  function parseFont(t) { t = String(t || ""); const i = FONT_NAMES.findIndex(n => t.includes(n)); if (i < 0) return null; return { color: FONT_COLORS[i], bold: /加粗/.test(t) && !/不加粗/.test(t) }; }
  const FONT_ASK = `QQ 字体：从这些颜色里挑一个：${FONT_NAMES.join(" ")}；再写加粗或不加粗`;
  function showPop(kind) {
    const w = $("#popwrap"); if (!w) return; if (w.dataset.kind === kind) { w.innerHTML = ""; w.dataset.kind = ""; return; } w.dataset.kind = kind;
    if (kind === "faces") w.innerHTML = `<div class="facegrid">${FACE_NAMES.map(n => `<button data-act="face" data-n="${n}" title="${n}">${faceSvg(n, 24)}</button>`).join("")}</div>`;
    if (kind === "font") w.innerHTML = `<div class="fontbar">${FONT_COLORS.map(c => `<button data-act="font-color" data-c="${c}" style="background:${c}" class="${S.meta.font.color === c ? "on" : ""}"></button>`).join("")}<button data-act="font-bold" class="fb ${S.meta.font.bold ? "on" : ""}">B</button></div>`;
  }

  // ───────────────────────── 交互 ─────────────────────────
  const ACT = {};
  // ───────────────────────── QQ秀：像素小人（src/qqshow.js 画），衣柜、Q币、送礼、他自己换装 ─────────────────────────
  // show = { g: f|m, hair, hairC, eyeC, outfit, wings, acc: [], bg, eyes, mouth, owned: [物品 id], qb: Q币, gifts: [{ name, from, items, at }] }
  const CAT = [
    // [id, 名字, 格子, 价钱, 谁能穿 f/m/*, 值]
    ["o_angel", "天使礼服", "outfit", 88, "f", "angel"], ["o_lolita", "粉色洛丽塔", "outfit", 60, "f", "lolita"], ["o_overalls", "背带裤", "outfit", 40, "f", "overalls"],
    ["o_sweater", "毛衣格子裙", "outfit", 50, "f", "sweater"], ["o_tunic", "韩版长T", "outfit", 30, "f", "tunic"], ["o_gothic", "哥特黑裙", "outfit", 70, "f", "gothic"],
    ["o_yukata", "浴衣", "outfit", 66, "f", "yukata"], ["o_xmas", "圣诞装", "outfit", 58, "f", "xmas"],
    ["o_uniform", "运动校服", "outfit", 20, "m", "uniform"], ["o_hoodie", "卫衣牛仔裤", "outfit", 30, "m", "hoodie"], ["o_shirt", "白衬衫领带", "outfit", 40, "m", "shirt"],
    ["o_basketball", "篮球服", "outfit", 45, "m", "basketball"], ["o_leather", "皮衣", "outfit", 60, "m", "leather"], ["o_sailor", "海魂衫", "outfit", 35, "m", "sailor"], ["o_devil", "恶魔套装", "outfit", 70, "m", "devil"],
    ["h_wavy", "大波浪", "hair", 0, "f", "wavy"], ["h_twin", "双马尾", "hair", 20, "f", "twin"], ["h_straight", "齐刘海直发", "hair", 20, "f", "straight"], ["h_bun", "丸子头", "hair", 20, "f", "bun"],
    ["h_spiky", "刺猬头", "hair", 0, "m", "spiky"], ["h_messy", "碎发", "hair", 20, "m", "messy"], ["h_sidepart", "偏分", "hair", 20, "m", "sidepart"],
    ["w_angel", "天使翅膀", "wings", 50, "*", "angel"], ["w_devil", "恶魔翅膀", "wings", 50, "*", "devil"],
    ["a_halo", "光环", "acc", 15, "*", "halo"], ["a_bow", "蝴蝶结", "acc", 10, "f", "bow"], ["a_headphones", "大耳机", "acc", 25, "*", "headphones"], ["a_beret", "贝雷帽", "acc", 20, "*", "beret"],
    ["a_scarf", "粉围巾", "acc", 15, "*", "scarf"], ["a_starclip", "星星发卡", "acc", 10, "f", "starclip"], ["a_santa", "圣诞帽", "acc", 15, "*", "santa"], ["a_horns", "恶魔角", "acc", 15, "*", "horns"],
    ["p_bunny", "小白兔", "acc", 40, "*", "bunny"], ["p_cat", "小橘猫", "acc", 40, "*", "cat"],
    ["b_hearts", "粉色爱心", "bg", 20, "*", "hearts"], ["b_starry", "星空", "bg", 30, "*", "starry"], ["b_campus", "校园", "bg", 0, "*", "campus"], ["b_city", "城市夜景", "bg", 30, "*", "city"],
    ["b_magazine", "杂志封面", "bg", 40, "*", "magazine"], ["b_beach", "海边", "bg", 30, "*", "beach"], ["b_snow", "下雪天", "bg", 30, "*", "snow"],
  ].map(([id, name, slot, price, who, val]) => ({ id, name, slot, price, who, val }));
  const itemById = id => CAT.find(i => i.id === id);
  const fits = (it, g) => it.who === "*" || it.who === g;
  const FACES_QS = [["微笑", "open", "smile"], ["开心", "happy", "grin"], ["眨眼", "wink", "cat"], ["害羞", "shy", "pout"], ["惊讶", "wide", "o"], ["闭眼笑", "closed", "smile"]];
  const HAIR_COLORS = ["#8a5236", "#2a1e1c", "#5a3a2a", "#c98a4a", "#e8c46a", "#a04a5a"];
  const defaultShow = g => g === "f"
    ? { g, hair: "wavy", hairC: "#8a5236", eyeC: "#1e1416", outfit: "tunic", acc: [], bg: "hearts", eyes: "open", mouth: "smile", owned: ["h_wavy", "o_tunic", "b_hearts", "b_campus"], qb: 200, gifts: [] }
    : { g, hair: "spiky", hairC: "#2a1e1c", eyeC: "#3a2620", outfit: "uniform", acc: [], bg: "campus", eyes: "open", mouth: "smile", owned: ["h_spiky", "o_uniform", "b_campus"], qb: 300, gifts: [] };
  const myShow = () => A().show || (A().show = defaultShow("f"));
  const hisShow = f => f.show || (f.show = defaultShow("m"));
  const showOf = who => who === "me" ? myShow() : hisShow(friendById(who));
  const saveShowOf = who => who === "me" ? saveMeta() : saveFriend(friendById(who));
  /** 这一身对应的小人参数 */
  const dollOf = (sh, extra = {}) => ({ g: sh.g, hair: sh.hair, hairC: sh.hairC, eyeC: sh.eyeC, outfit: sh.outfit, wings: sh.wings, acc: sh.acc || [], eyes: sh.eyes, mouth: sh.mouth, blush: sh.eyes === "shy" || sh.eyes === "closed", extra: sh.eyes === "shy" ? "heart" : sh.eyes === "wink" ? "sparkle" : sh.eyes === "wide" ? "sweat" : "", ...extra });
  const pixCache = new Map();
  /** 格子 → 图片（同样的东西只画一次） */
  function pixUrl(key, grid, k) {
    if (pixCache.has(key)) return pixCache.get(key);
    const cv = document.createElement("canvas"); cv.width = grid[0].length * k; cv.height = grid.length * k; window.drawPix(cv.getContext("2d"), grid, 0, 0, k);
    const u = cv.toDataURL(); pixCache.set(key, u); return u;
  }
  const stageUrl = sh => { const d = dollOf(sh); return pixUrl(`st${JSON.stringify(d)}${sh.bg}`, window.qqstage(sh.bg, [[d, 30]]), 4); };
  const coupleUrl = (a, b, bg) => { const da = dollOf(a), db = dollOf(b); return pixUrl(`cp${JSON.stringify([da, db, bg])}`, window.qqstage(bg, [[da, 12], [db, 50]]), 4); };
  /** 衣柜格子里的小图：穿着这一件的样子 */
  function thumbUrl(sh, it) {
    if (it.slot === "bg") return pixUrl(`bg${it.val}`, window.qqstage(it.val, [], 50, 42), 3);
    const base = { g: sh.g, hair: sh.g === "f" ? "wavy" : "spiky", hairC: sh.hairC, eyeC: sh.eyeC, outfit: sh.g === "f" ? "tunic" : "uniform", acc: [] };
    const d = { ...base, ...(it.slot === "outfit" ? { outfit: it.val } : it.slot === "hair" ? { hair: it.val } : it.slot === "wings" ? { wings: it.val } : { acc: [it.val] }) };
    return pixUrl(`th${JSON.stringify(d)}`, window.qqpix(d), 2);
  }
  /** 穿上 / 摘下 */
  function wear(sh, it) {
    if (it.slot === "acc") { sh.acc = (sh.acc || []).includes(it.val) ? sh.acc.filter(a => a !== it.val) : [...(sh.acc || []), it.val]; return; }
    if (it.slot === "wings") { sh.wings = sh.wings === it.val ? null : it.val; return; }
    sh[it.slot] = it.val;
  }
  const isWorn = (sh, it) => it.slot === "acc" ? (sh.acc || []).includes(it.val) : sh[it.slot] === it.val;
  /** 名字 → 物品（AI 写的名字，按包含关系找最像的） */
  const findItem = (name, g) => { const n = String(name || "").trim(); if (!n) return null; return CAT.find(i => fits(i, g) && i.name === n) || CAT.find(i => fits(i, g) && (n.includes(i.name) || i.name.includes(n))); };
  const catText = g => ["outfit", "hair", "wings", "acc", "bg"].map(sl => `${{ outfit: "衣服", hair: "发型", wings: "翅膀", acc: "配饰/宠物", bg: "背景" }[sl]}：${CAT.filter(i => i.slot === sl && fits(i, g)).map(i => `${i.name}(${i.price}Q币)`).join("、")}`).join("\n");

  V.show = () => {
    const who = S.showOf; const mine = who === "me"; const f = mine ? null : friendById(who); const sh = showOf(who); const me = myShow();
    const tab = S.showTab || "outfit";
    const items = tab === "gifts" ? [] : CAT.filter(i => i.slot === tab && fits(i, sh.g));
    const cell = it => { const own = sh.owned.includes(it.id), worn = isWorn(sh, it);
      const btn = own ? `<button class="${worn ? "on" : ""}" data-act="qs-wear" data-id="${it.id}">${worn ? (it.slot === "acc" || it.slot === "wings" ? "摘下" : "穿着") : mine ? "穿上" : "帮他穿"}</button>`
        : mine ? `<button data-act="qs-buy" data-id="${it.id}">${it.price} Q币</button>` : `<button data-act="qs-give" data-id="${it.id}">送他 ${it.price}</button>`;
      return `<div class="qs-it ${worn ? "on" : ""}"><img src="${thumbUrl(sh, it)}" alt=""><b>${esc(it.name)}</b>${btn}</div>`; };
    const gifts = (sh.gifts || []).slice().reverse().map(gf => `<div class="qs-gift"><b>🎁 ${esc(gf.name)}</b><small>${esc(gf.from)} 送的 · ${esc(ago(S.meta.cur, gf.at))}</small><div>${gf.items.map(id => esc((itemById(id) || {}).name || "")).join("、")}</div><button data-act="qs-wearset" data-i="${sh.gifts.indexOf(gf)}">整套穿上</button></div>`).join("") || `<div class="empty">还没有收到礼物</div>`;
    if (mine && tab === "gifts") { let ch = false; (sh.gifts || []).forEach(gf => { if (!gf.seen) { gf.seen = true; ch = true; } }); if (ch) saveMeta(); }
    const pair = S.showPair && friendById(S.showPair);
    return `<div class="qshow">${titlebar(`${mine ? A().nick : nameOf(f)}的QQ秀`, S.showBack || "back-main")}
      ${pair ? `<div class="qs-who"><button class="${mine ? "on" : ""}" data-act="qs-who" data-w="me">我的</button><button class="${!mine ? "on" : ""}" data-act="qs-who" data-w="${esc(pair.id)}">${esc(nameOf(pair))}的</button></div>` : ""}
      <div class="qs-stage"><img src="${stageUrl(sh)}" alt=""></div>
      <div class="qs-bar"><span>💰 ${mine ? "我的" : "他的"} Q币 <b>${sh.qb}</b></span>${mine ? `<button data-act="qs-sign" ${sh.signed === ymd(new Date()) ? "disabled" : ""}>${sh.signed === ymd(new Date()) ? "今天签过了" : "签到 +20"}</button><button data-act="qs-pay">充值</button>` : ""}${mine ? "" : `<span>我的 Q币 <b>${me.qb}</b></span>`}${mine ? "" : `<button data-act="qs-gender">${sh.g === "f" ? "女生" : "男生"} ⇄</button>`}</div>
      <div class="qs-faces">${FACES_QS.map(([n, e, m]) => `<button class="${sh.eyes === e && sh.mouth === m ? "on" : ""}" data-act="qs-face" data-e="${e}" data-m="${m}">${n}</button>`).join("")}</div>
      <div class="qs-tabs">${[["outfit", "衣服"], ["hair", "发型"], ["wings", "翅膀"], ["acc", "配饰"], ["bg", "背景"], ["gifts", "礼物"]].map(([k, t]) => `<button class="${tab === k ? "on" : ""}" data-act="qs-tab" data-t="${k}">${t}${k === "gifts" && mine && newGift() ? `<i class="dot"></i>` : ""}</button>`).join("")}</div>
      <div class="qs-body">${tab === "hair" ? `<div class="qs-colors">发色 ${HAIR_COLORS.map(c => `<button style="background:${c}" class="${sh.hairC === c ? "on" : ""}" data-act="qs-hairc" data-c="${c}"></button>`).join("")}</div>` : ""}
        ${tab === "gifts" ? gifts : `<div class="qs-grid">${items.map(cell).join("")}</div>`}</div>
    </div>`;
  };
  /** 有他送的、还没穿过的礼物 */
  const newGift = () => (myShow().gifts || []).some(gf => !gf.seen);
  ACT["open-show"] = b => { S.showPair = b.dataset.who !== "me" ? b.dataset.who : (S.view === "chat" ? S.fid : S.showPair); S.showOf = S.view === "chat" ? "me" : b.dataset.who; S.showBack = S.view === "chat" ? "back-chat" : S.view === "zone" ? "back-zone" : "back-main"; S.showTab = "outfit"; S.lastZone = S.zoneOf; S.view = "show"; render(); };
  ACT["back-zone"] = () => { S.zoneOf = S.lastZone; S.view = "zone"; render(); };
  ACT["qs-who"] = b => { S.showOf = b.dataset.w; S.showTab = "outfit"; render(); };
  ACT["qs-sign"] = () => { const sh = myShow(); const d = ymd(new Date()); if (sh.signed === d) return; sh.signed = d; sh.qb += 20; saveMeta(); render(); toast("签到成功 +20 Q币"); };
  /** 仿 2008 年的短信充值：点了就到账 */
  ACT["qs-pay"] = () => sheet(`<h3>Q币充值</h3><p class="note">手机短信充值：编辑「QB」发送到 1066 8888，1 元 = 1 Q币</p><div class="mlist">${[10, 50, 100, 500].map(n => `<button data-v="${n}">充 ${n} Q币</button>`).join("")}</div><div class="btns"><button data-v="no">取消</button></div>`,
    v => { closeSheet(); if (v === "no") return; const sh = myShow(); sh.qb += +v; saveMeta(); render(); toast(`充值成功，到账 ${v} Q币`); });
  ACT["qs-tab"] = b => { S.showTab = b.dataset.t; render(); };
  ACT["qs-face"] = b => { const sh = showOf(S.showOf); sh.eyes = b.dataset.e; sh.mouth = b.dataset.m; saveShowOf(S.showOf); render(); };
  ACT["qs-hairc"] = b => { const sh = showOf(S.showOf); sh.hairC = b.dataset.c; saveShowOf(S.showOf); render(); };
  ACT["qs-gender"] = () => { const f = friendById(S.showOf); const g = hisShow(f).g === "m" ? "f" : "m";
    sheet(`<h3>把 ${esc(nameOf(f))} 的 QQ秀 换成${g === "f" ? "女生" : "男生"}？</h3><p class="note">换了以后衣柜会变成${g === "f" ? "女生" : "男生"}的衣服，现在穿的会换回默认。</p><div class="btns"><button data-v="no">算了</button><button data-v="ok" class="pri">换</button></div>`, v => { closeSheet(); if (v !== "ok") return; f.show = { ...defaultShow(g), qb: f.show.qb, gifts: f.show.gifts }; saveFriend(f); render(); }); };
  ACT["qs-wear"] = b => { const sh = showOf(S.showOf); wear(sh, itemById(b.dataset.id)); saveShowOf(S.showOf); render(); };
  ACT["qs-wearset"] = b => { const sh = showOf(S.showOf); const gf = sh.gifts[+b.dataset.i]; for (const id of gf.items) { const it = itemById(id); if (it && !isWorn(sh, it)) wear(sh, it); } saveShowOf(S.showOf); render(); toast("整套穿上了"); };
  ACT["qs-buy"] = b => { const sh = myShow(); const it = itemById(b.dataset.id); if (sh.qb < it.price) return toast("Q币不够了"); sh.qb -= it.price; sh.owned.push(it.id); wear(sh, it); saveMeta(); render(); toast(`买下了「${it.name}」`); };
  ACT["qs-give"] = b => { const f = friendById(S.showOf); const sh = hisShow(f), me = myShow(); const it = itemById(b.dataset.id);
    if (me.qb < it.price) return toast("你的 Q币不够了");
    me.qb -= it.price; sh.owned.push(it.id); sh.gifts = [...(sh.gifts || []), { name: it.name, from: A().nick, items: [it.id], at: new Date().toISOString() }]; saveMeta(); saveFriend(f);
    const c = chatOf(f.id); c.msgs.push({ id: uid("m"), from: "sys", text: `你赠送给 ${nameOf(f)} QQ秀「${it.name}」`, at: new Date().toISOString() }); saveChat(c);
    remember(f, `${A().nick} 在 QQ 上送了我一件 QQ秀「${it.name}」`); queueZone(f, { kind: "gotShow", name: it.name }, rand(1, 10) * 60e3);
    render(); toast(`送给他了「${it.name}」`); };

  /** 他送她 QQ秀：东西进她的衣柜，右下角弹系统提示，聊天里留一条 */
  function giveHer(f, name, ids) {
    const me = myShow(); const hs = hisShow(f); ids = ids.filter(id => !!itemById(id)); if (!ids.length) return false;
    for (const id of ids) if (!me.owned.includes(id)) me.owned.push(id);
    const cost = ids.reduce((n, id) => n + itemById(id).price, 0); hs.qb = Math.max(0, hs.qb - cost);
    me.gifts = [...(me.gifts || []), { name, from: nameOf(f), items: ids, at: new Date().toISOString() }]; saveMeta(); saveFriend(f);
    const c = chatOf(f.id); c.msgs.push({ id: uid("m"), from: "sys", text: `${nameOf(f)} 赠送给你 QQ秀「${name}」，快去穿上吧`, at: new Date().toISOString() }); saveChat(c);
    play("msg"); qqPop("系统消息", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b> 赠送给你<br>QQ秀「${esc(name)}」</div>`);
    remember(f, `我在 QQ 上送了 ${A().nick} 一套 QQ秀「${name}」（${ids.map(id => itemById(id).name).join("、")}）`);
    return true;
  }
  /** AI 写的 ===送QQ秀=== / ===换装=== 块 */
  function applyShowBlocks(f, raw) {
    const gb = block(raw, "送QQ秀"); let gave = false;
    if (gb) { const name = (field(gb, "名字") || "").slice(0, 30); const ids = (field(gb, "包含") || gb).split(/[、,，\s]+/).map(n => findItem(n, "f")).filter(Boolean).map(i => i.id);
      if (ids.length) gave = giveHer(f, name || itemById(ids[0]).name, [...new Set(ids)]); }
    const cb = block(raw, "换装");
    if (cb) { const sh = hisShow(f); const notes = [];
      const take = (n, slot) => { const it = findItem(n, sh.g); if (!it || it.slot !== slot && !(slot === "acc" && it.slot === "acc")) return; if (!sh.owned.includes(it.id)) { if (sh.qb < it.price) return; sh.qb -= it.price; sh.owned.push(it.id); } if (!isWorn(sh, it)) wear(sh, it); notes.push(it.name); };
      take(field(cb, "衣服"), "outfit"); take(field(cb, "发型"), "hair"); take(field(cb, "背景"), "bg");
      const wg = field(cb, "翅膀"); if (/^(无|不要|没有)$/.test(wg)) sh.wings = null; else if (wg) take(wg, "wings");
      const ac = field(cb, "配饰"); if (ac) { sh.acc = []; ac.split(/[、,，\s]+/).forEach(n => take(n, "acc")); }
      const fc = FACES_QS.find(x => x[0] === field(cb, "表情")); if (fc) { sh.eyes = fc[1]; sh.mouth = fc[2]; }
      if (notes.length) { saveFriend(f); remember(f, `我把 QQ秀换成了：${notes.join("、")}`); } }
    return gave;
  }
  const SHOW_FMT = g => `QQ秀的东西（名字只能从这里挑）：\n${catText(g)}`;
  /** 装上新版后他第一次上线：照记忆看有没有说过要送她 QQ秀；顺便给自己挑一身 */
  async function genShowCheck(f) {
    const acct = f.acct; const sh = hisShow(f);
    const raw = await gen(f, "qqshow", [ERA_RULE(acct), `QQ 有了 QQ秀（像素小人，可以换衣服、发型、配饰、背景，用 Q币买，也能送人）。用户的 QQ 昵称是「${S.meta.accts[acct].nick}」。你有 ${sh.qb} Q币。`,
      `翻一下你的记忆：你如果说过要送用户、或者已经送了用户 QQ秀衣服，现在就送出去：从下面挑最像你说的那几样，名字用你说过的名字。没说过就不送。\n${SHOW_FMT("f")}\n===送QQ秀===\n名字：这份礼物叫什么\n包含：挑的东西，用顿号隔开\n===结束===`,
      `再按你的人设给自己挑一身：\n${SHOW_FMT(sh.g)}\n===换装===\n衣服：\n发型：\n翅膀：（不要就写无）\n配饰：（可以几样，用顿号隔开，不要就写无）\n背景：\n表情：微笑/开心/眨眼/害羞/惊讶/闭眼笑 选一个\n===结束===`].join("\n\n"));
    if (raw == null) return null;
    applyShowBlocks(f, raw); f.showChecked = true; saveFriend(f); return true;
  }

  ACT["pick-acct"] = b => { S.meta.last = b.dataset.k; saveMeta(); render(); };
  ACT.login = async () => {
    const k = S.meta.last || "a08"; S.meta.cur = k; S.meta.auto = $("#auto").checked; S.meta.accts[k].status = $("#st0").value; saveMeta();
    ac(); S.view = "logging"; render(); await wait(1100); S.view = "main"; render(); lastStatus = {}; watchStatus(true); tick();
  };
  ACT.logout = () => { stopBgm(); S.meta.cur = null; S.meta.auto = false; saveMeta(); S.view = "login"; render(); };
  ACT["back-main"] = () => { S.view = "main"; S.fid = null; S.zoneOf = null; render(); };
  ACT.tab = b => { S.tab = b.dataset.t; render(); };
  ACT.fold = () => { S.collapsed.f = !S.collapsed.f; render(); };
  ACT["edit-sig"] = async () => { const r = await ask("编辑个性签名", [{ label: "个性签名", value: A().sig, max: 60 }]); if (r) { A().sig = r[0]; saveMeta(); render(); } };
  ACT["my-avatar"] = async () => {
    const f = await pickFile("image/*").catch(() => null); if (!f || !f.dataUrl) return;
    const st = await api.media.put({ dataUrl: await compressImage(f.dataUrl, 256) }); A().avatarRef = st.ref; saveMeta(); render();
  };
  ACT["his-avatar"] = async () => {
    const fr = friendById(S.zoneOf); const f = await pickFile("image/*").catch(() => null); if (!f || !f.dataUrl) return;
    const st = await api.media.put({ dataUrl: await compressImage(f.dataUrl, 256) }); fr.avatarRef = st.ref; saveFriend(fr); render(); toast("头像换好了");
  };
  /** 给他设字体：她设过就固定，他不再自己换；选「让他自己挑」就还给他 */
  ACT["his-font"] = () => {
    const fr = friendById(S.zoneOf); const cur = fr.font || { color: "#000000", bold: false };
    sheet(`<h3>${esc(nameOf(fr))}的字体</h3><p class="note">${fr.fontByMe ? "现在是你给他设的。" : fr.font ? "现在是他自己挑的。" : "他还没挑，下次回你消息时会挑。"}</p><div class="fontbar">${FONT_COLORS.map((c, i) => `<button data-v="c:${c}" title="${FONT_NAMES[i]}" style="background:${c}" class="${fr.font && cur.color === c ? "on" : ""}"></button>`).join("")}<button data-v="b" class="fb ${cur.bold ? "on" : ""}">B</button></div><div class="btns"><button data-v="auto">让他自己挑</button><button data-v="no" class="pri">好了</button></div>`,
      v => { if (v === "no") return closeSheet();
        if (v === "auto") { delete fr.fontByMe; delete fr.font; saveFriend(fr); closeSheet(); return toast("他下次回消息时自己挑"); }
        fr.font = { ...cur, ...(v === "b" ? { bold: !cur.bold } : { color: v.slice(2) }) }; fr.fontByMe = true; saveFriend(fr); ACT["his-font"](); });
  };
  ACT.remark = async () => { const fr = friendById(S.zoneOf); const r = await ask("修改备注", [{ label: "备注名（不填就显示他的名字）", value: fr.remark, max: 16 }]); if (r) { fr.remark = r[0]; saveFriend(fr); render(); } };
  ACT.menu = () => sheet(`<h3>菜单</h3><div class="mlist">
      <button data-v="nick">修改昵称</button><button data-v="qq">修改 QQ 号（现在：${esc(A().qq)}）</button><button data-v="show">我的QQ秀</button><button data-v="theme">更换皮肤</button><button data-v="sound">声音：${S.meta.sound !== false ? "开" : "关"}</button><button data-v="music">我的音乐（${S.meta.music.length} 首）</button><button data-v="export">导出数据</button><button data-v="import">导入数据</button><button data-v="switch">切换帐号</button><button data-v="about">关于</button></div><div class="btns"><button data-v="no">关闭</button></div>`,
    async v => { closeSheet();
      if (v === "nick") { const r = await ask("修改昵称", [{ label: "昵称", value: A().nick, max: 16 }]); if (r && r[0]) { A().nick = r[0]; saveMeta(); render(); } }
      if (v === "qq") { const r = await ask("修改 QQ 号", [{ label: `QQ 号（5 到 11 位数字）`, value: A().qq, max: 11 }]); if (r) { const n = r[0].replace(/\D/g, ""); if (n.length < 5) return toast("QQ 号要 5 到 11 位数字"); A().qq = n; saveMeta(); render(); toast("QQ 号改好了"); } }
      if (v === "sound") { S.meta.sound = S.meta.sound === false; saveMeta(); }
      if (v === "music") musicSheet();
      if (v === "theme") themeSheet();
      if (v === "show") ACT["open-show"]({ dataset: { who: "me" } });
      if (v === "export") exportData();
      if (v === "import") importData();
      if (v === "switch") ACT.logout();
      if (v === "about") sheet(`<h3>QQ2008</h3><p class="note">版本 ${esc(VERSION)}<br>等回复：${S.meta.queue.map(q => `${esc(nameOf(friendById(q.fid) || {}))}（${{ reply: "消息", zone: "空间", verify: "好友验证" }[q.kind] || q.kind}）${hm(new Date(q.due))}`).join("；") || "没有"}</p>${(S.meta.errors || []).map(e => `<p class="note">❗${esc(e)}</p>`).join("")}<div class="btns"><button data-v="no">关闭</button></div>`, () => closeSheet());
    });
  ACT.find = () => { S.view = "find"; render(); };
  ACT["search-qq"] = () => {
    const no = ($("#qqno").value || "").replace(/\D/g, ""); if (no.length < 5) return toast("请输入正确的 QQ 号码");
    const have = new Set(S.friends.filter(f => f.acct === S.meta.cur).map(f => f.charId));
    const cand = S.chars.filter(c => !have.has(c.id));
    if (!cand.length) return toast("档案库里的人都已经加过了");
    sheet(`<h3>查找结果</h3><p class="note">QQ 号 ${esc(no)} 是谁的？（从档案库里选）</p><div class="mlist">${cand.map(c => `<button class="pick" data-v="${esc(c.id)}">${avatar({ url: c.avatar, seed: c.id, name: c.name }, 30)}<span>${esc(c.name)}</span></button>`).join("")}</div><div class="btns"><button data-v="no">取消</button></div>`,
      async v => { closeSheet(); if (v === "no") return;
        const c = charOf(v); const r = await ask(`添加 ${c.name} 为好友`, [{ label: "请输入验证信息", value: "我是" + A().nick, max: 40 }], "发送"); if (!r) return;
        const f = { id: `${S.meta.cur}_${c.id}`, acct: S.meta.cur, charId: c.id, remark: "", sig: "", qq: no, lv: rand(8, 40), pending: true, verify: r[0], sleep: [23 + (hash(c.id) % 6) * 0.5, 6.5 + (hash(c.id + "w") % 4) * 0.5], zone: emptyZone(`${c.name}的空间`) };
        S.friends = S.friends.filter(x => x.id !== f.id); S.friends.push(f); saveFriend(f);
        const st = statusOf(f); const now = Date.now(); const due = st === "offline" ? nextOnline(f).getTime() - now + rand(1, 20) * 60e3 : rand(10, 60) * 1000;
        S.meta.queue.push({ fid: f.id, kind: "verify", due: new Date(now + due * TS()).toISOString() }); saveMeta();
        render(); toast(st === "offline" ? "请求已发送，对方上线后会看到" : "请求已发送，等待对方验证"); });
  };
  ACT["open-chat"] = b => { S.fid = b.dataset.id; S.view = "chat"; render(); };
  ACT.nope = b => toast(b.dataset.t);
  ACT.faces = () => showPop("faces");
  ACT.font = () => showPop("font");
  ACT.face = b => { const i = $("#inp"); i.value += `/${b.dataset.n}`; i.focus(); };
  ACT["font-color"] = b => { S.meta.font.color = b.dataset.c; saveMeta(); $("#inp").style.color = b.dataset.c; $("#popwrap").innerHTML = ""; $("#popwrap").dataset.kind = ""; render(); };
  ACT["font-bold"] = () => { S.meta.font.bold = !S.meta.font.bold; saveMeta(); render(); };
  ACT.history = () => toast("消息记录都在上面啦");
  ACT.send = () => {
    const i = $("#inp"); const text = i.value.trim(); if (!text) return;
    const f = friendById(S.fid); const c = chatOf(f.id);
    c.msgs.push({ id: uid("m"), from: "me", text, at: new Date().toISOString(), color: S.meta.font.color, bold: S.meta.font.bold }); saveChat(c);
    i.value = ""; queueReply(f); render(); $("#inp").focus();
  };
  /** 不满意他最后这几条：删掉（连他记忆里那条），马上重新回 */
  ACT.reroll = () => {
    const f = friendById(S.fid); const c = chatOf(f.id);
    sheet(`<h3>重新回复</h3><p class="note">把 ${esc(nameOf(f))} 最后回的这几条删掉，让他重新回一次。他也不会记得删掉的这几条。</p><div class="btns"><button data-v="no">算了</button><button data-v="ok" class="pri">重新回复</button></div>`, v => {
      closeSheet(); if (v !== "ok") return;
      let i = c.msgs.length; while (i > 0 && c.msgs[i - 1].from === "him") i--;
      const gone = c.msgs.slice(i); c.msgs = c.msgs.slice(0, i); saveChat(c);
      for (const id of new Set(gone.map(m => m.mem).filter(Boolean))) forget(f, id);
      S.meta.queue = S.meta.queue.filter(q => !(q.fid === f.id && q.kind === "reply"));
      S.meta.queue.push({ fid: f.id, kind: "reply", due: new Date(Date.now() + 3000).toISOString(), typing: true }); saveMeta(); render();
    });
  };
  ACT.shake = () => {
    const f = friendById(S.fid); const c = chatOf(f.id);
    const recent = c.msgs.filter(m => m.from === "me" && m.shake && Date.now() - new Date(m.at).getTime() < 10e3); if (recent.length) return toast("您发送窗口抖动过于频繁，请稍候再发。");
    c.msgs.push({ id: uid("m"), from: "me", shake: true, text: "", at: new Date().toISOString() }); saveChat(c); shakeScreen(); queueReply(f); render();
  };
  ACT["open-zone"] = b => {
    const who = b.dataset.who; S.zoneBack = S.view === "chat" ? "back-chat" : "back-main"; S.zoneOf = who; S.zoneTab = "home"; S.view = "zone";
    const z = curZone();
    if (who !== "me") { // 去他的空间：记一条访客（他能看到「你 刚刚来过」）
      const f = friendById(who); z.visitors = [{ who: "me", at: new Date().toISOString() }, ...(z.visitors || []).filter(v => v.who !== "me")].slice(0, 30); saveFriend(f);
    }
    // 进有歌的空间就放这个空间的歌（同一份歌单就接着放）；没歌的空间不打断正在放的
    if (z.bgm && z.bgm.length && z.bgm.join() !== bgmList.map(x => x.id).join()) playBgm(z.bgm);
    render();
  };
  ACT["back-chat"] = () => { S.view = "chat"; S.zoneOf = null; render(); };
  ACT["zone-tab"] = b => { S.zoneTab = b.dataset.t; render(); };
  ACT["bgm-toggle"] = () => { const z = curZone(); if (!bgmList.length) { if (z.bgm && z.bgm.length) playBgm(z.bgm); return; } if (audio.paused) audio.play().catch(() => {}); else audio.pause(); renderBgmBar(); };
  ACT["bgm-stop"] = () => { stopBgm(); renderBgmBar(); };
  ACT["bgm-next"] = () => { if (bgmList.length) playBgm(bgmList.map(s => s.id), bgmIdx + 1); };
  ACT["bgm-set"] = () => pickBgm();
  /** 空间顶上的背景图：她的、他的都能换（2008 号也不做旧，是她挑的图） */
  ACT.cover = () => {
    const z = curZone();
    sheet(`<h3>${S.zoneOf === "me" ? "空间背景" : `给${esc(nameOf(friendById(S.zoneOf)))}的空间换背景`}</h3><div class="mlist"><button data-v="pick">从相册选一张</button>${z.cover ? `<button data-v="reset">换回原来的</button>` : ""}</div><div class="btns"><button data-v="no">取消</button></div>`,
      async v => { closeSheet(); if (v === "no") return;
        if (v === "reset") { delete z.cover; saveZone(); return render(); }
        const f = await pickFile("image/*").catch(() => null); if (!f || !f.dataUrl) return;
        const d = await compressImage(f.dataUrl, 1080); const st = await api.media.put({ dataUrl: d }); mediaCache.set(st.ref, d); z.cover = st.ref; saveZone(); render(); toast("背景换好了"); });
  };
  ACT["edit-zone"] = async () => { const z = A().zone; const r = await ask("修改空间", [{ label: "空间名字", value: z.name, max: 20 }, { label: "空间签名", value: z.sig, max: 40 }]); if (r) { z.name = r[0] || z.name; z.sig = r[1]; saveMeta(); render(); } };
  ACT.post = () => {
    const t = ($("#postin").value || "").trim(); if (!t && !S.draftPhoto) return;
    const p = { id: uid("p"), text: t, at: new Date().toISOString(), comments: [], likes: [], ...(S.draftPhoto ? { photo: S.draftPhoto } : {}) }; A().zone.posts.push(p); S.draftPhoto = null; $("#postin").value = ""; saveMeta();
    // 好友都会刷到（不在线的上线后才看到），赞不赞、评不评论他们自己定
    for (const f of myFriends()) queueZone(f, { kind: "myPost", pid: p.id }, rand(1, 40) * 60e3);
    render(); toast("说说发表成功");
  };
  ACT["post-photo"] = async () => { const ph = await pickPhotoFor(S.meta.cur); if (ph) { S.draftPhoto = ph; render(); } };
  ACT["post-photo-del"] = () => { S.draftPhoto = null; render(); };
  ACT["send-photo"] = async () => {
    const f = friendById(S.fid); if (!f) return; const ph = await pickPhotoFor(f.acct); if (!ph) return; const c = chatOf(f.id);
    c.msgs.push({ id: uid("m"), from: "me", text: "", photo: ph, at: new Date().toISOString() }); saveChat(c); queueReply(f); render();
  };
  /** 他发的照片：她点了才生成 */
  ACT["gen-photo"] = async b => {
    let ph, f, at, save;
    if (b.dataset.kind === "chat") { f = friendById(b.dataset.fid); const c = chatOf(b.dataset.fid); const m = c.msgs.find(x => x.id === b.dataset.mid); if (!m) return; ph = m.photo; at = m.at; save = () => saveChat(c); }
    else { const o = b.dataset.owner; f = friendById(o); const p = postOf(o, b.dataset.post); if (!p) return; ph = p.photo; at = p.at; save = () => saveOwner(o); }
    const key = b.dataset.mid || b.dataset.post; if (!f || !ph || photoBusy.has(key)) return;
    photoBusy.add(key); render();
    try { await genPhoto(f, ph, at); save(); } catch (e) { logErr(`生成照片：${(e && e.message) || e}`); toast("照片接收失败，再点一次试试"); }
    photoBusy.delete(key); render();
  };
  ACT["view-photo"] = async b => {
    const url = await mediaUrl(b.dataset.ref); if (!url) return toast("照片找不到了");
    const el = document.createElement("div"); el.className = "pview"; el.innerHTML = `<img src="${url}" alt=""><p class="tip">长按图片可以保存 · 点空白处关闭</p>`;
    el.onclick = e => { if (e.target.tagName !== "IMG") el.remove(); }; document.body.appendChild(el);
  };
  /** 说说和日志都在这里找（评论、回复、生成照片共用） */
  const itemOf = (z, id) => z && ((z.posts || []).find(p => p.id === id) || (z.blogs || []).find(b => b.id === id));
  const postOf = (owner, pid) => itemOf(owner === "me" ? A().zone : (friendById(owner) || {}).zone, pid);
  const isBlog = p => p && "title" in p;
  ACT["open-blog"] = b => {
    const o = b.dataset.owner;
    if (o && o !== S.zoneOf) ACT["open-zone"]({ dataset: { who: o } });
    S.blogId = b.dataset.id; S.zoneTab = "blogView";
    const z = curZone(); const bg = ((z.blogs || []).find(x => x.id === S.blogId) || {}).bgm; if (bg && S.meta.music.some(m => m.id === bg)) playBgm([bg]); const bl = (z.blogs || []).find(x => x.id === S.blogId); if (bl && S.zoneOf !== "me") { bl.reads = (bl.reads || 0) + 1; saveFriend(friendById(S.zoneOf)); }
    render(); const zb = $(".zone .zbody"); if (zb) zb.scrollTop = 0;
  };
  ACT["blog-photo"] = async () => { const ph = await pickPhotoFor(S.meta.cur); if (ph) { S.draftBlogPhoto = ph; render(); } };
  ACT["blog-photo-del"] = () => { S.draftBlogPhoto = null; render(); };
  ACT["blog-post"] = () => {
    const title = ($("#bt").value || "").trim(), text = ($("#bbody").value || "").trim(); if (!title) return toast("写个标题吧"); if (!text) return toast("正文还空着");
    const bl = { id: uid("g"), title, text: text.slice(0, 8000), cat: $("#bcat").value, priv: $("#bpriv").value, bgm: $("#bbgm").value || undefined, at: new Date().toISOString(), comments: [], reads: 0, ...(S.draftBlogPhoto ? { photo: S.draftBlogPhoto } : {}) };
    const z = A().zone; z.blogs = [...(z.blogs || []), bl]; S.draftBlogPhoto = null; ["bt", "bbody"].forEach(id => { $(`#${id}`).value = ""; }); saveMeta();
    if (bl.priv !== "self") for (const f of myFriends()) queueZone(f, { kind: "myBlog", pid: bl.id }, rand(10, 180) * 60e3);
    S.blogId = bl.id; S.zoneTab = "blogView"; render(); toast("日志发表成功");
  };
  ACT["del-blog"] = b => { const z = A().zone; z.blogs = (z.blogs || []).filter(x => x.id !== b.dataset.id); S.meta.queue.forEach(q => { if (q.ev) q.ev = q.ev.filter(e => e.pid !== b.dataset.id); }); saveMeta(); S.zoneTab = "blog"; render(); toast("删掉了"); };
  const saveOwner = owner => owner === "me" ? saveMeta() : saveFriend(friendById(owner));
  ACT.like = b => {
    const o = b.dataset.owner; const p = postOf(o, b.dataset.post); if (!p) return;
    const had = (p.likes || []).some(l => l.who === "me");
    p.likes = had ? p.likes.filter(l => l.who !== "me") : [...(p.likes || []), { who: "me", at: new Date().toISOString() }]; saveOwner(o);
    if (!had && o !== "me") remember(friendById(o), `${A().nick} 在 QQ 空间赞了我的说说「${p.text.slice(0, 60)}」`);
    render();
  };
  ACT["focus-cm"] = b => { const i = $(`.cmform input[data-post="${b.dataset.post}"]`); if (i) { i.dataset.to = ""; i.placeholder = "评论…"; i.focus(); } };
  /** 点一条评论 = 回复这个人 */
  ACT["reply-cm"] = b => {
    const inp = $(`.cmform input[data-post="${b.dataset.post}"]`); if (!inp) return; const w = b.dataset.who;
    if (w === "me") { inp.dataset.to = ""; inp.placeholder = "评论…"; } else { inp.dataset.to = w; inp.placeholder = `回复 ${whoName(w)}：`; }
    inp.focus();
  };
  ACT.comment = b => {
    const inp = $(`.cmform input[data-post="${b.dataset.post}"]`); const t = (inp.value || "").trim(); if (!t) return;
    const o = b.dataset.owner; const p = postOf(o, b.dataset.post); if (!p) return; const to = inp.dataset.to || "";
    p.comments = [...(p.comments || []), { who: "me", text: t, at: new Date().toISOString(), ...(to ? { to } : {}) }]; inp.value = ""; saveOwner(o);
    if (o !== "me") queueZone(friendById(o), { kind: "hisPostComment", pid: p.id }, rand(1, 4) * 60e3);
    else if (to.startsWith("f:") && friendById(to.slice(2))) queueZone(friendById(to.slice(2)), { kind: "myPostReply", pid: p.id }, rand(1, 4) * 60e3);
    render();
  };
  ACT["leave-msg"] = () => {
    const t = ($("#boardin").value || "").trim(); if (!t) return; const f = friendById(S.zoneOf);
    f.zone.board.push({ id: uid("b"), who: "me", text: t, at: new Date().toISOString() }); saveFriend(f);
    queueZone(f, { kind: "board" }, rand(2, 10) * 60e3); render(); toast("留言成功");
  };
  /** 她在自己留言板上回别人的留言；留言的是好友就让他知道 */
  ACT["board-reply"] = async b => {
    const m = A().zone.board.find(x => x.id === b.dataset.id); if (!m) return;
    const r = await ask(`回复 ${whoName(m.who)}`, [{ label: "主人回复", long: true, max: 200 }], "回复"); if (!r || !r[0]) return;
    m.reply = r[0]; m.replyAt = new Date().toISOString(); saveMeta(); render();
    const f = m.who.startsWith("f:") && friendById(m.who.slice(2)); if (f) { remember(f, `${A().nick} 在 QQ 空间回复了我的留言「${m.text.slice(0, 60)}」：「${m.reply}」`); queueZone(f, { kind: "boardReply", bid: m.id }, rand(2, 15) * 60e3); }
  };
  ACT.step = () => {
    const f = friendById(S.zoneOf); const z = f.zone;
    z.visitors = [{ who: "me", at: new Date().toISOString(), step: true }, ...(z.visitors || []).filter(v => v.who !== "me")].slice(0, 30); saveFriend(f);
    if (!S.meta.queue.some(q => q.fid === f.id && q.kind === "zone" && q.ev.some(e => e.kind === "step"))) queueZone(f, { kind: "step" }, rand(3, 20) * 60e3);
    toast("踩了一脚~ 他上线会看到的"); render();
  };

  // ───────────────────────── 导出 / 导入：整个 app 的数据存成一个文件，换个 float 链接也能搬过去 ─────────────────────────
  const MEDIA_RE = /media-store:\/\/[^"\\\s]+/g;
  function downloadFile(name, text) {
    const u = URL.createObjectURL(new Blob([text], { type: "application/json" })); const a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 2000);
  }
  async function exportData() {
    const songs = S.meta.music.length ? await new Promise(res => sheet(`<h3>导出数据</h3><p class="note">把两个号的好友、聊天记录、空间、照片、头像都存成一个文件。<br>「我的音乐」里的歌有 ${S.meta.music.length} 首，带上的话文件会很大。</p><div class="btns"><button data-v="no">不带歌</button><button data-v="yes" class="pri">带上歌</button></div>`, v => { closeSheet(); res(v === "yes"); })) : false;
    toast("正在打包…");
    const data = { meta: { ...S.meta, queue: S.meta.queue, errors: [] }, friends: S.friends, chats: S.chats };
    if (!songs) data.meta = { ...data.meta, music: [] };
    const json = JSON.stringify(data); const refs = [...new Set(json.match(MEDIA_RE) || [])]; const media = {};
    for (const r of refs) { const u = await mediaUrl(r); if (u) media[r] = u; }
    const names = Object.fromEntries(S.friends.map(f => [f.charId, charOf(f.charId).name || ""]));
    const out = JSON.stringify({ app: "nox.qq2008", version: VERSION, exportedAt: new Date().toISOString(), names, data, media });
    const d = new Date(); downloadFile(`QQ2008-数据-${ymd(d)}-${pad(d.getHours())}${pad(d.getMinutes())}.json`, out);
    toast(`导出好了（${(out.length / 1048576).toFixed(1)} MB）`);
  }
  /** 档案库角色换了链接 id 会变：按名字对上，对不上的让她选 */
  async function mapChars(names) {
    const map = {};
    for (const [old, name] of Object.entries(names)) {
      if (S.chars.some(c => c.id === old)) { map[old] = old; continue; }
      const same = S.chars.filter(c => c.name === name);
      if (same.length === 1) { map[old] = same[0].id; continue; }
      map[old] = await new Promise(res => sheet(`<h3>「${esc(name || "未知")}」是档案库里的谁？</h3><p class="note">新链接里角色的编号变了，帮我对一下。</p><div class="mlist">${S.chars.map(c => `<button class="pick" data-v="${esc(c.id)}">${avatar({ url: c.avatar, seed: c.id, name: c.name }, 30)}<span>${esc(c.name)}</span></button>`).join("")}</div><div class="btns"><button data-v="skip">跳过（不导入这个人）</button></div>`, v => { closeSheet(); res(v === "skip" ? null : v); }));
    }
    return map;
  }
  async function importData() {
    const ok = await new Promise(res => sheet(`<h3>导入数据</h3><p class="note">选之前导出的那个 .json 文件。<b>现在 app 里的数据会被全部换掉。</b></p><div class="btns"><button data-v="no">取消</button><button data-v="ok" class="pri">选文件</button></div>`, v => { closeSheet(); res(v === "ok"); }));
    if (!ok) return;
    let pack;
    try {
      const r = await api.media.pick({ accept: ".json,application/json,text/plain" }); const f = r && (r.file || (r.files || [])[0]); if (!f || !f.dataUrl) return;
      const b64 = f.dataUrl.slice(f.dataUrl.indexOf(",") + 1); const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      pack = JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return toast("这个文件读不了"); }
    if (!pack || pack.app !== "nox.qq2008" || !pack.data) return toast("这不是 QQ2008 导出的文件");
    toast("正在导入…");
    let json = JSON.stringify(pack.data);
    for (const [old, u] of Object.entries(pack.media || {})) { try { const st = await api.media.put({ dataUrl: u }); json = json.split(old).join(st.ref); } catch (e) { /* 这张图就算了 */ } }
    const map = await mapChars(pack.names || {});
    for (const [old, nu] of Object.entries(map)) if (nu && nu !== old) json = json.split(old).join(nu);
    const data = JSON.parse(json); const skip = Object.entries(map).filter(([, v]) => !v).map(([k]) => k);
    data.friends = (data.friends || []).filter(f => !skip.includes(f.charId)); data.chats = (data.chats || []).filter(c => data.friends.some(f => f.id === c.id));
    if (data.meta) data.meta.queue = (data.meta.queue || []).filter(q => data.friends.some(f => f.id === q.fid));
    for (const [col, rows] of [[COL.friends, S.friends], [COL.chats, S.chats]]) for (const r of rows) await dbDel(col, r.id);
    for (const f of data.friends) await dbPut(COL.friends, f);
    for (const c of data.chats) await dbPut(COL.chats, c);
    await dbPut(COL.meta, { ...data.meta, id: "meta" });
    toast("导入好了"); setTimeout(() => location.reload(), 800);
  }
  function themeSheet() {
    const cur = S.meta.theme || "classic";
    sheet(`<h3>更换皮肤</h3><div class="themes">${THEMES.map(([k, n, d]) => `<button data-v="${k}" class="${cur === k ? "on" : ""}"><i class="sw sw-${k}"></i><b>${n}</b><small>${d}</small></button>`).join("")}</div><div class="btns"><button data-v="no" class="pri">好了</button></div>`,
      v => { if (v === "no") return closeSheet(); S.meta.theme = v; saveMeta(); applyTheme(v); themeSheet(); });
  }
  // 我的音乐：传 mp3，空间里挑歌
  function musicSheet() {
    sheet(`<h3>我的音乐</h3><p class="note">把手机里的歌传上来（mp3、flac 都行），空间的背景音乐从这里挑。</p><div class="mlist">${S.meta.music.map(m => `<div class="song"><span>♫ ${esc(m.name)}</span><button data-v="del:${esc(m.id)}">删除</button></div>`).join("") || `<div class="note">还没有歌</div>`}</div><div class="btns"><button data-v="no">关闭</button><button data-v="add" class="pri">＋ 传一首歌</button></div>`,
      async (v, b) => {
        if (v === "no") return closeSheet();
        if (v.startsWith("del:")) { const id = v.slice(4); S.meta.music = S.meta.music.filter(m => m.id !== id); for (const a of Object.values(S.meta.accts)) if (a.zone.bgm) a.zone.bgm = a.zone.bgm.filter(x => x !== id); saveMeta(); return musicSheet(); }
        if (v === "add") { b.disabled = true; b.textContent = "正在上传…"; const song = await addSong(); if (song) musicSheet(); else { b.disabled = false; b.textContent = "＋ 传一首歌"; } }
      });
  }
  async function addSong() {
    try {
      const f = await pickFile("audio/*,.flac,.mp3,.m4a"); if (!f || !f.dataUrl) return null;
      const st = await api.media.put({ dataUrl: f.dataUrl });
      const guess = String(f.name || "").replace(/\.[^.]+$/, "") || "未命名";
      const r = await ask("这首歌叫什么", [{ label: "歌名（比如：周杰伦 - 稻香）", value: guess, max: 40 }]);
      const song = { id: uid("s"), name: (r && r[0]) || guess, ref: st.ref }; S.meta.music.push(song); saveMeta(); return song;
    } catch (e) { toast(`上传失败：${(e && e.message) || e}`.slice(0, 40)); return null; }
  }
  /** 给空间挑背景音乐：她的空间挑好几首轮着放；他的空间她也能给配（他挂的歌名不变） */
  function pickBgm() {
    const z = curZone(); const sel = new Set(z.bgm || []); const mine = S.zoneOf === "me";
    sheet(`<h3>${mine ? "我的背景音乐" : `给${esc(nameOf(friendById(S.zoneOf)))}的空间配歌`}</h3>${!mine && z.bgmName ? `<p class="note">他挂的是：${esc(z.bgmName)}。你可以传这首歌，或者挑别的配上。</p>` : `<p class="note">勾几首，进空间就按顺序轮着放。</p>`}
      <div class="mlist">${S.meta.music.map(m => `<label class="song"><input type="checkbox" value="${esc(m.id)}" ${sel.has(m.id) ? "checked" : ""}> ${esc(m.name)}</label>`).join("") || `<div class="note">歌单还是空的</div>`}</div>
      <div class="btns"><button data-v="add">＋ 传一首</button><button data-v="ok" class="pri">好了</button></div>`,
      async (v, b) => {
        if (v === "add") { b.disabled = true; const s = await addSong(); if (s) { z.bgm = [...[...document.querySelectorAll("#sheet input:checked")].map(i => i.value), s.id]; saveZone(); } return pickBgm(); }
        z.bgm = [...document.querySelectorAll("#sheet input:checked")].map(i => i.value); saveZone(); closeSheet();
        if (z.bgm.length) playBgm(z.bgm); else stopBgm(); render();
      });
  }
  const saveZone = () => { if (S.zoneOf === "me") saveMeta(); else saveFriend(friendById(S.zoneOf)); };

  // ───────────────────────── AI：加好友时生成他的 QQ 资料和空间 ─────────────────────────
  function logErr(t) { S.meta.errors = [`${hm(new Date())} ${String(t).slice(0, 120)}`, ...(S.meta.errors || [])].slice(0, 5); saveMeta(); }
  async function gen(f, tag, instruction) {
    try {
      const r = await api.ai.generate({ characterId: f.charId, appTags: ["nox_qq", tag], instruction: `${instruction}\n\n【输出要求】只输出要求的块，不要解释、不要旁白。` });
      return String((r && r.text) || "");
    } catch (e) { logErr(`${nameOf(f)}：${(e && e.message) || e}`); return null; }
  }
  const block = (raw, name) => { const m = String(raw || "").match(new RegExp(`===\\s*${name}\\s*===([\\s\\S]*?)(?====|$)`)); return m ? m[1].replace(/===\s*结束\s*===/g, "").trim() : null; };
  const blocks = (raw, name) => { const out = []; const re = new RegExp(`===\\s*${name}\\s*===([\\s\\S]*?)(?====|$)`, "g"); let m; while ((m = re.exec(String(raw || "")))) { const t = m[1].replace(/===\s*结束\s*===/g, "").trim(); if (t) out.push(t); } return out; };
  const field = (txt, k) => { const m = String(txt || "").match(new RegExp(`${k}\\s*[：:]\\s*([^\\n]*)`)); return m ? m[1].trim() : ""; };
  const pastAt = (minH, maxH) => new Date(Date.now() - rand(minH * 60, maxH * 60) * 60e3).toISOString();
  // 他身边的人：常来他空间的人，加好友时 AI 照人设定好，存在 f.circle，之后来赞、来评论的都是这几个
  const CIRCLE_ASK = "===身边的人===\n常来你空间的 QQ 好友，按你的人设来，人设里写了你身边的人就用他们。一行一个：QQ 昵称——是你的谁\n===结束===\n（4 到 6 个）";
  function parseCircle(raw) {
    return (block(raw, "身边的人") || "").split("\n").map(l => l.replace(/^[-·\d.、\s]+/, "").trim()).filter(Boolean).map(l => { const m = l.match(/^(.{1,16}?)\s*(?:——|—|--|：|:)\s*(.*)$/); return m ? { name: m[1].trim(), who: m[2].trim().slice(0, 40) } : { name: l.slice(0, 16), who: "" }; }).filter(x => x.name).slice(0, 8);
  }
  /** 还没定圈子的老好友：先拿加好友时生成的访客、留言里的人 */
  function circleOf(f) {
    if (f.circle && f.circle.length) return f.circle;
    const z = f.zone || {}; const names = [...(z.visitors || []).map(v => v.who), ...(z.board || []).map(b => b.who)].filter(w => w && w !== "me" && !w.startsWith("f:") && w !== "路人");
    return [...new Set(names)].slice(0, 6).map(name => ({ name, who: "" }));
  }
  const circleLine = f => { const c = circleOf(f); return c.length ? `常来你空间的人：${c.map(x => x.who ? `${x.name}（${x.who}）` : x.name).join("、")}。` : ""; };
  /** 别人（他身边的人）不能写成用户 */
  const notUser = (f, n) => n && n !== "用户" && n !== "你" && n !== S.meta.accts[f.acct].nick && n.length <= 16;
  /** 「昵称：话」或「昵称：回复 某某：话」一行一条；「你」是他自己 */
  function parseCm(f, txt) {
    const out = [];
    for (const l of String(txt || "").split("\n").map(x => x.trim()).filter(Boolean)) {
      const m = l.match(/^([^：:]{1,16})[：:]\s*(.+)$/); if (!m) continue;
      let who = m[1].trim(), text = m[2].trim(), to = "";
      const r = text.match(/^回复\s*([^：:]{1,16})[：:]\s*(.+)$/); if (r) { to = r[1].trim(); text = r[2].trim(); }
      const id = n => n === "你" || n === "我" ? `f:${f.id}` : n === "用户" || n === S.meta.accts[f.acct].nick ? "me" : n;
      who = id(who); if (who === "me" || !(who.startsWith("f:") || notUser(f, who))) continue;
      out.push({ who, text: text.slice(0, 200), ...(to ? { to: id(to) } : {}) });
    }
    return out;
  }
  async function seedFriend(f) {
    const acct = f.acct;
    const raw = await gen(f, "seed", [ERA_RULE(acct), COMMON_RULE,
      `你的 QQ 号是 ${f.qq}。QQ 昵称「${S.meta.accts[acct].nick}」的用户（QQ ${S.meta.accts[acct].qq}）申请加你好友，验证信息：「${f.verify || ""}」。按你的人设、你的记忆和你们的关系决定同不同意。`,
      "===验证===\n同意 或 拒绝\n===结束===\n如果拒绝，再写一句拒绝理由：\n===理由===\n理由\n===结束===",
      "同意的话，再按你的人设和你那边的生活，写出你 QQ 资料和 QQ 空间里本来就有的东西（都是你自己写的、你身边的人留的，写真实的，不提用户）：",
      `===资料===\n个性签名：\n${FONT_ASK}，写在这行——字体：\n空间名字：\n空间签名：\n背景音乐：歌手 - 歌名（${acct === "a08" ? "2008 年以前就有的歌" : "你会挂的歌"}）\n===结束===`,
      "===说说===\n你以前发的一条说说\n===结束===\n（写 3 条）",
      CIRCLE_ASK,
      "===访客===\n来过你空间的人的 QQ 昵称，一行一个，3 到 5 个（从上面那些人里出）\n===结束===",
      "===留言===\n昵称：你身边的人在你留言板上写的话\n主人回复：你的回复（可以不写）\n===结束===\n（写 2 到 3 条）",
    ].join("\n\n"));
    if (raw == null) return null;
    if (/拒绝/.test(block(raw, "验证") || "")) return { ok: false, why: (block(raw, "理由") || "").slice(0, 60) };
    const info = block(raw, "资料") || "";
    const circle = parseCircle(raw); if (circle.length) f.circle = circle;
    const font = parseFont(field(info, "字体")); if (font) f.font = font;
    f.sig = field(info, "个性签名").slice(0, 60); f.zone.name = field(info, "空间名字").slice(0, 20) || f.zone.name; f.zone.sig = field(info, "空间签名").slice(0, 40); f.zone.bgmName = field(info, "背景音乐").slice(0, 40);
    f.zone.posts = blocks(raw, "说说").slice(0, 4).map((t, i) => ({ id: uid("p"), text: t.slice(0, 300), at: pastAt(24 * (i + 1) - 20, 24 * (i + 2)), comments: [] }));
    f.zone.visitors = (block(raw, "访客") || "").split("\n").map(s => s.replace(/^[-·\d.、\s]+/, "").trim()).filter(Boolean).slice(0, 6).map((n, i) => ({ who: n.slice(0, 16), at: pastAt(i * 8 + 1, i * 12 + 10) }));
    f.zone.board = blocks(raw, "留言").slice(0, 4).map((b, i) => { const lines = b.split("\n"); const first = lines[0]; const m = first.match(/^([^：:]{1,16})[：:]\s*(.+)$/); const reply = field(b, "主人回复");
      return { id: uid("b"), who: m ? m[1].trim() : "路人", text: (m ? m[2] : first).slice(0, 200), at: pastAt(24 * i + 3, 24 * i + 30), ...(reply && !/^(无|不写|没有)$/.test(reply) ? { reply: reply.slice(0, 200) } : {}) }; });
    saveFriend(f); return { ok: true };
  }

  // ───────────────────────── AI：他回消息 ─────────────────────────
  /** 她发完一批他才回：在线 6～20 秒；离开 2～8 分钟；不在线就等他上线（睡着了早上起来回） */
  function queueReply(f) {
    const old = S.meta.queue.find(q => q.fid === f.id && q.kind === "reply"); const st = statusOf(f); const now = Date.now();
    let due;
    if (st === "online") due = now + rand(6, 20) * 1000 * TS();
    else if (st === "away") due = now + rand(2, 8) * 60e3 * TS();
    else due = now + (nextOnline(f).getTime() - now + rand(1, 25) * 60e3) * TS();
    if (old) { if (st === "online") old.due = new Date(due).toISOString(); } // 在线时她还在说，就再等等
    else S.meta.queue.push({ fid: f.id, kind: "reply", due: new Date(due).toISOString(), typing: st === "online" });
    saveMeta();
  }
  function queueZone(f, ev, delayMs) {
    const q = S.meta.queue.find(x => x.fid === f.id && x.kind === "zone");
    if (q) { q.ev.push(ev); saveMeta(); return; }
    const now = Date.now(); const st = statusOf(f); const base = st === "offline" ? nextOnline(f).getTime() - now : 0;
    S.meta.queue.push({ fid: f.id, kind: "zone", ev: [ev], due: new Date(now + (base + delayMs) * TS()).toISOString() }); saveMeta();
  }
  const msgLine = (m, f) => `[${hms(thereDate(f.acct, new Date(m.at))).slice(0, 5)}] ${m.from === "me" ? "用户" : "你"}：${m.shake ? "[窗口抖动]" : `${photoText(m.photo, m.from === "me")}${m.text || ""}`}`;
  function zoneCtx(f, noPosts) {
    const z = f.zone, mz = S.meta.accts[f.acct].zone; const lines = [];
    const v = (z.visitors || []).find(x => x.who === "me"); if (v) lines.push(`用户${ago(f.acct, v.at)}${v.step ? "在你空间踩了一脚" : "来过你的空间"}。`);
    const myBoard = (z.board || []).filter(b => b.who === "me").slice(-3); if (myBoard.length) lines.push(`用户在你留言板上写过：${myBoard.map(b => `「${b.text}」${b.reply ? `（你回了「${b.reply}」）` : ""}`).join("")}`);
    const mp = noPosts ? [] : (mz.posts || []).slice(-2); if (mp.length) lines.push(`用户空间最近的说说：${mp.map(p => `「${p.text}${photoText(p.photo, true)}」`).join("")}`);
    return lines.join("\n");
  }
  const FMT_REPLY = `每条消息一个块：
===消息===
一条消息
===结束===
要给用户发窗口抖动，单独写一个块，内容只写「[抖动]」。
想改 QQ 个性签名时加：
===签名===
新的签名
===结束===
要下线时（家里人叫、要睡了、有事），在最后加：
===下线===
多少分钟后再上线（只写数字）
===结束===`;
  async function genReply(f, q) {
    const c = chatOf(f.id); const acct = f.acct; const me = S.meta.accts[acct];
    let s = c.msgs.length; while (s > 0 && c.msgs[s - 1].from === "me") s--;
    const pending = c.msgs.slice(s).filter(m => m.from === "me");
    const hist = c.msgs.slice(0, s).filter(m => m.from !== "sys").slice(-40).map(m => msgLine(m, f)).join("\n");
    for (const m of pending) if (m.photo) await seePhoto(f, m.photo); if (pending.some(m => m.photo)) saveChat(c);
    const futures = futureIn(acct, pending.map(m => m.text).join(" "));
    const late = q.wasOffline ? `用户是在你不在线的时候发来的（${pending[0] ? hm(thereDate(acct, new Date(pending[0].at))) : ""}），你刚上线才看到。` : "";
    const lines = [
      ERA_RULE(acct),
      `- 你在用 QQ 和用户聊天：打字随意，可以连着发几条，一次一到五条消息。可以用 QQ 表情，写成「/表情名」，只能用这些：${FACE_NAMES.join(" ")}。用多用少按你的人设。`,
      COMMON_RULE,
      `你的 QQ 个性签名：${f.sig || "（空）"}。用户的 QQ 昵称是「${me.nick}」，个性签名：${me.sig || "（空）"}。`,
      zoneCtx(f),
      hist ? `你们之前在 QQ 上的聊天：\n${hist}` : "这是你们在 QQ 上第一次聊天。你们之前可能用别的方式联系过，按你的记忆来。",
      late,
      pending.length ? `用户刚刚${pending.length > 1 ? "连着" : ""}发来：${pending.map(m => m.shake ? "[窗口抖动]" : `「${photoText(m.photo, true)}${m.text || ""}」`).join("")}${pending.some(m => m.photo) ? "（[照片] 是用户拍了发给你的照片，括号里是照片上的样子）" : ""}` : "",
      futures.length ? `用户提到的「${futures.join("」「")}」，是你那边还没有的东西，你没听说过。` : "",
      FMT_REPLY,
      `想送用户 QQ秀时加（她的 QQ秀；名字只能从下面挑）：\n===送QQ秀===\n名字：这份礼物叫什么\n包含：挑的东西，用顿号隔开\n===结束===\n想给自己换 QQ秀时加：\n===换装===\n衣服：\n发型：\n配饰：\n背景：\n表情：\n===结束===（不换的项空着）\n她能用的：\n${catText("f")}\n你能用的：\n${catText(hisShow(f).g)}`,
      `${acct === "a08" ? "你的照片是用数码相机或者拍照手机拍的，传到电脑上再发。" : ""}想给用户发你拍的照片时（发不发按你的人设和当时的心情，一次最多一张），加：\n===照片===\n画面：照片里拍到了什么（场景、人物、物品、光线，客观写清楚，只能是你身边真实的东西）\n配的话：一句话，可以不写\n===结束===`,
      !f.font ? `你还没定 ${FONT_ASK}。按你的人设挑，加上：\n===字体===\n颜色 加粗或不加粗\n===结束===` : !f.fontByMe ? `你现在的 QQ 字体是${FONT_NAMES[FONT_COLORS.indexOf(f.font.color)] || "黑色"}${f.font.bold ? "加粗" : ""}。想换字体时加（${FONT_NAMES.join(" ")}）：\n===字体===\n颜色 加粗或不加粗\n===结束===` : "",
    ].filter(Boolean).join("\n\n");
    let raw = await gen(f, "chat", lines); if (raw == null) return null;
    const textOf = r => blocks(r, "消息").join(" ");
    const leak = futureIn(acct, textOf(raw)).filter(w => !futures.includes(w));
    if (leak.length) { const again = await gen(f, "chat", `${lines}\n\n你刚才写了「${leak.join("」「")}」，这是你那边还没有的东西，你不可能知道。重写。`); if (again && blocks(again, "消息").length) raw = again; }
    let msgs = blocks(raw, "消息"); if (!msgs.length && raw && !/===/.test(raw)) msgs = [raw.trim()];
    const pb = block(raw, "照片"); const cap = pb ? field(pb, "配的话") : "";
    const photo = pb ? { desc: (field(pb, "画面") || pb).slice(0, 200), caption: /^(无|不写|没有)?$/.test(cap) ? "" : cap.slice(0, 200) } : null;
    if (!msgs.length && !photo && !/===\s*(送QQ秀|换装)\s*===/.test(raw)) return { msgs: [] };
    return { raw, msgs: msgs.slice(0, 6).map(t => t.slice(0, 500)), photo, sig: block(raw, "签名"), font: parseFont(block(raw, "字体")), off: parseInt(block(raw, "下线") || "", 10) };
  }
  /** 空间里的事（她留言、踩、评论、发说说）攒一起，他上线后一次处理 */
  async function genZone(f, q) {
    const acct = f.acct; const z = f.zone; const mz = S.meta.accts[acct].zone; const evs = q.ev;
    const todo = [];
    if (evs.some(e => e.kind === "board")) { const un = z.board.filter(b => b.who === "me" && !b.reply); if (un.length) todo.push(`用户在你的留言板上留言：${un.map(b => `「${b.text}」`).join("")}。写主人回复。`); }
    if (evs.some(e => e.kind === "step")) todo.push("用户在你的空间踩了一脚。你可以回踩（去她空间留下脚印），也可以在她的留言板上留言。");
    const cmText = p => (p.comments || []).filter(shown).slice(-8).map(cm => `${cm.who === "me" ? "用户" : cm.who === `f:${f.id}` ? "你" : whoName(cm.who)}${cm.to ? ` 回复 ${cm.to === "me" ? "用户" : cm.to === `f:${f.id}` ? "你" : whoName(cm.to)}` : ""}：${cm.text}`).join("\n");
    let others = false;
    for (const e of evs.filter(e => e.kind === "hisPostComment")) { const p = itemOf(z, e.pid); const mine = p && (p.comments || []).filter(cm => cm.who === "me").slice(-1)[0];
      if (mine) { others = true; todo.push(`${isBlog(p) ? `你的日志《${p.title}》` : `你的说说「${p.text.slice(0, 80)}${photoText(p.photo)}」`}下面的评论：\n${cmText(p)}\n用户刚评论${mine.to && mine.to !== `f:${f.id}` ? `（回复 ${whoName(mine.to)}）` : ""}：「${mine.text}」。回不回、怎么回按你的人设来。`); } }
    for (const e of evs.filter(e => e.kind === "myPost")) { const p = mz.posts.find(x => x.id === e.pid); if (p && p.photo && !p.photo.seen) { await seePhoto(f, p.photo); saveMeta(); } if (p) todo.push(`你刷到用户在她空间新发的说说：「${p.text}${photoText(p.photo, true)}」。赞不赞、评不评论按你们的关系和你的人设决定，也可以都不做。`); }
    for (const e of evs.filter(e => e.kind === "boardReply")) { const m = (mz.board || []).find(x => x.id === e.bid); if (m && m.reply) todo.push(`你在用户留言板上留过言：「${m.text}」，她回复了：「${m.reply}」。想接着说就在她留言板上再留一条，不想也可以不写。`); }
    for (const e of evs.filter(e => e.kind === "gotShow")) todo.push(`用户在 QQ 上送了你一件 QQ秀「${e.name}」。想穿上就写 ===换装===，想谢她可以在她留言板上留言。\n你能用的：\n${catText(hisShow(f).g)}\n===换装===\n衣服：\n发型：\n配饰：\n背景：\n表情：\n===结束===（不换的项空着）`);
    for (const e of evs.filter(e => e.kind === "myBlog")) { const b = (mz.blogs || []).find(x => x.id === e.pid); if (b) { if (b.photo && !b.photo.seen) { await seePhoto(f, b.photo); saveMeta(); } todo.push(`你看到用户在她空间写了一篇日志《${b.title}》${b.priv === "friends" ? "（仅好友可见）" : ""}：\n${b.text.slice(0, 2000)}${photoText(b.photo, true)}\n评不评论按你们的关系和你的人设决定。`); } }
    for (const e of evs.filter(e => e.kind === "myPostReply")) { const p = itemOf(mz, e.pid); const mine = p && (p.comments || []).filter(cm => cm.who === "me" && cm.to === `f:${f.id}`).slice(-1)[0]; if (mine) todo.push(`用户在她自己的${isBlog(p) ? `日志《${p.title}》` : `说说「${p.text.slice(0, 80)}」`}下回复了你：「${mine.text}」。回不回按你的人设来。`); }
    if (!todo.length) return {};
    const raw = await gen(f, "zone", [ERA_RULE(acct), COMMON_RULE, `这是 QQ 空间里的事。用户的 QQ 昵称是「${S.meta.accts[acct].nick}」。`, zoneCtx(f), others ? circleLine(f) : "", ...todo,
      ["按需要输出这些块（没有就不写）：\n===主人回复===\n回复用户留言的话\n===结束===\n===评论回复===\n在你说说下回复用户评论的话\n===结束===",
        others ? "===别人回复===\n你身边的人看到用户的评论后回她的话（没人回就不写这个块），一行一条：昵称：话\n===结束===\n===回别人===\n你在这条说说下回复别人的话（不回就不写），一行一条：昵称：话\n===结束===" : "",
        "===赞===\n（赞用户的说说就写这个块，内容留空）\n===结束===\n===评论===\n评论用户说说的话\n===结束===\n===日志评论===\n评论用户日志的话\n===结束===\n===回她===\n在用户说说下回复她的话\n===结束===\n===回踩===\n（去她空间踩一脚就写这个块，内容留空）\n===结束===\n===留言===\n在用户留言板上写的话\n===结束===\n想发一条新说说：\n===说说===\n内容\n===结束==="].filter(Boolean).join("\n")].filter(Boolean).join("\n\n"));
    if (raw == null) return null;
    return { reply: block(raw, "主人回复"), creply: block(raw, "评论回复"), others: others ? parseCm(f, block(raw, "别人回复")).filter(c => !c.who.startsWith("f:")) : [], toOthers: others ? parseCm(f, block(raw, "回别人")).map(c => ({ to: c.who.startsWith("f:") ? c.to || "" : c.who.replace(/^回复\s*/, ""), text: c.text })).filter(c => c.to && c.to !== "me" && !c.to.startsWith("f:")) : [], like: /===\s*赞\s*===/.test(raw), comment: block(raw, "评论"), bcomment: block(raw, "日志评论"), back: block(raw, "回她"), step: /===\s*回踩\s*===/.test(raw), board: block(raw, "留言"), post: block(raw, "说说"), evs, raw };
  }
  /** 写进他的记忆；返回 appEventId（重新回复时按它把这条删掉） */
  function remember(f, summary, id = uid("qq")) {
    if (!api.memory || !api.memory.addTimeline) return null;
    api.memory.addTimeline({ characterId: f.charId, appLabel: "QQ", detail: "qq", summary: summary.slice(0, 1500), appEventId: id }).catch(() => {});
    return id;
  }
  const forget = (f, id) => { if (id && api.memory && api.memory.deleteTimeline) api.memory.deleteTimeline({ characterId: f.charId, appEventId: id }).catch(() => {}); };

  // 定时：处理到点的回复 / 空间事件；看看谁上线了
  let busy = false;
  async function tick() {
    if (busy || !S.meta.cur) return; busy = true;
    try {
      for (const q of S.meta.queue.filter(q => new Date(q.due) <= new Date())) {
        const f = friendById(q.fid); if (!f) { S.meta.queue = S.meta.queue.filter(x => x !== q); continue; }
        if (statusOf(f) === "offline") { q.due = new Date(Date.now() + (nextOnline(f).getTime() - Date.now() + rand(1, 20) * 60e3) * TS()).toISOString(); q.wasOffline = true; saveMeta(); continue; }
        if (q.kind === "verify") {
          const r = await seedFriend(f);
          // AI 没回上来就一直等着重试（前三次隔 1 分钟，之后隔 10 分钟），别把申请弄丢
          if (!r) { q.tries = (q.tries || 0) + 1; q.due = new Date(Date.now() + (q.tries < 3 ? 60e3 : 600e3)).toISOString(); saveMeta(); continue; }
          S.meta.queue = S.meta.queue.filter(x => x !== q); saveMeta();
          if (r.ok) { f.pending = false; delete f.verify; saveFriend(f); S.meta.queue.push({ fid: f.id, kind: "showcheck", due: new Date(Date.now() + rand(60, 600) * 1000 * TS()).toISOString() }); const c = chatOf(f.id); c.msgs.push({ id: uid("m"), from: "sys", text: `${nameOf(f)} 已经通过了你的好友请求，现在可以开始聊天了。`, at: new Date().toISOString() }); saveChat(c);
            remember(f, `${S.meta.accts[f.acct].nick}（QQ ${S.meta.accts[f.acct].qq}）在 QQ 上加了我好友，我通过了`); play("online"); qqPop("系统消息", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b><br>通过了你的好友请求</div>`); lastStatus[f.id] = statusOf(f); }
          else { S.friends = S.friends.filter(x => x !== f); dbDel(COL.friends, f.id); play("msg"); qqPop("系统消息", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b><br>拒绝了你的好友请求${r.why ? `：${esc(r.why)}` : ""}</div>`); }
          render(); continue;
        }
        if (q.kind === "reply") {
          const r = await genReply(f, q);
          if (!r || (!r.msgs.length && !r.photo && !r.raw)) { q.tries = (q.tries || 0) + 1; if (q.tries < 3) { q.due = new Date(Date.now() + 20e3).toISOString(); saveMeta(); continue; } }
          S.meta.queue = S.meta.queue.filter(x => x !== q); saveMeta();
          if (r && (r.msgs.length || r.photo || r.raw)) await deliver(f, r);
        } else if (q.kind === "showcheck") {
          const r = await genShowCheck(f);
          if (r == null) { q.tries = (q.tries || 0) + 1; q.due = new Date(Date.now() + (q.tries < 3 ? 60e3 : 600e3)).toISOString(); saveMeta(); continue; }
          S.meta.queue = S.meta.queue.filter(x => x !== q); saveMeta(); if (S.view === "show" || S.view === "main") render();
        } else if (q.kind === "zone") {
          const r = await genZone(f, q);
          if (r == null) { q.tries = (q.tries || 0) + 1; if (q.tries < 3) { q.due = new Date(Date.now() + 60e3).toISOString(); saveMeta(); continue; } }
          S.meta.queue = S.meta.queue.filter(x => x !== q); saveMeta();
          if (r) applyZone(f, r);
        }
      }
      for (const f of myFriends()) {
        if (planDay(f)) saveFriend(f);
        const it = f.plan.items.find(x => !x.done && new Date(x.at) <= new Date()); if (!it) continue;
        it.tries = (it.tries || 0) + 1;
        const ok = it.kind === "post" ? await selfPost(f, it) : it.kind === "blog" ? await selfBlog(f, it) : await browse(f, it);
        if (ok || it.tries >= 3) it.done = true; saveFriend(f);
        if (ok && (S.view === "zone" || S.view === "main") && !zoneTyping()) render();
      }
      notifyReplies();
    } finally { busy = false; }
  }
  const zoneTyping = () => { const a = document.activeElement; return !!(a && /INPUT|TEXTAREA/.test(a.tagName) && a.value); };
  /** 他的消息一条条冒出来（按打字速度隔几秒） */
  async function deliver(f, r) {
    const c = chatOf(f.id); const parts = []; const mem = uid("qq");
    if (r.font && !f.fontByMe) { const changed = f.font && (f.font.color !== r.font.color || f.font.bold !== r.font.bold); f.font = r.font; saveFriend(f); if (changed) remember(f, `我把 QQ 字体换成了${FONT_NAMES[FONT_COLORS.indexOf(r.font.color)]}${r.font.bold ? "加粗" : ""}`); }
    for (const [i, t] of r.msgs.entries()) {
      if (i) await wait(Math.min(4000, 600 + t.length * 120) * TS());
      const shake = /^\[?抖动\]?$/.test(t.trim());
      const m = { id: uid("m"), from: "him", text: shake ? "" : t, shake, at: new Date().toISOString(), read: S.view === "chat" && S.fid === f.id, mem, ...(f.font ? { color: f.font.color, bold: f.font.bold } : {}) };
      c.msgs.push(m); saveChat(c); parts.push(shake ? "[窗口抖动]" : t);
      if (shake && S.view === "chat" && S.fid === f.id) shakeScreen(); else play("msg");
      if (S.view === "chat" && S.fid === f.id) render(); else if (S.view === "main") render(); else qqPop("QQ 消息", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b><br>${richText(shake ? "给你发了一个窗口抖动" : t).slice(0, 200)}</div>`);
    }
    if (r.photo) {
      if (parts.length) await wait(3000 * TS());
      c.msgs.push({ id: uid("m"), from: "him", text: r.photo.caption, photo: { desc: r.photo.desc }, at: new Date().toISOString(), read: S.view === "chat" && S.fid === f.id, mem, ...(f.font ? { color: f.font.color, bold: f.font.bold } : {}) }); saveChat(c);
      parts.push(`${photoText({ desc: r.photo.desc })}${r.photo.caption}`); play("msg");
      if (S.view === "chat" && S.fid === f.id) render(); else qqPop("QQ 消息", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b><br>[图片]</div>`);
    }
    if (r.raw) applyShowBlocks(f, r.raw);
    if (r.sig) { f.sig = r.sig.slice(0, 60); saveFriend(f); }
    if (r.off > 0) { f.offUntil = new Date(Date.now() + Math.min(600, r.off) * 60e3 * TS()).toISOString(); saveFriend(f); }
    const mine = c.msgs.filter(m => m.from === "me").slice(-3).map(m => m.shake ? "[窗口抖动]" : `「${photoText(m.photo, true)}${(m.text || "").slice(0, 60)}」`).join("");
    remember(f, `在 QQ 上，${S.meta.accts[f.acct].nick}（QQ ${S.meta.accts[f.acct].qq}）说${mine}，我回：${parts.map(t => `「${t.slice(0, 60)}」`).join("")}${r.sig ? `；我把 QQ 签名改成了「${r.sig}」` : ""}${r.off > 0 ? "；然后我下线了" : ""}`, mem);
    if (S.view !== "zone") render();
  }
  function applyZone(f, r) {
    if (r.raw && /===\s*(送QQ秀|换装)\s*===/.test(r.raw)) applyShowBlocks(f, r.raw);
    const z = f.zone, mz = S.meta.accts[f.acct].zone; const now = new Date().toISOString(); const notes = [];
    if (r.reply) { const un = z.board.filter(b => b.who === "me" && !b.reply); un.forEach(b => { b.reply = r.reply.slice(0, 200); b.replyAt = now; }); if (un.length) notes.push(`回复了她的留言：「${r.reply}」`); }
    const hisPids = [...new Set(r.evs.filter(e => e.kind === "hisPostComment").map(e => e.pid))], myPids = [...new Set(r.evs.filter(e => e.kind === "myPost").map(e => e.pid))], backPids = [...new Set(r.evs.filter(e => e.kind === "myPostReply").map(e => e.pid))], blogPids = [...new Set(r.evs.filter(e => e.kind === "myBlog").map(e => e.pid))];
    if (r.creply) { for (const pid of hisPids) { const p = itemOf(z, pid); if (p) p.comments.push({ who: `f:${f.id}`, to: "me", text: r.creply.slice(0, 200), at: now, seen: true }); } notes.push(`回复了她在我说说下的评论：「${r.creply}」`); }
    const lastP = itemOf(z, hisPids[hisPids.length - 1]); const otherAt = {};
    if (r.others && r.others.length && lastP) { let t = Date.now();
      for (const c of r.others) { t += rand(2, 40) * 60e3; otherAt[c.who] = t; lastP.comments.push({ who: c.who, to: c.to && c.to !== "me" ? c.to : "me", text: c.text, at: new Date(t).toISOString() }); } }
    // 他回别人：回的是刚冒出来的那几个人，就排在他们后面
    if (r.toOthers && r.toOthers.length && lastP) { for (const c of r.toOthers) lastP.comments.push({ who: `f:${f.id}`, to: c.to, text: c.text, at: otherAt[c.to] ? new Date(otherAt[c.to] + rand(1, 20) * 60e3).toISOString() : now }); notes.push(`在说说下回了${r.toOthers.map(c => c.to).join("、")}`); }
    if (r.like) { for (const pid of myPids) { const p = mz.posts.find(x => x.id === pid); if (p && !(p.likes || []).some(l => l.who === `f:${f.id}`)) p.likes = [...(p.likes || []), { who: `f:${f.id}`, at: now }]; } if (myPids.length) notes.push("赞了她的说说"); }
    if (r.comment) { for (const pid of myPids) { const p = mz.posts.find(x => x.id === pid); if (p) p.comments.push({ who: `f:${f.id}`, text: r.comment.slice(0, 200), at: now }); } notes.push(`评论了她的说说：「${r.comment}」`); }
    for (const pid of blogPids) { const b = (mz.blogs || []).find(x => x.id === pid); if (!b) continue; b.reads = (b.reads || 0) + 1; notes.push(`看了她的日志《${b.title}》`);
      if (r.bcomment) { b.comments = [...(b.comments || []), { who: `f:${f.id}`, text: r.bcomment.slice(0, 300), at: now }]; notes.push(`评论：「${r.bcomment}」`); } }
    if (r.back) { for (const pid of backPids) { const p = itemOf(mz, pid); if (p) p.comments.push({ who: `f:${f.id}`, to: "me", text: r.back.slice(0, 200), at: now, seen: true }); } notes.push(`在她说说下回复她：「${r.back}」`); }
    if (r.step) { mz.visitors = [{ who: `f:${f.id}`, at: now, step: true }, ...(mz.visitors || []).filter(v => v.who !== `f:${f.id}`)].slice(0, 30); notes.push("去她空间回踩了一脚"); }
    if (r.board) { mz.board.push({ id: uid("b"), who: `f:${f.id}`, text: r.board.slice(0, 200), at: now }); notes.push(`在她留言板上留言：「${r.board}」`); }
    if (r.post) { z.posts.push({ id: uid("p"), text: r.post.slice(0, 300), at: now, comments: [], likes: [] }); notes.push(`发了一条说说：「${r.post}」`); }
    saveFriend(f); saveMeta();
    if (notes.length) remember(f, `在 QQ 空间里，我${notes.join("，")}`);
    if (notes.some(n => !n.startsWith("看了她的日志"))) { qqPop("QQ空间", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b><br>${r.board ? "给你留言了" : r.bcomment && blogPids.length ? "评论了你的日志" : r.comment ? "评论了你的说说" : r.creply || r.back ? "回复了你的评论" : r.like && myPids.length ? "赞了你的说说" : r.step ? "踩了你的空间" : "有新动态"}</div>`); play("msg"); }
    if (S.view === "zone" || S.view === "main") render();
  }
  // ───────────────────────── 他自己上空间：每天发 1～3 条说说、逛 1～3 次她的空间 ─────────────────────────
  // f.plan = { day, items: [{ kind: post|browse, at, done }] }，时间挑他醒着的时候；她没开 app 错过的，下次打开补上（时间还是原来那个点）
  function planDay(f) {
    const today = ymd(new Date()); if (f.plan && f.plan.day === today) return false;
    const start = new Date(); start.setHours(0, 0, 0, 0); const items = [];
    const pick = () => { for (let i = 0; i < 60; i++) { const d = new Date(start.getTime() + rand(0, 1439) * 60e3); if (statusOf(f, d) !== "offline") return d; } return null; };
    for (const [kind, n] of [["post", rand(1, 3)], ["browse", rand(1, 3)], ["blog", Math.random() < 0.3 ? 1 : 0]]) for (let i = 0; i < n; i++) { const d = pick(); if (d) items.push({ kind, at: d.toISOString() }); }
    f.plan = { day: today, items: items.sort((a, b) => a.at.localeCompare(b.at)) }; return true;
  }
  const recentAt = iso => Date.now() - new Date(iso).getTime() < 30 * 60e3; // 刚刚发生的才弹提示，补上的不吵她
  /** 他发一条说说，顺便定好他身边的人什么时候来赞、来评论 */
  async function selfPost(f, it) {
    const acct = f.acct; const d = new Date(it.at);
    const recent = (f.zone.posts || []).slice(-5).map(p => `「${p.text.slice(0, 80)}」`).join("");
    const lines = [ERA_RULE(acct, d), COMMON_RULE, "你在 QQ 空间发一条说说，写你那边这个时候的生活。", recent ? `你之前发过的说说：${recent}` : "", circleLine(f),
      "===说说===\n内容\n===结束===",
      `${acct === "a08" ? "你的照片是用数码相机或者拍照手机拍的。" : ""}想配一张你拍的照片就加（不配就不写）：\n===照片===\n画面：照片里拍到了什么（场景、人物、物品、光线，客观写清楚，只能是你身边真实的东西）\n===结束===`,
      "再写你身边的人在这条说说下的反应（谁来、来不来按你们的关系定，可以没人）。有人评论你，你回不回、回谁按你的人设来，你的回复也写进评论里，排在那条评论后面：\n===赞===\n点赞的人的昵称，一行一个\n===结束===\n===评论===\n按时间先后一行一条：昵称：评论的话\n回复别人写成：昵称：回复 某某：话\n你自己回复写成：你：回复 某某：话\n===结束===",
      f.circle && f.circle.length ? "" : CIRCLE_ASK].filter(Boolean).join("\n\n");
    let raw = await gen(f, "post", lines); if (raw == null) return false;
    const leak = futureIn(acct, raw); if (leak.length) { const again = await gen(f, "post", `${lines}\n\n你刚才写了「${leak.join("」「")}」，这是你那边还没有的东西，你不可能知道。重写。`); if (again && block(again, "说说")) raw = again; }
    const text = block(raw, "说说") || ""; const pb = block(raw, "照片"); if (!text && !pb) return false;
    if (!(f.circle && f.circle.length)) { const c = parseCircle(raw); if (c.length) f.circle = c; }
    const p = { id: uid("p"), text: text.slice(0, 300), at: d.toISOString(), comments: [], likes: [], ...(pb ? { photo: { desc: (field(pb, "画面") || pb).slice(0, 200) } } : {}) };
    for (const n of (block(raw, "赞") || "").split("\n").map(x => x.replace(/^[-·\d.、\s]+/, "").trim()).filter(n => notUser(f, n))) p.likes.push({ who: n, at: new Date(d.getTime() + rand(3, 300) * 60e3).toISOString() });
    let t = d.getTime(); for (const c of parseCm(f, block(raw, "评论"))) { if (c.to === "me") continue; t += rand(5, 150) * 60e3; p.comments.push({ ...c, at: new Date(t).toISOString() }); }
    f.zone.posts.push(p); saveFriend(f);
    remember(f, `我在 QQ 空间发了一条说说：「${p.text}${photoText(p.photo)}」`);
    if (recentAt(p.at)) { qqPop("QQ空间", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b><br>发表了新说说</div>`); play("msg"); }
    return true;
  }
  /** 他写日志：几天一篇，比说说长；他身边的人来看、来评论 */
  async function selfBlog(f, it) {
    const acct = f.acct; const d = new Date(it.at); f.zone.blogs = f.zone.blogs || [];
    const prev = f.zone.blogs.slice(-5).map(b => `《${b.title}》`).join("");
    const lines = [ERA_RULE(acct, d), COMMON_RULE, "你在 QQ 空间写一篇日志：写你那边最近一件完整的事或者一段心情，比说说长，想到哪写到哪，像那时候的人写空间日志。写什么、写多长按你的人设来。", prev ? `你之前写过的日志：${prev}` : "", circleLine(f),
      `===日志===\n标题：\n分类：\n权限：所有人可见 或 仅好友可见\n背景音乐：歌手 - 歌名（${acct === "a08" ? "2008 年以前就有的歌，" : ""}不挂就写无）\n正文：\n（正文写在这一行下面）\n===结束===`,
      `${acct === "a08" ? "你的照片是用数码相机或者拍照手机拍的。" : ""}想配一张你拍的照片就加（不配就不写）：\n===照片===\n画面：照片里拍到了什么（场景、人物、物品、光线，客观写清楚，只能是你身边真实的东西）\n===结束===`,
      "再写你身边的人看了这篇日志的反应（谁来、来不来按你们的关系定，可以没人）。有人评论你，你回不回、回谁按你的人设来，你的回复也写进评论里，排在那条评论后面：\n===评论===\n按时间先后一行一条：昵称：评论的话\n回复别人写成：昵称：回复 某某：话\n你自己回复写成：你：回复 某某：话\n===结束===",
      f.circle && f.circle.length ? "" : CIRCLE_ASK].filter(Boolean).join("\n\n");
    let raw = await gen(f, "blog", lines); if (raw == null) return false;
    const leak = futureIn(acct, raw); if (leak.length) { const again = await gen(f, "blog", `${lines}\n\n你刚才写了「${leak.join("」「")}」，这是你那边还没有的东西，你不可能知道。重写。`); if (again && block(again, "日志")) raw = again; }
    const bk = block(raw, "日志"); if (!bk) return false;
    const m = bk.match(/正文\s*[：:]\s*([\s\S]*)$/); const text = (m ? m[1] : "").replace(/^（正文写在这一行下面）/, "").trim(); const title = field(bk, "标题").slice(0, 40);
    if (!title || !text) return false;
    if (!(f.circle && f.circle.length)) { const c = parseCircle(raw); if (c.length) f.circle = c; }
    const bgm = field(bk, "背景音乐"); const pb = block(raw, "照片");
    const bl = { id: uid("g"), title, text: text.slice(0, 6000), cat: field(bk, "分类").slice(0, 10) || "个人日记", priv: /好友/.test(field(bk, "权限")) ? "friends" : "all", at: d.toISOString(), reads: rand(3, 40), comments: [],
      ...(bgm && !/^(无|不挂|没有)$/.test(bgm) ? { bgmName: bgm.slice(0, 40) } : {}), ...(pb ? { photo: { desc: (field(pb, "画面") || pb).slice(0, 200) } } : {}) };
    let t = d.getTime(); for (const c of parseCm(f, block(raw, "评论"))) { if (c.to === "me") continue; t += rand(10, 300) * 60e3; bl.comments.push({ ...c, at: new Date(t).toISOString() }); }
    f.zone.blogs.push(bl); saveFriend(f);
    remember(f, `我在 QQ 空间写了一篇日志《${title}》：${text.slice(0, 300)}`);
    if (recentAt(bl.at)) { qqPop("QQ空间", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b><br>发表了日志《${esc(title)}》</div>`); play("msg"); }
    return true;
  }
  /** 他逛到她的空间：留下访客记录，赞不赞、评不评论、踩不踩、留不留言他自己定 */
  async function browse(f, it) {
    const acct = f.acct; const mz = S.meta.accts[acct].zone; const me = `f:${f.id}`; const d = new Date(it.at);
    const ps = [...(mz.posts || [])].filter(p => p.at <= it.at).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 5);
    for (const p of ps) if (p.photo && !p.photo.seen) { await seePhoto(f, p.photo); saveMeta(); }
    const list = ps.map((p, i) => `${i + 1}. 「${p.text.slice(0, 120)}${photoText(p.photo, true)}」（${ago(acct, p.at)}）${(p.likes || []).some(l => l.who === me) ? "你赞过" : ""}${(p.comments || []).some(c => c.who === me) ? "你评论过" : ""}`).join("\n");
    const raw = await gen(f, "browse", [ERA_RULE(acct, d), COMMON_RULE, `你上 QQ 空间，逛到了用户的空间。用户的 QQ 昵称是「${S.meta.accts[acct].nick}」。`, zoneCtx(f, true),
      list ? `她空间最近的说说：\n${list}` : "她空间还没有说说。",
      "做什么按你们的关系、你的人设和你这会儿的心情决定，什么都不做也可以。按需要输出这些块（没有就不写）：\n===赞===\n要赞的说说编号，一行一个\n===结束===\n===评论===\n一行一条：编号：评论的话\n===结束===\n===回踩===\n（踩一脚就写这个块，内容留空）\n===结束===\n===留言===\n在她留言板上写的话\n===结束==="].join("\n\n"));
    if (raw == null) return false;
    const at = d.toISOString(); const notes = [];
    const nums = (block(raw, "赞") || "").match(/\d+/g) || [];
    for (const n of nums) { const p = ps[+n - 1]; if (p && !(p.likes || []).some(l => l.who === me)) { p.likes = [...(p.likes || []), { who: me, at }]; notes.push(`赞了她的说说「${p.text.slice(0, 40)}」`); } }
    for (const l of (block(raw, "评论") || "").split("\n")) { const m = l.trim().match(/^(\d+)\s*[.、：:]\s*(.+)$/); const p = m && ps[+m[1] - 1]; if (p) { p.comments = [...(p.comments || []), { who: me, text: m[2].slice(0, 200), at }]; notes.push(`评论了她的说说「${p.text.slice(0, 40)}」：「${m[2]}」`); } }
    const step = /===\s*回踩\s*===/.test(raw); if (step) notes.push("在她空间踩了一脚");
    const board = block(raw, "留言"); if (board) { mz.board.push({ id: uid("b"), who: me, text: board.slice(0, 200), at }); notes.push(`在她留言板上留言：「${board}」`); }
    mz.visitors = [{ who: me, at, ...(step ? { step: true } : {}) }, ...(mz.visitors || []).filter(v => v.who !== me)].slice(0, 30);
    saveMeta(); remember(f, `我逛了 ${S.meta.accts[acct].nick} 的 QQ 空间${notes.length ? `，${notes.join("，")}` : ""}`);
    if (notes.length && recentAt(at)) { qqPop("QQ空间", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b><br>${board ? "给你留言了" : notes.some(n => n.startsWith("评论")) ? "评论了你的说说" : nums.length ? "赞了你的说说" : "踩了你的空间"}</div>`); play("msg"); }
    return true;
  }
  /** 他身边的人回了她的评论（到点才出现）：弹个提示 */
  function notifyReplies() {
    for (const [owner, z] of [["me", A().zone], ...myFriends().map(fr => [fr.id, fr.zone])]) {
      let changed = false;
      for (const p of [...(z.posts || []), ...(z.blogs || [])]) for (const c of p.comments || []) if (c.to === "me" && !c.seen && shown(c)) { c.seen = true; changed = true; qqPop("QQ空间", `${whoAv(c.who, 28)}<div><b>${esc(whoName(c.who))}</b><br>回复了你的评论：${richText(c.text).slice(0, 120)}</div>`); play("msg"); }
      if (changed) saveOwner(owner);
    }
  }
  /** 谁上线了：咳嗽声 + 右下角提示 */
  let lastStatus = {};
  function watchStatus(silent) {
    if (!S.meta.cur) return;
    for (const f of myFriends()) { const st = statusOf(f); const was = lastStatus[f.id];
      if (!silent && was === "offline" && st !== "offline") { play("online"); qqPop("QQ 提示", `${fAv(f, 28)}<div><b>${esc(nameOf(f))}</b><br>上线了</div>`); }
      lastStatus[f.id] = st; }
    if (!silent && S.view === "main") render();
  }

  // ───────────────────────── 启动 ─────────────────────────
  document.addEventListener("click", e => {
    ac();
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
    const f = ACT[b.dataset.act]; if (f) { e.preventDefault(); f(b, e); }
  });
  document.addEventListener("change", e => {
    if (e.target.matches(".stsel")) { A().status = e.target.value; saveMeta(); }
  });
  document.addEventListener("input", e => { if (e.target.id === "srch") { S.search = e.target.value; const pos = e.target.selectionStart; render(); const i = $("#srch"); i.focus(); i.setSelectionRange(pos, pos); } });
  document.addEventListener("keydown", e => { if (e.target.id === "inp" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ACT.send(); } });
  async function boot() {
    $("#app").innerHTML = `<div class="login"><div class="logo" style="padding-top:160px">${PENGUIN(120, 118)}<b>QQ2008</b></div></div>`;
    await loadAll(); applyTheme(S.meta.theme);
    // QQ秀 是新加的：每个好友上线后看一次记忆（答应过送她衣服的话就送），顺便给自己挑一身
    for (const f of S.friends.filter(f => !f.pending && !f.showChecked && !S.meta.queue.some(q => q.fid === f.id && q.kind === "showcheck"))) S.meta.queue.push({ fid: f.id, kind: "showcheck", due: new Date(Date.now() + rand(10, 90) * 1000 * TS()).toISOString() });
    // 以前的版本 AI 失败三次就把好友申请从队列里扔了，人卡在「等待验证」：补回队列
    for (const f of S.friends.filter(f => f.pending && !S.meta.queue.some(q => q.fid === f.id && q.kind === "verify"))) S.meta.queue.push({ fid: f.id, kind: "verify", due: new Date().toISOString() });
    saveMeta();
    if (S.meta.auto && S.meta.cur) { S.view = "main"; render(); watchStatus(true); tick(); } else { S.meta.cur = null; S.view = "login"; render(); }
    setInterval(tick, 3000);
    setInterval(() => watchStatus(false), 20000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { watchStatus(true); tick(); } });
  }
  boot();
})();
