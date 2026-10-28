"use client";

import { requestStageForNode } from "@/lib/idol-stage";
import { useEffect, useRef, useState } from "react";
import { BarChart3, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, FileText, Inbox, Info, List, Mail, Minus, Pencil, Plus, RefreshCw, Star, Trash2, Users, X } from "lucide-react";

import {
  CAREER_EVENT,
  COMPANIES,
  companyOf,
  expandInsider,
  listOf,
  loadCareer,
  saveCareer,
  type Career,
  type CareerNode,
} from "@/lib/idol-career";
import {
  acceptInvite, addMine, checkNode, declineInvite, deleteNode, isNightNow, leaveNode, setNote, setWish, teacherOf, uncheckNode,
} from "@/lib/idol-reminders";
import { loadMonths, overrideMyRank, RANK_EVENT } from "@/lib/idol-ledger";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const DAY = 864e5;
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

function whenText(ms: number): string {
  const d = new Date(ms);
  const today = dayStart(Date.now());
  const diff = Math.round((dayStart(ms) - today) / DAY);
  if (diff === 0) return `今天 ${hm(d)}`;
  if (diff === 1) return `明天 ${hm(d)}`;
  if (diff === -1) return `昨天 ${hm(d)}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]} ${hm(d)}`;
}

/** 提醒事项里的一行：日程节点，或者还没回复的公司邀请 */
type Item = CareerNode & { offerId?: string };

function useCareer(): Career {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener(CAREER_EVENT, bump);
    const timer = window.setInterval(bump, 10000);
    return () => { window.removeEventListener(CAREER_EVENT, bump); window.clearInterval(timer); };
  }, []);
  return loadCareer();
}

function allItems(career: Career): Item[] {
  const now = Date.now();
  const offers: Item[] = career.offers.filter(o => o.status === "new" && now >= o.at).map(o => {
    const c = companyOf(o.companyId)!;
    return {
      id: o.id, offerId: o.id, kind: "audition", title: `${c.name} ${o.kind === "scout" ? "试镜邀请" : "试镜通知"}`, place: o.place,
      premise: "", dueAt: o.at, status: "invite", from: c.name, note: o.message,
    };
  });
  return [...offers, ...career.nodes];
}

type ListKey = "today" | "plan" | "invite" | "all" | "off" | "done" | "company" | "chance" | "date" | "mine";
const LIST_TITLE: Record<ListKey, string> = {
  today: "今天", plan: "计划", invite: "待回复", all: "全部", off: "请假 · 缺席", done: "完成",
  company: "公司日程", chance: "机会", date: "约", mine: "我自己记的",
};
const LIST_COLOR: Record<ListKey, string> = {
  today: "#0a84ff", plan: "#ff3b30", invite: "#ff9f0a", all: "#636366", off: "#ff2d55", done: "#8e8e93",
  company: "#0a84ff", chance: "#ff9f0a", date: "#30d158", mine: "#bf5af2",
};

const isOpen = (i: Item) => i.status === "pending" || i.status === "invite";

function pick(items: Item[], key: ListKey): Item[] {
  const today = dayStart(Date.now());
  switch (key) {
    case "today": return items.filter(i => isOpen(i) && dayStart(i.dueAt) === today);
    case "plan": return items.filter(i => i.status === "pending");
    case "invite": return items.filter(i => i.status === "invite");
    case "all": return items.filter(isOpen);
    case "off": return items.filter(i => i.status === "leave" || i.status === "absent" || i.status === "passed");
    case "done": return items.filter(i => i.status === "done");
    default: return items.filter(i => listOf(i) === (key === "company" ? "company" : key));
  }
}

