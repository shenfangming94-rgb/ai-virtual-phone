/**
 * 爱豆小手机：随机事业机会系统（第八大系统）。
 *
 * 8 类机会（对应八项能力）、4 种来源、统一奖励表（失败+1 经验/成功普通+2+2/较重要+3+4/高曝光+4+6）、
 * 情缘专属保护（高端杂志=富二代线、前辈 MV 女主角=爱豆线，这里绝不生成）。
 * 频率：普通背景 2~3 次、高知名度/行业经历背景 3~4 次；间隔至少 45 世界日；同时最多推进 1 个。
 * 流程：邀约（提醒事项待回复）→ 结果代码定（数值+适配+随机，不保证赢）→ 成功把工作演完 → 结算。
 * 需求：docs/idol/needs/NEED-5-随机事业机会系统.md。只在新存档（有名册）下跑。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCareer, saveCareer, addToCalendar, type CareerNode } from "./idol-career";
import { loadTraineeCard } from "./trainee-card";
import { loadRoster, saveRoster, settlePlayerClass, settlePlayerExp, formatClassGain } from "./idol-roster-live";
import { fameEvent } from "./idol-fame";
import type { Subject } from "./idol-training";

const KEY = "idol_opportunities_v1";
const DAY = 864e5;

const SUBJECT_LABEL: Record<Subject, string> = {
  vocal: "声乐", dance: "舞蹈", rap: "Rap", compose: "创作", acting: "演技", variety: "综艺感", language: "语言", visual: "形象管理",
};

type OppDef = {
  subject: Subject;
  title: string;
  place: string;
  premise: string;
  scale: "normal" | "major" | "high";
  /** 幕后工作：能力经验先结算，公开曝光后再结算关注度（v1 简化为完成时一起结，标注公开性） */
  public: boolean;
};

const OPPS: OppDef[] = [
  { subject: "acting", title: "影视剧角色试镜", place: "电视台 化妆间", premise: "影视剧组寻找年轻演员，公司推荐她参加试镜（电视剧/网剧/短剧的小角色或配角）。主要看演技、已有表演经历和角色适配度。", scale: "major", public: true },
  { subject: "visual", title: "广告及品牌拍摄", place: "江南 商场", premise: "品牌需要模特或演员，邀请她参加广告、宣传照或品牌短片拍摄的选拔。主要看颜值、外形风格与品牌定位的契合度，次要看镜头表现力、关注度和已有拍摄经验。", scale: "normal", public: true },
  { subject: "vocal", title: "歌曲 Demo 试唱", place: "公司 录音室", premise: "公司制作人或合作音乐团队需要试唱者，邀请她录制歌曲 Demo 或参考人声。主要看声乐、音色特点和歌曲适配度。", scale: "normal", public: false },
  { subject: "dance", title: "特别舞蹈影像", place: "公司 大练习室", premise: "编舞团队或影像制作团队需要练习生参与舞蹈作品拍摄（专业编舞展示、特别合作影片）。主要看舞蹈、舞台表现和风格适配度。", scale: "normal", public: true },
  { subject: "compose", title: "原创作品征集", place: "公司 会议室", premise: "公司制作团队征集旋律、歌词、编曲等原创内容，她可以投稿参加。主要看创作能力、作品质量和项目需求。", scale: "normal", public: false },
  { subject: "rap", title: "特别 Rap 合作", place: "公司 录音室", premise: "制作团队需要 Rap 试录、合作段落或参考音轨。主要看 Rap 能力、Flow 和风格适配度。", scale: "normal", public: false },
  { subject: "variety", title: "综艺或网络节目客串", place: "电视台 下班路", premise: "公司合作节目需要年轻嘉宾或短期拍摄参与者，她可能被推荐参加录制。主要看综艺感、镜头表现、节目定位和当前公开身份。", scale: "major", public: true },
  { subject: "language", title: "海外内容企划", place: "公司 会议室", premise: "公司或合作单位需要练习生参与多语言宣传、海外内容录制或其他跨国合作项目。主要看语言能力、实际掌握的语言和企划要求。", scale: "major", public: true },
];

type State = {
  firedCount: number;
  lastAt: number;
  lastRollDay: string;
  /** 发过的机会标题（尽量不重复） */
  titles: string[];
  /** 处理中的机会：邀约已发、结果已定，等节点完成就结算 */
  active: { subject: Subject; title: string; nodeId: string; win: boolean; scale: OppDef["scale"]; public: boolean } | null;
};

