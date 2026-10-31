import { Sim } from '../src/sim/sim.js';
const s = new Sim({ species: 'cephalotes', seed: 12345 });
const q = s.ants[0]; let last = '';
for (let i = 0; i < 9000; i++) {
  s.step(0.1);
  const key = q.task + '/' + q.st + '/' + q.loc;
  if (key !== last && (q.task==='drink'||q.task==='water'||s.t>800 && q.hyd<35)) { console.log(s.t.toFixed(0), key, 'E' + q.energy.toFixed(0), 'H' + q.hyd.toFixed(0), 'crop' + q.crop.toFixed(1), 'limb', q.limb, q.ls.toFixed(1)); last = key; }
}
console.log('foods', s.world.foods.map(f => [f.kind, f.limb, f.amt?.toFixed?.(1)]).slice(0,8));
