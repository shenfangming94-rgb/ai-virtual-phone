/**
 * 爱豆小手机：公司心里的那本账，和每个月的月末排名。
 *
 * 账（她看不到数字）：考核表现（演了按戏里判、打勾按她写的那句）、缺席扣、请假不扣、完成机会加、老师对她的印象。
 * 月考完第二天上午十点，室长在练习生群里发结果和一张排名表（代码画的图）；同期在群里反应。
 * 她的名次从账来，一个月最多升降八名；考前写了「想要的结果」就照那个排；排名页能「改我的名次」。
 */

import { afterMonthlyRank } from "./idol-leave";
import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import { createOrGetSession, loadChatContacts, loadChatSessions, pushChatMessage, updateMessageMediaUrl } from "./chat-storage";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { companyOf, loadCareer, type CareerNode } from "./idol-career";
import { getProfile, loadProfiles, relationOf, RELATIONS } from "./idol-people";
import { loadTraineeCard } from "./trainee-card";
import { crowdOf } from "./idol-crowd";
import { drawRankImage, type RankRow } from "./idol-rank-image";

const KEY = "idol_ledger_v1";
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const ME = "__me__";

type Entry = { at: number; delta: number; why: string };
export type MonthRank = {
  month: string;          // 2015-03
  nodeId: string;
  rank: number;
  total: number;
  prevRank?: number;
  comment: string;        // 老师给她的评语
  rows: { id: string; name: string; group: string; rank: number; change: string }[];
  image: string;
  messageId?: string;
  at: number;
};
type State = { entries: Entry[]; levels: Record<string, number>; months: MonthRank[]; ranked: string[] };

function load(): State {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as State | null;
    if (raw) return { entries: raw.entries ?? [], levels: raw.levels ?? {}, months: raw.months ?? [], ranked: raw.ranked ?? [] };
  } catch { /* 坏数据当新的 */ }
  return { entries: [], levels: {}, months: [], ranked: [] };
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); }

export const RANK_EVENT = "idol-rank-changed";
export function loadMonths(): MonthRank[] { return load().months; }

// ── 记账 ──

export function addEntry(delta: number, why: string): void {
  const s = load();
  save({ ...s, entries: [...s.entries, { at: Date.now(), delta, why }].slice(-200) });
}

const EXAM = new Set(["weekly", "monthly", "makeup", "selection"]);

/** 打勾写的那句换成分数（写了好的就加得多，写了坏的就扣） */
export function scoreResultText(text: string): number {
  if (/第一|惊艳|满分|全场|最好|夸|表扬|出色|进步|好评/.test(text)) return 3;
  if (/失误|忘|批评|骂|不好|倒数|没过|崩/.test(text)) return -2;
  return 1;
}

export function recordNodeDone(node: CareerNode, result: string): void {
  if (EXAM.has(node.kind)) addEntry(scoreResultText(result), `${node.title}：${result || "照常完成"}`);
  else if (node.kind === "chance") addEntry(3, `完成了${node.title}`);
}
export function recordAbsent(node: CareerNode): void {
  if (EXAM.has(node.kind) || node.kind === "talk") addEntry(-4, `${node.title}缺席`);
}
/** 戏里演的考核：记账时 AI 判的表现 */
export function recordPerformance(node: CareerNode, perf: string, why: string): void {
  if (!EXAM.has(node.kind) && node.kind !== "chance") return;
  const d = perf === "good" ? 4 : perf === "bad" ? -2 : 1;
  addEntry(node.kind === "chance" ? d + 2 : d, `${node.title}：${why || perf}`);
}

// ── 排名 ──

function myGroup(): string {
  const t = loadTraineeCard()?.talents ?? [];
  return t.includes("vocal") ? "vocal 组" : t.includes("rap") ? "rap 组" : "舞蹈组";
}
function crowdGroup(role: string): string {
  return /vocal/.test(role) ? "vocal 组" : /rap/.test(role) ? "rap 组" : "舞蹈组";
}

