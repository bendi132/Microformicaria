// Animált 3D főmenü: talajmetszet járatokkal, lassan sétáló hangyával; és a fajok forgótányérja.
import * as THREE from 'three';
import { loadCreatureGeometry, CreatureBatch } from './rig.js';
import { soilTextures, softDot } from './textures.js';
import { fbm, clamp, smooth } from '../core/util.js';
import { SPECIES } from '../sim/config.js';

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
    // modellek
    const names = ['ponera', 'cephalotes', 'odonto', 'proceratium', 'isopod', 'spider', 'springtail']; const kinds = { isopod: 1, spider: 2, springtail: 3 }; const tint = { ponera: 0x8b4a2b, cephalotes: 0x1b1814, odonto: 0xffffff, proceratium: 0xe0701c, isopod: 0x7a746c, spider: 0xffffff, springtail: 0xffffff };
    this.B = {}; for (const n2 of names) { const m = await loadCreatureGeometry(`assets/models/${n2}.glb`); const b = new CreatureBatch(m, { kind: kinds[n2] || 0, capacity: 3, color: tint[n2], swing: SPECIES[n2] && SPECIES[n2].gait ? SPECIES[n2].gait.swing : 0.55 }); b.mesh.frustumCulled = false; sc.add(b.mesh); this.B[n2] = b; }
    // forgótányér
    this.stage = new THREE.Group(); const disc = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 3, 48), new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughness: 1, color: 0xb09a80 })); disc.position.y = -1.5; this.stage.add(disc); this.stage.position.set(0, 0, 30); this.stage.rotation.x = -0.0; sc.add(this.stage); this.stage.visible = false;
    this.path = PATHS[0].concat(PATHS[0].slice(0, -1).reverse()); this.pathLens = []; let L = 0; for (let i = 0; i < this.path.length - 1; i++) { const d = Math.hypot(this.path[i + 1][0] - this.path[i][0], this.path[i + 1][1] - this.path[i][1]); this.pathLens.push(d); L += d; } this.pathL = L;
    this.loaded = true;
  }
  setMode(mode, sel) { this.mode = mode; this.sel = sel; this.stage.visible = mode === 'stage'; }
  pathAt(s) { s = ((s % this.pathL) + this.pathL) % this.pathL; let i = 0; while (s > this.pathLens[i]) { s -= this.pathLens[i]; i++; } const a = this.path[i], b = this.path[i + 1], t = s / this.pathLens[i]; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dx: b[0] - a[0], dy: b[1] - a[1] }; }
  render(dt) {
    if (!this.loaded) return; this.t += dt; const t = this.t; const sc = this.scene;
    const c = this.renderer || this.r; const w = c.domElement.clientWidth, h = c.domElement.clientHeight; this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    for (const k in this.B) this.B[k].begin();
    // séta a járatban
    const walk = (batch, s, speed, size, flip, phk = 0.9) => { const P = this.pathAt(s); const f = [P.dx * (flip ? -1 : 1), P.dy * (flip ? -1 : 1), 0]; batch.addBasis(new THREE.Vector3(P.x, P.y, -8.4 + Math.sin(s * 0.8) * 0.0), f, [0, 0, 1], size, [s * phk, 1, 0, 0], [Math.sin(t * 0.7) * 0.15, 0, 0, 0.3], undefined); };
    walk(this.B.ponera, t * 4.2 + 20, 4, 9, false, Math.PI / (SPECIES.ponera.gait.stride * 9));   // a lábfázis a megtett úthoz kötött: nincs csúszás
    if (this.mode === 'stage' && this.sel && this.B[this.sel]) {
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
}
