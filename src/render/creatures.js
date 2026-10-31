// Élőlények megjelenítése (hangyák, ászkák, ugróvillások, pókok, tojások, fiasítás) és a fészek metszete.
import * as THREE from 'three';
import { loadCreatureGeometry, CreatureBatch } from './rig.js';
import { mergeGeometries } from '../../vendor/three/addons/BufferGeometryUtils.js';
import { soilTextures, rottenWoodTextures } from './textures.js';
import { heightAt } from '../sim/world.js';
import { node } from '../sim/nest.js';
import { SPECIES } from '../sim/config.js';

const tmpV = new THREE.Vector3();
const ROLE_COL = { brood: 0xd9b25c, store: 0x7fa65a, rest: 0x7d8fa8, null: 0x8a6a48 };


// ---- fiasítás-geometriák (hossz = 1 az X tengelyen, talp y=0)
function blob(rx, ry, rz, x, y, z, rotZ = 0) { const g = new THREE.SphereGeometry(1, 12, 9); g.scale(rx, ry, rz); if (rotZ) g.rotateZ(rotZ); g.translate(x, y, z); return g; }
function larvaGeometry() {      // C alakban görbült, szelvényezett pajor: kis fej, hízó potroh
  const prof = [0.10, 0.15, 0.19, 0.22, 0.24, 0.245, 0.235, 0.21, 0.18, 0.13, 0.08]; const gs = []; const n = prof.length, R = 0.62, a0 = 0.95;
  for (let i = 0; i < n; i++) { const a = -a0 + (2 * a0 * i) / (n - 1); const x = Math.sin(a) * R, y = (Math.cos(a) - Math.cos(a0)) * R; gs.push(blob(prof[i] * 0.78, prof[i] * 0.7, prof[i] * 0.72, -x, y + prof[i] * 0.55, 0, 0)); }
  const g = mergeGeometries(gs); g.computeBoundingBox(); const bb = g.boundingBox, L = bb.max.x - bb.min.x; g.translate(-(bb.max.x + bb.min.x) / 2, 0, 0); g.scale(1 / L, 1 / L, 1 / L); return g;
}
function pupaGeometry() {       // szabad (nem gubós) báb: fej, torkörnyék, potroh, összehajtott lábak és csápok
  const gs = [blob(0.13, 0.12, 0.12, 0.40, 0.17, 0), blob(0.17, 0.15, 0.14, 0.14, 0.18, 0), blob(0.30, 0.19, 0.18, -0.24, 0.19, 0), blob(0.045, 0.045, 0.045, 0.49, 0.2, 0.05), blob(0.045, 0.045, 0.045, 0.49, 0.2, -0.05)];
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) { const l = new THREE.CapsuleGeometry(0.018, 0.17, 3, 6); l.rotateZ(Math.PI / 2 + (k - 1) * 0.35); l.translate(0.2 - k * 0.07, 0.08, s * 0.125); gs.push(l); }
  for (const s of [1, -1]) { const an = new THREE.CapsuleGeometry(0.012, 0.15, 3, 5); an.rotateZ(Math.PI / 2 - 0.5); an.translate(0.4, 0.09, s * 0.08); gs.push(an); }
  const g = mergeGeometries(gs); g.computeBoundingBox(); const bb = g.boundingBox, L = bb.max.x - bb.min.x; g.translate(-(bb.max.x + bb.min.x) / 2, 0, 0); g.scale(1 / L, 1 / L, 1 / L); return g;
}

