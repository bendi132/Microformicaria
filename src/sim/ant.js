// Hangyák: fiziológia, érzékelés, navigáció (talaj / fészek / fa), veszélyreakció.
// A feladat-állapotgépek a tasks.js-ben vannak.
import { deposit, trailStrength } from './phero.js';
import { SPECIES, SPIDER, DAY } from './config.js';
import { steerGround, placeAnt, moveNest, setNestPath, placeInNode, moveLimb } from './motion.js';
import { node, nearestNode, findPath } from './nest.js';
import { dist, clamp, angDiff, turnToward } from '../core/util.js';
import { limbPoint, heightAt } from './world.js';
import { runTask, chooseTask } from './tasks.js';
import { spiderVisibility } from './spider.js';

export const baseSpeed = (sim, a) => { const sp = SPECIES[sim.speciesId]; return (a.caste === 'queen' ? sp.speed.queen : sp.speed.worker) * (a.caste === 'soldier' ? 0.9 : 1); };

export function damageAnt(sim, a, dmg, by) {
  if (a.dead) return true;
  a.hp -= dmg; a.stress = Math.min(100, a.stress + dmg * 0.8);
  if (a.hp <= 0) { killAnt(sim, a, by); return true; }
  if (a.caste === 'queen') sim.log(`A királynő megsérült (${Math.round(a.hp)} egészség).`, 'bad', a.id);
  return false;
}
export function killAnt(sim, a, by) {
  if (a.dead) return; a.dead = true; a.task = 'dead';
  if (a.caste === 'queen') { sim.log(`A KIRÁLYNŐ elpusztult (${by || 'ismeretlen ok'}). A kolónia nem szaporodhat tovább.`, 'critical'); sim.queenDead = true; }
  else sim.log(`Egy ${a.caste === 'soldier' ? 'katona' : 'dolgozó'} elpusztult (${by || '–'}).`, 'bad', a.id);
  if (a.carry) a.carry = null;
  if (sim.nest && sim.nest.plug.by === a.id) { sim.nest.plug.active = false; sim.nest.plug.by = null; }
}

// ---- helyzet-lekérdezések
export function entrancePos(sim) {
  const n = sim.nest; if (!n) return null; const e = node(n, n.entranceId);
  if (n.site.kind === 'cavity') { const cav = sim.world.cavities[n.site.cavityId]; return { k: 'l', limb: cav.limb, s: cav.s, th: cav.th, x: e.x, y: e.y, z: e.z }; }
  return { k: 'g', x: e.x, z: e.z };
}
export function treeBase(sim) { const L = sim.world.limbs[0]; return { x: L.base.x, z: L.base.z, r: L.r }; }

