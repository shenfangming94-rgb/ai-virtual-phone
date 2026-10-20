// lib/album-store.ts
// 相册 app：图库（所有照片）、她自己建的相簿、和 char 的共享相簿。
// 图片本体放 media-store（IndexedDB），这里只存引用；聊天里的照片只记消息 id，
// 显示时再去消息里取图，不复制一份，免得撑大存储。

import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadChatMessages, loadChatSessions, type ChatMessage } from "./chat-storage";

export type AlbumFav = { characterId: string; note: string; at: string };

export type AlbumPhoto = {
    id: string;
    /** media-store:// 引用或普通 url；没有就是「文字照片」 */
    src?: string;
    /** 聊天里的照片：从这条消息取图 */
    msgRef?: { sessionId: string; messageId: string };
    /** 照片内容描述（生图提示词、识图结果或文字照片的文字） */
    desc: string;
    /** 识图状态：上传的真图片要识一次图 char 才「看得见」 */
    vision?: "pending" | "done" | "failed";
    source: "chat" | "upload" | "generate" | "save" | "char";
    /** 谁加的："self" 或 characterId */
    addedBy: string;
    caption?: string;
    createdAt: string;
    albumIds: string[];
    /** 在图库里（char 加到共享相簿的照片不在她图库里） */
    inLibrary: boolean;
    favs: AlbumFav[];
    liked?: boolean;
};

export type Album = {
    id: string;
    name: string;
    kind: "mine" | "shared";
    /** mine：哪些 char 能看；shared：已加入的成员 */
    memberIds: string[];
    /** shared：发了邀请还没回的 */
    invitedIds?: string[];
    createdAt: string;
};

export const ALBUM_SELF = "self";
export const ALBUM_UPDATED_EVENT = "album-updated";

const PHOTOS_KEY = "nox_album_photos_v1";
const ALBUMS_KEY = "nox_album_albums_v1";
const REMOVED_MSG_KEY = "nox_album_removed_messages_v1";
const ROLL_KEY = "nox_album_daily_rolls_v1";
registerKvMigration(PHOTOS_KEY);
registerKvMigration(ALBUMS_KEY);
registerKvMigration(REMOVED_MSG_KEY);
registerKvMigration(ROLL_KEY);

function newId(prefix: string): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readJson<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = kvGet(key);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
    }
}

function emit(): void {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ALBUM_UPDATED_EVENT));
}

// ── 照片 ──

