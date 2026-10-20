// lib/group-admin.ts
// Group admin roles: owner / admin / member, mute state, permission checks,
// action application and the {{groupRoster}} prompt macro.
// Member keys: "self" = the user, otherwise characterId.

import { ChatSession, loadChatSessions, saveChatSessions } from "./chat-storage";
import { loadCharacters } from "./character-storage";

export const GROUP_SELF_KEY = "self";

export type GroupAdminAction =
    | "transfer_owner"
    | "set_admin"
    | "unset_admin"
    | "kick"
    | "invite"
    | "mute"
    | "unmute"
    | "set_title";

export type GroupRole = "owner" | "admin" | "member";

// ── Roles ──────────────────────────────────────────────

export function getGroupOwnerKey(session: ChatSession): string {
    if (session.groupOwnerId) return session.groupOwnerId;
    // Legacy groups (created before roles existed): the user is the owner.
    // Spectator groups without an explicit owner: first member owns the group.
    if (session.isSpectator) return session.participantIds?.[0] || GROUP_SELF_KEY;
    return GROUP_SELF_KEY;
}

export function getGroupRole(session: ChatSession, key: string): GroupRole {
    if (getGroupOwnerKey(session) === key) return "owner";
    if ((session.groupAdminIds || []).includes(key)) return "admin";
    return "member";
}

/** Is this key currently part of the group? ("self" counts unless spectator) */
export function isGroupMemberKey(session: ChatSession, key: string): boolean {
    if (key === GROUP_SELF_KEY) return !session.isSpectator;
    return (session.participantIds || []).includes(key);
}

// ── Titles (群头衔) & levels ──────────────────────────

export const GROUP_TITLE_MAX_LENGTH = 6;
/** 成员头衔可选色（群主固定橙、管理员固定绿，这里不放绿色） */
export const GROUP_TITLE_COLORS = ["pink", "blue", "purple", "cyan", "peach"] as const;
export type GroupTitleColor = typeof GROUP_TITLE_COLORS[number];

