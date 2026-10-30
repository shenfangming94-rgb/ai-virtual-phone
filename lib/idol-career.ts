/**
 * 爱豆小手机的发动机（星路）。
 *
 * 管「你走到哪一步、接下来该发生什么」：
 * - 开局后公司来找你（试镜邀请）→ 你接一家 → 试镜那场戏 → 演完就签约
 * - 签约后 AI 把公司骨架展开成「公司内部档案」，再排练习生日程（第一天、每周周评、月底月考），写进日历
 * - 世界时钟走到节点前一天提醒、到点提醒；过了没演就当平常地过了
 * 以后 IdolSearch 投递是另一条进公司的路，最后也走到同一个 signCompany()。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { loadTraineeCard, saveTraineeCard, describeTrainee } from "./trainee-card";
import { upsertCalendarScheduleItem } from "./calendar-storage";
import { getWeekStartIso } from "./calendar-utils";
import { deleteCalendarScheduleItem } from "./calendar-storage";
import { announceSchedule, type ScheduleNotice } from "./idol-schedule-notices";
import { addMail, recordMailReply, type Mail } from "./idol-mail";
import { debutPromptBlock, onSelection, revealName, type Debut } from "./idol-debut";
import { starPromptBlock } from "./idol-starroad";

export type Company = { id: string; name: string; scale: string; style: string; trainee: string; recruit: string; fame: string };

export const COMPANIES: Company[] = [
  { id: "sm", name: "SM", scale: "三大社，资源顶级", style: "概念和视觉做得极致，团的世界观很完整", trainee: "管得很严，练很多年是常事，形象管理和外语都要求高", recruit: "全球公开试镜，街头星探很多", fame: "出道就自带关注度，但出道前要熬很久" },
  { id: "jyp", name: "JYP", scale: "三大社", style: "明亮健康，重人品，也重唱跳基本功", trainee: "月考很规律，品行和生活习惯也会管", recruit: "公开试镜，海外试镜多", fame: "公司氛围出了名的「正」，规矩也多" },
  { id: "yg", name: "YG", scale: "三大社", style: "hip-hop、girl crush，实力派，舞台感强", trainee: "竞争狠，出道时间说不准，可能突然出道，也可能一等好几年", recruit: "看重个性和实力，不太看重标准的漂亮", fame: "一出就是大势，但回归间隔长，粉丝常常在等" },
  { id: "hybe", name: "HYBE", scale: "大社，旗下有好几个厂牌", style: "讲故事、讲成长，很重视团的叙事和粉丝沟通", trainee: "制度化，体系完整，自作曲和表达也会练", recruit: "全球试镜，选拔流程长", fame: "营销能力强，出道的团起点都高" },
  { id: "starship", name: "Starship", scale: "中型社里的强者", style: "颜值高、形象好，综艺和代言资源多", trainee: "重视外形和镜头感", recruit: "街头星探多，常从模特和学生里挖人", fame: "「门面工厂」，路人缘好" },
  { id: "cube", name: "Cube", scale: "中型社", style: "自由，鼓励自己写歌、自己做概念", trainee: "氛围松一点，但资源有限，得自己争", recruit: "公开试镜", fame: "容易出黑马，也容易被埋没" },
];

export const companyOf = (id?: string) => COMPANIES.find(c => c.id === id);

export type Offer = { id: string; companyId: string; kind: "scout" | "audition"; at: number; message: string; place: string; status: "new" | "accepted" | "declined"; notified?: boolean; notice?: ScheduleNotice };
export type NodeKind = "audition" | "first_day" | "weekly" | "monthly" | "talk" | "makeup" | "chance" | "date" | "custom" | "selection" | "debut" | "event" | "homework" | "practice";
/** invite = 待回复；pending = 定了还没到/没做；done = 演了或打勾；leave = 请假；absent = 缺席；declined = 不去/过期；passed = 旧数据（当缺席） */
export type NodeStatus = "invite" | "pending" | "done" | "leave" | "absent" | "declined" | "passed";
export type CareerNode = {
  id: string;
  kind: NodeKind;
  title: string;
  place: string;
  premise: string;
  dueAt: number;
  status: NodeStatus;
  companyId?: string;
  remindedEve?: boolean;
  remindedDue?: boolean;
  /** 谁通知的 / 谁约的（人名） */
  from?: string;
  fromId?: string;
  /** 待回复的截止时间 */
  replyBy?: number;
  /** 打勾写的那句、请假理由 */
  result?: string;
  /** 她想要的结果（考前定） */
  wish?: string;
  note?: string;
  notice?: ScheduleNotice;
  inviterIds?: string[];
  participantIds?: string[];
  occasion?: string;
  doneAt?: number;
  /** 出道那几件事：name 队名公布 / record 录音 / mv / showcase */
  step?: string;
  /** 作业、加练是哪门课（星路） */
  subject?: string;
  /** 这场演得怎么样：AI 记账判的 good / ok / bad（试镜用它决定录不录） */
  perf?: string;
  /** 试镜演完排的公司回信时间（1~3 天后的白天） */
  resultAt?: number;
  /** 回信是录取还是没录取 */
  resultPass?: boolean;
  /** 回信已经发过了（发过就不再发） */
  resultSent?: boolean;
};

