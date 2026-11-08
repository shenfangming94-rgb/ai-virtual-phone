/**
 * 爱豆小手机：剧情池（第 4 块：课堂八类 + 固定生活剧情 + 条件生活剧情的统一引擎）。
 *
 * 规矩（她的设计，docs/idol/needs/）：代码判条件、代码定结果，AI 只演内容。
 * 状态：watching（条件没满）→ ready（条件满，等合适时机）→ done（已触发）。
 * 触发方式三种：
 * - class：挂在下课结算后面（settleClassScene 结算完问一句「有挂着的剧情吗」）
 * - date：到时间排成提醒事项节点 / KKT 通知（像主线那样）
 * - scene：她进入合适地点时（此刻）检查，这批先留给生活偶遇类
 *
 * 只在新存档（有名册）下跑。AI 直接开场，不等她打第一个字（她定的）。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCareer, saveCareer, addToCalendar, type CareerNode } from "./idol-career";
import { loadTraineeCard } from "./trainee-card";
import { loadProfiles, RELATIONS } from "./idol-people";
import { loadCharacters } from "./character-storage";
import { loadRoster, settlePlayerBonus, formatClassGain } from "./idol-roster-live";
import { fameTotal } from "./idol-fame";
import { loadGrades, type GradeView } from "./idol-starroad";
import { findLunar } from "./idol-calendar";
import { mainlineState } from "./idol-mainline";
import type { Character } from "./character-types";
import type { RosterState } from "./idol-roster";

const KEY = "idol_plots_v1";
const DAY = 864e5;

export type PlotState = "watching" | "ready" | "done";
export type PlotHook = "class" | "date" | "scene";

export type PlotRecord = {
  key: string;
  state: PlotState;
  firedCount: number;
  lastFiredAt?: number;
  /** 竞争机会这类：历史课程、连败记录、上次结果等 */
  extra?: Record<string, unknown>;
};

export type PlotCtx = {
  now: number;
  roster: RosterState | null;
  career: ReturnType<typeof loadCareer>;
  profiles: Record<string, ReturnType<typeof loadProfiles>[string]>;
  characters: Character[];
  fame: number;
  grades: GradeView[];
  attendedCount: number;
  signedDays: number;
};

export type PlotFireResult = { premise: string; node?: CareerNode; done?: boolean; /** 打给她看的数字行（竞争获胜） */ gain?: string };

export type PlotDef = {
  key: string;
  title: string;
  hook: PlotHook;
  /** 最多触发次数；null = 随真实事件不设上限 */
  max: number | null;
  check(ctx: PlotCtx, rec: PlotRecord): boolean;
  /** 条件满足了干什么：返回要演的开场（class/scene）或要排的日程（date） */
  fire(ctx: PlotCtx, rec: PlotRecord): Promise<PlotFireResult> | PlotFireResult;
};

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function load(): Record<string, PlotRecord> {
  try { return JSON.parse(kvGet(KEY) || "{}") as Record<string, PlotRecord>; } catch { return {}; }
}
function save(all: Record<string, PlotRecord>) { kvSet(KEY, JSON.stringify(all)); }

/** 当前剧情池记录（缺的补成 watching） */
export function plotRecords(): Record<string, PlotRecord> {
  const all = load();
  for (const d of PLOTS) if (!all[d.key]) all[d.key] = { key: d.key, state: "watching", firedCount: 0 };
  return all;
}

export function plotRecord(key: string): PlotRecord | null {
  return plotRecords()[key] ?? null;
}

function ctx(): PlotCtx {
  const roster = loadRoster();
  const career = loadCareer();
  const marks = roster ? null : null;
  void marks;
  let attended = 0;
  try {
    const s = JSON.parse(kvGet("idol_starroad_v1") || "null");
    attended = (s?.marks ?? []).filter((m: { status?: string }) => m.status === "attend" || m.status === "official").length;
  } catch { /* 没有星路状态就不算课数 */ }
  return {
    now: Date.now(),
    roster,
    career,
    profiles: loadProfiles(),
    characters: loadCharacters(),
    fame: fameTotal(),
    grades: loadGrades(),
    attendedCount: attended,
    signedDays: career.signedAt ? Math.max(0, Math.floor((Date.now() - career.signedAt) / DAY)) : 0,
  };
}

/** 找一天不被占的：避开周评/月考/主线/已答应的约会机会活动（她反馈撞车）。向后顺延最多 14 天，实在不行就用原时间 */
function plotFreeDay(at: number): number {
  const career = loadCareer();
  const official = new Set(["weekly", "monthly", "makeup", "selection", "debut", "talk", "date", "chance", "event"]);
  const blocked = (t: number) => {
    const d = new Date(t);
    return career.nodes.some(n => official.has(n.kind) && (n.status === "pending" || n.status === "invite")
      && (() => { const x = new Date(n.dueAt); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); })());
  };
  if (!blocked(at)) return at;
  for (let i = 1; i <= 14; i++) {
    const t = at + i * DAY;
    if (!blocked(t)) return t;
  }
  return at;
}

