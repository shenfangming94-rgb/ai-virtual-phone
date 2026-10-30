/**
 * 爱豆小手机：IdolSearch（仿 Naver）。
 *
 * - 首页实时热搜和新闻：跟着世界走，世界里每过一天 AI 写一次
 * - 搜公司：资料卡 + 官网（官网内容第一次打开时 AI 按公司资料和世界年份写好存下，年份变了才重写）
 * - 搜前辈团 / 艺人：官网里写过的团都记在这里，同一个世界里一直是那几个
 * - 搜她自己：关注度低就搜不到
 * - 投递：「你去找公司」那条路。几天后 AI 看她的条件和这家公司要什么，决定邀请试镜 / 拒（写清原因）/ 不回。
 *   保底：至少一家要她，上不封顶。邀请信进邮箱，接受就进提醒事项变试镜，演完走 signCompany。
 */

import { kvGet, kvSet } from "./kv-db";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { COMPANIES, addToCalendar, companyOf, loadCareer, saveCareer, signCompany, type CareerNode, type Company } from "./idol-career";
import { loadTraineeCard, describeTrainee } from "./trainee-card";
import { idolWorldPrompt } from "./idol-worldbook";
import { fameNow } from "./idol-events";
import { recordMailReply, addMail, loadMails, updateMail, type InviteAction, type MailPara } from "./idol-mail";
import { loadInstalledCustomApps, readCustomAppCollection, writeCustomAppCollection } from "./custom-app-storage";
import { toCustomAppIconId } from "./custom-app-types";
import { findGroup, groupLine, groupsOf, rosterPrompt, upsertGroups, type Group } from "./idol-groups";

const KEY = "idol_search_v1";
export const SEARCH_EVENT = "idol-search-changed";
const DAY = 864e5;
const HOUR = 3600e3;
const pad = (n: number) => String(n).padStart(2, "0");
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const dayKey = (ms = Date.now()) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const worldYear = () => new Date().getFullYear();

// ── 每家公司官网的样子（写死） ──

export type CompanyLook = { logo: string; c: string; y: string; ink: string; ko: string; domain: string; aliases: string[]; competition: string; reply: string };
export const LOOKS: Record<string, CompanyLook> = {
  sm: { logo: "SM", c: "#d6457f", y: "#ffd6e6", ink: "#5a1631", ko: "에스엠엔터테인먼트", domain: "smentertainment.com", aliases: ["sm", "에스엠", "sm娱乐", "smtown"], competition: "非常激烈", reply: "两周左右" },
  jyp: { logo: "JYP", c: "#3478f6", y: "#ffd84d", ink: "#1f3f8a", ko: "JYP엔터테인먼트", domain: "jype.com", aliases: ["jyp", "제이와이피", "jyp娱乐"], competition: "非常激烈", reply: "一周左右" },
  yg: { logo: "YG", c: "#151515", y: "#f2c200", ink: "#151515", ko: "YG엔터테인먼트", domain: "ygfamily.com", aliases: ["yg", "와이지", "yg娱乐"], competition: "非常激烈", reply: "一到两周" },
  hybe: { logo: "HYBE", c: "#222222", y: "#e8e8e8", ink: "#111111", ko: "하이브", domain: "hybecorp.com", aliases: ["hybe", "하이브", "bighit", "big hit", "빅히트"], competition: "非常激烈", reply: "两周左右" },
  starship: { logo: "STAR", c: "#3aa3dc", y: "#e6f5ff", ink: "#0d4a6e", ko: "스타쉽엔터테인먼트", domain: "starship-ent.com", aliases: ["starship", "스타쉽", "星船"], competition: "激烈", reply: "一周左右" },
  cube: { logo: "CUBE", c: "#7b4fd6", y: "#ffd6f0", ink: "#3b1f78", ko: "큐브엔터테인먼트", domain: "cubeent.co.kr", aliases: ["cube", "큐브", "cube娱乐"], competition: "激烈", reply: "一周左右" },
};
export const lookOf = (id: string): CompanyLook => LOOKS[id] ?? LOOKS.jyp;
export const AREAS = ["声乐", "舞蹈", "说唱", "演技", "模特", "作词作曲"];

// ── 数据 ──

