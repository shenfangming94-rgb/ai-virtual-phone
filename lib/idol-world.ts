import { worldWeatherHint } from "./idol-weather";
/**
 * 爱豆小手机：剧情 app 的「世界」模式。
 *
 * 「世界」是一个特殊角色，当剧情 app 的主角色：API、预设、文风、状态栏、正则、世界书都绑在它身上。
 * 一场戏 = 原剧情 app 的多人分组（第一个是「世界」，后面是在场的人，分组名 = 地点）。
 * 生成时 story-engine 给「世界」主导的戏注入：她是谁、世界时间、地点、在场每个人的完整档案、规矩和记号说明；
 * 回复里的记号 [新人]/[时间]/[收尾] 由这里处理。
 */

import { nudgeLeave } from "./idol-leave";
import { recordSceneVideo, type SceneVideo } from "./idol-youtube";
import { kvGet, kvSet } from "./kv-db";
import { loadChatContacts } from "./chat-storage";
import { HIDDEN_WORLD_CHAR_ID, loadAllCharacters as loadCharacters, saveCharacters } from "./character-storage";
import type { Character } from "./character-types";
import { resolveUserIdentity } from "./settings-storage";
import { composePersona, createPerson, emptyProfile, fmtDay, getProfile, loadProfiles, relationOf, saveProfile, stepRelation } from "./idol-people";
import { describeTrainee, loadTraineeCard } from "./trainee-card";
import { shiftWorldTime } from "./world-clock";
import { fmtWorld, parseReply } from "./idol-scenes";
import { createOrGetStorySession, createStoryGroup, loadStoryGroups, loadStoryMessages, updateStoryGroup, updateStorySession, type StorySession } from "./story-storage";
import { simpleLLMCall } from "./api-helpers";
import { addCompanyFacts, careerPromptBlock, completeNode, nodeById } from "./idol-career";
import { addFame, eventsPromptBlock } from "./idol-events";
import { recordPerformance } from "./idol-ledger";
import { KAKAO_TAG_RULES, afterNodeScene, applyKakaoTags, extractKakaoTags, genKakaoId, kakaoPromptLine, type KakaoTags } from "./idol-kakao";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";

export const WORLD_CHAR_ID = HIDDEN_WORLD_CHAR_ID;
const META_KEY = "idol_scene_meta_v1";

export type SceneMeta = { place: string; premise: string; startAt: number; newFaces: string[]; ended?: boolean; summary?: string; nodeId?: string; /** 谁在交给世界 */ open?: boolean; /** 不想碰见的人（名字） */ avoid?: string[] };

const WORLD_PERSONA = "「世界」不是一个人，是这个故事的旁白和所有配角。它负责写她身边发生的事、在场的人说的话和做的事，从不替她说话、不替她做决定。";

