/**
 * 爱豆小手机：有人真的走了（同公司的练习生）。
 *
 * 没有人一开始就被定好要走：每个同期心里有一个「想走」的程度（0～10，她看不到），一直在变——
 * 演完一场戏记账时 AI 判断一句他更想留还是更想走（一场最多一格）；发动机排的事里影响到谁也记一笔；月末排名掉了/进步了代码自己加减。
 * 涨到 6 开始动摇（状态变了、群里有人传，他聊天时知道自己在犹豫，按性格决定告不告诉她）；
 * 动摇一周以上又涨到 9 才真的决定走，几天后离开；这期间降回去还能留下。
 * 公司淘汰另算：月末排名最后几个当场看成绩，不提前定。群里的路人每月也会走一两个。
 * 走了以后：退出练习生群、身份改成「已离开公司」，KakaoTalk 还能聊；室友走了床空出来。
 * 整件事不弹系统提示，只有他约她吃饭会进提醒事项「待回复」。
 */

import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { loadCharacters } from "./character-storage";
import { getProfile, loadProfiles, relationOf, saveProfile, type IdolProfile, type LeaveInfo } from "./idol-people";
import { loadCareer, saveCareer, type CareerNode } from "./idol-career";
import { loadChatSessions, saveChatSessions, pushChatMessage, loadChatContacts } from "./chat-storage";
import { crowdOf, removeCrowd, promoteCrowd } from "./idol-crowd";
import { fleshOut } from "./idol-kakao";
import { addWorldFeed } from "./idol-events";
import { queueMessage } from "./idol-reminders";
import { kvGet, kvSet } from "./kv-db";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pickJson = <T,>(t: string | null | undefined): T => JSON.parse(t?.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as T;
const WAVER = 6, DECIDE = 9, SETTLE = 4, STAY = 3;
const CLOSE = ["朋友", "好朋友", "暧昧", "恋人"];
const VERY_CLOSE = ["好朋友", "暧昧", "恋人"];

function config() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const c = loadApiConfigs().find(x => x.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!c) throw new Error("还没配置 API");
  return c;
}
function kakao(): { groupId?: string; teacherId?: string } {
  try { return (JSON.parse(kvGet("idol_kakao_v1") || "null") as { groupId?: string; teacherId?: string } | null) ?? {}; } catch { return {}; }
}

/** 同公司的练习生才会「离开公司」 */
export function canLeave(p?: IdolProfile): boolean {
  if (!p || p.leave?.phase === "left") return false;
  if (loadCareer().stage !== "trainee") return false;
  if (/老师|管理|经纪|室长|代表|前辈/.test(p.role)) return false;
  return /练习生|室友|同期/.test(`${p.role} ${p.group}`) && !/别家|其他公司|他公司/.test(p.role);
}
const isCrush = (p: IdolProfile) => Boolean(p.canCrush && p.heart && p.heart !== "没感觉");

/** 让一个人的「想走」动一下：d > 0 更想走，d < 0 更想留 */
export function nudgeLeave(charId: string, d: number, why: string, at = Date.now()): void {
  const p = getProfile(charId);
  if (!canLeave(p) || !d) return;
  const l: LeaveInfo = p.leave ?? { score: 2, log: [], phase: "ok" };
  const score = Math.max(0, Math.min(10, l.score + d));
  saveProfile({ ...p, leave: { ...l, score, log: [...l.log, { at, d, text: why }].slice(-20) } });
}

