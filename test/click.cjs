const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1000,height:600}});p.setDefaultTimeout(200000);
 p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.5,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:90000});
 await p.click('#bNew'); await p.click('#spList button:nth-child(1)'); await p.click('#spStart');
 await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 const pos=await p.evaluate(async()=>{const T=await import('three');const G=window.__G,s=G.sim;for(let i=0;i<300;i++)s.step(0.1);
  const a=s.queen;G.sel={kind:'ant',id:a.id};G.follow=false;const q=s.springtails.find(x=>!x.dead);
  // kamera a hangya fölé, a ugróvillát a képernyőre hozzuk
  q.x=a.x+6;q.z=a.z+3;q.vx=0;q.vz=0;q.state=q.state;G.orbit.x=a.x+3;G.orbit.z=a.z+1.5;G.orbit.dist=30;G.orbit.pitch=1.2;window.__q=q;return {qx:q.x,qz:q.z};});
 await p.waitForTimeout(6000);
 const sc=await p.evaluate(async()=>{const T=await import('three');const G=window.__G,q=window.__q;const v=new T.Vector3(q.x,q.len*0.2+(G.sim.world?0:0),q.z);v.y=(window.__hy?0:0);const {heightAt}=await import('/src/sim/world.js');v.y=heightAt(G.sim.world,q.x,q.z)+q.len*0.2;G.cam.updateMatrixWorld(true);v.project(G.cam);return {x:(v.x*0.5+0.5)*innerWidth,y:(-v.y*0.5+0.5)*innerHeight,z:v.z};});
 console.log('screen',sc);
 await p.keyboard.press('KeyP');await p.mouse.click(sc.x,sc.y);await p.waitForTimeout(500);
 console.log(await p.evaluate("JSON.stringify({task:window.__G.sim.queen.task,st:window.__G.sim.queen.st,tg:window.__G.sim.queen.target})"));
 // X gomb-hint: irányítás + kattintás
 await p.evaluate("(()=>{const G=window.__G;G.sel={kind:'ant',id:G.sim.queen.id};})()");
 await p.keyboard.press('KeyX'); await p.waitForTimeout(800);
 console.log('fpv',await p.evaluate("window.__G.fpv+' '+window.__G.sim.input.digSurf+' '+window.__G.sim.queen.task"));
 await p.keyboard.press('Escape');
 await p.evaluate("window.__G.sim.input.digSurf=false");
 await p.dispatchEvent('.key[data-k=X]','pointerdown');await p.waitForTimeout(300);
 console.log('hint X digSurf',await p.evaluate("window.__G.sim.input.digSurf"));
 await b.close();
})();
