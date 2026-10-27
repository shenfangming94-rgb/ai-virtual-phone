/**
 * 爱豆小手机：每年一定会来的事（不靠后台排事情碰运气）。
 * - 她的生日：当天要好的人来祝福，张罗的那个人约她晚上一起过（待回复）
 * - 春节、中秋：提前一周老师在群里通知放假，「回家」进待回复（不回家就留在宿舍）
 * - 公司年末家族演唱会：提前四周定伴舞（看排名和关注度）。选上了有两次彩排 + 上台；没选上在台下看
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import { loadChatContacts } from "./chat-storage";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { addToCalendar, companyOf, loadCareer, saveCareer, type CareerNode } from "./idol-career";
import { getProfile, relationOf } from "./idol-people";
import { loadTraineeCard } from "./trainee-card";
import { queueMessage, teacherOf } from "./idol-reminders";
import { fameNow, sayInGroup } from "./idol-events";
import { findLunar, nthWeekday } from "./idol-calendar";

const KEY = "idol_yearly_v1";
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const at = (iso: string, h: number, m = 0) => { const d = new Date(`${iso}T00:00:00`); d.setHours(h, m, 0, 0); return d.getTime(); };
const md = (ms: number) => `${new Date(ms).getMonth() + 1}月${new Date(ms).getDate()}日`;

function loadDone(): string[] {
  try { return (JSON.parse(kvGet(KEY) || "null") as { done?: string[] } | null)?.done ?? []; } catch { return []; }
}
function markDone(k: string) { kvSet(KEY, JSON.stringify({ done: [...loadDone(), k].slice(-60) })); }

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

function addNodes(nodes: CareerNode[]) {
  const career = loadCareer();
  saveCareer({ ...career, nodes: [...career.nodes, ...nodes].sort((a, b) => a.dueAt - b.dueAt) });
  nodes.filter(n => n.status === "pending").forEach(addToCalendar);
}

/** 老师在练习生群里说一句（AI 用老师口吻写；没 API 就用平平的说法） */
async function teacherSays(instruction: string, fallback: string): Promise<void> {
  const t = teacherOf();
  if (!t) return;
  let text = fallback;
  try {
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `你是${t.name}。${t.persona}\n\n你在练习生 KakaoTalk 群里发通知。只输出要发的那一条消息，一到三句，用你自己的说话方式。` },
      { role: "user", content: instruction },
    ], { temperature: 0.8, label: "老师群通知" });
    text = res.content?.trim().replace(/^["「]|["」]$/g, "") || fallback;
  } catch { /* 用平平的说法 */ }
  sayInGroup(t.name, text, Date.now());
}

/** 跟她要好的人（室友优先，不算老师经纪人），最多三个 */
function closeOnes(): Character[] {
  const career = loadCareer();
  const friends = new Set(loadChatContacts().map(c => c.characterId));
  const all = loadCharacters();
  const roommates = (career.roommates ?? []).map(id => all.find(c => c.id === id)).filter((c): c is Character => Boolean(c));
  const others = all.filter(c => friends.has(c.id) && !roommates.includes(c) && !/老师|经纪|管理/.test(getProfile(c.id).role)
    && ["朋友", "好朋友", "暧昧", "恋人"].includes(relationOf(getProfile(c.id))));
  return [...roommates, ...others].slice(0, 3);
}

// ── 她的生日 ──

