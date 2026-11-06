/** TheQoo story hooks. Every trigger is downstream of a completed/public game event. */
import { loadCareer, type CareerNode } from './idol-career';
import { fameTotal } from './idol-fame';
import { loadForum } from './theqoo-store';
import { generateForumWithAI, queueFailedForumDiscussion, requestForumDiscussion, type ForumNotifyPolicy } from './theqoo-events';
import type { ForumSource, ForumStoryKind } from './theqoo-model';
import { mainlineState } from './idol-mainline';
import { pipelineState } from './idol-debut-pipeline';
import { romanceState } from './idol-romance-live';
import type { RouteType } from './idol-romance-lines';
import type { SceneMeta } from './idol-world';
import type { Video } from './idol-youtube';
import type { Post } from './idol-ins';

export type PublicEvidenceKind =
  | 'roadshow_photo' | 'roadshow_video' | 'public_photo' | 'viral_clip'
  | 'debut_plan_public'
  | 'mv_cast_reveal' | 'mv_release' | 'livestream_duo' | 'pictorial_release'
  | 'collab_stage_public' | 'campus_sighting';
export type ScenePublicEvidence = { kind?: string; quote?: string };

const source = (
  eventId: string,
  owner: ForumSource['owner'],
  storyKind: ForumStoryKind,
  title: string,
  publicFacts: string[],
  publicAt: number,
  board: ForumSource['board'] = 'idol',
): ForumSource => ({
  eventId, owner, storyKind, revision: 1, publicAt, title, publicFacts,
  phase: 'occurred', board, hot: false, notify: false,
});

function publish(sourceInfo: ForumSource, batchId: string, policy: ForumNotifyPolicy): void {
  void requestForumDiscussion(sourceInfo, batchId, generateForumWithAI, policy).catch(error => {
    queueFailedForumDiscussion(sourceInfo, batchId);
    console.warn('[TheQoo] public story event was not generated:', sourceInfo.eventId, error);
  });
}

function evidenceQuotes(items: ScenePublicEvidence[] | undefined, transcript: string, kind: PublicEvidenceKind): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter(item => item?.kind === kind && typeof item.quote === 'string')
    .map(item => item.quote!.trim())
    .filter(quote => quote.length >= 5 && transcript.includes(quote))
    .slice(0, 2);
}

function mainlineKey(node: CareerNode): string | undefined {
  return mainlineState().find(item => item.nodeId === node.id)?.key;
}

function romanceNodeKey(node: CareerNode): string | undefined {
  return node.note?.match(/^情缘节点：([a-z_]+)$/)?.[1];
}

function romanceRoute(node: CareerNode): RouteType | undefined {
  if (!node.fromId) return undefined;
  const state = romanceState();
  return (Object.entries(state.lines) as [RouteType, { charId?: string } | undefined][])
    .find(([, line]) => line?.charId === node.fromId)?.[0];
}

function publishSource(sourceInfo: ForumSource, batchId: string, policy: ForumNotifyPolicy): void {
  publish(sourceInfo, batchId, policy);
}

function playerPublicHistoryFacts(): string[] {
  return loadForum('world').posts
    .filter(post => post.source.owner === 'player')
    .flatMap(post => post.source.publicFacts)
    .slice(-12);
}

/** Called before the fixed underground-scandal scene starts, so the public thread precedes KKT and the meeting. */
export async function startUndergroundScandalScene(nodeId: string, meta: SceneMeta): Promise<void> {
  const node = loadCareer().nodes.find(item => item.id === nodeId);
  if (!node || node.occasion !== 'romance' || romanceRoute(node) !== 'underground' || romanceNodeKey(node) !== 'scandal_talk') return;
  const eventId = 'romance:underground:scandal_talk';
  const priorPublicFacts = playerPublicHistoryFacts();
  const facts = [
    '韩国论坛出现了关于玩家与一名地下音乐圈男生的恋爱传闻；两人没有确认交往。',
    ...priorPublicFacts.map(fact => `此前公开讨论过的玩家经历：${fact}`),
  ];
  try {
    await requestForumDiscussion(source(eventId, 'romance', 'romance_scandal', '练习生与地下音乐人恋爱传闻', facts, meta.startAt, 'entertainment'), `${eventId}:public`, generateForumWithAI, 'always');
  } catch (error) {
    queueFailedForumDiscussion(source(eventId, 'romance', 'romance_scandal', '练习生与地下音乐人恋爱传闻', facts, meta.startAt, 'entertainment'), `${eventId}:public`);
    console.warn('[TheQoo] underground-rumour thread was not generated:', error);
  }
  try {
    const kakao = await import('./idol-kakao');
    kakao.sendCompanyScandalNotice(eventId);
  } catch (error) {
    console.warn('[TheQoo] company KakaoTalk notice failed:', error);
  }
}

