/**
 * 爱豆小手机的剧情：一场一场的戏，她是主角。
 *
 * 一场戏 = 地点 + 开始的世界时间 + 在场的人 + 来回的文字。
 * AI 写旁白和别人的言行，回复末尾带隐藏记号：
 *   [新人:名字|一句话身份]  名单外、有名字的人出场 → 代码先存成背景人物
 *   [时间:+N分钟]           戏里过了多久 → 拨世界时钟
 *   [收尾]                  这场自然收尾了 → 提醒她可以结束
 * 她用 $ 开头的话是跟系统说话：能直接办的（跳时间）代码办，其余当场外指令给 AI，不算台词、不进记忆。
 * 一场结束时给每个在场的人记一笔「你们的事」，第一次见面的写上第一印象，主要人物再存一条长期记忆。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCharacters } from "./character-storage";
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding, resolveUserIdentity } from "./settings-storage";
import { composePersona, createPerson, emptyProfile, fmtDay, getProfile, saveProfile } from "./idol-people";
import { describeTrainee, loadTraineeCard } from "./trainee-card";
import { shiftWorldTime, setWorldTime } from "./world-clock";
import { saveMemoryEntry } from "./memory-storage";

const KEY = "idol_scenes_v1";
export const SCENES_EVENT = "idol-scenes-changed";

export type SceneLine = {
  id: string;
  role: "me" | "story" | "ooc" | "sys";
  text: string;
  at: number; // 世界时间
};

export type Scene = {
  id: string;
  place: string;
  premise: string;
  startAt: number;
  peopleIds: string[];
  lines: SceneLine[];
  ended: boolean;
  summary?: string;
  /** 这场里冒出来的新面孔，给她看小条 */
  newFaces: string[];
};

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function loadScenes(): Scene[] {
  try {
    const raw = JSON.parse(kvGet(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveScenes(list: Scene[]) {
  kvSet(KEY, JSON.stringify(list));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SCENES_EVENT));
}

export function getScene(id: string): Scene | undefined {
  return loadScenes().find(s => s.id === id);
}

export function saveScene(scene: Scene): void {
  const list = loadScenes();
  const i = list.findIndex(s => s.id === scene.id);
  if (i >= 0) list[i] = scene;
  else list.unshift(scene);
  saveScenes(list);
}

export function deleteScene(id: string): void {
  saveScenes(loadScenes().filter(s => s.id !== id));
}

export function newScene(place: string, premise: string, peopleIds: string[]): Scene {
  const scene: Scene = { id: uid("scene"), place: place.trim() || "某个地方", premise: premise.trim(), startAt: Date.now(), peopleIds, lines: [], ended: false, newFaces: [] };
  saveScene(scene);
  return scene;
}

export function line(role: SceneLine["role"], text: string): SceneLine {
  return { id: uid("ln"), role, text, at: Date.now() };
}

// ── 时间 ──

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
export function fmtWorld(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const CN_NUM: Record<string, number> = { 半: 0.5, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function parseNum(s: string): number | null {
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s in CN_NUM) return CN_NUM[s];
  if (/^十[一二三四五六七八九]$/.test(s)) return 10 + CN_NUM[s[1]];
  if (/^[二三四五六七八九]十$/.test(s)) return CN_NUM[s[0]] * 10;
  return null;
}
const UNIT_MS: Record<string, number> = { 分钟: 60e3, 分: 60e3, 小时: 3600e3, 个小时: 3600e3, 钟头: 3600e3, 天: 864e5, 日: 864e5, 周: 7 * 864e5, 星期: 7 * 864e5, 个星期: 7 * 864e5, 个月: 30 * 864e5, 月: 30 * 864e5 };

/** 代码能直接办的 $ 指令（跳时间）。办了返回给她看的一句话，办不了返回 null */
export function runTimeCommand(cmd: string): string | null {
  const t = cmd.replace(/^\$\s*/, "").trim();
  const m = t.match(/^(?:过|过了|往后|快进)\s*(\d+(?:\.\d+)?|半|[一两二三四五六七八九十]{1,2})\s*(个小时|小时|钟头|分钟|分|天|日|个星期|星期|周|个月|月)/);
  if (m) {
    const n = parseNum(m[1]);
    if (n != null) {
      shiftWorldTime(n * UNIT_MS[m[2]]);
      return `过了${m[1]}${m[2]}`;
    }
  }
  const now = new Date();
  if (/^(跳到)?(明天|第二天)(早上|早晨)?/.test(t)) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0);
    setWorldTime(d.getTime());
    return "到第二天早上 8 点了";
  }
  const w = t.match(/^(?:跳到)?(?:下)?(?:周|星期)([一二三四五六日天])/);
  if (w) {
    const target = "日一二三四五六".indexOf(w[1] === "天" ? "日" : w[1]);
    let add = (target - now.getDay() + 7) % 7;
    if (add === 0) add = 7;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, 9, 0, 0);
    setWorldTime(d.getTime());
    return `到星期${w[1]}早上 9 点了`;
  }
  return null;
}

