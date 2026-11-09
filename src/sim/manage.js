// Kolónia-vezetés (menedzsment réteg): a játékos nem egy hangyát, hanem a kolóniát irányítja.
//  - irányelvek (előbeállítások) és időszakos módosítók a munkaelosztáshoz (effDir → tasks.js chooseTask),
//  - készlet- és népesség-trendek (mintavétel), napi jelentés rövid tanácsokkal,
//  - döntési események (kártya 2–4 választással, mindegyiknek ára van), amelyek utólag kiértékelődnek.
// Tisztán szimulációs modul (DOM nélkül): determinisztikus (a szimuláció RNG-jét használja), és a kolónia részeként menthető.
import { SPECIES, DAY } from './config.js';
import { chambers, node } from './nest.js';
import { storeCap, workers } from './colony.js';
import { seedAt } from './world.js';
import { makeIsopod } from './entities.js';
import { dist, clamp } from '../core/util.js';

export const MIN_WORKERS = 6;                       // ettől a létszámtól kezdve érkeznek döntési események (a kis kolónia még nem "vezetett")
export const KEY_NAME = { hunt: 'Vadászat', forage: 'Gyűjtés', water: 'Vízkeresés', nurse: 'Dajkálás', dig: 'Ásás', guard: 'Őrség', repair: 'Javítás', caution: 'Óvatosság', flood: 'Elöntés-kockázat' };
export const GROUPS = ['hunt', 'forage', 'water', 'nurse', 'dig', 'guard', 'rest'];
export const GROUP_NAME = { hunt: 'Vadászat', forage: 'Gyűjtés', water: 'Vízkeresés', nurse: 'Dajkálás', dig: 'Ásás és javítás', guard: 'Őrség és védekezés', rest: 'Pihenő / saját szükséglet' };
const TASK_GROUP = { hunt: 'hunt', raid: 'hunt', forage: 'forage', water: 'water', nurse: 'nurse', lay: 'nurse', dig: 'dig', repair: 'dig', guard: 'guard', fight: 'guard', plug: 'guard', flee: 'guard', rest: 'rest', idle: 'rest', eat: 'rest', drink: 'rest', manual: 'rest' };
const SPIDER_HU = { small: 'kis pók', medium: 'közepes pók', large: 'nagy pók', scorpion: 'skorpió' };
const STORE_KEYS = ['prey', 'sugar', 'water', 'seed'];

// ---- irányelvek: a csúszkák előbeállításai
export const POLICIES = {
  balanced: { name: 'Kiegyensúlyozott', icon: '⚖', desc: 'Minden feladat egyenlő súllyal.', dir: { hunt: 1, forage: 1, water: 1, nurse: 1, dig: 1, guard: 1, caution: 0.35 } },
  expand:   { name: 'Terjeszkedés', icon: '⛏', desc: 'Több ásás és dajkálás, kevesebb őrség: nő a fészek és a fiasítás.', dir: { hunt: 1.1, forage: 1, water: 1, nurse: 1.3, dig: 1.7, guard: 0.6, caution: 0.35 } },
  harvest:  { name: 'Gyűjtés', icon: '🍯', desc: 'Erős vadászat és gyűjtés a raktárak feltöltésére.', dir: { hunt: 1.7, forage: 1.7, water: 1.1, nurse: 0.9, dig: 0.7, guard: 0.6, caution: 0.25 } },
  brood:    { name: 'Fiasítás', icon: '🐛', desc: 'A dajkálás és a víz elsőbbséget kap: gyorsabb utánpótlás.', dir: { hunt: 1.2, forage: 1.1, water: 1.4, nurse: 1.8, dig: 0.6, guard: 0.8, caution: 0.4 } },
  defend:   { name: 'Védelem', icon: '🛡', desc: 'Erős őrség és óvatosság: biztonságosabb, de lassabb.', dir: { hunt: 0.7, forage: 0.7, water: 0.9, nurse: 1, dig: 0.7, guard: 1.9, caution: 0.85 } },
};

