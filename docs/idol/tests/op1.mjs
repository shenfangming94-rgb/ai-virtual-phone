import puppeteer from "puppeteer-core";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new"});
const p=await b.newPage(); await p.setViewport({width:430,height:900,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(e.message));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto("http://localhost:3031/",{waitUntil:"networkidle2",timeout:180000}); await sleep(3000);
await p.screenshot({path:"op_0.png"});
await p.click(".op-cover"); await sleep(500);
const typeIn=async(sel,txt)=>{await p.click(sel,{clickCount:3}); await p.keyboard.type(txt);};
const inp=await p.$('.op-photo + input[type=file]'); await inp.uploadFile("face.jpg"); await sleep(800);
const f=await p.$$('.op-f input'); await f[0].type("Flora"); 
await p.evaluate(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;const i=document.querySelectorAll('.op-f input')[1];set.call(i,"1998-04-11");i.dispatchEvent(new Event("input",{bubbles:true}));});
await f[2].type("中国"); await sleep(300);
await p.screenshot({path:"op_1.png"});
const btn=async t=>{await p.evaluate(t=>{[...document.querySelectorAll("button")].find(x=>x.textContent.replace(/\s/g,"").includes(t))?.click();},t); await sleep(500);};
await btn("下一页");
await p.type('.op-line',"眼睛很圆，笑起来有梨涡，163cm");
await p.evaluate(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;const i=document.querySelector('.op-f input[type=date]');set.call(i,"2015-03-01");i.dispatchEvent(new Event("input",{bubbles:true}));});
const f2=await p.$$('.op-f input'); await f2[1].type("一年半"); await sleep(300);
await p.screenshot({path:"op_2.png"});
await btn("下一页");
await btn("童星"); await p.type('textarea.op-line',"全民女儿那种，八岁演过国民家庭剧"); await sleep(300);
await p.screenshot({path:"op_3.png"});
await btn("下一页"); // 进入 04/06 家庭背景（overview → 预览档案 → 确认并继续；editor → 完成 → 预览档案）
for (let i = 0; i < 8; i++) {
  const foot = await p.evaluate(() => [...document.querySelectorAll(".op-foot button")].map(x => x.textContent.replace(/\s/g, "")));
  if (foot.some(x => x.includes("确认并继续"))) { await btn("确认并继续"); break; }
  if (foot.some(x => x.includes("预览档案"))) await btn("预览档案");
  else if (foot.some(x => x.includes("完成"))) await btn("完成");
}
await btn("노래唱"); await btn("작곡写歌"); await btn("외국어语言"); await sleep(300);
await p.screenshot({path:"op_4.png"});
await btn("下一页"); await sleep(300);
await p.screenshot({path:"op_5.png"});
await btn("生成证件"); await sleep(600);
const box=await (await p.$('.op-sign canvas')).boundingBox();
await p.mouse.move(box.x+40,box.y+80); await p.mouse.down();
for(let i=0;i<40;i++){await p.mouse.move(box.x+40+i*5,box.y+70+Math.sin(i/3)*18);} await p.mouse.up(); await sleep(300);
await p.screenshot({path:"op_6.png"});
await btn("盖章·开始"); await sleep(700); await p.screenshot({path:"op_7.png"}); await sleep(2500);
await p.screenshot({path:"op_8.png"});
await p.evaluate(()=>window.postMessage({type:"OS_CMD",action:"open_app",appId:"contacts"},"*")); await sleep(1500); await p.click(".ct-me"); await sleep(900); await p.evaluate(()=>document.querySelector(".ct-card-page").scrollTop=300); await sleep(400); await p.screenshot({path:"op_9.png"});
console.log("year:", await p.evaluate(()=>new Date().toString()));
console.log(errs.slice(0,5));
await b.close();
