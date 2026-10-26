"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, RefreshCw, Trash2 } from "lucide-react";

import {
  CAREER_EVENT,
  COMPANIES,
  acceptOffer,
  companyOf,
  declineOffer,
  expandInsider,
  loadCareer,
  requestNodeScene,
  saveCareer,
  type CareerNode,
} from "@/lib/idol-career";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n: number) => String(n).padStart(2, "0");
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function useCareer() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener(CAREER_EVENT, bump);
    const timer = window.setInterval(bump, 10000);
    return () => { window.removeEventListener(CAREER_EVENT, bump); window.clearInterval(timer); };
  }, []);
  return loadCareer();
}

/** 提醒事项（发动机看得见的那一面）：你走到哪一步、谁来找你、接下来有什么、你的公司 */
export function CareerApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
  const career = useCareer();
  const [tab, setTab] = useState<"now" | "company">("now");
  const [regen, setRegen] = useState(false);
  const [editInsider, setEditInsider] = useState<string | null>(null);
  const company = companyOf(career.companyId);
  const now = Date.now();
  const offers = career.offers.filter(o => o.status === "new" && now >= o.at);
  const upcoming = career.nodes.filter(n => n.status === "pending").sort((a, b) => a.dueAt - b.dueAt);
  const past = career.nodes.filter(n => n.status !== "pending").sort((a, b) => b.dueAt - a.dueAt).slice(0, 8);

  // 先关掉自己再开剧情，不然打开的剧情会被一起关掉
  const go = (n: CareerNode) => { onClose(); window.setTimeout(() => requestNodeScene(n), 50); };

  return (
    <div className="cr-app">
      <div className="cr-top">
        <button type="button" className="cr-circle" onClick={onClose} aria-label="返回"><ChevronLeft size={22} /></button>
        <b>提醒事项</b>
        <span style={{ width: 40 }} />
      </div>
      <div className="cr-seg">
        <button type="button" className={tab === "now" ? "on" : ""} onClick={() => setTab("now")}>日程</button>
        <button type="button" className={tab === "company" ? "on" : ""} onClick={() => setTab("company")}>公司</button>
      </div>

      {tab === "now" ? (
        <div className="cr-page">
          <div className="cr-card">
            <div className="cr-k">你现在</div>
            <div className="cr-v">{career.stage === "trainee" && company ? `${company.name} 练习生` : "还没进公司"}</div>
            {career.signedAt ? <div className="cr-sub">{when(career.signedAt).split(" ").slice(0, 2).join(" ")} 签约</div> : null}
          </div>

          {offers.length ? <div className="cr-title">找你的公司</div> : null}
          {offers.map(o => {
            const c = companyOf(o.companyId)!;
            return (
              <div key={o.id} className="cr-card">
                <div className="cr-k"><span>{c.name} · {o.kind === "scout" ? "试镜邀请" : "试镜通知"}</span><span>{when(o.at)}</span></div>
                <div className="cr-v">{o.message}</div>
                <div className="cr-sub">{c.scale} · {c.style}</div>
                <div className="cr-btns">
                  <button type="button" onClick={() => { declineOffer(o.id); onNotice?.(`婉拒了 ${c.name}`); }}>婉拒</button>
                  <button type="button" className="is-strong" onClick={() => { const n = acceptOffer(o.id); if (n) onNotice?.(`${c.name} 试镜：${when(n.dueAt)}，写进日历了`); }}>去试镜</button>
                </div>
              </div>
            );
          })}

          <div className="cr-title">接下来</div>
          {upcoming.length ? upcoming.slice(0, 8).map(n => (
            <div key={n.id} className="cr-row">
              <div>
                <div className="cr-v">{n.title}</div>
                <div className="cr-sub">{when(n.dueAt)} · {n.place}</div>
              </div>
              <button type="button" className={now >= n.dueAt - 3600e3 ? "is-strong" : ""} onClick={() => go(n)}>{now >= n.dueAt - 3600e3 ? "去演" : "提前演"}</button>
            </div>
          )) : <p className="cr-empty">{career.stage === "pre" ? "还没有安排。公司来找你的时候会提醒你。" : "暂时没有"}</p>}

          {past.length ? (
            <>
              <div className="cr-title">过去的</div>
              {past.map(n => (
                <div key={n.id} className="cr-row is-dim">
                  <div>
                    <div className="cr-v">{n.title}</div>
                    <div className="cr-sub">{when(n.dueAt)} · {n.status === "done" ? "演过了" : "没演，平常地过去了"}</div>
                  </div>
                </div>
              ))}
            </>
          ) : null}
        </div>
      ) : (
        <div className="cr-page">
          {company ? (
            <>
              <div className="cr-card">
                <div className="cr-k">你的公司</div>
                <div className="cr-v cr-big">{company.name}</div>
                <div className="cr-sub">{company.scale}</div>
                <div className="cr-v">{company.style}</div>
                <div className="cr-sub">练习生：{company.trainee}</div>
                <div className="cr-sub">名声：{company.fame}</div>
              </div>
              <div className="cr-card">
                <div className="cr-k">
                  <span>公司内部档案</span>
                  <span className="cr-k-btns">
                    {editInsider == null ? <button type="button" onClick={() => setEditInsider(career.insider || "")}>改</button> : null}
                    <button type="button" disabled={regen} onClick={async () => {
                      setRegen(true);
                      try { const insider = await expandInsider(company); saveCareer({ ...loadCareer(), insider }); onNotice?.("重新写好了"); }
                      catch (e) { onNotice?.(e instanceof Error ? e.message : "没写成"); }
                      finally { setRegen(false); }
                    }}><RefreshCw size={13} /> {regen ? "在写…" : career.insider ? "重新生成" : "生成"}</button>
                  </span>
                </div>
                {editInsider != null ? (
                  <>
                    <textarea className="cr-text" rows={14} value={editInsider} onChange={e => setEditInsider(e.target.value)} />
                    <div className="cr-btns">
                      <button type="button" onClick={() => setEditInsider(null)}>取消</button>
                      <button type="button" className="is-strong" onClick={() => { saveCareer({ ...loadCareer(), insider: editInsider }); setEditInsider(null); onNotice?.("存好了"); }}>存</button>
                    </div>
                  </>
                ) : (
                  <div className="cr-v cr-pre">{career.insider || "签约时 AI 会照这家公司的风格写一份：楼里、宿舍、一周作息、规矩。"}</div>
                )}
              </div>
              <div className="cr-card">
                <div className="cr-k">戏里定下来的细节</div>
                {career.facts.length ? career.facts.map(f => (
                  <div key={f} className="cr-fact">
                    <span>{f}</span>
                    <button type="button" aria-label="删除" onClick={() => saveCareer({ ...loadCareer(), facts: loadCareer().facts.filter(x => x !== f) })}><Trash2 size={14} /></button>
                  </div>
                )) : <div className="cr-sub">还没有。演戏时冒出来的公司细节会记在这里。</div>}
              </div>
            </>
          ) : (
            <>
              <p className="cr-empty">还没进公司。这是这个世界里的公司：</p>
              {COMPANIES.map(c => (
                <div key={c.id} className="cr-card">
                  <div className="cr-v cr-big">{c.name}</div>
                  <div className="cr-sub">{c.scale}</div>
                  <div className="cr-v">{c.style}</div>
                  <div className="cr-sub">练习生：{c.trainee}</div>
                  <div className="cr-sub">招人：{c.recruit}</div>
                  <div className="cr-sub">名声：{c.fame}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
