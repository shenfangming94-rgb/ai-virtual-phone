"use client";

// 美团「我的店」：她当老板的商家后台（开店、接单出餐、菜单、评价、提现、分享给他）

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Sparkles } from "lucide-react";

import { storeMediaBlob } from "@/lib/media-cache-storage";
import { generateMtImage, isMtImageReady } from "@/lib/meituan-engine";
import { MT_CATEGORIES, mtId, mtToday, mtYuan, type MeituanState, type MtDish, type MyShopOrder } from "@/lib/meituan-store";
import {
    acceptMyOrder,
    MY_SHOP_FEE,
    MY_STAGE_LABEL,
    myOrderStage,
    myShopRating,
    newMyShop,
    readyMyOrder,
    rejectMyOrder,
    replyMyReview,
    shareMyShop,
    simulateMyShop,
    updateMyShop,
    withdrawMyShop,
    writeMyMenu,
    type MyStage,
} from "@/lib/meituan-myshop";
import { updateMeituan } from "@/lib/meituan-store";
import { full, hm, Pic, Sheet, Stars, type Person } from "./meituan-app";
import { useMtNow } from "./meituan-chat-card";

type Props = {
    st: MeituanState;
    people: Person[];
    busy: string;
    run: (label: string, fn: () => Promise<unknown>, fail?: string) => Promise<void>;
    notice: (m: string) => void;
    refresh: () => void;
};

const EMOJIS = ["🍜", "🍱", "🍔", "🍕", "🍣", "🥟", "🍲", "🍢", "🧋", "☕", "🍰", "🥗", "🍗", "🌯", "🍡", "🍓"];

