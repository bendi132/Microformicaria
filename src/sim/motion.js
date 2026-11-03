// Mozgás: talajon (akadálykerüléssel), fészekjáratokban (gráf-úton) és a fán (végtag-felületen).
import { clamp, turnToward, angDiff, dist } from '../core/util.js';
import { heightAt, limbPoint, obstaclesAt, climbHeight } from './world.js';
import { node, findPath } from './nest.js';

// ---- általános: egy entitás (hangya/ászka/pók) talajmozgása a (tx,tz) felé. Visszatér: távolság a célig.
export function steerGround(sim, e, tx, tz, speed, dt, opts = {}) {
  const w = sim.world; const half = w.half - 3;
  let dx = tx - e.x, dz = tz - e.z; const d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  let want = Math.atan2(dx, dz);        // yaw: 0 = +Z irány felé, a (sin,cos) konvenciót használjuk
  // akadályok kerülése (kövek köre): taszítás
  if (!opts.ignoreObstacles) {
    const obs = obstaclesAt(w, e.x, e.z, (e.len || 3) * 0.5 + 2);
    let ax = 0, az = 0;
    for (const o of obs) {
      if (opts.ignoreCover && opts.ignoreCover === o) continue;
      const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), lim = o.r + (e.len || 3) * 0.55 + 1.2;
      if (od < lim + 4 && od > 1e-3) {
        const k = (1 - (od - lim * 0.7) / (lim * 0.3 + 4)); const kk = clamp(k, 0, 1.6);
        // érintő irányú terelés (a cél felé eső oldal), plusz kifelé taszítás
        const tx2 = -oz / od, tz2 = ox / od; const side = (tx2 * dx + tz2 * dz) >= 0 ? 1 : -1;
        ax += (ox / od) * kk * 0.9 + tx2 * side * kk * 1.1; az += (oz / od) * kk * 0.9 + tz2 * side * kk * 1.1;
        if (od < lim * 0.85) { e.x += (ox / od) * (lim * 0.85 - od) * 0.5; e.z += (oz / od) * (lim * 0.85 - od) * 0.5; }
      }
    }
    if (ax || az) { const bx = Math.sin(want) + ax * 1.4, bz = Math.cos(want) + az * 1.4; want = Math.atan2(bx, bz); }
  }
  const turnRate = (opts.turnRate || 5) * dt;
  e.yaw = turnToward(e.yaw ?? want, want, turnRate);
  const align = Math.cos(angDiff(e.yaw, want)); const sp = speed * clamp(0.25 + 0.75 * align, 0.12, 1);
  const step = Math.min(sp * dt, d);
  e.x += Math.sin(e.yaw) * step; e.z += Math.cos(e.yaw) * step;
  e.x = clamp(e.x, -half, half); e.z = clamp(e.z, -half, half);
  e.moved = step; return d - step;
}

// ---- hangya testhelyzete (3D) a helyétől függően
export function placeAnt(sim, a) {
  const w = sim.world;
  if (a.loc === 'ground') {
    // mászás (kő / rönk teteje): a hangya a tárgy felületén jár, a felület dőlésének megfelelően
    const surf = (x, z) => { const c = a.climbing ? climbHeight(w, x, z) : null; return c ? c.y : heightAt(w, x, z); };
    const ty = surf(a.x, a.z) + (a.leap || 0);
    if (a.climbing || a.cb > 0) { a.y += (ty - (a.y || 0)) * 0.3; if (Math.abs(ty - a.y) < 0.02) a.cb = 0; else if (!a.climbing) a.cb = (a.cb || 1) - 0.02; } else a.y = ty;
    const hx = surf(a.x + 0.5, a.z) - surf(a.x - 0.5, a.z), hz = surf(a.x, a.z + 0.5) - surf(a.x, a.z - 0.5);
    a.up = [-hx / 1.0, 1, -hz / 1.0]; const l = Math.hypot(...a.up); a.up = a.up.map((v) => v / l);
    a.pitch = 0;
  } else if (a.loc === 'limb') {
    const p = limbPoint(w, a.limb, a.ls, a.lth, {}); a.x = p.x; a.y = p.y; a.z = p.z; a.up = [p.nx, p.ny, p.nz];
  } else if (a.loc === 'nest') {
    // a mozgás saját szakaszából számolódik (moveNest)
  }
}

