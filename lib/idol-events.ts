/**
 * 爱豆小手机：事情发动机。
 *
 * 世界每次提前排好接下来三天会发生的事（一次 AI 调用）：别人身上的事、找上她的事、机会和约（待回复）、
 * 挫折（约两个月一次、一年最多六次、同一种不重复）、她生病（很少），顺便刷新大家的近况、偶尔有人发动态。
 * 到点了由代码执行：KakaoTalk 私聊、练习生群里说话、待回复进提醒事项、近况写进档案。
 * 跳过的日子里：不用她回的（群里、八卦、动态）按原来的时间补上；要她回的私聊在她落地时才发过来。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import { addChatContact, createOrGetSession, loadChatContacts, loadChatSessions, pushChatMessage } from "./chat-storage";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { addToCalendar, careerPromptBlock, loadCareer, saveCareer, type CareerNode } from "./idol-career";
import { createPerson, emptyProfile, getProfile, loadProfiles, relationOf, saveProfile } from "./idol-people";
import { describeTrainee, loadTraineeCard } from "./trainee-card";
import { crowdIdByName, crowdOf } from "./idol-crowd";
import { genKakaoId } from "./idol-kakao";
import { addMomentPost, updateMomentPost } from "./moments-storage";

const KEY = "idol_events_v1";
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WINDOW = 3 * DAY;

type Line = { where: "group" | "private"; who: string; text: string };
export type PlannedEvent = {
  id: string;
  at: number;
  kind: "small" | "big" | "setback" | "sick" | "chance" | "date";
  about: string;
  people: string[];
  lines: Line[];
  invite?: { title: string; at: number; place: string; replyBy?: number; from: string };
  done?: boolean;
};
type Post = { who: string; text: string; at: number; done?: boolean };
type State = {
  plannedUntil: number;
  events: PlannedEvent[];
  posts: Post[];
  /** 已经发生过的（世界提示里「最近正在发生的事」） */
  feed: { at: number; text: string }[];
  setbacks: { at: number; kind: string }[];
  lastBig?: number;
  lastSick?: number;
  health?: { what: string; until: number };
  fame: number;
  planning?: number;
};

const SETBACK_KINDS = ["人际矛盾", "被嫉妒", "被孤立", "被关系户抢位置或抢 part、抢机会", "被说靠家境进来、没实力", "被说过气、被拿来跟小时候比", "被黑粉骂", "被私生跟着"];

function familyFame(): number {
  const f = loadTraineeCard()?.family;
  return f === "child" ? 50 : f === "star" ? 40 : f === "chaebol" || f === "rich" ? 30 : 5;
}

