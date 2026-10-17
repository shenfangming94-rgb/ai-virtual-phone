/* 请回答2008 · 小手机自定义 APP：一部捡来的按键机，能收发 2008 年的短信（两边永远差 18 年，同月同日同一时刻） */
(function () {
  "use strict";
  const api = window.AiPhone || window.AiPhoneApp;
  const VERSION = "/*__VERSION__*/";
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const WEEK = "日一二三四五六";

  // ───────────────────────── 时间：那边 = 这边减 18 年 ─────────────────────────
  const GAP = 18;
  const thereDate = (d = new Date()) => { const t = new Date(d); t.setFullYear(t.getFullYear() - GAP); return t; };
  const ymd = d => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const week = d => `周${WEEK[d.getDay()]}`;

  // ───────────────────────── 年代规矩（每次回短信都带，她过目定稿 10-15） ─────────────────────────
  const thereText = d => { const t = thereDate(d || new Date()); return `${ymd(t)} ${week(t)} ${hm(t)}`; };
  const ERA_RULE = d => `【请回答2008】
- 你那边现在是 ${thereText(d)}。你的日子和用户同步往前走：用户过一天，你也过一天。
- 你只知道你那边今天以前发生的事。以后的事你一概不知道，不会说出来，也不会碰巧说中。
- 你身边的一切都属于你那边的年份：手机、上网方式、聊天软件、物价、流行的歌和剧、网络用语。那一年还没有的东西，你没见过也没听说过。
- 你用按键手机发短信：一条最多 70 个字，按条收费，话短、省着发。可以用那个年代手机上有的文字表情和符号，不用现在的 emoji。
- 如果用户提到自己来自 2026 年，按你的人设反应：可以不信、好奇、惊讶、怀疑、激动等等，依照人设决定。用户提到你没听过的东西也一样。
- 回短信像真人：一次一到三条，不写旁白、动作和心理描写。
- 事情多大情绪就多大，不放大、不戏剧化。禁止无缘无故贬低、嘲讽、阴阳、吐槽用户。`;

  // ───────────────────────── 屏幕上的小图标（像素风） ─────────────────────────
  const ICON = {
    signal: '<svg viewBox="0 0 44 22" fill="currentColor"><path d="M0 0h12v3H8v3H4V3H0zM4 6h4v16H4z"/><rect x="15" y="15" width="4" height="7"/><rect x="21" y="11" width="4" height="11"/><rect x="27" y="7" width="4" height="15"/><rect x="33" y="3" width="4" height="19"/></svg>',
    mail: '<svg viewBox="0 0 30 22" fill="none" stroke="currentColor" stroke-width="3"><rect x="2" y="2" width="26" height="18"/><path d="M2 2l13 10L28 2"/></svg>',
    bat: n => `<svg class="bat" viewBox="0 0 44 22" fill="currentColor"><rect x="4" y="1" width="39" height="20" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="0" y="7" width="4" height="8"/>${[0, 1, 2, 3].filter(i => i < n).map(i => `<rect x="${32 - i * 8}" y="5" width="6" height="12"/>`).join("")}</svg>`,
  };


  // ───────────────────────── 未来的东西：每个词标上出现的年月，他那边到了才算有 ─────────────────────────
  const FUTURE = [["微博", "2009-08"], ["饿了么", "2009-04"], ["B站", "2009-06"], ["哔哩哔哩", "2010-01"], ["英雄联盟", "2009-10"], ["美团", "2010-03"], ["小米手机", "2011-08"], ["iPad", "2010-04"],
    ["微信", "2011-01"], ["知乎", "2011-01"], ["朋友圈", "2012-04"], ["滴滴", "2012-09"], ["打车软件", "2012-06"], ["快手", "2012-11"], ["表情包", "2012-01"], ["小红书", "2013-06"], ["余额宝", "2013-06"],
    ["微信支付", "2013-08"], ["扫码", "2013-06"], ["二维码支付", "2014-01"], ["4G", "2013-12"], ["Apple Watch", "2014-09"], ["拼多多", "2015-09"], ["王者荣耀", "2015-11"], ["共享单车", "2016-01"], ["摩拜", "2016-04"],
    ["抖音", "2016-09"], ["直播带货", "2016-05"], ["短视频", "2013-09"], ["刷脸", "2017-09"], ["5G", "2019-06"], ["健康码", "2020-02"], ["新冠", "2020-01"], ["原神", "2020-09"], ["元宇宙", "2021-10"], ["ChatGPT", "2022-11"], ["AI 聊天", "2022-11"]];
  const futureIn = text => { const t = thereDate(); const now = `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; return FUTURE.filter(([w, at]) => at > now && String(text || "").toLowerCase().includes(w.toLowerCase())).map(x => x[0]); };

  // ───────────────────────── 状态和存档 ─────────────────────────
  // people：人物档案（她写的 2008 年的人）{ id, source: char|local, charId, name, age, city, persona, life, opening: wrong|owner|mine, number, met, label（存进电话本的名字）}
  // threads：每个人一条 { id: 人物 id, msgs: [{ id, dir: in|out, text, at, read, status: sent|failed }] }；草稿存在 meta.drafts
  // letters：信 { id, pid, dir: in|out, text, at, read }
  const S = { view: "boot", sel: 0, top: 0, battery: 4, people: [], threads: [], letters: [], chars: [], meta: { id: "meta", operator: true, drafts: [], queue: [], pendingIn: [], myNumber: "" }, stack: [] };
  const COL = { meta: "meta", people: "people", threads: "threads", letters: "letters" };
  const INBOX_MAX = 100; // 原来 30，她说没多久就满了
  const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  async function dbList(c) { try { return (await api.db.list(c, { limit: 500 })) || []; } catch (e) { console.warn(e); return []; } }
  async function dbPut(c, row) { try { const u = await api.db.update(c, row.id, row); if (u) return; } catch (e) { /* 没有就建 */ } try { await api.db.create(c, row); } catch (e) { console.warn(e); } }
  async function dbDel(c, id) { try { await api.db.delete(c, id); } catch (e) { console.warn(e); } }
  let metaT = null;
  function saveMeta() { clearTimeout(metaT); metaT = setTimeout(() => dbPut(COL.meta, S.meta), 200); }
  const savePerson = p => dbPut(COL.people, p);
  const saveThread = t => dbPut(COL.threads, t);
  const saveLetter = l => dbPut(COL.letters, l);
  async function loadAll() {
    const [metas, people, threads, letters] = await Promise.all([dbList(COL.meta), dbList(COL.people), dbList(COL.threads), dbList(COL.letters)]);
    S.letters = letters;
    const m = metas.find(r => r.id === "meta"); if (m) S.meta = { ...S.meta, ...m };
    for (const k of ["drafts", "queue", "pendingIn"]) if (!Array.isArray(S.meta[k])) S.meta[k] = [];
    if (!S.meta.myNumber) { S.meta.myNumber = phoneNo(); saveMeta(); }
    S.people = people; S.threads = threads.map(t => ({ ...t, msgs: t.msgs || [] }));
    S.chars = await api.characters.list().catch(() => []) || [];
    // 以前的版本 AI 连着失败三次就把回信从队列里删了：她寄出去的信还没回、也不在等，就补回去
    for (const p of S.people) {
      const ls = S.letters.filter(l => l.pid === p.id).sort((a, b) => a.at.localeCompare(b.at)); const last = ls[ls.length - 1];
      if (last && last.dir === "out" && !S.meta.queue.some(q => q.pid === p.id && (q.kind === "letterReply" || q.kind === "letter"))) { const now = new Date().toISOString(); S.meta.queue.push({ pid: p.id, kind: "letterReply", lid: last.id, at: now, due: now }); saveMeta(); }
    }
  }
  const phoneNo = () => `1${["34", "35", "36", "37", "38", "39", "50", "51", "52", "58", "59"][rand(0, 10)]}${String(rand(0, 99999999)).padStart(8, "0")}`;
  const personById = id => S.people.find(p => p.id === id);
  const threadOf = pid => { let t = S.threads.find(x => x.id === pid); if (!t) { t = { id: pid, msgs: [] }; S.threads.push(t); } return t; };
  const shown = p => (p.label ? p.label : p.number); // 存进电话本之前只显示号码
  // 收件箱不算收藏夹里的（收藏夹不占收件箱的位置）
  const allIn = () => S.threads.flatMap(t => t.msgs.filter(m => m.dir === "in" && !m.saved).map(m => ({ ...m, pid: t.id }))).sort((a, b) => new Date(b.at) - new Date(a.at));
  const allOut = () => S.threads.flatMap(t => t.msgs.filter(m => m.dir === "out").map(m => ({ ...m, pid: t.id }))).sort((a, b) => new Date(b.at) - new Date(a.at));
  const allSaved = () => S.threads.flatMap(t => t.msgs.filter(m => m.dir === "in" && m.saved).map(m => ({ ...m, pid: t.id }))).sort((a, b) => new Date(b.at) - new Date(a.at));
  const unread = () => allIn().filter(m => !m.read).length;
  const unreadLetters = () => S.letters.filter(l => l.dir === "in" && !l.read).length;
  const lettersOf = pid => S.letters.filter(l => l.pid === pid).sort((a, b) => a.at.localeCompare(b.at));
  const msgRef = x => { const th = threadOf(x.pid); return [th, th.msgs.find(m => m.id === x.id)]; };
  // 一条短信给 AI / 记忆看的文字：彩信写成 [彩信：画面] 再接配的话
  const textOf = m => `${m.mms ? (m.dir === "in" ? `[彩信：${m.mms.desc || "一张照片"}]` : `[彩信照片${m.mms.seen ? `：${m.mms.seen}` : ""}]`) : ""}${m.text || ""}`;
  const msgTime = iso => { const t = thereDate(new Date(iso)); return `${pad(t.getMonth() + 1)}/${pad(t.getDate())} ${hm(t)}`; };
  const LOOKS = () => [
    ["运营商", S.meta.operator !== false ? "开" : "关", () => { S.meta.operator = S.meta.operator === false; saveMeta(); }],
    ["触屏点选", S.meta.touch ? "开" : "关", () => { S.meta.touch = !S.meta.touch; saveMeta(); }],
    ["机身颜色", "银色", null], ["屏幕颜色", "绿屏", null], ["贴纸", "", null],
  ];

  // ───────────────────────── 外壳（只画一次） ─────────────────────────
  function shell() {
    document.body.innerHTML = `<div class="stage"><div class="phone">
      <div class="speaker"></div><div class="brand">TINY TYPE</div>
      <div class="screen off" id="lcd"></div>
      <div class="row1">
        <div class="side"><button data-k="softL"><i class="dash"></i></button><button data-k="call"><svg width="58" height="26" viewBox="0 0 40 18"><path d="M4 14c2-8 30-8 32 0l-6 1-1-4c-6-2-12-2-18 0l-1 4z" fill="#3c9a43"/></svg></button></div>
        <div class="dpad"><button class="ok" data-k="ok"></button><button class="arr up" data-k="up"></button><button class="arr down" data-k="down"></button><button class="arr left" data-k="left"></button><button class="arr right" data-k="right"></button></div>
        <div class="side"><button data-k="softR"><i class="dash"></i></button><button data-k="end"><svg width="58" height="26" viewBox="0 0 40 18"><path d="M4 8c2 8 30 8 32 0l-6-1-1 4c-6 2-12 2-18 0l-1-4z" fill="#e2453a"/></svg></button></div>
      </div>
      <div class="keys">${[["1", "oo"], ["2", "ABC"], ["DEF", "3"], ["4", "GHI"], ["5", "JKL"], ["MNO", "6"], ["7", "PQRS"], ["8", "TUV"], ["WXYZ", "9"], ["*", "+"], ["0", "␣"], ["⇧", "#"]]
        .map(([a, b], i) => { const k = "123456789*0#"[i]; return /\d|\*|#/.test(a) && a.length === 1 ? `<button data-k="${k}">${a} <small>${b}</small></button>` : `<button data-k="${k}"><small>${a}</small> ${b}</button>`; }).join("")}</div>
      <div class="foot">TAP TO TYPE</div>
      ${STICKERS}
      <textarea id="typer" maxlength="700" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
    </div></div><div id="sheet"></div>`;
    fit(); window.addEventListener("resize", fit);
  }
  function fit() {
    const ph = $(".phone"); if (!ph) return;
    const k = Math.min((innerWidth - 16) / 350, (innerHeight - 50) / 800, 1.4);
    ph.style.transform = `scale(${k})`;
  }
  const STICKERS = `
  <svg class="stk" style="right:6px;top:22px" width="74" height="74" viewBox="0 0 74 74"><circle cx="37" cy="37" r="34" fill="#f7e04a" stroke="#fff" stroke-width="4"/><ellipse cx="27" cy="29" rx="3.5" ry="6" fill="#222"/><ellipse cx="47" cy="29" rx="3.5" ry="6" fill="#222"/><path d="M19 42c6 13 30 13 36 0" fill="none" stroke="#222" stroke-width="3.5" stroke-linecap="round"/></svg>
  <svg class="stk" style="left:96px;top:468px" width="40" height="40" viewBox="0 0 36 36"><g transform="translate(18 18)" fill="#fff">${[0, 60, 120, 180, 240, 300].map(a => `<ellipse rx="5" ry="10" transform="rotate(${a}) translate(0 -9)"/>`).join("")}<circle r="5.5" fill="#f2c230"/></g></svg>
  <svg class="stk" style="left:62px;top:662px" width="44" height="48" viewBox="0 0 44 48"><path d="M22 10c12-4 20 6 18 18-2 12-10 18-18 18S6 40 4 28C2 16 10 6 22 10z" fill="#e8463e" stroke="#fff" stroke-width="2.5"/><g fill="#f5d35a"><circle cx="14" cy="22" r="1.6"/><circle cx="24" cy="20" r="1.6"/><circle cx="31" cy="27" r="1.6"/><circle cx="18" cy="31" r="1.6"/><circle cx="27" cy="36" r="1.6"/></g><path d="M12 10c4-6 8-6 10-2 2-4 7-4 10 2-6 2-14 2-20 0z" fill="#5aa84a"/></svg>
  <svg class="stk" style="left:102px;top:668px" width="30" height="30" viewBox="0 0 30 30"><g transform="translate(15 15)" fill="#d86ad8" stroke="#fff" stroke-width="1.5"><circle cy="-7" r="6"/><circle cx="6.7" cy="-2.2" r="6"/><circle cx="4.1" cy="5.7" r="6"/><circle cx="-4.1" cy="5.7" r="6"/><circle cx="-6.7" cy="-2.2" r="6"/></g><circle cx="15" cy="15" r="3.5" fill="#f5d35a"/></svg>
  <svg class="stk" style="left:206px;top:586px" width="50" height="46" viewBox="0 0 50 46"><defs><radialGradient id="rb" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="#ffd1e8"/><stop offset=".3" stop-color="#ffe066"/><stop offset=".55" stop-color="#7fd6a0"/><stop offset=".75" stop-color="#7cb7f0"/><stop offset="1" stop-color="#c38df0"/></radialGradient></defs><path d="M25 43C8 31 2 22 4 13 6 5 16 2 25 11 34 2 44 5 46 13c2 9-4 18-21 30z" fill="url(#rb)" stroke="#fff" stroke-width="4"/></svg>
  <svg class="stk" style="left:236px;top:712px" width="42" height="46" viewBox="0 0 42 46"><path d="M3 22C3 10 12 3 21 3s18 7 18 19z" fill="#d7372f" stroke="#fff" stroke-width="2.5"/><g fill="#fff"><circle cx="13" cy="13" r="3.5"/><circle cx="25" cy="10" r="3"/><circle cx="31" cy="18" r="2.5"/></g><path d="M15 22h12l-2 20h-8z" fill="#f4eee2" stroke="#fff" stroke-width="1"/></svg>`;

  // ───────────────────────── 屏幕 ─────────────────────────
  const bar = () => `<div class="bar">${ICON.signal}${unread() || S.meta.pendingIn.length ? `<span class="blink" style="display:flex">${ICON.mail}</span>` : ""}${ICON.bat(S.battery)}</div>`;
  const soft = (l, r) => `<div class="soft"><span data-k="softL">${esc(l || "")}</span><span data-k="softR">${esc(r || "")}</span></div>`;
  /** 列表：一屏最多 6 行，选中的那行跟着滚 */
  function list(items, sel) {
    const N = 6; if (sel < S.top) S.top = sel; if (sel >= S.top + N) S.top = sel - N + 1;
    return `<div class="list">${items.slice(S.top, S.top + N).map((it, i) => `<div class="${i + S.top === sel ? "on" : ""}" data-row="${i + S.top}">${it}</div>`).join("") || `<div>（空）</div>`}</div>`;
  }
  const row = (a, b) => `<span class="cut">${esc(a)}</span>${b != null ? `<span class="r">${esc(b)}</span>` : ""}`;

  // 每个界面：draw 画屏幕，key 处理按键，items 是可选的列表（上下键自动处理）
  const V = {};
  V.boot = { draw: () => `<div class="center">${S.bootStep === 0 ? `<div class="s36 bold">TINY<br>TYPE</div>` : S.bootStep === 1 ? `<div class="s18 bold">正在搜索网络…</div>` : `<div class="s18 bold">已连接</div><div class="s36 bold">2008</div>`}</div>`, key: () => {} };
  V.standby = {
    draw: () => { const th = thereDate();
      return `${bar()}${S.meta.operator !== false ? `<div class="op s18">中国移动</div>` : ""}<div class="center"><div class="s48 bold">${hm(th)}</div><div class="s18">${ymd(th)} ${week(th)}</div>${S.meta.pendingIn.length ? `<div class="s18" style="margin-top:8px">收件箱已满</div>` : unread() ? `<div class="s18" style="margin-top:8px">${unread()} 条新信息</div>` : ""}${unreadLetters() ? `<div class="s18">${unreadLetters()} 封新来信</div>` : ""}</div>${soft(unread() || unreadLetters() ? "阅读" : "菜单", "电话本")}`; },
    key: k => { if (k === "softL" || k === "ok") return unread() ? open("inbox") : unreadLetters() ? open("letters") : open("menu"); if (k === "softR") return open("book"); if (/^[0-9*#]$/.test(k)) { S.dial = k; return open("dial"); } },
  };
  V.menu = {
    items: () => [["✉", "信息", "sms"], ["◇", "信箱", "letters"], ["☎", "电话本", "book"], ["✎", "人物档案", "cast"], ["✿", "外观", "looks"], ["?", "关于这部手机", "about"]],
    draw: () => `${bar()}<div class="title">菜单</div>${list(V.menu.items().map(([i, t]) => `<i>${i}</i>${t}`), S.sel)}${soft("选择", "返回")}`,
    key: k => { const it = V.menu.items(); if (/^[1-9]$/.test(k) && +k <= it.length) { S.sel = +k - 1; k = "ok"; } if (k === "ok" || k === "softL") return open(it[S.sel][2]); if (k === "softR") return back(); },
  };
  V.sms = {
    items: () => [["写信息", "compose"], [`收件箱`, "inbox", `${allIn().length}/${INBOX_MAX}`], ["发件箱", "outbox", allOut().length], ["草稿箱", "drafts", S.meta.drafts.length], ["收藏夹", "saved", allSaved().length]],
    draw: () => `${bar()}<div class="title">信息</div>${list(V.sms.items().map(([t, , n]) => row(t, n)), S.sel)}${soft("选择", "返回")}`,
    key: k => { const it = V.sms.items(); if (/^[1-5]$/.test(k)) { S.sel = +k - 1; k = "ok"; } if (k === "ok" || k === "softL") { if (it[S.sel][1] === "compose") { S.compose = { to: null, text: "" }; } return open(it[S.sel][1]); } if (k === "softR") return back(); },
  };
  V.inbox = {
    items: () => allIn(),
    draw: () => `${bar()}<div class="title">收件箱 ${allIn().length}/${INBOX_MAX}</div>${list(allIn().map(m => row(`${m.read ? "　" : "✉"}${shown(personById(m.pid) || { number: "未知号码" })}`, msgTime(m.at).slice(6))), S.sel)}${soft(allIn().length ? "选项" : "", "返回")}`,
    key: async k => { const m = allIn()[S.sel]; if (k === "softR") return back(); if (!m) return;
      if (k === "ok") { S.reading = { pid: m.pid, id: m.id }; return open("read"); }
      if (k === "softL") { const v = await choose("选项", [["阅读", "read"], ["存进收藏夹", "save"], ["全部存进收藏夹", "all"], ["删除", "del"]]);
        if (v === "read") { S.reading = { pid: m.pid, id: m.id }; return open("read"); }
        if (v === "save" || v === "all") { for (const x of v === "all" ? allIn() : [m]) { const [th, mm] = msgRef(x); if (mm) { mm.saved = true; mm.read = true; saveThread(th); } } flushPending(); S.sel = 0; S.top = 0; return toastLcd(v === "all" ? "已全部存进收藏夹" : "已存进收藏夹"); }
        if (v === "del") { const [th, mm] = msgRef(m); th.msgs = th.msgs.filter(x => x !== mm); saveThread(th); flushPending(); S.sel = Math.max(0, S.sel - 1); return toastLcd("已删除"); } } },
  };
  // 收藏夹：舍不得删的短信放这里，不占收件箱
  V.saved = {
    items: () => allSaved(),
    draw: () => `${bar()}<div class="title">收藏夹 ${allSaved().length}</div>${list(allSaved().map(m => row(shown(personById(m.pid) || { number: "未知号码" }), msgTime(m.at).slice(0, 5))), S.sel)}${soft(allSaved().length ? "阅读" : "", "返回")}`,
    key: k => { const m = allSaved()[S.sel]; if ((k === "ok" || k === "softL") && m) { S.reading = { pid: m.pid, id: m.id }; return open("read"); } if (k === "softR") return back(); },
  };
  // 信箱：他寄来的信、她寄出去的信；信纸在屏幕外面单独展开
  V.letters = {
    items: () => [{ write: true }, ...[...S.letters].sort((a, b) => b.at.localeCompare(a.at))],
    draw: () => `${bar()}<div class="title">信箱</div>${list(V.letters.items().map(l => l.write ? "＋写信" : row(`${l.dir === "in" ? (l.read ? "　" : "✉") : "→"}${shown(personById(l.pid) || { number: "未知" })}`, msgTime(l.at).slice(0, 5))), S.sel)}${soft("确定", "返回")}`,
    key: async k => { if (k === "softR") return back(); if (k !== "ok" && k !== "softL") return; const l = V.letters.items()[S.sel];
      if (!l.write) return openLetter(l);
      const ps = S.people.filter(p => p.met && !p.ghost); if (!ps.length) return toastLcd("还没有能写信的人");
      const pid = ps.length === 1 ? ps[0].id : await choose("写给谁", ps.map(p => [shown(p), p.id])); if (pid) writeLetter(personById(pid)); },
  };
  V.outbox = {
    items: () => allOut(),
    draw: () => `${bar()}<div class="title">发件箱</div>${list(allOut().map(m => row(`${m.status === "failed" ? "!" : "　"}${shown(personById(m.pid) || { number: "未知号码" })}`, msgTime(m.at).slice(6))), S.sel)}${soft(allOut().length ? "查看" : "", "返回")}`,
    key: k => { const m = allOut()[S.sel]; if ((k === "ok" || k === "softL") && m) { S.reading = { pid: m.pid, id: m.id }; return open("read"); } if (k === "softR") return back(); },
  };
  V.drafts = {
    items: () => S.meta.drafts,
    draw: () => `${bar()}<div class="title">草稿箱</div>${list(S.meta.drafts.map(d => row(d.text || "（空）")), S.sel)}${soft(S.meta.drafts.length ? "编辑" : "", "返回")}`,
    key: k => { const d = S.meta.drafts[S.sel]; if ((k === "ok" || k === "softL") && d) { S.compose = { to: d.to, number: d.number, text: d.text, mms: d.mms, draftId: d.id }; return open("compose"); } if (k === "softR") return back(); },
  };
  // 读一条：上下键滚动；选项：回复 / 查看对话 / 存入电话本 / 删除（发件箱的失败短信可以重发）
  V.read = {
    draw: () => { const r = S.reading; const p = personById(r.pid); const m = (threadOf(r.pid).msgs.find(x => x.id === r.id)) || {};
      if (m.dir === "in" && !m.read) { m.read = true; saveThread(threadOf(r.pid)); }
      return `${bar()}<div class="title">${m.dir === "out" ? "发给 " : ""}${esc(p ? shown(p) : "未知号码")}</div><div class="scroll s18" id="readbox">${mmsLcd(m)}<div>${esc(m.text || "")}</div><div class="s12" style="margin-top:6px">${m.status === "failed" ? "发送失败 · " : ""}${esc(m.at ? `${ymd(thereDate(new Date(m.at)))} ${hm(thereDate(new Date(m.at)))}` : "")}</div></div>${soft("选项", "返回")}`; },
    after: () => { const b = $("#readbox"); if (b) { S.scroll = Math.max(0, Math.min(S.scroll || 0, b.scrollHeight - b.clientHeight)); b.scrollTop = S.scroll; } },
    key: k => { if (k === "up") { S.scroll = (S.scroll || 0) - 26; return draw(); } if (k === "down") { S.scroll = (S.scroll || 0) + 26; return draw(); } if (k === "ok" || k === "softL") return open("readopt"); if (k === "softR") return back(); },
  };
  V.readopt = {
    items: () => { const r = S.reading; const p = personById(r.pid); const m = threadOf(r.pid).msgs.find(x => x.id === r.id) || {};
      return [...(m.mms && m.mms.ref ? [["查看照片", "view"]] : m.mms && m.dir === "in" ? [["生成照片", "gen"]] : []), ["回复", "reply"], ["查看对话", "conv"], ...(m.dir === "in" ? [[m.saved ? "移回收件箱" : "存进收藏夹", "fav"]] : []), ...(p && !p.label ? [["存入电话本", "save"]] : []), ...(m.status === "failed" ? [["重新发送", "resend"]] : []), ...(canReroll(r.pid, m) ? [["重新生成", "reroll"]] : []), ["删除", "del"]]; },
    draw: () => `${bar()}<div class="title">选项</div>${list(V.readopt.items().map(x => x[0]), S.sel)}${soft("确定", "返回")}`,
    key: async k => {
      if (k === "softR") return back(); if (k !== "ok" && k !== "softL") return;
      const r = S.reading; const p = personById(r.pid); const th = threadOf(r.pid); const m = th.msgs.find(x => x.id === r.id);
      const act = V.readopt.items()[S.sel][1];
      if (act === "view" && m) { back(); return viewPhoto(m); }
      if (act === "gen" && m) { back(); return genPhoto(p, th, m); }
      if (act === "reply") { S.compose = { to: r.pid, text: "" }; return open("compose", true); }
      if (act === "fav" && m) { if (!m.saved || allIn().length < INBOX_MAX) { m.saved = !m.saved; saveThread(th); flushPending(); return toastLcd(m.saved ? "已存进收藏夹" : "已移回收件箱"); } return toastLcd("收件箱满了"); }
      if (act === "conv") { S.conv = r.pid; S.scroll = 9999; return open("conv", true); }
      if (act === "save") { const name = await ask("存入电话本", "名字", ""); if (name) { p.label = name.slice(0, 12); savePerson(p); toastLcd("已保存"); } return; }
      if (act === "resend" && m) { th.msgs = th.msgs.filter(x => x !== m); saveThread(th); S.compose = { to: r.pid, text: m.text, mms: m.mms }; return sendNow(); }
      if (act === "reroll" && m) { const v = await choose("让他重新回？", [["重新回一次", "y"], ["算了", "n"]]); if (v !== "y") return; rerollSms(p, th); return toastLcd("他重新想想…", () => { S.stack.pop(); back(); }); }
      if (act === "del" && m) { th.msgs = th.msgs.filter(x => x !== m); saveThread(th); flushPending(); return toastLcd("已删除", () => { S.stack.pop(); back(); }); }
    },
  };
  /** 他最后连着回的那几条（前面得有她发的）才能重新生成；正在等回复时不行 */
  function canReroll(pid, m) {
    if (!m || m.dir !== "in") return false; const msgs = threadOf(pid).msgs; let i = msgs.length; while (i > 0 && msgs[i - 1].dir === "in") i--;
    return i > 0 && msgs.slice(i).includes(m) && !S.meta.queue.some(q => q.pid === pid && q.kind === "reply");
  }
  /** 删掉他最后连着回的几条（连同他记忆里那条），马上重新回 */
  function rerollSms(p, th) {
    let i = th.msgs.length; while (i > 0 && th.msgs[i - 1].dir === "in") i--;
    const gone = th.msgs.slice(i); th.msgs = th.msgs.slice(0, i); saveThread(th);
    for (const id of new Set(gone.map(m => m.mem).filter(Boolean))) forget(p, id);
    S.meta.queue.push({ pid: p.id, kind: "reply", due: new Date(Date.now() + 3000).toISOString() }); saveMeta();
  }
  // 对话：像截图那样一行一行（名字：内容），上下键滚
  V.conv = {
    draw: () => { const p = personById(S.conv); const who = p ? (p.label || "对方").slice(0, 4) : "对方";
      const lines = threadOf(S.conv).msgs.map(m => `<p>${m.dir === "out" ? "我" : esc(who)}：${m.mms ? "[彩信]" : ""}${esc(m.text)}</p>`).join("");
      return `${bar()}<div class="title">${esc(p ? shown(p) : "")}</div><div class="scroll conv s18" id="convbox">${lines || "<p>（还没有短信）</p>"}</div>${soft("选项", "返回")}`; },
    after: () => { const b = $("#convbox"); if (!b) return; const max = b.scrollHeight - b.clientHeight; S.scroll = Math.max(0, Math.min(S.scroll, max)); b.scrollTop = S.scroll; },
    key: async k => { const step = 26; if (k === "up") { S.scroll -= step; return draw(); } if (k === "down") { S.scroll += step; return draw(); }
      if (k === "ok") { S.compose = { to: S.conv, text: "" }; return open("compose"); } // 中间键：直接回复（连发几条更快）
      if (k === "softL") { const v = await choose("选项", [["回复", "reply"], ["整段保存", "export"]]);
        if (v === "reply") { S.compose = { to: S.conv, text: "" }; return open("compose"); }
        if (v === "export") return exportConv(S.conv); }
      if (k === "softR") return back(); },
  };
  // 写信息：点屏幕弹出键盘；右上角字数（超过 70 字按条数算）
  V.compose = {
    draw: () => { const c = S.compose; const n = [...c.text].length; const parts = Math.max(1, Math.ceil(n / 70));
      const to = c.to ? shown(personById(c.to) || {}) : c.number || "";
      const has = n || c.mms;
      return `${bar()}<div class="title"><span class="cut">${c.next ? "下一条" : to ? `给 ${esc(to)}` : "写信息"}</span><span class="r">${c.mms ? "彩信" : `${n % 70 || (n ? 70 : 0)}/${parts}`}</span></div><div class="scroll s18 typing">${c.mms ? `${mmsLcd({ dir: "out", mms: c.mms })}` : ""}${esc(c.text)}<i class="caret"></i>${n ? "" : `<span class="hint">${c.mms ? "配一句话，或者直接发送" : "点这里打字"}</span>`}</div>${soft(has ? "发送" : "照片", n ? "存草稿" : c.mms ? "去掉照片" : c.next ? "完成" : "返回")}`; },
    key: async k => {
      const c = S.compose;
      if (k === "softL" && ![...c.text].length && !c.mms) { $("#typer").blur(); const mm = await pickPhoto(); if (mm && S.compose === c) { c.mms = mm; draw(); } return; }
      if (k === "softL" || k === "ok" || k === "call") { if (![...c.text].length && !c.mms) return; if (!c.to && !c.number) return open("pickto"); return sendNow(); }
      if (k === "softR" && !c.text.trim() && c.mms) { c.mms = null; return draw(); }
      if (k === "softR" || k === "end") { const leave = () => (k === "end" ? home() : back()); if (c.text.trim()) { saveDraft(); return toastLcd("已存入草稿箱", leave); } return leave(); }
      if (/^[0-9*#]$/.test(k)) { c.text += k; syncTyper(); return draw(); }
    },
  };
  V.pickto = {
    items: () => [["输入号码", "num"], ...S.people.filter(p => p.label).map(p => [p.label, p.id])],
    draw: () => `${bar()}<div class="title">发给谁</div>${list(V.pickto.items().map(x => x[0]), S.sel)}${soft("确定", "返回")}`,
    key: k => { if (k === "softR") return back(); if (k !== "ok" && k !== "softL") return; const [, v] = V.pickto.items()[S.sel]; if (v === "num") { S.dial = ""; S.dialFor = "compose"; return open("dial", true); } S.compose.to = v; S.stack.pop(); return sendNow(); },
  };
  // 拨号盘：待机按数字进来；左软键发信息（给这个号码写短信）
  V.dial = {
    draw: () => `${bar()}<div class="center"><div class="s36 bold dialno">${esc(S.dial || "")}<i class="caret"></i></div></div>${soft(S.dial ? (S.dialFor === "compose" ? "确定" : "发信息") : "", S.dial ? "清除" : "返回")}`,
    key: k => {
      if (/^[0-9*#]$/.test(k)) { if ((S.dial || "").length < 13) S.dial = (S.dial || "") + k; return draw(); }
      if (k === "softR") { if (S.dial) { S.dial = S.dial.slice(0, -1); return draw(); } S.dialFor = null; return back(); }
      if ((k === "softL" || k === "ok") && S.dial) { const num = S.dial; const p = S.people.find(x => x.number === num);
        if (S.dialFor === "compose") { S.dialFor = null; if (p) S.compose.to = p.id; else S.compose.number = num; S.stack.splice(-2); return sendNow(); }
        S.compose = { to: p ? p.id : null, number: p ? "" : num, text: "" }; return open("compose", true); }
      if (k === "call") return toastLcd("这部手机好像打不出电话");
    },
  };
  V.book = {
    items: () => S.people.filter(p => p.label),
    draw: () => `${bar()}<div class="title">电话本</div>${list(V.book.items().map(p => row(p.label)), S.sel)}${soft(V.book.items().length ? "选项" : "", "返回")}`,
    key: async k => { if (k === "softR") return back(); const p = V.book.items()[S.sel]; if (!p) return;
      if (k === "ok" || k === "softL") { const v = await choose(p.label, [["发信息", "sms"], ["查看对话", "conv"], ["改名字", "rename"], ["删除联系人", "del"]]);
        if (v === "sms") { S.compose = { to: p.id, text: "" }; return open("compose"); }
        if (v === "conv") { S.conv = p.id; S.scroll = 9999; return open("conv"); }
        if (v === "rename") { const n = await ask("改名字", "名字", p.label); if (n) { p.label = n.slice(0, 12); savePerson(p); draw(); } }
        if (v === "del") { p.label = ""; savePerson(p); S.sel = 0; draw(); } } },
  };
  V.cast = {
    items: () => [{ add: true }, ...S.people],
    draw: () => `${bar()}<div class="title">人物档案</div>${list(V.cast.items().map(p => p.add ? "＋新建人物" : row(personName(p), p.met ? "已联系" : OPEN_NAME[p.opening])), S.sel)}${soft("确定", "返回")}`,
    key: k => { if (k === "softR") return back(); if (k !== "ok" && k !== "softL") return; const p = V.cast.items()[S.sel]; editPerson(p.add ? null : p); },
  };
  V.looks = {
    items: () => LOOKS(),
    draw: () => `${bar()}<div class="title">外观</div>${list(LOOKS().map(([t, v]) => row(t, v)), S.sel)}${soft(LOOKS()[S.sel] && LOOKS()[S.sel][2] ? "切换" : "", "返回")}`,
    key: k => { if (k === "softR") return back(); if (k === "ok" || k === "softL") { const f = LOOKS()[S.sel][2]; if (f) { f(); draw(); } else toastLcd("还在做"); } },
  };
  V.about = {
    draw: () => `${bar()}<div class="title">关于这部手机</div><div class="scroll s18"><p>本机号码</p><p>${esc(S.meta.myNumber)}</p><p class="s12" style="margin-top:8px">请回答2008 · ${esc(VERSION)}</p>${S.meta.queue.length ? `<p class="s12">等回复：${S.meta.queue.map(q => `${esc(personName(personById(q.pid) || {}))}${/letter/i.test(q.kind) ? "（信）" : ""} ${hm(new Date(q.due))}${q.tries ? ` 第${q.tries}次重试` : ""}`).join("；")}</p>` : ""}${(S.meta.errors || []).map(e => `<p class="s12">❗${esc(e)}</p>`).join("")}</div>${soft("选项", "返回")}`,
    after: () => { const b = $("#lcd .scroll"); if (b) b.scrollTop = S.scroll || 0; },
    key: async k => { if (k === "up") { S.scroll = Math.max(0, (S.scroll || 0) - 26); return draw(); } if (k === "down") { S.scroll = (S.scroll || 0) + 26; return draw(); } if (k === "softR" || k === "ok") return back();
      if (k === "softL") { const v = await choose("选项", [["导出数据", "export"], ["导入数据", "import"]]); if (v === "export") return exportData(); if (v === "import") return importData(); } },
  };
  // ───────────────────────── 导出 / 导入：整部手机的数据存成一个文件，换个 float 链接也能搬过去 ─────────────────────────
  const MEDIA_RE = /media-store:\/\/[^"\\\s]+/g;
  function downloadFile(name, text) {
    const u = URL.createObjectURL(new Blob([text], { type: "application/json" })); const a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 2000);
  }
  async function exportData() {
    S.lcdMsg = "正在打包…"; S.view = "msgline"; draw();
    const data = { meta: { ...S.meta, errors: [] }, people: S.people, threads: S.threads, letters: S.letters };
    const json = JSON.stringify(data); const media = {};
    for (const r of [...new Set(json.match(MEDIA_RE) || [])]) { const u = await mediaUrl(r); if (u) media[r] = u; }
    const names = Object.fromEntries(S.people.filter(p => p.charId).map(p => [p.charId, (S.chars.find(c => c.id === p.charId) || {}).name || p.name || ""]));
    const out = JSON.stringify({ app: "nox.reply2008", version: VERSION, exportedAt: new Date().toISOString(), names, data, media });
    const d = new Date(); downloadFile(`请回答2008-数据-${ymd(d)}-${pad(d.getHours())}${pad(d.getMinutes())}.json`, out);
    back(); toastLcd(`导出好了 ${(out.length / 1048576).toFixed(1)}MB`);
  }
  async function importData() {
    const ok = await choose("会换掉现在的全部数据", [["选文件导入", "y"], ["算了", "n"]]); if (ok !== "y") return;
    let pack;
    try {
      const r = await api.media.pick({ accept: ".json,application/json,text/plain" }); const f = r && (r.file || (r.files || [])[0]); if (!f || !f.dataUrl) return;
      const bytes = Uint8Array.from(atob(f.dataUrl.slice(f.dataUrl.indexOf(",") + 1)), ch => ch.charCodeAt(0)); pack = JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return toastLcd("这个文件读不了"); }
    if (!pack || pack.app !== "nox.reply2008" || !pack.data) return toastLcd("不是这部手机导出的");
    S.lcdMsg = "正在导入…"; S.view = "msgline"; draw();
    let json = JSON.stringify(pack.data);
    for (const [old, u] of Object.entries(pack.media || {})) { try { const st = await api.media.put({ dataUrl: u }); json = json.split(old).join(st.ref); } catch (e) { /* 这张图就算了 */ } }
    // 档案库角色换了链接 id 会变：按名字对上，对不上的让她选（选「写在这里」就不连档案库）
    for (const [old, name] of Object.entries(pack.names || {})) {
      if (S.chars.some(c => c.id === old)) continue;
      const same = S.chars.filter(c => c.name === name);
      const nu = same.length === 1 ? same[0].id : await choose(`「${name || "?"}」是谁`, [...S.chars.map(c => [c.name, c.id]), ["不连档案库", ""]]);
      json = json.split(`"${old}"`).join(nu ? `"${nu}"` : "null");
    }
    const data = JSON.parse(json);
    for (const p of data.people || []) if (p.source === "char" && !p.charId) p.source = "local";
    for (const [col, rows] of [[COL.people, S.people], [COL.threads, S.threads], [COL.letters, S.letters]]) for (const r of rows) await dbDel(col, r.id);
    for (const [col, rows] of [[COL.people, data.people], [COL.threads, data.threads], [COL.letters, data.letters]]) for (const r of rows || []) await dbPut(col, r);
    await dbPut(COL.meta, { ...data.meta, id: "meta" });
    S.lcdMsg = "导入好了"; draw(); setTimeout(() => location.reload(), 800);
  }
  // 发送中：进度条走完 → 已发送（偶尔信号不好，发送失败）
  V.sending = {
    draw: () => `${bar()}<div class="center"><div class="s18 bold">${S.sendState === "ok" ? "信息已发送" : S.sendState === "fail" ? "发送失败" : "发送中…"}</div>${S.sendState ? "" : `<div class="pbar"><i style="width:${S.sendPct || 0}%"></i></div>`}</div>${soft("", "")}`,
    key: () => {},
  };
  // 新信息提醒
  V.newmsg = {
    draw: () => `${bar()}<div class="center"><div class="blink" style="display:flex;justify-content:center;height:30px">${ICON.mail}</div><div class="s18 bold">${unread() ? `${unread()} 条新信息` : "收到一封信"}</div></div>${soft("阅读", "退出")}`,
    key: k => { if (k === "softL" || k === "ok") { S.stack = [{ view: "standby" }]; return open(unread() ? "inbox" : "letters", false, true); } if (k === "softR" || k === "end") return home(); },
  };
  V.msgline = { draw: () => `${bar()}<div class="center"><div class="s18 bold">${esc(S.lcdMsg || "")}</div></div>${soft("", "")}`, key: () => {} };

  function draw() {
    const v = V[S.view] || V.standby; $("#lcd").innerHTML = v.draw(); if (v.after) v.after();
    const typer = $("#typer"); typer.classList.toggle("on", S.view === "compose");
  }
  // 页面栈：open 进、back 回、home 回待机
  function open(view, replace, keepStack) {
    if (!keepStack) { if (replace) S.stack.pop(); S.stack.push({ view: S.view, sel: S.sel, top: S.top }); }
    S.view = view; S.sel = 0; S.top = 0; if (view !== "conv") S.scroll = 0; draw();
    if (view === "compose") syncTyper();
  }
  function back() { const prev = S.stack.pop(); if (!prev) return home(); S.view = prev.view; S.sel = Math.min(prev.sel, Math.max(0, ((V[prev.view].items && V[prev.view].items()) || []).length - 1)); S.top = prev.top; S.scroll = 0; draw(); }
  function home() { S.stack = []; S.view = "standby"; S.sel = 0; draw(); }
  let lcdT = null;
  /** 屏幕上闪一行字，0.9 秒后回原来的界面（给了 next 就改做 next） */
  function toastLcd(msg, next) { const was = { view: S.view, sel: S.sel, top: S.top }; S.lcdMsg = msg; S.view = "msgline"; draw(); clearTimeout(lcdT); lcdT = setTimeout(() => { if (next) { S.view = was.view; return next(); } S.view = was.view; S.sel = was.sel; S.top = was.top; draw(); }, 900); }
  /** 屏幕里弹一个小菜单，返回选中的值 */
  function choose(title, items) {
    return new Promise(res => { const was = { view: S.view, sel: S.sel, top: S.top };
      V._choose = { items: () => items, draw: () => `${bar()}<div class="title">${esc(title)}</div>${list(items.map(x => x[0]), S.sel)}${soft("确定", "返回")}`,
        key: k => { if (k === "softR" || k === "end") { Object.assign(S, was); draw(); return res(null); } if (k === "ok" || k === "softL") { const v = items[S.sel][1]; Object.assign(S, was); draw(); return res(v); } } };
      S.view = "_choose"; S.sel = 0; S.top = 0; draw(); });
  }

  // ───────────────────────── 打字：点屏幕弹出系统键盘，字显示在屏幕上 ─────────────────────────
  function syncTyper() { const t = $("#typer"); if (t && S.compose) t.value = S.compose.text; }
  function setupTyper() {
    const t = $("#typer");
    t.addEventListener("input", () => { if (S.view !== "compose") return; S.compose.text = t.value; draw(); });
    t.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && S.view === "compose") { e.preventDefault(); } });
  }
  function saveDraft() { const c = S.compose; const d = { id: c.draftId || uid("d"), to: c.to, number: c.number || "", text: c.text, ...(c.mms ? { mms: c.mms } : {}), at: new Date().toISOString() };
    S.meta.drafts = [d, ...S.meta.drafts.filter(x => x.id !== d.id)].slice(0, 20); saveMeta(); }

  // ───────────────────────── 发短信 ─────────────────────────
  async function sendNow() {
    const c = S.compose; const text = c.text.trim(); if (!text && !c.mms) return;
    let p = c.to ? personById(c.to) : S.people.find(x => x.number === c.number);
    // 「我主动」：她随手按的号码 → 还没联系上的「我主动」的人里挑一个，这个号码从此就是他的
    if (!p && c.number) { const cand = S.people.filter(x => x.opening === "mine" && !x.met); if (cand.length) { p = cand[rand(0, cand.length - 1)]; p.number = c.number; savePerson(p); } }
    if (c.draftId) { S.meta.drafts = S.meta.drafts.filter(d => d.id !== c.draftId); saveMeta(); }
    S.sendingTo = p ? p.id : null; S.view = "sending"; S.sendState = null; S.sendPct = 0; $("#typer").blur(); draw();
    for (let i = 1; i <= 6; i++) { await wait(220); S.sendPct = i * 100 / 6; draw(); }
    const fail = Math.random() < 0.06;
    S.sendState = fail ? "fail" : "ok"; draw();
    const target = p || { id: `x_${c.number}`, number: c.number };
    if (!p) { // 空号：发出去了但没人收到（存一个只有号码的「人」，放进发件箱）
      if (!personById(target.id)) { S.people.push({ ...target, ghost: true, opening: "none" }); savePerson(personById(target.id)); }
    }
    const th = threadOf(target.id);
    th.msgs.push({ id: uid("m"), dir: "out", text, ...(c.mms ? { mms: c.mms } : {}), at: new Date().toISOString(), status: fail ? "failed" : "sent" }); saveThread(th);
    S.compose = null; $("#typer").value = "";
    await wait(900);
    S.stack = S.stack.filter(x => !["compose", "pickto", "dial", "readopt"].includes(x.view));
    if (!fail && p && !p.ghost) { p.met = true; savePerson(p); queueReply(p.id);
      // 发完直接接着写「下一条」：她在给他写的时候，他先不回；按「完成」或者离开才开始等
      S.compose = { to: p.id, text: "", next: true }; S.view = "compose"; S.sel = 0; draw(); syncTyper(); return; }
    back();
  }
  /** 她发完一批（停几秒没再发）他才回；回复本身还要等一会儿（不秒回） */
  function queueReply(pid) {
    S.meta.queue = S.meta.queue.filter(q => !(q.pid === pid && q.kind === "reply"));
    S.meta.queue.push({ pid, kind: "reply", due: new Date(Date.now() + rand(10, 30) * 1000 * TS()).toISOString() }); saveMeta();
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const TS = () => window.__TIME_SCALE || 1; // 测试页用来把等待时间缩短

  // ───────────────────────── 他回短信 ─────────────────────────
  const OPEN_NAME = { wrong: "发错号码", owner: "找前机主", mine: "我主动", none: "" };
  const personName = p => p.source === "char" ? ((S.chars.find(c => c.id === p.charId) || {}).name || p.name || "档案角色") : (p.name || "未命名");
  const SMS_FMT = "每条短信一个块（一次一到三条）：\n===短信===\n内容：一条短信（不超过 70 个字）\n===结束===\n\n你的手机能拍照（30 万像素）。想让用户看看你拍的东西时，可以发彩信，一次最多一条，按你的人设和当时的心情决定发不发：\n===彩信===\n画面：照片里拍到了什么（场景、人物、物品、光线，客观写清楚，只能是你身边真实的东西）\n配的话：一句话，可以不写\n===结束===\n\n如果你打算给用户写一封信（你自己想写，或者你们约好了），在最后加上（信不用现在写，写好了会寄过去）：\n===写信===\n想写什么：一句话\n===结束===";
  // 解析出来的每一条：短信是字符串，彩信是 { text, mms: { desc } }
  function parseSms(raw) {
    const out = []; const re = /===\s*(短信|彩信)\s*===([\s\S]*?)(?====|$)/g; let m, mms = 0;
    while ((m = re.exec(String(raw || "")))) {
      const body = m[2].replace(/===\s*结束\s*===/g, "");
      if (m[1] === "彩信") { const desc = ((body.match(/画面\s*[：:]\s*([^\n]+)/) || [])[1] || "").trim(); let cap = ((body.match(/配的话\s*[：:]\s*([^\n]*)/) || [])[1] || "").trim();
        if (/^[（(]?(无|不写|没有|空)[)）]?$/.test(cap)) cap = ""; if (desc && !mms++) out.push({ text: [...cap].slice(0, 70).join(""), mms: { desc: desc.slice(0, 200) } }); continue; }
      const t = body.replace(/^\s*内容\s*[：:]\s*/m, "").trim(); if (t) out.push(t);
    }
    if (!out.length && raw && !/===/.test(raw)) out.push(String(raw).trim());
    // 超过 70 字的按 70 字切开（像老手机自动分条）
    return out.flatMap(t => { if (typeof t !== "string") return [t]; const cs = [...t]; const parts = []; for (let i = 0; i < cs.length; i += 70) parts.push(cs.slice(i, i + 70).join("")); return parts; }).slice(0, 4);
  }
  const partText = t => (typeof t === "string" ? t : `${t.mms.desc} ${t.text}`);
  const KEEP = 40; // 每次回短信带最近 40 条原文；更早的总结进「他记得的事」
  const historyText = msgs => msgs.slice(-KEEP).map(m => `[${msgTime(m.at)}] ${m.dir === "in" ? "你" : "用户"}：${textOf(m)}`).join("\n");
  async function genSms(p, kind, at) {
    const th = threadOf(p.id);
    let s = th.msgs.length; while (s > 0 && th.msgs[s - 1].dir === "out") s--;
    const pending = th.msgs.slice(s).filter(m => m.dir === "out");
    await updateMemo(p, th.msgs.slice(0, s)); await seePhotos(p, pending);
    const hist = historyText(th.msgs.slice(0, s));
    const futures = futureIn(pending.map(m => textOf(m)).join(" "));
    const lines = [
      ERA_RULE(at ? new Date(at) : undefined),
      `你在用自己的手机（号码 ${p.number}）收发短信。用户的号码是 ${S.meta.myNumber}${p.met ? "" : "，你不认识这个号码"}。`,
      kind === "wrong" ? "你本来想给你生活里的某个人发短信（按你那边的生活来定是谁、要说什么），结果按错了号码，发到了用户这个号码上。你还不知道自己发错了。写你发出的这条短信。" : "",
      kind === "pro" ? "你想主动给用户发条短信：说说你这会儿的生活——刚发生的事、在做的事、看到的、想到的，像跟一个隔着很远的朋友分享日常。按你的人设和你们聊到哪了来，一两条就够。不用交代行程，也不要追问用户为什么没发短信。" : "",
      kind === "owner" ? "这个号码以前是你一个朋友在用（按你那边的生活来定是谁），你像往常一样给这个号码发短信找他/她。你还不知道号码已经换了主人。写你发出的这条短信。" : "",
      p.memo ? `你记得的事（更早的短信里发生的）：\n${p.memo}` : "",
      hist ? `你们${p.memo ? "最近" : "之前"}的短信：\n${hist}` : "",
      letterCtx(p),
      kind === "reply" && (p.opening === "wrong" || p.opening === "owner") ? `你们的第一条短信是你发的，本来是想发给${p.meant ? `「${p.meant}」` : "你生活里的一个人"}；${p.opening === "wrong" ? "可你按错了号码" : "可这个号码早就不是他在用了"}，现在拿着这个号码的用户，你根本不认识。` : "",
      kind === "reply" ? `用户刚刚${pending.length > 1 ? "连着" : ""}发来：${pending.map(m => `「${textOf(m)}」`).join("")}${pending.some(m => m.mms) ? "（[彩信照片] 是用户用手机拍了发给你的照片，你在自己手机上看到的就是这样）" : ""}` : "",
      futures.length ? `用户提到的「${futures.join("」「")}」，是你那边还没有的东西，你没听说过。` : "",
      SMS_FMT,
      kind === "wrong" || kind === "owner" ? "最后再写一个备注（不会发出去，只是记下来）：\n===备注===\n本来想发给：那个人是谁（名字或外号，和你是什么关系）\n===结束===" : "",
    ].filter(Boolean).join("\n\n");
    let parts = await callAi(p, lines);
    const wl = (S._lastRaw || "").match(/===\s*写信\s*===([\s\S]*?)(?====|$)/); // 他说要写信：过一阵信写好寄来
    if (parts && parts.length && wl && !S.meta.queue.some(q => q.pid === p.id && q.kind === "letter")) {
      const note = (wl[1].replace(/想写什么\s*[：:]/, "").trim() || "").slice(0, 100); const due = new Date(Date.now() + rand(40, 180) * 60e3 * TS()).toISOString();
      S.meta.queue.push({ pid: p.id, kind: "letter", note, at: due, due }); saveMeta();
    }
    if ((kind === "wrong" || kind === "owner") && S._lastRaw) { const m = S._lastRaw.match(/本来想发给\s*[：:]\s*([^\n=]+)/); if (m) { p.meant = m[1].trim().slice(0, 40); savePerson(p); } }
    if (parts && parts.length) { const leak = futureIn(parts.map(partText).join(" ")).filter(w => !futures.includes(w)); // 他说漏嘴了：重写一次
      if (leak.length) { const again = await callAi(p, `${lines}\n\n你刚才写了「${leak.join("」「")}」，这是你那边还没有的东西，你不可能知道。重写。`); if (again && again.length) parts = again; } }
    return parts;
  }
  async function callAi(p, instruction) { const t = await callRaw(p, instruction); return t == null ? null : parseSms(t); }
  /** 调 AI 拿原文：档案库角色走 generate，写在这里的走 chat（what = 短信 / 信） */
  async function callRaw(p, instruction, what = "短信") {
    try {
      if (p.source === "char" && p.charId) {
        const r = await api.ai.generate({ characterId: p.charId, appTags: ["nox_reply2008", what === "信" ? "letter" : "sms"], instruction: `${instruction}\n\n【输出要求】只输出${what}块，不要解释、不要旁白。` });
        return (S._lastRaw = (r && r.text) || "");
      }
      // 人设同时放进 system 和正文开头：有的接口会忽略 system，人设就丢了（她遇到 17 岁高二被说成大一）
      const who = [`【你是谁】你是${p.name || "无名"}${p.age ? `，2008 年时${p.age}岁` : ""}${p.city ? `，在${p.city}` : ""}。`, p.persona ? `性格和说话方式：${p.persona}` : "", p.life ? `你那边的生活：${p.life}` : "", "人设里写的年龄、年级、身份、家庭都是定死的，不能改，也不能自己编一个不一样的。"].filter(Boolean).join("\n");
      const r = await api.ai.chat({ system: `${who}\n只输出${what}，不要任何解释。`, prompt: `${who}\n\n${instruction}`, timeoutMs: 180000 });
      return (S._lastRaw = (r && r.text) || "");
    } catch (e) { console.warn(e); logErr(`${personName(p)}：${(e && e.message) || e}`); return null; }
  }
  /** 出错记下来（关于这部手机里能看到最近几条） */
  function logErr(t) { S.meta.errors = [`${hm(new Date())} ${String(t).slice(0, 120)}`, ...(S.meta.errors || [])].slice(0, 5); saveMeta(); }
  /**
   * 长期记忆：最近 40 条以前的短信，攒够 10 条就总结成几句要点，接在 p.memo 后面（按时间记到哪了：p.memoAt）。
   * 只往后接，不压缩（压缩会把细节删掉，她不要）。人物档案里能看到、能改
   */
  async function updateMemo(p, msgs) {
    const old = msgs.slice(0, Math.max(0, msgs.length - KEEP)).filter(m => !p.memoAt || m.at > p.memoAt);
    if (old.length < 10) return;
    const name = personName(p);
    const text = old.map(m => `[${msgTime(m.at)}] ${m.dir === "in" ? "你" : "用户"}：${textOf(m)}`).join("\n");
    try {
      const r = await api.ai.chat({ system: "你负责帮一个人整理短信笔记，只输出要点，不要任何解释。", timeoutMs: 180000,
        prompt: `下面是${name}（文中的「你」）和一个号码（文中的「用户」）之间的一段短信。${p.memo ? `之前已经记下的：\n${p.memo}\n\n` : ""}把这段短信整理成几条要点，用第二人称「你」写：发生了什么事；用户说过的关于自己的事；你说过的关于自己的事（名字、年龄、学校、家里这些原样记）；你们之间的称呼、约定和没说完的话。只写短信里真有的，不编，不评价。不超过 200 字，每条一行，开头写 -。\n\n${text}` });
      const add = String((r && r.text) || "").trim(); if (!add) return;
      p.memo = [p.memo, add].filter(Boolean).join("\n"); p.memoAt = old[old.length - 1].at;
      savePerson(p);
    } catch (e) { logErr(`整理记忆：${(e && e.message) || e}`); }
  }
  /** 收到短信：收件箱满了就排队，删了旧的才进来 */
  function receive(pid, texts, at, pro, mem) {
    const th = threadOf(pid);
    for (const [i, it] of texts.entries()) {
      const { text, mms } = typeof it === "string" ? { text: it } : it;
      if (allIn().length >= INBOX_MAX) { S.meta.pendingIn.push({ pid, text, ...(mms ? { mms } : {}) }); continue; }
      th.msgs.push({ id: uid("m"), dir: "in", text, ...(mms ? { mms } : {}), at: new Date(new Date(at || Date.now()).getTime() + i * 20e3).toISOString(), read: false, ...(pro ? { pro: true } : {}), ...(mem ? { mem } : {}) });
    }
    saveThread(th); saveMeta(); notify();
  }
  function flushPending() {
    while (S.meta.pendingIn.length && allIn().length < INBOX_MAX) { const x = S.meta.pendingIn.shift(); const th = threadOf(x.pid); th.msgs.push({ id: uid("m"), dir: "in", text: x.text, ...(x.mms ? { mms: x.mms } : {}), at: new Date().toISOString(), read: false }); saveThread(th); }
    saveMeta();
  }
  function notify() {
    if (["standby", "boot"].includes(S.view)) { S.stack = []; S.view = "newmsg"; draw(); }
    else draw(); // 别的界面就只让信封闪
  }
  let busy = false;
  async function tick() {
    if (busy) return; busy = true;
    try {
      const writing = S.view === "compose" && S.compose ? S.compose.to : S.view === "sending" ? S.sendingTo : null; // 正在给他写下一条 / 正在发：先等她写完
      for (const q of S.meta.queue.filter(q => new Date(q.due) <= new Date() && q.pid !== writing)) {
        const p = personById(q.pid); if (!p) { S.meta.queue = S.meta.queue.filter(x => x !== q); continue; }
        if (q.kind === "letter" || q.kind === "letterReply") { // 信
          const text = await genLetter(p, q);
          // 没写出来就一直等着重试（前三次隔 1 分钟，之后隔 10 分钟），别把信弄丢
          if (!text) { q.tries = (q.tries || 0) + 1; q.due = new Date(Date.now() + (q.tries < 3 ? 60e3 : 600e3)).toISOString(); saveMeta(); continue; }
          S.meta.queue = S.meta.queue.filter(x => x !== q); saveMeta();
          if (text) { const l = { id: uid("l"), pid: p.id, dir: "in", text, at: q.at || new Date().toISOString(), read: false }; l.mem = rememberLetter(p, l); S.letters.push(l); saveLetter(l); notify(); }
          continue;
        }
        const parts = await genSms(p, q.kind, q.at);
        if (!parts || !parts.length) { // 没回出来：过一会儿再试，最多试 3 次
          q.tries = (q.tries || 0) + 1; if (!parts) {} else logErr(`${personName(p)}：回了空白`);
          if (q.tries < 3) { q.due = new Date(Date.now() + 20e3).toISOString(); saveMeta(); continue; }
          if (q.kind === "reply") { q.due = new Date(Date.now() + 300e3).toISOString(); saveMeta(); continue; } // 回她的短信也别丢：之后每 5 分钟再试
        }
        S.meta.queue = S.meta.queue.filter(x => x !== q); saveMeta();
        if (parts && parts.length) { if (q.kind !== "reply") { p.met = true; savePerson(p); } const mem = remember(p, parts); receive(p.id, parts, q.at || q.due, q.kind === "pro", mem); /* 她退出了也没关系：时间按他本来该回的那一刻算 */ }
      }
    } finally { busy = false; }
  }
  /** 档案库角色：短信也写进他的记忆 */
  /** 写进他的记忆；返回 appEventId（重新生成时按它删掉） */
  function remember(p, parts) {
    if (p.source !== "char" || !p.charId || !api.memory || !api.memory.addTimeline) return null; const id = uid("r2008");
    const th = threadOf(p.id); const last = th.msgs.filter(m => m.dir === "out").slice(-1)[0];
    api.memory.addTimeline({ characterId: p.charId, appLabel: "请回答2008", detail: "sms", summary: `${last ? `号码 ${S.meta.myNumber} 发来短信「${textOf(last).slice(0, 80)}」，` : ""}我发短信：${parts.map(t => typeof t === "string" ? `「${t.slice(0, 40)}」` : `彩信照片（${t.mms.desc.slice(0, 60)}）${t.text ? `「${t.text}」` : ""}`).join("")}`, appEventId: id }).catch(() => {});
    return id;
  }
  const forget = (p, id) => { if (id && p.charId && api.memory && api.memory.deleteTimeline) api.memory.deleteTimeline({ characterId: p.charId, appEventId: id }).catch(() => {}); };

  // ───────────────────────── 信：不限字数，他想写就写 / 约好了写；她也能写信寄过去，他会回信 ─────────────────────────
  const dateOf = (l, there) => { const t = there ? thereDate(new Date(l.at)) : new Date(l.at); return `${t.getFullYear()} 年 ${t.getMonth() + 1} 月 ${t.getDate()} 日`; };
  /** 短信和信里互相带：最近两封信 */
  function letterCtx(p) {
    const ls = lettersOf(p.id).slice(-2); if (!ls.length) return "";
    return `你们之间最近的信：\n${ls.map(l => `【${l.dir === "in" ? "你写给用户的信" : "用户写给你的信"} · ${msgTime(l.at)}】\n${l.text.slice(0, 600)}`).join("\n\n")}`;
  }
  async function genLetter(p, q) {
    const th = threadOf(p.id); const at = q.at ? new Date(q.at) : new Date();
    const her = q.kind === "letterReply" ? S.letters.find(l => l.id === q.lid) : null;
    const lines = [
      ERA_RULE(at),
      "这一次不是发短信，是写信：上面关于短信字数、条数的规矩这次不用管。",
      p.memo ? `你记得的事（更早的短信里发生的）：\n${p.memo}` : "",
      th.msgs.length ? `你们最近的短信：\n${historyText(th.msgs)}` : "",
      letterCtx(p),
      her ? `用户给你寄来了一封信：\n${her.text}\n\n你给用户回一封信。` : `你决定给用户写一封信。${q.note ? `你之前说过想写：${q.note}` : ""}`,
      "信不受字数限制，可以写短信里说不完、说不出口的话。按你的人设、你们聊到哪了来写，像那时候的你真的拿笔写的信：有开头的称呼，结尾有落款。300 到 800 字。",
      "===信===\n信的正文\n===结束===",
    ].filter(Boolean).join("\n\n");
    const raw = await callRaw(p, lines, "信"); if (raw == null) return null;
    const m = raw.match(/===\s*信\s*===([\s\S]*?)(?:===\s*结束\s*===|$)/);
    return ((m ? m[1] : /===/.test(raw) ? "" : raw) || "").trim().slice(0, 3000) || null;
  }
  function rememberLetter(p, l) {
    if (p.source !== "char" || !p.charId || !api.memory || !api.memory.addTimeline) return null; const id = uid("r2008l");
    api.memory.addTimeline({ characterId: p.charId, appLabel: "请回答2008", detail: "letter", createdAt: l.at, summary: l.dir === "in" ? `我给号码 ${S.meta.myNumber} 写了一封信：\n${l.text.slice(0, 1500)}` : `号码 ${S.meta.myNumber} 给我寄来一封信：\n${l.text.slice(0, 1500)}`, appEventId: id }).catch(() => {});
    return id;
  }
  /** 展开信纸看信 */
  function openLetter(l) {
    const p = personById(l.pid) || {}; if (l.dir === "in" && !l.read) { l.read = true; saveLetter(l); }
    const mine = S.letters.filter(x => x.pid === l.pid).sort((a, b) => a.at.localeCompare(b.at));
    const canRedo = l.dir === "in" && p.id && mine[mine.length - 1] === l && !S.meta.queue.some(q => q.pid === l.pid && /letter/i.test(q.kind));
    const el = document.createElement("div"); el.className = "letter";
    el.innerHTML = `<div class="lt-paper"><div class="lt-head">${l.dir === "in" ? `${esc(shown(p))} 的来信` : `寄给 ${esc(shown(p))} 的信`}</div><div class="lt-date">${dateOf(l, l.dir === "in")}</div><div class="lt-body">${esc(l.text)}</div></div>
      <div class="lt-btns"><button data-v="close">收好</button>${canRedo ? `<button data-v="redo">让他重写</button>` : ""}${l.dir === "in" && p.id ? `<button data-v="reply" class="pri">回信</button>` : ""}</div>`;
    el.onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return;
      if (b.dataset.v === "redo") { if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "确定重写？"; return; } el.remove(); redoLetter(p, l); return toastLcd("他重新写了，过一会儿寄到"); }
      el.remove(); if (b.dataset.v === "reply") return writeLetter(p); draw(); };
    document.body.appendChild(el); draw();
  }
  /** 他的信不满意：删掉（连记忆），回的是她哪封就重新回那封，没有就重新写一封 */
  function redoLetter(p, l) {
    const before = S.letters.filter(x => x.pid === p.id && x.dir === "out" && x.at <= l.at).sort((a, b) => a.at.localeCompare(b.at)).pop();
    S.letters = S.letters.filter(x => x !== l); dbDel(COL.letters, l.id); forget(p, l.mem);
    const now = new Date(Date.now() + 3000).toISOString();
    S.meta.queue.push(before ? { pid: p.id, kind: "letterReply", lid: before.id, at: now, due: now } : { pid: p.id, kind: "letter", at: now, due: now }); saveMeta();
  }
  /** 写信：信纸上打字；存着（草稿）/ 寄出 */
  function writeLetter(p) {
    const drafts = S.meta.letterDrafts || (S.meta.letterDrafts = {});
    const el = document.createElement("div"); el.className = "letter";
    el.innerHTML = `<div class="lt-paper"><div class="lt-head">写给 ${esc(shown(p))}</div><div class="lt-date">${dateOf({ at: new Date().toISOString() })}</div><textarea class="lt-body" placeholder="${esc(shown(p))}：">${esc(drafts[p.id] || "")}</textarea></div>
      <div class="lt-btns"><button data-v="keep">先存着</button><button data-v="send" class="pri">寄出</button></div>`;
    const ta = el.querySelector("textarea");
    el.onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; const text = ta.value.trim();
      if (b.dataset.v === "keep") { if (text) drafts[p.id] = ta.value; else delete drafts[p.id]; saveMeta(); el.remove(); return text ? toastLcd("信先存着了") : draw(); }
      if (!text) return ta.focus();
      const l = { id: uid("l"), pid: p.id, dir: "out", text: text.slice(0, 5000), at: new Date().toISOString(), read: true };
      S.letters.push(l); saveLetter(l); rememberLetter(p, l); delete drafts[p.id];
      // 他收到信、写回信要一阵子
      const due = new Date(Date.now() + rand(60, 300) * 60e3 * TS()).toISOString();
      S.meta.queue = S.meta.queue.filter(q => !(q.pid === p.id && q.kind === "letter"));
      S.meta.queue.push({ pid: p.id, kind: "letterReply", lid: l.id, at: due, due }); saveMeta();
      el.remove(); toastLcd("信寄出去了"); };
    document.body.appendChild(el); setTimeout(() => ta.focus(), 50);
  }

  // ───────────────────────── 彩信：照片统一做旧成 2008 年 30 万像素手机拍的样子 ─────────────────────────
  const mediaCache = new Map(), thumbCache = new Map();
  const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  async function mediaUrl(ref) {
    if (!ref) return ""; if (mediaCache.has(ref)) return mediaCache.get(ref);
    try { const r = await api.media.get({ ref }); const u = (r && r.dataUrl) || ""; if (u) mediaCache.set(ref, u); return u; } catch (e) { return ""; }
  }
  /** 做旧：缩到 320 宽、发灰偏黄绿、暗部发闷、高光过曝、噪点、压两遍 JPEG；有时右下角印日期（那边的日期） */
  async function oldify(dataUrl, at) {
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
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.38)"); g.fillStyle = vg; g.fillRect(0, 0, w, h); // 四角发暗
    if (at && Math.random() < 0.4) { const t = thereDate(new Date(at)); g.font = "bold 13px monospace"; g.fillStyle = "#ff9a2e"; g.textAlign = "right"; g.fillText(`'${String(t.getFullYear()).slice(2)} ${pad(t.getMonth() + 1)} ${pad(t.getDate())}`, w - 8, h - 8); }
    const once = await loadImg(cv.toDataURL("image/jpeg", 0.35)); g.drawImage(once, 0, 0);
    return cv.toDataURL("image/jpeg", 0.55);
  }
  /** 屏幕上的小图：单色绿屏只能显示点阵，抖动成两种颜色 */
  async function lcdThumb(ref) {
    if (thumbCache.has(ref)) return thumbCache.get(ref);
    const url = await mediaUrl(ref); if (!url) return "";
    const img = await loadImg(url); const w = 72, h = Math.max(1, Math.round(img.height * w / img.width));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d"); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h), px = d.data, B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let i = 0; i < px.length; i += 4) { const x = (i / 4) % w, y = Math.floor(i / 4 / w); const l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255;
      const dark = Math.min(1, Math.max(0, (l - 0.5) * 1.5 + 0.5)) < (B[(y % 4) * 4 + (x % 4)] + 0.5) / 16; px[i] = 29; px[i + 1] = 42; px[i + 2] = 18; px[i + 3] = dark ? 255 : 0; }
    g.putImageData(d, 0, 0); const t = cv.toDataURL("image/png"); thumbCache.set(ref, t); return t;
  }
  /** 同步画屏幕时用：有缓存就给，没有就去取，取到了再画一遍 */
  function thumbNow(ref) { if (thumbCache.has(ref)) return thumbCache.get(ref); lcdThumb(ref).then(u => { if (u) draw(); }); return ""; }
  const SELFIE = /自拍|合照|合影|镜子|对镜|本人|我自己|我的脸/;
  /** 他发的彩信：按画面描述生成照片（点了才生成，费生图 API） */
  async function genPhoto(p, th, m) {
    S.lcdMsg = "正在接收彩信…"; S.view = "msgline"; draw();
    try {
      const prompt = `${m.mms.desc}。2008 年的拍照手机随手拍的照片：30 万像素，画面模糊、有噪点、颜色发灰偏色、构图随意，没有美颜和滤镜，像真实生活里的抓拍，画面里的东西都是 2008 年的样子。`;
      const r = await api.ai.generateImage({ prompt, ...(p.source === "char" && p.charId ? { characterId: p.charId, useReferenceImage: SELFIE.test(m.mms.desc) } : {}), timeoutMs: 120000 });
      if (!r || !r.dataUrl) throw new Error("没有拿到图片");
      const old = await oldify(r.dataUrl, m.at); const st = await api.media.put({ dataUrl: old });
      mediaCache.set(st.ref, old); m.mms.ref = st.ref; saveThread(th);
      S.view = "read"; draw();
    } catch (e) { logErr(`生成照片：${(e && e.message) || e}`); S.view = "read"; toastLcd("接收失败"); }
  }
  /** 看大图（彩色）：像把照片导到电脑上看 */
  async function viewPhoto(m) {
    const url = await mediaUrl(m.mms.ref); if (!url) return toastLcd("照片找不到了");
    const el = document.createElement("div"); el.className = "pview";
    el.innerHTML = `<img src="${url}" alt="">${m.dir === "in" && m.mms.desc ? `<p>${esc(m.mms.desc)}</p>` : ""}<p class="tip">长按图片可以保存 · 点空白处关闭</p>`;
    el.onclick = e => { if (e.target.tagName !== "IMG") el.remove(); };
    document.body.appendChild(el);
  }
  /** 她发的照片：借一个档案库角色的识图看一眼，存成 mms.seen（他回短信时就知道照片里有什么）。每张只看一次 */
  async function seePhotos(p, msgs) {
    const cid = p.source === "char" && p.charId ? p.charId : (S.chars[0] || {}).id; if (!cid) return;
    for (const m of msgs) {
      if (!m.mms || !m.mms.ref || m.mms.seen) continue;
      const url = await mediaUrl(m.mms.ref); if (!url) continue;
      try {
        const r = await api.ai.generate({ characterId: cid, appTags: ["nox_reply2008", "vision"], instruction: "这一轮不扮演任何人，只做一件事：用一两句话客观描述上面这张照片里有什么（人物、物品、场景、文字、光线），不评价、不加戏、不要任何格式，直接输出描述。", appMessages: [{ role: "user", content: "（要描述的照片）", image: url }] });
        const t = String((r && r.text) || "").replace(/^[\s"「]+|[\s"」]+$/g, "").slice(0, 200); if (t) m.mms.seen = t;
      } catch (e) { logErr(`看照片：${(e && e.message) || e}`); }
    }
  }
  async function pickPhoto() {
    try {
      const r = await api.media.pick({ accept: "image/*" }); const f = r && (r.file || (r.files || [])[0]); if (!f || !f.dataUrl) return null;
      const old = await oldify(f.dataUrl, new Date().toISOString()); const st = await api.media.put({ dataUrl: old }); mediaCache.set(st.ref, old); return { ref: st.ref };
    } catch (e) { logErr(`选照片：${(e && e.message) || e}`); return null; }
  }
  const mmsLcd = m => { if (!m.mms) return ""; const t = m.mms.ref && thumbNow(m.mms.ref);
    return t ? `<img class="lcdimg" src="${t}" alt="">` : `<div class="s12">[彩信]${m.dir === "in" && m.mms.desc ? ` ${esc(m.mms.desc)}` : m.mms.ref ? " 照片" : ""}</div>`; };

  // ───────────────────────── 整段保存：把整个对话画成一张长图（像素字、绿屏），长按保存；也能复制文字 ─────────────────────────
  async function exportConv(pid) {
    const p = personById(pid); const msgs = threadOf(pid).msgs; if (!msgs.length) return toastLcd("还没有短信");
    const who = p ? (p.label || p.number) : "对方";
    const text = msgs.map(m => { const t = thereDate(new Date(m.at)); return `${m.dir === "out" ? "我" : who}：${m.mms ? "[彩信]" : ""}${m.text}　${ymd(t)} ${hm(t)}`; }).join("\n");
    await document.fonts.ready;
    const K = 2, W = 360, PAD = 18, FS = 24, LH = 34, cs = getComputedStyle(document.documentElement);
    const lcd = cs.getPropertyValue("--lcd").trim() || "#9fd36a", ink = cs.getPropertyValue("--ink").trim() || "#1d2a12";
    const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    ctx.font = `${FS}px Px`;
    // 先排版：每条「名字：内容」自动换行，日期变了插一行日期
    const rows = []; let day = "";
    rows.push({ t: `与 ${who} 的短信`, s: 18, c: true }, { gap: 8 });
    for (const m of msgs) {
      const t = thereDate(new Date(m.at)); const d = ymd(t);
      if (d !== day) { day = d; rows.push({ gap: 6 }, { t: d, s: 12, c: true, dim: true }, { gap: 4 }); }
      let line = ""; for (const ch of `${m.dir === "out" ? "我" : who}：${m.text}`) { if (ctx.measureText(line + ch).width > W - PAD * 2) { rows.push({ t: line }); line = ""; } line += ch; }
      if (line) rows.push({ t: line });
    }
    rows.push({ gap: 12 }, { t: "请回答2008", s: 12, c: true, dim: true });
    const H = rows.reduce((a, r) => a + (r.gap || (r.s ? r.s + 12 : LH)), PAD * 2);
    cv.width = W * K; cv.height = H * K; ctx.scale(K, K); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = lcd; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,.03)"; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1); for (let x = 0; x < W; x += 3) ctx.fillRect(x, 0, 1, H);
    let y = PAD; ctx.textBaseline = "top";
    for (const r of rows) {
      if (r.gap) { y += r.gap; continue; }
      const fs = r.s || FS; ctx.font = `${fs}px Px`; ctx.fillStyle = ink; ctx.globalAlpha = r.dim ? .7 : 1;
      const x = r.c ? (W - ctx.measureText(r.t).width) / 2 : PAD; ctx.fillText(r.t, x, y + (r.s ? 2 : 4)); ctx.globalAlpha = 1;
      y += r.s ? r.s + 12 : LH;
    }
    const url = cv.toDataURL("image/png");
    sheetHtml(`<h3>整段保存</h3><p class="note">长按图片保存到相册；或者复制文字</p><img class="longshot" src="${url}" alt=""><div class="btns"><button data-v="copy">复制文字</button><button data-v="no" class="pri">关闭</button></div>`);
    $("#sheet").onclick = async e => { const b = e.target.closest("[data-v]"); if (!b) return; if (b.dataset.v === "no") return closeSheet();
      try { await navigator.clipboard.writeText(text); b.textContent = "已复制"; } catch (err) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); b.textContent = "已复制"; } catch (e2) { b.textContent = "复制失败"; } ta.remove(); } };
  }

  // ───────────────────────── 人物档案（屏幕外的纸卡片） ─────────────────────────
  function sheetHtml(html) { const s = $("#sheet"); s.innerHTML = `<div class="paper">${html}</div>`; s.classList.add("on"); }
  function closeSheet() { const s = $("#sheet"); s.classList.remove("on"); s.innerHTML = ""; }
  function ask(title, label, value) {
    return new Promise(res => {
      sheetHtml(`<h3>${esc(title)}</h3><label>${esc(label)}<input id="askv" maxlength="20" value="${esc(value || "")}"></label><div class="btns"><button data-v="no">取消</button><button data-v="ok" class="pri">确定</button></div>`);
      const i = $("#askv"); setTimeout(() => i.focus(), 50);
      $("#sheet").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; const v = b.dataset.v === "ok" ? i.value.trim() : null; closeSheet(); res(v); };
    });
  }
  function editPerson(p) {
    const isNew = !p; p = p ? { ...p } : { id: uid("p"), source: "local", opening: "wrong", number: phoneNo(), met: false };
    const charOpts = S.chars.map(c => `<option value="${esc(c.id)}" ${p.charId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    sheetHtml(`<h3>${isNew ? "新建人物" : "编辑人物"}</h3>
      <div class="seg" id="src"><button data-s="char" class="${p.source === "char" ? "on" : ""}">档案库角色</button><button data-s="local" class="${p.source === "local" ? "on" : ""}">写在这里</button></div>
      <div id="f-char" class="${p.source === "char" ? "" : "hide"}"><label>选择角色<select id="f-charid">${charOpts || `<option value="">（档案库里还没有角色）</option>`}</select></label><p class="note">人设、世界书、记忆用档案库里的；记得在档案里写清楚他活在 2008 年。</p></div>
      <div id="f-local" class="${p.source === "local" ? "" : "hide"}">
        <label>名字<input id="f-name" maxlength="12" value="${esc(p.name || "")}"></label>
        <div class="two"><label>2008 年几岁<input id="f-age" maxlength="3" inputmode="numeric" value="${esc(p.age || "")}"></label><label>在哪个城市<input id="f-city" maxlength="12" value="${esc(p.city || "")}"></label></div>
        <label>性格和说话方式<textarea id="f-persona" rows="3" maxlength="600">${esc(p.persona || "")}</textarea></label>
        <label>他那边的生活<textarea id="f-life" rows="3" maxlength="600" placeholder="在读书还是工作、家里什么样、最近在忙什么">${esc(p.life || "")}</textarea></label>
      </div>
      <label>他记得的事<textarea id="f-memo" rows="3" placeholder="聊多了以后，更早的短信会自动总结到这里，你也可以自己改">${esc(p.memo || "")}</textarea></label>
      ${canImport(p) ? `<button class="wide" data-v="imp">把以前的 ${importable(p).length} 条短信写进他的记忆</button>` : ""}
      <label>怎么联系上<select id="f-open">${Object.entries({ wrong: "他发错号码，发到了这部手机", owner: "他找这部手机的前机主", mine: "我主动：在待机屏随手按号码发出去" }).map(([k, v]) => `<option value="${k}" ${p.opening === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label>他的号码<input id="f-num" maxlength="11" inputmode="numeric" value="${esc(p.number || "")}"></label>
      <p class="note">${p.met ? "已经联系上了：改人设会影响之后的短信。" : "「我主动」的话，你发出去的号码会变成他的号码。"}</p>
      <div class="btns">${isNew ? "" : `<button data-v="del" class="danger">删除</button>`}<button data-v="no">取消</button><button data-v="ok" class="pri">保存</button></div>`);
    const sh = $("#sheet");
    sh.onclick = async e => {
      const sb = e.target.closest("[data-s]"); if (sb) { p.source = sb.dataset.s; sh.querySelectorAll("#src button").forEach(b => b.classList.toggle("on", b === sb)); $("#f-char").classList.toggle("hide", p.source !== "char"); $("#f-local").classList.toggle("hide", p.source !== "local"); return; }
      const b = e.target.closest("[data-v]"); if (!b) return;
      if (b.dataset.v === "no") return closeSheet();
      if (b.dataset.v === "imp") return askImport(personById(p.id));
      if (b.dataset.v === "del") { if (!confirmInline(b)) return; S.people = S.people.filter(x => x.id !== p.id); S.threads = S.threads.filter(x => x.id !== p.id); dbDel(COL.people, p.id); dbDel(COL.threads, p.id); for (const l of lettersOf(p.id)) dbDel(COL.letters, l.id); S.letters = S.letters.filter(l => l.pid !== p.id); S.meta.queue = S.meta.queue.filter(q => q.pid !== p.id); saveMeta(); closeSheet(); return draw(); }
      p.charId = $("#f-charid") ? $("#f-charid").value : ""; p.name = $("#f-name").value.trim(); p.age = $("#f-age").value.trim(); p.city = $("#f-city").value.trim();
      p.persona = $("#f-persona").value.trim(); p.life = $("#f-life").value.trim(); p.memo = $("#f-memo").value.trim(); p.opening = $("#f-open").value; p.number = ($("#f-num").value.replace(/\D/g, "") || p.number);
      if (p.source === "char" && !p.charId) return alertInline("先选一个档案库角色");
      if (p.source === "local" && !p.name) return alertInline("写个名字吧");
      const old = personById(p.id);
      const linked = old && old.source === "local" && p.source === "char"; // 写在这里 → 换成档案库角色：短信照旧，以前的可以写进他的记忆
      if (linked && !p.linkedAt) p.linkedAt = new Date().toISOString();
      if (old) Object.assign(old, p); else S.people.push(p);
      savePerson(personById(p.id));
      if (linked && canImport(personById(p.id))) return askImport(personById(p.id));
      // 发错号码 / 找前机主：存好后过一会儿他的第一条短信就来了
      if (isNew && p.opening !== "mine") { S.meta.queue.push({ pid: p.id, kind: p.opening, due: new Date(Date.now() + rand(10, 40) * 1000 * TS()).toISOString() }); saveMeta(); }
      closeSheet(); draw();
    };
  }
  /**
   * 写在这里换成档案库角色以后：把换之前的短信一字不改写进他的 float 记忆。
   * 一天一条事件（时间用当天最后一条短信的时间），太长就分段；「他记得的事」另存一条长期记忆。只写一次（p.importedAt）
   */
  const importable = p => threadOf(p.id).msgs.filter(m => m.status !== "failed" && p.linkedAt && m.at < p.linkedAt);
  const canImport = p => !!(p && p.source === "char" && p.charId && p.linkedAt && !p.importedAt && importable(p).length && api.memory && api.memory.addTimeline);
  function askImport(p) {
    const n = importable(p).length;
    sheetHtml(`<h3>写进他的记忆</h3><p class="note">你们换过来之前的 ${n} 条短信，会一字不改、带着当时的时间写进 ${esc(personName(p))} 的 float 记忆，他在别的 app 里也记得。${p.memo ? "「他记得的事」也会另存一份进长期记忆。" : ""}只写一次。</p><div class="btns"><button data-v="no">以后再说</button><button data-v="ok" class="pri">写进去</button></div>`);
    $("#sheet").onclick = async e => {
      const b = e.target.closest("[data-v]"); if (!b) return;
      if (b.dataset.v === "no") { closeSheet(); return draw(); }
      if (b.disabled) return; b.disabled = true; b.textContent = "正在写…";
      try { await importHistory(p); closeSheet(); draw(); toastLcd("写好了"); }
      catch (err) { b.disabled = false; b.textContent = "再试一次"; alertInline(`没写进去：${(err && err.message) || err}`); }
    };
  }
  async function importHistory(p) {
    const who = m => m.dir === "in" ? "我" : `号码 ${S.meta.myNumber}`;
    const days = new Map();
    for (const m of importable(p)) { const k = ymd(thereDate(new Date(m.at))); if (!days.has(k)) days.set(k, []); days.get(k).push(m); }
    let done = p.importDone || 0, i = 0; // 中途失败了，再点从断的地方接着写
    for (const [day, ms] of days) {
      const chunks = [[]]; let len = 0;
      for (const m of ms) { const line = `[${hm(thereDate(new Date(m.at)))}] ${who(m)}：${textOf(m)}`; if (len + line.length > 1800 && chunks[chunks.length - 1].length) { chunks.push([]); len = 0; } chunks[chunks.length - 1].push({ line, at: m.at }); len += line.length + 1; }
      for (const c of chunks) {
        if (i++ < done) continue;
        await api.memory.addTimeline({ characterId: p.charId, appLabel: "请回答2008", detail: "sms", createdAt: c[c.length - 1].at, summary: `请回答2008 · ${day} 的短信：\n${c.map(x => x.line).join("\n")}`, appEventId: `r2008_imp_${p.id}_${i}` });
        p.importDone = ++done; savePerson(p);
      }
    }
    if (p.memo && api.memory.add) await api.memory.add({ characterId: p.charId, type: "long_term", importance: 0.7, content: `请回答2008 里，我和号码 ${S.meta.myNumber} 发短信时记下的要点（里面的「你」是我自己，「用户」是那个号码）：\n${p.memo}`, reason: "从请回答2008 接过来" });
    p.importedAt = new Date().toISOString(); delete p.importDone; savePerson(p);
  }
  function confirmInline(b) { if (b.dataset.sure) return true; b.dataset.sure = "1"; b.textContent = "再点一次删除"; return false; }
  function alertInline(t) { let n = $("#sheet .warn"); if (!n) { n = document.createElement("p"); n.className = "warn"; $("#sheet .btns").before(n); } n.textContent = t; }

  // ───────────────────────── 按键 ─────────────────────────
  function press(k) {
    wake(); if ($("#sheet").classList.contains("on")) return;
    if (S.view === "boot" || S.view === "sending" || S.view === "msgline") return;
    const v = V[S.view] || V.standby;
    if (k === "end" && S.view !== "compose" && !S.view.startsWith("_")) return home();
    if (v.items && (k === "up" || k === "down")) { const n = v.items().length || 1; S.sel = (S.sel + (k === "up" ? n - 1 : 1)) % n; return draw(); }
    v.key(k);
  }
  // 背光：15 秒没按键变暗，按任何键亮
  let dimT = null;
  function wake() { const lcd = $("#lcd"); lcd.classList.remove("dim", "off"); clearTimeout(dimT); dimT = setTimeout(() => lcd.classList.add("dim"), 15000); }

  async function boot() {
    shell(); setupTyper();
    document.addEventListener("click", e => {
      // 屏幕也能点：点列表里的一行 = 选中它再按确认；点屏幕底下的「选择」「返回」= 按左右软键
      const r = S.meta.touch && e.target.closest("[data-row]"); if (r && !$("#sheet").classList.contains("on")) { S.sel = +r.dataset.row; draw(); return press("ok"); }
      const b = e.target.closest("[data-k]"); if (b && (S.meta.touch || !b.closest("#lcd"))) { e.preventDefault(); press(b.dataset.k); }
    });
    $("#typer").addEventListener("focus", wake);
    S.bootStep = 0; draw();
    const loading = loadAll().catch(e => console.warn(e));
    await wait(300); $("#lcd").classList.remove("off");
    for (const step of [1, 2]) { await wait(1000); S.bootStep = step; draw(); }
    await loading; await wait(700); home(); wake();
    // 补救：最后一条是她发出去的、却没有在等他回的（以前出错被丢掉了）→ 重新排上
    for (const t of S.threads) { const p = personById(t.id); const last = t.msgs[t.msgs.length - 1];
      if (p && !p.ghost && last && last.dir === "out" && last.status !== "failed" && !S.meta.queue.some(q => q.pid === p.id)) S.meta.queue.push({ pid: p.id, kind: "reply", due: new Date(Date.now() + rand(5, 20) * 1000 * TS()).toISOString() }); }
    rollAway();
    saveMeta();
    if (unread()) { S.view = "newmsg"; draw(); }
    setInterval(() => { if (S.view === "standby") draw(); tick(); }, 3000);
    document.addEventListener("visibilitychange", () => { if (document.hidden) markSeen(); else { rollAway(); tick(); } });
    setInterval(markSeen, 60e3); window.addEventListener("pagehide", markSeen);
  }
  /**
   * 他主动找她：app 关着的时候没法发，所以她打开时按「离开了多久」掷骰子，补上她不在时他发来的短信（时间按那时候算）。
   * 离开 1～3 小时 25%、3～8 小时 45%、8～24 小时 65%、一天以上 80%；每次打开最多两个人；他上一条主动的她还没回，就不再主动
   */
  function markSeen() { S.meta.lastSeen = new Date().toISOString(); saveMeta(); }
  function rollAway() {
    const last = S.meta.lastSeen ? new Date(S.meta.lastSeen).getTime() : 0; const now = Date.now(); markSeen();
    const h = (now - last) / 3600e3; if (!last || h < 1) return;
    const pr = h < 3 ? 0.25 : h < 8 ? 0.45 : h < 24 ? 0.65 : 0.8;
    const cand = S.people.filter(p => p.met && !p.ghost && !S.meta.queue.some(q => q.pid === p.id)).filter(p => {
      const ms = threadOf(p.id).msgs; const lastIn = [...ms].reverse().find(m => m.dir === "in"); const lastOut = [...ms].reverse().find(m => m.dir === "out");
      return !(lastIn && lastIn.pro && (!lastOut || lastOut.at < lastIn.at)); });
    let n = 0;
    for (const p of cand.sort(() => Math.random() - 0.5)) {
      if (n >= 2 || Math.random() > pr) continue;
      // 时间：在她离开的这段里挑一个他醒着的点（7:00～23:30），挑不到就用现在
      let at = null;
      for (let i = 0; i < 12 && !at; i++) { const t = new Date(last + 30 * 60e3 + Math.random() * Math.max(0, now - last - 35 * 60e3)); const hh = t.getHours() + t.getMinutes() / 60; if (hh >= 7 && hh <= 23.5) at = t; }
      S.meta.queue.push({ pid: p.id, kind: "pro", at: (at || new Date(now - 60e3)).toISOString(), due: new Date(now + rand(2, 6) * 1000).toISOString() }); n++;
    }
    // 他自己想写信：聊过 30 条以上、上一封信过了 5 天，离开一阵再打开时 6%
    for (const p of S.people.filter(p => p.met && !p.ghost && threadOf(p.id).msgs.length >= 30 && !S.meta.queue.some(q => q.pid === p.id && /letter/i.test(q.kind)))) {
      const last = lettersOf(p.id).filter(l => l.dir === "in").slice(-1)[0]; if (last && now - new Date(last.at).getTime() < 5 * 864e5) continue;
      if (Math.random() < 0.06) { const due = new Date(now + rand(5, 15) * 1000).toISOString(); S.meta.queue.push({ pid: p.id, kind: "letter", at: due, due }); break; }
    }
  }
  boot();
})();