// ── AI ──

function chatConfig() {
  const slot = resolveBinding(loadBindingConfig(), undefined, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) throw new Error("还没配置 API，先去设置里配一个");
  return config;
}

function whoIsShe(): string {
  const card = loadTraineeCard();
  if (card) return describeTrainee(card);
  const me = resolveUserIdentity();
  return me ? `${me.name}。${me.bio || ""}` : "一个想当爱豆的女生。";
}

const WRITING_RULES = `写法：
- 你写旁白和除她以外所有人的言行。不替她说话、不替她做决定、不写她的心理。
- 人说话要口语，可以有语气词、停顿、跑题；先说结果再说原因；不用「虽然…但是」「由于…因此」「不是…而是」这类书面句式。
- 动作描写克制，只写跟对话有关的，不拆解微小动作，不写油腻描写，不写过度精确的数字。
- 心理活动留白，不写结尾升华。
- 每段不超过三四行。
- 有人被问到就必须回应。
- 人物是正常人：不面瘫、不病弱、不高冷，可以笨拙，但不幼态化。
- 只写在场的人；不在场的人可以被提到，不能出场说话，除非写他进来了。
- 结果跟着她写的走，她认真做了的事不能硬说她没做好；挫折要有剧情里的具体原因。
- 写到下一个需要她反应的地方就停。`;

const TAG_RULES = `回复最后另起一行写标记（她看不到，没有就不写）：
- 名单里没有、但这次出场并且有名字的人：[新人:名字|一句话身份]
- 戏里过去了一段时间：[时间:+N分钟]
- 这一场已经自然收尾：[收尾]`;

function peopleBlock(ids: string[]): string {
  const chars = loadCharacters();
  return ids.map(id => {
    const c = chars.find(x => x.id === id);
    if (!c) return "";
    const p = getProfile(id);
    return `## ${c.name}\n${composePersona(p) || "（还没写设定）"}`;
  }).filter(Boolean).join("\n\n");
}

export type StoryReply = { text: string; newFaces: { name: string; role: string }[]; minutes: number; closing: boolean; facts: string[] };

export function parseReply(raw: string): StoryReply {
  const newFaces: { name: string; role: string }[] = [];
  let minutes = 0;
  let closing = false;
  const facts: string[] = [];
  const text = raw
    .replace(/\[公司[:：]\s*([^\]]+)\]/g, (_, f: string) => { facts.push(f.trim()); return ""; })
    .replace(/\[新人[:：]\s*([^|｜\]]+)[|｜]?([^\]]*)\]/g, (_, n: string, r: string) => { newFaces.push({ name: n.trim(), role: (r || "").trim() }); return ""; })
    .replace(/\[时间[:：]\s*\+?\s*(\d+)\s*(分钟|小时)?\]/g, (_, n: string, u: string) => { minutes += Number(n) * (u === "小时" ? 60 : 1); return ""; })
    .replace(/\[收尾\]/g, () => { closing = true; return ""; })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, newFaces, minutes, closing, facts };
}

