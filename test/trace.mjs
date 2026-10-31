import { Sim } from '../src/sim/sim.js';
const sp = process.argv[2] || 'ponera', T = +(process.argv[3] || 200), every = +(process.argv[4] || 10);
const s = new Sim({ species: sp, seed: 12345 });
for (let i = 0; i < T * 10; i++) {
  s.step(0.1);
  if (i % (every * 10) === 0) {
    const q = s.ants[0]; const n = s.nest;
    console.log(`t${(s.t).toFixed(0)} ${q.task}/${q.st} ${q.loc} node${q.node} pos(${q.x.toFixed(1)},${q.y.toFixed(1)},${q.z.toFixed(1)}) E${q.energy | 0} H${q.hyd | 0} nest:${n ? n.nodes.length + 'n ' + n.jobs.map(j => (j.active ? 'A' : 'x') + j.progress.toFixed(1)).join(',') : '-'} ${n ? n.nodes.filter(x => x.kind === 'chamber').map(x => x.r.toFixed(1)).join('/') : ''}`);
  }
}
