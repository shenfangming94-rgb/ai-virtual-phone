'use client';
import { useEffect, useState } from 'react';
import { loadCharacterWorldGroups, CHARACTER_WORLDS_UPDATED_EVENT } from '@/lib/character-world-storage';
import { relationPeople, setPersonRelation, removePersonRelation } from '@/lib/idol-relations';
export function IdolPersonRelations({ characterId }: {
    characterId: string;
}) {
    const [, refresh] = useState(0), [target, setTarget] = useState(''), [label, setLabel] = useState(''), [reverse, setReverse] = useState(''), [background, setBackground] = useState(''), [editing, setEditing] = useState(false), [error, setError] = useState('');
    useEffect(() => { const fn = () => refresh(x => x + 1); window.addEventListener(CHARACTER_WORLDS_UPDATED_EVENT, fn); return () => window.removeEventListener(CHARACTER_WORLDS_UPDATED_EVENT, fn); }, []);
    const people = relationPeople(), self = people.find(c => c.id === characterId), group = loadCharacterWorldGroups().find(g => g.memberIds.includes(characterId));
    if (!self)
        return null;
    const others = people.filter(c => c.id !== characterId && group?.memberIds.includes(c.id));
    const rows = others.filter(c => group?.relations.some(r => (r.fromCharacterId === characterId && r.toCharacterId === c.id) || (r.toCharacterId === characterId && r.fromCharacterId === c.id)));
    function open(id = '') { setTarget(id); setLabel(group?.relations.find(r => r.fromCharacterId === characterId && r.toCharacterId === id)?.label || ''); setReverse(group?.relations.find(r => r.fromCharacterId === id && r.toCharacterId === characterId)?.label || ''); setBackground(group?.relations.find(r => r.fromCharacterId === characterId && r.toCharacterId === id)?.background || ''); setError(''); setEditing(true); }
    return <section className="ipr"><header><strong>与别人的关系</strong><span>{rows.length} 人</span></header><div className="ipr-card">{rows.length ? rows.map((c, i) => <button className="ipr-row" key={c.id} onClick={() => open(c.id)}><span className={'ipr-avatar tone-' + i % 5}>{c.avatar ? <img src={c.avatar} alt=""/> : c.name.slice(0, 1)}</span><span><b>{c.name}</b><em>{group?.relations.find(r => r.fromCharacterId === c.id && r.toCharacterId === characterId)?.label || '已认识'}</em><small>{group?.relations.find(r => r.fromCharacterId === characterId && r.toCharacterId === c.id)?.background}</small></span><i>›</i></button>) : <p className="ipr-empty">暂未记录与其他人物的关系</p>}</div><button className="ipr-add" onClick={() => open()}>＋ 添加关系</button><p className="ipr-help">点开一段关系即可修改，双方档案会同步更新。</p>
 {editing && <div className="ipr-mask" onClick={() => setEditing(false)}><section className="ipr-sheet" onClick={e => e.stopPropagation()}><nav><button onClick={() => setEditing(false)}>取消</button><b>{rows.some(c => c.id === target) ? '编辑关系' : '添加关系'}</b><button onClick={() => { if (!target || !label.trim() || !reverse.trim()) {
        setError('请选择人物，并填写双方称谓');
        return;
    } setPersonRelation(characterId, target, label, reverse, background); setEditing(false); }}>保存</button></nav><div className="ipr-card ipr-fields"><label>关系人物<select value={target} onChange={e => { const id = e.target.value; open(id); }}><option value="">选择人物</option>{others.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>{self.name}是对方的<input maxLength={80} value={label} onChange={e => setLabel(e.target.value)} placeholder="例如：学生"/></label><label>对方是{self.name}的<input maxLength={80} value={reverse} onChange={e => setReverse(e.target.value)} placeholder="例如：管理老师"/></label><label>关系背景（选填）<textarea maxLength={300} value={background} onChange={e => setBackground(e.target.value)}/></label></div><p className="ipr-help">保存后，同时更新两人的档案。<br />手动修改的关系不会被 AI 自动覆盖。</p>{error && <p role="alert">{error}</p>}{rows.some(c => c.id === target) && <button className="ipr-delete" onClick={() => { removePersonRelation(characterId, target); setEditing(false); }}>删除这段关系</button>}</section></div>}
 </section>;
}