/** 排一个 date 类剧情的日程节点（走现有通知/日历/三结局） */
function schedulePlotNode(title: string, place: string, premise: string, at: number): CareerNode {
  const career = loadCareer();
  const node: CareerNode = {
    id: uid("plot"), kind: "event", title, place, premise, dueAt: plotFreeDay(at), status: "pending",
    companyId: career.companyId, occasion: "plot",
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  addToCalendar(node);
  return node;
}

/** 排一个「有人约她」的剧情：真发 KKT 问她，她答应了才进日历（她定的） */
function scheduleInvitePlot(title: string, place: string, premise: string, at: number, from: { id: string; name: string }, ask: string): CareerNode {
  const career = loadCareer();
  const safe = plotFreeDay(at);
  const node: CareerNode = {
    id: uid("plot"), kind: "date", title, place, premise, dueAt: safe, status: "invite",
    companyId: career.companyId, occasion: "plot", from: from.name, fromId: from.id,
    replyBy: Math.max(safe - 3 * 3600e3, Date.now() + 3600e3),
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  void import("./idol-reminders").then(m => m.queueMessage(from.id, ask, (20 + Math.random() * 60) * 60e3, { node, dedupeKey: `plot_invite_${node.id}` })).catch(() => undefined);
  return node;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmtMD = (ms: number) => `${new Date(ms).getMonth() + 1}月${new Date(ms).getDate()}日`;

/** 低频 NPC 恋爱配对：在同期里挑一个有实际交集的人，配一个恋人（另一位同期或公司外的人）。
 *  情缘六线的候选男主不在这池里（他们不参与 NPC 自动恋爱配对，她定的）。 */
function maybePairRomance(c: PlotCtx, rec: PlotRecord): { charId: string; partner: string; since: number }[] {
  if (Math.random() >= 0.35) return [];
  const npcs = (c.roster?.npcs ?? []).filter(n => n.charId);
  const pool = npcs.filter(n => {
    const p = c.profiles[n.charId!];
    if (!p) return false;
    return p.met || (p.events?.length ?? 0) > 0 || (p.leave?.log?.length ?? 0) > 0;
  }).sort(() => Math.random() - 0.5);
  const pick = pool[0];
  if (!pick?.charId) return [];
  const partnerNpc = npcs.find(n => n.charId && n.charId !== pick.charId && c.profiles[n.charId] && Math.random() < 0.4);
  const partner = partnerNpc?.charId
    ? (c.characters.find(x => x.id === partnerNpc.charId)?.name ?? "另一位练习生")
    : Math.random() < 0.5 ? "公司里的另一个人" : "公司外认识的人";
  return [{ charId: pick.charId, partner, since: c.now }];
}

// ── 触发检查 ──

/** 查一遍条件：条件满的进 ready。返回新进 ready 的 key 列表 */
export function plotTick(): string[] {
  const all = plotRecords();
  const c = ctx();
  const became: string[] = [];
  for (const d of PLOTS) {
    const rec = all[d.key];
    if (d.max == null) {
      // 每年类（生日/樱花/初雪）：去年触发过的，条件重新成立前先回 watching
      if (rec.state === "done") {
        try { if (!d.check(c, rec)) all[d.key] = { ...load()[d.key] ?? rec, state: "watching" }; } catch { /* 一条出错不挡别的 */ }
        continue;
      }
      if (rec.state === "watching") {
        try {
          if (d.check(c, rec)) { all[d.key] = { ...load()[d.key] ?? rec, state: "ready" }; became.push(d.key); }
          else all[d.key] = load()[d.key] ?? rec; // check 里可能写了 extra（比如被调离的班级快照）
        } catch { /* 一条出错不挡别的 */ }
      }
      continue;
    }
    if (rec.state !== "watching") {
      // 多段剧情（竞争同一个机会 2~3 次这类）：没到上限的回 watching，条件再满足会再来（她定的次数）
      if (rec.firedCount < d.max) all[d.key] = { ...load()[d.key] ?? rec, state: "watching" };
      continue;
    }
    if (rec.firedCount >= d.max) continue;
    try {
      if (d.check(c, rec)) {
        all[d.key] = { ...load()[d.key] ?? rec, state: "ready" };
        became.push(d.key);
      }
    } catch { /* 一条出错不挡别的 */ }
  }
  save(all);
  return became;
}

/** 上课管线问的：有没有 ready 的 class 类剧情；有就触发它并返回开场 */
export async function takeClassPlot(): Promise<{ key: string; premise: string; gain?: string } | null> {
  const all = plotRecords();
  const mi = all["missed_invite"]?.extra as { mentionAfter?: number; mention?: string } | undefined;
  if (mi?.mention && Date.now() >= (mi.mentionAfter ?? 0)) {
    all["missed_invite"] = { ...all["missed_invite"], extra: {} };
    save(all);
    return { key: "missed_invite", premise: mi.mention };
  }
  const c = ctx();
  for (const d of PLOTS) {
    if (d.hook !== "class" || d.key === "intro_new_trainee") continue;
    const rec = all[d.key];
    if (rec.state !== "ready") continue;
    try {
      const r = await d.fire(c, rec);
      if (!r) continue;
      // fire 里可能已经写了 extra（比如竞争机会的历史课程）：以最新的为准
      const fresh = load()[d.key] ?? rec;
      all[d.key] = { ...fresh, state: "done", firedCount: fresh.firedCount + 1, lastFiredAt: Date.now() };
      save(all);
      return { key: d.key, premise: r.premise, ...(r.gain ? { gain: r.gain } : {}) };
    } catch { /* 这条触发失败，留给下一节 */ }
  }
  return null;
}

/** 此刻开场景/下课结算时问的：有没有 ready 的 scene 类剧情；有就触发并返回开场（她在哪都衔接，比如初雪） */
export function takeScenePlot(): { key: string; premise: string } | null {
  const all = plotRecords();
  const c = ctx();
  for (const d of PLOTS) {
    if (d.hook !== "scene") continue;
    const rec = all[d.key];
    if (rec.state !== "ready") continue;
    // 就绪后再核一次条件：窗口过了的就退回 watching，别把上季度的剧情接到这一场
    try {
      if (!d.check(c, rec)) {
        all[d.key] = { ...load()[d.key] ?? rec, state: "watching" };
        save(all);
        continue;
      }
    } catch { continue; }
    try {
      const r = d.fire(c, rec) as PlotFireResult;
      if (!r?.premise) continue;
      const fresh = load()[d.key] ?? rec;
      all[d.key] = { ...fresh, state: "done", firedCount: fresh.firedCount + 1, lastFiredAt: Date.now() };
      save(all);
      return { key: d.key, premise: r.premise };
    } catch { /* 这条留给下一次 */ }
  }
  return null;
}

/** 第一次进练习室的前置剧情：还没介绍过且一节课都没上过 → 返回开场，不返回 null 表示这次课要前置演 */
export function takeIntroPremise(): { premise: string } | null {
  const rec = plotRecords()["intro_new_trainee"];
  if (!rec || rec.state !== "watching" || rec.firedCount > 0) return null;
  const c = ctx();
  if (c.attendedCount > 0) return null;
  try {
    const d = PLOTS.find(x => x.key === "intro_new_trainee")!;
    const r = d.fire(c, rec) as PlotFireResult;
    if (!r?.premise) return null;
    return { premise: r.premise };
  } catch { return null; }
}

/** 第一次课的介绍演完了：记成已触发 */
export function markIntroDone(): void {
  const all = plotRecords();
  const rec = all["intro_new_trainee"];
  if (rec && rec.state !== "done") {
    all["intro_new_trainee"] = { ...rec, state: "done", firedCount: rec.firedCount + 1, lastFiredAt: Date.now() };
    save(all);
  }
}

/** date 类剧情：到条件的（比如满 X 天、到了某日期）直接排日程 */
export function plotDateTick(): string[] {
  const all = plotRecords();
  const c = ctx();
  const fired: string[] = [];
  for (const d of PLOTS) {
    if (d.hook !== "date") continue;
    const rec = all[d.key];
    if (rec.state !== "ready") continue;
    try {
      const r = d.fire(c, rec) as PlotFireResult;
      if (!r || (!r.node && !r.done)) continue;
      // fire 里可能写了 extra（没被邀请的聚会要下课聊起）：以最新的为准
      const fresh = load()[d.key] ?? rec;
      all[d.key] = { ...fresh, state: "done", firedCount: rec.firedCount + 1, lastFiredAt: Date.now() };
      fired.push(d.key);
    } catch { /* 下次再试 */ }
  }
  save(all);
  return fired;
}

/** 课堂随机剧情的课程历史（竞争机会用：每门课只用一次） */
export function usedCompeteSubjects(): string[] {
  const rec = plotRecords()["compete"];
  return (rec?.extra?.subjects as string[]) ?? [];
}

// ── 剧情定义 ──

function rivalsOf(c: PlotCtx): { charId: string; name: string }[] {
  const ids = new Set(Object.keys(c.profiles));
  const out: { charId: string; name: string }[] = [];
  for (const n of c.roster?.npcs ?? []) {
    if (n.charId && ids.has(n.charId)) {
      const p = c.profiles[n.charId];
      if (p && !/离开|退社/.test(p.status?.text ?? "")) out.push({ charId: n.charId, name: n.name });
    }
  }
  return out;
}

export const PLOTS: PlotDef[] = [
  {
    // 特殊：第一次进练习室的前置剧情（startClassScene 里专门处理，不走进课后剧情池）
    key: "intro_new_trainee", title: "老师介绍新练习生", hook: "class", max: 1,
    check(c) { return c.attendedCount >= 1 && c.signedDays < 30; },
    fire(c) {
      const her = loadTraineeCard()?.name ?? "你";
      return {
        premise: `这是${her}进公司后第一次进练习室上课：老师向 C 班的同期们介绍新来的练习生${her}，其他同期之前就互相认识。老师怎么介绍、同期怎么回应，按各自的性格来；介绍完自然衔接当天剩下的课程内容。`,
      };
    },
  },
  {
    key: "fame_chat", title: "同期议论人气", hook: "class", max: 1,
    check(c) { return c.fame >= 30 && c.attendedCount >= 3; },
    fire(c) {
      return {
        premise: `下课后，几位同期在议论她的人气和知名度。她们的态度按各自真实的性格、和她的关系、以及她真实经历过的事来写（比如她参加过什么、哪段视频出圈、关注度到了哪一档），可以是欣赏、羡慕、不服气、质疑人气和实力匹不匹配，也可以几种态度同时存在；议论要有实际依据，不凭空编她没经历过的作品或争议。`,
      };
    },
  },
  {
    key: "clique", title: "小团体事件", hook: "class", max: 1,
    check(c) {
      const prof = Object.values(c.profiles);
      if (!prof.some(p => p.relation === "不喜欢你" || p.relation === "跟你过不去")) return false;
      const good = prof.filter(p => p.relation === "好朋友").length;
      return true; // 分支在 fire 里按好朋友数选
    },
    fire(c) {
      const prof = Object.values(c.profiles);
      const hater = prof.find(p => p.relation === "不喜欢你" || p.relation === "跟你过不去");
      const good = prof.filter(p => p.relation === "好朋友").map(p => c.characters.find(x => x.id === p.charId)?.name).filter(Boolean);
      if (!hater) return { premise: "", done: true };
      const haterName = c.characters.find(x => x.id === hater.charId)?.name ?? "一个同期";
      if (good.length < 2) {
        return {
          premise: `某节课堂上，${haterName}联合跟她走得近的几个练习生，在分组、合作练习里有意孤立她。具体怎么孤立、参与的人什么态度、老师有没有察觉、她怎么应对，按真实关系和人设演；不替她决定反应。`,
        };
      }
      return {
        premise: `某节课结束后，她在洗手间偶然听见${haterName}正和她的朋友议论自己，说得不好听。她的好朋友${good.slice(0, 2).join("、")}也在场，听到了，出面反驳。反驳有没有效、之后怎么收场，按人设和关系演；不替她决定反应。`,
      };
    },
  },
  {
    key: "compete", title: "竞争同一个机会", hook: "class", max: 3,
    check(c) {
      if (c.signedDays < 30) return false;
      const subjects = usedCompeteSubjects();
      return subjects.length < 3 && rivalsOf(c).length >= 2;
    },
    fire(c) {
      const rec = plotRecords()["compete"];
      const used = usedCompeteSubjects();
      const pool = (["vocal", "dance", "rap", "compose", "acting", "variety", "language", "visual"] as const).filter(s => !used.includes(s));
      const subject = pool[Math.floor(Math.random() * pool.length)];
      const subjectLabel: Record<string, string> = { vocal: "声乐", dance: "舞蹈", rap: "Rap", compose: "创作", acting: "演技", variety: "综艺感", language: "语言", visual: "形象管理" };
      const chanceLabels: Record<string, string> = {
        vocal: "公司内部 Demo 的试唱名额", dance: "公司练习生公开视频的中心位置", rap: "前辈歌曲的临时 Rap 导唱机会",
        compose: "内部制作企划中的原创旋律采用机会", acting: "公司宣传短片的角色", variety: "公司练习生视频的主持位置",
        language: "海外宣传视频的外语介绍名额", visual: "公司练习生概念照的拍摄名额",
      };
      const rivals = rivalsOf(c).sort(() => Math.random() - 0.5);
      const rival = rivals[0];
      const her = c.roster?.player;
      // 代码判结果：她的该科数值 vs 对手，±随机；连续落选两场后保底赢（她的规矩）
      const lostBefore = ((rec?.extra?.streak as number) ?? 0);
      let win = false;
      if (her && rival && c.roster) {
        const npc = c.roster.npcs.find(n => n.charId === rival.charId);
        const herV = her.stats[subject] ?? 45;
        const npcV = npc?.stats[subject] ?? 45;
        const r = Math.random() * 8 - 4;
        win = lostBefore >= 2 ? true : herV + r > npcV;
      } else {
        win = lostBefore >= 2;
      }
      const streak = win ? 0 : lostBefore + 1;
      const all = load();
      all.compete = {
        ...(all.compete ?? { key: "compete", state: "watching", firedCount: 0 }),
        extra: { subjects: [...used, subject], streak },
      };
      save(all);
      let gain: string | undefined;
      if (win) {
        try {
          const g = settlePlayerBonus(subject, 1.5);
          if (g) gain = `🏆 拿下了机会 · ${formatClassGain(subjectLabel[subject], g)}`;
        } catch { /* 结算失败不影响剧情 */ }
      }
      return {
        gain,
        premise: `老师宣布了一个机会：${chanceLabels[subject]}。竞争者包括她和${rival?.name ?? "一位同期"}，围绕${subjectLabel[subject]}这个方向的实力来争。结果是代码定的：${win ? `她拿下了这个机会（按她的实际表现写，不夸大）` : `机会给了${rival?.name ?? "对方"}（写清楚对方哪方面更合适，不贬低她）`}。按这个结果把这场戏演出来，含报名/考核/公布的过程。`,
      };
    },
  },
  {
    key: "hidden_talent", title: "隐藏天赋被发掘", hook: "class", max: 1,
    check(c) {
      const talents = loadTraineeCard()?.talents ?? [];
      // 非开局特长、从 D 一路升到 B 的科目；新档成绩单没有 last 记录，按「现在就是 B」认
      return c.grades.some(g => !talents.includes(g.id) && g.grade === "B" && (g.last?.dir === "up" || !g.last));
    },
    fire(c) {
      const talents = loadTraineeCard()?.talents ?? [];
      const g = c.grades.find(x => !talents.includes(x.id) && x.grade === "B" && (x.last?.dir === "up" || !x.last));
      if (!g) return { premise: "", done: true };
      return {
        premise: `${g.zh}课的老师注意到，她在一个原本并不突出的领域取得了明显突破（这门不是她开局的特长，从 D 一路练到了 B）。老师怎么发现、怎么评价、课堂里其他人什么反应，按她过去的训练经历写具体一点；不保证后面一定有资源。`,
      };
    },
  },
  {
    key: "senior_visit", title: "女团师姐听课", hook: "class", max: 1,
    check(c) {
      if (c.signedDays < 60) return false;
      // 公司旗下有已出道女团（rosterPrompt 里有团就行；这里放宽：有任意女团档案）
      try {
        const groups = JSON.parse(kvGet("idol_groups_v1") || "{}") as Record<string, { kind?: string }>;
        return Object.values(groups).some(g => g.kind === "女团" || g.kind?.includes("女"));
      } catch { return false; }
    },
    fire(c) {
      return {
        premise: `某节声乐/舞蹈/Rap 课上，公司旗下已出道女团的成员来旁听（公司实际有的女团里挑一个）。她可能观察训练、跟老师交流、或亲自指导几个练习生。她注意到谁不保证是她——按在场的人的真实表现筛，不为了突出她强行只关注她；也可以指出不足。`,
      };
    },
  },
  {
    key: "girls_stage", title: "女同期合作舞台", hook: "class", max: 1,
    check(c) {
      if (c.signedDays < 45) return false;
      const rivals = rivalsOf(c).filter(r => {
        const p = c.profiles[r.charId];
        return p && /练习生|同期/.test(`${p.role}${p.group}`);
      });
      return rivals.length >= 2;
    },
    fire(c) {
      const same = rivalsOf(c).filter(r => /练习生|同期/.test(`${c.profiles[r.charId]?.role}${c.profiles[r.charId]?.group}`)).sort(() => Math.random() - 0.5);
      const picked = same.slice(0, 2 + Math.floor(Math.random() * 3));
      const names = picked.map(r => r.name).join("、");
      // 定稿三个连续阶段：公布分组（这一场）→ 排练 → 正式表演，后两个排成日程节点
      const rehearsalAt = plotFreeDay(Date.now() + 3 * DAY);
      schedulePlotNode("合作舞台排练", "公司 练习室", `她和${names}为小组合作表演排练（按实际情况演，不跳过排练过程）。`, rehearsalAt);
      const stageAt = plotFreeDay(rehearsalAt + 4 * DAY);
      schedulePlotNode("合作舞台演出", "公司 大练习室", `小组合作表演正式演出：她和${names}登台。按排练时的真实情况演，演出结果按实际表现，不夸大。`, stageAt);
      return {
        premise: `声乐课/舞蹈课上，老师宣布公司要安排一次练习生小组合作表演（女同期小组，和 8 月主线的男女合作舞台是两回事）。她和${names}分到一组。这一场先演公布和分组：成员之间真实的亲疏关系、谁开心谁有意见，都按人设来；排练和正式演出已经排进提醒事项，之后一场一场演。`,
      };
    },
  },
  // ── 课堂八类剩下的两个（挂在月考换血上：班级真实变动才触发）──
  {
    key: "promote_demote", title: "升降班", hook: "class", max: null,
    check(c, rec) {
      const last = (rec.extra?.lastKlass as string) ?? "C";
      return Boolean(c.roster) && c.roster!.player.klass !== last;
    },
    fire(c, rec) {
      const klass = c.roster?.player.klass ?? "C";
      const last = (rec.extra?.lastKlass as string) ?? "C";
      const up = klass < last; // A<B<C<D
      const all = load();
      all["promote_demote"] = { ...(all["promote_demote"] ?? rec), extra: { ...(rec.extra ?? {}), lastKlass: klass } };
      save(all);
      return {
        premise: `某节课上，老师宣布她${up ? `升到 ${klass} 班` : `降到 ${klass} 班`}（月考后的班级调整结果，代码定的）。宣布方式、在场同期的反应、升班后的新环境或降班后的处境，按真实关系和人设演；老师提她表现时，说她这个月真实的情况（上课、加练、考核），不报分数和档位。`,
      };
    },
  },
  {
    key: "moved_out", title: "被调离的同期", hook: "class", max: null,
    check(c, rec) {
      if (!c.roster) return false;
      const cur: Record<string, string> = {};
      for (const n of c.roster.npcs) if (n.charId) cur[n.charId] = n.klass;
      const snap = rec.extra?.klasses as Record<string, string> | undefined;
      if (!snap) {
        const all = load();
        all["moved_out"] = { ...(all["moved_out"] ?? rec), extra: { ...(rec.extra ?? {}), klasses: cur } };
        save(all);
        return false;
      }
      return Object.entries(cur).some(([id, k]) => snap[id] && snap[id] < k); // 降班才算
    },
    fire(c, rec) {
      const cur: Record<string, string> = {};
      for (const n of c.roster?.npcs ?? []) if (n.charId) cur[n.charId] = n.klass;
      const snap = (rec.extra?.klasses as Record<string, string>) ?? {};
      const moved = c.roster?.npcs.find(n => n.charId && snap[n.charId] && snap[n.charId] < n.klass);
      const name = moved?.charId ? c.characters.find(x => x.id === moved.charId)?.name : undefined;
      const all = load();
      all["moved_out"] = { ...(all["moved_out"] ?? rec), extra: { ...(rec.extra ?? {}), klasses: cur } };
      save(all);
      if (!name) return { premise: "", done: true };
      return {
        premise: `某节课上，老师宣布同期${name}即将离开当前班级（${snap[moved!.charId!]} 班 → ${moved!.klass} 班，月考后的调整，代码定的）。她可能是她的好朋友、竞争对手、关系不好的同期，也可能只是陌生人；她本人怎么反应、其他人怎么评价，按真实人设和关系演。调班不等于退社，她还在公司。`,
      };
    },
  },
  // ── 条件特殊生活剧情（6 类）──
  {
    key: "night_call", title: "深夜的秘密电话", hook: "scene", max: 1,
    check(c, rec) {
      const h = new Date(c.now).getHours();
      const night = h >= 22 || h <= 2;
      if (!night) return false;
      const friend = Object.values(c.profiles).some(p => (p.relation === "朋友" || p.relation === "好朋友" || p.relation === "暧昧" || p.relation === "恋人") && /练习生|同期/.test(`${p.role}${p.group}`));
      return friend;
    },
    fire(c) {
      const her = loadTraineeCard()?.name ?? "你";
      return {
        premise: `夜里，${her}偶然听见一位关系不错的同期在打电话（朋友及以上的同期里挑一个）。通话对象和内容按她真实的家庭背景、私人关系和当前生活状况决定：可能是和家人商量事情，也可能是朋友、生活安排或别的私人问题。不固定成家庭争吵，不强制对方正遭遇困难；她有没有发现被听见、之后怎么回应，按人物性格演；她可以选择问或不问。`,
      };
    },
  },
  {
    key: "missed_invite", title: "没有收到的邀请", hook: "date", max: 1,
    check(c) {
      const met = Object.values(c.profiles).filter(p => p.met && /练习生|同期/.test(`${p.role}${p.group}`));
      if (met.length < 5) return false;
      return c.roster?.npcs.some(n => n.friends.length > 0) ?? false;
    },
    fire(c) {
      const at = new Date(c.now + 2 * DAY); at.setHours(19, 0, 0, 0);
      const host = c.roster?.npcs.filter(n => n.charId && n.friends.length > 0).sort(() => Math.random() - 0.5)[0];
      const hostP = host?.charId ? c.profiles[host.charId] : undefined;
      if (!host?.charId || !hostP) throw new Error("没有合适的组织者，下次再试");
      const circle = host.friends.map(f => c.roster!.npcs.find(n => n.id === f.charId)?.name).filter(Boolean).join("、");
      const premise = `${host.name}和她的朋友圈（${circle || "几个关系好的同期"}）私下聚了一次。普通社交安排别写成排挤；真有故意排除她的行为，必须有真实关系支撑。`;
      const invited = RELATIONS.indexOf(hostP.relation as never) >= RELATIONS.indexOf("朋友");
      if (invited) {
        const career = loadCareer();
        const node: CareerNode = { id: uid("plot"), kind: "date", title: "同期私下聚会", place: "江南 咖啡店", premise, dueAt: at.getTime(), status: "invite", companyId: career.companyId, from: host.name, fromId: host.charId, occasion: "plot", replyBy: at.getTime() - 3 * 3600e3 };
        saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
        void import("./idol-reminders").then(m => m.queueMessage(host.charId!, `你们几个关系好的同期（${circle}）后天晚上七点在江南的咖啡店私下聚一下，你想叫上她。按你的性格在 KakaoTalk 上约她。`, (20 + Math.random() * 60) * 60e3, { node, dedupeKey: `plot_gather_${node.id}` })).catch(() => undefined);
        return { premise, node };
      }
      const all = load();
      all["missed_invite"] = { ...(all["missed_invite"] ?? { key: "missed_invite", state: "watching", firedCount: 0 }), extra: { mentionAfter: at.getTime() + 3 * 3600e3, mention: `下课后，几个同期聊起前几天${premise}她这才知道她们聚过，她当时没被叫上。怎么聊、她听到以后什么反应，按人物关系和性格演。` } };
      save(all);
      return { premise, done: true };
    },
  },
  {
    key: "mate_birthday", title: "同期生日聚会", hook: "date", max: null,
    check(c, rec) {
      const now = new Date(c.now);
      const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const last = rec.extra?.lastDay as string | undefined;
      if (last === `${now.getFullYear()}-${md}`) return false;
      const hit = c.roster?.npcs.find(n => n.birthday === md && n.charId && ["朋友", "好朋友", "暧昧", "恋人"].includes(c.profiles[n.charId]?.relation ?? ""));
      return Boolean(hit);
    },
    fire(c, rec) {
      const now = new Date(c.now);
      const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const hit = c.roster?.npcs.filter(n => n.birthday === md && n.charId && ["朋友", "好朋友", "暧昧", "恋人"].includes(c.profiles[n.charId]?.relation ?? ""));
      const birthdayNpc = hit?.[0];
      const name = birthdayNpc?.charId ? c.characters.find(x => x.id === birthdayNpc.charId)?.name ?? "一位同期" : "一位同期";
      const at = new Date(c.now); at.setHours(18, 0, 0, 0);
      if (at.getTime() < c.now) at.setTime(c.now + 60 * 60e3);
      const premise = `${name}生日：她可能主动邀请她参加聚会，也可能由她的其他朋友联系她一起准备惊喜。聚会地点、参与者按她真实的朋朋友圈决定；有没有惊喜按人设和安排来。她可以接受或拒绝；没参加，聚会也照常发生。不同同期的生日可以分别产生事件。`;
      let node: CareerNode;
      const birthdayId = birthdayNpc?.charId;
      if (birthdayId) {
        node = scheduleInvitePlot(`${name}的生日`, "江南 餐厅", premise, at.getTime(), { id: birthdayId, name }, `你今天生日，晚上在江南的餐厅和朋友们聚一下，想叫上她。按你的性格在 KakaoTalk 上约她。`);
      } else {
        node = schedulePlotNode(`${name}的生日`, "江南 餐厅", premise, at.getTime());
      }
      const all = load();
      all["mate_birthday"] = { ...(all["mate_birthday"] ?? rec), extra: { ...(rec.extra ?? {}), lastDay: `${now.getFullYear()}-${md}` } };
      save(all);
      return { premise: node.premise, node };
    },
  },
  {
    key: "mate_romance", title: "同期的秘密恋情", hook: "class", max: 1,
    check(c, rec) {
      const romances = (rec.extra?.romances as { charId: string; partner: string; since: number }[]) ?? [];
      // 低频发展：距上次检查约 30 个世界日才看一次
      const lastCheck = (rec.extra?.lastCheck as number) ?? 0;
      if (c.now - lastCheck > 30 * 864e5) {
        const all = load();
        all["mate_romance"] = { ...(all["mate_romance"] ?? rec), extra: { ...(rec.extra ?? {}), lastCheck: c.now, ...(romances.length ? {} : { romances: maybePairRomance(c, rec) }) } };
        save(all);
        return false;
      }
      if (!romances.length) return false;
      // 发现条件：当事同期和她有实际交集、恋情没公开
      const any = romances.some(r => {
        const p = c.profiles[r.charId];
        return p && (p.met || (p.events?.length ?? 0) > 0);
      });
      return any && rec.extra?.revealed !== true;
    },
    fire(c, rec) {
      const romances = (rec.extra?.romances as { charId: string; partner: string; since: number }[]) ?? [];
      const r = romances.find(x => c.profiles[x.charId] && (c.profiles[x.charId].met || (c.profiles[x.charId].events?.length ?? 0) > 0));
      const all = load();
      all["mate_romance"] = { ...(all["mate_romance"] ?? rec), extra: { ...(rec.extra ?? {}), revealed: true } };
      save(all);
      if (!r) return { premise: "", done: true };
      const name = c.characters.find(x => x.id === r.charId)?.name ?? "一位同期";
      const ways = ["她因为信任她，主动把自己的恋爱情况告诉了她", "她外出时碰巧遇见她和恋人在一起，或相处中察觉了情况", "另一位同期在聊天中提起相关信息（要区分真实事实和未经证实的猜测）"];
      const way = ways[Math.floor(Math.random() * ways.length)];
      return {
        premise: `她发现同期${name}有一段还没公开的恋情（${way}）。恋爱对象是${r.partner}。整段练习生阶段只触发这一次发现剧情；她的反应、之后怎么发展，按真实关系和人设演，不默认她会保密、揭露或参与。`,
      };
    },
  },
  {
    key: "roommate_left", title: "室友突然退社", hook: "class", max: null,
    check(c) {
      const roommates = c.career.roommates ?? [];
      return roommates.some(id => c.profiles[id]?.leave?.phase === "left");
    },
    fire(c, rec) {
      const roommates = c.career.roommates ?? [];
      const left = roommates.find(id => c.profiles[id]?.leave?.phase === "left");
      const name = left ? c.characters.find(x => x.id === left)?.name : "一位室友";
      const all = load();
      all["roommate_left"] = { ...(all["roommate_left"] ?? rec), extra: { ...(rec.extra ?? {}), handled: (rec.extra?.handled as string[] ?? []).concat(left ? [left] : []) } };
      save(all);
      if (!left) return { premise: "", done: true };
      return {
        premise: `她的室友${name}正式退社了，需要搬离练习生宿舍。剧情围绕：收拾个人物品、宿舍里的告别、其他室友的反应、她和这位室友的实际关系。退社原因要符合她的事业和个人经历（想走想留系统里真实发生的）；不强制伤感告别。`,
      };
    },
  },
  {
    key: "dayoff_invite", title: "休息日的临时邀约", hook: "date", max: null,
    check(c, rec) {
      const d = new Date(c.now);
      if (d.getDay() !== 0 && d.getDay() !== 6) return false;
      const last = rec.extra?.lastDay as string | undefined;
      const today = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (last === today) return false;
      const good = Object.values(c.profiles).filter(p => p.relation === "好朋友" && /练习生|同期/.test(`${p.role}${p.group}`));
      if (!good.length) return false;
      return !(c.career.nodes ?? []).some(n => (n.status === "pending" || n.status === "invite") && ["weekly", "monthly", "makeup", "selection", "debut", "talk", "event"].includes(n.kind) && new Date(n.dueAt).getDate() === d.getDate());
    },
    fire(c, rec) {
      const good = Object.values(c.profiles).filter(p => p.relation === "好朋友" && /练习生|同期/.test(`${p.role}${p.group}`)).map(p => c.characters.find(x => x.id === p.charId)).filter((x): x is NonNullable<typeof x> => Boolean(x));
      const inviter = good[Math.floor(Math.random() * good.length)];
      const who = inviter?.name ?? "一位好朋友";
      const kinds = ["逛街", "吃饭", "看电影", "去汉江", "逛唱片店"];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const d = new Date(c.now);
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 14, 0, 0);
      const premise = `${who}约她休息日一起出去（${kind}）。活动按邀请者的人设和兴趣来；她可以接受、拒绝或提出别的安排；已接受的活动进日历，当天通过「此刻」展开。可以自然重复，不规定整个存档只出现一次。`;
      const node = inviter
        ? scheduleInvitePlot(`和${who}出去`, "弘大", premise, at.getTime(), { id: inviter.id, name: who }, `你休息日想约她一起出去${kind}。按你的性格在 KakaoTalk 上约她，问问她想去哪儿。`)
        : schedulePlotNode(`和${who}出去`, "弘大", premise, at.getTime());
      const all = load();
      all["dayoff_invite"] = { ...(all["dayoff_invite"] ?? rec), extra: { ...(rec.extra ?? {}), lastDay: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` } };
      save(all);
      return { premise: node.premise, node };
    },
  },
  // ── 固定生活剧情（date 类）──
  {
    key: "dorm_shuffle", title: "宿舍重新分配", hook: "date", max: 1,
    check(c) { return c.signedDays >= 90; },
    fire(c) {
      const roommates = (c.career.roommates ?? []).map(id => c.characters.find(x => x.id === id)?.name).filter(Boolean);
      const roll = Math.random();
      const result = roll < 0.4 ? "维持原状：她和原室友都不用搬，大家一起看分配名单、聊几句" : roll < 0.8 ? "部分调整：有室友搬走或有新室友搬进来" : "重新分配：她被安排到其他房间";
      const at = new Date(c.now + 2 * DAY); at.setHours(15, 0, 0, 0);
      const node = schedulePlotNode("宿舍重新分配", "宿舍", `入社满三个月，公司调整宿舍安排。结果（代码定的）：${result}。按这个结果演：看分配名单、整理行李、告别或认识室友。现在跟她同住的：${roommates.join("、") || "还没定"}\n（结果：${result}）`, at.getTime());
      return { premise: node.premise, node };
    },
  },
  {
    key: "outing", title: "练习生集体外出", hook: "date", max: 1,
    check(c) { return c.signedDays >= 60; },
    fire(c) {
      const kinds = ["游乐园", "海边旅行", "郊游", "野餐"];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const at = new Date(c.now + 3 * DAY); at.setHours(10, 0, 0, 0);
      const node = schedulePlotNode("练习生集体外出", "汉江公园", `公司安排部分练习生集体外出（${kind}）：提前通知、到当天一起出发。参与的人按公司安排，同期之间按真实关系互动，可以认识之前不熟的同期；不强制发生矛盾或友情升温。`, at.getTime());
      return { premise: node.premise, node };
    },
  },
  {
    key: "my_birthday", title: "我的生日", hook: "date", max: null,
    check(c, rec) {
      const bd = loadTraineeCard()?.birthday; // YYYY-MM-DD
      if (!bd || bd.length < 10) return false;
      const now = new Date(c.now);
      if ((rec.extra?.lastYear as number) === now.getFullYear()) return false;
      const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      return bd.slice(5) === md;
    },
    fire(c, rec) {
      const good = Object.values(c.profiles).filter(p => p.relation === "好朋友").map(p => c.characters.find(x => x.id === p.charId)?.name).filter(Boolean);
      const her = loadTraineeCard()?.name ?? "你";
      const branch = good.length >= 3
        ? `几位好朋友（${good.slice(0, 3).join("、")}等）给${her}过生日：可能秘密筹备聚会，也可能提前告诉她。聚会地点、参与的人、有没有惊喜，按各自性格和真实关系演；同一天最多一场主要的同期庆祝。`
        : good.length >= 1
          ? `好朋友${good.slice(0, 2).join("、")}单独约${her}出去玩或小范围庆祝生日（吃饭、逛街、看电影都行），按关系和人设演。`
          : `不强制安排生日聚会；认识她的同期（尤其是熟人和朋友）可能通过 KKT 送来生日祝福，谁来、说什么，按真实关系和人设决定。`;
      const at = new Date(c.now); at.setHours(18, 0, 0, 0);
      if (at.getTime() < c.now) at.setTime(c.now + 2 * 60e3 * 60);
      const node = schedulePlotNode("我的生日", "宿舍", `${her}的生日。${branch}`, at.getTime());
      const all = load();
      all["my_birthday"] = { ...(all["my_birthday"] ?? rec), extra: { ...(rec.extra ?? {}), lastYear: new Date(c.now).getFullYear() } };
      save(all);
      return { premise: node.premise, node };
    },
  },
  {
    key: "first_long_holiday", title: "第一次放长假", hook: "date", max: 1,
    check(c) {
      const now = new Date(c.now);
      const y = now.getFullYear();
      const spring = findLunar(y, "正月", "初一", [0, 15], [1, 25]);
      const autumn = findLunar(y, "八月", "十五", [8, 1], [9, 15]);
      const today = `${y}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      return today === spring || today === autumn;
    },
    fire(c) {
      const now = new Date(c.now);
      const isSpring = now.getMonth() <= 2;
      const at = new Date(c.now); at.setHours(19, 0, 0, 0);
      const node = schedulePlotNode("放长假", "宿舍", `公司放${isSpring ? "春节" : "中秋"}假（连续几天）。不同同期各有安排：回家探亲、留在首尔、和朋友外出、忙自己的事，都按她们的家庭背景、居住地和日程来。她怎么过，由她自己决定；放假前后的生活情境在「此刻」演出来。`, at.getTime());
      return { premise: node.premise, node };
    },
  },
  {
    key: "family_dinner", title: "年末家族聚餐", hook: "date", max: 1,
    check(c) {
      const ml = mainlineState().find(n => n.key === "family_concert");
      return ml?.state === "done";
    },
    fire(c) {
      const at = new Date(c.now + DAY); at.setHours(19, 0, 0, 0);
      const node = schedulePlotNode("公司年末聚餐", "江南 烤肉店", `年末家族演唱会结束后，公司组织年末聚餐：女练习生、男练习生、出道的前辈、老师、工作人员都可能在场（不要求全部到）。具体座位、互动、谈话按真实人物和关系演；之前在课堂或活动里认识的前辈可以自然再出现。不预设冲突或表白。`, at.getTime());
      return { premise: node.premise, node };
    },
  },
  {
    key: "sakura", title: "春日樱花季", hook: "scene", max: null,
    check(c, rec) {
      const sy = c.career.signedAt ? new Date(c.career.signedAt).getFullYear() : 0;
      const now = new Date(c.now);
      if ((rec.extra?.lastYear as number) === now.getFullYear()) return false;
      const inWindow = (now.getMonth() === 2 && now.getDate() >= 20) || (now.getMonth() === 3 && now.getDate() <= 10);
      return now.getFullYear() === sy + 1 && inWindow;
    },
    fire(c, rec) {
      const all = load();
      all["sakura"] = { ...(all["sakura"] ?? rec), extra: { ...(rec.extra ?? {}), lastYear: new Date(c.now).getFullYear() } };
      save(all);
      return { premise: `首尔樱花开了。接在她现在这一场里，按她此刻在哪、跟谁在一起来展开：好朋友可能 KKT 约她赏樱、某位同期临时约她出门、她在外面偶然看到樱花或遇见熟悉的人、或训练间隙经过一段春日场景。不固定邀请者和同行的人，不强制她做什么。` };
    },
  },
  {
    key: "rainstorm", title: "夏日暴雨", hook: "scene", max: 1,
    check(c) {
      const sy = c.career.signedAt ? new Date(c.career.signedAt).getFullYear() : 0;
      const now = new Date(c.now);
      const inWindow = (now.getMonth() === 6 && now.getDate() >= 20) || (now.getMonth() === 7 && now.getDate() <= 31);
      return now.getFullYear() === sy && inWindow;
    },
    fire(c, rec) {
      // 定稿：暴雨发生在真实强降雨那天（历史天气挑的）。没算出来就先异步算着，今天不是雨天就不演
      const stormAt = (rec.extra?.stormAt as number | undefined);
      if (stormAt == null) {
        if (!(rec.extra?.finding as boolean)) {
          const year = new Date(c.career.signedAt ?? Date.now()).getFullYear();
          const from = new Date(year, 6, 20);
          const to = new Date(year, 7, 31);
          const mark = (patch: Record<string, unknown>) => {
            const all = load();
            const cur = all["rainstorm"] ?? rec;
            all["rainstorm"] = { ...cur, extra: { ...(cur.extra ?? {}), ...patch, finding: false } };
            save(all);
          };
          void import("./idol-weather").then(m => m.findRainyDayInRange(from, to))
            .then(day => mark({ stormAt: day?.at ?? 0 }))
            .catch(() => mark({}));
          mark({ finding: true });
        }
        return { premise: "" };
      }
      if (!stormAt) return { premise: "" }; // 整个窗口没有真实雨天：这条不演
      const now = new Date(c.now);
      const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
      if (!same(new Date(stormAt), now)) return { premise: "" };
      return { premise: `首尔今天下起暴雨（按真实天气）。接在她现在这一场里，按她此刻的位置、在做什么、同行的人来展开：下课后被雨困住、和同期或朋友找地方避雨、原本的安排受影响、或在路上遇到一段突如其来的雨天故事。不预设情感发展，不为了触发事件强行改变她的位置。` };
    },
  },
  {
    key: "music_festival", title: "秋季大学音乐节", hook: "date", max: 1,
    check(c) {
      const sy = c.career.signedAt ? new Date(c.career.signedAt).getFullYear() : 0;
      const now = new Date(c.now);
      return now.getFullYear() === sy && now.getMonth() >= 8 && now.getMonth() <= 10;
    },
    fire(c) {
      const now = new Date(c.now);
      let at = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 5 + Math.floor(Math.random() * 5), 28), 18, 0, 0);
      // 定稿：真实大学校园音乐节，和校园情缘的学校不同校不同场；尽量跟校园庆典错开 14 天
      const UNIS = ["高丽大学 校园", "延世大学 校园", "成均馆大学 校园", "汉阳大学 校园", "中央大学 校园", "东国大学 校园"];
      const campusNode = c.career.nodes.find(n => n.title === "校园庆典" && (n.status === "pending" || n.status === "invite"));
      if (campusNode && Math.abs(campusNode.dueAt - at.getTime()) < 14 * DAY) at = new Date(campusNode.dueAt + 14 * DAY);
      const place = UNIS[Math.floor(Math.random() * UNIS.length)];
      const premise = `首尔某所大学（${place}）办秋季音乐节，邀请多组已出道爱豆和歌手演出（第一阶段：活动排期）。优先由符合条件的同期通过 KKT 邀请她一起去（邀请者按兴趣、关系和日程挑，不固定）；没人邀请，她也可以从日历知道、自己决定去不去。当天若参加，通过「此刻」演绎现场：舞台、应援、观众互动、练习生视角的演出体验。`;
      // 有朋友以上的同期就真发 KKT 邀请；实在没有才走日历
      const inviter = c.roster?.npcs.filter(n => n.charId && ["朋友", "好朋友", "暧昧", "恋人"].includes(c.profiles[n.charId]?.relation ?? "")).sort(() => Math.random() - 0.5)[0];
      const inviterChar = inviter?.charId ? c.characters.find(x => x.id === inviter.charId) : undefined;
      const node = inviterChar
        ? scheduleInvitePlot("大学音乐节", place, premise, at.getTime(), { id: inviterChar.id, name: inviterChar.name }, `大学音乐节那几天你想去${place}看演出，想叫上她一起。按你的性格在 KakaoTalk 上约她。`)
        : schedulePlotNode("大学音乐节", place, premise, at.getTime());
      return { premise: node.premise, node };
    },
  },
  // ── 固定生活剧情（scene 类：她在哪都衔接）──
  {
    key: "first_snow", title: "首尔初雪", hook: "scene", max: null,
    check(c, rec) {
      const now = new Date(c.now);
      const season = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      if ((rec.extra?.lastSeason as number) === season) return false;
      try {
        const s = JSON.parse(kvGet(`idol_weather_first_snow_v1:${season}`) || "null") as { at?: number } | null;
        if (!s?.at) return false;
        const snowDay = new Date(s.at);
        return snowDay.getFullYear() === now.getFullYear() && snowDay.getMonth() === now.getMonth() && snowDay.getDate() === now.getDate();
      } catch { return false; }
    },
    fire(c, rec) {
      const now = new Date(c.now);
      const season = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const all = load();
      all["first_snow"] = { ...(all["first_snow"] ?? rec), extra: { ...(rec.extra ?? {}), lastSeason: season } };
      save(all);
      return {
        premise: `首尔今天迎来这个秋冬季的初雪。按她此刻所在的地方、同行的人、正在做的事衔接这段初雪剧情：独处、和朋友、和同期、或在约会都可以有不同发展；不强制出现特定人物、不强制恋爱发展、不为了初雪强行改变她的位置。保留初雪的双语文案和氛围感（初雪动画另做）。`,
      };
    },
  },
];

export { load as loadPlots, save as savePlots };
