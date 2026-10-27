/**
 * 爱豆小手机：平常日子有人来找你（KakaoTalk 私聊）。
 *
 * - 一天（世界时间）最多两个人主动来找她，有的日子一个都没有；每人一次，一到三条
 * - 谁来：只有 KakaoTalk 好友；关系越好越勤，心动的人深夜多一点，刚找过的、正在聊的不来，老师不来
 * - 说什么：AI 照他的性格写，可以接着他们最近的事、说他自己今天的事、聊她接下来的日程
 * - 不打扰：她的考核/日程前后不来；跳时间跳过的日子不往回补，落地以后才来；跳过的日子当作照常相处、照常聊过，不会说好久没联系
 * - 见过面但没加好友的人：偶尔发好友申请（kakao incoming）
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import { loadProfiles, relationOf, type IdolProfile } from "./idol-people";
import { loadCareer } from "./idol-career";
import { loadChatContacts, loadChatSessions, loadChatMessages } from "./chat-storage";
import { queueMessage } from "./idol-reminders";
import { queueFriendRequest } from "./idol-kakao";
import { loadTraineeCard } from "./trainee-card";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const KEY = "idol_casual_v1";
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const md = (ms: number) => `${new Date(ms).getMonth() + 1}月${new Date(ms).getDate()}日`;

type State = { day: string; slots: number[]; lastBy: Record<string, number>; lastSeen: number; gap?: number };
function load(): State {
  try { return (JSON.parse(kvGet(KEY) || "null") as State | null) ?? { day: "", slots: [], lastBy: {}, lastSeen: 0 }; } catch { return { day: "", slots: [], lastBy: {}, lastSeen: 0 }; }
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); }

const WEIGHT: Record<string, number> = { 恋人: 6, 暧昧: 5, 好朋友: 4, 朋友: 3, 熟人: 1.2, 认识: 0.4 };
function teacherId(): string | undefined {
  try { return (JSON.parse(kvGet("idol_kakao_v1") || "null") as { teacherId?: string } | null)?.teacherId; } catch { return undefined; }
}
const isCrush = (p: IdolProfile) => Boolean(p.canCrush && p.heart && p.heart !== "没感觉");

/** 离生日还有几天（没写生日就很大） */
function bdayIn(p: IdolProfile, now: number): number {
  if (!p.birthday) return 999;
  const [m, d] = p.birthday.split("-").map(Number);
  if (!m || !d) return 999;
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  let b = new Date(t.getFullYear(), m - 1, d);
  if (b.getTime() < t.getTime()) b = new Date(t.getFullYear() + 1, m - 1, d);
  return Math.round((b.getTime() - t.getTime()) / DAY);
}

/** 新的一天：今天来几个人、大概几点 */
function planDay(now: number, gapDays: number): number[] {
  const n = Math.random() < 0.2 ? 0 : Math.random() < 0.6 ? 1 : 2;
  const start = new Date(now); start.setHours(9, 30, 0, 0);
  const end = new Date(now); end.setHours(23, 50, 0, 0);
  const from = Math.max(now + 10 * MIN, start.getTime());
  if (from >= end.getTime()) return [];
  const slots = Array.from({ length: n }, () => rnd(from, end.getTime()));
  // 刚跳过来（隔了好几天）：第一个人落地后不久就来
  if (gapDays >= 2 && slots.length) slots[0] = now + rnd(10, 40) * MIN;
  return slots.sort((a, b) => a - b);
}

/** 她现在有没有日程（前后一小时不打扰） */
function busyNow(now: number): boolean {
  return loadCareer().nodes.some(n => n.status === "pending" && now > n.dueAt - HOUR && now < n.dueAt + 3 * HOUR);
}

function lastChatAt(charId: string): number {
  const s = loadChatSessions().find(x => !x.isGroup && x.contactId === charId);
  if (!s) return 0;
  const m = loadChatMessages(s.id);
  const last = m[m.length - 1];
  return last ? new Date(last.createdAt).getTime() : 0;
}

function pick(now: number, s: State): string | null {
  const profiles = loadProfiles();
  const t = teacherId();
  const friends = new Set(loadChatContacts().map(c => c.characterId));
  const night = new Date(now).getHours() >= 22 || new Date(now).getHours() < 2;
  const pool: { id: string; w: number }[] = [];
  for (const c of loadCharacters()) {
    const p = profiles[c.id];
    if (!p || !friends.has(c.id) || c.id === t || /老师|管理|经纪|室长|代表/.test(p.role)) continue;
    let w = WEIGHT[relationOf(p)] ?? 0;
    if (!w) continue;
    if (isCrush(p)) w += 2 * (night ? 2 : 1);
    const lastE = p.events[p.events.length - 1];
    if (lastE && now - lastE.at < 3 * DAY) w *= 1.5;
    if (now - (s.lastBy[c.id] ?? 0) < 2 * DAY) w *= 0.25;
    const since = now - lastChatAt(c.id);
    if (since >= 0 && since < 3 * HOUR) continue; // 正在聊，不另外来
    if (bdayIn(p, now) <= 7) w *= 1.6; // 自己快过生日了，更可能来说
    if (p.leave?.phase === "left") w *= 0.7;
    pool.push({ id: c.id, w });
  }
  const total = pool.reduce((a, x) => a + x.w, 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const x of pool) { r -= x.w; if (r <= 0) return x.id; }
  return pool[pool.length - 1].id;
}

