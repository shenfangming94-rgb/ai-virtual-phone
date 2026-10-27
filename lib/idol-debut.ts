/**
 * 爱豆小手机：往出道走（她选 B：可能推迟，最后一定出道）。
 *
 * - 按练习生证「多久出道」定目标；目标前两个半月排「出道组选拔」（提醒事项里的一项，演/打勾/缺席）
 * - 选拔对账：月末排名 + 最近的账；够了进出道组，不够推迟三个月再选，门槛一次比一次低，第三次一定进
 * - 进了：第二天管理老师私聊发「데뷔조 명단.jpg」（d1）→ 五天后经纪人拉「PROJECT X（暂定）」群发定位卡（d2）
 *   → 三周后「队名公布」那场（演完/打勾/没去都会公布）群里发队名海报（d3），群名换成队名
 *   → 录出道曲、拍 MV、出道 Showcase 进提醒事项；锁屏出现 D-N 小组件（d4）
 *   → 出道当天早上手机锁上，锁屏一串通知（d5）
 * 一次 AI 调用把队名、定位、大家的话都定好（之后照着发，不会前后对不上）。
 */

import { fameEvent } from "./idol-fame";
import { kvGet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import { addChatContact, createGroupSession, createOrGetSession, loadChatContacts, loadChatSessions, pushChatMessage, saveChatSessions } from "./chat-storage";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding, resolveUserIdentity } from "./settings-storage";
import { addToCalendar, companyOf, loadCareer, saveCareer, type CareerNode } from "./idol-career";
import { createPerson, draftFields, draftPerson, emptyProfile, getProfile, loadProfiles, relationOf, rollFace, saveProfile } from "./idol-people";
import { genKakaoId } from "./idol-kakao";
import { loadTraineeCard } from "./trainee-card";
import { drawDebutList, drawPositionCard, drawTeamPoster, type Team } from "./idol-debut-image";
import { markNotesSeen, pushLockNote } from "./idol-notes";
import { LOCK_NOW_EVENT } from "./lock-screen";
import { queueMessage, teacherOf } from "./idol-reminders";

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ME = "__me__";

export type DebutMember = { id: string; name: string; ko: string; nation: string; birthday: string; positions: { zh: string; ko: string }[] };
type Step = { kind: "list" | "group" | "dday"; at: number; done?: boolean };
export type Debut = {
  targetAt: number;
  attempt: number;
  status: "waiting" | "selected" | "named" | "debuted";
  codename: string;
  delays: string[];
  members?: DebutMember[];
  team?: Team;
  song?: string;
  managerId?: string;
  groupId?: string;
  debutAt?: number;
  /** 群里定位卡发出去的时间（D-N 进度条从这里算） */
  formedAt?: number;
  steps: Step[];
  words?: Words;
};
type Line = { who: string; text: string };
type Words = { teacherMsg: string; managerMsg: string; d2React: Line[]; d3Msg: string; d3React: Line[]; ddayGroup?: Line; momMsg: string; news: { title: string; text: string } };

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const at = (ms: number, h: number, m = 0) => { const d = new Date(ms); d.setHours(h, m, 0, 0); return d.getTime(); };
const md = (ms: number) => `${new Date(ms).getMonth() + 1}月${new Date(ms).getDate()}日`;

export const DEBUT_EVENT = "idol-debut-changed";

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

export function loadDebut(): Debut | undefined { return loadCareer().debut; }
function saveDebut(d: Debut) {
  saveCareer({ ...loadCareer(), debut: d });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DEBUT_EVENT));
}

// ── 目标 ──

