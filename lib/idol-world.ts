import { ROMANCE_EXTRACTION_RULE, romanceSceneHint, recordSceneRomance, type RomanceObservation } from "./idol-romance";
import { placeLore } from "./idol-places";
import { IDOL_LANGUAGE_RULE } from "./idol-language";
import { namedFamilyMember } from "./idol-family-data";
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
import { composePersona, createPerson, emptyProfile, fmtDay, getProfile, herAge, loadProfiles, relationOf, saveProfile, stepRelation, type ScenePersonFacts } from "./idol-people";
import { describeTrainee, loadTraineeCard } from "./trainee-card";
import { jumpWorld, sceneTimeBoundaryHint } from "./idol-reminders";
import { fmtWorld, parseReply, type SceneNewFace } from "./idol-scenes";
import { createOrGetStorySession, createStoryGroup, loadStoryGroups, loadStoryMessages, updateStoryGroup, updateStorySession, type StorySession } from "./story-storage";
import { simpleLLMCall } from "./api-helpers";
import { addCompanyFacts, careerPromptBlock, companyByName, completeNode, nodeById, sendCompanyIntentMail } from "./idol-career";
import { eventsPromptBlock } from "./idol-events";
import { rosterPromptBlock, type RosterState } from "./idol-roster";
import { activeBranchCharIds, branchSceneEnded, branchSceneHint } from "./idol-branches";
import { fameBand, fameEvent } from "./idol-fame";
import { loadForum } from "./theqoo-store";
import { recordPerformance } from "./idol-ledger";
import { onNodeDone, onScenePractice, practiceDayUsed } from "./idol-starroad";
import { KAKAO_TAG_RULES, afterNodeScene, applyKakaoTags, extractKakaoTags, genKakaoId, kakaoPromptLine, type KakaoTags } from "./idol-kakao";
import { takePendingFace } from "./idol-pending-faces";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";

export const WORLD_CHAR_ID = HIDDEN_WORLD_CHAR_ID;
const META_KEY = "idol_scene_meta_v1";

export type SceneMeta = { place: string; premise: string; startAt: number; newFaces: string[]; ended?: boolean; summary?: string; nodeId?: string; /** 谁在交给世界 */ open?: boolean; /** 不想碰见的人（名字） */ avoid?: string[]; /** 番外：她不一定在场，看他们自己的视角；不拨世界时间、新人不进她的通讯录 */ side?: boolean; /** 剧情池给的场景剧情（初雪这种）：开场卡点一下就 AI 直接开场 */ plotAuto?: boolean; /** 排好的节点戏：AI 先写开场。invite=他约她赴约，happen=事情找上她 */ nodeAuto?: "invite" | "happen" };

/** 她未成年：新出场、跟她有来往的男生大多跟她差不多大，年龄写进新人资料 */
function peerAgeHint(): string {
  const a = herAge();
  if (a == null || a >= 18) return "";
  return `【她身边的男生】她现在 ${a} 岁。新出场、跟她有来往的男生大多是 ${Math.max(a - 3, 12)}～${a + 3} 岁（同期练习生、同龄的新人爱豆、同学），新人记号的资料里写上 age。`;
}

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
  witnessTranscript?(id: string): string;
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
export async function createWorldScene(place: string, premise: string, peopleIds: string[], nodeId?: string): Promise<{ groupId: string; session: StorySession }> {
  ensureWorldCharacter();
  const name = place.trim() || "某个地方";
  const ids = [WORLD_CHAR_ID, ...peopleIds.filter(id => id !== WORLD_CHAR_ID)];
  const group = createStoryGroup(ids, name);
  const open = ids.length === 1;
  const sceneMeta: SceneMeta = { place: name, premise: premise.trim(), startAt: Date.now(), newFaces: [], ...(nodeId ? { nodeId } : {}), ...(open ? { open } : {}) };
  saveSceneMeta(group.id, sceneMeta);
  if (nodeId && nodeById(nodeId)?.note === "情缘节点：scandal_talk") {
    await import("./theqoo-triggers").then(m => m.startUndergroundScandalScene(nodeId, sceneMeta)).catch(() => undefined);
  }
  const session = createOrGetStorySession(WORLD_CHAR_ID, { ownerType: "group", ownerId: group.id, participantIds: ids, branchId: "main" });
  const opening = premise.trim()
    ? `（开场：${premise.trim()}。写她到了这里看到的情形，写到需要她反应的地方停）`
    : "（开场：写她到了这里看到的情形，写到需要她反应的地方停）";
  updateStorySession(session.id, { autoStartPrompt: opening, autoStartRequestedAt: new Date().toISOString() });
  return { groupId: group.id, session: { ...session, autoStartPrompt: opening } };
}