export function loadPhotos(): AlbumPhoto[] {
    const list = readJson<AlbumPhoto[]>(PHOTOS_KEY, []);
    return (Array.isArray(list) ? list : [])
        .filter(p => p && p.id)
        .map(p => ({ ...p, albumIds: p.albumIds || [], favs: p.favs || [], inLibrary: p.inLibrary !== false }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function savePhotos(list: AlbumPhoto[]): void {
    kvSet(PHOTOS_KEY, JSON.stringify(list));
    emit();
}

export function addPhotos(items: Array<Omit<AlbumPhoto, "id" | "createdAt" | "favs" | "albumIds" | "inLibrary"> & Partial<Pick<AlbumPhoto, "albumIds" | "inLibrary" | "createdAt">>>): AlbumPhoto[] {
    const now = Date.now();
    const created: AlbumPhoto[] = items.map((item, i) => ({
        ...item,
        id: newId("photo"),
        createdAt: item.createdAt || new Date(now + i).toISOString(),
        albumIds: item.albumIds || [],
        inLibrary: item.inLibrary !== false,
        favs: [],
    }));
    savePhotos([...created, ...loadPhotos()]);
    return created;
}

export function updatePhoto(id: string, patch: Partial<AlbumPhoto>): void {
    savePhotos(loadPhotos().map(p => p.id === id ? { ...p, ...patch } : p));
}

/** 删照片：聊天来的记下消息 id，以后不再自动收进来 */
export function deletePhotos(ids: string[]): void {
    const set = new Set(ids);
    const all = loadPhotos();
    const removedMsgs = new Set(readJson<string[]>(REMOVED_MSG_KEY, []));
    for (const p of all) if (set.has(p.id) && p.msgRef) removedMsgs.add(p.msgRef.messageId);
    kvSet(REMOVED_MSG_KEY, JSON.stringify([...removedMsgs].slice(-5000)));
    savePhotos(all.filter(p => !set.has(p.id)));
}

export function addPhotosToAlbum(photoIds: string[], albumId: string): void {
    const set = new Set(photoIds);
    savePhotos(loadPhotos().map(p => set.has(p.id) && !p.albumIds.includes(albumId) ? { ...p, albumIds: [...p.albumIds, albumId] } : p));
}

export function removePhotosFromAlbum(photoIds: string[], albumId: string): void {
    const set = new Set(photoIds);
    const next = loadPhotos()
        .map(p => set.has(p.id) ? { ...p, albumIds: p.albumIds.filter(id => id !== albumId) } : p)
        // 只在共享相簿里、不在图库的（char 加的），从相簿拿掉就没了
        .filter(p => p.inLibrary || p.albumIds.length > 0);
    savePhotos(next);
}

export function addFav(photoId: string, fav: AlbumFav): void {
    savePhotos(loadPhotos().map(p => p.id === photoId && !p.favs.some(f => f.characterId === fav.characterId)
        ? { ...p, favs: [...p.favs, fav] }
        : p));
}

// ── 相簿 ──

export function loadAlbums(): Album[] {
    const list = readJson<Album[]>(ALBUMS_KEY, []);
    return (Array.isArray(list) ? list : []).filter(a => a && a.id).map(a => ({ ...a, memberIds: a.memberIds || [] }));
}

function saveAlbums(list: Album[]): void {
    kvSet(ALBUMS_KEY, JSON.stringify(list));
    emit();
}

export function createAlbum(name: string, kind: Album["kind"], invitedIds: string[] = []): Album {
    const album: Album = {
        id: newId("album"),
        name: name.trim().slice(0, 30) || (kind === "shared" ? "共享相簿" : "新相簿"),
        kind,
        memberIds: [],
        ...(kind === "shared" ? { invitedIds } : {}),
        createdAt: new Date().toISOString(),
    };
    saveAlbums([...loadAlbums(), album]);
    return album;
}

export function updateAlbum(id: string, patch: Partial<Album>): void {
    saveAlbums(loadAlbums().map(a => a.id === id ? { ...a, ...patch } : a));
}

export function deleteAlbum(id: string): void {
    saveAlbums(loadAlbums().filter(a => a.id !== id));
    removePhotosFromAlbum(loadPhotos().filter(p => p.albumIds.includes(id)).map(p => p.id), id);
}

// ── 聊天里的照片自动进图库 ──

function isChatPhoto(m: ChatMessage): boolean {
    if (m.mediaType === "image") return true;
    return m.mediaType === "media_file" && m.mediaData?.fileType === "image";
}

/** 打开相册时把聊天里互发的照片收进图库（删过的不再收） */
export function ingestChatPhotos(): number {
    const removed = new Set(readJson<string[]>(REMOVED_MSG_KEY, []));
    const existing = loadPhotos();
    const known = new Set(existing.filter(p => p.msgRef).map(p => p.msgRef!.messageId));
    const fresh: AlbumPhoto[] = [];
    for (const session of loadChatSessions()) {
        for (const m of loadChatMessages(session.id)) {
            if (!isChatPhoto(m) || known.has(m.id) || removed.has(m.id)) continue;
            if (m.role !== "user" && m.role !== "assistant") continue;
            fresh.push({
                id: newId("photo"),
                msgRef: { sessionId: session.id, messageId: m.id },
                desc: m.mediaData?.label || m.mediaData?.fileName || m.content || "",
                source: "chat",
                addedBy: m.role === "user" ? ALBUM_SELF : (m.senderCharacterId || session.contactId),
                createdAt: m.createdAt,
                albumIds: [],
                inLibrary: true,
                favs: [],
            });
        }
    }
    if (fresh.length > 0) savePhotos([...fresh, ...existing]);
    return fresh.length;
}

/** 聊天来的照片：去消息里取当前的图（生成完/被清理都跟着变） */
export function resolveChatPhotoSrc(photo: AlbumPhoto): string | undefined {
    if (!photo.msgRef) return photo.src;
    const m = loadChatMessages(photo.msgRef.sessionId).find(x => x.id === photo.msgRef!.messageId);
    return m?.mediaUrl || undefined;
}

// ── 每天掷骰子（char 来逛相册、往共享相簿加照片） ──

export function rolledToday(key: string): boolean {
    const rolls = readJson<Record<string, string>>(ROLL_KEY, {});
    return rolls[key] === new Date().toDateString();
}

export function markRolled(key: string): void {
    const rolls = readJson<Record<string, string>>(ROLL_KEY, {});
    rolls[key] = new Date().toDateString();
    kvSet(ROLL_KEY, JSON.stringify(rolls));
}
