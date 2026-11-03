const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(200000);
 p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));p.on('console',m=>{if(m.type()==='error')console.log('c',m.text().slice(0,200))});
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.6,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:90000});
 await p.click('#bNew'); await p.click('#spList button:nth-child(2)'); await p.click('#spStart');
 await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 const [s,d,pi,yw,ty]=process.argv.slice(2).map(Number);
 await p.evaluate(`(()=>{const G=window.__G,sm=G.sim;const L=sm.world.limbs[0];const c=sm.world.cavities[${ty||1}];const ang=${yw||0};const T=window.__T=null;const up=G.cam.updateProjectionMatrix.bind(G.cam);G.follow=false;
 const th=c.th; G.cam.updateProjectionMatrix=function(){const nx=-Math.sin(th),nz=-Math.cos(th);const cx=L.base.x+nx*(L.r+${d||30}),cz=L.base.z+nz*(L.r+${d||30});G.cam.position.set(cx,c.s+${pi||2},cz);G.cam.lookAt(L.base.x+nx*L.r,c.s,L.base.z+nz*L.r);up();};})()`);
 await p.waitForTimeout(5000); await p.screenshot({path:'/tmp/rig/tree.png'});
 console.log(await p.evaluate("JSON.stringify(Object.keys(window.__G.orbit))"));
 await b.close();
})();
