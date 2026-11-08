// Ásás: a kis kör-kamra (zsebkamra) kisebb, de teljes értékű kamra; a normál kamra a fajra jellemző méretre nő.
import assert from 'node:assert/strict';
import { Sim } from '../src/sim/sim.js';
import { SPECIES } from '../src/sim/config.js';
import { digWork, node } from '../src/sim/nest.js';

function dig(shape) {
  const s = new Sim({ species: 'ponera', seed: 42, difficulty: 'easy' }); for (let i = 0; i < 20; i++) s.step(0.1);
  const n = s.nest; const from = n.nodes[n.entranceId];
  const job = s.addDig(from.id, { x: from.x + 6, y: -8, z: from.z + 4 }, 'store', shape);
  assert.ok(job && !job.error, 'az ásási feladat létrejön');
  assert.equal(job.pocket, shape === 'pocket');
  for (let i = 0; i < 20000 && job.active; i++) digWork(n, SPECIES.ponera, s.world, job, 1);
  assert.equal(job.active, false, 'az ásás befejeződik');
  return node(n, job.cur);
}

const pocket = dig('pocket'), full = dig('tunnel');
const pTarget = Math.max(2.4, SPECIES.ponera.nest.chamberR * 0.6);
assert.equal(pocket.kind, 'chamber'); assert.ok(Math.abs(pocket.r - pTarget) < 1e-6, `zsebkamra sugara ${pocket.r} ≈ ${pTarget}`);
assert.equal(full.kind, 'chamber'); assert.ok(Math.abs(full.r - SPECIES.ponera.nest.chamberR) < 1e-6, `kamra sugara ${full.r}`);
assert.ok(pocket.r < full.r, 'a zsebkamra kisebb a teljes kamránál');
console.log('pocket.test.mjs: OK', pocket.r.toFixed(2), full.r.toFixed(2));
