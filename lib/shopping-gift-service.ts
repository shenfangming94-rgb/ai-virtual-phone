// 购物送礼后台：每 30 秒看一次包裹有没有到；char 每天最多掷一次骰子决定要不要给她买礼物；
// 他在聊天里发的 [礼物:xx] 卡片自动变成她购物 app 里的一单「他送的」。
import { bgSetInterval } from "./bg-timer";
import { loadCharacters } from "./character-storage";
import type { CheckPhoneShoppingPayload } from "./checkphone-config";
import { loadPhoneSnapshot, savePhoneSnapshot } from "./checkphone-storage";
import {
    CHAT_MESSAGE_PUSHED_EVENT,
    CHAT_REQUEST_REPLY_EVENT,
    type ChatMessage,
    createOrGetSession,
    loadChatSessions,
    pushChatMessage,
    updateMessageMediaData,
} from "./chat-storage";
import { createIdentityMatcher, getCharacterIdentityId } from "./identity-scope";
import { loadUserIdentities, resolveUserIdentity } from "./settings-storage";
import { enrichChatGift, formatYuan, pickCharGift, writeCharReview } from "./shopping-gift-engine";
import { giftId, loadGiftStore, productKey, updateGiftStore, type GiftOrderMeta } from "./shopping-gift-store";
import { loadShoppingState, saveShoppingState } from "./shopping-storage";
import type { ShoppingOrder, ShoppingProduct, ShoppingShippingEvent, ShoppingState } from "./shopping-types";

export const SHOPPING_GIFT_ARRIVED_EVENT = "nox-shopping-gift-arrived";

const TICK_MS = 30_000;
const ROLL_EVERY_MS = 10 * 60_000;
const GIFT_GAP_MS = 3 * 24 * 3600_000;

let stopTick: (() => void) | null = null;
let lastRollAt = 0;
let rolling = false;
const enriching = new Set<string>();

// ── 物流 ─────────────────────────────────────

function hash(value: string): number {
    let h = 0;
    for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
    return h;
}

function timeLabel(date: Date): string {
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 真实物流开着：20～48 小时；关着：用购物设置里的分钟数 */
export function giftShippingMinutes(orderId: string, settings: ShoppingState["settings"], identityId?: string): number {
    const real = loadGiftStore(identityId).settings.realShipping;
    const min = real ? 20 * 60 : Math.max(1, Math.min(settings.deliveryMinMinutes, settings.deliveryMaxMinutes));
    const max = real ? 48 * 60 : Math.max(min, settings.deliveryMaxMinutes);
    return min + (hash(`${orderId}:delivery`) % (max - min + 1));
}

export function buildGiftShippingTimeline(orderId: string, orderedAt: Date, totalMinutes: number): ShoppingShippingEvent[] {
    const shipped = Math.max(1, Math.floor(totalMinutes * 0.18));
    const delivering = Math.max(shipped, Math.floor(totalMinutes * 0.55));
    const at = (m: number) => new Date(orderedAt.getTime() + Math.min(m, totalMinutes) * 60_000);
    return ([
        ["ordered", "已下单", orderedAt],
        ["shipped", "已发货", at(shipped)],
        ["delivering", "配送中", at(delivering)],
        ["delivered", "已到货", at(totalMinutes)],
    ] as const).map(([status, label, date]) => ({ status, label, timeLabel: timeLabel(date), timestamp: date.toISOString() }));
}

export function deliveredAtMs(order: ShoppingOrder): number {
    const event = order.shippingTimeline?.find(e => e.status === "delivered");
    const ms = event ? new Date(event.timestamp).getTime() : NaN;
    return Number.isFinite(ms) ? ms : 0;
}

export function isDelivered(order: ShoppingOrder, now = Date.now()): boolean {
    const ms = deliveredAtMs(order);
    return ms > 0 && ms <= now;
}

/** 他送的、还没到的：她这边看不到 */
export function isHiddenIncoming(order: ShoppingOrder, meta: GiftOrderMeta | undefined, now = Date.now()): boolean {
    return Boolean(meta?.from && !meta.share && !isDelivered(order, now));
}

// ── 小工具 ───────────────────────────────────

function userName(charId?: string): string {
    try {
        return resolveUserIdentity(charId, "chat")?.name || "她";
    } catch {
        return "她";
    }
}

function charName(charId: string): string {
    return loadCharacters().find(c => c.id === charId)?.name || "TA";
}

function pushEvent(sessionId: string, visible: string, hidden: string) {
    const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
    pushChatMessage({
        sessionId,
        role: "system",
        mediaType: "system_instruction",
        mediaData: { compactSystemInstruction: true, shortTermMemoryEvent: true },
        content: `${visible}\n<hidden-system>购物：时间：${stamp}；${hidden}</hidden-system>`,
    });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
}

function requestReply(sessionId: string) {
    window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId } }));
    }, 0);
}

