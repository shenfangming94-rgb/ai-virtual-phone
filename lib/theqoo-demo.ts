import data from './theqoo-demo-data.json';
import { loadForum, publishForumDraft } from './theqoo-store';
import type { ForumBoard, ForumDraft, ForumSource } from './theqoo-model';
const boards: Record<string, ForumBoard> = { 爱豆讨论: 'idol', 娱乐八卦: 'entertainment', 日常: 'daily' };
const generic = [
  ['덬마다 생각이 다를 수 있지', '每个人的想法可能都不一样。'],
  ['다른 의견도 궁금하다', '也想听听其他意见。'],
  ['이 얘기 나도 해 보고 싶었어', '我也想聊聊这个话题。'],
  ['나는 좀 다르게 생각하는데ㅋㅋ', '我的想法有点不一样ㅋㅋ'],
  ['댓글 읽다 보니 시간 순삭이네', '看评论不知不觉时间就过去了。'],
  ['일단 더 지켜보려고', '我想先再看看。'],
];
export async function ensureForumDemo(): Promise<void> {
  const present = new Set(loadForum('demo').posts.map(p => p.id));
  const now = Date.now();
  for (const row of [...data.rows].reverse()) {
    if (present.has(`demo:${row.id}`)) continue;
    const at = now - row.id * 6e5;
    const source: ForumSource = { eventId: `demo:${row.id}`, revision: 1, publicAt: at, title: row.zh, publicFacts: [row.id === 0 ? '演示：公开了一段练习视频，没有宣布任何后续舞台。' : `演示讨论话题：${row.zh}`], phase: 'occurred', board: boards[row.board], hot: row.id < 12, notify: false, ...(row.id === 0 ? { images: [{ src: '/theqoo/practice-room.svg', caption: '练习室示意图 · 离线试玩素材' }] } : {}) };
    const comments = row.id === 0 ? data.comments.map(c => ({ ko: c[0] as string, zh: c[1] as string, likes: c[2] as number })) : generic.map(([ko, zh], i) => ({ ko, zh, likes: 2 + (row.id * 7 + i * 3) % 60 }));
    const draft: ForumDraft = { title: { ko: row.ko, zh: row.zh }, body: row.id === 0 ? [{ ko: '오늘 올라온 영상에서 마지막 부분만 몇 번을 봤는지 모르겠음.', zh: '今天上传的视频，最后那一段不知道看了多少次。' }, { ko: '동선도 깔끔하고 마지막에 딱 맞는 거 좋다. 다른 덬들은 어느 부분이 제일 좋았어?', zh: '走位很干净，最后卡得很齐。大家最喜欢哪一部分？' }] : [{ ko: row.ko, zh: row.zh }, { ko: '다른 덬들은 어떻게 생각해? 편하게 얘기해 줘.', zh: '大家怎么看？随便聊聊吧。' }], comments, views: row.views, recommendations: row.likes };
    await publishForumDraft('demo', source, draft, 'initial', at);
  }
}
/** Fixed, labelled demo developments; never touches actual calendar/personas. */
export async function advanceForumDemo(progress: boolean): Promise<string> {
  await ensureForumDemo();
  const p = loadForum('demo').posts.find(p => p.id === 'demo:0')!;
  if (progress && p.source.revision >= 2) return p.id;
  const source: ForumSource = progress ? { ...p.source, revision: 2, publicAt: Date.now(), phase: 'update', title: '演示：官方公开完整版练习视频', publicFacts: [...p.source.publicFacts, '演示新进展：官方已公开完整版练习视频。'] } : p.source;
  const items = progress ? [['풀버전 올라왔네! 이제 전체 동선 볼 수 있겠다', '完整版上传了！现在可以看完整走位了。'], ['풀버전까지 보고 얘기해도 늦지 않지', '看完完整版再聊也不迟。'], ['편집 없는 연습 영상도 좋다', '没有剪辑的练习视频也挺好的。']] : [['새 소식은 없지만 마지막 부분은 계속 보게 됨ㅋㅋ', '虽然没有新消息，最后那段还是忍不住反复看ㅋㅋ'], ['아직 이 영상만으로 판단하긴 이르지 않을까', '现在只凭这段视频下判断是不是还太早了。'], ['같은 영상인데 보는 포인트가 다르네', '同一段视频，大家关注的地方真不一样。']];
  const batch = progress ? 'public-update-2' : `discussion:${p.comments.length}`;
  await publishForumDraft('demo', source, { title: p.title, body: [{ ko: '공식 계정에 전체 연습 영상이 공개되었습니다.', zh: '官方账号已公开完整版练习视频。' }], comments: items.map(([ko, zh], i) => ({ ko, zh, likes: 5 + i * 7 })), views: p.views, recommendations: p.recommendations }, batch);
  return p.id;
}
