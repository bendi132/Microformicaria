// Előrehaladás: szintek, feloldási feltételek, alapítás-felismerés a szimulációban.
import assert from 'node:assert/strict';
import * as P from '../src/game/progress.js';
import { Sim } from '../src/sim/sim.js';

// szint-határok
assert.equal(P.levelOf(0), 1); assert.equal(P.levelOf(19), 1); assert.equal(P.levelOf(20), 2); assert.equal(P.levelOf(80), 3);
const b = P.xpBounds(50); assert.equal(b.level, 2); assert.ok(b.into >= 0 && b.into < b.span);

// feloldás: messor 1 alapítás; ponera 2 alapítás + 10 zsákmány; a szabadok mindig nyitva
let s = P.defaultState();
assert.equal(P.isUnlocked(s, 'cephalotes'), true); assert.equal(P.isUnlocked(s, 'odonto'), true);
assert.equal(P.isUnlocked(s, 'messor'), false);
P.addFounding(s); assert.equal(P.isUnlocked(s, 'messor'), true); assert.equal(P.isUnlocked(s, 'ponera'), false);
P.addFounding(s); P.addPreyKills(s, 9); assert.equal(P.isUnlocked(s, 'ponera'), false);
const before = { ...s }; P.addPreyKills(s, 1);
assert.deepEqual(P.newlyUnlocked(before, s, ['messor', 'ponera', 'proceratium']), ['ponera']);
const pp = P.unlockProgress(s, 'proceratium'); assert.equal(pp.done, false); assert.equal(pp.items[0].have, 2);

// alapítás-felismerés: kezdő kolóniánál és korán nem; Normál, 10. nap, élő királynő, 8+ dolgozó
const sim = new Sim({ species: 'cephalotes', seed: 5, difficulty: 'normal' });
assert.equal(P.foundingMet(sim, 'easy'), false);
assert.equal(P.foundingMet(sim, 'normal'), false);
sim.env.day = 10; sim.ants.forEach((a) => { if (a.caste !== 'queen') a.dead = false; });
const workers = sim.ants.filter((a) => a.caste !== 'queen' && !a.dead).length;
assert.equal(P.foundingMet(sim, 'normal'), workers >= P.FOUND_WORKERS);
// több dolgozó: teljesül
while (sim.ants.filter((a) => a.caste !== 'queen' && !a.dead).length < P.FOUND_WORKERS) sim.ants.push({ ...sim.ants.find((a) => a.caste !== 'queen'), id: 99999 + sim.ants.length, dead: false });
assert.equal(P.foundingMet(sim, 'normal'), true);
console.log('progress.test.mjs: OK');
