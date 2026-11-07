// Kezdő (Könnyű) nehézség: kész, kis kolónia a játék elején – királynő, 5 dolgozó, peték, lárvák, bábok,
// és a fajnak megfelelő fészek (talajban kiásott járatrendszer kamrákkal, illetve a fa üregének helyiségei).
import { SPECIES, DAY } from './config.js';
import { addNode, addEdge, node, updateClimate } from './nest.js';
import { heightAt } from './world.js';
import { makeAnt, makeBrood } from './entities.js';
import { placeInNode } from './motion.js';
import { autoSite } from './tasks.js';

export const STARTER_WORKERS = 5;

// ---- talajfészek: bejárat → akna → elágazások → 4 kamra (két fiasítás-, egy raktár-, egy pihenő/királynő-kamra), hurokkal
function buildSoilNest(sim, site) {
  const sp = SPECIES[sim.speciesId], w = sim.world, rng = sim.rng;
  const nest = sim.createNest({ kind: 'soil', x: site.x, z: site.z });
  const R = sp.nest.chamberR, W = sp.nest.tunnelW, step = Math.max(2.4, W * 1.4);
  const ang = rng.range(0, Math.PI * 2), d = [Math.cos(ang), Math.sin(ang)], p = [-d[1], d[0]];
  const P = (u, v, depth) => {
    const x = site.x + d[0] * u + p[0] * v, z = site.z + d[1] * u + p[1] * v;
    return { x, z, y: heightAt(w, x, z) - Math.max(1.5, depth) };
  };
  const tun = (pt) => addNode(nest, { x: pt.x, y: pt.y, z: pt.z, r: W * 0.5, kind: 'tunnel' });
  const chamber = (u, v, depth, role, k = 1) => {
    const pt = P(u * R, v * R, depth * R + 1.5);
    const r = R * k;
    const nd = addNode(nest, { x: pt.x, y: pt.y, z: pt.z, r, kind: 'chamber', role, ready: true });
    nd.hum = 0.6; nd.temp = sim.env.tempMean; return nd;
  };
  // folyosó két csomópont között: közbenső csomópontok kb. egy "ásási lépésnyi" távolságra, enyhe kanyarral
  const link = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz), n = Math.max(1, Math.round(L / step));
    let prev = a;
    for (let i = 1; i < n; i++) {
      const t = i / n, wob = Math.sin(t * Math.PI) * rng.range(-0.18, 0.18) * step;
      const x = a.x + dx * t + p[0] * wob, z = a.z + dz * t + p[1] * wob; const y = Math.min(a.y + dy * t, heightAt(w, x, z) - 1.5);
      const m = tun({ x, y, z }); addEdge(nest, prev.id, m.id, W); prev = m;
    }
    addEdge(nest, prev.id, b.id, W); return b;
  };
  const E = node(nest, nest.entranceId);
  const J1 = tun(P(0.7 * R, 0, 0.6 * R + 1.5)), J2 = tun(P(1.3 * R, 0.1 * R, 1.4 * R + 1.5)), J3 = tun(P(2.4 * R, 0.1 * R, 2.6 * R + 1.5));
  link(E, J1); link(J1, J2); link(J2, J3);
  const C1 = chamber(1.2, 2.0, 2.0, 'brood', 1.0);     // fiasításkamra (peték, lárvák)
  const C2 = chamber(1.0, -2.1, 1.7, 'store', 0.95);   // élelemraktár
  const C3 = chamber(3.4, 0.2, 3.8, 'rest', 1.05);     // a királynő és a pihenők kamrája
  const C4 = chamber(3.4, 2.8, 3.2, 'brood', 0.9);     // bábkamra
  link(J2, C1); link(J1, C2); link(J3, C3); link(C1, C4); link(C4, C3);
  return { E, C1, C2, C3, C4, brood: [C1, C4], store: C2, rest: C3 };
}

