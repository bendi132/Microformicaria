// Mozgás a fészekben (felülnézeti irányítás): a yaw a szomszéd csomópont felé, fwd=1; majd vissza; kilépés E-vel a bejáratnál.
import { Sim } from '../src/sim/sim.js';
for (const sp of ['ponera', 'odonto', 'proceratium', 'cephalotes']) {
  const s = new Sim({ species: sp, seed: 777, difficulty: 'normal' }); for (let i = 0; i < 400; i++) s.step(0.1);
  const q = s.queen, n = s.nest; s.possess(q.id); q.loc = 'nest'; q.node = n.entranceId; q.nseg = null; q.path = null;
  const nb = n.nodes[1]; const e = n.nodes[0]; q.yaw = Math.atan2(nb.x - e.x, nb.z - e.z);
  let reached = -1; for (let i = 0; i < 400; i++) { s.input.fwd = 1; s.step(0.1); if (q.loc === 'nest' && q.node === nb.id && !q.nseg) { reached = i; break; } }
  // vissza
  let back = -1; q.yaw = Math.atan2(e.x - nb.x, e.z - nb.z); for (let i = 0; i < 400; i++) { s.input.fwd = 1; s.step(0.1); if (q.node === n.entranceId && !q.nseg) { back = i; break; } }
  s.input.use = true; s.step(0.1); s.input.use = false; const out = q.loc;
  console.log(sp, 'második csomópont elérve:', reached, 'vissza a bejáratig:', back, 'kilépés E-vel ->', out);
}
