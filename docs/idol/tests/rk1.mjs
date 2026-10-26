import puppeteer from "puppeteer-core";
const OUT=process.argv[2]||".";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new"});
const p=await b.newPage(); await p.setViewport({width:430,height:900,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{ if(/idol-ledger|idol-events|publish/.test(m.text())) console.log("CONSOLE",m.text().slice(0,400)); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=[];
function reply(body){
  const s=body||"";
  if(s.includes("补成完整的卡")) return JSON.stringify({name:"申多恩",role:"同期练习生 · 今天刚来",group:"同期练习生",age:"17",isIdol:false,publicLabels:[],publicText:"",privateLines:["紧张的时候会一直捏衣角","釜山口音一着急就冒出来","吃饭特别快，吃完会帮别人收盘子","手机壁纸是老家的海"],speech:"平时说首尔话，一激动就是釜山话",taboo:""});
  if(s.includes("月末评价出结果")) return JSON.stringify({announce:"3月月末评价结果出来了哦。名单在下面，排名靠后的同学下周一单独来办公室。",comment:"这个月进步看得见，高音再稳一点就更好了。",reactions:[{who:"申多恩",text:"Flora 你上升了好多！！"},{who:"韩智元",text:"我们这个月都好拼啊"}]});
  if(s.includes("排接下来几天")) { globalThis.planCalls=(globalThis.planCalls||0)+1; const m=s.match(/时间段：(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/); const d=new Date(m[1]+"T"+m[2]+":"+m[3]+":00"); const f=(ms)=>{const x=new Date(ms);const p=n=>String(n).padStart(2,"0");return x.getFullYear()+"-"+p(x.getMonth()+1)+"-"+p(x.getDate())+" "+p(x.getHours())+":"+p(x.getMinutes());}; const t=d.getTime();
    globalThis.planReq=s;
    return JSON.stringify({events:[
      {at:f(t+2*3600e3),kind:"small",about:"舞蹈组的吴多彬在练习室扭到了脚，被送去医院",people:["吴多彬"],lines:[{where:"group",who:"朴珍熙",text:"多彬脚扭了，今天的加练取消哦。"},{where:"group",who:"吴多彬",text:"没事没事 大家别担心😭"}],invite:null},
      {at:f(t+5*3600e3),kind:"chance",about:"公司要拍一支练习生公开视频，在舞蹈组里挑人",people:["朴珍熙"],lines:[{where:"private",who:"朴珍熙",text:"下周二拍练习生公开视频，你要不要报名？明天中午前回我。"}],invite:{title:"拍练习生公开视频（舞蹈组）",at:f(t+4*864e5),place:"JYP 摄影棚",replyBy:f(t+30*3600e3),from:"朴珍熙"}}
    ],newPeople:[],status:[{name:"韩智元",status:"这周在偷偷练一段新编舞，天天练到凌晨",kakao:"凌晨三点的练习室 🌙"}],posts:[]}); }
  if(s.includes("跟她分到同一间宿舍的室友")) return JSON.stringify({name:"林夏琳",gender:"女",birthday:"11-02",mbti:"ISFJ",role:"同期女练习生",group:"室友",age:"17",isIdol:false,publicLabels:[],publicText:"",privateLines:["睡前一定要敷面膜","会把零食分成小份藏起来"],speech:"慢吞吞",taboo:"",secret:""});
  if(s.includes("带新人练习生的管理老师")) return JSON.stringify({name:"朴珍熙",role:"练习生管理老师",group:"公司",age:"34",isIdol:false,publicLabels:[],publicText:"",privateLines:["通知永远提前一天发","群里只发正事"],speech:"简短，句尾爱加「哦」",taboo:""});
  if(s.includes("发日程通知")) return "明天下午五点周评，B2 练习室，提前十分钟到哦。";
  if(s.includes("把这场戏记下来")) return JSON.stringify({summary:"第一天在练习室认识了申多恩。",people:[{name:"韩智元",event:"拿走了你的 ID",impression:"",relation:"up",heart:"up",secretLearned:""},{name:"申多恩",event:"把 KakaoTalk ID 写在你手背上",impression:"觉得你人很好"}]});
  if(s.includes("这一场戏")) return "申多恩从口袋里摸出一支笔，抓过你的手，在手背上写了一串字母：「dawn_0712，回去加我！」\n\n韩智元凑过来：「你的 ID 也给我呗。」\n[新人:申多恩|今天刚来的同期练习生]\n[给号:申多恩|dawn_0712]\n[加你:韩智元|我是智元，练习室那个]\n[收尾]";
  return "嗯嗯！看到你加我了，好开心～";
}
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST, OPTIONS"};
await p.setRequestInterception(true);
p.on("request",r=>{ if(r.url().includes("mock.test")&&r.method()==="OPTIONS"){r.respond({status:204,headers:CORS});return;} if(r.url().includes("mock.test")){ const c=reply(r.postData()); log.push(c.slice(0,30)); r.respond({status:200,headers:CORS,contentType:"application/json",body:JSON.stringify({choices:[{message:{role:"assistant",content:c},finish_reason:"stop"}]})}); } else r.continue(); });
await p.goto("http://localhost:3031/",{waitUntil:"networkidle2",timeout:300000}); await sleep(2000);
await p.evaluate(async()=>{
  const now=new Date().toISOString();
  const mk=(id,name)=>({id,name,avatar:null,persona:"",wechatID:"jiwon_99",tags:[],createdAt:now,updatedAt:now});
  const base={layer:"main",group:"同期练习生",role:"同期练习生",age:"18",isIdol:false,publicLabels:[],publicText:"",face:"mixed",privateLines:["爱拆台"],speech:"说话快",taboo:"",withYou:"室友",met:true,events:[],note:""};
  const db=await new Promise((res,rej)=>{const r=indexedDB.open("AiPhoneKvDB");r.onsuccess=()=>res(r.result);r.onerror=rej;});
  const tx=db.transaction("entries","readwrite"); const st=tx.objectStore("entries");
  st.put({key:"ai_phone_characters_v1",value:JSON.stringify([mk("c2","韩智元")])});
  st.put({key:"idol_people_v1",value:JSON.stringify({c2:{...base,charId:"c2"}})});
  st.put({key:"ai_phone_api_configs_v1",value:JSON.stringify([{id:"m1",name:"mock",provider:"openai",apiKey:"x",baseUrl:"https://mock.test/v1",defaultModel:"m",enableImageRecognition:false,enableImageGeneration:false}])});
  st.put({key:"ai_phone_user_identities_v1",value:JSON.stringify([{id:"identity-1",name:"Flora",bio:"",gender:"女",age:"16",occupation:"",customSettings:""}])});
  st.put({key:"idol_trainee_card_v1",value:JSON.stringify({name:"Flora",photo:null,birthday:"1998-04-11",nationality:"中国",mbti:"",looks:"",start:"2015-03-01",trainLength:"一年半",family:"normal",familyCustom:"",familyNote:"",talents:["vocal"],talentNote:"",weakness:"",other:"",signature:null,company:"JYP",no:"x",createdAt:1})});
  const t0=new Date("2015-03-02T09:00:00").getTime();
  st.put({key:"idol_career_v1",value:JSON.stringify({stage:"trainee",companyId:"jyp",signedAt:t0-86400000,facts:[],offers:[],offersMadeAt:1,nodes:[
    {id:"n1",kind:"first_day",title:"进公司第一天",place:"JYP 公司大楼",premise:"第一天",dueAt:t0,status:"done",companyId:"jyp",remindedEve:true,remindedDue:true},
    {id:"n2",kind:"weekly",title:"周评",place:"JYP 公司 练习室",premise:"周评",dueAt:new Date("2015-03-06T17:00:00").getTime(),status:"done",companyId:"jyp",remindedEve:true},
    {id:"m1",kind:"monthly",title:"月末考核",place:"JYP 公司 考核室",premise:"",dueAt:new Date("2015-03-27T14:00:00").getTime(),status:"done",result:"老师说我进步很大",companyId:"jyp",remindedEve:true,remindedDue:true}]})});
  await new Promise(r=>tx.oncomplete=r);
});
await p.evaluate(()=>{const wc=window.__worldClock; const t=new Date("2015-03-28T10:05:00").getTime(); wc.offset=t-wc.RealDate.now(); localStorage.setItem("idol_world_clock_v1",JSON.stringify({real:false,offset:wc.offset,world:t}));});
await p.reload({waitUntil:"networkidle2"}); await sleep(2500);
await p.evaluate(()=>document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(async()=>{const db=await new Promise(res=>{const r=indexedDB.open("AiPhoneKvDB");r.onsuccess=()=>res(r.result)}); const tx=db.transaction("entries","readwrite"); tx.objectStore("entries").put({key:"idol_pending_scene_v1",value:JSON.stringify({nodeId:"n1",place:"JYP 公司大楼",premise:"进公司第一天"})}); await new Promise(r=>tx.oncomplete=r);});
await p.reload({waitUntil:"networkidle2"}); await sleep(2500);
await p.evaluate(()=>document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(()=>window.postMessage({type:"OS_CMD",action:"open_app",appId:"story"},"*")); await sleep(5000);
await p.screenshot({path:OUT+"/k1_scene.png"});
await p.evaluate(()=>[...document.querySelectorAll(".story-idol-bar button")].find(x=>x.textContent==="结束这场").click()); await sleep(500);
await p.evaluate(()=>[...document.querySelectorAll(".story-dialog footer button")].find(x=>x.textContent==="结束这场").click()); await sleep(3000);
const kv=async k=>p.evaluate(k=>new Promise(res=>{const r=indexedDB.open("AiPhoneKvDB");r.onsuccess=()=>{const g=r.result.transaction("entries").objectStore("entries").get(k);g.onsuccess=()=>res(g.result?.value)}}),k);
console.log("kakao", await kv("idol_kakao_v1"));
await sleep(12000);
{ const lg=JSON.parse(await kv("idol_ledger_v1")||"null"); console.log("ledger", JSON.stringify(lg)?.slice(0,300)); console.log("months", lg?.months?.map(m=>m.month+" #"+m.rank+"/"+m.total+" "+m.comment)); }
await p.evaluate(()=>window.postMessage({type:"OS_CMD",action:"open_app",appId:"chat"},"*")); await sleep(2500);
await p.mouse.click(250,438); await sleep(3500);
await p.screenshot({path:OUT+"/k_group.png"});
await p.evaluate(()=>window.postMessage({type:"OS_CMD",action:"open_app",appId:"career"},"*")); await sleep(2000);
await p.evaluate(()=>[...document.querySelectorAll(".rm-lrow")].find(x=>x.textContent.includes("月末排名")).click()); await sleep(800);
await p.screenshot({path:OUT+"/k_rank.png"});
await p.evaluate(()=>document.querySelector(".rm-rank-img").click()); await sleep(600);
await p.screenshot({path:OUT+"/k_view.png"});
console.log(errs.slice(0,3)); await b.close();
