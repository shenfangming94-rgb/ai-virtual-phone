"use client";
import { useState } from "react";
import { Music2, Pause, Play, SkipForward, Plus, Volume1, Volume2, MoreHorizontal, AudioLines, X } from "lucide-react";
import { SongPicker } from "./stage-home";
import { chooseStageMusic, nextStageMusic, setStageBgmVolume, setStageMusicMode, toggleStageMusic, useStageMusicState } from "./stage-bgm";
import { loadStageSettings, saveStageSettings, type BgmMode, type BgmSong } from "@/lib/idol-stage";
import { loadMusicLibrary, saveMusicLibrary, songKey, type MusicLibrary } from "@/lib/idol-music-library";
import "@/styles/stage-music.css";
export function StageMusicPanel({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const [library, setLibrary] = useState(loadMusicLibrary);
  const [group, setGroup] = useState("all");
  const [manage, setManage] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [songMenu, setSongMenu] = useState<string | null>(null);
  const [volume, setVolume] = useState(() => loadStageSettings().volume);
  const state = useStageMusicState();
  const update = (next: MusicLibrary) => { setLibrary(next); saveMusicLibrary(next); };
  const visible = library.songs.filter(s => group === "all" || (group === "ungrouped" ? !library.membership[songKey(s)] : library.membership[songKey(s)] === group));
  const add = (song: BgmSong) => {
    // SongPicker can add several files in one upload; read the latest saved value for each one.
    const latest = loadMusicLibrary();
    const songs = new Map(latest.songs.map(s => [songKey(s), s])); songs.set(songKey(song), song);
    const membership = { ...latest.membership };
    if (group !== "all" && group !== "ungrouped") membership[songKey(song)] = group;
    update({ ...latest, songs: [...songs.values()], membership });
  };
  return <div className="smu-mask" onClick={e => { e.stopPropagation(); onClose(); }}>
    <section className="smu-panel" role="dialog" aria-label="音乐" onClick={e => e.stopPropagation()}>
      <div className="smu-handle" />
      <header><b>音乐</b><button onClick={onClose}>完成</button></header>
      <div className="smu-playing"><span className="smu-art"><Music2 size={25} /></span><div className="smu-info"><b>{state.song?.title || "还没播放音乐"}</b><small>{state.song ? `${state.paused ? "已暂停" : "正在播放"}${state.song.artist ? ` · ${state.song.artist}` : ""}` : "选一首，配上此刻的心情"}</small></div><button aria-label={state.paused ? "播放" : "暂停"} onClick={() => { if (state.paused) onPlay(); toggleStageMusic(); }}>{state.paused ? <Play size={24} /> : <Pause size={24} />}</button><button aria-label="下一首" onClick={() => { onPlay(); nextStageMusic(); }}><SkipForward size={22} /></button></div>
      {state.error ? <p className="smu-error">{state.error}</p> : null}
      <div className="smu-volume"><Volume1 size={16} /><input aria-label="音乐音量" type="range" min={0} max={100} value={volume} onChange={e => { const v = Number(e.target.value); setVolume(v); saveStageSettings({ ...loadStageSettings(), volume: v }); setStageBgmVolume(v); }} /><Volume2 size={18} /></div>
      <div className="smu-section"><b>我的分组</b><button onClick={() => setManage(!manage)}>{manage ? "收起" : "管理分组"}</button></div>
      {manage ? <div className="smu-manage"><div className="smu-group-list">{library.groups.map(g => <div key={g.id}><span>{g.name}</span><button onClick={() => { setEditing(g.id); setName(g.name); }}>改名</button><button onClick={() => { const membership = Object.fromEntries(Object.entries(library.membership).filter(([, id]) => id !== g.id)); update({ ...library, groups: library.groups.filter(x => x.id !== g.id), membership }); if (group === g.id) setGroup("all"); if (editing === g.id) { setEditing(null); setName(""); } }}>删除分组</button></div>)}</div><form onSubmit={e => { e.preventDefault(); const value = name.trim(); if (!value) return; if (library.groups.some(g => g.name === value && g.id !== editing)) return; const groups = editing ? library.groups.map(g => g.id === editing ? { ...g, name: value } : g) : [...library.groups, { id: globalThis.crypto?.randomUUID?.() ?? `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`, name: value }]; update({ ...library, groups }); setName(""); setEditing(null); }}><input aria-label="分组名称" placeholder="输入分组名称" value={name} maxLength={24} onChange={e => setName(e.target.value)} /><button type="submit">{editing ? "保存" : "新建分组"}</button>{editing ? <button type="button" aria-label="取消改名" onClick={() => { setEditing(null); setName(""); }}><X size={14} /></button> : null}</form><small>删除分组会保留音乐，移到未分组。</small></div> : null}
      <nav className="smu-tabs">{[{ id: "all", name: "全部" }, { id: "ungrouped", name: "未分组" }, ...library.groups].map(g => <button key={g.id} data-on={group === g.id || undefined} onClick={() => setGroup(g.id)}>{g.name}</button>)}</nav>
      <div className="smu-list">{visible.map((song, i) => { const key = songKey(song); const active = state.song && songKey(state.song) === key; return <div key={key} className="smu-track" data-active={active || undefined}><div className="smu-track-main"><button className="smu-song" onClick={() => { onPlay(); chooseStageMusic(visible, i, state.mode); }}>{active ? <AudioLines size={18} /> : <Music2 size={18} />}<span className="smu-info"><b>{song.title}</b><small>{song.artist ? `${song.artist} · ` : ""}{song.src === "netease" ? "网易云音乐" : "本地音乐"}</small></span></button><button aria-label={`管理音乐 ${song.title}`} onClick={() => setSongMenu(songMenu === key ? null : key)}><MoreHorizontal size={18} /></button></div>{songMenu === key ? <div className="smu-move"><label>移到分组<select aria-label={`移动 ${song.title} 到分组`} value={library.membership[key] || ""} onChange={e => { const membership = { ...library.membership }; if (e.target.value) membership[key] = e.target.value; else delete membership[key]; update({ ...library, membership }); setSongMenu(null); }}><option value="">未分组</option>{library.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label></div> : null}</div>; })}{!visible.length ? <p className="smu-empty">{group === "all" ? "还没有音乐，添加你喜欢的歌吧" : "这个分组还没有音乐"}</p> : null}</div>
      <button className="smu-add" onClick={() => setPicking(true)}><Plus size={17} />添加音乐</button>
      <footer><select aria-label="播放方式" value={state.mode} onChange={e => setStageMusicMode(e.target.value as BgmMode)}><option value="list">列表循环</option><option value="one">单曲循环</option><option value="shuffle">随机播放</option></select><small>换地点时，播放新地点的音乐</small></footer>
    </section>
    {picking ? <div className="smu-picker" onClick={e => e.stopPropagation()}><SongPicker chosen={library.songs} onClose={() => setPicking(false)} onAdd={add} /></div> : null}
  </div>;
}
