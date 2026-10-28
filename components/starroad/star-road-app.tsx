"use client";

/**
 * 爱豆小手机：星路。手帐样子照 docs/idol/mockups/destiny/starroad-v2（她定稿）：
 * 第一页成绩单（点等级看还差多少、加练），第二页命运图鉴（八张，没翻开的是暗红玫瑰原图）。
 * 规矩和数据在 lib/idol-starroad.ts。
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { STARROAD_EVENT, addPractice, loadGrades, practicedToday, starroadReady, type GradeView } from "@/lib/idol-starroad";
import { CAREER_EVENT, companyOf, loadCareer } from "@/lib/idol-career";
import { loadTraineeCard } from "@/lib/trainee-card";

type Notice = ((m: string) => void) | undefined;
type Page = "transcript" | "destiny";

const DAY = 864e5;
const ym = (t: number) => `${new Date(t).getFullYear()}.${String(new Date(t).getMonth() + 1).padStart(2, "0")}`;
const ymd = (t: number) => `${ym(t)}.${String(new Date(t).getDate()).padStart(2, "0")}`;

function useTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set(x => x + 1);
    window.addEventListener(STARROAD_EVENT, f);
    window.addEventListener(CAREER_EVENT, f);
    return () => { window.removeEventListener(STARROAD_EVENT, f); window.removeEventListener(CAREER_EVENT, f); };
  }, []);
}

function Vine({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="sr-vine" style={style} viewBox="0 0 26 70" aria-hidden>
      <path d="M13 70 C11 50 15 30 12 2" stroke="currentColor" fill="none" strokeWidth="1" />
      <path d="M12 14 c-8 -4 -8 -12 -2 -14 c3 5 4 10 2 14z M13 30 c8 -3 9 -11 3 -14 c-3 5 -4 10 -3 14z M12 46 c-8 -3 -9 -11 -3 -14 c3 5 4 10 3 14z" stroke="currentColor" fill="var(--sr-paper)" strokeWidth=".9" />
      <circle cx="18" cy="40" r="1.6" fill="none" stroke="currentColor" strokeWidth=".8" />
    </svg>
  );
}

export function StarRoadApp({ onClose, onNotice }: { onClose: () => void; onNotice?: Notice }) {
  useTick();
  const [page, setPage] = useState<Page>("transcript");
  const [pick, setPick] = useState<GradeView | null>(null);
  const ready = starroadReady();
  const card = loadTraineeCard();
  const career = loadCareer();
  const company = companyOf(career.companyId);
  const grades = loadGrades();
  const days = career.signedAt ? Math.max(1, Math.floor((Date.now() - career.signedAt) / DAY) + 1) : 0;

  return (
    <div className="sr-app">
      <button type="button" className="sr-back" onClick={onClose} aria-label="返回"><ChevronLeft size={20} /></button>
      <div className="sr-book">
        <div className="sr-cover" />
        <div className="sr-tabs">
          <button type="button" className={page === "transcript" ? "on" : ""} onClick={() => setPage("transcript")}>TRANSCRIPT</button>
          <button type="button" className={page === "destiny" ? "on" : ""} onClick={() => setPage("destiny")}>DESTINY</button>
          <span className="ghost">· · ·</span>
        </div>
        <div className="sr-page">
          {page === "transcript" ? (
            <div className="sr-in sr-transcript">
              <div className="sr-frame" />
              <div className="sr-wm" />
              <Vine style={{ left: -9, top: 26 }} />
              <Vine style={{ right: -9, bottom: 16, transform: "scaleX(-1)" }} />
              <h1><b>✦</b>STAR ROAD<b>✦</b></h1>
              <div className="sr-sub">TRAINEE TRANSCRIPT</div>
              <div className="sr-info">
                <div className="sr-fields">
                  <div>NAME<u>{card?.name || " "}</u></div>
                  <div>BIRTH<u>{card?.birthday ? card.birthday.replace(/-/g, ".") : " "}</u></div>
                  <div>AGENCY<u>{company?.name || " "}</u></div>
                  <div>SINCE<u>{career.signedAt ? ymd(career.signedAt) : " "}</u></div>
                  <div>DAY<u>{days ? `第 ${days} 天` : " "}</u></div>
                </div>
                <div className="sr-photo">{card?.photo ? <img src={card.photo} alt="" /> : null}</div>
              </div>
              <table className="sr-table">
                <thead><tr><th>SUBJECT</th><th>GRADE</th><th>REMARKS</th></tr></thead>
                <tbody>
                  {grades.map(g => (
                    <tr key={g.id}>
                      <td className="s">{g.en}<small>{g.zh}</small></td>
                      <td className="g"><button type="button" disabled={!ready} onClick={() => setPick(g)}>{ready ? g.grade : "–"}</button></td>
                      <td className="r">{g.last ? <><span className={g.last.dir === "up" ? "up" : "dn"}>{g.last.dir === "up" ? "↑" : "↓"}</span> {ym(g.last.at)}</> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!ready ? <div className="sr-note">进了公司，成绩单才开始记</div> : null}
              <div className="sr-motto">SHINE BRIGHT · ENDURE · REACH THE STAGE</div>
            </div>
          ) : (
            <DestinyPage />
          )}
        </div>
        <div className="sr-rings">{Array.from({ length: 18 }, (_, i) => <i key={i} />)}</div>
      </div>
      {pick ? <GradeSheet g={grades.find(x => x.id === pick.id) ?? pick} onClose={() => setPick(null)} onNotice={onNotice} /> : null}
    </div>
  );
}

function GradeSheet({ g, onClose, onNotice }: { g: GradeView; onClose: () => void; onNotice?: Notice }) {
  const done = practicedToday();
  const next = g.grade === "A" ? null : ["F", "D", "C", "B", "A"][["F", "D", "C", "B", "A"].indexOf(g.grade) + 1];
  const line = g.grade === "A" ? "已经是 A 了，保持住"
    : g.left > 0 ? `离 ${next} 还差 ${g.left} 次加练`
    : g.waitDays > 0 ? `攒够了，再过 ${g.waitDays} 天升 ${next}` : `马上升 ${next}`;
  return (
    <div className="sr-mask" onClick={onClose}>
      <div className="sr-sheet" onClick={e => e.stopPropagation()}>
        <div className="sr-sh-head"><span className="sr-sh-en">{g.en}</span><span className="sr-sh-zh">{g.zh}</span><span className="sr-sh-g">{g.grade}</span></div>
        <div className="sr-sh-line">{line}</div>
        {g.last ? <div className="sr-sh-last">{ym(g.last.at)} {g.last.from} → {g.last.to}</div> : null}
        <div className="sr-sh-tip">上课会慢慢涨，老师的作业涨得多，加练最快。</div>
        <button type="button" className="sr-sh-btn" disabled={done} onClick={() => {
          const n = addPractice(g.id);
          if (!n) { onNotice?.("今天已经加练过了"); return; }
          const d = new Date(n.dueAt);
          onNotice?.(`记进提醒事项了：${d.getDate() === new Date().getDate() ? "今晚" : "明晚"} 21:00 加练${g.zh}`);
          onClose();
        }}>{done ? "今天加练过了" : "加练"}</button>
      </div>
    </div>
  );
}

/** 命运图鉴：两列四排，八张一页 */
function DestinyPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(96);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const h = el.clientHeight - 74, w = el.clientWidth;
      setCw(Math.floor(Math.min((w - 34) / 2.25, (h - 30) / (4 * 1752 / 1179))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cards: ({ title: string; en: string; color: string } | null)[] = Array.from({ length: 8 }, () => null);
  const met = cards.filter(Boolean).length;
  return (
    <div className="sr-in sr-destiny" ref={ref}>
      <div className="sr-stars">✦ ☆ ✦</div>
      <div className="sr-dhead"><span>destiny.</span><span>已遇见 {met} / ？</span></div>
      <div className="sr-album" style={{ gridTemplateColumns: `${cw}px ${cw}px` }}>
        {cards.map((c, i) => c ? (
          <div key={i} className="sr-card" style={{ background: c.color }}>
            <div className="d" /><div className="l" />
            <div className="no">No.{String(i + 1).padStart(2, "0")}</div>
            <div className="t">{c.title}</div><div className="en">{c.en}</div>
          </div>
        ) : <div key={i} className="sr-card lock" />)}
      </div>
    </div>
  );
}
