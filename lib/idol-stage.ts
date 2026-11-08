/**
 * 爱豆小手机：场景 app（原「漫卷」改的）。一场戏 = 「世界」漫卷会话里的一章。
 *
 * - 地图一层套一层：首尔大地图 → 公司 / 江南 / 电视台 / 演唱会场馆小地图。地图图片和钉子位置她自己传、自己摆
 * - 每个地点一张背景（存在漫卷素材里，挂在「世界」名下，名字 = 地点 key）和几首 BGM（宿主音乐库里的歌）
 * - 提醒事项里的事（主线）只能在这里演完才算完成；剧情 app 降为支线
 * - 记号、新面孔、收尾记账都跟剧情 app「世界」模式共用 idol-world 那套（SceneHost）
 */

import { kvGet, kvSet } from "./kv-db";
import { listPendingFaces } from "./idol-pending-faces";
import { WORLD_CHAR_ID, closeSceneWith, ensureWorldCharacter, worldPromptFor, type SceneCloseResult, type SceneHost, type SceneMeta } from "./idol-world";
import { createOrGetVnSession, loadVnMessagesForChapter, startNewChapter, archiveChapter, updateVnMessageSummary, deleteVnMessage, pushVnMessage, type VnSession } from "./vn-storage";
import { simpleLLMCall } from "./api-helpers";
import { resolveVnConfigs } from "./vn-engine";
import { formatChatTimestamp } from "./llm-prompt-assembler";
import { parseVnResponse } from "./vn-parser";
import { companyOf, loadCareer, nodeById, type CareerNode } from "./idol-career";
import { fmtWorld } from "./idol-scenes";
import { resolveUserIdentity } from "./settings-storage";
import { addVnScene, deleteVnScene, loadVnScenes } from "./vn-asset-storage";
import { getThemeAssetMap } from "./theme-storage";
import { loadAllCharacters } from "./character-storage";
import { classHappeningNow, markClassAttended, type Subject as StarSubject } from "./idol-starroad";
import { CLASS_TEXT_KEYS, CLASS_TEXTS, pickClassText, lastClassTextId, saveClassTextId } from "./idol-class-texts";
import { formatClassGain, settlePlayerClass } from "./idol-roster-live";
import { takeRomanceSceneBeat as romanceSceneBeat, takeRomanceAfterScene, setDormSceneProbe } from "./idol-romance-live";
import { apSlotOf } from "./idol-actionpoints";
import { consumeAp } from "./idol-ap-live";
import { setWorldTime } from "./world-clock";
import { markIntroDone, plotTick, takeClassPlot, takeIntroPremise, takeScenePlot } from "./idol-plots";

export const STAGE_APP_NAME = "此刻";

// ── 地图 ──

export type StagePlace = {
  /** 背景 / BGM / 提示词里用的名字，全局唯一 */
  key: string;
  /** 地图上显示的名字 */
  label: string;
  /** 点进去是另一张地图 */
  sub?: string;
  /** company：进了公司才能去；debut：出道后才能去 */
  lock?: "company" | "debut";
};

export type StageMap = { id: string; label: string; places: StagePlace[]; parent?: string };

const p = (key: string, extra: Partial<StagePlace> = {}): StagePlace => ({ key, label: key, ...extra });
const inMap = (map: string, label: string, extra: Partial<StagePlace> = {}): StagePlace => ({ key: `${map}·${label}`, label, ...extra });

export const STAGE_MAPS: StageMap[] = [
  {
    id: "seoul", label: "首尔", places: [
      p("家"), p("宿舍", { lock: "company" }), { key: "公司", label: "公司", sub: "company", lock: "company" },
      p("便利店"), p("汉江公园"), p("南山塔"), p("弘大"), p("明洞"), p("圣水洞"), p("清潭洞"),
      { key: "江南", label: "江南", sub: "gangnam" }, p("梨泰院"), p("唱片店"),
      { key: "电视台", label: "电视台", sub: "tv" }, { key: "演唱会场馆", label: "演唱会场馆", sub: "arena" },
      p("医院"), p("仁川机场"),
    ],
  },
  {
    id: "company", label: "公司", parent: "seoul", places: ["大厅", "练习室", "录音室", "会议室", "办公室", "食堂", "天台"].map(l => inMap("公司", l)),
  },
  {
    id: "gangnam", label: "江南", parent: "seoul", places: ["商场", "烤肉店", "KTV", "电影院", "餐厅", "咖啡店"].map(l => inMap("江南", l)),
  },
  {
    id: "tv", label: "电视台", parent: "seoul", places: [
      inMap("电视台", "下班路"), ...["待机室", "化妆间", "后台走廊", "舞台"].map(l => inMap("电视台", l, { lock: "debut" })),
    ],
  },
  {
    id: "arena", label: "场馆", parent: "seoul", places: [
      inMap("场馆", "场馆外"), inMap("场馆", "观众席"), ...["化妆间", "后台", "舞台"].map(l => inMap("场馆", l, { lock: "debut" })),
    ],
  },
];

export function mapById(id: string): StageMap {
  return STAGE_MAPS.find(m => m.id === id) ?? STAGE_MAPS[0];
}

/** 能走进去的地点（不含只是入口的公司/江南这种） */
// ── 我的地点：她自己写的，不上地图，存在「我的地点」里 ──

const CUSTOM_KEY = "idol_stage_custom_places_v1";
export const MINE_MAP_ID = "mine";
export function loadCustomPlaces(): StagePlace[] {
  try { return (JSON.parse(kvGet(CUSTOM_KEY) || "[]") as string[]).map(n => ({ key: `我的·${n}`, label: n })); } catch { return []; }
}
export function addCustomPlace(name: string): StagePlace {
  const n = name.trim().replace(/·/g, " ").slice(0, 20);
  const list = loadCustomPlaces().map(x => x.label);
  if (!list.includes(n)) kvSet(CUSTOM_KEY, JSON.stringify([...list, n]));
  return { key: `我的·${n}`, label: n };
}
export function removeCustomPlace(key: string): void {
  kvSet(CUSTOM_KEY, JSON.stringify(loadCustomPlaces().filter(x => x.key !== key).map(x => x.label)));
}

/** 地图 + 我的地点（我的地点不当地图显示，只在列表里） */
export function allMaps(): StageMap[] {
  const mine = loadCustomPlaces();
  return mine.length ? [...STAGE_MAPS, { id: MINE_MAP_ID, label: "我的地点", places: mine }] : STAGE_MAPS;
}

export function allScenePlaces(): StagePlace[] {
  return allMaps().flatMap(m => m.places).filter(x => !x.sub);
}

export function placeByKey(key: string): StagePlace | undefined {
  return allMaps().flatMap(m => m.places).find(x => x.key === key);
}

export function placeLocked(place: StagePlace): string | null {
  const stage = loadCareer().stage;
  if (place.lock === "company" && stage === "pre") return "进了公司才能去";
  if (place.lock === "debut" && stage !== "idol") return "出道后才能去";
  return null;
}

