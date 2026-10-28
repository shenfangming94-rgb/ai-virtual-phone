"use client";

/**
 * 我的名片上的「关注度证」（跟练习生证同款，薄荷绿），点开是液态玻璃的详情页。
 * 数据在 lib/idol-fame.ts。
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

import { FAME_EVENT, FAME_TIERS, fameState, fameTier, heatIn, setFameTotal, type FameLog } from "@/lib/idol-fame";

const DAY = 864e5;
const md = (ms: number) => `${new Date(ms).getMonth() + 1}月${new Date(ms).getDate()}日`;
const SIZE: Record<string, string> = { small: "小事", medium: "中事", big: "大事", debut: "出道", start: "开局", manual: "自己改", cool: "" };

function useFame() {
  const [, set] = useState(0);
  useEffect(() => {
    const bump = () => set(x => x + 1);
    window.addEventListener(FAME_EVENT, bump);
    const t = window.setInterval(bump, 30000);
    return () => { window.removeEventListener(FAME_EVENT, bump); window.clearInterval(t); };
  }, []);
  return fameState();
}

function Meter({ pop, heat }: { pop: number; heat: number }) {
  return (
    <div className="fm-meter">
      <div className="b" style={{ width: `${Math.min(100, pop)}%` }} />
      <div className="h" style={{ left: `${Math.min(100, pop)}%`, width: `${Math.max(0, Math.min(100 - pop, heat))}%` }} />
      <div className="tk" style={{ left: "20%" }} />
      <div className="tk" style={{ left: "50%" }} />
    </div>
  );
}

function deltaText(l: FameLog): string {
  const parts: string[] = [];
  if (l.size === "start") return `人气 ${l.pop}`;
  if (l.heat) parts.push(`热度 ${l.heat > 0 ? "+" : "−"}${Math.abs(l.heat)}`);
  if (l.pop) parts.push(`人气 ${l.pop > 0 ? "+" : "−"}${Math.abs(l.pop)}`);
  return parts.join(" · ");
}

export function FameCardBlock() {
  const f = useFame();
  const [open, setOpen] = useState(false);
  const tier = fameTier(f.total);
  const next = FAME_TIERS.find(t => t.min > f.total);
  const last = f.log[f.log.length - 1];
  const stampAt = last?.until ?? last?.at;
  const host = typeof document !== "undefined" ? document.querySelector(".ct-app") : null;
  return (
    <div className="ct-block">
      <div className="ct-k"><span>关注度</span><span>›</span></div>
      <button type="button" className="fm-id" onClick={() => setOpen(true)}>
        <div className="fm-id-top"><b>인지도</b><s>关注度 · RECOGNITION</s></div>
        <div className="fm-id-in">
          <div className="fm-n"><b>{f.total}</b><span>{tier.name}</span></div>
          <div className="fm-scale">
            {FAME_TIERS.map((t, i) => <div key={t.name} className={t.name === tier.name ? "on" : ""} style={{ width: `${((FAME_TIERS[i + 1]?.min ?? 100) - t.min)}%` }}>{t.name === tier.name ? <>{t.name}<br />{t.range}</> : null}</div>)}
          </div>
          <Meter pop={f.pop} heat={f.heat} />
          <div className="fm-legend"><span><i className="p" />人气 {f.pop}</span><span><i className="h" />热度 {f.heat}（会退）</span>{next ? <span className="r">差 {next.min - f.total} 分到「{next.name}」</span> : null}</div>
          {stampAt ? <div className="fm-stamp"><b>確認</b>{String(new Date(stampAt).getMonth() + 1).padStart(2, "0")}.{String(new Date(stampAt).getDate()).padStart(2, "0")}</div> : null}
        </div>
      </button>
      {open && host ? createPortal(<FameDetail onClose={() => setOpen(false)} />, host) : null}
    </div>
  );
}

function FameDetail({ onClose }: { onClose: () => void }) {
  const f = useFame();
  const tier = fameTier(f.total);
  const [all, setAll] = useState(false);
  const [val, setVal] = useState(f.total);
  useEffect(() => { setVal(f.total); }, [f.total]);
  const now = Date.now();
  const start = f.log.find(l => l.size === "start");
  const rest = f.log.filter(l => l.size !== "start").slice().sort((a, b) => (b.until ?? b.at) - (a.until ?? a.at));
  const shown = all ? rest : rest.filter(l => now - (l.until ?? l.at) <= 30 * DAY);
  return (
    <div className="fm-full">
      <div className="fm-full-in">
        <div className="fm-top"><button type="button" className="fm-circ" onClick={onClose} aria-label="返回"><ChevronLeft size={22} /></button><b>关注度</b><span style={{ width: 44 }} /></div>
        <div className="fm-cd">
          <div className="fm-big"><b>{f.total}</b><span>{tier.name}</span></div>
          <Meter pop={f.pop} heat={f.heat} />
          <div className="fm-sub"><span><i className="p" />人气 {f.pop}</span><span><i className="h" />热度 {f.heat}{f.heat ? ` · 两周后约剩 ${heatIn(14)}` : ""}</span></div>
        </div>
        <div className="fm-cd">
          <div className="fm-k">咖位</div>
          {FAME_TIERS.map(t => <div key={t.name} className={`fm-tr${t.name === tier.name ? " on" : ""}`}><b>{t.range}</b>{t.name}</div>)}
        </div>
        <div className="fm-cd">
          <div className="fm-k">最近的变化</div>
          {shown.map((l, i) => (
            <div className="fm-row" key={i}>
              <span>{l.text}<small>{l.until ? `${md(l.at)}～${md(l.until)}` : md(l.at)}{SIZE[l.size ?? ""] ? ` · ${SIZE[l.size ?? ""]}` : ""}</small></span>
              <b className={l.heat < 0 || l.pop < 0 ? "dn" : ""}>{deltaText(l)}</b>
            </div>
          ))}
          {!shown.length ? <div className="fm-none">近 30 天没什么动静</div> : null}
          {!all && rest.length > shown.length ? <button type="button" className="fm-more" onClick={() => setAll(true)}>看更早的</button> : null}
          {start ? <div className="fm-row"><span>{start.text}<small>{md(start.at)}</small></span><b>{deltaText(start)}</b></div> : null}
        </div>
        <div className="fm-cd">
          <div className="fm-k"><span>自己改</span><em>世界算得不对就拖一下</em></div>
          <input type="range" min={0} max={100} value={val} onChange={e => setVal(+e.target.value)} className="fm-range" />
          <button type="button" className="fm-btn" disabled={val === f.total} onClick={() => setFameTotal(val)}>改成 {val}</button>
        </div>
      </div>
    </div>
  );
}
