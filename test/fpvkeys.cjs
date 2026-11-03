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
 await p.evaluate("(()=>{const s=window.__G.sim;for(let i=0;i<300;i++)s.advance(0.1,1);window.__G.sel={kind:'ant',id:s.queen.id};})()");
 await p.keyboard.press('KeyF'); await p.waitForTimeout(1200);
 const st=()=>p.evaluate("(()=>{const G=window.__G,a=G.sim.controlTarget();return JSON.stringify({fpv:G.fpv,loc:a&&a.loc,act:a&&a.anim.act,feed:a&&+(a.anim.feedS||0).toFixed(2),climbing:a&&a.climbing,y:a&&+a.y.toFixed(2),nodes:G.sim.nest.nodes.length,en:a&&+a.energy.toFixed(1)})})()");
 console.log('start',await st());
 // tetem az orr előtt
 await p.evaluate("(()=>{const G=window.__G,s=G.sim,a=s.controlTarget();const e0=s.nest.nodes[0];a.loc='ground';a.node=null;a.nseg=null;a.path=null;a.x=e0.x+12;a.z=e0.z+4;a.yaw=0.3;a.noEnterUntil=s.t+99;const q=s.isopods.find(x=>!x.dead)||s.isopods[0];q.dead=true;q.state='dead';q.fresh=1;q.x=a.x+Math.sin(a.yaw)*6;q.z=a.z+Math.cos(a.yaw)*6;q.yaw=1;a.energy=30;})()");
 await p.keyboard.down('KeyE'); await p.waitForTimeout(3500); console.log('eszik',await st()); await p.screenshot({path:'/tmp/rig/k_eat.png'}); await p.keyboard.up('KeyE');
 // kő: mászás
 await p.evaluate("(()=>{const G=window.__G,s=G.sim,a=s.controlTarget();const st=s.world.stones.find(q=>!q.trunk&&Math.abs(q.x)<55&&Math.abs(q.z)<55);a.x=st.x-st.r*1.4;a.z=st.z;a.yaw=Math.PI/2;})()");
 await p.keyboard.press('KeyF'); await p.keyboard.down('KeyW'); await p.waitForTimeout(3000); console.log('mászik',await st()); await p.screenshot({path:'/tmp/rig/k_climb.png'}); await p.keyboard.up('KeyW');
 await p.keyboard.press('KeyF'); await p.waitForTimeout(1500);
 // ásás
 await p.evaluate("(()=>{const G=window.__G,s=G.sim,a=s.controlTarget();const e=s.nest.nodes[0];a.x=e.x+16;a.z=e.z+6;a.yaw=0;a.climbing=false;})()");
 await p.keyboard.down('KeyX'); await p.waitForTimeout(2500); console.log('ás',await st()); await p.screenshot({path:'/tmp/rig/k_dig.png'}); await p.waitForTimeout(6000); await p.keyboard.up('KeyX'); console.log('ásott',await st()); await p.screenshot({path:'/tmp/rig/k_dig2.png'});
 await b.close();
})();
