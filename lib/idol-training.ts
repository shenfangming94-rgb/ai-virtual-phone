/**
 * 一年制养成数值核心（第 0 步：纯函数，不碰游戏/存档/AI）。
 * 规则来源：docs/idol/DISCUSSION-2026-11-05-一年养成数值方案.md 与 Flora 的三条拍板。
 * 数字只由这里算；AI 只写文案（家里的老规矩）。
 */
export type Subject = 'vocal' | 'dance' | 'rap' | 'variety' | 'acting' | 'visual' | 'compose' | 'language';
/** NPC 自动训练只练这三项（Flora 定：硬实力） */
export const TRAINABLE_SUBJECTS: Subject[] = ['vocal', 'dance', 'rap'];
/** 月考专业分只用这三项 */
export const EXAM_SUBJECTS: Subject[] = ['vocal', 'dance', 'rap'];
/** 非考核科目（课上练、不参与 NPC 自动训练与月评） */
export const SOFT_SUBJECTS: Subject[] = ['variety', 'acting', 'visual', 'compose', 'language'];
export type Specialty = Subject | 'none';
export type Attitude = 'extreme' | 'diligent' | 'normal' | 'lazy';
export type ClassLetter = 'A' | 'B' | 'C' | 'D';

export const ATTITUDE_LABEL: Record<Attitude, string> = {
  extreme: '极度自律', diligent: '勤奋', normal: '普通', lazy: '懈怠',
};

/** 态度 → 固定课有效完成率 / 每周加练节数 / 普通型每周加练 1 节的概率（按 Flora 拍板：NPC 加练频率与完成率都比方案原表低一点） */
export const ATTITUDES: Record<Attitude, { completion: number; weeklyPractice: number; practiceChance: number }> = {
  extreme: { completion: 0.95, weeklyPractice: 1, practiceChance: 0 },
  diligent: { completion: 0.9, weeklyPractice: 0, practiceChance: 0.5 },
  normal: { completion: 0.85, weeklyPractice: 0, practiceChance: 0.5 },
  lazy: { completion: 0.75, weeklyPractice: 0, practiceChance: 0 },
};

/** 分段升级：当前能力值 → 升 1 分需要的训练进度 */
export const UPGRADE_NEED: Array<{ upto: number; need: number }> = [
  { upto: 59, need: 5 },
  { upto: 79, need: 10 },
  { upto: 89, need: 15 },
  { upto: 100, need: 20 },
];
export function needFor(value: number): number {
  for (const t of UPGRADE_NEED) if (value < t.upto) return t.need;
  return 20; // 100 封顶，不会再升
}

export type Stats = Record<Subject, number>;

export interface Trainee {
  id: string;
  name: string;
  specialty: Specialty;
  stats: Stats;
  /** 每科累计训练进度（允许小数，特长 ×1.5 会产生小数） */
  progress: Record<Subject, number>;
  attitude: Attitude;
  /** 加练偏好；none 时练特长，无特长则练当前最弱可训练科目 */
  practicePreference: Specialty;
  initialClass: ClassLetter;
  /** 上个月的班级（排名分班用） */
  klass: ClassLetter;
}

/** 一次训练结算：progress 加 points，按分段规则循环升级，扣掉消耗。直接改传入对象。
 *  返回涨了多少进度、升了几级（上课管线要把它打成文字给她看）。 */
export function settleProgress(t: Trainee, subject: Subject, points: number): { gained: number; levels: { from: number; to: number }[] } {
  const levels: { from: number; to: number }[] = [];
  let p = (t.progress[subject] || 0) + points;
  while (t.stats[subject] < 100) {
    const need = needFor(t.stats[subject]);
    if (p < need) break;
    p -= need;
    levels.push({ from: t.stats[subject], to: t.stats[subject] + 1 });
    t.stats[subject] += 1;
  }
  t.progress[subject] = p;
  return { gained: points, levels };
}

/** 有效课 ×1（特长 ×1.5） */
export function coursePoints(t: Trainee, subject: Subject): number {
  return t.specialty === subject ? 1.5 : 1;
}

export interface Timetable {
  /** 每周各科固定课节数 */
  weekly: Record<Subject, number>;
  /** 每周训练日数 */
  daysPerWeek: number;
}

/** 方案里 GPT 假设的课表（测试基准用） */
export const TIMETABLE_PLAN: Timetable = {
  weekly: { vocal: 4, dance: 3, rap: 2, variety: 0, acting: 0, visual: 0, compose: 0, language: 0 },
  daysPerWeek: 5,
};

