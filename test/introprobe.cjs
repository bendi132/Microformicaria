const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:960,height:540}});
p.on('pageerror',e=>console.log('err',e.message));p.on('console',m=>{if(m.type()==='error')console.log('c',m.text())});
await p.goto('http://localhost:8080/test/introprobe.html');const t0=Date.now();
for(const t of [3.0,4.6,5.4,8.6,9.6,12.2,14.0,15.6]){await p.waitForTimeout(Math.max(0,t*1000-(Date.now()-t0)));await p.screenshot({path:`/tmp/rig/n_${t}.png`});}
await p.waitForFunction('window.done',null,{timeout:30000});console.log('done');await b.close();})();
