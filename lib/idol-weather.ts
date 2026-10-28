/** Shared historical weather for the idol world; never asks a language model. */
import { kvGet, kvSet } from "./kv-db";
import { realNow } from "./world-clock";
type Series = Record<string, (string | number | null)[]> & { time: string[] };
export type WorldWeatherData = { timezone: string; utc_offset_seconds?: number; hourly: Series; daily: Series; current?: Record<string, string | number | null>; source?: string };
const PREFIX = "idol_weather_month_v1:";
const pending = new Map<string, Promise<WorldWeatherData>>();
const failures = new Map<string, number>();
const CODES: Record<number, string> = {0:"晴",1:"大致晴朗",2:"多云",3:"阴",45:"雾",48:"雾凇",51:"小毛毛雨",53:"毛毛雨",55:"毛毛雨",56:"冻毛毛雨",57:"冻毛毛雨",61:"小雨",63:"中雨",65:"大雨",66:"冻雨",67:"冻雨",71:"小雪",73:"中雪",75:"大雪",77:"雪粒",80:"阵雨",81:"阵雨",82:"强阵雨",85:"阵雪",86:"强阵雪",95:"雷阵雨",96:"雷雨伴冰雹",99:"强雷雨伴冰雹"};
function dateKey(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function monthKey(lat: number, lon: number, date: string) { return `${PREFIX}${lat.toFixed(3)},${lon.toFixed(3)}:${date.slice(0,7)}`; }
function cached(key: string): WorldWeatherData | null { try { return JSON.parse(kvGet(key) || "null"); } catch { return null; } }
async function month(lat: number, lon: number, date: string): Promise<WorldWeatherData> {
  const key = monthKey(lat,lon,date), old = cached(key); if (old) return old;
  if (pending.has(key)) return pending.get(key)!;
  if (realNow() - (failures.get(key) ?? 0) < 60000) throw new Error("历史天气暂时不可用，请稍后重试");
  const task = (async () => {
    const [y,m] = date.split('-').map(Number);
    const start = `${date.slice(0,7)}-01`, end = dateKey(new Date(y,m,0));
    const cutoff = new Date(realNow()-7*864e5);
    if (start > dateKey(cutoff) || y < 1940) throw new Error("这个世界日期还没有可用的历史天气，请选择已有历史数据的日期");
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    const query = {latitude:lat,longitude:lon,start_date:start,end_date:end < dateKey(cutoff) ? end : dateKey(cutoff),timezone:'Asia/Seoul',hourly:'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,precipitation,snowfall,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',daily:'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,snowfall_sum'};
    for(const [k,v] of Object.entries(query)) url.searchParams.set(k,String(v));
    const controller = new AbortController(); const timeout = setTimeout(()=>controller.abort(),20000);
    try {
      const res = await fetch(url.toString(),{signal:controller.signal});
      if (!res.ok) throw new Error(`历史天气读取失败（${res.status}）`);
      const raw = await res.json() as WorldWeatherData;
      if(!raw.hourly?.time?.length || !raw.daily?.time?.length) throw new Error("历史天气数据不完整");
      // Incomplete recent months must not become permanent full-month caches.
      if(end <= dateKey(cutoff)) kvSet(key,JSON.stringify(raw));
      failures.delete(key); return raw;
    } catch(e) {failures.set(key,realNow());throw e;} finally {clearTimeout(timeout);}
  })(); pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
function sliceSeries(a: Series, indices: number[]): Series { return Object.fromEntries(Object.entries(a).map(([k,v])=>[k,indices.map(i=>v[i]??null)])) as Series; }
export async function getWorldWeather(lat = 37.5665, lon = 126.978, at = Date.now()): Promise<WorldWeatherData> {
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180||!Number.isFinite(at))throw new Error("天气地点或日期无效");
  const d = new Date(at), date=dateKey(d), hour=`${date}T${String(d.getHours()).padStart(2,'0')}:00`;
  const raw=await month(lat,lon,date);
  const i=raw.hourly.time.indexOf(hour);if(i<0)throw new Error("这个时段暂无历史天气");
  const days=raw.daily.time.filter(x=>x>=date).slice(0,10);
  let combined=raw;
  if(days.length<10){const next=dateKey(new Date(d.getFullYear(),d.getMonth()+1,1));try{const extra=await month(lat,lon,next);combined={...raw,hourly:Object.fromEntries(Object.keys(raw.hourly).map(k=>[k,[...raw.hourly[k],...(extra.hourly[k]??[])]])) as Series,daily:Object.fromEntries(Object.keys(raw.daily).map(k=>[k,[...raw.daily[k],...(extra.daily[k]??[])]])) as Series};}catch{/* Keep available days; never invent missing future data. */}}
  const hourly=sliceSeries(combined.hourly,combined.hourly.time.map((_,idx)=>idx).filter(idx=>idx>=i&&idx<i+25));
  const daily=sliceSeries(combined.daily,combined.daily.time.map((_,idx)=>idx).filter(idx=>combined.daily.time[idx]>=date).slice(0,10));
  const current: Record<string,string|number|null>={time:hour};for(const [k,v]of Object.entries(raw.hourly))if(k!=='time')current[k]=v[i]??null;
  return {...raw,hourly,daily,current,source:'Open-Meteo 历史天气（再分析）'};
}
/** Synchronous prompt lookup: never block chat on a network request or use a different day's weather. */
export function worldWeatherHint(at=Date.now()): string {
  const d=new Date(at),date=dateKey(d),raw=cached(monthKey(37.5665,126.978,date));
  if(!raw)return '';
  const hour=`${date}T${String(d.getHours()).padStart(2,'0')}:00`,i=raw.hourly.time.indexOf(hour);if(i<0)return '';
  const code=Number(raw.hourly.weather_code[i]),temp=raw.hourly.temperature_2m[i];
  const season=d.getMonth()>=8?d.getFullYear():d.getFullYear()-1;
  let snowContext='';
  try { const first=JSON.parse(kvGet(`idol_weather_first_snow_v1:${season}`)||'null'); if(first?.at<=at && dateKey(new Date(first.at))===date) snowContext='今天迎来这个秋冬季的初雪；可以被窗外所见或朋友消息自然带入，少数人兴奋、其他人照常忙自己的事，不打断眼前剧情，不强迫角色提起。'; } catch { /* No confirmed seasonal data. */ }
  return `【世界天气】首尔 ${date} ${String(d.getHours()).padStart(2,'0')}:00，${CODES[code]??'天气未知'}${temp==null?'':`，${temp}℃`}。这是世界日期对应的历史气象数据，所有人共享；根据所在室内外和人物性格自然反应，普通晴阴雨雪是日常背景，只有与眼前行动有关才自然带过；不主动安排全员天气消息，不夸张渲染，不反复提醒，不把天气变成每段话的主题；不要自行改成其他天气，不要把未来天气当成眼前发生的事。${snowContext}`;
}
let lastWarm = "";
let warmedAt = 0;
export function worldWeatherTick(): void {
  const d = new Date(), key = `${dateKey(d)}:${d.getHours()}`;
  if(key === lastWarm && realNow()-warmedAt < 60000) return;
  lastWarm=key; warmedAt=realNow();
  void getWorldWeather().then(() => {
    window.dispatchEvent(new Event("idol-weather-updated"));
    return import("./idol-weather-life").then(m => m.firstSnowTick());
  }).catch(()=>undefined);
}

/** Read-only compact weather for scene headers; no fallback to another date. */
export function worldWeatherLabel(at = Date.now()): string {
  const d = new Date(at), raw = cached(monthKey(37.5665,126.978,dateKey(d)));
  if(!raw) return '';
  const i = raw.hourly.time.indexOf(`${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:00`);
  if(i<0 || raw.hourly.weather_code[i] == null) return '';
  const t=raw.hourly.temperature_2m[i];
  return `${CODES[Number(raw.hourly.weather_code[i])]??'天气未知'}${t==null?'':` · ${Math.round(Number(t))}℃`}`;
}
/** The first snowfall of the autumn/winter season, established from historical data only. */
export async function seasonFirstSnow(at = Date.now()): Promise<{season: number; at: number} | null> {
  const d=new Date(at), season=d.getMonth()>=8?d.getFullYear():d.getFullYear()-1;
  const key=`idol_weather_first_snow_v1:${season}`, today=dateKey(d);
  let saved: {through:string; at:number|null} | null=null;
  try{saved=JSON.parse(kvGet(key)||'null');}catch{/* no cached proof */}
  if(saved?.at!=null) return saved.at<=at?{season,at:saved.at}:null;
  if(saved?.through && saved.through>=today)return null;
  const url=new URL('https://archive-api.open-meteo.com/v1/archive');
  const q={latitude:37.5665,longitude:126.978,start_date:`${season}-09-01`,end_date:today,timezone:'Asia/Seoul',daily:'snowfall_sum,weather_code'};
  for(const[k,v]of Object.entries(q))url.searchParams.set(k,String(v));
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url.toString(),{signal:controller.signal});if(!response.ok)throw Error('初雪历史数据暂不可用');
    const data=await response.json() as {daily:Series};
    if(!data.daily?.time?.length || data.daily.time.some((_,i)=>data.daily.snowfall_sum?.[i]==null || data.daily.weather_code?.[i]==null))throw Error('初雪历史数据不完整');
    const snowy=(c:unknown)=>[71,73,75,77,85,86].includes(Number(c));
    const first=data.daily.time.find((_,i)=>Number(data.daily.snowfall_sum[i])>0||snowy(data.daily.weather_code[i]));
    if(!first){kvSet(key,JSON.stringify({through:today,at:null}));return null;}
    const raw=await month(37.5665,126.978,first);
    const i=raw.hourly.time.findIndex((t,j)=>t.startsWith(first)&&(Number(raw.hourly.snowfall[j])>0||snowy(raw.hourly.weather_code[j])));
    if(i<0)throw Error('初雪小时资料缺失');
    const when=new Date(raw.hourly.time[i]).getTime();
    // A full day of historical data may include this evening; never announce it in the morning.
    kvSet(key,JSON.stringify({through:today,at:when}));return when<=at?{season,at:when}:null;
  }finally{clearTimeout(timer);}
}