function birthday(year: number, now: number) {
  const card = loadTraineeCard();
  if (!card?.birthday || !/^\d{4}-\d{2}-\d{2}$/.test(card.birthday)) return;
  const k = `bday-${year}`;
  if (loadDone().includes(k)) return;
  const iso = `${year}-${card.birthday.slice(5)}`;
  const start = at(iso, 8), end = at(iso, 23, 59);
  if (now < start) return;
  markDone(k);
  if (now > end) return; // 跳过去了
  const people = closeOnes();
  const host = people[0];
  people.forEach((c, i) => {
    if (c === host) return;
    queueMessage(c.id, `今天（${md(start)}）是她的生日。按你们的关系和你的性格，在 KakaoTalk 上祝她生日快乐。`, (10 + i * 25) * MIN);
  });
  if (!host) return;
  const due = at(iso, 19);
  if (due > now + HOUR) {
    addNodes([{
      id: uid("node"), kind: "date", title: `${host.name}约你过生日`, place: "宿舍附近的烤肉店", dueAt: due, status: "invite",
      premise: `今天是她的生日，${host.name}张罗着给她过，叫了几个跟她要好的人。`, from: host.name, fromId: host.id, replyBy: due - 2 * HOUR,
    }]);
    queueMessage(host.id, `今天是她的生日。你想晚上七点在宿舍附近的烤肉店给她过生日（会叫上几个要好的人），先祝她生日快乐，再约她，问她来不来。`, 5 * MIN);
  } else {
    queueMessage(host.id, `今天（${md(start)}）是她的生日。按你们的关系和你的性格，在 KakaoTalk 上祝她生日快乐。`, 5 * MIN);
  }
}

// ── 春节、中秋 ──

function holiday(year: number, now: number, which: "spring" | "chuseok") {
  const career = loadCareer();
  if (career.stage === "pre" || !career.companyId) return;
  const k = `${which}-${year}`;
  if (loadDone().includes(k)) return;
  const iso = which === "spring" ? findLunar(year, "正月", "初一", [0, 15], [1, 25]) : findLunar(year, "八月", "十五", [8, 1], [9, 15]);
  if (!iso) return;
  const day1 = at(iso, 0) - DAY, day3 = at(iso, 0) + DAY;
  const notice = day1 - 7 * DAY + 10 * HOUR;
  if (now < notice) return;
  markDone(k);
  if (now > day1) return;
  const name = which === "spring" ? "春节" : "中秋";
  const range = `${md(day1)}～${md(day3)}`;
  const teacher = teacherOf();
  addNodes([{
    id: uid("node"), kind: "event", title: `${name}回家（${range}）`, place: "老家", dueAt: day1 + 10 * HOUR, status: "invite",
    premise: `${name}放假，她回家过节：见家人、老朋友，吃家里的饭。三天后回宿舍。`, from: teacher?.name, fromId: teacher?.id,
    replyBy: Math.max(now + 6 * HOUR, day1 - 3 * DAY + 20 * HOUR),
  }]);
  void teacherSays(`${name}放假：${range}，三天。要回家的在 ${md(day1 - 3 * DAY)} 晚上之前跟你说，不回家的留宿舍，食堂照常开但只开午饭。`, `${name}放假 ${range}，要回家的 ${md(day1 - 3 * DAY)} 之前跟我说。`);
}

// ── 年末家族演唱会 ──

