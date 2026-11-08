"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadCharacters, CHARACTERS_UPDATED_EVENT } from "@/lib/character-storage";
import { getProfile, loadProfiles, relationOf, RELATIONS, savePersonalNote, saveProfile, PEOPLE_UPDATED_EVENT } from "@/lib/idol-people";
import { loadCareer, CAREER_EVENT, type Career } from "@/lib/idol-career";
import { loadRoster, ensureRoster, queueProfileRegenerate, ROSTER_UPDATED_EVENT } from "@/lib/idol-roster-live";
import type { NpcRecord, RosterState } from "@/lib/idol-roster";
import { loadMonths, RANK_EVENT, type MonthRank } from "@/lib/idol-ledger";
import { branchesState, type BranchRecord } from "@/lib/idol-branches";
import { romanceState } from "@/lib/idol-romance-live";
import { ROUTE_NODES, ROUTE_TYPES, type LineState, type RouteType } from "@/lib/idol-romance-lines";
import type { Character } from "@/lib/character-types";
import type { Subject } from "@/lib/idol-training";

type YearbookData = {
  roster: RosterState | null;
  characters: Character[];
  profiles: ReturnType<typeof loadProfiles>;
  career: Career;
  months: MonthRank[];
  branches: BranchRecord[];
  lines: Partial<Record<RouteType, LineState>>;
};

type Page =
  | { kind: "shelf" }
  | { kind: "class-cover" }
  | { kind: "directory"; filter: "all" | "A" | "B" | "C" | "D"; page: number }
  | { kind: "classmate"; id: string }
  | { kind: "romance-cover" }
  | { kind: "fates" }
  | { kind: "fate"; type: RouteType };

const SUBJECT_LABEL: Record<Subject, string> = {
  vocal: "声乐", dance: "舞蹈", rap: "说唱", visual: "形象", acting: "演技", variety: "综艺", compose: "作曲", language: "语言",
};
const SUBJECT_EN: Record<Subject, string> = {
  vocal: "VOCAL", dance: "DANCE", rap: "RAP", visual: "VISUAL", acting: "ACTING", variety: "VARIETY", compose: "COMPOSING", language: "LANGUAGES",
};
const ROUTE_EN: Record<RouteType, string> = {
  idol: "IDOL", underground: "UNDERGROUND", esports: "ESPORTS", heir: "HEIR", trainee: "TRAINEE", campus: "CAMPUS",
};
const TIER_EN = { "好朋友": "Best friend", "朋友": "Friend", "熟人": "Acquaintance" } as const;
function specialtyEn(value?: string): string { return (SUBJECT_EN as Record<string, string>)[value ?? ""] ?? "—"; }

function useYearbookData(): YearbookData {
  const [revision, refresh] = useState(0);
  useEffect(() => {
    ensureRoster();
    const update = () => refresh(v => v + 1);
    window.addEventListener(ROSTER_UPDATED_EVENT, update);
    window.addEventListener(PEOPLE_UPDATED_EVENT, update);
    window.addEventListener(CHARACTERS_UPDATED_EVENT, update);
    window.addEventListener(CAREER_EVENT, update);
    window.addEventListener(RANK_EVENT, update);
    const timer = window.setInterval(update, 2500);
    return () => {
      window.removeEventListener(ROSTER_UPDATED_EVENT, update);
      window.removeEventListener(PEOPLE_UPDATED_EVENT, update);
      window.removeEventListener(CHARACTERS_UPDATED_EVENT, update);
      window.removeEventListener(CAREER_EVENT, update);
      window.removeEventListener(RANK_EVENT, update);
      window.clearInterval(timer);
    };
  }, []);
  return useMemo(() => ({
    roster: loadRoster(),
    characters: loadCharacters(),
    profiles: loadProfiles(),
    career: loadCareer(),
    months: loadMonths(),
    branches: branchesState().branches,
    lines: romanceState().lines,
  }), [revision]);
}

