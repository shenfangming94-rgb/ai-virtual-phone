/**
 * 世界时钟（爱豆小手机）：整个小手机的「现在」默认是虚拟时间。
 *
 * 做法：开机最早的时候把浏览器的 Date 换掉，世界时间 = 现实时间 + offset。
 * 之后所有代码问「现在几点」（new Date()、Date.now()）拿到的都是世界时间，
 * 状态栏、聊天时间戳、给 AI 的时间、日程、主动消息都自动跟着走；新存的消息也是世界时间，
 * 跳时间不会让旧记录跟着挪。
 *
 * offset 存在 localStorage（开机脚本要同步读）。「跟现实时间一致」打开时 offset 当 0 用。
 * 自定义 app 的 iframe 在生成页面时带上当时的 offset（跳时间后要重新打开 app 才跟上）。
 */

export const WORLD_CLOCK_KEY = "idol_world_clock_v1";

export type WorldClockState = {
  /** true = 跟现实时间一致 */
  real: boolean;
  /** 世界时间比现实快多少毫秒（real 时不用） */
  offset: number;
};

type WorldClockGlobal = { offset: number; RealDate: DateConstructor };

/**
 * 把 Date 换成世界时钟的脚本。`readOffset` 是一段返回 offset 的 JS 表达式。
 * 只换「现在」：new Date()（无参数）和 Date.now()；带参数的 new Date(x)、Date.parse、Date.UTC 照旧。
 */
function patchScript(readOffset: string): string {
  return `(function(){try{
if (window.__worldClock) return;
var RD = Date;
var wc = window.__worldClock = { offset: (${readOffset}) || 0, RealDate: RD };
function WD(a, b, c, d, e, f, g) {
  var n = arguments.length;
  if (!(this instanceof WD)) return new RD(RD.now() + wc.offset).toString();
  if (n === 0) return new RD(RD.now() + wc.offset);
  if (n === 1) return new RD(a);
  if (n === 2) return new RD(a, b);
  if (n === 3) return new RD(a, b, c);
  if (n === 4) return new RD(a, b, c, d);
  if (n === 5) return new RD(a, b, c, d, e);
  if (n === 6) return new RD(a, b, c, d, e, f);
  return new RD(a, b, c, d, e, f, g);
}
WD.prototype = RD.prototype;
WD.now = function () { return RD.now() + wc.offset; };
WD.parse = RD.parse;
WD.UTC = RD.UTC;
Object.setPrototypeOf(WD, RD);
window.Date = WD;
}catch(e){}})();`;
}

/** 宿主开机脚本：放在 <head> 最前面，比所有代码都早 */
export const WORLD_CLOCK_BOOT_SCRIPT = patchScript(
  `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(WORLD_CLOCK_KEY)})||"null");return s&&!s.real&&typeof s.offset==="number"?s.offset:0;}catch(e){return 0;}})()`,
);

/** 自定义 app iframe 用：直接写死当前 offset */
export function worldClockFrameScript(): string {
  return patchScript(String(currentOffset()));
}

function globalClock(): WorldClockGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __worldClock?: WorldClockGlobal }).__worldClock ?? null;
}

/** 现实时间（不受世界时钟影响） */
export function realNow(): number {
  const g = globalClock();
  return g ? g.RealDate.now() : Date.now();
}

export function loadWorldClock(): WorldClockState {
  if (typeof window === "undefined") return { real: false, offset: 0 };
  try {
    const raw = JSON.parse(window.localStorage.getItem(WORLD_CLOCK_KEY) || "null") as Partial<WorldClockState> | null;
    return { real: Boolean(raw?.real), offset: typeof raw?.offset === "number" && Number.isFinite(raw.offset) ? raw.offset : 0 };
  } catch {
    return { real: false, offset: 0 };
  }
}

function currentOffset(): number {
  const s = loadWorldClock();
  return s.real ? 0 : s.offset;
}

const listeners = new Set<() => void>();
export function subscribeWorldClock(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function saveWorldClock(next: WorldClockState): void {
  try { window.localStorage.setItem(WORLD_CLOCK_KEY, JSON.stringify(next)); } catch { /* 存不上就只在这次生效 */ }
  const g = globalClock();
  if (g) g.offset = next.real ? 0 : next.offset;
  listeners.forEach(fn => fn());
}

/** 把世界时间设成某一刻（之后跟着现实流逝） */
export function setWorldTime(worldMs: number): void {
  saveWorldClock({ real: false, offset: worldMs - realNow() });
}

/** 世界时间往前/往后拨 */
export function shiftWorldTime(deltaMs: number): void {
  const s = loadWorldClock();
  saveWorldClock({ real: false, offset: (s.real ? 0 : s.offset) + deltaMs });
}

/** 打开 / 关掉「跟现实时间一致」；关掉时回到之前的虚拟时间 */
export function setWorldClockReal(real: boolean): void {
  const s = loadWorldClock();
  saveWorldClock({ ...s, real });
}
