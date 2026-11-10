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

import { mainlineState } from "./idol-mainline";
import { isKakaoFriend } from "./idol-kakao";

function isKakaoFriendSafe(charId: string): boolean { return Boolean(isKakaoFriend(charId)); }
import {
  ROUTE_NODES, ROUTE_TYPES, ROUTE_IDENTITY_HINTS,
  addMeet, addKkt, addCall, advanceNode, nodeReady, newLine,
  type LineState, type RouteType,
  bondDayKey,
} from "./idol-romance-lines";
import type { Subject } from "./idol-training";

const KEY = "idol_romance_v1";
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type State = {
  confirmedBondRepair?: { at: number; before: Partial<Record<RouteType, LineState>> };
  lines: Partial<Record<RouteType, LineState>>;
  /** 等她下一节课上完再发生的节点（练习室指导、公司偶遇、出道危机） */
  classBeats?: { type: RouteType; key: string; premise?: string }[];
  /** 等她下一次在此刻开场景时接进来的节点；where 有就只在那些地方接 */
  sceneBeats?: { type: RouteType; key: string; premise: string; where?: string }[];
  /** 等她某一场戏结束后接着开的一场（失意之夜在宿舍、掉马他视角番外）；where 有就只在那里结束的戏后面接 */
  afterScene?: { type: RouteType; key: string; note: string; title: string; premise: string; place: string; side?: boolean; where?: string }[];
};

/** 此刻那边告诉这里：她现在有没有一场在宿舍、还没演完的戏（idol-stage 装进来，免得互相 import） */
let dormSceneOpen: () => boolean = () => false;
export function setDormSceneProbe(fn: () => boolean): void { dormSceneOpen = fn; }

const STREETS = "弘大|明洞|圣水洞|清潭洞|梨泰院|江南|狎鸥亭|南山|便利店";
const isNight = () => { const h = new Date().getHours(); return h >= 21 || h < 3; };

/** 这些节点接在她上完的某一节课之后 */
const CLASS_BEAT = new Set(["practice_guide", "company_contrast"]);

function load(): State {
  try { return { lines: {}, ...(JSON.parse(kvGet(KEY) || "null") as Partial<State> | null) }; } catch { return { lines: {} }; }
}
function save(s: State) {
  // 修复后的第一次写入前保留旧账，便于核对异常分数，绝不猜测扣分。
  const backup = "idol_romance_before_meet_ledger_v1";
  if (!kvGet(backup)) { const raw = kvGet(KEY); if (raw) kvSet(backup, raw); }
  kvSet(KEY, JSON.stringify(s));
}

export function romanceState(): State { return load(); }
/** 用户明确提供的这份旧档校正；仅由按钮触发一次。 */
export function canRepairConfirmedBonds(): boolean {
  const s = load();
  if (s.confirmedBondRepair) return false;
  const chars = loadCharacters();
  return ["权知韩", "裴夏民", "宋元赫"].every(name => {
    const matches = Object.values(s.lines).filter(l => l && chars.find(c => c.id === l.charId)?.name === name);
    return matches.length === 1;
  });
}
export function repairConfirmedBonds(): boolean {
  if (!canRepairConfirmedBonds()) return false;
  const s = load(), chars = loadCharacters();
  const before = JSON.parse(JSON.stringify(s.lines)) as State["lines"];
  const targets: Record<string, number> = { "权知韩": 12, "裴夏民": 5 };
  for (const l of Object.values(s.lines)) {
    if (!l) continue;
    const name = chars.find(c => c.id === l.charId)?.name || "";
    if (targets[name] === undefined) continue;
    l.bond = targets[name];
    l.meetDays = [...new Set([...(l.meetDays || []), ...l.history.filter(h => h.type === "meet").map(h => bondDayKey(h.at))])];
  }
  s.confirmedBondRepair = { at: Date.now(), before };
  save(s);
  return true;
}

export function saveRomanceState(s: State): void { save(s); }

