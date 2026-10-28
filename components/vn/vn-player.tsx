"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, RefreshCw, ArrowLeft, ArrowRight, Clock, EyeOff, Play, Pause, Volume2, VolumeX, Music2, Square, NotebookPen, Eye, ChevronDown, Send, MessageSquare, BookOpen, Archive, MapPin, RotateCcw, ListOrdered, Plus, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { BilingualTextBlock } from "@/components/chat/message-bubble";
import {
  createOrGetVnSession,
  loadVnMessages,
  loadVnMessagesForChapter,
  pushVnMessage,
  updateChapterStartMessageId,
  archiveChapter,
  deleteVnMessage,
  deleteVnMessagesFrom,
  editVnMessage,
  updateVnMessageFrameAudio,
  updateChapterBeats,
  setActiveBeatIndex,
  loadVnConfig,
} from "@/lib/vn-storage";
import type { VnFrameAudio, VnMessage } from "@/lib/vn-types";
import { generateVnCompletion } from "@/lib/vn-engine";
import { parseVnResponse, packageUserInput, packageMultiActions } from "@/lib/vn-parser";
import { resolveVnAssetMap, loadVnScenes, getVnSceneLayout, getVnSpriteLayout } from "@/lib/vn-asset-storage";
import { resolveUserIdentity } from "@/lib/settings-storage";
import type { VnFrame, VnOptions, VnBeat } from "@/lib/vn-types";
import { splitBilingualText } from "@/lib/bilingual-text";
import { loadStageSettings, placeByKey, saveStageSettings, addBackground, addCustomPlace, allMaps, pickBackground, placeBackgrounds, resolveStageBgMap, thumbsOf, chapterIdOf, chapterSummaries, closeStageScene, editSummary, getStageScene, mergeSummaries, placeLocked, setBigSummary, writeSummaryFor } from "@/lib/idol-stage";
import { jumpWorld } from "@/lib/idol-reminders";
import { fmtWorld } from "@/lib/idol-scenes";
import { subscribeWorldClock } from "@/lib/world-clock";
import type { SceneCloseResult } from "@/lib/idol-world";
import { worldWeatherLabel } from "@/lib/idol-weather";
import { StageMusicPanel } from "./stage-music-panel";
import { loadBgmMuted, saveBgmMuted, useStageBgm } from "./stage-bgm";
import { forgetRetryHint, loadRetryHints, rememberRetryHint } from "@/lib/reply-versions";
import { playAudioBlobViaMediaElement, resolveVoiceConfig, synthesizeSpeech, unlockAudioPlayback } from "@/lib/tts-service";

interface VnPlayerProps {
  characterId: string;
  chapterIndex: number;
  onClose: () => void;
  onChapterEnd: () => void;
  vnTheme?: string;
  /** 场景 app：「世界」的一场戏（一章 = 一场） */
  stage?: boolean;
  onStageReplay?: () => void;
}

type AssetLoadStatus = "ready" | "failed";

function tagFramesWithMessage(frames: VnFrame[], message: VnMessage): VnFrame[] {
  return frames.map((frame, index) => ({
    ...frame,
    sourceMessageId: message.id,
    sourceFrameIndex: index,
    sourceRole: message.role,
    sourceCreatedAt: message.createdAt,
    voiceAudio: message.frameAudio?.[index],
  }));
}

function buildFramesFromMessages(messages: VnMessage[]): { frames: VnFrame[]; lastOptions: VnOptions | null } {
  const frames: VnFrame[] = [];
  let lastOptions: VnOptions | null = null;
  for (const message of messages) {
    // 场外指令不播
    const raw = stripDirector(message.rawContent);
    if (!raw.trim()) continue;
    const parsed = parseVnResponse(raw);
    frames.push(...tagFramesWithMessage(parsed.frames, message));
    if (message.role === "assistant") lastOptions = parsed.options;
  }
  return { frames, lastOptions };
}

const DIRECTOR_RE = /（场外指令：[\s\S]*?）\s*$/;
function stripDirector(raw: string): string {
  return raw.replace(DIRECTOR_RE, "").trim();
}
function directorOf(raw: string): string {
  return raw.match(/（场外指令：([\s\S]*?)）\s*$/)?.[1] ?? "";
}

