/**
 * 爱豆小手机：YouTube。
 *
 * - 她的视频只从戏里来：结束一场戏时记账 AI 判断这场她有没有给公司公开频道拍视频，拍了就存一条，过几天（世界时间）才上传
 * - 别人的视频：打开时世界里过了一周以上自动来一批，中间她下拉手动刷；一次调用
 * - 评论不自动刷：只有「加载更多评论」「加载更多回复」才调用；她的视频第一次打开评论时补第一批
 * - 搜索只搜世界里已有的：圈内名册、六家公司、已经有的频道；第一次进频道 AI 照名册写简介和几条旧视频
 * - 播放量本地按时间涨，不花调用
 */

import { kvGet, kvSet } from "./kv-db";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { loadCharacters } from "./character-storage";
import { loadProfiles } from "./idol-people";
import { loadTraineeCard } from "./trainee-card";
import { idolWorldPrompt } from "./idol-worldbook";
import { fameEvent, fameTier } from "./idol-fame";
import { COMPANIES, companyOf, loadCareer } from "./idol-career";
import { findGroup, groupLine, loadGroups, rosterPrompt, upsertGroups, companyIdByName } from "./idol-groups";
import { LOOKS } from "./idol-search";
import { channelSubs, groupInText, myVideoViews, videoViews, TIER_HINT } from "./idol-scale";
import { generateImageFromConfiguredApi, SELF_REFERENCE_ID } from "./image-generation-service";

const KEY = "idol_youtube_v1";
export const YT_EVENT = "idol-youtube-changed";
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const parseAt = (v: unknown): number | null => {
  const m = String(v ?? "").match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null;
};
const hueOf = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0; return h % 360; };
const pickJson = <T,>(t: string | null | undefined): T => JSON.parse(t?.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as T;
const LANG = "一个人说话只用一种语言：韩国人用韩语，每句给中文 zh；中国人说中文；外国人说他自己的语言，也给 zh。";
const NO_EMOJI_FACE = "评论像真 YouTube：短、口语，可以带时间戳（m:ss）。";

export type Img = { desc: string; src?: string; busy?: boolean };
export type CastRow = { pos: string; name: string; me?: boolean; charId?: string };
export type Cmt = { id: string; by: string; text: string; zh?: string; at: number; likes: number; charId?: string; me?: boolean; replies?: Cmt[] };
export type Channel = {
  id: string; name: string; handle: string; kind: "company" | "group" | "person";
  companyId?: string; group?: string; subs: number; desc?: string; descZh?: string; written?: boolean;
  /** 她换过的头像 */
  avatar?: string;
};
export type Video = {
  id: string; ch: string; title: string; titleZh?: string; kind: string; at: number; dur: string;
  img: Img; cast?: CastRow[]; target: number; likes: number; cmts: Cmt[]; mine?: boolean; liked?: boolean; announced?: boolean;
};
type State = { channels: Record<string, Channel>; videos: Video[]; subs: string[]; feedAt?: number; me: { handle: string; avatar?: string } };

// ── 存取 ──

let cache: State | null = null;
export function loadYt(): State {
  if (cache) return cache;
  try { cache = JSON.parse(kvGet(KEY) || "null") as State | null; } catch { cache = null; }
  if (!cache) cache = { channels: {}, videos: [], subs: [], me: { handle: `user-${Math.random().toString(36).slice(2, 8)}` } };
  return cache;
}
function save(s: State) {
  cache = s;
  kvSet(KEY, JSON.stringify({ ...s, videos: s.videos.slice(-500) }));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(YT_EVENT));
}
function patch(f: (s: State) => State) { save(f(loadYt())); }

function config() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const c = loadApiConfigs().find(x => x.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!c) throw new Error("还没配置 API");
  return c;
}

// ── 频道 ──

