import { Sim } from '../src/sim/sim.js';
import { broodChamber, chamberQuality } from '../src/sim/colony.js';
import { chambers } from '../src/sim/nest.js';
const s = new Sim({ species: 'ponera', seed: 12345 });
for (let i = 0; i < 1100; i++) s.step(0.1);
const q = s.ants[0];
console.log(q.task, q.st, q.decide, s.colony.lastLay, s.t);
console.log(chambers(s.nest).map(c => ({ id: c.id, r: c.r, cap: c.cap, ready: c.ready, building: c.building, hum: c.hum, temp: c.temp, q: chamberQuality(s, c) })));
console.log('brood chamber', broodChamber(s)?.id);
