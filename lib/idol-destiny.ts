/**
 * 爱豆小手机：命运（星路图鉴）。规矩见 docs/idol/destiny.md 第 3 节。
 *
 * - 签了公司以后一次 AI 调用写好 8 个，练习生时期就这 8 个，不补。清单她看不到
 * - 每个是彩蛋：平常练习生生活碰不到的机会。触发条件从代码给的几种里选，节奏代码管（分散到整个练习生时期，三周没来就保底推一个）
 * - 来法：KakaoTalk（陌生人加她 / 认识的人私聊 / 室长 / 家里人）或此刻地图上冒「!」（发横幅，挂一周）
 * - 触发那一刻图鉴就翻开（去不去都翻）；要她去哪儿就进提醒事项待回复
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import type { Character } from "./character-types";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { addToCalendar, companyOf, loadCareer, saveCareer, type CareerNode } from "./idol-career";
import { describeTrainee, loadTraineeCard } from "./trainee-card";
import { createPerson, draftPerson, draftFields, emptyProfile, getProfile, rollFace, saveProfile } from "./idol-people";
import { genKakaoId, queueFriendRequest } from "./idol-kakao";
import { loadGrades, SUBJECTS, type Subject } from "./idol-starroad";
import { allScenePlaces } from "./idol-stage";
import { ENGINE_EVENTS } from "./idol-events";

const KEY = "idol_destiny_v1";
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const DESTINY_EVENT = "idol-destiny-changed";
/** 三周一个都没来就保底 */
const DROUGHT = 21 * DAY;

export const CARD_COLORS = ["#E4E0AA", "#E8CBC5", "#C9DCC6", "#C6D4E0", "#D4CCE1", "#EBD4B6", "#CCD3B2", "#DED6CB"];

export type Via = "new" | "friend" | "teacher" | "family" | "stage";
export type Trigger =
  | { type: "time" }
  | { type: "grade"; subject: Subject; grade: "C" | "B" | "A" }
  | { type: "place"; place: string; times: number }
  | { type: "fame"; level: number };

export type Destiny = {
  id: string;
  /** big 改变走向 / mid 新的人或圈子 / small 小确幸 */
  size?: "big" | "mid" | "small";
  title: string;
  en: string;
  /** 给触发时的 AI 看的一句 */
  seed: string;
  via: Via;
  /** 谁来找她（stage 不用） */
  who?: { name: string; role: string };
  /** 新认识的人加她时说的第一句 */
  hello?: string;
  /** stage：哪个地点冒「!」 */
  place?: string;
  /** 约她去哪儿（可以没有） */
  meet?: { title: string; place: string; days: number; hour: number };
  trigger: Trigger;
  /** 最早什么时候能来（代码按练习生时期分散排） */
  earliestAt: number;
  firedAt?: number;
  /** 翻开后在图鉴第几格（按翻开顺序） */
  no?: number;
  color?: string;
  /** stage：「!」挂到什么时候；点进去了记 opened */
  markUntil?: number;
  opened?: boolean;
};

type State = { cards: Destiny[]; createdAt: number; lastFiredAt: number; failedAt?: number };

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function emit() { if (typeof window !== "undefined") window.dispatchEvent(new Event(DESTINY_EVENT)); }
function load(): State | null { try { return JSON.parse(kvGet(KEY) || "null") as State | null; } catch { return null; } }
function save(s: State) { kvSet(KEY, JSON.stringify(s)); emit(); }

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

// ── 图鉴（星路读） ──

/** 八格：翻开的按顺序排前面，没翻开的是 null */
export function destinyAlbum(): ({ title: string; en: string; color: string; no: number } | null)[] {
  const s = load();
  const open = (s?.cards ?? []).filter(c => c.firedAt).sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
  const out: ({ title: string; en: string; color: string; no: number } | null)[] = open.map(c => ({ title: c.title, en: c.en, color: c.color || CARD_COLORS[0], no: c.no ?? 0 }));
  while (out.length < 8) out.push(null);
  return out;
}

// ── 此刻的「!」 ──

/** 现在挂着「!」的地点 */
export function destinyMarks(now = Date.now()): { place: string; id: string }[] {
  return (load()?.cards ?? []).filter(c => c.via === "stage" && c.firedAt && !c.opened && c.place && (c.markUntil ?? 0) > now).map(c => ({ place: c.place!, id: c.id }));
}
/** 点进去：开场用的那一句，记成已经去了 */
export function takeDestinyMark(place: string): string | null {
  const s = load();
  const c = s?.cards.find(x => x.via === "stage" && x.firedAt && !x.opened && x.place === place && (x.markUntil ?? 0) > Date.now());
  if (!s || !c) return null;
  c.opened = true;
  save(s);
  return `${c.seed}（这是她命运里的一件事：照这一句往下发展，结合她现在的处境、时间地点，写成真的发生了，不提前替她决定结果）`;
}