/** 参加排名的：她、跟她同一边的主要练习生、群里的路人 */
function participants(): { id: string; name: string; group: string; hurt: boolean }[] {
  const card = loadTraineeCard();
  const list: { id: string; name: string; group: string; hurt: boolean }[] = [{ id: ME, name: card?.name || "我", group: myGroup(), hurt: false }];
  const profiles = loadProfiles();
  for (const c of loadCharacters()) {
    const p = profiles[c.id];
    if (!p || p.gender === "男" || p.leave?.phase === "left" || !/练习生|室友|同期/.test(`${p.role}${p.group}`) || /老师|管理/.test(p.role)) continue;
    list.push({ id: c.id, name: c.name, group: crowdGroup(`${p.role}`), hurt: /受伤|扭伤|生病|住院/.test(p.status?.text ?? "") });
  }
  try {
    const gid = (JSON.parse(kvGet("idol_kakao_v1") || "null") as { groupId?: string } | null)?.groupId;
    if (gid) for (const m of crowdOf(gid)) if (!m.promotedTo) list.push({ id: m.id, name: m.name, group: crowdGroup(m.role), hurt: false });
  } catch { /* 没群就算了 */ }
  return list;
}

/** 她这个月的分：这个月的账 + 底子（特长）+ 老师印象 */
function myMonthScore(since: number): number {
  const s = load();
  const month = s.entries.filter(e => e.at >= since).reduce((a, e) => a + e.delta, 0);
  const talents = loadTraineeCard()?.talents.length ?? 0;
  let teacher = 0;
  try {
    const tid = (JSON.parse(kvGet("idol_kakao_v1") || "null") as { teacherId?: string } | null)?.teacherId;
    if (tid) teacher = (RELATIONS.indexOf(relationOf(getProfile(tid)) as typeof RELATIONS[number]) - RELATIONS.indexOf("认识")) * 0.8;
  } catch { /* 没老师 */ }
  return month + talents * 0.6 + teacher;
}

function wishRank(wish: string | undefined, total: number): number | null {
  if (!wish) return null;
  if (/第一|冠军|榜首/.test(wish)) return 1;
  const m = wish.match(/第\s*(\d+)/) || wish.match(/前\s*(\d+)/);
  if (m) return Math.max(1, Math.min(total, wish.includes("前") ? Math.ceil(Math.random() * +m[1]) : +m[1]));
  const cn = wish.match(/前([一二三四五六七八九十])/);
  if (cn) return 1 + Math.floor(Math.random() * ("一二三四五六七八九十".indexOf(cn[1]) + 1));
  return null;
}

/** 算一个月的名次（不发出去） */
function computeRank(node: CareerNode): MonthRank {
  const s = load();
  const people = participants();
  const prev = s.months[s.months.length - 1];
  const prevPos = new Map(prev?.rows.map(r => [r.id, r.rank]) ?? []);
  const levels = { ...s.levels };
  // 别人：有一个藏着的水平，每月小幅波动；受伤生病那个月掉一点
  for (const p of people) {
    if (p.id === ME) continue;
    if (levels[p.id] == null) levels[p.id] = 40 + Math.random() * 40;
    levels[p.id] += (Math.random() - 0.5) * 8 - (p.hurt ? 6 : 0);
  }
  // 她：新人第一次从中间偏后起步
  const since = prev ? prev.at : (loadCareer().signedAt ?? 0);
  const score = myMonthScore(since);
  const others = people.filter(p => p.id !== ME).map(p => levels[p.id]).sort((a, b) => b - a);
  if (levels[ME] == null) levels[ME] = others[Math.floor(others.length * 0.68)] ?? 50;
  levels[ME] += score * 2.2;
  const sorted = [...people].sort((a, b) => levels[b.id] - levels[a.id]);
  let myRank = sorted.findIndex(p => p.id === ME) + 1;
  const total = sorted.length;
  // 一个月最多升降八名（考核演得特别好的那个月放宽）
  if (prev && prev.rank) {
    const big = s.entries.some(e => e.at >= since && e.delta >= 4);
    const cap = big ? 14 : 8;
    myRank = Math.max(prev.rank - cap, Math.min(prev.rank + cap, myRank));
  }
  const wanted = wishRank(node.wish, total);
  if (wanted) myRank = wanted;
  const order = sorted.filter(p => p.id !== ME);
  order.splice(myRank - 1, 0, sorted.find(p => p.id === ME)!);
  // 让她的水平跟名次对上，下个月接着算
  const above = order[myRank - 2], below = order[myRank];
  levels[ME] = above && below ? (levels[above.id] + levels[below.id]) / 2 : above ? levels[above.id] - 1 : below ? levels[below.id] + 1 : levels[ME];
  save({ ...load(), levels });
  const rows = order.map((p, i) => {
    const before = prevPos.get(p.id);
    // 第一次排名没得比，都写「—」；之后只有新进来的人才是 NEW
    const change = !prev ? "—" : before == null ? "NEW" : before === i + 1 ? "—" : before > i + 1 ? `↑${before - i - 1}` : `↓${i + 1 - before}`;
    return { id: p.id, name: p.name, group: p.group, rank: i + 1, change };
  });
  const d = new Date(node.dueAt);
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { month, nodeId: node.id, rank: myRank, total, prevRank: prev?.rank, comment: "", rows, image: "", at: Date.now() };
}

