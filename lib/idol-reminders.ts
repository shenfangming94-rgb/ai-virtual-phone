/**
 * 爱豆小手机：提醒事项的规矩。
 *
 * 每个日程三种结局：去演（剧情 app）/ 打勾写一句（算真发生过）/ 过了开始时间两小时没动 = 缺席（有后果）。
 * 请假：KakaoTalk 给管理老师发消息，老师批了（回复里 [准假:日程名]）自动「已请假」；也能在提醒事项里直接左滑请假。
 * 待回复：机会先问她要不要，接了才变日程。跳时间遇到日程或新的待回复就停。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import { addChatContact, createOrGetSession, loadChatContacts, pushChatMessage } from "./chat-storage";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding, resolveUserIdentity } from "./settings-storage";
import { getChatPluginHookBus } from "./chat-plugin-hooks";
import {
  acceptOffer, addToCalendar, companyOf, completeNode, declineOffer, loadCareer, saveCareer,
  type CareerNode,
} from "./idol-career";
import { afterNodeScene } from "./idol-kakao";
import { setWorldTime } from "./world-clock";
import { addFame, plannedStops } from "./idol-events";
import { recordAbsent, recordNodeDone } from "./idol-ledger";
import { getProfile, saveProfile } from "./idol-people";

const KEY = "idol_reminders_v1";
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** 过了开始时间多久还没动就算缺席 */
export const ABSENT_AFTER = 2 * HOUR;

type Outbox = { id: string; charId: string; instruction: string; at: number };
type State = { outbox: Outbox[]; absences: number };

function load(): State {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as State | null;
    if (raw) return { outbox: raw.outbox ?? [], absences: raw.absences ?? 0 };
  } catch { /* 坏数据当新的 */ }
  return { outbox: [], absences: 0 };
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); }

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function patchNode(id: string, patch: Partial<CareerNode>): CareerNode | undefined {
  const career = loadCareer();
  const node = career.nodes.find(n => n.id === id);
  if (!node) return undefined;
  const next = { ...node, ...patch };
  saveCareer({ ...career, nodes: career.nodes.map(n => n.id === id ? next : n) });
  return next;
}

/** 管理老师（拉群的那位） */
export function teacherOf(): Character | undefined {
  try {
    const raw = JSON.parse(kvGet("idol_kakao_v1") || "null") as { teacherId?: string } | null;
    return raw?.teacherId ? loadCharacters().find(c => c.id === raw.teacherId) : undefined;
  } catch { return undefined; }
}

/** 记一笔到某人的「你们的事」里，他之后聊天、演戏都知道 */
function noteToPerson(charId: string | undefined, text: string, at: number, place = "") {
  if (!charId) return;
  const p = getProfile(charId);
  saveProfile({ ...p, events: [...p.events, { id: uid("ev"), at, place, text }] });
}

// ── 三种结局 ──

/** 打勾：写一句结果（可以空），算真发生过；节点该有的后续照样走（试镜→签约、第一天→拉群） */
export async function checkNode(id: string, result: string): Promise<void> {
  const text = result.trim();
  const node = patchNode(id, { status: "done", result: text || "照常完成", doneAt: Date.now() });
  if (!node) return;
  const teacher = teacherOf();
  if (node.kind !== "custom" && node.kind !== "date") noteToPerson(teacher?.id, `她${node.title}：${text || "照常完成"}`, node.dueAt, node.place);
  if (node.kind === "date") noteToPerson(node.fromId, `一起去了「${node.title}」${text ? `：${text}` : ""}`, node.dueAt, node.place);
  if (node.kind === "chance") addFame(5);
  recordNodeDone(node, text);
  await completeNode(id);
  await afterNodeScene(loadCareer().nodes.find(n => n.id === id), [], node.place).catch(() => undefined);
}

