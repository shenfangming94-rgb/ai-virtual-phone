/**
 * 爱豆小手机：情缘系统核心（纯函数层）。
 *
 * 规矩（Flora 2026-11-05 深夜定稿，docs/idol/DISCUSSION-2026-11-05-情缘系统.md）：
 * - 男主不固定：世界自然生成带六类身份的人，她结识后看中谁、通讯录加「关注」→ 他进线成男主。
 *   一条线同时只有一个人、不能换人；羁绊值从关注那一刻起算。
 * - 羁绊值：见面 +5 / 电话 +3（日上限 1 次）/ KKT 私聊 +1（日上限 2）。只管剧情解锁，
 *   和十档关系、心动线各管各的，不同步。
 * - 门槛：四节点线 12/28/48/72；五节点电竞线 12/25/40/58/78。
 * - 触发方式三分：invite（他约）/ encounter（世界事实给机会）/ event（事情砸过来）。
 * - 告白：节点走完谁先开口都行，不设机制。
 * 只在新存档（有名册）下跑。存档落地在 lib/idol-romance-live.ts。
 */

export const ROUTE_TYPES = ["idol", "underground", "esports", "heir", "trainee", "campus"] as const;
export type RouteType = typeof ROUTE_TYPES[number];

export const ROUTE_LABEL: Record<RouteType, string> = {
  idol: "爱豆", underground: "地下音乐圈", esports: "电竞", heir: "富二代", trainee: "男练习生", campus: "校园",
};

/** 六类身份关键词（通讯录关注按钮只给这些人；按钮不标类型防剧透） */
export const ROUTE_IDENTITY_HINTS: Record<RouteType, RegExp> = {
  idol: /爱豆|歌手|男团|组合|成员|前辈|偶像/,
  underground: /地下|乐队|rapper|Rapper|驻唱|摇滚/,
  esports: /电竞|职业选手|游戏|战队|主播/,
  heir: /财阀|富二代|集团|继承|社长/,
  trainee: /练习生/,
  campus: /学生|同学|大学生|高中生/,
};

/** 25 个恋爱前固定节点（节点顺序 = 数组顺序）。thresholds 按线长取 */
export type RomanceNodeDef = {
  key: string;
  title: string;
  /** invite=他约（KKT/电话）;encounter=世界事实给机会;event=事情砸过来 */
  trigger: "invite" | "encounter" | "event";
  premise: string;
  /** 这一场在哪（地图上的地方开头，后面可以写具体位置）、几点开始 */
  place: string;
  hour: number;
};

