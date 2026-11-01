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
 console.log(await p.evaluate("(()=>{const G=window.__G,s=G.sim;for(let i=0;i<1200;i++)s.advance(0.1,1);const e=s.nest.nodes[0];const last=s.nest.nodes[s.nest.nodes.length-1];const r=s.addDig(last.id,{x:e.x+16,y:-9,z:e.z-4},'store');const q=s.queen;q.task='dig';q.st='';let it=0;for(;it<700;it++){if(q.task!=='dig'){q.task='dig';q.st='';q.decide=999;}s.advance(0.1,1);}while(!(q.st==='work'&&q.loc==='nest')&&it<2000){if(q.task!=='dig'){q.task='dig';q.st='';q.decide=999;}s.advance(0.1,1);it++;}G.sel={kind:'ant',id:q.id};const f=s.nest.nodes.find(n=>n.id===s.nest.jobs.find(j=>j.active).cur);G.orbit.x=f.x;G.orbit.z=f.z;G.orbit.dist=18;G.orbit.pitch=1.3;G.follow=false;return JSON.stringify({it,st:q.st,loc:q.loc,nodes:s.nest.nodes.length,act:q.anim.act})})()"));
 await p.waitForTimeout(3500); await p.screenshot({path:'/tmp/t_dig.png'});
 await b.close();
})();
