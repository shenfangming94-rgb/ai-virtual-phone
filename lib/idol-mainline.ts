/**
 * 爱豆小手机：年度固定事业主线（第 3 块：调度器）。
 *
 * 14 个主线节点按时间窗口推进，代码排期、不靠 AI 记月份：
 * 尚未到期(locked) → 待安排(pending) → 已安排(scheduled，落到提醒事项节点) → 已完成(done)。
 * 排期避让：周评/月考、别的已排主线、大活动错开；撞上课的按正式行程算（judge 里 kind=event 已属官方假）。
 * 需求：docs/idol/needs/NEED-1-年度固定事业主线.md。只在新存档（有名册）下跑。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCareer, saveCareer, companyOf, addToCalendar, type CareerNode } from "./idol-career";

const KEY = "idol_mainline_v1";
const DAY = 864e5;
const HOUR = 3600e3;

export type MainlineState = "locked" | "pending" | "scheduled" | "done";

export type MainlineNode = {
  key: string;
  title: string;
  place: string;
  premise: string;
  /** 时间窗口（月、日区间），year 0 = 签约那年，year 1 = 次年 */
  y: 0 | 1;
  m: number;
  fromDay: number;
  toDay: number;
  /** 大活动，排期时跟别的错开、留几天准备期 */
  big?: boolean;
  state: MainlineState;
  scheduledAt?: number;
  nodeId?: string;
};

/** 主线定义（顺序即推进顺序）。00 试镜/录取/签约走现有职业流程，不在这里排。 */
export const MAINLINE_DEFS: Omit<MainlineNode, "state">[] = [
  { key: "roadshow", title: "夏日练习生路演", place: "弘大", premise: "公司安排部分练习生参加户外夏季路演：分组、选曲与舞台准备，街头公开表演，路人拍摄的视频和社交媒体讨论。", y: 0, m: 7, fromDay: 20, toDay: 31, big: true },
  { key: "collab_stage", title: "男女练习生合作舞台", place: "公司 大练习室", premise: "公司组织一次正式的练习生合作舞台，包含男女练习生合作表演：任务公布、人员与团队分配、选曲、Part 分配与排练，以及正式舞台和演出结果。", y: 0, m: 8, fromDay: 15, toDay: 31, big: true },
  { key: "official_video", title: "官方练习生表演视频公开", place: "公司 练习室", premise: "公司安排练习生表演视频录制，并通过官方 YouTube 等渠道公开：录制准备、实际表演内容、公司官方账号发布、播放量与评论、粉丝关注及论坛讨论。", y: 0, m: 9, fromDay: 10, toDay: 20, big: true },
  { key: "backup_dance", title: "前辈回归伴舞选拔", place: "公司 大练习室", premise: "公司旗下已出道前辈即将回归，需要挑选练习生参与伴舞或相关舞台工作：选拔通知、候选人报名或筛选、准备与考核、参与名单公布、正式活动及后台经历。", y: 0, m: 10, fromDay: 20, toDay: 31, big: true },
  { key: "family_concert", title: "公司年末家族演唱会", place: "演唱会场馆 观众席", premise: "公司年末家族演唱会：观摩前辈舞台、后台准备工作、公司安排的辅助任务，或根据资格获得特定舞台参与机会。", y: 0, m: 12, fromDay: 20, toDay: 28, big: true },
  { key: "debut_plan", title: "夏季女团出道企划公布", place: "公司 会议室", premise: "公司正式向练习生宣布下一年度夏季推出新女团的计划：出道企划已经确定，最终成员名单尚未公布，公司开始进入有针对性的出道候选筛选阶段。", y: 1, m: 1, fromDay: 5, toDay: 15 },
  { key: "candidate_groups", title: "候选出道组分组训练", place: "公司 练习室", premise: "公司将部分练习生组成不同的候选队伍，开展针对性的团队训练：候选人员筛选、不同组合的训练安排、团队演唱与舞蹈配合、成员定位与 Part 分配尝试。", y: 1, m: 2, fromDay: 1, toDay: 20, big: true },
  { key: "final_selection", title: "出道最终选拔", place: "公司 考核室", premise: "公司进行最终出道候选评价：参考长期课堂表现、综合能力、近期成长与考核记录、团队适配情况、前期候选组训练和公司实际出道企划要求。", y: 1, m: 3, fromDay: 1, toDay: 25, big: true },
  { key: "roster_reveal", title: "最终出道名单公布", place: "公司 会议室", premise: "公司正式公布新女团的最终成员名单：名单正式公布、成员之间的反应、入选与未入选同期的不同处境、新团队的第一次正式集结。名单由系统按数值与经历计算，不得提前泄露。", y: 1, m: 4, fromDay: 1, toDay: 15 },
  { key: "team_trip", title: "出道团成员合宿团建旅行", place: "仁川机场", premise: "公司安排最终确定的女团成员进行一次 2~3 天的团体旅行：熟悉成员、建立团队默契，并为出道后的宣传准备素材；旅行中拍摄的 vlog 或团综素材在正式出道后再公开。", y: 1, m: 4, fromDay: 20, toDay: 5, big: true },
  { key: "song_prep", title: "出道歌曲制作与舞台准备", place: "公司 录音室", premise: "正式出道成员进入作品制作和舞台准备阶段：出道歌曲试听、歌曲风格和概念讨论、Part 分配、正式录音、舞蹈编排与排练、MV 拍摄准备。", y: 1, m: 5, fromDay: 5, toDay: 25, big: true },
  { key: "concept_reveal", title: "出道概念正式公开", place: "公司 会议室", premise: "公司开始对外公布出道企划的正式宣传物料：团队名称与出道概念、成员资料、概念照、预告海报或视频、出道歌曲与 MV 相关预告。官方信息发布后外界才能据此讨论。", y: 1, m: 6, fromDay: 5, toDay: 18 },
  { key: "debut", title: "正式出道", place: "演唱会场馆 舞台", premise: "公司推出新女团，完成正式出道：出道歌曲公开、MV 发布、出道 Showcase、首轮宣传及打歌活动、初步粉丝与媒体反应。", y: 1, m: 6, fromDay: 20, toDay: 5, big: true },
];

