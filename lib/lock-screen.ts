/**
 * 锁屏（爱豆小手机）：每次打开、或者离开超过一分钟回来，先到锁屏。
 * 设了密码就要输密码，没设就上滑直接进。锁屏壁纸可以单独换，没换就用桌面壁纸。
 */

import { kvGet, kvRemove, kvSet } from "./kv-db";

const KEY = "idol_lock_v1";
const WALLPAPER_KEY = "idol_lock_wallpaper_v1";
export const LOCK_CHANGED_EVENT = "idol-lock-changed";
/** 发这个事件立刻锁屏（设置里「锁屏看看」） */
export const LOCK_NOW_EVENT = "idol-lock-now";

export type LockStyle = "big" | "widget";

export type LockSettings = {
  /** 空 = 不用密码；4 位或 6 位数字 */
  code: string;
  /** 忘记密码时给自己看的提示 */
  hint: string;
  style: LockStyle;
  /** 底部中间那行字，空 = 「向上轻扫以打开」 */
  footText: string;
  /** 小组件样式左边那段字 */
  widgetText: string;
  /** 锁屏上字的颜色：浅色壁纸用深色字 */
  ink: "light" | "dark";
};

const DEFAULTS: LockSettings = { code: "", hint: "", style: "big", footText: "", widgetText: "", ink: "light" };

export function loadLock(): LockSettings {
  try {
    const raw = JSON.parse(kvGet(KEY) || "null") as Partial<LockSettings> | null;
    if (!raw) return { ...DEFAULTS };
    return {
      code: typeof raw.code === "string" && /^\d{4}(\d{2})?$/.test(raw.code) ? raw.code : "",
      hint: typeof raw.hint === "string" ? raw.hint : "",
      style: raw.style === "widget" ? "widget" : "big",
      footText: typeof raw.footText === "string" ? raw.footText : "",
      widgetText: typeof raw.widgetText === "string" ? raw.widgetText : "",
      ink: raw.ink === "dark" ? "dark" : "light",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLock(patch: Partial<LockSettings>): LockSettings {
  const next = { ...loadLock(), ...patch };
  kvSet(KEY, JSON.stringify(next));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCK_CHANGED_EVENT));
  return next;
}

export function loadLockWallpaper(): string | null {
  return kvGet(WALLPAPER_KEY);
}

export function saveLockWallpaper(dataUrl: string | null): void {
  if (dataUrl) kvSet(WALLPAPER_KEY, dataUrl);
  else kvRemove(WALLPAPER_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCK_CHANGED_EVENT));
}

/** 把选的图片压到长边 1600 的 jpg，免得太占地方 */
export function imageFileToWallpaper(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片读不出来")); };
    img.src = url;
  });
}

const LUNAR_DAYS = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];

/** 农历日期，比如「八月廿三」；浏览器不支持就返回空 */
export function lunarLabel(d: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "long", day: "numeric" }).formatToParts(d);
    const month = parts.find(p => p.type === "month")?.value ?? "";
    const day = Number(parts.find(p => p.type === "day")?.value);
    if (!month || !day) return "";
    return `${month}${LUNAR_DAYS[day - 1] ?? ""}`;
  } catch {
    return "";
  }
}
