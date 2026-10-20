// lib/meituan-store.ts
// 美团 app 的数据，按用户身份分开：
// - 店铺（首页默认生成的、搜出来的、他点外卖时现编的），菜单和评价打开店铺时才生成
// - 外卖订单：谁点的（她 / char）、给谁吃、地址、骑手、骑手聊天；状态按时间算
// - 团购券：她买的，能邀请 char 一起去
// 图片本体放 media-store，这里只存引用。

import { getCurrentIdentityId } from "./identity-scope";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadUserIdentities } from "./settings-storage";
import type { GiftAddress } from "./shopping-gift-store";

export const MT_SELF = "self";
export const MEITUAN_UPDATED_EVENT = "meituan-updated";

export const MT_CATEGORIES: { id: string; name: string; emoji: string }[] = [
    { id: "food", name: "美食", emoji: "🍱" },
    { id: "drink", name: "甜点饮品", emoji: "🧋" },
    { id: "fruit", name: "蔬菜水果", emoji: "🥬" },
    { id: "market", name: "超市便利", emoji: "🛒" },
    { id: "medicine", name: "看病买药", emoji: "💊" },
    { id: "flower", name: "鲜花绿植", emoji: "🌸" },
    { id: "night", name: "夜宵", emoji: "🍺" },
    { id: "errand", name: "跑腿", emoji: "🛵" },
    { id: "cake", name: "蛋糕", emoji: "🍰" },
    { id: "coffee", name: "咖啡", emoji: "☕" },
];

export type MtDish = {
    id: string;
    name: string;
    desc: string;
    price: number;
    monthly: number;
    emoji: string;
    group: string;
    img?: string;
};

export type MtReview = {
    id: string;
    name: string;
    stars: number;
    text: string;
    taste: number;
    pack: number;
    at: string;
    /** 她写的是 self，char 写的是 characterId，路人没有 */
    by?: string;
};

export type MtShop = {
    id: string;
    name: string;
    cat: string;
    emoji: string;
    rating: number;
    monthly: number;
    perCapita: number;
    eta: number;
    distance: string;
    minOrder: number;
    deliveryFee: number;
    tags: string[];
    desc: string;
    address: string;
    img?: string;
    logo?: string;
    dishes?: MtDish[];
    reviews?: MtReview[];
    reviewCount?: number;
    source: "home" | "search" | "char";
    createdAt: string;
};

export type MtItem = { name: string; qty: number; price: number; emoji: string; spec?: string };

export type MtRiderMsg = { role: "rider" | "user"; text: string; at: string };

export type MtOrder = {
    id: string;
    shopId?: string;
    shopName: string;
    shopEmoji: string;
    items: MtItem[];
    packFee: number;
    deliveryFee: number;
    discount: number;
    total: number;
    note: string;
    /** 谁点的 */
    from: string;
    /** 给谁吃 */
    to: string;
    address: GiftAddress;
    accountLabel: string;
    createdAt: string;
    acceptAt: string;
    pickAt: string;
    deliverAt: string;
    rider: { name: string; phone: string };
    riderChat: MtRiderMsg[];
    /** 骑手路上会主动说的话（到时间才出现） */
    riderScript: { at: string; text: string }[];
    review?: MtReview;
    charReview?: MtReview;
    done?: Record<string, boolean>;
    /** 发进聊天的卡片 */
    cards: { sessionId: string; messageId: string }[];
    cancelled?: boolean;
};

export type MtDeal = {
    id: string;
    shopName: string;
    title: string;
    kind: string;
    emoji: string;
    price: number;
    origin: number;
    rating: number;
    sold: string;
    desc: string;
    img?: string;
};

export type MtVoucher = {
    id: string;
    deal: MtDeal;
    boughtAt: string;
    code: string;
    usedAt?: string;
    invite?: { charId: string; state: "pending" | "yes" | "no"; reply?: string };
    review?: MtReview;
    charReview?: MtReview;
};

export type MtSettings = {
    /** 真实配送时长（25~45 分钟）；关掉就是 3~6 分钟送到 */
    realTime: boolean;
    allowCharOrders: boolean;
};

export type MeituanState = {
    shops: MtShop[];
    homeAt?: string;
    deals: MtDeal[];
    orders: MtOrder[];
    vouchers: MtVoucher[];
    settings: MtSettings;
    rolls: Record<string, string>;
    /** charId → 他上次给她点外卖的时间 */
    lastCharOrder: Record<string, string>;
};

const STORE_KEY = "nox_meituan_v1";
registerKvMigration(STORE_KEY);

function scopeKey(identityId?: string): string {
    if (typeof window === "undefined") return STORE_KEY;
    const id = identityId ?? getCurrentIdentityId();
    const first = loadUserIdentities()[0]?.id;
    return !id || id === first ? STORE_KEY : `${STORE_KEY}::${id}`;
}

