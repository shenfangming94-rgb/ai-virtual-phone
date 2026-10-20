"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChatSessions } from "@/lib/chat-storage";
import { loadCharacters } from "@/lib/character-storage";
import {
    ACTIVE_CALL_CHANGED_EVENT,
    endActiveCall,
    getActiveCall,
    setActiveCallMinimized,
    type ActiveCall,
} from "@/lib/active-call";
import { VoiceCallScreen } from "./voice-call-screen";
import { VideoCallScreen } from "./video-call-screen";

/** 挂在小手机屏幕最上层：通话全屏或缩成边上的小卡片，切 app 不断 */
export function GlobalCallHost() {
    const [call, setCall] = useState<ActiveCall | null>(() => getActiveCall());
    useEffect(() => {
        const sync = () => setCall(getActiveCall());
        window.addEventListener(ACTIVE_CALL_CHANGED_EVENT, sync);
        return () => window.removeEventListener(ACTIVE_CALL_CHANGED_EVENT, sync);
    }, []);

    // 通话开始时取一次会话和角色，通话过程中保持同一个对象（避免组件重挂断线）
    const callKey = call ? `${call.sessionId}:${call.kind}:${call.startedAt}` : "";
    const resolved = useMemo(() => {
        if (!call) return null;
        const session = loadChatSessions().find(s => s.id === call.sessionId);
        const character = loadCharacters().find(c => c.id === call.characterId);
        return session && character ? { session, character } : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callKey]);

    useEffect(() => {
        if (call && !resolved) endActiveCall();
    }, [call, resolved]);

    if (!call || !resolved) return null;
    const Screen = call.kind === "voice" ? VoiceCallScreen : VideoCallScreen;
    return (
        <div className="global-call-host" data-minimized={call.minimized ? "" : undefined}>
            <Screen
                key={callKey}
                session={resolved.session}
                character={resolved.character}
                initiator={call.initiator}
                minimized={call.minimized}
                onMinimize={() => setActiveCallMinimized(true)}
                onRestore={() => setActiveCallMinimized(false)}
                onEnd={() => endActiveCall()}
            />
        </div>
    );
}