/** 一个人的身份沾不沾六类（关注按钮只给这些人；六线男主是男的，女的不给） */
export function routeTypeOf(p: IdolProfile): RouteType | null {
  if (p.gender === "女") return null;
  const text = `${p.role}${p.group}${p.publicText}`;
  // 判断顺序单独定（她反馈过进错线）：练习生前辈不能算爱豆线、游戏爱好者不能算电竞线
  const ORDER: RouteType[] = ["trainee", "underground", "esports", "idol", "heir", "campus"];
  for (const t of ORDER) if (ROUTE_IDENTITY_HINTS[t].test(text)) return t;
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
  // 去重交给永久日账，不能只对照最后一次见面。
  const s = load();
  s.lines[hit.type] = addMeet(hit.line);
  save(s);
}

/** 补账用：把某一天某场戏的见面补进线里（按那场戏的日期去重，跟 recordMeet 同一套账）。知情账覆盖掉线之后用来恢复羁绊 */
export function recordMeetAt(charId: string, at: number): void {
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const hit = lineOfChar(charId);
  if (!hit) return;

  const s = load();
  s.lines[hit.type] = addMeet(hit.line, at);
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
function scheduleRomanceNode(line: LineState, nodeKey: string, title: string, place: string, premise: string, kind: CareerNode["kind"] = "event", hour = 15, atMs?: number): void {
  const career = loadCareer();
  const at = new Date(atMs ?? (Date.now() + 2 * 864e5));
  if (atMs == null) at.setHours(hour, 0, 0, 0);
  const invite = kind === "date";
  const node: CareerNode = {
    id: uid("rom"), kind, title, place, premise, dueAt: at.getTime(), status: invite ? "invite" : "pending",
    companyId: career.companyId, from: charName(line.charId), fromId: line.charId,
    occasion: "romance", note: `情缘节点：${nodeKey}`,
    ...(invite ? { replyBy: at.getTime() - 3 * 3600e3 } : {}),
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  if (invite) {
    // 他发 KakaoTalk 约她（不说破这一场会发生什么，只按他的性格约）；她接了才进日历
    void import("./idol-reminders").then(m => m.queueMessage(line.charId, `你想约她出来：${premise}。按你的性格自然地约，只说要去哪、做什么的由头，不剧透这一场会发生什么。`, (10 + Math.random() * 50) * 60e3, { node, reachAny: true, dedupeKey: `romance_invite_${node.id}` })).catch(() => undefined);
  } else {
    addToCalendar(node);
  }
}

/** 主线的某个事件排了/完成了没有（encounter 节点查世界事实用） */
function mainlineExists(...keys: string[]): boolean {
  const nodes = mainlineState();
  return keys.some(k => nodes.find(n => n.key === k)?.state === "scheduled" || nodes.find(n => n.key === k)?.state === "done");
}

/** 每 5 秒在桌面跑：到门槛的节点排出来，做完的推进+结算 */
let notifyFn: ((m: string) => void) | undefined;
const sasaengBusy = new Set<string>();
/** 私生私信上次试的时间：没生成出来别每 5 秒都去调 API，隔十分钟再试 */
const sasaengTried = new Map<string, number>();

export function romanceTick(notify?: (m: string) => void): void {
  if (notify) notifyFn = notify;
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const career = loadCareer();
  if (career.stage !== "trainee") return;
  const s = load();
  let changed = false;
  for (const type of ROUTE_TYPES) {
    const line = s.lines[type];
    if (!line) continue;
    // 1. 做完的节点：推进 + 奖励；拒绝/没回的节点：算没过，不推进不奖励（她定的）
    const tag = `情缘节点：${line.nextNode}`;
    const doneNode = career.nodes.find(n => ((n.occasion === "romance" && n.note === tag) || n.romance?.includes(tag)) && n.status !== "pending" && n.status !== "invite");
    if (doneNode && doneNode.occasion !== "romance" && doneNode.status !== "done") {
      // 并进主线的那场她没去：把他这一段摘出来，下一轮另排一场（不跳过）
      saveCareer({ ...loadCareer(), nodes: loadCareer().nodes.map(n => n.id !== doneNode.id ? n : { ...n, romance: (n.romance ?? []).filter(t => t !== tag) }) });
      continue;
    }
    if (doneNode && doneNode.status === "done") {
      settleNodeReward(line.type, line.nextNode, doneNode);
      s.lines[type] = advanceNode(line);
      changed = true;
      continue;
    }
    // 2. 到门槛的节点：按触发方式排；这个节点被拒绝/没回过就不再自动重排
    if (!nodeReady(line)) continue;
    if (career.nodes.some(n => ((n.occasion === "romance" && n.note === tag) || n.romance?.includes(tag)) && (n.status === "pending" || n.status === "invite" || n.status === "declined"))) continue;
    if (line.nextNode === "mutual_reveal") { if (revealTick(s, type, line, career)) changed = true; continue; }
    if ([...(s.classBeats ?? []), ...(s.sceneBeats ?? []), ...(s.afterScene ?? [])].some(b => b.type === type && b.key === line.nextNode)) continue;
    const def = ROUTE_NODES[line.type].find(n => n.key === line.nextNode);
    if (!def) continue;
    scheduleByTrigger(s, type, line, def);
    changed = true;
  }
  if (changed) save(s);
}

type NodeDef = { key: string; title: string; trigger: string; premise: string; place: string; hour: number };

/** 这些节点要接在主线对应的那场里：主线那场还没开就直接并进去，已经办过了才另排一场 */
const MERGE_INTO_MAINLINE: Record<string, string> = { busking_meet: "roadshow", collab_stage: "collab_stage" };

function scheduleByTrigger(s: State, type: RouteType, line: LineState, def: NodeDef): void {
  const his = charName(line.charId);
  if (def.trigger === "invite") {
    if (def.key === "match_invite") {
      // 职业比赛邀请：得真的有比赛（他来首尔参赛的窗口），约在窗口最后一天
      const w = ensureVisitWindow(s, type, line, Date.now() + 2 * 864e5, Date.now() + 9 * 864e5);
      scheduleRomanceNode(line, def.key, def.title, def.place, `${his}约她：${def.premise}（他主动约的，她可以接也可以推掉）`, "date", def.hour, w.to - 2 * 3600e3);
      return;
    }
    scheduleRomanceNode(line, def.key, def.title, def.place, `${his}约她：${def.premise}（他主动约的，她可以接也可以推掉）`, "date", def.hour);
    return;
  }
  if (def.key === "bar_reunion" || def.key === "street_glance") {
    // 不排日程：她自己去了那儿就接上（SIDE B=梨泰院，且要周五六晚上他在驻唱；街角擦肩=他来首尔打比赛的那几天）
    const where = def.key === "bar_reunion" ? "梨泰院" : STREETS;
    if (def.key === "street_glance") ensureVisitWindow(s, type, line, Date.now() + 3 * 864e5, Date.now() + 10 * 864e5);
    const premise = def.key === "bar_reunion"
      ? `她来到梨泰院，走进了 SIDE B，台上正在驻唱的是${his}。${def.premise}`
      : `${def.premise}（擦肩的是${his}。他来首尔参加电竞比赛，这几天在这边。）`;
    s.sceneBeats = [...(s.sceneBeats ?? []), { type, key: def.key, premise, where }];
    return;
  }
  if (def.key === "late_night_call") {
    // 失意之夜：发生在比赛行程那几天（真实事实），深夜他打电话来
    const w = ensureVisitWindow(s, type, line, Date.now() + 2 * 864e5, Date.now() + 9 * 864e5);
    const at = new Date(w.from + Math.random() * Math.max(864e5, w.to - w.from));
    at.setHours(23, 0, 0, 0);
    scheduleRomanceNode(line, def.key, def.title, def.place, def.premise, "event", 23, at.getTime());
    return;
  }
  if (def.trigger === "encounter") {
    const mlKey = MERGE_INTO_MAINLINE[def.key] ?? "";
    if (mlKey) {
      const ml = mainlineState().find(n => n.key === mlKey);
      if (!ml || ml.state === "locked" || ml.state === "pending") return; // 主线这场还没排出来：等
      const cn = ml.nodeId ? loadCareer().nodes.find(n => n.id === ml.nodeId) : undefined;
      if (MERGE_INTO_MAINLINE[def.key] && cn && cn.status === "pending" && cn.dueAt > Date.now()) {
        // 主线那场还没开：他这一段直接写进那场
        const tag = `情缘节点：${def.key}`;
        const career = loadCareer();
        saveCareer({ ...career, nodes: career.nodes.map(n => n.id !== cn.id ? n : {
          ...n,
          premise: `${n.premise}\n（这一场里还会发生：${his}——${def.premise}。自然地发生在这场活动里，不要抢走活动本身。）`,
          participantIds: [...new Set([...(n.participantIds ?? []), line.charId])],
          romance: [...(n.romance ?? []), tag],
        }) });
        return;
      }
      if (ml.state !== "done") return; // 主线那场已经过了时间但还没结账：等它结
      scheduleRomanceNode(line, def.key, def.title, def.place, `${def.premise}（主线的对应活动已经办过了，这次另有一场，让这个节点照常发生）`, "event", def.hour);
      return;
    }
    scheduleRomanceNode(line, def.key, def.title, def.place, `${def.premise}（这是世界上真实发生的机会，她走到那就会撞上）`, "event", def.hour);
    return;
  }
  // 接在下一节课后面：先挂着，下课时上课管线来取
  if (CLASS_BEAT.has(def.key)) {
    s.classBeats = [...(s.classBeats ?? []), { type, key: def.key }];
    return;
  }
  // 失意之夜：晚上才来。她正在宿舍演一场：那场结束后接上；不在宿舍：弹此刻通知点进去接
  if (def.key === "late_night_call") {
    if (!isNight()) return;
    const premise = `深夜，${his}给她打来电话。${def.premise}`;
    if (dormSceneOpen()) {
      s.afterScene = [...(s.afterScene ?? []), { type, key: def.key, note: `情缘节点：${def.key}`, title: def.title, premise, place: "宿舍", where: "宿舍" }];
      return;
    }
    const id = pendingNodeNow(line.charId, `情缘节点：${def.key}`, def.title, "宿舍", premise);
    notifyFn?.(`🎬[${id}] ${def.title}：${his}打来了电话`);
    return;
  }
  // 出道危机：不固定怎么知道——下课听同期八卦 / 他发 KKT / 在哪儿碰见他，随机一种
  if (def.key === "debut_setback") {
    const what = "他原本有一次重要的出道机会，突然出了问题（出道预备名额被替换、男团出道计划取消或暂停等，按他的家境、资源、公司情况定）";
    const canKkt = (() => { try { return isKakaoFriendSafe(line.charId); } catch { return false; } })();
    const modes = ["class", "scene", ...(canKkt ? ["kkt"] : [])];
    const mode = modes[Math.floor(Math.random() * modes.length)];
    if (mode === "kkt") {
      void import("./idol-reminders").then(m => m.queueMessage(line.charId, `${what}。你给她发 KakaoTalk 说这件事，按你的性格说，可能只是一句「我可能出不了道了」，也可能装没事、说得很轻。一到三句。`, (1 + Math.random() * 5) * 3600e3, { requireFriend: true, dedupeKey: `romance_debut_setback_${line.charId}`, important: true }));
      const career = loadCareer();
      saveCareer({ ...career, nodes: [...career.nodes, { id: uid("rom"), kind: "event", title: def.title, place: "KakaoTalk", premise: what, dueAt: Date.now(), status: "done", companyId: career.companyId, from: his, fromId: line.charId, occasion: "romance", note: `情缘节点：${def.key}`, doneAt: Date.now() }] });
      return;
    }
    if (mode === "class") {
      s.classBeats = [...(s.classBeats ?? []), { type, key: def.key, premise: `下课后同期们在八卦出道相关的消息，${his}的事也在里面：${what}。如果他和她同公司，可能是公司男团新企划的人选定了、名单里没有他；不同公司就是圈里传出来的消息。别直接把结论递给她，让她自己从八卦里听出来。他本人不一定在场。` }];
      return;
    }
    s.sceneBeats = [...(s.sceneBeats ?? []), { type, key: def.key, premise: `她在这里碰见了${his}。${what}，他状态不太对。别一上来说破，让她自己察觉、自己问。` }];
    return;
  }
  // 私生骚扰风波：不进此刻，私生直接给她的 ins 发骚扰私信
  if (def.key === "sasaeng") {
    if (sasaengBusy.has(line.charId) || Date.now() - (sasaengTried.get(line.charId) ?? 0) < 10 * 60e3) return;
    sasaengBusy.add(line.charId);
    sasaengTried.set(line.charId, Date.now());
    const role = loadProfiles()[line.charId]?.role || "男团成员";
    void import("./idol-ins").then(m => m.sasaengDm(his, role)).then(handles => {
      if (!handles.length) return;
      const st = load();
      const cur = st.lines[type];
      if (!cur || cur.nextNode !== "sasaeng") return;
      st.lines[type] = advanceNode(cur);
      save(st);
      notifyFn?.(handles.length > 1 ? `📷 Instagram：${handles.length} 个陌生账号给你发了私信` : `📷 Instagram：@${handles[0]} 给你发了私信`);
    }).catch(() => undefined).finally(() => sasaengBusy.delete(line.charId));
    return;
  }
  // event：事情砸过来
  scheduleRomanceNode(line, def.key, def.title, def.place, def.premise, "event", def.hour);
}

/** 马上发生的一场（不提前进日历）：返回节点 id */
function pendingNodeNow(charId: string, note: string, title: string, place: string, premise: string, side = false): string {
  const career = loadCareer();
  const node: CareerNode = {
    id: uid("rom"), kind: "event", title, place, premise, dueAt: Date.now(), status: "pending",
    companyId: career.companyId, from: charName(charId), fromId: charId, occasion: "romance", note,
    ...(side ? { side: true } : {}),
  };
  saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
  return node.id;
}

/** 双向掉马：两半各自凑条件，顺序不定；两半都真的演完了才算这个节点走完 */
function revealTick(s: State, type: RouteType, line: LineState, career: ReturnType<typeof loadCareer>): boolean {
  const his = charName(line.charId);
  const has = (half: string) => career.nodes.some(n => n.fromId === line.charId && n.note === `情缘节点：mutual_reveal#${half}` && (n.status === "pending" || n.status === "invite" || n.status === "done"))
    || [...(s.classBeats ?? []), ...(s.afterScene ?? [])].some(b => b.type === type && b.key === `mutual_reveal#${half}`);
  const doneA = career.nodes.some(n => n.fromId === line.charId && n.note === "情缘节点：mutual_reveal#a" && n.status === "done");
  const doneB = career.nodes.some(n => n.fromId === line.charId && n.note === "情缘节点：mutual_reveal#b" && n.status === "done");
  if (doneA && doneB) { s.lines[type] = advanceNode(line); return true; }
  if (!nodeReady(line)) return false;
  let changed = false;
  // 第一半：公司练习视频真的上传了（要真有公开视频，打勾不算）→ 她随便哪场戏结束后，接一段他视角的番外
  const hasRealVideo = (() => {
    try {
      const yt = JSON.parse(kvGet("idol_youtube_v1") || "{}") as { videos?: { at?: number }[] };
      return Array.isArray(yt.videos) && yt.videos.some(v => v.at && v.at <= Date.now());
    } catch { return false; }
  })();
  if (!has("a") && mainlineState().find(n => n.key === "official_video")?.state === "done" && hasRealVideo) {
    s.afterScene = [...(s.afterScene ?? []), { type, key: "mutual_reveal#a", note: "情缘节点：mutual_reveal#a", title: "双向掉马", side: true, place: "他的房间",
      premise: `番外，${his}的视角，她不在场。深夜他的房间，他刷到了她公司上传的练习生表演视频（自己刷到、队友甩到群里或粉丝转发，和她无关）。他点开、重播、认出视频里的人就是平时和他打游戏的那个她，呆住了。如果他们在街上擦肩过，他也认出了那天街上的人就是她。之后他想怎么做按他的性格，这一段只写到他知道了。` }];
    changed = true;
  }
  // 第二半：下课后，同期里最沾边的那个拉她看比赛直播（要真在他来首尔参赛的那几天）
  if (!has("b")) {
    ensureVisitWindow(s, type, line, Date.now() + 1 * 864e5, Date.now() + 8 * 864e5);
    s.classBeats = [...(s.classBeats ?? []), { type, key: "mutual_reveal#b",
      premise: `下课后，同期里跟她关系不错、爱好最沾边的一个人（电竞迷、游戏迷、动漫宅或者什么都知道的那种，按同期们的人设挑；实在没人沾边就是拉她看一个超火的视频）拉她一起看一场电竞比赛直播。她听到选手里有一个声音和${his}一模一样，打的还是他天天和她打的那款游戏。如果他们在街上擦肩过，她也认出了那天街上的人。只写到她发现，之后她怎么做由她自己。` }];
    changed = true;
  }
  return changed;
}

/** 她一场戏结束时问的：有没有要接着开的一场；有就排出来返回节点 id */
export function takeRomanceAfterScene(place: string, wasSide: boolean): string | null {
  if (wasSide) return null;
  const s = load();
  const list = s.afterScene ?? [];
  const i = list.findIndex(b => !b.where || new RegExp(b.where).test(place));
  if (i < 0) return null;
  const b = list[i];
  s.afterScene = list.filter((_, k) => k !== i);
  save(s);
  const line = s.lines[b.type];
  if (!line) return null;
  return pendingNodeNow(line.charId, b.note, b.title, b.place, b.premise, b.side);
}

/** 戏真的演完了：把这场戏里接的情缘节点标成完成（她定的：演完才推进，不是排出来就推进） */
export function markPlayedBeatNodes(presentIds: string[], requirePresent: boolean): void {
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const career = loadCareer();
  const played = career.nodes.filter(n => n.occasion === "romance" && n.kind === "event"
    && String(n.note ?? "").startsWith("情缘节点：") && n.status === "pending"
    && Date.now() - n.dueAt < 8 * 3600e3
    && (!requirePresent || (n.fromId && presentIds.includes(n.fromId))));
  if (!played.length) return;
  saveCareer({ ...career, nodes: career.nodes.map(n => played.some(p => p.id === n.id) ? { ...n, status: "done" as const, doneAt: Date.now() } : n) });
}

/** 电竞线他来首尔打比赛的行程窗口（真实世界事实：擦肩/失意之夜/比赛直播/看比赛邀请都只在这几天接） */
function ensureVisitWindow(s: State, type: RouteType, line: LineState, from: number, to: number): { from: number; to: number } {
  const cur = line.extra?.visitWindow;
  if (cur && cur.to >= Date.now()) return cur;
  const w = { from, to };
  s.lines[type] = { ...line, extra: { ...(line.extra ?? {}), visitWindow: w } };
  return w;
}

/** beat 此刻能不能接（她定的：encounter 要真实世界事实——驻唱在周末晚上、擦肩在他来首尔那几天） */
function beatReadyNow(key: string, line: LineState | undefined, s: State, type: RouteType): boolean {
  const base = key.split("#")[0];
  if (base === "bar_reunion") {
    const d = new Date();
    // SIDE B 驻唱日：她定的周五到周日晚上
    return (d.getDay() === 5 || d.getDay() === 6 || d.getDay() === 0) && d.getHours() >= 19;
  }
  const w = line?.extra?.visitWindow;
  if (!w) return true; // 没记窗口的旧档放开
  const now = Date.now();
  if (now < w.from) return false;
  if (now > w.to) { ensureVisitWindow(s, type, line!, now + 2 * 864e5, now + 9 * 864e5); return false; } // 这次比赛错过了：他下次再来
  return true;
}

/** 上课管线下课时问的：有没有挂着的情缘节点；有就记成发生了，返回开场 */
export function takeRomanceClassBeat(): { key: string; premise: string } | null {
  const s = load();
  const beats = s.classBeats ?? [];
  while (beats.length) {
    const b = beats[0];
    const line = s.lines[b.type];
    const baseKey = b.key.split("#")[0];
    const def = line && line.nextNode === baseKey ? ROUTE_NODES[b.type].find(n => n.key === baseKey) : undefined;
    if (!line || !def) { beats.shift(); continue; }
    if (!beatReadyNow(b.key, line, s, b.type)) { save(s); return null; } // 还没到它的事实窗口：留着下次下课
    beats.shift();
    s.classBeats = beats;
    save(s);
    const his = charName(line.charId);
    const career = loadCareer();
    const node: CareerNode = {
      id: uid("rom"), kind: "event", title: def.title, place: def.place, premise: def.premise, dueAt: Date.now(), status: "pending",
      companyId: career.companyId, from: his, fromId: line.charId, occasion: "romance", note: `情缘节点：${b.key}`,
    };
    saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, c) => a.dueAt - c.dueAt) });
    return { key: b.key, premise: b.premise ?? `${def.premise}（跟${his}有关。这一段接在她刚上完的这节课之后发生，他要出场就写他出现了。）` };
  }
  s.classBeats = [];
  save(s);
  return null;
}

