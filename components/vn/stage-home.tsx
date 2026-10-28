"use client";

/**
 * 场景 app 首页：地图。首尔大地图 → 点地点进去（或者进小地图）。
 * 地图图片、钉子位置、每个地点的背景和 BGM 都是她自己配。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MoreHorizontal, X, Lock, Music2, Image as ImageIcon, Check, Search, Play } from "lucide-react";
import {
  STAGE_APP_NAME, STAGE_OPEN_EVENT, loadBgmMap, loadMapLooks, mapById, openStageScenes, pastStageScenes, placeLocked,
  saveBgmFor, saveMapLook, startNodeStage, startStageScene, takePendingStage, type BgmSong, type MapLook, type StagePlace,
} from "@/lib/idol-stage";
import { WORLD_CHAR_ID } from "@/lib/idol-world";
import { nodeById } from "@/lib/idol-career";
import { loadProfiles, relationOf } from "@/lib/idol-people";
import { loadAllCharacters } from "@/lib/character-storage";
import { addVnScene, deleteVnScene, loadVnScenes, resolveVnAssetMap } from "@/lib/vn-asset-storage";
import { getThemeAssetMap, saveThemeAssetFromBlob } from "@/lib/theme-storage";
import { generateTrackId, getAudioDuration, loadAllTracks, parseFilename, saveTrack, type MusicTrack } from "@/lib/music-storage";
import { getPlaylistTracks, getUserPlaylists, isNeteaseConfigured, searchNetease, type NeteasePlaylist, type NeteaseSearchResult } from "@/lib/music-service";
import { subscribeWorldClock } from "@/lib/world-clock";

/** Date.now() 已经是世界时间；每 20 秒或者时钟一动就刷新 */
function useWorldNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 20e3);
    const off = subscribeWorldClock(() => setNow(Date.now()));
    return () => { window.clearInterval(t); off(); };
  }, []);
  return now;
}