const CN: Record<string, number> = { 零: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
/** 「一年半」「两年」「8个月」「1.5年」→ 月数，看不懂就一年半 */
export function parseMonths(s: string): number {
  const t = (s || "").replace(/\s/g, "");
  if (!t) return 18;
  if (t === "半年") return 6;
  const num = (x: string) => /^\d+(\.\d+)?$/.test(x) ? parseFloat(x) : x.length === 2 && x[0] === "十" ? 10 + (CN[x[1]] ?? 0) : CN[x] ?? NaN;
  const y = t.match(/([\d.]+|[一二两三四五六七八九十]{1,2})年(半)?/);
  if (y) { const v = num(y[1]); if (!Number.isNaN(v)) return Math.round(v * 12 + (y[2] ? 6 : 0)); }
  const m = t.match(/([\d.]+|[一二两三四五六七八九十]{1,2})个?月/);
  if (m) { const v = num(m[1]); if (!Number.isNaN(v)) return Math.round(v); }
  return 18;
}

function nextMonday14(from: number): number {
  const d = new Date(from);
  d.setHours(14, 0, 0, 0);
  while (d.getDay() !== 1 || d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function selectionNode(due: number, attempt: number): CareerNode {
  const c = companyOf(loadCareer().companyId);
  return {
    id: uid("node"), kind: "selection", title: attempt > 1 ? "出道组选拔（再次）" : "出道组选拔", place: `${c?.name ?? ""} 公司 大练习室`.trim(),
    premise: "公司新女团的出道组选拔：社长、艺术总监、制作人坐在前面看，练习生一个个上去表演（唱、跳、个人才艺），结果过几天另行通知，当场不说。",
    dueAt: due, status: "pending", companyId: loadCareer().companyId, from: "公司",
  };
}

function addNodes(nodes: CareerNode[]) {
  const career = loadCareer();
  saveCareer({ ...career, nodes: [...career.nodes, ...nodes].sort((a, b) => a.dueAt - b.dueAt) });
  nodes.forEach(addToCalendar);
}

/** 练习生阶段第一次跑：定目标，排第一次选拔 */
function initDebut(): void {
  const career = loadCareer();
  const signed = career.signedAt ?? Date.now();
  const months = parseMonths(loadTraineeCard()?.trainLength ?? "");
  const t = new Date(signed);
  t.setMonth(t.getMonth() + Math.max(4, months));
  const targetAt = t.getTime();
  const sel = nextMonday14(Math.max(signed + 45 * DAY, targetAt - 75 * DAY));
  const letter = "ABCDEFGHJKLMNPRSTVWXYZ"[Math.floor(Math.random() * 22)];
  saveCareer({ ...loadCareer(), debut: { targetAt, attempt: 1, status: "waiting", codename: `PROJECT ${letter}`, delays: [], steps: [] } });
  addNodes([selectionNode(sel, 1)]);
}

// ── 选拔对账 ──

type Ledger = { entries?: { at: number; delta: number; why: string }[]; levels?: Record<string, number>; months?: { rank: number; total: number }[] };
function ledger(): Ledger {
  try { return (JSON.parse(kvGet("idol_ledger_v1") || "null") as Ledger | null) ?? {}; } catch { return {}; }
}

function verdict(node: CareerNode, outcome: "done" | "absent"): { pass: boolean; why: string } {
  const d = loadDebut()!;
  if (d.attempt >= 3) return { pass: true, why: "第三次选拔，公司决定让她进" };
  if (outcome === "absent") return { pass: false, why: "选拔那天没去" };
  if (node.wish && /进|过|选上|入选|成功/.test(node.wish) && !/没|不/.test(node.wish)) return { pass: true, why: `她想要的结果：${node.wish}` };
  if (node.wish && /没进|落选|没选上|不进/.test(node.wish)) return { pass: false, why: `她想要的结果：${node.wish}` };
  const l = ledger();
  const last = l.months?.[l.months.length - 1];
  let pct = last ? last.rank / Math.max(1, last.total) : 0.5;
  const since = Date.now() - 60 * DAY;
  const recent = (l.entries ?? []).filter(e => e.at >= since);
  pct -= recent.reduce((a, e) => a + e.delta, 0) * 0.012;
  if (node.result) pct -= (/惊艳|第一|最好|全场|夸/.test(node.result) ? 0.15 : /失误|忘|崩|没发挥/.test(node.result) ? -0.1 : 0);
  const bar = d.attempt === 1 ? 0.4 : 0.62;
  const bad = recent.filter(e => e.delta < 0).map(e => e.why).slice(-3);
  return pct <= bar
    ? { pass: true, why: last ? `月末排名第 ${last.rank} 名，最近表现稳定` : "最近表现稳定" }
    : { pass: false, why: bad.length ? `最近：${bad.join("；")}` : last ? `月末排名第 ${last.rank} 名，还差一点` : "公司觉得还差一点" };
}

/** 选拔那场结束（演了、打勾、没去） */
export async function onSelection(node: CareerNode, outcome: "done" | "absent"): Promise<string | null> {
  const d = loadDebut();
  if (!d || d.status !== "waiting") return null;
  const v = verdict(node, outcome);
  if (!v.pass) {
    const due = nextMonday14(Date.now() + 88 * DAY);
    saveDebut({ ...d, attempt: d.attempt + 1, delays: [...d.delays, v.why], targetAt: Math.max(d.targetAt, due + 75 * DAY) });
    addNodes([selectionNode(due, d.attempt + 1)]);
    queueTeacher(`出道组选拔的结果出来了：这次她没进出道组（原因：${v.why}）。公司打算三个月后（${md(due)}）再选一次。私聊告诉她结果，说清楚原因，按你的性格安慰或者提醒她。`, at(Date.now() + DAY, 11));
    return "这次没进出道组，三个月后再选";
  }
  saveDebut({ ...d, status: "selected" });
  try { await formTeam(); } catch (e) { console.warn("[idol-debut] formTeam failed", e); saveDebut({ ...loadDebut()!, status: "waiting" }); }
  return "进了出道组";
}

/** 让老师过一阵私聊她（走提醒事项的消息队列） */
function queueTeacher(instruction: string, when: number) {
  const teacher = teacherOf();
  if (teacher) queueMessage(teacher.id, instruction, Math.max(0, when - Date.now()));
}

// ── 进了出道组：定人、定位、定队名（一次调用） ──

const isGirlTrainee = (c: Character) => {
  const p = getProfile(c.id);
  return p.layer === "main" && p.gender !== "男" && /练习生|室友|同期/.test(`${p.role}${p.group}`) && !/老师|管理|经纪/.test(p.role);
};

async function pickMembers(): Promise<Character[]> {
  const size = [4, 5, 5, 5, 6, 6, 7][Math.floor(Math.random() * 7)];
  const levels = ledger().levels ?? {};
  const roommates = new Set(loadCareer().roommates ?? []);
  const pool = loadCharacters().filter(isGirlTrainee).map(c => ({
    c, score: (levels[c.id] ?? 50) + (roommates.has(c.id) ? 8 : 0) + (["朋友", "好朋友"].includes(relationOf(getProfile(c.id))) ? 5 : 0) + Math.random() * 10,
  })).sort((a, b) => b.score - a.score);
  const picks = pool.slice(0, Math.min(size - 1, Math.max(2, Math.round((size - 1) * 0.7)))).map(x => x.c);
  const company = companyOf(loadCareer().companyId)?.name ?? "";
  while (picks.length < size - 1) {
    try {
      const dft = await draftPerson(`${company} 的女练习生，这次跟她一起进了新女团出道组；跟已有的人不撞型（已有：${picks.map(p => p.name).join("、") || "无"}）`, rollFace());
      // 重名就不要了（宁可少一个人）
      if (picks.some(x => x.name === dft.name) || loadCharacters().some(x => x.name === dft.name)) break;
      picks.push(createPerson(dft.name, { ...emptyProfile(""), ...draftFields(dft), layer: "main", group: "同期练习生", gender: "女" }, null, genKakaoId()));
    } catch { break; }
  }
  return picks;
}

async function makeManager(company: string, codename: string): Promise<Character> {
  try {
    const dft = await draftPerson(`${company} 新女团（${codename}）的经纪人，出道组定下来以后开始带她们`, rollFace());
    return createPerson(dft.name, { ...emptyProfile(""), ...draftFields(dft), layer: "main", role: `${company} 新女团经纪人`, group: "公司" }, null, genKakaoId());
  } catch {
    return createPerson("经纪人", { ...emptyProfile(""), layer: "main", role: `${company} 新女团经纪人`, group: "公司" }, null, genKakaoId());
  }
}

function birthYear(age: string, birthday?: string): string {
  const a = parseInt(age, 10);
  if (!a) return "";
  const now = new Date();
  let y = now.getFullYear() - a;
  if (birthday && /^\d{2}-\d{2}$/.test(birthday) && birthday > `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`) y -= 1;
  return birthday ? `${y}.${birthday.replace("-", ".")}` : String(y);
}

const COLORS = ["#f2a7b8", "#f3c48c", "#a99ce8", "#8fcfb9", "#9cc4ea", "#e7a6d8", "#b9d48a"];

async function plan(members: { id: string; name: string; age: string; about: string }[], company: string, codename: string, manager: string, teacher: string): Promise<{ list: { name: string; ko: string; nation: string; positions: { zh: string; ko: string }[] }[]; team: Team; song: string; words: Words }> {
  const card = loadTraineeCard();
  const me = card?.name || "她";
  const res = await simpleLLMCall(chatConfig(), [
    {
      role: "system",
      content: `你在给一出韩国娱乐圈的戏定「新女团出道组」的设定。只输出 JSON：
{"members":[{"name":"跟给的名字一样","ko":"名字的韩文读音","nation":"国籍，两三个字","positions":[{"zh":"中文定位","ko":"韩文"}]}],
"team":{"en":"队名，英文，原创，不能跟真实存在的团重名","ko":"队名韩文写法","meaning":"中文一两句：队名什么意思、寓意","meaningKo":"同样意思的韩文一句"},
"song":"出道曲名（英文或韩文，后面括号写中文意思）",
"teacherMsg":"管理老师${teacher}私聊${me}告诉她进了出道组时说的话，一两句，跟着会发名单图",
"managerMsg":"经纪人${manager}拉了出道组新群后第一句自我介绍，说定位发在下面",
"d2React":[{"who":"成员名字","text":"看到定位后的一句反应"}],
"d3Msg":"经纪人在群里公布队名时说的话",
"d3React":[{"who":"成员名字","text":"看到队名海报的反应"}],
"ddayGroup":{"who":"成员名字","text":"出道当天早上在群里说的第一句"},
"momMsg":"出道当天早上${me}的妈妈发来的 KakaoTalk",
"news":{"title":"出道当天 NAVER 新闻标题","text":"新闻摘要一句"}}
规矩：每人一到两个定位；要有队长、主唱、主舞、门面、忙内（忙内是年龄最小的）；照每个人的特长和性格定，${me}的定位照她擅长的；d2React、d3React 各两三个人，用自己的说话方式，口语、短；队名还没公布前的话里不提队名。`,
    },
    { role: "user", content: `公司：${company}\n暂定名：${codename}\n\n成员：\n${members.map(m => `- ${m.name}（${m.age || "?"}岁）${m.about}`).join("\n")}` },
  ], { temperature: 0.9, label: "出道组" });
  const j = JSON.parse(res.content?.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    members?: { name?: string; ko?: string; nation?: string; positions?: { zh?: string; ko?: string }[] }[];
    team?: Partial<Team>; song?: string; teacherMsg?: string; managerMsg?: string; d2React?: Line[]; d3Msg?: string; d3React?: Line[]; ddayGroup?: Line; momMsg?: string; news?: { title?: string; text?: string };
  };
  if (!j.team?.en) throw new Error(res.error || "AI 没给队名");
  const lines = (x?: Line[]) => (x ?? []).filter(l => l?.who && l?.text).map(l => ({ who: String(l.who), text: String(l.text) })).slice(0, 3);
  return {
    list: (j.members ?? []).map(m => ({ name: String(m.name ?? ""), ko: String(m.ko ?? ""), nation: String(m.nation ?? ""), positions: (m.positions ?? []).filter(p => p?.zh).map(p => ({ zh: String(p.zh), ko: String(p.ko ?? "") })).slice(0, 2) })),
    team: { en: String(j.team.en).trim(), ko: String(j.team.ko ?? ""), meaning: String(j.team.meaning ?? ""), meaningKo: String(j.team.meaningKo ?? "") },
    song: String(j.song ?? ""),
    words: {
      teacherMsg: String(j.teacherMsg || "恭喜你，进出道组了。名单发你，先别往外说。"),
      managerMsg: String(j.managerMsg || "大家好，我是以后负责你们的经纪人。定位发在下面。"),
      d2React: lines(j.d2React),
      d3Msg: String(j.d3Msg || "队名定下来了。"),
      d3React: lines(j.d3React),
      ddayGroup: j.ddayGroup?.who && j.ddayGroup?.text ? { who: String(j.ddayGroup.who), text: String(j.ddayGroup.text) } : undefined,
      momMsg: String(j.momMsg || "宝贝今天出道快乐！妈妈晚上守着看 ❤️"),
      news: { title: String(j.news?.title || ""), text: String(j.news?.text || "") },
    },
  };
}

async function formTeam(): Promise<void> {
  const career = loadCareer();
  const d = career.debut!;
  const company = companyOf(career.companyId)?.name ?? "";
  const card = loadTraineeCard();
  const kakao = JSON.parse(kvGet("idol_kakao_v1") || "null") as { teacherId?: string } | null;
  const teacher = kakao?.teacherId ? loadCharacters().find(c => c.id === kakao.teacherId) : undefined;
  const mates = await pickMembers();
  const manager = await makeManager(company, d.codename);
  const profiles = loadProfiles();
  const raw = [
    { id: ME, name: card?.name || "我", age: String(Math.max(15, new Date().getFullYear() - parseInt(card?.birthday ?? "2000", 10))), about: `（她本人）擅长：${(card?.talents ?? []).join("、")}；${card?.looks ?? ""}；国籍 ${card?.nationality ?? ""}` },
    ...mates.map(m => ({ id: m.id, name: m.name, age: profiles[m.id]?.age ?? "", about: `${profiles[m.id]?.role ?? ""}；${(profiles[m.id]?.privateLines ?? []).slice(0, 2).join("；")}` })),
  ];
  const p = await plan(raw, company, d.codename, manager.name, teacher?.name ?? "管理老师");
  const members: DebutMember[] = raw.map(m => {
    const got = p.list.find(x => x.name === m.name);
    const prof = profiles[m.id];
    return {
      id: m.id, name: m.name, ko: got?.ko ?? "",
      nation: m.id === ME ? (card?.nationality || got?.nation || "") : (got?.nation || "韩国"),
      birthday: m.id === ME ? (card?.birthday ?? "").replace(/-/g, ".") : birthYear(prof?.age ?? "", prof?.birthday),
      positions: got?.positions?.length ? got.positions : [{ zh: "副唱", ko: "서브보컬" }],
    };
  });
  // 年龄从大到小排（名单上习惯这样）
  members.sort((a, b) => (a.birthday || "9999").localeCompare(b.birthday || "9999"));
  for (const m of mates) {
    const pr = getProfile(m.id);
    if (!/出道组/.test(pr.role)) saveProfile({ ...pr, role: `${pr.role || "练习生"} · 出道组`, met: true, relation: pr.relation && pr.relation !== "陌生" ? pr.relation : "认识" });
  }
  const now = Date.now();
  const listAt = at(now + DAY, 10);
  const groupAt = at(listAt + 5 * DAY, 18);
  const debutAt = at(groupAt + 77 * DAY, 18);
  saveDebut({ ...loadDebut()!, members, team: p.team, song: p.song, words: p.words, managerId: manager.id, debutAt, steps: [{ kind: "list", at: listAt }, { kind: "group", at: groupAt }, { kind: "dday", at: at(debutAt, 6, 30) }] });
  const place = `${company} 公司`;
  const node = (title: string, step: string, due: number, premise: string, where: string): CareerNode =>
    ({ id: uid("node"), kind: "debut", step, title, place: where, premise, dueAt: due, status: "pending", companyId: career.companyId, from: manager.name, fromId: manager.id });
  addNodes([
    node("队名公布", "name", at(groupAt + 21 * DAY, 11), `出道组全员被叫到会议室，社长和艺术总监公布新女团的队名：${p.team.en}（${p.team.ko}），意思是：${p.team.meaning}。大家第一次听到自己的队名。`, `${place} 7F 会议室`),
    node("出道曲录音", "record", at(groupAt + 35 * DAY, 10), `录出道曲《${p.song}》，制作人在玻璃后面听，一个个进去录自己的 part。`, `${place} 录音室`),
    node("MV 拍摄", "mv", at(groupAt + 49 * DAY, 7), `出道曲《${p.song}》的 MV 拍摄，从早拍到深夜，造型师化妆师围着转。`, "首尔近郊 摄影棚"),
    node("出道 Showcase", "showcase", debutAt, `出道当天的 Showcase：第一次以 ${p.team.en} 的名字站上舞台，台下有记者和第一批粉丝。`, "YES24 Live Hall"),
  ]);
}

// ── 到点发出去 ──

function iso(ms: number) { return new Date(ms).toISOString(); }
function charByName(name: string, ids: string[]): Character | undefined {
  return loadCharacters().find(c => ids.includes(c.id) && c.name === name);
}

async function sendList(d: Debut, when: number, notify: (m: string) => void) {
  const career = loadCareer();
  const company = companyOf(career.companyId)?.name ?? "";
  const kakao = JSON.parse(kvGet("idol_kakao_v1") || "null") as { teacherId?: string } | null;
  const teacher = kakao?.teacherId ? loadCharacters().find(c => c.id === kakao.teacherId) : undefined;
  const sender = teacher ?? loadCharacters().find(c => c.id === d.managerId);
  if (!sender || !d.members) return;
  const date = new Date(when);
  const image = drawDebutList({
    company, docNo: `${company.slice(0, 4).toUpperCase()}-NG-${date.getFullYear()}-${pad(date.getMonth() + 1)}`, date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    codename: d.codename,
    members: d.members.map(m => ({ name: m.name, ko: m.ko, nation: m.nation, birthday: m.birthday })),
    notes: ["名单公布前不得向外界（含家人以外的任何人）透露。", `${md(when + 5 * DAY)}起出道组单独训练，宿舍另行安排。`],
  });
  if (!loadChatContacts().some(c => c.characterId === sender.id)) addChatContact(sender.id);
  const s = createOrGetSession(sender.id);
  pushChatMessage({ sessionId: s.id, role: "assistant", content: d.words?.teacherMsg ?? "", senderCharacterId: sender.id, senderName: sender.name, status: "sent", createdAt: iso(when) });
  pushChatMessage({ sessionId: s.id, role: "assistant", content: "", mediaType: "image", mediaUrl: image, mediaData: { label: "데뷔조 명단.jpg" }, senderCharacterId: sender.id, senderName: sender.name, status: "sent", createdAt: iso(when + 2000) });
  notify(`💬 ${sender.name}：${d.words?.teacherMsg ?? "发来一张图片"}`);
}

async function sendGroup(d: Debut, when: number, notify: (m: string) => void) {
  const career = loadCareer();
  const company = companyOf(career.companyId)?.name ?? "";
  const manager = loadCharacters().find(c => c.id === d.managerId);
  if (!manager || !d.members) return;
  const mateIds = d.members.filter(m => m.id !== ME).map(m => m.id);
  const name = `${d.codename}（暂定）`;
  const session = createGroupSession(name, [manager.id, ...mateIds]);
  saveChatSessions(loadChatSessions().map(x => x.id === session.id ? { ...x, groupOwnerId: manager.id } : x));
  const userName = resolveUserIdentity()?.name || "她";
  const names = d.members.filter(m => m.id !== ME).map(m => m.name).join("、");
  pushChatMessage({ sessionId: session.id, role: "system", content: `${manager.name}邀请了${userName}、${names}`, status: "sent", createdAt: iso(when) });
  pushChatMessage({ sessionId: session.id, role: "assistant", content: d.words?.managerMsg ?? "", senderCharacterId: manager.id, senderName: manager.name, status: "sent", createdAt: iso(when + 60e3) });
  const chars = loadCharacters();
  const date = new Date(when);
  const image = await drawPositionCard({
    company, codename: d.codename, date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    members: d.members.map((m, i) => ({
      name: m.name, color: COLORS[i % COLORS.length], positions: m.positions,
      avatar: m.id === ME ? resolveUserIdentity()?.avatarUrl ?? null : chars.find(c => c.id === m.id)?.avatar ?? null,
    })),
  });
  pushChatMessage({ sessionId: session.id, role: "assistant", content: "", mediaType: "image", mediaUrl: image, mediaData: { label: "멤버 포지션.jpg" }, senderCharacterId: manager.id, senderName: manager.name, status: "sent", createdAt: iso(when + 62e3) });
  (d.words?.d2React ?? []).forEach((l, i) => {
    const c = charByName(l.who, mateIds);
    if (c) pushChatMessage({ sessionId: session.id, role: "assistant", content: l.text, senderCharacterId: c.id, senderName: c.name, status: "sent", createdAt: iso(when + (i + 2) * 70e3) });
  });
  saveDebut({ ...loadDebut()!, groupId: session.id, formedAt: when });
  notify(`💬 KakaoTalk：${manager.name} 把你拉进了群「${name}」`);
}

/** 队名公布那场结束（演了、打勾、请假、没去都会公布） */
export async function revealName(): Promise<void> {
  const d = loadDebut();
  if (!d || d.status !== "selected" || !d.team || !d.members) return;
  const manager = loadCharacters().find(c => c.id === d.managerId);
  const gid = d.groupId && loadChatSessions().some(s => s.id === d.groupId) ? d.groupId : undefined;
  saveDebut({ ...d, status: "named" });
  if (!gid || !manager) return;
  const when = Date.now();
  const image = drawTeamPoster({ company: companyOf(loadCareer().companyId)?.name ?? "", month: `${new Date(when).getFullYear()}.${pad(new Date(when).getMonth() + 1)}`, team: d.team, members: d.members.map(m => m.name) });
  pushChatMessage({ sessionId: gid, role: "assistant", content: d.words?.d3Msg ?? "", senderCharacterId: manager.id, senderName: manager.name, status: "sent", createdAt: iso(when) });
  pushChatMessage({ sessionId: gid, role: "assistant", content: "", mediaType: "image", mediaUrl: image, mediaData: { label: `${d.team.en}_로고.jpg` }, senderCharacterId: manager.id, senderName: manager.name, status: "sent", createdAt: iso(when + 2000) });
  const mateIds = d.members.filter(m => m.id !== ME).map(m => m.id);
  (d.words?.d3React ?? []).forEach((l, i) => {
    const c = charByName(l.who, mateIds);
    if (c) pushChatMessage({ sessionId: gid, role: "assistant", content: l.text, senderCharacterId: c.id, senderName: c.name, status: "sent", createdAt: iso(when + (i + 1) * 60e3) });
  });
  const groupName = `${d.team.en.toUpperCase()} ✦`;
  saveChatSessions(loadChatSessions().map(s => s.id === gid ? { ...s, groupName } : s));
  pushChatMessage({ sessionId: gid, role: "system", content: `${manager.name}把群名改为「${groupName}」`, status: "sent", createdAt: iso(when + 5 * 60e3) });
}

function sendDday(d: Debut, when: number) {
  const company = companyOf(loadCareer().companyId)?.name ?? "";
  const team = d.team?.en.toUpperCase() ?? "";
  saveCareer({ ...loadCareer(), stage: "idol" });
  fameEvent("debut", `${d.team?.en ?? "出道"} 出道`, when);
  saveDebut({ ...loadDebut()!, status: "debuted" });
  const show = loadCareer().nodes.find(n => n.kind === "debut" && n.step === "showcase");
  // 出道当天早上：之前没看的通知收起来，锁屏只留这一串
  markNotesSeen();
  pushLockNote({ app: "kakao", title: "妈妈", text: d.words?.momMsg ?? "", at: when, pin: true });
  pushLockNote({ app: "naver", title: d.words?.news.title || `${company} 新女团 ${team} 今日正式出道`, text: d.words?.news.text || `${d.members?.length ?? ""}人女团 ${team} 今天发行出道曲《${d.song ?? ""}》，晚上举行出道 Showcase。`, at: when - 6 * MIN, pin: true });
  if (show) pushLockNote({ app: "reminders", title: show.title, text: `${pad(new Date(show.dueAt).getHours())}:${pad(new Date(show.dueAt).getMinutes())} · ${show.place} · 提前三小时到后台`, at: when - 20 * MIN, pin: true });
  const g = d.words?.ddayGroup;
  const c = g && d.members ? charByName(g.who, d.members.map(m => m.id)) : undefined;
  if (g && c && d.groupId) {
    pushChatMessage({ sessionId: d.groupId, role: "assistant", content: g.text, senderCharacterId: c.id, senderName: c.name, status: "sent", createdAt: iso(when - 12 * MIN) });
    pushLockNote({ app: "kakao", title: c.name, text: g.text, at: when - 12 * MIN, from: `KakaoTalk · ${team} ✦`, pin: true });
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCK_NOW_EVENT));
}

// ── 给 AI 看的 ──

export function debutPromptBlock(): string {
  const d = loadDebut();
  if (!d) return "";
  const now = Date.now();
  const sel = loadCareer().nodes.find(n => n.kind === "selection" && n.status === "pending");
  if (d.status === "waiting") {
    const lines = [`【出道】公司在筹备新女团。${d.delays.length ? `她之前没进出道组（${d.delays.join("；")}）。` : ""}`];
    if (sel && sel.dueAt - now < 40 * DAY) lines.push(`${md(sel.dueAt)}出道组选拔，练习生里在传名单，谁都不确定自己在不在里面。`);
    return lines.join("");
  }
  const who = d.members?.map(m => `${m.name}（${m.positions.map(p => p.zh).join("、")}）`).join("、") ?? "";
  const name = d.status === "selected" ? `暂定名 ${d.codename}，队名还没公布（她们也还不知道）` : `队名 ${d.team?.en}（${d.team?.ko}）：${d.team?.meaning}`;
  const stage = d.status === "debuted" ? "已经出道" : `${d.debutAt ? md(d.debutAt) : ""}出道`;
  return `【出道】她进了出道组，${stage}。${name}。成员：${who}。出道曲《${d.song ?? ""}》。对外保密，宿舍和训练都跟出道组一起。`;
}

/** 锁屏 D-N 小组件用 */
export function debutCountdown(): { label: string; days: number; date: string; progress: number } | null {
  const d = loadDebut();
  if (!d?.debutAt || d.status === "waiting" || d.status === "debuted") return null;
  const now = Date.now();
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const dd = new Date(d.debutAt); dd.setHours(0, 0, 0, 0);
  const days = Math.round((dd.getTime() - day0.getTime()) / DAY);
  if (days < 0 || days > 100) return null;
  const start = d.formedAt ?? d.debutAt - 77 * DAY;
  return {
    label: d.status === "named" && d.team ? `${d.team.en.toUpperCase()} 出道` : "出道",
    days, date: `${md(d.debutAt)} 出道`,
    progress: Math.max(0, Math.min(1, (now - start) / (d.debutAt - start))),
  };
}

// ── 每 5 秒 ──

let busy = false;
export function debutTick(notify: (m: string) => void): void {
  if (busy) return;
  const career = loadCareer();
  if (career.stage !== "trainee" && career.stage !== "idol") return;
  if (career.stage === "trainee" && !career.debut && career.signedAt) { initDebut(); return; }
  const d = career.debut;
  if (!d) return;
  const now = Date.now();
  const step = d.steps.find(s => !s.done && now >= s.at);
  if (!step) return;
  busy = true;
  saveDebut({ ...d, steps: d.steps.map(s => s === step ? { ...s, done: true } : s) });
  const when = Math.max(step.at, now - 2 * HOUR);
  const run = step.kind === "list" ? sendList(d, when, notify) : step.kind === "group" ? sendGroup(d, when, notify) : Promise.resolve(sendDday(d, now));
  void run.catch(err => console.warn("[idol-debut] step failed", step.kind, err)).finally(() => { busy = false; });
}

/** 经纪人在出道组群里提前通知出道那几件事（kakaoTick 只管练习生群） */
export function debutNoticeTarget(node: CareerNode): { groupId: string; sender: Character } | null {
  if (node.kind !== "debut") return null;
  const d = loadDebut();
  const manager = loadCharacters().find(c => c.id === d?.managerId);
  if (!d?.groupId || !manager || !loadChatSessions().some(s => s.id === d.groupId)) return null;
  return { groupId: d.groupId, sender: manager };
}