/** 请假（她直接左滑，或者老师在 KakaoTalk 批了）。周评月考请假要补考 */
export function leaveNode(id: string, reason: string, approvedBy?: string): CareerNode | undefined {
  const node = patchNode(id, { status: "leave", result: [reason.trim(), approvedBy ? `${approvedBy}批的` : ""].filter(Boolean).join("，") || "请假" });
  if (!node) return undefined;
  const teacher = teacherOf();
  if (node.kind !== "custom" && node.kind !== "date") noteToPerson(teacher?.id, `她请假没去${node.title}${reason ? `（${reason}）` : ""}`, node.dueAt);
  if (node.kind === "date") noteToPerson(node.fromId, `她临时说去不了「${node.title}」${reason ? `：${reason}` : ""}`, node.dueAt);
  if (node.kind === "weekly" || node.kind === "monthly") {
    const career = loadCareer();
    const d = new Date(node.dueAt + 3 * DAY);
    d.setHours(19, 0, 0, 0);
    const makeup: CareerNode = {
      id: uid("node"), kind: "makeup", title: `${node.title}补考`, place: node.place,
      premise: `${node.title}那天她请假了，今天单独补考，只有她和老师。`, dueAt: d.getTime(), status: "pending",
      companyId: node.companyId, from: teacher?.name,
    };
    saveCareer({ ...career, nodes: [...career.nodes, makeup].sort((a, b) => a.dueAt - b.dueAt) });
    addToCalendar(makeup);
  }
  // 玩得好的人过一阵听说了，来问问
  const friend = closeFriend([teacher?.id, node.fromId]);
  if (friend) queueMessage(friend.id, `你听说她请假没去${node.title}${reason ? `，好像是因为${reason}` : ""}。按你们的关系和你的性格，在 KakaoTalk 上给她发一两条消息关心一下。`, (1 + Math.random() * 3) * HOUR);
  return node;
}

/** 她在 KakaoTalk 里加的人里，跟她事情最多的那个（排除老师） */
function closeFriend(exclude: (string | undefined)[]): Character | undefined {
  const friends = new Set(loadChatContacts().map(c => c.characterId));
  return loadCharacters()
    .filter(c => friends.has(c.id) && !exclude.includes(c.id) && !/老师|经纪/.test(getProfile(c.id).role))
    .sort((a, b) => getProfile(b.id).events.length - getProfile(a.id).events.length)[0];
}

// ── 待回复 ──

export function acceptInvite(id: string): CareerNode | undefined {
  if (loadCareer().offers.some(o => o.id === id)) return acceptOffer(id) ?? undefined;
  const node = patchNode(id, { status: "pending" });
  if (node) addToCalendar(node);
  if (node?.kind === "date") noteToPerson(node.fromId, `她答应了「${node.title}」`, Date.now());
  return node;
}

export function declineInvite(id: string): void {
  if (loadCareer().offers.some(o => o.id === id)) { declineOffer(id); return; }
  const node = patchNode(id, { status: "declined", result: "没去" });
  if (node?.kind === "date") noteToPerson(node.fromId, `她没答应「${node.title}」`, Date.now());
}

/** 她自己记一笔 */
export function addMine(title: string, at: number, note: string): CareerNode {
  const node: CareerNode = { id: uid("node"), kind: "custom", title: title.trim() || "提醒", place: "", premise: "", dueAt: at, status: "pending", note: note.trim() || undefined };
  const career = loadCareer();
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  addToCalendar(node);
  return node;
}

export function deleteNode(id: string): void {
  const career = loadCareer();
  saveCareer({ ...career, nodes: career.nodes.filter(n => n.id !== id) });
}

export function setWish(id: string, wish: string): void { patchNode(id, { wish: wish.trim() || undefined }); }
export function setNote(id: string, note: string): void { patchNode(id, { note: note.trim() || undefined }); }
/** 已完成的改回没做 */
export function uncheckNode(id: string): void { patchNode(id, { status: "pending", result: undefined, doneAt: undefined }); }

// ── 跳时间遇到日程就停 ──

/** 想跳到 target：中间有日程（提前半小时停）或新的待回复到达，就停在那里 */
export function capJump(target: number): { target: number; stoppedBy?: string } {
  const now = Date.now();
  const career = loadCareer();
  const stops: { at: number; title: string }[] = [];
  for (const n of career.nodes) {
    if (n.status === "pending" && n.dueAt > now + 30 * MIN) stops.push({ at: n.dueAt - 30 * MIN, title: n.title });
    if (n.status === "invite" && n.dueAt > now) stops.push({ at: Math.max(now + MIN, n.dueAt - 7 * DAY), title: `待回复：${n.title}` });
  }
  for (const o of career.offers) if (o.status === "new" && !o.notified && o.at > now) stops.push({ at: o.at, title: `${companyOf(o.companyId)?.name} 来找你了` });
  for (const p of plannedStops()) if (p.at > now) stops.push(p);
  const first = stops.filter(s => s.at < target).sort((a, b) => a.at - b.at)[0];
  return first ? { target: first.at, stoppedBy: first.title } : { target };
}

