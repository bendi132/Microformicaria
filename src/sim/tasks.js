// A hangyák feladat-állapotgépei: vadászat/petelopás, gyűjtés, vízkeresés, fiasításgondozás, ásás, védekezés, menekülés,
// valamint a játékos által közvetlenül irányított hangya (belső nézet).
import { SPECIES, SPIDER, DAY, TASK_HU } from './config.js';
import { navigate, entrancePos, baseSpeed, damageAnt, killAnt, treeBase } from './ant.js';
import { steerGround, placeAnt, placeInNode, setNestPath, moveNest } from './motion.js';
import { node, nodeDepth, digWork, nearestNode, chambers, findPath, neighbors, addNode, addEdge } from './nest.js';
import { heightAt, moistureAt, nearestCover, limbPoint, obstaclesAt, climbHeight } from './world.js';
import { colonyNeeds, workers, queen, layEgg, broodChamber, restChamber, storeCap, chamberQuality } from './colony.js';
import { killIsopod } from './isopod.js';
import { dist, clamp, angDiff, turnToward } from '../core/util.js';
import { followDir, trailStrength } from './phero.js';

const S = (sim) => SPECIES[sim.speciesId];
const EN = 10;                                    // 1 táplálékegység = ennyi energiapont
export function setTask(a, t, st = '') { a.task = t; a.st = st; a.target = null; a.tmr = 0; a.noTarget = 0; }

// ---------------------------------------------------------------- feladat-választás
export function chooseTask(sim, a) {
  const sp = S(sim), c = sim.colony, rng = sim.rng;
  if (sim.player.active && sim.player.antId === a.id) { if (a.task !== 'manual') setTask(a, 'manual'); return; }
  if (a.task === 'manual') setTask(a, 'idle');
  if (a.order) { if (sim.t < a.order.until && a.task === 'hunt' && (a.st === 'approach' || a.st === 'attack' || a.st === 'feed') && a.hyd > 18 && a.energy > 12) return; a.order = null; }
  // saját szükségletek
  if (a.hyd < 34) { if (a.task !== 'drink') setTask(a, 'drink'); return; }
  if (a.energy < 32) { if (a.task !== 'eat') setTask(a, 'eat'); return; }
  if (a.caste === 'queen') return chooseQueen(sim, a);
  const nd = sim.needs; const dir = c.dir;
  const danger = sim.surfaceDanger * dir.caution;                  // 0..1: mennyire veszélyes a felszín
  const hunter = sp.hunt.live || sp.hunt.eggs || sp.hunt.scavenge;
  const young = a.age < 2.5 ? 1.25 : 0.85;
  const soldier = a.caste === 'soldier';
  const sc = {
    hunt: nd.protein * 1.5 * dir.hunt * (hunter ? 1 : 0) * (1 - danger * 0.9) * (soldier ? 0.25 : 1) * (a.age > 0.6 ? 1 : 0.3) * (a.energy > 45 ? 1 : 0.5),
    forage: (sp.nest.type === 'tree' ? 1 : 0) * nd.sugar * 1.1 * dir.forage * (1 - danger * 0.85) * (soldier ? 0.3 : 1) * (a.age > 0.6 ? 1 : 0.3),
    water: nd.water * 1.25 * dir.water * (1 - danger * 0.8) * (soldier ? 0.4 : 1),
    nurse: nd.nurse * 1.7 * dir.nurse * young,
    dig: nd.dig * 1.0 * dir.dig * (sp.nest.type === 'soil' ? 1 : 0),
    repair: nd.repair * 1.6,
    guard: nd.guard * dir.guard * (soldier ? 1.6 : 0.5),
    rest: a.rest < 15 ? 0.9 : 0.12,
  };
  // vadászati szerep: a Proceratium petéket rabol (raid), a többiek zsákmányra vadásznak
  let best = null, tot = 0; const w = {};
  for (const k in sc) { let v = Math.pow(Math.max(0, sc[k]), 1.4); if (k === a.task) v += 0.12; w[k] = v; tot += v; }
  if (tot < 0.05) { setTask(a, a.loc === 'nest' ? 'rest' : 'idle'); return; }
  let r = rng.next() * tot; for (const k in w) { r -= w[k]; if (r <= 0) { best = k; break; } }
  if (best && best !== a.task) setTask(a, best === 'hunt' && sp.hunt.eggs ? 'hunt' : best);
}
function chooseQueen(sim, a) {
  const sp = S(sim), c = sim.colony, n = sim.nest; const nw = workers(sim).length;
  if (!n) { if (a.task !== 'seek_nest') setTask(a, 'seek_nest'); return; }
  if (n.jobs.some((j) => j.active) && nw < 2 && !chambers(n).some((q) => q.ready !== false && !q.building)) { if (a.task !== 'dig') setTask(a, 'dig'); return; }
  const stores = c.store.prey + c.store.sugar;
  const layDue = sim.t - c.lastLay > sp.brood.layEvery * DAY;
  if (layDue && a.energy > 42 && a.hyd > 38 && broodChamber(sim)) { if (a.task !== 'lay') setTask(a, 'lay'); return; }
  const larvaeHungry = sim.brood.some((b) => b.stage === 'larva' && b.fed < 0.55);
  if (larvaeHungry && (a.crop > 1.2 || c.store.prey > 1.2 || c.store.sugar > 3) && a.task !== 'nurse') { setTask(a, 'nurse'); return; }
  if (a.hyd < 50 && c.store.water <= 4 && sim.surfaceDanger < 0.8) { if (a.task !== 'water') setTask(a, 'water'); return; }
  if (a.task === 'water' && a.hyd < 85 && sim.surfaceDanger < 0.8) return;
  if (nw < 3 && (larvaeHungry || stores < 8 || a.energy < 60) && sim.surfaceDanger < 0.8) { if (a.task !== 'hunt' && a.task !== 'forage') setTask(a, sim.needs.sugar > sim.needs.protein + 0.2 || !(sp.hunt.live || sp.hunt.eggs) ? 'forage' : 'hunt'); return; }
  if (larvaeHungry && nw < 3) { if (a.task !== 'nurse') setTask(a, 'nurse'); return; }
  if (a.hyd < 60 && c.store.water > 4) { setTask(a, 'drink'); return; }
  if (a.energy < 55 && stores > 4) { setTask(a, 'eat'); return; }
  setTask(a, a.rest < 30 ? 'rest' : 'idle');
}

// ---------------------------------------------------------------- futtatás
export function runTask(sim, a, dt) {
  if (sim.player.active && sim.player.antId === a.id) { if (a.task !== 'manual') setTask(a, 'manual'); return manual(sim, a, dt); }
  switch (a.task) {
    case 'flee': return flee(sim, a, dt);
    case 'fight': return fight(sim, a, dt);
    case 'plug': return plug(sim, a, dt);
    case 'seek_nest': return seekNest(sim, a, dt);
    case 'lay': return lay(sim, a, dt);
    case 'eat': return eat(sim, a, dt);
    case 'drink': return drink(sim, a, dt);
    case 'water': return water(sim, a, dt);
    case 'forage': return forage(sim, a, dt);
    case 'hunt': return hunt(sim, a, dt);
    case 'nurse': return nurse(sim, a, dt);
    case 'dig': return dig(sim, a, dt);
    case 'repair': return repair(sim, a, dt);
    case 'guard': return guard(sim, a, dt);
    case 'rest': return rest(sim, a, dt);
    default: return idle(sim, a, dt);
  }
}

// ---- közös: haza menni és letenni, amit visz
function goHome(sim, a, dt, targetNodeId) {
  const n = sim.nest; if (!n) return 'blocked';
  const nid = targetNodeId ?? (restChamber(sim) || { id: n.entranceId }).id;
  const r = navigate(sim, a, { k: 'n', node: nid }, 1, dt);
  return r;
}
function deposit(sim, a) {
  const c = sim.colony, cap = storeCap(sim), cr = a.carry; if (!cr) return;
  if (cr.kind === 'prey') c.store.prey = Math.min(cap.prey, c.store.prey + cr.amt);
  else if (cr.kind === 'sugar') c.store.sugar = Math.min(cap.sugar, c.store.sugar + cr.amt);
  else if (cr.kind === 'water') c.store.water = Math.min(cap.water, c.store.water + cr.amt);
  else if (cr.kind === 'eggs') c.store.prey = Math.min(cap.prey, c.store.prey + cr.amt);
  a.carry = null; sim.event('deposit', a);
}
function idle(sim, a, dt) {
  if (a.loc !== 'nest' && sim.nest) { const r = goHome(sim, a, dt); return; }
  if (a.loc === 'nest') { if (a.carry) deposit(sim, a); }
}
function rest(sim, a, dt) {
  const n = sim.nest; if (!n) return idle(sim, a, dt);
  const rc = restChamber(sim);
  if (a.loc !== 'nest' || (rc && a.node !== rc.id)) { const r = goHome(sim, a, dt, rc ? rc.id : undefined); if (r !== 'arrived') return; }
  a.anim.mv = 0; if (a.carry) deposit(sim, a);
  a.rest += dt * 1.2; if (a.rest > 85) { a.rest = 40; a.decide = 0; a.task = 'idle'; }
}

