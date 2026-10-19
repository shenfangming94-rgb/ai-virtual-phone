// 购物 app 送礼扩展的 AI 调用。char 相关的（挑礼物、写评价、编地址）带上他的人设、记忆和最近聊天；
// 路人评价、问大家、客服只用购物 app 自己的 API，不带角色。
import { sendLLMRequest } from "./chat-engine";
import type { ChatMessage, ChatSession } from "./chat-storage";
import { loadCharacters } from "./character-storage";
import { generateGroupRawCompletion } from "./group-chat-engine";
import { resolveUserIdentity } from "./settings-storage";
import { resolveShoppingApiConfig } from "./shopping-engine";
import type { ShoppingProduct } from "./shopping-types";
import type { GiftAddress, KefuMessage, ProductQA, ProductReview } from "./shopping-gift-store";
import { giftId } from "./shopping-gift-store";

type Fields = Record<string, string[]>;

/** 按 ===块名=== 切块，块里「键：值」，同名键可以有多行 */
function parseBlocks(text: string, name: string): Fields[] {
    const blocks: Fields[] = [];
    const re = new RegExp(`=+\\s*${name}\\s*=+([\\s\\S]*?)(?==+\\s*[^=\\n]+?\\s*=+|$)`, "g");
    for (const match of text.matchAll(re)) {
        const fields: Fields = {};
        let lastKey = "";
        for (const rawLine of match[1].split("\n")) {
            const line = rawLine.trim();
            if (!line) continue;
            const kv = line.match(/^([^：:]{1,8})[：:]\s*(.*)$/);
            if (kv) {
                lastKey = kv[1].trim();
                (fields[lastKey] ||= []).push(kv[2].trim());
            } else if (lastKey) {
                const list = fields[lastKey];
                list[list.length - 1] = `${list[list.length - 1]}${list[list.length - 1] ? "\n" : ""}${line}`;
            }
        }
        blocks.push(fields);
    }
    return blocks;
}

const one = (fields: Fields | undefined, key: string) => (fields?.[key]?.[0] || "").replace(/^[（(].*[)）]$/, "").trim();

function userName(charId?: string): string {
    try {
        return resolveUserIdentity(charId, "chat")?.name || "她";
    } catch {
        return "她";
    }
}

