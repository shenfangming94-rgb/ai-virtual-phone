/** KKT 邀请卡与提醒事项共用一份日程；恢复只使用卡片留下的明确事实。 */
import { loadCharacters } from "./character-storage";
import { addToCalendar, loadCareer, saveCareer, type CareerNode } from "./idol-career";
import { isChatStorageHydrated, loadChatMessages, loadChatSessions, pushChatMessage, updateChatMessage, type ChatMessage } from "./chat-storage";
import { chatNotice, noticeTime } from "./idol-schedule-notices";

export const INVITE_CARDS_EVENT = "idol-invite-cards-updated";
export const INVITE_NOTICE = "idol-invite-notice";
const HOUR = 3600e3;
export function inviteNotice(text: string): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(INVITE_NOTICE, { detail: `📅 ${text}` }));
}

/** 和所有未结束的提醒事项留出三小时，最多找后十四天，不挪动已有安排。 */
export function freeInviteTime(at: number, nodes = loadCareer().nodes, except?: string): number | null {
  const d = new Date(at);
  for (let day = 0; day <= 14; day++, d.setDate(d.getDate() + 1)) {
    const t = d.getTime();
    if (!nodes.some(n => n.id !== except && (n.status === "pending" || n.status === "invite") && Math.abs(n.dueAt - t) < 3 * HOUR)) return t;
  }
  return null;
}

/** 严格日期，拒绝 JS 自动把 2 月 30 日滚到三月。相对日期锚定原消息时间。 */
export function invitationAt(value: string, anchor: number): number | null {
  const numerals: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  value = value.replace(/(今晚|明晚|后天晚上)/g, v => v === "今晚" ? "今天晚上" : v === "明晚" ? "明天晚上" : v)
    .replace(/([一二两三四五六七八九十]{1,3})(?=[点时])/g, (_, v: string) => {
      const parts = v.split("十");
      return String(parts.length === 2 ? (parts[0] ? numerals[parts[0]] : 1) * 10 + (parts[1] ? numerals[parts[1]] : 0) : numerals[v]);
    });
  // 旧卡常用“5月12日19点”；只沿用发卡当年的年份，不擅自跨年续约。
  if (!/\d{4}[-年/]/.test(value) && Number.isFinite(anchor)) {
    value = value.replace(/(\d{1,2})月(\d{1,2})日?/, `${new Date(anchor).getFullYear()}年$1月$2日`);
  }
  let m = value.match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?\s*[T\s]*(上午|下午|晚上|中午|早上|凌晨)?\s*(\d{1,2})[:：点时](\d{1,2}|半)?/);
  let y: number, mo: number, day: number, period: string, h: number, min: number;
  if (m) { y = +m[1]; mo = +m[2]; day = +m[3]; period = m[4] || ""; h = +m[5]; min = m[6] === "半" ? 30 : +(m[6] || 0); }
  else {
    const r = value.match(/(今天|明天|后天)\s*(上午|下午|晚上|中午|早上|凌晨)?\s*(\d{1,2})[:：点时](\d{1,2}|半)?/);
    if (!r || !Number.isFinite(anchor)) return null;
    const d = new Date(anchor); d.setDate(d.getDate() + (r[1] === "明天" ? 1 : r[1] === "后天" ? 2 : 0));
    y = d.getFullYear(); mo = d.getMonth() + 1; day = d.getDate(); period = r[2] || ""; h = +r[3]; min = r[4] === "半" ? 30 : +(r[4] || 0);
  }
  if (/下午|晚上|中午/.test(period) && h < 12) h += 12;
  if (period === "凌晨" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const d = new Date(y, mo - 1, day, h, min);
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day ? d.getTime() : null;
}

