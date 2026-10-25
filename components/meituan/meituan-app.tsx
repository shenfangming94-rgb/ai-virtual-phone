"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, MessageCircle, Phone, Search, Sparkles } from "lucide-react";

import { loadCharacters } from "@/lib/character-storage";
import { loadChatContacts } from "@/lib/chat-storage";
import { createIdentityMatcher } from "@/lib/identity-scope";
import { isMediaStoreRef, loadMediaObjectUrl, storeMediaBlob } from "@/lib/media-cache-storage";
import { loadGiftStore, updateGiftStore, USER_ADDRESS_ID, type GiftAddress } from "@/lib/shopping-gift-store";
import { formatWalletAmount, loadWalletState, WALLET_BALANCE_ACCOUNT_ID } from "@/lib/wallet-storage";
import {
    loadMeituan,
    MEITUAN_UPDATED_EVENT,
    MT_CATEGORIES,
    MT_SELF,
    mtYuan,
    orderNo,
    orderProgress,
    orderStage,
    STAGE_LABEL,
    takeMeituanPendingOpen,
    updateMeituan,
    type MeituanState,
    type MtDeal,
    type MtDish,
    type MtItem,
    type MtOrder,
    type MtReview,
    type MtShop,
} from "@/lib/meituan-store";
import {
    buyDeal,
    charAddress,
    generateCategoryShops,
    generateDeals,
    generateHomeShops,
    generateMtImage,
    generateShopMenu,
    inviteWithVoucher,
    isMtImageReady,
    myAddress,
    orderDiscount,
    placeOrder,
    reviewVoucher,
    riderReply,
    searchShops,
    submitReview,
    redeemVoucher,
} from "@/lib/meituan-engine";
import { orderHeadline, orderWhoLabel, useMtNow } from "./meituan-chat-card";
import { MyShopView } from "./meituan-myshop";
import { myShopRating } from "@/lib/meituan-myshop";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { seedDeals, seedShops } from "@/lib/meituan-seed";

type Page =
    | { id: "home" }
    | { id: "waimai" }
    | { id: "cat"; cat: string }
    | { id: "search"; q: string }
    | { id: "shop"; shopId: string }
    | { id: "checkout"; shopId: string }
    | { id: "orders" }
    | { id: "order"; orderId: string }
    | { id: "rider"; orderId: string }
    | { id: "deals" }
    | { id: "voucher"; voucherId: string }
    | { id: "mine" }
    | { id: "store" }
    | { id: "addresses" }
    | { id: "myReviews" }
    | { id: "settings" };

export type Person = { id: string; name: string; avatar?: string | null };

export function friends(): Person[] {
    const matches = createIdentityMatcher();
    const chars = loadCharacters();
    return loadChatContacts()
        .filter(c => matches(c.characterId))
        .map(c => chars.find(ch => ch.id === c.characterId))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map(c => ({ id: c.id, name: c.name, avatar: c.avatar }));
}

function useMediaUrl(ref?: string): string | null {
    const [url, setUrl] = useState<string | null>(ref && !isMediaStoreRef(ref) ? ref : null);
    useEffect(() => {
        if (!ref) { setUrl(null); return; }
        if (!isMediaStoreRef(ref)) { setUrl(ref); return; }
        let revoke = "";
        let cancelled = false;
        void loadMediaObjectUrl(ref).then(u => {
            if (cancelled) { if (u) URL.revokeObjectURL(u); return; }
            if (u) { revoke = u; setUrl(u); } else setUrl(null);
        });
        return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
    }, [ref]);
    return url;
}

export const PIN = (
    <svg className="mt-pin" viewBox="0 0 24 24" aria-hidden><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" /></svg>
);

export function Stars({ n, small }: { n: number; small?: boolean }) {
    const full = Math.round(n);
    return <span className={`mt-stars ${small ? "is-s" : ""}`}>{"★".repeat(full)}{"☆".repeat(Math.max(0, 5 - full))}</span>;
}

export function Pic({ src, emoji, className }: { src?: string; emoji: string; className: string }) {
    const url = useMediaUrl(src);
    return <div className={className} style={url ? { backgroundImage: `url(${url})` } : undefined}>{url ? null : emoji}</div>;
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="mt-sheet-bg" onClick={onClose}>
            <section className="mt-sheet" onClick={e => e.stopPropagation()}>
                {title ? <h3>{title}</h3> : null}
                {children}
            </section>
        </div>
    );
}

export function Nav({ title, onBack, right }: { title: React.ReactNode; onBack: () => void; right?: React.ReactNode }) {
    return (
        <header className="mt-nav">
            <button type="button" className="mt-back" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button>
            <b>{title}</b>
            <span className="mt-nav-r">{right}</span>
        </header>
    );
}

