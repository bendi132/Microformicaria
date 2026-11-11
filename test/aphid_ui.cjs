// Levéltetű- és atka-megjelenítés füstteszt (Playwright, swiftshader). Képek: SHOT_DIR.
const { chromium } = require('playwright'); const fs = require('fs'); const DIR = process.env.SHOT_DIR || '/tmp/aphshots'; fs.mkdirSync(DIR, { recursive: true });
const URL = process.env.URL || 'http://localhost:8765/index.html';
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 480 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.addInitScript(() => { try { localStorage.setItem('mf.settings', JSON.stringify({ device: 'desktop', intro: 0, music: 0, sfx: 0, auto: 0, quality: 'low', shadow: 0 })); } catch (e) {} });
  await p.goto(URL); await p.waitForFunction('window.__startGame', null, { timeout: 90000 });
  await p.evaluate(() => window.__startGame({ species: 'ponera', difficulty: 'easy', seed: 11 }).catch?.(() => {})).catch(() => {});
  await p.waitForFunction('window.__G && window.__G.mode === "game"', null, { timeout: 90000 }); await p.waitForTimeout(2000);
  await p.evaluate(() => { const s = window.__G.sim; for (let i = 0; i < 1500; i++) s.step(0.1); });
  await p.evaluate(() => { const G = window.__G; G.sel = null; });
  // atkák a fészekben
  await p.evaluate(() => { const s = window.__G.sim, mg = s.colony.mg; mg.nextEv = 1e9; mg.ev = { id: 'mites', phase: 'ask', t0: s.t, deadline: s.t + 99, text: '', data: {}, opt: null }; });
  await p.keyboard.press('KeyN'); await p.waitForFunction(() => window.__G.layer.miteLayer.items.length > 0, null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${DIR}/3_nest_mites.png`, timeout: 170000 }).catch(() => {});
  await p.evaluate(() => document.querySelector('#evcard .ev-o button[data-id="wait"]').click()).catch(() => {}); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${DIR}/4_nest_mites_run.png`, timeout: 170000 }).catch(() => {});
  const m = await p.evaluate(() => { const L = window.__G.layer.miteLayer; return { items: L.items.length, vis: L.group.visible, failed: !!L.failed }; });
  console.log(JSON.stringify(m)); ok(m.items > 0 && m.vis && !m.failed, 'atkák betöltve és látszanak');
  console.log('hibák:', errs.length, errs.slice(0, 5)); await b.close();
})();
