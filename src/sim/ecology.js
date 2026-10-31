// Az állatpopulációk és szaporodásuk: tojáscsomók (ugróvillás, ászka, pók), kikelés, betelepülés, pókfészkek betelepülése.
import { SPRINGTAIL, ISOPOD, SPIDER, DIFFICULTY, DAY } from './config.js';
import { makeIsopod, makeSpringtail, makeSpider, makeClutch } from './entities.js';
import { moistureAt, nearestCover } from './world.js';
import { dist, clamp } from '../core/util.js';

function pickClass(sim, table, bias = 0) {
  const keys = Object.keys(table); let sum = 0; const ws = keys.map((k) => { const w = table[k].weight * (k === 'small' ? 1 - bias : k === 'large' ? 1 + bias : 1); sum += w; return w; });
  let r = sim.rng.next() * sum; for (let i = 0; i < keys.length; i++) { r -= ws[i]; if (r <= 0) return keys[i]; } return keys[0];
}
export function initEcology(sim) {
  const w = sim.world, rng = sim.rng, D = sim.diff;
  const nIso = Math.round(14 * D.isopods);
  for (let i = 0; i < nIso; i++) {
    const c = rng.pick(w.covers.filter((q) => q.kind !== 'moss' || rng.chance(0.3)));
    const p = makeIsopod(sim, pickClass(sim, ISOPOD.classes), c.x + rng.range(-0.4, 0.4) * c.r, c.z + rng.range(-0.4, 0.4) * c.r, true);
    p.cover = c.id; p.tmr = rng.range(2, 40);
    if ((p.cls !== 'small') && rng.chance(ISOPOD.gravidChance)) makeGravid(sim, p);
    sim.isopods.push(p);
  }
  const nSt = Math.round(30 * D.isopods);
  for (let i = 0; i < nSt; i++) {
    let x = 0, z = 0, best = -1;
    for (let k = 0; k < 6; k++) { const xx = rng.range(-w.half + 6, w.half - 6), zz = rng.range(-w.half + 6, w.half - 6); const m = moistureAt(w, xx, zz); if (m > best) { best = m; x = xx; z = zz; } }
    sim.springtails.push(makeSpringtail(sim, x, z, rng.chance(0.2)));
  }
  for (let i = 0; i < Math.round(5 * D.isopods); i++) {
    const s = sim.springtails[i]; if (s) sim.clutches.push(makeClutch(sim, 'springtail', s.x, s.z, rng.int(...SPRINGTAIL.eggs)));
  }
  // kezdeti pókok: a nehézségtől függő számú búvóhelyen
  const lairs = w.lairs.slice().sort(() => rng.next() - 0.5);
  for (let i = 0; i < Math.min(D.lairs, lairs.length); i++) occupyLair(sim, lairs[i], rng.chance(0.4 + D.sizeBias) ? 'medium' : 'small');
}
export function makeGravid(sim, p) {
  const n = sim.rng.int(...ISOPOD.eggs); p.gravid = true;
  const c = makeClutch(sim, 'isopod', p.x, p.z, n, { host: p.id, hidden: true }); sim.clutches.push(c);
}
export function occupyLair(sim, lair, cls) {
  lair.occupied = true; const s = makeSpider(sim, cls, lair); sim.spiders.push(s); return s;
}