export function normalizeGroupTitle(text: string): string {
    return Array.from(String(text || "").replace(/[\s「」“”"\[\]]/g, "")).slice(0, GROUP_TITLE_MAX_LENGTH).join("");
}

export function pickGroupTitleColor(seed: string): GroupTitleColor {
    let hash = 0;
    for (const ch of `${seed}${Date.now()}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return GROUP_TITLE_COLORS[hash % GROUP_TITLE_COLORS.length];
}

export function getGroupTitle(session: ChatSession, key: string): { text: string; color: GroupTitleColor } | null {
    const entry = session.groupTitles?.[key];
    if (!entry?.text) return null;
    const color = (GROUP_TITLE_COLORS as readonly string[]).includes(entry.color || "") ? entry.color as GroupTitleColor : "pink";
    return { text: entry.text, color };
}

/** 群等级：按这个人在本群发过的消息条数 */
export function groupLevelFromCount(count: number): number {
    const steps = [10, 50, 150, 400, 1000];
    let level = 1;
    for (const step of steps) if (count >= step) level += 1;
    return level;
}

// ── Mute state ─────────────────────────────────────────

export function getGroupMuteRemainingMs(session: ChatSession, key: string, now?: number): number {
    const until = session.groupMutes?.[key];
    if (!until) return 0;
    const ms = new Date(until).getTime() - (now ?? Date.now());
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export function isGroupMuted(session: ChatSession, key: string, now?: number): boolean {
    return getGroupMuteRemainingMs(session, key, now) > 0;
}

export function formatMuteDurationLabel(minutes: number): string {
    if (minutes % 1440 === 0 && minutes >= 1440) return `${minutes / 1440}天`;
    if (minutes % 60 === 0 && minutes >= 60) return `${minutes / 60}小时`;
    return `${minutes}分钟`;
}

export function formatMuteRemainingLabel(ms: number): string {
    const totalMinutes = Math.ceil(ms / 60000);
    if (totalMinutes >= 1440) return `${Math.ceil(totalMinutes / 1440)}天`;
    if (totalMinutes >= 60) return `${Math.ceil(totalMinutes / 60)}小时`;
    return `${Math.max(totalMinutes, 1)}分钟`;
}

// ── Permission matrix ──────────────────────────────────

/**
 * Whether `actorKey` may perform `action` on `targetKey`.
 * Rules mirror WeChat: owner may do everything; admins may kick/invite/mute
 * plain members only; nobody targets the owner; admins don't target admins.
 * Characters may not target the user unless the session opts in.
 */
export function canGroupAdminAct(
    session: ChatSession,
    actorKey: string,
    action: GroupAdminAction,
    targetKey: string,
): boolean {
    if (!actorKey || !targetKey) return false;
    if (!isGroupMemberKey(session, actorKey)) return false;
    const actorRole = getGroupRole(session, actorKey);
    if (actorRole === "member") return false;
    if (actorKey === targetKey && action !== "unmute" && action !== "set_title") return false;

    // Characters targeting the user: kicking is never allowed (the session
    // can't lose its user), muting requires the opt-in switch; handing the
    // user ownership/admin is harmless and follows the normal matrix.
    if (targetKey === GROUP_SELF_KEY && actorKey !== GROUP_SELF_KEY) {
        if (action === "kick") return false;
        if (action === "mute" && session.allowAdminActionsOnUser !== true) return false;
    }

    switch (action) {
        case "transfer_owner":
        case "set_admin":
        case "unset_admin": {
            if (actorRole !== "owner") return false;
            if (!isGroupMemberKey(session, targetKey)) return false;
            const targetRole = getGroupRole(session, targetKey);
            if (action === "set_admin") return targetRole === "member";
            if (action === "unset_admin") return targetRole === "admin";
            return true; // transfer_owner: any member/admin target
        }
        case "kick":
        case "mute": {
            if (!isGroupMemberKey(session, targetKey)) return false;
            const targetRole = getGroupRole(session, targetKey);
            if (targetRole === "owner") return false;
            if (actorRole === "admin" && targetRole === "admin") return false;
            if (action === "mute" && isGroupMuted(session, targetKey)) return false;
            return true;
        }
        case "unmute": {
            if (!isGroupMuted(session, targetKey)) return false;
            const targetRole = getGroupRole(session, targetKey);
            if (actorRole === "admin" && targetRole === "admin" && actorKey !== targetKey) return false;
            return true;
        }
        case "set_title": {
            // 群主改谁都行；管理员改除群主以外的人（包括自己）
            if (!isGroupMemberKey(session, targetKey)) return false;
            if (actorRole === "admin" && getGroupRole(session, targetKey) === "owner") return false;
            return true;
        }
        case "invite": {
            // Target must be an existing character not already in the group
            if (targetKey === GROUP_SELF_KEY) return false;
            if ((session.participantIds || []).includes(targetKey)) return false;
            return true;
        }
        default:
            return false;
    }
}

// ── Name resolution ────────────────────────────────────

/** Resolve a display name from AI output to a member key. Returns null if unknown. */
export function resolveGroupMemberKeyByName(
    session: ChatSession,
    name: string,
    userName: string,
    options?: { includeOutsiders?: boolean },
): string | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (trimmed === userName || trimmed === "你") return GROUP_SELF_KEY;
    const chars = loadCharacters();
    const inGroup = (session.participantIds || [])
        .map(id => chars.find(c => c.id === id))
        .find(c => c && c.name === trimmed);
    if (inGroup) return inGroup.id;
    if (options?.includeOutsiders) {
        const outsider = chars.find(c => c.name === trimmed);
        if (outsider) return outsider.id;
    }
    return null;
}

export function getGroupMemberDisplayName(key: string, userName: string): string {
    if (key === GROUP_SELF_KEY) return userName;
    const char = loadCharacters().find(c => c.id === key);
    return char?.name || "未知";
}

// ── Notice text (third person; the UI converts the user's name to 你) ──

export function buildGroupAdminNoticeText(
    action: GroupAdminAction,
    actorName: string,
    targetName: string,
    muteMinutes?: number,
    title?: string,
): string {
    switch (action) {
        case "set_title":
            if (!title) return `${actorName}取消了${targetName}的头衔`;
            return `${actorName}将${targetName}的头衔改为「${title}」`;
        case "transfer_owner":
            if (actorName === targetName) return `${actorName}收回了群主身份`;
            return `${actorName}将群主转让给了${targetName}`;
        case "set_admin": return `${actorName}将${targetName}设为了管理员`;
        case "unset_admin": return `${actorName}取消了${targetName}的管理员`;
        case "kick": return `${actorName}将${targetName}移出了群聊`;
        case "invite": return `${actorName}邀请${targetName}加入了群聊`;
        case "mute": return `${actorName}将${targetName}禁言${formatMuteDurationLabel(muteMinutes || 10)}`;
        case "unmute": return `${actorName}解除了${targetName}的禁言`;
    }
}

/**
 * Canonical protocol tag for prompt history — same bracket format the AI is
 * taught to output, so user actions and AI actions read identically in context
 * (mirrors how [A领取了B的红包] / call tags replay through history).
 */
export function buildGroupAdminBracketText(
    action: GroupAdminAction,
    actorName: string,
    targetName: string,
    muteMinutes?: number,
    title?: string,
): string {
    switch (action) {
        case "set_title":
            if (!title) return `[${actorName}取消了${targetName}的头衔]`;
            return `[${actorName}将${targetName}的头衔改为「${title}」]`;
        case "transfer_owner":
            // 上帝按钮收回群主：非协议动作，写成事实陈述即可
            if (actorName === targetName) return `[${actorName}收回了群主身份]`;
            return `[${actorName}将群主转让给了${targetName}]`;
        case "set_admin": return `[${actorName}将${targetName}设为了管理员]`;
        case "unset_admin": return `[${actorName}取消了${targetName}的管理员]`;
        case "kick": return `[${actorName}将${targetName}移出了群聊]`;
        case "invite": return `[${actorName}邀请${targetName}加入了群聊]`;
        case "mute": return `[${actorName}禁言了${targetName}:${formatMuteDurationLabel(muteMinutes || 10)}]`;
        case "unmute": return `[${actorName}解除了${targetName}的禁言]`;
    }
}

// ── Action application ─────────────────────────────────

/**
 * Apply a permitted admin action to the persisted session.
 * Does NOT check permission — call canGroupAdminAct first.
 * Returns the updated fields (also merged into the passed session object).
 */
export function applyGroupAdminAction(
    session: ChatSession,
    action: GroupAdminAction,
    actorKey: string,
    targetKey: string,
    muteMinutes?: number,
    title?: { text: string; color?: string },
): Partial<ChatSession> {
    const updates: Partial<ChatSession> = {};
    switch (action) {
        case "set_title": {
            const titles = { ...(session.groupTitles || {}) };
            const text = normalizeGroupTitle(title?.text || "");
            if (text) titles[targetKey] = { text, color: title?.color || pickGroupTitleColor(targetKey) };
            else delete titles[targetKey];
            updates.groupTitles = titles;
            break;
        }
        case "transfer_owner": {
            updates.groupOwnerId = targetKey;
            // New owner leaves the admin list; ex-owner becomes a plain member
            updates.groupAdminIds = (session.groupAdminIds || []).filter(id => id !== targetKey);
            break;
        }
        case "set_admin": {
            const admins = new Set(session.groupAdminIds || []);
            admins.add(targetKey);
            updates.groupAdminIds = [...admins];
            break;
        }
        case "unset_admin": {
            updates.groupAdminIds = (session.groupAdminIds || []).filter(id => id !== targetKey);
            break;
        }
        case "kick": {
            if (targetKey !== GROUP_SELF_KEY) {
                updates.participantIds = (session.participantIds || []).filter(id => id !== targetKey);
            }
            updates.groupAdminIds = (session.groupAdminIds || []).filter(id => id !== targetKey);
            if (session.groupMutes?.[targetKey]) {
                const mutes = { ...session.groupMutes };
                delete mutes[targetKey];
                updates.groupMutes = mutes;
            }
            if (session.groupTitles?.[targetKey]) {
                const titles = { ...session.groupTitles };
                delete titles[targetKey];
                updates.groupTitles = titles;
            }
            break;
        }
        case "invite": {
            const ids = session.participantIds || [];
            if (!ids.includes(targetKey)) updates.participantIds = [...ids, targetKey];
            break;
        }
        case "mute": {
            const until = new Date(Date.now() + (muteMinutes || 10) * 60000).toISOString();
            updates.groupMutes = { ...(session.groupMutes || {}), [targetKey]: until };
            break;
        }
        case "unmute": {
            const mutes = { ...(session.groupMutes || {}) };
            delete mutes[targetKey];
            updates.groupMutes = mutes;
            break;
        }
    }

    const sessions = loadChatSessions();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx !== -1) {
        sessions[idx] = { ...sessions[idx], ...updates };
        saveChatSessions(sessions);
    }
    Object.assign(session, updates);
    return updates;
}

/** Drop expired mute entries from storage (passive expiry). */
export function pruneExpiredGroupMutes(session: ChatSession): void {
    const mutes = session.groupMutes;
    if (!mutes) return;
    const now = Date.now();
    const active: Record<string, string> = {};
    let changed = false;
    for (const [key, until] of Object.entries(mutes)) {
        const ms = new Date(until).getTime() - now;
        if (Number.isFinite(ms) && ms > 0) active[key] = until;
        else changed = true;
    }
    if (!changed) return;
    const sessions = loadChatSessions();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx !== -1) {
        sessions[idx] = { ...sessions[idx], groupMutes: active };
        saveChatSessions(sessions);
    }
    session.groupMutes = active;
}

// ── {{groupRoster}} macro ──────────────────────────────

/**
 * Build the roster block injected via the {{groupRoster}} preset macro.
 * Pure data: who owns the group, who administrates, who is muted.
 */
export function buildGroupRosterMacro(
    session: ChatSession,
    memberNames: { id: string; name: string }[],
    userName: string,
): string {
    pruneExpiredGroupMutes(session);
    const nameOf = (key: string): string => {
        if (key === GROUP_SELF_KEY) return `${userName}（用户本人）`;
        return memberNames.find(m => m.id === key)?.name || "未知";
    };
    const ownerKey = getGroupOwnerKey(session);
    const adminKeys = (session.groupAdminIds || []).filter(key => key !== ownerKey && isGroupMemberKey(session, key));
    const allKeys: string[] = [
        ...(session.isSpectator ? [] : [GROUP_SELF_KEY]),
        ...memberNames.map(m => m.id),
    ];
    const plainKeys = allKeys.filter(key => key !== ownerKey && !adminKeys.includes(key));

    const lines: string[] = ["<group_roster>"];
    lines.push(`群主：${nameOf(ownerKey)}`);
    if (adminKeys.length > 0) lines.push(`管理员：${adminKeys.map(nameOf).join("、")}`);
    if (plainKeys.length > 0) lines.push(`普通成员：${plainKeys.map(nameOf).join("、")}`);
    const mutedEntries = Object.keys(session.groupMutes || {})
        .filter(key => isGroupMemberKey(session, key))
        .map(key => {
            const ms = getGroupMuteRemainingMs(session, key);
            return ms > 0 ? `${nameOf(key)}（剩余${formatMuteRemainingLabel(ms)}）` : "";
        })
        .filter(Boolean);
    if (mutedEntries.length > 0) {
        lines.push(`禁言中：${mutedEntries.join("、")}（被禁言者在解除前不得发出任何群消息，线下场景不受影响）`);
    }
    const titleEntries = allKeys
        .map(key => {
            const text = session.groupTitles?.[key]?.text;
            return text ? `${nameOf(key)}「${text}」` : "";
        })
        .filter(Boolean);
    if (titleEntries.length > 0) lines.push(`群头衔：${titleEntries.join("、")}`);
    lines.push("群主可以改任何人的群头衔，管理员可以改除群主以外任何人的（包括用户），不需要对方同意。格式：[A将B的头衔改为「新头衔」]（最多6个字），取消用 [A取消了B的头衔]。只在聊天里有由头时偶尔改。");
    lines.push("</group_roster>");
    return lines.join("\n");
}
