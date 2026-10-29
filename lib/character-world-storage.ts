import { loadCharacters } from "./character-storage";
import { loadChatContacts } from "./chat-storage";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import type { Character } from "./character-types";
import type { MomentComment, MomentLike, MomentPost } from "./moments-types";

const CHARACTER_WORLDS_KEY = "ai_phone_character_worlds_v1";
export const CHARACTER_WORLDS_UPDATED_EVENT = "character-worlds-updated";
export const DEFAULT_CHARACTER_WORLD_ID = "world_default";

registerKvMigration(CHARACTER_WORLDS_KEY);

/** 爱豆主要人物之间的互动只读原生关系；玩家及其他角色保留原规则。 */
export function idolCharactersKnowEachOther(a: string, b: string): boolean {
    if (a === b) return true;
    let profiles: Record<string, {layer?: string}> = {};
    try { profiles = JSON.parse(kvGet("idol_people_v1") || "{}"); } catch { return false; }
    const contacts = new Set(loadChatContacts().map(c => c.characterId));
    if (![a,b].every(id => profiles[id]?.layer === "main" && contacts.has(id))) return true;
    return loadCharacterWorldGroups().some(g => g.relations.some(r =>
        (r.fromCharacterId === a && r.toCharacterId === b) || (r.fromCharacterId === b && r.toCharacterId === a)));
}

export type CharacterWorldRelation = {
    id: string;
    fromCharacterId: string;
    toCharacterId: string;
    label: string;
    background?: string;
};

export type CharacterWorldGroup = {
    id: string;
    name: string;
    description: string;
    memberIds: string[];
    relations: CharacterWorldRelation[];
    idolRelationChecks?: string[];
    idolManualPairs?: string[];
    createdAt: string;
    updatedAt: string;
};

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function dispatchUpdated(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(CHARACTER_WORLDS_UPDATED_EVENT));
    }
}

function createDefaultGroup(memberIds: string[], now = new Date().toISOString()): CharacterWorldGroup {
    return {
        id: DEFAULT_CHARACTER_WORLD_ID,
        name: "默认世界",
        description: "",
        memberIds,
        relations: [],
        createdAt: now,
        updatedAt: now,
    };
}

