"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bot, ChevronLeft, PenLine } from "lucide-react";

import type { Character } from "@/lib/character-types";
import { resolveUserIdentity } from "@/lib/settings-storage";
import {
  createUserDiaryEntry,
  deleteUserDiaryEntry,
  loadAnnotationsForEntry,
  loadUserDiaryEntries,
  markUserDiaryAnnotationsSeen,
  updateUserDiarySharedWith,
  USER_DIARY_SELF_KEY,
  USER_DIARY_UPDATED_EVENT,
  type DiaryAnnotation,
  type UserDiaryEntry,
} from "@/lib/user-diary";
import { annotateUserDiaryEntry } from "@/lib/user-diary-engine";
import { assignAnnotations, LeftoverAnnotations, renderAnnotatedParagraph } from "./diary-annotations";

// 正在批注的 char（模块级：离开页面也继续，回来还能看到「正在看」）
const pendingReaders = new Map<string, Set<string>>();
const PENDING_EVENT = "user-diary-pending-readers";

function setPending(entryId: string, charId: string, on: boolean) {
  const set = pendingReaders.get(entryId) || new Set<string>();
  if (on) set.add(charId); else set.delete(charId);
  if (set.size > 0) pendingReaders.set(entryId, set); else pendingReaders.delete(entryId);
  window.dispatchEvent(new CustomEvent(PENDING_EVENT));
}