/** 给 AI 看的地点全称：公司、宿舍前面带公司名 */
export function placeFullName(key: string): string {
  const c = companyOf(loadCareer().companyId);
  const place = placeByKey(key);
  const label = place?.label ?? key;
  if (key.startsWith("公司·")) return c ? `${c.name} 公司 ${label}` : `公司 ${label}`;
  if (key === "宿舍") return c ? `${c.name} 宿舍` : "宿舍";
  if (key.startsWith("我的·")) return label;
  if (key.includes("·")) return `${key.split("·")[0]} ${label}`;
  return label;
}

/** 提醒事项里写的地点（「LOOKS 公司 练习室」这种）对到地图上的地点 */
/** 提醒事项里常见、地图上没有的叫法 → 用哪个地点的背景和音乐 */
const PLACE_ALIASES: [RegExp, string][] = [
  [/试镜室|考核室|오디션룸|大练习室|舞蹈室|声乐室/, "公司·练习室"],
  [/办公室|面谈/, "公司·办公室"],
  [/公司大楼$|사옥$|大楼$/, "公司·大厅"],
  [/老家/, "家"],
  [/观众席/, "场馆·观众席"],
  [/竞技场.*后台|场馆.*后台/, "场馆·后台"],
  [/竞技场|巨蛋|演唱会场馆/, "场馆·舞台"],
];

export function placeKeyFromText(text: string): string {
  if (placeByKey(text.trim())) return text.trim();
  const t = text.replace(/\s+/g, "");
  for (const [re, key] of PLACE_ALIASES) if (re.test(t)) return key;
  const scored = allScenePlaces()
    .map(pl => ({ pl, hit: t.includes(pl.label) ? pl.label.length + (pl.key.includes("·") && t.includes(pl.key.split("·")[0]) ? 5 : 0) : 0 }))
    .filter(x => x.hit > 0)
    .sort((a, b) => b.hit - a.hit);
  if (scored.length) return scored[0].pl.key;
  if (/公司/.test(t)) return "公司·练习室";
  return text.trim() || "家";
}

// ── 地图图片和钉子（她自己传、自己摆） ──

export type MapLook = { imageAssetId?: string; pins: Record<string, { x: number; y: number }>; /** 默认图也不要，用卡片 */ noImage?: boolean };
const LOOK_KEY = "idol_stage_maps_v1";

/** 自带的地图（她挑的图，10-28 钉好的位置）；她上传了自己的图就用她的。night = 夜版图，18:00～6:00 用（钉子同一套） */
export const DEFAULT_MAPS: Record<string, { image: string; night?: string; pins: MapLook["pins"] }> = {
  seoul: {
    image: "/idol/maps/seoul.jpg",
    night: "/idol/maps/seoul-night.jpg",
    pins: {
      家: { x: 16.1, y: 25 }, 宿舍: { x: 87.4, y: 76.5 }, 公司: { x: 74.6, y: 62 }, 便利店: { x: 49.6, y: 52.3 }, 汉江公园: { x: 51.9, y: 76.5 },
      南山塔: { x: 37.1, y: 29 }, 弘大: { x: 22.7, y: 81.8 }, 明洞: { x: 21.6, y: 58.1 }, 圣水洞: { x: 45.4, y: 36.3 }, 清潭洞: { x: 49.9, y: 65.8 },
      江南: { x: 73.6, y: 39.7 }, 梨泰院: { x: 63.1, y: 29 }, 唱片店: { x: 43.6, y: 59.5 }, 电视台: { x: 34.4, y: 44.5 }, 演唱会场馆: { x: 84.8, y: 22.3 },
      医院: { x: 12.5, y: 67.8 }, 仁川机场: { x: 80.8, y: 33.9 },
    },
  },
  // 公司大楼照片按楼层钉（她说随便钉，看着像一栋楼就行）
  "company@hybe": {
    image: "/idol/maps/company-hybe.jpg",
    pins: {
      "公司·天台": { x: 48, y: 19 }, "公司·办公室": { x: 26, y: 28 }, "公司·会议室": { x: 56, y: 36 }, "公司·录音室": { x: 24, y: 45 },
      "公司·练习室": { x: 58, y: 53 }, "公司·食堂": { x: 28, y: 63 }, "公司·大厅": { x: 16, y: 78 },
    },
  },
  "company@cube": {
    image: "/idol/maps/company-cube.jpg",
    pins: { "公司·天台": { x: 45, y: 10 }, "公司·办公室": { x: 19, y: 24 }, "公司·会议室": { x: 65, y: 29 }, "公司·录音室": { x: 22, y: 36 }, "公司·练习室": { x: 62, y: 52 }, "公司·食堂": { x: 39, y: 65 }, "公司·大厅": { x: 13, y: 85 } },
  },
  "company@yg": {
    image: "/idol/maps/company-yg.jpg",
    pins: { "公司·天台": { x: 40, y: 9 }, "公司·办公室": { x: 18, y: 18 }, "公司·会议室": { x: 60, y: 23 }, "公司·录音室": { x: 23, y: 33 }, "公司·练习室": { x: 51, y: 56 }, "公司·食堂": { x: 17, y: 68 }, "公司·大厅": { x: 53, y: 83 } },
  },
  "company@sm": {
    image: "/idol/maps/company-sm.jpg",
    pins: { "公司·天台": { x: 51, y: 7 }, "公司·办公室": { x: 25, y: 21 }, "公司·会议室": { x: 61, y: 30 }, "公司·录音室": { x: 26, y: 40 }, "公司·练习室": { x: 59, y: 49 }, "公司·食堂": { x: 20, y: 65 }, "公司·大厅": { x: 65, y: 85 } },
  },
  "company@starship": {
    image: "/idol/maps/company-starship.jpg",
    pins: { "公司·天台": { x: 65, y: 15 }, "公司·办公室": { x: 34, y: 25 }, "公司·会议室": { x: 64, y: 35 }, "公司·录音室": { x: 21, y: 44 }, "公司·练习室": { x: 57, y: 54 }, "公司·食堂": { x: 25, y: 65 }, "公司·大厅": { x: 59, y: 86 } },
  },
  "company@jyp": {
    image: "/idol/maps/company-jyp.jpg",
    pins: { "公司·天台": { x: 39, y: 14 }, "公司·办公室": { x: 26, y: 25 }, "公司·会议室": { x: 45, y: 35 }, "公司·录音室": { x: 21, y: 45 }, "公司·练习室": { x: 44, y: 55 }, "公司·食堂": { x: 23, y: 66 }, "公司·大厅": { x: 57, y: 85 } },
  },
  "gangnam": {
    image: "/idol/maps/gangnam.jpg",
    pins: { "江南·商场": { x: 68, y: 49 }, "江南·烤肉店": { x: 17, y: 60 }, "江南·KTV": { x: 55, y: 57 }, "江南·电影院": { x: 64, y: 67 }, "江南·餐厅": { x: 24, y: 71 }, "江南·咖啡店": { x: 14, y: 51 } },
  },
  "arena": {
    image: "/idol/maps/arena.jpg",
    pins: { "场馆·场馆外": { x: 27, y: 89 }, "场馆·观众席": { x: 19, y: 70 }, "场馆·化妆间": { x: 20, y: 25 }, "场馆·后台": { x: 62, y: 29 }, "场馆·舞台": { x: 38, y: 48 } },
  },
  "tv": {
    image: "/idol/maps/tv.jpg",
    pins: { "电视台·下班路": { x: 23, y: 89 }, "电视台·待机室": { x: 22, y: 47 }, "电视台·化妆间": { x: 62, y: 53 }, "电视台·后台走廊": { x: 22, y: 62 }, "电视台·舞台": { x: 58, y: 68 } },
  },

};

