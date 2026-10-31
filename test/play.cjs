const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(120000);
 p.on('console',m=>{if(['error','warning'].includes(m.type()))console.log('console',m.type(),m.text().slice(0,300))});p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.6,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:90000});
 await p.waitForTimeout(1500); await p.screenshot({path:'/tmp/s_menu.png'});
 await p.click('#bSpecies'); await p.waitForTimeout(1500); await p.screenshot({path:'/tmp/s_species.png'});
 await p.click('#spBack'); await p.click('#bNew'); await p.click('#spList button:nth-child(' + (process.argv[2]||'1') + ')');
 await p.click('#spStart'); await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 await p.waitForTimeout(9000); await p.screenshot({path:'/tmp/s_game.png'});
 await p.evaluate("window.__G.orbit.dist=14");await p.waitForTimeout(1500);await p.screenshot({path:'/tmp/s_close.png'});
 await p.keyboard.press('KeyF'); await p.waitForTimeout(2500); await p.screenshot({path:'/tmp/s_fpv.png'});
 console.log(await p.evaluate("JSON.stringify({fpv:window.__G.fpv,t:window.__G.sim.t})"));
 await b.close();
})();
