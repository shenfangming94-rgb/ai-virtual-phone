// 重试保留旧版本：「重试以下」重 roll 最后一轮回复时，旧回复先存起来，
// 最后一条回复下面显示「‹ 2/3 ›」可以来回翻。用户发了下一句就定下来、旧版本丢掉。
// 正在显示的那一版就是消息库里的真消息，其余版本只存在这里。
import {
    ChatMessage,
    deleteChatMessagesFrom,
    loadChatMessages,
    upsertImportedChatMessage,
} from "@/lib/chat-storage";

type ReplyVersions = {
    anchorId: string | null; // 这轮回复前面那条消息；null = 会话第一条
    versions: (ChatMessage[] | null)[]; // null 是正在显示的那一版
    current: number;
};

const STORAGE_KEY = "nox_reply_versions_v1";
let cache: Record<string, ReplyVersions> | null = null;

function loadAll(): Record<string, ReplyVersions> {
    if (cache) return cache;
    try {
        cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch {
        cache = {};
    }
    return cache!;
}

function saveAll() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache || {}));
    } catch {
        // 存不下就只留在内存里，刷新页面后旧版本没了，不影响聊天
    }
}

function liveTail(sessionId: string, anchorId: string | null): ChatMessage[] | null {
    const all = loadChatMessages(sessionId);
    const start = anchorId === null ? 0 : all.findIndex(m => m.id === anchorId) + 1;
    if (anchorId !== null && start === 0) return null;
    return all.slice(start);
}

// 还能翻：前面那条还在，后面全是回复（用户没发新消息）
function validEntry(sessionId: string): ReplyVersions | null {
    const entry = loadAll()[sessionId];
    if (!entry) return null;
    const tail = liveTail(sessionId, entry.anchorId);
    if (!tail || tail.some(m => m.role === "user")) {
        delete cache![sessionId];
        saveAll();
        return null;
    }
    return entry;
}

/** 「重试以下」删除前调用：把要删的回复存成一个旧版本。重试的不是最后一轮就不存。 */
export function stashReplyBeforeRetry(sessionId: string, msgId: string) {
    const all = loadChatMessages(sessionId);
    const idx = all.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    const tail = all.slice(idx);
    const store = loadAll();
    if (tail.some(m => m.role === "user")) {
        delete store[sessionId];
        saveAll();
        return;
    }
    const anchorId = idx > 0 ? all[idx - 1].id : null;
    const prev = validEntry(sessionId);
    const entry: ReplyVersions = prev && prev.anchorId === anchorId
        ? prev
        : { anchorId, versions: [null], current: 0 };
    entry.versions[entry.current] = tail;
    entry.versions.push(null);
    entry.current = entry.versions.length - 1;
    store[sessionId] = entry;
    saveAll();
}

/** 底部箭头要不要显示、显示第几版 */
export function getReplyVersionInfo(sessionId: string): { current: number; total: number } | null {
    const entry = validEntry(sessionId);
    if (!entry || entry.versions.length < 2) return null;
    return { current: entry.current, total: entry.versions.length };
}

/** 换到第 target 版：当前显示的存起来，目标版本写回消息库 */
export function switchReplyVersion(sessionId: string, target: number): boolean {
    const entry = validEntry(sessionId);
    if (!entry || target === entry.current || target < 0 || target >= entry.versions.length) return false;
    const wanted = entry.versions[target];
    const tail = liveTail(sessionId, entry.anchorId);
    if (!wanted || !tail) return false;
    entry.versions[entry.current] = tail;
    if (tail.length > 0) deleteChatMessagesFrom(tail[0].id);
    for (const msg of wanted) upsertImportedChatMessage(msg);
    entry.versions[target] = null;
    entry.current = target;
    saveAll();
    return true;
}
