/** 本地词库；国籍不是语言、姓名文化或居住地的强制限制。 */
export type FamilyRegion = { female: string[]; male: string[]; cities: string[]; groups: string[] };
const REGIONS: Record<string, FamilyRegion> = {
  cn: { female: ["林书妍", "陈予宁", "许知夏", "沈明舒", "周清禾"], male: ["陈知远", "林亦舟", "许景和", "沈明轩", "周予安"], cities: ["中国 · 上海", "中国 · 北京", "中国 · 广州", "中国 · 杭州", "中国 · 成都"], groups: ["明川集团", "嘉禾集团", "远晟集团"] },
  kr: { female: ["金秀妍", "李恩珠", "朴素英", "韩智媛", "郑敏书"], male: ["金俊浩", "李道贤", "朴正宇", "韩成俊", "郑贤宇"], cities: ["韩国 · 首尔", "韩国 · 釜山", "韩国 · 仁川", "韩国 · 大邱", "韩国 · 大田"], groups: ["瑞原集团", "韩成集团", "道原集团"] },
  jp: { female: ["佐藤美咲", "高桥由纪", "小林真理", "田中奈绪"], male: ["佐藤健一", "高桥直树", "小林和也", "田中悠介"], cities: ["日本 · 东京", "日本 · 大阪", "日本 · 横滨", "日本 · 福冈"], groups: ["青叶集团", "明和集团", "东原集团"] },
  th: { female: ["素帕妮", "娜琳", "帕查莉", "坎雅"], male: ["阿提查", "纳塔蓬", "帕努", "颂猜"], cities: ["泰国 · 曼谷", "泰国 · 清迈", "泰国 · 普吉", "泰国 · 孔敬"], groups: ["暹星集团", "纳瓦集团", "明泰集团"] },
  us: { female: ["Emily Carter", "Grace Miller", "Olivia Parker", "Sarah Bennett"], male: ["Daniel Carter", "James Miller", "Ethan Parker", "David Bennett"], cities: ["美国 · 洛杉矶", "美国 · 纽约", "美国 · 西雅图", "美国 · 芝加哥"], groups: ["Westbridge Group", "Everwell Group", "Northbay Group"] },
  au: { female: ["Charlotte Wilson", "Amelia Clarke", "Sophie Taylor", "Isla Morgan"], male: ["Oliver Wilson", "Noah Clarke", "Lucas Taylor", "Jack Morgan"], cities: ["澳大利亚 · 悉尼", "澳大利亚 · 墨尔本", "澳大利亚 · 布里斯班", "澳大利亚 · 珀斯"], groups: ["Southern Cross Group", "Clearwater Group", "Harbour Group"] },
};
export function familyRegion(nation: string): FamilyRegion | null {
  const n = nation.trim();
  const key = /澳大利亚|澳洲|Australia/i.test(n) ? "au" : /美国|USA|United States|American/i.test(n) ? "us" : /韩国|한국|Korean|South Korea/i.test(n) ? "kr" : /中国|华人|中国籍|China|Chinese/i.test(n) ? "cn" : /日本|Japan|Japanese/i.test(n) ? "jp" : /泰国|Thailand|Thai/i.test(n) ? "th" : "";
  const region = REGIONS[key];
  if (!region) return null;
  if (/韩裔/.test(n)) return { ...region, female: REGIONS.kr.female, male: REGIONS.kr.male };
  if (/华裔/.test(n)) return { ...region, female: REGIONS.cn.female, male: REGIONS.cn.male };
  return region;
}
export const ENTERTAINMENT_JOBS = ["演员", "歌手", "音乐制作人", "影视导演", "娱乐公司经营者", "电视节目主持人"];
export const ORDINARY_JOBS = ["教师", "建筑设计师", "护士", "工程师", "会计", "行政职员", "餐饮店经营者", "零售店经营者", "公共服务工作人员", "自由职业者"];
export const RICH_JOBS = ["企业创始人", "企业主要股东", "投资公司合伙人", "连锁企业经营者", "家族企业经营者"];
export const CHAEBOL_JOBS = ["家族集团董事长", "家族集团副董事长", "集团董事", "家族控股公司负责人", "集团旗下企业代表"];
export const INDUSTRIES = ["零售与酒店", "食品与消费品", "电子与制造", "金融与投资", "物流与贸易", "文娱与传媒"];
export const WEALTH_SOURCES = ["家族企业经营与持股", "企业投资与股权收益", "家族资产继承与经营", "连锁企业经营收益"];
export const isEntertainmentJob = (job: string) => /演员|歌手|偶像|爱豆|音乐|影视|导演|娱乐|主持|艺人|编剧|经纪|唱片|舞蹈|作曲|制片|模特/.test(job);
