/**
 * 爱豆小手机：名册存档落地（Character / IdolProfile / kv）。
 *
 * 签约进练习生阶段后第一次运行时生成 39 名同期（建档 + 名册状态），
 * rosterTick 每 5 秒在桌面跑：逐周补算 NPC 成长（跳时间跳多少补多少）。
 * 玩家不在这里涨：她的数值走真实上课/加练结算（上课管线）。
 * 纯逻辑在 lib/idol-roster.ts。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadTraineeCard } from "./trainee-card";
import { loadCareer } from "./idol-career";
import { createPerson, emptyProfile, herAge, loadProfiles, saveProfile } from "./idol-people";
import { genKakaoId } from "./idol-kakao";
import { ATTITUDE_LABEL, coursePoints, settleProgress, type ClassLetter, type Specialty, type Subject } from "./idol-training";
import { generateRosterState, dedupeRosterNames, settleNpcWeeks, type RosterState } from "./idol-roster";
import { loadCharacters, saveCharacters } from "./character-storage";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";

const KEY = "idol_roster_v1";
const DAY = 864e5;
export const ROSTER_UPDATED_EVENT = "idol-roster-updated";
const PROFILE_RETRY_DELAY = 15 * 60e3;
let profileGenerationJob: Promise<void> | null = null;

type NpcProfileDraft = {
  charId: string;
  enName: string;
  nationality: string;
  heightCm: number;
  appearance: string;
  privateLines: string[];
  familyBackground: string;
  tmi: string[];
  mbti: string;
  speech: string;
};

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 Chat API");
  return config;
}

function load(): RosterState | null {
  try { return JSON.parse(kvGet(KEY) || "null") as RosterState | null; } catch { return null; }
}
function save(s: RosterState) {
  kvSet(KEY, JSON.stringify(s));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ROSTER_UPDATED_EVENT));
}

/** 同款种子随机（模拟器同源） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const mondayOf = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const weeksBetween = (fromIso: string, toIso: string) => Math.max(0, Math.floor((mondayOf(new Date(toIso).getTime()) - mondayOf(new Date(fromIso).getTime())) / (7 * DAY)));

/** 生成或读取名册。没签约（还不是练习生）返回 null。 */
export function ensureRoster(): RosterState | null {
  const career = loadCareer();
  if (career.stage !== "trainee") return null;
  let s = load();
  if (s) { healRosterSave(s); queueRosterProfileGeneration(s); return s; }
  const card = loadTraineeCard();
  if (!card) return null;
  const rng = mulberry32((career.signedAt ?? Date.now()) % 4294967296);
  s = generateRosterState(card.talents ?? [], rng);
  const baseAge = Number(herAge() ?? 17) || 17;
  for (const n of s.npcs) {
    const age = Math.max(14, Math.min(21, baseAge + Math.floor(rng() * 5) - 2)); // 她 ±2 岁
    const char = createPerson(n.name, {
      ...emptyProfile(""),
      layer: "main",
      group: "同期练习生",
      role: "同期练习生",
      gender: "女",
      age: String(age),
      birthday: n.birthday,
      met: false,
      relation: "陌生",
      isIdol: false,
      leave: { score: 1 + Math.floor(rng() * 4), log: [], phase: "ok" },
    }, null, genKakaoId());
    n.charId = char.id;
  }
  s.profilePending = s.npcs.map(n => n.charId).filter((id): id is string => Boolean(id));
  s.profileRetryAt = Date.now();
  save(s);
  queueRosterProfileGeneration(s);
  queueRosterNameBackfill(s);
  return s;
}

const HARD_SUBJECTS = ["vocal", "dance", "rap"];
const SOFT_SUBJECTS = ["visual", "acting", "variety", "compose", "language"];

