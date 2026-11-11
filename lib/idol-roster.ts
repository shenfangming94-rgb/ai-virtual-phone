/**
 * 爱豆小手机：一年养成名册（纯函数层，不碰存档/角色/AI）。
 *
 * 40 人池 = 玩家 + 39 名女同期。数值规则全在 lib/idol-training.ts；
 * 这里管名册的生成（生日、宿舍、NPC 之间的朋友圈）和逐周结算。
 * 存档落地（Character / IdolProfile / kv）在 lib/idol-roster-live.ts。
 * 规矩来源：docs/idol/DISCUSSION-2026-11-05-一年养成数值方案.md 和 docs/idol/needs/。
 */

import {
  generateRoster, settleWeek, TIMETABLE_CURRENT,
  ATTITUDE_LABEL, GIVEN_POOL, SURNAME_POOL,
  type Specialty, type Stats, type Subject, type Timetable, type Trainee,
} from "./idol-training";

export type NpcFriend = { charId: string; tier: "好朋友" | "朋友" | "熟人" };

/** 一名同期：数值骨架（idol-training 的 Trainee）+ 生日、宿舍、朋友圈；charId 由落地层建档后回填 */
export type NpcRecord = Trainee & {
  charId?: string;
  birthday: string; // MM-DD
  dorm: string;     // 宿舍编号，如 301
  friends: NpcFriend[];
  /** 她入社的时间（大多同期比她早进公司很久；名册入社记录用） */
  joinedAt?: number;
};

export type RosterState = {
  createdAt: number;
  player: Trainee;
  npcs: NpcRecord[];
  /** trainTick 结算到哪一天（世界日期 YYYY-MM-DD），防重复补算 */
  settledUntil: string;
  /** 她的宿舍号：分宿舍那天和这一间的人同住（室友 = 这一间的 2~3 人） */
  playerDorm?: string;
  /** 新档签约时的 39 人资料补全队列；失败时保留，后续可重试。 */
  profilePending?: string[];
  profileRetryAt?: number;
  /** 一次性：老提示词写的 TMI 太人机，全册重写一遍 TMI（详见 idol-roster-live queueTmiReroll） */
  tmiRerollDone?: boolean;
  tmiRerollAt?: number;
};

/** 玩家基准：三项 45 起，C 班。视觉 50、软实力 45（模拟器同款基准）。
 *  开局的任何特长都要兑现：硬三门优先当特长，没选硬三门就按她选的排；
 *  选了颜值特长的直接 A（85，她定的：颜值没有课能练，不让她在 D 里熬）。
 *  特长基准 60（她 11-11 定：跟 C 班同期中位持平，之前 55 开局欠着账）。 */
export function makePlayer(talents: string[]): Trainee {
  const SUBJECT_IDS: Subject[] = ["vocal", "dance", "rap", "visual", "acting", "variety", "compose", "language"];
  const first = talents.find(t => t === "vocal" || t === "dance" || t === "rap") ?? talents.find(t => SUBJECT_IDS.includes(t as Subject));
  const specialty: Specialty = (first as Subject | undefined) ?? "dance";
  const stats: Stats = { vocal: 45, dance: 45, rap: 45, variety: 45, acting: 45, visual: 50, compose: 45, language: 45 };
  stats[specialty] = 60;
  if (talents.includes("visual")) stats.visual = 85;
  return {
    id: "player", name: "玩家", specialty, stats,
    progress: { vocal: 0, dance: 0, rap: 0, variety: 0, acting: 0, visual: 0, compose: 0, language: 0 },
    attitude: "extreme", practicePreference: "none", initialClass: "C", klass: "C",
  };
}

/** 39 人宿舍分配：2~3 人一间，编号 301 起 */
function assignDorms(npcs: NpcRecord[], rng: () => number): void {
  const pool = [...npcs].sort(() => rng() - 0.5);
  let room = 301, i = 0;
  while (i < pool.length) {
    const size = 2 + Math.floor(rng() * 2); // 2~3 人
    for (let k = 0; k < size && i < pool.length; k++, i++) pool[i].dorm = String(room);
    room++;
  }
}

