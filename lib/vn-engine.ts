import { loadAllCharacters as loadCharacters } from "./character-storage";
import {
  loadBindingConfig,
  loadApiConfigs,
  loadPresets,
  loadRegexes,
  loadWorldBooks,
  resolveBinding,
  resolveUserIdentity,
  resolveAuxiliaryApiConfig,
} from "./settings-storage";
import type { ApiConfig, PresetConfig, RegexConfig, WorldBookConfig } from "./settings-types";
import { assemblePromptPayload, type LLMMessage } from "./llm-prompt-assembler";
import { previewMessagesForApi, sendLLMRequest, ChatEngineError } from "./chat-engine";
import { loadMemoryConfig } from "./memory-storage";
import { retrieveCoreMemoriesForPrompt, retrieveMemoriesForPrompt } from "./memory-service";
import { formatCoreMemories, formatLongTermMemories } from "./memory-injector";
import { prepareShortTermContext } from "./short-term-assembler";
import { buildCalendarScheduleMarker } from "./calendar-storage";
import { getWeekStartIso } from "./calendar-utils";
import { parseVnResponse } from "./vn-parser";
import type { VnMessage } from "./vn-storage";
import { createOrGetVnSession, formatBeatsForPrompt, loadVnConfig } from "./vn-storage";
import { DEFAULT_VN_BILINGUAL_PROMPT, resolveBilingualPrompt } from "./bilingual-prompt-defaults";

export const DEFAULT_VN_SUMMARY_PROMPT = "以下是{{char}}与{{user}}在漫卷模式中的一章对话。请用200字以内的中文总结这一章的关键剧情、关系变化和情感走向。";
import { getVnSceneNames, getVnSpriteNames } from "./vn-asset-storage";
import type { ChatMessage } from "./chat-storage";
import type { VnFrame, VnOptions } from "./vn-types";
import { simpleLLMCall } from "./api-helpers";
import { WORLD_CHAR_ID, applySceneTagsTo, extractSceneTags } from "./idol-world";
import { allScenePlaces, buildStagePrompt, chapterIdOf, markLeft, normalizeStageRaw, stageHost } from "./idol-stage";

export type VnGenerationResult = {
  rawText: string;
  frames: VnFrame[];
  options: VnOptions | null;
  promptMessages: LLMMessage[];
  model: string;
  presetName: string;
  /** 场景 app（「世界」）：新加的人、给她看的提示、这一场是不是收尾了 */
  idol?: { added: string[]; notes: string[]; closing: boolean };
  /** 场景 app：这一段的小总结 */
  summary?: string;
};

function buildVnBilingualInstruction(enabled: boolean, customPrompt?: string): string {
  return resolveBilingualPrompt(enabled, customPrompt, DEFAULT_VN_BILINGUAL_PROMPT);
}

function toHistoryMessage(message: VnMessage): ChatMessage {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.rawContent,
    status: "sent",
    createdAt: message.createdAt,
  };
}

export function resolveVnConfigs(characterId: string): {
  apiConfig: ApiConfig;
  preset: PresetConfig | null;
  regexes: RegexConfig[];
  worldBooks: WorldBookConfig[];
} {
  const character = loadCharacters().find((c) => c.id === characterId);
  if (!character) {
    throw new ChatEngineError(`Character not found: ${characterId}`);
  }

  const bindings = loadBindingConfig();
  const activeSlot = resolveBinding(bindings, characterId, "vn");
  if (!activeSlot.apiConfigId) {
    throw new ChatEngineError(
      `No API Configuration bound for ${character.name}. Please go to Settings -> 绑定管理 -> 漫卷 to assign one.`
    );
  }

  const apiConfig = loadApiConfigs().find((c) => c.id === activeSlot.apiConfigId);
  if (!apiConfig) {
    throw new ChatEngineError(`API Configuration not found for ${character.name}.`);
  }

  const presets = loadPresets();
  let preset = activeSlot.presetId
    ? presets.find((p) => p.id === activeSlot.presetId) || null
    : null;
  if (!preset) {
    preset = presets.find((p) => p.builtIn) ?? null;
  }

  const allRegexes = loadRegexes();
  const regexes = (activeSlot.regexIds || [])
    .map((id) => allRegexes.find((r) => r.id === id))
    .filter(Boolean) as RegexConfig[];

  const allWorldBooks = loadWorldBooks();
  const worldBooks = (activeSlot.worldBookIds || [])
    .map((id) => allWorldBooks.find((wb) => wb.id === id))
    .filter(Boolean) as WorldBookConfig[];

  return { apiConfig, preset, regexes, worldBooks };
}