/** 老存档读档自愈（幂等，每次 ensureRoster 跑一遍也便宜）：
 *  1. 开局选了颜值特长但数值没兑现（旧 makePlayer 只认硬三门）→ 补到 A（85）；
 *     没选硬三门的人，特长别落在默认的舞蹈上，按她选的算。
 *  2. 同期重名 → 去重改名，同步通讯录里那个 Character 的名字。
 *  3. 同期资料缺字段或写成「暂无」的 → 重新塞回补全队列。 */
function healRosterSave(s: RosterState): void {
  const card = loadTraineeCard();
  if (card) {
    const talents = card.talents ?? [];
    let changed = false;
    if (talents.includes("visual") && s.player.stats.visual < 85) { s.player.stats.visual = 85; changed = true; }
    const hasHard = talents.some(t => HARD_SUBJECTS.includes(t));
    const firstSoft = talents.find(t => SOFT_SUBJECTS.includes(t));
    if (!hasHard && firstSoft && s.player.specialty === "dance" && s.player.stats.dance === 55) {
      s.player.specialty = firstSoft as Specialty;
      s.player.stats[firstSoft as Subject] = Math.max(s.player.stats[firstSoft as Subject], 55);
      changed = true;
    }
    if (changed) save(s);
  }
  const renames = dedupeRosterNames(s.npcs);
  if (renames.length) {
    const chars = loadCharacters();
    const profiles = loadProfiles();
    let charChanged = false;
    for (const r of renames) {
      const charId = s.npcs.find(n => n.id === r.npcId)?.charId;
      const c = chars.find(x => x.id === charId);
      if (c && c.name === r.from) { c.name = r.to; charChanged = true; }
      // 旧英文名跟旧名字走，改名后清掉，免得名册里罗马音对不上
      const p = charId ? profiles[charId] : undefined;
      if (p && p.enName) saveProfile({ ...p, enName: "" });
    }
    if (charChanged) saveCharacters(chars);
    save(s);
  }
  if (requeuePlaceholderProfiles(s)) save(s);
}

const CLASS_ORDER: ClassLetter[] = ["A", "B", "C", "D"];
const SPECIALTY_NAME: Record<string, string> = {
  vocal: "声乐", dance: "舞蹈", rap: "说唱", visual: "形象管理", acting: "演技", variety: "综艺", compose: "作曲", language: "语言", none: "暂无",
};