// ---- étkezés a készletből / saját vadászat
function eat(sim, a, dt) {
  const c = sim.colony, sp = S(sim);
  if (a.loc !== 'nest') { const r = goHome(sim, a, dt); if (r === 'blocked') { setTask(a, sp.hunt.eggs || sp.hunt.live ? 'hunt' : 'forage'); a.self = true; } return; }
  if (c.store.prey + c.store.sugar < 0.5) { setTask(a, sp.hunt.live || sp.hunt.eggs ? 'hunt' : 'forage'); a.self = true; return; }
  if (a.carry) deposit(sim, a);
  a.anim.mv = 0; a._feed = true; a.anim.open = 0.25 + 0.2 * Math.sin(sim.t * 13);
  const take = Math.min(2.2 * dt, c.store.sugar > 0.3 ? c.store.sugar : c.store.prey);
  if (c.store.sugar > 0.3) c.store.sugar -= take; else c.store.prey -= take;
  a.energy = Math.min(100, a.energy + take * EN * 1.6);
  if (a.energy > 88) { a.decide = 0; setTask(a, 'idle'); }
}
// ---- ivás: a vízkészletből vagy cseppből
function drink(sim, a, dt) {
  const c = sim.colony;
  if (a.loc === 'nest' && c.store.water > 1.2) {
    a.anim.mv = 0; const t = Math.min(c.store.water, 1.6 * dt); c.store.water -= t; a.hyd = Math.min(100, a.hyd + t * 14);
    if (a.hyd > 88) { a.decide = 0; setTask(a, 'idle'); } return;
  }
  const src = findWater(sim, a); if (!src) { a.anim.mv = 0; wander(sim, a, dt); return; }
  a.target = src;
  const r = navigate(sim, a, { k: 'g', x: src.x, z: src.z }, 1, dt, { arrive: 1.5, ignoreCover: true });
  if (r === 'arrived' || dist(a.x, a.z, src.x, src.z) < 2.2) {
    a.anim.mv = 0; a.anim.open = 0.3; const rate = 16 * dt; const gain = Math.min(rate, 100 - a.hyd);
    if (src.drop) src.drop.vol -= gain * 0.12; a.hyd += gain;
    if (a.hyd >= 96 || (src.drop && src.drop.vol <= 0.3)) { a.decide = 0; setTask(a, 'idle'); a.anim.open = 0; }
  }
}
export function findWater(sim, a) {
  const w = sim.world, sp = S(sim); let best = null, bd = 1e9;
  for (const d of w.droplets) { const dd = dist(a.x, a.z, d.x, d.z); if (d.vol > 1 && dd < bd && dd < 130) { bd = dd; best = { x: d.x, z: d.z, drop: d }; } }
  if (best) return best;
  // nedves talaj: a legnedvesebb közeli folt
  let bm = 0.55; for (let k = 0; k < 14; k++) { const x = a.x + sim.rng.range(-40, 40), z = a.z + sim.rng.range(-40, 40); const m = moistureAt(w, x, z); if (m > bm) { bm = m; best = { x, z, drop: null }; } }
  return best;
}
function wander(sim, a, dt) {
  if (a.tmr <= 0 || dist(a.x, a.z, a.tx, a.tz) < 1.5) { a.tmr = sim.rng.range(3, 8); a.tx = clamp(a.x + sim.rng.range(-25, 25), -85, 85); a.tz = clamp(a.z + sim.rng.range(-25, 25), -85, 85); }
  a.tmr -= dt; if (a.loc === 'ground') { steerGround(sim, a, a.tx, a.tz, baseSpeed(sim, a) * 0.8, dt); a.anim.mv = 1; placeAnt(sim, a); }
}
function water(sim, a, dt) {
  const c = sim.colony, sp = S(sim);
  if (a.st === '' ) a.st = 'go';
  if (a.st === 'go') {
    const src = findWater(sim, a); if (!src) { setTask(a, 'idle'); return; }
    const r = navigate(sim, a, { k: 'g', x: src.x, z: src.z }, 1, dt, { arrive: 1.5, ignoreCover: true });
    if (a.loc === 'ground' && dist(a.x, a.z, src.x, src.z) < 2.2) { a.st = 'drink'; a.src = src; }
    if (r === 'blocked') a.st = 'idle';
  } else if (a.st === 'drink') {
    const src = a.src; a.anim.mv = 0; a.anim.open = 0.3;
    if (a.hyd < 92) { const g = Math.min(16 * dt, 100 - a.hyd); a.hyd += g; if (src.drop) src.drop.vol -= g * 0.12; }
    else { const amt = Math.min(sp.carry * 0.9, src.drop ? src.drop.vol * 0.4 : 3); a.carry = { kind: 'water', amt }; if (src.drop) src.drop.vol -= amt * 0.35; a.st = 'back'; a.anim.open = 0; }
  } else if (a.st === 'back') {
    const r = goHome(sim, a, dt); if (r === 'arrived' && a.loc === 'nest') { deposit(sim, a); a.st = ''; a.decide = 0; setTask(a, 'idle'); }
    else if (r === 'blocked') { a.st = 'wait'; a.tmr = 3; }
  } else if (a.st === 'wait') { a.tmr -= dt; if (a.tmr <= 0) a.st = 'back'; }
  else if (a.st === 'idle') setTask(a, 'idle');
}

// ---- cukor/nedv/tetem gyűjtése
export function findFoodSource(sim, a) {
  const w = sim.world, sp = S(sim); let best = null, bs = 1e9;
  const onTree = sp.nest.type === 'tree';
  for (const f of w.foods) {
    if (f.amount < 3) continue;
    if (f.limb !== undefined && !onTree) continue;
    let d; if (f.limb !== undefined) { const p = limbPoint(w, f.limb, f.s, f.th, {}); d = dist(a.x, a.z, p.x, p.z) + (p.y) * 0.5; } else d = dist(a.x, a.z, f.x, f.z);
    if (onTree && f.limb === undefined) d *= 1.6;
    if (f.kind === 'dropping' && !onTree) continue;
    if (sim.dangerAt(f.limb !== undefined ? w.limbs[0].base.x : f.x, f.limb !== undefined ? w.limbs[0].base.z : f.z, a) > 0.5) d += 40;
    if (d < bs) { bs = d; best = { kind: 'food', ref: f }; }
  }
  if (sp.hunt.scavenge) for (const lst of [sim.isopods, sim.springtails]) for (const p of lst) {
    if (!p.dead || p.foodLeft < 0.5 || p.fresh < 0.15) continue; const d = dist(a.x, a.z, p.x, p.z); if (d < sp.senses.prey * 3 && d < bs) { bs = d; best = { kind: 'carcass', ref: p }; }
  }
  return best;
}
function forage(sim, a, dt) {
  const c = sim.colony, sp = S(sim);
  if (a.st === '') a.st = 'go';
  if (a.st === 'go') {
    if (!a.target) { a.target = findFoodSource(sim, a); if (!a.target) { a.noTarget += dt; wander(sim, a, dt); if (a.noTarget > 6) setTask(a, 'idle'); return; } }
    const t = a.target; const ref = t.ref; let tg;
    if (t.kind === 'food' && ref.limb !== undefined) tg = { k: 'l', limb: ref.limb, s: ref.s, th: ref.th }; else tg = { k: 'g', x: ref.x, z: ref.z };
    if (t.kind === 'carcass' && (ref.foodLeft < 0.3)) { a.target = null; return; }
    const r = navigate(sim, a, tg, 1, dt, { arrive: 1.4 });
    const near = tg.k === 'g' ? (a.loc === 'ground' && dist(a.x, a.z, tg.x, tg.z) < 2.0) : (a.loc === 'limb' && a.limb === tg.limb && Math.hypot(a.ls - tg.s, angDiff(a.lth, tg.th) * 5) < 1.6);
    if (near) { a.st = 'take'; a.tmr = 0; }
    if (r === 'blocked') { a.target = null; }
  } else if (a.st === 'take') {
    const t = a.target; const ref = t.ref; if (ref.limb === undefined) feedPose(sim, a, ref.x, ref.z, t.kind === 'carcass' ? ref.len : 0.6, dt, t.kind === 'carcass' ? ref.yaw : undefined); else { a._feed = true; a.anim.mv = 0; a.anim.open = 0.3 + 0.2 * Math.sin(sim.t * 13); } if (t.kind === 'carcass') ref.beingEaten = sim.t;
    const left = t.kind === 'food' ? ref.amount : ref.foodLeft; if (left < 0.2) { a.st = 'go'; a.target = null; return; }
    const full = a.energy > 85 && (a.crop >= sp.crop[a.caste === 'queen' ? 'queen' : 'worker'] * 0.9);
    const eatRate = 1.4 * dt;
    if (a.energy < 80 || a.self) { const x = Math.min(left, eatRate); if (t.kind === 'food') ref.amount -= x; else ref.foodLeft -= x; a.energy = Math.min(100, a.energy + x * EN * (ref.kind === 'sap' ? 1.5 : 1)); if (a.energy > 88) a.self = false; return; }
    const amt = Math.min(sp.carry, left); if (t.kind === 'food') ref.amount -= amt; else ref.foodLeft -= amt;
    a.carry = { kind: t.kind === 'food' && ref.kind === 'sap' ? 'sugar' : 'prey', amt }; a.anim.open = 0; a.st = 'back';
  } else if (a.st === 'back') {
    const r = goHome(sim, a, dt); if (r === 'arrived' && a.loc === 'nest') { deposit(sim, a); a.target = null; a.st = 'go'; a.decide = 0; setTask(a, 'idle'); }
    else if (r === 'blocked') { a.st = 'wait'; a.tmr = 3; }
  } else if (a.st === 'wait') { a.tmr -= dt; if (a.tmr <= 0) a.st = 'back'; }
}

