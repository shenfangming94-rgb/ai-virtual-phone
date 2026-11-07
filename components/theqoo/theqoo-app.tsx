'use client';

import { useEffect, useRef, useState } from 'react';
import { hydrateKvDb } from '@/lib/kv-db';
import { ALMANAC_EVENT } from '@/lib/idol-calendar';
import { forumCalendarCandidates, maybeFillWorldGossip } from '@/lib/theqoo-events';

import { emptyForum, FORUM_BOARDS, type Bilingual, type ForumBoard, type ForumState } from '@/lib/theqoo-model';
import { deleteForumComment, deleteForumPost, loadForum, markForumRead, setForumTranslation, THEQOO_EVENT, toggleForumLike } from '@/lib/theqoo-store';

const names: Record<'hot' | ForumBoard, string> = { hot: 'HOT', idol: '케이돌토크', entertainment: '스퀘어', daily: '일상토크' };
const fmt = (n: number) => n.toLocaleString('en-US');
const stamp = (t: number) => { const d = new Date(t); return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const text = (b: Bilingual) => <>{b.ko}<span className="translation" lang="zh-CN">{b.zh}</span></>;
export function TheQooApp({ onClose, preview = false }: { onClose: () => void; preview?: boolean }) {
  // 只有正式论坛（离线试玩已按她的要求拆掉）
  const mode = 'world' as const;
  const [state, setState] = useState<ForumState>(emptyForum);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [board, setBoard] = useState<'hot' | ForumBoard>('hot'), [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [page, setPage] = useState(1), [selected, setSelected] = useState<string | null>(null), [limit, setLimit] = useState(5), [sort, setSort] = useState<'hot' | 'new'>('hot');
  const [notice, setNotice] = useState<string | null>(null), [candidates, setCandidates] = useState<ReturnType<typeof forumCalendarCandidates>>([]);
  const scroll = useRef<HTMLDivElement>(null);
  const top = () => scroll.current?.scrollTo({ top: 0 });
  useEffect(() => {
    let live = true;
    setReady(false); setError('');
    const update = () => { if (live) { try { setState(loadForum(mode)); setCandidates(forumCalendarCandidates()); } catch (e) { setError(String(e)); } } };
    void maybeFillWorldGossip().catch(() => undefined); // 打开论坛顺便补几条别人家的帖子
    void hydrateKvDb().then(async () => { if (!live) return; update(); setReady(true); }).catch(e => { if (live) setError(String(e)); });
    window.addEventListener(THEQOO_EVENT, update); window.addEventListener(ALMANAC_EVENT, update);
    return () => { live = false; window.removeEventListener(THEQOO_EVENT, update); window.removeEventListener(ALMANAC_EVENT, update); };
  }, [mode]);
  useEffect(() => {
    if (!ready) return;
    const openPending = () => { const id = sessionStorage.getItem('theqoo-open-post'); if (id) { sessionStorage.removeItem('theqoo-open-post'); if (loadForum('world').posts.some(p => p.id === id)) { setSelected(id); setLimit(5); top(); void markForumRead('world', id).catch(e => setError(String(e))); } } };
    openPending(); window.addEventListener('theqoo-open-post', openPending); return () => window.removeEventListener('theqoo-open-post', openPending);
  }, [ready, mode]);
  const action = async (run: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(''); try { await run(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const open = (id: string) => { setSelected(id); setLimit(5); setSort('hot'); top(); void action(() => markForumRead(mode, id)); };
  const home = () => { setSelected(null); top(); };
  const post = state.posts.find(p => p.id === selected);
  const filtered = state.posts.filter(p => (board === 'hot' ? p.source.hot : p.source.board === board) && `${p.title.ko} ${p.title.zh}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.createdAt - a.createdAt);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const comments = post ? [...post.comments].sort((a, b) => sort === 'hot' ? b.likes - a.likes || b.at - a.at : b.at - a.at || post.comments.indexOf(b) - post.comments.indexOf(a)) : [];
  return <div className={`tq-app ${state.translate ? '' : 'no-trans'}`} ref={scroll}>
    <div className="tq-phone">
      <div className="app-back"><button onClick={onClose}>‹ {preview ? '退出试玩' : '小手机'}</button><span>SEOUL:AM</span></div>
      <header><button className="logo" onClick={home} aria-label="论坛首页">theqoo<small>더쿠</small></button><div className="utility">익명 커뮤니티<br/>匿名论坛</div></header>
      <nav className="nav" aria-label="板块">{(Object.keys(names) as (keyof typeof names)[]).map(b => <button key={b} className={board === b ? 'active' : ''} aria-label={b === 'hot' ? 'HOT 热帖' : FORUM_BOARDS[b]} onClick={() => { setBoard(b); setPage(1); setSearch(''); setQuery(''); home(); }}>{names[b]}</button>)}</nav>
      <div className="subnav"><span>{board === 'hot' ? '전체 / 热帖汇总' : FORUM_BOARDS[board]}</span><span className="subnav-right"><button disabled={busy} onClick={() => void action(async () => { const n = await maybeFillWorldGossip(true); if (n) setNotice(`补了 ${n} 条新帖子`); else setError('这次没写成，再点一次试试'); })}>{busy ? '补帖中…' : '刷新'}</button><button onClick={() => void action(() => setForumTranslation(mode, !state.translate))} disabled={busy}>{state.translate ? '隐藏中文翻译' : '显示中文翻译'}</button></span></div>
      {notice && <button className="tq-notice" onClick={() => setNotice(null)}>{notice}　›</button>}
      {error && <div className="tq-error" role="alert">{error}<button onClick={() => { setError(''); setState(loadForum(mode)); }}>重新读取</button></div>}
      {!ready ? <div className="empty">{error ? '暂时无法读取论坛' : '读取已保存的帖子…'}</div> : !post ? <>
        <div className="boardhead"><h1>{board === 'hot' ? 'HOT' : names[board]}<small>{board === 'hot' ? '热帖' : FORUM_BOARDS[board]}</small></h1><span>{stamp(Date.now()).slice(0, 5)}</span></div>
        <div className="notice"><b>공지</b>请勿传播未经证实的私人信息与恶意传闻。</div>
        <div className="list-label"><span>제목 / 标题</span><span>조회 · 댓글 / 阅读 · 评论</span></div>
        {filtered.slice((Math.min(page, pages) - 1) * 12, Math.min(page, pages) * 12).map(p => <button className="post" key={p.id} onClick={() => open(p.id)}><div className="post-title"><span className="category">{FORUM_BOARDS[p.source.board]}</span>{p.title.ko}<span className="count">[{p.comments.length}]</span>{(p.seenRevision < p.source.revision || p.seenCommentCount < p.comments.length) && <span className="new">N</span>}</div><div className="translation">{p.title.zh}</div><div className="meta"><span>무명의 더쿠</span><span>{stamp(p.createdAt)}</span><span className="right">阅读 {fmt(p.views)}</span><span>推荐 {fmt(p.recommendations + Number(p.liked))}</span></div></button>)}
        {!filtered.length && <div className="empty">{search ? '没有找到相关帖子。' : '还没有公开讨论。'}<p>关键事件公开后，帖子会出现在这里。</p></div>}
        <div className="pager">{Array.from({ length: pages }, (_, i) => <button key={i} className={page === i + 1 ? 'selected' : ''} onClick={() => { setPage(i + 1); top(); }}>{i + 1}</button>)}</div>
        <form className="search" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); setPage(1); }}><input aria-label="搜索帖子" placeholder="검색어 입력 / 搜索标题" value={query} onChange={e => setQuery(e.target.value)} /><button className="plain">검색</button></form>
        {<details className="calendar-sources"><summary>圈内大事 · {candidates.length} 条日历记录</summary><p>仅供核对资料；排期不等于已公开或已发生，暂不自动生成帖子。</p>{candidates.map(c => <div key={c.id}><time>{c.date}</time> {c.title}</div>)}</details>}
      </> : <>
        <div className="backrow"><button onClick={home}>‹ 목록으로 / 返回列表</button></div>
        <div className="article-head"><div className="cat">{FORUM_BOARDS[post.source.board]}　·　잡담</div><h1>{text(post.title)}</h1><div className="author">무명의 더쿠 <span>匿名网友</span></div><div className="article-meta"><span>{stamp(post.createdAt)}</span><span>조회 {fmt(post.views)}</span><span>댓글 {post.comments.length}</span></div></div>
        <article className="article">{post.body.map((b, i) => <div key={i}><p>{text(b)}</p>{i === 0 && post.source.images?.map(image => <figure className="photo" key={image.src}><img src={image.src} alt={image.caption} loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }}/><figcaption>{image.caption}</figcaption></figure>)}</div>)}
          {post.updates.map(u => <section className="post-update" key={u.revision}><h2>추가 / 后续公开进展 <time>{stamp(u.at)}</time></h2>{u.body.map((b, i) => <p key={i}>{text(b)}</p>)}</section>)}
          <div className="source">{`公开事件：${post.source.title}`}</div>
        </article>
        <div className="vote"><button disabled={busy} aria-pressed={post.liked} onClick={() => void action(() => toggleForumLike(mode, post.id))}>추천 / 推荐　{post.recommendations + Number(post.liked)}</button></div>
        <div className="comment-head"><span>댓글 <b>{post.comments.length}</b> 评论</span><span className="tiny">匿名路人讨论</span></div>
        <div className="sortbar"><button className={sort === 'hot' ? 'active' : ''} onClick={() => setSort('hot')}>인기순 / 热门</button><button className={sort === 'new' ? 'active' : ''} onClick={() => setSort('new')}>최신순 / 最新</button></div>
        {comments.slice(0, limit).map((c, i) => <div className="comment" key={c.id}><div className="comment-top"><strong>{post.comments.indexOf(c) + 1}. 무명의 더쿠</strong>{sort === 'hot' && i < 2 && <span className="best">BEST</span>}<time>{stamp(c.at)}</time><button className="tq-comment-del" aria-label="删除这条评论" disabled={busy} onClick={() => void action(async () => { await deleteForumComment(mode, post.id, c.id); })}>×</button></div><p>{text(c)}</p><div className="comment-bottom">추천 {c.likes}</div></div>)}
        <button className="loadmore" disabled={limit >= comments.length} onClick={() => setLimit(n => n + 5)}>{limit >= comments.length ? '已显示全部评论' : '댓글 더보기 / 加载更多评论'}</button>
        <div className="bottom-back"><button className="plain" onClick={home}>목록 / 返回列表</button><button className="tq-delete" disabled={busy} onClick={() => void action(async () => { await deleteForumPost(mode, post.id); setNotice("帖子删掉了，相关记录一并清除"); setSelected(null); })}>删掉这条帖子</button></div>
      </>}
      <footer className="footer"><b>더쿠</b>　이용안내 · 匿名论坛<br/>SEOUL:AM · 阅读与推荐，不开放发帖和评论</footer>
    </div>
  </div>;
}