function normalizeForUnique(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** AI 偷懒写的占位文案（「暂无」「无」之类）一律不当有效资料 */
const PLACEHOLDER_WORDS = new Set(
  ["暂无", "无", "未知", "未写", "未填", "没写", "没有", "略", "无资料", "资料暂无", "资料暂缺", "暂无资料", "待补", "待定", "不写", "无内容", "未提供", "na", "none", "null", "tbd", "n/a"]
    .map(normalizeForUnique),
);
const looksPlaceholder = (value: string) => PLACEHOLDER_WORDS.has(normalizeForUnique(value.trim()));

/** 一条资料是否有效（字段齐、没有占位文案） */
export function profileDetailValid(p: { nationality?: string; heightCm?: number; appearance?: string; privateLines?: string[]; familyBackground?: string; tmi?: string[]; mbti?: string; speech?: string }): boolean {
  const lines = Array.isArray(p.privateLines) ? p.privateLines.map(String).map(v => v.trim()).filter(v => v && !looksPlaceholder(v)) : [];
  const tmi = Array.isArray(p.tmi) ? p.tmi.map(String).map(v => v.trim()).filter(v => v && !looksPlaceholder(v)) : [];
  return Boolean(
    (p.nationality ?? "").trim() && !looksPlaceholder(String(p.nationality))
    && Number(p.heightCm) >= 140 && Number(p.heightCm) <= 195
    && (p.appearance ?? "").trim() && !looksPlaceholder(String(p.appearance))
    && lines.length
    && (p.familyBackground ?? "").trim() && !looksPlaceholder(String(p.familyBackground))
    && tmi.length
    && /^[EI][NS][TF][JP]$/.test(String(p.mbti ?? ""))
    && (p.speech ?? "").trim() && !looksPlaceholder(String(p.speech)),
  );
}

/** 缺资料或写成「暂无」的同期重新塞回补全队列（她的老档也靠这个自愈） */
function requeuePlaceholderProfiles(s: RosterState): boolean {
  const profiles = loadProfiles();
  const pending = new Set(s.profilePending ?? []);
  let changed = false;
  for (const n of s.npcs) {
    if (!n.charId || pending.has(n.charId)) continue;
    const p = profiles[n.charId];
    if (!p || !profileDetailValid(p)) { pending.add(n.charId); changed = true; }
  }
  if (changed) s.profilePending = [...pending];
  return changed;
}

/** 可独立验证的批次解析器：严格保留代码已有骨架，不接受 AI 改名或改班。 */
export function parseRosterProfileBatch(raw: string, expectedIds: string[], existingTmi: string[] = []): NpcProfileDraft[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("同期资料没有返回 JSON");
  const parsed = JSON.parse(match[0]) as { profiles?: unknown };
  if (!Array.isArray(parsed.profiles)) throw new Error("同期资料缺少 profiles 列表");
  const byId = new Map<string, NpcProfileDraft>();
  for (const item of parsed.profiles) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const charId = String(x.charId ?? "");
    if (!expectedIds.includes(charId) || byId.has(charId)) continue;
    const privateLines = Array.isArray(x.privateLines) ? x.privateLines.map(String).map(v => v.trim()).filter(v => v && !looksPlaceholder(v)).slice(0, 2) : [];
    const tmi = Array.isArray(x.tmi) ? x.tmi.map(String).map(v => v.trim()).filter(v => v && !looksPlaceholder(v)).slice(0, 2) : [];
    const mbti = String(x.mbti ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    const enName = String(x.enName ?? "").trim();
    const heightCm = Number(x.heightCm);
    const draft: NpcProfileDraft = {
      charId,
      enName,
      nationality: String(x.nationality ?? "").trim(),
      heightCm: Number.isFinite(heightCm) ? Math.round(heightCm) : 0,
      appearance: String(x.appearance ?? "").trim(),
      privateLines,
      familyBackground: String(x.familyBackground ?? "").trim(),
      tmi,
      mbti,
      speech: String(x.speech ?? "").trim(),
    };
    if (!profileDetailValid(draft)) {
      throw new Error(`同期资料字段不完整（${charId}）`);
    }
    byId.set(charId, draft);
  }
  if (expectedIds.some(id => !byId.has(id))) throw new Error("同期资料没有覆盖整批人物");
  const allTmi = [...existingTmi, ...[...byId.values()].flatMap(x => x.tmi)].map(normalizeForUnique).filter(Boolean);
  if (new Set(allTmi).size !== allTmi.length) throw new Error("TMI 与同批或已有人物重复，需要重新生成");
  const introductions = [...byId.values()].map(x => normalizeForUnique(x.privateLines.join(" ").slice(0, 8))).filter(Boolean);
  if (new Set(introductions).size !== introductions.length) throw new Error("性格描述开头重复，需要重新生成");
  return expectedIds.map(id => byId.get(id)!);
}

function rosterBatchPrompt(state: RosterState, klass: ClassLetter): { ids: string[]; input: string; existingTmi: string[] } {
  const profiles = loadProfiles();
  const chars = state.npcs.filter(n => n.charId).map(n => ({ n, p: profiles[n.charId!] }));
  const pending = new Set(state.profilePending ?? []);
  const batch = chars.filter(x => pending.has(x.n.charId!) && x.n.klass === klass).slice(0, 6);
  // friends[].charId 在名册骨架里保存的是 Trainee.id（不是通讯录 Character.id）。
  const nameById = new Map(state.npcs.map(n => [n.id, n.name]));
  const existingTmi = chars.filter(x => !pending.has(x.n.charId!)).flatMap(x => x.p?.tmi ?? []);
  const skeleton = batch.map(({ n, p }) => ({
    charId: n.charId,
    name: nameById.get(n.charId!) ?? n.name,
    age: p?.age || "",
    birthday: n.birthday,
    initialClass: n.initialClass,
    currentClass: n.klass,
    specialty: SPECIALTY_NAME[n.specialty] ?? n.specialty,
    attitude: ATTITUDE_LABEL[n.attitude],
    friends: n.friends.map(f => nameById.get(f.charId) ?? f.charId).slice(0, 4),
  }));
  return {
    ids: batch.map(x => x.n.charId!),
    existingTmi,
    input: JSON.stringify({ skeleton, usedTmi: existingTmi }, null, 2),
  };
}

async function generateProfileBatch(state: RosterState, klass: ClassLetter): Promise<void> {
  // 一批最多 6 人：批次大了 AI 容易超长、偷懒，A 班这种 10 人的班分两次补
  while (true) {
    const batch = rosterBatchPrompt(state, klass);
    if (!batch.ids.length) return;
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `为韩国娱乐圈练习生模拟游戏，补写同一初始班级的同期女生人物档案。只输出 JSON 对象：{"profiles":[{"charId":"","enName":"","nationality":"","heightCm":163,"appearance":"","privateLines":[""],"familyBackground":"","tmi":[""],"mbti":"ISFP","speech":""}]}。\n\n必须尊重给定骨架：名字、年龄、生日、初始班级、当前班级、特长、态度和朋友圈全部由代码确定，不能更改；按特长与态度写出匹配的性格与生活细节（懈怠的人不能被写成拼命三娘）。外籍比例自然：韩国人占多数，每批可有 1～2 位日本、中国、泰国或美国等国籍女生，其余以韩国为主。\n\nenName 写罗马字英文名：韩国人按韩语罗马字（如 金瑞妍 → Kim Seoyeon，姓在前）；日本人用 Hepburn 罗马字（如 佐藤美咲 → Sato Misaki）；中国人用拼音（如 王一诺 → Wang Yinuo）；泰国、美国等按本国常见拼写。每个词首字母大写，姓和名之间一个空格，不写昵称不写大小写混搭。\n\n外貌、性格、家庭、TMI 要具体、自然、彼此区分，不堆同一套模板；同批人物不能用相同句式开头。每人写 1～2 条独有 TMI，不能与输入中的已用 TMI 或同批其他人的 TMI 重复。家庭背景写普通而可信的生活背景，不强加创伤、秘密或戏剧冲突。speech 写一句她自然会说的话，不使用 MBTI 推导性格。MBTI 只作为名册档案字段生成，不要写进外貌、性格、家庭、TMI 或 speech。所有文本使用简体中文。所有字段必须写真实内容，禁止写「暂无」「无」「未知」「未写」这类占位文案，写占位文案整批会被退回重写。只返回列表里给出的 charId 对应人物，不增减人物。` },
      { role: "user", content: `请补全 ${klass} 班这批人物的资料。代码骨架与已用 TMI 如下：\n${batch.input}` },
    ], { temperature: 0.88, max_tokens: 6500, label: `名册同期资料 ${klass} 班` });
    if (!res.content) throw new Error(res.error || `${klass} 班资料生成失败`);
    const drafts = parseRosterProfileBatch(res.content, batch.ids, batch.existingTmi);
    for (const draft of drafts) {
      const profile = loadProfiles()[draft.charId];
      if (!profile) continue;
      saveProfile({ ...profile, enName: draft.enName, nationality: draft.nationality, heightCm: draft.heightCm, appearance: draft.appearance, privateLines: draft.privateLines, familyBackground: draft.familyBackground, tmi: draft.tmi, mbti: draft.mbti, speech: draft.speech });
    }
    const latest = load();
    if (!latest) return;
    const done = new Set(batch.ids);
    const next = { ...latest, profilePending: (latest.profilePending ?? []).filter(id => !done.has(id)), profileRetryAt: Date.now() };
    save(next);
    state = next;
  }
}

