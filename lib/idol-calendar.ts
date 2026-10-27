/**
 * 爱豆小手机的日历：只留她自己的日程，加「大事记」和「帮我排这周」。
 *
 * 大事记三种：
 * - 写死的：元旦、春节(설날)、中秋(추석)、圣诞、跨年、她的生日、公司年末演唱会、年末颁奖季，和发动机里的大事（选拔、出道）
 * - 世界的：AI 每月写一次（虚构前辈团回归、演唱会、综艺播出、同公司前辈活动），打开日历时补当月
 * - 她自己记的：随手写一笔，或让 AI 帮她写
 * 帮我排这周：AI 照她的身份和公司作息，只往空着的时间里填（练习、生活、录 cover……），绕开提醒事项里的事；排好的能改能删。
 */

import { kvGet, kvSet } from "./kv-db";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { getLunarInfo } from "./lunar";
import { COMPANIES, careerPromptBlock, companyOf, loadCareer } from "./idol-career";
import { loadTraineeCard, describeTrainee } from "./trainee-card";
import { loadCharacters } from "./character-storage";
import { loadProfiles } from "./idol-people";
import { deleteCalendarScheduleItem, loadOwnerCalendarPlans, upsertCalendarScheduleItem } from "./calendar-storage";
import { getWeekDates, getWeekStartIso, getWeekdayLabel, parseIsoDate } from "./calendar-utils";
import { parseScheduleLines } from "./calendar-engine";

export type AlmanacKind = "fixed" | "career" | "world" | "mine" | "birthday";
export type AlmanacItem = { id: string; date: string; title: string; note?: string; kind: AlmanacKind; /** 圈内大事是哪家公司的 */ company?: string };
type State = { mine: AlmanacItem[]; world: Record<string, AlmanacItem[]> };

const KEY = "idol_almanac_v1";
export const ALMANAC_EVENT = "idol-almanac-changed";
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function load(): State {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as State | null;
    if (raw) return { mine: raw.mine ?? [], world: raw.world ?? {} };
  } catch { /* 坏数据当新的 */ }
  return { mine: [], world: {} };
}
function save(s: State) {
  kvSet(KEY, JSON.stringify(s));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ALMANAC_EVENT));
}

function config() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "calendar");
  const chat = resolveBinding(loadBindingConfig(), undefined, "chat");
  const c = loadApiConfigs().find(x => x.id === (slot.apiConfigId || chat.apiConfigId)) ?? loadApiConfigs()[0];
  if (!c) throw new Error("还没配置 API");
  return c;
}

// ── 写死的 ──

export function findLunar(year: number, month: string, day: string, from: [number, number], to: [number, number]): string | null {
  const d = new Date(year, from[0], from[1]);
  const end = new Date(year, to[0], to[1]);
  while (d <= end) {
    const l = getLunarInfo(d);
    if (l && l.monthLabel === month && l.dayLabel === day) return isoOf(d);
    d.setDate(d.getDate() + 1);
  }
  return null;
}

export function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const d = new Date(year, month, 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 7 * (n - 1));
  return isoOf(d);
}

const fixedCache = new Map<string, AlmanacItem[]>();
function fixedFor(year: number): AlmanacItem[] {
  const card = loadTraineeCard();
  const career = loadCareer();
  const company = companyOf(career.companyId)?.name;
  const key = `${year}|${card?.birthday ?? ""}|${company ?? ""}`;
  const hit = fixedCache.get(key);
  if (hit) return hit;
  const out: AlmanacItem[] = [];
  const add = (date: string | null, title: string, note?: string) => { if (date) out.push({ id: `fixed_${date}_${title}`, date, title, note, kind: "fixed" }); };
  add(`${year}-01-01`, "元旦");
  add(findLunar(year, "正月", "初一", [0, 15], [1, 25]), "春节 · 설날", "韩国放三天假，练习生多半能回家");
  add(findLunar(year, "八月", "十五", [8, 1], [9, 15]), "中秋 · 추석", "韩国放三天假");
  add(`${year}-12-25`, "圣诞节");
  add(`${year}-12-31`, "跨年");
  if (card?.birthday && /^\d{4}-\d{2}-\d{2}$/.test(card.birthday)) add(`${year}-${card.birthday.slice(5)}`, "我的生日");
  if (company && career.stage !== "pre") add(nthWeekday(year, 11, 6, 3), `${company} 年末家族演唱会`, "全公司的艺人都上，练习生有时会被选去当伴舞");
  add(nthWeekday(year, 11, 3, 1), "年末颁奖季开始", "接下来一个月颁奖礼一场接一场");
  fixedCache.set(key, out);
  return out;
}