export async function shareUserDiaryWith(entry: UserDiaryEntry, characters: Character[], notify: (m: string) => void) {
  await Promise.all(characters.map(async character => {
    setPending(entry.id, character.id, true);
    try {
      const notes = await annotateUserDiaryEntry(character.id, entry);
      if (notes.length > 0) notify(`${character.name} 在你的日记上写了批注`);
    } catch (error) {
      notify(`${character.name} 没能写上批注：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPending(entry.id, character.id, false);
    }
  }));
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sharedLabel(entry: UserDiaryEntry, characters: Character[]): string {
  if (entry.sharedWith.length === 0) return "只给自己看";
  const names = entry.sharedWith.map(id => characters.find(c => c.id === id)?.name).filter(Boolean);
  return names.length ? `给 ${names.join("、")} 看了` : "只给自己看";
}

function SharePicker({
  characters,
  selected,
  onChange,
  disabledIds = [],
}: {
  characters: Character[];
  selected: string[] | null;
  onChange: (next: string[] | null) => void;
  disabledIds?: string[];
}) {
  return (
    <div className="my-diary-share">
      <button type="button" className="my-diary-share-row" aria-pressed={selected === null} onClick={() => onChange(null)}>
        <span className="my-diary-radio" />只给自己看
      </button>
      <button type="button" className="my-diary-share-row" aria-pressed={selected !== null} onClick={() => onChange(selected ?? [])}>
        <span className="my-diary-radio" />给他们看（可多选）
      </button>
      {selected !== null && (
        <div className="my-diary-share-list">
          {characters.map(character => {
            const disabled = disabledIds.includes(character.id);
            const on = disabled || selected.includes(character.id);
            return (
              <button
                key={character.id}
                type="button"
                className="my-diary-share-char"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onChange(on ? selected.filter(id => id !== character.id) : [...selected, character.id])}
              >
                <span className="my-diary-check" />
                <span className="my-diary-share-avatar">
                  {character.avatar ? <img src={character.avatar} alt="" /> : <Bot size={14} />}
                </span>
                <span>{character.name}</span>
                {disabled ? <em>已经给看过</em> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyDiaryWriter({
  characters,
  onSave,
  onClose,
}: {
  characters: Character[];
  onSave: (title: string, body: string, sharedWith: string[]) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [step, setStep] = useState<"write" | "share">("write");
  const [selected, setSelected] = useState<string[] | null>(null);
  const today = useMemo(() => formatTime(new Date().toISOString()).slice(0, 10), []);
  return (
    <div className="my-diary-writer">
      <header className="diary-app-header diary-entry-header">
        <button type="button" className="diary-icon-btn" onClick={step === "share" ? () => setStep("write") : onClose} aria-label="返回">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1>{step === "write" ? "写日记" : "给谁看"}</h1>
          <p>{today}</p>
        </div>
        <span className="diary-header-spacer" />
      </header>
      {step === "write" ? (
        <div className="my-diary-writer-paper">
          <input
            className="my-diary-writer-title"
            value={title}
            maxLength={40}
            placeholder="标题（可以不写）"
            onChange={event => setTitle(event.target.value)}
          />
          <textarea
            className="my-diary-writer-body"
            value={body}
            autoFocus
            placeholder="今天……"
            onChange={event => setBody(event.target.value)}
          />
        </div>
      ) : (
        <div className="my-diary-writer-share">
          <SharePicker characters={characters} selected={selected} onChange={setSelected} />
        </div>
      )}
      <div className="my-diary-writer-actions">
        {step === "write" ? (
          <button type="button" className="diary-anno-submit" disabled={!body.trim()} onClick={() => setStep("share")}>下一步</button>
        ) : (
          <button
            type="button"
            className="diary-anno-submit"
            disabled={selected !== null && selected.length === 0}
            onClick={() => onSave(title, body, selected ?? [])}
          >
            保存
          </button>
        )}
      </div>
    </div>
  );
}

function MyDiaryDetail({
  entry,
  characters,
  userName,
  onClose,
  onDelete,
  onShareMore,
}: {
  entry: UserDiaryEntry;
  characters: Character[];
  userName: string;
  onClose: () => void;
  onDelete: () => void;
  onShareMore: (ids: string[]) => void;
}) {
  const [notes, setNotes] = useState<DiaryAnnotation[]>(() => loadAnnotationsForEntry(entry.id));
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState<string[] | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    const refresh = () => setNotes(loadAnnotationsForEntry(entry.id));
    const onPending = () => bump(v => v + 1);
    window.addEventListener(USER_DIARY_UPDATED_EVENT, refresh);
    window.addEventListener(PENDING_EVENT, onPending);
    markUserDiaryAnnotationsSeen(entry.id);
    return () => {
      window.removeEventListener(USER_DIARY_UPDATED_EVENT, refresh);
      window.removeEventListener(PENDING_EVENT, onPending);
    };
  }, [entry.id]);
  useEffect(() => { markUserDiaryAnnotationsSeen(entry.id); }, [entry.id, notes.length]);

  const readingNames = [...(pendingReaders.get(entry.id) || [])]
    .map(id => characters.find(c => c.id === id)?.name)
    .filter(Boolean);
  const paragraphs = entry.body.split(/\n+/).filter(p => p.trim());
  const { perText, leftover } = assignAnnotations(paragraphs, notes);
  const toggle = (id: string) => setActiveNote(current => current === id ? null : id);
  const shareCandidates = characters.filter(c => !entry.sharedWith.includes(c.id));

  return (
    <div className="nw-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <article className="diary-entry-detail-paper" onClick={event => { event.stopPropagation(); setActiveNote(null); }}>
        <span className="diary-entry-paper-clip" aria-hidden="true"><span /></span>
        <div className="diary-entry-detail-scroll">
          <header>
            <div>
              <span>{sharedLabel(entry, characters)}</span>
              <h2>{entry.title}</h2>
            </div>
            <div className="diary-entry-detail-top">
              <button type="button" onClick={onClose}>关闭</button>
            </div>
          </header>
          <div className="diary-entry-blocks">
            {paragraphs.map((paragraph, index) => (
              <p key={index} className="diary-entry-paragraph">
                {renderAnnotatedParagraph(paragraph, perText[index], activeNote, toggle, new Set())}
              </p>
            ))}
            <LeftoverAnnotations annotations={leftover} used={new Set()} activeId={activeNote} onToggle={toggle} />
          </div>
          {readingNames.length > 0 ? (
            <p className="my-diary-reading">{readingNames.join("、")} 正在看…</p>
          ) : null}
          <footer className="diary-entry-detail-signature">
            <span>{userName}</span>
            <time>{formatTime(entry.createdAt)}</time>
          </footer>
          <div className="my-diary-detail-actions">
            {shareCandidates.length > 0 ? (
              <button type="button" onClick={() => setSharing([])}>再给谁看</button>
            ) : null}
            <button type="button" className="is-danger" onClick={() => setConfirmDelete(true)}>删除</button>
          </div>
        </div>
      </article>
      {sharing !== null ? (
        <div className="diary-anno-sheet-backdrop" onClick={event => { event.stopPropagation(); setSharing(null); }}>
          <section className="diary-anno-sheet" onClick={event => event.stopPropagation()}>
            <h3 className="my-diary-sheet-title">再给谁看</h3>
            <SharePicker characters={characters} selected={sharing} disabledIds={entry.sharedWith} onChange={next => setSharing(next ?? [])} />
            <div className="diary-anno-sheet-actions">
              <button type="button" className="nw-secondary-btn" onClick={() => setSharing(null)}>取消</button>
              <button
                type="button"
                className="diary-anno-submit"
                disabled={sharing.length === 0}
                onClick={() => { onShareMore(sharing); setSharing(null); }}
              >
                给他看
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {confirmDelete ? (
        <div className="nw-modal-backdrop" onClick={event => { event.stopPropagation(); setConfirmDelete(false); }}>
          <section className="nw-delete-confirm" onClick={event => event.stopPropagation()}>
            <h2>删除日记</h2>
            <p>这篇日记和上面的批注都会删掉。</p>
            <div>
              <button type="button" className="nw-secondary-btn" onClick={() => setConfirmDelete(false)}>取消</button>
              <button type="button" className="nw-danger-btn" onClick={onDelete}>
                <span className="note-wall-primary-content"><span>删除</span></span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function MyDiaryView({
  characters,
  style,
  onBack,
  onNotice,
}: {
  characters: Character[];
  style?: CSSProperties;
  onBack: () => void;
  onNotice?: (message: string) => void;
}) {
  const [entries, setEntries] = useState<UserDiaryEntry[]>(() => loadUserDiaryEntries());
  const [writing, setWriting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [, bump] = useState(0);
  const userName = useMemo(() => resolveUserIdentity(undefined, "diary")?.name || "我", []);
  const notifyRef = useRef(onNotice);
  notifyRef.current = onNotice;
  const notify = useCallback((m: string) => notifyRef.current?.(m), []);

  useEffect(() => {
    const refresh = () => setEntries(loadUserDiaryEntries());
    const onPending = () => bump(v => v + 1);
    window.addEventListener(USER_DIARY_UPDATED_EVENT, refresh);
    window.addEventListener(PENDING_EVENT, onPending);
    return () => {
      window.removeEventListener(USER_DIARY_UPDATED_EVENT, refresh);
      window.removeEventListener(PENDING_EVENT, onPending);
    };
  }, []);

  const openEntry = entries.find(e => e.id === openId) || null;

  const save = (title: string, body: string, sharedWith: string[]) => {
    const entry = createUserDiaryEntry({ title, body, sharedWith });
    setWriting(false);
    setOpenId(entry.id);
    const readers = characters.filter(c => sharedWith.includes(c.id));
    if (readers.length > 0) void shareUserDiaryWith(entry, readers, notify);
  };

  const shareMore = (entry: UserDiaryEntry, ids: string[]) => {
    const updated = updateUserDiarySharedWith(entry.id, [...entry.sharedWith, ...ids]);
    const readers = characters.filter(c => ids.includes(c.id));
    if (updated) void shareUserDiaryWith(updated, readers, notify);
  };

  return (
    <section className="diary-app diary-entry-app my-diary-app" style={style}>
      <header className="diary-app-header diary-entry-header">
        <button type="button" className="diary-icon-btn" onClick={onBack} aria-label="返回">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1>{userName} 的日记</h1>
          <p>共 {entries.length} 篇</p>
        </div>
        <span className="diary-header-spacer" />
      </header>
      <main className="diary-entry-main">
        {entries.length === 0 ? (
          <div className="diary-entry-empty">
            <PenLine size={34} strokeWidth={1.5} />
            <h2>还没有写过</h2>
            <p>想写的时候再写。</p>
          </div>
        ) : (
          <div className="diary-entry-list">
            {entries.map(entry => {
              const notes = loadAnnotationsForEntry(entry.id).filter(a => a.authorKey !== USER_DIARY_SELF_KEY);
              const reading = pendingReaders.get(entry.id)?.size || 0;
              return (
                <button key={entry.id} type="button" className="diary-entry-card" onClick={() => setOpenId(entry.id)}>
                  <span className="diary-entry-card-kicker">DIARY</span>
                  <strong>{entry.title}</strong>
                  <span className="diary-entry-card-text">{entry.body.replace(/\s+/g, " ").slice(0, 130)}</span>
                  <span className="diary-entry-card-meta">
                    <span>{reading > 0 ? "正在看…" : notes.length > 0 ? `${notes.length} 条批注` : sharedLabel(entry, characters)}</span>
                    <time>{formatTime(entry.createdAt).slice(0, 10)}</time>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>
      <button type="button" className="diary-entry-write-btn" onClick={() => setWriting(true)}>
        <PenLine size={18} strokeWidth={1.7} />
        <span>写一篇</span>
      </button>
      {writing ? <MyDiaryWriter characters={characters} onSave={save} onClose={() => setWriting(false)} /> : null}
      {openEntry ? (
        <MyDiaryDetail
          entry={openEntry}
          characters={characters}
          userName={userName}
          onClose={() => setOpenId(null)}
          onDelete={() => { deleteUserDiaryEntry(openEntry.id); setOpenId(null); }}
          onShareMore={ids => shareMore(openEntry, ids)}
        />
      ) : null}
    </section>
  );
}
