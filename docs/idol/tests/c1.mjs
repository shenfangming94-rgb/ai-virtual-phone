import puppeteer from "puppeteer-core";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new"});
const p=await b.newPage(); await p.setViewport({width:430,height:900,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(e.message));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto("http://localhost:3031/",{waitUntil:"networkidle2",timeout:180000}); await sleep(2500);
for(let i=0;i<6;i++){ const has=await p.evaluate(()=>!!document.querySelector(".desktop-shell, [data-desktop]")); if(has)break; await p.mouse.click(225,820); await sleep(1500);}
await p.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="我知道了"); b&&b.click();});
await p.evaluate(()=>{const wc=window.__worldClock; wc.offset=new Date("2015-03-17T21:40:00").getTime()-wc.RealDate.now(); localStorage.setItem("idol_world_alarms_v1",JSON.stringify([{id:"a1",h:7,m:30,label:"起床练习",on:true},{id:"a2",h:22,m:0,label:"月考曲目复习",on:false}]));});
await p.evaluate(()=>window.postMessage({type:"OS_CMD",action:"open_app",appId:"clock"},"*")); await sleep(2000);
await p.screenshot({path:"c_world.png"});
const click=async t=>{await p.evaluate(t=>{const e=[...document.querySelectorAll(".clock-app button")].find(x=>x.textContent.includes(t)||x.getAttribute("aria-label")===t); e&&e.click();},t); await sleep(700);};
await click("添加"); await p.screenshot({path:"c_sheet.png"});
await click("关闭"); await click("闹钟"); await p.screenshot({path:"c_alarm.png"});
await click("秒表"); await click("启动"); await sleep(1300); await click("计次"); await sleep(600); await p.screenshot({path:"c_watch.png"});
await click("计时器"); await p.screenshot({path:"c_timer.png"});
console.log(errs);
await b.close();