/** 此刻开场景时问的：有没有挂着要接进来的情缘节点（出道危机里「在哪儿碰见他」那种） */
export function takeRomanceSceneBeat(place: string): { key: string; premise: string; charId: string } | null {
  const s = load();
  const all = s.sceneBeats ?? [];
  const beats = all.filter(b => !b.where || new RegExp(b.where).test(place));
  const rest = all.filter(b => !beats.includes(b));
  while (beats.length) {
    const b = beats[0];
    const line = s.lines[b.type];
    const def = line && line.nextNode === b.key ? ROUTE_NODES[b.type].find(n => n.key === b.key) : undefined;
    if (!line || !def) { beats.shift(); continue; }
    if (!beatReadyNow(b.key, line, s, b.type)) { save(s); return null; } // 没到事实窗口（周末驻唱/他在首尔那几天）：留着
    beats.shift();
    s.sceneBeats = [...rest, ...beats];
    save(s);
    const career = loadCareer();
    saveCareer({ ...career, nodes: [...career.nodes, { id: uid("rom"), kind: "event", title: def.title, place: def.place, premise: b.premise, dueAt: Date.now(), status: "pending", companyId: career.companyId, from: charName(line.charId), fromId: line.charId, occasion: "romance", note: `情缘节点：${def.key}` }] });
    return { key: def.key, premise: b.premise, charId: line.charId };
  }
  s.sceneBeats = rest;
  save(s);
  return null;
}

