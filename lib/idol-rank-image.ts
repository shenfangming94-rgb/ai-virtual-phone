/**
 * 爱豆小手机：把月末排名画成一张「打印出来贴在墙上」的图（不用 AI 生图，名字不会错）。
 */

export type RankRow = { rank: number; name: string; group: string; change: string };

const FONT = `"PingFang SC", "Hiragino Sans GB", "Apple SD Gothic Neo", sans-serif`;

export function drawRankImage(title: string, sub: string, rows: RankRow[], notes: string[]): string {
  const W = 750;
  const rowH = 44;
  const top = 150;
  const H = top + rows.length * rowH + 60 + notes.length * 30 + 40;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  // 纸
  g.fillStyle = "#fbfaf7";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(0,0,0,0.018)";
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  // 标题
  g.fillStyle = "#111";
  g.textAlign = "center";
  g.font = `700 34px ${FONT}`;
  g.fillText(title, W / 2, 62);
  g.fillStyle = "#777";
  g.font = `400 20px ${FONT}`;
  g.fillText(sub, W / 2, 98);
  // 表头
  const L = 40, R = W - 40;
  const col = { rank: L + 30, name: L + 90, group: L + 380, change: R - 40 };
  g.fillStyle = "#222";
  g.fillRect(L, top - 34, R - L, 3);
  g.font = `600 22px ${FONT}`;
  g.textAlign = "center"; g.fillText("名次", col.rank, top - 8);
  g.textAlign = "left"; g.fillText("姓名", col.name, top - 8); g.fillText("组别", col.group, top - 8);
  g.textAlign = "center"; g.fillText("变化", col.change, top - 8);
  g.fillRect(L, top + 4, R - L, 1.5);
  // 行
  rows.forEach((r, i) => {
    const y = top + 4 + (i + 1) * rowH;
    g.font = `400 22px ${FONT}`;
    g.fillStyle = "#111";
    g.textAlign = "center"; g.fillText(String(r.rank), col.rank, y - 14);
    g.textAlign = "left"; g.fillText(r.name, col.name, y - 14);
    g.fillText(r.group, col.group, y - 14);
    g.textAlign = "center";
    g.fillStyle = r.change.startsWith("↑") ? "#d22" : r.change.startsWith("↓") ? "#36c" : "#999";
    g.fillText(r.change, col.change, y - 14);
    g.fillStyle = "#ddd8cc";
    g.fillRect(L, y, R - L, 1);
  });
  // 备注
  let y = top + 4 + rows.length * rowH + 44;
  g.textAlign = "left";
  g.fillStyle = "#777";
  g.font = `400 19px ${FONT}`;
  for (const n of notes) { g.fillText(`· ${n}`, L, y); y += 30; }
  // 章
  const cx = R - 60, cy = top + 4 + rows.length * rowH + 50;
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.21);
  g.globalAlpha = 0.75;
  g.strokeStyle = "#c33";
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 48, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#c33";
  g.textAlign = "center";
  g.font = `500 19px ${FONT}`;
  g.fillText("练习生", 0, -4);
  g.fillText("管理组", 0, 20);
  g.restore();
  return c.toDataURL("image/jpeg", 0.88);
}
