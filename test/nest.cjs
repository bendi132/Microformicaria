const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(150000);
 p.on('console',m=>{if(['error'].includes(m.type()))console.log('console',m.type(),m.text().slice(0,300))});p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.6,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:90000});
 await p.click('#bNew'); await p.click('#spList button:nth-child(' + (process.argv[2]||'1') + ')'); await p.click('#spStart');
 await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 // sim előretekerése (renderelés nélkül)
 await p.evaluate("(()=>{const s=window.__G.sim;for(let i=0;i<"+(+process.argv[3]||4000)+";i++)s.advance(0.1,1);})()");
 console.log(await p.evaluate("(()=>{const s=window.__G.sim;return JSON.stringify({day:s.env.day,ants:s.ants.filter(a=>!a.dead).length,brood:s.brood.length,stages:['egg','larva','pupa'].map(k=>s.brood.filter(x=>x.stage===k).length),nodes:s.nest.nodes.length})})()"));
 await p.evaluate("(()=>{const s=window.__G.sim;const ch=s.nest.nodes.filter(n=>n.kind==='chamber')[0];const proto=s.brood[0]||{};const mk=(stage,prog,i)=>Object.assign({},proto,{stage,prog,fed:0.8,node:ch.id,ox:Math.cos(i*1.3)*(0.2+0.12*i),oz:Math.sin(i*1.3)*(0.2+0.12*i),carried:false});let i=0;for(const [st,pr] of [['egg',0.3],['egg',0.5],['larva',0.2],['larva',0.6],['larva',0.95],['pupa',0.2],['pupa',0.6],['pupa',0.9]]){s.brood.push(mk(st,pr,i++));}})()");
 console.log(await p.evaluate("JSON.stringify(window.__G.sim.nest.nodes.map(n=>({id:n.id,k:n.kind,role:n.role,x:+n.x.toFixed(1),y:+n.y.toFixed(1),z:+n.z.toFixed(1),r:+n.r.toFixed(1),ready:n.ready})))"));
 await p.evaluate("(()=>{const G=window.__G;const cs=G.sim.nest.nodes.filter(n=>n.kind==='chamber');const cnt=n=>G.sim.brood.filter(b=>b.node===n.id).length;cs.sort((a,b)=>cnt(b)-cnt(a));const ch=cs[0]||G.sim.nest.nodes[1];G.orbit.x=ch.x;G.orbit.z=ch.z;G.orbit.dist=14;G.orbit.pitch=1.25;G.orbit.y=-6;G.follow=false;if(!G.nestView)document.getElementById('bNestV').click();})()");
 await p.waitForTimeout(3500); await p.screenshot({path:'/tmp/n_view.png'});
 await p.evaluate("(()=>{const G=window.__G;G.orbit.dist=7;G.orbit.pitch=1.0;})()"); await p.waitForTimeout(2500); await p.screenshot({path:'/tmp/n_close.png'});
 console.log(await p.evaluate("(()=>{const L=window.__G.layer;const g=L.nLarva.geometry;const n=g.attributes.normal;return JSON.stringify({attrs:Object.keys(g.attributes),n0:[n.getX(5),n.getY(5),n.getZ(5)],idx:!!g.index,col:L.nLarva.instanceColor&&Array.from(L.nLarva.instanceColor.array.slice(0,6)),cast:L.nLarva.castShadow,mat:L.nLarva.material.type,ec:L.nPupa.instanceColor&&Array.from(L.nPupa.instanceColor.array.slice(0,3))})})()"));
 await p.evaluate("window.__G.layer.antB.mesh.visible=false;window.__G.layer.nestGroup.children.forEach(c=>{if(c.geometry.type==='SphereGeometry')0})"); await p.waitForTimeout(1500); await p.screenshot({path:'/tmp/n_noant.png'});
 console.log(await p.evaluate("(()=>{const G=window.__G,L=G.layer;return JSON.stringify({vis:L.nestGroup.visible,ch:L.nestGroup.children.length,cam:G.cam.position.toArray().map(v=>+v.toFixed(1)),orb:G.orbit,nestView:G.nestView,op:G.view.terrainMat.opacity,brood:L.broodMeshes.map(m=>[m.visible,m.count]),kids:L.nestGroup.children.map(c=>[c.geometry.type,c.position.toArray().map(v=>+v.toFixed(1)),c.scale.toArray().map(v=>+v.toFixed(1))]),grp:L.nestGroup.parent&&L.nestGroup.parent.type,sc:L.group.parent&&L.group.parent.type,tv:G.view.terrain.visible})})()"));
 await b.close();
})();