export type Para = { h_ko: string; h_zh: string; ko: string; zh: string };
/** 团和艺人都记在圈内名册（idol-groups.ts） */
export type Artist = Group;
export type Site = {
  year: number; at: number;
  motto_ko?: string; motto_zh?: string; founded?: string; hq_ko?: string; hq_zh?: string; nameNote?: string;
  about: Para[]; history: { year: string; ko: string; zh: string }[];
  notices: { tag: string; ko: string; zh: string; date: string }[];
};
export type NewsItem = { title: string; src: string; ago: string };
export type Trend = { day: string; at: number; items: { q: string; move: string }[]; news: NewsItem[] };
export type QueryResult = { at: number; day: string; results: NewsItem[]; snippet?: string };

export type AppStatus = "review" | "invited" | "rejected" | "silent" | "signed";
export type Application = {
  id: string; companyId: string; at: number;
  name: string; birthday: string; height: string; email: string;
  areas: string[]; photos: string[]; video: string; intro: string;
  status: AppStatus; decideAt: number; decidedAt?: number;
  /** 拒信里的原因（中文一句），列表上直接显示 */
  reason?: string; mailId?: string; forced?: boolean;
  /** 她接受了哪家公司的录取（签约后其他投递都记在这里） */
  signedBy?: string;
};

type State = {
  sites: Record<string, Site>;
  artists: Record<string, Artist>;
  trend?: Trend;
  queries: Record<string, QueryResult>;
  history: string[];
  apps: Application[];
};

function load(): State {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as State | null;
    if (raw) return { sites: raw.sites ?? {}, artists: raw.artists ?? {}, trend: raw.trend, queries: raw.queries ?? {}, history: raw.history ?? [], apps: raw.apps ?? [] };
  } catch { /* 坏数据当新的 */ }
  return { sites: {}, artists: {}, queries: {}, history: [], apps: [] };
}
function save(s: State) {
  kvSet(KEY, JSON.stringify(s));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SEARCH_EVENT));
}
export const loadSearch = load;

function config() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const c = loadApiConfigs().find(x => x.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!c) throw new Error("还没配置 API");
  return c;
}