/** 节点归哪个列表 */
export function listOf(n: CareerNode): "company" | "chance" | "date" | "mine" {
  if (n.kind === "chance") return "chance";
  if (n.kind === "date") return "date";
  if (n.kind === "custom" || n.kind === "practice") return "mine";
  return "company";
}
export type Career = {
  /** idol = 已经出道 */
  stage: "pre" | "trainee" | "idol";
  companyId?: string;
  signedAt?: number;
  insider?: string;
  facts: string[];
  offers: Offer[];
  nodes: CareerNode[];
  offersMadeAt?: number;
  /** 室友（角色 id） */
  roommates?: string[];
  /** 往出道走（idol-debut.ts） */
  debut?: Debut;
};

const KEY = "idol_career_v1";
export const CAREER_EVENT = "idol-career-changed";
export const PENDING_SCENE_KEY = "idol_pending_scene_v1";
export const OPEN_SCENE_EVENT = "idol-open-scene";

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAY = 864e5;
const HOUR = 3600e3;

export function loadCareer(): Career {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as Career | null;
    if (raw) return { ...raw, facts: raw.facts ?? [], offers: raw.offers ?? [], nodes: raw.nodes ?? [] };
  } catch { /* 坏数据就当新开 */ }
  return { stage: "pre", facts: [], offers: [], nodes: [] };
}

export function saveCareer(c: Career): void {
  const previous = loadCareer();
  const announce: CareerNode[] = [];
  const changes: CareerNode[] = [];
  const nodes = c.nodes.map(n => {
    const old = previous.nodes.find(p => p.id === n.id);
    const next = { ...n, notice: n.notice ?? old?.notice, ...(old && old.dueAt !== n.dueAt ? { remindedDue: false, remindedEve: false } : {}) };
    if (!old && !next.notice && n.kind !== "custom" && n.kind !== "practice" && (n.status === "pending" || n.status === "invite")) announce.push(next);
    if (n.kind !== "custom" && n.kind !== "practice" && old && (!n.notice || n.notice.refId === old.notice?.refId) && (old.status === "pending" || old.status === "invite") && ((old.dueAt !== n.dueAt || old.place !== n.place || old.title !== n.title) || (n.status === "declined" && old.status !== "invite") || n.status === "leave")) changes.push(next);
    return next;
  });
  if (announce.length) {
    // 按发信人分批，不能把不同人的邀请冒充成同一个人的通知。
    for (const sender of new Set(announce.map(n => n.fromId || n.from || n.companyId || "system"))) {
      const batch = announce.filter(n => (n.fromId || n.from || n.companyId || "system") === sender);
      const receipt = announceSchedule(batch);
      batch.forEach(n => { n.notice = receipt; });
    }
  }
  for (const n of changes) n.notice = announceSchedule([n], n.status === "leave" || n.status === "declined" ? "取消" : "变更");
  kvSet(KEY, JSON.stringify({ ...c, nodes }));
  for (const old of previous.nodes) {
    const next = nodes.find(n => n.id === old.id);
    if (old.status === "pending" && (!next || next.dueAt !== old.dueAt || next.status === "declined" || next.status === "leave" || next.status === "invite")) {
      try { deleteCalendarScheduleItem("user", "self", getWeekStartIso(new Date(old.dueAt)), `idol_${old.id}`); } catch { /* 不影响事项 */ }
    }
  }
  for (const n of nodes) if (n.status === "pending" && previous.nodes.some(p => p.id === n.id && (p.dueAt !== n.dueAt || p.place !== n.place || p.title !== n.title))) addToCalendar(n);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CAREER_EVENT));
}

