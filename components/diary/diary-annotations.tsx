"use client";

import { Fragment, useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";
import { locateQuote, type DiaryAnnotation } from "@/lib/user-diary";

function formatNoteTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return `rgba(200,120,150,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

function AnnotationNote({
  note,
  active,
  onToggle,
}: {
  note: DiaryAnnotation;
  active: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <span
      className="diary-anno-note"
      style={{ color: note.color }}
      role="button"
      tabIndex={0}
      onClick={event => { event.stopPropagation(); onToggle(note.id); }}
    >
      {active ? <span className="diary-anno-who">{note.authorName} · {formatNoteTime(note.createdAt)}</span> : null}
      {note.text}
    </span>
  );
}

/**
 * 一段正文 + 锚在上面的批注：被批的句子划淡色荧光笔，批注插在那句后面、正文接着往下。
 * 返回这段里用掉的批注 id，没对上原文的批注由调用方放到最后。
 */
export function renderAnnotatedParagraph(
  text: string,
  annotations: DiaryAnnotation[],
  activeId: string | null,
  onToggle: (id: string) => void,
  used: Set<string>,
): ReactNode {
  type Hit = { start: number; end: number; notes: DiaryAnnotation[] };
  const hits: Hit[] = [];
  for (const note of annotations) {
    if (used.has(note.id)) continue;
    const loc = locateQuote(text, note.quote);
    if (!loc) continue;
    used.add(note.id);
    const same = hits.find(h => h.start === loc.start && h.end === loc.end);
    if (same) same.notes.push(note);
    else hits.push({ ...loc, notes: [note] });
  }
  if (hits.length === 0) return text;
  hits.sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, i) => {
    const start = Math.max(hit.start, cursor);
    if (start > cursor) nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor, start)}</Fragment>);
    if (hit.end > start) {
      nodes.push(
        <mark
          key={`m${i}`}
          className="diary-anno-mark"
          style={{ backgroundImage: `linear-gradient(transparent 58%, ${hexToRgba(hit.notes[0].color, 0.26)} 58%)` }}
        >
          {text.slice(start, hit.end)}
        </mark>,
      );
    }
    nodes.push(
      <span key={`n${i}`} className="diary-anno-group">
        {hit.notes.map(note => (
          <AnnotationNote key={note.id} note={note} active={activeId === note.id} onToggle={onToggle} />
        ))}
      </span>,
    );
    cursor = Math.max(cursor, hit.end);
  });
  if (cursor < text.length) nodes.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return nodes;
}

/** 先把批注分到各段（每条只锚一次），渲染时各段只管自己那份 */
export function assignAnnotations(texts: string[], annotations: DiaryAnnotation[]): { perText: DiaryAnnotation[][]; leftover: DiaryAnnotation[] } {
  const used = new Set<string>();
  const perText = texts.map(text => annotations.filter(note => {
    if (used.has(note.id) || !locateQuote(text, note.quote)) return false;
    used.add(note.id);
    return true;
  }));
  return { perText, leftover: annotations.filter(note => !used.has(note.id)) };
}

/** 没对上原文的批注：放在正文最后 */
export function LeftoverAnnotations({
  annotations,
  used,
  activeId,
  onToggle,
}: {
  annotations: DiaryAnnotation[];
  used: Set<string>;
  activeId: string | null;
  onToggle: (id: string) => void;
}) {
  const rest = annotations.filter(a => !used.has(a.id));
  if (rest.length === 0) return null;
  return (
    <div className="diary-anno-group diary-anno-leftover">
      {rest.map(note => (
        <AnnotationNote key={note.id} note={note} active={activeId === note.id} onToggle={onToggle} />
      ))}
    </div>
  );
}

/** 在容器里选中一段文字时，给出选中的文字和位置（用来弹「批注」按钮） */
export function useTextSelection(containerRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const read = useCallback(() => {
    if (!enabled) return;
    const sel = window.getSelection();
    const container = containerRef.current;
    if (!sel || sel.isCollapsed || !container || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!text || Array.from(text).length > 120) {
      setSelection(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    setSelection({ text, x: rect.left - box.left + rect.width / 2, y: rect.top - box.top });
  }, [containerRef, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const onChange = () => window.setTimeout(read, 0);
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [enabled, read]);
  const clear = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);
  return { selection, clear };
}

export function AnnotationComposer({
  quote,
  colors,
  onSubmit,
  onClose,
}: {
  quote: string;
  colors: string[];
  onSubmit: (text: string, color: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [color, setColor] = useState(colors[0]);
  return (
    <div className="diary-anno-sheet-backdrop" onClick={onClose}>
      <section className="diary-anno-sheet" onClick={event => event.stopPropagation()}>
        <div className="diary-anno-sheet-quote" style={{ borderColor: color }}>{quote}</div>
        <div className="diary-anno-sheet-colors">
          <span>笔的颜色</span>
          {colors.map(c => (
            <button
              key={c}
              type="button"
              className="diary-anno-color"
              style={{ background: c, color: c }}
              aria-pressed={c === color}
              aria-label="选择颜色"
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <textarea
          className="diary-anno-input"
          style={{ color }}
          value={text}
          autoFocus
          maxLength={80}
          placeholder="写在旁边的话"
          onChange={event => setText(event.target.value)}
        />
        <div className="diary-anno-sheet-actions">
          <button type="button" className="nw-secondary-btn" onClick={onClose}>取消</button>
          <button
            type="button"
            className="diary-anno-submit"
            disabled={!text.trim()}
            onClick={() => onSubmit(text.trim(), color)}
          >
            贴上
          </button>
        </div>
      </section>
    </div>
  );
}
