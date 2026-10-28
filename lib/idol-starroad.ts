/**
 * 爱豆小手机：星路（她自己的事业手帐）。规矩见 docs/idol/destiny.md 第 2 节。
 *
 * - 八门课 A～F：开局打勾的 B、没打勾的 D。等级只跟她自己比，**绝不把档位写进给 AI 的提示**，AI 只知道「最近进步了 / 退步了」
 * - 进度全由代码算：公司课表（默认去了）、老师每周作业（提醒事项 homework）、自己加练（提醒事项 practice、此刻里练）、周评月考
 * - 旷课只看「上课那段时间人在不在公司」：请假不涨不罚；此刻里在公司外 / 答应的约撞课 = 旷课
 */

import { kvGet, kvSet } from "./kv-db";
import { loadTraineeCard } from "./trainee-card";
import { addToCalendar, loadCareer, saveCareer, type CareerNode } from "./idol-career";

const KEY = "idol_starroad_v1";
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const STARROAD_EVENT = "idol-starroad-changed";

export type Subject = "vocal" | "dance" | "rap" | "compose" | "acting" | "variety" | "language" | "visual";
export const SUBJECTS: { id: Subject; en: string; zh: string; cls: string }[] = [
  { id: "vocal", en: "Vocal", zh: "唱歌", cls: "声乐课" },
  { id: "dance", en: "Dance", zh: "跳舞", cls: "舞蹈课" },
  { id: "rap", en: "Rap", zh: "Rap", cls: "Rap 课" },
  { id: "compose", en: "Creation", zh: "创作", cls: "作曲课" },
  { id: "acting", en: "Acting", zh: "演技", cls: "演技课" },
  { id: "variety", en: "Variety", zh: "综艺感", cls: "镜头课" },
  { id: "language", en: "Language", zh: "语言", cls: "语言课" },
  { id: "visual", en: "Visual", zh: "颜值", cls: "形象管理" },
];
export const subjectOf = (id?: string) => SUBJECTS.find(s => s.id === id);

export const GRADES = ["F", "D", "C", "B", "A"] as const;
export type Grade = typeof GRADES[number];
/** 一档要攒的分；一次加练 3 分 */
export const NEED = 26;
const PRACTICE_PTS = 3;
/** 同一门两次升档至少隔六周 */
const MIN_GAP = 42 * DAY;
/** 两个月完全没碰退一档 */
const IDLE = 60 * DAY;

export type SubjectState = { grade: Grade; pts: number; changedAt: number; touchedAt: number; last?: { at: number; dir: "up" | "down"; from: Grade; to: Grade } };

/** 课表里的一节。parity：两周一次的课，0 = 单周、1 = 双周 */
export type Slot = { dow: number; start: string; end: string; subject: Subject | null; label: string; parity?: 0 | 1; extra?: boolean };
export type ClassLeave = { date: string; subject?: Subject };
export type ClassMark = { at: number; subject: Subject | null; label: string; status: "attend" | "official" | "leave" | "skip" };

type State = {
  subjects: Record<Subject, SubjectState>;
  slots: Slot[];
  /** 课表从哪天起用（下一次三个月后换） */
  slotsFrom: number;
  /** 课算到哪儿了 */
  checkedUntil: number;
  leaves: ClassLeave[];
  /** 最近两周每节课怎么样了（课表页显示） */
  marks: ClassMark[];
  skips: { at: number; subject: Subject | null }[];
  /** 最近一次布置作业的那周（周一日期） */
  homeworkWeek?: string;
  homeworkLog: Subject[];
  /** 这天已经加练过（世界日期） */
  practiceDays: string[];
  /** 打勾、演完时升了档：下一次 tick 弹横幅 */
  pending?: string[];
};

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const mdLabel = (t: number) => `${new Date(t).getMonth() + 1}月${new Date(t).getDate()}日`;
const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function mondayOf(t: number): number { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
const weekNo = (t: number) => Math.floor(mondayOf(t) / (7 * DAY));

function emit() { if (typeof window !== "undefined") window.dispatchEvent(new Event(STARROAD_EVENT)); }

function load(): State | null {
  try { return JSON.parse(kvGet(KEY) || "null") as State | null; } catch { return null; }
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); emit(); }

