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
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { loadTraineeCard, saveTraineeCard, describeTrainee } from "./trainee-card";
import { upsertCalendarScheduleItem } from "./calendar-storage";
import { getWeekStartIso } from "./calendar-utils";

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

export type Offer = { id: string; companyId: string; kind: "scout" | "audition"; at: number; message: string; place: string; status: "new" | "accepted" | "declined"; notified?: boolean };
export type CareerNode = {
  id: string;
  kind: "audition" | "first_day" | "weekly" | "monthly";
  title: string;
  place: string;
  premise: string;
  dueAt: number;
  status: "pending" | "done" | "passed";
  companyId?: string;
  remindedEve?: boolean;
  remindedDue?: boolean;
};
export type Career = {
  stage: "pre" | "trainee";
  companyId?: string;
  signedAt?: number;
  insider?: string;
  facts: string[];
  offers: Offer[];
  nodes: CareerNode[];
  offersMadeAt?: number;
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
  kvSet(KEY, JSON.stringify(c));
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

function addToCalendar(node: CareerNode): void {
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
      emoji: node.kind === "monthly" ? "📋" : node.kind === "weekly" ? "🎬" : node.kind === "audition" ? "🎤" : "🏢",
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
  const pool = [...COMPANIES].sort(() => Math.random() - 0.5);
  const picks = pool.slice(0, scouted ? 3 : 2);
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
  if (!offer || !c) return null;
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
  };
  career.nodes = [...career.nodes, node];
  saveCareer(career);
  addToCalendar(node);
  return node;
}

export function declineOffer(offerId: string): void {
  const career = loadCareer();
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
【一周】几点到、上什么课、周几周评、月底月考怎么考、谁当评委
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
  const first = new Date(now + DAY);
  first.setHours(9, 0, 0, 0);
  const firstDay: CareerNode = {
    id: uid("node"), kind: "first_day", title: "进公司第一天", place: `${c.name} 公司大楼`,
    premise: "进公司的第一天：见练习生管理老师，分宿舍，见同期的练习生们。", dueAt: first.getTime(), status: "pending", companyId: c.id,
  };
  career.nodes = [...career.nodes.filter(n => n.status !== "pending" || n.kind === "audition"), firstDay];
  saveCareer(career);
  addToCalendar(firstDay);
  extendSchedule();
  const card = loadTraineeCard();
  if (card) saveTraineeCard({ ...card, company: c.name });
  try {
    const insider = await expandInsider(c);
    saveCareer({ ...loadCareer(), insider });
  } catch { /* 档案之后在提醒事项里点「重新生成」补 */ }
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

/** 节点那场戏演完了 */
export async function completeNode(nodeId: string): Promise<string | null> {
  const career = loadCareer();
  const node = career.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  saveCareer({ ...career, nodes: career.nodes.map(n => n.id === nodeId ? { ...n, status: "done" } : n) });
  if (node.kind === "audition" && node.companyId && loadCareer().stage === "pre") {
    await signCompany(node.companyId);
    return `签约了：${companyOf(node.companyId)?.name}`;
  }
  return null;
}

/** 去演某个节点：存一个「待开的戏」，剧情 app 打开时接着开 */
export function requestNodeScene(node: CareerNode): void {
  kvSet(PENDING_SCENE_KEY, JSON.stringify({ nodeId: node.id, place: node.place, premise: node.premise }));
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
  if (career.stage === "pre" || !c) return "【她现在】还没进任何公司。";
  const days = career.signedAt ? Math.max(1, Math.floor((Date.now() - career.signedAt) / DAY) + 1) : 1;
  const next = career.nodes.filter(n => n.status === "pending" && n.dueAt > Date.now()).slice(0, 3)
    .map(n => `${new Date(n.dueAt).getMonth() + 1}月${new Date(n.dueAt).getDate()}日 ${n.title}`);
  return [
    `【她现在】${c.name} 的练习生，进公司第 ${days} 天。`,
    `【公司】${c.name}：${c.scale}；${c.style}；练习生：${c.trainee}；名声：${c.fame}`,
    career.insider ? `【公司内部档案】\n${career.insider}` : "",
    career.facts.length ? `【戏里已经定下来的公司细节】\n${career.facts.slice(-30).map(f => `- ${f}`).join("\n")}` : "",
    next.length ? `【接下来的日程】${next.join("；")}` : "",
  ].filter(Boolean).join("\n\n");
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
      notify(`📩 ${companyOf(o.companyId)?.name} 发来了${o.kind === "scout" ? "试镜邀请" : "试镜通知"}，去「提醒事项」看看`);
      changed = true;
      return { ...o, notified: true };
    }
    return o;
  });
  const nodes = career.nodes.map(n => {
    if (n.status !== "pending") return n;
    if (now > n.dueAt + 12 * HOUR) { changed = true; return { ...n, status: "passed" as const }; }
    if (!n.remindedDue && now >= n.dueAt) { notify(`⏰ 到点了：${n.title}，去「提醒事项」开这场戏`); changed = true; return { ...n, remindedDue: true, remindedEve: true }; }
    if (!n.remindedEve && now >= n.dueAt - DAY) { notify(`📅 明天：${n.title}`); changed = true; return { ...n, remindedEve: true }; }
    return n;
  });
  if (changed) saveCareer({ ...career, offers, nodes });
  if (career.stage === "trainee") extendSchedule();
}