function load(): State {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as State | null;
    if (raw) return { ...raw, events: raw.events ?? [], posts: raw.posts ?? [], feed: raw.feed ?? [], setbacks: raw.setbacks ?? [], fame: raw.fame ?? familyFame() };
  } catch { /* 坏数据当新的 */ }
  return { plannedUntil: 0, events: [], posts: [], feed: [], setbacks: [], fame: familyFame() };
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); }

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function parseAt(v: unknown): number | null {
  const m = String(v ?? "").match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

// ── 关注度、身体 ──

export function fameNow(): number { return load().fame; }
export function addFame(n: number): void { const s = load(); save({ ...s, fame: Math.max(0, Math.min(100, s.fame + n)) }); }
export function fameWord(f: number): string {
  return f >= 60 ? "已经小有名气，公开视频和路透常有人讨论" : f >= 30 ? "有一小撮固定粉丝，偶尔被路人认出来" : f >= 10 ? "公开视频底下有零星的人记得她" : "几乎没人知道她";
}

// ── 给世界的提示：最近正在发生的事、她的身体 ──

/** 最近两周身边发生的事（世界书用） */
export function eventsPlainFeed(): string[] {
  const now = Date.now();
  return load().feed.filter(f => now - f.at < 14 * DAY).slice(-8).map(f => `- ${new Date(f.at).getMonth() + 1}月${new Date(f.at).getDate()}日：${f.text}`);
}

export function eventsPromptBlock(): string {
  const s = load();
  const now = Date.now();
  const recent = s.feed.filter(f => now - f.at < 14 * DAY).slice(-10);
  const lines: string[] = [];
  if (recent.length) lines.push(`【最近正在发生的事】（戏里可以自然提到或撞见）\n${recent.map(f => `- ${new Date(f.at).getMonth() + 1}月${new Date(f.at).getDate()}日：${f.text}`).join("\n")}`);
  if (s.health && s.health.until > now) lines.push(`【她的身体】${s.health.what}（还没好）`);
  lines.push(`【她的关注度】${fameWord(s.fame)}`);
  return lines.join("\n\n");
}

// ── 排事情 ──

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

function teacherId(): string | undefined {
  try { return (JSON.parse(kvGet("idol_kakao_v1") || "null") as { teacherId?: string } | null)?.teacherId; } catch { return undefined; }
}
function groupSessionId(): string | undefined {
  try { return (JSON.parse(kvGet("idol_kakao_v1") || "null") as { groupId?: string } | null)?.groupId; } catch { return undefined; }
}

function rosterBlock(): string {
  const profiles = loadProfiles();
  const friends = new Set(loadChatContacts().map(c => c.characterId));
  const now = Date.now();
  return loadCharacters()
    .filter(c => profiles[c.id] && (profiles[c.id].layer === "main" || profiles[c.id].met))
    .slice(0, 40)
    .map(c => {
      const p = profiles[c.id];
      const stale = !p.status || now - p.status.at > 7 * DAY;
      return `- ${c.name}（${p.role || p.group || "身份没写"}${p.gender ? `，${p.gender}` : ""}${p.age ? `，${p.age}岁` : ""}；跟她：${relationOf(p)}${friends.has(c.id) ? "，KakaoTalk 好友" : ""}）最近：${p.status?.text || "没写"}${stale ? "【近况要更新】" : ""}`;
    }).join("\n");
}

function recentHers(): string {
  const career = loadCareer();
  const past = career.nodes.filter(n => n.status !== "pending" && n.status !== "invite" && n.dueAt < Date.now()).sort((a, b) => b.dueAt - a.dueAt).slice(0, 6);
  const events = Object.values(loadProfiles()).flatMap(p => p.events.map(e => ({ ...e, who: loadCharacters().find(c => c.id === p.charId)?.name ?? "" })))
    .sort((a, b) => b.at - a.at).slice(0, 8);
  return [
    ...past.map(n => `- ${new Date(n.dueAt).getMonth() + 1}月${new Date(n.dueAt).getDate()}日 ${n.title}：${n.status === "done" ? "完成" : n.status === "leave" ? "请假" : n.status === "absent" ? "缺席" : "没去"}${n.result ? `（${n.result}）` : ""}`),
    ...events.map(e => `- ${new Date(e.at).getMonth() + 1}月${new Date(e.at).getDate()}日 跟${e.who}：${e.text}`),
  ].join("\n") || "（还没什么）";
}

const PLAN_RULES = `你在给一出韩国娱乐圈练习生的戏排接下来几天世界里会发生的事。主角是「她」。只输出 JSON，不要别的字。
规矩：
- 小事两三天一件，大事一两周一件；一天最多一两件，可以有一天什么都没有。
- 事情分三种：别人身上的事（她旁观或之后听说）；找上她的事（别人主动联系她、通知她、约她）；她做过的事的后果（只能来自下面「她最近做过的事」）。
- 不替她决定她的表现、心情和身体，不写她说了什么、做了什么；她的失误类事情只发生在别人身上。
- 可以发生的事：老师叫去办公室、留下加课、选小组长、临时换 part、编舞或自作曲征集、外聘老师、新开的课、内部评估、高层视察、公开视频挑人、给前辈伴舞、前辈来练习室、MV 客串、广告网剧综艺试镜、杂志拍摄、校园公演、年末演唱会；宿舍卫生检查、搬宿舍、换室友、停电、拼单、快递丢了、新规矩；生日、节日聚餐、团建、交换礼物；粉丝信礼物、公开视频留言、路透、热搜、恶评谣言、CP（按她的关注度来，关注度低就很少）；同期的失误受伤被约谈节食晕倒、吵架冷战和好、谁暗恋谁、被孤立、被偏爱、新人进来、淘汰、自己放弃、被挖走、出道组传闻、偷偷恋爱被发现；少数重的事（霸凌谣言、匿名信、家人病倒、心理崩溃）只发生在别人身上。
- 恋爱禁令是公司规矩。
- 人物只用下面名单里的名字、群里的路人名字；要新出场有名字的人就写进 newPeople。
- 消息要像真人发的 KakaoTalk：口语、短，一个人一次一到三条。where 写 group（练习生群）或 private（私聊她）。
- 每句话都要合情合理、前因后果对得上：只有影响到群里大家的事才在群里通知，个人的事走私聊或者当八卦传。
- 机会和约要她回复的写 invite（title、at 开始时间、place、replyBy 回复截止、from 谁通知或谁约的），kind 写 chance 或 date；同时写一条通知她的消息。
- 有人「【近况要更新】」的，在 status 里给他写新的近况：status 世界视角一句他最近在忙什么，kakao 他自己会写在 KakaoTalk 状态消息里的短句。有事发生在谁身上，也更新他的近况。
- posts：偶尔有一两个人发 KakaoTalk 动态（练习生手机管得严，一周一两条），写他自己口吻的一两句。
- 时间都写成 YYYY-MM-DD HH:mm，必须在给定的时间段里。
JSON 格式：
{"events":[{"at":"","kind":"small/big/setback/sick/chance/date","about":"世界视角一句话：发生了什么","people":["相关的人"],"lines":[{"where":"group/private","who":"","text":""}],"invite":null}],"newPeople":[{"name":"","role":"","gender":"男/女","age":""}],"status":[{"name":"","status":"","kakao":""}],"posts":[{"who":"","text":"","at":""}]}`;

async function plan(from: number, to: number): Promise<void> {
  const s = load();
  const card = loadTraineeCard();
  const now = Date.now();
  // 挫折：约两个月一次，一年最多六次，同一种不重复
  const yearAgo = now - 365 * DAY;
  const lastSetback = s.setbacks.length ? Math.max(...s.setbacks.map(x => x.at)) : 0;
  const yearCount = s.setbacks.filter(x => x.at > yearAgo).length;
  const used = new Set(s.setbacks.map(x => x.kind));
  const fam = card?.family ?? "";
  const fitting = SETBACK_KINDS.filter(k => !used.has(k)).filter(k =>
    (k.includes("关系户") ? !["star", "rich", "chaebol"].includes(fam) : true)
    && (k.includes("家境") ? ["star", "rich", "chaebol"].includes(fam) : true)
    && (k.includes("过气") ? fam === "child" : true)
    && (k.includes("黑粉") || k.includes("私生") ? s.fame >= 30 : true));
  const setbackOk = yearCount < 6 && now - lastSetback > 50 * DAY && fitting.length > 0 && Math.random() < 0.45;
  const setbackKind = setbackOk ? fitting[Math.floor(Math.random() * fitting.length)] : "";
  const sickOk = (!s.lastSick || now - s.lastSick > 90 * DAY) && Math.random() < 0.12;
  const bigDue = !s.lastBig || now - s.lastBig > 8 * DAY;
  const group = groupSessionId();
  const crowd = group ? crowdOf(group).filter(m => !m.promotedTo).slice(0, 20).map(m => `${m.name}（${m.role}）`).join("、") : "";
  const user = [
    `时间段：${fmt(from)} 到 ${fmt(to)}${from < now - HOUR ? `（${fmt(from)} 到 ${fmt(now)} 是她跳过的日子，那几天照常过，只写别人身上的事和群里的话）` : ""}`,
    `【她是谁】\n${card ? describeTrainee(card) : "一个想当爱豆的女生"}\n关注度：${fameWord(s.fame)}${s.health && s.health.until > now ? `\n身体：${s.health.what}` : ""}`,
    careerPromptBlock(),
    `【名单】\n${rosterBlock() || "（还没有）"}`,
    crowd ? `【练习生群里的路人】${crowd}` : "",
    `【她最近做过的事】\n${recentHers()}`,
    s.feed.length ? `【前几天已经发生的事】\n${s.feed.slice(-8).map(f => `- ${f.text}`).join("\n")}` : "",
    `【这次】${bigDue ? "可以安排一件大事。" : "不安排大事。"}${setbackKind ? `安排一个她的挫折，类型：${setbackKind}；挫折要有具体的人和原因，不写她做得不好，kind 写 setback。` : "不安排她的挫折。"}${sickOk ? "可以让她生一次小病（感冒、肠胃炎、过敏、扭伤、生理期不舒服选一个），由室友或身边的人发现，kind 写 sick。" : "不让她生病。"}`,
  ].filter(Boolean).join("\n\n");
  const res = await simpleLLMCall(chatConfig(), [{ role: "system", content: PLAN_RULES }, { role: "user", content: user }], { temperature: 0.9, label: "世界排事情" });
  if (!res.content) throw new Error(res.error || "AI 没回");
  const j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    events?: { at?: string; kind?: string; about?: string; people?: string[]; lines?: Line[]; invite?: { title?: string; at?: string; place?: string; replyBy?: string; from?: string } | null }[];
    newPeople?: { name?: string; role?: string; gender?: string; age?: string }[];
    status?: { name?: string; status?: string; kakao?: string }[];
    posts?: { who?: string; text?: string; at?: string }[];
  };
  // 新面孔
  for (const np of j.newPeople ?? []) {
    const name = String(np.name ?? "").trim();
    if (!name || name.length > 12 || loadCharacters().some(c => c.name === name)) continue;
    createPerson(name, { ...emptyProfile(""), layer: "background", role: String(np.role ?? ""), gender: np.gender === "女" ? "女" : np.gender === "男" ? "男" : "", age: String(np.age ?? "") }, null, genKakaoId());
  }
  // 近况
  applyStatus(j.status ?? []);
  const kinds = ["small", "big", "setback", "sick", "chance", "date"];
  const events: PlannedEvent[] = (j.events ?? []).map(e => {
    const at = parseAt(e.at);
    if (at == null) return null;
    const kind = (kinds.includes(String(e.kind)) ? e.kind : "small") as PlannedEvent["kind"];
    const invAt = parseAt(e.invite?.at);
    const ev: PlannedEvent = {
      id: uid("evt"), at: Math.max(from, Math.min(to, at)), kind, about: String(e.about ?? ""), people: (e.people ?? []).map(String),
      lines: (e.lines ?? []).filter(l => l && l.who && l.text).map(l => ({ where: l.where === "group" ? "group" : "private", who: String(l.who), text: String(l.text) })),
      ...(e.invite && invAt ? { invite: { title: String(e.invite.title ?? "邀请"), at: invAt, place: String(e.invite.place ?? ""), replyBy: parseAt(e.invite.replyBy) ?? undefined, from: String(e.invite.from ?? "") } } : {}),
    };
    return ev;
  }).filter((e): e is PlannedEvent => Boolean(e));
  const posts: Post[] = (j.posts ?? []).map(p => ({ who: String(p.who ?? ""), text: String(p.text ?? ""), at: Math.max(from, Math.min(to, parseAt(p.at) ?? from + Math.random() * (to - from))) })).filter(p => p.who && p.text);
  const fresh = load();
  const setbacks = events.some(e => e.kind === "setback") && setbackKind ? [...fresh.setbacks, { at: now, kind: setbackKind }] : fresh.setbacks;
  save({
    ...fresh, plannedUntil: to, events: [...fresh.events.filter(e => !e.done), ...events].sort((a, b) => a.at - b.at),
    posts: [...fresh.posts.filter(p => !p.done), ...posts], setbacks,
    lastBig: events.some(e => e.kind === "big" || e.kind === "setback") ? now : fresh.lastBig,
    lastSick: events.some(e => e.kind === "sick") ? now : fresh.lastSick, planning: undefined,
  });
}