/** 公司小地图按签的公司分开：key「company@公司id」（每家一张楼，各自的钉子）；没签或没有就用「company」 */
export function mapLookKey(mapId: string): string {
  if (mapId !== "company") return mapId;
  const id = loadCareer().companyId;
  return id ? `company@${id}` : mapId;
}

/** 地点在哪张地图上 */
export function mapOfPlace(key: string): StageMap | undefined {
  return allMaps().find(m => m.places.some(x => x.key === key && !x.sub));
}

export function loadMapLooks(): Record<string, MapLook> {
  try { return JSON.parse(kvGet(LOOK_KEY) || "{}") as Record<string, MapLook>; } catch { return {}; }
}
export function saveMapLook(mapId: string, look: MapLook): void {
  kvSet(LOOK_KEY, JSON.stringify({ ...loadMapLooks(), [mapId]: look }));
}

// ── 背景：每个地点可以存好几张，点一张就换成它，别的不删 ──

const BG_PICK_KEY = "idol_stage_bg_pick_v1";
function loadBgPicks(): Record<string, string> {
  try { return JSON.parse(kvGet(BG_PICK_KEY) || "{}") as Record<string, string>; } catch { return {}; }
}
export function placeBackgrounds(key: string): { id: string; assetId: string; on: boolean }[] {
  const list = loadVnScenes(WORLD_CHAR_ID).filter(x => x.name === key);
  const pick = loadBgPicks()[key];
  const cur = list.find(x => x.id === pick) ?? list[list.length - 1];
  return list.map(x => ({ id: x.id, assetId: x.assetId, on: x.id === cur?.id }));
}
export function pickBackground(key: string, id: string): void {
  kvSet(BG_PICK_KEY, JSON.stringify({ ...loadBgPicks(), [key]: id }));
}
export async function addBackground(key: string, blob: Blob): Promise<void> {
  const a = await addVnScene(WORLD_CHAR_ID, key, blob);
  pickBackground(key, a.id);
}
export async function removeBackground(id: string): Promise<void> {
  await deleteVnScene(id);
}
/** 场景里要用的背景：每个地点用它现在选中的那张 */
export async function resolveStageBgMap(names: string[]): Promise<Record<string, string>> {
  const chosen = names.map(n => [n, placeBackgrounds(n).find(x => x.on)?.assetId] as const).filter((x): x is readonly [string, string] => Boolean(x[1]));
  if (!chosen.length) return {};
  const m = await getThemeAssetMap(chosen.map(x => x[1]));
  return Object.fromEntries(chosen.filter(x => m[x[1]]).map(x => [x[0], m[x[1]]]));
}
export async function thumbsOf(ids: string[]): Promise<Record<string, string>> {
  return ids.length ? getThemeAssetMap(ids) : {};
}

// ── BGM：每个地点勾几首歌，轮着放。歌可以是她传的 mp3（宿主音乐库），也可以是网易云的歌 ──

export type BgmSong = { src: "local"; id: string; title: string; artist?: string } | { src: "netease"; id: number; title: string; artist?: string };

const BGM_KEY = "idol_stage_bgm_v1";
export function loadBgmMap(): Record<string, BgmSong[]> {
  try { return JSON.parse(kvGet(BGM_KEY) || "{}") as Record<string, BgmSong[]>; } catch { return {}; }
}
export function saveBgmFor(placeKey: string, songs: BgmSong[]): void {
  kvSet(BGM_KEY, JSON.stringify({ ...loadBgmMap(), [placeKey]: songs }));
}

/** 地图自己的音乐用 map:地图id 存；逛地图时放，没单独配歌的地点也放它 */
export const mapBgmKey = (mapId: string) => `map:${mapId}`;

export type BgmMode = "list" | "one" | "shuffle";
const BGM_MODE_KEY = "idol_stage_bgm_mode_v1";
export function loadBgmModes(): Record<string, BgmMode> {
  try { return JSON.parse(kvGet(BGM_MODE_KEY) || "{}") as Record<string, BgmMode>; } catch { return {}; }
}
export function saveBgmMode(key: string, mode: BgmMode): void {
  kvSet(BGM_MODE_KEY, JSON.stringify({ ...loadBgmModes(), [key]: mode }));
}

/** 这个地方实际放什么：自己配了就放自己的，没配就放所在地图的 */
export function resolveBgm(key: string): { key: string; songs: BgmSong[]; mode: BgmMode } {
  const map = loadBgmMap();
  const modes = loadBgmModes();
  if (key.startsWith("map:")) return { key, songs: map[key] ?? [], mode: modes[key] ?? "list" };
  if (map[key]?.length) return { key, songs: map[key], mode: modes[key] ?? "list" };
  // 我的地点没有自己的地图，跟首尔
  const m = key.startsWith("我的·") ? mapById("seoul") : mapOfPlace(key);
  const mk = m ? mapBgmKey(m.id) : "";
  return { key: mk || key, songs: (mk && map[mk]) || [], mode: (mk && modes[mk]) || "list" };
}

// ── 此刻设置 ──

export type StageLang = "zh" | "ko-talk" | "ko-all";
export type StageSettings = { words: number; style: string; lang: StageLang; volume: number; /** 截图时藏起左上角的日期时间（时间照走） */ hideClock?: boolean };
const SETTINGS_KEY = "idol_stage_settings_v1";
export const DEFAULT_STAGE_SETTINGS: StageSettings = { words: 800, style: "", lang: "ko-talk", volume: 55 };
export function loadStageSettings(): StageSettings {
  try { return { ...DEFAULT_STAGE_SETTINGS, ...(JSON.parse(kvGet(SETTINGS_KEY) || "{}") as Partial<StageSettings>) }; } catch { return DEFAULT_STAGE_SETTINGS; }
}
export function saveStageSettings(s: StageSettings): void {
  kvSet(SETTINGS_KEY, JSON.stringify(s));
}

/** 她在这个世界里叫什么（总结里用这个名字） */
export function herName(): string {
  return resolveUserIdentity(WORLD_CHAR_ID, "vn")?.name?.trim() || "她";
}

