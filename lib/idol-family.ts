import { createPerson, emptyProfile, getProfile, saveProfile } from "./idol-people";
import { loadCharacters } from "./character-storage";
import { addChatContact } from "./chat-storage";
import type { TraineeCard } from "./trainee-card";
import { ageAtStart } from "./trainee-card";
import { emptyFamily, orderedFamilyMembers, saveFamily, type FamilyBackground, type FamilyField, type FamilyMember, type FamilyStructure } from "./idol-family-data";
import { CHAEBOL_JOBS, ENTERTAINMENT_JOBS, INDUSTRIES, ORDINARY_JOBS, RICH_JOBS, WEALTH_SOURCES, familyRegion, isEntertainmentJob } from "./idol-family-presets";

const pick = <T,>(xs: readonly T[], rng = Math.random): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
export function newFamilyMember(role: string, nation: string, guardian = false): FamilyMember {
  return { id: `family_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`, role, guardian, gender: /妈妈|姐姐|妹妹|祖母|姨|姑/.test(role) ? "女" : /爸爸|哥哥|弟弟|祖父|舅|叔/.test(role) ? "男" : "", kinship: guardian ? "nominal" : "blood", name: "", age: "", nationality: nation, occupation: "", location: "", background: "", locks: {} };
}
export function setFamilyStructure(f: FamilyBackground, structure: FamilyStructure, nation: string): FamilyBackground {
  const roles = structure === "both" ? ["妈妈", "爸爸"] : structure === "mother" ? ["妈妈"] : structure === "father" ? ["爸爸"] : structure === "guardian" ? [] : [];
  const adults = structure === "guardian" ? (f.members.filter(m => m.guardian).length ? f.members.filter(m => m.guardian) : [newFamilyMember("监护人", nation, true)]) : roles.map(role => f.members.find(m => m.role === role && !m.guardian) ?? newFamilyMember(role, nation));
  return { ...f, structure, members: [...adults, ...f.members.filter(m => ["姐姐", "哥哥", "妹妹", "弟弟"].includes(m.role) && !m.guardian)] };
}
export function occupationOptions(card: TraineeCard, f: FamilyBackground, m: FamilyMember): string[] {
  if (!m.guardian && ["姐姐", "哥哥", "妹妹", "弟弟"].includes(m.role)) {
    if (m.age && Number(m.age) < 6) return ["学龄前儿童"];
    if (m.age && Number(m.age) < 18) return ["学生"];
    return ["学生", ...ORDINARY_JOBS, ...(card.family === "star" ? ENTERTAINMENT_JOBS : [])];
  }
  return card.family === "chaebol" ? [...CHAEBOL_JOBS, ...RICH_JOBS] : card.family === "rich" || (card.family === "child" && f.economy === "rich") ? RICH_JOBS : card.family === "star" ? [...ENTERTAINMENT_JOBS, ...ORDINARY_JOBS] : ORDINARY_JOBS;
}
export function randomFamilyField(f: FamilyBackground, card: TraineeCard, id: string, field: FamilyField, rng = Math.random): FamilyBackground {
  return { ...f, members: f.members.map(m => {
    if (m.id !== id || m.locks[field]) return m;
    const region = familyRegion(m.nationality || card.nationality);
    let value = m[field];
    if (field === "name" && region) {
      const names = m.gender === "女" ? region.female : m.gender === "男" ? region.male : [...region.female, ...region.male];
      const unused = names.filter(name => !f.members.some(x => x.id !== m.id && x.name === name));
      value = pick(unused.length ? unused : names, rng);
    }
    if (field === "location" && region) value = pick(region.cities, rng);
    if (field === "occupation") {
      const adult = m.guardian || m.role === "妈妈" || m.role === "爸爸";
      const otherStar = f.members.some(x => x.id !== m.id && (x.guardian || x.role === "妈妈" || x.role === "爸爸") && isEntertainmentJob(x.occupation));
      value = pick(card.family === "star" && adult && !otherStar ? ENTERTAINMENT_JOBS : occupationOptions(card, f, m), rng);
    }
    if (field === "age") {
      const mine = ageAtStart(card);
      if (mine == null || mine < 0) return m;
      const gap = 1 + Math.floor(rng() * 5);
      value = String(!m.guardian && /姐姐|哥哥/.test(m.role) ? mine + gap : !m.guardian && /妹妹|弟弟/.test(m.role) ? Math.max(0, mine - gap) : /祖母|祖父/.test(m.role) ? mine + 45 + Math.floor(rng() * 15) : mine + 22 + Math.floor(rng() * 12));
    }
    return { ...m, [field]: value };
  }) };
}
/** 只随机明确选择的字段，家庭结构与人数永远不在这里变化。 */
export function randomFamily(f: FamilyBackground, card: TraineeCard, onlyId?: string, rng = Math.random): FamilyBackground {
  let next = { ...f, referenceDate: card.start };
  for (const m of f.members.filter(m => !onlyId || m.id === onlyId)) for (const k of ["name", "age", "occupation", "location"] as const) next = randomFamilyField(next, card, m.id, k, rng);
  if (!onlyId) {
    const region = familyRegion(card.nationality);
    if (card.family === "chaebol") {
      if (!f.householdLocks.groupName && region) next.groupName = pick(region.groups, rng);
      if (!f.householdLocks.industry) next.industry = pick(INDUSTRIES, rng);
    }
    if ((card.family === "rich" || card.family === "chaebol" || (card.family === "child" && f.economy === "rich")) && !f.householdLocks.wealthSource) next.wealthSource = pick(WEALTH_SOURCES, rng);
  }
  if (card.family === "star") {
    const adults = next.members.filter(m => m.guardian || m.role === "妈妈" || m.role === "爸爸");
    if (!adults.some(m => isEntertainmentJob(m.occupation))) {
      const target = adults.find(m => !m.locks.occupation && (!onlyId || m.id === onlyId));
      if (target) next = { ...next, members: next.members.map(m => m.id === target.id ? { ...m, occupation: pick(ENTERTAINMENT_JOBS, rng) } : m) };
    }
  }
  return next;
}
export function familyWarnings(f: FamilyBackground, card: TraineeCard): string[] {
  const out: string[] = [];
  const adults = f.members.filter(m => m.guardian || m.role === "妈妈" || m.role === "爸爸");
  if (card.family === "star" && adults.length && !adults.some(m => isEntertainmentJob(m.occupation))) out.push("星二代通常至少有一位家长从事娱乐行业；若职业已自定义或背景另有说明，可以保留你的设定。");
  if (f.members.some(m => !familyRegion(m.nationality || card.nationality))) out.push("部分国籍暂无本地姓名、城市库，这两项请自由填写；其他资料仍可随机。");
  const mine = ageAtStart(card);
  if (f.members.some(m => m.age && (!/^\d+$/.test(m.age) || Number(m.age) > 120 || (mine != null && ((/^(姐姐|哥哥)$/.test(m.role) && Number(m.age) < mine) || (/^(妹妹|弟弟)$/.test(m.role) && Number(m.age) > mine)))))) out.push("有成员的年龄与称谓可能不一致，请核对；手动填写的资料不会被自动改写。");
  return out;
}
/** 正式确认时本地建卡；已有成员更新原卡，保留性格、记忆、手动感情线等内容。 */
export function materializeFamily(f: FamilyBackground, card: TraineeCard): FamilyBackground {
  const next: FamilyBackground = { ...emptyFamily(), ...f, referenceDate: card.start, members: [] };
  for (const m of orderedFamilyMembers(f)) {
    const existing = m.charId && loadCharacters().find(c => c.id === m.charId);
    const base = existing ? getProfile(existing.id) : emptyProfile("");
    const p = { ...base, layer: "main" as const, group: existing ? base.group : "家人", role: m.occupation ? `${m.role} · ${m.occupation}` : m.role, age: m.age, nationality: m.nationality || card.nationality, gender: m.gender, kinship: m.kinship, familyMemberId: m.id, occupation: m.occupation, location: m.location, familyBackground: m.background, met: true, gaveId: true, relation: base.relation ?? "熟人" as const, rolled: true };
    let charId: string;
    if (existing) { saveProfile(p, { name: m.name.trim() || m.role }); charId = existing.id; }
    else { charId = createPerson(m.name.trim() || m.role, p, null, `family_${m.id.slice(-12)}`).id; }
    addChatContact(charId);
    next.members.push({ ...m, charId });
  }
  saveFamily(next);
  return next;
}