const COMPANY_CHANNEL: Record<string, string> = { sm: "SMTOWN", jyp: "JYP Entertainment", yg: "YG ENTERTAINMENT", hybe: "HYBE LABELS", starship: "STARSHIP", cube: "CUBE Entertainment" };
const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "");
export const channelOf = (id: string): Channel | undefined => loadYt().channels[id];
export function themeOf(ch?: Channel): { c: string; y: string } {
  const look = ch?.companyId ? LOOKS[ch.companyId] : undefined;
  if (look) return { c: look.c, y: look.y };
  const h = hueOf(ch?.name ?? "yt");
  return { c: `hsl(${h} 45% 45%)`, y: `hsl(${(h + 40) % 360} 70% 80%)` };
}

function companyChannel(s: State, companyId: string): Channel {
  const id = `co_${companyId}`;
  if (s.channels[id]) return s.channels[id];
  const name = COMPANY_CHANNEL[companyId] ?? `${companyOf(companyId)?.name ?? companyId} Entertainment`;
  const ch: Channel = { id, name, handle: `@${name.replace(/\s+/g, "")}`, kind: "company", companyId, subs: channelSubs(id, "company", companyId) };
  s.channels[id] = ch;
  return ch;
}

/** 按名字找或建一个频道（公司名会认成公司频道） */
function ensureChannel(s: State, name: string, kind?: string, company?: string): Channel {
  const n = name.trim();
  const cid = companyIdByName(n) ?? COMPANIES.find(c => keyOf(COMPANY_CHANNEL[c.id] ?? "") === keyOf(n) || (LOOKS[c.id]?.aliases ?? []).includes(n.toLowerCase()))?.id;
  if (cid && (kind === "company" || !kind || companyIdByName(n))) return companyChannel(s, cid);
  const found = Object.values(s.channels).find(c => keyOf(c.name) === keyOf(n));
  if (found) return found;
  const g = findGroup(n);
  const ch: Channel = {
    id: uid("ch"), name: g?.name ?? n, handle: `@${(g?.name ?? n).replace(/\s+/g, "")}`,
    kind: kind === "person" ? "person" : "group", companyId: g?.companyId ?? companyIdByName(company), group: g?.name,
    subs: 0,
  };
  ch.subs = channelSubs(ch.name, ch.kind, ch.companyId, ch.group);
  s.channels[ch.id] = ch;
  return ch;
}

export function toggleSub(chId: string) { patch(s => ({ ...s, subs: s.subs.includes(chId) ? s.subs.filter(x => x !== chId) : [...s.subs, chId] })); }

// ── 播放量（本地） ──

export function viewsOf(v: Video, now = Date.now()): number {
  if (now < v.at) return 0;
  const t = (now - v.at) / (3 * DAY);
  return Math.max(1, Math.round(v.target * (1 - Math.exp(-t)) * (v.mine ? 1 : 0.6 + 0.4 * Math.min(1, t))));
}
export function cmtCountOf(v: Video, now = Date.now()): number {
  const n = v.cmts.reduce((a, c) => a + 1 + (c.replies?.length ?? 0), 0);
  return Math.max(n, Math.round(viewsOf(v, now) / 160));
}
export const visibleVideos = () => loadYt().videos.filter(v => v.at <= Date.now());

// ── 她的视频：戏里拍的 ──

export type SceneVideo = { title?: string; titleZh?: string; kind?: string; img?: string; cast?: { pos?: string; name?: string }[]; dur?: string };
/** 结束一场戏时：这场她给公司公开频道拍了视频，过几天传上去 */
export function recordSceneVideo(v: SceneVideo, sceneAt: number): void {
  const companyId = loadCareer().companyId;
  if (!companyId || !v.title || !v.img) return;
  const me = loadTraineeCard()?.name ?? "";
  const chars = loadCharacters();
  patch(s => {
    const ch = companyChannel(s, companyId);
    const target = myVideoViews(`${v.title}${sceneAt}`, ch.subs);
    const cast: CastRow[] = (v.cast ?? []).filter(c => c?.name).map(c => {
      const name = String(c.name).trim();
      const isMe = name === me || name === "你" || name === "她";
      return { pos: String(c.pos ?? "").trim(), name: isMe ? "你" : name, ...(isMe ? { me: true } : {}), ...(!isMe ? { charId: chars.find(x => x.name === name)?.id } : {}) };
    });
    const video: Video = {
      id: uid("v"), ch: ch.id, title: String(v.title), titleZh: v.titleZh ? String(v.titleZh) : undefined, kind: v.kind ? String(v.kind) : "练习生",
      at: sceneAt + rnd(2, 6) * DAY, dur: /^\d{1,2}:\d{2}$/.test(String(v.dur ?? "")) ? String(v.dur) : `${Math.floor(rnd(2, 4))}:${pad(Math.floor(rnd(0, 59)))}`,
      img: { desc: String(v.img) }, cast, target: Math.round(target), likes: 0, cmts: [], mine: true,
    };
    video.likes = Math.round(target * rnd(0.05, 0.09));
    return { ...s, videos: [...s.videos, video] };
  });
}

