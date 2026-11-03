import { Sim } from '../src/sim/sim.js';
for (const id of ['ponera','odonto']) {
  const sim = new Sim({ species: id, difficulty: 'normal', seed: 5 });
  for (let i = 0; i < 400; i++) sim.step(0.1);
  const w = sim.ants.find((a) => a.caste !== 'queen' && !a.dead) || sim.queen; w.loc==='nest'&&0;
  const p = sim.springtails.find((q) => !q.dead) || sim.isopods[0];
  const kind = sim.springtails.includes(p) ? 'springtail' : 'isopod';
  console.log(id, 'order', sim.order(w.id, kind, p.id), w.task, w.st);
  let seen = new Set();
  for (let i = 0; i < 900; i++) { sim.step(0.1); seen.add(w.task + '/' + w.st); if (p.dead) break; }
  console.log(' states', [...seen].join(' '), 'prey dead', p.dead, 'energy', w.energy.toFixed(0));
}
