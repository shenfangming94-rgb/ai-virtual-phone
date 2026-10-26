"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock, ChevronLeft, Globe, Plus, Timer, Watch } from "lucide-react";

import { loadWorldClock, realNow, setWorldClockReal, setWorldTime, shiftWorldTime, subscribeWorldClock } from "@/lib/world-clock";
import { loadWorldAlarms, saveWorldAlarms, type WorldAlarm } from "@/lib/world-alarms";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const HOUR = 3600e3;
const DAY = 24 * HOUR;

type Tab = "world" | "alarm" | "stopwatch" | "timer";
type Notice = ((message: string) => void) | undefined;

/** 时钟：iOS 时钟的样子。世界时钟页就是这个小手机的「现在」，在这里改世界时间 */
export function ClockApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>("world");
  const [adjust, setAdjust] = useState(false);
  const [addAlarm, setAddAlarm] = useState(false);

  const title = { world: "世界时钟", alarm: "闹钟", stopwatch: "秒表", timer: "计时器" }[tab];
  const plus = tab === "world" ? () => setAdjust(true) : tab === "alarm" ? () => setAddAlarm(true) : null;

  return (
    <div className="clock-app">
      <div className="clock-top">
        <button type="button" className="clock-glass-btn" onClick={onClose} aria-label="返回"><ChevronLeft size={24} /></button>
        {plus ? <button type="button" className="clock-glass-btn" onClick={plus} aria-label="添加"><Plus size={24} /></button> : null}
      </div>
      <div className="clock-page">
        {tab === "stopwatch" || tab === "timer" ? null : <h1 className="clock-title">{title}</h1>}
        {tab === "world" ? <WorldTab onAdjust={() => setAdjust(true)} /> : null}
        {tab === "alarm" ? <AlarmTab adding={addAlarm} onAdded={() => setAddAlarm(false)} /> : null}
        {/* 秒表计时器一直挂着，切标签不停 */}
        <div hidden={tab !== "stopwatch"}><StopwatchTab /></div>
        <div hidden={tab !== "timer"}><TimerTab onNotice={onNotice} /></div>
      </div>
      <nav className="clock-tabs">
        {([
          ["world", Globe, "世界时钟"],
          ["alarm", AlarmClock, "闹钟"],
          ["stopwatch", Watch, "秒表"],
          ["timer", Timer, "计时器"],
        ] as const).map(([id, Icon, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
            <Icon size={24} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {adjust ? <AdjustSheet onClose={() => setAdjust(false)} onNotice={onNotice} /> : null}
    </div>
  );
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), ms);
    const off = subscribeWorldClock(() => setNow(new Date()));
    return () => { window.clearInterval(tick); off(); };
  }, [ms]);
  return now;
}

function dayDiff(a: Date, b: Date) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((da - db) / DAY);
}

