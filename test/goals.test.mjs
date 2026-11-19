import { Sim } from '../src/sim/sim.js'; import { GOALS, evalGoals } from '../src/game/goals.js';
const s = new Sim({ species: 'ponera', seed: 3, difficulty: 'easy' }); for (let i = 0; i < 3000; i++) s.step(0.1);
const prog = { xp: 0 }; const done = evalGoals(s, prog); console.log('teljesült induláskor:', done.map((g) => g.id).join(','));
const again = evalGoals(s, prog); let ok = done.some((g) => g.id === 'w1') && again.length === 0 && GOALS.length >= 10;
console.log(ok ? 'goals.test.mjs: OK' : 'HIBA'); process.exitCode = ok ? 0 : 1;
