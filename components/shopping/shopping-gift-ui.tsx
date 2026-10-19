"use client";

// 购物 app 送礼扩展的界面：收货人与地址、优惠券、评价区和问大家、店铺客服、到货弹窗、送礼设置。
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MessageCircle, Plus, Send, Sparkles, Star, Trash2, X } from "lucide-react";

import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import type { AppCardChatSharePayload } from "@/lib/chat-share";
import { createOrGetSession } from "@/lib/chat-storage";
import { USER_IDENTITY_SWITCHED_EVENT } from "@/lib/identity-scope";
import { answerQuestion, generateProductExtras, kefuReply, writeCharAddress } from "@/lib/shopping-gift-engine";
import { giftableChars, isDelivered, SHOPPING_GIFT_ARRIVED_EVENT } from "@/lib/shopping-gift-service";
import {
    giftId,
    loadGiftStore,
    productKey,
    SHOPPING_GIFT_STORE_EVENT,
    updateGiftStore,
    USER_ADDRESS_ID,
    type GiftAddress,
    type GiftOrderMeta,
    type ProductExtras,
    type ShoppingGiftStore,
} from "@/lib/shopping-gift-store";
import type { ShoppingOrder, ShoppingProduct } from "@/lib/shopping-types";

const ORANGE = "#ff6b00";
const fs = (px: number) => `calc(${px}px*var(--app-text-scale,1))`;

export function useGiftStore(): ShoppingGiftStore {
    const [store, setStore] = useState<ShoppingGiftStore>(() => loadGiftStore());
    useEffect(() => {
        const sync = () => setStore(loadGiftStore());
        sync();
        window.addEventListener(SHOPPING_GIFT_STORE_EVENT, sync);
        window.addEventListener(USER_IDENTITY_SWITCHED_EVENT, sync);
        return () => {
            window.removeEventListener(SHOPPING_GIFT_STORE_EVENT, sync);
            window.removeEventListener(USER_IDENTITY_SWITCHED_EVENT, sync);
        };
    }, []);
    return store;
}

/** 当前身份下能送礼的 char。每次渲染现算：购物 app 可能比聊天数据先加载，算一次会漏人 */
export function useGiftChars(): Character[] {
    const [, setRevision] = useState(0);
    useEffect(() => {
        const bump = () => setRevision(r => r + 1);
        window.addEventListener(USER_IDENTITY_SWITCHED_EVENT, bump);
        return () => window.removeEventListener(USER_IDENTITY_SWITCHED_EVENT, bump);
    }, []);
    const ids = giftableChars(true);
    const chars = loadCharacters();
    return ids.map(id => chars.find(c => c.id === id)).filter((c): c is Character => Boolean(c));
}

export function openChatSession(charId: string) {
    const session = createOrGetSession(charId);
    window.dispatchEvent(new CustomEvent("nox-open-chat-session", { detail: { sessionId: session.id } }));
}

function Avatar({ char, size = 26, me = false }: { char?: Character | null; size?: number; me?: boolean }) {
    const style = { width: size, height: size, borderRadius: "50%", flex: "none", objectFit: "cover" as const, background: me ? "#f8c6d2" : "#c9d6ea" };
    return char?.avatar ? <img src={char.avatar} alt="" style={style} /> : <span style={{ ...style, display: "inline-block" }} />;
}

const label = { fontSize: fs(11), color: "#999", fontWeight: 700, margin: "0 0 8px" } as const;
const inputStyle = { width: "100%", boxSizing: "border-box" as const, border: "1px solid #eee", borderRadius: "12px", padding: "9px 11px", fontSize: fs(12), color: "#222", outline: "none", background: "#fff", fontFamily: "inherit" };

// ── 结算：送给谁 ─────────────────────────────

export type RecipientChoice = { id: string; note: string; share: boolean };