export async function generateVnCompletion(
  characterId: string,
  history: VnMessage[],
  opts?: { retryHint?: string },
): Promise<VnGenerationResult> {
  const character = loadCharacters().find((c) => c.id === characterId);
  if (!character) {
    throw new ChatEngineError(`Character not found: ${characterId}`);
  }

  const { apiConfig, preset, regexes, worldBooks } = resolveVnConfigs(characterId);
  // 「世界」的场景：一章就是一场戏，只带这一章
  const isWorld = characterId === WORLD_CHAR_ID;
  const sceneChapter = history[history.length - 1]?.chapterIndex;
  const ctx = isWorld ? history.filter(m => m.chapterIndex === sceneChapter) : history;
  const llmMessages = await buildVnPromptMessages(characterId, ctx, preset, regexes, worldBooks, isWorld ? sceneChapter : undefined);
  // 重 roll 的修正要求：只跟这一次走，不存
  if (opts?.retryHint?.trim()) {
    llmMessages.push({ role: "system", content: `重新写这一段：她对刚才那版不满意，这次按她的要求来：${opts.retryHint.trim()}。直接按要求重新写，不要在剧情里提到这条要求。` });
  }

  let rawOutput = await sendLLMRequest(apiConfig, preset, llmMessages, regexes, {
    characterName: character.name,
  }, {
    appId: "vn",
    appTags: ["vn"],
  });

  let idol: VnGenerationResult["idol"];
  let summary: string | undefined;
  if (isWorld && sceneChapter !== undefined) {
    const left = [...rawOutput.matchAll(/\[离场[:：]\s*([^\]]+)\]/g)].map(m => m[1].trim());
    rawOutput = rawOutput.replace(/\[离场[:：][^\]]*\]/g, "");
    const sm = rawOutput.match(/<summary>([\s\S]*?)<\/summary>/i);
    if (sm) summary = sm[1].trim();
    rawOutput = rawOutput.replace(/<summary>[\s\S]*?<\/summary>/gi, "").trim();
    const ex = extractSceneTags(rawOutput);
    rawOutput = ex.text;
    const chId = chapterIdOf(sceneChapter);
    const host = chId ? stageHost(chId) : null;
    idol = { ...(host ? applySceneTagsTo(host, ex.tags, ex.text) : { added: [], notes: [] }), closing: ex.tags.closing };
    rawOutput = normalizeStageRaw(rawOutput);
    // 认识的人开口说话了但 AI 忘了写 [出场]：也算进这一场
    if (host) {
      const speakers = new Set(parseVnResponse(rawOutput).frames.map(f => f.speaker).filter(Boolean) as string[]);
      const ids = host.ids();
      const join = loadCharacters().filter(c => speakers.has(c.name) && !ids.includes(c.id) && c.id !== WORLD_CHAR_ID).map(c => c.id);
      if (join.length) host.setIds([...ids, ...join]);
    }
    if (left.length) markLeft(sceneChapter, left);
  }

  const parsed = parseVnResponse(rawOutput);
  return {
    idol,
    summary,
    rawText: parsed.rawText,
    frames: parsed.frames,
    options: parsed.options,
    promptMessages: llmMessages,
    model: apiConfig.defaultModel,
    presetName: preset?.name || "默认预设",
  };
}

