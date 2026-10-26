/**
 * 爱豆小手机的人物档案（通讯录 app 用）。
 *
 * 每个人都是 float 的一个角色（Character），这样 KakaoTalk、记忆、各个 app 都认得他；
 * 这里另存一份结构化档案（公开人设、私下、说话、雷区、跟你、你们的事……），
 * 改档案时自动拼成角色的 persona，AI 读的就是拼好的那份。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCharacters, saveCharacters, createCharacter } from "./character-storage";
import type { Character } from "./character-types";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";

const PEOPLE_KEY = "idol_people_v1";
const LISTS_KEY = "idol_contact_lists_v1";
export const PEOPLE_UPDATED_EVENT = "idol-people-updated";

/** 私下跟公开人设的关系，代码掷骰子定 */
export type FaceRelation = "same" | "mixed" | "different";
export const FACE_LABEL: Record<FaceRelation, string> = {
  same: "表里如一",
  mixed: "有一样有不一样",
  different: "完全两个人",
};

export type PersonEvent = { id: string; at: number; place: string; text: string };

/** 关系线：从「跟你过不去」到「恋人」，「前任」单独 */
export const RELATIONS = ["跟你过不去", "不喜欢你", "有点烦你", "陌生", "认识", "熟人", "朋友", "好朋友", "暧昧", "恋人"] as const;
export type Relation = typeof RELATIONS[number] | "前任";
/** 心动线：只有可能对她心动的人才有 */
export const HEARTS = ["没感觉", "有好感", "有点在意", "喜欢", "很喜欢"] as const;
export type Heart = typeof HEARTS[number];
/** 秘密：none 没有 / light 小秘密 / heavy 重的（作风、关系户） */
export type SecretKind = "none" | "light" | "heavy";
export type Secret = { kind: SecretKind; text: string; revealed?: { at: number; how: string } };
/** 她的人缘（默认招人喜欢） */
export type Charm = "normal" | "likable" | "everyone";
export const CHARM_LABEL: Record<Charm, string> = { normal: "普通", likable: "招人喜欢", everyone: "万人迷" };

export type IdolProfile = {
  charId: string;
  /** main = 主要人物（进通讯录、能私聊），background = 背景人物 */
  layer: "main" | "background";
  /** 身份分组：公司 / 同期练习生 / 前辈后辈 / 家和老朋友 / 粉丝…… */
  group: string;
  /** 一句话身份，比如「VANTA 主唱 · 同公司前辈」 */
  role: string;
  age: string;
  isIdol: boolean;
  publicLabels: string[];
  publicText: string;
  face: FaceRelation;
  /** 私下（爱豆）/ 平时（非爱豆）：几句具体会做的事 */
  privateLines: string[];
  speech: string;
  taboo: string;
  /** 跟你：见面后才有 */
  withYou: string;
  met: boolean;
  metAt?: { at: number; place: string };
  /** 他把 KakaoTalk ID 给过她（没给过，名片上不显示 ID） */
  gaveId?: boolean;
  events: PersonEvent[];
  /** 只有她看得到 */
  note: string;
  gender?: "男" | "女" | "";
  /** 生日 MM-DD */
  birthday?: string;
  mbti?: string;
  relation?: Relation;
  /** undefined = 没有心动线 */
  heart?: Heart;
  canCrush?: boolean;
  secret?: Secret;
  /** 开局骰子掷过了（心动线、起点） */
  rolled?: boolean;
  /** 最近在忙什么：text 世界视角一句（名片「最近」），kakao 他自己写的 KakaoTalk 状态消息 */
  status?: { text: string; kakao: string; at: number };
};

export type ContactList = { id: string; name: string; memberIds: string[] };

function emitChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PEOPLE_UPDATED_EVENT));
}

export function loadProfiles(): Record<string, IdolProfile> {
  try {
    const raw = JSON.parse(kvGet(PEOPLE_KEY) || "{}");
    return raw && typeof raw === "object" ? raw as Record<string, IdolProfile> : {};
  } catch {
    return {};
  }
}

