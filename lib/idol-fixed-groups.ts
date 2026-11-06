/**
 * 六大公司已出道组合定稿名单（她 + GPT，2026-11-06）。
 *
 * 新存档开局就把这 18 个团写进圈内名册（idol-groups.ts），AI 只能读不能改；
 * 新出道的团不在这里，照旧由 AI 写。
 * 出道时间用相对年份：Y = 存档开局年份（游戏世界从 Y 年 6 月 30 日开始），
 * 建种子时换算成绝对年份存进名册；有月份的一并保留。
 */

export type FixedGroupSeed = {
  name: string;
  ko: string;
  companyId: string;
  kind: "男团" | "女团";
  /** 相对开局年份的出道年偏移（0 = 开局当年） */
  debutY: number;
  debutM?: number;
  style: string;
  tier: "top" | "mid" | "small" | "rookie";
  members: { name: string; ko: string; position: string }[];
};

export const FIXED_GROUPS: FixedGroupSeed[] = [
  // ── SM ──
  {
    name: "AXIOM", ko: "액시옴", companyId: "sm", kind: "男团", debutY: -1, tier: "mid",
    style: "R&B / Dance Pop / Funk；华丽、叛逆、戏剧化的青春美学，精致舞台、高难度编舞、强声乐与复杂和声",
    members: [
      { name: "姜贤宇", ko: "강현우", position: "队长、主唱" },
      { name: "李贤瑞", ko: "이현서", position: "主舞、领 Rapper" },
      { name: "车叙俊", ko: "차서준", position: "主唱、门面" },
      { name: "尹道谦", ko: "윤도겸", position: "主 Rapper" },
      { name: "金志焕", ko: "김지환", position: "领唱、领舞" },
      { name: "文时律", ko: "문시율", position: "主舞、副唱" },
      { name: "吴延灿", ko: "오연찬", position: "门面、副唱、忙内" },
    ],
  },
  {
    name: "CELEST", ko: "셀레스트", companyId: "sm", kind: "男团", debutY: -5, tier: "top",
    style: "Contemporary R&B / Ballad / Dance Pop；浪漫、成熟、优雅，高水准声乐、复杂和声与细腻舞台",
    members: [
      { name: "韩承允", ko: "한승윤", position: "队长、主唱" },
      { name: "车伊俊", ko: "차이준", position: "主舞、领唱、门面" },
      { name: "金贤宰", ko: "김현재", position: "主唱" },
      { name: "徐珉赫", ko: "서민혁", position: "主 Rapper、领舞" },
      { name: "朴志温", ko: "박지온", position: "领唱、忙内" },
    ],
  },
  {
    name: "VELUNE", ko: "벨룬", companyId: "sm", kind: "女团", debutY: -4, tier: "top",
    style: "Dream Pop / Alternative R&B / Art Pop；月光、镜面、梦境与超现实美学，复杂和声与精致视觉",
    members: [
      { name: "徐允夏", ko: "서윤하", position: "队长、主唱" },
      { name: "郑世琳", ko: "정세린", position: "主舞、领唱" },
      { name: "韩瑞妍", ko: "한서연", position: "主唱" },
      { name: "刘采温", ko: "유채온", position: "主 Rapper、领舞" },
      { name: "白伊率", ko: "백이솔", position: "门面、领唱、忙内" },
    ],
  },
  // ── HYBE ──
  {
    name: "ORBITAL", ko: "오비탈", companyId: "hybe", kind: "男团", debutY: -3, tier: "top",
    style: "Alternative Pop / Pop Rock / Synth Pop；青春成长、友情与命运选择，连续专辑叙事",
    members: [
      { name: "权在赫", ko: "권재혁", position: "队长、领唱" },
      { name: "韩以俊", ko: "한이준", position: "主唱" },
      { name: "徐伊澈", ko: "서이철", position: "主舞、领唱" },
      { name: "朴贤昊", ko: "박현호", position: "主 Rapper" },
      { name: "柳河俊", ko: "유하준", position: "领舞、副唱" },
      { name: "郑河温", ko: "정하온", position: "门面、领唱、忙内" },
    ],
  },
  {
    name: "DAYBREAK", ko: "데이브레이크", companyId: "hybe", kind: "男团", debutY: 0, debutM: 4, tier: "mid",
    style: "Indie Pop / Pop Rock / Easy Listening；清爽、自然、少年感，校园与青春日常",
    members: [
      { name: "金道英", ko: "김도영", position: "队长、主唱" },
      { name: "尹时宇", ko: "윤시우", position: "主舞、领唱" },
      { name: "崔俊熙", ko: "최준희", position: "主唱" },
      { name: "李河律", ko: "이하율", position: "领舞、副唱、门面" },
      { name: "朴志勋", ko: "박지훈", position: "主 Rapper" },
      { name: "姜珉宇", ko: "강민우", position: "领唱" },
      { name: "郑伊安", ko: "정이안", position: "副唱、忙内" },
    ],
  },
  {
    name: "HONEYDEW", ko: "허니듀", companyId: "hybe", kind: "女团", debutY: 0, debutM: 3, tier: "mid",
    style: "Indie Pop / UK Garage / Y2K Pop；自然青春、夏日胶片、随性少女感，轻盈抓耳的旋律",
    members: [
      { name: "金娜英", ko: "김나영", position: "队长、领唱" },
      { name: "崔夏琳", ko: "최하린", position: "主舞、领唱" },
      { name: "李秀彬", ko: "이수빈", position: "主唱" },
      { name: "朴多温", ko: "박다온", position: "主 Rapper、领舞" },
      { name: "林瑞雅", ko: "임서아", position: "门面、副唱、忙内" },
    ],
  },
  // ── JYP ──
  {
    name: "UPBEAT", ko: "업비트", companyId: "jyp", kind: "男团", debutY: 0, debutM: 2, tier: "mid",
    style: "Pop Rock / Dance Pop / Hip-hop；热血校园、运动系少年，活力群舞与现场感染力",
    members: [
      { name: "林泰旻", ko: "임태민", position: "队长、主 Rapper" },
      { name: "姜道勋", ko: "강도훈", position: "主唱" },
      { name: "郑贤奎", ko: "정현규", position: "主舞、领唱、门面" },
      { name: "朴延宇", ko: "박연우", position: "领 Rapper、制作" },
      { name: "李泰京", ko: "이태경", position: "主唱" },
      { name: "宋志勋", ko: "송지훈", position: "领舞、副唱" },
      { name: "安瑞俊", ko: "안서준", position: "门面、副唱、忙内" },
    ],
  },
  {
    name: "NOVA9", ko: "노바나인", companyId: "jyp", kind: "男团", debutY: -4, tier: "top",
    style: "Hip-hop / EDM / Rock-influenced Pop；强烈、热血、爆发力，高难度刀群舞与成员参与创作",
    members: [
      { name: "李承浩", ko: "이승호", position: "队长、主 Rapper、制作" },
      { name: "姜俊宇", ko: "강준우", position: "主唱" },
      { name: "徐珉俊", ko: "서민준", position: "主舞、领唱" },
      { name: "韩志成", ko: "한지성", position: "主 Rapper、作词" },
      { name: "崔贤俊", ko: "최현준", position: "主唱" },
      { name: "郑宇硕", ko: "정우석", position: "领舞、领 Rapper" },
      { name: "金泰贤", ko: "김태현", position: "领唱" },
      { name: "朴宰元", ko: "박재원", position: "主舞、副唱、门面" },
      { name: "刘夏俊", ko: "유하준", position: "副唱、忙内" },
    ],
  },
  {
    name: "SUNNY:SIDE", ko: "써니사이드", companyId: "jyp", kind: "女团", debutY: -3, tier: "mid",
    style: "Dance Pop / Funk Pop / Retro Pop；明朗、自信、活泼的都市青春，感染力强的副歌与标志性手势舞",
    members: [
      { name: "申智媛", ko: "신지원", position: "队长、主唱" },
      { name: "金彩律", ko: "김채율", position: "主舞、领唱" },
      { name: "朴恩彩", ko: "박은채", position: "主唱" },
      { name: "崔秀雅", ko: "최수아", position: "主 Rapper" },
      { name: "李佳温", ko: "이가온", position: "领舞、领唱" },
      { name: "洪多恩", ko: "홍다은", position: "门面、副唱、忙内" },
    ],
  },
  // ── YG ──
  {
    name: "KODE:RED", ko: "코드레드", companyId: "yg", kind: "男团", debutY: -2, tier: "mid",
    style: "Hip-hop / Trap / Alternative R&B；街头文化、独立音乐气质与主流偶像制作结合，成员个人风格与原创音乐",
    members: [
      { name: "崔道贤", ko: "최도현", position: "队长、主 Rapper、制作" },
      { name: "姜宇真", ko: "강우진", position: "主唱、门面" },
      { name: "李俊赫", ko: "이준혁", position: "主舞、领 Rapper" },
      { name: "朴俊瑞", ko: "박준서", position: "领唱、制作" },
      { name: "白泰允", ko: "백태윤", position: "领舞、副唱、忙内" },
    ],
  },
  {
    name: "VANTA", ko: "반타", companyId: "yg", kind: "女团", debutY: -5, tier: "top",
    style: "Hip-hop / Trap / R&B；冷酷、自信、奢华街头时尚，高辨识度个人魅力与强烈舞台气场",
    members: [
      { name: "车智妍", ko: "차지연", position: "队长、主 Rapper" },
      { name: "韩伊娜", ko: "한이나", position: "主唱、门面" },
      { name: "郑瑞京", ko: "정서경", position: "主舞、领 Rapper" },
      { name: "金露雅", ko: "김로아", position: "主唱、忙内" },
    ],
  },
  {
    name: "BAD CHERRY", ko: "배드체리", companyId: "yg", kind: "女团", debutY: 0, debutM: 3, tier: "mid",
    style: "Hip-hop / Pop Punk / Dance Pop；甜酷、叛逆、街头少女，复古街头穿搭与强烈 Rap",
    members: [
      { name: "姜智雅", ko: "강지아", position: "队长、主 Rapper" },
      { name: "金娜琳", ko: "김나림", position: "主唱" },
      { name: "徐彩媛", ko: "서채원", position: "主舞、领 Rapper" },
      { name: "李瑞珍", ko: "이서진", position: "领唱、门面" },
      { name: "韩多熙", ko: "한다희", position: "领舞、副唱、忙内" },
    ],
  },
  // ── Starship ──
  {
    name: "MONARCH", ko: "모나크", companyId: "starship", kind: "男团", debutY: -4, tier: "mid",
    style: "Dark Pop / R&B / Dance Pop；成熟、华丽、优雅而具有力量感，戏剧性编舞与精致视觉",
    members: [
      { name: "金在允", ko: "김재윤", position: "队长、主唱" },
      { name: "徐恩灿", ko: "서은찬", position: "主舞、领唱" },
      { name: "韩道源", ko: "한도원", position: "主 Rapper" },
      { name: "申珉锡", ko: "신민석", position: "领唱、门面" },
      { name: "柳灿熙", ko: "류찬희", position: "领舞、领 Rapper" },
      { name: "朴时元", ko: "박시원", position: "主唱、忙内" },
    ],
  },
  {
    name: "ETOILE", ko: "에투알", companyId: "starship", kind: "女团", debutY: -1, tier: "mid",
    style: "Elegant Pop / Dance Pop / Disco；华丽、优雅、自信的现代都市少女，明星气质与精致造型",
    members: [
      { name: "吴世雅", ko: "오세아", position: "队长、领唱" },
      { name: "金瑞彬", ko: "김서빈", position: "主唱" },
      { name: "李彩妍", ko: "이채연", position: "主舞、领唱" },
      { name: "朴允瑟", ko: "박윤슬", position: "门面、领舞" },
      { name: "崔多京", ko: "최다경", position: "主 Rapper" },
      { name: "郑夏媛", ko: "정하원", position: "领唱、忙内" },
    ],
  },
  {
    name: "LOVELYN", ko: "러블린", companyId: "starship", kind: "女团", debutY: -5, tier: "top",
    style: "Dream Pop / Synth Pop / Dance Pop；清新、温柔、梦幻、浪漫少女，轻盈旋律与精致群舞",
    members: [
      { name: "郑秀妍", ko: "정수연", position: "队长、主唱" },
      { name: "朴恩书", ko: "박은서", position: "主唱" },
      { name: "金彩恩", ko: "김채은", position: "主舞、领唱" },
      { name: "吴夏琳", ko: "오하린", position: "领舞、副唱、门面" },
      { name: "李知秀", ko: "이지수", position: "主 Rapper、忙内" },
    ],
  },
  // ── Cube ──
  {
    name: "ROUGE", ko: "루즈", companyId: "cube", kind: "男团", debutY: -1, debutM: 11, tier: "small",
    style: "Alternative Rock / Pop Rock / Hip-hop；青春叛逆、独立音乐气质与自我表达，成员原创歌词与作曲",
    members: [
      { name: "姜时贤", ko: "강시현", position: "队长、主唱、制作" },
      { name: "崔珉奎", ko: "최민규", position: "主 Rapper、作词" },
      { name: "李律", ko: "이율", position: "主舞、领唱、门面" },
      { name: "朴延俊", ko: "박연준", position: "领唱、作曲" },
      { name: "郑宇澈", ko: "정우철", position: "领 Rapper、副唱、忙内" },
    ],
  },
  {
    name: "MUSE:ON", ko: "뮤즈온", companyId: "cube", kind: "女团", debutY: -2, tier: "mid",
    style: "Alternative Pop / Indie Rock / Hip-hop；艺术感、个性表达、反传统少女叙事，成员深度参与创作",
    members: [
      { name: "金艺琳", ko: "김예림", position: "队长、主 Rapper、制作" },
      { name: "徐夏英", ko: "서하영", position: "主唱、作曲" },
      { name: "朴瑞熙", ko: "박서희", position: "主舞、领唱" },
      { name: "郑敏书", ko: "정민서", position: "领 Rapper、作词" },
      { name: "李多贤", ko: "이다현", position: "门面、领唱、忙内" },
    ],
  },
  {
    name: "LUCID", ko: "루시드", companyId: "cube", kind: "女团", debutY: 0, debutM: 1, tier: "small",
    style: "Indie Pop / Funk / Alternative R&B；复古、迷幻、独立少女，70～90 年代复古视觉与 Funk 节奏",
    members: [
      { name: "韩瑞雅", ko: "한서아", position: "队长、领唱" },
      { name: "崔艺恩", ko: "최예은", position: "主唱" },
      { name: "申多妍", ko: "신다연", position: "主舞、领唱" },
      { name: "郑允熙", ko: "정윤희", position: "主 Rapper、作词" },
      { name: "金世雅", ko: "김세아", position: "领舞、门面" },
      { name: "朴夏允", ko: "박하윤", position: "领唱、副 Rapper、忙内" },
    ],
  },
];
