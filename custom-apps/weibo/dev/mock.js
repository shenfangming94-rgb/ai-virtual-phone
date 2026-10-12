// 本地测试用：模拟小手机宿主的 window.AiPhone，AI 返回固定的样例文本
(function () {
  const db = window.__SEED_DB || {}; window.__DB = db;
  const col = c => (db[c] = db[c] || []);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const media = {};
  const chars = window.__MOCK_CHARS || [
    { id: "c1", name: "沈砚", avatar: "" },
    { id: "c2", name: "陆知遥", avatar: "" },
  ];
  const feed = `===微博===
角色：沈砚
作者：砚台不是盐台
认证：黄V
会员：是
来源：iPhone 15 Pro
时间：12分钟前
配图：深夜办公室窗外的城市灯光 | 桌上一杯凉掉的美式
转评赞：23 / 156 / 2048
转发自：无
原文：无
转发链：无
正文：
加班到现在，咖啡都凉了。
有些人倒是睡得挺早 [doge] #打工人的深夜#
===结束===
===微博===
角色：无
作者：今天也要早睡
认证：无
会员：否
来源：HUAWEI Mate 60
时间：35分钟前
配图：无
转评赞：3 / 41 / 512
转发自：无
原文：无
转发链：无
正文：
室友半夜在阳台背单词，背到 abandon 的时候突然哭了，我该不该去安慰她 [允悲]
===结束===
===微博===
角色：无
作者：吃瓜第一线
认证：蓝V
会员：否
来源：微博网页版
时间：1小时前
配图：无
转评赞：880 / 3200 / 2.1万
转发自：娱乐圈小喇叭
原文：某顶流恋情疑似曝光，深夜同框进入同一小区 #顶流恋情#
转发链：瓜田里的猹：这次是真的吧 || 路过的阿狸：等官宣
正文：
蹲一个后续 [吃瓜]
===结束===`;
  const comments = `===评论===
编号：c1
角色：无
作者：是小王不是小汪
回复：无
赞：320
内容：说的谁啊 指名道姓一下
===结束===
===评论===
编号：c2
角色：沈砚
作者：砚台不是盐台
回复：c1
赞：88
内容：没说谁，自己对号入座的那个人知道
===结束===
===评论===
编号：c3
角色：陆知遥
作者：遥遥无期
回复：无
赞：96
内容：老板都下班了你在卷什么
===结束===
===评论===
编号：c4
角色：无
作者：momo
回复：无
赞：12
内容：凉掉的美式也比我的人生温暖 [笑cry]
===结束===
===评论===
编号：c5
角色：无
作者：杠精本精
回复：c4
赞：3
内容：喝冰美式的人不配说凉
===结束===`;
  const reaction = `===评论===
编号：c1
角色：沈砚
作者：砚台不是盐台
回复：无
赞：66
内容：拍得一般，人还行
===结束===
===评论===
编号：c2
角色：无
作者：路过的阿狸
回复：c1
赞：20
内容：？？？楼上什么关系
===结束===
===互动===
点赞角色：沈砚、陆知遥
转发：陆知遥：好看 || 吃瓜第一线：转发微博
路人点赞：14
新增粉丝：3
新粉丝：今天也要早睡、是小王不是小汪
===结束===
===私信===
来自：沈砚
角色：沈砚
内容：微信不回 跑来发微博？
===结束===
===私信===
来自：沈砚
角色：沈砚
内容：照片里那杯奶茶是谁买的
===结束===
===私信===
来自：一只柠檬精
角色：无
内容：姐妹你这个滤镜叫啥
===结束===`;
  const profile = `===主页===
昵称：砚台不是盐台
简介：别催，在写了
认证：黄V
认证说明：建筑设计师
会员：是
IP属地：上海
粉丝：12873
关注：233
===结束===
===微博===
角色：沈砚
作者：砚台不是盐台
认证：黄V
会员：是
来源：iPhone 15 Pro
时间：3天前
配图：工地上的蓝天
转评赞：2 / 18 / 302
转发自：无
原文：无
转发链：无
正文：
今天的天很蓝，图纸改了第八版。
===结束===
===微博===
角色：沈砚
作者：砚台不是盐台
认证：黄V
会员：是
来源：iPhone 15 Pro
时间：2024-05-01
配图：无
转评赞：0 / 6 / 95
转发自：无
原文：无
转发链：无
正文：
五一不出门，谁也别约。
===结束===`;
  const reply = `===评论===
编号：r1
角色：沈砚
作者：砚台不是盐台
回复：F3
赞：5
内容：你又知道了？
===结束===
===私信===
来自：沈砚
角色：沈砚
内容：评论区人多 私信说
===结束===
===互动===
点赞角色：沈砚
路人点赞：4
===结束===`;
  const npc = `===评论===
编号：n1
角色：无
作者：杠精本精
回复：U
赞：2
内容：急了急了，我又没说你 [doge]
===结束===
===评论===
编号：n2
角色：无
作者：吃瓜第一线
回复：n1
赞：9
内容：前排出售瓜子板凳
===结束===`;

  const hotTitles = [["沈砚演唱会官宣","8923411","爆","沈砚"],["国庆返程高峰","6120334","沸","无"],["打工人的节后第一天","4501288","热","无"],["沈砚机场私服","3302177","新","沈砚"],["降温","2809333","无","无"]];
  const hot = hotTitles.map(([t,h,g,r]) => `===热搜===\n热搜词：${t}\n热度：${h}\n标签：${g}\n相关：${r}\n===结束===`).join("\n") + "\n" +
    Array.from({length: 17}, (_, i) => `===热搜===\n热搜词：#测试词条${i + 1}#\n热度：${(20 - i) * 10}万\n标签：${i % 4 ? "无" : "新"}\n相关：无\n===结束===`).join("\n");
  const topicText = `===话题===\n导语：歌手沈砚今日官宣巡回演唱会首站定于上海，粉丝连夜蹲守抢票攻略。\n主持人：娱乐资讯君\n阅读：2.3亿\n讨论：12.6万\n===结束===
===微博===\n分区：热门\n角色：无\n作者：娱乐资讯君\n认证：蓝V\n会员：否\n来源：微博网页版\n时间：1小时前\n配图：演唱会海报\n转评赞：2301 / 5520 / 41000\n转发自：无\n原文：无\n转发链：无\n正文：\n【沈砚巡演官宣】首站上海，11月开票。\n===结束===
===微博===\n分区：热门\n角色：沈砚\n作者：沈砚Yan\n认证：黄V\n会员：是\n来源：iPhone 16 Pro\n时间：40分钟前\n配图：【本人】排练室对镜自拍\n转评赞：90000 / 120000 / 800000\n转发自：无\n原文：无\n转发链：无\n正文：\n见面倒计时 #沈砚演唱会官宣#\n===结束===
===微博===\n分区：实时\n角色：无\n作者：抢票失败第一人\n认证：无\n会员：否\n来源：iPhone 13\n时间：3分钟前\n配图：无\n转评赞：0 / 2 / 5\n转发自：无\n原文：无\n转发链：无\n正文：\n手速练起来了 谁有抢票攻略[允悲]\n===结束===`;
  const searchText = `===微博===\n角色：无\n作者：蛋糕测评小王\n认证：无\n会员：否\n来源：小米14\n时间：昨天 21:30\n配图：无\n转评赞：1 / 3 / 20\n转发自：无\n原文：无\n转发链：无\n正文：\n搜到的蛋糕店真的好吃\n===结束===
===微博===\n角色：无\n作者：路过的猫\n认证：无\n会员：否\n来源：iPhone 15\n时间：2025-08-14\n配图：无\n转评赞：0 / 0 / 2\n转发自：无\n原文：无\n转发链：无\n正文：\n蛋糕 yyds\n===结束===`;
  const npcText = `===主页===\n昵称：吃瓜第一线\n性别：女\n简介：瓜田里的猹 有瓜必吃\n认证：无\n认证说明：无\n会员：是\nIP属地：浙江\n粉丝：1288\n关注：356\n===结束===
===微博===\n角色：无\n作者：吃瓜第一线\n认证：无\n会员：是\n来源：iPhone 14\n时间：2026-09-30\n配图：无\n转评赞：0 / 3 / 12\n转发自：无\n原文：无\n转发链：无\n正文：\n国庆前最后一天班 摸鱼摸到飞起\n===结束===
===微博===\n角色：无\n作者：吃瓜第一线\n认证：无\n会员：是\n来源：iPhone 14\n时间：2026-08-02\n配图：猫咪睡觉\n转评赞：1 / 5 / 40\n转发自：无\n原文：无\n转发链：无\n正文：\n我家猫又睡了一整天 羡慕\n===结束===`;
  const dmText = `===私信===\n来自：沈砚\n角色：沈砚\n内容：嗯？\n===结束===\n===私信===\n来自：沈砚\n角色：沈砚\n内容：刚开完会 你说\n===结束===\n===私信===\n来自：沈砚\n角色：沈砚\n内容：[心]\n===结束===`;
  const superRec = ["平南一高", "猫咪日常", "原神", "篮球", "追星日记", "沈砚"].map((n, i) => `===超话===\n名称：${n}\n简介：${n}同好聚集地\n分类：${["学校", "兴趣", "兴趣", "兴趣", "兴趣", "个人"][i]}\n主持人：${n}小管家\n帖子数：${(i + 1) * 1234}\n粉丝数：${(i + 1) * 5678}\n相关：${i === 5 ? "沈砚" : "无"}\n===结束===`).join("\n");
  const superPostsText = `===超话===\n名称：X\n简介：一个测试超话\n分类：兴趣\n主持人：超话小助手\n帖子数：888\n粉丝数：9999\n相关：无\n===结束===\n===微博===\n角色：无\n作者：圈内老人\n认证：无\n会员：否\n来源：iPhone 13\n时间：2小时前\n配图：无\n转评赞：0 / 4 / 30\n转发自：无\n原文：无\n转发链：无\n正文：\n新人报道 求带\n===结束===\n===微博===\n角色：沈砚\n作者：砚台不是盐台\n认证：黄V\n会员：是\n来源：iPhone 15 Pro\n时间：1天前\n配图：无\n转评赞：0 / 2 / 10\n转发自：无\n原文：无\n转发链：无\n正文：\n偷偷签个到\n===结束===`;
  const charSup = `===超话===\n名称：篮球\n简介：打球的都来\n分类：兴趣\n主持人：篮球小管家\n帖子数：5000\n粉丝数：80000\n相关：沈砚\n===结束===\n===超话===\n名称：沈砚\n简介：个人超话\n分类：个人\n主持人：砚台后援会\n帖子数：100\n粉丝数：2000\n相关：沈砚\n===结束===`;
  const calls = [];
  window.__mockCalls = calls;
  window.AiPhone = {
    db: {
      async list(c) { return col(c).slice(0, 500); },
      async get(c, id) { return col(c).find(r => r.id === id) || null; },
      async create(c, data) { const row = { ...data, id: data.id || "r" + Math.random(), createdAt: data.createdAt || new Date().toISOString() }; col(c).unshift(row); return row; },
      async update(c, id, patch) { const i = col(c).findIndex(r => r.id === id); if (i < 0) return null; col(c)[i] = { ...col(c)[i], ...patch }; return col(c)[i]; },
      async delete(c, id) { db[c] = col(c).filter(r => r.id !== id); return true; },
    },
    user: { async getProfile() { return { id: "u1", name: "沈清仪", avatarUrl: "" }; } },
    characters: { async list() { return chars; }, async get(id) { return chars.find(c => c.id === id); } },
    ai: {
      async generate(p) {
        calls.push(p); await sleep(400);
        const t = p.appTags.join(",");
        if (window.__MOCK_TEXT && window.__MOCK_TEXT[p.appTags[1]] != null) return { text: window.__MOCK_TEXT[p.appTags[1]] };
        if (t.includes("charalt")) return { text: (/不要输出 ===主页===/.test(p.instruction) ? "" : `===主页===\n昵称：不想起床的猫\n性别：男\n简介：困\n认证：无\n会员：否\nIP属地：上海\n粉丝：12\n关注：48\n===结束===\n`) + `===微博===\n角色：沈砚\n作者：不想起床的猫\n认证：无\n会员：否\n来源：iPhone 15 Pro\n时间：2026-10-01\n配图：无\n转评赞：0 / 1 / 3\n转发自：无\n原文：无\n转发链：无\n正文：\n又没敢说 下次一定\n===结束===\n===微博===\n角色：沈砚\n作者：不想起床的猫\n认证：无\n会员：否\n来源：iPhone 15 Pro\n时间：2026-09-12\n配图：凌晨的天花板\n转评赞：0 / 0 / 1\n转发自：无\n原文：无\n转发链：无\n正文：\n睡不着\n===结束===` };
        if (t.includes("super")) return { text: /推荐 6 个/.test(p.instruction) ? superRec : /和你有关的超话/.test(p.instruction) ? charSup : superPostsText };
        if (t.includes("dm")) return { text: dmText };
        if (t.includes("npc")) return { text: npcText };
        if (t.includes("hot")) return { text: hot };
        if (t.includes("topic")) return { text: topicText };
        if (t.includes("search")) return { text: searchText };
        if (t.includes("feed")) return { text: feed };
        if (t.includes("comments")) return { text: comments };
        if (t.includes("reaction")) return { text: reaction };
        if (t.includes("profile")) return { text: profile };
        if (t.includes("reply")) return { text: reply };
        return { text: "" };
      },
      async chat(p) { calls.push(p); await sleep(300); if (/私信你/.test(p.prompt)) return { text: "===私信===\n来自：一只柠檬精\n角色：无\n内容：好的谢谢姐妹！\n===结束===" }; const code = (p.prompt.match(/编号 (F\d+)/) || [])[1] || "U"; return { text: npc.replace("回复：U", "回复：" + code) }; },
      async generateImage() { await sleep(300); return { dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#7ab"/><text x="20" y="150" font-size="30" fill="#fff">generated</text></svg>') }; },
    },
    media: {
      async pick(p) {
        const n = (p && p.limit) || 1; const files = [];
        for (let i = 0; i < Math.min(n, 3); i++) { const h = Math.floor(Math.random() * 360);
          files.push({ dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${h},70%,60%)"/><circle cx="100" cy="85" r="40" fill="#fff8"/></svg>`) }); }
        return { files, file: files[0] };
      },
      async put({ dataUrl }) { const ref = "media-store://" + Math.random(); media[ref] = dataUrl; return { ref }; },
      async get({ ref }) { return { ref, dataUrl: media[ref] }; },
      async delete() { return true; },
    },
    memory: {
      async addTimeline(p) { calls.push({ memory: p }); return { entry: { id: "m" } }; },
      async deleteTimeline(p) { calls.push({ forget: p }); return true; },
    },
    ui: { async toast() {} },
    chat: {
      async sendCard(p) { (window.__SENT = window.__SENT || []).push({ card: p }); return { messageId: "m1" }; },
      async sendMessage(p) { (window.__SENT = window.__SENT || []).push({ msg: p }); return { messageId: "m2" }; },
    },
    app: { async getLaunchContext() { return window.__LAUNCH || null; } },
  };
})();