/** 外界公开知道她什么：名气 + 网上讨论。场景里的人只能知道这些，别的都不许知道 */
function publicKnowledgeBlock(): string {
  const lines = [
    `关注度：${fameBand()}（路人认不认得出她、会不会议论她，按这个把握：越低越没人在意，别为了剧情硬让人认出她）`,
  ];
  try {
    const posts = loadForum("world").posts.filter(p => p.source.owner === "player" || p.source.owner === "romance").slice(-4);
    if (posts.length) {
      lines.push(`网上公开讨论过她的事（人物可以提，但只能按这些公开内容提，不能新增爆料；绯闻只是传闻，不能当事实）：${posts.map(p => `「${p.title.zh}」`).join("、")}`);
    }
  } catch { /* 论坛没读到不碍事 */ }
  return `【外界怎么看她】\n${lines.join("\n")}`;
}

function whoIsShe(): string {
  const card = loadTraineeCard();
  if (card) return describeTrainee(card);
  const me = resolveUserIdentity();
  return me ? `${me.name}。${me.bio || ""}` : "一个想当爱豆的女生。";
}

/** 新档：同期名册 + 她的班级给世界。她反馈过：进公司第一天的戏里 AI 新造了两个假同期——
 *  出场「同期」只能从名册挑；名册外的练习生只能是「新来的练习生」（老师介绍那种）。 */
