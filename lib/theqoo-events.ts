import { almanacBetween } from './idol-calendar';
import type { ForumDraft, ForumSource } from './theqoo-model';
import { sameForumSnapshot, validateDraft, validateSource } from './theqoo-model';
import { groupLine, loadGroups } from './idol-groups';
import { loadForum, publishForumDraft } from './theqoo-store';
import { hydrateKvDb } from './kv-db';
/** Calendar entries have NO public/completed flag. Read candidates, NEVER infer disclosure/results. */
export function forumCalendarCandidates(now = Date.now()) {
  const d = new Date(now), start = new Date(d.getFullYear(), d.getMonth() - 1, 1), end = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  const iso = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  return almanacBetween(iso(start), iso(end)).filter(i => i.kind === 'world');
}
export type ForumGenerator = (input: { source: ForumSource; priorComments: string[]; worldNow: number }) => Promise<ForumDraft>;
export type ForumNotifyPolicy = 'source' | 'always' | 'hot' | 'never';
export const FORUM_HOT_LIMITS = { views: 5000, recommendations: 50 } as const;
export function forumDraftIsHot(draft: Pick<ForumDraft, 'views' | 'recommendations'>): boolean {
  return draft.views >= FORUM_HOT_LIMITS.views || draft.recommendations >= FORUM_HOT_LIMITS.recommendations;
}
const RETRY_KEY = 'theqoo_retry_v1';
const RETRY_BACKOFF = 10 * 60e3;
type RetryItem = { source: ForumSource; batchId: string; at: number };
function loadRetryQueue(): RetryItem[] {
  try { return JSON.parse(localStorage.getItem(RETRY_KEY) || '[]') as RetryItem[]; } catch { return []; }
}
function saveRetryQueue(items: RetryItem[]): void {
  localStorage.setItem(RETRY_KEY, JSON.stringify(items.slice(0, 50)));
}
/** 生成失败：进重试队列，10 分钟后再试，不静默丢 */
export function queueFailedForumDiscussion(source: ForumSource, batchId: string): void {
  const list = loadRetryQueue().filter(item => !(item.source.eventId === source.eventId && item.batchId === batchId));
  saveRetryQueue([...list, { source, batchId, at: Date.now() + RETRY_BACKOFF }]);
}
/** 桌面 tick 顺带跑：到点的失败帖子再生成一次 */
export async function retryFailedForumDiscussions(): Promise<void> {
  const list = loadRetryQueue();
  if (!list.length) return;
  const now = Date.now();
  const due = list.filter(item => item.at <= now);
  if (!due.length) return;
  const rest = list.filter(item => item.at > now);
  saveRetryQueue(rest);
  for (const item of due) {
    try { await requestForumDiscussion(item.source, item.batchId, generateForumWithAI, 'source'); }
    catch (error) {
      queueFailedForumDiscussion(item.source, item.batchId);
      console.warn('[TheQoo] 讨论生成重试失败，10 分钟后再试：', item.source.eventId, error);
    }
  }
}
const requestsInFlight = new Map<string, Promise<void>>();
/** Story callers pass a stable event id and PUBLIC facts. Repeated calls are idempotent. */
export async function requestForumDiscussion(
  source: ForumSource,
  batchId: string,
  generate: ForumGenerator = generateForumWithAI,
  notifyPolicy: ForumNotifyPolicy = 'source',
): Promise<void> {
  const scope = localStorage.getItem('idol_current_save_id') || 'default';
  const requestKey = `${scope}:${source.eventId}:${batchId}`;
  const inFlight = requestsInFlight.get(requestKey);
  if (inFlight) return inFlight;
  const task = Promise.resolve().then(async () => {
    await hydrateKvDb();
    const worldNow = Date.now();
    validateSource(source, worldNow);
    const existing = loadForum('world').posts.find(p => p.id === source.eventId);
    if (existing?.batches.includes(batchId)) return;
    if (existing && (source.revision < existing.source.revision || (source.revision === existing.source.revision && !sameForumSnapshot(source, existing.source)))) throw new Error('请以新版本提交已公开的新进展');
    const draft = await generate({ source, priorComments: existing?.comments.slice(-30).map(c => c.ko) ?? [], worldNow });
    if ((localStorage.getItem('idol_current_save_id') || 'default') !== scope) throw new Error('存档已切换，生成结果已丢弃');
    validateDraft(draft);
    const hot = Boolean(source.hot) || forumDraftIsHot(draft);
    // 跟她有关的帖子（player/romance）：有评论了就提醒她，不看浏览量；无关的按原策略
    const related = source.owner === 'player' || source.owner === 'romance';
    const notify = related ? draft.comments.length > 0 : (notifyPolicy === 'always' || (notifyPolicy === 'hot' && hot) || (notifyPolicy === 'source' && source.notify));
    const committedSource = { ...source, hot, notify: notifyPolicy === 'never' ? false : notify };
    await publishForumDraft('world', committedSource, draft, batchId);
  });
  requestsInFlight.set(requestKey, task);
  try { await task; }
  finally { if (requestsInFlight.get(requestKey) === task) requestsInFlight.delete(requestKey); }
}
const WORLD_FILL_KEY = 'theqoo_world_fill_v1';
const WORLD_FILL_GAP = 30 * 60e3;
let worldFillBusy = false;
/** 论坛不能只有她的事：定期补几条别人家的帖子（回归、绯闻、粉丝吵架这些吃瓜内容）。
 *  素材只用日历里已经公开的圈内大事 + 圈内名册里的团；跟她无关，不弹横幅。 */
