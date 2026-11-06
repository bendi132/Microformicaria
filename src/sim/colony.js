// A kolónia: készletek, fiasítás (pete → lárva → báb → dolgozó), petézés, munkaigények.
import { SPECIES, DAY } from './config.js';
import { chambers, node, nodeDepth, nearestNode } from './nest.js';
import { makeBrood, makeAnt } from './entities.js';
import { clamp } from '../core/util.js';
import { placeInNode } from './motion.js';

export function initColony(sim) {
  sim.colony = { store: { prey: 0, sugar: 0, water: 0 }, dir: { hunt: 1, forage: 1, water: 1, nurse: 1, dig: 1, guard: 1, caution: 0.35 }, born: 0, emerged: 0, eggsLaid: 0, lastLay: -1e9, soldiers: 0, stageMax: 1 };
}
export const workers = (sim) => sim.ants.filter((a) => !a.dead && a.caste !== 'queen');
export const queen = (sim) => sim.ants.find((a) => a.caste === 'queen' && !a.dead);
export function storeCap(sim) {
  const n = sim.nest; const nStore = n ? chambers(n, 'store').length : 0;
  return { prey: 30 + nStore * 50, sugar: 25 + nStore * 40, water: 30 + nStore * 30 };
}
// A kamra alkalmassága a fiasításnak (0..1): a nedvesség és a hőmérséklet az optimumhoz képest
export function chamberQuality(sim, nd) {
  const sp = SPECIES[sim.speciesId];
  const h = nd.hum, [h0, h1] = sp.needs.humOpt, t = nd.temp, [t0, t1] = sp.needs.tempOpt;
  const qh = h < h0 ? clamp(1 - (h0 - h) / 0.3, 0, 1) : h > h1 ? clamp(1 - (h - h1) / 0.2, 0, 1) : 1;      // túl száraz: veszélyes, túl nedves: kevésbé jó
  const qt = t < t0 ? clamp(1 - (t0 - t) / 8, 0, 1) : t > t1 ? clamp(1 - (t - t1) / 7, 0, 1) : 1;
  return { q: qh * qt, qh, qt };
}
export function broodChamber(sim, avoid) {
  const n = sim.nest; if (!n) return null; let best = null, bs = -1;
  for (const nd of chambers(n)) {
    if (nd.building || nd.flood > 0 || nd.id === avoid) continue;
    const used = sim.brood.filter((b) => b.node === nd.id).length; if (used >= nd.cap * 1.5) continue;
    const { q } = chamberQuality(sim, nd); const s = q * (nd.role === 'brood' ? 1.15 : nd.role === 'rest' ? 0.8 : nd.role === 'store' ? 0.5 : 1) - used * 0.02;
    if (s > bs) { bs = s; best = nd; }
  }
  return best;
}
export function restChamber(sim) { const n = sim.nest; if (!n) return null; return chambers(n, 'rest')[0] || chambers(n)[0] || null; }

// ---- igények (0..1) a feladat-elosztáshoz
export function colonyNeeds(sim) {
  const c = sim.colony, sp = SPECIES[sim.speciesId], cap = storeCap(sim);
  const larvae = sim.brood.filter((b) => b.stage === 'larva').length, eggs = sim.brood.filter((b) => b.stage === 'egg').length, W = workers(sim).length;
  const wantPrey = larvae * sp.brood.larvaNeed * 0.8 + eggs * 2 + 6 + W * 0.8;
  const protein = clamp(1 - c.store.prey / Math.max(8, wantPrey), 0, 1);
  const sugar = clamp(1 - c.store.sugar / (W * 3 + 10), 0, 1);
  const wantWater = sim.brood.length * 0.8 + W * 1.2 + 12;
  let dry = 0; for (const b of sim.brood) { const nd = node(sim.nest, b.node); if (nd && chamberQuality(sim, nd).qh < 0.7) dry = 1; }
  const water = clamp(Math.max(1 - c.store.water / wantWater, dry * 0.9), 0, 1);
  const hungryLarvae = sim.brood.filter((b) => b.stage === 'larva' && b.fed < 0.55).length;
  const misplaced = sim.brood.filter((b) => { const nd = node(sim.nest, b.node); return nd && (chamberQuality(sim, nd).q < 0.45 || nd.flood > 0); }).length;
  const nurse = clamp(hungryLarvae * 0.35 + misplaced * 0.5 + (eggs > 0 ? 0.1 : 0), 0, 1);
  const dig = sim.nest && sim.nest.jobs.some((j) => j.active) ? 0.85 : 0;
  const repair = sim.nest && sim.nest.edges.some((e) => e.collapsed) ? 1 : 0;
  const guard = sim.threatNearNest ? 1 : 0.1;
  return { protein, sugar, water, nurse, dig, repair, guard };
}