/** 发动机里的大事（选拔、出道那几件）也进大事记 */
function careerItems(): AlmanacItem[] {
  const career = loadCareer();
  const out: AlmanacItem[] = [];
  if (career.signedAt) out.push({ id: "career_signed", date: isoOf(new Date(career.signedAt)), title: `签约 ${companyOf(career.companyId)?.name ?? ""}`.trim(), kind: "career" });
  for (const n of career.nodes) {
    if (n.kind !== "selection" && n.kind !== "debut") continue;
    if (n.status === "declined") continue;
    out.push({ id: `career_${n.id}`, date: isoOf(new Date(n.dueAt)), title: n.step === "showcase" && career.debut?.team ? `${career.debut.team.en.toUpperCase()} 出道` : n.title, kind: "career" });
  }
  return out;
}

/** 主要人物的生日（只标注） */
function birthdays(y0: number, y1: number): AlmanacItem[] {
  const profiles = loadProfiles();
  const out: AlmanacItem[] = [];
  for (const c of loadCharacters()) {
    const p = profiles[c.id];
    if (!p || p.layer !== "main" || !p.birthday || !/^\d{2}-\d{2}$/.test(p.birthday)) continue;
    for (let y = y0; y <= y1; y++) out.push({ id: `bday_${c.id}_${y}`, date: `${y}-${p.birthday}`, title: `🎂${c.name}`, kind: "birthday" });
  }
  return out;
}

