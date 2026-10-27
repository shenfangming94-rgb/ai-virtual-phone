"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Trash2, X } from "lucide-react";
import {
  ALMANAC_EVENT, addMine, aiWriteMine, almanacBetween, clearMyPlan, deleteItem, generateWorldMonth, planMyWeek, updateItem,
  type AlmanacItem,
} from "@/lib/idol-calendar";
import { getWeekDates } from "@/lib/calendar-utils";

const KIND_LABEL: Record<AlmanacItem["kind"], string> = { fixed: "节日", career: "我的大事", world: "圈内", mine: "我记的", birthday: "生日" };
const md = (iso: string) => `${+iso.slice(5, 7)}月${+iso.slice(8, 10)}日`;

export function useAlmanacVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV(x => x + 1);
    window.addEventListener(ALMANAC_EVENT, on);
    window.addEventListener("idol-career-changed", on);
    return () => { window.removeEventListener(ALMANAC_EVENT, on); window.removeEventListener("idol-career-changed", on); };
  }, []);
  return v;
}

/** 月历顶上：大事记 / 帮我排这周 */
export function AlmanacBar({ onAlmanac, onPlan }: { onAlmanac: () => void; onPlan: () => void }) {
  return (
    <section className="idol-cal-bar">
      <button type="button" className="calendar-pill-btn" onClick={onAlmanac}>大事记</button>
      <button type="button" className="calendar-pill-btn" onClick={onPlan}><Sparkles size={14} />帮我排这周</button>
    </section>
  );
}

/** 详情页某一天：这天的大事记 + 记一笔 */
export function AlmanacDayPanel({ date, onOpen }: { date: string; onOpen: (item: AlmanacItem | null, date: string) => void }) {
  useAlmanacVersion();
  const items = almanacBetween(date, date);
  return (
    <div className="idol-cal-day">
      {items.map(i => (
        <button key={i.id} type="button" className="idol-cal-day-item" data-kind={i.kind} onClick={() => onOpen(i, date)}>
          <i />
          <span>{i.title}</span>
          <small>{i.company ?? KIND_LABEL[i.kind]}</small>
        </button>
      ))}
      <button type="button" className="idol-cal-day-add" onClick={() => onOpen(null, date)}>＋ 记一笔大事</button>
    </div>
  );
}

