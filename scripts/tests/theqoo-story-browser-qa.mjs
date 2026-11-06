/** Mocked browser acceptance for a public roadshow scene -> TheQoo post + banner. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = process.cwd(), port = 3097, url = `http://127.0.0.1:${port}/`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theqoo-story-qa-'));
let serverOutput = '', chrome, socket, id = 0;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
  cwd: root, env: { ...process.env, NEXT_DIST_DIR: '.next-theqoo-story-qa', NEXT_PUBLIC_SELF_HOSTED_MODE: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', b => { serverOutput = (serverOutput + b).slice(-4000); });
server.stderr.on('data', b => { serverOutput = (serverOutput + b).slice(-4000); });
const pending = new Map(), handlers = new Map(), errors = [];
let debugPort = 0, chatCalls = 0, forumCalls = 0;
function send(method, params = {}) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 120000);
    pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}
const on = (method, fn) => handlers.set(method, [...(handlers.get(method) ?? []), fn]);
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
}
async function waitFor(expression, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await evaluate(`Boolean(${expression})`)) return; await delay(250); }
  throw new Error(`Timed out: ${expression}`);
}
function fulfill(requestId, value) {
  const headers = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' }, { name: 'Content-Type', value: 'application/json' }];
  return send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(JSON.stringify({ choices: [{ message: { role: 'assistant', content: typeof value === 'string' ? value : JSON.stringify(value) }, finish_reason: 'stop' }] })).toString('base64') });
}
try {
  let ready = false;
  for (let i = 0; i < 180; i++) { if (server.exitCode !== null) throw new Error(serverOutput); try { if ((await fetch(url)).ok) { ready = true; break; } } catch {} await delay(1000); }
  if (!ready) throw new Error(`Next did not start:\n${serverOutput}`);
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  for (let i = 0; i < 120 && !debugPort; i++) { if (fs.existsSync(portFile)) debugPort = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]); await delay(250); }
  assert.ok(debugPort, 'Chrome CDP started');
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result ?? {}); } else for (const fn of handlers.get(m.method) ?? []) void fn(m.params); });
  on('Runtime.exceptionThrown', d => errors.push(d.exceptionDetails?.exception?.description ?? d.exceptionDetails?.text ?? 'page exception'));
  on('Fetch.requestPaused', async p => {
    const q = p.request;
    if (q.url.includes('mock.test')) {
      if (q.method === 'OPTIONS') return send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' }] });
      const body = JSON.parse(q.postData ?? '{}'), user = body.messages?.filter(m => m.role === 'user').at(-1)?.content ?? '';
      if (body.messages?.some(m => String(m.content).includes('把这场戏记下来'))) {
        chatCalls++;
        return fulfill(p.requestId, { summary: '弘大路演片段公开后，大家开始讨论她的舞台。', practice: [], growth: null, companyIntent: null, fame: 'small', people: [], video: null, publicEvidence: [{ kind: 'roadshow_video', quote: '路演的公开视频已经上传，路人拍下了她的舞台。' }] });
      }
      if (user.includes('source') && user.includes('publicFacts')) {
        forumCalls++;
        return fulfill(p.requestId, { title: { ko: '홍대 로드쇼 영상 올라옴', zh: '弘大路演视频公开了' }, body: [{ ko: '무대 영상이 공개됐네.', zh: '舞台视频公开了。' }], comments: [{ ko: '표정이 좋다', zh: '表情管理不错', likes: 1 }], views: 0, recommendations: 0 });
      }
      if (user.includes('路演的公开视频已经上传')) {
        chatCalls++;
        return fulfill(p.requestId, '大家都看到了这段舞台。');
      }
      chatCalls++;
      return fulfill(p.requestId, '路演的公开视频已经上传，路人拍下了她的舞台。');
    }
    if (q.url.startsWith(url) || q.url.startsWith('http://localhost:') || ['Image', 'Media', 'Font', 'Stylesheet', 'Script'].includes(p.resourceType)) return send('Fetch.continueRequest', { requestId: p.requestId });
    return send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' });
  });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(e.message));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));` });
  await send('Page.navigate', { url }); await waitFor("document.querySelector('.phone-shell')", 120000);
  await evaluate(`(async()=>{const r=indexedDB.open('AiPhoneKvDB',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('entries'))r.result.createObjectStore('entries',{keyPath:'key'})};const db=await new Promise(ok=>r.onsuccess=()=>ok(r.result));const now=Date.now(),iso=new Date(now).toISOString(),id='qa-roadshow-node';const chars=[{id:'qa-roadshow-person',name:'韩叙',avatar:null,persona:'',wechatID:'qa-roadshow-person',tags:[],createdAt:iso,updatedAt:iso}];const profile={charId:chars[0].id,layer:'main',group:'练习生',role:'练习生',age:'19',nationality:'韩国',gender:'男',birthday:'06-21',mbti:'INFP',heightCm:180,appearance:'',familyBackground:'',isIdol:false,publicLabels:[],publicText:'',face:'mixed',privateLines:[],speech:'',taboo:'',withYou:'',met:true,metAt:{at:now,place:'弘大'},events:[],note:'',relation:'朋友'};const node={id,kind:'mainline',title:'夏日练习生路演',place:'弘大',premise:'公司安排她参加公开路演。',dueAt:now-60000,status:'pending',companyId:'jyp',occasion:'mainline'};const values={ai_phone_api_configs_v1:[{id:'theqoo-mock',name:'Local mock',provider:'openai',apiKey:'not-a-real-key',baseUrl:'https://mock.test/v1',defaultModel:'mock',enableImageRecognition:false,enableImageGeneration:false}],ai_phone_characters_v1:chars,idol_people_v1:{[chars[0].id]:profile},idol_trainee_card_v1:{name:'Flora',photo:null,birthday:'2010-04-12',nationality:'中国',start:'2026-01-01',trainLength:'一年',family:'normal',talents:['dance'],company:'JYP',createdAt:now},idol_career_v1:{stage:'trainee',companyId:'jyp',signedAt:now-100*86400000,facts:[],offers:[],nodes:[node]},idol_mainline_v1:{nodes:[{key:'roadshow',title:node.title,place:node.place,premise:node.premise,y:0,m:7,fromDay:20,toDay:31,big:true,state:'scheduled',scheduledAt:now,nodeId:id}]},idol_theqoo_v1:{version:1,posts:[],translate:true},idol_stage_pending_v1:{nodeId:id}};const tx=db.transaction('entries','readwrite');for(const[k,v]of Object.entries(values))tx.objectStore('entries').put({key:k,value:JSON.stringify(v)});await new Promise(ok=>tx.oncomplete=ok);db.close()})()`);
  await send('Page.reload', { ignoreCache: true }); await waitFor("document.querySelector('.phone-shell')", 120000); await waitFor('window.__idolNew', 120000);
  await evaluate("document.querySelector('.lock-swipe')?.click()"); await delay(500); await evaluate("window.postMessage({type:'OS_CMD',action:'open_app',appId:'vnmode'},'*')");
  await waitFor("document.querySelector('.vn-stage-open')", 30000); await evaluate("document.querySelector('.vn-stage-open').click()");
  await delay(2500); await evaluate("document.querySelector('.vn-advance')?.click()");
  await waitFor("[...document.querySelectorAll('.vn-input-field')].some(el => el.getClientRects().length > 0)", 30000); await delay(1000);
  await evaluate(`(()=>{const el=[...document.querySelectorAll('textarea.vn-input-field')].find(x=>x.getClientRects().length>0);if(!el)throw Error('input missing');const k=Object.keys(el).find(x=>x.startsWith('__reactProps$'));el[k].onChange({target:{value:'路演的公开视频已经上传，路人拍下了她的舞台。'},currentTarget:el})})()`);
  await waitFor("[...document.querySelectorAll('textarea.vn-input-field')].some(el=>el.getClientRects().length>0&&el.value.includes('路演的公开视频'))",10000);
  await evaluate("[...document.querySelectorAll('.vn-send-btn')].find(el=>el.getClientRects().length>0&&el.title==='发送')?.click()");
  const playerTurnDeadline=Date.now()+30000;while(chatCalls<2&&Date.now()<playerTurnDeadline)await delay(250);
  await delay(2500);
  await evaluate("document.querySelector('.vn-topbar-btn[title=\"更多\"]')?.click()"); await delay(300);
  await evaluate("[...document.querySelectorAll('.vn-stage-menu button')].find(b=>b.textContent.includes('结束这一场'))?.click()"); await delay(300);
  await evaluate("[...document.querySelectorAll('.vn-end .vn-end-btn')].find(b=>b.textContent.trim()==='确认')?.click()");
  await waitFor("document.querySelector('.vn-end-text')?.textContent.includes('这一场结束了')", 60000);
  const forumDeadline = Date.now() + 60000;
  while (forumCalls === 0 && Date.now() < forumDeadline) await delay(250);
  assert.ok(forumCalls > 0, 'mock forum generation was called');
  await waitFor("document.querySelector('.idol-banner')?.textContent.includes('弘大路演视频公开了')", 30000);
  assert.equal(forumCalls, 1, 'public roadshow event generated exactly one thread');
  assert.equal(chatCalls, 1, 'scene summary was mocked locally');
  assert.equal(await evaluate("Boolean(document.querySelector('.idol-banner'))"), true, 'one comment is enough for player-related banner at zero views');
  const postState = await evaluate(`(async()=>{const r=indexedDB.open('AiPhoneKvDB');const db=await new Promise(ok=>r.onsuccess=()=>ok(r.result));const tx=db.transaction('entries','readonly');const row=await new Promise(ok=>{const q=tx.objectStore('entries').get('idol_theqoo_v1');q.onsuccess=()=>ok(q.result)});db.close();return JSON.parse(row.value)})()`);
  assert.equal(postState.posts[0].views, 0); assert.equal(postState.posts[0].comments.length, 1); assert.equal(postState.posts[0].source.notify, true);
  await evaluate("window.postMessage({type:'OS_CMD',action:'open_app',appId:'theqoo'},'*')"); await waitFor("document.querySelector('.tq-app .post')", 20000);
  assert.match(await evaluate("document.querySelector('.tq-app')?.innerText||''"), /弘大路演视频公开了/);
  console.log(JSON.stringify({ result: 'passed', postVisible: true, banner: true, views: 0, comments: 1, forumCalls, chatCalls, errors }, null, 2));
} finally { try { socket?.close(); } catch {} try { chrome?.kill('SIGTERM'); } catch {} server.kill('SIGTERM'); }