// ---------------------------------------------------------------- vadászat (élő zsákmány, tetem) / petelopás (Proceratium)
export function getTarget(sim, t) {
  if (!t) return null; const lst = t.kind === 'isopod' ? sim.isopods : t.kind === 'springtail' ? sim.springtails : t.kind === 'clutch' ? sim.clutches : null;
  return lst ? lst.find((q) => q.id === t.id) : null;
}
export function findPrey(sim, a) {
  const sp = S(sim), H = sp.hunt, R = sp.senses.prey * (a.caste === 'queen' ? 1 : 1);
  let best = null, bs = 1e9;
  const consider = (kind, p, d, extra = 0) => { const sc = d + extra; if (sc < bs && sim.dangerAt(p.x, p.z, a) < 0.5) { bs = sc; best = { kind, id: p.id }; } };
  if (H.eggs) {
    for (const c of sim.clutches) {
      if (c.dead || c.n <= 0) continue; const d = dist(a.x, a.z, c.x, c.z);
      const hid = c.hidden; if (d > sp.senses.eggs * (hid ? 0.8 : 1.2) + (c.n > 20 ? 6 : 0)) continue;
      consider('clutch', c, d, (c.owner === 'spider' ? 4 : 0) - Math.min(c.n, 40) * 0.15);
    }
    return best;
  }
  for (const p of sim.springtails) {
    if (p.dead) { if (H.scavenge && p.foodLeft > 0.1 && p.fresh > 0.2) { const d = dist(a.x, a.z, p.x, p.z); if (d < R * 1.3) consider('springtail', p, d, 2); } continue; }
    if (!H.live || p.state === 'jump') continue; const d = dist(a.x, a.z, p.x, p.z); if (d < R) consider('springtail', p, d, a.len * 0.4);
  }
  for (const p of sim.isopods) {
    const d = dist(a.x, a.z, p.x, p.z);
    if (p.dead) { if (H.scavenge && p.foodLeft > 0.3 && p.fresh > 0.15 && d < R * 1.6) consider('isopod', p, d, 1); continue; }
    if (!H.live) continue;
    const ratio = p.len / a.len; if (ratio > H.maxRatio * (1 + 0.6 * sim.groupSize(a, 18) * H.group)) continue;
    if (p.state === 'hidden') { const c = sim.world.covers.find((q) => q.id === p.cover); if (!c || dist(a.x, a.z, c.x, c.z) > c.r + 4 || !sim.rng.chance(0.012 * H.crevice * 6)) continue; consider('isopod', p, d, 3); continue; }
    if (d < R) consider('isopod', p, d, ratio * 3);
  }
  return best;
}
// a támadás sikerének valószínűsége (játékmechanikai képlet; a faj és a zsákmány méretétől, az állapottól függ)
export function strikeChance(sim, a, p) {
  const H = S(sim).hunt; const ratio = p.len / a.len;
  const f = ratio <= 0.45 ? 1 : ratio <= H.maxRatio ? 1 - 0.5 * (ratio - 0.45) / Math.max(0.01, H.maxRatio - 0.45) : 0.08;
  const health = 0.45 + 0.55 * clamp(a.hp / a.maxHp, 0, 1), fed = 0.55 + 0.45 * clamp(a.energy / 80, 0, 1);
  let c = H.base * f * health * fed * (p.alert > 0 ? 0.75 : 1) * (1 - (p.armor || 0) * (1 - H.armorPierce));
  if (p.kind === 'springtail') c *= p.state === 'jump' ? 0 : (a.slow ? 1 : 0.85);
  const allies = sim.groupSize(a, 12, p); c = 1 - (1 - c) * Math.pow(0.7, allies * H.group);
  if (a.mand < 0.7 && H.style === 'snap') c *= 0.6 + a.mand * 0.4;
  return clamp(c, 0, 0.97);
}
const stat = (sim, k) => { sim.stats = sim.stats || {}; sim.stats[k] = (sim.stats[k] || 0) + 1; };
export function applyStrike(sim, a, p) {
  const r0 = applyStrike0(sim, a, p); stat(sim, `strike_${p.kind}_${r0}`); return r0;
}
function applyStrike0(sim, a, p) {
  const H = S(sim).hunt, rng = sim.rng; a.energy -= H.energyCost; a.cd = H.cooldown * rng.range(0.85, 1.2); a.anim.act = 1; a.anim.actT = 0;
  const ok = rng.chance(strikeChance(sim, a, p));
  if (H.style === 'snap') { a.anim.open = 0; a.anim.snapT = 0.18; if (p.armor > 0.55 && rng.chance(H.injury + 0.1)) a.mand = Math.max(0.2, a.mand - 0.25); }
  if (!ok) { if (p.kind === 'isopod') { p.alert = 3; p.state = p.state === 'hidden' ? 'flee' : p.state; p.threat = a; } return 'miss'; }
  const big = p.len / a.len;
  let dmg = H.style === 'snap' ? 8 + 10 * a.len / 10 : H.style === 'sting' ? 5 : 2.5;
  if (p.kind === 'springtail') dmg = 99;
  p.hp -= dmg; if (H.style === 'sting' && p.kind === 'isopod') p.para = H.paralyze * (0.6 + big);
  if (p.hp <= 0) { if (p.kind === 'isopod') killIsopod(sim, p, a); else { p.dead = true; p.state = 'dead'; } a.kills++; sim.event('kill', a); return 'kill'; }
  p.held = 1.2; if (rng.chance(H.injury + big * 0.04)) damageAnt(sim, a, 2 + big * 3, 'zsákmány'); return 'hit';
}
function hunt(sim, a, dt) {
  const sp = S(sim), H = sp.hunt, n = sim.nest, rng = sim.rng;
  if (H.eggs) return raid(sim, a, dt);
  if (a.st === '') { a.st = 'search'; a.wp = null; }
  a.slow = false;
  if (a.st === 'search') {
    a.look = (a.look || 0) - dt;
    if (a.look <= 0) { a.look = 0.35; if (a.loc !== 'nest') { const f = findPrey(sim, a); if (f) { a.target = f; a.st = 'approach'; a.lost = 0; stat(sim, 'found_' + f.kind); return; } } }
    if (!a.wp || dist(a.x, a.z, a.wp.x, a.wp.z) < 2 || a.tmr <= 0) { a.wp = (sim.rng.next() < trailStrength(sim) && followDir(sim, a)) || huntWaypoint(sim, a); a.tmr = 14; }
    a.tmr -= dt; a.huntT = (a.huntT || 0) + dt;
    if (a.loc === 'limb' && sp.nest.type === 'tree') { a.st = 'search'; }
    const r = navigate(sim, a, { k: 'g', x: a.wp.x, z: a.wp.z }, 0.85, dt, { arrive: 1.5 });
    if (a.huntT > 70) { a.huntT = 0; a.st = 'return_empty'; }
    if (r === 'blocked') a.wp = null;
  } else if (a.st === 'approach') {
    const p = getTarget(sim, a.target); if (!p || (p.dead && p.foodLeft <= 0.1) || (p.dead && p.fresh <= 0)) { stat(sim, 'lost_gone'); a.st = 'search'; a.target = null; return; }
    const d = dist(a.x, a.z, p.x, p.z); const reach = H.reach * a.len + p.len * 0.4;
    if (p.kind === 'isopod' && p.state === 'hidden') { /* odatartás: a kő széléig */ }
    if (d > sp.senses.prey * 2.4 && !a.order) { stat(sim, 'lost_far_' + p.kind); a.st = 'search'; a.target = null; return; }
    a.slow = (H.style === 'sting') && d < 8 && !p.dead;
    const sm = p.dead ? 1 : H.style === 'sting' ? (d < 8 ? 0.45 : 0.9) : H.style === 'snap' ? (d < 6 ? 0.6 : 1.15) : 0.85;
    navigate(sim, a, { k: 'g', x: p.x, z: p.z }, sm, dt, { arrive: reach * 0.8, ignoreObstacles: false });
    if (H.style === 'snap' && d < reach * 3 && !p.dead) a.anim.open = clamp(a.anim.open + dt * 8, 0, 1);
    if (d <= reach) { a.st = p.dead ? 'feed' : 'attack'; a.tmr = 0; }
  } else if (a.st === 'attack') {
    const p = getTarget(sim, a.target); if (!p || p.dead) { a.st = p && p.dead ? 'feed' : 'search'; return; }
    const d = dist(a.x, a.z, p.x, p.z); const reach = H.reach * a.len + p.len * 0.5;
    a.anim.mv = 0; a.yaw = turnToward(a.yaw, Math.atan2(p.x - a.x, p.z - a.z), dt * 12);
    if (d > reach * 1.8) { a.st = 'approach'; return; }
    if (H.style === 'snap') a.anim.open = clamp(a.anim.open + dt * 10, 0, 1);
    if (a.cd <= 0 && (H.style !== 'snap' || a.anim.open > 0.9)) {
      const res = applyStrike(sim, a, p);
      if (res === 'kill') { a.st = 'feed'; }
      else if (res === 'miss') { a.fails = (a.fails || 0) + 1; if (a.fails > (p.kind === 'springtail' ? 2 : 4)) { a.st = 'search'; a.target = null; a.fails = 0; } }
    }
  } else if (a.st === 'feed') {
    const p = getTarget(sim, a.target); if (!p) { a.st = 'search'; return; }
    if (p.state !== 'dead' && !p.dead) { a.st = 'attack'; return; }
    feedPose(sim, a, p.x, p.z, p.len, dt, p.yaw); p.beingEaten = sim.t;
    const left = p.foodLeft; const cropMax = sp.crop[a.caste === 'queen' ? 'queen' : 'worker'];
    if (left < 0.12) { a.st = a.carry ? 'back' : 'search'; a.target = null; return; }
    if (a.energy < 90 && (a.self || a.energy < 70 || a.caste === 'queen')) { const x = Math.min(left, 1.5 * dt); p.foodLeft -= x; a.energy = Math.min(100, a.energy + x * EN); return; }
    if (a.caste === 'queen' && a.energy >= 90) { const x = Math.min(left, 1.0 * dt, cropMax - a.crop); if (x > 0) { p.foodLeft -= x; a.crop += x; return; } a.st = 'search'; a.target = null; return; }
    const amt = Math.min(sp.carry, left); p.foodLeft -= amt; a.carry = { kind: 'prey', amt }; a.st = 'back'; a.anim.open = 0; a.self = false;
  } else if (a.st === 'back' || a.st === 'return_empty') {
    const r = goHome(sim, a, dt);
    if (r === 'arrived' && a.loc === 'nest') { if (a.carry) deposit(sim, a); a.st = ''; a.target = null; a.decide = 0; setTask(a, 'idle'); }
    else if (r === 'blocked') { a.st = 'waitNest'; a.tmr = 3; }
  } else if (a.st === 'waitNest') { a.tmr -= dt; a.anim.mv = 0; if (a.tmr <= 0) a.st = 'back'; }
}
export function huntWaypoint(sim, a) {
  const w = sim.world, rng = sim.rng, n = sim.nest; const home = n ? n.nodes[0] : { x: a.x, z: a.z };
  const R = clamp(22 + sim.colonySize() * 1.2 + (a.energy < 50 ? 20 : 0), 22, 78);
  let best = { x: a.x, z: a.z }, bs = -1e9;
  for (let k = 0; k < 8; k++) {
    const ang = rng.range(0, 6.28), r = rng.range(8, R); const x = clamp(home.x + Math.cos(ang) * r, -w.half + 5, w.half - 5), z = clamp(home.z + Math.sin(ang) * r, -w.half + 5, w.half - 5);
    const cv = nearestCover(w, x, z, 30); const m = moistureAt(w, x, z);
    let sc = m * 2 + (cv ? 1.2 - cv.d / 30 : 0) + rng.range(0, 0.5); sc -= sim.dangerAt(x, z, a) * 6;
    if (sc > bs) { bs = sc; best = { x, z }; }
  }
  return best;
}
// ---- Proceratium: tojáslopás
function raid(sim, a, dt) {
  const sp = S(sim), H = sp.hunt, rng = sim.rng;
  if (a.st === '') { a.st = 'search'; a.wp = null; }
  if (a.st === 'search') {
    a.look = (a.look || 0) - dt;
    if (a.look <= 0) { a.look = 0.5; if (a.loc !== 'nest') { const f = findPrey(sim, a); if (f) { a.target = f; a.st = 'approach'; return; } } }
    if (!a.wp || dist(a.x, a.z, a.wp.x, a.wp.z) < 2 || a.tmr <= 0) { a.wp = eggWaypoint(sim, a); a.tmr = 16; }
    a.tmr -= dt; a.huntT = (a.huntT || 0) + dt;
    const r = navigate(sim, a, { k: 'g', x: a.wp.x, z: a.wp.z }, 0.8, dt, { arrive: 1.5 }); if (r === 'blocked') a.wp = null;
    if (a.huntT > 80) { a.huntT = 0; a.st = 'back'; }
  } else if (a.st === 'approach') {
    const c = getTarget(sim, a.target); if (!c || c.n <= 0 || c.dead) { a.st = 'search'; a.target = null; return; }
    const d = dist(a.x, a.z, c.x, c.z); a.slow = true;
    navigate(sim, a, { k: 'g', x: c.x, z: c.z }, d < 8 ? 0.55 : 0.9, dt, { arrive: 1.2 });
    if (d < 1.6) { a.st = 'steal'; a.tmr = 0; }
    if (d > sp.senses.eggs * 2) { a.st = 'search'; a.target = null; }
  } else if (a.st === 'steal') {
    const c = getTarget(sim, a.target); if (!c || c.n <= 0) { a.st = a.carry ? 'back' : 'search'; return; }
    a.anim.mv = 0; a.anim.open = 0.4 + 0.2 * Math.sin(sim.t * 8); a.tmr += dt;
    // a pók/ászka-anya reagálhat
    if (c.owner === 'isopod') { const h = sim.isopods.find((q) => q.id === c.host); if (h && !h.dead && rng.chance(dt * 0.12)) { h.state = 'flee'; h.alert = 3; h.threat = a; } }
    if (c.owner === 'spider') { const s = sim.spiders.find((q) => q.id === c.host); if (s && !s.dead && s.state === 'lair' && rng.chance(dt * 0.35 * (1 - sp.defend.stealth * 0.5))) { s.target = a; s.state = 'stalk'; s.hidden = false; } }
    if (a.tmr > 1.6) {
      a.tmr = 0; const maxEggs = Math.max(1, Math.floor((sp.carry - (a.carry ? a.carry.amt : 0)) / c.per));
      const k = Math.min(c.n, maxEggs, rng.int(2, 6)); if (k <= 0) { a.st = 'back'; return; }
      c.n -= k; c.taken += k; a.carry = { kind: 'eggs', amt: (a.carry ? a.carry.amt : 0) + k * c.per, owner: c.owner }; sim.event('steal', a);
      if (a.carry.amt >= sp.carry * 0.9 || c.n <= 0) { a.st = 'back'; a.anim.open = 0; }
    }
  } else if (a.st === 'back') {
    const r = goHome(sim, a, dt);
    if (r === 'arrived' && a.loc === 'nest') { if (a.carry) deposit(sim, a); a.st = ''; a.target = null; a.decide = 0; setTask(a, 'idle'); }
    else if (r === 'blocked') { a.st = 'waitNest'; a.tmr = 3; }
  } else if (a.st === 'waitNest') { a.tmr -= dt; a.anim.mv = 0; if (a.tmr <= 0) a.st = 'back'; }
}
function eggWaypoint(sim, a) {
  const w = sim.world, rng = sim.rng, home = sim.nest ? sim.nest.nodes[0] : a;
  const cands = sim.clutches.filter((c) => !c.dead && c.n > 0 && c.owner !== 'spider' || (c.owner === 'spider' && !c.dead));
  // az illat alapján a nagyobb tojáscsomók felé hajlik; különben a nedves, búvóhelyes foltok felé
  if (cands.length && rng.chance(0.6)) { const c = rng.pick(cands); if (sim.dangerAt(c.x, c.z, a) < 0.5 || c.owner === 'spider') return { x: c.x + rng.range(-8, 8), z: c.z + rng.range(-8, 8) }; }
  return huntWaypoint(sim, a);
}

