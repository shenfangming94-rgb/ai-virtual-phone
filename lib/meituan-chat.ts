// lib/meituan-chat.ts
// 美团和聊天之间的小零件（不引 AI 引擎，chat-engine / 解析器 / 气泡都能直接用）：
// - 给他的提示：聊天里可以用 [点外卖:店名:菜名/单价/数量; …:备注] 给她点外卖
// - 外卖卡片 / 团购邀请卡片的 mediaData

import type { ChatMessage } from "./chat-storage";

export type MeituanDraftItem = { name: string; price: number; qty: number };

export type MeituanCardData =
    | { kind: "order"; orderId?: string; draft?: { shop: string; items: MeituanDraftItem[]; note: string } }
    | { kind: "voucher"; voucherId: string; title: string; shopName: string; emoji: string; price: number; status?: string };

export function meituanCardMediaData(card: MeituanCardData, history: string, title: string): ChatMessage["mediaData"] {
    return {
        appName: "美团",
        appCardTitle: title,
        appHistoryText: history,
        appCardLayout: { appLabel: "美团", title, rows: [], openDisabled: true },
        noxMeituanCard: card,
    } as ChatMessage["mediaData"];
}

/** 他在聊天里发的 [点外卖:店名:菜名/单价/数量; 菜名/单价/数量:备注] */
export function parseTakeoutTag(shopRaw: string, itemsRaw: string, noteRaw?: string): { content: string; mediaType: "app_card"; mediaData: ChatMessage["mediaData"] } {
    const shop = shopRaw.trim().slice(0, 40) || "附近的店";
    const items: MeituanDraftItem[] = itemsRaw
        .split(/[;；]/)
        .map(part => part.trim())
        .filter(Boolean)
        .slice(0, 8)
        .map(part => {
            const [name, price, qty] = part.split(/[/／]/).map(x => x.trim());
            return {
                name: (name || "").slice(0, 30),
                price: Math.max(0, Math.round(Number(String(price || "").replace(/[¥￥元,\s]/g, "")) * 100) / 100) || 0,
                qty: Math.max(1, Math.min(20, Math.round(Number(qty) || 1))),
            };
        })
        .filter(item => item.name);
    const note = (noteRaw || "").trim().slice(0, 80);
    const list = items.map(i => `${i.name}×${i.qty}`).join("、");
    return {
        content: "",
        mediaType: "app_card",
        mediaData: meituanCardMediaData(
            { kind: "order", draft: { shop, items, note } },
            `[外卖] 你在美团给她点了「${shop}」的外卖：${list}${note ? `，备注：${note}` : ""}`,
            `${shop} · 外卖`,
        ),
    };
}

/** 单聊提示词里加一段：他可以给她点外卖 */
export function buildMeituanChatHint(isGroup: boolean): string {
    if (isGroup) return "";
    return [
        "",
        "",
        "### 点外卖",
        "【格式】[点外卖:店名:菜名/单价/数量; 菜名/单价/数量:备注]",
        "【规则】只在对方饿了、问吃什么或按你的人设和当下情境你真的想给对方点外卖时使用；店和菜按你的人设、消费水平和你记得的对方口味挑，单价写纯数字；外卖会由骑手送到对方的地址，备注是写给商家和骑手的话。",
        "",
    ].join("\n");
}
