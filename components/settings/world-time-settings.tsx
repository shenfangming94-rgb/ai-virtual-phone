"use client";

import { useEffect, useState } from "react";

import { Toggle } from "@/components/ui/form";
import { jumpWorld, switchWorldClockMode } from "@/lib/idol-reminders";
import { loadWorldClock, subscribeWorldClock } from "@/lib/world-clock";
import { Clock, ChevronRight } from "lucide-react";
import { SettingsPageIntro } from "./settings-page-intro";

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
        <div className="settings-apple-worldtime">
            <SettingsPageIntro icon={Clock} title="世界时间" description="在这里，按你的节奏生活。" color="#007aff" />
            <section className="settings-apple-group">
                <div className="settings-apple-row settings-apple-toggle-row">
                    <span className="settings-apple-row-copy"><span className="settings-apple-row-title">与现实时间一致</span></span>
                    <Toggle checked={clock.real} onChange={next => { const stopped = switchWorldClockMode(next); setClock(loadWorldClock()); onNotice?.(stopped || (next ? "已经跟现实时间一致" : "回到世界时间")); }} className="settings-apple-switch" />
                </div>
            </section>
            <p className="settings-apple-footnote">关闭时使用世界时间。离开小手机后，世界会暂停，回来再继续。</p>

            {!clock.real ? (
                <>
                    <p className="settings-apple-caption">当前世界</p>
                    <section className="settings-apple-group settings-apple-time-fields">
                        <label><span>日期</span><input aria-label="世界日期" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                        <label><span>时间</span><input aria-label="世界时间" type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
                    </section>
                    <button type="button" className="settings-apple-action-row" onClick={apply}>使用这个日期和时间<ChevronRight size={17} /></button>

                    <p className="settings-apple-caption">往后拨</p>
                    <section className="settings-apple-group settings-apple-jump-list">
                        <button type="button" onClick={() => shift(HOUR, "过了 1 小时")}>1 小时<ChevronRight size={17} /></button>
                        <button type="button" onClick={() => shift(6 * HOUR, "过了 6 小时")}>6 小时<ChevronRight size={17} /></button>
                        <button type="button" onClick={() => shift(DAY, "过了 1 天")}>1 天<ChevronRight size={17} /></button>
                        <button type="button" onClick={() => shift(7 * DAY, "过了 1 周")}>1 周<ChevronRight size={17} /></button>
                        <button type="button" onClick={nextMorning}>第二天早上<ChevronRight size={17} /></button>
                    </section>
                </>
            ) : (
                <section className="settings-apple-group settings-apple-clock-summary">
                    <span>现在</span>
                    <strong>{now.getFullYear()}/{pad(now.getMonth() + 1)}/{pad(now.getDate())}　{pad(now.getHours())}:{pad(now.getMinutes())}　星期{WEEK[now.getDay()]}</strong>
                </section>
            )}
            <p className="settings-apple-footnote settings-apple-time-ending">之前的聊天记录保留发生时的时间。</p>
        </div>
    );
}