// ---------------------------------------------------------------- fiasításgondozás
function nurse(sim, a, dt) {
  const sp = S(sim), c = sim.colony, n = sim.nest; if (!n) return setTask(a, 'idle');
  if (a.carry && a.carry.kind !== 'brood') { const r = goHome(sim, a, dt); if (a.loc === 'nest') deposit(sim, a); return; }
  if (a.st === '' || a.st === 'pick') {
    // 1) rossz klímában lévő fiasítás áthelyezése 2) éhes lárva etetése
    let bad = null; for (const b of sim.brood) { const nd = node(n, b.node); if (!nd || b.carried) continue; const q = chamberQuality(sim, nd).q; if ((q < 0.45 || nd.flood > 0) && broodChamber(sim, nd.id)) { bad = b; break; } }
    if (bad) { a.target = { kind: 'brood', id: bad.id }; a.st = 'goBrood'; bad.claimed = a.id; return; }
    const hungry = sim.brood.filter((b) => b.stage === 'larva' && b.fed < 0.6 && !b.dead).sort((x, y) => x.fed - y.fed)[0];
    if (hungry && (c.store.prey + c.store.sugar > 0.5 || a.crop > 1 || a.energy > 60)) { a.target = { kind: 'brood', id: hungry.id }; a.st = 'goFeed'; return; }
    a.tmr -= dt; if (a.tmr <= 0) { a.tmr = 2.5; a.decide = 0; setTask(a, 'idle'); } a.anim.mv = 0; if (a.loc !== 'nest') goHome(sim, a, dt); return;
  }
  const b = sim.brood.find((q) => q.id === (a.target && a.target.id)); if (!b || b.dead) { a.st = ''; return; }
  if (a.st === 'goFeed' || a.st === 'goBrood') {
    const r = navigate(sim, a, { k: 'n', node: b.node }, 1, dt);
    if (a.loc === 'nest' && a.node === b.node && !a.path) {
      if (a.st === 'goFeed') { a.st = 'feeding'; a.tmr = 0; } else { b.carried = a.id; a.carry = { kind: 'brood', id: b.id }; const dest = broodChamber(sim, b.node); a.dest = dest ? dest.id : null; a.st = 'moveBrood'; }
    } else if (r === 'blocked') a.st = '';
  } else if (a.st === 'feeding') {
    a.anim.mv = 0; a.anim.open = 0.5 + 0.4 * Math.sin(sim.t * 6); a.tmr += dt;
    if (a.tmr > 1.4) {
      a.tmr = 0; const need = sp.brood.larvaNeed / 7 * 0.55;
      if (a.crop > 0.3) { a.crop -= need; b.fed = Math.min(1, b.fed + 0.45); }
      else if (c.store.prey > need) { c.store.prey -= need; b.fed = Math.min(1, b.fed + 0.45); }
      else if (c.store.sugar > need * 0.5) { c.store.sugar -= need * 0.5; b.fed = Math.min(1, b.fed + 0.2); }
      else if (a.caste === 'queen' && a.energy > 55) { a.energy -= need * EN * 0.8; b.fed = Math.min(1, b.fed + 0.3); }
      else { a.st = ''; return; }
      if (b.fed > 0.9) { a.st = ''; a.anim.open = 0; }
    }
  } else if (a.st === 'moveBrood') {
    if (a.dest == null) { b.carried = null; a.carry = null; a.st = ''; return; }
    const r = navigate(sim, a, { k: 'n', node: a.dest }, 0.9, dt);
    if (a.loc === 'nest' && a.node === a.dest && !a.path) { b.node = a.dest; b.carried = null; a.carry = null; a.st = ''; }
    else if (r === 'blocked') { b.carried = null; a.carry = null; a.st = ''; }
  }
}

