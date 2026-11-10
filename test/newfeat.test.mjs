// Lisztkukac, növekvő játszható terület, penész és az új döntési események tesztje.
import { Sim } from '../src/sim/sim.js';
import { EVENTS, chooseEvent, moldOf } from '../src/sim/manage.js';
import { makeMealworm } from '../src/sim/entities.js';
import { MOIST_N } from '../src/sim/world.js';
import { DAY } from '../src/sim/config.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const run = (s, sec) => { for (let i = 0; i < sec * 10 && !s.over; i++) s.step(0.1); };
const alive = (s) => s.ants.filter((a) => !a.dead && a.caste !== 'queen').length;

// 1. terület: a kezdő kolónia mérete szerint nyílik meg, soha nem csökken
{
  const s = new Sim({ species: 'cephalotes', seed: 5, difficulty: 'easy' }); run(s, 20);
  ok(s.world.max === 180 && s.world.moist.length === MOIST_N * MOIST_N, 'világ: teljes méret 180, nedvességrács ' + MOIST_N);
  const h0 = s.world.half; run(s, DAY * 6);
  ok(s.world.half >= h0 && [90, 120, 150, 180].includes(s.world.half), `terület ${h0} → ${s.world.half} (${alive(s)} dolgozó)`);
  s.world.half = 90; for (let i = 0; i < 30; i++) s.ants.push({ ...s.ants.find((a) => a.caste !== 'queen') }); s.growTerritory();
  ok(s.world.half >= 150, 'sok dolgozó: terület megnyílik ' + s.world.half + ' (' + alive(s) + ')');
  ok(s.logs.some((l) => l.level === 'territory'), 'terület-növekedés üzenet');
  // régi mentés betöltése (60×60 rács, nincs külső gyűrű)
  const t = new Sim({ species: 'ponera', seed: 9, difficulty: 'easy' }); run(t, 30); const d = JSON.parse(t.serialize());
  const old = new Float32Array(3600), off = (MOIST_N - 60) / 2; for (let j = 0; j < 60; j++) for (let i = 0; i < 60; i++) old[j * 60 + i] = d.world.moist[(j + off) * MOIST_N + i + off];
  d.world.moist = Array.from(old); delete d.world.max; delete d.world.extended; d.world.stones = d.world.stones.filter((q) => Math.abs(q.x) < 90 && Math.abs(q.z) < 90);
  const u = Sim.deserialize(JSON.stringify(d)); run(u, 20);
  ok(u.world.moist.length === MOIST_N * MOIST_N && u.world.max === 180 && u.world.stones.length > d.world.stones.length, 'régi mentés bővül a külső gyűrűvel');
}
// 2. lisztkukac: a hangyák (csoportban) elejtik, a modell/animáció adatai rendben
{
  let kills = 0, total = 0;
  for (const seed of [1, 2, 3, 4]) {
    const s = new Sim({ species: 'ponera', seed, difficulty: 'easy' }); run(s, 40);
    const b = s.nest.nodes[0]; const ws = []; const tmpl = s.ants.find((a) => a.caste !== 'queen' && !a.dead); for (let i = 0; i < 14; i++) { const c = JSON.parse(JSON.stringify(tmpl)); c.id = s.nextId++; s.ants.push(c); }
    for (let i = 0; i < 3; i++) { const p = makeMealworm(s, b.x + 12 + i * 3, b.z + 8, false); s.isopods.push(p); ws.push(p); }
    s.colony.dir.hunt = 2; run(s, DAY * 3); total += ws.length; kills += ws.filter((p) => p.dead).length;
    ok(ws.every((p) => p.sp === 'mealworm' && p.len >= 16 && p.len <= 26 && p.food > 150), `seed ${seed}: lisztkukac adatok (${ws[0].len.toFixed(1)} mm, táplálék ${ws[0].food.toFixed(0)})`);
  }
  ok(kills >= 1, `a hangyák legalább egy lisztkukacot elejtettek (${kills}/${total})`);
}
// 3. penész: nedves, meleg raktárban nő, takarítás/kidobás csökkenti
{
  const s = new Sim({ species: 'ponera', seed: 3, difficulty: 'easy' }); run(s, 60);
  const store = s.nest.nodes.find((q) => q.kind === 'chamber'); store.role = 'store';
  for (let i = 0; i < 400; i++) { store.hum = 1; store.temp = 22; store.flood = 1; s.step(0.1); if (i % 10 === 0) s.stepMold(1); }
  store.flood = 0;
  ok(store.mold > 0.28, 'nedves raktárban penész nő: ' + (store.mold || 0).toFixed(2));
  const mg = s.colony.mg; mg.nextEv = 1e9; mg.ev = { id: 'mold', phase: 'ask', t0: s.t, deadline: s.t + 99, text: EVENTS.mold.text(s), data: {}, opt: null };
  ok(EVENTS.mold.when(s), 'penész-esemény feltétele teljesül');
  const before = moldOf(s).max; chooseEvent(s, 'discard');
  ok(moldOf(s).max < before * 0.4, 'kidobás után csökken: ' + before.toFixed(2) + ' → ' + moldOf(s).max.toFixed(2));
  run(s, DAY * 1.6); ok(mg.log.length >= 1 && mg.log[0].id === 'mold', 'a penész-döntés kiértékelődött: ' + (mg.log[0] && mg.log[0].text));
}
// 4. minden esemény: szöveg, opciók, kiértékelés hibamentesen
{
  const s = new Sim({ species: 'cephalotes', seed: 7, difficulty: 'easy' }); run(s, DAY * 2);
  const n = Object.keys(EVENTS).length; ok(n >= 17, 'események száma: ' + n);
  let bad = 0; for (const id in EVENTS) { const d = EVENTS[id]; try { d.text(s); if (!d.opts.some((o) => o.id === d.def)) throw new Error('nincs alapértelmezett opció'); } catch (e) { bad++; console.log(id, e.message); } }
  ok(bad === 0, 'minden esemény szövege és alapopciója rendben');
  // minden esemény minden opciója lefut, és a kiértékelés nem dob hibát
  for (const id in EVENTS) for (const o of EVENTS[id].opts) {
    const t = new Sim({ species: id === 'honeydew' ? 'cephalotes' : 'ponera', seed: 4, difficulty: 'easy' }); run(t, DAY * 2.2); const mg = t.colony.mg; mg.nextEv = 1e9;
    mg.ev = { id, phase: 'ask', t0: t.t, deadline: t.t + 99, text: '', data: {}, opt: null }; try { chooseEvent(t, o.id); run(t, DAY * 1.7); if (!mg.log.some((e) => e.id === id)) throw new Error('nem értékelődött ki'); } catch (e) { fails++; console.log('FAIL', id, o.id, e.message); }
  }
  console.log('minden esemény-opció lefutott');
}
// 5. determinizmus: azonos mag, azonos eredmény
{ const a = new Sim({ species: 'ponera', seed: 8, difficulty: 'easy' }), b = new Sim({ species: 'ponera', seed: 8, difficulty: 'easy' }); run(a, DAY * 3); run(b, DAY * 3);
  ok(a.ants.length === b.ants.length && a.isopods.length === b.isopods.length && a.world.half === b.world.half && a.colony.mg.log.length === b.colony.mg.log.length, 'determinisztikus'); }
console.log(fails ? 'HIBA: ' + fails : 'newfeat.test.mjs: OK'); process.exitCode = fails ? 1 : 0;
