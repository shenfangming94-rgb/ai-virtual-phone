/**
 * 爱豆小手机：有人来找你（KakaoTalk）。
 *
 * - 戏里他给她 ID：[给号:名字|ID]，ID 记到他身上；她要自己去 KakaoTalk 搜 ID 才加得上
 * - 戏里他拿到了她的 ID：[加你:名字|验证消息]，过一阵子「新的朋友」里来申请
 * - 她搜到一个只有名字的背景人物：照模板补全卡，加上后升成主要人物
 * - 发动机：进公司第一天后被拉进练习生群；老师在群里提前通知日程；月考后有同期来加她
 */

import { kvGet, kvSet } from "./kv-db";
import { loadAllCharacters, loadCharacters, HIDDEN_WORLD_CHAR_ID } from "./character-storage";
import type { Character } from "./character-types";
import { addChatContact, createGroupSession, createOrGetSession, loadChatContacts, loadChatSessions, pushChatMessage, saveChatSessions } from "./chat-storage";
import { addFriendRequest, dispatchFriendRequestUpdated, loadFriendRequests, clearRequestsForCharacter } from "./friend-request-storage";
import { PENDING_REPLY_PREFIX } from "./friend-request-engine";
import { resolveUserIdentity, loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { createPerson, emptyProfile, fmtDay, getProfile, saveProfile, draftPerson, completeCard, rollFace, rollSecretKind, draftFields, decayRelations, herAge, loadProfiles } from "./idol-people";
import { companyOf, loadCareer, saveCareer, type CareerNode } from "./idol-career";
import { simpleLLMCall } from "./api-helpers";
import { loadTraineeCard } from "./trainee-card";
import { seedCrowd } from "./idol-crowd";
import { debutNoticeTarget } from "./idol-debut";

const KEY = "idol_kakao_v1";
const MIN = 60e3;
const HOUR = 60 * MIN;

type Incoming = { id: string; charId: string; message: string; place: string; at: number };
type KakaoState = {
  myId?: string;
  incoming: Incoming[];
  /** 练习生群（KakaoTalk 群聊会话 id）和室长 */
  groupId?: string;
  teacherId?: string;
  /** 已经在群里通知过的节点 */
  noticed: string[];
};

function load(): KakaoState {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as KakaoState | null;
    if (raw) return { ...raw, incoming: raw.incoming ?? [], noticed: raw.noticed ?? [] };
  } catch { /* 坏数据当新的 */ }
  return { incoming: [], noticed: [] };
}
function save(s: KakaoState) { kvSet(KEY, JSON.stringify(s)); }

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const WORDS = ["moon", "sunny", "peach", "cherry", "mint", "dream", "star", "cloud", "lily", "berry", "honey", "rain"];

