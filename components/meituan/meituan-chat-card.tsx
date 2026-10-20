"use client";

import { useEffect, useState } from "react";

import type { MeituanCardData } from "@/lib/meituan-chat";
import {
    findOrder,
    MEITUAN_UPDATED_EVENT,
    MT_SELF,
    mtYuan,
    orderProgress,
    orderStage,
    setMeituanPendingOpen,
    STAGE_LABEL,
    type MtOrder,
} from "@/lib/meituan-store";
import { loadCharacters } from "@/lib/character-storage";

function nameOf(id: string): string {
    return loadCharacters().find(c => c.id === id)?.name || "他";
}

function hm(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function useMtNow(intervalMs = 15_000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), intervalMs);
        const on = () => setNow(Date.now());
        window.addEventListener(MEITUAN_UPDATED_EVENT, on);
        return () => { window.clearInterval(t); window.removeEventListener(MEITUAN_UPDATED_EVENT, on); };
    }, [intervalMs]);
    return now;
}

export function orderWhoLabel(order: MtOrder): string {
    if (order.from !== MT_SELF) return `${nameOf(order.from)} 给你点的`;
    if (order.to !== MT_SELF) return `给 ${nameOf(order.to)} 点的`;
    return "我的外卖";
}

export function orderHeadline(order: MtOrder, now: number): { big: string; small: string } {
    const stage = orderStage(order, now);
    if (stage === "delivered") return { big: "已送达", small: `${hm(order.deliverAt)} 送达 · 祝您用餐愉快` };
    if (stage === "cancelled") return { big: "订单已取消", small: "钱已原路退回" };
    const small = stage === "delivering" ? `骑手 ${order.rider.name} 正火速赶往您身边` : stage === "accepted" ? "商家正在备餐，骑手已接单" : "等待商家接单";
    return { big: `预计 ${hm(order.deliverAt)} 送达`, small };
}

function open(kind: "order" | "voucher", id: string) {
    setMeituanPendingOpen({ kind, id });
    window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "meituan" } }));
}

export function MeituanChatCard({ card }: { card: MeituanCardData }) {
    const now = useMtNow();
    if (card.kind === "voucher") {
        return (
            <div className="mtc" onClick={() => open("voucher", card.voucherId)}>
                <div className="mtc-head is-deal">
                    <div className="mtc-lb"><span>美团 · 团购</span><span>{card.status || "邀请你一起去"}</span></div>
                    <b>{card.title}</b>
                    <small>{card.shopName}</small>
                </div>
                <div className="mtc-body">
                    <div className="mtc-it"><i>{card.emoji}</i><div>{card.shopName}<small>{card.title}</small></div><span>{mtYuan(card.price)}</span></div>
                </div>
                <div className="mtc-foot"><span>查看团购券</span></div>
            </div>
        );
    }
    const order = card.orderId ? findOrder(card.orderId)?.order : null;
    if (!order) {
        const d = card.draft;
        return (
            <div className="mtc">
                <div className="mtc-head">
                    <div className="mtc-lb"><span>美团外卖</span><span>下单中</span></div>
                    <b>正在下单…</b>
                    <small>{d?.shop || ""}</small>
                </div>
                {d ? <div className="mtc-body">{d.items.map((i, k) => <div className="mtc-it" key={k}><i>🍽️</i><div>{i.name}<small>x{i.qty}</small></div><span>{mtYuan(i.price * i.qty)}</span></div>)}</div> : null}
            </div>
        );
    }
    const stage = orderStage(order, now);
    const head = orderHeadline(order, now);
    const pct = Math.round(orderProgress(order, now) * 100);
    return (
        <div className="mtc" onClick={() => open("order", order.id)}>
            <div className={`mtc-head ${stage === "delivered" ? "is-done" : ""}`}>
                <div className="mtc-lb"><span>美团外卖 · {orderWhoLabel(order)}</span><span>{STAGE_LABEL[stage]}</span></div>
                <b>{head.big}</b>
                <small>🕐 {head.small}</small>
                {stage !== "delivered" && stage !== "cancelled" ? <div className="mtc-bar"><i style={{ width: `${pct}%` }} /><em style={{ left: `${pct}%` }}>🛵</em></div> : null}
            </div>
            <div className="mtc-body">
                <div className="mtc-shop">{order.shopName}<span>›</span></div>
                {order.items.slice(0, 3).map((i, k) => (
                    <div className="mtc-it" key={k}><i>{i.emoji}</i><div>{i.name}<small>x{i.qty}{i.spec ? ` · ${i.spec}` : ""}</small></div><span>{mtYuan(i.price * i.qty)}</span></div>
                ))}
                {order.items.length > 3 ? <div className="mtc-more">等 {order.items.length} 件</div> : null}
                {order.note ? <div className="mtc-note"><b>备注：</b>{order.note}</div> : null}
                <div className="mtc-pay"><span>{order.discount > 0 ? `已优惠 ${mtYuan(order.discount)}` : order.accountLabel}</span><span>实付 <b>{mtYuan(order.total)}</b></span></div>
            </div>
            <div className="mtc-foot"><span>📞 联系骑手</span><span>💬 联系商家</span></div>
        </div>
    );
}
