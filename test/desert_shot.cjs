const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1280,height:760}});
p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('console',m.type(),m.text().slice(0,300))});p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,400)));
await p.goto('http://localhost:8765/index.html'); await p.waitForFunction('window.__startGame',null,{timeout:60000});
const sp=process.argv[2]||'messor', out=process.argv[3]||'desert.png', wait=+(process.argv[4]||12000);
await p.evaluate((sp)=>window.__startGame({species:sp,difficulty:'normal'}), sp); await p.evaluate(()=>{const b=document.querySelector('#device [data-dev="pc"]')||document.querySelector('#device [data-dev]'); if(b) b.click();});
await p.waitForTimeout(wait); await p.screenshot({path:out}); await b.close();})();
