/**
 * 爱豆小手机：出道那一套的三张图（照 docs/idol/mockups/debut 定稿画，不用 AI 生图，名字不会错）。
 * d1 出道组确定名单（内部文件）/ d2 出道组成员定位卡 / d3 队名海报（柔光晕 + 衬线 L 混细体）
 */

const SANS = `"PingFang SC", "Hiragino Sans GB", "Apple SD Gothic Neo", sans-serif`;
const SERIF = `"Didot", "Bodoni 72", "Times New Roman", serif`;
const THIN = `"Avenir Next", "Helvetica Neue", "PingFang SC", sans-serif`;

export type ListRow = { name: string; ko: string; nation: string; birthday: string };
export type PositionCol = { name: string; avatar?: string | null; color: string; positions: { zh: string; ko: string }[] };
export type Team = { en: string; ko: string; meaning: string; meaningKo: string };

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "center" | "right" = "left") {
  const chars = Array.from(text);
  const widths = chars.map(ch => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const prev = g.textAlign;
  g.textAlign = "left";
  chars.forEach((ch, i) => { g.fillText(ch, cx, y); cx += widths[i] + spacing; });
  g.textAlign = prev;
}

function stamp(g: CanvasRenderingContext2D, x: number, y: number, r: number, lines: string[]) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.21);
  g.globalAlpha = 0.8;
  g.strokeStyle = "#c8202f";
  g.fillStyle = "#c8202f";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = "center";
  g.font = `500 ${Math.round(r * 0.36)}px ${SANS}`;
  lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * r * 0.46 + r * 0.13));
  g.restore();
}