// ---- állapot
export function ensureMgmt(sim) {
  const c = sim.colony; if (c.mg) return c.mg;
  c.mg = {
    mods: [], ev: null, nextEv: -1, lastEv: '', reports: [], log: [], samples: [], sampT: 0, policy: 'balanced', unread: false, day0: null,
    cnt: { died: 0, lost: 0, floods: 0, collapses: 0, wasted: 0, inc: { prey: 0, sugar: 0, water: 0, seed: 0 } },
    decisions: 0, good: 0, xp: 0, seq: 0,
  };
  return c.mg;
}
// Tényleges prioritás: a játékos csúszkái × az aktív (időszakos) módosítók. A tasks.js ezt használja a feladat-választáshoz.
export function effDir(sim) {
  const d = sim.colony.dir, o = { hunt: d.hunt, forage: d.forage, water: d.water, nurse: d.nurse, dig: d.dig, guard: d.guard, caution: d.caution, repair: 1 };
  const mg = sim.colony.mg; if (mg) for (const m of mg.mods) if (m.until > sim.t && m.k in o) o[m.k] *= m.mul;
  return o;
}
export function modMul(sim, k) {
  const mg = sim.colony.mg; let v = 1; if (mg) for (const m of mg.mods) if (m.k === k && m.until > sim.t) v *= m.mul; return v;
}
export function applyPolicy(sim, id) {
  const p = POLICIES[id]; if (!p) return false; Object.assign(sim.colony.dir, p.dir); ensureMgmt(sim).policy = id; return true;
}
export function setDir(sim, k, v) { if (!(k in sim.colony.dir)) return false; sim.colony.dir[k] = clamp(+v || 0, 0, k === 'caution' ? 1 : 2); ensureMgmt(sim).policy = 'custom'; return true; }

// ---- mérések
export function laborCensus(sim) {
  const g = {}; for (const k of GROUPS) g[k] = 0; let total = 0;
  for (const a of sim.ants) { if (a.dead || a.caste === 'queen') continue; total++; g[TASK_GROUP[a.task] || 'rest']++; }
  return { total, groups: g };
}
export function capacity(sim) {
  const n = sim.nest; if (!n) return { brood: { used: 0, cap: 0 }, chambers: 0, maxChambers: 0, store: storeCap(sim) };
  const sp = SPECIES[sim.speciesId]; let cap = 0; for (const nd of chambers(n)) if (nd.role !== 'store' && !nd.building) cap += Math.floor(nd.cap * 1.5);
  const jobs = n.jobs.filter((j) => j.active && j.kind === 'chamber').length;
  return { brood: { used: sim.brood.length, cap }, chambers: n.nodes.filter((q) => q.kind === 'chamber').length, building: jobs, maxChambers: sp.nest.maxChambers, store: storeCap(sim) };
}
function snap(sim) {
  const c = sim.colony, k = c.mg.cnt;
  return { t: sim.t, died: k.died, lost: k.lost, floods: k.floods, collapses: k.collapses, wasted: k.wasted, inc: { ...k.inc }, store: { ...c.store }, born: c.emerged, kills: (sim.stats && sim.stats.kills) || 0, workers: workers(sim).length, brood: sim.brood.length };
}
function diff(a, b) {
  const inc = {}; let incTotal = 0; for (const k of STORE_KEYS) { inc[k] = b.inc[k] - a.inc[k]; incTotal += inc[k]; }
  return { died: b.died - a.died, lost: b.lost - a.lost, floods: b.floods - a.floods, collapses: b.collapses - a.collapses, wasted: b.wasted - a.wasted, inc, incTotal, born: b.born - a.born, kills: b.kills - a.kills,
    water: b.store.water - a.store.water, workers: b.workers - a.workers };
}
const ok = (text, xp = 4) => ({ good: true, text, xp });
const bad = (text) => ({ good: false, text, xp: 1 });
const meh = (text, xp = 2) => ({ good: null, text, xp });

