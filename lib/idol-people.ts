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
  events: PersonEvent[];
  /** 只有她看得到 */
  note: string;
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
  const head = [p.role, p.age ? `${p.age}岁` : ""].filter(Boolean).join("，");
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
  if (p.met && p.withYou) out.push(`【对她的印象】${p.withYou}`);
  if (p.events.length) {
    out.push(`【和她之间的事】\n${p.events.slice(-12).map(e => `- ${fmtDay(e.at)}${e.place ? ` · ${e.place}` : ""}：${e.text}`).join("\n")}`);
  }
  return out.join("\n\n");
}

export function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 存档案，顺手把角色的 persona、名字、头像更新掉 */
export function saveProfile(p: IdolProfile, charPatch?: Partial<Pick<Character, "name" | "avatar" | "wechatID">>): void {
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
  const full: IdolProfile = { ...profile, charId: char.id };
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
只输出一个 JSON 对象，不要别的字：
{"name":"","role":"一句话身份","group":"身份分组","age":"","isIdol":false,"publicLabels":[],"publicText":"","privateLines":[],"speech":"","taboo":""}`;

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
  return {
    name: String(j.name),
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
export async function draftPerson(wish: string, face: FaceRelation): Promise<CardDraft> {
  const res = await simpleLLMCall(chatConfig(), [
    { role: "system", content: CARD_RULES },
    { role: "user", content: `${rosterLine()}\n骰子：如果他是爱豆，私下跟公开人设「${FACE_LABEL[face]}」。\n她想要的人：${wish.trim() || "随你，照这个世界里合理会出现的人来"}` },
  ], { temperature: 0.95, label: "通讯录捏人" });
  if (!res.content) throw new Error(res.error || "AI 没回");
  return parseDraft(res.content);
}

/** 照她写的方向改一张已有的卡 */
export async function reviseCard(p: IdolProfile, name: string, direction: string): Promise<CardDraft> {
  const current: CardDraft = {
    name, role: p.role, group: p.group, age: p.age, isIdol: p.isIdol,
    publicLabels: p.publicLabels, publicText: p.publicText, privateLines: p.privateLines, speech: p.speech, taboo: p.taboo,
  };
  const res = await simpleLLMCall(chatConfig(), [
    { role: "system", content: `${CARD_RULES}\n这次是改一张已有的卡：只改她要求的地方，其余照抄，名字不改。` },
    { role: "user", content: `${rosterLine(p.charId)}\n私下跟公开人设：${FACE_LABEL[p.face]}\n现在的卡：${JSON.stringify(current)}\n她要的方向：${direction}` },
  ], { temperature: 0.8, label: "通讯录改卡" });
  if (!res.content) throw new Error(res.error || "AI 没回");
  return { ...parseDraft(res.content), name };
}