export function RecipientSection({ value, onChange }: { value: RecipientChoice; onChange: (next: RecipientChoice) => void }) {
    const store = useGiftStore();
    const chars = useGiftChars();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<GiftAddress>({ name: "", phone: "", address: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const isMe = value.id === USER_ADDRESS_ID;
    const char = chars.find(c => c.id === value.id);
    const address = store.addresses[value.id];

    useEffect(() => {
        setEditing(false);
        setError("");
    }, [value.id]);

    const startEdit = () => {
        setDraft(address ?? { name: isMe ? "" : char?.name || "", phone: "", address: "" });
        setEditing(true);
    };
    const saveDraft = () => {
        if (!draft.address.trim()) return setError("地址还没填");
        updateGiftStore(s => { s.addresses[value.id] = { name: draft.name.trim(), phone: draft.phone.trim(), address: draft.address.trim() }; });
        setEditing(false);
        setError("");
    };
    const letHimWrite = async () => {
        if (!char) return;
        setBusy(true);
        setError("");
        try {
            const next = await writeCharAddress(char.id);
            if (!next) throw new Error("没写出来，再试一次");
            setDraft(next);
            setEditing(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "生成失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ marginBottom: "14px" }}>
            <p style={label}>送给谁</p>
            <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "2px", scrollbarWidth: "none" }}>
                {[{ id: USER_ADDRESS_ID, name: "我自己", char: null as Character | null }, ...chars.map(c => ({ id: c.id, name: c.name, char: c }))].map(opt => {
                    const active = value.id === opt.id;
                    return (
                        <button key={opt.id} type="button" onClick={() => onChange({ ...value, id: opt.id })} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "7px", border: `1.5px solid ${active ? ORANGE : "#eee"}`, background: active ? "#fff7ed" : "#fff", color: active ? "#c2410c" : "#444", borderRadius: "14px", padding: "7px 12px 7px 8px", fontSize: fs(13), fontWeight: 700 }}>
                            <Avatar char={opt.char} me={opt.id === USER_ADDRESS_ID} />
                            {opt.name}
                        </button>
                    );
                })}
            </div>

            {editing ? (
                <div style={{ marginTop: "10px", display: "grid", gap: "7px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
                        <input style={inputStyle} placeholder="收件人" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                        <input style={inputStyle} placeholder="电话" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} />
                    </div>
                    <textarea style={{ ...inputStyle, minHeight: "54px", resize: "none" }} placeholder="地址" value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} />
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        {!isMe ? <button type="button" disabled={busy} onClick={letHimWrite} style={ghostBtn}>{busy ? "他在写…" : "让他重写"}</button> : null}
                        <button type="button" onClick={() => setEditing(false)} style={ghostBtn}>取消</button>
                        <button type="button" onClick={saveDraft} style={solidBtn}>保存地址</button>
                    </div>
                </div>
            ) : address ? (
                <div style={{ marginTop: "10px", background: "#f8f9fa", borderRadius: "12px", padding: "9px 11px", fontSize: fs(12), color: "#555", lineHeight: 1.5, display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ color: "#111" }}>{address.name}</b>　{address.phone}
                        <div>{address.address}</div>
                    </div>
                    <button type="button" onClick={startEdit} style={{ border: "none", background: "none", color: ORANGE, fontSize: fs(12), fontWeight: 700, padding: 0, alignSelf: "center" }}>改</button>
                </div>
            ) : (
                <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
                    <button type="button" onClick={startEdit} style={{ ...ghostBtn, flex: 1 }}>{isMe ? "填写我的地址" : "自己填他的地址"}</button>
                    {!isMe ? <button type="button" disabled={busy} onClick={letHimWrite} style={{ ...ghostBtn, flex: 1, color: ORANGE }}>{busy ? "他在写…" : "让他按人设写"}</button> : null}
                </div>
            )}
            {error ? <div style={{ color: "#b91c1c", fontSize: fs(11), marginTop: "6px" }}>{error}</div> : null}

            {!isMe ? (
                <>
                    <p style={{ ...label, marginTop: "12px" }}>给他的备注（可不填）</p>
                    <textarea style={{ ...inputStyle, minHeight: "44px", resize: "none" }} maxLength={120} placeholder="写一句放进包裹里的话" value={value.note} onChange={e => onChange({ ...value, note: e.target.value })} />
                    <div style={{ display: "flex", background: "#f4f4f5", borderRadius: "12px", padding: "3px", marginTop: "10px" }}>
                        {[{ share: true, text: "分享给他" }, { share: false, text: "不说，当惊喜" }].map(opt => (
                            <button key={opt.text} type="button" onClick={() => onChange({ ...value, share: opt.share })} style={{ flex: 1, border: "none", borderRadius: "10px", padding: "7px 0", fontSize: fs(12), fontWeight: 700, background: value.share === opt.share ? "#fff" : "transparent", color: value.share === opt.share ? ORANGE : "#666", boxShadow: value.share === opt.share ? "0 1px 3px rgba(0,0,0,0.06)" : "none" }}>
                                {opt.text}
                            </button>
                        ))}
                    </div>
                    <div style={{ fontSize: fs(11), color: "#999", marginTop: "6px" }}>
                        {value.share ? "订单卡片会发到你们的聊天里，可以直接跟他聊" : "到货之前他都不知道，签收那一刻才是惊喜"}
                    </div>
                </>
            ) : null}
        </div>
    );
}

const ghostBtn = { border: "1px solid #eee", background: "#fff", color: "#555", borderRadius: "12px", padding: "8px 12px", fontSize: fs(12), fontWeight: 700 } as const;
const solidBtn = { border: "none", background: ORANGE, color: "#fff", borderRadius: "12px", padding: "8px 14px", fontSize: fs(12), fontWeight: 800 } as const;

/** 下单前检查：送他的必须有地址 */
export function recipientError(store: ShoppingGiftStore, choice: RecipientChoice): string | null {
    if (choice.id === USER_ADDRESS_ID) return null;
    return store.addresses[choice.id]?.address ? null : "先填好他的收货地址";
}

