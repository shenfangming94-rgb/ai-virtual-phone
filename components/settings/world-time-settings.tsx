"use client";

import { useEffect, useState } from "react";

import { Toggle } from "@/components/ui/form";
import { jumpWorld, switchWorldClockMode } from "@/lib/idol-reminders";
import { loadWorldClock, subscribeWorldClock } from "@/lib/world-clock";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const HOUR = 3600e3;
const DAY = 24 * HOUR;

/** 世界时间：爱豆小手机默认用虚拟时间，这里定现在是几点、拨快、或者改回跟现实一致 */
export function WorldTimeSettings({ onNotice }: { onNotice?: (message: string) => void }) {
    const [clock, setClock] = useState(loadWorldClock);
    const [now, setNow] = useState(() => new Date());
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");

    useEffect(() => {
        const tick = window.setInterval(() => setNow(new Date()), 1000);
        const off = subscribeWorldClock(() => { setClock(loadWorldClock()); setNow(new Date()); });
        return () => { window.clearInterval(tick); off(); };
    }, []);

    useEffect(() => {
        const d = new Date();
        setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    }, [clock]);

    const apply = () => {
        const target = new Date(`${date}T${time || "00:00"}:00`);
        if (!date || Number.isNaN(target.getTime())) { onNotice?.("日期没填对"); return; }
        const stopped = jumpWorld(target.getTime());
        onNotice?.(stopped || `现在是 ${target.getFullYear()} 年 ${target.getMonth() + 1} 月 ${target.getDate()} 日 ${pad(target.getHours())}:${pad(target.getMinutes())}`);
    };
    const shift = (ms: number, label: string) => { onNotice?.(jumpWorld(Date.now() + ms) || label); };
    const nextMorning = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(8, 0, 0, 0);
        const stopped = jumpWorld(d.getTime());
        onNotice?.(stopped || "到第二天早上 8 点了");
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="app-card" style={{ padding: "22px 20px", textAlign: "center" }}>
                <div className="menu-desc">{clock.real ? "跟现实时间一致" : "世界时间"}</div>
                <div style={{ fontSize: 15, marginTop: 6 }}>
                    {now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日 星期{WEEK[now.getDay()]}
                </div>
                <div style={{ fontSize: 44, fontWeight: 300, letterSpacing: 1, fontVariantNumeric: "tabular-nums" }}>
                    {pad(now.getHours())}:{pad(now.getMinutes())}
                </div>
            </div>

            <div className="app-card card-featured settings-toggle-card">
                <div className="card-featured-body">
                    <div className="card-featured-label">跟现实时间一致</div>
                    <div className="card-featured-desc">关着的时候小手机用世界时间；打开就回到现实时间，再关掉会回到原来的世界时间</div>
                </div>
                <Toggle checked={clock.real} onChange={next => { const stopped = switchWorldClockMode(next); setClock(loadWorldClock()); onNotice?.(stopped || (next ? "已经跟现实时间一致" : "回到世界时间")); }} className="settings-toggle-control" />
            </div>

            {!clock.real ? (
                <>
                    <div className="app-card" style={{ padding: 16 }}>
                        <div className="card-featured-label">现在是</div>
                        <div className="card-featured-desc" style={{ marginBottom: 10 }}>定好之后世界时间会跟着现实一起走</div>
                        <div className="flex gap-2">
                            <input className="ui-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: 3 }} />
                            <input className="ui-input" type="time" value={time} onChange={e => setTime(e.target.value)} style={{ flex: 2 }} />
                        </div>
                        <button type="button" className="ui-btn" style={{ width: "100%", marginTop: 10 }} onClick={apply}>就是这个时间</button>
                    </div>

                    <div className="app-card" style={{ padding: 16 }}>
                        <div className="card-featured-label">往后拨</div>
                        <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
                            <button type="button" className="ui-btn" onClick={() => shift(HOUR, "过了 1 小时")}>1 小时</button>
                            <button type="button" className="ui-btn" onClick={() => shift(6 * HOUR, "过了 6 小时")}>6 小时</button>
                            <button type="button" className="ui-btn" onClick={() => shift(DAY, "过了 1 天")}>1 天</button>
                            <button type="button" className="ui-btn" onClick={() => shift(7 * DAY, "过了 1 周")}>1 周</button>
                            <button type="button" className="ui-btn" onClick={nextMorning}>第二天早上</button>
                        </div>
                    </div>
                </>
            ) : null}

            <p className="menu-desc" style={{ padding: "0 6px" }}>
                之前的聊天记录停在当时的时间，不会跟着跳。正开着的自定义 app（微博、bubble 这些）要关掉重开才跟上新时间。
            </p>
        </div>
    );
}
