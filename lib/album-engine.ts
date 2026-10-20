// lib/album-engine.ts
// 相册的 AI 部分：
// - 识图：她传的真图片识一次，存成描述，char 之后都读这段描述「看」照片
// - 共享相簿邀请：聊天里发邀请卡片，char 按人设决定加不加（基本都会加）
// - char 来逛她给看的相簿，喜欢的收藏、留一句
// - char 往共享相簿里加照片（一天最多一次）：开了生图就真生成，不然是文字照片
// 发生的事都以隐藏事件写进他私聊，进他的记忆。

import { loadCharacters } from "./character-storage";
import { sendLLMRequest } from "./chat-engine";
import {
    CHAT_REQUEST_REPLY_EVENT,
    createOrGetSession,
    loadChatContacts,
    pushChatMessage,
    type ChatMessage,
    type ChatSession,
} from "./chat-storage";
import { generateGroupRawCompletion } from "./group-chat-engine";
import { generateImageFromConfiguredApi, SELF_REFERENCE_ID } from "./image-generation-service";
import { isMediaStoreRef, loadMediaBlob, storeMediaBlob } from "./media-cache-storage";
import { loadApiConfigs, loadBindingConfig, loadImageGenerationSettings, resolveBinding, resolveUserIdentity } from "./settings-storage";
import {
    addFav,
    addPhotos,
    ALBUM_SELF,
    loadAlbums,
    loadPhotos,
    markRolled,
    rolledToday,
    updateAlbum,
    updatePhoto,
    type Album,
    type AlbumPhoto,
} from "./album-store";

function userName(charId?: string): string {
    try {
        return resolveUserIdentity(charId, "chat")?.name || "她";
    } catch {
        return "她";
    }
}

function charName(charId: string): string {
    return loadCharacters().find(c => c.id === charId)?.name || "他";
}

function isFriend(charId: string): boolean {
    return loadChatContacts().some(c => c.characterId === charId);
}

/** 写一条只进他记忆的隐藏事件（visible 为空时聊天里不显示） */
function pushEvent(charId: string, visible: string, hidden: string): ChatSession {
    const session = createOrGetSession(charId);
    const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
    pushChatMessage({
        sessionId: session.id,
        role: "system",
        mediaType: "system_instruction",
        mediaData: { compactSystemInstruction: true, shortTermMemoryEvent: true },
        content: `${visible}\n<hidden-system>相册：时间：${stamp}；${hidden}</hidden-system>`,
    });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
    return session;
}

function requestReply(sessionId: string) {
    window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId } }));
    }, 0);
}

/** 以这个 char 的身份调一次（人设、记忆、最近聊天都在） */
async function charGenerate(charId: string, instruction: string): Promise<string> {
    const session: ChatSession = {
        id: `album_${charId}_${Date.now().toString(36)}`,
        contactId: "group_album",
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
        isPinned: false,
        bilingualTranslationEnabled: false,
        isGroup: true,
        groupName: "相册",
        participantIds: [charId],
    };
    const task: ChatMessage = {
        id: `album-task-${Date.now()}`,
        sessionId: session.id,
        role: "user",
        content: `[相册App] ${instruction}`,
        status: "sent",
        createdAt: new Date().toISOString(),
    };
    const result = await generateGroupRawCompletion(session, [task], { appTags: [], appId: "album" });
    return result.text || "";
}

function field(text: string, name: string): string {
    return text.match(new RegExp(`${name}[：:]\\s*([^\\n]+)`))?.[1]?.trim() || "";
}

// ── 识图 ──

async function blobToSmallDataUrl(blob: Blob): Promise<string> {
    const url = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = url;
        });
        const scale = Math.min(1, 768 / Math.max(img.width, img.height, 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.82);
    } finally {
        URL.revokeObjectURL(url);
    }
}

let visionRunning = false;

