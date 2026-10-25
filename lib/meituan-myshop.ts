// lib/meituan-myshop.ts
// 美团「我的店」：她开饭店当老板。
// - 开着店就会有路人下单（代码按时段掷骰子，不花 API）；她接单、出餐，骑手取走送达后钱进店里，可以提现到钱包
// - 路人吃完有一部分会写评价（模板），她能回复
// - 他偶尔会来光顾（饭点骰子），或者她把店分享给他；他按人设决定点不点、点什么、写评价，都进他记忆

import { loadChatContacts } from "./chat-storage";
import { getCharacterIdentityId } from "./identity-scope";
import {
    blocks,
    charGenerate,
    field,
    firstEmoji,
    isFriend,
    llm,
    mtCharName,
    num,
    pushEvent,
    requestReply,
    userName,
} from "./meituan-engine";
import {
    loadMeituan,
    MT_CATEGORIES,
    mtId,
    mtToday,
    randomRider,
    updateMeituan,
    type MtDish,
    type MtItem,
    type MyShop,
    type MyShopOrder,
    type MyShopReview,
} from "./meituan-store";
import { WALLET_BALANCE_ACCOUNT_ID, walletTransact } from "./wallet-storage";

/** 平台抽成 */
export const MY_SHOP_FEE = 0.15;

export function newMyShop(input: { name: string; cat: string; emoji: string; desc: string; address: string }): MyShop {
    const now = new Date().toISOString();
    return {
        ...input,
        notice: "",
        minOrder: 15,
        deliveryFee: 2,
        open: true,
        autoAccept: true,
        dishes: [],
        reviews: [],
        orders: [],
        balance: 0,
        withdrawn: 0,
        createdAt: now,
        lastSimAt: now,
        visits: {},
    };
}

export function updateMyShop(mut: (shop: MyShop) => void, identityId?: string): void {
    updateMeituan(s => { if (s.myShop) mut(s.myShop); }, identityId);
}

// ── 订单状态 ──

export type MyStage = "new" | "cooking" | "waiting" | "delivering" | "done" | "cancelled";

export const MY_STAGE_LABEL: Record<MyStage, string> = {
    new: "新订单",
    cooking: "备餐中",
    waiting: "等骑手取餐",
    delivering: "配送中",
    done: "已完成",
    cancelled: "已取消",
};

export function myOrderStage(o: MyShopOrder, now = Date.now()): MyStage {
    if (o.cancelled) return "cancelled";
    if (!o.acceptAt) return "new";
    const t = (iso?: string) => (iso ? new Date(iso).getTime() : Infinity);
    if (now < t(o.readyAt)) return "cooking";
    if (now < t(o.pickAt)) return "waiting";
    if (now < t(o.deliverAt)) return "delivering";
    return "done";
}

/** 真实时长关掉时整体缩短 */
function speed(): number {
    return loadMeituan().settings.realTime ? 1 : 0.15;
}

function schedule(o: MyShopOrder, acceptAt: number, readyAt?: number) {
    const k = speed();
    const ready = readyAt ?? acceptAt + (8 + Math.random() * 7) * 60_000 * k;
    const pick = ready + (2 + Math.random() * 4) * 60_000 * k;
    const deliver = pick + (12 + Math.random() * 13) * 60_000 * k;
    o.acceptAt = new Date(acceptAt).toISOString();
    o.readyAt = new Date(ready).toISOString();
    o.pickAt = new Date(pick).toISOString();
    o.deliverAt = new Date(deliver).toISOString();
    o.rider = o.rider || randomRider().name;
}

export function acceptMyOrder(orderId: string): void {
    updateMyShop(shop => {
        const o = shop.orders.find(x => x.id === orderId);
        if (o && !o.acceptAt && !o.cancelled) schedule(o, Date.now());
    });
}