export async function maybeFillWorldGossip(force = false): Promise<number> {
  if (worldFillBusy || typeof localStorage === 'undefined') return 0;
  if (!force) {
    try {
      const last = Number(localStorage.getItem(WORLD_FILL_KEY) || 0);
      if (Date.now() - last < WORLD_FILL_GAP) return 0;
    } catch { /* 读不到就照常试 */ }
  }
  worldFillBusy = true;
  try {
    const now = Date.now();
    const d = new Date(now);
    const iso = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    const from = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 14));
    const to = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const events = almanacBetween(from, to).filter(i => i.kind === 'world');
    const groups = Object.values(loadGroups()).sort(() => Math.random() - 0.5).slice(0, 8);
    const [{ simpleLLMCall }, settings] = await Promise.all([import('./api-helpers'), import('./settings-storage')]);
    const slot = settings.resolveBinding(settings.loadBindingConfig(), undefined, 'chat');
    const config = settings.loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? settings.loadApiConfigs()[0];
    if (!config) return 0; // 没配 API 就不写，别烧
    const res = await simpleLLMCall(config, [
      { role: 'system', content: `你是 SEOUL:AM 世界里韩网匿名论坛的「路人写手」。写几条跟她无关的帖子，让论坛像真的有人天天在上面聊。只输出 JSON：
{"posts":[{"eventId":"world_XXX","board":"idol/entertainment/daily","title":{"ko":"","zh":""},"body":[{"ko":"","zh":""}],"comments":[{"ko":"","zh":"","likes":0}],"views":0,"recommendations":0,"publicFacts":[""]}]}
写 2～4 条。素材只用下面给的圈内大事和团，不编日历里没有的回归/演唱会；可以写团的新歌讨论、舞台评价、综艺片段、机场照、恋爱传闻（写清楚是传闻）、粉丝吵架、练习生爆料这类吃瓜内容，但不要写违法和恶意伤人的。评论 6～12 条，韩语口语自然，立场不平均。团名、成员、风格照下面的抄，不许改。帖子之间题材不重样。` },
      { role: 'user', content: `近两周圈内大事：\n${events.map(e => `- ${e.date} ${e.title}${e.note ? `：${e.note}` : ''}`).join('\n') || '（没有）'}\n\n这个世界里的团：\n${groups.map(g => `- ${groupLine(g)}`).join('\n')}` },
    ], { temperature: 0.9, label: 'TheQoo 世界八卦' });
    const j = JSON.parse((res.content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim().match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { posts?: { eventId?: string; board?: string; title?: { ko?: string; zh?: string }; body?: { ko?: string; zh?: string }[]; comments?: { ko?: string; zh?: string; likes?: number }[]; views?: number; recommendations?: number; publicFacts?: string[] }[] };
    let wrote = 0;
    for (const raw of j.posts ?? []) {
      if (!raw?.title?.ko || !raw.title.zh) continue;
      const source: ForumSource = {
        eventId: String(raw.eventId || `world_${Date.now()}_${wrote}`),
        revision: 1,
        publicAt: now,
        title: String(raw.title.zh),
        publicFacts: (raw.publicFacts ?? []).filter(f => typeof f === 'string' && f.trim()).slice(0, 10),
        phase: 'occurred',
        board: (raw.board === 'idol' || raw.board === 'entertainment' || raw.board === 'daily') ? raw.board : 'idol',
        hot: false,
        notify: false,
      };
      if (!source.publicFacts.length) continue;
      const draft: ForumDraft = {
        title: { ko: String(raw.title.ko), zh: String(raw.title.zh) },
        body: (raw.body ?? []).filter(b => b?.ko && b.zh).slice(0, 20).map(b => ({ ko: String(b.ko), zh: String(b.zh) })),
        comments: (raw.comments ?? []).filter(c => c?.ko && c.zh && Number.isSafeInteger(c.likes) && (c.likes ?? 0) >= 0).slice(0, 60).map(c => ({ ko: String(c.ko), zh: String(c.zh), likes: Number(c.likes) })),
        views: Number.isSafeInteger(raw.views) && (raw.views ?? 0) >= 0 ? Number(raw.views) : 0,
        recommendations: Number.isSafeInteger(raw.recommendations) && (raw.recommendations ?? 0) >= 0 ? Number(raw.recommendations) : 0,
      };
      try { validateSource(source, now); validateDraft(draft); } catch { continue; }
      await publishForumDraft('world', source, draft, `world:${source.eventId}`, now);
      wrote++;
    }
    localStorage.setItem(WORLD_FILL_KEY, String(now));
    return wrote;
  } catch (error) {
    console.warn('[TheQoo] 世界八卦没写成：', error);
    return 0;
  } finally {
    worldFillBusy = false;
  }
}

