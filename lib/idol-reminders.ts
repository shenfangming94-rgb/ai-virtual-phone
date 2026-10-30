import { loadRomance, romanceActorHint, romanceMessageDelivered, romanceMessageExpired } from "./idol-romance";
/**
 * 爱豆小手机：提醒事项的规矩。
 *
 * 每个日程三种结局：去演（剧情 app）/ 打勾写一句（算真发生过）/ 过了开始时间两小时没动 = 缺席（有后果）。
 * 请假：KakaoTalk 给室长发消息，老师批了（回复里 [准假:日程名]）自动「已请假」；也能在提醒事项里直接左滑请假。
 * 待回复：机会先问她要不要，接了才变日程。跳时间遇到日程或新的待回复就停。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import { loadChatMessages, loadChatSessions, addChatContact, createOrGetSession, loadChatContacts, pushChatMessage, type ChatMessage } from "./chat-storage";
import { applyInvitationActions, extractInvitationActions, type InvitationAction } from "./idol-invitation-chat";
import { chatNotice, noticeTime, recordScheduleReply } from "./idol-schedule-notices";
import { loadMails, updateMail, recordMailReply, MAIL_EVENT } from "./idol-mail";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding, resolveUserIdentity } from "./settings-storage";
import { getChatPluginHookBus } from "./chat-plugin-hooks";
import {
  acceptOffer, addToCalendar, companyOf, completeNode, declineOffer, loadCareer, saveCareer,
  type CareerNode,
} from "./idol-career";
import { afterNodeScene } from "./idol-kakao";
import { loadWorldClock, realNow, setWorldClockReal, setWorldTime } from "./world-clock";
import { findTimeJumpStop, TIME_JUMP_EVENT, type TimeJumpOptions } from "./idol-time-jump";
import { addFame, plannedStops } from "./idol-events";
import { recordAbsent, recordNodeDone, scoreResultText } from "./idol-ledger";
import { getProfile, saveProfile } from "./idol-people";
import { onSelection, revealName } from "./idol-debut";
import { yearlyStops } from "./idol-yearly";
import { classesForTeacher, leaveFromMarker, onNodeDone } from "./idol-starroad";
import { destinyStops } from "./idol-destiny";

const KEY = "idol_reminders_v1";
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** 过了开始时间多久还没动就算缺席 */
export const ABSENT_AFTER = 2 * HOUR;

type Outbox = { romanceId?: string; id: string; charId: string; instruction: string; at: number; node?: CareerNode; strictPersona?: boolean; important?: boolean; birthdayDate?: string; requireFriend?: boolean; attempts?: number; paused?: boolean; dedupeKey?: string; delivered?: { sessionId: string; messageId: string } };
type State = { outbox: Outbox[]; absences: number; sentKeys?: string[] };

function load(): State {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as State | null;
    if (raw) return { outbox: raw.outbox ?? [], absences: raw.absences ?? 0, sentKeys: raw.sentKeys ?? [] };
  } catch { /* 坏数据当新的 */ }
  return { outbox: [], absences: 0 };
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); if (typeof window !== "undefined") window.dispatchEvent(new Event("idol-notice-outbox-updated")); }

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function patchNode(id: string, patch: Partial<CareerNode>): CareerNode | undefined {
  const career = loadCareer();
  const node = career.nodes.find(n => n.id === id);
  if (!node) return undefined;
  const next = { ...node, ...patch };
  saveCareer({ ...career, nodes: career.nodes.map(n => n.id === id ? next : n) });
  return next;
}

/** 室长（拉群的那位） */
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
  if (node.kind !== "custom" && node.kind !== "date" && node.kind !== "practice") noteToPerson(teacher?.id, `她${node.title}：${text || "照常完成"}`, node.dueAt, node.place);
  if (node.kind === "date") noteToPerson(node.fromId, `一起去了「${node.title}」${text ? `：${text}` : ""}`, node.dueAt, node.place);
  if (node.kind === "chance") addFame(5, node.title);
  recordNodeDone(node, text);
  const sc = scoreResultText(text);
  const perf = sc >= 3 ? "good" : sc < 0 ? "bad" : "ok";
  onNodeDone(node, perf);
  await completeNode(id, perf);
  await afterNodeScene(loadCareer().nodes.find(n => n.id === id), [], node.place).catch(() => undefined);
}

