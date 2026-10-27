/**
 * 爱豆小手机：邮箱。只放通知类的信（投递回执、公司回信、签约须知），char 不用邮箱找她。
 * 信可以带一个「动作」：试镜邀请信上的「接受 · 进提醒事项」「改时间」。
 */

import { kvGet, kvSet } from "./kv-db";

/** 一段正文：韩文在上（可以没有），中文在下 */
export type MailPara = { ko?: string; zh: string };

export type InviteAction = {
  kind: "invite";
  appId: string;
  companyId: string;
  at: number;
  place: string;
  prep: string;
  status: "new" | "accepted" | "declined";
  nodeId?: string;
};

export type Mail = {
  id: string;
  /** 发件人显示名 */
  from: string;
  addr: string;
  /** 头像上的字和底色 */
  logo: string;
  color: string;
  subject: string;
  /** 主题后面的中文小字 */
  subjectZh?: string;
  body: MailPara[];
  at: number;
  read?: boolean;
  starred?: boolean;
  action?: InviteAction;
};

const KEY = "idol_mail_v1";
export const MAIL_EVENT = "idol-mail-changed";

export function loadMails(): Mail[] {
  try { return (JSON.parse(kvGet(KEY) || "[]") as Mail[]).filter(m => m && m.id); } catch { return []; }
}

function save(list: Mail[]) {
  kvSet(KEY, JSON.stringify(list.slice(-200)));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MAIL_EVENT));
}

export function addMail(m: Omit<Mail, "id">): Mail {
  const mail: Mail = { ...m, id: `mail_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  save([...loadMails(), mail]);
  return mail;
}

export function mailById(id: string): Mail | undefined {
  return loadMails().find(m => m.id === id);
}

export function updateMail(id: string, patch: Partial<Mail>): void {
  save(loadMails().map(m => (m.id === id ? { ...m, ...patch } : m)));
}

export function deleteMail(id: string): void {
  save(loadMails().filter(m => m.id !== id));
}

export function unreadCount(): number {
  return loadMails().filter(m => !m.read).length;
}

/** 预览一行：第一段韩文（没有就中文） */
export function mailPreview(m: Mail): string {
  const p = m.body[0];
  return (p?.ko || p?.zh || "").replace(/\s+/g, " ");
}