function charByName(name: string): Character | undefined {
  return loadCharacters().find(c => c.name === name.trim());
}

function applyStatus(list: { name?: string; status?: string; kakao?: string }[]) {
  for (const st of list) {
    const c = charByName(String(st.name ?? ""));
    if (!c || !st.status) continue;
    const p = getProfile(c.id);
    saveProfile({ ...p, status: { text: String(st.status), kakao: String(st.kakao ?? ""), at: Date.now() } });
  }
}

/** 一场戏结束、或别的地方有人的近况变了 */
export function setStatus(charId: string, text: string, kakao: string): void {
  const p = getProfile(charId);
  saveProfile({ ...p, status: { text, kakao, at: Date.now() } });
}

// ── 执行 ──

function sayInGroup(who: string, text: string, at: number) {
  const gid = groupSessionId();
  if (!gid || !loadChatSessions().some(s => s.id === gid)) return;
  const c = charByName(who);
  const senderId = c?.id ?? crowdIdByName(who);
  if (!senderId) return;
  pushChatMessage({ sessionId: gid, role: "assistant", content: text, senderCharacterId: senderId, senderName: who, status: "sent", createdAt: new Date(at).toISOString() });
}

function sayPrivate(who: string, text: string, at: number) {
  const c = charByName(who);
  if (!c) return;
  if (!loadChatContacts().some(x => x.characterId === c.id)) {
    // 没加过的人只有老师能直接找她（老师有她的号）
    if (c.id !== teacherId()) return;
    addChatContact(c.id);
  }
  const session = createOrGetSession(c.id);
  pushChatMessage({ sessionId: session.id, role: "assistant", content: text, status: "sent", createdAt: new Date(at).toISOString() });
}