function link(a: NpcRecord, b: NpcRecord, tier: NpcFriend["tier"]): void {
  if (!a.friends.some(f => f.charId === b.id)) a.friends.push({ charId: b.id, tier });
  if (!b.friends.some(f => f.charId === a.id)) b.friends.push({ charId: a.id, tier });
}

/**
 * NPC 朋友圈：六成人有固定小团体（2~5 人，团里一两对好朋友、其余朋友），
 * 两成人只有一对朋友，两成人独来独往；最后在团体之间洒几条「熟人」。
 * 关系写双边（她文档：A-B 好朋友、B-C 朋友、A-C 熟人，三个人常一起活动但关系不完全相同）。
 */
function assignFriends(npcs: NpcRecord[], rng: () => number): void {
  const pool = [...npcs].sort(() => rng() - 0.5);
  let i = 0;
  while (i < pool.length) {
    const roll = rng();
    if (roll < 0.6 && i + 1 < pool.length) {
      const size = Math.min(2 + Math.floor(rng() * 4), pool.length - i); // 2~5
      const group = pool.slice(i, i + size);
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) link(group[a], group[b], "朋友");
      }
      // 团里随机一两对升级成好朋友
      const pairs = group.length > 2 ? 2 : 1;
      for (let k = 0; k < pairs; k++) {
        const a = Math.floor(rng() * group.length);
        let b = Math.floor(rng() * group.length);
        if (a === b) b = (b + 1) % group.length;
        group[a].friends = group[a].friends.filter(f => f.charId !== group[b].id);
        group[b].friends = group[b].friends.filter(f => f.charId !== group[a].id);
        link(group[a], group[b], "好朋友");
      }
      i += size;
    } else if (roll < 0.8 && i + 1 < pool.length) {
      link(pool[i], pool[i + 1], "朋友");
      i += 2;
    } else {
      i++; // 独来独往
    }
  }
  // 团体之间洒几条熟人：从不同宿舍挑人
  const byDorm = new Map<string, NpcRecord[]>();
  for (const n of npcs) byDorm.set(n.dorm, [...(byDorm.get(n.dorm) ?? []), n]);
  const dorms = [...byDorm.values()];
  let links = 0;
  for (let k = 0; k < 40 && links < 6; k++) {
    const g1 = dorms[Math.floor(rng() * dorms.length)];
    const g2 = dorms[Math.floor(rng() * dorms.length)];
    if (!g1 || !g2 || g1 === g2) continue;
    const a = g1[Math.floor(rng() * g1.length)];
    const b = g2[Math.floor(rng() * g2.length)];
    if (a.friends.some(f => f.charId === b.id)) continue;
    link(a, b, "熟人");
    links++;
  }
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = (n: number) => String(n).padStart(2, "0");

/** 39 人生日：MM-DD 随机、不重复（同年出生概率本来就低，不做年份） */
function assignBirthdays(npcs: NpcRecord[], rng: () => number): void {
  const used = new Set<string>();
  for (const n of npcs) {
    let date = "";
    for (let k = 0; k < 50; k++) {
      const m = 1 + Math.floor(rng() * 12);
      const d = 1 + Math.floor(rng() * DAYS_IN_MONTH[m - 1]);
      date = `${pad(m)}-${pad(d)}`;
      if (!used.has(date)) break;
    }
    used.add(date);
    n.birthday = date;
  }
}

/** 生成整个名册：玩家 + 39 名同期。rng 返回 [0,1)。 */
export function generateRosterState(talents: string[], rng: () => number, now = Date.now()): RosterState {
  const raw = generateRoster(rng);
  const npcs: NpcRecord[] = raw.map(t => ({ ...t, birthday: "", dorm: "", friends: [] }));
  dedupeRosterNames(npcs);
  assignBirthdays(npcs, rng);
  assignDorms(npcs, rng);
  assignFriends(npcs, rng);
  assignJoinedDates(npcs, now, rng);
  return {
    createdAt: now,
    player: makePlayer(talents),
    npcs,
    settledUntil: new Date(now).toISOString().slice(0, 10),
    playerDorm: assignPlayerDorm(npcs),
  };
}

