/**
 * 爱豆小手机：同期人物支线引擎（第 5 类生活系统）。
 *
 * 规矩（docs/idol/needs/NEED-4）：五类支线（兴趣/家庭/过去/友情变化/现实烦恼），
 * 代码按关系档、近期互动、背景筛人 → 选类型 → 三入口（KKT 主动邀约 / 此刻偶遇 / 日历已约）→ AI 演 → 存结果。
 * 总人数不限，同一时间最多 3 条活跃支线；支线不占剧情池名额。
 * 只在新存档（有名册）下跑。开场 AI 直接生成（她的规矩）。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCareer } from "./idol-career";
import { loadProfiles, type IdolProfile } from "./idol-people";
import { loadCharacters } from "./character-storage";
import { loadRoster } from "./idol-roster-live";
import type { Character } from "./character-types";

const KEY = "idol_branches_v1";

export type BranchType = "interest" | "family" | "past" | "friendship" | "worry";

export const BRANCH_LABEL: Record<BranchType, string> = {
  interest: "私人兴趣与爱好", family: "家庭故事", past: "过去的经历", friendship: "友情与关系变化", worry: "现实烦恼与私人变化",
};

export type BranchRecord = {
  charId: string;
  type: BranchType;
  /** 活跃推进中（最多 3 条）/ 告一段落 */
  active: boolean;
  startedAt: number;
  lastAt: number;
  firedCount: number;
  /** 已发生的事（结果保存，优先延续而不是每次新编） */
  history: { at: number; text: string }[];
};

type State = { branches: BranchRecord[] };

function load(): State {
  try { return { branches: [], ...(JSON.parse(kvGet(KEY) || "null") as Partial<State> | null) }; } catch { return { branches: [] }; }
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); }

const REL_TIER: Record<string, number> = { "跟你过不去": 0, "不喜欢你": 0, "有点烦你": 0, 陌生: 1, 认识: 2, 熟人: 3, 朋友: 4, 好朋友: 5, 暧昧: 5, 恋人: 5 };

/** 每个同期按关系/互动/背景挑类型：满足条件进候选，每天最多开一条新支线（活跃上限 3） */
export function branchesTick(): void {
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const career = loadCareer();
  if (career.stage !== "trainee") return;
  const s = load();
  // 完成的支线节点：记结果、腾名额（继续优先延续在 premise 的 history 里体现）
  const doneBranch = career.nodes.find(n => n.occasion === "branch" && n.status !== "pending" && n.status !== "invite" && s.branches.some(b => b.charId === n.fromId && b.active));
  if (doneBranch) {
    branchNodeDone(doneBranch.fromId!, (doneBranch.note ?? "").replace("支线：", "") as BranchType, `${doneBranch.title}${doneBranch.status === "done" ? "一起经历了" : "没去成"}`);
    return;
  }
  const active = s.branches.filter(b => b.active);
  if (active.length >= 3) return;
  const roster = loadRoster();
  if (!roster) return;
  const profiles = loadProfiles();
  const chars = loadCharacters();
  const now = Date.now();
  // 今天开过没有（一天最多开一条新的）
  const today = new Date(now).toDateString();
  if (s.branches.some(b => new Date(b.startedAt).toDateString() === today && b.firedCount === 0)) return;

  const candidates = roster.npcs
    .filter(n => n.charId)
    .map(n => ({ n, p: profiles[n.charId!] }))
    .filter(x => x.p && x.p.met && x.p?.leave?.phase !== "left");
  const pickable = candidates.filter(x => {
    const tier = REL_TIER[x.p.relation ?? "陌生"] ?? 1;
    const recent = (x.p.events?.length ?? 0) > 0;
    // 她反馈/审计：同一个人可以分多次继续（告一段落后过一段时间还能再开，延续优先）
    const prev = s.branches.find(b => b.charId === x.n.charId);
    const cooled = !prev || (!prev.active && now - prev.lastAt > 20 * 864e5);
    return tier >= 2 && recent && cooled;
  });
  if (!pickable.length) return;
  const pick = pickable.sort(() => Math.random() - 0.5)[0];
  // 五类支线分别判资格（她定的）：兴趣=熟人+近期互动；家庭=朋友；过去=朋友+多次互动；
  // 友情/烦恼=有近期真实互动
  const tier = REL_TIER[pick.p.relation ?? "陌生"] ?? 1;
  const eventCount = pick.p.events?.length ?? 0;
  const lastEventAt = eventCount ? (pick.p.events?.[eventCount - 1]?.at ?? 0) : 0;
  const recent = eventCount > 0 && now - lastEventAt < 14 * 864e5;
  const kinds: BranchType[] = [];
  if (tier >= 3 && recent) kinds.push("interest");
  if (tier >= 4) kinds.push("family");
  if (tier >= 4 && eventCount >= 2) kinds.push("past");
  if (recent) kinds.push("friendship");
  if (tier >= 4 || recent) kinds.push("worry");
  if (!kinds.length) return; // 不够资格就别硬开
  const type = kinds[Math.floor(Math.random() * kinds.length)];
  const rec: BranchRecord = { charId: pick.n.charId!, type, active: true, startedAt: now, lastAt: now, firedCount: 0, history: [] };
  save({ branches: [...s.branches, rec] });
  fireBranchOpening(rec, type, chars.find(c => c.id === pick.n.charId));
}