function runEvent(e: PlannedEvent, notify: (m: string) => void) {
  const now = Date.now();
  const late = now - e.at > 2 * HOUR;
  // 要她回的（私聊）落地时才发，时间是现在；不用回的（群、八卦）按原来的时间
  for (const l of e.lines) {
    if (l.where === "group") sayInGroup(l.who, l.text, e.at);
    else sayPrivate(l.who, l.text, late ? now : e.at);
  }
  const firstPrivate = e.lines.find(l => l.where === "private");
  if (firstPrivate && charByName(firstPrivate.who)) notify(`💬 ${firstPrivate.who}：${firstPrivate.text}`);
  if (e.invite) {
    const fromChar = charByName(e.invite.from);
    const node: CareerNode = {
      id: uid("node"), kind: e.kind === "date" ? "date" : "chance", title: e.invite.title, place: e.invite.place, premise: e.about,
      dueAt: e.invite.at, status: "invite", from: e.invite.from || undefined, fromId: fromChar?.id,
      replyBy: e.invite.replyBy && e.invite.replyBy > now ? e.invite.replyBy : e.invite.at - 6 * HOUR,
      note: e.about,
    };
    if (node.dueAt > now) {
      const career = loadCareer();
      saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
      notify(`📩 待回复：${node.title}`);
    }
  }
  if (e.kind === "sick") {
    const s = load();
    save({ ...s, health: { what: e.about, until: e.at + 3 * DAY } });
  }
  // 相关的人记一笔（他之后聊天、演戏都知道）
  for (const name of e.people) {
    const c = charByName(name);
    if (!c) continue;
    const p = getProfile(c.id);
    if (p.layer !== "main" && !p.met) continue;
    saveProfile({ ...p, events: [...p.events, { id: uid("ev"), at: e.at, place: "", text: e.about }].slice(-30) });
  }
  const s = load();
  save({ ...s, feed: [...s.feed, { at: e.at, text: e.about }].slice(-40) });
}

