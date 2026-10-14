/* Claude · 小手机自定义 APP：她来当 AI 助手，char 们来提问（他们不知道 Claude 背后是她） */
(function () {
  "use strict";
  const api = window.AiPhone || window.AiPhoneApp;
  const VERSION = "/*__VERSION__*/";

  // ───────────────────────── 工具 ─────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let uidN = 0;
  const uid = p => `${p}_${Date.now().toString(36)}${(uidN++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const nowIso = () => new Date().toISOString();
  const none = v => !v || /^(无|没有|none|null|-|—)$/i.test(String(v).trim());
  const yes = v => /^(是|有|true|yes)/i.test(String(v || "").trim());
  function fmtTime(iso) {
    const t = new Date(iso); const now = new Date(); if (isNaN(t)) return "";
    const pad = x => String(x).padStart(2, "0"); const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    if (t.toDateString() === now.toDateString()) return hm;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (t.toDateString() === y.toDateString()) return "昨天";
    if ((now - t) / 86400e3 < 7) return `周${"日一二三四五六"[t.getDay()]}`;
    return `${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }
  function hashHue(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return (h >>> 8) % 360; }
  const gradientFor = s => { const h = hashHue(s); return `linear-gradient(135deg, hsl(${h},55%,64%), hsl(${(h + 40) % 360},55%,56%))`; };
  /** 文字里的 **加粗**、`代码`、换行分段（她回答时可以用一点 markdown，像真 Claude） */
  const md = s => esc(s).split(/\n{2,}/).map(p => `<p>${p.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>")}</p>`).join("");

  // 线条图标（都是细黑线，不用 emoji）
  const sv = (d, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 1.7}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    menu: sv('<path d="M4 7h16M4 12h10M4 17h16"/>', 1.8), back: sv('<path d="M15 5 8 12l7 7"/>', 1.9), more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
    plus: sv('<path d="M12 5v14M5 12h14"/>'), mic: sv('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>'), up: sv('<path d="M12 19V5M5 12l7-7 7 7"/>', 2.2),
    copy: sv('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
    share: sv('<path d="M12 15V4M8 8l4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>'), play: sv('<path d="M7 4.5v15l12-7.5z"/>'),
    good: sv('<path d="M7.5 10.5v9.5H4.5v-9.5zM7.5 10.5 11 3.5c1.6 0 2.5 1 2.3 2.6l-.5 3.4h5.6c1.3 0 2.2 1.2 1.9 2.4l-1.6 6.3c-.2.9-1 1.5-1.9 1.5H7.5"/>'),
    retry: sv('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4"/>'),
    ask: sv('<path d="M4 5.5h16v11H9l-5 3.5z"/><path d="M9 11h6M12 8v6"/>'), bulb: sv('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
    pen: sv('<path d="M4.5 19.5l1.2-4.6L15.9 4.7a1.8 1.8 0 0 1 2.6 0l.8.8a1.8 1.8 0 0 1 0 2.6L9.1 18.3z"/>'), trash: sv('<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13"/>'),
    photo: sv('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>'),
    file: sv('<path d="M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>'),
    shield: sv('<path d="M12 3.5 5 6v5.5c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6z"/><path d="M12 9v4M12 16h.01"/>'), ban: sv('<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>'),
    unban: sv('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>'), check: sv('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2), chev: sv('<path d="m9 6 6 6-6 6"/>'), down: sv('<path d="m6 9 6 6 6-6"/>', 2),
    gear: sv('<circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
  };
  /** Claude 的小菊花：一圈长短交替的圆角花瓣 */
  const SPARK = `<svg class="spark" viewBox="0 0 100 100"><g fill="#d97757">${Array.from({ length: 12 }, (_, i) => { const l = i % 2 ? 34 : 44; return `<rect x="46" y="${50 - l}" width="8" height="${l}" rx="4" transform="rotate(${i * 30} 50 50)"/>`; }).join("")}</g></svg>`;

  const MODELS = [["Opus 5.5", "最聪明的，复杂问题"], ["Sonnet 5.5", "又快又聪明，日常用"], ["Fable 5.1", "会讲故事"], ["Haiku 5.5", "最快"], ["Opus 4.6", "上一代"], ["Sonnet 4.6", "上一代"]];
  const EFFORTS = ["关", "低", "中等", "高", "最大"];
  const thinkSecs = e => ({ 低: rand(2, 5), 中等: rand(4, 12), 高: rand(8, 25), 最大: rand(20, 70) }[e] || 0);
  const pickModel = v => { const s = String(v || ""); const hit = MODELS.find(([m]) => s.replace(/\s/g, "").toLowerCase().includes(m.replace(/\s/g, "").toLowerCase())); return hit ? hit[0] : "Sonnet 5.5"; };
  const pickEffort = v => { const s = String(v || ""); return s.includes("最大") ? "最大" : s.includes("高") ? "高" : s.includes("中") ? "中等" : s.includes("低") ? "低" : s.includes("关") || s.includes("不") ? "关" : "中等"; };

  // ───────────────────────── 数据 ─────────────────────────
  // convs：对话 { charId, title, model, effort, msgs: [{ role: "char" | "me" | "sys", text, thinking, secs, blocked, feedback, at }] }；meta：设置、封号名单
  const COL = { convs: "convs", meta: "meta" };
  const S = { identity: null, chars: [], meta: null, convs: [], debug: [], busy: new Set() };
  async function dbList(c) { try { return (await api.db.list(c, { limit: 500 })) || []; } catch (e) { console.warn(e); return []; } }
  async function dbUpsert(c, row) {
    try { const u = await api.db.update(c, row.id, row); if (u) return u; } catch (e) { /* 没有就 create */ }
    const created = await api.db.create(c, row);
    if (row.createdAt && created && created.createdAt !== row.createdAt) { try { await api.db.update(c, row.id, { createdAt: row.createdAt }); } catch (e) { console.warn(e); } }
    return created;
  }
  async function dbDelete(c, id) { try { await api.db.delete(c, id); } catch (e) { console.warn(e); } }
  let metaTimer = null;
  function saveMeta() { clearTimeout(metaTimer); metaTimer = setTimeout(() => dbUpsert(COL.meta, S.meta).catch(e => console.warn(e)), 250); }
  const saveConv = c => { const { _busy, ...row } = c; return dbUpsert(COL.convs, row).catch(e => console.warn(e)); };

  async function loadAll() {
    const identity = await api.user.getProfile({}).catch(() => null);
    S.identity = identity || { id: "default", name: "我" };
    const chars = await api.characters.list().catch(() => []);
    const owners = await Promise.all(chars.map(c => api.user.getProfile({ characterId: c.id }).catch(() => null)));
    S.chars = chars.filter((c, i) => !owners[i] || !identity || owners[i].id === identity.id);
    const [convs, metas] = await Promise.all([dbList(COL.convs), dbList(COL.meta)]);
    const scope = S.identity.id;
    S.convs = convs.filter(c => c.scope === scope).map(c => ({ ...c, msgs: c.msgs || [] }));
    S.debug = (metas.find(m => m.id === "debug_log") || {}).entries || [];
    S.meta = metas.find(m => m.id === `meta_${scope}`) || { id: `meta_${scope}`, excluded: [], banned: {}, follow: 50, showThink: false };
    if (!Array.isArray(S.meta.excluded)) S.meta.excluded = [];
    if (!S.meta.banned || typeof S.meta.banned !== "object") S.meta.banned = {};
  }
  const charById = id => S.chars.find(c => c.id === id);
  const activeChars = () => S.chars.filter(c => !S.meta.excluded.includes(c.id));
  const isBanned = id => !!S.meta.banned[id];
  const herName = () => S.identity.name || "她";
  const avatarHtml = c => c && c.avatar ? `<img class="av" src="${esc(c.avatar)}" alt="">` : `<div class="av" style="background:${gradientFor(c ? c.id : "?")}">${esc(((c && c.name) || "?").slice(0, 1))}</div>`;
  function remember(charId, summary, eventId) {
    if (!charId || !api.memory || !api.memory.addTimeline) return;
    api.memory.addTimeline({ characterId: charId, appLabel: "Claude", detail: "claude", summary, appEventId: eventId }).catch(e => console.warn(e));
  }
  function forget(events) { if (!api.memory || !api.memory.deleteTimeline) return; for (const e of events) api.memory.deleteTimeline({ characterId: e.charId, appEventId: e.eventId }).catch(() => {}); }

  // ───────────────────────── 提示 ─────────────────────────
  function toast(msg) { const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 1800); }
  /** 底部弹出的选项（线条图标 + 文字） */
  function sheet(title, items) {
    return new Promise(resolve => {
      const mask = document.createElement("div"); mask.className = "mask";
      mask.innerHTML = `<div class="sheet"><div class="grab"></div>${title ? `<div class="sheet-h">${esc(title)}</div>` : ""}${items.map((it, i) => `<button class="opt ${it.danger ? "danger" : ""}" data-i="${i}">${it.icon || ""}<div class="cell-main">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</div>${it.on ? `<span class="ck">${I.check}</span>` : ""}</button>`).join("")}</div>`;
      mask.onclick = e => { const b = e.target.closest("[data-i]"); if (!b && e.target !== mask) return; mask.remove(); resolve(b ? items[+b.dataset.i].value : null); };
      document.body.appendChild(mask);
    });
  }
  function inputSheet(title, value, maxlength = 40) {
    return new Promise(resolve => {
      const mask = document.createElement("div"); mask.className = "mask";
      mask.innerHTML = `<form class="sheet" action="#"><div class="grab"></div><div class="sheet-h">${esc(title)}</div><div style="padding:0 18px 12px"><input class="field" maxlength="${maxlength}" value="${esc(value || "")}"></div><button class="opt ok" type="submit"><div class="cell-main">确定</div></button></form>`;
      const input = $("input", mask);
      $("form", mask).onsubmit = e => { e.preventDefault(); mask.remove(); resolve(input.value.trim()); };
      mask.onclick = e => { if (e.target === mask) { mask.remove(); resolve(null); } };
      document.body.appendChild(mask); setTimeout(() => input.focus(), 50);
    });
  }

  // ───────────────────────── AI ─────────────────────────
  function logAi(entry) {
    S.debug = [{ at: nowIso(), ...entry, text: String(entry.text || "").slice(0, 6000) }, ...S.debug].slice(0, 10);
    dbUpsert(COL.meta, { id: "debug_log", entries: S.debug }).catch(() => {});
  }
  /** 这个 app 的设定（随请求发）：他在用 AI 助手，不知道背后是用户 */
  const APP_RULE = () => `【Claude 是什么】你（角色）手机上装了 AI 助手 Claude（Anthropic 做的，和 ChatGPT、豆包差不多），平时有问题会问它。你不知道、也不会怀疑 Claude 背后有真人——在你眼里它就是 AI。
【怎么提问】按你的人设、年龄、最近的生活、和用户（${herName()}）的关系、记忆里的事来问：可以是真困扰（感情、学习工作、人际、怎么对她好）、生活小事（菜谱、选礼物、写段文字）、好奇心（「天空为什么是蓝的」），也可以是按你性格会问的无厘头问题。问法像真人用 AI：口语、有时打错字、有时一次问一大串、有时就一句话。
【跟 AI 说话】你对 AI 的态度按你的性格来：有人很客气说谢谢，有人当工具人直接下命令，有人会跟它抬杠、嫌它啰嗦。
【底线】用户的事只能来自聊天记录和记忆，不能编她没做过的事、没说过的话。你问 AI 时提到她，是你自己的视角和心事。`;
  async function generate(charId, scene, instruction, label) {
    const job = uid("job"); S.busy.add(job); refresh();
    try {
      const r = await api.ai.generate({ characterId: charId, appTags: ["nox_claude", scene], instruction: [APP_RULE(), `当前时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`, instruction, "【输出要求】只输出本轮说明要求的块，字段名照抄，不要解释、不要旁白、不要 markdown。"].join("\n\n") });
      const text = (r && r.text) || ""; logAi({ label, ok: true, text }); return text;
    } catch (e) {
      console.error(e); logAi({ label, ok: false, error: String((e && e.message) || e) }); toast(`${label}失败：${(e && e.message) || e}`.slice(0, 60)); return null;
    } finally { S.busy.delete(job); refresh(); }
  }
  const KEYS = ["标题", "模型", "思考强度", "内容", "反馈", "继续问", "看了思考", "想跟她说", "反应"];
  function parseBlock(raw, kind) {
    const text = String(raw || "").replace(/```[a-z]*\n?/g, "").replace(/\r/g, "");
    let label = null; const out = [];
    for (const seg of text.split(/(===[^=\n]+===)/)) {
      const mk = seg.match(/^===(.+)===$/); if (mk) { label = mk[1].trim(); continue; }
      if (label !== kind) continue;
      const f = {}; let cur = null;
      for (const line of seg.split("\n")) {
        const m = line.match(new RegExp(`^\\s*(?:[-*]\\s*)?(${KEYS.join("|")})\\s*[：:]\\s*(.*)$`));
        if (m) { cur = m[1]; f[cur] = m[2].trim(); } else if (cur) f[cur] = (f[cur] ? f[cur] + "\n" : "") + line;
      }
      for (const k in f) f[k] = String(f[k]).replace(/\n+$/, "").trim();
      if (Object.keys(f).length) out.push(f);
    }
    return out[0] || null;
  }
  /** 对话记录给 AI 看：他问的、AI（她）答的、被拦截的 */
  const historyText = c => c.msgs.slice(-16).map(m => m.role === "char" ? `我：${m.text}` : m.role === "me" ? (m.blocked ? "Claude：（这条回复被拦截了，显示「违反使用政策，无法回复」）" : `Claude：${m.text}${m.redo ? "（我点了重新生成）" : ""}`) : `（系统：${m.text}）`).join("\n");

  /** 来一个新问题：他自己挑模型和思考强度 */
  async function newQuestion(charId) {
    const ch = charById(charId); if (!ch) return;
    if (isBanned(charId)) { toast(`${ch.name}的账号已停用`); return; }
    const recent = S.convs.filter(c => c.charId === charId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 8).map(c => `- ${c.title}`).join("\n");
    // 问什么：代码掷骰子定方向（她更想看无厘头的，发生过的事少一点）
    const r = Math.random();
    const kind = r < 0.6 ? "这次问一个莫名其妙、无厘头的问题：和剧情、记忆、用户都没关系，是你这种人某个瞬间会冒出来的怪念头。比如冷知识（为什么猫会踩奶）、离谱假设（如果人类有尾巴，裤子怎么设计）、生活小怪事（为什么袜子总是丢一只）、让 AI 干奇怪的活（给你的拖鞋写一首诗、帮你的绿萝起名字）、测试或者抬杠（你是不是在敷衍我）、深夜哲学（我上辈子是不是一只鸭子）。要有你自己的性格和口吻，别直接用这些例子。"
      : r < 0.85 ? "这次问一个你自己生活里的问题：学习工作、爱好、身体、吃什么、买什么、人际小烦恼。和用户无关。"
      : "这次问一个和最近发生的事、或者和用户有关的问题（按聊天记录和记忆来，不编她的事）。";
    const text = await generate(charId, "ask", [
      `你（${ch.name}）打开 Claude，开了一个新对话。你想问什么？`, kind,
      recent ? `你最近问过这些（换个新问题）：\n${recent}` : "",
      `===提问===\n标题：这个对话的标题（像 Claude 自动起的，四到十个字概括你问的事）\n模型：你选的模型（${MODELS.map(m => m[0]).join(" / ")}：按你的性格和问题选，急的、简单的用快的，纠结的、难的用聪明的）\n思考强度：${EFFORTS.join(" / ")}\n内容：\n你发给 Claude 的第一条消息\n===结束===`,
    ].filter(Boolean).join("\n\n"), `${ch.name}来提问`);
    if (text == null) return null;
    const b = parseBlock(text, "提问"); if (!b || !b["内容"]) { toast("这次没写出能用的问题，去设置里看看调试记录"); return null; }
    const c = { id: uid("cv"), scope: S.identity.id, charId, title: String(b["标题"] || b["内容"].slice(0, 12)).slice(0, 24), model: pickModel(b["模型"]), effort: pickEffort(b["思考强度"]), msgs: [{ role: "char", text: b["内容"], at: nowIso() }], createdAt: nowIso(), updatedAt: nowIso() };
    S.convs.push(c); saveConv(c); refresh(); return c;
  }
  /**
   * 他看完她的回答之后：评价（赞 / 踩 / 重新生成 / 无）、要不要继续问（代码先掷骰子定）、有没有点开思考过程、看到好玩的想不想跟她说
   */
  async function followUp(c, mustAsk) {
    if (c._busy) return; const ch = charById(c.charId); if (!ch || isBanned(ch.id)) return;
    const last = [...c.msgs].reverse().find(m => m.role === "me");
    const looked = last && last.thinking && Math.random() < 0.5; // 思考过程他可能点开看，也可能不看
    c._busy = true; refresh();
    const text = await generate(ch.id, "followup", [
      `你（${ch.name}）在 Claude 里的对话「${c.title}」（模型 ${c.model}，思考强度 ${c.effort}）：\n${historyText(c)}`,
      last && last.blocked ? "Claude 刚刚拒绝回答，显示「这条消息可能违反了使用政策，无法回复」。按你的性格反应（莫名其妙、生气、换个问法、吐槽它）。" : "你刚看完 Claude 的回答。",
      looked ? `你点开了它的「思考过程」，看到：「${last.thinking}」。如果觉得好玩、离谱、可爱，想之后跟${herName()}分享，就在「想跟她说」里写一句你会跟她说的话；不想说写 无。` : "",
      mustAsk ? "你接着问一句（追问、反驳、换个问题、道谢后再问都行）。" : "这次你继续问不继续问都行，按自然情况；问完满意了可以不问（继续问写 否）。",
      `===反应===\n反馈：赞 / 踩 / 重新生成 / 无（你对它上一条回答点了什么；一般不点写 无；很满意点赞；不满意点踩；想让它换个回答点重新生成）\n继续问：是 / 否\n${looked ? "看了思考：是\n想跟她说：一句话或 无\n" : ""}内容：\n你发的下一条消息（继续问写 否就写 无）\n===结束===`,
    ].filter(Boolean).join("\n\n"), `${ch.name}看回答`);
    c._busy = false;
    if (text == null) { refresh(); return; }
    const b = parseBlock(text, "反应") || {};
    const fb = String(b["反馈"] || ""); const fbv = /重新/.test(fb) ? "redo" : /踩/.test(fb) ? "bad" : /赞/.test(fb) ? "good" : "";
    if (last && fbv) { last.feedback = fbv; if (fbv === "redo") last.redo = true; }
    const say = looked && !none(b["想跟她说"]) ? String(b["想跟她说"]).trim() : "";
    if (say) remember(ch.id, `我在 Claude 上问「${c.title}」时点开了它的思考过程，觉得很好玩，想跟${herName()}说：「${say.slice(0, 80)}」`, `claude_think_${c.id}_${c.msgs.length}`);
    const more = (mustAsk || yes(b["继续问"]) || fbv === "redo") && !none(b["内容"]) ? String(b["内容"]).trim() : "";
    if (more) c.msgs.push({ role: "char", text: more, at: nowIso() });
    else if (fbv === "redo") c.msgs.push({ role: "char", text: "（点了重新生成）", at: nowIso(), redoAsk: true });
    c.updatedAt = nowIso(); saveConv(c); refresh();
  }

  /** 她发了回答 / 拦截 / 封号 */
  function sendAnswer(c, text, thinking) {
    const effort = c.effort;
    const m = { role: "me", text, thinking: thinking || "", secs: thinking || effort !== "关" ? thinkSecs(effort === "关" ? "低" : effort) : 0, at: nowIso() };
    c.msgs.push(m); c.updatedAt = nowIso(); saveConv(c); refresh();
    const q = [...c.msgs].reverse().find(x => x.role === "char" && !x.redoAsk);
    remember(c.charId, `我问 AI 助手 Claude「${(q ? q.text : c.title).slice(0, 50)}」，它回答：「${text.slice(0, 120)}」`, `claude_ans_${c.id}_${c.msgs.length}`);
    // 他自己会不会接着问：按设置的概率掷骰子；不掷中就只等她在 ··· 里叫他
    if (Math.random() * 100 < (S.meta.follow ?? 50)) setTimeout(() => followUp(c), 900);
  }
  function sendBlocked(c) {
    c.msgs.push({ role: "me", blocked: true, text: "", at: nowIso() }); c.updatedAt = nowIso(); saveConv(c); refresh();
    const q = [...c.msgs].reverse().find(x => x.role === "char");
    remember(c.charId, `我问 AI 助手 Claude「${(q ? q.text : c.title).slice(0, 50)}」，结果它说违反使用政策，拒绝回答我`, `claude_block_${c.id}_${c.msgs.length}`);
    if (Math.random() < 0.7) setTimeout(() => followUp(c), 900);
  }
  async function banChar(charId) {
    const ch = charById(charId); if (!ch) return;
    if (await sheet(`停用 ${ch.name} 的 Claude 账号？他会记得自己被封号了（以后可以在设置里解封）`, [{ label: "封号", value: "yes", danger: true, icon: I.ban }]) !== "yes") return;
    S.meta.banned[charId] = nowIso(); saveMeta();
    for (const c of S.convs.filter(x => x.charId === charId)) { c.msgs.push({ role: "sys", text: "您的账户因违反使用政策已被停用。", at: nowIso() }); c.updatedAt = nowIso(); saveConv(c); }
    remember(charId, "我用的 AI 助手 Claude 把我的账号封了，提示「您的账户因违反使用政策已被停用」，莫名其妙", `claude_ban_${charId}_${Date.now()}`);
    refresh(); toast(`${ch.name} 已被封号`);
  }
  function unbanChar(charId) {
    const ch = charById(charId); if (!ch || !isBanned(charId)) return;
    delete S.meta.banned[charId]; saveMeta();
    remember(charId, "我的 Claude 账号解封了，又能用了", `claude_unban_${charId}_${Date.now()}`);
    refresh(); toast(`${ch.name} 解封了`);
  }

  // ───────────────────────── 页面 ─────────────────────────
  const pages = [];
  function openPage(key, render, opts = {}) {
    const old = pages.find(p => p.key === key); if (old && pages[pages.length - 1] === old) { old.render(old); return old; }
    const el = document.createElement("section"); el.className = `page ${opts.cls || ""}`;
    el.innerHTML = `<header class="hd"><div class="hd-in"><button class="ic" data-act="back">${I.back}</button><div class="hd-t">${opts.title || ""}</div>${opts.action || `<span class="ic"></span>`}</div></header><div class="pb"></div>${opts.footer || ""}`;
    document.body.appendChild(el);
    const page = { key, el, render, opts }; pages.push(page); render(page); return page;
  }
  function closePage() { const p = pages.pop(); if (!p) return; p.el.classList.add("closing"); setTimeout(() => p.el.remove(), 180); refresh(); }
  const topPage = () => pages[pages.length - 1];
  function body(pg, html, keepBottom) { const b = $(".pb", pg.el); const atBottom = b.scrollHeight - b.scrollTop - b.clientHeight < 60; const sc = b.scrollTop; b.innerHTML = html; b.scrollTop = keepBottom && atBottom ? b.scrollHeight : sc; }
  function refresh() { for (const p of pages) p.render(p); renderHome(); }
  const greet = () => { const h = new Date().getHours(); return h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好"; };

  /** 首页：问候 + 「有人想问你问题」+ 最近的对话（每个对话一行）+ 已封禁 */
  function renderHome() {
    if (!S.meta) return;
    const list = S.convs.filter(c => charById(c.charId)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const live = list.filter(c => !isBanned(c.charId)); const dead = list.filter(c => isBanned(c.charId));
    const asking = [...S.busy].length && !pages.length;
    const row = c => { const ch = charById(c.charId); const last = c.msgs[c.msgs.length - 1] || {};
      const pre = last.role === "me" ? (last.blocked ? "（已拦截）" : `你：${last.text}`) : last.text;
      return `<div class="it" data-act="open-conv" data-id="${esc(c.id)}">${avatarHtml(ch)}<div class="cell-main"><div class="it-t"><b>${esc(c.title)}</b><span>${fmtTime(c.updatedAt)}</span></div><div class="it-s">${esc(ch.name)} · ${esc(pre || "")}</div></div></div>`; };
    $("#home").innerHTML = `<header class="hd"><div class="hd-in"><button class="ic" data-act="settings">${I.menu}</button><div class="hd-t">Claude</div><button class="ic" data-act="ask-pick">${I.plus}</button></div></header>
      <div class="pb">
        <div class="greet">${SPARK}<span>${greet()}，Claude</span></div>
        <button class="newb" data-act="ask-random">${asking ? `<span class="spinner"></span>有人正在打字…` : `${I.ask}<span>有人想问你问题… 点一下让 char 来提问</span>`}</button>
        ${live.length ? `<div class="sec">最近</div>${live.map(row).join("")}` : `<div class="empty">还没有人来问过你<br>点上面那条，让一个 char 来提问</div>`}
        ${dead.length ? `<div class="sec">已封禁</div><div class="dead">${dead.map(row).join("")}</div>` : ""}
      </div>`;
  }
  /** 对话页 */
  function openConv(id) {
    let draft = "", thinkDraft = "";
    const page = openPage(`conv:${id}`, pg => {
      const c = S.convs.find(x => x.id === id); if (!c) { body(pg, `<div class="empty">对话已删除</div>`); return; }
      const ch = charById(c.charId) || { name: "?" }; const banned = isBanned(c.charId);
      $(".hd-t", pg.el).innerHTML = `<div class="ttl">${esc(c.title)}</div><small>${esc(ch.name)}</small>`;
      const lastIdx = c.msgs.length - 1;
      body(pg, `<div class="chat">${c.msgs.map((m, i) => {
        if (m.role === "char") return m.redoAsk ? `<div class="sysline">${esc(ch.name)} 点了重新生成</div>` : `<div class="who">${esc(ch.name)}${avatarHtml(ch)}</div><div class="u">${esc(m.text).replace(/\n/g, "<br>")}</div>`;
        if (m.role === "sys") return `<div class="sysline warn">${esc(m.text)}</div>`;
        if (m.blocked) return `<div class="blocked">${I.shield}<div>这条消息可能违反了我们的使用政策，Claude 无法回复。<small>如果你认为这是误判，可以换个说法再试一次。</small></div></div>`;
        return `<div class="a ${m.redo ? "redone" : ""}">${m.secs ? `<button class="think" data-act="toggle-think" data-i="${i}">思考了 ${m.secs} 秒 ${I.chev}</button>${m.open && m.thinking ? `<div class="think-body">${esc(m.thinking).replace(/\n/g, "<br>")}</div>` : ""}` : ""}
          <div class="tx">${md(m.text)}</div>
          <div class="acts"><button data-act="copy" data-i="${i}">${I.copy}</button><button data-act="noop">${I.share}</button><button data-act="noop">${I.play}</button><span class="${m.feedback === "good" ? "on" : ""}">${I.good}</span><span class="bad ${m.feedback === "bad" ? "on" : ""}">${I.good}</span><span class="${m.feedback === "redo" ? "on" : ""}">${I.retry}</span></div></div>`;
      }).join("")}
        ${c._busy ? `<div class="who">${esc(ch.name)}${avatarHtml(ch)}</div><div class="typing"><i></i><i></i><i></i></div>` : ""}
        ${banned ? `<div class="sysline warn">${esc(ch.name)} 的账号已停用</div>` : ""}
        <div class="foot">${SPARK}<div>Claude can make mistakes.<br>Please double check responses.</div></div></div>`, true);
      const waiting = !banned && c.msgs.length && c.msgs[lastIdx].role === "char";
      const cp = $(".cp", pg.el); cp.classList.toggle("off", !waiting);
      $(".mp", pg.el).innerHTML = `${esc(c.model)} <em>${esc(c.effort)}</em>`;
      $(".think-in", pg.el).classList.toggle("hidden", !S.meta.showThink);
      $(".in", pg.el).placeholder = banned ? "账号已停用" : waiting ? `回复${ch.name}…` : `等${ch.name}说话…（右上角 ··· 让他继续问）`;
    }, { cls: "conv", action: `<button class="ic" data-act="conv-menu" data-id="${esc(id)}">${I.more}</button>`,
      footer: `<div class="cp"><textarea class="think-in hidden" rows="1" placeholder="思考过程（可以不写；他可能会点开看）"></textarea><textarea class="in" rows="1"></textarea>
        <div class="row"><button class="cb" data-act="plus" data-id="${esc(id)}">${I.plus}</button><button class="mp" data-act="model" data-id="${esc(id)}"></button><span class="cb" style="margin-left:auto" data-act="noop">${I.mic}</span><button class="send" data-act="send" data-id="${esc(id)}">${I.up}</button></div></div>` });
    const input = $(".in", page.el); const tin = $(".think-in", page.el);
    const fitCp = () => page.el.style.setProperty("--cp-h", `${$(".cp", page.el).offsetHeight + 12}px`);
    const grow = el => { el.style.height = "auto"; el.style.height = Math.min(140, el.scrollHeight) + "px"; fitCp(); };
    input.oninput = () => { draft = input.value; grow(input); }; tin.oninput = () => { thinkDraft = tin.value; grow(tin); };
    page.take = () => { const v = { text: draft.trim(), thinking: thinkDraft.trim() }; draft = thinkDraft = ""; input.value = tin.value = ""; grow(input); grow(tin); return v; };
    const r0 = page.render; page.render = pg => { r0(pg); fitCp(); }; page.render(page);
    const b = $(".pb", page.el); b.scrollTop = b.scrollHeight;
    return page;
  }
  function openSettings() {
    openPage("settings", pg => {
      body(pg, `<div class="sec">谁会来问你问题</div>${S.chars.map(c => `<div class="it">${avatarHtml(c)}<div class="cell-main"><b>${esc(c.name)}</b>${isBanned(c.id) ? `<div class="it-s">账号已停用 · <a data-act="unban" data-id="${esc(c.id)}">解封</a></div>` : ""}</div><button class="sw ${S.meta.excluded.includes(c.id) ? "" : "on"}" data-act="toggle-char" data-id="${esc(c.id)}"><span></span></button></div>`).join("") || `<div class="empty">这个身份还没有角色好友</div>`}
        <div class="sec">你回答之后，他自己接着问的概率</div><div class="seg">${[0, 30, 50, 70, 100].map(v => `<button class="${(S.meta.follow ?? 50) === v ? "on" : ""}" data-act="follow" data-v="${v}">${v}%</button>`).join("")}</div>
        <div class="note">没接着问的时候，在对话右上角 ··· 里点「让他继续问」</div>
        <div class="sec">调试记录（最近 10 次）</div>${S.debug.map(e => `<div class="dbg"><b>${esc(e.label || "")}</b> <span>${fmtTime(e.at)}${e.ok ? "" : " 失败"}</span><pre>${esc(e.ok ? e.text : e.error)}</pre></div>`).join("") || `<div class="note">还没有 AI 调用</div>`}
        <div class="note" style="text-align:center;padding:20px">Claude v${VERSION} · Nox for Flora</div>`);
    }, { title: "设置" });
  }

  // ───────────────────────── 点击 ─────────────────────────
  async function askFrom(charId) {
    const c = await newQuestion(charId); if (c) openConv(c.id);
  }
  document.addEventListener("click", async e => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const act = el.dataset.act; const pg = topPage();
    const conv = id => S.convs.find(x => x.id === id);
    switch (act) {
      case "back": closePage(); return;
      case "noop": return;
      case "settings": openSettings(); return;
      case "open-conv": openConv(el.dataset.id); return;
      case "ask-random": {
        if (S.busy.size) return;
        const pool = activeChars().filter(c => !isBanned(c.id)); if (!pool.length) { toast("没有能来提问的角色（都关掉或封号了）"); return; }
        askFrom(pool[Math.floor(Math.random() * pool.length)].id); return;
      }
      case "ask-pick": {
        const pool = activeChars().filter(c => !isBanned(c.id)); if (!pool.length) { toast("没有能来提问的角色"); return; }
        const id = await sheet("让谁来问一个新问题", pool.map(c => ({ label: c.name, value: c.id }))); if (id) askFrom(id); return;
      }
      case "send": {
        const c = conv(el.dataset.id); if (!c || !pg || !pg.take) return;
        const last = c.msgs[c.msgs.length - 1]; if (!last || last.role !== "char" || isBanned(c.charId)) return;
        const v = pg.take(); if (!v.text) { toast("先写回答"); return; }
        sendAnswer(c, v.text, v.thinking); return;
      }
      case "plus": {
        const c = conv(el.dataset.id); if (!c) return;
        const waiting = c.msgs.length && c.msgs[c.msgs.length - 1].role === "char" && !isBanned(c.charId);
        const v = await sheet("", [{ label: "照片", value: "photo", icon: I.photo }, { label: "文件", value: "file", icon: I.file },
          { label: "受政策限制", sub: "这条不回答，显示成被拦截", value: "block", icon: I.shield }, { label: "封号", sub: "停用他的账号，会写进他的记忆", value: "ban", icon: I.ban, danger: true }]);
        if (v === "photo" || v === "file") toast("这个以后再做～");
        if (v === "block") { if (waiting) sendBlocked(c); else toast("等他说话的时候才能拦截"); }
        if (v === "ban") banChar(c.charId);
        return;
      }
      case "model": {
        const c = conv(el.dataset.id); if (!c) return;
        const m = await sheet(`模型 · ${charById(c.charId)?.name || ""}自己选的，你也可以改`, [...MODELS.map(([n, d]) => ({ label: n, sub: d, value: n, on: c.model === n })), { label: `思考强度：${c.effort}`, sub: "点这里改", value: "_effort", icon: I.bulb }]);
        if (m === "_effort") { const ef = await sheet("思考强度", EFFORTS.map(x => ({ label: x, value: x, on: c.effort === x }))); if (ef) c.effort = ef; }
        else if (m) c.model = m;
        saveConv(c); refresh(); return;
      }
      case "conv-menu": {
        const c = conv(el.dataset.id); if (!c) return; const ch = charById(c.charId);
        const v = await sheet("", [{ label: `让${ch ? ch.name : "他"}继续问`, value: "ask", icon: I.ask }, { label: "展示思考过程", value: "think", icon: I.bulb, on: !!S.meta.showThink },
          { label: "重命名对话", value: "rename", icon: I.pen }, ...(isBanned(c.charId) ? [{ label: "解封", value: "unban", icon: I.unban }] : []), { label: "删除对话", value: "del", icon: I.trash, danger: true }]);
        if (v === "ask") { if (isBanned(c.charId)) toast("他的账号已停用"); else if (!c.msgs.some(m => m.role === "me")) toast("先回答他一次吧"); else followUp(c, true); }
        if (v === "think") { S.meta.showThink = !S.meta.showThink; saveMeta(); refresh(); toast(S.meta.showThink ? "输入框上面可以写思考过程了" : "关掉了"); }
        if (v === "rename") { const t = await inputSheet("重命名对话", c.title, 24); if (t) { c.title = t; saveConv(c); refresh(); } }
        if (v === "unban") unbanChar(c.charId);
        if (v === "del") {
          if (await sheet("删除这个对话？他关于这个对话的记忆也一起删掉", [{ label: "删除", value: "yes", danger: true, icon: I.trash }]) !== "yes") return;
          forget(c.msgs.map((m, i) => ({ charId: c.charId, eventId: `claude_ans_${c.id}_${i + 1}` })).concat(c.msgs.map((m, i) => ({ charId: c.charId, eventId: `claude_block_${c.id}_${i + 1}` }))));
          S.convs = S.convs.filter(x => x !== c); dbDelete(COL.convs, c.id); closePage(); toast("删除了");
        }
        return;
      }
      case "toggle-think": { const c = conv(pg.key.split(":")[1]); const m = c && c.msgs[+el.dataset.i]; if (m) { if (!m.thinking) { toast("这次没写思考过程"); return; } m.open = !m.open; pg.render(pg); } return; }
      case "copy": { const c = conv(pg.key.split(":")[1]); const m = c && c.msgs[+el.dataset.i]; if (m) { try { await navigator.clipboard.writeText(m.text); toast("已复制"); } catch (err) { toast("复制不了"); } } return; }
      case "toggle-char": { const id = el.dataset.id; S.meta.excluded = S.meta.excluded.includes(id) ? S.meta.excluded.filter(x => x !== id) : [...S.meta.excluded, id]; saveMeta(); refresh(); return; }
      case "unban": unbanChar(el.dataset.id); return;
      case "follow": S.meta.follow = +el.dataset.v; saveMeta(); refresh(); return;
    }
  });

  // ───────────────────────── 启动 ─────────────────────────
  async function boot() {
    document.body.insertAdjacentHTML("afterbegin", `<main id="home"><div class="empty">加载中…</div></main>`);
    if (!api) { $("#home").innerHTML = `<div class="empty">请在小手机里打开这个 APP</div>`; return; }
    try { await loadAll(); } catch (e) { console.error(e); $("#home").innerHTML = `<div class="empty">加载失败：${esc(e.message || e)}</div>`; return; }
    renderHome();
  }
  boot();
})();
