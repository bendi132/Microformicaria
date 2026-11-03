const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(200000);
 p.on('console',m=>{if(m.type()==='error')console.log('console',m.text().slice(0,300))});p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.6,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:90000});
 await p.click('#bNew'); await p.click('#spList button:nth-child(' + (process.argv[2]||'1') + ')'); await p.click('#spStart');
 await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 await p.evaluate("(()=>{const s=window.__G.sim;for(let i=0;i<600;i++)s.advance(0.1,1);window.__G.sel={kind:'ant',id:s.queen.id};})()");
 await p.keyboard.press('KeyF'); await p.waitForTimeout(1500);
 await p.evaluate("(()=>{const s=window.__G.sim,q=s.controlTarget();q.loc='nest';q.node=s.nest.entranceId;q.nseg=null;q.path=null;})()"); await p.waitForTimeout(2500); await p.screenshot({path:'/tmp/rig/x_in.png'});
 await p.evaluate("(()=>{window.__G.sim.input.use=true;})()"); await p.waitForTimeout(500); await p.evaluate("(()=>{window.__G.sim.input.use=false;})()");
 await p.waitForTimeout(5000); await p.screenshot({path:'/tmp/rig/x_out.png'});
 console.log(await p.evaluate("(()=>{const G=window.__G,c=G.sim.controlTarget();return JSON.stringify({loc:c&&c.loc,fpv:G.fpv,top:G.topNest,nv:G.view._nv,terr:G.view.terrain.visible,fg:G.view.farGround.visible,env:G.env&&G.env.group.visible,kids:G.view.group.children.map(k=>k.visible).filter(v=>!v).length,of:G.view.group.children.length,bg:G.scene.background.getHex()})})()"));
 await b.close();
})();
