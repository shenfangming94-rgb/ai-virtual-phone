"use client";

// 音乐 app「一起听」界面：顶部两人头像 + 相距 + 一起听了多久，中间黑胶唱片，下面「音乐 / 对话」两页。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { createIdentityMatcher } from "@/lib/identity-scope";
import { loadChatSessions } from "@/lib/chat-storage";
import {
    charSpeak,
    endListening,
    formatTogether,
    isReplying,
    LISTEN_TOGETHER_EVENT,
    LISTEN_TOGETHER_OPEN_EVENT,
    loadLT,
    ltChar,
    lyricAt,
    setDistance,
    songKey,
    startListening,
    syncMemory,
    userName,
    userNote,
    userSay,
} from "@/lib/listen-together";
import { useMusicPlayer, type PlayMode } from "@/lib/music-context";
import { resolveUserIdentity } from "@/lib/settings-storage";

function useLT() {
    const [store, setStore] = useState(() => loadLT());
    const [, setBusyTick] = useState(0);
    useEffect(() => {
        const sync = () => { setStore(loadLT()); setBusyTick(t => t + 1); };
        window.addEventListener(LISTEN_TOGETHER_EVENT, sync);
        return () => window.removeEventListener(LISTEN_TOGETHER_EVENT, sync);
    }, []);
    return store;
}