// ── 一场戏 ──

export type StageScene = SceneMeta & {
  chapterId: string;
  /** 进来时的地点 key（背景） */
  bg: string;
  ids: string[];
  /** 不想碰见的人（名字） */
  avoid?: string[];
  /** 番外演完她选了计入主线（没选的不进记忆） */
  sideCounted?: boolean;
  /** 进来时用掉的「!」和她自己写的开头：切成番外时把「!」还回去 */
  taken?: { fate?: string; life?: string; extra?: string; premise?: string };
  /** 结束后她点了「合成大总结」：短期记忆里用这一段代替每段的小总结 */
  bigSummary?: string;
  /** 每个人在第几段出场、第几段离场（段 = AI 的第几次回复，从 0 数）；只记得在场那几段 */
  spans?: Record<string, { from: number; to?: number }>;
  /** 上课场景（上课大改）：这节课的科目、时间、抽到的固定文本、下课状态 */
  class?: {
    subjectKey: string;
    label: string;
    start: number;
    end: number;
    textId: string;
    text: string;
    settled?: boolean;
    attended?: boolean;
    /** 第一次进练习室的前置剧情（老师介绍新练习生）：AI 先演，固定文本这节课不放 */
    preScene?: "intro";
  };
};

const SCENES_KEY = "idol_stage_scenes_v1";

function loadScenes(): Record<string, StageScene> {
  try { return JSON.parse(kvGet(SCENES_KEY) || "{}") as Record<string, StageScene>; } catch { return {}; }
}
export function getStageScene(chapterId: string): StageScene | null {
  return loadScenes()[chapterId] ?? null;
}
function saveStageScene(s: StageScene): void {
  kvSet(SCENES_KEY, JSON.stringify({ ...loadScenes(), [s.chapterId]: s }));
}

export function worldVnSession(): VnSession {
  return createOrGetVnSession(WORLD_CHAR_ID);
}

/** 开一场：新的一章 + 记下时间地点。不写开场，等她说第一句 */
export function startStageScene(opts: { placeKey: string; placeName?: string; meetIds?: string[]; avoid?: string[]; nodeId?: string; premise?: string; taken?: StageScene["taken"]; side?: boolean }): { chapterIndex: number; scene: StageScene } | null {
  ensureWorldCharacter();
  const session = worldVnSession();
  const node = opts.nodeId ? nodeById(opts.nodeId) : undefined;
  const place = opts.placeName?.trim() || placeFullName(opts.placeKey);
  const title = node ? node.title : (placeByKey(opts.placeKey)?.label ?? opts.placeKey);
  const ch = startNewChapter(session.id, title, `${fmtWorld(Date.now()).slice(5)} · ${place}`);
  if (!ch) return null;
  const ids = [WORLD_CHAR_ID, ...(opts.meetIds ?? []).filter(id => id !== WORLD_CHAR_ID)];
  // 剧情池的场景剧情（初雪这种）：她在哪都衔接，开场卡点一下就 AI 直接开场
  let premise = (opts.premise ?? node?.premise ?? "").trim();
  let plotAuto = false;
  try {
    const scenePlot = takeScenePlot();
    if (scenePlot) { premise = premise ? `${premise}\n${scenePlot.premise}` : scenePlot.premise; plotAuto = true; }
    else if (!opts.nodeId) {
      // 情缘：出道危机「在哪儿碰见他」，她下一次随便去哪都接进来
      const beat = romanceSceneBeat(place);
      if (beat) { premise = premise ? `${premise}\n${beat.premise}` : beat.premise; plotAuto = true; if (!ids.includes(beat.charId)) ids.push(beat.charId); }
    }
  } catch { /* 剧情池出错不影响开场景 */ }
  const scene: StageScene = {
    chapterId: ch.id, bg: opts.placeKey, ids,
    place, premise, startAt: Date.now(), newFaces: [],
    ...(opts.nodeId ? { nodeId: opts.nodeId } : {}),
    ...(opts.taken ? { taken: opts.taken } : {}),
    ...(ids.length === 1 ? { open: true } : {}),
    ...(opts.avoid?.length ? { avoid: opts.avoid } : {}),
    ...(plotAuto ? { plotAuto: true } : {}),
    ...(opts.side ? { side: true } : {}),
    // 排好的节点戏（情缘/主线/生活剧情）：她不知道这场会发生什么，AI 先写开场
    ...(!plotAuto && node && premise ? { nodeAuto: node.kind === "date" ? "invite" as const : "happen" as const } : {}),
  };
  saveStageScene(scene);
  return { chapterIndex: ch.index, scene };
}

/** 提醒事项里「去演」/ 横幅点进来 */
export function startNodeStage(node: CareerNode): { chapterIndex: number; scene: StageScene } | null {
  let premise = node.wish ? `${node.premise}（她想要的结果：${node.wish}。照这个结果写，写得合理，要有具体的原因）` : node.premise;
  // 代码定的结果必须进开场（机会选拔的胜负等），不能现场 AI 说反（她反馈过）
  if (node.note && /结果（代码定的）/.test(node.note)) premise = `${premise}\n（${node.note}）`;
  // 这件事已经开过一场、还没结束：接着那一场
  const session = worldVnSession();
  for (const ch of session.chapters) {
    const s = getStageScene(ch.id);
    if (s && s.nodeId === node.id && !s.ended) return { chapterIndex: ch.index, scene: s };
  }
  const key = placeKeyFromText(node.place);
  // 写的就是地图上的地点（「江南·烤肉店」）：用地图的说法；不是的照它原来写的
  return startStageScene({ placeKey: key, placeName: placeByKey(node.place.trim()) ? placeFullName(key) : node.place, nodeId: node.id, premise, ...(node.side ? { side: true } : {}), ...(node.participantIds || node.inviterIds ? { meetIds: [...new Set([...(node.participantIds || []), ...(node.inviterIds || []), ...(node.fromId ? [node.fromId] : [])])] } : {}) });
}

// ── 上课场景（上课大改，Flora 2026-11-05 定）：课表时间进公司 = 上课 ──

/** 特色课（体能/人性/礼仪）没有科目，按课名找文本 */
const SIDE_TEXT_KEYS: Record<string, string> = { 体能课: "fitness", 人性课: "personality", 礼仪课: "etiquette" };

function classTextKey(cls: { subject: StarSubject | null; label: string }): string {
  if (cls.subject) return cls.subject;
  return SIDE_TEXT_KEYS[cls.label] ?? "";
}

/**
 * 开一节上课场景：先显示固定课堂文本（55 段里抽的，不走 AI），
 * 下课结算时数字打出来；点错秒退不算（结算只发生在下课）。
 * 第一次进练习室：老师介绍新练习生的前置剧情（AI 直接开场，这节课不放固定文本）。
 */
