// Küldetések / mérföldkövek: a játék közben teljesülnek, XP-t adnak, és a szünet-menüben listázva vannak.
// A teljesített célok a profilban (prog.goals) tárolódnak, így játékokon át megmaradnak.
const workers = (s) => s.ants.filter((a) => !a.dead && a.caste !== 'queen').length;
const chambers = (s) => (s.nest ? s.nest.nodes.filter((n) => n.kind === 'chamber').length : 0);
const okEvents = (s) => (s.colony.mg ? s.colony.mg.log.filter((q) => q.good === true || q.good === 'ok' || (q.good && q.good !== 'bad' && q.good !== 'meh')).length : 0);
export const GOALS = [
  { id: 'w1',    icon: '🐜', name: 'Első dolgozó',        desc: 'Kel ki az első dolgozó.',                       xp: 10, test: (s) => workers(s) >= 1 },
  { id: 'w10',   icon: '🐜', name: 'Kis csapat',          desc: '10 élő dolgozó.',                               xp: 15, test: (s) => workers(s) >= 10 },
  { id: 'w30',   icon: '👥', name: 'Gyarapodó kolónia',   desc: '30 élő dolgozó.',                               xp: 25, test: (s) => workers(s) >= 30 },
  { id: 'w80',   icon: '🏙️', name: 'Nagy kolónia',        desc: '80 élő dolgozó.',                               xp: 50, test: (s) => workers(s) >= 80 },
  { id: 'k1',    icon: '🍖', name: 'Első zsákmány',       desc: 'Ejts el egy állatot.',                          xp: 5,  test: (s) => s.stats.kills >= 1 },
  { id: 'k25',   icon: '⚔️', name: 'Vadász',              desc: '25 elejtett állat egy játékban.',               xp: 25, test: (s) => s.stats.kills >= 25 },
  { id: 'ch3',   icon: '🕳️', name: 'Kamrarendszer',       desc: 'Építs 3 kamrát.',                               xp: 20, test: (s) => chambers(s) >= 3 },
  { id: 'd10',   icon: '🌞', name: 'Túlélő',              desc: 'Érj meg 10 napot.',                             xp: 20, test: (s) => s.env.day >= 10 },
  { id: 'd30',   icon: '🏆', name: 'Veterán kolónia',     desc: 'Érj meg 30 napot.',                             xp: 60, test: (s) => s.env.day >= 30 },
  { id: 'aph1',  icon: '🌿', name: 'Levéltetű-pásztor',   desc: 'Tegyél egy levéltetűt (E) egy másik növényre.',  xp: 20, test: (s) => (s.stats.aphidsPlaced || 0) >= 1 },
  { id: 'hon50', icon: '🍯', name: 'Mézharmat-gazda',     desc: '50 egység cukor a fészekbe (bármely forrásból).', xp: 25, test: (s) => (s.stats.honey || 0) >= 50 },
  { id: 'ev3',   icon: '📋', name: 'Jó vezető',           desc: '3 sikeres döntés az eseményekben.',             xp: 30, test: (s) => okEvents(s) >= 3 },
  { id: 'streak',icon: '🔥', name: 'Sorozat',             desc: 'Ölj meg 5 rovart 20 másodpercen belül (FPV).',  xp: 20, test: (s) => (s.stats.bestStreak || 0) >= 5 },
];
// az újonnan teljesült célok azonosítói (a profilba beírja őket)
export function evalGoals(sim, prog) {
  prog.goals = prog.goals || {}; const out = [];
  for (const g of GOALS) if (!prog.goals[g.id]) { let ok = false; try { ok = g.test(sim); } catch (e) {} if (ok) { prog.goals[g.id] = Date.now(); out.push(g); } }
  return out;
}
export const goalsDone = (prog) => GOALS.filter((g) => prog.goals && prog.goals[g.id]).length;