type Props = { onClose: () => void; onPlay: (chapterIndex: number) => void };

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function pickImage(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function StageHome({ onClose, onPlay }: Props) {
  const now = useWorldNow();
  const [mapId, setMapId] = useState("seoul");
  const [looks, setLooks] = useState<Record<string, MapLook>>(() => loadMapLooks());
  const [mapUrl, setMapUrl] = useState("");
  const [sheet, setSheet] = useState<StagePlace | null>(null);
  const [menu, setMenu] = useState(false);
  const [pinEdit, setPinEdit] = useState<string | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [, bump] = useState(0);
  const map = mapById(mapId);
  const look = looks[mapId] ?? { pins: {} };

  // 别的 app 让这里开一场（提醒事项「去演」、横幅）
  useEffect(() => {
    const open = () => {
      const pending = takePendingStage();
      const node = pending ? nodeById(pending.nodeId) : undefined;
      if (!node) return;
      const r = startNodeStage(node);
      if (r) onPlay(r.chapterIndex);
    };
    open();
    window.addEventListener(STAGE_OPEN_EVENT, open);
    return () => window.removeEventListener(STAGE_OPEN_EVENT, open);
  }, [onPlay]);

  useEffect(() => {
    let off = false;
    if (!look.imageAssetId) { setMapUrl(""); return; }
    void getThemeAssetMap([look.imageAssetId]).then(m => { if (!off) setMapUrl(m[look.imageAssetId!] || ""); });
    return () => { off = true; };
  }, [look.imageAssetId]);

  const updateLook = (next: MapLook) => {
    saveMapLook(mapId, next);
    setLooks(loadMapLooks());
  };

  const tapPlace = (pl: StagePlace) => {
    if (pinEdit !== null) { setPinEdit(pl.key); return; }
    if (pl.sub && !placeLocked(pl)) { setMapId(pl.sub); return; }
    setSheet(pl);
  };

  const openScenes = openStageScenes();
  const d = new Date(now);
  const clock = `周${WEEK[d.getDay()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="stg">
      <div className="stg-bar">
        <button type="button" className="stg-ic" onClick={() => (map.parent ? setMapId(map.parent) : onClose())} aria-label="返回">
          <ChevronLeft size={24} />
        </button>
        <div className="stg-title">
          <b>{map.label}</b>
          <span>{clock}</span>
        </div>
        <button type="button" className="stg-ic" onClick={() => setMenu(true)} aria-label="地图设置">
          <MoreHorizontal size={22} />
        </button>
      </div>

      {mapUrl ? (
        <MapImage url={mapUrl} places={map.places} look={look} editing={pinEdit} onTap={tapPlace}
          onPlace={(x, y) => { if (pinEdit) { updateLook({ ...look, pins: { ...look.pins, [pinEdit]: { x, y } } }); setPinEdit(""); } }} />
      ) : (
        <div className="stg-grid-wrap">
          <div className="stg-grid">
            {map.places.map(pl => {
              const lock = placeLocked(pl);
              return (
                <button key={pl.key} type="button" className="stg-card" data-lock={lock ? "1" : undefined} onClick={() => tapPlace(pl)}>
                  <span className="stg-pin" />
                  <span className="stg-card-name">{pl.label}{pl.sub ? " ›" : ""}</span>
                  {lock ? <span className="stg-card-lock"><Lock size={11} /> {lock}</span> : null}
                </button>
              );
            })}
          </div>
          <p className="stg-tip">右上角 ··· 可以换成你自己的地图图片</p>
        </div>
      )}

      {pinEdit !== null ? (
        <div className="stg-pinbar">
          <div className="stg-pinbar-head">
            <span>{pinEdit ? `点地图，把「${map.places.find(x => x.key === pinEdit)?.label}」放上去` : "先选一个地点，再点地图上它的位置"}</span>
            <button type="button" onClick={() => setPinEdit(null)}>完成</button>
          </div>
          <div className="stg-pinbar-list">
            {map.places.map(pl => (
              <button key={pl.key} type="button" data-on={pinEdit === pl.key ? "1" : undefined} data-done={look.pins[pl.key] ? "1" : undefined} onClick={() => setPinEdit(pl.key)}>
                {look.pins[pl.key] ? <Check size={12} /> : null}{pl.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="stg-dock">
          {openScenes.slice(0, 2).map(s => (
            <button key={s.chapterIndex} type="button" className="stg-continue" onClick={() => onPlay(s.chapterIndex)}>
              <Play size={14} fill="currentColor" />
              <span><b>继续：{s.title}</b><small>{s.subtitle}</small></span>
            </button>
          ))}
          <button type="button" className="stg-past-btn" onClick={() => setPastOpen(true)}>以前的场景</button>
        </div>
      )}

      {menu ? (
        <div className="stg-mask" onClick={() => setMenu(false)}>
          <div className="stg-menu" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={async () => {
              setMenu(false);
              const f = await pickImage();
              if (!f) return;
              const id = await saveThemeAssetFromBlob(f, "vn_scene");
              updateLook({ ...look, imageAssetId: id });
            }}>{look.imageAssetId ? "换地图图片" : "上传地图图片"}</button>
            {look.imageAssetId ? <button type="button" onClick={() => { setMenu(false); setPinEdit(""); }}>摆地点的位置</button> : null}
            {look.imageAssetId ? <button type="button" className="stg-danger" onClick={() => { setMenu(false); updateLook({ pins: look.pins }); }}>去掉地图图片</button> : null}
            <button type="button" className="stg-cancel" onClick={() => setMenu(false)}>取消</button>
          </div>
        </div>
      ) : null}

      {sheet ? (
        <PlaceSheet place={sheet} onClose={() => { setSheet(null); bump(n => n + 1); }} onGo={(meet, avoid) => {
          const r = startStageScene({ placeKey: sheet.key, meetIds: meet, avoid });
          setSheet(null);
          if (r) onPlay(r.chapterIndex);
        }} />
      ) : null}

      {pastOpen ? <PastSheet onClose={() => setPastOpen(false)} onPlay={i => { setPastOpen(false); onPlay(i); }} /> : null}
    </div>
  );
}

// ── 有图片的地图：竖着铺满、左右拖，钉子按百分比放 ──

function MapImage({ url, places, look, editing, onTap, onPlace }: {
  url: string; places: StagePlace[]; look: MapLook; editing: string | null;
  onTap: (pl: StagePlace) => void; onPlace: (x: number, y: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const centered = useRef(false);
  return (
    <div className="stg-map" ref={scroller}>
      <div className="stg-map-inner" onClick={e => {
        if (!editing) return;
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        onPlace(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
      }}>
        <img src={url} alt="" draggable={false} onLoad={() => {
          const el = scroller.current;
          if (el && !centered.current) { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; centered.current = true; }
        }} />
        {places.map(pl => {
          const pos = look.pins[pl.key];
          if (!pos) return null;
          const lock = placeLocked(pl);
          return (
            <button key={pl.key} type="button" className="stg-mpin" data-lock={lock ? "1" : undefined} data-edit={editing === pl.key ? "1" : undefined}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              onClick={e => { e.stopPropagation(); onTap(pl); }}>
              <i />
              <b>{lock ? <Lock size={10} /> : null}{pl.label}{pl.sub ? " ›" : ""}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 点一个地点：碰见谁、背景、音乐、进去 ──

type Mark = "meet" | "avoid";

function PlaceSheet({ place, onClose, onGo }: { place: StagePlace; onClose: () => void; onGo: (meet: string[], avoid: string[]) => void }) {
  const lock = placeLocked(place);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [bgUrl, setBgUrl] = useState("");
  const [songs, setSongs] = useState<BgmSong[]>(() => loadBgmMap()[place.key] ?? []);
  const [picking, setPicking] = useState(false);

  const people = useMemo(() => {
    const profiles = loadProfiles();
    return loadAllCharacters()
      .filter(c => c.id !== WORLD_CHAR_ID && profiles[c.id] && (profiles[c.id].met || profiles[c.id].layer === "main"))
      .map(c => ({ c, p: profiles[c.id] }))
      .sort((a, b) => (b.p.layer === "main" ? 1 : 0) - (a.p.layer === "main" ? 1 : 0) || (b.p.events.length - a.p.events.length));
  }, []);

  const loadBg = useCallback(() => {
    void resolveVnAssetMap([place.key], "scene", WORLD_CHAR_ID).then(m => setBgUrl(m[place.key] || ""));
  }, [place.key]);
  useEffect(loadBg, [loadBg]);

  const cycle = (id: string) => setMarks(m => {
    const next = { ...m };
    if (!m[id]) next[id] = "meet";
    else if (m[id] === "meet") next[id] = "avoid";
    else delete next[id];
    return next;
  });

  const setSongList = (list: BgmSong[]) => { setSongs(list); saveBgmFor(place.key, list); };

  return (
    <div className="stg-mask" onClick={onClose}>
      <div className="stg-sheet" onClick={e => e.stopPropagation()}>
        <div className="stg-sheet-cover" style={bgUrl ? { backgroundImage: `url(${bgUrl})` } : undefined}>
          <button type="button" className="stg-sheet-x" onClick={onClose} aria-label="关闭"><X size={18} /></button>
          <div className="stg-sheet-name">{place.label}</div>
          {place.key.includes("·") ? <div className="stg-sheet-area">{place.key.split("·")[0]}</div> : null}
        </div>

        {lock ? <p className="stg-sheet-lock"><Lock size={13} /> {lock}</p> : (
          <>
            <div className="stg-sec">
              <div className="stg-sec-head">碰见谁<small>点一下想碰见，再点一下不想碰见，都不选就交给世界</small></div>
              {people.length ? (
                <div className="stg-chips">
                  {people.map(({ c, p }) => (
                    <button key={c.id} type="button" className="stg-chip" data-mark={marks[c.id]} onClick={() => cycle(c.id)}>
                      {marks[c.id] === "avoid" ? "✕ " : marks[c.id] === "meet" ? "✓ " : ""}{c.name}
                      <small>{relationOf(p)}</small>
                    </button>
                  ))}
                </div>
              ) : <p className="stg-empty">还谁都不认识，进去看看会碰上谁</p>}
            </div>
            <button type="button" className="stg-go" onClick={() => {
              const meet = Object.keys(marks).filter(id => marks[id] === "meet");
              const avoid = people.filter(({ c }) => marks[c.id] === "avoid").map(({ c }) => c.name);
              onGo(meet, avoid);
            }}>进去</button>
          </>
        )}

        <div className="stg-sec stg-sec-set">
          <div className="stg-row">
            <ImageIcon size={16} />
            <span>背景</span>
            <button type="button" onClick={async () => {
              const f = await pickImage();
              if (!f) return;
              for (const s of loadVnScenes(WORLD_CHAR_ID).filter(s => s.name === place.key)) await deleteVnScene(s.id);
              await addVnScene(WORLD_CHAR_ID, place.key, f);
              loadBg();
            }}>{bgUrl ? "换一张" : "上传"}</button>
          </div>
          <div className="stg-row">
            <Music2 size={16} />
            <span>音乐</span>
            <button type="button" onClick={() => setPicking(true)}>加歌</button>
          </div>
          {songs.length ? (
            <ul className="stg-songs">
              {songs.map((s, i) => (
                <li key={`${s.src}_${s.id}`}>
                  <span>{s.title}{s.artist ? <small> · {s.artist}</small> : null}{s.src === "netease" ? <em>网易云</em> : null}</span>
                  <button type="button" aria-label="去掉" onClick={() => setSongList(songs.filter((_, j) => j !== i))}><X size={14} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="stg-empty">还没配歌，到这里就安安静静的</p>}
        </div>
      </div>
      {picking ? <SongPicker chosen={songs} onClose={() => setPicking(false)} onAdd={s => setSongList([...songs, s])} /> : null}
    </div>
  );
}

// ── 加歌：自己传的 mp3 / 网易云 ──

function SongPicker({ chosen, onClose, onAdd }: { chosen: BgmSong[]; onClose: () => void; onAdd: (s: BgmSong) => void }) {
  const [tab, setTab] = useState<"local" | "netease">("local");
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<NeteaseSearchResult[]>([]);
  const [lists, setLists] = useState<NeteasePlaylist[]>([]);
  const [busy, setBusy] = useState("");
  const has = (src: string, id: string | number) => chosen.some(s => s.src === src && String(s.id) === String(id));

  useEffect(() => { void loadAllTracks().then(setTracks).catch(() => setTracks([])); }, []);
  useEffect(() => {
    if (tab !== "netease" || lists.length || !isNeteaseConfigured()) return;
    void getUserPlaylists().then(setLists).catch(() => undefined);
  }, [tab, lists.length]);

  const upload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.multiple = true;
    input.onchange = async () => {
      setBusy("上传中…");
      for (const f of Array.from(input.files ?? [])) {
        const meta = parseFilename(f.name);
        const track: MusicTrack = { id: generateTrackId(), ...meta, duration: await getAudioDuration(f).catch(() => 0), liked: false, addedAt: new Date().toISOString() };
        await saveTrack(track, f);
        onAdd({ src: "local", id: track.id, title: track.title, artist: track.artist });
      }
      setTracks(await loadAllTracks());
      setBusy("");
    };
    input.click();
  };

  return (
    <div className="stg-mask stg-mask-top" onClick={onClose}>
      <div className="stg-sheet stg-picker" onClick={e => e.stopPropagation()}>
        <div className="stg-picker-head">
          <div className="stg-seg">
            <button type="button" data-on={tab === "local" ? "1" : undefined} onClick={() => setTab("local")}>我的 mp3</button>
            <button type="button" data-on={tab === "netease" ? "1" : undefined} onClick={() => setTab("netease")}>网易云</button>
          </div>
          <button type="button" className="stg-done" onClick={onClose}>完成</button>
        </div>
        {busy ? <p className="stg-empty">{busy}</p> : null}
        {tab === "local" ? (
          <>
            <button type="button" className="stg-upload" onClick={upload}>＋ 上传 mp3</button>
            <ul className="stg-tracks" hidden={!tracks.length}>
              {tracks.map(t => (
                <li key={t.id}>
                  <span>{t.title}<small>{t.artist}</small></span>
                  {has("local", t.id) ? <Check size={16} /> : <button type="button" onClick={() => onAdd({ src: "local", id: t.id, title: t.title, artist: t.artist })}>加</button>}
                </li>
              ))}
            </ul>
            {!tracks.length ? <p className="stg-empty">音乐库里还没有歌</p> : null}
          </>
        ) : !isNeteaseConfigured() ? (
          <p className="stg-empty">还没连网易云，去「设置」里的音乐接口填好、登录就能用</p>
        ) : (
          <>
            <form className="stg-search" onSubmit={async e => {
              e.preventDefault();
              if (!q.trim()) return;
              setBusy("搜索中…");
              setResults(await searchNetease(q.trim(), 20).catch(() => []));
              setBusy("");
            }}>
              <Search size={15} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜歌名、歌手" />
            </form>
            <ul className="stg-tracks">
              {results.map(r => (
                <li key={r.id}>
                  <span>{r.name}<small>{r.artists}</small></span>
                  {has("netease", r.id) ? <Check size={16} /> : <button type="button" onClick={() => onAdd({ src: "netease", id: r.id, title: r.name, artist: r.artists })}>加</button>}
                </li>
              ))}
              {!results.length && lists.length ? (
                <>
                  <p className="stg-sub">我的歌单</p>
                  {lists.map(l => (
                    <li key={l.id}>
                      <span>{l.name}<small>{l.trackCount} 首</small></span>
                      <button type="button" onClick={async () => { setBusy("读歌单…"); setResults(await getPlaylistTracks(l.id).catch(() => [])); setBusy(""); }}>打开</button>
                    </li>
                  ))}
                </>
              ) : null}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ── 以前的场景 ──

function PastSheet({ onClose, onPlay }: { onClose: () => void; onPlay: (i: number) => void }) {
  const list = pastStageScenes();
  const open = openStageScenes();
  return (
    <div className="stg-mask" onClick={onClose}>
      <div className="stg-sheet stg-picker" onClick={e => e.stopPropagation()}>
        <div className="stg-picker-head">
          <b>{STAGE_APP_NAME} · 以前的场景</b>
          <button type="button" className="stg-done" onClick={onClose}>完成</button>
        </div>
        <ul className="stg-tracks">
          {open.map(s => (
            <li key={s.chapterIndex} onClick={() => onPlay(s.chapterIndex)}>
              <span>{s.title}<small>{s.subtitle} · 还没结束</small></span>
            </li>
          ))}
          {list.map(s => (
            <li key={s.chapterIndex} onClick={() => onPlay(s.chapterIndex)}>
              <span>{s.title}<small>{s.subtitle}{s.scene.summary ? ` · ${s.scene.summary}` : ""}</small></span>
            </li>
          ))}
        </ul>
        {!list.length && !open.length ? <p className="stg-empty">还没有过场景</p> : null}
      </div>
    </div>
  );
}