export function readyMyOrder(orderId: string): void {
    updateMyShop(shop => {
        const o = shop.orders.find(x => x.id === orderId);
        if (!o?.acceptAt || o.cancelled) return;
        if (myOrderStage(o) !== "cooking") return;
        schedule(o, new Date(o.acceptAt).getTime(), Date.now());
    });
}

export function rejectMyOrder(orderId: string): void {
    updateMyShop(shop => {
        const o = shop.orders.find(x => x.id === orderId);
        if (o && !o.acceptAt) o.cancelled = "商家拒单";
    });
}

// ── 路人下单（不花 API） ──

const NICKS = [
    "一只小土豆", "Lzy_0912", "不吃香菜的猫", "今天也要早睡", "momo", "阿木木", "晚风", "吃饱了再减肥", "北北北", "橘子汽水",
    "x先生", "打工人小王", "芝士就是力量", "小鹿乱撞", "陈陈不胖", "加班到十点", "爱吃辣的南方人", "柚子", "nnn", "早八困难户",
    "李同学", "苏打绿", "猫猫拳", "一口一个", "山有木兮", "Ethan", "周末不起床", "快乐小狗", "七七", "雾里看花",
];
const NOTES = [
    "", "", "", "", "", "不要香菜", "多放辣", "少放辣", "不要葱", "无需餐具", "餐具一份", "放门口就行，谢谢", "饿死了麻烦快一点",
    "帮忙多给点醋", "微辣", "不要放糖", "米饭多一点", "老顾客了 老板多给点呀", "到了打电话", "放外卖柜",
];
const PLACES = ["梧桐苑", "锦绣花园", "阳光100", "万科城", "科技园 B 座", "大学城南门", "星河湾", "金地名苑", "软件园二期", "翠湖小区", "东方明珠公寓", "新天地写字楼"];

function pick<T>(list: T[]): T {
    return list[Math.floor(Math.random() * list.length)];
}

function slotChance(hour: number): number {
    if ((hour >= 11 && hour < 13) || (hour >= 17 && hour < 20)) return 0.45;
    if ((hour >= 13 && hour < 17) || (hour >= 20 && hour < 23)) return 0.2;
    if (hour >= 7 && hour < 11) return 0.14;
    if (hour === 23 || hour < 2) return 0.08;
    return 0.02;
}

function makeItems(dishes: MtDish[]): MtItem[] {
    const hot = dishes.filter(d => d.group === dishes[0]?.group);
    const n = Math.random() < 0.55 ? 1 : Math.random() < 0.75 ? 2 : 3;
    const chosen: MtDish[] = [];
    for (let i = 0; i < n; i++) {
        const pool = i === 0 && hot.length && Math.random() < 0.6 ? hot : dishes;
        const d = pick(pool);
        if (!chosen.includes(d)) chosen.push(d);
    }
    return chosen.map(d => ({ name: d.name, price: d.price, qty: Math.random() < 0.15 ? 2 : 1, emoji: d.emoji }));
}

function money(items: MtItem[], shop: MyShop) {
    const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
    const pack = Math.min(4, items.reduce((s, i) => s + i.qty, 0));
    const total = Math.round((sub + pack + shop.deliveryFee) * 100) / 100;
    const income = Math.round((sub + pack) * (1 - MY_SHOP_FEE) * 100) / 100;
    return { total, income };
}

function dayNo(shop: MyShop, at: Date): number {
    const day = mtToday(at);
    return shop.orders.filter(o => mtToday(new Date(o.createdAt)) === day).length + 1;
}

function strangerOrder(shop: MyShop, at: Date): MyShopOrder {
    const items = makeItems(shop.dishes);
    return {
        id: mtId("myo"),
        no: dayNo(shop, at),
        customer: pick(NICKS),
        items,
        ...money(items, shop),
        note: pick(NOTES),
        address: `${pick(PLACES)} ${1 + Math.floor(Math.random() * 12)}栋`,
        createdAt: at.toISOString(),
    };
}