/** 生成像样的 KakaoTalk ID（英文+数字） */
export function genKakaoId(): string {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  const sep = Math.random() < 0.5 ? "_" : "";
  return `${w}${sep}${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

/** 她自己的 KakaoTalk ID */
export function myKakaoId(): string {
  const s = load();
  if (s.myId) return s.myId;
  const id = genKakaoId();
  save({ ...s, myId: id });
  return id;
}
export function setMyKakaoId(id: string): void {
  const clean = id.trim();
  if (clean) save({ ...load(), myId: clean });
}

export function isKakaoFriend(charId: string): boolean {
  return loadChatContacts().some(c => c.characterId === charId);
}

/** KakaoTalk 里按 ID 搜人（不分大小写；「世界」搜不到） */
export function findByKakaoId(q: string): Character | null {
  const k = q.trim().toLowerCase();
  if (!k) return null;
  return loadCharacters().find(c => (c.wechatID ?? "").toLowerCase() === k) ?? null;
}

const validId = (id: string) => /^[a-z0-9._-]{3,24}$/i.test(id.trim());

// ── 戏里的记号 ──

export type KakaoTags = { gives: { name: string; id: string }[]; adds: { name: string; message: string }[] };

/** 摘掉 [给号] [加你]，返回干净文字 */
export function extractKakaoTags(raw: string): { text: string; tags: KakaoTags } {
  const gives: KakaoTags["gives"] = [];
  const adds: KakaoTags["adds"] = [];
  const text = raw
    .replace(/\[给号[:：]\s*([^|｜\]]+)[|｜]?([^\]]*)\]/g, (_, n: string, id: string) => { gives.push({ name: n.trim(), id: id.trim() }); return ""; })
    .replace(/\[加你[:：]\s*([^|｜\]]+)[|｜]?([^\]]*)\]/g, (_, n: string, m: string) => { adds.push({ name: n.trim(), message: m.trim() }); return ""; })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, tags: { gives, adds } };
}

function findOrMeet(name: string, place: string): Character | null {
  if (!name || name.length > 12) return null;
  const exist = loadCharacters().find(c => c.name === name);
  if (exist) return exist;
  return createPerson(name, { ...emptyProfile(""), layer: "background", met: true, metAt: { at: Date.now(), place } }, null, genKakaoId());
}

/** 处理记号；返回给她看的提示 */
export function applyKakaoTags(tags: KakaoTags, place: string): string[] {
  const notes: string[] = [];
  for (const g of tags.gives) {
    const c = findOrMeet(g.name, place);
    if (!c) continue;
    const id = validId(g.id) ? g.id.trim() : c.wechatID || genKakaoId();
    const p = getProfile(c.id);
    saveProfile({ ...p, met: true, gaveId: true, metAt: p.metAt ?? { at: Date.now(), place } }, { wechatID: id });
  }
  if (tags.adds.length) {
    const s = load();
    for (const a of tags.adds) {
      const c = findOrMeet(a.name, place);
      if (!c || isKakaoFriend(c.id) || s.incoming.some(i => i.charId === c.id)) continue;
      const delay = (15 + Math.random() * 100) * MIN;
      s.incoming.push({ id: uid("in"), charId: c.id, message: a.message.slice(0, 60), place, at: Date.now() + delay });
    }
    save(s);
  }
  return notes;
}

export const KAKAO_TAG_RULES = `- 有人把自己的 KakaoTalk ID 给了她（报给她、写给她、给她看二维码都算）：[给号:名字|他的ID]（ID 用英文和数字，正文里写出来的要跟这里一样）
- 有人拿到了她的 KakaoTalk ID、之后会来加她：[加你:名字|加好友时附带的一句话]`;

export function kakaoPromptLine(): string {
  return `她的 KakaoTalk ID：${myKakaoId()}（她自己愿意给才给）。加 KakaoTalk 只能靠交换 ID，戏里不能直接替她加上。`;
}

// ── 她搜 ID 加人 ──

/** 搜到的人卡太薄（只有名字身份）：照模板补全，返回补好的档案 */
const fleshing = new Map<string, Promise<void>>();

export async function fleshOut(charId: string, reroll = false): Promise<void> {
  const pending = fleshing.get(charId);
  if (pending) return pending;
  const c = loadCharacters().find(x => x.id === charId);
  if (!c) return;
  const p = getProfile(charId);
  if (p.familyMemberId && !reroll) return;
  if (!reroll && p.privateLines.length) return;
  const face = reroll ? rollFace() : p.face;
  const task = (async () => {
    const { personSceneText } = await import("./idol-stage");
    const d = await completeCard({ ...p, face }, c.name, reroll ? rollSecretKind() : undefined, personSceneText(charId, c.name));
    // 补全期间可能已经加好友或新增相处记录，保存时使用最新状态。
    if (!loadCharacters().some(x => x.id === charId)) return;
    const current = getProfile(charId);
    const f = draftFields(d, reroll ? undefined : current.secret);
    const next = { ...current, ...f, role: d.role || current.role, group: d.group || current.group, age: d.age || current.age, face: current.face !== p.face ? current.face : face };
    for (const key of Object.keys(f) as (keyof typeof f)[]) {
      if (JSON.stringify(current[key]) !== JSON.stringify(p[key])) Object.assign(next, { [key]: current[key] });
    }
    saveProfile(next);
  })();
  fleshing.set(charId, task);
  try { await task; } finally { if (fleshing.get(charId) === task) fleshing.delete(charId); }
}

export function needsFleshOut(charId: string): boolean {
  const p = loadProfiles()[charId];
  return Boolean(p && !p.familyMemberId && p.privateLines.length === 0);
}

function promote(charId: string) {
  const p = getProfile(charId);
  if (p.layer !== "main") saveProfile({ ...p, layer: "main" });
}

function metLine(charId: string): string {
  const p = getProfile(charId);
  return p.metAt ? `你们是${fmtDay(p.metAt.at)}在「${p.metAt.place}」认识的` : "";
}

/** 她搜到 ID 加上了他（KakaoTalk 搜 ID 加了就是好友） */
export function addByKakaoId(char: Character, greeting: string) {
  addChatContact(char.id);
  clearRequestsForCharacter(char.id);
  dispatchFriendRequestUpdated();
  promote(char.id);
  const session = createOrGetSession(char.id);
  const userName = resolveUserIdentity(char.id, "chat")?.name || "她";
  const met = metLine(char.id);
  pushChatMessage({
    sessionId: session.id,
    role: "system",
    content: `${userName}搜 KakaoTalk ID 加了${char.name}${met ? `（${met}）` : ""}`,
    status: "sent",
  });
  if (greeting.trim()) pushChatMessage({ sessionId: session.id, role: "user", content: greeting.trim(), status: "sent" });
  kvSet(PENDING_REPLY_PREFIX + session.id, "1");
  return session;
}

/** 接受申请时：升成主要人物，返回「在哪认识」那一句 */
export function onKakaoAccepted(charId: string): string {
  if (!loadProfiles()[charId]) return "";
  promote(charId);
  return metLine(charId);
}

// ── 发动机：练习生群、老师通知、同期来加 ──

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

const isTeacher = (c: Character) => /老师|管理|经纪|室长|组长/.test(getProfile(c.id).role);
const isTrainee = (c: Character) => /练习生|同期/.test(`${getProfile(c.id).role}${getProfile(c.id).group}`);

async function makeTeacher(companyName: string): Promise<Character> {
  try {
    const d = await draftPerson(`${companyName} 带新人练习生的室长（실장님，练习生都这么叫他），日常在 KakaoTalk 群里通知日程`, rollFace());
    return createPerson(d.name, {
      ...emptyProfile(""), ...draftFields(d), layer: "main", role: d.role || `${companyName} 练习生室长`, group: d.group || "公司",
    }, null, genKakaoId());
  } catch {
    return createPerson("室长", { ...emptyProfile(""), layer: "main", role: `${companyName} 练习生室长`, group: "公司" }, null, genKakaoId());
  }
}

/** 进公司第一天分一到两个室友：在场的同龄女练习生优先，不够就捏 */
async function ensureRoommates(mates: Character[]): Promise<void> {
  const career = loadCareer();
  if (career.roommates?.length) return;
  const mine = herAge() ?? 17;
  const picks = mates.filter(m => { const p = getProfile(m.id); return p.gender === "女" && Math.abs((parseInt(p.age, 10) || mine) - mine) <= 3; }).slice(0, 2);
  const want = 1 + (Math.random() < 0.5 ? 1 : 0);
  while (picks.length < want) {
    try {
      const d = await draftPerson(`跟她分到同一间宿舍的室友，同公司的女练习生，年龄跟她差不多（她 ${mine} 岁）`, rollFace());
      picks.push(createPerson(d.name, { ...emptyProfile(""), ...draftFields(d), layer: "main", group: "室友", met: true, metAt: { at: Date.now(), place: "宿舍" }, relation: "认识" }, null, genKakaoId()));
    } catch { break; }
  }
  for (const m of picks) {
    const p = getProfile(m.id);
    saveProfile({ ...p, layer: "main", group: "室友", role: p.role.includes("室友") ? p.role : `${p.role || "同期练习生"} · 室友`, met: true, relation: p.relation && p.relation !== "陌生" ? p.relation : "认识" });
  }
  saveCareer({ ...loadCareer(), roommates: picks.map(m => m.id) });
}

/** 室长加她 KakaoTalk，私聊一句：自我介绍、没见过的室友是谁、马上拉群 */
async function teacherAddsHer(teacher: Character, company: string, groupName: string, unmet: string[]): Promise<void> {
  addChatContact(teacher.id);
  clearRequestsForCharacter(teacher.id);
  dispatchFriendRequestUpdated();
  promote(teacher.id);
  const p = getProfile(teacher.id);
  if (!p.met) saveProfile({ ...p, met: true, metAt: { at: Date.now(), place: `${company}（KakaoTalk）` } });
  const session = createOrGetSession(teacher.id);
  const userName = resolveUserIdentity(teacher.id, "chat")?.name || "她";
  pushChatMessage({ sessionId: session.id, role: "system", content: `${teacher.name}加了${userName}为 KakaoTalk 好友`, status: "sent" });
  const roomLine = unmet.length ? `你宿舍的室友是${unmet.join("、")}。` : "";
  const fallback = `我是${company}带新人练习生的室长${teacher.name}。${roomLine}等下拉你进「${groupName}」，日程都在群里发，记得看。`;
  let text = fallback;
  try {
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `你是${teacher.name}。${teacher.persona}\n\n新练习生${userName}今天刚进公司，你第一次在 KakaoTalk 私聊她。只输出要发的那一条消息，两三句，用你自己的说话方式：说你是谁${unmet.length ? `，告诉她宿舍室友是${unmet.join("、")}` : ""}，说马上拉她进「${groupName}」群，日程在群里通知。` },
      { role: "user", content: "发消息。" },
    ], { temperature: 0.8, label: "室长加好友" });
    text = res.content?.trim().replace(/^["「]|["」]$/g, "") || fallback;
  } catch { /* 用兜底 */ }
  pushChatMessage({ sessionId: session.id, role: "assistant", content: text, senderCharacterId: teacher.id, senderName: teacher.name, status: "sent" });
}

let groupBusy = false;

/** 进公司第一天之后：室长把她拉进练习生群（第一天那场戏里的老师和同期一起进群） */
export async function ensureTraineeGroup(present: Character[], notify?: (msg: string) => void): Promise<void> {
  const s = load();
  if (groupBusy) return;
  if (s.groupId && loadChatSessions().some(x => x.id === s.groupId)) {
    // 旧存档：室友当初没进群，补进去
    const rm = loadCareer().roommates ?? [];
    const sessions = loadChatSessions();
    const g = sessions.find(x => x.id === s.groupId)!;
    const missing = rm.filter(id => !(g.participantIds ?? []).includes(id));
    if (missing.length) saveChatSessions(sessions.map(x => x.id === g.id ? { ...x, participantIds: [...(x.participantIds ?? []), ...missing] } : x));
    return;
  }
  const career = loadCareer();
  const c = companyOf(career.companyId);
  if (!c) return;
  groupBusy = true;
  try {
    const teacher = present.find(isTeacher) ?? (s.teacherId ? loadCharacters().find(x => x.id === s.teacherId) : undefined) ?? await makeTeacher(c.name);
    const mates = present.filter(x => x.id !== teacher.id && isTrainee(x));
    await ensureRoommates(mates);
    const all = loadCharacters();
    const roommates = (loadCareer().roommates ?? []).map(id => all.find(x => x.id === id)).filter((x): x is Character => Boolean(x));
    const name = `${c.name} 新人练习生`;
    // 戏里没给过 KakaoTalk 的话，室长先加她、私聊交代一句（没见过的室友顺带介绍），再拉群
    if (!isKakaoFriend(teacher.id)) {
      const unmet = roommates.filter(r => !present.some(p => p.id === r.id)).map(r => r.name);
      await teacherAddsHer(teacher, c.name, name, unmet);
    }
    const memberIds = [...new Set([teacher.id, ...mates.map(m => m.id), ...roommates.map(m => m.id)])];
    const session = createGroupSession(name, memberIds);
    saveChatSessions(loadChatSessions().map(x => x.id === session.id ? { ...x, groupOwnerId: teacher.id } : x));
    const userName = resolveUserIdentity()?.name || "她";
    pushChatMessage({ sessionId: session.id, role: "system", content: `${teacher.name}邀请${userName}加入了群聊「${name}」`, status: "sent" });
    seedCrowd(session.id, 30 + Math.floor(Math.random() * 30), [teacher.name, ...mates.map(m => m.name), ...roommates.map(m => m.name)]);
    save({ ...load(), groupId: session.id, teacherId: teacher.id });
    notify?.(`💬 KakaoTalk：${teacher.name} 把你拉进了群「${name}」`);
  } finally {
    groupBusy = false;
  }
}

async function teacherNotice(teacher: Character, node: CareerNode): Promise<string> {
  const d = new Date(node.dueAt);
  const when = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const fallback = `明天 ${when.split(" ")[1]} ${node.title}，在${node.place}，别迟到。`;
  try {
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `你是${teacher.name}。${teacher.persona}\n\n你在练习生 KakaoTalk 群里发日程通知。只输出要发的那一条消息，一两句，用你自己的说话方式，写清楚时间地点。` },
      { role: "user", content: `明天（${when}）：${node.title}，地点：${node.place}。${node.premise}` },
    ], { temperature: 0.8, label: "老师群通知" });
    return res.content?.trim().replace(/^["「]|["」]$/g, "") || fallback;
  } catch {
    return fallback;
  }
}

/** 月考之后：同场的同期里，挑一个还没加她的来加 */
async function mateAddsAfter(present: Character[], place: string): Promise<void> {
  const s = load();
  const pool = present.filter(x => isTrainee(x) && !isKakaoFriend(x.id) && !s.incoming.some(i => i.charId === x.id)
    && !loadFriendRequests().some(r => r.characterId === x.id && r.status === "pending"));
  const mate = pool[Math.floor(Math.random() * pool.length)];
  if (!mate || Math.random() < 0.3) return;
  let message = "";
  try {
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `你是${mate.name}。${mate.persona}\n\n你刚和她一起考完月考，现在想加她 KakaoTalk。只输出加好友时附带的那一句话。` },
      { role: "user", content: `地点：${place}` },
    ], { temperature: 0.9, label: "同期加好友" });
    message = res.content?.trim().slice(0, 60) || "";
  } catch { /* 没话也能加 */ }
  save({ ...load(), incoming: [...load().incoming, { id: uid("in"), charId: mate.id, message, place, at: Date.now() + (30 + Math.random() * 150) * MIN }] });
}

/** 别处安排的好友申请（平常日子有人来加她），到点出现在「新的朋友」 */
export function queueFriendRequest(charId: string, message: string, place: string, at: number): void {
  const s = load();
  if (isKakaoFriend(charId) || s.incoming.some(i => i.charId === charId) || loadFriendRequests().some(r => r.characterId === charId && r.status === "pending")) return;
  save({ ...s, incoming: [...s.incoming, { id: uid("in"), charId, message, place, at }] });
}

/** 节点那场戏演完：发动机安排后续的人 */
export async function afterNodeScene(node: CareerNode | undefined, presentIds: string[], place: string): Promise<void> {
  if (!node) return;
  const chars = loadAllCharacters().filter(c => c.id !== HIDDEN_WORLD_CHAR_ID);
  const present = presentIds.map(id => chars.find(c => c.id === id)).filter((c): c is Character => Boolean(c));
  if (node.kind === "first_day") await ensureTraineeGroup(present);
  if (node.kind === "monthly") await mateAddsAfter(present, place);
}

let tickBusy = false;
let lastDecayDay = "";

/** 每 5 秒在桌面跑：到点的好友申请、群里的日程通知 */
export function kakaoTick(notify: (msg: string) => void): void {
  if (tickBusy || !loadTraineeCard()) return;
  const now = Date.now();
  const today = new Date(now).toDateString();
  if (today !== lastDecayDay) { lastDecayDay = today; try { decayRelations([...loadChatContacts().map(c => c.characterId), ...(loadCareer().roommates ?? [])]); } catch { /* 不挡着 */ } }
  const s = load();
  const due = s.incoming.filter(i => i.at <= now);
  if (due.length) {
    for (const i of due) {
      if (isKakaoFriend(i.charId) || !loadCharacters().some(c => c.id === i.charId)) continue;
      addFriendRequest(i.charId, i.message, 1, undefined, i.place);
      notify(`💬 KakaoTalk：${loadCharacters().find(c => c.id === i.charId)?.name} 想加你为好友`);
    }
    save({ ...s, incoming: s.incoming.filter(i => i.at > now) });
    dispatchFriendRequestUpdated();
  }
  const career = loadCareer();
  if (career.stage !== "trainee") return;
  // 出道那几件事：经纪人在出道组群里提前通知
  const dn = career.nodes.find(n => n.status === "pending" && n.kind === "debut" && !s.noticed.includes(n.id) && now >= n.dueAt - 20 * HOUR && now < n.dueAt);
  const target = dn ? debutNoticeTarget(dn) : null;
  if (dn && target) {
    tickBusy = true;
    save({ ...s, noticed: [...s.noticed, dn.id] });
    void teacherNotice(target.sender, dn).then(text => {
      pushChatMessage({ sessionId: target.groupId, role: "assistant", content: text, senderCharacterId: target.sender.id, senderName: target.sender.name, status: "sent" });
      notify(`💬 ${target.sender.name}：${text}`);
    }).finally(() => { tickBusy = false; });
    return;
  }
  // 第一天那场没演、平常地过去了：老师照样拉群
  if (career.nodes.some(n => n.kind === "first_day" && n.status !== "pending")) {
    if (!s.groupId) {
      void ensureTraineeGroup([], notify);
      return;
    }
    void ensureTraineeGroup([]);
  }
  const teacher = s.teacherId ? loadCharacters().find(c => c.id === s.teacherId) : undefined;
  if (!s.groupId || !teacher || !loadChatSessions().some(x => x.id === s.groupId)) return;
  const next = career.nodes.find(n => n.status === "pending" && n.kind !== "first_day" && n.kind !== "debut" && !s.noticed.includes(n.id)
    && now >= n.dueAt - 20 * HOUR && now < n.dueAt);
  if (!next) return;
  tickBusy = true;
  save({ ...s, noticed: [...s.noticed, next.id] });
  void teacherNotice(teacher, next).then(text => {
    pushChatMessage({ sessionId: s.groupId!, role: "assistant", content: text, senderCharacterId: teacher.id, senderName: teacher.name, status: "sent" });
    notify(`💬 ${teacher.name}：${text}`);
  }).finally(() => { tickBusy = false; });
}
