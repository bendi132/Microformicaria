const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:960,height:600}});p.setDefaultTimeout(200000);
 p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,300)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.6,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'");
 await p.evaluate("window.__startGame({species:'ponera',difficulty:'easy'})");
 await p.waitForFunction("window.__G.sim&&window.__G.layer&&window.__G.env&&document.getElementById('loading').style.display==='none'");
 await p.waitForTimeout(2000);
 // jelenet előkészítése: egy ászka a hangya közelében, a hangya támadó állapotban
 const info = await p.evaluate(`(()=>{
   const G=window.__G, sim=G.sim; G.paused=true;
   const q=sim.ants.find(a=>a.caste!=='queen'&&!a.dead)||sim.ants[0];
   let p0=sim.isopods[0]; if(!p0){ return {err:'nincs ászka'}; }
   p0.state='forage'; p0.cover=null; p0.hp=p0.maxHp; p0.para=0; p0.alert=0;
   p0.len=3.1; p0.maxHp=p0.hp=8; p0.armor=0; p0.x=q.x+3.2; p0.z=q.z; p0.yaw=q.yaw;
   q.loc='ground'; q.task='hunt'; q.st='approach'; q.target={kind:'isopod',id:p0.id}; q.cd=0; q.hp=q.maxHp; q.energy=80; q.anim.open=0.3;
   G.sel={kind:'ant',id:q.id}; sim.rng.chance=()=>true;
   G.orbit.x=(q.x+p0.x)/2; G.orbit.z=(q.z+p0.z)/2; G.orbit.dist=22; G.orbit.pitch=0.55; G.orbit.yaw=0.9;
   return {ant:q.id,iso:p0.id,len:p0.len,antLen:q.len,d:Math.hypot(q.x-p0.x,q.z-p0.z)};
 })()`);
 console.log(JSON.stringify(info));
 await p.waitForTimeout(1200);
 await p.screenshot({path:'/tmp/strike_0.png'});
 // léptetés: 0.1 mp-es lépések, minden 6. lépésnél logolunk
 for(let k=1;k<=30;k++){
   const st = await p.evaluate(`(()=>{const G=window.__G,sim=G.sim;for(let i=0;i<6;i++)sim.step(0.1);
     const q=sim.ants.find(a=>a.id===${'G.sel.id'});const p0=sim.isopods.find(x=>true);
     return {t:sim.t.toFixed(1),st:q?q.st:null,act:q?q.anim.act.toFixed(2):null,open:q?q.anim.open.toFixed(2):null,para:p0?(p0.para||0).toFixed(2):null,hp:p0?p0.hp.toFixed(1):null,dead:p0?p0.dead:null,stats:sim.stats||{}};})()`);
   console.log(k, JSON.stringify(st));
   if([1,3,8,14].includes(k)){ await p.waitForTimeout(700); await p.screenshot({path:`/tmp/strike_${k}.png`}); }
 }
 await b.close();
})();
