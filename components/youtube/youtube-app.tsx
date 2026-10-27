"use client";

/**
 * 爱豆小手机：YouTube。样子照 iOS 版 YouTube（预览定稿 docs/idol/mockups/youtube/y1、y2）。
 * 界面上不放 emoji，图标都是线条。数据和 AI 在 lib/idol-youtube.ts。
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bookmark, ChevronDown, ChevronLeft, CirclePlus, Ellipsis, House, ListFilter, PencilLine, Play, Search, Share2, Sparkles, ThumbsDown, ThumbsUp, X,
} from "lucide-react";

import {
  YT_EVENT, channelOf, channelWriting, cmtCountOf, commentsBusy, feedLoading, fillFeed, generateVideoImg, editVideoDesc, loadYt, moreComments, myComment,
  needsFeed, openHit, purgeVideo, searchYt, setMyHandle, setChannelAvatar, setMyAvatar, genAvatar, themeOf, toggleLike, toggleSub, viewsOf, visibleVideos, writeChannel,
  type Channel, type Cmt, type Hit, type Img, type Video,
} from "@/lib/idol-youtube";
import { loadMediaObjectUrl, isMediaStoreRef, storeMediaBlob } from "@/lib/media-cache-storage";
import { loadPhotos } from "@/lib/album-store";
import { LOOKS } from "@/lib/idol-search";

type Notice = ((m: string) => void) | undefined;
type Tab = "home" | "shorts" | "subs" | "me";
type View = { v: Tab } | { v: "watch"; id: string } | { v: "channel"; id: string } | { v: "search" };

function useYt() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(x => x + 1); window.addEventListener(YT_EVENT, f); return () => window.removeEventListener(YT_EVENT, f); }, []);
  return loadYt();
}

function useMedia(src?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    if (!src) { setUrl(null); return; }
    if (!isMediaStoreRef(src)) { setUrl(src); return; }
    void loadMediaObjectUrl(src).then(u => { if (!off) setUrl(u); });
    return () => { off = true; };
  }, [src]);
  return url;
}

// ── 小工具 ──

function num(n: number): string {
  if (n >= 1e8) return `${+(n / 1e8).toFixed(1)}亿`;
  if (n >= 1e4) return `${+(n / 1e4).toFixed(n >= 1e5 ? 0 : 1)}万`;
  return n.toLocaleString();
}
function ago(at: number): string {
  const d = Date.now() - at;
  const m = Math.floor(d / 60e3);
  if (m < 60) return `${Math.max(1, m)} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day} 天前`;
  if (day < 30) return `${Math.floor(day / 7)} 周前`;
  if (day < 365) return `${Math.floor(day / 30)} 个月前`;
  return `${Math.floor(day / 365)} 年前`;
}
const hue = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0; return h % 360; };

function AvImg({ src, size }: { src: string; size: number }) {
  const url = useMedia(src);
  return <i className="yt-av" style={{ width: size, height: size, backgroundImage: url ? `url(${url})` : undefined, backgroundColor: "#eee", backgroundSize: "cover", backgroundPosition: "center" }} />;
}
/** 频道头像：她换过的图 > 公司 logo 字（主题色）> 团/艺人首字母（各自的颜色） */
function ChAvatar({ ch, size = 36 }: { ch?: Partial<Channel>; size?: number }) {
  if (ch?.avatar) return <AvImg src={ch.avatar} size={size} />;
  const look = ch?.kind === "company" && ch.companyId ? LOOKS[ch.companyId] : undefined;
  if (look) { const fs = size * (look.logo.length > 3 ? 0.26 : 0.32); return <i className="yt-av yt-av-t" style={{ width: size, height: size, background: look.c, color: look.c === "#151515" || look.c === "#222222" ? "#fff" : "#fff", fontSize: fs, letterSpacing: -0.3 }}>{look.logo}</i>; }
  const name = ch?.name ?? "?";
  const h = hue(name);
  return <i className="yt-av yt-av-t" style={{ width: size, height: size, background: `hsl(${h} 42% 46%)`, fontSize: size * 0.42 }}>{firstChar(name)}</i>;
}
/** 路人：照真 YouTube 默认头像，彩色圆里一个首字 */
function UserAvatar({ name, size = 32, src }: { name: string; size?: number; src?: string }) {
  if (src) return <AvImg src={src} size={size} />;
  const h = hue(name);
  return <i className="yt-av yt-av-t" style={{ width: size, height: size, background: `hsl(${h} 55% 52%)`, fontSize: size * 0.45 }}>{firstChar(name)}</i>;
}
function firstChar(name: string): string {
  const c = [...name.replace(/^[@_\-.\d]+/, "")][0] ?? "?";
  return /[a-z]/.test(c) ? c.toUpperCase() : c;
}