function imageFor(r: MonthRank): string {
  const [y, m] = r.month.split("-");
  const company = companyOf(loadCareer().companyId)?.name ?? "";
  const tail = Math.min(5, Math.max(0, r.total - 1));
  return drawRankImage(`${y}年${+m}月 月末评价结果`, `${company} 娱乐 练习生管理组 · 评委：声乐/舞蹈/形象 三组`, r.rows.map<RankRow>(x => ({ rank: x.rank, name: x.name, group: x.group, change: x.change })), [
    `排名后${tail}名下周一 10:00 到办公室面谈。`,
    "下个月考核内容另行通知。",
  ]);
}

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

/** 老师的话、给她的评语、同期的反应（一次调用；失败就用平平的说法） */
async function words(r: MonthRank, teacherName: string, mates: string[], friends: string[]): Promise<{ announce: string; comment: string; reactions: { who: string; text: string }[]; dms: { who: string; text: string }[] }> {
  const me = loadTraineeCard()?.name || "她";
  const fallback = { announce: `${+r.month.split("-")[1]}月月末评价结果出来了，名单在下面。`, comment: "继续努力。", reactions: [], dms: [] };
  try {
    const recent = load().entries.filter(e => e.at >= (load().months.slice(-2)[0]?.at ?? 0)).slice(-6).map(e => e.why).join("；");
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `你在写韩国练习生公司月末评价出结果那天，KakaoTalk 练习生群里的几句话。只输出 JSON：{"announce":"室长${teacherName}在群里发结果时说的话，一两句","comment":"${teacherName}私下给${me}的一句评语，照她这个月的表现说","reactions":[{"who":"","text":""}],"dms":[{"who":"","text":""}]}。reactions 是群里两三个人看到结果的反应，只说自己的名次或泛泛的话，不在群里点评别人；dms 是跟${me}要好的人私聊她说的话（只用「她的朋友」里的名字，可以没有），提到她的名次要对得上。都要口语、短；第一次排名没有升降可说。` },
      { role: "user", content: `${me}这次第 ${r.rank} 名（共 ${r.total} 人）${r.prevRank ? `，上次第 ${r.prevRank} 名` : "，第一次排名"}。她这个月：${recent || "照常训练"}。前三名：${r.rows.slice(0, 3).map(x => x.name).join("、")}。群里可以说话的人：${mates.join("、") || "群里的路人"}。她的朋友：${friends.join("、") || "没有"}` },
    ], { temperature: 0.85, label: "月末排名" });
    const j = JSON.parse(res.content?.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { announce?: string; comment?: string; reactions?: { who?: string; text?: string }[]; dms?: { who?: string; text?: string }[] };
    return {
      announce: String(j.announce || fallback.announce),
      comment: String(j.comment || fallback.comment),
      reactions: (j.reactions ?? []).filter(x => x.who && x.text).map(x => ({ who: String(x.who), text: String(x.text) })).slice(0, 3),
      dms: (j.dms ?? []).filter(x => x.who && x.text && friends.includes(String(x.who))).map(x => ({ who: String(x.who), text: String(x.text) })).slice(0, 2),
    };
  } catch {
    return fallback;
  }
}

let busy = false;

/** 每 5 秒：月考结束（演了、打勾、请假、缺席都算）的第二天上午十点，发结果 */
export function rankTick(notify: (m: string) => void): void {
  if (busy) return;
  const career = loadCareer();
  if (career.stage !== "trainee") return;
  // 练习生群还没建好（路人还没进来）就先等等
  try { if (!(JSON.parse(kvGet("idol_kakao_v1") || "null") as { groupId?: string } | null)?.groupId) return; } catch { return; }
  const s = load();
  const now = Date.now();
  const node = career.nodes.find(n => n.kind === "monthly" && n.status !== "pending" && n.status !== "invite" && !s.ranked.includes(n.id));
  if (!node) return;
  const d = new Date(node.dueAt + DAY);
  d.setHours(10, 0, 0, 0);
  if (now < d.getTime()) return;
  busy = true;
  save({ ...s, ranked: [...s.ranked, node.id] });
  void publish(node, d.getTime(), notify).catch(err => console.warn("[idol-ledger] publish failed", err)).finally(() => { busy = false; });
}