function rosterPromptForScenes(): string {
  try {
    const state = JSON.parse(kvGet("idol_roster_v1") || "null") as RosterState | null;
    if (!state?.npcs?.length) return "";
    return `${rosterPromptBlock(state)}\n【同期怎么用】出场「同期」只能从上面的名册里挑名字；名册里没有的人不许写成她的同期（可以是前辈、工作人员、路人，或明确写「新来的练习生」）。她现在的班级：${state.player.klass} 班，同班的只有名册里写${state.player.klass} 班的那些。`;
  } catch { return ""; }
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
  const sceneNode = meta?.nodeId ? nodeById(meta.nodeId) : undefined;
  const scandalRule = sceneNode?.occasion === "romance" && sceneNode.note === "情缘节点：scandal_talk"
    ? `【绯闻曝光与公司谈话固定节点】关于她和地下音乐圈男主的传闻已经进入公开讨论，但不能把传闻写成事实，也不能替她承认或否认。公司已通过 KakaoTalk 请她来谈；本场要呈现公司负责人询问情况的谈话，她可以自行回应。不能改变她的关系状态或替她决定交往。`
    : "";
  const debutPlanRule = sceneNode?.occasion === "mainline" && sceneNode.title === "夏季女团出道企划公布"
    ? `【出道企划公开节点】公司向练习生说明企划的同时，本场也要呈现公司对外发布「下一年度夏季推出新女团」的官方公开信息。只公开出道计划，不公开候选人或成员名单；论坛只能讨论已经公开的企划和此前已公开的玩家资料。`
    : "";
  const streamDanmakuRule = sceneNode?.occasion === "romance" && sceneNode.note === "情缘节点：stream_duo"
    ? `【直播双排弹幕】这是电竞男主公开直播邀请她双排的固定情缘节点。弹幕由现场观众实时发出，可以震惊、起哄、猜她是谁、猜两人是否在交往；只能根据直播里已经发生的互动猜测，不能知道她的私人经历或未公开身份。每次回复末尾附一行隐藏记号，写 2～4 条简短的韩语观众弹幕及中文翻译，格式：[弹幕:韩文原句|中文翻译；韩文原句|中文翻译]。韩语要像韩国直播观众的自然口语，不能只写中文；中韩内容一一对应。不要把记号内容写进剧情正文。`
    : "";
  return [
    "# 这一场戏",
    "这是一出以韩国娱乐圈为背景的戏，主角是「她」（用户）。你是「世界」：写旁白和除她以外所有人的言行。",
    `【她是谁】\n${whoIsShe()}\n${kakaoPromptLine()}`,
    careerPromptBlock(),
    rosterPromptForScenes(),
    branchSceneHint(),
    publicKnowledgeBlock(),
    eventsPromptBlock(),
    romanceSceneHint(),
    scandalRule,
    debutPlanRule,
    streamDanmakuRule,
    peerAgeHint(),
    worldWeatherHint(),
    sceneTimeBoundaryHint(meta?.nodeId),
    `【时间和地点】\n现在：${fmtWorld(Date.now())}\n地点：${meta?.place || fallbackPlace || "某个地方"}${placeLore(meta?.place || fallbackPlace) ? `\n这一带：${placeLore(meta?.place || fallbackPlace)}` : ""}${meta?.premise ? `\n开头：${meta.premise}` : ""}`,
    `【在场的人】${people.length ? people.map(c => c.name).join("、") : "暂时只有她"}${peopleBlock ? `\n\n${peopleBlock}` : ""}`,
    meta?.open ? mightMeetBlock(participantIds, meta.place, meta.avoid) : "",
    `【说话语言】${IDOL_LANGUAGE_RULE}`,
    `【规矩】
- 不替她说话、不替她做决定、不写她的心理。
- 只写在场的人；不在场的人可以被提到，要出场就写他进来了。
- 有人被问到就必须回应。
- 结果跟着她写的走，她认真做了的事不能硬说她没做好；挫折要有剧情里的具体原因。
- 写到下一个需要她反应的地方就停。${meta?.premise ? "\n- 「开头」是这一场要发生的事的大方向，不是要一次写完的：一段一段来，每段停在她能反应的地方，别替她把整场走完。" : ""}`,
    `【记号】回复最后另起一行写（她看不到，没有就不写）：
- 名单里没有、但这次出场并且有名字的人：[新人:名字|一句话身份|已知资料JSON]。已知资料JSON只写本段已明确的gender、age、nationality、birthday、mbti、heightCm、appearance、isIdol、kinship，未明确的字段不填；没有资料可用原来的两字段格式。
- 「可能碰上的人」里有人出场：[出场:名字]
- 戏里过去了一段时间：[时间:+N分钟]
- 这一场已经自然收尾：[收尾]
- 戏里第一次说清楚、以后要照着来的公司细节（楼层、作息、规矩、老师）：[公司:一句话]
${streamDanmakuRule ? "- 本场直播弹幕按上方格式写隐藏记号：[弹幕:韩文原句|中文翻译；韩文原句|中文翻译]。" : ""}
${KAKAO_TAG_RULES}`,
  ].join("\n\n");
}

/** 谁在交给世界时：她认识的人都列给世界，最相关的写详细，其余只写名字身份（人多也不漏） */
function mightMeetBlock(presentIds: string[], place: string, avoid: string[] = []): string {
  const profiles = loadProfiles();
  const friends = new Set(loadChatContacts().map(c => c.characterId));
  const branchIds = new Set(activeBranchCharIds());
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
      if (branchIds.has(c.id)) score += 60; // 正在开的同期支线优先出场
      score += Math.min(p.events.length, 10);
      return { c, p, last, score };
    })
    .sort((x, y) => y.score - x.score);
  const detail = scored.slice(0, 25).map(({ c, p, last }) =>
    `- ${c.name}（${p.role || p.group || "身份没写"}${p.nationality ? `，国籍：${p.nationality}` : ""}，跟她：${relationOf(p)}）${p.privateLines.length ? `：${p.privateLines.slice(0, 2).join("；")}` : ""}${last ? `。最近：${last.text}` : ""}`);
  const rest = scored.slice(25).map(({ c, p }) => `${c.name}（${p.role || p.group || "身份没写"}${p.nationality ? `，国籍：${p.nationality}` : ""}）`);
  return [
    "【可能碰上的人】这里有谁交给你定：按现在几点、这是什么地方、她的日程，以及每个人的身份和习惯，判断这会儿谁合理会在这里。可以是下面的人，也可以是没名字的路人或新面孔，也可以没人。不要为了凑人硬塞。",
    detail.length ? detail.join("\n") : "（她还谁都不认识）",
    rest.length ? `她还认识：${rest.join("、")}` : "",
  ].filter(Boolean).join("\n");
}