/** 月末排名出来后：掉到后面更想走、进步了更想留；最后几个可能被公司淘汰；路人走一两个 */
export function afterMonthlyRank(rows: { id: string; name: string; rank: number; change: string }[], at: number): void {
  const total = rows.length;
  if (!total) return;
  const others = rows.filter(r => r.id !== "__me__");
  const bottom = others.slice(-Math.max(2, Math.round(others.length * 0.08)));
  for (const r of others) {
    if (r.id.startsWith("crowd_")) continue;
    const p = getProfile(r.id);
    if (!canLeave(p)) continue;
    const pct = r.rank / total;
    const drop = /^↓(\d+)/.exec(r.change)?.[1];
    if (pct > 0.75) nudgeLeave(r.id, 1.5, `月末评价排到第 ${r.rank} 名（一共 ${total} 人）`, at);
    else if (pct <= 0.25) nudgeLeave(r.id, -1, `月末评价第 ${r.rank} 名，排在前面`, at);
    if (drop && +drop >= 4) nudgeLeave(r.id, 0.5, `月末评价一下掉了 ${drop} 名`, at);
    if (r.change.startsWith("↑") && pct <= 0.75) nudgeLeave(r.id, -0.5, `月末评价进步了`, at);
  }
  // 公司淘汰：只看排在最后的，这个月考得怎么样当场定
  for (const r of bottom) {
    if (r.id.startsWith("crowd_")) continue;
    const p = getProfile(r.id);
    if (!canLeave(p) || p.leave?.phase === "decided") continue;
    const chance = (p.leave?.score ?? 2) >= STAY ? 0.4 : 0.15;
    if (Math.random() < chance) void decide(r.id, "淘汰", at).catch(() => undefined);
  }
  // 群里的路人：排在最后的有的被淘汰，另外有人自己放弃，一个月一两个
  const gid = kakao().groupId;
  if (gid) {
    const crowdBottom = bottom.filter(r => r.id.startsWith("crowd_")).filter(() => Math.random() < 0.5);
    const extra = crowdOf(gid).filter(m => !m.promotedTo && !crowdBottom.some(b => b.id === m.id)).sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.6 ? 1 : 0);
    [...crowdBottom.map(b => b.id), ...extra.map(m => m.id)].slice(0, 3).forEach((id, i) => {
      const m = crowdOf(gid).find(x => x.id === id);
      if (!m) return;
      const when = at + rnd(1, 6) * DAY + i * HOUR;
      pendingCrowd.push({ gid, id, name: m.name, at: when });
    });
  }
}
const CROWD_KEY = "idol_leave_crowd_v1";
type PendingCrowd = { gid: string; id: string; name: string; at: number };
function loadPending(): PendingCrowd[] { try { return JSON.parse(kvGet(CROWD_KEY) || "[]") as PendingCrowd[]; } catch { return []; } }
const pendingCrowd = { push: (x: PendingCrowd) => kvSet(CROWD_KEY, JSON.stringify([...loadPending(), x])) };

// ── 动摇 / 决定 / 离开 ──

const busy = new Set<string>();

/** 刚开始动摇：AI 写苗头（近况、状态消息、群里有没有人传） */
async function startWaver(charId: string): Promise<void> {
  const c = loadCharacters().find(x => x.id === charId);
  const p = getProfile(charId);
  if (!c || !p.leave) return;
  saveProfile({ ...p, leave: { ...p.leave, phase: "waver", waverAt: Date.now() } });
  const res = await simpleLLMCall(config(), [
    { role: "system", content: `一个韩国练习生最近开始想离开公司了，还没决定。照他的性格写出别人能察觉到的苗头。只输出 JSON：{"status":"世界视角一句：他最近怎么了（别人看得到的样子，不写他心里的决定）","kakao":"他会改成的 KakaoTalk 状态消息，短；不想改就写空","rumor":"练习生群里会不会有人传他的八卦，写一句别人在群里说的话；没人注意就写空"}\n只照下面「为什么」里真实发生过的事写，不编新的。` },
    { role: "user", content: `${c.name}（${p.role}${p.age ? `，${p.age}岁` : ""}）\n平时：${p.privateLines.slice(0, 3).join("；")}\n秘密：${p.secret?.text ?? "无"}\n为什么：\n${p.leave.log.slice(-8).map(x => `- ${new Date(x.at).getMonth() + 1}月${new Date(x.at).getDate()}日 ${x.text}${x.d > 0 ? "（更想走）" : "（更想留）"}`).join("\n")}` },
  ], { temperature: 0.7, label: "有人在动摇" });
  const j = pickJson<{ status?: string; kakao?: string; rumor?: string }>(res.content);
  const q = getProfile(charId);
  if (j.status) saveProfile({ ...q, status: { text: String(j.status), kakao: String(j.kakao ?? "") || q.status?.kakao || "", at: Date.now() } });
  const gid = kakao().groupId;
  if (j.rumor && gid && loadChatSessions().some(s => s.id === gid)) {
    const m = crowdOf(gid).filter(x => !x.promotedTo)[Math.floor(Math.random() * Math.max(1, crowdOf(gid).length))];
    if (m) pushChatMessage({ sessionId: gid, role: "assistant", content: String(j.rumor), senderCharacterId: m.id, senderName: m.name, status: "sent", createdAt: new Date(Date.now() + rnd(1, 8) * HOUR).toISOString() });
  }
}