/** 列表页的分组 */
function sections(items: Item[], key: ListKey): { title: string; sub?: string; rows: Item[] }[] {
  const asc = (a: Item, b: Item) => a.dueAt - b.dueAt;
  const desc = (a: Item, b: Item) => b.dueAt - a.dueAt;
  if (key === "done" || key === "off") return [{ title: "", rows: [...items].sort(desc) }];
  const invites = items.filter(i => i.status === "invite").sort(asc);
  const pending = items.filter(i => i.status === "pending").sort(asc);
  const closed = items.filter(i => !isOpen(i) && i.status !== "declined").sort(desc).slice(0, 12);
  const out: { title: string; sub?: string; rows: Item[] }[] = [];
  const today = dayStart(Date.now());
  const todayRows = pending.filter(i => dayStart(i.dueAt) <= today);
  const tomorrow = pending.filter(i => dayStart(i.dueAt) === today + DAY);
  const week = pending.filter(i => dayStart(i.dueAt) > today + DAY && dayStart(i.dueAt) < today + 7 * DAY);
  const later = pending.filter(i => dayStart(i.dueAt) >= today + 7 * DAY);
  const d = new Date();
  if (todayRows.length) out.push({ title: "今天", sub: `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`, rows: todayRows });
  if (invites.length) out.push({ title: "待回复", rows: invites });
  if (tomorrow.length) out.push({ title: "明天", rows: tomorrow });
  if (week.length) out.push({ title: "这一周", rows: week });
  if (later.length) out.push({ title: "以后", rows: later });
  if (key !== "today" && key !== "plan" && key !== "invite" && key !== "all" && closed.length) out.push({ title: "已结束", rows: closed });
  return out;
}

function Circle({ item, onClick }: { item: Item; onClick: () => void }) {
  const s = item.status;
  if (s === "done") return <button type="button" className="rm-ck on" onClick={onClick} aria-label="改回没做"><Check size={14} strokeWidth={3.4} /></button>;
  if (s === "leave") return <span className="rm-ck leave"><Minus size={14} strokeWidth={3.4} /></span>;
  if (s === "absent" || s === "passed") return <span className="rm-ck absent"><X size={13} strokeWidth={3.4} /></span>;
  if (s === "declined") return <span className="rm-ck gone" />;
  if (s === "invite") return <span className="rm-ck invite" />;
  return <button type="button" className="rm-ck" onClick={onClick} aria-label="打勾" />;
}

function statusText(i: Item): string | null {
  if (i.status === "done") return i.result || "完成";
  if (i.status === "leave") return `已请假${i.result && i.result !== "请假" ? ` · ${i.result}` : ""}`;
  if (i.status === "absent" || i.status === "passed") return "缺席";
  if (i.status === "declined") return i.result || "没去";
  return null;
}