function pickJson<T>(text: string | null | undefined): T {
  return JSON.parse(text?.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as T;
}

/** 日历里写过的圈内大事，团名接着用 */
function knownCircle(): string {
  try {
    const world = (JSON.parse(kvGet("idol_almanac_v1") || "null") as { world?: Record<string, { title: string; company?: string }[]> } | null)?.world ?? {};
    return Object.values(world).flat().slice(-30).map(i => `${i.title}${i.company ? `（${i.company}）` : ""}`).join("；");
  } catch { return ""; }
}

const ctx = () => idolWorldPrompt() || "（她还没开局）";

// ── 热搜和新闻 ──

let trendBusy = false;
export function trendFresh(): boolean { return load().trend?.day === dayKey(); }

export async function refreshTrend(force = false): Promise<void> {
  if (trendBusy || (!force && trendFresh())) return;
  trendBusy = true;
  try {
    const d = new Date();
    const res = await simpleLLMCall(config(), [
      {
        role: "system",
        content: `你在给一出韩国娱乐圈的戏写搜索网站首页的「实时热搜」和新闻，照这个世界这一天的样子写。只输出 JSON：{"trends":[{"q":"热搜词，中文，可夹团名","move":"up3 / down2 / new / same 这种"}],"news":[{"title":"新闻标题，中文","src":"媒体名","ago":"2小时前 这种"}]}
热搜正好十条，新闻六条。内容是圈内的事（回归、打歌一位、试镜、路透、综艺、演唱会）夹两三条普通生活的事（天气、美食、电视剧）。团和人全部虚构，可以用下面已经出现过的；公司用真名（${COMPANIES.map(c => c.name).join("、")}）。照这个年份当时的样子写（当时有的平台、节目和说法）。她只是普通练习生或还没进公司时，热搜里不会有她。`,
      },
      { role: "user", content: `今天：${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日\n\n${ctx()}\n\n${rosterPrompt() || "还没有写过任何团"}\n\n日历里出现过的圈内事：${knownCircle() || "还没有"}` },
    ], { temperature: 0.9, label: "IdolSearch 热搜" });
    const j = pickJson<{ trends?: { q?: string; move?: string }[]; news?: { title?: string; src?: string; ago?: string }[] }>(res.content);
    const items = (j.trends ?? []).filter(t => t.q).slice(0, 10).map(t => ({ q: String(t.q), move: String(t.move || "same") }));
    if (!items.length) throw new Error(res.error || "AI 没写出来");
    const news = (j.news ?? []).filter(n => n.title).slice(0, 8).map(n => ({ title: String(n.title), src: String(n.src || "星闻日报"), ago: String(n.ago || "今天") }));
    const s = load();
    save({ ...s, trend: { day: dayKey(), at: Date.now(), items, news } });
  } finally {
    trendBusy = false;
  }
}

// ── 官网 ──

export function siteOf(companyId: string): Site | undefined {
  const s = load().sites[companyId];
  return s && s.year === worldYear() ? s : undefined;
}

export const artistsOf = groupsOf;
export const findArtist = findGroup;

const siteBusy = new Set<string>();
export async function buildSite(companyId: string, force = false): Promise<void> {
  const c = companyOf(companyId);
  if (!c || siteBusy.has(companyId) || (!force && siteOf(companyId))) return;
  siteBusy.add(companyId);
  try {
    const year = worldYear();
    const today = new Date();
    const mine = groupsOf(companyId);
    const others = rosterPrompt();
    const brief = `公司资料：\n规模：${c.scale}\n风格：${c.style}\n练习生：${c.trainee}\n招人：${c.recruit}\n名声：${c.fame}\n\n日历里出现过的圈内事：${knownCircle() || "还没有"}\n\n${ctx()}`;

    // 一节输出有上限（模型写到一半会断），所以拆成两次：先简介+年表，再团+公告
    const head = await simpleLLMCall(config(), [
      {
        role: "system",
        content: `你在给一出韩国娱乐圈的戏写「${c.name}」${year}年官网的「公司介绍」和「年表」。照这家公司在${year}年当时的样子写：当时叫什么名字、总部在哪、规模多大（如果那年公司叫别的名字，nameNote 写一句说明）。内容全部虚构，不写真实艺人。韩文要地道，中文是它的翻译。只输出 JSON：
{"motto_ko":"社训或口号","motto_zh":"","founded":"成立年份","hq_ko":"本社地址（到洞）","hq_zh":"","nameNote":"","about":[{"h_ko":"小标题","h_zh":"","ko":"一句话","zh":""}],"history":[{"year":"1997","ko":"一句话","zh":""}]}
about 写四段：我们是谁、我们怎样培养练习生、我们的音乐、在${year}年想做什么，每段只写一句话。history 只写四条，最后一条在${year}年。整体要短：输出有长度上限，写太长会让 JSON 断掉。`,
      },
      { role: "user", content: brief },
    ], { temperature: 0.8, label: `${c.name} 官网·简介` });
    const j = pickJson<Partial<Site>>(head.content);
    if (!j.about?.length) throw new Error(head.error || "AI 没写出来");
    const site: Site = {
      year, at: Date.now(),
      motto_ko: j.motto_ko, motto_zh: j.motto_zh, founded: j.founded, hq_ko: j.hq_ko, hq_zh: j.hq_zh, nameNote: j.nameNote,
      about: (j.about ?? []).filter(p => p && (p.ko || p.zh)),
      history: (j.history ?? []).filter(h => h && h.year),
      notices: [],
    };
    // 简介先落地：第二段没写出来，官网至少能打开看
    const s0 = load();
    save({ ...s0, sites: { ...s0.sites, [companyId]: site } });

    // 第二次：旗下团 + 公告
    try {
      const roster = await simpleLLMCall(config(), [
        {
          role: "system",
          content: `你在给一出韩国娱乐圈的戏写「${c.name}」${year}年官网的「旗下艺人」和「公告」。旗下艺人和团全部虚构，不写真实艺人。这家已经有的团必须全部写进 artists，团名、男团女团、出道年份、成员、粉丝名照抄不能改，只能补没写到的和更新「最近」；可以再加新团，一共三个，不能跟别家已有的团重名。出道年份照这个比例（算上已有的）：至少两个是${year - 4}～${year - 1}年出道的新团，一个${year - 8}～${year - 5}年出道，最多一个更早的老前辈；${year}年当年出道的只能写还没出道或刚出道。韩文要地道，中文是它的翻译。只输出 JSON：
{"artists":[{"name":"团名或艺名","kind":"女团/男团/Solo","size":5,"debut":2012,"style":"一句话风格","fandom":"粉丝名","recent":"一句话","members":["成员中文名"],"songs":[{"title":"","year":2012,"note":"出道曲 / 一位"}]}],"notices":[{"tag":"오디션 或 공지","ko":"一句话","zh":"","date":"MM.DD"}]}
每个团只写一首歌、成员名字不超过四个。recent 写这个团最近在做什么。notices 只写两条，日期就在${year}年${today.getMonth() + 1}月（今天是${today.getMonth() + 1}月${today.getDate()}日，只写最近一个月内），一条是开试镜。整体要短：输出有长度上限，写太长会让 JSON 断掉。

style 的写法照这几条真实的定位短语来（学写法，不要照抄内容）：
「青春、成长与悲伤男孩美学」
「清新邻家男孩（Boyhood Pop），主打童年感性与青春成长主题」
「吸血鬼与暗黑美学」
味道从这些里来，可以组合：纯风、元气风、夏日风、校园风、少年感、青春风、清凉风、甜美风、可爱风、仙女风、梦幻风、公主风、千金风、优雅风、轻熟风、成熟风、性感风、健康性感、Girl Crush、Teen Crush、酷飒风、拽姐风、御姐风、强势姐姐、硬核风、暗黑风、吸血鬼风、怪诞风、病娇风、怨妇风、复古风、Y2K风、City Boy/Girl风、街头风、嘻哈风、滑板风、运动风、健身风、力量风、异域风、奇幻风、童话风、叙事概念风、世界观团、大众流行风、清新乐队风。
不要只输出一个类型词，也不要写成小说描写或空口号；两个团同一类味道也要写出两种不同的定位；不出现 AI、元宇宙、多维时空这类词。`,
        },
        { role: "user", content: `公司资料：\n规模：${c.scale}\n风格：${c.style}\n练习生：${c.trainee}\n名声：${c.fame}\n\n这家已经有的团（必须照抄）：\n${mine.map(a => `- ${groupLine(a)}`).join("\n") || "还没有"}\n\n${others}` },
      ], { temperature: 0.8, label: `${c.name} 官网·艺人` });
      const j2 = pickJson<{ artists?: Artist[]; notices?: Site["notices"] }>(roster.content);
      if (j2.artists?.length) upsertGroups(j2.artists.map(a => ({ ...a, companyId, debut: a.debut && a.debut > year ? year : a.debut })), "site", companyId);
      const notices = (j2.notices ?? []).filter(n => n && (n.ko || n.zh));
      if (notices.length) {
        const s = load();
        save({ ...s, sites: { ...s.sites, [companyId]: { ...(s.sites[companyId] ?? site), notices } } });
      }
    } catch { /* 团和公告没写出来不影响官网打开，下次进来还能补 */ }
  } finally {
    siteBusy.delete(companyId);
  }
}
export const siteBuilding = (id: string) => siteBusy.has(id);

/** 报名资格：世界年份往前推 20 年 */
export const minBirthYear = () => worldYear() - 20;

// ── 搜索 ──

export function matchCompany(q: string): Company | undefined {
  const k = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (!k) return undefined;
  return COMPANIES.find(c => c.name.toLowerCase() === k || k.startsWith(c.name.toLowerCase()) || lookOf(c.id).aliases.some(a => k === a || k.startsWith(`${a} `)));
}

/** 搜她自己：关注度够了才搜得到 */
export function isMe(q: string): boolean {
  const name = loadTraineeCard()?.name?.trim();
  return Boolean(name && q.trim() === name);
}
export function meSearchable(): boolean {
  const fam = loadTraineeCard()?.family || "";
  return ["star", "child"].includes(fam) || fameNow() >= 20;
}

export function addHistory(q: string): void {
  const s = load();
  save({ ...s, history: [q, ...s.history.filter(h => h !== q)].slice(0, 20) });
}
export function clearHistory(): void { save({ ...load(), history: [] }); }

export function cachedQuery(q: string): QueryResult | undefined {
  const r = load().queries[q.trim().toLowerCase()];
  return r && r.day === dayKey() ? r : undefined;
}

const queryBusy = new Set<string>();
export async function runQuery(q: string): Promise<QueryResult> {
  const key = q.trim().toLowerCase();
  const hit = cachedQuery(q);
  if (hit) return hit;
  if (queryBusy.has(key)) throw new Error("正在搜");
  queryBusy.add(key);
  try {
    const company = matchCompany(q);
    const artist = findArtist(q);
    const me = isMe(q);
    const res = await simpleLLMCall(config(), [
      {
        role: "system",
        content: `你在给一出韩国娱乐圈的戏写搜索网站的搜索结果（新闻和帖子），照这个世界今天的样子写。只输出 JSON：{"snippet":"一两句百科式简介，没有就空","results":[{"title":"中文标题","src":"媒体或论坛名","ago":"3小时前 这种"}]}
results 写四到六条，跟搜的词直接有关，有新有旧。团和人全部虚构；公司用真名。照这个年份当时的样子写。${me ? "搜的是她自己：只写外界真的会知道的（家里的新闻、以前的作品、练习生路透），关注度低就只写一两条小帖子。" : "她只是普通练习生或还没进公司时，结果里不会出现她。"}`,
      },
      { role: "user", content: `搜的词：${q}\n${company ? `这是公司：${company.name}（${company.style}）` : ""}${artist ? `这是 ${groupLine(artist)}，最近：${artist.recent ?? ""}` : ""}\n\n${ctx()}\n\n${rosterPrompt()}` },
    ], { temperature: 0.85, label: "IdolSearch 搜索" });
    const j = pickJson<{ snippet?: string; results?: { title?: string; src?: string; ago?: string }[] }>(res.content);
    const results = (j.results ?? []).filter(r => r.title).slice(0, 6).map(r => ({ title: String(r.title), src: String(r.src || "星闻日报"), ago: String(r.ago || "今天") }));
    if (!results.length) throw new Error(res.error || "AI 没写出来");
    const out: QueryResult = { at: Date.now(), day: dayKey(), results, snippet: j.snippet ? String(j.snippet) : undefined };
    const s = load();
    const queries = Object.fromEntries(Object.entries({ ...s.queries, [key]: out }).sort((a, b) => b[1].at - a[1].at).slice(0, 40));
    save({ ...s, queries });
    return out;
  } finally {
    queryBusy.delete(key);
  }
}

// ── 投递 ──

export function loadApps(): Application[] {
  return load().apps.slice().sort((a, b) => b.at - a.at);
}

/** 这家现在能不能投：已经进公司了不能；正在审核或邀请中不能；被拒/没回音三个月后能再投 */
export function canApply(companyId: string): { ok: boolean; why?: string } {
  const career = loadCareer();
  if (career.stage !== "pre") return { ok: false, why: `你已经是 ${companyOf(career.companyId)?.name ?? ""} 的练习生了` };
  const last = load().apps.filter(a => a.companyId === companyId).sort((a, b) => b.at - a.at)[0];
  if (!last) return { ok: true };
  if (last.status === "review") return { ok: false, why: "已经投过了，还在审核中" };
  if (last.status === "invited") return { ok: false, why: "这家已经邀请你去试镜了" };
  const wait = last.at + 90 * DAY - Date.now();
  if (wait > 0) return { ok: false, why: `上次投递没过，${Math.ceil(wait / DAY)} 天后可以再投` };
  return { ok: true };
}

export function applyDraft(): Pick<Application, "name" | "birthday" | "height" | "email" | "areas" | "intro"> {
  const card = loadTraineeCard();
  const map: Record<string, string> = { vocal: "声乐", dance: "舞蹈", rap: "说唱", acting: "演技", visual: "模特", write: "作词作曲", compose: "作词作曲" };
  const areas = [...new Set((card?.talents ?? []).map(t => map[t]).filter(Boolean))];
  const name = card?.name ?? "";
  const handle = (name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "trainee") + (card?.birthday?.slice(5).replace("-", "") ?? "");
  return {
    name, birthday: card?.birthday ?? "", height: (card?.looks.match(/(\d{3})\s*(cm|厘米)/)?.[1] ?? "") ,
    email: `${handle}@naver.com`, areas: areas.length ? areas : ["声乐", "舞蹈"], intro: "",
  };
}

export function submitApplication(companyId: string, data: Omit<Application, "id" | "companyId" | "at" | "status" | "decideAt">): Application {
  const now = Date.now();
  const c = companyOf(companyId)!;
  const d = new Date(now + (3 + Math.floor(Math.random() * 6)) * DAY);
  d.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60), 0, 0);
  const app: Application = { ...data, id: uid("app"), companyId, at: now, status: "review", decideAt: d.getTime() };
  const s = load();
  save({ ...s, apps: [...s.apps, app] });
  addMail({
    from: "IdolSearch", addr: "no-reply@idolsearch.kr", logo: "i", color: "#03c75a",
    subject: `投递成功：${c.name}`,
    body: [
      { zh: `你的资料已经送达 ${c.name}。审核结果会发到 ${data.email}，一般需要${lookOf(companyId).reply}。` },
      { zh: "未通过的人公司不另行通知。在 IdolSearch「我的投递」里可以随时看进度。" },
    ],
    at: now, read: false,
  });
  return app;
}

