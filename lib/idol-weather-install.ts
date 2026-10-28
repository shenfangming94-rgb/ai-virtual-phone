import { loadInstalledCustomApps, loadCustomAppPackage, installCustomAppAsync, CUSTOM_APP_PLACE_DESKTOP_EVENT } from "./custom-app-storage";
import { applyCustomAppRegistrationsAsync } from "./custom-app-registration";
let pending: Promise<void> | null = null;
/** Install the bundled idol edition through the existing custom-app system, preserving existing app data. */
export function ensureIdolWeatherApp(): Promise<void> {
  if(pending) return pending;
  pending = (async()=>{
    const old = loadInstalledCustomApps().find(app=>app.manifest.id === 'weather.aurora');
    if(old?.version === '1.4.1-idol.1') {
      window.dispatchEvent(new CustomEvent(CUSTOM_APP_PLACE_DESKTOP_EVENT, { detail: { appId: old.id } }));
      return;
    }
    const response = await fetch('/idol/weather/weather-idol-v1.zip');
    if(!response.ok)throw new Error('天气应用包读取失败');
    const app = await loadCustomAppPackage(new File([await response.blob()],'weather-idol-v1.zip',{type:'application/zip'}));
    // Updating an existing copy keeps its runtime ID, collections, icon and desktop placement.
    if(old){app.id=old.id;app.iconDataUrl=old.iconDataUrl||app.iconDataUrl;}
    const installed=await installCustomAppAsync(app);
    await applyCustomAppRegistrationsAsync(installed);
    window.dispatchEvent(new CustomEvent(CUSTOM_APP_PLACE_DESKTOP_EVENT, { detail: { appId: installed.id } }));
  })().finally(()=>{pending=null;});return pending;
}
