import { Sim } from '../src/sim/sim.js';
import { getTarget } from '../src/sim/tasks.js';
const s = new Sim({ species: 'ponera', seed: 12345 });
const q = s.ants[0]; let last = '';
for (let i = 0; i < 2600; i++) {
  s.step(0.1);
  const key = q.task + '/' + q.st + '/' + (q.target?.kind||'');
  if (key !== last && s.t > 100) { const p = getTarget(s, q.target); console.log(s.t.toFixed(1), key, 'd=' + (p ? Math.hypot(p.x - q.x, p.z - q.z).toFixed(1) : '-'), p ? p.state : '', 'pjump?', p?.cd?.toFixed?.(1)); last = key; }
}