// ---------------------------------------------------------------- ásás és javítás
function dig(sim, a, dt) {
  const sp = S(sim), n = sim.nest; if (!n) return setTask(a, 'idle');
  const job = n.jobs.find((j) => j.active); if (!job) { a.anim.act = 0; setTask(a, 'idle'); return; }
  if (a.st !== 'work' && a.anim.act === 3) a.anim.act = 0;
  if (a.st === '' || a.st === 'go') {
    const r = navigate(sim, a, { k: 'n', node: job.cur }, 1, dt);
    if (a.loc === 'nest' && a.node === job.cur && !a.path) { a.st = 'work'; a.load = 0; }
    else if (r === 'blocked') { a.st = ''; setTask(a, 'idle'); }
  } else if (a.st === 'work') {
    a.anim.mv = 0; a.anim.act = 3; a.anim.open = 0.4 + 0.4 * Math.abs(Math.sin(sim.t * 7)); a.anim.curl = 0.2;
    const rate = sp.nest.digRate * (a.caste === 'queen' ? 0.8 : 1) * 1.0;
    const face = node(n, job.cur); if (!face) { a.st = ''; return; }
    const changed = digWork(n, sp, sim.world, job, rate * dt * 2.2); a.load += rate * dt * 2.2;
    if (changed) sim.nestDirty = true;
    if (a.load > 5.5 || !job.active) { a.st = 'haul'; a.anim.open = 0; a.carry = { kind: 'soil' }; }
    if (job.cur !== a.node && face) { a.node = job.cur; placeInNode(sim, a); }
  } else if (a.st === 'haul') {
    const r = navigate(sim, a, { k: 'g', x: n.nodes[0].x + sim.rng.range(-3, 3), z: n.nodes[0].z + sim.rng.range(-3, 3) }, 1, dt, { arrive: 1.0 });
    if (a.loc === 'ground' && (r === 'arrived' || dist(a.x, a.z, n.nodes[0].x, n.nodes[0].z) < 3.4)) {
      sim.world.pellets = sim.world.pellets || []; sim.world.pellets.push({ x: a.x, z: a.z, s: sim.rng.range(0.25, 0.5) }); if (sim.world.pellets.length > 260) sim.world.pellets.shift();
      a.carry = null; a.st = ''; a.anim.curl = 0; if (!n.jobs.some((j) => j.active)) setTask(a, 'idle');
    }
  }
}
function repair(sim, a, dt) {
  const n = sim.nest; if (!n) return setTask(a, 'idle');
  const e = n.edges.find((q) => q.collapsed); if (!e) { setTask(a, 'idle'); return; }
  const na = node(n, e.a), nb = node(n, e.b);
  const side = (a.node === e.a || a.node === e.b) ? a.node : e.a;
  if (a.loc !== 'nest' || (a.node !== e.a && a.node !== e.b)) {
    const reach = findPath(n, a.loc === 'nest' ? a.node : n.entranceId, e.a, true) ? e.a : e.b;
    navigate(sim, a, { k: 'n', node: reach }, 1, dt); return;
  }
  a.anim.mv = 0; a.anim.open = 0.4 + 0.3 * Math.sin(sim.t * 8); e.fix = (e.fix || 0) + dt * 0.18;
  if (e.fix >= 1) { e.collapsed = false; e.fix = 0; e.stability = 0.7; a.decide = 0; setTask(a, 'idle'); sim.nestDirty = true; }
}
function guard(sim, a, dt) {
  const n = sim.nest; if (!n) return setTask(a, 'idle');
  const r = navigate(sim, a, { k: 'n', node: n.entranceId }, 1, dt, { ignorePlug: true });
  a.anim.mv *= 1; a.anim.alert = 0.8; a.tmr += dt;
  if (a.tmr > 25 && !sim.threatNearNest) { a.tmr = 0; a.decide = 0; setTask(a, 'idle'); }
}
// ---- Cephalotes katona: a bejárat elzárása a lapos fejjel
function plug(sim, a, dt) {
  const sp = S(sim), n = sim.nest; if (!n || a.caste !== 'soldier') return setTask(a, 'flee', 'run');
  const r = navigate(sim, a, { k: 'n', node: n.entranceId }, 1.15, dt, { ignorePlug: true });
  if (a.loc === 'nest' && a.node === n.entranceId && !a.path) {
    n.plug.active = true; n.plug.by = a.id; a.plugging = true; a.anim.mv = 0; a.anim.alert = 0; a.anim.curl = 0;
    const thr = sim.spiders.some((s) => !s.dead && s.state !== 'lair' && dist(s.x, s.z, n.nodes[0].x, n.nodes[0].z) < 30);
    if (!thr) { a.tmr += dt; if (a.tmr > 5) { n.plug.active = false; n.plug.by = null; a.plugging = false; a.tmr = 0; a.decide = 0; setTask(a, 'idle'); } } else a.tmr = 0;
  }
}

// ---------------------------------------------------------------- petézés / fészekkeresés
function lay(sim, a, dt) {
  const n = sim.nest; if (!n) return setTask(a, 'idle'); const bc = broodChamber(sim);
  if (!bc) { setTask(a, 'idle'); return; }
  if (a.loc !== 'nest' || a.node !== bc.id || a.path) { const r = navigate(sim, a, { k: 'n', node: bc.id }, 1, dt); if (r === 'blocked') setTask(a, 'idle'); return; }
  a.anim.mv = 0; a.anim.curl = 0.5; a.tmr += dt;
  if (a.tmr > 3) { layEgg(sim, a); a.tmr = 0; a.anim.curl = 0; a.decide = 0; setTask(a, 'idle'); }
}
function seekNest(sim, a, dt) {
  const sp = S(sim), w = sim.world;
  if (!a.site) {
    if (sim.nestSite) a.site = sim.nestSite;
    else a.site = autoSite(sim, a);
    sim.nestSite = a.site;
  }
  const st = a.site;
  if (sp.nest.type === 'tree') {
    const cav = w.cavities[st.cavityId];
    const r = navigate(sim, a, { k: 'l', limb: cav.limb, s: cav.s, th: cav.th }, 1, dt, { arrive: 1.0 });
    if (a.loc === 'limb' && a.limb === cav.limb && Math.hypot(a.ls - cav.s, angDiff(a.lth, cav.th) * w.limbs[cav.limb].r) < 1.4) {
      sim.createNest({ kind: 'cavity', cavityId: st.cavityId });
      a.loc = 'nest'; a.node = sim.nest.entranceId; a.path = null; placeInNode(sim, a); setTask(a, 'idle'); a.decide = 0;
    }
  } else {
    const r = navigate(sim, a, { k: 'g', x: st.x, z: st.z }, 1, dt, { arrive: 1.5 });
    if (a.loc === 'ground' && dist(a.x, a.z, st.x, st.z) < 2.2) {
      a.anim.mv = 0; a.anim.open = 0.5 + 0.3 * Math.sin(sim.t * 8); a.tmr += dt;
      if (a.tmr > 5) {
        sim.createNest({ kind: 'soil', x: a.x, z: a.z });
        const dep = -7.5, ang = sim.rng.range(0, 6.28);
        sim.addDig(sim.nest.entranceId, { x: a.x + Math.cos(ang) * 4, y: dep, z: a.z + Math.sin(ang) * 4 }, 'brood');
        a.loc = 'nest'; a.node = sim.nest.entranceId; placeInNode(sim, a); setTask(a, 'dig'); a.anim.open = 0;
      }
    }
  }
}
export function autoSite(sim, a) {
  const sp = S(sim), w = sim.world, rng = sim.rng;
  if (sp.nest.type === 'tree') {
    // az üreg bejárata a királynő testéhez (≈ 2,8 mm) és a katona fejéhez (≈ 3,5 mm) illeszkedjen, ne legyen túl tág
    let best = 0, bs = -1e9;
    for (const c of w.cavities) { const fit = -Math.abs(c.entrance - 3.6) * 2 - (c.entrance < 3.0 ? 6 : 0) + c.moist * 2 + c.rooms * 0.3 + rng.range(0, 0.3); if (fit > bs) { bs = fit; best = c.id; } }
    return { kind: 'cavity', cavityId: best };
  }
  let best = { x: a.x, z: a.z }, bs = -1e9;
  for (let k = 0; k < 14; k++) {
    const x = clamp(a.x + rng.range(-30, 30), -80, 80), z = clamp(a.z + rng.range(-30, 30), -80, 80);
    let sc = moistureAt(w, x, z) * 2.4 + rng.range(0, 0.3); const cv = nearestCover(w, x, z, 14);
    if (cv) sc += 0.6 - Math.abs(cv.d - 3) * 0.04;                        // kő mellett: védett, de nem alatta
    for (const l of w.lairs) if (l.occupied) sc -= Math.max(0, 40 - dist(x, z, l.x, l.z)) * 0.06;
    for (const o of obstaclesAt(w, x, z, 4)) if (dist(x, z, o.x, o.z) < o.r + 3) sc -= 5;
    sc -= dist(x, z, a.x, a.z) * 0.01; if (sc > bs) { bs = sc; best = { x, z }; }
  }
  return { kind: 'soil', x: best.x, z: best.z };
}