// ---- fő navigációs lépés: cél = {k:'g',x,z} | {k:'l',limb,s,th} | {k:'n',node}. Visszatér: 'arrived' | 'moving' | 'blocked'
export function navigate(sim, a, tgt, speedMul, dt, opts = {}) {
  const sp = SPECIES[sim.speciesId]; const n = sim.nest;
  let speed = baseSpeed(sim, a) * speedMul * a.speedMul * (0.45 + 0.55 * clamp(a.hp / a.maxHp, 0, 1)) * (a.energy < 15 ? 0.6 : 1);
  if (a.loc === 'nest') {
    if (tgt.k === 'n') {
      if (a.node === tgt.node && !a.path) { placeInNode(sim, a); return 'arrived'; }
      if (!a.path || a.path[a.path.length - 1] !== tgt.node) { if (!setNestPath(sim, a, tgt.node)) return 'blocked'; }
      moveNest(sim, a, speed * 0.75, dt); a.anim.mv = 1; return !a.path && a.node === tgt.node ? 'arrived' : 'moving';
    }
    // kijárat: a bejáratig, majd ki
    if (n.plug.active && !opts.ignorePlug && a.caste !== 'soldier') return 'blocked';
    if (a.node !== n.entranceId || a.path) {
      if (!a.path || a.path[a.path.length - 1] !== n.entranceId) { if (!setNestPath(sim, a, n.entranceId)) return 'blocked'; }
      moveNest(sim, a, speed * 0.75, dt); a.anim.mv = 1; if (!(a.node === n.entranceId && !a.path)) return 'moving';
    }
    // kilépés a felszínre
    const ep = entrancePos(sim);
    if (ep.k === 'l') { a.loc = 'limb'; a.limb = ep.limb; a.ls = ep.s; a.lth = ep.th; placeAnt(sim, a); }
    else { a.loc = 'ground'; a.x = ep.x + (sim.rng.next() - 0.5) * 0.6; a.z = ep.z + (sim.rng.next() - 0.5) * 0.6; placeAnt(sim, a); }
    a.path = null; return 'moving';
  }
  // felszín (talaj vagy fa)
  if (tgt.k === 'n') {
    const ep = entrancePos(sim);
    const r = navigate(sim, a, ep, speedMul, dt, opts);
    if (r === 'arrived') {
      if (n.plug.active && a.caste !== 'soldier' && !opts.ignorePlug) return 'blocked';
      a.loc = 'nest'; a.node = n.entranceId; a.path = null; a.moved = 0;
      if (tgt.node !== n.entranceId) { setNestPath(sim, a, tgt.node); }
      placeInNode(sim, a); return tgt.node === n.entranceId ? 'arrived' : 'moving';
    }
    return r;
  }
  if (a.loc === 'ground') {
    if (tgt.k === 'l') {                 // fára mászás: a törzs tövéhez, majd fel
      const tb = treeBase(sim); const d = dist(a.x, a.z, tb.x, tb.z);
      if (d > tb.r + 1.6) { steerGround(sim, a, tb.x, tb.z, speed, dt, { ignoreCover: true, ignoreObstacles: true }); a.anim.mv = 1; return 'moving'; }
      a.loc = 'limb'; a.limb = 0; a.ls = 0.8; a.lth = Math.atan2(a.z - tb.z, a.x - tb.x); a.path = null; placeAnt(sim, a); return 'moving';
    }
    const left = steerGround(sim, a, tgt.x, tgt.z, speed, dt, opts); a.anim.mv = 1; placeAnt(sim, a);
    return left < (opts.arrive || 1.0) ? 'arrived' : 'moving';
  }
  if (a.loc === 'limb') {
    if (tgt.k === 'g') {                 // lefelé a fán, majd a talajra
      const left = moveLimb(sim, a, 0, 0, a.lth, speed * 0.9, dt); a.anim.mv = 1; placeAnt(sim, a);
      if (a.limb === 0 && a.ls <= 0.9) { const tb = treeBase(sim); a.loc = 'ground'; a.x = tb.x + Math.cos(a.lth) * (tb.r + 1.8); a.z = tb.z + Math.sin(a.lth) * (tb.r + 1.8); placeAnt(sim, a); }
      return 'moving';
    }
    const left = moveLimb(sim, a, tgt.limb, tgt.s, tgt.th, speed * 0.9, dt); a.anim.mv = 1; placeAnt(sim, a);
    return left < (opts.arrive || 1.0) ? 'arrived' : 'moving';
  }
  return 'blocked';
}