/** 上传那一刻：记关注度、告诉她 */
export function ytTick(notify: (m: string) => void): void {
  const s = loadYt();
  const now = Date.now();
  const due = s.videos.filter(v => v.mine && !v.announced && v.at <= now);
  if (!due.length) return;
  for (const v of due) {
    fameEvent("medium", `公司 YouTube 上传了她出镜的视频「${v.titleZh || v.title}」`, v.at);
    notify(`公司 YouTube 传了你出镜的视频：${v.titleZh || v.title}`);
  }
  patch(x => ({ ...x, videos: x.videos.map(v => due.some(d => d.id === v.id) ? { ...v, announced: true } : v) }));
}

// ── 首页：一周一批 ──

export const needsFeed = () => { const s = loadYt(); return !s.feedAt || Date.now() - s.feedAt >= 7 * DAY; };
let feedBusy = false;
export const feedLoading = () => feedBusy;

type RawVideo = { channel?: string; channelKind?: string; company?: string; at?: string; title?: string; titleZh?: string; kind?: string; dur?: string; img?: string; comments?: { handle?: string; text?: string; zh?: string }[] };
function addRaw(s: State, list: RawVideo[], from: number, to: number, forCh?: Channel): Video[] {
  const out: Video[] = [];
  for (const r of list) {
    if (!r?.title || !r.img) continue;
    const ch = forCh ?? (r.channel ? ensureChannel(s, String(r.channel), r.channelKind, r.company) : undefined);
    if (!ch) continue;
    let at = parseAt(r.at) ?? rnd(from, to);
    if (at > to) at = rnd(from, to);
    const views = ch.kind === "company" && /练习生/.test(String(r.kind ?? "")) ? Math.round(ch.subs * rnd(0.003, 0.008)) : videoViews(`${ch.name}${r.title}`, ch.group ?? groupInText(String(r.title))?.name ?? ch.name, String(r.kind ?? ""), at);
    out.push({
      id: uid("v"), ch: ch.id, title: String(r.title), titleZh: r.titleZh ? String(r.titleZh) : undefined, kind: String(r.kind ?? ""),
      at, dur: /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(r.dur ?? "")) ? String(r.dur) : `${Math.floor(rnd(2, 12))}:${pad(Math.floor(rnd(0, 59)))}`,
      img: { desc: String(r.img) }, target: Math.round(views), likes: Math.round(views * rnd(0.03, 0.07)),
      cmts: (r.comments ?? []).filter(c => c?.text).slice(0, 3).map(c => ({ id: uid("c"), by: String(c.handle || "user"), text: String(c.text), zh: c.zh ? String(c.zh) : undefined, at: at + rnd(10 * MIN, 2 * DAY), likes: Math.round(rnd(0.0002, 0.002) * views) })),
    });
  }
  return out;
}

const worldCtx = () => idolWorldPrompt() || "（她还没开局）";
function myCompanyLine(): string {
  const c = companyOf(loadCareer().companyId);
  return c ? `她签的公司：${c.name}（她是练习生，她自己的视频不由你写）` : "她还没签公司";
}