/** 从某一刻起的下一个星期几几点 */
function nextWeekday(from: number, weekday: number, hour: number, minute = 0): number {
  const d = new Date(from);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0);
  let add = (weekday - d.getDay() + 7) % 7;
  if (add === 0 && t.getTime() <= from) add = 7;
  t.setDate(t.getDate() + add);
  return t.getTime();
}

function lastFridayOfMonth(y: number, m: number): Date {
  const d = new Date(y, m + 1, 0, 14, 0, 0);
  while (d.getDay() !== 5) d.setDate(d.getDate() - 1);
  return d;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function addToCalendar(node: CareerNode): void {
  if (node.status !== "pending") return;
  try {
    const d = new Date(node.dueAt);
    const end = new Date(node.dueAt + 2 * HOUR);
    upsertCalendarScheduleItem("user", "self", getWeekStartIso(d), {
      id: `idol_${node.id}`,
      date: isoDate(d),
      startTime: hhmm(d),
      endTime: end.getDate() === d.getDate() ? hhmm(end) : "23:59",
      location: node.place,
      title: node.title,
      emoji: node.kind === "event" ? "🎊" : node.kind === "selection" ? "🌟" : node.kind === "debut" ? (node.step === "showcase" ? "🎉" : node.step === "record" ? "🎙️" : node.step === "mv" ? "🎬" : "✨") : node.kind === "monthly" ? "📋" : node.kind === "weekly" ? "🎬" : node.kind === "audition" ? "🎤" : node.kind === "date" ? "☕" : node.kind === "custom" ? "📝" : node.kind === "chance" ? "⭐" : "🏢",
      source: "generated",
    });
  } catch { /* 日历写不进去不影响剧情 */ }
}

// ── 公司来找你 ──

function offerText(c: Company, kind: Offer["kind"], name: string): string {
  return kind === "scout"
    ? `${name}你好，这里是 ${c.name} 的选角组。我们关注你有一段时间了，想邀请你来公司做一次非公开试镜。时间地点见下面，方便的话回复确认就好。`
    : `你好，${c.name} 本月公开试镜报名已收到你的资料，初审通过，请按下面的时间来参加现场试镜。`;
}

/** 开局后第一次跑：按家境决定谁来、怎么来 */
function makeOffers(now: number): Offer[] {
  const card = loadTraineeCard();
  const name = card?.name || "";
  const scouted = ["star", "rich", "chaebol", "child"].includes(card?.family || "");
  // 普通家境（含自己写的）没人来找，得自己去 IdolSearch 投；有背景的星探照样来，也能自己投
  if (!scouted) return [];
  const pool = [...COMPANIES].sort(() => Math.random() - 0.5);
  const picks = pool.slice(0, 3);
  return picks.map((c, i) => {
    const kind: Offer["kind"] = scouted ? "scout" : "audition";
    const at = now + (scouted ? (1 + i * 5) * HOUR : (1 + i) * DAY);
    return { id: uid("offer"), companyId: c.id, kind, at, message: offerText(c, kind, name), place: `${c.name} 公司大楼`, status: "new" };
  });
}

export function acceptOffer(offerId: string): CareerNode | null {
  const career = loadCareer();
  const offer = career.offers.find(o => o.id === offerId);
  const c = companyOf(offer?.companyId);
  if (!offer || !c || offer.status !== "new" || !offer.notified) return null;
  career.offers = career.offers.map(o => o.id === offerId ? { ...o, status: "accepted" } : o);
  const base = new Date(Math.max(Date.now(), offer.at));
  const due = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 2, 14, 0, 0).getTime();
  const node: CareerNode = {
    id: uid("node"),
    kind: "audition",
    title: `${c.name} 试镜`,
    place: `${c.name} 公司大楼 试镜室`,
    premise: `${c.name} 的${offer.kind === "scout" ? "非公开" : "现场"}试镜。她要在评委面前表演。`,
    dueAt: due,
    status: "pending",
    companyId: c.id,
    notice: offer.notice,
  };
  if (offer.notice?.channel === "mail") recordMailReply(offer.notice.refId, true, `${new Date(due).toLocaleString("zh-CN")} · ${node.place}`);
  career.nodes = [...career.nodes, node];
  saveCareer(career);
  addToCalendar(node);
  return node;
}