export function hm(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function full(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm(iso)}`;
}

// ── 主体 ──

export function MeituanApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
    const [st, setSt] = useState<MeituanState>(() => loadMeituan());
    const [stack, setStack] = useState<Page[]>(() => {
        const pending = takeMeituanPendingOpen();
        if (pending?.kind === "order") return [{ id: "home" }, { id: "order", orderId: pending.id }];
        if (pending?.kind === "voucher") return [{ id: "home" }, { id: "voucher", voucherId: pending.id }];
        return [{ id: "home" }];
    });
    const [busy, setBusy] = useState("");
    const [sheet, setSheet] = useState<string | null>(null);
    const [cart, setCart] = useState<Record<string, Record<string, number>>>({});
    const [sort, setSort] = useState("综合排序");
    const people = useMemo(() => friends(), []);
    const nameOf = useCallback((id: string) => id === MT_SELF ? "我" : people.find(p => p.id === id)?.name || loadCharacters().find(c => c.id === id)?.name || "他", [people]);
    const notice = useCallback((m: string) => onNotice?.(m), [onNotice]);
    const [addr, setAddr] = useState<GiftAddress>(() => myAddress());
    const now = useMtNow(10_000);

    const refresh = useCallback(() => setSt(loadMeituan()), []);
    useEffect(() => {
        window.addEventListener(MEITUAN_UPDATED_EVENT, refresh);
        return () => window.removeEventListener(MEITUAN_UPDATED_EVENT, refresh);
    }, [refresh]);

    const page = stack[stack.length - 1];
    const go = (p: Page) => setStack(s => [...s, p]);
    const back = () => (stack.length > 1 ? setStack(s => s.slice(0, -1)) : onClose());
    const tabTo = (p: Page) => setStack([p]);

    const run = async (label: string, fn: () => Promise<unknown>, fail = "生成失败了，等会儿再试试") => {
        if (busy) return;
        setBusy(label);
        try { await fn(); } catch (e) { console.warn("[Meituan]", e); notice(fail); } finally { setBusy(""); refresh(); }
    };

    // 首页没店就先放内置的示例店（不调 AI），点「换一批」才生成
    useEffect(() => {
        if (st.shops.some(s => s.source === "home")) return;
        updateMeituan(s => { s.shops = [...seedShops(), ...s.shops]; if (!s.deals.length) s.deals = seedDeals(); });
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const homeShops = useMemo(() => {
        const list = st.shops.filter(s => s.source === "home");
        const sorted = [...list];
        if (sort === "销量") sorted.sort((a, b) => b.monthly - a.monthly);
        else if (sort === "距离") sorted.sort((a, b) => parseFloat(a.distance) * (a.distance.includes("km") ? 1000 : 1) - parseFloat(b.distance) * (b.distance.includes("km") ? 1000 : 1));
        else if (sort === "星级") sorted.sort((a, b) => b.rating - a.rating);
        return sorted;
    }, [st.shops, sort]);

    const shopRow = (s: MtShop) => (
        <button type="button" className="mt-shop" key={s.id} onClick={() => go({ id: "shop", shopId: s.id })}>
            <Pic src={s.logo || s.img} emoji={s.emoji} className="mt-simg" />
            <div className="mt-sinfo">
                <b>{s.name}</b>
                <div className="mt-srow"><Stars n={s.rating} /><em>{s.rating.toFixed(1)}</em><span>月售 {s.monthly >= 9999 ? "9999+" : s.monthly}</span>{s.perCapita ? <span>人均 ¥{s.perCapita}</span> : null}</div>
                <div className="mt-srow2">{s.eta}分钟 · {s.distance}</div>
                <div className="mt-srow2">起送¥{s.minOrder} · {s.deliveryFee ? `配送¥${s.deliveryFee}` : "免配送费"}</div>
                {s.tags.length ? <div className="mt-tags">{s.tags.map(t => <u key={t}>{t}</u>)}</div> : null}
            </div>
        </button>
    );

    const top = (placeholder: string) => (
        <div className="mt-top">
            <button type="button" className="mt-loc" onClick={() => setSheet("address")}>{PIN}<span>{addr.address || "设置收货地址"}</span><small>⌄</small></button>
            <button type="button" className="mt-search" onClick={() => go({ id: "search", q: "" })}><Search size={15} /><span>{placeholder}</span><em>搜索</em></button>
        </div>
    );

    const tabbar = (
        <nav className="mt-tab">
            {([["首页", "home"], ["订单", "orders"], ["我的店", "store"], ["我的", "mine"]] as const).map(([label, id]) => (
                <button type="button" key={id} className={page.id === id ? "on" : ""} onClick={() => {
                    tabTo({ id } as Page);
                }}>{label}</button>
            ))}
        </nav>
    );

    // ── 首页 ──
    const BIG: { emoji: string; label: string; to: () => void; hl?: boolean }[] = [
        { emoji: "🛵", label: "外卖", to: () => go({ id: "waimai" }), hl: true },
        { emoji: "🍲", label: "美食团购", to: () => go({ id: "deals" }) },
        { emoji: "💊", label: "看病买药", to: () => go({ id: "cat", cat: "medicine" }) },
        { emoji: "🛒", label: "超市便利", to: () => go({ id: "cat", cat: "market" }) },
        { emoji: "🎬", label: "电影演出", to: () => go({ id: "deals" }) },
        { emoji: "🧋", label: "甜点饮品", to: () => go({ id: "cat", cat: "drink" }) },
        { emoji: "💐", label: "鲜花", to: () => go({ id: "cat", cat: "flower" }) },
        { emoji: "🍰", label: "蛋糕", to: () => go({ id: "cat", cat: "cake" }) },
        { emoji: "🎳", label: "休闲玩乐", to: () => go({ id: "deals" }) },
        { emoji: "🔎", label: "全部", to: () => go({ id: "waimai" }) },
    ];
    const home = (
        <div className="mt-page has-tab">
            {top("搜美食、店铺、团购")}
            <div className="mt-big">{BIG.map(b => <button type="button" key={b.label} className={b.hl ? "hl" : ""} onClick={b.to}><i>{b.emoji}</i>{b.label}</button>)}</div>
            <button type="button" className="mt-banner" onClick={() => go({ id: "waimai" })}><b>神券节 · 外卖大额券</b><span>去点外卖 ›</span></button>
            <div className="mt-filter"><span className="on">猜你喜欢</span></div>
            <div className="mt-feed">
                {st.deals.slice(0, 4).map(d => (
                    <button type="button" key={d.id} className="mt-fd" onClick={() => setSheet(`deal:${d.id}`)}>
                        <Pic src={d.img} emoji={d.emoji} className="mt-fd-img" />
                        <b>{d.shopName} · {d.title}</b><small><em>¥{d.price}</em> · {d.rating.toFixed(1)}分</small>
                    </button>
                ))}
                {homeShops.slice(0, st.deals.length ? 4 : 6).map(s => (
                    <button type="button" key={s.id} className="mt-fd" onClick={() => go({ id: "shop", shopId: s.id })}>
                        <Pic src={s.img || s.logo} emoji={s.emoji} className="mt-fd-img" />
                        <b>{s.name}</b><small>外卖 · {s.eta}分钟 · <em>{s.rating.toFixed(1)}分</em></small>
                    </button>
                ))}
            </div>
            {busy === "home" ? <p className="mt-hint">正在找附近的店…</p> : null}
        </div>
    );

    // ── 外卖 ──
    const waimai = (
        <div className="mt-page">
            <div className="mt-top-nav"><button type="button" className="mt-back is-y" onClick={back}><ChevronLeft size={22} /></button><b>外卖</b></div>
            {top("想吃什么？搜一下，AI 帮你找店")}
            <div className="mt-cats">{MT_CATEGORIES.map(c => <button type="button" key={c.id} onClick={() => go({ id: "cat", cat: c.id })}><i>{c.emoji}</i>{c.name}</button>)}</div>
            <div className="mt-banner is-red"><b>今晚吃点好的</b><span>满 50 减 15 · 限时</span></div>
            <div className="mt-filter">
                {["综合排序", "销量", "距离", "星级"].map(f => <button type="button" key={f} className={sort === f ? "on" : ""} onClick={() => setSort(f)}>{f}</button>)}
                <button type="button" className="mt-refresh" disabled={!!busy} onClick={() => run("home", generateHomeShops)}>{busy === "home" ? "找店中…" : "换一批"}</button>
            </div>
            <div className="mt-list">{homeShops.map(shopRow)}</div>
            {busy === "home" ? <p className="mt-hint">正在找附近的店…</p> : null}
        </div>
    );

    // ── 分类 ──
    const catPage = (catId: string) => {
        const cat = MT_CATEGORIES.find(c => c.id === catId);
        const list = st.shops.filter(s => s.cat === catId);
        return (
            <div className="mt-page">
                <Nav title={cat?.name || "分类"} onBack={back} />
                <div className="mt-list">{list.map(shopRow)}</div>
                {!list.length ? <p className="mt-hint">这个分类还没有店，点下面让 AI 找几家</p> : null}
                <button type="button" className="mt-more" disabled={!!busy} onClick={() => run(`cat:${catId}`, () => generateCategoryShops(catId))}>{busy === `cat:${catId}` ? "正在找…" : "再来几家"}</button>
            </div>
        );
    };

    // ── 搜索 ──
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<string[]>([]);
    const doSearch = (text: string) => {
        const query = text.trim();
        if (!query) return;
        const local = st.shops.filter(s => s.name.includes(query) || s.desc.includes(query) || s.dishes?.some(d => d.name.includes(query)));
        void run("search", async () => {
            const found = await searchShops(query);
            setHits([...found.map(s => s.id), ...local.map(s => s.id)].filter((id, i, a) => a.indexOf(id) === i));
        }, "没搜出来，换个词试试");
    };
    const searchPage = (
        <div className="mt-page">
            <div className="mt-sbar">
                <button type="button" className="mt-back" onClick={back}><ChevronLeft size={22} /></button>
                <div className="mt-sinput"><Search size={15} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") doSearch(q); }} placeholder="想吃什么？比如 麻辣烫、生日蛋糕、退烧药" /></div>
                <button type="button" className="mt-sgo" onClick={() => doSearch(q)}>搜索</button>
            </div>
            {busy === "search" ? <p className="mt-hint">AI 正在帮你找店…</p> : null}
            <div className="mt-list">{hits.map(id => st.shops.find(s => s.id === id)).filter((s): s is MtShop => Boolean(s)).map(shopRow)}</div>
            {!hits.length && !busy ? <div className="mt-chips">{["麻辣烫", "奶茶", "寿司", "生日蛋糕", "烧烤", "粥", "感冒药", "水果捞"].map(k => <button type="button" key={k} onClick={() => { setQ(k); doSearch(k); }}>{k}</button>)}</div> : null}
        </div>
    );

    // ── 店铺 ──
    const [shopTab, setShopTab] = useState<"menu" | "rv" | "info">("menu");
    const [group, setGroup] = useState("");
    const shopPage = (shopId: string) => {
        const shop = st.shops.find(s => s.id === shopId);
        if (!shop) return <div className="mt-page"><Nav title="店铺" onBack={back} /></div>;
        const c = cart[shopId] || {};
        const dishes = shop.dishes || [];
        const groups = Array.from(new Set(dishes.map(d => d.group)));
        const curGroup = groups.includes(group) ? group : groups[0];
        const count = Object.values(c).reduce((s, n) => s + n, 0);
        const sum = dishes.reduce((s, d) => s + (c[d.id] || 0) * d.price, 0);
        const setQty = (d: MtDish, delta: number) => setCart(all => {
            const cur = { ...(all[shopId] || {}) };
            cur[d.id] = Math.max(0, (cur[d.id] || 0) + delta);
            if (!cur[d.id]) delete cur[d.id];
            return { ...all, [shopId]: cur };
        });
        return (
            <div className="mt-page is-shop">
                <ShopAutoMenu shop={shop} run={run} />
                <Hero shop={shop} onBack={back} onPic={() => setSheet(`pic:shop:${shop.id}`)} />
                <div className="mt-sh">
                    <Pic src={shop.logo} emoji={shop.emoji} className="mt-shl" />
                    <b>{shop.name}</b>
                    <div className="mt-srow"><Stars n={shop.rating} /><em>{shop.rating.toFixed(1)}</em><span>月售 {shop.monthly} · 人均 ¥{shop.perCapita}</span></div>
                    <div className="mt-srow2">{shop.eta}分钟送达 · 配送 ¥{shop.deliveryFee} · {shop.address || shop.distance}</div>
                    {shop.tags.length ? <div className="mt-tags">{shop.tags.map(t => <u key={t}>{t}</u>)}</div> : null}
                </div>
                <div className="mt-stabs">
                    <button type="button" className={shopTab === "menu" ? "on" : ""} onClick={() => setShopTab("menu")}>点菜</button>
                    <button type="button" className={shopTab === "rv" ? "on" : ""} onClick={() => setShopTab("rv")}>评价 {shop.reviewCount || shop.reviews?.length || ""}</button>
                    <button type="button" className={shopTab === "info" ? "on" : ""} onClick={() => setShopTab("info")}>商家</button>
                </div>
                {shopTab === "menu" ? (
                    dishes.length ? (
                        <div className="mt-menu">
                            <div className="mt-side">{groups.map(g => <button type="button" key={g} className={g === curGroup ? "on" : ""} onClick={() => setGroup(g)}>{g}</button>)}</div>
                            <div className="mt-dl">
                                {dishes.filter(d => d.group === curGroup).map(d => (
                                    <div className="mt-dish" key={d.id}>
                                        <button type="button" className="mt-dimg-btn" onClick={() => setSheet(`pic:dish:${shop.id}:${d.id}`)}><Pic src={d.img} emoji={d.emoji} className="mt-dimg" /></button>
                                        <div className="mt-dinfo">
                                            <b>{d.name}</b>
                                            {d.desc ? <small>{d.desc}</small> : null}
                                            <small>月售 {d.monthly}</small>
                                            <div className="mt-dp"><em>¥{d.price}</em>
                                                <span className="mt-qty">
                                                    {c[d.id] ? <><button type="button" className="minus" onClick={() => setQty(d, -1)}>－</button><i>{c[d.id]}</i></> : null}
                                                    <button type="button" className="plus" onClick={() => setQty(d, 1)}>＋</button>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : <p className="mt-hint">{busy === `menu:${shop.id}` ? "正在上菜单…" : "菜单还没出来"}</p>
                ) : null}
                {shopTab === "rv" ? (
                    <div className="mt-rvs">
                        <div className="mt-rvt">大家的评价 <em>{shop.rating.toFixed(1)}</em><Stars n={shop.rating} small /></div>
                        {(shop.reviews || []).map(r => <ReviewRow key={r.id} r={r} label={r.by === MT_SELF ? "我的评价" : r.by ? `${nameOf(r.by)}的评价` : ""} />)}
                        {!shop.reviews?.length ? <p className="mt-hint">还没有评价</p> : null}
                    </div>
                ) : null}
                {shopTab === "info" ? (
                    <div className="mt-rvs">
                        <div className="mt-kv">商家地址<b>{shop.address || "—"}</b></div>
                        <div className="mt-kv">配送距离<b>{shop.distance}</b></div>
                        <div className="mt-kv">起送价<b>¥{shop.minOrder}</b></div>
                        <div className="mt-kv">简介<b>{shop.desc || "—"}</b></div>
                        <button type="button" className="mt-more" disabled={!!busy} onClick={() => run(`menu:${shop.id}`, () => generateShopMenu(shop.id))}>重新生成菜单和评价</button>
                    </div>
                ) : null}
                <div className="mt-cart">
                    <span className="mt-cic">🛍{count ? <sup>{count}</sup> : null}</span>
                    <span className="mt-tot">{count ? mtYuan(sum) : "未选购商品"}<small>{shop.deliveryFee ? `另需配送费 ¥${shop.deliveryFee}` : "免配送费"}</small></span>
                    <button type="button" className="mt-go" disabled={!count || sum < shop.minOrder} onClick={() => go({ id: "checkout", shopId })}>{count && sum < shop.minOrder ? `差¥${Math.ceil(shop.minOrder - sum)}起送` : "去结算"}</button>
                </div>
            </div>
        );
    };

    // ── 结算 ──
    const [to, setTo] = useState<string>(MT_SELF);
    const [toAddr, setToAddr] = useState<GiftAddress | null>(null);
    const [note, setNote] = useState("");
    const [account, setAccount] = useState(WALLET_BALANCE_ACCOUNT_ID);
    const wallet = useMemo(() => loadWalletState(), [st]);
    useEffect(() => {
        if (to === MT_SELF) { setToAddr(null); return; }
        const known = loadGiftStore().addresses[to];
        if (known?.address) { setToAddr(known); return; }
        setToAddr(null);
    }, [to]);
    const checkout = (shopId: string) => {
        const shop = st.shops.find(s => s.id === shopId);
        if (!shop) return null;
        const c = cart[shopId] || {};
        const items: MtItem[] = (shop.dishes || []).filter(d => c[d.id]).map(d => ({ name: d.name, qty: c[d.id], price: d.price, emoji: d.emoji }));
        const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
        const pack = Math.min(6, Math.max(1, items.reduce((s, i) => s + i.qty, 0)));
        const disc = orderDiscount(shop, sub);
        const total = Math.max(0, sub + pack + shop.deliveryFee - disc);
        const address = to === MT_SELF ? addr : toAddr;
        const accounts = [
            { id: WALLET_BALANCE_ACCOUNT_ID, label: `余额（${formatWalletAmount(wallet.balance)}）`, balance: wallet.balance },
            ...wallet.cards.map(cd => ({ id: cd.id, label: cd.kin ? `${cd.kin.charName}的亲属卡（剩 ${formatWalletAmount(cd.balance)}）` : `${cd.bankLabel} ${cd.title}（${formatWalletAmount(cd.balance)}）`, balance: cd.balance })),
        ];
        const acc = accounts.find(a => a.id === account) || accounts[0];
        return (
            <div className="mt-page is-gray">
                <Nav title="提交订单" onBack={back} />
                <section className="mt-card">
                    <div className="mt-ck-h">给谁吃</div>
                    <div className="mt-who">
                        <button type="button" className={to === MT_SELF ? "on" : ""} onClick={() => setTo(MT_SELF)}>我自己</button>
                        {people.map(p => <button type="button" key={p.id} className={to === p.id ? "on" : ""} onClick={() => setTo(p.id)}>{p.name}</button>)}
                    </div>
                    <button type="button" className="mt-ck-addr" onClick={() => setSheet(to === MT_SELF ? "address" : `charAddr:${to}`)}>
                        {PIN}
                        <div>{address?.address ? <><b>{address.address}</b><small>{address.name} {address.phone}</small></> : <b>{to === MT_SELF ? "填一下收货地址" : "填一下他的地址"}</b>}</div>
                        <ChevronRight size={16} />
                    </button>
                    {to !== MT_SELF ? <p className="mt-hint">送到他那里，下单后会发卡片告诉他</p> : null}
                </section>
                <section className="mt-card">
                    <div className="mt-ck-h">{shop.name}</div>
                    {items.map(i => <div className="mt-it" key={i.name}><i>{i.emoji}</i><div>{i.name}<small>x{i.qty}</small></div><span>{mtYuan(i.price * i.qty)}</span></div>)}
                    <div className="mt-kv">打包费<b>{mtYuan(pack)}</b></div>
                    <div className="mt-kv">配送费<b>{mtYuan(shop.deliveryFee)}</b></div>
                    {disc ? <div className="mt-kv">满减优惠<b className="red">-{mtYuan(disc)}</b></div> : null}
                    <div className="mt-kv is-end">{disc ? <span className="dim">已优惠 {mtYuan(disc)}</span> : null}小计<b className="big">{mtYuan(total)}</b></div>
                </section>
                <section className="mt-card">
                    <div className="mt-ck-h">备注</div>
                    <textarea className="mt-input" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="口味、偏好，或者想跟骑手说的话" maxLength={80} />
                    <div className="mt-ck-h" style={{ marginTop: 12 }}>支付方式</div>
                    <select className="mt-input" value={acc.id} onChange={e => setAccount(e.target.value)}>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                </section>
                <div className="mt-submit">
                    <span>实付 <b>{mtYuan(total)}</b></span>
                    <button type="button" disabled={!address?.address || busy === "pay" || acc.balance < total} onClick={() => run("pay", async () => {
                        const r = await placeOrder({ shop, items, note: note.trim(), to, address: address!, accountId: acc.id, accountLabel: acc.label.replace(/（.*$/, "") });
                        if (!r.ok || !r.order) { notice(r.error || "付款失败"); return; }
                        setCart(all => ({ ...all, [shopId]: {} }));
                        setNote("");
                        setStack([{ id: "home" }, { id: "orders" }, { id: "order", orderId: r.order.id }]);
                        notice(to === MT_SELF ? "下单成功" : `下单成功，已告诉${nameOf(to)}`);
                    }, "下单失败了")}>{acc.balance < total ? "余额不足" : "提交订单"}</button>
                </div>
            </div>
        );
    };

    // ── 订单 ──
    const [orderTab, setOrderTab] = useState<"waimai" | "deal">("waimai");
    const orders = (
        <div className="mt-page has-tab is-gray">
            <div className="mt-plain-top"><b>订单</b></div>
            <div className="mt-seg"><button type="button" className={orderTab === "waimai" ? "on" : ""} onClick={() => setOrderTab("waimai")}>外卖</button><button type="button" className={orderTab === "deal" ? "on" : ""} onClick={() => setOrderTab("deal")}>团购券</button></div>
            {orderTab === "waimai" ? st.orders.map(o => {
                const stage = orderStage(o, now);
                return (
                    <button type="button" className="mt-card mt-oline" key={o.id} onClick={() => go({ id: "order", orderId: o.id })}>
                        <div className="mt-oh"><b>{o.shopEmoji} {o.shopName}</b><span className={stage === "delivered" ? "" : "y"}>{STAGE_LABEL[stage]}</span></div>
                        <div className="mt-osub">{orderWhoLabel(o)} · {full(o.createdAt)}</div>
                        <div className="mt-osub">{o.items.map(i => `${i.name}×${i.qty}`).join("、")}</div>
                        <div className="mt-osum">实付 <b>{mtYuan(o.total)}</b></div>
                    </button>
                );
            }) : st.vouchers.map(v => (
                <button type="button" className="mt-card mt-oline" key={v.id} onClick={() => go({ id: "voucher", voucherId: v.id })}>
                    <div className="mt-oh"><b>{v.deal.emoji} {v.deal.shopName}</b><span className={v.usedAt ? "" : "y"}>{v.usedAt ? "已使用" : "待使用"}</span></div>
                    <div className="mt-osub">{v.deal.title}{v.invite ? ` · 约了${nameOf(v.invite.charId)}${v.invite.state === "yes" ? "（他会来）" : v.invite.state === "no" ? "（他不来）" : "（等他回）"}` : ""}</div>
                    <div className="mt-osum">¥{v.deal.price}</div>
                </button>
            ))}
            {(orderTab === "waimai" ? st.orders.length : st.vouchers.length) === 0 ? <p className="mt-hint" style={{ textAlign: "center", marginTop: 60 }}>还没有{orderTab === "waimai" ? "外卖订单" : "团购券"}</p> : null}
        </div>
    );

    const orderPage = (orderId: string) => {
        const o = st.orders.find(x => x.id === orderId);
        if (!o) return <div className="mt-page"><Nav title="订单" onBack={back} /><p className="mt-hint">找不到这单了</p></div>;
        const stage = orderStage(o, now);
        const head = orderHeadline(o, now);
        const p = orderProgress(o, now);
        const canReview = stage === "delivered" && !o.review && o.to === MT_SELF;
        const lastRider = [...o.riderChat].reverse().find(m => m.role === "rider");
        return (
            <div className="mt-page is-gray is-order">
                <div className="mt-map">
                    <button type="button" className="mt-back is-float" onClick={back}><ChevronLeft size={22} /></button>
                    <svg className="mt-route" viewBox="0 0 375 250" preserveAspectRatio="none"><path d="M60 190 C 140 170, 200 110, 300 60" /></svg>
                    <span className="mt-mpin" style={{ left: 22, top: 196 }}>🏠 {o.to === MT_SELF ? "我" : nameOf(o.to)}</span>
                    <span className="mt-mpin" style={{ left: 262, top: 34 }}>{o.shopEmoji} 商家</span>
                    {stage !== "delivered" && stage !== "cancelled" ? (
                        <div className="mt-rider" style={riderPos(stage === "delivering" ? Math.max(0.12, (p - 0.45) / 0.55) : 0.12)}>
                            {lastRider && stage === "delivering" ? <span className="mt-say">{lastRider.text.slice(0, 14)}</span> : null}
                            🛵
                        </div>
                    ) : null}
                </div>
                <section className="mt-ocard">
                    <div className="mtc-head">
                        <div className="mtc-lb"><span>{orderWhoLabel(o)}</span><span>{STAGE_LABEL[stage]}</span></div>
                        <b>{head.big}</b>
                        <small>🕐 {head.small}</small>
                        {stage !== "delivered" && stage !== "cancelled" ? <div className="mtc-bar"><i style={{ width: `${p * 100}%` }} /><em style={{ left: `${p * 100}%` }}>🕐</em></div> : null}
                        <div className="mt-obtns">
                            <button type="button" onClick={() => go({ id: "rider", orderId: o.id })}><Phone size={15} />联系骑手{o.riderChat.length ? <sup>{o.riderChat.filter(m => m.role === "rider").length}</sup> : null}</button>
                            <button type="button" onClick={() => notice("商家：亲，已经在加急做了哦～")}><MessageCircle size={15} />联系商家</button>
                        </div>
                    </div>
                </section>
                <section className="mt-card">
                    {o.shopId && st.shops.some(x => x.id === o.shopId)
                        ? <button type="button" className="mt-ck-h mt-ck-link" onClick={() => go({ id: "shop", shopId: o.shopId! })}>{o.shopName} ›</button>
                        : <div className="mt-ck-h">{o.shopName}</div>}
                    {o.items.map((i, k) => <div className="mt-it" key={k}><i>{i.emoji}</i><div>{i.name}<small>x{i.qty}</small></div><span>{mtYuan(i.price * i.qty)}</span></div>)}
                    <div className="mt-kv">打包费<b>{mtYuan(o.packFee)}</b></div>
                    <div className="mt-kv">配送费<b>{mtYuan(o.deliveryFee)}</b></div>
                    <div className="mt-kv">美团红包<b className="red">{o.discount ? `-${mtYuan(o.discount)}` : "未使用"}</b></div>
                    <div className="mt-safe"><span className="g">🛡 放心吃</span><span className="b">🕐 准时宝</span></div>
                    <div className="mt-kv is-end">{o.discount ? <span className="dim">已优惠 {mtYuan(o.discount)}</span> : null}实付<b className="big">{mtYuan(o.total)}</b></div>
                </section>
                {o.review || o.charReview || canReview ? (
                    <section className="mt-card">
                        <div className="mt-ck-h">评价</div>
                        {o.review ? <ReviewRow r={o.review} label="我的评价" /> : null}
                        {o.charReview ? <ReviewRow r={o.charReview} label={`${nameOf(o.charReview.by || "")}的评价`} /> : null}
                        {canReview ? <button type="button" className="mt-more" onClick={() => setSheet(`review:${o.id}`)}>写评价</button> : null}
                    </section>
                ) : null}
                <section className="mt-card">
                    <div className="mt-ck-h">订单信息</div>
                    <div className="mt-kv">收货地址<b>{o.address.address}</b></div>
                    <div className="mt-kv">备注<b>{o.note || "无"}</b></div>
                    <div className="mt-kv">订单号码<b>{orderNo(o.id)}</b></div>
                    <div className="mt-kv">下单时间<b>{full(o.createdAt)}</b></div>
                    <div className="mt-kv">支付方式<b>{o.accountLabel || "在线支付"}</b></div>
                    <div className="mt-kv">骑手<b>{o.rider.name} {o.rider.phone}</b></div>
                </section>
            </div>
        );
    };

    // ── 骑手聊天 ──
    const [msg, setMsg] = useState("");
    const riderPage = (orderId: string) => {
        const o = st.orders.find(x => x.id === orderId);
        if (!o) return null;
        return (
            <div className="mt-page is-chat">
                <Nav title={<>骑手 {o.rider.name} <small className="mt-dim">· 美团配送</small></>} onBack={back} right={<button type="button" onClick={() => notice(`正在呼叫 ${o.rider.phone}…（他在骑车，先发消息吧）`)}><Phone size={18} /></button>} />
                <div className="mt-chat">
                    {o.riderChat.map((m, k) => (
                        <div className={`mt-msg ${m.role === "user" ? "me" : ""}`} key={k}><span className="mt-mav">{m.role === "user" ? "我" : "🛵"}</span><p>{m.text}</p></div>
                    ))}
                    {!o.riderChat.length ? <p className="mt-hint" style={{ textAlign: "center" }}>骑手接单后会在这里跟你说话</p> : null}
                    {busy === "rider" ? <p className="mt-hint">对方正在输入…</p> : null}
                </div>
                <div className="mt-chat-in">
                    <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="发消息给骑手" onKeyDown={e => { if (e.key === "Enter") (e.currentTarget.nextSibling as HTMLButtonElement)?.click(); }} />
                    <button type="button" disabled={!msg.trim() || !!busy} onClick={() => { const t = msg.trim(); setMsg(""); void run("rider", () => riderReply(o.id, t), "骑手没回，可能在骑车"); }}>发送</button>
                </div>
            </div>
        );
    };

    // ── 团购 ──
    const deals = (
        <div className="mt-page is-gray">
            <Nav title="美食团购 · 休闲玩乐" onBack={back} right={<button type="button" disabled={!!busy} onClick={() => run("deals", generateDeals)}>换一批</button>} />
            {busy === "deals" ? <p className="mt-hint">正在找附近的团购…</p> : null}
            {st.deals.map(d => (
                <button type="button" className="mt-card mt-deal" key={d.id} onClick={() => setSheet(`deal:${d.id}`)}>
                    <Pic src={d.img} emoji={d.emoji} className="mt-simg" />
                    <div className="mt-sinfo"><b>{d.shopName}</b><div className="mt-srow"><Stars n={d.rating} /><em>{d.rating.toFixed(1)}</em><span>{d.sold}</span></div><div className="mt-srow2">{d.title} · {d.desc}</div><div className="mt-dprice"><em>¥{d.price}</em><s>¥{d.origin}</s><span>{Math.round((d.price / Math.max(1, d.origin)) * 10)}折</span></div></div>
                </button>
            ))}
        </div>
    );

    const voucherPage = (voucherId: string) => {
        const v = st.vouchers.find(x => x.id === voucherId);
        if (!v) return <div className="mt-page"><Nav title="团购券" onBack={back} /></div>;
        return (
            <div className="mt-page is-gray">
                <Nav title="团购券" onBack={back} />
                <section className="mt-card mt-vch">
                    <Pic src={v.deal.img} emoji={v.deal.emoji} className="mt-vimg" />
                    <b>{v.deal.shopName}</b>
                    <p>{v.deal.title} · {v.deal.desc}</p>
                    <div className="mt-code"><small>券码</small><b className={v.usedAt ? "used" : ""}>{v.code}</b>{v.usedAt ? <span>已使用 · {full(v.usedAt)}</span> : <span>到店出示券码</span>}</div>
                </section>
                <section className="mt-card">
                    <div className="mt-ck-h">一起去</div>
                    {v.invite ? <p className="mt-p">约了 {nameOf(v.invite.charId)}：{v.invite.state === "pending" ? "等他回…" : v.invite.state === "yes" ? "他会来" : "他这次不来"}</p> : <p className="mt-hint">邀请卡片会发进你们的聊天，他按人设决定去不去</p>}
                    {!v.usedAt ? <div className="mt-who">{people.map(p => <button type="button" key={p.id} disabled={!!busy || v.invite?.state === "pending"} onClick={() => run("invite", () => inviteWithVoucher(v.id, p.id), "邀请没发出去")}>约 {p.name}</button>)}</div> : null}
                </section>
                {!v.usedAt ? <button type="button" className="mt-primary" onClick={() => { redeemVoucher(v.id); refresh(); notice("已核销，玩得开心～"); }}>到店了，核销券码</button> : null}
                {v.usedAt ? (
                    <section className="mt-card">
                        <div className="mt-ck-h">评价</div>
                        {v.review ? <ReviewRow r={v.review} label="我的评价" /> : <button type="button" className="mt-more" onClick={() => setSheet(`vreview:${v.id}`)}>写评价</button>}
                        {v.charReview ? <ReviewRow r={v.charReview} label={`${nameOf(v.charReview.by || "")}的评价`} /> : null}
                    </section>
                ) : null}
            </div>
        );
    };

    // ── 我的（照真美团「我的」页） ──
    const me = useMemo(() => { try { return resolveUserIdentity(undefined, "chat"); } catch { return null; } }, []);
    const myReviews = useMemo(() => {
        const list: { r: MtReview; where: string }[] = [];
        for (const o of st.orders) if (o.review) list.push({ r: o.review, where: o.shopName });
        for (const v of st.vouchers) if (v.review) list.push({ r: v.review, where: v.deal.shopName });
        return list.sort((a, b) => b.r.at.localeCompare(a.r.at));
    }, [st.orders, st.vouchers]);
    const going = st.orders.filter(o => { const g = orderStage(o, now); return g !== "delivered" && g !== "cancelled"; }).length;
    const toReview = st.orders.filter(o => orderStage(o, now) === "delivered" && !o.review && o.to === MT_SELF).length + st.vouchers.filter(v => v.usedAt && !v.review).length;
    const unusedVouchers = st.vouchers.filter(v => !v.usedAt).length;
    const fromHim = st.orders.filter(o => o.from !== MT_SELF).length;
    const myShop = st.myShop;
    const ICON = (d: string) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
    const mine = (
        <div className="mt-page has-tab is-gray">
            <div className="mm-head">
                <div className="mm-user">
                    <Pic src={me?.avatarUrl || undefined} emoji="🙂" className="mm-ava" />
                    <div>
                        <b>{me?.name || addr.name || "美团用户"}</b>
                        <span className="mm-vip">美团会员 · 黄金</span>
                    </div>
                </div>
                <div className="mm-assets">
                    <button type="button" onClick={() => notice("红包都用在下单满减里啦")}><b>3</b><small>红包</small></button>
                    <button type="button" onClick={() => { tabTo({ id: "orders" }); setOrderTab("deal"); }}><b>{unusedVouchers}</b><small>团购券</small></button>
                    <button type="button" onClick={() => notice("余额在支付宝 / 钱包里")}><b>{formatWalletAmount(wallet.balance).replace(/^¥/, "")}</b><small>余额</small></button>
                    <button type="button" onClick={() => go({ id: "myReviews" })}><b>{myReviews.length}</b><small>我的评价</small></button>
                </div>
            </div>
            <section className="mt-card mm-card">
                <div className="mm-title"><b>我的订单</b><button type="button" className="mt-dim" onClick={() => tabTo({ id: "orders" })}>全部订单 ›</button></div>
                <div className="mm-grid is-4">
                    <button type="button" onClick={() => { tabTo({ id: "orders" }); setOrderTab("waimai"); }}>{ICON("M5 7h14l-1 13H6zM9 7a3 3 0 0 1 6 0")}{going ? <sup>{going}</sup> : null}<span>待收货</span></button>
                    <button type="button" onClick={() => go({ id: "myReviews" })}>{ICON("M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z")}{toReview ? <sup>{toReview}</sup> : null}<span>待评价</span></button>
                    <button type="button" onClick={() => { tabTo({ id: "orders" }); setOrderTab("deal"); }}>{ICON("M3 8h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 8v10")}{unusedVouchers ? <sup>{unusedVouchers}</sup> : null}<span>团购券</span></button>
                    <button type="button" onClick={() => tabTo({ id: "orders" })}>{ICON("M20 12a8 8 0 1 1-3-6.2M20 4v5h-5")}<span>退款/售后</span></button>
                </div>
            </section>
            {fromHim ? (
                <button type="button" className="mt-card mm-him" onClick={() => tabTo({ id: "orders" })}>
                    <span>💌</span><div><b>他给我点过 {fromHim} 次外卖</b><small>最近一次：{st.orders.find(o => o.from !== MT_SELF)?.shopName}</small></div><ChevronRight size={16} />
                </button>
            ) : null}
            <button type="button" className="mt-card mm-shop" onClick={() => tabTo({ id: "store" })}>
                <Pic src={myShop?.logo} emoji={myShop?.emoji || "🏪"} className="mm-shop-ic" />
                <div>
                    <b>{myShop ? myShop.name : "我的店"}</b>
                    <small>{myShop ? `${myShop.open ? "营业中" : "休息中"} · ${myShopRating(myShop).toFixed(1)} 分 · 可提现 ${mtYuan(myShop.balance)}` : "开一家自己的小店，当老板"}</small>
                </div>
                <em>{myShop ? "去后台" : "去开店"}</em>
            </button>
            <section className="mt-card mm-card">
                <div className="mm-title"><b>常用功能</b></div>
                <div className="mm-grid">
                    <button type="button" onClick={() => go({ id: "addresses" })}>{ICON("M12 21s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z")}<span>收货地址</span></button>
                    <button type="button" onClick={() => go({ id: "myReviews" })}>{ICON("M4 5h16v11H8l-4 4zM8 9h8M8 12h5")}<span>我的评价</span></button>
                    <button type="button" onClick={() => tabTo({ id: "store" })}>{ICON("M4 10h16l-1-5H5zM5 10v10h14V10M9 20v-5h6v5")}<span>我的店</span></button>
                    <button type="button" onClick={() => go({ id: "deals" })}>{ICON("M4 7h16v13H4zM4 11h16M9 3v4M15 3v4")}<span>团购</span></button>
                    <button type="button" onClick={() => go({ id: "settings" })}>{ICON("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4.3V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z")}<span>外卖设置</span></button>
                    <button type="button" onClick={() => notice("客服小美：亲，有什么可以帮您～")}>{ICON("M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v6H5a1 1 0 0 1-1-1zM20 13h-3v6h2a1 1 0 0 0 1-1z")}<span>联系客服</span></button>
                </div>
            </section>
            <section className="mt-card mm-addr" onClick={() => go({ id: "addresses" })}>
                {PIN}<div><b>{addr.address || "还没填收货地址"}</b><small>{addr.address ? `${addr.name} ${addr.phone}` : "点一下去填"}</small></div><ChevronRight size={16} />
            </section>
        </div>
    );

    const addressesPage = (
        <div className="mt-page is-gray">
            <Nav title="收货地址" onBack={back} />
            <section className="mt-card">
                <div className="mt-ck-h">我的地址</div>
                <button type="button" className="mt-ck-addr" onClick={() => setSheet("editMe")}>{PIN}<div><b>{addr.address || "还没填"}</b><small>{addr.name} {addr.phone}</small></div><ChevronRight size={16} /></button>
            </section>
            <section className="mt-card">
                <div className="mt-ck-h">他们的地址 <small className="mt-dim">和购物 app 共用</small></div>
                {people.map(p => {
                    const a = loadGiftStore().addresses[p.id];
                    return <button type="button" key={p.id} className="mt-ck-addr" onClick={() => setSheet(`charAddr:${p.id}`)}>{PIN}<div><b>{p.name} · {a?.address || "还没填"}</b><small>{a ? `${a.name} ${a.phone}` : "点一下填写，或者让他按人设编"}</small></div><ChevronRight size={16} /></button>;
                })}
                {!people.length ? <p className="mt-hint">还没有好友</p> : null}
            </section>
        </div>
    );

    const myReviewsPage = (
        <div className="mt-page is-gray">
            <Nav title="我的评价" onBack={back} />
            {myReviews.map(({ r, where }) => (
                <section className="mt-card" key={r.id}>
                    <div className="mt-ck-h">{where}</div>
                    <ReviewRow r={r} />
                </section>
            ))}
            {!myReviews.length ? <p className="mt-hint" style={{ textAlign: "center", marginTop: 60 }}>还没写过评价{toReview ? `，有 ${toReview} 单等你评价` : ""}</p> : null}
        </div>
    );

    const settingsPage = (
        <div className="mt-page is-gray">
            <Nav title="外卖设置" onBack={back} />
            <section className="mt-card">
                <div className="mt-kv">真实配送时长<button type="button" className={`mt-sw ${st.settings.realTime ? "on" : ""}`} onClick={() => updateMeituan(s => { s.settings.realTime = !s.settings.realTime; })} /></div>
                <p className="mt-hint">开着是 25~45 分钟送到；关了 3~6 分钟就到（我的店出餐配送也跟着变快）</p>
                <div className="mt-kv">允许他主动给我点外卖<button type="button" className={`mt-sw ${st.settings.allowCharOrders ? "on" : ""}`} onClick={() => updateMeituan(s => { s.settings.allowCharOrders = !s.settings.allowCharOrders; })} /></div>
                <p className="mt-hint">关了他只在聊天里你要的时候才点，也不会自己跑来你店里光顾</p>
            </section>
        </div>
    );

    let body: React.ReactNode = home;
    if (page.id === "waimai") body = waimai;
    else if (page.id === "cat") body = catPage(page.cat);
    else if (page.id === "search") body = searchPage;
    else if (page.id === "shop") body = shopPage(page.shopId);
    else if (page.id === "checkout") body = checkout(page.shopId);
    else if (page.id === "orders") body = orders;
    else if (page.id === "order") body = orderPage(page.orderId);
    else if (page.id === "rider") body = riderPage(page.orderId);
    else if (page.id === "deals") body = deals;
    else if (page.id === "voucher") body = voucherPage(page.voucherId);
    else if (page.id === "mine") body = mine;
    else if (page.id === "store") body = <MyShopView st={st} people={people} busy={busy} run={run} notice={notice} refresh={refresh} />;
    else if (page.id === "addresses") body = addressesPage;
    else if (page.id === "myReviews") body = myReviewsPage;
    else if (page.id === "settings") body = settingsPage;

    const showTab = page.id === "home" || page.id === "orders" || page.id === "mine" || page.id === "store";

    return (
        <div className="mt-app">
            {body}
            {showTab ? tabbar : null}
            {showTab && page.id === "home" ? <button type="button" className="mt-close" onClick={onClose}>关闭</button> : null}
            {sheet ? (
                <MtSheets
                    sheet={sheet}
                    close={() => setSheet(null)}
                    st={st}
                    people={people}
                    addr={addr}
                    setAddr={a => { setAddr(a); updateGiftStore(s => { s.addresses[USER_ADDRESS_ID] = a; }); }}
                    setToAddr={setToAddr}
                    refresh={refresh}
                    notice={notice}
                    busy={busy}
                    run={run}
                    openVoucher={id => go({ id: "voucher", voucherId: id })}
                />
            ) : null}
        </div>
    );
}

function riderPos(t: number): React.CSSProperties {
    // 沿着商家 (300,60) → 家 (60,190) 的弧线走
    const u = 1 - t;
    const x = u * u * u * 300 + 3 * u * u * t * 200 + 3 * u * t * t * 140 + t * t * t * 60;
    const y = u * u * u * 60 + 3 * u * u * t * 110 + 3 * u * t * t * 170 + t * t * t * 190;
    return { left: `${(x / 375) * 100}%`, top: y - 20 };
}

function ReviewRow({ r, label }: { r: MtReview; label?: string }) {
    return (
        <div className={`mt-rv ${r.by ? "is-mine" : ""}`}>
            <div className="mt-rvh"><i>{r.name.slice(0, 1)}</i><b>{r.name}</b><Stars n={r.stars} small />{label ? <span className="mt-rvl">{label}</span> : null}</div>
            <p>{r.text}</p>
            <small>口味 {r.taste} · 包装 {r.pack} · {r.at.slice(5, 10)}</small>
        </div>
    );
}

function Hero({ shop, onBack, onPic }: { shop: MtShop; onBack: () => void; onPic: () => void }) {
    const url = useMediaUrl(shop.img);
    return (
        <div className="mt-hero" style={url ? { backgroundImage: `url(${url})` } : undefined}>
            <button type="button" className="mt-back is-float" onClick={onBack}><ChevronLeft size={22} /></button>
            <button type="button" className="mt-up" onClick={onPic}>换图 · 生图</button>
        </div>
    );
}

function ShopAutoMenu({ shop, run }: { shop: MtShop; run: (label: string, fn: () => Promise<unknown>, fail?: string) => Promise<void> }) {
    const tried = useRef("");
    useEffect(() => {
        if (tried.current === shop.id) return;
        if (shop.dishes?.length) return;
        tried.current = shop.id;
        void run(`menu:${shop.id}`, () => generateShopMenu(shop.id), "菜单没出来，去「商家」里重新生成");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shop.id]);
    return null;
}

// ── 弹层 ──

function MtSheets(props: {
    sheet: string;
    close: () => void;
    st: MeituanState;
    people: Person[];
    addr: GiftAddress;
    setAddr: (a: GiftAddress) => void;
    setToAddr: (a: GiftAddress) => void;
    refresh: () => void;
    notice: (m: string) => void;
    busy: string;
    run: (label: string, fn: () => Promise<unknown>, fail?: string) => Promise<void>;
    openVoucher: (id: string) => void;
}) {
    const { sheet, close, st, people, addr, setAddr, notice, run, busy } = props;
    const [kind, a = "", b = "", c = ""] = sheet.split(":");
    const [form, setForm] = useState<GiftAddress>(() => kind === "charAddr" ? (loadGiftStore().addresses[a] || { name: people.find(p => p.id === a)?.name || "", phone: "", address: "" }) : addr);
    const [stars, setStars] = useState(5);
    const [text, setText] = useState("");
    const [account, setAccount] = useState(WALLET_BALANCE_ACCOUNT_ID);
    const fileRef = useRef<HTMLInputElement>(null);
    const wallet = useMemo(() => loadWalletState(), []);

    const addrForm = (save: (x: GiftAddress) => void, extra?: React.ReactNode) => (
        <>
            <label className="mt-field"><span>收件人</span><input className="mt-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label className="mt-field"><span>电话</span><input className="mt-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="可以打码" /></label>
            <label className="mt-field"><span>地址</span><input className="mt-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="城市 + 路 + 小区 + 门牌" /></label>
            {extra}
            <button type="button" className="mt-primary" disabled={!form.address.trim()} onClick={() => { save({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() }); close(); }}>保存</button>
        </>
    );

    if (kind === "address") {
        return (
            <Sheet title="选择收货地址" onClose={close}>
                <div className="mt-sub">我的地址</div>
                <button type="button" className="mt-addr on" onClick={close}>{PIN}<div><b>{addr.address || "还没填"}</b><small>{addr.name} {addr.phone}</small></div></button>
                <div className="mt-sub">他们的地址 · 下单时选「给谁吃」就会送过去</div>
                {people.map(p => {
                    const x = loadGiftStore().addresses[p.id];
                    return <div className="mt-addr" key={p.id}>{PIN}<div><b>{p.name} · {x?.address || "还没填"}</b><small>{x ? `${x.name} ${x.phone}` : "结算时选他，会让他按人设编一个"}</small></div></div>;
                })}
                <MeEditInline addr={addr} setAddr={setAddr} />
            </Sheet>
        );
    }
    if (kind === "editMe") return <Sheet title="我的收货地址" onClose={close}>{addrForm(setAddr)}</Sheet>;
    if (kind === "charAddr") {
        const name = people.find(p => p.id === a)?.name || "他";
        return (
            <Sheet title={`${name}的地址`} onClose={close}>
                {addrForm(x => { updateGiftStore(s => { s.addresses[a] = x; }); props.setToAddr(x); props.refresh(); }, (
                    <button type="button" className="mt-link" disabled={!!busy} onClick={() => run("addr", async () => {
                        updateGiftStore(s => { delete s.addresses[a]; });
                        const x = await charAddress(a);
                        setForm(x);
                        props.setToAddr(x);
                    })}>{busy === "addr" ? "他在想…" : "让他按人设编一个"}</button>
                ))}
            </Sheet>
        );
    }
    if (kind === "pic") {
        const shop = st.shops.find(s => s.id === b);
        const dish = kind === "pic" && a === "dish" ? shop?.dishes?.find(d => d.id === c) : undefined;
        if (!shop) return null;
        const target = a === "shop" ? "门头" : dish?.name || "菜";
        const apply = (ref: string, which: "img" | "logo") => {
            updateMeituan(s => {
                const x = s.shops.find(q => q.id === shop.id);
                if (!x) return;
                if (a === "shop") x[which] = ref;
                else { const d = x.dishes?.find(q => q.id === c); if (d) d.img = ref; }
            });
            props.refresh();
        };
        return (
            <Sheet title={`${shop.name} · ${target}`} onClose={close}>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={async e => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const ref = await storeMediaBlob(f, f.type || "image/jpeg", "image");
                    apply(ref, fileRef.current?.dataset.which === "logo" ? "logo" : "img");
                    close();
                }} />
                <button type="button" className="mt-opt" onClick={() => { if (fileRef.current) fileRef.current.dataset.which = "img"; fileRef.current?.click(); }}><ImagePlus size={18} />上传{a === "shop" ? "店铺大图" : "菜品图"}</button>
                {a === "shop" ? <button type="button" className="mt-opt" onClick={() => { if (fileRef.current) fileRef.current.dataset.which = "logo"; fileRef.current?.click(); }}><ImagePlus size={18} />上传店铺头像</button> : null}
                <button type="button" className="mt-opt" disabled={!!busy} onClick={() => {
                    if (!isMtImageReady()) { notice("先在设置里打开生图"); return; }
                    const desc = a === "shop"
                        ? `外卖平台店铺「${shop.name}」的招牌菜品摆拍大图，${shop.desc}，美食摄影，俯拍或45度，暖光，干净背景，不要文字`
                        : `外卖菜品「${dish?.name}」${dish?.desc ? `，${dish.desc}` : ""}，装在外卖餐盒或盘子里，美食摄影，45度，暖光，干净背景，不要文字`;
                    close();
                    void run("img", async () => { const ref = await generateMtImage(desc); if (ref) apply(ref, "img"); else throw new Error("no image"); }, "生图失败了");
                }}><Sparkles size={18} />AI 生成一张{busy === "img" ? "（生成中…）" : ""}</button>
                {(a === "shop" ? shop.img || shop.logo : dish?.img) ? <button type="button" className="mt-opt red" onClick={() => {
                    updateMeituan(s => { const x = s.shops.find(q => q.id === shop.id); if (!x) return; if (a === "shop") { x.img = undefined; x.logo = undefined; } else { const d = x.dishes?.find(q => q.id === c); if (d) d.img = undefined; } });
                    props.refresh(); close();
                }}>恢复默认</button> : null}
            </Sheet>
        );
    }
    if (kind === "review" || kind === "vreview") {
        return (
            <Sheet title="写评价" onClose={close}>
                <div className="mt-rate">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} className={n <= stars ? "on" : ""} onClick={() => setStars(n)}>★</button>)}</div>
                <textarea className="mt-input" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="味道怎么样？分量、包装、配送…" maxLength={200} />
                <button type="button" className="mt-primary" disabled={!text.trim()} onClick={() => {
                    if (kind === "review") submitReview(a, { stars, taste: stars, pack: Math.max(3, stars), text: text.trim() });
                    else reviewVoucher(a, { stars, text: text.trim() });
                    props.refresh(); close(); notice("评价好了");
                }}>发布</button>
            </Sheet>
        );
    }
    if (kind === "deal") {
        const d: MtDeal | undefined = st.deals.find(x => x.id === a);
        if (!d) return null;
        const accounts = [
            { id: WALLET_BALANCE_ACCOUNT_ID, label: `余额（${formatWalletAmount(wallet.balance)}）`, balance: wallet.balance },
            ...wallet.cards.map(cd => ({ id: cd.id, label: cd.kin ? `${cd.kin.charName}的亲属卡（剩 ${formatWalletAmount(cd.balance)}）` : `${cd.bankLabel} ${cd.title}（${formatWalletAmount(cd.balance)}）`, balance: cd.balance })),
        ];
        const acc = accounts.find(x => x.id === account) || accounts[0];
        return (
            <Sheet title={d.shopName} onClose={close}>
                <Pic src={d.img} emoji={d.emoji} className="mt-vimg" />
                <p className="mt-p"><b>{d.title}</b> · {d.desc}</p>
                <div className="mt-dprice" style={{ margin: "6px 0 12px" }}><em>¥{d.price}</em><s>¥{d.origin}</s><span>{d.sold}</span></div>
                <select className="mt-input" value={acc.id} onChange={e => setAccount(e.target.value)}>{accounts.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
                <button type="button" className="mt-primary" disabled={acc.balance < d.price} onClick={() => {
                    const r = buyDeal(d, acc.id);
                    if (!r.ok || !r.voucher) { notice(r.error || "付款失败"); return; }
                    props.refresh(); close(); props.openVoucher(r.voucher.id); notice("买好了，可以约他一起去");
                }}>{acc.balance < d.price ? "余额不足" : `立即抢购 ¥${d.price}`}</button>
                <button type="button" className="mt-link" onClick={() => {
                    if (!isMtImageReady()) { notice("先在设置里打开生图"); return; }
                    close();
                    void run("img", async () => {
                        const ref = await generateMtImage(`「${d.shopName}」${d.title}，${d.desc}，团购套餐实拍，美食或场景摄影，暖光，不要文字`);
                        if (!ref) throw new Error("no image");
                        updateMeituan(s => { const x = s.deals.find(q => q.id === d.id); if (x) x.img = ref; });
                    }, "生图失败了");
                }}>给这个团购生一张图</button>
            </Sheet>
        );
    }
    return null;
}

/** 选地址弹层里直接改我的地址 */
function MeEditInline({ addr, setAddr }: { addr: GiftAddress; setAddr: (a: GiftAddress) => void }) {
    const [open, setOpen] = useState(!addr.address);
    const [form, setForm] = useState<GiftAddress>(addr);
    if (!open) return <button type="button" className="mt-link" onClick={() => setOpen(true)}>＋ 填写 / 修改我的地址</button>;
    return (
        <div className="mt-inline">
            <input className="mt-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="收件人" />
            <input className="mt-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="电话（可以打码）" />
            <input className="mt-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="地址：城市 + 路 + 小区 + 门牌" />
            <button type="button" className="mt-primary" disabled={!form.address.trim()} onClick={() => { setAddr({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() }); setOpen(false); }}>保存</button>
        </div>
    );
}
