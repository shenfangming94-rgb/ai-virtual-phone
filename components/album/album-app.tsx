"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Cloud,
  Ellipsis,
  Heart,
  ImagePlus,
  Images,
  Info,
  LayoutGrid,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { loadChatContacts } from "@/lib/chat-storage";
import { SELF_REFERENCE_ID } from "@/lib/image-generation-service";
import { isMediaStoreRef, loadMediaObjectUrl, storeMediaBlob } from "@/lib/media-cache-storage";
import { resolveUserIdentity } from "@/lib/settings-storage";
import {
  addPhotos,
  addPhotosToAlbum,
  ALBUM_SELF,
  ALBUM_UPDATED_EVENT,
  createAlbum,
  deleteAlbum,
  deletePhotos,
  ingestChatPhotos,
  loadAlbums,
  loadPhotos,
  removePhotosFromAlbum,
  resolveChatPhotoSrc,
  updateAlbum,
  updatePhoto,
  type Album,
  type AlbumPhoto,
} from "@/lib/album-store";
import {
  albumDailyTick,
  describePendingPhotos,
  generateAlbumPhoto,
  inviteToSharedAlbum,
  isImageGenerationReady,
  noteUserAddedToShared,
} from "@/lib/album-engine";

type Tab = "library" | "albums" | "shared" | "search";

// ── 图片地址 ──

function usePhotoUrl(photo: AlbumPhoto | null): string | null {
  const raw = photo ? (photo.msgRef ? resolveChatPhotoSrc(photo) : photo.src) : undefined;
  const [url, setUrl] = useState<string | null>(raw && !isMediaStoreRef(raw) ? raw : null);
  useEffect(() => {
    if (!raw) { setUrl(null); return; }
    if (!isMediaStoreRef(raw)) { setUrl(raw); return; }
    let revoke = "";
    let cancelled = false;
    void loadMediaObjectUrl(raw).then(objectUrl => {
      if (cancelled) { if (objectUrl) URL.revokeObjectURL(objectUrl); return; }
      if (objectUrl) { revoke = objectUrl; setUrl(objectUrl); } else setUrl(null);
    });
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
  }, [raw]);
  return url;
}

function PhotoThumb({ photo, selected, onClick }: { photo: AlbumPhoto; selected?: boolean; onClick: () => void }) {
  const url = usePhotoUrl(photo);
  return (
    <button type="button" className="album-thumb" onClick={onClick} aria-pressed={selected}>
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="album-thumb-text"><span>{photo.desc || "照片"}</span></span>
      )}
      {selected !== undefined ? <span className="album-thumb-check">{selected ? <Check size={12} strokeWidth={3} /> : null}</span> : null}
    </button>
  );
}

