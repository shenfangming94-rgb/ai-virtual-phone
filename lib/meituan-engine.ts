// lib/meituan-engine.ts
// 美团的 AI 部分和跟聊天的连接：
// - 生成店铺：首页默认一批、分类里再来一批、搜什么现生成；打开店铺才生成菜单和路人评价
// - 她下单：付款走钱包（余额/银行卡/亲属卡），选给谁吃、送哪；给他点的会发卡片告诉他，送到他按人设反应
// - 他给她点：聊天里发 [点外卖:…]，或者到饭点偶尔主动点；订单真的出现在她美团里，骑手送过来
// - 骑手：路上会主动说话，能和他聊天
// - 团购券：买了能邀请他一起去，他按人设决定
// 发生的事都以隐藏事件写进他私聊，进他的记忆。

import { loadCharacters } from "./character-storage";
import { sendLLMRequest } from "./chat-engine";
import {
    CHAT_MESSAGE_PUSHED_EVENT,
    CHAT_REQUEST_REPLY_EVENT,
    createOrGetSession,
    loadChatContacts,
    loadChatSessions,
    pushChatMessage,
    updateMessageMediaData,
    type ChatMessage,
    type ChatSession,
} from "./chat-storage";
import { generateGroupRawCompletion } from "./group-chat-engine";
import { getCharacterIdentityId } from "./identity-scope";
import { generateImageFromConfiguredApi } from "./image-generation-service";
import { meituanCardMediaData, type MeituanCardData, type MeituanDraftItem } from "./meituan-chat";
import {
    deliveryTimes,
    findOrder,
    loadMeituan,
    MT_CATEGORIES,
    MT_SELF,
    mtId,
    mtToday,
    orderStage,
    randomRider,
    updateMeituan,
    type MtDeal,
    type MtDish,
    type MtItem,
    type MtOrder,
    type MtReview,
    type MtShop,
    type MtVoucher,
} from "./meituan-store";
import { loadImageGenerationSettings, resolveUserIdentity } from "./settings-storage";
import { resolveShoppingApiConfig } from "./shopping-engine";
import { writeCharAddress } from "./shopping-gift-engine";
import { loadGiftStore, updateGiftStore, USER_ADDRESS_ID, type GiftAddress } from "./shopping-gift-store";
import { payWithWalletAccount } from "./wallet-storage";
import { devMyShop, myShopTick } from "./meituan-myshop";

// ── 小工具 ──

export function userName(charId?: string): string {
    try {
        return resolveUserIdentity(charId, "chat")?.name || "她";
    } catch {
        return "她";
    }
}

export function mtCharName(charId: string): string {
    return loadCharacters().find(c => c.id === charId)?.name || "他";
}

export function isFriend(charId: string): boolean {
    return loadChatContacts().some(c => c.characterId === charId);
}

function charIdOfSession(sessionId: string): string | null {
    const session = loadChatSessions().find(s => s.id === sessionId);
    if (!session || session.isGroup) return null;
    return loadChatContacts().find(c => c.id === session.contactId)?.characterId || session.contactId;
}

export function pushEvent(charId: string, visible: string, hidden: string): ChatSession {
    const session = createOrGetSession(charId);
    const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
    pushChatMessage({
        sessionId: session.id,
        role: "system",
        mediaType: "system_instruction",
        mediaData: { compactSystemInstruction: true, shortTermMemoryEvent: true },
        content: `${visible}\n<hidden-system>美团：时间：${stamp}；${hidden}</hidden-system>`,
    });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
    return session;
}

export function requestReply(sessionId: string) {
    window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId } }));
    }, 0);
}

function pushCard(charId: string, role: "user" | "assistant", card: MeituanCardData, history: string, title: string): ChatMessage {
    const session = createOrGetSession(charId);
    const msg = pushChatMessage({
        sessionId: session.id,
        role,
        content: "",
        mediaType: "app_card",
        mediaData: meituanCardMediaData(card, history, title),
    });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
    return msg;
}

export async function charGenerate(charId: string, instruction: string): Promise<string> {
    const session: ChatSession = {
        id: `meituan_${charId}_${Date.now().toString(36)}`,
        contactId: "group_meituan",
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
        isPinned: false,
        bilingualTranslationEnabled: false,
        isGroup: true,
        groupName: "美团",
        participantIds: [charId],
    };
    const task: ChatMessage = {
        id: `meituan-task-${Date.now()}`,
        sessionId: session.id,
        role: "user",
        content: `[美团App] ${instruction}`,
        status: "sent",
        createdAt: new Date().toISOString(),
    };
    const result = await generateGroupRawCompletion(session, [task], { appTags: [], appId: "meituan" });
    return result.text || "";
}

export async function llm(prompt: string): Promise<string> {
    const config = resolveShoppingApiConfig();
    if (!config) throw new Error("没有可用的 API");
    return sendLLMRequest(config, null, [{ role: "user", content: prompt }], [], { characterName: "美团App" }, { skipOutputRegex: true, appId: "meituan" });
}