function load(): State {
  try { return { firedCount: 0, lastAt: 0, lastRollDay: "", titles: [], active: null, ...(JSON.parse(kvGet(KEY) || "null") as Partial<State> | null) }; } catch { return { firedCount: 0, lastAt: 0, lastRollDay: "", titles: [], active: null }; }
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); }

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** 高知名度/行业经历背景（童星、星二代）：机会多一点、来得早一点 */
function knownBackground(): boolean {
  return ["child", "star"].includes(loadTraineeCard()?.family ?? "");
}
function maxOpps(): number { return knownBackground() ? 4 : 3; }
function earliestDays(): number { return knownBackground() ? 30 : 45; }

/** 结果判定：她该科数值 vs 要求（该科数值 ± 随机）；连胜连败不做保底（保底是课堂竞争那套的规矩） */
function decideWin(subject: Subject): boolean {
  const roster = loadRoster();
  const v = roster?.player.stats[subject] ?? 45;
  const r = Math.random() * 20 - 10;
  return v + r >= 50;
}

/** 每 5 秒在桌面跑：结算已完成的、到点掷骰发新机会 */
export function opportunitiesTick(): void {
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const career = loadCareer();
  if (career.stage !== "trainee" || !career.signedAt) return;
  const s = load();
  const now = Date.now();
  // 1. 处理中的机会：节点完成/缺席/拒绝 → 结算
  if (s.active) {
    const node = career.nodes.find(n => n.id === s.active!.nodeId);
    if (node && node.status !== "pending" && node.status !== "invite") {
      settleActive(s, node);
      return;
    }
  }
  // 2. 该掷骰了吗
  const signedDays = Math.floor((now - career.signedAt) / DAY);
  if (signedDays < earliestDays()) return;
  if (s.firedCount >= maxOpps()) return;
  if (s.active) return;
  if (now - s.lastAt < 45 * DAY) return;
  const today = dayKey(now);
  if (s.lastRollDay === today) return;
  s.lastRollDay = today;
  save(s);
  if (Math.random() >= 0.08) return;
  fireOpportunity();
}

/** 结算一次已结束的机会：成功按规模给经验+关注度，失败给 +1 经验（她表格里的经验单位，1 经验 = 3 训练进度） */
function settleActive(s: State, node: CareerNode): void {
  const a = s.active!;
  const attended = node.status === "done";
  const exp = !attended ? 0 : a.win ? (a.scale === "high" ? 4 : a.scale === "major" ? 3 : 2) : 1;
  if (exp > 0) {
    try { settlePlayerExp(a.subject, exp); } catch { /* 结算失败不影响 */ }
  }
  // 关注度：公开项目按规模（+2=small、+4/+6≈medium，走现成 fameEvent 档位）
  if (attended && a.win && a.public) {
    fameEvent(a.scale === "high" || a.scale === "major" ? "medium" : "small", a.title, node.dueAt);
  }
  save({ ...s, active: null });
}

/** 发一个新机会：邀约进提醒事项（待回复），结果当场定（代码判），赢了就把工作演完 */
function fireOpportunity(): void {
  const s = load();
  const roster = loadRoster();
  if (!roster) return;
  const pool = OPPS.filter(o => !s.titles.includes(o.title));
  const pick = pool[Math.floor(Math.random() * pool.length)] ?? OPPS[Math.floor(Math.random() * OPPS.length)];
  const win = decideWin(pick.subject);
  const at = new Date(Date.now() + 2 * DAY);
  at.setHours(14 + Math.floor(Math.random() * 3), 0, 0, 0);
  const career = loadCareer();
  const node: CareerNode = {
    id: uid("opp"), kind: "chance", title: pick.title, place: pick.place,
    premise: `${pick.premise}（来源：${["公司内部推荐", "公开作品带来的机会", "外部合作邀约", "已有行业人脉"][Math.floor(Math.random() * 4)]}）`,
    dueAt: at.getTime(), status: "invite",
    companyId: career.companyId, occasion: "opportunity",
    note: `结果（代码定的）：${win ? "她拿下了这个机会，把选拔和工作完成的过程演出来（按她的实际表现，不夸大）" : "她没能入选，把落选的过程和结果演出来（写清楚对方哪方面更合适，不贬低她）"}`,
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  addToCalendar(node);
  const state = load();
  save({
    ...state,
    firedCount: state.firedCount + 1,
    lastAt: Date.now(),
    titles: [...state.titles, pick.title],
    active: { subject: pick.subject, title: pick.title, nodeId: node.id, win, scale: pick.scale, public: pick.public },
  });
}

/** 测试/调试用：跳过掷骰直接发一个机会 */
export function fireOpportunityForTest(): void { fireOpportunity(); }

export function opportunitiesState(): State { return load(); }
