"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Play, Pause, RotateCcw, ArrowRight } from "lucide-react";
import { loadVnMessagesForChapter, loadVnSessions } from "@/lib/vn-storage";
import { parseVnResponse } from "@/lib/vn-parser";
import { getStageScene, resolveStageBgMap } from "@/lib/idol-stage";
import { WORLD_CHAR_ID } from "@/lib/idol-world";
import { getVnSceneLayout } from "@/lib/vn-asset-storage";
import { splitBilingualText } from "@/lib/bilingual-text";
import { BilingualTextBlock } from "@/components/chat/message-bubble";
import { loadBgmMuted, useStageBgm } from "./stage-bgm";
import type { VnFrame } from "@/lib/vn-types";
import "@/styles/vn.css";
import "@/styles/stage-replay.css";

/** Only reads the selected chapter. No engine, settlement, memory or time commands run here. */
export function StageReplay({ chapterIndex, onClose }: { chapterIndex: number; onClose: () => void }) {
  const data = useMemo(() => {
    const session = loadVnSessions().find(s => s.characterId === WORLD_CHAR_ID);
    const chapter = session?.chapters.find(ch => ch.index === chapterIndex);
    const scene = chapter ? getStageScene(chapter.id) : null;
    let bg = scene?.bg ?? "";
    const frames: VnFrame[] = [];
    for (const message of session ? loadVnMessagesForChapter(session.id, chapterIndex) : []) {
      const raw = message.rawContent.replace(/（场外指令：[\s\S]*?）\s*$/, "").trim();
      if (!raw) continue;
      for (const f of parseVnResponse(raw).frames) {
        if (f.bg) bg = f.bg;
        if (f.text) frames.push({ ...f, bg, sourceRole: message.role });
      }
    }
    return { frames, title: chapter?.title || "这一场", startAt: scene?.startAt };
  }, [chapterIndex]);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(false);
  const [ended, setEnded] = useState(false);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const frame = data.frames[index];
  const bilingual = frame ? splitBilingualText(frame.text) : null;
  const source = bilingual?.original ?? frame?.text ?? "";
  const letters = useMemo(() => Array.from(source), [source]);
  const typing = shown < letters.length;
  useEffect(() => {
    let cancelled = false;
    void resolveStageBgMap([...new Set(data.frames.map(f => f.bg).filter((bg): bg is string => Boolean(bg)))]).then(map => { if (!cancelled) setAssets(map); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [data]);
  useEffect(() => {
    if (!typing || ended) return;
    const timer = setTimeout(() => setShown(n => n + 1), 35);
    return () => clearTimeout(timer);
  }, [typing, shown, index, ended]);
  const next = useCallback(() => {
    if (ended || !frame) return;
    if (typing) { setShown(letters.length); return; }
    if (index + 1 >= data.frames.length) { setEnded(true); setAuto(false); return; }
    setIndex(i => i + 1); setShown(0);
  }, [ended, frame, typing, letters.length, index, data.frames.length]);
  useEffect(() => { if (!auto || typing || ended) return; const t = setTimeout(next, 1800); return () => clearTimeout(t); }, [auto, typing, ended, next]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === " " || e.key === "ArrowRight") { e.preventDefault(); next(); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [next, onClose]);
  useStageBgm(frame?.bg ?? "", loadBgmMuted());
  const layout = frame?.bg ? getVnSceneLayout(frame.bg) : {};
  const text = letters.slice(0, shown).join("");
  const renderedText = bilingual && !typing ? `${text}|${bilingual.translated}` : text;
  return <div className="vn-shell" data-stage="true" data-vn-theme="default" data-replay="true" onClick={e => { if (!(e.target as HTMLElement).closest("button, a, input, select, textarea")) next(); }}>
    <div className="vn-scene" style={{ backgroundImage: frame?.bg && assets[frame.bg] ? `url(${assets[frame.bg]})` : "linear-gradient(180deg,#3d4051,#141522)", backgroundSize: "cover", backgroundPosition: "center", transform: `translate(${(layout.x ?? 50) - 50}%,${(layout.y ?? 50) - 50}%) scale(${(layout.scale ?? 100) / 100})` }} />
    <div className="vn-atmosphere" />
    <div className="vn-topbar" onClick={e => e.stopPropagation()}><div className="vn-topbar-safe-area" /><div className="vn-topbar-content"><button className="vn-topbar-btn" aria-label="退出重播" onClick={onClose}><ArrowLeft size={20} /></button><span className="stg-replay-title">重播 · {data.title}</span><span className="stg-replay-count">{data.frames.length ? `${index + 1} / ${data.frames.length}` : ""}</span></div></div>
    {!ended && frame ? <><div className="vn-dialogue"><div className="vn-dialogue-inner">{frame.speaker ? <div className="vn-name">{frame.sourceRole === "user" ? "你" : frame.speaker}</div> : null}<div className={`vn-text ${!frame.speaker ? "vn-text-narration" : ""}`}>{bilingual && !typing ? <BilingualTextBlock text={renderedText} mode="plain" defaultExpanded /> : text}</div>{!typing ? <div className="vn-advance"><ChevronDown size={16} /></div> : null}</div></div><div className="vn-controls" onClick={e => e.stopPropagation()}><button className="vn-ctrl-btn" aria-label={auto ? "暂停自动播放" : "自动播放"} data-active={auto || undefined} onClick={() => setAuto(v => !v)}>{auto ? <Pause size={15} /> : <Play size={15} />}</button><button className="vn-ctrl-btn" aria-label="下一条" onClick={next}><ArrowRight size={16} /></button></div></> : <div className="vn-end" onClick={e => e.stopPropagation()}><div className="vn-end-text">{data.frames.length ? "重播结束" : "这一场还没有可重播的剧情"}</div><div className="stg-replay-actions">{data.frames.length ? <button className="vn-end-btn" onClick={() => { setIndex(0); setShown(0); setEnded(false); }}><RotateCcw size={15} />再看一遍</button> : null}<button className="vn-end-btn" onClick={onClose}>返回</button></div></div>}
  </div>;
}