export function field(text: string, name: string): string {
    return text.match(new RegExp(`${name}[：:][ \\t]*([^\\n]+)`))?.[1]?.trim() || "";
}

export function blocks(text: string, name: string): string[] {
    return text.split(new RegExp(`===\\s*${name}\\s*===`)).slice(1);
}

export function num(text: string, fallback = 0): number {
    const raw = text.replace(/[,，¥￥元\s]/g, "");
    const wan = raw.match(/(\d+(?:\.\d+)?)万/);
    if (wan) return Math.round(Number(wan[1]) * 10000);
    const n = Number(raw.match(/\d+(?:\.\d+)?/)?.[0]);
    return Number.isFinite(n) ? n : fallback;
}

export function firstEmoji(text: string, fallback: string): string {
    const m = text.match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u);
    return m?.[0] || fallback;
}

const yuan = (n: number) => `¥${(Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0)}`;

function catIdOf(name: string): string {
    const n = name.trim();
    return MT_CATEGORIES.find(c => c.name === n || n.includes(c.name) || c.name.includes(n))?.id || "food";
}

function catEmoji(id: string): string {
    return MT_CATEGORIES.find(c => c.id === id)?.emoji || "🍱";
}

// ── 地址 ──

export function myAddress(): GiftAddress {
    const a = loadGiftStore().addresses[USER_ADDRESS_ID];
    return a?.address ? a : { name: userName(), phone: "", address: "" };
}

export async function charAddress(charId: string): Promise<GiftAddress> {
    const identityId = getCharacterIdentityId(charId);
    const existing = loadGiftStore(identityId).addresses[charId];
    if (existing?.address) return existing;
    const written = await writeCharAddress(charId).catch(() => null);
    const address = written || { name: mtCharName(charId), phone: "", address: "他家" };
    updateGiftStore(s => { s.addresses[charId] = address; }, identityId);
    return address;
}

function cityHint(): string {
    const a = myAddress().address;
    return a ? `收货地址在「${a}」附近。` : "城市不限，像一座普通的中国大城市。";
}

// ── 生成店铺 ──

const SHOP_FORMAT = [
    "每家店输出：",
    "===店===",
    "名称：店名（像真实外卖平台上的店名，可以带分店名）",
    `分类：${MT_CATEGORIES.map(c => c.name).join(" / ")} 里选一个`,
    "图标：一个 emoji",
    "评分：3.8~5.0",
    "月售：数字",
    "人均：数字",
    "送达：分钟数",
    "距离：如 1.2km 或 800m",
    "起送：数字",
    "配送费：数字（免配送费写 0）",
    "优惠：1~2 个，用逗号隔开（如 满30减8，新客减5）",
    "简介：一句话",
    "地址：店铺地址（路名+门牌）",
].join("\n");

function parseShops(raw: string, source: MtShop["source"], forceCat?: string): MtShop[] {
    return blocks(raw, "店").map(b => {
        const name = field(b, "名称").slice(0, 30);
        if (!name) return null;
        const cat = forceCat || catIdOf(field(b, "分类"));
        const shop: MtShop = {
            id: mtId("shop"),
            name,
            cat,
            emoji: firstEmoji(field(b, "图标"), catEmoji(cat)),
            rating: Math.min(5, Math.max(3, num(field(b, "评分"), 4.6))),
            monthly: Math.round(num(field(b, "月售"), 500)),
            perCapita: Math.round(num(field(b, "人均"), 30)),
            eta: Math.round(num(field(b, "送达"), 30)),
            distance: field(b, "距离").slice(0, 10) || "1.0km",
            minOrder: Math.round(num(field(b, "起送"), 20)),
            deliveryFee: num(field(b, "配送费"), 0),
            tags: field(b, "优惠").split(/[,，、]/).map(t => t.trim()).filter(Boolean).slice(0, 3),
            desc: field(b, "简介").slice(0, 60),
            address: field(b, "地址").slice(0, 40),
            source,
            createdAt: new Date().toISOString(),
        };
        return shop;
    }).filter((s): s is MtShop => Boolean(s));
}

export async function generateHomeShops(): Promise<MtShop[]> {
    const raw = await llm([
        "你在扮演美团外卖 App 的推荐系统。生成附近的 14 家外卖店铺，分类要铺开：美食至少 5 家，甜点饮品、蔬菜水果、超市便利、看病买药、夜宵、蛋糕、咖啡、鲜花绿植各至少 1 家。",
        cityHint(),
        SHOP_FORMAT,
    ].join("\n"));
    const shops = parseShops(raw, "home");
    if (!shops.length) throw new Error("没生成出店铺");
    updateMeituan(s => {
        const used = new Set(s.orders.map(o => o.shopId));
        s.shops = [...shops, ...s.shops.filter(x => x.source !== "home" || used.has(x.id))];
        s.homeAt = new Date().toISOString();
    });
    return shops;
}