/** 换头像：上传 / 相册 / 生图 / 换回默认 */
function AvatarSheet({ name, kind, onPick, onClose, onNotice }: { name: string; kind: "company" | "group" | "person" | "me"; onPick: (src?: string) => void; onClose: () => void; onNotice: Notice }) {
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const photos = loadPhotos().filter(p => p.inLibrary && p.src).slice(-30).reverse();
  return (
    <div className="yt-sheet-bk" onClick={onClose}>
      <div className="yt-msheet" onClick={e => e.stopPropagation()}>
        {pick ? (
          <>
            <div className="yt-msheet-h">从相册选</div>
            <div className="yt-avgrid">{photos.map(p => <button type="button" key={p.id} onClick={() => { onPick(p.src); onClose(); }}><AvImg src={p.src!} size={72} /></button>)}</div>
            {!photos.length ? <div className="yt-hint">相册里还没有照片</div> : null}
            <button type="button" onClick={() => setPick(false)}>返回</button>
          </>
        ) : (
          <>
            <div className="yt-msheet-h">换头像</div>
            <button type="button" onClick={() => file.current?.click()}>从手机里上传</button>
            <button type="button" onClick={() => setPick(true)}>从相册选</button>
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const src = await genAvatar(name, kind); if (src) { onPick(src); onClose(); } } catch (e) { onNotice?.(e instanceof Error ? e.message : "生图失败"); } setBusy(false); }}>{busy ? "生成中…" : "生图"}</button>
            <button type="button" onClick={() => { onPick(undefined); onClose(); }}>换回默认</button>
            <button type="button" onClick={onClose}>取消</button>
          </>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; onPick(await storeMediaBlob(f, f.type || "image/jpeg", "image")); onClose(); }} />
      </div>
    </div>
  );
}

function Thumb({ v, big }: { v: Video; big?: boolean }) {
  const url = useMedia(v.img.src);
  const g = hue(v.id);
  return (
    <div className={`yt-thumb${big ? " big" : ""}`} style={url ? undefined : { background: `linear-gradient(155deg, hsl(${g} 25% 14%), hsl(${(g + 30) % 360} 25% 28%) 60%, hsl(${(g + 60) % 360} 22% 42%))` }}>
      {url ? <img src={url} alt="" /> : <><small>画面</small><span>{v.img.desc}</span></>}
      <b>{v.dur}</b>
    </div>
  );
}

// ── 点画面放大：生成图片 / 编辑文字 ──

function ImgViewer({ img, onGen, onSave, onClose }: { img: Img; onGen: () => void; onSave: (d: string) => void; onClose: () => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const url = useMedia(img.src);
  const root = typeof document !== "undefined" ? document.querySelector(".yt-app") : null;
  const node = (
    <div className="yt-iv">
      <div className="yt-iv-top"><button type="button" onClick={onClose}><X size={24} /></button></div>
      <div className="yt-iv-body">
        {edit === null
          ? (url ? <img src={url} alt="" /> : <div className="yt-iv-desc"><small>画面</small><span>{img.desc}</span></div>)
          : <textarea className="yt-iv-ta" value={edit} onChange={e => setEdit(e.target.value)} autoFocus />}
      </div>
      <div className="yt-iv-bar">
        {edit === null ? (
          <>
            <button type="button" disabled={img.busy} onClick={onGen}><Sparkles size={18} />{img.busy ? "生成中…" : url ? "重新生成" : "生成图片"}</button>
            <button type="button" onClick={() => setEdit(img.desc)}><PencilLine size={18} />编辑文字</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEdit(null)}>取消</button>
            <button type="button" className="on" disabled={!edit.trim()} onClick={() => { onSave(edit.trim()); setEdit(null); }}>保存</button>
          </>
        )}
      </div>
    </div>
  );
  return root ? createPortal(node, root) : node;
}

// ── 视频卡片 ──

