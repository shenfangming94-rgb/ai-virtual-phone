"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Heart,
  ImagePlus,
  PenLine,
  PiggyBank,
  ReceiptText,
  TrendingUp,
} from "lucide-react";

import { WalletBankCard } from "@/components/chat/wallet-panel";
import { loadCharacters } from "@/lib/character-storage";
import { loadChatContacts } from "@/lib/chat-storage";
import { createIdentityMatcher, getCurrentIdentityId } from "@/lib/identity-scope";
import { isMediaStoreRef, loadMediaObjectUrl, storeMediaBlob } from "@/lib/media-cache-storage";
import { loadUserIdentities } from "@/lib/settings-storage";
import {
  accrueYuebao,
  ALIPAY_SELF,
  ALIPAY_UPDATED_EVENT,
  givenThisMonth,
  loadAlipay,
  updateAlipay,
  type AlipayState,
  type Pouch,
} from "@/lib/alipay-store";
import {
  cancelGivenKinCard,
  createPouch,
  deletePouch,
  giveKinCard,
  movePouchMoney,
  requestKinCard,
  transferToChar,
  writeBillNote,
} from "@/lib/alipay-engine";
import {
  createWalletCard,
  currentMonthKey,
  deleteWalletCard,
  formatWalletAmount,
  getWalletTotalBalance,
  loadWalletState,
  setDefaultWalletCard,
  setKinCardNotify,
  setWalletAccountValue,
  updateWalletCardInfo,
  upsertKinCard,
  WALLET_BALANCE_ACCOUNT_ID,
  WALLET_UPDATED_EVENT,
  walletTransact,
} from "@/lib/wallet-storage";
import type { WalletCard, WalletCardStyle, WalletState } from "@/lib/wallet-types";

type Page =
  | { id: "home" }
  | { id: "cards" }
  | { id: "kin" }
  | { id: "pouches" }
  | { id: "pouch"; pouchId: string }
  | { id: "yuebao" }
  | { id: "bill" };

type Person = { id: string; name: string; avatar?: string | null };

const STYLE_OPTIONS: { id: WalletCardStyle; label: string }[] = [
  { id: "obsidian", label: "黑金" },
  { id: "graphite", label: "石墨" },
  { id: "silver", label: "银灰" },
];

const yuan = (n: number) => formatWalletAmount(n);
const plain = (n: number) => Math.round(n).toLocaleString("zh-CN");