/** 把还没识过图的真图片识一遍（她的 API 要开识图） */
export async function describePendingPhotos(): Promise<void> {
    if (visionRunning) return;
    const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
    const config = loadApiConfigs().find(c => c.id === slot.apiConfigId);
    if (!config?.enableImageRecognition) return;
    visionRunning = true;
    try {
        for (const photo of loadPhotos().filter(p => p.vision === "pending" && p.src)) {
            try {
                const src = photo.src!;
                const blob = isMediaStoreRef(src) ? (await loadMediaBlob(src))?.blob : await (await fetch(src)).blob();
                if (!blob) { updatePhoto(photo.id, { vision: "failed" }); continue; }
                const dataUrl = await blobToSmallDataUrl(blob);
                const text = await sendLLMRequest(config, null, [{
                    role: "user",
                    content: [
                        { type: "text", text: "用一段中文客观描述这张照片：拍的是什么、有谁、在做什么、场景和氛围。80 字以内，只输出描述。" },
                        { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
                    ],
                }], [], { characterName: "相册识图" }, { skipOutputRegex: true, appId: "album" });
                updatePhoto(photo.id, { desc: text.trim().slice(0, 200) || photo.desc, vision: "done" });
            } catch {
                updatePhoto(photo.id, { vision: "failed" });
            }
        }
    } finally {
        visionRunning = false;
    }
}

// ── 别的地方「存到相册」（朋友圈的图） ──

export async function saveToAlbum(input: { url?: string | null; desc: string }): Promise<void> {
    let src: string | undefined;
    if (input.url) {
        const blob = await (await fetch(input.url)).blob();
        src = await storeMediaBlob(blob, blob.type || "image/png", "image");
    }
    addPhotos([{ src, desc: input.desc || "", vision: src && !input.desc ? "pending" : "done", source: "save", addedBy: ALBUM_SELF }]);
    if (src && !input.desc) void describePendingPhotos();
}

// ── 生图（相册里她自己生成的） ──

export async function generateAlbumPhoto(scene: string, peopleIds: string[]): Promise<{ src: string } | null> {
    const chars = loadCharacters();
    const me = userName();
    const people = peopleIds.map(id => ({
        id,
        name: id === SELF_REFERENCE_ID ? `我（${me}）` : (chars.find(c => c.id === id)?.name || "某人"),
    }));
    const result = await generateImageFromConfiguredApi({ description: scene, people, appId: "album" });
    return result ? { src: result.mediaRef } : null;
}

export function isImageGenerationReady(): boolean {
    return loadImageGenerationSettings().enabled === true;
}

// ── 共享相簿邀请 ──

export async function inviteToSharedAlbum(album: Album, charId: string): Promise<void> {
    if (!isFriend(charId)) return;
    const me = userName(charId);
    const session = createOrGetSession(charId);
    pushChatMessage({
        sessionId: session.id,
        role: "user",
        content: "",
        mediaType: "app_card",
        mediaData: {
            appName: "照片",
            appCardTitle: `邀请你加入共享相簿「${album.name}」`,
            appHistoryText: `[共享相簿邀请] ${me}邀请你加入共享相簿「${album.name}」，加入后你们都能往里面放照片`,
            appCardLayout: {
                appLabel: "照片 · 共享相簿",
                title: `邀请你加入共享相簿`,
                subtitle: `「${album.name}」`,
                status: "等待加入",
                rows: [],
                openDisabled: true,
            },
        } as ChatMessage["mediaData"],
    });
    let join = true;
    try {
        const text = await charGenerate(charId, [
            `${me}邀请你加入她建的共享相簿「${album.name}」，加入以后你们都能往里放照片、看对方放的照片。`,
            `按你的人设和你们的关系决定加不加。大多数情况下会加入，除非人设或当下情况明显不会。`,
            `只输出一行：决定：加入 或 决定：不加入`,
        ].join("\n"));
        join = !/不加入/.test(field(text, "决定") || text);
    } catch {
        join = true;
    }
    const current = loadAlbums().find(a => a.id === album.id);
    if (!current) return;
    updateAlbum(album.id, {
        invitedIds: (current.invitedIds || []).filter(id => id !== charId),
        memberIds: join ? Array.from(new Set([...current.memberIds, charId])) : current.memberIds,
    });
    pushEvent(
        charId,
        join ? `${charName(charId)} 已加入共享相簿「${album.name}」` : "",
        join
            ? `你收到${me}的共享相簿邀请「${album.name}」，加入了。接着在聊天里自然地回她一两句。`
            : `你收到${me}的共享相簿邀请「${album.name}」，决定先不加入。接着在聊天里自然地回她一两句。`,
    );
    requestReply(session.id);
}

/** 她往共享相簿加了照片：成员都知道 */
export function noteUserAddedToShared(album: Album, photos: AlbumPhoto[]): void {
    const me = userName();
    const list = photos.slice(0, 6).map(p => p.desc || "一张照片").join("；");
    for (const charId of album.memberIds) {
        pushEvent(charId, "", `${me}往你们的共享相簿「${album.name}」里加了 ${photos.length} 张照片：${list}`);
    }
}

// ── 他来逛相簿、收藏 ──

async function visitAlbum(charId: string, album: Album): Promise<void> {
    const photos = loadPhotos().filter(p => p.albumIds.includes(album.id) && !p.favs.some(f => f.characterId === charId));
    if (photos.length === 0) return;
    const sample = [...photos].sort(() => Math.random() - 0.5).slice(0, 12);
    const me = userName(charId);
    const text = await charGenerate(charId, [
        `你在逛${me}的相簿「${album.name}」，她把这个相簿设成你能看。下面是里面的照片（编号：内容）：`,
        ...sample.map((p, i) => `${i + 1}：${p.desc || "一张照片"}${p.caption ? `（配文：${p.caption}）` : ""}`),
        ``,
        `按你的人设看看，碰到真喜欢的就收藏（0～2 张，不喜欢可以一张都不收），收藏时可以留一句短话。`,
        `每收藏一张输出：`,
        `===收藏===`,
        `编号：数字`,
        `留言：一句话（不想留就写 无）`,
        `一张都不收就只输出：不收藏`,
    ].join("\n"));
    const picks = text.split(/===\s*收藏\s*===/).slice(1).slice(0, 2);
    const done: string[] = [];
    for (const block of picks) {
        const idx = Number(field(block, "编号")) - 1;
        const photo = sample[idx];
        if (!photo) continue;
        const note = field(block, "留言").replace(/^无$/, "");
        addFav(photo.id, { characterId: charId, note: note.slice(0, 60), at: new Date().toISOString() });
        done.push(`${photo.desc || "一张照片"}${note ? `（你留言：${note}）` : ""}`);
    }
    if (done.length > 0) {
        pushEvent(charId, "", `你逛了${me}的相簿「${album.name}」，收藏了：${done.join("；")}`);
    }
}

// ── 他往共享相簿加照片 ──

async function addToShared(charId: string, album: Album): Promise<void> {
    const me = userName(charId);
    const recent = loadPhotos().filter(p => p.albumIds.includes(album.id)).slice(0, 8);
    const text = await charGenerate(charId, [
        `你和${me}有一个共享相簿「${album.name}」${album.memberIds.length > 1 ? `（成员还有：${album.memberIds.filter(id => id !== charId).map(charName).join("、")}）` : ""}。`,
        recent.length ? `里面最近的照片：\n${recent.map(p => `- ${p.desc || "一张照片"}${p.caption ? `（配文：${p.caption}）` : ""}`).join("\n")}` : "相簿里还空着。",
        `按你的人设和最近的生活，往里面放一张你今天拍的照片。`,
        `只输出：`,
        `画面：照片拍了什么（具体、像真的照片，一两句）`,
        `有谁：照片里出现的人，写 我 / ${me} / 我和${me} / 没人`,
        `配文：你放照片时写的一句话`,
    ].join("\n"));
    const scene = field(text, "画面");
    if (!scene) return;
    const who = field(text, "有谁");
    const caption = field(text, "配文").slice(0, 60);
    let src: string | undefined;
    if (isImageGenerationReady()) {
        const people: { id: string; name: string }[] = [];
        if (/我/.test(who) && !/^没人/.test(who)) people.push({ id: charId, name: charName(charId) });
        if (who.includes(me)) people.push({ id: SELF_REFERENCE_ID, name: me });
        try {
            const result = await generateImageFromConfiguredApi({ description: scene, people, characterId: charId, appId: "album" });
            src = result?.mediaRef;
        } catch {
            src = undefined;
        }
    }
    addPhotos([{
        src,
        desc: scene,
        vision: "done",
        source: "char",
        addedBy: charId,
        caption,
        albumIds: [album.id],
        inLibrary: false,
    }]);
    pushEvent(charId, "", `你往你们的共享相簿「${album.name}」里放了一张照片：${scene}${caption ? `，配文：${caption}` : ""}`);
}

// ── 每天的骰子 ──

let ticking = false;

export async function albumDailyTick(): Promise<void> {
    if (ticking || typeof window === "undefined") return;
    ticking = true;
    try {
        void describePendingPhotos();
        for (const album of loadAlbums()) {
            for (const charId of album.memberIds) {
                if (charId === ALBUM_SELF) continue;
                const key = `${album.kind}:${album.id}:${charId}`;
                if (rolledToday(key)) continue;
                markRolled(key);
                const chance = album.kind === "shared" ? 0.3 : 0.35;
                if (Math.random() >= chance) continue;
                try {
                    if (album.kind === "shared") await addToShared(charId, album);
                    else await visitAlbum(charId, album);
                } catch (error) {
                    console.warn("[Album] daily tick failed:", error);
                }
            }
        }
    } finally {
        ticking = false;
    }
}

let stopTimer: (() => void) | null = null;

export function startAlbumService(): void {
    if (stopTimer || typeof window === "undefined") return;
    const first = window.setTimeout(() => void albumDailyTick(), 60_000);
    const every = window.setInterval(() => void albumDailyTick(), 30 * 60_000);
    stopTimer = () => { window.clearTimeout(first); window.clearInterval(every); };
}

export function stopAlbumService(): void {
    stopTimer?.();
    stopTimer = null;
}

export { ALBUM_SELF };
