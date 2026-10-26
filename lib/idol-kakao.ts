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
import { createPerson, emptyProfile, fmtDay, getProfile, saveProfile, draftPerson, completeCard, rollFace } from "./idol-people";
import { companyOf, loadCareer, type CareerNode } from "./idol-career";
import { simpleLLMCall } from "./api-helpers";
import { loadTraineeCard } from "./trainee-card";
import { seedCrowd } from "./idol-crowd";

const KEY = "idol_kakao_v1";
const MIN = 60e3;
const HOUR = 60 * MIN;

type Incoming = { id: string; charId: string; message: string; place: string; at: number };
type KakaoState = {
  myId?: string;
  incoming: Incoming[];
  /** 练习生群（KakaoTalk 群聊会话 id）和管理老师 */
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
export async function fleshOut(charId: string, reroll = false): Promise<void> {
  const c = loadCharacters().find(x => x.id === charId);
  if (!c) return;
  const p = getProfile(charId);
  if (!reroll && p.privateLines.length) return;
  const d = await completeCard(p, c.name);
  saveProfile({
    ...p,
    role: d.role || p.role,
    group: d.group || p.group,
    age: d.age || p.age,
    isIdol: d.isIdol,
    publicLabels: d.publicLabels,
    publicText: d.publicText,
    privateLines: d.privateLines,
    speech: d.speech,
    taboo: d.taboo,
    face: reroll ? rollFace() : p.face,
  });
}

export function needsFleshOut(charId: string): boolean {
  return getProfile(charId).privateLines.length === 0;
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
    const d = await draftPerson(`${companyName} 带新人练习生的管理老师，日常在 KakaoTalk 群里通知日程`, rollFace());
    return createPerson(d.name, {
      ...emptyProfile(""), layer: "main", role: d.role || `${companyName} 练习生管理老师`, group: d.group || "公司",
      age: d.age, privateLines: d.privateLines, speech: d.speech, taboo: d.taboo,
    }, null, genKakaoId());
  } catch {
    return createPerson("管理老师", { ...emptyProfile(""), layer: "main", role: `${companyName} 练习生管理老师`, group: "公司" }, null, genKakaoId());
  }
}

let groupBusy = false;

/** 进公司第一天之后：管理老师把她拉进练习生群（第一天那场戏里的老师和同期一起进群） */
export async function ensureTraineeGroup(present: Character[], notify?: (msg: string) => void): Promise<void> {
  const s = load();
  if (groupBusy || (s.groupId && loadChatSessions().some(x => x.id === s.groupId))) return;
  const career = loadCareer();
  const c = companyOf(career.companyId);
  if (!c) return;
  groupBusy = true;
  try {
    const teacher = present.find(isTeacher) ?? (s.teacherId ? loadCharacters().find(x => x.id === s.teacherId) : undefined) ?? await makeTeacher(c.name);
    const mates = present.filter(x => x.id !== teacher.id && isTrainee(x));
    const name = `${c.name} 新人练习生`;
    const session = createGroupSession(name, [teacher.id, ...mates.map(m => m.id)]);
    saveChatSessions(loadChatSessions().map(x => x.id === session.id ? { ...x, groupOwnerId: teacher.id } : x));
    const userName = resolveUserIdentity()?.name || "她";
    pushChatMessage({ sessionId: session.id, role: "system", content: `${teacher.name}邀请${userName}加入了群聊「${name}」`, status: "sent" });
    seedCrowd(session.id, 30 + Math.floor(Math.random() * 30), [teacher.name, ...mates.map(m => m.name)]);
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

/** 节点那场戏演完：发动机安排后续的人 */
export async function afterNodeScene(node: CareerNode | undefined, presentIds: string[], place: string): Promise<void> {
  if (!node) return;
  const chars = loadAllCharacters().filter(c => c.id !== HIDDEN_WORLD_CHAR_ID);
  const present = presentIds.map(id => chars.find(c => c.id === id)).filter((c): c is Character => Boolean(c));
  if (node.kind === "first_day") await ensureTraineeGroup(present);
  if (node.kind === "monthly") await mateAddsAfter(present, place);
}

let tickBusy = false;

/** 每 5 秒在桌面跑：到点的好友申请、群里的日程通知 */
export function kakaoTick(notify: (msg: string) => void): void {
  if (tickBusy || !loadTraineeCard()) return;
  const now = Date.now();
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
  // 第一天那场没演、平常地过去了：老师照样拉群
  if (!s.groupId && career.nodes.some(n => n.kind === "first_day" && n.status !== "pending")) {
    void ensureTraineeGroup([], notify);
    return;
  }
  const teacher = s.teacherId ? loadCharacters().find(c => c.id === s.teacherId) : undefined;
  if (!s.groupId || !teacher || !loadChatSessions().some(x => x.id === s.groupId)) return;
  const next = career.nodes.find(n => n.status === "pending" && n.kind !== "first_day" && !s.noticed.includes(n.id)
    && now >= n.dueAt - 20 * HOUR && now < n.dueAt);
  if (!next) return;
  tickBusy = true;
  save({ ...s, noticed: [...s.noticed, next.id] });
  void teacherNotice(teacher, next).then(text => {
    pushChatMessage({ sessionId: s.groupId!, role: "assistant", content: text, senderCharacterId: teacher.id, senderName: teacher.name, status: "sent" });
    notify(`💬 ${teacher.name}：${text}`);
  }).finally(() => { tickBusy = false; });
}