function num(value: string): number {
  const n = Number(String(value).replace(/[,，¥￥元\s]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

function fmtDay(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}.${d.getDate()} ${hm}`;
}

function friendsOf(identityId?: string): Person[] {
  const matches = createIdentityMatcher(identityId);
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

// ── 小零件 ──

function Avatar({ person, self, size = 34 }: { person?: Person | null; self?: string; size?: number }) {
  return (
    <span className={`ali-av ${self !== undefined ? "is-me" : ""}`} style={{ width: size, height: size }}>
      {person?.avatar ? <img src={person.avatar} alt="" /> : <span>{(self ?? person?.name ?? "他").slice(0, 1)}</span>}
    </span>
  );
}

function Nav({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <header className="ali-nav">
      <button type="button" className="ali-back" onClick={onBack} aria-label="返回"><ChevronLeft size={22} strokeWidth={1.5} /></button>
      <b>{title}</b>
      <span className="ali-nav-right">{right}</span>
    </header>
  );
}

function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="ali-sheet-backdrop" onClick={onClose}>
      <section className="ali-sheet" onClick={e => e.stopPropagation()}>
        <div className="ali-sheet-bar" />
        {title ? <h3>{title}</h3> : null}
        {children}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="ali-field"><span>{label}</span>{children}</label>;
}

function AccountPicker({ wallet, value, onChange, label = "从哪付" }: { wallet: WalletState; value: string; onChange: (id: string) => void; label?: string }) {
  const own = wallet.cards.filter(c => !c.kin);
  return (
    <Field label={label}>
      <select className="ali-input" value={value} onChange={e => onChange(e.target.value)}>
        <option value={WALLET_BALANCE_ACCOUNT_ID}>余额（{yuan(wallet.balance)}）</option>
        {own.map(c => <option key={c.id} value={c.id}>{c.bankLabel} {c.title}（{yuan(c.balance)}）</option>)}
      </select>
    </Field>
  );
}

function PersonPicker({ people, value, onChange }: { people: Person[]; value: string; onChange: (id: string) => void }) {
  if (people.length === 0) return <p className="ali-hint">这个身份下还没有好友。</p>;
  return (
    <div className="ali-people">
      {people.map(p => (
        <button type="button" key={p.id} className={value === p.id ? "on" : ""} onClick={() => onChange(p.id)}>
          <Avatar person={p} size={40} />
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  );
}

function Icon({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className="ali-ic" onClick={onClick}>
      <span>{children}</span>{label}
    </button>
  );
}

// ── 主体 ──

export function AlipayApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
  const identities = useMemo(() => loadUserIdentities(), []);
  const [idn, setIdn] = useState<string | undefined>(() => getCurrentIdentityId());
  const [wallet, setWallet] = useState<WalletState>(() => loadWalletState(idn));
  const [ali, setAli] = useState<AlipayState>(() => accrueYuebao(idn));
  const [stack, setStack] = useState<Page[]>([{ id: "home" }]);
  const [sheet, setSheet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = useCallback((m: string) => onNotice?.(m), [onNotice]);

  const people = useMemo(() => friendsOf(idn), [idn]);
  const personById = useCallback((id: string) => people.find(p => p.id === id) || { id, name: loadCharacters().find(c => c.id === id)?.name || "他" }, [people]);
  const me = identities.find(i => i.id === idn) || identities[0];
  const myName = me?.name || "我";

  const refresh = useCallback(() => {
    setWallet(loadWalletState(idn));
    setAli(loadAlipay(idn));
  }, [idn]);

  useEffect(() => {
    setAli(accrueYuebao(idn));
    setWallet(loadWalletState(idn));
    window.addEventListener(WALLET_UPDATED_EVENT, refresh);
    window.addEventListener(ALIPAY_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(WALLET_UPDATED_EVENT, refresh);
      window.removeEventListener(ALIPAY_UPDATED_EVENT, refresh);
    };
  }, [idn, refresh]);

  const page = stack[stack.length - 1];
  const go = (p: Page) => setStack(s => [...s, p]);
  const back = () => (stack.length > 1 ? setStack(s => s.slice(0, -1)) : onClose());

  const kinCards = wallet.cards.filter(c => c.kin);
  const ownCards = wallet.cards.filter(c => !c.kin);
  const cardTotal = ownCards.reduce((s, c) => s + c.balance, 0);
  const pouchTotal = ali.pouches.reduce((s, p) => s + p.balance, 0);
  const total = getWalletTotalBalance(wallet) + ali.yuebao.balance;

  const run = async (fn: () => Promise<void>, done?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (done) notice(done);
    } catch (error) {
      console.warn("[Alipay]", error);
      notice("出错了，等会儿再试试");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  // ── 各页 ──

  const home = (
    <div className="ali-page">
      <div className="ali-home-top">
        <button type="button" className="ali-idsw" onClick={() => identities.length > 1 && setSheet("identity")}>
          <Avatar self={myName} size={22} />{myName}{identities.length > 1 ? <ChevronDown size={13} /> : null}
        </button>
        <button type="button" className="ali-close" onClick={onClose}>关闭</button>
      </div>
      <div className="ali-en">Total Assets</div>
      <div className="ali-big">{yuan(total)}</div>
      <div className="ali-sub">总资产</div>
      <div className="ali-gl" />
      <div className="ali-row3">
        <div>余额<b>{plain(wallet.balance)}</b></div>
        <div>余额宝<b>{plain(ali.yuebao.balance)}</b></div>
        <div>银行卡<b>{plain(cardTotal)}</b></div>
      </div>
      {pouchTotal > 0 ? <div className="ali-hint" style={{ marginTop: 10 }}>另有小荷包里存着 {yuan(pouchTotal)}</div> : null}
      <div className="ali-gl" />
      <div className="ali-grid">
        <Icon label="转账" onClick={() => setSheet("transfer")}><ArrowLeftRight /></Icon>
        <Icon label="卡包" onClick={() => go({ id: "cards" })}><CreditCard /></Icon>
        <Icon label="亲属卡" onClick={() => go({ id: "kin" })}><Heart /></Icon>
        <Icon label="小荷包" onClick={() => go({ id: "pouches" })}><PiggyBank /></Icon>
        <Icon label="余额宝" onClick={() => go({ id: "yuebao" })}><TrendingUp /></Icon>
        <Icon label="账单" onClick={() => go({ id: "bill" })}><ReceiptText /></Icon>
        <Icon label="改数值" onClick={() => setSheet("edit")}><PenLine /></Icon>
      </div>
      <section className="ali-pn">
        <div className="ali-h">最近账单<button type="button" onClick={() => go({ id: "bill" })}>全部</button></div>
        {wallet.transactions.slice(0, 6).map(t => (
          <div className="ali-bill" key={t.id}>
            <span className="ali-av is-o">{(t.category || t.title).slice(0, 1)}</span>
            <div className="ali-bt">{t.title}<small>{fmtDay(t.createdAt)}{t.detail && t.detail !== t.title ? ` · ${t.detail}` : ""}</small></div>
            <div className={`ali-ba ${t.amount > 0 ? "in" : ""}`}>{t.amount > 0 ? "+" : ""}{t.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</div>
          </div>
        ))}
        {wallet.transactions.length === 0 ? <p className="ali-hint">还没有账单</p> : null}
      </section>
    </div>
  );

  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const activeCard: WalletCard | undefined = ownCards[Math.min(activeCardIdx, ownCards.length - 1)];

  const cards = (
    <div className="ali-page is-dark">
      <Nav title="卡包" onBack={back} right={<button type="button" onClick={() => setSheet("addCard")}>添加</button>} />
      <div
        className="cp-premium-card-stack ali-rail"
        ref={railRef}
        onScroll={e => {
          const el = e.currentTarget;
          const w = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 14 : el.clientWidth;
          setActiveCardIdx(Math.round(el.scrollLeft / Math.max(1, w)));
        }}
      >
        {ownCards.map((c, i) => <WalletBankCard key={c.id} card={c} active={i === activeCardIdx} />)}
      </div>
      {activeCard ? (
        <div className="ali-btns">
          <button type="button" onClick={() => setSheet(`value:${activeCard.id}`)}>改余额</button>
          <button type="button" onClick={() => setSheet(`cardInfo:${activeCard.id}`)}>改卡面</button>
          <button type="button" disabled={activeCard.isDefault} onClick={() => { setDefaultWalletCard(activeCard.id, idn); refresh(); }}>{activeCard.isDefault ? "默认卡" : "设为默认"}</button>
        </div>
      ) : null}
      <div className="ali-en" style={{ margin: "10px 2px" }}>Family Cards · 亲属卡</div>
      {kinCards.map(c => (
        <button type="button" key={c.id} className="ali-pn ali-line" onClick={() => go({ id: "kin" })}>
          <Avatar person={personById(c.kin!.charId)} />
          <div className="ali-bt">{c.kin!.charName} 给我的<small>每月 {yuan(c.kin!.monthlyLimit)} · 本月还剩 {yuan(c.balance)}</small></div>
          <ChevronRight size={16} className="ali-dim" />
        </button>
      ))}
      {ali.given.map(g => (
        <button type="button" key={g.charId} className="ali-pn ali-line" onClick={() => go({ id: "kin" })}>
          <Avatar self={myName} />
          <div className="ali-bt">我给 {personById(g.charId).name} 的<small>每月 {yuan(g.monthlyLimit)} · 本月已用 {yuan(givenThisMonth(g, currentMonthKey()).used)}</small></div>
          <ChevronRight size={16} className="ali-dim" />
        </button>
      ))}
      <button type="button" className="ali-gold-link" onClick={() => go({ id: "kin" })}>＋ 开一张 · 向他申请</button>
    </div>
  );

  const [kinTab, setKinTab] = useState<"his" | "mine">("his");
  const kin = (
    <div className="ali-page">
      <Nav title="亲属卡" onBack={back} />
      <div className="ali-tabs">
        <button type="button" className={kinTab === "his" ? "on" : ""} onClick={() => setKinTab("his")}>他给我的</button>
        <button type="button" className={kinTab === "mine" ? "on" : ""} onClick={() => setKinTab("mine")}>我给他的</button>
      </div>
      {kinTab === "his" ? (
        <>
          {kinCards.map(c => {
            const k = c.kin!;
            const used = Math.max(0, k.monthlyLimit - c.balance);
            const spends = wallet.transactions.filter(t => t.cardId === c.id).slice(0, 8);
            return (
              <section className="ali-pn" key={c.id}>
                <div className="ali-who"><Avatar person={personById(k.charId)} size={40} /><div><b>{k.charName}</b><small>{c.createdAt.slice(0, 10).replace(/-/g, ".")} 开通 · 他付款</small></div></div>
                <div className="ali-gl" />
                <div className="ali-en">Remaining This Month</div>
                <div className="ali-big is-m">{yuan(c.balance)}</div>
                <div className="ali-meter"><i style={{ width: `${Math.min(100, (used / Math.max(1, k.monthlyLimit)) * 100)}%` }} /></div>
                <div className="ali-hint">每月 {yuan(k.monthlyLimit)} · 已用 {yuan(used)} · 购物结账时选这张卡就是刷他的</div>
                {spends.length ? <div className="ali-h" style={{ marginTop: 14 }}>消费记录</div> : null}
                {spends.map(t => (
                  <div className="ali-bill" key={t.id}><div className="ali-bt">{t.detail || t.title}<small>{fmtDay(t.createdAt)} · {t.category}</small></div><div className="ali-ba">{t.amount.toFixed(2)}</div></div>
                ))}
                <div className="ali-kv">刷卡时提醒他<button type="button" onClick={() => { setKinCardNotify(c.id, !k.notify, idn); refresh(); }}>{k.notify ? "开" : "关"}</button></div>
                <div className="ali-kv">不要这张卡了<button type="button" onClick={() => setSheet(`dropKin:${c.id}`)}>删除</button></div>
              </section>
            );
          })}
          <section className="ali-pn">
            <div className="ali-h">再要一张</div>
            <p className="ali-hint">申请会发进你们的聊天，他按人设决定开不开、给多少额度。他也可能哪天自己给你开。</p>
            <div className="ali-btns is-in">
              <button type="button" className="g" onClick={() => setSheet("requestKin")}>向他申请</button>
              <button type="button" onClick={() => setSheet("manualKin")}>直接填</button>
            </div>
          </section>
        </>
      ) : (
        <>
          {ali.given.map(raw => {
            const g = givenThisMonth(raw, currentMonthKey());
            const p = personById(g.charId);
            return (
              <section className="ali-pn" key={g.charId}>
                <div className="ali-who"><Avatar person={p} size={40} /><div><b>{p.name}</b><small>我付款</small></div></div>
                <div className="ali-gl" />
                <div className="ali-en">Used This Month</div>
                <div className="ali-big is-m">{yuan(g.used)}</div>
                <div className="ali-meter"><i style={{ width: `${Math.min(100, (g.used / Math.max(1, g.monthlyLimit)) * 100)}%` }} /></div>
                <div className="ali-hint">每月 {yuan(g.monthlyLimit)}</div>
                {g.spends.length ? <div className="ali-h" style={{ marginTop: 14 }}>他买了</div> : null}
                {g.spends.slice(0, 8).map(s => (
                  <div className="ali-bill" key={s.id}><div className="ali-bt">{s.title}<small>{fmtDay(s.at)}</small></div><div className="ali-ba">-{s.amount.toFixed(2)}</div></div>
                ))}
                <div className="ali-kv">调整额度<button type="button" onClick={() => setSheet(`give:${g.charId}`)}>改</button></div>
                <div className="ali-kv">关掉这张卡<button type="button" onClick={() => { cancelGivenKinCard(g.charId); refresh(); }}>关闭</button></div>
              </section>
            );
          })}
          <button type="button" className="ali-gold-link" onClick={() => setSheet("give:")}>＋ 给他开一张</button>
        </>
      )}
    </div>
  );

  const pouches = (
    <div className="ali-page">
      <Nav title="小荷包" onBack={back} right={<button type="button" onClick={() => setSheet("newPouch")}>新建</button>} />
      <div className="ali-en" style={{ margin: "4px 2px 10px" }}>Shared Pockets · {ali.pouches.length}</div>
      {ali.pouches.map(p => <PouchCover key={p.id} pouch={p} who={personById(p.charId).name} onClick={() => go({ id: "pouch", pouchId: p.id })} />)}
      {ali.pouches.length === 0 ? <p className="ali-hint" style={{ textAlign: "center", marginTop: 40 }}>还没有小荷包。和他一起存点什么吧。</p> : null}
    </div>
  );

  const pouchPage = (pouchId: string) => {
    const p = ali.pouches.find(x => x.id === pouchId);
    if (!p) return <div className="ali-page"><Nav title="小荷包" onBack={back} /></div>;
    const who = personById(p.charId);
    const pct = p.target > 0 ? Math.min(100, (p.balance / p.target) * 100) : 0;
    return (
      <div className="ali-page">
        <Nav title={p.name} onBack={back} right={<button type="button" onClick={() => setSheet(`pouchMenu:${p.id}`)}>设置</button>} />
        <PouchCover pouch={p} who={who.name} short />
        <section className="ali-pn">
          <div className="ali-spread">
            <div><div className="ali-en">Saved</div><div className="ali-big is-m">{yuan(p.balance)}</div></div>
            <div className="ali-pair"><Avatar self={myName} size={24} /><Avatar person={who} size={24} /></div>
          </div>
          {p.target > 0 ? <>
            <div className="ali-meter"><i style={{ width: `${pct}%` }} /></div>
            <div className="ali-hint">目标 {yuan(p.target)} · {p.balance >= p.target ? "存够啦" : `还差 ${yuan(p.target - p.balance)}`}</div>
          </> : null}
          <div className="ali-btns is-in">
            <button type="button" className="g" onClick={() => setSheet(`pouchIn:${p.id}`)}>存入</button>
            <button type="button" onClick={() => setSheet(`pouchOut:${p.id}`)}>取出</button>
          </div>
        </section>
        <section className="ali-pn">
          <div className="ali-h">存钱记录</div>
          {p.records.map(r => (
            <div className="ali-bill" key={r.id}>
              {r.by === ALIPAY_SELF ? <Avatar self={myName} /> : <Avatar person={who} />}
              <div className="ali-bt">{r.by === ALIPAY_SELF ? "我" : who.name}{r.amount >= 0 ? "存入" : "取出"}<small>{fmtDay(r.at)}{r.note ? ` · ${r.note}` : ""}</small></div>
              <div className={`ali-ba ${r.amount >= 0 ? "in" : ""}`}>{r.amount >= 0 ? "+" : ""}{plain(r.amount)}</div>
            </div>
          ))}
          {p.records.length === 0 ? <p className="ali-hint">还没人存过</p> : null}
        </section>
      </div>
    );
  };

  const y = ali.yuebao;
  const ybPath = useMemo(() => {
    const pts = [...y.days].slice(0, 14).reverse();
    if (pts.length < 2) return "";
    const max = Math.max(...pts.map(p => p.amount)), min = Math.min(...pts.map(p => p.amount));
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${(i / (pts.length - 1)) * 320} ${60 - ((p.amount - min) / Math.max(0.01, max - min)) * 44}`).join(" ");
  }, [y.days]);
  const yuebao = (
    <div className="ali-page">
      <Nav title="余额宝" onBack={back} />
      <section className="ali-pn">
        <div className="ali-en">Balance</div>
        <div className="ali-big">{yuan(y.balance)}</div>
        <div className="ali-gl" />
        <div className="ali-row3">
          <div>昨日收益<b className="in">+{(y.days[0]?.amount || 0).toFixed(2)}</b></div>
          <div>累计收益<b className="in">+{y.earned.toFixed(2)}</b></div>
          <div>七日年化<b>{y.rate.toFixed(2)}%</b></div>
        </div>
        {ybPath ? (
          <svg viewBox="0 0 320 64" width="100%" className="ali-spark">
            <path d={ybPath} fill="none" stroke="#C9A96E" strokeWidth="1.5" />
            <path d={`${ybPath} L320 64 L0 64z`} fill="#C9A96E" opacity=".08" />
          </svg>
        ) : null}
        <div className="ali-btns is-in">
          <button type="button" className="g" onClick={() => setSheet("ybIn")}>转入</button>
          <button type="button" onClick={() => setSheet("ybOut")}>转出</button>
        </div>
        <div className="ali-kv">七日年化<button type="button" onClick={() => setSheet("ybRate")}>{y.rate.toFixed(2)}% · 改</button></div>
      </section>
      <section className="ali-pn">
        <div className="ali-h">收益明细</div>
        {y.days.slice(0, 14).map(d => (
          <div className="ali-bill" key={d.date}><div className="ali-bt">{d.date.slice(5).replace("-", ".")}</div><div className="ali-ba in">+{d.amount.toFixed(2)}</div></div>
        ))}
        {y.days.length === 0 ? <p className="ali-hint">转进来以后，每天打开会自动算前一天的收益。</p> : null}
      </section>
    </div>
  );

  const months = useMemo(() => {
    const set = new Set<string>([currentMonthKey()]);
    for (const t of wallet.transactions) set.add(t.createdAt.slice(0, 7));
    return Array.from(set).sort().reverse().slice(0, 12);
  }, [wallet.transactions]);
  const [billMonth, setBillMonth] = useState(currentMonthKey());
  const [billChar, setBillChar] = useState<string>("");
  const billData = useMemo(() => {
    const list = wallet.transactions.filter(t => t.createdAt.slice(0, 7) === billMonth && t.kind !== "adjustment");
    // 刷他给的亲属卡是他付的钱，不算她的支出
    const kinIds = new Set(wallet.cards.filter(c => c.kin).map(c => c.id));
    const mine = list.filter(t => !kinIds.has(t.cardId));
    const out = mine.filter(t => t.amount < 0), inc = mine.filter(t => t.amount > 0);
    const byCat = new Map<string, number>();
    for (const t of out) byCat.set(t.category || "其他", (byCat.get(t.category || "其他") || 0) - t.amount);
    const cats = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
    return {
      list,
      kinIds,
      kinPaid: list.filter(t => kinIds.has(t.cardId)).reduce((s, t) => s - t.amount, 0),
      expense: out.reduce((s, t) => s - t.amount, 0),
      income: inc.reduce((s, t) => s + t.amount, 0),
      cats,
    };
  }, [wallet.transactions, billMonth]);
  const PIE = ["#C9A96E", "#8D7650", "#5E5040", "#3A332B", "#26231f"];
  const pie = useMemo(() => {
    const top = billData.cats.slice(0, 4);
    const rest = billData.cats.slice(4).reduce((s, c) => s + c[1], 0);
    const parts = rest > 0 ? [...top, ["其他", rest] as [string, number]] : top;
    const sum = parts.reduce((s, c) => s + c[1], 0) || 1;
    let acc = 0;
    const stops = parts.map(([, v], i) => { const a = acc; acc += (v / sum) * 100; return `${PIE[i]} ${a}% ${acc}%`; });
    return { parts: parts.map(([k, v], i) => ({ k, pct: Math.round((v / sum) * 100), c: PIE[i] })), bg: stops.length ? `conic-gradient(${stops.join(",")})` : "#26231f" };
  }, [billData]);
  const noteChar = billChar || people[0]?.id || "";
  const billNote = noteChar ? ali.billNotes[`${billMonth}:${noteChar}`] : "";
  const bill = (
    <div className="ali-page">
      <Nav title="账单" onBack={back} />
      <div className="ali-tabs is-scroll">
        {months.map(m => <button type="button" key={m} className={m === billMonth ? "on" : ""} onClick={() => setBillMonth(m)}>{Number(m.slice(5))}月</button>)}
      </div>
      <section className="ali-pn ali-spread">
        <div><div className="ali-en">Expense</div><div className="ali-big is-s">{yuan(billData.expense)}</div></div>
        <div style={{ textAlign: "right" }}><div className="ali-en">Income</div><div className="ali-big is-s in">{yuan(billData.income)}</div></div>
      </section>
      {billData.kinPaid > 0 ? <p className="ali-hint" style={{ margin: "-4px 2px 12px" }}>另有刷亲属卡 {yuan(billData.kinPaid)}，是他付的</p> : null}
      {pie.parts.length ? (
        <section className="ali-pn ali-pie-row">
          <div className="ali-pie" style={{ background: pie.bg }} />
          <div className="ali-lg">{pie.parts.map(p => <div key={p.k}><i style={{ background: p.c }} />{p.k} {p.pct}%</div>)}</div>
        </section>
      ) : null}
      {people.length ? (
        <section className="ali-pn">
          <div className="ali-h">他看了你的账单
            <select className="ali-mini-select" value={noteChar} onChange={e => setBillChar(e.target.value)}>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {billNote ? <div className="ali-note">「{billNote}」</div> : <p className="ali-hint">{personById(noteChar).name}还没看过这个月的账单。</p>}
          <button
            type="button"
            className="ali-gold-link is-left"
            disabled={busy || billData.list.length === 0}
            onClick={() => run(async () => {
              const summary = [
                `支出 ${yuan(billData.expense)}，收入 ${yuan(billData.income)}。`,
                `支出分类：${billData.cats.map(([k, v]) => `${k} ${yuan(v)}`).join("、") || "无"}。`,
                `明细（最多 25 条）：`,
                ...billData.list.slice(0, 25).map(t => `- ${t.createdAt.slice(5, 10)} ${t.title}${t.detail && t.detail !== t.title ? `（${t.detail}）` : ""} ${t.amount > 0 ? "+" : ""}${t.amount.toFixed(2)}${billData.kinIds.has(t.cardId) ? `（刷的${wallet.cards.find(c => c.id === t.cardId)?.kin?.charName || "别人"}给的亲属卡）` : ""}`),
              ].join("\n");
              await writeBillNote(noteChar, billMonth, summary);
            })}
          >{busy ? "他在看…" : billNote ? "让他再看一次" : "让他看看"}</button>
        </section>
      ) : null}
      <section className="ali-pn">
        <div className="ali-h">明细</div>
        {billData.list.map(t => (
          <div className="ali-bill" key={t.id}>
            <span className="ali-av is-o">{(t.category || t.title).slice(0, 1)}</span>
            <div className="ali-bt">{t.title}{billData.kinIds.has(t.cardId) ? " · 他付" : ""}<small>{fmtDay(t.createdAt)}{t.detail && t.detail !== t.title ? ` · ${t.detail}` : ""}</small></div>
            <div className={`ali-ba ${t.amount > 0 ? "in" : ""}`}>{t.amount > 0 ? "+" : ""}{t.amount.toFixed(2)}</div>
          </div>
        ))}
        {billData.list.length === 0 ? <p className="ali-hint">这个月没有账单</p> : null}
      </section>
    </div>
  );

  let body: React.ReactNode = home;
  if (page.id === "cards") body = cards;
  else if (page.id === "kin") body = kin;
  else if (page.id === "pouches") body = pouches;
  else if (page.id === "pouch") body = pouchPage(page.pouchId);
  else if (page.id === "yuebao") body = yuebao;
  else if (page.id === "bill") body = bill;

  return (
    <div className="ali-app">
      {body}
      {sheet ? (
        <AlipaySheets
          sheet={sheet}
          close={() => setSheet(null)}
          wallet={wallet}
          ali={ali}
          idn={idn}
          identities={identities}
          people={people}
          busy={busy}
          run={run}
          refresh={refresh}
          notice={notice}
          setIdn={id => { setIdn(id); setStack([{ id: "home" }]); }}
          goBack={back}
        />
      ) : null}
    </div>
  );
}

