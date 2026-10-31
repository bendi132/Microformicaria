import { Sim } from '../src/sim/sim.js';
import { navigate } from '../src/sim/ant.js';
const s = new Sim({ species: 'ponera', seed: 12345 });
const q = s.ants[0]; let n=0;
for (let i = 0; i < 12000; i++) { s.step(0.1); if (q.task==='drink' && q.loc==='nest' && i>3000) { n++; if (n%100===1) console.log(s.t.toFixed(0), q.st, 'node',q.node,'path',JSON.stringify(q.path),'seg',q.seg,'segT',q.segT?.toFixed(2),'plug',s.nest.plug.active,'water',s.colony.store.water.toFixed(1), 'edges', s.nest.edges.map(e=>e.a+'-'+e.b+(e.collapsed?'X':'')).join(' '), 'nodes', s.nest.nodes.map(x=>x.id+':'+x.ready).join(' ')); if (n>500) break; } }