export const ROUTE_NODES: Record<RouteType, RomanceNodeDef[]> = {
  idol: [
    { key: "concert_invite", place: "演唱会场馆 观众席", hour: 19, title: "演唱会邀请", trigger: "invite", premise: "他邀请她去看自己所在男团的演唱会：她第一次以观众身份看见他在大型舞台上被粉丝欢呼簇拥。" },
    { key: "practice_guide", place: "公司 练习室", hour: 15, title: "练习室指导", trigger: "event", premise: "他来到她公司的练习室给练习生们指导（同公司=前辈指导；不同公司=受邀特别导师）。现场有很多同期，但两人之间有只有彼此察觉的微妙气氛。" },
    { key: "mv_lead", place: "清潭洞 MV 拍摄现场", hour: 10, title: "唯一的MV女主角", trigger: "invite", premise: "他主动邀请她出演男团回归 MV 的女主角。重大事业机遇：大幅提升知名度和相关能力（奖励由代码结算）。她尚未出道就出演知名男团 MV，可能引发粉圈讨论、身份猜测、争议和 CP 话题。" },
    { key: "sasaeng", place: "宿舍", hour: 22, title: "私生骚扰风波", trigger: "event", premise: "他的私生比普通粉丝更早发现他们的特殊关系：找到她的 ins，用小号发骚扰、辱骂和警告私信（不进此刻，直接进她的 ins 私信）。恋情尚未大范围公开，这是确定关系前的一次考验。" },
  ],
  underground: [
    { key: "bar_reunion", place: "梨泰院 SIDE B", hour: 21, title: "SIDE B的夜晚", trigger: "encounter", premise: "她偶然来到 梨泰院的 SIDE B（一家地下音乐酒吧，圈里人都知道这家店），没想到他正在驻唱。是已经认识之后的意外重逢，不是初遇：他在台上唱歌，她在台下，人群中对上目光。" },
    { key: "band_mates", place: "弘大 乐队排练室", hour: 19, title: "他的队友", trigger: "invite", premise: "他带她认识自己的乐队成员：她第一次进入他的朋友圈，看到他和队友相处的另一面；队友起哄、打趣，群像互动。" },
    { key: "song_for_her", place: "弘大 他的工作室", hour: 20, title: "小王子的情歌", trigger: "invite", premise: "他约她去自己的工作室（没说是为什么，可能只说过来坐坐、听点东西）。到了以后她才慢慢发现，他专门为她写了一首歌：感情上的重要节点，也是事业机遇（歌曲未来有机会由她演唱、录制或发行）。" },
    { key: "scandal_talk", place: "公司 会议室", hour: 11, title: "绯闻曝光与公司谈话", trigger: "event", premise: "网上突然出现她和他的恋爱绯闻（TheQoo 热帖和韩网评论），公司高层或经纪人 KKT 通知她到公司谈话。他们可能还没正式在一起，却已经要面对外界的猜测。其他被她发展的男主也可能看到这场绯闻。" },
  ],
  esports: [
    { key: "street_glance", place: "明洞", hour: 15, title: "街角擦肩", trigger: "encounter", premise: "他们最开始在网上认识。他来首尔参加电竞比赛，某个普通午后两人在首尔街头偶然擦肩、短暂对视，都不知道眼前的人就是网上那个人。不揭露身份（伏笔）。" },
    { key: "late_night_call", place: "宿舍", hour: 23, title: "失意之夜", trigger: "event", premise: "他因为比赛状态不好被粉丝批评、情绪低落，第一次在没有游戏作理由的情况下主动给她打电话。他不能暴露自己是职业选手，她只知道他今晚心情不好。" },
    { key: "mutual_reveal", place: "公司 练习室", hour: 15, title: "双向掉马", trigger: "encounter", premise: "两半都固定：第一半=公司练习视频真实上传+他自己刷到（场外戏展现「他知道了」）；第二半=公司训练期间一个同期朋友拉她看比赛直播、声音和游戏对上（她亲历）。顺序不定死；掉马前 AI 严禁泄露他的职业身份；街角擦肩伏笔必须回收。" },
    { key: "match_invite", place: "电竞场馆 观众席", hour: 17, title: "职业比赛邀请", trigger: "invite", premise: "掉马之后，他邀请她去现场看自己的职业比赛：她第一次真正走进他的职业世界。" },
    { key: "stream_duo", place: "宿舍", hour: 21, title: "直播双排", trigger: "invite", premise: "他在自己的直播间公开邀请她一起打游戏：当着众多观众的面主动邀请一个女生，弹幕震惊、起哄、猜身份和是否在交往。在「此刻」里用特殊直播浮窗展示弹幕。" },
  ],
  heir: [
    { key: "busking_meet", place: "弘大", hour: 16, title: "街头路演", trigger: "encounter", premise: "她参加一场公开路演或舞蹈表演，他偶然路过，第一次被她的专业能力和舞台表现打动。需要世界提供真实的路演机会（7 月主线路演或补办的那场）。是她自己的才华让他惊艳。" },
    { key: "company_contrast", place: "公司 大厅", hour: 11, title: "公司偶遇", trigger: "event", premise: "他所在的集团因业务合作来到她的公司：平时对练习生大呼小叫的工作人员对他毕恭毕敬。他之前知道她是练习生但可能不知道就在这家公司；发现她后有点高兴也有点得意，直到注意到她复杂的眼神，开始担心她会因他的身份疏远他。核心是双方对阶层差异的不同感受。" },
    { key: "family_banquet", place: "清潭洞 宴会厅", hour: 19, title: "财阀家族宴会", trigger: "invite", premise: "他邀请她出席家族或财阀圈的重要宴会。普通家庭：第一次进入上流社交圈；财阀家庭：本来就熟悉这个圈子。同一节点两种风味。" },
    { key: "luxury_pictorial", place: "清潭洞 摄影棚", hour: 10, title: "高奢画报拍摄", trigger: "invite", premise: "他用自己的资源为她提供高奢品牌画报或时尚杂志拍摄机会（重大事业机遇，奖励由代码结算）。拍摄当天他在现场陪同，看着她完成拍摄。注意：画报在宴会之后。" },
  ],
  trainee: [
    { key: "han_river_ramen", place: "汉江公园", hour: 21, title: "汉江公园的约会", trigger: "invite", premise: "两个还没出道的年轻练习生一起去汉江公园吃便利店泡面：青涩、普通、轻松的青春感，不是奢华约会。" },
    { key: "collab_stage", place: "公司 大练习室", hour: 14, title: "合作舞台", trigger: "encounter", premise: "公司安排男女练习生合作舞台（8 月主线，或羁绊没到时公司另排的新一场）：一起训练、磨合、登台，排练中产生只有彼此察觉的微妙氛围。" },
    { key: "debut_setback", place: "汉江公园", hour: 22, title: "出道危机", trigger: "event", premise: "他原本有一次重要出道机会但突然受挫（出道预备名额被替换、男团出道计划取消或暂停等，由 AI 结合他的家境资源公司情况决定）。为之后真正出道铺垫。" },
    { key: "witness_debut", place: "演唱会场馆 观众席", hour: 19, title: "今夜的星光", trigger: "invite", premise: "他经历挫折后最终成功出道，她亲眼见证他的正式出道舞台（同公司=集体去看师兄 Showcase；不同公司=他邀请的观众）。他比她更早出道是允许的。" },
  ],
  campus: [
    { key: "escape_room", place: "弘大 密室逃脱店", hour: 15, title: "密室逃脱", trigger: "invite", premise: "他邀请她和自己的朋友们一起玩密室逃脱：他的校园朋友和她关系好的同期可能都在，两个朋友圈自然交集。少男少女群像、起哄、热闹的青春感。" },
    { key: "basketball", place: "弘大 他学校的篮球馆", hour: 16, title: "他的篮球赛", trigger: "invite", premise: "她受邀去看他的篮球比赛：平时相处的男生在球场上意气风发的另一面。" },
    { key: "festival_stars", place: "弘大 他的学校", hour: 17, title: "校园庆典", trigger: "invite", premise: "他邀请她去自己的学校参加校园庆典：逛社团摊位、看演出、体验普通学生的校园生活；庆典结束后在操场草地上一起看星星（同一节点后半段）。" },
    { key: "private_concert", place: "弘大 小型演出场地", hour: 20, title: "两个人的演唱会", trigger: "invite", premise: "他为她准备一个小小的私人演唱会或舞台：她上台唱歌跳舞，他一个人坐在台下认真看。「他是我第一个观众，也是那天唯一的观众。」她还没拥有真正属于自己的大型演唱会。" },
  ],
};

