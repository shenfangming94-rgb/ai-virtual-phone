/** 恋情知情账：只保存有明确来源的事实，不把私下知情写成公开动态。 */
import { kvGet, kvSet } from "./kv-db";

const KEY = "idol_romance_v1";
export type RomanceKnowledge = {
  id: string; observerId: string; observerName: string; partnerId?: string; partnerName?: string;
  level: "intimacy" | "confirmed" | "report";
  source: "witness" | "disclosure" | "relay" | "ins";
  sourceId: string; sourceName?: string; quote: string; at: number;
  reaction?: { action: string; result: string; status: "queued" | "done"; at: number; delivered?: { sessionId: string; messageId: string; text: string } };
  outcomes: { sourceId: string; quote: string; text: string; at: number }[];
  attempts?: number; retryAt?: number; supersededBy?: string;
};
type Exposure = { id: string; text: string; at: number };
type State = { knowledge: RomanceKnowledge[]; exposures: Exposure[] };
export function loadRomance(): State {
  try { const s = JSON.parse(kvGet(KEY) || "null"); if (s) return { knowledge: s.knowledge || [], exposures: s.exposures || [] }; } catch { /* 旧存档无此字段 */ }
  return { knowledge: [], exposures: [] };
}
function save(s: State): void { kvSet(KEY, JSON.stringify(s)); }
export const ROMANCE_PRIVACY_RULE = "恋情知情严格按下列记录和本场实际发生的事区分：人物关系档案、旁白背景、其他人的私密记忆不等于这个人物知情。无明确来源就不知道；普通同行、吃饭、约会不构成发现。未记录的怀疑不作事实，不安排调查或传播。不在场、已经离场的人不能凭空目击。私下知情不等于公司全体知情；公司知情不等于粉丝媒体知情。传播、确认或处理必须在剧情中实际发生，不补写场外传播。";
const uncertain = /也许|可能|似乎|好像|仿佛|不确定|怀疑|猜测|如果|假如|要是|会不会|是不是|是否|[？?]|开玩笑|排练|演戏|台词|假装|场外|设想|梦见|梦到|据说|听说|不要.{0,8}(?:交往|恋爱)|没有(?:在)?交往|不是.{0,8}(?:恋人|男女朋友)|否认|没(?:有)?(?:看见|看到|听见|听到)/;
const intimate = /接吻|亲吻|吻住|吻上|吻了/;
const confirmed = /(?:我们|我|她|他们|两人).{0,35}(?:在交往|在.{0,12}交往|交往了|在谈恋爱|是恋人)|(?:和|与).{1,24}(?:正在交往|在交往|在谈恋爱)|(?:是|成了)(?:我|她|他|你)的(?:男|女)朋友|(?:承认|确认).{0,16}(?:正在交往|在谈恋爱|恋人关系)/;
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function explicitTelling(quote: string, speaker: string, listener: string): boolean {
  if (speaker === listener) return false;
  return new RegExp(`${escaped(speaker)}[^。！？\n]{0,20}(?:告诉|告知|对)[^。！？\n]{0,12}${escaped(listener)}|${escaped(listener)}[^。！？\n]{0,16}(?:听见|听到)[^。！？\n]{0,16}${escaped(speaker)}`).test(quote);
}
export type RomanceObservation = { observer?: string; partner?: string; source?: string; sourceName?: string; level?: string; quote?: string };
type Person = { id: string; name: string };