// ── 路人评价（模板） ──

const RV5 = [
    "{d}好吃！分量也足，会回购的", "送到还是热的，{d}味道很正", "第二次点了，{d}一如既往稳定", "包装很用心，{d}绝了",
    "宝藏小店，{d}比店里吃还好吃", "老板人很好还写了小纸条，{d}好评", "加班救星，{d}吃完满血复活", "{d}味道很家常，像家里做的",
    "很干净，吃得放心，{d}推荐", "出餐超快，{d}好吃不腻",
];
const RV4 = ["{d}还不错，就是稍微有点咸", "整体可以，{d}分量再多点就好了", "味道挺好，送得慢了一点", "{d}好吃，包装有点洒了"];
const RV3 = ["一般般吧，{d}有点凉了", "{d}味道普通，价格偏贵", "还行，没有图上那么好看"];
const RV_LOW = ["等了好久，送到都凉了", "{d}太咸了，吃不下", "少给了一份餐具，体验不好"];

function strangerReview(o: MyShopOrder, slow: boolean): MyShopReview {
    const r = Math.random();
    let stars = r < 0.7 ? 5 : r < 0.88 ? 4 : r < 0.96 ? 3 : r < 0.99 ? 2 : 1;
    if (slow && stars > 3 && Math.random() < 0.4) stars -= 1;
    const pool = stars === 5 ? RV5 : stars === 4 ? RV4 : stars === 3 ? RV3 : RV_LOW;
    const dish = o.items[0]?.name || "这家";
    return {
        id: mtId("rv"),
        name: Math.random() < 0.2 ? "匿名用户" : o.customer,
        stars,
        text: pick(pool).replace("{d}", dish),
        taste: Math.max(1, Math.min(5, stars + (Math.random() < 0.3 ? -1 : 0))),
        pack: Math.max(3, stars),
        at: o.reviewAt || new Date().toISOString(),
        orderId: o.id,
    };
}

export function myShopRating(shop: MyShop): number {
    if (!shop.reviews.length) return 5;
    return Math.round((shop.reviews.reduce((s, r) => s + r.stars, 0) / shop.reviews.length) * 10) / 10;
}

// ── 时间往前走：补订单、结算、评价 ──

/** 打开 app 和每分钟跑一次。离开期间最多补 12 小时、8 单 */
export function simulateMyShop(identityId?: string, now = Date.now()): void {
    const state = loadMeituan(identityId);
    const shop = state.myShop;
    if (!shop) return;
    const k = state.settings.realTime ? 1 : 0.15;
    updateMeituan(s => {
        const sh = s.myShop!;
        // 新订单
        if (sh.open && sh.dishes.length) {
            const step = 15 * 60_000;
            let t = Math.max(new Date(sh.lastSimAt).getTime(), now - 12 * 3600_000);
            const pop = 0.7 + Math.min(0.8, sh.reviews.length * 0.02);
            let added = 0;
            while (t + step <= now && added < 8) {
                const at = new Date(t + Math.random() * step);
                if (Math.random() < slotChance(at.getHours()) * pop) {
                    const o = strangerOrder(sh, at);
                    if (sh.autoAccept) schedule(o, at.getTime() + 20_000);
                    sh.orders.unshift(o);
                    added++;
                }
                t += step;
            }
            sh.lastSimAt = new Date(Math.min(now, t)).toISOString();
            sh.orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        } else {
            sh.lastSimAt = new Date(now).toISOString();
        }
        for (const o of sh.orders) {
            if (o.cancelled) continue;
            // 没接的单 10 分钟后顾客取消
            if (!o.acceptAt) {
                if (!o.charId && now - new Date(o.createdAt).getTime() > Math.max(3, 10 * k) * 60_000) o.cancelled = "超时未接单，顾客取消了";
                continue;
            }
            if (myOrderStage(o, now) !== "done") continue;
            if (!o.settled) {
                o.settled = true;
                sh.balance = Math.round((sh.balance + o.income) * 100) / 100;
                if (!o.charId && Math.random() < 0.5) o.reviewAt = new Date(new Date(o.deliverAt!).getTime() + (10 + Math.random() * 80) * 60_000 * k).toISOString();
            }
            if (o.reviewAt && !o.reviewed && now >= new Date(o.reviewAt).getTime()) {
                o.reviewed = true;
                const slow = new Date(o.acceptAt).getTime() - new Date(o.createdAt).getTime() > 5 * 60_000;
                sh.reviews.unshift(strangerReview(o, slow));
                sh.reviews.sort((a, b) => b.at.localeCompare(a.at));
            }
        }
    }, identityId);
}