function Row({ item, swiped, onSwipe, onCheck, onInfo, onLeave, onDelete, onNotice }: {
  item: Item; swiped: boolean; onSwipe: (open: boolean) => void; onCheck: () => void; onInfo: () => void; onLeave: () => void; onDelete: () => void; onNotice?: (m: string) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const now = Date.now();
  const red = item.status === "pending" && dayStart(item.dueAt) <= dayStart(now);
  const st = statusText(item);
  const canLeave = item.status === "pending" && item.kind !== "custom";
  const canDelete = item.kind === "custom";
  const acts = (canLeave ? 1 : 0) + (canDelete ? 1 : 0) + 1;
  return (
    <div className="rm-swipe">
      <div className="rm-acts">
        {canLeave ? <button type="button" className="a-leave" onClick={onLeave}><FileText size={20} />请假</button> : null}
        {canDelete ? <button type="button" className="a-del" onClick={onDelete}><Trash2 size={20} />删除</button> : null}
        <button type="button" className="a-info" onClick={onInfo}><Info size={20} />详情</button>
      </div>
      <div
        className="rm-row"
        style={{ transform: swiped ? `translateX(-${acts * 75}px)` : undefined }}
        onPointerDown={e => { start.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={e => {
          const s = start.current; start.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(e.clientY - s.y)) onSwipe(dx < 0);
        }}
      >
        <Circle item={item} onClick={onCheck} />
        <div className="rm-body" onClick={() => (swiped ? onSwipe(false) : onInfo())}>
          <div className={`rm-ti ${item.status !== "pending" && item.status !== "invite" ? "dim" : ""}`}>{item.title}</div>
          <div className={`rm-tm ${red ? "red" : ""}`}>{whenText(item.dueAt)}</div>
          {item.from || item.place ? <div className="rm-sub">{[item.from ? `${item.from}${item.kind === "date" ? "约的" : "通知"}` : "", item.place].filter(Boolean).join(" · ")}</div> : null}
          {item.status === "invite" && item.note ? <div className="rm-sub rm-clamp">{item.note}</div> : null}
          {st ? <span className={`rm-res s-${item.status}`}>{st}</span> : null}
          {item.wish && item.status === "pending" ? <span className="rm-res s-wish">想要：{item.wish}</span> : null}
          {item.status === "invite" ? (
            <div className="rm-reply" onClick={e => e.stopPropagation()}>
              <button type="button" className="yes" onClick={() => { const n = acceptInvite(item.id); if (n) onNotice?.(`${n.title}：${whenText(n.dueAt)}，写进日历了`); }}>{item.offerId ? "去试镜" : "报名"}</button>
              <button type="button" onClick={() => { declineInvite(item.id); onNotice?.(item.offerId ? `婉拒了 ${item.from}` : "回了不去"); }}>{item.offerId ? "婉拒" : "不了"}</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 提醒事项：照 iOS 原生样子。白天浅色，晚上深色（跟世界时间） */
export function CareerApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
  const career = useCareer();
  const items = allItems(career);
  const [page, setPage] = useState<{ p: "home" } | { p: "list"; key: ListKey } | { p: "company" } | { p: "rank" }>({ p: "home" });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [leaveId, setLeaveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [swipeId, setSwipeId] = useState<string | null>(null);
  const dark = isNightNow();
  const company = companyOf(career.companyId);

  const onCheck = (i: Item) => {
    if (i.status === "done") { uncheckNode(i.id); return; }
    if (i.status !== "pending") return;
    if (i.kind === "custom") { void checkNode(i.id, ""); return; }
    setCheckId(i.id);
  };
  const go = (n: CareerNode) => { onClose(); window.setTimeout(() => requestStageForNode(n.id), 50); };

  const rowFor = (i: Item) => (
    <Row key={i.id} item={i} swiped={swipeId === i.id} onSwipe={open => setSwipeId(open ? i.id : null)} onNotice={onNotice}
      onCheck={() => onCheck(i)} onInfo={() => { setSwipeId(null); setDetailId(i.id); }}
      onLeave={() => { setSwipeId(null); setLeaveId(i.id); }} onDelete={() => { setSwipeId(null); deleteNode(i.id); }} />
  );

  const detail = detailId ? items.find(i => i.id === detailId) : undefined;
  const checking = checkId ? items.find(i => i.id === checkId) : undefined;
  const leaving = leaveId ? items.find(i => i.id === leaveId) : undefined;

  let body: React.ReactNode;
  if (detail) {
    body = <Detail item={detail} onAccept={() => { const n = acceptInvite(detail.id); setDetailId(null); if (n) onNotice?.(`${n.title}：${whenText(n.dueAt)}，写进日历了`); }} onDecline={() => { declineInvite(detail.id); setDetailId(null); onNotice?.(detail.offerId ? `婉拒了 ${detail.from}` : "回了不去"); }} onBack={() => setDetailId(null)} onGo={() => go(detail)} onCheck={() => onCheck(detail)} onLeave={() => setLeaveId(detail.id)} onDelete={() => { deleteNode(detail.id); setDetailId(null); }} />;
  } else if (page.p === "list") {
    const rows = pick(items, page.key);
    const secs = sections(rows, page.key);
    body = (
      <div className="rm-page" onClick={e => { if (swipeId && (e.target as HTMLElement).closest(".rm-row") == null) setSwipeId(null); }}>
        <div className="rm-top"><button type="button" className="rm-circle" onClick={() => setPage({ p: "home" })} aria-label="返回"><ChevronLeft size={22} /></button><span /></div>
        <h1 style={{ color: LIST_COLOR[page.key] }}>{LIST_TITLE[page.key]}</h1>
        {secs.length && secs.some(s => s.rows.length) ? secs.map((s, idx) => (
          <div key={idx}>
            {s.title ? <div className="rm-sec">{s.title}{s.sub ? <small>{s.sub}</small> : null}</div> : null}
            {s.rows.map(rowFor)}
          </div>
        )) : <p className="rm-empty">{page.key === "invite" ? "没有要回复的" : "没有提醒事项"}</p>}
        <div style={{ height: 100 }} />
      </div>
    );
  } else if (page.p === "company") {
    body = <CompanyPage onBack={() => setPage({ p: "home" })} onNotice={onNotice} />;
  } else if (page.p === "rank") {
    body = <RankPage onBack={() => setPage({ p: "home" })} onNotice={onNotice} />;
  } else {
    const card = (key: ListKey, icon: React.ReactNode, cls: string) => (
      <button type="button" className={`rm-card ${cls}`} onClick={() => setPage({ p: "list", key })}>
        <span className="rm-card-ic">{icon}</span><span className="rm-card-n">{pick(items, key).length}</span><span className="rm-card-l">{LIST_TITLE[key]}</span>
      </button>
    );
    const listRow = (key: ListKey, icon: React.ReactNode, sub: string) => (
      <button type="button" className="rm-lrow" onClick={() => setPage({ p: "list", key })}>
        <span className="rm-dot" style={{ background: LIST_COLOR[key] }}>{icon}</span>
        <span className="rm-lt">{LIST_TITLE[key]}<small>{sub}</small></span>
        <span className="rm-lc">{pick(items, key).filter(isOpen).length}<ChevronRight size={18} /></span>
      </button>
    );
    body = (
      <div className="rm-page">
        <div className="rm-top"><button type="button" className="rm-circle" onClick={onClose} aria-label="返回"><ChevronLeft size={22} /></button><span /></div>
        <div className="rm-grid">
          {card("today", <CalendarDays size={18} />, "c-blue")}
          {card("plan", <Clock3 size={18} />, "c-red")}
          {card("invite", <Mail size={18} />, "c-orange")}
          {card("all", <Inbox size={18} />, "c-gray")}
          {card("off", <FileText size={18} />, "c-pink")}
          {card("done", <Check size={18} />, "c-slate")}
        </div>
        <h2 className="rm-h2">我的列表</h2>
        <div className="rm-group">
          {listRow("company", <List size={19} />, company ? `${company.name} · 周评、月考、约谈、补考` : "进了公司以后的日程")}
          {listRow("chance", <Star size={19} />, "公开视频、伴舞、试镜")}
          {listRow("date", <Users size={19} />, "别人约你、你答应了的")}
          {listRow("mine", <Pencil size={18} />, "想到什么就记一笔")}
        </div>
        <h2 className="rm-h2">公司</h2>
        <div className="rm-group">
          <button type="button" className="rm-lrow" onClick={() => setPage({ p: "company" })}>
            <span className="rm-dot" style={{ background: "#636366" }}><Building2 size={19} /></span>
            <span className="rm-lt">{company ? `${company.name} 内部档案` : "这个世界里的公司"}<small>{company ? "楼里、宿舍、一周、规矩" : "还没进公司"}</small></span>
            <span className="rm-lc"><ChevronRight size={18} /></span>
          </button>
          <button type="button" className="rm-lrow" onClick={() => setPage({ p: "rank" })}>
            <span className="rm-dot" style={{ background: "#ff375f" }}><BarChart3 size={19} /></span>
            <span className="rm-lt">月末排名<small>{rankSummary()}</small></span>
            <span className="rm-lc"><ChevronRight size={18} /></span>
          </button>
        </div>
        <div style={{ height: 110 }} />
      </div>
    );
  }

  return (
    <div className={`rm-app ${dark ? "rm-dark" : ""}`}>
      {body}
      {!detail && (page.p === "home" || page.p === "list") ? <button type="button" className="rm-fab" onClick={() => setAdding(true)} aria-label="新提醒"><Plus size={26} strokeWidth={2.6} /></button> : null}
      {checking ? <CheckSheet item={checking} onClose={() => setCheckId(null)} onDone={async text => { setCheckId(null); await checkNode(checking.id, text); onNotice?.(`${checking.title}：完成`); }} /> : null}
      {leaving ? <LeaveSheet item={leaving} onClose={() => setLeaveId(null)} onDone={reason => { setLeaveId(null); leaveNode(leaving.id, reason); onNotice?.(`${leaving.title}：请好假了`); }} /> : null}
      {adding ? <AddSheet onClose={() => setAdding(false)} onDone={(t, at, note) => { setAdding(false); addMine(t, at, note); onNotice?.("记好了"); }} /> : null}
    </div>
  );
}

function rankSummary(): string {
  const months = loadMonths();
  if (!months.length) return "还没有";
  return months.slice(-2).map(m => `${+m.month.split("-")[1]}月 第 ${m.rank} 名`).join(" · ");
}

function RankPage({ onBack, onNotice }: { onBack: () => void; onNotice?: (m: string) => void }) {
  const [, setTick] = useState(0);
  const [view, setView] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [want, setWant] = useState("");
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener(RANK_EVENT, bump);
    return () => window.removeEventListener(RANK_EVENT, bump);
  }, []);
  const months = [...loadMonths()].reverse();
  return (
    <div className="rm-page">
      <div className="rm-top"><button type="button" className="rm-circle" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button><span /></div>
      <h1 style={{ color: "#ff375f" }}>月末排名</h1>
      {months.length ? months.map(m => {
        const diff = m.prevRank ? m.prevRank - m.rank : 0;
        return (
          <div key={m.month} className="rm-group rm-pad rm-rank">
            <div className="rm-rank-h">
              <span>{+m.month.split("-")[1]}月</span>
              <b>第 {m.rank} 名</b>
              <small>共 {m.total} 人{m.prevRank ? (diff > 0 ? ` · ↑${diff}` : diff < 0 ? ` · ↓${-diff}` : " · 没变") : " · 第一次"}</small>
            </div>
            {m.comment ? <div className="rm-txt">老师：{m.comment}</div> : null}
            <button type="button" className="rm-rank-img" onClick={() => setView(m.image)}><img src={m.image} alt="月末评价结果" /></button>
            {editing === m.month ? (
              <div className="rm-rank-edit">
                <input className="rm-in" inputMode="numeric" autoFocus value={want} onChange={e => setWant(e.target.value.replace(/\D/g, ""))} placeholder={`1～${m.total}`} />
                <button type="button" onClick={() => setEditing(null)}>取消</button>
                <button type="button" className="p" disabled={!want} onClick={() => { overrideMyRank(m.month, Number(want)); setEditing(null); onNotice?.(`改成第 ${want} 名了`); }}>改</button>
              </div>
            ) : <button type="button" className="rm-link" onClick={() => { setEditing(m.month); setWant(String(m.rank)); }}>改我的名次</button>}
          </div>
        );
      }) : <p className="rm-empty">第一次月末评价之后，每个月的名次、老师的评语和那张表会记在这里。</p>}
      <div style={{ height: 40 }} />
      {view ? <div className="rm-viewer" onClick={() => setView(null)}><img src={view} alt="月末评价结果" /></div> : null}
    </div>
  );
}

function CheckSheet({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="rm-mask" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rm-sheet">
        <div className="rm-sh-h">{item.title} · {new Date(item.dueAt).getMonth() + 1}月{new Date(item.dueAt).getDate()}日</div>
        <div className="rm-sh-s">写一句结果（可以不写）</div>
        <textarea className="rm-in" rows={2} autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="比如：顺利通过" />
        <div className="rm-sh-btns"><button type="button" onClick={() => onDone("")}>不写了</button><button type="button" className="p" onClick={() => onDone(text)}>完成</button></div>
      </div>
    </div>
  );
}

function LeaveSheet({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: (reason: string) => void }) {
  const [text, setText] = useState("");
  const teacher = teacherOf();
  const official = item.kind !== "date" && item.kind !== "custom";
  return (
    <div className="rm-mask" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rm-sheet">
        <div className="rm-sh-h">{item.kind === "date" ? "去不了了" : "请假"} · {item.title}</div>
        <div className="rm-sh-s">{official && teacher ? `也可以去 KakaoTalk 找${teacher.name}请，批了会自动变成已请假` : "写个理由（可以不写）"}</div>
        <textarea className="rm-in" rows={2} autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="比如：发烧了" />
        <div className="rm-sh-btns"><button type="button" onClick={onClose}>取消</button><button type="button" className="p o" onClick={() => onDone(text)}>{item.kind === "date" ? "跟他说去不了" : "请假"}</button></div>
      </div>
    </div>
  );
}

function AddSheet({ onClose, onDone }: { onClose: () => void; onDone: (title: string, at: number, note: string) => void }) {
  const d = new Date(Date.now() + 3600e3);
  d.setMinutes(0, 0, 0);
  const [title, setTitle] = useState("");
  const [at, setAt] = useState(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`);
  const [note, setNoteText] = useState("");
  return (
    <div className="rm-mask" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rm-sheet">
        <div className="rm-sh-h">新提醒</div>
        <input className="rm-in one" autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="标题" />
        <input className="rm-in one" type="datetime-local" value={at} onChange={e => setAt(e.target.value)} />
        <textarea className="rm-in" rows={2} value={note} onChange={e => setNoteText(e.target.value)} placeholder="备注" />
        <div className="rm-sh-btns"><button type="button" onClick={onClose}>取消</button><button type="button" className="p" disabled={!title.trim()} onClick={() => onDone(title, new Date(at).getTime() || Date.now(), note)}>添加</button></div>
      </div>
    </div>
  );
}

function Detail({ item, onBack, onGo, onCheck, onLeave, onDelete, onAccept, onDecline }: { onAccept: () => void; onDecline: () => void; item: Item; onBack: () => void; onGo: () => void; onCheck: () => void; onLeave: () => void; onDelete: () => void }) {
  const [wish, setWishText] = useState(item.wish ?? "");
  const [note, setNoteText] = useState(item.note ?? "");
  const open = item.status === "pending";
  const playable = open && item.kind !== "custom";
  const st = statusText(item);
  return (
    <div className="rm-page">
      <div className="rm-top"><button type="button" className="rm-circle" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button><span /></div>
      <h1 className="rm-dt">{item.title}</h1>
      <div className="rm-group">
        <div className="rm-kv"><span>时间</span><b>{whenText(item.dueAt)}</b></div>
        {item.place ? <div className="rm-kv"><span>地点</span><b>{item.place}</b></div> : null}
        {item.from ? <div className="rm-kv"><span>{item.kind === "date" ? "谁约的" : "谁通知的"}</span><b>{item.from}</b></div> : null}
        {st ? <div className="rm-kv"><span>结果</span><b>{st}</b></div> : null}
      </div>
      {playable && item.kind !== "date" ? (
        <>
          <div className="rm-sec-s">这次想要的结果</div>
          <div className="rm-group"><input className="rm-in flat" value={wish} onChange={e => setWishText(e.target.value)} onBlur={() => setWish(item.id, wish)} placeholder="比如：前五（不写就看你演得怎么样）" /></div>
        </>
      ) : null}
      {item.status === "invite" ? <>
        <div className="rm-sec-s">通知全文</div>
        <div className="rm-group rm-pad"><div className="rm-invitation-text">{item.note || item.premise || "暂无补充说明"}</div>{item.note && item.premise && item.note !== item.premise ? <div className="rm-invitation-text">{item.premise}</div> : null}</div>
      </> : <>
        <div className="rm-sec-s">备注</div>
        <div className="rm-group"><textarea className="rm-in flat" rows={3} value={note} onChange={e => setNoteText(e.target.value)} onBlur={() => setNote(item.id, note)} placeholder="只有你看得到" /></div>
      </>}
      <div className="rm-dbtns">
        {item.status === "invite" ? <><button type="button" className="p" onClick={onAccept}>{item.offerId ? "去试镜" : "报名"}</button><button type="button" onClick={onDecline}>{item.offerId ? "婉拒" : "不了"}</button></> : null}
        {playable ? <button type="button" className="p" onClick={() => { setWish(item.id, wish); onGo(); }}>去演</button> : null}
        {open ? <button type="button" onClick={onCheck}>打勾</button> : null}
        {playable ? <button type="button" onClick={onLeave}>{item.kind === "date" ? "去不了" : "请假"}</button> : null}
        {item.kind === "custom" ? <button type="button" className="del" onClick={onDelete}>删除</button> : null}
      </div>
    </div>
  );
}

function CompanyPage({ onBack, onNotice }: { onBack: () => void; onNotice?: (m: string) => void }) {
  const career = useCareer();
  const company = companyOf(career.companyId);
  const [regen, setRegen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <div className="rm-page">
      <div className="rm-top"><button type="button" className="rm-circle" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button><span /></div>
      <h1 className="rm-dt">{company ? `${company.name} 内部档案` : "这个世界里的公司"}</h1>
      {company ? (
        <>
          <div className="rm-group rm-pad">
            <div className="rm-txt">{company.scale}。{company.style}</div>
            <div className="rm-txt dim">练习生：{company.trainee}</div>
            <div className="rm-txt dim">名声：{company.fame}</div>
          </div>
          <div className="rm-sec-s rm-sec-act">
            <span>内部档案</span>
            <span>
              {edit == null ? <button type="button" onClick={() => setEdit(career.insider || "")}>改</button> : null}
              <button type="button" disabled={regen} onClick={async () => {
                setRegen(true);
                try { const insider = await expandInsider(company); saveCareer({ ...loadCareer(), insider }); onNotice?.("重新写好了"); }
                catch (e) { onNotice?.(e instanceof Error ? e.message : "没写成"); }
                finally { setRegen(false); }
              }}><RefreshCw size={13} /> {regen ? "在写…" : career.insider ? "重新生成" : "生成"}</button>
            </span>
          </div>
          <div className="rm-group rm-pad">
            {edit != null ? (
              <>
                <textarea className="rm-in flat" rows={14} value={edit} onChange={e => setEdit(e.target.value)} />
                <div className="rm-sh-btns"><button type="button" onClick={() => setEdit(null)}>取消</button><button type="button" className="p" onClick={() => { saveCareer({ ...loadCareer(), insider: edit }); setEdit(null); onNotice?.("存好了"); }}>存</button></div>
              </>
            ) : <div className="rm-txt pre">{career.insider || "签约时 AI 会照这家公司的风格写一份：楼里、宿舍、一周作息、规矩。"}</div>}
          </div>
          <div className="rm-sec-s">戏里定下来的细节</div>
          <div className="rm-group">
            {career.facts.length ? career.facts.map(f => (
              <div key={f} className="rm-fact"><span>{f}</span><button type="button" aria-label="删除" onClick={() => saveCareer({ ...loadCareer(), facts: loadCareer().facts.filter(x => x !== f) })}><Trash2 size={15} /></button></div>
            )) : <div className="rm-txt dim rm-pad">还没有。演戏时冒出来的公司细节会记在这里。</div>}
          </div>
        </>
      ) : COMPANIES.map(c => (
        <div key={c.id} className="rm-group rm-pad" style={{ marginBottom: 12 }}>
          <div className="rm-txt"><b>{c.name}</b> · {c.scale}</div>
          <div className="rm-txt">{c.style}</div>
          <div className="rm-txt dim">练习生：{c.trainee}</div>
          <div className="rm-txt dim">招人：{c.recruit}</div>
          <div className="rm-txt dim">名声：{c.fame}</div>
        </div>
      ))}
      <div style={{ height: 40 }} />
    </div>
  );
}
