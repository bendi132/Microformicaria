// Levéltetű-farm: gazdanövények (az élőhelyhez illő lágyszárúak) és levéltetvek.
//  - A levéltetű a növény nedvéből él, a felesleges cukrot mézharmatként üríti; a hangyák "fejik" és védik (mutualizmus).
//  - Sivatagban nincs levéltetű (nincs hozzá való lágyszárú növényzet); mérsékelt és trópusi erdőben van.
//  - A játékos az E gombbal felveheti a tetvet és másik növényre teheti; a növényen mézharmatot termel.
//  - Védtelen tetű ragadozók (katicabogár-lárva, fátyolka) áldozata lesz; hangya a közelben nagyon lecsökkenti a veszélyt.
// A világ részeként menthető (w.hosts, w.aphids); a mézharmat egy 'sap' típusú táplálékforrás (w.foods), ezt a gyűjtők a megszokott módon használják.
import { RNG } from '../core/rng.js';
import { dist } from '../core/util.js';
import { WORLD_HALF, WORLD_MAX } from './config.js';

export const APHID_MAX = 36;            // összes tetű a világban
export const HOST_CAP = 8;              // egy növényen legfeljebb ennyi
// gazdanövények: key, magasság (mm), levél-, virágszín
export const HOST_KINDS = {                // model: a megjelenítő modellje (assets/models/undergrowth.glb)
  temperate: [
    { key: 'dandelion', name: 'pitypang', model: 'dandelion', h: [22, 30] },
    { key: 'lactuca',   name: 'csorbóka', model: 'lactuca',   h: [38, 50] },
    { key: 'plantain',  name: 'útifű',    model: 'plantain',  h: [14, 20] },
  ],
};
HOST_KINDS.tropical = HOST_KINDS.temperate;
export const hostKindOf = (key) => HOST_KINDS.temperate.find((q) => q.key === key) || HOST_KINDS.temperate[0];          // régi mentések növénykulcsai is a pitypangra/csorbókára esnek

// gazdanövények legenerálása (külön RNG: a világ többi része és a régi mentések változatlanok maradnak)
export function ensureHosts(w) {
  if (w.hosted) return w; w.hosted = true; if (!w.hosts) w.hosts = []; if (!w.aphids) w.aphids = [];
  if (w.biome === 'desert' || (w.limbs && w.limbs.length)) return w;            // sivatag: nincs; fa-világ: ott a fa nedve a cukorforrás
  const kinds = HOST_KINDS[w.biome] || HOST_KINDS.temperate; const rng = new RNG(w.seed ^ 0x51d0a9f1), id = () => w.nextId++;
  const free = (x, z) => {
    for (const s of w.stones) if (dist(x, z, s.x, s.z) < s.r + 3) return false;
    for (const l of w.logs) if (dist(x, z, l.x, l.z) < l.len * 0.5 + 2) return false;
    for (const t of w.tufts) if (dist(x, z, t.x, t.z) < t.r + 2) return false;
    for (const q of w.plants) if (dist(x, z, q.x, q.z) < q.r + 3) return false;
    for (const q of w.hosts) if (dist(x, z, q.x, q.z) < 7) return false;
    return true;
  };
  const sp = w.spawn || { x: 0, z: 0 };
  const put = (x, z) => { const k = kinds[Math.floor(rng.next() * kinds.length)]; w.hosts.push({ id: id(), key: k.key, x, z, r: 1.7, h: rng.range(k.h[0], k.h[1]), seed: rng.next(), yaw: rng.range(0, 6.28) }); return w.hosts[w.hosts.length - 1]; };
  // a fészek közelében (14–48 mm), a kezdő játéktér többi részén, majd a külső gyűrűben
  for (let i = 0, t = 0; i < 9 && t < 400; t++) { const a = rng.range(0, 6.28), d = rng.range(14, 48), x = sp.x + Math.cos(a) * d, z = sp.z + Math.sin(a) * d; if (Math.abs(x) > WORLD_HALF - 8 || Math.abs(z) > WORLD_HALF - 8 || !free(x, z)) continue; put(x, z); i++; }
  for (let i = 0, t = 0; i < 7 && t < 400; t++) { const x = rng.range(-WORLD_HALF + 8, WORLD_HALF - 8), z = rng.range(-WORLD_HALF + 8, WORLD_HALF - 8); if (dist(x, z, sp.x, sp.z) < 30 || !free(x, z)) continue; put(x, z); i++; }
  for (let i = 0, t = 0; i < 16 && t < 600; t++) { const x = rng.range(-WORLD_MAX + 10, WORLD_MAX - 10), z = rng.range(-WORLD_MAX + 10, WORLD_MAX - 10); if (Math.abs(x) < WORLD_HALF + 2 && Math.abs(z) < WORLD_HALF + 2) continue; if (!free(x, z)) continue; put(x, z); i++; }
  // vadon élő tetű-telepek: a fészekhez legközelebbi három növényen (≥14 mm-re a kezdőponttól)
  const near = w.hosts.filter((h) => dist(h.x, h.z, sp.x, sp.z) >= 14).sort((p, q) => dist(p.x, p.z, sp.x, sp.z) - dist(q.x, q.z, sp.x, sp.z)).slice(0, 3);
  for (const h of near) { addAphid(w, h, rng); addAphid(w, h, rng); }
  return w;
}