function money(value: string): number {
    const n = Number(String(value).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

export function formatYuan(amount: number): string {
    return `¥${amount.toFixed(2)}`;
}

/** 以这个 char 的身份调一次（人设、记忆、最近聊天都在） */
async function charGenerate(charId: string, instruction: string): Promise<string> {
    const session: ChatSession = {
        id: `shopping_gift_${charId}_${Date.now().toString(36)}`,
        contactId: `group_shopping_gift`,
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
        isPinned: false,
        bilingualTranslationEnabled: false,
        isGroup: true,
        groupName: "购物",
        participantIds: [charId],
    };
    const task: ChatMessage = {
        id: `shopping-gift-task-${Date.now()}`,
        sessionId: session.id,
        role: "user",
        content: `[购物App] ${instruction}`,
        status: "sent",
        createdAt: new Date().toISOString(),
    };
    const result = await generateGroupRawCompletion(session, [task], { appTags: [], appId: "shopping_gift" });
    return result.text || "";
}

async function plainGenerate(prompt: string): Promise<string> {
    const config = resolveShoppingApiConfig();
    if (!config) throw new Error("未找到可用的 API 配置");
    return sendLLMRequest(config, null, [{ role: "user", content: prompt }], [], { characterName: "购物App" }, { skipOutputRegex: true, appId: "shopping" });
}

const PRICE_RULE = "价格完全按你的人设：先判断你真实的身份和消费水平（学生、普通上班族、家境好、富家子弟、豪门等），花的钱必须符合这个水平。家里很有钱的送上万甚至几十万的东西很正常，送几十几百反而不像你；普通学生就是几十到几百。";

export type CharGiftPick = {
    product: ShoppingProduct;
    amount: number;
    note: string;
    tell: boolean;
    wishIndex?: number;
};

function productFromFields(f: Fields | undefined, fallbackTitle = ""): { product: ShoppingProduct; amount: number } | null {
    const title = one(f, "名称") || fallbackTitle;
    const amount = money(one(f, "价格"));
    if (!title || !amount) return null;
    const merchant = one(f, "店铺") || "官方旗舰店";
    const subtitle = one(f, "说明") || title;
    return {
        amount,
        product: {
            id: `gift_${giftId("p")}`,
            title,
            merchantLabel: merchant,
            priceLabel: formatYuan(amount),
            tagLabel: "礼物",
            subtitle,
            detail: one(f, "详情") || subtitle,
            previewIcon: [...(one(f, "图标") || "🎁")][0] || "🎁",
            tone: "blush",
        },
    };
}

/** 他主动挑一份礼物。reason 是起因（节日/纪念日/想她了/心愿单），wish 是她心愿单里的东西 */
export async function pickCharGift(charId: string, reason: string, wish: ShoppingProduct[] = []): Promise<CharGiftPick | null> {
    const name = userName(charId);
    const wishText = wish.length
        ? `\n她的心愿单（你偷偷看到的）：\n${wish.map((w, i) => `${i + 1}. ${w.title}（${w.merchantLabel}，${w.priceLabel}）`).join("\n")}\n从里面挑一件最想给她买的，在「挑」里写序号，名称、店铺、价格照抄那一件。`
        : "";
    const instruction = [
        `你要在购物 App 上偷偷给${name}买一份礼物，寄到她那里。`,
        `起因：${reason}`,
        wishText,
        "要求：",
        `- ${PRICE_RULE}`,
        "- 送什么按你对她的了解和你们最近聊过的事来定，要具体，像购物 App 里真能买到的商品。",
        `- 留言是写在包裹里给${name}的一句话，用你平时跟她说话的口吻；不想写就留空。`,
        "- 告诉她：按你的性格决定，下单后马上跟她说，还是不说、等到货当惊喜。",
        "只输出下面的格式，不要别的内容：",
        "===礼物===",
        ...(wish.length ? ["挑："] : []),
        "名称：",
        "店铺：",
        "价格：（只写数字）",
        "说明：（一句卖点）",
        "详情：（两三句商品介绍）",
        "图标：（一个 emoji）",
        "留言：",
        "告诉她：是 或 否",
    ].filter(Boolean).join("\n");
    const raw = await charGenerate(charId, instruction);
    const f = parseBlocks(raw, "礼物")[0];
    const wishIndex = wish.length ? Number(one(f, "挑")) - 1 : -1;
    const picked = wishIndex >= 0 && wishIndex < wish.length ? wish[wishIndex] : null;
    const built = picked
        ? { product: { ...picked, id: `gift_${giftId("p")}`, tagLabel: "礼物" }, amount: money(picked.priceLabel) }
        : productFromFields(f);
    if (!built) return null;
    return {
        product: built.product,
        amount: built.amount,
        note: one(f, "留言").replace(/^(无|空|不写)$/, ""),
        tell: /^是/.test(one(f, "告诉她")),
        wishIndex: picked ? wishIndex : undefined,
    };
}

/** 他在聊天里发了 [礼物:xx]：补全成一件真商品 */
export async function enrichChatGift(charId: string, giftName: string): Promise<{ product: ShoppingProduct; amount: number } | null> {
    const name = userName(charId);
    const instruction = [
        `你刚在聊天里送了${name}一份礼物「${giftName}」，现在在购物 App 上下单寄给她。把这件礼物写成购物 App 里的真实商品。`,
        PRICE_RULE,
        "只输出：",
        "===礼物===",
        `名称：（以「${giftName}」为准，可以补全品牌型号）`,
        "店铺：",
        "价格：（只写数字）",
        "说明：",
        "详情：",
        "图标：（一个 emoji）",
    ].join("\n");
    const raw = await charGenerate(charId, instruction);
    return productFromFields(parseBlocks(raw, "礼物")[0], giftName);
}

/** 他收到礼物后写的评价 */
export async function writeCharReview(charId: string, item: { title: string; priceLabel: string; detail?: string }, note: string): Promise<{ stars: number; text: string } | null> {
    const name = userName(charId);
    const instruction = [
        `你收到了${name}送你的「${item.title}」（${item.priceLabel}）。${note ? `她在订单里写的备注：${note}` : "她没写备注。"}`,
        "现在你在购物 App 给这件商品写评价。评价是公开的，所有买家都能看到，所以按你的性格写：说用起来的感受，提不提是谁送的、怎么提，都看你。一到三句，像真人写的评价。",
        "只输出：",
        "===评价===",
        "星级：（1到5的数字）",
        "内容：",
    ].join("\n");
    const raw = await charGenerate(charId, instruction);
    const f = parseBlocks(raw, "评价")[0];
    const text = one(f, "内容");
    if (!text) return null;
    const stars = Math.min(5, Math.max(1, Math.round(Number(one(f, "星级")) || 5)));
    return { stars, text };
}

/** 按人设给他编一个收货地址 */
export async function writeCharAddress(charId: string): Promise<GiftAddress | null> {
    const char = loadCharacters().find(c => c.id === charId);
    const instruction = [
        "按你的人设和你生活的世界，写你自己现在的收货地址（住哪就写哪，学生可以写学校宿舍或家里）。",
        "只输出：",
        "===地址===",
        `收件人：（你的名字，默认${char?.name || ""}）`,
        "电话：（中间打码，如 138****5521）",
        "地址：（城市 + 区/路 + 小区或学校 + 门牌，不写省份）",
    ].join("\n");
    const raw = await charGenerate(charId, instruction);
    const f = parseBlocks(raw, "地址")[0];
    const address = one(f, "地址");
    if (!address) return null;
    return { name: one(f, "收件人") || char?.name || "", phone: one(f, "电话") || "1**********", address };
}

function describeProduct(p: { title: string; merchantLabel: string; priceLabel: string; detail?: string; subtitle?: string }): string {
    return `名称：${p.title}\n店铺：${p.merchantLabel}\n价格：${p.priceLabel}\n介绍：${p.detail || p.subtitle || ""}`;
}

/** 商品页的路人评价 + 问大家，一次调用 */
export async function generateProductExtras(p: ShoppingProduct): Promise<{ reviews: ProductReview[]; qa: ProductQA[] }> {
    const prompt = [
        "你在扮演购物 App 的商品评价区。给下面这件商品写路人买家的评价和「问大家」。",
        describeProduct(p),
        "",
        "要求：",
        "- 评价 6 条。昵称像真实网购用户的昵称，每个人口吻都不一样；大多是 4、5 星，偶尔 3 星或更低；说具体的使用感受，有夸有小吐槽，不要像广告。",
        "- 问大家 4 个问题，是买之前会真心问的问题，每个问题 1 到 2 个口语化的回答，再写一个总回答数。",
        "只输出下面的格式：",
        "===评价===",
        "昵称：",
        "星级：（数字）",
        "内容：",
        "（6 个 ===评价=== 块）",
        "===问答===",
        "问题：",
        "回答：昵称｜内容",
        "回答数：（数字）",
        "（4 个 ===问答=== 块）",
    ].join("\n");
    const raw = await plainGenerate(prompt);
    const now = new Date().toISOString();
    const reviews = parseBlocks(raw, "评价").map(f => ({
        id: giftId("rv"),
        author: one(f, "昵称") || "匿名买家",
        stars: Math.min(5, Math.max(1, Math.round(Number(one(f, "星级")) || 5))),
        text: one(f, "内容"),
        at: now,
    })).filter(r => r.text).slice(0, 8);
    const qa = parseBlocks(raw, "问答").map(f => parseQA(f, now)).filter((q): q is ProductQA => Boolean(q)).slice(0, 6);
    if (reviews.length === 0 && qa.length === 0) throw new Error("没有生成出评价");
    return { reviews, qa };
}

function parseQA(f: Fields, at: string): ProductQA | null {
    const q = one(f, "问题");
    if (!q) return null;
    const answers = (f["回答"] || []).map(line => {
        const [author, ...rest] = line.split(/[｜|]/);
        const text = rest.join("｜").trim();
        return text ? { author: author.trim() || "匿名买家", text } : { author: "匿名买家", text: author.trim() };
    }).filter(a => a.text);
    const total = Math.max(answers.length, Math.round(Number(one(f, "回答数")) || answers.length));
    return { id: giftId("qa"), q, answers, total, at };
}

/** 她在「问大家」里提问，路人来回答 */
export async function answerQuestion(p: ShoppingProduct, question: string): Promise<ProductQA["answers"]> {
    const prompt = [
        "你在扮演购物 App「问大家」里买过这件商品的路人。",
        describeProduct(p),
        `有人提问：${question}`,
        "写 1 到 3 个已购买家的回答，口语化，各人口吻不同，说实话。",
        "只输出：",
        "===问答===",
        `问题：${question}`,
        "回答：昵称｜内容",
    ].join("\n");
    const raw = await plainGenerate(prompt);
    const f = parseBlocks(raw, "问答")[0];
    return f ? parseQA(f, new Date().toISOString())?.answers ?? [] : [];
}

/** 店铺客服回复；砍价时可能送券 */
export async function kefuReply(p: ShoppingProduct, kefuName: string, history: KefuMessage[]): Promise<{ text: string; coupon: number }> {
    const price = money(p.priceLabel);
    const cap = Math.max(3, Math.min(50, Math.floor(price * 0.2)));
    const prompt = [
        `你是购物 App 上「${p.merchantLabel}」的店铺客服，名字叫${kefuName}。顾客正在咨询这件商品：`,
        describeProduct(p),
        "",
        "用网购客服的口吻回复（会叫「亲」「亲亲」，热情、有点套路），可以聊商品细节、尺码、发货、售后。价格不能直接改；顾客想便宜点、软磨硬泡或者嘴甜时，可以送一张无门槛优惠券，金额 3 到 " + cap + " 元之间，整段对话最多送一次，不送就不写「优惠券」那行。",
        "",
        "对话记录：",
        ...history.slice(-16).map(m => `${m.role === "user" ? "顾客" : kefuName}：${m.text}${m.couponId ? "（已送过优惠券）" : ""}`),
        "",
        "只输出：",
        "===回复===",
        "内容：",
        "优惠券：（金额数字，可省略）",
    ].join("\n");
    const raw = await plainGenerate(prompt);
    const f = parseBlocks(raw, "回复")[0];
    const text = one(f, "内容") || raw.replace(/=+[^=\n]*=+/g, "").trim();
    const already = history.some(m => m.couponId);
    const coupon = already ? 0 : Math.min(cap, Math.round(money(one(f, "优惠券"))));
    return { text, coupon };
}
