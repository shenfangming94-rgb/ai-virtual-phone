/**
 * 爱豆小手机：随机事业机会系统（第八大系统）。
 *
 * 8 类机会（对应八项能力）、4 种来源（按她真实条件挑，不许凭空贴）、统一奖励表（失败+1 经验/成功普通+2+2/较重要+3+4/高曝光+4+6）、
 * 情缘专属保护（高端杂志=富二代线、前辈 MV 女主角=爱豆线，这里绝不生成）。
 * 频率：普通背景 2~3 次、高知名度/行业经历背景 3~4 次；间隔至少 45 世界日；同时最多推进 1 个。
 * 流程：邀约（提醒事项待回复）→ 选拔结果代码定（数值+适配+随机）→ 成功再排正式工作 → 工作完成才结算。
 * 需求：docs/idol/needs/NEED-5-随机事业机会系统.md。只在新存档（有名册）下跑。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCareer, saveCareer, addToCalendar, type CareerNode } from "./idol-career";
import { loadTraineeCard } from "./trainee-card";
import { loadRoster, settlePlayerExp } from "./idol-roster-live";
import { fameEventAmount, fameState } from "./idol-fame";
import { visibleVideos } from "./idol-youtube";
import { loadProfiles } from "./idol-people";
import type { Subject } from "./idol-training";

const KEY = "idol_opportunities_v1";
const DAY = 864e5;

type OppDef = {
  subject: Subject;
  title: string;
  place: string;
  premise: string;
  /** 实际工作的演绎方向（选拔通过后单独排一场正式工作） */
  workPremise: string;
  scale: "normal" | "major" | "high";
  /** 幕后工作：能力经验先结算，公开曝光后再结算关注度 */
  public: boolean;
};

const OPPS: OppDef[] = [
  { subject: "acting", title: "影视剧角色试镜", place: "电视台 化妆间", premise: "影视剧组寻找年轻演员，公司推荐她参加试镜（电视剧/网剧/短剧的小角色或配角）。主要看演技、已有表演经历和角色适配度。", workPremise: "试镜通过后，她进入剧组完成实际拍摄（戏份按角色真实大小，不夸大）。", scale: "major", public: true },
  { subject: "visual", title: "广告及品牌拍摄", place: "江南 商场", premise: "品牌需要模特或演员，邀请她参加广告、宣传照或品牌短片拍摄的选拔。主要看颜值、外形风格与品牌定位的契合度，次要看镜头表现力、关注度和已有拍摄经验。", workPremise: "选拔通过后完成实际拍摄：广告、宣传照或品牌短片。", scale: "normal", public: true },
  { subject: "vocal", title: "歌曲 Demo 试唱", place: "公司 录音室", premise: "公司制作人或合作音乐团队需要试唱者，邀请她录制歌曲 Demo 或参考人声。主要看声乐、音色特点和歌曲适配度。", workPremise: "进录音室完成 Demo 录制（幕后工作，不公开）。", scale: "normal", public: false },
  { subject: "dance", title: "特别舞蹈影像", place: "公司 大练习室", premise: "编舞团队或影像制作团队需要练习生参与舞蹈作品拍摄（专业编舞展示、特别合作影片）。主要看舞蹈、舞台表现和风格适配度。", workPremise: "完成舞蹈影像的排练与拍摄，作品公开。", scale: "normal", public: true },
  { subject: "compose", title: "原创作品征集", place: "公司 会议室", premise: "公司制作团队征集旋律、歌词、编曲等原创内容，她可以投稿参加。主要看创作能力、作品质量和项目需求。", workPremise: "作品被采用后配合完成后续制作（幕后工作）。", scale: "normal", public: false },
  { subject: "rap", title: "特别 Rap 合作", place: "公司 录音室", premise: "制作团队需要 Rap 试录、合作段落或参考音轨。主要看 Rap 能力、Flow 和风格适配度。", workPremise: "完成 Rap 段落录制（幕后工作）。", scale: "normal", public: false },
  { subject: "variety", title: "综艺或网络节目客串", place: "电视台 下班路", premise: "公司合作节目需要年轻嘉宾或短期拍摄参与者，她可能被推荐参加录制。主要看综艺感、镜头表现、节目定位和当前公开身份。", workPremise: "参加节目实际录制并播出。", scale: "high", public: true },
  { subject: "language", title: "海外内容企划", place: "公司 会议室", premise: "公司或合作单位需要练习生参与多语言宣传、海外内容录制或其他跨国合作项目。主要看语言能力、实际掌握的语言和企划要求。", workPremise: "完成多语言内容的录制或合作项目。", scale: "major", public: true },
];

