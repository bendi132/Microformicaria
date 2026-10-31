// A fészek: csomópontok (bejárat, járatok, kamrák) és élek (járatok) gráfja + ásási feladatok.
// Talajfészek: a hangyák ássák; faüreg (Cephalotes): előre adott helyiségek, amelyeket csak ki kell tisztítani.
import { clamp, dist3 } from '../core/util.js';
import { heightAt, moistureAt, limbPoint } from './world.js';
import { SPECIES } from './config.js';

export function createNest(world, speciesId, site) {
  const sp = SPECIES[speciesId];
  const n = { speciesId, nodes: [], edges: [], jobs: [], nextId: 1, nextJob: 1, entranceId: 0, site, plug: { active: false, by: null, hp: 0 }, floodUntil: 0 };
  if (sp.nest.type === 'soil') {
    const gy = heightAt(world, site.x, site.z);
    const e = addNode(n, { x: site.x, y: gy, z: site.z, r: sp.nest.entranceW * 0.5, kind: 'entrance' });
    n.entranceId = e.id;
  } else {
    const cav = world.cavities[site.cavityId];
    const p = limbPoint(world, cav.limb, cav.s, cav.th, {});
    const e = addNode(n, { x: p.x, y: p.y, z: p.z, r: cav.entrance * 0.5, kind: 'entrance', limb: cav.limb, s: cav.s, th: cav.th, nx: p.nx, ny: p.ny, nz: p.nz });
    n.entranceId = e.id;
    // az üreg helyiségei a fa belsejében (előre adottak; "ready" = kitakarítva)
    let prev = e;
    for (let i = 0; i < cav.rooms; i++) {
      const depth = 3.5 + i * 3.4, lat = (i % 2 ? 1 : -1) * (i > 0 ? 2.2 : 0);
      const cx = p.x - p.nx * depth + p.dx * (i * 2.5) , cy = p.y - p.ny * depth + p.dy * (i * 2.5), cz = p.z - p.nz * depth + p.dz * (i * 2.5);
      const node = addNode(n, { x: cx + lat * 0.2, y: cy, z: cz, r: i === 0 ? 2.2 : sp.nest.chamberR * (0.7 + 0.1 * (i % 3)), kind: i === 0 ? 'tunnel' : 'chamber', ready: i < 2, hidden: true });
      addEdge(n, prev.id, node.id, sp.nest.tunnelW);
      prev = node;
    }
    // az első kamra azonnal használható
    const first = n.nodes[2]; if (first) { first.ready = true; first.role = 'brood'; }
    n.nodes[1].ready = true;
  }
  return n;
}
export function addNode(n, o) {
  const node = Object.assign({ id: n.nextId++, r: 1.2, kind: 'tunnel', role: null, hum: 0.5, temp: 20, ready: true, flood: 0, cap: 0 }, o);
  if (node.kind === 'chamber') node.cap = Math.max(1, Math.floor(node.r * node.r * 0.9));
  n.nodes.push(node); return node;
}
export function addEdge(n, a, b, w) { n.edges.push({ a, b, w, collapsed: false, stability: 1 }); }
export const node = (n, id) => n.nodes.find((q) => q.id === id);
export const nodeDepth = (nd) => -Math.min(0, nd.y);

export function neighbors(n, id) {
  const out = [];
  for (const e of n.edges) { if (e.a === id) out.push({ id: e.b, e }); else if (e.b === id) out.push({ id: e.a, e }); }
  return out;
}
// legrövidebb út (BFS, a beomlott élek zárva; a kész csomópontok használhatók)
export function findPath(n, from, to, avoidCollapsed = true) {
  if (from === to) return [from];
  const prev = new Map([[from, -1]]); const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const { id, e } of neighbors(n, c)) {
      if (prev.has(id)) continue; if (avoidCollapsed && e.collapsed) continue;
      const nd = node(n, id); if (!nd || nd.ready === false) continue;
      prev.set(id, c); if (id === to) { const path = [to]; let k = to; while (prev.get(k) !== -1) { k = prev.get(k); path.unshift(k); } return path; }
      q.push(id);
    }
  }
  return null;
}
export function nearestNode(n, p, filter) {
  let best = null, bd = 1e9;
  for (const nd of n.nodes) { if (nd.ready === false) continue; if (filter && !filter(nd)) continue; const d = dist3(nd, p); if (d < bd) { bd = d; best = nd; } }
  return best;
}
export function chambers(n, role) { return n.nodes.filter((q) => q.kind === 'chamber' && q.ready !== false && (!role || q.role === role)); }

