// Mozgás a fészekben (felülnézeti irányítás): bármelyik irányból lemegy az aknán, vissza a bejárathoz, természetes kijövetel; fúrás.
import { Sim } from '../src/sim/sim.js';
for (const sp of ['ponera', 'odonto', 'proceratium', 'cephalotes']) {
  const s = new Sim({ species: sp, seed: 777, difficulty: 'normal' }); for (let i = 0; i < 400; i++) s.step(0.1);
  const q = s.queen, n = s.nest; s.possess(q.id); q.loc = 'nest'; q.node = n.entranceId; q.nseg = null; q.path = null;
  const nb = n.nodes[1], e = n.nodes[0]; let res = [];
  for (const off of [0, 1.5, 3.1, -1.5]) {   // lefelé bármilyen "billentyű-irányból": az akna elfogadja
    q.loc = 'nest'; q.node = n.entranceId; q.nseg = null; q.yaw = Math.atan2(nb.x - e.x, nb.z - e.z) + off; let r = -1;
    for (let i = 0; i < 400; i++) { s.input.fwd = 1; s.step(0.1); if (q.loc === 'nest' && q.node === nb.id && !q.nseg) { r = i; break; } if (q.loc !== 'nest') { r = 'kilépett'; break; } }
    res.push(r);
  }
  // vissza: fwd=-1 a szakaszon -> természetes kijövetel
  q.loc = 'nest'; q.node = nb.id; q.nseg = { from: nb.id, to: n.entranceId, t: 0 }; let out = -1; for (let i = 0; i < 400; i++) { s.input.fwd = 1; s.step(0.1); if (q.loc !== 'nest') { out = i; break; } }
  console.log(sp, 'lefelé (irányok 0,1.5,3.1,-1.5):', JSON.stringify(res), 'felfelé kijött lépésben:', out, q.loc);
}
// fúrás
{ const s = new Sim({ species: 'odonto', seed: 777, difficulty: 'normal' }); for (let i = 0; i < 400; i++) s.step(0.1);
  const q = s.queen, n = s.nest; s.possess(q.id); const last = n.nodes[n.nodes.length - 1]; q.loc = 'nest'; q.node = last.id; q.nseg = null; q.yaw = 1; const n0 = n.nodes.length; s.input.dig = true;
  for (let i = 0; i < 700; i++) s.step(0.1); s.input.dig = false; console.log('fúrás: csomópontok', n0, '->', n.nodes.length, 'cipel:', JSON.stringify(q.carry)); }