export type SceneTags = { newFaces: SceneNewFace[]; minutes: number; closing: boolean; facts: string[]; kakao: KakaoTags; danmaku: { ko: string; zh: string }[] };

function extractStreamDanmaku(text: string): { text: string; danmaku: { ko: string; zh: string }[] } {
  const tags = [...text.matchAll(/\[弹幕[:：]([\s\S]*?)\]/g)];
  const danmaku = tags.flatMap(match => match[1].split(/[；;]/).flatMap(part => {
    const pair = part.split(/[|｜]/);
    const ko = (pair.shift() ?? "").trim();
    const zh = pair.join("|").trim();
    return /[가-힣]/.test(ko) && zh ? [{ ko, zh }] : [];
  })).slice(0, 8);
  return { text: text.replace(/\[弹幕[:：][\s\S]*?\]/g, "").trim(), danmaku };
}

/** 把记号从文字里摘掉，返回干净文字和记号 */
export function extractSceneTags(text: string): { text: string; tags: SceneTags } {
  const k = extractKakaoTags(text);
  const d = extractStreamDanmaku(k.text);
  const r = parseReply(d.text);
  return { text: r.text, tags: { newFaces: r.newFaces, minutes: r.minutes, closing: r.closing, facts: r.facts, kakao: k.tags, danmaku: d.danmaku } };
}

/** 处理记号：新面孔建成背景人物并拉进这场，时间往前拨，交换 KakaoTalk。返回新加的人名和要给她看的提示 */
export function applySceneTags(groupId: string, sessionId: string, tags: SceneTags, introduction = ""): { added: string[]; notes: string[] } {
  if (!loadStoryGroups().some(g => g.id === groupId)) {
    const stopped = tags.minutes > 0 ? jumpWorld(Date.now() + tags.minutes * 60e3) : "";
    if (tags.facts.length) addCompanyFacts(tags.facts);
    return { added: [], notes: stopped ? [stopped] : [] };
  }
  return applySceneTagsTo(storyHost(groupId, sessionId), tags, introduction);
}

export function applySceneTagsTo(host: SceneHost, tags: SceneTags, introduction = ""): { added: string[]; notes: string[] } {
  // 番外：不碰世界时间、不交换 KakaoTalk；新面孔是他们认识的人，不是她认识的
  if (host.meta()?.side) {
    if (tags.facts.length) addCompanyFacts(tags.facts);
    addFaces(host, tags.newFaces, introduction, true);
    return { added: [], notes: [] };
  }
  const stopped = tags.minutes > 0 ? jumpWorld(Date.now() + tags.minutes * 60e3, { activeNodeId: host.meta()?.nodeId }) : "";
  if (tags.facts.length) addCompanyFacts(tags.facts);
  const added = addFaces(host, tags.newFaces, introduction);
  // 新面孔先建好，再处理给号 / 加你（名字对得上）
  const place = host.meta()?.place || host.fallbackPlace;
  const notes = [...(stopped ? [stopped] : []), ...applyKakaoTags(tags.kakao, place)];
  // 给号 / 加你里提到、名单外的人也拉进这场
  const names = [...tags.kakao.gives.map(g => g.name), ...tags.kakao.adds.map(a => a.name)];
  const encountered = loadCharacters().filter(c => names.includes(c.name) && c.id !== WORLD_CHAR_ID);
  if (introduction) for (const c of encountered) {
    const p = getProfile(c.id);
    if (!p.introducedIn && !p.privateLines.length) saveProfile({ ...p, introducedIn: introduction.slice(0, 12000) });
  }
  const extra = encountered.map(c => c.id);
  const now = host.ids();
  const missing = extra.filter(id => !now.includes(id));
  if (missing.length) host.setIds([...now, ...missing]);
  return { added, notes };
}