function queueRosterProfileGeneration(state: RosterState): void {
  if (typeof window === "undefined" || !state.profilePending?.length || profileGenerationJob) return;
  if ((state.profileRetryAt ?? 0) > Date.now()) return;
  profileGenerationJob = (async () => {
    try {
      // 先检查配置，避免 API 未配置时每 5 秒重复尝试。
      chatConfig();
      let failed = false;
      for (const klass of CLASS_ORDER) {
        const current = load();
        if (!current?.profilePending?.length) break;
        try { await generateProfileBatch(current, klass); }
        catch (error) { failed = true; console.warn(`[idol-roster] ${klass} 班资料暂未补全：`, error); }
      }
      const latest = load();
      if (latest?.profilePending?.length) save({ ...latest, profileRetryAt: Date.now() + (failed ? PROFILE_RETRY_DELAY : 60e3) });
    } catch (error) {
      const latest = load();
      if (latest?.profilePending?.length) save({ ...latest, profileRetryAt: Date.now() + PROFILE_RETRY_DELAY });
      console.warn("[idol-roster] 同期资料会在之后重试：", error);
    }
  })().finally(() => { profileGenerationJob = null; });
}

/** 桌面每 5 秒跑：把没结算的周补上（跳时间跳多久补多久） */
/** 老档补英文名：只补 enName 一个字段，不动已经生成好的其他资料。 */
let nameBackfillJob: Promise<void> | null = null;
function queueRosterNameBackfill(state: RosterState): void {
  if (typeof window === "undefined" || nameBackfillJob) return;
  const profiles = loadProfiles();
  const missing = state.npcs.filter(n => n.charId && !profiles[n.charId]?.enName);
  if (!missing.length) return;
  nameBackfillJob = (async () => {
    try {
      chatConfig();
      const latestProfiles = loadProfiles();
      const items = missing.map(n => ({ charId: n.charId, name: n.name, nationality: latestProfiles[n.charId!]?.nationality ?? "" }));
      const res = await simpleLLMCall(chatConfig(), [
        { role: "system", content: `为韩国娱乐圈练习生模拟游戏，给同期练习生补写罗马字英文名。只输出 JSON 对象：{"names":[{"charId":"","enName":""}]}。\n\n韩国人按韩语罗马字（如 金瑞妍 → Kim Seoyeon，姓在前）；日本人用 Hepburn 罗马字（如 佐藤美咲 → Sato Misaki）；中国人用拼音（如 王一诺 → Wang Yinuo）；泰国、美国等按本国常见拼写。每个词首字母大写，姓和名之间一个空格，不写昵称、不写大小写混搭。只输出给出的 charId 对应人物，不增减。` },
        { role: "user", content: `请补全这些同期练习生的英文名：\n${JSON.stringify(items)}` },
      ], { temperature: 0.7, max_tokens: 1500, label: "名册同期英文名" });
      if (!res.content) throw new Error(res.error || "英文名生成失败");
      const match = res.content.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) as { names?: { charId: string; enName: string }[] } : null;
      if (!parsed?.names?.length) throw new Error("英文名没有返回列表");
      const byId = new Map(parsed.names.filter(x => x && typeof x.charId === "string" && typeof x.enName === "string" && x.enName.trim()).map(x => [x.charId, x.enName.trim().slice(0, 40)]));
      const currentProfiles = loadProfiles();
      for (const n of missing) {
        const en = n.charId ? byId.get(n.charId) : undefined;
        const p = n.charId ? currentProfiles[n.charId] : undefined;
        if (!en || !p || p.enName) continue;
        saveProfile({ ...p, enName: en });
      }
    } catch (error) {
      console.warn("[idol-roster] 同期英文名会在之后重试：", error);
    }
  })().finally(() => { nameBackfillJob = null; });
}

