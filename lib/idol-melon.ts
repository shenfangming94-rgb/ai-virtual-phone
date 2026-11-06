/** Melon: per-save catalogue. Read world facts; never create artists from search. */
import { kvGet, kvSet } from './kv-db';
import { loadGroups, type Group } from './idol-groups';
import { loadDebut } from './idol-debut';
import { loadTraineeCard } from './trainee-card';
import { currentSaveId } from './idol-saves';
import { loadApiConfigs, loadBindingConfig, resolveBinding, resolveUserIdentity } from './settings-storage';
import { simpleLLMCall } from './api-helpers';
import { idolWorldPrompt } from './idol-worldbook';
import { generateImageFromConfiguredApi } from './image-generation-service';
export const MELON_KEY = 'idol_melon_v1';
export const MELON_EVENT = 'idol-melon-changed';
export type Lyric = {
    section: string;
    member: string;
    ko: string;
    zh: string;
};
export type Comment = {
    id: string;
    by: string;
    text: string;
    me?: boolean;
    avatar?: string;
};
export type Release = {
    id: string;
    title: string;
    artist: string;
    year?: number;
    at?: number;
    note?: string;
    members: string[];
    tier?: Group['tier'];
    album?: string;
    albumId?: string;
    track?: number;
    real?: boolean;
};
export type Detail = {
    concept: string;
    genre: string;
    duration: number;
    lyrics: Lyric[];
};
export type MelonState = {
    details: Record<string, Detail>;
    covers: Record<string, string>;
    comments: Record<string, Comment[]>;
    likes: string[];
    avatar?: string;
    drafts: Record<string, string>;
};
export function loadMelon(): MelonState { try {
    const s = JSON.parse(kvGet(MELON_KEY) || '{}');
    return { details: s.details || {}, covers: s.covers || {}, comments: s.comments || {}, likes: s.likes || [], avatar: s.avatar, drafts: s.drafts || {} };
}
catch {
    return { details: {}, covers: {}, comments: {}, likes: [], drafts: {} };
} }
export function changeMelon(fn: (s: MelonState) => void) { const s = loadMelon(); fn(s); kvSet(MELON_KEY, JSON.stringify(s)); window.dispatchEvent(new Event(MELON_EVENT)); }
export const releaseId = (artist: string, title: string) => JSON.stringify([artist.trim().toLowerCase(), title.trim().toLowerCase()]);
export function catalogue(now = Date.now()): {
    artists: Group[];
    releases: Release[];
} {
    const year = new Date(now).getFullYear();
    const artists = Object.values(loadGroups()).filter(g => !g.debut || g.debut <= year);
    const debut = loadDebut();
    if (debut?.status === 'debuted' && debut.team && debut.debutAt && debut.debutAt <= now) {
        const name = debut.team.en || debut.team.ko;
        const existing = artists.find(g => g.name === name);
        const own: Group = { ...existing, name, members: debut.members?.map(m => ({ name: m.name })), debut: new Date(debut.debutAt).getFullYear(), tier: existing?.tier || 'rookie', songs: [...(existing?.songs || [])] };
        if (debut.song && !own.songs!.some(s => s.title === debut.song))
            own.songs!.push({ title: debut.song, year: own.debut });
        if (existing)
            artists.splice(artists.indexOf(existing), 1, own);
        else
            artists.push(own);
    }
    let events: {
        date: string;
        title: string;
        note?: string;
    }[] = [];
    try {
        const a = JSON.parse(kvGet('idol_almanac_v1') || '{}');
        events = Object.values(a.world || {}).flat() as typeof events;
    }
    catch { /* no calendar facts */ }
    const releases: Release[] = [];
    for (const g of artists)
        for (const song of g.songs || []) {
            const event = events.find(e => (e.title + ' ' + (e.note || '')).includes(g.name) && (e.title + ' ' + (e.note || '')).includes(song.title) && /发行|回归|发布/.test(e.title + ' ' + (e.note || '')));
            const knownDate = song.releasedAt || event?.date || song.note?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
            const exactAt = knownDate ? new Date(knownDate + 'T00:00:00').getTime() : undefined;
            if ((knownDate && !Number.isFinite(exactAt)) || !song.title || (!song.year && !exactAt) || (song.year || 0) > year || (exactAt !== undefined && exactAt > now) || (!exactAt && /未发行|待发行|预告|即将|计划发行/.test(song.note || '')))
                continue;
            const own = debut?.status === 'debuted' && (debut.team?.en === g.name || debut.team?.ko === g.name) && debut.song === song.title;
            if (own && (!debut.debutAt || debut.debutAt > now))
                continue;
            const id = releaseId(g.name, song.title);
            if (releases.some(r => r.id === id))
                continue;
            releases.push({ id, title: song.title, artist: g.name, year: song.year || (exactAt ? new Date(exactAt).getFullYear() : undefined), at: own ? debut.debutAt : exactAt, album: song.album, albumId: song.album ? releaseId(g.name, 'album:' + song.album) : undefined, track: song.track, note: song.note, members: (g.members ?? []).map(m => m.name), tier: g.tier, real: song.real === true || /现实歌曲|真实歌曲/.test(song.note || '') });
        }
    return { artists, releases };
}
export function hash(s: string) { let n = 0; for (const c of s)
    n = (n * 31 + c.charCodeAt(0)) >>> 0; return n; }
