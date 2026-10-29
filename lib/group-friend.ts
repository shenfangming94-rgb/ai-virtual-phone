// lib/group-friend.ts
// 群里认识、还没加好友的人：用户点「添加到通讯录」直接加；角色在群里聊投缘了
// 也会偶尔主动发好友申请（走「新的朋友」，被拒最多再来 3 次）。

import { onKakaoAccepted } from "./idol-kakao";
import { loadCharacters } from "./character-storage";
import {
    addChatContact,
    createOrGetSession,
    isContactRemovedByUser,
    loadChatContacts,
    loadChatMessages,
    pushChatMessage,
    type ChatMessage,
    type ChatSession,
} from "./chat-storage";
import { generateGroupRawCompletion } from "./group-chat-engine";
import {
    addFriendRequest,
    clearRequestsForCharacter,
    dispatchFriendRequestUpdated,
    loadFriendRequests,
    updateFriendRequestStatus,
} from "./friend-request-storage";
import { resolveUserIdentity } from "./settings-storage";

const MAX_GROUP_REQUESTS = 4; // 第一次 + 被拒后最多再 3 次
const MIN_GROUP_MESSAGES = 12;          // 他在群里至少说过这么多句才可能来加
const RETRY_GAP_MS = 2 * 24 * 3600 * 1000; // 被拒后至少隔两天再来
const ROLL_CHANCE = 0.05;               // 每轮群聊、每个符合条件的人

const inFlight = new Set<string>();

function isFriend(characterId: string): boolean {
    return loadChatContacts().some(c => c.characterId === characterId);
}

/** 群成员里还不是好友的角色 */
export function isGroupStranger(characterId: string): boolean {
    return !isFriend(characterId);
}

/** 用户在群里点「添加到通讯录」：直接加上，打开私聊 */
export function addFriendFromGroup(characterId: string, groupName: string): ChatSession | null {
    const char = loadCharacters().find(c => c.id === characterId);
    if (!char) return null;
    addChatContact(characterId);
    onKakaoAccepted(characterId);
    clearRequestsForCharacter(characterId);
    dispatchFriendRequestUpdated();
    const session = createOrGetSession(characterId);
    const userName = resolveUserIdentity(characterId, "chat")?.name || "你";
    pushChatMessage({
        sessionId: session.id,
        role: "system",
        content: `${userName}通过群聊「${groupName || "群聊"}」添加了${char.name}，现在可以开始聊天了。`,
        status: "sent",
    });
    return session;
}

function groupRequestsFor(characterId: string) {
    return loadFriendRequests().filter(r => r.characterId === characterId && r.sourceGroupId);
}

function eligible(session: ChatSession, characterId: string, counts: Map<string, number>): boolean {
    if (isFriend(characterId) || isContactRemovedByUser(characterId)) return false;
    if ((counts.get(characterId) || 0) < MIN_GROUP_MESSAGES) return false;
    const reqs = loadFriendRequests().filter(r => r.characterId === characterId);
    if (reqs.some(r => r.status === "pending")) return false;
    const fromGroups = groupRequestsFor(characterId);
    if (fromGroups.length >= MAX_GROUP_REQUESTS) return false;
    const last = fromGroups.map(r => Date.parse(r.createdAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];
    if (last && Date.now() - last < RETRY_GAP_MS) return false;
    return true;
}

function transcript(messages: ChatMessage[], userName: string, names: Map<string, string>): string {
    return messages
        .filter(m => (m.role === "user" || m.role === "assistant") && m.content?.trim())
        .slice(-30)
        .map(m => `${m.role === "user" ? userName : (names.get(m.senderCharacterId || "") || m.senderName || "群友")}：${m.content.trim().slice(0, 120)}`)
        .join("\n");
}

/**
 * 群聊一轮结束后调用：掷骰子，可能有一个还不是好友的角色来加用户。
 * 只发起申请，不阻塞聊天。
 */
export async function maybeRequestFriendFromGroup(session: ChatSession): Promise<void> {
    if (!session.isGroup || session.isSpectator) return;
    const ids = session.participantIds || [];
    if (ids.length === 0) return;
    const messages = loadChatMessages(session.id);
    const counts = new Map<string, number>();
    for (const m of messages) {
        if (m.role === "assistant" && m.senderCharacterId && m.mediaType !== "group_admin_notice") {
            counts.set(m.senderCharacterId, (counts.get(m.senderCharacterId) || 0) + 1);
        }
    }
    const candidates = ids.filter(id => !inFlight.has(id) && eligible(session, id, counts));
    if (candidates.length === 0) return;
    const picked = candidates.find(() => Math.random() < ROLL_CHANCE);
    if (!picked) return;

    const chars = loadCharacters();
    const char = chars.find(c => c.id === picked);
    if (!char) return;
    const userName = resolveUserIdentity(picked, "chat")?.name || "她";
    const groupName = session.groupName || "群聊";
    const names = new Map(chars.map(c => [c.id, c.name]));
    const previous = groupRequestsFor(picked).filter(r => r.status === "rejected").length;

    inFlight.add(picked);
    try {
        const virtual: ChatSession = {
            id: `group_friend_${picked}_${Date.now().toString(36)}`,
            contactId: "group_friend",
            unreadCount: 0,
            updatedAt: new Date().toISOString(),
            isPinned: false,
            bilingualTranslationEnabled: false,
            isGroup: true,
            groupName,
            participantIds: [picked],
        };
        const lines = [
            `[群聊「${groupName}」] 你和${userName}都在这个群里，但你们还不是 KakaoTalk 好友。下面是群里最近的聊天：`,
            transcript(messages, userName, names),
            "",
            `按你的人设、你对${userName}的印象和你们在群里聊得怎么样，决定现在要不要加她好友。`,
            previous > 0 ? `你之前加过她 ${previous} 次，被拒绝了。` : "",
            "要加：只输出一行 [添加好友]验证消息（就是加好友时附带的那句话，用你自己的口吻，一句话）。",
            "不加：只输出 放弃。",
        ].filter(Boolean);
        const task: ChatMessage = {
            id: `group-friend-task-${Date.now()}`,
            sessionId: virtual.id,
            role: "user",
            content: lines.join("\n"),
            status: "sent",
            createdAt: new Date().toISOString(),
        };
        const result = await generateGroupRawCompletion(virtual, [task], { appTags: [], appId: "group_friend" });
        const text = result.text || "";
        const match = text.match(/\[添加好友\]\s*([^\n\[]+)/);
        if (!match) {
            // 这次不想加：记一笔（占一次机会、隔两天再说），不出现在「新的朋友」里
            if (/放弃/.test(text)) {
                const skipped = addFriendRequest(picked, "", previous + 1, { groupId: session.id, groupName });
                updateFriendRequestStatus(skipped.id, "abandoned");
            }
            return;
        }
        if (isFriend(picked)) return;
        const note = match[1].trim().slice(0, 60);
        addFriendRequest(picked, note, previous + 1, { groupId: session.id, groupName });
        dispatchFriendRequestUpdated();
    } catch (err) {
        console.warn("[GroupFriend] friend request roll failed:", err);
    } finally {
        inFlight.delete(picked);
    }
}