async function buildVnPromptMessages(
  characterId: string,
  history: VnMessage[],
  preset: PresetConfig | null,
  regexes: RegexConfig[],
  worldBooks: WorldBookConfig[],
  stageChapter?: number,
): Promise<LLMMessage[]> {
  const character = loadCharacters().find((c) => c.id === characterId);
  if (!character) {
    throw new ChatEngineError(`Character not found: ${characterId}`);
  }

  const userIdentity = resolveUserIdentity(characterId, "vn");
  const historyMessages = history.map(toHistoryMessage);
  const memConfig = loadMemoryConfig();
  const { recentBlocks, truncatedHistory, wbActivationContext, unifiedRecentItems } = prepareShortTermContext(
    characterId,
    "vn",
    { userName: userIdentity?.name ?? "用户", history: historyMessages }
  );

  // 此刻的语言规矩在 buildStagePrompt 里，不用漫卷原来的双语规则
  const chatBilingualInstruction = stageChapter !== undefined ? "" : buildVnBilingualInstruction(
    loadVnConfig("bilingualTranslationEnabled") !== "0",
    loadVnConfig("bilingualTranslationPrompt"),
  );
  const [memories, coreMemories] = await Promise.all([
    retrieveMemoriesForPrompt(characterId, wbActivationContext, memConfig).catch(() => null),
    retrieveCoreMemoriesForPrompt(characterId, memConfig).catch(() => null),
  ]);

  const isStage = stageChapter !== undefined;
  const messages = assemblePromptPayload({
    character,
    history: truncatedHistory,
    preset,
    worldBooks,
    regexes,
    userIdentity,
    appId: "vn",
    scheduleSummary: buildCalendarScheduleMarker("character", characterId, getWeekStartIso(new Date())),
    coreMemories: coreMemories ? formatCoreMemories(coreMemories) : "",
    longTermMemories: memories ? formatLongTermMemories(memories) : "",
    worldBookActivationContext: wbActivationContext,
    recentBlocks,
    unifiedRecentItems,
    chatBilingualInstruction,
    vnScenes: isStage ? allScenePlaces().map(x => x.key).join("、") : getVnSceneNames(characterId),
    vnSprites: isStage ? "（这一场不用立绘，sprite 不写）" : getVnSpriteNames(characterId),
    ...(() => {
      const sess = createOrGetVnSession(characterId);
      const ch = sess.chapters[sess.activeChapterIndex];
      if (!ch) return {};
      const { beatsList, currentBeat } = formatBeatsForPrompt(ch);
      return { vnBeats: beatsList, vnCurrentBeat: currentBeat };
    })(),
  });
  if (isStage) messages.push({ role: "system", content: buildStagePrompt(stageChapter) });
  return messages;
}

export type VnPreviewResult = {
  messages: LLMMessage[];
  characterName: string;
  model: string;
  presetName: string;
};

export async function previewVnPromptPayload(
  characterId: string,
  history: VnMessage[]
): Promise<VnPreviewResult> {
  const character = loadCharacters().find((c) => c.id === characterId);
  if (!character) {
    throw new ChatEngineError(`Character not found: ${characterId}`);
  }
  const { apiConfig, preset, regexes, worldBooks } = resolveVnConfigs(characterId);
  const isWorld = characterId === WORLD_CHAR_ID;
  const sceneChapter = history[history.length - 1]?.chapterIndex;
  const ctx = isWorld ? history.filter(m => m.chapterIndex === sceneChapter) : history;
  const llmMessages = await buildVnPromptMessages(characterId, ctx, preset, regexes, worldBooks, isWorld ? sceneChapter : undefined);
  return {
    messages: previewMessagesForApi(apiConfig, preset, llmMessages),
    characterName: character.name,
    model: apiConfig.defaultModel,
    presetName: preset?.name || "默认预设",
  };
}

export async function summarizeVnChapter(
  characterId: string,
  messages: VnMessage[]
): Promise<string> {
  const apiConfig = resolveAuxiliaryApiConfig("memorySummaryApiConfigId");
  if (!apiConfig) {
    throw new ChatEngineError("未配置记忆总结 API（请在绑定配置 → 辅助API绑定中设置）");
  }

  const character = loadCharacters().find((c) => c.id === characterId);
  const charName = character?.name ?? "角色";
  const userIdentity = resolveUserIdentity(characterId, "vn");
  const userName = userIdentity?.name ?? "用户";
  const memConfig = loadMemoryConfig();
  const customPrompt = memConfig.vnSummaryPrompt?.trim() || DEFAULT_VN_SUMMARY_PROMPT;
  const resolvedPrompt = customPrompt
    .replace(/\{\{char(?:Name)?\}\}/g, charName)
    .replace(/\{\{user(?:Name)?\}\}/g, userName);

  // Build conversation text
  const lines = messages.map((m) => {
    const role = m.role === "user" ? userName : m.role === "assistant" ? charName : "system";
    return `${role}: ${m.rawContent}`;
  });

  const prompt = [
    resolvedPrompt,
    "",
    lines.join("\n\n"),
  ].join("\n");

  const result = await simpleLLMCall(apiConfig, [{ role: "user", content: prompt }], {
    temperature: 0.3,
    max_tokens: 500,
  });

  if (result.error || !result.content) {
    throw new ChatEngineError(result.error || "章节总结生成失败");
  }

  return result.content;
}