export function orderCardMediaData(order: ShoppingOrder, opts: { status: string; to: string; note?: string; historyText: string }): ChatMessage["mediaData"] {
    const item = order.items[0];
    return {
        appName: "购物",
        appCardTitle: order.summary,
        appHistoryText: opts.historyText,
        appCardLayout: {
            appLabel: "购物 · 订单",
            title: `${item?.previewIcon || "🎁"} ${order.summary}`,
            subtitle: `${order.totalLabel}　${item?.merchantLabel || order.merchantLabel}`,
            status: opts.status,
            rows: [
                { label: "收货人", value: opts.to },
                ...(opts.note ? [{ label: "备注", value: opts.note }] : []),
            ],
            openDisabled: true,
        },
    };
}

/** 他送的这一单写进他「查手机」的购物订单（他手机里还没生成过购物就跳过） */
async function addToCheckPhone(charId: string, order: ShoppingOrder, toName: string, note: string) {
    try {
        const snap = await loadPhoneSnapshot<CheckPhoneShoppingPayload>(charId, "shopping");
        if (!snap?.payload || !Array.isArray(snap.payload.orders)) return;
        const copy = { ...order, note: `送给${toName}${note ? `。留言：${note}` : ""}` };
        await savePhoneSnapshot({
            ...snap,
            updatedAt: new Date().toISOString(),
            payload: { ...snap.payload, orders: [copy, ...snap.payload.orders.filter(o => o.id !== order.id)].slice(0, 40) },
        });
    } catch (error) {
        console.warn("[ShoppingGift] 写进查手机失败", error);
    }
}

function buildIncomingOrder(product: ShoppingProduct, amount: number, fromName: string, note: string, state: ShoppingState, identityId?: string): ShoppingOrder {
    const now = new Date();
    const id = `shop_order_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`;
    return {
        id,
        statusLabel: "待发货",
        timeLabel: timeLabel(now),
        totalLabel: formatYuan(amount),
        merchantLabel: product.merchantLabel,
        summary: product.title,
        note: note ? `${fromName}的留言：${note}` : `${fromName}送你的礼物`,
        shippingTimeline: buildGiftShippingTimeline(id, now, giftShippingMinutes(id, state.settings, identityId)),
        paymentStatus: "paid_by_character",
        payerCharacterName: fromName,
        items: [{
            id: `${id}_item_1`,
            title: product.title,
            merchantLabel: product.merchantLabel,
            priceLabel: product.priceLabel,
            quantityLabel: "x 1",
            subtitle: product.subtitle,
            detail: product.detail,
            previewIcon: product.previewIcon,
            tone: product.tone,
        }],
    };
}

/** char 送的东西进他所属那个身份的购物 app */
function saveIncoming(order: ShoppingOrder, meta: GiftOrderMeta, charId: string, identityId?: string) {
    const state = loadShoppingState(identityId);
    saveShoppingState({ ...state, orders: [order, ...state.orders] }, identityId);
    updateGiftStore(store => {
        store.orders[order.id] = meta;
        store.lastGiftAt[charId] = new Date().toISOString();
        if (meta.wishItemId) {
            store.wish[meta.wishItemId] = { ...store.wish[meta.wishItemId], giftedBy: charId, giftedName: meta.fromName, orderId: order.id };
        }
    }, identityId);
}

function identityIds(): (string | undefined)[] {
    const ids = loadUserIdentities().map(i => i.id);
    return ids.length > 0 ? ids : [undefined];
}

// ── 签收 ─────────────────────────────────────

