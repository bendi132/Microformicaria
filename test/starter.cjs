const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const sp=process.argv[2]||'ponera';
const p=await b.newPage({viewport:{width:1100,height:640}});p.setDefaultTimeout(250000);
p.on('pageerror',e=>console.log('err',e.message));
await p.addInitScript("localStorage.setItem('mf.settings',JSON.stringify({device:'desktop',intro:0,music:0,sfx:0,quality:'low',shadow:0,scale:0.8}))");
await p.goto('http://localhost:8080/index.html');
await p.waitForFunction("document.getElementById('loading').style.display==='none'");
await p.click('#bNew');
await p.evaluate(`(()=>{const el=document.getElementById('diffSel'); el.value='easy'; el.dispatchEvent(new Event('change'));})()`);
if(sp!=='ponera'){ await p.evaluate(`document.querySelector('#spList [data-id="${sp}"]').click()`); }
await p.click('#spStart');
await p.waitForFunction("window.__G&&window.__G.sim&&window.__G.mode==='game'");
await p.waitForTimeout(6000);
console.log(sp, await p.evaluate("(()=>{const s=__G.sim;return JSON.stringify({sp:s.speciesId,diff:s.difficulty,ants:s.ants.length,brood:s.brood.length,nv:__G.nestView})})()"));
await p.screenshot({path:`/tmp/rig/st_${sp}.png`});
await b.close();})();
