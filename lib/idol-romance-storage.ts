import { isKvHydrated, kvGet, kvSet } from "./kv-db";
import { recoverConfirmedRomanceIncident } from "./idol-romance-recovery";

// Never write route progress to the key used by older romance-knowledge clients.
export const ROMANCE_ROUTE_KEY = "idol_romance_routes_v2";
export const ROMANCE_ROUTE_BACKUP_KEY = "idol_romance_routes_last_good_v2";
export const ROMANCE_ROUTE_HISTORY_KEY = "idol_romance_routes_history_v2";
const LEGACY_KEY = "idol_romance_v1";

function routeState(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    if (!state || !state.lines || typeof state.lines !== "object" || Array.isArray(state.lines)) return null;
    for (const [type, line] of Object.entries(state.lines)) {
      const l = line as Record<string, unknown> | null;
      if (!l || l.type !== type || typeof l.charId !== "string" || !Number.isFinite(l.bond)
        || !Array.isArray(l.history) || !Array.isArray(l.doneNodes)) return null;
    }
    return state;
  } catch { return null; }
}

export function readRomanceRoutes(): Record<string, unknown> {
  const current = routeState(kvGet(ROMANCE_ROUTE_KEY));
  if (current) return current;
  const backup = routeState(kvGet(ROMANCE_ROUTE_BACKUP_KEY));
  if (backup) return backup;
  const legacy = routeState(kvGet(LEGACY_KEY));
  if (legacy) {
    if (isKvHydrated()) writeRomanceRoutes(legacy);
    return legacy;
  }
  if (isKvHydrated()) {
    const recovered = recoverConfirmedRomanceIncident();
    if (recovered) {
      writeRomanceRoutes(recovered);
      return recovered;
    }
  }
  // Historical before-meet-ledger backups can contain inflated scores. Never
  // silently restore those, or turn a knowledge-only record into route progress.
  return { lines: {} };
}

export function writeRomanceRoutes(state: Record<string, unknown>): void {
  if (!isKvHydrated()) throw new Error("存档尚未读取完成，暂不能写入情缘记录");
  const raw = JSON.stringify(state);
  if (!routeState(raw)) throw new Error("情缘记录格式错误，已阻止覆盖");
  const primaryRaw = kvGet(ROMANCE_ROUTE_KEY);
  const backupRaw = kvGet(ROMANCE_ROUTE_BACKUP_KEY);
  const previousRaw = routeState(primaryRaw) ? primaryRaw : backupRaw;
  const previous = routeState(previousRaw);
  if ((primaryRaw || backupRaw) && !previous) throw new Error("情缘存档暂时无法读取，已阻止覆盖");
  const lines = state.lines as Record<string, { charId: string; doneNodes: string[] }>;
  if (previous) {
    for (const [type, old] of Object.entries(previous.lines as Record<string, { charId: string; doneNodes: string[] }>)) {
      if (!lines[type] || lines[type].charId !== old.charId || old.doneNodes.some(node => !lines[type].doneNodes.includes(node))) {
        throw new Error("情缘记录出现回退，已保留原进度，请重新打开应用");
      }
    }
  }
  if (previous && previousRaw !== raw) {
    let history: string[] = [];
    try {
      const parsed = JSON.parse(kvGet(ROMANCE_ROUTE_HISTORY_KEY) || "[]");
      if (Array.isArray(parsed)) history = parsed.filter(item => typeof item === "string" && routeState(item));
    } catch { /* keep the current valid snapshot even if history is damaged */ }
    kvSet(ROMANCE_ROUTE_HISTORY_KEY, JSON.stringify([previousRaw, ...history.filter(item => item !== previousRaw)].slice(0, 8)));
  }
  const oldBackup = "idol_romance_before_meet_ledger_v1";
  if (!kvGet(oldBackup)) {
    const old = kvGet(LEGACY_KEY);
    if (routeState(old)) kvSet(oldBackup, old!);
  }
  kvSet(ROMANCE_ROUTE_BACKUP_KEY, raw);
  kvSet(ROMANCE_ROUTE_KEY, raw);
}