// ── 缺席和消息 ──

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

function queueMessage(charId: string, instruction: string, delay: number) {
  const s = load();
  save({ ...s, outbox: [...s.outbox, { id: uid("out"), charId, instruction, at: Date.now() + delay }] });
}

/** 让某人在 KakaoTalk 私聊给她发消息（没加过就先加上，比如老师） */
async function sendAs(charId: string, instruction: string): Promise<string | null> {
  const char = loadCharacters().find(c => c.id === charId);
  if (!char) return null;
  const me = resolveUserIdentity(charId, "chat")?.name || "她";
  const res = await simpleLLMCall(chatConfig(), [
    { role: "system", content: `你是${char.name}。${char.persona}\n\n你在 KakaoTalk 上给${me}发私聊消息。只输出要发的消息本身，一到三条，每条一行，口语，不要旁白、不要引号。` },
    { role: "user", content: instruction },
  ], { temperature: 0.85, label: "有人来找你" });
  const lines = (res.content || "").split("\n").map(l => l.trim().replace(/^["「]|["」]$/g, "")).filter(Boolean).slice(0, 3);
  if (!lines.length) return null;
  if (!loadChatContacts().some(c => c.characterId === charId)) addChatContact(charId);
  const session = createOrGetSession(charId);
  for (const l of lines) pushChatMessage({ sessionId: session.id, role: "assistant", content: l, status: "sent" });
  return lines[0];
}

/** 缺席的后果：公司的事老师来问，第二次起叫去办公室；约好的事那个人来问 */
function onAbsent(node: CareerNode) {
  recordAbsent(node);
  const teacher = teacherOf();
  if (node.kind === "custom") return;
  if (node.kind === "date") {
    noteToPerson(node.fromId, `约好的「${node.title}」她没来，也没说一声`, node.dueAt);
    if (node.fromId) queueMessage(node.fromId, `你们约好的「${node.title}」（${node.place}），她没来，也没提前说。按你的性格和你们的关系发消息给她。`, 10 * MIN);
    return;
  }
  if (node.kind === "audition") return;
  const s = load();
  save({ ...s, absences: s.absences + 1 });
  noteToPerson(teacher?.id, `她没来${node.title}，也没请假`, node.dueAt, node.place);
  if (!teacher) return;
  if (s.absences >= 1) {
    // 第二次起：叫去办公室
    const career = loadCareer();
    const d = new Date(Date.now() + DAY);
    d.setHours(15, 0, 0, 0);
    const talk: CareerNode = {
      id: uid("node"), kind: "talk", title: `去办公室找${teacher.name}老师`, place: `${companyOf(career.companyId)?.name ?? ""} 办公室`.trim(),
      premise: `她已经缺席了好几次日程（最近一次是${node.title}），${teacher.name}老师叫她来办公室谈话。`, dueAt: d.getTime(), status: "pending",
      companyId: career.companyId, from: teacher.name, fromId: teacher.id,
    };
    saveCareer({ ...career, nodes: [...career.nodes, talk].sort((a, b) => a.dueAt - b.dueAt) });
    addToCalendar(talk);
    queueMessage(teacher.id, `她又没来${node.title}，也没请假，这已经不是第一次了。通知她明天下午三点来办公室找你，语气按你的性格。`, 5 * MIN);
  } else {
    queueMessage(teacher.id, `今天的${node.title}她没来，也没请假。发消息问她怎么回事。`, 5 * MIN);
  }
}

let busy = false;

/** 每 5 秒在桌面跑：到时间的缺席、过期的待回复、排队的消息 */
export function reminderTick(notify: (msg: string) => void): void {
  if (busy) return;
  const now = Date.now();
  const career = loadCareer();
  const absent: CareerNode[] = [];
  let changed = false;
  const nodes = career.nodes.map(n => {
    if ((n.status === "pending" && now > n.dueAt + ABSENT_AFTER && n.kind !== "custom") || n.status === "passed") {
      changed = true;
      if (n.status === "pending") absent.push(n);
      return { ...n, status: "absent" as const };
    }
    if (n.status === "invite" && n.replyBy && now > n.replyBy) { changed = true; return { ...n, status: "declined" as const, result: "没回复，名额给别人了" }; }
    return n;
  });
  if (changed) saveCareer({ ...career, nodes });
  for (const n of absent) { notify(`❗ ${n.title} 没去，算缺席了`); onAbsent(n); }

  const s = load();
  const due = s.outbox.find(o => o.at <= now);
  if (!due) return;
  busy = true;
  save({ ...s, outbox: s.outbox.filter(o => o.id !== due.id) });
  void sendAs(due.charId, due.instruction)
    .then(first => { if (first) notify(`💬 ${loadCharacters().find(c => c.id === due.charId)?.name}：${first}`); })
    .catch(() => undefined)
    .finally(() => { busy = false; });
}

