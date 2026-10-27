"use client";

/**
 * IdolSearch（仿 Naver）：首页热搜、搜公司/艺人/自己、公司官网（About/Artists/Audition）、投递、我的投递。
 * 数据和 AI 都在 lib/idol-search.ts；投递结果的信进邮箱 app。
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Home, Mail, Newspaper, Search, User, X } from "lucide-react";

import { COMPANIES, companyOf } from "@/lib/idol-career";
import {
  AREAS, SEARCH_EVENT, addHistory, applyDraft, artistsOf, buildSite, cachedQuery, canApply, clearHistory, findArtist, isMe, loadApps, loadSearch,
  lookOf, matchCompany, meSearchable, minBirthYear, refreshTrend, runQuery, shownStatus, siteBuilding, siteOf, submitApplication, trendFresh, worldYear,
  type Application, type Artist, type QueryResult,
} from "@/lib/idol-search";
import { loadMails } from "@/lib/idol-mail";

type View =
  | { v: "home"; tab: "home" | "news" | "apps" | "me" }
  | { v: "results"; q: string }
  | { v: "site"; id: string; tab: "about" | "artists" | "audition" }
  | { v: "artist"; name: string }
  | { v: "apply"; id: string }
  | { v: "app"; id: string };

type Notice = ((m: string) => void) | undefined;

function useSearchTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN(x => x + 1);
    window.addEventListener(SEARCH_EVENT, bump);
    const t = window.setInterval(bump, 15000);
    return () => { window.removeEventListener(SEARCH_EVENT, bump); window.clearInterval(t); };
  }, []);
  return n;
}

const pad = (n: number) => String(n).padStart(2, "0");
const md = (ms: number) => `${pad(new Date(ms).getMonth() + 1)}.${pad(new Date(ms).getDate())}`;
const STATUS: Record<string, { t: string; c: string }> = {
  review: { t: "审核中", c: "wait" }, invited: { t: "邀请试镜", c: "ok" }, rejected: { t: "未通过", c: "no" }, silent: { t: "没有回音", c: "mute" },
};

function Logo({ id, size = 46, round = false }: { id: string; size?: number; round?: boolean }) {
  const l = lookOf(id);
  return <span className="is-lg" style={{ width: size, height: size, borderRadius: round ? size / 2 : size * 0.24, background: l.c, fontSize: l.logo.length > 3 ? size * 0.22 : size * 0.28 }}>{l.logo}</span>;
}

function SearchBox({ value, onSubmit, small, onBack }: { value?: string; onSubmit: (q: string) => void; small?: boolean; onBack?: () => void }) {
  const [q, setQ] = useState(value ?? "");
  useEffect(() => { setQ(value ?? ""); }, [value]);
  return (
    <form className={`is-sbox${small ? " sm" : ""}`} onSubmit={e => { e.preventDefault(); if (q.trim()) onSubmit(q.trim()); }}>
      {onBack ? <button type="button" className="is-sback" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button> : null}
      <span className="is-n">i</span>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索公司、艺人、新闻" enterKeyHint="search" />
      <button type="submit" className="is-go" aria-label="搜索"><Search size={small ? 16 : 18} strokeWidth={3} /></button>
    </form>
  );
}

function Move({ m }: { m: string }) {
  const k = m.toLowerCase();
  const n = k.match(/\d+/)?.[0];
  if (k.includes("new")) return <span className="is-new">NEW</span>;
  if (k.includes("up")) return <span className="is-up">▲{n}</span>;
  if (k.includes("down")) return <span className="is-dn">▼{n}</span>;
  return <span className="is-eq">-</span>;
}

function NewsList({ items }: { items: { title: string; src: string; ago: string }[] }) {
  return (
    <>
      {items.map((n, i) => (
        <div className="is-ni" key={i}>
          <div className="is-th" style={{ background: `linear-gradient(135deg, hsl(${(i * 67 + n.title.length * 13) % 360} 45% 88%), hsl(${(i * 67 + n.title.length * 13) % 360} 35% 72%))` }} />
          <div><div className="is-tt">{n.title}</div><div className="is-mt">{n.src} · {n.ago}</div></div>
        </div>
      ))}
    </>
  );
}

export function IdolSearchApp({ onClose, onNotice, onOpenMail }: { onClose: () => void; onNotice?: (m: string) => void; onOpenMail?: () => void }) {
  useSearchTick();
  const [stack, setStack] = useState<View[]>([{ v: "home", tab: "home" }]);
  const view = stack[stack.length - 1];
  const go = (v: View) => setStack(s => [...s, v]);
  const back = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : (onClose(), s)));
  const setTab = (tab: "home" | "news" | "apps" | "me") => setStack([{ v: "home", tab }]);
  const search = (q: string) => { addHistory(q); go({ v: "results", q }); };

  let body: React.ReactNode = null;
  if (view.v === "home") body = <HomePage tab={view.tab} setTab={setTab} onSearch={search} onClose={onClose} onOpenApp={id => go({ v: "app", id })} onNotice={onNotice} />;
  if (view.v === "results") body = <ResultsPage q={view.q} onBack={back} onSearch={q => setStack(s => [...s.slice(0, -1), { v: "results", q }])} onSite={(id, tab) => go({ v: "site", id, tab })} onArtist={name => go({ v: "artist", name })} />;
  if (view.v === "site") body = <SitePage id={view.id} tab={view.tab} onBack={back} onTab={tab => setStack(s => [...s.slice(0, -1), { v: "site", id: view.id, tab }])} onArtist={name => go({ v: "artist", name })} onApply={() => go({ v: "apply", id: view.id })} onNotice={onNotice} />;
  if (view.v === "artist") body = <ArtistPage name={view.name} onBack={back} />;
  if (view.v === "apply") body = <ApplyPage id={view.id} onBack={back} onDone={() => setStack([{ v: "home", tab: "apps" }])} onNotice={onNotice} />;
  if (view.v === "app") body = <AppDetail id={view.id} onBack={back} onOpenMail={onOpenMail} />;
  return <div className="is-app">{body}</div>;
}

// ── 首页 ──

function HomePage({ tab, setTab, onSearch, onClose, onOpenApp, onNotice }: { tab: "home" | "news" | "apps" | "me"; setTab: (t: "home" | "news" | "apps" | "me") => void; onSearch: (q: string) => void; onClose: () => void; onOpenApp: (id: string) => void; onNotice: Notice }) {
  const trend = loadSearch().trend;
  const [err, setErr] = useState("");
  useEffect(() => {
    if (trendFresh()) return;
    refreshTrend().catch(e => setErr(String((e as Error).message || e)));
  }, []);
  const d = new Date();
  let main: React.ReactNode;
  if (tab === "home") {
    main = (
      <>
        <div className="is-hometop"><button type="button" className="is-x" onClick={onClose} aria-label="关闭"><ChevronLeft size={22} /></button></div>
        <div className="is-logo">Idol<span>Search</span></div>
        <SearchBox onSubmit={onSearch} />
        <div className="is-qk">
          {[
            { k: "新闻", d: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 9h8M8 13h8M8 17h5" /></>, on: () => setTab("news") },
            { k: "音源榜", d: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>, on: () => onSearch("音源榜") },
            { k: "TV", d: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M9 3l3 3 3-3" /></>, on: () => onSearch("综艺") },
            { k: "百科", d: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></>, on: () => onSearch("经纪公司") },
            { k: "论坛", d: <path d="M4 5h16v11H9l-5 4z" />, on: () => onSearch("练习生 论坛") },
          ].map(x => (
            <button type="button" key={x.k} onClick={x.on}><i><svg viewBox="0 0 24 24">{x.d}</svg></i>{x.k}</button>
          ))}
        </div>
        <div className="is-sec">
          <div className="is-sh"><b>实时热搜</b><span>{d.getFullYear()}.{pad(d.getMonth() + 1)}.{pad(d.getDate())} {pad(d.getHours())}:{pad(d.getMinutes())} · 基准</span></div>
          {trend?.items.length ? trend.items.map((t, i) => (
            <button type="button" className="is-rk" key={i} onClick={() => onSearch(t.q)}><span className="no">{i + 1}</span><span className="tx">{t.q}</span><Move m={t.move} /></button>
          )) : <div className="is-empty">{err ? `热搜没刷出来：${err}` : "热搜加载中……"}</div>}
        </div>
      </>
    );
  } else if (tab === "news") {
    main = (
      <>
        <div className="is-hd"><b>新闻</b><small>{d.getMonth() + 1}月{d.getDate()}日</small></div>
        <div className="is-pad">{trend?.news.length ? <NewsList items={trend.news} /> : <div className="is-empty">{err || "新闻加载中……"}</div>}</div>
      </>
    );
  } else if (tab === "apps") {
    const apps = loadApps();
    main = (
      <>
        <div className="is-hd"><b>我的投递</b><small>{d.getFullYear()}.{pad(d.getMonth() + 1)}.{pad(d.getDate())}</small></div>
        {apps.length ? apps.map(a => {
          const c = companyOf(a.companyId)!;
          const st = STATUS[shownStatus(a)] ?? STATUS.review;
          return (
            <button type="button" className="is-ap" key={a.id} onClick={() => onOpenApp(a.id)}>
              <Logo id={a.companyId} />
              <span className="m"><span className="n">{c.name} 娱乐</span><span className="d">{shownStatus(a) === "rejected" && a.reason ? `「${a.reason}」` : `${md(a.at)} 投递 · ${a.areas.join(" ")}`}</span></span>
              <span className={`is-st ${st.c}`}>{st.t}</span>
            </button>
          );
        }) : <div className="is-empty">还没投过。搜公司名，进官网的 Audition 投递。</div>}
        <div className="is-foot">投递三周没有消息，就会标成「没有回音」<br />结果出来时邮箱里也会收到信</div>
      </>
    );
  } else {
    const s = loadSearch();
    main = (
      <>
        <div className="is-hd"><b>我的</b></div>
        <div className="is-sec">
          <div className="is-sh"><b>搜索记录</b>{s.history.length ? <button type="button" className="is-link" onClick={() => { clearHistory(); onNotice?.("清掉了"); }}>全部清除</button> : null}</div>
          {s.history.length ? s.history.map(h => <button type="button" className="is-hist" key={h} onClick={() => onSearch(h)}><Search size={15} />{h}</button>) : <div className="is-empty">还没有搜索记录</div>}
        </div>
        <div className="is-sec">
          <div className="is-sh"><b>经纪公司</b></div>
          {COMPANIES.map(c => <button type="button" className="is-hist" key={c.id} onClick={() => onSearch(c.name)}><Logo id={c.id} size={26} />{c.name} 娱乐</button>)}
        </div>
      </>
    );
  }
  return (
    <div className="is-page has-tab">
      <div className="is-scroll">{main}</div>
      <div className="is-tabbar">
        <button type="button" className={tab === "home" ? "on" : ""} onClick={() => setTab("home")}><Home size={22} strokeWidth={1.8} />首页</button>
        <button type="button" className={tab === "news" ? "on" : ""} onClick={() => setTab("news")}><Newspaper size={22} strokeWidth={1.8} />新闻</button>
        <button type="button" className={tab === "apps" ? "on" : ""} onClick={() => setTab("apps")}><Mail size={22} strokeWidth={1.8} />我的投递</button>
        <button type="button" className={tab === "me" ? "on" : ""} onClick={() => setTab("me")}><User size={22} strokeWidth={1.8} />我的</button>
      </div>
    </div>
  );
}

// ── 搜索结果 ──

function ResultsPage({ q, onBack, onSearch, onSite, onArtist }: { q: string; onBack: () => void; onSearch: (q: string) => void; onSite: (id: string, tab: "about" | "artists" | "audition") => void; onArtist: (name: string) => void }) {
  const company = matchCompany(q);
  const artist = findArtist(q);
  const me = isMe(q);
  const hidden = me && !meSearchable();
  const [res, setRes] = useState<QueryResult | undefined>(() => cachedQuery(q));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRes(cachedQuery(q)); setErr("");
    if (hidden || cachedQuery(q)) return;
    setBusy(true);
    runQuery(q).then(setRes).catch(e => setErr(String((e as Error).message || e))).finally(() => setBusy(false));
  }, [q, hidden]);
  const look = company ? lookOf(company.id) : null;
  return (
    <div className="is-page">
      <div className="is-rs"><SearchBox value={q} onSubmit={onSearch} small onBack={onBack} /></div>
      <div className="is-tabs"><span className="on">综合</span><span>新闻</span><span>视频</span><span>图片</span><span>论坛</span></div>
      <div className="is-scroll">
        {company && look ? (
          <div className="is-card">
            <div className="is-ch"><Logo id={company.id} size={58} /><div><div className="is-cn">{company.name} 娱乐</div><div className="is-cs">经纪公司 · {company.scale}</div><button type="button" className="is-offi" onClick={() => onSite(company.id, "about")}>🔗 官网 {look.domain} ›</button></div></div>
            <div className="is-kv">
              <div><b>风格</b><span>{company.style}</span></div>
              <div><b>练习生</b><span>{company.trainee}</span></div>
              <div><b>招人</b><span>{company.recruit}</span></div>
            </div>
            <div className="is-btn2"><button type="button" onClick={() => onSite(company.id, "artists")}>旗下艺人</button><button type="button" className="g" onClick={() => onSite(company.id, "audition")}>오디션 · 去投递 ›</button></div>
          </div>
        ) : null}
        {artist ? (
          <button type="button" className="is-card is-acard" onClick={() => onArtist(artist.name)}>
            <span className="is-acv" style={{ background: artistBg(artist.name) }} />
            <span><span className="is-cn">{artist.name}</span><span className="is-cs">{companyOf(artist.companyId)?.name} 娱乐 · {artist.kind}{artist.debut ? ` · ${artist.debut} 出道` : ""}</span><span className="is-cs">{artist.recent}</span></span>
          </button>
        ) : null}
        {hidden ? <div className="is-none"><b>没有找到「{q}」的相关结果</b><span>检查一下拼写，或者换个词搜搜看</span></div> : (
          <div className="is-news">
            {res?.snippet ? <div className="is-snip">{res.snippet}</div> : null}
            <div className="is-nh">相关新闻</div>
            {res ? <NewsList items={res.results} /> : <div className="is-empty">{busy ? "搜索中……" : err ? `没搜出来：${err}` : ""}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function artistBg(name: string): string {
  let h = 0; for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const a = h % 360;
  return `linear-gradient(160deg, hsl(${a} 30% 22%), hsl(${(a + 40) % 360} 40% 62%))`;
}

// ── 官网 ──

function SiteHead({ id, tab, onTab, onBack }: { id: string; tab: string; onTab: (t: "about" | "artists" | "audition") => void; onBack: () => void }) {
  const l = lookOf(id);
  const c = companyOf(id)!;
  return (
    <>
      <div className="is-url"><span>🔒 {l.domain}{tab === "about" ? "" : `/${tab}`}</span><button type="button" onClick={onBack} aria-label="关闭"><X size={16} /></button></div>
      <div className="is-jh" style={{ background: l.c }}>
        <span className="is-jl" style={{ background: l.y, color: l.c }}>{l.logo}</span>
        <span className="is-jn">{c.name}<br />Entertainment</span>
        {(["about", "artists", "audition"] as const).map(t => (
          <button type="button" key={t} className={tab === t ? "on" : ""} style={tab === t ? { borderColor: l.y } : undefined} onClick={() => onTab(t)}>{t === "about" ? "About" : t === "artists" ? "Artists" : "Audition"}</button>
        ))}
      </div>
    </>
  );
}

function SitePage({ id, tab, onBack, onTab, onArtist, onApply, onNotice }: { id: string; tab: "about" | "artists" | "audition"; onBack: () => void; onTab: (t: "about" | "artists" | "audition") => void; onArtist: (n: string) => void; onApply: () => void; onNotice: Notice }) {
  const c = companyOf(id)!;
  const l = lookOf(id);
  const site = siteOf(id);
  const [err, setErr] = useState("");
  const [, force] = useState(0);
  useEffect(() => {
    if (siteOf(id)) return;
    setErr("");
    buildSite(id).catch(e => setErr(String((e as Error).message || e))).finally(() => force(x => x + 1));
  }, [id]);
  const loading = !site ? (
    <div className="is-empty">{err ? <>官网没打开：{err}<br /><button type="button" className="is-link" onClick={() => { setErr(""); buildSite(id, true).catch(e => setErr(String((e as Error).message || e))).finally(() => force(x => x + 1)); }}>再试一次</button></> : siteBuilding(id) || !err ? "正在打开官网……" : ""}</div>
  ) : null;
  const year = worldYear();
  const style = { ["--c" as string]: l.c, ["--y" as string]: l.y, ["--ink" as string]: l.ink } as React.CSSProperties;

  let main: React.ReactNode = loading;
  if (site && tab === "about") {
    main = (
      <>
        <div className="is-hero">
          <span className="is-badge">대기업 · {c.scale.slice(0, 6)}</span>
          <div className="is-big">{c.name}<br />Entertainment</div>
          <div className="is-cnn">{c.name} 娱乐{site.nameNote ? `（${site.nameNote}）` : ""}</div>
          {site.motto_ko || site.motto_zh ? <div className="is-mot">{site.motto_ko}{site.motto_zh ? `　${site.motto_zh}` : ""}</div> : null}
          <div className="is-meta">설립<b>{site.founded}년</b>　　본사<b>{site.hq_ko}</b>{site.hq_zh ? <small>{site.hq_zh}</small> : null}<br />웹<b>www.{l.domain}</b></div>
        </div>
        <div className="is-jsec">
          <div className="is-jt">About · 회사 소개<small>ABOUT US</small></div>
          {site.about.map((p, i) => (
            <div key={i}>
              <div className="is-jsub">{p.h_ko}<i>{p.h_zh}</i></div>
              <p className="is-ko">{p.ko}</p>
              <p className="is-zh">{p.zh}</p>
            </div>
          ))}
          <div className="is-jsub">History<i>年表</i></div>
          <div className="is-hist2">{site.history.map((h, i) => <div key={i}><b>{h.year}</b>{h.ko}<span>{h.zh}</span></div>)}</div>
        </div>
        <div className="is-jsec">
          <div className="is-jt">Notice · 공지<small>NEWS</small></div>
          <div className="is-notice">{site.notices.map((n, i) => <div key={i}><p><span className="tag">{n.tag}</span>{n.ko}<small>{n.zh}</small></p><span>{n.date}</span></div>)}</div>
        </div>
      </>
    );
  } else if (site && tab === "artists") {
    main = <ArtistsGrid id={id} onArtist={onArtist} />;
  } else if (tab === "audition") {
    const can = canApply(id);
    main = (
      <>
        <div className="is-jsec"><div className="is-jt">Audition · 오디션<small>{year} GLOBAL AUDITION</small></div></div>
        <div className="is-sum">
          <div className="h">오디션 요약 · 选拔速览</div>
          <div className="r"><span>报名资格 · 지원 자격</span><b>{minBirthYear()} 年以后出生</b></div>
          <div className="r"><span>竞争 · 경쟁</span><b>{l.competition}</b></div>
          <div className="r"><span>报名费用 · 접수비</span><b>免费</b></div>
          <div className="r"><span>回复时间 · 회신</span><b>{l.reply}</b></div>
        </div>
        <div className="is-steps">
          <div><b>1</b><p>온라인 지원<small>在线投递</small></p></div>
          <div><b>2</b><p>서류 심사<small>资料审核，结果发到邮箱</small></p></div>
          <div><b>3</b><p>오디션<small>线下试镜</small></p></div>
        </div>
        <div className="is-apply">
          <div className="a1">지원하기 · 立刻投递</div>
          <div className="a2">합격자에게만 개별 연락드립니다.<br />未通过的人不另行通知。</div>
          <button type="button" className="ab" onClick={() => (can.ok ? onApply() : onNotice?.(can.why ?? "现在投不了"))}>{can.ok ? "写投递资料 →" : can.why}</button>
        </div>
      </>
    );
  }
  return (
    <div className="is-page is-site" style={style}>
      <SiteHead id={id} tab={tab} onTab={onTab} onBack={onBack} />
      <div className="is-scroll">{main}<div className="is-padb" /></div>
    </div>
  );
}

function ArtistsGrid({ id, onArtist }: { id: string; onArtist: (n: string) => void }) {
  const [kind, setKind] = useState("全部");
  const list = artistsOf(id).filter(a => kind === "全部" || (a.kind ?? "").includes(kind)).sort((a, b) => (b.debut ?? 0) - (a.debut ?? 0));
  return (
    <>
      <div className="is-jsec"><div className="is-jt">Artists · 아티스트<small>ARTISTS</small></div></div>
      <div className="is-seg">{["全部", "男团", "女团", "Solo"].map(k => <button type="button" key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k}</button>)}</div>
      <div className="is-grid">
        {list.map(a => (
          <button type="button" className="is-gc" key={a.name} onClick={() => onArtist(a.name)}>
            <span className="ac" style={{ background: artistBg(a.name) }} />
            <span className="an">{a.name}</span>
            <span className="ad">{a.kind}{a.size && !(a.kind ?? "").includes("Solo") ? ` · ${a.size} 人` : ""}{a.debut ? ` · ${a.debut}` : ""}</span>
          </button>
        ))}
      </div>
      {!list.length ? <div className="is-empty">这一类还没有艺人</div> : null}
    </>
  );
}

// ── 团的页面 ──

function ArtistPage({ name, onBack }: { name: string; onBack: () => void }) {
  const a: Artist | undefined = findArtist(name);
  const [res, setRes] = useState<QueryResult | undefined>(() => cachedQuery(name));
  useEffect(() => { if (!cachedQuery(name)) runQuery(name).then(setRes).catch(() => {}); }, [name]);
  if (!a) return <div className="is-page"><div className="is-rs"><button type="button" className="is-x" onClick={onBack}><ChevronLeft size={22} /></button></div><div className="is-empty">找不到这个艺人</div></div>;
  return (
    <div className="is-page">
      <div className="is-scroll">
        <div className="is-gh" style={{ background: artistBg(a.name) }}>
          <button type="button" className="is-ghb" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button>
          <div className="g1"><div className="gn">{a.name}</div><div className="gs">{companyOf(a.companyId)?.name} 娱乐 · {a.kind}{a.size && !(a.kind ?? "").includes("Solo") ? ` · ${a.size} 人` : ""}{a.debut ? ` · ${a.debut} 出道` : ""}</div></div>
        </div>
        <div className="is-gkv">
          {a.style ? <div><b>风格</b><span>{a.style}</span></div> : null}
          {a.fandom ? <div><b>粉丝名</b><span>{a.fandom}</span></div> : null}
          {a.recent ? <div><b>最近</b><span>{a.recent}</span></div> : null}
        </div>
        {a.members?.length ? <><div className="is-sec"><div className="is-sh"><b>成员</b></div></div><div className="is-mem">{a.members.map(m => <span key={m}><i style={{ background: artistBg(m) }} />{m}</span>)}</div></> : null}
        {a.songs?.length ? <><div className="is-sec"><div className="is-sh"><b>代表曲</b></div></div>{a.songs.map(s => <div className="is-song" key={s.title}><span className="cv" style={{ background: artistBg(s.title) }} /><span>{s.title}<small>{[s.year, s.note].filter(Boolean).join(" · ")}</small></span></div>)}</> : null}
        <div className="is-sec"><div className="is-sh"><b>相关新闻</b></div></div>
        <div className="is-pad">{res ? <NewsList items={res.results} /> : <div className="is-empty">加载中……</div>}</div>
        <div className="is-padb" />
      </div>
    </div>
  );
}

// ── 投递 ──

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const s = 260 / Math.max(img.width, img.height);
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * Math.min(1, s)); cv.height = Math.round(img.height * Math.min(1, s));
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.78);
  } finally { URL.revokeObjectURL(url); }
}

function ApplyPage({ id, onBack, onDone, onNotice }: { id: string; onBack: () => void; onDone: () => void; onNotice: Notice }) {
  const c = companyOf(id)!;
  const l = lookOf(id);
  const [f, setF] = useState(() => ({ ...applyDraft(), photos: [] as string[], video: "" }));
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const toggle = (a: string) => set("areas", f.areas.includes(a) ? f.areas.filter(x => x !== a) : [...f.areas, a]);
  const submit = () => {
    if (!f.name.trim()) { onNotice?.("名字要填"); return; }
    if (!f.areas.length) { onNotice?.("至少选一个报名方向"); return; }
    const can = canApply(id);
    if (!can.ok) { onNotice?.(can.why ?? "现在投不了"); return; }
    submitApplication(id, { ...f, name: f.name.trim(), intro: f.intro.trim(), video: f.video.trim() });
    onNotice?.(`投出去了：${c.name}`);
    onDone();
  };
  const style = { ["--c" as string]: l.c, ["--y" as string]: l.y, ["--ink" as string]: l.ink } as React.CSSProperties;
  return (
    <div className="is-page is-site" style={style}>
      <div className="is-url"><span>🔒 {l.domain}/audition/apply</span><button type="button" onClick={onBack} aria-label="返回"><X size={16} /></button></div>
      <div className="is-jh" style={{ background: l.c }}><span className="is-jl" style={{ background: l.y, color: l.c }}>{l.logo}</span><span className="is-jn">{c.name}<br />Entertainment</span><b className="is-jr">온라인 지원 · 在线投递</b></div>
      <div className="is-scroll">
        <div className="is-form">
          <div className="fl">이름 · 姓名</div><input className="fi" value={f.name} onChange={e => set("name", e.target.value)} />
          <div className="is-row2">
            <div><div className="fl">생년월일 · 出生日期</div><input className="fi" type="date" value={f.birthday} onChange={e => set("birthday", e.target.value)} /></div>
            <div className="w"><div className="fl">키 · 身高</div><input className="fi" inputMode="numeric" placeholder="165" value={f.height} onChange={e => set("height", e.target.value.replace(/[^\d]/g, "").slice(0, 3))} /></div>
          </div>
          <div className="fl">이메일 · 邮箱 <i>结果发到这里</i></div><input className="fi" value={f.email} onChange={e => set("email", e.target.value)} />
          <div className="fl">지원 분야 · 报名方向 <i>可多选</i></div>
          <div className="is-tags">{AREAS.map(a => <button type="button" key={a} className={f.areas.includes(a) ? "on" : ""} onClick={() => toggle(a)}>{a}</button>)}</div>
          <div className="fl">사진 · 照片 <i>从相册选，正面+全身</i></div>
          <div className="is-ups">
            {f.photos.map((p, i) => <button type="button" key={i} className="ph1" style={{ backgroundImage: `url(${p})` }} onClick={() => set("photos", f.photos.filter((_, j) => j !== i))} aria-label="去掉这张" />)}
            {f.photos.length < 3 ? <button type="button" className="add" onClick={() => fileRef.current?.click()}>＋</button> : null}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) { try { const u = await shrink(file); setF(x => ({ ...x, photos: [...x.photos, u].slice(0, 3) })); } catch { onNotice?.("这张读不出来"); } } }} />
          </div>
          <div className="fl">영상 · 视频 <i>写视频里是什么，比如：练习室跳《Love Shot》一分钟</i></div>
          <input className="fi" value={f.video} placeholder="不附可以空着" onChange={e => set("video", e.target.value)} />
          <div className="fl">자기소개 · 自我介绍</div>
          <textarea className="fi ta" rows={5} value={f.intro} placeholder="为什么想当爱豆、学过什么、想让他们看到什么" onChange={e => set("intro", e.target.value)} />
        </div>
        <button type="button" className="is-cta" onClick={submit}>제출 · 提交</button>
        <div className="is-padb" />
      </div>
    </div>
  );
}

function AppDetail({ id, onBack, onOpenMail }: { id: string; onBack: () => void; onOpenMail?: () => void }) {
  const a: Application | undefined = loadApps().find(x => x.id === id);
  if (!a) return <div className="is-page"><div className="is-empty">找不到这份投递</div></div>;
  const c = companyOf(a.companyId)!;
  const shown = shownStatus(a);
  const mail = a.mailId ? loadMails().find(m => m.id === a.mailId) : undefined;
  const steps: { t: string; s: string; on: boolean }[] = [
    { t: "投递成功", s: `${md(a.at)} ${pad(new Date(a.at).getHours())}:${pad(new Date(a.at).getMinutes())}`, on: true },
    { t: "资料审核中", s: md(a.at + 864e5), on: true },
  ];
  if (shown === "invited") steps.push({ t: "邀请试镜", s: `${md(a.decidedAt ?? a.at)} · 已发到你的邮箱`, on: true });
  if (shown === "rejected") steps.push({ t: "未通过", s: `${md(a.decidedAt ?? a.at)} · ${a.reason ?? ""}`, on: true });
  if (shown === "silent") steps.push({ t: "没有回音", s: "三周都没有消息", on: false });
  return (
    <div className="is-page">
      <div className="is-rs"><button type="button" className="is-x" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button></div>
      <div className="is-scroll is-dt">
        <div className="is-dh"><Logo id={a.companyId} /><div><div className="n">{c.name} 娱乐</div><div className="d">{new Date(a.at).getFullYear()} 公开试镜 · 在线投递</div></div></div>
        <div className="is-tl">{steps.map((s, i) => <div key={i} className={s.on ? "on" : ""}><p>{s.t}</p><small>{s.s}</small></div>)}</div>
        <div className="is-box">
          <div className="k">我交的资料</div>
          <div className="v">{a.name} · {a.birthday.replace(/-/g, ".")}{a.height ? ` · ${a.height}cm` : ""}<br />报名：{a.areas.join("、")}{a.video ? <><br />视频：{a.video}</> : null}{a.intro ? <><br />「{a.intro.slice(0, 60)}{a.intro.length > 60 ? "……" : ""}」</> : null}</div>
          {a.photos.length ? <div className="is-thumbs">{a.photos.map((p, i) => <i key={i} style={{ backgroundImage: `url(${p})` }} />)}</div> : null}
        </div>
        {mail && onOpenMail ? <button type="button" className="is-gbtn" onClick={onOpenMail}>去邮箱看回信 →</button> : null}
      </div>
    </div>
  );
}
