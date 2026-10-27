/**
 * 爱豆小手机：ins。
 *
 * - 账号：她一个（默认私密小号）；每个主要人物一个号（练习生锁着；出道爱豆是蓝勾公开号 + 一个私人小号，小号只有她认得出）；路人和前辈团官方号按需建
 * - 关注：公开号直接关注；锁着的要申请，认识的人基本会同意（过一会儿）。认识她的人会陆续来申请关注她
 * - 别人的帖子和快拍：她打开 ins 时一次调用补上次以来的（不跟发动机）
 * - 她发帖：一次调用出点赞评论 + 判断风险。被扒有延迟，之前删帖/归档/切私密能躲；拖久了照样可能被扒
 * - 私信：只给还没加 KakaoTalk 的人；默认不自动回，点「让他回」才回；可开自动回复（她停下约 10 秒再回）
 */

import { kvGet, kvSet } from "./kv-db";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { loadCharacters } from "./character-storage";
import { loadProfiles, composePersona, type IdolProfile } from "./idol-people";
import { loadTraineeCard } from "./trainee-card";
import { idolWorldPrompt } from "./idol-worldbook";
import { fameEvent, fameTier, fameTotal } from "./idol-fame";
import { addWorldFeed } from "./idol-events";
import { isKakaoFriend } from "./idol-kakao";
import { loadCareer } from "./idol-career";
import { queueMessage, teacherOf } from "./idol-reminders";
import { loadGroups } from "./idol-groups";
import { generateImageFromConfiguredApi, SELF_REFERENCE_ID } from "./image-generation-service";

const KEY = "idol_ins_v1";
export const INS_EVENT = "idol-ins-changed";
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const parseAt = (v: unknown): number | null => {
  const m = String(v ?? "").match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null;
};

export const ME = "me";

export type InsAcc = {
  id: string; handle: string; name: string; charId?: string; alt?: boolean;
  private: boolean; verified?: boolean; followers: number; bio: string; hue: number;
  /** 官方号（团）、路人 */
  kind?: "char" | "official" | "npc";
};
export type Img = { desc: string; src?: string; who?: string[]; busy?: boolean };
export type Cmt = { by: string; text: string; zh?: string; at: number };
export type Risk = { level: "none" | "low" | "mid" | "high"; why: string; love?: boolean; leakAt?: number; leaked?: boolean; cancelled?: boolean };
export type Post = {
  id: string; by: string; at: number; imgs: Img[]; cap: string; capZh?: string; place?: string;
  likes: number; likers?: string[]; comments: Cmt[]; risk?: Risk;
  archived?: boolean; deleted?: boolean; hiddenAt?: number; hideLikes?: boolean; noComments?: boolean;
  /** 发帖时是不是公开号 */
  wasPublic?: boolean;
};
export type Story = { id: string; by: string; at: number; text?: string; img?: Img; bg: string; viewers: { id: string; at: number }[] };
export type Note = { id: string; at: number; kind: "like" | "comment" | "follow" | "request" | "accept" | "story"; from: string; text?: string; postId?: string };
export type Msg = { id: string; me: boolean; text: string; zh?: string; at: number; postId?: string };
export type Dm = { msgs: Msg[]; status: "request" | "open"; auto: boolean; proactive: boolean; lastMine?: number };

type State = {
  me: { handle: string; name: string; bio: string; private: boolean; riskHint: boolean };
  accs: Record<string, InsAcc>;
  following: string[];
  followers: string[];
  requested: { id: string; at: number; decideAt: number }[];
  incoming: { id: string; at: number }[];
  posts: Post[];
  stories: Story[];
  notes: Note[];
  dms: Record<string, Dm>;
  filledAt?: number;
  explore?: { day: string; ids: string[] };
  seenNotesAt?: number;
  /** 认识的人什么时候来申请关注她：每个人一次 */
  askedMe: string[];
};

function defaults(): State {
  const card = loadTraineeCard();
  const base = (card?.name || "me").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 6) || "flo";
  return {
    me: { handle: `${base}_${card?.birthday?.slice(5).replace("-", "") || "0412"}`, name: card?.name || "我", bio: "", private: true, riskHint: true },
    accs: {}, following: [], followers: [], requested: [], incoming: [], posts: [], stories: [], notes: [], dms: {}, askedMe: [],
  };
}
export function loadIns(): State {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as State | null;
    if (raw) return { ...defaults(), ...raw, askedMe: raw.askedMe ?? [], incoming: raw.incoming ?? [], requested: raw.requested ?? [] };
  } catch { /* 坏数据当新的 */ }
  return defaults();
}
function save(s: State) {
  kvSet(KEY, JSON.stringify({ ...s, posts: s.posts.slice(-400), stories: s.stories.filter(x => Date.now() - x.at < 3 * DAY).slice(-80), notes: s.notes.slice(-120) }));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INS_EVENT));
}
function patch(fn: (s: State) => State) { save(fn(loadIns())); }