// ---- események
const baseOf = (sim) => (sim.nest ? sim.nest.nodes[0] : null);
const hungryLarvae = (sim) => sim.brood.filter((b) => b.stage === 'larva' && b.fed < 0.5 && !b.dead);
const soilNest = (sim) => !!sim.nest && SPECIES[sim.speciesId].nest.type === 'soil';
function nearSpider(sim) {
  const b = baseOf(sim); if (!b) return null; let best = null, bd = 80;
  for (const s of sim.spiders) { if (s.dead || s.state === 'lair') continue; const d = dist(s.x, s.z, b.x, b.z); if (d < bd) { bd = d; best = s; } }
  return best ? { s: best, d: bd } : null;
}
function digOrder(sim, ev, role) {
  const n = sim.nest, rng = sim.rng; const from = rng.pick(n.nodes.filter((q) => q.ready !== false && q.kind !== 'entrance' && q.y > -17)) || n.nodes[0];
  const a = rng.range(0, Math.PI * 2), r = rng.range(10, 14);
  const job = sim.addDig(from.id, { x: from.x + Math.cos(a) * r, y: clamp(from.y - 2, -16, -6), z: from.z + Math.sin(a) * r }, role, 'tunnel');
  if (job && !job.error) { ev.data.job = job.id; return true; } return false;
}
// 1 nap = DAY mp; a 'mods' [kulcs, szorzó] párok az opció időtartamáig élnek
export const EVENTS = {
  raid: {
    title: 'Pók közelít a fészekhez', icon: '🕷', weight: 3, def: 'wait',
    when: (sim) => !!nearSpider(sim),
    text: (sim) => { const n = nearSpider(sim); return n ? `Egy ${SPIDER_HU[n.s.cls] || 'pók'} kószál a bejárat közelében (kb. ${Math.max(1, Math.round(n.d / 10))} cm-re). A felszíni dolgozók veszélyben vannak.` : 'Egy pók kószál a fészek közelében.'; },
    opts: [
      { id: 'guard', label: 'Őrjárat erősítése', note: 'Több dolgozó figyeli a bejáratot, kevesebb megy ki.', mods: [['guard', 2.2], ['hunt', 0.7], ['forage', 0.7]], judge: (sim, d) => d.died === 0 ? ok('Az őrjárat visszaverte a veszélyt – nincs veszteség.') : bad(`Az őrjárat ellenére ${d.died} hangya elpusztult.`) },
      { id: 'hide', label: 'Bent maradunk', note: 'A felszíni munka leáll, a dajkák dolgoznak tovább.', mods: [['caution', 2.6], ['hunt', 0.4], ['forage', 0.4], ['water', 0.6], ['nurse', 1.25]], judge: (sim, d) => d.died > 0 ? bad(`Az óvatosság ellenére ${d.died} hangya elpusztult.`) : d.incTotal < 1 ? meh('Biztonságban voltatok, de a gyűjtés leállt.', 3) : ok('Biztonságban átvészeltétek, és a gyűjtés sem állt le teljesen.') },
      { id: 'wait', label: 'Nem avatkozunk be', note: 'A dolgozók maguk döntenek.', mods: [], judge: (sim, d) => d.died === 0 ? ok('A pók elkerülte a kolóniát.', 3) : bad(`A pók ${d.died} hangyát ölt meg.`) },
    ],
  },
  heat: {
    title: 'Hőhullám', icon: '🔥', weight: 2.4, def: 'wait',
    when: (sim) => sim.env.weather === 'heat' || (!!sim.env.forecast && sim.env.forecast.type === 'heat'),
    text: (sim) => `${sim.env.weather === 'heat' ? 'Tart a hőség' : 'Hőhullám közeledik'}: a felszín kiszárít, a fiasítás kamrái melegednek.`,
    opts: [
      { id: 'water', label: 'Víztartalék gyűjtése', note: 'Több vízhordó, kevesebb táplálékgyűjtő.', mods: [['water', 1.8], ['forage', 0.8]], judge: (sim, d) => d.died === 0 && d.water >= -1 ? ok('A víztartalék kitartott a hőségen át.') : d.died === 0 ? meh('Túléltétek, de a víz fogyott.') : bad(`${d.died} dolgozó elpusztult a szárazságban.`) },
      { id: 'brood', label: 'Fiasítás védelme', note: 'A dajkák a hűvösebb kamrákba költöztetik a fiókákat.', mods: [['nurse', 1.8], ['hunt', 0.8]], judge: (sim, d) => d.lost === 0 ? ok('Egy fióka sem pusztult el a hőségben.') : bad(`${d.lost} fióka pusztult el a melegben.`) },
      { id: 'shade', label: 'Mindenki bent marad', note: 'A felszíni munka leáll a hőség idejére.', mods: [['caution', 2.2], ['hunt', 0.3], ['forage', 0.3], ['water', 0.6]], judge: (sim, d) => d.died === 0 ? ok('Árnyékban átvészeltétek a hőséget.') : bad(`${d.died} hangya elpusztult.`) },
      { id: 'wait', label: 'Nem avatkozunk be', note: 'A dolgozók maguk döntenek.', mods: [], judge: (sim, d) => d.died + d.lost === 0 ? ok('A kolónia bírta a hőséget.', 3) : bad(`A hőség ${d.died} dolgozót és ${d.lost} fiókát követelt.`) },
    ],
  },
  flood: {
    title: 'Heves eső – elöntés veszélye', icon: '🌧', weight: 2.2, def: 'wait',
    when: (sim) => soilNest(sim) && (sim.env.weather === 'rain' || (!!sim.env.forecast && sim.env.forecast.type === 'rain')),
    text: () => 'A heves eső elöntheti a mély kamrákat, és beomolhatnak a sekély járatok.',
    opts: [
      { id: 'reinforce', label: 'Járatok megerősítése', note: 'Az ásók a sekély járatokat támasztják; kisebb beomlási esély.', mods: [['flood', 0.35], ['dig', 0.8], ['repair', 2]], judge: (sim, d) => d.floods + d.collapses === 0 ? ok('A megerősített járatok kibírták az esőt.') : d.lost === 0 ? meh('Volt kár, de a fiasítás megmenekült.', 3) : bad(`Az eső ${d.lost} fiókát pusztított el.`) },
      { id: 'evac', label: 'Fiasítás mentése', note: 'A dajkák a magasabb kamrákba viszik a fiókákat.', mods: [['flood', 0.75], ['nurse', 1.8]], judge: (sim, d) => d.lost === 0 ? ok('Egy fióka sem veszett el.') : bad(`${d.lost} fióka elveszett az elöntésben.`) },
      { id: 'wait', label: 'Nem avatkozunk be', note: 'A dolgozók maguk döntenek.', mods: [], judge: (sim, d) => d.floods + d.collapses + d.lost === 0 ? ok('Szerencséd volt: nem történt kár.', 3) : bad(`Kár: ${d.floods} elöntött kamra, ${d.collapses} beomlás, ${d.lost} fióka.`) },
    ],
  },
  crowd: {
    title: 'Szűk a fészek', icon: '🏠', weight: 2.6, def: 'wait', dur: 1.6,
    when: (sim) => { if (!soilNest(sim)) return false; const c = capacity(sim), mg = sim.colony.mg; const full = c.brood.cap > 0 && c.brood.used >= c.brood.cap * 0.8; const waste = mg.day0 ? mg.cnt.wasted - mg.day0.wasted >= 4 : false;
      return c.chambers + c.building < c.maxChambers && (full || waste); },
    text: (sim) => { const c = capacity(sim); const waste = sim.colony.mg.day0 && sim.colony.mg.cnt.wasted - sim.colony.mg.day0.wasted >= 4; return waste ? 'A raktár megtelt: a hazahordott táplálék egy része kárba vész.' : `A fiasításkamrák megteltek (${c.brood.used}/${c.brood.cap}). Új kamra kell, különben lassul a szaporodás.`; },
    opts: [
      { id: 'brood', label: 'Új fiasításkamra', note: 'Az ásók új kamrát készítenek a fiókáknak.', mods: [['dig', 1.5]], apply: (sim, ev) => digOrder(sim, ev, 'brood'), judge: (sim, d, ev) => jobDone(sim, ev) ? ok('Az új fiasításkamra elkészült.') : meh('Az ásás még tart – a dolgozók folytatják.', 3) },
      { id: 'store', label: 'Új raktárkamra', note: 'Több hely a táplálékkészletnek.', mods: [['dig', 1.5]], apply: (sim, ev) => digOrder(sim, ev, 'store'), judge: (sim, d, ev) => jobDone(sim, ev) ? ok('Az új raktárkamra elkészült.') : meh('Az ásás még tart – a dolgozók folytatják.', 3) },
      { id: 'wait', label: 'Nem avatkozunk be', note: 'Később is kérhetsz kamrát az ⛏ eszközzel.', mods: [], judge: (sim, d) => d.wasted > 0 || d.lost > 0 ? bad('A zsúfoltság kárt okozott: táplálék veszett kárba vagy fiókák pusztultak el.') : meh('Egyelőre kibírtátok.', 1) },
    ],
  },
  hunger: {
    title: 'Éheznek a lárvák', icon: '🐛', weight: 3, def: 'wait',
    when: (sim) => hungryLarvae(sim).length >= 3 && sim.needs.protein > 0.45,
    text: (sim) => `${hungryLarvae(sim).length} lárva éhezik, a fehérjekészlet kevés. Ha nem kapnak enni, elpusztulnak.`,
    opts: [
      { id: 'nurse', label: 'Dajkák mozgósítása', note: 'Több dajka oszt szét a meglévő készletből.', mods: [['nurse', 2.1]], judge: (sim, d) => d.lost === 0 ? ok('Minden lárvát sikerült megetetni.') : bad(`${d.lost} fióka elpusztult az éhségben.`) },
      { id: 'hunt', label: 'Hajtóvadászat', note: 'Sokan mennek zsákmányért – kockázatosabb a felszínen.', mods: [['hunt', 1.9], ['forage', 1.6], ['guard', 0.7]], judge: (sim, d) => d.died > 1 ? bad(`A vadászat ${d.died} hangyába került.`) : d.incTotal >= 4 ? ok('A vadászat bőséges zsákmányt hozott.') : meh('Kevés zsákmány jött be.', 2) },
      { id: 'cull', label: 'Gyenge lárvák feláldozása', note: 'A leggyengébbek elvesznek, a többi etetést kap.', mods: [['nurse', 1.3]], apply: (sim, ev) => cull(sim, ev), judge: (sim, d, ev) => d.lost - (ev.data.culled || 0) <= 0 ? ok('Az áldozat megmentette a többi lárvát.', 3) : bad('Az áldozat ellenére további fiókák vesztek el.') },
      { id: 'wait', label: 'Nem avatkozunk be', note: 'A dolgozók maguk döntenek.', mods: [], judge: (sim, d) => d.lost === 0 ? ok('A kolónia magától megoldotta.', 3) : bad(`${d.lost} fióka éhen halt.`) },
    ],
  },
  windfall: {
    title: 'Bőséges zsákmány a közelben', icon: '🎁', weight: 2, def: 'wait',
    when: (sim) => { const sp = SPECIES[sim.speciesId]; return (sp.hunt.live || sp.hunt.eggs || (sp.diet && sp.diet.seeds)) && sim.surfaceDanger < 0.35 && sim.env.rain < 0.2 && sim.env.temp > 9 && workers(sim).length >= 8; },
    text: (sim) => SPECIES[sim.speciesId].diet && SPECIES[sim.speciesId].diet.seeds ? 'A felderítők friss magtermést találtak a fészek közelében.' : 'A felderítők közeli kövek alatt zsákmányállatok telepét találták.',
    opts: [
      { id: 'mob', label: 'Toborzás', note: 'Minden kéz a gyűjtésre – a dajkálás háttérbe szorul.', mods: [['hunt', 1.9], ['forage', 1.9], ['nurse', 0.75]], apply: (sim) => windfall(sim, 6), judge: (sim, d) => d.died > 0 ? bad(`A toborzás ${d.died} hangyába került.`) : d.incTotal >= 8 ? ok('A toborzás gazdag zsákmányt hozott.', 5) : meh('A zsákmány egy része kimaradt.', 3) },
      { id: 'steady', label: 'Óvatos begyűjtés', note: 'Mérsékelt gyűjtés, a biztonságra is ügyelve.', mods: [['hunt', 1.3], ['forage', 1.3], ['caution', 1.3]], apply: (sim) => windfall(sim, 4), judge: (sim, d) => d.died > 0 ? bad(`${d.died} hangya elpusztult.`) : d.incTotal >= 5 ? ok('Szépen gyarapodtak a készletek.') : meh('Kevés jött be.', 2) },
      { id: 'wait', label: 'Nem avatkozunk be', note: 'A dolgozók maguk döntenek.', mods: [], apply: (sim) => windfall(sim, 2), judge: (sim, d) => d.incTotal >= 4 ? ok('A dolgozók maguktól is hasznosították.', 3) : meh('Kevés hasznot hozott.', 1) },
    ],
  },
};
const jobDone = (sim, ev) => { const j = sim.nest && sim.nest.jobs.find((q) => q.id === ev.data.job); return !!j && !j.active; };
function cull(sim, ev) {
  const hl = hungryLarvae(sim).sort((a, b) => a.fed - b.fed), n = Math.max(1, Math.ceil(hl.length * 0.3));
  hl.slice(0, n).forEach((b) => { b.dead = true; b.cull = true; }); for (const b of hl.slice(n)) b.fed = Math.min(1, b.fed + 0.3); ev.data.culled = n;
}
// a közelben új zsákmány jelenik meg (kövek alatt ászkák / sivatagban magok)
function windfall(sim, n) {
  const w = sim.world, rng = sim.rng, b = baseOf(sim); if (!b) return;
  if (SPECIES[sim.speciesId].diet && SPECIES[sim.speciesId].diet.seeds) { for (let i = 0; i < n * 2; i++) { const a = rng.range(0, 6.28), r = rng.range(12, 38); seedAt(w, null, rng, b.x + Math.cos(a) * r, b.z + Math.sin(a) * r); } sim.preyScarcity = 0; return; }
  const cov = w.covers.slice().sort((p, q) => dist(p.x, p.z, b.x, b.z) - dist(q.x, q.z, b.x, b.z)).slice(0, n);
  for (const c of cov) { const p = makeIsopod(sim, rng.chance(0.6) ? 'small' : 'medium', c.x + rng.range(-0.3, 0.3) * c.r, c.z + rng.range(-0.3, 0.3) * c.r, true); p.cover = c.id; p.tmr = rng.range(2, 12); sim.isopods.push(p); }
  sim.preyScarcity = 0;
}

