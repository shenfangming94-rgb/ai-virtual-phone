/**
 * 爱豆小手机：情缘系统存档落地（kv + 接线）。纯逻辑在 lib/idol-romance-lines.ts。
 *
 * - 关注：通讯录里六类身份的人才显示关注按钮（按钮不标类型），一条线同时一人、不能换人
 * - 羁绊接线：见面（此刻戏结束记一次）、KKT 有来有回（消息落库记）、电话（待接）
 * - romanceTick：节点到门槛就按 invite/encounter/event 三种方式排（他约=待回复节点、机会=查世界事实、事件=砸过来）
 * - 节点完成：推进下一个 + 奖励结算（情缘专属数值表）
 * 只在新存档（有名册）下跑。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCareer, saveCareer, addToCalendar, type CareerNode } from "./idol-career";
import { loadProfiles, type IdolProfile } from "./idol-people";
import { loadCharacters } from "./character-storage";
import { settlePlayerExp } from "./idol-roster-live";
import { fameEvent } from "./idol-fame";
import { mainlineState } from "./idol-mainline";
import {
  ROUTE_NODES, ROUTE_TYPES, ROUTE_IDENTITY_HINTS,
  addMeet, addKkt, addCall, advanceNode, nodeReady, newLine,
  type LineState, type RouteType,
} from "./idol-romance-lines";
import type { Subject } from "./idol-training";

const KEY = "idol_romance_v1";
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type State = { lines: Partial<Record<RouteType, LineState>> };

function load(): State {
  try { return { lines: {}, ...(JSON.parse(kvGet(KEY) || "null") as Partial<State> | null) }; } catch { return { lines: {} }; }
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); }

export function romanceState(): State { return load(); }
export function saveRomanceState(s: State): void { save(s); }

/** 一个人的身份沾不沾六类（关注按钮只给这些人；六线男主是男的，女的不给） */
export function routeTypeOf(p: IdolProfile): RouteType | null {
  if (p.gender === "女") return null;
  const text = `${p.role}${p.group}${p.publicText}`;
  for (const t of ROUTE_TYPES) if (ROUTE_IDENTITY_HINTS[t].test(text)) return t;
  return null;
}

/** 能不能关注他：身份是六类之一、且那条线还空着 */
export function canFollow(charId: string): RouteType | null {
  const p = loadProfiles()[charId];
  if (!p) return null;
  const t = routeTypeOf(p);
  if (!t) return null;
  const s = load();
  if (s.lines[t]) return null;
  return t;
}

/** 关注：他进入那条线，羁绊从此刻起算。线被占了返回错误 */
export function followRoute(charId: string): { ok: true; type: RouteType } | { ok: false; why: string } {
  const t = canFollow(charId);
  if (!t) return { ok: false, why: "他不符合条件，或这条线已经有人了" };
  const s = load();
  s.lines[t] = newLine(t, charId);
  save(s);
  return { ok: true, type: t };
}

export function lineFor(type: RouteType): LineState | undefined { return load().lines[type]; }

function lineOfChar(charId: string): { type: RouteType; line: LineState } | null {
  const s = load();
  for (const [type, line] of Object.entries(s.lines) as [RouteType, LineState | undefined][]) {
    if (line && line.charId === charId) return { type, line };
  }
  return null;
}

/** 见面：一场戏结束，在场的人里有线里的男主 → 羁绊 +5（一次戏只算一次） */
export function recordMeet(charId: string): void {
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const hit = lineOfChar(charId);
  if (!hit) return;
  const s = load();
  s.lines[hit.type] = addMeet(hit.line);
  save(s);
}

/** KKT 有来有回：他回了她消息 → 羁绊 +1（日上限 2） */
export function recordKkt(charId: string): void {
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const hit = lineOfChar(charId);
  if (!hit) return;
  const s = load();
  s.lines[hit.type] = addKkt(hit.line);
  save(s);
}

/** 电话：待接（通话系统的挂点以后补） */
export function recordCall(charId: string): void {
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const hit = lineOfChar(charId);
  if (!hit) return;
  const s = load();
  s.lines[hit.type] = addCall(hit.line);
  save(s);
}

// ── 节点触发 ──

function charName(charId: string): string {
  return loadCharacters().find(c => c.id === charId)?.name ?? "他";
}