function config() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const c = loadApiConfigs().find(x => x.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!c) throw new Error("还没配置 API");
  return c;
}
const pickJson = <T,>(t: string | null | undefined): T => JSON.parse(t?.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as T;
const hueOf = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0; return h % 360; };

export function accOf(id: string): InsAcc | undefined {
  if (id === ME) { const m = loadIns().me; return { id: ME, handle: m.handle, name: m.name, private: m.private, followers: loadIns().followers.length, bio: m.bio, hue: 340 }; }
  return loadIns().accs[id];
}
export const accByHandle = (h: string) => Object.values(loadIns().accs).find(a => a.handle.toLowerCase() === h.replace(/^@/, "").toLowerCase());
export const charAvatar = (a?: InsAcc) => (a?.charId ? loadCharacters().find(c => c.id === a.charId)?.avatar ?? null : null);

// ── 账号 ──

function isTrainee(p?: IdolProfile) { return Boolean(p && /练习生/.test(`${p.role} ${p.group}`)); }
function isPublicIdol(p?: IdolProfile) { return Boolean(p?.isIdol && !isTrainee(p)); }

let setupBusy = false;
/** 主要人物还没有号的，一次调用起好（网名、简介、锁不锁） */
export async function ensureAccounts(): Promise<void> {
  if (setupBusy) return;
  const profiles = loadProfiles();
  const s0 = loadIns();
  const have = new Set(Object.values(s0.accs).map(a => a.charId).filter(Boolean));
  const todo = loadCharacters().filter(c => profiles[c.id] && profiles[c.id].layer === "main" && !have.has(c.id)).slice(0, 12);
  // 团的官方号（名册里有的）
  const groups = Object.values(loadGroups());
  const officials = groups.filter(g => !Object.values(s0.accs).some(a => a.kind === "official" && a.name === g.name));
  if (officials.length) patch(s => {
    const accs = { ...s.accs };
    for (const g of officials) { const id = uid("acc"); accs[id] = { id, handle: `${g.name.replace(/\s+/g, "").toLowerCase()}_official`, name: g.name, private: false, verified: true, followers: Math.round(rnd(3e5, 6e6)), bio: g.fandom ? `${g.name} · ${g.fandom}` : g.name, hue: hueOf(g.name), kind: "official" }; }
    return { ...s, accs };
  });
  if (!todo.length) return;
  setupBusy = true;
  try {
    const list = todo.map(c => { const p = profiles[c.id]; return `- ${c.name}（${p.role}${p.age ? `，${p.age}岁` : ""}${p.isIdol ? (isTrainee(p) ? "，练习生" : "，出道爱豆") : ""}${p.gender ? `，${p.gender}` : ""}）`; }).join("\n");
    const res = await simpleLLMCall(config(), [
      { role: "system", content: `给这些人起 ins 账号。只输出 JSON：{"accounts":[{"name":"","handle":"英文小写、数字、点和下划线","bio":"一两句，照这个人会写的，韩国人写韩语","private":true,"alt":"出道爱豆才写：他私人小号的网名，跟本名看不出关系"}]}
练习生一律 private:true，网名随意不一定带本名；出道爱豆的大号是公开的认证号，网名带艺名；普通人看性格，有的公开有的锁着。` },
      { role: "user", content: list },
    ], { temperature: 0.9, label: "ins 起账号" });
    const j = pickJson<{ accounts?: { name?: string; handle?: string; bio?: string; private?: boolean; alt?: string }[] }>(res.content);
    patch(s => {
      const accs = { ...s.accs };
      for (const c of todo) {
        const p = profiles[c.id];
        const a = (j.accounts ?? []).find(x => x.name === c.name);
        const handle = (a?.handle || `${c.name}`).replace(/[^a-zA-Z0-9._]/g, "").toLowerCase() || `user${Math.floor(rnd(1000, 9999))}`;
        const pub = isPublicIdol(p);
        const id = uid("acc");
        accs[id] = { id, handle, name: c.name, charId: c.id, private: pub ? false : isTrainee(p) ? true : a?.private !== false, verified: pub, followers: pub ? Math.round(rnd(2e5, 3e6)) : Math.round(rnd(40, 400)), bio: a?.bio ?? "", hue: hueOf(c.name), kind: "char" };
        if (pub) {
          const aid = uid("acc");
          const alt = (a?.alt || `${handle.slice(0, 3)}_${Math.floor(rnd(100, 999))}`).replace(/[^a-zA-Z0-9._]/g, "").toLowerCase();
          accs[aid] = { id: aid, handle: alt, name: alt, charId: c.id, alt: true, private: true, followers: Math.round(rnd(8, 60)), bio: "", hue: hueOf(alt), kind: "char" };
        }
      }
      return { ...s, accs };
    });
  } finally { setupBusy = false; }
}