export function startClassScene(placeKey: string): { chapterIndex: number; scene: StageScene } | null {
  const cls = classHappeningNow();
  if (!cls) return null;
  const session = worldVnSession();
  const place = placeFullName(placeKey);
  const ch = startNewChapter(session.id, cls.label, `${fmtWorld(Date.now()).slice(5)} · ${place}`);
  if (!ch) return null;
  const key = classTextKey(cls);
  const picked = pickClassText(key, lastClassTextId(key));
  saveClassTextId(key, picked?.id ?? "");
  const intro = takeIntroPremise();
  const scene: StageScene = {
    chapterId: ch.id, bg: placeKey, ids: [WORLD_CHAR_ID],
    place, premise: intro?.premise ?? "", startAt: Date.now(), newFaces: [],
    class: {
      subjectKey: cls.subject ?? "", label: cls.label, start: cls.start, end: cls.end,
      textId: picked?.id ?? "", text: intro ? "" : (picked?.text ?? ""),
      ...(intro ? { preScene: "intro" as const } : {}),
    },
  };
  saveStageScene(scene);
  // 第一次课：AI 直接演「老师介绍新练习生」（开场卡点一下就开场）；之后的课固定文本直接写进这一章当开场
  if (!intro) {
    pushVnMessage({ sessionId: session.id, role: "assistant", rawContent: picked?.text ?? "今天这节课照常进行。", chapterIndex: ch.index });
  }
  return { chapterIndex: ch.index, scene };
}

/**
 * 下课结算：名册里的她涨数值（数字打成文字）、扣行动点、世界时间走到下课、记到场。
 * 有挂着的剧情时返回 plotPremise（AI 直接接着演），没有就写「这节课结束了」并归档。
 */
export async function settleClassScene(chapterIndex: number): Promise<{ lines: string[]; plotPremise: string | null }> {
  const chId = chapterIdOf(chapterIndex);
  const scene = chId ? getStageScene(chId) : null;
  if (!scene?.class || scene.class.settled) throw new Error("这场课已经下过了");
  const cls = scene.class;
  const session = worldVnSession();
  const lines: string[] = [];
  // 她定的：迟到 30 分钟内不算旷课，超过按旷课——不结数值、不记到场（戏让她演完）
  if (Date.now() - cls.start > 30 * 60e3) {
    if (Date.now() < cls.end) setWorldTime(cls.end);
    saveStageScene({ ...scene, class: { ...cls, settled: true, attended: false } });
    void import("./idol-romance-live").then(m => m.markPlayedBeatNodes([], false)).catch(() => undefined);
    return { lines: ["迟到了三十分钟以上，这节课算旷课了。"], plotPremise: null };
  }
  // 数值结算：八门课走名册结算；特色课不涨八项，只给一句收尾
  if (cls.subjectKey && CLASS_TEXT_KEYS[cls.subjectKey]) {
    const g = settlePlayerClass(cls.subjectKey as StarSubject);
    if (g) lines.push(formatClassGain(cls.label, g));
  }
  // 扣行动点：这节课占一个整格（08:00–24:00 内才扣）
  const slot = apSlotOf(cls.start);
  if (slot != null) consumeAp(cls.start, [slot], cls.label);
  // 世界时间走到下课（迟到了也从下课时间接着走）
  if (Date.now() < cls.end) setWorldTime(cls.end);
  // 记到场：judge 只认这个
  markClassAttended(cls.start, (cls.subjectKey || null) as StarSubject | null);
  saveStageScene({ ...scene, class: { ...cls, settled: true, attended: true } });
  // 课上接的情缘节点（classBeats）：下课算演完，记完成（她定的：演完才推进）
  void import("./idol-romance-live").then(m => m.markPlayedBeatNodes([], false)).catch(() => undefined);
  // 下课结算后：先刷一遍剧情池条件（刚上完的课可能正好满足），再问有没有挂着的剧情
  let plotPremise: string | null = null;
  try {
    if (cls.preScene === "intro") {
      markIntroDone();
    } else {
      plotTick();
      const scenePlot = takeScenePlot(); // 初雪这种场景剧情优先
      const romanceBeat = scenePlot ? null : (await import("./idol-romance-live")).takeRomanceClassBeat(); // 情缘：练习室指导/公司偶遇/出道危机
      const plot = scenePlot ?? romanceBeat ?? await takeClassPlot(cls.subjectKey);
      if (plot) plotPremise = plot.premise;
      if (plot && "gain" in plot && plot.gain) lines.push(plot.gain as string);
    }
  } catch { /* 剧情池出错不影响下课 */ }
  if (plotPremise) {
    pushVnMessage({ sessionId: session.id, role: "assistant", rawContent: lines.join("\n"), chapterIndex });
  } else {
    lines.push("这节课结束了。");
    pushVnMessage({ sessionId: session.id, role: "assistant", rawContent: lines.join("\n"), chapterIndex });
    saveStageScene({ ...getStageScene(chId!)!, ended: true, endedAt: Date.now() });
    archiveChapter(session.id, chapterIndex);
  }
  return { lines, plotPremise };
}

function frameText(raw: string, role: string): string {
  const body = raw.replace(/（场外指令：[\s\S]*?）\s*$/, "").trim();
  if (!body) return "";
  const { frames } = parseVnResponse(body);
  const me = resolveUserIdentity(WORLD_CHAR_ID, "vn")?.name;
  return frames.filter(f => f.text).map(f => {
    if (role === "user") return f.speaker ? `她：「${f.text}」` : `她：${f.text}`;
    return f.speaker && f.speaker !== me ? `${f.speaker}：「${f.text}」` : f.text;
  }).join("\n");
}

/** 导出这一场戏的全文（剧本风，方便分享） */
export function exportSceneText(chapterIndex: number): string {
  const session = worldVnSession();
  const ch = session.chapters.find(c => c.index === chapterIndex);
  if (!ch) return "";
  const scene = getStageScene(ch.id);
  const her = herName();
  const lines: string[] = [];
  lines.push(`【${ch.title}】`);
  if (scene) lines.push(`${fmtWorld(scene.startAt)} · ${scene.place}`);
  lines.push("");
  for (const m of loadVnMessagesForChapter(session.id, chapterIndex)) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = frameText(m.rawContent, m.role)
      .replace(/^她：「/, `${her}：「`).replace(/^她：/, `${her}：`);
    if (!text.trim()) continue;
    lines.push(text, "");
  }
  return lines.join("\n").trim();
}