export function stepEcology(sim, dt) {
  const w = sim.world, rng = sim.rng, D = sim.diff, env = sim.env;
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
  sim.isopods = sim.isopods.filter((p) => !(p.dead && p.fresh <= 0) && !(p.dead && p.foodLeft <= 0.05));
  sim.springtails = sim.springtails.filter((p) => !(p.dead && (p.fresh <= 0 || p.foodLeft <= 0.02)));
  // ---- betelepülés (kívülről): az ászkák és az ugróvillások száma lassan helyreáll, a nedvességtől és a nehézségtől függően
  sim.ecoT = (sim.ecoT || 0) + dt;
  if (sim.ecoT > 12) {
    sim.ecoT = 0; const wet = clamp((w.moist.reduce((a, b) => a + b, 0) / w.moist.length - 0.1) * 3, 0.1, 1.4);
    const isoAlive = sim.isopods.filter((p) => !p.dead).length, stAlive = sim.springtails.filter((p) => !p.dead).length;
    if (isoAlive < ISOPOD.max * D.isopods * 0.8 && rng.chance(0.08 * wet * (env.night ? 1.6 : 0.6) * (1 - sim.preyScarcity))) {
      const c = rng.pick(w.covers.filter((q) => q.kind !== 'moss')); if (c) { const p = makeIsopod(sim, pickClass(sim, ISOPOD.classes), c.x, c.z, true); p.cover = c.id; sim.isopods.push(p); }
    }
    if (stAlive < SPRINGTAIL.max * D.isopods * 0.8 && rng.chance(0.18 * wet * (1 - sim.preyScarcity))) {
      let x = 0, z = 0, best = -1; for (let k = 0; k < 5; k++) { const xx = rng.range(-w.half + 6, w.half - 6), zz = rng.range(-w.half + 6, w.half - 6); const m = moistureAt(w, xx, zz); if (m > best) { best = m; x = xx; z = zz; } }
      sim.springtails.push(makeSpringtail(sim, x, z, false));
    }
    // terhes ászka: az anya újra költőzsákot kaphat
    for (const p of sim.isopods) if (!p.dead && !p.gravid && p.cls !== 'small' && p.state === 'hidden' && rng.chance(0.012 * (D.isopods))) makeGravid(sim, p);
  }
  // ---- pókok betelepülése / petezsák-rakás (naponta egyszer-kétszer ellenőrizve)
  sim.spiderCheck = (sim.spiderCheck || 0) + dt;
  if (sim.spiderCheck > DAY * 0.5) {
    sim.spiderCheck = 0;
    const active = sim.spiders.filter((s) => !s.dead).length;
    if (active < D.spiderMax) for (const l of w.lairs) {
      if (l.occupied) continue;
      const cover = w.covers.find((q) => q.id === l.cover); const prey = sim.isopods.filter((p) => !p.dead && dist(p.x, p.z, l.x, l.z) < 40).length + sim.springtails.filter((p) => !p.dead && dist(p.x, p.z, l.x, l.z) < 30).length * 0.4;
      const nearNest = sim.nest ? dist(l.x, l.z, sim.nest.nodes[0].x, sim.nest.nodes[0].z) : 99;
      const p = D.spawnPerDay * 0.5 * clamp(0.2 + prey * 0.12, 0, 1.2) * (cover && cover.kind === 'stone' ? 1.1 : 0.9) * (nearNest < 25 ? 0.5 : 1);
      if (sim.t > DAY * 0.8 && rng.chance(p * 0.6)) { const cls = pickClass(sim, SPIDER.classes, D.sizeBias); occupyLair(sim, l, cls); l.known = false; break; }
    }
    for (const s of sim.spiders) {
      if (s.dead || s.cls === 'small' || s.sac || s.state === 'flee' || s.sat < 0.3) continue;
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
    const k = Math.min(Math.round(c.n * 0.25), Math.max(0, ISOPOD.max * 1.4 - sim.isopods.length));
    for (let i = 0; i < k; i++) { const p = makeIsopod(sim, 'small', c.x + rng.range(-1, 1), c.z + rng.range(-1, 1), true); p.len = rng.range(2.0, 2.6); p.cover = h ? h.cover : null; sim.isopods.push(p); }
  } else if (c.owner === 'spider') {
    const mom = sim.spiders.find((q) => q.id === c.host); if (mom) mom.sac = null;
    const room = sim.diff.spiderMax + 1 - sim.spiders.filter((s) => !s.dead).length;
    if (room > 0 && mom && c.n > 12 && rng.chance(0.7)) { const lair = w.lairs.find((q) => q.id === mom.lair); const free = w.lairs.find((l) => !l.occupied && dist(l.x, l.z, lair.x, lair.z) < 70); if (free) occupyLair(sim, free, 'small'); }
  }
}