const mmss = (s: number) => (!s || !isFinite(s) ? "00:00" : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

function Face({ src, me }: { src?: string | null; me?: boolean }) {
    return src ? <img className="lt-face" src={src} alt="" /> : <span className={`lt-face${me ? " lt-face-me" : ""}`} />;
}

/** 心跳线 + 小星星 */
function HeartLine() {
    return (
        <svg className="lt-heartline" viewBox="0 0 360 30" preserveAspectRatio="none" aria-hidden>
            <path d="M0 15 H70 C82 15 84 4 92 4 S100 26 108 26 S116 6 124 15 H150 C160 15 164 2 172 2 S182 28 190 28 S198 8 206 15 H226 C236 15 238 6 246 6 S254 24 262 24 S270 15 278 15 H360" />
            {[30, 196, 214, 232, 250, 268].map(x => <text key={x} x={x} y={23}>☆</text>)}
        </svg>
    );
}

const MODE_LABEL: Record<PlayMode, string> = { sequence: "顺序播放", shuffle: "随机播放", "repeat-one": "单曲循环" };

export function ListenTogetherOverlay() {
    const store = useLT();
    const player = useMusicPlayer();
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<"music" | "chat">("music");
    const [menu, setMenu] = useState(false);
    const [text, setText] = useState("");
    const [noteMode, setNoteMode] = useState(false);
    const [showQueue, setShowQueue] = useState(false);
    const [editingDistance, setEditingDistance] = useState<string | null>(null);
    const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const active = store.active;

    useEffect(() => {
        const handler = () => { setOpen(true); setMenu(false); };
        window.addEventListener(LISTEN_TOGETHER_OPEN_EVENT, handler);
        return () => window.removeEventListener(LISTEN_TOGETHER_OPEN_EVENT, handler);
    }, []);

    const char: Character | undefined = useMemo(() => (active ? loadCharacters().find(c => c.id === active.charId) : undefined), [active?.charId]); // eslint-disable-line react-hooks/exhaustive-deps
    const me = active ? resolveUserIdentity(active.charId, "chat") : null;
    const c = active ? ltChar(store, active.charId) : null;
    const track = player.currentTrack;
    const lyric = lyricAt(track, player.currentTime);
    const sessionMsgs = useMemo(() => {
        if (!c || !active) return [];
        const start = new Date(active.startedAt).getTime();
        return c.messages.filter(m => new Date(m.at).getTime() >= start);
    }, [c, active]);
    const talk = sessionMsgs.filter(m => m.role !== "system" || m.kind === "pick" || m.kind === "song");
    const notes = c && track ? c.notes[songKey(track)] || [] : [];
    const quiet = !sessionMsgs.some(m => m.role !== "system");

    useEffect(() => {
        if (tab === "chat") listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [tab, talk.length]);

    const minimize = useCallback(() => {
        setOpen(false);
        setMenu(false);
        if (active) syncMemory(active.charId, active);
    }, [active]);

    if (!open || !active || !c) return null;
    const name = char?.name || "TA";

    const send = () => {
        const value = text.trim();
        if (!value) return;
        setText("");
        if (noteMode) {
            userNote(active.charId, value);
            setNoteMode(false);
            return;
        }
        userSay(active.charId, value);
        if (replyTimer.current) clearTimeout(replyTimer.current);
        replyTimer.current = setTimeout(() => void charSpeak(active.charId, "reply"), 2500);
    };
    const nudge = () => {
        if (replyTimer.current) clearTimeout(replyTimer.current);
        const lastUser = [...sessionMsgs].reverse().find(m => m.role !== "system");
        void charSpeak(active.charId, lastUser?.role === "user" ? "reply" : "nudge");
    };
    const cycleMode = () => {
        const modes: PlayMode[] = ["sequence", "shuffle", "repeat-one"];
        player.setPlayMode(modes[(modes.indexOf(player.playMode) + 1) % modes.length]);
    };
    const progress = player.duration > 0 ? Math.min(1, player.currentTime / player.duration) : 0;
    const seekAt = (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        player.seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * (player.duration || 0));
    };
    const busy = isReplying();

    return (
        <div className="lt-root" style={track?.coverUrl ? { ["--lt-cover" as string]: `url("${track.coverUrl}")` } : undefined}>
            <div className="lt-bg" />
            <div className="lt-top">
                <button type="button" className="lt-icon-btn" aria-label="收起" onClick={minimize}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 4v15M5 12l7 7 7-7" /></svg>
                </button>
                <button type="button" className="lt-icon-btn" aria-label="更多" onClick={() => setMenu(v => !v)}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                </button>
                {menu ? (
                    <div className="lt-menu" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => { setEditingDistance(c.distance); setMenu(false); }}>修改距离</button>
                        <button type="button" onClick={() => { setMenu(false); endListening(); setOpen(false); }}>结束一起听</button>
                    </div>
                ) : null}
            </div>

            <div className="lt-head">
                <div className="lt-faces"><Face src={me?.avatarUrl} me /><Face src={char?.avatar} /></div>
                <div className="lt-names">{me?.name || userName(active.charId)} × {name}</div>
                <div className="lt-meta">
                    {editingDistance !== null ? (
                        <span className="lt-distance-edit">
                            相距 <input autoFocus inputMode="decimal" value={editingDistance} onChange={e => setEditingDistance(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))} onBlur={() => { if (editingDistance) setDistance(active.charId, editingDistance); setEditingDistance(null); }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> km
                        </span>
                    ) : (
                        <>相距 {c.distance} km，一起听了 {formatTogether(active.sec)}</>
                    )}
                </div>
                <HeartLine />
            </div>

            {tab === "music" ? (
                <div className="lt-music">
                    <div className="lt-vinyl-area" onClick={player.togglePlay}>
                        <div className="lt-vinyl" data-spinning={player.isPlaying || undefined}>
                            <div className="lt-label">
                                {track?.coverUrl ? <img src={track.coverUrl} alt="" /> : <span className="lt-label-empty">♪</span>}
                            </div>
                            <span className="lt-spindle" />
                        </div>
                        <div className="lt-arm" data-playing={player.isPlaying || undefined}>
                            <span className="lt-arm-pivot" />
                            <span className="lt-arm-rod" />
                            <span className="lt-arm-head" />
                        </div>
                    </div>
                    <div className="lt-song">
                        <div>
                            <div className="lt-song-title">{track?.title || "还没有在放歌"}</div>
                            <div className="lt-song-artist">{track?.artist || (track ? "未知歌手" : "去音乐 app 选一首，或者在对话里让 TA 选")}</div>
                        </div>
                    </div>
                    <div className="lt-lyric">{lyric || " "}</div>
                    <div className="lt-progress" onPointerDown={seekAt}>
                        <div className="lt-progress-fill" style={{ width: `${progress * 100}%` }} />
                        <div className="lt-progress-knob" style={{ left: `${progress * 100}%` }} />
                    </div>
                    <div className="lt-times"><span>{mmss(player.currentTime)}</span><span>{mmss(player.duration)}</span></div>
                    <div className="lt-controls">
                        <button type="button" className="lt-ctrl" onClick={cycleMode} aria-label={MODE_LABEL[player.playMode]} title={MODE_LABEL[player.playMode]}>
                            {player.playMode === "repeat-one" ? (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                            ) : player.playMode === "shuffle" ? (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
                            ) : (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
                            )}
                        </button>
                        <button type="button" className="lt-ctrl" aria-label="上一首" onClick={player.prev}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M6 5v14M18 5 9 12l9 7z" /></svg>
                        </button>
                        <button type="button" className="lt-play" aria-label={player.isPlaying ? "暂停" : "播放"} onClick={player.togglePlay}>
                            {player.isPlaying
                                ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="7" y="5" width="3.2" height="14" rx="1.2" /><rect x="13.8" y="5" width="3.2" height="14" rx="1.2" /></svg>
                                : <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z" /></svg>}
                        </button>
                        <button type="button" className="lt-ctrl" aria-label="下一首" onClick={player.next}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M18 5v14M6 5l9 7-9 7z" /></svg>
                        </button>
                        <button type="button" className="lt-ctrl" aria-label="播放列表" onClick={() => setShowQueue(true)}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 6h11M4 12h11M4 18h7M17 18.5a2 2 0 1 0 4 0V8l-4 1" /></svg>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="lt-chat">
                    <div className="lt-now">
                        <div className="lt-now-cover">{track?.coverUrl ? <img src={track.coverUrl} alt="" /> : "♪"}</div>
                        <div className="lt-now-info">
                            <div className="lt-now-title">{track?.title || "还没有在放歌"}</div>
                            <div className="lt-now-artist">{track?.artist || ""}</div>
                        </div>
                        <span className="lt-now-tag">正在一起听</span>
                    </div>
                    {notes.length ? (
                        <div className="lt-notes">
                            {notes.slice(-3).map((n, i) => (
                                <div key={i} className="lt-note" data-by={n.by}>
                                    <span className="lt-note-who">{n.by === "user" ? "我的歌笺" : `${name}的歌笺`}</span>
                                    {n.text}
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <div className="lt-list" ref={listRef}>
                        {quiet ? (
                            <div className="lt-quiet">
                                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" /></svg>
                                <b>这一首歌还很安静</b>
                                <span>可以在此刻留下一张歌笺，或听听 {name} 想说什么。</span>
                            </div>
                        ) : null}
                        {talk.map(m => m.role === "system" ? (
                            <div key={m.id} className="lt-sys">{m.text}</div>
                        ) : (
                            <div key={m.id} className="lt-msg" data-role={m.role} data-note={m.kind === "note" || undefined}>
                                {m.kind === "note" ? <span className="lt-msg-note">歌笺</span> : null}
                                {m.text}
                            </div>
                        ))}
                        {busy ? <div className="lt-typing">{name} 正在输入…</div> : null}
                    </div>
                    <div className="lt-input">
                        <button type="button" className="lt-spark" aria-label={`听听${name}想说什么`} disabled={busy} onClick={nudge}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z" /></svg>
                        </button>
                        <div className="lt-field">
                            {noteMode ? <button type="button" className="lt-note-chip" onClick={() => setNoteMode(false)}>歌笺 ×</button> : null}
                            <input
                                value={text}
                                placeholder={noteMode ? "写给这首歌的几句话" : "说点什么，或让 TA 选歌…"}
                                onChange={e => setText(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }}
                            />
                            <span className="lt-field-time">{mmss(player.currentTime)}</span>
                        </div>
                        <button type="button" className="lt-send" aria-label="发送" disabled={!text.trim()} onClick={send}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" /></svg>
                        </button>
                    </div>
                    {!noteMode && track ? <button type="button" className="lt-write-note" onClick={() => setNoteMode(true)}>留一张歌笺</button> : null}
                </div>
            )}

            {showQueue ? (
                <div className="lt-pick-mask" onClick={() => setShowQueue(false)}>
                    <div className="lt-pick lt-queue" onClick={e => e.stopPropagation()}>
                        <div className="lt-pick-title">播放列表</div>
                        {player.queue.length === 0 ? <div className="lt-pick-empty">列表是空的，在对话里让 {name} 选一首吧</div> : null}
                        {player.queue.map(q => (
                            <button key={q.id} type="button" className="lt-pick-item" data-current={q.id === track?.id || undefined} onClick={() => { player.playTrack(q); setShowQueue(false); }}>
                                <span className="lt-queue-title">{q.title}</span>
                                <span className="lt-queue-artist">{q.artist}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="lt-tabs">
                <button type="button" data-active={tab === "music" || undefined} onClick={() => setTab("music")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>音乐
                </button>
                <button type="button" data-active={tab === "chat" || undefined} onClick={() => setTab("chat")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" /></svg>对话
                </button>
            </div>
        </div>
    );
}

/** 音乐 app 右下角：邀请 char 一起听 / 回到正在进行的一起听 */
export function ListenTogetherEntry({ besideAddButton = false }: { besideAddButton?: boolean }) {
    const store = useLT();
    const [picking, setPicking] = useState(false);
    const active = store.active;
    const activeName = active ? loadCharacters().find(ch => ch.id === active.charId)?.name : "";
    const chars = useMemo(() => {
        if (!picking) return [];
        const matches = createIdentityMatcher();
        const all = loadCharacters();
        return loadChatSessions()
            .filter(s => !s.isGroup && !s.isBlacklisted && matches(s.contactId))
            .map(s => all.find(ch => ch.id === s.contactId))
            .filter((ch): ch is Character => Boolean(ch));
    }, [picking]);

    const invite = (charId: string) => {
        setPicking(false);
        startListening(charId, "user");
        window.dispatchEvent(new CustomEvent(LISTEN_TOGETHER_OPEN_EVENT, { detail: {} }));
        void charSpeak(charId, "greet");
    };

    return (
        <>
            <button
                type="button"
                className="lt-entry"
                data-active={active ? "" : undefined}
                data-beside={besideAddButton || undefined}
                onClick={() => active ? window.dispatchEvent(new CustomEvent(LISTEN_TOGETHER_OPEN_EVENT, { detail: {} })) : setPicking(true)}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /></svg>
                {active ? `和${activeName || "TA"}一起听中` : "一起听"}
            </button>
            {picking ? (
                <div className="lt-pick-mask" onClick={() => setPicking(false)}>
                    <div className="lt-pick" onClick={e => e.stopPropagation()}>
                        <div className="lt-pick-title">邀请谁一起听？</div>
                        {chars.length === 0 ? <div className="lt-pick-empty">还没有可以邀请的人</div> : null}
                        {chars.map(ch => (
                            <button key={ch.id} type="button" className="lt-pick-item" onClick={() => invite(ch.id)}>
                                <Face src={ch.avatar} />
                                <span>{ch.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </>
    );
}