// ── 关注 ──

export function follow(id: string): "following" | "requested" {
  const a = accOf(id);
  if (!a) return "following";
  if (!a.private) { patch(s => ({ ...s, following: [...new Set([...s.following, id])] })); return "following"; }
  // 认识的人一般二十分钟到半天内同意
  patch(s => ({ ...s, requested: [...s.requested.filter(r => r.id !== id), { id, at: Date.now(), decideAt: Date.now() + rnd(20 * MIN, 8 * HOUR) }] }));
  return "requested";
}
export function unfollow(id: string) { patch(s => ({ ...s, following: s.following.filter(x => x !== id), requested: s.requested.filter(r => r.id !== id) })); }
export function relationTo(id: string): "following" | "requested" | "none" {
  const s = loadIns();
  return s.following.includes(id) ? "following" : s.requested.some(r => r.id === id) ? "requested" : "none";
}
export function answerIncoming(id: string, ok: boolean) {
  patch(s => ({ ...s, incoming: s.incoming.filter(r => r.id !== id), followers: ok ? [...new Set([...s.followers, id])] : s.followers, notes: ok ? [...s.notes, { id: uid("n"), at: Date.now(), kind: "follow", from: id }] : s.notes }));
}
export function setMe(p: Partial<State["me"]>) { patch(s => ({ ...s, me: { ...s.me, ...p } })); }

/** 能看到这个号的帖子吗 */
export function canSee(id: string): boolean {
  if (id === ME) return true;
  const a = accOf(id);
  return Boolean(a && (!a.private || loadIns().following.includes(id)));
}

// ── 每隔几秒：申请结果、认识的人来申请、被扒、私信自动回复 ──

export function insTick(notify: (m: string) => void): void {
  if (!loadTraineeCard()) return;
  const now = Date.now();
  const s = loadIns();
  let changed = false;
  const profiles = loadProfiles();
  // 她发出的申请有结果了
  const decided = s.requested.filter(r => now >= r.decideAt);
  if (decided.length) {
    changed = true;
    for (const r of decided) {
      const a = s.accs[r.id];
      const p = a?.charId ? profiles[a.charId] : undefined;
      const ok = !a?.charId ? Math.random() < 0.5 : p?.met !== false ? Math.random() < 0.95 : Math.random() < 0.4;
      s.requested = s.requested.filter(x => x.id !== r.id);
      if (ok) { s.following = [...new Set([...s.following, r.id])]; s.notes.push({ id: uid("n"), at: now, kind: "accept", from: r.id }); }
    }
  }
  // 认识她的人来申请关注她（每人一次，一天最多两个）
  if (!s.filledAt || now - (s.notes.filter(n => n.kind === "request").slice(-1)[0]?.at ?? 0) > 12 * HOUR) {
    const cand = Object.values(s.accs).filter(a => a.charId && !a.alt && !s.askedMe.includes(a.id) && !s.followers.includes(a.id) && profiles[a.charId]?.met);
    if (cand.length && Math.random() < 0.02) {
      const a = cand[Math.floor(Math.random() * cand.length)];
      s.askedMe = [...s.askedMe, a.id];
      if (s.me.private) { s.incoming = [...s.incoming, { id: a.id, at: now }]; s.notes.push({ id: uid("n"), at: now, kind: "request", from: a.id }); }
      else { s.followers = [...new Set([...s.followers, a.id])]; s.notes.push({ id: uid("n"), at: now, kind: "follow", from: a.id }); }
      changed = true;
    }
  }
  // 被扒
  for (const p of s.posts) {
    const r = p.risk;
    if (!r?.leakAt || r.leaked || r.cancelled || now < r.leakAt) continue;
    changed = true;
    // 删了 / 归档了 / 切私密了：越早越安全
    const hiddenAt = p.hiddenAt;
    if (hiddenAt && hiddenAt < p.at + (r.leakAt - p.at) / 2) { r.cancelled = true; continue; }
    if (hiddenAt && Math.random() < 0.5) { r.cancelled = true; continue; }
    r.leaked = true;
    leak(p, notify);
  }
  if (changed) save(s);
  // 私信自动回复：她停下 10 秒
  for (const [id, dm] of Object.entries(s.dms)) {
    if (dm.auto && dm.status === "open" && dm.lastMine && now - dm.lastMine >= 10e3 && dm.msgs[dm.msgs.length - 1]?.me && !dmBusy.has(id)) {
      void replyDm(id).catch(() => undefined);
    }
  }
}

