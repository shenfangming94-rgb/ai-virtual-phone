// lib/alipay-engine.ts
// 支付宝的 AI 部分和跟聊天的连接：
// - 她申请亲属卡：聊天里发申请卡片，他按人设决定开不开、开多少；他也会偶尔主动开
// - 她刷他给的亲属卡：他收到提醒，在聊天里按人设反应
// - 她给他开亲属卡：他偶尔用它买东西，从她选的账户扣
// - 小荷包：她邀请他一起存，他偶尔往里存钱留一句
// - 账单：他看她这个月的账单写一句
// - 从支付宝给他转账：发一张普通转账消息
// 发生的事都以隐藏事件写进他私聊，进他的记忆。

import { loadCharacters } from "./character-storage";
import {
    CHAT_REQUEST_REPLY_EVENT,
    createOrGetSession,
    loadChatContacts,
    pushChatMessage,
    type ChatMessage,
    type ChatSession,
} from "./chat-storage";
import { generateGroupRawCompletion } from "./group-chat-engine";
import { createIdentityMatcher, getCharacterIdentityId } from "./identity-scope";
import { resolveUserIdentity } from "./settings-storage";
import {
    accrueYuebao,
    ALIPAY_SELF,
    givenThisMonth,
    loadAlipay,
    markRolled,
    newAlipayId,
    rolledToday,
    updateAlipay,
    type Pouch,
} from "./alipay-store";
import {
    currentMonthKey,
    formatWalletAmount,
    loadWalletState,
    payWithWalletAccount,
    upsertKinCard,
    WALLET_KIN_SPENT_EVENT,
    walletTransact,
} from "./wallet-storage";

function userName(charId?: string): string {
    try {
        return resolveUserIdentity(charId, "chat")?.name || "她";
    } catch {
        return "她";
    }
}

export function charName(charId: string): string {
    return loadCharacters().find(c => c.id === charId)?.name || "他";
}

function isFriend(charId: string): boolean {
    return loadChatContacts().some(c => c.characterId === charId);
}

/** 当前身份下的好友（选人用） */
export function alipayFriends(): { id: string; name: string; avatar?: string | null }[] {
    const matches = createIdentityMatcher();
    const chars = loadCharacters();
    return loadChatContacts()
        .filter(c => matches(c.characterId))
        .map(c => chars.find(ch => ch.id === c.characterId))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map(c => ({ id: c.id, name: c.name, avatar: c.avatar }));
}

function pushEvent(charId: string, visible: string, hidden: string): ChatSession {
    const session = createOrGetSession(charId);
    const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
    pushChatMessage({
        sessionId: session.id,
        role: "system",
        mediaType: "system_instruction",
        mediaData: { compactSystemInstruction: true, shortTermMemoryEvent: true },
        content: `${visible}\n<hidden-system>支付宝：时间：${stamp}；${hidden}</hidden-system>`,
    });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
    return session;
}

function pushCard(charId: string, role: "user" | "assistant", data: { title: string; subtitle: string; status?: string; body?: string; history: string; rows?: { label: string; value: string }[] }): void {
    const session = createOrGetSession(charId);
    pushChatMessage({
        sessionId: session.id,
        role,
        content: "",
        mediaType: "app_card",
        mediaData: {
            appName: "支付宝",
            appCardTitle: data.title,
            appHistoryText: data.history,
            appCardLayout: {
                appLabel: "支付宝",
                title: data.title,
                subtitle: data.subtitle,
                ...(data.status ? { status: data.status } : {}),
                ...(data.body ? { body: data.body } : {}),
                rows: data.rows || [],
                openDisabled: true,
            },
        } as ChatMessage["mediaData"],
    });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
}

function requestReply(sessionId: string) {
    window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId } }));
    }, 0);
}