// egy új tetű a gazdán (a mézharmat-forrással együtt)
export function addAphid(w, host, rng) {
  const a = rng.range(0, 6.28), d = rng.range(0.5, 0.75), y = rng.range(0.2, 0.75) * host.h * 0.55;
  const ap = { id: w.nextId++, host: host.id, x: host.x + Math.cos(a) * d, z: host.z + Math.sin(a) * d, hy: y, yaw: a + rng.range(-0.6, 0.6), age: 0, tendT: -999 };
  w.aphids.push(ap);
  w.foods.push({ id: w.nextId++, kind: 'sap', x: ap.x, z: ap.z, amount: 1.2, max: 5, regen: 0.06, aphid: ap.id, honey: true });
  return ap;
}
export function removeAphid(w, id) { w.aphids = w.aphids.filter((q) => q.id !== id); w.foods = w.foods.filter((f) => f.aphid !== id); }
export const aphidCount = (w) => (w.aphids ? w.aphids.length : 0);
export const hostCount = (w, hid) => { let n = 0; for (const q of w.aphids || []) if (q.host === hid) n++; return n; };

// léptetés (másodpercenként egyszer, dt ≈ 1 s)
export function stepAphids(sim, dt) {
  const w = sim.world, list = w.aphids; sim.honeyReady = 0; if (!list || !list.length) return;
  for (const f of w.foods) if (f.aphid && f.amount >= 3) sim.honeyReady++;          // kész mézharmat: a gyűjtés a ragadozó fajoknak is érdemes
  const rng = sim.rng, env = sim.env, t = sim.t; const lady = (w.ladyUntil || 0) > t, guard = (w.aphidGuardUntil || 0) > t;
  const ants = sim.ants;
  for (let i = list.length - 1; i >= 0; i--) {
    const ap = list[i]; ap.age += dt;
    let near = false; for (const a of ants) { if (a.dead || a.loc !== 'ground') continue; if (Math.abs(a.x - ap.x) < 12 && Math.abs(a.z - ap.z) < 12) { near = true; break; } }
    if (near) ap.tendT = t;
    const tended = t - ap.tendT < 25;
    const f = w.foods.find((q) => q.aphid === ap.id);
    if (f) f.regen = 0.06 * (tended ? 1.7 : 1) * (env.temp > 10 ? 1 : 0.3) * (env.night ? 0.6 : 1);
    else w.foods.push({ id: w.nextId++, kind: 'sap', x: ap.x, z: ap.z, amount: 0.5, max: 5, regen: 0.06, aphid: ap.id, honey: true });
    // ragadozó: védtelenül sokkal nagyobb az esély
    const p = (lady ? (w.ladyRate || 0.006) : 0.0003) * ((tended || guard) ? 0.08 : 1);
    if (rng.chance(p * dt)) { removeAphid(w, ap.id); if (lady) sim.log('Egy levéltetűt elkapott a katicabogár-lárva.', 'warn'); continue; }
  }
  // szaporodás (partenogenezis): meleg időben, jól táplált telepeken
  if (list.length < APHID_MAX && env.temp > 12 && env.temp < 32) {
    for (const ap of list.slice()) {
      if (ap.age < 60 || list.length >= APHID_MAX) continue;
      const h = w.hosts.find((q) => q.id === ap.host); if (!h || hostCount(w, h.id) >= 6) continue;
      if (rng.chance(0.004 * dt)) addAphid(w, h, rng);
    }
  }
}

// ---- játékos-műveletek (E)
// a legközelebbi tetű a hangya "szája" körül; a mézharmat-cseppet csak akkor itatjuk, ha elég van belőle (lásd tasks.js nearbyUse)
export function aphidNear(w, a, reach) {
  let best = null, bd = reach; for (const ap of w.aphids || []) { const d = dist(a.x, a.z, ap.x, ap.z); if (d < bd) { bd = d; best = ap; } } return best;
}
export function pickAphid(sim, a) {
  const w = sim.world; if (a.carry) return false; const ap = aphidNear(w, a, Math.max(3.4, a.len * 0.75 + 1.5)); if (!ap) return false;
  removeAphid(w, ap.id); a.carry = { kind: 'aphid', amt: 1 }; sim.note = 'aphidTaken'; sim.noteT = sim.t; return true;
}
export function hostNear(w, x, z, reach = 3.5) {
  let best = null, bd = 1e9; for (const h of w.hosts || []) { const d = dist(x, z, h.x, h.z) - h.r; if (d < reach && d < bd) { bd = d; best = h; } } return best;
}
export function placeAphid(sim, a) {
  const w = sim.world; if (!a.carry || a.carry.kind !== 'aphid') return false;
  const h = hostNear(w, a.x, a.z, 4 + a.len * 0.4);
  if (!h) { sim.note = 'aphidNoHost'; sim.noteT = sim.t; return false; }
  if (hostCount(w, h.id) >= HOST_CAP) { sim.note = 'aphidFull'; sim.noteT = sim.t; return false; }
  addAphid(w, h, sim.rng); a.carry = null; sim.note = 'aphidPlaced'; sim.noteT = sim.t; return true;
}
