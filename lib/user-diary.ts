// lib/user-diary.ts
// 手记里「我的日记」：她自己写的日记（纯文字），写完选给谁看；
// 以及日记上的批注（她批 char 的、char 批她的），每条批注锚在一句原文上。
// 批注按日记 id 单独存一份，不动原来 char 日记的数据结构。

import { kvGet, kvSet, registerKvMigration } from "./kv-db";

export type DiaryAnnotation = {
    id: string;
    entryId: string;
    /** "self" = 她；否则是 characterId */
    authorKey: string;
    authorName: string;
    /** 被批注的那句原文（在正文里能找到） */
    quote: string;
    text: string;
    color: string;
    createdAt: string;
};

export type UserDiaryEntry = {
    id: string;
    title: string;
    body: string;
    /** 给谁看：空数组 = 只给自己看 */
    sharedWith: string[];
    createdAt: string;
    updatedAt: string;
};

export type UserDiaryCover = { type: "default" } | { type: "image"; dataUrl: string };

export const USER_DIARY_SELF_KEY = "self";
export const USER_DIARY_UPDATED_EVENT = "user-diary-updated";

const ENTRIES_KEY = "nox_user_diary_entries_v1";
const ANNOTATIONS_KEY = "nox_diary_annotations_v1";
const COVER_KEY = "nox_user_diary_cover_v1";
const SEEN_KEY = "nox_user_diary_seen_annotations_v1";
registerKvMigration(ENTRIES_KEY);
registerKvMigration(ANNOTATIONS_KEY);
registerKvMigration(COVER_KEY);
registerKvMigration(SEEN_KEY);

/** char 批注的颜色：自动轮着分 */
export const CHAR_ANNOTATION_COLORS = [
    "#d0607f", "#4f82c4", "#3f9a8c", "#d68a3c", "#9271c2", "#c25a4a", "#5c9bc0", "#8a9a4a",
];
/** 她批注时自己挑的笔色 */
export const SELF_ANNOTATION_COLORS = ["#c0659a", "#3b6fd0", "#2d2b28", "#d08a2e", "#7a5bb5"];

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
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(USER_DIARY_UPDATED_EVENT));
}

// ── 她的日记 ──