function leak(p: Post, notify: (m: string) => void) {
  const love = Boolean(p.risk?.love);
  const what = love ? "她 ins 小号上秀恩爱的帖子被扒出来了" : p.risk?.level === "high" ? "她 ins 小号上的帖子被扒出来，传开了" : "她的 ins 小号被扒出来了，有人在网上讨论";
  fameEvent(p.risk?.level === "high" || love ? "medium" : "small", what, Date.now());
  addWorldFeed(`${what}（${p.risk?.why ?? ""}）`);
  notify(`❗ 被扒了：${p.risk?.why || "你 ins 上的一条帖子"}`);
  const t = teacherOf();
  if (t) queueMessage(t.id, love
    ? `她 ins 私人小号上秀恩爱的帖子被网上扒出来了（${p.risk?.why}）。按公司的恋爱禁令严肃地私聊她，叫她来办公室谈。`
    : `她的 ins 私人小号被网上扒出来了（${p.risk?.why}）。私聊她，提醒她锁好或者删掉，语气按你的性格。`, rnd(1, 4) * HOUR);
}

// ── 打开 ins：补上次以来大家的帖子和快拍 ──

let fillBusy = false;
export function needsFill(): boolean {
  const s = loadIns();
  return !s.filledAt || Date.now() - s.filledAt > 2 * HOUR;
}

export async function fillFeed(): Promise<number> {
  if (fillBusy) return 0;
  fillBusy = true;
  try {
    await ensureAccounts().catch(() => undefined);
    const s = loadIns();
    const now = Date.now();
    const from = Math.max(s.filledAt ?? now - 2 * DAY, now - 7 * DAY);
    const seen = s.following.map(id => s.accs[id]).filter(Boolean);
    if (!seen.length) { patch(x => ({ ...x, filledAt: now })); return 0; }
    const profiles = loadProfiles();
    const who = seen.map(a => {
      const p = a.charId ? profiles[a.charId] : undefined;
      return `- @${a.handle}：${a.alt ? `${a.name}（这是 ${loadCharacters().find(c => c.id === a.charId)?.name} 的私人小号，粉丝不知道）` : a.name}${a.verified ? "（认证公开号）" : a.private ? "（锁着的号）" : ""}${p ? `；${p.role}${p.status?.text ? `；最近：${p.status.text}` : ""}` : a.kind === "official" ? "；团的官方号" : ""}`;
    }).join("\n");
    const res = await simpleLLMCall(config(), [
      { role: "system", content: `你在给一出韩国娱乐圈的戏补「她」ins 首页上的新内容：她关注的这些号，在给定时间段里发的帖子和快拍。只输出 JSON：
{"posts":[{"handle":"","at":"YYYY-MM-DD HH:mm","imgs":[{"desc":"画面一句话","who":["照片里有谁的 handle，自己就写自己的"]}],"cap":"配文","capZh":"不是中文时的中文翻译","likes":数字,"comments":[{"handle":"","text":"","zh":""}]}],"stories":[{"handle":"","at":"","text":"快拍上的字（可空）","img":"画面一句话（可空）"}]}
规矩：帖子必须有图，一条 1～5 张；配文多数十五个字以内，可以空、可以只有 emoji；想说一段话的人发快拍。韩国人发韩语，中国人发中文，外国人发他自己的语言，不是中文的都给 capZh / zh。帖子和快拍都照这个人的性格、身份和最近在忙的事，有的人几天不发。练习生发得少、多是练习室、吃的、天空；出道爱豆的大号是营业的样子，小号才是私下。评论来自他的熟人或粉丝，公开号点赞多。时间段里一共写三到八条帖子、两到六条快拍。` },
      { role: "user", content: `时间段：${fmt(from)} 到 ${fmt(now)}\n\n她关注的号：\n${who}\n\n${idolWorldPrompt()}` },
    ], { temperature: 0.9, label: "ins 刷新首页" });
    const j = pickJson<{ posts?: { handle?: string; at?: string; imgs?: { desc?: string; who?: string[] }[]; cap?: string; capZh?: string; likes?: number; comments?: { handle?: string; text?: string; zh?: string }[] }[]; stories?: { handle?: string; at?: string; text?: string; img?: string }[] }>(res.content);
    if (!j.posts && !j.stories) throw new Error(res.error || "AI 没写出来");
    let n = 0;
    patch(x => {
      const posts = [...x.posts];
      const stories = [...x.stories];
      for (const p of j.posts ?? []) {
        const acc = Object.values(x.accs).find(a => a.handle === String(p.handle || "").replace(/^@/, ""));
        if (!acc || !x.following.includes(acc.id)) continue;
        const at = Math.min(now, Math.max(from, parseAt(p.at) ?? rnd(from, now)));
        const imgs = (p.imgs ?? []).filter(i => i?.desc).slice(0, 5).map(i => ({ desc: String(i.desc), who: whoIds(i.who, acc) }));
        if (!imgs.length) continue;
        posts.push({ id: uid("post"), by: acc.id, at, imgs, cap: String(p.cap ?? ""), capZh: p.capZh ? String(p.capZh) : undefined, likes: Math.max(0, Math.round(Number(p.likes) || rnd(8, 60))), comments: (p.comments ?? []).filter(c => c?.text).slice(0, 8).map(c => ({ by: String(c.handle || "user").replace(/^@/, ""), text: String(c.text), zh: c.zh ? String(c.zh) : undefined, at: at + rnd(5, 300) * MIN })) });
        n++;
      }
      for (const st of j.stories ?? []) {
        const acc = Object.values(x.accs).find(a => a.handle === String(st.handle || "").replace(/^@/, ""));
        if (!acc || !x.following.includes(acc.id) || (!st.text && !st.img)) continue;
        stories.push({ id: uid("st"), by: acc.id, at: Math.min(now, Math.max(from, parseAt(st.at) ?? rnd(from, now))), text: st.text ? String(st.text) : undefined, img: st.img ? { desc: String(st.img), who: whoIds(undefined, acc) } : undefined, bg: BGS[Math.floor(Math.random() * BGS.length)], viewers: [] });
      }
      return { ...x, posts, stories, filledAt: now };
    });
    return n;
  } finally { fillBusy = false; }
}

