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
import { loadProfiles } from "./idol-people";
import { loadCharacters } from "./character-storage";
import { loadRoster } from "./idol-roster-live";
import { fameTotal } from "./idol-fame";
import { loadGrades, type GradeView } from "./idol-starroad";
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

export type PlotFireResult = { premise: string; node?: CareerNode; done?: boolean };

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

/** 排一个 date 类剧情的日程节点（走现有通知/日历/三结局） */
function schedulePlotNode(title: string, place: string, premise: string, at: number): CareerNode {
  const career = loadCareer();
  const node: CareerNode = {
    id: uid("plot"), kind: "event", title, place, premise, dueAt: at, status: "pending",
    companyId: career.companyId, occasion: "plot",
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  addToCalendar(node);
  return node;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmtMD = (ms: number) => `${new Date(ms).getMonth() + 1}月${new Date(ms).getDate()}日`;

// ── 触发检查 ──

/** 查一遍条件：条件满的进 ready。返回新进 ready 的 key 列表 */
export function plotTick(): string[] {
  const all = plotRecords();
  const c = ctx();
  const became: string[] = [];
  for (const d of PLOTS) {
    const rec = all[d.key];
    if (rec.state !== "watching") continue;
    if (d.max != null && rec.firedCount >= d.max) continue;
    try {
      if (d.check(c, rec)) {
        all[d.key] = { ...rec, state: "ready" };
        became.push(d.key);
      }
    } catch { /* 一条出错不挡别的 */ }
  }
  save(all);
  return became;
}

/** 上课管线问的：有没有 ready 的 class 类剧情；有就触发它并返回开场 */
export async function takeClassPlot(): Promise<{ key: string; premise: string } | null> {
  const all = plotRecords();
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
      return { key: d.key, premise: r.premise };
    } catch { /* 这条触发失败，留给下一节 */ }
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
      if (!r || !r.node) continue;
      all[d.key] = { ...rec, state: "done", firedCount: rec.firedCount + 1, lastFiredAt: Date.now() };
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
      return {
        premise: `老师宣布了一个机会：${chanceLabels[subject]}。竞争者包括她和${rival?.name ?? "一位同期"}，围绕${subjectLabel[subject]}这个方向的实力来争。结果是代码定的：${win ? `她拿下了这个机会（按她的实际表现写，不夸大）` : `机会给了${rival?.name ?? "对方"}（写清楚对方哪方面更合适，不贬低她）`}。按这个结果把这场戏演出来，含报名/考核/公布的过程。`,
      };
    },
  },
  {
    key: "hidden_talent", title: "隐藏天赋被发掘", hook: "class", max: 1,
    check(c) {
      const talents = loadTraineeCard()?.talents ?? [];
      // 非开局特长、从 D 一路升到 B 的科目
      return c.grades.some(g => !talents.includes(g.id) && g.grade === "B" && g.last?.dir === "up");
    },
    fire(c) {
      const talents = loadTraineeCard()?.talents ?? [];
      const g = c.grades.find(x => !talents.includes(x.id) && x.grade === "B" && x.last?.dir === "up");
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
      return {
        premise: `声乐课/舞蹈课上，老师宣布公司要安排一次练习生小组合作表演（女同期小组，和 8 月主线的男女合作舞台是两回事）。她和${picked.map(r => r.name).join("、")}分到一组。这一场先演公布和分组：成员之间真实的亲疏关系、谁开心谁有意见，都按人设来；后续排练和正式表演由后面的场次接着演。`,
      };
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
];

export { load as loadPlots, save as savePlots };
