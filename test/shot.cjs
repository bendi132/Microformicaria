const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:1200,height:700}});
p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('console',m.type(),m.text().slice(0,400))});p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,400)));
const url=process.argv[2],out=process.argv[3];await p.goto(url);await p.waitForFunction('window.DONE',null,{timeout:60000});await p.screenshot({path:out});await b.close()})();