export async function generateCategoryShops(catId: string): Promise<MtShop[]> {
    const cat = MT_CATEGORIES.find(c => c.id === catId);
    const existing = loadMeituan().shops.filter(s => s.cat === catId).map(s => s.name);
    const raw = await llm([
        `你在扮演美团外卖 App。生成「${cat?.name || "美食"}」分类下附近的 6 家店铺，风格和价位要有区别。`,
        existing.length ? `已经有这些店，不要重复：${existing.slice(0, 20).join("、")}` : "",
        cityHint(),
        SHOP_FORMAT,
    ].filter(Boolean).join("\n"));
    const shops = parseShops(raw, "home", catId);
    updateMeituan(s => { s.shops.push(...shops); });
    return shops;
}

export async function searchShops(query: string): Promise<MtShop[]> {
    const raw = await llm([
        `你在扮演美团外卖 App 的搜索。用户搜了「${query}」，生成 5 家最贴合的附近店铺（店名、菜系、价位都要和搜的东西相关，可以有高中低档）。`,
        cityHint(),
        SHOP_FORMAT,
    ].join("\n"));
    const shops = parseShops(raw, "search");
    updateMeituan(s => { s.shops.push(...shops); });
    return shops;
}

// ── 店铺菜单 + 评价 ──

export async function generateShopMenu(shopId: string): Promise<MtShop | null> {
    const shop = loadMeituan().shops.find(s => s.id === shopId);
    if (!shop) return null;
    const raw = await llm([
        "你在扮演美团外卖 App 的店铺页。给下面这家店生成菜单和路人评价。",
        `店名：${shop.name}\n分类：${MT_CATEGORIES.find(c => c.id === shop.cat)?.name}\n人均：${shop.perCapita}\n简介：${shop.desc}`,
        shop.dishes?.length ? `店里已经有这些菜，保留并补充：${shop.dishes.map(d => d.name).join("、")}` : "",
        "菜单 8~12 道，分 3~4 个组（第一个组叫 热销）。每道菜输出：",
        "===菜===",
        "组：分组名",
        "名称：菜名",
        "介绍：一句话（可以留空）",
        "价格：数字（要和人均匹配）",
        "月售：数字",
        "图标：一个 emoji",
        "然后写 4 条路人评价，每条输出：",
        "===评价===",
        "昵称：像真实外卖用户的昵称",
        "星级：1~5",
        "内容：像真实外卖评价，具体说到菜、分量、包装、配送，有好评也可以有一条差一点的",
        "口味：1~5",
        "包装：1~5",
        "最后一行输出：评价数：数字",
    ].filter(Boolean).join("\n"));
    const dishes: MtDish[] = blocks(raw, "菜").map(b => {
        const name = field(b, "名称").slice(0, 30);
        if (!name) return null;
        return {
            id: mtId("dish"),
            name,
            desc: field(b, "介绍").replace(/^(无|空)$/, "").slice(0, 40),
            price: num(field(b, "价格"), 20),
            monthly: Math.round(num(field(b, "月售"), 100)),
            emoji: firstEmoji(field(b, "图标"), shop.emoji),
            group: field(b, "组").slice(0, 8) || "热销",
        };
    }).filter((d): d is MtDish => Boolean(d));
    const reviews: MtReview[] = blocks(raw, "评价").map(b => {
        const text = field(b, "内容");
        if (!text) return null;
        return {
            id: mtId("rv"),
            name: field(b, "昵称").slice(0, 16) || "匿名用户",
            stars: Math.min(5, Math.max(1, Math.round(num(field(b, "星级"), 5)))),
            text: text.slice(0, 160),
            taste: Math.min(5, Math.max(1, Math.round(num(field(b, "口味"), 5)))),
            pack: Math.min(5, Math.max(1, Math.round(num(field(b, "包装"), 5)))),
            at: new Date(Date.now() - Math.random() * 20 * 86400_000).toISOString(),
        };
    }).filter((r): r is MtReview => Boolean(r));
    const count = Math.round(num(field(raw, "评价数"), 300 + Math.random() * 3000));
    let next: MtShop | null = null;
    updateMeituan(s => {
        const x = s.shops.find(q => q.id === shopId);
        if (!x) return;
        const keep = (x.dishes || []).filter(d => !dishes.some(n => n.name === d.name));
        x.dishes = [...keep, ...dishes];
        x.reviews = [...(x.reviews || []).filter(r => r.by), ...reviews];
        x.reviewCount = count;
        next = x;
    });
    return next;
}

// ── 生图 ──

export function isMtImageReady(): boolean {
    return loadImageGenerationSettings().enabled === true;
}

export async function generateMtImage(description: string): Promise<string | null> {
    const result = await generateImageFromConfiguredApi({ description, people: [], appId: "meituan" });
    return result?.mediaRef || null;
}

// ── 下单 ──