export const BGS = ["linear-gradient(170deg,#3a3a52,#7a6a8e 50%,#d7a6b8)", "linear-gradient(170deg,#1f3b4d,#4f7a8a 55%,#c9dfe0)", "linear-gradient(170deg,#4a2c2a,#a0614f 55%,#f0c9a8)", "linear-gradient(170deg,#203020,#5f8a62 55%,#d8ead2)", "#111"];

function whoIds(who: string[] | undefined, self: InsAcc): string[] {
  const s = loadIns();
  const ids = (who ?? []).map(h => {
    if (/^(自己|self|me)$/i.test(h) || h.replace(/^@/, "") === self.handle) return self.charId;
    return Object.values(s.accs).find(a => a.handle === h.replace(/^@/, ""))?.charId;
  }).filter((x): x is string => Boolean(x));
  return ids.length ? [...new Set(ids)] : self.charId ? [self.charId] : [];
}

// ── 她发帖 ──

export async function myPost(input: { imgs: Img[]; cap: string; place?: string; hideLikes?: boolean; noComments?: boolean }): Promise<Post> {
  const s0 = loadIns();
  const post: Post = { id: uid("post"), by: ME, at: Date.now(), imgs: input.imgs, cap: input.cap, place: input.place, likes: 0, comments: [], hideLikes: input.hideLikes, noComments: input.noComments, wasPublic: !s0.me.private };
  patch(s => ({ ...s, posts: [...s.posts, post] }));
  try { await reactToMine(post.id); } catch { /* 没 API 也先发出去 */ }
  return loadIns().posts.find(p => p.id === post.id) ?? post;
}