// ---- petézés
export function layEgg(sim, q) {
  const sp = SPECIES[sim.speciesId], c = sim.colony;
  const nd = node(sim.nest, q.node); if (!nd || nd.kind !== 'chamber') return false;
  const inChamber = sim.brood.filter((b) => b.node === nd.id).length;
  const limit = Math.min(nd.cap * 1.5, 3 + Math.floor(c.store.prey / sp.brood.larvaNeed * 1.2) + workers(sim).length * 1.5 + Math.floor(q.energy / 25));
  if (inChamber >= limit || sim.brood.filter((b) => b.stage !== 'pupa').length >= limit) return false;
  if (chamberQuality(sim, nd).q < 0.35) return false;
  q.energy -= sp.brood.eggCost; c.eggsLaid++; c.lastLay = sim.t;
  const b = makeBrood(sim, 'egg', nd.id); sim.brood.push(b); sim.event('lay', q); return true;
}

// ---- fiasítás fejlődése
export function stepBrood(sim, dt) {
  const sp = SPECIES[sim.speciesId], c = sim.colony; const days = dt / DAY;
  const nest = sim.nest; if (!nest) return;
  for (const b of sim.brood) {
    if (b.dead) continue;
    const nd = node(nest, b.node); if (!nd) { b.dead = true; continue; }
    const { q, qh } = chamberQuality(sim, nd);
    const speed = q;                               // rossz klíma = lassú fejlődés
    b.badT = (b.badT || 0) + (q < 0.2 ? dt : -dt * 2); b.badT = Math.max(0, b.badT);
    if (b.badT > DAY * 0.75 || (nd.flood > 0 && sim.rng.chance(dt * 0.008))) { b.dead = true; continue; }       // kiszáradás vagy átnedvesedés miatti pusztulás
    if (b.stage === 'egg') { b.prog += days * speed / sp.brood.egg; if (b.prog >= 1) { b.stage = 'larva'; b.prog = 0; b.fed = 0.5; } }
    else if (b.stage === 'larva') {
      b.fed -= dt / (DAY * 1.1);
      // félig claustrális alapítás (játékmechanikai egyszerűsítés): munkások nélkül az anya testtartalékából (trofikus váladék) lassan eteti a lárvákat
      const qq = sim.ants.find((x) => x.caste === 'queen' && !x.dead);
      if (qq && qq.loc === 'nest' && qq.energy > 12 && !sim.ants.some((x) => x.caste !== 'queen' && !x.dead) && b.fed < 0.7) { b.fed += dt / (DAY * 0.9); qq.energy -= dt * 0.012; }                    // éheztetés: a lárvát etetni kell
      if (b.fed <= 0) { b.starve = (b.starve || 0) + dt; if (b.starve > DAY * 1.0) { b.dead = true; continue; } } else b.starve = 0;
      if (b.fed > 0.25) b.prog += days * speed * clamp(0.5 + b.fed, 0.5, 1.4) / sp.brood.larva;
      if (b.prog >= 1) { b.stage = 'pupa'; b.prog = 0; }
    } else if (b.stage === 'pupa') {
      b.prog += days * speed / sp.brood.pupa;
      if (b.prog >= 1) { b.dead = true; emerge(sim, b, nd); }
    }
  }
  sim.brood = sim.brood.filter((b) => !b.dead);
}
function emerge(sim, b, nd) {
  const sp = SPECIES[sim.speciesId], c = sim.colony;
  let caste = 'worker';
  if (sp.defend.escape === 'plug') { const sol = sim.ants.filter((a) => !a.dead && a.caste === 'soldier').length, wk = sim.ants.filter((a) => !a.dead && a.caste === 'worker').length; if (sol === 0 || sol < wk / 4) caste = 'soldier'; }
  const a = makeAnt(sim, caste, nd.x, nd.z); a.loc = 'nest'; a.node = nd.id; a.energy = 70; a.hyd = 75; placeInNode(sim, a); a.task = 'idle'; a.age = 0;
  sim.ants.push(a); c.emerged++; sim.event('born', a);
}
