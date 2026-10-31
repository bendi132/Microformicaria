// Élőlények megjelenítése (hangyák, ászkák, ugróvillások, pókok, tojások, fiasítás) és a fészek metszete.
import * as THREE from 'three';
import { loadCreatureGeometry, CreatureBatch } from './rig.js';
import { heightAt } from '../sim/world.js';
import { node } from '../sim/nest.js';
import { SPECIES } from '../sim/config.js';

const tmpV = new THREE.Vector3();
const ROLE_COL = { brood: 0xd9b25c, store: 0x7fa65a, rest: 0x7d8fa8, null: 0x8a6a48 };

export class CreatureLayer {
  constructor(scene) { this.scene = scene; this.group = new THREE.Group(); scene.add(this.group); this.nestSig = ''; this.nestGroup = new THREE.Group(); this.group.add(this.nestGroup); this.loaded = false; }
  async load(speciesId) {
    const sp = SPECIES[speciesId]; this.sp = sp;
    const [ant, iso, spi, spr] = await Promise.all(['ponera' === sp.model ? sp.model : sp.model, 'isopod', 'spider', 'springtail'].map((n) => loadCreatureGeometry(`assets/models/${n}.glb`)));
    this.antB = new CreatureBatch(ant, { kind: 0, capacity: 400, color: sp.tint });
    this.isoB = new CreatureBatch(iso, { kind: 1, capacity: 160, color: 0x7a746c });
    this.spiB = new CreatureBatch(spi, { kind: 2, capacity: 24, color: 0xffffff });
    this.sprB = new CreatureBatch(spr, { kind: 3, capacity: 320, color: 0x8d949c });
    for (const b of [this.antB, this.isoB, this.spiB, this.sprB]) this.group.add(b.mesh);
    // tojások / fiasítás / hordott tárgyak: egyszerű példányolt alakzatok
    const cap = new THREE.CapsuleGeometry(0.5, 1, 4, 10); cap.rotateZ(Math.PI / 2);
    this.eggMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.35, color: 0xffffff }), 900); this.eggMesh.count = 0; this.eggMesh.castShadow = true; this.group.add(this.eggMesh);
    this.broodMesh = new THREE.InstancedMesh(cap, new THREE.MeshStandardMaterial({ roughness: 0.55, color: 0xffffff, emissive: 0x201810 }), 500); this.broodMesh.count = 0; this.group.add(this.broodMesh);
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
    // ---- fiasítás (fészekmetszet)
    let bn = 0; const bm = this.broodMesh; bm.visible = nestView || !!(controlled && controlled.loc === 'nest');
    if (bm.visible && sim.nest) for (const b of sim.brood) {
      if (bn >= 500 || b.carried) continue; const nd = node(sim.nest, b.node); if (!nd) continue;
      const base = nd.kind === 'chamber' ? nd.r * 0.6 : nd.r * 0.3; const x = nd.x + b.ox * Math.max(0, nd.r - 1.2) * 0.7, z = nd.z + b.oz * Math.max(0, nd.r - 1.2) * 0.7, y = nd.y - base + 0.2;
      let sx, sy, sz, col; const sp = this.sp.size.worker || 4;
      if (b.stage === 'egg') { sx = 0.55; sy = 0.3; sz = 0.3; col = 0xf6f2e4; }
      else if (b.stage === 'larva') { const g = 0.7 + b.prog * 0.9; sx = 1.3 * g; sy = 0.55 * g; sz = 0.55 * g; col = b.fed < 0.3 ? 0xcbc6b6 : 0xefe4c8; }
      else { sx = sp * 0.34; sy = sp * 0.15; sz = sp * 0.15; col = b.prog > 0.7 ? 0xb89a68 : 0xe9dcb8; }
      this.Q.setFromAxisAngle(this.up, b.ox * 6); this.M.compose(tmpV.set(x, y + sy * 0.5, z), this.Q, this.S.set(sx, sy, sz)); bm.setMatrixAt(bn, this.M); bm.setColorAt(bn, this.C.set(col)); bn++;
    }
    bm.count = bn; bm.instanceMatrix.needsUpdate = true; if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
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
    const mat = (c, em) => { const k = c + '_' + em; if (!this.nestMats[k]) this.nestMats[k] = new THREE.MeshStandardMaterial({ color: c, emissive: em, emissiveIntensity: 0.6, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }); return this.nestMats[k]; };
    const Y = new THREE.Vector3(0, 1, 0);
    for (const nd of n.nodes) {
      if (nd.ready === false && nd.kind !== 'chamber') continue;
      const chamber = nd.kind === 'chamber'; const col = chamber ? (ROLE_COL[nd.role] ?? ROLE_COL.null) : 0x7b5b3d;
      const g = new THREE.SphereGeometry(1, 24, 16); const m = new THREE.Mesh(g, mat(nd.flood > 0 ? 0x5a8fc4 : col, nd.ready === false ? 0x331100 : 0x1a0f06));
      const r = Math.max(0.6, nd.r); m.position.set(nd.x, nd.y, nd.z); m.scale.set(r, chamber ? r * 0.58 : r, r); this.nestGroup.add(m);
    }
    for (const e of n.edges) {
      const A = node(n, e.a), B = node(n, e.b); if (!A || !B) continue; if (A.ready === false && B.ready === false) continue;
      const d = tmpV.set(B.x - A.x, B.y - A.y, B.z - A.z); const L = d.length(); if (L < 0.01) continue;
      const g = new THREE.CylinderGeometry(Math.max(0.5, e.w * 0.5), Math.max(0.5, e.w * 0.5), L, 12, 1, true); const m = new THREE.Mesh(g, mat(e.collapsed ? 0xb04030 : 0x7b5b3d, e.collapsed ? 0x300808 : 0x1a0f06));
      m.position.set((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); m.quaternion.setFromUnitVectors(Y, d.clone().normalize()); this.nestGroup.add(m);
    }
  }
}
