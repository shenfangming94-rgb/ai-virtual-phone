/**
 * 时钟 app 的闹钟：按世界时间响。宿主开着时每隔几秒看一眼，
 * 世界时间越过了某个闹钟的点（包括跳时间跳过去）就提醒一次。
 */

import { useEffect, useRef } from "react";

export type WorldAlarm = { id: string; h: number; m: number; label: string; on: boolean };

const KEY = "idol_world_alarms_v1";
const LAST_KEY = "idol_world_alarms_last_v1";

export function loadWorldAlarms(): WorldAlarm[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveWorldAlarms(alarms: WorldAlarm[]): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(alarms)); } catch { /* 存不上就算了 */ }
}

/** (from, to] 之间最近响过的那个闹钟；跨很多天只算最后一次 */
function dueAlarm(alarms: WorldAlarm[], from: number, to: number): WorldAlarm | null {
  if (to <= from) return null;
  let best: { a: WorldAlarm; at: number } | null = null;
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  // 最多往回看 2 天，跳一年也只响最后那次
  const firstDay = Math.max(start.getTime(), new Date(to).setHours(0, 0, 0, 0) - 2 * 864e5);
  for (let day = firstDay; day <= to; day += 864e5) {
    for (const a of alarms) {
      if (!a.on) continue;
      const d = new Date(day);
      d.setHours(a.h, a.m, 0, 0);
      const at = d.getTime();
      if (at > from && at <= to && (!best || at > best.at)) best = { a, at };
    }
  }
  return best?.a ?? null;
}

export function useWorldAlarms(onNotice: (message: string) => void): void {
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      let last = now;
      try { last = Number(window.localStorage.getItem(LAST_KEY)) || now; } catch { /* 没有就从现在算 */ }
      // 往回拨了时间就从现在重新算
      if (last > now) last = now;
      const hit = dueAlarm(loadWorldAlarms(), last, now);
      try { window.localStorage.setItem(LAST_KEY, String(now)); } catch { /* 忽略 */ }
      if (hit) noticeRef.current(`⏰ ${hit.label}`);
    };
    check();
    const timer = window.setInterval(check, 5000);
    return () => window.clearInterval(timer);
  }, []);
}