// ── 奖励结算（情缘专属数值表，Flora 定）──

function settleNodeReward(type: RouteType, nodeKey: string, node: CareerNode): void {
  if (node.status !== "done") return; // 缺席/拒绝没奖励
  const did = new Set(node.practice ?? []); // 这场戏里她实际练/唱的科目
  if (nodeKey === "mv_lead") {
    // 前辈爱豆 MV 女主角（爱豆线专属）：演技 +4 现在结；关注度 +4~6 等公开后结
    settlePlayerExp("acting", 4);
    queuePendingPublicFame(`${node.title}（MV 公开）`, 4);
    return;
  }
  if (nodeKey === "luxury_pictorial") {
    // 高端时尚杂志拍摄（富二代线专属）：形象管理 +4 现在结；关注度 +4~6 等公开后结
    settlePlayerExp("visual", 4);
    queuePendingPublicFame(`${node.title}（画报公开）`, 4);
    return;
  }
  if (nodeKey === "song_for_her") {
    // 地下 Rapper 专属歌曲（她定）：实际唱了才声乐+2、实际 Rap 才 Rap+2、正式公开才关注度+6
    if (did.has("vocal")) settlePlayerExp("vocal", 2);
    if (did.has("rap")) settlePlayerExp("rap", 2);
    queuePendingPublicFame(`${node.title}（歌曲公开）`, 6);
    return;
  }
  if (nodeKey === "collab_stage") {
    // 情缘定稿第十节：合作舞台 舞蹈 +5
    settlePlayerExp("dance", 5);
    return;
  }
  if (nodeKey === "private_concert") {
    // 情缘定稿第十节：私人演唱会 声乐 +3
    settlePlayerExp("vocal", 3);
    return;
  }
}

/** 关注度要等公开曝光才结的（写歌/MV/画报）：挂到机会系统的待公开队列，她的公开视频发出时一起结 */
function queuePendingPublicFame(title: string, amount: number): void {
  void import("./idol-opportunities").then(m => m.queuePendingPublicFame(title, amount)).catch(() => undefined);
}
