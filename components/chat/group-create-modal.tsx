"use client";

import { useState } from "react";
import { loadChatContacts } from "@/lib/chat-storage";
import { loadCharacters } from "@/lib/character-storage";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { Character } from "@/lib/character-types";
import { Input } from "@/components/ui/form";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";

type GroupCreateModalProps = {
    onClose: () => void;
    onCreate: (groupName: string, participantIds: string[], isSpectator: boolean) => void;
};

export function GroupCreateModal({ onClose, onCreate }: GroupCreateModalProps) {
    const [step, setStep] = useState<"pick" | "name">("pick");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [groupName, setGroupName] = useState("");
    const [isSpectator, setIsSpectator] = useState(false);

    const contacts = loadChatContacts();
    const chars = loadCharacters();

    const enriched = contacts
        .map(c => ({ ...c, char: chars.find(ch => ch.id === c.characterId) }))
        .filter(c => c.char) as (typeof contacts[number] & { char: Character })[];
    // 不加好友也能拉进群：档案库里其他人
    const friendIds = new Set(enriched.map(c => c.characterId));
    const archiveChars = chars.filter(c => !friendIds.has(c.id));

    const toggle = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectedChars = [...selectedIds]
        .map(id => chars.find(c => c.id === id))
        .filter(Boolean) as Character[];

    const userName = resolveUserIdentity(undefined, "group_chat")?.name || "我";
    const defaultName = isSpectator
        ? selectedChars.map(c => c.name).join("、")
        : [...selectedChars.map(c => c.name), userName].join("、");

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                {step === "pick" ? (
                    <>
                        <span className="modal-header-title">选择群成员</span>
                        {enriched.length === 0 && archiveChars.length === 0 ? (
                            <span className="menu-desc">档案库里还没有角色</span>
                        ) : (
                            <div className="group-create-pick-scroll">
                                {[
                                    { title: "好友", list: enriched.map(c => c.char) },
                                    { title: "档案库（不用加好友）", list: archiveChars },
                                ].filter(section => section.list.length > 0).map(section => (
                                    <div key={section.title} className="w-full">
                                        <div className="group-create-section-title">{section.title}</div>
                                        <div className="chat-contact-list">
                                            {section.list.map(char => {
                                                const isSelected = selectedIds.has(char.id);
                                                return (
                                                    <div
                                                        key={char.id}
                                                        className="chat-contact-item"
                                                        onClick={() => toggle(char.id)}
                                                    >
                                                        <div className="chat-contact-avatar" style={isSelected ? { outline: "3px solid var(--c-success)", outlineOffset: "2px" } : undefined}>
                                                            {char.avatar ? (
                                                                <img src={char.avatar} alt="" />
                                                            ) : (
                                                                <ChatFallbackAvatar />
                                                            )}
                                                        </div>
                                                        <span className="chat-contact-name">{char.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {selectedIds.size >= 2 && (
                            <button
                                onClick={() => setStep("name")}
                                className="ui-btn ui-btn-success w-full"
                            >
                                下一步 ({selectedIds.size} 人)
                            </button>
                        )}
                        {selectedIds.size === 1 && (
                            <p className="ts-12 text-[var(--c-icon)] text-center m-0">至少选择 2 位成员</p>
                        )}
                    </>
                ) : (
                    <>
                        <span className="modal-header-title">群聊名称</span>
                        <div className="w-full">
                            <Input
                                autoFocus
                                value={groupName}
                                onChange={e => setGroupName(e.target.value)}
                                placeholder={defaultName || "请输入群名"}
                                className="ui-input w-full"
                            />
                        </div>
                        <div className="chat-contact-list">
                            {selectedChars.map(c => (
                                <div key={c.id} className="chat-contact-item">
                                    <div className="chat-contact-avatar">
                                        {c.avatar ? (
                                            <img src={c.avatar} alt="" />
                                        ) : (
                                            <ChatFallbackAvatar />
                                        )}
                                    </div>
                                    <span className="chat-contact-name">{c.name}</span>
                                </div>
                            ))}
                        </div>
                        <label
                            className="flex items-start gap-2 w-full cursor-pointer select-none"
                            onClick={() => setIsSpectator(prev => !prev)}
                        >
                            <input
                                type="checkbox"
                                checked={isSpectator}
                                onChange={() => {}}
                                className="mt-[3px] shrink-0"
                            />
                            <span className="ts-13 text-[var(--c-text)]">
                                围观模式：我不加入群聊
                                <span className="block ts-12 text-[var(--c-icon)]">只围观他们自己聊天，你不能发言，群主是第一位成员</span>
                            </span>
                        </label>
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={() => setStep("pick")}
                                className="ui-btn ui-btn-ghost flex-1"
                            >
                                返回
                            </button>
                            <button
                                onClick={() => onCreate(groupName.trim() || defaultName, [...selectedIds], isSpectator)}
                                className="ui-btn ui-btn-success flex-1"
                            >
                                创建
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