/** 列表上显示的状态：不回的那种审核三周后才变成「没有回音」，之前一直是审核中 */
export function shownStatus(a: Application): "review" | "invited" | "rejected" | "silent" | "signed" {
  if (a.status === "silent") return Date.now() - a.at > 21 * DAY ? "silent" : "review";
  return a.status;
}

const decideBusy = new Set<string>();

async function decide(app: Application): Promise<void> {
  const c = companyOf(app.companyId);
  if (!c) return;
  const card = loadTraineeCard();
  const all = load().apps;
  // 保底：一家都还没邀请她、也没有别的在审核 → 这家一定要她
  const forced = !all.some(a => a.status === "invited") && !all.some(a => a.id !== app.id && a.status === "review");
  const res = await simpleLLMCall(config(), [
    {
      role: "system",
      content: `你是 ${c.name} 的试镜审核组，在看一份投递来的资料，决定怎么处理。看她的条件跟这家公司要什么人合不合：
${c.name}：${c.style}；练习生：${c.trainee}；招人：${c.recruit}
${forced ? "这一份你们决定邀请她来线下试镜。" : "三种结果：invite 邀请来线下试镜（要她）；reject 回一封客气的拒信；silent 不回（公司对没通过的人常常不通知）。合不合要有具体原因，看她报的方向、自我介绍、视频、年龄和这家的口味；不要每家都要她，也不要乱拒。"}
只输出 JSON：{"result":"invite / reject / silent","why":"给她看的一句中文：为什么（要她是看中了什么，拒是差在哪）","subject_ko":"邮件标题，[${lookOf(c.id).logo}] 开头","subject_zh":"标题的中文","body":[{"ko":"","zh":""}],"prep":"invite 时：要准备什么（中文一句）"}
body 两三段，韩文是正式的公司邮件口吻，称呼她「OOO 님」，zh 是翻译。invite 的信里要说为什么选她；reject 的信里委婉说原因。silent 时 body 空。`,
    },
    { role: "user", content: `投递的人：\n${card ? describeTrainee(card) : app.name}\n\n投递表：\n姓名 ${app.name}，生日 ${app.birthday}，身高 ${app.height || "没填"}\n报名方向：${app.areas.join("、")}\n照片：${app.photos.length} 张\n视频：${app.video || "没附"}\n自我介绍：${app.intro || "没写"}` },
  ], { temperature: 0.85, label: `${c.name} 审核` });
  const j = pickJson<{ result?: string; why?: string; subject_ko?: string; subject_zh?: string; body?: MailPara[]; prep?: string }>(res.content);
  let result = forced ? "invite" : (j.result === "invite" || j.result === "reject" || j.result === "silent" ? j.result : "");
  if (!result) throw new Error(res.error || "AI 没回");
  const body = (j.body ?? []).filter(p => p && (p.ko || p.zh)).map(p => ({ ko: p.ko ? String(p.ko) : undefined, zh: String(p.zh || "") }));
  if (result !== "silent" && !body.length) result = "silent";
  const look = lookOf(c.id);
  const now = Date.now();
  const s = load();
  const status: AppStatus = result === "invite" ? "invited" : result === "reject" ? "rejected" : "silent";
  const patch: Partial<Application> = { status, decidedAt: now, reason: j.why ? String(j.why) : undefined, forced };
  if (result === "invite") {
    const d = new Date(now + (3 + Math.floor(Math.random() * 4)) * DAY);
    d.setHours(Math.random() < 0.5 ? 10 : 14, 0, 0, 0);
    const action: InviteAction = { kind: "invite", appId: app.id, companyId: c.id, at: d.getTime(), place: `${c.name} 사옥 오디션룸`, prep: j.prep ? String(j.prep) : "自由曲一首（唱或跳），动作方便的衣服", status: "new" };
    const mail = addMail({ from: `${c.name} 오디션팀`, addr: `audition@${look.domain}`, logo: look.logo, color: look.c, subject: j.subject_ko || `[${look.logo}] 서류 심사 결과 안내`, subjectZh: j.subject_zh || "资料审核结果", body, at: now, read: false, action });
    patch.mailId = mail.id;
  } else if (result === "reject") {
    const mail = addMail({ from: `${c.name} Audition`, addr: `audition@${look.domain}`, logo: look.logo, color: look.c, subject: j.subject_ko || `[${look.logo}] 지원 결과 안내`, subjectZh: j.subject_zh || "投递结果", body, at: now, read: false });
    patch.mailId = mail.id;
  }
  save({ ...s, apps: s.apps.map(a => (a.id === app.id ? { ...a, ...patch } : a)) });
}