export function loadUserDiaryEntries(): UserDiaryEntry[] {
    const list = readJson<UserDiaryEntry[]>(ENTRIES_KEY, []);
    return (Array.isArray(list) ? list : [])
        .filter(e => e && typeof e.id === "string" && typeof e.body === "string")
        .map(e => ({ ...e, sharedWith: Array.isArray(e.sharedWith) ? e.sharedWith : [] }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function saveUserDiaryEntries(list: UserDiaryEntry[]): void {
    kvSet(ENTRIES_KEY, JSON.stringify(list));
    emit();
}

export function createUserDiaryEntry(input: { title: string; body: string; sharedWith: string[] }): UserDiaryEntry {
    const now = new Date().toISOString();
    const body = input.body.replace(/\r\n?/g, "\n").trim();
    const entry: UserDiaryEntry = {
        id: newId("user_diary"),
        title: input.title.trim().slice(0, 40) || body.replace(/\s+/g, " ").slice(0, 12) || "无题",
        body,
        sharedWith: Array.from(new Set(input.sharedWith)),
        createdAt: now,
        updatedAt: now,
    };
    saveUserDiaryEntries([entry, ...loadUserDiaryEntries()]);
    return entry;
}

export function updateUserDiarySharedWith(id: string, sharedWith: string[]): UserDiaryEntry | null {
    let updated: UserDiaryEntry | null = null;
    const list = loadUserDiaryEntries().map(e => {
        if (e.id !== id) return e;
        updated = { ...e, sharedWith: Array.from(new Set(sharedWith)), updatedAt: new Date().toISOString() };
        return updated;
    });
    saveUserDiaryEntries(list);
    return updated;
}

export function deleteUserDiaryEntry(id: string): void {
    saveUserDiaryEntries(loadUserDiaryEntries().filter(e => e.id !== id));
    saveAllAnnotations(loadAllAnnotations().filter(a => a.entryId !== id));
}

// ── 批注 ──

function loadAllAnnotations(): DiaryAnnotation[] {
    const list = readJson<DiaryAnnotation[]>(ANNOTATIONS_KEY, []);
    return Array.isArray(list) ? list.filter(a => a && a.entryId && a.text) : [];
}

function saveAllAnnotations(list: DiaryAnnotation[]): void {
    kvSet(ANNOTATIONS_KEY, JSON.stringify(list));
    emit();
}

export function loadAnnotationsForEntry(entryId: string): DiaryAnnotation[] {
    return loadAllAnnotations()
        .filter(a => a.entryId === entryId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function loadAnnotationsByAuthor(authorKey: string): DiaryAnnotation[] {
    return loadAllAnnotations().filter(a => a.authorKey === authorKey);
}

/** 她批注过的所有 char 日记批注（给记忆用） */
export function loadSelfAnnotations(): DiaryAnnotation[] {
    return loadAllAnnotations().filter(a => a.authorKey === USER_DIARY_SELF_KEY);
}

export function addAnnotations(items: Omit<DiaryAnnotation, "id" | "createdAt">[]): DiaryAnnotation[] {
    if (items.length === 0) return [];
    const now = Date.now();
    const created = items.map((item, i) => ({
        ...item,
        id: newId("diary_note"),
        createdAt: new Date(now + i).toISOString(),
    }));
    saveAllAnnotations([...loadAllAnnotations(), ...created]);
    return created;
}

export function deleteAnnotation(id: string): void {
    saveAllAnnotations(loadAllAnnotations().filter(a => a.id !== id));
}

export function deleteAnnotationsForEntries(entryIds: string[]): void {
    const ids = new Set(entryIds);
    saveAllAnnotations(loadAllAnnotations().filter(a => !ids.has(a.entryId)));
}

export function charAnnotationColor(characterId: string): string {
    let hash = 0;
    for (const ch of characterId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return CHAR_ANNOTATION_COLORS[hash % CHAR_ANNOTATION_COLORS.length];
}

/** 她的日记上还没看过的 char 批注数（书架小红点） */
export function countUnseenUserDiaryAnnotations(): number {
    const seen = new Set(readJson<string[]>(SEEN_KEY, []));
    const mine = new Set(loadUserDiaryEntries().map(e => e.id));
    return loadAllAnnotations().filter(a => mine.has(a.entryId) && a.authorKey !== USER_DIARY_SELF_KEY && !seen.has(a.id)).length;
}

export function markUserDiaryAnnotationsSeen(entryId: string): void {
    const seen = new Set(readJson<string[]>(SEEN_KEY, []));
    let changed = false;
    for (const a of loadAnnotationsForEntry(entryId)) {
        if (!seen.has(a.id)) { seen.add(a.id); changed = true; }
    }
    if (changed) {
        kvSet(SEEN_KEY, JSON.stringify([...seen].slice(-2000)));
        emit();
    }
}

// ── 封面 ──

export function loadUserDiaryCover(): UserDiaryCover {
    const cover = readJson<UserDiaryCover | null>(COVER_KEY, null);
    if (cover && cover.type === "image" && typeof cover.dataUrl === "string" && cover.dataUrl) return cover;
    return { type: "default" };
}

export function saveUserDiaryCover(cover: UserDiaryCover): void {
    kvSet(COVER_KEY, JSON.stringify(cover));
    emit();
}

/** 把上传的封面图压到 720px 宽以内 */
export async function compressCoverImage(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = url;
        });
        const scale = Math.min(1, 720 / Math.max(img.width, 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.85);
    } finally {
        URL.revokeObjectURL(url);
    }
}

// ── 把批注锚到正文 ──

/** 在正文里找批注引用的那句，找不到时容忍首尾标点/空白差异 */
export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
    const q = quote.trim();
    if (!q) return null;
    let idx = text.indexOf(q);
    if (idx >= 0) return { start: idx, end: idx + q.length };
    const stripped = q.replace(/^[\s，。！？、,.!?…「」“”"']+|[\s，。！？、,.!?…「」“”"']+$/g, "");
    if (stripped.length >= 2) {
        idx = text.indexOf(stripped);
        if (idx >= 0) return { start: idx, end: idx + stripped.length };
    }
    return null;
}