export function withdrawMyShop(): { ok: boolean; amount?: number; error?: string } {
    const shop = loadMeituan().myShop;
    if (!shop || shop.balance <= 0) return { ok: false, error: "店里还没有可以提现的钱" };
    const amount = shop.balance;
    const r = walletTransact({ accountId: WALLET_BALANCE_ACCOUNT_ID, amount, title: `美团商家提现 · ${shop.name}`, category: "美团", detail: `「${shop.name}」营业收入提现`, kind: "transfer_in" });
    if (!r.ok) return { ok: false, error: r.error };
    updateMyShop(s => { s.balance = 0; s.withdrawn = Math.round((s.withdrawn + amount) * 100) / 100; });
    return { ok: true, amount };
}

export function replyMyReview(reviewId: string, text: string): void {
    let review: MyShopReview | undefined;
    updateMyShop(s => {
        const r = s.reviews.find(x => x.id === reviewId);
        if (r) { r.reply = text.slice(0, 200); review = { ...r }; }
    });
    if (review?.by && review.by !== "self" && isFriend(review.by)) {
        const shop = loadMeituan().myShop;
        pushEvent(review.by, "", `${userName(review.by)}在她的美团店「${shop?.name}」回复了你的评价「${review.text}」：「${text}」。`);
    }
}

// ── AI：帮她写菜单 ──

export async function writeMyMenu(): Promise<number> {
    const shop = loadMeituan().myShop;
    if (!shop) return 0;
    const raw = await llm([
        "你在帮一个刚在美团外卖开店的老板写菜单。",
        `店名：${shop.name}\n分类：${MT_CATEGORIES.find(c => c.id === shop.cat)?.name || "美食"}\n简介：${shop.desc || "无"}`,
        shop.dishes.length ? `店里已经有：${shop.dishes.map(d => d.name).join("、")}，不要重复，补充新的。` : "",
        "写 8~10 道，分 3 个组（第一个组叫 热销）。价格像真实外卖平台。每道菜输出：",
        "===菜===",
        "组：分组名",
        "名称：菜名",
        "介绍：一句话（可以留空）",
        "价格：数字",
        "图标：一个 emoji",
    ].filter(Boolean).join("\n"));
    const dishes: MtDish[] = blocks(raw, "菜").map(b => {
        const name = field(b, "名称").slice(0, 30);
        if (!name) return null;
        return {
            id: mtId("dish"),
            name,
            desc: field(b, "介绍").replace(/^(无|空)$/, "").slice(0, 40),
            price: num(field(b, "价格"), 20),
            monthly: 0,
            emoji: firstEmoji(field(b, "图标"), shop.emoji),
            group: field(b, "组").slice(0, 8) || "热销",
        };
    }).filter((d): d is MtDish => Boolean(d));
    updateMyShop(s => { s.dishes = [...s.dishes, ...dishes.filter(d => !s.dishes.some(x => x.name === d.name))]; });
    return dishes.length;
}

// ── 他来光顾 ──

function menuText(shop: MyShop): string {
    return shop.dishes.map(d => `${d.name} ¥${d.price}${d.desc ? `（${d.desc}）` : ""}`).join("；");
}