function day(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return `${d.getFullYear()} . ${String(d.getMonth() + 1).padStart(2, "0")} . ${String(d.getDate()).padStart(2, "0")}`;
}
function shortDay(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, "0")} . ${String(d.getDate()).padStart(2, "0")}`;
}
function birth(value?: string): string {
  if (!value) return "—";
  return value.replace(/^0/, "").replace(/-(0?)/, " . ").replace(/-(0?)/, " . ");
}
function monthLabel(month: string): string {
  const m = Number(month.split("-")[1]);
  return Number.isFinite(m) ? ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1] ?? month : month;
}
function roman(n: number): string {
  const digits: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let left = n, out = "";
  for (const [value, symbol] of digits) while (left >= value) { out += symbol; left -= value; }
  return out;
}
function playerContact(id: string, data: YearbookData): Character | undefined { return data.characters.find(c => c.id === id); }
function npcByCharId(id: string, data: YearbookData): NpcRecord | undefined { return data.roster?.npcs.find(n => n.charId === id); }

/* 校徽生成：与定稿预览 previews/yearbook/v6-card.html、romance-v2.html 里的生成脚本同一段逻辑 */
function crestMarkup(kind: "star" | "rose", bg: string, uid: string): string {
  const W = "#fff";
  const shield = "M125 18 C 150 30, 178 32, 196 26 L 196 120 C 196 170, 160 196, 125 214 C 90 196, 54 170, 54 120 L 54 26 C 72 32, 100 30, 125 18Z";
  let s = `<path d="${shield}" fill="none" stroke="${W}" stroke-width="3"/>`;
  s += `<path d="${shield}" transform="translate(125 116) scale(.9) translate(-125 -116)" fill="none" stroke="${W}" stroke-width="1"/>`;
  s += `<defs><path id="a${uid}" d="M74 74 Q125 46 176 74"/><path id="b${uid}" d="M70 140 Q125 205 180 140"/></defs>`;
  s += `<text font-family="Playfair Display" font-size="15" fill="${W}" letter-spacing="1.5" text-anchor="middle"><textPath href="#a${uid}" startOffset="50%">${kind === "star" ? "TRAINEE" : "FATE"}</textPath></text>`;
  s += `<text font-family="Old Standard TT" font-size="7.5" fill="${W}" letter-spacing="2.6" text-anchor="middle"><textPath href="#b${uid}" startOffset="50%">${kind === "star" ? "MEMENTO STELLAE" : "MEMENTO AMORIS"}</textPath></text>`;
  const cx = 125, cy = 112;
  if (kind === "star") {
    const star = (x: number, y: number, r: number, k: number) => `M${x} ${y - r} Q${x + r * k} ${y - r * k} ${x + r} ${y} Q${x + r * k} ${y + r * k} ${x} ${y + r} Q${x - r * k} ${y + r * k} ${x - r} ${y} Q${x - r * k} ${y - r * k} ${x} ${y - r}Z`;
    s += `<path d="${star(125, 112, 34, .16)}" fill="${W}"/><path d="${star(152, 90, 7, .18)}" fill="${W}"/><path d="${star(99, 132, 5, .18)}" fill="${W}"/>`;
  } else {
    let out = "";
    for (let i = 0; i <= 360; i += 4) {
      const r = 29 + 3.2 * Math.cos(i * 7 * Math.PI / 180);
      const a = i * Math.PI / 180;
      out += (i ? "L" : "M") + (cx + r * Math.cos(a)).toFixed(1) + " " + (cy + r * 0.92 * Math.sin(a)).toFixed(1);
    }
    s += `<path d="${out}Z" fill="${W}"/>`;
    const st = `fill="none" stroke="${bg}" stroke-width="1.8" stroke-linecap="round"`;
    s += `<path d="M${cx - 22} ${cy + 6} C ${cx - 20} ${cy + 22}, ${cx + 20} ${cy + 22}, ${cx + 22} ${cy + 6}" ${st}/>`;
    s += `<path d="M${cx - 24} ${cy - 4} C ${cx - 26} ${cy + 14}, ${cx - 6} ${cy + 16}, ${cx - 2} ${cy + 12}" ${st}/>`;
    s += `<path d="M${cx + 24} ${cy - 4} C ${cx + 26} ${cy + 14}, ${cx + 6} ${cy + 16}, ${cx + 2} ${cy + 12}" ${st}/>`;
    s += `<path d="M${cx - 15} ${cy - 6} C ${cx - 14} ${cy + 9}, ${cx + 14} ${cy + 9}, ${cx + 15} ${cy - 6}" ${st}/>`;
    s += `<path d="M${cx - 16} ${cy - 10} C ${cx - 12} ${cy - 22}, ${cx + 12} ${cy - 22}, ${cx + 16} ${cy - 10}" ${st}/>`;
    s += `<path d="M${cx - 8} ${cy - 2} C ${cx - 10} ${cy - 12}, ${cx + 6} ${cy - 15}, ${cx + 8} ${cy - 6} C ${cx + 9} ${cy}, ${cx + 1} ${cy + 3}, ${cx - 2} ${cy - 2} C ${cx - 4} ${cy - 6}, ${cx + 1} ${cy - 9}, ${cx + 3} ${cy - 6}" ${st}/>`;
  }
  let leaves = "";
  for (const dir of [-1, 1]) {
    let d = "";
    for (let i = 0; i <= 40; i++) {
      d += (i ? "L" : "M") + (125 + dir * Math.sin((i * 2.6) * Math.PI / 180) * 102).toFixed(1) + " " + (118 + Math.cos((i * 2.6) * Math.PI / 180) * 102).toFixed(1) + " ";
    }
    leaves += `<path d="${d}" fill="none" stroke="${W}" stroke-width="1.6"/>`;
    for (let i = 1; i <= 11; i++) {
      const th = i * 9.4 * Math.PI / 180;
      const x = 125 + dir * Math.sin(th) * 102, y = 118 + Math.cos(th) * 102;
      const tang = Math.atan2(-Math.sin(th) * 102, dir * Math.cos(th) * 102) * 180 / Math.PI;
      for (const side of [-1, 1]) leaves += `<ellipse cx="0" cy="-7" rx="3.4" ry="8" fill="${W}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(tang + 90 + side * 38).toFixed(1)})"/>`;
    }
  }
  return leaves + s;
}

function Crest({ kind, bg }: { kind: "star" | "rose"; bg: string }) {
  const uid = useRef(`cr${Math.random().toString(36).slice(2, 9)}`).current;
  const markup = useMemo(() => crestMarkup(kind, bg, uid), [kind, bg, uid]);
  return <svg className="yb-crest" viewBox="0 0 250 260" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}

function Vine({ color, className }: { color: string; className: string }) {
  return <svg className={`yb-vine ${className}`} viewBox="0 0 18 46" aria-hidden="true">
    <g fill="none" stroke={color}>
      <path d="M9 0 C 4 12, 14 22, 9 34 C 7 39, 9 43, 10 46" strokeWidth=".8" />
      <path d="M8.6 9 C 4 8, 2 5, 2.5 3 C 5 3.5, 8 6, 8.6 9Z" strokeWidth=".7" />
      <path d="M10 18 C 14.5 17, 16 14, 15.5 12 C 13 12.5, 10.5 15, 10 18Z" strokeWidth=".7" />
      <path d="M8.3 28 C 3.8 27.5, 2 24.5, 2.4 22.5 C 5 23, 7.8 25.5, 8.3 28Z" strokeWidth=".7" />
    </g>
  </svg>;
}

function AppTopbar({ title, canBack, onBack, onClose, rose }: { title: string; canBack: boolean; onBack: () => void; onClose: () => void; rose?: boolean }) {
  return <div className={`yb-appbar ${rose ? "rose" : ""}`}>
    {canBack ? <button type="button" onClick={onBack} aria-label="返回">‹</button> : <button type="button" className="yb-close" onClick={onClose} aria-label="关闭">✕</button>}
    <span>{title}</span>
  </div>;
}

export function YearbookApp({ onClose }: { onClose: () => void }) {
  const data = useYearbookData();
  const [stack, setStack] = useState<Page[]>([{ kind: "shelf" }]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const page = stack[stack.length - 1];
  const go = (next: Page) => setStack(current => [...current, next]);
  const back = () => { if (stack.length > 1) setStack(current => current.slice(0, -1)); else onClose(); };
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [page]);

  const followedCount = ROUTE_TYPES.filter(type => data.lines[type]).length;
  const isCover = page.kind === "class-cover" || page.kind === "romance-cover";
  const isRomanceBar = page.kind === "fates" || page.kind === "fate";
  const title = page.kind === "directory" ? "Classmates"
    : page.kind === "classmate" ? `No. ${String((data.roster?.npcs.findIndex(n => n.charId === page.id) ?? -1) + 1).padStart(2, "0")}`
    : page.kind === "fates" ? "Love Record"
    : page.kind === "fate" ? ROUTE_EN[page.type]
    : page.kind === "romance-cover" ? "Love Record"
    : page.kind === "class-cover" ? "Classmates"
    : "";
  return <div className={`yb-app ${isCover ? "is-cover" : ""}`}>
    <AppTopbar title={title} canBack={page.kind !== "shelf"} onBack={back} onClose={onClose} rose={isRomanceBar} />
    <main className={`yb-scroll ${page.kind === "class-cover" ? "is-dark" : page.kind === "romance-cover" ? "is-rose" : ""}`} ref={scrollRef}>
      {page.kind === "shelf" ? <Bookshelf onClassmates={() => go({ kind: "class-cover" })} onRomance={() => go({ kind: "romance-cover" })} classCount={data.roster?.npcs.length ?? 0} followedCount={followedCount} /> : null}
      {page.kind === "class-cover" ? <BookCover title="Trainee Yearbook" motto="Memento Stellae" label="CLASSMATES" count={`${data.roster?.npcs.length ?? 0} trainees · 2026 – 2027`} foot="Train in Light · Endure the Dark · Remain a Star" kind="star" onOpen={() => go({ kind: "directory", filter: "all", page: 1 })} /> : null}
      {page.kind === "directory" ? <Directory data={data} filter={page.filter} page={page.page} onFilter={filter => setStack(current => [...current.slice(0, -1), { kind: "directory", filter, page: 1 }])} onPage={nextPage => setStack(current => [...current.slice(0, -1), { ...page, page: nextPage }])} onOpen={id => go({ kind: "classmate", id })} /> : null}
      {page.kind === "classmate" ? <ClassmatePage id={page.id} data={data} showPageBar={false} /> : null}
      {page.kind === "romance-cover" ? <BookCover title="Love Record" motto="Memento Amoris" label="SIX FATES" count="2026 – 2027" foot="Meet by Chance · Stay by Choice · Remember Always" kind="rose" rose onOpen={() => go({ kind: "fates" })} /> : null}
      {page.kind === "fates" ? <FatesPage data={data} onOpen={type => go({ kind: "fate", type })} /> : null}
      {page.kind === "fate" ? <FatePage type={page.type} data={data} /> : null}
    </main>
  </div>;
}

export function ContactYearbookPage({ id, onBack }: { id: string; onBack: () => void }) {
  const data = useYearbookData();
  const number = String((data.roster?.npcs.findIndex(n => n.charId === id) ?? -1) + 1).padStart(2, "0");
  return <div className="yb-embedded">
    <div className="yb-pagebar"><button type="button" onClick={onBack} aria-label="返回">‹</button><span>No. {number}</span></div>
    <ClassmatePage id={id} data={data} showPageBar={false} />
  </div>;
}

function Bookshelf({ onClassmates, onRomance, classCount, followedCount }: { onClassmates: () => void; onRomance: () => void; classCount: number; followedCount: number }) {
  return <section className="yb-shelf">
    <div className="yb-title" style={{ color: "#222" }}><i>✦</i>My Yearbooks<i>✦</i></div>
    <div className="yb-cap">2026 – 2027</div>
    <div className="yb-books">
      <button type="button" className="yb-book" onClick={onClassmates}>
        <span className="yb-book-cover yb-cover-black"><b>✦ CLASSMATES ✦</b><Crest kind="star" bg="#0f0f0f" /><small>Memento Stellae</small></span>
        <strong>CLASSMATES</strong><small>{classCount || 39} trainees</small>
      </button>
      <button type="button" className="yb-book" onClick={onRomance}>
        <span className="yb-book-cover yb-cover-pink"><b>✦ LOVE RECORD ✦</b><Crest kind="rose" bg="#f0c2d3" /><small>Memento Amoris</small></span>
        <strong>LOVE RECORD</strong><small>{followedCount} of 6</small>
      </button>
    </div>
    <div className="yb-shelf-foot">Tap a book to open</div>
  </section>;
}

function BookCover({ title, motto, label, count, foot, kind, rose, onOpen }: { title: string; motto: string; label: string; count: string; foot: string; kind: "star" | "rose"; rose?: boolean; onOpen: () => void }) {
  return <button type="button" className={`yb-cover-page ${rose ? "rose" : ""}`} onClick={onOpen}>
    <div className="yb-title"><i>✦</i>{title}<i>✦</i></div>
    <div className="yb-cover-motto">{motto}</div>
    <Crest kind={kind} bg={rose ? "#f0c2d3" : "#0f0f0f"} />
    <strong>{label}</strong><span>{count}</span>
    <small>{foot}</small>
  </button>;
}

function Directory({ data, filter, page, onFilter, onPage, onOpen }: {
  data: YearbookData; filter: "all" | "A" | "B" | "C" | "D"; page: number;
  onFilter: (v: "all" | "A" | "B" | "C" | "D") => void; onPage: (v: number) => void; onOpen: (id: string) => void;
}) {
  const npcs = data.roster?.npcs ?? [];
  const matching = npcs.filter(n => filter === "all" || n.klass === filter);
  const pages = Math.max(1, Math.ceil(matching.length / 12));
  const visible = matching.slice((page - 1) * 12, page * 12);
  const roommates = new Set(data.career.roommates ?? []);
  return <div className="yb-directory">
    {!data.roster ? <div className="yb-empty">签约后，这里会收录同一期的练习生。</div> : <div className="yb-sheet yb-index-sheet">
      <Vine color="#1c1c1c" className="tl" /><Vine color="#1c1c1c" className="br" />
      <div className="yb-index-head">
        <h2 className="yb-title" style={{ fontSize: 20 }}><i>✦</i>Class of 2026<i>✦</i></h2>
        <span className="yb-cap">{npcs.length} trainees</span>
      </div>
      <div className="yb-filters">{(["all", "A", "B", "C", "D"] as const).map(v => <button type="button" key={v} className={filter === v ? "on" : ""} onClick={() => onFilter(v)}>{v === "all" ? "All" : `Class ${v}`}</button>)}</div>
      <div className="yb-grid">
        {visible.map(npc => {
          const id = npc.charId ?? npc.id;
          const person = playerContact(id, data);
          const profile = data.profiles[id] ?? getProfile(id);
          const isRoommate = Boolean(npc.charId && roommates.has(npc.charId));
          const withdrawn = profile.leave?.phase === "left";
          return <button type="button" className={`yb-mini ${withdrawn ? "withdrawn" : ""}`} key={npc.id} onClick={() => onOpen(id)}>
            <span className="yb-mini-photo">{person?.avatar ? <img src={person.avatar} alt="" /> : null}{isRoommate ? <i>ROOMMATE</i> : null}{withdrawn ? <b>WITHDRAWN</b> : null}</span>
            <strong>{person?.name ?? npc.name}</strong>
            {profile.enName ? <small>{profile.enName}</small> : null}
            <em>{npc.klass} 班 · {SUBJECT_LABEL[npc.specialty as Subject] ?? "—"}</em>
          </button>;
        })}
      </div>
      <div className="yb-pager"><button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>‹</button><span>{String(page).padStart(2, "0")} / {String(pages).padStart(2, "0")}</span><button type="button" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages}>›</button></div>
    </div>}
  </div>;
}

function Field({ label, value, english }: { label: string; value?: string | number; english?: boolean }) {
  return <div className="yb-field"><span>{label}</span><b className={english ? "english" : ""}>{value || "—"}</b></div>;
}
function Section({ title, zh, children }: { title: string; zh: string; children: React.ReactNode }) {
  return <section className="yb-section"><h3>{title}</h3><div className="yb-section-zh">{zh.split("").join(" ")}</div>{children}</section>;
}
function EmptyText({ children }: { children: React.ReactNode }) { return <div className="yb-empty-line">{children}</div>; }
function ProfileRow({ label, value, onEdit }: { label: string; value?: string; onEdit?: () => void }) {
  return (
    <tr className={onEdit ? "yb-editable" : undefined} onClick={onEdit}>
      <td>{label}</td>
      <td>{value?.trim() ? value : <span className="yb-missing">资料暂缺</span>}</td>
    </tr>
  );
}

type ProfileEditKey = "appearance" | "privateLines" | "familyBackground" | "tmi";
const PROFILE_EDIT_LABEL: Record<ProfileEditKey, string> = {
  appearance: "LOOKS", privateLines: "NATURE", familyBackground: "FAMILY", tmi: "TMI",
};

function ClassmatePage({ id, data, showPageBar = false }: { id: string; data: YearbookData; showPageBar?: boolean }) {
  const npc = npcByCharId(id, data);
  const char = playerContact(id, data);
  const profile = data.profiles[id] ?? getProfile(id);
  const [note, setNote] = useState(profile.note ?? "");
  useEffect(() => setNote(profile.note ?? ""), [id, profile.note]);
  // 她定的：点档案里的某一条（TMI/性格/家庭…）弹窗自己改；改过的 AI 重生成也不会覆盖
  const [editing, setEditing] = useState<{ key: ProfileEditKey; value: string } | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenUntil, setRegenUntil] = useState(0);
  const regenBusy = Date.now() < regenUntil;
  const openEdit = (key: ProfileEditKey, value: string) => setEditing({ key, value });
  const saveEdit = () => {
    if (!editing) return;
    const p = getProfile(id);
    const clean = editing.value.trim();
    const hand = [...new Set([...(p.handEdited ?? []), editing.key])];
    if (editing.key === "tmi") saveProfile({ ...p, tmi: clean ? clean.split(/\n+/).map(v => v.trim()).filter(Boolean).slice(0, 4) : [], handEdited: hand });
    else if (editing.key === "privateLines") saveProfile({ ...p, privateLines: clean ? clean.split(/\n+/).map(v => v.trim()).filter(Boolean).slice(0, 4) : [], handEdited: hand });
    else saveProfile({ ...p, [editing.key]: clean, handEdited: hand });
    setEditing(null);
  };
  // 她定的：点主页的头像 → 弹小面板，里面才有「补全资料」；页面上不放大按钮
  const onRegenerate = () => {
    queueProfileRegenerate(id);
    setRegenOpen(false);
    setRegenUntil(Date.now() + 6000);
  };
  const roommate = Boolean(data.career.roommates?.includes(id));
  const rosterIndex = data.roster?.npcs.findIndex(n => n.charId === id) ?? -1;
  const relation = relationOf(profile);
  const relationIndex = Math.max(0, RELATIONS.indexOf(relation as typeof RELATIONS[number]));
  const stats = npc?.stats;
  const friendIds = npc?.friends ?? [];
  const branches = data.branches.filter(b => b.charId === id);
  const records = data.months.flatMap(month => {
    const row = month.rows.find(r => r.id === npc?.id || r.id === id);
    return row ? [{ month, row }] : [];
  }).sort((a, b) => a.month.month.localeCompare(b.month.month));
  let previousClass = npc?.initialClass;
  const entryRecord = npc ? [{ key: `entry-${id}`, stamp: data.career.signedAt ? monthLabel(new Date(data.career.signedAt).toISOString().slice(0, 7)) : "JUL", text: `入社 · ${npc.initialClass} 班`, rank: "—" }] : [];
  const examRecords = records.map(({ month, row }) => {
    let text = "月末评价";
    const CLASS_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    if (row.klass && previousClass && row.klass !== previousClass) text = (CLASS_ORDER[row.klass] < CLASS_ORDER[previousClass]) ? `升入 ${row.klass} 班` : `降到 ${row.klass} 班`;
    else if (row.change.startsWith("↑")) text = `名次上升 ${row.change.slice(1)} 位`;
    else if (row.change.startsWith("↓")) text = `名次下降 ${row.change.slice(1)} 位`;
    if (row.klass) previousClass = row.klass as NpcRecord["klass"];
    return { key: month.nodeId || month.month, stamp: monthLabel(month.month), text, rank: `No. ${row.rank}` };
  });
  const recordsToShow = [...entryRecord, ...examRecords].reverse();
  const withdrawn = profile.leave?.phase === "left";
  const number = rosterIndex >= 0 ? String(rosterIndex + 1).padStart(2, "0") : "—";
  return <div className="yb-classmate">
    {showPageBar ? <div className="yb-pagebar"><button type="button" aria-label="返回">‹</button><span>No. {number}</span></div> : null}
    <div className="yb-sheet yb-student-sheet">
      <Vine color="#1c1c1c" className="tl" /><Vine color="#1c1c1c" className="br" />
      <section className="yb-student-card">
        <h2 className="yb-title" style={{ fontSize: 21 }}><i>✦</i>Student Card<i>✦</i></h2>
        <div className="yb-cap yb-card-cap">Trainee Yearbook · 2026</div>
        {withdrawn ? <div className="yb-withdrawn-band">WITHDRAWN · 已离开公司</div> : null}
        <div className="yb-portrait" role="button" tabIndex={0} aria-label="补全资料" onClick={() => setRegenOpen(true)}>
          {char?.avatar ? <img src={char.avatar} alt="" /> : <span>{char?.name?.slice(0, 1) ?? ""}</span>}
          {roommate ? <div className="yb-seal"><b>ROOM<br />MATE</b></div> : null}
        </div>
        <div className="yb-fields">
          <div className="yb-field-row"><Field label="NAME" value={char?.name} /></div>
          <div className="yb-field-row"><Field label="AGE" value={profile.age} english /><Field label="BIRTH" value={birth(npc?.birthday ?? profile.birthday)} english /></div>
          <div className="yb-field-row"><Field label="FROM" value={profile.nationality} /><Field label="HEIGHT" value={profile.heightCm ? `${profile.heightCm} cm` : ""} english /></div>
          <div className="yb-field-row"><Field label="CLASS" value={npc?.klass} english /><Field label="MAJOR" value={specialtyEn(npc?.specialty)} english /></div>
          <div className="yb-field-row"><Field label="MBTI" value={profile.mbti} english /><Field label="ENTRY" value={data.career.signedAt ? `${new Date(data.career.signedAt).getFullYear()} . ${String(new Date(data.career.signedAt).getMonth() + 1).padStart(2, "0")}` : ""} english /></div>
        </div>
        <div className="yb-motto">Train in Light · Endure the Dark · Remain a Star</div>
      </section>
    </div>

    <Section title="Ability" zh="属性">
      {stats ? <div className="yb-abilities">{(Object.keys(SUBJECT_LABEL) as Subject[]).map(subject => {
        const value = stats[subject];
        return <div className={`yb-ability ${npc?.specialty === subject ? "special" : ""}`} key={subject}>
          <div><span>{npc?.specialty === subject ? "✦ " : ""}{SUBJECT_LABEL[subject]}</span><b>{value}</b></div>
          <i><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i>
        </div>;
      })}</div> : <EmptyText>暂时没有能力记录。</EmptyText>}
    </Section>

    <Section title="Profile" zh="档案">
      <table className="yb-profile-table"><tbody>
        <ProfileRow label="LOOKS" value={profile.appearance} onEdit={() => openEdit("appearance", profile.appearance ?? "")} />
        <ProfileRow label="NATURE" value={profile.privateLines?.join("\n")} onEdit={() => openEdit("privateLines", profile.privateLines?.join("\n") ?? "")} />
        <ProfileRow label="FAMILY" value={profile.familyBackground} onEdit={() => openEdit("familyBackground", profile.familyBackground ?? "")} />
        <ProfileRow label="TMI" value={profile.tmi?.join("\n")} onEdit={() => openEdit("tmi", profile.tmi?.join("\n") ?? "")} />
      </tbody></table>
      <div className="yb-edit-hint">· 点上面的条目可以自己改{regenBusy ? " · 补全中…" : ""}</div>
    </Section>

    <Section title="Records" zh="月考">
      {recordsToShow.length ? <table className="yb-records"><tbody>{recordsToShow.map(row => <tr key={row.key}><td>{row.stamp}</td><td>{row.text}</td><td className="rank">{row.rank}</td></tr>)}</tbody></table> : <EmptyText>还没有月考记录。</EmptyText>}
    </Section>

    <Section title="Between Us" zh="我们">
      <div className="yb-scale">{RELATIONS.map((_, i) => <i key={i} className={i <= relationIndex ? "on" : ""} />)}</div>
      <div className="yb-scale-label"><span>跟你过不去</span><span>恋人</span></div>
      <div className="yb-current-relation">{relation.split("").join(" ")}</div>
      {profile.events?.length ? <table className="yb-records"><tbody>{[...profile.events].sort((a, b) => b.at - a.at).map(event => <tr key={event.id}><td>{shortDay(event.at)}</td><td colSpan={2}>{event.text}</td></tr>)}</tbody></table> : <EmptyText>你们还没有留下共同事件。</EmptyText>}
    </Section>

    <Section title="Her Circle" zh="她的朋友">
      {friendIds.length ? <div className="yb-friends">{(["好朋友", "朋友", "熟人"] as const).flatMap(tier => {
        // friends[].charId 指向名册内部的 Trainee.id；人物卡使用 NPC.charId。
        const names = friendIds.filter(f => f.tier === tier).map(f => {
          const friend = data.roster?.npcs.find(n => n.id === f.charId);
          return friend?.charId ? data.characters.find(c => c.id === friend.charId)?.name ?? friend.name : friend?.name;
        }).filter((name): name is string => Boolean(name));
        return names.length ? [<div key={tier}><span>{TIER_EN[tier]}</span>{names.join(" · ")}</div>] : [];
      })}</div> : <EmptyText>暂时没有同期朋友圈记录。</EmptyText>}
    </Section>

    <Section title="Stories" zh="她的故事">
      {branches.length ? <table className="yb-records"><tbody>{branches.flatMap(branch => (branch.history ?? []).map((event, i) => <tr key={`${branch.startedAt}-${i}`}><td>{shortDay(event.at)}</td><td>{event.text}</td><td className="rank">{branch.active ? "Open" : "Closed"}</td></tr>))}</tbody></table> : <EmptyText>还没有和她有关的同期支线。</EmptyText>}
    </Section>

    <Section title="My Note" zh="我的印象">
      <div className="yb-note"><textarea value={note} onChange={event => { const value = event.target.value; setNote(value); savePersonalNote(id, value); }} placeholder="这一页留给你写。" aria-label="我的印象" /><span>WRITE</span></div>
    </Section>
    <div className="yb-end">— No. {number} · Trainee Yearbook —</div>
    {editing ? (
      <div className="yb-edit-mask" onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
        <div className="yb-edit-sheet">
          <div className="yb-edit-head"><b>{PROFILE_EDIT_LABEL[editing.key]}</b><small>改完保存；改过的这条，AI 重新生成时不会覆盖</small></div>
          <textarea value={editing.value} rows={5} onChange={event => setEditing({ ...editing, value: event.target.value })} placeholder="写点什么…（TMI / NATURE 可以一行一条）" aria-label={PROFILE_EDIT_LABEL[editing.key]} />
          <div className="yb-edit-btns"><button type="button" onClick={() => setEditing(null)}>取消</button><button type="button" className="p" onClick={saveEdit}>保存</button></div>
        </div>
      </div>
    ) : null}
    {regenOpen ? (
      <div className="yb-edit-mask" onClick={e => { if (e.target === e.currentTarget) setRegenOpen(false); }}>
        <div className="yb-edit-sheet">
          <div className="yb-edit-head"><b>STUDENT PROFILE</b><small>资料不全或写得不好，都可以重新生成</small></div>
          <button type="button" className="yb-regen-row" onClick={onRegenerate}><span>✦ 补全资料</span><small>AI 重新写这一页</small></button>
          <div className="yb-edit-btns"><button type="button" onClick={() => setRegenOpen(false)}>取消</button></div>
        </div>
      </div>
    ) : null}
  </div>;
}

function FatesPage({ data, onOpen }: { data: YearbookData; onOpen: (type: RouteType) => void }) {
  const followed = ROUTE_TYPES.filter(type => data.lines[type]).length;
  return <div className="yb-fates">
    <div className="yb-sheet rose yb-fate-sheet">
      <Vine color="#e39ab6" className="tl" /><Vine color="#e39ab6" className="br" />
      <div className="yb-index-head"><h2 className="yb-title" style={{ fontSize: 20 }}><i>✦</i>Six Fates<i>✦</i></h2><span className="yb-cap">{followed} of 6 · followed</span></div>
      <div className="yb-six">{ROUTE_TYPES.map(type => {
        const line = data.lines[type];
        const char = line ? data.characters.find(c => c.id === line.charId) : undefined;
        return <button type="button" className={`yb-slot ${line ? "" : "empty"}`} key={type} onClick={() => line && onOpen(type)} disabled={!line}>
          <span className="yb-slot-photo">{line ? char?.avatar ? <img src={char.avatar} alt="" /> : <i>{char?.name?.slice(0, 1) ?? ""}</i> : <i>?</i>}
            {line ? <b>{ROUTE_EN[type]}</b> : null}</span>
          <strong>{line ? char?.name ?? "—" : "NOT YET"}</strong>
          {line ? <small>BOND<em>{line.bond}</em></small> : null}
        </button>;
      })}</div>
      <div className="yb-pager"><span>— Memento Amoris —</span></div>
    </div>
  </div>;
}

function FatePage({ type, data }: { type: RouteType; data: YearbookData }) {
  const line = data.lines[type];
  if (!line) return <div className="yb-fates"><EmptyText>这条故事还没有开始。</EmptyText></div>;
  const char = data.characters.find(c => c.id === line.charId);
  const profile = data.profiles[line.charId] ?? getProfile(line.charId);
  const nodeDate = (key: string) => {
    const candidates = data.career.nodes.filter(n => n.note === `情缘节点：${key}` || (key === "mutual_reveal" && n.note?.startsWith("情缘节点：mutual_reveal#")));
    return candidates.sort((a, b) => (b.doneAt ?? b.dueAt) - (a.doneAt ?? a.dueAt))[0]?.doneAt ?? candidates[0]?.dueAt;
  };
  const history = [...line.history].sort((a, b) => b.at - a.at).slice(0, 6);
  const metAt = profile.metAt?.at;
  return <div className="yb-fate-page">
    <div className="yb-sheet rose yb-romance-sheet">
      <Vine color="#e39ab6" className="tl" /><Vine color="#e39ab6" className="br" />
      <section className="yb-student-card">
        <h2 className="yb-title" style={{ fontSize: 21 }}><i>✦</i>Fate Card<i>✦</i></h2>
        <div className="yb-cap yb-card-cap">Love Record · 2026</div>
        <div className="yb-portrait">
          {char?.avatar ? <img src={char.avatar} alt="" /> : <span>{char?.name?.slice(0, 1) ?? ""}</span>}
          <div className="yb-seal fate-seal"><small>FATE</small><b>✦</b></div>
        </div>
        <div className="yb-fields">
          <div className="yb-field-row"><Field label="NAME" value={char?.name} /></div>
          <div className="yb-field-row"><Field label="AGE" value={profile.age} english /><Field label="BIRTH" value={birth(profile.birthday)} english /></div>
          <div className="yb-field-row"><Field label="FROM" value={profile.nationality} /><Field label="HEIGHT" value={profile.heightCm ? `${profile.heightCm} cm` : ""} english /></div>
          <div className="yb-field-row"><Field label="MBTI" value={profile.mbti} english /><Field label="MET" value={day(metAt)} english /></div>
          <div className="yb-field-row"><Field label="LINE" value={ROUTE_EN[type]} english /><Field label="BOND" value={line.bond} english /></div>
        </div>
        <div className="yb-motto">Meet by Chance · Stay by Choice · Remember Always</div>
      </section>
    </div>

    <Section title="Chapters" zh="我们的故事">
      <div className="yb-chapters">{ROUTE_NODES[type].map((node, index) => {
        const done = line.doneNodes.includes(node.key);
        return <div className={`yb-chapter ${done ? "" : "locked"}`} key={node.key}><span>{roman(index + 1)}</span><b>{done ? node.title : "? ? ?"}</b><time>{done ? shortDay(nodeDate(node.key)) : ""}</time></div>;
      })}</div>
    </Section>

    <Section title="Between Us" zh="我们">
      {(() => { const rel = relationOf(profile); const ix = Math.max(0, RELATIONS.indexOf(rel as typeof RELATIONS[number])); return <>
        <div className="yb-scale romance">{RELATIONS.map((_, i) => <i key={i} className={i <= ix ? "on" : ""} />)}</div><div className="yb-scale-label"><span>跟你过不去</span><span>恋人</span></div><div className="yb-current-relation">{rel.split("").join(" ")}</div>
      </>; })()}
    </Section>

    <Section title="Bond" zh="羁绊">
      {history.length ? <table className="yb-records"><tbody>{history.map((event, i) => <tr key={`${event.at}-${i}`}><td>{shortDay(event.at)}</td><td>{event.type === "meet" ? "见面" : event.type === "call" ? "电话" : "KKT 聊天"}</td><td className="rank">+{event.d}</td></tr>)}</tbody></table> : <EmptyText>还没有羁绊记录。</EmptyText>}
    </Section>
    <div className="yb-end">— {ROUTE_EN[type]} · Love Record —</div>
  </div>;
}
