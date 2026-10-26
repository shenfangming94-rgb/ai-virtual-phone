"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mail, MessageCircle, Phone, Plus, Search, Sparkles, Trash2, Video, X } from "lucide-react";
import { fleshOut, myKakaoId, setMyKakaoId } from "@/lib/idol-kakao";

import { loadCharacters, CHARACTERS_UPDATED_EVENT } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { createOrGetSession, loadChatContacts } from "@/lib/chat-storage";
import {
  FACE_LABEL,
  PEOPLE_UPDATED_EVENT,
  comparePinyin,
  createPerson,
  deletePerson,
  draftPerson,
  emptyProfile,
  fmtDay,
  getProfile,
  initialOf,
  loadLists,
  loadProfiles,
  renameGroup,
  clearGroup,
  reviseCard,
  rollFace,
  saveLists,
  saveProfile,
  type CardDraft,
  type Charm,
  type ContactList,
  type Heart,
  type Relation,
  type SecretKind,
  CHARM_LABEL,
  HEARTS,
  RELATIONS,
  draftFields,
  loadCharm,
  relationOf,
  saveCharm,
  type FaceRelation,
  type IdolProfile,
} from "@/lib/idol-people";
import { ageAtStart, clearTraineeCard, loadTraineeCard, talentLabels } from "@/lib/trainee-card";
import { loadUserIdentities, resolveUserIdentity, saveUserIdentities, USER_IDENTITIES_UPDATED_EVENT } from "@/lib/settings-storage";

type Notice = ((message: string) => void) | undefined;
type View =
  | { name: "list"; filter: Filter }
  | { name: "lists" }
  | { name: "card"; id: string }
  | { name: "edit"; id: string }
  | { name: "me" };
type Filter = { kind: "all" } | { kind: "layer"; layer: "main" | "background" } | { kind: "group"; group: string } | { kind: "list"; id: string } | { kind: "unmet" } | { kind: "kakao" };

const PALETTE = ["#7c8fd6", "#5fb59a", "#e58f6b", "#b088d8", "#e57a9a", "#d9a441", "#5aa7c9", "#8c9a5b"];

function hashColor(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** 从头像算一个主色，名片背景用；算不出来就按名字挑一个 */
function useAvatarColor(src: string | null | undefined, fallbackKey: string): string {
  const [color, setColor] = useState(() => hashColor(fallbackKey));
  useEffect(() => {
    setColor(hashColor(fallbackKey));
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 16;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 16, 16);
        const d = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        setColor(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
      } catch { /* 跨域图片读不了像素就用默认色 */ }
    };
    img.src = src;
  }, [src, fallbackKey]);
  return color;
}

function shrinkImage(file: File, max = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片读不出来")); };
    img.src = url;
  });
}

function Avatar({ name, src, size, className = "" }: { name: string; src?: string | null; size: number; className?: string }) {
  const label = name.length <= 2 && /[一-鿿]/.test(name) ? name : name.slice(0, 1);
  return (
    <span className={`ct-avatar ${className}`} style={{ width: size, height: size, fontSize: size * (label.length > 1 ? 0.3 : 0.4) }}>
      {src ? <img src={src} alt="" /> : <span>{label}</span>}
    </span>
  );
}

function usePeople() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener(PEOPLE_UPDATED_EVENT, bump);
    window.addEventListener(CHARACTERS_UPDATED_EVENT, bump);
    window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, bump);
    return () => {
      window.removeEventListener(PEOPLE_UPDATED_EVENT, bump);
      window.removeEventListener(CHARACTERS_UPDATED_EVENT, bump);
      window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, bump);
    };
  }, []);
  return useMemo(() => {
    const profiles = loadProfiles();
    const chars = loadCharacters();
    const kakao = new Set(loadChatContacts().map(c => c.characterId));
    return { profiles, chars, kakao, lists: loadLists(), tick };
  }, [tick]);
}

/** 通讯录：iOS 26 联系人的样子，爱豆小手机里所有认识的人都在这 */
export function ContactsApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
  const [view, setView] = useState<View>({ name: "list", filter: { kind: "all" } });
  const [stack, setStack] = useState<View[]>([]);
  const [adding, setAdding] = useState(false);
  const data = usePeople();

  const go = (next: View) => { setStack(s => [...s, view]); setView(next); };
  const back = () => {
    if (!stack.length) { onClose(); return; }
    setView(stack[stack.length - 1]);
    setStack(s => s.slice(0, -1));
  };

  return (
    <div className="ct-app">
      {view.name === "list" ? (
        <ListView
          data={data}
          filter={view.filter}
          onBack={back}
          onLists={() => go({ name: "lists" })}
          onOpen={id => go({ name: "card", id })}
          onMe={() => go({ name: "me" })}
          onAdd={() => setAdding(true)}
        />
      ) : null}
      {view.name === "lists" ? <ListsView data={data} onBack={back} onPick={filter => go({ name: "list", filter })} onNotice={onNotice} /> : null}
      {view.name === "card" ? <CardView data={data} id={view.id} onBack={back} onEdit={() => go({ name: "edit", id: view.id })} onNotice={onNotice} /> : null}
      {view.name === "edit" ? <EditView data={data} id={view.id} onDone={back} onDeleted={() => { setStack([]); setView({ name: "list", filter: { kind: "all" } }); }} onNotice={onNotice} /> : null}
      {view.name === "me" ? <MeView onBack={back} onNotice={onNotice} /> : null}
      {adding ? <AddSheet onClose={() => setAdding(false)} onCreated={id => { setAdding(false); go({ name: "card", id }); }} onNotice={onNotice} /> : null}
    </div>
  );
}

