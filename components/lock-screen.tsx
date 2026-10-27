"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { LOCK_CHANGED_EVENT, LOCK_NOW_EVENT, loadLock, loadLockWallpaper, lunarLabel, saveLock } from "@/lib/lock-screen";
import { subscribeWorldClock } from "@/lib/world-clock";
import { loadTraineeCard } from "@/lib/trainee-card";
import { DEBUT_EVENT, debutCountdown, loadDebut } from "@/lib/idol-debut";
import { CAREER_EVENT, loadCareer } from "@/lib/idol-career";
import { APP_LOOK, LOCK_NOTES_EVENT, agoLabel, markNotesSeen, unseenNotes, type LockNote } from "@/lib/idol-notes";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const RELOCK_AFTER_MS = 60_000;
const KEYS: [string, string][] = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"],
  ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
];

/** iOS 锁屏：时间是世界时间；上滑开锁，有密码就弹数字键盘 */
export function LockScreen({ wallpaperStyle }: { wallpaperStyle?: CSSProperties }) {
  // 第一次打开、还没开局时不锁（开局页盖在最上面），盖完章直接进桌面
  const [locked, setLocked] = useState(() => Boolean(loadTraineeCard()));
  const [leaving, setLeaving] = useState(false);
  const [pad6, setPad6] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [entry, setEntry] = useState("");
  const [shake, setShake] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const [, bump] = useState(0);

  // 设置里改了锁屏要马上跟上；设置里点「锁屏看看」就锁上
  useEffect(() => {
    const onChange = () => bump(v => v + 1);
    const onLockNow = () => { setLocked(true); setLeaving(false); setPad6(false); setEntry(""); setDrag(0); };
    window.addEventListener(LOCK_CHANGED_EVENT, onChange);
    window.addEventListener(LOCK_NOW_EVENT, onLockNow);
    window.addEventListener(LOCK_NOTES_EVENT, onChange);
    window.addEventListener(DEBUT_EVENT, onChange);
    window.addEventListener(CAREER_EVENT, onChange);
    return () => {
      window.removeEventListener(LOCK_CHANGED_EVENT, onChange); window.removeEventListener(LOCK_NOW_EVENT, onLockNow);
      window.removeEventListener(LOCK_NOTES_EVENT, onChange); window.removeEventListener(DEBUT_EVENT, onChange); window.removeEventListener(CAREER_EVENT, onChange);
    };
  }, []);

  // 离开超过一分钟回来就重新锁上（按现实时间算）
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = performance.now(); return; }
      if (hiddenAt.current != null && performance.now() - hiddenAt.current > RELOCK_AFTER_MS) {
        setLocked(true); setLeaving(false); setPad6(false); setEntry(""); setDrag(0);
      }
      hiddenAt.current = null;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!locked) return;
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    const off = subscribeWorldClock(() => setNow(new Date()));
    return () => { window.clearInterval(tick); off(); };
  }, [locked]);

  if (!locked) return null;

  const lock = loadLock();
  const code = lock.code;
  const ownWallpaper = loadLockWallpaper();
  // 桌面没有图片壁纸时用锁屏自己的渐变，免得白底白字
  const bgStyle: CSSProperties | undefined = ownWallpaper ? { backgroundImage: `url("${ownWallpaper}")` } : wallpaperStyle?.backgroundImage ? wallpaperStyle : undefined;
  const unlock = () => {
    setLeaving(true);
    markNotesSeen();
    window.setTimeout(() => { setLocked(false); setLeaving(false); setPad6(false); setEntry(""); setDrag(0); }, 380);
  };
  const askOpen = () => { if (code) setPad6(true); else unlock(); };

  const press = (d: string) => {
    setEntry(prev => {
      if (prev.length >= code.length) return prev;
      const next = prev + d;
      if (next.length === code.length) {
        if (next === code) window.setTimeout(unlock, 120);
        else window.setTimeout(() => { setShake(true); window.setTimeout(() => { setShake(false); setEntry(""); }, 420); }, 120);
      }
      return next;
    });
  };

  const onDown = (e: ReactPointerEvent) => { startY.current = e.clientY; };
  const onMove = (e: ReactPointerEvent) => { if (startY.current != null) setDrag(Math.max(0, startY.current - e.clientY)); };
  const onUp = () => {
    if (startY.current == null) return;
    const d = drag;
    startY.current = null;
    setDrag(0);
    if (d > 70) askOpen();
  };

  return (
    <div className={`lock-screen ${leaving ? "is-leaving" : ""} ${pad6 ? "is-pad" : ""} ${lock.ink === "dark" && !pad6 ? "is-dark-ink" : ""}`}>
      <div className="lock-wallpaper" style={bgStyle} />
      {!pad6 ? (
        <div
          className="lock-face"
          style={{ transform: drag ? `translateY(${-drag * 0.6}px)` : undefined, opacity: drag ? Math.max(0.3, 1 - drag / 260) : undefined }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="lock-lockicon" aria-hidden>
            <svg width="14" height="18" viewBox="0 0 14 18"><path d="M3 8V5.5a4 4 0 0 1 8 0V8" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="1" y="8" width="12" height="9" rx="2.2" fill="currentColor" /></svg>
          </div>
          {lock.style === "widget" ? <WidgetFace now={now} text={lock.widgetText} /> : (
            <>
              <div className="lock-date">{now.getMonth() + 1}月{now.getDate()}日 星期{WEEK[now.getDay()]}</div>
              <div className="lock-time">{pad(now.getHours())}:{pad(now.getMinutes())}</div>
            </>
          )}
          <DebutDay now={now} />
          <DebutWidgets now={now} />
          <LockNotes now={now} />
          <div className="lock-bottom">
            <button type="button" className="lock-round" aria-label="手电筒" onClick={e => e.stopPropagation()}>
              <svg width="18" height="22" viewBox="0 0 18 22" fill="currentColor"><path d="M3 1h12v4l-3 5v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V10L3 5z" /></svg>
            </button>
            <button type="button" className="lock-swipe" onClick={askOpen}>
              <span className={lock.footText ? "is-custom" : ""}>{lock.footText || "向上轻扫以打开"}</span>
              <i />
            </button>
            <button type="button" className="lock-round" aria-label="相机" onClick={e => e.stopPropagation()}>
              <svg width="24" height="19" viewBox="0 0 24 19" fill="currentColor" fillRule="evenodd"><path d="M8 1h8l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zM12 6.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z" /></svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="lock-pad">
          <div className="lock-pad-title">输入密码</div>
          <div className={`lock-dots ${shake ? "is-shake" : ""}`}>
            {Array.from({ length: code.length }, (_, i) => <i key={i} className={i < entry.length ? "on" : ""} />)}
          </div>
          <div className="lock-keys">
            {KEYS.map(([d, l]) => (
              <button key={d} type="button" onClick={() => press(d)}><b>{d}</b><small>{l}</small></button>
            ))}
            <span />
            <button type="button" onClick={() => press("0")}><b>0</b></button>
            <span />
          </div>
          <div className="lock-pad-foot">
            <button type="button" onClick={() => setForgot(true)}>忘记密码</button>
            {entry ? (
              <button type="button" onClick={() => setEntry(entry.slice(0, -1))}>删除</button>
            ) : (
              <button type="button" onClick={() => setPad6(false)}>取消</button>
            )}
          </div>
          {forgot ? (
            <div className="lock-forgot" onClick={() => setForgot(false)}>
              <div className="lock-forgot-card" onClick={e => e.stopPropagation()}>
                <b>忘记密码</b>
                <p>{lock.hint ? `密码提示：${lock.hint}` : "你没有写密码提示。"}</p>
                <button type="button" onClick={() => { saveLock({ code: "", hint: "" }); setForgot(false); unlock(); }}>关掉密码直接进去</button>
                <button type="button" className="is-plain" onClick={() => setForgot(false)}>再想想</button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

const EN_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EN_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 小组件样式：一行小时间+日期，下面左边一段字、中间日子和农历、右边三周的小日历 */
function WidgetFace({ now, text }: { now: Date; text: string }) {
  // 小日历：从这周日开始往后三周（本周在第一行）
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const days = Array.from({ length: 21 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  return (
    <div className="lock-widget">
      <div className="lock-widget-head">
        <span>{pad(now.getHours())}:{pad(now.getMinutes())}</span>
        <span>{EN_WEEK[now.getDay()]} {EN_MONTH[now.getMonth()]} {now.getDate()}</span>
      </div>
      <div className="lock-widget-row">
        <div className="lock-widget-glass lock-widget-left">
          <div className="lock-widget-text">{text || "今天也要好好练习"}</div>
          <div className="lock-widget-day">
            <b>{pad(now.getDate())}</b>
            <span>{lunarLabel(now)}</span>
          </div>
        </div>
        <div className="lock-widget-glass lock-widget-cal">
          {["日", "一", "二", "三", "四", "五", "六"].map(w => <i key={w} className="is-head">{w}</i>)}
          {days.map(d => (
            <i key={d.getTime()} className={d.toDateString() === now.toDateString() ? "is-today" : ""}>
              {d.getDate()}
            </i>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 出道当天：时间下面一行小字 */
function DebutDay({ now }: { now: Date }) {
  const d = loadDebut();
  if (!d?.debutAt || !d.team || new Date(d.debutAt).toDateString() !== now.toDateString()) return null;
  return <div className="lock-dday">✦ {d.team.en.toUpperCase()} DEBUT DAY ✦</div>;
}

/** 出道倒计时 + 今天的日程（出道前一百天内才有） */
function DebutWidgets({ now }: { now: Date }) {
  const cd = debutCountdown();
  if (!cd) return null;
  const today = loadCareer().nodes
    .filter(n => (n.status === "pending" || n.status === "done") && new Date(n.dueAt).toDateString() === now.toDateString())
    .sort((a, b) => a.dueAt - b.dueAt).slice(0, 3);
  return (
    <div className="lock-dwidgets">
      <div className="lock-dw">
        <div className="lock-dw-k">{cd.label}</div>
        <div className="lock-dw-d">{cd.days === 0 ? "D-DAY" : `D-${cd.days}`}<small>{cd.date}</small></div>
        <div className="lock-dw-prog"><i style={{ width: `${Math.round(cd.progress * 100)}%` }} /></div>
      </div>
      <div className="lock-dw lock-dw-list">
        <div className="lock-dw-k">今天</div>
        {today.length ? today.map(n => (
          <div key={n.id} className="lock-dw-row"><b>{pad(new Date(n.dueAt).getHours())}:{pad(new Date(n.dueAt).getMinutes())}</b><span>{n.title}</span></div>
        )) : <div className="lock-dw-row is-empty"><span>今天没有安排</span></div>}
      </div>
    </div>
  );
}

/** 还没看过的通知（同一个人连着好几条就叠起来，只露最新一条） */
function LockNotes({ now }: { now: Date }) {
  const list = unseenNotes();
  if (!list.length) return null;
  const groups: { head: LockNote; count: number }[] = [];
  for (const n of list) {
    const last = groups[groups.length - 1];
    if (last && last.head.app === n.app && last.head.title === n.title && last.head.from === n.from) last.count += 1;
    else groups.push({ head: n, count: 1 });
  }
  return (
    <div className="lock-notes" onPointerDown={e => e.stopPropagation()}>
      {groups.slice(0, 5).map(({ head, count }) => (
        <div key={head.id} className={`lock-note-wrap ${count > 1 ? "is-stack" : ""}`}>
          <div className="lock-note">
            <span className="idol-note-ic" style={{ background: APP_LOOK[head.app].bg, color: APP_LOOK[head.app].fg }}>{APP_LOOK[head.app].icon}</span>
            <span className="idol-note-body">
              <span className="idol-note-head"><span>{head.from || APP_LOOK[head.app].name}</span><span>{agoLabel(head.at, now.getTime())}</span></span>
              {head.title ? <b className="idol-note-title">{head.title}</b> : null}
              <span className="idol-note-text">{head.text}</span>
            </span>
          </div>
          {count > 1 ? <i className="lock-note-stack" /> : null}
        </div>
      ))}
      {groups.length > 5 ? <div className="lock-notes-more">还有 {groups.length - 5} 条通知</div> : null}
    </div>
  );
}