/** 他决定点不点。shared=她刚把店分享给他 */
export async function charVisitMyShop(charId: string, shared: boolean): Promise<MyShopOrder | null> {
    const identityId = getCharacterIdentityId(charId);
    const state = loadMeituan(identityId);
    const shop = state.myShop;
    if (!shop || !shop.dishes.length) return null;
    const me = userName(charId);
    const text = await charGenerate(charId, [
        `${me}在美团外卖开了一家店，她是老板：「${shop.name}」，${MT_CATEGORIES.find(c => c.id === shop.cat)?.name || "美食"}${shop.desc ? `，简介：${shop.desc}` : ""}${shop.notice ? `，店铺公告：${shop.notice}` : ""}。`,
        `菜单：${menuText(shop)}`,
        shared
            ? `她刚把店铺分享给你看。按你的人设和你们的关系，判断你现在会不会下一单捧场。`
            : `现在是 ${new Date().getHours()} 点，你刷到了她的店。按你的人设和你们的关系，判断你现在会不会下一单。大多数时候不会。`,
        "不点就只输出：不点",
        "点就输出（菜只能从上面菜单里选）：",
        "菜品：菜名/数量; 菜名/数量",
        "备注：写给商家的备注（没有就写 无）",
        "留言：订单里写给老板（也就是她）的一句话（没有就写 无）",
    ].join("\n"));
    if (/^\s*不点/.test(text) || !field(text, "菜品")) return null;
    const items: MtItem[] = field(text, "菜品").split(/[;；]/).map(p => {
        const [name, qty] = p.split(/[/／]/).map(x => x.trim());
        const d = shop.dishes.find(x => x.name === name) || shop.dishes.find(x => name && (x.name.includes(name) || name.includes(x.name)));
        return d ? { name: d.name, price: d.price, qty: Math.max(1, Math.min(10, Math.round(num(qty || "1", 1)))), emoji: d.emoji } : null;
    }).filter((i): i is MtItem => Boolean(i));
    if (!items.length) return null;
    const now = new Date();
    const order: MyShopOrder = {
        id: mtId("myo"),
        no: dayNo(shop, now),
        customer: mtCharName(charId),
        charId,
        items,
        ...money(items, shop),
        note: field(text, "备注").replace(/^无$/, "").slice(0, 80),
        message: field(text, "留言").replace(/^无$/, "").slice(0, 80),
        address: "他家",
        createdAt: now.toISOString(),
    };
    if (shop.autoAccept) schedule(order, now.getTime() + 20_000);
    updateMeituan(s => {
        if (!s.myShop) return;
        s.myShop.orders.unshift(order);
        s.myShop.visits[charId] = now.toISOString();
    }, identityId);
    return order;
}

export async function shareMyShop(charId: string): Promise<boolean> {
    const shop = loadMeituan().myShop;
    if (!shop) return false;
    const me = userName(charId);
    const order = await charVisitMyShop(charId, true).catch(() => null);
    const list = order?.items.map(i => `${i.name}×${i.qty}`).join("、");
    const session = pushEvent(
        charId,
        `你把美团店铺「${shop.name}」分享给了 ${mtCharName(charId)}`,
        `${me}在美团开了家店「${shop.name}」，她是老板，刚把店铺分享给你看了。菜单：${menuText(shop)}。${order ? `你看完下了一单：${list}${order.message ? `，给她留言：${order.message}` : ""}。` : "你看了，没有下单。"}在聊天里按你的人设自然地反应。`,
    );
    requestReply(session.id);
    return Boolean(order);
}

