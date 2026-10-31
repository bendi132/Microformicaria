// Belépés a fészekbe első személyű irányítással: a hangyát a bejárat közelébe tesszük, előre megyünk.
import { Sim } from '../src/sim/sim.js';
for (const sp of ['ponera', 'odonto', 'proceratium', 'cephalotes']) {
  const s = new Sim({ species: sp, seed: 777, difficulty: 'normal' });
  for (let i = 0; i < 400; i++) s.step(0.1);
  const a = s.queen; const e = s.nest.nodes[0]; s.possess(a.id);
  if (sp === 'cephalotes') { console.log(sp, 'fa-fészek, kihagyva (tüskén át lép be):', a.loc); continue; }
  a.loc = 'ground'; a.x = e.x + 2.8; a.z = e.z; a.yaw = -Math.PI / 2; a.node = null; a.nseg = null;
  let entered = -1; for (let i = 0; i < 200; i++) { s.input.fwd = 1; s.step(0.1); if (a.loc === 'nest') { entered = i; break; } }
  console.log(sp, 'queen len', a.len, 'bejárat r', e.r.toFixed(2), 'belépett lépésben:', entered, 'loc', a.loc);
}
