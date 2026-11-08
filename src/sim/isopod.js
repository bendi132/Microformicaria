// Ászkák: önálló, nedvességkedvelő, főleg éjszaka aktív talajlakók. Kövek, rönkök és moha alatt keresnek menedéket.
// bio: ászkák korhadékot esznek, kiszáradásra érzékenyek, fényt és szárazságot kerülnek, többnyire éjszaka aktívak.
// game: a menekülés / búvóhely-keresés és az aktivitási ciklus egyszerűsített szabályokra épül.
import { ISOPOD, DAY } from './config.js';
import { steerGround, stepGait } from './motion.js';
import { moistureAt, nearestCover, heightAt } from './world.js';
import { dist, clamp } from '../core/util.js';

export function updateIsopod(sim, p, dt) {
  const w = sim.world, env = sim.env, rng = sim.rng;
  p.moved = 0;
  if (p.dead) { p.fresh -= dt / (DAY * 1.4); return; }
  if (p.hp <= 0) return killIsopod(sim, p);
  p.tmr -= dt; p.alert = Math.max(0, p.alert - dt);
  if (p.held > 0) { p.held -= dt; return; }                         // ragadozó szorítja
  if (p.para > 0) { p.para -= dt; if (p.para <= 0 && p.hp > 0) p.state = 'forage'; return; }   // a fullánk bénítása
  const activity = env.night ? 1 : env.dusk ? 0.65 : 0.18;           // aktivitás (game: éjszakai mintázat)
  // ---- fenyegetés érzékelése (0.35 mp-enként)
  p.sense = (p.sense || 0) - dt;
  if (p.sense <= 0) {
    p.sense = 0.35; let thr = null, td = 1e9;
    const R = ISOPOD.senses * (p.state === 'hidden' ? 0.5 : 1);
    for (const s of sim.spiders) { if (s.dead || s.state === 'lair') continue; const d = dist(p.x, p.z, s.x, s.z); if (d < R * 1.8 && d < td) { td = d; thr = s; } }
    for (const a of sim.ants) { if (a.dead || a.loc !== 'ground') continue; const hunting = a.task === 'hunt' && (a.st === 'approach' || a.st === 'attack'); const d = dist(p.x, p.z, a.x, a.z); if (hunting && d < R && d < td) { td = d; thr = a; } }
    p.threat = thr;
    if (thr && p.state !== 'flee') { p.state = 'flee'; p.tmr = 3 + rng.range(0, 2); p.alert = 2; }
  }
  switch (p.state) {
    case 'hidden': {
      p.hide = (p.hide || 0) + dt;
      if (p.tmr <= 0) { if (rng.chance(activity)) { p.state = 'forage'; p.tmr = rng.range(10, 30); const c = w.covers.find((q) => q.id === p.cover); if (c) { p.x = c.x + Math.cos(p.yaw) * (c.r + 1.5); p.z = c.z + Math.sin(p.yaw) * (c.r + 1.5); } p.dry = 0; } else p.tmr = rng.range(6, 20); }
      p.dry = Math.max(0, p.dry - dt * 2);
      break;
    }
    case 'forage': {
      if (activity < 0.3 && rng.chance(dt * 0.15)) { p.state = 'seek'; break; }
      const m = p.sp === 'eleodes' ? 0.6 : moistureAt(w, p.x, p.z);           // a sötétbogár kiszáradás-tűrő
      p.dry = clamp(p.dry + (m < 0.3 ? dt * (0.3 - m) * 4 : -dt * 0.6), 0, 120);
      if (p.dry > 60) p.hp -= dt * 0.18 * (1 - p.armor * 0.3);      // kiszáradás
      if (p.dry > 20 && m < 0.28 && p.tmr > 1) { const c = nearestCover(w, p.x, p.z, 80); if (c) { p.tx = c.cover.x; p.tz = c.cover.z; p.tmr = 1; p.state = 'seek'; break; } }
      if (p.tmr <= 0 || dist(p.x, p.z, p.tx, p.tz) < 1.2) {
        p.tmr = rng.range(4, 12);
        // nedvesebb hely felé hajlik
        let bx = p.x, bz = p.z, bm = -1;
        for (let k = 0; k < 4; k++) { const a = rng.range(0, 6.28), r = rng.range(6, 22); const x = clamp(p.x + Math.cos(a) * r, -w.half + 4, w.half - 4), z = clamp(p.z + Math.sin(a) * r, -w.half + 4, w.half - 4); const mm = p.sp === 'eleodes' ? rng.next() : moistureAt(w, x, z); if (mm > bm) { bm = mm; bx = x; bz = z; } }
        p.tx = bx; p.tz = bz;
      }
      steerGround(sim, p, p.tx, p.tz, p.speed * 0.55 * (p.wild), dt, { turnRate: 3 });
      p.anim.mv = 0.7; break;
    }
    case 'seek': {
      const c = nearestCover(w, p.x, p.z, 200); if (!c) { p.state = 'forage'; break; }
      const cv = c.cover; const dd = steerGround(sim, p, cv.x, cv.z, p.speed * 0.75, dt, { turnRate: 4, ignoreObstacles: true });
      p.anim.mv = 0.8;
      if (dist(p.x, p.z, cv.x, cv.z) < cv.r * 0.7) { p.state = 'hidden'; p.cover = cv.id; p.tmr = rng.range(15, 50); p.anim.mv = 0; }
      break;
    }
    case 'flee': {
      const thr = p.threat;
      let tx, tz;
      if (thr && !thr.dead) {
        const c = nearestCover(w, p.x, p.z, 200, (q) => dist(q.x, q.z, thr.x, thr.z) > dist(q.x, q.z, p.x, p.z) * 0.8);
        if (c) { tx = c.cover.x; tz = c.cover.z; }
        else { const a = Math.atan2(p.x - thr.x, p.z - thr.z); tx = p.x + Math.sin(a) * 20; tz = p.z + Math.cos(a) * 20; }
      } else { tx = p.tx; tz = p.tz; }
      steerGround(sim, p, tx, tz, p.speed * ISOPOD.flee, dt, { turnRate: 7, ignoreObstacles: false }); p.anim.mv = 1;
      const hid = nearestCover(w, p.x, p.z, 3);
      if (hid && dist(p.x, p.z, hid.cover.x, hid.cover.z) < hid.cover.r * 0.6) { p.state = 'hidden'; p.cover = hid.cover.id; p.tmr = rng.range(10, 30); p.anim.mv = 0; }
      else if (p.tmr <= 0 && !(thr && dist(p.x, p.z, thr.x, thr.z) < ISOPOD.senses)) { p.state = 'forage'; p.tmr = 3; }
      break;
    }
  }
  if (p.sp === 'eleodes') stepGait(p, dt, 19, p.moved || 0, 0.22);     // sötétbogár: tripod-járás, lépéshossz ≈0,16 testhossz → a lábütem a sebességhez igazodik
  else { p.anim.phase += p.moved * 1.9 / Math.max(2, p.len) * 3; p.anim.mv += ((p.moved > 0.001 ? 1 : 0) - p.anim.mv) * Math.min(1, dt * 6); }
  p.y = heightAt(w, p.x, p.z);
}
export function killIsopod(sim, p, byAnt) {
  if (p.dead) return; p.dead = true; p.state = 'dead'; p.fresh = 1; p.anim.mv = 0; p.held = 0; p.para = 0;
}
