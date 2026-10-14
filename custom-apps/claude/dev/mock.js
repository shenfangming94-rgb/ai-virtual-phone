// 本地测试用：模拟小手机宿主的 window.AiPhone，AI 返回固定的样例文本
(function () {
  const db = window.__SEED_DB || {}; window.__DB = db;
  const col = c => (db[c] = db[c] || []);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chars = window.__MOCK_CHARS || [{ id: "c1", name: "沈砚", avatar: "" }, { id: "c2", name: "陆知遥", avatar: "" }];
  const calls = []; window.__mockCalls = calls;
  window.AiPhone = {
    db: {
      async list(c) { return col(c).slice(0, 500); },
      async get(c, id) { return col(c).find(r => r.id === id) || null; },
      async create(c, data) { const row = { ...data, id: data.id || "r" + Math.random(), createdAt: new Date().toISOString() }; col(c).unshift(row); return row; },
      async update(c, id, patch) { const i = col(c).findIndex(r => r.id === id); if (i < 0) return null; col(c)[i] = { ...col(c)[i], ...patch }; return col(c)[i]; },
      async delete(c, id) { db[c] = col(c).filter(r => r.id !== id); return true; },
    },
    user: { async getProfile() { return { id: "u1", name: "沈清仪", avatarUrl: "" }; } },
    characters: { async list() { return chars; }, async get(id) { return chars.find(c => c.id === id); } },
    ai: {
      async generate(p) {
        calls.push(p); await sleep(400);
        const scene = p.appTags[1];
        if (window.__MOCK_TEXT && window.__MOCK_TEXT[scene] != null) return { text: window.__MOCK_TEXT[scene] };
        if (scene === "ask") return { text: "===提问===\n标题：哄女朋友开心\n模型：Opus 5.5\n思考强度：高\n内容：\n女朋友最近复习压力很大，我想哄她开心但又不想显得太刻意，怎么办\n===结束===" };
        if (scene === "followup") return { text: "===反应===\n反馈：赞\n继续问：是\n看了思考：是\n想跟她说：AI 居然在想奶茶要几分糖\n内容：\n她爱喝的……好像是芋泥波波？你怎么知道我是说她爱喝奶茶的\n===结束===" };
        return { text: "" };
      },
    },
    memory: { async addTimeline(p) { calls.push({ memory: p }); return {}; }, async deleteTimeline(p) { calls.push({ forget: p }); return true; } },
    ui: { async toast() {} },
  };
})();