/** 大事记列表（按月），能让 AI 写这个月的圈内大事 */
export function AlmanacSheet({ ym, onClose, onNotice, onOpen }: { ym: string; onClose: () => void; onNotice?: (t: string) => void; onOpen: (item: AlmanacItem | null, date: string) => void }) {
  useAlmanacVersion();
  const [month, setMonth] = useState(ym);
  const [busy, setBusy] = useState(false);
  const [y, m] = month.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
  const items = almanacBetween(from, to);
  const shift = (d: number) => { const t = new Date(y, m - 1 + d, 1); setMonth(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`); };
  const regen = async () => {
    setBusy(true);
    try { const n = await generateWorldMonth(month, true); onNotice?.(`写好了 ${n} 件圈内大事`); }
    catch (e) { onNotice?.(e instanceof Error ? e.message : "没写出来"); }
    setBusy(false);
  };
  return (
    <div className="modal-overlay calendar-edit-modal-overlay" onClick={onClose}>
      <div className="calendar-edit-modal idol-cal-sheet" onClick={e => e.stopPropagation()}>
        <div className="calendar-theme-modal-head">
          <button type="button" className="calendar-icon-btn" onClick={() => shift(-1)} aria-label="上个月">‹</button>
          <strong>{y}年{m}月 · 大事记</strong>
          <button type="button" className="calendar-icon-btn" onClick={() => shift(1)} aria-label="下个月">›</button>
        </div>
        <div className="idol-cal-list hide-scrollbar">
          {items.length ? items.map(i => (
            <button key={i.id} type="button" className="idol-cal-row" data-kind={i.kind} onClick={() => onOpen(i, i.date)}>
              <span className="idol-cal-row-d">{md(i.date)}</span>
              <span className="idol-cal-row-t"><b>{i.title}</b>{i.note ? <small>{i.note}</small> : null}</span>
              <span className="idol-cal-row-k">{i.company ?? KIND_LABEL[i.kind]}</span>
            </button>
          )) : <div className="idol-cal-empty">这个月还没有大事</div>}
        </div>
        <div className="idol-cal-actions">
          <button type="button" className="calendar-block-btn" data-variant="ghost" disabled={busy} onClick={regen}>{busy ? "写着呢…" : "让 AI 写圈内大事"}</button>
          <button type="button" className="calendar-block-btn" data-variant="primary" onClick={() => onOpen(null, from)}>记一笔</button>
        </div>
        <button type="button" className="idol-cal-close" onClick={onClose} aria-label="关闭"><X size={16} /></button>
      </div>
    </div>
  );
}

/** 记一笔 / 看一条 / 改一条 */
export function AlmanacEdit({ item, date, onClose, onNotice }: { item: AlmanacItem | null; date: string; onClose: () => void; onNotice?: (t: string) => void }) {
  const editable = !item || item.kind === "mine" || item.kind === "world";
  const [d, setD] = useState(item?.date ?? date);
  const [title, setTitle] = useState(item?.title ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [busy, setBusy] = useState(false);
  const ai = async () => {
    setBusy(true);
    try { const r = await aiWriteMine(d, [title, note].filter(Boolean).join("；")); setTitle(r.title); setNote(r.note); }
    catch (e) { onNotice?.(e instanceof Error ? e.message : "AI 没回"); }
    setBusy(false);
  };
  const saveIt = () => {
    if (!title.trim()) { onNotice?.("写个标题"); return; }
    if (item) updateItem(item.id, { date: d, title, note }); else addMine(d, title, note);
    onNotice?.(item ? "改好了" : "记下了");
    onClose();
  };
  return (
    <div className="modal-overlay calendar-edit-modal-overlay" onClick={onClose}>
      <div className="calendar-edit-modal idol-cal-sheet idol-cal-edit" onClick={e => e.stopPropagation()}>
        <div className="calendar-theme-modal-head">
          <strong>{item ? (editable ? "改大事记" : item.title) : "记一笔大事"}</strong>
          <button type="button" className="calendar-icon-btn" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </div>
        {editable ? (
          <>
            {item?.company ? <div className="idol-cal-hint">{item.company}</div> : null}
            <label className="idol-cal-field"><span>日期</span><input type="date" value={d} onChange={e => setD(e.target.value)} /></label>
            <label className="idol-cal-field"><span>标题</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="比如：第一次进练习室通宵" /></label>
            <label className="idol-cal-field"><span>备注</span><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="可以不写" /></label>
            <div className="idol-cal-actions">
              {item ? <button type="button" className="calendar-block-btn" data-variant="ghost" onClick={() => { deleteItem(item.id); onNotice?.("删掉了"); onClose(); }}><Trash2 size={14} />删除</button> : null}
              <button type="button" className="calendar-block-btn" data-variant="ghost" disabled={busy} onClick={ai}>{busy ? "写着呢…" : "让 AI 帮我写"}</button>
              <button type="button" className="calendar-block-btn" data-variant="primary" onClick={saveIt}>保存</button>
            </div>
          </>
        ) : (
          <div className="idol-cal-view">
            <div>{md(item!.date)} · {item!.company ?? KIND_LABEL[item!.kind]}</div>
            {item!.note ? <p>{item!.note}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** 帮我排这周 */
export function PlanSheet({ weekStart, onClose, onNotice, onDone }: { weekStart: string; onClose: () => void; onNotice?: (t: string) => void; onDone: () => void }) {
  const [wish, setWish] = useState("");
  const [busy, setBusy] = useState(false);
  const dates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const go = async () => {
    setBusy(true);
    try { const n = await planMyWeek(weekStart, wish.trim()); onNotice?.(`排好了 ${n} 件，点开能改能删`); onDone(); onClose(); }
    catch (e) { onNotice?.(e instanceof Error ? e.message : "没排出来"); }
    setBusy(false);
  };
  return (
    <div className="modal-overlay calendar-edit-modal-overlay" onClick={onClose}>
      <div className="calendar-edit-modal idol-cal-sheet idol-cal-edit" onClick={e => e.stopPropagation()}>
        <div className="calendar-theme-modal-head">
          <strong>帮我排这周</strong>
          <button type="button" className="calendar-icon-btn" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </div>
        <p className="idol-cal-hint">{md(dates[0])} ～ {md(dates[6])}。只往空着的时间里填，绕开提醒事项里的事；排好的跟你自己写的一样，点开能改能删。再排一次会换掉上次排的。</p>
        <label className="idol-cal-field"><span>这周想</span><textarea value={wish} onChange={e => setWish(e.target.value)} rows={3} placeholder="可以不写。比如：多练高音、周六想出去逛逛" /></label>
        <div className="idol-cal-actions">
          <button type="button" className="calendar-block-btn" data-variant="ghost" onClick={() => { const n = clearMyPlan(weekStart); onNotice?.(n ? `清掉了 ${n} 件` : "这周没有 AI 排的"); onDone(); }}>清掉 AI 排的</button>
          <button type="button" className="calendar-block-btn" data-variant="primary" disabled={busy} onClick={go}>{busy ? "排着呢…" : "排"}</button>
        </div>
      </div>
    </div>
  );
}