// ---------------------------------------------------------------- menekülés és védekezés
function flee(sim, a, dt) {
  const sp = S(sim), D = sp.defend, n = sim.nest; const thr = a.target;
  if (a.loc === 'nest') { a.anim.mv = 0; a.fleeT -= dt; if (a.fleeT <= 0) { a.decide = 0; setTask(a, 'idle'); } return; }
  if (!thr || thr.dead || thr.state === 'lair') { a.fleeT -= dt * 3; }
  a.fleeT -= dt; if (a.fleeT <= 0 && (!thr || dist(a.x, a.z, thr.x, thr.z) > sp.senses.spider)) { a.decide = 0; setTask(a, a.loc === 'nest' ? 'idle' : 'idle'); return; }
  const d = thr ? dist(a.x, a.z, thr.x, thr.z) : 99; const C = thr && thr.cls ? SPIDER.classes[thr.cls] : null;
  // rejtőzés (Ponera, Proceratium): megdermed, amíg a pók nem őket üldözi
  if (D.escape === 'hide' && thr && thr.state !== 'stalk' && thr.state !== 'lunge' && d > (C ? C.lunge * 2.2 : 12) && a.loc === 'ground') {
    a.anim.mv = 0; a.hiding = true; a.st = 'freeze'; return;
  }
  a.hiding = false;
  // csapdakapocs-ugrás (Odontomachus): a rágók földhöz csapásával elugrik
  if (D.escape === 'jump' && thr && d < (C ? C.lunge * 1.6 : 12) && a.jumpCd <= 0 && a.loc === 'ground') {
    const away = Math.atan2(a.x - thr.x, a.z - thr.z) + sim.rng.range(-0.4, 0.4); const L = 14 + sim.rng.range(0, 8);
    a.x = clamp(a.x + Math.sin(away) * L, -85, 85); a.z = clamp(a.z + Math.cos(away) * L, -85, 85); a.yaw = away; a.jumpCd = 9; a.leap = 5; a.anim.act = 2; a.mand = Math.max(0.35, a.mand - 0.15); a.dodgeT = 0.6; sim.event('jump', a); return;
  }
  // célpont: a fészek bejárata, ha közel van és nincs elzárva; különben a legközelebbi búvóhely a póktól elfelé
  let tgt = null;
  if (n && !(n.plug.active && a.caste !== 'soldier')) { const e = n.nodes[0]; if (dist(a.x, a.z, e.x, e.z) < 70) tgt = { k: 'n', node: n.entranceId }; }
  if (!tgt) { const c = nearestCover(sim.world, a.x, a.z, 60, (q) => !thr || dist(q.x, q.z, thr.x, thr.z) > dist(a.x, a.z, thr.x, thr.z) * 0.9); if (c) tgt = { k: 'g', x: c.cover.x, z: c.cover.z }; else if (thr) { const ang = Math.atan2(a.x - thr.x, a.z - thr.z); tgt = { k: 'g', x: a.x + Math.sin(ang) * 20, z: a.z + Math.cos(ang) * 20 }; } }
  if (!tgt) return;
  a.anim.alert = 1; const r = navigate(sim, a, tgt, D.flee * 1.15, dt, { arrive: 1.2, ignoreCover: true, ignoreObstacles: false });
  if (r === 'arrived' && tgt.k === 'g') { a.anim.mv = 0; a.hiding = true; }
  if (a.loc === 'nest') a.fleeT = Math.max(a.fleeT, 5);
}
function fight(sim, a, dt) {
  const sp = S(sim), D = sp.defend; const s = a.target;
  if (!s || s.dead || s.state === 'lair' || s.state === 'flee' || a.hp < a.maxHp * 0.3) { a.decide = 0; setTask(a, s && !s.dead && a.hp < a.maxHp * 0.3 ? 'flee' : 'idle', 'run'); if (a.task === 'flee') { a.fleeT = 5; a.target = s; } return; }
  const C = SPIDER.classes[s.cls]; const d = dist(a.x, a.z, s.x, s.z); const reach = D.fight.range * a.len + s.len * 0.4;
  a.anim.alert = 1;
  if (d > reach) { navigate(sim, a, { k: 'g', x: s.x, z: s.z }, D.flee, dt, { arrive: reach * 0.9, ignoreObstacles: false }); return; }
  a.anim.mv = 0; a.yaw = turnToward(a.yaw, Math.atan2(s.x - a.x, s.z - a.z), dt * 10);
  if (sp.id === 'odonto') a.anim.open = clamp(a.anim.open + dt * 8, 0, 1);
  if (a.cd <= 0) {
    a.cd = 1 / D.fight.rate * sim.rng.range(0.8, 1.3); a.anim.act = 1; a.anim.actT = 0;
    if (sim.rng.chance(clamp(D.fight.rate + 0.25, 0.2, 0.85))) {
      s.hp -= D.fight.dmg * sim.rng.range(0.7, 1.3) * (a.hp / a.maxHp * 0.5 + 0.5);
      if (s.state === 'lair' || s.state === 'wander' || s.state === 'return') { s.target = a; s.state = 'stalk'; s.hidden = false; }
      if (sp.id === 'odonto') a.mand = Math.max(0.3, a.mand - 0.04);
      if (s.hp <= 0) { s.dead = true; s.state = 'dead'; sim.event('spiderDied', s); }
    }
    if (s.state === 'stalk' && s.target !== a && sim.rng.chance(0.25)) s.target = a;
  }
}