type Data = ReturnType<typeof usePeople>;

function filterTitle(f: Filter, lists: ContactList[]): string {
  switch (f.kind) {
    case "all": return "联系人";
    case "layer": return f.layer === "main" ? "主要人物" : "背景人物";
    case "group": return f.group;
    case "list": return lists.find(l => l.id === f.id)?.name ?? "列表";
    case "unmet": return "还没见过的人";
    case "kakao": return "KakaoTalk 已加";
  }
}

function matches(f: Filter, c: Character, p: IdolProfile | undefined, data: Data): boolean {
  switch (f.kind) {
    case "all": return true;
    case "layer": return (p?.layer ?? "main") === f.layer;
    case "group": return (p?.group ?? "") === f.group;
    case "list": return data.lists.find(l => l.id === f.id)?.memberIds.includes(c.id) ?? false;
    case "unmet": return Boolean(p) && !p!.met;
    case "kakao": return data.kakao.has(c.id);
  }
}

function ListView({ data, filter, onBack, onLists, onOpen, onMe, onAdd }: {
  data: Data; filter: Filter; onBack: () => void; onLists: () => void; onOpen: (id: string) => void; onMe: () => void; onAdd: () => void;
}) {
  const [q, setQ] = useState("");
  const pageRef = useRef<HTMLDivElement>(null);
  const me = resolveUserIdentity();
  const people = data.chars
    .filter(c => matches(filter, c, data.profiles[c.id], data))
    .filter(c => !q.trim() || c.name.includes(q.trim())
      || (idVisible(getProfile(c.id), data.kakao.has(c.id)) && (c.wechatID ?? "").toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => comparePinyin(a.name, b.name));
  const sections = new Map<string, Character[]>();
  for (const c of people) {
    const l = initialOf(c.name);
    sections.set(l, [...(sections.get(l) ?? []), c]);
  }
  const letters = [...sections.keys()].sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  const jump = (l: string) => pageRef.current?.querySelector(`[data-letter="${l}"]`)?.scrollIntoView({ block: "start" });

  return (
    <div className="ct-list-wrap">
    <div className="ct-page" ref={pageRef}>
      <div className="ct-top">
        {filter.kind === "all" ? (
          <button type="button" className="ct-glass ct-pill" onClick={onLists}>列表</button>
        ) : (
          <button type="button" className="ct-glass ct-circle" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button>
        )}
        <b className="ct-title">{filterTitle(filter, data.lists)}</b>
        {filter.kind === "all" ? (
          <button type="button" className="ct-glass ct-circle" onClick={onBack} aria-label="关闭"><X size={20} /></button>
        ) : <span style={{ width: 44 }} />}
      </div>
      {filter.kind === "all" && !q ? (
        <button type="button" className="ct-me" onClick={onMe}>
          <Avatar name={me?.name || "我"} src={me?.avatarUrl} size={56} />
          <span>
            <b>{me?.name || "我"}</b>
            <small>我的名片</small>
          </span>
        </button>
      ) : null}
      {letters.map(l => (
        <section key={l}>
          <div className="ct-letter" data-letter={l}>{l}</div>
          {sections.get(l)!.map(c => (
            <button key={c.id} type="button" className="ct-row" onClick={() => onOpen(c.id)}>
              <Avatar name={c.name} src={c.avatar} size={44} />
              <span className="ct-row-name">{c.name}</span>
              {data.profiles[c.id]?.layer === "background" ? <span className="ct-row-tag">背景</span> : null}
            </button>
          ))}
        </section>
      ))}
      {!people.length ? <p className="ct-empty">{q ? "没有找到" : "还没有人。点右下角「+」加一个，或者等剧情里认识。"}</p> : null}
    </div>
      {letters.length > 3 ? (
        <div className="ct-index">
          {letters.map(l => <button key={l} type="button" onClick={() => jump(l)}>{l}</button>)}
        </div>
      ) : null}
      <div className="ct-bottom">
        <label className="ct-glass ct-search">
          <Search size={18} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索名字、KakaoTalk ID" />
        </label>
        <button type="button" className="ct-glass ct-circle ct-plus" onClick={onAdd} aria-label="添加"><Plus size={24} /></button>
      </div>
    </div>
  );
}

function ListsView({ data, onBack, onPick, onNotice }: { data: Data; onBack: () => void; onPick: (f: Filter) => void; onNotice: Notice }) {
  const [editing, setEditing] = useState(false);
  const [naming, setNaming] = useState<null | { kind: "newList" } | { kind: "list"; id: string; name: string } | { kind: "group"; from: string; name: string }>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const profiles = Object.values(data.profiles).filter(p => data.chars.some(c => c.id === p.charId));
  const groups = [...new Set(profiles.map(p => p.group).filter(Boolean))].sort(comparePinyin);
  const count = (fn: (p: IdolProfile) => boolean) => profiles.filter(fn).length;
  const Row = ({ label, n, onClick, onRename, onDelete }: { label: string; n: number; onClick: () => void; onRename?: () => void; onDelete?: () => void }) => (
    <div className="ct-cell">
      <button type="button" className="ct-cell-main" onClick={editing && onRename ? onRename : onClick}>
        <span>{label}</span>
        <small>{n}{editing && onRename ? " · 改名" : ""} <ChevronRight size={16} /></small>
      </button>
      {editing && onDelete ? <button type="button" className="ct-cell-del" onClick={onDelete} aria-label="删除"><Trash2 size={18} /></button> : null}
    </div>
  );

  const saveName = () => {
    if (!naming) return;
    const name = naming.kind === "newList" ? (document.getElementById("ct-name-input") as HTMLInputElement)?.value.trim() : naming.name.trim();
    if (!name) { setNaming(null); return; }
    if (naming.kind === "newList") saveLists([...data.lists, { id: `list_${Date.now()}`, name, memberIds: [] }]);
    if (naming.kind === "list") saveLists(data.lists.map(l => l.id === naming.id ? { ...l, name } : l));
    if (naming.kind === "group") renameGroup(naming.from, name);
    setNaming(null);
  };

  if (managing) {
    const list = data.lists.find(l => l.id === managing);
    if (!list) { setManaging(null); return null; }
    const toggle = (id: string) => saveLists(data.lists.map(l => l.id === managing
      ? { ...l, memberIds: l.memberIds.includes(id) ? l.memberIds.filter(x => x !== id) : [...l.memberIds, id] }
      : l));
    return (
      <div className="ct-page">
        <div className="ct-top">
          <button type="button" className="ct-glass ct-circle" onClick={() => setManaging(null)} aria-label="返回"><ChevronLeft size={22} /></button>
          <b className="ct-title">{list.name}</b>
          <span style={{ width: 44 }} />
        </div>
        <p className="ct-hint">点一下把人放进或拿出这个列表</p>
        <div className="ct-group">
          {[...data.chars].sort((a, b) => comparePinyin(a.name, b.name)).map(c => (
            <button key={c.id} type="button" className="ct-row" onClick={() => toggle(c.id)}>
              <Avatar name={c.name} src={c.avatar} size={36} />
              <span className="ct-row-name">{c.name}</span>
              <span className={`ct-check ${list.memberIds.includes(c.id) ? "on" : ""}`} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ct-page">
      <div className="ct-top">
        <button type="button" className="ct-glass ct-circle" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button>
        <b className="ct-title">列表</b>
        <button type="button" className="ct-glass ct-pill" onClick={() => setEditing(v => !v)}>{editing ? "完成" : "编辑"}</button>
      </div>
      <div className="ct-group">
        <Row label="所有联系人" n={profiles.length || data.chars.length} onClick={() => onPick({ kind: "all" })} />
        <Row label="主要人物" n={count(p => p.layer === "main")} onClick={() => onPick({ kind: "layer", layer: "main" })} />
        <Row label="背景人物" n={count(p => p.layer === "background")} onClick={() => onPick({ kind: "layer", layer: "background" })} />
      </div>
      {groups.length ? (
        <>
          <div className="ct-section-title">按身份</div>
          <div className="ct-group">
            {groups.map(g => (
              <Row
                key={g}
                label={g}
                n={count(p => p.group === g)}
                onClick={() => onPick({ kind: "group", group: g })}
                onRename={() => setNaming({ kind: "group", from: g, name: g })}
                onDelete={() => { clearGroup(g); onNotice?.(`「${g}」这个分组删掉了，人还在`); }}
              />
            ))}
          </div>
        </>
      ) : null}
      <div className="ct-section-title">我的列表</div>
      <div className="ct-group">
        {data.lists.map(l => (
          <Row
            key={l.id}
            label={l.name}
            n={l.memberIds.length}
            onClick={() => (editing ? setManaging(l.id) : onPick({ kind: "list", id: l.id }))}
            onRename={() => setNaming({ kind: "list", id: l.id, name: l.name })}
            onDelete={() => saveLists(data.lists.filter(x => x.id !== l.id))}
          />
        ))}
        <button type="button" className="ct-cell-main ct-add-list" onClick={() => setNaming({ kind: "newList" })}><Plus size={18} /> 新建列表</button>
      </div>
      {editing ? <p className="ct-hint">编辑时：点名字改名，点自己的列表能往里放人</p> : null}
      <div className="ct-section-title">其他</div>
      <div className="ct-group">
        <Row label="还没见过的人" n={count(p => !p.met)} onClick={() => onPick({ kind: "unmet" })} />
        <Row label="KakaoTalk 已加" n={data.chars.filter(c => data.kakao.has(c.id)).length} onClick={() => onPick({ kind: "kakao" })} />
      </div>
      {naming ? (
        <div className="ct-dialog-back" onClick={() => setNaming(null)}>
          <div className="ct-dialog" onClick={e => e.stopPropagation()}>
            <b>{naming.kind === "newList" ? "新建列表" : "改名"}</b>
            <input
              id="ct-name-input"
              autoFocus
              defaultValue={naming.kind === "newList" ? "" : naming.name}
              onChange={e => { if (naming.kind !== "newList") setNaming({ ...naming, name: e.target.value }); }}
              placeholder="名字"
            />
            <div className="ct-dialog-btns">
              <button type="button" onClick={() => setNaming(null)}>取消</button>
              <button type="button" className="is-strong" onClick={saveName}>好</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 背景人物没给过 ID 时，名片和搜索都看不到他的 ID */
function idVisible(p: ReturnType<typeof getProfile>, added: boolean): boolean {
  return added || Boolean(p.gaveId) || p.layer === "main";
}

function CardView({ data, id, onBack, onEdit, onNotice }: { data: Data; id: string; onBack: () => void; onEdit: () => void; onNotice: Notice }) {
  const char = data.chars.find(c => c.id === id);
  const p = getProfile(id);
  const color = useAvatarColor(char?.avatar, char?.name ?? id);
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState(false);
  if (!char) return <div className="ct-page"><p className="ct-empty">这个人不在了</p></div>;
  const added = data.kakao.has(id);
  const idKnown = idVisible(p, added);

  const openChat = (call?: "voice" | "video") => {
    if (!added) {
      onNotice?.(idKnown ? `还没加 KakaoTalk。去 KakaoTalk 右上角「+」搜他的 ID：${char.wechatID ?? ""}` : "还没加 KakaoTalk，他也还没把 ID 给你");
      return;
    }
    const session = createOrGetSession(id);
    window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "chat", sessionId: session.id } }));
    if (call) {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("ai-call-trigger", { detail: { sessionId: session.id, type: call } })), 600);
    }
  };

  const revise = async () => {
    if (!direction.trim()) return;
    setBusy(true);
    try {
      const d = await reviseCard(p, char.name, direction);
      saveProfile({ ...p, ...draftToProfilePatch(d, p.secret) });
      setDirection("");
      onNotice?.("改好了");
    } catch (e) {
      onNotice?.(e instanceof Error ? e.message : "没改成");
    } finally {
      setBusy(false);
    }
  };

  const flesh = async () => {
    setBusy(true);
    try {
      await fleshOut(id);
      onNotice?.("补好了，不满意可以在下面照方向改");
    } catch (e) {
      onNotice?.(e instanceof Error ? e.message : "没补成");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-card" style={{ "--ct-tint": color } as React.CSSProperties}>
      <div className="ct-card-bg" />
      <div className="ct-page ct-card-page">
        <div className="ct-top">
          <button type="button" className="ct-glass-dark ct-circle" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button>
          <span />
          <button type="button" className="ct-glass-dark ct-pill" onClick={onEdit}>编辑</button>
        </div>
        <div className="ct-hero">
          <Avatar name={char.name} src={char.avatar} size={168} className="ct-hero-avatar" />
          <h1>{char.name}</h1>
          <p>{[p.role, p.age ? `${p.age} 岁` : "", p.mbti].filter(Boolean).join(" · ") || "还没写身份"}</p>
        </div>
        <div className="ct-actions">
          <button type="button" className="ct-glass-dark" onClick={() => openChat()}><MessageCircle size={22} /><span>Kakao</span></button>
          <button type="button" className="ct-glass-dark" onClick={() => openChat("voice")}><Phone size={22} /><span>电话</span></button>
          <button type="button" className="ct-glass-dark" onClick={() => openChat("video")}><Video size={22} /><span>视频</span></button>
          <button type="button" className="ct-glass-dark is-off" onClick={() => onNotice?.("邮件以后接邮箱 app")}><Mail size={22} /><span>邮件</span></button>
        </div>

        <div className="ct-block">
          <div className="ct-k"><span>KakaoTalk ID</span><span className={`ct-kakao ${added ? "on" : ""}`}>{added ? "已加" : "还没加"}</span></div>
          <div className="ct-v">{idKnown ? (char.wechatID || "—") : "他还没给你"}</div>
          <hr />
          <div className="ct-k">认识</div>
          <div className="ct-v">{p.met ? (p.metAt ? `${fmtDay(p.metAt.at)}${p.metAt.place ? ` · ${p.metAt.place}` : ""}` : "见过") : "还没见过"}</div>
          <hr />
          <div className="ct-k">关系</div>
          <div className="ct-v">{relationOf(p)}</div>
          {p.birthday ? <><hr /><div className="ct-k">生日</div><div className="ct-v">{p.birthday.split("-").map(x => String(parseInt(x, 10) || x)).join("月")}日</div></> : null}
        </div>

        {p.secret?.revealed && p.secret.text ? (
          <div className="ct-block">
            <div className="ct-k">你知道的秘密</div>
            <div className="ct-v">{p.secret.text}</div>
            <div className="ct-v is-dim">{fmtDay(p.secret.revealed.at)}{p.secret.revealed.how ? ` · ${p.secret.revealed.how}` : ""}</div>
          </div>
        ) : null}

        {p.isIdol && (p.publicLabels.length || p.publicText) ? (
          <div className="ct-block">
            <div className="ct-k">公开人设</div>
            {p.publicLabels.length ? <div className="ct-chips">{p.publicLabels.map(l => <span key={l}>{l}</span>)}</div> : null}
            {p.publicText ? <div className="ct-v">{p.publicText}</div> : null}
          </div>
        ) : null}

        {!p.privateLines.length ? (
          <div className="ct-block">
            <div className="ct-k">平时</div>
            <div className="ct-v is-dim">戏里见过，还只知道名字</div>
            <button type="button" className="ct-wide-dark" disabled={busy} onClick={() => void flesh()}>
              <Sparkles size={16} /> {busy ? "在想…" : "照模板补全"}
            </button>
          </div>
        ) : null}

        {p.privateLines.length ? (
          <div className="ct-block">
            <div className="ct-k"><span>{p.isIdol ? "私下" : "平时"}</span>{p.isIdol ? <span className="ct-chips"><span>{FACE_LABEL[p.face]}</span></span> : null}</div>
            <ul className="ct-v">{p.privateLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        ) : null}

        {p.speech || p.taboo ? (
          <div className="ct-block">
            {p.speech ? <><div className="ct-k">说话</div><div className="ct-v">{p.speech}</div></> : null}
            {p.speech && p.taboo ? <hr /> : null}
            {p.taboo ? <><div className="ct-k">雷区</div><div className="ct-v">{p.taboo}</div></> : null}
          </div>
        ) : null}

        <div className="ct-block">
          <div className="ct-k">跟你</div>
          <div className={`ct-v ${p.withYou ? "" : "is-dim"}`}>{p.withYou || (p.met ? "还没写" : "还没见过，见了才知道")}</div>
        </div>

        <div className="ct-block">
          <div className="ct-k">你们的事</div>
          {p.events.length ? [...p.events].sort((a, b) => b.at - a.at).map(e => (
            <div key={e.id} className="ct-event"><b>{fmtDay(e.at)}{e.place ? ` · ${e.place}` : ""}</b>{e.text}</div>
          )) : <div className="ct-v is-dim">还没有</div>}
        </div>

        <div className="ct-block">
          <div className="ct-k">备注</div>
          <div className={`ct-v ${p.note ? "" : "is-dim"}`}>{p.note || "你自己写的，只有你看得到"}</div>
        </div>

        <div className="ct-block">
          {peek ? (
            <>
              <div className="ct-k">偷看</div>
              <div className="ct-v">{p.secret && p.secret.kind !== "none" && p.secret.text && !p.secret.revealed ? `秘密：${p.secret.text}` : "他没什么瞒着你的"}</div>
              {p.canCrush && p.heart ? <div className="ct-v">他对你：{p.heart}</div> : null}
              <button type="button" className="ct-wide-dark" onClick={() => setPeek(false)}>收起来</button>
            </>
          ) : (
            <button type="button" className="ct-wide-dark" onClick={() => setPeek(true)}>🤫 偷看秘密</button>
          )}
        </div>

        <div className="ct-block">
          <div className="ct-k">照方向改</div>
          <textarea className="ct-input-dark" rows={2} value={direction} onChange={e => setDirection(e.target.value)} placeholder="写一句，比如「再酷一点，话少一点」" />
          <button type="button" className="ct-wide-dark" disabled={busy || !direction.trim()} onClick={() => void revise()}>
            <Sparkles size={16} /> {busy ? "在改…" : "让 AI 改"}
          </button>
        </div>
        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}

function draftToProfilePatch(d: CardDraft & { secretKind?: SecretKind }, prev?: IdolProfile["secret"]): Partial<IdolProfile> {
  return draftFields(d, prev);
}

function EditView({ data, id, onDone, onDeleted, onNotice }: { data: Data; id: string; onDone: () => void; onDeleted: () => void; onNotice: Notice }) {
  const char = data.chars.find(c => c.id === id);
  const [p, setP] = useState<IdolProfile>(() => getProfile(id));
  const [name, setName] = useState(char?.name ?? "");
  const [avatar, setAvatar] = useState<string | null>(char?.avatar ?? null);
  const [wid, setWid] = useState(char?.wechatID ?? "");
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!char) return null;
  const set = <K extends keyof IdolProfile>(k: K, v: IdolProfile[K]) => setP(prev => ({ ...prev, [k]: v }));
  const lines = (s: string) => s.split("\n").map(x => x.trim()).filter(Boolean);
  const save = () => {
    saveProfile(p, { name: name.trim() || char.name, avatar, wechatID: wid.trim() || char.wechatID });
    onNotice?.("存好了");
    onDone();
  };
  const groups = [...new Set(Object.values(data.profiles).map(x => x.group).filter(Boolean))];

  return (
    <div className="ct-page ct-edit">
      <div className="ct-top">
        <button type="button" className="ct-glass ct-pill" onClick={onDone}>取消</button>
        <b className="ct-title">编辑</b>
        <button type="button" className="ct-glass ct-pill is-strong" onClick={save}>完成</button>
      </div>
      <div className="ct-edit-avatar">
        <Avatar name={name || "?"} src={avatar} size={110} />
        <button type="button" onClick={() => fileRef.current?.click()}>{avatar ? "换头像" : "加头像"}</button>
        {avatar ? <button type="button" onClick={() => setAvatar(null)}>去掉头像</button> : null}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try { setAvatar(await shrinkImage(f)); } catch { onNotice?.("图片读不出来"); }
        }} />
      </div>
      <div className="ct-form">
        <Field label="名字"><input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="KakaoTalk ID"><input value={wid} onChange={e => setWid(e.target.value)} /></Field>
        <Field label="身份"><input value={p.role} onChange={e => set("role", e.target.value)} placeholder="比如：VANTA 主唱 · 同公司前辈" /></Field>
        <Field label="性别">
          <div className="ct-seg">
            <button type="button" className={p.gender === "男" ? "on" : ""} onClick={() => set("gender", "男")}>男</button>
            <button type="button" className={p.gender === "女" ? "on" : ""} onClick={() => set("gender", "女")}>女</button>
          </div>
        </Field>
        <Field label="年龄"><input value={p.age} onChange={e => set("age", e.target.value)} /></Field>
        <Field label="生日"><input value={p.birthday ?? ""} onChange={e => set("birthday", e.target.value)} placeholder="月-日，比如 04-12" /></Field>
        <Field label="MBTI"><input value={p.mbti ?? ""} onChange={e => set("mbti", e.target.value.toUpperCase())} placeholder="只是参考" /></Field>
        <Field label="分组">
          <input value={p.group} list="ct-groups" onChange={e => set("group", e.target.value)} placeholder="公司 / 同期练习生 / 家和老朋友…" />
          <datalist id="ct-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        </Field>
        <Field label="主要 / 背景">
          <div className="ct-seg">
            <button type="button" className={p.layer === "main" ? "on" : ""} onClick={() => set("layer", "main")}>主要人物</button>
            <button type="button" className={p.layer === "background" ? "on" : ""} onClick={() => set("layer", "background")}>背景人物</button>
          </div>
        </Field>
        <Field label="是爱豆吗">
          <div className="ct-seg">
            <button type="button" className={p.isIdol ? "on" : ""} onClick={() => set("isIdol", true)}>是</button>
            <button type="button" className={!p.isIdol ? "on" : ""} onClick={() => set("isIdol", false)}>不是</button>
          </div>
        </Field>
        {p.isIdol ? (
          <>
            <Field label="人设标签"><input value={p.publicLabels.join("、")} onChange={e => set("publicLabels", e.target.value.split(/[、,，\s]+/).filter(Boolean))} placeholder="用顿号隔开" /></Field>
            <Field label="粉丝眼里的他"><textarea rows={3} value={p.publicText} onChange={e => set("publicText", e.target.value)} /></Field>
            <Field label="私下跟人设">
              <div className="ct-seg">
                {(Object.keys(FACE_LABEL) as FaceRelation[]).map(f => (
                  <button key={f} type="button" className={p.face === f ? "on" : ""} onClick={() => set("face", f)}>{FACE_LABEL[f]}</button>
                ))}
              </div>
            </Field>
          </>
        ) : null}
        <Field label={p.isIdol ? "私下（一行一句）" : "平时（一行一句）"}><textarea rows={5} value={p.privateLines.join("\n")} onChange={e => set("privateLines", lines(e.target.value))} /></Field>
        <Field label="说话"><textarea rows={2} value={p.speech} onChange={e => set("speech", e.target.value)} /></Field>
        <Field label="雷区"><textarea rows={2} value={p.taboo} onChange={e => set("taboo", e.target.value)} placeholder="可以不写" /></Field>
        <Field label="见过了吗">
          <div className="ct-seg">
            <button type="button" className={p.met ? "on" : ""} onClick={() => set("met", true)}>见过</button>
            <button type="button" className={!p.met ? "on" : ""} onClick={() => set("met", false)}>还没见过</button>
          </div>
        </Field>
        {p.met ? (
          <>
            <Field label="在哪认识"><input value={p.metAt?.place ?? ""} onChange={e => set("metAt", { at: p.metAt?.at ?? Date.now(), place: e.target.value })} /></Field>
            <Field label="跟你（他对你的印象）"><textarea rows={3} value={p.withYou} onChange={e => set("withYou", e.target.value)} /></Field>
          </>
        ) : null}
        {p.events.length ? (
          <Field label="你们的事">
            {p.events.map(ev => (
              <div key={ev.id} className="ct-edit-event">
                <span><b>{fmtDay(ev.at)}</b>{ev.text}</span>
                <button type="button" onClick={() => set("events", p.events.filter(x => x.id !== ev.id))} aria-label="删除"><Trash2 size={16} /></button>
              </div>
            ))}
          </Field>
        ) : null}
        <Field label="关系">
          <select className="ct-select" value={relationOf(p)} onChange={e => set("relation", e.target.value as Relation)}>
            {[...RELATIONS, "前任"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="心动">
          <select className="ct-select" value={p.canCrush && p.heart ? p.heart : ""} onChange={e => { const v = e.target.value as Heart | ""; setP(prev => ({ ...prev, canCrush: Boolean(v), heart: v || undefined, rolled: true })); }}>
            <option value="">没有心动线</option>
            {HEARTS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
        <Field label="秘密（她不知道的）">
          <textarea rows={2} value={p.secret?.text ?? ""} onChange={e => set("secret", { kind: e.target.value.trim() ? (p.secret?.kind === "heavy" ? "heavy" : "light") : "none", text: e.target.value, ...(p.secret?.revealed ? { revealed: p.secret.revealed } : {}) })} placeholder="没有就空着" />
          {p.secret?.text ? (
            <div className="ct-seg" style={{ marginTop: 8 }}>
              <button type="button" className={!p.secret.revealed ? "on" : ""} onClick={() => set("secret", { ...p.secret!, revealed: undefined })}>她还不知道</button>
              <button type="button" className={p.secret.revealed ? "on" : ""} onClick={() => set("secret", { ...p.secret!, revealed: p.secret!.revealed ?? { at: Date.now(), how: "" } })}>她知道了</button>
            </div>
          ) : null}
        </Field>
        <Field label="备注（只有你看得到）"><textarea rows={3} value={p.note} onChange={e => set("note", e.target.value)} /></Field>
      </div>
      <button type="button" className="ct-danger" onClick={() => setConfirmDel(true)}>删除这个人</button>
      {confirmDel ? (
        <div className="ct-dialog-back" onClick={() => setConfirmDel(false)}>
          <div className="ct-dialog" onClick={e => e.stopPropagation()}>
            <b>删除 {char.name}？</b>
            <p>这个人会从这个世界消失，聊天里也找不到了。</p>
            <div className="ct-dialog-btns">
              <button type="button" onClick={() => setConfirmDel(false)}>取消</button>
              <button type="button" className="is-danger" onClick={() => { deletePerson(id); onNotice?.(`${char.name} 删掉了`); onDeleted(); }}>删除</button>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ height: 60 }} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ct-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function MeView({ onBack, onNotice }: { onBack: () => void; onNotice: Notice }) {
  const me = resolveUserIdentity();
  const [name, setName] = useState(me?.name ?? "");
  const [avatar, setAvatar] = useState<string | undefined>(me?.avatarUrl);
  const [bio, setBio] = useState(me?.bio ?? "");
  const [kakaoId, setKakaoId] = useState(() => myKakaoId());
  const [charm, setCharmState] = useState<Charm>(() => loadCharm());
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const color = useAvatarColor(avatar, name || "me");

  const save = () => {
    const all = loadUserIdentities();
    if (me) {
      saveUserIdentities(all.map(i => i.id === me.id ? { ...i, name: name.trim() || i.name, avatarUrl: avatar, bio } : i));
    } else {
      saveUserIdentities([{ id: `identity-${Date.now()}`, name: name.trim() || "我", avatarUrl: avatar, bio, gender: "女", age: "", occupation: "", customSettings: "" }]);
    }
    setMyKakaoId(kakaoId);
    setKakaoId(myKakaoId());
    setEditing(false);
    onNotice?.("存好了");
  };

  return (
    <div className="ct-card" style={{ "--ct-tint": color } as React.CSSProperties}>
      <div className="ct-card-bg" />
      <div className="ct-page ct-card-page">
        <div className="ct-top">
          <button type="button" className="ct-glass-dark ct-circle" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button>
          <span />
          <button type="button" className="ct-glass-dark ct-pill" onClick={() => (editing ? save() : setEditing(true))}>{editing ? "完成" : "编辑"}</button>
        </div>
        <div className="ct-hero">
          <button type="button" className="ct-hero-btn" disabled={!editing} onClick={() => fileRef.current?.click()}>
            <Avatar name={name || "我"} src={avatar} size={168} className="ct-hero-avatar" />
            {editing ? <span className="ct-hero-change">换头像</span> : null}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try { setAvatar(await shrinkImage(f)); } catch { onNotice?.("图片读不出来"); }
          }} />
          {editing ? <input className="ct-hero-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="名字" /> : <h1>{name || "我"}</h1>}
          <p>我的名片</p>
        </div>
        <div className="ct-block">
          <div className="ct-k">KakaoTalk ID</div>
          {editing ? (
            <input className="ct-input-dark" value={kakaoId} onChange={e => setKakaoId(e.target.value.replace(/\s/g, ""))} placeholder="英文和数字" autoCapitalize="none" />
          ) : (
            <div className="ct-v">{kakaoId}</div>
          )}
        </div>
        <div className="ct-block">
          <div className="ct-k">人缘</div>
          <div className="ct-seg ct-seg-dark">
            {(Object.keys(CHARM_LABEL) as Charm[]).map(c => (
              <button key={c} type="button" className={charm === c ? "on" : ""} onClick={() => { saveCharm(c); setCharmState(c); }}>{CHARM_LABEL[c]}</button>
            ))}
          </div>
          <div className="ct-v is-dim" style={{ fontSize: 13, marginTop: 6 }}>新认识的人一开始对你有没有好感。只影响之后新出现的人</div>
        </div>
        <div className="ct-block">
          <div className="ct-k">关于我</div>
          {editing ? (
            <textarea className="ct-input-dark" rows={5} value={bio} onChange={e => setBio(e.target.value)} placeholder="写点关于你自己的" />
          ) : (
            <div className={`ct-v ${bio ? "" : "is-dim"}`} style={{ whiteSpace: "pre-wrap" }}>{bio || "还没写"}</div>
          )}
        </div>
        <TraineeCardBlock />
      </div>
    </div>
  );
}

function AddSheet({ onClose, onCreated, onNotice }: { onClose: () => void; onCreated: (id: string) => void; onNotice: Notice }) {
  const [wish, setWish] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<(CardDraft & { secretKind?: SecretKind }) | null>(null);
  const [face, setFace] = useState<FaceRelation>(rollFace);
  const [direction, setDirection] = useState("");

  const roll = async (w: string, f: FaceRelation) => {
    setBusy(true);
    try {
      setDraft(await draftPerson(w, f));
    } catch (e) {
      onNotice?.(e instanceof Error ? e.message : "没捏出来");
    } finally {
      setBusy(false);
    }
  };
  const again = () => { const f = rollFace(); setFace(f); void roll(wish, f); };
  const reviseDraft = async () => {
    if (!draft || !direction.trim()) return;
    setBusy(true);
    try {
      const p = { ...emptyProfile("draft"), ...draftToProfilePatch(draft), face };
      setDraft({ ...(await reviseCard(p, draft.name, direction)), secretKind: draft.secretKind });
      setDirection("");
    } catch (e) {
      onNotice?.(e instanceof Error ? e.message : "没改成");
    } finally {
      setBusy(false);
    }
  };
  const accept = (d: CardDraft & { secretKind?: SecretKind }) => {
    const char = createPerson(d.name, { ...emptyProfile(""), ...draftToProfilePatch(d), face });
    onNotice?.(`${d.name} 进通讯录了`);
    onCreated(char.id);
  };
  const blank = () => {
    const char = createPerson("新联系人", emptyProfile(""));
    onCreated(char.id);
  };

  return (
    <div className="ct-sheet-back" onClick={busy ? undefined : onClose}>
      <div className="ct-sheet" onClick={e => e.stopPropagation()}>
        <div className="ct-grab" />
        {!draft ? (
          <>
            <b className="ct-sheet-title">加一个人</b>
            <textarea className="ct-sheet-input" rows={3} value={wish} onChange={e => setWish(e.target.value)} placeholder="想要什么样的人？比如「同公司一个话很多的男练习生」。不写就让 AI 自己想" />
            <button type="button" className="ct-primary" disabled={busy} onClick={() => void roll(wish, face)}>{busy ? "在捏…" : "让 AI 捏一个"}</button>
            <button type="button" className="ct-secondary" disabled={busy} onClick={blank}>自己从头写</button>
          </>
        ) : (
          <>
            <div className="ct-sheet-sub">有人要出场了</div>
            <div className="ct-sheet-hero">
              <Avatar name={draft.name} size={64} />
              <b>{draft.name}</b>
              <small>{[draft.role, draft.age ? `${draft.age} 岁` : ""].filter(Boolean).join(" · ")}</small>
            </div>
            <div className="ct-sheet-scroll">
              {draft.isIdol && (draft.publicLabels.length || draft.publicText) ? (
                <div className="ct-white"><div className="ct-k">公开人设</div>{draft.publicLabels.length ? <div className="ct-chips is-light">{draft.publicLabels.map(l => <span key={l}>{l}</span>)}</div> : null}<div className="ct-v">{draft.publicText}</div></div>
              ) : null}
              {draft.privateLines.length ? (
                <div className="ct-white">
                  <div className="ct-k"><span>{draft.isIdol ? "私下" : "平时"}</span>{draft.isIdol ? <span className="ct-chips is-light"><span>{FACE_LABEL[face]}</span></span> : null}</div>
                  <ul className="ct-v">{draft.privateLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>
              ) : null}
              {draft.speech ? <div className="ct-white"><div className="ct-k">说话</div><div className="ct-v">{draft.speech}</div></div> : null}
              {draft.taboo ? <div className="ct-white"><div className="ct-k">雷区</div><div className="ct-v">{draft.taboo}</div></div> : null}
            </div>
            <input className="ct-sheet-input" value={direction} onChange={e => setDirection(e.target.value)} placeholder="照这个方向改：比如「再酷一点」" onKeyDown={e => { if (e.key === "Enter") void reviseDraft(); }} />
            <div className="ct-sheet-btns">
              <button type="button" className="ct-secondary" disabled={busy} onClick={again}>换一个</button>
              <button type="button" className="ct-secondary" disabled={busy || !direction.trim()} onClick={() => void reviseDraft()}>照方向改</button>
            </div>
            <button type="button" className="ct-primary" disabled={busy} onClick={() => accept(draft)}>{busy ? "在改…" : "就这个人"}</button>
          </>
        )}
      </div>
    </div>
  );
}

function TraineeCardBlock() {
  const c = loadTraineeCard();
  const [confirm, setConfirm] = useState(false);
  if (!c) return null;
  const age = ageAtStart(c);
  return (
    <div className="ct-block">
      <div className="ct-k">练习生证</div>
      <div className="op-id ct-mini-id">
        <div className="op-id-top"><img src="/idol/crest.png" alt="" /><b>TRAINEE ID CARD</b><s>练习生证</s></div>
        <div className="op-id-in">
          <div className="op-id-pic">{c.photo ? <img src={c.photo} alt="" /> : <span>{c.name.slice(0, 1)}</span>}</div>
          <div className="op-id-kv">
            <div><em>姓名</em>{c.name}</div>
            <div><em>生日</em>{c.birthday.replace(/-/g, ".")}{age != null ? `（${age}岁）` : ""}</div>
            <div><em>国籍</em>{c.nationality || "—"}</div>
            <div><em>特长</em>{talentLabels(c.talents).join(" · ") || "—"}</div>
            <div><em>所属</em>{c.company || <span className="op-dim">— 还没有 —</span>}</div>
          </div>
        </div>
        <div className="op-id-no">No. {c.no}</div>
        {c.signature ? <img src={c.signature} alt="" className="ct-mini-sign" /> : null}
      </div>
      {confirm ? (
        <div className="ct-reopen">
          <span>重新填会回到开局页，聊天和别的东西都不动。</span>
          <button type="button" onClick={() => setConfirm(false)}>算了</button>
          <button type="button" className="is-strong" onClick={() => clearTraineeCard()}>重新填</button>
        </div>
      ) : (
        <button type="button" className="ct-wide-dark" onClick={() => setConfirm(true)}>重新填写练习生证</button>
      )}
    </div>
  );
}
