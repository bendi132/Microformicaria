// Pókok: önálló ragadozók. Búvóhelyük (kő/rönk alatt) körül járőröznek, a közelükben mozgó hangyát és ászkát észlelik,
// megközelítik, ráugranak, és a harapás valódi következménnyel jár (sérülés vagy pusztulás).
// bio: a talajon vadászó pókok nagy része látás/rezgés alapján, lesből vagy közelítve támad, éjjel aktívabb.
// game: a méret → sebesség/harapás/hatótáv összefüggés és az észlelési sugarak egyszerűsített értékek.
import { SPIDER, SPECIES, DAY, DIFFICULTY, SCORPION } from './config.js';
import { steerGround, stepGait } from './motion.js';
import { heightAt } from './world.js';
import { dist, clamp, angDiff } from '../core/util.js';
import { killAnt, damageAnt } from './ant.js';
import { killIsopod } from './isopod.js';

export function spiderVisibility(sim, a) {
  // mennyire észrevehető a hangya a pók számára
  const sp = SPECIES[sim.speciesId];
  if (a.loc === 'nest') return 0;
  let v = a.moved > 0.001 || a.anim.mv > 0.25 ? 1 : 0.5;
  v *= (1 - sp.defend.stealth * 0.55);
  if (a.plugging) v *= 0.6;
  return v;
}