function riderLines(order: MtOrder): Promise<void> {
    const toName = order.to === MT_SELF ? userName() : mtCharName(order.to);
    return llm([
        `你在扮演美团外卖骑手「${order.rider.name}」。你在送一单「${order.shopName}」的外卖（${order.items.map(i => i.name).join("、")}）给${toName}，地址：${order.address.address || "顾客家"}。${order.note ? `订单备注：${order.note}` : ""}`,
        "写你在这单路上会主动发给顾客的 1~3 条消息（像真骑手：取到餐了、快到了、门禁/找不到门/放门口、偶尔小意外），要和备注对上。",
        "每条输出一行：时机｜内容。时机只能是 取餐 / 路上 / 到了",
    ].join("\n")).then(raw => {
        const start = new Date(order.pickAt).getTime();
        const end = new Date(order.deliverAt).getTime();
        const lines = raw.split("\n").map(l => l.split(/[｜|]/)).filter(p => p.length >= 2 && p[1].trim()).slice(0, 3);
        const script = lines.map(([when, text]) => {
            const t = /取餐/.test(when) ? start + 30_000 : /到了/.test(when) ? end - 20_000 : start + (end - start) * 0.6;
            return { at: new Date(t).toISOString(), text: text.trim().slice(0, 80) };
        });
        updateMeituan(s => { const o = s.orders.find(x => x.id === order.id); if (o) o.riderScript = script; }, findOrder(order.id)?.identityId);
    }).catch(() => undefined);
}

function buildOrder(input: {
    shop: Pick<MtShop, "id" | "name" | "emoji" | "deliveryFee">;
    items: MtItem[];
    note: string;
    from: string;
    to: string;
    address: GiftAddress;
    accountLabel: string;
    discount: number;
}): MtOrder {
    const settings = loadMeituan().settings;
    const times = deliveryTimes(settings.realTime);
    const sub = input.items.reduce((s, i) => s + i.price * i.qty, 0);
    const packFee = Math.min(6, Math.max(1, Math.round(input.items.reduce((s, i) => s + i.qty, 0))));
    const total = Math.max(0, Math.round((sub + packFee + input.shop.deliveryFee - input.discount) * 100) / 100);
    return {
        id: mtId("mto"),
        shopId: input.shop.id,
        shopName: input.shop.name,
        shopEmoji: input.shop.emoji,
        items: input.items,
        packFee,
        deliveryFee: input.shop.deliveryFee,
        discount: input.discount,
        total,
        note: input.note,
        from: input.from,
        to: input.to,
        address: input.address,
        accountLabel: input.accountLabel,
        createdAt: new Date().toISOString(),
        acceptAt: times.acceptAt,
        pickAt: times.pickAt,
        deliverAt: times.deliverAt,
        rider: randomRider(),
        riderChat: [],
        riderScript: [],
        done: {},
        cards: [],
    };
}

export function orderDiscount(shop: MtShop, subtotal: number): number {
    let best = 0;
    for (const tag of shop.tags) {
        const m = tag.match(/满\s*(\d+)\s*减\s*(\d+)/);
        if (m && subtotal >= Number(m[1])) best = Math.max(best, Number(m[2]));
    }
    return best;
}

/** 她下单 */
export async function placeOrder(input: { shop: MtShop; items: MtItem[]; note: string; to: string; address: GiftAddress; accountId: string; accountLabel: string }): Promise<{ ok: boolean; order?: MtOrder; error?: string }> {
    const sub = input.items.reduce((s, i) => s + i.price * i.qty, 0);
    const order = buildOrder({ ...input, from: MT_SELF, discount: orderDiscount(input.shop, sub) });
    const paid = payWithWalletAccount({
        accountId: input.accountId,
        amount: order.total,
        title: "美团外卖",
        detail: `${input.shop.name}：${input.items.map(i => `${i.name}×${i.qty}`).join("、")}`,
        category: "外卖",
        relatedOrderId: order.id,
    });
    if (!paid.ok) return { ok: false, error: paid.error };
    updateMeituan(s => { s.orders.unshift(order); });
    void riderLines(order);
    const me = userName(input.to === MT_SELF ? undefined : input.to);
    if (input.to !== MT_SELF && isFriend(input.to)) {
        const list = order.items.map(i => `${i.name}×${i.qty}`).join("、");
        const msg = pushCard(input.to, "user", { kind: "order", orderId: order.id }, `[外卖] ${me}在美团给你点了「${order.shopName}」的外卖：${list}${order.note ? `，备注：${order.note}` : ""}，送到「${order.address.address}」`, `${order.shopName} · 外卖`);
        updateMeituan(s => { const o = s.orders.find(x => x.id === order.id); if (o) o.cards.push({ sessionId: msg.sessionId, messageId: msg.id }); });
        const session = pushEvent(input.to, "", `${me}在美团给你点了外卖：「${order.shopName}」${list}，实付 ${yuan(order.total)}${order.note ? `，备注：${order.note}` : ""}，大约 ${Math.round((new Date(order.deliverAt).getTime() - Date.now()) / 60000)} 分钟后送到「${order.address.address}」。接着在聊天里自然地回她。`);
        requestReply(session.id);
    }
    return { ok: true, order };
}

