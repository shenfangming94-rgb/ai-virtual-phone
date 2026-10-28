"use client";

/**
 * 此刻的 BGM：地图首页放地图的歌，进了地点放地点的歌（没配就接着放所在地图的）。
 * 同一套歌接着放不重来；换一套淡出再淡入；没配歌就淡出停掉。播放方式：列表循环 / 单曲循环 / 随机。
 */

import { useEffect, useRef } from "react";
import { getAudioBlob } from "@/lib/music-storage";
import { getNeteasePlayUrl } from "@/lib/music-service";
import { loadStageSettings, resolveBgm, type BgmSong } from "@/lib/idol-stage";
import { kvGet, kvSet } from "@/lib/kv-db";

const FADE_MS = 900;
const MUTE_KEY = "idol_stage_bgm_muted_v1";

export function loadBgmMuted(): boolean {
  return kvGet(MUTE_KEY) === "1";
}
export function saveBgmMuted(v: boolean): void {
  kvSet(MUTE_KEY, v ? "1" : "0");
}

async function songUrl(song: BgmSong): Promise<string | null> {
  if (song.src === "local") {
    const blob = await getAudioBlob(song.id);
    return blob ? URL.createObjectURL(blob) : null;
  }
  return getNeteasePlayUrl(song.id).catch(() => null);
}

function fade(audio: HTMLAudioElement, to: number, done?: () => void): void {
  const from = audio.volume;
  const start = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / FADE_MS);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

/** 整个此刻共用一个播放器：地图页和场景页来回切也不断 */
let current: { audio: HTMLAudioElement; key: string; sig: string; url: string } | null = null;
const lastIdx: Record<string, number> = {};

function stopCurrent(): void {
  const c = current;
  current = null;
  if (!c) return;
  fade(c.audio, 0, () => { c.audio.pause(); if (c.url.startsWith("blob:")) URL.revokeObjectURL(c.url); });
}

export function stopStageBgm(): void {
  if (!current) return;
  current.audio.pause();
  if (current.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
  current = null;
}

export function useStageBgm(placeKey: string, muted: boolean, ver = 0): void {
  const tokenRef = useRef(0);
  useEffect(() => {
    if (muted || !placeKey) { if (muted) stopCurrent(); return; }
    const { key, songs, mode } = resolveBgm(placeKey);
    const sig = `${key}|${mode}|${songs.map(s => `${s.src}:${s.id}`).join(",")}`;
    if (current && current.sig === sig) return;
    stopCurrent();
    if (!songs.length) return;
    const token = ++tokenRef.current;
    const volume = Math.max(0, Math.min(100, loadStageSettings().volume)) / 100;

    const next = (i: number) => (mode === "one" ? i : mode === "shuffle" && songs.length > 1 ? (i + 1 + Math.floor(Math.random() * (songs.length - 1))) % songs.length : (i + 1) % songs.length);
    const playAt = async (i: number, tries = 0): Promise<void> => {
      const url = await songUrl(songs[i % songs.length]);
      if (token !== tokenRef.current) { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); return; }
      if (!url) {
        // 放不了（网易云 VIP、文件没了）就试下一首，一圈都不行就算了
        if (tries + 1 < songs.length) void playAt((i + 1) % songs.length, tries + 1);
        return;
      }
      const a = new Audio(url);
      a.volume = 0;
      a.loop = mode === "one";
      a.onended = () => {
        if (current?.audio !== a) return;
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        current = null;
        lastIdx[key] = next(i);
        void playAt(lastIdx[key]);
      };
      current = { audio: a, key, sig, url };
      lastIdx[key] = i;
      a.play().then(() => fade(a, volume)).catch(() => undefined);
    };
    void playAt(mode === "shuffle" && lastIdx[key] === undefined ? Math.floor(Math.random() * songs.length) : lastIdx[key] ?? 0);
  }, [placeKey, muted, ver]);
}

/** 音量改了马上生效 */
export function setStageBgmVolume(v: number): void {
  if (current) current.audio.volume = Math.max(0, Math.min(100, v)) / 100;
}