/** 语义提取交给原结算调用；本地必须核对原文、知情人物、明确线索及转告来源。宁缺毋滥。 */
export function recordSceneRomance(input: {
  sourceId: string; at: number; transcript: string; present: Person[]; people?: Person[]; playerName?: string;
  witnessTranscript?: (id: string) => string; observations?: RomanceObservation[];
  outcomes?: { observer?: string; partner?: string; quote?: string; text?: string }[];
}): string[] {
  const s = loadRomance(); const added: string[] = [];
  for (const o of Array.isArray(input.observations) ? input.observations : []) {
    if (!o || typeof o !== "object") continue;
    const who = input.present.find(p => p.name === o.observer), partner = (input.people || input.present).find(p => p.name === o.partner);
    const quote = String(o.quote || "").trim();
    if (!who || !partner || who.id === partner.id || quote.length < 8 || quote.length > 500 || uncertain.test(quote)) continue;
    const text = input.witnessTranscript?.(who.id) ?? input.transcript;
    // 必须是同一段原文，明确包含两人，不能把整场在场当成亲眼看见。
    if (!text.includes(quote) || !quote.includes(who.name) || !quote.includes(partner.name)) continue;
    if (!/看见|看到|撞见|目睹|听见|听到|告诉|告知|承认|对.{0,20}说/.test(quote)) continue;
    if (o.level !== "intimacy" && o.level !== "confirmed") continue;
    if (o.source === "witness" && !input.present.some(p => p.id === partner.id)) continue;
    if (o.source === "witness" && !new RegExp(`${escaped(who.name)}[^。！？\n]{0,24}(?:看见|看到|撞见|目睹)`).test(quote)) continue;
    if (o.level === "intimacy" ? !intimate.test(quote) : !confirmed.test(quote) || o.source === "witness") continue;
    if (!["witness", "disclosure", "relay"].includes(o.source || "")) continue;
    if (o.source === "disclosure") {
      // 明确告知只能由当事人作出；其他人说出来必须走已知情来源的转告验证。
      const speaker = o.sourceName;
      if (!speaker || (speaker !== partner.name && speaker !== input.playerName) || !explicitTelling(quote, speaker, who.name)) continue;
      if (speaker === partner.name && !input.present.some(p => p.id === partner.id)) continue;
    }
    if (o.source === "relay") {
      const from = input.present.find(p => p.name === o.sourceName);
      const known = from && s.knowledge.find(k => k.observerId === from.id && k.partnerId === partner.id && k.level === o.level);
      if (!from || !known || !explicitTelling(quote, from.name, who.name)) continue;
    }
    const old = s.knowledge.find(k => k.observerId === who.id && k.partnerId === partner.id && k.level === o.level);
    if (old) continue;
    if (o.level === "intimacy" && s.knowledge.some(k => k.observerId === who.id && k.partnerId === partner.id && k.level === "confirmed")) continue;
    const id = `${input.sourceId}:${who.id}:${partner.id}:${o.level}`;
    if (o.level === "confirmed") for (const prior of s.knowledge) {
      if (prior.observerId === who.id && prior.partnerId === partner.id && prior.level !== "confirmed") prior.supersededBy = id;
    }
    s.knowledge.push({ id, observerId: who.id, observerName: who.name, partnerId: partner.id, partnerName: partner.name, level: o.level, source: o.source as RomanceKnowledge["source"], sourceId: input.sourceId, sourceName: o.sourceName, quote, at: input.at, outcomes: [] });
    added.push(id);
  }
  for (const o of Array.isArray(input.outcomes) ? input.outcomes : []) {
    if (!o || typeof o !== "object") continue;
    const who = input.present.find(p => p.name === o.observer), partner = (input.people || input.present).find(p => p.name === o.partner);
    const quote = String(o.quote || "").trim(), text = String(o.text || "").trim();
    if (!who || !partner || !text || text.length > 400 || quote.length < 4 || quote.length > 500 || !quote.includes(who.name) || uncertain.test(quote)) continue;
    if (!(input.witnessTranscript?.(who.id) ?? input.transcript).includes(quote)) continue;
    const k = [...s.knowledge].reverse().find(k => k.observerId === who.id && k.partnerId === partner.id);
    if (!k || k.outcomes.some(x => x.sourceId === input.sourceId && x.quote === quote)) continue;
    // 后续以实际台词/动作原文为准，不把模型概括中额外添加的结论落成事实。
    k.outcomes.push({ sourceId: input.sourceId, quote, text: quote, at: input.at });
    // 已经在戏里处理过，不再后台重复安排首次约谈。
    k.reaction = { action: "scene", result: quote, status: "done", at: input.at };
  }
  save(s); return added;
}