async function charReviewMyShop(charId: string, order: MyShopOrder, identityId?: string): Promise<void> {
    const shop = loadMeituan(identityId).myShop;
    if (!shop) return;
    const text = await charGenerate(charId, [
        `你在${userName(charId)}开的美团店「${shop.name}」点的外卖送到了：${order.items.map(i => `${i.name}×${i.qty}`).join("、")}。`,
        "按你的人设给这单写一条外卖评价（会显示在她店里的评价区，路人也看得到）。",
        "只输出：",
        "星级：1~5",
        "内容：评价内容",
    ].join("\n"));
    const content = field(text, "内容");
    if (!content) return;
    const stars = Math.min(5, Math.max(1, Math.round(num(field(text, "星级"), 5))));
    const r: MyShopReview = { id: mtId("rv"), name: mtCharName(charId), stars, text: content.slice(0, 160), taste: stars, pack: 5, at: new Date().toISOString(), by: charId, orderId: order.id };
    updateMeituan(s => {
        if (!s.myShop) return;
        s.myShop.reviews.unshift(r);
        const o = s.myShop.orders.find(x => x.id === order.id);
        if (o) o.reviewed = true;
    }, identityId);
    pushEvent(charId, "", `你在${userName(charId)}的美团店「${shop.name}」点的${order.items.map(i => i.name).join("、")}送到了，你吃了，给她的店写了评价：${stars} 星，「${r.text}」。`);
}

const MEAL: [number, number, string][] = [[11, 13, "lunch"], [17, 20, "dinner"], [21, 24, "night"]];

let shopTicking = false;

export async function myShopTick(ids: Set<string | undefined>): Promise<void> {
    if (shopTicking) return;
    shopTicking = true;
    try {
        for (const id of ids) {
            simulateMyShop(id);
            // 他点的单送到了：写评价、进记忆
            const shop = loadMeituan(id).myShop;
            if (!shop) continue;
            for (const o of shop.orders.slice(0, 40)) {
                if (!o.charId || o.reviewed || o.cancelled || myOrderStage(o) !== "done") continue;
                updateMeituan(s => { const x = s.myShop?.orders.find(q => q.id === o.id); if (x) x.reviewed = true; }, id);
                if (Date.now() - new Date(o.deliverAt!).getTime() > 6 * 3600_000 || !isFriend(o.charId)) continue;
                await charReviewMyShop(o.charId, o, id).catch(e => console.warn("[MyShop] review failed:", e));
            }
        }
        // 饭点骰子：他来光顾
        const h = new Date().getHours();
        const win = MEAL.find(([a, b]) => h >= a && h < b);
        if (!win) return;
        for (const c of loadChatContacts()) {
            const charId = c.characterId;
            const identityId = getCharacterIdentityId(charId);
            const state = loadMeituan(identityId);
            const shop = state.myShop;
            if (!shop?.open || !shop.dishes.length || !state.settings.allowCharOrders) continue;
            const key = `shop:${charId}:${win[2]}`;
            if (state.rolls[key] === mtToday()) continue;
            updateMeituan(s => { s.rolls[key] = mtToday(); }, identityId);
            const last = shop.visits[charId];
            if (last && Date.now() - new Date(last).getTime() < 3 * 86400_000) continue;
            if (Math.random() >= 0.06) continue;
            const order = await charVisitMyShop(charId, false).catch(() => null);
            if (order) {
                pushEvent(charId, "", `你刚在${userName(charId)}开的美团店「${shop.name}」下了一单：${order.items.map(i => `${i.name}×${i.qty}`).join("、")}${order.message ? `，给她留言：${order.message}` : ""}。她作为老板会在后台看到。`);
            }
        }
    } finally {
        shopTicking = false;
    }
}

export function devMyShop() {
    return {
        simulate: simulateMyShop,
        visit: charVisitMyShop,
        state: () => loadMeituan().myShop,
        /** 假装店开了 h 小时 */
        rewind: (h: number) => {
            updateMyShop(s => { s.lastSimAt = new Date(Date.now() - h * 3600_000).toISOString(); });
            simulateMyShop();
            simulateMyShop();
        },
        tick: () => myShopTick(new Set([undefined])),
    };
}