function runPost(p: Post) {
  const c = charByName(p.who);
  if (!c || !loadChatContacts().some(x => x.characterId === c.id)) return;
  const friends = loadChatContacts().map(x => x.characterId);
  const post = addMomentPost({ authorType: "character", authorId: c.id, content: p.text, visibility: friends });
  if (post) updateMomentPost(post.id, { createdAt: new Date(p.at).toISOString() });
}

let busy = false;

/** 每 5 秒在桌面跑：该排就排，到点的执行 */
export function eventsTick(notify: (m: string) => void): void {
  if (busy || !loadTraineeCard()) return;
  const career = loadCareer();
  if (career.stage !== "trainee") return;
  const now = Date.now();
  let s = load();
  // 到点的事
  const due = s.events.filter(e => !e.done && e.at <= now);
  const duePosts = s.posts.filter(p => !p.done && p.at <= now);
  if (due.length || duePosts.length) {
    for (const e of due) { try { runEvent(e, notify); } catch { /* 一件出错不挡别的 */ } }
    for (const p of duePosts) { try { runPost(p); } catch { /* 同上 */ } }
    s = load();
    save({ ...s, events: s.events.map(e => due.some(d => d.id === e.id) ? { ...e, done: true } : e).filter(e => !e.done || now - e.at < 30 * DAY), posts: s.posts.map(p => duePosts.includes(p) || duePosts.some(d => d.at === p.at && d.who === p.who) ? { ...p, done: true } : p).filter(p => !p.done) });
  }
  // 该排下一段了：已排到的不足一天
  s = load();
  if (s.plannedUntil - now > DAY) return;
  if (s.planning && now - s.planning < 10 * MIN) return;
  const from = Math.max(s.plannedUntil || now, now - 10 * DAY);
  busy = true;
  save({ ...s, planning: now });
  void plan(from, now + WINDOW)
    .catch(err => { console.warn("[idol-events] plan failed", err); const x = load(); save({ ...x, planning: undefined, plannedUntil: x.plannedUntil }); })
    .finally(() => { busy = false; });
}

/** 跳时间要停的点：排好的待回复（机会、约）到达的时候 */
export function plannedStops(): { at: number; title: string }[] {
  return load().events.filter(e => !e.done && e.invite).map(e => ({ at: e.at, title: `待回复：${e.invite!.title}` }));
}

/** 已经过去的计划时间（跳时间落地时，下一次排会把跳过的日子一起补上） */
export function eventsPlannedUntil(): number { return load().plannedUntil; }
