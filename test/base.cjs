const {chromium}=require('playwright');
(async()=>{
 const sp=process.argv[2]||'1', tag=process.argv[3]||'base';
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(280000);
 p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'high',shadow:1,scale:1,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:90000});
 await p.click('#bNew'); await p.click('#spList button:nth-child('+sp+')'); await p.click('#spStart');
 await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:200000});
 await p.evaluate(`(()=>{const G=window.__G,s=G.sim;for(let i=0;i<${process.argv[4]||6000};i++)s.step(0.1);G.sel={kind:'ant',id:s.queen.id};G.follow=false;const n=s.nest;const e=n.nodes[1];G.orbit.x=e.x;G.orbit.z=e.z;G.orbit.dist=40;G.orbit.pitch=1.0;G.nestView=true;G.autoNestOn=false;document.getElementById('bNestV').classList.add('on');})()`);
 await p.waitForTimeout(9000); await p.screenshot({path:'/tmp/rig/'+tag+'_nest.png'});
 await p.evaluate(`(()=>{const G=window.__G,s=G.sim;G.nestView=false;const n=s.nest;const e=n.nodes[0];G.orbit.x=e.x;G.orbit.z=e.z;G.orbit.dist=30;G.orbit.pitch=0.5;G.orbit.yaw=0.6;})()`);
 await p.waitForTimeout(9000); await p.screenshot({path:'/tmp/rig/'+tag+'_surf.png'});
 await b.close();
})();
