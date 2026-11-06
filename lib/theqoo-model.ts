/** Forum facts are an explicit PUBLIC snapshot, never a whole scene/persona. */
export type ForumMode = 'world' | 'demo';
export type ForumBoard = 'idol' | 'entertainment' | 'daily';
export type Bilingual = { ko: string; zh: string };
export type ForumStoryKind =
  | 'roadshow' | 'practice_video' | 'debut_prediction' | 'daily_photo' | 'viral_clip' | 'roster_reveal' | 'ins_repost' | 'debut_stage'
  | 'romance_mv' | 'romance_scandal' | 'romance_stream' | 'romance_pictorial' | 'romance_collab_stage' | 'romance_campus';
export type ForumSource = {
  /** Stable across calendar and story callers; same event = same id. */
  eventId: string;
  /** Increases only when new information is public, not when comments refresh. */
  revision: number;
  publicAt: number;
  title: string;
  publicFacts: string[];
  phase: 'announced' | 'occurred' | 'update';
  board: ForumBoard;
  hot: boolean;
  notify: boolean;
  /** Event provenance for safe resurfacing and audit; never exposes private character data. */
  owner?: 'player' | 'romance';
  storyKind?: ForumStoryKind;
  images?: { src: string; caption: string }[];
};
export type ForumComment = Bilingual & { id: string; at: number; likes: number; revision: number };
export type ForumDraft = { title: Bilingual; body: Bilingual[]; comments: (Bilingual & { likes: number })[]; views: number; recommendations: number };
export type ForumPost = {
  id: string; source: ForumSource; title: Bilingual; body: Bilingual[];
  createdAt: number; updatedAt: number; views: number; recommendations: number; liked: boolean;
  comments: ForumComment[]; updates: { revision: number; at: number; title: string; body: Bilingual[] }[];
  batches: string[]; seenRevision: number; seenCommentCount: number;
  /** Persisted notification receipts, one per public revision. */
  notifiedRevisions?: number[];
};
export type ForumState = { version: 1; posts: ForumPost[]; translate: boolean };
export const emptyForum = (): ForumState => ({ version: 1, posts: [], translate: true });
export const FORUM_BOARDS = { idol: '爱豆讨论', entertainment: '娱乐八卦', daily: '日常' };
/** Popularity flags may change while comments grow; public facts may change only with a revision. */
export function sameForumSnapshot(a: ForumSource, b: ForumSource): boolean {
  const clean = ({ hot: _hot, notify: _notify, ...source }: ForumSource) => source;
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}
export function validateSource(s: ForumSource, now: number): void {
  if (!s.eventId?.trim() || !Number.isInteger(s.revision) || s.revision < 1 || !Number.isFinite(s.publicAt) || s.publicAt > now || !s.title?.trim() || !s.publicFacts?.length || s.publicFacts.some(f => typeof f !== 'string' || !f.trim())) throw new Error('只允许已公开且有明确事实的事件');
  if (!['announced', 'occurred', 'update'].includes(s.phase) || !(s.board in FORUM_BOARDS)) throw new Error('事件状态无效');
  if (s.images?.some(i => !/^(https:\/\/|\/[^/])/.test(i.src))) throw new Error('图片必须来自已有的安全素材地址');
}
export function validateDraft(d: ForumDraft): void {
  const bilingual = (x: Bilingual) => typeof x?.ko === 'string' && !!x.ko.trim() && typeof x?.zh === 'string' && !!x.zh.trim();
  if (!bilingual(d?.title) || !Array.isArray(d.body) || !d.body.length || d.body.length > 20 || !d.body.every(bilingual) || !Array.isArray(d.comments) || !d.comments.length || d.comments.length > 60 || !d.comments.every(c => bilingual(c) && Number.isSafeInteger(c.likes) && c.likes >= 0) || !Number.isSafeInteger(d.views) || d.views < 0 || !Number.isSafeInteger(d.recommendations) || d.recommendations < 0) throw new Error('帖子或双语评论格式不完整，未保存');
}
/** Pure reducer. Existing text, likes and comments survive updates; duplicate batches are no-ops. */
export function publishForum(state: ForumState, source: ForumSource, draft: ForumDraft, batchId: string, now: number): ForumState {
  validateSource(source, now);
  if (!batchId.trim()) throw new Error('缺少评论批次编号');
  const old = state.posts.find(p => p.id === source.eventId);
  if (old && source.revision < old.source.revision) throw new Error('旧进展不能覆盖新进展');
  if (old?.batches.includes(batchId)) return state;
  if (old && source.revision === old.source.revision && !sameForumSnapshot(source, old.source)) throw new Error('同一阶段不能偷偷添加新事实，请提交新的公开进展');
  validateDraft(draft);
  const comments = draft.comments.map((c, i) => ({ ...c, id: `${source.eventId}:${batchId}:${i}`, at: now, revision: source.revision }));
  if (!old) return { ...state, posts: [{ id: source.eventId, source, title: draft.title, body: draft.body, createdAt: now, updatedAt: now, views: draft.views, recommendations: draft.recommendations, liked: false, comments, updates: [], batches: [batchId], seenRevision: 0, seenCommentCount: 0, notifiedRevisions: [] }, ...state.posts] };
  const advancing = source.revision > old.source.revision;
  const post: ForumPost = { ...old, source, updatedAt: now, comments: [...old.comments, ...comments], batches: [...old.batches, batchId], updates: advancing ? [...old.updates, { revision: source.revision, at: now, title: source.title, body: draft.body }] : old.updates };
  return { ...state, posts: state.posts.map(p => p.id === post.id ? post : p) };
}