// ---- fészekben: út bejárása csomópontról csomópontra
export function setNestPath(sim, a, toId) {
  const n = sim.nest; const from = a.node;
  const p = findPath(n, from, toId); if (!p) return false;
  if (p.length < 2) { a.path = null; return true; }
  a.path = p; a.seg = 0; a.segT = 0; return true;
}
export function moveNest(sim, a, speed, dt) {
  const n = sim.nest; const nd = node(n, a.node);
  if (!a.path || a.path.length < 2) {
    a.path = null;
    if (nd) { a.x = nd.x + (a.ox || 0); a.y = nd.y - nd.r * 0.55 * (nd.kind === 'chamber' ? 1 : 0.3); a.z = nd.z + (a.oz || 0); }
    a.up = [0, 1, 0]; return true;
  }
  const A = node(n, a.path[a.seg]), B = node(n, a.path[a.seg + 1]);
  if (!A || !B) { a.path = null; return true; }
  const e = n.edges.find((q) => (q.a === A.id && q.b === B.id) || (q.a === B.id && q.b === A.id));
  if (e && e.collapsed) { a.path = null; a.node = A.id; return true; }
  const L = Math.max(0.5, Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z));
  a.segT += (speed * dt) / L;
  if (a.segT >= 1) { a.node = B.id; a.seg++; a.segT = 0; if (a.seg >= a.path.length - 1) { a.path = null; a.moved = 0; placeInNode(sim, a); return true; } }
  const t = a.segT; const A2 = node(n, a.path[a.seg]), B2 = node(n, a.path[a.seg + 1]);
  a.x = A2.x + (B2.x - A2.x) * t; a.y = A2.y + (B2.y - A2.y) * t - 0.4; a.z = A2.z + (B2.z - A2.z) * t;
  const fx = B2.x - A2.x, fy = B2.y - A2.y, fz = B2.z - A2.z; a.yaw = Math.atan2(fx, fz); a.pitch = Math.atan2(fy, Math.hypot(fx, fz)) * -1;
  a.up = [0, 1, 0]; a.moved = speed * dt; return false;
}
export function placeInNode(sim, a) {
  const nd = node(sim.nest, a.node); if (!nd) return;
  const r = Math.max(0, nd.r - 1.2); const k = ((a.id * 2654435761) >>> 0) / 4294967296, m = ((a.id * 40503) % 997) / 997;
  const ang = k * 6.283; a.ox = Math.cos(ang) * r * m * 0.8; a.oz = Math.sin(ang) * r * m * 0.8;
  a.x = nd.x + a.ox; a.y = nd.y - nd.r * 0.6 * (nd.kind === 'chamber' ? 1 : 0.3); a.z = nd.z + a.oz; a.pitch = 0;
}

// ---- fán: (s, th) koordináták; a cél (s2, th2) felé halad a felszínen
export function moveLimb(sim, a, targetLimb, ts, tth, speed, dt) {
  const w = sim.world; const L = w.limbs[a.limb];
  let tl = targetLimb, s2 = ts, th2 = tth;
  if (a.limb !== targetLimb) {
    // út a fán: fel/le a közös szülőig
    const route = limbRoute(w, a.limb, targetLimb);
    const nextLimb = route[1];
    if (nextLimb === L.parent) { s2 = 0; th2 = a.lth; tl = L.parent; }                  // lefelé a gyökér felé
    else { const C = w.limbs[nextLimb]; s2 = C.sP; th2 = C.thP; }                          // felfelé az ág gyökeréhez
  }
  const ds = s2 - a.ls; let dth = angDiff(a.lth, th2);
  const circ = L.r;
  const wantS = clamp(ds, -1, 1); const wantT = clamp(dth * circ, -1, 1);
  const len = Math.hypot(wantS, wantT) || 1;
  const step = speed * dt;
  const dist2D = Math.hypot(ds, dth * circ);
  const mv = Math.min(step, dist2D);
  a.ls += (wantS / len) * mv; a.lth += ((wantT / len) * mv) / circ;
  a.ls = clamp(a.ls, 0, L.len);
  // fordulat: haladási irány a felszínen
  a.moved = mv;
  const p = limbPoint(w, a.limb, a.ls, a.lth, {});
  a.fw = [(wantS / len) * p.dx + (wantT / len) * 0, (wantS / len) * p.dy, (wantS / len) * p.dz];
  a.yaw = Math.atan2(p.dx * Math.sign(wantS || 1), p.dz * Math.sign(wantS || 1));
  // ágváltás
  if (a.limb !== targetLimb) {
    const route = limbRoute(w, a.limb, targetLimb); const nextLimb = route[1];
    if (nextLimb === L.parent && a.ls <= 0.6) { const C = L; a.limb = L.parent; a.ls = C.sP; a.lth = C.thP; }
    else if (nextLimb !== L.parent) { const C = w.limbs[nextLimb]; if (Math.abs(a.ls - C.sP) < 1.2 && Math.abs(angDiff(a.lth, C.thP)) < 0.35) { a.limb = nextLimb; a.ls = 0.6; a.lth = C.thP; } }
    return 99;
  }
  return Math.hypot(ts - a.ls, angDiff(a.lth, tth) * circ);
}
export function limbRoute(w, from, to) {
  const chain = (l) => { const c = [l]; while (w.limbs[l].parent >= 0) { l = w.limbs[l].parent; c.push(l); } return c; };
  const a = chain(from), b = chain(to);
  const common = a.find((x) => b.includes(x));
  const up = a.slice(0, a.indexOf(common) + 1), down = b.slice(0, b.indexOf(common)).reverse();
  return [...up, ...down];
}