function getFrameVoiceKey(frame: VnFrame | null | undefined): string | null {
  if (!frame?.sourceMessageId || frame.sourceFrameIndex == null) return null;
  return `${frame.sourceMessageId}:${frame.sourceFrameIndex}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("音频转换失败"));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function VnPlayer({ characterId, chapterIndex, onClose, onChapterEnd, vnTheme, stage, onStageReplay }: VnPlayerProps) {
  const stageScene = useMemo(() => (stage ? getStageScene(chapterIdOf(chapterIndex) ?? "") : null), [stage, chapterIndex]);
  const [stageOpening, setStageOpening] = useState(false);
  const [stageEnd, setStageEnd] = useState<null | "working" | SceneCloseResult | { error: string }>(null);
  const [stageToast, setStageToast] = useState("");
  const [, setWeatherVersion] = useState(0);
  useEffect(() => { if (!stage) return; const update = () => setWeatherVersion(v => v + 1); window.addEventListener("idol-weather-updated", update); return () => window.removeEventListener("idol-weather-updated", update); }, [stage]);
  const [musicOpen, setMusicOpen] = useState(false);
  const [bgmMuted, setBgmMuted] = useState(() => loadBgmMuted());
  const [notesOpen, setNotesOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [stageMenu, setStageMenu] = useState(false);
  const [hideClock, setHideClock] = useState(() => Boolean(loadStageSettings().hideClock));
  const [worldNow, setWorldNow] = useState(() => Date.now());
  useEffect(() => {
    if (!stage) return;
    const t = window.setInterval(() => setWorldNow(Date.now()), 15e3);
    const off = subscribeWorldClock(() => setWorldNow(Date.now()));
    return () => { window.clearInterval(t); off(); };
  }, [stage]);
  const [retryTarget, setRetryTarget] = useState<string | null>(null);
  const [retryHint, setRetryHint] = useState("");
  const [retryHints, setRetryHints] = useState<string[]>([]);
  const [bgThumbs, setBgThumbs] = useState<{ id: string; url: string; on: boolean }[]>([]);
  const [customPlace, setCustomPlace] = useState("");
  /** 背景：此刻里每个地点用它选中的那张 */
  const resolveScenes = useCallback((names: string[]) => (stage ? resolveStageBgMap(names) : resolveVnAssetMap(names, "scene", characterId)), [stage, characterId]);
  const [notesVer, setNotesVer] = useState(0);
  const [noteEdit, setNoteEdit] = useState<{ id: string; text: string } | null>(null);
  const [noteBusy, setNoteBusy] = useState("");
  /** 场景 app 里她说的话名字条写「你」 */
  const nameOf = (f: { speaker?: string; sourceRole?: string } | null | undefined, role?: string) =>
    stage && (f?.sourceRole === "user" || role === "user") && f?.speaker ? "你" : f?.speaker;
  const [allFrames, setAllFrames] = useState<VnFrame[]>([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentScene, setCurrentScene] = useState("");
  const [currentSprite, setCurrentSprite] = useState("");
  const [hideDialogue, setHideDialogue] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [currentOptions, setCurrentOptions] = useState<VnOptions | null>(null);
  const [inputText, setInputText] = useState("");
  const [inputMode, setInputMode] = useState<"dialogue" | "narration" | "director">("dialogue");
  const [pendingActions, setPendingActions] = useState<{ type: "dialogue" | "narration" | "scene_switch"; text: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showScenePicker, setShowScenePicker] = useState(false);
  const [showReplayConfirm, setShowReplayConfirm] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayFrames, setReplayFrames] = useState<VnFrame[]>([]);
  const [replayIdx, setReplayIdx] = useState(0);
  const [assetMap, setAssetMap] = useState<Record<string, string>>({});
  const [assetLoadStatus, setAssetLoadStatus] = useState<Record<string, AssetLoadStatus>>({});
  const [renderedScene, setRenderedScene] = useState("");
  const [assetsReady, setAssetsReady] = useState(false);
  const [showBeatsPanel, setShowBeatsPanel] = useState(false);
  const [bilingualTranslationEnabled, setBilingualTranslationEnabled] = useState(() => loadVnConfig("bilingualTranslationEnabled") !== "0");
  const [collapseBilingualTranslation, setCollapseBilingualTranslation] = useState(() => loadVnConfig("collapseBilingualTranslation") !== "0");
  const [editingBeatTitle, setEditingBeatTitle] = useState("");
  const [editingBeatDesc, setEditingBeatDesc] = useState("");
  const [, forceUpdate] = useState(0);
  const [ctxMenuMsgId, setCtxMenuMsgId] = useState<string | null>(null);
  const [ctxMenuY, setCtxMenuY] = useState(0);
  const [ctxMenuX, setCtxMenuX] = useState(0);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [voiceAutoEnabled, setVoiceAutoEnabled] = useState(false);
  const [voiceBusyKey, setVoiceBusyKey] = useState<string | null>(null);
  const [voicePlayingKey, setVoicePlayingKey] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isGeneratingRef = useRef(false);
  const mountedRef = useRef(true);
  const imageLoadingRef = useRef<Set<string>>(new Set());
  const voiceEnabledAtRef = useRef(Number.POSITIVE_INFINITY);
  const autoVoicePlayedKeysRef = useRef<Set<string>>(new Set());
  const currentVoiceFrameKeyRef = useRef<string | null>(null);
  const activeVoicePlaybackRef = useRef<{ key: string; abort: () => void } | null>(null);
  const frame = allFrames[frameIdx] || null;
  const defaultTranslationExpanded = collapseBilingualTranslation ? false : true;

  const session = createOrGetVnSession(characterId);
  const isArchived = session.chapters[chapterIndex]?.archived ?? false;

  const userName = useMemo(() => resolveUserIdentity(characterId, "vn")?.name ?? "我", [characterId]);
  const availableScenes = useMemo(() => loadVnScenes(characterId), [characterId]);
  const sceneAssetNames = useMemo(() => new Set(availableScenes.map((scene) => scene.name)), [availableScenes]);
  /** 双语（原文|译文）：此刻里一直开着，旁白写了「|」也算（全部韩语模式） */
  const isBi = useCallback((f: VnFrame | null | undefined) => Boolean(f && (stage || bilingualTranslationEnabled) && (f.speaker || (stage && f.text.includes("|")))), [stage, bilingualTranslationEnabled]);
  const getTypingSourceText = useCallback((nextFrame: VnFrame | null | undefined) => {
    if (!isBi(nextFrame)) return nextFrame?.text || "";
    return splitBilingualText(nextFrame!.text)?.original || nextFrame!.text;
  }, [isBi]);

  const applyFrameAudioToState = useCallback((messageId: string, frameIndex: number, audio: VnFrameAudio) => {
    const patch = (targetFrame: VnFrame) => (
      targetFrame.sourceMessageId === messageId && targetFrame.sourceFrameIndex === frameIndex
        ? { ...targetFrame, voiceAudio: audio }
        : targetFrame
    );
    setAllFrames((prev) => prev.map(patch));
    setReplayFrames((prev) => prev.map(patch));
  }, []);

  const playVoiceBlob = useCallback(async (key: string, blob: Blob) => {
    activeVoicePlaybackRef.current?.abort();
    // Media-element path: VN auto-voice plays with no user gesture nearby, where
    // resuming a suspended AudioContext is often rejected (notably on Android
    // unless a keep-alive audio happened to hold the session open).
    const playback = playAudioBlobViaMediaElement(blob);
    activeVoicePlaybackRef.current = { key, abort: playback.abort };
    setVoicePlayingKey(key);
    try {
      await playback.promise;
    } finally {
      if (activeVoicePlaybackRef.current?.key === key) activeVoicePlaybackRef.current = null;
      setVoicePlayingKey((current) => current === key ? null : current);
    }
  }, []);

  const synthesizeFrameVoice = useCallback(async (
    targetFrame: VnFrame,
    options?: { play?: boolean; alertOnMissingConfig?: boolean; auto?: boolean },
  ) => {
    const key = getFrameVoiceKey(targetFrame);
    // 无 speaker = 旁白帧，只读不配音
    if (!key || !targetFrame.speaker || targetFrame.sourceRole !== "assistant" || !targetFrame.text.trim()) return;
    const messageId = targetFrame.sourceMessageId;
    const frameIndex = targetFrame.sourceFrameIndex;
    if (!messageId || frameIndex == null) return;

    const speechText = getTypingSourceText(targetFrame).trim();
    if (!speechText) return;

    const cached = targetFrame.voiceAudio;
    if (cached?.audioDataUrl && cached.synthesizedFromText === speechText) {
      if (options?.play) {
        const blob = await dataUrlToBlob(cached.audioDataUrl);
        await playVoiceBlob(key, blob);
      }
      return;
    }

    const voiceConfig = resolveVoiceConfig(characterId, "vn");
    if (!voiceConfig || !voiceConfig.enableTTS) {
      if (options?.alertOnMissingConfig) {
        alert("请先在设置 - 绑定中为漫卷配置并启用语音 API。");
      }
      return;
    }

    setVoiceBusyKey(key);
    try {
      const blob = await synthesizeSpeech(speechText, voiceConfig);
      if (!blob) return;
      const audioDataUrl = await blobToDataUrl(blob);
      const audio: VnFrameAudio = {
        audioDataUrl,
        synthesizedFromText: speechText,
        updatedAt: new Date().toISOString(),
      };
      updateVnMessageFrameAudio(messageId, frameIndex, audio);
      applyFrameAudioToState(messageId, frameIndex, audio);
      if (options?.play) {
        if (!options.auto || currentVoiceFrameKeyRef.current === key) {
          await playVoiceBlob(key, blob);
        }
      }
    } catch (error) {
      console.warn("[VN] voice synthesis failed:", error);
      if (options?.alertOnMissingConfig) {
        const msg = error instanceof Error ? error.message : String(error || "未知错误");
        alert(`语音合成失败: ${msg}`);
      }
    } finally {
      setVoiceBusyKey((current) => current === key ? null : current);
    }
  }, [applyFrameAudioToState, characterId, getTypingSourceText, playVoiceBlob]);

  const handleVoiceToggle = useCallback(() => {
    unlockAudioPlayback();
    setVoiceAutoEnabled((enabled) => {
      const next = !enabled;
      if (next) {
        voiceEnabledAtRef.current = Date.now();
        autoVoicePlayedKeysRef.current.clear();
      } else {
        voiceEnabledAtRef.current = Number.POSITIVE_INFINITY;
        activeVoicePlaybackRef.current?.abort();
        activeVoicePlaybackRef.current = null;
        setVoicePlayingKey(null);
      }
      return next;
    });
  }, []);

  // ── Load existing messages and build frames ──
  useLayoutEffect(() => {
    setAssetsReady(false);
    const messages = loadVnMessagesForChapter(session.id, chapterIndex);
    const { frames, lastOptions } = buildFramesFromMessages(messages);
    setAllFrames(frames);
    if (frames.length > 0) {
      // Find last frame with text (skip empty scene-switch frames)
      let displayIdx = frames.length - 1;
      while (displayIdx > 0 && !frames[displayIdx].text) displayIdx--;

      setFrameIdx(displayIdx);
      setDisplayedText(frames[displayIdx].text);

      // Scan backwards for latest bg/sprite
      let bg = "";
      let sprite = "";
      for (let i = frames.length - 1; i >= 0; i--) {
        if (!bg && frames[i].bg) bg = frames[i].bg!;
        if (!sprite && frames[i].sprite) sprite = frames[i].sprite!;
        if (bg && sprite) break;
      }
      if (bg) setCurrentScene(bg);
      if (sprite) setCurrentSprite(sprite);

      // Show last text frame in dialogue box; user clicks to advance into input mode
      setWaitingForInput(false);
      setCurrentOptions(lastOptions);
    } else {
      setWaitingForInput(true);
      if (stageScene) { setCurrentScene(stageScene.bg); setStageOpening(true); }
    }
    if (stageScene && !frames.some(f => f.bg)) setCurrentScene(stageScene.bg);

    // Resolve assets
    const allBgs = new Set<string>();
    const allSprites = new Set<string>();
    for (const f of frames) {
      if (f.bg) allBgs.add(f.bg);
      if (f.sprite) allSprites.add(f.sprite);
    }
    for (const scene of availableScenes) {
      if (scene.name) allBgs.add(scene.name);
    }
    if (stageScene) allBgs.add(stageScene.bg);
    if (allBgs.size === 0 && allSprites.size === 0) setAssetsReady(true);
    let cancelled = false;
    Promise.all([
      resolveScenes([...allBgs]),
      resolveVnAssetMap([...allSprites], "sprite", characterId),
    ]).then(([sceneMap, spriteMap]) => {
      if (cancelled) return;
      setAssetMap((prev) => ({ ...prev, ...sceneMap, ...spriteMap }));
      setAssetsReady(true);
    });
    return () => { cancelled = true; };
  }, [session.id, chapterIndex, availableScenes, characterId, stageScene]);

  useStageBgm(stage ? currentScene : "", bgmMuted);

  const loadBgThumbs = useCallback(async (key: string) => {
    const list = placeBackgrounds(key);
    const urls = await thumbsOf(list.map(x => x.assetId));
    setBgThumbs(list.filter(x => urls[x.assetId]).map(x => ({ id: x.id, url: urls[x.assetId], on: x.on })));
  }, []);

  const showStageToast = useCallback((msg: string) => {
    setStageToast(msg);
    window.setTimeout(() => setStageToast(t => (t === msg ? "" : t)), 3600);
  }, []);
  const handleStageResult = useCallback((idol: { added: string[]; notes: string[]; closing: boolean } | undefined) => {
    if (!idol) return;
    const parts = [...idol.notes];
    if (idol.added.length) parts.push(`认识了：${idol.added.join("、")}`);
    if (idol.closing) parts.push("这一场差不多可以收尾了，点右上角 ⏹ 结束");
    if (parts.length) showStageToast(parts.join("\n"));
  }, [showStageToast]);

  // ── Resolve asset name to CSS background ──
  const resolveSceneBg = useCallback((name: string | undefined, useImage = true): React.CSSProperties => {
    if (!name) return {};
    if (assetMap[name] && useImage) {
      return {
        backgroundImage: `url(${assetMap[name]})`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
      };
    }
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    const h = (hash >>> 0) % 360;
    return { backgroundImage: `linear-gradient(180deg, hsl(${h}, 25%, 20%) 0%, hsl(${h}, 30%, 8%) 100%)` };
  }, [assetMap]);

  const resolveSpriteBg = useCallback((name: string | undefined): React.CSSProperties => {
    if (!name) return {};
    if (assetMap[name]) return { backgroundImage: `url(${assetMap[name]})` };
    return {};
  }, [assetMap]);

  // ── Typewriter ──
  const startTyping = useCallback((text: string) => {
    setDisplayedText("");
    setIsTyping(true);
    let i = 0;
    const tick = () => {
      if (i < text.length) {
        setDisplayedText(text.slice(0, i + 1));
        i++;
        typingRef.current = setTimeout(tick, 40);
      } else {
        setIsTyping(false);
      }
    };
    tick();
  }, []);

  const skipTyping = useCallback(() => {
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = null;
    if (frame) {
      setDisplayedText(frame.text);
      setIsTyping(false);
    }
  }, [frame]);

  // ── Frame Navigation ──
  const goToFrame = useCallback((idx: number) => {
    if (idx >= allFrames.length) {
      // If generating, stay on last frame (don't show input)
      if (!isArchived && !isGeneratingRef.current) setWaitingForInput(true);
      return;
    }
    const next = allFrames[idx];
    if (next.bg && next.bg !== currentScene) {
      setCurrentScene(next.bg);
    }
    if (next.sprite && next.sprite !== currentSprite) {
      setCurrentSprite(next.sprite);
    }
    setFrameIdx(idx);
    // Skip empty frames (shouldn't normally appear)
    if (!next.text) {
      if (idx + 1 < allFrames.length) {
        // Process next frame on next tick to avoid stack overflow
        requestAnimationFrame(() => goToFrame(idx + 1));
      } else {
        setWaitingForInput(true);
      }
      return;
    }
    startTyping(getTypingSourceText(next));
  }, [allFrames, currentScene, currentSprite, startTyping, isArchived, getTypingSourceText]);

  const advance = useCallback(() => {
    if (showArchiveConfirm || waitingForInput) return;
    if (isTyping) {
      skipTyping();
    } else {
      goToFrame(frameIdx + 1);
    }
  }, [isTyping, skipTyping, goToFrame, frameIdx, showArchiveConfirm, waitingForInput]);

  // ── Replay advance ──
  const replayFrame = isReplaying ? replayFrames[replayIdx] : null;

  const advanceReplay = useCallback(() => {
    if (!isReplaying) return;
    if (isTyping) {
      if (typingRef.current) clearTimeout(typingRef.current);
      typingRef.current = null;
      setDisplayedText(getTypingSourceText(replayFrames[replayIdx]));
      setIsTyping(false);
      return;
    }
    // Find next frame with text
    let nextIdx = replayIdx + 1;
    while (nextIdx < replayFrames.length && !replayFrames[nextIdx].text) {
      const f = replayFrames[nextIdx];
      if (f.bg) setCurrentScene(f.bg);
      if (f.sprite) setCurrentSprite(f.sprite);
      nextIdx++;
    }
    if (nextIdx >= replayFrames.length) {
      // Replay done — exit, restore normal state
      setIsReplaying(false);
      setReplayFrames([]);
      setReplayIdx(0);
      // Restore to last text frame of allFrames
      let lastIdx = allFrames.length - 1;
      while (lastIdx > 0 && !allFrames[lastIdx].text) lastIdx--;
      setFrameIdx(lastIdx);
      setDisplayedText(getTypingSourceText(allFrames[lastIdx]));
      // Restore bg/sprite
      let bg = "", sp = "";
      for (let i = allFrames.length - 1; i >= 0; i--) {
        if (!bg && allFrames[i].bg) bg = allFrames[i].bg!;
        if (!sp && allFrames[i].sprite) sp = allFrames[i].sprite!;
        if (bg && sp) break;
      }
      if (bg) setCurrentScene(bg);
      if (sp) setCurrentSprite(sp);
      setWaitingForInput(false);
      return;
    }
    const next = replayFrames[nextIdx];
    if (next.bg) setCurrentScene(next.bg);
    if (next.sprite) setCurrentSprite(next.sprite);
    setReplayIdx(nextIdx);
    startTyping(getTypingSourceText(next));
  }, [isReplaying, replayFrames, replayIdx, isTyping, allFrames, startTyping, getTypingSourceText]);

  // Track mounted state for async image decode callbacks.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      imageLoadingRef.current.clear();
      activeVoicePlaybackRef.current?.abort();
      activeVoicePlaybackRef.current = null;
    };
  }, []);

  useEffect(() => {
    currentVoiceFrameKeyRef.current = !isReplaying ? getFrameVoiceKey(frame) : null;
  }, [frame, isReplaying]);

  useEffect(() => {
    if (!voiceAutoEnabled || isReplaying || waitingForInput || !frame) return;
    const key = getFrameVoiceKey(frame);
    if (!key || frame.sourceRole !== "assistant" || !frame.text.trim()) return;
    const createdAt = new Date(frame.sourceCreatedAt || "").getTime();
    if (!Number.isFinite(createdAt) || createdAt < voiceEnabledAtRef.current) return;
    if (autoVoicePlayedKeysRef.current.has(key)) return;
    autoVoicePlayedKeysRef.current.add(key);
    void synthesizeFrameVoice(frame, { play: true, auto: true });
  }, [
    frame,
    frameIdx,
    isReplaying,
    synthesizeFrameVoice,
    voiceAutoEnabled,
    waitingForInput,
  ]);

  // Preload images when assetMap updates, then reveal scenes only after decode.
  useEffect(() => {
    for (const url of Object.values(assetMap)) {
      if (!url || assetLoadStatus[url] || imageLoadingRef.current.has(url)) continue;
      imageLoadingRef.current.add(url);
      const img = new Image();
      const mark = (status: AssetLoadStatus) => {
        imageLoadingRef.current.delete(url);
        if (!mountedRef.current) return;
        setAssetLoadStatus((prev) => prev[url] ? prev : { ...prev, [url]: status });
      };
      img.onload = () => {
        if (typeof img.decode === "function") {
          img.decode().then(() => mark("ready")).catch(() => mark("ready"));
        } else {
          mark("ready");
        }
      };
      img.onerror = () => mark("failed");
      img.src = url;
    }
  }, [assetMap, assetLoadStatus]);

  const currentSceneUrl = currentScene ? assetMap[currentScene] : "";
  const currentSceneAssetStatus = currentSceneUrl ? assetLoadStatus[currentSceneUrl] : undefined;
  const currentSceneHasUploadedAsset = currentScene ? sceneAssetNames.has(currentScene) : false;

  useEffect(() => {
    if (!currentScene) {
      setRenderedScene("");
      return;
    }

    if (currentSceneUrl) {
      if (currentSceneAssetStatus === "ready" || currentSceneAssetStatus === "failed") {
        setRenderedScene(currentScene);
      }
      return;
    }

    if (!currentSceneHasUploadedAsset || assetsReady) {
      setRenderedScene(currentScene);
    }
  }, [assetsReady, currentScene, currentSceneAssetStatus, currentSceneHasUploadedAsset, currentSceneUrl]);

  // Keep ref in sync
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);

  // ── Auto Mode ──
  useEffect(() => {
    if (autoMode && !isTyping && !showArchiveConfirm && !waitingForInput) {
      autoRef.current = setTimeout(() => advance(), 2000);
    }
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
  }, [autoMode, isTyping, showArchiveConfirm, waitingForInput, advance]);

  // 场景 app：她说的那几句播完自己往下走，AI 那段回来了就接着播
  useEffect(() => {
    if (!stage || isTyping || waitingForInput || isReplaying || !frame || frame.sourceRole !== "user") return;
    if (frameIdx >= allFrames.length - 1) return;
    const t = window.setTimeout(() => goToFrame(frameIdx + 1), 700);
    return () => window.clearTimeout(t);
  }, [stage, isTyping, waitingForInput, isReplaying, frame, frameIdx, allFrames.length, goToFrame]);

  // ── Submit user input ──
  const handleSubmit = useCallback(async (text: string, type: "dialogue" | "narration" | "choice") => {
    if (!text.trim() || isGenerating) return;

    setIsGenerating(true);
    setWaitingForInput(false);
    setCurrentOptions(null);

    // Package and save user message
    const packaged = packageUserInput(text.trim(), type, { speaker: userName });
    const userMsg = pushVnMessage({
      sessionId: session.id,
      role: "user",
      rawContent: packaged,
      chapterIndex,
    });

    // Update start message ID if this is the first message
    updateChapterStartMessageId(session.id, chapterIndex, userMsg.id);

    // Parse user's frames and add to display
    const userParsed = parseVnResponse(packaged);
    const userFrames = tagFramesWithMessage(userParsed.frames, userMsg);
    const newFrames = [...allFrames, ...userFrames];
    setAllFrames(newFrames);

    // Show user's last frame in dialogue box while generating
    if (userFrames.length > 0) {
      const lastUserFrameIdx = newFrames.length - 1;
      setFrameIdx(lastUserFrameIdx);
      const f = newFrames[lastUserFrameIdx];
      if (f.bg) setCurrentScene(f.bg);
      if (f.sprite) setCurrentSprite(f.sprite);
      setDisplayedText(getTypingSourceText(f));
    }

    try {
      // Get all messages in session (cross-chapter context)
      const allMessages = loadVnMessages(session.id);
      const result = await generateVnCompletion(characterId, allMessages);
      handleStageResult(result.idol);

      // Save AI response
      const aiMsg = pushVnMessage({
        sessionId: session.id,
        role: "assistant",
        rawContent: result.rawText,
        chapterIndex,
        ...(result.summary ? { summary: result.summary } : {}),
      });

      // Update start message ID if needed
      updateChapterStartMessageId(session.id, chapterIndex, aiMsg.id);

      // Add AI frames
      const aiFrames = tagFramesWithMessage(result.frames, aiMsg);
      const updatedFrames = [...newFrames, ...aiFrames];
      setAllFrames(updatedFrames);
      setCurrentOptions(result.options);

      // Resolve any new assets
      const newBgs = new Set<string>();
      const newSprites = new Set<string>();
      for (const f of aiFrames) {
        if (f.bg && !assetMap[f.bg]) newBgs.add(f.bg);
        if (f.sprite && !assetMap[f.sprite]) newSprites.add(f.sprite);
      }
      if (newBgs.size > 0 || newSprites.size > 0) {
        const [sceneMap, spriteMap] = await Promise.all([
          resolveScenes([...newBgs]),
          resolveVnAssetMap([...newSprites], "sprite", characterId),
        ]);
        setAssetMap((prev) => ({ ...prev, ...sceneMap, ...spriteMap }));
      }

      // Start playing AI frames
      const aiStartIdx = newFrames.length;
      if (aiFrames.length > 0) {
        setFrameIdx(aiStartIdx);
        const f = aiFrames[0];
        if (f.bg) setCurrentScene(f.bg);
        if (f.sprite) setCurrentSprite(f.sprite);
        startTyping(getTypingSourceText(f));
      } else {
        setWaitingForInput(true);
      }
    } catch (err) {
      console.error("VN generation error:", err);
      setWaitingForInput(true);
    } finally {
      setIsGenerating(false);
      setInputText("");
    }
  }, [allFrames, assetMap, characterId, chapterIndex, isGenerating, session.id, startTyping, getTypingSourceText, userName, handleStageResult]);

  // Add text to pending
  const handleTextSubmit = useCallback(() => {
    if (!inputText.trim()) return;
    if (inputMode === "director") return;
    setPendingActions((prev) => [...prev, { type: inputMode as "dialogue" | "narration", text: inputText.trim() }]);
    setInputText("");
  }, [inputText, inputMode]);

  // Choice sends immediately (no accumulation)
  const handleChoiceSelect = useCallback((choice: string) => {
    handleSubmit(choice, "choice");
  }, [handleSubmit]);

  // Scene switch: visual transition + add to pending
  const handleSceneSwitch = useCallback((sceneName: string) => {
    setShowScenePicker(false);
    if (!assetMap[sceneName]) {
      void resolveScenes([sceneName]).then((sceneMap) => {
        if (Object.keys(sceneMap).length > 0) {
          setAssetMap((prev) => ({ ...prev, ...sceneMap }));
        }
      });
    }
    if (sceneName !== currentScene) {
      setCurrentScene(sceneName);
    }
    setPendingActions((prev) => [...prev, { type: "scene_switch" as const, text: sceneName }]);
  }, [assetMap, characterId, currentScene]);

  // Remove a pending action
  const handleRemovePending = useCallback((index: number) => {
    setPendingActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Send all pending actions as one message
  const handleSendAll = useCallback(async () => {
    const director = stage && inputMode === "director" ? inputText.trim() : "";
    const actions = stage && inputText.trim() && inputMode !== "director" ? [...pendingActions, { type: inputMode as "dialogue" | "narration", text: inputText.trim() }] : pendingActions;
    if ((actions.length === 0 && !director) || isGenerating) return;
    const packaged = [actions.length ? packageMultiActions(actions, userName) : "", director ? `（场外指令：${director}）` : ""].filter(Boolean).join("\n");
    setPendingActions([]);
    if (stage) setInputText("");
    // Reuse handleSubmit-like logic but with pre-packaged content
    setIsGenerating(true);
    setWaitingForInput(false);
    setCurrentOptions(null);

    const userMsg = pushVnMessage({
      sessionId: session.id,
      role: "user",
      rawContent: packaged,
      chapterIndex,
    });
    updateChapterStartMessageId(session.id, chapterIndex, userMsg.id);

    const userParsed = parseVnResponse(stripDirector(packaged) || "<content></content>");
    const userTextFrames = tagFramesWithMessage(userParsed.frames, userMsg).filter((f) => f.text);
    const newFrames = [...allFrames, ...userTextFrames];
    setAllFrames(newFrames);

    // Play user frames from first, then hold on last
    if (userTextFrames.length > 0) {
      const firstIdx = allFrames.length;
      setFrameIdx(firstIdx);
      const f = userTextFrames[0];
      if (f.bg) setCurrentScene(f.bg);
      if (f.sprite) setCurrentSprite(f.sprite);
      if (userTextFrames.length === 1 && !stage) {
        // Single frame — show statically
        setDisplayedText(getTypingSourceText(f));
        setIsTyping(false);
      } else {
        startTyping(getTypingSourceText(f));
      }
    }

    try {
      const allMessages = loadVnMessages(session.id);
      const result = await generateVnCompletion(characterId, allMessages);
      handleStageResult(result.idol);
      const aiMsg = pushVnMessage({ sessionId: session.id, role: "assistant", rawContent: result.rawText, chapterIndex, ...(result.summary ? { summary: result.summary } : {}) });
      updateChapterStartMessageId(session.id, chapterIndex, userMsg.id);

      const aiFrames = tagFramesWithMessage(result.frames, aiMsg);
      const updatedFrames = [...newFrames, ...aiFrames];
      setAllFrames(updatedFrames);
      setCurrentOptions(result.options);

      const newBgs = new Set<string>();
      const newSprites = new Set<string>();
      for (const f of aiFrames) {
        if (f.bg && !assetMap[f.bg]) newBgs.add(f.bg);
        if (f.sprite && !assetMap[f.sprite]) newSprites.add(f.sprite);
      }
      if (newBgs.size > 0 || newSprites.size > 0) {
        const [sceneMap, spriteMap] = await Promise.all([
          resolveScenes([...newBgs]),
          resolveVnAssetMap([...newSprites], "sprite", characterId),
        ]);
        setAssetMap((prev) => ({ ...prev, ...sceneMap, ...spriteMap }));
      }

      const aiStartIdx = newFrames.length;
      if (stage && aiFrames.length > 0 && userTextFrames.length > 0) {
        // 场景 app：她那几句播完会自己接上（见上面的自动往下走）
      } else if (aiFrames.length > 0) {
        setFrameIdx(aiStartIdx);
        const f = aiFrames[0];
        if (f.bg) setCurrentScene(f.bg);
        if (f.sprite) setCurrentSprite(f.sprite);
        startTyping(getTypingSourceText(f));
      } else {
        setWaitingForInput(true);
      }
    } catch (err) {
      console.error("VN generation error:", err);
      setWaitingForInput(true);
    } finally {
      setIsGenerating(false);
      setInputText("");
    }
  }, [pendingActions, userName, isGenerating, stage, inputText, inputMode, allFrames, assetMap, characterId, chapterIndex, session.id, startTyping, getTypingSourceText, handleStageResult]);

  // ── History message actions ──
  const rebuildFrames = useCallback(() => {
    const msgs = loadVnMessagesForChapter(session.id, chapterIndex);
    const { frames } = buildFramesFromMessages(msgs);
    setAllFrames(frames);
    if (frames.length > 0) {
      let idx = frames.length - 1;
      while (idx > 0 && !frames[idx].text) idx--;
      setFrameIdx(idx);
      setDisplayedText(getTypingSourceText(frames[idx]));
      let bg = "", sp = "";
      for (let i = frames.length - 1; i >= 0; i--) {
        if (!bg && frames[i].bg) bg = frames[i].bg!;
        if (!sp && frames[i].sprite) sp = frames[i].sprite!;
        if (bg && sp) break;
      }
      if (bg) setCurrentScene(bg);
      if (sp) setCurrentSprite(sp);
      setWaitingForInput(false);
    } else {
      setWaitingForInput(true);
    }
  }, [session.id, chapterIndex]);

  const handleMsgDelete = useCallback((msgId: string) => {
    deleteVnMessage(msgId);
    setCtxMenuMsgId(null);
    rebuildFrames();
  }, [rebuildFrames]);

  const handleMsgDeleteFrom = useCallback((msgId: string) => {
    deleteVnMessagesFrom(session.id, msgId);
    setCtxMenuMsgId(null);
    rebuildFrames();
  }, [session.id, rebuildFrames]);

  const handleMsgEditStart = useCallback((msg: VnMessage) => {
    setEditingMsgId(msg.id);
    setEditingContent(msg.rawContent);
    setCtxMenuMsgId(null);
  }, []);

  const handleMsgEditSave = useCallback(() => {
    if (!editingMsgId || !editingContent.trim()) { setEditingMsgId(null); setEditingContent(""); return; }
    editVnMessage(editingMsgId, editingContent.trim());
    setEditingMsgId(null);
    setEditingContent("");
    rebuildFrames();
  }, [editingMsgId, editingContent, rebuildFrames]);

  const handleMsgRetry = useCallback(async (msgId: string, hint?: string) => {
    if (hint?.trim()) rememberRetryHint(hint);
    const msgs = loadVnMessagesForChapter(session.id, chapterIndex);
    const msgIdx = msgs.findIndex((m) => m.id === msgId);
    if (msgIdx === -1 || msgs[msgIdx].role !== "assistant") return;
    deleteVnMessagesFrom(session.id, msgId);
    setCtxMenuMsgId(null);
    setHistoryOpen(false);
    rebuildFrames();
    setIsGenerating(true);
    setWaitingForInput(false);
    try {
      const allMessages = loadVnMessages(session.id);
      const result = await generateVnCompletion(characterId, allMessages, { retryHint: hint });
      handleStageResult(result.idol);
      const aiMsg = pushVnMessage({ sessionId: session.id, role: "assistant", rawContent: result.rawText, chapterIndex, ...(result.summary ? { summary: result.summary } : {}) });
      rebuildFrames();
      // Play new AI frames
      const newMsgs = loadVnMessagesForChapter(session.id, chapterIndex);
      const { frames } = buildFramesFromMessages(newMsgs);
      setAllFrames(frames);
      setCurrentOptions(result.options);
      const aiFrames = tagFramesWithMessage(result.frames, aiMsg);
      if (aiFrames.length > 0) {
        const startIdx = frames.length - aiFrames.length;
        setFrameIdx(startIdx);
        const f = aiFrames[0];
        if (f.bg) setCurrentScene(f.bg);
        if (f.sprite) setCurrentSprite(f.sprite);
        startTyping(getTypingSourceText(f));
      }
    } catch (err) {
      console.error("VN retry error:", err);
      setWaitingForInput(true);
    } finally {
      setIsGenerating(false);
    }
  }, [session.id, chapterIndex, characterId, rebuildFrames, startTyping, getTypingSourceText, handleStageResult]);

  const longPressYRef = useRef(0);
  const longPressXRef = useRef(0);
  const vnShellRef = useRef<HTMLDivElement>(null);
  const handleMsgLongPressStart = useCallback((msgId: string, x: number, y: number) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressXRef.current = x;
    longPressYRef.current = y;
    longPressTimer.current = setTimeout(() => { setCtxMenuMsgId(msgId); setCtxMenuX(longPressXRef.current); setCtxMenuY(longPressYRef.current); longPressTimer.current = null; }, 500);
  }, []);

  const handleMsgLongPressEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  // ── Beats ──
  const currentChapter = session.chapters[chapterIndex];
  const beats = currentChapter?.beats ?? [];
  const activeBeatIdx = currentChapter?.activeBeatIndex ?? 0;

  const handleAddBeat = useCallback(() => {
    if (!editingBeatTitle.trim()) return;
    const beat: VnBeat = {
      id: `beat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: editingBeatTitle.trim(),
      description: editingBeatDesc.trim() || undefined,
    };
    const newBeats = [...beats, beat];
    updateChapterBeats(session.id, chapterIndex, newBeats);
    setEditingBeatTitle("");
    setEditingBeatDesc("");
    forceUpdate((n) => n + 1);
  }, [editingBeatTitle, editingBeatDesc, beats, session.id, chapterIndex]);

  const handleDeleteBeat = useCallback((beatId: string) => {
    const newBeats = beats.filter((b) => b.id !== beatId);
    updateChapterBeats(session.id, chapterIndex, newBeats);
    if (activeBeatIdx >= newBeats.length && newBeats.length > 0) {
      setActiveBeatIndex(session.id, chapterIndex, newBeats.length - 1);
    }
    forceUpdate((n) => n + 1);
  }, [beats, session.id, chapterIndex, activeBeatIdx]);

  const handleSetActiveBeat = useCallback((idx: number) => {
    setActiveBeatIndex(session.id, chapterIndex, idx);
    forceUpdate((n) => n + 1);
  }, [session.id, chapterIndex]);

  // ── Derived ──
  const history = allFrames.slice(0, frameIdx + 1);
  const historyMessages = useMemo(() => loadVnMessagesForChapter(session.id, chapterIndex), [session.id, chapterIndex, allFrames.length]); // re-derive when frames change
  const isNarration = !frame?.speaker;
  const renderedSceneUrl = renderedScene ? assetMap[renderedScene] : "";
  const canUseRenderedSceneImage = renderedSceneUrl ? assetLoadStatus[renderedSceneUrl] === "ready" : true;
  const sceneStyle = resolveSceneBg(renderedScene, canUseRenderedSceneImage);
  const spriteStyle = resolveSpriteBg(currentSprite);
  const sceneVisualReady = !currentScene || Boolean(renderedScene);
  const currentDialogueText = isBi(frame) ? (isTyping ? displayedText : frame!.text) : displayedText;
  const replayDialogueText = isBi(replayFrame) ? (isTyping ? displayedText : replayFrame!.text) : displayedText;
  const renderFrameVoiceButton = (targetFrame: VnFrame | null | undefined) => {
    const key = getFrameVoiceKey(targetFrame);
    // 旁白帧（无 speaker）不提供配音按钮
    if (!targetFrame || !key || !targetFrame.speaker || targetFrame.sourceRole !== "assistant" || !targetFrame.text.trim()) return null;
    const speechText = getTypingSourceText(targetFrame).trim();
    const hasCurrentAudio = Boolean(
      targetFrame.voiceAudio?.audioDataUrl &&
      targetFrame.voiceAudio.synthesizedFromText === speechText,
    );
    const busy = voiceBusyKey === key;
    const playing = voicePlayingKey === key;
    return (
      <button
        type="button"
        className="vn-frame-voice-btn"
        data-ready={hasCurrentAudio ? "true" : undefined}
        data-playing={playing ? "true" : undefined}
        aria-label={hasCurrentAudio ? "播放语音" : "合成语音"}
        title={hasCurrentAudio ? "播放语音" : "合成语音"}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          unlockAudioPlayback();
          void synthesizeFrameVoice(targetFrame, { play: true, alertOnMissingConfig: true });
        }}
      >
        {busy ? <Loader2 className="vn-frame-voice-spin" size={13} /> : <Volume2 size={13} />}
      </button>
    );
  };

  return (
    <div className="vn-shell" ref={vnShellRef} data-vn-theme={vnTheme || "default"} data-stage={stage ? "true" : undefined} onClick={() => {
      if (clockOpen || stageMenu) { setClockOpen(false); setStageMenu(false); return; }
      if (historyOpen || showArchiveConfirm || showReplayConfirm || showScenePicker || showBeatsPanel || stageEnd || notesOpen || retryTarget) return;
      if (stageOpening) { setStageOpening(false); return; }
      if (isReplaying) { advanceReplay(); return; }
      if (waitingForInput && !isArchived) { setWaitingForInput(false); return; }
      if (!hideDialogue) advance();
    }}>
      {/* ── Scene Background ── */}
      {(() => {
        const sl = renderedScene ? getVnSceneLayout(renderedScene) : {};
        const stx = (sl.x ?? 50) - 50;
        const sty = (sl.y ?? 50) - 50;
        const ssc = (sl.scale ?? 100) / 100;
        return (
          <div
            className="vn-scene"
            style={{ ...sceneStyle,
              backgroundPosition: "center center",
              transform: `translate(${stx}%, ${sty}%) scale(${ssc})`,
            }}
          />
        );
      })()}
      {currentScene && !sceneVisualReady && (
        <div className="vn-scene-loading" aria-hidden="true">
          <span>场景加载中</span>
        </div>
      )}

      {/* ── Character Sprite ── */}
      {currentSprite && (() => {
        const spl = getVnSpriteLayout(currentSprite, characterId);
        const tx = (spl.x ?? 50) - 50;   // 50=center, 0=left, 100=right
        const ty = (spl.y ?? 100) - 100;  // 100=bottom, 50=up
        const sc = (spl.scale ?? 100) / 100;
        return (
          <div
            className="vn-sprite"
            style={{ ...spriteStyle,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center bottom",
              transform: `translate(${tx}%, ${ty}%) scale(${sc})`,
              transformOrigin: "center bottom",
            }}
          />
        );
      })()}

      {/* ── Atmospheric Overlay ── */}
      <div className="vn-atmosphere" />

      {stage && musicOpen ? <StageMusicPanel onClose={() => setMusicOpen(false)} onPlay={() => { setBgmMuted(false); saveBgmMuted(false); }} /> : null}

      {/* ── Top Bar ── */}
      <div className="vn-topbar" onClick={(e) => e.stopPropagation()}>
        <div className="vn-topbar-safe-area" />
        <div className="vn-topbar-content">
        <button className="vn-topbar-btn" onClick={onClose}>
          <ArrowLeft size={20} />
        </button>

        <div className="vn-topbar-right">
          {stage && (
            <button className="vn-topbar-btn" onClick={() => setMusicOpen(true)} title="音乐">
              {bgmMuted ? <VolumeX size={18} /> : <Music2 size={18} />}
            </button>
          )}
          {!isArchived && !stage && (
            <button className="vn-topbar-btn" onClick={() => setShowBeatsPanel(true)} title="情节控制">
              <ListOrdered size={18} />
            </button>
          )}
          {!isArchived && (
            <button className="vn-topbar-btn" onClick={() => { setShowScenePicker(true); if (stage && currentScene) void loadBgThumbs(currentScene); }} title="切换场景">
              <MapPin size={18} />
            </button>
          )}
          {stage && (
            <button className="vn-topbar-btn" onClick={() => { setNotesVer(v => v + 1); setNotesOpen(true); }} title="每段总结">
              <NotebookPen size={18} />
            </button>
          )}
          {stage ? (
            <button className="vn-topbar-btn" onClick={() => setStageMenu(v => !v)} title="更多">
              <MoreHorizontal size={18} />
            </button>
          ) : (
            <>
              <button className="vn-topbar-btn" onClick={() => setHistoryOpen(true)} title="回顾">
                <Clock size={18} />
              </button>
              {!isArchived && (
                <button className="vn-topbar-btn" onClick={() => setShowArchiveConfirm(true)} title="归档章节">
                  <Archive size={18} />
                </button>
              )}
            </>
          )}
        </div>
        </div>
      </div>

      {/* ── Dialogue Box: replay / playing / input ── */}
      {!showArchiveConfirm && !showReplayConfirm && !stageEnd && !stageOpening && assetsReady && sceneVisualReady && (isReplaying ? replayFrame : (frame || waitingForInput)) && (
        <div
          className={`vn-dialogue ${hideDialogue && !waitingForInput && !isReplaying ? "vn-dialogue-hidden" : ""}`}
        >
          <div className="vn-dialogue-inner" onClick={(e) => { if (waitingForInput && !isReplaying) e.stopPropagation(); }}>
            {/* ── Replay mode ── */}
            {isReplaying && replayFrame && (
              <>
                {renderFrameVoiceButton(replayFrame)}
                {replayFrame.speaker && <div className="vn-name">{nameOf(replayFrame)}</div>}
                <div className={`vn-text ${!replayFrame.speaker ? "vn-text-narration" : ""}`}>
                  {isBi(replayFrame) ? (
                    <BilingualTextBlock text={replayDialogueText} mode="plain" defaultExpanded={defaultTranslationExpanded} />
                  ) : (
                    replayDialogueText
                  )}
                </div>
                {!isTyping && (
                  <div className="vn-advance"><ChevronDown size={16} /></div>
                )}
              </>
            )}

            {/* ── Normal playing mode ── */}
            {!isReplaying && !waitingForInput && frame && (
              <>
                {renderFrameVoiceButton(frame)}
                {frame.speaker && <div className="vn-name">{nameOf(frame)}</div>}
                <div className={`vn-text ${isNarration ? "vn-text-narration" : ""}`}>
                  {isBi(frame) ? (
                    <BilingualTextBlock text={currentDialogueText} mode="plain" defaultExpanded={defaultTranslationExpanded} />
                  ) : (
                    currentDialogueText
                  )}
                </div>
                {!isTyping && !isGenerating && (
                  <div className="vn-advance"><ChevronDown size={16} /></div>
                )}
                {isGenerating && (
                  <div className="vn-advance" style={{ animation: "vn-pulse-loading 1.5s ease-in-out infinite", fontSize: "calc(11px*var(--app-text-scale,1))", letterSpacing: "0.1em" }}>
                    生成中...
                  </div>
                )}
              </>
            )}

            {/* ── Input mode ── */}
            {!isReplaying && waitingForInput && !isGenerating && (
              <>
                {!stage && (
                  <div className="vn-name">
                    {userName}
                  </div>
                )}

                {/* Choices from AI */}
                {currentOptions && currentOptions.choices.length > 0 && pendingActions.length === 0 && (
                  <div className="vn-options">
                    {currentOptions.choices.map((choice, i) => (
                      <button key={i} className="vn-option-btn" onClick={() => handleChoiceSelect(choice)}>
                        {choice}
                      </button>
                    ))}
                  </div>
                )}

                {/* Pending actions list */}
                {pendingActions.length > 0 && (
                  <div className="vn-pending">
                    {pendingActions.map((a, i) => (
                      <div key={i} className="vn-pending-item" data-type={a.type}>
                        <span className="vn-pending-tag">
                          {a.type === "dialogue" ? "对话" : a.type === "narration" ? "旁白" : "场景"}
                        </span>
                        <span className="vn-pending-text">{a.text}</span>
                        <button className="vn-pending-del" onClick={() => handleRemovePending(i)}>&times;</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mode toggle + text input */}
                <div className="vn-input-mode">
                  <button
                    className="vn-mode-btn"
                    data-active={inputMode === "dialogue" ? "true" : undefined}
                    onClick={() => setInputMode("dialogue")}
                  >
                    <MessageSquare size={10} style={{ marginRight: 4, display: "inline" }} />
                    对话
                  </button>
                  <button
                    className="vn-mode-btn"
                    data-active={inputMode === "narration" ? "true" : undefined}
                    onClick={() => setInputMode("narration")}
                  >
                    <BookOpen size={10} style={{ marginRight: 4, display: "inline" }} />
                    旁白
                  </button>
                  {stage && (
                    <button
                      className="vn-mode-btn"
                      data-active={inputMode === "director" ? "true" : undefined}
                      onClick={() => setInputMode("director")}
                    >
                      场外
                    </button>
                  )}
                </div>
                <div className="vn-input-row">
                  <textarea
                    ref={inputRef}
                    className="vn-input-field"
                    placeholder={inputMode === "dialogue" ? "说些什么..." : inputMode === "director" ? "悄悄告诉 AI，比如：让朴书雅从拐角出来" : "描述一个动作或场景..."}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {}}
                    rows={1}
                  />
                  <button className="vn-send-btn" disabled={!inputText.trim() || inputMode === "director"} onClick={handleTextSubmit} title="添加">
                    +
                  </button>
                  <button
                    className="vn-send-btn"
                    disabled={pendingActions.length === 0 && !(stage && inputText.trim())}
                    onClick={handleSendAll}
                    title="发送"
                    style={pendingActions.length > 0 || (stage && inputText.trim()) ? { background: "rgba(160,140,240,0.3)", color: "rgba(255,255,255,0.9)" } : undefined}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Control Bar ── */}
      {!showArchiveConfirm && !stageEnd && !waitingForInput && !isReplaying && (
        <div className="vn-controls" onClick={(e) => e.stopPropagation()}>
          <button className="vn-ctrl-btn" onClick={() => setHideDialogue(!hideDialogue)} data-active={hideDialogue ? "true" : undefined} title="隐藏">
            {hideDialogue ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button className="vn-ctrl-btn" onClick={() => setAutoMode(!autoMode)} data-active={autoMode ? "true" : undefined} title="自动">
            {autoMode ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            className="vn-ctrl-btn"
            onClick={handleVoiceToggle}
            data-active={voiceAutoEnabled ? "true" : undefined}
            title={voiceAutoEnabled ? "关闭语音" : "开启语音"}
            aria-pressed={voiceAutoEnabled}
            aria-label={voiceAutoEnabled ? "关闭漫卷语音" : "开启漫卷语音"}
          >
            <Volume2 size={15} />
          </button>
          {stage && !isArchived && (() => {
            const last = [...loadVnMessagesForChapter(session.id, chapterIndex)].reverse().find(m => m.role === "assistant");
            return last ? (
              <button className="vn-ctrl-btn" title="重roll这段" onClick={() => { setRetryHint(""); setRetryHints(loadRetryHints()); setRetryTarget(last.id); }}>
                <RefreshCw size={15} />
              </button>
            ) : null;
          })()}
          <button className="vn-ctrl-btn" onClick={() => setShowReplayConfirm(true)} title="回放">
            <RotateCcw size={15} />
          </button>
        </div>
      )}

      {/* ── History Panel (message-level) ── */}
      {historyOpen && (
        <div className="vn-history-overlay" onClick={() => { setHistoryOpen(false); setCtxMenuMsgId(null); }}>
          <div className="vn-history-panel" onClick={(e) => { e.stopPropagation(); setCtxMenuMsgId(null); }}>
            <button className="vn-history-close" onClick={() => setHistoryOpen(false)}>
              <ArrowRight size={16} />
            </button>
            {historyMessages.map((msg) => {
              const roleLabel = msg.role === "user" ? "用户" : msg.role === "assistant" ? "AI" : "系统";
              // Parse for display preview
              const parsed = parseVnResponse(stripDirector(msg.rawContent) || "<content></content>");
              const frames = parsed.frames.filter((f) => f.text);
              const directorLine = directorOf(msg.rawContent);

              return (
                <div
                  key={msg.id}
                  className="vn-history-msg"
                  data-role={msg.role}
                  onPointerDown={(e) => handleMsgLongPressStart(msg.id, e.clientX, e.clientY)}
                  onPointerUp={handleMsgLongPressEnd}
                  onPointerLeave={handleMsgLongPressEnd}
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenuX(e.clientX); setCtxMenuY(e.clientY); setCtxMenuMsgId(msg.id); }}
                >
                  <div className="vn-history-msg-role">{roleLabel}</div>
                  {editingMsgId === msg.id ? (
                    <div className="vn-history-msg-edit">
                      <textarea
                        autoFocus
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleMsgEditSave(); }
                          if (e.key === "Escape") { setEditingMsgId(null); setEditingContent(""); }
                        }}
                      />
                      <div className="vn-history-msg-edit-actions">
                        <button className="vn-history-msg-edit-btn" onClick={() => { setEditingMsgId(null); setEditingContent(""); }}>取消</button>
                        <button className="vn-history-msg-edit-btn" data-save="true" onClick={handleMsgEditSave}>保存</button>
                      </div>
                    </div>
                  ) : (
                    <div className="vn-history-msg-text">
                      {directorLine ? <div className="vn-hmsg-director">场外：{directorLine}</div> : null}
                      {frames.length > 0 ? frames.map((f, fi) => (
                        <div key={fi} className={f.speaker ? "vn-hmsg-dialogue" : "vn-hmsg-narration"}>
                          {f.speaker && <span className="vn-hmsg-speaker">{nameOf(f, msg.role)}</span>}
                          {isBi(f) ? (
                            <div className="vn-hmsg-bilingual">
                              <BilingualTextBlock text={f.text} mode="plain" defaultExpanded={defaultTranslationExpanded} />
                            </div>
                          ) : (
                            <span>{f.text}</span>
                          )}
                        </div>
                      )) : msg.rawContent.slice(0, 100)}
                    </div>
                  )}
                  {ctxMenuMsgId === msg.id && editingMsgId !== msg.id && (() => {
                    const menu = (
                      <div className="vn-ctx-menu" style={{ left: ctxMenuX, top: ctxMenuY, transform: "translateX(-50%)" }} onClick={(e) => e.stopPropagation()}>
                        <button className="vn-ctx-btn" onClick={() => handleMsgEditStart(msg)}>编辑</button>
                        {msg.role === "assistant" && (
                          <button className="vn-ctx-btn vn-ctx-btn-danger" onClick={() => { if (stage) { setCtxMenuMsgId(null); setRetryHint(""); setRetryHints(loadRetryHints()); setRetryTarget(msg.id); } else handleMsgRetry(msg.id); }}>重试</button>
                        )}
                        <button className="vn-ctx-btn vn-ctx-btn-danger" onClick={() => handleMsgDelete(msg.id)}>删除</button>
                        <button className="vn-ctx-btn vn-ctx-btn-danger" onClick={() => handleMsgDeleteFrom(msg.id)}>删除以下</button>
                      </div>
                    );
                    return vnShellRef.current ? createPortal(menu, vnShellRef.current) : menu;
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Scene Picker Panel ── */}
      {showScenePicker && (
        <div className="vn-history-overlay" onClick={() => setShowScenePicker(false)}>
          <div className="vn-scene-picker" onClick={(e) => e.stopPropagation()}>
            <button className="vn-history-close" onClick={() => setShowScenePicker(false)}>
              <ArrowRight size={16} />
            </button>
            <div className="vn-scene-picker-title">{stage ? "去别的地方" : "切换场景"}</div>
            {stage && currentScene ? (
              <div className="vn-bg-strip">
                <div className="vn-scene-picker-gname">这里的背景</div>
                <div className="vn-bg-row">
                  {bgThumbs.map(t => (
                    <button key={t.id} className="vn-bg-thumb" data-on={t.on ? "true" : undefined} style={{ backgroundImage: `url(${t.url})` }}
                      onClick={async () => { pickBackground(currentScene, t.id); setAssetMap(prev => ({ ...prev, ...{ [currentScene]: t.url } })); setBgThumbs(b => b.map(x => ({ ...x, on: x.id === t.id }))); }} />
                  ))}
                  <button className="vn-bg-thumb vn-bg-add" onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file"; input.accept = "image/*";
                    input.onchange = async () => {
                      const f = input.files?.[0];
                      if (!f) return;
                      await addBackground(currentScene, f);
                      const m = await resolveStageBgMap([currentScene]);
                      setAssetMap(prev => ({ ...prev, ...m }));
                      void loadBgThumbs(currentScene);
                    };
                    input.click();
                  }}>＋</button>
                </div>
              </div>
            ) : null}
            {stage ? (
              allMaps().map(m => {
                const list = m.places.filter(pl => !pl.sub && !placeLocked(pl));
                if (!list.length) return null;
                return (
                  <div key={m.id} className="vn-scene-picker-group">
                    <div className="vn-scene-picker-gname">{m.label}</div>
                    {list.map((pl) => (
                      <button
                        key={pl.key}
                        className="vn-scene-picker-item"
                        data-active={currentScene === pl.key ? "true" : undefined}
                        onClick={() => handleSceneSwitch(pl.key)}
                      >
                        <div className="vn-scene-picker-dot" />
                        <span className="vn-scene-picker-name">{pl.label}</span>
                      </button>
                    ))}
                  </div>
                );
              }).concat(
                <form key="custom" className="vn-place-custom" onSubmit={(e) => { e.preventDefault(); if (!customPlace.trim()) return; const pl = addCustomPlace(customPlace); setCustomPlace(""); handleSceneSwitch(pl.key); }}>
                  <input value={customPlace} onChange={(e) => setCustomPlace(e.target.value)} placeholder="自己写一个地方" maxLength={20} />
                  <button type="submit" disabled={!customPlace.trim()}>去</button>
                </form>,
              )
            ) : availableScenes.length === 0 ? (
              <div className="vn-scene-picker-empty">暂无场景，请在资源库中上传</div>
            ) : (
              availableScenes.map((scene) => (
                <button
                  key={scene.id}
                  className="vn-scene-picker-item"
                  data-active={currentScene === scene.name ? "true" : undefined}
                  onClick={() => handleSceneSwitch(scene.name)}
                >
                  <div className="vn-scene-picker-dot" />
                  <span className="vn-scene-picker-name">{scene.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Beats Panel ── */}
      {showBeatsPanel && (
        <div className="vn-history-overlay" style={{ background: "transparent", backdropFilter: "none", WebkitBackdropFilter: "none" }} onClick={() => setShowBeatsPanel(false)}>
          <div className="vn-beats-panel" onClick={(e) => e.stopPropagation()}>
            <button className="vn-history-close" onClick={() => setShowBeatsPanel(false)}>
              <ArrowRight size={16} />
            </button>
            <div className="vn-beats-title">情节控制</div>
            {beats.length > 0 && (
              <div className="vn-beat-progress">
                {beats.filter((_, i) => i < activeBeatIdx).length}/{beats.length} 已完成
              </div>
            )}

            {/* Beat list */}
            {beats.map((beat, i) => (
              <div
                key={beat.id}
                className="vn-beat-item"
                data-active={i === activeBeatIdx ? "true" : undefined}
                data-done={i < activeBeatIdx ? "true" : undefined}
                onClick={() => handleSetActiveBeat(i)}
              >
                <div className="vn-beat-marker">
                  {i < activeBeatIdx ? "✓" : i === activeBeatIdx ? <ChevronRight size={10} /> : i + 1}
                </div>
                <div className="vn-beat-body">
                  <div className="vn-beat-name">{beat.title}</div>
                  {beat.description && <div className="vn-beat-desc">{beat.description}</div>}
                </div>
                <button className="vn-beat-del" onClick={(e) => { e.stopPropagation(); handleDeleteBeat(beat.id); }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {/* Add new beat */}
            <div className="vn-beat-add">
              <input
                className="vn-beat-input"
                placeholder="节点名称"
                value={editingBeatTitle}
                onChange={(e) => setEditingBeatTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddBeat(); }}
              />
              <input
                className="vn-beat-input"
                placeholder="描述（可选）"
                value={editingBeatDesc}
                onChange={(e) => setEditingBeatDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddBeat(); }}
              />
              <button className="vn-beat-add-btn" onClick={handleAddBeat} disabled={!editingBeatTitle.trim()}>
                <Plus size={12} /> 添加节点
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Confirm Screen ── */}
      {showArchiveConfirm && (
        <div className="vn-end" onClick={(e) => e.stopPropagation()}>
          <div className="vn-end-line" />
          <div className="vn-end-text">
            {isArchiving ? "归档中..." : stage ? "结束这一场？在场的人会各记一笔" : "是否决定完结该章节并归档？"}
          </div>
          <div className="vn-end-line" />
          {!isArchiving && (
            <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
              <button className="vn-end-btn" onClick={() => setShowArchiveConfirm(false)}>
                返回
              </button>
              <button
                className="vn-end-btn"
                style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }}
                onClick={async () => {
                  if (stage) {
                    setShowArchiveConfirm(false);
                    setStageEnd("working");
                    try { setStageEnd(await closeStageScene(chapterIndex)); }
                    catch (err) { setStageEnd({ error: err instanceof Error ? err.message : String(err) }); }
                    return;
                  }
                  setIsArchiving(true);
                  archiveChapter(session.id, chapterIndex);
                  // Small delay so the user sees the archiving state
                  await new Promise((r) => setTimeout(r, 600));
                  setIsArchiving(false);
                  setShowArchiveConfirm(false);
                  onChapterEnd();
                }}
              >
                确认
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 场景 app：每段的小总结（进短期记忆，能改） ── */}
      {stage && notesOpen && (() => {
        void notesVer;
        const list = chapterSummaries(chapterIndex);
        const big = getStageScene(chapterIdOf(chapterIndex) ?? "")?.bigSummary;
        return (
          <div className="vn-history-overlay" onClick={(e) => { e.stopPropagation(); setNotesOpen(false); setNoteEdit(null); }}>
            <div className="vn-notes" onClick={(e) => e.stopPropagation()}>
              <div className="vn-notes-head">
                <b>每段总结</b>
                <button onClick={() => { setNotesOpen(false); setNoteEdit(null); }}>完成</button>
              </div>
              <p className="vn-notes-tip">每段都会进在场每个人的短期记忆，改了就是改记忆</p>
              {big !== undefined && big ? (
                <div className="vn-note vn-note-big">
                  <div className="vn-note-meta"><span>大总结（代替下面这些小的）</span>
                    <button onClick={() => { setBigSummary(chapterIndex, null); setNotesVer(v => v + 1); }}>撤销</button>
                  </div>
                  {noteEdit?.id === "big" ? (
                    <NoteEditor text={noteEdit.text} onChange={t => setNoteEdit({ id: "big", text: t })} onCancel={() => setNoteEdit(null)}
                      onSave={() => { setBigSummary(chapterIndex, noteEdit.text); setNoteEdit(null); setNotesVer(v => v + 1); }} />
                  ) : <p onClick={() => setNoteEdit({ id: "big", text: big })}>{big}</p>}
                </div>
              ) : null}
              {list.length === 0 ? <p className="vn-notes-tip">还没有，你说第一句以后这里会一段一段多起来</p> : null}
              {list.map((n, i) => (
                <div key={n.id} className="vn-note" data-off={big ? "1" : undefined}>
                  <div className="vn-note-meta">
                    <span>第 {i + 1} 段 · {new Date(n.at).getHours().toString().padStart(2, "0")}:{new Date(n.at).getMinutes().toString().padStart(2, "0")}</span>
                    {!n.summary ? (
                      <button disabled={Boolean(noteBusy)} onClick={async () => {
                        setNoteBusy(n.id);
                        try { await writeSummaryFor(chapterIndex, n.id); setNotesVer(v => v + 1); }
                        catch (err) { showStageToast(err instanceof Error ? err.message : String(err)); }
                        finally { setNoteBusy(""); }
                      }}>{noteBusy === n.id ? "补写中…" : "补写总结"}</button>
                    ) : null}
                  </div>
                  {noteEdit?.id === n.id ? (
                    <NoteEditor text={noteEdit.text} onChange={t => setNoteEdit({ id: n.id, text: t })} onCancel={() => setNoteEdit(null)}
                      onSave={() => { editSummary(n.id, noteEdit.text); setNoteEdit(null); setNotesVer(v => v + 1); }} />
                  ) : n.summary ? <p onClick={() => setNoteEdit({ id: n.id, text: n.summary })}>{n.summary}</p>
                    : <p className="vn-note-empty">这一段没写总结：{n.preview}…</p>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 场景 app：重 roll（能写往哪改） ── */}
      {stage && retryTarget && (
        <div className="vn-history-overlay vn-retry-wrap" onClick={(e) => { e.stopPropagation(); setRetryTarget(null); }}>
          <div className="vn-retry" onClick={(e) => e.stopPropagation()}>
            <b>重roll这段</b>
            <textarea value={retryHint} onChange={(e) => setRetryHint(e.target.value)} placeholder="想往哪个方向改？（只用这一次）" maxLength={300} rows={3} autoFocus />
            {retryHints.length ? (
              <div className="vn-retry-recent">
                <span>最近用过</span>
                {retryHints.map(h => (
                  <span key={h} className="vn-retry-chip">
                    <button onClick={() => setRetryHint(h)}>{h}</button>
                    <button aria-label="删掉" onClick={() => { forgetRetryHint(h); setRetryHints(loadRetryHints()); }}>×</button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="vn-retry-btns">
              <button onClick={() => setRetryTarget(null)}>取消</button>
              <button onClick={() => { const id = retryTarget; setRetryTarget(null); void handleMsgRetry(id); }}>直接重roll</button>
              <button data-main="true" disabled={!retryHint.trim()} onClick={() => { const id = retryTarget; const h = retryHint; setRetryTarget(null); void handleMsgRetry(id, h); }}>按这个改</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 场景 app：左上角时间（她选的 C：大时间 + 日期地点，不要框）；点了能拨时间 ── */}
      {stage && !hideClock && !stageOpening && (
        <button className="vn-hud" onClick={(e) => { e.stopPropagation(); setClockOpen(v => !v); }} title="世界时间">
          <b>{String(new Date(worldNow).getHours()).padStart(2, "0")}:{String(new Date(worldNow).getMinutes()).padStart(2, "0")}</b>
          <span>{new Date(worldNow).getMonth() + 1}月{new Date(worldNow).getDate()}日 星期{"日一二三四五六"[new Date(worldNow).getDay()]}{currentScene ? ` · ${placeByKey(currentScene)?.label ?? currentScene}` : ""}</span>
        </button>
      )}

      {/* ── 场景 app：「···」 ── */}
      {stage && stageMenu && (
        <div className="vn-stage-menu" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setStageMenu(false); setHistoryOpen(true); }}>回顾</button>
          <button onClick={() => { setStageMenu(false); const v = !hideClock; setHideClock(v); saveStageSettings({ ...loadStageSettings(), hideClock: v }); }}>{hideClock ? "显示时间" : "隐藏时间"}</button>
          {!isArchived && <button data-danger="true" onClick={() => { setStageMenu(false); setShowArchiveConfirm(true); }}>结束这一场</button>}
        </div>
      )}

      {/* ── 场景 app：手动拨时间 ── */}
      {stage && clockOpen && (
        <div className="vn-clock-pop" onClick={(e) => e.stopPropagation()}>
          <span>剧情里过了多久？</span>
          <div>
            {[[5, "+5 分"], [15, "+15 分"], [30, "+30 分"], [60, "+1 小时"], [180, "+3 小时"]].map(([m, label]) => (
              <button key={m} onClick={() => { const msg = jumpWorld(Date.now() + Number(m) * 60e3); setWorldNow(Date.now()); setClockOpen(false); if (msg) showStageToast(msg); }}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── 场景 app：开场卡 ── */}
      {stage && stageOpening && stageScene && (
        <div className="vn-stage-open" onClick={(e) => { e.stopPropagation(); setStageOpening(false); }}>
          <div className="vn-stage-open-time">{fmtWorld(stageScene.startAt).replace(/^\d+年/, "")}</div>
          <div className="vn-stage-open-place">{stageScene.place}</div>
          {worldWeatherLabel(stageScene.startAt) ? <div className="vn-stage-open-weather">{worldWeatherLabel(stageScene.startAt)}</div> : null}
          {stageScene.nodeId ? <div className="vn-stage-open-title">{session.chapters[chapterIndex]?.title}</div> : null}
          <div className="vn-stage-open-hint">点一下，说你的第一句</div>
        </div>
      )}

      {stage && stageToast && !stageEnd && (
        <div className="vn-stage-toast" onClick={(e) => { e.stopPropagation(); setStageToast(""); }}>{stageToast}</div>
      )}

      {/* ── 场景 app：结束这一场 ── */}
      {stage && stageEnd && (
        <div className="vn-end" onClick={(e) => e.stopPropagation()}>
          <div className="vn-end-line" />
          {stageEnd === "working" ? (
            <div className="vn-end-text">记一笔中……</div>
          ) : "error" in stageEnd ? (
            <>
              <div className="vn-end-text">没记上：{stageEnd.error}</div>
              <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
                <button className="vn-end-btn" onClick={() => setStageEnd(null)}>返回</button>
              </div>
            </>
          ) : (
            <>
              <div className="vn-end-text">这一场结束了</div>
              {stageEnd.summary ? <div className="vn-stage-sum">{stageEnd.summary}</div> : null}
              {stageEnd.recorded.length ? <div className="vn-stage-sub">{stageEnd.recorded.join("、")}{stageEnd.recorded.length > 1 ? "各" : ""}记了一笔{stageEnd.firstMeet.length ? `；${stageEnd.firstMeet.join("、")}是第一次见你` : ""}</div> : null}
              {stageEnd.milestone ? <div className="vn-stage-sub">🎉 {stageEnd.milestone}</div> : null}
              <button className="vn-end-btn vn-stage-merge" disabled={Boolean(noteBusy)} onClick={async () => {
                setNoteBusy("合成中…");
                try { await mergeSummaries(chapterIndex); setNotesVer(v => v + 1); setNotesOpen(true); }
                catch (err) { showStageToast(err instanceof Error ? err.message : String(err)); }
                finally { setNoteBusy(""); }
              }}>{noteBusy || "把小总结合成一段大总结"}</button>
              {onStageReplay ? <button className="vn-end-btn vn-stage-merge" onClick={onStageReplay}>重播这一场</button> : null}
              <div className="vn-stage-jumps">
                <button className="vn-end-btn" onClick={() => { onChapterEnd(); }}>就这样</button>
                <button className="vn-end-btn" onClick={() => { jumpWorld(Date.now() + 3600e3); onChapterEnd(); }}>过 1 小时</button>
                <button className="vn-end-btn" onClick={() => { const d = new Date(); jumpWorld(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0, 0).getTime()); onChapterEnd(); }}>第二天早上</button>
              </div>
            </>
          )}
          <div className="vn-end-line" />
        </div>
      )}

      {/* ── Replay Confirm Screen ── */}
      {showReplayConfirm && (
        <div className="vn-end" onClick={(e) => e.stopPropagation()}>
          <div className="vn-end-line" />
          <div className="vn-end-text">是否确认章节回放？</div>
          <div className="vn-end-line" />
          <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
            <button className="vn-end-btn" onClick={() => setShowReplayConfirm(false)}>
              返回
            </button>
            <button
              className="vn-end-btn"
              style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }}
              onClick={() => {
                setShowReplayConfirm(false);
                setAutoMode(false);
                setWaitingForInput(false);
                // Build replay frames from chapter messages
                const msgs = loadVnMessagesForChapter(session.id, chapterIndex);
                const frames = buildFramesFromMessages(msgs).frames.filter(f => f.text);
                if (frames.length === 0) {
                  setShowReplayConfirm(false);
                  return;
                }
                setReplayFrames(frames);
                setReplayIdx(0);
                setIsReplaying(true);
                // Apply first frame
                const first = frames[0];
                if (first.bg) setCurrentScene(first.bg);
                if (first.sprite) setCurrentSprite(first.sprite);
                startTyping(getTypingSourceText(first));
              }}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteEditor({ text, onChange, onSave, onCancel }: { text: string; onChange: (t: string) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="vn-note-edit">
      <textarea value={text} autoFocus rows={4} onChange={(e) => onChange(e.target.value)} />
      <div>
        <button onClick={onCancel}>取消</button>
        <button data-save="true" onClick={onSave}>保存</button>
      </div>
    </div>
  );
}