function parseGroups(raw: string | null): CharacterWorldGroup[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function normalizeGroups(groups: CharacterWorldGroup[], characters: Character[]): { groups: CharacterWorldGroup[]; changed: boolean } {
    const now = new Date().toISOString();
    const validIds = new Set(characters.map(character => character.id));
    const assigned = new Set<string>();
    let changed = false;

    let normalized = groups
        .filter(group => group && typeof group.id === "string" && typeof group.name === "string")
        .map((group): CharacterWorldGroup => {
            const members: string[] = [];
            for (const memberId of Array.isArray(group.memberIds) ? group.memberIds : []) {
                if (!validIds.has(memberId) || assigned.has(memberId)) {
                    changed = true;
                    continue;
                }
                assigned.add(memberId);
                members.push(memberId);
            }

            const memberSet = new Set(members);
            const relations = (Array.isArray(group.relations) ? group.relations : [])
                .filter(relation => (
                    relation
                    && typeof relation.id === "string"
                    && typeof relation.fromCharacterId === "string"
                    && typeof relation.toCharacterId === "string"
                    && typeof relation.label === "string"
                    && relation.label.trim()
                    && memberSet.has(relation.fromCharacterId)
                    && memberSet.has(relation.toCharacterId)
                    && relation.fromCharacterId !== relation.toCharacterId
                ))
                .map(relation => ({
                    ...relation,
                    label: relation.label.trim(),
                }));

            if (relations.length !== (Array.isArray(group.relations) ? group.relations.length : 0)) changed = true;

            return {
                ...group,
                id: group.id,
                name: group.name.trim() || "未命名世界",
                description: typeof group.description === "string" ? group.description.trim() : "",
                memberIds: members,
                relations,
                createdAt: group.createdAt || now,
                updatedAt: group.updatedAt || now,
            };
        });

    if (normalized.length === 0) {
        changed = true;
        normalized = [createDefaultGroup(characters.map(character => character.id), now)];
        return { groups: normalized, changed };
    }

    let defaultGroup = normalized.find(group => group.id === DEFAULT_CHARACTER_WORLD_ID);
    if (!defaultGroup) {
        changed = true;
        defaultGroup = createDefaultGroup([], now);
        normalized = [defaultGroup, ...normalized];
    }

    const missingIds = characters.map(character => character.id).filter(id => !assigned.has(id));
    if (missingIds.length > 0) {
        changed = true;
        defaultGroup.memberIds = [...defaultGroup.memberIds, ...missingIds];
        defaultGroup.updatedAt = now;
    }

    return { groups: normalized, changed };
}

export function loadCharacterWorldGroups(): CharacterWorldGroup[] {
    const characters = loadCharacters();
    const { groups, changed } = normalizeGroups(parseGroups(kvGet(CHARACTER_WORLDS_KEY)), characters);
    if (changed && isBrowser()) {
        kvSet(CHARACTER_WORLDS_KEY, JSON.stringify(groups));
    }
    return groups;
}

export function saveCharacterWorldGroups(groups: CharacterWorldGroup[]): void {
    const { groups: normalized } = normalizeGroups(groups, loadCharacters());
    if (!isBrowser()) return;
    kvSet(CHARACTER_WORLDS_KEY, JSON.stringify(normalized));
    dispatchUpdated();
}

export function createCharacterWorldGroup(name: string): CharacterWorldGroup {
    const groups = loadCharacterWorldGroups();
    const now = new Date().toISOString();
    const group: CharacterWorldGroup = {
        id: generateId("world"),
        name: name.trim() || "新的世界",
        description: "",
        memberIds: [],
        relations: [],
        createdAt: now,
        updatedAt: now,
    };
    saveCharacterWorldGroups([...groups, group]);
    return group;
}

export function renameCharacterWorldGroup(groupId: string, name: string): void {
    const now = new Date().toISOString();
    saveCharacterWorldGroups(loadCharacterWorldGroups().map(group =>
        group.id === groupId
            ? { ...group, name: name.trim() || group.name, updatedAt: now }
            : group
    ));
}

export function updateCharacterWorldDescription(groupId: string, description: string): void {
    const now = new Date().toISOString();
    saveCharacterWorldGroups(loadCharacterWorldGroups().map(group =>
        group.id === groupId
            ? { ...group, description, updatedAt: now }
            : group
    ));
}

export function deleteCharacterWorldGroup(groupId: string): void {
    if (groupId === DEFAULT_CHARACTER_WORLD_ID) return;
    const groups = loadCharacterWorldGroups();
    const target = groups.find(group => group.id === groupId);
    if (!target) return;
    const now = new Date().toISOString();
    saveCharacterWorldGroups(groups
        .filter(group => group.id !== groupId)
        .map(group => group.id === DEFAULT_CHARACTER_WORLD_ID
            ? { ...group, memberIds: [...group.memberIds, ...target.memberIds], updatedAt: now }
            : group
        ));
}

export function moveCharacterToWorld(characterId: string, groupId: string): void {
    const now = new Date().toISOString();
    saveCharacterWorldGroups(loadCharacterWorldGroups().map(group => {
        const nextMemberIds = group.memberIds.filter(id => id !== characterId);
        const receivesMember = group.id === groupId;
        const memberIds = receivesMember ? [...nextMemberIds, characterId] : nextMemberIds;
        const memberSet = new Set(memberIds);
        return {
            ...group,
            memberIds,
            relations: group.relations.filter(relation =>
                memberSet.has(relation.fromCharacterId) && memberSet.has(relation.toCharacterId)
            ),
            updatedAt: receivesMember || nextMemberIds.length !== group.memberIds.length ? now : group.updatedAt,
        };
    }));
}

export function addCharacterWorldRelation(groupId: string, fromCharacterId: string, toCharacterId: string, label: string): void {
    const trimmedLabel = label.trim();
    if (!trimmedLabel || fromCharacterId === toCharacterId) return;
    const now = new Date().toISOString();
    saveCharacterWorldGroups(loadCharacterWorldGroups().map(group => {
        if (group.id !== groupId) return group;
        if (group.idolManualPairs?.includes(JSON.stringify([fromCharacterId,toCharacterId].sort()))) return group;
        const memberSet = new Set(group.memberIds);
        if (!memberSet.has(fromCharacterId) || !memberSet.has(toCharacterId)) return group;
        return {
            ...group,
            relations: [
                ...group.relations,
                {
                    id: generateId("relation"),
                    fromCharacterId,
                    toCharacterId,
                    label: trimmedLabel,
                },
            ],
            updatedAt: now,
        };
    }));
}

export function deleteCharacterWorldRelation(groupId: string, relationId: string): void {
    const original = loadCharacterWorldGroups().find(g=>g.id===groupId)?.relations.find(r=>r.id===relationId);
    const pair = original ? JSON.stringify([original.fromCharacterId,original.toCharacterId].sort()) : null;
    const now = new Date().toISOString();
    saveCharacterWorldGroups(loadCharacterWorldGroups().map(group =>
        group.id === groupId
            ? { ...group, idolManualPairs: pair ? [...new Set([...(group.idolManualPairs || []), pair])] : group.idolManualPairs, relations: group.relations.filter(relation => pair ? JSON.stringify([relation.fromCharacterId,relation.toCharacterId].sort()) !== pair : relation.id !== relationId), updatedAt: now }
            : group
    ));
}

export function getCharacterWorldGroupId(characterId: string): string | null {
    return loadCharacterWorldGroups().find(group => group.memberIds.includes(characterId))?.id ?? null;
}

export function getCharacterWorldGroup(characterId: string): CharacterWorldGroup | null {
    return loadCharacterWorldGroups().find(group => group.memberIds.includes(characterId)) ?? null;
}

export function areCharactersInSameWorld(firstCharacterId: string, secondCharacterId: string): boolean {
    if (!firstCharacterId || !secondCharacterId) return false;
    if (firstCharacterId === secondCharacterId) return true;
    const firstGroupId = getCharacterWorldGroupId(firstCharacterId);
    const secondGroupId = getCharacterWorldGroupId(secondCharacterId);
    return Boolean(firstGroupId && secondGroupId && firstGroupId === secondGroupId);
}

export function canCharacterSeeMomentPost(post: MomentPost, viewerCharacterId: string): boolean {
    if (post.authorType === "user") return post.visibility.includes(viewerCharacterId);
    if (post.authorId === viewerCharacterId) return true;
    return post.visibility.includes(viewerCharacterId) && areCharactersInSameWorld(post.authorId, viewerCharacterId);
}

export function isMomentRealCharacterAllowedForViewer(viewerCharacterId: string, targetCharacterId: string): boolean {
    return areCharactersInSameWorld(viewerCharacterId, targetCharacterId) && idolCharactersKnowEachOther(viewerCharacterId, targetCharacterId);
}

export function isMomentRealCharacterAllowedForPost(post: MomentPost, targetCharacterId: string, anchorCharacterId?: string): boolean {
    if (post.authorType === "character") {
        return areCharactersInSameWorld(post.authorId, targetCharacterId) && idolCharactersKnowEachOther(post.authorId, targetCharacterId);
    }
    if (anchorCharacterId) {
        return areCharactersInSameWorld(anchorCharacterId, targetCharacterId) && idolCharactersKnowEachOther(anchorCharacterId, targetCharacterId);
    }
    return post.visibility.includes(targetCharacterId);
}

export function isMomentCommentVisibleToCharacter(post: MomentPost, comment: MomentComment, viewerCharacterId: string): boolean {
    if (!canCharacterSeeMomentPost(post, viewerCharacterId)) return false;

    if (comment.replyToAuthorType === "character" && comment.replyToAuthorId) {
        return areCharactersInSameWorld(viewerCharacterId, comment.replyToAuthorId);
    }

    if (comment.authorType === "user") return true;

    if (comment.authorType === "character" && !areCharactersInSameWorld(viewerCharacterId, comment.authorId)) {
        return false;
    }

    if (comment.authorType === "npc" && post.authorType === "character" && !areCharactersInSameWorld(viewerCharacterId, post.authorId)) {
        return false;
    }

    return true;
}

export function getVisibleMomentCommentsForCharacter(post: MomentPost, viewerCharacterId: string, comments: MomentComment[]): MomentComment[] {
    return comments.filter(comment => isMomentCommentVisibleToCharacter(post, comment, viewerCharacterId));
}

export function getVisibleMomentLikesForCharacter(post: MomentPost, viewerCharacterId: string, likes: MomentLike[]): MomentLike[] {
    if (!canCharacterSeeMomentPost(post, viewerCharacterId)) return [];
    return likes.filter(like => {
        if (like.authorType === "user") return true;
        if (like.authorType === "character") return areCharactersInSameWorld(viewerCharacterId, like.authorId);
        if (post.authorType === "character") return areCharactersInSameWorld(viewerCharacterId, post.authorId);
        return true;
    });
}

export function formatCharacterRelationsForPrompt(characterId: string): string {
    const groups = loadCharacterWorldGroups();
    const group = groups.find(item => item.memberIds.includes(characterId)) ?? null;
    if (!group) return "";
    const worldDescription = group.description.trim();
    const hasWorldSetup = groups.length > 1 || group.id !== DEFAULT_CHARACTER_WORLD_ID || group.relations.length > 0 || Boolean(worldDescription);
    let idolProfiles: Record<string,{layer?:string}> = {};
    try { idolProfiles=JSON.parse(kvGet("idol_people_v1")||"{}"); } catch { /* 兼容旧档 */ }
    const idolMain=idolProfiles[characterId]?.layer==="main";
    if (!hasWorldSetup && !idolMain) return "";

    const characters = loadCharacters();
    const nameById = new Map(characters.map(character => [character.id, character.name]));
    // 标注哪些同世界角色已是用户好友——供「推荐联系人」判断是否还需要发名片
    const contactIds = new Set(loadChatContacts().map(contact => contact.characterId));
    const memberNames = group.memberIds
        .map(memberId => {
            const name = nameById.get(memberId);
            if (!name) return null;
            return contactIds.has(memberId) ? `${name}（已是用户好友）` : name;
        })
        .filter((name): name is string => Boolean(name));

    const lines: string[] = [];
    if (idolMain) lines.push("主要人物彼此是否认识以本关系记录为准：无关系记录视为不认识，不因同世界或都认识用户而推断相识。关系不代表知道对方的秘密或恋情。手动关系以最新记录为准。");
    lines.push(`当前世界观：${group.name}。`);
    if (worldDescription) {
        lines.push(`世界观描述：${worldDescription}`);
    }
    if (memberNames.length > 0 && (groups.length > 1 || group.id !== DEFAULT_CHARACTER_WORLD_ID || worldDescription)) {
        lines.push(`同世界角色：${memberNames.join("、")}。`);
    }

    for (const relation of group.relations) {
        const fromName = nameById.get(relation.fromCharacterId);
        const toName = nameById.get(relation.toCharacterId);
        if (!fromName || !toName) continue;
        lines.push(`${fromName}是${toName}的${relation.label}。${relation.background ? `关系背景：${relation.background}` : ""}`);
    }

    // 一跳视角简介：与 viewer 拉过线的角色，附上各自的简量人设，
    // 让 viewer 生成时「知道对方是谁」，避免对方在其口中/笔下 OOC。
    // 没有简介的角色自然跳过（未生成时行为与旧版一致）。
    const characterById = new Map(characters.map(character => [character.id, character]));
    const counterpartIds = new Set<string>();
    for (const relation of group.relations) {
        if (relation.fromCharacterId === characterId) counterpartIds.add(relation.toCharacterId);
        else if (relation.toCharacterId === characterId) counterpartIds.add(relation.fromCharacterId);
    }
    const briefLines: string[] = [];
    for (const counterpartId of counterpartIds) {
        const counterpart = characterById.get(counterpartId);
        const brief = counterpart?.briefPersona?.trim();
        if (!counterpart || !brief) continue;
        briefLines.push(`- ${counterpart.name}：${brief}`);
    }
    if (briefLines.length > 0) {
        lines.push("与你有关系的角色简介（供你在提及、转述或与其互动时保持其人设一致）：");
        lines.push(...briefLines);
    }

    return lines.join("\n");
}
