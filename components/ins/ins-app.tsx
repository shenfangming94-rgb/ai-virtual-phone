"use client";

/**
 * 爱豆小手机：ins。样子照真 ins，主页和帖子用查手机 ins 的样式（checkphone.css 的 cp-instagram-*）。
 * 界面上不放 emoji，图标都是线条。数据和 AI 在 lib/idol-ins.ts。
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bookmark, ChevronLeft, ChevronRight, Clapperboard, Ellipsis, SquareUserRound, Eye, Grid3X3, Heart, Home, Image as ImageIcon, MapPin, MessageCircle, Music, PencilLine, Plus, Search, Send, Settings, Sparkles, SquarePlus, UserRound, UsersRound, X,
} from "lucide-react";

import {
  BGS, INS_EVENT, ME, accOf, activeStories, answerIncoming, canSee, charAvatar, dmAllowed, dmOf, dmReplying, deleteDm, editDm, fillFeed, follow, generateImg, hidePost,
  loadIns, markNotesSeen, maybeKnow, myPost, myStory, needsFill, ownerName, refreshExplore, relationTo, replyDm, searchAccs, sendDm, setDmFlags, setMe, setPrivate,
  unfollow, unarchive, purgePost, purgeStory, editImgDesc, unseenNotes, toggleLike, myComment, moreComments, commentsBusy, sendDmImg, type Img, type InsAcc, type Post, type Story,
} from "@/lib/idol-ins";
import { loadCharacters } from "@/lib/character-storage";
import { loadProfiles } from "@/lib/idol-people";
import { loadPhotos } from "@/lib/album-store";
import { SELF_REFERENCE_ID } from "@/lib/image-generation-service";
import { loadMediaObjectUrl, isMediaStoreRef, storeMediaBlob } from "@/lib/media-cache-storage";
import { loadTraineeCard } from "@/lib/trainee-card";

type Notice = ((m: string) => void) | undefined;
type Tab = "home" | "search" | "dm" | "me";
type View =
  | { v: Tab }
  | { v: "compose" } | { v: "more" } | { v: "story-new" }
  | { v: "profile"; id: string } | { v: "posts"; id: string; start: string }
  | { v: "notes" } | { v: "requests" } | { v: "chat"; id: string } | { v: "dmreq" };

function useIns() {
  const [, set] = useState(0);
  useEffect(() => {
    const bump = () => set(x => x + 1);
    window.addEventListener(INS_EVENT, bump);
    const t = window.setInterval(bump, 8000);
    return () => { window.removeEventListener(INS_EVENT, bump); window.clearInterval(t); };
  }, []);
  return loadIns();
}

const fmtN = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n);
function ago(at: number) {
  const m = Math.max(0, Math.floor((Date.now() - at) / 60e3));
  if (m < 1) return "刚刚"; if (m < 60) return `${m}分钟`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}小时`;
  const d = Math.floor(h / 24); return d < 7 ? `${d}天` : `${new Date(at).getMonth() + 1}月${new Date(at).getDate()}日`;
}

function Verified() {
  return <svg className="ig-vf" viewBox="0 0 24 24"><path d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3 3.2.1z" fill="#0095f6" /><path d="M8 12.2l2.6 2.6L16 9.4" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Avatar({ acc, size = 32, ring }: { acc?: InsAcc; size?: number; ring?: "new" | "seen" }) {
  const mine = useMedia(acc?.id === ME ? loadIns().me.avatar : undefined);
  const src = acc?.id === ME ? mine ?? loadTraineeCard()?.photo ?? null : charAvatar(acc);
  const inner = <span className="ig-av" style={{ width: size, height: size, background: src ? undefined : `linear-gradient(160deg, hsl(${acc?.hue ?? 300} 45% 86%), hsl(${acc?.hue ?? 300} 35% 66%))` }}>{src ? <img src={src} alt="" /> : null}</span>;
  if (!ring) return inner;
  return <span className={`ig-ring ${ring}`} style={{ width: size + 8, height: size + 8 }}>{inner}</span>;
}

function useMedia(src?: string) {
  const [url, setUrl] = useState<string | null>(src && !isMediaStoreRef(src) ? src : null);
  useEffect(() => {
    let off = false;
    if (src && isMediaStoreRef(src)) void loadMediaObjectUrl(src).then(u => { if (!off) setUrl(u); });
    else setUrl(src ?? null);
    return () => { off = true; };
  }, [src]);
  return url;
}

function Pic({ img, onOpen, ratio = "1/1", small }: { img: Img; onOpen?: () => void; ratio?: string; small?: boolean }) {
  const url = useMedia(img.src);
  const click = onOpen ? (e: React.MouseEvent) => { e.stopPropagation(); onOpen(); } : undefined;
  if (url) return <div className="ig-pic" style={{ aspectRatio: ratio }} onClick={click}><img src={url} alt="" /></div>;
  return (
    <div className={`ig-desc${small ? " sm" : ""}`} style={{ aspectRatio: ratio }} onClick={click}>
      {!small ? <small>画面</small> : null}
      <span>{img.desc}</span>
      {img.busy && !small ? <em className="ig-busy">生成中…</em> : null}
    </div>
  );
}

/** 点图放大：生成图片 / 编辑文字（别人的帖子也能改） */
function ImgViewer({ img, ratio, onGen, onSave, onClose }: { img: Img; ratio: string; onGen: () => void; onSave: (desc: string) => void; onClose: () => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const url = useMedia(img.src);
  const root = typeof document !== "undefined" ? document.querySelector(".ig-app") : null;
  const node = (
    <div className="ig-iv" onClick={e => e.stopPropagation()}>
      <div className="ig-iv-top"><button type="button" onClick={onClose}><X size={24} color="#fff" /></button></div>
      <div className="ig-iv-body">
        {edit === null
          ? (url ? <img src={url} alt="" style={{ aspectRatio: ratio }} /> : <div className="ig-desc" style={{ aspectRatio: ratio }}><small>画面</small><span>{img.desc}</span></div>)
          : <textarea className="ig-iv-ta" value={edit} onChange={e => setEdit(e.target.value)} autoFocus />}
      </div>
      <div className="ig-iv-bar">
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

function Carousel({ post, onNotice }: { post: Post; onNotice: Notice }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const img = post.imgs[i];
  return (
    <div className="ig-car">
      <Pic img={img} onOpen={() => setOpen(true)} />
      {post.imgs.length > 1 ? (
        <>
          {i > 0 ? <button type="button" className="ig-nav l" onClick={() => setI(i - 1)}><ChevronLeft size={16} /></button> : null}
          {i < post.imgs.length - 1 ? <button type="button" className="ig-nav r" onClick={() => setI(i + 1)}><ChevronRight size={16} /></button> : null}
          <div className="ig-dots">{post.imgs.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
        </>
      ) : null}
      {open && img ? <ImgViewer img={img} ratio="1/1" onClose={() => setOpen(false)}
        onGen={() => void generateImg(post.id, i).catch(e => onNotice?.(e instanceof Error ? e.message : "生图失败"))}
        onSave={d => editImgDesc(post.id, i, d)} /> : null}
    </div>
  );
}

function PostCard({ post, onOpen, onNotice, mine }: { post: Post; onOpen: (id: string) => void; onNotice: Notice; mine?: boolean }) {
  const a = accOf(post.by);
  const s = loadIns();
  const [cm, setCm] = useState(false);
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <article className="cp-instagram-feed-post">
      <div className="cp-instagram-post-head">
        <button type="button" onClick={() => onOpen(post.by)}><Avatar acc={a} /></button>
        <div className="cp-instagram-post-author"><strong onClick={() => onOpen(post.by)}>{a?.handle}{a?.verified ? <Verified /> : null}{post.place ? <span>{post.place}</span> : null}</strong></div>
        <button type="button" onClick={() => setMenu(true)}><Ellipsis size={19} /></button>
      </div>
      <Carousel post={post} onNotice={onNotice} />
      <div className="cp-instagram-post-actions">
        <button type="button" onClick={() => toggleLike(post.id)}><Heart size={23} strokeWidth={2.1} fill={post.liked ? "#ff3040" : "none"} color={post.liked ? "#ff3040" : "currentColor"} /></button>
        <button type="button" onClick={() => setCm(true)}><MessageCircle size={23} strokeWidth={2.1} /></button>
        <button type="button"><Send size={22} strokeWidth={2.1} /></button>
        <button type="button"><Bookmark size={23} strokeWidth={2.1} /></button>
      </div>
      <div className="cp-instagram-post-copy">
        {!post.hideLikes ? <strong>{post.likes.toLocaleString()} 次赞</strong> : null}
        {post.cap ? <p><b>{a?.handle}</b> {post.cap}</p> : null}
        {post.capZh ? <div className="ig-tr">{post.capZh}</div> : null}
        {post.comments.length ? <button type="button" onClick={() => setCm(true)}>查看全部 {post.comments.length} 条评论</button> : null}
        <time>{ago(post.at)}</time>
        {mine && s.me.riskHint && post.risk && post.risk.level !== "none" ? (
          <div className="ig-risk">{post.risk.leaked ? "已经被扒了：" : post.risk.level === "high" ? "很冒险：" : post.risk.level === "mid" ? "有点冒险：" : "有一点点风险："}{post.risk.why}</div>
        ) : null}
        {post.archived ? <div className="ig-risk">已归档，只有你看得到</div> : null}
      </div>
      {cm ? (
        <div className="cp-instagram-sheet-backdrop" onClick={() => setCm(false)}>
          <section className="cp-instagram-comments-sheet" onClick={e => e.stopPropagation()}>
            <div className="cp-instagram-sheet-handle" />
            <div className="cp-instagram-sheet-head"><span /><strong>评论</strong><span /></div>
            <div className="cp-instagram-comment-list">
              {post.comments.map((c, i) => {
                const ca = Object.values(s.accs).find(x => x.handle === c.by);
                return (
                  <div key={i} className="cp-instagram-comment">
                    <Avatar acc={ca ?? { id: c.by, handle: c.by, name: c.by, private: false, followers: 0, bio: "", hue: (c.by.length * 47) % 360 }} size={32} />
                    <div className="cp-instagram-comment-main">
                      <div className="cp-instagram-comment-heading"><strong>{c.by}</strong><span className="cp-instagram-comment-time">{ago(c.at)}</span></div>
                      <p>{c.text}</p>
                      {c.zh ? <div className="ig-tr">{c.zh}</div> : null}
                    </div>
                  </div>
                );
              })}
              {!post.comments.length ? <div className="ig-empty">{post.noComments ? "评论已关闭" : "还没有评论"}</div> : null}
              {!post.noComments ? (
                <div className="ig-cm-acts">
                  <button type="button" disabled={commentsBusy(post.id)} onClick={() => void moreComments(post.id, "more").catch(e => onNotice?.(e instanceof Error ? e.message : "没加载出来"))}>{commentsBusy(post.id) ? "加载中…" : "加载更多评论"}</button>
                </div>
              ) : null}
            </div>
            {!post.noComments ? (
              <div className="cp-instagram-comment-input">
                <Avatar acc={accOf(ME)} size={30} />
                <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && draft.trim()) { myComment(post.id, draft.trim()); setDraft(""); } }} placeholder={`给 ${a?.handle} 留言…`} />
                <button type="button" className="ig-link" disabled={!draft.trim()} onClick={() => { myComment(post.id, draft.trim()); setDraft(""); }}>发布</button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
      {menu ? (
        <div className="ig-sheet-bk" onClick={() => setMenu(false)}>
          <div className="ig-sheet" onClick={e => e.stopPropagation()}>
            {mine ? (post.archived
              ? <button type="button" onClick={() => { unarchive(post.id); setMenu(false); }}>取消归档</button>
              : <button type="button" onClick={() => { hidePost(post.id, "archive"); setMenu(false); onNotice?.("归档了，只有你看得到"); }}>归档</button>) : null}
            {mine ? <button type="button" className="red" onClick={() => { hidePost(post.id, "delete"); setMenu(false); onNotice?.("删掉了"); }}>删除<small>戏里删帖，删之前可能已经有人截图</small></button> : null}
            <button type="button" className="red" onClick={() => { purgePost(post.id); setMenu(false); onNotice?.("彻底删掉了，当它没发生过"); }}>彻底删除<small>当它没发生过，记忆里也不留</small></button>
            <button type="button" onClick={() => setMenu(false)}>取消</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

// ── 主体 ──

export function InsApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (m: string) => void }) {
  const s = useIns();
  const [stack, setStack] = useState<View[]>([{ v: "home" }]);
  const [story, setStory] = useState<{ list: Story[]; i: number } | null>(null);
  const [filling, setFilling] = useState(false);
  const view = stack[stack.length - 1];
  const go = (v: View) => setStack(x => [...x, v]);
  const back = () => setStack(x => (x.length > 1 ? x.slice(0, -1) : (onClose(), x)));
  const tab = (t: Tab) => setStack([{ v: t }]);
  const openProfile = (id: string) => go(id === ME ? { v: "me" } : { v: "profile", id });

  useEffect(() => {
    if (!needsFill()) return;
    setFilling(true);
    fillFeed().catch(e => onNotice?.(`ins 没刷出来：${e instanceof Error ? e.message : e}`)).finally(() => setFilling(false));
  }, [onNotice]);

  const tabbar = (cur: Tab) => (
    <div className="ig-tabbar">
      <button type="button" className={cur === "home" ? "on" : ""} onClick={() => tab("home")}><Home size={25} strokeWidth={cur === "home" ? 2.4 : 1.8} /></button>
      <button type="button" className={cur === "search" ? "on" : ""} onClick={() => tab("search")}><Search size={25} strokeWidth={cur === "search" ? 2.6 : 1.8} /></button>
      <button type="button" onClick={() => go({ v: "compose" })}><SquarePlus size={25} strokeWidth={1.8} /></button>
      <button type="button" className={cur === "dm" ? "on" : ""} onClick={() => tab("dm")}><Send size={24} strokeWidth={cur === "dm" ? 2.4 : 1.8} /></button>
      <button type="button" className={cur === "me" ? "on" : ""} onClick={() => tab("me")}><Avatar acc={accOf(ME)} size={26} /></button>
    </div>
  );

  let body: React.ReactNode = null;
  if (view.v === "home") {
    const stories = activeStories();
    const byAcc = new Map<string, Story[]>();
    for (const st of stories.sort((a, b) => a.at - b.at)) byAcc.set(st.by, [...(byAcc.get(st.by) ?? []), st]);
    const mineSt = byAcc.get(ME) ?? [];
    const others = [...byAcc.entries()].filter(([id]) => id !== ME);
    const feed = s.posts.filter(p => !p.deleted && !p.archived && (p.by === ME || s.following.includes(p.by)) && p.at <= Date.now()).sort((a, b) => b.at - a.at).slice(0, 60);
    const un = unseenNotes();
    body = (
      <div className="ig-page">
        <div className="ig-top"><span className="ig-wm">Instagram</span><button type="button" className="ig-bell" onClick={() => go({ v: "notes" })}><Heart size={25} strokeWidth={1.9} />{un ? <i /> : null}</button></div>
        <div className="ig-scroll">
          <div className="ig-stories">
            <button type="button" className="ig-st me" onClick={() => (mineSt.length ? setStory({ list: mineSt, i: 0 }) : go({ v: "story-new" }))}>
              <Avatar acc={accOf(ME)} size={62} ring={mineSt.length ? "new" : undefined} />{!mineSt.length ? <em><Plus size={13} strokeWidth={3} /></em> : null}<span>你的快拍</span>
            </button>
            {others.map(([id, list]) => <button type="button" key={id} className="ig-st" onClick={() => setStory({ list, i: 0 })}><Avatar acc={accOf(id)} size={62} ring="new" /><span>{accOf(id)?.handle}</span></button>)}
          </div>
          {filling ? <div className="ig-loading">正在刷新…</div> : null}
          <div className="cp-instagram-feed">
            {feed.map(p => <PostCard key={p.id} post={p} onOpen={openProfile} onNotice={onNotice} mine={p.by === ME} />)}
          </div>
          {!feed.length && !filling ? <div className="ig-empty">{s.following.length ? "大家最近都没发东西" : "还没关注任何人。去搜索里找找认识的人吧"}</div> : null}
        </div>
        {tabbar("home")}
      </div>
    );
  } else if (view.v === "search") body = <SearchPage onOpen={openProfile} onNotice={onNotice} tabbar={tabbar("search")} />;
  else if (view.v === "dm") body = <DmList onChat={id => go({ v: "chat", id })} onReq={() => go({ v: "dmreq" })} tabbar={tabbar("dm")} onBack={back} />;
  else if (view.v === "dmreq") body = <DmList req onChat={id => go({ v: "chat", id })} onBack={back} />;
  else if (view.v === "chat") body = <Chat id={view.id} onBack={back} onNotice={onNotice} />;
  else if (view.v === "me") body = <Profile id={ME} onBack={back} onPosts={(id, start) => go({ v: "posts", id, start })} onReq={() => go({ v: "requests" })} onNotice={onNotice} tabbar={tabbar("me")} onStory={list => setStory({ list, i: 0 })} />;
  else if (view.v === "profile") body = <Profile id={view.id} onBack={back} onPosts={(id, start) => go({ v: "posts", id, start })} onNotice={onNotice} onChat={id => go({ v: "chat", id })} onStory={list => setStory({ list, i: 0 })} />;
  else if (view.v === "posts") {
    const list = s.posts.filter(p => p.by === view.id && !p.deleted && (view.id === ME || !p.archived)).sort((a, b) => b.at - a.at);
    const i = Math.max(0, list.findIndex(p => p.id === view.start));
    body = (
      <div className="ig-page">
        <div className="ig-bar"><button type="button" onClick={back}><ChevronLeft size={26} /></button><b>帖子</b><span /></div>
        <div className="ig-scroll"><div className="cp-instagram-feed">{list.slice(i).map(p => <PostCard key={p.id} post={p} onOpen={openProfile} onNotice={onNotice} mine={p.by === ME} />)}</div></div>
      </div>
    );
  } else if (view.v === "notes") body = <Notes onBack={back} onOpen={openProfile} onReq={() => go({ v: "requests" })} />;
  else if (view.v === "requests") body = <Requests onBack={back} />;
  else if (view.v === "compose" || view.v === "more") body = <Compose onBack={back} onDone={() => tab("home")} onNotice={onNotice} />;
  else if (view.v === "story-new") body = <StoryNew onBack={back} onNotice={onNotice} />;

  return (
    <div className="ig-app">
      {body}
      {story ? <StoryViewer list={story.list} start={story.i} onClose={() => setStory(null)} onNotice={onNotice} /> : null}
    </div>
  );
}

// ── 搜索 / 探索 ──

function SearchPage({ onOpen, onNotice, tabbar }: { onOpen: (id: string) => void; onNotice: Notice; tabbar: React.ReactNode }) {
  const s = useIns();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBusy(true); refreshExplore().catch(() => undefined).finally(() => setBusy(false)); }, []);
  const list = searchAccs(q);
  const ex = (s.explore?.ids ?? []).map(id => s.posts.find(p => p.id === id)).filter((p): p is Post => Boolean(p));
  const row = (a: InsAcc, sub?: string) => {
    const rel = relationTo(a.id);
    return (
      <div className="ig-ac" key={a.id}>
        <button type="button" onClick={() => onOpen(a.id)}><Avatar acc={a} size={52} /></button>
        <div onClick={() => onOpen(a.id)}><b>{a.handle}{a.verified ? <Verified /> : null}{a.alt ? <span className="ig-tag">他的小号</span> : null}</b><small>{sub ?? (a.alt ? "别人看不出是他" : `${a.name}${a.verified ? ` · 粉丝 ${fmtN(a.followers)}` : ""}`)}</small></div>
        <button type="button" className={`ig-fb${rel === "none" ? "" : " ghost"}`} onClick={() => { if (rel === "none") { const r = follow(a.id); if (r === "requested") onNotice?.("申请发出去了"); } else unfollow(a.id); }}>{rel === "following" ? "已关注" : rel === "requested" ? "已申请" : "关注"}</button>
      </div>
    );
  };
  return (
    <div className="ig-page">
      <div className="ig-sbar"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索" /></div>
      <div className="ig-scroll">
        {q.trim() ? (list.length ? list.map(a => row(a)) : <div className="ig-empty">没有找到「{q}」</div>) : (
          <>
            {maybeKnow().length ? <><div className="ig-sec">你可能认识</div>{maybeKnow().map(a => row(a, `${ownerName(a)}${loadProfiles()[a.charId!]?.role ? ` · ${loadProfiles()[a.charId!].role}` : ""}`))}</> : null}
            <div className="ig-sec">探索</div>
            <div className="ig-grid">{ex.map(p => <button type="button" key={p.id} onClick={() => onOpen(p.by)}><Pic img={p.imgs[0]} ratio="3/4" small /></button>)}</div>
            {!ex.length ? <div className="ig-empty">{busy ? "加载中…" : "探索还是空的"}</div> : null}
          </>
        )}
      </div>
      {tabbar}
    </div>
  );
}

// ── 主页 ──

function Profile({ id, onBack, onPosts, onReq, onNotice, tabbar, onChat, onStory }: { id: string; onBack: () => void; onPosts: (id: string, start: string) => void; onReq?: () => void; onNotice: Notice; tabbar?: React.ReactNode; onChat?: (id: string) => void; onStory: (l: Story[]) => void }) {
  const s = useIns();
  const a = accOf(id);
  const mine = id === ME;
  const [editing, setEditing] = useState(false);
  const [ptab, setPtab] = useState<"grid" | "video" | "tag">("grid");
  if (!a) return <div className="ig-page"><div className="ig-bar"><button type="button" onClick={onBack}><ChevronLeft size={26} /></button><b /></div><div className="ig-empty">找不到这个号</div></div>;
  const posts = s.posts.filter(p => p.by === id && !p.deleted && (mine || !p.archived)).sort((x, y) => y.at - x.at);
  const see = canSee(id);
  const rel = relationTo(id);
  const st = activeStories().filter(x => x.by === id);
  const followers = mine ? s.followers.length : a.followers + (rel === "following" ? 1 : 0);
  const following = mine ? s.following.length : Math.round(80 + (a.hue % 300));
  return (
    <div className="ig-page">
      <div className="cp-instagram-module ig-prof">
        <header className="cp-instagram-appbar">
          {mine ? <span style={{ width: 34 }} /> : <button type="button" className="cp-instagram-nav-btn" onClick={onBack}><ChevronLeft size={23} strokeWidth={2.4} /></button>}
          <div className="cp-instagram-header-stack"><div className="cp-instagram-header-title">{a.handle}{a.verified ? <Verified /> : null}</div><div className="cp-instagram-header-subtitle">{a.name}</div></div>
          <div className="cp-appbar-actions">{mine ? <button type="button" className="cp-instagram-nav-btn" onClick={() => setEditing(true)}><Settings size={19} /></button> : <span style={{ width: 34 }} />}</div>
        </header>
        <div className="ig-scroll">
          <section className="cp-instagram-profile-card">
            <div className="cp-instagram-profile-top">
              <button type="button" onClick={() => st.length && onStory(st)}><Avatar acc={a} size={76} ring={st.length ? "new" : undefined} /></button>
              <div className="cp-instagram-profile-stats"><div><strong>{posts.length}</strong><span>帖子</span></div><div><strong>{fmtN(followers)}</strong><span>粉丝</span></div><div><strong>{fmtN(following)}</strong><span>关注</span></div></div>
            </div>
            {a.bio ? <div className="cp-instagram-profile-main"><p style={{ whiteSpace: "pre-wrap" }}>{a.bio}</p></div> : null}
            <div className="cp-instagram-profile-actions">
              {mine ? <><button type="button" onClick={() => setEditing(true)}>编辑主页</button><button type="button" onClick={() => onNotice?.("分享链接复制好了")}>分享主页</button></>
                : <><button type="button" className={rel === "none" ? "ig-blue" : ""} onClick={() => { if (rel === "none") { if (follow(id) === "requested") onNotice?.("申请发出去了"); } else unfollow(id); }}>{rel === "following" ? "已关注" : rel === "requested" ? "已申请" : "关注"}</button>
                  <button type="button" onClick={() => (dmAllowed(id) ? onChat?.(id) : onNotice?.("你们加了 KakaoTalk，去 KakaoTalk 聊吧"))}>发消息</button></>}
            </div>
          </section>
          {mine && s.incoming.length ? (
            <button type="button" className="ig-req" onClick={onReq}><span className="ig-av3">{s.incoming.slice(0, 3).map(r => <Avatar key={r.id} acc={accOf(r.id)} size={24} />)}</span><span><b>关注申请</b> · {s.incoming.length} 个人想关注你</span><em>查看</em></button>
          ) : null}
          {mine ? <div className="ig-pv"><span>私密账号<small>关了就是公开：陌生人也能看、能评论</small></span><button type="button" className={`ig-sw${s.me.private ? " on" : ""}`} onClick={() => { setPrivate(!s.me.private); onNotice?.(s.me.private ? "现在是公开账号" : "现在是私密账号"); }} /></div> : null}
          <div className="cp-instagram-profile-tabs">
            <span className={ptab === "grid" ? "is-active" : ""} onClick={() => setPtab("grid")}><Grid3X3 size={22} /></span>
            <span className={ptab === "video" ? "is-active" : ""} onClick={() => setPtab("video")}><Clapperboard size={22} /></span>
            <span className={ptab === "tag" ? "is-active" : ""} onClick={() => setPtab("tag")}><SquareUserRound size={22} /></span>
          </div>
          {ptab !== "grid" ? <div className="ig-empty">{ptab === "video" ? "还没有视频" : "还没有被标记的照片"}</div> : see ? (
            <div className="ig-grid">{posts.map(p => <button type="button" key={p.id} onClick={() => onPosts(id, p.id)} className={p.archived ? "dim" : ""}><Pic img={p.imgs[0]} ratio="3/4" small /></button>)}</div>
          ) : <div className="ig-lock"><b>这是私密账号</b><span>关注后才能看到帖子</span></div>}
          {ptab === "grid" && see && !posts.length ? <div className="ig-empty">还没有帖子</div> : null}
        </div>
      </div>
      {tabbar}
      {editing ? <EditMe onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function EditMe({ onClose }: { onClose: () => void }) {
  const s = loadIns();
  const [f, setF] = useState(s.me);
  const [pickAv, setPickAv] = useState(false);
  const avFile = useRef<HTMLInputElement>(null);
  const avUrl = useMedia(f.avatar);
  const cur = avUrl ?? loadTraineeCard()?.photo ?? null;
  return (
    <div className="ig-sheet-bk" onClick={onClose}>
      <div className="ig-sheet ig-edit" onClick={e => e.stopPropagation()}>
        <div className="ig-edit-h"><b>编辑主页</b></div>
        <div className="ig-av-edit">
          <span className="ig-av" style={{ width: 84, height: 84, background: cur ? undefined : "linear-gradient(160deg, hsl(340 45% 86%), hsl(340 35% 66%))" }}>{cur ? <img src={cur} alt="" /> : null}</span>
          <button type="button" className="ig-link" onClick={() => setPickAv(!pickAv)}>更换头像</button>
        </div>
        {pickAv ? (
          <div className="ig-av-pick">
            <button type="button" className="ig-np-row" onClick={() => avFile.current?.click()}><ImageIcon size={20} /><span>从手机里上传</span><ChevronRight size={16} /></button>
            <input ref={avFile} type="file" accept="image/*" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; const ref = await storeMediaBlob(file, file.type || "image/jpeg", "image"); setF(x => ({ ...x, avatar: ref })); setPickAv(false); }} />
            <div className="ig-grid">{loadPhotos().filter(p => p.inLibrary && p.src).slice(-9).reverse().map(p => <button type="button" key={p.id} onClick={() => { setF(x => ({ ...x, avatar: p.src })); setPickAv(false); }}><Pic img={{ desc: p.desc, src: p.src }} ratio="1/1" small /></button>)}</div>
            {f.avatar ? <button type="button" className="ig-np-row" onClick={() => { setF(x => ({ ...x, avatar: undefined })); setPickAv(false); }}><span>用练习生证上的照片</span></button> : null}
          </div>
        ) : null}
        <label>用户名<input value={f.handle} onChange={e => setF({ ...f, handle: e.target.value.replace(/[^a-zA-Z0-9._]/g, "").toLowerCase() })} /></label>
        <label>名字<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label>简介<textarea rows={3} value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} /></label>
        <button type="button" className="ig-blue-btn" onClick={() => { setMe({ handle: f.handle || s.me.handle, name: f.name, bio: f.bio, avatar: f.avatar }); onClose(); }}>完成</button>
      </div>
    </div>
  );
}

// ── 通知 / 关注申请 ──

function Notes({ onBack, onOpen, onReq }: { onBack: () => void; onOpen: (id: string) => void; onReq: () => void }) {
  const s = useIns();
  useEffect(() => { markNotesSeen(); }, []);
  const now = Date.now();
  const list = s.notes.filter(n => n.at <= now && n.kind !== "request").sort((a, b) => b.at - a.at).slice(0, 60);
  const today = list.filter(n => now - n.at < 864e5), week = list.filter(n => now - n.at >= 864e5);
  const line = (n: (typeof list)[number]) => {
    const a = accOf(n.from);
    const name = a?.handle ?? n.from;
    const what = n.kind === "like" ? "赞了你的帖子。" : n.kind === "comment" ? `评论了：${n.text}` : n.kind === "follow" ? "开始关注你了。" : n.kind === "accept" ? "同意了你的关注申请。" : "赞了你的快拍。";
    const post = n.postId ? s.posts.find(p => p.id === n.postId) : undefined;
    return (
      <div className="ig-nt" key={n.id}>
        <button type="button" onClick={() => a && onOpen(a.id)}><Avatar acc={a} size={44} /></button>
        <div><b>{name}</b> {what}<small> {ago(n.at)}</small></div>
        {post ? <span className="ig-nt-th"><Pic img={post.imgs[0]} small /></span> : n.kind === "follow" && a && relationTo(a.id) === "none" ? <button type="button" className="ig-fb" onClick={() => follow(a.id)}>回关</button> : null}
      </div>
    );
  };
  return (
    <div className="ig-page">
      <div className="ig-bar"><button type="button" onClick={onBack}><ChevronLeft size={26} /></button><b>通知</b><span /></div>
      <div className="ig-scroll">
        {s.incoming.length ? <button type="button" className="ig-nt" onClick={onReq}><Avatar acc={accOf(s.incoming[0].id)} size={44} /><div><b>关注申请</b><small style={{ display: "block" }}>{accOf(s.incoming[0].id)?.handle}{s.incoming.length > 1 ? ` 等 ${s.incoming.length} 人` : ""}</small></div><ChevronRight size={18} /></button> : null}
        {today.length ? <div className="ig-sec">今天</div> : null}{today.map(line)}
        {week.length ? <div className="ig-sec">更早</div> : null}{week.map(line)}
        {!list.length && !s.incoming.length ? <div className="ig-empty">还没有通知</div> : null}
      </div>
    </div>
  );
}

function Requests({ onBack }: { onBack: () => void }) {
  const s = useIns();
  return (
    <div className="ig-page">
      <div className="ig-bar"><button type="button" onClick={onBack}><ChevronLeft size={26} /></button><b>关注申请</b><span /></div>
      <div className="ig-scroll">
        {s.incoming.map(r => { const a = accOf(r.id); return (
          <div className="ig-ac" key={r.id}><Avatar acc={a} size={52} /><div><b>{a?.handle}</b><small>{a ? ownerName(a) : ""}</small></div>
            <button type="button" className="ig-fb" onClick={() => answerIncoming(r.id, true)}>确认</button><button type="button" className="ig-fb ghost" onClick={() => answerIncoming(r.id, false)}>删除</button></div>
        ); })}
        {!s.incoming.length ? <div className="ig-empty">没有新的关注申请</div> : null}
      </div>
    </div>
  );
}

// ── 发帖 ──

function WhoPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const profiles = loadProfiles();
  const chars = loadCharacters().filter(c => profiles[c.id]?.layer === "main");
  const opts = [{ id: SELF_REFERENCE_ID, name: "我" }, ...chars.map(c => ({ id: c.id, name: c.name }))];
  return <div className="ig-who">{opts.map(o => <button type="button" key={o.id} className={value.includes(o.id) ? "on" : ""} onClick={() => onChange(value.includes(o.id) ? value.filter(x => x !== o.id) : [...value, o.id])}>{o.name}</button>)}</div>;
}

function Compose({ onBack, onDone, onNotice }: { onBack: () => void; onDone: () => void; onNotice: Notice }) {
  const s = useIns();
  const [imgs, setImgs] = useState<Img[]>([]);
  const [cap, setCap] = useState("");
  const [place, setPlace] = useState("");
  const [page, setPage] = useState<"main" | "pick" | "write" | "who" | "place" | "more">("main");
  const [descs, setDescs] = useState<string[]>([""]);
  const [sel, setSel] = useState<string[]>([]);
  const [who, setWho] = useState<string[]>([SELF_REFERENCE_ID]);
  const [hideLikes, setHideLikes] = useState(false);
  const [noComments, setNoComments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const photos = loadPhotos().filter(p => p.inLibrary).slice(-60).reverse();

  const share = async () => {
    if (!imgs.length) { onNotice?.("ins 的帖子至少要一张图"); return; }
    setBusy(true);
    try { await myPost({ imgs: imgs.map(i => ({ ...i, who: i.who?.length ? i.who : who })), cap: cap.trim(), place: place.trim() || undefined, hideLikes, noComments }); onNotice?.("发出去了"); onDone(); }
    catch (e) { onNotice?.(e instanceof Error ? e.message : "没发出去"); }
    setBusy(false);
  };
  const row = (icon: React.ReactNode, label: string, val: string, to: typeof page) => <button type="button" className="ig-np-row" onClick={() => setPage(to)}>{icon}<span>{label}</span><em>{val}</em><ChevronRight size={16} /></button>;
  const top = (title: string, onB: () => void, right?: React.ReactNode) => <div className="ig-bar"><button type="button" onClick={onB}><ChevronLeft size={26} /></button><b>{title}</b>{right ?? <span />}</div>;

  if (page === "pick") return (
    <div className="ig-page">{top("选照片", () => setPage("main"), <button type="button" className="ig-link" disabled={!sel.length} onClick={() => { setImgs(sel.map(id => photos.find(p => p.id === id)!).filter(Boolean).map(p => ({ desc: p.desc || "一张照片", src: p.src, who: p.genWho }))); setPage("main"); }}>下一步{sel.length ? `（${sel.length}）` : ""}</button>)}
      <div className="ig-scroll">
        <button type="button" className="ig-np-row" onClick={() => file.current?.click()}><ImageIcon size={22} /><span>从手机里上传<small>可以一次选好几张，最多 5 张</small></span><ChevronRight size={16} /></button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={async e => { const fs = [...(e.target.files ?? [])].slice(0, 5); e.target.value = ""; if (!fs.length) return; const refs = await Promise.all(fs.map(f => storeMediaBlob(f, f.type || "image/jpeg", "image"))); setImgs(refs.map(ref => ({ desc: "（上传的照片）", src: ref, who: [] }))); setPage("main"); }} />
        <div className="ig-sec">相册<small className="ig-sec-sub">点一下选中，最多 5 张</small></div>
        <div className="ig-grid">{photos.map(p => { const n = sel.indexOf(p.id); return (
          <button type="button" key={p.id} className="ig-sel" onClick={() => setSel(n >= 0 ? sel.filter(x => x !== p.id) : sel.length < 5 ? [...sel, p.id] : sel)}>
            <Pic img={{ desc: p.desc, src: p.src }} ratio="1/1" small />
            <i className={n >= 0 ? "on" : ""}>{n >= 0 ? n + 1 : ""}</i>
          </button>
        ); })}</div>
        {!photos.length ? <div className="ig-empty">相册里还没有照片</div> : null}
      </div>
    </div>
  );
  if (page === "write") return (
    <div className="ig-page">{top("写画面", () => setPage("main"), <button type="button" className="ig-link" disabled={!descs.some(d => d.trim())} onClick={() => { setImgs(descs.filter(d => d.trim()).map(d => ({ desc: d.trim(), who }))); setPage("main"); }}>完成</button>)}
      <div className="ig-scroll ig-pad">
        {descs.map((d, i) => (
          <div key={i} className="ig-wd">
            <div className="ig-wd-h">第 {i + 1} 张{descs.length > 1 ? <button type="button" onClick={() => setDescs(descs.filter((_, k) => k !== i))}><X size={14} /></button> : null}</div>
            <textarea className="ig-ta" rows={3} value={d} onChange={e => setDescs(descs.map((x, k) => (k === i ? e.target.value : x)))} placeholder={i === 0 ? "这张照片拍的是什么，比如：两只手隔着桌子各拿一杯冰美式" : "下一张拍的是什么"} />
          </div>
        ))}
        {descs.length < 5 ? <button type="button" className="ig-more-link" onClick={() => setDescs([...descs, ""])}>再写一张</button> : null}
        <div className="ig-hint">先显示成黑底的描述卡，点「生成这张图」才生图。照片里有谁会带上谁的参考图：</div>
        <WhoPicker value={who} onChange={setWho} />
      </div>
    </div>
  );
  if (page === "who") return <div className="ig-page">{top("照片里有谁", () => setPage("main"))}<div className="ig-scroll ig-pad"><div className="ig-hint">生图时带这些人的参考图；上传的真图 AI 会自己看</div><WhoPicker value={who} onChange={setWho} /></div></div>;
  if (page === "place") return <div className="ig-page">{top("添加地点", () => setPage("main"))}<div className="ig-scroll ig-pad"><input className="ig-ta" value={place} onChange={e => setPlace(e.target.value)} placeholder="比如：汉江公园" /></div></div>;
  if (page === "more") return (
    <div className="ig-page">{top("更多选项", () => setPage("main"))}
      <div className="ig-scroll">
        <div className="ig-np-row"><span>发完告诉我有没有风险<small>看这条会不会被认出来、能认出谁。关掉只是不告诉你，世界照样会算</small></span><button type="button" className={`ig-sw${s.me.riskHint ? " on" : ""}`} onClick={() => setMe({ riskHint: !s.me.riskHint })} /></div>
        <div className="ig-np-row"><span>隐藏点赞数</span><button type="button" className={`ig-sw${hideLikes ? " on" : ""}`} onClick={() => setHideLikes(!hideLikes)} /></div>
        <div className="ig-np-row"><span>关闭评论</span><button type="button" className={`ig-sw${noComments ? " on" : ""}`} onClick={() => setNoComments(!noComments)} /></div>
      </div>
    </div>
  );
  const whoText = who.map(w => (w === SELF_REFERENCE_ID ? "我" : loadCharacters().find(c => c.id === w)?.name)).filter(Boolean).join("、") || "不说是谁";
  return (
    <div className="ig-page">
      {top("新帖子", onBack)}
      <div className="ig-scroll">
        {imgs.length ? (
          <div className={`ig-np-imgs${imgs.length === 1 ? " one" : ""}`}>
            {imgs.map((m, i) => <div key={i} className="ig-np-img"><Pic img={m} ratio="3/4" small={imgs.length > 1} /><button type="button" onClick={() => setImgs(imgs.filter((_, k) => k !== i))}><X size={14} /></button></div>)}
          </div>
        ) : null}
        {!imgs.length ? (
          <button type="button" className="ig-np-empty" onClick={() => { setSel([]); setDescs([""]); setAdd(true); }}><ImageIcon size={30} strokeWidth={1.6} /><span>添加照片</span><small>最多 5 张</small></button>
        ) : null}
        <textarea className="ig-cap" rows={3} value={cap} onChange={e => setCap(e.target.value)} placeholder="添加配文…" />
        {row(<UsersRound size={22} />, "照片里有谁", whoText, "who")}
        {row(<MapPin size={22} />, "添加地点", place, "place")}
        <button type="button" className="ig-np-row" onClick={() => onNotice?.("音乐先只做个样子")}><Music size={22} /><span>添加音乐</span><em /><ChevronRight size={16} /></button>
        <div className="ig-np-sep" />
        <div className="ig-np-row"><Eye size={22} /><span>分享对象</span><em>{s.me.private ? "关注你的人" : "所有人"}</em></div>
        {row(<Ellipsis size={22} />, "更多选项", "", "more")}
        <div style={{ height: 90 }} />
      </div>
      <button type="button" className="ig-share" disabled={busy} onClick={() => void share()}>{busy ? "发送中…" : "分享"}</button>
      {add ? (
        <div className="ig-sheet-bk" onClick={() => setAdd(false)}>
          <div className="ig-sheet ig-add" onClick={e => e.stopPropagation()}>
            <div className="ig-edit-h"><b>添加照片</b></div>
            <button type="button" className="ig-np-row" onClick={() => { setAdd(false); setSel([]); setPage("pick"); }}><ImageIcon size={22} /><span>从相册选<small>相册里的照片，或者从手机里上传</small></span><ChevronRight size={16} /></button>
            <button type="button" className="ig-np-row" onClick={() => { setAdd(false); setDescs([""]); setPage("write"); }}><SquarePlus size={22} /><span>写画面<small>先显示成描述卡，想要真图再点「生成这张图」</small></span><ChevronRight size={16} /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── 快拍 ──

function StoryNew({ onBack, onNotice }: { onBack: () => void; onNotice: Notice }) {
  const [text, setText] = useState("");
  const [bg, setBg] = useState(BGS[0]);
  const [desc, setDesc] = useState("");
  return (
    <div className="ig-page ig-story-new" style={{ background: bg }}>
      <div className="ig-bar dark"><button type="button" onClick={onBack}><X size={24} /></button><b>快拍</b><button type="button" className="ig-link w" onClick={() => { if (!text.trim() && !desc.trim()) return; myStory({ text: text.trim() || undefined, img: desc.trim() ? { desc: desc.trim(), who: [SELF_REFERENCE_ID] } : undefined, bg }); onNotice?.("快拍发出去了，24 小时后消失"); onBack(); }}>发布</button></div>
      <textarea className="ig-st-text" value={text} onChange={e => setText(e.target.value)} placeholder="写点什么" />
      <input className="ig-st-desc" value={desc} onChange={e => setDesc(e.target.value)} placeholder="配一张图？写画面（可以不写）" />
      <div className="ig-bgs">{BGS.map(b => <button type="button" key={b} className={b === bg ? "on" : ""} style={{ background: b }} onClick={() => setBg(b)} />)}</div>
    </div>
  );
}

function StoryViewer({ list, start, onClose, onNotice }: { list: Story[]; start: number; onClose: () => void; onNotice: Notice }) {
  const [i, setI] = useState(start);
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const st = list[i];
  const a = accOf(st.by);
  const mine = st.by === ME;
  const next = () => (i < list.length - 1 ? setI(i + 1) : onClose());
  const viewers = st.viewers.filter(v => v.at <= Date.now()).sort((x, y) => y.at - x.at);
  return (
    <div className="ig-sv" style={{ background: st.bg }} onClick={next}>
      <div className="ig-sv-prog">{list.map((_, k) => <i key={k} className={k <= i ? "on" : ""} />)}</div>
      <div className="ig-sv-h"><Avatar acc={a} size={32} /><b>{mine ? "你的快拍" : a?.handle}</b><span>{ago(st.at)}</span><button type="button" onClick={e => { e.stopPropagation(); setMenu(true); }}><Ellipsis size={22} /></button><button type="button" onClick={e => { e.stopPropagation(); onClose(); }}><X size={22} /></button></div>
      {st.img ? <div className="ig-sv-img" onClick={e => e.stopPropagation()}><Pic img={st.img} ratio="3/4" onOpen={() => setOpen(true)} /></div> : null}
      {st.text ? <div className="ig-sv-text">{st.text}</div> : null}
      {mine ? <button type="button" className="ig-sv-seen" onClick={e => { e.stopPropagation(); setSeen(true); }}><Eye size={16} />{viewers.length} 位看过</button> : null}
      {seen ? (
        <div className="ig-seen" onClick={e => e.stopPropagation()}>
          <div className="hd"><span />{viewers.length} 位看过<button type="button" onClick={() => setSeen(false)}><X size={18} /></button></div>
          {viewers.map(v => { const va = accOf(v.id); const late = new Date(v.at).getHours() < 5; return <div className="ig-vw" key={v.id}><Avatar acc={va} size={40} /><div><b>{va?.handle}</b><small>{va ? ownerName(va) : ""}</small></div><em className={late ? "late" : ""}>{String(new Date(v.at).getHours()).padStart(2, "0")}:{String(new Date(v.at).getMinutes()).padStart(2, "0")}</em></div>; })}
          {!viewers.length ? <div className="ig-empty">还没有人看过</div> : null}
        </div>
      ) : null}
      {open && st.img ? <ImgViewer img={st.img} ratio="3/4" onClose={() => setOpen(false)}
        onGen={() => void generateImg(st.id, 0, "story").catch(err => onNotice?.(err instanceof Error ? err.message : "生图失败"))}
        onSave={d => editImgDesc(st.id, 0, d, "story")} /> : null}
      {menu ? (
        <div className="ig-sheet-bk" onClick={e => { e.stopPropagation(); setMenu(false); }}>
          <div className="ig-sheet" onClick={e => e.stopPropagation()}>
            <button type="button" className="red" onClick={() => { purgeStory(st.id); setMenu(false); onNotice?.("彻底删掉了，当它没发生过"); onClose(); }}>彻底删除<small>当它没发生过，记忆里也不留</small></button>
            <button type="button" onClick={() => setMenu(false)}>取消</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── 私信 ──

function DmList({ req, onChat, onReq, tabbar, onBack }: { req?: boolean; onChat: (id: string) => void; onReq?: () => void; tabbar?: React.ReactNode; onBack: () => void }) {
  const s = useIns();
  const all = Object.entries(s.dms).filter(([, d]) => d.msgs.length && (req ? d.status === "request" : d.status === "open")).sort((a, b) => (b[1].msgs.at(-1)?.at ?? 0) - (a[1].msgs.at(-1)?.at ?? 0));
  const reqN = Object.values(s.dms).filter(d => d.status === "request" && d.msgs.length).length;
  return (
    <div className="ig-page">
      <div className="ig-bar">{req ? <button type="button" onClick={onBack}><ChevronLeft size={26} /></button> : <span />}<b>{req ? "消息请求" : s.me.handle}</b><span /></div>
      <div className="ig-scroll">
        {!req ? <div className="ig-dmtabs"><span className="on">消息</span>{reqN ? <button type="button" onClick={onReq}>请求（{reqN}）</button> : null}</div> : null}
        {all.map(([id, d]) => { const a = accOf(id); const last = d.msgs[d.msgs.length - 1]; const un = !last.me && last.at > (d.lastMine ?? 0); return (
          <button type="button" className={`ig-th${un ? " un" : ""}`} key={id} onClick={() => onChat(id)}><Avatar acc={a} size={54} /><div><b>{a?.handle}</b><small>{last.me ? "你：" : ""}{last.postId ? "分享了一条帖子" : last.img && !last.text ? "发了一张照片" : last.text} · {ago(last.at)}</small></div></button>
        ); })}
        {!all.length ? <div className="ig-empty">{req ? "没有消息请求" : "还没有私信。去别人主页点「发消息」"}</div> : null}
        {!req ? <div className="ig-note">只有还没加 KakaoTalk 的人会在这里找你</div> : null}
      </div>
      {tabbar}
    </div>
  );
}

function Chat({ id, onBack, onNotice }: { id: string; onBack: () => void; onNotice: Notice }) {
  useIns();
  const a = accOf(id);
  const d = dmOf(id);
  const [text, setText] = useState("");
  const [panel, setPanel] = useState(false);
  const [sett, setSett] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [pick, setPick] = useState(false);
  const [pdesc, setPdesc] = useState("");
  const pfile = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const press = useRef<number | null>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [d.msgs.length]);
  const reply = (opts: { first?: boolean; redo?: string } = {}) => void replyDm(id, opts).catch(e => onNotice?.(e instanceof Error ? e.message : "他没回"));
  const send = () => { const t = text.trim(); if (!t) return; sendDm(id, t); setText(""); };
  const hold = (mid: string) => ({
    onPointerDown: () => { press.current = window.setTimeout(() => setMenu(mid), 450); },
    onPointerUp: () => { if (press.current) window.clearTimeout(press.current); },
    onPointerLeave: () => { if (press.current) window.clearTimeout(press.current); },
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setMenu(mid); },
  });
  const m = menu ? d.msgs.find(x => x.id === menu) : undefined;
  return (
    <div className="ig-page">
      <div className="ig-chtop"><button type="button" onClick={onBack}><ChevronLeft size={26} /></button><Avatar acc={a} size={32} /><div><b>{a?.handle}</b><small>{a ? (a.alt ? "" : ownerName(a)) : ""}</small></div></div>
      {d.status === "request" ? <div className="ig-reqbar">{a?.handle} 想给你发消息。接受后他才知道你看过。<div><button type="button" onClick={() => setDmFlags(id, { status: "open" })}>接受</button><button type="button" onClick={() => { setDmFlags(id, { status: "open" }); onBack(); }}>删除</button></div></div> : null}
      <div className="ig-scroll ig-msgs" onClick={() => setPanel(false)}>
        {d.msgs.map((x, i) => {
          const showT = i === 0 || x.at - d.msgs[i - 1].at > 30 * 60e3;
          return (
            <div key={x.id} className="ig-mrow">
              {showT ? <div className="ig-tm">{new Date(x.at).getMonth() + 1}月{new Date(x.at).getDate()}日 {String(new Date(x.at).getHours()).padStart(2, "0")}:{String(new Date(x.at).getMinutes()).padStart(2, "0")}</div> : null}
              {x.img ? <div className={`ig-mimg ${x.me ? "r" : "l"}`} {...hold(x.id)}><Pic img={x.img} ratio="3/4" small /></div> : null}
              {x.text ? <div className={`ig-m ${x.me ? "r" : "l"}`} {...hold(x.id)}>{x.text}{x.zh ? <small>{x.zh}</small> : null}</div> : null}
            </div>
          );
        })}
        {dmReplying(id) ? <div className="ig-m l typing">···</div> : null}
        <div ref={end} />
      </div>
      <div className="ig-inp"><button type="button" className="ig-plus" onClick={() => setPanel(!panel)}><Plus size={16} strokeWidth={2.8} /></button><input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} placeholder="发消息…" /><button type="button" className="ig-link" onClick={send} disabled={!text.trim()}>发送</button></div>
      {panel ? (
        <div className="ig-panel">
          <button type="button" onClick={() => { setPanel(false); reply(); }}><i><MessageCircle size={22} /></i>让他回</button>
          <button type="button" onClick={() => { setPanel(false); reply({ first: true }); }}><i><Plus size={22} /></i>他先说一句</button>
          <button type="button" onClick={() => { setPanel(false); setPick(true); }}><i><ImageIcon size={22} /></i>照片</button>
          <button type="button" onClick={() => { setPanel(false); setSett(true); }}><i><Settings size={22} /></i>聊天设置</button>
        </div>
      ) : null}
      {m ? (
        <div className="ig-sheet-bk" onClick={() => setMenu(null)}>
          <div className="ig-lpm" onClick={e => e.stopPropagation()}>
            {!m.me ? <button type="button" onClick={() => { setMenu(null); reply({ redo: m.id }); }}>换一条</button> : null}
            <button type="button" onClick={() => { setMenu(null); setEdit({ id: m.id, text: m.text }); }}>编辑</button>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(m.text); setMenu(null); onNotice?.("复制了"); }}>复制</button>
            <button type="button" className="red" onClick={() => { deleteDm(id, m.id); setMenu(null); }}>删除</button>
          </div>
        </div>
      ) : null}
      {edit ? (
        <div className="ig-sheet-bk" onClick={() => setEdit(null)}>
          <div className="ig-sheet ig-edit" onClick={e => e.stopPropagation()}>
            <textarea rows={3} value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} />
            <button type="button" className="ig-blue-btn" onClick={() => { editDm(id, edit.id, edit.text); setEdit(null); }}>改好了</button>
          </div>
        </div>
      ) : null}
      {pick ? (
        <div className="ig-sheet-bk" onClick={() => setPick(false)}>
          <div className="ig-sheet ig-edit" onClick={e => e.stopPropagation()}>
            <div className="ig-edit-h"><b>发照片</b></div>
            <textarea rows={2} value={pdesc} onChange={e => setPdesc(e.target.value)} placeholder="写画面：比如「便利店的三角饭团」" />
            <button type="button" className="ig-blue-btn" disabled={!pdesc.trim()} onClick={() => { sendDmImg(id, { desc: pdesc.trim(), who: [] }); setPdesc(""); setPick(false); }}>发这张描述卡</button>
            <button type="button" className="ig-blue-btn ghost" onClick={() => pfile.current?.click()}>从手机里上传</button>
            <input ref={pfile} type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const ref = await storeMediaBlob(f, f.type || "image/jpeg", "image"); sendDmImg(id, { desc: pdesc.trim() || "（她发来一张照片）", src: ref }); setPdesc(""); setPick(false); }} />
            <div className="ig-hint">相册里的照片：</div>
            <div className="ig-grid">{loadPhotos().filter(p => p.inLibrary).slice(-12).reverse().map(p => <button type="button" key={p.id} onClick={() => { sendDmImg(id, { desc: p.desc || "一张照片", src: p.src }); setPick(false); }}><Pic img={{ desc: p.desc, src: p.src }} ratio="1/1" small /></button>)}</div>
          </div>
        </div>
      ) : null}
      {sett ? (
        <div className="ig-sheet-bk" onClick={() => setSett(false)}>
          <div className="ig-sheet ig-set" onClick={e => e.stopPropagation()}>
            <div className="hd">聊天设置</div>
            <div className="ig-np-row"><span>自动回复<small>开着的话你发完消息，他过一会儿自己回；关着就等你点「让他回」</small></span><button type="button" className={`ig-sw${d.auto ? " on" : ""}`} onClick={() => setDmFlags(id, { auto: !d.auto })} /></div>
            <div className="ig-np-row"><span>他会主动来找你<small>世界里有事时他自己发私信过来</small></span><button type="button" className={`ig-sw${d.proactive ? " on" : ""}`} onClick={() => setDmFlags(id, { proactive: !d.proactive })} /></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