function saveProfiles(all: Record<string, IdolProfile>) {
  kvSet(PEOPLE_KEY, JSON.stringify(all));
  emitChanged();
}

export function emptyProfile(charId: string): IdolProfile {
  return {
    charId,
    layer: "main",
    group: "",
    role: "",
    age: "",
    isIdol: false,
    publicLabels: [],
    publicText: "",
    face: rollFace(),
    privateLines: [],
    speech: "",
    taboo: "",
    withYou: "",
    met: false,
    events: [],
    note: "",
  };
}

export function getProfile(charId: string): IdolProfile {
  return { ...emptyProfile(charId), ...(loadProfiles()[charId] ?? {}) };
}

export function rollFace(): FaceRelation {
  const r = Math.random();
  return r < 0.3 ? "same" : r < 0.75 ? "mixed" : "different";
}

/** 档案拼成给 AI 读的人设 */
export function composePersona(p: IdolProfile): string {
  const out: string[] = [];
  const head = [p.role, p.gender, p.age ? `${p.age}岁` : "", p.birthday ? `生日 ${p.birthday.replace("-", "月")}日` : "", p.mbti ? `MBTI ${p.mbti}（只是参考，不刻板）` : ""].filter(Boolean).join("，");
  if (head) out.push(`【身份】${head}`);
  if (p.isIdol && (p.publicLabels.length || p.publicText)) {
    out.push(`【公开人设】${p.publicLabels.length ? `标签：${p.publicLabels.join("、")}。` : ""}${p.publicText}`);
  }
  if (p.privateLines.length) {
    const title = p.isIdol ? `【私下】（跟公开人设：${FACE_LABEL[p.face]}）` : "【平时】";
    out.push(`${title}\n${p.privateLines.map(l => `- ${l}`).join("\n")}`);
  }
  if (p.speech) out.push(`【说话】${p.speech}`);
  if (p.taboo) out.push(`【雷区】${p.taboo}`);
  if (p.status?.text) out.push(`【最近】${p.status.text}`);
  if (p.met && p.withYou) out.push(`【对她的印象】${p.withYou}`);
  const rel = relationOf(p);
  out.push(`【你对她的态度】关系：${rel}${p.canCrush && p.heart ? `；心动：${p.heart}` : ""}。照这个态度说话做事，不要比它更热情或更冷淡；心动到哪一步就表现到哪一步，要不要表白、什么时候表白看你的性格和处境。`);
  if (p.secret && p.secret.kind !== "none" && p.secret.text) {
    out.push(`【你的秘密】${p.secret.text}${p.secret.revealed ? "（她已经知道了）" : "（她还不知道，不要自己说破，但会在言行里慢慢露出来）"}`);
  }
  if (p.events.length) {
    out.push(`【和她之间的事】\n${p.events.slice(-12).map(e => `- ${fmtDay(e.at)}${e.place ? ` · ${e.place}` : ""}：${e.text}`).join("\n")}`);
  }
  return out.join("\n\n");
}

export function relationOf(p: IdolProfile): Relation {
  return p.relation ?? (p.met ? "认识" : "陌生");
}

// ── 人缘、开局骰子 ──

const CHARM_KEY = "idol_charm_v1";
export function loadCharm(): Charm {
  const v = kvGet(CHARM_KEY);
  return v === "normal" || v === "everyone" ? v : "likable";
}
export function saveCharm(c: Charm): void { kvSet(CHARM_KEY, c); }

/** 她现在几岁（练习生证生日 + 世界时间） */
export function herAge(): number | null {
  try {
    const card = JSON.parse(kvGet("idol_trainee_card_v1") || "null") as { birthday?: string } | null;
    if (!card?.birthday) return null;
    const b = new Date(card.birthday);
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
    return a;
  } catch { return null; }
}

