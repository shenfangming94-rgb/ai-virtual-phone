/* 旧手机 · 小手机自定义 APP：一部捡来的按键机，能收发 2008 年的短信（两边永远差 18 年，同月同日同一时刻） */
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

  // ───────────────────────── 屏幕上的小图标（像素风） ─────────────────────────
  const ICON = {
    signal: '<svg viewBox="0 0 44 22" fill="currentColor"><path d="M0 0h12v3H8v3H4V3H0zM4 6h4v16H4z"/><rect x="15" y="15" width="4" height="7"/><rect x="21" y="11" width="4" height="11"/><rect x="27" y="7" width="4" height="15"/><rect x="33" y="3" width="4" height="19"/></svg>',
    mail: '<svg viewBox="0 0 30 22" fill="none" stroke="currentColor" stroke-width="3"><rect x="2" y="2" width="26" height="18"/><path d="M2 2l13 10L28 2"/></svg>',
    bat: n => `<svg class="bat" viewBox="0 0 44 22" fill="currentColor"><rect x="4" y="1" width="39" height="20" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="0" y="7" width="4" height="8"/>${[0, 1, 2, 3].filter(i => i < n).map(i => `<rect x="${32 - i * 8}" y="5" width="6" height="12"/>`).join("")}</svg>`,
  };

  // ───────────────────────── 状态 ─────────────────────────
  const S = { view: "boot", sel: 0, unread: 0, battery: 4 };
  const MENU = [["✉", "信息"], ["☎", "电话本"], ["↺", "通话记录"], ["✿", "外观"], ["?", "关于这部手机"]];

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
    </div></div>`;
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

  // ───────────────────────── 屏幕内容 ─────────────────────────
  const bar = () => `<div class="bar">${ICON.signal}${S.unread ? `<span class="blink" style="display:flex">${ICON.mail}</span>` : ""}${ICON.bat(S.battery)}</div>`;
  const soft = (l, r) => `<div class="soft"><span>${esc(l || "")}</span><span>${esc(r || "")}</span></div>`;
  const VIEWS = {
    boot: () => `<div class="center">${S.bootStep === 0 ? `<div class="s36">TINY<br>TYPE</div>` : S.bootStep === 1 ? `<div class="s18">正在搜索网络…</div>` : `<div class="s18">已连接</div><div class="s36">2008</div>`}</div>`,
    standby: () => { const now = new Date(); const th = thereDate(now);
      return `${bar()}<div class="center"><div class="s48">${hm(now)}</div><div class="s18">${ymd(now)} ${week(now)}</div><div class="s18" style="margin-top:14px;opacity:.75">那边 ${ymd(th)} ${week(th)}</div></div>${soft("菜单", "电话本")}`; },
    menu: () => `${bar()}<div class="title">菜单</div><div class="list">${MENU.map(([i, t], n) => `<div class="${n === S.sel ? "on" : ""}"><i>${i}</i>${t}</div>`).join("")}</div>${soft("选择", "返回")}`,
    todo: () => `${bar()}<div class="title">${esc(S.todo)}</div><div class="center"><div class="s18">还在做<br>马上就好</div></div>${soft("", "返回")}`,
  };
  function draw() { const lcd = $("#lcd"); lcd.innerHTML = (VIEWS[S.view] || VIEWS.standby)(); }

  // ───────────────────────── 按键 ─────────────────────────
  function go(view) { S.view = view; S.sel = 0; draw(); }
  function press(k) {
    wake();
    if (S.view === "boot") return;
    if (k === "end") return go("standby");
    if (S.view === "standby") { if (k === "softL" || k === "ok") return go("menu"); if (k === "softR") { S.todo = "电话本"; return go("todo"); } return; }
    if (S.view === "menu") {
      if (k === "up" || k === "left") { S.sel = (S.sel + MENU.length - 1) % MENU.length; return draw(); }
      if (k === "down" || k === "right") { S.sel = (S.sel + 1) % MENU.length; return draw(); }
      if (/^[1-9]$/.test(k) && +k <= MENU.length) { S.sel = +k - 1; draw(); k = "ok"; }
      if (k === "ok" || k === "softL") { S.todo = MENU[S.sel][1]; return go("todo"); }
      if (k === "softR") return go("standby");
    }
    if (S.view === "todo" && (k === "softR" || k === "ok")) return go("menu");
  }
  // 背光：15 秒没按键变暗，按任何键亮
  let dimT = null;
  function wake() { const lcd = $("#lcd"); lcd.classList.remove("dim", "off"); clearTimeout(dimT); dimT = setTimeout(() => lcd.classList.add("dim"), 15000); }

  async function boot() {
    shell();
    document.addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) press(b.dataset.k); });
    S.bootStep = 0; draw();
    await new Promise(r => setTimeout(r, 300)); $("#lcd").classList.remove("off");
    for (const step of [1, 2]) { await new Promise(r => setTimeout(r, 1000)); S.bootStep = step; draw(); }
    await new Promise(r => setTimeout(r, 900)); go("standby"); wake();
    setInterval(() => { if (S.view === "standby") draw(); }, 15000);
  }
  boot();
})();