export type BondEvent = { at: number; type: "meet" | "call" | "kkt"; d: number };
export type LineState = {
  type: RouteType;
  charId: string;
  /** 关注那一刻（羁绊从这里起算） */
  followedAt: number;
  bond: number;
  /** 已完成/已触发的节点 key（按顺序） */
  doneNodes: string[];
  /** 当前待触发的节点 key */
  nextNode: string;
  /** 电话/KKT 的日上限记账 */
  daily: { day: string; calls: number; kkt: number };
  history: BondEvent[];
};

export const LINE_THRESHOLDS: Record<RouteType, number[]> = {
  idol: [12, 28, 48, 72],
  underground: [12, 28, 48, 72],
  heir: [12, 28, 48, 72],
  trainee: [12, 28, 48, 72],
  campus: [12, 28, 48, 72],
  esports: [12, 25, 40, 58, 78],
};

const pad = (n: number) => String(n).padStart(2, "0");
export const bondDayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function newLine(type: RouteType, charId: string, now = Date.now()): LineState {
  return {
    type, charId, followedAt: now, bond: 0,
    doneNodes: [], nextNode: ROUTE_NODES[type][0]?.key ?? "",
    daily: { day: bondDayKey(now), calls: 0, kkt: 0 },
    history: [],
  };
}

/** 一次见面（连续待一整天只算一次，别重复记） */
export function addMeet(l: LineState, now = Date.now()): LineState {
  return addBond(l, "meet", 5, now);
}

/** 一次电话/视频（每世界日最多计一次） */
export function addCall(l: LineState, now = Date.now()): LineState {
  const day = bondDayKey(now);
  const daily = l.daily.day === day ? { ...l.daily } : { day, calls: 0, kkt: 0 };
  if (daily.calls >= 1) return l;
  daily.calls += 1;
  const next = addBond({ ...l, daily }, "call", 3, now);
  return { ...next, daily };
}

/** 一次有来有回的 KKT 私聊（每世界日上限 +2） */
export function addKkt(l: LineState, now = Date.now()): LineState {
  const day = bondDayKey(now);
  const daily = l.daily.day === day ? { ...l.daily } : { day, calls: 0, kkt: 0 };
  if (daily.kkt >= 2) return l;
  daily.kkt += 1;
  const next = addBond({ ...l, daily }, "kkt", 1, now);
  return { ...next, daily };
}

function addBond(l: LineState, type: BondEvent["type"], d: number, now: number): LineState {
  return { ...l, bond: l.bond + d, history: [...l.history.slice(-50), { at: now, type, d }] };
}

/** 当前节点的门槛（最后一个节点走完返回 null） */
export function nextThreshold(l: LineState): number | null {
  const list = LINE_THRESHOLDS[l.type];
  const idx = l.doneNodes.length;
  return idx < list.length ? list[idx] : null;
}

/** 羁绊到门槛了吗（到了就是待触发，还要等合适场景/他约你） */
export function nodeReady(l: LineState): boolean {
  const t = nextThreshold(l);
  return t != null && l.bond >= t;
}

/** 节点完成：进下一个 */
export function advanceNode(l: LineState, now = Date.now()): LineState {
  if (!l.nextNode) return l;
  const idx = ROUTE_NODES[l.type].findIndex(n => n.key === l.nextNode);
  if (idx < 0) return l;
  const done = [...l.doneNodes, l.nextNode];
  const next = ROUTE_NODES[l.type][idx + 1];
  return { ...l, doneNodes: done, nextNode: next?.key ?? "" };
}
