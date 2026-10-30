/** 快进边界的纯本地计算；不推进剧情、不创建事件、不调用模型。 */
import type { CareerNode, Offer } from "./idol-career";

export const TIME_JUMP_EVENT = "idol-time-jumped";
export type TimeJumpOptions = { activeNodeId?: string };
export type TimeStop = { at: number; title: string };
export type JumpResult = { target: number; stoppedBy?: string };
const MIN = 60e3;
const LEAD = 30 * MIN;

export function findTimeJumpStop(now: number, target: number, nodes: CareerNode[], offers: Offer[], events: TimeStop[], options: TimeJumpOptions = {}): JumpResult {
  if (!Number.isFinite(target)) return { target: now, stoppedBy: "时间无效，请重新选择" };
  // 回拨用于校准钟表，不是快进，也不会撤销已经发生的剧情。
  if (target <= now) return { target };
  const stops: TimeStop[] = [];
  const add = (at: number, title: string) => { if (Number.isFinite(at)) stops.push({ at: Math.max(now, at), title }); };
  for (const n of nodes) {
    if (n.id === options.activeNodeId) continue; // 正在演的这件事允许自然耗时，仍检查其他日程。
    // 试镜演完了在等公司回信：跳到回信到的那一刻就停，让她正好看到那封信。
    if (n.kind === "audition" && n.status === "done" && n.resultAt && !n.resultSent && n.resultAt > now) add(n.resultAt, "公司回信");
    if (n.status === "pending") {
      // 自选日程/练习本来就不结算缺席；过时后不让旧条目永久锁住时钟。
      if ((n.kind === "custom" || n.kind === "practice") && n.dueAt < now) continue;
      // 先在半小时前提醒；进入准备时间后允许走到开始时刻，但不能再跨过未处理的日程。
      const at = n.dueAt - LEAD > now ? n.dueAt - LEAD : n.dueAt;
      add(at, `${n.dueAt <= now ? "待处理日程" : "日程"}：${n.title}`);
    }
    if (n.status === "invite") {
      const deadline = Number.isFinite(n.replyBy) ? n.replyBy! : n.dueAt;
      if (deadline < now) continue; // 已过期的交给原发动机结算，不无限拦截。
      add(deadline - LEAD > now ? deadline - LEAD : Math.max(now, deadline - MIN), `回复即将截止：${n.title}`);
    }
  }
  for (const o of offers) if (o.status === "new" && !o.notified) add(o.at, "公司新消息");
  // 到点但发动机尚未处理的事件也要停，不利用下一次桌面tick前的空隙跨过去。
  events.forEach(e => add(e.at, e.title));
  const first = stops.filter(s => s.at <= target).sort((a, b) => a.at - b.at)[0];
  return first ? { target: first.at, stoppedBy: first.title } : { target };
}