/** 某段日子里的所有大事记（按日期排） */
export function almanacBetween(fromIso: string, toIso: string): AlmanacItem[] {
  const s = load();
  const y0 = +fromIso.slice(0, 4), y1 = +toIso.slice(0, 4);
  const fixed: AlmanacItem[] = [];
  for (let y = y0; y <= y1; y++) fixed.push(...fixedFor(y));
  const all = [...fixed, ...careerItems(), ...birthdays(y0, y1), ...Object.values(s.world).flat(), ...s.mine];
  return all.filter(i => i.date >= fromIso && i.date <= toIso).sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export function almanacByDate(fromIso: string, toIso: string): Map<string, AlmanacItem[]> {
  const map = new Map<string, AlmanacItem[]>();
  for (const i of almanacBetween(fromIso, toIso)) map.set(i.date, [...(map.get(i.date) ?? []), i]);
  return map;
}

// ── 她自己记的 ──

export function addMine(date: string, title: string, note = ""): void {
  const s = load();
  save({ ...s, mine: [...s.mine, { id: uid("mine"), date, title: title.trim(), note: note.trim() || undefined, kind: "mine" }] });
}
export function updateItem(id: string, patch: { date?: string; title?: string; note?: string }): void {
  const s = load();
  const fix = (i: AlmanacItem) => i.id === id ? { ...i, ...patch, note: patch.note !== undefined ? patch.note.trim() || undefined : i.note } : i;
  save({ mine: s.mine.map(fix), world: Object.fromEntries(Object.entries(s.world).map(([k, v]) => [k, v.map(fix)])) });
}
export function deleteItem(id: string): void {
  const s = load();
  save({ mine: s.mine.filter(i => i.id !== id), world: Object.fromEntries(Object.entries(s.world).map(([k, v]) => [k, v.filter(i => i.id !== id)])) });
}

/** 让 AI 帮她把一句话写成一条大事记 */
export async function aiWriteMine(date: string, hint: string): Promise<{ title: string; note: string }> {
  const res = await simpleLLMCall(config(), [
    { role: "system", content: `你在帮一个韩国公司的练习生（她本人）在日历上记一笔大事记。只输出 JSON：{"title":"十个字以内的标题","note":"一两句备注，写具体"}。照她给的意思写，没给就照她现在的处境写一件这天可能值得记的事。\n\n${careerPromptBlock()}` },
    { role: "user", content: `日期：${date}\n她想记的：${hint || "（没写，你看着办）"}` },
  ], { temperature: 0.85, label: "大事记" });
  const j = JSON.parse(res.content?.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { title?: string; note?: string };
  if (!j.title) throw new Error(res.error || "AI 没回");
  return { title: String(j.title), note: String(j.note ?? "") };
}

// ── 世界的（AI 每月一次） ──

export function worldMonthDone(ym: string): boolean { return Boolean(load().world[ym]); }

let monthBusy = false;
/** 补某个月的圈内大事（已经有就不重复） */
export async function generateWorldMonth(ym: string, force = false): Promise<number> {
  if (monthBusy || (!force && worldMonthDone(ym)) || !loadTraineeCard()) return 0;
  monthBusy = true;
  try {
    const [y, m] = ym.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const profiles = loadProfiles();
    const idols = loadCharacters().filter(c => profiles[c.id]?.isIdol).map(c => `${c.name}（${profiles[c.id].role}）`).slice(0, 12);
    // 以前写过的团接着用，剧情好接
    const seen = [...new Set(Object.values(load().world).flat().map(i => `${i.title.split(/\s/)[0]}（${i.company ?? "?"}）`))].slice(-20);
    const names = COMPANIES.map(c => c.name).join("、");
    const res = await simpleLLMCall(config(), [
      {
        role: "system",
        content: `你在给一出韩国娱乐圈的戏写某个月的「圈内大事记」，放进她的日历。只输出 JSON：{"items":[{"day":数字,"company":"公司名或空","title":"十五字以内，带团名或人名","note":"一句话"}]}
写四到七件：前辈团回归、演唱会和巡演、粉丝见面会、综艺播出、同公司前辈的活动、新团出道、颁奖礼。团和人全部虚构（可以用下面已有的爱豆、以前出现过的团），不写真实艺人。跟某个团或艺人有关的才写 company（从这六家里挑：${names}），跟团无关的（颁奖礼、节目本身这类）company 写空。她所在的公司多写一两件。照这个年份当时的样子写。`,
      },
      { role: "user", content: `${y}年${m}月（共${days}天）\n\n${careerPromptBlock()}\n\n已有的爱豆：${idols.join("、") || "还没有"}\n以前出现过的团：${seen.join("、") || "还没有"}` },
    ], { temperature: 0.9, label: "圈内大事" });
    const j = JSON.parse(res.content?.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { items?: { day?: number; company?: string; title?: string; note?: string }[] };
    const items = (j.items ?? []).filter(i => i.title && i.day && i.day >= 1 && i.day <= days).map(i => ({
      id: uid("world"), date: `${y}-${pad(m)}-${pad(Number(i.day))}`, title: String(i.title), note: i.note ? String(i.note) : undefined, kind: "world" as const,
      company: i.company && i.company.trim() && i.company !== "圈内" ? String(i.company).trim() : undefined,
    }));
    if (!items.length) throw new Error(res.error || "AI 没写出来");
    const s = load();
    save({ ...s, world: { ...s.world, [ym]: items } });
    return items.length;
  } finally {
    monthBusy = false;
  }
}

// ── 帮我排这周 ──

const PLAN_PREFIX = "plan_";

export function clearMyPlan(weekStart: string): number {
  const plan = loadOwnerCalendarPlans("user", "self").find(p => p.weekStart === weekStart);
  const ids = plan?.items.filter(i => i.id.startsWith(PLAN_PREFIX)).map(i => i.id) ?? [];
  ids.forEach(id => deleteCalendarScheduleItem("user", "self", weekStart, id));
  return ids.length;
}

export async function planMyWeek(weekStart: string, wish: string): Promise<number> {
  const dates = getWeekDates(weekStart);
  const card = loadTraineeCard();
  const career = loadCareer();
  const startMs = parseIsoDate(dates[0]).getTime();
  const endMs = parseIsoDate(dates[6]).getTime() + 864e5;
  const busy = career.nodes
    .filter(n => (n.status === "pending" || n.status === "done") && n.dueAt >= startMs && n.dueAt < endMs)
    .map(n => { const d = new Date(n.dueAt); return `${isoOf(d)} ${pad(d.getHours())}:${pad(d.getMinutes())} 起约两小时：${n.title}（${n.place}）`; });
  const existing = (loadOwnerCalendarPlans("user", "self").find(p => p.weekStart === weekStart)?.items ?? [])
    .filter(i => !i.id.startsWith(PLAN_PREFIX) && !i.id.startsWith("idol_"))
    .map(i => `${i.date} ${i.startTime}-${i.endTime}：${i.title}`);
  const marks = almanacBetween(dates[0], dates[6]).map(i => `${i.date}：${i.title}`);
  const res = await simpleLLMCall(config(), [
    {
      role: "system",
      content: `你在帮她（韩国公司的练习生）排这一周空着的时间，给她一点「今天可以做什么」的灵感。
每行一条，格式：YYYY-MM-DD|周几|开始时间|结束时间|地点|emoji|事项。只输出这些行。
规矩：
- 只填空档，不能跟【已经定了的】重叠，前后留半小时
- 照她的身份、公司内部作息、她擅长和想补的东西排：练习室加练、声乐自练、看前辈舞台视频、语言课作业、录 cover、买生活用品、洗衣服、跟室友去吃饭、回复家里、早点睡……要具体，有地点
- 每天两到四条，周末可以松一点，节日按节日过
- 事项十五字以内`,
    },
    {
      role: "user",
      content: [
        `这周：${dates[0]} 到 ${dates[6]}（${dates.map(d => getWeekdayLabel(d)).join("、")}）`,
        card ? `【她】\n${describeTrainee(card)}` : "",
        careerPromptBlock(),
        busy.length ? `【已经定了的（提醒事项）】\n${busy.join("\n")}` : "",
        existing.length ? `【她自己排的】\n${existing.join("\n")}` : "",
        marks.length ? `【这周的大事记】\n${marks.join("\n")}` : "",
        wish ? `【她这周想】${wish}` : "",
      ].filter(Boolean).join("\n\n"),
    },
  ], { temperature: 0.85, label: "排这周" });
  const items = parseScheduleLines(res.content || "", weekStart);
  if (!items.length) throw new Error(res.error || "AI 排出来的看不懂，再试一次");
  clearMyPlan(weekStart);
  for (const it of items) {
    upsertCalendarScheduleItem("user", "self", getWeekStartIso(parseIsoDate(it.date)), { ...it, id: uid(PLAN_PREFIX.slice(0, -1)), source: "generated" });
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("calendar-updated"));
  return items.length;
}