export class CreatureLayer {
  constructor(scene) { this.scene = scene; this.group = new THREE.Group(); scene.add(this.group); this.nestSig = ''; this.nestGroup = new THREE.Group(); this.group.add(this.nestGroup); this.loaded = false; }
  async load(speciesId) {
    const sp = SPECIES[speciesId]; this.sp = sp;
    const [ant, iso, spi, spr] = await Promise.all(['ponera' === sp.model ? sp.model : sp.model, 'isopod', 'spider', 'springtail'].map((n) => loadCreatureGeometry(`assets/models/${n}.glb`)));
    this.antB = new CreatureBatch(ant, { kind: 0, capacity: 400, color: sp.tint, swing: sp.gait.swing });
    this.isoB = new CreatureBatch(iso, { kind: 1, capacity: 160, color: 0x7a746c });
    this.spiB = new CreatureBatch(spi, { kind: 2, capacity: 24, color: 0xffffff });
    this.sprB = new CreatureBatch(spr, { kind: 3, capacity: 320, color: 0x8d949c });
    for (const b of [this.antB, this.isoB, this.spiB, this.sprB]) this.group.add(b.mesh);
    // tojások / fiasítás / hordott tárgyak: egyszerű példányolt alakzatok
    const cap = new THREE.CapsuleGeometry(0.5, 1, 4, 10); cap.rotateZ(Math.PI / 2);
    this.eggMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.35, color: 0xffffff }), 900); this.eggMesh.count = 0; this.eggMesh.castShadow = true; this.group.add(this.eggMesh);
    const bmat = (r, em) => new THREE.MeshStandardMaterial({ roughness: r, color: 0xffffff, emissive: em, emissiveIntensity: 0.6 });
    this.nEgg = new THREE.InstancedMesh(blob(0.5, 0.26, 0.26, 0, 0.26, 0), bmat(0.3, 0x7a7466), 500); this.nLarva = new THREE.InstancedMesh(larvaGeometry(), bmat(0.5, 0x6f6755), 500); this.nPupa = new THREE.InstancedMesh(pupaGeometry(), bmat(0.55, 0x6a5a40), 500);
    this.broodMeshes = [this.nEgg, this.nLarva, this.nPupa]; for (const m of this.broodMeshes) { m.count = 0; m.frustumCulled = false; this.group.add(m); }
    const soil = soilTextures(256); this.nestTex = soil.map; this.woodTex = rottenWoodTextures(256).map; for (const t of [this.nestTex, this.woodTex]) if (t) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    this.silk = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0xf2f0e6 }), 24); this.silk.count = 0; this.silk.castShadow = true; this.group.add(this.silk);
    this.carryMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.4, color: 0xffffff }), 300); this.carryMesh.count = 0; this.carryMesh.castShadow = true; this.group.add(this.carryMesh);
    this.headLight = new THREE.PointLight(0xffd9a0, 0, 40, 1.6); this.group.add(this.headLight);
    this.nestMats = {}; this.loaded = true; this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.S = new THREE.Vector3(); this.C = new THREE.Color();
  }
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
    const { antB, isoB, spiB, sprB } = this; antB.begin(); isoB.begin(); spiB.begin(); sprB.begin();
    let carryN = 0; const cm = this.carryMesh;
    const pushCarry = (x, y, z, r, color, flat) => { if (carryN >= 300) return; this.inst(cm, carryN, x, y, z, r, r * (flat || 1), r, color); carryN++; };
    // ---- hangyák
    for (const a of sim.ants) {
      if (a.dead) continue; if (a.loc === 'nest' && !nestView && !(controlled && controlled.id === a.id)) continue;
      if (controlled && controlled.id === a.id) continue;
      this.antFrame(sim, a, fwd, up); const an = a.anim; pos.set(a.x, a.y, a.z);
      const scale = a.len * (a.caste === 'queen' ? 1 : 1);
      antB.addBasis(pos, fwd, up, scale, [an.phase, an.mv, an.act, an.actT], [an.head, an.open, an.curl + (a.task === 'manual' ? 0 : 0), Math.max(an.alert, a.task === 'flee' ? 1 : 0)], a.caste === 'queen' ? 0xd8d0c8 : undefined);
      if (a.carry) {
        const k = a.carry.kind; const hx = a.x + fwd[0] * a.len * 0.52 + up[0] * a.len * 0.2, hy = a.y + fwd[1] * a.len * 0.52 + up[1] * a.len * 0.2 + (a.loc === 'nest' ? 0 : 0), hz = a.z + fwd[2] * a.len * 0.52 + up[2] * a.len * 0.2;
        if (k === 'eggs') { pushCarry(hx, hy + a.len * 0.05, hz, Math.max(0.35, a.len * 0.11), a.carry.owner === 'spider' ? 0xf3efe0 : a.carry.owner === 'isopod' ? 0xe9dcc0 : 0xf5f2d8); }
        else if (k === 'prey') pushCarry(hx, hy + a.len * 0.06, hz, Math.max(0.5, Math.sqrt(a.carry.amt || 1) * 0.5), 0x5b3a2a);
        else if (k === 'sugar') pushCarry(hx, hy + a.len * 0.05, hz, Math.max(0.4, Math.sqrt(a.carry.amt || 1) * 0.35), 0xe8a523, 0.8);
        else if (k === 'water') pushCarry(hx, hy + a.len * 0.05, hz, Math.max(0.4, Math.sqrt(a.carry.amt || 1) * 0.4), 0xbfe0ff, 0.8);
        else if (k === 'soil') pushCarry(hx, hy + a.len * 0.05, hz, a.len * 0.14, 0x7a5c40);
        else if (k === 'brood') pushCarry(hx, hy + a.len * 0.05, hz, a.len * 0.1, 0xf4efe0);
      }
    }
    antB.end(time);
    // ---- ászkák
    for (const p of sim.isopods) {
      if (p.state === 'hidden' && !p.dead) continue; const y = heightAt(w, p.x, p.z); this.groundUp(w, p.x, p.z, up);
      fwd[0] = Math.sin(p.yaw); fwd[1] = 0; fwd[2] = Math.cos(p.yaw); const an = p.anim;
      if (p.dead) { up[0] = -up[0]; up[1] = -up[1]; up[2] = -up[2]; fwd[0] = Math.sin(p.yaw); }
      isoB.addBasis(pos.set(p.x, y + (p.dead ? p.len * 0.2 : 0), p.z), fwd, up, p.len, [an.phase, p.dead ? 0 : an.mv, an.act, an.actT], [an.head, an.open, an.curl, an.alert], p.dead ? 0x4c4741 : undefined);
    }
    isoB.end(time);
    // ---- ugróvillások
    for (const p of sim.springtails) {
      const y = heightAt(w, p.x, p.z) + (p.leap || 0); this.groundUp(w, p.x, p.z, up); fwd[0] = Math.sin(p.yaw); fwd[1] = p.leap > 0.6 ? 0.35 : 0; fwd[2] = Math.cos(p.yaw); const an = p.anim;
      if (p.dead) { up[0] = -up[0]; up[1] = -up[1]; up[2] = -up[2]; }
      sprB.addBasis(pos.set(p.x, y, p.z), fwd, up, p.len, [an.phase, p.dead ? 0 : an.mv, an.act, an.actT], [an.head, an.open, an.curl, an.alert], p.dead ? 0x5d5750 : undefined);
    }
    sprB.end(time);
    // ---- pókok
    for (const s of sim.spiders) {
      if (s.state === 'lair' && !s.dead) continue; const y = heightAt(w, s.x, s.z); this.groundUp(w, s.x, s.z, up); fwd[0] = Math.sin(s.yaw); fwd[1] = 0; fwd[2] = Math.cos(s.yaw); const an = s.anim;
      if (s.dead) { up[0] = -up[0]; up[1] = -up[1]; up[2] = -up[2]; }
      spiB.addBasis(pos.set(s.x, y + (s.dead ? s.len * 0.12 : 0), s.z), fwd, up, s.len, [an.phase, s.dead ? 0 : an.mv, an.act, an.actT], [an.head, an.open, an.curl, an.alert + (s.state === 'stalk' ? 0.3 : 0) + (s.state === 'lunge' ? 0.7 : 0)], s.dead ? 0x5a5348 : undefined);
      if (s.carry) pushCarry(s.x + fwd[0] * s.len * 0.45, y + s.len * 0.15, s.z + fwd[2] * s.len * 0.45, Math.max(0.6, s.len * 0.1), 0x5c4a3a);
    }
    spiB.end(time);
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
    const showB = nestView || !!(controlled && controlled.loc === 'nest'); const cnt = [0, 0, 0]; const [mE, mL, mP] = this.broodMeshes; for (const m of this.broodMeshes) m.visible = showB;
    if (showB && sim.nest) for (const b of sim.brood) {
      if (b.carried) continue; const nd = node(sim.nest, b.node); if (!nd) continue;
      const rr = Math.max(0.6, nd.r), kz = nd.kind === 'chamber' ? 0.58 : 1; const x = nd.x + b.ox * Math.max(0, rr - 1.4) * 0.72, z = nd.z + b.oz * Math.max(0, rr - 1.4) * 0.72; const dd = Math.min(0.98, Math.hypot(x - nd.x, z - nd.z) / rr), y = nd.y - rr * kz * Math.sqrt(1 - dd * dd) + 0.04; const wob = Math.sin(time * 1.6 + b.ox * 40);   // y: a kamra aljának tényleges magassága ott, ahol a fiasítás fekszik const wob = Math.sin(time * 1.6 + b.ox * 40) ;
      const wsz = this.sp.size.worker || 4; let mesh, k, sc, col;
      if (b.stage === 'egg') { mesh = mE; k = 0; sc = 0.62; col = 0xf6f2e4; }
      else if (b.stage === 'larva') { mesh = mL; k = 1; sc = (1.1 + b.prog * 1.7) * (1 + wob * 0.025); col = b.fed < 0.3 ? 0xc9c3b3 : 0xf1e8cf; }
      else { mesh = mP; k = 2; sc = wsz * 0.85; col = b.prog > 0.8 ? 0xb08a58 : b.prog > 0.45 ? 0xd9c49a : 0xefe6cf; }
      if (cnt[k] >= 500) continue; this.Q.setFromAxisAngle(this.up, b.ox * 9 + b.oz * 3); this.M.compose(tmpV.set(x, y, z), this.Q, this.S.set(sc, sc * (k === 1 ? 1 + wob * 0.03 : 1), sc)); mesh.setMatrixAt(cnt[k], this.M); mesh.setColorAt(cnt[k], this.C.set(col)); cnt[k]++;
    }
    this.broodMeshes.forEach((m, i) => { m.count = cnt[i]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    // fejlámpa: a föld alatti első személyű nézetben
    if (controlled && controlled.loc === 'nest') { this.headLight.intensity = 450; this.headLight.position.set(controlled.x, controlled.y + controlled.len * 0.9, controlled.z); } else this.headLight.intensity = 0;
    this.updateNest(sim, nestView || (controlled && controlled.loc === 'nest'));
  }
  // ---- fészek: járatok és kamrák (metszet)
  updateNest(sim, visible) {
    const n = sim.nest; this.nestGroup.visible = !!(visible && n); if (!n) return;
    let sig = n.nodes.length + '/' + n.edges.length; for (const nd of n.nodes) sig += (nd.kind === 'chamber' ? Math.round(nd.r * 4) : '') + (nd.role || '') + (nd.ready === false ? 'x' : '') + (nd.flood > 0 ? 'f' : '');
    for (const e of n.edges) if (e.collapsed) sig += 'c';
    if (sig === this.nestSig) return; this.nestSig = sig;
    while (this.nestGroup.children.length) { const c = this.nestGroup.children.pop(); c.geometry && c.geometry.dispose(); }
    const wood = n.site.kind === 'cavity';   // fás fészek: ugyanaz a járat/kamra rendszer, de faanyagban
    const mat = (c, em) => { const k = c + '_' + em + wood; if (!this.nestMats[k]) this.nestMats[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color(wood ? new THREE.Color(c).lerp(new THREE.Color(0xb98a52), 0.45) : c).lerp(new THREE.Color(0xffffff), 0.55), map: (wood ? this.woodTex : this.nestTex) || null, emissive: em, emissiveIntensity: 1.2, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.93 }); return this.nestMats[k]; };
    const Y = new THREE.Vector3(0, 1, 0);
    for (const nd of n.nodes) {
      if (nd.ready === false && nd.kind !== 'chamber') continue;
      const chamber = nd.kind === 'chamber'; const col = chamber ? (ROLE_COL[nd.role] ?? ROLE_COL.null) : 0x7b5b3d;
      const g = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); const m = new THREE.Mesh(g, mat(nd.flood > 0 ? 0x5a8fc4 : col, nd.ready === false ? 0x331100 : 0x3a2410));
      const r = Math.max(0.6, nd.r); m.position.set(nd.x, nd.y, nd.z); m.scale.set(r, chamber ? r * 0.58 : r, r); this.nestGroup.add(m);
    }
    for (const e of n.edges) {
      const A = node(n, e.a), B = node(n, e.b); if (!A || !B) continue; if (A.ready === false && B.ready === false) continue;
      const d = tmpV.set(B.x - A.x, B.y - A.y, B.z - A.z); const L = d.length(); if (L < 0.01) continue;
      const rr = Math.max(0.5, e.w * 0.5); const g = new THREE.CylinderGeometry(rr, rr, L, 14, 1, true, Math.PI / 2, Math.PI); const m = new THREE.Mesh(g, mat(e.collapsed ? 0xb04030 : 0x7b5b3d, e.collapsed ? 0x300808 : 0x3a2410));   // félcső: felül nyitott, hogy beláthassunk
      const dn = d.clone().normalize(); const sx = new THREE.Vector3().crossVectors(dn, Y); if (sx.lengthSq() < 1e-6) sx.set(1, 0, 0); sx.normalize(); const zz = new THREE.Vector3().crossVectors(sx, dn).normalize();
      m.position.set((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sx, dn, zz)); this.nestGroup.add(m);
    }
  }
}
