const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(200000);
 p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.6,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:90000});
 await p.click('#bNew'); await p.click('#spList button:nth-child(' + (process.argv[2]||'1') + ')'); await p.click('#spStart');
 await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 const kind=process.argv[3]||'isopod';
 await p.evaluate(`(()=>{const G=window.__G,s=G.sim;for(let i=0;i<300;i++)s.advance(0.1,1);const a=s.queen;G.sel={kind:'ant',id:a.id};s.possess(a.id);const e0=s.nest.nodes[0];a.loc='ground';a.node=null;a.nseg=null;a.path=null;a.x=e0.x+14;a.z=e0.z+6;a.yaw=0.3;a.noEnterUntil=s.t+99;a.energy=30;
  const L=s['${kind}s']||s.isopods;const q=L.find(x=>!x.dead)||L[0];q.dead=true;q.state='dead';q.fresh=1;q.x=a.x+Math.sin(a.yaw)*6;q.z=a.z+Math.cos(a.yaw)*6;q.yaw=1;q.hidden=false;
  G.fpv=false;G.orbit.x=a.x+Math.sin(a.yaw)*3;G.orbit.z=a.z+Math.cos(a.yaw)*3;G.orbit.dist=${process.argv[4]||10};G.orbit.pitch=0.55;G.orbit.yaw=2.2;G.follow=false;s.input.useHold=true;s.input.use=true;})()`);
 await p.waitForTimeout(6000); await p.screenshot({path:'/tmp/rig/e_'+kind+'.png'});
 console.log(await p.evaluate("JSON.stringify({act:window.__G.sim.controlTarget().anim.act})"));
 await b.close();
})();
