/* 贺卡：全部用 SVG + CSS 画（不用图片，十几款加起来几十 KB）
 * cardHtml(style, f, date) → 一张底图 300×420（新年两款是 420×300）的卡片，外面用 transform 缩放
 * f：卡上能改的字；没填的用默认 */
const CARDS = (function () {
  const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const MON_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WEEK = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const WEEK_L = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const WEEK_S = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const e = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const br = s => e(s).replace(/\n/g, "<br>");
  let idN = 0;
  /** 固定种子的随机数：同一张卡每次画出来一样 */
  const rng = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // 款式：场合、名字、能改的字
  const STYLES = {
    daily1: { occ: "日常", name: "便签小狗", fields: [{ k: "body", label: "卡上的字", def: "今天的晚霞是粉色的\n拍下来的时候\n第一个想发给你", multi: true }] },
    daily2: { occ: "日常", name: "大日期", fields: [{ k: "body", label: "卡上的字", def: "早上买到了最后一个\n可颂，还是热的\n好像今天会很顺利", multi: true }] },
    missing: { occ: "思念", name: "牛皮纸", fields: [{ k: "body", label: "卡上的字", def: "今天又路过那条街，忽然很想你。不知道你那边冷不冷，记得多穿一件。", multi: true }, { k: "seal", label: "印章（两个字）", def: "想念", max: 2 }] },
    season: { occ: "四季", name: "四季", fields: [{ k: "body", label: "卡上的字", def: "", multi: true }] },
    birthday: { occ: "生日", name: "奶油蛋糕", fields: [{ k: "line", label: "下面一行小字", def: "愿你今天被好好爱着" }] },
    ny_photo: { occ: "新年", name: "极简红 · 照片", wide: true, photo: true, fields: [{ k: "line", label: "右下角小字", def: "新的一年，也想和你一起\n把日子过得热热闹闹的", multi: true }] },
    ny_text: { occ: "新年", name: "极简红", wide: true, fields: [{ k: "line", label: "中间一行小字", def: "岁岁常欢愉　年年皆胜意" }] },
    valentine: { occ: "情人节", name: "丝带蛋糕", fields: [{ k: "quote", label: "标题下一句", def: "“Every day with you is my favorite day.”" }, { k: "bottom", label: "最下面一句", def: "I told the stars about you." }] },
    xmas1: { occ: "圣诞", name: "条纹圣诞树", fields: [] },
    xmas2: { occ: "圣诞", name: "波点蝴蝶结", fields: [{ k: "line", label: "下面一行小字", def: "圣诞快乐" }] },
    xmas3: { occ: "圣诞", name: "挂饰", fields: [] },
    xmas4: { occ: "圣诞", name: "花环", fields: [] },
  };
  const ORDER = ["daily1", "daily2", "missing", "season", "birthday", "ny_photo", "ny_text", "valentine", "xmas1", "xmas2", "xmas3", "xmas4"];
  const val = (style, f, k) => { const def = (STYLES[style].fields.find(x => x.k === k) || {}).def || ""; const v = f && f[k]; return v == null || v === "" ? def : v; };

  function seasonOf(d) { const m = d.getMonth() + 1; return m >= 3 && m <= 5 ? 0 : m >= 6 && m <= 8 ? 1 : m >= 9 && m <= 11 ? 2 : 3; }
  const SEASONS = [
    { en: "SPRING", zh: "春", bg: "#7cc07c", ink: "#1f4a26", q: "A little madness in the spring.", tab: "#f39a3a", band: "#2e8b57", ic: "swallow", cal: "#f7e48a", def: "今天风很软，\n路边的花都开了，\n想和你一起\n慢慢走一段。" },
    { en: "SUMMER", zh: "夏", bg: "#ece978", ink: "#55561a", q: "Summer is the time for freedom.", tab: "#6ccf4a", band: "#9aa83a", ic: "dragonfly", cal: "#f6a3b5", def: "冰西瓜切好了，\n最中间那一勺\n给你留着，\n快点来吃。" },
    { en: "AUTUMN", zh: "秋", bg: "#f2a660", ink: "#7a3414", q: "The leaves whisper of the passing year.", tab: "#3d7fd6", band: "#c9702f", ic: "ginkgo", cal: "#9fd0f2", def: "梧桐叶落了一地，\n踩上去会响。\n我没踩，\n等你来一起。" },
    { en: "WINTER", zh: "冬", bg: "#8cc4ee", ink: "#1d3f7a", q: "Warm hugs and fuzzy socks.", tab: "#ec6fa0", band: "#2f6db0", ic: "snow", cal: "#f7e48a", def: "下雪了，\n第一个想告诉你。\n你那边冷不冷，\n记得多穿一件。" },
  ];
  const SEASON_ICON = {
    swallow: '<path d="M-14 4 q10 -2 14 -10 q4 8 16 6 q-10 4 -12 10 l-4 -4 q-6 4 -14 -2z" fill="currentColor"/>',
    dragonfly: '<path d="M0 -12 v24" stroke="currentColor" stroke-width="2"/><g fill="none" stroke="currentColor"><ellipse cx="-8" cy="-4" rx="8" ry="3"/><ellipse cx="8" cy="-4" rx="8" ry="3"/><ellipse cx="-7" cy="2" rx="7" ry="2.5"/><ellipse cx="7" cy="2" rx="7" ry="2.5"/></g>',
    ginkgo: '<path d="M0 10 v-8 M0 2 q-14 -4 -12 -14 q6 4 12 0 q6 4 12 0 q2 10 -12 14z" fill="currentColor" stroke="currentColor"/>',
    snow: '<g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M0 -12v24M-10 -6l20 12M-10 6l20 -12M-3 -10l3 3 3 -3M-3 10l3 -3 3 3"/></g>',
  };

  // ───── 小零件 ─────
  const heartPath = (x, y, s = 1) => `M${x} ${y + 4 * s} c${-4 * s} ${-3 * s} ${-5 * s} ${-5 * s} ${-5 * s} ${-7 * s} a${2.5 * s} ${2.5 * s} 0 0 1 ${5 * s} ${-1 * s} a${2.5 * s} ${2.5 * s} 0 0 1 ${5 * s} ${1 * s} c0 ${2 * s} ${-1 * s} ${4 * s} ${-5 * s} ${7 * s}z`;
  const puppySit = `<g fill="none" stroke="#5a3442" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M100 172 L208 168"/><path d="M126 170 q-6 -34 8 -50 q10 -12 24 -10 q16 -2 24 12 q10 18 4 48"/>
    <path d="M134 116 q-12 -2 -14 12 q0 10 8 12"/><path d="M180 114 q12 -4 16 10 q0 10 -8 14"/>
    <circle cx="146" cy="132" r="1.6" fill="#5a3442"/><circle cx="166" cy="132" r="1.6" fill="#5a3442"/>
    <path d="M152 140 q4 4 8 0"/><ellipse cx="156" cy="137" rx="3" ry="2" fill="#5a3442"/>
    <path d="M136 168 q-2 -12 10 -12 q8 0 8 10"/><path d="M162 166 q0 -10 9 -10 q10 0 9 12"/>
    <ellipse cx="142" cy="141" rx="5" ry="3" stroke="none" fill="#f2a1b4" opacity=".55"/><ellipse cx="171" cy="141" rx="5" ry="3" stroke="none" fill="#f2a1b4" opacity=".55"/></g>`;
  const puppyCup = `<g fill="none" stroke="#5a3442" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M196 386 h80"/><path d="M214 386 q-4 -26 8 -36 q10 -8 22 -2 q12 8 8 38"/>
    <path d="M220 352 q-8 -6 -10 4 q0 6 6 8"/><path d="M248 350 q8 -4 10 6 q0 6 -6 8"/>
    <circle cx="228" cy="362" r="1.3" fill="#5a3442"/><circle cx="242" cy="362" r="1.3" fill="#5a3442"/><path d="M233 368 q2 2 4 0"/>
    <rect x="252" y="370" width="14" height="14" rx="2"/><path d="M266 374 q5 0 5 4 q0 4 -5 4"/><path d="M256 364 q2 -4 0 -7 M261 364 q2 -4 0 -7"/></g>`;

  function cakeSvg(id) {
    return `<svg class="cbg" viewBox="0 0 300 420"><defs><pattern id="${id}d" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.4" fill="#f6d2c6"/></pattern></defs>
 <rect width="300" height="420" fill="#fff7ef"/><rect width="300" height="420" fill="url(#${id}d)"/>
 <rect x="14" y="14" width="272" height="392" rx="10" fill="none" stroke="#efc4b6" stroke-width="1" stroke-dasharray="3 4"/>
 <ellipse cx="150" cy="318" rx="92" ry="12" fill="#f3d9cc"/><rect x="72" y="248" width="156" height="66" rx="10" fill="#fde3e7"/>
 <path d="M72 262 q13 16 26 0 q13 16 26 0 q13 16 26 0 q13 16 26 0 q13 16 26 0 q13 16 26 0 V252 a10 10 0 0 0 -10 -10 H82 a10 10 0 0 0 -10 10z" fill="#fffaf5"/>
 <rect x="96" y="196" width="108" height="52" rx="9" fill="#f9c9d2"/>
 <path d="M96 208 q9 12 18 0 q9 12 18 0 q9 12 18 0 q9 12 18 0 q9 12 18 0 q9 12 18 0 V204 a8 8 0 0 0 -8 -8 H104 a8 8 0 0 0 -8 8z" fill="#fffaf5"/>
 <circle cx="112" cy="290" r="2.5" fill="#f2a7b5"/><circle cx="150" cy="296" r="2.5" fill="#a9d6c8"/><circle cx="188" cy="288" r="2.5" fill="#f5cf7a"/><circle cx="130" cy="232" r="2.2" fill="#a9d6c8"/><circle cx="172" cy="236" r="2.2" fill="#f5cf7a"/>
 <circle cx="150" cy="190" r="9" fill="#e85d75"/><path d="M150 181 q4 -8 9 -9" stroke="#6b9d6b" stroke-width="2" fill="none"/>
 <rect x="122" y="166" width="5" height="26" rx="2" fill="#a9c8e8"/><rect x="173" y="166" width="5" height="26" rx="2" fill="#f5cf7a"/>
 <path class="flame" d="M124.5 152 q6 8 0 14 q-6 -6 0 -14z" fill="#ffb347"/><path class="flame" d="M175.5 152 q6 8 0 14 q-6 -6 0 -14z" fill="#ffb347"/></svg>`;
  }

  function valentineSvg(id) {
    const r = rng(11); const out = [];
    const wavy = (x1, y1, x2, y2, amp, n) => { let d = `M${x1} ${y1}`; for (let i = 1; i <= n; i++) { const t = i / n, tp = (i - .5) / n; const mx = x1 + (x2 - x1) * tp, my = y1 + (y2 - y1) * tp; const nx = -(y2 - y1), ny = x2 - x1, L = Math.hypot(nx, ny); const s = (i % 2 ? 1 : -1) * amp * (.6 + r() * .8); d += ` Q${(mx + nx / L * s).toFixed(1)} ${(my + ny / L * s).toFixed(1)} ${(x1 + (x2 - x1) * t).toFixed(1)} ${(y1 + (y2 - y1) * t).toFixed(1)}`; } return d; };
    let stripes = ""; for (let x = 4; x < 300; x += 34) stripes += `<rect x="${(x + r() * 3).toFixed(1)}" y="-10" width="${(15 + r() * 4).toFixed(1)}" height="440"/>`;
    const fr = [[30, 62, 270, 58], [270, 58, 276, 380], [276, 380, 26, 386], [26, 386, 30, 62]];
    const frames = fr.map(([a, b, c, d]) => [wavy(a, b, c, d, 7, 7), wavy(a + 3, b + 3, c + 3, d + 3, 6, 7)]);
    const fill = frames.map(([w], i) => i ? w.replace(/^M[^Q]+/, "") : w).join("") + "z";
    const ink = [];
    frames.forEach(([w1, w2]) => { ink.push(`<path d="${w1}"/>`, `<path d="${w2}" stroke="#e7898a" stroke-width="3" opacity=".6"/>`); });
    ink.push(`<path d="M150 58 q-30 -26 -46 -10 q-8 14 20 16 q14 0 26 -6 q12 6 26 6 q28 -2 20 -16 q-16 -16 -46 10z" fill="#f0b3b0"/>`,
      `<path d="M146 62 q-14 18 -36 22 q-10 0 -14 6 M154 62 q14 18 36 22 q10 0 14 6"/>`, `<ellipse cx="150" cy="60" rx="6" ry="5" fill="#f0b3b0"/>`);
    [[64, 92], [236, 94], [56, 230], [244, 250], [70, 330], [230, 320]].forEach(([x, y], i) => ink.push(`<path stroke-width="1.3" d="${i % 2 ? `M${x} ${y} c6 -6 10 2 4 6 c-6 4 -8 -4 0 -8` : `M${x} ${y} c-2 -6 6 -8 6 -2 s-8 4 -4 10`}"/>`));
    [[100, 180], [208, 196], [86, 270], [220, 286], [150, 90]].forEach(([x, y]) => ink.push(`<path stroke-width="1.2" d="${heartPath(x, y)}"/>`));
    // 蛋糕（放大一点）
    const c = []; const cx = 150;
    c.push(`<path d="M110 300 q40 10 80 0 l-6 22 q-34 8 -68 0z" fill="#fff" stroke-width="1.6"/>`);
    for (let i = 0; i < 7; i++) c.push(`<path stroke-width="1.4" d="M${116 + i * 10.5} 322 q5 7 10 0"/>`);
    c.push(`<ellipse cx="${cx}" cy="296" rx="58" ry="12" fill="#e9e6e8" stroke="#c9c3c6"/>`, `<path d="M100 250 v40 q50 16 100 0 v-40" fill="#fdf8f4"/>`, `<ellipse cx="${cx}" cy="250" rx="50" ry="16" fill="#fff"/>`);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, x = (cx + Math.cos(a) * 48).toFixed(1), y = (250 + Math.sin(a) * 15).toFixed(1); c.push(`<ellipse cx="${x}" cy="${y}" rx="7" ry="4.5" transform="rotate(${(Math.cos(a) * 25).toFixed(1)} ${x} ${y})" fill="#f6d3d1" stroke-width="1.3"/>`); }
    for (let i = 0; i < 9; i++) c.push(`<ellipse cx="${104 + i * 11.5}" cy="${(291 + Math.sin(i / 8 * Math.PI) * 6).toFixed(1)}" rx="6.5" ry="4" fill="#f6d3d1" stroke-width="1.3"/>`);
    [[138, 248], [158, 246], [148, 256], [128, 268], [172, 270], [150, 278], [116, 276], [186, 280]].forEach(([x, y]) => c.push(`<path d="M${x} ${y + 3} c-3 -2 -4 -3.5 -4 -5 a2 2 0 0 1 4 -1 a2 2 0 0 1 4 1 c0 1.5 -1 3 -4 5z" fill="#d9564c" stroke="none"/>`));
    c.push(`<path stroke-width="1.6" d="M150 236 q-14 -14 -20 -4 q0 8 20 4 q20 4 20 -4 q-6 -10 -20 4 M146 238 q-6 24 -24 46 M154 238 q10 26 30 44"/>`,
      `<path stroke-width="1.4" d="M86 322 l14 -26 M92 324 l12 -24"/>`, `<circle cx="101" cy="296" r="2.5" stroke-width="1.2"/>`, `<circle cx="105" cy="298" r="2.5" stroke-width="1.2"/>`,
      `<path stroke-width="1.5" d="M212 324 v-30 m-4 0 h8 m-4 -4 v-6 q3 -3 0 -6"/>`);
    out.push(`<svg class="cbg" viewBox="0 0 300 420"><defs><filter id="${id}s"><feGaussianBlur stdDeviation="2.2"/></filter>
 <filter id="${id}g"><feTurbulence baseFrequency=".9" numOctaves="1" seed="3"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .3  0 0 0 0 .25  0 0 0 .07 0"/></filter></defs>
 <rect width="300" height="420" fill="#fbf3e9"/><g filter="url(#${id}s)" fill="#f2b3b6" opacity=".75">${stripes}</g>
 <path d="${fill}" fill="#fbf5ec"/><rect width="300" height="420" filter="url(#${id}g)"/>
 <g fill="none" stroke="#b9362f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ink.join("")}<g transform="translate(150 250) scale(1.25) translate(-150 -272)">${c.join("")}</g></g></svg>`);
    return out.join("");
  }

  // 圣诞
  const RED = "#a8282d", CREAM = "#f6ead6", GRN = "#3f6e3c";
  const stripesBg = () => { let s = `<rect width="300" height="420" fill="${CREAM}"/>`; for (let x = 0; x < 300; x += 16) s += `<rect x="${x}" width="8" height="420" fill="${RED}"/>`; return s; };
  function treeSvg(cx, top, h) {
    let s = ""; for (let i = 0; i < 5; i++) { const y = top + i * h / 6, w = 14 + i * 13; s += `<path d="M${cx} ${y} L${cx - w} ${y + h / 4} q${w} 8 ${w * 2} 0z" fill="${i % 2 ? "#2f6a35" : "#3a7a3f"}"/>`; }
    for (let i = 0; i < 4; i++) { const y = top + 28 + i * 22, w = 18 + i * 12; s += `<path d="M${cx - w} ${y} q${w} 14 ${w * 2} -6" fill="none" stroke="#f2e3b8" stroke-width="1" stroke-dasharray="1.5 3"/>`; }
    return s;
  }
  function bowSvg(x, y, s, col, striped) {
    let g = `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 q-48 -34 -54 -6 q-2 20 54 6 q56 14 54 -6 q-6 -28 -54 6z" fill="${col}"/>
 <path d="M-3 2 q-8 12 -16 24 l7 -1 2 7 q6 -14 11 -30 M3 2 q8 12 16 24 l-7 -1 -2 7 q-6 -14 -11 -30z" fill="${col}"/><ellipse cx="0" cy="1" rx="7" ry="6" fill="${col}"/>`;
    if (striped) for (let i = -46; i < 48; i += 6) g += `<path d="M${i} -12 l${i < 0 ? 6 : -6} 14" stroke="${CREAM}" stroke-width="1.3" opacity=".7"/>`;
    return g + "</g>";
  }
  const amp = (x, y) => `<circle cx="${x}" cy="${y}" r="15" fill="${RED}"/><text x="${x}" y="${y + 7}" text-anchor="middle" fill="${CREAM}" font-family="'Playfair Display SC',Georgia,serif" font-size="20">&amp;</text>`;
  function xmas1Svg() {
    return `<svg class="cbg" viewBox="0 0 300 420">${stripesBg()}
 <path d="M150 52 q70 0 96 60 q20 60 0 200 q-10 50 -96 56 q-86 -6 -96 -56 q-20 -140 0 -200 q26 -60 96 -60z" fill="${CREAM}" stroke="${RED}" stroke-width="2"/>
 <path d="M150 62 q64 0 88 56 q18 56 0 192 q-10 44 -88 50 q-78 -6 -88 -50 q-18 -136 0 -192 q24 -56 88 -56z" fill="none" stroke="${RED}" stroke-width="1" stroke-dasharray="1 3"/>
 ${treeSvg(150, 168, 140)}<rect x="144" y="290" width="12" height="12" fill="#6b4a2e"/>${amp(150, 300)}</svg>`;
  }
  function xmas2Svg() {
    let s = `<svg class="cbg" viewBox="0 0 300 420"><rect width="300" height="420" fill="${GRN}"/>`;
    for (let y = 10; y < 420; y += 22) for (let x = (y / 22 % 2) * 11 + 6; x < 300; x += 22) s += `<circle cx="${x}" cy="${y}" r="1.6" fill="#f3e7cf" opacity=".85"/>`;
    const sc = inset => { const x0 = 40 + inset, x1 = 260 - inset, y0 = 96 + inset, y1 = 340 - inset, r = 13 - inset / 3, n = 6, m = 9; let d = `M${x0} ${y0}`;
      for (let i = 0; i < n; i++) d += ` a${r} ${r} 0 0 1 ${(x1 - x0) / n} 0`; for (let i = 0; i < m; i++) d += ` a${r} ${r} 0 0 1 0 ${((y1 - y0) / m).toFixed(2)}`;
      for (let i = 0; i < n; i++) d += ` a${r} ${r} 0 0 1 ${-(x1 - x0) / n} 0`; for (let i = 0; i < m; i++) d += ` a${r} ${r} 0 0 1 0 ${(-(y1 - y0) / m).toFixed(2)}`; return d + "z"; };
    s += `<path d="${sc(0)}" fill="${CREAM}" stroke="#d77f7a" stroke-width="3"/><path d="${sc(6)}" fill="none" stroke="${RED}" stroke-width="1"/>`;
    s += bowSvg(150, 98, 1.15, "#b2343a", true);
    s += `<path d="M134 162 q8 -8 16 0 q8 -8 16 0 M134 300 q8 8 16 0 q8 8 16 0" fill="none" stroke="${RED}" stroke-width="1.4"/></svg>`;
    return s;
  }
  function xmas3Svg() {
    const r = rng(5);
    let b = ""; for (let i = 0; i < 22; i++) { const x = 106 + i * 4.3, y = 161 - Math.sin(i / 21 * Math.PI) * 3; b += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${(6 + r() * 4).toFixed(1)} ${(-8 - r() * 6).toFixed(1)} M${x.toFixed(1)} ${y.toFixed(1)} l${(5 + r() * 4).toFixed(1)} ${(8 + r() * 6).toFixed(1)}" stroke="${i % 2 ? "#294f2a" : "#3d7a3c"}"/>`; }
    return `<svg class="cbg" viewBox="0 0 300 420">${stripesBg()}
 <path d="M44 74 h212 a12 12 0 0 0 12 12 v248 a12 12 0 0 0 -12 12 h-212 a12 12 0 0 0 -12 -12 v-248 a12 12 0 0 0 12 -12z" fill="${GRN}"/>
 <path d="M50 82 h200 a10 10 0 0 0 10 10 v236 a10 10 0 0 0 -10 10 h-200 a10 10 0 0 0 -10 -10 v-236 a10 10 0 0 0 10 -10z" fill="none" stroke="${CREAM}" stroke-width="1.3" stroke-dasharray="1 3.5"/>
 <g stroke="#2a4d29" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M104 162 q46 -8 96 -2"/>${b}</g>
 <path d="M150 160 v40" stroke="#e8a0a8" stroke-width="1.2"/><circle cx="150" cy="236" r="36" fill="#c0373c"/><rect x="142" y="196" width="16" height="8" rx="2" fill="#d8b46a"/>
 <path d="M116 228 q34 -10 68 0 M116 246 q34 10 68 0" stroke="${CREAM}" stroke-width="4" fill="none"/>
 <path d="M118 237 q32 6 64 0" stroke="#d8b46a" stroke-width="1.5" stroke-dasharray="2 3" fill="none"/>
 <path d="M134 214 q-6 8 -4 18" stroke="#fff" stroke-width="3" opacity=".4" fill="none" stroke-linecap="round"/>${amp(150, 290)}</svg>`;
  }
  function xmas4Svg() {
    const r = rng(9);
    let s = `<svg class="cbg" viewBox="0 0 300 420"><rect width="300" height="420" fill="#2f5a31"/>`;
    for (let y = -30; y < 450; y += 40) for (let x = -20; x < 320; x += 40) s += `<path d="M${x} ${y - 20} l20 20 -20 20 -20 -20z" fill="${((x + y) / 40) % 2 ? "#3a6d3a" : "#244a27"}"/>`;
    s += `<g stroke="#c0373c" stroke-width="1">`; for (let k = -420; k < 720; k += 40) s += `<path d="M${k} 0 l420 420M${k} 0 l-420 420"/>`; s += `</g>`;
    for (let y = 0; y < 440; y += 40) for (let x = 0; x < 320; x += 40) s += `<circle cx="${x}" cy="${y}" r="2.4" fill="${CREAM}"/><circle cx="${x + 20}" cy="${y + 20}" r="2.4" fill="${CREAM}"/>`;
    const R = 96, N = 28; let d2 = "";
    for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2; const x0 = 150 + Math.cos(a0) * R, y0 = 210 + Math.sin(a0) * R, x1 = 150 + Math.cos(a1) * R, y1 = 210 + Math.sin(a1) * R; d2 += (i ? "" : `M${x0.toFixed(1)} ${y0.toFixed(1)}`) + ` A9 9 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; }
    s += `<path d="${d2}z" fill="${CREAM}" stroke="#d77f7a" stroke-width="3"/><circle cx="150" cy="210" r="84" fill="none" stroke="#c0373c" stroke-width="1"/><g stroke-linecap="round" stroke-width="1.6">`;
    for (let i = 0; i < 150; i++) { const a = r() * Math.PI * 2, rr = 62 + r() * 12, x = 150 + Math.cos(a) * rr, y = 210 + Math.sin(a) * rr, t = a + Math.PI / 2 + (r() - .5); s += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${(Math.cos(t) * 9).toFixed(1)} ${(Math.sin(t) * 9).toFixed(1)}" stroke="${["#2d5e2e", "#3f7d3d", "#5a9150"][i % 3]}"/>`; }
    s += `</g>`;
    [[150, 138, .42], [96, 184, .34], [206, 186, .34], [104, 252, .34], [198, 256, .34], [150, 282, .36]].forEach(([x, y, k]) => { s += `<g transform="translate(${x} ${y}) scale(${k})" fill="none" stroke="#b2343a" stroke-width="4"><path d="M0 0 q-34 -26 -40 -4 q-2 14 40 4 q42 10 40 -4 q-6 -22 -40 4z M-3 2 q-10 18 -20 34 M3 2 q10 18 20 34"/><ellipse cx="0" cy="1" rx="6" ry="5"/></g>`; });
    return s + "</svg>";
  }

  /** 一张卡的 HTML（底图尺寸，外层自己缩放）；photoUrl：新年照片款的照片 */
  function cardHtml(style, f, date, photoUrl) {
    if (!STYLES[style]) style = "daily1";
    const id = "cd" + (idN++).toString(36);
    const d = date ? new Date(date) : new Date(); const y = d.getFullYear(), mo = d.getMonth(), dd = d.getDate(), wk = d.getDay();
    const v = k => val(style, f, k);
    switch (style) {
      case "daily1": return `<div class="card c-d1"><div class="tape-pink"></div><div class="rule" style="top:44px"></div>
        <div class="t f-ser" style="top:52px;font-size:17px;line-height:1.25">${MON_S[mo]}.${dd}/${y}<br>${WEEK_S[wk]}.</div>
        <div class="vt l f-pf">DAILY</div><div class="vt r f-pf">NOTE</div>
        <svg class="cbg" viewBox="0 0 300 420">${puppySit}</svg><div class="rule" style="top:194px"></div>
        <div class="txt f-hand" style="left:30px;right:24px;top:212px;font-size:21px;line-height:44px">${br(v("body"))}</div><div class="rule" style="bottom:22px"></div></div>`;
      case "daily2": return `<div class="card c-d1" style="background:#fffbf3"><div class="tape-pink"></div>
        <div class="rule" style="top:44px;height:2px;opacity:.9"></div>
        <div class="txt f-pf" style="left:24px;top:54px;font-size:13px">daily note</div><div class="txt f-pf" style="right:24px;top:54px;font-size:14px">${y}</div>
        <div class="txt f-pf" style="left:24px;top:88px;font-size:22px;font-weight:600">${MON[mo]}.</div>
        <div class="t f-pf" style="top:44px;font-size:76px;font-weight:600;line-height:1.1">${dd}</div>
        <div class="txt f-pf" style="right:24px;top:88px;font-size:22px;font-weight:600">${WEEK[wk]}</div>
        <div class="rule" style="top:134px;height:2px;opacity:.9"></div><div class="lines" style="top:150px;height:240px"></div>
        <div class="txt f-hand" style="left:30px;right:24px;top:152px;font-size:20px;line-height:34px">${br(v("body"))}</div>
        <svg class="cbg" viewBox="0 0 300 420">${puppyCup}</svg></div>`;
      case "missing": return `<div class="card c-kraft"><div class="tape-dot"></div>
        <svg class="cbg" viewBox="0 0 300 420"><g fill="none" stroke="#5b4330" stroke-width="1.4"><path d="M20 400 V70 L46 44 H254 L280 70 V400 Z"/><path d="M20 108 H280"/><path d="M20 372 H280"/></g>
        <g transform="translate(244 340)" fill="none" stroke="#7a6142" stroke-width="1.1" opacity=".75"><circle r="22"/><circle r="17" stroke-dasharray="2 2"/><path d="M-8 -2 q8 -12 16 0 q-8 12 -16 0z M0 -6 v12"/></g></svg>
        <div class="t f-pf" style="top:52px;font-size:15px;line-height:1.15;font-weight:600;letter-spacing:1px">${MON[mo]}.${dd}<br>${WEEK_L[wk]}<br>${y}</div>
        <div class="seal">${e(String(v("seal")).slice(0, 2))}</div>
        <div class="txt f-ser" style="left:34px;right:34px;top:170px;bottom:56px;font-size:13px;line-height:1.95;text-align:justify;overflow:hidden">${br(v("body"))}</div></div>`;
      case "season": {
        const S = SEASONS[seasonOf(d)];
        const body = (f && f.body) || S.def;
        return `<div class="card c-ss" style="background:${S.bg};color:${S.ink}"><div class="ss-head"><b class="f-pf">${S.en}</b><span class="f-ser">- ${S.zh} -</span></div>
        <div class="tape-dot2"></div><div class="ss-bar f-pf"><i>${y}</i><i>${S.q}</i><i>Memory</i></div>
        <div class="ss-tab" style="background:${S.tab}"></div><div class="ss-paper"><div class="f-ser" style="color:${S.ink}">${br(body)}</div></div>
        <svg class="cbg" viewBox="0 0 300 420"><g transform="translate(62 162)"><circle r="24" fill="none" stroke="currentColor" stroke-width="1.6"/><circle r="20" fill="none" stroke="currentColor" stroke-width=".7"/><g transform="scale(.9)">${SEASON_ICON[S.ic]}</g></g>
        <g fill="none" stroke="currentColor" stroke-width="1" opacity=".55"><path d="M94 154 q8 -4 16 0 t16 0 t16 0"/><path d="M94 160 q8 -4 16 0 t16 0 t16 0"/><path d="M94 166 q8 -4 16 0 t16 0 t16 0"/></g>
        <g transform="translate(34 300)"><rect width="38" height="70" fill="${S.cal}"/><g font-family="Arial" font-weight="700" font-size="11" fill="#222" text-anchor="middle"><text x="19" y="15">${WEEK[(wk + 6) % 7]}</text><text x="19" y="38">${WEEK[wk]}</text><text x="19" y="61">${WEEK[(wk + 1) % 7]}</text></g><path d="M3 22h32M3 45h32" stroke="#222" stroke-width="1"/><rect x="2" y="25" width="34" height="18" fill="none" stroke="#222" stroke-width="1.6"/></g></svg>
        <div class="ss-band" style="--b:${S.band}"></div><div class="ss-buckle"><svg width="16" height="14" viewBox="0 0 24 22"><path d="M12 20 C4 14 1 10 1 6 a5.5 5.5 0 0 1 11 -1 a5.5 5.5 0 0 1 11 1 c0 4 -3 8 -11 14z" fill="none" stroke="#888" stroke-width="2"/></svg></div>
        <div class="ss-foot f-pf">Seasons · Letter</div></div>`;
      }
      case "birthday": return `<div class="card">${cakeSvg(id)}<div class="t f-geo" style="top:52px;font-size:30px;color:#d8798a">Happy Birthday</div>
        <div class="t f-ser" style="top:94px;font-size:15px;color:#b88a7c;letter-spacing:6px">生日快乐</div>
        <div class="t f-ser" style="bottom:42px;font-size:13px;color:#b88a7c">${e(v("line"))}</div></div>`;
      case "ny_photo": return `<div class="card wide" style="background:#fff"><svg class="cbg" viewBox="0 0 420 300"><circle cx="0" cy="0" r="78" fill="#8f1620"/><circle cx="420" cy="300" r="96" fill="#8f1620"/><path d="M96 30 H300" stroke="#8f1620"/>
        ${photoUrl ? "" : `<rect x="52" y="44" width="300" height="168" fill="#f1dadb"/><g fill="#c99da1" opacity=".8"><circle cx="202" cy="116" r="16"/><path d="M150 190 l38 -40 30 26 22 -18 46 32z"/></g>`}
        <g fill="none" stroke="#8f1620"><circle cx="58" cy="268" r="4"/><circle cx="70" cy="268" r="4"/><circle cx="82" cy="268" r="4"/></g><g fill="#8f1620"><circle cx="58" cy="268" r="1.6"/><circle cx="70" cy="268" r="1.6"/><circle cx="82" cy="268" r="1.6"/></g></svg>
        ${photoUrl ? `<img class="ny-photo" src="${e(photoUrl)}" alt="">` : ""}
        <div class="txt f-cg" style="right:20px;top:18px;font-size:15px;color:#8f1620">Lunar New Year</div>
        <div class="txt f-scr" style="left:40px;top:178px;font-size:58px;color:#8f1620;line-height:1">Happy new year</div>
        <div class="txt f-ser" style="right:112px;top:254px;font-size:8.5px;color:#8f1620;text-align:right;line-height:1.5;width:170px">${br(v("line"))}</div></div>`;
      case "ny_text": return `<div class="card wide" style="background:#fff"><svg class="cbg" viewBox="0 0 420 300"><circle cx="0" cy="0" r="78" fill="#8f1620"/><circle cx="420" cy="300" r="96" fill="#8f1620"/><path d="M96 30 H300 M132 274 H330" stroke="#8f1620"/>
        <g fill="none" stroke="#8f1620"><circle cx="198" cy="196" r="4"/><circle cx="210" cy="196" r="4"/><circle cx="222" cy="196" r="4"/></g><g fill="#8f1620"><circle cx="198" cy="196" r="1.6"/><circle cx="210" cy="196" r="1.6"/><circle cx="222" cy="196" r="1.6"/></g></svg>
        <div class="txt f-cg" style="right:20px;top:18px;font-size:15px;color:#8f1620">Lunar New Year</div><div class="txt f-cg" style="left:20px;bottom:16px;font-size:15px;color:#8f1620">${mo >= 9 ? y + 1 : y}</div>
        <div class="t f-scr" style="top:96px;font-size:64px;color:#8f1620;line-height:1">Happy new year</div>
        <div class="t f-ser" style="top:168px;font-size:10px;color:#8f1620;letter-spacing:3px">${e(v("line"))}</div></div>`;
      case "valentine": return `<div class="card">${valentineSvg(id)}
        <div class="t f-fell" style="top:100px;font-size:33px;color:#b9362f;transform:rotate(-4deg)">Valentine’s Day</div>
        <div class="t f-fell" style="top:142px;font-size:12px;color:#c4584d;transform:rotate(-4deg);padding:0 30px">${e(v("quote"))}</div>
        <div class="t f-fell" style="top:344px;font-size:14px;color:#b9362f;transform:rotate(-2deg);padding:0 30px">${e(v("bottom"))}</div></div>`;
      case "xmas1": return `<div class="card">${xmas1Svg()}<div class="t f-psc" style="top:92px;font-size:27px;color:${RED};line-height:1">Merry<br>Christmas</div>
        <div class="t f-psc" style="top:324px;font-size:13px;color:${RED};letter-spacing:1px">Happy New Year</div></div>`;
      case "xmas2": return `<div class="card">${xmas2Svg()}<div class="t f-cg" style="top:178px;font-size:20px;color:#9b2a2e;line-height:1.5;font-weight:500">Wishing You<br>A Very Merry Christmas<br>And Happy New Year</div>
        <div class="t f-ser" style="top:286px;font-size:11px;color:#9b2a2e;letter-spacing:3px">${e(v("line"))}</div></div>`;
      case "xmas3": return `<div class="card">${xmas3Svg()}<div class="t f-psc" style="top:104px;font-size:26px;color:${CREAM}">Merry</div><div class="t f-psc" style="top:298px;font-size:26px;color:${CREAM}">Bright</div></div>`;
      case "xmas4": return `<div class="card">${xmas4Svg()}<div class="t f-psc" style="top:186px;font-size:21px;color:${RED};line-height:1.15;font-weight:700">Holly<br>Jolly</div></div>`;
    }
    return "";
  }
  /** 缩放后的卡片：w 是显示宽度 */
  function cardBox(style, f, date, w, photoUrl) {
    const wide = STYLES[style] && STYLES[style].wide; const bw = wide ? 420 : 300, bh = wide ? 300 : 420; const k = w / bw;
    return `<div class="card-box" style="width:${w}px;height:${Math.round(bh * k)}px"><div class="card-scale" style="transform:scale(${k})">${cardHtml(style, f, date, photoUrl)}</div></div>`;
  }
  /** AI 写的款式名 → key */
  function styleByName(s) {
    s = String(s || "").trim(); if (!s) return null;
    if (STYLES[s]) return s;
    for (const k of ORDER) { const st = STYLES[k]; if (s.includes(st.name) || st.name.includes(s)) return k; }
    for (const k of ORDER) if (s.includes(STYLES[k].occ)) return k;
    return null;
  }
  const mainField = style => (STYLES[style] && STYLES[style].fields[0] && STYLES[style].fields[0].k) || null;
  return { STYLES, ORDER, cardHtml, cardBox, styleByName, mainField, seasonOf, SEASONS };
})();