/** 决定要走（或被淘汰）：AI 写原因、去哪、要不要约她吃饭；几天后离开 */
async function decide(charId: string, forced: "淘汰" | "", at = Date.now()): Promise<void> {
  if (busy.has(charId)) return;
  const c = loadCharacters().find(x => x.id === charId);
  const p = getProfile(charId);
  if (!c || !canLeave(p) || p.leave?.phase === "decided") return;
  busy.add(charId);
  try {
    const l: LeaveInfo = p.leave ?? { score: 2, log: [], phase: "ok" };
    const rel = relationOf(p);
    const res = await simpleLLMCall(config(), [
      { role: "system", content: `一个韩国练习生${forced ? "在月末评价后被公司淘汰了" : "决定离开公司了"}。照他的资料写出合情合理的原因。只输出 JSON：{"kind":"${forced ? "淘汰" : "放弃/被挖走/家里原因/转行"}","why":"一两句具体原因，只照下面发生过的事和他的资料写","to":"他离开以后去哪、做什么，一句（被挖走就写去了哪家公司，可以是六家里别的，也可以是小公司）","status":"走了以后的近况，世界视角一句","kakao":"他走以后的 KakaoTalk 状态消息，短"}` },
      { role: "user", content: `${c.name}（${p.role}${p.age ? `，${p.age}岁` : ""}）\n平时：${p.privateLines.slice(0, 3).join("；")}\n秘密：${p.secret?.text ?? "无"}\n近况：${p.status?.text ?? ""}\n这段时间：\n${l.log.slice(-8).map(x => `- ${new Date(x.at).getMonth() + 1}月${new Date(x.at).getDate()}日 ${x.text}`).join("\n") || "（没记什么）"}` },
    ], { temperature: 0.7, label: "有人要走" });
    const j = pickJson<{ kind?: string; why?: string; to?: string; status?: string; kakao?: string }>(res.content);
    const leaveAt = at + (forced ? rnd(2, 4) : rnd(5, 12)) * DAY;
    const q = getProfile(charId);
    if (q.leave?.phase === "decided" || q.leave?.phase === "left") return;
    const kind = forced || String(j.kind || "放弃");
    saveProfile({ ...q, leave: { ...(q.leave ?? l), phase: "decided", decided: { at, leaveAt, kind, why: String(j.why ?? ""), to: String(j.to ?? ""), after: { status: String(j.status ?? ""), kakao: String(j.kakao ?? "") } } } });
    // 关系近的：提前私下告诉她（按性格，可能当面说）；很近的约她吃一顿饭
    const friend = loadChatContacts().some(x => x.characterId === charId);
    if (friend && (CLOSE.includes(rel) || isCrush(q))) {
      queueMessage(charId, `你${kind === "淘汰" ? "被公司淘汰了" : "决定离开公司了"}（${j.why}），大概${Math.round((leaveAt - Date.now()) / DAY)}天后走。私聊告诉她这件事，按你的性格和跟她的关系怎么说都行，可以别扭、可以故作轻松、可以让她先别告诉别人。`, rnd(2, 20) * HOUR);
    }
    if (friend && (VERY_CLOSE.includes(rel) || (isCrush(q) && ["喜欢", "很喜欢"].includes(q.heart ?? "")))) {
      const d = new Date(leaveAt - DAY); d.setHours(19, 0, 0, 0);
      const node: CareerNode = { id: uid("node"), kind: "date", title: `和${c.name}吃饭`, place: "", premise: `${c.name}要离开公司了（${j.why}），走之前约她吃最后一顿饭`, dueAt: d.getTime(), status: "invite", from: c.name, fromId: charId, replyBy: d.getTime() - 6 * HOUR, note: `${c.name}走之前想跟你吃顿饭` };
      if (node.dueAt > Date.now()) {
        const career = loadCareer();
        saveCareer({ ...career, nodes: [...career.nodes, node].sort((a, b) => a.dueAt - b.dueAt) });
        queueMessage(charId, `约她${d.getMonth() + 1}月${d.getDate()}日晚上七点一起吃饭，这是你走之前最后想跟她吃的一顿。一两句，按你的性格。`, rnd(24, 40) * HOUR);
      }
    }
  } finally { busy.delete(charId); }
}