/** 每隔几秒看一眼：到了该出结果的投递 */
export function searchTick(notify: (msg: string) => void): void {
  if (!loadTraineeCard()) return;
  const now = Date.now();
  const s = load();
  const stage = loadCareer().stage;
  for (const a of s.apps) {
    if (a.status !== "review" || now < a.decideAt || decideBusy.has(a.id)) continue;
    if (stage !== "pre") {
      // 已经签了别家：剩下的就当没回音
      save({ ...load(), apps: load().apps.map(x => (x.id === a.id ? { ...x, status: "silent", decidedAt: now } : x)) });
      continue;
    }
    decideBusy.add(a.id);
    void decide(a).then(() => {
      const done = load().apps.find(x => x.id === a.id);
      const c = companyOf(a.companyId)?.name ?? "";
      if (done?.status === "invited") notify(`📩 ${c} 오디션팀：资料审核结果，邀请你来试镜`);
      else if (done?.status === "rejected") notify(`📩 ${c}：投递结果`);
    }).catch(() => {
      // 没 API 或失败：一小时后再试
      save({ ...load(), apps: load().apps.map(x => (x.id === a.id ? { ...x, decideAt: Date.now() + HOUR } : x)) });
    }).finally(() => decideBusy.delete(a.id));
  }
}