function concert(year: number, now: number) {
  const career = loadCareer();
  const c = companyOf(career.companyId);
  if (career.stage !== "trainee" || !c || !career.signedAt) return;
  const k = `concert-${year}`;
  if (loadDone().includes(k)) return;
  const iso = nthWeekday(year, 11, 6, 3);
  const show = at(iso, 18);
  const decide = at(iso, 10) - 28 * DAY;
  if (now < decide) return;
  markDone(k);
  if (now > show || career.signedAt > decide - 14 * DAY) return; // 跳过去了，或者刚进公司轮不到
  let pct = 0.5;
  try {
    const months = (JSON.parse(kvGet("idol_ledger_v1") || "null") as { months?: { rank: number; total: number }[] } | null)?.months ?? [];
    const m = months[months.length - 1];
    if (m) pct = m.rank / Math.max(1, m.total);
  } catch { /* 没排名按中间 */ }
  const chosen = pct <= 0.45 || fameNow() >= 30 || (pct <= 0.6 && Math.random() < 0.35);
  const teacher = teacherOf();
  const place = `${c.name} 公司 大练习室`;
  const hall = "首尔 奥林匹克公园 体操竞技场";
  if (chosen) {
    addNodes([
      { id: uid("node"), kind: "event", title: "年末演唱会伴舞彩排", place, dueAt: at(nthWeekday(year, 11, 6, 1), 19), status: "pending", premise: `${c.name} 年末家族演唱会，她被选去给前辈伴舞。今天第一次跟前辈一起彩排。`, companyId: c.id, from: teacher?.name },
      { id: uid("node"), kind: "event", title: "年末演唱会走台", place: hall, dueAt: at(iso, 13) - 2 * DAY, status: "pending", premise: `${c.name} 年末家族演唱会前两天，在场馆里走台、对灯光和站位，她是前辈的伴舞。`, companyId: c.id, from: teacher?.name },
      { id: uid("node"), kind: "chance", title: `${c.name} 年末家族演唱会（伴舞）`, place: hall, dueAt: show - 3 * HOUR, status: "pending", premise: `${c.name} 年末家族演唱会当天，她作为前辈的伴舞上台。后台很乱，前辈们、经纪人、造型师都在。`, companyId: c.id, from: teacher?.name },
    ]);
    if (teacher) queueMessage(teacher.id, `公司年末家族演唱会（${md(show)}）选了她给前辈当伴舞。私聊通知她，告诉她 ${md(at(nthWeekday(year, 11, 6, 1), 19))} 晚上第一次彩排，演唱会前两天去场馆走台。`, 5 * MIN);
    void teacherSays(`年末家族演唱会（${md(show)}）的伴舞名单定了，练习生里选了几个人，名单私下通知；没被选上的当天一起去台下看。`, `年末演唱会伴舞名单定了，选上的我私下通知。没选上的 ${md(show)} 一起去台下看。`);
  } else {
    addNodes([
      { id: uid("node"), kind: "event", title: `${c.name} 年末家族演唱会（台下看）`, place: hall, dueAt: show - HOUR, status: "pending", premise: `${c.name} 年末家族演唱会。她这次没被选上伴舞，跟同期一起坐在练习生席，看前辈和被选上的同期在台上。`, companyId: c.id, from: teacher?.name },
    ]);
    void teacherSays(`年末家族演唱会（${md(show)}）的伴舞名单定了，选上的已经私下通知。没被选上的当天跟老师一起去台下看，下午五点在公司门口集合。`, `年末演唱会伴舞名单定了。没选上的 ${md(show)} 下午五点公司门口集合，一起去看。`);
  }
}

let busy = false;
export function yearlyTick(notify: (m: string) => void): void {
  if (busy || !loadTraineeCard()) return;
  const career = loadCareer();
  if (career.stage === "pre") return;
  busy = true;
  try {
    const now = Date.now();
    const y = new Date(now).getFullYear();
    const before = loadDone().length;
    for (const year of [y - 1, y, y + 1]) {
      birthday(year, now);
      holiday(year, now, "spring");
      holiday(year, now, "chuseok");
      concert(year, now);
    }
    if (loadDone().length > before) {
      const fresh = loadCareer().nodes.filter(n => n.status === "invite" && n.replyBy && n.replyBy > now && !career.nodes.some(o => o.id === n.id));
      for (const n of fresh) notify(`📩 待回复：${n.title}`);
    }
  } finally {
    busy = false;
  }
}

/** 跳时间遇到这些也停（提前一点） */
export function yearlyStops(): { at: number; title: string }[] {
  const card = loadTraineeCard();
  const career = loadCareer();
  if (!card || career.stage === "pre") return [];
  const now = Date.now();
  const y = new Date(now).getFullYear();
  const done = loadDone();
  const out: { at: number; title: string }[] = [];
  for (const year of [y, y + 1]) {
    if (card.birthday && !done.includes(`bday-${year}`)) out.push({ at: at(`${year}-${card.birthday.slice(5)}`, 8), title: "你的生日" });
    for (const which of ["spring", "chuseok"] as const) {
      const iso = which === "spring" ? findLunar(year, "正月", "初一", [0, 15], [1, 25]) : findLunar(year, "八月", "十五", [8, 1], [9, 15]);
      if (iso && !done.includes(`${which}-${year}`)) out.push({ at: at(iso, 0) - 8 * DAY + 10 * HOUR, title: which === "spring" ? "春节放假通知" : "中秋放假通知" });
    }
    if (career.stage === "trainee" && !done.includes(`concert-${year}`)) out.push({ at: at(nthWeekday(year, 11, 6, 3), 10) - 28 * DAY, title: "年末演唱会伴舞名单" });
  }
  return out.filter(s => s.at > now);
}