type Active = {
  subject: Subject;
  title: string;
  nodeId: string;
  win: boolean;
  scale: OppDef["scale"];
  public: boolean;
  workPremise: string;
  /** audition = 选拔/试镜阶段；work = 正式工作阶段 */
  phase: "audition" | "work";
};

type State = {
  firedCount: number;
  lastAt: number;
  lastRollDay: string;
  /** 发过的机会标题（尽量不重复） */
  titles: string[];
  /** 处理中的机会：邀约已发、结果已定，等节点完成就推进 */
  active: Active | null;
  /** 幕后工作攒下的待公开关注度（她的公开视频发出去时一起结） */
  pendingPublic: { subject: Subject; title: string; amount: number }[];
};

function load(): State {
  try { return { firedCount: 0, lastAt: 0, lastRollDay: "", titles: [], active: null, pendingPublic: [], ...(JSON.parse(kvGet(KEY) || "null") as Partial<State> | null) }; } catch { return { firedCount: 0, lastAt: 0, lastRollDay: "", titles: [], active: null, pendingPublic: [] }; }
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

/** 她的真实条件（资格和来源都按这个来，不许凭空贴） */
function qualifications() {
  const roster = loadRoster();
  const card = loadTraineeCard();
  const stats = roster?.player.stats ?? { vocal: 45, dance: 45, rap: 45, variety: 45, acting: 45, visual: 50, compose: 45, language: 45 };
  const career = loadCareer();
  const hasPublicWork = visibleVideos().length > 0
    || career.nodes.some(n => n.occasion === "mainline" && n.status === "done" && /路演|视频|合作舞台|公开/.test(n.title));
  const hasCollaborator = Object.values(loadProfiles()).some(p => p.met && /导演|制作人|编舞|音乐人|摄影|PD|选角|代表/.test(p.role ?? ""));
  return {
    stats,
    specialty: roster?.player.specialty ?? null,
    family: card?.family ?? "",
    hasPublicWork,
    hasCollaborator,
  };
}

/** 机会要跟她的真实条件匹配（NEED-5 第五节） */
function oppQualifies(o: OppDef): boolean {
  const q = qualifications();
  const v = q.stats[o.subject] ?? 45;
  const fame = fameState().total;
  if (o.subject === "visual") return q.family === "child" || q.family === "star" || v >= 55; // 颜值用于筛选
  if (o.subject === "variety") return fame >= 12 || v >= 50;
  if (o.subject === "acting") return q.family === "child" || q.hasPublicWork || v >= 50;
  return v >= 50 || q.specialty === o.subject || q.hasPublicWork;
}

/** 来源必须真实存在（NEED-5 第二节） */
function pickSource(): string {
  const q = qualifications();
  const options = ["公司内部推荐", "外部合作邀约"];
  if (q.hasPublicWork) options.push("公开作品带来的机会");
  if (q.hasCollaborator) options.push("已有行业人脉");
  return options[Math.floor(Math.random() * options.length)];
}

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
  // 1. 处理中的机会：节点完成/缺席/拒绝 → 推进
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

/** 找一天不被占的（正式考核/主线/她已答应的约会活动），向后顺延最多 14 天 */
function freeDay(at: number): number {
  const career = loadCareer();
  const official = new Set(["weekly", "monthly", "makeup", "selection", "debut", "talk", "date", "chance", "event"]);
  const blocked = (t: number) => {
    const d = new Date(t);
    return career.nodes.some(n => (official.has(n.kind) || n.occasion === "mainline") && (n.status === "pending" || n.status === "invite")
      && (() => { const x = new Date(n.dueAt); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); })());
  };
  if (!blocked(at)) return at;
  for (let i = 1; i <= 14; i++) {
    const t = at + i * DAY;
    if (!blocked(t)) return t;
  }
  return at;
}