const OPENING: Record<BranchType, (name: string, history: string) => { title: string; place: string; premise: string }> = {
  interest: (name) => ({
    title: `和${name}出去`, place: "弘大",
    premise: `${name}约她一起参与自己的爱好（按她真实的兴趣爱好来：漫展、拍照、唱片店都行）。活动进日历，当天通过「此刻」展开；她可以接受或拒绝。不要求一次介绍完所有爱好，可以分多次慢慢了解。`,
  }),
  family: (name) => ({
    title: `${name}的家人`, place: "汉江公园",
    premise: `她逐渐接触到${name}的家庭生活：可能是聊天里提到家人、有家人来首尔看她、或偶然遇见她的姐妹。必须符合已有的家庭背景；不强制制造家庭矛盾；她愿意透露多少按性格和关系决定。`,
  }),
  past: (name) => ({
    title: `和${name}聊天`, place: "宿舍",
    premise: `她逐渐知道${name}成为练习生之前的生活：以前的学校、从前的朋友、家乡、为什么决定当练习生。不要求每个人都有重大秘密；可以分多次展开，不一次讲完整个人生；不擅自推翻已有的身份背景。`,
  }),
  friendship: (name) => ({
    title: `和${name}之间`, place: "公司 练习室",
    premise: `她最近和${name}的关系发生了真实的变化（按实际经历写：更亲近、因某次共同经历更了解、有误会、或发现对彼此的印象不准确）。关系变化必须有实际经历支撑；不预设所有矛盾都会和解；她怎么回应由她自己决定。`,
  }),
  worry: (name) => ({
    title: `${name}最近`, place: "公司 天台",
    premise: `${name}最近遇到了值得在意的生活或事业变化（训练状态、未来的犹豫、朋友间的问题、家里的变化、某个现实选择）。她可能听她主动提起，也可能相处中逐渐发现；不强制她帮忙，不默认她能解决；同期可以自己处理自己的生活。`,
  }),
};

/** 开一条支线（她定的三入口之一：KKT——人物自己主动聊起/邀约；她答应了才进日历） */
function fireBranchOpening(rec: BranchRecord, type: BranchType, char?: Character): void {
  const name = char?.name ?? "一位同期";
  const history = rec.history.slice(-3).map(h => h.text).join("；");
  const o = OPENING[type](name, history);
  void import("./idol-reminders").then(m => {
    m.queueMessage(rec.charId, `关于${name}的「${BRANCH_LABEL[type]}」支线。按你的性格和跟她的关系，在 KakaoTalk 上自然地聊起或约她：${o.premise} 别念设定、别硬塞话题；她回应了你再往下接。如果约了具体时间地点，按正常邀约发，她没答应就当没约成。`, 5 * 60e3);
  }).catch(() => undefined);
}

/** 此刻场景的提示：这场如果合适，可以自然带出哪条同期支线（她定的三入口之一：此刻偶遇） */
export function branchSceneHint(): string {
  const s = load();
  const active = s.branches.filter(b => b.active && b.firedCount === 0 && b.charId);
  if (!active.length) return "";
  const chars = loadCharacters();
  const lines: string[] = [];
  for (const b of active) {
    const c = chars.find(x => x.id === b.charId);
    const p = loadProfiles()[b.charId!];
    if (!c || !p?.met) continue;
    const o = OPENING[b.type](c.name, b.history.slice(-3).map(h => h.text).join("；"));
    lines.push(`- ${c.name}（${BRANCH_LABEL[b.type]}）：${o.premise}`);
  }
  if (!lines.length) return "";
  return `【同期支线】这一场如果合适，可以自然带出下面某位同期的个人故事。她出场了再演，没出场就不提；提了也别一次讲完，点到为止，往后的场次接着展开：\n${lines.join("\n")}`;
}

/** 让支线人物更容易出现在「可能碰上的人」里（正在开的故事优先） */
export function activeBranchCharIds(): string[] {
  try { return load().branches.filter(b => b.active && b.firedCount === 0 && b.charId).map(b => b.charId!); } catch { return []; }
}

/** 支线人物这场在场且戏里真的展开了他的故事（总结里有他）：这条支线告一段落（记历史、腾名额）；
 *  普通擦肩、打个招呼不算（她反馈/审计：同场不等于结线） */
export function branchSceneEnded(presentIds: string[], summary: string): void {
  const s = load();
  const chars = loadCharacters();
  let changed = false;
  for (const b of s.branches) {
    if (!b.active || b.firedCount !== 0 || !b.charId) continue;
    if (!presentIds.includes(b.charId)) continue;
    const name = chars.find(c => c.id === b.charId)?.name;
    if (!name || !(summary ?? "").includes(name)) continue;
    b.active = false;
    b.firedCount = 1;
    b.lastAt = Date.now();
    b.history = [...b.history.slice(-19), { at: Date.now(), text: summary || "她的故事在相处里自然展开了" }];
    changed = true;
  }
  if (changed) save(s);
}

/** 支线节点完成：记结果（延续优先）、这条线告一段落，腾出活跃名额 */
export function branchNodeDone(charId: string, type: BranchType, summary: string): void {
  const s = load();
  const rec = s.branches.find(b => b.charId === charId && b.type === type);
  if (!rec) return;
  save({
    branches: s.branches.map(b => b === rec
      ? { ...b, active: false, lastAt: Date.now(), firedCount: b.firedCount + 1, history: [...b.history.slice(-19), { at: Date.now(), text: summary }] }
      : b),
  });
}

export function branchesState(): State { return load(); }
