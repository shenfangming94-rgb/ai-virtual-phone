// 本地测试用：模拟小手机宿主的 window.AiPhone
(function () {
  const db = window.__SEED_DB || {}; window.__DB = db;
  const col = c => (db[c] = db[c] || []);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chars = window.__MOCK_CHARS || [{ id: "c1", name: "权时焕", avatar: "" }, { id: "c2", name: "李想", avatar: "" }];
  const calls = []; window.__mockCalls = calls;
  const FANS = "===粉丝回复===\n- 清仪的小狗：在等你！！！\n- sunny_0412：오빠 밥 먹었어요?ㅠㅠ｜哥哥吃饭了吗呜呜\n- momo：腿借我我替你扛\n- yuki：お疲れ様です！｜辛苦啦！\n- 北北北：练到现在？？心疼死了\n- jenny：take a rest pls｜快休息一下\n- 晚风：吃了就好 晚安\n- 一只小土豆：今天也好帅";
  window.AiPhone = {
    db: {
      async list(c) { return col(c).slice(0, 500); },
      async create(c, data) { const row = { ...data, id: data.id || "r" + Math.random() }; col(c).unshift(row); return row; },
      async update(c, id, patch) { const i = col(c).findIndex(r => r.id === id); if (i < 0) return null; col(c)[i] = { ...col(c)[i], ...patch }; return col(c)[i]; },
      async delete(c, id) { db[c] = col(c).filter(r => r.id !== id); return true; },
    },
    user: { async getProfile() { return { id: "u1", name: "沈清仪", avatarUrl: "" }; } },
    characters: { async list() { return chars; } },
    ai: {
      async generate(p) {
        calls.push(p); await sleep(300);
        if (p.appTags[1] === "room") return { text: "===泡泡===\n引用：无\n内容：大家吃饭了吗\n===泡泡===\n引用：无\n内容：练到现在才结束 腿已经不是我的了\n===泡泡===\n引用：腿借我我替你扛\n内容：不用了 自己的腿自己扛\n" + FANS };
        if (p.appTags[1] === "plaza") return { text: "===你的帖子===\n内容：别扒了 都早点睡" };
        if (p.appTags[1] === "secret") return { text: FANS + "\n===你的回复===\n内容：少说话 早点睡" };
        return { text: "" };
      },
      async chat(p) {
        calls.push(p); await sleep(300);
        if (/===帖子===/.test(p.prompt)) return { text: "===帖子===\n昵称：冰箱里有饭团\n内容：？？？今天被引用的那条到底谁发的 哥还回你怎么知道\n截图：不用了 自己的腿自己扛\n点赞：2300\n评论数：486\n===帖子===\n昵称：sunny_0412\n内容：猜的吧 别乱扒了 散了散了\n截图：无\n点赞：860\n评论数：211\n===帖子===\n昵称：加班到十点\n内容：今天又加班 回家路上听哥的歌续命\n截图：无\n点赞：120\n评论数：14\n===帖子===\n昵称：yuki\n内容：今日も練習お疲れ様！｜今天也练习辛苦啦！\n截图：练到现在才结束 腿已经不是我的了\n点赞：640\n评论数：40" };
        return { text: FANS };
      },
    },
    memory: { async addTimeline(p) { calls.push({ memory: p }); return {}; } },
    ui: { async toast() {} },
  };
})();
