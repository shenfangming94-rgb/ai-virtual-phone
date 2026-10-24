// 记忆备份：记忆库里导出/导入某个角色（或全部角色）的长期+核心记忆；
// 档案库批量导出时也用这里，把记忆和角色卡打在一个文件里。
import type { MemoryEntry } from "./memory-types";
import {
    getLastCoreSummarizedTimestamp,
    getLastSummarizedTimestamp,
    loadMemoryEntries,
    saveMemoryEntries,
    setLastCoreSummarizedTimestamp,
    setLastSummarizedTimestamp,
} from "./memory-storage";

export const MEMORY_BACKUP_SCHEMA = "nox_memory_backup";

export type CharacterMemoryPack = {
    characterId: string;
    characterName: string;
    entries: MemoryEntry[];
    lastSummarizedAt?: string | null;
    lastCoreSummarizedAt?: string | null;
};

export type MemoryBackupFile = {
    schema: typeof MEMORY_BACKUP_SCHEMA;
    version: 1;
    exportedAt: string;
    characters: CharacterMemoryPack[];
};

export async function buildMemoryPack(characterId: string, characterName: string): Promise<CharacterMemoryPack> {
    return {
        characterId,
        characterName,
        entries: await loadMemoryEntries(characterId),
        lastSummarizedAt: getLastSummarizedTimestamp(characterId),
        lastCoreSummarizedAt: getLastCoreSummarizedTimestamp(characterId),
    };
}

export async function exportMemoryBackup(chars: { id: string; name: string }[], filename: string): Promise<number> {
    const packs: CharacterMemoryPack[] = [];
    for (const c of chars) packs.push(await buildMemoryPack(c.id, c.name));
    const file: MemoryBackupFile = {
        schema: MEMORY_BACKUP_SCHEMA,
        version: 1,
        exportedAt: new Date().toISOString(),
        characters: packs,
    };
    const { downloadFile } = await import("./download-utils");
    await downloadFile(new Blob([JSON.stringify(file)], { type: "application/json" }), filename);
    return packs.reduce((n, p) => n + p.entries.length, 0);
}

function isMemoryEntryLike(x: unknown): x is MemoryEntry {
    const e = x as MemoryEntry;
    return !!e && typeof e === "object"
        && typeof e.id === "string"
        && typeof e.content === "string"
        && (e.type === "long_term" || e.type === "core");
}

export function sanitizeMemoryPack(raw: unknown): CharacterMemoryPack | null {
    const p = raw as Partial<CharacterMemoryPack>;
    if (!p || typeof p !== "object" || !Array.isArray(p.entries)) return null;
    return {
        characterId: String(p.characterId ?? ""),
        characterName: String(p.characterName ?? ""),
        entries: p.entries.filter(isMemoryEntryLike),
        lastSummarizedAt: typeof p.lastSummarizedAt === "string" ? p.lastSummarizedAt : null,
        lastCoreSummarizedAt: typeof p.lastCoreSummarizedAt === "string" ? p.lastCoreSummarizedAt : null,
    };
}

/** 读记忆备份文件；也认档案库导出的角色包（里面带记忆） */
export function parseMemoryBackup(text: string): CharacterMemoryPack[] | null {
    try {
        const obj = JSON.parse(text) as Record<string, unknown>;
        if (obj.schema === MEMORY_BACKUP_SCHEMA && Array.isArray(obj.characters)) {
            return obj.characters.map(sanitizeMemoryPack).filter((p): p is CharacterMemoryPack => !!p);
        }
        if (obj.schema === "nox_character_bundle" && Array.isArray(obj.characters)) {
            return (obj.characters as { card?: { id?: string; name?: string }; memories?: unknown }[])
                .map(item => {
                    const pack = sanitizeMemoryPack(item.memories);
                    if (!pack) return null;
                    return { ...pack, characterId: pack.characterId || String(item.card?.id ?? ""), characterName: pack.characterName || String(item.card?.name ?? "") };
                })
                .filter((p): p is CharacterMemoryPack => !!p);
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * 把一份记忆导给 targetId。同一条（同 id、同角色）已经有了就跳过；
 * 导给别的角色时换新 id，免得把原角色的那条顶掉。
 */
export async function importMemoryPack(pack: CharacterMemoryPack, targetId: string): Promise<{ added: number; skipped: number }> {
    const existing = await loadMemoryEntries(targetId);
    const have = new Set(existing.map(e => e.id));
    const sameContent = new Set(existing.map(e => `${e.type}\n${e.content.trim()}`));
    const toSave: MemoryEntry[] = [];
    let skipped = 0;
    for (const e of pack.entries) {
        const key = `${e.type}\n${e.content.trim()}`;
        if (have.has(e.id) || sameContent.has(key)) { skipped++; continue; }
        const keepId = pack.characterId === targetId;
        const id = keepId ? e.id : `${e.id}_imp_${Math.random().toString(36).slice(2, 7)}`;
        toSave.push({ ...e, id, characterId: targetId });
        have.add(id);
        sameContent.add(key);
    }
    await saveMemoryEntries(toSave);
    // 总结进度：本机还没有才用备份里的，免得把已经总结过的事件再总结一遍
    if (pack.characterId === targetId) {
        if (pack.lastSummarizedAt && !getLastSummarizedTimestamp(targetId)) setLastSummarizedTimestamp(targetId, pack.lastSummarizedAt);
        if (pack.lastCoreSummarizedAt && !getLastCoreSummarizedTimestamp(targetId)) setLastCoreSummarizedTimestamp(targetId, pack.lastCoreSummarizedAt);
    }
    return { added: toSave.length, skipped };
}