function VideoRow({ v, onWatch, onChannel }: { v: Video; onWatch: (id: string) => void; onChannel?: (id: string) => void }) {
  const ch = channelOf(v.ch);
  return (
    <article className="yt-card" onClick={() => onWatch(v.id)}>
      <Thumb v={v} />
      <div className="yt-vrow">
        <button type="button" onClick={e => { e.stopPropagation(); onChannel?.(v.ch); }}><ChAvatar ch={ch} /></button>
        <div className="yt-vmeta">
          <div className="yt-vt">{v.title}</div>
          {v.titleZh ? <div className="yt-zh">{v.titleZh}</div> : null}
          <div className="yt-sub">{ch?.name} · 观看 {num(viewsOf(v))} 次 · {ago(v.at)}</div>
        </div>
      </div>
    </article>
  );
}

function SmallCard({ v, onWatch }: { v: Video; onWatch: (id: string) => void }) {
  return (
    <button type="button" className="yt-hc" onClick={() => onWatch(v.id)}>
      <Thumb v={v} />
      <div className="yt-vt">{v.title}</div>
      {v.titleZh ? <div className="yt-zh">{v.titleZh}</div> : null}
      <div className="yt-sub">{num(viewsOf(v))} 次 · {ago(v.at)}</div>
    </button>
  );
}

// ── 主体 ──

const CHIPS = ["全部", "音乐", "舞蹈练习", "练习生", "团综", "舞台"] as const;
const chipMatch = (chip: string, kind: string) => chip === "全部" ? true
  : chip === "音乐" ? /MV|预告|音乐/i.test(kind)
  : chip === "舞蹈练习" ? /练习室|直拍|舞/.test(kind)
  : chip === "练习生" ? /练习生/.test(kind)
  : chip === "团综" ? /团综|vlog|直播/i.test(kind)
  : /舞台|打歌|颁奖|演唱会/.test(kind);