function publishPlayerMilestone(
  eventId: string,
  storyKind: ForumStoryKind,
  title: string,
  facts: string[],
  at: number,
  batchId: string,
  resurfaceFact?: string,
): void {
  publishSource(source(eventId, 'player', storyKind, title, facts, at), batchId, 'hot');
  if (resurfaceFact) resurfaceOlderPlayerThread(resurfaceFact, at, batchId);
}

let resurfaceQueue: Promise<void> = Promise.resolve();
/** Keep the old post, title and comments; only append a new public revision and comments. */
function resurfaceOlderPlayerThread(newPublicFact: string, at: number, milestoneBatch: string): void {
  const task = resurfaceQueue.catch(() => undefined).then(async () => {
    const eligible = loadForum('world').posts
      .filter(post => post.source.owner === 'player' && ['roadshow', 'practice_video', 'daily_photo', 'viral_clip', 'ins_repost'].includes(post.source.storyKind ?? ''))
      .sort((a, b) => a.createdAt - b.createdAt);
    const old = eligible[0];
    if (!old) return;
    const revised: ForumSource = {
      ...old.source,
      revision: old.source.revision + 1,
      publicAt: at,
      phase: 'update',
      publicFacts: [...old.source.publicFacts, `后来公开的新进展：${newPublicFact}`].slice(-20),
      hot: false,
      notify: false,
    };
    await requestForumDiscussion(revised, `resurface:${milestoneBatch}`, generateForumWithAI, 'hot');
  });
  resurfaceQueue = task;
  void task.catch(error => console.warn('[TheQoo] old player thread could not be resurfaced:', error));
}

function publishSceneEvidence(
  eventId: string,
  owner: ForumSource['owner'],
  storyKind: ForumStoryKind,
  title: string,
  quote: string,
  at: number,
  board: ForumSource['board'],
  batchId: string,
  policy: ForumNotifyPolicy,
): void {
  publishSource(source(eventId, owner, storyKind, title, [quote], at, board), batchId, policy);
}