export function coverOf(r: Release, s = loadMelon()) { return s.covers[r.albumId || r.id] || s.covers[r.id] || `/idol/melon/default-${hash(r.albumId || r.id) % 4}.png`; }
export function ranked(releases: Release[], now = Date.now()) { const day = Math.floor(now / 86400000); return [...releases].sort((a, b) => score(b) - score(a)).slice(0, 100); function score(r: Release) { return ({ top: 80, mid: 55, small: 30, rookie: 20 }[r.tier || 'rookie']) + hash(r.id + day) % 20 + Math.max(0, 10 - (new Date(now).getFullYear() - (r.year || 0)) * 2); } }
export function myMelonIdentity() { const c = loadTraineeCard(); const identity = resolveUserIdentity(undefined, 'melon'); return { name: c?.name || identity?.name || '我', avatar: loadMelon().avatar || c?.photo || identity?.avatarUrl || undefined }; }
export function toggleMelonLike(id: string) { changeMelon(s => { s.likes = s.likes.includes(id) ? s.likes.filter(x => x !== id) : [...s.likes, id]; }); }
export function postComment(id: string, text: string) { const t = text.trim().slice(0, 500); if (!t)
    return; changeMelon(s => { s.comments[id] = [{ id: crypto.randomUUID(), by: myMelonIdentity().name, text: t, me: true }, ...(s.comments[id] || [])]; s.drafts[id] = ''; }); }
function scope() { return `${typeof window === 'undefined' ? '' : currentSaveId()}|${kvGet('idol_trainee_card_v1') || ''}`; }
const jobs = new Map<string, Promise<void>>();
function job(id: string, fn: () => Promise<void>) { const key = scope() + id; const old = jobs.get(key); if (old)
    return old; const p = fn().finally(() => jobs.delete(key)); jobs.set(key, p); return p; }
