// A játékvilág: domborzat, kövek, korhadt fa, moha, vízcseppek, nedvességtérkép, fa (Cephalotes), pókfészkek.
import { RNG } from '../core/rng.js';
import { fbm, clamp, dist, dist2 } from '../core/util.js';
import { WORLD_HALF, SPECIES } from './config.js';

export const MOIST_N = 60;                       // nedvességtérkép felbontása
export const CELL = (WORLD_HALF * 2) / MOIST_N;

export function createWorld(seed, speciesId) {
  const rng = new RNG(seed ^ 0x9e3779b1);
  const sp = SPECIES[speciesId];
  const w = {
    seed, speciesId, half: WORLD_HALF, nextId: 1,
    stones: [], logs: [], moss: [], droplets: [], foods: [], covers: [], lairs: [], limbs: [], cavities: [],
    moist: new Float32Array(MOIST_N * MOIST_N), spawn: { x: 0, z: 0 },
  };
  const id = () => w.nextId++;
  const free = (x, z, r, pad = 3) => {
    if (Math.hypot(x, z) < 15) return false;
    for (const s of w.stones) if (dist(x, z, s.x, s.z) < s.r + r + pad) return false;
    for (const l of w.logs) if (dist(x, z, l.x, l.z) < l.len * 0.5 + r) return false;
    return true;
  };
  const tree = sp.nest.type === 'tree';
  // ---- fa (Cephalotes): törzs + 2 ág, odúkkal
  if (tree) {
    const bx = -48, bz = 30;
    w.limbs.push({ id: 0, parent: -1, base: { x: bx, y: -1, z: bz }, dir: { x: 0, y: 1, z: 0 }, len: 95, r: 15, sP: 0, thP: 0, name: 'törzs' });
    w.limbs.push({ id: 1, parent: 0, dir: norm3(0.82, 0.45, 0.35), len: 52, r: 5.2, sP: 58, thP: 0.3, name: 'ág' });
    w.limbs.push({ id: 2, parent: 0, dir: norm3(-0.5, 0.55, -0.67), len: 44, r: 4.4, sP: 76, thP: 3.6, name: 'ág' });
    // odúk: (végtag, s, theta, bejárat átmérő mm, üreg térfogat jelző)
    w.cavities.push({ id: 0, limb: 0, s: 26, th: 0.2, entrance: 2.4, rooms: 2, moist: 0.5, name: 'szűk bogárjárat' });
    w.cavities.push({ id: 1, limb: 0, s: 41, th: 2.4, entrance: 3.7, rooms: 4, moist: 0.55, name: 'közepes üreg' });
    w.cavities.push({ id: 2, limb: 0, s: 66, th: 4.3, entrance: 5.4, rooms: 5, moist: 0.4, name: 'tágas üreg' });
    w.cavities.push({ id: 3, limb: 1, s: 22, th: 1.0, entrance: 3.3, rooms: 3, moist: 0.45, name: 'ágüreg' });
    w.stones.push({ id: id(), x: bx, z: bz, r: 15 + 1.5, h: 0, trunk: true });
  }
  // ---- kövek
  const nStones = tree ? 7 : 11;
  for (let i = 0, tries = 0; i < nStones && tries < 400; tries++) {
    const r = rng.range(4, 12), x = rng.range(-WORLD_HALF + 14, WORLD_HALF - 14), z = rng.range(-WORLD_HALF + 14, WORLD_HALF - 14);
    if (!free(x, z, r)) continue;
    w.stones.push({ id: id(), x, z, r, h: r * rng.range(0.45, 0.8), yaw: rng.range(0, 6.28), sq: rng.range(0.7, 1.0) }); i++;
  }
  // ---- korhadt fa (rönk) – nedves búvóhely
  for (let i = 0, tries = 0; i < (tree ? 3 : 2) && tries < 200; tries++) {
    const len = rng.range(24, 40), x = rng.range(-60, 60), z = rng.range(-60, 60);
    if (!free(x, z, len * 0.5, 4)) continue;
    w.logs.push({ id: id(), x, z, len, wid: rng.range(5, 8), yaw: rng.range(0, Math.PI), h: rng.range(3, 5) });
    i++;
  }
  // ---- moha
  for (let i = 0, tries = 0; i < 9 && tries < 200; tries++) {
    const r = rng.range(5, 11), x = rng.range(-WORLD_HALF + 10, WORLD_HALF - 10), z = rng.range(-WORLD_HALF + 10, WORLD_HALF - 10);
    if (Math.hypot(x, z) < 12) continue;
    w.moss.push({ id: id(), x, z, r, seed: rng.next() }); i++;
  }
  // ---- búvóhelyek (az ászkák és pókok ide húzódnak)
  for (const s of w.stones) if (!s.trunk) w.covers.push({ id: s.id, kind: 'stone', x: s.x, z: s.z, r: s.r + 2.5, shelter: 0.95, wet: 0.35 });
  for (const l of w.logs) w.covers.push({ id: l.id, kind: 'log', x: l.x, z: l.z, r: l.len * 0.45, shelter: 0.9, wet: 0.5, log: l });
  for (const m of w.moss) w.covers.push({ id: m.id, kind: 'moss', x: m.x, z: m.z, r: m.r, shelter: 0.6, wet: 0.45 });
  // ---- nedvességtérkép
  for (let j = 0; j < MOIST_N; j++) for (let i = 0; i < MOIST_N; i++) {
    const x = -WORLD_HALF + (i + 0.5) * CELL, z = -WORLD_HALF + (j + 0.5) * CELL;
    w.moist[j * MOIST_N + i] = clamp(0.18 + fbm(x * 0.03, z * 0.03, seed) * 0.35, 0, 1);
  }
  for (const c of w.covers) addMoisture(w, c.x, c.z, c.r * 1.3, c.wet * 0.6);
  // ---- kezdő vízcseppek és élelem
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, 6.28), d = rng.range(16, 55);
    w.droplets.push({ id: id(), x: Math.cos(a) * d, z: Math.sin(a) * d, vol: rng.range(18, 36), max: 36, dew: true });
  }
  for (const c of w.covers) if (c.kind !== 'moss' && rng.chance(0.5)) w.droplets.push({ id: id(), x: c.x + rng.range(-1, 1) * c.r, z: c.z + rng.range(-1, 1) * c.r, vol: 20, max: 30, dew: true });
  // méz / növényi nedv: csak a Cephalotes fáján, a fa ágain és törzsén
  if (tree) {
    for (let i = 0; i < 6; i++) {
      const limb = i < 4 ? 0 : (i === 4 ? 1 : 2);
      const L = w.limbs[limb];
      w.foods.push({ id: id(), kind: i % 3 === 2 ? 'dropping' : 'sap', limb, s: rng.range(8, L.len * 0.85), th: rng.range(0, 6.28), amount: rng.range(26, 46), max: 46, regen: 0.03 });
    }
  }
  // ---- pókfészkek (búvóhelyek alatt) – a tényleges betelepülés a szimuláción múlik
  for (const c of w.covers) if (c.kind !== 'moss') w.lairs.push({ id: id(), cover: c.id, x: c.x + rng.range(-0.4, 0.4) * c.r, z: c.z + rng.range(-0.4, 0.4) * c.r, silk: rng.range(0.4, 1), occupied: false, known: false });
  // ---- a királynő kezdőhelye
  let sx = 0, sz = 0;
  for (let t = 0; t < 100; t++) { sx = rng.range(-22, 22); sz = rng.range(-22, 22); if (free(sx, sz, 5, 6)) break; }
  w.spawn = { x: sx, z: sz };
  return w;
}