function instruction(charId: string, now: number, gapDays: number): string {
  const p = loadProfiles()[charId];
  const career = loadCareer();
  const next = career.nodes.filter(n => n.status === "pending" && n.dueAt > now).sort((a, b) => a.dueAt - b.dueAt)[0];
  const lastDone = career.nodes.filter(n => n.dueAt < now && n.dueAt > now - 2 * DAY && n.status === "done").slice(-1)[0];
  const ev = p?.events.slice(-3).map(e => `${md(e.at)} ${e.text}`).join("；");
  const s = loadChatSessions().find(x => !x.isGroup && x.contactId === charId);
  const recent = s ? loadChatMessages(s.id).filter(m => m.role === "user" || m.role === "assistant").slice(-6).map(m => `${m.role === "user" ? "她" : "你"}：${m.content}`).join("\n") : "";
  const her = loadTraineeCard()?.name || "她";
  const mine = p ? bdayIn(p, now) : 999;
  const chars = loadCharacters();
  const others = Object.values(loadProfiles()).filter(x => x.charId !== charId && x.met && x.leave?.phase !== "left").map(x => ({ name: chars.find(c => c.id === x.charId)?.name, days: bdayIn(x, now) })).filter(x => x.name && x.days >= 1 && x.days <= 7).sort((a, b) => a.days - b.days);
  const bday = [
    mine >= 1 && mine <= 7 ? `你${mine === 1 ? "明天" : `${mine}天后`}过生日` : "",
    others.length ? `${others.map(o => `${o.name}${o.days === 1 ? "明天" : `${o.days}天后`}过生日`).join("、")}（你认识的话可以提，比如商量一起准备）` : "",
  ].filter(Boolean).join("；");
  return [
    `平常的一天，现在${new Date(now).getHours()}点，你想在 KakaoTalk 上找${her}聊几句，没什么大事。`,
    `可以接着你们最近的事（${ev || "还没什么"}），可以说你自己今天的事（你最近：${p?.status?.text || "没写"}），${next ? `可以聊她接下来的「${next.title}」（${md(next.dueAt)}）` : ""}${lastDone ? `，可以问她刚过去的「${lastDone.title}」怎么样` : ""}。挑一个最自然的，不要全说。`,
    bday ? `快到的生日：${bday}。想提就提，可以别别扭扭地暗示，也可以直说。` : "",
    gapDays >= 2 ? `世界里刚过去了${Math.round(gapDays)}天，这几天你们照常相处、照常聊天，只是没写出来：不要说好久没联系、不要怪她没找你，接着平常的日子往下说。` : "",
    recent ? `你们上次的聊天：\n${recent}` : "",
    "按你的性格和跟她的关系，一到三条短消息；别每次都问身体、别客套。",
  ].filter(Boolean).join("\n");
}

/** 见过面、还没加好友、关系还行的人：偶尔来加她 */
function maybeFriendRequest(now: number): void {
  if (Math.random() > 0.15) return;
  const profiles = loadProfiles();
  const friends = new Set(loadChatContacts().map(c => c.characterId));
  const pool = loadCharacters().filter(c => { const p = profiles[c.id]; return p && p.met && !friends.has(c.id) && p.leave?.phase !== "left" && ["熟人", "朋友", "好朋友", "暧昧"].includes(relationOf(p)); });
  const c = pool[Math.floor(Math.random() * pool.length)];
  if (c) queueFriendRequest(c.id, "", profiles[c.id].metAt?.place ?? "", now + rnd(1, 10) * HOUR);
}

/** 每 5 秒在桌面跑 */
export function casualTick(): void {
  if (!loadTraineeCard()) return;
  const career = loadCareer();
  if (career.stage === "pre") return;
  const now = Date.now();
  let s = load();
  const today = dayOf(now);
  if (s.day !== today) {
    const gap = s.lastSeen ? (now - s.lastSeen) / DAY : 0;
    s = { ...s, day: today, slots: planDay(now, gap), gap, lastSeen: now };
    save(s);
    maybeFriendRequest(now);
  }
  const due = s.slots.find(at => at <= now);
  if (due == null) { if (now - s.lastSeen > MIN) save({ ...s, lastSeen: now }); return; }
  if (busyNow(now)) { save({ ...s, lastSeen: now, slots: s.slots.map(x => x === due ? now + rnd(2, 4) * HOUR : x) }); return; }
  const id = pick(now, s);
  save({ ...s, lastSeen: now, slots: s.slots.filter(x => x !== due), gap: 0, ...(id ? { lastBy: { ...s.lastBy, [id]: now } } : {}) });
  if (id) queueMessage(id, instruction(id, now, s.gap ?? 0), 0);
}