// ── 老师在 KakaoTalk 里批假 ──

/** 私聊老师时给他的提示：她请假你决定批不批，批了写记号 */
export function buildIdolChatHint(characterId: string, isGroup: boolean): string {
  if (isGroup || typeof window === "undefined") return "";
  const out: string[] = [];
  const now = Date.now();
  const teacher = teacherOf();
  if (teacher && teacher.id === characterId) {
    const upcoming = loadCareer().nodes.filter(n => n.status === "pending" && n.dueAt > now - ABSENT_AFTER && n.kind !== "custom" && n.kind !== "date").slice(0, 6);
    if (upcoming.length) out.push(
      "### 请假",
      `她接下来的日程：${upcoming.map(n => `「${n.title}」${new Date(n.dueAt).getMonth() + 1}月${new Date(n.dueAt).getDate()}日`).join("、")}`,
      "【规则】她找你请假时，按你的性格、她的理由和她最近的表现决定批不批。批了就在回复末尾另起一行写 [准假:日程名]（日程名照上面写），没批就正常回她，不写记号。",
    );
  }
  const asked = loadCareer().nodes.filter(n => n.status === "invite" && n.fromId === characterId);
  if (asked.length) out.push(
    "### 等她回复的事",
    `你问过她：${asked.map(n => `「${n.title}」`).join("、")}`,
    "【规则】她在聊天里明确答应了，就在回复末尾另起一行写 [答应:事情名]；明确说不去，就写 [不去:事情名]；没说清楚就不写。",
  );
  return out.length ? ["", "", ...out, ""].join("\n") : "";
}

let hooked = false;

/** 装一次：消息落库前摘掉老师回复里的 [准假:…]，把对应日程改成已请假 */
export function installIdolChatHooks(notify: (msg: string) => void): void {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  getChatPluginHookBus().registerTransform("idol-reminders", "message.beforePersist", (raw: unknown) => {
    const payload = raw as { message: { role: string; content: string } };
    const msg = payload.message;
    if (msg.role !== "assistant" || !/准假|答应|不去/.test(msg.content || "")) return payload;
    const titles: string[] = [];
    const yes: string[] = [];
    const no: string[] = [];
    const content = msg.content
      .replace(/\[准假[:：]\s*([^\]]+)\]/g, (_, t: string) => { titles.push(t.trim()); return ""; })
      .replace(/\[答应[:：]\s*([^\]]+)\]/g, (_, t: string) => { yes.push(t.trim()); return ""; })
      .replace(/\[不去[:：]\s*([^\]]+)\]/g, (_, t: string) => { no.push(t.trim()); return ""; })
      .trim();
    if (!titles.length && !yes.length && !no.length) return payload;
    const match = (t: string) => loadCareer().nodes.find(n => n.status === "invite" && (n.title === t || t.includes(n.title) || n.title.includes(t)));
    for (const t of yes) { const n = match(t); if (n) { acceptInvite(n.id); notify(`📅 ${n.title}：答应了，写进日程`); } }
    for (const t of no) { const n = match(t); if (n) { declineInvite(n.id); notify(`${n.title}：回了不去`); } }
    const teacher = teacherOf();
    for (const t of titles) {
      const node = loadCareer().nodes.find(n => n.status === "pending" && (n.title === t || t.includes(n.title) || n.title.includes(t)));
      if (node) { leaveNode(node.id, "", teacher?.name); notify(`📝 ${node.title} 请好假了`); }
    }
    return { ...payload, message: { ...msg, content } };
  });
}

/** 世界时间白天浅色、晚上深色（7 点到 19 点算白天） */
export function isNightNow(): boolean {
  const h = new Date().getHours();
  return h < 7 || h >= 19;
}

/** 跳时间（遇到日程或新的待回复就停）。返回停下来的原因，没停返回空 */
export function jumpWorld(target: number): string {
  const r = capJump(target);
  setWorldTime(r.target);
  return r.stoppedBy ? `停在了：${r.stoppedBy}` : "";
}
