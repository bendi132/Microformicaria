const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(150000);
 p.on('console',m=>{if(m.type()==='error')console.log('console',m.text().slice(0,300))});p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.6,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:90000});
 await p.click('#bNew'); await p.click('#spList button:nth-child(' + (process.argv[2]||'1') + ')'); await p.click('#spStart');
 await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 await p.evaluate("(()=>{const s=window.__G.sim;for(let i=0;i<1500;i++)s.advance(0.1,1);})()");
 // ásási feladat: új kamra a bejárattól
 console.log(await p.evaluate("(()=>{const G=window.__G,s=G.sim;const e=s.nest.nodes[0];const r=s.addDig(s.nest.nodes[s.nest.nodes.length-1].id,{x:e.x+14,y:-9,z:e.z-6},'store');for(let i=0;i<500;i++)s.advance(0.1,1);return JSON.stringify({r:r&&r.error,nodes:s.nest.nodes.length,jobs:s.nest.jobs.map(j=>j.active),ants:s.ants.filter(a=>!a.dead).map(a=>[a.caste,a.task,a.st,a.loc])})})()"));
 await p.evaluate("(()=>{const G=window.__G;const q=G.sim.queen;G.sel={kind:'ant',id:q.id};})()");
 await p.keyboard.press('KeyF'); await p.waitForTimeout(800);
 await p.evaluate("(()=>{const s=window.__G.sim,q=s.controlTarget();q.loc='nest';q.node=s.nest.nodes[s.nest.nodes.length-1].id;q.nseg=null;q.path=null;})()"); await p.waitForTimeout(3000); await p.screenshot({path:'/tmp/t_top.png'});
 const dir=await p.evaluate("(()=>{const s=window.__G.sim,n=s.nest;const e=n.nodes[0],m=n.nodes[1];return [m.x-e.x,m.z-e.z]})()"); const key=Math.abs(dir[0])>Math.abs(dir[1])?(dir[0]>0?'KeyD':'KeyA'):(dir[1]>0?'KeyS':'KeyW'); console.log('irány',dir,key);
 await p.keyboard.down(key); await p.waitForTimeout(4000); await p.keyboard.up(key); await p.screenshot({path:'/tmp/t_top2.png'});
 console.log(await p.evaluate("new Promise(r=>{let n=0;const t0=performance.now();const f=()=>{n++;if(performance.now()-t0<3000)requestAnimationFrame(f);else r('frames/3s '+n+' op '+window.__G.view.terrainMat.opacity+' trans '+window.__G.view.terrainMat.transparent)};requestAnimationFrame(f)})"));
 console.log(await p.evaluate("JSON.stringify({op:window.__G.view.terrainMat.opacity,fg:window.__G.view.farGround.visible,nv:window.__G.view._nv,ng:window.__G.layer.nestGroup.visible,nc:window.__G.layer.nestGroup.children.length,cam:window.__G.cam.position.toArray(),fpv:window.__G.fpv,top:window.__G.topNest,loc:window.__G.sim.controlTarget()&&window.__G.sim.controlTarget().loc})"));
 await b.close();
})();
