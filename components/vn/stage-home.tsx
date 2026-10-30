"use client";

/**
 * 场景 app 首页：地图。首尔大地图 → 点地点进去（或者进小地图）。
 * 地图图片、钉子位置、每个地点的背景和 BGM 都是她自己配。
 */

import { classAt } from "@/lib/idol-starroad";
import { destinyMarks, takeDestinyMark } from "@/lib/idol-destiny";
import "@/styles/stage-replay.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MoreHorizontal, X, Lock, Music2, VolumeX, Image as ImageIcon, Check, Search, Play } from "lucide-react";
import {
  DEFAULT_MAPS, mapLookKey, addBackground, addCustomPlace, loadCustomPlaces, pickBackground, placeBackgrounds, removeBackground, removeCustomPlace, thumbsOf, STAGE_APP_NAME, STAGE_OPEN_EVENT, loadBgmMap, loadBgmModes, loadMapLooks, loadStageSettings, mapById, mapBgmKey, mapOfPlace, openStageScenes, pastStageScenes, deleteStageScene, placeLocked,
  saveBgmFor, saveBgmMode, saveMapLook, saveStageSettings, startNodeStage, startStageScene, takePendingStage, type BgmMode, type BgmSong, type MapLook, type StagePlace, type StageSettings,
} from "@/lib/idol-stage";
import { loadBgmMuted, saveBgmMuted, setStageBgmVolume, useStageBgm } from "./stage-bgm";
import { WORLD_CHAR_ID } from "@/lib/idol-world";
import { companyOf, loadCareer, nodeById } from "@/lib/idol-career";
import { ABSENT_AFTER, jumpWorld, reminderTick } from "@/lib/idol-reminders";
import { loadProfiles, relationOf } from "@/lib/idol-people";
import { loadAllCharacters } from "@/lib/character-storage";
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

type Props = { onClose: () => void; onPlay: (chapterIndex: number) => void; onReplay: (chapterIndex: number) => void };

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function pickImage(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // iOS Safari：不挂进页面的 file input 有时选完图不触发 change
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => { resolve(input.files?.[0] ?? null); input.remove(); };
    input.click();
  });
}

