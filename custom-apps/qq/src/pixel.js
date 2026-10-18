/* QQ宠物 + 情侣空间的像素画（她定稿的那版：scratchpad peng/ui2.png、cp_px.png）。都返回颜色格子，app 里用 pixUrl 变成图 */
(function () {
  const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill(null));
  const pen = g => { const H = g.length, W = g[0].length;
    const P = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
    return { P, R: (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(x + i, y + j, c); },
      E: (cx, cy, rx, ry, c) => { for (let y = Math.floor(cy - ry); y <= cy + ry + .5; y++) for (let x = Math.floor(cx - rx); x <= cx + rx + .5; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) P(x, y, c); },
      M: (map, ox, oy, pal) => map.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch]) P(ox + i, oy + j, pal[ch]); })) }; };
  const outline = (g, col) => { const out = g.map(r => r.slice());
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) if (!g[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => g[y + b] && g[y + b][x + a])) out[y][x] = col;
    return out; };
  const fromMap = (map, pal) => { const g = grid(map[0].length, map.length); pen(g).M(map, 0, 0, pal); return g; };

  // ───── 小企鹅 36×36，ex 是表情，wear = { hat, face, neck }（装扮），fx 画在外面一圈（44×42 的格子里企鹅在 (4,5)）─────
  const K = "#23233a", K2 = "#3a3a5c", WH = "#ffffff", WH2 = "#e4ecf7", Y = "#ffc21a", Y2 = "#f29a0c", RD = "#e8303a", RD2 = "#b81d2a", PK = "#ffa3b8", BL = "#7cc8ff";
  function body(ex, wear) {
    const g = grid(36, 36), { P, R, E } = pen(g);
    const up = ex === "happy" || ex === "play" || ex === "love" ? -3 : 0;
    E(5.5, 23 + up, 2.5, 5, K); E(30.5, 23 + up, 2.5, 5, K);
    E(18, 25, 12, 8.5, K); E(18, 13, 11.5, 10.5, K); E(14, 7, 4, 2, K2);
    E(18, 26, 8.5, 6.5, WH); E(18, 28, 7, 4, WH2); E(18, 26, 6.5, 4.5, WH);
    E(14, 14, 5.5, 6, WH); E(22, 14, 5.5, 6, WH); E(18, 16, 8, 4.5, WH);
    R(10, 33, 6, 2, Y); R(20, 33, 6, 2, Y); R(10, 34, 6, 1, Y2); R(20, 34, 6, 1, Y2);
    const sc = (wear && wear.neck && NECK[wear.neck]) || [RD, RD2];
    R(8, 20, 20, 3, sc[0]); R(7, 21, 22, 1, sc[0]); R(8, 22, 20, 1, sc[1]); R(22, 22, 4, 6, sc[0]); R(22, 27, 4, 1, sc[1]); R(23, 23, 1, 4, sc[1]);
    const eye = (x, k) => {
      if (k === "open") { R(x, 10, 3, 4, K); P(x, 10, WH); P(x + 2, 10, WH); P(x, 13, WH); P(x + 2, 13, WH); P(x + 1, 10, K); P(x + 1, 11, WH); }
      if (k === "big") { R(x - 1, 10, 5, 4, K); R(x, 9, 3, 1, K); R(x, 14, 3, 1, K); R(x - 1, 10, 2, 2, WH); P(x + 2, 13, WH); }
      if (k === "happy") { P(x - 1, 13, K); R(x, 12, 3, 1, K); P(x + 3, 13, K); }
      if (k === "closed") { P(x - 1, 12, K); R(x, 13, 3, 1, K); P(x + 3, 12, K); }
      if (k === "x") { P(x, 11, K); P(x + 2, 11, K); P(x + 1, 12, K); P(x, 13, K); P(x + 2, 13, K); }
      if (k === "dot") R(x + 1, 12, 2, 2, K);
      if (k === "heart") { R(x - 1, 11, 2, 2, RD); R(x + 2, 11, 2, 2, RD); R(x - 1, 12, 5, 1, RD); R(x, 13, 3, 1, RD); P(x + 1, 14, RD); }
      if (k === "tear") { R(x, 11, 3, 1, K); P(x - 1, 12, K); P(x + 3, 12, K); }
      if (k === "angry") { R(x, 12, 3, 2, K); P(x + 1, 14, K); } };
    const pair = k => { eye(13, k); eye(20, k); };
    const brows = d => { if (d === "sad") { R(12, 9, 2, 1, K); P(14, 8, K); R(22, 9, 2, 1, K); P(21, 8, K); } if (d === "angry") { P(12, 8, K); R(13, 9, 2, 1, K); P(15, 10, K); P(23, 8, K); R(21, 9, 2, 1, K); P(20, 10, K); } };
    const beak = k => {
      if (k === "open") { E(18, 15.5, 3.5, 1.2, Y); R(16, 16, 4, 2, RD2); R(17, 17, 2, 1, "#ff6f7f"); E(18, 18.8, 3, .8, Y2); return; }
      if (k === "chew") { E(18, 16, 3.5, 1.3, Y); R(16, 15, 4, 1, Y2); return; }
      if (k === "small") { R(16, 15, 4, 1, Y); R(17, 16, 2, 1, Y2); return; }
      if (k === "wavy") { E(18, 16, 3.5, 1.3, Y); P(15, 15, Y2); P(17, 16, Y2); P(19, 15, Y2); P(21, 16, Y2); return; }
      E(18, 16, 3.8, 1.5, Y); R(15, 15, 6, 1, Y2); };
    const blush = (c = PK) => { R(9, 14, 3, 1, c); R(25, 14, 3, 1, c); };
    switch (ex) {
      case "happy": pair("happy"); beak("open"); blush(); break;
      case "love": pair("heart"); beak("open"); blush(); break;
      case "hungry": pair("open"); brows("sad"); beak("open"); R(19, 19, 1, 2, BL); break;
      case "eat": pair("happy"); beak("chew"); blush(); E(10, 15, 1.5, 1.2, PK); E(26, 15, 1.5, 1.2, PK); break;
      case "sad": pair("tear"); brows("sad"); beak("wavy"); R(12, 13, 1, 3, BL); R(23, 13, 1, 3, BL); break;
      case "dirty": pair("dot"); brows("sad"); beak("wavy"); break;
      case "bath": pair("closed"); beak("small"); blush(); break;
      case "sleep": pair("closed"); beak("small"); break;
      case "sick": pair("x"); beak("wavy"); blush("#ff6f6f"); R(22, 17, 6, 1, WH); R(28, 16, 2, 3, RD); break;
      case "angry": pair("angry"); brows("angry"); beak("wavy"); break;
      case "shy": pair("closed"); beak("small"); blush("#ff7f9f"); R(9, 15, 3, 1, "#ff7f9f"); R(25, 15, 3, 1, "#ff7f9f"); break;
      case "play": pair("big"); beak("open"); blush(); break;
      case "tired": pair("closed"); brows("sad"); beak("small"); break;
      default: pair("open"); beak(); blush();
    }
    if (ex === "dirty") { for (const [x, y] of [[9, 26], [10, 27], [25, 29], [26, 28], [14, 8], [15, 9], [20, 31], [6, 21]]) P(x, y, "#8a6a4a"); for (const [x, y] of [[12, 28], [24, 25]]) R(x, y, 2, 1, "#a0815e"); }
    if (wear && wear.face && FACE[wear.face]) FACE[wear.face](pen(g));
    return g;
  }
  // 装扮：帽子画在头顶外面，所以整只企鹅放进大一点的格子里
  const NECK = { blue: ["#3a8fe0", "#2462a8"], pink: ["#ff7fa8", "#d84a86"], green: ["#5cbf6a", "#3a8a48"], yellow: ["#ffcf3a", "#d8a21a"] };
  const FACE = {
    shades: p => { p.R(11, 10, 7, 4, "#141428"); p.R(19, 10, 7, 4, "#141428"); p.R(17, 11, 3, 1, "#141428"); p.P(12, 11, "#6a6a8a"); p.P(20, 11, "#6a6a8a"); },
    glasses: p => { for (const x of [11, 19]) { p.R(x, 9, 7, 1, "#141428"); p.R(x, 14, 7, 1, "#141428"); p.R(x, 9, 1, 6, "#141428"); p.R(x + 6, 9, 1, 6, "#141428"); } p.R(17, 11, 3, 1, "#141428"); },
  };
  const HAT = {
    red: (p, o) => { p.R(o.x + 10, o.y - 1, 16, 3, "#e8303a"); p.R(o.x + 12, o.y - 4, 12, 3, "#e8303a"); p.R(o.x + 15, o.y - 6, 6, 2, "#e8303a"); p.R(o.x + 9, o.y + 2, 18, 2, "#ffffff"); p.R(o.x + 16, o.y - 9, 4, 3, "#ffffff"); },
    bow: (p, o) => { const C = "#ff5a8a", D = "#c8306a"; p.R(o.x + 22, o.y, 4, 5, C); p.R(o.x + 29, o.y, 4, 5, C); p.R(o.x + 26, o.y + 1, 3, 3, D); p.P(o.x + 22, o.y, null); p.P(o.x + 32, o.y, null); },
    crown: (p, o) => { const C = "#ffcf3a", D = "#d8a21a"; p.R(o.x + 12, o.y - 2, 12, 4, C); p.R(o.x + 12, o.y + 1, 12, 1, D); for (const x of [12, 17, 22]) p.R(o.x + x, o.y - 5, 2, 3, C); p.P(o.x + 18, o.y - 1, "#e8303a"); p.P(o.x + 14, o.y - 1, "#3a8fe0"); p.P(o.x + 21, o.y - 1, "#3a8fe0"); },
    grad: (p, o) => { const C = "#23233a"; p.R(o.x + 8, o.y - 2, 20, 2, C); p.R(o.x + 12, o.y, 12, 3, C); p.R(o.x + 26, o.y - 1, 1, 6, "#ffcf3a"); p.R(o.x + 25, o.y + 5, 3, 2, "#ffcf3a"); },
    phones: (p, o) => { const C = "#5ab4ff", D = "#2a78c8"; p.R(o.x + 8, o.y + 1, 20, 2, D); p.R(o.x + 3, o.y + 9, 4, 7, C); p.R(o.x + 29, o.y + 9, 4, 7, C); p.R(o.x + 6, o.y + 2, 2, 8, D); p.R(o.x + 28, o.y + 2, 2, 8, D); },
    flower: (p, o) => { const C = "#ff8fb0"; p.R(o.x + 23, o.y + 1, 2, 2, C); p.R(o.x + 27, o.y + 1, 2, 2, C); p.R(o.x + 25, o.y - 1, 2, 2, C); p.R(o.x + 25, o.y + 3, 2, 2, C); p.R(o.x + 25, o.y + 1, 2, 2, "#ffcf3a"); },
  };
  // 头上冒的小东西（像素）
  const FX = {
    heart: [".rr.rr.", "rrrrrrr", "rwrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."],
    z: ["bbbbb", "...b.", "..b..", ".b...", "bbbbb"],
    note: ["..bbb", "..b.b", "..b.b", "bbb.b", "bbbbb", "bb..."],
    bub: [".bbb.", "bw..b", "b...b", "b...b", ".bbb."],
    anger: ["r.r.r", ".r.r.", "rr.rr", ".r.r.", "r.r.r"],
    sweat: ["..b..", ".bbb.", "bbwbb", "bbbbb", ".bbb."],
    food: [".kkk.", "kwwwk", "kwwwk", "knnnk", ".kkk."],
  };
  const FXPAL = { r: "#ff4f7a", w: "#ffffff", b: "#5a7ab0", k: "#23233a", n: "#2d2d3a" };
  window.qqpeng = (ex = "normal", wear = {}) => {
    const W = 44, H = 44, g = grid(W, H), o = { x: 4, y: 7 };
    const b = outline(body(ex, wear), "#141428");
    b.forEach((r, y) => r.forEach((c, x) => { if (c) g[o.y + y][o.x + x] = c; }));
    const p = pen(g);
    if (wear.hat && HAT[wear.hat]) { const h = grid(W, H); HAT[wear.hat](pen(h), o); outline(h, "#141428").forEach((r, y) => r.forEach((c, x) => { if (c && (h[y][x] || !g[y][x])) g[y][x] = c; })); }
    const fx = { happy: [["heart", 36, 4], ["heart", 1, 10]], love: [["heart", 36, 3], ["heart", 2, 6], ["heart", 38, 14]], sleep: [["z", 34, 8], ["z", 38, 2]], tired: [["sweat", 36, 6]],
      bath: [["bub", 1, 6], ["bub", 6, 1], ["bub", 36, 4], ["bub", 39, 12]], angry: [["anger", 36, 5]], play: [["note", 37, 4]], hungry: [["food", 37, 3]], dirty: [["sweat", 37, 6]] }[ex] || [];
    for (const [k, x, y] of fx) p.M(FX[k], x, y, FXPAL);
    return g;
  };

  // ───── 16×16 图标：动作 + 商店里的吃的 ─────
  const ICONS = {
    feed: ["................","......kkkk......",".....kwwwwk.....","....kwwwwwwk....","...kwwwwwwwwk...","...kwwwwwwwwk...","..kwwwwwwwwwwk..","..kwwwwwwwwwwk..",".kwwwnnnnnnwwwk.",".kwwnnnnnnnnwwk.",".kwwnnnnnnnnwwk.","..kwnnnnnnnnwk..","...kkkkkkkkkk...","................","................","................"],
    bath: ["................","..bb......bb....",".b..b....b..b...","..bb..kk..bb....","......kk........","..kkkkkkkkkkkk..",".kwwwwwwwwwwwwk.",".kccbcccbcccbck.",".kcccccccccccck.",".kwwwwwwwwwwwwk.","..kwwwwwwwwwwk..","...kkkkkkkkkk...","...k........k...","................","................","................"],
    play: ["................",".....kkkkkk.....","....kyyyyyyk....","...kyywyyyyyk...","..kyywyyyyyyyk..","..kwwyyyyyyyyk..","..kyyyyyyyyyyk..","..kyyyyyyyyywk..","..kyyyyyyyywwk..","..kyyyyyyyywyk..","...kyyyyyyyyk...","....kyyyyyyk....",".....kkkkkk.....","................","................","................"],
    sleep: ["................",".........kkk....","........kyyk....",".......kyyk...z.","......kyyk...z..","......kyyk..zzz.","......kyyk......","......kyyyk.....","......kyyyyk....",".......kyyyyk...","........kyyyyk..","..........kkk...","................","................","................","................"],
    study: ["................","..kkkkk..kkkkk..",".krrrrrkkbbbbbk.",".krwwwrkkbwwwbk.",".krrrrrkkbbbbbk.",".krwwwrkkbwwwbk.",".krrrrrkkbbbbbk.",".krrrrrkkbbbbbk.",".krrrrrkkbbbbbk.",".kkkkkkkkkkkkkk.","................","................","................","................","................","................"],
    work: ["................","......kkkk......",".....k....k.....","..kkkkkkkkkkkk..",".knnnnnnnnnnnnk.",".knnnnnnnnnnnnk.",".knnnnnyynnnnnk.",".kkkkkkyykkkkkk.",".knnnnnnnnnnnnk.",".knnnnnnnnnnnnk.",".knnnnnnnnnnnnk.","..kkkkkkkkkkkk..","................","................","................","................"],
    trip: ["................",".....kkkkkk.....",".....k....k.....","..kkkkkkkkkkkk..",".kooooooooooook.",".kowwwwoooooook.",".kooooooooooook.",".kooooooorroook.",".kooooooorroook.",".kooooooooooook.",".kooooooooooook.","..kkkkkkkkkkkk..","...k........k...","................","................","................"],
    sick: ["................","................","....kkkkkkkk....","...kwwwwwwwwk...","...kwwwrrwwwk...","...kwwwrrwwwk...","...kwrrrrrrwk...","...kwrrrrrrwk...","...kwwwrrwwwk...","...kwwwrrwwwk...","...kwwwwwwwwk...","....kkkkkkkk....","................","................","................","................"],
    fish: ["................","................","................","..........kk....","...kkkk..kbbk...","..kbbbbkkbbk....",".kbwkbbbbbbk....",".kbbbbbbbbbk....","..kbbbbkkbbk....","...kkkk..kbbk...","..........kk....","................","................","................","................","................"],
    cake: ["................",".......r........","......kyk.......","......kwk.......","..kkkkkkkkkkkk..",".kppppppppppppk.",".kwwwwwwwwwwwwk.",".kooooooooooook.",".kooooooooooook.",".kwwwwwwwwwwwwk.",".kooooooooooook.",".kkkkkkkkkkkkkk.","................","................","................","................"],
    ice: ["................",".....kkkkk......","....kpppppk.....","...kpwppppk.....","...kpppppppk....","...kkkkkkkkk....","....kyyyyyk.....","....kyoyoyk.....",".....kyyyk......",".....kyoyk......","......kyk.......","......kk........","................","................","................","................"],
    milk: ["................","......kkkk......","......kbbk......",".....kwwwwk.....","....kwwwwwwk....","....kbbbbbbk....","....kbwwwwbk....","....kbwbbwbk....","....kbwwwwbk....","....kbbbbbbk....","....kwwwwwwk....","....kkkkkkkk....","................","................","................","................"],
    card: ["................","................",".kkkkkkkkkkkkkk.",".kccccccccwwwwk.",".kccyycccckwwwk.",".kccyycccckwwwk.",".kccccccgckwwwk.",".kgggccgggkwwwk.",".kggggggggkwwwk.",".kkkkkkkkkkkkkk.","................","................","................","................","................","................"],
  };
  window.qqicon = (name, pal) => fromMap(ICONS[name] || ICONS.feed, { w: "#fff", n: "#2d2d3a", c: "#8fd0ff", y: "#ffcf3a", r: "#e8303a", o: "#ff9b3d", p: "#ff9fbf", g: "#6cc65a", ...pal });

  // ───── 小房间 96×58，三套配色 ─────
  window.PET_SKINS = {
    wood: { name: "木头小屋", panel: "#fff8e6", line: "#7a4a24", shade: "#f0dcb4", ink: "#5a3418", ink2: "#6b4a2e", empty: "#ead6b0", tab: "#e8cfa0", note: "#fff1c4", line2: "#e0b86a", bg: "#f6e7c8",
      room: { wall: "#fbe3b8", wall2: "#f6d8a6", trim: "#b8743c", floor: "#c98a4e", floor2: "#b57640", frame: "#8a5228", sky: "#8fd3ff", sky2: "#c4ecff", night: "#2a3a6a", bed: "#ff8fae", bed2: "#ffb8cb", bowl: "#4aa8ff", bowl2: "#2a78c8", rug: "#e86a6a", rug2: "#f59a8a", pic: "#a6e3a0" },
      bars: ["#ff9b3d", "#4ab0ff", "#ff6f9c", "#6cc65a"], ico: { k: "#4a2a14", b: "#7cc8ff", z: "#4a2a14" } },
    blue: { name: "2008 QQ 蓝", panel: "#ffffff", line: "#2f5f9e", shade: "#e1eefc", ink: "#1f4a80", ink2: "#33507a", empty: "#d6e4f5", tab: "#b9d6f5", note: "#eef6ff", line2: "#9cc3ee", bg: "#dcecff",
      room: { wall: "#cfe6ff", wall2: "#bcdaf9", trim: "#4f86c6", floor: "#8fb6e0", floor2: "#7aa3d0", frame: "#3a6aa8", sky: "#ffe9a8", sky2: "#fff6d0", night: "#1a2a5a", bed: "#7ec2ff", bed2: "#b5dcff", bowl: "#ff8a5a", bowl2: "#d0603a", rug: "#ffd34d", rug2: "#ffe68f", pic: "#ffb3c8" },
      bars: ["#ffa53a", "#2f8cf0", "#ff6f9c", "#3fbf6a"], ico: { k: "#1f3f6e", b: "#5ab4ff", z: "#1f3f6e" } },
    candy: { name: "糖果粉", panel: "#fff7fb", line: "#a3436f", shade: "#ffe0ec", ink: "#8a2f5a", ink2: "#7a4a62", empty: "#f6cfe0", tab: "#ffc6dc", note: "#fff0f6", line2: "#ffaccb", bg: "#ffe4ef",
      room: { wall: "#ffe0ec", wall2: "#ffd0e2", trim: "#d86a9a", floor: "#c9a6e8", floor2: "#b48fd8", frame: "#a3436f", sky: "#a8e6ff", sky2: "#d6f4ff", night: "#3a2a6a", bed: "#fff2a8", bed2: "#fffbe0", bowl: "#7fd6b0", bowl2: "#4aae86", rug: "#8fd0ff", rug2: "#bfe6ff", pic: "#fff2a8" },
      bars: ["#ffaa5a", "#6cc0ff", "#ff6fa8", "#7dd38a"], ico: { k: "#7a2a50", b: "#8fd0ff", z: "#7a2a50" } },
  };
  window.qqroom = (T, night) => { const W = 96, H = 58, g = grid(W, H), { R } = pen(g);
    R(0, 0, W, 38, T.wall); for (let x = 0; x < W; x += 6) R(x, 0, 1, 38, T.wall2);
    R(0, 36, W, 2, T.trim); R(0, 38, W, H - 38, T.floor); for (let y = 41; y < H; y += 4) R(0, y, W, 1, T.floor2); for (let y = 38, k = 0; y < H; y += 4, k++) for (let x = (k % 2) * 8; x < W; x += 16) R(x, y, 1, 4, T.floor2);
    R(6, 6, 22, 18, T.frame); R(8, 8, 18, 14, night ? T.night : T.sky); R(8, 8, 18, 3, night ? T.night : T.sky2); R(16, 8, 2, 14, T.frame); R(8, 14, 18, 2, T.frame);
    if (night) { R(21, 10, 3, 3, "#fff6c0"); R(20, 11, 1, 1, "#fff6c0"); R(10, 17, 1, 1, "#fff"); R(13, 10, 1, 1, "#fff"); } else { R(10, 10, 3, 1, "#fff"); R(20, 17, 4, 1, "#fff"); }
    R(70, 26, 22, 3, T.frame); R(70, 22, 2, 16, T.frame); R(90, 22, 2, 16, T.frame); R(72, 26, 18, 8, T.bed); R(72, 26, 18, 2, T.bed2); R(73, 23, 7, 4, "#fff"); R(70, 34, 22, 2, T.frame);
    R(12, 48, 10, 1, T.bowl2); R(11, 45, 12, 3, T.bowl); R(13, 44, 8, 1, "#fff8e0"); R(30, 50, 36, 6, T.rug); R(31, 51, 34, 4, T.rug2);
    R(80, 6, 10, 12, T.frame); R(81, 7, 8, 10, T.pic); R(83, 10, 3, 3, T.trim);
    if (night) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x]) g[y][x] = dim(g[y][x]);
    return g; };
  const dim = hex => { const n = parseInt(hex.slice(1), 16); const f = c => Math.round(c * .55 + 20); return "#" + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, "0")).join(""); };

  // ───── 爱情树：0 种子 1 发芽 2 小树苗 3 小树 4 开花 5 结果 ─────
  const TREE = ["...........gggg...........","........gggGGgggg.........",".......ggGGggggpgg........",".....gggGgggggggggggg.....","....ggGggpgggggggGgggg....","...ggggggggggggpggggggg...","...ggpggggGGgggggggggpg...","..gggggggGggggggggggggg...","..ggggggggggggggpggggggg..","...gggggpgggggggggGgggg...","....ggggggggggggggggggg...",".....gggggggbbgggggggg....","........gggbbbbggg........","...........bbbb...........","...........bbbb...........","...........bbbB...........","..........bbbbbb..........",".........ssssssss........."];
  window.qqtree = stage => { const g = grid(26, 18), { M, R } = pen(g); const pal = { g: "#6cc65a", G: "#9ae08a", p: "#ff7fa8", b: "#9a6438", B: "#7a4a24", s: "#8fd06a" };
    if (stage <= 0) { R(9, 16, 8, 2, "#9a6438"); R(10, 15, 6, 1, "#9a6438"); R(12, 14, 2, 1, "#c98a4e"); return outline(g, "#4a2a14"); }
    if (stage === 1) { R(9, 16, 8, 2, "#9a6438"); R(12, 11, 2, 5, "#6cc65a"); R(10, 10, 3, 2, "#9ae08a"); R(14, 9, 3, 2, "#6cc65a"); return outline(g, "#2a5a2a"); }
    if (stage === 2) { R(8, 16, 10, 2, "#8fd06a"); R(12, 9, 2, 7, "#9a6438"); for (const [x, y, w, h] of [[8, 6, 10, 4], [9, 4, 8, 2], [10, 3, 6, 1], [7, 8, 12, 2]]) R(x, y, w, h, "#6cc65a"); R(10, 5, 3, 1, "#9ae08a"); return outline(g, "#2a5a2a"); }
    const pk = stage >= 4 ? "#ff7fa8" : "#6cc65a"; M(TREE, 0, 0, { ...pal, p: pk });
    if (stage >= 5) for (const [x, y] of [[6, 5], [17, 4], [11, 8], [20, 8], [4, 9], [14, 2]]) { R(x, y, 2, 2, "#e8303a"); g[y][x] = "#ff8a8a"; }
    return outline(g, "#2a5a2a"); };
  window.TREE_LV = [[0, "种子"], [20, "发芽了"], [60, "小树苗"], [140, "小树"], [260, "开花了"], [420, "结果了"]];

  // ───── 像素数字、爱心、图钉 ─────
  const DIG = { 0: [".kkk.","k...k","k..kk","k.k.k","kk..k","k...k",".kkk."], 1: ["..k..",".kk..","..k..","..k..","..k..","..k..",".kkk."], 2: [".kkk.","k...k","....k","...k.","..k..",".k...","kkkkk"], 3: [".kkk.","k...k","....k","..kk.","....k","k...k",".kkk."], 4: ["...k.","..kk.",".k.k.","k..k.","kkkkk","...k.","...k."], 5: ["kkkkk","k....","kkkk.","....k","....k","k...k",".kkk."], 6: ["..kk.",".k...","k....","kkkk.","k...k","k...k",".kkk."], 7: ["kkkkk","....k","...k.","..k..",".k...",".k...",".k..."], 8: [".kkk.","k...k","k...k",".kkk.","k...k","k...k",".kkk."], 9: [".kkk.","k...k","k...k",".kkkk","....k","...k.",".kk.."] };
  window.qqdigits = (n, col) => { const s = String(n), g = grid(s.length * 6 - 1, 7), { M } = pen(g); [...s].forEach((d, i) => M(DIG[d], i * 6, 0, { k: col })); return g; };
  window.qqheart = on => fromMap([".kk.kk.", "krrkrrk", "krwrrrk", "krrrrrk", ".krrrk.", "..krk..", "...k..."], { k: "#7a2a50", r: on ? "#ff4f7a" : "#f6cfe0", w: on ? "#ffb3c8" : "#fff" });
  window.qqpin = () => fromMap(["..kk..", ".krrk.", "krwrrk", "krrrrk", ".kkkk."], { k: "#7a2a50", r: "#ff4f7a", w: "#ffd0dc" });
  window.qqcork = () => { const g = grid(60, 90); let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let y = 0; y < 90; y++) for (let x = 0; x < 60; x++) g[y][x] = "#d9a066"; for (let i = 0; i < 700; i++) g[rnd() * 90 | 0][rnd() * 60 | 0] = ["#c88a50", "#e6b47c", "#b87a44"][i % 3]; return g; };

  // ───── QQ农场：作物（12×14，种子/发芽/小苗/成熟）、地块、背景、小狗、工具图标 ─────
  const CROPS = {
    radish: ["............","...g..g.....","...gg.gg....","....ggg.....","....GgG.....","....www.....","...wwwww....","...wwwWw....","...wwwww....","....wWw.....","....www.....",".....w......","............","............"],
    carrot: ["............","...g.g.g....","....ggg.....","...gGgGg....",".....g......","....ooo.....","...ooOoo....","...oooOo....","....ooo.....","....oOo.....",".....oo.....",".....o......","............","............"],
    corn: ["....g.......","...ggg..g...","....g..gg...","....yyy.g...","...yYyYy....","...yyyyy....","...yYyYy....","...yyyyy....","...gyyyg....","..gg.g.gg...",".....g......",".....g......","............","............"],
    potato: ["............","............","...g...g....","..ggg.ggg...","...GgggG....","....ggg.....",".....g......","...pppp.....","..pppPppp...","..ppppppP...","..pPppppp...","...ppppp....","............","............"],
    tomato: ["............","....g.g.....","...ggggg....","....gGg.....","...rrrrr....","..rrwrrrr...","..rrrrrrr...","..rrrrrRr...","..rrrrrrr...","...rrrrr....","....g.g.....","....g.g.....","............","............"],
    straw: ["............","....g..g....","...ggggg....","....gGg.....","...rrrrr....","..rwrrrrr...","..rrrrwrr...","..rrwrrrr...","...rrrrr....","....rrr.....",".....r......","............","............","............"],
    melon: ["............","............",".....g......","....g.g.....","..ggGggGg...",".gGgggggGg..",".ggGgggGgg..",".gggGggggg..",".gGgggGggg..","..ggggggg...","...ggggg....","............","............","............"],
    rose: ["............","....rrr.....","...rRrRr....","...rrrrr....","....rrr.....",".....g......","...g.g......","....gg.g....",".....gg.....",".....g......",".....g......","............","............","............"],
    sprout: ["............","............","............","............","............","............","....gg......",".....g.gg...",".....gg.....","......g.....","......g.....","............","............","............"],
    young: ["............","............","............","....g..g....","...gGg.gg...","....gggG....",".gg..g......","..gGgg.gg...","....ggGg....",".....g......",".....g......","............","............","............"],
    seed: ["............","............","............","............","............","............","............","............","............","....b..b....","..b....b..b.","............","............","............"],
    dead: ["............","............","............","............","............","....b.......","...b.b..b...","....bb.b....",".....bb.....","......b.....","......b.....","............","............","............"],
    weed: ["............","............","............","............","............","..k.....k...","..kk...kk...","...k.k.k....","...kkkkk....","....kkk.....","............","............","............","............"],
    bug: ["............","............","..k...k.....","...k.k......","..kkkkk.....",".kRkkRk.....","..kkkkk.....","...k.k......","............","............","............","............","............","............"],
  };
  const CPAL = { g: "#4caf50", G: "#8bd86a", o: "#ff8c2a", O: "#d8620a", r: "#e8303a", R: "#ff7f8f", w: "#fff", W: "#dfe8f0", y: "#ffd84a", Y: "#e8b020", b: "#8a6040", k: "#3a2a10", p: "#c9935a", P: "#a8743a" };
  window.qqcrop = k => outline(fromMap(CROPS[k] || CROPS.seed, CPAL), "#2a2010");
  window.qqplot = st => { const g = grid(19, 13), { R } = pen(g); R(0, 2, 19, 11, "#8a5a30"); R(1, 3, 17, 9, st === "wet" ? "#7a4e2a" : "#a8703c"); for (let i = 0; i < 5; i++) R(2 + i * 3, 5 + (i % 2) * 3, 2, 1, st === "wet" ? "#5e3a1e" : "#7a4a24");
    if (st === "dry") { R(3, 4, 4, 1, "#6a4020"); R(5, 5, 1, 2, "#6a4020"); R(11, 9, 5, 1, "#6a4020"); R(13, 7, 1, 2, "#6a4020"); } if (st === "lock") { R(1, 3, 17, 9, "#7cc85a"); R(8, 5, 3, 4, "#8a8a8a"); R(7, 7, 5, 3, "#c9a020"); } return g; };
  window.qqfarmbg = () => { const W = 96, H = 74, g = grid(W, H), { R } = pen(g); R(0, 0, W, 22, "#8fd3ff"); R(0, 14, W, 8, "#c4ecff"); R(70, 3, 8, 8, "#ffe066"); R(69, 5, 10, 4, "#ffe066");
    for (const [x, y] of [[8, 6], [30, 4], [48, 8]]) { R(x, y, 10, 3, "#fff"); R(x + 2, y - 2, 6, 2, "#fff"); }
    R(0, 20, W, 54, "#7cc85a"); for (let i = 0; i < 120; i++) R((i * 37) % W, 22 + (i * 53) % 52, 1, 1, "#68b048");
    R(76, 16, 16, 12, "#c9935a"); R(74, 14, 20, 3, "#b0303a"); R(76, 13, 16, 2, "#b0303a"); R(82, 21, 4, 7, "#7a4a24"); R(4, 22, 66, 1, "#c9935a"); for (let x = 4; x < 70; x += 6) R(x, 20, 1, 4, "#c9935a"); return g; };
  window.qqdog = () => { const g = grid(26, 26), { P, R, E } = pen(g); const B = "#d9934a", B2 = "#b8723a", D = "#8a4e24", W2 = "#fff4e0", K = "#2a1a10";
    E(13, 19, 7, 6, B); E(13, 20.5, 4, 4, W2); R(8, 23, 4, 2, W2); R(14, 23, 4, 2, W2); E(21, 21, 2, 1.5, B2); E(13, 10, 8, 7, B); E(5.5, 10, 2.5, 5, D); E(20.5, 10, 2.5, 5, D); E(13, 13, 4.5, 3, W2);
    R(9, 8, 3, 3, K); R(15, 8, 3, 3, K); P(9, 8, "#fff"); P(15, 8, "#fff"); R(12, 11, 3, 2, K); P(12, 11, "#5a4a40"); P(11, 14, K); P(15, 14, K); R(12, 15, 3, 1, K); R(12, 16, 3, 1, "#ff7a8a");
    R(7, 12, 2, 1, "#ffb0a0"); R(18, 12, 2, 1, "#ffb0a0"); R(7, 16, 13, 2, "#e8303a"); R(12, 18, 3, 2, "#ffd84a"); return outline(g, "#3a2010"); };
  const TOOLS = { hoe: ["......kk",".....kbk","....kbk.","...kbk..","..kbk...","kkkk....","kssk....",".kk....."], water: ["..kkkk..",".kbbbbk.","kbbbbbbk","kbbbbbbk","kbbbbbbk",".kbbbbk.","..kkkk..","........"],
    weed: ["........","k..k..k.","kk.k.kk.",".kkkkk..","..kkk...","...k....","........","........"], bug: ["k...k...",".k.k....",".kkk....","kRkRk...","kkkkk...",".k.k....","........","........"],
    seed: ["..kkkk..",".kyyyyk.","kyybyyyk","kyyyybyk","kybyyyyk",".kyyyyk.","..kkkk..","........"], hand: [".k.k.k..",".kskskk.",".ksssssk","kksssssk","ksssssk.",".kssssk.","..kkkk..","........"] };
  window.qqtool = k => fromMap(TOOLS[k], { k: "#4a2a10", b: "#5ab4ff", s: "#ffd8b0", y: "#e8c070", R: "#e8303a" });
  // 漂流瓶：海边（96×100）、瓶子、海星
  window.qqbeach = () => { const W = 96, H = 100, g = grid(W, H), { R } = pen(g); R(0, 0, W, 40, "#ffcf9a"); R(0, 0, W, 18, "#ffb07a"); R(60, 20, 14, 14, "#fff1a8"); R(58, 24, 18, 6, "#fff1a8");
    R(0, 38, W, 40, "#3a8fd0"); for (let y = 40; y < 78; y += 5) for (let x = (y % 10 ? 0 : 6); x < W; x += 12) R(x, y, 5, 1, "#7cc4ff"); R(0, 38, W, 2, "#ffd6a0");
    R(0, 78, W, 22, "#f5d9a0"); R(0, 76, W, 3, "#fff"); for (let x = 0; x < W; x += 7) R(x, 77, 4, 1, "#7cc4ff"); for (let i = 0; i < 60; i++) R((i * 29) % W, 80 + (i * 13) % 20, 1, 1, "#e0bc80");
    R(30, 58, 8, 4, "#a8e6c8"); R(38, 59, 2, 2, "#7a5030"); R(31, 59, 3, 1, "#fff"); R(70, 66, 7, 3, "#a8e6c8"); R(77, 67, 2, 1, "#7a5030"); return g; };
  window.qqbottle = () => fromMap(["............","..........kk",".........kbbk","..kkkkkkkkbk.",".kgggggggkk..","kgwwgggggk...","kggggggggk...","kgwwwwwggk...",".kggggggk....","..kkkkkk....."].map(r => r.padEnd(13, ".").slice(0, 13)), { k: "#2a5a4a", g: "#a8e6c8", w: "#fff", b: "#8a6040" });
  window.qqstar = () => outline(fromMap(["....o....","....o....","...ooo...","ooooOoooo",".ooOOOoo.","..ooooo..",".oo...oo.","oo.....oo"], { o: "#ff7a5a", O: "#ffb08a" }), "#a8402a");
})();