/** 签约（进公司那天）起算；没进公司就没有星路 */
function ensure(): State | null {
  const have = load();
  if (have) return have;
  const career = loadCareer();
  if (career.stage === "pre" || !career.companyId) return null;
  const card = loadTraineeCard();
  const picked = new Set(card?.talents ?? []);
  const start = career.signedAt ?? Date.now();
  const subjects = Object.fromEntries(SUBJECTS.map(s => [s.id, { grade: picked.has(s.id) ? "B" : "D", pts: 0, changedAt: start, touchedAt: start }])) as Record<Subject, SubjectState>;
  const firstClass = new Date(start + DAY); firstClass.setHours(0, 0, 0, 0);
  const s: State = { subjects, slots: [], slotsFrom: firstClass.getTime(), checkedUntil: firstClass.getTime() + DAY, leaves: [], marks: [], skips: [], homeworkLog: [], practiceDays: [] };
  s.slots = buildTimetable(career.companyId, s.subjects, weekNo(start));
  save(s);
  return s;
}

// ── 课表 ──

/** 每周几节（两周一次 = 0.5）；公司各有侧重 */
function weeklyCounts(companyId: string): Record<Subject, number> {
  const c: Record<Subject, number> = { vocal: 3, dance: 3, rap: 2, language: 2, acting: 1, compose: 1, variety: 0.5, visual: 0.5 };
  if (companyId === "hybe" || companyId === "cube") c.compose = 2;
  if (companyId === "yg") c.rap = 3;
  if (companyId === "sm") { c.language = 3; c.visual = 1; }
  if (companyId === "starship") { c.visual = 1; c.variety = 1; }
  return c;
}
/** 不算进八门、只当场景的课 */
const SIDE_CLASSES: Record<string, string[]> = { jyp: ["体能课", "人性课"], sm: ["礼仪课"] };

const TIMES: [string, string][] = [["10:00", "12:00"], ["14:00", "16:00"], ["16:30", "18:30"], ["19:30", "21:00"]];

function buildTimetable(companyId: string, subjects: Record<Subject, SubjectState>, seed: number): Slot[] {
  const counts = weeklyCounts(companyId);
  // 弱的那门多一节（三个月换一次课表时按当时的等级挑）
  const weakest = [...SUBJECTS].sort((a, b) => GRADES.indexOf(subjects[a.id].grade) - GRADES.indexOf(subjects[b.id].grade) || subjects[a.id].pts - subjects[b.id].pts)[0].id;
  type Want = { subject: Subject | null; label: string; parity?: 0 | 1; extra?: boolean; pair?: Want };
  const wants: Want[] = [];
  for (const s of SUBJECTS) {
    const n = counts[s.id];
    for (let i = 0; i < Math.floor(n); i++) wants.push({ subject: s.id, label: s.cls });
  }
  wants.push({ subject: weakest, label: `${subjectOf(weakest)!.cls}（加强）`, extra: true });
  const halves = SUBJECTS.filter(s => counts[s.id] % 1 !== 0);
  for (let i = 0; i < halves.length; i += 2) {
    const a = halves[i], b = halves[i + 1];
    wants.push({ subject: a.id, label: a.cls, parity: 0, pair: b ? { subject: b.id, label: b.cls, parity: 1 } : undefined });
  }
  for (const label of SIDE_CLASSES[companyId] ?? []) wants.push({ subject: null, label });
  // 摆进格子：周一到周五四个时段（周五 16:30 以后有周评不排），同一天同一门不排两节
  const cells: { dow: number; t: number }[] = [];
  for (let t = 0; t < TIMES.length; t++) for (let dow = 1; dow <= 5; dow++) if (!(dow === 5 && t >= 2)) cells.push({ dow, t });
  const rot = Math.abs(seed) % 5;
  const order = cells.map((c, i) => ({ c, k: ((c.dow + rot) % 5) + c.t * 5 + i * 0.001 })).sort((a, b) => a.k - b.k).map(x => x.c);
  const slots: Slot[] = [];
  const used = new Set<string>();
  const dayHas = (dow: number, subject: Subject | null) => subject != null && slots.some(s => s.dow === dow && s.subject === subject);
  // 唱跳先排白天
  const sorted = [...wants].sort((a, b) => (b.subject === "dance" || b.subject === "vocal" ? 1 : 0) - (a.subject === "dance" || a.subject === "vocal" ? 1 : 0));
  for (const w of sorted) {
    const cell = order.find(c => !used.has(`${c.dow}:${c.t}`) && !dayHas(c.dow, w.subject)) ?? order.find(c => !used.has(`${c.dow}:${c.t}`));
    if (!cell) break;
    used.add(`${cell.dow}:${cell.t}`);
    const [start, end] = TIMES[cell.t];
    slots.push({ dow: cell.dow, start, end, subject: w.subject, label: w.label, ...(w.parity != null ? { parity: w.parity } : {}), ...(w.extra ? { extra: true } : {}) });
    if (w.pair) slots.push({ dow: cell.dow, start, end, subject: w.pair.subject, label: w.pair.label, parity: w.pair.parity });
  }
  return slots.sort((a, b) => a.dow - b.dow || a.start.localeCompare(b.start));
}

