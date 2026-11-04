import { Sim } from '../src/sim/sim.js';
const days = +process.argv[2] || 25; let res = [];
for (const sp of ['ponera', 'cephalotes', 'odonto', 'proceratium']) for (const seed of [11, 22, 33]) {
  const s = new Sim({ species: sp, seed, difficulty: 'normal' }); let t0 = Date.now();
  for (let i = 0; i < days * 1500 && !s.over; i++) s.step(0.1);
  const w = s.ants.filter((a) => !a.dead && a.caste !== 'queen').length;
  res.push(`${sp} ${seed}: ${s.over ? 'KIHALT' : s.queenDead ? 'királynő nélkül' : 'él'} dolg ${w} fiasítás ${s.brood.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
console.log(res.join('\n'));