// ── 生成 ──

/** 练习生大概多久（看练习生证，看不懂按一年半），用来把八个分散开 */
function traineeSpan(): number {
  const raw = loadTraineeCard()?.trainLength ?? "";
  const n = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
  let months = /年/.test(raw) ? n * 12 + (/半/.test(raw) ? 6 : 0) : /月/.test(raw) ? n : 0;
  if (!months && /半年/.test(raw)) months = 6;
  if (!months) months = 18;
  return Math.max(4, Math.min(48, months)) * 30 * DAY;
}

const VIAS: Via[] = ["new", "friend", "teacher", "family", "stage"];

async function generate(): Promise<State | null> {
  const career = loadCareer();
  const card = loadTraineeCard();
  const c = companyOf(career.companyId);
  if (!card || !c) return null;
  const places = allScenePlaces().filter(p => !p.sub && !p.lock).map(p => p.key);
  const friends = loadCharacters().filter(ch => getProfile(ch.id).met).map(ch => `${ch.name}（${getProfile(ch.id).role}）`).slice(0, 20);
  const res = await simpleLLMCall(chatConfig(), [
    { role: "system", content: [
      "你在给一个韩国练习生女孩写她练习生时期命运里的八个彩蛋。只输出 JSON：{\"cards\":[…8 个…]}",
      "彩蛋是她照平常练习生的日子根本碰不到、自己去哪儿找谁都安排不出来的意想不到的事，要从她的家境、公司、特长、性格里长出来，换一个人就不会发生。",
      "八个分三种，size 写清楚：big 两个，会改变她这段练习生日子的走向，牵出持续几个月的一条线；mid 三个，给她带来一个练习生圈子以外的重要的人或一个新的圈子，之后会来往好几周；small 三个，小确幸，分量不大但温暖、让人记很久。",
      "big 和 mid 必须是一扇门，之后还能接着往下走，不是见一面聊一次就完。",
      `下面这些是她平常日子里本来就会发生的事，跟这些重了、或者只是换个说法的都不算彩蛋：${ENGINE_EVENTS}`,
      "也不许写练习进步、升级、排名、出道组、关注度上涨，不许决定她能不能出道。画风跟这部戏一致，写实的韩国娱乐圈和首尔日常。",
      "先在心里想十二个，只输出其中最意想不到、最只属于她的八个，八个互不相同。",
      "每个字段：",
      "title：卡片标题，中文 2～8 个字，像小卡上的名字，不写过程",
      "en：配一行英文，2～4 个词，小写",
      "seed：一句话，写给到时候发展剧情的人看：谁、因为什么、带来什么机会（不写结果）",
      `via：她怎么知道，只能是 ${VIAS.join(" / ")}（new=一个陌生人加她 KakaoTalk；friend=认识的人私聊她；teacher=室长找她；family=家里人发消息；stage=她在某个地点撞见）。八个里 stage 两到三个，其余分散`,
      "who：via 不是 stage 时写 {\"name\":\"韩文名的中文写法或家人称呼\",\"role\":\"身份一句\"}；friend 只能从她认识的人里选，没合适的就用 new；stage 写 null",
      "hello：via=new 时他加她说的第一句，其余写空",
      `place：via=stage 时从这些地点里选一个（照原样）：${places.join("、")}；其余写空`,
      "meet：要约她去哪儿见谁就写 {\"title\":\"提醒事项里的标题\",\"place\":\"地点\",\"days\":几天后,\"hour\":几点}，不用约就写 null",
      "size：big / mid / small",
      `trigger：从这几种里选最合适的：{"type":"time"}（到时候就来）、{"type":"grade","subject":"${SUBJECTS.map(s => s.id).join("/")}","grade":"C/B/A"}（某门课升到某档）、{"type":"place","place":"上面的地点","times":2～4}（去过某地几次）、{"type":"fame","level":20～60}（有了一点名气）。time 占一半左右；选 place 的，这件事必须跟那个地方本身有关系`,
    ].join("\n") },
    { role: "user", content: [
      describeTrainee(card),
      `【公司】${c.name}：${c.scale}；${c.style}；练习生：${c.trainee}`,
      friends.length ? `【她认识的人】${friends.join("、")}` : "【她认识的人】还没几个",
    ].join("\n\n") },
  ], { temperature: 1, label: "命运" });
  if (!res.content) throw new Error(res.error || "AI 没回");
  const j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { cards?: Partial<Destiny & { who: Destiny["who"] | null; meet: Destiny["meet"] | null; trigger: Partial<Trigger> & { type?: string; subject?: string; grade?: string; place?: string; times?: number; level?: number } }>[] };
  const raw = (j.cards ?? []).filter(x => x && x.title && x.seed).slice(0, 8);
  if (raw.length < 8) throw new Error("命运没写够八个");
  const start = career.signedAt ?? Date.now();
  const span = traineeSpan();
  // 打乱顺序后分散排：第 i 个最早在练习生时期的 (i+0.4)/8 处，前后挪一点
  const order = raw.map(x => ({ x, k: Math.random() })).sort((a, b) => a.k - b.k).map(o => o.x);
  const cards: Destiny[] = order.map((x, i) => {
    const via: Via = VIAS.includes(x.via as Via) ? x.via as Via : "new";
    const t = (x.trigger ?? {}) as { type?: string; subject?: string; grade?: string; place?: string; times?: number; level?: number };
    let trigger: Trigger = { type: "time" };
    if (t.type === "grade" && SUBJECTS.some(s => s.id === t.subject) && ["C", "B", "A"].includes(String(t.grade))) trigger = { type: "grade", subject: t.subject as Subject, grade: t.grade as "C" | "B" | "A" };
    if (t.type === "place" && t.place && places.includes(t.place)) trigger = { type: "place", place: t.place, times: Math.max(2, Math.min(4, Number(t.times) || 2)) };
    if (t.type === "fame") trigger = { type: "fame", level: Math.max(15, Math.min(60, Number(t.level) || 25)) };
    const place = via === "stage" ? (places.includes(String(x.place)) ? String(x.place) : "便利店") : undefined;
    const meet = x.meet && x.meet.title ? { title: String(x.meet.title), place: String(x.meet.place || ""), days: Math.max(1, Math.min(14, Number(x.meet.days) || 3)), hour: Math.max(8, Math.min(22, Number(x.meet.hour) || 19)) } : undefined;
    return {
      id: uid("fate"), size: (["big", "mid", "small"].includes(String(x.size)) ? x.size : "mid") as Destiny["size"], title: String(x.title).slice(0, 12), en: String(x.en || "").toLowerCase().slice(0, 30), seed: String(x.seed),
      via, who: via === "stage" ? undefined : { name: String(x.who?.name || ""), role: String(x.who?.role || "") },
      hello: x.hello ? String(x.hello) : undefined, place, meet, trigger,
      earliestAt: start + 14 * DAY + ((i + 0.4) / 8) * span + (Math.random() - 0.5) * 12 * DAY,
    };
  });
  return { cards, createdAt: Date.now(), lastFiredAt: start };
}

