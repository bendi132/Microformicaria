// Animált 3D főmenü: talajmetszet járatokkal, lassan sétáló hangyával; és a fajok forgótányérja.
import * as THREE from 'three';
import { loadCreatureGeometry, CreatureBatch } from './rig.js';
import { soilTextures, softDot } from './textures.js';
import { fbm, clamp, smooth } from '../core/util.js';
import { SPECIES } from '../sim/config.js';
import { blob, larvaGeometry, pupaGeometry } from './creatures.js';

// járatok (x,y) pontlistái és kamrák (x,y,r)
const PATHS = [
  [[-70, 38], [-52, 30], [-40, 14], [-30, 4], [-14, -4], [4, -10], [22, -22], [38, -30], [52, -26]],
  [[-14, -4], [-8, -22], [-18, -36], [-30, -42]],
  [[22, -22], [34, -8], [50, 2], [66, 12]],
  [[-40, 14], [-56, 0], [-72, -14]],
];
const CHAMBERS = [[-30, -42, 9], [52, -26, 11], [66, 12, 8], [-72, -14, 8], [4, -10, 7]];

export class MenuScene {
  constructor(renderer) {
    this.r = renderer; this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0b0805); this.scene.fog = new THREE.Fog(0x0b0805, 90, 260);
    this.cam = new THREE.PerspectiveCamera(38, 1, 1, 600); this.t = 0; this.mode = 'title'; this.sel = null; this.loaded = false;
  }
  async load() {
    const sc = this.scene; const tex = soilTextures(256); tex.map.repeat.set(5, 3); tex.normalMap.repeat.set(5, 3);
    const W = 230, Hh = 130, nx = 230, ny = 130; const g = new THREE.PlaneGeometry(W, Hh, nx, ny); const p = g.attributes.position; const col = new Float32Array(p.count * 3);
    const dist = (x, y) => { let d = 1e9, kind = 0; for (const P of PATHS) for (let i = 0; i < P.length - 1; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1]; const dx = bx - ax, dy = by - ay; const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1); const dd = Math.hypot(x - ax - dx * t, y - ay - dy * t) - 3.2; if (dd < d) d = dd; } for (const [cx, cy, r] of CHAMBERS) { const dd = Math.hypot((x - cx) / 1.3, y - cy) - r; if (dd < d) d = dd; } return d; };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i); const d = dist(x, y); const wob = (fbm(x * 0.08, y * 0.08, 5) - 0.5) * 1.6; const k = smooth(1.2, -2.2, d + wob);
      p.setZ(i, -9 * k + (fbm(x * 0.25, y * 0.25, 9) - 0.5) * 1.2 * (1 - k)); const sh = 1 - 0.65 * k; col[i * 3] = sh; col[i * 3 + 1] = sh * 0.95; col[i * 3 + 2] = sh * 0.9;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    this.wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(1.6, 1.6), vertexColors: true, roughness: 1 })); sc.add(this.wall);
    // gyökerek és kavicsok a falban
    const rootM = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 1 });
    for (let i = 0; i < 6; i++) { const pts = []; let x = -90 + i * 36 + Math.sin(i) * 10, y = 65; for (let k = 0; k < 8; k++) { pts.push(new THREE.Vector3(x, y, -0.5 + Math.sin(k + i) * 0.3)); x += Math.sin(k * 1.7 + i * 3) * 6; y -= 8 + (i % 3) * 2; } const c = new THREE.CatmullRomCurve3(pts); sc.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.9 - i * 0.05, 6), rootM)); }
    const pg = new THREE.IcosahedronGeometry(1, 1); const pm = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 }); for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(pg, pm); const x = ((i * 53) % 210) - 105, y = ((i * 37) % 120) - 60; if (dist(x, y) < 3) continue; const r = 0.8 + (i % 5) * 0.7; m.scale.set(r, r * 0.8, r * 0.6); m.position.set(x, y, 0.2); m.rotation.set(i, i * 2, 0); sc.add(m); }
    // fények
    sc.add(new THREE.AmbientLight(0x6a5a48, 0.55)); this.glow = new THREE.PointLight(0xffb05a, 5200, 130, 1.6); this.glow.position.set(0, 0, 18); sc.add(this.glow);
    this.rim = new THREE.DirectionalLight(0x8aa0c8, 0.5); this.rim.position.set(-40, 80, 60); sc.add(this.rim);
    // por
    const n = 160, pos = new Float32Array(n * 3); this.dustSeed = []; for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 200; pos[i * 3 + 1] = (Math.random() - 0.5) * 110; pos[i * 3 + 2] = 2 + Math.random() * 40; this.dustSeed.push(Math.random() * 6); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 1.4, map: softDot(), transparent: true, opacity: 0.35, depthWrite: false, color: 0xe0c090 })); sc.add(this.dust);
    // modellek: minden fajhoz a dolgozó (és ahol van, külön királynő / katona) modell
    const names = ['ponera', 'cephalotes', 'odonto', 'proceratium', 'cephalotes_queen', 'cephalotes_soldier', 'isopod', 'spider', 'springtail']; const kinds = { isopod: 1, spider: 2, springtail: 3 };
    const tint = { ponera: 0x8b4a2b, cephalotes: 0x1b1814, cephalotes_soldier: 0x1b1814, cephalotes_queen: 0xffffff, odonto: 0xffffff, proceratium: 0xe0701c, isopod: 0x7a746c, spider: 0xffffff, springtail: 0xffffff };
    const gaitOf = (n) => { if (n === 'cephalotes_queen') return SPECIES.cephalotes.gaitCaste.queen; if (n === 'cephalotes_soldier') return SPECIES.cephalotes.gaitCaste.soldier; return SPECIES[n] && SPECIES[n].gait; };
    this.gait = {}; this.B = {};
    for (const n2 of names) { const m = await loadCreatureGeometry(`assets/models/${n2}.glb`); const g = gaitOf(n2); this.gait[n2] = g || { swing: 0.55, stride: 0.4 }; const b = new CreatureBatch(m, { kind: kinds[n2] || 0, capacity: g ? 48 : 3, color: tint[n2], swing: g ? g.swing : 0.55 }); b.mesh.frustumCulled = false; sc.add(b.mesh); this.B[n2] = b; }
    // fiasítás: tojás, lárva, báb (ugyanazok az alakzatok, mint a játékban)
    this.broodGeo = { egg: blob(0.5, 0.26, 0.26, 0, 0.26, 0), larva: larvaGeometry(), pupa: pupaGeometry() };
    const mkBrood = (parent, cap) => { const set = {}; for (const k of ['egg', 'larva', 'pupa']) { const m = new THREE.InstancedMesh(this.broodGeo[k], new THREE.MeshStandardMaterial({ roughness: k === 'egg' ? 0.3 : 0.55, color: k === 'pupa' ? 0xd9c9a0 : 0xf2ead6, emissive: 0x4a4234, emissiveIntensity: 0.55 }), cap); m.count = 0; m.frustumCulled = false; parent.add(m); set[k] = m; } return set; };
    this.tunBrood = mkBrood(sc, 80); this.stage = new THREE.Group(); this.stageBrood = mkBrood(this.stage, 60);
    // forgótányér
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 3, 48), new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughness: 1, color: 0xb09a80 })); disc.position.y = -1.5; this.stage.add(disc); this.stage.position.set(0, 0, 30); sc.add(this.stage); this.stage.visible = false;
    // járatok: hossz-táblák (oda-vissza járáshoz)
    this.paths = PATHS.map((P) => { const lens = []; let L = 0; for (let i = 0; i < P.length - 1; i++) { const d = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); lens.push(d); L += d; } return { P, lens, L }; });
    this.populateTunnels();
    this.loaded = true;
  }
  setMode(mode, sel) { this.mode = mode; this.sel = sel; this.stage.visible = mode === 'stage'; this.buildStage(mode === 'stage' ? sel : null); }
  // ---- segédek
  pointAt(pi, s) { const { P, lens, L } = this.paths[pi]; s = clamp(s, 0, L); let i = 0; while (i < lens.length - 1 && s > lens[i]) { s -= lens[i]; i++; } const a = P[i], b = P[i + 1], t = lens[i] > 0 ? s / lens[i] : 0; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dx: b[0] - a[0], dy: b[1] - a[1] }; }
  distToPaths(x, y) { let d = 1e9; for (const { P } of this.paths) for (let i = 0; i < P.length - 1; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1]; const dx = bx - ax, dy = by - ay; const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1); d = Math.min(d, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } return d; }
  // egy hangya kirajzolása; a lábfázis a megtett úthoz kötött (nincs csúszás)
  ant(key, pos, fx, fy, fz, up, size, dist, mv, head = 0, alert = 0) {
    const g = this.gait[key]; this.B[key].addBasis(pos, [fx, fy, fz], up, size, [dist * Math.PI / (g.stride * size), mv, 0, 0], [head, 0, 0, alert], undefined);
  }
  fillBrood(set, items, wall) {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0); const n = { egg: 0, larva: 0, pupa: 0 };
    for (const it of items) {
      if (wall) { Q.setFromAxisAngle(Z, it.yaw); Q2.setFromAxisAngle(X, Math.PI / 2); Q.multiply(Q2); } else Q.setFromAxisAngle(Y, it.yaw);
      M.compose(P.set(it.x, it.y, it.z), Q, S.set(it.len, it.len, it.len)); set[it.k].setMatrixAt(n[it.k]++, M);
    }
    for (const k in n) { set[k].count = n[k]; set[k].instanceMatrix.needsUpdate = true; }
  }
  // kolónia elrendezése: kamrák a falban (főmenü)
  populateTunnels() {
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; this.rnd = rnd;
    const sz = SPECIES.ponera.size, W = 9; this.tunW = W; this.tunQ = W * sz.queen / sz.worker;
    const plan = { 0: { egg: 6, larva: 5, pupa: 2 }, 1: { egg: 9, larva: 3, pupa: 0 }, 2: { egg: 0, larva: 2, pupa: 6 }, 3: { egg: 1, larva: 4, pupa: 4 } };
    const flen = { egg: 0.2, larva: 0.46, pupa: 0.5 }; const items = []; this.nurses = [];
    for (const ci in plan) {
      const [cx, cy, R] = CHAMBERS[ci]; const placed = [];
      for (const k of ['pupa', 'larva', 'egg']) for (let n = 0; n < plan[ci][k]; n++) {
        const len = W * flen[k] * (0.9 + rnd() * 0.2);
        for (let tr = 0; tr < 60; tr++) {
          const ang = rnd() * 6.283, rr = Math.sqrt(rnd()) * (R - 2.2), x = cx + Math.cos(ang) * rr * 1.3, y = cy + Math.sin(ang) * rr;
          if (this.distToPaths(x, y) < 3.4 + len * 0.3) continue; if (+ci === 1 && Math.hypot((x - cx) / 1.3, y - cy) < 7.2) continue;
          if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < (q.len + len) * 0.55 + 0.6)) continue;
          const it = { k, x, y, z: -8.75, yaw: rnd() * 6.283, len }; placed.push(it); items.push(it); break;
        }
      }
      // ápolók: két dolgozó áll a fiasítás mellett, feléje fordulva
      let nn = 0; for (const it of placed) { if (it.k === 'egg' || nn >= 2) continue; for (let tr = 0; tr < 12; tr++) { const a = rnd() * 6.283, d = it.len * 0.55 + W * 0.42; const x = it.x + Math.cos(a) * d, y = it.y + Math.sin(a) * d; if (this.distToPaths(x, y) < 3.2 || placed.some((q) => q !== it && Math.hypot(q.x - x, q.y - y) < (q.len + W * 0.4) * 0.5)) continue; if (Math.hypot((x - cx) / 1.3, y - cy) > R - 1.2) continue; this.nurses.push({ x, y, hx: -Math.cos(a), hy: -Math.sin(a), ph: rnd() * 6 }); nn++; break; } }
    }
    this.fillBrood(this.tunBrood, items, true);
    // királynő: a nagy kamrában lassan jár
    this.queenTun = { cx: CHAMBERS[1][0], cy: CHAMBERS[1][1], dist: 0, lx: 0, ly: 0 };
    // járó dolgozók
    this.walkers = []; for (const [pi, n] of [[0, 6], [1, 3], [2, 3], [3, 2]]) for (let i = 0; i < n; i++) this.walkers.push({ pi, s: rnd() * this.paths[pi].L, dir: rnd() < 0.5 ? 1 : -1, v: 3.4 + rnd() * 2.4, size: W * (0.92 + rnd() * 0.16), wait: 0, dist: rnd() * 80, ang: null, lane: 0, carry: i % 3 === 0 });
    this.carryEgg = new THREE.InstancedMesh(this.broodGeo.egg, new THREE.MeshStandardMaterial({ roughness: 0.3, color: 0xf2ead6, emissive: 0x4a4234, emissiveIntensity: 0.55 }), 24); this.carryEgg.count = 0; this.carryEgg.frustumCulled = false; this.scene.add(this.carryEgg);
  }
  // fajválasztó: az egész kolónia a tányéron (királynő, dolgozók, fiasítás; Cephalotesnél katonák is)
  buildStage(sel) {
    this.colony = null; for (const k in this.stageBrood) this.stageBrood[k].count = 0; const sp = sel && SPECIES[sel]; if (!sp || !this.B[sel] || !this.gait[sel]) return;
    let seed = 5 + sel.length * 13; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const W = { ponera: 8.5, cephalotes: 10, odonto: 12, proceratium: 9 }[sel] || 9, sz = sp.size; const qSize = W * sz.queen / sz.worker, sSize = sz.soldier ? W * sz.soldier / sz.worker : 0;
    const col = { sel, W, qSize, sSize, qKey: sp.queenModel || sel, sKey: sp.soldierModel || null, lane: 25.2 - 0.3 * W, workers: [], nurses: [], q: { dist: 0, t0: rnd() * 6 } };
    const rMin = qSize * 0.5 + 3.2, rMax = col.lane - 0.55 * W - 0.5; const flen = { egg: 0.2, larva: 0.46, pupa: 0.5 }; const f = Math.min(1, 9 / W) ** 1.6, want = { egg: Math.round(9 * f), larva: Math.round(6 * f), pupa: Math.round(5 * f) }; const items = [];
    for (const k of ['pupa', 'larva', 'egg']) for (let n = 0; n < want[k]; n++) { const len = W * flen[k] * (0.9 + rnd() * 0.2);
      for (let tr = 0; tr < 80; tr++) { const a = rnd() * 6.283, r = rMin + Math.sqrt(rnd()) * Math.max(0, rMax - rMin); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (items.some((q) => Math.hypot(q.x - x, q.z - z) < (q.len + len) * 0.55 + 0.5)) continue; items.push({ k, x, y: 0.0, z, yaw: rnd() * 6.283, len }); break; } }
    this.fillBrood(this.stageBrood, items, false);
    const nursesFor = items.filter((it) => it.k !== 'egg').slice(0, 2); for (const it of nursesFor) { const a = rnd() * 6.283, d = it.len * 0.55 + W * 0.42; const x = it.x + Math.cos(a) * d, z = it.z + Math.sin(a) * d; if (Math.hypot(x, z) > rMax + 0.2 * W) continue; col.nurses.push({ x, z, hx: -Math.cos(a), hz: -Math.sin(a), ph: rnd() * 6 }); }
    const nSl = sSize ? 8 : 6; for (let i = 0; i < nSl; i++) col.workers.push({ a: (i / nSl) * 6.283, soldier: !!sSize && i % 4 === 2, dist: rnd() * 40 });
    this.colony = col;
  }
  update(dt) {
    const rnd = this.rnd, W = this.tunW;
    for (const w of this.walkers) {
      const P = this.paths[w.pi]; let mv = 1;
      if (w.wait > 0) { w.wait -= dt; mv = 0; } else { w.s += w.dir * w.v * dt; w.dist += w.v * dt; if (w.s >= P.L) { w.s = P.L; w.dir = -1; w.wait = 0.5 + rnd() * 1.3; } else if (w.s <= 0) { w.s = 0; w.dir = 1; w.wait = 0.5 + rnd() * 1.3; } }
      const q = this.pointAt(w.pi, w.s); const tgt = Math.atan2(q.dy * w.dir, q.dx * w.dir); if (w.ang === null) w.ang = tgt; let da = tgt - w.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); w.ang += da * Math.min(1, dt * (mv ? 9 : 4));
      w.lane += (0.8 * w.dir - w.lane) * Math.min(1, dt * 3); const hx = Math.cos(w.ang), hy = Math.sin(w.ang); w.mv = mv; w.x = q.x + hy * w.lane; w.y = q.y - hx * w.lane; w.hx = hx; w.hy = hy;
    }
  }
  render(dt) {
    if (!this.loaded) return; dt = Math.min(dt, 0.1); this.t += dt; const t = this.t; const sc = this.scene; this.update(dt);
    const c = this.renderer || this.r; const w = c.domElement.clientWidth, h = c.domElement.clientHeight; this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    for (const k in this.B) this.B[k].begin();
    const Z = [0, 0, 1], V = new THREE.Vector3(); const zf = -8.4, W = this.tunW;
    // dolgozók a járatokban
    let ne = 0; const EM = new THREE.Matrix4(), EQ = new THREE.Quaternion(), ES = new THREE.Vector3(), EZ = new THREE.Vector3(0, 0, 1);
    for (const k of this.walkers) {
      this.ant('ponera', V.set(k.x, k.y, zf), k.hx, k.hy, 0, Z, k.size, k.dist, k.mv, Math.sin(t * 0.7 + k.s) * 0.15, 0.3);
      if (k.carry && ne < 24) { const el = k.size * 0.26; EQ.setFromAxisAngle(EZ, Math.atan2(k.hy, k.hx)); EM.compose(new THREE.Vector3(k.x + k.hx * k.size * 0.5, k.y + k.hy * k.size * 0.5, zf + k.size * 0.06), EQ, ES.set(el, el, el)); this.carryEgg.setMatrixAt(ne++, EM); }
    }
    this.carryEgg.count = ne; this.carryEgg.instanceMatrix.needsUpdate = true;
    // ápolók: állnak, a fiasítás felé fordulnak, a fejük lassan hajlik
    for (const n of this.nurses) this.ant('ponera', V.set(n.x, n.y, zf), n.hx, n.hy, 0, Z, W * 0.95, 0, 0, Math.sin(t * 0.9 + n.ph) * 0.35, 0.6 + Math.sin(t * 0.5 + n.ph) * 0.4);
    // királynő: a nagy kamrában lassan sétál (fix kis ellipszis)
    { const q = this.queenTun; const ax = q.cx + Math.sin(t * 0.16) * 3.6, ay = q.cy + Math.sin(t * 0.27 + 1) * 2.3; const vx = Math.cos(t * 0.16) * 0.16 * 3.6, vy = Math.cos(t * 0.27 + 1) * 0.27 * 2.3; const sp = Math.hypot(vx, vy); q.dist += sp * dt; this.ant('ponera', V.set(ax, ay, zf), vx, vy, 0, Z, this.tunQ, q.dist, 1, Math.sin(t * 0.5) * 0.2, 0.3); }
    // fajválasztó: a kolónia
    if (this.mode === 'stage' && this.colony) this.stageColony(dt, t);
    else if (this.mode === 'stage' && this.sel && this.B[this.sel]) {
      const b = this.B[this.sel]; const size = { isopod: 26, spider: 30, springtail: 22 }[this.sel] || 24; const a = t * 0.45;
      b.addBasis(new THREE.Vector3(0, 0, 30), [Math.cos(a), 0, -Math.sin(a)], [0, 1, 0], size, [t * 3, 0.0, 0, 0], [Math.sin(t) * 0.2, 0, 0, 0.2], undefined);
    }
    for (const k in this.B) this.B[k].end(t);
    this.glow.position.x = Math.sin(t * 0.21) * 60; this.glow.position.y = Math.cos(t * 0.17) * 25 - 8;
    const dp = this.dust.geometry.attributes.position; for (let i = 0; i < dp.count; i++) { dp.setY(i, dp.getY(i) + Math.sin(t * 0.3 + this.dustSeed[i]) * 0.02); dp.setX(i, dp.getX(i) + Math.cos(t * 0.2 + this.dustSeed[i]) * 0.02); } dp.needsUpdate = true;
    if (this.mode === 'stage') { this.cam.position.set(0, 20 + Math.sin(t * 0.3) * 1.5, 92); this.cam.lookAt(0, 8, 30); this.stage.position.set(0, 0, 30); this.glow.position.z = 42; this.glow.position.x = 20; this.glow.position.y = 40; }
    else { this.cam.position.set(Math.sin(t * 0.12) * 14, Math.cos(t * 0.1) * 5, 120); this.cam.lookAt(Math.sin(t * 0.12) * 4, 0, 0); this.glow.position.z = 18; }
    c.render(sc, this.cam);
  }
  stageColony(dt, t) {
    const col = this.colony, rot = t * 0.1; this.stage.rotation.y = rot; const cr = Math.cos(rot), sr = Math.sin(rot);
    const place = (key, lx, lz, hx, hz, size, dist, mv, head, alert) => { const x = lx * cr + lz * sr, z = -lx * sr + lz * cr, fx = hx * cr + hz * sr, fz = -hx * sr + hz * cr; this.ant(key, new THREE.Vector3(x, 0, 30 + z), fx, 0, fz, [0, 1, 0], size, dist, mv, head, alert); };
    // királynő: középen, lassú kis körökben
    const q = col.q; const qx = Math.sin(t * 0.17 + q.t0) * 2.2, qz = Math.sin(t * 0.26 + 1 + q.t0) * 1.8, vx = Math.cos(t * 0.17 + q.t0) * 0.17 * 2.2, vz = Math.cos(t * 0.26 + 1 + q.t0) * 0.26 * 1.8; q.dist += Math.hypot(vx, vz) * dt;
    place(col.qKey, qx, qz, vx, vz, col.qSize, q.dist, 1, Math.sin(t * 0.5) * 0.2, 0.3);
    // dolgozók (és katonák) a tányér szélén körbejárnak; a lábfázis a megtett úthoz kötött
    const v = col.W * 0.6; const dA = v / col.lane * dt;
    for (const w of col.workers) { w.a += dA; w.dist += v * dt; const a = w.a, lx = Math.cos(a) * col.lane, lz = Math.sin(a) * col.lane, hx = -Math.sin(a), hz = Math.cos(a); if (w.soldier && col.sKey) place(col.sKey, lx, lz, hx, hz, col.sSize, w.dist, 1, Math.sin(t * 0.6 + a) * 0.12, 0.5); else place(col.sel, lx, lz, hx, hz, col.W, w.dist, 1, Math.sin(t * 0.7 + a) * 0.15, 0.3); }
    // ápolók a fiasítás mellett
    for (const n of col.nurses) place(col.sel, n.x, n.z, n.hx, n.hz, col.W * 0.95, 0, 0, Math.sin(t * 0.9 + n.ph) * 0.35, 0.6 + Math.sin(t * 0.5 + n.ph) * 0.4);
  }
}
