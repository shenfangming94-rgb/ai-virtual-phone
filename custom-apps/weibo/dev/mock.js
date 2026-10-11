// 本地测试用：模拟小手机宿主的 window.AiPhone，AI 返回固定的样例文本
(function () {
  const db = {};
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
        if (t.includes("feed")) return { text: feed };
        if (t.includes("comments")) return { text: comments };
        if (t.includes("reaction")) return { text: reaction };
        if (t.includes("profile")) return { text: profile };
        if (t.includes("reply")) return { text: reply };
        return { text: "" };
      },
      async chat(p) { calls.push(p); await sleep(300); const code = (p.prompt.match(/编号 (F\d+)/) || [])[1] || "U"; return { text: npc.replace("回复：U", "回复：" + code) }; },
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
    memory: { async addTimeline(p) { calls.push({ memory: p }); return { entry: { id: "m" } }; } },
    ui: { async toast() {} },
  };
})();
