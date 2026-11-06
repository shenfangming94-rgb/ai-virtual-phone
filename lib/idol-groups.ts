/**
 * 爱豆小手机：圈内名册。这个世界里的团和艺人只记一份，官网、日历大事记、热搜、搜索、世界书都从这里读。
 *
 * 规矩：谁先写出来谁说了算。一个团一旦有了，团名、公司、男团女团、出道年份、成员、粉丝名、风格就定死，
 * 后来的地方只能补空着的（比如大事记先提到一个团、还没有成员，官网写的时候补上成员），
 * 「最近在做什么」可以更新，新歌往后加。别家公司的团不会被另一家的官网抢走。
 */

import { kvGet, kvSet } from "./kv-db";
import { COMPANIES, companyOf } from "./idol-career";
import { FIXED_GROUPS } from "./idol-fixed-groups";

export type GroupMember = { name: string; ko?: string; position?: string };

export type Group = {
  name: string;
  /** 韩文团名 */
  ko?: string;
  companyId?: string;
  kind?: string;
  size?: number;
  debut?: number;
  /** 有具体月份的出道月（1～12） */
  debutMonth?: number;
  style?: string;
  fandom?: string;
  recent?: string;
  members?: GroupMember[];
  /** 名气档位：第一次出现时 AI 说一句，之后定死（数字的规矩在 idol-scale.ts） */
  tier?: "top" | "mid" | "small" | "rookie";
  songs?: { title: string; year?: number; note?: string;
    /** 已知发行资料；Melon 只读，不根据搜索改写。 */
    album?: string; releasedAt?: string; track?: number; real?: boolean;
  }[];
  /** 第一次是在哪写出来的（fixed = 她的定稿名单） */
  from?: "site" | "almanac" | "search" | "fixed";
  at?: number;
};

const KEY = "idol_groups_v1";
export const GROUPS_EVENT = "idol-groups-changed";
const keyOf = (name: string) => name.trim().toLowerCase();

/** 老数据里成员是纯名字数组，统一成对象 */
function normalizeMembers(members: unknown): GroupMember[] {
  if (!Array.isArray(members)) return [];
  return members.map(m => (typeof m === "string" ? { name: m } : { name: String((m as GroupMember)?.name ?? ""), ...(typeof (m as GroupMember)?.ko === "string" ? { ko: (m as GroupMember).ko } : {}), ...(typeof (m as GroupMember)?.position === "string" ? { position: (m as GroupMember).position } : {}) })).filter(m => m.name);
}

/** 新档开局：把她和 GPT 定稿的 18 个团写进名册（AI 只能读不能改） */
function seedFixedGroups(): Record<string, Group> {
  const Y = new Date().getFullYear();
  const out: Record<string, Group> = {};
  for (const s of FIXED_GROUPS) {
    out[keyOf(s.name)] = {
      name: s.name, ko: s.ko, companyId: s.companyId, kind: s.kind,
      size: s.members.length, debut: Y + s.debutY,
      ...(s.debutM ? { debutMonth: s.debutM } : {}),
      style: s.style, tier: s.tier,
      members: s.members.map(m => ({ ...m })),
      from: "fixed",
      at: Date.now(),
    };
  }
  save(out);
  return out;
}

export function loadGroups(): Record<string, Group> {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as Record<string, Group> | null;
    if (raw) {
      for (const g of Object.values(raw)) g.members = normalizeMembers(g.members);
      return raw;
    }
  } catch { /* 落盘坏了就重建 */ }
  const migrated = migrate();
  if (Object.keys(migrated).length) return migrated;
  return seedFixedGroups();
}
function save(g: Record<string, Group>) {
  kvSet(KEY, JSON.stringify(g));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(GROUPS_EVENT));
}

/** 以前官网写的团存在 idol_search_v1.artists 里，搬过来 */
function migrate(): Record<string, Group> {
  try {
    const old = (JSON.parse(kvGet("idol_search_v1") || "null") as { artists?: Record<string, Group> } | null)?.artists ?? {};
    const out: Record<string, Group> = {};
    for (const a of Object.values(old)) if (a?.name) out[keyOf(a.name)] = { ...a, from: "site" };
    if (Object.keys(out).length) save(out);
    return out;
  } catch { return {}; }
}

const blank = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length);

/** 写进名册：已有的只补空的、更新「最近」、加新歌；公司对不上就不动 */
export function upsertGroups(list: Partial<Group>[], from: Group["from"], companyId?: string): void {
  const all = loadGroups();
  let changed = false;
  for (const raw of list) {
    const name = String(raw?.name || "").trim();
    if (!name) continue;
    const k = keyOf(name);
    const incoming: Group = { ...raw, name, companyId: raw.companyId || companyId, members: normalizeMembers(raw.members) } as Group;
    const old = all[k];
    if (!old) { all[k] = { ...incoming, from, at: Date.now() }; changed = true; continue; }
    if (old.companyId && incoming.companyId && old.companyId !== incoming.companyId) continue;
    const next: Group = { ...old };
    for (const f of ["companyId", "kind", "size", "debut", "style", "fandom", "members", "tier"] as const) {
      if (blank(old[f]) && !blank(incoming[f])) { (next as Record<string, unknown>)[f] = incoming[f]; changed = true; }
    }
    if (incoming.recent && incoming.recent !== old.recent) { next.recent = incoming.recent; changed = true; }
    const have = new Set((old.songs ?? []).map(s => keyOf(s.title)));
    const add = (incoming.songs ?? []).filter(s => s?.title && !have.has(keyOf(s.title)));
    if (add.length) { next.songs = [...(old.songs ?? []), ...add]; changed = true; }
    all[k] = next;
  }
  if (changed) save(all);
}

export function groupsOf(companyId: string): Group[] {
  return Object.values(loadGroups()).filter(g => g.companyId === companyId);
}

export function findGroup(q: string): Group | undefined {
  const k = keyOf(q);
  if (!k) return undefined;
  const all = Object.values(loadGroups());
  return all.find(g => keyOf(g.name) === k) ?? all.find(g => k.length >= 2 && keyOf(g.name).includes(k));
}

/** 一个团一行，给 AI 看 */
export function groupLine(g: Group): string {
  const c = companyOf(g.companyId)?.name;
  const debutText = g.debut ? `${g.debut}年${g.debutMonth ? `${g.debutMonth}月` : ""}出道` : "";
  const membersText = (g.members ?? []).length ? `成员：${(g.members ?? []).map(m => `${m.name}${m.position ? `（${m.position}）` : ""}`).join("、")}` : "";
  const bits = [c, g.kind, debutText, membersText, g.fandom ? `粉丝名 ${g.fandom}` : "", g.style].filter(Boolean);
  return `${g.name}${g.ko ? ` ${g.ko}` : ""}（${bits.join("；")}）`;
}

/** 给各处提示词：已经有的团，必须照着用 */
export function rosterPrompt(limit = 30): string {
  const all = Object.values(loadGroups()).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(-limit);
  if (!all.length) return "";
  return `【这个世界里已经有的团和艺人（照这个写：团名、公司、出道年份、成员都不能改，没写到的才能补）】\n${all.map(g => `- ${groupLine(g)}`).join("\n")}`;
}

export const companyNames = () => COMPANIES.map(c => c.name).join("、");
export function companyIdByName(name?: string): string | undefined {
  const k = (name || "").trim().toLowerCase();
  return COMPANIES.find(c => c.name.toLowerCase() === k)?.id;
}
