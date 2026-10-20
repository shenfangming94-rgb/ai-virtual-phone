// lib/alipay-chat.ts
// 支付宝和聊天之间的小零件（不引 AI 引擎，chat-engine / 解析器 / 气泡都能直接用）：
// - 给他的提示：聊天里可以用 [亲属卡:每月额度:留言] 给她开亲属卡
// - 解析出来的卡片 mediaData

import type { ChatMessage } from "./chat-storage";
import { getCharacterIdentityId } from "./identity-scope";
import { formatWalletAmount, loadWalletState } from "./wallet-storage";

export type AlipayCardKind = "kin" | "kin_request" | "kin_given" | "pouch";

export type AlipayCardData = {
    kind: AlipayCardKind;
    title: string;
    subtitle: string;
    note?: string;
    status?: string;
    amount?: number;
    /** 支付宝自己发的卡（卡已经开好了），聊天里不用再处理 */
    applied?: boolean;
};

export function alipayCardMediaData(card: AlipayCardData, history: string): ChatMessage["mediaData"] {
    return {
        appName: "支付宝",
        appCardTitle: card.title,
        appHistoryText: history,
        appCardLayout: {
            appLabel: "支付宝",
            title: card.title,
            subtitle: card.subtitle,
            ...(card.status ? { status: card.status } : {}),
            ...(card.note ? { body: card.note } : {}),
            rows: [],
            openDisabled: true,
        },
        noxAlipayCard: card,
    } as ChatMessage["mediaData"];
}

/** 他在聊天里发的 [亲属卡:额度:留言] */
export function parseKinCardTag(amountRaw: string, noteRaw?: string): { content: string; mediaType: "app_card"; mediaData: ChatMessage["mediaData"] } {
    const amount = Math.max(0, Math.round(Number(amountRaw) * 100) / 100);
    const note = (noteRaw || "").trim().slice(0, 80);
    return {
        content: "",
        mediaType: "app_card",
        mediaData: alipayCardMediaData(
            { kind: "kin", title: "给你开了亲属卡", subtitle: `每月额度 ${formatWalletAmount(amount)}`, note, status: "已开通", amount },
            `[亲属卡] 你给她开了亲属卡，每月额度 ${formatWalletAmount(amount)}${note ? `，留言：${note}` : ""}`,
        ),
    };
}

/** 单聊提示词里加一段：他可以发亲属卡 */
export function buildAlipayChatHint(characterId: string, isGroup: boolean): string {
    if (isGroup || typeof window === "undefined") return "";
    let existing = "";
    try {
        const card = loadWalletState(getCharacterIdentityId(characterId)).cards.find(c => c.kin?.charId === characterId);
        if (card?.kin) existing = `你已经给她开过一张，每月额度 ${formatWalletAmount(card.kin.monthlyLimit)}，再发就是改额度。`;
    } catch {
        existing = "";
    }
    return [
        "",
        "",
        "### 开亲属卡",
        "【格式】[亲属卡:每月额度:留言]",
        `【规则】只在按你的人设和当下情境你真的要在支付宝给对方开亲属卡时使用；她刷这张卡从你的账户付钱；每月额度写纯数字。${existing}`,
        "",
    ].join("\n");
}