function formatDay(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatFull(value: string): { day: string; time: string } {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { day: "", time: "" };
  return {
    day: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

function Avatar({ src, name, size = 26 }: { src?: string | null; name: string; size?: number }) {
  return (
    <span className="album-avatar" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" /> : <span>{name.slice(0, 1)}</span>}
    </span>
  );
}

// ── 通用底部弹层 ──

function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="album-sheet-backdrop" onClick={onClose}>
      <section className="album-sheet" onClick={event => event.stopPropagation()}>
        <div className="album-sheet-bar" />
        {title ? <h3>{title}</h3> : null}
        {children}
      </section>
    </div>
  );
}

function CharPicker({
  characters,
  selected,
  onToggle,
}: {
  characters: Character[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (characters.length === 0) return <p className="album-hint">还没有可以选的人</p>;
  return (
    <div className="album-card album-list">
      {characters.map(c => (
        <button key={c.id} type="button" className="album-row" onClick={() => onToggle(c.id)}>
          <Avatar src={c.avatar} name={c.name} size={30} />
          <span>{c.name}</span>
          <span className="album-check" data-on={selected.includes(c.id) ? "" : undefined}>
            {selected.includes(c.id) ? <Check size={12} strokeWidth={3} /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── 照片大图 ──

function PhotoViewer({
  photo,
  albums,
  characters,
  onClose,
  onDelete,
}: {
  photo: AlbumPhoto;
  albums: Album[];
  characters: Character[];
  onClose: () => void;
  onDelete: () => void;
}) {
  const url = usePhotoUrl(photo);
  const [showInfo, setShowInfo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { day, time } = formatFull(photo.createdAt);
  const inAlbums = albums.filter(a => photo.albumIds.includes(a.id));
  const viewers = Array.from(new Set(inAlbums.flatMap(a => a.memberIds)))
    .map(id => characters.find(c => c.id === id)?.name)
    .filter(Boolean);
  const nameOf = (id: string) => id === ALBUM_SELF ? "你" : (characters.find(c => c.id === id)?.name || "他");
  const isText = !url;
  return (
    <div className="album-viewer" data-text={isText ? "" : undefined}>
      <header className="album-viewer-top">
        <button type="button" className="album-link" onClick={onClose} aria-label="返回"><ChevronLeft size={22} /></button>
        <div><b>{day}</b><span>{time}</span></div>
        <span className="album-viewer-spacer" />
      </header>
      <div className="album-viewer-stage" onClick={() => setShowInfo(v => !v)}>
        {url ? <img src={url} alt="" /> : <p className="album-text-photo">{photo.desc || "（没有描述）"}</p>}
      </div>
      {showInfo || photo.favs.length > 0 ? (
        <div className="album-viewer-info">
          {showInfo ? (
            <>
              {photo.caption ? <p className="album-info-caption">{photo.caption}</p> : null}
              {url && photo.desc ? <p className="album-info-desc">{photo.desc}</p> : null}
              <p className="album-info-meta">
                {inAlbums.length ? `在相簿：${inAlbums.map(a => a.name).join("、")}` : "只在图库"}
                {viewers.length ? ` · ${viewers.join("、")} 能看` : ""}
                {photo.addedBy !== ALBUM_SELF ? ` · ${nameOf(photo.addedBy)} 加的` : ""}
              </p>
            </>
          ) : null}
          {photo.favs.map(fav => {
            const c = characters.find(x => x.id === fav.characterId);
            return (
              <div key={fav.characterId} className="album-fav">
                <Avatar src={c?.avatar} name={c?.name || "他"} size={22} />
                <div><b>{c?.name || "他"} 收藏了</b>{fav.note ? <span>{fav.note}</span> : null}</div>
              </div>
            );
          })}
        </div>
      ) : null}
      <footer className="album-viewer-bar">
        <button type="button" aria-label="喜欢" onClick={() => updatePhoto(photo.id, { liked: !photo.liked })}>
          <Heart size={22} fill={photo.liked ? "currentColor" : "none"} />
        </button>
        <button type="button" aria-label="信息" onClick={() => setShowInfo(v => !v)}><Info size={22} /></button>
        <button type="button" className="album-trash-btn" aria-label="删除" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={20} strokeWidth={1.9} />
        </button>
      </footer>
      {confirmDelete ? (
        <Sheet onClose={() => setConfirmDelete(false)}>
          <p className="album-hint">{photo.msgRef ? "从相册里删掉这张照片（聊天记录里还在）" : "这张照片会从相册里删掉"}</p>
          <button type="button" className="album-btn album-btn-danger" onClick={onDelete}>删除照片</button>
          <button type="button" className="album-btn" onClick={() => setConfirmDelete(false)}>取消</button>
        </Sheet>
      ) : null}
    </div>
  );
}

// ── 生成图片 ──

function GenerateSheet({
  people,
  albums,
  onClose,
  onDone,
}: {
  people: { id: string; name: string; avatar?: string | null }[];
  albums: Album[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [who, setWho] = useState<string[]>([]);
  const [scene, setScene] = useState("");
  const [albumIds, setAlbumIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = isImageGenerationReady();
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await generateAlbumPhoto(scene.trim(), who);
      if (!result) throw new Error("生图没有返回图片，检查一下生图设置");
      addPhotos([{ src: result.src, desc: scene.trim(), vision: "done", source: "generate", addedBy: ALBUM_SELF, albumIds }]);
      const shared = albums.filter(a => a.kind === "shared" && albumIds.includes(a.id));
      for (const album of shared) noteUserAddedToShared(album, [{ desc: scene.trim() } as AlbumPhoto]);
      onDone("生成好了");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="生成图片" onClose={busy ? () => undefined : onClose}>
      {!ready ? <p className="album-hint">还没开生图，先去 设置 → 生图 里配好</p> : null}
      <div className="album-card">
        <div className="album-label">照片里有谁（可多选，不选就是没有人）</div>
        <div className="album-chips">
          {people.map(p => (
            <button
              key={p.id}
              type="button"
              className="album-chip album-chip-person"
              aria-pressed={who.includes(p.id)}
              onClick={() => setWho(v => v.includes(p.id) ? v.filter(x => x !== p.id) : [...v, p.id])}
            >
              <Avatar src={p.avatar} name={p.name} size={20} />{p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="album-card">
        <div className="album-label">场景</div>
        <textarea className="album-textarea" value={scene} placeholder="比如：傍晚的海边，两个人坐在堤坝上看晚霞" onChange={e => setScene(e.target.value)} />
      </div>
      {albums.length > 0 ? (
        <div className="album-card">
          <div className="album-label">放进相簿（不选就只在图库）</div>
          <div className="album-chips">
            {albums.map(a => (
              <button
                key={a.id}
                type="button"
                className="album-chip"
                aria-pressed={albumIds.includes(a.id)}
                onClick={() => setAlbumIds(v => v.includes(a.id) ? v.filter(x => x !== a.id) : [...v, a.id])}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className="album-error">{error}</p> : null}
      <button type="button" className="album-btn album-btn-primary" disabled={!ready || !scene.trim() || busy} onClick={submit}>
        {busy ? "生成中…" : "生成"}
      </button>
      <p className="album-hint">有人的话会带上 TA 的参考图，生图设置里的提示词也会带上</p>
    </Sheet>
  );
}

// ── 从图库挑照片 ──

function PhotoPicker({ photos, onCancel, onDone }: { photos: AlbumPhoto[]; onCancel: () => void; onDone: (ids: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div className="album-page album-picker">
      <header className="album-top album-top-bar">
        <button type="button" className="album-link" onClick={onCancel}>取消</button>
        <b>选择照片</b>
        <button type="button" className="album-link album-link-strong" disabled={picked.length === 0} onClick={() => onDone(picked)}>
          添加{picked.length ? `(${picked.length})` : ""}
        </button>
      </header>
      <div className="album-grid">
        {photos.map(p => (
          <PhotoThumb
            key={p.id}
            photo={p}
            selected={picked.includes(p.id)}
            onClick={() => setPicked(v => v.includes(p.id) ? v.filter(x => x !== p.id) : [...v, p.id])}
          />
        ))}
      </div>
    </div>
  );
}

// ── 相簿里面 ──

function AlbumDetail({
  album,
  photos,
  characters,
  friends,
  onBack,
  onOpenPhoto,
  notify,
}: {
  album: Album;
  photos: AlbumPhoto[];
  characters: Character[];
  friends: Character[];
  onBack: () => void;
  onOpenPhoto: (photo: AlbumPhoto, list: AlbumPhoto[]) => void;
  notify: (m: string) => void;
}) {
  const inside = photos.filter(p => p.albumIds.includes(album.id));
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [viewers, setViewers] = useState<string[] | null>(null);
  const [inviting, setInviting] = useState<string[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [selecting, setSelecting] = useState<string[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameOf = (id: string) => id === ALBUM_SELF ? "你" : (characters.find(c => c.id === id)?.name || "他");
  const avatarOf = (id: string) => id === ALBUM_SELF ? resolveUserIdentity(undefined, "album")?.avatarUrl : characters.find(c => c.id === id)?.avatar;

  // 共享相簿：按「谁、哪天」分组成动态
  const groups = useMemo(() => {
    const out: { key: string; by: string; day: string; items: AlbumPhoto[] }[] = [];
    for (const p of inside) {
      const day = formatDay(p.createdAt);
      const last = out[out.length - 1];
      if (last && last.by === p.addedBy && last.day === day) last.items.push(p);
      else out.push({ key: p.id, by: p.addedBy, day, items: [p] });
    }
    return out;
  }, [inside]);

  if (picking) {
    return (
      <PhotoPicker
        photos={photos.filter(p => p.inLibrary && !p.albumIds.includes(album.id))}
        onCancel={() => setPicking(false)}
        onDone={ids => {
          addPhotosToAlbum(ids, album.id);
          if (album.kind === "shared") noteUserAddedToShared(album, photos.filter(p => ids.includes(p.id)));
          setPicking(false);
        }}
      />
    );
  }

  const memberLine = album.kind === "shared"
    ? ["你", ...album.memberIds.map(nameOf)].join("、")
    : album.memberIds.length ? `${album.memberIds.map(nameOf).join("、")} 能看` : "只有你能看";

  return (
    <div className="album-page">
      <header className="album-top album-top-bar">
        <button type="button" className="album-link" onClick={onBack}><ChevronLeft size={20} />{album.kind === "shared" ? "共享" : "相簿"}</button>
        <span />
        <span className="album-top-actions">
          {selecting ? (
            <button type="button" className="album-pill" onClick={() => setSelecting(null)}>完成</button>
          ) : (
            <>
              <button type="button" className="album-pill" aria-label="添加照片" onClick={() => setPicking(true)}><Plus size={16} /></button>
              <button type="button" className="album-pill" aria-label="更多" onClick={() => setMenu(true)}><Ellipsis size={16} /></button>
            </>
          )}
        </span>
      </header>
      <div className="album-title-block">
        <h1>{album.name}</h1>
        <p>{memberLine} · {inside.length} 张{album.invitedIds?.length ? ` · ${album.invitedIds.map(nameOf).join("、")} 还没回邀请` : ""}</p>
      </div>
      {inside.length === 0 ? <p className="album-empty">还没有照片，点右上角 ＋ 从图库里挑</p> : null}
      {album.kind === "shared" && !selecting ? (
        <div className="album-feed">
          {groups.map(group => (
            <section key={group.key} className="album-feed-item">
              <div className="album-feed-who">
                <Avatar src={avatarOf(group.by)} name={nameOf(group.by)} size={24} />
                {nameOf(group.by)} 添加了 {group.items.length} 张 · {group.day}
              </div>
              <div className="album-feed-grid" data-count={Math.min(group.items.length, 3)}>
                {group.items.map(p => <PhotoThumb key={p.id} photo={p} onClick={() => onOpenPhoto(p, inside)} />)}
              </div>
              {group.items[0].caption ? <p className="album-feed-caption">{group.items[0].caption}</p> : null}
            </section>
          ))}
        </div>
      ) : (
        <div className="album-grid">
          {inside.map(p => (
            <PhotoThumb
              key={p.id}
              photo={p}
              selected={selecting ? selecting.includes(p.id) : undefined}
              onClick={() => selecting
                ? setSelecting(v => v!.includes(p.id) ? v!.filter(x => x !== p.id) : [...v!, p.id])
                : onOpenPhoto(p, inside)}
            />
          ))}
        </div>
      )}
      {selecting && selecting.length > 0 ? (
        <div className="album-select-bar">
          <button type="button" className="album-trash-btn" aria-label="移出相簿" onClick={() => { removePhotosFromAlbum(selecting, album.id); setSelecting(null); }}>
            <Trash2 size={20} strokeWidth={1.9} />
          </button>
          <span>从相簿移出 {selecting.length} 张</span>
        </div>
      ) : null}

      {menu ? (
        <Sheet onClose={() => setMenu(false)}>
          <div className="album-card album-list">
            <button type="button" className="album-row" onClick={() => { setMenu(false); setRenaming(album.name); }}>重命名相簿</button>
            {album.kind === "mine" ? (
              <button type="button" className="album-row" onClick={() => { setMenu(false); setViewers(album.memberIds); }}>
                谁能看<span className="album-row-value">{album.memberIds.length ? album.memberIds.map(nameOf).join("、") : "只有你"}</span>
              </button>
            ) : (
              <button type="button" className="album-row" onClick={() => { setMenu(false); setInviting([]); }}>邀请更多人</button>
            )}
            <button type="button" className="album-row" onClick={() => { setMenu(false); setSelecting([]); }}>选择照片移出</button>
            <button type="button" className="album-row album-row-danger" onClick={() => { setMenu(false); setConfirmDelete(true); }}>删除相簿</button>
          </div>
          <p className="album-hint">{album.kind === "mine" ? "能看的人偶尔会自己来逛，喜欢就收藏" : "成员也会时不时往里放照片"}<br />删相簿不会删图库里的照片</p>
        </Sheet>
      ) : null}
      {renaming !== null ? (
        <Sheet title="重命名相簿" onClose={() => setRenaming(null)}>
          <input className="album-input" value={renaming} maxLength={30} autoFocus onChange={e => setRenaming(e.target.value)} />
          <button type="button" className="album-btn album-btn-primary" disabled={!renaming.trim()} onClick={() => { updateAlbum(album.id, { name: renaming.trim() }); setRenaming(null); }}>好</button>
        </Sheet>
      ) : null}
      {viewers !== null ? (
        <Sheet title="谁能看" onClose={() => setViewers(null)}>
          <CharPicker characters={friends} selected={viewers} onToggle={id => setViewers(v => v!.includes(id) ? v!.filter(x => x !== id) : [...v!, id])} />
          <button type="button" className="album-btn album-btn-primary" onClick={() => { updateAlbum(album.id, { memberIds: viewers }); setViewers(null); }}>好</button>
        </Sheet>
      ) : null}
      {inviting !== null ? (
        <Sheet title="邀请更多人" onClose={() => setInviting(null)}>
          <CharPicker
            characters={friends.filter(c => !album.memberIds.includes(c.id) && !(album.invitedIds || []).includes(c.id))}
            selected={inviting}
            onToggle={id => setInviting(v => v!.includes(id) ? v!.filter(x => x !== id) : [...v!, id])}
          />
          <button
            type="button"
            className="album-btn album-btn-primary"
            disabled={inviting.length === 0}
            onClick={() => {
              updateAlbum(album.id, { invitedIds: [...(album.invitedIds || []), ...inviting] });
              const fresh = { ...album, invitedIds: [...(album.invitedIds || []), ...inviting] };
              for (const id of inviting) void inviteToSharedAlbum(fresh, id);
              notify("邀请已经发到聊天里了");
              setInviting(null);
            }}
          >
            发邀请
          </button>
        </Sheet>
      ) : null}
      {confirmDelete ? (
        <Sheet onClose={() => setConfirmDelete(false)}>
          <p className="album-hint">删除相簿「{album.name}」？图库里的照片不会删。</p>
          <button type="button" className="album-btn album-btn-danger" onClick={() => { deleteAlbum(album.id); onBack(); }}>删除相簿</button>
          <button type="button" className="album-btn" onClick={() => setConfirmDelete(false)}>取消</button>
        </Sheet>
      ) : null}
    </div>
  );
}

// ── 主体 ──

export function AlbumApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>("library");
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [characters] = useState<Character[]>(() => loadCharacters());
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ id: string } | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newAlbum, setNewAlbum] = useState<{ kind: Album["kind"]; name: string; members: string[] } | null>(null);
  const [selecting, setSelecting] = useState<string[] | null>(null);
  const [addToAlbum, setAddToAlbum] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const notify = useCallback((m: string) => onNotice?.(m), [onNotice]);

  const friends = useMemo(() => {
    const ids = new Set(loadChatContacts().map(c => c.characterId));
    return characters.filter(c => ids.has(c.id));
  }, [characters]);
  const me = useMemo(() => resolveUserIdentity(undefined, "album"), []);
  const people = useMemo(() => [
    { id: SELF_REFERENCE_ID, name: "我", avatar: me?.avatarUrl },
    ...characters.map(c => ({ id: c.id, name: c.name, avatar: c.avatar })),
  ], [characters, me]);

  const refresh = useCallback(() => {
    setPhotos(loadPhotos());
    setAlbums(loadAlbums());
  }, []);

  useEffect(() => {
    ingestChatPhotos();
    refresh();
    window.addEventListener(ALBUM_UPDATED_EVENT, refresh);
    void albumDailyTick();
    return () => window.removeEventListener(ALBUM_UPDATED_EVENT, refresh);
  }, [refresh]);

  const library = photos.filter(p => p.inLibrary);
  const myAlbums = albums.filter(a => a.kind === "mine");
  const sharedAlbums = albums.filter(a => a.kind === "shared");
  const openAlbum = albums.find(a => a.id === openAlbumId) || null;
  const viewerPhoto = viewer ? photos.find(p => p.id === viewer.id) || null : null;

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const items: Parameters<typeof addPhotos>[0] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const src = await storeMediaBlob(file, file.type, "image");
      items.push({ src, desc: "", vision: "pending", source: "upload", addedBy: ALBUM_SELF });
    }
    if (items.length) {
      addPhotos(items);
      void describePendingPhotos();
    }
  };

  if (openAlbum) {
    return (
      <section className="album-app">
        <AlbumDetail
          album={openAlbum}
          photos={photos}
          characters={characters}
          friends={friends}
          onBack={() => setOpenAlbumId(null)}
          onOpenPhoto={p => setViewer({ id: p.id })}
          notify={notify}
        />
        {viewerPhoto ? (
          <PhotoViewer
            photo={viewerPhoto}
            albums={albums}
            characters={characters}
            onClose={() => setViewer(null)}
            onDelete={() => { deletePhotos([viewerPhoto.id]); setViewer(null); }}
          />
        ) : null}
      </section>
    );
  }

  const coverOf = (albumId: string | null) => (albumId ? photos.find(p => p.albumIds.includes(albumId)) : library[0]) || null;
  const searchHits = query.trim()
    ? photos.filter(p => `${p.desc} ${p.caption || ""}`.includes(query.trim()))
    : [];

  return (
    <section className="album-app">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { void upload(e.target.files); e.target.value = ""; }} />
      <div className="album-page">
        <header className="album-top">
          <button type="button" className="album-link album-back" onClick={onClose} aria-label="返回桌面"><ChevronLeft size={20} /></button>
          <span className="album-top-actions">
            {tab === "library" ? (
              selecting ? (
                <button type="button" className="album-pill" onClick={() => setSelecting(null)}>取消</button>
              ) : (
                <>
                  <button type="button" className="album-pill" onClick={() => setSelecting([])}>选择</button>
                  <button type="button" className="album-pill" aria-label="添加" onClick={() => setAddMenu(true)}><Plus size={16} /></button>
                </>
              )
            ) : tab === "albums" || tab === "shared" ? (
              <button type="button" className="album-pill" aria-label="新建" onClick={() => setNewAlbum({ kind: tab === "shared" ? "shared" : "mine", name: "", members: [] })}><Plus size={16} /></button>
            ) : null}
          </span>
        </header>

        {tab === "library" ? (
          <>
            <div className="album-title-block">
              <h1>图库</h1>
              <p>{library.length} 张</p>
            </div>
            {library.length === 0 ? <p className="album-empty">聊天里你们互发的照片会自动收进来，也可以点 ＋ 上传或生成</p> : null}
            <div className="album-grid">
              {library.map(p => (
                <PhotoThumb
                  key={p.id}
                  photo={p}
                  selected={selecting ? selecting.includes(p.id) : undefined}
                  onClick={() => selecting
                    ? setSelecting(v => v!.includes(p.id) ? v!.filter(x => x !== p.id) : [...v!, p.id])
                    : setViewer({ id: p.id })}
                />
              ))}
            </div>
          </>
        ) : null}

        {tab === "albums" || tab === "shared" ? (
          <>
            <div className="album-title-block"><h1>{tab === "albums" ? "相簿" : "共享"}</h1></div>
            {tab === "albums" ? (
              <>
                <div className="album-section"><b>我的相簿</b></div>
                <div className="album-covers">
                  <AlbumCover name="最近项目" count={library.length} cover={coverOf(null)} onClick={() => setTab("library")} />
                  {myAlbums.map(a => (
                    <AlbumCover key={a.id} name={a.name} count={photos.filter(p => p.albumIds.includes(a.id)).length} cover={coverOf(a.id)} onClick={() => setOpenAlbumId(a.id)} />
                  ))}
                </div>
              </>
            ) : null}
            <div className="album-section"><b>共享相簿</b></div>
            {sharedAlbums.length === 0 ? <p className="album-empty">点右上角 ＋ 建一个，邀请他们一起放照片</p> : null}
            <div className="album-covers">
              {sharedAlbums.map(a => (
                <AlbumCover
                  key={a.id}
                  name={a.name}
                  count={photos.filter(p => p.albumIds.includes(a.id)).length}
                  cover={coverOf(a.id)}
                  members={a.memberIds.map(id => characters.find(c => c.id === id)).filter((c): c is Character => Boolean(c))}
                  onClick={() => setOpenAlbumId(a.id)}
                />
              ))}
            </div>
          </>
        ) : null}

        {tab === "search" ? (
          <>
            <div className="album-title-block"><h1>搜索</h1></div>
            <input className="album-input album-search" value={query} placeholder="照片里的东西、配文" onChange={e => setQuery(e.target.value)} />
            <div className="album-grid">
              {searchHits.map(p => <PhotoThumb key={p.id} photo={p} onClick={() => setViewer({ id: p.id })} />)}
            </div>
          </>
        ) : null}
      </div>

      {selecting && selecting.length > 0 ? (
        <div className="album-select-bar">
          <button type="button" className="album-pill" onClick={() => setAddToAlbum(true)}><ImagePlus size={16} />加到相簿</button>
          <span>已选 {selecting.length} 张</span>
          <button type="button" className="album-trash-btn" aria-label="删除" onClick={() => setConfirmBulkDelete(true)}>
            <Trash2 size={20} strokeWidth={1.9} />
          </button>
        </div>
      ) : (
        <nav className="album-tabs">
          {([
            ["library", "图库", LayoutGrid],
            ["albums", "相簿", Images],
            ["shared", "共享", Cloud],
            ["search", "搜索", Search],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); setSelecting(null); }}>
              <Icon size={20} />{label}
            </button>
          ))}
        </nav>
      )}

      {addMenu ? (
        <Sheet onClose={() => setAddMenu(false)}>
          <div className="album-card album-list">
            <button type="button" className="album-row" onClick={() => { setAddMenu(false); fileRef.current?.click(); }}><Upload size={18} />从手机上传</button>
            <button type="button" className="album-row" onClick={() => { setAddMenu(false); setGenerating(true); }}><Sparkles size={18} />生成图片</button>
          </div>
        </Sheet>
      ) : null}
      {generating ? (
        <GenerateSheet people={people} albums={albums} onClose={() => setGenerating(false)} onDone={m => { setGenerating(false); notify(m); }} />
      ) : null}
      {newAlbum ? (
        <Sheet title={newAlbum.kind === "shared" ? "新建共享相簿" : "新建相簿"} onClose={() => setNewAlbum(null)}>
          <input className="album-input" value={newAlbum.name} placeholder="相簿名字" maxLength={30} autoFocus onChange={e => setNewAlbum({ ...newAlbum, name: e.target.value })} />
          {newAlbum.kind === "shared" ? (
            <>
              <div className="album-label">邀请谁（可多选）</div>
              <CharPicker
                characters={friends}
                selected={newAlbum.members}
                onToggle={id => setNewAlbum({ ...newAlbum, members: newAlbum.members.includes(id) ? newAlbum.members.filter(x => x !== id) : [...newAlbum.members, id] })}
              />
              <p className="album-hint">邀请函会发到你们各自的聊天里，他同意了才加入</p>
            </>
          ) : null}
          <button
            type="button"
            className="album-btn album-btn-primary"
            disabled={!newAlbum.name.trim() || (newAlbum.kind === "shared" && newAlbum.members.length === 0)}
            onClick={() => {
              const album = createAlbum(newAlbum.name, newAlbum.kind, newAlbum.members);
              for (const id of newAlbum.members) void inviteToSharedAlbum(album, id);
              setNewAlbum(null);
              setOpenAlbumId(album.id);
            }}
          >
            创建
          </button>
        </Sheet>
      ) : null}
      {addToAlbum && selecting ? (
        <Sheet title="加到相簿" onClose={() => setAddToAlbum(false)}>
          <div className="album-card album-list">
            {albums.length === 0 ? <p className="album-hint">还没有相簿，先去「相簿」里建一个</p> : null}
            {albums.map(a => (
              <button
                key={a.id}
                type="button"
                className="album-row"
                onClick={() => {
                  addPhotosToAlbum(selecting, a.id);
                  if (a.kind === "shared") noteUserAddedToShared(a, photos.filter(p => selecting.includes(p.id)));
                  setAddToAlbum(false);
                  setSelecting(null);
                  notify(`已加到「${a.name}」`);
                }}
              >
                {a.name}<span className="album-row-value">{a.kind === "shared" ? "共享" : ""}</span>
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
      {confirmBulkDelete && selecting ? (
        <Sheet onClose={() => setConfirmBulkDelete(false)}>
          <p className="album-hint">删除 {selecting.length} 张照片？聊天里的照片只从相册删，聊天记录里还在。</p>
          <button type="button" className="album-btn album-btn-danger" onClick={() => { deletePhotos(selecting); setSelecting(null); setConfirmBulkDelete(false); }}>删除</button>
          <button type="button" className="album-btn" onClick={() => setConfirmBulkDelete(false)}>取消</button>
        </Sheet>
      ) : null}
      {viewerPhoto ? (
        <PhotoViewer
          photo={viewerPhoto}
          albums={albums}
          characters={characters}
          onClose={() => setViewer(null)}
          onDelete={() => { deletePhotos([viewerPhoto.id]); setViewer(null); }}
        />
      ) : null}
    </section>
  );
}

function AlbumCover({
  name,
  count,
  cover,
  members,
  onClick,
}: {
  name: string;
  count: number;
  cover: AlbumPhoto | null;
  members?: Character[];
  onClick: () => void;
}) {
  const url = usePhotoUrl(cover);
  return (
    <button type="button" className="album-cover" onClick={onClick}>
      <span className="album-cover-img">
        {url ? <img src={url} alt="" /> : cover ? <span className="album-thumb-text"><span>{cover.desc}</span></span> : <Images size={28} />}
        {members && members.length > 0 ? (
          <span className="album-cover-members">
            {members.slice(0, 3).map(m => <Avatar key={m.id} src={m.avatar} name={m.name} size={22} />)}
          </span>
        ) : null}
      </span>
      <b>{name}</b>
      <span>{count}</span>
    </button>
  );
}
