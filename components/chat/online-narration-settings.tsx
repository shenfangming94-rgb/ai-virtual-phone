"use client";

// 聊天设置里的「线上动作描写」：开关 + 人称 / 写作要求 / 承接剧情 / 面对面

import { useState } from "react";
import { Clapperboard, type LucideIcon } from "lucide-react";

import type { ChatSession } from "@/lib/chat-storage";
import {
    getNarrationConfig,
    NARRATION_PERSON_DESC,
    NARRATION_PERSON_LABEL,
    NARRATION_STYLE_PRESETS,
    narrationSummary,
    type NarrationPerson,
    type OnlineNarrationConfig,
} from "@/lib/online-narration";
import { BINDING_ACCENTS } from "@/lib/ui-accent-colors";
import { Toggle } from "@/components/ui/form";

const PERSONS: NarrationPerson[] = ["default", "second", "third", "first"];

export function OnlineNarrationSettings({ session, updateSession, Icon }: {
    session: ChatSession;
    updateSession: (updates: Partial<ChatSession>) => void;
    Icon: React.ComponentType<{ icon: LucideIcon; color: string }>;
}) {
    const [cfg, setCfg] = useState<OnlineNarrationConfig>(() => getNarrationConfig(session));
    const [open, setOpen] = useState(false);
    const save = (patch: Partial<OnlineNarrationConfig>) => {
        const next = { ...cfg, ...patch };
        setCfg(next);
        updateSession({ onlineNarration: next });
    };
    return (
        <>
            <div className="menu-item">
                <Icon icon={Clapperboard} color={BINDING_ACCENTS.preset} />
                <div className="menu-label-group">
                    <span className="menu-label">线上模式动作描写</span>
                    <span className="menu-desc">聊天时也能写动作、神态和环境</span>
                </div>
                <div className="menu-right">
                    <Toggle checked={cfg.on} onChange={c => { save({ on: c }); if (c) setOpen(true); }} />
                </div>
            </div>
            {cfg.on ? (
                <>
                    <button type="button" className="menu-item" onClick={() => setOpen(v => !v)}>
                        <span className="narr-sub-label">动描写法</span>
                        <div className="menu-right">
                            <span className="menu-desc narr-summary">{narrationSummary(cfg)}</span>
                            <span className={`narr-caret${open ? " is-open" : ""}`}>⌄</span>
                        </div>
                    </button>
                    {open ? (
                        <div className="narr-panel">
                            <div className="narr-title">人称</div>
                            <div className="narr-seg">
                                {PERSONS.map(p => (
                                    <button type="button" key={p} className={cfg.person === p ? "on" : ""} onClick={() => save({ person: p })}>{NARRATION_PERSON_LABEL[p]}</button>
                                ))}
                            </div>
                            <div className="narr-hint">{NARRATION_PERSON_DESC[cfg.person]}</div>

                            <div className="narr-row">
                                <div className="narr-title">写作要求</div>
                                <div className="narr-chips">
                                    {NARRATION_STYLE_PRESETS.map(s => (
                                        <button type="button" key={s.label} className={cfg.style === s.text ? "on" : ""} onClick={() => save({ style: s.text })}>{s.label}</button>
                                    ))}
                                </div>
                            </div>
                            <textarea
                                className="narr-style"
                                value={cfg.style}
                                rows={3}
                                maxLength={400}
                                placeholder="想要什么样的动描，可以自己写"
                                onChange={e => setCfg({ ...cfg, style: e.target.value })}
                                onBlur={e => save({ style: e.target.value })}
                            />
                            <div className="narr-hint">只影响动描，不影响角色说的话；留空＝默认写法</div>

                            <div className="narr-line" />
                            <div className="narr-toggle">
                                <div>
                                    <b>承接剧情</b>
                                    <span>带出身边的人和突发的小事，把剧情往下推；不会替你决定言行</span>
                                </div>
                                <Toggle checked={cfg.plot} onChange={c => save({ plot: c })} />
                            </div>
                            <div className="narr-toggle">
                                <div>
                                    <b>面对面</b>
                                    <span>不再当成手机聊天：你们在同一个地方，气泡是说出口的话，旁白写现场动作。界面照旧</span>
                                </div>
                                <Toggle checked={cfg.faceToFace} onChange={c => save({ faceToFace: c })} />
                            </div>
                        </div>
                    ) : null}
                </>
            ) : null}
        </>
    );
}