export function StageHome({ onClose, onPlay, onReplay }: Props) {
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
  const lookKey = mapLookKey(mapId);
  const saved = looks[lookKey] ?? { pins: {} };
  const builtin = DEFAULT_MAPS[lookKey];
  const usingBuiltin = !saved.imageAssetId && !saved.noImage && Boolean(builtin);
  // 用自带的图时：自带的钉子位置打底，她拖过的盖上去
  const look: MapLook = usingBuiltin ? { ...saved, pins: { ...builtin!.pins, ...saved.pins } } : saved;
  const [muted, setMuted] = useState(() => loadBgmMuted());
  const [bgmVer, setBgmVer] = useState(0);
  const [mapMusic, setMapMusic] = useState(false);
  // 没有地图图片时的卡片：配了背景的地点直接显示那张图
  const [cardPhotos, setCardPhotos] = useState<Record<string, string>>({});
  const [photoVer, setPhotoVer] = useState(0);
  useEffect(() => {
    let off = false;
    const picks = mapById(mapId).places.map(pl => [pl.key, placeBackgrounds(pl.key).find(x => x.on)?.assetId] as const).filter((x): x is readonly [string, string] => Boolean(x[1]));
    void thumbsOf(picks.map(x => x[1])).then(urls => { if (!off) setCardPhotos(Object.fromEntries(picks.filter(x => urls[x[1]]).map(x => [x[0], urls[x[1]]]))); });
    return () => { off = true; };
  }, [mapId, photoVer]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);
  const [mineOpen, setMineOpen] = useState(false);
  useStageBgm(mapBgmKey(mapId), muted, bgmVer);

  // 别的 app 让这里开一场（提醒事项「去演」、横幅）
  useEffect(() => {
    const open = () => {
      const pending = takePendingStage();
      const node = pending ? nodeById(pending.nodeId) : undefined;
      if (!node) return;
      const now = Date.now();
      if (node.status !== "pending") return;
      if (now > node.dueAt + ABSENT_AFTER) {
        reminderTick(() => {});
        return;
      }
      if (now < node.dueAt) {
        jumpWorld(node.dueAt, { activeNodeId: node.id });
        // If another scheduled event or notice stopped the clock first, let the
        // user handle it before opening this scene.
        if (Date.now() < node.dueAt) return;
      }
      const r = startNodeStage(node);
      if (r) onPlay(r.chapterIndex);
    };
    open();
    window.addEventListener(STAGE_OPEN_EVENT, open);
    return () => window.removeEventListener(STAGE_OPEN_EVENT, open);
  }, [onPlay]);

  useEffect(() => {
    let off = false;
    if (!saved.imageAssetId) { setMapUrl(usingBuiltin ? builtin!.image : ""); return; }
    void getThemeAssetMap([saved.imageAssetId]).then(m => { if (!off) setMapUrl(m[saved.imageAssetId!] || ""); });
    return () => { off = true; };
  }, [saved.imageAssetId, usingBuiltin, builtin]);

  const updateLook = (next: MapLook) => {
    saveMapLook(lookKey, next);
    setLooks(loadMapLooks());
  };

  const tapPlace = (pl: StagePlace) => {
    if (pinEdit !== null) { setPinEdit(pl.key); return; }
    if (pl.sub && !placeLocked(pl)) { setMapId(pl.sub); return; }
    setSheet(pl);
  };

  const marks = destinyMarks(now);
  const marked = (pl: StagePlace) => marks.some(m => m.place === pl.key || (pl.sub && mapOfPlace(m.place)?.id === pl.sub)) ? "1" : undefined;
  const openScenes = openStageScenes();
  const d = new Date(now);
  const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const [hideClock, setHideClock] = useState(() => Boolean(loadStageSettings().hideClock));

  return (
    <div className="stg">
      <div className="stg-hud">
        {!hideClock && !map.parent ? <span className="stg-pill stg-pill-date">{d.getFullYear()}<b>年</b>{d.getMonth() + 1}<b>月</b>{d.getDate()}<b>日</b><i>星期{WEEK[d.getDay()]}</i></span> : null}
        {map.parent && mapUrl ? null : <span className="stg-pill">{(mapId === "company" && companyOf(loadCareer().companyId)?.name) || map.label}{!hideClock && !map.parent ? <><em>·</em>{clock}</> : null}</span>}
      </div>
      <div className="stg-bar">
        <button type="button" className="stg-ic" onClick={() => (map.parent ? setMapId(map.parent) : onClose())} aria-label="返回">
          <ChevronLeft size={24} />
        </button>
        <div className="stg-spacer" />
        <button type="button" className="stg-ic" onClick={() => { const v = !muted; setMuted(v); saveBgmMuted(v); }} aria-label={muted ? "打开音乐" : "关掉音乐"}>
          {muted ? <VolumeX size={20} /> : <Music2 size={20} />}
        </button>
        <button type="button" className="stg-ic" onClick={() => setMenu(true)} aria-label="地图设置">
          <MoreHorizontal size={22} />
        </button>
      </div>

      {mapUrl ? (
        <MapImage key={`${lookKey}:${mapUrl}`} url={mapUrl} places={map.places} look={look} editing={pinEdit} onTap={tapPlace} marked={marked}
          onPlace={(x, y) => { if (pinEdit) { updateLook({ ...saved, pins: { ...saved.pins, [pinEdit]: { x, y } } }); setPinEdit(""); } }} />
      ) : (
        <div className="stg-grid-wrap" style={{ ["--stg-under" as string]: `url(${DEFAULT_MAPS.seoul.image})` }}>
          <div className="stg-grid">
            {map.places.map(pl => {
              const lock = placeLocked(pl);
              const photo = cardPhotos[pl.key];
              return (
                <button key={pl.key} type="button" className="stg-card" data-lock={lock ? "1" : undefined} data-photo={photo ? "1" : undefined} data-destiny={marked(pl)}
                  style={photo ? { backgroundImage: `url(${photo})` } : undefined} onClick={() => tapPlace(pl)}>
                  <span className="stg-card-name"><i className="stg-pin" />{pl.label}{pl.sub ? " ›" : ""}</span>
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
              // 换成自己的图，钉子从头摆
              updateLook({ imageAssetId: id, pins: {} });
            }}>{mapUrl ? "换成我自己的地图图片" : "上传地图图片"}</button>
            {mapUrl ? <button type="button" onClick={() => { setMenu(false); setPinEdit(""); }}>摆地点的位置</button> : null}
            {builtin && (saved.imageAssetId || saved.noImage) ? <button type="button" onClick={() => { setMenu(false); updateLook({ pins: {} }); }}>换回自带的地图</button> : null}
            {mapUrl ? <button type="button" className="stg-danger" onClick={() => { setMenu(false); updateLook({ pins: saved.imageAssetId ? {} : saved.pins, noImage: true }); }}>不用图片，用卡片</button> : null}
            <button type="button" onClick={() => { setMenu(false); setMapMusic(true); }}>这张地图的音乐</button>
            <button type="button" onClick={() => { setMenu(false); setSettingsOpen(true); }}>{STAGE_APP_NAME}设置</button>
            <button type="button" onClick={() => { setMenu(false); setWriting(""); }}>自己写一个地点</button>
            {loadCustomPlaces().length ? <button type="button" onClick={() => { setMenu(false); setMineOpen(true); }}>我的地点</button> : null}
            <button type="button" onClick={() => { setMenu(false); setPastOpen(true); }}>以前的场景</button>
            <button type="button" onClick={() => { setMenu(false); const v = !hideClock; setHideClock(v); saveStageSettings({ ...loadStageSettings(), hideClock: v }); }}>{hideClock ? "显示时间" : "隐藏时间"}</button>
            <button type="button" className="stg-cancel" onClick={() => setMenu(false)}>取消</button>
          </div>
        </div>
      ) : null}

      {sheet ? (
        <PlaceSheet place={sheet} onClose={() => { setSheet(null); bump(n => n + 1); setBgmVer(v => v + 1); setPhotoVer(v => v + 1); }} onGo={(meet, avoid) => {
          const fate = takeDestinyMark(sheet.key);
          const r = startStageScene({ placeKey: sheet.key, meetIds: meet, avoid, ...(fate ? { premise: fate } : {}) });
          setSheet(null);
          if (r) onPlay(r.chapterIndex);
        }} />
      ) : null}

      {mapMusic ? (
        <div className="stg-mask" onClick={() => { setMapMusic(false); setBgmVer(v => v + 1); }}>
          <div className="stg-sheet" onClick={e => e.stopPropagation()}>
            <div className="stg-picker-head"><b>{map.label} · 地图音乐</b><button type="button" className="stg-done" onClick={() => { setMapMusic(false); setBgmVer(v => v + 1); }}>完成</button></div>
            <p className="stg-tip stg-tip-l">逛这张地图时放；这张地图上没单独配歌的地方也放这些</p>
            <div className="stg-sec stg-sec-set"><MusicEditor bgKey={mapBgmKey(mapId)} /></div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}

      {writing !== null ? (
        <div className="stg-mask" onClick={() => setWriting(null)}>
          <form className="stg-sheet stg-write" onClick={e => e.stopPropagation()} onSubmit={e => {
            e.preventDefault();
            if (!writing.trim()) return;
            const pl = addCustomPlace(writing);
            setWriting(null);
            setSheet(pl);
          }}>
            <div className="stg-picker-head"><b>自己写一个地点</b><button type="submit" className="stg-done" disabled={!writing.trim()}>下一步</button></div>
            <p className="stg-tip stg-tip-l">写好会存进「我的地点」，不会放到地图上</p>
            <input className="stg-write-in" value={writing} onChange={e => setWriting(e.target.value)} placeholder="比如：智元家楼下、济州岛的民宿" maxLength={20} autoFocus />
          </form>
        </div>
      ) : null}

      {mineOpen ? (
        <div className="stg-mask" onClick={() => setMineOpen(false)}>
          <div className="stg-sheet stg-picker" onClick={e => e.stopPropagation()}>
            <div className="stg-picker-head"><b>我的地点</b><button type="button" className="stg-done" onClick={() => setMineOpen(false)}>完成</button></div>
            <ul className="stg-tracks">
              {loadCustomPlaces().map(pl => (
                <li key={pl.key} onClick={() => { setMineOpen(false); setSheet(pl); }}>
                  <span>{pl.label}</span>
                  <button type="button" onClick={e => { e.stopPropagation(); removeCustomPlace(pl.key); bump(n => n + 1); }}>删掉</button>
                </li>
              ))}
            </ul>
            {!loadCustomPlaces().length ? <p className="stg-empty">还没有</p> : null}
            <button type="button" className="stg-upload" onClick={() => { setMineOpen(false); setWriting(""); }}>＋ 再写一个</button>
          </div>
        </div>
      ) : null}

      {pastOpen ? <PastSheet onReplay={i => { setPastOpen(false); onReplay(i); }} onClose={() => setPastOpen(false)} onPlay={i => { setPastOpen(false); onPlay(i); }} /> : null}
    </div>
  );
}

// ── 有图片的地图：竖着铺满、左右拖，钉子按百分比放 ──

function MapImage({ url, places, look, editing, onTap, onPlace, marked }: {
  marked?: (pl: StagePlace) => string | undefined;
  url: string; places: StagePlace[]; look: MapLook; editing: string | null;
  onTap: (pl: StagePlace) => void; onPlace: (x: number, y: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const centered = useRef(false);
  // 竖的图（公司大楼这种）比屏幕还窄：按宽铺满、上下拖
  const [tall, setTall] = useState(false);
  // 钉子按图的百分比摆，图没下载完时容器没尺寸、钉子全挤一团：等图到了再放钉子
  const [loadedUrl, setLoadedUrl] = useState("");
  return (
    <div className="stg-map" ref={scroller} data-tall={tall ? "1" : undefined}>
      <div className="stg-map-inner" onClick={e => {
        if (!editing) return;
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        onPlace(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
      }}>
        <img src={url} alt="" draggable={false} onLoad={e => {
          const el = scroller.current;
          const img = e.currentTarget;
          setLoadedUrl(url);
          if (el && img.naturalWidth / img.naturalHeight < el.clientWidth / el.clientHeight) { setTall(true); return; }
          if (el && !centered.current) { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; centered.current = true; }
        }} />
        {loadedUrl === url && places.map(pl => {
          const pos = look.pins[pl.key];
          if (!pos) return null;
          const lock = placeLocked(pl);
          return (
            <button key={pl.key} type="button" className="stg-mpin" data-lock={lock ? "1" : undefined} data-edit={editing === pl.key ? "1" : undefined} data-destiny={marked?.(pl)}
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

  const people = useMemo(() => {
    const profiles = loadProfiles();
    return loadAllCharacters()
      .filter(c => c.id !== WORLD_CHAR_ID && profiles[c.id] && (profiles[c.id].met || profiles[c.id].layer === "main"))
      .map(c => ({ c, p: profiles[c.id] }))
      .sort((a, b) => (b.p.layer === "main" ? 1 : 0) - (a.p.layer === "main" ? 1 : 0) || (b.p.events.length - a.p.events.length));
  }, []);

  const [bgs, setBgs] = useState<{ id: string; url: string; on: boolean }[]>([]);
  const loadBg = useCallback(() => {
    const list = placeBackgrounds(place.key);
    void thumbsOf(list.map(x => x.assetId)).then(urls => {
      const items = list.filter(x => urls[x.assetId]).map(x => ({ id: x.id, url: urls[x.assetId], on: x.on }));
      setBgs(items);
      setBgUrl(items.find(x => x.on)?.url || "");
    });
  }, [place.key]);
  useEffect(loadBg, [loadBg]);

  const cycle = (id: string) => setMarks(m => {
    const next = { ...m };
    if (!m[id]) next[id] = "meet";
    else if (m[id] === "meet") next[id] = "avoid";
    else delete next[id];
    return next;
  });


  return (
    <div className="stg-mask" onClick={onClose}>
      <div className="stg-sheet" onClick={e => e.stopPropagation()}>
        <div className="stg-sheet-cover" style={bgUrl ? { backgroundImage: `url(${bgUrl})` } : undefined}>
          <button type="button" className="stg-sheet-x" onClick={onClose} aria-label="关闭"><X size={18} /></button>
          <div className="stg-sheet-name">{place.label}</div>
          {place.key.includes("·") && !place.key.startsWith("我的·") ? <div className="stg-sheet-area">{place.key.split("·")[0]}</div> : null}
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
            {!(place.key === "公司" || place.key.startsWith("公司·")) && classAt(Date.now()) ? <p className="stg-clash">现在是{classAt(Date.now())}，去这里算旷课</p> : null}
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
              await addBackground(place.key, f);
              loadBg();
            }}>加一张</button>
          </div>
          {bgs.length ? (
            <div className="stg-bgs">
              {bgs.map(b => (
                <div key={b.id} className="stg-bg" data-on={b.on ? "1" : undefined} style={{ backgroundImage: `url(${b.url})` }} onClick={() => { pickBackground(place.key, b.id); loadBg(); }}>
                  <button type="button" aria-label="删掉这张" onClick={async e => { e.stopPropagation(); await removeBackground(b.id); loadBg(); }}><X size={12} /></button>
                </div>
              ))}
            </div>
          ) : <p className="stg-empty">还没有背景，点「加一张」。可以存好几张，点哪张用哪张</p>}
          <MusicEditor bgKey={place.key} fallbackLabel={place.key.startsWith("我的·") ? "首尔" : mapOfPlace(place.key)?.label} />
        </div>
      </div>
    </div>
  );
}

// ── 一个地点 / 一张地图的歌：列表、播放方式、加歌 ──

const MODES: [BgmMode, string][] = [["list", "列表循环"], ["one", "单曲循环"], ["shuffle", "随机"]];

function MusicEditor({ bgKey, fallbackLabel }: { bgKey: string; fallbackLabel?: string }) {
  const [songs, setSongs] = useState<BgmSong[]>(() => loadBgmMap()[bgKey] ?? []);
  const [mode, setMode] = useState<BgmMode>(() => loadBgmModes()[bgKey] ?? "list");
  const [picking, setPicking] = useState(false);
  const setList = (list: BgmSong[]) => { setSongs(list); saveBgmFor(bgKey, list); };
  return (
    <>
      <div className="stg-row">
        <Music2 size={16} />
        <span>音乐</span>
        <button type="button" onClick={() => setPicking(true)}>加歌</button>
      </div>
      {songs.length ? (
        <>
          <ul className="stg-songs">
            {songs.map((s, i) => (
              <li key={`${s.src}_${s.id}`}>
                <span>{s.title}{s.artist ? <small> · {s.artist}</small> : null}{s.src === "netease" ? <em>网易云</em> : null}</span>
                <button type="button" aria-label="去掉" onClick={() => setList(songs.filter((_, j) => j !== i))}><X size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="stg-seg stg-seg-mode">
            {MODES.map(([m, label]) => (
              <button key={m} type="button" data-on={mode === m ? "1" : undefined} onClick={() => { setMode(m); saveBgmMode(bgKey, m); }}>{label}</button>
            ))}
          </div>
        </>
      ) : <p className="stg-empty">{fallbackLabel ? `没单独配歌，放「${fallbackLabel}」地图的音乐` : "还没配歌，安安静静的"}</p>}
      {picking ? <SongPicker chosen={songs} onClose={() => setPicking(false)} onAdd={s => setList([...songs, s])} /> : null}
    </>
  );
}

// ── 此刻设置 ──

const LANGS: [StageSettings["lang"], string, string][] = [
  ["ko-talk", "先韩后中", "旁白中文，台词按人物和情境选择语言，附中文翻译"],
  ["ko-all", "全部韩语", "旁白也写韩语，都带中文翻译"],
  ["zh", "全中文", "所有人都说中文"],
];

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<StageSettings>(() => loadStageSettings());
  const set = (patch: Partial<StageSettings>) => { const n = { ...st, ...patch }; setSt(n); saveStageSettings(n); };
  return (
    <div className="stg-mask" onClick={onClose}>
      <div className="stg-sheet stg-picker" onClick={e => e.stopPropagation()}>
        <div className="stg-picker-head"><b>{STAGE_APP_NAME}设置</b><button type="button" className="stg-done" onClick={onClose}>完成</button></div>
        <div className="stg-sec">
          <div className="stg-sec-head">每次写多少字<small>帧数不限，一帧最多 55 字</small></div>
          <div className="stg-words">
            <input type="number" min={200} max={3000} step={100} value={st.words} onChange={e => set({ words: Math.max(100, Number(e.target.value) || 800) })} />
            <span>字左右</span>
          </div>
        </div>
        <div className="stg-sec">
          <div className="stg-sec-head">文风<small>写你想要的感觉，可以随时换；空着就按预设来</small></div>
          <textarea className="stg-ta" rows={5} value={st.style} placeholder="比如：克制、多写动作和环境，少写形容词" onChange={e => set({ style: e.target.value })} />
        </div>
        <div className="stg-sec">
          <div className="stg-sec-head">语言</div>
          {LANGS.map(([v, label, desc]) => (
            <button key={v} type="button" className="stg-opt" data-on={st.lang === v ? "1" : undefined} onClick={() => set({ lang: v })}>
              <span><b>{label}</b><small>{desc}</small></span>
              {st.lang === v ? <Check size={18} /> : null}
            </button>
          ))}
        </div>
        <div className="stg-sec">
          <div className="stg-sec-head">音乐音量</div>
          <input className="stg-range" type="range" min={0} max={100} value={st.volume} onChange={e => { set({ volume: Number(e.target.value) }); setStageBgmVolume(Number(e.target.value)); }} />
        </div>
      </div>
    </div>
  );
}

// ── 加歌：自己传的 mp3 / 网易云 ──

export function SongPicker({ chosen, onClose, onAdd }: { chosen: BgmSong[]; onClose: () => void; onAdd: (s: BgmSong) => void }) {
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

function PastSheet({ onClose, onPlay, onReplay }: { onClose: () => void; onPlay: (i: number) => void; onReplay: (i: number) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "ended">("all");
  const [limit, setLimit] = useState(20);
  // 左滑一张卡露出「删除」
  const [swiped, setSwiped] = useState<number | null>(null);
  const [ver, setVer] = useState(0);
  const touchX = useRef(0);
  const scenes = useMemo(() => [...openStageScenes().map(s => ({ ...s, ended: false })), ...pastStageScenes().map(s => ({ ...s, ended: true }))].sort((a, b) => b.scene.startAt - a.scene.startAt), [ver]);
  const remove = (i: number) => {
    if (!window.confirm("删掉这一场？戏的内容和小总结会一起删掉，删了找不回来。")) return;
    deleteStageScene(i);
    setSwiped(null);
    setVer(v => v + 1);
  };
  const matching = scenes.filter(s => (filter === "all" || (filter === "ended") === s.ended) && `${s.title} ${s.subtitle || ""} ${s.scene.place} ${s.scene.summary || ""} ${new Date(s.scene.startAt).toLocaleDateString("zh-CN")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="stg-mask" onClick={onClose}><div className="stg-sheet stg-picker" onClick={e => e.stopPropagation()}>
    <div className="stg-picker-head"><b>{STAGE_APP_NAME} · 以前的场景</b><button type="button" className="stg-done" onClick={onClose}>完成</button></div>
    <div className="stg-search"><Search size={15} /><input aria-label="搜索场景" value={query} placeholder="搜索地点、事情、日期" onChange={e => { setQuery(e.target.value); setLimit(20); }} /></div>
    <div className="stg-history-filters">{([["all", "全部"], ["open", "进行中"], ["ended", "已结束"]] as const).map(([key, name]) => <button key={key} data-on={filter === key || undefined} onClick={() => { setFilter(key); setLimit(20); }}>{name}</button>)}</div>
    {matching.slice(0, limit).map(s => <div className="stg-history-row" key={s.chapterIndex}><button type="button" className="stg-history-del" onClick={() => remove(s.chapterIndex)}>删除</button><div className="stg-history-card" data-swiped={swiped === s.chapterIndex || undefined}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => { const dx = e.changedTouches[0].clientX - touchX.current; if (dx < -40) setSwiped(s.chapterIndex); else if (dx > 30 && swiped === s.chapterIndex) setSwiped(null); }}><b>{s.title}</b><small>{new Date(s.scene.startAt).toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {s.scene.place} · {s.ended ? "已结束" : "进行中"}</small>{s.scene.summary ? <p>{s.scene.summary}</p> : null}<div className="stg-history-actions">{!s.ended ? <button onClick={() => onPlay(s.chapterIndex)}>继续这一场</button> : null}<button onClick={() => onReplay(s.chapterIndex)}>重播这一场</button><button onClick={() => onPlay(s.chapterIndex)}>回顾</button></div></div></div>)}
    {matching.length > limit ? <button className="stg-history-more" onClick={() => setLimit(n => n + 20)}>加载更多（还有 {matching.length - limit} 场）</button> : null}
    {!matching.length ? <p className="stg-empty">{scenes.length ? "没有找到符合条件的场景" : "还没有过场景"}</p> : null}
  </div></div>;
}