const AUTHORITY = /老师|经纪|管理|社长|理事|室长|组长|代表|制作人|PD|导演/;

/** 秘密骰子：大概三分之一有小秘密，重的十个里最多一个 */
export function rollSecretKind(): SecretKind {
  const r = Math.random();
  return r < 0.08 ? "heavy" : r < 0.35 ? "light" : "none";
}

/** 性别、年龄知道了以后掷一次：有没有心动线、心动起点、关系起点 */
export function applyStartRolls(p: IdolProfile): IdolProfile {
  if (p.rolled) return p;
  const age = parseInt(p.age, 10);
  if (!p.gender || !Number.isFinite(age)) return p;
  const mine = herAge();
  const gap = mine == null ? 99 : Math.abs(age - mine);
  const limit = mine != null && mine < 18 ? 3 : 4;
  const eligible = gap <= limit && !AUTHORITY.test(p.role) && (mine == null || mine >= 18 || age < 20);
  const canCrush = eligible && (p.gender === "男" || Math.random() < 0.1);
  let heart: Heart | undefined;
  if (canCrush) {
    const charm = loadCharm();
    const [first, liked] = charm === "normal" ? [1 / 15, 0.2] : charm === "everyone" ? [0.2, 0.8] : [1 / 8, 0.5];
    const r = Math.random();
    heart = r < first ? "喜欢" : r < liked ? "有好感" : "没感觉";
  }
  return { ...p, canCrush, heart, rolled: true };
}

/** 关系、心动往上或往下走一格 */
export function stepRelation(p: IdolProfile, dir: "up" | "down" | "same", heartDir: "up" | "down" | "same"): IdolProfile {
  let heart = p.heart;
  if (p.canCrush && heart && heartDir !== "same") {
    const i = HEARTS.indexOf(heart);
    heart = HEARTS[Math.max(0, Math.min(HEARTS.length - 1, i + (heartDir === "up" ? 1 : -1)))];
  }
  let rel = relationOf(p);
  if (dir !== "same") {
    if (rel === "前任") rel = dir === "up" ? "熟人" : "有点烦你";
    else {
      const i = RELATIONS.indexOf(rel);
      let next = i + (dir === "up" ? 1 : -1);
      // 暧昧、恋人只给有心动线、而且心动到了的人
      const romantic = p.canCrush && heart && HEARTS.indexOf(heart) >= HEARTS.indexOf("有点在意");
      if (RELATIONS[next] === "暧昧" && !romantic) next = i;
      if (RELATIONS[next] === "恋人" && !(p.canCrush && heart && HEARTS.indexOf(heart) >= HEARTS.indexOf("喜欢"))) next = i;
      if (rel === "恋人" && dir === "down") { rel = "前任"; next = -1; }
      if (next >= 0) rel = RELATIONS[Math.max(0, Math.min(RELATIONS.length - 1, next))];
    }
  }
  return { ...p, relation: rel, heart };
}

/** 很久没交集会淡：好朋友三周没事退回朋友，暧昧退回好朋友 */
export function decayRelations(): void {
  const all = loadProfiles();
  const now = Date.now();
  let changed = false;
  for (const id of Object.keys(all)) {
    const p = all[id];
    const last = Math.max(p.metAt?.at ?? 0, ...p.events.map(e => e.at));
    if (!last || now - last < 21 * 864e5) continue;
    const rel = relationOf(p);
    if (rel === "好朋友" || rel === "暧昧") {
      all[id] = { ...p, relation: rel === "好朋友" ? "朋友" : "好朋友", events: [...p.events, { id: `ev_decay_${now.toString(36)}`, at: now, place: "", text: "很久没什么交集，关系淡了一点" }] };
      changed = true;
    }
  }
  if (changed) saveProfiles(all);
}