/** 到日子了：退群、身份改成已离开、室友空床 */
function leaveNow(charId: string, notifyGroup = true): void {
  const c = loadCharacters().find(x => x.id === charId);
  const p = getProfile(charId);
  const dec = p.leave?.decided;
  if (!c || !dec) return;
  const now = Date.now();
  const { groupId } = kakao();
  if (groupId && notifyGroup) {
    const sessions = loadChatSessions();
    const s = sessions.find(x => x.id === groupId);
    if (s?.participantIds?.includes(charId)) {
      saveChatSessions(sessions.map(x => x.id === groupId ? { ...x, participantIds: (x.participantIds ?? []).filter(id => id !== charId) } : x));
      pushChatMessage({ sessionId: groupId, role: "system", content: `${c.name}退出了群聊`, status: "sent" });
    }
  }
  const career = loadCareer();
  if (career.roommates?.includes(charId)) {
    saveCareer({ ...career, roommates: career.roommates.filter(id => id !== charId) });
    // 床位空出来：两到四周后公司安排人搬进来，提前几天老师说一声
    const at = now + rnd(14, 28) * DAY;
    kvSet(ROOM_KEY, JSON.stringify([...loadRefills(), { at, noticeAt: at - rnd(3, 6) * DAY, noticed: false, leftName: c.name }]));
  }
  const wasRole = p.role;
  saveProfile({
    ...p,
    role: `以前的同期练习生，已离开公司${dec.to ? `（${dec.to}）` : ""}`,
    group: "以前的同期",
    status: dec.after?.status ? { text: dec.after.status, kakao: dec.after.kakao || p.status?.kakao || "", at: now } : p.status,
    events: [...p.events, { id: uid("ev"), at: now, place: "", text: `${c.name}离开了公司：${dec.why}` }].slice(-30),
    leave: { ...p.leave!, phase: "left", left: { at: now, kind: dec.kind, why: dec.why, to: dec.to, wasRole } },
  });
  // 关系还行、之前没私下说过的：走那天发一条
  const rel = relationOf(p);
  const friend = loadChatContacts().some(x => x.characterId === charId);
  if (friend && ["熟人", ...CLOSE].includes(rel) && !(CLOSE.includes(rel) || isCrush(p))) {
    queueMessage(charId, `你今天离开公司了（${dec.why}）。给她发最后一条消息，一两句，按你的性格。`, rnd(1, 5) * HOUR);
  }
}

// ── 新室友 ──

const ROOM_KEY = "idol_roommate_refill_v1";
type Refill = { at: number; noticeAt: number; noticed: boolean; leftName: string };
function loadRefills(): Refill[] { try { return JSON.parse(kvGet(ROOM_KEY) || "[]") as Refill[]; } catch { return []; } }

