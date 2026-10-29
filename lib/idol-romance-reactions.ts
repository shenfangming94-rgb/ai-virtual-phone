/** 新的知情事实只评估一次；消息/谈话复用KKT发件箱，送达前不发布事项。 */
import { simpleLLMCall } from "./api-helpers";
import { loadCharacters } from "./character-storage";
import { loadChatContacts } from "./chat-storage";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import { companyOf, loadCareer, type CareerNode } from "./idol-career";
import { composePersona, getProfile } from "./idol-people";
import { loadTraineeCard } from "./trainee-card";
import { queueMessage, teacherOf } from "./idol-reminders";
import { loadRomance, romanceActorHint, romancePlanFailed, setRomanceReaction } from "./idol-romance";

let busy = false;
export function romanceTick(): void {
  if (busy || !loadTraineeCard()) return;
  const chars = loadCharacters();
  const known = loadRomance().knowledge.find(k => chars.some(c => c.id === k.observerId) && !k.supersededBy && !k.reaction && (k.attempts || 0) < 3 && (!k.retryAt || k.retryAt <= Date.now()));
  if (!known) return;
  const char = loadCharacters().find(c => c.id === known.observerId);
  if (!char) return;
  const slot = resolveBinding(loadBindingConfig(), char.id, "chat");
  const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!config) return;
  const career = loadCareer(), profile = getProfile(char.id);
  const staff = teacherOf()?.id === char.id || /老师|室长|管理|经纪|社长|代表|理事|总监/.test(profile.role || "");
  const canMessage = staff || loadChatContacts().some(c => c.characterId === char.id);
  busy = true;
  void simpleLLMCall(config, [
    { role: "system", content: `你只决定一个知情人物接下来如何处理，不扮演其他人、不新增发现和传播。输出JSON {"action":"observe/ignore/ask/remind/talk","reason":"结合性格和规矩的简短处理理由","intent":"准备私下沟通的具体内容","at":"仅talk，未来YYYY-MM-DD HH:mm","place":"仅talk，私下见面地点"}。observe是先观察，ignore是不干涉，ask是私下了解情况，remind是提醒边界，talk是提出面谈邀请。先了解再决定，不能仅因公司有恋爱禁令就固定严厉约谈。仅知亲密行为或网上说法不能当确认恋情，不惩罚、不强制分手、不替她回应，不宣称已经约谈或向别人汇报。无需联系就选observe/ignore。不要反复安排首次发现，不给她家庭或恋爱打卡任务。${canMessage ? "" : "没有联系渠道，只能observe/ignore，留待以后实际见面。"}` },
    { role: "user", content: `当前时间：${new Date().toLocaleString("sv-SE")}\n${char.name}：\n${composePersona(profile)}\n${romanceActorHint(char.id)}\n本次新知情事实：${JSON.stringify(known)}\n公司：${companyOf(career.companyId)?.name || "未签约"}；已定规则：${career.facts.join("；") || "没有额外规定"}。恋爱禁令是公司规矩，具体处理取决于身份、实际情节和性格，已定规则有明确例外时以已有规则为准；${staff ? "此人是相关老师/管理，只有他本人知情，不能替全公司决定" : "此人不是公司管理，不能替公司处理"}。已有约定：${career.nodes.filter(n => n.fromId === char.id && (n.status === "invite" || n.status === "pending")).map(n => `${n.title} ${new Date(n.dueAt).toLocaleString("sv-SE")}`).join("；") || "无"}` },
  ], { temperature: 0.45, label: "恋情知情后的处理" }).then(res => {
    if (!res.content) throw new Error("没有处理结果");
    const plan = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] || "{}") as { action?: string; reason?: string; intent?: string; at?: string; place?: string };
    // 切档、重开局、或戏中已经处理过，放弃这份过期结果。
    const current = loadRomance().knowledge.find(k => k.id === known.id && k.quote === known.quote);
    if (!current || current.reaction || current.supersededBy) return;
    if (!["observe", "ignore", "ask", "remind", "talk"].includes(plan.action || "") || !plan.reason?.trim()) throw new Error("无效处理");
    let action = plan.action!;
    if (!canMessage && !["observe", "ignore"].includes(action)) action = "observe";
    const result = plan.reason.trim().slice(0, 400);
    if (action === "observe" || action === "ignore") {
      setRomanceReaction(known.id, { action, result, status: "done", at: Date.now() }); return;
    }
    if (!plan.intent?.trim()) throw new Error("缺少沟通内容");
    const at = plan.at ? new Date(plan.at).getTime() : NaN;
    const validTalk = action === "talk" && Number.isFinite(at) && at > Date.now() + 30 * 60e3 && at <= Date.now() + 7 * 864e5 && Boolean(plan.place?.trim());
    const existingTalk = loadCareer().nodes.find(n => n.id.startsWith("romance_talk_") && n.fromId === char.id && (n.status === "invite" || n.status === "pending"));
    if (action === "talk" && existingTalk) {
      setRomanceReaction(known.id, { action: "observe", result: `已有私下谈话安排「${existingTalk.title}」，沿用原安排，新的知情事实供后续交谈参考。`, status: "done", at: Date.now() }); return;
    }
    // 时间地点没说清楚，只私下询问，不凭空造一个谈话日程。
    if (action === "talk" && !validTalk) action = "ask";
    const node: CareerNode | undefined = validTalk ? {
      id: `romance_talk_${known.id}`, kind: "date", title: `${char.name}想和你私下谈谈`,
      dueAt: at, replyBy: at - 15 * 60e3, status: "invite", place: plan.place!.trim().slice(0, 100),
      from: char.name, fromId: char.id, inviterIds: [char.id], participantIds: [char.id], companyId: career.companyId,
      premise: `${char.name}根据自己已知的信息，想私下了解情况。只沿用恋情知情账中的事实、性格和公司规则，不默认其他人知情，不预设处罚。`,
    } : undefined;
    queueMessage(char.id, `你新知道了一点情况，但只限你自己的知情记录。${romanceActorHint(char.id)}\n你决定${action === "ask" ? "私下询问了解" : action === "remind" ? "私下提醒" : "邀请她私下谈谈"}：${plan.intent.trim().slice(0, 600)}。理由：${result}。按你的性格自然说，不把未确认的事说成确定恋情，不假定她答应或已经谈过，不新增处罚或传播。${node ? "" : "本轮只是私下沟通，不创建面谈事项或另写新增邀约标记。"}`, 0, { strictPersona: true, node, romanceId: known.id, dedupeKey: `romance:${known.id}` });
    setRomanceReaction(known.id, { action, result: `${result}；准备私下沟通${node ? `，邀请${new Date(at).toLocaleString("sv-SE")}在${node.place}谈谈` : ""}`, status: "queued", at: Date.now() });
  }).catch(() => {
    if (loadRomance().knowledge.some(k => k.id === known.id && k.quote === known.quote && !k.reaction)) romancePlanFailed(known.id);
  }).finally(() => { busy = false; });
}