/** 网上已传播的是帖子/说法，不自动等于恋情已获当事人确认。 */
export function recordInsRomance(postId: string, reason: string, observer?: Person, partner?: Person): void {
  const s = loadRomance(), id = `ins:${postId}`;
  if (!s.exposures.some(e => e.id === id)) s.exposures.push({ id, text: `网上传播了一条被解读为恋情线索的 ins 帖子：${reason}。仅表示该说法已公开，不表示交往已被证实。`, at: Date.now() });
  if (observer && !s.knowledge.some(k => k.id === `${id}:${observer.id}`)) s.knowledge.push({ id: `${id}:${observer.id}`, observerId: observer.id, observerName: observer.name, partnerId: partner?.id, partnerName: partner?.name, level: "report", source: "ins", sourceId: id, quote: reason, at: Date.now(), outcomes: [] });
  save(s);
}
export function setRomanceReaction(id: string, reaction: NonNullable<RomanceKnowledge["reaction"]>): void {
  const s = loadRomance(), k = s.knowledge.find(k => k.id === id); if (!k) return;
  k.reaction = reaction; save(s);
}
export function romancePlanFailed(id: string): void {
  const s = loadRomance(), k = s.knowledge.find(k => k.id === id); if (!k) return;
  k.attempts = (k.attempts || 0) + 1; k.retryAt = Date.now() + 5 * 60e3; save(s);
}
export function romanceMessageDelivered(id: string, message: { id: string; sessionId: string; content: string }): void {
  const s = loadRomance(), k = s.knowledge.find(k => k.id === id);
  if (k?.reaction?.status === "queued") {
    k.reaction.status = "done";
    k.reaction.delivered = { sessionId: message.sessionId, messageId: message.id, text: message.content.slice(0, 1200) };
    save(s);
  }
}
export function romanceMessageExpired(id: string): void {
  const s = loadRomance(), k = s.knowledge.find(k => k.id === id);
  if (k?.reaction?.status === "queued") {
    k.reaction = { action: "observe", result: "拟定邀请未送达且时间已过，未发生谈话；不推定她拒绝或缺席，等待实际剧情。", status: "done", at: Date.now() };
    save(s);
  }
}
function describe(k: RomanceKnowledge): string {
  if (k.supersededBy) return `${k.observerName}关于她与${k.partnerName || "对象"}的早期线索已由明确告知更新，以后面的确认记录为准，不再按首次发现处理。`;
  return `${k.observerName}关于她${k.partnerName ? `与${k.partnerName}` : ""}：${k.level === "confirmed" ? "被明确告知交往" : k.level === "intimacy" ? "仅目击明确亲密行为，关系未确认" : "仅知道网上的说法，恋情未确认"}。来源：${k.quote}${k.reaction ? `。处理${k.reaction.status === "queued" ? "意向（消息尚未送达，不算已约谈）" : "记录"}：${k.reaction.result}${k.reaction.delivered ? `。实际已发消息（不等于她已答应或谈话已完成）：${k.reaction.delivered.text}` : ""}` : ""}${k.outcomes.length ? `。实际后续：${k.outcomes.slice(-4).map(x => x.text).join("；")}` : ""}`;
}
export function romanceActorHint(id: string): string {
  const s = loadRomance();
  const own = s.knowledge.filter(k => k.observerId === id);
  const related = s.knowledge.filter(k => k.partnerId === id);
  return `【恋情信息边界】${ROMANCE_PRIVACY_RULE}\n你的知情记录：${own.map(describe).join("\n") || "无，不从系统背景推断别人恋爱"}${related.length ? `\n你是当事人，不自动知道第三人已知情，除非你亲自参与了告知或后续沟通。` : ""}${s.exposures.length ? `\n公开可见说法（不等于你已核实）：${s.exposures.slice(-5).map(e => e.text).join("\n")}` : ""}`;
}
export function romanceSceneHint(): string {
  const s = loadRomance();
  return `【恋情知情账（旁白使用，不是所有人的共同记忆）】${ROMANCE_PRIVACY_RULE}\n${s.knowledge.map(describe).join("\n") || "暂无第三人明确知情记录"}\n${s.exposures.map(e => e.text).join("\n")}`;
}
export const ROMANCE_EXTRACTION_RULE = `另输出 romanceObservations 数组（没有就空）：每项 {"observer":"实际知情人姓名","partner":"她的交往对象姓名","source":"witness/disclosure/relay","sourceName":"实际说出告知或转告的人姓名，witness省略","level":"intimacy/confirmed","quote":"包含知情人和对象姓名、明确看见或告知行为的一段连续剧情原文，逐字引用"}。只提取本场明确发生的接吻目击或明确告知交往；intimacy只代表亲密行为，confirmed只给明确告知或承认交往。disclosure仅指她或对象本人亲口告知，其他人告知一律relay。普通吃饭、同行、约会、猜测和看不清的线索全部忽略；恋人档案不等于被发现。转告必须由确实知情的人实际说出，禁止补写场外发现。另输出 romanceOutcomes 数组（没有就空）：{ "observer":"已知情人物姓名","partner":"对象姓名","quote":"包含处理者姓名的连续原文","text":"本场实际说定的处理结果，谁知道到哪一步、是否保密、具体要求或回应"}；没发生处理就不写，不能把计划当结果。`;
