// 音乐 app「一起听」：和一个 char 同时听歌、在一起听界面聊天、点歌、留歌笺。
// 一起听里的对话只显示在这里；结束或收起时悄悄写进他的私聊（只给他看的事件），他之后聊天也记得。
import { bgSetInterval } from "./bg-timer";
import { loadCharacters } from "./character-storage";
import {
    type ChatMessage,
    type ChatSession,
    CHAT_REQUEST_REPLY_EVENT,
    createOrGetSession,
    loadChatMessages,
    loadChatSessions,
    pushChatMessage,
} from "./chat-storage";
import { generateGroupRawCompletion } from "./group-chat-engine";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { getMusicControlBridge } from "./music-control-bridge";
import { toggleLike, type MusicTrack } from "./music-storage";
import { resolveUserIdentity } from "./settings-storage";

const STORE_KEY = "nox_listen_together_v1";
registerKvMigration(STORE_KEY);
export const LISTEN_TOGETHER_EVENT = "nox-listen-together-updated";
/** 打开一起听界面：{ charId?, song?: { title, artist } }；不带 charId 就是打开当前这场 */
export const LISTEN_TOGETHER_OPEN_EVENT = "nox-listen-together-open";

export type LTMessage = {
    id: string;
    role: "user" | "char" | "system";
    text: string;
    at: string;
    kind?: "note" | "pick" | "song" | "like";
};

export type LTNote = { by: "user" | "char"; text: string; at: string };

export type LTChar = {
    distance: string;
    totalSec: number;
    messages: LTMessage[];
    notes: Record<string, LTNote[]>;
    memorySyncedAt?: string;
    lastInviteAt?: string;
    rolledOn?: string;
};

export type LTActive = {
    charId: string;
    startedAt: string;
    sec: number;
    songs: string[];
    lastTrackId?: string;
};

type Store = { chars: Record<string, LTChar>; active: LTActive | null; liked?: string[] };

function emptyChar(): LTChar {
    return { distance: "13.14", totalSec: 0, messages: [], notes: {} };
}

export function loadLT(): Store {
    try {
        const raw = JSON.parse(kvGet(STORE_KEY) || "{}") as Partial<Store>;
        return { chars: raw.chars && typeof raw.chars === "object" ? raw.chars : {}, active: raw.active ?? null, liked: Array.isArray(raw.liked) ? raw.liked : [] };
    } catch {
        return { chars: {}, active: null };
    }
}

export function updateLT(mutate: (store: Store) => void): Store {
    const store = loadLT();
    mutate(store);
    kvSet(STORE_KEY, JSON.stringify(store));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LISTEN_TOGETHER_EVENT));
    return store;
}

export function ltChar(store: Store, charId: string): LTChar {
    return { ...emptyChar(), ...(store.chars[charId] || {}) };
}

function mutChar(store: Store, charId: string): LTChar {
    store.chars[charId] = ltChar(store, charId);
    return store.chars[charId];
}

