import { kvGet } from "./kv-db";

/** 选择说话语言；翻译格式和显式语言模式仍由各 App 原有设置决定。 */
export const IDOL_LANGUAGE_RULE = "故事发生在韩国，日常交流默认使用韩语；外国人物可根据交谈对象、已有背景和情境使用母语或韩语，不因国籍就强制只说母语。不要因为用户输入中文或看中文译文，就让人物自动改说中文。国籍未写不代表已确定为韩国籍。若当前场景明确设置全中文等语言模式，以该模式为准；翻译格式沿用当前 App 的双语规则。";

/** 只给爱豆人物补充语言背景，不改 float 的双语开关或格式。 */
export function idolLanguageHint(characters: { id: string; name: string }[]): string {
  try {
    const profiles = JSON.parse(kvGet("idol_people_v1") || "{}");
    const people = characters.filter(c => profiles[c.id]);
    if (!people.length) return "";
    const nationalities = people.map(c => profiles[c.id].nationality ? `${c.name}：${profiles[c.id].nationality}` : "").filter(Boolean);
    return `\n\n【说话语言】${IDOL_LANGUAGE_RULE}${nationalities.length ? `\n【人物国籍】${nationalities.join("；")}` : ""}`;
  } catch { return ""; }
}