/** 确保「世界」角色存在；没设头像时用她的头像 */
export function ensureWorldCharacter(): Character {
  const chars = loadCharacters();
  const found = chars.find(c => c.id === WORLD_CHAR_ID);
  if (found) return found;
  const now = new Date().toISOString();
  const world: Character = {
    id: WORLD_CHAR_ID,
    name: "世界",
    avatar: resolveUserIdentity()?.avatarUrl ?? null,
    persona: WORLD_PERSONA,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  saveCharacters([...chars, world]);
  return world;
}

/** 封面用的头像：「世界」自己的头像，没有就用她的 */
export function worldAvatar(): string {
  const c = loadCharacters().find(x => x.id === WORLD_CHAR_ID);
  return c?.avatar || resolveUserIdentity()?.avatarUrl || "";
}

/** 按在场名单找这场戏的分组（分组和会话的名单一直同步改） */
export function findWorldGroupId(participantIds: string[] | undefined): string | undefined {
  if (!participantIds?.length) return undefined;
  const want = [...new Set(participantIds)].sort().join("|");
  const groups = loadStoryGroups().filter(g => g.characterIds[0] === WORLD_CHAR_ID);
  return (groups.find(g => [...new Set(g.characterIds)].sort().join("|") === want) ?? null)?.id;
}

export function isWorldGroupIds(ids: string[] | undefined): boolean {
  return Boolean(ids?.length && ids[0] === WORLD_CHAR_ID);
}

function loadMetaAll(): Record<string, SceneMeta> {
  try { return JSON.parse(kvGet(META_KEY) || "{}") as Record<string, SceneMeta>; } catch { return {}; }
}
export function getSceneMeta(groupId: string): SceneMeta | null {
  return loadMetaAll()[groupId] ?? null;
}
export function saveSceneMeta(groupId: string, meta: SceneMeta): void {
  const all = loadMetaAll();
  all[groupId] = meta;
  kvSet(META_KEY, JSON.stringify(all));
}

/** 一场戏放在哪：剧情 app 的分组，或者场景 app（漫卷）里的一章。名单、记录、文字记录都从这里拿 */
export type SceneHost = {
  key: string;
  meta(): SceneMeta | null;
  saveMeta(meta: SceneMeta): void;
  ids(): string[];
  setIds(ids: string[]): void;
  transcript(): string;
  fallbackPlace: string;
};

function storyHost(groupId: string, sessionId: string): SceneHost {
  const group = () => loadStoryGroups().find(g => g.id === groupId);
  return {
    key: groupId,
    meta: () => getSceneMeta(groupId),
    saveMeta: m => saveSceneMeta(groupId, m),
    ids: () => group()?.characterIds ?? [],
    setIds: ids => { updateStoryGroup(groupId, { characterIds: ids }); updateStorySession(sessionId, { participantIds: ids }); },
    transcript: () => loadStoryMessages(sessionId)
      .filter(m => (m.role === "user" || m.role === "assistant") && !m.rawContent.startsWith("（场外指令") && !m.rawContent.startsWith("（开场"))
      .map(m => (m.role === "user" ? `她：${m.rawContent}` : m.renderedContent || m.rawContent))
      .join("\n\n"),
    fallbackPlace: group()?.name || "某个地方",
  };
}

/** 开一场戏：建分组（世界 + 在场的人）和主线会话，让「世界」先写开场 */
export function createWorldScene(place: string, premise: string, peopleIds: string[], nodeId?: string): { groupId: string; session: StorySession } {
  ensureWorldCharacter();
  const name = place.trim() || "某个地方";
  const ids = [WORLD_CHAR_ID, ...peopleIds.filter(id => id !== WORLD_CHAR_ID)];
  const group = createStoryGroup(ids, name);
  const open = ids.length === 1;
  saveSceneMeta(group.id, { place: name, premise: premise.trim(), startAt: Date.now(), newFaces: [], ...(nodeId ? { nodeId } : {}), ...(open ? { open } : {}) });
  const session = createOrGetStorySession(WORLD_CHAR_ID, { ownerType: "group", ownerId: group.id, participantIds: ids, branchId: "main" });
  const opening = premise.trim()
    ? `（开场：${premise.trim()}。写她到了这里看到的情形，写到需要她反应的地方停）`
    : "（开场：写她到了这里看到的情形，写到需要她反应的地方停）";
  updateStorySession(session.id, { autoStartPrompt: opening, autoStartRequestedAt: new Date().toISOString() });
  return { groupId: group.id, session: { ...session, autoStartPrompt: opening } };
}

function whoIsShe(): string {
  const card = loadTraineeCard();
  if (card) return describeTrainee(card);
  const me = resolveUserIdentity();
  return me ? `${me.name}。${me.bio || ""}` : "一个想当爱豆的女生。";
}

/** 给「世界」主导的戏加的系统提示（文风、字数这些交给她自己的预设和剧情设置） */
export function buildWorldScenePrompt(groupId: string | undefined, participantIds: string[]): string {
  const meta = groupId ? getSceneMeta(groupId) : null;
  const group = groupId ? loadStoryGroups().find(g => g.id === groupId) : null;
  return worldPromptFor(meta, group?.name || "", participantIds);
}

export function worldPromptFor(meta: SceneMeta | null, fallbackPlace: string, participantIds: string[]): string {
  const chars = loadCharacters();
  const people = participantIds.filter(id => id !== WORLD_CHAR_ID).map(id => chars.find(c => c.id === id)).filter((c): c is Character => Boolean(c));
  const peopleBlock = people.map(c => `## ${c.name}\n${composePersona(getProfile(c.id)) || c.persona || "（还没写设定）"}`).join("\n\n");
  return [
    "# 这一场戏",
    "这是一出以韩国娱乐圈为背景的戏，主角是「她」（用户）。你是「世界」：写旁白和除她以外所有人的言行。",
    `【她是谁】\n${whoIsShe()}\n${kakaoPromptLine()}`,
    careerPromptBlock(),
    eventsPromptBlock(),
    worldWeatherHint(),
    `【时间和地点】\n现在：${fmtWorld(Date.now())}\n地点：${meta?.place || fallbackPlace || "某个地方"}${meta?.premise ? `\n开头：${meta.premise}` : ""}`,
    `【在场的人】${people.length ? people.map(c => c.name).join("、") : "暂时只有她"}${peopleBlock ? `\n\n${peopleBlock}` : ""}`,
    meta?.open ? mightMeetBlock(participantIds, meta.place, meta.avoid) : "",
    `【规矩】
- 不替她说话、不替她做决定、不写她的心理。
- 只写在场的人；不在场的人可以被提到，要出场就写他进来了。
- 有人被问到就必须回应。
- 结果跟着她写的走，她认真做了的事不能硬说她没做好；挫折要有剧情里的具体原因。
- 写到下一个需要她反应的地方就停。`,
    `【记号】回复最后另起一行写（她看不到，没有就不写）：
- 名单里没有、但这次出场并且有名字的人：[新人:名字|一句话身份]
- 「可能碰上的人」里有人出场：[出场:名字]
- 戏里过去了一段时间：[时间:+N分钟]
- 这一场已经自然收尾：[收尾]
- 戏里第一次说清楚、以后要照着来的公司细节（楼层、作息、规矩、老师）：[公司:一句话]
${KAKAO_TAG_RULES}`,
  ].join("\n\n");
}

/** 谁在交给世界时：她认识的人都列给世界，最相关的写详细，其余只写名字身份（人多也不漏） */
function mightMeetBlock(presentIds: string[], place: string, avoid: string[] = []): string {
  const profiles = loadProfiles();
  const friends = new Set(loadChatContacts().map(c => c.characterId));
  const now = Date.now();
  const scored = loadCharacters()
    .filter(c => c.id !== WORLD_CHAR_ID && !presentIds.includes(c.id) && !avoid.includes(c.name) && profiles[c.id] && (profiles[c.id].met || profiles[c.id].layer === "main"))
    .map(c => {
      const p = profiles[c.id];
      const last = p.events[p.events.length - 1];
      const days = last ? (now - last.at) / 864e5 : 999;
      let score = 0;
      if (p.events.some(e => e.place && place && (e.place.includes(place) || place.includes(e.place)))) score += 40;
      if (p.metAt?.place && place && (p.metAt.place.includes(place) || place.includes(p.metAt.place))) score += 20;
      score += Math.max(0, 30 - days);
      if (p.layer === "main") score += 15;
      if (friends.has(c.id)) score += 10;
      score += Math.min(p.events.length, 10);
      return { c, p, last, score };
    })
    .sort((x, y) => y.score - x.score);
  const detail = scored.slice(0, 25).map(({ c, p, last }) =>
    `- ${c.name}（${p.role || p.group || "身份没写"}，跟她：${relationOf(p)}）${p.privateLines.length ? `：${p.privateLines.slice(0, 2).join("；")}` : ""}${last ? `。最近：${last.text}` : ""}`);
  const rest = scored.slice(25).map(({ c, p }) => `${c.name}（${p.role || p.group || "身份没写"}）`);
  return [
    "【可能碰上的人】这里有谁交给你定：按现在几点、这是什么地方、她的日程，以及每个人的身份和习惯，判断这会儿谁合理会在这里。可以是下面的人，也可以是没名字的路人或新面孔，也可以没人。不要为了凑人硬塞。",
    detail.length ? detail.join("\n") : "（她还谁都不认识）",
    rest.length ? `她还认识：${rest.join("、")}` : "",
  ].filter(Boolean).join("\n");
}

export type SceneTags = { newFaces: { name: string; role: string }[]; minutes: number; closing: boolean; facts: string[]; kakao: KakaoTags };

/** 把记号从文字里摘掉，返回干净文字和记号 */
export function extractSceneTags(text: string): { text: string; tags: SceneTags } {
  const k = extractKakaoTags(text);
  const r = parseReply(k.text);
  return { text: r.text, tags: { newFaces: r.newFaces, minutes: r.minutes, closing: r.closing, facts: r.facts, kakao: k.tags } };
}

/** 处理记号：新面孔建成背景人物并拉进这场，时间往前拨，交换 KakaoTalk。返回新加的人名和要给她看的提示 */
export function applySceneTags(groupId: string, sessionId: string, tags: SceneTags): { added: string[]; notes: string[] } {
  if (!loadStoryGroups().some(g => g.id === groupId)) {
    if (tags.minutes > 0) shiftWorldTime(tags.minutes * 60e3);
    if (tags.facts.length) addCompanyFacts(tags.facts);
    return { added: [], notes: [] };
  }
  return applySceneTagsTo(storyHost(groupId, sessionId), tags);
}

export function applySceneTagsTo(host: SceneHost, tags: SceneTags): { added: string[]; notes: string[] } {
  if (tags.minutes > 0) shiftWorldTime(tags.minutes * 60e3);
  if (tags.facts.length) addCompanyFacts(tags.facts);
  const added = addFaces(host, tags.newFaces);
  // 新面孔先建好，再处理给号 / 加你（名字对得上）
  const place = host.meta()?.place || host.fallbackPlace;
  const notes = applyKakaoTags(tags.kakao, place);
  // 给号 / 加你里提到、名单外的人也拉进这场
  const names = [...tags.kakao.gives.map(g => g.name), ...tags.kakao.adds.map(a => a.name)];
  const extra = loadCharacters().filter(c => names.includes(c.name) && c.id !== WORLD_CHAR_ID).map(c => c.id);
  const now = host.ids();
  const missing = extra.filter(id => !now.includes(id));
  if (missing.length) host.setIds([...now, ...missing]);
  return { added, notes };
}

function addFaces(host: SceneHost, faces: SceneTags["newFaces"]): string[] {
  if (!faces.length) return [];
  const meta = host.meta() ?? { place: host.fallbackPlace, premise: "", startAt: Date.now(), newFaces: [] };
  const ids = [...host.ids()];
  const added: string[] = [];
  for (const f of faces) {
    if (!f.name || f.name.length > 12) continue;
    const exist = loadCharacters().find(c => c.name === f.name && c.id !== WORLD_CHAR_ID);
    if (exist) {
      if (!ids.includes(exist.id)) ids.push(exist.id);
      continue;
    }
    const char = createPerson(f.name, { ...emptyProfile(""), layer: "background", role: f.role, met: true, metAt: { at: Date.now(), place: meta.place } }, null, genKakaoId());
    ids.push(char.id);
    meta.newFaces.push(char.id);
    added.push(char.name);
  }
  host.setIds(ids);
  host.saveMeta(meta);
  return added;
}

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), WORLD_CHAR_ID, "story");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API");
  return config;
}

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 这场结束：每个在场的人在档案里记一笔，第一次见的写第一印象。不写长期记忆（每段的小总结进短期，攒多了宿主自己总结进长期） */
export type SceneCloseResult = { summary: string; recorded: string[]; firstMeet: string[]; milestone?: string };

