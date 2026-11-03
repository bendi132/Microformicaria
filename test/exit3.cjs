const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(200000);
 p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.6,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:90000});
 await p.click('#bNew'); await p.click('#spList button:nth-child(1)'); await p.click('#spStart');
 await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 await p.evaluate("(()=>{const G=window.__G,s=G.sim;for(let i=0;i<600;i++)s.advance(0.1,1);const a=s.ants.find(a=>!a.dead&&a.loc==='nest');G.sel={kind:'ant',id:a.id};})()");
 await p.waitForTimeout(2500); const st=()=>p.evaluate("JSON.stringify({nv:window.__G.nestView,auto:window.__G.autoNestOn})");
 console.log('belül',await st()); await p.screenshot({path:'/tmp/rig/y_in.png'});
 await p.evaluate("(()=>{const G=window.__G,s=G.sim,a=s.ants.find(a=>a.id===G.sel.id),e=s.nest.nodes[0];a.loc='ground';a.x=e.x+3;a.z=e.z;a.node=null;a.nseg=null;a.task='idle';})()");
 await p.waitForTimeout(3500); console.log('kint',await st()); await p.screenshot({path:'/tmp/rig/y_out.png'});
 await b.close();
})();