// ---- fiziológia
function physiology(sim, a, dt) {
  const sp = SPECIES[sim.speciesId], dif = sim.diff;
  const perDay = dt / DAY * 0.5;           // game: az anyagcsere lassabb a játékidőnél, hogy a játékos ráérjen cselekedni
  const act = a.anim.mv > 0.3 ? 1.6 : 0.8;
  const bodyMul = a.caste === 'queen' ? 1 : 0.8;
  a.energy -= sp.needs.energyDrain * perDay * act * bodyMul * dif.drain * (a.caste === 'queen' && sim.ants.length < 3 ? 0.5 : 1) * (a.loc === 'nest' && (a.task === 'rest' || a.task === 'lay' || a.task === 'nurse') ? 0.4 : 1) * (a.stress > 60 ? 1.2 : 1);
  const dry = a.loc === 'ground' ? clamp(1.25 - sim.localMoist(a), 0.5, 1.4) : 0.6;
  const hot = clamp((sim.env.temp - 28) / 10, 0, 1);
  a.hyd -= sp.needs.waterDrain * perDay * (act * 0.85 + 0.2) * dry * (1 + hot) * dif.drain;
  // éhezés/szomjazás sebzés
  if (a.energy <= 0) { a.energy = 0; a.hp -= dt * 0.45; }
  if (a.hyd <= 0) { a.hyd = 0; a.hp -= dt * 0.6; }
  if (a.hp <= 0) return killAnt(sim, a, a.hyd <= 0 ? 'szomjhalál' : 'éhhalál');
  // kéthalállal a sérült egyed lassan gyógyul, ha jól tápláltak
  if (a.energy > 55 && a.hyd > 55 && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + dt * 0.04);
  a.stress = Math.max(0, a.stress - dt * 3.0); a.age += dt / DAY;
  if (a.anim.mv < 0.2) a.rest = clamp(a.rest + dt * 0.1, 0, 100); else a.rest = clamp(a.rest - dt * 0.12, 0, 100);
  // a forró felszín stresszel
  if (a.loc !== 'nest' && sim.env.temp > 33) a.stress = Math.min(100, a.stress + dt * 2);
  // a hangya a felszínen kiszárad, ha a nedvesség alacsony
}

// ---- veszély érzékelése és reakció
function perceive(sim, a, dt) {
  const sp = SPECIES[sim.speciesId], D = sp.defend;
  a.pTmr -= dt; if (a.pTmr > 0) return; a.pTmr = 0.28 + (a.id % 5) * 0.02;
  if (a.loc === 'nest') { a.threat = null; return; }
  // legközelebbi pók
  let near = null, nd = 1e9;
  for (const s of sim.spiders) {
    if (s.dead || s.state === 'lair') continue;
    const d = dist(a.x, a.z, s.x, s.z); if (d < nd) { nd = d; near = s; }
  }
  const C = near ? SPIDER.classes[near.cls] : null;
  const sense = sp.senses.spider * (a.caste === 'queen' ? 1 : 0.9) * (1 + a.alertT * 0.1);
  if (near && nd < sense && (near.state === 'stalk' || near.state === 'lunge' || nd < sense * 0.65)) {
    a.threat = near; const was = a.fleeT;
    a.stress = Math.min(100, a.stress + 30 * (1 - nd / sense)); sim.noteThreat(near, a);
    decideReaction(sim, a, near, nd, C);
  } else if (a.threat && (!near || nd > sense * 1.4)) { a.threat = null; }
  if (a.alertT > 0) a.alertT -= 0.3;
}
function decideReaction(sim, a, sp, d, C) {
  const S = SPECIES[sim.speciesId], D = S.defend;
  if (a.task === 'fight' && a.target === sp) return;
  // védekezés csoportban: elég hangya van a közelben, és a pók nem túl erős
  let allies = 0; for (const o of sim.ants) { if (o !== a && !o.dead && o.loc !== 'nest' && o.caste !== 'queen' && dist(o.x, o.z, sp.x, sp.z) < 22) allies++; }
  const power = (allies + (a.caste === 'queen' ? 0 : 1)) * D.fight.dmg * D.fight.rate;
  const need = sp.hp / 14;                       // a pók "legyőzésének" nehézsége (game)
  const canFight = a.caste !== 'queen' && sp.hp > 0 && power >= need * 0.55 && allies + 1 >= D.group && sp.hp > sp.maxHp * 0.25 && a.hp > a.maxHp * 0.4;
  const queenFights = a.caste === 'queen' && S.id === 'odonto' && sp.cls === 'small' && a.hp > 70 && a.mand > 0.6;
  if ((canFight || queenFights) && D.escape !== 'plug') { a.task = 'fight'; a.target = sp; a.st = 'engage'; return; }
  if (D.escape === 'plug' && a.caste === 'soldier') { a.task = 'plug'; a.st = 'goto'; return; }
  if (a.task !== 'flee') { a.task = 'flee'; a.st = 'run'; a.fleeT = 6 + sim.rng.range(0, 3); a.target = sp; }
}

