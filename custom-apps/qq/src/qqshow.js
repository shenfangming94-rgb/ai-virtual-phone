/* QQ秀像素小人（她定稿的那版：_ideas/qq/qqshow/pixexp3.png）。window.qqpix / qqstage / drawPix */
/* QQ秀像素小人：每一格直接点在 40×76 的格子上，分层叠（翅膀→后发→身体→衣服→脸→前发→饰品），最后自动描一圈深色边 */
(function () {
  const W = 40, H = 76;
  const SK = "#ffe0cc", SK2 = "#f6c2a6", LASH = "#2b1b24", MOUTH = "#f0607e", BLUSH = "#ffa8bb";
  const dk = (hex, k) => { let h = hex.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join(""); const n = parseInt(h, 16); const f = c => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k))); return "#" + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(x => x.toString(16).padStart(2, "0")).join(""); };

  function Pix(w = W, h = H) { const g = Array.from({ length: h }, () => Array(w).fill(null));
    const P = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h && c) g[y][x] = c; };
    return { g, P,
      R: (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(x + i, y + j, c); },
      E: (cx, cy, rx, ry, c) => { for (let y = Math.floor(cy - ry); y <= cy + ry + .5; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) P(x, y, c); },
      // 一行一行给左右边界：rows = [[y, x0, x1], ...]
      S: (rows, c) => rows.forEach(([y, a, b]) => { for (let x = a; x <= b; x++) P(x, y, c); }),
      M: (map, ox, oy, pal) => map.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch]) P(ox + i, oy + j, pal[ch]); })) };
  }
  // 人体（头中心 x=19.5）
  const head = (p) => { p.S([[6, 14, 25], [7, 12, 27], [8, 11, 28], [9, 11, 28], [10, 10, 29], [11, 10, 29], [12, 10, 29], [13, 10, 29], [14, 10, 29], [15, 10, 29], [16, 10, 29], [17, 11, 28], [18, 11, 28], [19, 12, 27], [20, 13, 26], [21, 14, 25], [22, 16, 23]], SK); p.R(17, 23, 6, 3, SK2); };
  const eyes = (p, eye, g, ex = "open") => {
    const lid = (x, s, shape) => { // 闭眼类：弯弯的线
      if (shape === "happy") { p.P(x, 17, LASH); p.R(x + 1, 16, 2, 1, LASH); p.P(x + 3, 17, LASH); }
      else { p.P(x, 16, LASH); p.R(x + 1, 17, 2, 1, LASH); p.P(x + 3, 16, LASH); }
      if (g === "f") p.P(s < 0 ? x - 1 : x + 4, shape === "happy" ? 17 : 16, LASH); p.R(x + (s < 0 ? -1 : 1), 12, 4, 1, g === "f" ? "#7a5040" : "#3a2620"); };
    if (ex === "happy" || ex === "closed") { lid(13, -1, ex === "happy" ? "happy" : "down"); lid(23, 1, ex === "happy" ? "happy" : "down"); return; }
    if (ex === "wink") { lid(23, 1, "happy"); }
    const one = (x, s) => {
      p.R(x, 15, 4, 1, LASH); p.R(x + (s < 0 ? -1 : 1), 14, 4, 1, null);
      if (g === "f") { p.P(s < 0 ? x - 1 : x + 4, 14, LASH); p.P(s < 0 ? x - 1 : x + 4, 15, LASH); p.P(s < 0 ? x - 2 : x + 5, 13, LASH); }
      p.R(x, 16, 4, 3, eye); p.R(x + 1, 16, 2, 2, dk(eye, -.5)); p.R(x, 18, 4, 1, dk(eye, .35));
      p.P(x + 2, 16, "#fff"); p.P(x + 1, 18, "#fff");
      p.P(x - (s < 0 ? 0 : 0), 16, dk(eye, -.25)); p.P(x + 3, 16, dk(eye, -.25));
      if (g === "f") p.R(x, 19, 4, 1, dk(SK2, -.05));
      p.R(x + (s < 0 ? -1 : 1), 12, 4, 1, g === "f" ? "#7a5040" : "#3a2620"); if (g !== "f") p.R(x + (s < 0 ? -1 : 1), 13, 4, 1, null); };
    one(13, -1); if (ex !== "wink") one(23, 1);
    if (ex === "wide") { for (const x of [13, 23]) { p.R(x, 14, 4, 1, null); p.P(x + 1, 17, "#fff"); } }
    if (ex === "shy") { for (const x of [13, 23]) p.R(x, 15, 4, 1, LASH); for (const x of [13, 23]) p.R(x, 16, 4, 1, LASH); } };
  const mouth = (p, g, m = "smile") => { const C = g === "f" ? MOUTH : "#c27a6a", D = "#9a3048";
    p.P(19, 19, SK2);
    if (m === "grin") { p.R(18, 21, 4, 1, D); p.R(19, 22, 2, 1, "#ff9aa8"); p.P(18, 21, D); p.R(18, 21, 4, 1, "#fff"); p.R(18, 22, 4, 1, D); p.R(19, 22, 2, 1, "#ff8a9a"); return; }
    if (m === "o") { p.R(19, 21, 2, 2, D); return; }
    if (m === "pout") { p.R(19, 21, 2, 1, C); p.P(20, 22, C); return; }
    if (m === "cat") { p.P(18, 21, C); p.P(19, 22, C); p.P(20, 22, C); p.P(21, 21, C); return; }
    if (m === "flat") { p.R(18, 21, 4, 1, dk(C, .2)); return; }
    if (g === "f") { p.R(19, 21, 2, 1, C); p.P(18, 20, dk(C, .3)); p.P(21, 20, dk(C, .3)); } else { p.P(18, 20, C); p.R(19, 21, 2, 1, C); p.P(21, 20, C); } };
  const blush = (p, g, more) => { const c = g === "f" || more ? BLUSH : "#ffd0c4"; p.R(12, 20, 2, 1, c); p.R(26, 20, 2, 1, c); if (more) { p.R(11, 19, 3, 1, c); p.R(26, 19, 3, 1, c); p.P(12, 19, "#fff"); p.P(27, 19, "#fff"); } };
  const body = (p, g) => {
    const arm = x => { p.S([[27, x, x + 1], [28, x, x + 1], [29, x, x + 1], [30, x, x + 1], [31, x, x + 1], [32, x, x + 1], [33, x, x + 1], [34, x, x + 1], [35, x, x + 1], [36, x, x + 1], [37, x, x + 1], [38, x, x + 1], [39, x, x + 1], [40, x, x + 1], [41, x, x + 1]], SK); p.R(x, 42, 2, 2, SK); };
    arm(g === "f" ? 12 : 11); arm(g === "f" ? 26 : 27);
    p.S([[26, 14, 25], [27, 14, 25], [28, 14, 25], [29, 15, 24], [30, 15, 24], [31, 15, 24], [32, 15, 24], [33, 15, 24], [34, 15, 24], [35, 15, 24], [36, 14, 25], [37, 14, 25], [38, 14, 25], [39, 14, 25], [40, 14, 25]], SK);
    legs(p, (x, y, w, side) => { p.R(x, y, w, 1, SK); p.P(side < 0 ? x + w - 1 : x, y, SK2); });
  };
  /** 腿的形状：每一行左右腿各多宽；f(x, y, 宽, 左-1/右1) 负责涂 */
  // 她挑的那版：大腿并拢，膝盖往下两腿分开一格，细长
  const LEGW = y => y < 46 ? 4 : y < 52 ? 4 : y < 55 ? 3 : y < 59 ? 3 : y < 64 ? 3 : 2;
  function legs(p, f) { for (let y = 41; y < 70; y++) { const w = LEGW(y), gap = y < 52 ? 0 : 1; f(20 - gap - w, y, w, -1); f(20 + gap, y, w, 1); } }
  // 头发
  const HAIR = {
    wavy: { back: (p, c) => { p.E(19.5, 13, 11.5, 10, c); p.S(Array.from({ length: 24 }, (_, i) => [20 + i, 7 + (i % 6 < 3 ? 0 : 1), 11]), c); p.S(Array.from({ length: 24 }, (_, i) => [20 + i, 28, 32 - (i % 6 < 3 ? 0 : 1)]), c); p.S([[20, 12, 13], [21, 12, 13], [20, 26, 27], [21, 26, 27]], c); },
      front: (p, c, noSide) => { const hi = dk(c, .4), lo = dk(c, -.25); p.S([[3, 15, 24], [4, 12, 27], [5, 10, 29], [6, 9, 30], [7, 9, 30], [8, 9, 30], [9, 9, 12], [9, 15, 30], [10, 9, 11], [10, 18, 30], [11, 9, 10], [11, 22, 30], [12, 9, 10], [12, 25, 30], [13, 9, 10], [13, 27, 30], [14, 28, 30]], c);
        p.R(14, 4, 7, 1, hi); p.R(12, 5, 3, 1, hi); p.P(24, 5, hi); p.R(26, 7, 2, 1, lo); if (noSide) return; p.R(9, 14, 2, 10, c); p.R(29, 14, 2, 10, c); for (let y = 16; y < 44; y += 4) { p.P(8, y, hi); p.P(31, y + 2, hi); p.P(10, y + 1, lo); p.P(29, y + 3, lo); } } },
    spiky: { back: (p, c) => { p.E(19.5, 12, 11, 9, c); },
      front: (p, c) => { const hi = dk(c, .35); p.S([[11, 9, 13], [12, 9, 12], [13, 9, 11], [14, 9, 10]], c); p.S([[2, 16, 23], [3, 12, 27], [4, 10, 29], [5, 9, 30], [6, 9, 30], [7, 9, 30], [8, 9, 30], [9, 9, 30], [10, 9, 12], [10, 14, 16], [10, 19, 21], [10, 24, 26], [10, 28, 30], [11, 9, 11], [11, 15, 15], [11, 20, 20], [11, 25, 25], [11, 29, 30], [12, 9, 10], [12, 29, 30], [13, 9, 10], [13, 29, 30], [14, 9, 10], [14, 29, 30], [15, 9, 9], [15, 30, 30]], c); p.R(15, 3, 8, 1, hi); p.R(12, 4, 3, 1, hi); p.P(13, 9, hi); p.P(23, 9, hi); } },
  };
  // 衣服
  const OUT = {
    angel: p => { const W1 = "#ffffff", W2 = "#e6ecf7", PK = "#ffb6cc", PK2 = "#ff86ad";
      p.S([[26, 13, 26], [27, 13, 26], [28, 14, 25], [29, 15, 24], [30, 15, 24], [31, 15, 24], [32, 15, 24], [33, 15, 24], [34, 15, 24]], W1);
      p.R(11, 26, 4, 3, W1); p.R(25, 26, 4, 3, W1); p.P(11, 28, W2); p.P(28, 28, W2);
      p.R(15, 35, 10, 2, PK); p.R(18, 35, 4, 2, PK2); p.P(17, 34, PK2); p.P(22, 34, PK2); p.P(17, 37, PK2); p.P(22, 37, PK2);
      for (let y = 37; y < 52; y++) { const s = Math.round((y - 37) * .55); p.R(15 - s, y, 10 + 2 * s, 1, W1); p.P(15 - s, y, W2); p.P(24 + s, y, W2); }
      for (let x = 7; x < 33; x += 2) p.P(x, 52, W1); p.R(9, 45, 22, 1, W2); p.R(11, 41, 18, 1, "#f2f5fb");
      p.P(19, 27, "#bfe3ff"); p.P(20, 27, "#bfe3ff"); p.R(16, 26, 1, 1, W2); p.R(23, 26, 1, 1, W2);
      // 白色及膝袜 + 黑色玛丽珍鞋
      legs(p, (x, y, w, side) => { if (y >= 57) { p.R(x, y, w, 1, y === 57 ? PK : W1); if (y > 57) p.P(side < 0 ? x + w - 1 : x, y, W2); } });
      p.R(15, 70, 4, 2, "#2d2230"); p.R(21, 70, 4, 2, "#2d2230"); p.P(14, 71, "#2d2230"); p.P(25, 71, "#2d2230"); p.P(16, 70, "#5a4a60"); p.P(22, 70, "#5a4a60"); p.R(16, 69, 2, 1, "#2d2230"); p.R(22, 69, 2, 1, "#2d2230"); },
    uniform: p => { const B = "#2f6fc6", B2 = "#245aa6", WH = "#ffffff";
      p.S([[26, 12, 27], [27, 11, 28], [28, 11, 28]], B); for (let y = 29; y < 44; y++) p.R(11, y, 18, 1, B); p.R(10, 29, 2, 13, B); p.R(28, 29, 2, 13, B);
      p.R(18, 26, 4, 4, WH); p.P(17, 26, WH); p.P(22, 26, WH); p.R(19, 30, 1, 14, B2); p.R(12, 27, 1, 16, WH); p.R(27, 27, 1, 16, WH); p.R(10, 39, 2, 1, WH); p.R(28, 39, 2, 1, WH);
      for (let y = 44; y < 70; y++) { const sp = y < 52 ? 0 : 1; p.R(15, y, 5 - sp, 1, B); p.R(20 + sp, y, 5 - sp, 1, B); p.P(15, y, WH); p.P(24, y, WH); p.P(y < 52 ? 19 : 18, y, B2); p.P(y < 52 ? 20 : 21, y, B2); }
      p.R(13, 70, 7, 3, WH); p.R(20, 70, 7, 3, WH); p.R(13, 72, 7, 1, "#e34b4b"); p.R(20, 72, 7, 1, "#e34b4b"); p.R(14, 70, 2, 1, "#c7d0dc"); p.R(24, 70, 2, 1, "#c7d0dc"); },
  };
  const WINGS = {
    angel: p => { const W1 = "#ffffff", W2 = "#dfe7f5", W3 = "#c3d1ea";
        for (const s of [-1, 1]) { const ox = 19.5 + s * 9;
          // 上缘一条弧，下面三排越来越短的圆羽毛，最下面一排颜色深一点
          const rows = [[0, 9, 2.6, W1], [1, 8, 2.4, W1], [2, 6, 2.2, W2], [3, 4, 2, W3]];
          for (const [r, n, rr, col] of rows) for (let i = 0; i < n; i++) { const x = ox + s * (2 + i * 1.6), y = 24 + r * 4 - Math.round(Math.sin((i / 9) * Math.PI) * 5) + i * .3; p.E(x, y, rr, rr * 1.2, col); }
          for (let i = 0; i < 10; i++) p.P(ox + s * (2 + i * 1.5), 21 - Math.round(Math.sin((i / 10) * Math.PI) * 5), W1); } },
  };
  const ACC = {
    halo: p => { p.R(15, 0, 10, 1, "#ffe27a"); p.P(14, 1, "#ffe27a"); p.P(25, 1, "#ffe27a"); p.R(15, 2, 10, 1, "#ffcf3a"); },
    bow: p => { p.M(["XX.XX", "XXOXX", "XX.XX"], 25, 4, { X: "#ff8fb7", O: "#ff4f8e" }); },
  };

  // ───────────── 衣柜：工具 ─────────────
  // 身体每一行的左右边（女生 / 男生），衣服沿着它画
  const SPAN = (g, y) => g === "m" ? (y < 29 ? [11, 28] : [11, 28]) : (y < 29 ? [14, 25] : y < 36 ? [15, 24] : [14, 25]);
  const ARMX = g => g === "m" ? [11, 27] : [12, 26];
  /** 上衣：从 y0 画到 y1，袖长 sl 行（0 = 无袖），边上一列暗色当褶 */
  function top(p, g, c, y1, sl = 6, y0 = 26) { const d = dk(c, -.18);
    for (let y = y0; y <= y1; y++) { const [a, b] = SPAN(g, y); p.R(a, y, b - a + 1, 1, c); p.P(b, y, d); }
    if (sl) for (const x of ARMX(g)) { p.R(x, 26, 2, sl + 1, c); p.P(x + 1, 26 + sl, d); } }
  /** 裙子：从 y0 到 y1，往外张 flare（每行多张几格），下摆一行 hem 色 */
  function skirt(p, y0, y1, c, flare = .5, hem) { const d = dk(c, -.15);
    for (let y = y0; y <= y1; y++) { const s = Math.round((y - y0) * flare); p.R(15 - s, y, 10 + 2 * s, 1, c); p.P(24 + s, y, d); if ((y - y0) % 3 === 2) p.P(19, y, d); }
    if (hem) { const s = Math.round((y1 - y0) * flare); p.R(15 - s, y1 + 1, 10 + 2 * s, 1, hem); } }
  /** 裤子 / 打底：沿着腿形，从 y0 到 y1 */
  function pants(p, y0, y1, c, seam = true) { const d = dk(c, -.2); legs(p, (x, y, w, s) => { if (y >= y0 && y <= y1) { p.R(x, y, w, 1, c); if (seam) p.P(s < 0 ? x + w - 1 : x, y, d); } }); }
  /** 鞋：mary 玛丽珍 / boots 靴子 / sneaker 球鞋 / flat 平底 / geta 木屐 */
  function shoes(p, kind, c) { const d = dk(c, -.3), l = dk(c, .35);
    if (kind === "boots") { pants(p, 60, 69, c, false); p.R(14, 70, 6, 2, c); p.R(21, 70, 6, 2, c); p.P(15, 61, l); p.P(22, 61, l); return; }
    if (kind === "sneaker") { p.R(14, 69, 6, 3, "#fff"); p.R(20, 69, 6, 3, "#fff"); p.R(14, 71, 6, 1, c); p.R(20, 71, 6, 1, c); p.P(16, 69, c); p.P(23, 69, c); return; }
    if (kind === "geta") { p.R(15, 70, 4, 1, SK); p.R(21, 70, 4, 1, SK); p.R(14, 71, 6, 1, c); p.R(20, 71, 6, 1, c); p.P(15, 72, d); p.P(18, 72, d); p.P(21, 72, d); p.P(24, 72, d); p.P(16, 70, "#e34b4b"); p.P(22, 70, "#e34b4b"); return; }
    p.R(15, 70, 4, 2, c); p.R(21, 70, 4, 2, c); p.P(14, 71, c); p.P(25, 71, c); p.P(16, 70, l); p.P(22, 70, l); if (kind === "mary") { p.R(16, 69, 2, 1, c); p.R(22, 69, 2, 1, c); } }
  function socks(p, y0, c, top2) { legs(p, (x, y, w, s) => { if (y >= y0 && y < 70) { p.R(x, y, w, 1, y === y0 && top2 ? top2 : c); if (y > y0) p.P(s < 0 ? x + w - 1 : x, y, dk(c, -.1)); } });
    for (let y = Math.max(y0, 52); y < 70; y++) p.P(19, y, dk(c, -.28)); } // 两腿中间那格涂成袜子的阴影，不然描边会把它描成一条深色线
  const bowAt = (p, x, y, c) => p.M(["X.X", "XOX", "X.X"], x - 1, y - 1, { X: c, O: dk(c, -.3) });

  // ───────────── 女生衣服 ─────────────
  Object.assign(OUT, {
    lolita: (p, g) => { const PK = "#ffb3cf", W1 = "#fff";
      top(p, g, PK, 37, 2); p.R(11, 26, 4, 3, W1); p.R(25, 26, 4, 3, W1); p.R(16, 26, 8, 1, W1); bowAt(p, 19.5, 29, "#ff6f9f");
      for (let y = 30; y < 37; y += 2) p.P(19, y, W1);
      skirt(p, 38, 50, PK, .6); for (let x = 8; x < 32; x++) if (x % 2) p.P(x, 51, W1); p.R(9, 47, 22, 1, W1); p.R(10, 43, 20, 1, dk(PK, .3));
      socks(p, 56, W1, "#ff8fb7"); bowAt(p, 17, 57, "#ff6f9f"); bowAt(p, 22, 57, "#ff6f9f"); shoes(p, "mary", "#ff7aa6"); },
    overalls: (p, g) => { const D = "#5b86c6", T = "#fff4c9";
      top(p, g, T, 34, 3); p.R(16, 26, 1, 10, D); p.R(23, 26, 1, 10, D); p.R(16, 34, 8, 7, D); p.R(18, 36, 4, 3, dk(D, -.15)); p.P(16, 29, "#ffd36b"); p.P(23, 29, "#ffd36b");
      p.R(14, 41, 12, 3, D); pants(p, 44, 66, D); legs(p, (x, y, w) => { if (y === 66) p.R(x, y, w, 1, dk(D, .3)); }); shoes(p, "sneaker", "#ff7aa6"); },
    sweater: (p, g) => { const C = "#f4e7cf", R = "#c43b4a", K = "#2b2430";
      top(p, g, C, 40, 15); for (let y = 28; y < 40; y += 3) for (let x = 15; x < 25; x += 2) p.P(x + (y % 2), y, dk(C, -.08)); p.R(16, 26, 8, 1, dk(C, -.12));
      for (const x of ARMX(g)) p.R(x, 41, 2, 1, dk(C, -.15));
      skirt(p, 41, 49, R, .35); for (let y = 41; y <= 49; y++) { const s = Math.round((y - 41) * .35); for (let x = 15 - s; x <= 24 + s; x += 3) p.P(x, y, "#1e2a5a"); if (y % 3 === 0) p.R(15 - s, y, 10 + 2 * s, 1, dk(R, -.2)); }
      pants(p, 50, 69, K, false); shoes(p, "boots", "#7a4a2c"); },
    tunic: (p, g) => { const PK = "#ffc3d8", K = "#2a2430";
      top(p, g, PK, 40, 15); skirt(p, 41, 48, PK, .25); p.R(17, 26, 6, 2, "#fff"); p.P(19, 28, "#fff"); p.P(20, 28, "#fff");
      for (const [x, y] of [[17, 32], [22, 36], [16, 44], [23, 46], [19, 40]]) { p.P(x, y, "#fff"); p.P(x + 1, y, "#ff8fb7"); }
      pants(p, 49, 69, K, false); shoes(p, "flat", "#fff"); },
    gothic: (p, g) => { const K = "#221a26", PU = "#7a4fa8", L = "#3a2e40";
      top(p, g, K, 37, 15); p.R(16, 26, 8, 1, PU); p.R(19, 29, 2, 1, "#c9c2d6"); p.P(19, 28, "#c9c2d6"); p.P(19, 30, "#c9c2d6"); p.P(20, 31, "#c9c2d6");
      skirt(p, 38, 52, K, .55); for (let x = 7; x < 33; x++) if (x % 2 === 0) p.P(x, 53, PU); p.R(9, 48, 22, 1, L); p.R(11, 43, 18, 1, L); bowAt(p, 19.5, 38, PU);
      socks(p, 54, "#1a1420"); shoes(p, "boots", "#1a1420"); },
    yukata: (p, g) => { const PK = "#ffd2e2", OB = "#d6456a", FL = "#ff8fb0";
      top(p, g, PK, 66, 0); for (const x of ARMX(g)) { p.R(x - 1, 27, 3, 12, PK); p.P(x - 1, 38, dk(PK, -.15)); }
      for (let y = 41; y <= 66; y++) { p.R(15, y, 10, 1, PK); } p.R(14, 34, 12, 5, OB); p.R(14, 36, 12, 1, dk(OB, .3)); p.R(24, 33, 3, 7, OB);
      for (let y = 26; y < 34; y++) p.P(19 + Math.round((y - 26) * .25), y, dk(PK, -.2)); for (let y = 39; y <= 66; y++) p.P(21, y, dk(PK, -.2));
      for (const [x, y] of [[16, 29], [22, 44], [17, 52], [23, 58], [16, 62], [20, 48]]) p.M([".X.", "XOX", ".X."], x - 1, y - 1, { X: FL, O: "#fff7a0" });
      shoes(p, "geta", "#8a5a3a"); },
    xmas: (p, g) => { const R = "#d8323f", W1 = "#fff";
      top(p, g, R, 37, 15); for (const x of ARMX(g)) p.R(x, 41, 2, 2, W1); p.R(16, 26, 8, 2, W1); for (let y = 29; y < 37; y += 3) p.P(19, y, "#ffd36b");
      skirt(p, 38, 48, R, .5); const s = Math.round(10 * .5); p.R(15 - s, 49, 10 + 2 * s, 2, W1); p.R(14, 37, 12, 1, "#2b2430"); p.P(19, 37, "#ffd36b");
      socks(p, 56, W1); shoes(p, "boots", R); },
  });
  // ───────────── 男生衣服 ─────────────
  Object.assign(OUT, {
    hoodie: (p, g) => { const C = "#9a8ade", J = "#5d86c4";
      top(p, g, C, 44, 15); p.R(16, 26, 8, 2, dk(C, -.15)); p.P(18, 28, "#fff"); p.P(21, 28, "#fff"); p.P(18, 29, "#fff"); p.P(21, 29, "#fff"); p.R(15, 36, 10, 5, dk(C, -.08));
      pants(p, 45, 69, J); shoes(p, "sneaker", "#e34b4b"); },
    shirt: (p, g) => { const W1 = "#fbfcff", T = "#c43b4a", K = "#2b2a33";
      top(p, g, W1, 44, 15); for (let y = 27; y < 44; y++) p.P(19, y, "#e3e8f2"); p.R(17, 26, 2, 1, "#e3e8f2"); p.R(21, 26, 2, 1, "#e3e8f2");
      p.R(19, 27, 2, 1, T); for (let y = 28; y < 38; y++) p.R(19, y, 2, 1, T); p.P(19, 38, T); for (let y = 29; y < 38; y += 3) p.P(20, y, dk(T, -.2));
      pants(p, 45, 69, K); shoes(p, "flat", "#2b2024"); },
    basketball: (p, g) => { const R = "#d8323f", W1 = "#fff";
      top(p, g, R, 44, 0); p.R(16, 26, 8, 1, W1); p.P(15, 27, W1); p.P(24, 27, W1); p.M(["XXX.XXX", "..X...X", "XXX..XX", "X.....X", "XXX.XXX"], 16, 31, { X: W1 });
      for (const x of ARMX(g)) p.R(x, 38, 2, 2, W1);
      pants(p, 45, 54, R); legs(p, (x, y, w) => { if (y === 54) p.R(x, y, w, 1, W1); }); socks(p, 62, W1, R); shoes(p, "sneaker", "#2b2a33"); },
    leather: (p, g) => { const K = "#1e1d24", T = "#fff", J = "#3b4a6a";
      top(p, g, K, 44, 15); p.R(17, 26, 6, 14, T); p.R(16, 26, 1, 4, dk(K, .25)); p.R(23, 26, 1, 4, dk(K, .25)); for (let y = 30; y < 44; y += 2) p.P(16, y, "#b8bcc8"); p.P(13, 32, "#b8bcc8");
      pants(p, 45, 69, J); shoes(p, "boots", "#2a1e18"); },
    sailor: (p, g) => { const N = "#2a3f7a", W1 = "#fff", KH = "#d9c49a";
      top(p, g, W1, 44, 8); for (let y = 27; y < 45; y += 2) { const [a, b] = SPAN(g, y); p.R(a, y, b - a + 1, 1, N); } for (const x of ARMX(g)) for (let y = 27; y < 34; y += 2) p.R(x, y, 2, 1, N);
      pants(p, 45, 66, KH); legs(p, (x, y, w) => { if (y === 66) p.R(x, y, w, 1, dk(KH, -.15)); }); shoes(p, "sneaker", N); },
    devil: (p, g) => { const K = "#24172e", PU = "#8a3fbf";
      top(p, g, K, 44, 15); p.R(16, 26, 8, 2, PU); p.R(19, 28, 2, 8, PU); for (const x of ARMX(g)) p.R(x, 41, 2, 1, PU);
      pants(p, 45, 69, "#2e2238"); shoes(p, "boots", "#140c18"); },
  });
  // 女生校服她不要：uniform 只给男生用
  // ───────────── 翅膀 ─────────────
  WINGS.devil = p => { const K = "#2e1838", L = "#6a3f80", B = "#8a5aa0";
    for (const sd of [-1, 1]) { const ox = 19.5 + sd * 7;
      for (let i = 0; i <= 14; i++) { const x = ox + sd * i, top2 = 24 - Math.round(Math.sin(i / 14 * Math.PI * .9) * 9);
        const k = i % 5, bot = 34 - Math.round(i * .5) - (k === 0 ? 0 : k === 1 || k === 4 ? 2 : 3);
        for (let y = top2; y <= bot; y++) p.P(x, y, y === top2 ? B : K); }
      for (const t of [5, 10, 14]) for (let i = 0; i <= t; i++) p.P(ox + sd * i, 24 - Math.round(Math.sin(i / 14 * Math.PI * .9) * 9) + Math.round(i / t * (t === 14 ? 6 : t === 10 ? 7 : 8)), L); } };
  // ───────────── 发型 ─────────────
  Object.assign(HAIR, {
    twin: { back: (p, c) => { p.E(19.5, 13, 11.5, 10, c); for (const s of [-1, 1]) { const x0 = s < 0 ? 4 : 30; for (let y = 10; y < 44; y++) { const w = y < 14 ? 4 : y < 38 ? 5 : 3, sh = Math.round(Math.sin(y / 3) * 1); p.R(x0 + sh + (s < 0 ? 0 : 1), y, w, 1, c); if (y % 4 === 0) p.P(x0 + sh + 2, y, dk(c, .35)); } } },
      front: (p, c) => { HAIR.wavy.front(p, c, true); p.R(8, 9, 3, 3, "#ff8fb7"); p.R(29, 9, 3, 3, "#ff8fb7"); p.P(9, 10, "#fff"); p.P(30, 10, "#fff"); } },
    straight: { back: (p, c) => { p.E(19.5, 13, 11.5, 10, c); p.R(8, 18, 5, 30, c); p.R(27, 18, 5, 30, c); p.R(8, 47, 5, 1, dk(c, -.15)); p.R(27, 47, 5, 1, dk(c, -.15)); for (let y = 20; y < 46; y += 5) { p.P(9, y, dk(c, .35)); p.P(30, y + 2, dk(c, .35)); } },
      front: (p, c) => { const hi = dk(c, .4); p.S([[3, 15, 24], [4, 12, 27], [5, 10, 29], [6, 9, 30], [7, 9, 30], [8, 9, 30], [9, 9, 30], [10, 9, 30], [11, 9, 30], [12, 9, 12], [12, 27, 30], [13, 9, 11], [13, 28, 30]], c); p.R(11, 12, 18, 1, dk(c, -.15)); p.R(14, 4, 7, 1, hi); p.R(12, 5, 3, 1, hi); p.R(9, 14, 2, 12, c); p.R(29, 14, 2, 12, c); } },
    bun: { back: (p, c) => { p.E(19.5, 13, 11.5, 10, c); },
      front: (p, c) => { p.E(19.5, 0.5, 4.5, 3.5, c); p.P(18, -1, dk(c, .4)); p.R(16, 3, 8, 1, "#ff8fb7"); HAIR.wavy.front(p, c, true); p.R(13, 13, 1, 6, c); p.R(26, 13, 1, 6, c); } },
    messy: { back: (p, c) => { p.E(19.5, 12, 11, 9.5, c); },
      front: (p, c) => { const hi = dk(c, .35); p.S([[1, 15, 18], [1, 22, 25], [2, 12, 27], [3, 10, 29], [4, 9, 30], [5, 8, 31], [6, 8, 31], [7, 8, 31], [8, 8, 31], [9, 8, 31], [10, 9, 13], [10, 15, 18], [10, 20, 24], [10, 26, 30], [11, 9, 12], [11, 16, 17], [11, 21, 23], [11, 27, 30], [12, 9, 11], [12, 22, 22], [12, 28, 30], [13, 9, 10], [13, 29, 30], [14, 9, 10], [14, 29, 30]], c); p.R(14, 3, 6, 1, hi); p.R(22, 4, 4, 1, hi); p.P(7, 8, c); p.P(32, 8, c); } },
    sidepart: { back: (p, c) => { p.E(19.5, 12, 11, 9.5, c); },
      front: (p, c) => { const hi = dk(c, .35); p.S([[2, 14, 25], [3, 11, 28], [4, 9, 30], [5, 9, 30], [6, 9, 30], [7, 9, 30], [8, 9, 30], [9, 9, 18], [9, 23, 30], [10, 9, 16], [10, 26, 30], [11, 9, 14], [11, 28, 30], [12, 9, 12], [12, 29, 30], [13, 9, 11], [14, 9, 10]], c); p.R(22, 3, 1, 7, dk(c, -.3)); p.R(12, 4, 8, 1, hi); p.R(11, 6, 4, 1, hi); } },
  });
  // ───────────── 配饰 ─────────────
  Object.assign(ACC, {
    headphones: p => { p.R(11, 1, 18, 1, "#2b2b33"); p.P(10, 2, "#2b2b33"); p.P(29, 2, "#2b2b33"); p.R(8, 13, 3, 6, "#ff6f9f"); p.R(29, 13, 3, 6, "#ff6f9f"); p.R(9, 3, 1, 10, "#2b2b33"); p.R(30, 3, 1, 10, "#2b2b33"); p.P(9, 14, "#ffc2d6"); p.P(30, 14, "#ffc2d6"); },
    beret: p => { p.E(17.5, 4, 11, 3.5, "#d8323f"); p.R(7, 6, 22, 1, dk("#d8323f", -.2)); p.P(17, 0, "#d8323f"); p.P(12, 3, dk("#d8323f", .3)); p.P(13, 3, dk("#d8323f", .3)); },
    scarf: p => { const C = "#f4a3b8"; p.R(14, 23, 12, 3, C); p.R(22, 25, 3, 10, C); p.R(22, 35, 3, 1, "#fff"); for (let x = 15; x < 26; x += 3) p.P(x, 24, "#fff"); },
    starclip: p => { p.M(["..X..", ".XXX.", "XXOXX", ".X.X."], 24, 7, { X: "#ffd23a", O: "#fff6c4" }); },
    santa: p => { p.S([[0, 22, 26], [1, 18, 25], [2, 15, 24], [3, 12, 25]], "#d8323f"); p.R(10, 4, 20, 2, "#fff"); p.E(28, 0.5, 2, 2, "#fff"); },
    horns: p => { for (const x of [11, 26]) { p.R(x, 3, 3, 2, "#5a2a6a"); p.R(x + (x < 20 ? 0 : 1), 1, 2, 2, "#5a2a6a"); p.P(x + (x < 20 ? 0 : 2), 0, "#5a2a6a"); } },
    cat: p => { p.M([".K.....K..", ".KK...KK..", ".KKKKKKK..", "KKKKKKKKK.", "KEKKKKKEK.", "KKKKPKKKK.", "KWKKKKKWK.", ".KKKKKKK...", "..KDKKDK..", ".KKKKKKKK.", "KKKKKKKKKK", "KKKKKKKKKK", ".KK.KK.KK.", "..........", ], 28, 59, { K: "#f2a64b", D: "#d9822a", E: "#2b2430", P: "#ff8fa8", W: "#ffd2a8" }); p.R(37, 66, 1, 4, "#f2a64b"); p.P(38, 65, "#f2a64b"); },
  });
  ACC.bunny = p => { p.M([".W...W.", ".WP.WP.", ".WP.WP.", ".WP.WP.", ".WWWWW.", "WWWWWWW", "WEWWWEW", "WRWPWRW", "WWWWWWW", ".WWWWW.", "WWWWWWW", "WWWWWWW", "WWWWWWW", ".WW.WW."], 30, 58, { W: "#ffffff", P: "#ffc2d6", E: "#2b2430", R: "#ffd0dc" }); };

  // ───────────── 背景 ─────────────
  const band = (p, w, y0, y1, c0, c1) => { const a = parseInt(c0.slice(1), 16), b = parseInt(c1.slice(1), 16); for (let y = y0; y < y1; y++) { const t = Math.floor((y - y0) / (y1 - y0) * 6) / 6; const m = sh => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t); p.R(0, y, w, 1, "#" + [16, 8, 0].map(m).map(v => v.toString(16).padStart(2, "0")).join("")); } };
  const heartAt = (p, x, y, c) => p.M([".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."], x, y, { X: c });
  const starAt = (p, x, y, c) => { p.P(x, y - 1, c); p.P(x - 1, y, c); p.P(x, y, "#fff"); p.P(x + 1, y, c); p.P(x, y + 1, c); };
  const cloudAt = (p, x, y, s) => { p.E(x, y, 4 * s, 2.4 * s, "#fff"); p.E(x + 4 * s, y - 1 * s, 3.4 * s, 2.6 * s, "#fff"); p.E(x - 4 * s, y + .5, 3 * s, 1.8 * s, "#fff"); };
  const BG = {
    hearts: (p, w, h) => { band(p, w, 0, h, "#ffc1dc", "#fff2f8"); [[6, 8], [80, 6], [88, 30], [10, 40], [74, 58], [20, 66], [50, 4]].forEach(([x, y], i) => heartAt(p, x, y, i % 2 ? "#ff8fbf" : "#ffadd0")); [[30, 20], [64, 16], [92, 50], [4, 56], [40, 72]].forEach(([x, y]) => starAt(p, x, y, "#fff6a0")); p.R(0, h - 4, w, 4, "#ffd0e4"); },
    starry: (p, w, h) => { band(p, w, 0, h, "#1e1b4a", "#6a4fa8"); for (let i = 0; i < 40; i++) p.P((i * 37) % w, (i * 23) % (h - 10), i % 3 ? "#cfd4ff" : "#fff"); [[12, 10], [70, 24], [40, 6], [90, 44]].forEach(([x, y]) => starAt(p, x, y, "#fff6a0")); p.E(82, 12, 6, 6, "#fff4c0"); p.E(85, 10, 5, 5, "#2a245a"); p.R(0, h - 6, w, 6, "#2a2050"); },
    campus: (p, w, h) => { band(p, w, 0, 46, "#7cc4ff", "#cfeaff"); cloudAt(p, 16, 10, 1); cloudAt(p, 76, 16, .8); p.R(0, 34, w, 26, "#f1dfbd"); p.R(0, 34, w, 2, "#c99f6c"); for (let x = 4; x < w; x += 12) { p.R(x, 40, 7, 8, "#9fd0f2"); p.R(x, 40, 7, 1, "#fff"); p.R(x + 3, 40, 1, 8, "#fff"); } p.R(44, 26, 14, 8, "#e9d3a8"); p.R(48, 28, 6, 3, "#fff"); p.P(51, 29, "#d8323f"); p.R(0, 60, w, h - 60, "#a8d878"); for (let x = 0; x < w; x += 3) p.P(x, 60, "#86c25a"); p.E(10, 50, 6, 7, "#5aa84a"); p.R(9, 56, 2, 6, "#8a5a3a"); },
    city: (p, w, h) => { band(p, w, 0, h - 14, "#2b1f6a", "#ff9a8a"); const hs = [30, 44, 26, 52, 38, 48, 28, 42, 34]; hs.forEach((bh, i) => { const x = i * 11, y = h - 14 - bh; p.R(x, y, 10, bh, i % 2 ? "#2a2050" : "#3a2e66"); for (let wy = y + 3; wy < h - 16; wy += 4) for (let wx = x + 2; wx < x + 9; wx += 3) if ((wx + wy + i) % 4) p.P(wx, wy, "#ffe48a"); }); p.R(0, h - 14, w, 14, "#4a4a5a"); for (let x = 2; x < w; x += 10) p.R(x, h - 7, 5, 1, "#fff"); [[8, 6], [60, 10], [90, 4]].forEach(([x, y]) => starAt(p, x, y, "#fff")); },
    magazine: (p, w, h) => { band(p, w, 0, h, "#ff6fa8", "#ffd1e4"); for (let i = 0; i < 18; i++) starAt(p, (i * 29) % w, 22 + (i * 17) % (h - 26), i % 2 ? "#fff" : "#fff6a0"); p.R(4, h - 18, 28, 2, "#fff"); p.R(4, h - 14, 22, 2, "#fff"); p.R(4, h - 10, 26, 2, "#fff"); p.R(w - 14, h - 14, 10, 10, "#fff"); for (let x = w - 13; x < w - 5; x += 2) p.R(x, h - 13, 1, 8, "#222"); },
    beach: (p, w, h) => { band(p, w, 0, 40, "#56b8ff", "#bfe8ff"); p.E(80, 12, 7, 7, "#fff1a0"); cloudAt(p, 22, 12, .8); band(p, w, 40, 56, "#2aa0d8", "#7fd8f0"); for (let x = 0; x < w; x += 6) p.R(x, 44 + (x % 12 ? 0 : 4), 3, 1, "#fff"); p.R(0, 56, w, h - 56, "#f6dfa6"); for (let i = 0; i < 20; i++) p.P((i * 31) % w, 58 + (i * 7) % (h - 58), "#e6c47e"); p.R(12, 30, 2, 28, "#a0703a"); for (const [dx, dy] of [[-8, -2], [-5, -4], [0, -5], [5, -4], [8, -1]]) p.E(13 + dx, 30 + dy, 4, 1.6, "#3aa04a"); },
    snow: (p, w, h) => { band(p, w, 0, h, "#8fa8d0", "#e8f0ff"); for (let i = 0; i < 46; i++) p.P((i * 41) % w, (i * 19) % (h - 8), "#fff"); p.R(0, h - 12, w, 12, "#fdfdff"); p.E(w - 14, h - 14, 5, 5, "#fff"); p.E(w - 14, h - 22, 3.5, 3.5, "#fff"); p.P(w - 15, h - 23, "#222"); p.P(w - 13, h - 23, "#222"); p.R(w - 15, h - 21, 2, 1, "#ff8a3a"); p.R(w - 17, h - 18, 7, 1, "#d8323f"); },
  };
  /** 一整张 QQ秀：背景 + 几个人（[人, x 位置]），返回像素格子 */
  window.qqstage = (bg, figs, w = 100, h = 84) => { const p = Pix(w, h); if (BG[bg]) BG[bg](p, w, h);
    for (const [o, x] of figs) { const g = window.qqpix(o); g.forEach((r, y) => r.forEach((c, i) => { if (c) p.P(x + i, h - 78 + y, c); })); } return p.g; };
  window.qqpix = (o) => { const p = Pix();
    if (o.wings) WINGS[o.wings](p); HAIR[o.hair].back(p, o.hairC); body(p, o.g); head(p); if (o.outfit) OUT[o.outfit](p, o.g);
    eyes(p, o.eyeC, o.g, o.eyes); blush(p, o.g, o.blush); mouth(p, o.g, o.mouth);
    if (o.extra === "heart") p.M([".X.X.", "XXXXX", ".XXX.", "..X.."], 31, 8, { X: "#ff4f8e" });
    if (o.extra === "sweat") { p.P(30, 9, "#9ad8f5"); p.R(30, 10, 1, 2, "#6cc0ec"); }
    if (o.extra === "sparkle") { p.M(["..X..", ".XXX.", "XXOXX", ".XXX.", "..X.."], 31, 6, { X: "#ffe27a", O: "#fff" }); } HAIR[o.hair].front(p, o.hairC); (o.acc || []).forEach(a => ACC[a](p));
    // 描边
    const g = p.g, out = g.map(r => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!g[y][x]) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = g[y + b] && g[y + b][x + a]; if (c) { out[y][x] = dk(c, -.62); break; } }
    return out; };
  /** 画到 canvas：scale 倍 */
  window.drawPix = (ctx, grid, ox, oy, k) => grid.forEach((r, y) => r.forEach((c, x) => { if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x * k, oy + y * k, k, k); } }));
})();
