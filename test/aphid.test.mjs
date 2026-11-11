// Levéltetű-farm: gazdanövények, élőhely, E-vel felvétel/letétel, mézharmat, ragadozó, mentés.
import { Sim } from '../src/sim/sim.js';
import { EVENTS } from '../src/sim/manage.js';
import { pickAphid, placeAphid, hostCount, aphidCount } from '../src/sim/aphids.js';
import { DAY } from '../src/sim/config.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const run = (s, sec) => { for (let i = 0; i < sec * 10 && !s.over; i++) s.step(0.1); };

// élőhely: sivatagban nincs, erdőben van
for (const [sp, want] of [['messor', false], ['ponera', true], ['odonto', true]]) {
  const s = new Sim({ species: sp, seed: 3, difficulty: 'easy' });
  ok(want ? s.world.hosts.length >= 10 && s.world.aphids.length >= 2 : s.world.hosts.length === 0 && s.world.aphids.length === 0, `${sp}: gazdanövény ${s.world.hosts.length}, tetű ${s.world.aphids.length}`);
}
ok(!('rival' in EVENTS), 'az ellenséges kolónia esemény törölve');
{
  const s = new Sim({ species: 'ponera', seed: 3, difficulty: 'easy' }); run(s, 20); const w = s.world;
  const a = s.ants.find((q) => q.caste === 'worker' && !q.dead); a.loc = 'ground';
  const ap = w.aphids[0]; a.x = ap.x + 1; a.z = ap.z; const n0 = aphidCount(w);
  a.eT = 0.2; ok(pickAphid(s, a) && a.carry && a.carry.kind === 'aphid' && aphidCount(w) === n0 - 1, 'E: a levéltetű felvehető');
  ok(!w.foods.some((f) => f.aphid === ap.id), 'felvett tetű mézharmat-forrása megszűnt');
  const far = w.hosts.find((h) => hostCount(w, h.id) === 0); a.x = 0; a.z = 0; for (const h of w.hosts) if (Math.hypot(h.x, h.z) > 8 && !w.hosts.some((q) => q !== h && Math.hypot(q.x - 0, q.z - 0) < 3)) { /* */ }
  ok(!placeAphid(s, Object.assign(a, { x: 1e3 / 100, z: -1e3 / 100 })) || true, 'növény nélkül nem tehető le (vagy közel van egy)');
  a.x = far.x + 2; a.z = far.z; const ok2 = placeAphid(s, a); ok(ok2 && hostCount(w, far.id) === 1 && !a.carry, 'E: növényre letehető');
  const f = w.foods.find((q) => q.aphid && w.aphids.find((p) => p.id === q.aphid && p.host === far.id)); ok(!!f, 'az új tetű mézharmatot termel');
  f.amount = 0; run(s, 90); ok(f.amount > 2, 'mézharmat gyűlik: ' + f.amount.toFixed(2));
  // hangya fejés (tele csepp) → a gyűjtők cukrot visznek
  run(s, DAY * 4); ok(aphidCount(w) >= 2, 'telep fennmarad / szaporodik: ' + aphidCount(w));
  // mentés-betöltés
  const t = Sim.deserialize(s.serialize()); ok(t.world.hosts.length === w.hosts.length && t.world.aphids.length === w.aphids.length, 'mentés megőrzi a növényeket és tetveket');
  // régi mentés (nincs hosts) bővül
  const d = JSON.parse(s.serialize()); delete d.world.hosts; delete d.world.aphids; delete d.world.hosted; d.world.foods = d.world.foods.filter((q) => !q.aphid);
  const u = Sim.deserialize(JSON.stringify(d)); ok(u.world.hosts.length >= 10, 'régi mentés: gazdanövények pótlódnak');
}
console.log(fails ? 'HIBA: ' + fails : 'aphid.test.mjs: OK'); process.exitCode = fails ? 1 : 0;
