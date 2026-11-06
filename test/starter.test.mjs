import { Sim } from '../src/sim/sim.js';
import { chambers } from '../src/sim/nest.js';
import { heightAt } from '../src/sim/world.js';
import { DAY } from '../src/sim/config.js';
let bad = 0;
for (const sp of ['ponera', 'cephalotes', 'odonto', 'proceratium']) for (const seed of [1, 2, 3, 4, 5, 6]) {
  const s = new Sim({ species: sp, difficulty: 'easy', seed });
  const n = s.nest, ch = n.nodes.filter((q) => q.kind === 'chamber');
  const w = s.ants.filter((a) => a.caste !== 'queen').length;
  const cnt = (st) => s.brood.filter((b) => b.stage === st).length;
  // átfedés, föld alatt, összefüggőség
  let ov = 0; for (let i = 0; i < ch.length; i++) for (let j = i + 1; j < ch.length; j++) { const d = Math.hypot(ch[i].x - ch[j].x, ch[i].y - ch[j].y, ch[i].z - ch[j].z); if (d < ch[i].r + ch[j].r) ov++; }
  let above = 0; if (n.speciesId !== 'cephalotes') for (const nd of n.nodes) if (nd.kind !== 'entrance' && nd.y > heightAt(s.world, nd.x, nd.z) - 1.4) above++;
  const seen = new Set([n.entranceId]); const q = [n.entranceId]; while (q.length) { const c = q.shift(); for (const e of n.edges) { const o = e.a === c ? e.b : e.b === c ? e.a : 0; if (o && !seen.has(o)) { seen.add(o); q.push(o); } } }
  const conn = n.nodes.every((nd) => seen.has(nd.id));
  const ok = w === 5 && cnt('egg') === 4 && cnt('larva') === 4 && cnt('pupa') === 3 && !ov && !above && conn && s.queen.loc === 'nest' && ch.length >= 3;
  if (!ok || seed === 1) console.log(sp, seed, 'dolgozó', w, 'pete/lárva/báb', cnt('egg'), cnt('larva'), cnt('pupa'), 'kamra', ch.length, 'átfedés', ov, 'föld felett', above, 'összefüggő', conn, ok ? 'OK' : 'HIBA');
  if (!ok) bad++;
}
// 12 nap futtatás: nem omolhat össze, nem lehet kivétel
for (const sp of ['ponera', 'cephalotes', 'odonto', 'proceratium']) {
  const s = new Sim({ species: sp, difficulty: 'easy', seed: 11 }); const t0 = Date.now();
  for (let i = 0; i < 20000 && s.t < 12 * DAY; i++) { s.advance(0.25, 4); if (s.over) break; }
  console.log(sp, 'nap', (s.t / DAY).toFixed(1), 'él', !s.queenDead, 'dolgozó', s.ants.filter((a) => !a.dead && a.caste !== 'queen').length, 'fiasítás', s.brood.length, 'kamra', s.nest.nodes.filter((q) => q.kind === 'chamber').length, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
console.log(bad ? 'HIBÁK: ' + bad : 'MINDEN OK'); process.exit(bad ? 1 : 0);