export function stageHost(chapterId: string): SceneHost | null {
  const session = worldVnSession();
  const ch = session.chapters.find(c => c.id === chapterId);
  if (!ch) return null;
  const get = () => getStageScene(chapterId);
  return {
    key: chapterId,
    meta: () => get(),
    saveMeta: m => { const cur = get(); if (cur) saveStageScene({ ...cur, ...m }); },
    ids: () => get()?.ids ?? [WORLD_CHAR_ID],
    setIds: ids => {
      const cur = get();
      if (!cur) return;
      // 新进来的人从正在写的这一段算起
      const seg = loadVnMessagesForChapter(session.id, ch.index).filter(m => m.role === "assistant").length;
      const spans = { ...(cur.spans ?? {}) };
      for (const id of ids) if (!cur.ids.includes(id) || spans[id]?.to !== undefined) spans[id] = { from: cur.ids.includes(id) ? spans[id]?.from ?? 0 : seg };
      saveStageScene({ ...cur, ids, spans });
    },
    transcript: () => loadVnMessagesForChapter(session.id, ch.index)
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => frameText(m.rawContent, m.role))
      .filter(Boolean)
      .join("\n\n"),
    witnessTranscript: id => {
      const span = get()?.spans?.[id] ?? { from: 0 };
      let segment = 0;
      return loadVnMessagesForChapter(session.id, ch.index)
        .filter(m => {
          if (m.role !== "user" && m.role !== "assistant") return false;
          const i = m.role === "assistant" ? segment++ : segment;
          return i >= span.from && (span.to === undefined || i <= span.to);
        })
        .map(m => frameText(m.rawContent, m.role)).filter(Boolean).join("\n\n");
    },
    fallbackPlace: get()?.place || "某个地方",
  };
}

export function chapterIdOf(chapterIndex: number): string | undefined {
  return worldVnSession().chapters[chapterIndex]?.id;
}

/** 这一章的场景提示：世界那套 + 场景 app 自己的格式规矩 */
export function buildStagePrompt(chapterIndex: number): string {
  const chId = chapterIdOf(chapterIndex);
  const scene = chId ? getStageScene(chId) : null;
  if (!scene) return "";
  const base = worldPromptFor(scene, scene.place, scene.ids);
  const places = allScenePlaces().filter(x => !placeLocked(x)).map(x => x.key);
  return [
    base,
    scene.avoid?.length ? `【这一场不出场的人】${scene.avoid.join("、")}：这一场绝对不让他们出现，也不要有人提到他们正在附近。` : "",
    stageWritingRules(scene, places),
  ].filter(Boolean).join("\n\n");
}

/** [离场:名字]：这个人走了，之后的段他不记得 */
export function markLeft(chapterIndex: number, names: string[]): void {
  const chId = chapterIdOf(chapterIndex);
  const cur = chId ? getStageScene(chId) : null;
  if (!cur || !names.length) return;
  const seg = loadVnMessagesForChapter(worldVnSession().id, chapterIndex).filter(m => m.role === "assistant").length;
  const spans = { ...(cur.spans ?? {}) };
  for (const c of loadAllCharacters().filter(c => names.includes(c.name) && cur.ids.includes(c.id))) spans[c.id] = { from: spans[c.id]?.from ?? 0, to: seg };
  saveStageScene({ ...cur, spans });
}

const LANG_RULE: Record<StageLang, string> = {
  zh: "- 语言：全部用中文写。",
  "ko-talk": "- 语言：旁白用中文。台词按人物背景、交谈对象和韩国场景选择韩语或母语，遵守上面的说话语言规则，不是中文的台词写成 名字|\"原文|简体中文译文\"，中文台词照常写。",
  "ko-all": "- 语言：旁白也用韩语写，每帧写成 \"韩语原文|简体中文译文\"（旁白不带名字，直接写这一句）。台词按人物背景、交谈对象和韩国场景选择韩语或母语，遵守上面的说话语言规则，不是中文的写成 名字|\"原文|简体中文译文\"。",
};

function stageWritingRules(scene: StageScene, places: string[]): string {
  const st = loadStageSettings();
  // 排队等出场的人：这场戏可以自然安排他们出场，不合适就这场不出场
  const pending = listPendingFaces();
  const pendingLine = pending.length
    ? `- 这些人在等出场：${pending.map(x => `${x.name}${x.role ? `（${x.role}）` : ""}`).join("、")}。这一场可以自然安排其中合适的人出场（自我介绍、搭个话、一起练习），时间地点不合适就这场不出场。\n`
    : "";
  const her = herName();
  const side = scene.side
    ? `- 这一场是番外：从在场人物自己的视角写他们的生活，${her}不一定在场。她没出现在这里时旁白不写她，也没人跟她说话。她的输入多半是「（场外指令：…）」，照着推进剧情。她也可能不在现场、通过 KakaoTalk 给某个人发消息：那是那个人手机上收到的消息，写他看到后的反应，她本人不出现在现场。她自己写了在场的对话或旁白，那就是她来了，照常用「你」称呼她。
- 不用停下来等她：每次把剧情往前写一段，停在一个自然的地方。新出场的人是他们本来认识或刚认识的人，跟${her}不认识。`
    : `- 整场戏都用「你」称呼${her}（第二人称）：旁白写到她时用「你」，不要用「她」称呼她；其他人物用名字或他/她（第三人称）。别人当面跟她说话时照常称呼她。`;
  return `【这一场的写法】（以这里为准，跟上面的漫卷格式冲突时听这里的）
${side}
- 这是一帧一帧往下走的场景，像文字冒险游戏。每次回复大约 ${st.words} 字，帧数不限。
- 一帧最多 55 个字，一两句就翻下一帧；一句话没说完可以下一帧接着写，不用凑满。
- 旁白写环境、动作、神态；每句台词单独一帧，写成 名字|"台词"。旁白里不许出现带引号的台词；动作写在台词前面的括号里，比如 名字|"（笑着）坐吧。"
- 说话的人写他自己的名字，绝不写「世界」；没名字的路人写身份（店员、经纪人、粉丝）。
- **绝不替${her}说话、不写她的动作和心理**。${scene.side ? "" : "写到需要你回应的地方就停，最后一帧落在别人的话或一个需要你反应的情况上。"}
- 剧情要自己往前走：别人有自己的目的和情绪，会主动开口、提要求、出状况，不要只是等你。
${scene.side ? "" : pendingLine}${LANG_RULE[st.lang]}${st.style.trim() ? `\n- 文风：${st.style.trim()}` : ""}
- 这一场不用立绘：<scene> 里不写 sprite。
- 有人离开这里了，回复最后另起一行写 [离场:名字]。
- 她发「（场外指令：…）」时那是她在场外跟你说话，照着安排剧情，不要让剧情里的人听到或回应这句话。
- 这一场要写小总结（跟上面说的禁止 <summary> 相反，以这里为准）：</content> 后面另起一行写 <summary>…</summary>。${summaryRule()}
- bg 写地点：只能从这些里选（写原样）：${places.join("、")}。还在原地就不写 bg；走去别处了，第一帧写新地点的 bg。
- ${scene.side ? `这一场发生在「${scene.place}」` : `${her}刚到「${scene.place}」`}${scene.premise ? `，这一场是：${scene.premise}` : ""}。${scene.open ? "这会儿谁在这里交给你按时间地点判断。" : ""}`;
}