async function reactToMine(postId: string): Promise<void> {
  const s = loadIns();
  const post = s.posts.find(p => p.id === postId);
  if (!post) return;
  const tier = fameTier(fameTotal());
  const profiles = loadProfiles();
  const fl = s.followers.map(id => s.accs[id]).filter(Boolean).map(a => `@${a.handle}（${a.name}${a.charId && profiles[a.charId] ? `，${profiles[a.charId].role}，跟她：${profiles[a.charId].relation ?? "认识"}` : ""}）`).join("、");
  const imgs = post.imgs.map((i, n) => `第${n + 1}张：${i.desc}${i.who?.length ? `（照片里有：${i.who.map(w => w === SELF_REFERENCE_ID ? "她自己" : loadCharacters().find(c => c.id === w)?.name).filter(Boolean).join("、")}）` : ""}`).join("\n");
  const res = await simpleLLMCall(config(), [
    { role: "system", content: `她刚在 ins 上发了一条帖子。你要做两件事，只输出 JSON：
{"likes":数字,"likers":["点赞的 handle"],"comments":[{"handle":"","text":"","zh":"不是中文时的翻译"}],"risk":{"level":"none / low / mid / high","why":"给她看的一句：会不会被认出来、能认出谁、哪里露馅","love":true或false}}
一、点赞和评论：${post.wasPublic ? `她的号是公开的，陌生人也看得到。她现在是「${tier.name}」：普通人就只有零星陌生人路过；小有人知会有人认出她；公众人物满屏粉丝。` : "她的号锁着，只有关注她的人看得到。"}关注她的人：${fl || "还没有"}。评论照每个人的身份和跟她的关系，韩国人用韩语。${post.noComments ? "她关了评论，comments 空着。" : ""}
二、风险：照这条帖子判断会不会被扒。吃的、风景、碎碎念 none；露脸自拍、练习室日常看她多出名，普通人基本 low；透露公司内部的事（排名、名单、吐槽公司）mid 以上；秀恩爱看对方能不能被认出来（露脸、他的手表戒指纹身衣服、能对上的时间地点），认不出 low，能认出 high，love 写 true。why 要具体。` },
    { role: "user", content: `帖子：\n${imgs}\n配文：${post.cap || "（没写）"}${post.place ? `\n地点：${post.place}` : ""}\n\n${idolWorldPrompt()}` },
  ], { temperature: 0.85, label: "ins 她发帖" });
  const j = pickJson<{ likes?: number; likers?: string[]; comments?: { handle?: string; text?: string; zh?: string }[]; risk?: Risk }>(res.content);
  const level = (["none", "low", "mid", "high"].includes(String(j.risk?.level)) ? j.risk!.level : "none") as Risk["level"];
  const risk: Risk = { level, why: String(j.risk?.why ?? ""), love: Boolean(j.risk?.love) };
  // 会不会被扒、什么时候：风险越大越快；出名、公开号更容易
  const base = { none: 0, low: 0.08, mid: 0.3, high: 0.6 }[level];
  const mul = (tier.name === "公众人物" ? 1.3 : tier.name === "小有人知" ? 0.8 : 0.3) * (post.wasPublic ? 1 : 0.5) * (risk.love && level === "high" ? 1.4 : 1);
  if (Math.random() < base * mul) {
    const d = level === "high" ? rnd(3, 12) * HOUR : level === "mid" ? rnd(1, 3) * DAY : rnd(3, 7) * DAY;
    risk.leakAt = post.at + d;
  }
  const now = Date.now();
  patch(x => ({
    ...x,
    posts: x.posts.map(p => p.id !== postId ? p : {
      ...p, risk, likes: Math.max(0, Math.round(Number(j.likes) || 0)), likers: (j.likers ?? []).map(String),
      comments: post.noComments ? [] : (j.comments ?? []).filter(c => c?.text).slice(0, 10).map((c, i) => ({ by: String(c.handle || "user").replace(/^@/, ""), text: String(c.text), zh: c.zh ? String(c.zh) : undefined, at: now + (i + 1) * rnd(3, 40) * MIN })),
    }),
    notes: [...x.notes, ...(j.likers ?? []).slice(0, 3).map(h => ({ id: uid("n"), at: now + rnd(2, 60) * MIN, kind: "like" as const, from: accByHandle(String(h))?.id ?? String(h), postId })),
      ...(j.comments ?? []).slice(0, 3).filter(c => c?.text).map(c => ({ id: uid("n"), at: now + rnd(5, 90) * MIN, kind: "comment" as const, from: accByHandle(String(c.handle))?.id ?? String(c.handle), text: String(c.text), postId }))],
  }));
}

/** 删帖 / 归档：记下时间，被扒那边看早不早 */
export function hidePost(id: string, how: "delete" | "archive") {
  patch(s => ({ ...s, posts: s.posts.map(p => p.id === id ? { ...p, [how === "delete" ? "deleted" : "archived"]: true, hiddenAt: p.hiddenAt ?? Date.now() } : p) }));
}
export function unarchive(id: string) { patch(s => ({ ...s, posts: s.posts.map(p => p.id === id ? { ...p, archived: false } : p) })); }
/** 切私密：之前公开时发的帖子，陌生人那边算「藏起来了」 */
export function setPrivate(on: boolean) {
  patch(s => ({ ...s, me: { ...s.me, private: on }, posts: on ? s.posts.map(p => p.by === ME && p.wasPublic && !p.hiddenAt ? { ...p, hiddenAt: Date.now() } : p) : s.posts }));
}

// ── 生图 ──