export function declineOffer(offerId: string): void {
  const career = loadCareer();
  const offer = career.offers.find(o => o.id === offerId);
  if (!offer || offer.status !== "new") return;
  if (offer.notice?.channel === "mail") recordMailReply(offer.notice.refId, false);
  career.offers = career.offers.map(o => o.id === offerId ? { ...o, status: "declined" } : o);
  saveCareer(career);
}

// ── 签约 ──

function storyConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "story");
  const chat = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === (slot.apiConfigId || chat.apiConfigId)) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

export async function expandInsider(c: Company): Promise<string> {
  const card = loadTraineeCard();
  const res = await simpleLLMCall(storyConfig(), [
    {
      role: "system",
      content: `你在给一出韩国娱乐圈的戏写「公司内部档案」。照这家公司的风格写，要跟别的公司明显不一样，写具体的、以后每场戏都要照着来的设定。只写设定，不写剧情。分四段，每段几条短句：
【楼里】几楼是练习室、录音室、声乐室、食堂、休息的地方，哪里能偷偷睡觉
【宿舍】在哪、几人一间、门禁、谁管
【一周】几点到、几点能走、周几周评、月底月考怎么考、谁当评委（每天上什么课另有课表，这里不写课）
【规矩】写在纸上的和不成文的
公司里的人只写职位不写名字。`,
    },
    { role: "user", content: `公司：${c.name}\n规模：${c.scale}\n风格：${c.style}\n练习生：${c.trainee}\n招人：${c.recruit}\n名声：${c.fame}\n\n新签的练习生：\n${card ? describeTrainee(card) : "一个女生"}` },
  ], { temperature: 0.8, label: "公司内部档案" });
  if (!res.content) throw new Error(res.error || "AI 没回");
  return res.content.trim();
}

/** 签约：进练习生阶段，排日程，展开公司档案（AI 失败也先签上，档案之后补） */
export async function signCompany(companyId: string): Promise<void> {
  const c = companyOf(companyId);
  if (!c) return;
  const now = Date.now();
  const career = loadCareer();
  career.stage = "trainee";
  career.companyId = c.id;
  career.signedAt = now;
  career.offers = career.offers.map(o => o.status === "new" ? { ...o, status: "declined" } : o);
  // 签了这家，别家全部收尾：还没到点的试镜结果不再发，其他公司的邀请作废
  career.nodes = career.nodes.map(n => {
    if (n.kind === "audition" && n.companyId !== c.id && n.resultAt && !n.resultSent) return { ...n, resultSent: true };
    if (n.status === "invite" && n.companyId !== c.id) return { ...n, status: "declined" as const, result: `已经进了${c.name}` };
    return n;
  });
  const first = new Date(now + DAY);
  first.setHours(9, 0, 0, 0);
  const firstDay: CareerNode = {
    id: uid("node"), kind: "first_day", title: "进公司第一天", place: `${c.name} 公司大楼`,
    premise: "进公司的第一天：见练习生室长，分宿舍，见同期的练习生们。", dueAt: first.getTime(), status: "pending", companyId: c.id,
  };
  career.nodes = [...career.nodes.filter(n => n.status !== "pending" || n.kind === "audition"), firstDay];
  saveCareer(career);
  closeOtherApplications(c);
  addToCalendar(firstDay);
  extendSchedule();
  const card = loadTraineeCard();
  if (card) saveTraineeCard({ ...card, company: c.name });
  try {
    const insider = await expandInsider(c);
    saveCareer({ ...loadCareer(), insider });
  } catch { /* 档案之后在提醒事项里点「重新生成」补 */ }
}