const at = (dayStart: number, hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return dayStart + h * HOUR + m * MIN; };

/** 某一天要上的课（单双周已经挑好） */
function classesOn(s: State, dayStart: number): { slot: Slot; start: number; end: number }[] {
  const dow = new Date(dayStart).getDay();
  const parity = weekNo(dayStart) % 2;
  return s.slots.filter(sl => sl.dow === dow && (sl.parity == null || sl.parity === parity)).map(slot => ({ slot, start: at(dayStart, slot.start), end: at(dayStart, slot.end) }));
}

/** 这个时间是不是在上课（给提醒事项、此刻提示用） */
export function classAt(t: number): string | null {
  const s = load();
  const career = loadCareer();
  if (!s || career.stage !== "trainee" || t < (career.signedAt ?? 0) + DAY) return null;
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  const hit = classesOn(s, d.getTime()).find(c => t >= c.start - 30 * MIN && t < c.end);
  return hit ? `${hit.slot.label} ${hit.slot.start}～${hit.slot.end}` : null;
}

/** 课表页：这一周（周一起）每天的课 + 已经过去的那几节怎么样了 */
export function weekTimetable(weekStart = mondayOf(Date.now())): { day: number; label: string; classes: { label: string; start: string; end: string; extra?: boolean; status?: ClassMark["status"]; leave?: boolean }[] }[] {
  const s = ensure();
  if (!s) return [];
  const out = [];
  for (let i = 0; i < 7; i++) {
    const day = weekStart + i * DAY;
    const list = classesOn(s, day).map(c => {
      const mark = s.marks.find(m => m.at === c.start);
      return { label: c.slot.label, start: c.slot.start, end: c.slot.end, extra: c.slot.extra, status: mark?.status, leave: isLeave(s, day, c.slot.subject) };
    });
    out.push({ day, label: `${WEEK[new Date(day).getDay()]} ${mdLabel(day)}`, classes: list });
  }
  return out;
}

// ── 进度 ──

function tryUp(s: State, subject: Subject, now: number): string | null {
  const st = s.subjects[subject];
  if (st.grade === "A") { st.pts = Math.min(st.pts, NEED); return null; }
  if (st.pts < NEED || now - st.changedAt < MIN_GAP) return null;
  const from = st.grade;
  st.grade = GRADES[GRADES.indexOf(st.grade) + 1];
  st.pts -= NEED;
  st.changedAt = now;
  st.last = { at: now, dir: "up", from, to: st.grade };
  return `🌠 星路：${subjectOf(subject)!.zh}升到 ${st.grade} 了`;
}

function bump(s: State, subject: Subject, pts: number, now: number): string | null {
  const st = s.subjects[subject];
  st.touchedAt = Math.max(st.touchedAt, now);
  st.pts = Math.max(0, st.pts + pts);
  return tryUp(s, subject, now);
}