type State = { nodes: MainlineNode[] };

function load(): State {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as State | null;
    if (raw?.nodes) return raw;
  } catch { /* 坏数据当新的 */ }
  return { nodes: MAINLINE_DEFS.map(d => ({ ...d, state: "locked" })) };
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); }

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const pad = (n: number) => String(n).padStart(2, "0");

/** 某年的窗口起止（本地时间戳） */
function windowOf(n: MainlineNode, year: number): { start: number; end: number } {
  const start = new Date(year, n.m - 1, n.fromDay, 9, 0, 0).getTime();
  let endYear = year, endMonth = n.m - 1, endDay = n.toDay;
  if (n.toDay < n.fromDay) { endMonth++; if (endMonth > 11) { endMonth = 0; endYear++; } }
  const end = new Date(endYear, endMonth, Math.min(endDay, daysIn(endYear, endMonth)), 23, 59, 0).getTime();
  return { start, end };
}
function daysIn(y: number, m: number): number { return new Date(y, m + 1, 0).getDate(); }

/** 某天是不是撞了：已排的周评/月考/主线节点 + 她已答应的约会、拍摄机会、别的活动 */
export function dayBlocked(ms: number, careerNodes: CareerNode[], mainline: MainlineNode[], selfKey?: string): boolean {
  const d = new Date(ms);
  const sameDay = (t: number) => { const x = new Date(t); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); };
  const official = new Set(["weekly", "monthly", "makeup", "selection", "debut", "talk"]);
  if (careerNodes.some(n => official.has(n.kind) && n.status === "pending" && sameDay(n.dueAt))) return true;
  // 她反馈/审计：已接受的约会、机会、活动也要挡，不然主线撞她约好的事
  if (careerNodes.some(n => (n.kind === "date" || n.kind === "chance" || n.kind === "event") && (n.status === "pending" || n.status === "invite") && sameDay(n.dueAt))) return true;
  if (mainline.some(n => n.key !== selfKey && n.state === "scheduled" && n.scheduledAt != null && sameDay(n.scheduledAt))) return true;
  return false;
}