export async function fillFeed(): Promise<number> {
  if (feedBusy) return 0;
  feedBusy = true;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(YT_EVENT));
  try {
    const now = Date.now();
    const s0 = loadYt();
    const from = Math.max(s0.feedAt ?? now - 7 * DAY, now - 30 * DAY);
    const subs = s0.subs.map(id => s0.channels[id]?.name).filter(Boolean);
    const res = await simpleLLMCall(config(), [
      { role: "system", content: `你在给一出韩国娱乐圈的戏写 YouTube 首页这段时间新上传的视频。只输出 JSON：
{"videos":[{"channel":"频道名（团名、公司频道名或艺人名）","channelKind":"group/company/person","company":"所属公司","at":"YYYY-MM-DD HH:mm","title":"真 YouTube 那样的标题，韩国频道用韩文或英文","titleZh":"中文翻译","kind":"MV/练习室/直拍/团综/vlog/练习生/预告/直播回放/舞台","dur":"m:ss","img":"画面一句话，写清楚谁在干什么","comments":[{"handle":"","text":"","zh":""}]}],"groups":[{"name":"","company":"","kind":"男团/女团/solo","debut":年份,"members":[""],"tier":"top/mid/small/rookie"}]}
写 5～8 条，上传时间在 ${fmt(from)} 到 ${fmt(now)} 之间分散。频道只能是下面名册里的团和艺人、或六家公司（${COMPANIES.map(c => COMPANY_CHANNEL[c.id]).join("、")}）；名册里的团名、公司、成员不能改。名册不够时可以给六家公司补新团，补的写进 groups，${TIER_HINT}。不写播放量、订阅数这些数字。跟着世界走：哪个团在回归期就有 MV、练习室、打歌直拍；年末有颁奖礼和演唱会；她订阅的频道优先；不要写她本人出镜的视频。每条带 1～3 条评论。${LANG}${NO_EMOJI_FACE}` },
      { role: "user", content: `现在：${fmt(now)}\n${myCompanyLine()}\n她订阅的频道：${subs.join("、") || "还没有"}\n\n${worldCtx()}\n\n${rosterPrompt(40) || "名册还是空的"}` },
    ], { temperature: 0.8, label: "YouTube 首页" });
    if (!res.content) throw new Error(res.error || "AI 没回");
    const j = pickJson<{ videos?: RawVideo[]; groups?: { name?: string; company?: string; kind?: string; debut?: number; members?: string[]; tier?: string }[] }>(res.content);
    for (const g of j.groups ?? []) if (g?.name) upsertGroups([{ name: g.name, kind: g.kind, debut: g.debut, members: g.members, ...(g.tier && ["top", "mid", "small", "rookie"].includes(g.tier) ? { tier: g.tier as "top" } : {}) }], "search", companyIdByName(g.company));
    let n = 0;
    patch(s => { const add = addRaw(s, j.videos ?? [], from, now); n = add.length; return { ...s, videos: [...s.videos, ...add], feedAt: now }; });
    return n;
  } finally {
    feedBusy = false;
    if (typeof window !== "undefined") window.dispatchEvent(new Event(YT_EVENT));
  }
}

// ── 搜索 / 频道 ──

export type Hit = { ch?: Channel; name: string; kind: Channel["kind"]; sub: string; companyId?: string };
export function searchYt(q: string): Hit[] {
  const k = keyOf(q);
  if (!k) return [];
  const s = loadYt();
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const push = (h: Hit) => { const key = keyOf(h.name); if (seen.has(key)) return; seen.add(key); hits.push(h); };
  for (const c of COMPANIES) {
    const names = [c.name, COMPANY_CHANNEL[c.id] ?? "", ...(LOOKS[c.id]?.aliases ?? [])].map(keyOf);
    if (names.some(n => n && (n.includes(k) || k.includes(n)))) push({ ch: s.channels[`co_${c.id}`], name: COMPANY_CHANNEL[c.id] ?? c.name, kind: "company", sub: `${c.name} 官方频道`, companyId: c.id });
  }
  for (const ch of Object.values(s.channels)) if (keyOf(ch.name).includes(k)) push({ ch, name: ch.name, kind: ch.kind, sub: ch.kind === "group" ? "团体频道" : ch.kind === "person" ? "个人频道" : "官方频道", companyId: ch.companyId });
  for (const g of Object.values(loadGroups())) {
    if (keyOf(g.name).includes(k)) push({ name: g.name, kind: "group", sub: groupLine(g), companyId: g.companyId });
    const m = g.members?.find(x => keyOf(x).includes(k));
    if (m) push({ name: g.name, kind: "group", sub: `成员 ${m} · ${companyOf(g.companyId)?.name ?? ""}`, companyId: g.companyId });
  }
  return hits.slice(0, 20);
}

