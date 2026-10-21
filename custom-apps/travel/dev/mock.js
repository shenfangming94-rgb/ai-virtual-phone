// 本地测试用：模拟小手机宿主，AI 返回固定样例
(function () {
  const db = window.__SEED_DB || {}; window.__DB = db;
  const col = c => (db[c] = db[c] || []);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const media = {}; const calls = window.__CALLS = [];
  const face = bg => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${bg}"/><circle cx="40" cy="32" r="14" fill="#fff8"/><rect x="18" y="52" width="44" height="30" rx="15" fill="#fff8"/></svg>`);
  const chars = [{ id: "c1", name: "沈砚", avatar: face("#7a8fb8") }, { id: "c2", name: "李想", avatar: face("#d99a6c") }];
  const cm = (u, t, s, x) => ({ user: u, tag: t, score: s, date: "2025年9月", text: x });
  const base = { city: "大理", country: "中国", tagline: "苍山洱海 · 风花雪月", intro: "大理在云南西部，苍山在西，洱海在东，古城夹在中间。节奏慢，适合什么都不干地待几天。", season: "3-5月", days: "3-4 天", cost: "¥2,500", howto: "飞机/高铁", lat: 25.606, lng: 100.267,
    tips: [{ t: "10-11 月", d: "秋高气爽，早晚温差大，带件外套。" }, { t: "紫外线强", d: "防晒一定要做，墨镜帽子带上。" }, { t: "交通", d: "环洱海建议租电动车或包车，古城内步行即可。" }],
    routes: [{ title: "大理经典 3 日游", tags: ["第一次去", "适合情侣", "轻松"], desc: "古城、洱海、喜洲、双廊，节奏不赶，每天睡到自然醒。", cost: "约 ¥1,800/人", days: [
      { title: "古城", items: [{ time: "14:00", name: "大理古城", desc: "先在人民路逛逛", lat: 25.6935, lng: 100.1636 }, { time: "18:00", name: "洋人街", desc: "晚饭和夜市", lat: 25.6948, lng: 100.1612 }] },
      { title: "洱海西岸", items: [{ time: "09:30", name: "洱海生态廊道", desc: "骑车", lat: 25.74, lng: 100.21 }, { time: "13:00", name: "喜洲古镇", desc: "吃破酥粑粑", lat: 25.8547, lng: 100.1290 }] },
      { title: "双廊", items: [{ time: "10:00", name: "双廊古镇", desc: "海边发呆", lat: 25.9167, lng: 100.1989 }, { time: "17:30", name: "南诏风情岛", desc: "看日落", lat: 25.8986, lng: 100.2042 }] }] },
      { title: "苍山洱海 2 日", tags: ["爬山", "拍照"], desc: "一天上山一天下海。", cost: "约 ¥1,200/人", days: [{ title: "苍山", items: [{ time: "09:00", name: "苍山洗马潭索道", desc: "带外套", lat: 25.6697, lng: 100.1077 }] }, { title: "洱海", items: [{ time: "10:00", name: "才村码头", desc: "喂海鸥", lat: 25.6697, lng: 100.2032 }] }] }],
    sights: [
      { name: "洱海", kind: "湖泊 · 骑行", score: 4.8, reviews: 126000, recommend: 95, sub: { 景色: 4.9, 趣味: 4.6, 性价比: 4.8 }, ticket: "免费", duration: "半天-1天", hours: "全天开放", transport: "古城打车 15 分钟到才村", intro: "云南第二大淡水湖。", quote: "骑电动车环湖一圈，每个弯都是壁纸", tags: ["免费", "适合情侣"], lat: 25.8, lng: 100.19, comments: [cm("旅行的小鹿", "情侣出游", 5, "傍晚的风很舒服，日落很美。"), cm("阿木木", "家庭出游", 4, "中午太晒，早晚去最好。")] },
      { name: "苍山", kind: "山岳 · 索道", score: 4.6, reviews: 52000, recommend: 90, sub: { 景色: 4.8, 趣味: 4.4, 性价比: 4.2 }, ticket: "¥40 起", duration: "半天", hours: "08:30-17:30", transport: "古城打车 10 分钟", intro: "十九峰十八溪。", quote: "索道上去云就在脚下，冷，带外套", tags: ["拍照"], lat: 25.67, lng: 100.11, comments: [cm("不想上班", "朋友出游", 5, "洗马潭的云海绝了。"), cm("Momo", "独自旅行", 4, "排队有点久。")] },
      { name: "大理古城", kind: "古城 · 美食", score: 4.5, reviews: 98000, recommend: 88, sub: { 景色: 4.4, 趣味: 4.6, 性价比: 4.6 }, ticket: "免费", duration: "半天", hours: "全天开放", transport: "市区公交", intro: "明代古城。", quote: "晚上比白天好逛，人民路小店很多", tags: ["免费"], lat: 25.6935, lng: 100.1636, comments: [cm("拍照的阿卷", "情侣出游", 5, "巷子很好拍。"), cm("路人", "朋友出游", 4, "商业化有点重。")] },
      { name: "喜洲古镇", kind: "古镇 · 田园", score: 4.7, reviews: 31000, recommend: 92, sub: { 景色: 4.8, 趣味: 4.6, 性价比: 4.8 }, ticket: "免费", duration: "2-3小时", hours: "全天开放", transport: "古城打车约 40 分钟", intro: "白族民居保存最好的古镇。", quote: "麦田骑车很治愈，破酥粑粑必吃", tags: ["免费", "适合情侣"], lat: 25.8547, lng: 100.129, comments: [cm("旅行的小鹿", "情侣出游", 5, "九月稻子黄了，骑车很舒服。"), cm("阿木木", "家庭出游", 4, "下午四点以后去。")] }] };
  const more = { foods: [{ name: "段公子·白族私房菜", kind: "白族菜", score: 4.7, reviews: 5200, price: "¥86/人", area: "古城", dishes: ["酸辣鱼", "乳扇", "饵块"], sub: { 口味: 4.8, 环境: 4.4, 服务: 4.5 }, hours: "11:00-21:30", intro: "古城里的白族家常菜。", quote: "酸辣鱼必点", lat: 25.694, lng: 100.162, comments: [cm("吃货小王", "朋友出游", 5, "酸辣鱼太下饭了。"), cm("A", "情侣出游", 4, "要排队。")] },
      { name: "喜洲破酥粑粑", kind: "小吃", score: 4.6, reviews: 12000, price: "¥12/人", area: "喜洲", dishes: ["咸粑粑", "甜粑粑"], sub: { 口味: 4.7, 环境: 3.9, 服务: 4.2 }, hours: "08:00-19:00", intro: "现烤的白族小吃。", quote: "刚出炉的咸的绝了", lat: 25.855, lng: 100.129, comments: [cm("B", "家庭出游", 5, "排队二十分钟值了。"), cm("C", "独自旅行", 4, "甜的有点腻。")] }],
    hotels: [{ name: "云栖·洱海海景民宿", stars: "特色民宿", score: 4.9, reviews: 2341, area: "双廊 · 距洱海 50 米", facilities: ["海景", "浴缸", "免费接机"], price: 688, intro: "", quote: "推开窗就是海", lat: 25.917, lng: 100.199, comments: [] },
      { name: "三月里·古城庭院", stars: "舒适型", score: 4.8, reviews: 1820, area: "大理古城内 · 人民路 300 米", facilities: ["庭院", "早餐"], price: 420, intro: "", quote: "院子里有猫", lat: 25.694, lng: 100.163, comments: [] }] };
  const plan = { title: "大理慢慢走 3 天", note: "不赶，第二天下午空出来，我带你去个地方。", days: [{ title: "古城", items: [{ time: "15:00", name: "大理古城", desc: "放下行李就去逛", note: "你肯定要在门口拍二十张", lat: 25.6935, lng: 100.1636 }, { time: "19:00", name: "段公子·白族私房菜", desc: "酸辣鱼", note: "", lat: 25.694, lng: 100.162 }] }, { title: "洱海", items: [{ time: "10:00", name: "洱海生态廊道", desc: "骑车", note: "雨衣我带两件", lat: 25.74, lng: 100.21 }] }, { title: "喜洲", items: [{ time: "10:00", name: "喜洲古镇", desc: "", note: "", lat: 25.8547, lng: 100.129 }] }] };
  window.AiPhone = {
    db: {
      async list(c) { return col(c).slice(); },
      async create(c, row) { col(c).push(JSON.parse(JSON.stringify(row))); return row; },
      async update(c, id, patch) { const r = col(c).find(x => x.id === id); if (!r) return null; Object.assign(r, JSON.parse(JSON.stringify(patch))); return r; },
      async delete(c, id) { db[c] = col(c).filter(x => x.id !== id); return true; },
    },
    user: { async getProfile() { return { id: "u1", name: "Flora", avatarUrl: face("#c58af9") }; } },
    characters: { async list() { return chars; } },
    network: { async fetch(p) { const u = new URL(p.url); for (const [k, v] of Object.entries(p.query || {})) u.searchParams.set(k, String(v)); const r = await fetch(u); const text = await r.text(); let json; try { json = JSON.parse(text); } catch {} return { ok: r.ok, text, json }; } },
    ai: {
      async chat(p) { calls.push(p); await sleep(300); return { text: /美食和酒店/.test(p.prompt) ? JSON.stringify(more) : "好的，这是指南：\n```json\n" + JSON.stringify(base) + "\n```" }; },
      async generate(p) { calls.push(p); await sleep(300); const s = p.appTags[1];
        if (s === "plan") return { text: JSON.stringify(plan) };
        if (s === "review") { const ids = [...p.instruction.matchAll(/\[(i_[^\]]+)\]/g)].map(m => m[1]); return { text: JSON.stringify({ comment: "排得挺好，就是第一天下午别走太多，你会喊脚疼。", notes: [{ id: ids[0], text: "这家我想去" }], edits: ids[1] ? [{ id: ids[1], time: "16:00", name: "", desc: "", why: "睡个午觉再出门" }] : [] }) }; }
        if (s === "spotnote") return { text: "那天你冻得直跺脚还非要拍玄武岩。下次夏天来，我还拽你。" };
        if (s === "seat") return { text: "靠窗给你，你睡着了别靠我肩膀上流口水。" };
        if (s === "gift" && !window.__MODE_VISIT2 && /come 是/.test(p.instruction)) return { text: '{"mode":"come","date":"' + new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10) + '","days":3,"reason":"想她了","message":"周五晚上到，来接我。"}' };
        if (s === "go_him") return { text: "票订好了，到了给我打电话，我在出口等你。" };
        if (s === "invite_no") return { text: "好吧，那等你忙完。我先把想带你去的地方记着。" };
        if (s === "gift" && window.__MODE_VISIT2) return { text: '{"mode":"visit","date":"' + new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10) + '","days":3,"reason":"x","message":"下下周末有空吗？想你了，来上海找我吧。"}' };
        if (s === "gift" && window.__MODE_VISIT) return { text: '{"mode":"visit","together":false,"city":"成都","date":"' + new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10) + '","days":3,"reason":"x","message":"来找我。"}' };
        if (s === "gift") return { text: '{"city":"成都","date":"' + new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10) + '","days":3,"together":true,"reason":"你说想吃火锅","message":"下周五的票，别加班了。火锅我已经看好了一家。"}' };
        if (s === "flightmsg") return { text: "落地了，在等行李。你站在哪个口？" };
        return { text: "" }; },
      async generateImage() { await sleep(300); return { dataUrl: face("#e8a87c") }; },
    },
    wallet: { async get() { return { accounts: [{ id: "balance", title: "余额", balanceLabel: "¥8,888" }, { id: "k1", title: "沈砚的亲属卡", balanceLabel: "¥20,000" }] }; }, async pay(p) { calls.push({ pay: p }); return { ok: true }; } },
    media: {
      async pick() { const d = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#8ec5fc"/><rect y="180" width="400" height="120" fill="#5b8bd9"/></svg>`); return { files: [{ dataUrl: d }], file: { dataUrl: d } }; },
      async put({ dataUrl }) { const ref = "media-store://" + Math.random(); media[ref] = dataUrl; return { ref }; },
      async get({ ref }) { return { ref, dataUrl: media[ref] }; },
    },
    chat: { async sendCard(p) { calls.push({ card: p }); return { messageId: "m1" }; }, async sendMessage(p) { calls.push({ msg: p }); return { messageId: "m2" }; } },
    memory: { async addTimeline(p) { calls.push({ memory: p }); return {}; } },
    ui: { async toast() {} },
  };
})();
