// 小红书链接：聊天里粘贴小红书分享，变成一张笔记卡片；
// 他能读到标题、正文、首屏评论，还能真的看到配图。
// 原理：手机 UA 打开笔记页，拆出页面里的 __INITIAL_STATE__；图片走宿主 /api/tool-proxy 下载。

const KIND = "xhs-note";
const MARK = "[小红书笔记 #";
const IMG_CACHE = "xhs-note-images-v1";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const LINK_RE = /https?:\/\/(?:xhslink\.(?:com|cn)|(?:www\.)?xiaohongshu\.com)\/[^\s，。！？、）)】」"'<>]+/i;

const CSS = `
.xhsn-card{display:block;width:232px;background:#fff;border-radius:12px;overflow:hidden;color:#222;text-decoration:none;
  box-shadow:0 0 0 1px rgba(255,36,66,.16),0 2px 8px rgba(0,0,0,.06);cursor:pointer;-webkit-tap-highlight-color:transparent}
.xhsn-cover{position:relative;width:100%;aspect-ratio:4/3;background:#f3f3f3 center/cover no-repeat}
.xhsn-badge{position:absolute;right:8px;top:8px;padding:2px 7px;border-radius:10px;background:rgba(0,0,0,.45);color:#fff;font-size:11px;line-height:16px}
.xhsn-video{position:absolute;left:50%;top:50%;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;background:rgba(0,0,0,.4);color:#fff;font-size:15px;line-height:38px;text-align:center}
.xhsn-body{padding:9px 11px 10px}
.xhsn-title{font-size:14px;font-weight:600;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.xhsn-desc{margin-top:4px;font-size:12px;line-height:1.5;color:#666;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.xhsn-foot{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:#999}
.xhsn-logo{flex:none;padding:0 4px;border-radius:3px;background:#ff2442;color:#fff;font-size:10px;font-weight:700;line-height:15px}
.xhsn-author{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.xhsn-stat{flex:none}
`;

function cleanUrl(u) {
  if (!u) return "";
  u = String(u).replace(/\\u002F/g, "/");
  if (u.startsWith("//")) u = "https:" + u;
  return u.replace(/^http:\/\//, "https://");
}

function num(v) {
  const n = String(v ?? "").trim();
  return n || "0";
}

async function proxy(url, headers, timeoutMs) {
  const res = await fetch("/api/tool-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, method: "GET", headers, timeoutMs }),
  });
  return res;
}

function parseState(html) {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/:\s*undefined\b/g, ":null"));
  } catch {
    return null;
  }
}

async function fetchNote(link) {
  const res = await proxy(link, { "User-Agent": PHONE_UA, "Accept-Language": "zh-CN,zh;q=0.9" }, 20000);
  if (!res.ok) throw new Error("笔记页打不开（" + res.status + "）");
  const state = parseState(await res.text());
  const nd = state && state.noteData;
  const data = nd && nd.data;
  const n = (data && data.noteData) || (nd && nd.normalNotePreloadData);
  if (!n || (!n.title && !n.desc)) throw new Error("没读到笔记内容，可能被删了或者设了仅自己可见");

  const user = n.user || {};
  const info = n.interactInfo || {};
  const images = (n.imageList || []).map(img => cleanUrl(img.url || (img.infoList && img.infoList[0] && img.infoList[0].url))).filter(Boolean);
  const comments = ((data && data.commentData && data.commentData.comments) || []).map(c => ({
    user: (c.user && c.user.nickname) || "路人",
    content: (c.content || "").replace(/\[([^\[\]]{1,6})R\]/g, "[$1]"),
    ip: c.ipLocation || "",
    likes: c.likeCount || 0,
    pics: (c.pictures || []).length,
    replies: (c.subComments || []).map(s => ({
      user: (s.user && s.user.nickname) || "路人",
      content: (s.content || "").replace(/\[([^\[\]]{1,6})R\]/g, "[$1]"),
      ip: s.ipLocation || "",
    })),
  }));
  return {
    id: n.noteId || "",
    url: link,
    type: n.type === "video" ? "video" : "normal",
    title: n.title || "",
    desc: (n.desc || "").replace(/\[话题\]#/g, " ").replace(/\[([^\[\]]{1,6})R\]/g, "[$1]").trim(),
    author: user.nickName || user.nickname || "小红书用户",
    images,
    likes: num(info.likedCount),
    collects: num(info.collectedCount),
    commentCount: num(info.commentCount),
    comments,
  };
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: type || "image/jpeg" });
}

async function shrink(blob, maxSide, quality) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return canvas.toDataURL("image/jpeg", quality);
}

async function downloadImage(url) {
  const res = await proxy(url, { "User-Agent": PHONE_UA, Referer: "https://www.xiaohongshu.com/" }, 30000);
  const json = await res.json();
  if (!json || !json._binary || !json.data) throw new Error("图片下载失败");
  return base64ToBlob(json.data, json.contentType);
}