// ---- faüreg (Cephalotes): minden helyiség kész és használható
function buildTreeNest(sim, site) {
  const nest = sim.createNest({ kind: 'cavity', cavityId: site.cavityId });
  for (const nd of nest.nodes) if (nd.kind !== 'entrance') nd.ready = true;
  const ch = nest.nodes.filter((q) => q.kind === 'chamber');
  const C1 = ch[0], C2 = ch[1] || ch[0], C3 = ch[2] || ch[ch.length - 1];
  C1.role = 'brood'; if (C2 !== C1) C2.role = 'store'; if (C3 !== C1 && C3 !== C2) C3.role = 'brood';
  for (const nd of ch) { nd.hum = 0.5; nd.temp = sim.env.tempMean; }
  return { E: nest.nodes[0], C1, C2, C3, C4: C3, brood: C3 !== C1 && C3 !== C2 ? [C1, C3] : [C1], store: C2, rest: C1 };
}

export function seedStarterColony(sim) {
  const sp = SPECIES[sim.speciesId], rng = sim.rng, c = sim.colony;
  const q = sim.ants.find((a) => a.caste === 'queen'); if (!q || sim.nest) return false;
  const site = autoSite(sim, q); sim.nestSite = site;
  const L = sp.nest.type === 'tree' ? buildTreeNest(sim, site) : buildSoilNest(sim, site);
  const nest = sim.nest;

  // a kamrák klímája egyensúlyba kerül (ne a kezdeti pillanatnyi érték rontsa a fiasítást)
  for (let i = 0; i < 6; i++) updateClimate(nest, sim.world, sim.env, 2000, sp);

  // királynő
  q.loc = 'nest'; q.node = L.rest.id; q.path = null; placeInNode(sim, q); q.task = 'idle'; q.decide = 0; q.energy = 85; q.hyd = 78;

  // dolgozók: fiasításgondozó, raktáros, pihenő, őr – a fajnak megfelelő kasztokkal
  const spots = [L.brood[0], L.brood[0], L.store, L.rest, nest.nodes[1] || L.brood[0]];
  const plug = sp.defend.escape === 'plug';
  for (let i = 0; i < STARTER_WORKERS; i++) {
    const nd = spots[i % spots.length];
    const caste = plug && i === 0 ? 'soldier' : 'worker';
    const a = makeAnt(sim, caste, nd.x, nd.z); a.loc = 'nest'; a.node = nd.id; a.energy = rng.range(66, 86); a.hyd = rng.range(66, 84); a.age = rng.range(3, 9);
    placeInNode(sim, a); a.task = 'idle'; a.decide = rng.range(0, 2.5); sim.ants.push(a);
  }

  // fiasítás: peték, lárvák, bábok különböző fejlődési állapotban
  const spread = (b, nd) => { const r = nd.r * 0.55, ang = rng.range(0, 6.283), m = Math.sqrt(rng.next()); b.ox = Math.cos(ang) * r * m; b.oz = Math.sin(ang) * r * m; };
  const addBrood = (stage, nd, prog, fed) => { const b = makeBrood(sim, stage, nd.id); b.prog = prog; if (fed !== undefined) b.fed = fed; spread(b, nd); sim.brood.push(b); };
  const nursery = L.brood[0], pupal = L.brood[1] || L.brood[0];
  for (let i = 0; i < 4; i++) addBrood('egg', nursery, rng.range(0.1, 0.85));
  for (let i = 0; i < 4; i++) addBrood('larva', nursery, rng.range(0.1, 0.8), rng.range(0.55, 0.9));
  for (let i = 0; i < 3; i++) addBrood('pupa', pupal, rng.range(0.15, 0.75));

  c.store = sp.diet && sp.diet.seeds ? { prey: 6, sugar: 0, water: 8, seed: 34 } : { prey: 44, sugar: sp.nest.type === 'tree' ? 22 : 14, water: 30, seed: 0 };
  c.eggsLaid = 4 + 4 + 3; c.lastLay = sim.t - sp.brood.layEvery * DAY * 0.35;
  sim.nestDirty = true;
  sim.log('Kész kis kolónia: királynő, ' + STARTER_WORKERS + ' dolgozó, fiasítás és kamrák.', 'info');
  return true;
}