async function ask(prompt: string, r: Release, signal?: AbortSignal) {
    const slot = resolveBinding(loadBindingConfig(), undefined, 'melon');
    const all = loadApiConfigs();
    const config = all.find(c => c.id === slot.apiConfigId) || all[0];
    if (!config)
        throw new Error('请先在设置里配置文字 API');
    const res = await simpleLLMCall(config, [{ role: 'system', content: `你为虚构韩国娱乐圈的 Melon 写内容。只输出所要求的 JSON。提供的艺人、成员、作品名、发行年份全部固定，不改世界设定，不创造其他作品或发行日期。不把现实作品歌词当成原创。${prompt}` }, { role: 'user', content: `世界日期：${new Date(Date.now()).toLocaleDateString('sv-SE')}\n作品：${JSON.stringify(r)}\n${idolWorldPrompt()}` }], { label: 'Melon', temperature: .75, max_tokens: 6500, signal });
    if (!res.content)
        throw new Error(res.error || '生成失败，请重试');
    if (res.wasTruncated)
        throw new Error('内容未生成完整，请重试');
    return JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] || '{}');
}
export function ensureDetail(r: Release, signal?: AbortSignal) {
    return job('detail' + r.id, async () => {
        if (loadMelon().details[r.id])
            return;
        const start = scope();
        const j = await ask(r.real ? '这是现实歌曲，只写概念与曲风，不提供歌词。JSON: {"concept":"","genre":"","duration":180,"lyrics":[]}' : '写完整原创歌曲，约三分钟，32～40行韩语（含重复副歌），每行中文翻译，Verse / Pre-Chorus / Chorus / Bridge / Final Chorus。成员必须来自已知成员；成员未知就用艺人名，不编人名。JSON: {"concept":"歌曲概念中文","genre":"曲风","duration":180,"lyrics":[{"section":"Verse 1","member":"成员名","ko":"韩语","zh":"中文"}]}', r, signal);
        const allowed = new Set([...r.members, r.artist, 'ALL']);
        if (typeof j.concept !== 'string' || typeof j.genre !== 'string' || !Array.isArray(j.lyrics) || (!r.real && (j.lyrics.length < 32 || j.lyrics.length > 48 || j.lyrics.some((l: Lyric) => !l || typeof l.ko !== 'string' || !l.ko.trim() || typeof l.zh !== 'string' || !l.zh.trim() || typeof l.section !== 'string' || !allowed.has(l.member)))))
            throw new Error('歌词不完整或成员信息不匹配，请重试');
        if (scope() !== start || signal?.aborted)
            throw new Error('页面或存档已变更，未保存');
        changeMelon(s => { s.details[r.id] = { concept: j.concept, genre: j.genre, duration: Math.max(120, Math.min(360, Number(j.duration) || 180)), lyrics: r.real ? [] : j.lyrics }; });
    });
}
export function moreComments(r: Release, signal?: AbortSignal) { return job('comments' + r.id, async () => { const start = scope(); const old = loadMelon().comments[r.id] || []; const d = loadMelon().details[r.id]; const j = await ask(`写6条不同听众的短评，中文或韩语（韩语附中文在同一text内）。围绕作品与已知歌词，有具体感受，不全是夸奖。不扮演已有角色、不透露未发生剧情。不要重复旧评论。JSON:{"comments":[{"by":"用户ID","text":"正文"}]}。作品内容：${JSON.stringify(d || r.note || '')}。旧评论：${JSON.stringify(old.slice(-30))}`, r, signal); const incoming = (Array.isArray(j.comments) ? j.comments : []).filter((c: Comment) => c && typeof c.by === 'string' && typeof c.text === 'string' && c.text.trim()).slice(0, 8); if (!incoming.length)
    throw new Error('没有生成有效评论，请重试'); if (scope() !== start || signal?.aborted)
    throw new Error('页面或存档已变更，未保存'); changeMelon(s => { const list = s.comments[r.id] || []; for (const c of incoming)
    if (!list.some(x => x.text === c.text))
        list.push({ id: crypto.randomUUID(), by: c.by.slice(0, 40), text: c.text.slice(0, 1000) }); s.comments[r.id] = list; }); }); }
export async function generateCover(r: Release, signal?: AbortSignal) { const start = scope(); const key = r.albumId || r.id; const old = loadMelon().covers[key]; const img = await generateImageFromConfiguredApi({ description: `Original K-pop album artwork, square full bleed, sophisticated music editorial design. Artist ${r.artist}, title ${r.album || r.title}. Concept ${loadMelon().details[r.id]?.concept || r.note || 'dreamy contemporary Korean pop'}. No watermark, no unrelated artist, no giant flower.`, appId: 'melon', useReferenceImage: false, signal }); if (!img)
    throw new Error('请先开启并配置生图 API'); if (scope() !== start || signal?.aborted)
    return; changeMelon(s => { if (s.covers[key] === old)
    s.covers[key] = img.dataUrl; }); }
/** Deduplicate album cards without merging unrelated singles. */
export function albumCards(items: Release[]): Release[] {
    const seen = new Set<string>();
    return items.filter(r => { const key = r.albumId || r.id; if (seen.has(key))
        return false; seen.add(key); return true; });
}
export function albumTracks(r: Release, items: Release[]): Release[] {
    return r.albumId ? items.filter(t => t.albumId === r.albumId).sort((a, b) => (a.track || 999) - (b.track || 999)) : [r];
}
