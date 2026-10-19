// 购物 app 送礼扩展的本地数据：收货地址、送礼订单标记、评价、问大家、优惠券、客服记录、
// 特殊日子、char 送礼节奏。和原来的 ShoppingState 分开存，原订单结构不动。
import { kvGet, kvSet, registerKvMigration } from "./kv-db";

const STORE_KEY = "nox_shopping_gifts_v1";
export const SHOPPING_GIFT_STORE_EVENT = "nox-shopping-gift-store-updated";
registerKvMigration(STORE_KEY);

export const USER_ADDRESS_ID = "me";

export type GiftAddress = { name: string; phone: string; address: string };

/** 订单的送礼信息。to=送给某个 char；from=某个 char 送她的 */
export type GiftOrderMeta = {
    to?: string;
    toName?: string;
    from?: string;
    fromName?: string;
    note?: string;
    share?: boolean; // 送他的：下单时分享了卡片；他送的：他当时说了
    reactedAt?: string; // 送他的：签收后已通知他
    reviewedAt?: string; // 他已写评价
    arrivedAt?: string; // 他送的：签收后已提醒她
    popupDone?: boolean; // 他送的：到货弹窗她看过了
    wishItemId?: string; // 他送的：来自她心愿单的哪一件
};

export type ProductReview = {
    id: string;
    author: string;
    stars: number;
    text: string;
    at: string;
    charId?: string; // char 写的
    gift?: boolean; // 收到的礼物
    mine?: boolean; // 她写的
};

export type ProductQA = {
    id: string;
    q: string;
    answers: { author: string; text: string }[];
    total?: number;
    mine?: boolean;
    at: string;
};

export type ProductExtras = {
    title: string;
    reviews: ProductReview[];
    qa: ProductQA[];
    generatedAt?: string;
};

export type ShoppingCoupon = {
    id: string;
    amount: number;
    label: string;
    merchant?: string;
    at: string;
    usedAt?: string;
    usedOrderId?: string;
};

export type KefuMessage = { role: "user" | "kefu"; text: string; at: string; couponId?: string };
export type KefuThread = { name: string; merchant: string; messages: KefuMessage[] };

export type SpecialDay = { id: string; charId: string; name: string; month: number; day: number };

export type WishMark = { seenBy?: string[]; giftedBy?: string; giftedName?: string; orderId?: string };

export type GiftSettings = {
    realShipping: boolean;
    allowCharGifts: boolean;
    festivalGifts: boolean;
};

export type ShoppingGiftStore = {
    addresses: Record<string, GiftAddress>;
    settings: GiftSettings;
    specialDays: SpecialDay[];
    orders: Record<string, GiftOrderMeta>;
    products: Record<string, ProductExtras>;
    coupons: ShoppingCoupon[];
    kefu: Record<string, KefuThread>;
    wish: Record<string, WishMark>;
    lastGiftAt: Record<string, string>; // charId → 上次送她礼物
    rolledOn: Record<string, string>; // charId → 当天已掷过骰子的日期
    festivalDone: Record<string, boolean>; // `${charId}:${节日key}:${年}`
};

export const DEFAULT_GIFT_SETTINGS: GiftSettings = {
    realShipping: false,
    allowCharGifts: true,
    festivalGifts: true,
};

function emptyStore(): ShoppingGiftStore {
    return {
        addresses: {},
        settings: { ...DEFAULT_GIFT_SETTINGS },
        specialDays: [],
        orders: {},
        products: {},
        coupons: [],
        kefu: {},
        wish: {},
        lastGiftAt: {},
        rolledOn: {},
        festivalDone: {},
    };
}

function obj<T>(value: unknown, fallback: T): T {
    return value && typeof value === "object" && !Array.isArray(value) ? value as T : fallback;
}

export function loadGiftStore(): ShoppingGiftStore {
    const base = emptyStore();
    if (typeof window === "undefined") return base;
    try {
        const raw = JSON.parse(kvGet(STORE_KEY) || "{}") as Partial<ShoppingGiftStore>;
        return {
            addresses: obj(raw.addresses, base.addresses),
            settings: { ...DEFAULT_GIFT_SETTINGS, ...obj(raw.settings, {}) },
            specialDays: Array.isArray(raw.specialDays) ? raw.specialDays : [],
            orders: obj(raw.orders, base.orders),
            products: obj(raw.products, base.products),
            coupons: Array.isArray(raw.coupons) ? raw.coupons : [],
            kefu: obj(raw.kefu, base.kefu),
            wish: obj(raw.wish, base.wish),
            lastGiftAt: obj(raw.lastGiftAt, base.lastGiftAt),
            rolledOn: obj(raw.rolledOn, base.rolledOn),
            festivalDone: obj(raw.festivalDone, base.festivalDone),
        };
    } catch {
        return base;
    }
}

/** 读最新的再改，避免后台服务和界面互相覆盖 */
export function updateGiftStore(mutate: (store: ShoppingGiftStore) => void): ShoppingGiftStore {
    const store = loadGiftStore();
    mutate(store);
    kvSet(STORE_KEY, JSON.stringify(store));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SHOPPING_GIFT_STORE_EVENT));
    return store;
}

export function clearGiftStore() {
    kvSet(STORE_KEY, JSON.stringify(emptyStore()));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SHOPPING_GIFT_STORE_EVENT));
}

/** 评价、问大家、客服按商品认：同名同店就是同一件（订单里的商品 id 和货架上的不一样） */
export function productKey(item: { title: string; merchantLabel?: string }): string {
    return `${(item.title || "").trim()}｜${(item.merchantLabel || "").trim()}`.slice(0, 240);
}

export function giftId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 可用的券：没用过的，金额不超过订单 */
export function bestCoupon(store: ShoppingGiftStore, total: number): ShoppingCoupon | null {
    return store.coupons
        .filter(c => !c.usedAt && c.amount > 0 && c.amount < total)
        .sort((a, b) => b.amount - a.amount)[0] ?? null;
}
