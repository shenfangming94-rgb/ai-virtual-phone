/**
 * 随站点自带的自定义 APP（public/apps/bundled.json 列出）：
 * 启动时没装就自动装上并放到桌面，版本变了就原地换包（数据保留）。
 * 只有用户在应用市场里主动卸载过的不再装回来（导入备份覆盖掉 APP 列表时会补装）。
 */
import { hydrateKvDb, kvGet, kvRemove } from "./kv-db";
import { CUSTOM_APPS_PLACE_PENDING_KEY } from "./custom-app-types";
import {
    CUSTOM_APPS_UNINSTALLED_KEY,
    CUSTOM_APP_PLACE_DESKTOP_EVENT,
    installCustomAppAsync,
    loadCustomAppPackage,
    loadInstalledCustomApps,
    normalizeCustomAppManifestId,
} from "./custom-app-storage";
import { applyCustomAppRegistrationsAsync } from "./custom-app-registration";
import { ensureSettingsStorageHydrated } from "./settings-storage";

type BundledApp = { id: string; version: string; url: string };

function loadUninstalled(): string[] {
    try { return JSON.parse(kvGet(CUSTOM_APPS_UNINSTALLED_KEY) || "[]"); } catch { return []; }
}

/** 比较版本号：a 比 b 新返回正数（"0.3.2" > "0.2.10"），认不出的数字段按 0 算 */
function compareVersions(a: string, b: string): number {
    const pa = String(a || "").split(/[.-]/).map(x => parseInt(x, 10) || 0);
    const pb = String(b || "").split(/[.-]/).map(x => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d;
    }
    return 0;
}

async function syncOne(bundled: BundledApp): Promise<void> {
    const manifestId = normalizeCustomAppManifestId(bundled.id);
    const existing = loadInstalledCustomApps().find(app => app.manifest?.id === manifestId);
    // 只往新版本升：用户手动换上的测试版比站点自带的新，不能被旧版盖回去
    if (existing ? compareVersions(bundled.version, existing.version) <= 0 : loadUninstalled().includes(manifestId)) return;

    const res = await fetch(bundled.url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`下载 ${bundled.url} 失败：${res.status}`);
    const pkg = await loadCustomAppPackage(new File([await res.blob()], `${manifestId}.zip`, { type: "application/zip" }));
    const installed = await installCustomAppAsync(existing
        ? { ...pkg, id: existing.id, installedAt: existing.installedAt }
        : pkg);
    await applyCustomAppRegistrationsAsync(installed);
    if (!existing) window.dispatchEvent(new CustomEvent(CUSTOM_APP_PLACE_DESKTOP_EVENT, { detail: { appId: installed.id } }));
}

/** 导入备份后：把所有已安装的 APP 摆回桌面（已在桌面/程序坞/文件夹里的会被跳过） */
function placeImportedAppsIfPending(): void {
    if (!kvGet(CUSTOM_APPS_PLACE_PENDING_KEY)) return;
    kvRemove(CUSTOM_APPS_PLACE_PENDING_KEY);
    for (const app of loadInstalledCustomApps()) {
        window.dispatchEvent(new CustomEvent(CUSTOM_APP_PLACE_DESKTOP_EVENT, { detail: { appId: app.id } }));
    }
}

let running: Promise<void> | null = null;

export function syncBundledCustomApps(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    running ??= syncAll().finally(() => { running = null; });
    return running;
}

async function syncAll(): Promise<void> {
    try {
        // 预设存在 SettingsDB：没读出来就挂预设条目，会漏掉用户自建的预设
        await Promise.all([hydrateKvDb(), ensureSettingsStorageHydrated()]);
        const res = await fetch("/apps/bundled.json", { cache: "no-cache" });
        if (!res.ok) return;
        placeImportedAppsIfPending();
        const list = (await res.json()) as BundledApp[];
        for (const bundled of list) {
            try {
                await syncOne(bundled);
            } catch (error) {
                console.warn("[bundled-apps] 安装失败", bundled.id, error instanceof Error ? error.message : error);
            }
        }
    } catch (error) {
        console.warn("[bundled-apps]", error);
    }
}