/** 现有星路课表（vocal 3/dance 3/rap 2 是默认值；最终上线用它） */
export const TIMETABLE_CURRENT: Timetable = {
  weekly: { vocal: 3, dance: 3, rap: 2, variety: 0, acting: 0, visual: 0, compose: 0, language: 0 },
  daysPerWeek: 5,
};

/** NPC 一周结算：固定课逐节抽完成率 + 态度加练。rng 返回 [0,1)。 */
export function settleWeek(t: Trainee, tt: Timetable, rng: () => number): void {
  for (const s of TRAINABLE_SUBJECTS) {
    const sessions = tt.weekly[s] || 0;
    for (let i = 0; i < sessions; i++) {
      if (rng() < ATTITUDES[t.attitude].completion) settleProgress(t, s, coursePoints(t, s));
    }
  }
  const a = ATTITUDES[t.attitude];
  let practice = a.weeklyPractice;
  if (!practice && a.practiceChance && rng() < a.practiceChance) practice = 1;
  for (let i = 0; i < practice; i++) {
    const s = practiceSubject(t);
    settleProgress(t, s, coursePoints(t, s));
  }
}

/** 加练科目：偏好 → 当前最弱的可训练科目（方案：无偏好按能力短板安排） */
export function practiceSubject(t: Trainee): Subject {
  if (t.practicePreference !== 'none') return t.practicePreference;
  return [...TRAINABLE_SUBJECTS].sort((a, b) => t.stats[a] - t.stats[b])[0];
}

/** 专业综合分 = 三项平均 × 80% + 最高单科 × 20%（现场发挥修正另算） */
export function examBase(t: Trainee): number {
  const three = EXAM_SUBJECTS.map(s => t.stats[s]);
  const avg = three.reduce((a, b) => a + b, 0) / three.length;
  const max = Math.max(...three);
  return avg * 0.8 + max * 0.2;
}

/** 月考分 = 专业综合分 + 现场发挥修正（rng 均匀 -2 ~ +2） */
export function examScore(t: Trainee, rng: () => number): number {
  return examBase(t) + (rng() * 4 - 2);
}

/** 40 人月考分排序 → 前 10 A 班、11-20 B、21-30 C、31-40 D。原地更新 klass。 */
export function applyMonthlyRank(list: Trainee[], scores: number[]): void {
  const order = list.map((t, i) => ({ t, s: scores[i] })).sort((a, b) => b.s - a.s);
  order.forEach((row, i) => {
    row.t.klass = i < 10 ? 'A' : i < 20 ? 'B' : i < 30 ? 'C' : 'D';
  });
}

export type RunawayBand = 'none' | 'weak' | 'clear' | 'big' | 'runaway';
export const RUNAWAY_LABEL: Record<RunawayBand, string> = {
  none: '非领先', weak: '微弱领先', clear: '明确领先', big: '显著优势', runaway: '断层第一',
};

/** 与第二名的分差 → 断层判定（边界统一：>0 微弱、>2 明确、>5 显著、>8 断层） */
export function runawayBand(first: number, second: number): RunawayBand {
  const gap = first - second;
  if (gap > 8) return 'runaway';
  if (gap > 5) return 'big';
  if (gap > 2) return 'clear';
  if (gap > 0) return 'weak';
  return 'none';
}

/** 班级 → 三项平均的目标区间（NPC 生成用，方案第八节原值） */
export const CLASS_RANGE: Record<ClassLetter, [number, number]> = {
  A: [58, 62],
  B: [52, 56],
  C: [45, 50],
  D: [38, 44],
};

/** 39 人特长分布：vocal 10 / dance 10 / rap 9 / 无 10 */
export const SPECIALTY_POOL: Specialty[] = [
  ...Array<Specialty>(10).fill('vocal'),
  ...Array<Specialty>(10).fill('dance'),
  ...Array<Specialty>(9).fill('rap'),
  ...Array<Specialty>(10).fill('none'),
];