function cacheKey(noteId, i) {
  return "https://xhs-note.local/" + encodeURIComponent(noteId) + "/" + i;
}

async function saveImages(noteId, dataUrls) {
  try {
    const cache = await caches.open(IMG_CACHE);
    await Promise.all(dataUrls.map((d, i) => d ? cache.put(cacheKey(noteId, i), new Response(d)) : null));
  } catch { /* 存不了就只在这次会话里用 */ }
}

const memImages = new Map();

async function loadImages(noteId, count) {
  if (memImages.has(noteId)) return memImages.get(noteId);
  const out = [];
  try {
    const cache = await caches.open(IMG_CACHE);
    for (let i = 0; i < count; i++) {
      const hit = await cache.match(cacheKey(noteId, i));
      if (hit) out.push(await hit.text());
    }
  } catch { /* ignore */ }
  if (out.length) memImages.set(noteId, out);
  return out;
}

// 发给他看的文字版
function noteToText(note, imageCount) {
  const lines = [];
  lines.push(MARK + note.id + "]");
  lines.push("作者：" + note.author);
  if (note.title) lines.push("标题：" + note.title);
  if (note.desc) lines.push("正文：\n" + note.desc);
  if (note.type === "video") lines.push("（这是视频笔记，视频看不了，只能看到封面）");
  else if (imageCount) lines.push("（配图 " + imageCount + " 张，附在这条消息里）");
  lines.push("点赞 " + note.likes + " · 收藏 " + note.collects + " · 评论 " + note.commentCount);
  if (note.comments.length) {
    lines.push("评论区（只显示前面几条）：");
    for (const c of note.comments) {
      lines.push("- " + c.user + (c.ip ? "（" + c.ip + "）" : "") + "：" + c.content + (c.pics ? " [附图]" : "") + (c.likes ? "（" + c.likes + "赞）" : ""));
      for (const r of c.replies.slice(0, 3)) {
        lines.push("  ↳ " + r.user + (r.ip ? "（" + r.ip + "）" : "") + "：" + r.content);
      }
    }
  }
  return lines.join("\n");
}

// 去掉分享文案，只留她自己说的话
function ownWords(text, link, note) {
  const at = text.indexOf(link);
  let before = at >= 0 ? text.slice(0, at) : text;
  let after = at >= 0 ? text.slice(at + link.length) : "";
  after = after.replace(/^\s*[^\n]*?【小红书】[^\n]*?[！!~～]/, "");
  before = before.replace(/【[^】]*小红书[^】]*】/g, "").replace(/😆[^😆]*😆/g, "");
  const head = (note.title || note.desc || "").trim().slice(0, 8);
  if (head) {
    const i = before.indexOf(head);
    if (i >= 0) before = before.slice(0, i);
  }
  return (before.trim() + " " + after.trim()).trim();
}

function renderCard(el, msg) {
  const d = msg.mediaData || {};
  const a = document.createElement("a");
  a.className = "xhsn-card";
  a.href = d.url || "#";
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const cover = document.createElement("div");
  cover.className = "xhsn-cover";
  if (d.cover) cover.style.backgroundImage = "url(" + JSON.stringify(d.cover) + ")";
  if (d.noteType === "video") {
    const v = document.createElement("div");
    v.className = "xhsn-video";
    v.textContent = "▶";
    cover.appendChild(v);
  } else if (d.imageCount > 1) {
    const b = document.createElement("div");
    b.className = "xhsn-badge";
    b.textContent = "1/" + d.imageCount;
    cover.appendChild(b);
  }
  a.appendChild(cover);

  const body = document.createElement("div");
  body.className = "xhsn-body";
  if (d.title) {
    const t = document.createElement("div");
    t.className = "xhsn-title";
    t.textContent = d.title;
    body.appendChild(t);
  }
  if (d.desc) {
    const s = document.createElement("div");
    s.className = "xhsn-desc";
    s.textContent = d.desc;
    body.appendChild(s);
  }
  const foot = document.createElement("div");
  foot.className = "xhsn-foot";
  foot.innerHTML = '<span class="xhsn-logo">小红书</span><span class="xhsn-author"></span><span class="xhsn-stat"></span>';
  foot.querySelector(".xhsn-author").textContent = d.author || "";
  foot.querySelector(".xhsn-stat").textContent = "♡ " + (d.likes || "0");
  body.appendChild(foot);
  a.appendChild(body);

  el.appendChild(a);
}

function refreshChat(sessionId) {
  window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
}