async function charGenerate(charId: string, instruction: string): Promise<string> {
    const session: ChatSession = {
        id: `alipay_${charId}_${Date.now().toString(36)}`,
        contactId: "group_alipay",
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
        isPinned: false,
        bilingualTranslationEnabled: false,
        isGroup: true,
        groupName: "支付宝",
        participantIds: [charId],
    };
    const task: ChatMessage = {
        id: `alipay-task-${Date.now()}`,
        sessionId: session.id,
        role: "user",
        content: `[支付宝App] ${instruction}`,
        status: "sent",
        createdAt: new Date().toISOString(),
    };
    const result = await generateGroupRawCompletion(session, [task], { appTags: [], appId: "alipay" });
    return result.text || "";
}

function field(text: string, name: string): string {
    return text.match(new RegExp(`${name}[：:]\\s*([^\\n]+)`))?.[1]?.trim() || "";
}

function parseMoney(text: string): number {
    const raw = text.replace(/[,，¥￥元\s]/g, "");
    const wan = raw.match(/(\d+(?:\.\d+)?)万/);
    if (wan) return Math.round(Number(wan[1]) * 10000);
    const n = Number(raw.match(/\d+(?:\.\d+)?/)?.[0]);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const yuan = (n: number) => formatWalletAmount(n);

// ── 他给她开亲属卡 ──

async function grantKinCard(charId: string, reason: "request" | "proactive"): Promise<boolean> {
    const me = userName(charId);
    const identityId = getCharacterIdentityId(charId);
    const existing = loadWalletState(identityId).cards.find(c => c.kin?.charId === charId);
    const text = await charGenerate(charId, [
        reason === "request"
            ? `${me}在支付宝里向你申请亲属卡：开了以后她买东西可以直接刷这张卡，从你的账户付钱，每月有额度，她每刷一次你都会收到提醒。`
            : `你想到可以在支付宝给${me}开一张亲属卡：开了以后她买东西可以直接刷，从你的账户付钱，每月有额度，她每刷一次你都会收到提醒。`,
        existing?.kin ? `你之前已经给她开过一张，每月额度 ${yuan(existing.kin.monthlyLimit)}，这次可以调整额度。` : "",
        reason === "request"
            ? `按你的人设、你的经济情况和你们的关系决定开不开、每月额度多少。`
            : `按你的人设、你的经济情况和你们的关系判断你现在会不会真的给她开。不会就不开。`,
        `只输出：`,
        `决定：开 或 不开`,
        `额度：每月额度，纯数字（不开就写 0）`,
        `留言：开卡时附的一句话（不开就写 无）`,
    ].filter(Boolean).join("\n"));
    const open = !/不开/.test(field(text, "决定") || text) && /开/.test(field(text, "决定") || text);
    const limit = parseMoney(field(text, "额度"));
    const note = field(text, "留言").replace(/^无$/, "").slice(0, 80);
    const session = createOrGetSession(charId);
    updateAlipay(s => { delete s.pendingRequests[charId]; }, identityId);
    if (!open || limit <= 0) {
        if (reason === "request") {
            pushEvent(charId, "", `${me}向你申请亲属卡，你决定先不开。接着在聊天里自然地回她。`);
            requestReply(session.id);
        }
        return false;
    }
    upsertKinCard({ charId, charName: charName(charId), monthlyLimit: limit }, identityId);
    pushCard(charId, "assistant", {
        title: `给你开了亲属卡`,
        subtitle: `每月额度 ${yuan(limit)}`,
        status: "已开通",
        body: note,
        history: `[亲属卡] 你给${me}开了亲属卡，每月额度 ${yuan(limit)}${note ? `，留言：${note}` : ""}`,
    });
    pushEvent(
        charId,
        "",
        `${reason === "request" ? `${me}向你申请亲属卡，` : "你主动"}给她开了亲属卡，每月额度 ${yuan(limit)}，从你的账户付款${note ? `，你留言：${note}` : ""}。${reason === "request" ? "接着在聊天里自然地回她一两句。" : "接着在聊天里自然地跟她说一声。"}`,
    );
    requestReply(session.id);
    return true;
}

export async function requestKinCard(charId: string): Promise<void> {
    if (!isFriend(charId)) return;
    const me = userName(charId);
    const identityId = getCharacterIdentityId(charId);
    updateAlipay(s => { s.pendingRequests[charId] = new Date().toISOString(); }, identityId);
    pushCard(charId, "user", {
        title: "申请亲属卡",
        subtitle: `${me} 想要你给她开一张亲属卡`,
        status: "等他回应",
        history: `[申请亲属卡] ${me}向你申请亲属卡`,
    });
    try {
        await grantKinCard(charId, "request");
    } catch (error) {
        updateAlipay(s => { delete s.pendingRequests[charId]; }, identityId);
        throw error;
    }
}

// ── 她刷了他给的亲属卡 ──

let kinTimer: number | null = null;
const kinQueue: { charId: string; amount: number; title: string; detail: string }[] = [];

function flushKinSpends() {
    kinTimer = null;
    const byChar = new Map<string, typeof kinQueue>();
    for (const item of kinQueue.splice(0)) byChar.set(item.charId, [...(byChar.get(item.charId) || []), item]);
    for (const [charId, items] of byChar) {
        const identityId = getCharacterIdentityId(charId);
        const card = loadWalletState(identityId).cards.find(c => c.kin?.charId === charId);
        if (!card?.kin?.notify) continue;
        const me = userName(charId);
        const list = items.map(i => `${i.detail || i.title} ${yuan(i.amount)}`).join("；");
        const session = pushEvent(
            charId,
            "",
            `你收到支付宝提醒：${me}刷了你给她开的亲属卡——${list}。本月额度 ${yuan(card.kin.monthlyLimit)}，还剩 ${yuan(card.balance)}。接着在聊天里按你的人设自然地反应。`,
        );
        requestReply(session.id);
    }
}

function onKinSpent(event: Event) {
    const d = (event as CustomEvent).detail as { charId?: string; amount?: number; title?: string; detail?: string };
    if (!d?.charId) return;
    kinQueue.push({ charId: d.charId, amount: Number(d.amount) || 0, title: d.title || "", detail: d.detail || "" });
    // 连着买好几样合成一条提醒
    if (kinTimer) window.clearTimeout(kinTimer);
    kinTimer = window.setTimeout(flushKinSpends, 20_000);
}

// ── 她给他开亲属卡 ──

export function giveKinCard(charId: string, monthlyLimit: number, accountId: string): void {
    const me = userName(charId);
    const identityId = getCharacterIdentityId(charId);
    const month = currentMonthKey();
    let renewed = false;
    updateAlipay(s => {
        const existing = s.given.find(g => g.charId === charId);
        if (existing) {
            renewed = true;
            existing.monthlyLimit = monthlyLimit;
            existing.accountId = accountId;
        } else {
            s.given.push({ charId, monthlyLimit, accountId, month, used: 0, spends: [], createdAt: new Date().toISOString() });
        }
    }, identityId);
    pushCard(charId, "user", {
        title: renewed ? "亲属卡额度已调整" : "给你开了亲属卡",
        subtitle: `每月额度 ${yuan(monthlyLimit)}`,
        status: "已开通",
        history: `[亲属卡] ${me}${renewed ? "把给你开的亲属卡额度调成" : "给你开了亲属卡，每月额度"} ${yuan(monthlyLimit)}`,
    });
    const session = pushEvent(
        charId,
        "",
        `${me}${renewed ? "把给你开的亲属卡每月额度调成了" : "在支付宝给你开了一张亲属卡，你买东西可以直接刷，从她的账户付钱，每月额度"} ${yuan(monthlyLimit)}。接着在聊天里自然地回她。`,
    );
    requestReply(session.id);
}

export function cancelGivenKinCard(charId: string): void {
    const identityId = getCharacterIdentityId(charId);
    updateAlipay(s => { s.given = s.given.filter(g => g.charId !== charId); }, identityId);
    pushEvent(charId, "", `${userName(charId)}把给你开的亲属卡关掉了。`);
}

async function charSpendGiven(charId: string): Promise<void> {
    const identityId = getCharacterIdentityId(charId);
    const state = loadAlipay(identityId);
    const raw = state.given.find(g => g.charId === charId);
    if (!raw) return;
    const card = givenThisMonth(raw, currentMonthKey());
    const left = Math.max(0, card.monthlyLimit - card.used);
    if (left <= 0) return;
    const me = userName(charId);
    const text = await charGenerate(charId, [
        `${me}在支付宝给你开了亲属卡，从她的账户付钱，这个月还剩额度 ${yuan(left)}，最近你用它买过：${card.spends.slice(0, 5).map(s => `${s.title} ${yuan(s.amount)}`).join("；") || "还没用过"}。`,
        `按你的人设和最近的生活，你今天有没有用这张卡买东西？大多数时候不会用。`,
        `不用就只输出：不用`,
        `用了就输出：`,
        `买了：买的东西（一句话）`,
        `金额：纯数字，不超过 ${left}`,
    ].join("\n"));
    if (/^\s*不用/.test(text) || !field(text, "买了")) return;
    const title = field(text, "买了").slice(0, 60);
    const amount = Math.min(left, parseMoney(field(text, "金额")));
    if (amount <= 0) return;
    const paid = walletTransact({
        accountId: card.accountId,
        amount: -amount,
        title: `亲属卡 · ${charName(charId)}消费`,
        category: "亲属卡",
        detail: title,
        kind: "payment",
    }, identityId);
    if (!paid.ok) return;
    updateAlipay(s => {
        const g = s.given.find(x => x.charId === charId);
        if (!g) return;
        const cur = givenThisMonth(g, currentMonthKey());
        g.month = cur.month;
        g.used = Math.round((cur.used + amount) * 100) / 100;
        g.spends = [{ id: newAlipayId("ks"), title, amount, at: new Date().toISOString() }, ...g.spends].slice(0, 50);
    }, identityId);
    pushEvent(charId, `${charName(charId)} 用你给的亲属卡消费 ${yuan(amount)}：${title}`, `你用${me}给你开的亲属卡买了${title}，花了 ${yuan(amount)}，她会收到提醒。`);
}

// ── 小荷包 ──

export function createPouch(input: { name: string; charId: string; target: number; cover?: string }): Pouch {
    const identityId = getCharacterIdentityId(input.charId);
    const pouch: Pouch = {
        id: newAlipayId("pouch"),
        name: input.name.trim().slice(0, 30) || "小荷包",
        charId: input.charId,
        cover: input.cover,
        target: Math.max(0, input.target),
        balance: 0,
        records: [],
        createdAt: new Date().toISOString(),
    };
    updateAlipay(s => { s.pouches.unshift(pouch); }, identityId);
    const me = userName(input.charId);
    pushCard(input.charId, "user", {
        title: `一起存「${pouch.name}」`,
        subtitle: pouch.target > 0 ? `目标 ${yuan(pouch.target)}` : "小荷包",
        status: "已加入",
        history: `[小荷包] ${me}建了一个和你一起存钱的小荷包「${pouch.name}」${pouch.target > 0 ? `，目标 ${yuan(pouch.target)}` : ""}`,
    });
    const session = pushEvent(input.charId, "", `${me}在支付宝建了一个和你一起存钱的小荷包「${pouch.name}」${pouch.target > 0 ? `，目标 ${yuan(pouch.target)}` : ""}，你们俩都能往里存。接着在聊天里自然地回她。`);
    requestReply(session.id);
    return pouch;
}

export function movePouchMoney(pouchId: string, direction: "in" | "out", amount: number, accountId: string, identityId?: string): { ok: boolean; error?: string } {
    const pouch = loadAlipay(identityId).pouches.find(p => p.id === pouchId);
    if (!pouch || amount <= 0) return { ok: false, error: "金额不对" };
    if (direction === "out" && pouch.balance < amount) return { ok: false, error: "小荷包里没这么多" };
    const paid = walletTransact({
        accountId,
        amount: direction === "in" ? -amount : amount,
        title: direction === "in" ? `存入小荷包` : `从小荷包取出`,
        category: "小荷包",
        detail: pouch.name,
    }, identityId);
    if (!paid.ok) return { ok: false, error: paid.error };
    updateAlipay(s => {
        const p = s.pouches.find(x => x.id === pouchId);
        if (!p) return;
        p.balance = Math.round((p.balance + (direction === "in" ? amount : -amount)) * 100) / 100;
        p.records.unshift({ id: newAlipayId("pr"), by: ALIPAY_SELF, amount: direction === "in" ? amount : -amount, at: new Date().toISOString() });
        p.records = p.records.slice(0, 200);
    }, identityId);
    pushEvent(pouch.charId, "", `${userName(pouch.charId)}${direction === "in" ? "往" : "从"}你们的小荷包「${pouch.name}」${direction === "in" ? "存了" : "取出了"} ${yuan(amount)}，现在里面有 ${yuan(pouch.balance + (direction === "in" ? amount : -amount))}。`);
    return { ok: true };
}

export function deletePouch(pouchId: string, identityId?: string): void {
    const pouch = loadAlipay(identityId).pouches.find(p => p.id === pouchId);
    if (!pouch) return;
    // 里面剩的钱退回她余额
    if (pouch.balance > 0) walletTransact({ amount: pouch.balance, title: "小荷包解散退回", category: "小荷包", detail: pouch.name }, identityId);
    updateAlipay(s => { s.pouches = s.pouches.filter(p => p.id !== pouchId); }, identityId);
    pushEvent(pouch.charId, "", `${userName(pouch.charId)}把你们的小荷包「${pouch.name}」解散了。`);
}

async function charDepositPouch(pouch: Pouch, identityId?: string): Promise<void> {
    const me = userName(pouch.charId);
    const recent = pouch.records.slice(0, 6).map(r => `${r.by === ALIPAY_SELF ? me : "你"}${r.amount >= 0 ? "存" : "取"} ${yuan(Math.abs(r.amount))}${r.note ? `（${r.note}）` : ""}`).join("；");
    const text = await charGenerate(pouch.charId, [
        `你和${me}在支付宝有个一起存钱的小荷包「${pouch.name}」${pouch.target > 0 ? `，目标 ${yuan(pouch.target)}` : ""}，现在有 ${yuan(pouch.balance)}。最近：${recent || "还没人存过"}。`,
        `按你的人设和经济情况，你今天会不会往里存一笔？`,
        `不存就只输出：不存`,
        `存就输出：`,
        `金额：纯数字`,
        `留言：存钱时写的一句话（不想写就写 无）`,
    ].join("\n"));
    if (/^\s*不存/.test(text)) return;
    const amount = parseMoney(field(text, "金额"));
    if (amount <= 0) return;
    const note = field(text, "留言").replace(/^无$/, "").slice(0, 60);
    updateAlipay(s => {
        const p = s.pouches.find(x => x.id === pouch.id);
        if (!p) return;
        p.balance = Math.round((p.balance + amount) * 100) / 100;
        p.records.unshift({ id: newAlipayId("pr"), by: pouch.charId, amount, note: note || undefined, at: new Date().toISOString() });
        p.records = p.records.slice(0, 200);
    }, identityId);
    pushEvent(pouch.charId, `${charName(pouch.charId)} 往小荷包「${pouch.name}」存了 ${yuan(amount)}${note ? `：${note}` : ""}`, `你往你们的小荷包「${pouch.name}」存了 ${yuan(amount)}${note ? `，留言：${note}` : ""}。`);
}

// ── 账单评语 ──

export async function writeBillNote(charId: string, monthKey: string, summary: string): Promise<string> {
    const me = userName(charId);
    const month = `${monthKey.slice(0, 4)}年${Number(monthKey.slice(5))}月`;
    const text = await charGenerate(charId, [
        `你看了${me}支付宝里 ${month} 的账单：`,
        summary,
        `按你的人设看完，对她这个月的花钱写一句话。`,
        `只输出：`,
        `评语：一句话`,
    ].join("\n"));
    const note = (field(text, "评语") || text.trim().split("\n")[0] || "").replace(/^评语[：:]\s*/, "").slice(0, 120);
    if (!note) return "";
    const identityId = getCharacterIdentityId(charId);
    updateAlipay(s => { s.billNotes[`${monthKey}:${charId}`] = note; }, identityId);
    pushEvent(charId, "", `你看了${me} ${month} 的支付宝账单，评价：${note}`);
    return note;
}

// ── 转账 ──

export function transferToChar(charId: string, amount: number, label: string, accountId: string, identityId?: string): { ok: boolean; error?: string } {
    const name = charName(charId);
    const paid = walletTransact({
        accountId,
        amount: -amount,
        title: "发转账",
        detail: `${name}：发转账 ${amount.toFixed(2)} 元`,
        category: "转账",
        kind: "payment",
    }, identityId);
    if (!paid.ok || !paid.transaction) return { ok: false, error: paid.error };
    const session = createOrGetSession(charId);
    pushChatMessage({
        sessionId: session.id,
        role: "user",
        content: "",
        mediaType: "transfer",
        mediaData: { amount, label: label || "转账", status: "pending", walletTransactionId: paid.transaction.id } as ChatMessage["mediaData"],
    });
    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: session.id } }));
    requestReply(session.id);
    return { ok: true };
}