/** 点进搜索结果：没有频道就建一个 */
export function openHit(h: Hit): string {
  let id = h.ch?.id ?? "";
  patch(s => { const ch = h.kind === "company" && h.companyId ? companyChannel(s, h.companyId) : ensureChannel(s, h.name, h.kind, companyOf(h.companyId)?.name); id = ch.id; return { ...s }; });
  return id;
}

const writing = new Set<string>();
export const channelWriting = (id: string) => writing.has(id);
/** 第一次进频道：AI 照名册写简介、订阅数和几条以前的视频，存下来 */
export async function writeChannel(id: string): Promise<void> {
  const ch = loadYt().channels[id];
  if (!ch || ch.written || writing.has(id)) return;
  writing.add(id);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(YT_EVENT));
  try {
    const now = Date.now();
    const g = ch.group ? findGroup(ch.group) : undefined;
    const co = companyOf(ch.companyId);
    const have = loadYt().videos.filter(v => v.ch === id).length;
    const res = await simpleLLMCall(config(), [
      { role: "system", content: `你在给一出韩国娱乐圈的戏写一个 YouTube 频道的页面。只输出 JSON：
{"desc":"频道简介，韩文，一两句","descZh":"中文","tier":"这个团还没有名气档位时写 top/mid/small/rookie，否则空","videos":[{"at":"YYYY-MM-DD HH:mm","title":"","titleZh":"","kind":"MV/练习室/直拍/团综/vlog/练习生/预告/舞台","dur":"m:ss","img":"画面一句话","comments":[{"handle":"","text":"","zh":""}]}]}
${have >= 4 ? "videos 写空数组。" : `videos 写 ${co && ch.kind === "company" ? "6～8" : "4～6"} 条这个频道以前的视频，上传时间都在 ${fmt(now)} 之前，越近的越多。`}团名、成员、出道年份照名册，不许改；公司频道里放旗下团的内容，练习生视频不由你写。不写播放量、订阅数这些数字。${LANG}${NO_EMOJI_FACE}` },
      { role: "user", content: `频道：${ch.name}（${ch.kind === "company" ? "公司官方频道" : ch.kind === "group" ? "团体频道" : "个人频道"}）\n${co ? `公司：${co.name}（${co.scale}；${co.style}）` : ""}\n${g ? `名册：${groupLine(g)}；最近：${g.recent ?? ""}` : ""}\n现在：${fmt(now)}\n\n${worldCtx()}\n\n${rosterPrompt(40)}` },
    ], { temperature: 0.7, label: "YouTube 频道" });
    if (!res.content) throw new Error(res.error || "AI 没回");
    const j = pickJson<{ desc?: string; descZh?: string; tier?: string; videos?: RawVideo[] }>(res.content);
    if (g && !g.tier && j.tier && ["top", "mid", "small", "rookie"].includes(j.tier)) upsertGroups([{ name: g.name, tier: j.tier as "top" }], "search");
    patch(s => {
      const c = s.channels[id];
      if (!c) return s;
      const add = addRaw(s, j.videos ?? [], now - 400 * DAY, now - HOUR, c);
      s.channels[id] = { ...c, desc: j.desc ? String(j.desc) : c.desc, descZh: j.descZh ? String(j.descZh) : c.descZh, subs: channelSubs(c.kind === "company" ? c.id : c.name, c.kind, c.companyId, c.group), written: true };
      return { ...s, videos: [...s.videos, ...add] };
    });
  } finally {
    writing.delete(id);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(YT_EVENT));
  }
}