const SURNAMES = ['金', '李', '朴', '崔', '郑', '姜', '赵', '尹', '张', '林', '韩', '吴', '徐', '申', '权', '黄', '安', '宋', '柳', '洪', '全', '高', '文', '孙', '梁', '白', '许', '南', '沈', '罗', '具', '辛', '方', '严', '闵', '咸', '都', '河'];
/** 名字池去重、错开同字：39 个人不能撞名，也不能一水儿的「妍/恩/智」 */
const GIVEN = ['瑞妍', '智秀', '夏恩', '宥娜', '多贤', '艺琳', '彩英', '秀雅', '惠媛', '敏雅', '娜英', '素妍', '允熙', '贞雅', '世林', '艺珍', '河英', '恩菲', '静恩', '贤珠', '佳恩', '宝拉', '真英', '美娜', '孝珠', '智贤', '瑞英', '彩妍', '孝琳', '秀珍', '昭熙', '荷娜', '珉雅', '多仁', '艺瑟', '慧琳', '秀晶', '贞贤', '妍珠', '恩率', '智媛', '佳英', '宝英', '素恩', '秀彬', '彩琳', '海仁', '律喜', '睿恩', '志效', '定延', '素英', '素贤', '惠利', '昭珍', '知敏', '珠贤', '俞真', '美珠', '有真', '恩斌', '彩元', '世正', '孝敏', '善宇', '珍荣', '艺智', '多美', '允真'];
/** 给落地层的去重补名用 */
export const SURNAME_POOL = SURNAMES;
export const GIVEN_POOL = GIVEN;

/** 生成一名普通同期。rng 返回 [0,1)。 */
export function generateNpc(id: string, rng: () => number, opts: { specialty?: Specialty; klass?: ClassLetter; attitude?: Attitude; practicePreference?: Specialty; name?: string } = {}): Trainee {
  const klass = opts.klass ?? (['A', 'B', 'C', 'D'] as ClassLetter[])[Math.floor(rng() * 4)];
  const specialty = opts.specialty ?? SPECIALTY_POOL[Math.floor(rng() * SPECIALTY_POOL.length)];
  const [lo, hi] = CLASS_RANGE[klass];
  const center = (lo + hi) / 2;
  // 特长者偏科：特长科突出（底子+10），其他两科走区间下沿（贴合方案例：55/68/54）
  const mk = (s: Subject) => specialty === s
    ? Math.round(center - 2 + rng() * 8 + 10)
    : Math.round(specialty !== 'none' ? center - 4 + rng() * 4 : center - 2 + rng() * 8);
  const stats: Stats = { vocal: mk('vocal'), dance: mk('dance'), rap: mk('rap'), variety: 45, acting: 45, visual: 50, compose: 45, language: 45 };
  const attitude = opts.attitude ?? (['extreme', 'diligent', 'normal', 'lazy'] as Attitude[])[Math.floor(rng() * 4)];
  return {
    id, name: opts.name ?? `${SURNAMES[Math.floor(rng() * SURNAMES.length)]}${GIVEN[Math.floor(rng() * GIVEN.length)]}`,
    specialty, stats,
    progress: { vocal: 0, dance: 0, rap: 0, variety: 0, acting: 0, visual: 0, compose: 0, language: 0 },
    attitude,
    practicePreference: opts.practicePreference ?? 'none',
    initialClass: klass,
    klass,
  };
}

/** 态度分布池：按比例抽。现实感（极度自律最少、懈怠次之、普通最多） */
export const ATTITUDE_POOL_REALISTIC: Attitude[] = [
  ...Array<Attitude>(2).fill('extreme'),
  ...Array<Attitude>(10).fill('diligent'),
  ...Array<Attitude>(20).fill('normal'),
  ...Array<Attitude>(8).fill('lazy'),
];
/** A 班态度池：天才反而懒/普通（叙事：底子好的人未必最努力；规则统一、非暗改） */
export const ATTITUDE_POOL_TOP: Attitude[] = [
  ...Array<Attitude>(12).fill('diligent'),
  ...Array<Attitude>(20).fill('normal'),
  ...Array<Attitude>(8).fill('lazy'),
];
export const ATTITUDE_POOL_UNIFORM: Attitude[] = ['extreme', 'diligent', 'normal', 'lazy'];

/** 生成 39 名同期：A10 B10 C9 D10（玩家占 C 班一个坑）。A 班态度走 TOP 池（无极度自律），其余走现实池。 */
export function generateRoster(rng: () => number, attitudePool: Attitude[] = ATTITUDE_POOL_REALISTIC): Trainee[] {
  const pool = [...SPECIALTY_POOL];
  const out: Trainee[] = [];
  let n = 0;
  for (const klass of ['A', 'B', 'C', 'D'] as ClassLetter[]) {
    const count = klass === 'C' ? 9 : 10;
    for (let i = 0; i < count; i++) {
      const sp = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      const ap = klass === 'A' ? ATTITUDE_POOL_TOP : attitudePool;
      const attitude = ap[Math.floor(rng() * ap.length)];
      out.push(generateNpc(`npc-${n++}`, rng, { klass, specialty: sp, attitude }));
    }
  }
  return out;
}