// ── 每天的骰子 ──

let ticking = false;

export async function alipayDailyTick(): Promise<void> {
    if (ticking || typeof window === "undefined") return;
    ticking = true;
    try {
        accrueYuebao();
        const chars = loadChatContacts().map(c => c.characterId);
        for (const charId of chars) {
            const identityId = getCharacterIdentityId(charId);
            const state = loadAlipay(identityId);
            // 她给他开的卡：他偶尔用
            if (state.given.some(g => g.charId === charId) && !rolledToday(`spend:${charId}`, identityId)) {
                markRolled(`spend:${charId}`, identityId);
                if (Math.random() < 0.25) await charSpendGiven(charId).catch(e => console.warn("[Alipay] spend failed:", e));
            }
            // 他主动给她开：还没开过的才掷，很少
            const hasKin = loadWalletState(identityId).cards.some(c => c.kin?.charId === charId);
            if (!hasKin && !state.pendingRequests[charId] && !rolledToday(`kin:${charId}`, identityId)) {
                markRolled(`kin:${charId}`, identityId);
                if (Math.random() < 0.03) await grantKinCard(charId, "proactive").catch(e => console.warn("[Alipay] kin failed:", e));
            }
        }
        for (const identity of new Set(chars.map(getCharacterIdentityId))) {
            for (const pouch of loadAlipay(identity).pouches) {
                if (!isFriend(pouch.charId) || rolledToday(`pouch:${pouch.id}`, identity)) continue;
                markRolled(`pouch:${pouch.id}`, identity);
                if (Math.random() < 0.15) await charDepositPouch(pouch, identity).catch(e => console.warn("[Alipay] pouch failed:", e));
            }
        }
    } finally {
        ticking = false;
    }
}

let stopTimer: (() => void) | null = null;

export function startAlipayService(): void {
    if (stopTimer || typeof window === "undefined") return;
    window.addEventListener(WALLET_KIN_SPENT_EVENT, onKinSpent);
    if (process.env.NODE_ENV !== "production") {
        (window as unknown as Record<string, unknown>).__noxAlipay = {
            spend: charSpendGiven,
            deposit: (pouchId: string) => { const p = loadAlipay().pouches.find(x => x.id === pouchId) || loadAlipay().pouches[0]; return p && charDepositPouch(p); },
            grant: (charId: string) => grantKinCard(charId, "proactive"),
            pay: (accountId: string, amount: number) => payWithWalletAccount({ accountId, amount, title: "购物付款", detail: "测试：一条连衣裙", category: "购物" }),
            wallet: () => loadWalletState(),
        };
    }
    const first = window.setTimeout(() => void alipayDailyTick(), 90_000);
    const every = window.setInterval(() => void alipayDailyTick(), 30 * 60_000);
    stopTimer = () => {
        window.removeEventListener(WALLET_KIN_SPENT_EVENT, onKinSpent);
        window.clearTimeout(first);
        window.clearInterval(every);
    };
}
