"use client";

import { useEffect, useRef, useState } from "react";

import {
  LOCK_CHANGED_EVENT,
  LOCK_NOW_EVENT,
  imageFileToWallpaper,
  loadLock,
  loadLockWallpaper,
  saveLock,
  saveLockWallpaper,
  type LockSettings as LockState,
} from "@/lib/lock-screen";

/** 锁屏：壁纸、样式、字、密码 */
export function LockSettings({ onNotice }: { onNotice?: (message: string) => void }) {
  const [lock, setLock] = useState<LockState>(loadLock);
  const [wallpaper, setWallpaper] = useState<string | null>(loadLockWallpaper);
  const [setting, setSetting] = useState<null | { len: 4 | 6; first: string; value: string }>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => { setLock(loadLock()); setWallpaper(loadLockWallpaper()); };
    window.addEventListener(LOCK_CHANGED_EVENT, sync);
    return () => window.removeEventListener(LOCK_CHANGED_EVENT, sync);
  }, []);

  const patch = (p: Partial<LockState>) => setLock(saveLock(p));

  const pickWallpaper = async (file: File | undefined) => {
    if (!file) return;
    try {
      saveLockWallpaper(await imageFileToWallpaper(file));
      onNotice?.("锁屏壁纸换好了");
    } catch {
      onNotice?.("这张图片读不出来");
    }
  };

  const typeCode = (value: string) => {
    if (!setting) return;
    const v = value.replace(/\D/g, "").slice(0, setting.len);
    if (v.length < setting.len) { setSetting({ ...setting, value: v }); return; }
    if (!setting.first) { setSetting({ ...setting, first: v, value: "" }); return; }
    if (v !== setting.first) { onNotice?.("两次不一样，重新输一遍"); setSetting({ ...setting, first: "", value: "" }); return; }
    patch({ code: v });
    setSetting(null);
    onNotice?.("密码设好了");
  };

  const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 } as const;
  const seg = (on: boolean) => ({ flex: 1, opacity: on ? 1 : 0.55, fontWeight: on ? 600 : 400 });

  return (
    <div className="flex flex-col gap-3">
      <button type="button" className="ui-btn" onClick={() => window.dispatchEvent(new Event(LOCK_NOW_EVENT))}>锁屏看看</button>

      <div className="app-card" style={{ padding: 16 }}>
        <div className="card-featured-label">壁纸</div>
        <div style={{ ...row, marginTop: 10 }}>
          <div
            style={{
              width: 72, height: 130, borderRadius: 12, flexShrink: 0,
              background: wallpaper ? `center/cover url("${wallpaper}")` : "linear-gradient(170deg,#9aa7d8,#c3a6d6 45%,#f0c3c9)",
              border: "1px solid rgba(0,0,0,.08)",
            }}
          />
          <div className="flex flex-col gap-2" style={{ flex: 1 }}>
            <div className="card-featured-desc">{wallpaper ? "用的是你选的图" : "跟桌面壁纸一样"}</div>
            <button type="button" className="ui-btn" onClick={() => fileRef.current?.click()}>换一张</button>
            {wallpaper ? <button type="button" className="ui-btn" onClick={() => saveLockWallpaper(null)}>用回桌面壁纸</button> : null}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { void pickWallpaper(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <div className="app-card" style={{ padding: 16 }}>
        <div className="card-featured-label">样式</div>
        <div className="flex gap-2" style={{ marginTop: 10 }}>
          <button type="button" className="ui-btn" style={seg(lock.style === "big")} onClick={() => patch({ style: "big" })}>大时钟</button>
          <button type="button" className="ui-btn" style={seg(lock.style === "widget")} onClick={() => patch({ style: "widget" })}>小时间 + 日历</button>
        </div>
        <div className="card-featured-label" style={{ marginTop: 14 }}>字的颜色</div>
        <div className="flex gap-2" style={{ marginTop: 8 }}>
          <button type="button" className="ui-btn" style={seg(lock.ink === "light")} onClick={() => patch({ ink: "light" })}>白色</button>
          <button type="button" className="ui-btn" style={seg(lock.ink === "dark")} onClick={() => patch({ ink: "dark" })}>深色（浅色壁纸用）</button>
        </div>
        <div className="card-featured-label" style={{ marginTop: 14 }}>底部那行字</div>
        <input className="ui-input" style={{ marginTop: 8, width: "100%" }} placeholder="不写就是「向上轻扫以打开」" value={lock.footText} onChange={e => patch({ footText: e.target.value })} />
        {lock.style === "widget" ? (
          <>
            <div className="card-featured-label" style={{ marginTop: 14 }}>日历左边那段字</div>
            <input className="ui-input" style={{ marginTop: 8, width: "100%" }} placeholder="今天也要好好练习" value={lock.widgetText} onChange={e => patch({ widgetText: e.target.value })} />
          </>
        ) : null}
      </div>

      <div className="app-card" style={{ padding: 16 }}>
        <div style={row}>
          <div>
            <div className="card-featured-label">密码</div>
            <div className="card-featured-desc">{lock.code ? `已设 ${lock.code.length} 位密码` : "没有密码，上滑就进"}</div>
          </div>
          {lock.code ? <button type="button" className="ui-btn" onClick={() => { patch({ code: "" }); onNotice?.("密码关掉了"); }}>关掉</button> : null}
        </div>
        {setting ? (
          <div style={{ marginTop: 12 }}>
            <div className="card-featured-desc" style={{ marginBottom: 8 }}>{setting.first ? "再输一遍" : `输入 ${setting.len} 位数字`}</div>
            <input
              className="ui-input"
              style={{ width: "100%", letterSpacing: 10, fontSize: 20, textAlign: "center" }}
              inputMode="numeric"
              autoFocus
              type="password"
              value={setting.value}
              onChange={e => typeCode(e.target.value)}
            />
            <button type="button" className="ui-btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setSetting(null)}>取消</button>
          </div>
        ) : (
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <button type="button" className="ui-btn" style={{ flex: 1 }} onClick={() => setSetting({ len: 4, first: "", value: "" })}>{lock.code ? "改成 4 位" : "设 4 位密码"}</button>
            <button type="button" className="ui-btn" style={{ flex: 1 }} onClick={() => setSetting({ len: 6, first: "", value: "" })}>{lock.code ? "改成 6 位" : "设 6 位密码"}</button>
          </div>
        )}
        <div className="card-featured-label" style={{ marginTop: 14 }}>密码提示</div>
        <input className="ui-input" style={{ marginTop: 8, width: "100%" }} placeholder="忘记密码时会给你看" value={lock.hint} onChange={e => patch({ hint: e.target.value })} />
      </div>
    </div>
  );
}