/** d1：出道组确定名单（白纸公文，表格五列） */
export function drawDebutList(o: { company: string; docNo: string; date: string; codename: string; members: ListRow[]; notes: string[] }): string {
  const W = 790;
  const rowH = 96;
  // 先量说明文字占几行，表格紧跟在后面
  const probe = canvas(10, 10).g;
  probe.font = `400 23px ${SANS}`;
  const introText = `经内部评估与艺术总监会议决定，以下${o.members.length}名练习生确定为本公司新人女团出道成员。出道日期、队名、各成员定位另行通知。`;
  const introEnd = wrap(probe, introText, 0, 430, W - 104, 44);
  const tableTop = introEnd + 70;
  const H = tableTop + 92 + o.members.length * rowH + 60 + o.notes.length * 40 + 150;
  const { c, g } = canvas(W, H);
  g.fillStyle = "#fdfcf9";
  g.fillRect(0, 0, W, H);
  const L = 48, R = W - 48;
  g.fillStyle = "#111";
  g.font = `800 25px ${SANS}`;
  spaced(g, `${o.company.toUpperCase()} ENTERTAINMENT`, L, 82, 4);
  g.fillStyle = "#666";
  g.font = `400 19px ${SANS}`;
  g.textAlign = "right";
  g.fillText("신인개발팀 新人开发组", R, 84);
  g.fillStyle = "#111";
  g.fillRect(L, 100, R - L, 4);
  g.fillStyle = "#888";
  g.font = `400 19px ${SANS}`;
  g.textAlign = "left";
  g.fillText(`文件编号 ${o.docNo}`, L, 140);
  g.textAlign = "right";
  g.fillText(o.date, R, 140);
  // 对外保密章
  g.save();
  g.translate(R - 70, 240);
  g.rotate(-0.16);
  g.globalAlpha = 0.8;
  g.strokeStyle = "#c8202f";
  g.lineWidth = 4.5;
  g.strokeRect(-62, -40, 124, 80);
  g.fillStyle = "#c8202f";
  g.textAlign = "center";
  g.font = `800 25px ${SANS}`;
  spaced(g, "대외비", 0, -2, 4, "center");
  g.font = `600 16px ${SANS}`;
  spaced(g, "对外保密", 0, 24, 2, "center");
  g.restore();
  // 标题
  g.fillStyle = "#111";
  g.font = `800 42px ${SANS}`;
  spaced(g, "出道组确定名单", W / 2, 275, 8, "center");
  g.fillStyle = "#777";
  g.font = `400 21px ${SANS}`;
  spaced(g, "데뷔조 확정 명단", W / 2, 320, 4, "center");
  spaced(g, `新人女团出道项目 · 暂定名 ${o.codename}`, W / 2, 356, 3, "center");
  // 说明
  g.fillStyle = "#333";
  g.font = `400 23px ${SANS}`;
  g.textAlign = "left";
  wrap(g, introText, L + 4, 430, R - L - 8, 44);
  // 表
  g.fillStyle = "#111";
  g.fillRect(L, tableTop - 32, R - L, 2.5);
  const col = { n: L + 26, name: L + 64, nation: L + 290, birth: L + 400, pos: R - 60 };
  const heads: [string, string, number][] = [["姓名", "이름", col.name], ["国籍", "국적", col.nation], ["出生日期", "생년월일", col.birth], ["定位", "포지션", col.pos]];
  for (const [zh, ko, x] of heads) {
    g.fillStyle = "#555";
    g.font = `600 20px ${SANS}`;
    g.fillText(zh, x, tableTop + 6);
    g.fillStyle = "#999";
    g.font = `400 17px ${SANS}`;
    g.fillText(ko, x, tableTop + 36);
  }
  g.fillStyle = "#111";
  g.fillRect(L, tableTop + 56, R - L, 2.5);
  let y = tableTop + 56;
  o.members.forEach((m, i) => {
    const mid = y + rowH / 2;
    g.fillStyle = "#999";
    g.font = `400 24px ${SANS}`;
    g.textAlign = "center";
    g.fillText(String(i + 1), col.n, mid + 8);
    g.textAlign = "left";
    g.fillStyle = "#111";
    g.font = `400 25px ${SANS}`;
    g.fillText(m.name, col.name, mid - 2);
    g.fillStyle = "#999";
    g.font = `400 17px ${SANS}`;
    g.fillText(m.ko, col.name, mid + 28);
    g.fillStyle = "#111";
    g.font = `400 25px ${SANS}`;
    g.fillText(m.nation, col.nation, mid + 9);
    g.fillText(m.birthday, col.birth, mid + 9);
    g.fillStyle = "#aaa";
    g.fillText("待定", col.pos, mid + 9);
    y += rowH;
    g.fillStyle = "#e3dfd5";
    g.fillRect(L, y, R - L, 1.5);
  });
  // 注意事项
  g.fillStyle = "#666";
  g.font = `400 21px ${SANS}`;
  y += 56;
  for (const n of o.notes) { g.fillText(`· ${n}`, L, y); y += 40; }
  // 落款
  g.fillStyle = "#333";
  g.font = `400 23px ${SANS}`;
  g.textAlign = "right";
  g.fillText("新人开发组", R - 110, y + 58);
  stamp(g, R - 46, y + 50, 44, [o.company.toUpperCase().slice(0, 6), "신인", "개발"]);
  return c.toDataURL("image/jpeg", 0.92);
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
  let line = "";
  for (const ch of Array.from(text)) {
    if (g.measureText(line + ch).width > maxW && line) { g.fillText(line, x, y); y += lineH; line = ch; }
    else line += ch;
  }
  if (line) { g.fillText(line, x, y); y += lineH; }
  return y;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** d2：出道组 · 成员定位（白卡，五人横排，头像 + 名字 + 定位中文下面小字韩文） */
export async function drawPositionCard(o: { company: string; codename: string; date: string; members: PositionCol[] }): Promise<string> {
  const n = o.members.length;
  const W = Math.max(560, n * 112);
  const colW = W / n;
  const maxPos = Math.max(1, ...o.members.map(m => m.positions.length));
  const top = 200;
  const H = top + 150 + maxPos * 68 + 30 + 64;
  const { c, g } = canvas(W, H);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.textAlign = "center";
  g.fillStyle = "#9a9a9a";
  g.font = `400 18px ${SANS}`;
  spaced(g, "MEMBER POSITION", W / 2, 58, 6, "center");
  g.fillStyle = "#222";
  g.font = `600 36px ${SANS}`;
  spaced(g, "出道组 · 成员定位", W / 2, 112, 4, "center");
  g.fillStyle = "#888";
  g.font = `400 21px ${SANS}`;
  g.fillText("데뷔조 멤버 포지션", W / 2, 152);
  g.fillStyle = "#eee";
  g.fillRect(0, top - 22, W, 2);
  for (let i = 0; i < n; i++) {
    const m = o.members[i];
    const cx = colW * i + colW / 2;
    if (i > 0) { g.fillStyle = "#f0f0f0"; g.fillRect(colW * i, top - 20, 2, H - top - 44); }
    const r = 34, cy = top + 30;
    const img = m.avatar ? await loadImg(m.avatar) : null;
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    if (img) {
      const s = Math.max(2 * r / img.width, 2 * r / img.height);
      g.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
    } else {
      g.fillStyle = m.color;
      g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      g.fillStyle = "#fff";
      g.font = `600 26px ${SANS}`;
      g.fillText(Array.from(m.name)[0] ?? "", cx, cy + 9);
    }
    g.restore();
    g.fillStyle = "#222";
    g.font = `600 ${m.name.length > 4 ? 19 : 22}px ${SANS}`;
    g.fillText(m.name, cx, top + 108);
    let py = top + 158;
    for (const p of m.positions) {
      g.fillStyle = "#444";
      g.font = `400 21px ${SANS}`;
      g.fillText(p.zh, cx, py);
      g.fillStyle = "#aaa";
      g.font = `400 15px ${SANS}`;
      g.fillText(p.ko, cx, py + 24);
      py += 68;
    }
  }
  g.fillStyle = "#f7f7f5";
  g.fillRect(0, H - 56, W, 56);
  g.fillStyle = "#999";
  g.font = `400 19px ${SANS}`;
  g.fillText(`${o.codename} · ${o.date} · ${o.company} 新人开发组`, W / 2, H - 21);
  return c.toDataURL("image/jpeg", 0.92);
}

/** d3：队名海报（紫粉蓝光晕 + 颗粒；第一个字母衬线斜体，其余细体，末尾一颗发光圆点） */
export function drawTeamPoster(o: { company: string; month: string; team: Team; members: string[] }): string {
  const W = 860, H = 1290;
  const { c, g } = canvas(W, H);
  g.fillStyle = "#e9e4f2";
  g.fillRect(0, 0, W, H);
  const blob = (x: number, y: number, r: number, color: string) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, color);
    grd.addColorStop(0.5, color.replace(/[\d.]+\)$/, "0.75)"));
    grd.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  };
  blob(110, 170, 640, "rgba(190,166,245,1)");
  blob(860, 660, 560, "rgba(255,190,216,1)");
  blob(250, 1260, 600, "rgba(160,194,245,1)");
  blob(450, 700, 240, "rgba(255,244,228,0.95)");
  // 颗粒
  g.fillStyle = "rgba(60,40,90,0.05)";
  for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < W; x += 6) g.fillRect(x, y, 1.2, 1.2);
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.font = `400 19px ${SANS}`;
  g.textAlign = "left";
  spaced(g, `${o.company.toUpperCase()} NEW GIRL GROUP`, 60, 92, 6);
  g.textAlign = "right";
  spaced(g, o.month, W - 60, 92, 4, "right");
  // 队名
  const name = o.team.en.toUpperCase();
  const first = name.slice(0, 1), rest = name.slice(1);
  g.shadowColor = "rgba(255,255,255,0.8)";
  g.shadowBlur = 40;
  g.fillStyle = "#fff";
  const big = rest.length > 7 ? 150 : 192;
  const small = Math.round(big * 0.69);
  g.font = `italic 400 ${big}px ${SERIF}`;
  const w1 = g.measureText(first).width;
  g.font = `200 ${small}px ${THIN}`;
  const sp = small * 0.09;
  const w2 = Array.from(rest).reduce((a, ch) => a + g.measureText(ch).width + sp, 0);
  const total = w1 + 4 + w2 + 26;
  const scale = Math.min(1, (W - 100) / total);
  g.save();
  g.translate(W / 2 - (total * scale) / 2, 690);
  g.scale(scale, scale);
  g.font = `italic 400 ${big}px ${SERIF}`;
  g.textAlign = "left";
  g.fillText(first, 0, 0);
  g.font = `200 ${small}px ${THIN}`;
  let x = w1 + 4;
  for (const ch of Array.from(rest)) { g.fillText(ch, x, 0); x += g.measureText(ch).width + sp; }
  g.beginPath();
  g.arc(x + 12, -small * 0.3, 10, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.shadowColor = "rgba(110,80,170,0.55)";
  g.shadowBlur = 14;
  g.font = `600 28px ${SANS}`;
  spaced(g, o.team.ko, W / 2, 790, 16, "center");
  g.shadowBlur = 18;
  g.shadowColor = "rgba(120,90,180,0.4)";
  g.font = `400 25px ${SANS}`;
  g.textAlign = "left";
  // 一句一行（句号、感叹号、问号处断开），太长再自动折
  let y = 1000;
  for (const s of o.team.meaning.split(/(?<=[。！？!?])/).map(x => x.trim()).filter(Boolean)) y = wrap(g, s, 60, y, W - 120, 46);
  g.font = `400 20px ${SANS}`;
  wrap(g, o.team.meaningKo, 60, y - 4, W - 120, 34);
  g.shadowBlur = 0;
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fillRect(60, 1170, W - 120, 1.5);
  g.fillStyle = "#fff";
  g.font = `500 21px ${SANS}`;
  spaced(g, o.members.join(" · "), 60, 1212, 3);
  return c.toDataURL("image/jpeg", 0.9);
}
