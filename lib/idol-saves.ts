/**
 * 爱豆小手机：存档（一个链接里多个档，能来回切）。
 *
 * 一个档 = 这个世界里的一切：练习生证、人物、聊天、记忆、动态、剧情、查手机、日历、提醒事项、
 * 自定义 app 的内容、用户身份、世界时间。
 * 不跟档走（所有档共用）：API、预设、世界书、正则、绑定、桌面和美化、锁屏壁纸和样式、装好的 app、音乐和书。
 *
 * 开新档：把现在这个档整个存起来 → 清掉世界里的东西 → 刷新，开局页重新来
 * 切换：现在的档存好 → 清掉 → 换成那个档 → 刷新
 * 档存在单独的 IndexedDB（IdolSavesDB），不进备份的数据模块，不会套娃。
 */

import { DATA_MODULES } from "./data-management/modules";
import { clearSource, exportSource, importSource } from "./data-management/idb";
import type { DataSource, KvSource, SourceBackup } from "./data-management/types";
import { loadTraineeCard, type TraineeCard } from "./trainee-card";
import { WORLD_CLOCK_KEY } from "./world-clock";

const DB = "IdolSavesDB";
const CURRENT_KEY = "idol_current_save_id";
export const SAVES_EVENT = "idol-saves-changed";

export type SaveMeta = {
  id: string;
  name: string;
  trainee: string;
  photo: string | null;
  company: string;
  /** 存的时候那个档的世界时间 */
  world: number;
  /** 那个档的练习生证（存档页照练习生证画） */
  card?: TraineeCard | null;
  createdAt: number;
  updatedAt: number;
};

// ── 哪些跟档走 ──

const moduleKv = (id: string) => DATA_MODULES.find(m => m.id === id)?.sources.filter((s): s is KvSource => s.type === "kv") ?? [];
const keysOf = (srcs: KvSource[]) => srcs.flatMap(s => s.keys ?? []);
const prefixesOf = (srcs: KvSource[]) => srcs.flatMap(s => s.prefixes ?? []);

/** 所有档共用、不动的 kv */
function keepKv(): { keys: string[]; prefixes: string[] } {
  const settings = keysOf(moduleKv("settings")).filter(k => k !== "ai_phone_user_identities_v1" && k !== "ai_phone_char_settings_v1");
  const desktop = keysOf(moduleKv("desktop"));
  const apps = moduleKv("apps");
  const appsKeep = keysOf(apps).filter(k => /music|reading|netease|custom_apps_v1|custom_app_icon_styles/.test(k));
  const hub = keysOf(moduleKv("resource_hub"));
  return {
    keys: [
      ...settings, ...desktop, ...appsKeep, ...hub,
      "idol_lock_v1", "idol_lock_wallpaper_v1",
      "ai_phone_cloud_backup_config_v1", "ai_phone_cloud_backup_state_v1",
    ],
    prefixes: [...prefixesOf(apps).filter(p => /music|reading/.test(p)), ...prefixesOf(moduleKv("resource_hub"))],
  };
}

/** 跟档走的数据库 */
const WORLD_DBS = ["AiPhoneChatDB", "AiPhoneMediaCacheDB", "ai_phone_memory_db_v1", "AiPhoneMomentsDB", "AiPhoneStoryDB", "AiPhoneCheckPhoneDB", "AiPhoneDwellingDB"];

function worldSources(): DataSource[] {
  const keep = keepKv();
  return [
    ...WORLD_DBS.map(dbName => ({ type: "indexeddb" as const, dbName })),
    { type: "kv", includeAll: true, excludeKeys: keep.keys, excludePrefixes: keep.prefixes },
    { type: "localStorage", keys: [WORLD_CLOCK_KEY] },
  ];
}