// ── 触发 ──

function placeVisits(place: string): number {
  try {
    const scenes = Object.values(JSON.parse(kvGet("idol_stage_scenes_v1") || "{}") as Record<string, { bg?: string; place?: string }>);
    return scenes.filter(s => s.bg === place || s.place === place).length;
  } catch { return 0; }
}
function fameNow(): number {
  try { return Number((JSON.parse(kvGet("idol_events_v1") || "null") as { fame?: number } | null)?.fame) || 0; } catch { return 0; }
}
function met(c: Destiny): boolean {
  const t = c.trigger;
  if (t.type === "time") return true;
  if (t.type === "grade") { const g = loadGrades().find(x => x.id === t.subject); return Boolean(g && "FDCBA".indexOf(g.grade) >= "FDCBA".indexOf(t.grade)); }
  if (t.type === "place") return placeVisits(t.place) >= t.times;
  if (t.type === "fame") return fameNow() >= t.level;
  return false;
}

function findPerson(name: string): Character | undefined {
  return name ? loadCharacters().find(c => c.name === name) : undefined;
}

async function personFor(c: Destiny): Promise<Character | null> {
  if (c.via === "teacher") {
    try { const id = (JSON.parse(kvGet("idol_kakao_v1") || "null") as { teacherId?: string } | null)?.teacherId; const t = loadCharacters().find(x => x.id === id); if (t) return t; } catch { /* 没有室长就当新人 */ }
  }
  if (c.via === "family") {
    const fam = loadCharacters().find(x => /妈妈|爸爸|母亲|父亲|家人|姐姐|哥哥|外婆|奶奶/.test(`${x.name}${getProfile(x.id).role}`) && getProfile(x.id).group !== "公司");
    if (fam) return fam;
  }
  const have = findPerson(c.who?.name ?? "");
  if (have) return have;
  const name = c.who?.name || "";
  const d = await draftPerson(`${c.who?.role || "跟她命运里一件事有关的人"}。他找她是因为：${c.seed}${name ? `。名字叫${name}` : ""}`, rollFace());
  const ch = createPerson(name || d.name || "陌生人", {
    ...emptyProfile(""), ...draftFields(d), layer: "main", role: d.role || c.who?.role || "", group: c.via === "family" ? "家人" : d.group || "",
    ...(c.via === "family" ? { met: true } : {}),
  }, null, genKakaoId());
  if (c.via === "family") saveProfile({ ...getProfile(ch.id), met: true, withYou: "家里人" });
  return ch;
}

