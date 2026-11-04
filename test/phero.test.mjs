import { Sim } from '../src/sim/sim.js';
import { deposit, sample, decay, followDir } from '../src/sim/phero.js';
const s = new Sim({ species: 'ponera', seed: 9, difficulty: 'normal' });
for (let i = 0; i < 300; i++) s.step(0.1);
const home = s.nest.nodes[0]; const a = s.queen; a.loc = 'ground'; a.x = home.x + 14; a.z = home.z;
// nyom a fészektől kifelé (+x), a hangya a nyom elején áll
for (let x = 4; x <= 40; x += 1) deposit(s, home.x + x, home.z, 0.8);
console.log('nyom mintavétel', sample(s, home.x + 20, home.z).toFixed(2));
let fw = 0, n = 0; for (let t = 0; t < 40; t++) { const d = followDir(s, a); if (d) { n++; if (d.x > a.x) fw++; } }
console.log('követés: talált', n, '/40, ebből kifelé', fw);
const before = sample(s, home.x + 20, home.z); for (let i = 0; i < 100; i++) decay(s, 1);
console.log('párolgás 100 mp után', before.toFixed(2), '→', sample(s, home.x + 20, home.z).toFixed(2));
