const {chromium}=require('playwright');
(async()=>{
 const [w,h,tag]=[+process.argv[2]||390,+process.argv[3]||844,process.argv[4]||'ip'];
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const p=await c.newPage();p.setDefaultTimeout(250000);p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,300)));
 await p.addInitScript(()=>{try{localStorage.setItem('mf.settings',JSON.stringify({device:'phone',quality:'low',shadow:0,scale:0.8,intro:1}))}catch{}});
 await p.goto('http://localhost:8080/index.html'); await p.waitForFunction("document.getElementById('loading').style.display==='none'");
 console.log('overlay',await p.evaluate("document.getElementById('device').className"));
 await p.tap('#bNew'); await p.tap('#spStart');
 // az idővonalat kézzel vizsgáljuk: a jelenetek elejére ugrunk az animációkkal (nem várjuk a valós időt)
 await p.waitForSelector('#intro'); 
 for(let i=0;i<4;i++){ await p.evaluate((i)=>{const root=document.getElementById('intro');root.getAnimations({subtree:true}).forEach(a=>{try{a.pause()}catch{}});window.__i=i;},i);
   await p.evaluate((i)=>{const sc=[...document.querySelectorAll('#intro .sc')];sc.forEach((s,j)=>{s.getAnimations().forEach(a=>a.cancel());s.style.opacity=j===i?1:0});const root=document.getElementById('intro');
     const S=['I · Nuptial flight|Every colony begins with a new beginning.','II · The queen|One queen. One chance. A new generation.','III · Colony foundation|Build your colony from the ground up.','IV · Survival|Adapt. Develop. Survive.'][i].split('|');const cap=root.querySelector('.cap');cap.querySelector('.k').textContent=S[0];cap.querySelector('.t').textContent=S[1];cap.querySelectorAll('.k,.t').forEach(e=>{e.getAnimations().forEach(a=>a.cancel());e.style.opacity=1});const r=cap.querySelector('.rule');r.getAnimations().forEach(a=>a.cancel());r.style.width='9em';},i);
   await p.waitForTimeout(500); await p.screenshot({path:`/tmp/rig/${tag}_${i+1}.png`}); }
 await b.close();
})();