async function fire(c: Destiny, s: State, notify: (m: string) => void): Promise<void> {
  const now = Date.now();
  c.firedAt = now;
  c.no = s.cards.filter(x => x.firedAt).length;
  c.color = CARD_COLORS[(c.no - 1) % CARD_COLORS.length];
  s.lastFiredAt = now;
  if (c.via === "stage") {
    c.markUntil = now + 7 * DAY;
    save(s);
    const label = allScenePlaces().find(p => p.key === c.place)?.label ?? c.place;
    notify(`◐ 此刻：${label}好像有什么不一样`);
    return;
  }
  save(s);
  const who = await personFor(c);
  if (!who) return;
  const p = getProfile(who.id);
  saveProfile({ ...p, events: [...p.events, { id: uid("ev"), at: now, place: "", text: `你找她是因为：${c.seed}` }] });
  if (c.meet) {
    const due = new Date(now + c.meet.days * DAY); due.setHours(c.meet.hour, 0, 0, 0);
    const career = loadCareer();
    const node: CareerNode = {
      id: uid("node"), kind: "chance", title: c.meet.title, place: c.meet.place || "", premise: `${c.seed}（她命运里的一件事）`,
      dueAt: due.getTime(), status: "invite", replyBy: now + 2 * DAY, from: who.name, fromId: who.id, note: c.seed,
    };
    saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
    addToCalendar(node);
  }
  const ask = c.meet ? `，顺便约她${c.meet.days}天后${c.meet.hour}点去${c.meet.place || "见面"}（${c.meet.title}），问她来不来` : "";
  if (c.via === "new") {
    // 陌生人：进「新的朋友」。她接受后他回的那句会照「你找她是因为」开口
    queueFriendRequest(who.id, c.hello || "你好，冒昧加你", "", now + (5 + Math.random() * 25) * MIN);
    return;
  }
  const { queueMessage } = await import("./idol-reminders");
  queueMessage(who.id, `你有件事想跟她说：${c.seed}。按你们的关系和你的性格，自然地在 KakaoTalk 上说${ask}。一到三条。`, (3 + Math.random() * 20) * MIN);
}

/** 跳时间停在下一个一定会来的命运前（到点就来的、保底那个） */
export function destinyStops(): { at: number; title: string }[] {
  const s = load();
  if (!s || loadCareer().stage !== "trainee") return [];
  const left = s.cards.filter(c => !c.firedAt);
  if (!left.length) return [];
  const timed = left.filter(c => c.trigger.type === "time").map(c => Math.max(c.earliestAt, s.lastFiredAt + 5 * DAY));
  const drought = Math.max(s.lastFiredAt + DROUGHT, Math.min(...left.map(c => c.earliestAt)));
  const at = Math.min(...timed, drought);
  return Number.isFinite(at) ? [{ at, title: "好像有什么事要发生" }] : [];
}

let busy = false;

export function destinyTick(notify: (m: string) => void): void {
  if (busy) return;
  const career = loadCareer();
  if (career.stage !== "trainee" || !career.signedAt) return;
  const now = Date.now();
  const s = load();
  if (!s) {
    // 签约第二天以后写（第一天先让她进公司）；失败了半小时再试
    if (now - career.signedAt < DAY) return;
    const failed = Number(kvGet(`${KEY}_failed`) || 0);
    if (Date.now() - failed < 30 * MIN && failed) return;
    busy = true;
    void generate().then(st => { if (st) save(st); }).catch(() => kvSet(`${KEY}_failed`, String(Date.now()))).finally(() => { busy = false; });
    return;
  }
  const left = s.cards.filter(c => !c.firedAt && c.earliestAt <= now);
  // 两个命运之间至少隔五天
  if (!left.length || now - s.lastFiredAt < 5 * DAY) return;
  let pick = left.filter(met).sort((a, b) => a.earliestAt - b.earliestAt)[0];
  if (!pick && now - s.lastFiredAt >= DROUGHT) pick = left.sort((a, b) => a.earliestAt - b.earliestAt)[0];
  if (!pick) return;
  busy = true;
  void fire(pick, s, notify).catch(() => undefined).finally(() => { busy = false; });
}