/** 他给她点（聊天里发的标签，或者主动） */
async function charPlaceOrder(charId: string, draft: { shop: string; items: MeituanDraftItem[]; note: string }): Promise<MtOrder | null> {
    const identityId = getCharacterIdentityId(charId);
    const state = loadMeituan(identityId);
    let shop = state.shops.find(s => s.name === draft.shop);
    if (!shop) {
        shop = {
            id: mtId("shop"),
            name: draft.shop,
            cat: /茶|咖啡|奶|饮|甜/.test(draft.shop) ? "drink" : /药/.test(draft.shop) ? "medicine" : /蛋糕/.test(draft.shop) ? "cake" : "food",
            emoji: "🍱",
            rating: 4.6 + Math.round(Math.random() * 3) / 10,
            monthly: 300 + Math.floor(Math.random() * 3000),
            perCapita: Math.round(draft.items.reduce((s, i) => s + i.price * i.qty, 0) / Math.max(1, draft.items.length)),
            eta: 30,
            distance: `${(0.5 + Math.random() * 3).toFixed(1)}km`,
            minOrder: 20,
            deliveryFee: 0,
            tags: [],
            desc: "",
            address: "",
            dishes: draft.items.map(i => ({ id: mtId("dish"), name: i.name, desc: "", price: i.price, monthly: 100 + Math.floor(Math.random() * 900), emoji: "🍽️", group: "热销" })),
            source: "char",
            createdAt: new Date().toISOString(),
        };
        const created = shop;
        updateMeituan(s => { s.shops.push(created); }, identityId);
    }
    const items: MtItem[] = draft.items.map(i => {
        const dish = shop!.dishes?.find(d => d.name === i.name);
        return { name: i.name, qty: i.qty, price: i.price || dish?.price || 20, emoji: dish?.emoji || shop!.emoji };
    });
    if (!items.length) return null;
    const order = buildOrder({
        shop,
        items,
        note: draft.note,
        from: charId,
        to: MT_SELF,
        address: myAddress(),
        accountLabel: `${mtCharName(charId)}付款`,
        discount: 0,
    });
    updateMeituan(s => {
        s.orders.unshift(order);
        s.lastCharOrder[charId] = order.createdAt;
    }, identityId);
    void riderLines(order);
    return order;
}

function onPushed(event: Event) {
    const msg = (event as CustomEvent<{ message?: ChatMessage }>).detail?.message;
    const card = (msg?.mediaData as { noxMeituanCard?: MeituanCardData } | undefined)?.noxMeituanCard;
    if (!msg || msg.role !== "assistant" || card?.kind !== "order" || card.orderId || !card.draft) return;
    const charId = charIdOfSession(msg.sessionId);
    if (!charId) return;
    void charPlaceOrder(charId, card.draft).then(order => {
        if (!order) return;
        updateMessageMediaData(msg.id, { ...(msg.mediaData || {}), noxMeituanCard: { ...card, orderId: order.id } } as ChatMessage["mediaData"]);
        updateMeituan(s => { const o = s.orders.find(x => x.id === order.id); if (o) o.cards.push({ sessionId: msg.sessionId, messageId: msg.id }); }, getCharacterIdentityId(charId));
        window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: msg.sessionId } }));
        pushEvent(charId, "", `你在美团下的这单已经付好款，骑手${order.rider.name}会大约在 ${new Date(order.deliverAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} 送到她那里。`);
    });
}

/** 饭点偶尔主动给她点 */
async function proactiveCharOrder(charId: string): Promise<void> {
    const me = userName(charId);
    const hour = new Date().getHours();
    const text = await charGenerate(charId, [
        `现在是 ${hour} 点。你可以在美团给${me}点一份外卖送到她那里（从你的账户付钱）。`,
        `按你的人设、你们的关系、最近的聊天和你记得的她的口味，判断你现在会不会真的给她点。大多数时候不会。`,
        `不点就只输出：不点`,
        `点就输出：`,
        `店名：店名`,
        `菜品：菜名/单价/数量; 菜名/单价/数量`,
        `备注：写给商家和骑手的话（没有就写 无）`,
        `留言：你在聊天里跟她说的一句话`,
    ].join("\n"));
    if (/^\s*不点/.test(text) || !field(text, "店名")) return;
    const draft = {
        shop: field(text, "店名").slice(0, 40),
        items: field(text, "菜品").split(/[;；]/).map(p => {
            const [name, price, qty] = p.split(/[/／]/).map(x => x.trim());
            return { name: (name || "").slice(0, 30), price: num(price || "", 0), qty: Math.max(1, Math.round(num(qty || "1", 1))) };
        }).filter(i => i.name),
        note: field(text, "备注").replace(/^无$/, "").slice(0, 80),
    };
    const order = await charPlaceOrder(charId, draft);
    if (!order) return;
    const list = order.items.map(i => `${i.name}×${i.qty}`).join("、");
    const msg = pushCard(charId, "assistant", { kind: "order", orderId: order.id }, `[外卖] 你在美团给${me}点了「${order.shopName}」的外卖：${list}${order.note ? `，备注：${order.note}` : ""}`, `${order.shopName} · 外卖`);
    updateMeituan(s => { const o = s.orders.find(x => x.id === order.id); if (o) o.cards.push({ sessionId: msg.sessionId, messageId: msg.id }); }, getCharacterIdentityId(charId));
    const say = field(text, "留言");
    const session = pushEvent(charId, "", `你刚主动在美团给${me}点了外卖：「${order.shopName}」${list}${order.note ? `，备注：${order.note}` : ""}，外卖卡片已经发给她了${say ? `，你想跟她说：${say}` : ""}。接着在聊天里自然地跟她说一声。`);
    requestReply(session.id);
}

