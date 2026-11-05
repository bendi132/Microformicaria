const {chromium}=require('playwright');
(async()=>{
 const [w,h,tag,mode]=[+process.argv[2]||844,+process.argv[3]||390,process.argv[4]||'m',process.argv[5]||'all'];
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-angle=swiftshader']});
 const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const p=await ctx.newPage();p.setDefaultTimeout(280000);
 p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,400)));
 await p.goto('http://localhost:8080/index.html');
 await p.waitForFunction("document.getElementById('loading').style.display==='none'",null,{timeout:120000});
 console.log('touch class',await p.evaluate("document.body.className"), 'quality', await p.evaluate("localStorage.getItem('mf.settings')"));
 await p.waitForTimeout(2500); await p.screenshot({path:`/tmp/rig/${tag}_title.png`});
 await p.tap('#bNew'); await p.waitForTimeout(2500); await p.screenshot({path:`/tmp/rig/${tag}_species.png`});
 await p.tap('#spList button:nth-child(1)'); await p.tap('#spStart');
 await p.waitForFunction("window.__G.sim&&document.getElementById('loading').style.display==='none'",null,{timeout:200000});
 await p.evaluate(`(()=>{const G=window.__G,s=G.sim;for(let i=0;i<2500;i++)s.step(0.1);G.sel={kind:'ant',id:s.queen.id};})()`);
 await p.waitForTimeout(6000); await p.screenshot({path:`/tmp/rig/${tag}_hud.png`});
 if(mode==='all'){
  // érintős FPV: dupla koppintás helyett a gomb
  await p.tap('#bPoss'); await p.waitForTimeout(4000);
  console.log('fpv',await p.evaluate("window.__G.fpv"));
  // joystick: ujj lent bal oldalon, húzás
  await p.evaluate(`(()=>{const c=document.getElementById('gl');const mk=(t,x,y,id)=>c.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,isPrimary:id===1}));window.__mk=mk;mk('pointerdown',120,${h-100},1);mk('pointermove',120,${h-150},1);})()`);
  await p.waitForTimeout(1500);
  console.log('joy',await p.evaluate("JSON.stringify(window.__G.joy)+' fwd '+window.__G.sim.input.fwd"));
  await p.screenshot({path:`/tmp/rig/${tag}_fpv.png`});
  await p.evaluate("window.__mk('pointerup',120,200,1)");
  await p.evaluate(`window.__mk('pointerdown',${w-250},150,2);window.__mk('pointermove',${w-200},150,2);`);
  console.log('yawD',await p.evaluate("window.__G.sim.input.yawD"));
  await p.evaluate(`window.__mk('pointerup',${w-200},150,2)`);
  // gombok: E lenyomása
  await p.dispatchEvent('.key[data-k=E]','pointerdown'); console.log('E use',await p.evaluate("window.__G.sim.input.use")); await p.dispatchEvent('.key[data-k=E]','pointerup');
  await p.dispatchEvent('.key[data-k=Q]','pointerdown'); await p.waitForTimeout(500); console.log('after Q fpv',await p.evaluate("window.__G.fpv"));
 }
 await b.close();
})();