const uid = () => `lt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export function songKey(track: { title: string; artist?: string } | null | undefined): string {
    return track ? `${track.title.trim()}｜${(track.artist || "").trim()}` : "";
}

export function songLabel(track: { title: string; artist?: string } | null | undefined): string {
    return track ? `《${track.title}》${track.artist ? `- ${track.artist}` : ""}` : "";
}

function pushMsg(store: Store, charId: string, msg: Omit<LTMessage, "id" | "at">) {
    const c = mutChar(store, charId);
    c.messages = [...c.messages, { ...msg, id: uid(), at: new Date().toISOString() }].slice(-300);
}

function charName(charId: string): string {
    return loadCharacters().find(c => c.id === charId)?.name || "TA";
}

export function userName(charId?: string): string {
    try {
        return resolveUserIdentity(charId, "chat")?.name || "她";
    } catch {
        return "她";
    }
}

export function formatTogether(sec: number): string {
    if (sec < 60) return "不到 1 分钟";
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m} 分钟`;
    return `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分钟` : ""}`;
}

// ── 开始 / 结束 ──────────────────────────────

/** 开始和某个 char 一起听。已经在和别人听就先结束那一场 */
export function startListening(charId: string, by: "user" | "char") {
    const current = loadLT().active;
    if (current && current.charId !== charId) endListening();
    if (current?.charId === charId) return;
    const track = getMusicControlBridge()?.getState().currentTrack ?? null;
    updateLT(store => {
        store.active = { charId, startedAt: new Date().toISOString(), sec: 0, songs: track ? [songLabel(track)] : [], lastTrackId: track?.id };
        pushMsg(store, charId, { role: "system", text: by === "user" ? `你邀请${charName(charId)}一起听` : `你接受了${charName(charId)}的一起听邀请` });
        if (track) pushMsg(store, charId, { role: "system", kind: "song", text: `正在一起听 ${songLabel(track)}` });
    });
}

export function endListening() {
    const active = loadLT().active;
    if (!active) return;
    updateLT(store => {
        pushMsg(store, active.charId, { role: "system", text: `一起听结束，这次一起听了 ${formatTogether(active.sec)}` });
        store.active = null;
    });
    syncMemory(active.charId, active);
}

// ── 写进他的记忆 ─────────────────────────────

/** 把还没同步的一起听对话，作为只给他看的事件写进私聊（不显示、不进会话预览） */
export function syncMemory(charId: string, session?: LTActive | null) {
    const store = loadLT();
    const c = ltChar(store, charId);
    const chat = createOrGetSession(charId);
    let since = c.memorySyncedAt ? new Date(c.memorySyncedAt).getTime() : 0;
    // 她把私聊删了，之前写进去的一起听也跟着没了 → 这一场从头再写一遍
    const current = session || store.active;
    const lost = since > 0 && current?.charId === charId
        && !loadChatMessages(chat.id).some(m => m.content.startsWith("<hidden-system>音乐一起听") && new Date(m.createdAt).getTime() >= since - 5 * 60_000);
    if (lost) since = new Date(current.startedAt).getTime();
    const fresh = c.messages.filter(m => new Date(m.at).getTime() > since && (m.role !== "system" || m.kind === "like"));
    if (fresh.length === 0) return;
    const user = userName(charId);
    const songs = (session?.songs || store.active?.songs || []).slice(-8);
    const lines = fresh.slice(lost ? -40 : -16).map(m => m.kind === "like" ? `（${m.text.replace(/^你/, user)}）` : `${m.role === "user" ? user : "你"}${m.kind === "note" ? "（写在歌笺上）" : ""}：${m.text}`);
    pushChatMessage({
        sessionId: chat.id,
        role: "system",
        mediaType: "system_instruction",
        mediaData: { compactSystemInstruction: true, shortTermMemoryEvent: true },
        content: `<hidden-system>音乐一起听：时间：${new Date().toLocaleString("zh-CN", { hour12: false })}；你和${user}在音乐 App 用「一起听」一起听歌${session ? `，听了 ${formatTogether(session.sec)}` : ""}。${songs.length ? `听过的歌：${songs.join("、")}。` : ""}一起听时聊的：\n${lines.join("\n")}</hidden-system>`,
    });
    updateLT(s => { mutChar(s, charId).memorySyncedAt = new Date().toISOString(); });
}

// ── 他说话 ───────────────────────────────────

export function parseLrc(lrc?: string): { time: number; text: string }[] {
    if (!lrc) return [];
    const lines: { time: number; text: string }[] = [];
    for (const line of lrc.split("\n")) {
        const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
        if (m && m[3].trim()) lines.push({ time: parseInt(m[1], 10) * 60 + parseFloat(m[2]), text: m[3].trim() });
    }
    return lines.sort((a, b) => a.time - b.time);
}

export function lyricAt(track: MusicTrack | null, time: number): string {
    const lines = parseLrc(track?.lyrics);
    let text = "";
    for (const l of lines) {
        if (l.time <= time) text = l.text;
        else break;
    }
    return text;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function charGenerate(charId: string, instruction: string): Promise<string> {
    const session: ChatSession = {
        id: `listen_together_${charId}_${Date.now().toString(36)}`,
        contactId: "group_listen_together",
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
        isPinned: false,
        bilingualTranslationEnabled: false,
        isGroup: true,
        groupName: "一起听",
        participantIds: [charId],
    };
    const task: ChatMessage = {
        id: `listen-together-task-${Date.now()}`,
        sessionId: session.id,
        role: "user",
        content: `[音乐App·一起听] ${instruction}`,
        status: "sent",
        createdAt: new Date().toISOString(),
    };
    const result = await generateGroupRawCompletion(session, [task], { appTags: [], appId: "listen_together" });
    return result.text || "";
}

export type ReplyMode = "reply" | "nudge" | "greet";

let replying = false;
// 他在回的时候她又发了：回完接着回她后面那几句
let replyAgain = false;
export function isReplying() {
    return replying;
}

/** 让他在一起听里说话。会自己点歌、留歌笺 */
export async function charSpeak(charId: string, mode: ReplyMode): Promise<void> {
    if (replying) {
        if (mode === "reply") replyAgain = true;
        return;
    }
    replying = true;
    replyAgain = false;
    window.dispatchEvent(new CustomEvent(LISTEN_TOGETHER_EVENT));
    try {
        const store = loadLT();
        const c = ltChar(store, charId);
        const user = userName(charId);
        const state = getMusicControlBridge()?.getState();
        const track = state?.currentTrack ?? null;
        const lyric = track ? lyricAt(track, state?.currentTime ?? 0) : "";
        const notes = track ? (c.notes[songKey(track)] || []).slice(-3) : [];
        const recent = c.messages.slice(-20).map(m => m.role === "system" ? `（${m.kind === "like" ? m.text.replace(/^你/, user) : m.text}）` : `${m.role === "user" ? user : "你"}：${m.text}`);
        const waiting = unreplied(c.messages);
        const task = mode === "greet"
            ? `你刚进入一起听，跟${user}打个招呼。${track ? "" : "现在还没放歌，挑一首你想和她一起听的。"}`
            : mode === "nudge"
                ? `${user}想听你说点什么：可以聊这首歌、正在唱的歌词、此刻的心情，或者想换一首。`
                : waiting.length
                    ? `回${user}刚说的话：${waiting.map(m => `「${m.text}」`).join("")}。她连着发了几句就每句都要接到，可以合在一起回。`
                    : `回${user}刚说的话（上面对话最后几句）。`;
        const instruction = [
            `你正在和${user}用音乐 App 的「一起听」一起听歌：你们不在一起，各自戴着耳机，同时听同一首。`,
            track ? `现在放的是 ${songLabel(track)}，进度 ${mmss(state?.currentTime ?? 0)} / ${mmss(state?.duration ?? track.duration ?? 0)}${state?.isPlaying ? "" : "（暂停中）"}。` : "现在没有在放歌。",
            lyric ? `正唱到：「${lyric}」` : "",
            store.active?.songs.length ? `这次一起听已经听过：${store.active.songs.slice(-6).join("、")}。` : "",
            notes.length ? `这首歌下面的歌笺：\n${notes.map(n => `${n.by === "user" ? user : "你"}写的：${n.text}`).join("\n")}` : "",
            recent.length ? `一起听里刚才的对话：\n${recent.join("\n")}` : "",
            "",
            task,
            "像平时发消息一样回 1 到 3 条短消息，每条单独一行，口吻按你平时跟她说话的样子。可以聊歌和歌词，不要大段复述歌词。只写真实发生的事。",
            "想换歌、或者她让你选歌时，最后单独一行写：===点歌=== 歌名｜歌手",
            "想给正在放的这首歌留一张歌笺（写给她的几句话，会一直留在这首歌下面）时，单独一行写：===歌笺=== 内容",
        ].filter(Boolean).join("\n");
        const raw = await charGenerate(charId, instruction);
        await applyReply(charId, raw);
    } catch (error) {
        updateLT(s => pushMsg(s, charId, { role: "system", text: `没连上：${error instanceof Error ? error.message : "出错了"}` }));
    } finally {
        replying = false;
        window.dispatchEvent(new CustomEvent(LISTEN_TOGETHER_EVENT));
        if (replyAgain) {
            replyAgain = false;
            if (unreplied(ltChar(loadLT(), charId).messages).length) void charSpeak(charId, "reply");
        }
    }
}

/** 他最后一次说话之后她发的话 */
function unreplied(messages: { role: string; text: string; kind?: string }[]) {
    const out: { text: string }[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === "char") break;
        if (m.role === "user" && m.kind !== "note") out.unshift(m);
    }
    return out;
}

async function applyReply(charId: string, raw: string) {
    const name = charName(charId);
    let pick: { title: string; artist: string } | null = null;
    let note = "";
    const texts: string[] = [];
    for (const rawLine of raw.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        const pm = line.match(/=+\s*点歌\s*=+\s*(.+)/);
        if (pm) {
            const [title, artist] = pm[1].split(/[｜|]/).map(x => x.trim());
            if (title) pick = { title: title.replace(/[《》]/g, ""), artist: artist || "" };
            continue;
        }
        const nm = line.match(/=+\s*歌笺\s*=+\s*(.+)/);
        if (nm) {
            note = nm[1].trim();
            continue;
        }
        if (/^\[[^\]]*\]$/.test(line) || /^=+/.test(line)) continue;
        // 群聊格式残留：「名字：内容」「[名字]: 内容」
        const cleaned = line.replace(new RegExp(`^\\[?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]?\\s*[:：]\\s*`), "").trim();
        if (cleaned) texts.push(cleaned);
    }
    const track = getMusicControlBridge()?.getState().currentTrack ?? null;
    updateLT(store => {
        for (const t of texts.slice(0, 4)) pushMsg(store, charId, { role: "char", text: t });
        if (note && track) {
            const c = mutChar(store, charId);
            const key = songKey(track);
            c.notes[key] = [...(c.notes[key] || []), { by: "char" as const, text: note, at: new Date().toISOString() }].slice(-10);
            pushMsg(store, charId, { role: "char", text: note, kind: "note" });
        }
    });
    if (pick) await playPick(charId, pick, "char");
}

/** 点歌：搜到就切过去 */
export async function playPick(charId: string, pick: { title: string; artist?: string }, by: "char" | "user") {
    const bridge = getMusicControlBridge();
    if (!bridge) return;
    const result = await bridge.playByQuery(pick.title, pick.artist || undefined);
    const who = by === "char" ? charName(charId) : "你";
    updateLT(store => pushMsg(store, charId, {
        role: "system",
        kind: "pick",
        text: result.ok ? `${who}点了 ${songLabel(result.track ?? { title: pick.title, artist: pick.artist })}` : `${who}想听《${pick.title}》，但没搜到`,
    }));
}

export function userSay(charId: string, text: string) {
    updateLT(store => pushMsg(store, charId, { role: "user", text }));
}

export function userNote(charId: string, text: string) {
    const track = getMusicControlBridge()?.getState().currentTrack ?? null;
    if (!track) return;
    updateLT(store => {
        const c = mutChar(store, charId);
        const key = songKey(track);
        c.notes[key] = [...(c.notes[key] || []), { by: "user" as const, text, at: new Date().toISOString() }].slice(-10);
        pushMsg(store, charId, { role: "user", text, kind: "note" });
    });
}

/** 一起听里点红心：记下来，聊天里留一行，他也知道 */
export function isSongLiked(store: Store, track: MusicTrack | null): boolean {
    return Boolean(track && (track.liked || store.liked?.includes(songKey(track))));
}

export function toggleSongLike(charId: string, track: MusicTrack): boolean {
    const key = songKey(track);
    let on = false;
    updateLT(store => {
        const list = store.liked || [];
        on = !list.includes(key) && !track.liked;
        store.liked = on ? [...list, key].slice(-500) : list.filter(k => k !== key);
        if (on) pushMsg(store, charId, { role: "system", kind: "like", text: `你给${songLabel(track)}点了红心` });
    });
    if (track.liked !== on) void toggleLike(track.id).catch(() => undefined);
    track.liked = on;
    return on;
}

export function setDistance(charId: string, distance: string) {
    updateLT(store => { mutChar(store, charId).distance = distance; });
}

// ── 后台：计时、切歌、他来邀请 ────────────────

let stopTick: (() => void) | null = null;
const TICK_SEC = 5;

function tick() {
    const store = loadLT();
    const active = store.active;
    if (active) {
        const state = getMusicControlBridge()?.getState();
        const track = state?.currentTrack;
        if (track && track.id !== active.lastTrackId) {
            updateLT(s => {
                if (!s.active) return;
                s.active.lastTrackId = track.id;
                const label = songLabel(track);
                if (s.active.songs[s.active.songs.length - 1] !== label) s.active.songs = [...s.active.songs, label].slice(-30);
                pushMsg(s, active.charId, { role: "system", kind: "song", text: `正在一起听 ${label}` });
            });
        }
        if (state?.isPlaying) {
            updateLT(s => {
                if (!s.active) return;
                s.active.sec += TICK_SEC;
                mutChar(s, active.charId).totalSec += TICK_SEC;
            });
        }
    }
    void maybeInvite();
}

let lastInviteCheck = 0;
let inviting = false;

/** 他偶尔主动邀请：每个 char 每天掷一次，至少隔 2 天 */
async function maybeInvite() {
    if (inviting || Date.now() - lastInviteCheck < 10 * 60_000) return;
    lastInviteCheck = Date.now();
    const store = loadLT();
    if (store.active) return;
    const today = new Date().toDateString();
    const ids = new Set(loadCharacters().map(c => c.id));
    for (const s of loadChatSessions()) {
        if (s.isGroup || !ids.has(s.contactId) || s.isBlacklisted) continue;
        const c = ltChar(store, s.contactId);
        if (c.rolledOn === today) continue;
        updateLT(st => { mutChar(st, s.contactId).rolledOn = today; });
        if (c.lastInviteAt && Date.now() - new Date(c.lastInviteAt).getTime() < 2 * 86_400_000) continue;
        if (Math.random() >= 0.04) continue;
        inviting = true;
        try {
            await sendInvite(s.contactId);
        } finally {
            inviting = false;
        }
        return;
    }
}

/** 离上次聊天多久 + 最近几句，邀请时让他视情况开口 */
function chatContext(charId: string): { gap: string; lines: string[] } {
    const session = createOrGetSession(charId);
    const user = userName(charId);
    const msgs = loadChatMessages(session.id, 40).filter(m => m.role !== "system" && (m.content || "").trim());
    const last = msgs[msgs.length - 1];
    if (!last) return { gap: "你们还没怎么聊过天", lines: [] };
    const min = Math.max(0, Math.round((Date.now() - new Date(last.createdAt).getTime()) / 60_000));
    const gap = min < 3 ? "你们正在聊天" : min < 60 ? `距离你们上次说话过了 ${min} 分钟` : min < 48 * 60 ? `距离你们上次说话过了大约 ${Math.round(min / 60)} 小时` : `你们已经 ${Math.round(min / 1440)} 天没说话了`;
    const lines = msgs.slice(-10).map(m => `${m.role === "user" ? user : "你"}：${(m.content || "").replace(/\s+/g, " ").slice(0, 120)}`);
    return { gap, lines };
}

export async function sendInvite(charId: string) {
    const user = userName(charId);
    const ctx = chatContext(charId);
    const raw = await charGenerate(charId, [
        `你想邀请${user}用音乐 App 的「一起听」和你一起听一首歌。`,
        `现在是 ${new Date().toLocaleString("zh-CN", { hour12: false })}，${ctx.gap}。`,
        ctx.lines.length ? `你们最近的聊天：\n${ctx.lines.join("\n")}` : "",
        "按离上次聊天的时间和刚才聊的情况，像真人一样判断现在适不适合邀请、怎么开口：正在聊就顺着当下的气氛，隔得久就当作重新找她说话；话题和情绪不对就不邀请。",
        "挑一首真实存在的歌，可以和聊的内容有关，也可以只是你此刻的心情。",
        "不邀请就只输出：不邀请",
        "邀请就只输出：",
        "===邀请===",
        "歌：歌名｜歌手",
        "话：卡片上写给她的一句话（口吻按你平时跟她说话的样子）",
    ].filter(Boolean).join("\n"));
    if (/^\s*不邀请/.test(raw)) return;
    const songLine = raw.match(/歌[：:]\s*(.+)/)?.[1] || "";
    const [title, artist] = songLine.split(/[｜|]/).map(x => x.trim().replace(/[《》]/g, ""));
    if (!title) return;
    const words = raw.match(/话[：:]\s*(.+)/)?.[1]?.trim() || "";
    const chat = createOrGetSession(charId);
    pushChatMessage({
        sessionId: chat.id,
        role: "assistant",
        content: "",
        mediaType: "app_card",
        mediaData: {
            appName: "音乐",
            appCardTitle: `邀请你一起听《${title}》`,
            appHistoryText: `[一起听邀请卡片] 你邀请${user}一起听《${title}》${artist ? `- ${artist}` : ""}`,
            appCardLayout: {
                appLabel: "音乐 · 一起听",
                title: `邀请你一起听`,
                subtitle: `《${title}》${artist ? ` ${artist}` : ""}`,
                body: words,
                actions: [{ label: "一起听" }],
            },
            noxAction: "listen_together",
            noxSong: { title, artist: artist || "" },
            noxCharId: charId,
        } as ChatMessage["mediaData"],
    });
    // 发完卡片让他在聊天里接话
    pushChatMessage({
        sessionId: chat.id,
        role: "system",
        mediaType: "system_instruction",
        mediaData: { compactSystemInstruction: true, shortTermMemoryEvent: true },
        content: `<hidden-system>音乐一起听：你刚给${user}发了一起听邀请卡片，想和她一起听《${title}》${artist ? `- ${artist}` : ""}${words ? `，卡片上写着：${words}` : ""}。${ctx.gap}。接着在聊天里自然地说一两句，按离上次聊天的时间和刚才聊的情况决定怎么开口，不要重复卡片上的话。</hidden-system>`,
    });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: chat.id } }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId: chat.id } })), 0);
    updateLT(st => { mutChar(st, charId).lastInviteAt = new Date().toISOString(); });
}

/** 点了他的邀请卡片 */
export async function acceptInvite(charId: string, song?: { title: string; artist?: string }) {
    startListening(charId, "char");
    if (song?.title) await playPick(charId, song, "char");
    window.dispatchEvent(new CustomEvent(LISTEN_TOGETHER_OPEN_EVENT, { detail: {} }));
    void charSpeak(charId, "greet");
}

export function startListenTogetherService() {
    if (stopTick || typeof window === "undefined") return;
    stopTick = bgSetInterval(tick, TICK_SEC * 1000);
    if (process.env.NODE_ENV !== "production") {
        (window as unknown as Record<string, unknown>).__noxListen = { invite: sendInvite };
    }
}

export function stopListenTogetherService() {
    stopTick?.();
    stopTick = null;
}
