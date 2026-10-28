"use client";

/**
 * 场景 app 的 BGM：跟着背景（地点）换歌。同一个地点里接着放、放完换下一首；换地点淡出再淡入；这个地点没配歌就淡出停掉。
 */

import { useEffect, useRef } from "react";
import { getAudioBlob } from "@/lib/music-storage";
import { getNeteasePlayUrl } from "@/lib/music-service";
import { loadBgmMap, type BgmSong } from "@/lib/idol-stage";
import { kvGet, kvSet } from "@/lib/kv-db";

const VOLUME = 0.55;
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

export function useStageBgm(placeKey: string, muted: boolean): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const placeRef = useRef("");
  const idxRef = useRef<Record<string, number>>({});
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (muted) {
      const a = audioRef.current;
      if (a) fade(a, 0, () => a.pause());
      placeRef.current = "";
      return;
    }
    if (!placeKey || placeKey === placeRef.current) return;
    const songs = loadBgmMap()[placeKey] ?? [];
    const old = audioRef.current;
    placeRef.current = placeKey;
    let cancelled = false;

    const playAt = async (i: number, tries = 0) => {
      const song = songs[i % songs.length];
      const url = await songUrl(song);
      if (cancelled || placeRef.current !== placeKey) return;
      if (!url) {
        // 放不了（网易云 VIP、文件没了）就试下一首，一圈都不行就算了
        if (tries + 1 < songs.length) void playAt(i + 1, tries + 1);
        return;
      }
      if (urlRef.current?.startsWith("blob:")) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      const a = new Audio(url);
      a.volume = 0;
      a.onended = () => {
        idxRef.current[placeKey] = (i + 1) % songs.length;
        if (placeRef.current === placeKey) void playAt(i + 1);
      };
      audioRef.current = a;
      a.play().then(() => fade(a, VOLUME)).catch(() => undefined);
    };

    if (old) fade(old, 0, () => old.pause());
    if (songs.length) void playAt(idxRef.current[placeKey] ?? 0);
    else audioRef.current = null;
    return () => { cancelled = true; };
  }, [placeKey, muted]);

  // 离开就停
  useEffect(() => () => {
    audioRef.current?.pause();
    if (urlRef.current?.startsWith("blob:")) URL.revokeObjectURL(urlRef.current);
  }, []);
}
