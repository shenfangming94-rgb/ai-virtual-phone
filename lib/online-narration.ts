// lib/online-narration.ts
// 线上聊天的动作描写（旁白）：每个单聊自己开关。
// 开了以后角色除了发消息，还能单独写一段 [旁白] 动作/神态/环境，聊天里居中显示成斜体灰字。
// 可选人称、写作要求、承接剧情、面对面（不当成手机聊天）。

import type { ChatSession } from "./chat-storage";

export type NarrationPerson = "default" | "second" | "third" | "first";

export type OnlineNarrationConfig = {
    on: boolean;
    person: NarrationPerson;
    /** 写作要求，空=默认写法 */
    style: string;
    /** 承接剧情：带出身边的人和突发事件 */
    plot: boolean;
    /** 面对面：不当成手机聊天 */
    faceToFace: boolean;
};

export const DEFAULT_NARRATION: OnlineNarrationConfig = { on: false, person: "default", style: "", plot: false, faceToFace: false };

export const NARRATION_PERSON_LABEL: Record<NarrationPerson, string> = {
    default: "默认",
    second: "第二人称",
    third: "第三人称",
    first: "第一人称",
};

export const NARRATION_PERSON_DESC: Record<NarrationPerson, string> = {
    default: "按人设和世界书来",
    second: "称你为「你」，角色用名字或他/她；优先于人设和世界书",
    third: "你和角色都用名字或他/她；优先于人设和世界书",
    first: "角色用「我」写自己，称你为「你」；优先于人设和世界书",
};

export const NARRATION_STYLE_PRESETS: { label: string; text: string }[] = [
    { label: "短句", text: "每段一两句，干净利落，只写最关键的一个动作或神态。" },
    { label: "中段", text: "每段 50～100 字：动作、神态带一点环境，节奏自然。" },
    { label: "长段落", text: "每段 100～200 字的细腻长段落：像镜头一样先交代环境，再落到人物的动作和微表情，感官细节层层铺开，节奏有留白。" },
];

export function getNarrationConfig(session: Pick<ChatSession, "onlineNarration"> | null | undefined): OnlineNarrationConfig {
    return { ...DEFAULT_NARRATION, ...(session?.onlineNarration || {}) };
}

export function narrationSummary(cfg: OnlineNarrationConfig): string {
    if (!cfg.on) return "关闭";
    return [
        cfg.person !== "default" ? NARRATION_PERSON_LABEL[cfg.person] : "",
        cfg.style.trim() ? "有写作要求" : "",
        cfg.plot ? "承接剧情" : "",
        cfg.faceToFace ? "面对面" : "",
    ].filter(Boolean).join(" · ") || "默认写法";
}

/** 附在提示词最后的一段（单聊、开了才有） */
export function buildOnlineNarrationPrompt(cfg: OnlineNarrationConfig, charName: string, userName: string): string {
    if (!cfg.on) return "";
    const person = cfg.person === "second"
        ? `旁白用第二人称：称${userName}为「你」，${charName}用名字或「他/她」。`
        : cfg.person === "third"
            ? `旁白用第三人称：${userName}和${charName}都用名字或「他/她」。`
            : cfg.person === "first"
                ? `旁白用第一人称：${charName}用「我」写自己，称${userName}为「你」。`
                : "";
    return [
        "【动作描写（本聊天已开启，优先于前面关于消息长度、只发聊天消息、不写动作描写的要求）】",
        `- 除了聊天消息，你可以写旁白：单独成段，以 [旁白] 开头，写${charName}此刻的动作、神态和周围的环境，和聊天消息之间空一行。`,
        "- 旁白不受单条消息字数的限制。旁白和说的话穿插着写：说一两句之后动作、神态有了变化就再接一段旁白，一次回复通常两三段，不要只在开头写一段。聊天消息照常按原来的格式写。",
        "- 旁白只写你这边看得到的东西，不替对方说话、不替对方做决定、不写对方的心理。",
        person ? `- ${person}` : "",
        cfg.style.trim() ? `- 旁白的写作要求（只管旁白，不影响说的话）：${cfg.style.trim()}` : "",
        cfg.plot ? "- 承接剧情：旁白可以带出身边的人和突发的小事，把剧情往下推，但不替对方决定言行。" : "",
        cfg.faceToFace
            ? `- 你们现在在同一个地方面对面：聊天消息是${charName}当面说出口的话，不是在手机上打字；不要提在手机上聊天、打字、发消息。`
            : "",
    ].filter(Boolean).join("\n");
}

const NARRATION_SEGMENT_RE = /^[\[【]\s*旁白\s*[\]】]\s*[:：]?\s*([\s\S]+)$/;

/** 一段回复是不是旁白，是就返回正文 */
export function matchNarrationSegment(segment: string): string | null {
    const m = segment.trim().match(NARRATION_SEGMENT_RE);
    const body = m?.[1]?.trim();
    return body ? body : null;
}