/** 签约后：投过、还在审核、还等她回复的其他公司，一律变成「已接受 xx 的录取」 */
function closeOtherApplications(signed: Company): void {
  try {
    const raw = JSON.parse(kvGet("idol_search_v1") || "null") as { apps?: { companyId: string; status: string; signedBy?: string }[] } | null;
    if (!raw?.apps) return;
    let changed = false;
    raw.apps = raw.apps.map(a => {
      if (a.companyId === signed.id || !["review", "invited", "silent"].includes(a.status)) return a;
      changed = true;
      return { ...a, status: "signed", signedBy: signed.id };
    });
    if (!changed) return;
    kvSet("idol_search_v1", JSON.stringify(raw));
    if (typeof window !== "undefined") window.dispatchEvent(new Event("idol-search-changed"));
  } catch { /* 投递数据坏了不影响签约 */ }
}

/** 往后排够一个月的周评和月考 */
export function extendSchedule(): void {
  const career = loadCareer();
  if (career.stage !== "trainee" || !career.companyId) return;
  const c = companyOf(career.companyId)!;
  const now = Date.now();
  const horizon = now + 35 * DAY;
  const have = new Set(career.nodes.map(n => `${n.kind}:${new Date(n.dueAt).toDateString()}`));
  const added: CareerNode[] = [];
  // 月考：每月最后一个周五下午
  for (let k = 0; k < 2; k++) {
    const base = new Date(now);
    const d = lastFridayOfMonth(base.getFullYear(), base.getMonth() + k);
    if (d.getTime() > now && d.getTime() < horizon && !have.has(`monthly:${d.toDateString()}`)) {
      added.push({ id: uid("node"), kind: "monthly", title: "月末考核", place: `${c.name} 公司 考核室`, premise: "月末考核：评委打分，排名会贴出来。", dueAt: d.getTime(), status: "pending", companyId: c.id });
    }
  }
  const monthlyDays = new Set([...career.nodes, ...added].filter(n => n.kind === "monthly").map(n => new Date(n.dueAt).toDateString()));
  // 周评：每周五傍晚（那天有月考就不排）
  let t = nextWeekday(Math.max(now, (career.signedAt ?? now) + DAY), 5, 17);
  while (t < horizon) {
    const day = new Date(t).toDateString();
    if (!monthlyDays.has(day) && !have.has(`weekly:${day}`)) {
      added.push({ id: uid("node"), kind: "weekly", title: "周评", place: `${c.name} 公司 练习室`, premise: "每周的周评：录练习视频给老师看，老师当场点评。", dueAt: t, status: "pending", companyId: c.id });
    }
    t += 7 * DAY;
  }
  if (!added.length) return;
  saveCareer({ ...career, nodes: [...career.nodes, ...added].sort((a, b) => a.dueAt - b.dueAt) });
  added.forEach(addToCalendar);
}

// ── 这一场戏是哪个节点的 ──

export function nodeById(id: string): CareerNode | undefined {
  return loadCareer().nodes.find(n => n.id === id);
}

