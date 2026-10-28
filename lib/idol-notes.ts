/**
 * 爱豆小手机：通知。桌面上弹 iOS 横幅（照出道预览 d5 的样子），同时存一份，锁屏上显示还没看过的。
 * 发动机各处的提醒还是一句话（「💬 名字：内容」「⏰ 到点了：周评」），这里拆成 app / 标题 / 正文。
 */

import { kvGet, kvSet } from "./kv-db";

export type NoteApp = "kakao" | "naver" | "reminders" | "clock" | "mail" | "stage" | "starroad" | "system";
export type LockNote = { id: string; app: NoteApp; title: string; text: string; at: number; from?: string; seen?: boolean; /** 固定排在最上面（出道当天那一串） */ pin?: boolean; /** 场景 app：点了开这件事那一场 */ nodeId?: string };

const KEY = "idol_lock_notes_v1";
export const LOCK_NOTES_EVENT = "idol-lock-notes-changed";

export const APP_LOOK: Record<NoteApp, { name: string; icon: string; bg: string; fg: string }> = {
  kakao: { name: "KakaoTalk", icon: "K", bg: "#fee500", fg: "#3a1d1d" },
  naver: { name: "NAVER 新闻", icon: "N", bg: "#03c75a", fg: "#fff" },
  reminders: { name: "提醒事项", icon: "✓", bg: "#ff9f0a", fg: "#fff" },
  clock: { name: "时钟", icon: "⏰", bg: "#1c1c1e", fg: "#ff9f0a" },
  mail: { name: "邮件", icon: "✉", bg: "#1e88ff", fg: "#fff" },
  stage: { name: "此刻", icon: "◐", bg: "#2b2140", fg: "#f5c4dc" },
  starroad: { name: "星路", icon: "✦", bg: "#1c1c1e", fg: "#f7f7f6" },
  system: { name: "通知", icon: "•", bg: "#8e8e93", fg: "#fff" },
};

export function loadNotes(): LockNote[] {
  try { return (JSON.parse(kvGet(KEY) || "[]") as LockNote[]).filter(n => n && n.title !== undefined); } catch { return []; }
}
function save(list: LockNote[]) {
  kvSet(KEY, JSON.stringify(list.slice(-40)));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCK_NOTES_EVENT));
}

export function pushLockNote(n: Omit<LockNote, "id">): LockNote {
  const note: LockNote = { ...n, id: `note_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  save([...loadNotes(), note]);
  return note;
}

/** 横幅完整弹完了 = 看过了 */
export function markNoteSeen(id: string): void {
  const list = loadNotes();
  if (list.some(n => n.id === id && !n.seen)) save(list.map(n => (n.id === id ? { ...n, seen: true } : n)));
}

/** 开锁 = 看过了 */
export function markNotesSeen(): void {
  const list = loadNotes();
  if (list.some(n => !n.seen)) save(list.map(n => ({ ...n, seen: true })));
}

export function unseenNotes(): LockNote[] {
  return loadNotes().filter(n => !n.seen).sort((a, b) => Number(Boolean(b.pin)) - Number(Boolean(a.pin)) || b.at - a.at);
}

/** 一句话提醒 → 横幅的样子 */
export function parseNotice(msg: string): Omit<LockNote, "id" | "at"> {
  const text = msg.trim();
  const strip = (s: string) => s.replace(/^[💬⏰📅❗📝📩✦⭐🔔]\s*/u, "").trim();
  const split = (s: string): [string, string] => {
    const i = s.search(/[：:]/);
    return i > 0 && i < 24 ? [s.slice(0, i).trim(), s.slice(i + 1).trim()] : ["", s];
  };
  // 「🎬[节点id] 标题：时间地点」：主线到点，点了直接进场景 app
  const stage = text.match(/^🎬\[([^\]]+)\]\s*(.*)$/u);
  if (stage) {
    const [title, rest] = split(stage[2]);
    return { app: "stage", title, text: rest, nodeId: stage[1] };
  }
  if (text.startsWith("🌠")) {
    const [, rest] = split(text.replace(/^🌠\s*/u, ""));
    return { app: "starroad", title: "", text: rest || text.replace(/^🌠\s*/u, "") };
  }
  if (text.startsWith("💬")) {
    const body = strip(text).replace(/^KakaoTalk[：:]\s*/, "");
    const [title, rest] = split(body);
    return title ? { app: "kakao", title, text: rest } : { app: "kakao", title: "", text: body };
  }
  if (/^(⏰|📅|❗|📝)/u.test(text)) {
    const [title, rest] = split(strip(text));
    return title && rest ? { app: "reminders", title, text: rest } : { app: "reminders", title: "", text: strip(text) };
  }
  if (text.startsWith("📩")) return { app: "mail", title: "新邮件", text: strip(text) };
  if (/闹钟|计时/.test(text)) return { app: "clock", title: "闹钟", text: strip(text) };
  return { app: "system", title: "", text: strip(text) };
}

/** 桌面上弹出来的那条：同时进锁屏 */
export function noteFromNotice(msg: string): LockNote {
  return pushLockNote({ ...parseNotice(msg), at: Date.now(), seen: false });
}

export function agoLabel(at: number, now = Date.now()): string {
  const m = Math.round((now - at) / 60e3);
  if (m < 1) return "现在";
  if (m < 60) return `${m}分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${new Date(at).getMonth() + 1}月${new Date(at).getDate()}日`;
}