export function updateSpider(sim, s, dt) {
  const C = SPIDER.classes[s.cls], w = sim.world, env = sim.env, rng = sim.rng;
  const sp = SPECIES[sim.speciesId]; const scorp = s.cls === 'scorpion';
  s.moved = 0; s.cd = Math.max(0, s.cd - dt); s.tmr -= dt;
  const lair = w.lairs.find((l) => l.id === s.lair) || { x: s.x, z: s.z };
  const hunger = 1 - s.sat; s.sat = clamp(s.sat - dt / (DAY * (scorp ? 4 : 1.6)), 0, 1);
  const eagerness = (scorp ? (env.night ? 1 : env.dusk ? 0.55 : 1 - SCORPION.nightOnly) : (env.night ? 1 : env.dusk ? 0.7 : 0.35)) * (0.4 + hunger) * (s.sac ? 0.4 : 1);
  if (s.sac && !sim.clutches.some((c) => c.id === s.sac && !c.dead)) s.sac = null;
  s.anim.alert += ((s.state === 'stalk' || s.state === 'lunge' ? 1 : 0.2) - s.anim.alert) * Math.min(1, dt * 4);
  s.hidden = s.state === 'lair';
  switch (s.state) {
    case 'lair': {
      s.x = lair.x; s.z = lair.z; s.anim.mv = 0;
      // lesből: a menedékhez túl közel kerülő hangyára vagy ászkára ráugrik
      s.look = (s.look || 0) - dt;
      if (s.look <= 0) { s.look = 0.4; const t = pickTarget(sim, s, C, s.sac ? 0.75 : 0.45); if (t) { s.target = t; s.state = 'stalk'; s.hidden = false; break; } }
      if (s.tmr <= 0) { if (rng.chance(eagerness)) { s.state = 'wander'; s.tmr = rng.range(14, 40) * s.stay; s.hidden = false; pickWander(sim, s, lair); } else s.tmr = rng.range(8, 25); }
      break;
    }
    case 'wander': {
      s.look = (s.look || 0) - dt;
      if (s.look <= 0) { s.look = 0.35; const t = pickTarget(sim, s, C, 1); if (t && rng.chance(0.4 + eagerness * 0.6)) { s.target = t; s.state = 'stalk'; s.tmr = 25; break; } }
      if (s.pause > 0) { s.pause -= dt; s.anim.mv = 0; }
      else {
        const left = scorp && !goStop(s, dt, rng) ? dist(s.x, s.z, s.tx, s.tz) : steerGround(sim, s, s.tx, s.tz, C.speed * 0.55, dt, { turnRate: 3.5 });
        if (left < 1.5) { s.pause = rng.range(1.5, 6); pickWander(sim, s, lair); }
      }
      if (s.tmr <= 0 || (!env.night && !env.dusk && rng.chance(dt * 0.05))) s.state = 'return';
      break;
    }
    case 'return': {
      const left = steerGround(sim, s, lair.x, lair.z, C.speed * 0.7, dt, { turnRate: 4, ignoreObstacles: true });
      if (left < 1.2) { s.state = 'lair'; s.tmr = rng.range(20, 70); s.hidden = true; }
      break;
    }
    case 'stalk': {
      const t = s.target; if (!validTarget(sim, s, t, C)) { s.state = 'wander'; s.target = null; s.tmr = 10; break; }
      const d = dist(s.x, s.z, t.x, t.z);
      if (d > C.detect * 1.5 || dist(s.x, s.z, lair.x, lair.z) > (s.sac ? SPIDER.guardRadius * 1.5 : SPIDER.territory * 1.6)) { s.state = 'return'; s.target = null; break; }
      if (d <= C.lunge && s.cd <= 0) { s.state = 'lunge'; s.lunge = 0; s.lungeDir = Math.atan2(t.x - s.x, t.z - s.z); s.yaw = s.lungeDir; s.anim.act = 1; s.anim.actT = 0; break; }
      if (!scorp || goStop(s, dt, rng)) steerGround(sim, s, t.x, t.z, C.speed * (d < C.lunge * 2.5 ? 0.5 : 0.85), dt, { turnRate: scorp ? 4 : 6, ignoreObstacles: true });
      break;
    }
    case 'lunge': {
      const LT = scorp ? 0.7 : 0.42, LD = scorp ? 0.4 : 1.05;           // a skorpió a farkával/ollójával csap oda, alig lép előre
      s.lunge += dt; s.anim.actT = s.lunge / LT;
      const k = Math.min(1, dt / LT);
      s.x += Math.sin(s.lungeDir) * C.lunge * LD * k; s.z += Math.cos(s.lungeDir) * C.lunge * LD * k; s.moved = C.burst * dt * (scorp ? 0.25 : 1);
      if (s.lunge >= LT) { resolveBite(sim, s, C); s.anim.act = 0; s.cd = SPIDER.cooldown * rng.range(0.8, 1.2); }
      break;
    }
    case 'feed': {
      s.anim.mv = 0; s.anim.open = 0.5 + 0.4 * Math.sin(sim.t * 7);
      if (s.tmr <= 0) { s.state = 'return'; s.anim.open = 0; s.carry = null; }
      break;
    }
    case 'flee': {
      const left = steerGround(sim, s, lair.x, lair.z, C.speed * 1.5, dt, { turnRate: 8, ignoreObstacles: true }); s.anim.alert = 0.3;
      if (left < 1.2) { s.state = 'lair'; s.tmr = rng.range(40, 100); s.hidden = true; s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.3); }
      break;
    }
  }
  // a menekülési küszöb
  if (s.state !== 'flee' && s.state !== 'lair' && s.hp < s.maxHp * 0.38) { s.state = 'flee'; s.target = null; }
  if (scorp) stepGait(s, dt, 7.2, s.moved || 0, 0.16);       // skorpió: tetrapod-járás, a lépéshossz (≈0,43 testhossz) a lábtávból; helyben fordulva is lépked
  else { s.anim.phase += (s.moved * 1.0) / Math.max(1.5, s.len) * 2.4; s.anim.mv += ((s.moved > 0.002 ? clamp(s.moved / (dt * C.speed), 0.2, 1.4) : 0) - s.anim.mv) * Math.min(1, dt * 7); }
  s.y = heightAt(w, s.x, s.z);
  s.x = clamp(s.x, -w.half + 2, w.half - 2); s.z = clamp(s.z, -w.half + 2, w.half - 2);
}
function goStop(s, dt, rng) {      // megáll-és-indul mozgás: rövid lépéssorozatok, közben mozdulatlan, figyelő szünetek
  s.gsT = (s.gsT ?? 0) - dt; if (s.gsT <= 0) { s.gsMove = !s.gsMove; const r = s.gsMove ? SCORPION.moveSpell : SCORPION.pauseSpell; s.gsT = rng.range(r[0], r[1]); }
  return !!s.gsMove;
}
function pickWander(sim, s, lair) {
  const a = sim.rng.range(0, 6.28), r = sim.rng.range(4, s.sac ? SPIDER.guardRadius : SPIDER.territory);
  s.tx = clamp(lair.x + Math.cos(a) * r, -sim.world.half + 4, sim.world.half - 4); s.tz = clamp(lair.z + Math.sin(a) * r, -sim.world.half + 4, sim.world.half - 4);
}
function validTarget(sim, s, t, C) {
  if (!t || t.dead) return false;
  if (t.kind === 'ant') return t.loc !== 'nest' && !(t.loc === 'ground' && t.hiding);
  if (t.kind === 'springtail') return !t.dead;
  if (t.kind === 'isopod') return !t.dead && t.state !== 'hidden';
  return false;
}
// cél választás: a látható hangyák (mozgás/méret szerint) és a szabadon mozgó ászkák közül a legközelebbi
function pickTarget(sim, s, C, rangeMul) {
  const R = C.detect * rangeMul * (sim.env.night ? 1 : 0.75);
  let best = null, bs = 1e9;
  for (const a of sim.ants) {
    if (a.dead || a.loc === 'nest') continue; if (a.loc === 'limb' && sim.speciesId !== 'cephalotes') continue;
    const d = dist(s.x, s.z, a.x, a.z); const vis = spiderVisibility(sim, a);
    if (d > R * vis) continue;
    const sizePen = a.len > s.len * 1.5 ? 1.8 : 1;          // a nála jóval nagyobb hangyát óvatosabban célozza
    const sc = d * sizePen; if (sc < bs) { bs = sc; best = a; }
  }
  if (!best) for (const p of sim.springtails) { if (p.dead || p.state === 'jump') continue; const d = dist(s.x, s.z, p.x, p.z); if (d > R * 0.4) continue; if (d < bs) { bs = d; best = p; } }
  if (!best) for (const p of sim.isopods) {
    if (p.dead || p.state === 'hidden') continue; const d = dist(s.x, s.z, p.x, p.z);
    if (d > R * 0.6 || p.len > s.len * 1.4) continue; if (d < bs) { bs = d; best = p; }
  }
  return best;
}
function resolveBite(sim, s, C) {
  const rng = sim.rng; const t = s.target; const sp = SPECIES[sim.speciesId];
  if (!t || t.dead) { s.state = 'wander'; return; }
  const d = dist(s.x, s.z, t.x, t.z);
  if (t.kind === 'springtail') { if (d < C.lunge * 0.8 && t.state !== 'jump' && rng.chance(0.45)) { t.hp = 0; t.dead = true; t.state = 'dead'; s.sat = clamp(s.sat + 0.1, 0, 1); s.state = 'feed'; s.tmr = 2; s.target = null; } else s.state = 'wander'; return; }
  if (t.kind === 'isopod') {
    const hit = d < C.lunge * 0.9 && rng.chance(clamp(0.8 - t.armor * 0.5, 0.15, 0.9));
    if (hit) { t.hp -= C.bite * 0.5; if (t.hp <= 0) { killIsopod(sim, t); s.state = 'feed'; s.tmr = 6; s.sat = clamp(s.sat + 0.4, 0, 1); s.target = null; sim.log(`Egy ${s.cls === 'scorpion' ? 'skorpió' : 'pók'} elkapott egy ${t.sp === 'mealworm' ? 'lisztkukacot' : sim.world.biome === 'desert' ? 'sötétbogarat' : 'ászkát'}.`, 'info'); return; } }
    s.state = 'stalk'; return;
  }
  // hangya
  const dodge = sp.defend.dodge + (t.anim.mv > 0.5 ? 0.06 : 0) + (t.dodgeT > 0 ? 0.35 : 0);
  const reach = d < C.lunge * 1.05;
  const hit = reach && rng.chance(clamp(0.82 - dodge - (t.plugging ? 0.1 : 0), 0.1, 0.95));
  t.alertT = 3;
  if (!hit) { sim.log(`Egy hangya elkerülte a ${s.cls === 'scorpion' ? 'skorpió' : 'pók'} támadását.`, 'good', t.id); s.state = 'stalk'; if (t.caste === 'queen') t.stress = Math.min(100, t.stress + 25); return; }
  const armor = sp.defend.armor * (t.plugging ? 0.55 : 1);
  const dmg = C.bite * Math.pow(s.len / t.len, 0.55) * armor * rng.range(0.75, 1.2);
  const died = damageAnt(sim, t, dmg, s.cls === 'scorpion' ? 'skorpió' : 'pók');
  t.stun = 1.4;
  if (died) { s.state = 'feed'; s.tmr = rng.range(7, 12); s.sat = clamp(s.sat + 0.5, 0, 1); s.target = null; s.hunted++; }
  else { s.state = 'stalk'; }
}
