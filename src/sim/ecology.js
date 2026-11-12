// Az állatpopulációk és szaporodásuk: tojáscsomók (ugróvillás, ászka, pók), kikelés, betelepülés, pókfészkek betelepülése.
import { SPRINGTAIL, ISOPOD, ELEODES, SPIDER, SCORPION, MEALWORM, DIFFICULTY, DAY } from './config.js';
import { makeIsopod, makeSpringtail, makeSpider, makeClutch, makeMealworm } from './entities.js';
import { moistureAt, nearestCover } from './world.js';
import { dist, clamp } from '../core/util.js';

const isoTable = (sim) => (sim.world.biome === 'desert' ? ELEODES : ISOPOD).classes;
function pickClass(sim, table, bias = 0) {
  const keys = Object.keys(table); let sum = 0; const ws = keys.map((k) => { const w = table[k].weight * (k === 'small' ? 1 - bias : k === 'large' ? 1 + bias : 1); sum += w; return w; });
  let r = sim.rng.next() * sum; for (let i = 0; i < keys.length; i++) { r -= ws[i]; if (r <= 0) return keys[i]; } return keys[0];
}
export function initEcology(sim) {
  const w = sim.world, rng = sim.rng, D = sim.diff;
  const nIso = Math.round((w.biome === 'desert' ? 11 : 14) * D.isopods);
  for (let i = 0; i < nIso; i++) {
    const c = rng.pick(w.covers.filter((q) => inPlay(w, q, 3) && (q.kind !== 'moss' || rng.chance(0.3))));
    const p = makeIsopod(sim, pickClass(sim, isoTable(sim)), c.x + rng.range(-0.4, 0.4) * c.r, c.z + rng.range(-0.4, 0.4) * c.r, true);
    p.cover = c.id; p.tmr = rng.range(2, 40);
    if ((p.cls !== 'small') && rng.chance(ISOPOD.gravidChance)) makeGravid(sim, p);
    sim.isopods.push(p);
  }
  for (let i = 0; i < (w.biome === 'desert' ? 0 : Math.round(2 * D.isopods)); i++) { const c = rng.pick(w.covers.filter((q) => q.kind !== 'tuft' && Math.abs(q.x) < w.half - 6 && Math.abs(q.z) < w.half - 6)); if (!c) break; const p = makeMealworm(sim, c.x + rng.range(-0.5, 0.5) * c.r, c.z + rng.range(-0.5, 0.5) * c.r, true); p.cover = c.id; p.tmr = rng.range(2, 40); sim.isopods.push(p); }
  const desert = w.biome === 'desert'; const nSt = desert ? 0 : Math.round(30 * D.isopods);   // sivatagban nincs ugróvilla (nedves talajt, humuszt igényel)
  for (let i = 0; i < nSt; i++) {
    let x = 0, z = 0, best = -1;
    for (let k = 0; k < 6; k++) { const xx = rng.range(-w.half + 6, w.half - 6), zz = rng.range(-w.half + 6, w.half - 6); const m = moistureAt(w, xx, zz); if (m > best) { best = m; x = xx; z = zz; } }
    sim.springtails.push(makeSpringtail(sim, x, z, rng.chance(0.2)));
  }
  for (let i = 0; i < (desert ? 0 : Math.round(5 * D.isopods)); i++) {
    const s = sim.springtails[i]; if (s) sim.clutches.push(makeClutch(sim, 'springtail', s.x, s.z, rng.int(...SPRINGTAIL.eggs)));
  }
  // kezdeti pókok: a nehézségtől függő számú búvóhelyen
  const lairs = w.lairs.filter((l) => inPlay(w, l)).sort(() => rng.next() - 0.5);
  const nSp = desert ? Math.max(0, D.lairs - 1) : D.lairs;        // sivatagban kevesebb pók: a fő ragadozó a skorpió
  for (let i = 0; i < Math.min(nSp, lairs.length); i++) occupyLair(sim, lairs[i], rng.chance(0.4 + D.sizeBias) ? 'medium' : 'small');
  if (desert && rng.chance(SCORPION.startChance[sim.difficulty] ?? 0.5)) spawnScorpion(sim, lairs.slice(nSp));
}
export function makeGravid(sim, p) {
  const n = sim.rng.int(...ISOPOD.eggs); p.gravid = true;
  const c = makeClutch(sim, 'isopod', p.x, p.z, n, { host: p.id, hidden: true }); sim.clutches.push(c);
}
export function spawnScorpion(sim, lairs) {      // ritka, éjszakai ragadozó: a kövek és füvek tövében lakik, a fészektől távol
  const w = sim.world; const base = sim.nest ? sim.nest.nodes[0] : w.spawn;
  const ok = (lairs && lairs.length ? lairs : w.lairs).filter((l) => !l.occupied && inPlay(w, l) && dist(l.x, l.z, base.x, base.z) > 38);
  if (!ok.length) return null; const l = sim.rng.pick(ok); const s = occupyLair(sim, l, 'scorpion'); s.len = SPIDER.classes.scorpion.len * sim.rng.range(0.92, 1.1); return s;
}
export function occupyLair(sim, lair, cls) {
  lair.occupied = true; const s = makeSpider(sim, cls, lair); sim.spiders.push(s); return s;
}