// ── 骑手聊天 ──

export async function riderReply(orderId: string, text: string): Promise<void> {
    const hit = findOrder(orderId);
    if (!hit) return;
    const { identityId } = hit;
    updateMeituan(s => {
        const o = s.orders.find(x => x.id === orderId);
        o?.riderChat.push({ role: "user", text: text.slice(0, 200), at: new Date().toISOString() });
    }, identityId);
    const order = loadMeituan(identityId).orders.find(o => o.id === orderId)!;
    const stage = orderStage(order);
    const raw = await llm([
        `你在扮演美团外卖骑手「${order.rider.name}」，正在送「${order.shopName}」的外卖到「${order.address.address || "顾客家"}」。现在的状态：${stage === "delivered" ? "已经送到了" : stage === "delivering" ? "已取餐在路上" : "还在等商家出餐"}。${order.note ? `订单备注：${order.note}` : ""}`,
        "下面是你和顾客的聊天记录：",
        ...order.riderChat.slice(-12).map(m => `${m.role === "rider" ? "骑手" : "顾客"}：${m.text}`),
        "像真骑手那样回一两句，口语、简短、客气，可以有点赶时间。只输出你要发的话。",
    ].join("\n"));
    const reply = raw.trim().split("\n").filter(Boolean).slice(0, 2).join("\n").replace(/^骑手[：:]\s*/, "").slice(0, 120);
    if (!reply) return;
    updateMeituan(s => {
        const o = s.orders.find(x => x.id === orderId);
        o?.riderChat.push({ role: "rider", text: reply, at: new Date().toISOString() });
    }, identityId);
}

// ── 评价 ──

export function submitReview(orderId: string, review: { stars: number; taste: number; pack: number; text: string }): void {
    const hit = findOrder(orderId);
    if (!hit) return;
    const r: MtReview = { id: mtId("rv"), name: userName(), ...review, at: new Date().toISOString(), by: MT_SELF };
    updateMeituan(s => {
        const o = s.orders.find(x => x.id === orderId);
        if (!o) return;
        o.review = r;
        const shop = s.shops.find(x => x.id === o.shopId);
        if (shop) shop.reviews = [r, ...(shop.reviews || []).filter(x => x.by !== MT_SELF || x.id !== r.id)];
    }, hit.identityId);
    if (hit.order.from !== MT_SELF && isFriend(hit.order.from)) {
        pushEvent(hit.order.from, "", `${userName(hit.order.from)}给你点的那份「${hit.order.shopName}」外卖写了评价：${review.stars} 星，「${review.text}」。`);
    }
}

async function charReviewOrder(order: MtOrder, identityId?: string): Promise<void> {
    const text = await charGenerate(order.to, [
        `你收到了${userName(order.to)}在美团给你点的外卖：「${order.shopName}」${order.items.map(i => `${i.name}×${i.qty}`).join("、")}${order.note ? `，她的备注：${order.note}` : ""}。`,
        "按你的人设给这单写一条外卖评价（会显示在店铺评价区）。",
        "只输出：",
        "星级：1~5",
        "内容：评价内容",
    ].join("\n"));
    const content = field(text, "内容");
    if (!content) return;
    const r: MtReview = {
        id: mtId("rv"),
        name: mtCharName(order.to),
        stars: Math.min(5, Math.max(1, Math.round(num(field(text, "星级"), 5)))),
        text: content.slice(0, 160),
        taste: 5,
        pack: 5,
        at: new Date().toISOString(),
        by: order.to,
    };
    updateMeituan(s => {
        const o = s.orders.find(x => x.id === order.id);
        if (o) o.charReview = r;
        const shop = s.shops.find(x => x.id === order.shopId);
        if (shop) shop.reviews = [r, ...(shop.reviews || [])];
    }, identityId);
}

// ── 团购 ──

export async function generateDeals(): Promise<MtDeal[]> {
    const raw = await llm([
        "你在扮演美团的「美食团购 / 休闲玩乐」频道。生成附近 8 个团购套餐：火锅、烤肉、日料、西餐双人餐至少 4 个，电影票、密室、甜品店、KTV 里选几个。",
        cityHint(),
        "每个输出：",
        "===团购===",
        "店名：店名",
        "套餐：套餐名（如 双人套餐 / 2 张 IMAX 观影券）",
        "类型：火锅 / 烤肉 / 日料 / 西餐 / 电影 / 密室 / 甜品 / KTV 等",
        "图标：一个 emoji",
        "团购价：数字",
        "原价：数字",
        "评分：3.8~5.0",
        "已售：如 半年售 2万+",
        "包含：一句话写套餐包含什么",
    ].join("\n"));
    const deals: MtDeal[] = blocks(raw, "团购").map(b => {
        const shopName = field(b, "店名").slice(0, 30);
        if (!shopName) return null;
        return {
            id: mtId("deal"),
            shopName,
            title: field(b, "套餐").slice(0, 30) || "双人套餐",
            kind: field(b, "类型").slice(0, 6),
            emoji: firstEmoji(field(b, "图标"), "🍲"),
            price: num(field(b, "团购价"), 99),
            origin: num(field(b, "原价"), 168),
            rating: Math.min(5, Math.max(3, num(field(b, "评分"), 4.7))),
            sold: field(b, "已售").slice(0, 16),
            desc: field(b, "包含").slice(0, 60),
        };
    }).filter((d): d is MtDeal => Boolean(d));
    if (!deals.length) throw new Error("没生成出团购");
    updateMeituan(s => { s.deals = deals; });
    return deals;
}