export const FORUM_SYSTEM_PROMPT = `你生成 SEOUL:AM 的韩网匿名论坛讨论。只输出 JSON，不输出 Markdown。
发帖者与评论者均为匿名路人，不能冒充玩家或已有角色。只依据 source.publicFacts 和已公开图片讨论，不补写事实，不推测为实锤；标题、正文、评论及翻译都不能泄露未提供的信息。
source.phase=announced 只表示预告，不能假定活动已经发生。相同 revision 的新增评论只能重复、争论、表达期待或观点，不能引入新进展。新 revision 才允许谈新增事实，不能改写旧评论。
口吻自然，可短句、接话、质疑、支持、玩笑、争论，不平均分配立场，不写成每人一段分析。ko 是韩文原文，zh 是对应中文翻译，信息必须一致。不要生成真实联系方式或个人住址，不作针对现实人的伤害号召。
热度展示不改变事业或关系。回复形状：{"title":{"ko":"","zh":""},"body":[{"ko":"","zh":""}],"comments":[{"ko":"","zh":"","likes":0}],"views":0,"recommendations":0}。生成 12 条评论。图片只能由代码使用 source.images，不生成图片链接。`;
/** Explicit opt-in adapter; importing the app, opening posts and demo mode never call this. */
export const generateForumWithAI: ForumGenerator = async input => {
  const [{ simpleLLMCall }, settings] = await Promise.all([import('./api-helpers'), import('./settings-storage')]);
  const slot = settings.resolveBinding(settings.loadBindingConfig(), undefined, 'chat');
  const config = settings.loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? settings.loadApiConfigs()[0];
  if (!config) throw new Error('尚未配置 API；离线试玩不需要 API');
  const result = await simpleLLMCall(config, [{ role: 'system', content: FORUM_SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(input) }], { temperature: 0.7, label: 'TheQoo 公开事件讨论' });
  const draft = JSON.parse((result.content || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) as ForumDraft;
  validateDraft(draft);
  return draft;
};
