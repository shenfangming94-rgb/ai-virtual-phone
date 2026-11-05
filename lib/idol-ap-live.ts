/**
 * 爱豆小手机：行动点的存档落地（kv 包装）。纯逻辑在 lib/idol-actionpoints.ts。
 */

import { kvGet, kvSet } from "./kv-db";
import { apConsume, apRemaining, apResetIfNewDay, emptyAp, type ApState } from "./idol-actionpoints";

const KEY = "idol_actionpoints_v1";

export function loadAp(): ApState {
  try { return JSON.parse(kvGet(KEY) || "null") as ApState | null ?? emptyAp(); } catch { return emptyAp(); }
}
export function saveAp(s: ApState) { kvSet(KEY, JSON.stringify(s)); }

/** 今天还剩几点（跨天自动重置） */
export function apLeft(now = Date.now()): number {
  const s = apResetIfNewDay(loadAp(), now);
  saveAp(s);
  return apRemaining(s, now);
}

/** 用掉几个整格（同一格只记一次） */
export function consumeAp(now: number, slots: number[], what: string): void {
  saveAp(apConsume(loadAp(), now, slots, what));
}