/** 节点那场戏演完了。perf 是这场演得怎么样（good/ok/bad），试镜用它决定录不录 */
export async function completeNode(nodeId: string, perf?: string): Promise<string | null> {
  const career = loadCareer();
  const node = career.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  const doneNode: CareerNode = { ...node, status: "done", ...(perf ? { perf } : {}) };
  saveCareer({ ...career, nodes: career.nodes.map(n => n.id === nodeId ? doneNode : n) });
  if (doneNode.kind === "audition" && doneNode.companyId && loadCareer().stage === "pre") {
    // 演完不当场出结果：公司过 1~3 天才回信，跳时间会停在那一刻
    return scheduleAuditionResult(doneNode);
  }
  if (doneNode.kind === "selection") return onSelection({ ...doneNode, status: "done" }, "done");
  if (doneNode.kind === "debut" && doneNode.step === "name") { await revealName(); return "队名公布了"; }
  return null;
}

/** 试镜演完：排公司回信（1~3 天后的白天）。只有演得明显不行（bad）才可能不录取 */
function scheduleAuditionResult(node: CareerNode): string {
  const c = companyOf(node.companyId);
  const days = 1 + Math.floor(Math.random() * 3);
  const at = new Date(Date.now() + days * DAY);
  at.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
  const pass = node.perf !== "bad";
  const career = loadCareer();
  saveCareer({ ...career, nodes: career.nodes.map(n => n.id === node.id ? { ...n, resultAt: at.getTime(), resultPass: pass, resultSent: false } : n) });
  return `${c?.name ?? "公司"} 的试镜结束了，等回信`;
}

/** 公司回信：到点了就发录取信 / 拒信（桌面每 5 秒跑一次，一次只发一封） */
export function deliverAuditionResults(notify: (msg: string) => void): void {
  const career = loadCareer();
  const now = Date.now();
  const due = career.nodes
    .filter(n => n.kind === "audition" && n.companyId && n.resultAt && !n.resultSent && n.status === "done" && n.resultAt <= now)
    .sort((a, b) => (a.resultAt ?? 0) - (b.resultAt ?? 0))[0];
  if (!due) return;
  const c = companyOf(due.companyId!);
  if (!c) return;
  const pass = due.resultPass !== false;
  addMail(auditionResultMail(c, due, pass));
  saveCareer({ ...career, nodes: career.nodes.map(n => n.id === due.id ? { ...n, resultSent: true } : n) });
  notify(pass ? `📩 ${c.name} 发来了录取通知` : `📩 ${c.name} 发来了试镜结果`);
}

function auditionResultMail(c: Company, node: CareerNode, pass: boolean): Omit<Mail, "id"> {
  const at = node.resultAt ?? Date.now();
  const base = { from: `${c.name} 选角组`, addr: `${c.id}@audition.local`, logo: c.name.slice(0, 1), at };
  if (!pass) {
    return {
      ...base, color: "#9a9a9a", subject: "[오디션 결과] 안내", subjectZh: "试镜结果通知",
      body: [
        { ko: "안녕하세요, 오디션팀입니다.", zh: `你好，这里是 ${c.name} 选角组。` },
        { ko: "이번 오디션에 함께해 주셔서 진심으로 감사합니다.", zh: "谢谢你参加这次试镜，真的非常感谢。" },
        { ko: "아쉽지만 이번에는 함께하지 못하게 되었습니다.", zh: "很遗憾，这次没能和你一起走下去。" },
        { ko: "앞으로의 활동을 응원하겠습니다.", zh: "以后也会为你加油的。" },
      ],
    };
  }
  const start = new Date(at + DAY);
  start.setHours(9, 0, 0, 0);
  const sd = start.getMonth() + 1, sday = start.getDate();
  return {
    ...base, color: "#a99ce8", subject: "[최종 합격] 안내드립니다", subjectZh: "最终录取通知",
    body: [
      { ko: "안녕하세요, 오디션팀입니다.", zh: `你好，这里是 ${c.name} 选角组。` },
      { ko: "지난 오디션에서 보여주신 가능성과 태도를 높이 평가했습니다.", zh: "在上一轮试镜里，我们高度认可你展现出来的可能性和态度。" },
      { ko: "아래 일정대로 입사를 진행해 주시기 바랍니다.", zh: "请按下面的时间办理入社。" },
      { ko: `입사일: ${sd}월 ${sday}일 오전 9시`, zh: `入社日：${sd}月${sday}日上午 9 点` },
      { ko: "기다리고 있겠습니다. 감사합니다.", zh: "等你的答复，谢谢。" },
    ],
    action: { kind: "offer", companyId: c.id, at: start.getTime(), place: `${c.name} 公司大楼`, prep: "", status: "new" },
  };
}