/** 给这条线排一个日程节点（三结局那套现成） */
function scheduleRomanceNode(line: LineState, nodeKey: string, title: string, place: string, premise: string, kind: CareerNode["kind"] = "event"): void {
  const career = loadCareer();
  const at = new Date(Date.now() + 2 * 864e5);
  at.setHours(15 + Math.floor(Math.random() * 3), 0, 0, 0);
  const node: CareerNode = {
    id: uid("rom"), kind, title, place, premise, dueAt: at.getTime(), status: "invite",
    companyId: career.companyId, from: charName(line.charId), fromId: line.charId,
    occasion: "romance", note: `情缘节点：${nodeKey}`,
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  addToCalendar(node);
}

/** 主线的某个事件排了/完成了没有（encounter 节点查世界事实用） */
function mainlineExists(...keys: string[]): boolean {
  const nodes = mainlineState();
  return keys.some(k => nodes.find(n => n.key === k)?.state === "scheduled" || nodes.find(n => n.key === k)?.state === "done");
}

/** 每 5 秒在桌面跑：到门槛的节点排出来，做完的推进+结算 */
export function romanceTick(): void {
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const career = loadCareer();
  if (career.stage !== "trainee") return;
  const s = load();
  let changed = false;
  for (const type of ROUTE_TYPES) {
    const line = s.lines[type];
    if (!line) continue;
    // 1. 做完的节点：推进 + 奖励
    const doneNode = career.nodes.find(n => n.occasion === "romance" && n.note === `情缘节点：${line.nextNode}` && n.status !== "pending" && n.status !== "invite");
    if (doneNode) {
      settleNodeReward(line.type, line.nextNode, doneNode);
      s.lines[type] = advanceNode(line);
      changed = true;
      continue;
    }
    // 2. 到门槛的节点：按触发方式排
    if (!nodeReady(line)) continue;
    if (career.nodes.some(n => n.occasion === "romance" && n.note === `情缘节点：${line.nextNode}` && (n.status === "pending" || n.status === "invite"))) continue;
    const def = ROUTE_NODES[line.type].find(n => n.key === line.nextNode);
    if (!def) continue;
    scheduleByTrigger(s, type, line, def);
    changed = true;
  }
  if (changed) save(s);
}

function scheduleByTrigger(s: State, type: RouteType, line: LineState, def: { key: string; title: string; trigger: string; premise: string }): void {
  const his = charName(line.charId);
  const her = "她";
  if (def.trigger === "invite") {
    scheduleRomanceNode(line, def.key, def.title, "汉江公园", `${his}约她：${def.premise}（他主动约的，她可以接也可以推掉）`, "date");
    return;
  }
  if (def.trigger === "encounter") {
    // 世界事实给机会：路演/合作舞台/官方视频/街角擦肩都看主线排没排
    const need = def.key === "busking_meet" ? ["roadshow"] : def.key === "collab_stage" ? ["collab_stage"] : def.key === "mutual_reveal" ? ["official_video"] : def.key === "street_glance" ? ["roadshow"] : [];
    if (need.length && !mainlineExists(...need)) {
      // 机会还没到：等世界（主线窗口会排出来；主线已办过就补办一场）
      const doneAlready = need.every(k => mainlineState().find(n => n.key === k)?.state === "done");
      if (doneAlready) {
        scheduleRomanceNode(line, def.key, def.title, "弘大", `${def.premise}（主线的对应活动已经办过了，公司这次另排一场新的，让这个节点照常发生）`);
      }
      return;
    }
    scheduleRomanceNode(line, def.key, def.title, "弘大", `${def.premise}（这是世界上真实发生的机会，她走到那就会撞上）`);
    return;
  }
  // event：事情砸过来
  scheduleRomanceNode(line, def.key, def.title, "公司 练习室", `${def.premise}`);
}

// ── 奖励结算（情缘专属数值表，Flora 定）──

function settleNodeReward(type: RouteType, nodeKey: string, node: CareerNode): void {
  if (node.status !== "done") return; // 缺席/拒绝没奖励
  const her = loadCareer();
  void her;
  if (nodeKey === "mv_lead") {
    // 前辈爱豆 MV 女主角（爱豆线专属）：演技 +4、关注度 +4~6
    settlePlayerExp("acting", 4);
    fameEvent("medium", node.title, node.dueAt);
    return;
  }
  if (nodeKey === "luxury_pictorial") {
    // 高端时尚杂志拍摄（富二代线专属）：形象管理 +4、关注度 +4~6
    settlePlayerExp("visual", 4);
    fameEvent("medium", node.title, node.dueAt);
    return;
  }
  if (nodeKey === "song_for_her") {
    // 地下 Rapper 专属歌曲：公开后关注度 +6；她实际参与演唱/录制 → 声乐 +2；实际参与 Rap → Rap +2
    fameEvent("medium", `${node.title}（歌曲公开）`, node.dueAt);
    settlePlayerExp("vocal", 2);
    settlePlayerExp("rap", 2);
    return;
  }
}
