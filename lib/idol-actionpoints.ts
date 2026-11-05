/**
 * 爱豆小手机：行动点（纯函数层）。
 *
 * 每日 08:00–24:00 共 8 点，1 点 = 2 小时整格（08-10、10-12、12-14、14-16、16-18、18-20、20-22、22-24）。
 * 占点的只有：上课、加练、约会。KKT、电话不占点；24 点之后（晚上挂机）不占点、没人管。
 * 规矩：Flora 2026-11-05 深夜定稿（docs/idol/DISCUSSION-2026-11-05-情缘系统.md 第四节）。
 */

export const AP_SLOTS = 8;
/** 8 个整格的时间显示 */
export const AP_SLOT_LABELS = ["08:00-10:00", "10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-18:00", "18:00-20:00", "20:00-22:00", "22:00-24:00"];

export type ApState = { day: string; used: { slot: number; what: string }[] };

const pad = (n: number) => String(n).padStart(2, "0");
/** 世界日期 YYYY-MM-DD（行动点按世界日期重置） */
export function apDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 时间点落在第几个整格；不在 08:00–24:00 里返回 null（夜里不占点） */
export function apSlotOf(ms: number): number | null {
  const d = new Date(ms);
  const hour = d.getHours() + d.getMinutes() / 60;
  if (hour < 8 || hour >= 24) return null;
  return Math.floor((hour - 8) / 2);
}

export function emptyAp(now = Date.now()): ApState {
  return { day: apDayKey(now), used: [] };
}

/** 跨了世界日期就重置（一天 8 点，早上 8 点刷新） */
export function apResetIfNewDay(s: ApState, now = Date.now()): ApState {
  return s.day === apDayKey(now) ? s : { day: apDayKey(now), used: [] };
}

/** 今天还剩几点 */
export function apRemaining(s: ApState, now = Date.now()): number {
  return Math.max(0, AP_SLOTS - apResetIfNewDay(s, now).used.length);
}

/**
 * 用掉几个整格（同一格只记一次，重复调用不重复扣）。
 * 上课 = 课表占的格；加练 = 20:00-22:00 一格；约会 = 至少一格，每满 2 小时再扣一格。
 * 返回新的 state（不原地改）。
 */
export function apConsume(s: ApState, now: number, slots: number[], what: string): ApState {
  const cur = apResetIfNewDay(s, now);
  const have = new Set(cur.used.map(u => u.slot));
  const add = [...new Set(slots)].filter(x => x >= 0 && x < AP_SLOTS && !have.has(x));
  if (!add.length) return cur;
  return { ...cur, used: [...cur.used, ...add.map(slot => ({ slot, what }))] };
}

/** 约会的扣法：开始时间 + 待了几小时 → 占几个格（至少 1） */
export function apDateSlots(startMs: number, hours: number): number[] {
  const first = apSlotOf(startMs);
  if (first == null) return [];
  const n = Math.max(1, Math.ceil(hours / 2));
  return Array.from({ length: Math.min(n, AP_SLOTS) }, (_, i) => Math.min(AP_SLOTS - 1, first + i));
}

/** 给页面看的：「今天还剩 X 点」+ 已用清单 */
export function apView(s: ApState, now = Date.now()): { remaining: number; used: { label: string; what: string }[] } {
  const cur = apResetIfNewDay(s, now);
  return {
    remaining: Math.max(0, AP_SLOTS - cur.used.length),
    used: cur.used.map(u => ({ label: AP_SLOT_LABELS[u.slot] ?? `格${u.slot}`, what: u.what })),
  };
}