export function mtId(prefix: string): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID().slice(0, 13)}`;
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function mtToday(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function emptyState(): MeituanState {
    return {
        shops: [],
        deals: [],
        orders: [],
        vouchers: [],
        settings: { realTime: true, allowCharOrders: true },
        rolls: {},
        lastCharOrder: {},
    };
}

export function loadMeituan(identityId?: string): MeituanState {
    const base = emptyState();
    if (typeof window === "undefined") return base;
    try {
        const raw = JSON.parse(kvGet(scopeKey(identityId)) || "{}") as Partial<MeituanState>;
        return {
            shops: Array.isArray(raw.shops) ? raw.shops : [],
            homeAt: raw.homeAt,
            deals: Array.isArray(raw.deals) ? raw.deals : [],
            orders: Array.isArray(raw.orders) ? raw.orders : [],
            vouchers: Array.isArray(raw.vouchers) ? raw.vouchers : [],
            settings: { ...base.settings, ...(raw.settings || {}) },
            rolls: raw.rolls && typeof raw.rolls === "object" ? raw.rolls : {},
            lastCharOrder: raw.lastCharOrder && typeof raw.lastCharOrder === "object" ? raw.lastCharOrder : {},
        };
    } catch {
        return base;
    }
}

export function updateMeituan(mut: (state: MeituanState) => void, identityId?: string): MeituanState {
    const state = loadMeituan(identityId);
    mut(state);
    // 店铺最多留 120 家（她点过的店不删）
    if (state.shops.length > 120) {
        const used = new Set(state.orders.map(o => o.shopId));
        const keep = state.shops.filter(s => used.has(s.id) || s.img || s.logo);
        const rest = state.shops.filter(s => !keep.includes(s)).slice(0, Math.max(0, 120 - keep.length));
        state.shops = [...keep, ...rest];
    }
    state.orders = state.orders.slice(0, 200);
    kvSet(scopeKey(identityId), JSON.stringify(state));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(MEITUAN_UPDATED_EVENT));
    return state;
}

export function findOrder(orderId: string): { order: MtOrder; identityId?: string } | null {
    const ids: (string | undefined)[] = [undefined, ...loadUserIdentities().map(i => i.id)];
    for (const id of ids) {
        const order = loadMeituan(id).orders.find(o => o.id === orderId);
        if (order) return { order, identityId: id };
    }
    return null;
}

// ── 订单状态：按时间算 ──

export type MtStage = "placed" | "accepted" | "delivering" | "delivered" | "cancelled";

export function orderStage(order: MtOrder, now = Date.now()): MtStage {
    if (order.cancelled) return "cancelled";
    if (now >= new Date(order.deliverAt).getTime()) return "delivered";
    if (now >= new Date(order.pickAt).getTime()) return "delivering";
    if (now >= new Date(order.acceptAt).getTime()) return "accepted";
    return "placed";
}

export const STAGE_LABEL: Record<MtStage, string> = {
    placed: "等待商家接单",
    accepted: "商家正在备餐",
    delivering: "配送中",
    delivered: "已送达",
    cancelled: "已取消",
};

/** 0~1，进度条和地图上骑手的位置 */
export function orderProgress(order: MtOrder, now = Date.now()): number {
    const start = new Date(order.createdAt).getTime();
    const end = new Date(order.deliverAt).getTime();
    return Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
}

export function deliveryTimes(realTime: boolean, base = new Date()): { acceptAt: string; pickAt: string; deliverAt: string; minutes: number } {
    const minutes = realTime ? 25 + Math.floor(Math.random() * 21) : 3 + Math.floor(Math.random() * 4);
    const t0 = base.getTime();
    const total = minutes * 60_000;
    return {
        acceptAt: new Date(t0 + total * 0.08).toISOString(),
        pickAt: new Date(t0 + total * 0.45).toISOString(),
        deliverAt: new Date(t0 + total).toISOString(),
        minutes,
    };
}

const RIDER_SURNAMES = "王李张刘陈杨赵黄周吴徐孙马朱胡郭何林罗高".split("");

export function randomRider(): { name: string; phone: string } {
    const s = RIDER_SURNAMES[Math.floor(Math.random() * RIDER_SURNAMES.length)];
    return { name: `${s}师傅`, phone: `1${3 + Math.floor(Math.random() * 6)}${Math.floor(Math.random() * 10)}****${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}` };
}

export function orderNo(id: string): string {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `3${String(h).padStart(10, "0").slice(0, 10)}${String(Date.now()).slice(-6)}`;
}

export function mtYuan(n: number): string {
    return `¥${(Math.round(n * 100) / 100).toLocaleString("zh-CN", { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 2 })}`;
}

// ── 卡片点开时要直接进订单 ──

let pendingOpen: { kind: "order" | "voucher"; id: string } | null = null;

export function setMeituanPendingOpen(target: { kind: "order" | "voucher"; id: string } | null): void {
    pendingOpen = target;
}

export function takeMeituanPendingOpen(): { kind: "order" | "voucher"; id: string } | null {
    const t = pendingOpen;
    pendingOpen = null;
    return t;
}
