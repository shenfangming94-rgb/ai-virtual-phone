// 短期记忆编辑/删除：短期记忆是每次从聊天、朋友圈、各 app 事件现拼出来的，
// 没有单独一份可改。这里按条目 id 记下「删了」或「改成什么」，拼的时候套上去。
// 只影响他记得的版本，聊天记录等原始数据不动。
import type { ChatMessage } from "./chat-storage";
import { isKvHydrated, kvGet, kvSet } from "./kv-db";

export type ShortTermEdit = {
    deleted?: boolean;
    /** 改过的整行（带「[私聊 时间] 名字: 」前缀） */
    content?: string;
    /** 改过的正文，给原样发送的聊天历史用 */
    body?: string;
    at: string;
};

export const SHORT_TERM_EDITS_KEY = "nox_short_term_edits_v1";
let cache: Record<string, ShortTermEdit> | null = null;

function loadAll(): Record<string, ShortTermEdit> {
    if (cache) return cache;
    let parsed: Record<string, ShortTermEdit> = {};
    try {
        parsed = JSON.parse(kvGet(SHORT_TERM_EDITS_KEY) || "{}") || {};
    } catch { /* 坏了就当没改过 */ }
    // 还没从数据库读进来时别缓存空表，不然之后一直以为没改过
    if (isKvHydrated()) cache = parsed;
    return parsed;
}

function saveAll(all: Record<string, ShortTermEdit>) {
    cache = all;
    kvSet(SHORT_TERM_EDITS_KEY, JSON.stringify(all));
}

/** 导入备份后 kv 被整体换掉，丢掉缓存重新读 */
export function resetShortTermEditsCache() {
    cache = null;
}

export function getShortTermEdit(id: string): ShortTermEdit | undefined {
    return loadAll()[id];
}

/** 「[私聊 时间] 名字: 正文」拆成前缀和正文；拆不出来前缀就是空 */
export function splitShortTermLine(content: string): { prefix: string; body: string } {
    const m = /^(\[[^\]\n]*\]\s*[^:：\n\[]{1,40}?[:：]\s?)/.exec(content);
    if (!m) return { prefix: "", body: content };
    return { prefix: m[1], body: content.slice(m[1].length) };
}

export function deleteShortTermEntry(id: string) {
    const all = loadAll();
    all[id] = { deleted: true, at: new Date().toISOString() };
    saveAll(all);
}

export function editShortTermEntry(id: string, prefix: string, body: string) {
    const all = loadAll();
    all[id] = { content: prefix + body, body, at: new Date().toISOString() };
    saveAll(all);
}

export function restoreShortTermEntry(id: string) {
    const all = loadAll();
    delete all[id];
    saveAll(all);
}

export function applyShortTermEdits<T extends { id: string; content: string }>(entries: T[]): T[] {
    const edits = loadAll();
    if (!Object.keys(edits).length) return entries;
    const out: T[] = [];
    for (const e of entries) {
        const edit = edits[e.id];
        if (!edit) { out.push(e); continue; }
        if (edit.deleted) continue;
        out.push(edit.content != null ? { ...e, content: edit.content, edited: true } : e);
    }
    return out;
}

/** 聊天历史是原样发给模型的，也要套上：删了的不发，改了的换正文 */
export function applyShortTermEditsToHistory(history: ChatMessage[]): ChatMessage[] {
    const edits = loadAll();
    if (!Object.keys(edits).length) return history;
    const out: ChatMessage[] = [];
    for (const msg of history) {
        const edit = edits[msg.id];
        if (!edit) { out.push(msg); continue; }
        if (edit.deleted) continue;
        out.push(edit.body != null ? { ...msg, content: edit.body } : msg);
    }
    return out;
}