// ── 订单里的送礼信息 ─────────────────────────

export function OrderGiftTags({ meta, order, now }: { meta?: GiftOrderMeta; order: ShoppingOrder; now: number }) {
    if (!meta || (!meta.to && !meta.from)) return null;
    const delivered = isDelivered(order, now);
    const tag = { display: "inline-block", fontSize: fs(11), fontWeight: 800, padding: "3px 8px", borderRadius: "8px", marginRight: "6px" } as const;
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            <span style={{ ...tag, background: "#fff7ed", color: "#c2410c" }}>{meta.to ? `送给${meta.toName || "他"}` : `${meta.fromName || "他"}送的`}</span>
            {meta.to && !meta.share && !delivered ? <span style={{ ...tag, background: "#f4f4f5", color: "#666" }}>惊喜 · 他还不知道</span> : null}
            {meta.to && delivered ? <span style={{ ...tag, background: "#dcfce7", color: "#15803d" }}>他已签收</span> : null}
        </div>
    );
}

export function OrderGiftCard({ meta, order }: { meta?: GiftOrderMeta; order: ShoppingOrder }) {
    const store = useGiftStore();
    if (!meta || (!meta.to && !meta.from)) return null;
    const charId = meta.to || meta.from || "";
    const address = meta.to ? store.addresses[meta.to] : store.addresses[USER_ADDRESS_ID];
    return (
        <div style={{ background: "#fff", borderRadius: "20px", padding: "18px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }}>
            <h4 style={{ fontSize: fs(13), fontWeight: "bold", color: "#222", margin: "0 0 10px" }}>{meta.to ? "送给他" : "他送你的"}</h4>
            {address ? (
                <div style={{ fontSize: fs(12), color: "#555", lineHeight: 1.55, marginBottom: "10px" }}>
                    <b style={{ color: "#111" }}>{address.name}</b>　{address.phone}<br />{address.address}
                </div>
            ) : null}
            <div style={{ fontSize: fs(11), color: "#999", marginBottom: "4px" }}>{meta.to ? "你的备注" : "他的留言"}</div>
            <div style={{ fontSize: fs(13), color: "#222", lineHeight: 1.5 }}>{meta.note || (meta.to ? "没写备注" : "没写留言")}</div>
            <button type="button" onClick={() => openChatSession(charId)} style={{ ...ghostBtn, marginTop: "12px", width: "100%", color: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <MessageCircle size={15} />去跟{meta.to ? meta.toName || "他" : meta.fromName || "他"}聊
            </button>
        </div>
    );
}

// ── 他送的包裹到了 ───────────────────────────

export function PackagePopup({ orders, visible }: { orders: ShoppingOrder[]; visible: boolean }) {
    const store = useGiftStore();
    const [, setTick] = useState(0);
    useEffect(() => {
        const bump = () => setTick(t => t + 1);
        window.addEventListener(SHOPPING_GIFT_ARRIVED_EVENT, bump);
        return () => window.removeEventListener(SHOPPING_GIFT_ARRIVED_EVENT, bump);
    }, []);
    if (!visible) return null;
    const order = orders.find(o => {
        const meta = store.orders[o.id];
        return meta?.from && meta.arrivedAt && !meta.popupDone;
    });
    if (!order) return null;
    const meta = store.orders[order.id];
    const item = order.items[0];
    const close = () => updateGiftStore(s => { s.orders[order.id] = { ...s.orders[order.id], popupDone: true }; });
    return (
        <div className="cp-shopping-translation-overlay" role="presentation" style={{ zIndex: 60 }}>
            <div className="cp-shopping-translation-sheet" role="dialog" aria-modal="true" aria-label="你有一个包裹" style={{ textAlign: "center", padding: "22px 18px 18px" }}>
                <div style={{ fontSize: "46px", lineHeight: 1 }}>📦</div>
                <h3 style={{ margin: "10px 0 4px", fontSize: fs(17) }}>你有一个包裹</h3>
                <p style={{ margin: "0 0 14px", fontSize: fs(12), color: "#888" }}>寄件人：{meta.fromName || "他"}　·　已签收</p>
                <div style={{ background: "#f8f9fa", borderRadius: "16px", padding: "12px", display: "flex", gap: "10px", alignItems: "center", textAlign: "left", marginBottom: "14px" }}>
                    <div style={{ width: "54px", height: "54px", borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", flex: "none" }}>{item?.previewIcon || "🎁"}</div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: fs(13), fontWeight: 700, color: "#222" }}>{order.summary}</div>
                        <div style={{ fontSize: fs(11), color: "#999", marginTop: "4px", lineHeight: 1.45 }}>{meta.note ? `他留言：${meta.note}` : "没有留言"}</div>
                    </div>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                    <button type="button" onClick={close} style={{ ...ghostBtn, flex: 1, padding: "11px 0", borderRadius: "18px" }}>收下</button>
                    <button type="button" onClick={() => { close(); if (meta.from) openChatSession(meta.from); }} style={{ ...solidBtn, flex: 1.4, padding: "11px 0", borderRadius: "18px" }}>去跟他说</button>
                </div>
            </div>
        </div>
    );
}

// ── 心愿单标记 ───────────────────────────────

export function WishMarkTag({ productId }: { productId: string }) {
    const store = useGiftStore();
    const mark = store.wish[productId];
    if (!mark) return null;
    const chars = loadCharacters();
    const nameOf = (id?: string) => chars.find(c => c.id === id)?.name || "他";
    const style = { position: "absolute" as const, left: "12px", top: "12px", zIndex: 2, fontSize: fs(10), fontWeight: 800, padding: "3px 7px", borderRadius: "8px" };
    if (mark.giftedBy) return <span style={{ ...style, background: "#dcfce7", color: "#15803d" }}>{mark.giftedName || nameOf(mark.giftedBy)}已送</span>;
    if (mark.seenBy?.length) return <span style={{ ...style, background: "#fff7ed", color: "#c2410c" }}>{mark.seenBy.length > 1 ? "有人看过" : `${nameOf(mark.seenBy[0])}看过`}</span>;
    return null;
}

// ── 商品页：问问他、客服、评价、问大家 ───────

export function ProductActions({ product, onKefu }: { product: ShoppingProduct; onKefu: () => void }) {
    const askHim = () => {
        const share: AppCardChatSharePayload = {
            type: "app_card",
            appName: "购物",
            title: product.title,
            summary: "",
            historyText: `[购物商品卡片] 分享了一件商品想问你的意见：${product.title}（${product.merchantLabel}，${product.priceLabel}）。介绍：${product.detail || product.subtitle}`,
            layout: {
                appLabel: "购物 · 商品",
                title: `${product.previewIcon} ${product.title}`,
                subtitle: `${product.priceLabel}　${product.merchantLabel}`,
                body: product.subtitle,
                openDisabled: true,
            },
        };
        window.dispatchEvent(new CustomEvent("open-mini-chat", { detail: { share } }));
    };
    const btn = { flex: 1, border: "1px solid #f0f0f0", background: "#fafafa", color: "#333", borderRadius: "14px", padding: "10px 0", fontSize: fs(12), fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" } as const;
    return (
        <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
            <button type="button" onClick={askHim} style={btn}><Send size={14} />问问他</button>
            <button type="button" onClick={onKefu} style={btn}><MessageCircle size={14} />客服</button>
        </div>
    );
}

function Stars({ n }: { n: number }) {
    return (
        <span style={{ display: "inline-flex", gap: "1px" }}>
            {[1, 2, 3, 4, 5].map(i => <Star key={i} size={11} fill={i <= n ? "#ffb800" : "none"} color={i <= n ? "#ffb800" : "#ddd"} />)}
        </span>
    );
}

export function ProductExtrasSection({ product, canReview }: { product: ShoppingProduct; canReview: boolean }) {
    const store = useGiftStore();
    const key = productKey(product);
    const extras: ProductExtras | undefined = store.products[key];
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [tab, setTab] = useState<"reviews" | "qa">("reviews");
    const [showAll, setShowAll] = useState(false);
    const [writing, setWriting] = useState(false);
    const [myStars, setMyStars] = useState(5);
    const [myText, setMyText] = useState("");
    const [asking, setAsking] = useState("");
    const [askBusy, setAskBusy] = useState(false);
    const started = useRef("");

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const { reviews, qa } = await generateProductExtras(product);
            updateGiftStore(s => {
                const old = s.products[key];
                const kept = (old?.reviews || []).filter(r => r.charId || r.mine);
                s.products[key] = { title: product.title, reviews: [...kept, ...reviews], qa: [...(old?.qa || []).filter(q => q.mine), ...qa], generatedAt: new Date().toISOString() };
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (started.current === key) return;
        started.current = key;
        if (!loadGiftStore().products[key]?.generatedAt) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const reviews = useMemo(() => {
        const list = extras?.reviews || [];
        return [...list.filter(r => r.gift || r.charId), ...list.filter(r => r.mine), ...list.filter(r => !r.gift && !r.charId && !r.mine)];
    }, [extras]);
    const hasMine = reviews.some(r => r.mine);

    const submitReview = () => {
        if (!myText.trim()) return;
        updateGiftStore(s => {
            const ex = s.products[key] || { title: product.title, reviews: [], qa: [] };
            ex.reviews = [{ id: giftId("rv"), author: "我", stars: myStars, text: myText.trim(), at: new Date().toISOString(), mine: true }, ...ex.reviews];
            s.products[key] = ex;
        });
        setWriting(false);
        setMyText("");
    };

    const ask = async () => {
        const q = asking.trim();
        if (!q) return;
        setAskBusy(true);
        const id = giftId("qa");
        updateGiftStore(s => {
            const ex = s.products[key] || { title: product.title, reviews: [], qa: [] };
            ex.qa = [{ id, q, answers: [], mine: true, at: new Date().toISOString() }, ...ex.qa];
            s.products[key] = ex;
        });
        setAsking("");
        try {
            const answers = await answerQuestion(product, q);
            updateGiftStore(s => {
                const item = s.products[key]?.qa.find(x => x.id === id);
                if (item) { item.answers = answers; item.total = answers.length; }
            });
        } catch {
            // 没人答就先空着
        } finally {
            setAskBusy(false);
        }
    };

    const tabBtn = (id: "reviews" | "qa", text: string) => (
        <button type="button" onClick={() => setTab(id)} style={{ border: "none", background: "none", padding: "0 0 6px", marginRight: "18px", fontSize: fs(14), fontWeight: 800, color: tab === id ? "#222" : "#aaa", borderBottom: `2px solid ${tab === id ? ORANGE : "transparent"}` }}>{text}</button>
    );
    const shown = showAll ? reviews : reviews.slice(0, 3);

    return (
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "14px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
                {tabBtn("reviews", `评价${reviews.length ? ` ${reviews.length}` : ""}`)}
                {tabBtn("qa", `问大家${extras?.qa.length ? ` ${extras.qa.length}` : ""}`)}
            </div>
            {loading ? <div style={{ fontSize: fs(12), color: "#999", padding: "10px 0" }}>正在加载评价…</div> : null}
            {error ? (
                <div style={{ fontSize: fs(12), color: "#b91c1c", padding: "6px 0", display: "flex", alignItems: "center", gap: "8px" }}>
                    评价没加载出来 <button type="button" onClick={load} style={{ ...ghostBtn, padding: "4px 10px" }}>重试</button>
                </div>
            ) : null}

            {tab === "reviews" ? (
                <>
                    {shown.map(r => (
                        <div key={r.id} style={{ display: "flex", gap: "9px", padding: "10px", margin: "0 -10px", borderRadius: "12px", background: r.gift || r.charId ? "#fff7ed" : "transparent" }}>
                            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: r.mine ? "#f8c6d2" : r.charId ? "#c9d6ea" : "#e5e5e5", flex: "none" }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: fs(12), fontWeight: 700, color: "#333", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                    {r.author}
                                    {r.gift ? <span style={{ fontSize: fs(10), fontWeight: 800, color: "#c2410c", background: "#ffedd5", borderRadius: "6px", padding: "1px 6px" }}>收到的礼物</span> : null}
                                    {r.mine ? <span style={{ fontSize: fs(10), fontWeight: 800, color: "#be185d", background: "#fce7f3", borderRadius: "6px", padding: "1px 6px" }}>我的评价</span> : null}
                                </div>
                                <Stars n={r.stars} />
                                <div style={{ fontSize: fs(12), color: "#444", lineHeight: 1.55, marginTop: "3px", whiteSpace: "pre-wrap" }}>{r.text}</div>
                            </div>
                        </div>
                    ))}
                    {reviews.length > 3 ? (
                        <button type="button" onClick={() => setShowAll(v => !v)} style={{ border: "none", background: "none", color: "#888", fontSize: fs(12), padding: "8px 0", display: "flex", alignItems: "center", gap: "4px" }}>
                            {showAll ? "收起" : `查看全部 ${reviews.length} 条`}<ChevronDown size={13} style={{ transform: showAll ? "rotate(180deg)" : "none" }} />
                        </button>
                    ) : null}
                    {canReview && !hasMine ? (
                        writing ? (
                            <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
                                <div style={{ display: "flex", gap: "4px" }}>
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <button key={i} type="button" onClick={() => setMyStars(i)} style={{ border: "none", background: "none", padding: 0 }}>
                                            <Star size={20} fill={i <= myStars ? "#ffb800" : "none"} color={i <= myStars ? "#ffb800" : "#ddd"} />
                                        </button>
                                    ))}
                                </div>
                                <textarea style={{ ...inputStyle, minHeight: "60px", resize: "none" }} placeholder="用起来怎么样" value={myText} onChange={e => setMyText(e.target.value)} />
                                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                    <button type="button" onClick={() => setWriting(false)} style={ghostBtn}>取消</button>
                                    <button type="button" onClick={submitReview} style={solidBtn}>发布评价</button>
                                </div>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setWriting(true)} style={{ ...ghostBtn, width: "100%", marginTop: "8px", color: ORANGE }}>写评价</button>
                        )
                    ) : null}
                </>
            ) : (
                <>
                    {(extras?.qa || []).map(item => (
                        <div key={item.id} style={{ padding: "9px 0", borderTop: "1px solid #f5f5f5", fontSize: fs(12) }}>
                            <div style={{ fontWeight: 700, color: "#222", display: "flex", gap: "6px" }}>
                                <span style={{ background: ORANGE, color: "#fff", borderRadius: "4px", padding: "0 4px", fontSize: fs(11), flex: "none", height: "fit-content" }}>问</span>
                                <span>{item.q}{item.mine ? "（我问的）" : ""}</span>
                            </div>
                            {item.answers.length === 0 ? (
                                <div style={{ color: "#aaa", marginTop: "5px", paddingLeft: "26px" }}>{askBusy && item.mine ? "等买过的人来回答…" : "还没有人回答"}</div>
                            ) : item.answers.slice(0, 2).map((a, i) => (
                                <div key={i} style={{ color: "#555", marginTop: "5px", lineHeight: 1.5, display: "flex", gap: "6px" }}>
                                    <span style={{ background: "#16a34a", color: "#fff", borderRadius: "4px", padding: "0 4px", fontSize: fs(11), flex: "none", height: "fit-content" }}>答</span>
                                    <span><b style={{ fontWeight: 600, color: "#777" }}>{a.author}：</b>{a.text}</span>
                                </div>
                            ))}
                            {(item.total || 0) > 2 ? <div style={{ color: "#aaa", marginTop: "4px", paddingLeft: "26px" }}>共 {item.total} 个回答</div> : null}
                        </div>
                    ))}
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        <input style={inputStyle} placeholder="买之前想问点什么" value={asking} onChange={e => setAsking(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void ask(); }} />
                        <button type="button" disabled={askBusy || !asking.trim()} onClick={ask} style={{ ...solidBtn, flex: "none", opacity: askBusy || !asking.trim() ? 0.5 : 1 }}>提问</button>
                    </div>
                </>
            )}
        </div>
    );
}

// ── 店铺客服 ─────────────────────────────────

const KEFU_NAMES = ["小橙子", "糯米", "七七", "阿柚", "小鹿", "团团", "晚风", "桃桃", "小满", "豆豆"];

export function KefuSheet({ product, onClose }: { product: ShoppingProduct; onClose: () => void }) {
    const store = useGiftStore();
    const key = productKey(product);
    const thread = store.kefu[key];
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const listRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (loadGiftStore().kefu[key]) return;
        const name = KEFU_NAMES[Math.abs([...product.merchantLabel].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % KEFU_NAMES.length];
        updateGiftStore(s => {
            s.kefu[key] = { name, merchant: product.merchantLabel, messages: [{ role: "kefu", text: "亲亲在的呢～有什么可以帮您的吗 🌷", at: new Date().toISOString() }] };
        });
    }, [key, product.merchantLabel]);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [thread?.messages.length, busy]);

    const send = async () => {
        const msg = text.trim();
        if (!msg || busy || !thread) return;
        setText("");
        setError("");
        setBusy(true);
        const history = [...thread.messages, { role: "user" as const, text: msg, at: new Date().toISOString() }];
        updateGiftStore(s => { s.kefu[key] = { ...s.kefu[key], messages: history }; });
        try {
            const reply = await kefuReply(product, thread.name, history);
            updateGiftStore(s => {
                let couponId: string | undefined;
                if (reply.coupon > 0) {
                    couponId = giftId("cp");
                    s.coupons.unshift({ id: couponId, amount: reply.coupon, label: `${product.merchantLabel} 无门槛券`, merchant: product.merchantLabel, at: new Date().toISOString() });
                }
                s.kefu[key].messages.push({ role: "kefu", text: reply.text, at: new Date().toISOString(), couponId });
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "客服没回");
        } finally {
            setBusy(false);
        }
    };

    const coupons = store.coupons;
    return (
        <div style={{ position: "absolute", inset: 0, zIndex: 40, background: "#ededed", display: "flex", flexDirection: "column" }}>
            <header style={{ padding: "var(--page-header-safe-top, 48px) 16px 10px", background: "#f7f7f7", borderBottom: "1px solid #ddd", display: "flex", alignItems: "center", gap: "10px" }}>
                <button type="button" aria-label="关闭客服" onClick={onClose} style={{ border: "none", background: "none", padding: 0, color: "#333", display: "flex" }}><X size={20} /></button>
                <div style={{ flex: 1, minWidth: 0, textAlign: "center", paddingRight: "30px" }}>
                    <div style={{ fontSize: fs(15), fontWeight: 700, color: "#222" }}>{thread?.name || "客服"} · 店铺客服</div>
                    <div style={{ fontSize: fs(10), color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.merchantLabel}</div>
                </div>
            </header>
            <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ alignSelf: "center", fontSize: fs(11), color: "#999", background: "rgba(0,0,0,0.04)", borderRadius: "8px", padding: "3px 9px" }}>正在咨询：{product.title}</div>
                {(thread?.messages || []).map((m, i) => {
                    const coupon = m.couponId ? coupons.find(c => c.id === m.couponId) : null;
                    return (
                        <div key={i} style={{ display: "flex", flexDirection: m.role === "user" ? "row-reverse" : "row", gap: "8px", alignItems: "flex-start" }}>
                            <div style={{ width: "34px", height: "34px", borderRadius: "6px", background: m.role === "user" ? "#f8c6d2" : "#ffd8b5", flex: "none" }} />
                            <div style={{ maxWidth: "74%", display: "flex", flexDirection: "column", gap: "6px", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                                <div style={{ background: m.role === "user" ? "#95ec69" : "#fff", borderRadius: "6px", padding: "8px 11px", fontSize: fs(13), lineHeight: 1.5, color: "#111", whiteSpace: "pre-wrap" }}>{m.text}</div>
                                {coupon ? (
                                    <div style={{ background: "linear-gradient(135deg,#ff7a1a,#ff4d4f)", color: "#fff", borderRadius: "10px", padding: "10px 12px", minWidth: "170px" }}>
                                        <div style={{ fontSize: fs(18), fontWeight: 900 }}>¥{coupon.amount}<span style={{ fontSize: fs(11), fontWeight: 700, marginLeft: "6px" }}>无门槛券</span></div>
                                        <div style={{ fontSize: fs(10), opacity: 0.9, marginTop: "2px" }}>{coupon.usedAt ? "已使用" : "已放进你的账户，下单自动抵扣"}</div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
                {busy ? <div style={{ fontSize: fs(11), color: "#999", paddingLeft: "42px" }}>对方正在输入…</div> : null}
                {error ? <div style={{ fontSize: fs(11), color: "#b91c1c", paddingLeft: "42px" }}>{error}</div> : null}
            </div>
            <div style={{ display: "flex", gap: "8px", padding: "10px 12px calc(10px + env(safe-area-inset-bottom, 0px))", background: "#f7f7f7", borderTop: "1px solid #ddd" }}>
                <input style={{ ...inputStyle, borderRadius: "8px" }} value={text} placeholder="问问客服" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void send(); }} />
                <button type="button" disabled={busy || !text.trim()} onClick={send} style={{ ...solidBtn, flex: "none", opacity: busy || !text.trim() ? 0.5 : 1 }}>发送</button>
            </div>
        </div>
    );
}

// ── 设置：送礼 ───────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
    return (
        <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} style={{ width: "40px", height: "23px", borderRadius: "12px", border: "none", background: on ? ORANGE : "#ddd", position: "relative", flex: "none", padding: 0 }}>
            <span style={{ position: "absolute", top: "2.5px", left: on ? "19.5px" : "2.5px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left 150ms ease" }} />
        </button>
    );
}

export function GiftSettingsPanel() {
    const store = useGiftStore();
    const chars = useGiftChars();
    const [adding, setAdding] = useState(false);
    const [day, setDay] = useState({ charId: chars[0]?.id || "", name: "在一起纪念日", month: "", day: "" });
    const setSetting = (patch: Partial<ShoppingGiftStore["settings"]>) => updateGiftStore(s => { s.settings = { ...s.settings, ...patch }; });
    const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 0", borderTop: "1px solid #f4f4f4" } as const;
    const sub = { display: "block", fontSize: fs(11), color: "#999", marginTop: "2px", lineHeight: 1.35 } as const;
    const box = { border: "1px solid #eee", borderRadius: "16px", padding: "4px 12px 6px", background: "#fff", marginBottom: "10px" } as const;
    const head = { fontSize: fs(11), color: "#999", fontWeight: 700, padding: "8px 0 2px" } as const;
    const addDay = () => {
        const month = Number(day.month);
        const date = Number(day.day);
        if (!day.charId || !day.name.trim() || !(month >= 1 && month <= 12) || !(date >= 1 && date <= 31)) return;
        updateGiftStore(s => { s.specialDays.push({ id: giftId("day"), charId: day.charId, name: day.name.trim(), month, day: date }); });
        setAdding(false);
        setDay({ ...day, month: "", day: "" });
    };
    const nameOf = (id: string) => chars.find(c => c.id === id)?.name || loadCharacters().find(c => c.id === id)?.name || "TA";

    return (
        <div>
            <div style={box}>
                <div style={head}>物流</div>
                <div style={{ ...row, borderTop: "none" }}>
                    <div style={{ fontSize: fs(13), color: "#222" }}>真实物流<span style={sub}>开：一两天送到；关：按「物流时间」里的分钟数</span></div>
                    <Toggle on={store.settings.realShipping} onChange={v => setSetting({ realShipping: v })} />
                </div>
            </div>
            <div style={box}>
                <div style={head}>他们给你买礼物</div>
                <div style={{ ...row, borderTop: "none" }}>
                    <div style={{ fontSize: fs(13), color: "#222" }}>允许 char 给我买<span style={sub}>同一个人至少隔 3 天；价格按他的人设</span></div>
                    <Toggle on={store.settings.allowCharGifts} onChange={v => setSetting({ allowCharGifts: v })} />
                </div>
                <div style={row}>
                    <div style={{ fontSize: fs(13), color: "#222" }}>节日会想着送<span style={sub}>情人节 / 520 / 七夕 / 中秋 / 圣诞 / 跨年 / 春节</span></div>
                    <Toggle on={store.settings.festivalGifts} onChange={v => setSetting({ festivalGifts: v })} />
                </div>
            </div>
            <div style={box}>
                <div style={head}>特殊日子（每个人分开记）</div>
                {store.specialDays.length === 0 && !adding ? <div style={{ fontSize: fs(12), color: "#bbb", padding: "8px 0" }}>还没有</div> : null}
                {store.specialDays.map(d => (
                    <div key={d.id} style={{ ...row, borderTop: "none" }}>
                        <div style={{ fontSize: fs(13), color: "#222" }}>{d.name}<span style={sub}>每年 {d.month} 月 {d.day} 日 · {nameOf(d.charId)}</span></div>
                        <button type="button" aria-label="删除" onClick={() => updateGiftStore(s => { s.specialDays = s.specialDays.filter(x => x.id !== d.id); })} style={{ border: "none", background: "none", color: "#bbb", padding: 0 }}><Trash2 size={15} /></button>
                    </div>
                ))}
                {adding ? (
                    <div style={{ display: "grid", gap: "7px", padding: "8px 0" }}>
                        <select style={inputStyle} value={day.charId} onChange={e => setDay({ ...day, charId: e.target.value })}>
                            {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input style={inputStyle} placeholder="叫什么" value={day.name} onChange={e => setDay({ ...day, name: e.target.value })} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
                            <input style={inputStyle} inputMode="numeric" placeholder="月" value={day.month} onChange={e => setDay({ ...day, month: e.target.value.replace(/\D/g, "") })} />
                            <input style={inputStyle} inputMode="numeric" placeholder="日" value={day.day} onChange={e => setDay({ ...day, day: e.target.value.replace(/\D/g, "") })} />
                        </div>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <button type="button" onClick={() => setAdding(false)} style={ghostBtn}>取消</button>
                            <button type="button" onClick={addDay} style={solidBtn}>添加</button>
                        </div>
                    </div>
                ) : chars.length > 0 ? (
                    <button type="button" onClick={() => { setDay(d => ({ ...d, charId: d.charId || chars[0]?.id || "" })); setAdding(true); }} style={{ border: "none", background: "none", color: ORANGE, fontWeight: 800, fontSize: fs(13), padding: "8px 0", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Plus size={14} />添加日子
                    </button>
                ) : null}
            </div>
            <div style={box}>
                <div style={head}>收货地址</div>
                {[{ id: USER_ADDRESS_ID, name: "我" }, ...chars.map(c => ({ id: c.id, name: c.name }))].map(item => {
                    const a = store.addresses[item.id];
                    return (
                        <div key={item.id} style={{ ...row, borderTop: "none" }}>
                            <div style={{ fontSize: fs(13), color: "#222", minWidth: 0 }}>{item.name}<span style={sub}>{a ? `${a.name} ${a.phone} · ${a.address}` : "还没填，下单时可以填"}</span></div>
                            {a ? <button type="button" aria-label="清除地址" onClick={() => updateGiftStore(s => { delete s.addresses[item.id]; })} style={{ border: "none", background: "none", color: "#bbb", padding: 0 }}><Trash2 size={15} /></button> : null}
                        </div>
                    );
                })}
            </div>
            <div style={box}>
                <div style={head}>优惠券</div>
                {store.coupons.filter(c => !c.usedAt).length === 0 ? <div style={{ fontSize: fs(12), color: "#bbb", padding: "8px 0" }}>没有可用的券，去找客服聊聊？</div> : null}
                {store.coupons.filter(c => !c.usedAt).map(c => (
                    <div key={c.id} style={{ ...row, borderTop: "none" }}>
                        <div style={{ fontSize: fs(13), color: "#222" }}>¥{c.amount} 无门槛<span style={sub}>{c.label}</span></div>
                        <Sparkles size={15} color={ORANGE} />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** 她有没有给自己买过、已到货的这件（能写评价） */
export function canUserReview(product: { title: string; merchantLabel: string }, orders: ShoppingOrder[], store: ShoppingGiftStore, now: number): boolean {
    const key = productKey(product);
    return orders.some(o => {
        const meta = store.orders[o.id];
        if (meta?.to) return false;
        if (o.paymentStatus === "payment_requested" || o.paymentStatus === "payment_declined" || o.paymentStatus === "payment_canceled") return false;
        return isDelivered(o, now) && o.items.some(i => productKey(i) === key);
    });
}
