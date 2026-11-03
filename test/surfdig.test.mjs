// Felszíni ásás (X): új akna + kijárat; a föld alatt továbbásva összekapcsolódik a fészekkel; a kijáratnál ki lehet jönni.
import { Sim } from '../src/sim/sim.js';
import { heightAt } from '../src/sim/world.js';
for (const sp of ['ponera', 'odonto', 'proceratium']) {
  const s = new Sim({ species: sp, seed: 321, difficulty: 'normal' });
  for (let i = 0; i < 300; i++) s.step(0.1);
  const a = s.queen; s.possess(a.id); a.loc = 'ground'; a.node = null; a.nseg = null; const e = s.nest.nodes[0];
  a.x = e.x + 22; a.z = e.z + 2; a.yaw = 0; const n0 = s.nest.nodes.length;
  let t = 0; for (; t < 200 && a.loc === 'ground'; t++) { s.input.digSurf = true; s.step(0.1); }
  s.input.digSurf = false; console.log(sp, 'ásás lépés', t, 'csomópont', n0, '→', s.nest.nodes.length, 'loc', a.loc, 'exit', s.nest.nodes.filter((q) => q.kind === 'exit').length, 'pellet', (s.world.pellets || []).length);
  // továbbásás a fészek felé (LMB = dig) – a bejárat felé fordulva
  const sh = s.nest.nodes.find((q) => q.id === a.node); const toE = Math.atan2(e.x - sh.x, e.z - sh.z); a.yaw = toE;
  let con = false; for (let i = 0; i < 1500 && !con; i++) { s.input.dig = true; s.step(0.1); con = s.nest.edges.some((q) => { const A = s.nest.nodes.find((z) => z.id === q.a), B = s.nest.nodes.find((z) => z.id === q.b); return A && B && ((A.kind === 'tunnel' && B.id === s.nest.entranceId) || (B.kind === 'tunnel' && A.id === s.nest.entranceId)) && q.a > 3 && q.b > 3; }) || s.nest.edges.length > n0 + 12; if (a.loc !== 'nest') break; }
  s.input.dig = false; console.log('  csomópont', s.nest.nodes.length, 'élek', s.nest.edges.length, 'loc', a.loc);
  // kijárat: vissza az aknához és ki
  const ex = s.nest.nodes.find((q) => q.kind === 'exit'); const path = (s.nest.nodes.find((q) => q.kind === 'tunnel' && q.x === ex.x && q.z === ex.z) || {}).id;
  a.node = ex.id; a.nseg = null; a.loc = 'nest'; for (let i = 0; i < 80 && a.loc === 'nest'; i++) { s.input.use = true; s.step(0.1); s.input.use = false; }
  console.log('  kijött', a.loc, 'x', a.x.toFixed(2), 'exit x', ex.x.toFixed(2));
}
