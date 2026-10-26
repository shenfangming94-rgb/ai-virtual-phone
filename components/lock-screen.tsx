"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { LOCK_CHANGED_EVENT, LOCK_NOW_EVENT, loadLock, loadLockWallpaper, lunarLabel, saveLock } from "@/lib/lock-screen";
import { subscribeWorldClock } from "@/lib/world-clock";
import { loadTraineeCard } from "@/lib/trainee-card";

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
    return () => { window.removeEventListener(LOCK_CHANGED_EVENT, onChange); window.removeEventListener(LOCK_NOW_EVENT, onLockNow); };
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