export function meetingFacts(message: ChatMessage): { title: string; at: number; place: string } | null {
  const data = message.mediaData;
  const raw = data?.meetingInviteRaw || "";
  const fields: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([^=：:]{1,30})\s*[=：:]\s*(.*?)\s*$/);
    if (m) fields[m[1].trim()] = m[2].trim();
  }
  const context = [raw, data?.meetingInviteDescription, message.content].filter(Boolean).join("\n");
  // 旧回复若同时带了日程标记，优先使用原始结构化信息，不用另一轮的“明天”。
  const markers = [...(message.rawResponseText || "").matchAll(/\[新增邀约[:：]\s*(\{[^\n]*?\})\s*\]/g)];
  let legacy: Record<string, unknown> = {};
  if (markers.length === 1) { try { legacy = JSON.parse(markers[0][1]); } catch { /* 无效标记不恢复 */ } }
  const at = invitationAt(data?.meetingInviteAt || fields["时间"] || fields["日期时间"] || String(legacy.at || "") || context, new Date(message.createdAt).getTime());
  const explicitPlace = context.match(/(?:地点|见面地点)\s*[=：:]\s*([^\n，。；]+)/)?.[1];
  const prosePlace = (data?.meetingInviteDescription || message.content).match(/(?:在|到|来|去)([^，。！？\n]{2,50}?)(?:见面|碰面|等你|吃饭|喝咖啡|坐坐|聊聊)/)?.[1]?.trim();
  const place = (data?.meetingInvitePlace || fields["地点"] || String(legacy.place || "") || explicitPlace || (prosePlace && /(?:店|馆|楼|室|厅|场|园|站|口|家|学校|公司|宿舍|河边|楼下)$/.test(prosePlace) ? prosePlace : "")).trim();
  if (at === null || !place || /待定|再定|未定|待确认/.test(place)) return null;
  return { title: (data?.meetingInviteTitle || fields["标题"] || String(legacy.title || "") || "见面约定").slice(0, 60), at, place: place.slice(0, 120) };
}

function validSession(message: ChatMessage) {
  if (message.role !== "assistant" || message.isRetracted || message.status === "failed" || message.status === "rejected") return;
  return loadChatSessions().find(s => s.id === message.sessionId && !s.isGroup && !s.isBlacklisted);
}

export function linkedMeetingNode(message: ChatMessage): CareerNode | undefined {
  const session = validSession(message);
  if (!session) return;
  const id = message.mediaData?.meetingInviteNodeId || message.idolScheduleId;
  return loadCareer().nodes.find(n => (id ? n.id === id : n.notice?.refId === message.id) && n.fromId === session.contactId);
}

export function syncMeetingCard(message: ChatMessage, node: CareerNode): void {
  const status = node.status === "invite" ? "pending" : node.status === "declined" || node.status === "leave" ? "declined" : "accepted";
  const description = `${noticeTime(node.dueAt)} · ${node.place}${node.inviteAdjustment ? `。${node.inviteAdjustment}` : ""}`;
  const d = new Date(node.dueAt), pad = (n: number) => String(n).padStart(2, "0");
  const at = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // 自定义 HTML 也读取同一组最新字段，不能仍显示改期前的旧日期。
  const raw = (message.mediaData?.meetingInviteRaw || "").replace(/^\s*(?:时间|日期时间|地点|说明|状态|同意反应|拒绝反应)\s*[=：:].*$/gm, "").trim();
  const mediaData: ChatMessage["mediaData"] = { ...message.mediaData, meetingInviteNodeId: node.id, meetingInviteStatus: status,
    meetingInviteOriginalRaw: message.mediaData?.meetingInviteOriginalRaw ?? message.mediaData?.meetingInviteRaw ?? "",
    meetingInviteOriginalDescription: message.mediaData?.meetingInviteOriginalDescription ?? message.mediaData?.meetingInviteDescription ?? "",
    meetingInviteAt: at, meetingInvitePlace: node.place, meetingInviteDescription: description,
    meetingInviteAcceptResponse: "已同意，已加入提醒事项和日历", meetingInviteDeclineResponse: node.result || "已拒绝",
    meetingInviteRaw: `${raw}\n时间=${at}\n地点=${node.place}\n说明=${description}\n同意反应=已同意，已加入提醒事项和日历\n拒绝反应=${node.result || "已拒绝"}` };
  if (JSON.stringify(message.mediaData) !== JSON.stringify(mediaData)) {
    updateChatMessage(message.id, { mediaData });
    if (typeof window !== "undefined") window.dispatchEvent(new Event(INVITE_CARDS_EVENT));
  }
}