// ---------------------------------------------------------------- közvetlen irányítás (belső nézet)
function slide(sim, a, dx, dz) {
  const w = sim.world; const nx = clamp(a.x + dx, -w.half + 2, w.half - 2), nz = clamp(a.z + dz, -w.half + 2, w.half - 2);
  a.x = nx; a.z = nz;
  if (!a.climbing) for (const o of obstaclesAt(w, a.x, a.z, a.len)) { const ox = a.x - o.x, oz = a.z - o.z, od = Math.hypot(ox, oz), lim = o.r + a.len * 0.4; if (od < lim && od > 1e-3) { a.x = o.x + (ox / od) * lim; a.z = o.z + (oz / od) * lim; } }
}
// Étkezési testhelyzet: a hangya a táplálék felé fordul és úgy áll meg, hogy a szája a táplálékon (a tetem testén) legyen; a fej lent, a rágók dolgoznak.
// Az animációs állapotot (act = 4) az updateAnt építi a _feed jelzőből, a fejlehajlás finoman be- és kiúszik.
export function feedPose(sim, a, tx, tz, tlen, dt, tyaw) {
  a._feed = true; a.anim.open = 0.28 + 0.22 * Math.sin(sim.t * 13 + a.id); a.anim.mv = 0;
  if (a.loc !== 'ground' || tx === undefined) return 0;
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz) || 1e-3;
  let edge = (tlen || 0) * 0.24;                                         // a tetem peremének távolsága a közepétől az ant irányában (ellipszis-közelítés)
  if (tyaw !== undefined && tlen) { const phi = Math.atan2(-dx, -dz) - tyaw, A = tlen * 0.48, B = tlen * 0.28, cs = Math.cos(phi), sn = Math.sin(phi); edge = (A * B) / Math.hypot(B * cs, A * sn); }
  const want = a.len * 0.44 + edge * 0.82, diff = d - want;
  a.yaw = turnToward(a.yaw, Math.atan2(dx, dz), dt * 8);
  if (Math.abs(diff) > 0.12) { const m = clamp(diff, -a.len * 1.0 * dt, a.len * 0.9 * dt); a.x += (dx / d) * m; a.z += (dz / d) * m; a.moved = Math.abs(m); placeAnt(sim, a); }
  return diff;
}
// Felszíni ásás: a hangya a talajba ás (lábak kaparnak, a fej lent, morzsák szállnak); ~6 mp után új akna nyílik, és a hangya a föld alá kerül.
// Az új kijárat ('exit') a fészek többi részéhez a felülnézetben továbbásva kapcsolható (a két járat találkozásakor összekapcsolódnak).
function surfaceDig(sim, a, dt) {
  const sp = S(sim), n = sim.nest, w = sim.world;
  if (n.nodes.length > 90) return;
  for (const e of n.nodes) if ((e.kind === 'entrance' || e.kind === 'exit') && dist(a.x, a.z, e.x, e.z) < e.r + a.len * 0.8) { a.anim.act = 0; return; }   // meglévő nyílás mellett nem ás újat
  if (!a.digAt || dist(a.x, a.z, a.digAt.x, a.digAt.z) > 1.5) { a.digAt = { x: a.x, z: a.z }; a.digSurfP = 0; }
  a.anim.mv = 0; a.anim.act = 3; a.anim.open = 0.4 + 0.4 * Math.abs(Math.sin(sim.t * 7)); a.anim.curl = 0.2; a.moved = 0;
  a.digSurfP = (a.digSurfP || 0) + dt * Math.max(0.12, sp.nest.digRate * 0.34) * (a.caste === 'queen' ? 0.85 : 1);
  a.pelT = (a.pelT || 0) - dt; if (a.pelT <= 0) { a.pelT = 0.55; w.pellets = w.pellets || []; const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), lat = sim.rng.range(-0.5, 0.5) * a.len; w.pellets.push({ x: a.x - fx * a.len * (0.7 + sim.rng.range(0, 0.6)) - fz * lat, z: a.z - fz * a.len * (0.7 + sim.rng.range(0, 0.6)) + fx * lat, s: sim.rng.range(0.22, 0.45) }); if (w.pellets.length > 260) w.pellets.shift(); }
  if (a.digSurfP >= 1) {
    a.digSurfP = 0; a.digAt = null; a.anim.act = 0; const gy = heightAt(w, a.x, a.z);
    const ex = addNode(n, { x: a.x, y: gy, z: a.z, r: sp.nest.entranceW * 0.5, kind: 'exit' }); const sh = addNode(n, { x: a.x, y: gy - 2.4, z: a.z, r: sp.nest.tunnelW * 0.5, kind: 'tunnel' });
    addEdge(n, ex.id, sh.id, sp.nest.tunnelW); sim.nestDirty = true; a.loc = 'nest'; a.node = sh.id; a.nseg = null; a.path = null; placeInNode(sim, a); a.noEnterUntil = sim.t + 1.2;
    sim.log && sim.log('Új járat nyílt a felszínen. A felülnézetben továbbáshatod (bal egérgomb), hogy a fészekhez kapcsold.', 'good');
  }
}
export function manualTargets(sim, a, range) {
  // hatótávon belüli lehetséges célpontok a hangya előtt (±60°)
  const out = []; const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  const add = (kind, p) => { const dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz); if (d > range + (p.len || 0) * 0.5) return; const cos = (dx * fx + dz * fz) / Math.max(1e-3, d); if (cos < 0.35 && d > (p.len || 0) * 0.5) return; out.push({ kind, p, d }); };
  for (const p of sim.springtails) add('springtail', p);
  for (const p of sim.isopods) if (p.state !== 'hidden' || p.dead) add('isopod', p);
  for (const p of sim.clutches) if (!p.dead && p.n > 0) add('clutch', p);
  for (const p of sim.spiders) if (!p.dead && p.state !== 'lair') add('spider', p);
  return out.sort((x, y) => x.d - y.d);
}
function manual(sim, a, dt) {
  const sp = S(sim), inp = sim.input, n = sim.nest, w = sim.world;
  a.yaw += inp.yawD; inp.yawD = 0; a.pitchLook = clamp((a.pitchLook || 0) + inp.pitchD, -1.0, 0.9); inp.pitchD = 0;
  const sprint = inp.sprint && a.energy > 6 ? 1.7 : 1; const crouch = inp.act2 && sp.id !== 'odonto';
  a.hiding = crouch; a.slow = crouch; if (a.loc !== 'nest' && a.anim.act === 3) a.anim.act = 0;
  const spd = baseSpeed(sim, a) * (crouch ? 0.45 : sprint) * (0.5 + 0.5 * a.hp / a.maxHp);
  const src = a.loc === 'ground' && inp.use ? nearbyUse(sim, a) : null;      // evés/ivás közben a hangya a forrásnál marad
  const digging = a.loc === 'ground' && inp.digSurf && !a.climbing && sp.nest.type === 'soil' && !!n && !src;   // felszíni ásás (X)
  if (inp.digSurf && !digging && !inp._noted) { inp._noted = true; sim.note = a.loc !== 'ground' ? null : a.climbing ? null : sp.nest.type !== 'soil' ? 'noDig' : !n ? 'noNest' : null; sim.noteT = sim.t; }
  if (!inp.digSurf) inp._noted = false;
  const fwd = inp.fwd, str = inp.strafe; const mag = (src || digging) ? 0 : Math.hypot(fwd, str);
  a.anim.open = sp.id === 'odonto' ? (inp.act2 ? clamp(a.anim.open + dt * 7, 0, 1) : clamp(a.anim.open - dt * 6, 0, 1)) : (a.anim.open > 0 ? a.anim.open - dt * 4 : 0);
  if (a.loc === 'ground') {
    if (mag > 0.01) {
      const ang = a.yaw + Math.atan2(str, fwd) ; const m = Math.min(1, mag);
      slide(sim, a, Math.sin(ang) * spd * m * dt, Math.cos(ang) * spd * m * dt); a.moved = spd * m * dt;
      if (sprint > 1) a.energy -= dt * 0.9;
    }
    placeAnt(sim, a);
    // bejárat: ha ráérünk, belép (E-vel) – vagy ha a bejáratba sétálunk
    if (n && !a.climbing) { const ent = entrancePos(sim); for (const e of n.nodes) { if (e.kind !== 'entrance' && e.kind !== 'exit') continue; if ((e.kind === 'entrance' && ent.k !== 'g') || e.ready === false) continue; if (dist(a.x, a.z, e.x, e.z) < Math.max(3, e.r + a.len * 0.9) && sim.t > (a.noEnterUntil || 0) && (inp.use || inp.fwd > 0) && !a.digSurfP) { if (!(n.plug.active && a.caste !== 'soldier')) { a.loc = 'nest'; a.node = e.id; a.path = null; a.nseg = null; placeInNode(sim, a); a.lookIn = true; } break; } } }
    if (n && sp.nest.type === 'tree') { const tb = treeBase(sim); if (dist(a.x, a.z, tb.x, tb.z) < tb.r + 1.2 && inp.fwd > 0) { a.loc = 'limb'; a.limb = 0; a.ls = 0.8; a.lth = Math.atan2(a.z - tb.z, a.x - tb.x); } }
  } else if (a.loc === 'limb') {
    const L = w.limbs[a.limb]; const sstep = spd * dt;
    if (mag > 0.01) { a.ls += (-Math.cos(0) * 0 + inp.fwd) * sstep * 0.9; a.lth += (inp.strafe * sstep * 0.9) / L.r; a.moved = sstep * Math.min(1, mag); }
    if (a.ls < 0) { if (a.limb === 0) { const tb = treeBase(sim); a.loc = 'ground'; a.x = tb.x + Math.cos(a.lth) * (tb.r + 1.8); a.z = tb.z + Math.sin(a.lth) * (tb.r + 1.8); a.ls = 0; } else { const P = w.limbs[L.parent]; const old = a.limb; a.limb = L.parent; a.ls = L.sP; a.lth = L.thP; } }
    else if (a.ls > L.len) a.ls = L.len; else for (const C of w.limbs) if (C.parent === a.limb && Math.abs(a.ls - C.sP) < 1.2 && Math.abs(angDiff(a.lth, C.thP)) < 0.4 && inp.use) { a.limb = C.id; a.ls = 0.8; a.lth = C.thP; }
    if (n && n.site.kind === 'cavity') { const cav = w.cavities[n.site.cavityId]; if (a.limb === cav.limb && Math.hypot(a.ls - cav.s, angDiff(a.lth, cav.th) * L.r) < Math.max(3, cav.entrance * 1.1 + a.len * 0.5) && sim.t > (a.noEnterUntil || 0) && (inp.use || inp.fwd > 0) && !(n.plug.active && a.caste !== 'soldier')) { a.loc = 'nest'; a.node = n.entranceId; a.path = null; a.nseg = null; placeInNode(sim, a); } }
    if (a.loc === 'limb') placeAnt(sim, a);
  } else if (a.loc === 'nest') {
    manualNest(sim, a, dt, spd);
  }
  if (digging) surfaceDig(sim, a, dt); else if (a.digSurfP) { a.digSurfP = Math.max(0, a.digSurfP - dt * 0.25); if (!a.digSurfP) a.digAt = null; }
  // ---- mászás (F): a hangya felmászik a kőre / rönkre, ismételt F-re leszáll; a tetején szabadon jár
  a.climbCd = Math.max(0, (a.climbCd || 0) - dt);
  if (inp.climb) {
    inp.climb = false;
    if (a.climbing) { a.climbing = false; a.cb = 1; a.climbCd = 0.3; }
    else if (a.loc === 'ground' && a.climbCd <= 0) {
      let ok = false; const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
      for (let d = 0.4; d <= a.len * 1.3 + 1; d += 0.4) if (climbHeight(w, a.x + fx * d, a.z + fz * d)) { ok = true; break; }
      if (ok || climbHeight(w, a.x, a.z)) { a.climbing = true; a.climbGrace = 3; a.cb = 0; sim.event && sim.event('climb', a); }
    }
  }
  if (a.climbing) { a.climbGrace = (a.climbGrace || 0) - dt; if (a.loc !== 'ground' || (a.climbGrace <= 0 && !climbHeight(w, a.x, a.z))) { a.climbing = false; a.cb = 1; } }
  // ---- műveletek
  const reach = sp.hunt.reach * a.len;
  if (inp.use && !src && a.loc !== 'nest' && a.cd <= 0) { const tg0 = manualTargets(sim, a, Math.max(reach * 1.4, 3.2)); if (tg0.length && !tg0[0].p.dead && (tg0[0].kind === 'springtail' || tg0[0].kind === 'isopod')) inp.act1 = true; }   // E az élő zsákmányra: ütés/harapás
  if (inp.act1 && a.cd <= 0) {
    inp.act1 = false; const H = sp.hunt;
    const tg = manualTargets(sim, a, Math.max(reach * 1.4, 3.2));
    if (a.loc !== 'nest' && tg.length) {
      const t = tg[0];
      if (t.kind === 'spider') { const s = t.p; a.cd = 1 / sp.defend.fight.rate; a.anim.act = 1; a.anim.actT = 0; if (sim.rng.chance(0.55)) { s.hp -= sp.defend.fight.dmg * sim.rng.range(0.8, 1.3); if (s.state === 'lair' || s.state === 'wander') { s.target = a; s.state = 'stalk'; s.hidden = false; } if (s.hp <= 0) { s.dead = true; s.state = 'dead'; } } }
      else if (t.kind === 'clutch') { const c = t.p; const k = Math.min(c.n, 3); const room = sp.carry - (a.carry ? a.carry.amt : 0); const kk = Math.min(k, Math.max(0, Math.floor(room / c.per))); if (kk > 0 && (sp.hunt.eggs || true)) { c.n -= kk; a.carry = { kind: 'eggs', amt: (a.carry ? a.carry.amt : 0) + kk * c.per, owner: c.owner }; a.cd = 0.8; if (c.owner === 'spider') { const s = sim.spiders.find((q) => q.id === c.host); if (s && !s.dead && sim.rng.chance(0.5)) { s.target = a; s.state = 'stalk'; s.hidden = false; } } } }
      else if (t.p.dead) { /* tetem: E-vel */ }
      else { if (H.style === 'snap' && a.anim.open < 0.8) { a.cd = 0.3; } else if (H.style === 'egg') { a.cd = 0.5; } else applyStrike(sim, a, t.p); }
    } else if (H.style === 'snap') { a.cd = 1.2; a.anim.open = 0; a.anim.snapT = 0.18; a.anim.act = 1; a.anim.actT = 0; }
  }
  if (inp.jump && sp.id === 'odonto' && a.jumpCd <= 0 && a.loc === 'ground') {
    inp.jump = false; const L = 15; const ang = a.yaw + (inp.fwd < 0 ? Math.PI : 0); a.x = clamp(a.x + Math.sin(ang) * L, -85, 85); a.z = clamp(a.z + Math.cos(ang) * L, -85, 85); a.jumpCd = 6; a.leap = 5; a.anim.act = 2; a.mand = Math.max(0.35, a.mand - 0.12); a.energy -= 2;
  }
  if (inp.use) {
    // ivás / evés / tetem felvétele
    if (src) useSource(sim, a, src, dt);
    if (a.loc === 'nest' && a.carry) { deposit(sim, a); inp.use = false; }
    else if (a.loc === 'nest') { const c = sim.colony; if (c.store.water > 1) { const t = Math.min(c.store.water, 1.6 * dt); c.store.water -= t; a.hyd = Math.min(100, a.hyd + t * 14); } }
  }
  inp.use = inp.useHold ? true : false;
  if (inp.drop && a.carry) { inp.drop = false; if (a.loc === 'nest') deposit(sim, a); else a.carry = null; }
  a.anim.mv = a.moved > 0.0001 ? 1 : 0;
}
// felszíni nyílás: az eredeti bejárat vagy a játékos által ásott kijárat ('exit')
export const isExitNode = (n, id) => { if (id === n.entranceId) return true; const nd = node(n, id); return !!nd && nd.kind === 'exit'; };
function exitToSurface(sim, a) {
  const n = sim.nest; let ep = entrancePos(sim); const cur = node(n, a.node); if (cur && cur.kind === 'exit') ep = { k: 'g', x: cur.x, z: cur.z };
  if (a.carry && a.carry.kind === 'soil') { sim.world.pellets = sim.world.pellets || []; sim.world.pellets.push({ x: ep.x + sim.rng.range(-1.5, 1.5), z: ep.z + sim.rng.range(-1.5, 1.5), s: sim.rng.range(0.25, 0.5) }); if (sim.world.pellets.length > 260) sim.world.pellets.shift(); a.carry = null; }   // a kitermelt földet a bejáratnál kiviszi
  a.anim.act = 0; a.nseg = null; a.noEnterUntil = sim.t + 1.6; if (ep.k === 'l') { a.loc = 'limb'; a.limb = ep.limb; a.ls = ep.s; a.lth = ep.th; } else { a.loc = 'ground'; a.x = ep.x; a.z = ep.z; } placeAnt(sim, a);
}
// A játékos fúrása: a járat zsákutcás végén (LMB nyomva tartva) a hangya előre ás; a kitermelt föld a bejáratnál kerül ki.
function playerDig(sim, a, dt, nd) {
  const sp = S(sim), n = sim.nest, inp = sim.input; if (sp.nest.type !== 'soil' || nd.kind === 'entrance' || nd.kind === 'exit') return false;
  const deg = n.edges.filter((e) => (e.a === nd.id || e.b === nd.id)).length; if (deg !== 1 && nd.kind !== 'chamber') return false;
  if (n.nodes.length > 90) return false;
  a.anim.mv = 0; a.anim.act = 3; a.anim.open = 0.4 + 0.4 * Math.abs(Math.sin(sim.t * 7)); a.anim.curl = 0.2;
  const rate = sp.nest.digRate * (a.caste === 'queen' ? 0.8 : 1) * dt * 2.2; a.digP = (a.digP || 0) + rate; a.load = (a.load || 0) + rate;
  if (a.load > 5.5 && !a.carry) { a.carry = { kind: 'soil' }; a.load = 0; }
  if (a.digP >= 3.84) {
    a.digP = 0; const step = 2.4; const ny = clamp(nd.y - 0.15, -22, heightAt(sim.world, nd.x, nd.z) - 1.5), nx = clamp(nd.x + Math.sin(a.yaw) * step, -sim.world.half + 4, sim.world.half - 4), nz = clamp(nd.z + Math.cos(a.yaw) * step, -sim.world.half + 4, sim.world.half - 4);
    const nn = addNode(n, { x: nx, y: ny, z: nz, r: sp.nest.tunnelW * 0.5, kind: 'tunnel' }); addEdge(n, nd.id, nn.id, sp.nest.tunnelW); a.node = nn.id; placeInNode(sim, a); sim.nestDirty = true;
    // ha a járat áttört egy másik járatba / kamrába, összekapcsolódnak
    let best = null, bd = sp.nest.tunnelW * 1.5; for (const m of n.nodes) { if (m.id === nn.id || m.id === nd.id || m.ready === false) continue; if (n.edges.some((e) => (e.a === nn.id && e.b === m.id) || (e.b === nn.id && e.a === m.id))) continue; const dd = Math.hypot(m.x - nn.x, m.y - nn.y, m.z - nn.z) - (m.kind === 'chamber' ? m.r * 0.8 : m.r); if (dd < bd) { bd = dd; best = m; } }
    if (best) { addEdge(n, nn.id, best.id, sp.nest.tunnelW); sim.log && sim.log('A kiásott járat összekapcsolódott a fészekkel.', 'good'); }
  }
  return true;
}
function manualNest(sim, a, dt, spd) {
  const n = sim.nest, inp = sim.input;
  const nd = node(n, a.node); if (!nd) return;
  if (a.anim.act === 3 && !inp.dig) a.anim.act = 0;
  if (!a.nseg) {
    a.moved = 0; placeInNode(sim, a);
    if (inp.dig && playerDig(sim, a, dt, nd)) return;
    if (Math.abs(inp.fwd) > 0.2) {
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw); let best = null, bd = -2, bshaft = false;
      for (const nb of neighbors(n, a.node)) { if (nb.e.collapsed) continue; const m = node(n, nb.id); if (!m || m.ready === false) continue; let dx = m.x - nd.x, dz = m.z - nd.z; const h = Math.hypot(dx, dz); const l = h || 1; dx /= l; dz /= l; const shaft = h < 2.5; const dot = (dx * fx + dz * fz) * Math.sign(inp.fwd); const sc = shaft ? Math.max(dot, -0.45) + 0.3 : dot; if (sc > bd) { bd = sc; best = m; bshaft = shaft; } }
      // függőleges aknák (vízszintes eltérés < 2,5 mm) szinte bármely irányból bejárhatók; a bejáratnál a "visszafelé" irány kilép a felszínre
      const okay = best && (bshaft ? bd > -0.1 + 0.0 : bd > -0.2);
      if (okay && !(isExitNode(n, a.node) && bshaft && bd < 0.05)) { a.nseg = { from: a.node, to: best.id, t: 0 }; }
      else if (isExitNode(n, a.node) && !(n.plug.active && a.caste !== 'soldier')) exitToSurface(sim, a);   // természetes kijövetel a bejáratnál
    }
    if (isExitNode(n, a.node) && inp.use && !(n.plug.active && a.caste !== 'soldier') && !a.nseg) exitToSurface(sim, a);
    return;
  }
  const A = node(n, a.nseg.from), B = node(n, a.nseg.to); const L = Math.max(0.5, Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z));
  if (inp.dig && a.nseg.t > 0.98 && playerDig(sim, a, dt, B)) { return; }
  a.nseg.t += (inp.fwd * spd * 0.75 * dt) / L; a.moved = Math.abs(inp.fwd) * spd * 0.75 * dt;
  const t = clamp(a.nseg.t, 0, 1); a.x = A.x + (B.x - A.x) * t; a.y = A.y + (B.y - A.y) * t - 0.4; a.z = A.z + (B.z - A.z) * t;
  const tgtYaw = Math.atan2(B.x - A.x, B.z - A.z); a.yaw = turnToward(a.yaw, tgtYaw + (inp.fwd < 0 ? Math.PI : 0), dt * 5); a.pitch = Math.atan2(B.y - A.y, Math.hypot(B.x - A.x, B.z - A.z)) * -1;   // a hangya a haladás irányába néz (nem hátrafelé megy)
  if (a.nseg.t >= 1) { a.node = B.id; a.nseg = null; placeInNode(sim, a); }
  else if (a.nseg.t <= 0) { const from = a.nseg.from; a.nseg = null; placeInNode(sim, a); if (isExitNode(n, from) && inp.fwd < 0 && !(n.plug.active && a.caste !== 'soldier')) exitToSurface(sim, a); }
}
function nearbyUse(sim, a) {
  const w = sim.world; let best = null, bd = Math.max(3.4, a.len * 0.75 + 1.5);      // a nagyobb hangya messzebbről is eléri (a száj a test elején van)
  for (const d of w.droplets) { const dd = dist(a.x, a.z, d.x, d.z); if (dd < bd && d.vol > 0.5) { bd = dd; best = { type: 'water', ref: d }; } }
  for (const f of w.foods) { if (f.limb !== undefined) continue; const dd = dist(a.x, a.z, f.x, f.z); if (dd < bd && f.amount > 0.4) { bd = dd; best = { type: 'food', ref: f }; } }
  for (const lst of [sim.isopods, sim.springtails, sim.spiders]) for (const p of lst) { if (!p.dead || !(p.foodLeft >= 0.1)) continue; const dd = dist(a.x, a.z, p.x, p.z) - p.len * 0.4; if (dd < bd) { bd = dd; best = { type: 'carcass', ref: p }; } }
  for (const c of sim.clutches) { if (c.dead || c.n <= 0 || c.owner === 'spider') continue; const dd = dist(a.x, a.z, c.x, c.z) - 0.5; if (dd < bd) { bd = dd; best = { type: 'eggs', ref: c }; } }
  return best;
}
export function useSource(sim, a, src, dt) {
  const sp = S(sim); const r = src.ref;
  feedPose(sim, a, r.x, r.z, src.type === 'carcass' ? r.len : src.type === 'eggs' ? 0.8 : 0.5, dt, src.type === 'carcass' ? r.yaw : undefined);
  if (src.type === 'water') { const g = Math.min(16 * dt, 100 - a.hyd); a.hyd += g; r.vol -= g * 0.12; if (a.hyd >= 99 && !a.carry && a.caste !== 'queen') { const amt = Math.min(sp.carry * 0.9, r.vol * 0.4); a.carry = { kind: 'water', amt }; r.vol -= amt * 0.35; } }
  else if (src.type === 'food') { const f = r; const x = Math.min(f.amount, 1.4 * dt); f.amount -= x; if (a.energy < 98) a.energy = Math.min(100, a.energy + x * EN * (f.kind === 'sap' ? 1.5 : 1)); else if (!a.carry && a.caste !== 'queen') { const amt = Math.min(sp.carry, f.amount); f.amount -= amt; a.carry = { kind: f.kind === 'sap' ? 'sugar' : 'prey', amt }; } }
  else if (src.type === 'eggs') { const k = Math.min(r.n, 1.2 * dt / r.per); r.n -= k; a.energy = Math.min(100, a.energy + k * r.per * EN * 0.9); if (r.n <= 0) r.dead = true; }
  else { const p = r; p.beingEaten = sim.t; const x = Math.min(p.foodLeft, 1.5 * dt); if (a.energy < 98) { p.foodLeft -= x; a.energy = Math.min(100, a.energy + x * EN); } else if (!a.carry && a.caste !== 'queen') { const amt = Math.min(sp.carry, p.foodLeft); p.foodLeft -= amt; a.carry = { kind: 'prey', amt }; } }
}