// ---- az események menete
function chooseOption(sim, optId, auto) {
  const mg = ensureMgmt(sim), ev = mg.ev; if (!ev || ev.phase !== 'ask') return false;
  const def = EVENTS[ev.id], opt = def.opts.find((q) => q.id === optId); if (!opt) return false;
  for (const [k, mul] of opt.mods) mg.mods.push({ k, mul, until: sim.t + (def.dur || 1) * DAY, ev: ev.id });
  ev.data = ev.data || {}; if (opt.apply) opt.apply(sim, ev);
  ev.phase = 'run'; ev.opt = optId; ev.auto = !!auto; ev.snap = snap(sim); ev.resolveAt = sim.t + (def.dur || 1) * DAY;
  return true;
}
export function chooseEvent(sim, optId) { return chooseOption(sim, optId, false); }
function resolveEvent(sim) {
  const mg = sim.colony.mg, ev = mg.ev, def = EVENTS[ev.id], opt = def.opts.find((q) => q.id === ev.opt);
  const d = diff(ev.snap, snap(sim)), r = opt.judge(sim, d, ev);
  const entry = { id: ev.id, day: sim.env.day + 1, title: def.title, icon: def.icon, opt: opt.label, auto: ev.auto, good: r.good, text: r.text };
  mg.log.unshift(entry); if (mg.log.length > 12) mg.log.pop();
  mg.decisions++; if (r.good === true) mg.good++; if (!ev.auto) mg.xp += r.xp;
  mg.seq++; mg.result = { seq: mg.seq, ...entry, xp: ev.auto ? 0 : r.xp };            // a kezelőfelület ebből tudja, hogy új kiértékelés érkezett
  mg.lastEv = ev.id; mg.ev = null;
  mg.nextEv = sim.t + DAY * sim.rng.range(0.8, 1.5) * ({ easy: 1.35, normal: 1, hard: 0.75 }[sim.difficulty] || 1);
  sim.log(`${def.icon} ${def.title}: ${r.text}`, r.good === false ? 'bad' : 'info');
}
function trySpawn(sim) {
  const mg = sim.colony.mg, cand = [];
  for (const id in EVENTS) { if (id === mg.lastEv) continue; const d = EVENTS[id]; if (d.when(sim)) cand.push(id); }
  if (!cand.length) { mg.nextEv = sim.t + DAY * 0.2; return; }
  let tot = 0; for (const id of cand) tot += EVENTS[id].weight;
  let r = sim.rng.next() * tot, pick = cand[0]; for (const id of cand) { r -= EVENTS[id].weight; if (r <= 0) { pick = id; break; } }
  const def = EVENTS[pick];
  mg.ev = { id: pick, phase: 'ask', t0: sim.t, deadline: sim.t + DAY * 0.7, text: def.text(sim), data: {}, opt: null };
  mg.seq++; mg.asked = mg.seq;
}