/** 结束这一场：记账（关系、记忆、想走、视频、主线完成）+ 归档这一章 */
export async function closeStageScene(chapterIndex: number): Promise<SceneCloseResult> {
  const chId = chapterIdOf(chapterIndex);
  const host = chId ? stageHost(chId) : null;
  if (!host) throw new Error("找不到这一场");
  const res = await closeSceneWith(host);
  const sc = getStageScene(chId!);
  // 记下结束时间：判旷课要看戏有没有跨过上课时段
  if (sc) saveStageScene({ ...sc, endedAt: Date.now(), ...(sc.side ? { sideCounted: true } : {}) });
  archiveChapter(worldVnSession().id, chapterIndex);
  // 情缘：这场后面要接一场（失意之夜在宿舍、掉马他视角番外）
  let next: string | null = null;
  try { next = sc ? takeRomanceAfterScene(sc.place, Boolean(sc.side)) : null; } catch { /* 不挡收尾 */ }
  return next ? { ...res, next } : res;
}

/** 开场时切成番外 / 切回来：番外不用掉「!」，开头只留她自己写的；返回要还回去（或重新用掉）的「!」 */
export function setStageSide(chapterIndex: number, on: boolean): StageScene["taken"] | null {
  const chId = chapterIdOf(chapterIndex);
  const scene = chId ? getStageScene(chId) : null;
  if (!scene || scene.nodeId) return null;
  const taken = scene.taken ?? { premise: scene.premise };
  saveStageScene({ ...scene, side: on, taken, premise: on ? (taken.extra ?? "") : (taken.premise ?? scene.premise) });
  return taken;
}

/** 之前的番外新人误建了档、进了她的通讯录：清掉（她没见过、没加 KakaoTalk 的才清）。每个存档跑一次 */
export function cleanSideFaces(): number {
  if (kvGet("idol_side_faces_cleaned_v1")) return 0;
  let n = 0;
  void import("./idol-people").then(({ loadProfiles, deletePerson }) => import("./chat-storage").then(({ loadChatContacts }) => {
    const profiles = loadProfiles();
    const friends = new Set(loadChatContacts().map(c => c.characterId));
    const ids = Object.values(loadScenes()).filter(sc => sc.side).flatMap(sc => sc.newFaces ?? []);
    for (const id of new Set(ids)) {
      const p = profiles[id];
      if (!p || p.met || friends.has(id)) continue;
      deletePerson(id);
      n++;
    }
    kvSet("idol_side_faces_cleaned_v1", "1");
  })).catch(() => undefined);
  return n;
}

/** 番外演完不计入主线：不记账，只是归档 */
export function closeStageSideOnly(chapterIndex: number): void {
  const chId = chapterIdOf(chapterIndex);
  const scene = chId ? getStageScene(chId) : null;
  if (!scene) return;
  saveStageScene({ ...scene, ended: true, endedAt: Date.now(), sideCounted: false });
  archiveChapter(worldVnSession().id, chapterIndex);
}

/** 删掉一整场：戏的内容和每段小总结一起删（短期记忆里也就没了）。从提醒事项进来、还没演完的那件事照旧是「还没演」 */
export function deleteStageScene(chapterIndex: number): void {
  const chId = chapterIdOf(chapterIndex);
  if (!chId) return;
  for (const m of loadVnMessagesForChapter(worldVnSession().id, chapterIndex)) deleteVnMessage(m.id);
  const all = loadScenes();
  delete all[chId];
  kvSet(SCENES_KEY, JSON.stringify(all));
}

/** 还没结束的那几场（最近的在前） */
setDormSceneProbe(() => { try { return openStageScenes().some(x => /宿舍/.test(x.scene.place) && !x.scene.side); } catch { return false; } });

export function openStageScenes(): { chapterIndex: number; title: string; subtitle?: string; scene: StageScene }[] {
  const session = worldVnSession();
  return session.chapters
    .map(ch => ({ ch, scene: getStageScene(ch.id) }))
    .filter((x): x is { ch: typeof x.ch; scene: StageScene } => Boolean(x.scene && !x.scene.ended && !x.ch.archived))
    .reverse()
    .map(({ ch, scene }) => ({ chapterIndex: ch.index, title: ch.title, subtitle: ch.subtitle, scene }));
}

export function pastStageScenes(): { chapterIndex: number; title: string; subtitle?: string; scene: StageScene }[] {
  const session = worldVnSession();
  return session.chapters
    .map(ch => ({ ch, scene: getStageScene(ch.id) }))
    .filter((x): x is { ch: typeof x.ch; scene: StageScene } => Boolean(x.scene && (x.scene.ended || x.ch.archived)))
    .reverse()
    .map(({ ch, scene }) => ({ chapterIndex: ch.index, title: ch.title, subtitle: ch.subtitle, scene }));
}

// ── 别的 app 让这里开一场（提醒事项「去演」、横幅） ──

const PENDING_KEY = "idol_stage_pending_v1";
export const STAGE_OPEN_EVENT = "idol-stage-open";

export function requestStageForNode(nodeId: string): void {
  kvSet(PENDING_KEY, JSON.stringify({ nodeId }));
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "vnmode" } }));
  window.dispatchEvent(new Event(STAGE_OPEN_EVENT));
}

export function takePendingStage(): { nodeId: string } | null {
  try {
    const raw = JSON.parse(kvGet(PENDING_KEY) || "null");
    kvSet(PENDING_KEY, "null");
    return raw?.nodeId ? raw : null;
  } catch {
    return null;
  }
}

// ── 每段的小总结 ──

/** 这一章每段（AI 的每次回复）和它的小总结 */
export function chapterSummaries(chapterIndex: number): { id: string; at: string; summary: string; preview: string }[] {
  const session = worldVnSession();
  return loadVnMessagesForChapter(session.id, chapterIndex)
    .filter(m => m.role === "assistant")
    .map(m => ({ id: m.id, at: m.createdAt, summary: (m.summary ?? "").trim(), preview: frameText(m.rawContent, "assistant").replace(/\s+/g, " ").slice(0, 60) }));
}

export function editSummary(messageId: string, text: string): void {
  updateVnMessageSummary(messageId, text.trim());
}

/** 补写某一段的小总结（模型忘了写的时候） */
export async function writeSummaryFor(chapterIndex: number, messageId: string): Promise<string> {
  const session = worldVnSession();
  const msgs = loadVnMessagesForChapter(session.id, chapterIndex);
  const i = msgs.findIndex(m => m.id === messageId);
  if (i < 0) throw new Error("找不到这一段");
  const before = msgs.slice(Math.max(0, i - 1), i).filter(m => m.role === "user").map(m => frameText(m.rawContent, "user"));
  const text = [...before, frameText(msgs[i].rawContent, "assistant")].join("\n");
  const { apiConfig } = resolveVnConfigs(WORLD_CHAR_ID);
  const res = await simpleLLMCall(apiConfig, [
    { role: "system", content: summaryRule() },
    { role: "user", content: text },
  ], { temperature: 0.3, label: "此刻小总结" });
  const out = (res.content ?? "").replace(/<\/?summary>/g, "").trim();
  if (!out) throw new Error(res.error || "AI 没回");
  updateVnMessageSummary(messageId, out);
  return out;
}

