// Élőlények megjelenítése (hangyák, ászkák, ugróvillások, pókok, tojások, fiasítás) és a fészek metszete.
import * as THREE from 'three';
import { loadCreatureGeometry, CreatureBatch } from './rig.js';
import { MiteLayer } from './mites.js';
import { mergeGeometries } from '../../vendor/three/addons/BufferGeometryUtils.js';
import { soilTextures, rottenWoodTextures } from './textures.js';
import { heightAt } from '../sim/world.js';
import { node } from '../sim/nest.js';
import { SPECIES, DAY } from '../sim/config.js';

const tmpV = new THREE.Vector3();
const ROLE_COL = { brood: 0xd9b25c, store: 0x7fa65a, rest: 0x7d8fa8, null: 0x8a6a48 };


// ---- fiasítás-geometriák (hossz = 1 az X tengelyen, talp y=0)
// találat utáni reakció a préda számára: 0,6 mp alatt megrándul és összegömbölyödik (act 7, progresszió 0..1, görbület)
const flinchOf = (sim, p) => { const age = sim.t - (p.hitAt ?? -99); return age >= 0 && age < 0.6 ? { t: age / 0.6, curl: Math.sin((age / 0.6) * Math.PI) * 0.9 } : null; };

export function blob(rx, ry, rz, x, y, z, rotZ = 0) { const g = new THREE.SphereGeometry(1, 12, 9); g.scale(rx, ry, rz); if (rotZ) g.rotateZ(rotZ); g.translate(x, y, z); return g; }
export function larvaGeometry() {      // C alakban görbült, szelvényezett pajor: kis fej, hízó potroh
  const prof = [0.10, 0.15, 0.19, 0.22, 0.24, 0.245, 0.235, 0.21, 0.18, 0.13, 0.08]; const gs = []; const n = prof.length, R = 0.62, a0 = 0.95;
  for (let i = 0; i < n; i++) { const a = -a0 + (2 * a0 * i) / (n - 1); const x = Math.sin(a) * R, y = (Math.cos(a) - Math.cos(a0)) * R; gs.push(blob(prof[i] * 0.78, prof[i] * 0.7, prof[i] * 0.72, -x, y + prof[i] * 0.55, 0, 0)); }
  const g = mergeGeometries(gs); g.computeBoundingBox(); const bb = g.boundingBox, L = bb.max.x - bb.min.x; g.translate(-(bb.max.x + bb.min.x) / 2, 0, 0); g.scale(1 / L, 1 / L, 1 / L); return g;
}
export function pupaGeometry() {       // szabad (nem gubós) báb: fej, torkörnyék, potroh, összehajtott lábak és csápok
  const gs = [blob(0.13, 0.12, 0.12, 0.40, 0.17, 0), blob(0.17, 0.15, 0.14, 0.14, 0.18, 0), blob(0.30, 0.19, 0.18, -0.24, 0.19, 0), blob(0.045, 0.045, 0.045, 0.49, 0.2, 0.05), blob(0.045, 0.045, 0.045, 0.49, 0.2, -0.05)];
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) { const l = new THREE.CapsuleGeometry(0.018, 0.17, 3, 6); l.rotateZ(Math.PI / 2 + (k - 1) * 0.35); l.translate(0.2 - k * 0.07, 0.08, s * 0.125); gs.push(l); }
  for (const s of [1, -1]) { const an = new THREE.CapsuleGeometry(0.012, 0.15, 3, 5); an.rotateZ(Math.PI / 2 - 0.5); an.translate(0.4, 0.09, s * 0.08); gs.push(an); }
  const g = mergeGeometries(gs); g.computeBoundingBox(); const bb = g.boundingBox, L = bb.max.x - bb.min.x; g.translate(-(bb.max.x + bb.min.x) / 2, 0, 0); g.scale(1 / L, 1 / L, 1 / L); return g;
}