export const areaOf = (sim) => Math.pow(sim.world.half / 90, 2);       // a játszható terület a kezdetinek hányszorosa (az állatállomány ennyivel nő)
export const tierOf = (sim) => Math.max(0, Math.round((sim.world.half - 90) / 30));
const inPlay = (w, l, pad = 6) => Math.abs(l.x) < w.half - pad && Math.abs(l.z) < w.half - pad;
export function stepEcology(sim, dt) {
  const w = sim.world, rng = sim.rng, D = sim.diff, env = sim.env, A = areaOf(sim);
  // ---- tojáscsomók
  for (const c of sim.clutches) {
    if (c.dead) continue;
    if (c.host) {
      const h = c.owner === 'isopod' ? sim.isopods.find((q) => q.id === c.host) : sim.spiders.find((q) => q.id === c.host);
      if (!h || h.dead) { if (c.owner === 'isopod') c.dead = true; else if (c.owner === 'spider' && !h) { c.host = null; } }
      else if (c.owner === 'isopod') { c.x = h.x; c.z = h.z; c.hidden = h.state === 'hidden'; }
      else { c.x = h.x0 ?? c.x; }
    }
    if (c.n <= 0) { c.dead = true; continue; }
    c.hatchLeft -= dt * (c.owner === 'spider' ? 1 : clamp(0.6 + moistureAt(w, c.x, c.z), 0.5, 1.5)); // nedvesség segíti a kelést
    if (c.hatchLeft <= 0) hatch(sim, c);
  }
  sim.clutches = sim.clutches.filter((c) => !c.dead);
  const husk = (p, lim) => { p.huskT = (p.huskT || 0) + dt; return p.huskT > 30; };   // a kiszívott tetem még ~30 mp-ig száraz héjként látszik
  sim.isopods = sim.isopods.filter((p) => !(p.dead && p.fresh <= 0) && !(p.dead && p.foodLeft <= 0.05 && husk(p)));
  sim.springtails = sim.springtails.filter((p) => !(p.dead && (p.fresh <= 0 || (p.foodLeft <= 0.02 && husk(p)))));
  // ---- betelepülés (kívülről): az ászkák és az ugróvillások száma lassan helyreáll, a nedvességtől és a nehézségtől függően
  sim.ecoT = (sim.ecoT || 0) + dt;
  if (sim.ecoT > 12) {
    sim.ecoT = 0; const wet = clamp((w.moist.reduce((a, b) => a + b, 0) / w.moist.length - 0.1) * 3, 0.1, 1.4);
    const isoAlive = sim.isopods.filter((p) => !p.dead && p.sp !== 'mealworm').length, wormAlive = sim.isopods.filter((p) => !p.dead && p.sp === 'mealworm').length, stAlive = sim.springtails.filter((p) => !p.dead).length;
    if (isoAlive < ISOPOD.max * D.isopods * 0.8 * A && rng.chance(0.08 * Math.sqrt(A) * wet * (env.night ? 1.6 : 0.6) * (1 - sim.preyScarcity))) {
      const c = rng.pick(w.covers.filter((q) => q.kind !== 'moss' && inPlay(w, q, 3))); if (c) { const p = makeIsopod(sim, pickClass(sim, isoTable(sim)), c.x, c.z, true); p.cover = c.id; sim.isopods.push(p); }
    }
    if (w.biome !== 'desert' && wormAlive < MEALWORM.max * D.isopods * A && rng.chance(0.07 * Math.sqrt(A) * (1 - sim.preyScarcity))) {
      const c = rng.pick(w.covers.filter((q) => (q.kind === 'log' || q.kind === 'moss' || q.kind === 'stone') && inPlay(w, q, 3))); if (c) { const p = makeMealworm(sim, c.x, c.z, true); p.cover = c.id; sim.isopods.push(p); }
    }
    if (w.biome !== 'desert' && stAlive < SPRINGTAIL.max * D.isopods * 0.8 * A && rng.chance(0.18 * Math.sqrt(A) * wet * (1 - sim.preyScarcity))) {
      let x = 0, z = 0, best = -1; for (let k = 0; k < 5; k++) { const xx = rng.range(-w.half + 6, w.half - 6), zz = rng.range(-w.half + 6, w.half - 6); const m = moistureAt(w, xx, zz); if (m > best) { best = m; x = xx; z = zz; } }
      sim.springtails.push(makeSpringtail(sim, x, z, false));
    }
    // terhes ászka: az anya újra költőzsákot kaphat
    for (const p of sim.isopods) if (!p.dead && !p.gravid && p.sp !== 'mealworm' && p.cls !== 'small' && p.state === 'hidden' && rng.chance(0.012 * (D.isopods))) makeGravid(sim, p);
  }
  // ---- skorpió betelepülése (sivatag): nagyon ritka, a nehézségtől függ
  if (w.biome === 'desert') {
    sim.scCheck = (sim.scCheck || 0) + dt;
    if (sim.scCheck > DAY) { sim.scCheck = 0; const n = sim.spiders.filter((s) => !s.dead && s.cls === 'scorpion').length; if (n < (SCORPION.max[sim.difficulty] ?? 1) && sim.t > DAY * 1.5 && rng.chance(0.07 * (sim.difficulty === 'hard' ? 1.6 : sim.difficulty === 'easy' ? 0.5 : 1))) spawnScorpion(sim); }
  }
  // ---- pókok betelepülése / petezsák-rakás (naponta egyszer-kétszer ellenőrizve)
  sim.spiderCheck = (sim.spiderCheck || 0) + dt;
  if (sim.spiderCheck > DAY * 0.5) {
    sim.spiderCheck = 0;
    const active = sim.spiders.filter((s) => !s.dead && s.cls !== 'scorpion').length;
    if (active < D.spiderMax + tierOf(sim)) for (const l of w.lairs) {
      if (l.occupied || !inPlay(w, l)) continue;
      const cover = w.covers.find((q) => q.id === l.cover); const prey = sim.isopods.filter((p) => !p.dead && dist(p.x, p.z, l.x, l.z) < 40).length + sim.springtails.filter((p) => !p.dead && dist(p.x, p.z, l.x, l.z) < 30).length * 0.4;
      const nearNest = sim.nest ? dist(l.x, l.z, sim.nest.nodes[0].x, sim.nest.nodes[0].z) : 99;
      const p = D.spawnPerDay * 0.5 * clamp(0.2 + prey * 0.12, 0, 1.2) * (cover && cover.kind === 'stone' ? 1.1 : 0.9) * (nearNest < 25 ? 0.5 : 1);
      if (sim.t > DAY * 0.8 && rng.chance(p * (w.biome === 'desert' ? 0.35 : 0.6))) { const cls = pickClass(sim, SPIDER.classes, D.sizeBias); occupyLair(sim, l, cls); l.known = false; break; }
    }
    for (const s of sim.spiders) {
      if (s.dead || s.cls === 'small' || s.cls === 'scorpion' || s.sac || s.state === 'flee' || s.sat < 0.3) continue;
      const lair = w.lairs.find((q) => q.id === s.lair);
      if (rng.chance(0.22 * D.spawnPerDay + 0.05)) { const n = rng.int(...SPIDER.sacEggs); const c = makeClutch(sim, 'spider', lair.x, lair.z, n, { host: s.id, hidden: true, x0: lair.x }); c.x = lair.x; c.z = lair.z; sim.clutches.push(c); s.sac = c.id; }
    }
  }
}
function hatch(sim, c) {
  const rng = sim.rng, w = sim.world; c.dead = true;
  if (c.owner === 'springtail') { const k = Math.min(Math.round(c.n * 0.6), Math.max(0, SPRINGTAIL.max - sim.springtails.length)); for (let i = 0; i < k; i++) sim.springtails.push(makeSpringtail(sim, c.x + rng.range(-1, 1), c.z + rng.range(-1, 1), true)); }
  else if (c.owner === 'isopod') {
    const h = sim.isopods.find((q) => q.id === c.host); if (h) h.gravid = false;
    const k = Math.min(Math.round(c.n * 0.25), Math.max(0, ISOPOD.max * 1.4 * areaOf(sim) - sim.isopods.length));
    for (let i = 0; i < k; i++) { const p = makeIsopod(sim, 'small', c.x + rng.range(-1, 1), c.z + rng.range(-1, 1), true); p.len = w.biome === 'desert' ? rng.range(4.6, 5.4) : rng.range(2.0, 2.6); p.cover = h ? h.cover : null; sim.isopods.push(p); }
  } else if (c.owner === 'spider') {
    const mom = sim.spiders.find((q) => q.id === c.host); if (mom) mom.sac = null;
    const room = sim.diff.spiderMax + tierOf(sim) + 1 - sim.spiders.filter((s) => !s.dead).length;
    if (room > 0 && mom && c.n > 12 && rng.chance(0.7)) { const lair = w.lairs.find((q) => q.id === mom.lair); const free = w.lairs.find((l) => !l.occupied && inPlay(w, l) && dist(l.x, l.z, lair.x, lair.z) < 70); if (free) occupyLair(sim, free, 'small'); }
  }
}
