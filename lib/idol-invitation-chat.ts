/** 使用原聊天回复里的结构化标记同步邀请，不另发语义识别请求。 */
import { loadCharacters } from "./character-storage";
import { loadCareer, saveCareer, type CareerNode } from "./idol-career";
import { loadChatMessages, loadChatSessions, type ChatMessage } from "./chat-storage";
import { chatNotice } from "./idol-schedule-notices";

export type InvitationAction = { kind: "reply"; id: string; answer: "accept" | "decline"; evidence?: string; legacy?: boolean } | { kind: "new" | "reschedule"; value: Record<string, unknown> } | { kind: "cancel"; id: string };
export function extractInvitationActions(content: string): { content: string; actions: InvitationAction[] } {
  const actions: InvitationAction[] = [];
  const text = content
    .replace(/\[邀请回复[:：]([^|\]\n]+)\|(accept|decline)\|([^\]\n]+)\]/g, (_, id, answer, evidence) => { actions.push({ kind: "reply", id: id.trim(), answer, evidence: evidence.trim() }); return ""; })
    .replace(/\[(答应|不去)[:：]([^\]\n]+)\]/g, (_, kind, id) => { actions.push({ kind: "reply", id: id.trim(), answer: kind === "答应" ? "accept" : "decline", legacy: true }); return ""; })
    .replace(/\[(新增邀约|改期邀约)[:：]\s*(\{[^\n]*?\})\s*\]/g, (_, kind, raw) => { try { const value = JSON.parse(raw); if (value && typeof value === "object") actions.push({ kind: kind === "新增邀约" ? "new" : "reschedule", value }); } catch { /* 不完整标记不改变事项 */ } return ""; })
    .replace(/\[取消邀约[:：]([^\]\n]+)\]/g, (_, id) => { actions.push({ kind: "cancel", id: id.trim() }); return ""; })
    .trim();
  return { content: text, actions };
}

export function explicitInvitationAnswer(text: string): "accept" | "decline" | null {
  if (!text || /举例|例子|引用|不是说|并非|没说|没答应|别当成|可能|也许|大概|不一定|应该可以|还没决定|再看看|考虑|待定|如果|要是|假如|假设|还不确定|不确定|maybe|not sure|might|아마|모르겠/i.test(text)) return null;
  if (/^[“「"『]|^(?:他说|她说|你说|引用|举个例子)|[？?]\s*$/.test(text.trim())) return null;
  if (/去不了|去不成|不想去|不打算去|没办法去|不去|不参加|来不了|没空|不能去|不方便|拒绝|算了|不行|can't|cannot|won't|안 갈|못 가/i.test(text)) return "decline";
  return /我去|我要去|我会去|我决定去|我参加|我来|一起去|答应|接受|好呀|好啊|好的|没问题|可以|到时见|那天见|约好了|就这么定|^好[！!。\s]*$|^行[！!。\s]*$|^ok(?:ay)?[！!。\s]*$|\byes\b|\bi'?ll (?:go|come)\b|좋아|갈게/i.test(text) ? "accept" : null;
}
const parseAt = (v: unknown) => typeof v === "string" && /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/.test(v) ? new Date(v.replace(" ", "T")).getTime() : NaN;

export function applyInvitationActions(message: ChatMessage, actions: InvitationAction[], callbacks: { accept: (id: string) => void; decline: (id: string) => void; notify: (text: string) => void }): void {
  if (message.role !== "assistant" || message.status === "rejected" || message.status === "failed") return;
  const session = loadChatSessions().find(s => s.id === message.sessionId);
  if (!session || session.isBlacklisted) return;
  const actor = session.isGroup ? message.senderCharacterId : session.contactId;
  if (!actor) return;
  const owns = (n: CareerNode) => n.fromId === actor || n.inviterIds?.includes(actor);
  const history = loadChatMessages(message.sessionId);
  const user = [...history].reverse().find(m => m.role === "user" && !m.isRetracted);
  for (const action of actions) {
    const career = loadCareer();
    const mine = career.nodes.filter(owns);
    if (action.kind === "reply") {
      const pending = mine.filter(n => n.status === "invite" && (!n.replyBy || n.replyBy >= Date.now()));
      const matches = pending.filter(n => n.id === action.id || (action.legacy && n.title === action.id));
      if (matches.length !== 1 || !user || (matches[0].notice && new Date(user.createdAt).getTime() < matches[0].notice.at)) continue;
      const node = matches[0];
      const evidence = action.evidence || (action.legacy ? user.content : "");
      if (!evidence || !user.content.includes(evidence) || explicitInvitationAnswer(user.content) !== action.answer || explicitInvitationAnswer(evidence) !== action.answer) continue;
      // 多份邀请时，需要本轮明确指向，或最近那张邀请卡明确对应；绝不取第一个同名事项。
      const referenced = pending.filter(n => user.content.includes(n.title) || (n.place && user.content.includes(n.place)));
      const lastCard = [...history].reverse().find(m => m.createdAt <= user.createdAt && m.idolScheduleId);
      if (pending.length > 1 && !(referenced.length === 1 && referenced[0].id === node.id) && lastCard?.idolScheduleId !== node.id) continue;
      if (action.answer === "accept") callbacks.accept(node.id); else callbacks.decline(node.id);
      callbacks.notify(`${node.title}：${action.answer === "accept" ? "已接受，写进日程" : "已拒绝"}`);
    } else if (action.kind === "cancel") {
      const node = mine.find(n => n.id === action.id && (n.status === "invite" || n.status === "pending"));
      if (!node) continue;
      saveCareer({ ...career, nodes: career.nodes.map(n => n.id === node.id ? { ...n, status: "declined", result: "邀请人取消", notice: chatNotice(message.sessionId, message.id, actor) } : n) });
      callbacks.notify(`${node.title}：已取消`);
    } else {
      const v = action.value, at = parseAt(v.at), place = typeof v.place === "string" ? v.place.trim().slice(0, 120) : "";
      if (!Number.isFinite(at) || at <= Date.now() + 60e3 || !place) continue;
      if (action.kind === "reschedule") {
        const node = mine.find(n => n.id === v.id && (n.status === "invite" || n.status === "pending"));
        if (!node) continue;
        saveCareer({ ...career, nodes: career.nodes.map(n => n.id === node.id ? { ...n, dueAt: at, place, status: "invite", replyBy: Math.max(Date.now() + 60e3, at - 30 * 60e3), notice: chatNotice(message.sessionId, message.id, actor) } : n) });
        callbacks.notify(`${node.title}：时间地点已更新，待你确认`);
      } else {
        const title = typeof v.title === "string" ? v.title.trim().slice(0, 60) : "";
        if (!title || mine.some(n => n.title === title && n.dueAt === at && n.status !== "declined")) continue;
        const reply = parseAt(v.replyBy);
        const node: CareerNode = { id: `invite_${message.id}`, kind: "date", title, place, premise: message.content, dueAt: at, status: "invite", fromId: actor, inviterIds: [actor], participantIds: [actor], from: message.senderName || loadCharacters().find(c => c.id === actor)?.name, replyBy: Number.isFinite(reply) && reply > Date.now() && reply < at ? reply : Math.max(Date.now() + 60e3, at - 30 * 60e3), notice: chatNotice(message.sessionId, message.id, actor) };
        saveCareer({ ...career, nodes: [...career.nodes, node] });
        callbacks.notify(`待回复：${title}`);
      }
    }
  }
}
