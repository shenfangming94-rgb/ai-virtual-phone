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
      async create(c, data) { const row = { ...data, id: data.id || "r" + Math.random(), createdAt: new Date().toISOString() }; /* 和真宿主一样：create 时间改成写入那一刻 */ col(c).unshift(row); return row; },
      async update(c, id, patch) { const i = col(c).findIndex(r => r.id === id); if (i < 0) return null; col(c)[i] = { ...col(c)[i], ...patch }; return col(c)[i]; },
      async delete(c, id) { db[c] = col(c).filter(r => r.id !== id); return true; },
    },
    user: { async getProfile() { return { id: "u1", name: "沈清仪", avatarUrl: "" }; } },
    characters: { async list() { return chars; }, async get(id) { return chars.find(c => c.id === id); } },
    network: {
      async fetch(p) {
        const u = new URL(p.url); for (const [k, v] of Object.entries(p.query || {})) u.searchParams.set(k, String(v));
        const r = await fetch(u); const text = await r.text(); let json; try { json = JSON.parse(text); } catch {}
        return { ok: r.ok, status: r.status, text, json };
      },
    },
    ai: {
      async generate(p) {
        calls.push(p); await sleep(400);
        const scene = p.appTags[1];
        if (window.__MOCK_TEXT && window.__MOCK_TEXT[scene] != null) return { text: window.__MOCK_TEXT[scene] };
        if (scene === "groupsearch") return { text: ["皇马死忠团|38000|白衣军团的家。转会传闻请带来源，不许拉踩。", "凌晨三点看球的人|5200|欧冠夜熬夜互助，记得喝水。", "我们这些踢野球的|1800|周末约球、晒伤、晒破洞球鞋", "女生也爱看足球|12000|没人问你越位是什么，我们都懂", "足球战术研究所|900|画图分析，禁止只喊口号"].map(x => { const [a, b, c] = x.split("|"); return `===小组===\n名称：${a}\n成员：${b}\n简介：${c}\n===结束===`; }).join("\n") };
        if (scene === "topics") return { text: [
          "===帖子===\n标题：昨晚那场谁看了，我到现在还没缓过来\n作者：一只不想上班的猫\n角色：无\n匿名：否\n时间：3小时前\n回应数：86\n正文：\n第89分钟那个球我直接从床上弹起来，室友以为我做噩梦了。\n有没有人跟我一样一晚上没睡着的\n===结束===",
          "===帖子===\n标题：求助：喜欢的人好像也在看球，怎么自然地搭话\n作者：匿名\n角色：沈砚\n匿名：是\n时间：昨天 23:10\n回应数：42\n正文：\n不是我，是我朋友。\n她今天在食堂看手机上的比分，我（朋友）想问问她支持哪个队，但又怕显得很刻意。\n在线等，挺急的。\n===结束===",
          "===帖子===\n标题：分享一个周末野球的离谱瞬间\n作者：Lemon\n角色：无\n匿名：否\n时间：2天前\n回应数：23\n正文：\n守门员在门前系鞋带，对面直接一脚吊射。\n全场沉默了三秒然后笑疯了\n===结束==="].join("\n") };
        if (scene === "floors") return { text: [
          "===楼===\n层：2\n作者：今天也要早睡\n角色：无\n匿名：否\n楼主：否\n引用：无\n赞：12\n内容：\n「我朋友」哈哈哈哈哈哈",
          "===楼===\n层：3\n作者：路过的芒果\n角色：无\n匿名：否\n楼主：否\n引用：2\n赞：388\n内容：\n楼上一针见血，这个朋友是不是你本人",
          "===楼===\n层：4\n作者：匿名\n角色：沈砚\n匿名：是\n楼主：是\n引用：3\n赞：45\n内容：\n真的是朋友。他让我问的。",
          "===楼===\n层：5\n作者：dd\n角色：无\n匿名：否\n楼主：否\n引用：无\n赞：6\n内容：\ndd 蹲后续",
          "===楼===\n层：6\n作者：已注销的豆友\n角色：无\n匿名：否\n楼主：否\n引用：4\n赞：1203\n内容：\n好的，「朋友」今天也在食堂偷看人家手机"].join("\n") };
        return { text: "" };
      },
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