function WorldTab({ onAdjust }: { onAdjust: () => void }) {
  const now = useNow();
  const clock = loadWorldClock();
  const real = new Date(realNow());
  const realLabel = dayDiff(now, real) === 0 ? "同一天" : `${real.getFullYear()} 年 ${real.getMonth() + 1} 月 ${real.getDate()} 日`;
  return (
    <div className="clock-list">
      <button type="button" className="clock-row" onClick={onAdjust}>
        <div>
          <div className="clock-row-sub">{now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日 星期{WEEK[now.getDay()]}</div>
          <div className="clock-row-name">{clock.real ? "现实时间" : "这个世界"}</div>
        </div>
        <div className="clock-row-time">{pad(now.getHours())}:{pad(now.getMinutes())}</div>
      </button>
      {clock.real ? null : (
        <div className="clock-row is-dim">
          <div>
            <div className="clock-row-sub">{realLabel} · 不玩的时候世界停着</div>
            <div className="clock-row-name">现实</div>
          </div>
          <div className="clock-row-time">{pad(real.getHours())}:{pad(real.getMinutes())}</div>
        </div>
      )}
      <p className="clock-hint">点「这个世界」或者右上角 + 改时间。之前的聊天停在当时的时间；开着的自定义 app 要关掉重开才跟上。</p>
    </div>
  );
}

function AdjustSheet({ onClose, onNotice }: { onClose: () => void; onNotice: Notice }) {
  const [clock, setClock] = useState(loadWorldClock);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  useEffect(() => {
    const d = new Date();
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }, [clock]);

  const done = (message: string) => { onNotice?.(message); onClose(); };
  const apply = () => {
    const target = new Date(`${date}T${time || "00:00"}:00`);
    if (!date || Number.isNaN(target.getTime())) { onNotice?.("日期没填对"); return; }
    setWorldTime(target.getTime());
    done(`现在是 ${target.getFullYear()} 年 ${target.getMonth() + 1} 月 ${target.getDate()} 日 ${pad(target.getHours())}:${pad(target.getMinutes())}`);
  };
  const shift = (ms: number, label: string) => { shiftWorldTime(ms); done(label); };
  const nextMorning = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    setWorldTime(d.getTime());
    done("到第二天早上 8 点了");
  };

  return (
    <div className="clock-sheet-backdrop" onClick={onClose}>
      <section className="clock-sheet" onClick={e => e.stopPropagation()}>
        <div className="clock-sheet-head">
          <button type="button" className="clock-glass-btn" onClick={onClose} aria-label="关闭">✕</button>
          <b>改时间</b>
          <span style={{ width: 44 }} />
        </div>
        <div className="clock-group">
          <label className="clock-cell">
            <span>跟现实时间一致</span>
            <input
              type="checkbox"
              className="clock-switch"
              checked={clock.real}
              onChange={e => { setWorldClockReal(e.target.checked); setClock(loadWorldClock()); onNotice?.(e.target.checked ? "已经跟现实时间一致" : "回到世界时间"); }}
            />
          </label>
        </div>
        {clock.real ? <p className="clock-hint">关掉会回到原来的世界时间。</p> : (
          <>
            <div className="clock-group-title">现在是</div>
            <div className="clock-group">
              <div className="clock-cell"><span>日期</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="clock-cell"><span>时间</span><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
            </div>
            <button type="button" className="clock-wide-btn" onClick={apply}>就是这个时间</button>
            <div className="clock-group-title">往后拨</div>
            <div className="clock-chips">
              <button type="button" onClick={() => shift(HOUR, "过了 1 小时")}>1 小时</button>
              <button type="button" onClick={() => shift(6 * HOUR, "过了 6 小时")}>6 小时</button>
              <button type="button" onClick={() => shift(DAY, "过了 1 天")}>1 天</button>
              <button type="button" onClick={() => shift(7 * DAY, "过了 1 周")}>1 周</button>
              <button type="button" onClick={nextMorning}>第二天早上</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function AlarmTab({ adding, onAdded }: { adding: boolean; onAdded: () => void }) {
  const [alarms, setAlarms] = useState<WorldAlarm[]>(loadWorldAlarms);
  const [time, setTime] = useState("08:00");
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState(false);

  const save = (next: WorldAlarm[]) => { setAlarms(next); saveWorldAlarms(next); };
  const add = () => {
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    save([...alarms, { id: `al_${Date.now()}`, h, m, label: label.trim() || "闹钟", on: true }].sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m)));
    setLabel("");
    onAdded();
  };

  return (
    <div className="clock-list">
      {adding ? (
        <div className="clock-group" style={{ marginBottom: 14 }}>
          <div className="clock-cell"><span>时间</span><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
          <div className="clock-cell"><span>标签</span><input value={label} placeholder="闹钟" onChange={e => setLabel(e.target.value)} /></div>
          <div className="clock-cell" style={{ justifyContent: "flex-end", gap: 18 }}>
            <button type="button" className="clock-link" onClick={onAdded}>取消</button>
            <button type="button" className="clock-link is-strong" onClick={add}>存储</button>
          </div>
        </div>
      ) : null}
      {alarms.length ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="clock-link" onClick={() => setEditing(v => !v)}>{editing ? "完成" : "编辑"}</button>
          </div>
          {alarms.map(a => (
            <div key={a.id} className={`clock-row ${a.on ? "" : "is-dim"}`}>
              <div>
                <div className="clock-alarm-time">{pad(a.h)}:{pad(a.m)}</div>
                <div className="clock-row-sub">{a.label}</div>
              </div>
              {editing ? (
                <button type="button" className="clock-del" onClick={() => save(alarms.filter(x => x.id !== a.id))}>删除</button>
              ) : (
                <input type="checkbox" className="clock-switch" checked={a.on} onChange={e => save(alarms.map(x => x.id === a.id ? { ...x, on: e.target.checked } : x))} />
              )}
            </div>
          ))}
        </>
      ) : adding ? null : <p className="clock-empty">没有闹钟</p>}
      <p className="clock-hint">闹钟按世界时间响，小手机开着就会提醒你。</p>
    </div>
  );
}

function fmtWatch(ms: number) {
  const cs = Math.floor(ms / 10);
  return `${pad(Math.floor(cs / 6000))}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

/** 秒表和计时器量的是真实流逝，用 performance.now，不受世界时钟影响 */
function StopwatchTab() {
  const [base, setBase] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [laps, setLaps] = useState<number[]>([]);
  const [, force] = useState(0);
  useEffect(() => {
    if (start == null) return;
    let raf = 0;
    const loop = () => { force(v => v + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [start]);
  const elapsed = base + (start != null ? performance.now() - start : 0);
  const running = start != null;
  const lapTotal = laps.reduce((s, x) => s + x, 0);

  return (
    <div className="clock-watch">
      <div className="clock-watch-digits">{fmtWatch(elapsed)}</div>
      <div className="clock-round-row">
        <button
          type="button"
          className="clock-round"
          disabled={!running && elapsed === 0}
          onClick={() => { if (running) setLaps([elapsed - lapTotal, ...laps]); else { setBase(0); setLaps([]); } }}
        >{running || elapsed === 0 ? "计次" : "复位"}</button>
        <button
          type="button"
          className={`clock-round ${running ? "is-red" : "is-green"}`}
          onClick={() => { if (running) { setBase(elapsed); setStart(null); } else setStart(performance.now()); }}
        >{running ? "停止" : "启动"}</button>
      </div>
      <div className="clock-laps">
        {running || elapsed > 0 ? (
          <div className="clock-lap"><span>计次 {laps.length + 1}</span><span>{fmtWatch(elapsed - lapTotal)}</span></div>
        ) : null}
        {laps.map((l, i) => (
          <div key={i} className="clock-lap"><span>计次 {laps.length - i}</span><span>{fmtWatch(l)}</span></div>
        ))}
      </div>
    </div>
  );
}

function TimerTab({ onNotice }: { onNotice: Notice }) {
  const [h, setH] = useState(0);
  const [m, setM] = useState(5);
  const [s, setS] = useState(0);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState<number | null>(null);
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  useEffect(() => {
    if (endAt == null) return;
    const tick = window.setInterval(() => {
      const rest = endAt - performance.now();
      if (rest <= 0) { setEndAt(null); setLeft(0); noticeRef.current?.("⏲ 计时结束"); return; }
      setLeft(rest);
    }, 200);
    return () => window.clearInterval(tick);
  }, [endAt]);

  const active = endAt != null || paused != null;
  const shown = paused ?? left;
  const total = Math.ceil(shown / 1000);
  const wheel = (value: number, set: (n: number) => void, max: number, unit: string) => (
    <label className="clock-wheel">
      <select value={value} onChange={e => set(Number(e.target.value))}>
        {Array.from({ length: max }, (_, i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <span>{unit}</span>
    </label>
  );

  return (
    <div className="clock-watch">
      {active ? (
        <div className="clock-watch-digits">{h || total >= 3600 ? `${Math.floor(total / 3600)}:` : ""}{pad(Math.floor(total / 60) % 60)}:{pad(total % 60)}</div>
      ) : (
        <div className="clock-wheels">
          {wheel(h, setH, 24, "小时")}
          {wheel(m, setM, 60, "分钟")}
          {wheel(s, setS, 60, "秒")}
        </div>
      )}
      <div className="clock-round-row">
        <button type="button" className="clock-round" disabled={!active} onClick={() => { setEndAt(null); setPaused(null); setLeft(0); }}>取消</button>
        {active && paused == null ? (
          <button type="button" className="clock-round is-orange" onClick={() => { setPaused(left); setEndAt(null); }}>暂停</button>
        ) : (
          <button
            type="button"
            className="clock-round is-green"
            disabled={!active && h + m + s === 0}
            onClick={() => {
              const ms = paused ?? (h * 3600 + m * 60 + s) * 1000;
              setLeft(ms);
              setPaused(null);
              setEndAt(performance.now() + ms);
            }}
          >{paused != null ? "继续" : "启动"}</button>
        )}
      </div>
    </div>
  );
}