export function buyDeal(deal: MtDeal, accountId: string): { ok: boolean; voucher?: MtVoucher; error?: string } {
    const paid = payWithWalletAccount({ accountId, amount: deal.price, title: "美团团购", detail: `${deal.shopName}：${deal.title}`, category: "团购" });
    if (!paid.ok) return { ok: false, error: paid.error };
    const voucher: MtVoucher = {
        id: mtId("vch"),
        deal,
        boughtAt: new Date().toISOString(),
        code: String(Math.floor(1e11 + Math.random() * 9e11)).replace(/(\d{4})(?=\d)/g, "$1 "),
    };
    updateMeituan(s => { s.vouchers.unshift(voucher); });
    return { ok: true, voucher };
}

export async function inviteWithVoucher(voucherId: string, charId: string): Promise<void> {
    const v = loadMeituan().vouchers.find(x => x.id === voucherId);
    if (!v || !isFriend(charId)) return;
    const me = userName(charId);
    updateMeituan(s => { const x = s.vouchers.find(q => q.id === voucherId); if (x) x.invite = { charId, state: "pending" }; });
    pushCard(charId, "user", { kind: "voucher", voucherId, title: v.deal.title, shopName: v.deal.shopName, emoji: v.deal.emoji, price: v.deal.price, status: "邀请你一起去" }, `[团购邀请] ${me}买了「${v.deal.shopName}」的${v.deal.title}，约你一起去`, `${v.deal.shopName} · ${v.deal.title}`);
    let yes = true;
    let reply = "";
    try {
        const text = await charGenerate(charId, [
            `${me}在美团买了团购「${v.deal.shopName}」的${v.deal.title}（${v.deal.desc}），约你一起去。`,
            "按你的人设、你们的关系和你最近的安排决定去不去。",
            "只输出：",
            "决定：去 或 不去",
        ].join("\n"));
        yes = !/不去/.test(field(text, "决定") || text);
    } catch {
        yes = true;
    }
    updateMeituan(s => { const x = s.vouchers.find(q => q.id === voucherId); if (x) x.invite = { charId, state: yes ? "yes" : "no", reply }; });
    const session = pushEvent(charId, "", `${me}买了「${v.deal.shopName}」的团购${v.deal.title}约你一起去，你决定${yes ? "去" : "先不去"}。接着在聊天里自然地回她。`);
    requestReply(session.id);
}

export function redeemVoucher(voucherId: string): void {
    const v = loadMeituan().vouchers.find(x => x.id === voucherId);
    if (!v) return;
    updateMeituan(s => { const x = s.vouchers.find(q => q.id === voucherId); if (x) x.usedAt = new Date().toISOString(); });
    if (v.invite?.state === "yes") {
        pushEvent(v.invite.charId, "", `你和${userName(v.invite.charId)}一起去了「${v.deal.shopName}」，用了团购${v.deal.title}。`);
    }
}

export function reviewVoucher(voucherId: string, review: { stars: number; text: string }): void {
    const v = loadMeituan().vouchers.find(x => x.id === voucherId);
    if (!v) return;
    const r: MtReview = { id: mtId("rv"), name: userName(), stars: review.stars, text: review.text, taste: review.stars, pack: review.stars, at: new Date().toISOString(), by: MT_SELF };
    updateMeituan(s => { const x = s.vouchers.find(q => q.id === voucherId); if (x) x.review = r; });
    const charId = v.invite?.state === "yes" ? v.invite.charId : "";
    if (!charId) return;
    void charGenerate(charId, [
        `你和${userName(charId)}一起去了「${v.deal.shopName}」（${v.deal.title}），她写了评价：${review.stars} 星「${review.text}」。`,
        "按你的人设也写一条团购评价。只输出：",
        "星级：1~5",
        "内容：评价内容",
    ].join("\n")).then(text => {
        const content = field(text, "内容");
        if (!content) return;
        const cr: MtReview = { id: mtId("rv"), name: mtCharName(charId), stars: Math.min(5, Math.max(1, Math.round(num(field(text, "星级"), 5)))), text: content.slice(0, 160), taste: 5, pack: 5, at: new Date().toISOString(), by: charId };
        updateMeituan(s => { const x = s.vouchers.find(q => q.id === voucherId); if (x) x.charReview = cr; });
    }).catch(() => undefined);
}