/** 去演某个节点：存一个「待开的戏」，剧情 app 打开时接着开 */
export function requestNodeScene(node: CareerNode): void {
  const premise = node.wish ? `${node.premise}（她想要的结果：${node.wish}。照这个结果写，写得合理，要有具体的原因）` : node.premise;
  kvSet(PENDING_SCENE_KEY, JSON.stringify({ nodeId: node.id, place: node.place, premise }));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "story" } }));
    window.dispatchEvent(new Event(OPEN_SCENE_EVENT));
  }
}

export function takePendingScene(): { nodeId: string; place: string; premise: string } | null {
  try {
    const raw = JSON.parse(kvGet(PENDING_SCENE_KEY) || "null");
    kvSet(PENDING_SCENE_KEY, "null");
    return raw && raw.place ? raw : null;
  } catch {
    return null;
  }
}

// ── 给 AI 看的：她现在在哪一步 ──

export function careerPromptBlock(): string {
  const career = loadCareer();
  const c = companyOf(career.companyId);
  if (career.stage === "pre" || !c) return ["【她现在】还没进任何公司。", applicationsBrief()].filter(Boolean).join("\n");
  const days = career.signedAt ? Math.max(1, Math.floor((Date.now() - career.signedAt) / DAY) + 1) : 1;
  const debut = debutPromptBlock();
  const next = career.nodes.filter(n => n.status === "pending" && n.dueAt > Date.now()).slice(0, 3)
    .map(n => `${new Date(n.dueAt).getMonth() + 1}月${new Date(n.dueAt).getDate()}日 ${n.title}`);
  return [
    career.stage === "idol" && career.debut?.team ? `【她现在】${c.name} 女团 ${career.debut.team.en} 的成员，刚出道（进公司第 ${days} 天）。` : `【她现在】${c.name} 的练习生，进公司第 ${days} 天。`,
    debut,
    `【公司】${c.name}：${c.scale}；${c.style}；练习生：${c.trainee}；名声：${c.fame}`,
    career.insider ? `【公司内部档案】\n${career.insider}` : "",
    career.roommates?.length ? `【她的室友】${career.roommates.map(id => loadCharacters().find(c => c.id === id)?.name).filter(Boolean).join("、")}` : "",
    career.facts.length ? `【戏里已经定下来的公司细节】\n${career.facts.slice(-30).map(f => `- ${f}`).join("\n")}` : "",
    next.length ? `【接下来的日程】${next.join("；")}` : "",
    starPromptBlock(),
    recentResults(career),
    lastRankLine(),
  ].filter(Boolean).join("\n\n");
}

/** 她投了哪些公司（直接读 IdolSearch 的数据，免得互相引用） */
function applicationsBrief(): string {
  try {
    const apps = (JSON.parse(kvGet("idol_search_v1") || "null") as { apps?: { companyId: string; status: string; at: number }[] } | null)?.apps ?? [];
    if (!apps.length) return "【她的投递】还没投过任何公司（要自己在网上搜公司投递）。";
    const label: Record<string, string> = { review: "审核中", invited: "邀请她去试镜", rejected: "没通过", silent: "还没回音", signed: "她已经接受了别家的录取" };
    return `【她的投递】${apps.map(a => `${companyOf(a.companyId)?.name}（${label[a.status] ?? a.status}）`).join("、")}`;
  } catch { return ""; }
}