export default {
  manifest: {
    id: "xhs-note-reader",
    name: "小红书链接",
    apiVersion: 1,
    version: "1.0.0",
    author: "Nox",
    description: "粘贴小红书分享链接，变成笔记卡片；他能读正文和评论，还能看到配图",
    permissions: ["chat.read", "network"],
    settings: [
      { key: "sendImages", label: "让他看配图", type: "boolean", default: true },
      { key: "recentNotes", label: "最近几条笔记带图（更早的只给文字）", type: "number", default: 2 },
    ],
  },

  setup(ctx) {
    ctx.ui.injectCSS(CSS);
    ctx.ui.messageKind(KIND, renderCard);

    // sessionId → 等着落库的那张卡片
    const pending = new Map();

    ctx.hooks.transform("user.beforeSend", async (p) => {
      const m = p.text && p.text.match(LINK_RE);
      if (!m) return p;
      const link = m[0];
      const t = ctx.ui.toast("📕 正在读取笔记…", { durationMs: 0 });
      try {
        const note = await fetchNote(link);
        const wantImages = ctx.system.settings.get("sendImages") !== false;
        const urls = note.type === "video" ? note.images.slice(0, 1) : note.images;
        let cover = "";
        const full = [];
        await Promise.all(urls.map(async (u, i) => {
          try {
            const blob = await downloadImage(u);
            if (i === 0) cover = await shrink(blob, 480, 0.72);
            if (wantImages) full[i] = await shrink(blob, 1280, 0.8);
          } catch (e) {
            ctx.system.log("图片 " + (i + 1) + " 没下载下来", String(e));
          }
        }));
        const images = full.filter(Boolean);
        if (images.length) {
          memImages.set(note.id, images);
          await saveImages(note.id, images);
        }
        const content = noteToText(note, note.type === "video" ? 0 : images.length);
        const card = {
          content,
          mediaType: "plugin:" + KIND,
          mediaData: {
            noteId: note.id,
            url: note.url,
            noteType: note.type,
            title: note.title,
            desc: note.desc.slice(0, 160),
            author: note.author,
            likes: note.likes,
            cover,
            imageCount: note.images.length,
            storedImages: images.length,
          },
        };
        const words = ownWords(p.text, link, note);
        if (words) {
          // 她自己还说了话：话照常发，卡片跟在后面
          pending.set(p.sessionId, { card, words, mode: "after" });
          p.text = words;
        } else {
          // 只贴了分享：这条消息本身变成卡片
          pending.set(p.sessionId, { card, words: content, mode: "replace" });
          p.text = content;
        }
      } catch (e) {
        ctx.ui.toast("笔记没读出来，按普通消息发了");
        ctx.system.log("读取失败", link, String(e && e.message || e));
      } finally {
        t.close();
      }
      return p;
    }, { timeoutMs: 90000 });

    ctx.hooks.transform("message.beforePersist", (p) => {
      const msg = p.message;
      if (!msg || msg.role !== "user") return p;
      const job = pending.get(msg.sessionId);
      if (!job || job.mode !== "replace" || msg.content !== job.words) return p;
      pending.delete(msg.sessionId);
      msg.content = job.card.content;
      msg.mediaType = job.card.mediaType;
      msg.mediaData = job.card.mediaData;
      return p;
    });

    ctx.hooks.on("message.persisted", ({ message }) => {
      if (!message || message.role !== "user") return;
      const job = pending.get(message.sessionId);
      if (!job || job.mode !== "after" || message.content !== job.words) return;
      pending.delete(message.sessionId);
      ctx.data.messages.push({ sessionId: message.sessionId, role: "user", ...job.card });
      setTimeout(() => refreshChat(message.sessionId), 0);
    });

    // 请求发出前，把配图塞进带笔记标记的那条消息
    ctx.hooks.transform("llm.request", async (p) => {
      if (ctx.system.settings.get("sendImages") === false || !Array.isArray(p.messages)) return p;
      const keep = Math.max(0, Number(ctx.system.settings.get("recentNotes") ?? 2) || 0);
      if (!keep) return p;
      let used = 0;
      for (let i = p.messages.length - 1; i >= 0 && used < keep; i--) {
        const msg = p.messages[i];
        const text = typeof msg.content === "string"
          ? msg.content
          : (Array.isArray(msg.content) ? msg.content.filter(x => x && x.type === "text").map(x => x.text).join("\n") : "");
        if (!text.includes(MARK)) continue;
        const ids = [...text.matchAll(/\[小红书笔记 #([0-9a-zA-Z]+)\]/g)].map(x => x[1]).reverse();
        const extra = [];
        for (const id of ids) {
          if (used >= keep) break;
          used++;
          const imgs = await loadImages(id, 18);
          for (const url of imgs) extra.push({ type: "image_url", image_url: { url, detail: "auto" } });
        }
        if (!extra.length) continue;
        const parts = typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : msg.content.slice();
        msg.content = parts.concat(extra);
      }
      return p;
    }, { timeoutMs: 20000 });
  },
};
