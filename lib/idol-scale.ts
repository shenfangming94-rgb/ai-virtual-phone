/**
 * 爱豆小手机：数字的规矩（YouTube 播放量 / 订阅数、ins 粉丝 / 点赞）。数字只由这里算，AI 不写数字。
 *
 * - 团分四档：顶流 top / 中坚 mid / 小团 small / 新人 rookie。第一次出现时 AI 说一句（Group.tier），没说就按公司大小和出道几年判断
 * - 世界年份打折：越早用的人越少
 * - 同一个号、同一条视频每次算出来一样（按名字取固定的随机数）
 */

import { loadGroups, findGroup, type Group } from "./idol-groups";
import { fameBand } from "./idol-fame";

export type Tier = "top" | "mid" | "small" | "rookie";
export const TIER_NAMES: Record<Tier, string> = { top: "顶流", mid: "中坚", small: "小团", rookie: "新人" };
export const TIER_HINT = `tier 写这个团现在的名气：top 顶流 / mid 中坚 / small 小团 / rookie 刚出道的新人`;

/** 固定随机：同一个 key 永远同一个 0～1 */
function seeded(key: string): number {
  let h = 2166136261;
  for (const ch of key) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
const between = (key: string, a: number, b: number) => Math.round(a + seeded(key) * (b - a));

/** 世界年份打折（以 2024 年为 1） */
export function yearFactor(at = Date.now()): number {
  const y = new Date(at).getFullYear();
  return y <= 2010 ? 0.1 : y <= 2012 ? 0.18 : y <= 2015 ? 0.3 : y <= 2018 ? 0.5 : y <= 2021 ? 0.8 : 1;
}

const BIG = new Set(["sm", "jyp", "yg", "hybe"]);
export function tierOf(g?: Group, at = Date.now()): Tier {
  if (!g) return "small";
  if (g.tier && g.tier in TIER_NAMES) return g.tier as Tier;
  const years = g.debut ? new Date(at).getFullYear() - g.debut : 3;
  if (years <= 1) return "rookie";
  return BIG.has(g.companyId ?? "") ? (years >= 4 ? "top" : "mid") : g.companyId === "starship" ? "mid" : "small";
}
export function tierByName(name?: string): Tier { return tierOf(name ? findGroup(name) : undefined); }
/** 一句话身份里提到的团（「VANTA 主唱 · 同公司前辈」→ VANTA） */
export function groupInText(text: string): Group | undefined {
  const t = text.toLowerCase();
  return Object.values(loadGroups()).sort((a, b) => b.name.length - a.name.length).find(g => t.includes(g.name.toLowerCase()));
}

// 范围都是 2024 年的量，用时乘年份
const R = {
  mv: { top: [8e7, 2e8], mid: [1e7, 3e7], small: [1e6, 4e6], rookie: [2e5, 1e6] },
  chSubs: { top: [1.5e7, 3e7], mid: [3e6, 8e6], small: [3e5, 1.5e6], rookie: [5e4, 3e5] },
  insOfficial: { top: [2e7, 6e7], mid: [3e6, 1e7], small: [2e5, 1e6], rookie: [3e4, 2e5] },
  insIdol: { top: [1e7, 4e7], mid: [1e6, 5e6], small: [1e5, 6e5], rookie: [2e4, 1.5e5] },
} as const;
const COMPANY_SUBS: Record<string, [number, number]> = { sm: [3e7, 3.5e7], hybe: [3e7, 3.5e7], jyp: [2.6e7, 3e7], yg: [2.6e7, 3e7], starship: [5e6, 8e6], cube: [2.5e6, 4e6] };

/** 视频类型跟 MV 比的倍数 */
function kindMult(kind: string): number {
  if (/MV/i.test(kind)) return 1;
  if (/预告|teaser/i.test(kind)) return 0.3;
  if (/练习室/.test(kind)) return 0.25;
  if (/舞台|打歌|颁奖|演唱会/.test(kind)) return 0.15;
  if (/直拍/.test(kind)) return 0.08;
  return 0.06; // 团综、vlog、直播回放
}

/** 别人的视频：一个月左右的播放量 */
export function videoViews(key: string, groupName: string | undefined, kind: string, at: number): number {
  const t = tierByName(groupName);
  const [a, b] = R.mv[t];
  return Math.max(300, Math.round(between(key, a, b) * kindMult(kind) * yearFactor(at)));
}
export function channelSubs(key: string, kind: "company" | "group" | "person", companyId?: string, groupName?: string, at = Date.now()): number {
  if (kind === "company" && companyId) { const [a, b] = COMPANY_SUBS[companyId] ?? [2e6, 5e6]; return Math.round(between(key, a, b) * yearFactor(at)); }
  const [a, b] = R.chSubs[tierByName(groupName)];
  return Math.max(500, Math.round(between(key, a, b) * (kind === "person" ? 0.5 : 1) * yearFactor(at)));
}
/** 她出镜的视频：公司频道越大越多，再乘她的关注度 */
export function myVideoViews(key: string, channelSubsN: number): number {
  const tier = fameBand();
  const mult = tier === "公众人物" ? 8 : tier === "小有人知" ? 2.5 : 1;
  return Math.max(800, Math.round(channelSubsN * (0.003 + seeded(key) * 0.005) * mult));
}

/** ins：团官方号 / 出道爱豆大号 / 别的 */
export function insFollowers(key: string, kind: "official" | "idol" | "trainee" | "alt" | "npc", group?: Group, at = Date.now()): number {
  if (kind === "trainee") return between(key, 40, 400);
  if (kind === "alt") return between(key, 8, 60);
  if (kind === "npc") return between(key, 20, 900);
  const [a, b] = (kind === "official" ? R.insOfficial : R.insIdol)[tierOf(group, at)];
  return Math.max(1000, Math.round(between(key, a, b) * yearFactor(at)));
}
/** 一条帖子的点赞：粉丝数的一小部分 */
export function insLikes(key: string, followers: number, publicAcc: boolean): number {
  const r = publicAcc ? 0.03 + seeded(key) * 0.09 : 0.2 + seeded(key) * 0.5;
  return Math.max(0, Math.round(followers * r));
}
