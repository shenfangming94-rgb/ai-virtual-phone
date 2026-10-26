import puppeteer from "puppeteer-core";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new"});
const p=await b.newPage(); await p.setViewport({width:430,height:900,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(e.message));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto("http://localhost:3031/",{waitUntil:"networkidle2",timeout:180000}); await sleep(2500);
await p.evaluate(async()=>{
  const now=new Date().toISOString();
  const mk=(id,name,wid)=>({id,name,avatar:null,persona:"",wechatID:wid,tags:[],createdAt:now,updatedAt:now});
  const chars=[mk("c1","徐允浩","yh_0903"),mk("c2","韩智元","jiwon_02"),mk("c3","李夏林","halin"),mk("c4","朴恩静","ej_park"),mk("c5","申多恩","doeun"),mk("c6","妈妈","mom"),mk("c7","周可","zhouke"),mk("c8","金素妍","soyeon"),mk("c9","Mina","mina_jp")];
  const base={layer:"main",group:"",role:"",age:"",isIdol:false,publicLabels:[],publicText:"",face:"mixed",privateLines:[],speech:"",taboo:"",withYou:"",met:false,events:[],note:""};
  const P={
   c1:{...base,charId:"c1",group:"前辈后辈",role:"VANTA 主唱 · 同公司前辈",age:"24",isIdol:true,publicLabels:["温柔大哥","舞台疯子","队内妈妈"],publicText:"直播里永远在笑，会给弟弟们剥橘子。上了舞台像换了个人，粉丝最爱剪他的直拍。",privateLines:["对弟弟们是真的好，夜宵基本是他买单","但不爱笑，累了能一整天不说话","练习室里谁动作不对会直接说，不绕弯","手机相册几乎全是吃的，每顿都拍"],speech:"话短，句尾爱带「嗯？」。熟了以后会突然冒冷笑话。",taboo:"别在他面前说队友不好",withYou:"走廊里你帮他捡了掉的耳机。觉得你挺有礼貌，没多想。",met:true,metAt:{at:Date.parse("2015-03-04"),place:"公司走廊"},events:[{id:"e1",at:Date.parse("2015-03-04"),place:"公司走廊",text:"你帮他捡耳机，他说了句谢谢就走了"},{id:"e2",at:Date.parse("2015-03-17"),place:"练习室",text:"他路过看了你们一眼，说第二段节奏抢了"}]},
   c2:{...base,charId:"c2",group:"同期练习生",role:"同期练习生 · 室友",age:"18",met:true},
   c3:{...base,charId:"c3",group:"同期练习生",role:"同期练习生",age:"17",met:true},
   c4:{...base,charId:"c4",group:"公司",role:"练习生管理老师",age:"31",met:true},
   c5:{...base,charId:"c5",group:"同期练习生",role:"同期练习生",age:"19"},
   c6:{...base,charId:"c6",group:"家和老朋友",role:"家人",met:true},
   c7:{...base,charId:"c7",group:"家和老朋友",role:"高中同桌",met:true},
   c8:{...base,charId:"c8",group:"同期练习生",role:"同期练习生",layer:"background"},
   c9:{...base,charId:"c9",group:"同期练习生",role:"日本练习生",met:true},
  };
  const db=await new Promise((res,rej)=>{const r=indexedDB.open("AiPhoneKvDB");r.onsuccess=()=>res(r.result);r.onerror=rej;});
  const tx=db.transaction("entries","readwrite"); const st=tx.objectStore("entries");
  st.put({key:"ai_phone_characters_v1",value:JSON.stringify(chars)});
  st.put({key:"idol_people_v1",value:JSON.stringify(P)});
  st.put({key:"ai_phone_user_identities_v1",value:JSON.stringify([{id:"identity-1",name:"Flora",bio:"",gender:"女",age:"17",occupation:"",customSettings:""}])});
  await new Promise(r=>tx.oncomplete=r);
});
await p.reload({waitUntil:"networkidle2"}); await sleep(2500);
await p.evaluate(()=>document.querySelector(".lock-swipe")?.click()); await sleep(800);
await p.evaluate(()=>window.postMessage({type:"OS_CMD",action:"open_app",appId:"contacts"},"*")); await sleep(1500);
await p.screenshot({path:"ct_list.png"});
await p.evaluate(()=>[...document.querySelectorAll(".ct-pill")].find(x=>x.textContent==="列表").click()); await sleep(600);
await p.screenshot({path:"ct_lists.png"});
await p.evaluate(()=>document.querySelector(".ct-top .ct-circle").click()); await sleep(500);
await p.evaluate(()=>[...document.querySelectorAll(".ct-row")].find(x=>x.textContent.includes("徐允浩")).click()); await sleep(900);
await p.screenshot({path:"ct_card.png"});
await p.evaluate(()=>document.querySelector(".ct-card-page").scrollTop=520); await sleep(400);
await p.screenshot({path:"ct_card2.png"});
await p.evaluate(()=>[...document.querySelectorAll(".ct-pill")].find(x=>x.textContent==="编辑").click()); await sleep(700);
await p.screenshot({path:"ct_edit.png"});
await p.evaluate(()=>[...document.querySelectorAll(".ct-pill")].find(x=>x.textContent==="取消").click()); await sleep(400);
await p.evaluate(()=>document.querySelector(".ct-top .ct-circle").click()); await sleep(400);
await p.evaluate(()=>document.querySelector(".ct-plus").click()); await sleep(500);
await p.screenshot({path:"ct_add.png"});
console.log(errs.slice(0,5));
await b.close();
