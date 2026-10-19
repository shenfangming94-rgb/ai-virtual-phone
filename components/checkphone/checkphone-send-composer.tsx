"use client";

// 查手机里用他的号发消息的输入框：左边选「偷偷」/「他知道」，连发几句停 2 秒对面再一起回。
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { lastSendMode, settleThread, type SendMode } from "@/lib/checkphone-reply";

type Props = {
    charId: string;
    charName: string;
    /** 发出去：返回成功与否 */
    onAppend: (text: string, mode: SendMode) => Promise<boolean>;
    /** 停手后让对面回：texts 是这一轮她发的几句 */
    onReply: (texts: string[], mode: SendMode) => Promise<void>;
    disabledHint?: string;
    tone?: "wechat" | "sms";
};

export function CheckPhoneSendComposer({ charId, charName, onAppend, onReply, disabledHint, tone = "wechat" }: Props) {
    const [mode, setMode] = useState<SendMode>(() => lastSendMode());
    const [text, setText] = useState("");
    const [replying, setReplying] = useState(false);
    const [error, setError] = useState("");
    const batch = useRef<string[]>([]);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const modeRef = useRef(mode);
    modeRef.current = mode;

    // 离开这段聊天：「他知道」的告诉他，「偷偷」的排上发现时间
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
        if (batch.current.length) void onReply(batch.current.splice(0), modeRef.current).finally(() => settleThread(charId));
        else settleThread(charId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [charId]);

    if (disabledHint) {
        return <div className="cp-send-composer cp-send-composer--disabled" data-tone={tone}>{disabledHint}</div>;
    }

    const flush = async () => {
        const texts = batch.current.splice(0);
        if (texts.length === 0) return;
        setReplying(true);
        setError("");
        try {
            await onReply(texts, modeRef.current);
        } catch (e) {
            setError(e instanceof Error ? e.message : "对方没回");
        } finally {
            setReplying(false);
        }
    };

    const send = async () => {
        const value = text.trim();
        if (!value) return;
        setText("");
        const ok = await onAppend(value, mode);
        if (!ok) return;
        batch.current.push(value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 2000);
    };

    return (
        <div className="cp-send-composer" data-tone={tone}>
            <div className="cp-send-mode">
                {(["secret", "known"] as SendMode[]).map(m => (
                    <button key={m} type="button" data-active={mode === m || undefined} onClick={() => setMode(m)}>
                        {m === "secret" ? "偷偷" : `${charName}知道`}
                    </button>
                ))}
                <span className="cp-send-status">{replying ? "对方正在输入…" : error || `用${charName}的号发`}</span>
            </div>
            <div className="cp-send-row">
                <input
                    value={text}
                    placeholder="Type a message..."
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void send(); }}
                />
                <button type="button" className="cp-send-btn" aria-label="发送" disabled={!text.trim()} onClick={() => void send()}>
                    <Send size={16} strokeWidth={2.2} />
                </button>
            </div>
        </div>
    );
}
