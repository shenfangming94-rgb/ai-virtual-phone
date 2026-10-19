// 查手机：用 char 的手机给他的同学朋友发消息（微信私聊/群聊、短信）。
// 每次发之前她选「偷偷」或「他知道」：他知道的，退出那段聊天时告诉他；偷偷的，过一阵可能被他发现。
// 发过的消息另存一份，刷新他的手机后再补回去，不会被冲掉。
import { bgSetInterval } from "./bg-timer";
import { sendLLMRequest } from "./chat-engine";
import { loadCharacters } from "./character-storage";
import { CHAT_REQUEST_REPLY_EVENT, createOrGetSession, pushChatMessage } from "./chat-storage";
import type {
    CheckPhoneChatBubble,
    CheckPhoneChatPayload,
    CheckPhoneMessageBubble,
    CheckPhoneMessagesPayload,
    CheckPhoneSnapshot,
} from "./checkphone-config";
import { loadPhoneSnapshot, savePhoneSnapshot } from "./checkphone-storage";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadApiConfigs, loadBindingConfig, resolveBinding, resolveUserIdentity } from "./settings-storage";

const STORE_KEY = "nox_checkphone_reply_v1";
registerKvMigration(STORE_KEY);

export type SendMode = "secret" | "known";
type ThreadKind = "conversation" | "group" | "sms";

type SentBubble = { id: string; text: string; timeLabel: string; outgoing: boolean; author?: string };

/** 一段她用他手机聊过的记录：按 char + 哪个 app + 对面的名字认 */
type Injected = {
    charId: string;
    kind: ThreadKind;
    name: string;
    bubbles: SentBubble[];
};

type Pending = {
    id: string;
    charId: string;
    kind: ThreadKind;
    name: string;
    mode: SendMode;
    lines: string[];
    discoverAt?: number;
    done?: boolean;
};

type Store = { injected: Injected[]; pending: Pending[]; lastMode?: SendMode };

function load(): Store {
    try {
        const raw = JSON.parse(kvGet(STORE_KEY) || "{}") as Partial<Store>;
        return { injected: raw.injected || [], pending: raw.pending || [], lastMode: raw.lastMode };
    } catch {
        return { injected: [], pending: [] };
    }
}

function save(store: Store) {
    kvSet(STORE_KEY, JSON.stringify(store));
}

export function lastSendMode(): SendMode {
    return load().lastMode || "secret";
}

