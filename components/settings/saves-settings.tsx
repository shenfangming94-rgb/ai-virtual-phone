"use client";

import { useCallback, useEffect, useState } from "react";

import { SAVES_EVENT, currentSaveId, deleteSave, listSaves, renameSave, startNewSave, switchToSave, type SaveMeta } from "@/lib/idol-saves";
import { loadTraineeCard, type TraineeCard } from "@/lib/trainee-card";
import { TraineeIdMini } from "@/components/opening/trainee-id-mini";

const day = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };

function SaveCard({ name, card, world, current, children }: { name: string; card: TraineeCard | null | undefined; world: number; current?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`sv-card ${current ? "is-current" : ""}`}>
      <div className="sv-head">
        <b>{name}</b>
        {current ? <i className="sv-tag">正在玩</i> : null}
      </div>
      {card ? <TraineeIdMini c={card} className="sv-idcard" /> : <div className="sv-empty">还没开局</div>}
      <div className="sv-world">世界时间 {day(world)}</div>
      {children}
    </div>
  );
}

/** 存档：正在玩的这个 + 存着的档；开新档、切换、改名、删除 */
export function SavesPanel({ onNotice }: { onNotice?: (m: string) => void }) {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [working, setWorking] = useState("");
  const cur = typeof window !== "undefined" ? currentSaveId() : "";
  const card = loadTraineeCard();
  const refresh = useCallback(() => { void listSaves().then(setSaves).catch(() => setSaves([])); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(SAVES_EVENT, refresh);
    return () => window.removeEventListener(SAVES_EVENT, refresh);
  }, [refresh]);
  const curMeta = saves.find(s => s.id === cur);
  const others = saves.filter(s => s.id !== cur);

  const run = async (label: string, fn: () => Promise<void>) => {
    setWorking(label);
    try { await fn(); } catch (e) { setWorking(""); onNotice?.(e instanceof Error ? e.message : "没弄成"); }
  };

  return (
    <div className="sv-wrap">
      <SaveCard name={curMeta?.name ?? (card ? `${card.name}${card.company ? ` · ${card.company}` : ""}` : "这个档")} card={card} world={Date.now()} current>
        <div className="sv-btns">
          <button type="button" onClick={() => setRenaming({ id: cur, name: curMeta?.name ?? "" })} disabled={!curMeta}>改名</button>
          <button type="button" className="is-strong" onClick={() => setConfirmNew(true)}>开新档</button>
        </div>
        {!curMeta ? <div className="sv-note">还没存过，切换或开新档时会自动存</div> : null}
      </SaveCard>

      {others.length ? <div className="sv-sec">存着的档</div> : null}
      {others.map(s => (
        <SaveCard key={s.id} name={s.name} card={s.card} world={s.world}>
          <div className="sv-btns">
            <button type="button" onClick={() => setRenaming({ id: s.id, name: s.name })}>改名</button>
            <button type="button" className="is-danger" onClick={() => setConfirmDel(s.id)}>删除</button>
            <button type="button" className="is-strong" onClick={() => void run("正在切换…", () => switchToSave(s.id))}>切换</button>
          </div>
        </SaveCard>
      ))}

      {confirmNew ? (
        <div className="sv-sheet" onClick={() => setConfirmNew(false)}>
          <div className="sv-sheet-in" onClick={e => e.stopPropagation()}>
            <b>开新档？</b>
            <p>现在这个档会整个存起来，以后在这里能切回来。新档从开局页重新填练习生证，人物、聊天、日历这些都从零开始。</p>
            <div className="sv-btns">
              <button type="button" onClick={() => setConfirmNew(false)}>算了</button>
              <button type="button" className="is-strong" onClick={() => void run("正在存档…", startNewSave)}>开新档</button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDel ? (
        <div className="sv-sheet" onClick={() => setConfirmDel(null)}>
          <div className="sv-sheet-in" onClick={e => e.stopPropagation()}>
            <b>删掉「{saves.find(s => s.id === confirmDel)?.name}」？</b>
            <p>这个档里的人、聊天、剧情都会没有，删了找不回来。</p>
            <div className="sv-btns">
              <button type="button" onClick={() => setConfirmDel(null)}>算了</button>
              <button type="button" className="is-danger" onClick={() => { const id = confirmDel; setConfirmDel(null); void deleteSave(id).then(() => onNotice?.("删掉了")).catch(e => onNotice?.(e.message)); }}>确定删除</button>
            </div>
          </div>
        </div>
      ) : null}

      {renaming ? (
        <div className="sv-sheet" onClick={() => setRenaming(null)}>
          <div className="sv-sheet-in" onClick={e => e.stopPropagation()}>
            <b>改名</b>
            <input value={renaming.name} onChange={e => setRenaming({ ...renaming, name: e.target.value })} autoFocus />
            <div className="sv-btns">
              <button type="button" onClick={() => setRenaming(null)}>算了</button>
              <button type="button" className="is-strong" onClick={() => { void renameSave(renaming.id, renaming.name); setRenaming(null); }}>好了</button>
            </div>
          </div>
        </div>
      ) : null}

      {working ? <div className="sv-working">{working}</div> : null}
    </div>
  );
}

export function SavesSettings({ onNotice }: { onNotice?: (m: string) => void }) {
  return <SavesPanel onNotice={onNotice} />;
}