/** 接受邀请：进提醒事项变成试镜日程（可以顺便改时间） */
export function acceptInviteMail(mailId: string, at?: number): CareerNode | null {
  const mail = loadMails().find(m => m.id === mailId);
  const act = mail?.action;
  if (!mail || !act || act.status !== "new") return null;
  if (loadCareer().stage !== "pre") return null;
  const c = companyOf(act.companyId)!;
  const app = load().apps.find(a => a.id === act.appId);
  const dueAt = at ?? act.at;
  const node: CareerNode = {
    id: act.nodeId || uid("node"), kind: "audition", title: `${c.name} 试镜`, place: `${c.name} 公司大楼 试镜室`,
    premise: `她自己在网上投递了 ${c.name}，资料审核通过，被邀请来线下试镜。${app?.reason ? `公司看中她的地方：${app.reason}。` : ""}她报的方向：${app?.areas.join("、") ?? ""}。要准备：${act.prep}。她要在评委面前表演。`,
    dueAt, status: "pending", companyId: c.id, from: `${c.name} 오디션팀`, notice: { channel: "mail", refId: mail.id, at: mail.at },
  };
  const career = loadCareer();
  saveCareer({ ...career, nodes: [...career.nodes.filter(n => n.id !== node.id), node] });
  addToCalendar(node);
  updateMail(mailId, { action: { ...act, at: dueAt, status: "accepted", nodeId: node.id } });
  recordMailReply(mailId, true, `${new Date(dueAt).toLocaleString("zh-CN")} · ${node.place}`);
  return node;
}