const uid = () => `nox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function timeLabel(d = new Date()): string {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function userName(charId: string): string {
    try {
        return resolveUserIdentity(charId, "checkphone")?.name || "她";
    } catch {
        return "她";
    }
}

const APP_LABEL: Record<ThreadKind, string> = { conversation: "微信", group: "微信群", sms: "短信" };

/** 「在微信上跟陈屿」「在微信群「三班群」里」「用短信跟妈妈」 */
function where(kind: ThreadKind, name: string): string {
    if (kind === "group") return `在微信群「${name}」里用你的号`;
    if (kind === "sms") return `用你的手机发短信，跟「${name}」`;
    return `在微信上用你的号跟「${name}」`;
}

function recordInjected(charId: string, kind: ThreadKind, name: string, bubbles: SentBubble[], mode: SendMode) {
    const store = load();
    let item = store.injected.find(x => x.charId === charId && x.kind === kind && x.name === name);
    if (!item) {
        item = { charId, kind, name, bubbles: [] };
        store.injected.push(item);
    }
    item.bubbles = [...item.bubbles, ...bubbles].slice(-60);
    store.lastMode = mode;
    // 同一段聊天还没交代给他的，接着记；换了模式就另起一条
    let pending = store.pending.find(p => !p.done && p.discoverAt === undefined && p.charId === charId && p.kind === kind && p.name === name && p.mode === mode);
    if (!pending) {
        pending = { id: uid(), charId, kind, name, mode, lines: [] };
        store.pending.push(pending);
    }
    const user = userName(charId);
    pending.lines = [...pending.lines, ...bubbles.map(b => `${b.outgoing ? `${user}（用你的号）` : b.author || name}：${b.text}`)].slice(-20);
    save(store);
}

// ── 生成对面的回复 ───────────────────────────

function apiFor(charId: string) {
    const binding = resolveBinding(loadBindingConfig(), charId, "checkphone");
    const configs = loadApiConfigs();
    return configs.find(c => c.id === binding.apiConfigId) ?? configs[0] ?? null;
}

async function generateReplies(charId: string, kind: ThreadKind, name: string, extra: string, history: { outgoing: boolean; text: string; author?: string }[], newTexts: string[]): Promise<{ author?: string; text: string }[]> {
    const char = loadCharacters().find(c => c.id === charId);
    const config = apiFor(charId);
    if (!char || !config) throw new Error("没有可用的 API");
    const charName = char.name;
    const app = APP_LABEL[kind];
    const lines = history.slice(-20).map(m => `${m.outgoing ? charName : m.author || name}：${m.text}`);
    const prompt = [
        kind === "group"
            ? `你在扮演「${name}」这个${app}里的群成员们。${charName}在群里发了消息，群友们接话。`
            : `你在扮演「${name}」。${charName}在${app}上给你发了消息，你来回。`,
        `关于${charName}：${(char.persona || "").slice(0, 1200)}`,
        extra ? `${kind === "group" ? "这个群" : `你和${charName}的关系`}：${extra}` : "",
        lines.length ? `之前的聊天：\n${lines.join("\n")}` : "",
        `${charName}刚发来：\n${newTexts.map(t => `${charName}：${t}`).join("\n")}`,
        "",
        `你以为是${charName}本人在发。按你们的关系和平时说话的样子回，像真人发${app}一样短、口语化。要是这几句的口气、用词明显不像${charName}平时，可以觉得奇怪、问一句。`,
        kind === "group"
            ? "回 1 到 4 条，每条单独一行，格式「群友名字：内容」，名字用之前聊天里出现过的人，没有就自己起。"
            : "回 1 到 3 条，每条单独一行，只写内容。",
        "不要写旁白，不要解释。",
    ].filter(Boolean).join("\n");
    const raw = await sendLLMRequest(config, null, [{ role: "user", content: prompt }], [], { characterName: name }, { skipOutputRegex: true, appId: "checkphone" });
    const out: { author?: string; text: string }[] = [];
    for (const rawLine of raw.split("\n")) {
        const line = rawLine.trim().replace(/^[-*]\s*/, "");
        if (!line || /^[（(].*[)）]$/.test(line)) continue;
        if (kind === "group") {
            const m = line.match(/^([^：:]{1,16})[：:]\s*(.+)$/);
            if (m && m[1].trim() !== charName) out.push({ author: m[1].trim(), text: m[2].trim() });
        } else {
            out.push({ text: line.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[：:]\\s*`), "") });
        }
    }
    return out.slice(0, kind === "group" ? 4 : 3);
}

// ── 微信 ─────────────────────────────────────

/** 她用他的号发出去（马上显示）。对面的回复另外调 replyWechat，方便她连发几句再一起回 */
export async function appendWechatMine(
    charId: string,
    target: { kind: "conversation" | "group"; id: string },
    text: string,
    mode: SendMode,
): Promise<CheckPhoneSnapshot<CheckPhoneChatPayload> | null> {
    const snap = await loadPhoneSnapshot<CheckPhoneChatPayload>(charId, "chat");
    const list = snap ? (target.kind === "conversation" ? snap.payload.conversations : snap.payload.groups) : [];
    const thread = list.find(t => t.id === target.id);
    if (!snap || !thread) return null;
    const mine: CheckPhoneChatBubble = { id: uid(), text, timeLabel: timeLabel(), direction: "outgoing" };
    const next = applyWechat(snap, target, [mine]);
    await savePhoneSnapshot(next);
    recordInjected(charId, target.kind, thread.name, [{ id: mine.id, text, timeLabel: mine.timeLabel, outgoing: true }], mode);
    return next;
}

export async function replyWechat(
    charId: string,
    target: { kind: "conversation" | "group"; id: string },
    newTexts: string[],
    mode: SendMode,
): Promise<CheckPhoneSnapshot<CheckPhoneChatPayload> | null> {
    const snap = await loadPhoneSnapshot<CheckPhoneChatPayload>(charId, "chat");
    const list = snap ? (target.kind === "conversation" ? snap.payload.conversations : snap.payload.groups) : [];
    const thread = list.find(t => t.id === target.id);
    if (!snap || !thread) return null;
    const extra = target.kind === "conversation"
        ? (() => { const c = snap.payload.contacts.find(x => x.name === thread.name); return c ? `${c.relationLabel}；${c.note}` : (thread as { tagLabel?: string }).tagLabel || ""; })()
        : `${(thread as { memberCountLabel?: string }).memberCountLabel || ""}`;
    const history = thread.messages.slice(0, Math.max(0, thread.messages.length - newTexts.length)).map(m => ({ outgoing: m.direction === "outgoing", text: m.text, author: m.authorLabel }));
    const replies = await generateReplies(charId, target.kind, thread.name, extra, history, newTexts);
    if (replies.length === 0) return null;
    const later = timeLabel(new Date(Date.now() + 60_000));
    const theirs: CheckPhoneChatBubble[] = replies.map(r => ({ id: uid(), text: r.text, timeLabel: later, direction: "incoming", authorLabel: r.author }));
    const latest = await loadPhoneSnapshot<CheckPhoneChatPayload>(charId, "chat");
    if (!latest) return null;
    const next = applyWechat(latest, target, theirs);
    await savePhoneSnapshot(next);
    recordInjected(charId, target.kind, thread.name, theirs.map(b => ({ id: b.id, text: b.text, timeLabel: b.timeLabel, outgoing: false, author: b.authorLabel })), mode);
    return next;
}