function handleArrivals() {
    const now = Date.now();
    for (const identityId of identityIds()) {
        const state = loadShoppingState(identityId);
        const store = loadGiftStore(identityId);
        for (const order of state.orders) {
            const meta = store.orders[order.id];
            if (!meta || !isDelivered(order, now)) continue;
            if (meta.to && !meta.reactedAt) {
                updateGiftStore(s => { s.orders[order.id] = { ...s.orders[order.id], reactedAt: new Date().toISOString() }; }, identityId);
                void giftArrivedAtChar(order, meta, identityId);
            } else if (meta.from && !meta.arrivedAt) {
                updateGiftStore(s => { s.orders[order.id] = { ...s.orders[order.id], arrivedAt: new Date().toISOString() }; }, identityId);
                giftArrivedAtUser(order, meta);
            }
        }
    }
}

async function giftArrivedAtChar(order: ShoppingOrder, meta: GiftOrderMeta, identityId?: string) {
    const charId = meta.to!;
    const name = meta.toName || charName(charId);
    const user = userName(charId);
    const session = createOrGetSession(charId);
    pushEvent(
        session.id,
        `${name}签收了你送的「${order.summary}」`,
        [
            `${user}在购物 App 给你买的「${order.summary}」（${order.totalLabel}）寄到了，你已经签收拆开。`,
            meta.share ? "她下单时就告诉你了。" : "她事先没告诉你，这是惊喜。",
            meta.note ? `包裹里有她写的备注：「${meta.note}」。` : "她没写备注，但你知道是她送的。",
            "按你的人设做出反应：可以直接来私聊她，也可以发朋友圈晒（朋友圈单独一段，格式：[朋友圈]内容[/朋友圈]），或者两样都做。只写真实发生的事。",
        ].join(""),
    );
    requestReply(session.id);

    try {
        const item = order.items[0];
        const review = item ? await writeCharReview(charId, item, meta.note || "") : null;
        if (!review || !item) return;
        updateGiftStore(s => {
            const key = productKey(item);
            const extras = s.products[key] || { title: item.title, reviews: [], qa: [] };
            extras.reviews = [{ id: giftId("rv"), author: name, stars: review.stars, text: review.text, at: new Date().toISOString(), charId, gift: true }, ...extras.reviews];
            s.products[key] = extras;
            s.orders[order.id] = { ...s.orders[order.id], reviewedAt: new Date().toISOString() };
        }, identityId);
    } catch (error) {
        console.warn("[ShoppingGift] 他写评价失败", error);
    }
}

function giftArrivedAtUser(order: ShoppingOrder, meta: GiftOrderMeta) {
    const charId = meta.from!;
    const user = userName(charId);
    const session = createOrGetSession(charId);
    pushEvent(
        session.id,
        `你收到了${meta.fromName || charName(charId)}送的「${order.summary}」`,
        `你送${user}的「${order.summary}」寄到了，她已经签收。她还没说什么，你知道包裹到了就行，不用特意提。`,
    );
    window.dispatchEvent(new CustomEvent(SHOPPING_GIFT_ARRIVED_EVENT, { detail: { orderId: order.id } }));
}

// ── 他主动送 ─────────────────────────────────

type Festival = { key: string; name: string; month: number; day: number; year?: number };

const FIXED_FESTIVALS: Festival[] = [
    { key: "valentine", name: "情人节", month: 2, day: 14 },
    { key: "520", name: "520", month: 5, day: 20 },
    { key: "christmas", name: "圣诞节", month: 12, day: 25 },
    { key: "newyear", name: "跨年", month: 12, day: 31 },
];

const LUNAR_FESTIVALS: Record<string, [number, number, number][]> = {
    七夕: [[2026, 8, 19], [2027, 8, 8], [2028, 8, 26], [2029, 8, 16], [2030, 8, 5]],
    中秋节: [[2026, 9, 25], [2027, 9, 15], [2028, 10, 3], [2029, 9, 22], [2030, 9, 12]],
    春节: [[2027, 2, 6], [2028, 1, 26], [2029, 2, 13], [2030, 2, 3]],
};