function addFaces(host: SceneHost, faces: SceneTags["newFaces"], introduction: string, side = false): string[] {
  if (!faces.length) return [];
  const meta = host.meta() ?? { place: host.fallbackPlace, premise: "", startAt: Date.now(), newFaces: [] };
  const ids = [...host.ids()];
  const added: string[] = [];
  // 名册里的人不许被新造出来当同期：名册外自称「同期」的新面孔，降成普通公司里的人
  const rosterNames = (() => {
    try {
      const state = JSON.parse(kvGet("idol_roster_v1") || "null") as { npcs?: { name: string }[] } | null;
      return state?.npcs?.length ? new Set(state.npcs.map(n => n.name)) : null;
    } catch { return null; }
  })();
  for (const f of faces) {
    if (!f.name || f.name.length > 12) continue;
    const linkedFamily = namedFamilyMember(f.name);
    const exist = loadCharacters().find(c => (c.name === f.name || c.id === linkedFamily?.charId) && c.id !== WORLD_CHAR_ID);
    if (exist) {
      if (!ids.includes(exist.id)) ids.push(exist.id);
      // 她定的：见过就进通讯录——出场这一刻就算见过了，不用等戏结束
      const ep = getProfile(exist.id);
      if (!ep.met) saveProfile({ ...ep, met: true, metAt: { at: Date.now(), place: meta.place } });
      continue;
    }
    // 番外里新冒出来的人是他们认识的人，不建档、不进她的通讯录，只活在这场戏里
    if (side) continue;
    // 排过队的待出场人物：戏里真见了，拿预设资料合并，从队列里移除
    const pending = takePendingFace(f.name);
    const facts: ScenePersonFacts = {
      ...f.facts,
      ...(pending?.gender && !f.facts?.gender ? { gender: pending.gender } : {}),
      ...(pending?.age && !f.facts?.age ? { age: pending.age } : {}),
    };
    let role = f.role || pending?.role || "";
    if (rosterNames && !rosterNames.has(f.name) && /同期/.test(role)) role = "公司里的人";
    const char = createPerson(f.name, { ...emptyProfile(""), layer: "background", role, ...facts, sceneFacts: facts, introducedIn: introduction.slice(0, 12000), met: true, metAt: { at: Date.now(), place: meta.place } }, null, genKakaoId());
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
export type SceneCloseResult = { summary: string; recorded: string[]; firstMeet: string[]; milestone?: string; gains?: string; /** 这一场后面要接着开的一场（节点 id） */ next?: string };

export async function closeWorldScene(groupId: string, sessionId: string): Promise<SceneCloseResult> {
  return closeSceneWith(storyHost(groupId, sessionId));
}

/** 番外计入主线：只记每个人自己经历了什么（进他的记忆），不动她的关注度、日程、练习，她没跟谁接触就不动关系 */
async function closeSideScene(host: SceneHost, meta: SceneMeta): Promise<SceneCloseResult> {
  const chars = loadCharacters();
  const present = host.ids().filter(id => id !== WORLD_CHAR_ID).map(id => chars.find(c => c.id === id)).filter((c): c is Character => Boolean(c));
  const transcript = host.transcript().slice(-12000);
  const her = loadTraineeCard()?.name || "她";
  const recorded: string[] = [];
  let summary = "";
  if (present.length && transcript) {
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `把这场番外记下来。这一场是从他们自己的视角写的，${her}不一定在场：她没出现在现场就是不在，她通过 KakaoTalk 发消息只算手机上的来往。只输出 JSON：{"summary":"这场两三句，用名字","people":[{"name":"","event":"站在这个人的角度，这场他经历了什么，一句话；没什么事写空","relation":"up/down/same：只有这场里他真的跟${her}有来往（她在场或发了消息）才写，否则 same","heart":"同上","status":"这场之后他最近在忙什么，世界视角一句；没变写空","kakao":"他会写在 KakaoTalk 状态消息里的短句；没变写空"}]}` },
      { role: "user", content: `地点：${meta.place}\n在场：${present.map(c => c.name).join("、")}\n\n${transcript}` },
    ], { temperature: 0.4, label: "番外记账" });
    if (!res.content) throw new Error(res.error || "AI 没回");
    const j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { summary?: string; people?: { name?: string; event?: string; relation?: string; heart?: string; status?: string; kakao?: string }[] };
    summary = String(j.summary ?? "");
    for (const item of j.people ?? []) {
      const c = present.find(x => x.name === item.name);
      if (!c) continue;
      const p = getProfile(c.id);
      const event = String(item.event ?? "").trim();
      const dir = (v?: string) => (v === "up" || v === "down" ? v : "same") as "up" | "down" | "same";
      const stepped = p.met ? stepRelation({ ...p, relation: relationOf(p) }, dir(item.relation), dir(item.heart)) : p;
      const st = String(item.status ?? "").trim();
      const next = { ...stepped, ...(st ? { status: { text: st, kakao: String(item.kakao ?? "").trim() || p.status?.kakao || "", at: Date.now() } } : {}) };
      if (event) { next.events = [...p.events, { id: uid("ev"), at: meta.startAt, place: meta.place, text: event }]; recorded.push(c.name); }
      saveProfile(next);
    }
  }
  host.saveMeta({ ...meta, ended: true, summary });
  return { summary, recorded, firstMeet: [] };
}

