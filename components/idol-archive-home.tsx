'use client';
import { useState } from 'react';
import type { Character } from '@/lib/character-types';
import type { CharacterWorldGroup } from '@/lib/character-world-storage';
export function IdolArchiveHome({ people, group, onSelect, onMove }: {
    people: Character[];
    group?: CharacterWorldGroup;
    onSelect: (c: Character, e: React.MouseEvent<HTMLDivElement>) => void;
    onMove: (id: string, x: number, y: number) => void;
}) {
    const [view, setView] = useState('files'), [search, setSearch] = useState('');
    const [dragPositions, setDragPositions] = useState<Record<string, {
        x: number;
        y: number;
    }>>({});
    const list = people.filter(c => c.name.includes(search));
    const minX = Math.min(0, ...people.map(c => c.canvasX ?? 0)), minY = Math.min(0, ...people.map(c => c.canvasY ?? 0));
    const positions = new Map(people.map((c, i) => [c.id, dragPositions[c.id] ?? { x: (c.canvasX ?? (i % 2 ? 230 : 25)) - minX, y: (c.canvasY ?? (30 + Math.floor(i / 2) * 170)) - minY }]));
    return <div className="iah"><div className="iah-tabs"><button className={view === 'files' ? 'active' : ''} onClick={() => setView('files')}>档案</button><button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}>关系图</button></div>{view === 'files' ? <><input className="iah-search" placeholder="搜索人物档案" value={search} onChange={e => setSearch(e.target.value)}/><div className="iah-grid">{list.map((c, i) => <div role="button" tabIndex={0} key={c.id} onClick={e => onSelect(c, e)} onKeyDown={e => { if (e.key === 'Enter')
        e.currentTarget.click(); }}><div className={'iah-folder tone-' + i % 5}><span /></div><b>{c.name}</b></div>)}</div></> : <div className="iah-graph"><div style={{ position: 'relative', minWidth: Math.max(390, ...[...positions.values()].map(p => p.x + 125)), minHeight: Math.max(520, ...[...positions.values()].map(p => p.y + 140)) }}><svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}><defs><marker id="iah-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="none" stroke="#333"/></marker></defs>{group?.relations.filter((r, index, all) => all.findIndex(x => [x.fromCharacterId, x.toCharacterId].sort().join("|") === [r.fromCharacterId, r.toCharacterId].sort().join("|")) === index).filter(r => people.some(c => c.id === r.fromCharacterId) && people.some(c => c.id === r.toCharacterId)).map(r => { const a = positions.get(r.fromCharacterId)!, b = positions.get(r.toCharacterId)!; const dx=b.x-a.x,dy=b.y-a.y,offset=Math.min(.45,55/Math.max(1,Math.abs(dx)),52/Math.max(1,Math.abs(dy))); return <g key={r.id}><line x1={a.x + 50 + dx*offset} y1={a.y + 48 + dy*offset} x2={b.x + 50 - dx*offset} y2={b.y + 48 - dy*offset} stroke="#333" markerEnd="url(#iah-arrow)"/><text x={(a.x + b.x) / 2 + 43} y={(a.y + b.y) / 2 + 25} fontSize="11" textAnchor="middle" stroke="white" strokeWidth="5" paintOrder="stroke">{r.label}{group.relations.find(x => x.fromCharacterId === r.toCharacterId && x.toCharacterId === r.fromCharacterId)?.label ? " / " + group.relations.find(x => x.fromCharacterId === r.toCharacterId && x.toCharacterId === r.fromCharacterId)!.label : ""}</text></g>; })}</svg>{people.map((c, i) => { const p = positions.get(c.id)!; return <div className="iah-node" key={c.id} style={{ left: p.x, top: p.y }} onPointerDown={e => { e.currentTarget.dataset.dragged = "false"; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.start = JSON.stringify({ x: e.clientX, y: e.clientY, px: p.x, py: p.y }); }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId))
        return; const start = JSON.parse(e.currentTarget.dataset.start!); e.currentTarget.style.left = Math.max(0, start.px + e.clientX - start.x) + 'px'; e.currentTarget.style.top = Math.max(0, start.py + e.clientY - start.y) + 'px'; setDragPositions(prev => ({ ...prev, [c.id]: { x: Math.max(0, start.px + e.clientX - start.x), y: Math.max(0, start.py + e.clientY - start.y) } })); }} onPointerUp={e => { const start = JSON.parse(e.currentTarget.dataset.start || '{}'); if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 6) {
        return;
    } e.currentTarget.dataset.dragged="true"; onMove(c.id, Math.max(0, start.px + e.clientX - start.x), Math.max(0, start.py + e.clientY - start.y)); }} onClick={e => {if(e.currentTarget.dataset.dragged==="true"){e.currentTarget.dataset.dragged="false";return;}onSelect(c,e)}}><div className={'iah-folder tone-' + i % 5}><span /></div><b>{c.name}</b></div>; })}</div></div>}</div>;
}