export function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 存档案，顺手把角色的 persona、名字、头像更新掉 */
export function saveProfile(input: IdolProfile, charPatch?: Partial<Pick<Character, "name" | "avatar" | "wechatID">>): void {
  const p = applyStartRolls(input);
  const all = loadProfiles();
  all[p.charId] = p;
  saveProfiles(all);
  const chars = loadCharacters();
  const idx = chars.findIndex(c => c.id === p.charId);
  if (idx >= 0) {
    chars[idx] = { ...chars[idx], ...(charPatch ?? {}), persona: composePersona(p), updatedAt: new Date().toISOString() };
    saveCharacters(chars);
  }
}

/** 新建一个人：建角色 + 存档案 */
export function createPerson(name: string, profile: Omit<IdolProfile, "charId">, avatar: string | null = null, wechatID?: string): Character {
  const char = createCharacter({ name, avatar, persona: "", ...(wechatID ? { wechatID } : {}) });
  const full: IdolProfile = applyStartRolls({ ...profile, charId: char.id });
  char.persona = composePersona(full);
  saveCharacters([...loadCharacters(), char]);
  const all = loadProfiles();
  all[char.id] = full;
  saveProfiles(all);
  return char;
}

export function deletePerson(charId: string): void {
  const all = loadProfiles();
  delete all[charId];
  saveProfiles(all);
  saveCharacters(loadCharacters().filter(c => c.id !== charId));
  saveLists(loadLists().map(l => ({ ...l, memberIds: l.memberIds.filter(id => id !== charId) })));
}

// ── 列表（她自己建的分组；身份分组用 profile.group） ──