function applyWechat(snap: CheckPhoneSnapshot<CheckPhoneChatPayload>, target: { kind: "conversation" | "group"; id: string }, bubbles: CheckPhoneChatBubble[]): CheckPhoneSnapshot<CheckPhoneChatPayload> {
    const last = bubbles[bubbles.length - 1];
    const patch = <T extends { id: string; messages: CheckPhoneChatBubble[]; preview: string; timeLabel: string }>(items: T[]): T[] =>
        items.map(item => item.id === target.id ? { ...item, messages: [...item.messages, ...bubbles], preview: last.text, timeLabel: last.timeLabel } : item);
    return {
        ...snap,
        updatedAt: new Date().toISOString(),
        payload: {
            ...snap.payload,
            conversations: target.kind === "conversation" ? patch(snap.payload.conversations) : snap.payload.conversations,
            groups: target.kind === "group" ? patch(snap.payload.groups) : snap.payload.groups,
        },
    };
}

// ── 短信 ─────────────────────────────────────

export async function appendSmsMine(charId: string, threadId: string, text: string, mode: SendMode): Promise<CheckPhoneSnapshot<CheckPhoneMessagesPayload> | null> {
    const snap = await loadPhoneSnapshot<CheckPhoneMessagesPayload>(charId, "messages");
    const thread = snap?.payload.threads.find(t => t.id === threadId);
    if (!snap || !thread) return null;
    const mine: CheckPhoneMessageBubble = { id: uid(), text, timeLabel: timeLabel(), direction: "outgoing" };
    const next = applySms(snap, threadId, [mine]);
    await savePhoneSnapshot(next);
    recordInjected(charId, "sms", thread.sender, [{ id: mine.id, text, timeLabel: mine.timeLabel, outgoing: true }], mode);
    return next;
}

export async function replySms(charId: string, threadId: string, newTexts: string[], mode: SendMode): Promise<CheckPhoneSnapshot<CheckPhoneMessagesPayload> | null> {
    const snap = await loadPhoneSnapshot<CheckPhoneMessagesPayload>(charId, "messages");
    const thread = snap?.payload.threads.find(t => t.id === threadId);
    if (!snap || !thread) return null;
    const history = thread.messages.slice(0, Math.max(0, thread.messages.length - newTexts.length)).map(m => ({ outgoing: m.direction === "outgoing", text: m.text }));
    const replies = await generateReplies(charId, "sms", thread.sender, thread.kind, history, newTexts);
    if (replies.length === 0) return null;
    const later = timeLabel(new Date(Date.now() + 60_000));
    const theirs: CheckPhoneMessageBubble[] = replies.map(r => ({ id: uid(), text: r.text, timeLabel: later, direction: "incoming" }));
    const latest = await loadPhoneSnapshot<CheckPhoneMessagesPayload>(charId, "messages");
    if (!latest) return null;
    const next = applySms(latest, threadId, theirs);
    await savePhoneSnapshot(next);
    recordInjected(charId, "sms", thread.sender, theirs.map(b => ({ id: b.id, text: b.text, timeLabel: b.timeLabel, outgoing: false })), mode);
    return next;
}

function applySms(snap: CheckPhoneSnapshot<CheckPhoneMessagesPayload>, threadId: string, bubbles: CheckPhoneMessageBubble[]): CheckPhoneSnapshot<CheckPhoneMessagesPayload> {
    const last = bubbles[bubbles.length - 1];
    return {
        ...snap,
        updatedAt: new Date().toISOString(),
        payload: {
            ...snap.payload,
            threads: snap.payload.threads.map(t => t.id === threadId ? { ...t, messages: [...t.messages, ...bubbles], preview: last.text, timeLabel: last.timeLabel } : t),
        },
    };
}

// ── 刷新后补回 ───────────────────────────────