/** 到日子：从练习生群里挑一个人搬进来（别的宿舍调过来的同期，或者刚进公司的） */
function moveIn(r: Refill): void {
  const { groupId } = kakao();
  const session = groupId ? loadChatSessions().find(x => x.id === groupId) : undefined;
  if (!groupId || !session) return;
  const pool = crowdOf(groupId).filter(m => !m.promotedTo);
  const m = pool[Math.floor(Math.random() * pool.length)];
  if (!m) return;
  const id = promoteCrowd(groupId, m.id, session.groupName ?? "练习生群");
  if (!id) return;
  const p = getProfile(id);
  const now = Date.now();
  saveProfile({ ...p, layer: "main", role: p.role ? `${p.role}，她的新室友` : "同期练习生，她的新室友", met: true, metAt: { at: now, place: "宿舍" }, relation: p.relation ?? "认识" });
  const career = loadCareer();
  saveCareer({ ...career, roommates: [...new Set([...(career.roommates ?? []), id])] });
  addWorldFeed(`${m.name}搬进了她的宿舍，睡${r.leftName}以前那张床`, now);
  void fleshOut(id).catch(() => undefined);
}

function refillTick(now: number): void {
  const list = loadRefills();
  if (!list.length) return;
  let changed = false;
  const keep: Refill[] = [];
  for (const r of list) {
    if (!r.noticed && now >= r.noticeAt) {
      const t = kakao().teacherId;
      if (t) queueMessage(t, `过几天（${new Date(r.at).getMonth() + 1}月${new Date(r.at).getDate()}日左右）会有一个练习生搬进她的宿舍，睡${r.leftName}走后空出来的床。私聊通知她一声，按你的性格，一两句。`, rnd(0.5, 3) * HOUR);
      r.noticed = true; changed = true;
    }
    if (now >= r.at) { moveIn(r); changed = true; continue; }
    keep.push(r);
  }
  if (changed) kvSet(ROOM_KEY, JSON.stringify(keep));
}

/** 每 5 秒：看谁该动摇、该决定、该走了 */
export function leaveTick(): void {
  if (loadCareer().stage !== "trainee") return;
  const now = Date.now();
  const profiles = loadProfiles();
  for (const p of Object.values(profiles)) {
    const l = p.leave;
    if (!l || l.phase === "left" || busy.has(p.charId)) continue;
    if (!canLeave(p)) continue;
    // 心动的人苗头来得早一点
    const waverAt = isCrush(p) ? WAVER - 1 : WAVER;
    if (l.phase === "ok" && l.score >= waverAt) { busy.add(p.charId); void startWaver(p.charId).catch(() => undefined).finally(() => busy.delete(p.charId)); continue; }
    if (l.phase === "waver" && l.score < SETTLE) { saveProfile({ ...p, leave: { ...l, phase: "ok", waverAt: undefined } }); continue; }
    if (l.phase === "waver" && l.score >= DECIDE && now - (l.waverAt ?? now) >= 7 * DAY) { void decide(p.charId, "", now).catch(() => undefined); continue; }
    if (l.phase === "decided" && l.decided) {
      if (l.decided.kind !== "淘汰" && l.score < STAY && now < l.decided.leaveAt) {
        saveProfile({ ...p, leave: { ...l, phase: "waver", decided: undefined, waverAt: now } });
        if (loadChatContacts().some(x => x.characterId === p.charId) && (CLOSE.includes(relationOf(p)) || isCrush(p))) queueMessage(p.charId, "你本来决定离开公司，现在想通了，决定留下。告诉她，按你的性格。", rnd(1, 6) * HOUR);
        continue;
      }
      if (now >= l.decided.leaveAt) leaveNow(p.charId);
    }
  }
  refillTick(now);
  // 路人退群
  const pend = loadPending();
  const due = pend.filter(x => now >= x.at);
  if (due.length) {
    kvSet(CROWD_KEY, JSON.stringify(pend.filter(x => now < x.at)));
    for (const x of due) if (removeCrowd(x.gid, x.id)) pushChatMessage({ sessionId: x.gid, role: "system", content: `${x.name}退出了群聊`, status: "sent" });
  }
}
