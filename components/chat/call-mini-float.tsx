"use client";

import { useRef, useState, type PointerEvent } from "react";

// 通话缩小后挂在屏幕边上的小卡片（仿微信）：语音=头像+计时，视频=竖的小画面+计时。
// 可以拖到任何位置，点一下回到通话。没看的句数显示红点，他在说话时头像外圈亮绿。

let lastPosition: { x: number; y: number } | null = null;

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CallMiniFloat({
    kind,
    name,
    avatar,
    background,
    duration,
    connecting,
    unseen,
    speaking,
    onRestore,
}: {
    kind: "voice" | "video";
    name: string;
    avatar?: string | null;
    background?: string | null;
    duration: number;
    connecting: boolean;
    unseen: number;
    speaking: boolean;
    onRestore?: () => void;
}) {
    const [pos, setPos] = useState(lastPosition);
    const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean; id: number } | null>(null);
    const elRef = useRef<HTMLButtonElement>(null);

    const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
        const el = elRef.current;
        const parent = el?.offsetParent as HTMLElement | null;
        if (!el || !parent) return;
        const rect = el.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            originX: rect.left - parentRect.left,
            originY: rect.top - parentRect.top,
            moved: false,
            id: e.pointerId,
        };
        el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        const el = elRef.current;
        const parent = el?.offsetParent as HTMLElement | null;
        if (!drag || !el || !parent || drag.id !== e.pointerId) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        const maxX = parent.clientWidth - el.offsetWidth - 6;
        const maxY = parent.clientHeight - el.offsetHeight - 6;
        const next = {
            x: Math.min(Math.max(6, drag.originX + dx), maxX),
            y: Math.min(Math.max(30, drag.originY + dy), maxY),
        };
        lastPosition = next;
        setPos(next);
    };
    const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag || drag.id !== e.pointerId) return;
        if (!drag.moved) onRestore?.();
    };

    const time = connecting ? "等待中" : formatTime(duration);
    return (
        <button
            ref={elRef}
            type="button"
            className="call-mini-float"
            data-kind={kind}
            style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragRef.current = null; }}
            aria-label={`返回与${name}的${kind === "voice" ? "语音" : "视频"}通话`}
        >
            {kind === "video" ? (
                <>
                    <span className="call-mini-float-video" style={{ backgroundImage: `url(${background || avatar || ""})` }} />
                    <span className="call-mini-float-time">{time}</span>
                </>
            ) : (
                <>
                    <span className="call-mini-float-avatar" data-speaking={speaking ? "" : undefined}>
                        {avatar ? <img src={avatar} alt="" /> : <span>{name.slice(0, 1)}</span>}
                    </span>
                    <span className="call-mini-float-time">{time}</span>
                </>
            )}
            {unseen > 0 && <span className="call-mini-float-dot">{unseen > 99 ? "99+" : unseen}</span>}
        </button>
    );
}
