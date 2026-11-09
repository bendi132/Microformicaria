// Játék-előrehaladás: szint (XP) és a nehezebb fajok feloldása. Tisztán logikai modul (DOM nélkül, tesztelhető);
// az állapot a böngészőben (localStorage) marad, a szimulációtól függetlenül.

const KEY = 'microformicaria.progress.v1';

// Feloldási feltételek. A szabadon játszható fajok (cephalotes, odonto) nincsenek itt.
// A feltételek összesített (minden játékot számító) mutatókra épülnek, így nincs körkörös zár.
export const UNLOCK = {
  messor:      { req: [{ kind: 'foundings', n: 1 }] },
  ponera:      { req: [{ kind: 'foundings', n: 2 }, { kind: 'preyKills', n: 10 }] },
  proceratium: { req: [{ kind: 'foundings', n: 3 }, { kind: 'preyKills', n: 30 }] },
};
export const REQ_TEXT = {
  foundings: (n) => `${n} sikeres kolóniaalapítás`,
  preyKills: (n) => `${n} zsákmány elejtése`,
};
// Sikeres kolóniaalapítás: nem a kész kezdő kolónia, és a nap ≥ FOUND_DAY, a királynő él, legalább FOUND_WORKERS dolgozóval.
export const FOUND_DAY = 10, FOUND_WORKERS = 8;

export function defaultState() { return { xp: 0, preyKills: 0, foundings: 0, seenHelp: false }; }

export function load() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
  } catch (e) { return defaultState(); }
}
export function save(state) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* privát mód / tiltott tárhely: a játék ettől még működik */ }
}

// XP-szint: 20 XP az első szinthez, a következő szintig a követelmény négyzetesen nő.
export function levelOf(xp) { return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 20)); }
export function xpBounds(xp) {
  const lv = levelOf(xp); const lo = 20 * (lv - 1) * (lv - 1), hi = 20 * lv * lv;
  return { level: lv, lo, hi, into: xp - lo, span: hi - lo };
}

export function unlockProgress(state, id) {
  const u = UNLOCK[id]; if (!u) return { free: true, done: true, items: [] };
  const items = u.req.map((r) => { const have = Math.min(state[r.kind] || 0, r.n); return { kind: r.kind, need: r.n, have, done: have >= r.n, text: REQ_TEXT[r.kind](r.n) }; });
  return { free: false, done: items.every((i) => i.done), items };
}
export function isUnlocked(state, id) { return unlockProgress(state, id).done; }
export function newlyUnlocked(before, after, ids) { return ids.filter((id) => !isUnlocked(before, id) && isUnlocked(after, id)); }

export function addPreyKills(state, n) { if (n > 0) { state.preyKills += n; state.xp += 2 * n; } return state; }
export function addFounding(state) { state.foundings += 1; state.xp += 30; return state; }
// Kolónia-vezetés: a döntések kiértékelése XP-t ad (a szimuláció gyűjti: sim.colony.mg.xp)
export function addXp(state, n) { if (n > 0) state.xp += n; return state; }

// Igaz, ha az aktuális játék most teljesít egy sikeres alapítást (a hívó egyszer ellenőrzi futásonként).
export function foundingMet(sim, difficulty) {
  if (difficulty === 'easy' || !sim || !sim.env || sim.env.day < FOUND_DAY) return false;
  const q = sim.queen; if (!q || q.dead) return false;
  return sim.ants.filter((a) => !a.dead && a.caste !== 'queen').length >= FOUND_WORKERS;
}