export function summaryRule(): string {
  const me = herName();
  return `用两三句写这一段发生了什么：谁说了什么、做了什么，${me}说了什么、做了什么，气氛怎么变。所有人都用名字称呼（${me}也写名字，不写「她」「你」），写具体的话和动作，不写空泛的形容。只输出这段话。`;
}

/** 结束后：把这一场的小总结合成一段大总结，短期记忆里用它代替那些小的 */
export async function mergeSummaries(chapterIndex: number): Promise<string> {
  const chId = chapterIdOf(chapterIndex);
  const scene = chId ? getStageScene(chId) : null;
  if (!scene) throw new Error("找不到这一场");
  const parts = chapterSummaries(chapterIndex).map(x => x.summary).filter(Boolean);
  if (!parts.length) throw new Error("这一场还没有小总结");
  const { apiConfig } = resolveVnConfigs(WORLD_CHAR_ID);
  const res = await simpleLLMCall(apiConfig, [
    { role: "system", content: `把下面按顺序的几段小总结合成一段完整的总结，四到八句，保留关键的话、动作和关系变化，所有人都用名字称呼（${herName()}也写名字）。只输出这段话。` },
    { role: "user", content: `地点：${scene.place}\n${parts.join("\n")}` },
  ], { temperature: 0.3, label: "此刻大总结" });
  const out = (res.content ?? "").trim();
  if (!out) throw new Error(res.error || "AI 没回");
  saveStageScene({ ...scene, bigSummary: out });
  return out;
}

export function setBigSummary(chapterIndex: number, text: string | null): void {
  const chId = chapterIdOf(chapterIndex);
  const scene = chId ? getStageScene(chId) : null;
  if (!scene) return;
  const next = { ...scene };
  if (text?.trim()) next.bigSummary = text.trim(); else delete next.bigSummary;
  saveStageScene(next);
}

/** 短期记忆：她和这个人一起过的场景，每段小总结一条（跟剧情 app 一样）；合成过大总结的那一场只放大总结 */
export function loadStageProjectionEntries(characterId: string, options?: { afterTimestamp?: string }): { id: string; timestamp: string; content: string }[] {
  const all = loadScenes();
  const session = worldVnSession();
  const out: { id: string; timestamp: string; content: string }[] = [];
  for (const ch of session.chapters) {
    const sc = all[ch.id];
    if (!sc || !sc.ids.includes(characterId) || (sc.side && !sc.sideCounted)) continue;
    const msgs = loadVnMessagesForChapter(session.id, ch.index).filter(m => m.role === "assistant");
    const push = (id: string, ts: string, text: string) => {
      if (options?.afterTimestamp && ts <= options.afterTimestamp) return;
      out.push({ id, timestamp: ts, content: `[事件 ${formatChatTimestamp(ts)}] 在${sc.place}：${text}` });
    };
    if (sc.bigSummary) {
      push(`stage_projection_${ch.id}`, msgs[msgs.length - 1]?.createdAt ?? new Date(sc.startAt).toISOString(), sc.bigSummary);
      continue;
    }
    const span = sc.spans?.[characterId] ?? { from: 0 };
    msgs.forEach((m, i) => {
      if (i < span.from || (span.to !== undefined && i > span.to)) return;
      if (m.summary?.trim()) push(`stage_projection_${m.id}`, m.createdAt, m.summary.trim());
    });
  }
  return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** 补卡用：这个人在此刻各场戏里的原文（他说的话、写到他的旁白，连着她前一句），第一场必带，其余从最近往前，总长约 max 字 */
export function personSceneText(characterId: string, name: string, max = 4000): string {
  const all = loadScenes();
  const session = worldVnSession();
  const blocks: string[] = [];
  for (const ch of session.chapters) {
    const sc = all[ch.id];
    if (!sc || !(sc.ids.includes(characterId) || sc.newFaces?.includes(name)) || (sc.side && !sc.sideCounted)) continue;
    const msgs = loadVnMessagesForChapter(session.id, ch.index);
    const lines: string[] = [];
    let prev = "";
    for (const m of msgs) {
      for (const line of frameText(m.rawContent, m.role).split("\n")) {
        if (!line.trim()) continue;
        if (m.role === "assistant" && line.includes(name)) {
          if (prev && !lines.includes(prev)) lines.push(prev);
          lines.push(line);
        }
        prev = m.role === "user" ? line : "";
      }
    }
    if (lines.length) blocks.push(`【${fmtWorld(sc.startAt)} 在${sc.place}】\n${lines.join("\n")}`);
  }
  if (!blocks.length) return "";
  const picked = [blocks[0]];
  let used = blocks[0].length;
  const rest: string[] = [];
  for (let i = blocks.length - 1; i > 0; i--) {
    if (used + blocks[i].length > max) continue;
    rest.unshift(blocks[i]);
    used += blocks[i].length;
  }
  return [...picked, ...rest].join("\n\n").slice(0, max + 2000);
}

// ── AI 写出来以后代码兜底：台词写进旁白的拆出来，太长的旁白在句号处切开 ──

const QUOTE = /[「“"『]/;
function splitLong(line: string, max = 55): string[] {
  if (line.length <= max + 10) return [line];
  const parts = line.match(/[^。！？!?…]+[。！？!?…」”"』]*/g) ?? [line];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && (cur + p).length > max) { out.push(cur); cur = p; } else cur += p;
  }
  if (cur) out.push(cur);
  return out;
}

/** 「韩智元笑着说：『坐吧。』」→ 韩智元|"（笑着）坐吧。"；超过 55 字的旁白切成几帧 */
export function normalizeStageRaw(raw: string): string {
  const names = loadAllCharacters().map(c => c.name).filter(n => n && n.length <= 8).sort((a, b) => b.length - a.length);
  return raw.replace(/(<scene[^>]*>)([\s\S]*?)(<\/scene>)/gi, (_, open: string, body: string, close: string) => {
    const lines = body.split("\n").flatMap(l => {
      const t = l.trim();
      if (!t) return [];
      if (/^[^|｜]{1,12}[|｜]["“「]/.test(t)) return [t];
      const who = names.find(n => t.startsWith(n));
      if (who) {
        const m = t.slice(who.length).match(/^([^：:「“"『]{0,14}?)(?:说道|说|道|问|喊|笑道|开口)?[：:，,]?\s*[「“"『](.+)[」”"』]$/);
        if (m && !QUOTE.test(m[2])) {
          const act = m[1].replace(/[，,\s]+$/, "").trim();
          return [`${who}|"${act ? `（${act}）` : ""}${m[2]}"`];
        }
      }
      if (/["“”]/.test(t) && t.includes("|")) return [t];
      return splitLong(t);
    });
    return `${open}\n${lines.join("\n")}\n${close}`;
  });
}
