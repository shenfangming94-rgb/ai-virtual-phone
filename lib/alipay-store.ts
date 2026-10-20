// lib/alipay-store.ts
// 支付宝 app 自己的数据（钱本身在 wallet-storage，这里只放支付宝特有的东西），按用户身份分开：
// - 小荷包：她和某个 char 一起存钱，可以有好几个，封面她自己传
// - 余额宝：单独一份钱，每天按年化自动加收益
// - 她给 char 开的亲属卡：他花的从她选的账户扣
// - 每月账单评语、申请亲属卡的状态、每天的骰子

import { getCurrentIdentityId } from "./identity-scope";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadUserIdentities } from "./settings-storage";

export type PouchRecord = {
    id: string;
    /** "self" 或 characterId */
    by: string;
    amount: number;
    note?: string;
    at: string;
};

export type Pouch = {
    id: string;
    name: string;
    charId: string;
    /** media-store 引用 */
    cover?: string;
    target: number;
    balance: number;
    records: PouchRecord[];
    createdAt: string;
};

export type GivenKinCard = {
    charId: string;
    monthlyLimit: number;
    /** 他花钱从她哪个账户扣 */
    accountId: string;
    month: string;
    used: number;
    spends: { id: string; title: string; amount: number; at: string }[];
    createdAt: string;
};

export type YuebaoDay = { date: string; amount: number };

export type Yuebao = {
    balance: number;
    earned: number;
    /** 七日年化，百分比 */
    rate: number;
    /** 上次算到哪天（YYYY-MM-DD） */
    accruedTo: string;
    days: YuebaoDay[];
};

export type AlipayState = {
    pouches: Pouch[];
    given: GivenKinCard[];
    yuebao: Yuebao;
    /** `${月份}:${charId}` → 他对这个月账单的评语 */
    billNotes: Record<string, string>;
    /** charId → 申请亲属卡等他回 */
    pendingRequests: Record<string, string>;
    rolls: Record<string, string>;
};

export const ALIPAY_SELF = "self";
export const ALIPAY_UPDATED_EVENT = "alipay-updated";
const STORE_KEY = "nox_alipay_v1";
registerKvMigration(STORE_KEY);

function scopeKey(identityId?: string): string {
    if (typeof window === "undefined") return STORE_KEY;
    const id = identityId ?? getCurrentIdentityId();
    const first = loadUserIdentities()[0]?.id;
    return !id || id === first ? STORE_KEY : `${STORE_KEY}::${id}`;
}

export function newAlipayId(prefix: string): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function todayKey(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function money(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function emptyState(): AlipayState {
    return {
        pouches: [],
        given: [],
        yuebao: { balance: 0, earned: 0, rate: 1.62, accruedTo: todayKey(), days: [] },
        billNotes: {},
        pendingRequests: {},
        rolls: {},
    };
}

export function loadAlipay(identityId?: string): AlipayState {
    const base = emptyState();
    try {
        const raw = JSON.parse(kvGet(scopeKey(identityId)) || "{}") as Partial<AlipayState>;
        return {
            pouches: Array.isArray(raw.pouches) ? raw.pouches : [],
            given: Array.isArray(raw.given) ? raw.given : [],
            yuebao: { ...base.yuebao, ...(raw.yuebao || {}) },
            billNotes: raw.billNotes && typeof raw.billNotes === "object" ? raw.billNotes : {},
            pendingRequests: raw.pendingRequests && typeof raw.pendingRequests === "object" ? raw.pendingRequests : {},
            rolls: raw.rolls && typeof raw.rolls === "object" ? raw.rolls : {},
        };
    } catch {
        return base;
    }
}

export function updateAlipay(mut: (state: AlipayState) => void, identityId?: string): AlipayState {
    const state = loadAlipay(identityId);
    mut(state);
    kvSet(scopeKey(identityId), JSON.stringify(state));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ALIPAY_UPDATED_EVENT));
    return state;
}

// ── 余额宝：打开或每天 tick 时把没算的天数补上 ──

export function accrueYuebao(identityId?: string): AlipayState {
    const state = loadAlipay(identityId);
    const today = todayKey();
    if (state.yuebao.accruedTo >= today) return state;
    return updateAlipay(s => {
        const y = s.yuebao;
        const cursor = new Date(`${y.accruedTo}T00:00:00`);
        let guard = 0;
        while (todayKey(cursor) < today && guard < 400) {
            guard++;
            const day = todayKey(cursor);
            const gain = money(y.balance * (y.rate / 100) / 365);
            if (gain > 0) {
                y.balance = money(y.balance + gain);
                y.earned = money(y.earned + gain);
                y.days.unshift({ date: day, amount: gain });
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        y.days = y.days.slice(0, 60);
        y.accruedTo = today;
    }, identityId);
}

// ── 每天的骰子 ──

export function rolledToday(key: string, identityId?: string): boolean {
    return loadAlipay(identityId).rolls[key] === todayKey();
}

export function markRolled(key: string, identityId?: string): void {
    updateAlipay(s => { s.rolls[key] = todayKey(); }, identityId);
}

export function givenThisMonth(card: GivenKinCard, month: string): GivenKinCard {
    return card.month === month ? card : { ...card, month, used: 0 };
}