export function loadLists(): ContactList[] {
  try {
    const raw = JSON.parse(kvGet(LISTS_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveLists(lists: ContactList[]): void {
  kvSet(LISTS_KEY, JSON.stringify(lists));
  emitChanged();
}

/** 身份分组改名（所有这个组的人一起改） */
export function renameGroup(from: string, to: string): void {
  const all = loadProfiles();
  for (const id of Object.keys(all)) if (all[id].group === from) all[id] = { ...all[id], group: to };
  saveProfiles(all);
}

/** 删掉身份分组：人还在，只是不再归到这个组 */
export function clearGroup(name: string): void {
  renameGroup(name, "");
}

// ── 拼音首字母（不用额外的库：按拼音排序规则比较边界字） ──

const LETTER_BOUNDS: [string, string][] = [
  ["A", "阿"], ["B", "八"], ["C", "嚓"], ["D", "哒"], ["E", "妸"], ["F", "发"], ["G", "旮"], ["H", "哈"],
  ["J", "讥"], ["K", "咔"], ["L", "垃"], ["M", "妈"], ["N", "拏"], ["O", "噢"], ["P", "妑"], ["Q", "七"],
  ["R", "呥"], ["S", "仨"], ["T", "他"], ["W", "屲"], ["X", "夕"], ["Y", "丫"], ["Z", "帀"],
];
const collator = typeof Intl !== "undefined" ? new Intl.Collator("zh-Hans-CN-u-co-pinyin") : null;

export function initialOf(name: string): string {
  const ch = name.trim().charAt(0);
  if (!ch) return "#";
  if (/[a-z]/i.test(ch)) return ch.toUpperCase();
  if (!/[一-鿿]/.test(ch) || !collator) return "#";
  let letter = "#";
  for (const [l, bound] of LETTER_BOUNDS) {
    if (collator.compare(ch, bound) >= 0) letter = l;
    else break;
  }
  return letter;
}

export function comparePinyin(a: string, b: string): number {
  return collator ? collator.compare(a, b) : a.localeCompare(b);
}

// ── AI：照模板捏人 / 照方向改 ──

export type CardDraft = {
  name: string;
  gender: "男" | "女" | "";
  birthday: string;
  mbti: string;
  secret: string;
  role: string;
  group: string;
  age: string;
  isIdol: boolean;
  publicLabels: string[];
  publicText: string;
  privateLines: string[];
  speech: string;
  taboo: string;
};

const CARD_RULES = `写人物卡的规矩：
- 这是一个以韩国娱乐圈为背景的故事，主角是「她」（用户），一个想当爱豆的女生。
- 大多数人是普通人：性格正常，会开玩笑，也会笨拙、说错话。不面瘫、不病弱、不高冷，不硬塞创伤和秘密，不写「怕什么、想要什么」。
- 只写具体会做的事和具体的说话方式，不写抽象形容词堆砌。
- 只有已经出道的爱豆才有公开人设（标签 + 两三句粉丝眼里的他）；不是爱豆的人公开人设留空。
- 私下（爱豆）或平时（非爱豆）写四五句具体行为。私下和公开人设的关系按给定的骰子结果写。
- 雷区可以没有。
- 不写他对她的第一印象，他们还没见过。
- 名字用韩国人名的中文写法（外国人按国籍）。
- 跟名单里已有的人不要撞型、不要重名。
- 每个人都写性别、生日（月-日）、MBTI。MBTI 只是个标志，性格参考它但不刻板，也不要跟它差太远。
- 年龄：跟她一起玩的同期练习生 16～19 岁，跟她差不多大；公司里的练习生 12～21 岁；20 岁以上的练习生少见，会被人议论年纪大。老师、经纪人、工作人员这些大人不限。
- 秘密按给定的骰子写：没有就留空；小秘密写一件他瞒着别人的小事或心事；重的写作风不正（同时吊着好几个人、劈腿这类，成年人才可以写约炮）或者关系户。秘密只写一句事实，不写成创伤故事。
只输出一个 JSON 对象，不要别的字：
{"name":"","gender":"男或女","birthday":"MM-DD","mbti":"","role":"一句话身份","group":"身份分组","age":"","isIdol":false,"publicLabels":[],"publicText":"","privateLines":[],"speech":"","taboo":"","secret":""}`;

const SECRET_DICE: Record<SecretKind, string> = { none: "没有秘密", light: "有一个小秘密", heavy: "有一个重的秘密" };

function herLine(): string {
  const a = herAge();
  return a == null ? "" : `她现在 ${a} 岁。`;
}

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API，先去设置里配一个");
  return config;
}

function rosterLine(exceptId?: string): string {
  const all = loadProfiles();
  const chars = loadCharacters();
  const lines = chars
    .filter(c => c.id !== exceptId && all[c.id])
    .map(c => `${c.name}（${all[c.id].role || all[c.id].group || "未写身份"}）`);
  return lines.length ? `已有的人：${lines.join("、")}` : "现在还没有别的人。";
}

function parseDraft(text: string): CardDraft {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI 没按格式回");
  const j = JSON.parse(m[0]) as Partial<CardDraft>;
  const arr = (v: unknown) => Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  if (!j.name) throw new Error("AI 没给名字");
  const g = String(j.gender ?? "");
  return {
    name: String(j.name),
    gender: g.includes("女") ? "女" : g.includes("男") ? "男" : "",
    birthday: String(j.birthday ?? "").replace(/[^0-9-]/g, "").slice(-5),
    mbti: String(j.mbti ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4),
    secret: String(j.secret ?? ""),
    role: String(j.role ?? ""),
    group: String(j.group ?? ""),
    age: String(j.age ?? ""),
    isIdol: Boolean(j.isIdol),
    publicLabels: arr(j.publicLabels),
    publicText: String(j.publicText ?? ""),
    privateLines: arr(j.privateLines),
    speech: String(j.speech ?? ""),
    taboo: String(j.taboo ?? ""),
  };
}

/** 照描述捏一个新人。face 是代码掷的骰子 */
export async function draftPerson(wish: string, face: FaceRelation, secret: SecretKind = rollSecretKind()): Promise<CardDraft & { secretKind: SecretKind }> {
  const res = await simpleLLMCall(chatConfig(), [
    { role: "system", content: CARD_RULES },
    { role: "user", content: `${rosterLine()}\n${herLine()}\n骰子：如果他是爱豆，私下跟公开人设「${FACE_LABEL[face]}」；秘密：${SECRET_DICE[secret]}。\n她想要的人：${wish.trim() || "随你，照这个世界里合理会出现的人来"}` },
  ], { temperature: 0.95, label: "通讯录捏人" });
  if (!res.content) throw new Error(res.error || "AI 没回");
  return { ...parseDraft(res.content), secretKind: secret };
}

/** 照她写的方向改一张已有的卡 */
export async function reviseCard(p: IdolProfile, name: string, direction: string): Promise<CardDraft> {
  const current: CardDraft = {
    name, gender: p.gender ?? "", birthday: p.birthday ?? "", mbti: p.mbti ?? "", secret: p.secret?.text ?? "",
    role: p.role, group: p.group, age: p.age, isIdol: p.isIdol,
    publicLabels: p.publicLabels, publicText: p.publicText, privateLines: p.privateLines, speech: p.speech, taboo: p.taboo,
  };
  const res = await simpleLLMCall(chatConfig(), [
    { role: "system", content: `${CARD_RULES}\n这次是改一张已有的卡：只改她要求的地方，其余照抄，名字不改。` },
    { role: "user", content: `${rosterLine(p.charId)}\n${herLine()}\n私下跟公开人设：${FACE_LABEL[p.face]}；秘密：${SECRET_DICE[p.secret?.kind ?? "none"]}\n现在的卡：${JSON.stringify(current)}\n她要的方向：${direction}` },
  ], { temperature: 0.8, label: "通讯录改卡" });
  if (!res.content) throw new Error(res.error || "AI 没回");
  return { ...parseDraft(res.content), name };
}

/** 她搜 ID 搜到一个只有名字的人：照模板把卡补全（名字、身份、你们见过的事不改） */
export async function completeCard(p: IdolProfile, name: string, secretKind: SecretKind = p.secret?.kind ?? rollSecretKind()): Promise<CardDraft & { secretKind: SecretKind }> {
  const known = [
    p.role ? `身份：${p.role}` : "",
    p.metAt ? `${fmtDay(p.metAt.at)}在「${p.metAt.place}」见过她` : "",
    p.events.length ? `和她之间的事：${p.events.map(e => e.text).join("；")}` : "",
    p.withYou ? `对她的第一印象：${p.withYou}` : "",
  ].filter(Boolean).join("\n");
  const res = await simpleLLMCall(chatConfig(), [
    { role: "system", content: `${CARD_RULES.replace("- 不写他对她的第一印象，他们还没见过。\n", "")}\n这次是把一个戏里出现过的人补成完整的卡：名字不改，已知的身份和发生过的事要对得上。` },
    { role: "user", content: `${rosterLine(p.charId)}\n${herLine()}\n骰子：如果他是爱豆，私下跟公开人设「${FACE_LABEL[p.face]}」；秘密：${SECRET_DICE[secretKind]}。\n名字：${name}\n${known || "只知道名字"}` },
  ], { temperature: 0.9, label: "通讯录补全卡" });
  if (!res.content) throw new Error(res.error || "AI 没回");
  return { ...parseDraft(res.content), name, secretKind };
}

/** AI 捏好的卡 → 档案字段（秘密按骰子） */
export function draftFields(d: CardDraft & { secretKind?: SecretKind }, prev?: Secret): Partial<IdolProfile> {
  const kind = d.secretKind ?? prev?.kind ?? "none";
  return {
    role: d.role, group: d.group, age: d.age, isIdol: d.isIdol, gender: d.gender, birthday: d.birthday, mbti: d.mbti,
    publicLabels: d.publicLabels, publicText: d.publicText, privateLines: d.privateLines, speech: d.speech, taboo: d.taboo,
    secret: { kind, text: kind === "none" ? "" : (d.secret || prev?.text || ""), ...(prev?.revealed ? { revealed: prev.revealed } : {}) },
  };
}