export function rosterTick(): void {
  const s = ensureRoster();
  if (typeof window !== "undefined") (window as unknown as { __idolNewMode?: boolean }).__idolNewMode = Boolean(s);
  if (!s) return;
  queueRosterProfileGeneration(s);
  const today = dayKey(Date.now());
  if (today <= s.settledUntil) return;
  const weeks = weeksBetween(s.settledUntil, today);
  if (weeks > 0) {
    const seed = 1e9 + s.npcs.length * 7 + (s.settledUntil || "").split("-").reduce((a, b) => a + Number(b), 0);
    settleNpcWeeks(s, Math.min(weeks, 52), mulberry32(seed % 4294967296));
  }
  s.settledUntil = today;
  save(s);
}

export { load as loadRoster, save as saveRoster };

// ── 上课结算：她上完一节课，名册里的她涨这门课（数字要打成文字给她看） ──

export type ClassGain = { gained: number; levels: { from: number; to: number }[]; stat: number };

/** 结算她的一节课。特色课（subject 不在八门里）别调这个。 */
export function settlePlayerClass(subject: Subject): ClassGain | null {
  const s = ensureRoster();
  if (!s) return null;
  const r = settleProgress(s.player, subject, coursePoints(s.player, subject));
  save(s);
  return { gained: r.gained, levels: r.levels, stat: s.player.stats[subject] };
}

