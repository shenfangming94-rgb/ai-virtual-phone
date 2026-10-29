/** 通知送达凭据。只有真正写入通知渠道后，事项才引用这份凭据。全程本地。 */
import type { CareerNode } from "./idol-career";
import { kvGet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import { createOrGetSession, loadChatContacts, loadChatMessages, loadChatSessions, pushChatMessage } from "./chat-storage";
import { pushLockNote } from "./idol-notes";

export type ScheduleNotice = { channel: "private" | "group" | "mail" | "system"; refId: string; sessionId?: string; senderId?: string; at: number };
export const noticeTime = (at: number) => new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function chatNotice(sessionId: string, messageId: string, senderId?: string): ScheduleNotice {
  const session = loadChatSessions().find(s => s.id === sessionId);
  return { channel: session?.isGroup ? "group" : "private", refId: messageId, sessionId, senderId: senderId || session?.contactId, at: Date.now() };
}

/** 已确定的日程本地发通知；同一批公司排期合成一条，避免逐项刷屏。 */
export function announceSchedule(nodes: CareerNode[], change = "安排"): ScheduleNotice {
  const first = nodes[0];
  let settings: { teacherId?: string; groupId?: string } = {};
  try { settings = JSON.parse(kvGet("idol_kakao_v1") || "{}"); } catch { /* 尚未进公司 */ }
  const senderId = first.fromId || (first.companyId ? settings.teacherId : undefined);
  const sender = loadCharacters().find(c => c.id === senderId);
  const group = senderId === settings.teacherId ? loadChatSessions().find(s => s.id === settings.groupId && s.isGroup && s.participantIds?.includes(senderId!)) : undefined;
  const session = group || (sender && loadChatContacts().some(c => c.characterId === sender.id) ? createOrGetSession(sender.id) : undefined);
  const text = `${change}通知\n${nodes.map(n => `「${n.title}」${noticeTime(n.dueAt)}${n.place ? ` · ${n.place}` : ""}${n.status === "invite" ? "；请回复是否参加" : ""}`).join("\n")}`;
  if (session && sender && !session.isBlacklisted) {
    const message = pushChatMessage({ sessionId: session.id, role: "assistant", content: text, status: "sent", ...(session.isGroup ? { senderCharacterId: sender.id, senderName: sender.name } : {}) });
    if (message.status === "rejected" || message.status === "failed") throw new Error("通知未送达");
    pushLockNote({ app: "kakao", title: sender.name, text, at: Date.now() });
    return chatNotice(session.id, message.id, sender.id);
  }
  const note = pushLockNote({ app: "system", title: first.from || "日程通知", text, at: Date.now() });
  return { channel: "system", refId: note.id, at: note.at, senderId };
}

/** 所有入口共用本地回复记录；不会伪装成用户的一段台词，也不会调用AI。 */
export function recordScheduleReply(node: CareerNode, accepted: boolean): void {
  const ids = [...new Set([node.fromId, ...(node.inviterIds || [])].filter((id): id is string => Boolean(id)))];
  const sessions = new Set<string>();
  if (node.notice?.sessionId) sessions.add(node.notice.sessionId);
  for (const id of ids) {
    if (loadChatContacts().some(c => c.characterId === id)) sessions.add(createOrGetSession(id).id);
  }
  for (const sessionId of sessions) {
    const content = `邀请回复：${accepted ? "已接受" : "已拒绝"}「${node.title}」${accepted ? `（${noticeTime(node.dueAt)}${node.place ? ` · ${node.place}` : ""}）` : ""}`;
    if (!loadChatMessages(sessionId).some(m => m.role === "system" && m.content === content && m.idolScheduleId === node.id)) {
      pushChatMessage({ sessionId, role: "system", content, status: "sent", idolScheduleId: node.id });
    }
  }
}
