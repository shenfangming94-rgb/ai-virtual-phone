import { hydrateKvDb, kvGet, kvSet, kvSetAsync } from './kv-db';
import { emptyForum, publishForum, type ForumMode, type ForumState, type ForumSource, type ForumDraft } from './theqoo-model';
export const THEQOO_EVENT = 'idol-theqoo-changed';
export const THEQOO_NOTICE = 'idol-theqoo-notice';
export const THEQOO_KEYS = { world: 'idol_theqoo_v1', demo: 'idol_theqoo_demo_v1' };
export function loadForum(mode: ForumMode): ForumState {
  const raw = kvGet(THEQOO_KEYS[mode]);
  if (!raw) return emptyForum();
  const value = JSON.parse(raw) as ForumState;
  if (value.version !== 1 || !Array.isArray(value.posts)) throw new Error('论坛存档格式无法读取，请先备份，不要覆盖');
  return value;
}
let queue: Promise<unknown> = Promise.resolve();
function editForum(mode: ForumMode, edit: (s: ForumState) => ForumState): Promise<ForumState> {
  const scope = typeof localStorage !== 'undefined' ? localStorage.getItem('idol_current_save_id') : null;
  const run = queue.catch(() => {}).then(async () => {
    await hydrateKvDb();
    if (typeof window !== 'undefined' && ((window as unknown as { __idolSwitching?: boolean }).__idolSwitching || localStorage.getItem('idol_current_save_id') !== scope)) throw new Error('存档正在切换，请稍后重试');
    const previous = loadForum(mode), next = edit(previous);
    if (next === previous) return previous;
    // Async persistence must finish before success or a notification is reported.
    try { await kvSetAsync(THEQOO_KEYS[mode], JSON.stringify(next)); }
    catch (error) {
      // kvSetAsync updates the synchronous cache before disk I/O; restore the last committed state.
      kvSet(THEQOO_KEYS[mode], JSON.stringify(previous));
      throw error;
    }
    window.dispatchEvent(new Event(THEQOO_EVENT));
    return next;
  });
  queue = run;
  return run;
}
/** 帖子只留最近这么多条；她推荐过（liked）的和跟她有关的（事件触发）永远不删 */
const KEEP_POSTS = 60;
function trimPosts(s: ForumState): ForumState {
  if (s.posts.length <= KEEP_POSTS) return s;
  const liked = s.posts.filter(p => p.liked || p.source.owner === 'player' || p.source.owner === 'romance');
  const keepIds = new Set(liked.map(p => p.id));
  const fresh = s.posts.filter(p => keepIds.has(p.id));
  const rest = s.posts.filter(p => !keepIds.has(p.id)).sort((a, b) => b.createdAt - a.createdAt);
  while (fresh.length < KEEP_POSTS && rest.length) fresh.push(rest.shift()!);
  return { ...s, posts: fresh.sort((a, b) => a.createdAt - b.createdAt) };
}

export async function publishForumDraft(mode: ForumMode, source: ForumSource, draft: ForumDraft, batchId: string, now = Date.now()): Promise<ForumState> {
  let notificationTitle = '';
  const state = await editForum(mode, previous => {
    const published = trimPosts(publishForum(previous, source, draft, batchId, now));
    const post = published.posts.find(p => p.id === source.eventId);
    if (mode !== 'world' || !source.notify || !post || (post.notifiedRevisions ?? []).includes(source.revision)) return published;
    notificationTitle = draft.title.zh;
    return {
      ...published,
      posts: published.posts.map(p => p.id === source.eventId
        ? { ...p, notifiedRevisions: [...new Set([...(p.notifiedRevisions ?? []), source.revision])] }
        : p),
    };
  });
  if (notificationTitle) window.dispatchEvent(new CustomEvent(THEQOO_NOTICE, { detail: { postId: source.eventId, title: notificationTitle, owner: source.owner, revision: source.revision } }));
  return state;
}
export const toggleForumLike = (mode: ForumMode, id: string) => editForum(mode, s => ({ ...s, posts: s.posts.map(p => p.id === id ? { ...p, liked: !p.liked } : p) }));
/** 删掉她看不上的帖子：帖子、评论、通知回执一起没，事件进墓碑不再重发 */
/** 删掉一条看不上的评论 */
export function deleteForumComment(mode: ForumMode, postId: string, commentId: string): Promise<ForumState> {
  return editForum(mode, s => ({ ...s, posts: s.posts.map(p => p.id === postId ? { ...p, comments: p.comments.filter(c => c.id !== commentId) } : p) }));
}
export function deleteForumPost(mode: ForumMode, id: string): Promise<ForumState> {
  return editForum(mode, s => {
    const post = s.posts.find(p => p.id === id);
    if (!post) return s;
    return {
      ...s,
      posts: s.posts.filter(p => p.id !== id),
      deleted: [...new Set([...(s.deleted ?? []), post.source.eventId])],
    };
  });
}
export const markForumRead = (mode: ForumMode, id: string) => editForum(mode, s => ({ ...s, posts: s.posts.map(p => p.id === id ? { ...p, seenRevision: p.source.revision, seenCommentCount: p.comments.length } : p) }));
export const setForumTranslation = (mode: ForumMode, translate: boolean) => editForum(mode, s => ({ ...s, translate }));