export function YoutubeApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (m: string) => void }) {
  const s = useYt();
  const [stack, setStack] = useState<View[]>([{ v: "home" }]);
  const view = stack[stack.length - 1];
  const go = (v: View) => setStack(x => [...x, v]);
  const back = () => setStack(x => (x.length > 1 ? x.slice(0, -1) : (onClose(), x)));
  const tab = (t: Tab) => setStack([{ v: t }]);
  const watch = (id: string) => go({ v: "watch", id });
  const channel = (id: string) => { go({ v: "channel", id }); };
  const refresh = () => void fillFeed().catch(e => onNotice?.(e instanceof Error ? e.message : "没刷出来"));

  useEffect(() => { if (needsFeed()) refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let body: React.ReactNode = null;
  if (view.v === "home") body = <Home onWatch={watch} onChannel={channel} onSearch={() => go({ v: "search" })} onExit={onClose} onRefresh={refresh} />;
  else if (view.v === "shorts") body = <div className="yt-page"><Bar onBack={back} title="Shorts" /><div className="yt-empty">Shorts 还没开放</div></div>;
  else if (view.v === "subs") body = <Subs onWatch={watch} onChannel={channel} onBack={back} />;
  else if (view.v === "me") body = <Me onWatch={watch} onChannel={channel} onBack={back} onNotice={onNotice} />;
  else if (view.v === "search") body = <SearchPage onBack={back} onChannel={id => setStack(x => [...x.slice(0, -1), { v: "channel", id }])} />;
  else if (view.v === "channel") body = <ChannelPage id={view.id} onBack={back} onWatch={watch} onNotice={onNotice} />;
  else if (view.v === "watch") body = <Watch key={view.id} id={view.id} onBack={back} onChannel={channel} onNotice={onNotice} />;

  const showTabs = view.v === "home" || view.v === "shorts" || view.v === "subs" || view.v === "me";
  return (
    <div className="yt-app" data-n={s.videos.length}>
      {body}
      {showTabs ? (
        <nav className="yt-tab">
          <button type="button" className={view.v === "home" ? "on" : ""} onClick={() => tab("home")}><House size={23} strokeWidth={view.v === "home" ? 2.4 : 1.8} />首页</button>
          <button type="button" className={view.v === "shorts" ? "on" : ""} onClick={() => tab("shorts")}><ShortsIcon />Shorts</button>
          <button type="button" className="plus" onClick={() => onNotice?.("练习生不能开自己的频道")}><CirclePlus size={36} strokeWidth={1.2} /></button>
          <button type="button" className={view.v === "subs" ? "on" : ""} onClick={() => tab("subs")}><SubsIcon />订阅</button>
          <button type="button" className={view.v === "me" ? "on" : ""} onClick={() => tab("me")}><UserAvatar name={s.me.handle} src={s.me.avatar} size={24} />我</button>
        </nav>
      ) : null}
    </div>
  );
}

function ShortsIcon() {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M14.5 3.5l-7 3.8a3.5 3.5 0 0 0 0 6.2l.8.4-.8.4a3.5 3.5 0 0 0 3.5 6.1l7-3.8a3.5 3.5 0 0 0 0-6.2l-.8-.4.8-.4a3.5 3.5 0 0 0-3.5-6.1z" /><path d="M10.5 9.5v5l4-2.5z" /></svg>;
}
function SubsIcon() {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M6 5h12M8 2h8M10.5 11.5v6l5-3z" /></svg>;
}
function Logo({ onClick }: { onClick?: () => void }) {
  return <button type="button" className="yt-logo" onClick={onClick}><span><Play size={11} fill="#fff" strokeWidth={0} /></span><strong>YouTube</strong></button>;
}
function Bar({ onBack, title, right }: { onBack: () => void; title?: string; right?: React.ReactNode }) {
  return <div className="yt-bar"><button type="button" onClick={onBack}><ChevronLeft size={26} /></button><b>{title}</b>{right ?? <span />}</div>;
}

function Home({ onWatch, onChannel, onSearch, onExit, onRefresh }: { onWatch: (id: string) => void; onChannel: (id: string) => void; onSearch: () => void; onExit: () => void; onRefresh: () => void }) {
  useYt();
  const [chip, setChip] = useState<string>("全部");
  const [pull, setPull] = useState(0);
  const startY = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = visibleVideos().filter(v => chipMatch(chip, v.kind)).sort((a, b) => b.at - a.at).slice(0, 80);
  const loading = feedLoading();
  return (
    <div className="yt-page">
      <div className="yt-top">
        <Logo onClick={onExit} />
        <button type="button" onClick={onSearch}><Search size={23} strokeWidth={1.9} /></button>
      </div>
      <div className="yt-chips">{CHIPS.map(c => <button type="button" key={c} className={c === chip ? "on" : ""} onClick={() => setChip(c)}>{c}</button>)}</div>
      <div className="yt-scroll" ref={box}
        onTouchStart={e => { startY.current = box.current?.scrollTop === 0 ? e.touches[0].clientY : null; }}
        onTouchMove={e => { if (startY.current !== null) setPull(Math.max(0, Math.min(90, e.touches[0].clientY - startY.current))); }}
        onTouchEnd={() => { if (pull > 64 && !loading) onRefresh(); setPull(0); startY.current = null; }}>
        <div className="yt-pull" style={{ height: loading ? 40 : pull * 0.5 }}>{loading ? "正在刷新…" : pull > 64 ? "松开刷新" : pull > 0 ? "下拉刷新" : ""}</div>
        {list.map(v => <VideoRow key={v.id} v={v} onWatch={onWatch} onChannel={onChannel} />)}
        {!list.length && !loading ? <div className="yt-empty">还没有视频<button type="button" className="yt-pill" onClick={onRefresh}>刷新看看</button></div> : null}
        <div style={{ height: 90 }} />
      </div>
    </div>
  );
}

function Subs({ onWatch, onChannel, onBack }: { onWatch: (id: string) => void; onChannel: (id: string) => void; onBack: () => void }) {
  const s = useYt();
  const chs = s.subs.map(id => s.channels[id]).filter((c): c is Channel => Boolean(c));
  const list = visibleVideos().filter(v => s.subs.includes(v.ch)).sort((a, b) => b.at - a.at).slice(0, 60);
  return (
    <div className="yt-page">
      <div className="yt-top"><Logo onClick={onBack} /></div>
      <div className="yt-scroll">
        {chs.length ? <div className="yt-subrow">{chs.map(c => <button type="button" key={c.id} onClick={() => onChannel(c.id)}><ChAvatar ch={c} size={56} /><span>{c.name}</span></button>)}</div> : null}
        {list.map(v => <VideoRow key={v.id} v={v} onWatch={onWatch} onChannel={onChannel} />)}
        {!chs.length ? <div className="yt-empty">还没订阅频道<small>在频道页点「订阅」，这里会有他们的更新</small></div> : null}
        <div style={{ height: 90 }} />
      </div>
    </div>
  );
}

function Me({ onWatch, onChannel, onBack, onNotice }: { onWatch: (id: string) => void; onChannel: (id: string) => void; onBack: () => void; onNotice: Notice }) {
  const s = useYt();
  const [edit, setEdit] = useState<string | null>(null);
  const [av, setAv] = useState(false);
  const liked = visibleVideos().filter(v => v.liked).sort((a, b) => b.at - a.at);
  const chs = s.subs.map(id => s.channels[id]).filter((c): c is Channel => Boolean(c));
  return (
    <div className="yt-page">
      <div className="yt-top"><Logo onClick={onBack} /></div>
      <div className="yt-scroll">
        <div className="yt-me"><button type="button" onClick={() => setAv(true)}><UserAvatar name={s.me.handle} src={s.me.avatar} size={64} /></button><div><b>@{s.me.handle}</b><small>评论用这个名字和头像，别人看不出是你</small><div className="yt-me-btns"><button type="button" className="yt-pill" onClick={() => setEdit(s.me.handle)}>改名字</button><button type="button" className="yt-pill" onClick={() => setAv(true)}>换头像</button></div></div></div>
        {edit !== null ? <div className="yt-me-edit"><input value={edit} onChange={e => setEdit(e.target.value)} /><button type="button" className="yt-pill dark" onClick={() => { setMyHandle(edit); setEdit(null); }}>保存</button></div> : null}
        <div className="yt-sec"><b>赞过的视频</b><span>{liked.length}</span></div>
        <div className="yt-hrow">{liked.slice(0, 10).map(v => <SmallCard key={v.id} v={v} onWatch={onWatch} />)}</div>
        {!liked.length ? <div className="yt-hint">还没赞过视频</div> : null}
        <div className="yt-sec"><b>订阅的频道</b><span>{chs.length}</span></div>
        {chs.map(c => <button type="button" key={c.id} className="yt-chrow" onClick={() => onChannel(c.id)}><ChAvatar ch={c} size={40} /><div><b>{c.name}</b><small>{num(c.subs)} 位订阅者</small></div></button>)}
        <div style={{ height: 90 }} />
      </div>
      {av ? <AvatarSheet name={s.me.handle} kind="me" onPick={setMyAvatar} onClose={() => setAv(false)} onNotice={onNotice} /> : null}
    </div>
  );
}

function SearchPage({ onBack, onChannel }: { onBack: () => void; onChannel: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [done, setDone] = useState("");
  const hits: Hit[] = done ? searchYt(done) : [];
  return (
    <div className="yt-page">
      <div className="yt-sbar">
        <button type="button" onClick={onBack}><ChevronLeft size={26} /></button>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") setDone(q.trim()); }} placeholder="搜索 YouTube" autoFocus />
        <button type="button" onClick={() => setDone(q.trim())}><Search size={22} /></button>
      </div>
      <div className="yt-scroll">
        {hits.map(h => (
          <button type="button" key={h.name + h.sub} className="yt-chrow" onClick={() => onChannel(openHit(h))}>
            <ChAvatar ch={h.ch ?? { name: h.name, companyId: h.companyId, kind: h.kind }} size={52} />
            <div><b>{h.name}</b><small>{h.sub}</small></div>
          </button>
        ))}
        {done && !hits.length ? <div className="yt-empty">没有找到「{done}」<small>只能搜到这个世界里已经有的团、艺人和公司</small></div> : null}
      </div>
    </div>
  );
}

function ChannelPage({ id, onBack, onWatch, onNotice }: { id: string; onBack: () => void; onWatch: (id: string) => void; onNotice: Notice }) {
  const s = useYt();
  const ch = s.channels[id];
  const [tabK, setTabK] = useState<"home" | "videos">("home");
  const [menu, setMenu] = useState(false);
  const [av, setAv] = useState(false);
  useEffect(() => { if (ch && !ch.written) void writeChannel(id).catch(e => onNotice?.(e instanceof Error ? e.message : "频道没打开")); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ch) return <div className="yt-page"><Bar onBack={onBack} /><div className="yt-empty">频道不见了</div></div>;
  const t = themeOf(ch);
  const vids = visibleVideos().filter(v => v.ch === id).sort((a, b) => b.at - a.at);
  const trainee = vids.filter(v => /练习生/.test(v.kind) || v.mine);
  const groups = [...new Set(vids.filter(v => !trainee.includes(v)).map(v => groupOfTitle(v.title)))].slice(0, 4);
  const subbed = s.subs.includes(id);
  return (
    <div className="yt-page">
      <Bar onBack={onBack} right={<button type="button" onClick={() => setMenu(true)}><Ellipsis size={22} /></button>} />
      <div className="yt-scroll">
        <div className="yt-banner" style={{ background: `linear-gradient(120deg, ${t.c} 0 55%, ${t.y} 55%)` }}><span>{ch.name}</span></div>
        <div className="yt-cinfo"><button type="button" onClick={() => setAv(true)}><ChAvatar ch={ch} size={72} /></button><div><h2>{ch.name}{ch.kind !== "person" ? <em>✓</em> : null}</h2><div className="yt-sub">{ch.handle}<br />{num(ch.subs)}位订阅者 · {vids.length} 个视频</div></div></div>
        {ch.desc ? <div className="yt-cdesc">{ch.desc}{ch.descZh ? <><br /><span>{ch.descZh}</span></> : null}</div> : channelWriting(id) ? <div className="yt-cdesc">正在打开频道…</div> : null}
        <button type="button" className={`yt-wide${subbed ? "" : " dark"}`} onClick={() => toggleSub(id)}>{subbed ? "已订阅" : "订阅"}</button>
        <div className="yt-ctabs"><button type="button" className={tabK === "home" ? "on" : ""} onClick={() => setTabK("home")}>首页</button><button type="button" className={tabK === "videos" ? "on" : ""} onClick={() => setTabK("videos")}>视频</button></div>
        {tabK === "home" ? (
          <>
            {ch.kind === "company" && trainee.length ? <><div className="yt-sec"><b>{ch.name.split(" ")[0]} TRAINEE</b><span>练习生</span></div><div className="yt-hrow">{trainee.slice(0, 8).map(v => <SmallCard key={v.id} v={v} onWatch={onWatch} />)}</div></> : null}
            {ch.kind === "company"
              ? groups.map(g => { const list = vids.filter(v => !trainee.includes(v) && groupOfTitle(v.title) === g); return <div key={g}><div className="yt-sec"><b>{g}</b></div><div className="yt-hrow">{list.slice(0, 8).map(v => <SmallCard key={v.id} v={v} onWatch={onWatch} />)}</div></div>; })
              : <><div className="yt-sec"><b>最新</b></div><div className="yt-hrow">{vids.slice(0, 8).map(v => <SmallCard key={v.id} v={v} onWatch={onWatch} />)}</div></>}
          </>
        ) : vids.map(v => <VideoRow key={v.id} v={v} onWatch={onWatch} />)}
        {!vids.length && !channelWriting(id) ? <div className="yt-empty">这个频道还没有视频</div> : null}
        <div style={{ height: 40 }} />
      </div>
      {menu ? (
        <div className="yt-sheet-bk" onClick={() => setMenu(false)}>
          <div className="yt-msheet" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => { setMenu(false); setAv(true); }}>换头像</button>
            <button type="button" onClick={() => setMenu(false)}>取消</button>
          </div>
        </div>
      ) : null}
      {av ? <AvatarSheet name={ch.name} kind={ch.kind} onPick={src => setChannelAvatar(id, src)} onClose={() => setAv(false)} onNotice={onNotice} /> : null}
    </div>
  );
}
/** 公司频道里按团分栏：标题里取团名（[MV] XXX 'song' → XXX） */
function groupOfTitle(t: string): string {
  const m = t.replace(/^\s*(\[[^\]]*\]\s*)+/, "").match(/^([A-Za-z0-9가-힣&.\-]+(?:\s[A-Za-z0-9가-힣&.\-]+)?)/);
  return (m?.[1] ?? "其他").replace(/\(.*$/, "").trim() || "其他";
}

// ── 看视频 ──

function Watch({ id, onBack, onChannel, onNotice }: { id: string; onBack: () => void; onChannel: (id: string) => void; onNotice: Notice }) {
  const s = useYt();
  const v = s.videos.find(x => x.id === id);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  if (!v) return <div className="yt-page"><Bar onBack={onBack} /><div className="yt-empty">视频不见了</div></div>;
  const ch = s.channels[v.ch];
  const subbed = s.subs.includes(v.ch);
  const top = v.cmts[0];
  const openSheet = () => {
    setSheet(true);
    if (!v.cmts.length) void moreComments(v.id).catch(e => onNotice?.(e instanceof Error ? e.message : "评论没加载出来"));
  };
  return (
    <div className="yt-page yt-watch">
      <div className="yt-player" onClick={() => setOpen(true)}>
        <PlayerImg img={v.img} />
        <button type="button" className="yt-pback" onClick={e => { e.stopPropagation(); onBack(); }}><ChevronDown size={26} /></button>
        <div className="yt-pg"><i /></div>
      </div>
      <div className="yt-scroll">
        <div className="yt-wt" onClick={() => setMore(!more)}>
          <h1>{v.title}</h1>
          {v.titleZh ? <div className="yt-zh">{v.titleZh}</div> : null}
          <div className="yt-sub">观看 {num(viewsOf(v))} 次 · {ago(v.at)} <em>{more ? "收起" : "...更多"}</em></div>
          {more ? <div className="yt-desc">{v.img.desc}</div> : null}
        </div>
        {v.cast?.length ? <div className="yt-cast"><b>出镜</b>{v.cast.map((c, i) => <span key={i} className={c.me ? "me" : ""}>{c.pos} {c.name}</span>)}</div> : null}
        <div className="yt-ch">
          <button type="button" onClick={() => onChannel(v.ch)}><ChAvatar ch={ch} size={34} /><b>{ch?.name}</b><span>{num(ch?.subs ?? 0)}</span></button>
          <button type="button" className={`yt-subbtn${subbed ? " on" : ""}`} onClick={() => toggleSub(v.ch)}>{subbed ? "已订阅" : "订阅"}</button>
        </div>
        <div className="yt-acts">
          <div className="yt-like"><button type="button" onClick={() => toggleLike(v.id)}><ThumbsUp size={18} fill={v.liked ? "currentColor" : "none"} />{num(v.likes)}</button><i /><button type="button"><ThumbsDown size={18} /></button></div>
          <button type="button" onClick={() => onNotice?.("链接复制好了")}><Share2 size={18} />分享</button>
          <button type="button" onClick={() => onNotice?.("存进稍后观看了")}><Bookmark size={18} />保存</button>
          <button type="button" onClick={() => setMenu(true)}><Ellipsis size={18} /></button>
        </div>
        <button type="button" className="yt-cbox" onClick={openSheet}>
          <h3>评论<span>{num(cmtCountOf(v))}</span></h3>
          {top ? <p><UserAvatar name={top.by} size={24} /><span>{top.text}</span></p> : <p className="dim">点开看看评论</p>}
        </button>
        <div style={{ height: 40 }} />
      </div>
      {sheet ? <Comments v={v} onClose={() => setSheet(false)} onNotice={onNotice} /> : null}
      {open ? <ImgViewer img={v.img} onClose={() => setOpen(false)}
        onGen={() => void generateVideoImg(v.id).catch(e => onNotice?.(e instanceof Error ? e.message : "生图失败"))}
        onSave={d => editVideoDesc(v.id, d)} /> : null}
      {menu ? (
        <div className="yt-sheet-bk" onClick={() => setMenu(false)}>
          <div className="yt-msheet" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => { setMenu(false); setOpen(true); }}>看大图<small>在里面生成图片、编辑文字</small></button>
            <button type="button" className="red" onClick={() => { purgeVideo(v.id); setMenu(false); onNotice?.("彻底删掉了，当它没发生过"); onBack(); }}>彻底删除<small>当它没发生过，记忆里也不留</small></button>
            <button type="button" onClick={() => setMenu(false)}>取消</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlayerImg({ img }: { img: Img }) {
  const url = useMedia(img.src);
  if (url) return <img src={url} alt="" />;
  return <div className="yt-pdesc"><span>{img.desc}</span>{img.busy ? <em>生成中…</em> : null}</div>;
}

function Comments({ v, onClose, onNotice }: { v: Video; onClose: () => void; onNotice: Notice }) {
  const s = useYt();
  const [sort, setSort] = useState<"top" | "new">("top");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Cmt | null>(null);
  const [openR, setOpenR] = useState<string[]>([]);
  const list = [...v.cmts].sort((a, b) => sort === "new" ? b.at - a.at : (b.me ? 1e9 : b.likes) - (a.me ? 1e9 : a.likes));
  const err = (e: unknown) => onNotice?.(e instanceof Error ? e.message : "没加载出来");
  const send = () => {
    if (!draft.trim()) return;
    myComment(v.id, draft.trim(), replyTo?.id);
    if (replyTo) setOpenR(x => [...new Set([...x, replyTo.id])]);
    setDraft(""); setReplyTo(null);
  };
  const busy = commentsBusy(v.id);
  return (
    <div className="yt-csheet">
      <div className="yt-grab" />
      <div className="yt-sh-h"><b>评论</b><span>{num(cmtCountOf(v))}</span><ListFilter size={22} /><button type="button" onClick={onClose}><X size={24} /></button></div>
      <div className="yt-sh-chips"><button type="button" className={sort === "top" ? "on" : ""} onClick={() => setSort("top")}>热门</button><button type="button" className={sort === "new" ? "on" : ""} onClick={() => setSort("new")}>最新</button></div>
      <div className="yt-clist">
        {list.map(c => {
          const opened = openR.includes(c.id);
          const rb = commentsBusy(`${v.id}:${c.id}`);
          return (
            <div key={c.id} className="yt-cm">
              <UserAvatar name={c.by} src={c.me ? s.me.avatar : undefined} />
              <div className="yt-cm-main">
                <CmtBody c={c} />
                <div className="yt-ops"><span><ThumbsUp size={15} />{c.likes || ""}</span><ThumbsDown size={15} /><button type="button" onClick={() => setReplyTo(c)}>回复</button></div>
                {c.replies?.length && !opened ? <button type="button" className="yt-more" onClick={() => setOpenR(x => [...x, c.id])}><ChevronDown size={16} />{c.replies.length} 条回复</button> : null}
                {opened ? (
                  <div className="yt-reps">
                    {(c.replies ?? []).map(r => <div key={r.id} className="yt-cm sm"><UserAvatar name={r.by} size={24} src={r.me ? s.me.avatar : undefined} /><div className="yt-cm-main"><CmtBody c={r} /><div className="yt-ops"><span><ThumbsUp size={14} />{r.likes || ""}</span><button type="button" onClick={() => setReplyTo(c)}>回复</button></div></div></div>)}
                  </div>
                ) : null}
                {opened || (c.me && !c.replies?.length) ? <button type="button" className="yt-more" disabled={rb} onClick={() => { setOpenR(x => [...new Set([...x, c.id])]); void moreComments(v.id, c.id).catch(err); }}><ChevronDown size={16} />{rb ? "加载中…" : c.replies?.length ? "加载更多回复" : "看看有没有人回复"}</button> : null}
              </div>
            </div>
          );
        })}
        {busy && !list.length ? <div className="yt-empty">加载中…</div> : null}
        <button type="button" className="yt-loadmore" disabled={busy} onClick={() => void moreComments(v.id).catch(err)}>{busy ? "加载中…" : "加载更多评论"}</button>
        <div style={{ height: 20 }} />
      </div>
      <div className="yt-input">
        <UserAvatar name={s.me.handle} src={s.me.avatar} size={28} />
        <div>
          {replyTo ? <small>回复 @{replyTo.by}<button type="button" onClick={() => setReplyTo(null)}><X size={12} /></button></small> : <small>以 @{s.me.handle} 发出，别人看不出是你</small>}
          <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} placeholder="添加评论…" />
        </div>
        <button type="button" className="yt-send" disabled={!draft.trim()} onClick={send}>发布</button>
      </div>
    </div>
  );
}

function CmtBody({ c }: { c: Cmt }) {
  const parts = c.text.split(/(\b\d{1,2}:\d{2}\b)/);
  return (
    <>
      <div className="yt-who"><b>@{c.by}</b> · {ago(c.at)}{c.charId ? <span className="yt-mj">他的小号</span> : null}{c.me ? <span className="yt-mine">你</span> : null}</div>
      <div className="yt-tx">{parts.map((p, i) => /^\d{1,2}:\d{2}$/.test(p) ? <span key={i} className="yt-ts">{p}</span> : p)}</div>
      {c.zh ? <div className="yt-zh">{c.zh}</div> : null}
    </>
  );
}
