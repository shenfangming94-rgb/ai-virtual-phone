/**
 * 爱豆小手机：圈内名册。这个世界里的团和艺人只记一份，官网、日历大事记、热搜、搜索、世界书都从这里读。
 *
 * 规矩：谁先写出来谁说了算。一个团一旦有了，团名、公司、男团女团、出道年份、成员、粉丝名、风格就定死，
 * 后来的地方只能补空着的（比如大事记先提到一个团、还没有成员，官网写的时候补上成员），
 * 「最近在做什么」可以更新，新歌往后加。别家公司的团不会被另一家的官网抢走。
 */

import { kvGet, kvSet } from "./kv-db";
import { COMPANIES, companyOf } from "./idol-career";

export type Group = {
  name: string;
  companyId?: string;
  kind?: string;
  size?: number;
  debut?: number;
  style?: string;
  fandom?: string;
  recent?: string;
  members?: string[];
  /** 名气档位：第一次出现时 AI 说一句，之后定死（数字的规矩在 idol-scale.ts） */
  tier?: "top" | "mid" | "small" | "rookie";
  songs?: { title: string; year?: number; note?: string }[];
  /** 第一次是在哪写出来的 */
  from?: "site" | "almanac" | "search";
  at?: number;
};

const KEY = "idol_groups_v1";
export const GROUPS_EVENT = "idol-groups-changed";
const keyOf = (name: string) => name.trim().toLowerCase();

export function loadGroups(): Record<string, Group> {
  try { return (JSON.parse(kvGet(KEY) || "null") as Record<string, Group> | null) ?? migrate(); } catch { return {}; }
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
    const incoming: Group = { ...raw, name, companyId: raw.companyId || companyId } as Group;
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
  const bits = [c, g.kind, g.debut ? `${g.debut}年出道` : "", g.members?.length ? `成员：${g.members.join("、")}` : "", g.fandom ? `粉丝名 ${g.fandom}` : "", g.style].filter(Boolean);
  return `${g.name}（${bits.join("；")}）`;
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