// ── 存档库 ──

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
      if (!db.objectStoreNames.contains("data")) db.createObjectStore("data", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(store: "meta" | "data", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { resolve(req.result); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
  });
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<SaveMeta[]>("meta", "readonly", s => s.getAll() as IDBRequest<SaveMeta[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function currentSaveId(): string {
  let id = localStorage.getItem(CURRENT_KEY);
  if (!id) { id = `save_${Date.now().toString(36)}`; localStorage.setItem(CURRENT_KEY, id); }
  return id;
}

function metaNow(id: string, prev?: SaveMeta): SaveMeta {
  const card = loadTraineeCard();
  const now = Date.now();
  return {
    id,
    name: prev?.name || (card ? `${card.name}${card.company ? ` · ${card.company}` : ""}` : "还没开局的档"),
    trainee: card?.name ?? "",
    photo: card?.photo ?? null,
    company: card?.company ?? "",
    world: now,
    card,
    createdAt: prev?.createdAt ?? (window as unknown as { __worldClock?: { RealDate: DateConstructor } }).__worldClock?.RealDate.now() ?? now,
    updatedAt: (window as unknown as { __worldClock?: { RealDate: DateConstructor } }).__worldClock?.RealDate.now() ?? now,
  };
}

/** 把现在这个档存起来（没开局就不存） */
export async function snapshotCurrent(): Promise<SaveMeta | null> {
  if (!loadTraineeCard()) return null;
  const id = currentSaveId();
  const prev = (await listSaves()).find(m => m.id === id);
  const data: SourceBackup[] = [];
  for (const src of worldSources()) data.push(await exportSource(src));
  const meta = metaNow(id, prev);
  await tx("data", "readwrite", s => s.put({ id, data }));
  await tx("meta", "readwrite", s => s.put(meta));
  return meta;
}

async function clearWorld(): Promise<void> {
  const kvKeys: string[] = [];
  for (const src of worldSources()) {
    if (src.type === "kv") {
      // 记下要清的 key，顺手清掉 localStorage 里可能的旧副本（不然刷新后会被迁移回来）
      const exported = await exportSource(src);
      if (exported.type === "kv") kvKeys.push(...exported.records.map(r => r.key));
    }
    await clearSource(src);
  }
  for (const k of kvKeys) { try { localStorage.removeItem(k); } catch { /* 无所谓 */ } }
}

type WC = { offset: number; frozen: number | null; RealDate: DateConstructor };
/** 刷新前把世界时钟钉住，免得关页面时把旧档的时间写回去 */
function pinClock(world: { offset: number; world: number } | null) {
  const wc = (window as unknown as { __worldClock?: WC }).__worldClock;
  if (!wc) return;
  if (world) { wc.offset = world.offset; wc.frozen = world.world; }
  else { wc.offset = 0; wc.frozen = wc.RealDate.now(); try { localStorage.removeItem(WORLD_CLOCK_KEY); } catch { /* 无所谓 */ } }
}

let busy = false;

/** 开新档：存好现在的，清掉世界，刷新进开局页 */
export async function startNewSave(): Promise<void> {
  if (busy) return;
  busy = true;
  (window as unknown as { __idolSwitching?: boolean }).__idolSwitching = true;
  await snapshotCurrent();
  await clearWorld();
  localStorage.setItem(CURRENT_KEY, `save_${Date.now().toString(36)}`);
  pinClock(null);
  window.location.reload();
}

/** 切到另一个档 */
export async function switchToSave(id: string): Promise<void> {
  if (busy || id === currentSaveId()) return;
  const target = await tx<{ id: string; data: SourceBackup[] } | undefined>("data", "readonly", s => s.get(id) as IDBRequest<{ id: string; data: SourceBackup[] } | undefined>);
  if (!target) throw new Error("这个档的数据找不到了");
  busy = true;
  (window as unknown as { __idolSwitching?: boolean }).__idolSwitching = true;
  await snapshotCurrent();
  await clearWorld();
  for (const part of target.data) await importSource(part, true);
  let clock: { offset: number; world: number } | null = null;
  const ls = target.data.find(p => p.type === "localStorage");
  const raw = ls && ls.type === "localStorage" ? ls.records.find(r => r.key === WORLD_CLOCK_KEY)?.value : undefined;
  if (raw) { try { const j = JSON.parse(raw); if (typeof j.world === "number") clock = { offset: j.offset ?? 0, world: j.world }; } catch { /* 按现在 */ } }
  localStorage.setItem(CURRENT_KEY, id);
  pinClock(clock);
  window.location.reload();
}

export async function renameSave(id: string, name: string): Promise<void> {
  const m = (await listSaves()).find(x => x.id === id);
  if (!m) return;
  await tx("meta", "readwrite", s => s.put({ ...m, name: name.trim() || m.name }));
  window.dispatchEvent(new Event(SAVES_EVENT));
}

export async function deleteSave(id: string): Promise<void> {
  if (id === currentSaveId()) throw new Error("正在玩的档不能删");
  await tx("meta", "readwrite", s => s.delete(id));
  await tx("data", "readwrite", s => s.delete(id));
  window.dispatchEvent(new Event(SAVES_EVENT));
}