/** 打给她的那一行：「声乐 +1.5」；升级了再拼「声乐 45→46」 */
export function formatClassGain(subjectLabel: string, g: ClassGain): string {
  const parts = [`${subjectLabel} +${g.gained}`];
  for (const lv of g.levels) parts.push(`${subjectLabel} ${lv.from}→${lv.to}`);
  return parts.join("，");
}

/** 比一节正常课多一点（mult 倍的一节课训练进度）：课堂竞争获胜用 */
export function settlePlayerBonus(subject: Subject, mult: number): ClassGain | null {
  const s = ensureRoster();
  if (!s) return null;
  const r = settleProgress(s.player, subject, coursePoints(s.player, subject) * mult);
  save(s);
  return { gained: r.gained, levels: r.levels, stat: s.player.stats[subject] };
}

/** 机会/奖励的经验结算：1 经验 = 3 训练进度（对着加练的量级）。她的机会奖励表用「经验」作单位。 */
export function settlePlayerExp(subject: Subject, exp: number): ClassGain | null {
  const s = ensureRoster();
  if (!s) return null;
  const r = settleProgress(s.player, subject, Math.max(0, exp) * 3);
  save(s);
  return { gained: r.gained, levels: r.levels, stat: s.player.stats[subject] };
}

/** 科目中文名（打给她看的数字行） */
export const SUBJECT_LABEL: Record<Subject, string> = { vocal: "声乐", dance: "舞蹈", rap: "Rap", compose: "创作", acting: "演技", variety: "综艺感", language: "语言", visual: "形象管理" };

/** 大机遇成长（数值方案 growth 字段：模拟器里大机遇 +10、中机遇 +5 的那一类）：
 *  直接涨能力值，不占加练、不超 100；同一场戏只结一次（sceneKey 去重），amount 代码钳到 1~10。 */
export function settlePlayerGrowth(subject: Subject, amount: number, sceneKey: string): ClassGain | null {
  if (!(["vocal", "dance", "rap", "compose", "acting", "variety", "language", "visual"] as const).includes(subject as never)) return null;
  const s = ensureRoster();
  if (!s) return null;
  const settled = growthSettledKeys();
  if (settled.includes(sceneKey)) return null;
  const from = s.player.stats[subject];
  const amt = Math.max(1, Math.min(10, Math.round(amount)));
  s.player.stats[subject] = Math.min(100, from + amt);
  save(s);
  saveGrowthSettled([...settled, sceneKey].slice(-50));
  return { gained: s.player.stats[subject] - from, levels: [{ from, to: s.player.stats[subject] }], stat: s.player.stats[subject] };
}

const GROWTH_SETTLED_KEY = "idol_growth_settled_v1";
function growthSettledKeys(): string[] {
  try { const v = JSON.parse(kvGet(GROWTH_SETTLED_KEY) || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
function saveGrowthSettled(keys: string[]) { kvSet(GROWTH_SETTLED_KEY, JSON.stringify(keys)); }