export class CreatureLayer {
  constructor(scene) { this.scene = scene; this.group = new THREE.Group(); scene.add(this.group); this.nestSig = ''; this._dc = new THREE.Color(); this._dc2 = new THREE.Color(); this.nestGroup = new THREE.Group(); this.group.add(this.nestGroup); this.loaded = false; }
  async load(speciesId) {
    const sp = SPECIES[speciesId]; this.sp = sp;
    const desert = sp.climate === 'desert'; this.desert = desert; const names = [sp.model, sp.queenModel || sp.model, sp.soldierModel || sp.model, desert ? 'eleodes' : 'isopod', 'spider', 'springtail', 'scorpion', 'mealworm', 'aphid']; const uniq = {}; await Promise.all([...new Set(names)].map(async (n) => { uniq[n] = await loadCreatureGeometry(`assets/models/${n}.glb`); }));
    const [ant, antQ, antS, iso, spi, spr, sco, mw, aph] = names.map((n) => uniq[n]); const gc = (caste) => (sp.gaitCaste && sp.gaitCaste[caste]) || sp.gait;
    this.antB = new CreatureBatch(ant, { kind: 0, capacity: 400, color: sp.tint, swing: gc('worker').swing });
    this.queenB = new CreatureBatch(antQ, { kind: 0, capacity: 8, color: sp.tint, swing: gc('queen').swing }); this.soldB = new CreatureBatch(antS, { kind: 0, capacity: 120, color: sp.tint, swing: gc('soldier').swing });
    this.isoB = new CreatureBatch(iso, { kind: desert ? 0 : 1, capacity: 160, color: desert ? 0xffffff : 0x7a746c });
    this.scoB = new CreatureBatch(sco, { kind: 4, capacity: 8, color: 0xffffff });
    this.mwB = new CreatureBatch(mw, { kind: 5, capacity: 48, color: 0xf2c47a });       // lisztkukac
    this.aphB = new CreatureBatch(aph, { kind: 5, capacity: 64, color: 0x7cc243 }); this.aphB.mesh.material.color.setHex(0x86c04a); this.aphB.mesh.material.clearcoat = 0.15;       // levéltetű (a lisztkukac-animáció: lábak, csáp, enyhe test-mozgás)
    this.spiB = new CreatureBatch(spi, { kind: 2, capacity: 24, color: 0xffffff });
    this.sprB = new CreatureBatch(spr, { kind: 3, capacity: 320, color: 0x8d949c });
    for (const b of [this.antB, this.queenB, this.soldB, this.isoB, this.spiB, this.scoB, this.sprB, this.mwB, this.aphB]) this.group.add(b.mesh);
    // magvak (Messor táplálék): valódi, fotóból rekonstruált mag-modell, egyetlen példányolt rajz
    const seedG = await loadCreatureGeometry('assets/models/seed.glb');
    this.seedMesh = new THREE.InstancedMesh(seedG.geometry, new THREE.MeshStandardMaterial({ color: 0xd9b56e, roughness: 0.55, metalness: 0 }), 420); this.seedMesh.count = 0; this.seedMesh.castShadow = true; this.seedMesh.frustumCulled = false; this.group.add(this.seedMesh);
    // tojások / fiasítás / hordott tárgyak: egyszerű példányolt alakzatok
    const cap = new THREE.CapsuleGeometry(0.5, 1, 4, 10); cap.rotateZ(Math.PI / 2);
    this.eggMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.35, color: 0xffffff }), 900); this.eggMesh.count = 0; this.eggMesh.castShadow = true; this.group.add(this.eggMesh);
    const bmat = (r, em) => new THREE.MeshStandardMaterial({ roughness: r, color: 0xffffff, emissive: em, emissiveIntensity: 0.6 });
    this.nEgg = new THREE.InstancedMesh(blob(0.5, 0.26, 0.26, 0, 0.26, 0), bmat(0.3, 0x7a7466), 500); this.nLarva = new THREE.InstancedMesh(larvaGeometry(), bmat(0.5, 0x6f6755), 500); this.nPupa = new THREE.InstancedMesh(pupaGeometry(), bmat(0.55, 0x6a5a40), 500);
    this.miteLayer = new MiteLayer(this.group);
    this.broodMeshes = [this.nEgg, this.nLarva, this.nPupa]; for (const m of this.broodMeshes) { m.count = 0; m.frustumCulled = false; this.group.add(m); }
    const soil = soilTextures(256); this.nestTex = soil.map; this.nestNrm = soil.normalMap; this.nestNrm.wrapS = this.nestNrm.wrapT = THREE.RepeatWrapping; this.nestNrm.repeat.set(1, 1); this.woodTex = rottenWoodTextures(256).map; for (const t of [this.nestTex, this.woodTex]) if (t) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    this.silk = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0xf2f0e6 }), 24); this.silk.count = 0; this.silk.castShadow = true; this.group.add(this.silk);
    this.carryMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.4, color: 0xffffff }), 300); this.carryMesh.count = 0; this.carryMesh.castShadow = true; this.group.add(this.carryMesh);
    this.crumbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1, color: 0xffffff, emissive: 0x2a1a0c, emissiveIntensity: 0.5 }), 240); this.crumbs.count = 0; this.crumbs.frustumCulled = false; this.group.add(this.crumbs);
    this.headLight = new THREE.PointLight(0xffd9a0, 0, 40, 1.6); this.group.add(this.headLight);
    this.nestMats = {}; this.loaded = true; this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.S = new THREE.Vector3(); this.C = new THREE.Color();
  }
  // kiszívott tetem: 0 = friss, 1 = üres, száraz héj
  dryOf(p) { return p.food > 0 ? Math.min(1, Math.max(0, 1 - p.foodLeft / p.food)) : 0; }
  deadColor(p) { const d = this.dryOf(p); return this._dc.setHex(0x4c4741).lerp(this._dc2.setHex(0x8a7d68), d).getHex(); }
  groundUp(w, x, z, out) {
    const hx = heightAt(w, x + 0.7, z) - heightAt(w, x - 0.7, z), hz = heightAt(w, x, z + 0.7) - heightAt(w, x, z - 0.7);
    const l = Math.hypot(hx / 1.4, 1, hz / 1.4); out[0] = -hx / 1.4 / l; out[1] = 1 / l; out[2] = -hz / 1.4 / l; return out;
  }
  inst(mesh, i, x, y, z, sx, sy, sz, color, yaw = 0) {
    this.Q.setFromAxisAngle(this.up, yaw); this.M.compose(tmpV.set(x, y, z), this.Q, this.S.set(sx, sy, sz)); mesh.setMatrixAt(i, this.M); if (color !== undefined) mesh.setColorAt(i, this.C.set(color));
  }
  // Egy hangya orientációja és helye (a hely a láb alatti pont)
  antFrame(sim, a, fwd, up) {
    if (a.loc === 'ground') { up[0] = a.up[0]; up[1] = a.up[1]; up[2] = a.up[2]; fwd[0] = Math.sin(a.yaw); fwd[1] = 0; fwd[2] = Math.cos(a.yaw); }
    else if (a.loc === 'limb') { up[0] = a.up[0]; up[1] = a.up[1]; up[2] = a.up[2]; const f = a.fw && Math.hypot(...a.fw) > 0.01 ? a.fw : [0, 1, 0]; fwd[0] = f[0]; fwd[1] = f[1]; fwd[2] = f[2]; }
    else { const p = a.pitch || 0; fwd[0] = Math.sin(a.yaw) * Math.cos(p); fwd[1] = -Math.sin(p); fwd[2] = Math.cos(a.yaw) * Math.cos(p); up[0] = 0; up[1] = 1; up[2] = 0; }
  }
  update(sim, time, nestView, camPos, controlled) {
    if (!this.loaded) return; const w = sim.world; this.up = this.up || new THREE.Vector3(0, 1, 0);
    const fwd = [0, 0, 1], up = [0, 1, 0], pos = tmpV; this.fpvAnt = controlled || null;
    const { antB, queenB, soldB, isoB, spiB, scoB, sprB, mwB, aphB } = this; aphB.begin(); antB.begin(); queenB.begin(); soldB.begin(); isoB.begin(); spiB.begin(); scoB.begin(); sprB.begin(); mwB.begin();
    let carryN = 0; const cm = this.carryMesh;
    const pushCarry = (x, y, z, r, color, flat) => { if (carryN >= 300) return; this.inst(cm, carryN, x, y, z, r, r * (flat || 1), r, color); carryN++; };
    // ---- magvak a talajon
    { const sm = this.seedMesh; let sc = 0; if (sm) for (const f of w.foods) { if (f.kind !== 'seed' || sc >= 420 || f.amount < 0.05) continue; const s = 3.4 * (0.8 + 0.2 * Math.min(1, f.amount / 1.6)); this.inst(sm, sc++, f.x, heightAt(w, f.x, f.z) + 0.05, f.z, s, s, s, undefined, f.yaw); } if (sm) { sm.count = sc; sm.instanceMatrix.needsUpdate = true; } }
    // ---- hangyák
    for (const a of sim.ants) {
      if (a.dead) continue; if (a.loc === 'nest' && !nestView && !(controlled && controlled.id === a.id)) continue;
      if (controlled && controlled.id === a.id) continue;
      this.antFrame(sim, a, fwd, up); const an = a.anim; pos.set(a.x, a.y, a.z);
      const scale = a.len * (a.caste === 'queen' ? 1 : 1);
      (a.caste === 'queen' ? queenB : a.caste === 'soldier' ? soldB : antB).addBasis(pos, fwd, up, scale, [an.phase, an.mv, an.act, an.actT], [an.head, an.open, an.curl, Math.max(an.alert, a.task === 'flee' ? 1 : 0)], a.caste === 'queen' && !this.sp.queenModel ? 0xd8d0c8 : undefined);
      if (a.carry) {
        const k = a.carry.kind; const hx = a.x + fwd[0] * a.len * 0.52 + up[0] * a.len * 0.2, hy = a.y + fwd[1] * a.len * 0.52 + up[1] * a.len * 0.2 + (a.loc === 'nest' ? 0 : 0), hz = a.z + fwd[2] * a.len * 0.52 + up[2] * a.len * 0.2;
        if (k === 'eggs') { pushCarry(hx, hy + a.len * 0.05, hz, Math.max(0.35, a.len * 0.11), a.carry.owner === 'spider' ? 0xf3efe0 : a.carry.owner === 'isopod' ? 0xe9dcc0 : 0xf5f2d8); }
        else if (k === 'prey') pushCarry(hx, hy + a.len * 0.06, hz, Math.max(0.5, Math.sqrt(a.carry.amt || 1) * 0.5), 0x5b3a2a);
        else if (k === 'seed') pushCarry(hx, hy + a.len * 0.02, hz, Math.max(0.9, a.len * 0.17), 0xc9a45a, 0.55);
        else if (k === 'sugar') pushCarry(hx, hy + a.len * 0.05, hz, Math.max(0.4, Math.sqrt(a.carry.amt || 1) * 0.35), 0xe8a523, 0.8);
        else if (k === 'water') pushCarry(hx, hy + a.len * 0.05, hz, Math.max(0.4, Math.sqrt(a.carry.amt || 1) * 0.4), 0xbfe0ff, 0.8);
        else if (k === 'soil') pushCarry(hx, hy + a.len * 0.05, hz, a.len * 0.14, 0x7a5c40);
        else if (k === 'brood') pushCarry(hx, hy + a.len * 0.05, hz, a.len * 0.1, 0xf4efe0);
      }
    }
    antB.end(time); queenB.end(time); soldB.end(time);
    // ---- fúrás közben szálló földmorzsák (a fúró hangya feje előtt indul, hátrafelé hullik)
    { let cn = 0; const cr = this.crumbs; const surfDig = sim.ants.some((q) => !q.dead && q.loc === 'ground' && q.task === 'manual' && q.anim.act === 3); cr.visible = !!nestView || !!(controlled && controlled.loc === 'nest') || surfDig;
      if (cr.visible) for (const a of sim.ants) {
        if (a.dead || !((a.loc === 'nest' && a.task === 'dig' && a.st === 'work') || (a.loc === 'ground' && a.task === 'manual' && a.anim.act === 3))) continue; const sx = Math.sin(a.yaw), sz = Math.cos(a.yaw);
        for (let i = 0; i < 6 && cn < 240; i++) { const ph = (time * 1.7 + i / 6 + a.id * 0.37) % 1, s = 0.12 + 0.1 * ((i * 7 + a.id) % 5) / 5, d = a.len * (0.5 + ph * 0.9), lat = (((i * 13 + a.id) % 7) - 3) * a.len * 0.05 * ph, h = a.len * (0.1 + 4 * ph * (1 - ph) * 0.55);
          this.inst(cr, cn, a.x - sx * (d - a.len) * 0 + sx * a.len * 0.45 - sx * d * 0.0 - sx * (ph * a.len * 1.2) + sz * lat, a.y + a.len * 0.2 + h, a.z + sz * a.len * 0.45 - sz * (ph * a.len * 1.2) - sx * lat, s, s, s, i % 2 ? 0x8a6a48 : 0x6e5438); cn++; }
      }
      cr.count = cn; cr.instanceMatrix.needsUpdate = true; if (cr.instanceColor) cr.instanceColor.needsUpdate = true; }
    // ---- ászkák
    for (const p of sim.isopods) {
      if (p.state === 'hidden' && !p.dead) continue; const y = heightAt(w, p.x, p.z); this.groundUp(w, p.x, p.z, up);
      fwd[0] = Math.sin(p.yaw); fwd[1] = 0; fwd[2] = Math.cos(p.yaw); const an = p.anim, fl = flinchOf(sim, p);
      if (p.dead) { up[0] = -up[0]; up[1] = -up[1]; up[2] = -up[2]; fwd[0] = Math.sin(p.yaw); }
      const B = p.sp === 'mealworm' ? mwB : isoB;
      B.addBasis(pos.set(p.x, y + (p.dead ? p.len * B.height * 0.95 : 0), p.z), fwd, up, p.len, [an.phase, p.dead ? 0 : an.mv, p.dead ? 9 : fl ? 7 : an.act, fl ? fl.t : an.actT], [an.head, an.open, fl ? fl.curl : an.curl, p.dead ? this.dryOf(p) : an.alert], p.dead ? (p.sp === 'mealworm' ? this._dc.setHex(0xe8d6b0).lerp(this._dc2.setHex(0x9c8a64), this.dryOf(p)).getHex() : this.deadColor(p)) : undefined);
    }
    isoB.end(time); mwB.end(time);
    // ---- levéltetvek a gazdanövényeken (idle: finom láb- és csáp-mozgás; telt gaszter = mézharmat)
    if (w.aphids) for (const ap of w.aphids) {
      const y = heightAt(w, ap.x, ap.z) + ap.hy; fwd[0] = Math.sin(ap.yaw); fwd[1] = 0.25; fwd[2] = Math.cos(ap.yaw); up[0] = 0; up[1] = 1; up[2] = 0;
      aphB.addBasis(pos.set(ap.x, y, ap.z), fwd, up, 3.6, [time * 1.3 + ap.id * 1.7, 0.1 + 0.05 * Math.sin(time * 0.7 + ap.id), 0, 0], [0, 0, 0, 0]);
    }
    for (const a of sim.ants) if (!a.dead && a.carry && a.carry.kind === 'aphid' && (a.loc !== 'nest' || nestView) && !(controlled && controlled.id === a.id)) {
      this.antFrame(sim, a, fwd, up); aphB.addBasis(pos.set(a.x + fwd[0] * a.len * 0.62 + up[0] * a.len * 0.12, a.y + fwd[1] * a.len * 0.62 + up[1] * a.len * 0.12, a.z + fwd[2] * a.len * 0.62 + up[2] * a.len * 0.12), fwd, up, 2.6, [time * 3, 0.3, 0, 0], [0, 0, 0, 0]);
    }
    aphB.end(time);
    // ---- ugróvillások
    for (const p of sim.springtails) {
      const y = heightAt(w, p.x, p.z) + (p.leap || 0); this.groundUp(w, p.x, p.z, up); fwd[0] = Math.sin(p.yaw); fwd[1] = p.leap > 0.6 ? 0.35 : 0; fwd[2] = Math.cos(p.yaw); const an = p.anim;
      if (p.dead) { up[0] = -up[0]; up[1] = -up[1]; up[2] = -up[2]; }
      const fl = flinchOf(sim, p);
      sprB.addBasis(pos.set(p.x, y + (p.dead ? p.len * sprB.height * 0.95 : 0), p.z), fwd, up, p.len, [an.phase, p.dead ? 0 : an.mv, p.dead ? 9 : fl ? 7 : an.act, fl ? fl.t : an.actT], [an.head, an.open, fl ? fl.curl : an.curl, p.dead ? this.dryOf(p) : an.alert], p.dead ? this.deadColor(p) : undefined);
    }
    sprB.end(time);
    // ---- pókok
    for (const s of sim.spiders) {
      if (s.state === 'lair' && !s.dead) continue; const y = heightAt(w, s.x, s.z); this.groundUp(w, s.x, s.z, up); fwd[0] = Math.sin(s.yaw); fwd[1] = 0; fwd[2] = Math.cos(s.yaw); const an = s.anim;
      if (s.dead) { up[0] = -up[0]; up[1] = -up[1]; up[2] = -up[2]; }
      const B = s.cls === 'scorpion' ? scoB : spiB;
      B.addBasis(pos.set(s.x, y + (s.dead ? s.len * B.height * 0.95 : 0), s.z), fwd, up, s.len, [an.phase, s.dead ? 0 : an.mv, s.dead ? 9 : an.act, an.actT], [an.head, an.open, an.curl, s.dead ? this.dryOf(s) : an.alert + (s.state === 'stalk' ? 0.3 : 0) + (s.state === 'lunge' ? 0.7 : 0)], s.dead ? this.deadColor(s) : undefined);
      if (s.carry) pushCarry(s.x + fwd[0] * s.len * 0.45, y + s.len * 0.15, s.z + fwd[2] * s.len * 0.45, Math.max(0.6, s.len * 0.1), 0x5c4a3a);
    }
    spiB.end(time); scoB.end(time);
    // ---- tojáscsomók és pókzsák
    let en = 0, sn = 0; const eg = this.eggMesh;
    for (const c of sim.clutches) {
      if (c.dead || c.n <= 0) continue; const y = heightAt(w, c.x, c.z);
      if (c.owner === 'spider') { if (sn < 24) { const r = 1.2 + Math.sqrt(c.n) * 0.18; this.S.set(r, r * 0.8, r); this.Q.identity(); this.M.compose(tmpV.set(c.x, y + r * 0.55, c.z), this.Q, this.S); this.silk.setMatrixAt(sn++, this.M); } continue; }
      const r = c.owner === 'isopod' ? 0.42 : 0.24; const k = Math.min(c.n, 24); const col = c.owner === 'isopod' ? 0xe6d8b8 : 0xfaf7e0;
      for (let i = 0; i < k && en < 900; i++) { const ang = i * 2.399, d = Math.sqrt(i + 0.5) * r * 1.5; this.inst(eg, en, c.x + Math.cos(ang) * d, y + r * 0.7, c.z + Math.sin(ang) * d, r, r, r, col); en++; }
    }
    eg.count = en; eg.instanceMatrix.needsUpdate = true; if (eg.instanceColor) eg.instanceColor.needsUpdate = true; this.silk.count = sn; this.silk.instanceMatrix.needsUpdate = true;
    cm.count = carryN; cm.instanceMatrix.needsUpdate = true; if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    // ---- fiasítás (fészekmetszet): tojás, pajor, báb külön, valódi alakú modellel
    const showB = nestView || !!(controlled && controlled.loc === 'nest'); const cnt = [0, 0, 0]; const mHost = []; const [mE, mL, mP] = this.broodMeshes; for (const m of this.broodMeshes) m.visible = showB;
    if (showB && sim.nest) for (const b of sim.brood) {
      if (b.carried) continue; const nd = node(sim.nest, b.node); if (!nd) continue;
      const rr = Math.max(0.6, nd.r), kz = nd.kind === 'chamber' ? 0.55 : 0.95; const x = nd.x + b.ox * Math.max(0, rr - 1.4) * 0.72, z = nd.z + b.oz * Math.max(0, rr - 1.4) * 0.72; const dd = Math.min(0.98, Math.hypot(x - nd.x, z - nd.z) / rr), y = nd.y - rr * kz * Math.sqrt(1 - dd * dd) + 0.04; const wob = Math.sin(time * 1.6 + b.ox * 40);   // y: a kamra aljának tényleges magassága ott, ahol a fiasítás fekszik const wob = Math.sin(time * 1.6 + b.ox * 40) ;
      const wsz = this.sp.size.worker || 4; let mesh, k, sc, col;
      if (b.stage === 'egg') { mesh = mE; k = 0; sc = 0.62; col = 0xf6f2e4; }
      else if (b.stage === 'larva') { mesh = mL; k = 1; sc = (1.1 + b.prog * 1.7) * (1 + wob * 0.025); col = b.fed < 0.3 ? 0xc9c3b3 : 0xf1e8cf; }
      else { mesh = mP; k = 2; sc = wsz * 0.85; col = b.prog > 0.8 ? 0xb08a58 : b.prog > 0.45 ? 0xd9c49a : 0xefe6cf; }
      if (k < 2 && mHost.length < 40) mHost.push({ x, y: y + sc * 0.35, z, r: sc * 0.55, i: mHost.length });
      if (cnt[k] >= 500) continue; this.Q.setFromAxisAngle(this.up, b.ox * 9 + b.oz * 3); this.M.compose(tmpV.set(x, y, z), this.Q, this.S.set(sc, sc * (k === 1 ? 1 + wob * 0.03 : 1), sc)); mesh.setMatrixAt(cnt[k], this.M); mesh.setColorAt(cnt[k], this.C.set(col)); cnt[k]++;
    }
    { // atkák az eseményben (a fiasításon mászkálnak); az „Alapos tisztogatás” / áthelyezés alatt fogyatkoznak
      const mg = sim.colony.mg, ev = mg && mg.ev; let list = null;
      if (showB && ev && ev.id === 'mites' && mHost.length) {
        let n = Math.min(12, Math.max(4, Math.round(mHost.length * 0.5))); if (ev.phase === 'run') { const left = Math.max(0, ev.resolveAt - sim.t) / (DAY * 1.2); n = Math.max(0, Math.round(n * (ev.opt === 'clean' ? left : ev.opt === 'move' ? 0.35 + 0.65 * left : 1))); }
        list = []; for (let i = 0; i < n; i++) { const h = mHost[(i * 7) % mHost.length], a = time * 0.35 + i * 2.1, q = h.r * (0.6 + 0.4 * Math.sin(time * 0.5 + i)); list.push({ x: h.x + Math.cos(a) * q, y: h.y, z: h.z + Math.sin(a) * q, yaw: -a - Math.PI / 2 }); }
      }
      this.miteLayer.update(time, list);
    }
    this.broodMeshes.forEach((m, i) => { m.count = cnt[i]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    // fejlámpa: a föld alatti első személyű nézetben
    if (controlled && controlled.loc === 'nest') { this.headLight.intensity = 450; this.headLight.position.set(controlled.x, controlled.y + controlled.len * 0.9, controlled.z); } else this.headLight.intensity = 0;
    this.updateNest(sim, nestView || (controlled && controlled.loc === 'nest'));
  }
  // ---- fészek: járatok és kamrák (metszet). Egyetlen, zárt, simított hálóban: félcső-járatok + félellipszoid-kamrák,
  // a pereme felé sötétedő csúcsszínnel (olcsó környezeti takarás), hogy tiszta, hibátlan, "hangyafarm" jellegű kép legyen.
  updateNest(sim, visible) {
    const n = sim.nest; this.nestGroup.visible = !!(visible && n); if (!n) return;
    let sig = n.nodes.length + '/' + n.edges.length; for (const nd of n.nodes) sig += (nd.kind === 'chamber' ? Math.round(nd.r * 4) : '') + (nd.role || '') + (nd.ready === false ? 'x' : '') + (nd.flood > 0 ? 'f' : '') + (nd.mold > 0.08 ? 'm' + Math.round(nd.mold * 6) : '');
    for (const e of n.edges) if (e.collapsed) sig += 'c';
    if (sig === this.nestSig) return; this.nestSig = sig;
    while (this.nestGroup.children.length) { const o = this.nestGroup.children.pop(); o.geometry && o.geometry.dispose(); }
    const wood = n.site.kind === 'cavity'; const P = [], C = [], UV = [], IDX = [];
    const vn = (x, y, z) => Math.sin(x * 1.9 + Math.sin(y * 2.3 + z * 1.1)) * 0.5 + Math.sin(y * 2.7 + Math.sin(z * 1.7 + x * 2.1)) * 0.3 + Math.sin(z * 2.1 + x * 1.3 + y * 0.7) * 0.2;   // -1..1
    const MOLD = new THREE.Color(0x6f8f5c), MOLD2 = new THREE.Color(0xa9b59a);       // penész: zöldes-szürke, szőrös foltok
    const floorCol = (nd) => { const c = new THREE.Color(nd.flood > 0 ? 0x6aa0d0 : wood ? (nd.kind === 'chamber' ? 0xc9a070 : 0xb08a58) : (ROLE_COL[nd.role] ?? (nd.kind === 'chamber' ? ROLE_COL.null : 0x9a7a54))); if (nd.mold > 0.08) c.lerp(MOLD, Math.min(0.8, nd.mold * 1.05)).lerp(MOLD2, Math.max(0, nd.mold - 0.5) * 0.5); return c; };
    const rimCol = new THREE.Color(wood ? 0x3a2412 : 0x2b1c10); const tmpC = new THREE.Color();
    const push = (x, y, z, k, base) => { P.push(x, y, z); UV.push(x * 0.5, z * 0.5); tmpC.copy(rimCol).lerp(base, Math.min(1, Math.max(0, k))); const sp = 0.78 + 0.22 * (0.5 + 0.5 * vn(x * 2.6, y * 1.7, z * 2.6)) + 0.1 * Math.sin(x * 9 + z * 7 + y * 5); tmpC.multiplyScalar(sp * 0.92); C.push(tmpC.r, tmpC.g, tmpC.b); return P.length / 3 - 1; };
    const grid = (rows, cols, vtx, wrap) => { const b = P.length / 3; for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) vtx(i, j); for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1 + (wrap ? 1 : 0); j++) { const j2 = (j + 1) % cols; const a0 = b + i * cols + j, a1 = b + i * cols + j2, a2 = b + (i + 1) * cols + j, a3 = b + (i + 1) * cols + j2; IDX.push(a0, a2, a1, a1, a2, a3); } };
    // kamra / csomópont: alsó fél ellipszoid, szabálytalan peremmel (a sima, kétszomszédos járatcsomópontokat a cső fedi, azokat kihagyjuk)
    const deg = new Map(); for (const e of n.edges) { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
    const tunnelCol = floorCol({ kind: 'tunnel' });
    for (const nd of n.nodes) {
      if (nd.ready === false && nd.kind !== 'chamber') continue; if (nd.kind !== 'chamber' && (deg.get(nd.id) || 0) === 2) continue; const chamber = nd.kind === 'chamber'; const r = Math.max(0.7, nd.r), ky = chamber ? 0.55 : 0.95; const base = nd.kind === 'chamber' ? floorCol(nd) : (nd.flood > 0 ? floorCol(nd) : tunnelCol); const R = 7, S = 28;
      grid(R, S, (i, j) => { const al = (i / (R - 1)) * (Math.PI / 2), be = (j / S) * Math.PI * 2; const wob = 1 + (chamber ? 0.11 : 0.05) * vn(nd.x + Math.cos(be) * 2, nd.id * 1.7, nd.z + Math.sin(be) * 2) + 0.04 * vn(nd.x * 3 + be, al, nd.z);
        const hr = r * Math.cos(al) * wob, dp = -ky * r * Math.sin(al) * (1 + 0.06 * vn(nd.x + be, nd.y, nd.z + al)); push(nd.x + Math.cos(be) * hr, nd.y + dp, nd.z + Math.sin(be) * hr, Math.sin(al) * 1.1 + 0.4, base); }, true);
    }
    // járatok: alsó fél cső (felül nyitott), a csomópontokhoz simulva
    const Yv = new THREE.Vector3(0, 1, 0);
    for (const e of n.edges) {
      const A = node(n, e.a), B = node(n, e.b); if (!A || !B) continue; if (A.ready === false && B.ready === false) continue;
      const d = new THREE.Vector3(B.x - A.x, B.y - A.y, B.z - A.z); const L = d.length(); if (L < 0.01) continue; d.normalize();
      const U = Yv.clone().addScaledVector(d, -d.dot(Yv)); if (U.lengthSq() < 1e-4) U.set(0, 0, 1); U.normalize(); const Sd = new THREE.Vector3().crossVectors(d, U).normalize();
      const rr = Math.max(0.55, e.w * 0.5); const base = e.collapsed ? new THREE.Color(0xa04a34) : tunnelCol; const R = Math.max(2, Math.ceil(L / 0.7)), S = 15;
      grid(R, S, (i, j) => { const t = i / (R - 1), th = (j / (S - 1)) * Math.PI; const cx = A.x + d.x * L * t, cy = A.y + d.y * L * t, cz = A.z + d.z * L * t; const wob = 1 + 0.04 * vn(cx * 0.9, cy * 0.9, cz * 0.9);
        const px = cx + (Math.cos(th) * Sd.x - Math.sin(th) * U.x) * rr * wob, py = cy + (Math.cos(th) * Sd.y - Math.sin(th) * U.y) * rr * wob, pz = cz + (Math.cos(th) * Sd.z - Math.sin(th) * U.z) * rr * wob; push(px, py, pz, Math.sin(th) * 1.0 + 0.45, base); }, false);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(IDX); g.computeVertexNormals();
    if (!this.caveMat) this.caveMat = {}; const key = wood ? 'w' : 's';
    if (!this.caveMat[key]) { const tx = wood ? this.woodTex : this.nestTex; if (tx) tx.repeat.set(1, 1); this.caveMat[key] = new THREE.MeshStandardMaterial({ vertexColors: true, map: tx || null, normalMap: wood ? null : this.nestNrm, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 1, side: THREE.DoubleSide, emissive: 0x5a3a1c, emissiveIntensity: 0.5 }); }
    const mesh = new THREE.Mesh(g, this.caveMat[key]); mesh.frustumCulled = false; this.nestGroup.add(mesh);
    // a környező talajtömb: a járatok közti rész nem üres fekete, hanem metszetben látszó, szemcsés talaj kavicsokkal
    if (this.bed) { this.nestGroup.remove(this.bed); this.bed.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    { let minY = 0, cx = 0, cz = 0; for (const nd of n.nodes) { minY = Math.min(minY, nd.y - Math.max(0.7, nd.r) * 0.95); cx += nd.x; cz += nd.z; } cx /= n.nodes.length; cz /= n.nodes.length; const by = minY - 1.4;
      const bg = new THREE.PlaneGeometry(240, 240, 48, 48); bg.rotateX(-Math.PI / 2); const bp = bg.attributes.position, bc = [], buv = bg.attributes.uv;
      for (let i = 0; i < bp.count; i++) { const x = bp.getX(i) + cx, z = bp.getZ(i) + cz; bp.setXYZ(i, x, by + 0.35 * vn(x * 0.4, 3.1, z * 0.4), z); const d = Math.hypot(x - cx, z - cz); const k = Math.max(0.05, 1 - d / 105) * (0.8 + 0.2 * vn(x * 0.7, 1.2, z * 0.7)); bc.push(0.62 * k, 0.5 * k, 0.4 * k); buv.setXY(i, x * 0.2, z * 0.2); }
      bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3)); bg.computeVertexNormals();
      if (!this.bedMat) { const tx = this.nestTex.clone(); tx.repeat.set(1, 1); tx.needsUpdate = true; const nm = this.nestNrm.clone(); nm.repeat.set(1, 1); nm.needsUpdate = true; this.bedMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tx, normalMap: nm, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 1, emissive: 0x3a2412, emissiveIntensity: 0.3 }); this.pebMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: false, roughness: 0.9, emissive: 0x2a1a0e, emissiveIntensity: 0.5 }); }
      this.bed = new THREE.Group(); const bedMesh = new THREE.Mesh(bg, this.bedMat); bedMesh.frustumCulled = false; this.bed.add(bedMesh);
      const pg = new THREE.IcosahedronGeometry(1, 1), NP = 220, pm = new THREE.InstancedMesh(pg, this.pebMat, NP), M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3(), C3 = new THREE.Color();
      let sd = (n.nodes.length * 7919 + 13) >>> 0; const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
      for (let i = 0; i < NP; i++) { const a = rnd() * 6.283, d = 6 + Math.sqrt(rnd()) * 95, sz = 0.12 + Math.pow(rnd(), 3) * 1.3; P3.set(cx + Math.cos(a) * d, by + sz * 0.25, cz + Math.sin(a) * d); Q4.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)); S3.set(sz, sz * (0.6 + rnd() * 0.35), sz * (0.8 + rnd() * 0.3)); M4.compose(P3, Q4, S3); pm.setMatrixAt(i, M4); const g0 = 0.1 + rnd() * 0.16; C3.setRGB(g0 * 1.1, g0 * 0.95, g0 * 0.8); pm.setColorAt(i, C3); }
      pm.frustumCulled = false; this.bed.add(pm); this.nestGroup.add(this.bed); }
    // a bejárat fénye: innen jön be a "felszín" (iránymutató)
    const en = node(n, n.entranceId); if (en) { const gl = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.9, en.r * 1.5), 24), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); gl.rotation.x = -Math.PI / 2; gl.position.set(en.x, en.y + 0.15, en.z); this.nestGroup.add(gl); }
  }
}
