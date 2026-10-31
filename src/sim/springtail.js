// Ugróvillások: apró, nedves almot kedvelő állatok; a veszély elől ugróvillájukkal (furcula) elugranak.
// bio: a furcula a potroh alá hajtott ugrószerv; a nedvességhez kötött, kiszáradásra érzékeny állatok.
// game: az ugrás távolsága/időzítése és az érzékelési sugár egyszerűsített érték.
import { SPRINGTAIL, DAY } from './config.js';
import { steerGround } from './motion.js';
import { moistureAt, heightAt, nearestCover } from './world.js';
import { dist, clamp } from '../core/util.js';
import { makeClutch } from './entities.js';

export function updateSpringtail(sim, p, dt) {
  const w = sim.world, rng = sim.rng, C = SPRINGTAIL;
  p.moved = 0;
  if (p.dead) { p.fresh -= dt / (DAY * 0.9); return; }
  if (p.hp <= 0) { p.dead = true; p.state = 'dead'; return; }
  p.cd = Math.max(0, p.cd - dt); p.tmr -= dt;
  if (p.juvenile) { p.grow -= dt / (DAY * 1.2); if (p.grow <= 0) { p.juvenile = false; p.len *= 1.6; } }
  if (p.held > 0) { p.held -= dt; return; }
  if (p.para > 0) { p.para -= dt; return; }
  if (p.state === 'jump') {
    p.jt += dt / 0.3; const t = Math.min(1, p.jt);
    p.x = p.jfx + (p.jtx - p.jfx) * t; p.z = p.jfz + (p.jtz - p.jfz) * t; p.leap = Math.sin(t * Math.PI) * (3 + p.len * 1.2);
    p.anim.curl = 1 - t * 0.6; p.moved = 0;
    if (t >= 1) { p.state = 'forage'; p.leap = 0; p.anim.curl = 0; p.cd = C.jumpCd; p.tmr = rng.range(0.8, 2.2); p.freeze = rng.range(0.6, 1.6); }
    p.y = heightAt(w, p.x, p.z); return;
  }
  // veszély: közeli, gyorsan mozgó hangya vagy közeledő pók
  p.sense = (p.sense || 0) - dt;
  if (p.sense <= 0) {
    p.sense = 0.12; let thr = null, td = 1e9;
    for (const a of sim.ants) {
      if (a.dead || a.loc !== 'ground') continue; const d = dist(p.x, p.z, a.x, a.z); if (d > C.senses) continue;
      const moving = a.moved > 0.001; const stalk = a.task === 'hunt' && a.st === 'approach' ? (a.slow ? 0.45 : 1) : 1;
      const reactR = C.senses * (moving ? 1 : 0.35) * stalk * (a.task === 'hunt' || a.task === 'manual' ? 1 : 0.7);
      if (d < reactR && d < td) { td = d; thr = a; }
    }
    for (const s of sim.spiders) { if (s.dead || s.state === 'lair') continue; const d = dist(p.x, p.z, s.x, s.z); if (d < C.senses * 2.2 && d < td) { td = d; thr = s; } }
    p.threat = thr; p.threatD = td;
    if (thr && p.cd <= 0 && rng.chance(0.55 + (1 - td / C.senses) * 0.4)) {
      const away = Math.atan2(p.x - thr.x, p.z - thr.z) + rng.range(-0.8, 0.8); const L = rng.range(C.jumpDist[0], C.jumpDist[1]);
      p.jfx = p.x; p.jfz = p.z; p.jtx = clamp(p.x + Math.sin(away) * L, -w.half + 3, w.half - 3); p.jtz = clamp(p.z + Math.cos(away) * L, -w.half + 3, w.half - 3);
      p.yaw = away; p.jt = 0; p.state = 'jump'; p.anim.curl = 1; p.freeze = 0; return;
    }
  }
  if (p.freeze > 0) { p.freeze -= dt; p.y = heightAt(w, p.x, p.z); return; }
  // nedvesség-kereső kószálás
  if (p.tmr <= 0 || dist(p.x, p.z, p.tx, p.tz) < 0.8) {
    p.tmr = rng.range(2, 9); let bx = p.x, bz = p.z, bm = -1;
    for (let k = 0; k < 4; k++) { const a = rng.range(0, 6.28), r = rng.range(3, 12); const x = clamp(p.x + Math.cos(a) * r, -w.half + 4, w.half - 4), z = clamp(p.z + Math.sin(a) * r, -w.half + 4, w.half - 4); const m = moistureAt(w, x, z) + rng.range(0, 0.12); if (m > bm) { bm = m; bx = x; bz = z; } }
    p.tx = bx; p.tz = bz; if (rng.chance(0.35)) { p.freeze = rng.range(1, 4); return; }
  }
  const m = moistureAt(w, p.x, p.z);
  if (m < 0.18) p.hp -= dt * 0.02;                       // kiszáradás
  steerGround(sim, p, p.tx, p.tz, p.speed * 0.5, dt, { turnRate: 6, ignoreObstacles: false });
  // tojásrakás nedves helyen
  p.layT -= dt; if (p.layT <= 0 && !p.juvenile) {
    p.layT = DAY * C.layEvery * rng.range(0.7, 1.4);
    if (m > 0.4 && sim.clutches.filter((c) => c.owner === 'springtail').length < 14 && sim.springtails.length < C.max) {
      const n = rng.int(C.eggs[0], C.eggs[1]); sim.clutches.push(makeClutch(sim, 'springtail', p.x, p.z, n));
    }
  }
  p.anim.phase += p.moved * 5; p.anim.mv += ((p.moved > 0.001 ? 1 : 0) - p.anim.mv) * Math.min(1, dt * 8);
  p.y = heightAt(w, p.x, p.z);
}
