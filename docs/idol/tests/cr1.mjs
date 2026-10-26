import puppeteer from "puppeteer-core";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new"});
const p=await b.newPage(); await p.setViewport({width:430,height:900,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{ if(m.type()==="error"||m.type()==="warning") console.log("CONSOLE",m.type(),m.text().slice(0,300));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const replies0=["【楼里】B2 是练习室……\n【宿舍】公司后面的公寓，四人一间，门禁十一点\n【一周】每周五傍晚周评\n【规矩】前辈进来要起立",
 "推开练习室的门，冷气一下子扑过来。镜子前已经坐着两个人。\n\n韩智元盘腿坐在地上拉筋，看到你进来，抬手挥了挥：「来啦？今天老师说八点开始，你还早着呢。」\n\n角落里一个扎低马尾的女生站起来，手里还抱着一摞新练习服，有点局促地朝你点头：「你好，我叫申多恩，今天刚来的。」\n[新人:申多恩|今天刚来的同期练习生]\n[时间:+5分钟]",
 "申多恩愣了一下，接过你递的水，釜山口音一下子冒出来：「哎呀谢谢，我早上太紧张，水都忘带了。」\n\n韩智元在旁边笑出声：「她刚才在门口转了三圈才敢进来。」\n\n八点到了，走廊传来管理老师的脚步声。\n[时间:+20分钟]\n[收尾]",
 JSON.stringify({summary:"第一天早上在练习室见到了新来的申多恩，你给她递了水，韩智元在旁边拆台。",people:[{name:"韩智元",event:"早上在练习室跟你和新来的申多恩一起等老师，拿申多恩开了玩笑",impression:""},{name:"申多恩",event:"刚来的第一天，你给她递了一瓶水",impression:"觉得你挺照顾人的"}]}),
];
const replies=[replies0[1],replies0[2],replies0[3],replies0[0]]; let n=0; const prompts=[];
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST, OPTIONS"};
await p.setRequestInterception(true);
p.on("request",r=>{ if(r.url().includes("mock.test")&&r.method()==="OPTIONS"){r.respond({status:204,headers:CORS});return;} if(r.url().includes("mock.test")){ prompts.push(r.postData()); const content=replies[Math.min(n++,replies.length-1)]; r.respond({status:200,headers:CORS,contentType:"application/json",body:JSON.stringify({choices:[{message:{role:"assistant",content},finish_reason:"stop"}]})}); } else r.continue(); });
await p.goto("http://localhost:3031/",{waitUntil:"networkidle2",timeout:180000}); await sleep(2000);
await p.evaluate(async()=>{
  const now=new Date().toISOString();
  const mk=(id,name)=>({id,name,avatar:null,persona:"",wechatID:id,tags:[],createdAt:now,updatedAt:now});
  const base={layer:"main",group:"同期练习生",role:"同期练习生 · 室友",age:"18",isIdol:false,publicLabels:[],publicText:"",face:"mixed",privateLines:["爱拆台","练习最认真"],speech:"说话快",taboo:"",withYou:"室友，嘴贫心软",met:true,events:[],note:""};
  const db=await new Promise((res,rej)=>{const r=indexedDB.open("AiPhoneKvDB");r.onsuccess=()=>res(r.result);r.onerror=rej;});
  const tx=db.transaction("entries","readwrite"); const st=tx.objectStore("entries");
  st.put({key:"ai_phone_characters_v1",value:JSON.stringify([mk("c2","韩智元")])});
  st.put({key:"idol_people_v1",value:JSON.stringify({c2:{...base,charId:"c2"}})});
  st.put({key:"ai_phone_api_configs_v1",value:JSON.stringify([{id:"m1",name:"mock",provider:"openai",apiKey:"x",baseUrl:"https://mock.test/v1",defaultModel:"m",enableImageRecognition:false,enableImageGeneration:false}])});
  st.put({key:"ai_phone_user_identities_v1",value:JSON.stringify([{id:"identity-1",name:"Flora",bio:"",gender:"女",age:"16",occupation:"",customSettings:""}])});
  st.put({key:"idol_trainee_card_v1",value:JSON.stringify({name:"Flora",photo:null,birthday:"1998-04-11",nationality:"中国",mbti:"",looks:"",start:"2015-03-01",trainLength:"一年半",family:"child",familyCustom:"",familyNote:"",talents:["vocal"],talentNote:"",weakness:"",other:"",signature:null,company:"",no:"x",createdAt:1})});
  await new Promise(r=>tx.oncomplete=r);
});
await p.reload({waitUntil:"networkidle2"}); await sleep(2500);
await p.evaluate(()=>{const wc=window.__worldClock; wc.offset=new Date("2015-03-02T07:40:00").getTime()-wc.RealDate.now();});
await p.evaluate(()=>document.querySelector(".lock-swipe")?.click()); await sleep(800);
// 先在绑定里给剧情配上 API：直接写 binding 太麻烦，用全局默认

const shift=async(h)=>{await p.evaluate(h=>{const wc=window.__worldClock; wc.offset+=h*3600e3;},h); await sleep(6000);};
await shift(2); await shift(2);
await p.evaluate(()=>window.postMessage({type:"OS_CMD",action:"open_app",appId:"career"},"*")); await sleep(1500);
await p.screenshot({path:"cr_1.png"});
await p.evaluate(()=>[...document.querySelectorAll(".cr-btns button")].find(x=>x.textContent==="去试镜").click()); await sleep(800);
await p.screenshot({path:"cr_2.png"});
await shift(50);
await p.evaluate(()=>[...document.querySelectorAll(".cr-row button")][0].click()); await sleep(4500);
await p.screenshot({path:"cr_3.png"});
await p.type(".story-composer textarea","我深吸一口气，开始唱准备好的那首歌。");
await p.click('button[aria-label="发送剧情输入"]'); await sleep(3500);
await p.evaluate(()=>[...document.querySelectorAll(".story-idol-bar button")].find(x=>x.textContent==="结束这场").click()); await sleep(500);
await p.evaluate(()=>[...document.querySelectorAll(".story-dialog footer button")].find(x=>x.textContent==="结束这场").click()); await sleep(5000);
await p.screenshot({path:"cr_4.png"});
await p.evaluate(()=>[...document.querySelectorAll(".story-idol-jumps button")].find(x=>x.textContent==="留在这").click()); await sleep(500);
await p.evaluate(()=>window.postMessage({type:"OS_CMD",action:"open_app",appId:"career"},"*")); await sleep(1500);
await p.screenshot({path:"cr_5.png"});
await p.evaluate(()=>[...document.querySelectorAll(".cr-seg button")][1].click()); await sleep(600);
await p.screenshot({path:"cr_6.png"});
console.log("calls",n, "now", await p.evaluate(()=>new Date().toString()));
console.log(errs.slice(0,5));
await b.close();