/** 每个真实事项最多一张卡；同一批回复里的模型卡优先复用。 */
export function ensureMeetingCard(node: CareerNode, source: ChatMessage): void {
  if (!validSession(source) || node.fromId !== loadChatSessions().find(s => s.id === source.sessionId)?.contactId) return;
  const cards = loadChatMessages(source.sessionId).filter(m => m.mediaType === "meeting_invite" && validSession(m));
  let card = cards.find(m => m.mediaData?.meetingInviteNodeId === node.id || m.id === source.id || m.idolScheduleId === node.id);
  if (!card) card = cards.find(m => !m.mediaData?.meetingInviteNodeId && source.responseBatchId && m.responseBatchId === source.responseBatchId);
  // 模型已经输出整张卡时，等同一批真正的卡片落库，不额外插一张。
  if (!card && /\[(?:邀请见面|线下见面邀请)\]/.test(source.rawResponseText || "")) return;
  if (!card) card = pushChatMessage({ sessionId: source.sessionId, role: "assistant", content: node.title, status: "sent", mediaType: "meeting_invite", idolScheduleId: node.id,
    mediaData: { meetingInviteNodeId: node.id, meetingInviteCharacterId: node.fromId, meetingInviteCharacterName: node.from, meetingInviteTitle: node.title } });
  syncMeetingCard(card, node);
}

export function restoreMeetingCard(message: ChatMessage, notify = true): CareerNode | undefined {
  const session = validSession(message);
  if (!session || message.mediaType !== "meeting_invite") return;
  const linked = linkedMeetingNode(message);
  if (linked) { syncMeetingCard(message, linked); return linked; }
  // 已绑定却被她删除的日程不复活；拒绝、撤回的旧卡不重新邀请。
  if (message.mediaData?.meetingInviteNodeId || message.idolScheduleId || message.mediaData?.meetingInviteStatus === "declined") return;
  const batchNodes = message.responseBatchId ? loadCareer().nodes.filter(n => n.fromId === session.contactId && n.notice?.sessionId === session.id && loadChatMessages(session.id).some(m => m.id === n.notice?.refId && m.responseBatchId === message.responseBatchId)) : [];
  if (batchNodes.length === 1) { syncMeetingCard(message, batchNodes[0]); return batchNodes[0]; }
  const facts = meetingFacts(message);
  if (!facts || facts.at <= Date.now()) return;
  const career = loadCareer();
  const existing = career.nodes.filter(n => n.fromId === session.contactId && n.dueAt === facts.at && n.place === facts.place && n.title === facts.title);
  if (existing.length === 1) { syncMeetingCard(message, existing[0]); return existing[0]; }
  const at = freeInviteTime(facts.at, career.nodes);
  if (at === null) return;
  const moved = at !== facts.at;
  const node: CareerNode = { id: `meeting_${message.id}`, kind: "date", title: facts.title, place: facts.place,
    dueAt: at, status: message.mediaData?.meetingInviteStatus === "accepted" && !moved ? "pending" : "invite",
    premise: message.mediaData?.meetingInviteDescription || message.content, fromId: session.contactId,
    from: loadCharacters().find(c => c.id === session.contactId)?.name, inviterIds: [session.contactId], participantIds: [session.contactId],
    replyBy: at, notice: chatNotice(message.sessionId, message.id, session.contactId),
    ...(moved ? { inviteAdjustment: "原时间与已有安排冲突，已顺延到空闲日期，请确认新时间" } : {}) };
  saveCareer({ ...career, nodes: [...career.nodes, node] });
  addToCalendar(node);
  syncMeetingCard(message, node);
  if (notify) inviteNotice(`${node.title}：${node.status === "pending" ? "已恢复到计划" : "待回复"}，${noticeTime(at)} · ${node.place}${moved ? "（避开已有安排后顺延）" : ""}`);
  return node;
}

/** 只在存储加载完成后调用。重复运行不重复创建、不重新解释已关联卡片。 */
export function repairMeetingCards(): void {
  if (!isChatStorageHydrated()) return;
  let restored = 0;
  for (const session of loadChatSessions()) {
    if (session.isGroup || session.isBlacklisted) continue;
    for (const message of loadChatMessages(session.id)) {
      if (message.mediaType !== "meeting_invite") continue;
      const before = linkedMeetingNode(message);
      const node = restoreMeetingCard(message, false);
      if (!before && node) restored++;
    }
  }
  if (restored) inviteNotice(`已补回 ${restored} 份邀约，请查看提醒事项；改期的约定需重新确认`);
}

export function syncMeetingCards(): void {
  for (const session of loadChatSessions()) for (const message of loadChatMessages(session.id)) {
    if (message.mediaType !== "meeting_invite") continue;
    const node = linkedMeetingNode(message);
    if (node) syncMeetingCard(message, node);
  }
}
