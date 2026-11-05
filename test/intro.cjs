const {chromium}=require('playwright');
(async()=>{
 const [w,h,tag,mobile]=[+process.argv[2]||1280,+process.argv[3]||720,process.argv[4]||'i',process.argv[5]==='1'];
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const c=await b.newContext(mobile?{viewport:{width:w,height:h},deviceScaleFactor:1,isMobile:true,hasTouch:true}:{viewport:{width:w,height:h}});
 const p=await c.newPage();p.setDefaultTimeout(250000);p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,300)));
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'");
 await p.waitForTimeout(800);
 console.log('device overlay',await p.evaluate("document.getElementById('device').className"));
 await p.screenshot({path:`/tmp/rig/${tag}_dev.png`});
 await p.click('#device [data-dev='+(mobile?'phone':'desktop')+']'); await p.waitForTimeout(600);
 console.log('stored',await p.evaluate("localStorage.getItem('mf.settings')"), 'overlay', await p.evaluate("document.getElementById('device').className"));
 await p.waitForFunction("document.getElementById('loading').style.display==='none'");
 await p.click('#bNew'); await p.click('#spStart');
 const t0=Date.now();
 for(const t of [1.8,5.8,9.8,13.6,16.4]){ await p.waitForTimeout(Math.max(0,t*1000-(Date.now()-t0))); await p.screenshot({path:`/tmp/rig/${tag}_s${t}.png`}); }
 await p.waitForFunction("!document.getElementById('intro')",null,{timeout:30000});
 console.log('intro done at',((Date.now()-t0)/1000).toFixed(1));
 await p.waitForFunction("window.__G&&window.__G.sim",null,{timeout:200000}); console.log('game started');
 await b.close();
})();
