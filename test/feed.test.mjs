// Evés: a játékos hangyája a tetem mellett E-vel kiszívja; a hangya a tetem felé fordul, a szája a testen van; animáció: act = 4.
import { Sim } from '../src/sim/sim.js';
import { makeIsopod, makeSpider } from '../src/sim/entities.js';
for (const sp of ['ponera', 'odonto', 'proceratium']) {
  const s = new Sim({ species: sp, seed: 321, difficulty: 'normal' });
  for (let i = 0; i < 200; i++) s.step(0.1);
  const a = s.queen; s.possess(a.id); a.loc = 'ground'; a.x = 10; a.z = 10; a.yaw = 0; a.energy = 40; a.node = null; a.nseg = null;
  const p = makeIsopod(s, 'small', 10.5, 14, false); p.dead = true; p.state = 'dead'; p.fresh = 1; s.isopods.push(p); const f0 = p.foodLeft;
  for (let i = 0; i < 60; i++) { s.input.use = true; s.input.useHold = true; s.step(0.1); }
  const d = Math.hypot(a.x - p.x, a.z - p.z);
  console.log(sp, 'act', a.anim.act, 'feedS', (a.anim.feedS || 0).toFixed(2), 'táv', d.toFixed(2), 'a.len', a.len, 'p.len', p.len.toFixed(2), 'foodLeft', f0.toFixed(2), '→', p.foodLeft.toFixed(2), 'energy', a.energy.toFixed(1), 'yaw→cél', Math.abs(a.yaw - Math.atan2(p.x - a.x, p.z - a.z)).toFixed(2));
  s.input.use = false; s.input.useHold = false; for (let i = 0; i < 20; i++) s.step(0.1); console.log('  után act', a.anim.act);
}
