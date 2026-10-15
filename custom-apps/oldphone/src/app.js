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
  const thereText = () => { const t = thereDate(); return `${ymd(t)} ${week(t)} ${hm(t)}`; };
  const ERA_RULE = () => `【请回答2008】
- 你那边现在是 ${thereText()}。你的日子和用户同步往前走：用户过一天，你也过一天。
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
  const S = { view: "boot", sel: 0, top: 0, battery: 4, people: [], threads: [], chars: [], meta: { id: "meta", operator: true, drafts: [], queue: [], pendingIn: [], myNumber: "" }, stack: [] };
  const COL = { meta: "meta", people: "people", threads: "threads" };
  const INBOX_MAX = 30;
  const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  async function dbList(c) { try { return (await api.db.list(c, { limit: 500 })) || []; } catch (e) { console.warn(e); return []; } }
  async function dbPut(c, row) { try { const u = await api.db.update(c, row.id, row); if (u) return; } catch (e) { /* 没有就建 */ } try { await api.db.create(c, row); } catch (e) { console.warn(e); } }
  async function dbDel(c, id) { try { await api.db.delete(c, id); } catch (e) { console.warn(e); } }
  let metaT = null;
  function saveMeta() { clearTimeout(metaT); metaT = setTimeout(() => dbPut(COL.meta, S.meta), 200); }
  const savePerson = p => dbPut(COL.people, p);
  const saveThread = t => dbPut(COL.threads, t);
  async function loadAll() {
    const [metas, people, threads] = await Promise.all([dbList(COL.meta), dbList(COL.people), dbList(COL.threads)]);
    const m = metas.find(r => r.id === "meta"); if (m) S.meta = { ...S.meta, ...m };
    for (const k of ["drafts", "queue", "pendingIn"]) if (!Array.isArray(S.meta[k])) S.meta[k] = [];
    if (!S.meta.myNumber) { S.meta.myNumber = phoneNo(); saveMeta(); }
    S.people = people; S.threads = threads.map(t => ({ ...t, msgs: t.msgs || [] }));
    S.chars = await api.characters.list().catch(() => []) || [];
  }
  const phoneNo = () => `1${["34", "35", "36", "37", "38", "39", "50", "51", "52", "58", "59"][rand(0, 10)]}${String(rand(0, 99999999)).padStart(8, "0")}`;
  const personById = id => S.people.find(p => p.id === id);
  const threadOf = pid => { let t = S.threads.find(x => x.id === pid); if (!t) { t = { id: pid, msgs: [] }; S.threads.push(t); } return t; };
  const shown = p => (p.label ? p.label : p.number); // 存进电话本之前只显示号码
  const allIn = () => S.threads.flatMap(t => t.msgs.filter(m => m.dir === "in").map(m => ({ ...m, pid: t.id }))).sort((a, b) => new Date(b.at) - new Date(a.at));
  const allOut = () => S.threads.flatMap(t => t.msgs.filter(m => m.dir === "out").map(m => ({ ...m, pid: t.id }))).sort((a, b) => new Date(b.at) - new Date(a.at));
  const unread = () => allIn().filter(m => !m.read).length;
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
      return `${bar()}${S.meta.operator !== false ? `<div class="op s18">中国移动</div>` : ""}<div class="center"><div class="s48 bold">${hm(th)}</div><div class="s18">${ymd(th)} ${week(th)}</div>${S.meta.pendingIn.length ? `<div class="s18" style="margin-top:8px">收件箱已满</div>` : unread() ? `<div class="s18" style="margin-top:8px">${unread()} 条新信息</div>` : ""}</div>${soft(unread() ? "阅读" : "菜单", "电话本")}`; },
    key: k => { if (k === "softL" || k === "ok") return unread() ? open("inbox") : open("menu"); if (k === "softR") return open("book"); if (/^[0-9*#]$/.test(k)) { S.dial = k; return open("dial"); } },
  };
  V.menu = {
    items: () => [["✉", "信息", "sms"], ["☎", "电话本", "book"], ["✎", "人物档案", "cast"], ["✿", "外观", "looks"], ["?", "关于这部手机", "about"]],
    draw: () => `${bar()}<div class="title">菜单</div>${list(V.menu.items().map(([i, t]) => `<i>${i}</i>${t}`), S.sel)}${soft("选择", "返回")}`,
    key: k => { const it = V.menu.items(); if (/^[1-9]$/.test(k) && +k <= it.length) { S.sel = +k - 1; k = "ok"; } if (k === "ok" || k === "softL") return open(it[S.sel][2]); if (k === "softR") return back(); },
  };
  V.sms = {
    items: () => [["写信息", "compose"], [`收件箱`, "inbox", `${allIn().length}/${INBOX_MAX}`], ["发件箱", "outbox", allOut().length], ["草稿箱", "drafts", S.meta.drafts.length]],
    draw: () => `${bar()}<div class="title">信息</div>${list(V.sms.items().map(([t, , n]) => row(t, n)), S.sel)}${soft("选择", "返回")}`,
    key: k => { const it = V.sms.items(); if (/^[1-4]$/.test(k)) { S.sel = +k - 1; k = "ok"; } if (k === "ok" || k === "softL") { if (it[S.sel][1] === "compose") { S.compose = { to: null, text: "" }; } return open(it[S.sel][1]); } if (k === "softR") return back(); },
  };
  V.inbox = {
    items: () => allIn(),
    draw: () => `${bar()}<div class="title">收件箱 ${allIn().length}/${INBOX_MAX}</div>${list(allIn().map(m => row(`${m.read ? "　" : "✉"}${shown(personById(m.pid) || { number: "未知号码" })}`, msgTime(m.at).slice(6))), S.sel)}${soft(allIn().length ? "阅读" : "", "返回")}`,
    key: k => { const m = allIn()[S.sel]; if ((k === "ok" || k === "softL") && m) { S.reading = { pid: m.pid, id: m.id }; return open("read"); } if (k === "softR") return back(); },
  };
  V.outbox = {
    items: () => allOut(),
    draw: () => `${bar()}<div class="title">发件箱</div>${list(allOut().map(m => row(`${m.status === "failed" ? "!" : "　"}${shown(personById(m.pid) || { number: "未知号码" })}`, msgTime(m.at).slice(6))), S.sel)}${soft(allOut().length ? "查看" : "", "返回")}`,
    key: k => { const m = allOut()[S.sel]; if ((k === "ok" || k === "softL") && m) { S.reading = { pid: m.pid, id: m.id }; return open("read"); } if (k === "softR") return back(); },
  };
  V.drafts = {
    items: () => S.meta.drafts,
    draw: () => `${bar()}<div class="title">草稿箱</div>${list(S.meta.drafts.map(d => row(d.text || "（空）")), S.sel)}${soft(S.meta.drafts.length ? "编辑" : "", "返回")}`,
    key: k => { const d = S.meta.drafts[S.sel]; if ((k === "ok" || k === "softL") && d) { S.compose = { to: d.to, number: d.number, text: d.text, draftId: d.id }; return open("compose"); } if (k === "softR") return back(); },
  };
  // 读一条：上下键滚动；选项：回复 / 查看对话 / 存入电话本 / 删除（发件箱的失败短信可以重发）
  V.read = {
    draw: () => { const r = S.reading; const p = personById(r.pid); const m = (threadOf(r.pid).msgs.find(x => x.id === r.id)) || {};
      if (m.dir === "in" && !m.read) { m.read = true; saveThread(threadOf(r.pid)); }
      return `${bar()}<div class="title">${m.dir === "out" ? "发给 " : ""}${esc(p ? shown(p) : "未知号码")}</div><div class="scroll s18" id="readbox"><div>${esc(m.text || "")}</div><div class="s12" style="margin-top:6px">${m.status === "failed" ? "发送失败 · " : ""}${esc(m.at ? `${ymd(thereDate(new Date(m.at)))} ${hm(thereDate(new Date(m.at)))}` : "")}</div></div>${soft("选项", "返回")}`; },
    after: () => { const b = $("#readbox"); if (b) { S.scroll = Math.max(0, Math.min(S.scroll || 0, b.scrollHeight - b.clientHeight)); b.scrollTop = S.scroll; } },
    key: k => { if (k === "up") { S.scroll = (S.scroll || 0) - 26; return draw(); } if (k === "down") { S.scroll = (S.scroll || 0) + 26; return draw(); } if (k === "ok" || k === "softL") return open("readopt"); if (k === "softR") return back(); },
  };
  V.readopt = {
    items: () => { const r = S.reading; const p = personById(r.pid); const m = threadOf(r.pid).msgs.find(x => x.id === r.id) || {};
      return [["回复", "reply"], ["查看对话", "conv"], ...(p && !p.label ? [["存入电话本", "save"]] : []), ...(m.status === "failed" ? [["重新发送", "resend"]] : []), ["删除", "del"]]; },
    draw: () => `${bar()}<div class="title">选项</div>${list(V.readopt.items().map(x => x[0]), S.sel)}${soft("确定", "返回")}`,
    key: async k => {
      if (k === "softR") return back(); if (k !== "ok" && k !== "softL") return;
      const r = S.reading; const p = personById(r.pid); const th = threadOf(r.pid); const m = th.msgs.find(x => x.id === r.id);
      const act = V.readopt.items()[S.sel][1];
      if (act === "reply") { S.compose = { to: r.pid, text: "" }; return open("compose", true); }
      if (act === "conv") { S.conv = r.pid; S.scroll = 9999; return open("conv", true); }
      if (act === "save") { const name = await ask("存入电话本", "名字", ""); if (name) { p.label = name.slice(0, 12); savePerson(p); toastLcd("已保存"); } return; }
      if (act === "resend" && m) { th.msgs = th.msgs.filter(x => x !== m); saveThread(th); S.compose = { to: r.pid, text: m.text }; return sendNow(); }
      if (act === "del" && m) { th.msgs = th.msgs.filter(x => x !== m); saveThread(th); flushPending(); return toastLcd("已删除", () => { S.stack.pop(); back(); }); }
    },
  };
  // 对话：像截图那样一行一行（名字：内容），上下键滚
  V.conv = {
    draw: () => { const p = personById(S.conv); const who = p ? (p.label || "对方").slice(0, 4) : "对方";
      const lines = threadOf(S.conv).msgs.map(m => `<p>${m.dir === "out" ? "我" : esc(who)}：${esc(m.text)}</p>`).join("");
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
      return `${bar()}<div class="title"><span class="cut">${to ? `给 ${esc(to)}` : "写信息"}</span><span class="r">${n % 70 || (n ? 70 : 0)}/${parts}</span></div><div class="scroll s18 typing">${esc(c.text)}<i class="caret"></i>${n ? "" : `<span class="hint">点这里打字</span>`}</div>${soft(n ? "发送" : "", n ? "存草稿" : "返回")}`; },
    key: async k => {
      const c = S.compose;
      if (k === "softL" || k === "ok" || k === "call") { if (![...c.text].length) return; if (!c.to && !c.number) return open("pickto"); return sendNow(); }
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
    draw: () => `${bar()}<div class="title">关于这部手机</div><div class="scroll s18"><p>本机号码</p><p>${esc(S.meta.myNumber)}</p><p class="s12" style="margin-top:8px">请回答2008 · ${esc(VERSION)}</p>${S.meta.queue.length ? `<p class="s12">等回复：${S.meta.queue.map(q => `${esc(personName(personById(q.pid) || {}))} ${hm(new Date(q.due))}${q.tries ? ` 第${q.tries}次重试` : ""}`).join("；")}</p>` : ""}${(S.meta.errors || []).map(e => `<p class="s12">❗${esc(e)}</p>`).join("")}</div>${soft("", "返回")}`,
    after: () => { const b = $("#lcd .scroll"); if (b) b.scrollTop = S.scroll || 0; },
    key: k => { if (k === "up") { S.scroll = Math.max(0, (S.scroll || 0) - 26); return draw(); } if (k === "down") { S.scroll = (S.scroll || 0) + 26; return draw(); } if (k === "softR" || k === "ok") return back(); },
  };
  // 发送中：进度条走完 → 已发送（偶尔信号不好，发送失败）
  V.sending = {
    draw: () => `${bar()}<div class="center"><div class="s18 bold">${S.sendState === "ok" ? "信息已发送" : S.sendState === "fail" ? "发送失败" : "发送中…"}</div>${S.sendState ? "" : `<div class="pbar"><i style="width:${S.sendPct || 0}%"></i></div>`}</div>${soft("", "")}`,
    key: () => {},
  };
  // 新信息提醒
  V.newmsg = {
    draw: () => `${bar()}<div class="center"><div class="blink" style="display:flex;justify-content:center;height:30px">${ICON.mail}</div><div class="s18 bold">${unread()} 条新信息</div></div>${soft("阅读", "退出")}`,
    key: k => { if (k === "softL" || k === "ok") { S.stack = [{ view: "standby" }]; return open("inbox", false, true); } if (k === "softR" || k === "end") return home(); },
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
  function saveDraft() { const c = S.compose; const d = { id: c.draftId || uid("d"), to: c.to, number: c.number || "", text: c.text, at: new Date().toISOString() };
    S.meta.drafts = [d, ...S.meta.drafts.filter(x => x.id !== d.id)].slice(0, 20); saveMeta(); }

  // ───────────────────────── 发短信 ─────────────────────────
  async function sendNow() {
    const c = S.compose; const text = c.text.trim(); if (!text) return;
    let p = c.to ? personById(c.to) : S.people.find(x => x.number === c.number);
    // 「我主动」：她随手按的号码 → 还没联系上的「我主动」的人里挑一个，这个号码从此就是他的
    if (!p && c.number) { const cand = S.people.filter(x => x.opening === "mine" && !x.met); if (cand.length) { p = cand[rand(0, cand.length - 1)]; p.number = c.number; savePerson(p); } }
    if (c.draftId) { S.meta.drafts = S.meta.drafts.filter(d => d.id !== c.draftId); saveMeta(); }
    S.view = "sending"; S.sendState = null; S.sendPct = 0; $("#typer").blur(); draw();
    for (let i = 1; i <= 6; i++) { await wait(220); S.sendPct = i * 100 / 6; draw(); }
    const fail = Math.random() < 0.06;
    S.sendState = fail ? "fail" : "ok"; draw();
    const target = p || { id: `x_${c.number}`, number: c.number };
    if (!p) { // 空号：发出去了但没人收到（存一个只有号码的「人」，放进发件箱）
      if (!personById(target.id)) { S.people.push({ ...target, ghost: true, opening: "none" }); savePerson(personById(target.id)); }
    }
    const th = threadOf(target.id);
    th.msgs.push({ id: uid("m"), dir: "out", text, at: new Date().toISOString(), status: fail ? "failed" : "sent" }); saveThread(th);
    S.compose = null; $("#typer").value = "";
    await wait(900);
    S.stack = S.stack.filter(x => !["compose", "pickto", "dial", "readopt"].includes(x.view)); back();
    if (!fail && p && !p.ghost) { p.met = true; savePerson(p); queueReply(p.id); }
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
  const SMS_FMT = "每条短信一个块（一次一到三条）：\n===短信===\n内容：一条短信（不超过 70 个字）\n===结束===";
  function parseSms(raw) {
    const out = []; const re = /===\s*短信\s*===([\s\S]*?)(?====|$)/g; let m;
    while ((m = re.exec(String(raw || "")))) { const t = m[1].replace(/^\s*内容\s*[：:]\s*/m, "").replace(/===\s*结束\s*===/g, "").trim(); if (t) out.push(t); }
    if (!out.length && raw && !/===/.test(raw)) out.push(String(raw).trim());
    // 超过 70 字的按 70 字切开（像老手机自动分条）
    return out.flatMap(t => { const cs = [...t]; const parts = []; for (let i = 0; i < cs.length; i += 70) parts.push(cs.slice(i, i + 70).join("")); return parts; }).slice(0, 4);
  }
  const historyText = msgs => msgs.slice(-30).map(m => `[${msgTime(m.at)}] ${m.dir === "in" ? "你" : "用户"}：${m.text}`).join("\n");
  async function genSms(p, kind) {
    const th = threadOf(p.id);
    let s = th.msgs.length; while (s > 0 && th.msgs[s - 1].dir === "out") s--;
    const pending = th.msgs.slice(s).filter(m => m.dir === "out");
    const hist = historyText(th.msgs.slice(0, s));
    const futures = futureIn(pending.map(m => m.text).join(" "));
    const lines = [
      ERA_RULE(),
      `你在用自己的手机（号码 ${p.number}）收发短信。用户的号码是 ${S.meta.myNumber}${p.met ? "" : "，你不认识这个号码"}。`,
      kind === "wrong" ? "你本来想给你生活里的某个人发短信（按你那边的生活来定是谁、要说什么），结果按错了号码，发到了用户这个号码上。你还不知道自己发错了。写你发出的这条短信。" : "",
      kind === "owner" ? "这个号码以前是你一个朋友在用（按你那边的生活来定是谁），你像往常一样给这个号码发短信找他/她。你还不知道号码已经换了主人。写你发出的这条短信。" : "",
      hist ? `你们之前的短信：\n${hist}` : "",
      kind === "reply" && (p.opening === "wrong" || p.opening === "owner") ? `你们的第一条短信是你发的，本来是想发给${p.meant ? `「${p.meant}」` : "你生活里的一个人"}；${p.opening === "wrong" ? "可你按错了号码" : "可这个号码早就不是他在用了"}，现在拿着这个号码的用户，你根本不认识。` : "",
      kind === "reply" ? `用户刚刚${pending.length > 1 ? "连着" : ""}发来：${pending.map(m => `「${m.text}」`).join("")}` : "",
      futures.length ? `用户提到的「${futures.join("」「")}」，是你那边还没有的东西，你没听说过。` : "",
      SMS_FMT,
      kind === "wrong" || kind === "owner" ? "最后再写一个备注（不会发出去，只是记下来）：\n===备注===\n本来想发给：那个人是谁（名字或外号，和你是什么关系）\n===结束===" : "",
    ].filter(Boolean).join("\n\n");
    let parts = await callAi(p, lines);
    if ((kind === "wrong" || kind === "owner") && S._lastRaw) { const m = S._lastRaw.match(/本来想发给\s*[：:]\s*([^\n=]+)/); if (m) { p.meant = m[1].trim().slice(0, 40); savePerson(p); } }
    if (parts && parts.length) { const leak = futureIn(parts.join(" ")).filter(w => !futures.includes(w)); // 他说漏嘴了：重写一次
      if (leak.length) { const again = await callAi(p, `${lines}\n\n你刚才写了「${leak.join("」「")}」，这是你那边还没有的东西，你不可能知道。重写。`); if (again && again.length) parts = again; } }
    return parts;
  }
  async function callAi(p, instruction) {
    try {
      if (p.source === "char" && p.charId) {
        const r = await api.ai.generate({ characterId: p.charId, appTags: ["nox_reply2008", "sms"], instruction: `${instruction}\n\n【输出要求】只输出短信块，不要解释、不要旁白。` });
        S._lastRaw = (r && r.text) || ""; return parseSms(r && r.text);
      }
      const system = [`你在扮演一个人：${p.name || "无名"}${p.age ? `，${p.age}岁` : ""}${p.city ? `，在${p.city}` : ""}。`, p.persona ? `性格和说话方式：${p.persona}` : "", p.life ? `你那边的生活：${p.life}` : "", "只输出短信，不要任何解释。"].filter(Boolean).join("\n");
      const r = await api.ai.chat({ system, prompt: instruction, timeoutMs: 180000 });
      S._lastRaw = (r && r.text) || ""; return parseSms(r && r.text);
    } catch (e) { console.warn(e); logErr(`${personName(p)}：${(e && e.message) || e}`); return null; }
  }
  /** 出错记下来（关于这部手机里能看到最近几条） */
  function logErr(t) { S.meta.errors = [`${hm(new Date())} ${String(t).slice(0, 120)}`, ...(S.meta.errors || [])].slice(0, 5); saveMeta(); }
  /** 收到短信：收件箱满了就排队，删了旧的才进来 */
  function receive(pid, texts, at) {
    const th = threadOf(pid);
    for (const [i, text] of texts.entries()) {
      if (allIn().length >= INBOX_MAX) { S.meta.pendingIn.push({ pid, text }); continue; }
      th.msgs.push({ id: uid("m"), dir: "in", text, at: new Date(new Date(at || Date.now()).getTime() + i * 20e3).toISOString(), read: false });
    }
    saveThread(th); saveMeta(); notify();
  }
  function flushPending() {
    while (S.meta.pendingIn.length && allIn().length < INBOX_MAX) { const x = S.meta.pendingIn.shift(); const th = threadOf(x.pid); th.msgs.push({ id: uid("m"), dir: "in", text: x.text, at: new Date().toISOString(), read: false }); saveThread(th); }
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
      for (const q of S.meta.queue.filter(q => new Date(q.due) <= new Date())) {
        const p = personById(q.pid); if (!p) { S.meta.queue = S.meta.queue.filter(x => x !== q); continue; }
        const parts = await genSms(p, q.kind);
        if (!parts || !parts.length) { // 没回出来：过一会儿再试，最多试 3 次
          q.tries = (q.tries || 0) + 1; if (!parts) {} else logErr(`${personName(p)}：回了空白`);
          if (q.tries < 3) { q.due = new Date(Date.now() + 20e3).toISOString(); saveMeta(); continue; }
        }
        S.meta.queue = S.meta.queue.filter(x => x !== q); saveMeta();
        if (parts && parts.length) { if (q.kind !== "reply") { p.met = true; savePerson(p); } receive(p.id, parts, q.due); remember(p, parts); /* 她退出了也没关系：时间按他本来该回的那一刻算 */ }
      }
    } finally { busy = false; }
  }
  /** 档案库角色：短信也写进他的记忆 */
  function remember(p, parts) {
    if (p.source !== "char" || !p.charId || !api.memory || !api.memory.addTimeline) return;
    const th = threadOf(p.id); const last = th.msgs.filter(m => m.dir === "out").slice(-1)[0];
    api.memory.addTimeline({ characterId: p.charId, appLabel: "请回答2008", detail: "sms", summary: `${last ? `号码 ${S.meta.myNumber} 发来短信「${last.text.slice(0, 50)}」，` : ""}我发短信：${parts.map(t => `「${t.slice(0, 40)}」`).join("")}`, appEventId: uid("r2008") }).catch(() => {});
  }

  // ───────────────────────── 整段保存：把整个对话画成一张长图（像素字、绿屏），长按保存；也能复制文字 ─────────────────────────
  async function exportConv(pid) {
    const p = personById(pid); const msgs = threadOf(pid).msgs; if (!msgs.length) return toastLcd("还没有短信");
    const who = p ? (p.label || p.number) : "对方";
    const text = msgs.map(m => { const t = thereDate(new Date(m.at)); return `${m.dir === "out" ? "我" : who}：${m.text}　${ymd(t)} ${hm(t)}`; }).join("\n");
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
      <label>怎么联系上<select id="f-open">${Object.entries({ wrong: "他发错号码，发到了这部手机", owner: "他找这部手机的前机主", mine: "我主动：在待机屏随手按号码发出去" }).map(([k, v]) => `<option value="${k}" ${p.opening === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label>他的号码<input id="f-num" maxlength="11" inputmode="numeric" value="${esc(p.number || "")}"></label>
      <p class="note">${p.met ? "已经联系上了：改人设会影响之后的短信。" : "「我主动」的话，你发出去的号码会变成他的号码。"}</p>
      <div class="btns">${isNew ? "" : `<button data-v="del" class="danger">删除</button>`}<button data-v="no">取消</button><button data-v="ok" class="pri">保存</button></div>`);
    const sh = $("#sheet");
    sh.onclick = async e => {
      const sb = e.target.closest("[data-s]"); if (sb) { p.source = sb.dataset.s; sh.querySelectorAll("#src button").forEach(b => b.classList.toggle("on", b === sb)); $("#f-char").classList.toggle("hide", p.source !== "char"); $("#f-local").classList.toggle("hide", p.source !== "local"); return; }
      const b = e.target.closest("[data-v]"); if (!b) return;
      if (b.dataset.v === "no") return closeSheet();
      if (b.dataset.v === "del") { if (!confirmInline(b)) return; S.people = S.people.filter(x => x.id !== p.id); S.threads = S.threads.filter(x => x.id !== p.id); dbDel(COL.people, p.id); dbDel(COL.threads, p.id); S.meta.queue = S.meta.queue.filter(q => q.pid !== p.id); saveMeta(); closeSheet(); return draw(); }
      p.charId = $("#f-charid") ? $("#f-charid").value : ""; p.name = $("#f-name").value.trim(); p.age = $("#f-age").value.trim(); p.city = $("#f-city").value.trim();
      p.persona = $("#f-persona").value.trim(); p.life = $("#f-life").value.trim(); p.opening = $("#f-open").value; p.number = ($("#f-num").value.replace(/\D/g, "") || p.number);
      if (p.source === "char" && !p.charId) return alertInline("先选一个档案库角色");
      if (p.source === "local" && !p.name) return alertInline("写个名字吧");
      const old = personById(p.id); if (old) Object.assign(old, p); else S.people.push(p);
      savePerson(personById(p.id));
      // 发错号码 / 找前机主：存好后过一会儿他的第一条短信就来了
      if (isNew && p.opening !== "mine") { S.meta.queue.push({ pid: p.id, kind: p.opening, due: new Date(Date.now() + rand(10, 40) * 1000 * TS()).toISOString() }); saveMeta(); }
      closeSheet(); draw();
    };
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
    saveMeta();
    if (unread()) { S.view = "newmsg"; draw(); }
    setInterval(() => { if (S.view === "standby") draw(); tick(); }, 3000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  }
  boot();
})();
