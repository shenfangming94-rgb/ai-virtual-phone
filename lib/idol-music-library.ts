import { kvGet, kvSet } from "@/lib/kv-db";
import { loadBgmMap, type BgmSong } from "@/lib/idol-stage";
export type MusicGroup = { id: string; name: string };
export type MusicLibrary = { songs: BgmSong[]; groups: MusicGroup[]; membership: Record<string, string> };
const KEY = "idol_stage_music_library_v1";
export const songKey = (s: BgmSong) => `${s.src}:${s.id}`;
export function loadMusicLibrary(): MusicLibrary {
  let data: MusicLibrary | null = null;
  try { data = JSON.parse(kvGet(KEY) || "null"); } catch { data = null; }
  const songs = new Map<string, BgmSong>();
  for (const s of [...Object.values(loadBgmMap()).flat(), ...(data?.songs ?? [])]) songs.set(songKey(s), s);
  return { songs: [...songs.values()], groups: data?.groups ?? [], membership: data?.membership ?? {} };
}
export function saveMusicLibrary(data: MusicLibrary): void { kvSet(KEY, JSON.stringify(data)); }
