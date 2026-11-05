/**
 * 爱豆小手机：名册存档落地（Character / IdolProfile / kv）。
 *
 * 签约进练习生阶段后第一次运行时生成 39 名同期（建档 + 名册状态），
 * rosterTick 每 5 秒在桌面跑：逐周补算 NPC 成长（跳时间跳多少补多少）。
 * 玩家不在这里涨：她的数值走真实上课/加练结算（上课管线）。
 * 纯逻辑在 lib/idol-roster.ts。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadTraineeCard } from "./trainee-card";
import { loadCareer } from "./idol-career";
import { createPerson, emptyProfile, herAge } from "./idol-people";
import { genKakaoId } from "./idol-kakao";
import { coursePoints, settleProgress, type Subject } from "./idol-training";
import { generateRosterState, settleNpcWeeks, type RosterState } from "./idol-roster";

const KEY = "idol_roster_v1";
const DAY = 864e5;

function load(): RosterState | null {
  try { return JSON.parse(kvGet(KEY) || "null") as RosterState | null; } catch { return null; }
}
function save(s: RosterState) { kvSet(KEY, JSON.stringify(s)); }

/** 同款种子随机（模拟器同源） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const mondayOf = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const weeksBetween = (fromIso: string, toIso: string) => Math.max(0, Math.floor((mondayOf(new Date(toIso).getTime()) - mondayOf(new Date(fromIso).getTime())) / (7 * DAY)));

/** 生成或读取名册。没签约（还不是练习生）返回 null。 */
export function ensureRoster(): RosterState | null {
  const career = loadCareer();
  if (career.stage !== "trainee") return null;
  let s = load();
  if (s) return s;
  const card = loadTraineeCard();
  if (!card) return null;
  const rng = mulberry32((career.signedAt ?? Date.now()) % 4294967296);
  s = generateRosterState(card.talents ?? [], rng);
  const baseAge = Number(herAge() ?? 17) || 17;
  for (const n of s.npcs) {
    const age = Math.max(14, Math.min(21, baseAge + Math.floor(rng() * 5) - 2)); // 她 ±2 岁
    const char = createPerson(n.name, {
      ...emptyProfile(""),
      layer: "main",
      group: "同期练习生",
      role: "同期练习生",
      gender: "女",
      age: String(age),
      birthday: n.birthday,
      met: false,
      relation: "陌生",
      isIdol: false,
      leave: { score: 1 + Math.floor(rng() * 4), log: [], phase: "ok" },
    }, null, genKakaoId());
    n.charId = char.id;
  }
  save(s);
  return s;
}

/** 桌面每 5 秒跑：把没结算的周补上（跳时间跳多久补多久） */
export function rosterTick(): void {
  const s = ensureRoster();
  if (typeof window !== "undefined") (window as unknown as { __idolNewMode?: boolean }).__idolNewMode = Boolean(s);
  if (!s) return;
  const today = dayKey(Date.now());
  if (today <= s.settledUntil) return;
  const weeks = weeksBetween(s.settledUntil, today);
  if (weeks > 0) {
    const seed = 1e9 + s.npcs.length * 7 + (s.settledUntil || "").split("-").reduce((a, b) => a + Number(b), 0);
    settleNpcWeeks(s, Math.min(weeks, 52), mulberry32(seed % 4294967296));
  }
  s.settledUntil = today;
  save(s);
}

export { load as loadRoster, save as saveRoster };

// ── 上课结算：她上完一节课，名册里的她涨这门课（数字要打成文字给她看） ──

export type ClassGain = { gained: number; levels: { from: number; to: number }[]; stat: number };

/** 结算她的一节课。特色课（subject 不在八门里）别调这个。 */
export function settlePlayerClass(subject: Subject): ClassGain | null {
  const s = ensureRoster();
  if (!s) return null;
  const r = settleProgress(s.player, subject, coursePoints(s.player, subject));
  save(s);
  return { gained: r.gained, levels: r.levels, stat: s.player.stats[subject] };
}

/** 打给她的那一行：「声乐 +1.5」；升级了再拼「声乐 45→46」 */
export function formatClassGain(subjectLabel: string, g: ClassGain): string {
  const parts = [`${subjectLabel} +${g.gained}`];
  for (const lv of g.levels) parts.push(`${subjectLabel} ${lv.from}→${lv.to}`);
  return parts.join("，");
}
