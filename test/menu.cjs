const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1280,height:720}});p.setDefaultTimeout(120000);
 p.on('console',m=>{if(['error'].includes(m.type()))console.log('console',m.type(),m.text().slice(0,300))});p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,500)));
 await p.addInitScript(()=>{localStorage.setItem('mf.settings',JSON.stringify({quality:'low',shadow:0,scale:0.6,sens:1,inv:0,auto:0}));});
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 await p.waitForTimeout(6000); await p.screenshot({path:'/tmp/rig/m_title.png'});
 await p.click('#bNew');
 for (const i of (process.argv[2]||'1,2').split(',')) { await p.click('#spList button:nth-child('+i+')'); await p.waitForTimeout(5000); await p.screenshot({path:'/tmp/rig/m_sp'+i+'.png'}); }
 await b.close();
})();