// ---- napi jelentés
function composeTips(sim, d, labor, cap) {
  const nd = sim.needs, tips = [], sp = SPECIES[sim.speciesId];
  const canHunt = !!(sp.hunt.live || sp.hunt.eggs || sp.hunt.scavenge), canForage = sp.nest.type === 'tree' || !!(sp.diet && sp.diet.seeds);   // fajfüggő tanács: csak olyat javasolunk, amit a faj megtehet
  const add = (icon, text) => { if (tips.length < 3) tips.push({ icon, text }); };
  if (d.died >= 3) add('⚠', `Sok a veszteség (${d.died} hangya): növeld az őrség (🛡) vagy az óvatosság (⚠) szintjét.`);
  if (nd.water > 0.6) add('💧', 'Kevés a víz – emeld a vízkeresés prioritását.');
  if (nd.nurse > 0.5) add('🐛', 'Éheznek a lárvák – több dajkára és több táplálékra van szükség.');
  if (nd.protein > 0.6 && (canHunt || canForage)) add('🎯', canHunt ? `Kevés a fehérje: erősítsd a vadászatot${canForage ? ' (vagy a gyűjtést)' : ''}.` : 'Kevés a fehérje: erősítsd a gyűjtést.');
  if (nd.sugar > 0.6 && canForage) add('🍯', 'Kevés a cukor / mag: erősítsd a gyűjtést.');
  if (d.wasted > 3) add('📦', 'A raktár megtelt, a táplálék egy része kárba veszett – áss raktárkamrát (⛏).');
  if (cap.brood.cap > 0 && cap.brood.used >= cap.brood.cap * 0.85 && cap.chambers + cap.building < cap.maxChambers) add('🏠', 'Szűk a fiasításkamra – áss újat (⛏), különben lassul a szaporodás.');
  if (labor.total >= 8 && labor.groups.rest / labor.total > 0.5) add('💤', 'Sok a tétlen dolgozó – emeld a gyűjtés vagy az ásás prioritását.');
  if (!tips.length) add('✔', 'Minden rendben – a kolónia egyensúlyban van. Jó pillanat a terjeszkedésre (⛏).');
  return tips;
}
function onDay(sim) {
  const mg = ensureMgmt(sim); if (!sim.nest) return;
  const now = snap(sim), prev = mg.day0 || now, d = diff(prev, now), labor = laborCensus(sim), cap = capacity(sim);
  const cnt = (s) => sim.brood.filter((b) => b.stage === s).length;
  const soldiers = sim.ants.filter((a) => !a.dead && a.caste === 'soldier').length;
  const rep = { day: sim.env.day, workers: labor.total, soldiers, brood: { egg: cnt('egg'), larva: cnt('larva'), pupa: cnt('pupa') }, born: d.born, died: d.died, lost: d.lost, kills: d.kills, inc: d.inc, incTotal: d.incTotal, wasted: d.wasted,
    store: { ...sim.colony.store }, tips: composeTips(sim, d, labor, cap), decisions: mg.log.filter((q) => q.day >= sim.env.day).length };
  mg.reports.unshift(rep); if (mg.reports.length > 10) mg.reports.pop(); mg.unread = true; mg.day0 = now;
}
export function ackReport(sim) { const mg = sim.colony.mg; if (mg) mg.unread = false; }