async function publish(node: CareerNode, at: number, notify: (m: string) => void): Promise<void> {
  const r = computeRank(node);
  r.image = imageFor(r);
  const kakao = JSON.parse(kvGet("idol_kakao_v1") || "null") as { groupId?: string; teacherId?: string } | null;
  const teacher = kakao?.teacherId ? loadCharacters().find(c => c.id === kakao.teacherId) : undefined;
  const gid = kakao?.groupId && loadChatSessions().some(x => x.id === kakao.groupId) ? kakao.groupId : undefined;
  const mates = r.rows.filter(x => x.id !== ME).slice(0, 12).map(x => x.name);
  const contacts = new Set(loadChatContacts().map(c => c.characterId));
  const friendChars = loadCharacters().filter(c => contacts.has(c.id) && c.id !== teacher?.id && ["朋友", "好朋友", "暧昧", "恋人"].includes(relationOf(getProfile(c.id))));
  const w = await words(r, teacher?.name ?? "室长", mates, friendChars.map(c => c.name));
  r.comment = w.comment;
  if (gid && teacher) {
    const iso = (ms: number) => new Date(ms).toISOString();
    pushChatMessage({ sessionId: gid, role: "assistant", content: w.announce, senderCharacterId: teacher.id, senderName: teacher.name, status: "sent", createdAt: iso(at) });
    const img = pushChatMessage({ sessionId: gid, role: "assistant", content: "", mediaType: "image", mediaUrl: r.image, mediaData: { label: "月末评价结果.jpg" }, senderCharacterId: teacher.id, senderName: teacher.name, status: "sent", createdAt: iso(at + 1000) });
    r.messageId = img.id;
    const all = loadCharacters();
    w.reactions.forEach((x, i) => {
      const c = all.find(a => a.name === x.who);
      const crowdId = r.rows.find(row => row.name === x.who && row.id.startsWith("crowd_"))?.id;
      const sender = c?.id ?? crowdId;
      if (sender) pushChatMessage({ sessionId: gid, role: "assistant", content: x.text, senderCharacterId: sender, senderName: x.who, status: "sent", createdAt: iso(at + (i + 1) * 90e3) });
    });
  }
  w.dms.forEach((x, i) => {
    const c = friendChars.find(f => f.name === x.who);
    if (!c) return;
    const session = createOrGetSession(c.id);
    pushChatMessage({ sessionId: session.id, role: "assistant", content: x.text, status: "sent", createdAt: new Date(Math.max(at, Date.now() - 60e3) + (i + 3) * 60e3).toISOString() });
  });
  const s = load();
  save({ ...s, months: [...s.months, r] });
  try { afterMonthlyRank(r.rows, at); } catch { /* 走人的事出错不影响排名 */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RANK_EVENT));
  notify(`💬 月末评价结果出来了：第 ${r.rank} 名`);
}

/** 排名页「改我的名次」：表跟着重排，图重画（群里那张也换掉），账跟着改 */
export function overrideMyRank(month: string, rank: number): MonthRank | null {
  const s = load();
  const idx = s.months.findIndex(m => m.month === month);
  if (idx < 0) return null;
  const r = s.months[idx];
  const want = Math.max(1, Math.min(r.total, Math.round(rank)));
  const order = r.rows.filter(x => x.id !== ME);
  const me = r.rows.find(x => x.id === ME)!;
  order.splice(want - 1, 0, me);
  const prev = s.months[idx - 1];
  const prevPos = new Map(prev?.rows.map(x => [x.id, x.rank]) ?? []);
  const rows = order.map((p, i) => {
    const before = prevPos.get(p.id);
    return { ...p, rank: i + 1, change: !prev ? "—" : before == null ? "NEW" : before === i + 1 ? "—" : before > i + 1 ? `↑${before - i - 1}` : `↓${i + 1 - before}` };
  });
  const next: MonthRank = { ...r, rows, rank: want };
  next.image = imageFor(next);
  if (next.messageId) updateMessageMediaUrl(next.messageId, next.image);
  const months = s.months.map((m, i) => i === idx ? next : m);
  // 她的水平跟着名次走
  const levels = { ...s.levels };
  const above = rows[want - 2], below = rows[want];
  if (above || below) levels[ME] = above && below ? ((levels[above.id] ?? 50) + (levels[below.id] ?? 50)) / 2 : above ? (levels[above.id] ?? 50) - 1 : (levels[below!.id] ?? 50) + 1;
  save({ ...s, months, levels });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RANK_EVENT));
  return next;
}