/** 同期入社时间：大多比她早进公司很久（NEED-1「同期大多早已入社」），少数是近几个月的新人 */
function assignJoinedDates(npcs: NpcRecord[], now: number, rng: () => number): void {
  for (const n of npcs) {
    const months = rng() < 0.3 ? 1 + Math.floor(rng() * 5) : 6 + Math.floor(rng() * 24);
    n.joinedAt = now - months * 30 * 864e5;
  }
}

/** 她的宿舍：优先有 C 班同期、原本只住两人的房间（加她正好三人） */
function assignPlayerDorm(npcs: NpcRecord[]): string {
  const byDorm = new Map<string, NpcRecord[]>();
  for (const n of npcs) byDorm.set(n.dorm, [...(byDorm.get(n.dorm) ?? []), n]);
  const rooms = [...byDorm.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const pick = rooms.find(([, m]) => m.length === 2 && m.some(x => x.klass === "C"))
    ?? rooms.find(([, m]) => m.some(x => x.klass === "C"))
    ?? rooms.find(([, m]) => m.length === 2)
    ?? rooms[0];
  return pick?.[0] ?? "301";
}

/** 姓名去重+去相似（不用 rng，不扰动后续生日/宿舍的随机流）：
 *  整册既不许撞全名，也不许撞「名」——她受够「允儿×3 只换姓」。撞了的换名不换姓，从没用过的名字里挑。
 *  返回改过的（npcId → 新名字），落地层拿去同步 Character 的名字。 */
export function dedupeRosterNames(npcs: NpcRecord[]): { npcId: string; from: string; to: string }[] {
  const renames: { npcId: string; from: string; to: string }[] = [];
  const usedFull = new Set<string>();
  const usedGiven = new Set<string>();
  for (const n of npcs) {
    let surname = n.name.slice(0, 1);
    const given = n.name.slice(1);
    if (!usedFull.has(n.name) && !usedGiven.has(given)) {
      usedFull.add(n.name);
      usedGiven.add(given);
      continue;
    }
    let fresh = "";
    for (const g of GIVEN_POOL) { if (!usedGiven.has(g)) { fresh = g; break; } }
    if (!fresh) {
      outer: for (const s of SURNAME_POOL) for (const g of GIVEN_POOL) { if (!usedGiven.has(g)) { surname = s; fresh = g; break outer; } }
    }
    if (!fresh || usedFull.has(surname + fresh)) continue; // 池子全撞了的极端兜底
    const to = surname + fresh;
    renames.push({ npcId: n.id, from: n.name, to });
    n.name = to;
    usedFull.add(to);
    usedGiven.add(fresh);
  }
  return renames;
}

/** 给 NPC 补算 weeks 周的训练（玩家不在这里涨：她的数值走真实上课/加练结算）。原地改。
 *  tt 不传就用默认课表；新档传入公司实际课表（她反馈/审计：NPC 要按真实课表练，不同公司不一样） */
export function settleNpcWeeks(state: RosterState, weeks: number, rng: () => number, tt: Timetable = TIMETABLE_CURRENT): void {
  for (let w = 0; w < weeks; w++) {
    for (const n of state.npcs) settleWeek(n, tt, rng);
  }
}

/** 名册给 AI 看的：只写班级、特长、态度和朋友圈，不写数值（档位/数值不进 AI）。她反馈：出场同期得对得上性格班级，所以态度也要给 */
export function rosterPromptBlock(state: RosterState): string {
  const lines = state.npcs.slice(0, 40).map(n => {
    const friends = n.friends.filter(f => f.tier === "好朋友" || f.tier === "朋友").map(f => state.npcs.find(x => x.id === f.charId)?.name).filter(Boolean).slice(0, 4);
    return `- ${n.name}（${n.klass} 班${n.specialty !== "none" ? `，特长${n.specialty}` : ""}，${ATTITUDE_LABEL[n.attitude]}${friends.length ? `，走得近的：${friends.join("、")}` : ""}）`;
  });
  return [`【同期名册】她这一批女练习生 40 人（含她），她开局在 C 班。`, ...lines].join("\n");
}
