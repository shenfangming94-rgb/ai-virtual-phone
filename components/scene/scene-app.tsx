"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Plus, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";

import { loadCharacters } from "@/lib/character-storage";
import { comparePinyin, draftPerson, getProfile, loadProfiles, rollFace, saveProfile } from "@/lib/idol-people";
import {
  SCENES_EVENT,
  addNewFaces,
  closeScene,
  continueScene,

  fmtWorld,
  getScene,
  line,
  loadScenes,
  newScene,
  runTimeCommand,
  saveScene,
  type Scene,
} from "@/lib/idol-scenes";
import { setWorldTime, shiftWorldTime } from "@/lib/world-clock";

type Notice = ((message: string) => void) | undefined;

function useScenes() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener(SCENES_EVENT, bump);
    return () => window.removeEventListener(SCENES_EVENT, bump);
  }, []);
  return { scenes: loadScenes(), tick };
}

/** 剧情：以她为主角的一场场戏 */
export function SceneApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { scenes } = useScenes();

  if (openId) return <SceneView id={openId} onBack={() => setOpenId(null)} onNotice={onNotice} />;

  return (
    <div className="sc-app">
      <div className="sc-top">
        <button type="button" className="sc-icon-btn" onClick={onClose} aria-label="返回"><ChevronLeft size={22} /></button>
        <b>剧情</b>
        <button type="button" className="sc-icon-btn" onClick={() => setCreating(true)} aria-label="开一场戏"><Plus size={22} /></button>
      </div>
      <div className="sc-list">
        {scenes.length ? scenes.map(s => {
          const names = s.peopleIds.map(id => loadCharacters().find(c => c.id === id)?.name).filter(Boolean);
          return (
            <button key={s.id} type="button" className="sc-card" onClick={() => setOpenId(s.id)}>
              <div className="sc-card-meta">{fmtWorld(s.startAt)}{s.ended ? " · 已结束" : " · 进行中"}</div>
              <div className="sc-card-title">{s.place}</div>
              <div className="sc-card-sub">{s.summary || (names.length ? `在场：${names.join("、")}` : "只有你")}</div>
            </button>
          );
        }) : <p className="sc-empty">还没有戏。点右上角「+」开第一场。</p>}
      </div>
      {creating ? <NewSceneSheet onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenId(id); }} /> : null}
    </div>
  );
}

function NewSceneSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [place, setPlace] = useState("");
  const [premise, setPremise] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const profiles = loadProfiles();
  const people = loadCharacters().filter(c => profiles[c.id]).sort((a, b) => comparePinyin(a.name, b.name));
  return (
    <div className="sc-sheet-back" onClick={onClose}>
      <div className="sc-sheet" onClick={e => e.stopPropagation()}>
        <div className="sc-sheet-head"><b>开一场戏</b><button type="button" className="sc-icon-btn" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
        <div className="sc-sheet-meta">现在是 {fmtWorld(Date.now())}</div>
        <label className="sc-field"><span>地点</span><input value={place} onChange={e => setPlace(e.target.value)} placeholder="比如：公司地下二层练习室" /></label>
        <label className="sc-field"><span>开头（可以不写）</span><textarea rows={2} value={premise} onChange={e => setPremise(e.target.value)} placeholder="比如：月考前一晚，大家都在加练" /></label>
        <div className="sc-field"><span>在场的人（可以不选，戏里再进来）</span>
          <div className="sc-pick">
            {people.length ? people.map(c => {
              const on = picked.includes(c.id);
              return <button key={c.id} type="button" className={on ? "on" : ""} onClick={() => setPicked(on ? picked.filter(x => x !== c.id) : [...picked, c.id])}>{c.name}</button>;
            }) : <small>通讯录里还没有人</small>}
          </div>
        </div>
        <button type="button" className="sc-primary" onClick={() => onCreated(newScene(place, premise, picked).id)}>开始</button>
      </div>
    </div>
  );
}