export async function closeWorldScene(groupId: string, sessionId: string): Promise<SceneCloseResult> {
  return closeSceneWith(storyHost(groupId, sessionId));
}

export async function closeSceneWith(host: SceneHost): Promise<SceneCloseResult> {
  const meta = host.meta() ?? { place: host.fallbackPlace, premise: "", startAt: Date.now(), newFaces: [] };
  const chars = loadCharacters();
  const present = host.ids().filter(id => id !== WORLD_CHAR_ID).map(id => chars.find(c => c.id === id)).filter((c): c is Character => Boolean(c));
  const transcript = host.transcript().slice(-12000);
  const firstMeet = present.filter(c => !getProfile(c.id).withYou).map(c => c.name);
  const examNode = meta.nodeId ? nodeById(meta.nodeId) : undefined;
  const recorded: string[] = [];
  let summary = "";
  if (present.length && transcript) {
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `把这场戏记下来。只输出 JSON：{"summary":"这场戏两三句",${examNode ? `"performance":"good/ok/bad：这场${examNode.title}她表现得怎么样，按她在戏里实际做了什么、准备得怎么样判断，她认真准备了不能硬说不好","performanceWhy":"一句话原因",` : ""}"people":[{"name":"","event":"站在这个人的角度，这场里他和她之间发生了什么，一句话；没交集就写空","impression":"只给第一次见她的人写：他对她的第一印象，一两句；其他人写空","relation":"up/down/same","heart":"up/down/same","secretLearned":"她这场知道了他的秘密就写她是怎么知道的，一句话；没有就写空","status":"这场之后他最近在忙什么，世界视角一句；没变就写空","kakao":"他会写在 KakaoTalk 状态消息里的短句；没变就写空","stay":"只给同公司的练习生写：这场之后他更想留在公司写 stay、更想离开写 leave、没影响写 same","stayWhy":"stay 或 leave 时一句原因"}],"video":null}\nvideo：只有这场里她确实给公司拍了要传到公司公开 YouTube 的视频（翻跳、唱歌、vlog、伴舞直拍之类）才写成 {"title":"真 YouTube 那样的韩文或英文标题","titleZh":"","kind":"练习生/直拍/vlog","dur":"m:ss","img":"画面两三句，照戏里实际拍到的写，写名字和谁站哪，她就写她的名字，不编戏里没有的事","cast":[{"pos":"左一/中间/右二…","name":""}]}，否则写 null。\n关系和心动只按这场里真的发生的事判断，一场最多动一格，没发生什么就写 same；没有心动线的人 heart 写 same。\n第一次见她的人：${firstMeet.join("、") || "无"}` },
      { role: "user", content: `地点：${meta.place}\n在场：\n${present.map(c => { const pp = getProfile(c.id); return `- ${c.name}：关系 ${relationOf(pp)}${pp.canCrush && pp.heart ? `，心动 ${pp.heart}` : "，没有心动线"}${pp.secret && pp.secret.kind !== "none" && pp.secret.text && !pp.secret.revealed ? `，秘密：${pp.secret.text}` : ""}`; }).join("\n")}\n\n${transcript}` },
    ], { temperature: 0.4, label: "剧情记账" });
    if (!res.content) throw new Error(res.error || "AI 没回");
    const j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { video?: SceneVideo | null; summary?: string; performance?: string; performanceWhy?: string; people?: { name?: string; event?: string; impression?: string; relation?: string; heart?: string; secretLearned?: string; status?: string; kakao?: string; stay?: string; stayWhy?: string }[] };
    summary = String(j.summary ?? "");
    if (j.video && typeof j.video === "object") recordSceneVideo(j.video, meta.startAt);
    if (examNode && j.performance) recordPerformance(examNode, String(j.performance), String(j.performanceWhy ?? ""));
    for (const item of j.people ?? []) {
      const c = present.find(x => x.name === item.name);
      if (!c) continue;
      const p = getProfile(c.id);
      const event = String(item.event ?? "").trim();
      const dir = (v?: string) => (v === "up" || v === "down" ? v : "same") as "up" | "down" | "same";
      const stepped = stepRelation({ ...p, relation: relationOf({ ...p, met: true }) }, dir(item.relation), dir(item.heart));
      const learned = String(item.secretLearned ?? "").trim();
      const st = String(item.status ?? "").trim();
      const next = {
        ...stepped, met: true,
        ...(st ? { status: { text: st, kakao: String(item.kakao ?? "").trim() || p.status?.kakao || "", at: Date.now() } } : {}), metAt: p.metAt ?? { at: meta.startAt, place: meta.place },
        ...(learned && p.secret && p.secret.kind !== "none" && !p.secret.revealed ? { secret: { ...p.secret, revealed: { at: meta.startAt, how: learned } } } : {}),
      };
      if (event) { next.events = [...p.events, { id: uid("ev"), at: meta.startAt, place: meta.place, text: event }]; recorded.push(c.name); }
      if (!p.withYou && item.impression) next.withYou = String(item.impression);
      saveProfile(next);
      if (item.stay === "leave" || item.stay === "stay") nudgeLeave(c.id, item.stay === "leave" ? 1 : -1, String(item.stayWhy || event || `在${meta.place}`), meta.startAt);
    }
  }
  host.saveMeta({ ...meta, ended: true, summary });
  const node = meta.nodeId ? nodeById(meta.nodeId) : undefined;
  if (node?.kind === "chance") addFame(5, node.title);
  const milestone = meta.nodeId ? await completeNode(meta.nodeId) : null;
  await afterNodeScene(node, present.map(c => c.id), meta.place).catch(() => undefined);
  return { summary, recorded, firstMeet: firstMeet.filter(n => recorded.includes(n)), ...(milestone ? { milestone } : {}) };
}