function upcomingFestival(charId: string, today: Date, identityId?: string): Festival | null {
    const store = loadGiftStore(identityId);
    const list: Festival[] = [];
    if (store.settings.festivalGifts) {
        list.push(...FIXED_FESTIVALS);
        for (const [name, dates] of Object.entries(LUNAR_FESTIVALS)) {
            for (const [year, month, day] of dates) list.push({ key: name, name, month, day, year });
        }
    }
    for (const d of store.specialDays) {
        if (d.charId === charId) list.push({ key: `day_${d.id}`, name: d.name, month: d.month, day: d.day });
    }
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    for (const f of list) {
        for (const year of f.year ? [f.year] : [today.getFullYear(), today.getFullYear() + 1]) {
            const diff = (new Date(year, f.month - 1, f.day).getTime() - start) / 86_400_000;
            if (diff >= 0 && diff <= 2) return { ...f, year };
        }
    }
    return null;
}

function localDate(d = new Date()): string {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 有私聊的 char；onlyCurrentIdentity 时只要当前身份的（购物 app 里「送给谁」用） */
export function giftableChars(onlyCurrentIdentity = false): string[] {
    const ids = new Set(loadCharacters().map(c => c.id));
    const matches = onlyCurrentIdentity ? createIdentityMatcher() : () => true;
    return loadChatSessions().filter(s => !s.isGroup && ids.has(s.contactId) && !s.isBlacklisted && matches(s.contactId)).map(s => s.contactId);
}

async function rollGifts() {
    const today = localDate();
    for (const charId of giftableChars()) {
        // 每个 char 只看他所属那个身份的开关、心愿单和送礼记录
        const identityId = getCharacterIdentityId(charId);
        const store = loadGiftStore(identityId);
        if (!store.settings.allowCharGifts) continue;
        const shopping = loadShoppingState(identityId);
        if (store.rolledOn[charId] === today) continue;
        updateGiftStore(s => { s.rolledOn[charId] = today; }, identityId);
        const last = new Date(store.lastGiftAt[charId] || 0).getTime();
        if (Date.now() - last < GIFT_GAP_MS) continue;

        const festival = upcomingFestival(charId, new Date(), identityId);
        const festivalKey = festival ? `${charId}:${festival.key}:${festival.year}` : "";
        if (festival && !store.festivalDone[festivalKey] && Math.random() < 0.6) {
            updateGiftStore(s => { s.festivalDone[festivalKey] = true; }, identityId);
            const when = festival.name;
            await fireCharGift(charId, `快到「${when}」了，你想在这天给她一份礼物。`);
            return;
        }

        const wish = shopping.savedItems.filter(item => !store.wish[item.id]?.giftedBy);
        if (wish.length > 0 && Math.random() < 0.2) {
            const seen = wish[Math.floor(Math.random() * wish.length)];
            updateGiftStore(s => {
                const mark = s.wish[seen.id] || {};
                s.wish[seen.id] = { ...mark, seenBy: Array.from(new Set([...(mark.seenBy || []), charId])) };
            }, identityId);
            if (Math.random() < 0.3) {
                await fireCharGift(charId, "你偷偷翻了她购物 App 的心愿单。", wish.slice(0, 12));
                return;
            }
        }

        if (Math.random() < 0.03) {
            await fireCharGift(charId, "没有特别的理由，就是想到她了，想给她买点东西。");
            return;
        }
    }
}

async function fireCharGift(charId: string, reason: string, wish: ShoppingProduct[] = []) {
    const pick = await pickCharGift(charId, reason, wish);
    if (!pick) return;
    const fromName = charName(charId);
    const user = userName(charId);
    const identityId = getCharacterIdentityId(charId);
    const state = loadShoppingState(identityId);
    const order = buildIncomingOrder(pick.product, pick.amount, fromName, pick.note, state, identityId);
    const wishItemId = pick.wishIndex !== undefined ? wish[pick.wishIndex]?.id : undefined;
    saveIncoming(order, { from: charId, fromName, note: pick.note, share: pick.tell, wishItemId }, charId, identityId);
    void addToCheckPhone(charId, order, user, pick.note);

    const session = createOrGetSession(charId);
    if (pick.tell) {
        pushChatMessage({
            sessionId: session.id,
            role: "assistant",
            content: "",
            mediaType: "app_card",
            mediaData: {
                ...orderCardMediaData(order, {
                    status: "已下单",
                    to: user,
                    note: pick.note,
                    historyText: `[购物订单卡片] 你在购物 App 给${user}下单了「${order.summary}」（${order.totalLabel}），寄到她那里${pick.note ? `，留言：${pick.note}` : ""}`,
                }),
                noxGiftOrderId: order.id,
            } as ChatMessage["mediaData"],
        });
        pushEvent(session.id, "", `你刚在购物 App 给${user}买了「${order.summary}」（${order.totalLabel}），订单卡片已经发给她了。起因：${reason}接着在聊天里自然地跟她说两句。`);
        requestReply(session.id);
    } else {
        pushEvent(session.id, "", `你偷偷在购物 App 给${user}买了「${order.summary}」（${order.totalLabel}），寄到她那里，想等到货给她惊喜，现在不告诉她。起因：${reason}`);
    }
}

// ── 他在聊天里发的礼物卡片 ───────────────────

async function handlePushedMessage(msg: ChatMessage) {
    if (msg.role !== "assistant" || msg.mediaType !== "gift") return;
    const d = msg.mediaData as (ChatMessage["mediaData"] & { noxGiftOrderId?: string }) | undefined;
    if (!d || d.noxGiftOrderId || d.shoppingGiftId || enriching.has(msg.id)) return;
    const session = loadChatSessions().find(s => s.id === msg.sessionId);
    if (!session || session.isGroup) return;
    const charId = session.contactId;
    const giftName = String(d.giftName || d.label || "").trim();
    if (!giftName) return;
    enriching.add(msg.id);
    try {
        const built = await enrichChatGift(charId, giftName);
        if (!built) return;
        const fromName = charName(charId);
        const identityId = getCharacterIdentityId(charId);
        const order = buildIncomingOrder(built.product, built.amount, fromName, "", loadShoppingState(identityId), identityId);
        saveIncoming(order, { from: charId, fromName, share: true }, charId, identityId);
        updateMessageMediaData(msg.id, { ...d, noxGiftOrderId: order.id } as ChatMessage["mediaData"]);
        void addToCheckPhone(charId, order, userName(charId), "");
    } catch (error) {
        console.warn("[ShoppingGift] 聊天礼物转订单失败", error);
    } finally {
        enriching.delete(msg.id);
    }
}

// ── 启动 ─────────────────────────────────────

async function tick() {
    try {
        handleArrivals();
    } catch (error) {
        console.warn("[ShoppingGift] 签收检查失败", error);
    }
    if (rolling || Date.now() - lastRollAt < ROLL_EVERY_MS) return;
    rolling = true;
    lastRollAt = Date.now();
    try {
        await rollGifts();
    } catch (error) {
        console.warn("[ShoppingGift] 送礼骰子失败", error);
    } finally {
        rolling = false;
    }
}

const onPushed = (event: Event) => {
    const msg = (event as CustomEvent<{ message?: ChatMessage }>).detail?.message;
    if (msg) void handlePushedMessage(msg);
};

export function startShoppingGiftService() {
    if (stopTick || typeof window === "undefined") return;
    // 刚打开小手机先缓一会儿再掷骰子，别和其他启动任务挤
    lastRollAt = Date.now() - ROLL_EVERY_MS + 60_000;
    stopTick = bgSetInterval(() => void tick(), TICK_MS);
    window.setTimeout(() => void tick(), 5_000);
    window.addEventListener(CHAT_MESSAGE_PUSHED_EVENT, onPushed);
    if (process.env.NODE_ENV !== "production") {
        (window as unknown as Record<string, unknown>).__noxShoppingGift = { fire: debugFireCharGift };
    }
}

export function stopShoppingGiftService() {
    stopTick?.();
    stopTick = null;
    if (typeof window !== "undefined") window.removeEventListener(CHAT_MESSAGE_PUSHED_EVENT, onPushed);
}

/** 测试用：马上让某个 char 送一份 */
export function debugFireCharGift(charId: string, reason = "测试：想给她买点东西。") {
    return fireCharGift(charId, reason, loadShoppingState(getCharacterIdentityId(charId)).savedItems.slice(0, 12));
}
