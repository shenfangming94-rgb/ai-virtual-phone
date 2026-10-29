/** 人物之间复用原生关系。检查标记和手动保护也随原生世界卷宗保存。 */
import { currentSaveId } from './idol-saves';
import { loadCharacters } from './character-storage';
import { loadChatContacts } from './chat-storage';
import { loadProfiles, composePersona } from './idol-people';
import { loadCharacterWorldGroups, saveCharacterWorldGroups } from './character-world-storage';
import { simpleLLMCall } from './api-helpers';
import { loadApiConfigs, loadBindingConfig, resolveBinding } from './settings-storage';
export const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
export function relationPeople() {
    const profiles = loadProfiles(), contacts = new Set(loadChatContacts().map(c => c.characterId));
    return loadCharacters().filter(c => profiles[c.id]?.layer === 'main' && contacts.has(c.id));
}
export function setPersonRelation(a: string, b: string, label: string, reverse: string, background = '', manual = true): void {
    if (a === b || !label.trim() || !reverse.trim())
        return;
    const key = pairKey(a, b);
    saveCharacterWorldGroups(loadCharacterWorldGroups().map(g => {
        if (!g.memberIds.includes(a) || !g.memberIds.includes(b) || (!manual && g.idolManualPairs?.includes(key)))
            return g;
        return { ...g, idolManualPairs: manual ? [...new Set([...(g.idolManualPairs || []), key])] : g.idolManualPairs,
            relations: [...g.relations.filter(r => pairKey(r.fromCharacterId, r.toCharacterId) !== key),
                { id: `idol_${a}_${b}`, fromCharacterId: a, toCharacterId: b, label: label.trim(), background: background.trim() },
                { id: `idol_${b}_${a}`, fromCharacterId: b, toCharacterId: a, label: reverse.trim(), background: background.trim() }], updatedAt: new Date().toISOString() };
    }));
}
export function removePersonRelation(a: string, b: string): void {
    const key = pairKey(a, b);
    saveCharacterWorldGroups(loadCharacterWorldGroups().map(g => ({ ...g,
        idolManualPairs: [...new Set([...(g.idolManualPairs || []), key])],
        relations: g.relations.filter(r => pairKey(r.fromCharacterId, r.toCharacterId) !== key) })));
}
let busy = false;
/** 桌面统一检查所有已入库者；仅未检查过的配对进入一次合并判断。 */
export async function relationTick(): Promise<void> {
    if (busy || typeof window === 'undefined')
        return;
    const scope = currentSaveId();
    const switching = () => Boolean((window as unknown as {
        __idolSwitching?: boolean;
        __idolOpeningCommit?: boolean;
    }).__idolSwitching) || localStorage.getItem('idol_current_save_id') !== scope;
    if (switching() || (window as unknown as {
        __idolOpeningCommit?: boolean;
    }).__idolOpeningCommit)
        return;
    const people = relationPeople(), profiles = loadProfiles(), groups = loadCharacterWorldGroups();
    const pairs: [
        string,
        string
    ][] = [];
    for (const g of groups) {
        const members = people.filter(c => g.memberIds.includes(c.id));
        for (let i = 0; i < members.length; i++)
            for (let j = i + 1; j < members.length; j++) {
                const a = members[i].id, b = members[j].id, key = pairKey(a, b);
                if (!g.idolRelationChecks?.includes(key) && !g.idolManualPairs?.includes(key) && !g.relations.some(r => pairKey(r.fromCharacterId, r.toCharacterId) === key))
                    pairs.push([a, b]);
            }
    }
    if (!pairs.length)
        return;
    const slot = resolveBinding(loadBindingConfig(), undefined, 'chat');
    const config = loadApiConfigs().find(c => c.id === slot.apiConfigId) ?? loadApiConfigs()[0];
    if (!config)
        return;
    busy = true;
    // 先标记一次尝试，失败不在后台无限重试；手动关系始终可编辑。
    const keys = new Set(pairs.map(([a, b]) => pairKey(a, b)));
    saveCharacterWorldGroups(groups.map(g => ({ ...g, idolRelationChecks: [...new Set([...(g.idolRelationChecks || []), ...pairs.filter(([a, b]) => g.memberIds.includes(a) && g.memberIds.includes(b)).map(([a, b]) => pairKey(a, b))])] })));
    try {
        const res = await simpleLLMCall(config, [{ role: 'system', content: '根据已有资料判断人物是否原本认识，只判断给定配对。不强迫认识，不新增秘密知情。无依据可以为空。输出JSON {"relations":[{"a":"人物ID","b":"人物ID","label":"A是B的什么人","reverse":"B是A的什么人","background":"已有关系背景"}]}。双向称谓必须对应。' },
            { role: 'user', content: JSON.stringify({ pairs, people: people.map(c => ({ id: c.id, name: c.name, profile: composePersona(profiles[c.id]) })) }) }], { temperature: 0.4, label: '新入库人物关系' });
        if (switching())
            return;
        const result = JSON.parse(res.content?.match(/\{[\s\S]*\}/)?.[0] || '{}');
        const current = new Set(relationPeople().map(c => c.id));
        for (const r of Array.isArray(result.relations) ? result.relations : []) {
            if (typeof r.a !== 'string' || typeof r.b !== 'string' || !keys.has(pairKey(r.a, r.b)) || !current.has(r.a) || !current.has(r.b) || typeof r.label !== 'string' || typeof r.reverse !== 'string')
                continue;
            const g = loadCharacterWorldGroups().find(g => g.memberIds.includes(r.a) && g.memberIds.includes(r.b));
            if (!g || g.idolManualPairs?.includes(pairKey(r.a, r.b)) || g.relations.some(x => pairKey(x.fromCharacterId, x.toCharacterId) === pairKey(r.a, r.b)))
                continue;
            setPersonRelation(r.a, r.b, r.label.slice(0, 80), r.reverse.slice(0, 80), typeof r.background === 'string' ? r.background.slice(0, 300) : '', false);
        }
    }
    catch { /* 无关系即不认识；模型失败不制造关系，也不自动重复调用。 */ }
    finally {
        busy = false;
    }
}