export async function generateImg(postId: string, idx: number, kind: "post" | "story" = "post"): Promise<void> {
  const s = loadIns();
  const target = kind === "post" ? s.posts.find(p => p.id === postId)?.imgs[idx] : s.stories.find(x => x.id === postId)?.img;
  if (!target || target.busy) return;
  const set = (img: Img) => patch(x => kind === "post"
    ? { ...x, posts: x.posts.map(p => p.id === postId ? { ...p, imgs: p.imgs.map((m, i) => i === idx ? img : m) } : p) }
    : { ...x, stories: x.stories.map(st => st.id === postId ? { ...st, img } : st) });
  set({ ...target, busy: true });
  try {
    const chars = loadCharacters();
    const people = (target.who ?? []).map(id => ({ id, name: id === SELF_REFERENCE_ID ? (loadTraineeCard()?.name || "我") : chars.find(c => c.id === id)?.name || "某人" }));
    const r = await generateImageFromConfiguredApi({ description: `ins 上的照片：${target.desc}`, people, appId: "ins" });
    set({ ...target, busy: false, src: r?.mediaRef ?? target.src });
  } catch (e) {
    set({ ...target, busy: false });
    throw e;
  }
}

// ── 快拍 ──

export function myStory(input: { text?: string; img?: Img; bg: string }) {
  const s = loadIns();
  const now = Date.now();
  const profiles = loadProfiles();
  // 谁看过：关注她的人，大多几个小时内；心动的人深夜看的多
  const viewers = s.followers.filter(() => Math.random() < 0.85).map(id => {
    const a = s.accs[id];
    const heart = a?.charId ? profiles[a.charId]?.heart : undefined;
    const late = heart && heart !== "没感觉" && Math.random() < 0.6;
    let at = now + rnd(5 * MIN, 10 * HOUR);
    if (late) { const d = new Date(now); d.setDate(d.getDate() + (d.getHours() >= 2 ? 1 : 0)); d.setHours(1 + Math.floor(rnd(0, 3)), Math.floor(rnd(0, 59))); at = d.getTime(); }
    return { id, at };
  });
  patch(x => ({ ...x, stories: [...x.stories, { id: uid("st"), by: ME, at: now, text: input.text, img: input.img, bg: input.bg, viewers }] }));
}
export const activeStories = () => loadIns().stories.filter(st => Date.now() - st.at < DAY && st.at <= Date.now());

// ── 探索 ──

let exploreBusy = false;
export async function refreshExplore(): Promise<void> {
  const day = new Date().toDateString();
  if (exploreBusy || loadIns().explore?.day === day) return;
  exploreBusy = true;
  try {
    const res = await simpleLLMCall(config(), [
      { role: "system", content: `写 ins「探索」页上的十二条公开帖子：首尔陌生人、博主、前辈团的官方号、粉丝站，照这个世界今天的样子。只输出 JSON：{"posts":[{"handle":"","name":"","official":false,"img":"画面一句话","cap":"","capZh":"","likes":数字}]}。团只用名册里有的；配文短，韩国人用韩语。` },
      { role: "user", content: idolWorldPrompt() },
    ], { temperature: 0.95, label: "ins 探索" });
    const j = pickJson<{ posts?: { handle?: string; name?: string; official?: boolean; img?: string; cap?: string; capZh?: string; likes?: number }[] }>(res.content);
    const ids: string[] = [];
    patch(x => {
      const accs = { ...x.accs };
      const posts = [...x.posts];
      for (const p of (j.posts ?? []).slice(0, 12)) {
        if (!p.img) continue;
        const handle = String(p.handle || `user${Math.floor(rnd(100, 999))}`).replace(/[^a-zA-Z0-9._]/g, "").toLowerCase();
        let acc = Object.values(accs).find(a => a.handle === handle);
        if (!acc) { const id = uid("acc"); acc = { id, handle, name: String(p.name || handle), private: false, verified: Boolean(p.official), followers: Math.round(p.official ? rnd(2e5, 5e6) : rnd(300, 50000)), bio: "", hue: hueOf(handle), kind: p.official ? "official" : "npc" }; accs[id] = acc; }
        const post: Post = { id: uid("post"), by: acc.id, at: Date.now() - rnd(1, 30) * HOUR, imgs: [{ desc: String(p.img) }], cap: String(p.cap ?? ""), capZh: p.capZh ? String(p.capZh) : undefined, likes: Math.round(Number(p.likes) || rnd(50, 5000)), comments: [] };
        posts.push(post); ids.push(post.id);
      }
      return { ...x, accs, posts, explore: { day, ids } };
    });
  } finally { exploreBusy = false; }
}

// ── 搜人 ──

export function searchAccs(q: string): InsAcc[] {
  const k = q.trim().toLowerCase();
  if (!k) return [];
  const s = loadIns();
  return Object.values(s.accs).filter(a => a.handle.includes(k) || a.name.toLowerCase().includes(k) || (a.charId && loadCharacters().find(c => c.id === a.charId)?.name.toLowerCase().includes(k))).slice(0, 20);
}
export function maybeKnow(): InsAcc[] {
  const s = loadIns();
  const profiles = loadProfiles();
  return Object.values(s.accs).filter(a => a.charId && !a.alt && profiles[a.charId]?.met && !s.following.includes(a.id)).slice(0, 8);
}
export function ownerName(a: InsAcc): string { return a.charId ? loadCharacters().find(c => c.id === a.charId)?.name ?? a.name : a.name; }

