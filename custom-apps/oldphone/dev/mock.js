// 本地测试用：模拟小手机宿主的 window.AiPhone，AI 返回固定的样例文本（window.__MOCK_TEXT[scene] 可以换）
(function () {
  const db = window.__SEED_DB || {}; window.__DB = db;
  const col = c => (db[c] = db[c] || []);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chars = window.__MOCK_CHARS || [{ id: "c1", name: "林夏", avatar: "" }, { id: "c2", name: "周屿", avatar: "" }];
  const calls = []; window.__mockCalls = calls;
  const mock = (scene, def) => (window.__MOCK_TEXT && window.__MOCK_TEXT[scene] != null ? window.__MOCK_TEXT[scene] : def);
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
      async generate(p) { calls.push(p); await sleep(400); return { text: mock(p.appTags[1], "===短信===\n内容：你是谁啊\n===结束===") }; },
      async chat(p) { calls.push(p); await sleep(400); return { text: mock("chat", "===短信===\n内容：？？你哪位\n===结束===") }; },
    },
    memory: { async addTimeline(p) { calls.push({ memory: p }); return {}; }, async add(p) { calls.push({ longterm: p }); return true; }, async deleteTimeline(p) { calls.push({ forget: p }); return true; } },
    ui: { async toast() {} },
  };
})();