// ---- fő lépés (másodpercenként egyszer hívja a sim.step)
export function stepManage(sim, dt) {
  const mg = ensureMgmt(sim); if (!sim.nest) return;
  if (!mg.day0) mg.day0 = snap(sim);
  if (mg.mods.length) mg.mods = mg.mods.filter((m) => m.until > sim.t);
  mg.sampT -= dt;
  if (mg.sampT <= 0) {
    mg.sampT = DAY / 6; const s = sim.colony.store;
    mg.samples.push({ t: Math.round(sim.t), prey: +s.prey.toFixed(1), sugar: +s.sugar.toFixed(1), water: +s.water.toFixed(1), seed: +(s.seed || 0).toFixed(1), w: workers(sim).length, b: sim.brood.length });
    if (mg.samples.length > 48) mg.samples.shift();
  }
  const ev = mg.ev;
  if (ev) {
    if (ev.phase === 'ask' && sim.t >= ev.deadline) chooseOption(sim, EVENTS[ev.id].def, true);
    else if (ev.phase === 'run' && sim.t >= ev.resolveAt) resolveEvent(sim);
    return;
  }
  if (sim.over || workers(sim).length < MIN_WORKERS || sim.t < DAY * 2) return;
  if (mg.nextEv < 0) { mg.nextEv = sim.t + DAY * sim.rng.range(0.4, 0.9); return; }
  if (sim.t >= mg.nextEv) trySpawn(sim);
}
export function onNewDay(sim) { onDay(sim); }