/** 两个月没碰退一档（最低 D）；攒够了但没到六周的，到点自己升 */
function settle(s: State, now: number): string[] {
  const out: string[] = [];
  for (const sub of SUBJECTS) {
    const st = s.subjects[sub.id];
    if (now - st.touchedAt > IDLE && GRADES.indexOf(st.grade) > GRADES.indexOf("D")) {
      const from = st.grade;
      st.grade = GRADES[GRADES.indexOf(st.grade) - 1];
      st.pts = Math.floor(NEED / 2);
      st.changedAt = now; st.touchedAt = now;
      st.last = { at: now, dir: "down", from, to: st.grade };
      out.push(`🌠 星路：${sub.zh}两个月没练，退到 ${st.grade} 了`);
    } else {
      const msg = tryUp(s, sub.id, now);
      if (msg) out.push(msg);
    }
  }
  return out;
}

export type GradeView = { id: Subject; en: string; zh: string; grade: Grade; pts: number; left: number; waitDays: number; last?: SubjectState["last"] };

/** 成绩单：每门现在几档、离下一档还差几次加练 */
export function loadGrades(): GradeView[] {
  const s = ensure();
  const now = Date.now();
  return SUBJECTS.map(sub => {
    const st = s?.subjects[sub.id] ?? { grade: "D" as Grade, pts: 0, changedAt: now, touchedAt: now };
    const left = st.grade === "A" ? 0 : Math.max(0, Math.ceil((NEED - st.pts) / PRACTICE_PTS));
    const waitDays = st.grade !== "A" && left === 0 ? Math.max(0, Math.ceil((st.changedAt + MIN_GAP - now) / DAY)) : 0;
    return { id: sub.id, en: sub.en, zh: sub.zh, grade: st.grade, pts: st.pts, left, waitDays, last: st.last };
  });
}

export function starroadReady(): boolean { return Boolean(ensure()); }

// ── 加练 ──

/** 今天（世界日期）加练过没有：提醒事项里排了的也算 */
export function practicedToday(now = Date.now()): boolean {
  const s = load();
  const day = dayKey(now);
  if (s?.practiceDays.includes(day)) return true;
  return loadCareer().nodes.some(n => n.kind === "practice" && dayKey(n.dueAt) === day && n.status !== "declined");
}