// ---- ásás
// Egy ásási feladat egy kamra létrehozása a célpontnál (vagy meglévő tágítása), a járat lépésenként épül fel.
export function addDigJob(n, sp, world, fromId, target, role) {
  if (sp.nest.type !== 'soil') return null;
  const from = node(n, fromId); if (!from) return null;
  const maxCh = sp.nest.maxChambers;
  if (n.nodes.filter((q) => q.kind === 'chamber').length + n.jobs.filter((j) => j.kind === 'chamber').length >= maxCh) return { error: 'Elérted a kamrák maximális számát ennél a fajnál.' };
  const ty = clamp(target.y, -22, -2.5);
  const job = { id: n.nextJob++, kind: 'chamber', role: role || 'brood', from: fromId, tx: target.x, ty, tz: target.z, progress: 0, cur: fromId, active: true };
  n.jobs.push(job); return job;
}
export function jobFace(n, job) {
  // az ásás frontja: a lánc utolsó (még kész) csomópontja
  return node(n, job.cur);
}
// Egy dolgozó 'amount' mennyiségű munkát végez; visszaadja, hogy változott-e a geometria.
export function digWork(n, sp, world, job, amount) {
  const face = node(n, job.cur); if (!face) { job.active = false; return false; }
  const dx = job.tx - face.x, dy = job.ty - face.y, dz = job.tz - face.z; const d = Math.hypot(dx, dy, dz);
  const step = 2.4; job.progress += amount;
  const need = step * 1.6;                      // egy járatlépés ennyi munka
  if (d > step * 1.3) {
    if (job.progress >= need) {
      job.progress = 0;
      const k = step / d;
      let nx = face.x + dx * k, ny = face.y + dy * k, nz = face.z + dz * k;
      ny = Math.min(ny, heightAt(world, nx, nz) - 1.5);
      const nd = addNode(n, { x: nx, y: ny, z: nz, r: sp.nest.tunnelW * 0.5, kind: 'tunnel' });
      addEdge(n, face.id, nd.id, sp.nest.tunnelW); job.cur = nd.id; return true;
    }
    return false;
  }
  // kamra kitágítása
  if (face.kind !== 'chamber') { face.kind = 'chamber'; face.r = Math.max(face.r, 1.4); face.role = job.role; face.cap = 1; face.building = true; }
  const target = sp.nest.chamberR;
  face.r += amount * 0.06; face.cap = Math.max(1, Math.floor(face.r * face.r * 0.9));
  if (face.r >= target) { face.r = target; face.building = false; job.active = false; face.ready = true; return true; }
  return true;
}

// ---- kamrák klímája
export function updateClimate(n, world, env, dt, sp) {
  const tauHum = 45, tauT = 70;
  for (const nd of n.nodes) {
    if (nd.kind === 'entrance') { nd.hum = moistureAt(world, nd.x, nd.z); nd.temp = env.temp; continue; }
    let tHum, tT;
    if (sp.nest.type === 'tree') {
      const cav = world.cavities[n.site.cavityId];
      tHum = clamp(cav.moist * 0.8 + env.rain * 0.3 + (env.humidity - 0.5) * 0.25 - Math.max(0, env.temp - 28) * 0.012, 0.05, 1);
      tT = env.temp * 0.7 + env.tempMean * 0.3;                           // fa: mérsékelten pufferol
    } else {
      const depth = nodeDepth(nd), surf = moistureAt(world, nd.x, nd.z);
      tHum = clamp(0.22 + 0.55 * clamp(depth / 16, 0, 1) + (surf - 0.3) * 0.55 + env.rain * 0.25 - (n.floodUntil > env.t && depth > 9 ? -0.3 : 0), 0.05, 1);
      const k = Math.exp(-depth / 9);
      tT = env.tempMean + (env.temp - env.tempMean) * k;
    }
    // áztatott (elöntött) csomópont
    if (nd.flood > 0) tHum = 1;
    nd.hum += (tHum - nd.hum) * Math.min(1, dt / tauHum);
    nd.temp += (tT - nd.temp) * Math.min(1, dt / tauT);
    if (nd.flood > 0) nd.flood = Math.max(0, nd.flood - dt * 0.004);
  }
}