// ---- nézetmodell a kezelőfelületnek
export function trendOf(samples, key) {
  if (samples.length < 2) return 0; const cur = samples[samples.length - 1][key], ref = samples[Math.max(0, samples.length - 7)][key], d = cur - ref;
  return Math.abs(d) < 0.5 ? 0 : d > 0 ? 1 : -1;
}
export function eventView(sim) {
  const mg = sim.colony.mg; if (!mg || !mg.ev) return null; const ev = mg.ev, def = EVENTS[ev.id];
  const fx = (o) => o.mods.map(([k, m]) => `${KEY_NAME[k]} ×${String(m).replace('.', ',')}`).join(' · ');
  return { id: ev.id, title: def.title, icon: def.icon, text: ev.text, phase: ev.phase, chosen: ev.opt, auto: ev.auto, def: def.def,
    left: ev.phase === 'ask' ? Math.max(0, ev.deadline - sim.t) : Math.max(0, ev.resolveAt - sim.t), total: ev.phase === 'ask' ? DAY * 0.7 : (def.dur || 1) * DAY, days: def.dur || 1,
    opts: def.opts.map((o) => ({ id: o.id, label: o.label, note: o.note, fx: fx(o) })) };
}
export function activeMods(sim) {
  const mg = sim.colony.mg; if (!mg) return [];
  return mg.mods.filter((m) => m.until > sim.t).map((m) => ({ k: m.k, name: KEY_NAME[m.k] || m.k, mul: m.mul, left: m.until - sim.t, ev: m.ev }));
}