export async function closeSceneWith(host: SceneHost): Promise<SceneCloseResult> {
  const meta = host.meta() ?? { place: host.fallbackPlace, premise: "", startAt: Date.now(), newFaces: [] };
  if (meta.ended) return { summary: meta.summary || "", recorded: [], firstMeet: [] };
  if (meta.side) return closeSideScene(host, meta);
  const chars = loadCharacters();
  const present = host.ids().filter(id => id !== WORLD_CHAR_ID).map(id => chars.find(c => c.id === id)).filter((c): c is Character => Boolean(c));
  const transcript = host.transcript().slice(-12000);
  const firstMeet = present.filter(c => !getProfile(c.id).withYou).map(c => c.name);
  const examNode = meta.nodeId ? nodeById(meta.nodeId) : undefined;
  const recorded: string[] = [];
  let summary = "";
  let fame: string | null | undefined;
  let publicEvidence: import("./theqoo-triggers").ScenePublicEvidence[] = [];
  let perf: string | undefined;
  let companyIntentNote = "";
  let gains: string | undefined;
  if (present.length && transcript) {
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `把这场戏记下来。只输出 JSON：{"summary":"这场戏两三句，用她的名字称呼她，不许用「她」指代",${examNode ? `"performance":"good/ok/bad：这场${examNode.title}她表现得怎么样，按她在戏里实际做了什么、准备得怎么样判断，她认真准备了不能硬说不好","performanceWhy":"一句话原因",` : ""}"practice":["她这场里真的在练/上课的科目，只能写 vocal dance rap compose acting variety language visual，没练写空数组"],"growth":null,"companyIntent":null,"fame":null,"people":[{"name":"","event":"站在这个人的角度，这场里他和她之间发生了什么，一句话；没交集就写空","impression":"只给第一次见她的人写：他对她的第一印象，一两句；其他人写空","relation":"up/down/same","heart":"up/down/same","secretLearned":"她这场知道了他的秘密就写她是怎么知道的，一句话；没有就写空","status":"这场之后他最近在忙什么，世界视角一句；没变就写空","kakao":"他会写在 KakaoTalk 状态消息里的短句；没变就写空","stay":"只给同公司的练习生写：这场之后他更想留在公司写 stay、更想离开写 leave、没影响写 same","stayWhy":"stay 或 leave 时一句原因"}],"video":null}\ngrowth：这场戏里她真实经历了重大成长机遇（大舞台、前辈亲自指导、大师课、特别训练这类，普通上课/私下见面不算）才写 {"subject":"vocal/dance/rap/compose/acting/variety/language/visual","amount":1~10 的数,"why":"一句话"}，没到那种程度写 null。AI 只提议，代码会校验。\ncompanyIntent：这场里公司方（选角组、星探、高层代表公司表态）明确给她录取或拒绝的结果才写 {"company":"公司名","result":"pass/fail"}，公司没表态写 null。\nvideo：只有这场里她确实给公司拍了要传到公司公开 YouTube 的视频（翻跳、唱歌、vlog、伴舞直拍之类）才写成 {"title":"真 YouTube 那样的韩文或英文标题","titleZh":"","kind":"练习生/直拍/vlog","dur":"m:ss","img":"画面两三句，照戏里实际拍到的写，写名字和谁站哪，她就写「她」，不编戏里没有的事","cast":[{"pos":"左一/中间/右二…","name":"她本人写「她」，别人照戏里的名字一个字不改"}]}，否则写 null。\nfame：这场里她做的事让外界更多人知道她了才写，按戏里实际的动静写 small（被路人拍到、小帖子转了一圈）/ medium（视频在网上传开、上了小新闻、在大场合露脸）/ big（上热搜、大面积火了，好事坏事都算）；只是去公司开会、面谈、上课、私下见人这类外界看不到的写 null。\n关系和心动只按这场里真的发生的事判断，一场最多动一格，没发生什么就写 same；没有心动线的人 heart 写 same。\n${ROMANCE_EXTRACTION_RULE}\n${romanceSceneHint()}\n人物日常event/status/kakao只写本人实际知情的事，不把未证实的恋爱猜测写成事实；私密知情与处理细节只放romance字段，不放公开状态或其他人的记忆。\n第一次见她的人：${firstMeet.join("、") || "无"}` },
      { role: "system", content: `额外返回 publicEvidence 数组；仅当 transcript 原文明确说明玩家相关照片、视频、身份、直播或出道企划已经公开可见时填项。格式：{"kind":"roadshow_photo | roadshow_video | public_photo | viral_clip | debut_plan_public | mv_cast_reveal | mv_release | livestream_duo | pictorial_release | collab_stage_public | campus_sighting","quote":"从 transcript 连续逐字复制的原句"}。quote 必须在原文中逐字存在并明确说明素材或企划已公开；仅拍摄未发布、公司内部讨论、私人互动、身份猜测和传闻都不能写。没有就返回空数组。` },
      { role: "user", content: `她叫：${loadTraineeCard()?.name || ""}\n地点：${meta.place}\n在场：\n${present.map(c => { const pp = getProfile(c.id); return `- ${c.name}：关系 ${relationOf(pp)}${pp.canCrush && pp.heart ? `，心动 ${pp.heart}` : "，没有心动线"}${pp.secret && pp.secret.kind !== "none" && pp.secret.text && !pp.secret.revealed ? `，秘密：${pp.secret.text}` : ""}`; }).join("\n")}\n\n${transcript}` },
    ], { temperature: 0.4, label: "剧情记账" });
    if (!res.content) throw new Error(res.error || "AI 没回");
    const j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { romanceObservations?: RomanceObservation[]; romanceOutcomes?: { observer?: string; partner?: string; quote?: string; text?: string }[]; practice?: string[]; fame?: string | null; video?: SceneVideo | null; summary?: string; performance?: string; performanceWhy?: string; growth?: { subject?: string; amount?: number; why?: string } | null; companyIntent?: { company?: string; result?: string } | null; people?: { name?: string; event?: string; impression?: string; relation?: string; heart?: string; secretLearned?: string; status?: string; kakao?: string; stay?: string; stayWhy?: string }[] };
    summary = String(j.summary ?? "");
    fame = j.fame;
    const rawEvidence = (j as typeof j & { publicEvidence?: import("./theqoo-triggers").ScenePublicEvidence[] }).publicEvidence;
    publicEvidence = Array.isArray(rawEvidence) ? rawEvidence.slice(0, 3) : [];
    recordSceneRomance({ sourceId: `scene:${host.key}`, at: Date.now(), transcript, present, people: chars, playerName: loadTraineeCard()?.name, witnessTranscript: host.witnessTranscript, observations: j.romanceObservations, outcomes: j.romanceOutcomes });
    // 私人路线：戏里公司方明确表态（录取/拒绝）→ 发正式信。录取信挂「接受录取」，她点接受才签约
    const intent = j.companyIntent;
    if (intent?.company && (intent.result === "pass" || intent.result === "fail")) {
      const comp = companyByName(intent.company);
      if (comp) { const sent = sendCompanyIntentMail(comp.id, intent.result === "pass"); if (sent) companyIntentNote = intent.result === "pass" ? `📩 ${sent} 发来了录取通知，去邮箱看看吧` : `📩 ${sent} 发来了试镜结果`; }
    }
    if (j.video && typeof j.video === "object") {
      const officialPracticeVideo = examNode?.occasion === "mainline" && examNode.title === "官方练习生表演视频公开";
      recordSceneVideo({ ...j.video, forumStoryKind: officialPracticeVideo ? "practice_video" : undefined }, meta.startAt);
    }
    if (examNode && j.performance) { recordPerformance(examNode, String(j.performance), String(j.performanceWhy ?? "")); perf = String(j.performance); }
    if (examNode) onNodeDone(examNode, String(j.performance ?? "ok"));
    else if (Array.isArray(j.practice)) {
      const dayUsed = practiceDayUsed(meta.startAt);
      onScenePractice(j.practice.map(String), meta.startAt);
      // 新存档模式：名册里的她也涨（一天一次，戏里真练了的科目），数字打给结束画面看
      if (!dayUsed) {
        try {
          const m = await import("./idol-roster-live");
          for (const p of (j.practice as string[]).slice(0, 1)) {
            const g = m.settlePlayerClass(p as never);
            if (g) gains = `${m.SUBJECT_LABEL[p as never] ?? "练习"} 加练 +${g.gained}${g.levels.length ? `（${g.levels.map(l => `${l.from}→${l.to}`).join("，")}）` : ""}`;
          }
        } catch { /* 名册没接上不影响记账 */ }
      }
    }
    // 大机遇成长：AI 提议 subject+amount，代码校验后按数值方案直接涨能力值（一场戏只结一次）
    const growth = j.growth;
    if (growth && typeof growth === "object" && typeof growth.subject === "string" && Number.isFinite(Number(growth.amount))) {
      const subj = growth.subject.trim();
      if ((["vocal", "dance", "rap", "compose", "acting", "variety", "language", "visual"] as const).includes(subj as never)) {
        try {
          const m = await import("./idol-roster-live");
          const g = m.settlePlayerGrowth(subj as never, Number(growth.amount), `scene:${host.key}`);
          if (g && g.gained > 0) gains = `大机遇 · ${String(growth.why ?? "").trim() || "这场的经历"}：${m.SUBJECT_LABEL[subj as never] ?? subj} +${g.gained}`;
        } catch { /* 名册没接上不影响记账 */ }
      }
    }
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
      // 情缘羁绊：这场戏和线里的男主见了面（连续待一整天也只算这一次）
      try { (await import("./idol-romance-live")).recordMeet(c.id); } catch { /* 情缘系统没接上不影响记账 */ }
      if (item.stay === "leave" || item.stay === "stay") nudgeLeave(c.id, item.stay === "leave" ? 1 : -1, String(item.stayWhy || event || `在${meta.place}`), meta.startAt);
    }
    // 兜底：在场的人一律算见过（AI 记账漏了谁都不漏她认识的人）
    for (const c of present) {
      const p = getProfile(c.id);
      if (!p.met) saveProfile({ ...p, met: true, metAt: { at: meta.startAt, place: meta.place } });
    }
    // 支线人物这场在场：这条支线告一段落（记历史、腾名额）
    try { branchSceneEnded(present.map(c => c.id), summary || ""); } catch { /* 支线没接上不影响 */ }
  }
  host.saveMeta({ ...meta, ended: true, summary });
  const node = meta.nodeId ? nodeById(meta.nodeId) : undefined;
  // 关注度看这场戏里外界到底知不知道，不看提醒事项是不是「机会」
  // 她反馈过：一场试镜通过就热度 +20 太离谱——试镜外界基本看不见，最多算小事
  const settledFame = node?.kind === "audition" && (fame === "medium" || fame === "big") ? "small" : fame;
  if (settledFame === "small" || settledFame === "medium" || settledFame === "big") fameEvent(settledFame, summary || node?.title || `在${meta.place}`, meta.startAt);
  const milestone = meta.nodeId ? await completeNode(meta.nodeId, perf) : null;
  await afterNodeScene(node, present.map(c => c.id), meta.place).catch(() => undefined);
  void import("./theqoo-triggers").then(m => m.publishSceneForumEvents({ node, meta, transcript, evidence: publicEvidence })).catch(error => {
    console.warn("[TheQoo] scene hook failed:", error);
  });
  return { summary, recorded, firstMeet: firstMeet.filter(n => recorded.includes(n)), ...(gains ? { gains } : {}), ...(milestone || companyIntentNote ? { milestone: [milestone, companyIntentNote].filter(Boolean).join("\n") } : {}) };
}