function SceneView({ id, onBack, onNotice }: { id: string; onBack: () => void; onNotice: Notice }) {
  const { tick } = useScenes();
  const scene = getScene(id);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [closingHint, setClosingHint] = useState(false);
  const [ending, setEnding] = useState<null | "ask" | "working" | { summary: string }>(null);
  const [face, setFace] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [tick, busy]);

  const run = async (s: Scene) => {
    setBusy(true);
    try {
      const r = await continueScene(s);
      const fresh = getScene(s.id) ?? s;
      const added = addNewFaces(fresh, r.newFaces, r.text);
      if (r.minutes > 0) shiftWorldTime(r.minutes * 60e3);
      fresh.lines = [...fresh.lines, line("story", r.text)];
      saveScene(fresh);
      if (added.length) onNotice?.(`新面孔：${added.join("、")}`);
      setClosingHint(r.closing);
    } catch (e) {
      onNotice?.(e instanceof Error ? e.message : "AI 没回");
    } finally {
      setBusy(false);
    }
  };

  // 新开的戏自动写开场
  useEffect(() => {
    if (!scene || started.current) return;
    started.current = true;
    if (!scene.lines.length && !scene.ended) void run(scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!scene) return null;
  const chars = loadCharacters();
  const present = scene.peopleIds.map(pid => chars.find(c => c.id === pid)).filter((c): c is NonNullable<typeof c> => Boolean(c));

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setClosingHint(false);
    if (text.startsWith("$")) {
      const done = runTimeCommand(text);
      if (done) {
        saveScene({ ...scene, lines: [...scene.lines, line("sys", done)] });
        onNotice?.(done);
        return;
      }
      const next = { ...scene, lines: [...scene.lines, line("ooc", text)] };
      saveScene(next);
      void run(next);
      return;
    }
    const next = { ...scene, lines: [...scene.lines, line("me", text)] };
    saveScene(next);
    void run(next);
  };

  const reroll = () => {
    const lastStory = [...scene.lines].reverse().findIndex(l => l.role === "story");
    if (lastStory < 0 || busy) return;
    const idx = scene.lines.length - 1 - lastStory;
    const next = { ...scene, lines: scene.lines.slice(0, idx) };
    saveScene(next);
    void run(next);
  };
  const dropLast = () => {
    if (busy || !scene.lines.length) return;
    saveScene({ ...scene, lines: scene.lines.slice(0, -1) });
  };

  const finish = async () => {
    setEnding("working");
    try {
      const summary = await closeScene(getScene(scene.id) ?? scene);
      setEnding({ summary });
    } catch (e) {
      onNotice?.(e instanceof Error ? e.message : "没记上");
      setEnding(null);
    }
  };
  const jump = (fn: () => void, label: string) => { fn(); onNotice?.(label); onBack(); };
  const nextMorning = () => {
    const d = new Date();
    setWorldTime(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0, 0).getTime());
  };

  return (
    <div className="sc-app">
      <div className="sc-top">
        <button type="button" className="sc-icon-btn" onClick={onBack} aria-label="返回"><ChevronLeft size={22} /></button>
        <div className="sc-top-title"><b>{scene.place}</b><small>{fmtWorld(Date.now())}</small></div>
        {scene.ended ? <span style={{ width: 52 }} /> : <button type="button" className="sc-end-btn" onClick={() => setEnding("ask")}>这场结束</button>}
      </div>
      <div className="sc-present">
        {present.length ? present.map(c => (
          <button key={c.id} type="button" className={scene.newFaces.includes(c.id) ? "is-new" : ""} onClick={() => setFace(c.id)}>
            {c.name}{scene.newFaces.includes(c.id) ? " · 新面孔" : ""}
          </button>
        )) : <small>在场：只有你</small>}
      </div>
      <div className="sc-body">
        {scene.premise ? <p className="sc-premise">{scene.premise}</p> : null}
        {scene.lines.map(l => (
          <div key={l.id} className={`sc-line is-${l.role}`}>
            {l.role === "me" ? <span className="sc-me-label">你</span> : null}
            {l.text}
          </div>
        ))}
        {busy ? <div className="sc-line is-story sc-typing">……</div> : null}
        {scene.ended && scene.summary ? <div className="sc-summary">这场记下了：{scene.summary}</div> : null}
        <div ref={bottomRef} />
      </div>
      {!scene.ended ? (
        <div className="sc-input">
          {closingHint && !busy ? (
            <div className="sc-closing">这场好像差不多了 <button type="button" onClick={() => setEnding("ask")}>结束这场</button><button type="button" onClick={() => setClosingHint(false)}>接着演</button></div>
          ) : null}
          <div className="sc-tools">
            <button type="button" onClick={reroll} disabled={busy}><RotateCcw size={14} /> 重写上一段</button>
            <button type="button" onClick={dropLast} disabled={busy}><Trash2 size={14} /> 删掉最后一条</button>
            <span>$ 开头是跟系统说话</span>
          </div>
          <div className="sc-input-row">
            <textarea rows={2} value={input} onChange={e => setInput(e.target.value)} placeholder="你做什么、说什么" onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
            <button type="button" className="sc-send" onClick={send} disabled={busy || !input.trim()} aria-label="发送"><Send size={18} /></button>
          </div>
        </div>
      ) : null}

      {ending ? (
        <div className="sc-sheet-back" onClick={() => (ending === "ask" ? setEnding(null) : undefined)}>
          <div className="sc-sheet" onClick={e => e.stopPropagation()}>
            {ending === "ask" ? (
              <>
                <div className="sc-sheet-head"><b>这场结束？</b></div>
                <p className="sc-sheet-text">会给在场的每个人记一笔你们之间的事，第一次见的人写上对你的第一印象。</p>
                <button type="button" className="sc-primary" onClick={() => void finish()}>结束这场</button>
                <button type="button" className="sc-secondary" onClick={() => setEnding(null)}>再演一会儿</button>
              </>
            ) : ending === "working" ? (
              <p className="sc-sheet-text">在记……</p>
            ) : (
              <>
                <div className="sc-sheet-head"><b>记好了</b></div>
                {ending.summary ? <p className="sc-sheet-text">{ending.summary}</p> : null}
                <div className="sc-sheet-meta">接下来跳到什么时候？</div>
                <div className="sc-jumps">
                  <button type="button" onClick={() => jump(() => shiftWorldTime(3600e3), "过了 1 小时")}>过 1 小时</button>
                  <button type="button" onClick={() => jump(nextMorning, "到第二天早上 8 点了")}>第二天早上</button>
                  <button type="button" onClick={() => jump(() => shiftWorldTime(7 * 864e5), "过了 1 周")}>过 1 周</button>
                  <button type="button" onClick={() => { onBack(); }}>留在这</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {face ? <FaceSheet id={face} onClose={() => setFace(null)} onNotice={onNotice} /> : null}
    </div>
  );
}

/** 点在场的人：看一眼；新面孔可以让 AI 补全卡、升成主要人物 */
function FaceSheet({ id, onClose, onNotice }: { id: string; onClose: () => void; onNotice: Notice }) {
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);
  const char = loadCharacters().find(c => c.id === id);
  const p = getProfile(id);
  if (!char) return null;
  const fill = async () => {
    setBusy(true);
    try {
      const face = rollFace();
      const d = await draftPerson(`名字就叫「${char.name}」，${p.role || "在这场戏里出场的人"}。名字不要改。`, face);
      saveProfile({ ...p, role: d.role || p.role, group: d.group || p.group, age: d.age, isIdol: d.isIdol, publicLabels: d.publicLabels, publicText: d.publicText, privateLines: d.privateLines, speech: d.speech, taboo: d.taboo, face });
      onNotice?.("卡补好了");
      bump(v => v + 1);
    } catch (e) {
      onNotice?.(e instanceof Error ? e.message : "没补上");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sc-sheet-back" onClick={onClose}>
      <div className="sc-sheet" onClick={e => e.stopPropagation()}>
        <div className="sc-sheet-head"><b>{char.name}</b><button type="button" className="sc-icon-btn" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
        <div className="sc-sheet-meta">{[p.role, p.layer === "background" ? "背景人物" : "主要人物"].filter(Boolean).join(" · ")}</div>
        {p.privateLines.length ? <ul className="sc-sheet-list">{p.privateLines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="sc-sheet-text">还没有完整的人物卡。</p>}
        {p.speech ? <p className="sc-sheet-text">说话：{p.speech}</p> : null}
        {!p.privateLines.length ? <button type="button" className="sc-secondary" disabled={busy} onClick={() => void fill()}><Sparkles size={15} /> {busy ? "在捏…" : "让 AI 补全人物卡"}</button> : null}
        {p.layer === "background" ? (
          <button type="button" className="sc-primary" onClick={() => { saveProfile({ ...p, layer: "main" }); onNotice?.(`${char.name} 升成主要人物了`); bump(v => v + 1); }}>升成主要人物</button>
        ) : null}
        <p className="sc-sheet-hint">完整的卡在通讯录里能看能改</p>
      </div>
    </div>
  );
}