// ── 评论 ──

const cmtBusy = new Set<string>();
export const commentsBusy = (key: string) => cmtBusy.has(key);

/** 加载更多评论 / 某条下面加载更多回复 */
export async function moreComments(videoId: string, parentId?: string): Promise<void> {
  const key = parentId ? `${videoId}:${parentId}` : videoId;
  if (cmtBusy.has(key)) return;
  const v = loadYt().videos.find(x => x.id === videoId);
  if (!v) return;
  cmtBusy.add(key);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(YT_EVENT));
  try {
    const s = loadYt();
    const ch = s.channels[v.ch];
    const now = Date.now();
    const parent = parentId ? v.cmts.find(c => c.id === parentId) : undefined;
    const tier = fameTier().name;
    const profiles = loadProfiles();
    const chars = loadCharacters();
    const knowHer = Object.values(profiles).filter(p => p.met && p.layer === "main").map(p => ({ p, c: chars.find(c => c.id === p.charId) })).filter(x => x.c).slice(0, 10);
    const castLine = v.cast?.length ? `出镜（她知道谁是谁，网友不认识练习生，只会说位置、衣服）：${v.cast.map(c => `${c.pos} ${c.me ? "她本人" : c.name}`).join("、")}` : "";
    const old = (parent ? [parent, ...(parent.replies ?? [])] : v.cmts).slice(-12).map(c => `${c.me ? "她（匿名）" : c.by}：${c.text}`).join("\n");
    const mineUnanswered = parent ? parent.me || (parent.replies ?? []).some(r => r.me) : false;
    const res = await simpleLLMCall(config(), [
      { role: "system", content: `你在写一条 YouTube 视频${parent ? "某条评论下面的回复" : "评论区新冒出来的评论"}。只输出 JSON：{"comments":[{"handle":"网名","text":"","zh":"","char":"如果是下面认识她的人用小号来评论，写他的名字；否则空"}]}
写 ${parent ? "3～5" : "5～8"} 条，按时间顺序。${v.mine ? `这是她出镜的练习生视频，她现在是「${tier}」：普通人时大多数人在问左右某个位置是谁、夸整体，偶尔一两个人注意到她；小有人知时有人专门来找她、叫得出她名字；公众人物时很多人是冲她来的。认识她的人偶尔会用看不出是谁的小号来留一句，不暴露身份，大多数时候没有。` : "评论跟这个团和视频内容走。"}${mineUnanswered ? "她在这条下面说过话，这批里一定有人回她。" : ""}${LANG}${NO_EMOJI_FACE}只写跟视频里真实发生的事有关的话，不编画面里没有的。` },
      { role: "user", content: `频道：${ch?.name ?? ""}\n视频：${v.title}${v.titleZh ? `（${v.titleZh}）` : ""}\n画面：${v.img.desc}\n${castLine}\n上传：${fmt(v.at)}，现在：${fmt(now)}\n${v.mine && knowHer.length ? `认识她的人：\n${knowHer.map(x => `- ${x.c!.name}：${x.p.role}`).join("\n")}` : ""}\n\n${parent ? "这条评论和已有回复" : "已经有的评论"}：\n${old || "还没有"}` },
    ], { temperature: 0.85, label: "YouTube 评论" });
    if (!res.content) throw new Error(res.error || "AI 没回");
    const j = pickJson<{ comments?: { handle?: string; text?: string; zh?: string; likes?: number; char?: string }[] }>(res.content);
    const base = Math.max(v.at, parent?.at ?? v.at, ...((parent?.replies ?? v.cmts).map(c => c.at)));
    const add: Cmt[] = (j.comments ?? []).filter(c => c?.text).map((c, i) => {
      const charId = c.char ? chars.find(x => x.name === String(c.char).trim())?.id : undefined;
      return { id: uid("c"), by: String(c.handle || "user"), text: String(c.text), zh: c.zh ? String(c.zh) : undefined, at: Math.min(now, base + (i + 1) * rnd(5 * MIN, 3 * HOUR)), likes: Math.round(viewsOf(v, now) * rnd(0, 0.002)), ...(charId ? { charId } : {}) };
    });
    patch(x => ({ ...x, videos: x.videos.map(q => q.id !== videoId ? q : parent
      ? { ...q, cmts: q.cmts.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), ...add] } : c) }
      : { ...q, cmts: [...q.cmts, ...add] }) }));
  } finally {
    cmtBusy.delete(key);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(YT_EVENT));
  }
}

