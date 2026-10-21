/* 旅行 · 小手机自定义 APP：足迹地图 / 发现 / 攻略 / 订票选座 / 票根夹 */
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
  function hashN(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; }
  /** 没有图时的渐变色块：同一个名字永远同一种颜色 */
  function grad(seed) { const h = hashN(seed) % 360; return `linear-gradient(150deg,hsl(${h},70%,80%),hsl(${(h + 35) % 360},55%,58%))`; }
  const ymd = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const md = d => { d = new Date(d); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
  const mdw = d => { d = new Date(d); return `${md(d)} 周${WEEK[d.getDay()]}`; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dayDiff = (a, b) => Math.round((new Date(ymd(b)) - new Date(ymd(a))) / 864e5);
  const yuan = n => "¥" + Math.round(n).toLocaleString("en-US");
  const hm = d => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const I = {
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z"/><path d="M9 4v14M15 6v14"/></svg>',
    compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M6 3.5h9l3 3v14H6z"/><path d="M9 10h6M9 14h6M9 18h3.5"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 7.5h17v3a2 2 0 0 0 0 3v3h-17v-3a2 2 0 0 0 0-3z"/><path d="M14.5 7.5v9" stroke-dasharray="1.6 2"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 6.5h6l2 2h9v11h-17z"/><path d="M3.5 10.5h17"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.2C4.5 7 6.6 5 9 5c1.4 0 2.4.6 3 1.6C12.6 5.6 13.6 5 15 5c2.4 0 4.5 2 4.5 4.8C19.5 15.4 12 20 12 20Z"/></svg>',
    plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M10.5 13.5 4 11l1.5-1.5 7 1L17 6c1-1 2.6-1.2 3-.8.4.4.2 2-.8 3L14.5 12.5l1 7L14 21l-2.5-6.5L8 18v2.5L6.5 22 5 19l-3-1.5L3.5 16H6l3.5-3.5"/></svg>',
    train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="14" rx="4"/><path d="M5 11h14M9 17.5 7 21M15 17.5l2 3.5"/><circle cx="9" cy="14.3" r=".8" fill="currentColor"/><circle cx="15" cy="14.3" r=".8" fill="currentColor"/></svg>',
    bed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 18V6M3 14h18v4M21 14v-2.5a3 3 0 0 0-3-3h-7v5.5"/><circle cx="7" cy="11" r="2"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/></svg>',
    starOn: '<svg viewBox="0 0 24 24" fill="#f5a623" stroke="#f5a623" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3.5 7.5 7 11M3.5 7.5h17M17 13l3.5 3.5L17 20M20.5 16.5h-17"/></svg>',
    crosshair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
    debug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 7 3.5 12 8 17M16 7l4.5 5L16 17M13.5 5l-3 14"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
  };

  // ───────────────────────── 数据 ─────────────────────────
  // trips 旅行 { id, scope, title, city, country, lat, lng, start, days, companions:[charId], createdAt }
  // spots 打卡点 { id, scope, tripId, name, lat, lng, at, photos:[{ref,desc}], notes:[{who:'me'|charId, text, at}] }
  // plans 攻略 { id, scope, tripId, title, city, start, author:'me'|charId, days:[{title, items:[{id,time,name,desc,lat,lng,note,noteBy,edit}]}], comments:[{who,text,at}] }
  // guides 发现缓存 { id:'g:城市', scope, city, base, more, at, cover }
  // tickets 票 { id, scope, kind, tripId, ... }
  const COL = { trips: "trips", spots: "spots", plans: "plans", guides: "guides", tickets: "tickets", meta: "meta" };
  const S = { identity: null, chars: [], meta: null, trips: [], spots: [], plans: [], guides: [], tickets: [], debug: [], jobs: new Set(), stack: [], tab: "foot", media: new Map() };
  async function dbList(c) { try { return (await api.db.list(c, { limit: 500 })) || []; } catch (e) { console.warn(e); return []; } }
  async function dbUpsert(c, row) { try { const u = await api.db.update(c, row.id, row); if (u) return u; } catch (e) { /* 没有就 create */ } return api.db.create(c, row); }
  async function dbDelete(c, id) { try { await api.db.delete(c, id); } catch (e) { console.warn(e); } }
  let metaTimer = null;
  const saveMeta = () => { clearTimeout(metaTimer); metaTimer = setTimeout(() => dbUpsert(COL.meta, S.meta).catch(e => console.warn(e)), 250); };
  const save = (c, row) => dbUpsert(c, row).catch(e => console.warn(e));
  function addRow(c, key, row) { row.scope = S.identity.id; S[key].push(row); save(c, row); return row; }
  function delRow(c, key, row) { S[key] = S[key].filter(x => x !== row); dbDelete(c, row.id); }

  async function loadAll() {
    const identity = await api.user.getProfile({}).catch(() => null);
    S.identity = identity || { id: "default", name: "我" };
    const chars = await api.characters.list().catch(() => []);
    const owners = await Promise.all(chars.map(c => api.user.getProfile({ characterId: c.id }).catch(() => null)));
    S.chars = chars.filter((c, i) => !owners[i] || !identity || owners[i].id === identity.id);
    const scope = S.identity.id;
    const [trips, spots, plans, guides, tickets, metas] = await Promise.all(["trips", "spots", "plans", "guides", "tickets", "meta"].map(dbList));
    const mine = xs => xs.filter(x => x.scope === scope);
    S.trips = mine(trips).map(t => ({ ...t, companions: t.companions || [] }));
    S.spots = mine(spots).map(s => ({ ...s, photos: s.photos || [], notes: s.notes || [] }));
    S.plans = mine(plans).map(p => ({ ...p, days: p.days || [], comments: p.comments || [] }));
    S.guides = mine(guides); S.tickets = mine(tickets);
    S.debug = (metas.find(m => m.id === "debug_log") || {}).entries || [];
    S.meta = metas.find(m => m.id === `meta_${scope}`) || { id: `meta_${scope}` };
    const d = { home: "", geo: {}, recent: [], favs: [] };
    for (const k in d) if (S.meta[k] == null) S.meta[k] = d[k];
  }

  // ───────────────────────── 人 ─────────────────────────
  const charById = id => S.chars.find(c => c.id === id);
  const herName = () => S.identity.name || "我";
  const nameOf = who => who === "me" ? "我" : (charById(who) || {}).name || "TA";
  /** 写给 AI / 记忆用：她用名字，不能写「我」 */
  const realName = who => who === "me" ? herName() : nameOf(who);
  function ava(who, cls) {
    cls = `ava${cls ? " " + cls : ""}`;
    if (who === "me") return S.identity.avatarUrl ? `<i class="${cls}"><img src="${esc(S.identity.avatarUrl)}" alt=""></i>` : `<i class="${cls}" style="background:#c58af9">${esc(herName().slice(0, 1))}</i>`;
    const c = charById(who); if (c && c.avatar) return `<i class="${cls}"><img src="${esc(c.avatar)}" alt=""></i>`;
    return `<i class="${cls}" style="background:${grad(who)}">${esc(nameOf(who).slice(0, 1))}</i>`;
  }
  const avaStack = ids => `<span class="avs">${ids.map(id => ava(id, "s")).join("")}</span>`;
  const withText = ids => ids.length ? `和${ids.map(nameOf).join("、")}` : "我自己";

  // ───────────────────────── 地理 ─────────────────────────
  // 高德瓦片用 GCJ-02（国内偏移坐标）；数据一律存 WGS84，在高德上显示时再转
  function outOfChina(lat, lng) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
  function inChinaRough(lat, lng) {
    if (outOfChina(lat, lng)) return false;
    // 粗略挖掉周边国家：朝鲜半岛、日本、东南亚、南亚、蒙古、中亚
    if (lat > 33 && lat < 43 && lng > 124.3 && lng < 131) return false;
    if (lng > 129) return false;
    if (lat < 21.4 && lng < 108) return false;
    if (lat < 18 ) return false;
    if (lat > 42 && lng < 118 && lng > 87) return lat < 44.5 && lng > 111;
    if (lat < 27.5 && lng < 97.5) return false;
    if (lat < 31 && lng < 89) return false;
    return true;
  }
  function tLat(x, y) { let r = -100 + 2 * x + 3 * y + .2 * y * y + .1 * x * y + .2 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3; r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3; r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3; return r; }
  function tLng(x, y) { let r = 300 + x + 2 * y + .1 * x * x + .1 * x * y + .1 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3; r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3; r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3; return r; }
  function wgs2gcj(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    const a = 6378245, ee = .00669342162296594323; let dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35);
    const rad = lat / 180 * Math.PI; let m = Math.sin(rad); m = 1 - ee * m * m; const sm = Math.sqrt(m);
    dLat = dLat * 180 / (a * (1 - ee) / (m * sm) * Math.PI); dLng = dLng * 180 / (a / sm * Math.cos(rad) * Math.PI);
    return [lat + dLat, lng + dLng];
  }
  function gcj2wgs(lat, lng) { const [a, b] = wgs2gcj(lat, lng); return [lat * 2 - a, lng * 2 - b]; }
  function km(a, b) { const R = 6371, r = Math.PI / 180; const dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  /** 城市 → 坐标（open-meteo 地理编码，存起来） */
  async function geocode(name) {
    name = String(name || "").trim(); if (!name) return null;
    if (S.meta.geo[name]) return S.meta.geo[name];
    const hit = CITY[name] || CITY[name.replace(/[市省]$/, "")]; if (hit) return { lat: hit[2], lng: hit[3], country: hit[4] || "中国", name };
    try {
      if (!api.network || !api.network.fetch) return null;
      const r = await api.network.fetch({ url: "https://geocoding-api.open-meteo.com/v1/search", query: { name, count: 1, language: "zh" }, timeoutMs: 8000 });
      const j = r && (r.json || (r.text ? JSON.parse(r.text) : null)); const g = j && j.results && j.results[0];
      if (!g) return null;
      const v = { lat: g.latitude, lng: g.longitude, country: g.country || "", name: g.name || name };
      S.meta.geo[name] = v; saveMeta(); return v;
    } catch (e) { console.warn("geocode", e); return null; }
  }
  // 常用城市：[三字码, 机场, 纬度, 经度, 国家]
  const CITY = {
    北京: ["PEK", "首都 T3", 39.904, 116.407], 上海: ["SHA", "虹桥 T2", 31.230, 121.473], 广州: ["CAN", "白云 T2", 23.129, 113.264], 深圳: ["SZX", "宝安 T3", 22.543, 114.058], 成都: ["TFU", "天府 T1", 30.573, 104.066], 重庆: ["CKG", "江北 T3", 29.563, 106.551],
    杭州: ["HGH", "萧山 T4", 30.274, 120.155], 西安: ["XIY", "咸阳 T3", 34.342, 108.940], 南京: ["NKG", "禄口 T2", 32.060, 118.797], 武汉: ["WUH", "天河 T3", 30.593, 114.305], 长沙: ["CSX", "黄花 T2", 28.228, 112.939], 厦门: ["XMN", "高崎 T3", 24.480, 118.089],
    青岛: ["TAO", "胶东", 36.067, 120.383], 大理: ["DLU", "大理", 25.607, 100.268], 丽江: ["LJG", "三义", 26.872, 100.230], 昆明: ["KMG", "长水", 25.038, 102.718], 三亚: ["SYX", "凤凰 T2", 18.253, 109.512], 哈尔滨: ["HRB", "太平 T2", 45.803, 126.535],
    拉萨: ["LXA", "贡嘎", 29.652, 91.172], 桂林: ["KWL", "两江", 25.274, 110.290], 苏州: ["", "", 31.299, 120.585], 天津: ["TSN", "滨海 T2", 39.343, 117.361], 沈阳: ["SHE", "桃仙", 41.805, 123.431], 大连: ["DLC", "周水子", 38.914, 121.615],
    郑州: ["CGO", "新郑 T2", 34.747, 113.625], 济南: ["TNA", "遥墙", 36.651, 117.120], 福州: ["FOC", "长乐", 26.075, 119.296], 贵阳: ["KWE", "龙洞堡 T2", 26.647, 106.630], 南宁: ["NNG", "吴圩", 22.817, 108.366], 海口: ["HAK", "美兰 T2", 20.044, 110.199],
    乌鲁木齐: ["URC", "地窝堡 T3", 43.825, 87.617], 呼和浩特: ["HET", "白塔", 40.842, 111.749], 兰州: ["LHW", "中川 T2", 36.061, 103.834], 西宁: ["XNN", "曹家堡", 36.617, 101.778], 银川: ["INC", "河东", 38.487, 106.231], 敦煌: ["DNH", "莫高", 40.142, 94.662],
    香港: ["HKG", "香港国际 T1", 22.319, 114.169, "中国香港"], 澳门: ["MFM", "澳门国际", 22.199, 113.544, "中国澳门"], 台北: ["TPE", "桃园 T2", 25.033, 121.565, "中国台湾"],
    东京: ["NRT", "成田 T1", 35.676, 139.650, "日本"], 大阪: ["KIX", "关西 T1", 34.694, 135.502, "日本"], 京都: ["KIX", "关西 T1", 35.012, 135.768, "日本"], 首尔: ["ICN", "仁川 T1", 37.567, 126.978, "韩国"], 济州: ["CJU", "济州", 33.499, 126.531, "韩国"],
    曼谷: ["BKK", "素万那普", 13.756, 100.502, "泰国"], 清迈: ["CNX", "清迈", 18.788, 98.985, "泰国"], 新加坡: ["SIN", "樟宜 T3", 1.352, 103.820, "新加坡"], 巴厘岛: ["DPS", "伍拉·赖", -8.409, 115.189, "印度尼西亚"],
    巴黎: ["CDG", "戴高乐 T2", 48.857, 2.352, "法国"], 伦敦: ["LHR", "希思罗 T3", 51.507, -0.128, "英国"], 罗马: ["FCO", "菲乌米奇诺", 41.903, 12.496, "意大利"], 巴塞罗那: ["BCN", "埃尔普拉特", 41.385, 2.173, "西班牙"],
    雷克雅未克: ["KEF", "凯夫拉维克", 64.146, -21.942, "冰岛"], 冰岛: ["KEF", "凯夫拉维克", 64.146, -21.942, "冰岛"], 纽约: ["JFK", "肯尼迪 T1", 40.713, -74.006, "美国"], 洛杉矶: ["LAX", "洛杉矶 TB", 34.052, -118.244, "美国"],
    悉尼: ["SYD", "悉尼 T1", -33.869, 151.209, "澳大利亚"], 迪拜: ["DXB", "迪拜 T3", 25.205, 55.271, "阿联酋"], 布拉格: ["PRG", "哈维尔", 50.075, 14.438, "捷克"], 瑞士: ["ZRH", "苏黎世", 46.948, 7.447, "瑞士"],
  };

  // ───────────────────────── 图片 ─────────────────────────
  async function mediaUrl(ref) {
    if (!ref) return ""; if (S.media.has(ref)) return S.media.get(ref);
    for (let i = 0; i < 2; i++) { try { const r = await api.media.get({ ref }); if (r && r.dataUrl) { S.media.set(ref, r.dataUrl); if (S.media.size > 50) S.media.delete(S.media.keys().next().value); return r.dataUrl; } } catch (e) { /* 再试 */ } }
    return "";
  }
  /** 一块图：有 ref 用图，没有用渐变色 */
  const pic = (ref, seed, cls, extra) => `<div class="pic ${cls || ""}" style="background:${grad(seed)}" ${extra || ""}>${ref ? `<img ${S.media.has(ref) ? `src="${esc(S.media.get(ref))}"` : `data-ref="${esc(ref)}"`} alt="">` : ""}</div>`;
  function hydrate(root) { root.querySelectorAll("img[data-ref]").forEach(async img => { const u = await mediaUrl(img.dataset.ref); if (u) { img.src = u; img.removeAttribute("data-ref"); } }); }
  function shrink(dataUrl, size = 1100) {
    return new Promise(res => { const img = new Image(); img.onload = () => { const k = Math.min(1, size / Math.max(img.width, img.height)); const cv = document.createElement("canvas"); cv.width = img.width * k; cv.height = img.height * k; cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL("image/jpeg", .86)); }; img.onerror = () => res(dataUrl); img.src = dataUrl; });
  }
  async function storeImage(dataUrl) { const d = await shrink(dataUrl); const st = await api.media.put({ dataUrl: d }); S.media.set(st.ref, d); return st.ref; }
  async function pickImages(max) {
    const r = await api.media.pick({ accept: "image/*", multiple: max > 1, limit: max });
    const files = (r && (r.files || (r.file ? [r.file] : []))) || []; const refs = [];
    for (const f of files.slice(0, max)) refs.push(await storeImage(f.dataUrl));
    return refs;
  }
  /** 生图：照片里有谁就带谁的参考图 */
  async function genImage(prompt, charId) {
    if (!api.ai || !api.ai.generateImage) { toast("小手机没开生图"); return null; }
    const job = uid("img"); S.jobs.add(job); renderBusy();
    try {
      const r = await api.ai.generateImage({ prompt, ...(charId ? { characterId: charId, useReferenceImage: true } : { useReferenceImage: false }), timeoutMs: 150000 });
      if (r && r.dataUrl) return await storeImage(r.dataUrl);
      toast("没生成出来"); return null;
    } catch (e) { toast(`生图失败：${(e && e.message) || e}`.slice(0, 50)); return null; }
    finally { S.jobs.delete(job); renderBusy(); }
  }
  /** 换一张图：相册 / 生图 / 去掉 */
  async function changeImage(seedPrompt, charIds) {
    const opts = [{ label: "从相册选", value: "pick", icon: "img" }, { label: "生一张", sub: "会用 1 次生图", value: "gen", icon: "spark" }];
    const v = await sheet("换图片", opts); if (!v) return null;
    if (v === "pick") { try { const [ref] = await pickImages(1); return ref || null; } catch (e) { toast("没选成"); return null; } }
    const people = (charIds || []).filter(charById);
    const r = await form("生一张", [{ k: "p", label: "画面", type: "textarea", value: seedPrompt || "" }, ...(people.length ? [{ k: "who", label: "照片里有谁（会带他的参考图）", type: "choice", options: [{ v: "", n: "没有人" }, ...people.map(id => ({ v: id, n: nameOf(id) }))] }] : [])]);
    if (!r || !r.p.trim()) return null; toast("在生成了，稍等一下"); return genImage(r.p.trim(), r.who || null);
  }

  // ───────────────────────── 记忆 ─────────────────────────
  function remember(charIds, summary, eventId) {
    if (!api.memory || !api.memory.addTimeline) return;
    for (const id of charIds || []) if (charById(id)) api.memory.addTimeline({ characterId: id, appLabel: "旅行", detail: "travel", summary, appEventId: `${eventId}_${id}` }).catch(e => console.warn(e));
  }

  // ───────────────────────── AI ─────────────────────────
  function logAi(entry) { S.debug = [{ at: nowIso(), ...entry, text: String(entry.text || "").slice(0, 8000) }, ...S.debug].slice(0, 10); dbUpsert(COL.meta, { id: "debug_log", entries: S.debug }).catch(() => {}); }
  function toast(msg) { document.querySelectorAll(".toast").forEach(x => x.remove()); const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 2200); }
  function nowLine() { const d = new Date(); return `【现在】${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}。`; }
  async function aiChat(system, prompt, label, maxTokens) {
    const job = uid("job"); S.jobs.add(job); renderBusy();
    try { const r = await api.ai.chat({ system, prompt, timeoutMs: 180000, ...(maxTokens ? { maxTokens } : {}) }); const text = (r && r.text) || ""; logAi({ label, ok: true, text }); return text; }
    catch (e) { console.error(e); logAi({ label, ok: false, error: String((e && e.message) || e) }); toast(`${label}失败：${(e && e.message) || e}`.slice(0, 60)); return null; }
    finally { S.jobs.delete(job); renderBusy(); }
  }
  async function aiGen(charId, scene, instruction, label) {
    const job = uid("job"); S.jobs.add(job); renderBusy();
    try { const r = await api.ai.generate({ characterId: charId, appTags: ["nox_travel", scene], instruction, timeoutMs: 180000 }); const text = (r && r.text) || ""; logAi({ label, ok: true, text }); return text; }
    catch (e) { console.error(e); logAi({ label, ok: false, error: String((e && e.message) || e) }); toast(`${label}失败：${(e && e.message) || e}`.slice(0, 60)); return null; }
    finally { S.jobs.delete(job); renderBusy(); }
  }
  /** 从模型输出里抠 JSON（容忍前后废话、代码块、尾逗号） */
  function parseJSON(raw) {
    let t = String(raw || "").replace(/```(json)?/g, "").trim();
    const a = t.search(/[[{]/); if (a < 0) return null; const open = t[a], close = open === "{" ? "}" : "]";
    const b = t.lastIndexOf(close); if (b <= a) return null; t = t.slice(a, b + 1);
    for (const s of [t, t.replace(/,\s*([}\]])/g, "$1"), t.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"')]) { try { return JSON.parse(s); } catch (e) { /* 下一个 */ } }
    return null;
  }
  const num = (v, d = 0) => { const n = parseFloat(String(v == null ? "" : v).replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : d; };
  const word = s => s >= 4.7 ? "超棒" : s >= 4.4 ? "很好" : s >= 4 ? "不错" : "一般";
  const okCoord = (o, center) => { const la = num(o && o.lat, NaN), lo = num(o && o.lng, NaN); if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null; if (center && km([la, lo], [center.lat, center.lng]) > 400) return null; return [la, lo]; };

  // ───────────────────────── 发现：城市指南 ─────────────────────────
  const GUIDE_SYS = `你是一个专业的旅行指南编辑，像携程、马蜂窝的官方攻略那样写：信息准确、实用、有条理，语气客观。只写真实存在的景点、餐厅、酒店，经纬度用 WGS84 尽量准确；拿不准是否真实存在的店宁可不写。评分是 5 分制，点评数要符合这个地方的热度。只输出 JSON，不要任何解释和代码块标记。`;
  const COMMENT_SPEC = `"comments":[{"user":"网友昵称","tag":"情侣出游/家庭出游/朋友出游/独自旅行 选一个","score":5,"date":"2025年9月","text":"一两句真实的游玩感受，有好有坏"}]`;
  function guideOf(city) { return S.guides.find(g => g.city === city); }
  async function loadGuideBase(city) {
    const ins = `${nowLine()}\n给「${city}」写一份旅行指南的第一部分。按这个 JSON 结构输出：
{"city":"标准城市名","country":"国家","tagline":"四到八个字的城市印象","intro":"两三句城市介绍","season":"最佳季节，如 3-5月","days":"建议游玩天数，如 3-4 天","cost":"人均花费，如 ¥2,500","howto":"怎么去，如 飞机/高铁","lat":0,"lng":0,
"tips":[{"t":"提醒标题","d":"一句具体说明"}],
"routes":[{"title":"线路名，如 XX经典3日游","tags":["第一次去","适合情侣","轻松"],"desc":"一句话说这条线路的特点","cost":"约 ¥1,800/人","days":[{"title":"这一天的主题","items":[{"time":"09:00","name":"地点名","desc":"一句建议","lat":0,"lng":0}]}]}],
"sights":[{"name":"景点名","kind":"类型，如 古镇 · 田园","score":4.7,"reviews":31000,"recommend":92,"sub":{"景色":4.8,"趣味":4.6,"性价比":4.8},"ticket":"门票","duration":"建议游玩时长","hours":"开放时间","transport":"交通","intro":"两句介绍","quote":"一句最有代表性的网友短评","tags":["适合情侣","免费","拍照"],"lat":0,"lng":0,${COMMENT_SPEC}}]}
要求：tips 3 条（季节天气、注意事项、交通）；routes 2 到 3 条，天数不同，每天 3 到 4 个点；sights 按必玩程度排 8 个，每个 2 条 comments。`;
    const raw = await aiChat(GUIDE_SYS, ins, `发现：${city}`, 8000); if (raw == null) return null;
    const j = parseJSON(raw); if (!j || !Array.isArray(j.sights)) { toast("没整理出来，再试一次"); return null; }
    return j;
  }
  async function loadGuideMore(g) {
    const ins = `${nowLine()}\n给「${g.city}」写旅行指南的美食和酒店部分。按这个 JSON 结构输出：
{"foods":[{"name":"店名或美食名","kind":"菜系/类型","score":4.6,"reviews":5200,"price":"¥86/人","area":"所在区域","dishes":["招牌菜1","招牌菜2","招牌菜3"],"sub":{"口味":4.7,"环境":4.3,"服务":4.4},"hours":"营业时间","intro":"两句介绍","quote":"一句网友短评","lat":0,"lng":0,${COMMENT_SPEC}}],
"hotels":[{"name":"酒店名","stars":"豪华型/高档型/舒适型/特色民宿","score":4.8,"reviews":2341,"area":"位置，如 双廊 · 距洱海 50 米","facilities":["海景","浴缸","免费接机"],"price":688,"intro":"两句介绍","quote":"一句住客短评","lat":0,"lng":0,${COMMENT_SPEC}}]}
要求：foods 8 个，本地特色和有名老店为主；hotels 6 家，价位从经济到高档都有，price 是每晚人民币数字。每个 2 条 comments。`;
    const raw = await aiChat(GUIDE_SYS, ins, `发现：${g.city}美食酒店`, 8000); if (raw == null) return null;
    const j = parseJSON(raw); if (!j || !Array.isArray(j.foods)) { toast("没整理出来，再试一次"); return null; }
    return j;
  }
  async function openCity(city) {
    city = String(city || "").trim(); if (!city) return;
    S.meta.recent = [city, ...S.meta.recent.filter(x => x !== city)].slice(0, 8); saveMeta();
    let g = guideOf(city);
    if (!g) {
      push("city", { city, loading: true });
      const base = await loadGuideBase(city); const p = S.stack.find(x => x.kind === "city" && x.data.city === city);
      if (!base) { if (p) { p.data.loading = false; p.data.failed = true; renderPage(p); } return; }
      g = addRow(COL.guides, "guides", { id: `g:${city}`, city, base, more: null, at: nowIso() });
      if (p) { p.data.loading = false; renderPage(p); }
      return;
    }
    push("city", { city });
  }
  async function ensureMore(g, p) {
    if (g.more || p.data.moreLoading) return; p.data.moreLoading = true; renderPage(p);
    const more = await loadGuideMore(g); p.data.moreLoading = false;
    if (more) { g.more = more; save(COL.guides, g); }
    renderPage(p);
  }

  // ───────────────────────── 攻略：他写 / 给他看 ─────────────────────────
  const CHAR_RULE = `【规矩】按你的人设和你们现在的关系来写，口吻自然。只写你记得的、聊过的事，不编她没做过的事。`;
  const PLAN_JSON = `{"title":"攻略标题","note":"写在攻略最后对她说的一段话","days":[{"title":"这一天的主题","items":[{"time":"09:00","name":"真实存在的地点名","desc":"一句实用建议","note":"你写在旁边的小批注，口吻是你自己，没有就留空","lat":0,"lng":0}]}]}`;
  function planText(p) {
    return p.days.map((d, i) => `第${i + 1}天 ${d.title || ""}\n` + d.items.map(it => `  [${it.id}] ${it.time || ""} ${it.name}${it.desc ? " —— " + it.desc : ""}${it.note ? `（${realName(it.noteBy)}批注：${it.note}）` : ""}`).join("\n")).join("\n");
  }
  function itemsFrom(days, center, noteBy) {
    return (days || []).slice(0, 15).map(d => ({ title: String(d.title || "").slice(0, 30), items: (d.items || []).slice(0, 8).map(it => { const c = okCoord(it, center); return { id: uid("i"), time: String(it.time || "").slice(0, 8), name: String(it.name || "").slice(0, 40), desc: String(it.desc || "").slice(0, 120), note: String(it.note || "").slice(0, 120), noteBy: it.note ? noteBy : null, ...(c ? { lat: c[0], lng: c[1] } : {}) }; }).filter(it => it.name) }));
  }
  async function charWritePlan(charId, opt) {
    const c = charById(charId); if (!c) return null;
    const g = guideOf(opt.city); const sights = g ? g.base.sights.map(s => s.name).join("、") : "";
    const others = (opt.with || []).filter(id => id !== charId);
    const ins = [nowLine(), CHAR_RULE, `【这次要做的】${herName()}请你（${c.name}）帮忙排一份去「${opt.city}」的旅行攻略，${opt.days} 天${opt.start ? `，${md(opt.start)}出发` : ""}。同行的有：${herName()}、你${others.length ? "、" + others.map(nameOf).join("、") : ""}。${opt.ask ? `她的要求：${opt.ask}` : "她没提要求，你看着办。"}`,
      `按你的性格来排：节奏、偏好、会不会排得很满都看你是什么样的人。批注写在你觉得该说两句的地方，不用每个都写。${sights ? `可以参考这些当地景点：${sights}。` : ""}`,
      `【输出】只输出 JSON，不要解释：${PLAN_JSON}`].join("\n\n");
    const raw = await aiGen(charId, "plan", ins, `${c.name}写攻略`); if (raw == null) return null;
    const j = parseJSON(raw); if (!j || !Array.isArray(j.days)) { toast("没写成，再试一次"); return null; }
    const center = (await geocode(opt.city)) || null;
    return { title: String(j.title || `${opt.city}攻略`).slice(0, 40), days: itemsFrom(j.days, center, charId), comments: j.note ? [{ who: charId, text: String(j.note).slice(0, 600), at: nowIso() }] : [] };
  }
  async function charReview(charId, p) {
    const c = charById(charId); if (!c) return false;
    const ins = [nowLine(), CHAR_RULE, `【这次要做的】${herName()}把她排的「${p.title}」（${p.city}）拿给你（${c.name}）看。下面是攻略，每个地点前面方括号里是编号：\n${planText(p)}`,
      `你按自己的性格看一遍：在你有话说的地点旁边写批注；觉得哪里该改可以改（改时间、换地点、改说明都行，按人设，不想改就不改）；最后写一段总的话给她。`,
      `【输出】只输出 JSON：{"comment":"总的话","notes":[{"id":"编号","text":"批注"}],"edits":[{"id":"编号","time":"新时间或留空","name":"新地点名或留空","desc":"新说明或留空","why":"为什么改，一句"}]}`].join("\n\n");
    const raw = await aiGen(charId, "review", ins, `${c.name}看攻略`); if (raw == null) return false;
    const j = parseJSON(raw); if (!j) { toast("他没看明白，再试一次"); return false; }
    const all = p.days.flatMap(d => d.items);
    for (const n of j.notes || []) { const it = all.find(x => x.id === String(n.id).trim()); if (it && n.text) { it.note = String(n.text).slice(0, 140); it.noteBy = charId; } }
    for (const ed of j.edits || []) {
      const it = all.find(x => x.id === String(ed.id).trim()); if (!it) continue;
      const old = { time: it.time, name: it.name, desc: it.desc }; let changed = false;
      for (const k of ["time", "name", "desc"]) if (ed[k] && String(ed[k]).trim() && String(ed[k]).trim() !== it[k]) { it[k] = String(ed[k]).trim().slice(0, k === "desc" ? 120 : 40); changed = true; }
      if (changed) it.edit = { by: charId, old, why: String(ed.why || "").slice(0, 80) };
    }
    if (j.comment) p.comments.push({ who: charId, text: String(j.comment).slice(0, 600), at: nowIso() });
    save(COL.plans, p);
    remember([charId], `${herName()}把她排的旅行攻略「${p.title}」给我看了，我看完写了批注${(j.edits || []).length ? "、改了几处" : ""}。我对她说：${j.comment || ""}`, `plan_rv_${p.id}_${Date.now()}`);
    return true;
  }
  async function charSpotNote(charId, spot, trip) {
    const c = charById(charId); if (!c) return null;
    const together = trip.companions.includes(charId);
    const notes = spot.notes.map(n => `${realName(n.who)}：${n.text}`).join("\n");
    const photos = spot.photos.map(p => p.desc).filter(Boolean).join("；");
    const ins = [nowLine(), CHAR_RULE, `【这次要做的】旅行「${trip.title}」里的一个打卡点：${spot.name}（${md(spot.at)}）。${together ? `这趟是你们一起去的，你也在场，写的是你自己对那天在这里的回忆。` : `这趟是${herName()}自己去的，你不在场，你是看到她的打卡在下面留言。`}`,
      photos ? `照片：${photos}` : "", notes ? `已经写了的话：\n${notes}` : "", `写一两句话留在这个打卡点下面，短一点，像在相册里写的。只输出这句话本身。`].filter(Boolean).join("\n\n");
    const raw = await aiGen(charId, "spotnote", ins, `${c.name}写一句`); if (raw == null) return null;
    return String(raw).replace(/^["“「]|["”」]$/g, "").trim().slice(0, 300);
  }

  // ───────────────────────── 订票：班次用代码生成 ─────────────────────────
  const AIR_CN = [["中国国际航空", "CA"], ["东方航空", "MU"], ["南方航空", "CZ"], ["海南航空", "HU"], ["厦门航空", "MF"], ["四川航空", "3U"], ["吉祥航空", "HO"], ["春秋航空", "9C"]];
  const AIR_INTL = [["国泰航空", "CX"], ["新加坡航空", "SQ"], ["全日空", "NH"], ["大韩航空", "KE"], ["汉莎航空", "LH"], ["法国航空", "AF"], ["英国航空", "BA"], ["阿联酋航空", "EK"], ["卡塔尔航空", "QR"], ["冰岛航空", "FI"]];
  /** 同一天同一条线搜出来永远一样 */
  function seeded(seed) { let s = hashN(seed) || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  const code = name => (CITY[name] && CITY[name][0]) || (String(name).match(/[A-Za-z]/g) || []).join("").slice(0, 3).toUpperCase() || "—";
  const airport = name => (CITY[name] && CITY[name][1]) || name;
  async function routeInfo(from, to) {
    const [a, b] = await Promise.all([geocode(from), geocode(to)]);
    if (!a || !b) return null;
    return { a, b, km: km([a.lat, a.lng], [b.lat, b.lng]), domestic: inChinaRough(a.lat, a.lng) && inChinaRough(b.lat, b.lng) };
  }
  function genFlights(from, to, date, ri) {
    const r = seeded(`${from}${to}${ymd(date)}f`); const n = 5 + Math.floor(r() * 3); const out = [];
    const air = ri.domestic ? AIR_CN : [...AIR_CN.slice(0, 3), ...AIR_INTL];
    for (let i = 0; i < n; i++) {
      const [an, ac] = air[Math.floor(r() * air.length)];
      const dep = new Date(date); dep.setHours(6 + Math.floor(r() * 16), [0, 5, 10, 20, 25, 35, 40, 50, 55][Math.floor(r() * 9)], 0, 0);
      const stop = ri.km > 6500 && r() < .45 ? pickCity(r) : (ri.km > 1500 && r() < .15 ? "昆明" : "");
      const mins = Math.round((ri.km / 760 + .55) * 60 + (stop ? 90 + r() * 120 : 0));
      const arr = new Date(dep.getTime() + mins * 60e3);
      const base = ri.domestic ? 280 + ri.km * .62 : 1400 + ri.km * .85;
      const price = Math.round(base * (.55 + r() * .75) / 10) * 10;
      out.push({ id: `f${i}`, carrier: an, no: `${ac}${100 + Math.floor(r() * 8900)}`, dep: dep.toISOString(), arr: arr.toISOString(), mins, stop, price, fromAp: airport(from), toAp: airport(to) });
    }
    return out.sort((x, y) => ts(x.dep) - ts(y.dep));
  }
  function pickCity(r) { return ["迪拜", "多哈", "赫尔辛基", "伊斯坦布尔", "法兰克福"][Math.floor(r() * 5)]; }
  function genTrains(from, to, date, ri) {
    if (!ri.domestic || ri.km > 2300) return [];
    const r = seeded(`${from}${to}${ymd(date)}t`); const n = 6 + Math.floor(r() * 4); const out = [];
    const sfx = ["", "南", "东", "西", "北"]; const st = (c, k) => `${c}${sfx[(hashN(c) + k) % 5]}`;
    for (let i = 0; i < n; i++) {
      const g = r() < .75; const dep = new Date(date); dep.setHours(6 + Math.floor(r() * 15), Math.floor(r() * 12) * 5, 0, 0);
      const mins = Math.round((ri.km * 1.25 / (g ? 235 : 170) + .3) * 60); const arr = new Date(dep.getTime() + mins * 60e3);
      const price = Math.round(ri.km * 1.25 * (g ? .46 : .33) * 2) / 2;
      out.push({ id: `t${i}`, no: `${g ? "G" : "D"}${1 + Math.floor(r() * 2999)}`, dep: dep.toISOString(), arr: arr.toISOString(), mins, price, fromSt: st(from, i % 2), toSt: st(to, i % 3) });
    }
    return out.sort((x, y) => ts(x.dep) - ts(y.dep));
  }
  function genHotels(city) {
    const g = guideOf(city); if (g && g.more && g.more.hotels) return g.more.hotels.map((h, i) => ({ id: `h${i}`, name: h.name, score: num(h.score, 4.6), area: h.area || "", facilities: h.facilities || [], price: num(h.price, 400), stars: h.stars || "" }));
    const r = seeded(`${city}h`); const A = ["云栖", "半山", "花间", "拾光", "山海", "慢居", "听风", "望舒", "栖迟"], B = ["民宿", "精品酒店", "酒店", "客栈", "度假酒店"];
    return Array.from({ length: 5 }, (_, i) => ({ id: `h${i}`, name: `${city}·${A[Math.floor(r() * A.length)]}${B[Math.floor(r() * B.length)]}`, score: Math.round((4.3 + r() * .6) * 10) / 10, area: ["市中心", "老城区", "景区附近", "地铁站旁", "湖边"][Math.floor(r() * 5)], facilities: ["早餐", "停车", "接机", "浴缸", "景观房", "健身房"].filter(() => r() < .4).slice(0, 3), price: Math.round((200 + r() * 900) / 10) * 10, stars: "" }));
  }
  const dur = m => `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;

  // ───────────────────────── 页面框架 ─────────────────────────
  const root = () => $("#app");
  function push(kind, data) { S.stack.push({ kind, data: data || {}, el: null }); renderPage(S.stack[S.stack.length - 1], true); }
  function pop() { const p = S.stack.pop(); if (p) { killMaps(p.el); if (p.el) { p.el.classList.add("out"); setTimeout(() => p.el.remove(), 200); } } renderTopOrBase(); }
  function renderTopOrBase() { const t = S.stack[S.stack.length - 1]; if (t) renderPage(t); else renderBase(); }
  function renderAll() { renderBase(); for (const p of S.stack) renderPage(p); }
  function renderBusy() { document.body.classList.toggle("busy-on", S.jobs.size > 0); }
  const maps = new Map();
  function killMaps(el) { if (!el) return; el.querySelectorAll(".lmap").forEach(m => { const x = maps.get(m); if (x) { try { x.remove(); } catch (e) { /* 已删 */ } maps.delete(m); } }); }

  function renderBase() {
    let el = $("#base"); if (!el) { el = document.createElement("div"); el.id = "base"; el.className = "page base"; root().appendChild(el); }
    killMaps(el);
    const T = TABS[S.tab]; el.innerHTML = T.render() + navHtml(); hydrate(el); if (T.after) T.after(el);
  }
  function renderPage(p, anim) {
    if (!p.el) { p.el = document.createElement("div"); p.el.className = `page ${p.kind}${anim ? " in" : ""}`; root().appendChild(p.el); if (anim) setTimeout(() => p.el && p.el.classList.remove("in"), 230); }
    const R_ = PAGES[p.kind]; if (!R_) return;
    // 有地图的页面：记下现在的视野，重画后还原
    p.el.querySelectorAll(".lmap").forEach(m => { const x = maps.get(m); if (x) p.data._view = { c: x.getCenter(), z: x.getZoom() }; });
    killMaps(p.el); const st = p.el.querySelector(".scroll"); const top = st ? st.scrollTop : 0;
    p.el.innerHTML = R_(p); hydrate(p.el); if (R_.after) R_.after(p);
    const st2 = p.el.querySelector(".scroll"); if (st2 && top) st2.scrollTop = top;
  }
  const NAV = [["foot", "足迹", "map"], ["discover", "发现", "compass"], ["plans", "攻略", "doc"], ["book", "订票", "ticket"], ["tickets", "票根夹", "folder"]];
  const navHtml = () => `<div class="nav">${NAV.map(([k, n, ic]) => `<div class="${S.tab === k ? "on" : ""}" data-act="tab" data-t="${k}"><i>${I[ic]}</i>${n}</div>`).join("")}</div>`;
  const topbar = (title, right) => `<div class="topbar"><button class="ib" data-act="back">${I.back}</button><b class="tt">${esc(title || "")}</b>${right || ""}</div>`;

  // ───────────────────────── 地图 ─────────────────────────
  const AMAP = "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
  /** 建一张地图：国内用高德，出国（视野中心在国外）自动换世界地图；点的坐标进来是 WGS84 */
  function makeMap(el, opts) {
    if (!window.L) { el.innerHTML = `<div class="nomap">地图没加载出来<br><small>检查一下网络，再重新打开试试</small></div>`; return null; }
    const m = L.map(el, { zoomControl: false, attributionControl: false, ...(opts || {}) });
    let mode = null, layer = null; const items = [];
    const toMap = (lat, lng) => mode === "amap" ? wgs2gcj(lat, lng) : [lat, lng];
    function setMode(md) {
      if (md === mode) return; const c = m.getCenter ? (mode ? m.getCenter() : null) : null;
      let wc = c ? (mode === "amap" ? gcj2wgs(c.lat, c.lng) : [c.lat, c.lng]) : null;
      mode = md; if (layer) m.removeLayer(layer);
      layer = L.tileLayer(md === "amap" ? AMAP : ESRI, { subdomains: "1234", maxZoom: 18 }).addTo(m);
      for (const it of items) it.layer.setLatLng ? it.layer.setLatLng(toMap(it.lat, it.lng)) : it.layer.setLatLngs(it.pts.map(p => toMap(p[0], p[1])));
      if (wc) m.setView(toMap(wc[0], wc[1]), m.getZoom(), { animate: false });
    }
    const api_ = {
      m, el,
      marker(lat, lng, html, size, onClick) { const lay = L.marker(toMap(lat, lng), { icon: L.divIcon({ className: "", iconSize: size || [46, 46], iconAnchor: [(size || [46])[0] / 2, (size || [46, 46])[1] / 2], html }) }).addTo(m); if (onClick) lay.on("click", onClick); items.push({ lat, lng, layer: lay }); return lay; },
      line(pts, style) { const lay = L.polyline(pts.map(p => toMap(p[0], p[1])), style).addTo(m); items.push({ pts, layer: lay }); return lay; },
      fit(pts, pad, maxZ) { if (!pts.length) return; if (pts.length === 1) { m.setView(toMap(pts[0][0], pts[0][1]), Math.min(12, maxZ || 12)); return; } m.fitBounds(L.latLngBounds(pts.map(p => toMap(p[0], p[1]))), { paddingTopLeft: [30, (pad && pad[0]) || 140], paddingBottomRight: [30, (pad && pad[1]) || 300], maxZoom: maxZ || 14 }); },
      view(lat, lng, z) { m.setView(toMap(lat, lng), z); },
      center() { const c = m.getCenter(); return mode === "amap" ? gcj2wgs(c.lat, c.lng) : [c.lat, c.lng]; },
      decide(lat, lng) { setMode(inChinaRough(lat, lng) ? "amap" : "esri"); },
    };
    m.on("moveend", () => { const [la, lo] = api_.center(); setMode(inChinaRough(la, lo) ? "amap" : "esri"); });
    maps.set(el, m);
    return api_;
  }

  // ───────────────────────── 足迹 ─────────────────────────
  const tripSpots = t => S.spots.filter(s => s.tripId === t.id).sort((a, b) => ts(a.at) - ts(b.at));
  const tripCover = t => { for (const s of tripSpots(t)) for (const p of s.photos) if (p.ref) return p.ref; return t.coverRef || null; };
  const TABS = {}, PAGES = {};
  TABS.foot = {
    render() {
      const f = S.meta.footFilter || "all";
      const trips = S.trips.filter(t => f === "all" || (f === "with" ? t.companions.length : !t.companions.length));
      const together = S.trips.filter(t => t.companions.length).length, solo = S.trips.length - together;
      const done = S.trips.filter(t => tripSpots(t).length);
      const cities = new Set(done.map(t => t.city)).size, spots = S.spots.length, photos = S.spots.reduce((n, s) => n + s.photos.length, 0);
      const kmSum = S.tickets.reduce((n, t) => n + (t.km || 0), 0);
      const recent = S.trips.slice().sort((a, b) => ts(b.start) - ts(a.start));
      const people = new Set(S.trips.flatMap(t => t.companions)); const pName = people.size === 1 ? nameOf([...people][0]) : people.size ? `${people.size} 个人` : "";
      return `<div class="lmap full" id="footmap"></div>
        <div class="map-hd"><b>${people.size === 1 ? "我们的足迹" : "足迹"}</b></div>
        <div class="map-seg">${[["all", `全部 ${S.trips.length}`], ["with", `一起去的 ${together}`], ["solo", `我自己 ${solo}`]].map(([k, n]) => `<span class="${f === k ? "on" : ""}" data-act="foot-filter" data-f="${k}">${n}</span>`).join("")}</div>
        <div class="sheet-b"><div class="h"></div>
          ${S.trips.length ? `<div class="sb-t"><b>去过 ${cities} 座城市</b><small>${together && pName ? `其中 ${new Set(S.trips.filter(t => t.companions.length && tripSpots(t).length).map(t => t.city)).size} 座是和${esc(pName)}一起` : ""}</small></div>
          <div class="stats"><div><b>${spots}</b><span>打卡地点</span></div><div><b>${photos}</b><span>张照片</span></div><div><b>${kmSum ? Math.round(kmSum).toLocaleString("en-US") : S.tickets.length}</b><span>${kmSum ? "公里" : "张票"}</span></div></div>` : `<div class="sb-t"><b>还没有旅行</b><small>新建一趟，和谁去、去哪都行</small></div>`}
          <div class="recent">${recent.map(t => `<div class="rc" data-act="trip" data-id="${t.id}">${pic(tripCover(t), t.city, "rc-pic")}<span>${esc(t.title)}</span><small>${esc(t.start ? `${new Date(t.start).getMonth() + 1}月` : "")}${t.companions.length ? " · " + esc(t.companions.map(nameOf).join("、")) : ""}</small></div>`).join("")}<div class="rc add" data-act="trip-new"><div class="rc-pic plus">${I.plus}</div><span>新旅行</span></div></div>
        </div>`;
    },
    after(el) {
      const box = $("#footmap", el); const mp = makeMap(box); if (!mp) return;
      const f = S.meta.footFilter || "all"; const pts = [];
      for (const t of S.trips) {
        if (f === "with" && !t.companions.length) continue; if (f === "solo" && t.companions.length) continue;
        if (t.lat == null) continue; const n = tripSpots(t).length; const cov = tripCover(t);
        const html = `<div class="tpin ${t.companions.length ? "" : "solo"} ${n ? "" : "plan"}"><div class="c" style="background:${grad(t.city)}">${cov && S.media.has(cov) ? `<img src="${esc(S.media.get(cov))}">` : n ? "" : I.plus}</div>${t.companions.length ? ava(t.companions[0], "corner") : ""}${n > 1 ? `<b class="n">${n}</b>` : ""}</div>`;
        mp.marker(t.lat, t.lng, html, [54, 54], () => push("trip", { id: t.id }));
        pts.push([t.lat, t.lng]);
        if (cov && !S.media.has(cov)) mediaUrl(cov).then(u => { if (u && S.tab === "foot" && !S.stack.length) renderBase(); });
      }
      mp.decide(...(pts[0] || [33, 110]));
      if (pts.length) mp.fit(pts, [150, 330], 9); else mp.view(33, 110, 3.6);
    },
  };

  // 旅行页
  PAGES.trip = p => {
    const t = S.trips.find(x => x.id === p.data.id); if (!t) return topbar("") + `<div class="empty">这趟旅行不见了</div>`;
    const spots = tripSpots(t); const day = p.data.day || 0; const nDays = Math.max(t.days || 1, ...spots.map(s => dayDiff(t.start, s.at) + 1));
    const shown = day ? spots.filter(s => dayDiff(t.start, s.at) + 1 === day) : spots;
    const plan = S.plans.find(x => x.tripId === t.id);
    return `<div class="lmap full" id="tripmap"></div>${topbar("", `<button class="ib" data-act="trip-more" data-id="${t.id}">${I.more}</button>`)}
      <div class="trip-chip">${avaStack(["me", ...t.companions])}<div><b>${esc(t.title)}${t.days ? ` · ${t.days} 天` : ""}</b><small>${esc(withText(t.companions))} · ${t.start ? esc(`${new Date(t.start).getFullYear()}年${new Date(t.start).getMonth() + 1}月`) : ""}</small></div></div>
      <div class="sheet-b tall"><div class="h"></div>
        <div class="days">${["全部", ...Array.from({ length: nDays }, (_, i) => `第 ${i + 1} 天`)].map((n, i) => `<span class="${day === i ? "on" : ""}" data-act="trip-day" data-d="${i}">${n}</span>`).join("")}</div>
        <div class="legend"><span><i class="lg solid"></i>打过卡的</span>${plan ? `<span><i class="lg dash"></i>攻略里还没去的</span>` : ""}</div>
        <div class="tbtns"><button class="btn-b" data-act="spot-new" data-id="${t.id}">${I.pin}打卡</button><button class="btn-g" data-act="${plan ? "plan" : "plan-new-trip"}" data-id="${plan ? plan.id : t.id}">${I.doc}${plan ? "看攻略" : "做攻略"}</button><button class="btn-g" data-act="book-trip" data-id="${t.id}">${I.ticket}订票</button></div>
        <div class="slist">${shown.map(s => `<div class="srow" data-act="spot" data-id="${s.id}">${pic((s.photos.find(x => x.ref) || {}).ref, s.name, "s-pic")}<div><b>${esc(s.name)}</b><small>${esc(mdw(s.at))} ${hm(s.at)}${s.photos.length ? ` · ${s.photos.length} 张照片` : ""}</small><p>${esc((s.notes[0] || {}).text || "")}</p></div></div>`).join("") || `<div class="empty sm">${day ? "这一天还没打卡" : "还没打卡，到了一个地方就点「打卡」吧"}</div>`}</div>
      </div>`;
  };
  PAGES.trip.after = p => {
    const t = S.trips.find(x => x.id === p.data.id); if (!t) return;
    const mp = makeMap($("#tripmap", p.el)); if (!mp) return;
    const spots = tripSpots(t).filter(s => s.lat != null); const day = p.data.day || 0;
    const shown = day ? spots.filter(s => dayDiff(t.start, s.at) + 1 === day) : spots;
    const plan = S.plans.find(x => x.tripId === t.id); const pts = [];
    if (plan) plan.days.forEach((d, di) => { if (day && di + 1 !== day) return; d.items.forEach(it => { if (it.lat == null) return; if (spots.some(s => s.name === it.name)) return; mp.marker(it.lat, it.lng, `<div class="spin plan"><div class="c">${I.plus}</div><div class="lb">${esc(it.name)}</div></div>`, [40, 40], () => toast(`攻略里的「${it.name}」：到了就去打卡吧`)); pts.push([it.lat, it.lng]); }); });
    if (shown.length > 1) mp.line(shown.map(s => [s.lat, s.lng]), { color: "#3b7cff", weight: 3, dashArray: "6 8" });
    shown.forEach(s => { const ref = (s.photos.find(x => x.ref) || {}).ref; mp.marker(s.lat, s.lng, `<div class="spin"><div class="c" style="background:${grad(s.name)}">${ref && S.media.has(ref) ? `<img src="${esc(S.media.get(ref))}">` : ""}</div>${s.photos.length > 1 ? `<b class="n">${s.photos.length}</b>` : ""}<div class="lb">${esc(s.name)}</div></div>`, [46, 46], () => push("spot", { id: s.id })); pts.push([s.lat, s.lng]); if (ref && !S.media.has(ref)) mediaUrl(ref).then(u => u && renderPage(p)); });
    const c = pts[0] || (t.lat != null ? [t.lat, t.lng] : [33, 110]); mp.decide(c[0], c[1]);
    if (p.data._view) mp.m.setView(p.data._view.c, p.data._view.z, { animate: false });
    else if (pts.length) mp.fit(pts, [140, 430]); else if (t.lat != null) mp.view(t.lat - .02, t.lng, 11); else mp.view(33, 110, 4);
  };

  // 打卡点
  PAGES.spot = p => {
    const s = S.spots.find(x => x.id === p.data.id); if (!s) return topbar("") + `<div class="empty">这个打卡点不见了</div>`;
    const t = S.trips.find(x => x.id === s.tripId) || { companions: [], title: "" };
    const people = t.companions.length ? t.companions : S.chars.map(c => c.id);
    return `<div class="scroll"><div class="hero">${s.photos.length ? `<div class="hero-sc">${s.photos.map((ph, i) => `<div class="hero-it" data-act="photo" data-id="${s.id}" data-i="${i}">${pic(ph.ref, s.name + i, "hero-pic")}${ph.desc && !ph.ref ? `<span class="ph-desc">${esc(ph.desc)}</span>` : ""}</div>`).join("")}</div>${s.photos.length > 1 ? `<div class="cnt">${s.photos.length} 张</div>` : ""}` : pic(null, s.name, "hero-pic")}</div>
      <div class="pd"><h2>${esc(s.name)}</h2><div class="sub">${I.pin}${esc(t.title)}　·　${esc(mdw(s.at))} ${hm(s.at)}</div>
      ${t.companions.length ? `<div class="with">${avaStack(t.companions)}${esc(withText(t.companions))}一起</div>` : `<div class="with solo">我自己去的</div>`}
      ${s.notes.map((n, i) => `<div class="note ${n.who === "me" ? "" : "his"}">${ava(n.who)}<div class="bub"><small>${esc(nameOf(n.who))}<em data-act="note-rm" data-id="${s.id}" data-i="${i}">删除</em></small>${esc(n.text)}</div></div>`).join("")}
      <div class="acts"><div data-act="spot-photo" data-id="${s.id}">${I.img}加照片</div><div data-act="spot-gen" data-id="${s.id}">${I.spark}生一张</div><div data-act="spot-note" data-id="${s.id}">${I.pen}写一句</div></div>
      ${people.length ? `<div class="ask">${people.map(id => `<button data-act="spot-ask" data-id="${s.id}" data-c="${id}">${ava(id, "s")}让${esc(nameOf(id))}写一句</button>`).join("")}</div>` : ""}
      <div class="mini-links"><span data-act="share-spot" data-id="${s.id}">${I.doc}发到聊天</span><span data-act="spot-move" data-id="${s.id}">${I.crosshair}改位置</span><span data-act="spot-edit" data-id="${s.id}">${I.pen}改名字时间</span><span data-act="spot-del" data-id="${s.id}" class="red">${I.trash}删除</span></div></div><div class="pad-b"></div></div>
      <div class="float-top">${topbar("", "")}</div>`;
  };
  PAGES.photo = p => {
    const s = S.spots.find(x => x.id === p.data.id); const ph = s && s.photos[p.data.i]; if (!ph) return topbar("");
    return `<div class="pv">${topbar("", `<button class="ib" data-act="photo-del" data-id="${s.id}" data-i="${p.data.i}">${I.trash}</button>`)}<div class="pv-b">${ph.ref ? `<img ${S.media.has(ph.ref) ? `src="${esc(S.media.get(ph.ref))}"` : `data-ref="${esc(ph.ref)}"`}>` : `<div class="pic big" style="background:${grad(s.name + p.data.i)}"></div>`}<p>${esc(ph.desc || "")}</p></div></div>`;
  };
  // 在地图上选位置
  PAGES.pickpos = p => `<div class="lmap full" id="pickmap"></div>${topbar("在地图上选位置")}<div class="crosshair">${I.pin}</div><div class="pick-tip">拖动地图，让针尖对准那个地方</div><button class="btn-b pick-ok" data-act="pick-ok">就是这里</button>`;
  PAGES.pickpos.after = p => { const mp = makeMap($("#pickmap", p.el)); if (!mp) return; p.data.mp = mp; const c = p.data.at || [33, 110]; mp.decide(c[0], c[1]); mp.view(c[0], c[1], p.data.at ? 13 : 4); };

  // ───────────────────────── 发现 ─────────────────────────
  TABS.discover = {
    render() {
      const hot = ["大理", "成都", "杭州", "厦门", "西安", "青岛", "三亚", "哈尔滨", "东京", "首尔", "曼谷", "巴黎", "冰岛"];
      return `<div class="tab-hd"><b>发现</b></div><div class="scroll"><div class="srch"><span>${I.search}</span><input id="city-q" placeholder="想去哪？搜一个城市或国家" enterkeyhint="search"></div>
        ${S.meta.recent.length ? `<div class="lb">最近看过</div><div class="chips2">${S.meta.recent.map(c => `<span data-act="city" data-c="${esc(c)}">${esc(c)}</span>`).join("")}</div>` : ""}
        ${S.guides.length ? `<div class="lb">已经整理好的</div><div class="gcards">${S.guides.map(g => `<div class="gcard" data-act="city" data-c="${esc(g.city)}">${pic(g.coverRef, g.city, "gc-pic")}<b>${esc(g.city)}</b><small>${esc(g.base.tagline || "")}</small></div>`).join("")}</div>` : ""}
        <div class="lb">热门目的地</div><div class="chips2">${hot.map(c => `<span data-act="city" data-c="${c}">${c}</span>`).join("")}</div>
        <div class="hint">搜一个新城市会用 1 次 API 整理指南，整理过的会存下来，下次打开不花</div><div class="ver" data-act="debug">旅行 v${VERSION} · 调试记录</div><div class="pad-b"></div></div>`;
    },
    after(el) { const q = $("#city-q", el); if (q) q.onkeydown = e => { if (e.key === "Enter" && q.value.trim()) { q.blur(); openCity(q.value.trim()); } }; },
  };
  const scoreBadge = (s, n) => `<div class="sc"><em>${(+s).toFixed(1)}</em><strong>${word(+s)}</strong>${n ? `${fmtCount(n)}条点评` : ""}</div>`;
  const fmtCount = n => { n = num(n); return n >= 1e4 ? `${(n / 1e4).toFixed(1).replace(/\.0$/, "")}万` : String(Math.round(n)); };
  PAGES.city = p => {
    const city = p.data.city; const g = guideOf(city);
    if (!g) return topbar(city) + (p.data.failed ? `<div class="empty">没整理出来<br><button class="btn-b" data-act="city-retry" data-c="${esc(city)}">再试一次</button></div>` : `<div class="empty">正在整理「${esc(city)}」的旅行指南……<br><small>第一次要一会儿，整理好会存下来</small></div>`);
    const b = g.base; const tab = p.data.tab || "routes";
    const sights = b.sights || [];
    let body = "";
    if (tab === "routes") body = (b.routes || []).map((r, i) => `<div class="card"><div class="route">${pic(r.coverRef, r.title, "r-pic")}<div><b>${esc(r.title)}</b><div class="chips">${(r.tags || []).map(x => `<span class="${/情侣/.test(x) ? "p" : ""}">${esc(x)}</span>`).join("")}</div><p>${esc(r.desc || "")}</p></div></div>
        <div class="dline">${(r.days || []).map((d, j) => `<b>D${j + 1}</b>${(d.items || []).map(x => esc(x.name)).join(" → ")}`).join("<br>")}</div>
        <div class="imp">${esc(r.cost || "")} · ${(r.days || []).length} 天<button data-act="route-import" data-c="${esc(city)}" data-i="${i}">导入我们的攻略</button></div></div>`).join("")
        + ((b.tips || []).length ? `<div class="card"><div class="h3">出行提醒</div><div class="tip">${b.tips.map(x => `<b>${esc(x.t)}</b>：${esc(x.d)}`).join("<br>")}</div></div>` : "");
    else if (tab === "sights") { const flt = p.data.flt || "必玩榜"; let xs = sights.map((s, i) => ({ s, i })); if (flt === "评分最高") xs.sort((a, b2) => num(b2.s.score) - num(a.s.score)); if (flt === "适合情侣") xs = xs.filter(x => (x.s.tags || []).some(t => /情侣/.test(t)) || (x.s.comments || []).some(c => /情侣/.test(c.tag))); if (flt === "免费") xs = xs.filter(x => /免费/.test(x.s.ticket || "") || (x.s.tags || []).some(t => /免费/.test(t)));
      body = `<div class="card"><div class="seg2">${["必玩榜", "评分最高", "适合情侣", "免费"].map(x => `<span class="${flt === x ? "on" : ""}" data-act="city-flt" data-f="${x}">${x}</span>`).join("")}</div>${xs.map(({ s, i }, k) => rankRow(s, i, k, "sight", `${s.ticket || ""} · 建议 ${s.duration || ""}`)).join("") || `<div class="empty sm">没有符合的</div>`}</div>`; }
    else if (!g.more) { body = `<div class="empty">${p.data.moreLoading ? "正在整理美食和酒店……" : "还没整理美食和酒店"}<br>${p.data.moreLoading ? "" : `<button class="btn-b" data-act="city-more">整理一下（用 1 次 API）</button>`}</div>`; }
    else if (tab === "foods") body = `<div class="card"><div class="seg2"><span class="on">必吃榜</span></div>${g.more.foods.map((f, i) => rankRow(f, i, i, "food", `${f.price || ""} · ${f.area || ""}`, (f.dishes || []).slice(0, 3))).join("")}</div>`;
    else body = `<div class="card">${g.more.hotels.map((h, i) => `<div class="ht" data-act="poi" data-k="hotel" data-i="${i}">${pic(h.coverRef, h.name, "h-pic")}<div class="bd"><b>${esc(h.name)}</b>${h.stars ? `<div class="lv">${esc(h.stars)}</div>` : ""}${scoreBadge(h.score, h.reviews)}<div class="meta">${esc(h.area || "")}</div><div class="fac">${(h.facilities || []).slice(0, 4).map(x => `<span>${esc(x)}</span>`).join("")}</div><div class="pr"><b>${yuan(num(h.price))}</b> /晚起</div></div></div>`).join("")}</div>`;
    return `<div class="scroll"><div class="chero" data-act="city-cover">${pic(g.coverRef, city, "ch-pic")}<div class="t"><b>${esc(b.city || city)}</b><small>${esc(b.tagline || "")}</small></div></div>
      <div class="card facts"><div><small>最佳季节</small><b>${esc(b.season || "—")}</b></div><div><small>建议游玩</small><b>${esc(b.days || "—")}</b></div><div><small>人均花费</small><b>${esc(b.cost || "—")}</b></div><div><small>怎么去</small><b>${esc(b.howto || "—")}</b></div></div>
      ${b.intro ? `<div class="intro">${esc(b.intro)}</div>` : ""}
      <div class="tabs">${[["routes", "攻略"], ["sights", "景点"], ["foods", "美食"], ["hotels", "酒店"]].map(([k, n]) => `<span class="${tab === k ? "on" : ""}" data-act="city-tab" data-t="${k}">${n}</span>`).join("")}</div>
      ${body}<div class="ainote">ⓘ AI 整理的内容，出门前再确认一下哦 · <span data-act="city-redo">重新整理</span></div><div class="pad-b"></div></div>
      <div class="float-top">${topbar("", "")}</div>`;
  };
  PAGES.city.after = p => { const g = guideOf(p.data.city); if (g && ["foods", "hotels"].includes(p.data.tab) && !g.more && !p.data.moreLoading && !p.data.askedMore) { p.data.askedMore = true; ensureMore(g, p); } };
  function rankRow(s, i, k, kind, meta, dishes) {
    return `<div class="rank" data-act="poi" data-k="${kind}" data-i="${i}"><div class="r-im">${pic(s.coverRef, s.name, "rk-pic")}<div class="no n${Math.min(k, 3)}">${k + 1}</div></div><div class="bd"><b>${esc(s.name)}</b>${scoreBadge(num(s.score, 4.5), s.reviews)}<div class="meta">${esc(meta)}</div>${dishes && dishes.length ? `<div class="chips">${dishes.map(d => `<span class="o">${esc(d)}</span>`).join("")}</div>` : ""}${s.quote ? `<div class="q">「${esc(s.quote)}」</div>` : ""}</div></div>`;
  }
  // 景点 / 美食 / 酒店 详情
  PAGES.poi = p => {
    const g = guideOf(p.data.city); const list = p.data.k === "sight" ? g.base.sights : p.data.k === "food" ? g.more.foods : g.more.hotels; const s = list[p.data.i]; if (!s) return topbar("");
    const subs = Object.entries(s.sub || {}).slice(0, 3);
    const info = p.data.k === "sight" ? [["开放时间", s.hours], ["门票", s.ticket], ["建议游玩", s.duration], ["交通", s.transport]] : p.data.k === "food" ? [["人均", s.price], ["位置", s.area], ["营业时间", s.hours], ["招牌菜", (s.dishes || []).join("、")]] : [["位置", s.area], ["价格", s.price ? `${yuan(num(s.price))} /晚起` : ""], ["设施", (s.facilities || []).join("、")]];
    const fav = S.meta.favs.includes(`${p.data.city}|${s.name}`);
    return `<div class="scroll"><div class="dhero" data-act="poi-cover">${pic(s.coverRef, s.name, "ch-pic")}</div>
      <div class="card lift"><div class="pname">${esc(s.name)}</div><div class="pkind">${esc(s.kind || s.stars || "")}</div>
      <div class="big"><div class="n">${num(s.score, 4.5).toFixed(1)}</div><div class="w"><b>${word(num(s.score, 4.5))}</b><small>${s.reviews ? fmtCount(s.reviews) + " 条点评" : ""}${s.recommend ? ` · ${s.recommend}% 推荐` : ""}</small></div></div>
      ${subs.length ? `<div class="sub3">${subs.map(([k, v]) => `<div>${esc(k)}<b>${num(v).toFixed(1)}</b></div>`).join("")}</div>` : ""}
      <div class="info">${info.filter(x => x[1]).map(([k, v]) => `<div><span>${k}</span>${esc(v)}</div>`).join("")}</div>${s.intro ? `<p class="pintro">${esc(s.intro)}</p>` : ""}</div>
      ${(s.comments || []).length ? `<div class="card"><div class="h3">精选点评</div>${s.comments.map(c => `<div class="rv"><div class="u">${`<i class="ava s" style="background:${grad(c.user || "")}"></i>`}${esc(c.user || "网友")}${c.tag ? `<span class="tg">${esc(c.tag)}</span>` : ""}<em>${num(c.score, 5).toFixed(1)}</em></div><p>${esc(c.text || "")}</p><small>${esc(c.date || "")}</small></div>`).join("")}</div>` : ""}
      <div class="ainote">ⓘ AI 整理的内容，出门前再确认一下哦</div><div class="pad-b"></div></div>
      <div class="float-top">${topbar("", "")}</div>
      <div class="bbar"><div data-act="poi-fav">${fav ? I.starOn : I.star}${fav ? "已收藏" : "收藏"}</div>${p.data.k === "hotel" ? `<div class="p" data-act="poi-book">去订</div>` : `<div class="p" data-act="poi-add">加进攻略</div>`}</div>`;
  };

  // ───────────────────────── 攻略 ─────────────────────────
  TABS.plans = {
    render() {
      const xs = S.plans.slice().sort((a, b) => ts(b.updatedAt || b.createdAt) - ts(a.updatedAt || a.createdAt));
      return `<div class="tab-hd"><b>攻略</b></div><div class="scroll">
        <div class="pbtns"><button class="btn-b" data-act="plan-new">${I.pen}自己写</button><button class="btn-g" data-act="plan-ask">${I.spark}让TA写</button></div>
        ${xs.map(pl => { const t = S.trips.find(x => x.id === pl.tripId); const n = pl.days.reduce((k, d) => k + d.items.length, 0); return `<div class="pcard" data-act="plan" data-id="${pl.id}"><div class="pc-hd" style="background:${grad(pl.city)}"><b>${esc(pl.title)}</b><small>${esc(pl.city)} · ${pl.days.length} 天 · ${n} 个地点</small></div>
          <div class="pc-ft">${ava(pl.author, "s")}<span>${esc(nameOf(pl.author))}写的${t ? ` · ${esc(t.title)}` : ""}</span>${pl.comments.length ? `<em>${pl.comments.length} 条留言</em>` : ""}</div></div>`; }).join("") || `<div class="empty">还没有攻略<br><small>自己写一份，或者让他排一份</small></div>`}<div class="pad-b"></div></div>`;
    },
  };
  PAGES.plan = p => {
    const pl = S.plans.find(x => x.id === p.data.id); if (!pl) return topbar("") + `<div class="empty">这份攻略不见了</div>`;
    const t = S.trips.find(x => x.id === pl.tripId); const edit = p.data.edit;
    const editors = [...new Set(pl.days.flatMap(d => d.items).filter(it => it.edit).map(it => it.edit.by))];
    return topbar("攻略", `<button class="tb-btn" data-act="plan-edit">${edit ? "完成" : "编辑"}</button><button class="ib" data-act="plan-more">${I.more}</button>`) + `<div class="scroll gl">
      <div class="gl-hd" style="background:${grad(pl.city)}"><b>${esc(pl.title)}</b><small>${esc(pl.city)}${pl.start ? ` · ${md(pl.start)} - ${md(addDays(pl.start, pl.days.length - 1))}` : ` · ${pl.days.length} 天`}</small>
        <div class="by">${ava(pl.author, "s")}${esc(nameOf(pl.author))}写的${editors.length ? ` · ${esc(editors.map(nameOf).join("、"))}改过 ${pl.days.flatMap(d => d.items).filter(it => it.edit).length} 处` : ""}${t ? ` · <span data-act="trip" data-id="${t.id}" class="lnk">${esc(t.title)} ›</span>` : ""}</div></div>
      ${pl.days.map((d, di) => `<div class="day"><h4><span>第 ${di + 1} 天</span>${esc(d.title || "")}${edit ? `<em data-act="day-title" data-d="${di}">改标题</em><em data-act="day-del" data-d="${di}" class="red">删这天</em>` : ""}</h4>
        ${d.items.map((it, ii) => `<div class="it" ${edit ? `data-act="item-edit" data-d="${di}" data-i="${ii}"` : ""}><time>${esc(it.time || "")}</time><div class="b"><b>${esc(it.name)}${it.lat == null ? "" : `<i class="has-pin">${I.pin}</i>`}</b>${it.desc ? `<p>${esc(it.desc)}</p>` : ""}
          ${it.note ? `<div class="hand">${esc(it.note)}${it.noteBy && it.noteBy !== pl.author ? `<small>—— ${esc(nameOf(it.noteBy))}</small>` : ""}</div>` : ""}
          ${it.edit ? `<div class="edited">${esc(nameOf(it.edit.by))}改过：原来是「${esc([it.edit.old.time, it.edit.old.name].filter(Boolean).join(" "))}」${it.edit.why ? `，${esc(it.edit.why)}` : ""}<span data-act="item-undo" data-d="${di}" data-i="${ii}">改回去</span></div>` : ""}</div></div>`).join("")}
        ${edit ? `<div class="add-it" data-act="item-add" data-d="${di}">${I.plus}加一个地点</div>` : ""}</div>`).join("")}
      ${edit ? `<div class="add-it day" data-act="day-add">${I.plus}加一天</div>` : ""}
      ${pl.comments.length ? `<div class="cmts">${pl.comments.map(c => `<div class="note his">${ava(c.who)}<div class="bub"><small>${esc(nameOf(c.who))} · ${esc(md(c.at))}</small>${esc(c.text)}</div></div>`).join("")}</div>` : ""}
      <div class="pad-b"></div></div>
      <div class="bbar"><div data-act="plan-show">${I.eye}给TA看看</div><div class="p" data-act="${t ? "trip" : "plan-link"}" data-id="${t ? t.id : pl.id}">${I.map}${t ? "在地图上看" : "放到旅行里"}</div></div>`;
  };

  // ───────────────────────── 订票 ─────────────────────────
  TABS.book = {
    render() {
      const b = S.book = S.book || { kind: "flight", from: S.meta.home || "", to: "", date: ymd(addDays(new Date(), 7)), nights: 2, with: [] };
      const kinds = [["flight", "机票", "plane"], ["train", "火车票", "train"], ["hotel", "酒店", "bed"]];
      const people = ["me", ...b.with];
      return `<div class="tab-hd"><b>订票</b></div><div class="scroll">
        <div class="kinds">${kinds.map(([k, n, ic]) => `<span class="${b.kind === k ? "on" : ""}" data-act="bk-kind" data-k="${k}">${I[ic]}${n}</span>`).join("")}</div>
        <div class="bform">${b.kind === "hotel" ? `<div class="bf-row"><label>城市</label><input id="bk-to" value="${esc(b.to)}" placeholder="去哪"></div>`
          : `<div class="bf-route"><div><label>出发</label><input id="bk-from" value="${esc(b.from)}" placeholder="从哪出发"></div><button class="swap" data-act="bk-swap">${I.swap}</button><div class="r"><label>到达</label><input id="bk-to" value="${esc(b.to)}" placeholder="去哪"></div></div>`}
          <div class="bf-row"><label>${b.kind === "hotel" ? "入住" : "日期"}</label><input id="bk-date" type="date" value="${esc(b.date)}">${b.kind === "hotel" ? `<label class="nl">住</label><select id="bk-nights">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option ${b.nights === n ? "selected" : ""} value="${n}">${n} 晚</option>`).join("")}</select>` : ""}</div>
          <div class="bf-row ppl"><label>和谁</label><div class="pchips"><span class="on">${ava("me", "s")}我</span>${S.chars.map(c => `<span class="${b.with.includes(c.id) ? "on" : ""}" data-act="bk-with" data-id="${c.id}">${ava(c.id, "s")}${esc(c.name)}</span>`).join("")}</div></div>
          <button class="btn-b wide" data-act="bk-search">${I.search}搜${b.kind === "flight" ? "航班" : b.kind === "train" ? "车次" : "酒店"}${people.length > 1 ? `（${people.length} 人）` : ""}</button></div>
        <div class="duo"><div data-act="come">${I.plane}<b>他来找我</b><small>他订票飞过来，你去接机</small></div><div data-act="go">${I.heart}<b>我去找他</b><small>他给你订票，你飞过去</small></div></div><div class="duo"><div data-act="gift-ask">${I.ticket}<b>让TA给我订</b><small>一起出去玩，去哪他来定</small></div></div>
        ${S.tickets.filter(t => t.toMe && flightState(t).k !== "land").length ? `<div class="lb">在路上的</div>${S.tickets.filter(t => t.toMe && flightState(t).k !== "land").map(tkRow).join("")}` : ""}
        ${S.tickets.filter(t => ts(t.date) >= ts(ymd(new Date())) && !t.toMe).length ? `<div class="lb">接下来的行程</div>${S.tickets.filter(t => ts(t.date) >= ts(ymd(new Date())) && !t.toMe).sort((a, b2) => ts(a.date) - ts(b2.date)).slice(0, 3).map(tkRow).join("")}` : ""}
        <div class="lb">设置</div><div class="setbox"><div class="srow2" data-act="set-home"><span>我在</span><b>${esc(S.meta.home || "还没填")}</b></div><div class="srow2"><span>他们偶尔给我订票惊喜<small>十来天最多一次，会发到聊天里</small></span><button class="sw ${S.meta.surprise === false ? "" : "on"}" data-act="set-surprise"><i></i></button></div></div>
        <div class="pad-b"></div></div>`;
    },
    after(el) {
      const b = S.book; const bind = (id, k, f) => { const x = $(id, el); if (x) x.onchange = x.oninput = () => { b[k] = f ? f(x.value) : x.value; }; };
      bind("#bk-from", "from"); bind("#bk-to", "to"); bind("#bk-date", "date"); bind("#bk-nights", "nights", v => +v);
    },
  };
  PAGES.results = p => {
    const d = p.data; const people = ["me", ...d.with];
    if (d.loading) return topbar("搜索中") + `<div class="empty">在查……</div>`;
    if (d.err) return topbar("") + `<div class="empty">${esc(d.err)}</div>`;
    const dates = Array.from({ length: 7 }, (_, i) => addDays(d.date, i - 2)).filter(x => dayDiff(new Date(), x) >= 0);
    const lowest = x => { const xs = d.kind === "flight" ? genFlights(d.from, d.to, x, d.ri) : genTrains(d.from, d.to, x, d.ri); return xs.length ? Math.min(...xs.map(f => f.price)) : 0; };
    if (d.kind === "hotel") {
      const hs = genHotels(d.to);
      return topbar(`${d.to} · 酒店`) + `<div class="scroll"><div class="route-card"><div class="r"><b>${esc(d.to)}</b></div><div class="opt"><span>${esc(md(d.date))} 入住</span><span>${d.nights} 晚</span><span>${people.length} 人 · ${Math.ceil(people.length / 2)} 间</span></div></div>
        ${hs.map(h => `<div class="ht" data-act="hotel-pick" data-i="${h.id}">${pic(null, h.name, "h-pic")}<div class="bd"><b>${esc(h.name)}</b>${scoreBadge(h.score, 0)}<div class="meta">${esc(h.area)}</div><div class="fac">${h.facilities.map(x => `<span>${esc(x)}</span>`).join("")}</div><div class="pr"><b>${yuan(h.price)}</b> /晚</div></div></div>`).join("")}<div class="pad-b"></div></div>`;
    }
    const list = d.kind === "flight" ? genFlights(d.from, d.to, d.date, d.ri) : genTrains(d.from, d.to, d.date, d.ri);
    return topbar(d.kind === "flight" ? "选航班" : "选车次") + `<div class="scroll"><div class="route-card"><div class="r"><b>${esc(d.from)}</b>${d.kind === "flight" ? I.plane : I.train}<b>${esc(d.to)}</b></div><div class="opt"><span>${esc(mdw(d.date))}</span><span>${people.length} 人</span><span>${d.kind === "flight" ? "经济舱" : "二等座"}</span></div></div>
      <div class="dates">${dates.map(x => { const lp = lowest(x); return `<div class="${ymd(x) === ymd(d.date) ? "on" : ""}" data-act="res-date" data-d="${ymd(x)}">周${WEEK[x.getDay()]}<b>${x.getDate()}</b><small>${lp ? yuan(lp) : "—"}</small></div>`; }).join("")}</div>
      ${people.length > 1 ? `<div class="ppl-line">${avaStack(people)}${esc(people.map(nameOf).join(" + "))} · 价格是一人</div>` : ""}
      ${list.map(f => `<div class="fl" data-act="res-pick" data-id="${f.id}"><div class="t"><b>${hm(f.dep)}</b><small>${esc(d.kind === "flight" ? f.fromAp : f.fromSt)}</small></div><div class="mid">${dur(f.mins)}<i></i>${f.stop ? `经停${esc(f.stop)}` : d.kind === "flight" ? "直飞" : esc(f.no)}</div><div class="t"><b>${hm(f.arr)}${dayDiff(f.dep, f.arr) ? `<sup>+${dayDiff(f.dep, f.arr)}</sup>` : ""}</b><small>${esc(d.kind === "flight" ? f.toAp : f.toSt)}</small></div><div class="pr"><b><small>¥</small>${f.price}</b><div>${esc(d.kind === "flight" ? `${f.carrier} ${f.no}` : f.no.startsWith("G") ? "高铁" : "动车")}</div></div></div>`).join("") || `<div class="empty">${d.kind === "train" ? "这两个地方之间没有火车，试试机票吧" : "这天没有航班"}</div>`}
      <div class="pad-b"></div></div>`;
  };
  // 选座
  const ROWS_F = Array.from({ length: 12 }, (_, i) => 30 + i), COLS_F = ["A", "B", "C", "", "D", "E", "F"];
  const ROWS_T = Array.from({ length: 12 }, (_, i) => 1 + i), COLS_T = ["A", "B", "C", "", "D", "F"];
  PAGES.seat = p => {
    const d = p.data; const people = ["me", ...d.with]; const fl = d.f; const isF = d.kind === "flight";
    const rows = isF ? ROWS_F : ROWS_T, cols = isF ? COLS_F : COLS_T; const r = seeded(`${fl.no}${fl.dep}seat`);
    d.taken = d.taken || new Set(rows.flatMap(rw => cols.filter(Boolean).filter(() => r() < .38).map(c => `${rw}${c}`)));
    d.seats = d.seats || {};
    const whoAt = id => Object.keys(d.seats).find(w => d.seats[w] === id);
    const total = fl.price * people.length;
    return topbar("选座") + `<div class="scroll"><div class="fl-sum">${esc(isF ? `${fl.carrier} ${fl.no}` : fl.no)} · ${esc(md(fl.dep))} ${hm(fl.dep)} ${esc(d.from)} → ${esc(d.to)}</div>
      <div class="cabin ${isF ? "" : "train"}"><div class="cab-t">${isF ? "经济舱" : "二等座 · 06 车"}</div><div class="cols" style="grid-template-columns:${cols.map(c => c ? "30px" : "22px").join(" ")}">${cols.map(c => `<span>${c}</span>`).join("")}
        ${rows.map(rw => cols.map(c => { if (!c) return `<span class="rown">${rw}</span>`; const id = `${rw}${c}`; const w = whoAt(id); return `<div class="sx ${d.taken.has(id) && !w ? "x" : ""} ${w ? (w === "me" ? "me" : "him") : ""}" data-act="seat" data-s="${id}">${w ? `<em>${esc(nameOf(w).slice(0, 1))}</em>` : ""}</div>`; }).join("")).join("")}</div></div>
      <div class="seat-sel">${people.map(w => `<div class="${w === "me" ? "me" : "him"} ${d.next === w ? "cur" : ""}" data-act="seat-who" data-w="${w}"><small>${esc(nameOf(w))}</small><b>${esc(d.seats[w] || "点座位选")}</b></div>`).join("")}</div>
      <div class="hint c">先点下面的人，再点座位；${people.length > 1 ? "挨着坐就选同一排相邻的" : "选一个喜欢的位置"}</div><div class="pad-b"></div></div>
      <button class="paybtn" data-act="seat-pay"><span>${yuan(total)} <small>${people.length} 人 · 钱包支付</small></span><span>去付款</span></button>`;
  };
  // 票根夹
  function tkRow(t) {
    const icon = t.kind === "flight" ? I.plane : t.kind === "train" ? I.train : I.bed;
    const title = t.kind === "hotel" ? t.hotel : `${t.from} → ${t.to}`;
    const tag = t.toMe ? `<em class="tk-tag">${esc(nameOf(t.people[0]))}来找你 · ${esc(flightState(t).n)}</em>` : t.giftBy ? `<em class="tk-tag gift">${esc(nameOf(t.giftBy))}订的</em>` : "";
    return `<div class="tkrow" data-act="${t.toMe ? "flight" : "ticket"}" data-id="${t.id}"><i class="tk-ic ${t.kind}">${icon}</i><div><b>${esc(title)}</b><small>${esc(mdw(t.date))}${t.kind === "hotel" ? ` · ${t.nights} 晚` : ` · ${hm(t.dep)} · ${esc(t.no)}`}</small>${tag}</div>${t.people.filter(x => x !== "me").length ? avaStack(t.people.filter(x => x !== "me")) : ""}</div>`;
  }
  TABS.tickets = {
    render() {
      const xs = S.tickets.slice().sort((a, b) => ts(b.date) - ts(a.date)); const today = ts(ymd(new Date()));
      const up = xs.filter(t => ts(t.date) >= today).reverse(), past = xs.filter(t => ts(t.date) < today);
      return `<div class="tab-hd"><b>票根夹</b></div><div class="scroll">${up.length ? `<div class="lb">还没出发</div>${up.map(tkRow).join("")}` : ""}${past.length ? `<div class="lb">去过的</div>${past.map(tkRow).join("")}` : ""}${xs.length ? "" : `<div class="empty">还没有票<br><small>去「订票」订一张吧</small></div>`}<div class="pad-b"></div></div>`;
    },
  };
  PAGES.ticket = p => {
    const t = S.tickets.find(x => x.id === p.data.id); if (!t) return topbar("") + `<div class="empty">这张票不见了</div>`;
    const trip = S.trips.find(x => x.id === t.tripId);
    const cards = t.people.map(w => ticketCard(t, w)).join("");
    return topbar(t.kind === "hotel" ? "酒店订单" : "我的票", `<button class="ib" data-act="tk-more">${I.more}</button>`) + `<div class="scroll tk-bg">${cards}
      ${t.giftBy ? `<div class="note his">${ava(t.giftBy)}<div class="bub"><small>${esc(nameOf(t.giftBy))}给你订的${t.giftReason ? ` · ${esc(t.giftReason)}` : ""}</small>${esc(t.giftMsg || "")}</div></div>` : ""}
      ${t.remark ? `<div class="note his">${ava(t.remark.who)}<div class="bub"><small>${esc(nameOf(t.remark.who))}</small>${esc(t.remark.text)}</div></div>` : ""}
      ${t.toMe ? `<div class="tk-trip" data-act="flight" data-id="${t.id}">${I.plane}看${esc(nameOf(t.people[0]))}的${t.kind === "flight" ? "航班" : "车次"}动态 ›</div>` : ""}
      <div class="tk-trip" data-act="share-ticket" data-id="${t.id}">${I.doc}发到聊天 ›</div>
      ${trip ? `<div class="tk-trip" data-act="trip" data-id="${trip.id}">${I.map}属于「${esc(trip.title)}」 ›</div>` : ""}<div class="pad-b"></div></div>`;
  };
  function ticketCard(t, who) {
    const nm = who === "me" ? (herName() || "我") : nameOf(who);
    if (t.kind === "flight") return `<div class="bp"><div class="bp-hd"><b>${esc(t.carrier)}</b><span>${esc(t.no)} · 经济舱</span></div>
      <div class="bp-main"><div class="city"><b>${esc(code(t.from))}</b><small>${esc(t.fromAp)}</small></div><div class="mid">${I.plane}<div>${dur(t.mins)}</div></div><div class="city r"><b>${esc(code(t.to))}</b><small>${esc(t.toAp)}</small></div></div>
      <div class="bp-grid"><div>日期<b>${esc(md(t.dep))}</b></div><div>起飞<b>${hm(t.dep)}</b></div><div>登机口<b>${esc(t.gate)}</b></div><div>座位<b>${esc(t.seats[who] || "—")}</b></div></div>
      <div class="bp-cut"></div><div class="bp-ft"><div><small>旅客</small><div class="pn">${esc(nm)}</div></div><div class="bar"></div></div></div>`;
    if (t.kind === "train") return `<div class="rail"><div class="no"><span>${esc(t.serial)}</span><span>${esc(t.fromSt)}站 售</span></div>
      <div class="stn"><div><b>${esc(t.fromSt)}</b></div><div class="tr">${esc(t.no)}<i>——————→</i></div><div class="r"><b>${esc(t.toSt)}</b></div></div>
      <div class="info"><span>${new Date(t.dep).getFullYear()}年${esc(md(t.dep))} ${hm(t.dep)}开</span><span>${esc(t.car)}车 ${esc(t.seats[who] || "")}号</span></div>
      <div class="info"><span>¥${t.price.toFixed(1)}元</span><span>二等座</span></div><div class="name"><span>限乘当日当次车</span><span>${esc(nm)}</span></div></div>`;
    return who === "me" ? `<div class="hv"><div class="hv-hd">${I.bed}<b>${esc(t.hotel)}</b></div><div class="hv-g"><div>入住<b>${esc(mdw(t.date))}</b></div><div>退房<b>${esc(mdw(addDays(t.date, t.nights)))}</b></div><div>${t.nights} 晚<b>${t.rooms} 间</b></div></div><div class="hv-ft">入住人：${esc(t.people.map(nameOf).join("、"))}<span>${yuan(t.total)}</span></div></div>` : "";
  }
  PAGES.debug = () => topbar("调试记录") + `<div class="scroll">${S.debug.map(d => `<div class="dbg"><b>${esc(d.label)} · ${esc(new Date(d.at).toLocaleString())} ${d.ok ? "" : "❌"}</b><pre>${esc(d.ok ? d.text : d.error)}</pre></div>`).join("") || `<div class="empty">还没有记录</div>`}</div>`;

  // ───────────────────────── 第二批：他的航班 / 他给我订票 / 发到聊天 ─────────────────────────
  /** 航班现在到哪了（按真实时间算；延误整体往后推） */
  function flightState(t) {
    const delay = (t.delay || 0) * 60e3; const dep = ts(t.dep) + delay, arr = ts(t.arr) + delay; const now = Date.now();
    if (now < dep - 2 * 3600e3) return { k: "plan", n: "计划中", p: 0, dep, arr };
    if (now < dep - 40 * 60e3) return { k: "checkin", n: "值机中", p: 0, dep, arr };
    if (now < dep) return { k: "board", n: "登机中", p: 0, dep, arr };
    if (now < arr) return { k: "fly", n: "飞行中", p: (now - dep) / (arr - dep), dep, arr };
    return { k: "land", n: "已到达", p: 1, dep, arr };
  }
  const leftText = ms => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分钟` : `${m} 分钟`; };
  function homeOf(id) { return (S.meta.charHome || {})[id] || ""; }
  async function needHome() {
    if (S.meta.home) return S.meta.home;
    const r = await form("你在哪个城市？", [{ k: "c", label: "订票和接机要用", ph: "北京" }]); if (!r || !r.c.trim()) return "";
    S.meta.home = r.c.trim(); saveMeta(); return S.meta.home;
  }
  /** 挑一班：到达时间在白天的优先 */
  function pickFlight(list) { const good = list.filter(f => { const h = new Date(f.arr).getHours(); return h >= 11 && h <= 21; }); return (good.length ? good : list)[0]; }
  function adjacentSeats(no, dep, n, isF) {
    const rows = isF ? ROWS_F : ROWS_T; const cols = (isF ? COLS_F : COLS_T).filter(Boolean); const r = seeded(`${no}${dep}seat`);
    const taken = new Set(rows.flatMap(rw => cols.filter(() => r() < .38).map(c => `${rw}${c}`)));
    for (const rw of rows) { const free = cols.filter(c => !taken.has(`${rw}${c}`)); for (let i = 0; i + n <= cols.length; i++) { const run = cols.slice(i, i + n); if (run.every(c => free.includes(c)) && !(isF && run.includes("C") && run.includes("D")) && !(!isF && run.includes("C") && run.includes("D"))) return run.map(c => `${rw}${c}`); } }
    return Array.from({ length: n }, (_, i) => `${rows[rows.length - 1]}${cols[i]}`);
  }
  async function makeTicket(kind, from, to, f, people, seatsArr, extra) {
    const ri = await routeInfo(from, to);
    const seats = {}; people.forEach((w, i) => { seats[w] = seatsArr[i]; });
    return addRow(COL.tickets, "tickets", { id: uid("tk"), kind, from, to, date: ymd(f.dep), dep: f.dep, arr: f.arr, mins: f.mins, no: f.no, carrier: f.carrier || "", fromAp: f.fromAp || "", toAp: f.toAp || "", fromSt: f.fromSt || "", toSt: f.toSt || "", price: f.price, total: f.price * people.length, people, seats,
      gate: `${pick(["A", "B", "C", "D", "E"])}${rand(1, 32)}`, car: pad(rand(1, 16)), serial: `${pick(["E", "F", "G", "H"])}0${rand(10000, 99999)}`, km: ri ? Math.round(ri.km) : 0,
      fromLL: ri ? [ri.a.lat, ri.a.lng] : null, toLL: ri ? [ri.b.lat, ri.b.lng] : null, createdAt: nowIso(), ...(extra || {}) });
  }
  /** 他订一班从他城市到我城市的票（他来找我 / 惊喜共用） */
  async function bookCome(who, from, date, msg) {
    const home = S.meta.home; const ri = await routeInfo(from, home); if (!ri) { toast("没找到这两个城市"); return null; }
    const useTrain = ri.domestic && ri.km < 700;
    const list = useTrain ? genTrains(from, home, date, ri) : genFlights(from, home, date, ri); if (!list.length) { toast("那天没有班次"); return null; }
    const f = pickFlight(list); const kind = useTrain ? "train" : "flight";
    const dr = seeded(`${f.no}${f.dep}delay`); const delay = kind === "flight" && dr() < .22 ? 20 + Math.floor(dr() * 100) : 0;
    const tk = await makeTicket(kind, from, home, f, [who], adjacentSeats(f.no, f.dep, 1, kind === "flight"), { toMe: true, delay, msgs: [], ...(msg ? { giftBy: who, giftMsg: msg, surprise: true } : {}) });
    const trip = addRow(COL.trips, "trips", { id: uid("trip"), title: `${nameOf(who)}来${home}`, city: home, country: "", lat: ri.b.lat, lng: ri.b.lng, start: ymd(f.arr), days: 2, companions: [who], createdAt: nowIso() });
    tk.tripId = trip.id; save(COL.tickets, tk);
    remember([who], `我订了${mdw(f.dep)}从${from}去${home}找${herName()}的${kind === "flight" ? "航班" : "高铁"} ${f.no}，${hm(f.dep)}出发，${hm(f.arr)}到。${msg ? `是瞒着她订的惊喜，我对她说：${msg}` : ""}`, `come_${tk.id}`);
    return tk;
  }
  /** 他来找我：他订一班飞到我城市的航班 */
  async function charComes() {
    if (!S.chars.length) { toast("还没有角色"); return; }
    const home = await needHome(); if (!home) return;
    const r = await form("他来找你", [{ k: "who", label: "谁来", type: "choice", options: charOptions(), value: S.chars[0].id }, { k: "from", label: "他从哪来（会记住）", value: homeOf(S.chars[0].id), ph: "上海" }, { k: "date", label: "哪天到", type: "date", value: ymd(addDays(new Date(), 3)) }], "让他订票");
    if (!r || !r.who || !r.from.trim()) return;
    const from = r.from.trim(); S.meta.charHome = { ...(S.meta.charHome || {}), [r.who]: from }; saveMeta();
    if (from === home) { toast("你们在同一个城市呀"); return; }
    const tk = await bookCome(r.who, from, r.date, ""); if (!tk) return;
    toast(`${nameOf(r.who)}订好了 ${f.no}`); renderAll(); push("flight", { id: tk.id });
  }
  /** 他给我订票（surprise=true 是他自己突然订的） */
  async function charBooksForMe(charId, hint, surprise) {
    const c = charById(charId); if (!c) return null; const home = S.meta.home; if (!home) return null;
    const his = homeOf(charId); const apart = !!his && his !== home;
    const ins = [nowLine(), CHAR_RULE, `【这次要做的】${surprise ? `你想给${herName()}一个惊喜：瞒着她订好票，然后告诉她。` : `${herName()}让你给她订一次出行。${hint ? `她说：${hint}` : "她没说去哪，你来定。"}`}她住在${home}。${his ? `你住在${his}。` : ""}`,
      apart && surprise ? `按你的性格和你们最近聊的事决定怎么安排（mode）：together 是你们一起去别的城市玩；come 是你想她了，自己买票去${home}找她。再决定去哪（真实城市，come 时可不填）、哪天出发（今天以后一个月内）、待几天、为什么这么安排、订完对她说的话。`
        : `这次是你们一起出去玩。按你的性格和你们最近聊的事决定：去哪（真实城市，不能是${home}${his ? `或${his}` : ""}）、哪天出发（今天以后一个月内）、玩几天、为什么这么安排、订完对她说的话。`,
      `【输出】只输出 JSON：{"mode":"${apart && surprise ? "together|come" : "together"}","city":"目的地城市","date":"YYYY-MM-DD","days":3,"reason":"一句话","message":"订完对她说的话"}`].join("\n\n");
    const raw = await aiGen(charId, "gift", ins, `${c.name}订票`); if (raw == null) return null;
    const j = parseJSON(raw); if (!j) { toast("他没订成"); return null; }
    const mode = apart && surprise && j.mode === "come" ? "come" : "together";
    let date = /^\d{4}-\d{2}-\d{2}$/.test(String(j.date)) ? j.date : ymd(addDays(new Date(), 7)); if (dayDiff(new Date(), date) < 1) date = ymd(addDays(new Date(), 3));
    if (mode === "come") return comeSurprise(c, his, date, String(j.message || "").slice(0, 400));
    if ((!j.city || String(j.city).trim() === home)) { toast("他没订成"); return null; }
    const to = String(j.city).trim();
    return bookForHer(c, mode, to, date, +j.days || 3, String(j.message || "").slice(0, 400), String(j.reason || "").slice(0, 120), surprise);
  }
  async function bookForHer(c, mode, to, date, days, msg, reason, surprise) {
    const charId = c.id; const home = S.meta.home;
    const ri = await routeInfo(home, to); if (!ri) { toast(`没找到「${to}」`); return null; }
    const useTrain = ri.domestic && ri.km < 900; const list = useTrain ? genTrains(home, to, date, ri) : genFlights(home, to, date, ri); if (!list.length) { toast("那天没有班次"); return null; }
    const f = pickFlight(list.slice().sort((a, b) => new Date(a.dep).getHours() >= 8 ? -1 : 1)); const kind = useTrain ? "train" : "flight";
    const together = mode === "together"; const people = together ? ["me", charId] : ["me"];
    const seats = adjacentSeats(f.no, f.dep, people.length, kind === "flight");
    const tk = await makeTicket(kind, home, to, f, people, seats, { giftBy: charId, giftMsg: msg, giftReason: reason, surprise: !!surprise });
    tk.total = 0; save(COL.tickets, tk);
    const geo = await geocode(to);
    const trip = addRow(COL.trips, "trips", { id: uid("trip"), title: together ? to : `去${to}找${c.name}`, city: to, country: geo ? geo.country : "", lat: geo ? geo.lat : null, lng: geo ? geo.lng : null, start: ymd(f.dep), days: Math.max(1, Math.min(15, days || 3)), companions: [charId], createdAt: nowIso() });
    tk.tripId = trip.id; save(COL.tickets, tk);
    remember([charId], `我给${herName()}订了${kind === "flight" ? "机票" : "火车票"}：${home} → ${to}，${mdw(f.dep)} ${hm(f.dep)} ${f.no}${together ? `，我和她一起去，座位 ${herName()} ${tk.seats.me}、我 ${tk.seats[charId]}` : `，她来${to}找我`}。我对她说：${tk.giftMsg}`, `gift_${tk.id}`);
    // 他在聊天里把票发给她
    try {
      if (api.chat && api.chat.sendCard) await api.chat.sendCard({ characterId: charId, role: "assistant", historyRole: "assistant", sceneId: tk.id, sceneTag: "travel_gift",
        summary: `[旅行] ${c.name}给你订了${kind === "flight" ? "机票" : "火车票"}：${home} → ${to}`, historyText: `[旅行] 我给${herName()}订了${kind === "flight" ? "机票" : "火车票"}：${home} → ${to}，${mdw(f.dep)} ${hm(f.dep)} ${f.no}${together ? "，我们一起去" : ""}。`,
        card: { appLabel: "旅行", title: `${home} → ${to}`, subtitle: `${mdw(f.dep)} ${hm(f.dep)} · ${f.no}`, body: `${c.name}给你订了${kind === "flight" ? "机票" : "火车票"}${together ? `，座位挨着：${tk.seats.me} / ${tk.seats[charId]}` : ""}`, accentColor: "#2b5bd7" } });
      if (tk.giftMsg && api.chat && api.chat.sendMessage) await api.chat.sendMessage({ characterId: charId, role: "assistant", content: tk.giftMsg });
    } catch (e) { console.warn("发到聊天", e); }
    renderAll(); return tk;
  }
  /** 惊喜：他自己买票来找她，票发到聊天 */
  async function comeSurprise(c, his, date, msg) {
    const tk = await bookCome(c.id, his, date, msg); if (!tk) return null; const home = S.meta.home; const k = tk.kind === "flight" ? "航班" : "高铁";
    try {
      if (api.chat && api.chat.sendCard) await api.chat.sendCard({ characterId: c.id, role: "assistant", historyRole: "assistant", sceneId: tk.id, sceneTag: "travel_come",
        summary: `[旅行] ${c.name}买了票来找你：${his} → ${home}`, historyText: `[旅行] 我瞒着${herName()}买了${mdw(tk.dep)}来${home}找她的${k} ${tk.no}，${hm(tk.dep)}出发，${hm(tk.arr)}到。`,
        card: { appLabel: "旅行", title: `${his} → ${home}`, subtitle: `${mdw(tk.dep)} ${hm(tk.dep)} · ${tk.no}`, body: `${c.name}要来找你，${hm(tk.arr)} 到`, accentColor: "#2b5bd7" } });
      if (msg && api.chat && api.chat.sendMessage) await api.chat.sendMessage({ characterId: c.id, role: "assistant", content: msg });
    } catch (e) { console.warn("发到聊天", e); }
    renderAll(); return tk;
  }
  /** 我去找他：她说想去，他给她订票 */
  async function goToHim() {
    if (!S.chars.length) { toast("还没有角色"); return; } const home = await needHome(); if (!home) return;
    const r = await form("我去找他", [{ k: "who", label: "去找谁", type: "choice", options: charOptions(), value: S.chars[0].id }, { k: "his", label: "他在哪（会记住）", value: homeOf(S.chars[0].id), ph: "上海" }, { k: "date", label: "哪天出发", type: "date", value: ymd(addDays(new Date(), 3)) }, { k: "days", label: "待几天", value: "3", ph: "3" }, { k: "say", label: "想对他说（选填）", type: "textarea", ph: "想你了" }], "告诉他");
    if (!r || !r.who || !r.his.trim() || !r.date) return; const c = charById(r.who); if (!c) return;
    const his = r.his.trim(); S.meta.charHome = { ...(S.meta.charHome || {}), [r.who]: his }; saveMeta();
    if (his === home) { toast("你们在同一个城市呀"); return; } if (dayDiff(new Date(), r.date) < 0) { toast("日期已经过了"); return; }
    const days = Math.max(1, Math.min(15, num(r.days, 3)));
    const said = `${r.say.trim() ? r.say.trim() + "\n" : ""}我${mdw(r.date)}去${his}找你，待${days}天`;
    try { if (api.chat && api.chat.sendMessage) await api.chat.sendMessage({ characterId: c.id, role: "user", content: said }); } catch (e) { console.warn(e); }
    toast(`${c.name}在给你订票……`);
    const msg = await aiGen(c.id, "go_him", [nowLine(), CHAR_RULE, `${herName()}想你了，对你说：「${said}」。你马上给她订好了从${home}来${his}的票。写一两句订完票对她说的话，只输出这句话本身。`].join("\n\n"), `${c.name}订票`);
    const tk = await bookForHer(c, "visit", his, r.date, days, String(msg || "").trim().slice(0, 400), "", false); if (tk) showGift(tk);
  }
  /** 打开 app 时偶尔：他自己给她订票（开关在订票页） */
  async function maybeSurprise() {
    if (S.meta.surprise === false || !S.meta.home) return;
    const last = ts(S.meta.lastSurprise || 0); if (Date.now() - last < 10 * 864e5) return;
    if (Math.random() > .12) return;
    const pool = [...new Set([...S.trips.flatMap(t => t.companions), ...Object.keys(S.meta.charHome || {})])].filter(charById); if (!pool.length) return;
    S.meta.lastSurprise = nowIso(); saveMeta();
    const tk = await charBooksForMe(pick(pool), "", true); if (tk) showGift(tk);
  }
  function showGift(tk) {
    const el = document.createElement("div"); el.className = "sheet-wrap";
    el.innerHTML = `<div class="dim"></div><div class="giftbox"><div class="g-top">${ava(tk.giftBy)}<b>${esc(nameOf(tk.giftBy))}${tk.toMe ? "要来找你了" : "给你订了票"}</b></div>${ticketCard(tk, tk.toMe ? tk.giftBy : "me")}${tk.giftMsg ? `<div class="g-msg">「${esc(tk.giftMsg)}」</div>` : ""}<button class="btn-b wide" data-g="open">看看</button></div>`;
    document.body.appendChild(el); el.onclick = e => { if (e.target.closest("[data-g]")) { el.remove(); push(tk.toMe ? "flight" : "ticket", { id: tk.id }); } else if (e.target.classList.contains("dim")) el.remove(); };
  }
  /** 发到聊天：她把票 / 攻略 / 打卡发给他 */
  async function shareTo(kind, obj) {
    if (!api.chat || !api.chat.sendCard) { toast("这个小手机不支持发到聊天"); return; }
    const trip = kind === "spot" ? S.trips.find(x => x.id === obj.tripId) : S.trips.find(x => x.id === obj.tripId);
    const pref = (trip ? trip.companions : obj.people ? obj.people.filter(x => x !== "me") : []).filter(charById);
    const people = [...pref, ...S.chars.map(c => c.id).filter(x => !pref.includes(x))];
    const r = await form("发到聊天", [{ k: "who", label: "发给谁", type: "choice", options: people.map(id => ({ v: id, n: nameOf(id), ava: id })), value: people[0] }, { k: "note", label: "附一句话（选填）", type: "textarea" }], "发送");
    if (!r || !r.who) return;
    let card, summary, history;
    if (kind === "ticket") {
      const t = obj; const title = t.kind === "hotel" ? t.hotel : `${t.from} → ${t.to}`;
      const seatTxt = t.kind === "hotel" ? `${t.nights} 晚` : t.people.map(w => `${realName(w)} ${t.seats[w]}`).join("、");
      card = { appLabel: "旅行", title, subtitle: t.kind === "hotel" ? `${mdw(t.date)} 入住` : `${mdw(t.dep)} ${hm(t.dep)} · ${t.no}`, body: t.kind === "hotel" ? `${t.nights} 晚 · ${t.rooms} 间` : `座位：${seatTxt}`, accentColor: t.kind === "hotel" ? "#c58b5b" : "#2b5bd7" };
      summary = `[旅行] ${title}`; history = `[旅行] ${herName()}把一张${t.kind === "flight" ? "机票" : t.kind === "train" ? "火车票" : "酒店订单"}发给了你：${title}，${card.subtitle}，${card.body}。${t.toMe ? "（这是你来找她的票）" : ""}`;
    } else if (kind === "plan") {
      const p = obj; card = { appLabel: "旅行 · 攻略", title: p.title, subtitle: `${p.city} · ${p.days.length} 天`, body: p.days.map((d, i) => `D${i + 1} ${d.items.map(x => x.name).join(" → ")}`).join("\n").slice(0, 300), accentColor: "#2b5bd7" };
      summary = `[攻略] ${p.title}`; history = `[旅行攻略] ${herName()}把攻略「${p.title}」（${p.city}）发给了你：\n${planText(p)}`;
    } else {
      const s = obj; card = { appLabel: "旅行 · 打卡", title: s.name, subtitle: `${trip ? trip.title + " · " : ""}${mdw(s.at)}`, body: (s.notes[0] || {}).text || `${s.photos.length} 张照片`, accentColor: "#3b7cff" };
      summary = `[打卡] ${s.name}`; history = `[旅行打卡] ${herName()}发来她在「${s.name}」的打卡（${mdw(s.at)}）${s.photos.length ? `，${s.photos.length} 张照片${s.photos.filter(x => x.desc).length ? "：" + s.photos.map(x => x.desc).filter(Boolean).join("；") : ""}` : ""}。${s.notes.map(n => `${realName(n.who)}写：${n.text}`).join(" ")}`;
    }
    try {
      await api.chat.sendCard({ characterId: r.who, role: "user", historyRole: "user", summary, historyText: history, sceneId: obj.id, sceneTag: `travel_${kind}`, card });
      if (r.note.trim() && api.chat.sendMessage) await api.chat.sendMessage({ characterId: r.who, role: "user", content: r.note.trim() });
      toast(`发给${nameOf(r.who)}了，去聊天里看看`);
    } catch (e) { toast(`没发出去：${(e && e.message) || e}`.slice(0, 50)); }
  }
  // 航班动态页
  PAGES.flight = p => {
    const t = S.tickets.find(x => x.id === p.data.id); if (!t) return topbar("") + `<div class="empty">这班不见了</div>`;
    const who = t.people[0]; const st = flightState(t); const isF = t.kind === "flight";
    const r = seeded(`${t.no}${t.dep}gate`); const exitG = `${pick(["A", "B", "C"])}`, belt = 10 + Math.floor(r() * 30), ontime = 70 + Math.floor(r() * 25);
    const left = st.k === "fly" ? `还有 ${leftText(st.arr - Date.now())}落地` : st.k === "land" ? `${hm(st.arr)} 已经落地` : `${md(st.dep)} ${hm(st.dep)} 起飞${st.k === "plan" ? `，还有 ${leftText(st.dep - Date.now())}` : ""}`;
    return `<div class="lmap full" id="flmap"></div>${topbar("")}
      <div class="trip-chip"><div><b>${esc(t.from)} → ${esc(t.to)}</b><small>${esc(isF ? `${t.carrier} ${t.no}` : t.no)}</small></div></div>
      <div class="fcard"><div class="fh">${ava(who)}<div><b>${esc(nameOf(who))}${isF ? " 的航班" : " 的车次"}</b><small>${esc(mdw(t.dep))} · 来找你</small></div><span class="fst ${st.k}">${t.delay && st.k !== "land" ? `延误 · ` : ""}${st.n}</span></div>
        <div class="prog"><div class="e"><b>${hm(st.dep)}</b><small>${esc(isF ? t.fromAp : t.fromSt)}${t.delay ? `<s>${hm(t.dep)}</s>` : ""}</small></div><div class="pbar"><i style="width:${Math.round(st.p * 100)}%"></i><span style="left:${Math.round(st.p * 100)}%">${isF ? I.plane : I.train}</span></div><div class="e r"><b>${hm(st.arr)}</b><small>${esc(isF ? t.toAp : t.toSt)}</small></div></div>
        <div class="left">${t.delay ? `延误 ${t.delay} 分钟 · ` : ""}${esc(left)}</div>
        ${isF ? `<div class="fgrid"><div>到达口<b>${exitG}</b></div><div>行李转盘<b>${belt}</b></div><div>准点率<b>${ontime}%</b></div></div>` : `<div class="fgrid"><div>车厢<b>${esc(t.car)}</b></div><div>座位<b>${esc(t.seats[who])}</b></div><div>出站口<b>${exitG}</b></div></div>`}
        ${(t.msgs || []).length ? `<div class="fmsgs">${t.msgs.map(m => `<div class="${m.who === "me" ? "me" : "him"}">${m.pending ? `<em>${esc(nameOf(who))}${st.k === "land" ? "正在看" : "在路上，到了会看到"}</em>` : ""}${esc(m.text)}</div>`).join("")}</div>` : ""}
        <div class="fbtns"><div data-act="fl-msg" data-id="${t.id}">给他留言</div><div class="p ${t.pickup ? "done" : ""}" data-act="fl-pick" data-id="${t.id}">${t.met ? "接到了" : t.pickup ? (st.k === "land" ? "接到他了" : "会去接他") : "我去接机"}</div></div></div>`;
  };
  PAGES.flight.after = p => {
    const t = S.tickets.find(x => x.id === p.data.id); if (!t || !t.fromLL || !t.toLL) return;
    const mp = makeMap($("#flmap", p.el)); if (!mp) return; const st = flightState(t);
    const A = t.fromLL, B = t.toLL; const pts = []; const bend = Math.min(6, km(A, B) / 600);
    for (let i = 0; i <= 40; i++) { const k = i / 40; pts.push([A[0] + (B[0] - A[0]) * k + Math.sin(k * Math.PI) * bend * .4, A[1] + (B[1] - A[1]) * k + Math.sin(k * Math.PI) * bend * .6]); }
    mp.decide(B[0], B[1]);
    mp.line(pts, { color: "#2b5bd7", weight: 3, dashArray: "6 8" }); const cut = Math.round(st.p * 40); if (cut > 0) mp.line(pts.slice(0, cut + 1), { color: "#2b5bd7", weight: 4 });
    for (const q of [A, B]) mp.marker(q[0], q[1], `<div class="fdot"></div>`, [16, 16]);
    const at = pts[Math.min(40, cut)]; mp.marker(at[0], at[1], `<div class="fplane">${t.kind === "flight" ? I.plane : I.train}</div>`, [34, 34]);
    mp.fit([A, B], [130, 400]);
    // 他落地了，看留言回一句
    const pend = (t.msgs || []).find(m => m.pending);
    if (pend && st.k === "land" && !p.data.replying) { p.data.replying = true; flightReply(t).then(() => { p.data.replying = false; }); }
  };
  async function flightReply(t) {
    const who = t.people[0]; const st = flightState(t); const pend = t.msgs.filter(m => m.pending);
    const ins = [nowLine(), CHAR_RULE, `【这次要做的】你坐${t.no}从${t.from}去${t.to}找${herName()}，${st.k === "land" ? "刚落地" : st.k === "fly" ? "人在飞机上" : st.k === "board" ? "正在登机" : "还没出发"}${t.delay ? `，延误了 ${t.delay} 分钟` : ""}。${t.pickup ? "她说会来接你。" : ""}她在航班动态里给你留言：\n${pend.map(m => m.text).join("\n")}`, `回她一两句，只输出你要说的话。`].join("\n\n");
    const raw = await aiGen(who, "flightmsg", ins, `${nameOf(who)}回留言`); if (!raw) return;
    for (const m of pend) delete m.pending;
    t.msgs.push({ who, text: String(raw).trim().slice(0, 300), at: nowIso() }); save(COL.tickets, t);
    remember([who], `${herName()}在我的航班${t.no}动态里留言：${pend.map(m => m.text).join(" / ")}。我回她：${String(raw).trim()}`, `flmsg_${t.id}_${Date.now()}`);
    renderAll();
  }

  // ───────────────────────── 弹层 ─────────────────────────
  function sheet(title, options) {
    return new Promise(res => {
      const el = document.createElement("div"); el.className = "sheet-wrap";
      el.innerHTML = `<div class="dim"></div><div class="sheet"><div class="h"></div>${title ? `<div class="st">${esc(title)}</div>` : ""}${options.map((o, i) => `<div class="op ${o.red ? "red" : ""}" data-i="${i}">${o.icon ? I[o.icon] : ""}<span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</div>`).join("")}</div>`;
      document.body.appendChild(el); el.onclick = e => { const op = e.target.closest(".op"); el.remove(); res(op ? options[+op.dataset.i].value : null); };
    });
  }
  /** 表单弹窗：fields [{k,label,type:text|textarea|date|datetime|number|choice|multi,value,options:[{v,n}]}] */
  function form(title, fields, okText) {
    return new Promise(res => {
      const el = document.createElement("div"); el.className = "sheet-wrap"; const st = {};
      for (const f of fields) st[f.k] = f.type === "multi" ? [...(f.value || [])] : f.value == null ? "" : f.value;
      const field = f => f.type === "textarea" ? `<textarea data-k="${f.k}" rows="3" placeholder="${esc(f.ph || "")}">${esc(st[f.k])}</textarea>`
        : f.type === "choice" || f.type === "multi" ? `<div class="pchips" data-k="${f.k}">${f.options.map(o => `<span data-v="${esc(o.v)}" class="${(f.type === "multi" ? st[f.k].includes(o.v) : st[f.k] === o.v) ? "on" : ""}">${o.ava ? ava(o.ava, "s") : ""}${esc(o.n)}</span>`).join("")}</div>`
        : `<input data-k="${f.k}" type="${f.type === "datetime" ? "datetime-local" : f.type || "text"}" placeholder="${esc(f.ph || "")}" value="${esc(st[f.k])}">`;
      el.innerHTML = `<div class="dim"></div><div class="dialog"><div class="st">${esc(title)}</div>${fields.map(f => `<label>${esc(f.label)}</label>${field(f)}`).join("")}<div class="dbtns"><button data-v="0">取消</button><button data-v="1" class="blue">${esc(okText || "确定")}</button></div></div>`;
      document.body.appendChild(el);
      el.addEventListener("input", e => { const k = e.target.dataset.k; if (k) st[k] = e.target.value; });
      el.onclick = e => {
        const chip = e.target.closest(".pchips span"); if (chip) { const box = chip.parentElement; const f = fields.find(x => x.k === box.dataset.k); const v = chip.dataset.v;
          if (f.type === "multi") { st[f.k] = st[f.k].includes(v) ? st[f.k].filter(x => x !== v) : [...st[f.k], v]; chip.classList.toggle("on"); } else { st[f.k] = v; box.querySelectorAll("span").forEach(s => s.classList.toggle("on", s === chip)); } return; }
        const b = e.target.closest("[data-v]"); if (!b && !e.target.classList.contains("dim")) return; if (b && !b.closest(".dbtns")) return;
        el.remove(); res(b && b.dataset.v === "1" ? st : null);
      };
      setTimeout(() => { const f = el.querySelector("input,textarea"); f && f.focus(); }, 60);
    });
  }
  const charOptions = () => S.chars.map(c => ({ v: c.id, n: c.name, ava: c.id }));
  /** 选位置：返回 [lat,lng]（WGS84）或 null */
  function pickPosition(at) { return new Promise(res => { push("pickpos", { at, res }); }); }

  // ───────────────────────── 动作 ─────────────────────────
  async function newTrip(pre) {
    const r = await form("新的旅行", [
      { k: "city", label: "去哪（城市或国家）", value: (pre && pre.city) || "", ph: "大理" },
      { k: "title", label: "叫什么（选填）", value: (pre && pre.title) || "", ph: "比如：大理看海" },
      { k: "start", label: "出发日期", type: "date", value: (pre && pre.start) || ymd(new Date()) },
      { k: "days", label: "玩几天", type: "number", value: (pre && pre.days) || 3 },
      { k: "with", label: "和谁一起（不选就是自己去）", type: "multi", options: charOptions(), value: (pre && pre.with) || [] },
    ], "建好了");
    if (!r || !r.city.trim()) return null;
    const city = r.city.trim(); const geo = await geocode(city);
    const t = addRow(COL.trips, "trips", { id: uid("trip"), title: r.title.trim() || city, city, country: geo ? geo.country : "", lat: geo ? geo.lat : null, lng: geo ? geo.lng : null, start: r.start || ymd(new Date()), days: Math.max(1, Math.min(60, +r.days || 1)), companions: r.with, createdAt: nowIso() });
    if (!geo) toast("没找到这个地方的位置，打卡时在地图上选就好");
    if (t.companions.length) remember(t.companions, `我和${herName()}${t.companions.length > 1 ? `、${t.companions.filter(Boolean).map(nameOf).join("、")}` : ""}要一起去${city}旅行（${md(t.start)}出发，${t.days}天），她建了这趟旅行。`, `trip_${t.id}`);
    return t;
  }
  async function newSpot(trip) {
    const plan = S.plans.find(x => x.tripId === trip.id);
    const planned = plan ? plan.days.flatMap(d => d.items).filter(it => !S.spots.some(s => s.tripId === trip.id && s.name === it.name)) : [];
    let name = "", pos = null;
    if (planned.length) {
      const v = await sheet("打卡哪里？", [...planned.slice(0, 8).map(it => ({ label: it.name, sub: it.time || "攻略里的", value: it.id, icon: "pin" })), { label: "别的地方", value: "_new", icon: "plus" }]);
      if (!v) return; if (v !== "_new") { const it = planned.find(x => x.id === v); name = it.name; if (it.lat != null) pos = [it.lat, it.lng]; }
    }
    const def = new Date(); const inTrip = dayDiff(trip.start, def) >= 0 && dayDiff(trip.start, def) < (trip.days || 1);
    const at0 = inTrip ? def : new Date(`${trip.start}T${pad(def.getHours())}:${pad(def.getMinutes())}`);
    const r = await form("打卡", [{ k: "name", label: "这是哪", value: name, ph: "黑沙滩" }, { k: "at", label: "什么时候", type: "datetime", value: `${ymd(at0)}T${hm(at0)}` }, { k: "note", label: "写一句（选填）", type: "textarea", ph: "风大到站不稳……" }], "打卡");
    if (!r || !r.name.trim()) return;
    if (!pos) {
      const v = await sheet("位置", [{ label: "在地图上选", value: "map", icon: "crosshair" }, ...(trip.lat != null ? [{ label: "先放在城市中心", sub: "以后可以改", value: "center", icon: "pin" }] : [])]);
      if (v === "map") pos = await pickPosition(trip.lat != null ? [trip.lat, trip.lng] : null);
      if (!pos && trip.lat != null) pos = [trip.lat + (Math.random() - .5) * .02, trip.lng + (Math.random() - .5) * .02];
    }
    const s = addRow(COL.spots, "spots", { id: uid("spot"), tripId: trip.id, name: r.name.trim(), lat: pos ? pos[0] : null, lng: pos ? pos[1] : null, at: new Date(r.at || Date.now()).toISOString(), photos: [], notes: r.note.trim() ? [{ who: "me", text: r.note.trim(), at: nowIso() }] : [] });
    if (trip.companions.length) remember(trip.companions, `${trip.title}：我们在「${s.name}」打了卡（${mdw(s.at)}）。${r.note.trim() ? `她写：${r.note.trim()}` : ""}`, `spot_${s.id}`);
    push("spot", { id: s.id });
  }
  async function importRoute(city, i) {
    const g = guideOf(city); const rt = g && g.base.routes[i]; if (!rt) return;
    const trips = S.trips.filter(t => t.city === city);
    const v = await sheet("导入到哪趟旅行？", [...trips.map(t => ({ label: t.title, sub: withText(t.companions), value: t.id, icon: "map" })), { label: "新建一趟旅行", value: "_new", icon: "plus" }, { label: "先不放进旅行", value: "_none", icon: "doc" }]);
    if (!v) return; let trip = null;
    if (v === "_new") { trip = await newTrip({ city, days: rt.days.length }); if (!trip) return; } else if (v !== "_none") trip = S.trips.find(t => t.id === v);
    const center = { lat: num(g.base.lat, trip ? trip.lat : 0), lng: num(g.base.lng, trip ? trip.lng : 0) };
    const pl = addRow(COL.plans, "plans", { id: uid("plan"), tripId: trip ? trip.id : null, title: rt.title, city, start: trip ? trip.start : null, author: "me", days: itemsFrom(rt.days, center.lat ? center : null, null), comments: [], createdAt: nowIso(), updatedAt: nowIso() });
    toast("导进攻略了"); push("plan", { id: pl.id });
  }
  async function payWallet(amount, title, detail) {
    let accounts = [];
    try { const w = await (api.wallet.get ? api.wallet.get() : null); accounts = (w && (w.accounts || (w.wallet && w.wallet.accounts))) || []; } catch (e) { /* 没权限就用默认 */ }
    let accountId;
    if (accounts.length > 1) {
      const v = await sheet(`付款 ${yuan(amount)}`, accounts.map(a => ({ label: a.title || "余额", sub: a.balanceLabel || "", value: a.id, icon: "ticket" })));
      if (!v) return false; accountId = v;
    }
    try { const r = await api.wallet.pay({ amount, title, detail, category: "旅行", ...(accountId ? { accountId } : {}) }); if (r && r.ok === false) { toast(r.error || "付款没成功"); return false; } return true; }
    catch (e) { toast(`付款没成功：${(e && e.message) || e}`.slice(0, 50)); return false; }
  }
  /** 找到或建一趟旅行，把票挂上去 */
  async function tripFor(city, date, people) {
    const comp = people.filter(x => x !== "me");
    const same = S.trips.filter(x => x.city === city || (x.city && (city.includes(x.city) || x.city.includes(city))));
    let t = null;
    if (same.length) { const v = await sheet("这张票属于哪趟旅行？", [...same.map(x => ({ label: x.title, sub: `${md(x.start)} · ${withText(x.companions)}`, value: x.id, icon: "map" })), { label: "新的一趟", value: "_new", icon: "plus" }]); t = same.find(x => x.id === v) || null; }
    if (!t) { t = addRow(COL.trips, "trips", { id: uid("trip"), title: city, city, country: "", lat: null, lng: null, start: ymd(date), days: 3, companions: comp, createdAt: nowIso() }); geocode(city).then(g => { if (g) { t.lat = g.lat; t.lng = g.lng; t.country = g.country; save(COL.trips, t); } }); }
    return t;
  }
  async function seatRemark(t) {
    const c = t.people.find(x => x !== "me"); if (!c || !charById(c)) return;
    const ins = [nowLine(), CHAR_RULE, `【这次要做的】${herName()}刚订了你们一起的${t.kind === "flight" ? "机票" : "火车票"}：${t.from} → ${t.to}，${mdw(t.dep)} ${hm(t.dep)}，${t.no}。座位：${t.people.map(w => `${realName(w)} ${t.seats[w]}`).join("、")}。`, `你看到座位安排说一句话（一句就好，按你的性格），只输出这句话。`].join("\n\n");
    const raw = await aiGen(c, "seat", ins, `${nameOf(c)}看座位`); if (!raw) return;
    t.remark = { who: c, text: String(raw).replace(/^["“「]|["”」]$/g, "").trim().slice(0, 200) }; save(COL.tickets, t); renderAll();
  }

  document.addEventListener("click", async e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const act = t.dataset.act, id = t.dataset.id; const top = S.stack[S.stack.length - 1];
    switch (act) {
      case "back": if (top && top.kind === "pickpos" && top.data.res) top.data.res(null); pop(); return;
      case "tab": S.tab = t.dataset.t; while (S.stack.length) pop(); renderBase(); return;
      case "debug": push("debug"); return;
      // 足迹
      case "foot-filter": S.meta.footFilter = t.dataset.f; saveMeta(); renderBase(); return;
      case "trip-new": { const tr = await newTrip(); if (tr) { renderAll(); push("trip", { id: tr.id }); } return; }
      case "trip": push("trip", { id }); return;
      case "trip-day": top.data.day = +t.dataset.d; top.data._view = null; renderPage(top); return;
      case "trip-more": {
        const tr = S.trips.find(x => x.id === id);
        const v = await sheet(tr.title, [{ label: "改名字、日期、同行的人", value: "edit", icon: "pen" }, { label: "换封面", value: "cover", icon: "img" }, { label: "删除这趟旅行", value: "del", icon: "trash", red: true }]);
        if (v === "edit") {
          const r = await form("改一下", [{ k: "title", label: "名字", value: tr.title }, { k: "start", label: "出发日期", type: "date", value: tr.start }, { k: "days", label: "天数", type: "number", value: tr.days }, { k: "with", label: "和谁一起", type: "multi", options: charOptions(), value: tr.companions }]);
          if (r) { const added = r.with.filter(x => !tr.companions.includes(x)); Object.assign(tr, { title: r.title.trim() || tr.title, start: r.start || tr.start, days: Math.max(1, +r.days || tr.days), companions: r.with }); save(COL.trips, tr); if (added.length) remember(added, `${herName()}把我加进了她的旅行「${tr.title}」，我们要一起去${tr.city}。`, `trip_add_${tr.id}_${Date.now()}`); renderAll(); }
        } else if (v === "cover") { const ref = await changeImage(`${tr.city}的风景`, tr.companions); if (ref) { tr.coverRef = ref; save(COL.trips, tr); renderAll(); } }
        else if (v === "del") { const ok = await sheet(`删除「${tr.title}」？打卡和照片都会删掉`, [{ label: "删除", value: "y", red: true, icon: "trash" }]); if (ok) { for (const s of tripSpots(tr)) delRow(COL.spots, "spots", s); for (const pl of S.plans.filter(x => x.tripId === tr.id)) { pl.tripId = null; save(COL.plans, pl); } delRow(COL.trips, "trips", tr); pop(); renderAll(); } }
        return;
      }
      case "spot-new": { const tr = S.trips.find(x => x.id === id); if (tr) await newSpot(tr); return; }
      case "spot": push("spot", { id }); return;
      case "spot-photo": { const s = S.spots.find(x => x.id === id); try { const refs = await pickImages(9); if (refs.length) { s.photos.push(...refs.map(ref => ({ ref, desc: "" }))); save(COL.spots, s); renderAll(); } } catch (err) { toast("没选成"); } return; }
      case "spot-gen": {
        const s = S.spots.find(x => x.id === id); const tr = S.trips.find(x => x.id === s.tripId);
        const r = await form("生一张", [{ k: "p", label: "画面", type: "textarea", value: `${s.name}，` }, ...(tr && tr.companions.length ? [{ k: "who", label: "照片里有谁（带他的参考图）", type: "choice", options: [{ v: "", n: "没有人" }, ...tr.companions.map(c => ({ v: c, n: nameOf(c), ava: c }))] }] : [])]);
        if (!r || !r.p.trim()) return; toast("在生成了，稍等一下");
        const ref = await genImage(r.p.trim(), r.who || null); if (ref) { s.photos.push({ ref, desc: r.p.trim() }); save(COL.spots, s); renderAll(); }
        return;
      }
      case "spot-note": { const s = S.spots.find(x => x.id === id); const r = await form("写一句", [{ k: "t", label: "", type: "textarea" }]); if (r && r.t.trim()) { s.notes.push({ who: "me", text: r.t.trim(), at: nowIso() }); save(COL.spots, s); const tr = S.trips.find(x => x.id === s.tripId); if (tr && tr.companions.length) remember(tr.companions, `${tr.title}「${s.name}」：${herName()}写了一句「${r.t.trim()}」`, `note_${s.id}_${Date.now()}`); renderAll(); } return; }
      case "spot-ask": {
        const s = S.spots.find(x => x.id === id); const tr = S.trips.find(x => x.id === s.tripId); const c = t.dataset.c;
        toast(`${nameOf(c)}在想写什么……`); const text = await charSpotNote(c, s, tr); if (!text) return;
        s.notes.push({ who: c, text, at: nowIso() }); save(COL.spots, s); remember([c], `我在${herName()}的旅行「${tr.title}」的打卡点「${s.name}」下面写了：${text}`, `note_${s.id}_${Date.now()}`); renderAll(); return;
      }
      case "note-rm": { const s = S.spots.find(x => x.id === id); s.notes.splice(+t.dataset.i, 1); save(COL.spots, s); renderAll(); return; }
      case "photo": push("photo", { id, i: +t.dataset.i }); return;
      case "photo-del": { const s = S.spots.find(x => x.id === id); s.photos.splice(+t.dataset.i, 1); save(COL.spots, s); pop(); renderAll(); return; }
      case "spot-move": { const s = S.spots.find(x => x.id === id); const pos = await pickPosition(s.lat != null ? [s.lat, s.lng] : null); if (pos) { s.lat = pos[0]; s.lng = pos[1]; save(COL.spots, s); toast("位置改好了"); renderAll(); } return; }
      case "spot-edit": { const s = S.spots.find(x => x.id === id); const r = await form("改一下", [{ k: "name", label: "名字", value: s.name }, { k: "at", label: "时间", type: "datetime", value: `${ymd(s.at)}T${hm(s.at)}` }]); if (r) { s.name = r.name.trim() || s.name; if (r.at) s.at = new Date(r.at).toISOString(); save(COL.spots, s); renderAll(); } return; }
      case "spot-del": { const s = S.spots.find(x => x.id === id); const ok = await sheet(`删除「${s.name}」？`, [{ label: "删除", value: "y", red: true, icon: "trash" }]); if (ok) { delRow(COL.spots, "spots", s); pop(); renderAll(); } return; }
      case "pick-ok": { const d = top.data; const pos = d.mp ? d.mp.center() : null; const res = d.res; d.res = null; pop(); if (res) res(pos); return; }
      // 发现
      case "city": openCity(t.dataset.c); return;
      case "city-retry": pop(); openCity(t.dataset.c); return;
      case "city-tab": top.data.tab = t.dataset.t; renderPage(top); return;
      case "city-flt": top.data.flt = t.dataset.f; renderPage(top); return;
      case "city-more": { const g = guideOf(top.data.city); ensureMore(g, top); return; }
      case "city-redo": { const ok = await sheet("重新整理这座城市？会再用 1～2 次 API", [{ label: "重新整理", value: "y", icon: "spark" }]); if (!ok) return; const g = guideOf(top.data.city); if (g) delRow(COL.guides, "guides", g); const c = top.data.city; pop(); openCity(c); return; }
      case "city-cover": { const g = guideOf(top.data.city); const ref = await changeImage(`${g.city}的城市风景`); if (ref) { g.coverRef = ref; save(COL.guides, g); renderAll(); } return; }
      case "route-import": importRoute(t.dataset.c, +t.dataset.i); return;
      case "poi": push("poi", { city: top.data.city, k: t.dataset.k, i: +t.dataset.i }); return;
      case "poi-cover": { const g = guideOf(top.data.city); const list = top.data.k === "sight" ? g.base.sights : top.data.k === "food" ? g.more.foods : g.more.hotels; const s = list[top.data.i]; const ref = await changeImage(s.name); if (ref) { s.coverRef = ref; save(COL.guides, g); renderAll(); } return; }
      case "poi-fav": { const g = guideOf(top.data.city); const list = top.data.k === "sight" ? g.base.sights : top.data.k === "food" ? g.more.foods : g.more.hotels; const k = `${top.data.city}|${list[top.data.i].name}`; S.meta.favs = S.meta.favs.includes(k) ? S.meta.favs.filter(x => x !== k) : [...S.meta.favs, k]; saveMeta(); renderPage(top); return; }
      case "poi-book": { const c = top.data.city; S.book = { ...(S.book || { from: S.meta.home || "", with: [], nights: 2 }), kind: "hotel", to: c, date: (S.book && S.book.date) || ymd(addDays(new Date(), 7)) }; S.tab = "book"; while (S.stack.length) pop(); renderBase(); return; }
      case "poi-add": {
        const g = guideOf(top.data.city); const list = top.data.k === "sight" ? g.base.sights : g.more.foods; const s = list[top.data.i];
        const pls = S.plans.filter(x => x.city === top.data.city);
        const v = await sheet("加进哪份攻略？", [...pls.map(x => ({ label: x.title, sub: `${x.days.length} 天`, value: x.id, icon: "doc" })), { label: "新建一份攻略", value: "_new", icon: "plus" }]); if (!v) return;
        let pl = pls.find(x => x.id === v);
        if (!pl) pl = addRow(COL.plans, "plans", { id: uid("plan"), tripId: (S.trips.find(x => x.city === top.data.city) || {}).id || null, title: `${top.data.city}攻略`, city: top.data.city, start: null, author: "me", days: [{ title: "", items: [] }], comments: [], createdAt: nowIso(), updatedAt: nowIso() });
        const dayOpts = pl.days.map((d, i) => ({ label: `第 ${i + 1} 天`, sub: d.title, value: String(i) })); dayOpts.push({ label: "新的一天", value: "new", icon: "plus" });
        const dv = pl.days.length > 1 || pl.days[0].items.length ? await sheet("放在哪天？", dayOpts) : "0"; if (dv == null) return;
        if (dv === "new") pl.days.push({ title: "", items: [] }); const di = dv === "new" ? pl.days.length - 1 : +dv;
        const c = okCoord(s); pl.days[di].items.push({ id: uid("i"), time: "", name: s.name, desc: s.duration ? `建议 ${s.duration}` : s.price ? `人均 ${s.price}` : "", note: "", ...(c ? { lat: c[0], lng: c[1] } : {}) });
        pl.updatedAt = nowIso(); save(COL.plans, pl); toast(`加进「${pl.title}」第 ${di + 1} 天了`); return;
      }
      // 攻略
      case "plan": push("plan", { id }); return;
      case "plan-new": case "plan-new-trip": {
        const tr = act === "plan-new-trip" ? S.trips.find(x => x.id === id) : null;
        const r = tr ? { city: tr.city, days: tr.days, title: `${tr.title}攻略` } : await form("自己写一份攻略", [{ k: "city", label: "去哪", ph: "大理" }, { k: "days", label: "几天", type: "number", value: 3 }, { k: "title", label: "标题（选填）" }]);
        if (!r || !String(r.city).trim()) return;
        if (tr && act === "plan-new-trip") { const v = await sheet("怎么做攻略？", [{ label: "我自己写", value: "me", icon: "pen" }, ...tr.companions.map(c => ({ label: `让${nameOf(c)}写`, value: c, icon: "spark" })), ...(tr.companions.length ? [] : S.chars.map(c => ({ label: `让${c.name}写`, value: c.id, icon: "spark" })))]); if (!v) return; if (v !== "me") { await askPlan(v, { city: tr.city, days: tr.days, start: tr.start, with: tr.companions, tripId: tr.id }); return; } }
        const pl = addRow(COL.plans, "plans", { id: uid("plan"), tripId: tr ? tr.id : null, title: String(r.title || "").trim() || `${String(r.city).trim()}攻略`, city: String(r.city).trim(), start: tr ? tr.start : null, author: "me", days: Array.from({ length: Math.max(1, Math.min(15, +r.days || 1)) }, () => ({ title: "", items: [] })), comments: [], createdAt: nowIso(), updatedAt: nowIso() });
        renderAll(); push("plan", { id: pl.id, edit: true }); return;
      }
      case "plan-ask": {
        if (!S.chars.length) { toast("还没有角色"); return; }
        const r = await form("让TA写一份攻略", [{ k: "who", label: "让谁写", type: "choice", options: charOptions(), value: S.chars[0].id }, { k: "city", label: "去哪", ph: "大理" }, { k: "days", label: "几天", type: "number", value: 3 }, { k: "with", label: "同行的还有谁（选填）", type: "multi", options: charOptions(), value: [] }, { k: "ask", label: "要求（选填）", type: "textarea", ph: "别太累，想看日落" }], "让TA写");
        if (!r || !r.city.trim() || !r.who) return;
        await askPlan(r.who, { city: r.city.trim(), days: Math.max(1, Math.min(15, +r.days || 3)), with: [r.who, ...r.with.filter(x => x !== r.who)], ask: r.ask.trim() }); return;
      }
      case "plan-edit": top.data.edit = !top.data.edit; renderPage(top); return;
      case "plan-more": {
        const pl = S.plans.find(x => x.id === top.data.id);
        const v = await sheet(pl.title, [{ label: "发到聊天", value: "share", icon: "doc" }, { label: "改标题", value: "title", icon: "pen" }, { label: "放到旅行里", value: "link", icon: "map" }, { label: "删除这份攻略", value: "del", icon: "trash", red: true }]);
        if (v === "share") shareTo("plan", pl);
        else if (v === "title") { const r = await form("改标题", [{ k: "t", label: "", value: pl.title }]); if (r && r.t.trim()) { pl.title = r.t.trim(); save(COL.plans, pl); renderAll(); } }
        else if (v === "link") linkPlan(pl);
        else if (v === "del") { const ok = await sheet("删除这份攻略？", [{ label: "删除", value: "y", red: true, icon: "trash" }]); if (ok) { delRow(COL.plans, "plans", pl); pop(); renderAll(); } }
        return;
      }
      case "plan-link": linkPlan(S.plans.find(x => x.id === id)); return;
      case "plan-show": {
        const pl = S.plans.find(x => x.id === top.data.id); const tr = S.trips.find(x => x.id === pl.tripId);
        const people = (tr && tr.companions.length ? tr.companions : S.chars.map(c => c.id)).filter(x => x !== pl.author && charById(x));
        if (!people.length) { toast("没有可以给看的人"); return; }
        const who = people.length === 1 ? people[0] : await sheet("给谁看？", people.map(c => ({ label: nameOf(c), value: c, icon: "eye" }))); if (!who) return;
        toast(`${nameOf(who)}在看了……`); if (await charReview(who, pl)) { toast(`${nameOf(who)}看完了`); renderAll(); } return;
      }
      case "item-edit": case "item-add": {
        const pl = S.plans.find(x => x.id === top.data.id); const d = pl.days[+t.dataset.d]; const it = act === "item-edit" ? d.items[+t.dataset.i] : null;
        const r = await form(it ? "改这个地点" : "加一个地点", [{ k: "time", label: "时间（选填）", value: it ? it.time : "", ph: "09:00" }, { k: "name", label: "地点", value: it ? it.name : "" }, { k: "desc", label: "说明（选填）", type: "textarea", value: it ? it.desc : "" }, { k: "pos", label: "地图上的位置", type: "choice", options: [{ v: "keep", n: it && it.lat != null ? "不变" : "先不放" }, { v: "map", n: "在地图上选" }], value: "keep" }], it ? "改好了" : "加上");
        if (!r || !r.name.trim()) { if (r && it) { const ok = await sheet(`删除「${it.name}」？`, [{ label: "删除", value: "y", red: true, icon: "trash" }]); if (ok) { d.items.splice(+t.dataset.i, 1); save(COL.plans, pl); renderPage(top); } } return; }
        const x = it || { id: uid("i"), note: "" }; Object.assign(x, { time: r.time.trim(), name: r.name.trim(), desc: r.desc.trim() });
        if (r.pos === "map") { const center = await geocode(pl.city); const pos = await pickPosition(x.lat != null ? [x.lat, x.lng] : center ? [center.lat, center.lng] : null); if (pos) { x.lat = pos[0]; x.lng = pos[1]; } }
        if (!it) d.items.push(x); pl.updatedAt = nowIso(); save(COL.plans, pl); renderAll(); return;
      }
      case "item-undo": { const pl = S.plans.find(x => x.id === top.data.id); const it = pl.days[+t.dataset.d].items[+t.dataset.i]; Object.assign(it, it.edit.old); delete it.edit; save(COL.plans, pl); renderPage(top); return; }
      case "day-add": { const pl = S.plans.find(x => x.id === top.data.id); pl.days.push({ title: "", items: [] }); save(COL.plans, pl); renderPage(top); return; }
      case "day-del": { const pl = S.plans.find(x => x.id === top.data.id); if (pl.days.length < 2) { toast("至少留一天"); return; } pl.days.splice(+t.dataset.d, 1); save(COL.plans, pl); renderPage(top); return; }
      case "day-title": { const pl = S.plans.find(x => x.id === top.data.id); const d = pl.days[+t.dataset.d]; const r = await form("这一天的标题", [{ k: "t", label: "", value: d.title, ph: "古城 · 洱海" }]); if (r) { d.title = r.t.trim(); save(COL.plans, pl); renderPage(top); } return; }
      // 订票
      case "bk-kind": S.book.kind = t.dataset.k; renderBase(); return;
      case "bk-swap": { const b = S.book; [b.from, b.to] = [b.to, b.from]; renderBase(); return; }
      case "bk-with": { const b = S.book; b.with = b.with.includes(id) ? b.with.filter(x => x !== id) : [...b.with, id]; renderBase(); return; }
      case "book-trip": { const tr = S.trips.find(x => x.id === id); S.book = { kind: "flight", from: S.meta.home || "", to: tr.city, date: tr.start, nights: Math.max(1, (tr.days || 2) - 1), with: [...tr.companions] }; S.tab = "book"; while (S.stack.length) pop(); renderBase(); return; }
      case "bk-search": {
        const b = S.book; if (!b.to.trim() || (b.kind !== "hotel" && !b.from.trim())) { toast("出发地和目的地都要填"); return; }
        if (b.kind !== "hotel" && b.from.trim()) { S.meta.home = S.meta.home || b.from.trim(); saveMeta(); }
        if (dayDiff(new Date(), b.date) < 0) { toast("日期要选今天以后"); return; }
        const d = { kind: b.kind, from: b.from.trim(), to: b.to.trim(), date: b.date, nights: b.nights, with: [...b.with], loading: true }; push("results", d);
        if (b.kind !== "hotel") { const ri = await routeInfo(d.from, d.to); if (!ri) d.err = "没找到这两个地方，换个写法试试（比如写城市名）"; else d.ri = ri; }
        d.loading = false; renderPage(S.stack[S.stack.length - 1]); return;
      }
      case "res-date": top.data.date = t.dataset.d; renderPage(top); return;
      case "res-pick": { const d = top.data; const list = d.kind === "flight" ? genFlights(d.from, d.to, d.date, d.ri) : genTrains(d.from, d.to, d.date, d.ri); const f = list.find(x => x.id === id); push("seat", { ...d, f, next: "me", seats: {} }); return; }
      case "seat-who": top.data.next = t.dataset.w; renderPage(top); return;
      case "seat": {
        const d = top.data; const s = t.dataset.s; const people = ["me", ...d.with];
        const holder = Object.keys(d.seats).find(w => d.seats[w] === s);
        if (holder) { delete d.seats[holder]; d.next = holder; renderPage(top); return; }
        if (d.taken.has(s)) { toast("这个座位有人了"); return; }
        d.seats[d.next] = s; d.next = people.find(w => !d.seats[w]) || d.next; renderPage(top); return;
      }
      case "seat-pay": {
        const d = top.data; const people = ["me", ...d.with]; if (people.some(w => !d.seats[w])) { toast("每个人都要选座位"); return; }
        const f = d.f; const total = f.price * people.length;
        if (!await payWallet(total, `${d.kind === "flight" ? "机票" : "火车票"} ${d.from}-${d.to}`, `${f.no} ${md(f.dep)} ${people.length}人`)) return;
        const trip = await tripFor(d.to, f.dep, people);
        const tk = addRow(COL.tickets, "tickets", { id: uid("tk"), kind: d.kind, tripId: trip.id, from: d.from, to: d.to, date: ymd(f.dep), dep: f.dep, arr: f.arr, mins: f.mins, no: f.no, carrier: f.carrier || "", fromAp: f.fromAp || "", toAp: f.toAp || "", fromSt: f.fromSt || "", toSt: f.toSt || "", price: f.price, total, people, seats: { ...d.seats }, gate: `${pick(["A", "B", "C", "D", "E"])}${rand(1, 32)}`, car: pad(rand(1, 16)), serial: `${pick(["E", "F", "G", "H"])}0${rand(10000, 99999)}`, km: d.ri ? Math.round(d.ri.km) : 0, createdAt: nowIso() });
        const comp = people.filter(x => x !== "me");
        if (comp.length) remember(comp, `${herName()}订了我们一起的${d.kind === "flight" ? "机票" : "火车票"}：${d.from} → ${d.to}，${mdw(f.dep)} ${hm(f.dep)} ${f.no}，座位 ${people.map(w => `${realName(w)} ${d.seats[w]}`).join("、")}。`, `tk_${tk.id}`);
        toast("订好了！票在票根夹里"); while (S.stack.length) pop(); S.tab = "tickets"; renderBase(); push("ticket", { id: tk.id }); seatRemark(tk); return;
      }
      case "hotel-pick": {
        const d = top.data; const h = genHotels(d.to).find(x => x.id === id); const people = ["me", ...d.with]; const rooms = Math.ceil(people.length / 2); const total = h.price * d.nights * rooms;
        const ok = await sheet(`${h.name} · ${d.nights} 晚 · ${rooms} 间`, [{ label: `付款 ${yuan(total)}`, value: "y", icon: "bed" }]); if (!ok) return;
        if (!await payWallet(total, `酒店 ${h.name}`, `${md(d.date)} 入住 ${d.nights} 晚 ${rooms} 间`)) return;
        const trip = await tripFor(d.to, d.date, people);
        const tk = addRow(COL.tickets, "tickets", { id: uid("tk"), kind: "hotel", tripId: trip.id, hotel: h.name, to: d.to, date: ymd(d.date), nights: d.nights, rooms, people, total, createdAt: nowIso() });
        const comp = people.filter(x => x !== "me"); if (comp.length) remember(comp, `${herName()}订了我们在${d.to}住的酒店「${h.name}」，${md(d.date)}入住，住${d.nights}晚。`, `tk_${tk.id}`);
        toast("订好了！"); while (S.stack.length) pop(); S.tab = "tickets"; renderBase(); push("ticket", { id: tk.id }); return;
      }
      case "ticket": push("ticket", { id }); return;
      case "flight": push("flight", { id }); return;
      case "come": charComes(); return;
      case "go": goToHim(); return;
      case "gift-ask": {
        if (!S.chars.length) { toast("还没有角色"); return; } const home = await needHome(); if (!home) return;
        const r = await form("让TA给我订", [{ k: "who", label: "让谁订", type: "choice", options: charOptions(), value: S.chars[0].id }, { k: "hint", label: "想说点什么（选填）", type: "textarea", ph: "想去海边 / 想出去玩两天 / 你定" }], "让他订");
        if (!r || !r.who) return;
        toast(`${nameOf(r.who)}在想去哪……`); const tk = await charBooksForMe(r.who, r.hint.trim(), false); if (tk) showGift(tk); return;
      }
      case "fl-msg": {
        const tk = S.tickets.find(x => x.id === id); const r = await form("给他留言", [{ k: "t", label: "", type: "textarea", ph: "落地了告诉我" }], "留言"); if (!r || !r.t.trim()) return;
        tk.msgs = tk.msgs || []; const st = flightState(tk); tk.msgs.push({ who: "me", text: r.t.trim(), at: nowIso(), pending: true }); save(COL.tickets, tk); renderPage(top);
        if (st.k === "fly") toast("他在飞机上，落地以后会看到"); else if (st.k !== "land") flightReply(tk); /* 已落地的由航班页自己回 */
        return;
      }
      case "fl-pick": {
        const tk = S.tickets.find(x => x.id === id); const st = flightState(tk); const w = tk.people[0];
        if (tk.met) return;
        if (st.k === "land" && tk.pickup) { tk.met = true; save(COL.tickets, tk); remember([w], `${herName()}来${tk.kind === "flight" ? "机场" : "车站"}接到我了（${tk.to}，${mdw(tk.arr)}）。`, `met_${tk.id}`); toast(`接到${nameOf(w)}了！`); renderPage(top); return; }
        tk.pickup = !tk.pickup; save(COL.tickets, tk);
        if (tk.pickup) remember([w], `${herName()}说${md(tk.arr)}会来${tk.kind === "flight" ? "机场" : "车站"}接我（${tk.no}）。`, `pick_${tk.id}`);
        renderPage(top); return;
      }
      case "share-ticket": shareTo("ticket", S.tickets.find(x => x.id === id)); return;
      case "share-spot": shareTo("spot", S.spots.find(x => x.id === id)); return;
      case "set-home": { const r = await form("你在哪个城市？", [{ k: "c", label: "", value: S.meta.home || "", ph: "北京" }]); if (r) { S.meta.home = r.c.trim(); saveMeta(); renderBase(); } return; }
      case "set-surprise": S.meta.surprise = S.meta.surprise === false; saveMeta(); renderBase(); return;
      case "tk-more": {
        const tk = S.tickets.find(x => x.id === top.data.id);
        const v = await sheet("", [{ label: "删除这张票", sub: "不会退款", value: "del", icon: "trash", red: true }]);
        if (v === "del") { delRow(COL.tickets, "tickets", tk); pop(); renderAll(); }
        return;
      }
    }
  });
  async function askPlan(charId, opt) {
    toast(`${nameOf(charId)}在排了，写好会出现在攻略里`);
    const r = await charWritePlan(charId, opt); if (!r) return;
    const pl = addRow(COL.plans, "plans", { id: uid("plan"), tripId: opt.tripId || null, title: r.title, city: opt.city, start: opt.start || null, author: charId, days: r.days, comments: r.comments, createdAt: nowIso(), updatedAt: nowIso() });
    remember([charId], `我给${herName()}排了一份去${opt.city}的旅行攻略「${r.title}」，${opt.days}天。${r.comments[0] ? `我对她说：${r.comments[0].text}` : ""}`, `plan_${pl.id}`);
    toast(`${nameOf(charId)}写好了「${r.title}」`); S.tab = "plans"; while (S.stack.length) pop(); renderBase(); push("plan", { id: pl.id });
  }
  async function linkPlan(pl) {
    const trips = S.trips.filter(t => t.city === pl.city).concat(S.trips.filter(t => t.city !== pl.city));
    const v = await sheet("放到哪趟旅行里？", [...trips.slice(0, 8).map(t => ({ label: t.title, sub: withText(t.companions), value: t.id, icon: "map" })), { label: "新建一趟旅行", value: "_new", icon: "plus" }]); if (!v) return;
    let tr = v === "_new" ? await newTrip({ city: pl.city, days: pl.days.length, with: pl.author !== "me" ? [pl.author] : [] }) : S.trips.find(t => t.id === v); if (!tr) return;
    for (const x of S.plans.filter(x => x.tripId === tr.id && x !== pl)) { x.tripId = null; save(COL.plans, x); }
    pl.tripId = tr.id; pl.start = tr.start; save(COL.plans, pl); toast(`放进「${tr.title}」了，攻略里的点会出现在地图上`); renderAll();
  }
  window.addEventListener("popstate", () => { if (S.stack.length) pop(); });

  // ───────────────────────── 启动 ─────────────────────────
  async function boot() {
    root().innerHTML = `<div class="loading">打开旅行……</div>`;
    await loadAll(); root().innerHTML = "";
    renderBase();
    setInterval(() => { const t = S.stack[S.stack.length - 1]; if (t && t.kind === "flight") renderPage(t); }, 60e3);
    setTimeout(() => { maybeSurprise().catch(e => console.warn(e)); }, 2500);
  }
  boot().catch(e => { console.error(e); root().innerHTML = `<div class="loading">打开失败：${esc((e && e.message) || e)}</div>`; });
})();
