// 本地测试用：模拟小手机宿主的 window.AiPhone（AI 按 appTags[1] 返回固定样例，window.__MOCK_TEXT[tag] 可以换）
(function () {
  const db = window.__SEED_DB || {}; window.__DB = db;
  const col = c => (db[c] = db[c] || []);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chars = window.__MOCK_CHARS || [{ id: "c1", name: "李想", avatar: "" }, { id: "c2", name: "沈砚", avatar: "" }];
  const calls = []; window.__mockCalls = calls; window.__MEDIA = {};
  const DEF = {
    seed: "===验证===\n同意\n===结束===\n===资料===\n个性签名：周杰伦的新歌好听到炸 <魔杰座>\n空间名字：想想的小屋\n空间签名：好好学习 天天向上\n背景音乐：周杰伦 - 稻香\n===结束===\n===说说===\n晚自习停电了 全班点蜡烛\n===结束===\n===说说===\n食堂的豆浆又是凉的\n===结束===\n===访客===\n胖子\n小雨\n阿杰\n===结束===\n===留言===\n胖子：踩踩 回踩哦\n主人回复：踩回去了\n===结束===",
    chat: "===消息===\n在呢 /微笑\n===结束===\n===消息===\n刚下晚自习 你咋知道我QQ的\n===结束===\n===消息===\n[抖动]\n===结束===",
    zone: "===主人回复===\n收到啦 /呲牙\n===结束===\n===回踩===\n===结束===\n===留言===\n回踩~ 你空间的歌好听\n===结束===",
  };
  window.AiPhone = {
    db: {
      async list(c) { return col(c).slice(0, 500); },
      async get(c, id) { return col(c).find(r => r.id === id) || null; },
      async create(c, data) { const row = { ...data, id: data.id || "r" + Math.random() }; col(c).unshift(row); return row; },
      async update(c, id, patch) { const i = col(c).findIndex(r => r.id === id); if (i < 0) return null; col(c)[i] = { ...col(c)[i], ...patch }; return col(c)[i]; },
      async delete(c, id) { db[c] = col(c).filter(r => r.id !== id); return true; },
    },
    user: { async getProfile() { return { id: "u1", name: "林小满", avatarUrl: "" }; } },
    characters: { async list() { return chars; }, async get(id) { return chars.find(c => c.id === id); } },
    ai: { async generateImage(p) { calls.push({ image: p }); await sleep(300); const c = document.createElement("canvas"); c.width = 640; c.height = 480; const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 640, 480); gr.addColorStop(0, "#7ec8ff"); gr.addColorStop(1, "#ffd86b"); g.fillStyle = gr; g.fillRect(0, 0, 640, 480); g.fillStyle = "#3a7a3a"; g.fillRect(0, 330, 640, 150); g.fillStyle = "#fff"; g.font = "bold 40px sans-serif"; g.fillText("操场", 260, 250); return { dataUrl: c.toDataURL("image/png") }; },
      async chat(p) { calls.push({ chat: p }); await sleep(300); return { text: window.__MOCK_CHAT != null ? window.__MOCK_CHAT : /扔进海里/.test(p.prompt) ? "===瓶子===\n昵称：吉他少年\n来自：天津 · 一个会弹吉他的高二男生\n内容：明天要月考了，物理一道都不会。谁捡到这个瓶子，祝我考过 60 分吧\n===结束===" : /有几个陌生人/.test(p.prompt) ? "===回复===\n昵称：夜猫子\n来自：广州 · 大三学生\n回复：我也失眠 在宿舍偷偷玩电脑\n===结束===\n===回复===\n昵称：小雨点\n来自：成都 · 初二女生\n回复：数羊没用 我试过了\n===结束===" : "===回复===\n哈哈 那你加油\n===结束===" }; },
      async generate(p) { calls.push(p); await sleep(300); const t = p.appTags[1]; return { text: (window.__MOCK_TEXT && window.__MOCK_TEXT[t] != null) ? window.__MOCK_TEXT[t] : DEF[t] || "" }; } },
    memory: { async addTimeline(p) { calls.push({ memory: p }); return {}; } },
    media: {
      async pick({ accept }) { if (/audio/.test(accept)) { const sr = 8000, n = sr * 2, b = new ArrayBuffer(44 + n * 2), v = new DataView(b); const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0))); w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 3000, true); let s = ""; new Uint8Array(b).forEach(x => s += String.fromCharCode(x)); return { file: { name: "周杰伦 - 稻香.mp3", dataUrl: "data:audio/wav;base64," + btoa(s) } }; }
        const c = document.createElement("canvas"); c.width = 200; c.height = 200; const g = c.getContext("2d"); g.fillStyle = "#f7a"; g.fillRect(0, 0, 200, 200); return { file: { name: "a.jpg", dataUrl: c.toDataURL("image/jpeg") } }; },
      async put({ dataUrl }) { const ref = "media-store://m" + Math.random().toString(36).slice(2); window.__MEDIA[ref] = dataUrl; return { ref }; },
      async get({ ref }) { return { ref, dataUrl: window.__MEDIA[ref] || "" }; },
    },
    ui: { async toast() {} },
  };
})();
