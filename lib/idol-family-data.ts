/** 家庭背景的世界数据。此模块只读写本地资料，不调用模型。 */
import { kvGet, kvSet } from "./kv-db";

export const FAMILY_KEY = "idol_family_v1";
export const FAMILY_UPDATED_EVENT = "idol-family-updated";
export const FAMILY_STRUCTURES = [
  ["both", "双亲家庭"], ["mother", "单亲家庭（只有妈妈）"], ["father", "单亲家庭（只有爸爸）"],
  ["guardian", "其他监护人家庭"], ["unset", "暂不设置父母或监护人"],
] as const;
export const SIBLING_ROLES = ["姐姐", "哥哥", "妹妹", "弟弟"] as const;
export const GUARDIAN_ROLES = ["监护人", "外祖母", "外祖父", "祖母", "祖父", "姨妈", "舅舅", "姑妈", "叔叔", "其他"] as const;
export type FamilyStructure = typeof FAMILY_STRUCTURES[number][0];
export type FamilyField = "name" | "age" | "occupation" | "location" | "background" | "nationality";
export type FamilyMember = {
  id: string; charId?: string; role: string; guardian?: boolean; gender: "女" | "男" | "";
  kinship: "blood" | "adoptive" | "step" | "nominal";
  name: string; age: string; nationality: string; occupation: string; location: string; background: string;
  locks: Partial<Record<FamilyField, boolean>>;
  /** 玩家明确调整的顺序优先于亲属默认排序。 */
  order?: number;
};
export type FamilyBackground = {
  version: 1; structure: FamilyStructure; economy: "" | "normal" | "rich";
  groupName: string; industry: string; wealthSource: string;
  householdLocks: Partial<Record<"groupName" | "industry" | "wealthSource", boolean>>;
  members: FamilyMember[]; referenceDate: string;
};
export const emptyFamily = (): FamilyBackground => ({ version: 1, structure: "unset", economy: "", groupName: "", industry: "", wealthSource: "", householdLocks: {}, members: [], referenceDate: "" });
export function loadFamily(): FamilyBackground | null {
  try {
    const v = JSON.parse(kvGet(FAMILY_KEY) || "null");
    return v?.version === 1 && Array.isArray(v.members) && FAMILY_STRUCTURES.some(([s]) => s === v.structure) ? v : null;
  } catch { return null; }
}
export function saveFamily(family: FamilyBackground): void {
  kvSet(FAMILY_KEY, JSON.stringify(family));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FAMILY_UPDATED_EVENT));
}
const DEFAULT_ORDER = ["妈妈", "爸爸", "外祖母", "外祖父", "祖母", "祖父", "姨妈", "舅舅", "姑妈", "叔叔", "监护人", "姐姐", "哥哥", "妹妹", "弟弟"];
export function compareFamilyMembers(a: FamilyMember, b: FamilyMember): number {
  const rank = (m: FamilyMember) => m.order ?? (DEFAULT_ORDER.includes(m.role) ? DEFAULT_ORDER.indexOf(m.role) : 10);
  return rank(a) - rank(b);
}
export function orderedFamilyMembers(family = loadFamily()): FamilyMember[] {
  return family ? [...family.members].sort(compareFamilyMembers) : [];
}
export function familyMemberFor(charId: string): FamilyMember | undefined {
  return loadFamily()?.members.find(m => m.charId === charId);
}
/** 已有家人的名字/称谓指向同一人，防止剧情把“妈妈”再次建成新人物。 */
export function namedFamilyMember(name: string): FamilyMember | undefined {
  const aliases: Record<string, string> = { 母亲: "妈妈", 父亲: "爸爸", 外婆: "外祖母", 外公: "外祖父", 奶奶: "祖母", 爷爷: "祖父" };
  const role = aliases[name] || name;
  const matches = orderedFamilyMembers().filter(m => m.name === name || m.role === role);
  return matches.length === 1 ? matches[0] : undefined;
}
export function compareFamilyContacts(a: string, b: string): number {
  const members = orderedFamilyMembers();
  const ai = members.findIndex(m => m.charId === a), bi = members.findIndex(m => m.charId === b);
  return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
}
/** 不在未填写时推断离世、离婚、贫富、控制欲或溺爱；未列出的人不是可自动补建的NPC。 */
export function familyContext(): string {
  const f = loadFamily();
  if (!f) return "";
  const members = orderedFamilyMembers(f);
  return [
    "【家庭背景（私下资料，其他人物只知道剧情中实际获知的部分）】",
    `当前设置：${FAMILY_STRUCTURES.find(([s]) => s === f.structure)?.[1]}。${f.economy ? `经济情况：${f.economy === "rich" ? "富裕" : "普通"}。` : ""}`,
    [f.groupName && `家族集团：${f.groupName}`, f.industry && `产业：${f.industry}`, f.wealthSource && `财富来源：${f.wealthSource}`].filter(Boolean).join("；"),
    ...members.map(m => `${m.role}：${m.name || "姓名未设置"}${[m.age && `${m.age}岁（${f.referenceDate || "开局"}时）`, m.nationality, m.occupation, m.location, m.background].filter(Boolean).map(s => `；${s}`).join("")}`),
    "未填写的家庭资料保持未定，缺席成员不自动解释为离世、离婚或失联。已有亲属通过既有联系人参与剧情；需要新增家庭成员时由玩家明确设定，不自行补建。家人可偶尔自然联系、参与相关剧情，不要求回复或回家，不因长期未联系惩罚。跨地域互动遵循居住地、交通和已发生的剧情。",
  ].filter(Boolean).join("\n");
}