// ── 私信 ──

export function dmOf(id: string): Dm { return loadIns().dms[id] ?? { msgs: [], status: "open", auto: false, proactive: true }; }
function setDm(id: string, fn: (d: Dm) => Dm) { patch(s => ({ ...s, dms: { ...s.dms, [id]: fn(s.dms[id] ?? { msgs: [], status: "open", auto: false, proactive: true }) } })); }
export const dmAllowed = (id: string) => { const a = accOf(id); return !a?.charId || !isKakaoFriend(a.charId); };

export function sendDm(id: string, text: string, postId?: string) {
  setDm(id, d => ({ ...d, status: "open", lastMine: Date.now(), msgs: [...d.msgs, { id: uid("m"), me: true, text, at: Date.now(), postId }] }));
}
export function editDm(id: string, msgId: string, text: string) { setDm(id, d => ({ ...d, msgs: d.msgs.map(m => m.id === msgId ? { ...m, text } : m) })); }
export function deleteDm(id: string, msgId: string) { setDm(id, d => ({ ...d, msgs: d.msgs.filter(m => m.id !== msgId) })); }
export function setDmFlags(id: string, p: Partial<Pick<Dm, "auto" | "proactive" | "status">>) { setDm(id, d => ({ ...d, ...p })); }

const dmBusy = new Set<string>();
/** 他回（first=true 是「他先说一句」；redo=把他最后一组话换掉） */
export async function replyDm(id: string, opts: { first?: boolean; redo?: string } = {}): Promise<void> {
  if (dmBusy.has(id)) return;
  dmBusy.add(id);
  try {
    let d = dmOf(id);
    if (opts.redo) {
      // 把他那一组话（redo 那条所在的连续几句）去掉再回
      const msgs = d.msgs;
      const i = msgs.findIndex(m => m.id === opts.redo);
      if (i >= 0) {
        let j = i; while (j > 0 && !msgs[j - 1].me) j--;
        let k = i; while (k < msgs.length - 1 && !msgs[k + 1].me) k++;
        d = { ...d, msgs: [...msgs.slice(0, j), ...msgs.slice(k + 1)] };
        setDm(id, () => d);
      }
    }
    const a = accOf(id)!;
    const p = a.charId ? loadProfiles()[a.charId] : undefined;
    const me = loadIns().me;
    const hist = d.msgs.slice(-24).map(m => `${m.me ? "她" : a.name}：${m.text}${m.postId ? "（分享了一条帖子）" : ""}`).join("\n");
    const res = await simpleLLMCall(config(), [
      { role: "system", content: `你是 ins 上的 @${a.handle}（${a.alt ? `${ownerName(a)} 的私人小号` : a.name}），在 ins 私信里跟「她」（@${me.handle}）聊天。${p ? composePersona(p) : `你是${a.kind === "official" ? "团的官方号的运营" : "一个普通网友"}。`}
只输出 JSON：{"lines":[{"text":"","zh":"不是中文时的中文翻译"}]}，一到三句，像真人发私信：短、口语。韩国人说韩语。${opts.first ? "这是你先开口。" : ""}你们还没加 KakaoTalk。` },
      { role: "user", content: `${hist || "（还没聊过）"}\n\n${idolWorldPrompt()}` },
    ], { temperature: 0.9, label: "ins 私信" });
    const j = pickJson<{ lines?: { text?: string; zh?: string }[] }>(res.content);
    const lines = (j.lines ?? []).filter(l => l?.text).slice(0, 3);
    if (!lines.length) throw new Error(res.error || "他没回");
    const now = Date.now();
    setDm(id, x => ({ ...x, lastMine: undefined, msgs: [...x.msgs, ...lines.map((l, i) => ({ id: uid("m"), me: false, text: String(l.text), zh: l.zh ? String(l.zh) : undefined, at: now + i * 1000 }))] }));
  } finally { dmBusy.delete(id); }
}
export const dmReplying = (id: string) => dmBusy.has(id);

export function unseenNotes(): number { const s = loadIns(); return s.notes.filter(n => n.at <= Date.now() && n.at > (s.seenNotesAt ?? 0)).length; }
export function markNotesSeen() { patch(s => ({ ...s, seenNotesAt: Date.now() })); }
export const careerStage = () => loadCareer().stage;