// ── 每分钟看一眼：送到了、骑手的话、饭点骰子 ──

function handleOrderEvents(identityId?: string) {
    const state = loadMeituan(identityId);
    const now = Date.now();
    for (const order of state.orders.slice(0, 30)) {
        if (order.cancelled) continue;
        // 骑手到点主动说的话
        const due = order.riderScript.filter(l => new Date(l.at).getTime() <= now && !order.riderChat.some(m => m.role === "rider" && m.text === l.text));
        if (due.length) {
            updateMeituan(s => {
                const o = s.orders.find(x => x.id === order.id);
                if (!o) return;
                for (const l of due) o.riderChat.push({ role: "rider", text: l.text, at: l.at });
                o.riderChat.sort((a, b) => a.at.localeCompare(b.at));
            }, identityId);
        }
        if (orderStage(order, now) !== "delivered" || order.done?.delivered) continue;
        updateMeituan(s => { const o = s.orders.find(x => x.id === order.id); if (o) o.done = { ...(o.done || {}), delivered: true }; }, identityId);
        if (now - new Date(order.deliverAt).getTime() > 6 * 3600_000) continue;
        const list = order.items.map(i => `${i.name}×${i.qty}`).join("、");
        if (order.from !== MT_SELF && order.to === MT_SELF && isFriend(order.from)) {
            const me = userName(order.from);
            const session = pushEvent(order.from, `${mtCharName(order.from)} 给你点的外卖已送达`, `你给${me}点的外卖「${order.shopName}」${list}已经送到她手里了。可以在聊天里自然地问一句或说点什么，也可以不提。`);
            if (Math.random() < 0.5) requestReply(session.id);
        } else if (order.to !== MT_SELF && isFriend(order.to)) {
            const me = userName(order.to);
            const session = pushEvent(order.to, `给 ${mtCharName(order.to)} 点的外卖已送达`, `${me}给你点的外卖「${order.shopName}」${list}送到了，你收到了${order.note ? `，她的备注：${order.note}` : ""}。按你的人设在聊天里自然地反应。`);
            requestReply(session.id);
            void charReviewOrder(order, identityId).catch(() => undefined);
        } else if (order.from === MT_SELF && order.to === MT_SELF) {
            // 她自己点的，他不知道也行；记一笔进最近的那个人的记忆里太多余，这里不写
        }
    }
}

const MEAL_WINDOWS: [number, number, string][] = [[11, 13, "lunch"], [17, 20, "dinner"], [22, 25, "night"]];

async function rollProactive(): Promise<void> {
    const hour = new Date().getHours();
    const h = hour < 4 ? hour + 24 : hour;
    const win = MEAL_WINDOWS.find(([a, b]) => h >= a && h < b);
    if (!win) return;
    for (const contact of loadChatContacts()) {
        const charId = contact.characterId;
        const identityId = getCharacterIdentityId(charId);
        const state = loadMeituan(identityId);
        if (!state.settings.allowCharOrders) continue;
        const key = `order:${charId}:${win[2]}`;
        if (state.rolls[key] === mtToday()) continue;
        updateMeituan(s => { s.rolls[key] = mtToday(); }, identityId);
        const last = state.lastCharOrder[charId];
        if (last && Date.now() - new Date(last).getTime() < 2 * 86400_000) continue;
        if (Math.random() >= 0.05) continue;
        await proactiveCharOrder(charId).catch(e => console.warn("[Meituan] proactive failed:", e));
    }
}

let ticking = false;

export async function meituanTick(): Promise<void> {
    if (ticking || typeof window === "undefined") return;
    ticking = true;
    try {
        const ids = new Set<string | undefined>([undefined, ...loadChatContacts().map(c => getCharacterIdentityId(c.characterId))]);
        for (const id of ids) handleOrderEvents(id);
        await rollProactive();
        await myShopTick(ids);
    } finally {
        ticking = false;
    }
}

let stopTimer: (() => void) | null = null;

export function startMeituanService(): void {
    if (stopTimer || typeof window === "undefined") return;
    window.addEventListener(CHAT_MESSAGE_PUSHED_EVENT, onPushed);
    const first = window.setTimeout(() => void meituanTick(), 20_000);
    const every = window.setInterval(() => void meituanTick(), 60_000);
    if (process.env.NODE_ENV !== "production") {
        (window as unknown as Record<string, unknown>).__noxMeituan = {
            tick: meituanTick,
            proactive: proactiveCharOrder,
            state: () => loadMeituan(),
            arrive: (orderId: string) => {
                const hit = findOrder(orderId);
                updateMeituan(s => { const o = s.orders.find(x => x.id === orderId); if (o) { const t = new Date(Date.now() - 1000).toISOString(); o.deliverAt = t; o.pickAt = t; o.acceptAt = t; } }, hit?.identityId);
                return meituanTick();
            },
            deals: generateDeals,
            myshop: devMyShop(),
        };
    }
    stopTimer = () => {
        window.removeEventListener(CHAT_MESSAGE_PUSHED_EVENT, onPushed);
        window.clearTimeout(first);
        window.clearInterval(every);
    };
}
