// Nyomferomon-mező: a táplálékkal hazatérő hangya nyomot hagy, amely párolog; a keresgélők az otthontól távolodó irányban a nyom felé fordulnak.
// Egyszerűsítés (nyíltan): a valóságban a hangya a nyom irányát a feromon-gradiensből és tájékozódási memóriából ismeri; itt az "otthontól kifelé" irányt használjuk.
// A mező nincs mentve (betöltés után újra felépül).
import { clamp, dist } from '../core/util.js';
import { DAY, WORLD_MAX } from './config.js';

export const PN = WORLD_MAX, PC = 2;                     // PN×PC = a teljes világ (2·WORLD_MAX mm)                      // 90x90 cella, 2 mm
const STRENGTH = { ponera: 0.22, cephalotes: 1.0, odonto: 0.3, proceratium: 0.45 };   // a magányos vadászok alig, a gyűjtögetők erősen nyomoznak
export const trailStrength = (sim) => STRENGTH[sim.speciesId] ?? 0.4;

export function ensure(sim) { if (!sim.phero) sim.phero = new Float32Array(PN * PN); return sim.phero; }
const idx = (w, x, z) => { const i = Math.floor((x + WORLD_MAX) / PC), j = Math.floor((z + WORLD_MAX) / PC); return (i < 0 || j < 0 || i >= PN || j >= PN) ? -1 : j * PN + i; };
export function deposit(sim, x, z, amt) { const f = ensure(sim), k = idx(sim.world, x, z); if (k >= 0) f[k] = Math.min(6, f[k] + amt); }
export function sample(sim, x, z) { const f = ensure(sim), k = idx(sim.world, x, z); return k >= 0 ? f[k] : 0; }
export function decay(sim, dt) {
  const f = ensure(sim); const k = Math.exp(-dt / (DAY * 0.3)); let s = 0;
  for (let i = 0; i < f.length; i++) { let v = f[i] * k; if (v < 0.01) v = 0; f[i] = v; s += v; }
  // enyhe terjedés (szomszédos cellákba szivárog), hogy a nyom ne legyen pontsor
  if (s > 0) { const g = f.slice(); for (let j = 1; j < PN - 1; j++) for (let i = 1; i < PN - 1; i++) { const c = j * PN + i, v = g[c]; if (v > 0.2) { const e = v * 0.06 * Math.min(1, dt * 4); f[c - 1] += e; f[c + 1] += e; f[c - PN] += e; f[c + PN] += e; f[c] -= 4 * e; } } }
}
// Egy keresgélő hangya a nyom felé terelődik: a körülötte mintavételezett irányok közül a legerősebb, otthontól távolodó nyom.
export function followDir(sim, a, R = 11) {
  const w = sim.world, n = sim.nest; if (!n || a.loc !== 'ground') return null; const home = n.nodes[0];
  const dHere = dist(a.x, a.z, home.x, home.z); let best = null, bs = 0.14;
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * 6.2832 + sim.rng.range(-0.15, 0.15), x = clamp(a.x + Math.sin(ang) * R, -w.half + 4, w.half - 4), z = clamp(a.z + Math.cos(ang) * R, -w.half + 4, w.half - 4);
    const p = Math.max(sample(sim, x, z), sample(sim, (a.x + x) / 2, (a.z + z) / 2) * 0.9); if (p < 0.1) continue;
    const out = clamp((dist(x, z, home.x, home.z) - dHere) / R, -1, 1); const sc = p * (0.35 + 0.65 * (out + 1) / 2) * (out > -0.2 ? 1 : 0.2);
    if (sc > bs) { bs = sc; best = { x: x + Math.sin(ang) * R * 0.6, z: z + Math.cos(ang) * R * 0.6 }; }
  }
  if (best) { best.x = clamp(best.x, -w.half + 4, w.half - 4); best.z = clamp(best.z, -w.half + 4, w.half - 4); }
  return best;
}
