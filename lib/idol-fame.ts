/**
 * 爱豆小手机：关注度。关注度 = 人气（慢慢涨，基本不掉）+ 热度（一下冲上去，没新动静就退）。
 * 三档：0～19 普通人 / 20～49 小有人知 / 50+（或已经出道）公众人物。
 * 加多少写死在这里，事情是大是小由发动机排事情时顺手标；她也能在关注度页自己改。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadTraineeCard } from "./trainee-card";

export type FameSize = "small" | "medium" | "big" | "debut";
export type FameLog = { at: number; text: string; size?: FameSize | "start" | "manual" | "cool"; pop: number; heat: number; until?: number };
type State = { pop: number; heat: number; at: number; log: FameLog[]; coolFrom?: number; coolSum?: number };

const KEY = "idol_fame_v1";
export const FAME_EVENT = "idol-fame-changed";
const DAY = 864e5;
/** 热度半衰期：一周 */
const HALF = 7 * DAY;

export const FAME_TIERS = [
  { min: 0, name: "普通人", range: "0～19" },
  { min: 20, name: "小有人知", range: "20～49" },
  { min: 50, name: "公众人物", range: "50+" },
] as const;

export function familyStart(): number {
  const f = loadTraineeCard()?.family;
  return f === "child" ? 55 : f === "star" ? 50 : f === "chaebol" || f === "rich" ? 30 : 5;
}
const familyText = () => {
  const f = loadTraineeCard()?.family;
  return f === "child" ? "童星" : f === "star" ? "星二代" : f === "chaebol" ? "财阀家" : f === "rich" ? "富二代" : f === "custom" ? "自己写的家境" : "普通家庭";
};

function fresh(): State {
  const pop = familyStart();
  return { pop, heat: 0, at: Date.now(), log: [{ at: Date.now(), text: `开局 · ${familyText()}`, size: "start", pop, heat: 0 }] };
}

function load(): State {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as State | null;
    if (raw) return { ...raw, log: raw.log ?? [] };
    // 以前的关注度是一个数，存在 idol_events_v1.fame：开局那部分算人气，多出来的算热度
    const old = (JSON.parse(kvGet("idol_events_v1") || "null") as { fame?: number } | null)?.fame;
    if (typeof old === "number" && loadTraineeCard()) {
      const s = fresh();
      const extra = Math.max(0, old - (familyStart() - 5));
      if (extra > 0) { s.heat = extra; s.log.push({ at: Date.now(), text: "以前攒下的热度", size: "medium", pop: 0, heat: extra }); }
      save(s);
      return s;
    }
  } catch { /* 坏数据当新的 */ }
  return fresh();
}
function save(s: State) {
  kvSet(KEY, JSON.stringify({ ...s, log: s.log.slice(-300) }));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FAME_EVENT));
}

/** 热度按世界时间衰减；退掉的按周并成一行记账 */
function settle(s: State, now = Date.now()): State {
  if (now <= s.at) return s;
  const heat = s.heat * Math.pow(0.5, (now - s.at) / HALF);
  const drop = s.heat - heat;
  const next: State = { ...s, heat, at: now };
  if (drop > 0.05) {
    next.coolFrom = s.coolFrom ?? s.at;
    next.coolSum = (s.coolSum ?? 0) + drop;
    if (now - next.coolFrom >= 7 * DAY && next.coolSum >= 0.5) {
      next.log = [...s.log, { at: next.coolFrom, until: now, text: "热度慢慢退了", size: "cool", pop: 0, heat: -Math.round(next.coolSum) }];
      next.coolFrom = undefined; next.coolSum = 0;
    }
  }
  return next;
}

export function fameState(): { pop: number; heat: number; total: number; log: FameLog[] } {
  if (!loadTraineeCard()) return { pop: 0, heat: 0, total: 0, log: [] };
  const s = settle(load());
  const pop = Math.round(s.pop), heat = Math.round(s.heat);
  return { pop, heat, total: Math.min(100, pop + heat), log: s.log };
}
export const fameTotal = () => fameState().total;

/** 出道了一律算公众人物 */
export function fameTier(total = fameTotal()): (typeof FAME_TIERS)[number] {
  let stage = "";
  try { stage = (JSON.parse(kvGet("idol_career_v1") || "null") as { stage?: string } | null)?.stage ?? ""; } catch { /* 没有就算没出道 */ }
  if (stage === "idol") return FAME_TIERS[2];
  return total >= 50 ? FAME_TIERS[2] : total >= 20 ? FAME_TIERS[1] : FAME_TIERS[0];
}

/** 热度两周后大概剩多少 */
export const heatIn = (days: number) => Math.round(fameState().heat * Math.pow(0.5, (days * DAY) / HALF));

/** 记一件事：小事热度 +2；中事热度 +5 人气 +1；大事热度 +10～20；出道人气 +30 */
export function fameEvent(size: FameSize, text: string, at = Date.now()): void {
  if (!loadTraineeCard()) return;
  const s = settle(load(), Math.max(at, load().at));
  const dPop = size === "medium" ? 1 : size === "debut" ? 30 : 0;
  const dHeat = size === "small" ? 2 : size === "medium" ? 5 : size === "big" ? 10 + Math.floor(Math.random() * 11) : 0;
  const next = { ...s, pop: Math.min(100, s.pop + dPop), heat: Math.min(100, s.heat + dHeat) };
  next.log = [...s.log, { at, text: text.trim() || "有点动静", size, pop: dPop, heat: dHeat }];
  save(next);
}

/** 她自己改总分：差多少都算在人气上，热度不动 */
export function setFameTotal(target: number): void {
  const s = settle(load());
  const want = Math.max(0, Math.min(100, Math.round(target)));
  const pop = Math.max(0, want - Math.round(s.heat));
  const d = pop - Math.round(s.pop);
  if (!d && want === Math.round(s.pop + s.heat)) return;
  save({ ...s, pop, heat: Math.min(s.heat, want), log: [...s.log, { at: Date.now(), text: `自己改成 ${want}`, size: "manual", pop: d, heat: 0 }] });
}

/** 给世界看的一句话 */
export function fameWordNow(): string {
  const t = fameTotal();
  const tier = fameTier(t);
  return tier.name === "公众人物" ? "公众人物：很多人认识她，评论区多是粉丝，有人开帖讨论她"
    : tier.name === "小有人知" ? "小有人知：有一小撮人在关注她，偶尔被路透粉、考古粉认出来"
    : "普通人：几乎没人知道她，网上的人都当她是陌生人";
}
