// Kolónia-vezetés: determinizmus, események (minden opció), módosítók lejárata, napi jelentés, mentés/betöltés.
import assert from 'node:assert/strict';
import { Sim } from '../src/sim/sim.js';
import { DAY } from '../src/sim/config.js';
import * as M from '../src/sim/manage.js';

const run = (sim, secs) => { for (let i = 0; i < secs * 10 && !sim.over; i++) sim.step(0.1); };
const mk = (sp = 'ponera', seed = 7, diff = 'easy') => new Sim({ species: sp, seed, difficulty: diff });

// 1) irányelvek és csúszkák
{
  const s = mk(); const mg = s.colony.mg; assert.equal(mg.policy, 'balanced');
  assert.ok(M.applyPolicy(s, 'harvest')); assert.equal(s.colony.dir.hunt, 1.7); assert.equal(mg.policy, 'harvest');
  assert.ok(M.setDir(s, 'guard', 5)); assert.equal(s.colony.dir.guard, 2); assert.equal(mg.policy, 'custom');
  assert.ok(M.setDir(s, 'caution', 5)); assert.equal(s.colony.dir.caution, 1);
  assert.equal(M.applyPolicy(s, 'nincs'), false);
  for (const id in M.POLICIES) for (const k of ['hunt', 'forage', 'water', 'nurse', 'dig', 'guard', 'caution']) assert.ok(typeof M.POLICIES[id].dir[k] === 'number', `${id}.${k}`);
}

// 2) módosítók: szorzódnak és lejárnak
{
  const s = mk(); const mg = s.colony.mg;
  mg.mods.push({ k: 'guard', mul: 2, until: s.t + 10, ev: 'x' }, { k: 'guard', mul: 1.5, until: s.t + 10, ev: 'x' }, { k: 'flood', mul: 0.5, until: s.t + 10, ev: 'x' });
  assert.ok(Math.abs(M.effDir(s).guard - s.colony.dir.guard * 3) < 1e-9);
  assert.equal(M.modMul(s, 'flood'), 0.5); assert.equal(M.effDir(s).repair, 1);
  run(s, 11); assert.equal(mg.mods.length, 0); assert.equal(M.effDir(s).guard, s.colony.dir.guard);
}

// 3) minden esemény minden opciója: kikényszerített esemény → választás → kiértékelés, hiba nélkül
for (const id of Object.keys(M.EVENTS)) for (const opt of M.EVENTS[id].opts) {
  const s = mk('ponera', 11); run(s, DAY * 3); const mg = s.colony.mg;
  mg.nextEv = 1e9;                                          // ne induljon másik esemény
  mg.ev = { id, phase: 'ask', t0: s.t, deadline: s.t + DAY * 0.7, text: M.EVENTS[id].text(s), data: {}, opt: null };
  const v = M.eventView(s); assert.equal(v.id, id); assert.equal(v.opts.length, M.EVENTS[id].opts.length); assert.ok(v.opts.every((o) => o.label && typeof o.fx === 'string'));
  const d0 = mg.decisions; assert.ok(M.chooseEvent(s, opt.id), `${id}/${opt.id}`); assert.equal(mg.ev.phase, 'run');
  assert.equal(M.chooseEvent(s, opt.id), false);               // kétszer nem választható
  for (const [k] of opt.mods) assert.ok(mg.mods.some((m) => m.k === k), `${id}/${opt.id} mod ${k}`);
  run(s, (M.EVENTS[id].dur || 1) * DAY + 5);
  assert.equal(mg.ev, null, `${id}/${opt.id} kiértékelés`); assert.equal(mg.decisions, d0 + 1);
  const r = mg.log[0]; assert.equal(r.id, id); assert.ok(r.text && [true, false, null].includes(r.good)); assert.ok(mg.xp > 0);
  assert.ok(!s.ants.some((a) => !Number.isFinite(a.x)));
}
// az alapértelmezett opció időtúllépéskor automatikusan lép, XP nélkül
{
  const s = mk('ponera', 12); run(s, DAY * 3); const mg = s.colony.mg; mg.nextEv = 1e9; const xp0 = mg.xp;
  mg.ev = { id: 'raid', phase: 'ask', t0: s.t, deadline: s.t + 20, text: '', data: {}, opt: null };
  run(s, 21); assert.equal(mg.ev.phase, 'run'); assert.equal(mg.ev.auto, true); assert.equal(mg.ev.opt, M.EVENTS.raid.def);
  run(s, DAY + 5); assert.equal(mg.ev, null); assert.equal(mg.xp, xp0);
}