/** 上次月末排名（直接读账本，免得互相引用） */
function lastRankLine(): string {
  try {
    const months = (JSON.parse(kvGet("idol_ledger_v1") || "null") as { months?: { month: string; rank: number; total: number; prevRank?: number }[] } | null)?.months ?? [];
    const m = months[months.length - 1];
    return m ? `【上次月末排名】${+m.month.split("-")[1]}月 第 ${m.rank} 名（共 ${m.total} 人）${m.prevRank ? `，再上次第 ${m.prevRank} 名` : ""}` : "";
  } catch { return ""; }
}

/** 最近过去的日程怎么样了（演了、打勾写的、请假、缺席），世界要知道 */
function recentResults(career: Career): string {
  const label: Record<string, string> = { done: "完成", leave: "请假", absent: "缺席", passed: "缺席" };
  const past = career.nodes.filter(n => label[n.status] && n.kind !== "custom" && n.kind !== "practice").sort((a, b) => b.dueAt - a.dueAt).slice(0, 8);
  if (!past.length) return "";
  return `【最近的日程结果】\n${past.map(n => `- ${new Date(n.dueAt).getMonth() + 1}月${new Date(n.dueAt).getDate()}日 ${n.title}：${label[n.status]}${n.result ? `（${n.result}）` : ""}`).join("\n")}`;
}

export function addCompanyFacts(facts: string[]): void {
  const clean = facts.map(f => f.trim()).filter(Boolean);
  if (!clean.length) return;
  const career = loadCareer();
  saveCareer({ ...career, facts: [...career.facts, ...clean.filter(f => !career.facts.includes(f))] });
}

// ── 每隔几秒看一眼：到点该提醒的提醒 ──

export function careerTick(notify: (msg: string) => void): void {
  if (!loadTraineeCard()) return;
  const now = Date.now();
  let career = loadCareer();
  let changed = false;
  if (career.stage === "pre" && !career.offersMadeAt) {
    career = { ...career, offers: makeOffers(now), offersMadeAt: now };
    changed = true;
  }
  const offers = career.offers.map(o => {
    // 时钟被往回拨了，邀请远在未来：改成一小时后到
    if (o.status === "new" && !o.notified && o.at - now > 7 * DAY) { changed = true; return { ...o, at: now + HOUR }; }
    if (o.status === "new" && !o.notified && now >= o.at) {
      const mail = addMail({ from: `${companyOf(o.companyId)?.name} 选角组`, addr: `${o.companyId}@audition.local`, logo: companyOf(o.companyId)?.name.slice(0, 1) || "A", color: "#a99ce8", subject: o.kind === "scout" ? "试镜邀请" : "试镜通知", body: [{ zh: o.message }], at: now });
      notify(`📩 ${companyOf(o.companyId)?.name} 发来了${o.kind === "scout" ? "试镜邀请" : "试镜通知"}，去「提醒事项」看看`);
      changed = true;
      return { ...o, notified: true, notice: { channel: "mail" as const, refId: mail.id, at: now } };
    }
    return o;
  });
  const nodes = career.nodes.map(n => {
    if (n.status !== "pending") return n;
    if (!n.remindedDue && now >= n.dueAt) { notify(n.kind === "custom" ? `⏰ 到点了：${n.title}` : `🎬[${n.id}] ${n.title}：${String(new Date(n.dueAt).getHours()).padStart(2, "0")}:${String(new Date(n.dueAt).getMinutes()).padStart(2, "0")} · ${n.place}。点这里进去`); changed = true; return { ...n, remindedDue: true, remindedEve: true }; }
    if (!n.remindedEve && now >= n.dueAt - DAY && n.kind !== "custom") { notify(`📅 明天：${n.title}`); changed = true; return { ...n, remindedEve: true }; }
    return n;
  });
  if (changed) saveCareer({ ...career, offers, nodes });
  if (career.stage === "trainee") extendSchedule();
}
