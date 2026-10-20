// lib/active-call.ts
// 单聊语音/视频通话挂在整个小手机最上层（GlobalCallHost），离开聊天页也不挂断。
// 聊天页只负责发起；结束时广播 ACTIVE_CALL_ENDED_EVENT，聊天页（如果开着）刷新消息。

export type ActiveCall = {
    sessionId: string;
    characterId: string;
    kind: "voice" | "video";
    initiator: "user" | "character";
    minimized: boolean;
    startedAt: number;
};

export const ACTIVE_CALL_CHANGED_EVENT = "active-call-changed";
export const ACTIVE_CALL_ENDED_EVENT = "active-call-ended";

let current: ActiveCall | null = null;

function emit(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ACTIVE_CALL_CHANGED_EVENT));
}

export function getActiveCall(): ActiveCall | null {
    return current;
}

/** 已经在通话里就不再开新的（返回 false） */
export function startActiveCall(call: Omit<ActiveCall, "minimized" | "startedAt">): boolean {
    if (current) {
        if (current.sessionId === call.sessionId && current.kind === call.kind) {
            current = { ...current, minimized: false };
            emit();
            return true;
        }
        return false;
    }
    current = { ...call, minimized: false, startedAt: Date.now() };
    emit();
    return true;
}

export function setActiveCallMinimized(minimized: boolean): void {
    if (!current || current.minimized === minimized) return;
    current = { ...current, minimized };
    emit();
}

export function endActiveCall(): void {
    if (!current) return;
    const ended = current;
    current = null;
    emit();
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(ACTIVE_CALL_ENDED_EVENT, { detail: { sessionId: ended.sessionId, kind: ended.kind } }));
    }
}