/** Called after scene facts are committed. Evidence quotes must be exact public transcript excerpts. */
export function publishSceneForumEvents(input: {
  node?: CareerNode;
  meta: SceneMeta;
  transcript: string;
  evidence?: ScenePublicEvidence[];
}): void {
  const { node, meta, transcript } = input;
  const evidence = input.evidence;
  const key = node ? mainlineKey(node) : undefined;
  if (node && key === 'roadshow') {
    const quote = [...evidenceQuotes(evidence, transcript, 'roadshow_video'), ...evidenceQuotes(evidence, transcript, 'roadshow_photo')][0];
    if (quote) publishSceneEvidence(`player:roadshow:${node.id}`, 'player', 'roadshow', '练习生路演片段', quote, meta.startAt, 'idol', `roadshow:${node.id}`, 'hot');
  }
  const knownPublicFacts = playerPublicHistoryFacts();
  if (node && key === 'debut_plan' && fameTotal() >= 12 && knownPublicFacts.length > 0) {
    const quote = evidenceQuotes(evidence, transcript, 'debut_plan_public')[0];
    if (quote) publishPlayerMilestone(`player:debut_prediction:${node.id}`, 'debut_prediction', '新女团出道计划公开', [...knownPublicFacts, quote, '最终成员名单尚未公布。'], meta.startAt, `debut-plan:${node.id}`);
  }
  if (node && key === 'roster_reveal') {
    const pipeline = pipelineState();
    const publiclyRevealed = pipeline.lineup.includes('player') && (pipeline.revealed || (node.premise ?? '').includes('【最终名单】'));
    if (publiclyRevealed) {
      const fact = '公司正式公布最终出道成员名单，玩家在公开名单中。';
      const publicRoster = node.premise?.match(/【最终名单】([^。\n]+)/)?.[1];
      publishPlayerMilestone(`player:roster_reveal:${node.id}`, 'roster_reveal', '新女团成员名单公布', [fact, ...(publicRoster ? [`公开成员名单：${publicRoster}。`] : [])], meta.startAt, `roster-reveal:${node.id}`, fact);
    }
  }
  if (node && key === 'debut') {
    const completed = loadCareer().nodes.find(item => item.id === node.id)?.status === 'done';
    if (completed) {
      const fact = '玩家所属女团已正式出道，出道作品与舞台公开。';
      publishPlayerMilestone(`player:debut:${node.id}`, 'debut_stage', '新女团正式出道舞台', [fact], meta.startAt, `debut:${node.id}`, fact);
    }
  }

  const route = node ? romanceRoute(node) : undefined;
  const romanceKey = node ? romanceNodeKey(node) : undefined;
  if (node && route && romanceKey) {
    const routeTriggers: Partial<Record<RouteType, Partial<Record<string, { evidence: PublicEvidenceKind[]; kind: ForumStoryKind; title: string; policy: ForumNotifyPolicy; board?: ForumSource['board'] }>>>> = {
      idol: { mv_lead: { evidence: ['mv_cast_reveal', 'mv_release'], kind: 'romance_mv', title: '男团回归 MV 女主角身份公开', policy: 'always' } },
      esports: { stream_duo: { evidence: ['livestream_duo'], kind: 'romance_stream', title: '职业选手直播邀请女生双排', policy: 'always' } },
      heir: { luxury_pictorial: { evidence: ['pictorial_release'], kind: 'romance_pictorial', title: '练习生高奢画报公开', policy: 'always' } },
      trainee: { collab_stage: { evidence: ['collab_stage_public'], kind: 'romance_collab_stage', title: '男女练习生合作舞台公开', policy: 'hot' } },
      campus: { festival_stars: { evidence: ['campus_sighting'], kind: 'romance_campus', title: '校园庆典练习生偶遇', policy: 'hot', board: 'daily' } },
    };
    const trigger = routeTriggers[route]?.[romanceKey];
    if (trigger) {
      const quote = trigger.evidence.flatMap(kind => evidenceQuotes(evidence, transcript, kind))[0];
      if (quote) publishSceneEvidence(`romance:${route}:${romanceKey}`, 'romance', trigger.kind, trigger.title, quote, meta.startAt, trigger.board ?? 'idol', `${route}:${romanceKey}:public`, trigger.policy);
    }
  }

  if (!node || (node.occasion !== 'romance' && !key)) {
    const general: { evidence: PublicEvidenceKind; kind: ForumStoryKind; title: string; id: string; board: ForumSource['board'] }[] = [
      { evidence: 'public_photo', kind: 'daily_photo', title: '练习生公开照片引发讨论', id: 'public-photo', board: 'daily' },
      { evidence: 'viral_clip', kind: 'viral_clip', title: '公开视频片段引发讨论', id: 'viral-clip', board: 'idol' },
    ];
    for (const item of general) {
      const quote = evidenceQuotes(evidence, transcript, item.evidence)[0];
      if (quote) publishSceneEvidence(`player:${item.id}:${meta.nodeId ?? meta.startAt}`, 'player', item.kind, item.title, quote, meta.startAt, item.board, `${item.id}:${meta.nodeId ?? meta.startAt}`, 'hot');
    }
  }
}

/** The player's own post must have been public and independently judged discussable by the existing INS reply call. */
export function publishPublicInsPost(post: Post): void {
  if (post.by !== 'me' || !post.wasPublic || post.hiddenAt || post.deleted || post.archived || !post.imgs.length) return;
  const facts = [post.cap.trim(), ...post.imgs.map(img => img.desc.trim())].filter(Boolean).slice(0, 8);
  if (!facts.length) return;
  publishSource(source(`player:ins:${post.id}`, 'player', 'ins_repost', '练习生公开 INS 动态被搬运', facts, post.at, 'daily'), `ins:${post.id}:public`, 'hot');
}

/** A company practice video only becomes a forum event when its scheduled upload is actually public. */
export function publishOfficialPracticeVideo(video: Video): void {
  if (!video.announced || video.forumStoryKind !== 'practice_video' || !video.cast?.some(row => row.me)) return;
  const facts = [
    `公司官方频道公开了练习生视频《${video.titleZh || video.title}》。`,
    video.kind ? `视频类型：${video.kind}。` : '',
    video.img.desc ? `公开视频画面：${video.img.desc}。` : '',
  ].filter(Boolean);
  publishSource(source(`player:practice_video:${video.id}`, 'player', 'practice_video', '公司新公开练习生视频', facts, video.at), `practice-video:${video.id}:public`, 'hot');
}

