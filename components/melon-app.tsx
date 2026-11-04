'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Heart, Home, Search, BarChart3, User, MessageCircle, Play, Pause, SkipBack, SkipForward, Upload, Sparkles } from 'lucide-react';
import { albumCards, albumTracks, catalogue, loadMelon, MELON_EVENT, coverOf, hash, ranked, changeMelon, toggleMelonLike, myMelonIdentity, ensureDetail, moreComments, postComment, generateCover, type Release } from '@/lib/idol-melon';
import { GROUPS_EVENT } from '@/lib/idol-groups';
import { TRAINEE_CARD_EVENT } from '@/lib/trainee-card';
import { fileToUserAvatarDataUrl } from '@/lib/user-avatar-image';
import { subscribeWorldClock } from '@/lib/world-clock';
type View = {
    page: 'home' | 'search' | 'chart' | 'me';
} | {
    page: 'artist';
    name: string;
} | {
    page: 'album' | 'song' | 'player' | 'comments';
    id: string;
};
const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
export function MelonApp({ onClose }: {
    onClose: () => void;
}) {
    const [tick, setTick] = useState(0);
    const [stack, setStack] = useState<View[]>([{ page: 'home' }]);
    const view = stack[stack.length - 1];
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [seconds, setSeconds] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [lyrics, setLyrics] = useState(false);
    const manual = useRef(0);
    const gesture = useRef({ x: 0, y: 0, moved: false });
    const lyricsRef = useRef<HTMLDivElement>(null);
    const abort = useRef<AbortController | null>(null);
    const lock = useRef(false);
    const [draft, setDraft] = useState('');
    const [uploadTarget, setUploadTarget] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const compose = useRef<HTMLTextAreaElement>(null);
    const state = loadMelon();
    const { artists, releases } = catalogue();
    const current = 'id' in view ? releases.find(r => r.id === view.id) : undefined;
    const detail = current ? state.details[current.id] : undefined;
    const duration = detail?.duration || 180;
    const go = (v: View) => { setError(''); setStack(s => [...s, v]); };
    const back = () => { setError(''); if (stack.length > 1)
        setStack(s => s.slice(0, -1));
    else
        onClose(); };
    useEffect(() => { const bump = () => setTick(n => n + 1); for (const e of [MELON_EVENT, GROUPS_EVENT, TRAINEE_CARD_EVENT, 'idol-debut-changed', 'user-identities-updated', 'idol-almanac-changed'])
        window.addEventListener(e, bump); const unsub = subscribeWorldClock(bump); return () => { for (const e of [MELON_EVENT, GROUPS_EVENT, TRAINEE_CARD_EVENT, 'idol-debut-changed', 'user-identities-updated', 'idol-almanac-changed'])
        window.removeEventListener(e, bump); unsub(); abort.current?.abort(); }; }, []);
    useEffect(() => { if (!playing || view.page !== 'player')
        return; const timer = setInterval(() => setSeconds(n => { if (n >= duration) {
        setPlaying(false);
        return duration;
    } return n + 1; }), 1000); return () => clearInterval(timer); }, [playing, view.page, duration]);
    const active = Math.min((detail?.lyrics.length || 1) - 1, Math.floor(seconds / duration * (detail?.lyrics.length || 1)));
    useEffect(() => { const panel = lyricsRef.current; if (!lyrics || !panel || performance.now() < manual.current)
        return; const line = panel.querySelector<HTMLElement>(`[data-line="${active}"]`); if (line)
        panel.scrollTop += line.getBoundingClientRect().top - panel.getBoundingClientRect().top - panel.clientHeight * .23; }, [active, lyrics]);
    useEffect(() => { if (view.page === 'comments')
        setDraft(loadMelon().drafts[view.id] || ''); }, [view.page, 'id' in view ? view.id : '']);
    useEffect(() => { const el = compose.current; if (el) {
        el.style.height = '38px';
        el.style.height = Math.min(98, Math.max(38, el.scrollHeight + 2)) + 'px';
    } }, [draft, view.page]);
    async function run(label: string, work: (signal: AbortSignal) => Promise<unknown>) { if (lock.current)
        return; lock.current = true; setBusy(label); setError(''); abort.current = new AbortController(); try {
        await work(abort.current.signal);
    }
    catch (e) {
        if (!abort.current.signal.aborted)
            setError(e instanceof Error ? e.message : '操作失败，请重试');
    }
    finally {
        lock.current = false;
        setBusy('');
    } }
    function openPlayer(r: Release) { setSeconds(0); setPlaying(false); setLyrics(false); go({ page: 'player', id: r.id }); if (!state.details[r.id])
        void run('正在准备歌曲', signal => ensureDetail(r, signal)); }
    function step(direction: number) { if (!current || !releases.length)
        return; const queue = albumTracks(current, releases); const next = queue[(queue.indexOf(current) + direction + queue.length) % queue.length]; setSeconds(0); setLyrics(false); setStack(s => [...s.slice(0, -1), { page: 'player', id: next.id }]); if (!state.details[next.id])
        void run('正在准备歌曲', signal => ensureDetail(next, signal)); }
    function pick(target: string) { setUploadTarget(target); fileRef.current?.click(); }
    const art = (r: Release, cls = '') => <img className={`ml-art ${cls}`} src={coverOf(r, state)} alt={`${r.title} 封面`}/>;
    const row = (r: Release, i?: number) => <button key={r.id} className="ml-row" onClick={() => go({ page: 'song', id: r.id })}>{i !== undefined && <span className="ml-rank">{i + 1}</span>}{art(r)}<span><b>{r.title}</b><small>{r.artist} · {r.year}</small></span><Play size={16}/></button>;
    const cards = (items: Release[]) => <div className="ml-cards">{albumCards(items).map(r => <button key={r.id} onClick={() => go({ page: 'album', id: r.id })}>{art(r)}<b>{r.album || r.title}</b><small>{r.artist}</small></button>)}</div>;
    const empty = (text: string) => <p className="ml-empty">{text}</p>;
    const avatar = (name: string, src?: string) => <span className="ml-avatar" style={{ background: ['#f7dce5', '#e7def7', '#dcecf9', '#faf0cb', '#dcefe5'][hash(name) % 5] }}>{src ? <img src={src} alt={`${name} 头像`}/> : null}</span>;
    const me = myMelonIdentity();
    const titles = { home: 'Melon', search: '搜索', chart: 'TOP100', me: '我的音乐', artist: '歌手主页', album: '作品专辑', song: '歌曲详情', player: '正在播放', comments: '歌曲评论' };
    return <div className="ml-app" data-tick={tick}>
  <header className="ml-bar"><button aria-label="返回" onClick={back}><ArrowLeft size={21}/></button><strong>{titles[view.page]}</strong><small>MELON</small></header>
  <input ref={fileRef} hidden type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file || !uploadTarget)
        return; const target = uploadTarget; const saveId = localStorage.getItem('idol_current_save_id'); void run('正在保存图片', async () => { if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024)
        throw new Error('请选择 20MB 以内的图片'); const src = await fileToUserAvatarDataUrl(file, target === 'avatar' ? 640 : 1200); if (abort.current?.signal.aborted || localStorage.getItem('idol_current_save_id') !== saveId)
        return; changeMelon(s => { if (target === 'avatar')
        s.avatar = src;
    else
        s.covers[target] = src; }); }); }}/>
  {(busy || error) && <div className={`ml-status ${error ? 'error' : ''}`} role="status">{busy || error}{error && <button aria-label="关闭提示" onClick={() => setError('')}>×</button>}</div>}
  <main className={`ml-body ${view.page === 'player' ? 'is-player' : ''} ${view.page === 'comments' ? 'is-comments' : ''}`}>
  {view.page === 'home' && <><div className="ml-lead"><small>YOUR DAILY MUSIC</small><h1>今天，听点什么？</h1><p>在音乐里，遇见这个世界。</p></div><button className="ml-search" onClick={() => go({ page: 'search' })}><Search size={18}/> 搜索歌手、歌曲、专辑</button>{releases[0] ? <section className="ml-hero"><div><small>DISCOVER MUSIC</small><h2>{releases[0].title}</h2><p>{releases[0].artist}</p><button onClick={() => go({ page: 'song', id: releases[0].id })}>查看歌曲 ↗</button></div><button aria-label="打开推荐播放器" onClick={() => openPlayer(releases[0])}>{art(releases[0])}</button></section> : empty('世界里还没有确认发行的作品。已知艺人可以在搜索中查看；作品进入名册后会出现在这里。')}<h2>新歌与专辑</h2>{cards([...releases].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 10))}<h2>世界热度榜 <button className="ml-link" onClick={() => go({ page: 'chart' })}>全部 →</button></h2>{ranked(releases).slice(0, 5).map((r, i) => row(r, i))}</>}
  {view.page === 'search' && <><label className="ml-search"><Search size={18}/><input aria-label="搜索歌手、歌曲、专辑" value={query} onChange={e => setQuery(e.target.value)} placeholder="歌手、歌曲、专辑"/></label><h2>艺人</h2>{artists.filter(g => g.name.toLowerCase().includes(query.trim().toLowerCase())).map(g => <button className="ml-row" key={g.name} onClick={() => go({ page: 'artist', name: g.name })}>{avatar(g.name)}<span><b>{g.name}</b><small>{g.kind || '艺人'} · {g.debut ? `${g.debut} 出道` : '资料待补充'}</small></span></button>)}<h2>歌曲与专辑</h2>{releases.filter(r => (r.title + r.artist + (r.album || '')).toLowerCase().includes(query.trim().toLowerCase())).map(r => row(r))}{empty('只搜索世界里已知的资料；搜索不会创建新的艺人或作品。')}</>}
  {view.page === 'artist' && (() => { const g = artists.find(a => a.name === view.name); return <><div className="ml-lead">{avatar(view.name)}<h1>{view.name}</h1><p>{g?.kind} {g?.debut && `· ${g.debut} 出道`}</p></div><p className="ml-copy">{g?.style || '艺人资料尚未补全。'}</p><div className="ml-chips">{g?.members?.map(m => <span key={m}>{m}</span>)}</div><h2>历年作品</h2>{cards(releases.filter(r => r.artist === view.name).sort((a, b) => (b.year || 0) - (a.year || 0)))}{!releases.some(r => r.artist === view.name) && empty('暂无确认发行的作品。')}</>; })()}
  {view.page === 'chart' && <><div className="ml-lead"><small>MELON WORLD CHART</small><h1>TOP100</h1><p>{new Date(Date.now()).toLocaleDateString('zh-CN')} · 世界热度榜</p></div><p className="ml-note">按世界里的艺人热度与作品发行年份模拟排序，每个世界日更新。不是现实音源数据；仅展示已知作品，不补虚构名次。</p>{ranked(releases).map((r, i) => row(r, i))}{!releases.length && empty('还没有可上榜的已发行作品。')}</>}
  {view.page === 'me' && <><div className="ml-profile"><button aria-label="更换我的头像" onClick={() => pick('avatar')}>{avatar(me.name, me.avatar)}</button><div><h2>{me.name}</h2><small>我的音乐</small></div></div><div className="ml-actions"><button onClick={() => pick('avatar')}>更换头像</button><button onClick={() => changeMelon(s => { delete s.avatar; })}>沿用名片头像</button></div><h2>我的收藏</h2>{releases.filter(r => state.likes.includes(r.id)).map(r => row(r))}{!releases.some(r => state.likes.includes(r.id)) && empty('点亮歌曲旁的爱心，把喜欢的歌留在这里。')}</>}
  {current && (view.page === 'album' || view.page === 'song') && <><button className="ml-cover-open" onClick={() => openPlayer(current)} aria-label="打开播放器">{art(current)}</button><div className="ml-album-title"><h1>{view.page === 'album' ? (current.album || current.title) : current.title}</h1><button className="ml-link" onClick={() => go({ page: 'artist', name: current.artist })}>{current.artist}</button><p>{current.at ? new Date(current.at).toLocaleDateString('zh-CN') : `${current.year} 年 · 具体发行日期待补充`} · {current.real ? '现实作品' : '世界作品'}</p></div><div className="ml-actions"><button onClick={() => pick(current.albumId || current.id)} disabled={!!busy}><Upload size={14}/>上传封面</button><button disabled={!!busy} onClick={() => void run('正在生成封面', signal => generateCover(current, signal))}><Sparkles size={14}/>生成封面</button><button onClick={() => toggleMelonLike(current.id)}><Heart size={14} fill={state.likes.includes(current.id) ? 'currentColor' : 'none'}/>收藏</button></div><div className="ml-note">{detail?.concept || current.note || '作品介绍和完整歌词尚未生成。'}{detail && <p>{detail.genre} · {fmt(detail.duration)}</p>}</div>{!detail && <button className="ml-primary" disabled={!!busy} onClick={() => void run('正在准备歌曲', signal => ensureDetail(current, signal))}>生成作品介绍与歌词</button>}<h2>曲目</h2>{albumTracks(current, releases).map(r => row(r))}{!current.album && <p className="ml-note">单曲 · 暂无已确认的专辑归属。</p>}{view.page === 'song' && detail && <><h2>韩中歌词 · 成员 Part</h2>{current.real ? empty('现实作品不生成或冒充真实歌词。') : detail.lyrics.map((l, i) => <div className="ml-detail-line" key={i}><small>{l.section} · {l.member}</small><b>{l.ko}</b><p>{l.zh}</p></div>)}{!!detail.lyrics.length && <><h2>成员分配</h2>{Array.from(new Set(detail.lyrics.map(l => l.member))).map(m => <div className="ml-part" key={m}><b>{m}</b><progress max={detail.lyrics.length} value={detail.lyrics.filter(l => l.member === m).length}/><small>{Math.round(detail.lyrics.filter(l => l.member === m).length / detail.lyrics.length * 100)}%</small></div>)}<p className="ml-note">按歌词行数估算，非真实演唱时长。</p></>}</>}</>}
  {current && view.page === 'player' && <section className="ml-player"><div className="ml-now">NOW PLAYING · MELON</div><div className="ml-visual">{!lyrics ? <button className="ml-record" onClick={() => setLyrics(true)} aria-label="切换到歌词">{art(current)}</button> : <div className="ml-lyrics" ref={lyricsRef} onPointerDown={e => { gesture.current = { x: e.clientX, y: e.clientY, moved: false }; manual.current = performance.now() + 8000; }} onPointerMove={e => { if (Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 8)
        gesture.current.moved = true; }} onPointerCancel={() => { gesture.current.moved = true; }} onWheel={() => { manual.current = performance.now() + 8000; }} onClick={e => { if (!gesture.current.moved && !(e.target as HTMLElement).closest('b,small,span,button'))
        setLyrics(false); }}>{detail?.lyrics.length ? detail.lyrics.map((l, i) => <div data-line={i} className={`ml-line ${i === active ? 'active' : ''}`} key={i}><span>{l.member}</span><b>{l.ko}</b><small>{l.zh}</small></div>) : <div className="ml-empty">{current.real ? '现实歌曲暂无可展示歌词。' : busy ? '正在准备歌词…' : '歌词还未准备好。'}{!busy && !current.real && <button className="ml-link" onClick={() => void run('正在准备歌曲', signal => ensureDetail(current, signal))}>生成 / 重试</button>}</div>}</div>}</div><div className="ml-player-meta"><div><h1>{current.title}</h1><p>{current.artist}</p></div><button aria-label="收藏歌曲" onClick={() => toggleMelonLike(current.id)} className={state.likes.includes(current.id) ? 'liked' : ''}><Heart size={22} fill={state.likes.includes(current.id) ? 'currentColor' : 'none'}/></button><button aria-label="歌曲评论" onClick={() => go({ page: 'comments', id: current.id })}><MessageCircle size={22}/></button></div><small className="ml-silent">歌词浏览 · 暂无真实音频</small><input className="ml-seek" aria-label="播放进度" type="range" min={0} max={duration} value={seconds} onChange={e => setSeconds(+e.target.value)}/><div className="ml-times"><span>{fmt(seconds)}</span><span>{fmt(duration)}</span></div><div className="ml-controls"><button aria-label="上一首" onClick={() => step(-1)}><SkipBack /></button><button className="ml-play" aria-label={playing ? '暂停' : '播放'} onClick={() => { if (seconds >= duration)
        setSeconds(0); setPlaying(p => !p); }}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button><button aria-label="下一首" onClick={() => step(1)}><SkipForward /></button></div></section>}
  {current && view.page === 'comments' && <><div className="ml-comments-song">{art(current)}<div><b>{current.title}</b><small>{current.artist}</small></div></div><div className="ml-comments-list">{(state.comments[current.id] || []).map(c => <article className="ml-comment" key={c.id}>{avatar(c.by, c.me ? me.avatar : c.avatar)}<div><b>{c.me ? me.name : c.by}</b><p>{c.text}</p></div></article>)}{!state.comments[current.id]?.length && empty('还没有留言，来聊聊你的听歌感受吧。')}<button className="ml-more" disabled={!!busy} onClick={() => void run('正在加载评论', signal => moreComments(current, signal))}>{busy ? '加载中…' : '加载更多评论'}</button></div><form className="ml-compose" onSubmit={e => { e.preventDefault(); postComment(current.id, draft); setDraft(''); }}><textarea rows={1} ref={compose} maxLength={500} value={draft} aria-label="写评论" placeholder="写下你的听歌感受…" onChange={e => { const value = e.target.value; setDraft(value); changeMelon(s => { s.drafts[current.id] = value; }); }}/><button disabled={!draft.trim()}>发布</button></form></>}
  {'id' in view && !current && empty('这首作品当前还未发行，或不在此存档的名册中。')}
  </main>
  {['home', 'search', 'chart', 'me'].includes(view.page) && <nav className="ml-nav">{([{ page: 'home', label: '首页', Icon: Home }, { page: 'search', label: '搜索', Icon: Search }, { page: 'chart', label: '榜单', Icon: BarChart3 }, { page: 'me', label: '我的', Icon: User }] as const).map(({ page, label, Icon }) => <button key={page} className={view.page === page ? 'on' : ''} onClick={() => { setError(''); setStack([{ page }]); }}><Icon size={20}/>{label}</button>)}</nav>}
 </div>;
}