/** 星路点「加练」：进提醒事项「我自己记的」，今晚九点（过了就明晚）打勾写一句就算 */
export function addPractice(subject: Subject): CareerNode | null {
  const s = ensure();
  if (!s) return null;
  const now = Date.now();
  const d = new Date(now); d.setHours(21, 0, 0, 0);
  if (d.getTime() < now + 30 * MIN) d.setDate(d.getDate() + 1);
  if (practicedToday(d.getTime())) return null;
  const sub = subjectOf(subject)!;
  const career = loadCareer();
  const node: CareerNode = {
    id: uid("node"), kind: "practice", subject, title: `加练：${sub.zh}`, place: "公司 练习室",
    premise: `她下课后自己留在练习室加练${sub.zh}。`, dueAt: d.getTime(), status: "pending",
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  addToCalendar(node);
  return node;
}

// ── 记账入口（提醒事项打勾、此刻结束时调） ──

function perfPts(perf: string | undefined, base: number) {
  return perf === "good" ? base + 2 : perf === "bad" ? Math.max(1, base - 3) : base;
}

/** 提醒事项里的事做完了（打勾或演完）。perf 是此刻记账时 AI 判的 good/ok/bad，打勾时看那一句 */
export function onNodeDone(node: CareerNode, perf?: string): string[] {
  const s = ensure();
  if (!s) return [];
  const now = Date.now();
  const out: string[] = [];
  const sub = node.subject as Subject | undefined;
  if (node.kind === "homework" && sub) { const m = bump(s, sub, perfPts(perf, 8), now); if (m) out.push(m); }
  if (node.kind === "practice" && sub) {
    const day = dayKey(node.dueAt);
    if (!s.practiceDays.includes(day)) s.practiceDays = [...s.practiceDays.slice(-60), day];
    const m = bump(s, sub, PRACTICE_PTS + (perf === "good" ? 1 : 0), now); if (m) out.push(m);
  }
  if (node.kind === "weekly" || node.kind === "monthly") {
    for (const id of ["vocal", "dance", "rap"] as Subject[]) { const m = bump(s, id, perfPts(perf, node.kind === "monthly" ? 3 : 2) - 1, now); if (m) out.push(m); }
  }
  s.pending = [...(s.pending ?? []), ...out];
  save(s);
  return out;
}

/** 此刻里自己练了（结束这一场时 AI 说练了哪几门）：一天只算一次加练 */
export function onScenePractice(subjects: string[], startAt: number, perf?: string): string[] {
  const s = ensure();
  if (!s) return [];
  const valid = subjects.filter((x): x is Subject => Boolean(subjectOf(x))).slice(0, 2);
  const day = dayKey(startAt);
  if (!valid.length || s.practiceDays.includes(day)) return [];
  s.practiceDays = [...s.practiceDays.slice(-60), day];
  const out: string[] = [];
  for (const id of valid) { const m = bump(s, id, PRACTICE_PTS + 1 + (perf === "good" ? 1 : 0), Date.now()); if (m) out.push(m); }
  s.pending = [...(s.pending ?? []), ...out];
  save(s);
  return out;
}

// ── 请假 ──

function isLeave(s: State, day: number, subject: Subject | null): boolean {
  const k = dayKey(day);
  return s.leaves.some(l => l.date === k && (!l.subject || l.subject === subject));
}

/** 室长在 KakaoTalk 批了的假：「10月30日」整天，或「10月30日 声乐课」一节。返回说给她听的那句，认不出返回 null */
export function leaveFromMarker(text: string): string | null {
  const s = ensure();
  if (!s) return null;
  const m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (!m) return null;
  const now = new Date();
  let y = now.getFullYear();
  if (+m[1] < now.getMonth() + 1 - 6) y += 1;
  const day = new Date(y, +m[1] - 1, +m[2]).getTime();
  const sub = SUBJECTS.find(x => text.includes(x.cls.replace(/ 课$/, "")) || text.includes(x.zh) || text.includes(x.en));
  const date = dayKey(day);
  if (!s.leaves.some(l => l.date === date && l.subject === sub?.id)) s.leaves = [...s.leaves.filter(l => dayKey(Date.now() - 30 * DAY) <= l.date), { date, ...(sub ? { subject: sub.id } : {}) }];
  save(s);
  return sub ? `${mdLabel(day)} ${sub.cls}请好假了` : `${mdLabel(day)} 一整天的课请好假了`;
}

/** 给室长看的：接下来三天的课，按日期 */
export function classesForTeacher(): string {
  const s = ensure();
  if (!s) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lines: string[] = [];
  for (let i = 0; i < 4; i++) {
    const day = today.getTime() + i * DAY;
    const list = classesOn(s, day).filter(c => c.end > Date.now());
    if (list.length) lines.push(`${mdLabel(day)}（${WEEK[new Date(day).getDay()]}）：${list.map(c => `${c.slot.label} ${c.slot.start}${isLeave(s, day, c.slot.subject) ? "（已请假）" : ""}`).join("、")}`);
  }
  return lines.join("\n");
}

// ── 给 AI 看的：只有变化，没有档位 ──

export function starPromptBlock(): string {
  const s = load();
  if (!s || loadCareer().stage !== "trainee") return "";
  const now = Date.now();
  const recent = SUBJECTS.map(sub => ({ sub, last: s.subjects[sub.id].last })).filter(x => x.last && now - x.last.at < 21 * DAY);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todays = classesOn(s, today.getTime());
  const leaveToday = s.leaves.filter(l => l.date === dayKey(now));
  return [
    `【她的课】工作日白天在公司上课（${[...new Set(s.slots.map(x => `${WEEK[x.dow]} ${x.start}`))].length} 节/周，大多 10:00～18:30，个别晚上）。平常约她尽量排在晚上或周末。`,
    "【课以课表为准】公司内部档案里如果写了别的课，以这里的课表为准。",
    todays.length ? `【今天的课】${todays.map(c => `${c.slot.label} ${c.slot.start}～${c.slot.end}`).join("、")}` : "",
    leaveToday.length ? `【今天请假】她今天${leaveToday.some(l => !l.subject) ? "请了一整天的假" : `请假没去${leaveToday.map(l => subjectOf(l.subject)?.cls).join("、")}`}，室长批了的。` : "",
    recent.length ? `【她最近的变化】${recent.map(x => `${x.sub.zh}${x.last!.dir === "up" ? "最近明显进步了" : "最近有点退步"}`).join("；")}（只说变化，不代表她和别人比的水平；她的水平以她自己在戏里怎么写为准）` : "",
  ].filter(Boolean).join("\n");
}

// ── 每隔几秒：上过的课记账、旷课、每周作业、三个月换课表 ──

type Stage = { startAt: number; place: string; bg?: string };

function stageScenes(): Stage[] {
  try { return Object.values(JSON.parse(kvGet("idol_stage_scenes_v1") || "{}") as Record<string, Stage>); } catch { return []; }
}
const inCompany = (sc: Stage) => {
  const k = sc.bg || sc.place || "";
  return k === "公司" || k.startsWith("公司·") || /公司|练习室|录音室/.test(sc.place || "");
};
const OFFICIAL = new Set(["weekly", "monthly", "talk", "makeup", "selection", "debut", "event", "chance", "first_day", "audition", "homework"]);

function judge(s: State, career: ReturnType<typeof loadCareer>, scenes: Stage[], day: number, c: { slot: Slot; start: number; end: number }): ClassMark["status"] {
  if (isLeave(s, day, c.slot.subject)) return "leave";
  const overlap = (t: number) => t >= c.start - HOUR && t < c.end;
  if (career.nodes.some(n => OFFICIAL.has(n.kind) && overlap(n.dueAt) && n.status !== "declined" && n.status !== "invite")) return "official";
  if (career.nodes.some(n => n.kind === "date" && n.status === "done" && overlap(n.dueAt))) return "skip";
  if (scenes.some(sc => overlap(sc.startAt) && !inCompany(sc))) return "skip";
  return "attend";
}

export function starroadTick(notify: (msg: string) => void): void {
  const career = loadCareer();
  if (career.stage !== "trainee") return;
  const s = ensure();
  if (!s) return;
  const now = Date.now();
  const msgs: string[] = [...(s.pending ?? [])];
  s.pending = [];
  // 时钟被往回拨了：从现在重新算
  if (s.checkedUntil > now + DAY) s.checkedUntil = now;
  // 三个月换一次课表
  if (now - s.slotsFrom > 91 * DAY) {
    s.slots = buildTimetable(career.companyId!, s.subjects, weekNo(now));
    s.slotsFrom = now;
    msgs.push("📅 课表：换新课表了，去提醒事项看看");
  }
  // 上完的课：从上次算到的地方往后，最多补 21 天
  const scenes = stageScenes();
  let day = new Date(Math.max(s.checkedUntil, now - 21 * DAY)); day.setHours(0, 0, 0, 0);
  const firstSkips: string[] = [];
  for (let t = day.getTime(); t <= now; t += DAY) {
    for (const c of classesOn(s, t)) {
      if (c.end > now || c.end <= s.checkedUntil) continue;
      const status = judge(s, career, scenes, t, c);
      s.marks = [...s.marks.filter(m => m.at > now - 15 * DAY && m.at !== c.start), { at: c.start, subject: c.slot.subject, label: c.slot.label, status }];
      const sub = c.slot.subject;
      if (sub && (status === "attend" || status === "official")) {
        const per = 1 / Math.max(0.5, weeklyCounts(career.companyId!)[sub]);
        const m = bump(s, sub, per, c.end); if (m) msgs.push(m);
      }
      if (status === "skip") {
        s.skips = [...s.skips.filter(k => k.at > now - 31 * DAY), { at: c.start, subject: sub }];
        firstSkips.push(c.slot.label);
      }
    }
  }
  s.checkedUntil = now;
  msgs.push(...settle(s, now));
  // 每周一早上九点：这周的作业
  const mon = mondayOf(now);
  const weekKey = dayKey(mon);
  if (s.homeworkWeek !== weekKey && now >= mon + 9 * HOUR && now < mon + 4 * DAY && now - (career.signedAt ?? 0) > 3 * DAY) {
    s.homeworkWeek = weekKey;
    const sub = pickHomework(s, career.companyId!);
    s.homeworkLog = [...s.homeworkLog.slice(-11), sub];
    void assignHomework(sub, mon);
  }
  save(s);
  for (const m of msgs) notify(m);
  if (firstSkips.length) void onSkipped(firstSkips, s);
}

/** 上课少的、档低的、最近没布置过的优先 */
function pickHomework(s: State, companyId: string): Subject {
  const counts = weeklyCounts(companyId);
  const recent = s.homeworkLog.slice(-4);
  return [...SUBJECTS].map(sub => ({ id: sub.id, w: counts[sub.id] + GRADES.indexOf(s.subjects[sub.id].grade) * 0.6 + recent.filter(r => r === sub.id).length * 3 + Math.random() })).sort((a, b) => a.w - b.w)[0].id;
}

const HOMEWORK_TITLE: Record<Subject, string> = {
  vocal: "声乐作业", dance: "舞蹈作业", rap: "Rap 作业", compose: "创作作业",
  acting: "演技作业", variety: "拍一条练习生 vlog", language: "语言作业", visual: "拍宣材照",
};

async function assignHomework(subject: Subject, monday: number): Promise<void> {
  const sub = subjectOf(subject)!;
  const due = new Date(monday + 4 * DAY); due.setHours(15, 0, 0, 0);
  const { teacherOf, queueMessage } = await import("./idol-reminders");
  const teacher = teacherOf();
  const career = loadCareer();
  const node: CareerNode = {
    id: uid("node"), kind: "homework", subject, title: HOMEWORK_TITLE[subject], place: subject === "visual" ? "公司 摄影棚" : "公司 练习室",
    premise: `这周${sub.cls}老师留的作业（${sub.zh}），周五下午交给老师看。`, dueAt: due.getTime(), status: "pending",
    companyId: career.companyId, from: teacher?.name, fromId: teacher?.id,
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  addToCalendar(node);
  if (teacher) queueMessage(teacher.id, `通知她这周的作业：${sub.cls}老师让她练${sub.zh}，你替老师具体说要练什么、做到什么程度（自己定，具体一点），周五下午三点交。一两句，像室长平时在 KakaoTalk 通知。`, 2 * MIN);
}

/** 旷课：第一次室长来问；一个月第二次起叫去办公室，那门扣一次加练的进度 */
async function onSkipped(labels: string[], s: State): Promise<void> {
  const { teacherOf, queueMessage } = await import("./idol-reminders");
  const teacher = teacherOf();
  if (!teacher) return;
  if (s.skips.length <= labels.length) {
    queueMessage(teacher.id, `她今天没来上${labels.join("、")}，也没请假。发消息问她怎么回事。`, 5 * MIN);
    return;
  }
  const st = load();
  if (st) {
    for (const k of st.skips.slice(-labels.length)) if (k.subject) st.subjects[k.subject].pts = Math.max(0, st.subjects[k.subject].pts - PRACTICE_PTS);
    save(st);
  }
  const career = loadCareer();
  const d = new Date(Date.now() + DAY); d.setHours(15, 0, 0, 0);
  const talk: CareerNode = {
    id: uid("node"), kind: "talk", title: `去办公室找${teacher.name}室长`, place: "公司 办公室",
    premise: `她这个月已经旷了好几节课（最近一次是${labels.join("、")}），${teacher.name}室长叫她来办公室谈话。`, dueAt: d.getTime(), status: "pending",
    companyId: career.companyId, from: teacher.name, fromId: teacher.id,
  };
  saveCareer({ ...career, nodes: [...career.nodes, talk].sort((a, b) => a.dueAt - b.dueAt) });
  addToCalendar(talk);
  queueMessage(teacher.id, `她又没来上${labels.join("、")}，也没请假，这个月已经不是第一次了。通知她明天下午三点来办公室找你，语气按你的性格。`, 5 * MIN);
}
