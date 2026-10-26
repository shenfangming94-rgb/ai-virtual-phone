/**
 * 练习生证：爱豆小手机的开局。第一次打开（还没有证）先走开局页，填完盖章才进桌面。
 * 填的东西同时写进用户身份（名字、头像、关于我），世界时钟拨到起点那天早上。
 */

import { kvGet, kvRemove, kvSet } from "./kv-db";
import { loadUserIdentities, saveUserIdentities } from "./settings-storage";
import { setWorldTime } from "./world-clock";

const KEY = "idol_trainee_card_v1";
export const TRAINEE_CARD_EVENT = "idol-trainee-card-changed";

export const FAMILY_OPTIONS = [
  { id: "normal", label: "普通家庭", hint: "一封一封投出去" },
  { id: "star", label: "星二代", hint: "还没进公司就有人认识你" },
  { id: "rich", label: "富二代", hint: "不缺钱，缺人信你认真" },
  { id: "chaebol", label: "财阀家", hint: "公司对你客气得有点怪" },
  { id: "child", label: "童星", hint: "大家记得你小时候的样子" },
  { id: "custom", label: "自己写", hint: "" },
] as const;

export const TALENT_OPTIONS = [
  { id: "vocal", ko: "노래", zh: "唱" },
  { id: "dance", ko: "댄스", zh: "跳" },
  { id: "rap", ko: "랩", zh: "Rap" },
  { id: "compose", ko: "작곡", zh: "写歌" },
  { id: "acting", ko: "연기", zh: "演技" },
  { id: "variety", ko: "예능", zh: "综艺" },
  { id: "language", ko: "외국어", zh: "语言" },
  { id: "visual", ko: "비주얼", zh: "颜值" },
] as const;

const TALENT_ZH: Record<string, string> = { vocal: "唱歌", dance: "跳舞", rap: "Rap", compose: "写歌", acting: "演技", variety: "综艺感", language: "语言", visual: "颜值" };

export type TraineeCard = {
  name: string;
  photo: string | null;
  birthday: string;      // YYYY-MM-DD
  nationality: string;
  mbti: string;
  looks: string;
  start: string;         // YYYY-MM-DD 世界时钟起点
  trainLength: string;   // 自己写，比如「一年半」
  family: string;        // FAMILY_OPTIONS id
  familyCustom: string;  // 选「自己写」时写的
  familyNote: string;    // 补充
  talents: string[];
  talentNote: string;
  weakness: string;
  other: string;
  signature: string | null;
  company: string;       // 所属：进公司前是空的
  no: string;
  createdAt: number;
};

export function loadTraineeCard(): TraineeCard | null {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null");
    return raw && typeof raw === "object" && raw.name ? raw as TraineeCard : null;
  } catch {
    return null;
  }
}

export function saveTraineeCard(card: TraineeCard): void {
  kvSet(KEY, JSON.stringify(card));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRAINEE_CARD_EVENT));
}

/** 重新开局：只去掉练习生证（别的数据不动），桌面会重新弹开局页 */
export function clearTraineeCard(): void {
  kvRemove(KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRAINEE_CARD_EVENT));
}

export function familyLabel(c: TraineeCard): string {
  if (c.family === "custom") return c.familyCustom || "自己写";
  return FAMILY_OPTIONS.find(f => f.id === c.family)?.label ?? "";
}

export function talentLabels(ids: string[]): string[] {
  return ids.map(id => TALENT_ZH[id]).filter(Boolean);
}

export function ageAtStart(c: TraineeCard): number | null {
  const b = new Date(`${c.birthday}T00:00:00`);
  const s = new Date(`${c.start}T00:00:00`);
  if (Number.isNaN(b.getTime()) || Number.isNaN(s.getTime())) return null;
  let age = s.getFullYear() - b.getFullYear();
  if (s.getMonth() < b.getMonth() || (s.getMonth() === b.getMonth() && s.getDate() < b.getDate())) age -= 1;
  return age;
}

/** 给 AI 读的「她是谁」（开局部分） */
export function describeTrainee(c: TraineeCard): string {
  const age = ageAtStart(c);
  const lines = [
    `${c.name}，${age != null ? `${age}岁，` : ""}${c.nationality || ""}人，女生。`,
    c.looks ? `长相：${c.looks}` : "",
    `家境：${familyLabel(c)}${c.familyNote ? `（${c.familyNote}）` : ""}`,
    c.talents.length ? `擅长：${talentLabels(c.talents).join("、")}${c.talentNote ? `（${c.talentNote}）` : ""}` : "",
    c.weakness ? `短板：${c.weakness}` : "",
    c.mbti ? `MBTI：${c.mbti}` : "",
    c.other ? `其他：${c.other}` : "",
    c.company ? `现在：${c.company} 练习生` : "现在：还没进任何公司，准备投递",
    c.trainLength ? `打算多久出道：${c.trainLength}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** 盖章：存证、写进用户身份、拨世界时钟 */
export function stampTraineeCard(c: TraineeCard): void {
  saveTraineeCard(c);
  const all = loadUserIdentities();
  const age = ageAtStart(c);
  const patch = {
    name: c.name,
    avatarUrl: c.photo ?? undefined,
    gender: "女",
    age: age != null ? String(age) : "",
    occupation: c.company ? `${c.company} 练习生` : "想当爱豆，还没进公司",
    bio: describeTrainee(c),
  };
  if (all.length) saveUserIdentities(all.map((i, idx) => (idx === 0 ? { ...i, ...patch } : i)));
  else saveUserIdentities([{ id: "identity-1", customSettings: "", ...patch }]);
  const start = new Date(`${c.start}T09:00:00`);
  if (!Number.isNaN(start.getTime())) setWorldTime(start.getTime());
}

// ── 「随便」用的小词库 ──

const NAMES = ["林知夏", "沈念", "宋晚宁", "许棠", "江以宁", "陆星禾", "苏予安", "温书言", "白芷", "唐笙"];
const NATIONS = ["中国", "韩国", "日本", "泰国", "美国（韩裔）", "澳大利亚"];
const LOOKS = [
  "眼睛很圆，笑起来有梨涡",
  "单眼皮，不笑的时候看着有点凶",
  "皮肤很白，个子小小的，声音很亮",
  "长腿，短发，五官很利落",
  "猫一样的眼尾，嘴唇有点厚",
];
const LENGTHS = ["半年", "一年", "一年半", "两年", "三年"];
const MBTIS = ["ENFP", "INFP", "ISTJ", "ESFJ", "INTJ", "ENTP", "ISFP", ""];

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function randomBasics(): Pick<TraineeCard, "name" | "nationality" | "mbti" | "birthday"> & { startYear: number } {
  const startYear = 2012 + Math.floor(Math.random() * 8);
  const age = 16 + Math.floor(Math.random() * 4);
  const m = 1 + Math.floor(Math.random() * 12);
  const d = 1 + Math.floor(Math.random() * 28);
  return {
    name: pick(NAMES),
    nationality: pick(NATIONS),
    mbti: pick(MBTIS),
    birthday: `${startYear - age}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    startYear,
  };
}

export const randomLooks = () => pick(LOOKS);
export const randomLength = () => pick(LENGTHS);
export const randomFamily = () => pick(FAMILY_OPTIONS.filter(f => f.id !== "custom")).id;
export function randomTalents(): string[] {
  const ids = TALENT_OPTIONS.map(t => t.id).sort(() => Math.random() - 0.5);
  return ids.slice(0, 1 + Math.floor(Math.random() * 3));
}
