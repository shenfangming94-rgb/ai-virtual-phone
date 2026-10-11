/**
 * 随站点自带的自定义 APP（public/apps/bundled.json 列出）：
 * 启动时没装就自动装上并放到桌面，版本变了就原地换包（数据保留）。
 * 用户自己卸载过的不再自动装回来。
 */
import { hydrateKvDb, kvGet, kvSet } from "./kv-db";
import {
    CUSTOM_APP_PLACE_DESKTOP_EVENT,
    installCustomAppAsync,
    loadCustomAppPackage,
    loadInstalledCustomApps,
    normalizeCustomAppManifestId,
} from "./custom-app-storage";
import { applyCustomAppRegistrationsAsync } from "./custom-app-registration";

type BundledApp = { id: string; version: string; url: string };

const SEEN_KEY = "ai_phone_bundled_custom_apps_v1";

function loadSeen(): Record<string, true> {
    try { return JSON.parse(kvGet(SEEN_KEY) || "{}"); } catch { return {}; }
}

async function syncOne(bundled: BundledApp, seen: Record<string, true>): Promise<boolean> {
    const manifestId = normalizeCustomAppManifestId(bundled.id);
    const existing = loadInstalledCustomApps().find(app => app.manifest?.id === manifestId);
    if (existing ? existing.version === bundled.version : seen[manifestId]) return false;

    const res = await fetch(bundled.url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`下载 ${bundled.url} 失败：${res.status}`);
    const pkg = await loadCustomAppPackage(new File([await res.blob()], `${manifestId}.zip`, { type: "application/zip" }));
    const installed = await installCustomAppAsync(existing
        ? { ...pkg, id: existing.id, installedAt: existing.installedAt }
        : pkg);
    await applyCustomAppRegistrationsAsync(installed);
    if (!existing) window.dispatchEvent(new CustomEvent(CUSTOM_APP_PLACE_DESKTOP_EVENT, { detail: { appId: installed.id } }));
    seen[manifestId] = true;
    return true;
}

let running: Promise<void> | null = null;

export function syncBundledCustomApps(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    running ??= syncAll().finally(() => { running = null; });
    return running;
}

async function syncAll(): Promise<void> {
    try {
        await hydrateKvDb();
        const res = await fetch("/apps/bundled.json", { cache: "no-cache" });
        if (!res.ok) return;
        const list = (await res.json()) as BundledApp[];
        const seen = loadSeen();
        let changed = false;
        for (const bundled of list) {
            try {
                changed = (await syncOne(bundled, seen)) || changed;
            } catch (error) {
                console.warn("[bundled-apps] 安装失败", bundled.id, error instanceof Error ? error.message : error);
            }
        }
        if (changed) kvSet(SEEN_KEY, JSON.stringify(seen));
    } catch (error) {
        console.warn("[bundled-apps]", error);
    }
}