export async function continueScene(scene: Scene): Promise<StoryReply> {
  const chars = loadCharacters();
  const names = scene.peopleIds.map(id => chars.find(c => c.id === id)?.name).filter(Boolean);
  const system = [
    "你在写一出以韩国娱乐圈为背景的戏，主角是「她」（用户）。",
    `【她是谁】\n${whoIsShe()}`,
    `【这一场】\n开始时间：${fmtWorld(scene.startAt)}\n现在：${fmtWorld(Date.now())}\n地点：${scene.place}${scene.premise ? `\n开头：${scene.premise}` : ""}`,
    `【在场的人】${names.length ? names.join("、") : "暂时只有她"}\n\n${peopleBlock(scene.peopleIds)}`,
    WRITING_RULES,
    TAG_RULES,
  ].join("\n\n");
  const recent = scene.lines.slice(-40);
  const messages: { role: string; content: string }[] = [{ role: "system", content: system }];
  for (const l of recent) {
    if (l.role === "story") messages.push({ role: "assistant", content: l.text });
    else if (l.role === "me") messages.push({ role: "user", content: l.text });
    else if (l.role === "ooc") messages.push({ role: "user", content: `（场外指令，不是戏里的话，照着调整接下来的写法）${l.text.replace(/^\$\s*/, "")}` });
  }
  if (messages[messages.length - 1].role !== "user") {
    messages.push({ role: "user", content: recent.length ? "（接着写）" : "（开场：写她到了这里看到的情形，写到需要她反应的地方停）" });
  }
  const res = await simpleLLMCall(chatConfig(), messages, { temperature: 0.9, label: "剧情" });
  if (!res.content) throw new Error(res.error || "AI 没回");
  return parseReply(res.content);
}

/** 新面孔：名单外有名字的人，先存成背景人物（见过了、在这里认识） */
export function addNewFaces(scene: Scene, faces: { name: string; role: string }[]): string[] {
  const chars = loadCharacters();
  const added: string[] = [];
  for (const f of faces) {
    if (!f.name || f.name.length > 12) continue;
    const exist = chars.find(c => c.name === f.name);
    if (exist) {
      if (!scene.peopleIds.includes(exist.id)) scene.peopleIds.push(exist.id);
      continue;
    }
    const char = createPerson(f.name, {
      ...emptyProfile(""),
      layer: "background",
      role: f.role,
      met: true,
      metAt: { at: Date.now(), place: scene.place },
    });
    scene.peopleIds.push(char.id);
    scene.newFaces.push(char.id);
    added.push(char.name);
  }
  return added;
}

/** 这场结束：每个在场的人记一笔，第一次见的写第一印象，主要人物存长期记忆 */
export async function closeScene(scene: Scene): Promise<string> {
  const chars = loadCharacters();
  const present = scene.peopleIds.map(id => chars.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const transcript = scene.lines
    .filter(l => l.role === "me" || l.role === "story")
    .map(l => (l.role === "me" ? `她：${l.text}` : l.text))
    .join("\n\n")
    .slice(-12000);
  let summary = "";
  if (present.length && transcript) {
    const firstMeet = present.filter(c => !getProfile(c.id).withYou).map(c => c.name);
    const res = await simpleLLMCall(chatConfig(), [
      { role: "system", content: `把这场戏记下来。只输出 JSON：{"summary":"这场戏两三句","people":[{"name":"","event":"站在这个人的角度，这场里他和她之间发生了什么，一句话；没交集就写空","impression":"只给第一次见她的人写：他对她的第一印象，一两句；其他人写空"}]}\n第一次见她的人：${firstMeet.join("、") || "无"}` },
      { role: "user", content: `地点：${scene.place}\n在场：${present.map(c => c.name).join("、")}\n\n${transcript}` },
    ], { temperature: 0.4, label: "剧情记账" });
    if (res.content) {
      try {
        const j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { summary?: string; people?: { name?: string; event?: string; impression?: string }[] };
        summary = String(j.summary ?? "");
        for (const item of j.people ?? []) {
          const c = present.find(x => x.name === item.name);
          if (!c) continue;
          const p = getProfile(c.id);
          const event = String(item.event ?? "").trim();
          const next = { ...p, met: true, metAt: p.metAt ?? { at: scene.startAt, place: scene.place } };
          if (event) next.events = [...p.events, { id: uid("ev"), at: scene.startAt, place: scene.place, text: event }];
          if (!p.withYou && item.impression) next.withYou = String(item.impression);
          saveProfile(next);
          if (event && p.layer === "main") {
            const now = new Date().toISOString();
            await saveMemoryEntry({
              id: uid(`scene_mem_${c.id}`),
              characterId: c.id,
              sourceApp: "story",
              type: "long_term",
              content: `${fmtDay(scene.startAt)}在${scene.place}：${event}`,
              importance: 0.6,
              createdAt: now,
              updatedAt: now,
              metadata: { origin: "idol_scene", sceneId: scene.id },
            }).catch(() => undefined);
          }
        }
      } catch { /* 记账失败不挡着结束 */ }
    }
  }
  saveScene({ ...scene, ended: true, summary });
  return summary;
}