export function declineInviteMail(mailId: string): void {
  const mail = loadMails().find(m => m.id === mailId);
  if (mail?.action) {
    updateMail(mailId, { action: { ...mail.action, status: "declined" } });
    recordMailReply(mailId, false);
    if (mail.action.nodeId) { const career=loadCareer(); saveCareer({ ...career, nodes: career.nodes.map(n=>n.id===mail.action!.nodeId?{...n,status:"declined" as const,result:"已拒绝"}:n) }); }
  }
}

/** 给世界看的一行：她投了哪些 */
export function applicationsLine(): string {
  const apps = loadApps();
  if (!apps.length) return "";
  const label: Record<string, string> = { review: "审核中", invited: "邀请她试镜", rejected: "没通过", silent: "没有回音", signed: "她已接受别家的录取" };
  return `【她投递过的公司】${apps.map(a => `${companyOf(a.companyId)?.name}（${label[shownStatus(a)]}）`).join("、")}`;
}

export const dayOfWorld = dayKey;

// ── 跟邮箱 app（float 那个 nox.mail 改的）对接 ──
// 公司来信先存在宿主（idol_mail_v1），装了邮箱就塞进它的信箱；她在邮箱里点了接受/改时间/不去，这里看到了再排进提醒事项。

export const MAIL_APP_MANIFEST_ID = "nox.mail";
export function mailAppId(): string | null {
  return loadInstalledCustomApps().find(a => a.manifest.id === MAIL_APP_MANIFEST_ID)?.id ?? null;
}
export function mailAppIcon(): string | null {
  const id = mailAppId();
  return id ? toCustomAppIconId(id) : null;
}

