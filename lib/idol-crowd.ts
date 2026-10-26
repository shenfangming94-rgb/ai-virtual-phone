/**
 * 爱豆小手机：大群路人。
 *
 * 练习生群、公司群这种一看就很多人的群：只有几个人有角色卡，其余是「路人」——
 * 只有名字和一句身份，不捏卡、不进通讯录。群名后面的人数把路人算进去；
 * 群聊里路人偶尔冒一两句（用同样的 [名字]: 格式，解析时按名册认人）；
 * 她点路人头像可以「转正」：建成背景人物、进群成员，然后照常加好友、补全卡。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadChatMessages, loadChatSessions, saveChatSessions } from "./chat-storage";
import { createPerson, emptyProfile } from "./idol-people";
import { genKakaoId } from "./idol-kakao";

const KEY = "idol_group_crowd_v1";
export const CROWD_PREFIX = "crowd_";

export type CrowdMember = { id: string; name: string; role: string; promotedTo?: string };
type CrowdAll = Record<string, CrowdMember[]>;

function loadAll(): CrowdAll {
  try { return JSON.parse(kvGet(KEY) || "{}") as CrowdAll; } catch { return {}; }
}
function saveAll(all: CrowdAll) { kvSet(KEY, JSON.stringify(all)); }

export function crowdOf(sessionId: string): CrowdMember[] {
  return loadAll()[sessionId] ?? [];
}

/** 还没转正的路人数 */
export function crowdCount(sessionId: string): number {
  return crowdOf(sessionId).filter(m => !m.promotedTo).length;
}

export const isCrowdId = (id: string | undefined) => Boolean(id?.startsWith(CROWD_PREFIX));

/** 解析群聊回复时用：名单里没有的名字，看看是不是哪个群的路人 */
export function crowdIdByName(name: string): string | undefined {
  for (const list of Object.values(loadAll())) {
    const m = list.find(x => x.name === name && !x.promotedTo);
    if (m) return m.id;
  }
  return undefined;
}

export function crowdById(id: string): CrowdMember | undefined {
  for (const list of Object.values(loadAll())) {
    const m = list.find(x => x.id === id);
    if (m) return m;
  }
  return undefined;
}

// ── 起名字（韩国人名的中文写法） ──

const SURNAMES = ["金", "李", "朴", "崔", "郑", "姜", "赵", "尹", "张", "林", "韩", "吴", "徐", "申", "权", "黄", "安", "宋", "柳", "全", "洪", "高", "文", "孙", "梁", "裴", "白", "许", "南", "沈", "卢", "河", "郭", "成", "车", "朱", "禹", "具", "闵", "俞"];
const GIVEN = ["秀妍", "智雅", "多恩", "惠媛", "敏智", "叙贤", "瑞妍", "允儿", "彩英", "智秀", "睿琳", "恩菲", "素拉", "佳恩", "夏琳", "娜妍", "有真", "瑞熙", "知恩", "海仁", "道妍", "世贞", "藝琳", "宥娜", "敏荷", "智旼", "恩彩", "侑莉", "珉周", "彩媛", "星熙", "秀彬", "叙允", "多彬", "允智", "智允", "惠珍", "素熙", "柔利", "艺智"];
const FOREIGN = ["中国练习生 · 王思雨", "中国练习生 · 陈佳怡", "日本练习生 · 中村美咲", "日本练习生 · 佐藤由衣", "泰国练习生 · Mint", "美国练习生 · Chloe"];

function makeNames(n: number, taken: Set<string>): CrowdMember[] {
  const out: CrowdMember[] = [];
  const roles = ["舞蹈组", "vocal 组", "rap 组", "A 组", "B 组", "C 组", "新来的", "练了三年", "练了一年", "快出道组"];
  let guard = 0;
  while (out.length < n && guard++ < n * 20) {
    let name: string;
    let role: string;
    if (Math.random() < 0.08) {
      const f = FOREIGN[Math.floor(Math.random() * FOREIGN.length)];
      [role, name] = f.split(" · ");
    } else {
      name = SURNAMES[Math.floor(Math.random() * SURNAMES.length)] + GIVEN[Math.floor(Math.random() * GIVEN.length)];
      role = `练习生 · ${roles[Math.floor(Math.random() * roles.length)]}`;
    }
    {
      // 年龄：多数 15～19，少数 12～14 的小练习生，偶尔 20、21
      const r = Math.random();
      const age = r < 0.15 ? 12 + Math.floor(Math.random() * 3) : r < 0.93 ? 15 + Math.floor(Math.random() * 5) : 20 + Math.floor(Math.random() * 2);
      role = `${role} · ${age}岁`;
    }
    if (taken.has(name)) continue;
    taken.add(name);
    out.push({ id: `${CROWD_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, name, role });
  }
  return out;
}

/** 给群塞一批路人（练习生群 30～60 个；另外的群可以传别的身份） */
export function seedCrowd(sessionId: string, count: number, takenNames: string[]): void {
  const all = loadAll();
  const taken = new Set([...takenNames, ...Object.values(all).flat().map(m => m.name)]);
  all[sessionId] = [...(all[sessionId] ?? []), ...makeNames(count, taken)];
  saveAll(all);
}

/** 群聊提示词里加的一段：群里还有很多人，路人偶尔冒一句 */
export function crowdPromptBlock(sessionId: string): string {
  const list = crowdOf(sessionId).filter(m => !m.promotedTo);
  if (!list.length) return "";
  // 最近说过话的路人排前面（接得上话），再随机补几个
  const spoke = new Set(loadChatMessages(sessionId).slice(-60).map(m => m.senderCharacterId).filter(isCrowdId));
  const sample = [...list.filter(m => spoke.has(m.id)), ...[...list.filter(m => !spoke.has(m.id))].sort(() => Math.random() - 0.5)].slice(0, 15);
  return [
    `【群里的其他人】这个群人很多：上面的成员之外还有 ${list.length} 个人，平时大多不说话。`,
    "偶尔可以有一两个路人冒一句（收到、问个小事、接一句玩笑），用同样的 [名字]: 格式，只用下面这些名字；每轮最多一两个路人，话要短，不抢成员的戏，大多数轮次一个路人都不出现。",
    sample.map(m => `${m.name}（${m.role}）`).join("、"),
  ].join("\n");
}

/** 她点了路人：转正成背景人物、进群成员，返回新角色 id */
export function promoteCrowd(sessionId: string, crowdId: string, groupName: string): string | null {
  const all = loadAll();
  const list = all[sessionId] ?? [];
  const m = list.find(x => x.id === crowdId);
  if (!m) return null;
  if (m.promotedTo) return m.promotedTo;
  const char = createPerson(m.name, {
    ...emptyProfile(""), layer: "background", role: m.role, group: "同期练习生",
    met: true, metAt: { at: Date.now(), place: `KakaoTalk 群「${groupName}」` },
  }, null, genKakaoId());
  all[sessionId] = list.map(x => x.id === crowdId ? { ...x, promotedTo: char.id } : x);
  saveAll(all);
  const sessions = loadChatSessions();
  saveChatSessions(sessions.map(s => s.id === sessionId ? { ...s, participantIds: [...(s.participantIds ?? []), char.id] } : s));
  return char.id;
}

/** 消息上记的是路人 id：转正过的换成真角色 id */
export function resolveSenderId(id: string | undefined): string | undefined {
  if (!isCrowdId(id)) return id;
  return crowdById(id!)?.promotedTo ?? id;
}
