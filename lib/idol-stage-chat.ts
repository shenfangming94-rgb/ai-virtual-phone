/** 此刻明确发生的私聊：结构化提取，剧情落库之后同步。 */
import { loadCharacters } from "./character-storage";
import { createOrGetSession, loadChatContacts, loadChatMessages, loadChatSessions, pushChatMessage } from "./chat-storage";
export type StageChat = { characterId: string; direction: "sent" | "received"; text: string; evidence?: string };
export function stageChatPrompt(): string {
  const contacts = new Set(loadChatContacts().map(c => c.characterId));
  const people = loadCharacters().filter(c => contacts.has(c.id)).map(c => ({ id: c.id, name: c.name }));
  return `【此刻与真实 KKT 私聊同步】可私聊的好友：${JSON.stringify(people)}。
本轮玩家明确写已通过KKT发送的消息，以及本轮剧情中角色确实通过KKT发给玩家的消息，必须在正文外逐条附加 <kkt>{"characterId":"好友id","direction":"sent或received","text":"实际消息原文","evidence":"玩家本轮输入中说明发送的原文"}</kkt>。
sent是玩家发出，received是角色发来；每条单独一个标签，按发生顺序。玩家发出的内容必须忠实于玩家本轮输入，不能代她决定发送或编造她的话，evidence必须逐字引用玩家本轮输入。角色消息保留原文与中文翻译，以 原文 | 中文 格式写入text。正文中呈现相同消息内容。
只同步已经实际发送的私聊；想发、准备发、草稿、假设、回忆旧消息、当面说话、群聊都不写标签。不要重复前轮已经发过的消息。不是上述好友的人不能凭空私聊，不得把标签写进scene正文。`;
}
export function extractStageChat(raw: string): { text: string; messages: StageChat[] } {
  const messages: StageChat[] = [];
  const text = raw.replace(/<kkt>([\s\S]*?)<\/kkt>/gi, (_, json: string) => {
    try {
      const v = JSON.parse(json);
      if (typeof v.characterId === "string" && (v.direction === "sent" || v.direction === "received") && typeof v.text === "string" && v.text.trim() && v.text.length <= 8000) messages.push({ ...v, text: v.text.trim() });
    } catch { /* 无效动作不会发送 */ }
    return "";
  });
  return { text, messages };
}
export function syncStageChat(turnKey: string, messages: StageChat[], userInput: string): void {
  const friends = new Set(loadChatContacts().map(c => c.characterId));
  for (const m of messages) {
    if (!friends.has(m.characterId)) continue;
    if (m.direction === "sent" && (!m.evidence || !userInput.includes(m.evidence) || !userInput.includes(m.text))) continue;
    const existing = loadChatSessions().find(s => !s.isGroup && s.contactId === m.characterId);
    if (existing?.isBlacklisted) continue;
    const session = existing || createOrGetSession(m.characterId);
    const role = m.direction === "sent" ? "user" : "assistant";
    const key = JSON.stringify([turnKey, m.characterId, role, m.text]);
    if (loadChatMessages(session.id).some(x => x.stageChatKey === key)) continue;
    pushChatMessage({ sessionId: session.id, role, content: m.text, status: "sent", stageChatKey: key });
  }
}
