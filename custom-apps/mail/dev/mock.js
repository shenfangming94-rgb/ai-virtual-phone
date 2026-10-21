// 本地测试用：模拟小手机宿主的 window.AiPhone，AI 返回固定的样例文本
(function () {
  const db = window.__SEED_DB || {}; window.__DB = db;
  const col = c => (db[c] = db[c] || []);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const media = {}; const calls = window.__CALLS = [];
  const face = (bg, t) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${bg}"/><circle cx="40" cy="32" r="14" fill="#fff8"/><rect x="18" y="52" width="44" height="30" rx="15" fill="#fff8"/></svg>`);
  const chars = window.__MOCK_CHARS || [
    { id: "c1", name: "沈砚", avatar: face("#7a8fb8") },
    { id: "c2", name: "李想", avatar: face("#d99a6c") },
  ];
  const letters = {
    c1: `===邮件===
邮箱：shenyan.arch@163.com
主题：今天路过那家店
照片：店门口排着长队，玻璃门上贴着手写的菜单｜排到一半拍的天，晚霞是粉橙色的
歌：晴天 - 周杰伦
贺卡：无
正文：
你上次说想吃的那家，我排了四十分钟。

没给你带，因为凉了不好吃。拍了张门口的队给你看，你自己感受一下。

下次一起去吧，这次你不许说不饿。

排队的时候店里一直放这首，顺便发你。

—— 沈砚`,
    c2: `===邮件===
邮箱：lixiang_1990@126.com
主题：这封信从 2008 年寄出
照片：无
歌：无
贺卡：四季｜下雪了，第一个想告诉你。
正文：
我也不知道这封信会不会到你那。

今天晚自习停电了，大家都在点蜡烛，胖子拿蜡烛烤火腿肠被老班抓了。我就趴在桌上想写点什么给你。

你那边现在是什么样的？

李想`,
  };
  window.AiPhone = {
    db: {
      async list(c) { return col(c).slice(); },
      async create(c, row) { col(c).push({ ...row }); return row; },
      async update(c, id, patch) { const r = col(c).find(x => x.id === id); if (!r) return null; Object.assign(r, patch); return r; },
      async delete(c, id) { db[c] = col(c).filter(x => x.id !== id); return true; },
    },
    user: { async getProfile() { return { id: "u1", name: "Flora", avatarUrl: face("#c58af9") }; } },
    characters: { async list() { return chars; }, async get(id) { return chars.find(c => c.id === id); } },
    ai: {
      async chat(p) { calls.push(p); await sleep(300); return { text: "===邮件===\n邮箱：service@naicha.com\n主题：关于您反馈的「珍珠太少」问题\n照片：无\n歌：无\n贺卡：无\n正文：\n亲爱的顾客您好：\n\n感谢您的反馈。经我们认真核查，当天门店确实存在珍珠出餐不足的情况，在此向您郑重致歉。\n\n我们已为您的账户发放一张「珍珠加倍券」，下次点单时可直接使用。\n\n祝您生活愉快！\n\n某某奶茶客服中心" }; },
      async generate(p) { calls.push(p); await sleep(300); const scene = p.appTags[1]; if (window.__MOCK_TEXT && window.__MOCK_TEXT[scene]) return { text: window.__MOCK_TEXT[scene] };
        if (scene === "reply") return { text: p.characterId === "c2" ? letters.c2.replace("这封信从 2008 年寄出", "回复：你那边下雪了吗") : "===邮件===\n主题：回复：生日快乐\n照片：无\n歌：无\n贺卡：无\n正文：\n收到了。\n\n零点整，你是第一个。\n\n卡片我存起来了。" };
        return { text: letters[p.characterId] || letters.c1 }; },
      async generateImage() { await sleep(300); return { dataUrl: face("#e8a87c") }; },
    },
    media: {
      async pick() { const d = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#f5c9a8"/><circle cx="200" cy="200" r="60" fill="#fff4"/></svg>`); return { files: [{ dataUrl: d }], file: { dataUrl: d } }; },
      async put({ dataUrl }) { const ref = "media-store://" + Math.random(); media[ref] = dataUrl; return { ref }; },
      async get({ ref }) { return { ref, dataUrl: media[ref] }; },
    },
    memory: { async addTimeline(p) { calls.push({ memory: p }); return { entry: { id: "m" } }; }, async deleteTimeline() { return true; } },
    ui: { async toast() {} },
  };
})();
