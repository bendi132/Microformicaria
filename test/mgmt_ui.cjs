// Vezetői felület füstteszt (Playwright, swiftshader): panel, fülek, döntéskártya, napi jelentés-kártya. Képernyőképek: SHOT_DIR (alapból /tmp/mgshots).
const { chromium } = require('playwright');
const fs = require('fs'); const DIR = process.env.SHOT_DIR || '/tmp/mgshots'; fs.mkdirSync(DIR, { recursive: true });
const URL = process.env.URL || 'http://localhost:8765/index.html';
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, vp, mobile] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 915, height: 412 }, true]]) {
    if (process.env.ONLY && process.env.ONLY !== name) continue;
    const ctx = await b.newContext({ viewport: vp, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    await p.addInitScript((mob) => { try { localStorage.setItem('mf.settings', JSON.stringify({ device: mob ? 'phone' : 'desktop', intro: 0, music: 0, sfx: 0, auto: 0, quality: 'low', shadow: 0, scale: 0.6 })); localStorage.setItem('microformicaria.progress.v1', JSON.stringify({ xp: 0, preyKills: 0, foundings: 0, seenHelp: true })); } catch {} }, mobile);
    await p.goto(URL); await p.waitForFunction('window.__startGame', null, { timeout: 90000 });
    await p.evaluate(() => window.__startGame({ species: 'ponera', difficulty: 'easy' }));
    await p.waitForFunction('window.__G && window.__G.mode === "game"', null, { timeout: 90000 }); await p.waitForTimeout(2500);
    // 3 nap felgyorsítva, hogy legyenek jelentések és minták
    await p.evaluate(() => { const s = window.__G.sim; for (let i = 0; i < 4600; i++) s.step(0.1); });
    await p.waitForTimeout(800);
    const info = await p.evaluate(() => { const mg = window.__G.sim.colony.mg; return { reports: mg.reports.length, samples: mg.samples.length, ev: mg.ev && mg.ev.id, workers: window.__G.sim.ants.filter((a) => !a.dead && a.caste !== 'queen').length }; });
    console.log(name, JSON.stringify(info)); ok(info.reports >= 2 && info.samples > 5, name + ': jelentés és minták');
    // a napi jelentés-kártya (a HUD ritkán frissül: várjunk egy kicsit)
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${DIR}/${name}_1_hud.png`, timeout: 120000 }).catch((e) => console.log('shot timeout', e.message.slice(0, 60)));
    // kikényszerített esemény → döntéskártya
    await p.evaluate(() => { const s = window.__G.sim, mg = s.colony.mg; mg.nextEv = 1e9; mg.ev = { id: 'raid', phase: 'ask', t0: s.t, deadline: s.t + 90, text: 'Egy közepes pók kószál a bejárat közelében (kb. 4 cm-re). A felszíni dolgozók veszélyben vannak.', data: {}, opt: null }; mg.asked = (mg.asked || 0) + 1; });
    await p.waitForFunction(() => getComputedStyle(document.getElementById('evcard')).display !== 'none', null, { timeout: 20000 }).catch(() => {});
    ok(await p.evaluate(() => getComputedStyle(document.getElementById('evcard')).display !== 'none'), name + ': döntéskártya látszik');
    ok(await p.evaluate(() => document.getElementById('bMgmt').classList.contains('alert')), name + ': 📋 gomb jelez');
    await p.screenshot({ path: `${DIR}/${name}_2_event.png`, timeout: 120000 }).catch(() => {});
    await p.evaluate(() => document.querySelector('#evcard .ev-o button[data-id="guard"]').click()); await p.waitForTimeout(500);
    const after = await p.evaluate(() => { const mg = window.__G.sim.colony.mg; return { phase: mg.ev && mg.ev.phase, mods: mg.mods.map((m) => m.k) }; });
    ok(after.phase === 'run' && after.mods.includes('guard'), name + ': választás után módosító aktív ' + JSON.stringify(after));
    ok(await p.evaluate(() => getComputedStyle(document.getElementById('evcard')).display === 'none'), name + ': kártya eltűnik választás után');
    // panel: M billentyű, három fül
    await p.keyboard.press('KeyM'); await p.waitForTimeout(700);
    ok(await p.evaluate(() => document.getElementById('mgmt').classList.contains('on')), name + ': M megnyitja a panelt');
    const rows = await p.evaluate(() => document.querySelectorAll('#mgRows .prow').length); ok(rows >= 5, name + ': prioritás-sorok ' + rows);
    await p.screenshot({ path: `${DIR}/${name}_3_labor.png`, timeout: 120000 }).catch(() => {});
    // csúszka állítása → irányelv "egyéni"
    await p.evaluate(() => { const el = document.querySelector('#mgRows input[data-k="water"]'); el.value = 1.6; el.dispatchEvent(new Event('input', { bubbles: true })); });
    ok(await p.evaluate(() => window.__G.sim.colony.dir.water === 1.6 && window.__G.sim.colony.mg.policy === 'custom'), name + ': csúszka → dir.water, irányelv egyéni');
    await p.click('#mgPols button[data-id="harvest"]'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => window.__G.sim.colony.dir.hunt === 1.7 && window.__G.sim.colony.mg.policy === 'harvest' && Math.abs(+document.querySelector('#mgRows input[data-k="hunt"]').value - 1.7) < 1e-6), name + ': irányelv-gomb beállítja a csúszkákat');
    await p.click('.mg-tabs button[data-t="stock"]'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.querySelectorAll('#mgStores .srow').length >= 3 && document.querySelectorAll('#mgStores svg.spk polyline').length >= 1), name + ': készlet-sorok és trend-grafikon');
    await p.screenshot({ path: `${DIR}/${name}_4_stock.png`, timeout: 120000 }).catch(() => {});
    await p.click('.mg-tabs button[data-t="rep"]'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.querySelectorAll('#mgRep .tips li').length >= 1 && /nap jelentése/.test(document.getElementById('mgRep').textContent)), name + ': jelentés és tanácsok');
    await p.screenshot({ path: `${DIR}/${name}_5_report.png`, timeout: 120000 }).catch(() => {});
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => !document.getElementById('mgmt').classList.contains('on')), name + ': Esc bezárja a panelt');
    // a kiértékelés toast-ot ad
    await p.evaluate(() => { const s = window.__G.sim; for (let i = 0; i < 1600; i++) s.step(0.1); });
    await p.waitForFunction(() => { const t = document.getElementById('toast'); return t.style.display !== 'none' && /Pók közelít/.test(t.textContent); }, null, { timeout: 20000 }).catch(() => {});   // lassú (szoftveres) renderelésnél ritkább a HUD-frissítés
    const toast = await p.evaluate(() => { const t = document.getElementById('toast'); return t.style.display !== 'none' ? t.textContent : ''; });
    ok(/Pók közelít/.test(toast), name + ': kiértékelés-üzenet: ' + toast.slice(0, 80));
    ok(errs.length === 0, name + ': nincs oldalhiba ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.log('SCRIPT ERROR', e.message); process.exit(1); });