/** 刷新会重新生成他的手机：把她发过的那几段按对面名字补回去。返回补过的快照（没变就原样） */
export function mergeInjectedWechat(snap: CheckPhoneSnapshot<CheckPhoneChatPayload>): CheckPhoneSnapshot<CheckPhoneChatPayload> {
    const items = load().injected.filter(x => x.charId === snap.characterId && x.kind !== "sms");
    if (items.length === 0) return snap;
    let changed = false;
    const fill = <T extends { name: string; messages: CheckPhoneChatBubble[]; preview: string; timeLabel: string }>(list: T[], kind: ThreadKind): T[] =>
        list.map(t => {
            const inj = items.find(x => x.kind === kind && x.name === t.name);
            if (!inj) return t;
            const have = new Set(t.messages.map(m => m.id));
            const missing = inj.bubbles.filter(b => !have.has(b.id));
            if (missing.length === 0) return t;
            changed = true;
            return { ...t, messages: [...t.messages, ...missing.map(b => ({ id: b.id, text: b.text, timeLabel: b.timeLabel, direction: b.outgoing ? "outgoing" as const : "incoming" as const, authorLabel: b.author }))] };
        });
    const next = {
        ...snap,
        payload: { ...snap.payload, conversations: fill(snap.payload.conversations, "conversation"), groups: fill(snap.payload.groups, "group") },
    };
    return changed ? next : snap;
}

export function mergeInjectedSms(snap: CheckPhoneSnapshot<CheckPhoneMessagesPayload>): CheckPhoneSnapshot<CheckPhoneMessagesPayload> {
    const items = load().injected.filter(x => x.charId === snap.characterId && x.kind === "sms");
    if (items.length === 0) return snap;
    let changed = false;
    const threads = snap.payload.threads.map(t => {
        const inj = items.find(x => x.name === t.sender);
        if (!inj) return t;
        const have = new Set(t.messages.map(m => m.id));
        const missing = inj.bubbles.filter(b => !have.has(b.id));
        if (missing.length === 0) return t;
        changed = true;
        return { ...t, messages: [...t.messages, ...missing.map(b => ({ id: b.id, text: b.text, timeLabel: b.timeLabel, direction: b.outgoing ? "outgoing" as const : "incoming" as const }))] };
    });
    return changed ? { ...snap, payload: { ...snap.payload, threads } } : snap;
}

// ── 交代给他 / 被他发现 ──────────────────────

function pushToChar(charId: string, hidden: string) {
    const chat = createOrGetSession(charId);
    pushChatMessage({
        sessionId: chat.id,
        role: "system",
        mediaType: "system_instruction",
        mediaData: { compactSystemInstruction: true, shortTermMemoryEvent: true },
        content: `<hidden-system>查手机：时间：${new Date().toLocaleString("zh-CN", { hour12: false })}；${hidden}</hidden-system>`,
    });
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId: chat.id } })), 0);
}

/** 她退出一段聊天时调：「他知道」的马上告诉他；「偷偷」的排一个 1～6 小时后的发现时间 */
export function settleThread(charId: string) {
    const store = load();
    const user = userName(charId);
    let changed = false;
    for (const p of store.pending) {
        if (p.done || p.charId !== charId || p.discoverAt !== undefined || p.lines.length === 0) continue;
        changed = true;
        if (p.mode === "known") {
            p.done = true;
            pushToChar(charId, `${user}拿着你的手机，${where(p.kind, p.name)}聊了几句，你是知道的。聊的内容：\n${p.lines.join("\n")}\n按你的人设，自然地跟她说两句。`);
        } else {
            p.discoverAt = Date.now() + (60 + Math.floor(Math.random() * 300)) * 60_000;
        }
    }
    if (changed) save(store);
}

function checkDiscoveries() {
    const store = load();
    const now = Date.now();
    let changed = false;
    for (const p of store.pending) {
        if (p.done || p.mode !== "secret" || p.discoverAt === undefined || p.discoverAt > now) continue;
        p.done = true;
        changed = true;
        if (Math.random() >= 0.6) continue; // 没被发现
        const user = userName(p.charId);
        const how = p.kind === "group" ? `群里有人@你接着那几句话聊` : Math.random() < 0.5 ? `「${p.name}」后来跟你提起那几句话` : "你翻聊天记录时看到了";
        pushToChar(p.charId, `你发现${user}之前偷偷拿你的手机，${where(p.kind, p.name)}聊过（${how}）。当时的聊天：\n${p.lines.join("\n")}\n按你的人设做出反应，来找她说这件事。只写真实发生的事。`);
    }
    if (changed) save(store);
}

let stop: (() => void) | null = null;

export function startCheckPhoneReplyService() {
    if (stop || typeof window === "undefined") return;
    stop = bgSetInterval(checkDiscoveries, 60_000);
    window.setTimeout(checkDiscoveries, 8_000);
}

export function stopCheckPhoneReplyService() {
    stop?.();
    stop = null;
}