export function updateAnt(sim, a, dt) {
  if (a.dead) return;
  const sp = SPECIES[sim.speciesId]; a.moved = 0; a._feed = false;
  physiology(sim, a, dt); if (a.dead) return;
  a.cd = Math.max(0, a.cd - dt); a.jumpCd = Math.max(0, a.jumpCd - dt); a.dodgeT = Math.max(0, a.dodgeT - dt);
  if (a.mand < 1) a.mand = Math.min(1, a.mand + dt * 0.004);
  if (a.leap > 0) { a.leap = Math.max(0, a.leap - dt * 12); }
  if (a.stun > 0) { a.stun -= dt; a.anim.mv *= 0.9; return; }
  perceive(sim, a, dt);
  // döntés (feladatválasztás) ritkán
  a.decide -= dt;
  if (a.decide <= 0 && a.task !== 'flee' && a.task !== 'fight' && a.task !== 'plug') { a.decide = 2.5 + sim.rng.range(0, 2.5); chooseTask(sim, a); }
  a.anim.mv = 0;
  // megállások: a keresgélő/gyűjtögető hangya időnként megáll, és csápjaival tapogat (valós keresési viselkedés)
  let paused = false;
  if (a.pauseT > 0) { a.pauseT -= dt; paused = true; a.vf = 0.2; }
  else if (a.loc === 'ground' && a.stress < 20 && !a.target && a.anim.mv > 0.5 && !(sim.player.active && sim.player.antId === a.id) && ((a.task === 'forage' && a.st === 'go') || (a.task === 'hunt' && a.st === 'search') || a.task === 'water') && sim.rng.next() < dt * 0.14) a.pauseT = 0.35 + sim.rng.next() * 0.9;
  if (!paused) runTask(sim, a, dt);
  if (a.loc === 'ground' && a.carry && a.moved > 0 && a.carry.kind !== 'soil' && a.carry.kind !== 'water') deposit(sim, a.x, a.z, 1.6 * trailStrength(sim) * dt);   // a táplálékot hazavivő hangya nyomot hagy
  { const an = a.anim, tgt = a._feed ? 1 : 0; an.feedS = (an.feedS || 0) + (tgt - (an.feedS || 0)) * Math.min(1, dt * 6);   // evési póz: act = 4, a fej fokozatosan lehajlik
    if (an.feedS > 0.03 && an.act !== 1 && an.act !== 3) { an.act = 4; an.actT = an.feedS; } else if (an.act === 4) { an.act = 0; an.actT = 0; } }
  // animációs változók
  const mvNow = clamp(a.moved / Math.max(0.0001, dt * baseSpeed(sim, a) * 0.8), 0, 1.5);
  a.anim.mvS = (a.anim.mvS || 0) + (mvNow - (a.anim.mvS || 0)) * Math.min(1, dt * 8);
  a.anim.mv = a.anim.mvS;
  { const g = (sp.gaitCaste && sp.gaitCaste[a.caste]) || sp.gait; a.anim.phase += a.moved * Math.PI / (g.stride * a.len); }   // lábfázis a megtett úthoz kötve: a láb talpa nem csúszik
  a.anim.alert += ((a.stress > 30 || a.task === 'hunt' || a.task === 'fight' ? 0.8 : a.anim.mv > 0.2 ? 0.35 : 0.15) - a.anim.alert) * Math.min(1, dt * 3);
  a.anim.head += (((a.pauseT > 0 ? Math.sin(sim.t * 4.2 + a.id) * 0.6 : Math.sin(sim.t * 0.9 + a.id) * 0.25 * (a.anim.mv > 0.2 ? 0.4 : 1))) - a.anim.head) * Math.min(1, dt * (a.pauseT > 0 ? 7 : 2));
  if (a.moved < 1e-4) a.vf = Math.min(a.vf ?? 1, 0.3);
}
