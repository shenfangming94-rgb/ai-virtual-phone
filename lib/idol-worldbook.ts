/**
 * 爱豆小手机：自动更新的世界书「爱豆世界（自动）」。
 *
 * 两条常驻条目：她是谁（分外界知道的 / 只有身边人知道的）、圈内最近（前后一个月的圈内大事和身边正在发生的事）。
 * - 走绑定的 app（KakaoTalk、剧情等）：resolveBinding 自动带上这本，不用她在绑定里勾
 * - 自定义 app（微博、豆瓣、小红书、以后装的）：ai.chat 调用时自动垫在最前面
 * 发动机每 5 秒看一眼，内容变了才写。她可以在世界书里看，但改了会被下次更新盖掉。
 */

import { rosterPrompt } from "./idol-groups";
import { loadWorldBooks, saveWorldBooks } from "./settings-storage";
import type { WorldBookConfig, WorldBookEntry } from "./settings-types";
import { companyOf, loadCareer } from "./idol-career";
import { loadTraineeCard, describeTrainee } from "./trainee-card";
import { loadCharacters } from "./character-storage";
import { fameNow, fameWord, eventsPlainFeed } from "./idol-events";
import { almanacBetween } from "./idol-calendar";
import { loadDebut } from "./idol-debut";

export const IDOL_WORLD_BOOK_ID = "wb_idol_world_auto";
const DAY = 864e5;
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const md = (iso: string) => `${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;

/** 她是谁：外界知道的 / 只有她和身边人知道的 */
export function whoText(): string {
  const card = loadTraineeCard();
  if (!card) return "";
  const career = loadCareer();
  const c = companyOf(career.companyId);
  const debut = loadDebut();
  const now = new Date();
  const fame = fameWord(fameNow());
  const pub: string[] = [];
  const priv: string[] = [];
  if (career.stage === "pre" || !c) {
    pub.push(`${card.name}：普通人，还没进任何娱乐公司，在准备试镜。${fame}`);
  } else if (career.stage === "idol" && debut?.team) {
    pub.push(`${card.name}：${c.name} 女团 ${debut.team.en.toUpperCase()}（${debut.team.ko}）的成员，${debut.debutAt ? `${new Date(debut.debutAt).getFullYear()}年${new Date(debut.debutAt).getMonth() + 1}月${new Date(debut.debutAt).getDate()}日出道` : "刚出道"}，出道曲《${debut.song ?? ""}》。`);
    pub.push(`成员：${debut.members?.map(m => `${m.name}（${m.positions.map(p => p.zh).join("、")}）`).join("、")}`);
    pub.push(`关注度：${fame}`);
  } else {
    pub.push(`${card.name}：${c.name} 的练习生（练习生不公开活动，外界知道她的只有看过公司练习生视频、伴舞、路透的人）。关注度：${fame}`);
  }
  priv.push(describeTrainee(card));
  if (c && career.signedAt) priv.push(`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日，进公司第 ${Math.max(1, Math.floor((now.getTime() - career.signedAt) / DAY) + 1)} 天。`);
  if (career.roommates?.length) priv.push(`室友：${career.roommates.map(id => loadCharacters().find(x => x.id === id)?.name).filter(Boolean).join("、")}`);
  if (debut && career.stage !== "idol") {
    if (debut.status === "waiting") priv.push(debut.delays.length ? `出道：之前没进出道组（${debut.delays.join("；")}），在等下一次选拔。` : "出道：公司在筹备新女团，还没选出道组。");
    else priv.push(`出道：进了 ${c?.name ?? ""} 新女团出道组（对外保密），${debut.status === "named" && debut.team ? `队名 ${debut.team.en}` : `暂定名 ${debut.codename}`}，${debut.debutAt ? `${md(isoOf(debut.debutAt))}出道` : ""}。成员：${debut.members?.map(m => m.name).join("、")}`);
  }
  return [`【外界知道的】\n${pub.join("\n")}`, `【只有她和身边人知道的（路人、网友不知道）】\n${priv.join("\n")}`].join("\n\n");
}

/** 圈内最近：前后一个月的圈内大事 + 身边正在发生的事 */
export function circleText(): string {
  if (!loadTraineeCard()) return "";
  const now = Date.now();
  const items = almanacBetween(isoOf(now - 30 * DAY), isoOf(now + 30 * DAY)).filter(i => i.kind === "world" || i.kind === "career" || i.kind === "fixed");
  const today = isoOf(now);
  const past = items.filter(i => i.date <= today).map(i => `- ${md(i.date)}：${i.company ? `${i.company} · ` : ""}${i.title}${i.note ? `（${i.note}）` : ""}`);
  const next = items.filter(i => i.date > today).map(i => `- ${md(i.date)}：${i.company ? `${i.company} · ` : ""}${i.title}${i.note ? `（${i.note}）` : ""}`);
  const feed = eventsPlainFeed();
  return [
    `现在是 ${new Date(now).getFullYear()}年${new Date(now).getMonth() + 1}月${new Date(now).getDate()}日。圈里的团和人都是这个世界里虚构的。`,
    past.length ? `【最近一个月】\n${past.join("\n")}` : "",
    next.length ? `【接下来一个月】\n${next.join("\n")}` : "",
    feed.length ? `【她身边最近的事（外人多半不知道）】\n${feed.join("\n")}` : "",
    rosterPrompt(25),
  ].filter(Boolean).join("\n\n");
}

/** 给自定义 app 垫在最前面的那段 */
export function idolWorldPrompt(): string {
  const who = whoText();
  if (!who) return "";
  return `# 这个世界（爱豆小手机，自动更新）\n## 用户是谁\n${who}\n\n## 圈内\n${circleText()}`;
}

function entry(uid: string, comment: string, content: string, order: number): WorldBookEntry {
  return { uid, key: "", content, comment, use_regex: false, disable: false, constant: true, position: "before_char", insertion_order: order };
}

let lastSig = "";
export function syncIdolWorldBook(): void {
  const who = whoText();
  if (!who) return;
  const circle = circleText();
  const sig = who + "\u0000" + circle;
  if (sig === lastSig) return;
  lastSig = sig;
  const books = loadWorldBooks();
  const now = Date.now();
  const prev = books.find(b => b.id === IDOL_WORLD_BOOK_ID);
  const book: WorldBookConfig = {
    id: IDOL_WORLD_BOOK_ID,
    name: "爱豆世界（自动）",
    description: "小手机自己维护：她是谁、圈内最近发生了什么。所有 app 自动带上，手动改会被下次更新盖掉。",
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    entries: [entry("idol_who", "她是谁", who, 10), entry("idol_circle", "圈内最近", circle, 20)],
  };
  saveWorldBooks(prev ? books.map(b => (b.id === IDOL_WORLD_BOOK_ID ? book : b)) : [...books, book]);
}

export function hasIdolWorldBook(): boolean {
  return loadWorldBooks().some(b => b.id === IDOL_WORLD_BOOK_ID);
}
