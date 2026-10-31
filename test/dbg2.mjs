import { Sim } from '../src/sim/sim.js';
import { findPrey, getTarget } from '../src/sim/tasks.js';
const s = new Sim({ species: process.argv[2]||'ponera', seed: 12345 });
const q = s.ants[0]; let cnt = {};
for (let i = 0; i < 3000; i++) {
  s.step(0.1);
  if (q.task === 'hunt') { cnt[q.st] = (cnt[q.st] || 0) + 1; if (i % 20 === 0 && ['approach', 'attack'].includes(q.st)) { const p = getTarget(s, q.target); console.log(`t${s.t.toFixed(0)} ${q.st} ${q.target?.kind} d=${p ? Math.hypot(p.x - q.x, p.z - q.z).toFixed(1) : '-'} cd=${q.cd.toFixed(1)} fails=${q.fails} pstate=${p?.state} len=${p?.len?.toFixed(1)}`); } }
}
console.log(cnt, 'prey near start:', findPrey(s, q));
// distance of closest springtail/isopod
let best = 1e9; for (const p of [...s.springtails, ...s.isopods]) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z)); console.log('closest', best.toFixed(1), 'q pos', q.x.toFixed(0), q.z.toFixed(0), 'nest', s.nest.nodes[0].x.toFixed(0), s.nest.nodes[0].z.toFixed(0));