/** 请假（她直接左滑，或者老师在 KakaoTalk 批了）。周评月考请假要补考 */
export function leaveNode(id: string, reason: string, approvedBy?: string): CareerNode | undefined {
  const node = patchNode(id, { status: "leave", result: [reason.trim(), approvedBy ? `${approvedBy}批的` : ""].filter(Boolean).join("，") || "请假" });
  if (!node) return undefined;
  const teacher = teacherOf();
  if (node.kind !== "custom" && node.kind !== "date") noteToPerson(teacher?.id, `她请假没去${node.title}${reason ? `（${reason}）` : ""}`, node.dueAt);
  if (node.kind === "date") noteToPerson(node.fromId, `她临时说去不了「${node.title}」${reason ? `：${reason}` : ""}`, node.dueAt);
  if (node.kind === "debut" && node.step === "name") void revealName();
  if (node.kind === "selection") {
    // 选拔请假：公司给她单独再看一次
    const career = loadCareer();
    const d = new Date(node.dueAt + 3 * DAY);
    d.setHours(14, 0, 0, 0);
    const again: CareerNode = { ...node, id: uid("node"), title: `${node.title}（单独补看）`, premise: `${node.premise}（那天她请假了，今天单独给她补一次，只有她一个人表演）`, dueAt: d.getTime(), status: "pending", result: undefined, remindedDue: false, remindedEve: false };
    saveCareer({ ...career, nodes: [...career.nodes, again].sort((a, b) => a.dueAt - b.dueAt) });
    addToCalendar(again);
  }
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

export function acceptInvite(id: string, source: "reminder" | "chat" = "reminder"): CareerNode | undefined {
  if (loadCareer().offers.some(o => o.id === id)) return acceptOffer(id) ?? undefined;
  const before = loadCareer().nodes.find(n => n.id === id);
  if (!before || before.status !== "invite" || (before.replyBy && before.replyBy < Date.now())) return undefined;
  const node = patchNode(id, { status: "pending" });
  if (node) addToCalendar(node);
  if (node) {
    if (node.notice?.channel === "mail") {
      const mail = loadMails().find(m => m.id === node.notice!.refId);
      if (mail?.action) updateMail(mail.id, { action: { ...mail.action, status: "accepted", nodeId: node.id } });
      if (mail) recordMailReply(mail.id, true, `${noticeTime(node.dueAt)} · ${node.place}`);
    }
    for (const actor of new Set([node.fromId, ...(node.inviterIds || [])])) noteToPerson(actor, `她答应了「${node.title}」：${noticeTime(node.dueAt)}，${node.place}`, Date.now());
    if (source === "reminder") recordScheduleReply(node, true);
  }
  return node;
}

export function declineInvite(id: string, source: "reminder" | "chat" = "reminder"): void {
  if (loadCareer().offers.some(o => o.id === id)) { declineOffer(id); return; }
  const before = loadCareer().nodes.find(n => n.id === id);
  if (!before || before.status !== "invite") return;
  const node = patchNode(id, { status: "declined", result: "没去" });
  if (node) {
    if (node.notice?.channel === "mail") {
      const mail = loadMails().find(m => m.id === node.notice!.refId);
      if (mail?.action) updateMail(mail.id, { action: { ...mail.action, status: "declined", nodeId: node.id } });
      if (mail) recordMailReply(mail.id, false);
    }
    for (const actor of new Set([node.fromId, ...(node.inviterIds || [])])) noteToPerson(actor, `她没答应「${node.title}」`, Date.now());
    if (source === "reminder") recordScheduleReply(node, false);
  }
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

function activeTimeNodeId(): string | undefined {
  return typeof document === "undefined" ? undefined : document.querySelector("[data-active-time-node]")?.getAttribute("data-active-time-node") || undefined;
}

/** 想跳到 target：中间有日程（提前半小时停）或新的待回复到达，就停在那里 */
export function capJump(target: number, options: TimeJumpOptions = {}): { target: number; stoppedBy?: string } {
  const now = Date.now();
  const career = loadCareer();
  const stops = [...plannedStops(), ...yearlyStops(), ...destinyStops(), ...load().outbox.filter(o => (o.node || o.important) && !o.paused && (!o.requireFriend || loadChatContacts().some(c => c.characterId === o.charId))).map(o => ({ at: o.at, title: o.node ? `新邀请：${o.node.title}` : "生日祝福消息" }))];
  return findTimeJumpStop(now, target, career.nodes, career.offers, stops, { activeNodeId: options.activeNodeId ?? activeTimeNodeId() });
}

// ── 缺席和消息 ──

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

export function queueMessage(charId: string, instruction: string, delay: number, options: Pick<Outbox, "node" | "strictPersona" | "important" | "birthdayDate" | "requireFriend" | "dedupeKey" | "romanceId"> = {}) {
  const s = load();
  if (options.dedupeKey && (s.sentKeys?.includes(options.dedupeKey) || s.outbox.some(o => o.dedupeKey === options.dedupeKey))) return;
  save({ ...s, outbox: [...s.outbox, { id: uid("out"), charId, instruction, at: Date.now() + delay, ...options }] });
}

export function pendingNoticeFailures(): { id: string; title: string }[] {
  return load().outbox.filter(o => o.paused).map(o => ({ id: o.id, title: o.node?.title || `${loadCharacters().find(c => c.id === o.charId)?.name || "联系人"}的消息` }));
}
export function retryNotice(id: string): void {
  const s = load(); save({ ...s, outbox: s.outbox.map(o => o.id === id ? { ...o, paused: false, attempts: 0, at: Date.now() } : o) });
}

/** 让某人在 KakaoTalk 私聊给她发消息（没加过就先加上，比如老师）。
 *  走正常的 KakaoTalk 聊天引擎（她的预设、世界书、正则、聊天记录都在），为什么来找她放进 buildIdolChatHint 悄悄告诉他；
 *  聊天引擎失败就退回简单调用 */
async function sendAs(charId: string, instruction: string, strictPersona = false): Promise<ChatMessage | null> {
  const char = loadCharacters().find(c => c.id === charId);
  if (!char) return null;
  if (!loadChatContacts().some(c => c.characterId === charId)) addChatContact(charId);
  const session = createOrGetSession(charId);
  const before = loadChatMessages(session.id).length;
  try {
    proactive.set(charId, instruction);
    const { requestBackgroundChatReply } = await import("./follow-up-service");
    const r = await requestBackgroundChatReply(session.id);
    const fresh = loadChatMessages(session.id).slice(before).filter(m => m.role === "assistant" && m.content.trim() && m.status !== "rejected" && m.status !== "failed");
    if (fresh.length) return fresh[0]; // 已送达就不能因后续处理失败再生成一遍。
    if (r.skipped === "already_running") return null;
  } catch { /* 下面按该消息的重试策略处理 */ }
  finally { proactive.delete(charId); }
  const alreadySent = loadChatMessages(session.id).slice(before).find(m => m.role === "assistant" && m.content.trim() && m.status !== "rejected" && m.status !== "failed");
  if (alreadySent) return alreadySent;
  if (strictPersona) return null;
  const me = resolveUserIdentity(charId, "chat")?.name || "她";
  const res = await simpleLLMCall(chatConfig(), [
    { role: "system", content: `你是${char.name}。${char.persona}\n\n你在 KakaoTalk 上给${me}发私聊消息。只输出要发的消息本身，一到三条，每条一行，口语，不要旁白、不要引号。` },
    { role: "user", content: instruction },
  ], { temperature: 0.85, label: "有人来找你" });
  const lines = (res.content || "").split("\n").map(l => l.trim().replace(/^["「]|["」]$/g, "")).filter(Boolean).slice(0, 3);
  if (!lines.length) return null;
  const sent = lines.map(l => pushChatMessage({ sessionId: session.id, role: "assistant", content: l, status: "sent" }));
  return sent.find(m => m.status !== "rejected" && m.status !== "failed") || null;
}

/** 缺席的后果：公司的事老师来问，第二次起叫去办公室；约好的事那个人来问 */
function onAbsent(node: CareerNode) {
  // 作业没交：这周不涨，不罚
  if (node.kind === "homework") return;
  recordAbsent(node);
  if (node.kind === "selection") void onSelection(node, "absent");
  if (node.kind === "debut" && node.step === "name") void revealName();
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
  const activeId = activeTimeNodeId();
  const nodes = career.nodes.map(n => {
    if (n.id === activeId) return n; // 正在演该日程，不把自然耗时误判为缺席。
    if ((n.status === "pending" && now > n.dueAt + ABSENT_AFTER && n.kind !== "custom" && n.kind !== "practice") || n.status === "passed") {
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
  const queued = s.outbox.find(o => !o.paused && o.at <= now && (!o.requireFriend || loadChatContacts().some(c => c.characterId === o.charId)));
  if (!queued) return;
  const due = { ...queued };
  if (due.romanceId && loadRomance().knowledge.find(k => k.id === due.romanceId)?.supersededBy && !due.delivered) {
    save({ ...s, outbox: s.outbox.filter(o => o.id !== due.id) }); return;
  }
  const today = `${new Date(now).getFullYear()}-${String(new Date(now).getMonth()+1).padStart(2,"0")}-${String(new Date(now).getDate()).padStart(2,"0")}`;
  const lateBirthday = due.birthdayDate && due.birthdayDate < today;
  if (lateBirthday || (due.node && due.node.dueAt <= now && due.dedupeKey?.startsWith("birthday:"))) {
    due.node = undefined;
    due.instruction = `这条生日祝福原定在${due.birthdayDate || "她生日当天"}送达，现在时间已经过去。沿用你的人设、关系与记忆，自然送上迟到的祝福，不再说今天生日，不责怪她没上线，不重复发起已经过期的庆祝邀请。`;
  } else if (due.node && due.node.dueAt <= now && !due.delivered) {
    if (due.romanceId) romanceMessageExpired(due.romanceId);
    save({ ...s, outbox: s.outbox.filter(o => o.id !== due.id) }); return;
  }
  busy = true;
  const existing = due.node ? loadCareer().nodes.find(n => n.id === due.node!.id) : undefined;
  const instruction = `${due.instruction}${due.node ? `\n本轮对应事项编号${due.node.id}，标题「${due.node.title}」，${noticeTime(due.node.dueAt)}，地点${due.node.place}。${existing && existing.status !== "invite" ? `她已处理此邀请，当前状态${existing.status}，不要重复询问。` : "自然说出邀请的具体时间地点并问她愿不愿意，不替她答应。"}这条邀请由系统随消息发布，不另写创建邀约标记。` : ""}`;
  const delivered = due.delivered ? loadChatMessages(due.delivered.sessionId).find(m => m.id === due.delivered!.messageId) : undefined;
  const sending = delivered ? Promise.resolve(delivered) : sendAs(due.charId, instruction, Boolean(due.strictPersona));
  void sending
    .then(first => {
      if (!first) throw new Error("消息未送达");
      const received = load(); save({ ...received, outbox: received.outbox.map(o => o.id === due.id ? { ...o, delivered: { sessionId: first.sessionId, messageId: first.id } } : o) });
      if (due.node) {
        const career = loadCareer();
        const old = career.nodes.find(n => n.id === due.node!.id);
        const card = loadChatMessages(first.sessionId).find(m => m.idolScheduleId === due.node!.id && m.role === "system") || pushChatMessage({ sessionId: first.sessionId, role: "system", idolScheduleId: due.node.id, content: `邀请信息：「${due.node.title}」 · ${noticeTime(due.node.dueAt)} · ${due.node.place}${old && old.status !== "invite" ? ` · ${old.status === "pending" ? "已接受" : "已处理"}` : " · 待回复"}`, status: "sent" });
        const node = { ...(old || due.node), notice: chatNotice(first.sessionId, card.id, due.charId) };
        saveCareer({ ...career, nodes: old ? career.nodes.map(n => n.id === node.id ? node : n) : [...career.nodes, node].sort((a,b) => a.dueAt-b.dueAt) });
      }
      const latest = load(); save({ ...latest, outbox: latest.outbox.filter(o => o.id !== due.id), sentKeys: due.dedupeKey ? [...(latest.sentKeys || []), due.dedupeKey].slice(-300) : latest.sentKeys });
      if (due.romanceId) romanceMessageDelivered(due.romanceId, first);
      notify(`💬 ${loadCharacters().find(c => c.id === due.charId)?.name}：${first.content}`);
    })
    .catch(() => {
      const latest = load(); const attempts = (due.attempts || 0) + 1;
      save({ ...latest, outbox: latest.outbox.map(o => o.id === due.id ? { ...o, attempts, paused: attempts >= 3, at: Date.now() + attempts * 5 * MIN } : o) });
      if (attempts >= 3) notify("有一条消息尚未送达，可在提醒事项中重试");
    })
    .finally(() => { busy = false; });
}

// ── 老师在 KakaoTalk 里批假 ──

/** 私聊老师时给他的提示：她请假你决定批不批，批了写记号 */
/** 主动找她：下一次给这个人生成回复时悄悄告诉他为什么来找她（用一次就清掉） */
const proactive = new Map<string, string>();

export function buildIdolChatHint(characterId: string, isGroup: boolean): string {
  if (isGroup || typeof window === "undefined") return "";
  const out: string[] = [romanceActorHint(characterId)];
  const intent = proactive.get(characterId);
  if (intent) {
    out.push("### 这一条是你主动发的", "她没有给你发消息，是你自己想找她：", intent);
  }
  const now = Date.now();
  const teacher = teacherOf();
  if (teacher && teacher.id === characterId) {
    const upcoming = loadCareer().nodes.filter(n => n.status === "pending" && n.dueAt > now - ABSENT_AFTER && n.kind !== "custom" && n.kind !== "date" && n.kind !== "practice").slice(0, 8);
    const classes = classesForTeacher();
    if (upcoming.length || classes) out.push(
      "### 请假",
      upcoming.length ? `她接下来的日程：${upcoming.map(n => `「${n.title}」${new Date(n.dueAt).getMonth() + 1}月${new Date(n.dueAt).getDate()}日`).join("、")}` : "",
      classes ? `她接下来几天的课：\n${classes}` : "",
      "【规则】她找你请假时，按你的性格、她的理由和她最近的表现决定批不批。批了就在回复末尾另起一行写记号：日程写 [准假:日程名]（照上面写）；请一整天的课写 [准假:几月几日]；只请一节课写 [准假:几月几日 课名]。那天有日程也要请就各写一行。没批就正常回她，不写记号。",
    );
  }
  const asked = loadCareer().nodes.filter(n => n.fromId === characterId || n.inviterIds?.includes(characterId));
  if (asked.length) out.push(
    "### 等她回复的事",
    `你约过她：${asked.slice(-12).map(n => `编号${n.id}「${n.title}」${noticeTime(n.dueAt)} ${n.place}：${n.status === "invite" ? "待回复，尚未决定" : n.status === "pending" ? "已接受" : n.status === "declined" ? n.result || "已拒绝" : n.status}`).join("；")}`,
    "【规则】只依据她这一轮的明确答复更新对应邀请，不能把闲聊、假设、引用、模糊意向或历史答复当成接受。确定答应写 [邀请回复:事项编号|accept|她本轮明确答复原文]；确定拒绝写 [邀请回复:事项编号|decline|她本轮明确答复原文]。多件事分不清时先问清楚，不写标记；待回复不等于拒绝，不催打卡。",
  );
  out.push("### 邀约记录\n本轮主动提出具体时间地点的生活邀约时，末尾写 [新增邀约:{\"title\":\"简短事项名\",\"at\":\"YYYY-MM-DD HH:mm\",\"place\":\"具体地点\",\"replyBy\":\"YYYY-MM-DD HH:mm\"}]。尚未商定的模糊提议不建事项，不替她接受。改变你发起的邀约时间地点写 [改期邀约:{\"id\":\"原事项编号\",\"at\":\"YYYY-MM-DD HH:mm\",\"place\":\"地点\"}]，更改后需重新确认；你取消自己发起的邀约写 [取消邀约:事项编号]。只改你本人相关的事项，不处理别人的邀请。");
  return out.length ? ["", "", ...out, ""].join("\n") : "";
}

let hooked = false;
let syncingMails = false;
/** 邮件送达即发布待回复邀请；两个入口共用同一个nodeId和接受状态。 */
export function syncMailInvitations(): void {
  if (syncingMails) return;
  syncingMails = true;
  try {
    for (const mail of loadMails()) {
      const action = mail.action;
      if (!action || action.status !== "new" || action.at <= Date.now() || action.nodeId) continue;
      const career = loadCareer(), id = `mail_invite_${mail.id}`;
      const node: CareerNode = { id, kind: "audition", title: `${companyOf(action.companyId)?.name || mail.from} 试镜`, place: action.place, premise: mail.body.map(p => p.zh).join("\n"), dueAt: action.at, status: "invite", companyId: action.companyId, from: mail.from, note: action.prep, replyBy: action.at - HOUR, notice: { channel: "mail", refId: mail.id, at: mail.at } };
      if (!career.nodes.some(n => n.id === id)) saveCareer({ ...career, nodes: [...career.nodes, node] });
      updateMail(mail.id, { action: { ...action, nodeId: id } });
    }
  } finally { syncingMails = false; }
}

/** 装一次：消息落库前摘掉老师回复里的 [准假:…]，把对应日程改成已请假 */
export function installIdolChatHooks(notify: (msg: string) => void): void {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  window.addEventListener(MAIL_EVENT, syncMailInvitations);
  syncMailInvitations();
  const actions = new Map<string, InvitationAction[]>();
  getChatPluginHookBus().registerTransform("idol-reminders", "message.beforePersist", (raw: unknown) => {
    const payload = raw as { message: ChatMessage };
    const msg = payload.message;
    if (msg.role !== "assistant") return payload;
    const extracted = extractInvitationActions(msg.content || "");
    if (extracted.actions.length) actions.set(msg.id, extracted.actions);
    while (actions.size > 128) actions.delete(actions.keys().next().value!);
    // 准假仍兼容，但只有真实室长的会话能批准，不能由其他角色改全局日程。
    const session = loadChatSessions().find(s => s.id === msg.sessionId);
    const actor = session?.isGroup ? msg.senderCharacterId : session?.contactId;
    const titles: string[] = [];
    const content = extracted.content.replace(/\[准假[:：]\s*([^\]]+)\]/g, (_, t: string) => { titles.push(t.trim()); return ""; }).trim();
    if (actor === teacherOf()?.id && actor && !session?.isBlacklisted && !proactive.has(actor) && msg.status !== "rejected" && msg.status !== "failed") {
      for (const t of titles) {
        const matches = loadCareer().nodes.filter(n => n.status === "pending" && n.title === t);
        if (matches.length === 1) { leaveNode(matches[0].id, "", teacherOf()?.name); notify(`📝 ${matches[0].title} 请好假了`); }
        else if (!matches.length && leaveFromMarker(t)) notify(`📝 ${t} 请好假了`);
      }
    }
    return { ...payload, message: { ...msg, content } };
  });
  getChatPluginHookBus().registerEvent("idol-reminders", "message.persisted", (raw: unknown) => {
    const msg = (raw as { message: ChatMessage }).message;
    const parsed = actions.get(msg.id); actions.delete(msg.id);
    const session = loadChatSessions().find(s => s.id === msg.sessionId);
    const actor = session?.isGroup ? msg.senderCharacterId : session?.contactId;
    if (!parsed || !actor || proactive.has(actor)) return;
    applyInvitationActions(msg, parsed, { accept: id => { acceptInvite(id, "chat"); }, decline: id => { declineInvite(id, "chat"); }, notify });
  });
}

/** 世界时间白天浅色、晚上深色（7 点到 19 点算白天） */
export function isNightNow(): boolean {
  const h = new Date().getHours();
  return h < 7 || h >= 19;
}

/** 跳时间（遇到日程或新的待回复就停）。返回停下来的原因，没停返回空 */
export function jumpWorld(target: number, options: TimeJumpOptions = {}): string {
  if (!Number.isFinite(target)) return "时间无效，请重新选择";
  return applyTimeJump(capJump(target, options));
}

function applyTimeJump(r: { target: number; stoppedBy?: string }): string {
  setWorldTime(r.target);
  const message = r.stoppedBy ? `停在了：${r.stoppedBy}。现在是${new Date(r.target).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}，可到提醒事项或 KakaoTalk 查看` : "";
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TIME_JUMP_EVENT, { detail: { message } }));
  return message;
}

/** 时钟与设置共用；切到现实时间也不能绕过尚未处理的重要事件。 */
export function switchWorldClockMode(real: boolean): string {
  const clock = loadWorldClock();
  const target = real ? realNow() : clock.world;
  if (typeof target === "number" && target > Date.now()) {
    const r = capJump(target);
    if (r.stoppedBy) return applyTimeJump(r);
  }
  setWorldClockReal(real);
  return "";
}

/** 给现有剧情生成一个本地时间上限，正文和[时间]都不要越过它。 */
export function sceneTimeBoundaryHint(activeNodeId?: string): string {
  const now = Date.now();
  const r = capJump(now + 24 * HOUR, { activeNodeId });
  return r.stoppedBy ? `【时间边界】${r.stoppedBy}；最多自然经过${Math.max(0, Math.floor((r.target - now) / MIN))}分钟。正文和[时间]标记都不能写到这个边界之后，不替她处理该事件，临近时留给她决定。` : "";
}