export function myComment(videoId: string, text: string, parentId?: string) {
  const s = loadYt();
  const c: Cmt = { id: uid("c"), by: s.me.handle, text, at: Date.now(), likes: 0, me: true };
  patch(x => ({ ...x, videos: x.videos.map(v => v.id !== videoId ? v : parentId
    ? { ...v, cmts: v.cmts.map(p => p.id === parentId ? { ...p, replies: [...(p.replies ?? []), c] } : p) }
    : { ...v, cmts: [c, ...v.cmts] }) }));
}
export function setMyHandle(handle: string) { const h = handle.trim().replace(/^@/, ""); if (h) patch(s => ({ ...s, me: { ...s.me, handle: h } })); }
export function toggleLike(videoId: string) { patch(s => ({ ...s, videos: s.videos.map(v => v.id === videoId ? { ...v, liked: !v.liked, likes: v.likes + (v.liked ? -1 : 1) } : v) })); }

// ── 编辑 / 删除 / 生图 ──

/** 彻底删除：当它没发生过 */
export function purgeVideo(id: string) { patch(s => ({ ...s, videos: s.videos.filter(v => v.id !== id) })); }
export function editVideoDesc(id: string, desc: string) { patch(s => ({ ...s, videos: s.videos.map(v => v.id === id ? { ...v, img: { ...v.img, desc } } : v) })); }
export async function generateVideoImg(id: string): Promise<void> {
  const v = loadYt().videos.find(x => x.id === id);
  if (!v || v.img.busy) return;
  const set = (img: Img) => patch(s => ({ ...s, videos: s.videos.map(x => x.id === id ? { ...x, img } : x) }));
  set({ ...v.img, busy: true });
  try {
    const me = loadTraineeCard()?.name || "我";
    const people = (v.cast ?? []).filter(c => c.me || c.charId).map(c => c.me ? { id: SELF_REFERENCE_ID, name: me } : { id: c.charId!, name: c.name });
    const r = await generateImageFromConfiguredApi({ description: `YouTube 视频画面（16:9 截图）：${v.img.desc}`, people, appId: "youtube" });
    set({ ...v.img, busy: false, src: r?.mediaRef ?? v.img.src });
  } catch (e) {
    set({ ...v.img, busy: false });
    throw e;
  }
}

// ── 头像 ──

export function setChannelAvatar(id: string, src?: string) { patch(s => s.channels[id] ? { ...s, channels: { ...s.channels, [id]: { ...s.channels[id], avatar: src } } } : s); }
export function setMyAvatar(src?: string) { patch(s => ({ ...s, me: { ...s.me, avatar: src } })); }
export async function genAvatar(name: string, kind: "company" | "group" | "person" | "me"): Promise<string | undefined> {
  const what = kind === "company" ? `娱乐公司「${name}」的 YouTube 官方频道头像，干净的 logo` : kind === "group" ? `K-pop 团体「${name}」的 YouTube 频道头像，团的 logo 或概念照` : kind === "person" ? `艺人「${name}」的 YouTube 频道头像` : "一个普通网友的 YouTube 头像，随手拍的风景或小物件，看不出是谁";
  const r = await generateImageFromConfiguredApi({ description: `${what}，正方形，适合裁成圆形`, appId: "youtube", useReferenceImage: false });
  return r?.mediaRef;
}