function PouchCover({ pouch, who, onClick, short }: { pouch: Pouch; who: string; onClick?: () => void; short?: boolean }) {
  const url = useMediaUrl(pouch.cover);
  const pct = pouch.target > 0 ? Math.min(100, Math.round((pouch.balance / pouch.target) * 100)) : null;
  return (
    <button type="button" className={`ali-cover ${short ? "is-short" : ""}`} onClick={onClick} disabled={!onClick} style={url ? { backgroundImage: `url(${url})` } : undefined}>
      {pct !== null && !short ? <span className="ali-pct">{pct}%</span> : null}
      <h3>{pouch.name}</h3>
      <p>{who} 和我{short ? "一起存" : ` · ${plain(pouch.balance)}${pouch.target > 0 ? ` / ${plain(pouch.target)}` : ""}`}</p>
    </button>
  );
}

// ── 弹层 ──

function AlipaySheets(props: {
  sheet: string;
  close: () => void;
  wallet: WalletState;
  ali: AlipayState;
  idn?: string;
  identities: { id: string; name: string }[];
  people: Person[];
  busy: boolean;
  run: (fn: () => Promise<void>, done?: string) => Promise<void>;
  refresh: () => void;
  notice: (m: string) => void;
  setIdn: (id: string) => void;
  goBack: () => void;
}) {
  const { sheet, close, wallet, ali, idn, identities, people, busy, run, refresh, notice } = props;
  const [kind, arg = ""] = sheet.split(/:(.*)/s);
  const [who, setWho] = useState(arg && people.some(p => p.id === arg) ? arg : people[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [text, setText] = useState("");
  const [account, setAccount] = useState(() => (kind === "give" ? ali.given.find(g => g.charId === arg)?.accountId : undefined) || WALLET_BALANCE_ACCOUNT_ID);
  const [style, setStyle] = useState<WalletCardStyle>(() => wallet.cards.find(c => c.id === arg)?.cardStyle || "obsidian");
  const [bank, setBank] = useState("");
  const [cover, setCover] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const coverUrl = useMediaUrl(cover);
  const [values, setValues] = useState<Record<string, string>>(() => ({
    [WALLET_BALANCE_ACCOUNT_ID]: String(wallet.balance),
    ...Object.fromEntries(wallet.cards.filter(c => !c.kin).map(c => [c.id, String(c.balance)])),
  }));

  const pickCover = async (file?: File | null) => {
    if (!file) return;
    const ref = await storeMediaBlob(file, file.type || "image/jpeg", "image");
    setCover(ref);
  };
  const coverInput = (
    <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { void pickCover(e.target.files?.[0]); e.target.value = ""; }} />
  );

  if (kind === "identity") {
    return (
      <Sheet title="切换身份" onClose={close}>
        <p className="ali-hint">每个身份一个钱包。这里只是看，不会改聊天里用的身份。</p>
        {identities.map(i => (
          <button type="button" key={i.id} className={`ali-opt ${i.id === idn ? "on" : ""}`} onClick={() => { props.setIdn(i.id); close(); }}>{i.name}</button>
        ))}
      </Sheet>
    );
  }

  if (kind === "transfer") {
    return (
      <Sheet title="转账" onClose={close}>
        <PersonPicker people={people} value={who} onChange={setWho} />
        <Field label="金额"><input className="ali-input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></Field>
        <Field label="留言"><input className="ali-input" value={text} onChange={e => setText(e.target.value)} placeholder="可以不写" maxLength={30} /></Field>
        <AccountPicker wallet={wallet} value={account} onChange={setAccount} />
        <button type="button" className="ali-primary" disabled={!who || num(amount) <= 0} onClick={() => {
          const r = transferToChar(who, num(amount), text.trim(), account, idn);
          if (!r.ok) { notice(r.error || "转账失败"); return; }
          notice("转账已发到聊天里"); refresh(); close();
        }}>转给他</button>
      </Sheet>
    );
  }

  if (kind === "edit") {
    return (
      <Sheet title="改数值" onClose={close}>
        <p className="ali-hint">直接改成你想要的数，账单里会记一笔「调整」，不算进收支。</p>
        <Field label="余额"><input className="ali-input" inputMode="decimal" value={values[WALLET_BALANCE_ACCOUNT_ID]} onChange={e => setValues(v => ({ ...v, [WALLET_BALANCE_ACCOUNT_ID]: e.target.value }))} /></Field>
        {wallet.cards.filter(c => !c.kin).map(c => (
          <Field key={c.id} label={`${c.bankLabel} ${c.title}`}><input className="ali-input" inputMode="decimal" value={values[c.id]} onChange={e => setValues(v => ({ ...v, [c.id]: e.target.value }))} /></Field>
        ))}
        <Field label="余额宝"><input className="ali-input" inputMode="decimal" value={values.yuebao ?? String(ali.yuebao.balance)} onChange={e => setValues(v => ({ ...v, yuebao: e.target.value }))} /></Field>
        <button type="button" className="ali-primary" onClick={() => {
          for (const [id, raw] of Object.entries(values)) {
            if (id === "yuebao") continue;
            setWalletAccountValue(id, num(raw), idn);
          }
          if (values.yuebao !== undefined) updateAlipay(s => { s.yuebao.balance = num(values.yuebao); }, idn);
          refresh(); close(); notice("改好了");
        }}>保存</button>
      </Sheet>
    );
  }

  if (kind === "value") {
    const card = wallet.cards.find(c => c.id === arg);
    return (
      <Sheet title={`改余额 · ${card?.title || ""}`} onClose={close}>
        <Field label="改成"><input className="ali-input" inputMode="decimal" autoFocus defaultValue={String(card?.balance ?? 0)} onChange={e => setAmount(e.target.value)} /></Field>
        <button type="button" className="ali-primary" onClick={() => { setWalletAccountValue(arg, num(amount || String(card?.balance ?? 0)), idn); refresh(); close(); }}>保存</button>
      </Sheet>
    );
  }

  if (kind === "addCard" || kind === "cardInfo") {
    const card = wallet.cards.find(c => c.id === arg);
    return (
      <Sheet title={card ? "改卡面" : "添加银行卡"} onClose={close}>
        <Field label="银行"><input className="ali-input" defaultValue={card?.bankLabel} onChange={e => setBank(e.target.value)} placeholder="招商银行、汇丰…随便写" /></Field>
        <Field label="卡名"><input className="ali-input" defaultValue={card?.title} onChange={e => setText(e.target.value)} placeholder="比如 储蓄卡 / 你的名字" /></Field>
        {!card ? <Field label="余额"><input className="ali-input" inputMode="decimal" onChange={e => setAmount(e.target.value)} placeholder="0" /></Field> : null}
        <Field label="卡面">
          <div className="ali-chips">
            {STYLE_OPTIONS.map(o => <button type="button" key={o.id} className={style === o.id ? "on" : ""} onClick={() => setStyle(o.id)}>{o.label}</button>)}
          </div>
        </Field>
        <button type="button" className="ali-primary" onClick={() => {
          if (card) updateWalletCardInfo(card.id, { bankLabel: bank || card.bankLabel, title: text || card.title, cardStyle: style }, idn);
          else createWalletCard({ bankLabel: bank || "BANK", title: text || "储蓄卡", cardStyle: style, balance: num(amount) }, idn);
          refresh(); close();
        }}>{card ? "保存" : "添加"}</button>
        {card ? <button type="button" className="ali-danger" onClick={() => {
          const r = deleteWalletCard(card.id, idn);
          if (!r.ok) notice(r.error || "删不了"); refresh(); close();
        }}>删除这张卡</button> : null}
      </Sheet>
    );
  }

  if (kind === "dropKin") {
    return (
      <Sheet title="删除这张亲属卡？" onClose={close}>
        <p className="ali-hint">只是从你这边删掉，他不会收到通知。</p>
        <button type="button" className="ali-danger" onClick={() => { deleteWalletCard(arg, idn); refresh(); close(); }}>删除</button>
      </Sheet>
    );
  }

  if (kind === "requestKin") {
    const pending = (id: string) => Boolean(ali.pendingRequests[id]);
    return (
      <Sheet title="向他申请亲属卡" onClose={close}>
        <PersonPicker people={people} value={who} onChange={setWho} />
        <p className="ali-hint">申请卡片会发进你们的聊天，他决定好了会在聊天里回你。</p>
        <button type="button" className="ali-primary" disabled={!who || busy || pending(who)} onClick={() => {
          close();
          void run(() => requestKinCard(who), "申请已发出");
        }}>{pending(who) ? "等他回应中" : "发出申请"}</button>
      </Sheet>
    );
  }

  if (kind === "manualKin") {
    return (
      <Sheet title="直接填一张他给的亲属卡" onClose={close}>
        <PersonPicker people={people} value={who} onChange={setWho} />
        <Field label="每月额度"><input className="ali-input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="比如 100000" /></Field>
        <p className="ali-hint">不经过聊天，他也不会收到消息；之后你刷这张卡他照样收到提醒。</p>
        <button type="button" className="ali-primary" disabled={!who || num(amount) <= 0} onClick={() => {
          const p = people.find(x => x.id === who);
          upsertKinCard({ charId: who, charName: p?.name || "他", monthlyLimit: num(amount) }, idn);
          refresh(); close(); notice("加好了");
        }}>添加</button>
      </Sheet>
    );
  }

  if (kind === "give") {
    const existing = ali.given.find(g => g.charId === (arg || who));
    return (
      <Sheet title={existing ? "调整额度" : "给他开亲属卡"} onClose={close}>
        {!arg ? <PersonPicker people={people} value={who} onChange={setWho} /> : null}
        <Field label="每月额度"><input className="ali-input" inputMode="decimal" defaultValue={existing ? String(existing.monthlyLimit) : ""} onChange={e => setAmount(e.target.value)} placeholder="比如 50000" /></Field>
        <AccountPicker wallet={wallet} value={account} onChange={setAccount} label="他花的从哪扣" />
        <p className="ali-hint">开卡卡片会发进你们的聊天。他偶尔会用它买东西，从你选的账户扣，你这里能看到他买了什么。</p>
        <button type="button" className="ali-primary" disabled={!(arg || who) || num(amount || String(existing?.monthlyLimit || 0)) <= 0} onClick={() => {
          giveKinCard(arg || who, num(amount || String(existing?.monthlyLimit || 0)), account);
          refresh(); close(); notice("已开通");
        }}>{existing ? "保存" : "开通"}</button>
      </Sheet>
    );
  }

  if (kind === "newPouch") {
    return (
      <Sheet title="新建小荷包" onClose={close}>
        <Field label="和谁一起存"><PersonPicker people={people} value={who} onChange={setWho} /></Field>
        <Field label="名字"><input className="ali-input" value={text} onChange={e => setText(e.target.value)} placeholder="比如 冰岛看极光" maxLength={20} /></Field>
        <Field label="目标金额"><input className="ali-input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="不填就是没目标" /></Field>
        <Field label="封面">
          <button type="button" className="ali-cover-pick" onClick={() => fileRef.current?.click()} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}>
            {coverUrl ? null : <><ImagePlus size={18} />上传一张图</>}
          </button>
          {coverInput}
        </Field>
        <button type="button" className="ali-primary" disabled={!who || !text.trim()} onClick={() => {
          createPouch({ name: text, charId: who, target: num(amount), cover });
          refresh(); close(); notice("小荷包建好了，邀请发进聊天里了");
        }}>建好了</button>
      </Sheet>
    );
  }

  if (kind === "pouchMenu") {
    const p = ali.pouches.find(x => x.id === arg);
    if (!p) return null;
    return (
      <Sheet title={p.name} onClose={close}>
        <Field label="名字"><input className="ali-input" defaultValue={p.name} onChange={e => setText(e.target.value)} maxLength={20} /></Field>
        <Field label="目标金额"><input className="ali-input" inputMode="decimal" defaultValue={p.target ? String(p.target) : ""} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="封面">
          <button type="button" className="ali-cover-pick" onClick={() => fileRef.current?.click()} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}>
            {coverUrl ? null : <><ImagePlus size={18} />换一张</>}
          </button>
          {coverInput}
        </Field>
        <button type="button" className="ali-primary" onClick={() => {
          updateAlipay(s => {
            const x = s.pouches.find(q => q.id === p.id);
            if (!x) return;
            if (text.trim()) x.name = text.trim();
            if (amount !== "") x.target = num(amount);
            if (cover) x.cover = cover;
          }, idn);
          refresh(); close();
        }}>保存</button>
        <button type="button" className="ali-danger" onClick={() => { deletePouch(p.id, idn); refresh(); close(); props.goBack(); notice("解散了，里面的钱退回余额"); }}>解散小荷包</button>
      </Sheet>
    );
  }

  if (kind === "pouchIn" || kind === "pouchOut") {
    const p = ali.pouches.find(x => x.id === arg);
    if (!p) return null;
    const isIn = kind === "pouchIn";
    return (
      <Sheet title={isIn ? `存入「${p.name}」` : `从「${p.name}」取出`} onClose={close}>
        <Field label="金额"><input className="ali-input" inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></Field>
        <AccountPicker wallet={wallet} value={account} onChange={setAccount} label={isIn ? "从哪存" : "取到哪"} />
        {!isIn ? <p className="ali-hint">里面现在有 {yuan(p.balance)}</p> : null}
        <button type="button" className="ali-primary" disabled={num(amount) <= 0} onClick={() => {
          const r = movePouchMoney(p.id, isIn ? "in" : "out", num(amount), account, idn);
          if (!r.ok) { notice(r.error || "没成功"); return; }
          refresh(); close();
        }}>{isIn ? "存入" : "取出"}</button>
      </Sheet>
    );
  }

  if (kind === "ybIn" || kind === "ybOut") {
    const isIn = kind === "ybIn";
    return (
      <Sheet title={isIn ? "转入余额宝" : "转出余额宝"} onClose={close}>
        <Field label="金额"><input className="ali-input" inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></Field>
        <AccountPicker wallet={wallet} value={account} onChange={setAccount} label={isIn ? "从哪转" : "转到哪"} />
        {!isIn ? <p className="ali-hint">余额宝里有 {yuan(ali.yuebao.balance)}</p> : null}
        <button type="button" className="ali-primary" disabled={num(amount) <= 0} onClick={() => {
          const n = num(amount);
          if (!isIn && n > ali.yuebao.balance) { notice("余额宝里没这么多"); return; }
          const r = walletTransact({ accountId: account, amount: isIn ? -n : n, title: isIn ? "转入余额宝" : "余额宝转出", category: "余额宝" }, idn);
          if (!r.ok) { notice(r.error || "没成功"); return; }
          updateAlipay(s => { s.yuebao.balance = Math.round((s.yuebao.balance + (isIn ? n : -n)) * 100) / 100; }, idn);
          refresh(); close();
        }}>{isIn ? "转入" : "转出"}</button>
      </Sheet>
    );
  }

  if (kind === "ybRate") {
    return (
      <Sheet title="七日年化" onClose={close}>
        <Field label="百分比"><input className="ali-input" inputMode="decimal" autoFocus defaultValue={String(ali.yuebao.rate)} onChange={e => setAmount(e.target.value)} /></Field>
        <p className="ali-hint">每天的收益 = 余额宝里的钱 × 年化 ÷ 365</p>
        <button type="button" className="ali-primary" onClick={() => { updateAlipay(s => { s.yuebao.rate = Math.min(100, num(amount || String(s.yuebao.rate))); }, idn); refresh(); close(); }}>保存</button>
      </Sheet>
    );
  }

  return null;
}