// 4) természetes események: egy hosszabb futásban megjelennek, ütemezés szerint, de egyszerre csak egy
for (const sp of ['ponera', 'cephalotes', 'messor']) {
  const s = mk(sp, 21, 'easy'); const seen = new Set(); let resolved = 0, maxOpen = 0, asked = 0;
  s.colony.mg.xp = 0;
  for (let i = 0; i < 18 * 1500 && !s.over; i++) {
    s.step(0.1); const ev = s.colony.mg.ev;
    if (ev && ev.phase === 'ask' && !seen.has(s.colony.mg.asked)) { seen.add(s.colony.mg.asked); asked++; M.chooseEvent(s, M.EVENTS[ev.id].opts[0].id); }
    if (i % 5000 === 0) { for (const k in s.colony.store) assert.ok(Number.isFinite(s.colony.store[k])); }
  }
  resolved = s.colony.mg.log.length; maxOpen = s.colony.mg.ev ? 1 : 0;
  console.log(`${sp}: ${asked} esemény, ${resolved} kiértékelve, jelentés ${s.colony.mg.reports.length}, dolgozó ${s.ants.filter((a) => !a.dead && a.caste !== 'queen').length}${s.over ? ' (kihalt)' : ''}`);
  assert.ok(s.colony.mg.reports.length >= 10, 'napi jelentések készülnek');
  assert.ok(s.colony.mg.samples.length > 10 && s.colony.mg.samples.length <= 48);
  assert.ok(maxOpen <= 1);
}

// 5) determinizmus: azonos mag + azonos döntések → azonos vezetői állapot
{
  const play = () => { const s = mk('ponera', 33, 'easy'); const seen = new Set(); for (let i = 0; i < 12 * 1500 && !s.over; i++) { s.step(0.1); const ev = s.colony.mg.ev; if (ev && ev.phase === 'ask' && !seen.has(s.colony.mg.asked)) { seen.add(s.colony.mg.asked); M.chooseEvent(s, M.EVENTS[ev.id].opts[0].id); } } return JSON.stringify(s.colony.mg) + '|' + s.ants.length + '|' + s.brood.length; };
  assert.equal(play(), play());
}

// 6) mentés / betöltés aktív eseménnyel; régi mentés (mg nélkül) is betölthető
{
  const s = mk('ponera', 44); run(s, DAY * 3); const mg = s.colony.mg; mg.nextEv = 1e9;
  mg.ev = { id: 'hunger', phase: 'ask', t0: s.t, deadline: s.t + DAY * 0.7, text: 'x', data: {}, opt: null }; M.chooseEvent(s, 'nurse');
  const t = Sim.deserialize(s.serialize()); assert.equal(JSON.stringify(t.colony.mg), JSON.stringify(s.colony.mg)); assert.equal(t.stats.kills, s.stats.kills);
  run(t, DAY + 5); assert.equal(t.colony.mg.ev, null); assert.equal(t.colony.mg.decisions, 1);
  const old = JSON.parse(s.serialize()); delete old.colony.mg; delete old.stats; const u = Sim.deserialize(old); assert.ok(u.colony.mg && Array.isArray(u.colony.mg.mods)); assert.equal(u.stats.kills, 0); run(u, 30);
}

// 7) nézetmodell
{
  const s = mk(); run(s, DAY * 2); const L = M.laborCensus(s); assert.equal(Object.values(L.groups).reduce((a, b) => a + b, 0), L.total);
  const cp = M.capacity(s); assert.ok(cp.chambers > 0 && cp.brood.cap > 0);
  assert.equal(M.trendOf([{ a: 1 }], 'a'), 0); assert.equal(M.trendOf([{ a: 1 }, { a: 5 }], 'a'), 1); assert.equal(M.trendOf([{ a: 5 }, { a: 1 }], 'a'), -1);
  const rep = s.colony.mg.reports[0]; assert.ok(rep && rep.tips.length >= 1 && rep.tips.length <= 3 && rep.day >= 1);
}
console.log('manage.test.mjs: OK');
