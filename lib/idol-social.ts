/**
 * 爱豆小手机：微博、豆瓣这些装进来的社交 app 读世界算出来的身份，不用她手动拨「公众人物」开关。
 * 每隔几秒看一眼，变了才往 app 的 meta 集合里写一行 idol_mode：
 * - publicChars：出道爱豆（不是练习生）的角色
 * - publicMe / tierMe：她的关注度三档（出道了一律公众人物）
 * - 豆瓣：公众人物角色只用小号（匿名）吃瓜，她默认匿名
 */

import { loadInstalledCustomApps, readCustomAppCollection, writeCustomAppCollection } from "./custom-app-storage";
import { loadCharacters } from "./character-storage";
import { loadProfiles } from "./idol-people";
import { fameBand, fameTotal } from "./idol-fame";
import { loadTraineeCard } from "./trainee-card";
import { loadCareer, companyOf } from "./idol-career";

const APPS = ["nox.weibo", "nox.douban"];

export function idolPublicChars(): string[] {
  const profiles = loadProfiles();
  return loadCharacters().filter(c => {
    const p = profiles[c.id];
    return p?.isIdol && !/练习生/.test(`${p.role} ${p.group}`);
  }).map(c => c.id);
}

function whoMe(): string {
  const career = loadCareer();
  const c = companyOf(career.companyId)?.name;
  if (career.stage === "idol") return `${c ?? ""} 出道的爱豆`;
  if (career.stage === "trainee") return `${c ?? ""} 的练习生`;
  const fam = loadTraineeCard()?.family;
  return fam === "child" ? "童星" : fam === "star" ? "星二代" : fam === "rich" || fam === "chaebol" ? "有名的富家女" : "想当练习生的普通人";
}

let lastSig = "";
export function socialTick(): void {
  if (!loadTraineeCard()) return;
  const tier = fameBand();
  const row = { id: "idol_mode", on: true, publicChars: idolPublicChars(), publicMe: tier === "公众人物", tierMe: tier, whoMe: whoMe(), altOnly: true, meAnon: true };
  const apps = loadInstalledCustomApps().filter(a => APPS.includes(a.manifest.id));
  const sig = JSON.stringify(row) + apps.map(a => a.id).join(",");
  if (sig === lastSig) return;
  lastSig = sig;
  for (const app of apps) {
    const metas = readCustomAppCollection(app.id, "meta");
    const old = metas.find(m => m.id === "idol_mode");
    if (old && JSON.stringify(old) === JSON.stringify(row)) continue;
    writeCustomAppCollection(app.id, "meta", [...metas.filter(m => m.id !== "idol_mode"), row]);
  }
}

/** 小红书路人写评论时带上：她在这个世界算哪一档、谁是出道爱豆（没开局就空） */
export function idolXhsLine(): string {
  if (!loadTraineeCard()) return "";
  const tier = fameBand();
  const pubs = idolPublicChars().map(id => loadCharacters().find(c => c.id === id)?.name).filter(Boolean);
  const me = tier === "公众人物" ? `用户是公众人物（${whoMe()}）：评论区以她的粉丝为主，夹着路人和少量黑粉，大家知道她是谁。`
    : tier === "小有人知" ? `用户小有人知（${whoMe()}）：评论区大多是陌生网友，偶尔有一两个人认出她。`
    : "用户在网上是普通人：评论区都是不认识她的陌生网友。";
  return `<idol_world>${me}${pubs.length ? `出道的爱豆（公众人物）：${pubs.join("、")}。` : ""}</idol_world>`;
}