export function MyShopView(props: Props) {
    const { st, refresh } = props;
    const now = useMtNow(5_000);

    // 进来先把离开期间的订单补上，之后每 30 秒走一次
    useEffect(() => {
        simulateMyShop();
        refresh();
        const t = window.setInterval(() => { simulateMyShop(); refresh(); }, 30_000);
        return () => window.clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!st.myShop) return <OpenShop {...props} />;
    return <Dashboard {...props} now={now} />;
}

// ── 开店 ──

function OpenShop({ notice, refresh }: Props) {
    const [name, setName] = useState("");
    const [cat, setCat] = useState("food");
    const [emoji, setEmoji] = useState("🍜");
    const [desc, setDesc] = useState("");
    const [address, setAddress] = useState("");
    return (
        <div className="mt-page has-tab is-gray">
            <div className="ms-open-hero">
                <b>开一家自己的小店</b>
                <span>当老板 · 接单出餐 · 路人来吃 · 他也会来光顾</span>
            </div>
            <section className="mt-card">
                <label className="mt-field"><span>店名</span><input className="mt-input" value={name} onChange={e => setName(e.target.value)} placeholder="比如：小满的深夜食堂" maxLength={24} /></label>
                <div className="mt-ck-h" style={{ marginTop: 8 }}>卖什么</div>
                <div className="mt-who">{MT_CATEGORIES.filter(c => c.id !== "errand" && c.id !== "medicine").map(c => <button type="button" key={c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>{c.emoji} {c.name}</button>)}</div>
                <div className="mt-ck-h" style={{ marginTop: 12 }}>店铺图标 <small className="mt-dim">开张后能换成照片</small></div>
                <div className="ms-emojis">{EMOJIS.map(e => <button type="button" key={e} className={emoji === e ? "on" : ""} onClick={() => setEmoji(e)}>{e}</button>)}</div>
                <label className="mt-field"><span>简介</span><input className="mt-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="一句话介绍你的店" maxLength={40} /></label>
                <label className="mt-field"><span>地址</span><input className="mt-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="路名 + 门牌" maxLength={40} /></label>
            </section>
            <button type="button" className="mt-primary" disabled={!name.trim()} onClick={() => {
                updateMeituan(s => { s.myShop = newMyShop({ name: name.trim(), cat, emoji, desc: desc.trim(), address: address.trim() }); });
                refresh();
                notice("开张啦！先去「菜单」上几道菜");
            }}>开张</button>
        </div>
    );
}

// ── 后台 ──

const SEGS: { id: string; label: string; stages: MyStage[] }[] = [
    { id: "todo", label: "待处理", stages: ["new", "cooking", "waiting"] },
    { id: "go", label: "配送中", stages: ["delivering"] },
    { id: "done", label: "已完成", stages: ["done"] },
    { id: "x", label: "已取消", stages: ["cancelled"] },
];

function Dashboard(props: Props & { now: number }) {
    const { st, people, busy, run, notice, refresh, now } = props;
    const shop = st.myShop!;
    const [tab, setTab] = useState<"orders" | "menu" | "rv" | "set">("orders");
    const [seg, setSeg] = useState("todo");
    const [sheet, setSheet] = useState<string | null>(null);

    const today = mtToday(new Date(now));
    const todays = shop.orders.filter(o => !o.cancelled && mtToday(new Date(o.createdAt)) === today);
    const todayIncome = todays.reduce((s, o) => s + o.income, 0);
    const rating = myShopRating(shop);
    const counts = Object.fromEntries(SEGS.map(g => [g.id, shop.orders.filter(o => g.stages.includes(myOrderStage(o, now))).length]));
    const list = shop.orders.filter(o => SEGS.find(g => g.id === seg)!.stages.includes(myOrderStage(o, now)));

    return (
        <div className="mt-page has-tab is-gray">
            <div className="ms-head">
                <button type="button" className="ms-logo-btn" onClick={() => setSheet("pic:logo")}><Pic src={shop.logo} emoji={shop.emoji} className="ms-logo" /></button>
                <div className="ms-hinfo">
                    <b>{shop.name}</b>
                    <span><Stars n={rating} small /> {rating.toFixed(1)} · 评价 {shop.reviews.length}</span>
                </div>
                <button type="button" className={`ms-open ${shop.open ? "on" : ""}`} onClick={() => { updateMyShop(s => { s.open = !s.open; s.lastSimAt = new Date().toISOString(); }); refresh(); }}>
                    <i />{shop.open ? "营业中" : "休息中"}
                </button>
            </div>
            <section className="mt-card ms-stats">
                <div><small>今日营业额</small><b>{mtYuan(todayIncome)}</b></div>
                <div><small>今日订单</small><b>{todays.length}</b></div>
                <div><small>可提现</small><b>{mtYuan(shop.balance)}</b></div>
                <button type="button" className="ms-cash" disabled={shop.balance <= 0} onClick={() => {
                    const r = withdrawMyShop();
                    refresh();
                    notice(r.ok ? `已提现 ${mtYuan(r.amount || 0)} 到钱包余额` : r.error || "提现失败");
                }}>提现</button>
            </section>
            {!shop.dishes.length ? <p className="mt-hint ms-warn">还没有菜，顾客点不了单。去「菜单」加几道吧</p> : !shop.open ? <p className="mt-hint ms-warn">休息中不会来新订单</p> : null}

            <div className="mt-stabs ms-tabs">
                {([["orders", "订单"], ["menu", "菜单"], ["rv", "评价"], ["set", "店铺"]] as const).map(([id, label]) => (
                    <button type="button" key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}{id === "orders" && counts.todo ? <sup>{counts.todo}</sup> : null}</button>
                ))}
            </div>

            {tab === "orders" ? (
                <>
                    <div className="mt-seg ms-seg">{SEGS.map(g => <button type="button" key={g.id} className={seg === g.id ? "on" : ""} onClick={() => setSeg(g.id)}>{g.label}{counts[g.id] ? ` ${counts[g.id]}` : ""}</button>)}</div>
                    {list.map(o => <OrderCard key={o.id} o={o} now={now} refresh={refresh} />)}
                    {!list.length ? <p className="mt-hint" style={{ textAlign: "center", marginTop: 30 }}>{seg === "todo" ? (shop.open ? "暂时没有要处理的单，等等看～" : "开门营业才会有新订单") : "这里还没有订单"}</p> : null}
                </>
            ) : null}

            {tab === "menu" ? <MenuTab {...props} openPic={id => setSheet(`pic:dish:${id}`)} /> : null}

            {tab === "rv" ? <ReviewTab {...props} rating={rating} /> : null}

            {tab === "set" ? <SettingsTab {...props} openPic={() => setSheet("pic:img")} /> : null}

            {sheet?.startsWith("pic:") ? <PicSheet which={sheet.slice(4)} busy={busy} run={run} notice={notice} refresh={refresh} close={() => setSheet(null)} shopName={shop.name} shopDesc={shop.desc} dish={shop.dishes.find(d => `dish:${d.id}` === sheet.slice(4))} /> : null}
            {people.length === 0 ? null : null}
        </div>
    );
}

function OrderCard({ o, now, refresh }: { o: MyShopOrder; now: number; refresh: () => void }) {
    const stage = myOrderStage(o, now);
    const left = o.deliverAt ? Math.max(0, Math.ceil((new Date(o.deliverAt).getTime() - now) / 60_000)) : 0;
    return (
        <section className={`mt-card ms-order ${o.charId ? "is-his" : ""}`}>
            <div className="ms-oh">
                <b>#{o.no}</b>
                <span className="ms-cust">{o.customer}{o.charId ? <u>他来光顾</u> : null}</span>
                <em className={stage === "new" ? "red" : stage === "done" || stage === "cancelled" ? "" : "y"}>{MY_STAGE_LABEL[stage]}</em>
            </div>
            <div className="mt-osub">{hm(o.createdAt)} 下单 · {o.address}{o.rider && stage !== "new" && stage !== "cancelled" ? ` · 骑手${o.rider}` : ""}</div>
            <div className="ms-items">{o.items.map((i, k) => <div key={k}><span>{i.emoji} {i.name}</span><span>x{i.qty}</span><span>{mtYuan(i.price * i.qty)}</span></div>)}</div>
            {o.note ? <div className="ms-note">备注：{o.note}</div> : null}
            {o.message ? <div className="ms-note is-msg">给老板的留言：{o.message}</div> : null}
            {o.cancelled ? <div className="mt-osub">{o.cancelled}</div> : null}
            <div className="ms-ofoot">
                <span>顾客实付 {mtYuan(o.total)} · 预计收入 <b>{mtYuan(o.income)}</b></span>
                {stage === "new" ? (
                    <span className="ms-btns">
                        <button type="button" className="ms-ghost" onClick={() => { rejectMyOrder(o.id); refresh(); }}>拒单</button>
                        <button type="button" className="ms-go" onClick={() => { acceptMyOrder(o.id); refresh(); }}>接单</button>
                    </span>
                ) : stage === "cooking" ? (
                    <button type="button" className="ms-go" onClick={() => { readyMyOrder(o.id); refresh(); }}>出餐完成</button>
                ) : stage === "waiting" ? <span className="mt-dim">骑手正赶来取餐</span> : stage === "delivering" ? <span className="mt-dim">约 {left} 分钟送达</span> : null}
            </div>
        </section>
    );
}

function MenuTab({ st, busy, run, notice, refresh, openPic }: Props & { openPic: (dishId: string) => void }) {
    const shop = st.myShop!;
    const blank = { name: "", price: "", group: shop.dishes[0]?.group || "热销", desc: "", emoji: shop.emoji };
    const [form, setForm] = useState(blank);
    const [editing, setEditing] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const groups = Array.from(new Set(shop.dishes.map(d => d.group)));
    const save = () => {
        const price = Number(form.price);
        if (!form.name.trim() || !(price >= 0)) return;
        updateMyShop(s => {
            const d: MtDish = { id: editing || mtId("dish"), name: form.name.trim().slice(0, 30), price: Math.round(price * 100) / 100, group: form.group.trim().slice(0, 8) || "热销", desc: form.desc.trim().slice(0, 40), emoji: form.emoji || shop.emoji, monthly: 0 };
            const old = s.dishes.find(x => x.id === editing);
            if (old) Object.assign(old, { ...d, img: old.img, monthly: old.monthly });
            else s.dishes.push(d);
        });
        setForm(blank);
        setEditing(null);
        setAdding(false);
        refresh();
    };
    const formEl = (
        <section className="mt-card ms-form">
            <div className="ms-row2">
                <input className="mt-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="菜名" />
                <input className="mt-input" inputMode="decimal" value={form.price} onChange={e => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })} placeholder="价格" />
            </div>
            <div className="ms-row2">
                <input className="mt-input" value={form.group} onChange={e => setForm({ ...form, group: e.target.value })} placeholder="分组（如 热销）" list="ms-groups" />
                <input className="mt-input" value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value.slice(0, 4) })} placeholder="图标" />
            </div>
            <datalist id="ms-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
            <input className="mt-input" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="一句话介绍（可以不写）" />
            <div className="ms-btns" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="ms-ghost" onClick={() => { setAdding(false); setEditing(null); setForm(blank); }}>取消</button>
                <button type="button" className="ms-go" disabled={!form.name.trim() || !form.price} onClick={save}>保存</button>
            </div>
        </section>
    );
    return (
        <>
            <div className="ms-menu-acts">
                <button type="button" className="ms-go" onClick={() => { setEditing(null); setForm(blank); setAdding(true); }}>＋ 添加菜品</button>
                <button type="button" className="ms-ghost" disabled={!!busy} onClick={() => run("mymenu", async () => { const n = await writeMyMenu(); notice(n ? `加了 ${n} 道菜，可以再改` : "没写出来，再试一次"); })}>{busy === "mymenu" ? "写菜单中…" : "✨ AI 帮我写菜单"}</button>
            </div>
            {adding && !editing ? formEl : null}
            {groups.map(g => (
                <section className="mt-card" key={g}>
                    <div className="mt-ck-h">{g}</div>
                    {shop.dishes.filter(d => d.group === g).map(d => editing === d.id ? <div key={d.id}>{formEl}</div> : (
                        <div className="mt-dish ms-dish" key={d.id}>
                            <button type="button" className="mt-dimg-btn" onClick={() => openPic(d.id)}><Pic src={d.img} emoji={d.emoji} className="mt-dimg" /></button>
                            <div className="mt-dinfo">
                                <b>{d.name}</b>
                                {d.desc ? <small>{d.desc}</small> : null}
                                <small>月售 {shop.orders.filter(o => !o.cancelled && o.items.some(i => i.name === d.name) && Date.now() - new Date(o.createdAt).getTime() < 30 * 86400_000).length}</small>
                                <div className="mt-dp"><em>¥{d.price}</em>
                                    <span className="ms-btns">
                                        <button type="button" className="ms-mini" onClick={() => { setAdding(false); setEditing(d.id); setForm({ name: d.name, price: String(d.price), group: d.group, desc: d.desc, emoji: d.emoji }); }}>编辑</button>
                                        <button type="button" className="ms-mini" onClick={() => { updateMyShop(s => { s.dishes = s.dishes.filter(x => x.id !== d.id); }); refresh(); }}>下架</button>
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </section>
            ))}
            {!shop.dishes.length && !adding ? <p className="mt-hint" style={{ textAlign: "center", marginTop: 20 }}>菜单是空的。自己加，或者让 AI 先写一版再改</p> : null}
            <p className="mt-hint">点菜品图片可以上传照片或 AI 生成</p>
        </>
    );
}

function ReviewTab({ st, refresh, rating }: Props & { rating: number }) {
    const shop = st.myShop!;
    const [replying, setReplying] = useState<string | null>(null);
    const [text, setText] = useState("");
    const good = shop.reviews.filter(r => r.stars >= 4).length;
    return (
        <>
            <section className="mt-card ms-rvsum">
                <b>{rating.toFixed(1)}</b>
                <div><Stars n={rating} /><small>共 {shop.reviews.length} 条 · 好评率 {shop.reviews.length ? Math.round((good / shop.reviews.length) * 100) : 100}%</small></div>
            </section>
            {shop.reviews.map(r => (
                <section className={`mt-card ms-rv ${r.by ? "is-his" : ""}`} key={r.id}>
                    <div className="ms-rvh"><b>{r.name}</b>{r.by ? <u>他的评价</u> : null}<Stars n={r.stars} small /><span className="mt-dim">{full(r.at).slice(5)}</span></div>
                    <p className="mt-p">{r.text}</p>
                    {r.reply ? <div className="ms-reply"><b>商家回复：</b>{r.reply}</div> : replying === r.id ? (
                        <div className="ms-reply-in">
                            <input className="mt-input" autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="回复这条评价" maxLength={200} />
                            <button type="button" className="ms-go" disabled={!text.trim()} onClick={() => { replyMyReview(r.id, text.trim()); setText(""); setReplying(null); refresh(); }}>回复</button>
                        </div>
                    ) : <button type="button" className="ms-mini" onClick={() => { setReplying(r.id); setText(""); }}>回复</button>}
                </section>
            ))}
            {!shop.reviews.length ? <p className="mt-hint" style={{ textAlign: "center", marginTop: 30 }}>还没有评价。顾客吃完一部分会来写</p> : null}
        </>
    );
}

function SettingsTab({ st, people, busy, run, notice, refresh, openPic }: Props & { openPic: () => void }) {
    const shop = st.myShop!;
    const [form, setForm] = useState({ name: shop.name, desc: shop.desc, notice: shop.notice, address: shop.address, minOrder: String(shop.minOrder), deliveryFee: String(shop.deliveryFee) });
    const [closing, setClosing] = useState(false);
    const income = shop.orders.filter(o => o.settled).reduce((s, o) => s + o.income, 0);
    return (
        <>
            <section className="mt-card">
                <div className="mt-ck-h">店铺信息</div>
                <label className="mt-field"><span>店名</span><input className="mt-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={24} /></label>
                <label className="mt-field"><span>简介</span><input className="mt-input" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} maxLength={40} /></label>
                <label className="mt-field"><span>公告</span><input className="mt-input" value={form.notice} onChange={e => setForm({ ...form, notice: e.target.value })} placeholder="比如：今天老板心情好，多送一个卤蛋" maxLength={60} /></label>
                <label className="mt-field"><span>地址</span><input className="mt-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} maxLength={40} /></label>
                <div className="ms-row2">
                    <label className="mt-field"><span>起送价</span><input className="mt-input" inputMode="decimal" value={form.minOrder} onChange={e => setForm({ ...form, minOrder: e.target.value.replace(/[^\d.]/g, "") })} /></label>
                    <label className="mt-field"><span>配送费</span><input className="mt-input" inputMode="decimal" value={form.deliveryFee} onChange={e => setForm({ ...form, deliveryFee: e.target.value.replace(/[^\d.]/g, "") })} /></label>
                </div>
                <button type="button" className="mt-opt" onClick={openPic}><ImagePlus size={18} />店铺大图</button>
                <button type="button" className="mt-primary" disabled={!form.name.trim()} onClick={() => {
                    updateMyShop(s => { Object.assign(s, { name: form.name.trim(), desc: form.desc.trim(), notice: form.notice.trim(), address: form.address.trim(), minOrder: Number(form.minOrder) || 0, deliveryFee: Number(form.deliveryFee) || 0 }); });
                    refresh(); notice("保存好了");
                }}>保存</button>
            </section>
            <section className="mt-card">
                <div className="mt-kv">自动接单<button type="button" className={`mt-sw ${shop.autoAccept ? "on" : ""}`} onClick={() => { updateMyShop(s => { s.autoAccept = !s.autoAccept; }); refresh(); }} /></div>
                <p className="mt-hint">关掉要自己点接单，10 分钟不接顾客会取消</p>
                <div className="mt-kv">平台服务费<b>{Math.round(MY_SHOP_FEE * 100)}%</b></div>
                <div className="mt-kv">累计收入<b>{mtYuan(income)}</b></div>
                <div className="mt-kv">已提现<b>{mtYuan(shop.withdrawn)}</b></div>
                <div className="mt-kv">开店时间<b>{full(shop.createdAt).slice(0, 10)}</b></div>
            </section>
            <section className="mt-card">
                <div className="mt-ck-h">分享给他</div>
                <p className="mt-hint" style={{ padding: "0 0 8px" }}>店铺会发进你们的聊天，他看了按人设决定要不要下单捧场</p>
                <div className="mt-who">{people.map(p => <button type="button" key={p.id} disabled={!!busy || !shop.dishes.length} onClick={() => run(`share:${p.id}`, async () => { const ordered = await shareMyShop(p.id); notice(ordered ? `${p.name}下了一单！` : `已分享给${p.name}`); }, "没分享出去")}>{busy === `share:${p.id}` ? "他在看…" : p.name}</button>)}</div>
                {!people.length ? <p className="mt-hint">还没有好友</p> : null}
            </section>
            {closing ? (
                <div className="ms-btns" style={{ justifyContent: "center", margin: "6px 0 20px" }}>
                    <button type="button" className="ms-ghost" onClick={() => setClosing(false)}>再想想</button>
                    <button type="button" className="ms-go red" onClick={() => { updateMeituan(s => { s.myShop = undefined; }); refresh(); notice("店关掉了"); }}>确定关店（订单评价都会清空）</button>
                </div>
            ) : <button type="button" className="mt-link ms-close" onClick={() => setClosing(true)}>关店</button>}
        </>
    );
}

function PicSheet({ which, dish, shopName, shopDesc, busy, run, notice, refresh, close }: {
    which: string; dish?: MtDish; shopName: string; shopDesc: string;
    busy: string; run: Props["run"]; notice: Props["notice"]; refresh: () => void; close: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const isDish = which.startsWith("dish:");
    const apply = (ref: string | undefined) => {
        updateMyShop(s => {
            if (isDish) { const d = s.dishes.find(x => x.id === dish?.id); if (d) d.img = ref; }
            else if (which === "logo") s.logo = ref;
            else s.img = ref;
        });
        refresh();
    };
    const title = isDish ? dish?.name || "菜品" : which === "logo" ? "店铺头像" : "店铺大图";
    return (
        <Sheet title={title} onClose={close}>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={async e => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                apply(await storeMediaBlob(f, f.type || "image/jpeg", "image"));
                close();
            }} />
            <button type="button" className="mt-opt" onClick={() => fileRef.current?.click()}><ImagePlus size={18} />上传照片</button>
            <button type="button" className="mt-opt" disabled={!!busy} onClick={() => {
                if (!isMtImageReady()) { notice("先在设置里打开生图"); return; }
                const desc = isDish
                    ? `外卖菜品「${dish?.name}」${dish?.desc ? `，${dish.desc}` : ""}，装在外卖餐盒或盘子里，美食摄影，45度，暖光，干净背景，不要文字`
                    : which === "logo"
                        ? `小店「${shopName}」的店铺头像，${shopDesc}，可爱简洁的插画风 logo，方形，不要文字`
                        : `外卖小店「${shopName}」的招牌菜品摆拍大图，${shopDesc}，美食摄影，暖光，干净背景，不要文字`;
                close();
                void run("img", async () => { const ref = await generateMtImage(desc); if (ref) apply(ref); else throw new Error("no image"); }, "生图失败了");
            }}><Sparkles size={18} />AI 生成一张</button>
            <button type="button" className="mt-opt red" onClick={() => { apply(undefined); close(); }}>用回图标</button>
        </Sheet>
    );
}