/** 在窗口里挑一天：优先工作日下午，避开撞车；大活动留 3 天准备期（从今天算） */
export function pickMainlineDate(n: MainlineNode, year: number, now: number, careerNodes: CareerNode[], mainline: MainlineNode[]): number {
  const { start, end } = windowOf(n, year);
  const lead = n.big ? 3 * DAY : 2 * DAY;
  const earliest = Math.max(start, now + lead);
  const latest = Math.max(earliest, Math.min(end, now + 14 * DAY)); // 不跳过：窗口过了就尽快安排
  let best: number | null = null;
  for (let t = earliest; t <= latest; t += DAY) {
    const d = new Date(t);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // 周末不办正事
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 14 + Math.floor(Math.random() * 3), 0, 0).getTime();
    if (dayBlocked(at, careerNodes, mainline, n.key)) continue;
    best = at;
    break;
  }
  // 实在挑不出来就顺延找空日（最多找两个月，再找不到就不躲了）
  if (best == null) {
    for (let i = 0; i < 60; i++) {
      const t = latest + (i + 1) * DAY;
      const d = new Date(t);
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 14, 0, 0).getTime();
      if (!dayBlocked(at, careerNodes, mainline, n.key)) { best = at; break; }
    }
  }
  return best ?? latest + DAY;
}

/** 主线节点落成一个提醒事项节点（走现成的通知、日历、三结局） */
function createMainlineNode(n: MainlineNode, at: number): CareerNode {
  const c = companyOf(loadCareer().companyId);
  return {
    id: uid("ml"), kind: "event", title: n.title, place: n.place, premise: n.premise,
    dueAt: at, status: "pending",
    companyId: loadCareer().companyId,
    from: `${c?.name ?? ""} 公司`.trim(), occasion: "mainline",
  };
}

/** 每 5 秒在桌面跑：按窗口排期、把已完成/缺席的标成 done */
export function mainlineTick(): void {
  try { mainlineTickInner(); } catch (e) { console.error("[idol-mainline] tick failed", e); }
}

function mainlineTickInner(): void {
  const career = loadCareer();
  if (career.stage !== "trainee" || !career.signedAt) return;
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const s = load();
  const now = Date.now();
  const baseYear = new Date(career.signedAt).getFullYear();
  let changed = false;
  const nodes = s.nodes.map(n => {
    const year = baseYear + n.y;
    const { start } = windowOf(n, year);
    if (n.state === "locked" && now >= start) { changed = true; return { ...n, state: "pending" as const }; }
    if (n.state === "pending") {
      const at = pickMainlineDate(n, year, now, career.nodes, s.nodes);
      const node = createMainlineNode(n, at);
      saveCareer({ ...loadCareer(), nodes: [...loadCareer().nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
      addToCalendar(node);
      changed = true;
      return { ...n, state: "scheduled" as const, scheduledAt: at, nodeId: node.id };
    }
    if (n.state === "scheduled" && n.nodeId) {
      const node = loadCareer().nodes.find(x => x.id === n.nodeId);
      if (node && node.status === "done") { changed = true; return { ...n, state: "done" as const }; }
      if (node && (node.status === "absent" || node.status === "declined" || node.status === "leave")) {
        // 她定的：主线必要节点不跳过——缺席/没去不能当走过，重新排一场
        changed = true;
        return { ...n, state: "pending" as const, scheduledAt: undefined, nodeId: undefined };
      }
    }
    return n;
  });
  if (changed) save({ nodes });
}

export function mainlineState(): MainlineNode[] { return load().nodes; }

/** 给 AI/世界看的：主线排到哪了 */
export function mainlinePromptBlock(): string {
  const nodes = load().nodes;
  const done = nodes.filter(n => n.state === "done").map(n => n.title);
  const next = nodes.filter(n => n.state === "scheduled" && n.scheduledAt).sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0)).slice(0, 3)
    .map(n => `${new Date(n.scheduledAt!).getMonth() + 1}月${new Date(n.scheduledAt!).getDate()}日 ${n.title}`);
  return [
    done.length ? `【主线已完成】${done.join("、")}` : "",
    next.length ? `【主线接下来】${next.join("；")}` : "",
  ].filter(Boolean).join("\n");
}
