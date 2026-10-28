"use client";
import { useEffect, useState } from "react";
import { getAudioBlob } from "@/lib/music-storage";
import { getNeteasePlayUrl } from "@/lib/music-service";
import { loadStageSettings, resolveBgm, type BgmSong, type BgmMode } from "@/lib/idol-stage";
import { kvGet, kvSet } from "@/lib/kv-db";
const EVENT = "idol-stage-music-change";
const MUTE_KEY = "idol_stage_bgm_muted_v1";
export function loadBgmMuted(): boolean { return kvGet(MUTE_KEY) === "1"; }
export function saveBgmMuted(v: boolean): void { kvSet(MUTE_KEY, v ? "1" : "0"); }
let current: { audio: HTMLAudioElement; url: string; song: BgmSong } | null = null;
let generation = 0;
let place = "";
let signature = "";
let queue: BgmSong[] = [];
let mode: BgmMode = "list";
let index = 0;
let manual = false;
let error = "";
const notify = () => window.dispatchEvent(new Event(EVENT));
export function getStageMusicState() { return { song: current?.song, paused: !current || current.audio.paused, mode, error }; }
export function useStageMusicState() {
  const [state, setState] = useState(getStageMusicState);
  useEffect(() => { const update = () => setState(getStageMusicState()); window.addEventListener(EVENT, update); update(); return () => window.removeEventListener(EVENT, update); }, []);
  return state;
}
function clearAudio() {
  if (current) { current.audio.pause(); current.audio.onended = null; if (current.url.startsWith("blob:")) URL.revokeObjectURL(current.url); current = null; }
}
async function playAt(i: number, tries = 0): Promise<void> {
  const token = ++generation;
  clearAudio(); error = "";
  if (!queue.length) { notify(); return; }
  index = ((i % queue.length) + queue.length) % queue.length;
  const song = queue[index];
  notify();
  let url: string | null = null;
  try { if (song.src === "local") { const blob = await getAudioBlob(song.id); url = blob ? URL.createObjectURL(blob) : null; } else url = await getNeteasePlayUrl(song.id); } catch { /* shown below */ }
  if (token !== generation) { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); return; }
  const failed = () => {
    if (token !== generation) return;
    if (tries + 1 < queue.length) void playAt(index + 1, tries + 1);
    else { clearAudio(); error = "这些音乐暂时无法播放，请检查连接或音乐文件"; notify(); }
  };
  if (!url) { failed(); return; }
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(100, loadStageSettings().volume)) / 100;
  audio.loop = mode === "one";
  current = { audio, url, song };
  audio.onended = () => { if (token === generation) nextStageMusic(); };
  audio.onerror = failed;
  try { await audio.play(); } catch { if (token === generation) error = "未能播放，点播放重试或换一首"; }
  if (token === generation) notify();
}
export function nextStageMusic(): void {
  const n = mode === "one" ? index : mode === "shuffle" && queue.length > 1 ? (index + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length : index + 1;
  void playAt(n);
}
export function chooseStageMusic(songs: BgmSong[], at: number, playbackMode: BgmMode): void {
  manual = true; signature = ""; queue = songs; mode = playbackMode; saveBgmMuted(false); void playAt(at);
}
export function setStageMusicMode(value: BgmMode): void { mode = value; if (current) current.audio.loop = value === "one"; notify(); }
export function toggleStageMusic(): void {
  if (!current) { if (queue.length) { saveBgmMuted(false); void playAt(index); } return; }
  if (current.audio.paused) { saveBgmMuted(false); void current.audio.play().then(notify).catch(() => { error = "未能播放，请换一首或检查连接"; notify(); }); }
  else { current.audio.pause(); saveBgmMuted(true); notify(); }
}
export function stopStageBgm(): void { ++generation; clearAudio(); place = ""; signature = ""; manual = false; queue = []; notify(); }
export function useStageBgm(placeKey: string, muted: boolean, ver = 0): void {
  useEffect(() => {
    if (!placeKey) return;
    const changed = place !== placeKey;
    if (changed) { manual = false; place = placeKey; }
    if (muted) { ++generation; clearAudio(); signature = ""; notify(); return; }
    if (manual && !changed) return;
    const resolved = resolveBgm(placeKey);
    const sig = `${resolved.key}|${resolved.mode}|${resolved.songs.map(s => `${s.src}:${s.id}`).join(",")}`;
    if (signature === sig && current) return;
    signature = sig; queue = resolved.songs; mode = resolved.mode;
    void playAt(mode === "shuffle" ? Math.floor(Math.random() * queue.length) : 0);
  }, [placeKey, muted, ver]);
}
export function setStageBgmVolume(v: number): void { if (current) current.audio.volume = Math.max(0, Math.min(100, v)) / 100; }