export function mailAppTick(notify: (msg: string) => void): void {
  const appId = mailAppId();
  if (!appId) return;
  const metas = readCustomAppCollection(appId, "meta");
  if (!metas.some(m => m.id === "idol_mode")) writeCustomAppCollection(appId, "meta", [...metas, { id: "idol_mode", on: true }]);
  const rows = readCustomAppCollection(appId, "mails");
  let changed = false;
  const byId = new Map(rows.map(r => [String(r.id), r]));
  for (const m of loadMails()) {
    if (byId.has(m.id)) continue;
    const row: Record<string, unknown> = {
      id: m.id, scope: "idol", folder: "inbox", cat: "primary",
      from: { kind: "sys", name: m.from, addr: m.addr, color: m.color, short: m.logo },
      to: { kind: "me", name: "我", addr: "" },
      subject: m.subject,
      body: m.body.map(p => [p.ko, p.zh].filter(Boolean).join("\n")).join("\n\n"),
      idol: { paras: m.body, subjectZh: m.subjectZh, action: m.action },
      at: new Date(m.at).toISOString(), status: "ok", read: Boolean(m.read), star: false, att: [], thread: m.id,
    };
    rows.push(row);
    byId.set(m.id, row);
    changed = true;
  }
  // 她在邮箱里回了邀请 / 录取通知
  for (const r of rows) {
    const act = (r.idol as { action?: InviteAction } | undefined)?.action;
    if (!act) continue;
    const host = loadMails().find(m => m.id === r.id)?.action;
    if (!host || host.status !== "new") continue;
    // 录取通知：接受才签约，其他公司由 signCompany 一并收尾
    if ((act.kind ?? "invite") === "offer") {
      if (act.status === "accepted") {
        updateMail(String(r.id), { action: { ...act, status: "accepted" } });
        void signCompany(act.companyId).then(() => notify(`🎉 你接受了 ${companyOf(act.companyId)?.name ?? "公司"} 的录取，日程排好了`)).catch(() => undefined);
      } else if (act.status === "declined") {
        updateMail(String(r.id), { action: { ...act, status: "declined" } });
        notify(`你把 ${companyOf(act.companyId)?.name ?? "公司"} 的录取拒了`);
      }
      changed = true;
      continue;
    }
    if (act.nodeId) continue;
    if (act.status === "accepted") {
      const node = acceptInviteMail(String(r.id), act.at);
      (r.idol as { action: InviteAction }).action = node ? { ...act, nodeId: node.id } : { ...act, status: "declined" };
      if (node) notify(`📅 ${node.title}：${new Date(node.dueAt).getMonth() + 1}月${new Date(node.dueAt).getDate()}日，进提醒事项了`);
      else notify("❗ 你已经签约了，这个邀请去不了了");
      changed = true;
    } else if (act.status === "declined") {
      declineInviteMail(String(r.id));
      changed = true;
    }
  }
  if (changed) writeCustomAppCollection(appId, "mails", rows);
}