function norm3(x, y, z) { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; }

export function heightAt(w, x, z) {
  const base = (fbm(x * 0.045 + 3.1, z * 0.045 - 1.7, w.seed ^ 77) - 0.5) * 5.0 + (fbm(x * 0.2, z * 0.2, w.seed ^ 5) - 0.5) * 0.9;
  return base;
}
export function moistureAt(w, x, z) {
  const fx = (x + WORLD_HALF) / CELL - 0.5, fz = (z + WORLD_HALF) / CELL - 0.5;
  const i = clamp(Math.floor(fx), 0, MOIST_N - 2), j = clamp(Math.floor(fz), 0, MOIST_N - 2), tx = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1);
  const m = w.moist, a = m[j * MOIST_N + i], b = m[j * MOIST_N + i + 1], c = m[(j + 1) * MOIST_N + i], d = m[(j + 1) * MOIST_N + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
export function addMoisture(w, x, z, r, amount) {
  const i0 = Math.floor((x - r + WORLD_HALF) / CELL), i1 = Math.floor((x + r + WORLD_HALF) / CELL);
  const j0 = Math.floor((z - r + WORLD_HALF) / CELL), j1 = Math.floor((z + r + WORLD_HALF) / CELL);
  for (let j = Math.max(0, j0); j <= Math.min(MOIST_N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(MOIST_N - 1, i1); i++) {
    const cx = -WORLD_HALF + (i + 0.5) * CELL, cz = -WORLD_HALF + (j + 0.5) * CELL, d = dist(cx, cz, x, z);
    if (d < r) { const k = j * MOIST_N + i; w.moist[k] = clamp(w.moist[k] + amount * (1 - d / r), 0, 1); }
  }
}
// A világ lassú változása: párolgás (hőmérséklet és árnyék szerint), víz-szivárgás a cseppekből.
export function stepWorld(w, dt, env) {
  const evap = dt * (0.0009 + 0.0022 * clamp((env.temp - 10) / 25, 0, 1.4)) * (env.rain > 0 ? 0 : 1);
  const m = w.moist;
  for (let k = 0; k < m.length; k++) {
    const floor = 0.08; if (m[k] > floor) m[k] -= evap * (0.4 + m[k]);
  }
  if (env.rain > 0) for (let k = 0; k < m.length; k++) m[k] = Math.min(1, m[k] + dt * 0.004 * env.rain);
  for (const c of w.covers) if (env.step % 10 === 0) addMoisture(w, c.x, c.z, c.r * 1.2, 0.0016 * c.wet * 10 * dt * 0.1);
  for (const d of w.droplets) {
    const loc = moistureAt(w, d.x, d.z); d.vol -= dt * (0.012 + 0.06 * clamp((env.temp - 12) / 20, 0, 1.5)) * (1.1 - loc * 0.5) * (env.rain > 0 ? 0.1 : 1);
    if (env.rain > 0) d.vol = Math.min(d.max, d.vol + dt * 0.6 * env.rain);
  }
  w.droplets = w.droplets.filter((d) => d.vol > 0.3);
  for (const f of w.foods) f.amount = Math.min(f.max, f.amount + f.regen * dt);
}
export function newDew(w, rng, count) {
  for (let i = 0; i < count; i++) {
    const c = rng.chance(0.5) && w.covers.length ? rng.pick(w.covers) : null;
    const x = c ? c.x + rng.range(-1, 1) * c.r : rng.range(-WORLD_HALF + 10, WORLD_HALF - 10), z = c ? c.z + rng.range(-1, 1) * c.r : rng.range(-WORLD_HALF + 10, WORLD_HALF - 10);
    w.droplets.push({ id: w.nextId++, x, z, vol: rng.range(14, 30), max: 32, dew: true });
  }
}
export function nearestCover(w, x, z, maxD = 1e9, filter) {
  let best = null, bd = maxD;
  for (const c of w.covers) { if (filter && !filter(c)) continue; const d = dist(x, z, c.x, c.z) - c.r * 0.5; if (d < bd) { bd = d; best = c; } }
  return best ? { cover: best, d: bd } : null;
}
// kör alakú akadályok (kövek, rönk szakaszok)
export function obstaclesAt(w, x, z, rad) {
  const out = [];
  for (const s of w.stones) if (Math.abs(s.x - x) < s.r + rad + 2 && Math.abs(s.z - z) < s.r + rad + 2) out.push({ x: s.x, z: s.z, r: s.r });
  return out;
}
// Mászható felületek (kövek, rönkök teteje): a felület abszolút magassága az (x, z) pontban, vagy null, ha nincs alatta tárgy.
// A méretek a megjelenítéssel egyeznek (worldview: kő = ellipszoid, rönk = ellipszis keresztmetszetű henger).
export function climbHeight(w, x, z) {
  let best = null;
  const g = heightAt(w, x, z);
  for (const s of w.stones) {
    if (s.trunk) continue; const dx = x - s.x, dz = z - s.z; if (Math.abs(dx) > s.r || Math.abs(dz) > s.r) continue;
    const c = Math.cos(s.yaw), si = Math.sin(s.yaw), u = (dx * c - dz * si) / s.r, v = (dx * si + dz * c) / (s.r * s.sq), q = 1 - u * u - v * v; if (q <= 0) continue;
    const y = heightAt(w, s.x, s.z) - s.h * 0.12 + s.h * 1.15 * Math.sqrt(q) * 0.97; if (y > g + 0.05 && (!best || y > best.y)) best = { y, kind: 'stone', id: s.id };
  }
  for (const l of w.logs) {
    const dx = x - l.x, dz = z - l.z; if (Math.abs(dx) > l.len || Math.abs(dz) > l.len) continue;
    const c = Math.cos(l.yaw), si = Math.sin(l.yaw), u = (dx * c - dz * si) / l.len, v = (dx * si + dz * c) / (l.wid * 0.5); if (Math.abs(u) > 0.5 || Math.abs(v) >= 1) continue;
    const y = heightAt(w, l.x, l.z) + l.h * 0.55 + l.h * Math.sqrt(1 - v * v) * 0.97; if (y > g + 0.05 && (!best || y > best.y)) best = { y, kind: 'log', id: l.id };
  }
  return best;
}
// A fa felszíni pontja (végtag, s, th) -> 3D
export function limbPoint(w, limbId, s, th, out = {}) {
  const L = w.limbs[limbId];
  const base = limbBase(w, L);
  const d = L.dir;
  // egy merőleges bázis
  const up = Math.abs(d.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  let ux = d.y * up.z - d.z * up.y, uy = d.z * up.x - d.x * up.z, uz = d.x * up.y - d.y * up.x; const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = d.y * uz - d.z * uy, vy = d.z * ux - d.x * uz, vz = d.x * uy - d.y * ux;
  const c = Math.cos(th), si = Math.sin(th);
  const nx = ux * c + vx * si, ny = uy * c + vy * si, nz = uz * c + vz * si;
  out.x = base.x + d.x * s + nx * L.r; out.y = base.y + d.y * s + ny * L.r; out.z = base.z + d.z * s + nz * L.r;
  out.nx = nx; out.ny = ny; out.nz = nz; out.dx = d.x; out.dy = d.y; out.dz = d.z;
  return out;
}
export function limbBase(w, L) {
  if (L.parent < 0) return L.base;
  if (L._base) return L._base;
  const P = w.limbs[L.parent]; const pb = limbBase(w, P); const pd = P.dir;
  // az ág gyökere a szülő felszínén, a (sP, thP) pontban
  const tmp = limbPoint(w, L.parent, L.sP, L.thP, {});
  L._base = { x: tmp.x - tmp.nx * L.r * 0.4, y: tmp.y - tmp.ny * L.r * 0.4, z: tmp.z - tmp.nz * L.r * 0.4 };
  return L._base;
}