/** 结算一次机会节点：选拔阶段 → 通过才排正式工作；工作阶段完成才给全奖励 */
function settleActive(s: State, node: CareerNode): void {
  const a = s.active;
  if (!a) return;
  if (a.phase === "audition") {
    if (node.status === "done" && a.win) {
      // 第三阶段之后：正式工作单独进日历，演完才结算（NEED-5 第七节）
      const workAt = freeDay(Date.now() + 3 * DAY);
      const work: CareerNode = {
        id: uid("opp"), kind: "chance", title: `${a.title} · 正式工作`, place: workPlace(a),
        premise: `${a.workPremise}（来源：正式工作，选拔已经通过）`,
        dueAt: workAt, status: "pending",
        companyId: loadCareer().companyId, occasion: "opportunity",
        note: "把这次实际工作演完（选拔已通过，做完结算奖励）",
      };
      saveCareer({ ...loadCareer(), nodes: [...loadCareer().nodes, work].sort((x, y) => x.dueAt - y.dueAt) });
      addToCalendar(work);
      save({ ...s, active: { ...a, phase: "work", nodeId: work.id } });
      return;
    }
    // 试镜落选：失败 +1 经验（她真的去了试镜才给）；没去/拒绝 = 0
    if (node.status === "done" && !a.win) {
      try { settlePlayerExp(a.subject, 1); } catch { /* 结算失败不影响 */ }
    }
    save({ ...s, active: null });
    return;
  }
  // phase === "work"
  if (node.status !== "done") { save({ ...s, active: null }); return; } // 未能成行：不算完成，无额外奖励
  const exp = a.scale === "high" ? 4 : a.scale === "major" ? 3 : 2;
  try { settlePlayerExp(a.subject, exp); } catch { /* 结算失败不影响 */ }
  const fame = a.scale === "high" ? 6 : a.scale === "major" ? 4 : 2;
  if (a.public) {
    fameEventAmount(fame, a.title, node.dueAt);
  } else {
    // 幕后工作：关注度等作品公开、有曝光再结（NEED-5 第八节）
    save({ ...s, active: null, pendingPublic: [...(s.pendingPublic ?? []), { subject: a.subject, title: a.title, amount: fame }] });
    return;
  }
  save({ ...s, active: null });
}

function workPlace(a: Active): string {
  const def = OPPS.find(o => o.title === a.title);
  return def?.place ?? "公司";
}

/** 她的公开视频发出去时，把幕后工作攒的关注度一起结掉 */
export function flushPendingPublicFame(): void {
  const s = load();
  if (!s.pendingPublic?.length) return;
  for (const p of s.pendingPublic) fameEventAmount(p.amount, `${p.title}（作品公开）`, Date.now());
  save({ ...s, pendingPublic: [] });
}

/** 情缘专属奖励（写歌/MV/画报）的关注度：正式公开曝光后才结，先挂待公开队列 */
export function queuePendingPublicFame(title: string, amount: number): void {
  const s = load();
  save({ ...s, pendingPublic: [...(s.pendingPublic ?? []), { subject: "visual" as Subject, title, amount }] });
}

/** 发一个新机会：邀约进提醒事项（待回复），结果当场定（代码判），赢了再排正式工作 */
function fireOpportunity(): void {
  const s = load();
  const roster = loadRoster();
  if (!roster) return;
  const pool = OPPS.filter(o => !s.titles.includes(o.title) && oppQualifies(o));
  if (!pool.length) return; // 没有配得上的机会就不硬塞（NEED-5：不能无视实际条件）
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const win = decideWin(pick.subject);
  const at = freeDay(Date.now() + 2 * DAY);
  const career = loadCareer();
  const source = pickSource();
  const node: CareerNode = {
    id: uid("opp"), kind: "chance", title: pick.title, place: pick.place,
    premise: `${pick.premise}（来源：${source}）`,
    dueAt: at, status: "invite",
    companyId: career.companyId, occasion: "opportunity",
    note: `结果（代码定的）：${win ? "她拿下了这个机会，把选拔的过程演出来（按她的实际表现，不夸大）。选拔过后会另排正式工作。" : "她没能入选，把落选的过程和结果演出来（写清楚对方哪方面更合适，不贬低她）"}`,
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  addToCalendar(node);
  const state = load();
  save({
    ...state,
    firedCount: state.firedCount + 1,
    lastAt: Date.now(),
    titles: [...state.titles, pick.title],
    active: { subject: pick.subject, title: pick.title, nodeId: node.id, win, scale: pick.scale, public: pick.public, workPremise: pick.workPremise, phase: "audition" },
  });
}

/** 测试/调试用：跳过掷骰直接发一个机会 */
export function fireOpportunityForTest(): void { fireOpportunity(); }

export function opportunitiesState(): State { return load(); }
