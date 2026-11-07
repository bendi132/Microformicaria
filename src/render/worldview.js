// A felszíni világ megjelenítése: terep, kövek, rönkök, moha, fű, avar, kavics, fa (Cephalotes), vízcseppek, élelemforrások, fény és időjárás.
import * as THREE from 'three';
import { RIG_ENV } from './rig.js';
import { PN, PC } from '../sim/phero.js';
import { heightAt, moistureAt, limbPoint, limbBase } from '../sim/world.js';
import { fbm, clamp, lerp, smooth } from '../core/util.js';
import { RNG } from '../core/rng.js';
import { SPECIES } from '../sim/config.js';
import { soilTextures, stoneTextures, barkTextures, rottenWoodTextures, mossTexture, sandTextures } from './textures.js';

const Q = { low: { grass: 1800, pebbles: 250, litter: 90, shadow: 1024, seg: 110 }, medium: { grass: 5200, pebbles: 600, litter: 220, shadow: 2048, seg: 160 }, high: { grass: 11000, pebbles: 1100, litter: 380, shadow: 4096, seg: 220 } };

export class WorldView {
  constructor(scene, renderer, quality = 'medium') {
    this.scene = scene; this.renderer = renderer; this.qn = quality; this.q = Q[quality] || Q.medium;
    this.group = new THREE.Group(); scene.add(this.group); this.time = 0; this.moistT = 0; this.dynT = 0;
    this.uniforms = { uTime: { value: 0 }, uWet: { value: 0 }, uFocus: { value: new THREE.Vector3(0, 0, 0) } };
    this.tex = { soil: soilTextures(256), sand: sandTextures(256), stone: stoneTextures(256), bark: barkTextures(256), rot: rottenWoodTextures(256), moss: mossTexture(128) };
    this.setupLights();
  }
  setupLights() {
    this.sun = new THREE.DirectionalLight(0xfff1d8, 3.2); this.sun.castShadow = this.renderer.shadowMap.enabled;
    this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow); const sc = this.sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.12;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x5a4630, 1.1); this.scene.add(this.hemi);
    this.fill = new THREE.AmbientLight(0xffffff, 0.12); this.scene.add(this.fill);
    this.scene.fog = new THREE.Fog(0xaec3d6, 120, 420); this.scene.background = new THREE.Color(0x9fb8d4);
    this.makeSkyEnv();
  }
  // egyszerű égbolt-környezet (kék zenit, meleg horizont, barna talaj): a hangyák kitinjének csillogásához és a vízcseppek tükröződéséhez
  makeSkyEnv() {
    const sc = new THREE.Scene(); const g = new THREE.SphereGeometry(50, 32, 16); const pos = g.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 50; const c = new THREE.Color(); if (y > 0.05) c.setRGB(0.42, 0.62, 1).lerp(new THREE.Color(1, 0.93, 0.8), Math.pow(1 - y, 3)); else c.setRGB(0.32, 0.24, 0.17); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const sunDot = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 12, 9) })); sunDot.position.set(26, 34, 20); sc.add(sunDot);
    const pm = new THREE.PMREMGenerator(this.renderer); RIG_ENV.tex = pm.fromScene(sc, 0.02).texture; pm.dispose(); this.dropMatEnv = RIG_ENV.tex;
    for (const m of RIG_ENV.mats) { m.envMap = RIG_ENV.tex; m.needsUpdate = true; }
  }
  dispose() { this.scene.remove(this.group, this.sun, this.sun.target, this.hemi, this.fill); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }

  build(sim) {
    const w = sim.world, rng = new RNG(w.seed ^ 0x51ed), half = w.half;
    this.sim = sim; const G = this.group; const climate = SPECIES[sim.speciesId].climate; const tropical = climate === 'tropical'; this.tropical = tropical; const desert = climate === 'desert'; this.desert = desert;
    // ---- terep
    const seg = this.q.seg; const geo = new THREE.PlaneGeometry(half * 2.4, half * 2.4, seg, seg); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); const edge = Math.max(0, Math.hypot(Math.max(0, Math.abs(x) - half), Math.max(0, Math.abs(z) - half))); pos.setY(i, heightAt(w, clamp(x, -half, half), clamp(z, -half, half)) - edge * 0.05); }
    geo.computeVertexNormals();
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.2, uv.getY(i) * 1.2);
    const ground = desert ? this.tex.sand : this.tex.soil;
    this.terrainMat = new THREE.MeshStandardMaterial({ map: ground.map, normalMap: ground.normalMap, normalScale: new THREE.Vector2(desert ? 0.9 : 1.4, desert ? 0.9 : 1.4), vertexColors: true, roughness: desert ? 0.98 : 0.96, metalness: 0 });
    if (tropical) this.terrainMat.color.set(0xf2c4a8); this.terrain = new THREE.Mesh(geo, this.terrainMat); this.terrain.receiveShadow = true; G.add(this.terrain); this.terrainGeo = geo;
    this.updateMoistureColors();
    // ---- a játéktéren kívüli talaj (a környező növényzet alatt)
    const fg = new THREE.PlaneGeometry(40000, 40000); fg.rotateX(-Math.PI / 2); const ft = this.tex.soil.map.clone(); ft.repeat.set(1800, 1800); ft.needsUpdate = true; const fn = this.tex.soil.normalMap.clone(); fn.repeat.set(1800, 1800); fn.needsUpdate = true;
    this.farGround = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: tropical ? 0x6e3f2c : desert ? 0xa9895c : 0x5c4a38, roughness: 1 })); this.farGround.position.y = -1.2; this.farGround.receiveShadow = false; G.add(this.farGround);
    // ---- kövek
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.tex.stone.map, normalMap: this.tex.stone.normalMap, roughness: 0.85, color: 0xd0cdc6 });
    this.stones = [];
    for (const s of w.stones) {
      if (s.trunk) continue;
      const g = new THREE.SphereGeometry(1, 56, 36); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = fbm(x * 1.6 + s.id, z * 1.6 + y * 1.3, 7, 4); const k = 0.82 + n * 0.4;
        p.setXYZ(i, x * k, Math.max(y * k, -0.25) * (y > 0 ? 1 : 0.4), z * k);
      }
      g.computeVertexNormals(); const m = new THREE.Mesh(g, stoneMat); m.castShadow = m.receiveShadow = true;
      m.scale.set(s.r, s.h * 1.15, s.r * s.sq); m.rotation.y = s.yaw; m.position.set(s.x, heightAt(w, s.x, s.z) - s.h * 0.12, s.z); G.add(m); this.stones.push(m);
    }
    // ---- korhadt rönkök
    const rotMat = new THREE.MeshStandardMaterial({ map: this.tex.rot.map, normalMap: this.tex.rot.normalMap, roughness: 0.95, color: 0xc8b9a2 });
    for (const l of w.logs) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 28, 14, false); g.rotateZ(Math.PI / 2); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = fbm(x * 4 + l.id, y * 3 + z * 3, 3, 3); const k = 1 + (n - 0.5) * 0.25; p.setXYZ(i, x, y * k, z * k); }
      g.computeVertexNormals(); const m = new THREE.Mesh(g, rotMat); m.castShadow = m.receiveShadow = true;
      m.scale.set(l.len, l.h, l.wid * 0.5); m.rotation.y = l.yaw; m.position.set(l.x, heightAt(w, l.x, l.z) + l.h * 0.55, l.z); G.add(m);
    }
    // ---- moha
    const mossMat = new THREE.MeshStandardMaterial({ map: this.tex.moss, roughness: 1, color: 0xffffff });
    const mg = new THREE.IcosahedronGeometry(1, 1); const mossList = desert ? [] : w.moss; let total = 0; for (const m of mossList) total += Math.floor(m.r * 95);
    const mossI = new THREE.InstancedMesh(mg, mossMat, total); let mi = 0; const M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), mc = new THREE.Color();
    for (const m of mossList) for (let k = 0; k < Math.floor(m.r * 95); k++) {
      // lapos, sűrű párnák: a folt közepén magasabb és sötétebb, a szélén világosabb és laposabb; apró ágacskák nélkül, de változatos zöldek
      const a = rng.range(0, 6.28), d = Math.pow(rng.next(), 0.7) * m.r; const x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d; const edge = d / m.r; const r = rng.range(0.16, 0.42) * (1.15 - edge * 0.7);
      P.set(x, heightAt(w, x, z) + r * 0.1, z); S.set(r, r * (0.28 + 0.2 * (1 - edge)), r * rng.range(0.8, 1.2)); Qn.setFromEuler(new THREE.Euler(0, rng.range(0, 6), 0)); M.compose(P, Qn, S); mossI.setMatrixAt(mi, M);
      mc.setHSL(0.22 + rng.range(-0.03, 0.05), 0.34 + rng.range(-0.1, 0.1), (0.16 + 0.12 * edge) * rng.range(0.8, 1.25)); mossI.setColorAt(mi, mc); mi++;
    }
    mossI.count = mi; mossI.receiveShadow = true; G.add(mossI);
    // ---- kavicsok
    const pebMat = new THREE.MeshStandardMaterial({ map: desert ? null : this.tex.stone.map, roughness: 0.9, color: desert ? 0xf0dcb0 : 0xb9a58f });
    const pg = new THREE.IcosahedronGeometry(1, 1); const peb = new THREE.InstancedMesh(pg, pebMat, this.q.pebbles); let pc = 0;
    for (let i = 0; i < this.q.pebbles; i++) {
      const x = rng.range(-half, half), z = rng.range(-half, half); if (this.overStone(w, x, z)) continue;
      const r = rng.range(0.25, 1.1); P.set(x, heightAt(w, x, z) + r * 0.15, z); S.set(r, r * rng.range(0.5, 0.8), r * rng.range(0.7, 1.1)); Qn.setFromEuler(new THREE.Euler(rng.range(0, 1), rng.range(0, 6), rng.range(0, 1))); M.compose(P, Qn, S); peb.setMatrixAt(pc, M); peb.setColorAt(pc, desert ? new THREE.Color().setHSL(0.1, 0.28, rng.range(0.55, 0.78)) : new THREE.Color().setHSL(0.08, 0.2, rng.range(0.28, 0.6))); pc++;
    }
    peb.count = pc; peb.castShadow = true; peb.receiveShadow = true; G.add(peb);
    // ---- avar (száraz levéldarabok)
    const lg = new THREE.PlaneGeometry(1, 0.5, 12, 6); lg.rotateX(-Math.PI / 2); const lp = lg.attributes.position; for (let i = 0; i < lp.count; i++) { const lx = lp.getX(i), lz = lp.getZ(i); lp.setY(i, Math.sin(lx * 3.1 + 0.6) * 0.07 + lz * lz * 1.1 + Math.max(0, lx - 0.25) * 0.28 * Math.sign(lz) * lz); } lg.computeVertexNormals();
    const litM = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, color: 0xffffff, map: this.leafTexture(), alphaTest: 0.5 }); const litN = desert ? 0 : this.q.litter; const lit = new THREE.InstancedMesh(lg, litM, Math.max(1, litN)); let lc = 0;
    for (let i = 0; i < litN; i++) {
      const x = rng.range(-half, half), z = rng.range(-half, half); if (this.overStone(w, x, z)) continue; const s = rng.range(4, 10);
      P.set(x, heightAt(w, x, z) + 0.25, z); S.set(s, 1, s); Qn.setFromEuler(new THREE.Euler(rng.range(-0.2, 0.2), rng.range(0, 6.28), rng.range(-0.2, 0.2))); M.compose(P, Qn, S); lit.setMatrixAt(lc, M); lit.setColorAt(lc, new THREE.Color().setHSL(rng.range(0.05, 0.13), rng.range(0.3, 0.6), rng.range(0.3, 0.52))); lc++;
    }
    lit.count = lc; lit.castShadow = true; lit.receiveShadow = true; G.add(lit);
    // ---- fű: ingó szálak
    this.buildGrass(w, rng);
    // ---- fa (Cephalotes)
    if (w.limbs.length) this.buildTree(sim);
    // ---- fészekbejárat (talajfészek): a nyílás és a kidobott föld
    this.entrance = null;
    // ---- dinamikus: vízcseppek, élelem
    this.dropMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.33, specularIntensity: 1, envMapIntensity: 1 });
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), this.dropMat, 96); this.drops.count = 0; this.drops.castShadow = false; G.add(this.drops);
    this.pelletMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ map: this.tex.soil.map, color: 0xd2b894, roughness: 1, emissive: 0x2a1a0e, emissiveIntensity: 0.6 }), 260); this.pelletMesh.count = 0; this.pelletMesh.castShadow = true; G.add(this.pelletMesh);
    this.foodMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 0.8, transparent: false });
    this.foods = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), this.foodMat, 64); this.foods.count = 0; this.foods.castShadow = true; G.add(this.foods);
    this.initRain(); this.updateDynamic(sim);
  }
  leafTexture() {
    const W = 256, H = 128; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    // sziluett: ovális, hegyes végű levél
    const path = () => { g.beginPath(); g.moveTo(6, 64); g.bezierCurveTo(50, 2, 170, 0, 250, 64); g.bezierCurveTo(170, 128, 50, 126, 6, 64); g.closePath(); };
    path(); g.fillStyle = '#e9e9e9'; g.fill(); g.save(); path(); g.clip();
    // foltos elszíneződés (barnuló, elszáradó levél)
    for (let i = 0; i < 70; i++) { const x = Math.random() * W, y = Math.random() * H, r = 6 + Math.random() * 22; const gr = g.createRadialGradient(x, y, 0, x, y, r); const d = Math.random() < 0.6; gr.addColorStop(0, d ? 'rgba(90,90,90,.35)' : 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    // erek: középér + oldalerek + finom hálózat
    g.strokeStyle = 'rgba(70,70,70,.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(6, 64); g.lineTo(246, 64); g.stroke();
    g.lineWidth = 1.6; for (let i = 0; i < 9; i++) { const x = 30 + i * 24; const k = 1 - Math.abs(i - 4) / 7; g.beginPath(); g.moveTo(x, 64); g.quadraticCurveTo(x + 22, 64 - 22 * k, x + 38, 64 - 46 * k); g.moveTo(x, 64); g.quadraticCurveTo(x + 22, 64 + 22 * k, x + 38, 64 + 46 * k); g.stroke(); }
    g.strokeStyle = 'rgba(90,90,90,.28)'; g.lineWidth = 0.8; for (let i = 0; i < 90; i++) { const x = Math.random() * W, y = Math.random() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 22); g.stroke(); }
    // szél: sötétebb, száraz szegély
    path(); g.lineWidth = 9; g.strokeStyle = 'rgba(40,40,40,.55)'; g.stroke();
    g.restore();
    // rágásnyomok / lyukak (alfa kivágás)
    g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 4; i++) { if (Math.random() < 0.55) { g.beginPath(); g.ellipse(40 + Math.random() * 170, 30 + Math.random() * 70, 2 + Math.random() * 6, 2 + Math.random() * 5, Math.random() * 3, 0, 6.3); g.fill(); } } g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  overStone(w, x, z) { for (const s of w.stones) if (Math.hypot(x - s.x, z - s.z) < s.r * 1.05) return true; for (const l of w.logs) if (Math.hypot(x - l.x, z - l.z) < l.len * 0.5) return true; return false; }

  buildGrass(w, rng) {
    if (this.desert) return this.buildTufts(w, rng);
    const segs = 3; const verts = [], idx = []; // egy szál: 3 szegmens, hegyes
    for (let i = 0; i <= segs; i++) { const t = i / segs; const wd = 0.1 * (1 - t * t * 0.92); verts.push(-wd, t, 0, wd, t, 0); }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
    const n = Math.floor(this.q.grass * (this.tropical ? 1.3 : 1)); const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
    const uni = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uni.uTime; sh.uniforms.uWet = uni.uWet; sh.uniforms.uFocus = uni.uFocus;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uFocus;').replace('#include <begin_vertex>', `
        vec3 transformed = position; float hh = position.y;
        vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.);
        float sw = sin(uTime*1.3 + ip.x*0.21 + ip.z*0.17) + 0.5*sin(uTime*2.7 + ip.x*0.5);
        transformed.x += sw * hh * hh * 0.28; transformed.z += cos(uTime*1.1 + ip.z*0.3) * hh * hh * 0.12;
        float dd = distance(ip.xz, uFocus.xy); float kk = uFocus.z > 0.0 ? smoothstep(uFocus.z*0.5, uFocus.z, dd) : 1.0; transformed.y *= mix(0.1, 1.0, kk);
      `);
    };
    const gi = new THREE.InstancedMesh(g, mat, n); const M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(); let c = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.range(-w.half - 6, w.half + 6), z = rng.range(-w.half - 6, w.half + 6); if (this.overStone(w, x, z)) continue;
      if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < 5) continue;
      const moist = moistureAt(w, clamp(x, -w.half, w.half), clamp(z, -w.half, w.half)); if (rng.next() > 0.35 + moist * 0.9) continue;
      const hgt = rng.range(5, 18) * (0.7 + moist * 0.7) * (this.tropical ? 1.35 : 1); P.set(x, heightAt(w, clamp(x, -w.half, w.half), clamp(z, -w.half, w.half)) - 0.1, z); S.set(rng.range(0.7, 1.4), hgt, 1);
      Qn.setFromEuler(new THREE.Euler(rng.range(-0.18, 0.18), rng.range(0, 6.28), rng.range(-0.18, 0.18))); M.compose(P, Qn, S); gi.setMatrixAt(c, M);
      gi.setColorAt(c, (this.tropical ? new THREE.Color().setHSL(rng.range(0.27, 0.36), rng.range(0.55, 0.8), rng.range(0.14, 0.3)) : new THREE.Color().setHSL(rng.range(0.19, 0.28), rng.range(0.4, 0.6), rng.range(0.2, 0.36)))); c++;
    }
    gi.count = c; gi.castShadow = this.qn !== 'low'; gi.receiveShadow = true; gi.frustumCulled = false; this.group.add(gi); this.grass = gi;
  }
  // sivatagi száraz fűcsomók: a szimuláció tufts-ai köré, a csomó sűrűségével arányos szálszámmal
  buildTufts(w, rng) {
    const segs = 3; const verts = [], idx = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs; const wd = 0.09 * (1 - t * t * 0.92); verts.push(-wd, t, 0, wd, t, 0); }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
    let n = 0; for (const t of w.tufts) n += t.blades; n = Math.max(1, n);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    const uni = this.uniforms; mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uni.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `
        vec3 transformed = position; float hh = position.y; vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.);
        float sw = sin(uTime*1.1 + ip.x*0.31 + ip.z*0.23) * 0.6 + 0.4*sin(uTime*2.3 + ip.x*0.6);
        transformed.x += sw * hh * hh * 0.22;`);
    };
    const gi = new THREE.InstancedMesh(g, mat, n); const M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(); let c = 0;
    for (const t of w.tufts) for (let k = 0; k < t.blades && c < n; k++) {
      const a = rng.range(0, 6.28), d = Math.sqrt(rng.next()) * t.r * 0.9; const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
      const hgt = rng.range(5, 13) * (0.7 + 0.6 * (1 - d / (t.r + 0.01))); const lean = rng.range(-0.35, 0.35) + (d / (t.r + 0.01)) * 0.3 * Math.cos(a);
      P.set(x, heightAt(w, clamp(x, -w.half, w.half), clamp(z, -w.half, w.half)) - 0.1, z); S.set(rng.range(0.7, 1.3), hgt, 1);
      Qn.setFromEuler(new THREE.Euler(lean * 0.4, rng.range(0, 6.28), lean)); M.compose(P, Qn, S); gi.setMatrixAt(c, M);
      gi.setColorAt(c, new THREE.Color().setHSL(rng.range(0.1, 0.14), rng.range(0.35, 0.55), rng.range(0.42, 0.6))); c++;
    }
    gi.count = c; gi.castShadow = this.qn !== 'low'; gi.receiveShadow = true; gi.frustumCulled = false; this.group.add(gi); this.grass = gi;
  }
  buildTree(sim) {
    const w = sim.world; const tl = new THREE.TextureLoader();
    const bmap = tl.load('assets/env/trunk_bark.jpg'), bnrm = tl.load('assets/env/trunk_bark_n.jpg');
    for (const t of [bmap, bnrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; } bmap.colorSpace = THREE.SRGBColorSpace;
    // a feltöltött dzsungelfa-modell kéreg-fotója (lásd docs/KORNYEZET.md): a hangyák a pontos hengerfelszínen járnak, a kéreg a modell textúrája
    const barkMat = new THREE.MeshStandardMaterial({ map: bmap, normalMap: bnrm, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.95, color: 0xd8c9b4 });
    this.limbMeshes = []; this.barkMat = barkMat;
    const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    for (const L of w.limbs) {
      const b = limbBase(w, L); const nr = L.id === 0 ? 120 : 64, nh = L.id === 0 ? 170 : 90;
      const g = new THREE.CylinderGeometry(L.r, L.r, L.len, nr, nh, true); g.translate(0, L.len / 2, 0); const p = g.attributes.position;
      const holes = w.cavities.filter((c) => c.limb === L.id);
      // a (s, theta) koordináta limbPoint-tal azonos értelmezésű: a hengerpalást szögét a limbPoint-bázishoz igazítjuk
      const d = L.dir, up = Math.abs(d.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      let ux = d.y * up.z - d.z * up.y, uy = d.z * up.x - d.x * up.z, uz = d.x * up.y - d.y * up.x; const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
      const vx = d.y * uz - d.z * uy, vy = d.z * ux - d.x * uz, vz = d.x * uy - d.y * ux;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d.x, d.y, d.z));
      const U = new THREE.Vector3(ux, uy, uz), V = new THREE.Vector3(vx, vy, vz), tmp = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a0 = Math.atan2(z, x);
        const n = fbm(a0 * 3 + L.id * 9, y * 0.15, 11, 3); let k = 1 + (n - 0.5) * 0.05 + Math.sin(a0 * 9 + y * 0.2) * 0.008;
        // a vertex világbeli iránya → theta (a limbPoint-bázisban)
        tmp.set(x, 0, z).applyQuaternion(q); const th = Math.atan2(tmp.dot(V), tmp.dot(U));
        for (const c of holes) {
          const dth = Math.atan2(Math.sin(th - c.th), Math.cos(th - c.th)) * L.r, ds = y - c.s; const rr = Math.hypot(dth / 1.0, ds / 1.3) / (c.entrance * 0.5);
          if (rr < 1.9) { const dep = c.entrance * 0.55 * (1 - sstep(0.85, 1.9, rr)); k -= dep / L.r; if (rr < 1.05) k -= c.entrance * 0.35 / L.r; }
        }
        p.setXYZ(i, x * k, y, z * k);
      }
      g.computeVertexNormals(); const uvA = g.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 1.6 * (L.r / 15), uvA.getY(i) * L.len / 60);
      const m = new THREE.Mesh(g, barkMat); m.castShadow = m.receiveShadow = true; m.position.set(b.x, b.y, b.z);
      m.quaternion.copy(q); this.group.add(m); this.limbMeshes.push(m);
    }
    // odúk bejáratai: a furat mélyén sötét üreg, a peremén kéregpereme
    const dark = new THREE.MeshBasicMaterial({ color: 0x050302 }), rimMat = new THREE.MeshStandardMaterial({ map: bmap, color: 0x6a5846, roughness: 1 });
    for (const cav of w.cavities) {
      const p = limbPoint(w, cav.limb, cav.s, cav.th, {}); const dpt = cav.entrance * 0.55;
      const g = new THREE.CircleGeometry(cav.entrance * 0.5, 28); const m = new THREE.Mesh(g, dark);
      m.scale.set(1, 1.3, 1); m.position.set(p.x - p.nx * dpt * 0.7, p.y - p.ny * dpt * 0.7, p.z - p.nz * dpt * 0.7); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(p.nx, p.ny, p.nz)); this.group.add(m);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(cav.entrance * 0.52, cav.entrance * 0.07, 8, 28), rimMat); rim.scale.set(1, 1.3, 1); rim.position.set(p.x - p.nx * dpt * 0.25, p.y - p.ny * dpt * 0.25, p.z - p.nz * dpt * 0.25); rim.quaternion.copy(m.quaternion); this.group.add(rim);
    }
    // gyökérkiszélesedés
    const root = new THREE.Mesh(new THREE.ConeGeometry(w.limbs[0].r * 1.5, 7, 40, 1, true), barkMat); root.position.set(w.limbs[0].base.x, 2.5, w.limbs[0].base.z); this.group.add(root);
  }
  // fészekbejárat (a szimuláció által választott helyen, amint létrejön a fészek)
  makeHole(e) {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.TorusGeometry(e.r * 1.1, e.r * 0.7, 12, 28), new THREE.MeshStandardMaterial({ map: this.tex.soil.map, color: 0xb59a7e, roughness: 1 })); mound.rotation.x = Math.PI / 2; mound.scale.set(1, 1, 0.55); mound.castShadow = true; g.add(mound);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(e.r * 0.95, 22), new THREE.MeshBasicMaterial({ color: 0x030201 })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.15; g.add(hole);
    g.position.set(e.x, e.y + 0.1, e.z); this.group.add(g); return g;
  }
  ensureEntrance(sim) {
    if (!sim.nest || sim.nest.site.kind !== 'soil') return;
    if (!this.entrance) this.entrance = this.makeHole(sim.nest.nodes[0]);
    // a játékos által ásott kijáratok (felszíni nyílások)
    this.exitGroups = this.exitGroups || new Map(); const live = new Set();
    for (const e of sim.nest.nodes) if (e.kind === 'exit') { live.add(e.id); if (!this.exitGroups.has(e.id)) { const g = this.makeHole(e); g.visible = !this._nv; this.exitGroups.set(e.id, g); } }
    for (const [id, g] of this.exitGroups) if (!live.has(id)) { this.group.remove(g); this.exitGroups.delete(id); }
  }
  updateMoistureColors() {
    const w = this.sim.world; const p = this.terrainGeo.attributes.position, c = this.terrainGeo.attributes.color; const half = w.half;
    for (let i = 0; i < p.count; i++) {
      const x = clamp(p.getX(i), -half, half), z = clamp(p.getZ(i), -half, half); const m = moistureAt(w, x, z);
      const dry = 1 - m; const patch = fbm(x * 0.07, z * 0.07, 99);
      if (this.desert) { const k = 0.9 + patch * 0.18 - m * 0.22; c.setXYZ(i, 0.93 * k, 0.8 * k, 0.56 * k); continue; }
      c.setXYZ(i, lerp(0.95, 0.52, m) * (0.9 + patch * 0.25) + dry * 0.1, lerp(0.88, 0.5, m) * (0.9 + patch * 0.25) + dry * 0.05, lerp(0.76, 0.46, m) * (0.9 + patch * 0.2));
    }
    c.needsUpdate = true;
  }
  updateDynamic(sim) {
    const w = sim.world; const M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(); let i = 0;
    for (const d of w.droplets) { if (i >= 96) break; const r = Math.cbrt(d.vol) * 0.46; P.set(d.x, heightAt(w, d.x, d.z) + r * 0.45, d.z); S.set(r, r * 0.72, r); M.compose(P, Qn, S); this.drops.setMatrixAt(i++, M); }
    this.drops.count = i; this.drops.instanceMatrix.needsUpdate = true;
    { let k = 0; for (const p of (w.pellets || [])) { if (k >= 260) break; const r = p.s; P.set(p.x, heightAt(w, p.x, p.z) + r * 0.45, p.z); S.set(r * 1.15, r * 0.8, r); M.compose(P, Qn, S); this.pelletMesh.setMatrixAt(k++, M); } this.pelletMesh.count = k; this.pelletMesh.instanceMatrix.needsUpdate = true; }
    i = 0; const colAmber = new THREE.Color(0xd6921c), colDrop = new THREE.Color(0x2a1d12);
    for (const f of w.foods) {
      if (f.kind === 'seed') continue; if (i >= 64) break; let x = f.x, y, z = f.z;
      if (f.limb !== undefined) { const pt = limbPoint(w, f.limb, f.s, f.th, {}); x = pt.x + pt.nx * 0.2; y = pt.y + pt.ny * 0.2; z = pt.z + pt.nz * 0.2; } else y = heightAt(w, x, z);
      const r = 0.6 + Math.cbrt(Math.max(0, f.amount)) * 0.34; P.set(x, y + r * 0.35, z); S.set(r, r * 0.6, r); M.compose(P, Qn, S); this.foods.setMatrixAt(i, M); this.foods.setColorAt(i, f.kind === 'dropping' ? colDrop : colAmber); i++;
    }
    this.foods.count = i; this.foods.instanceMatrix.needsUpdate = true; if (this.foods.instanceColor) this.foods.instanceColor.needsUpdate = true;
  }
  initRain() {
    const n = 1400; const pos = new Float32Array(n * 6); this.rainN = n; this.rainSeed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.rainSeed[i * 3] = (Math.random() - 0.5) * 220; this.rainSeed[i * 3 + 1] = Math.random() * 90; this.rainSeed[i * 3 + 2] = (Math.random() - 0.5) * 220; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbcd0e6, transparent: true, opacity: 0.55 })); this.rain.frustumCulled = false; this.rain.visible = false; this.group.add(this.rain);
  }
  updateRain(dt, intensity) {
    this.rain.visible = intensity > 0.02; if (!this.rain.visible) return; const p = this.rain.geometry.attributes.position, s = this.rainSeed; const n = Math.floor(this.rainN * clamp(intensity, 0.2, 1));
    for (let i = 0; i < this.rainN; i++) {
      if (i >= n) { p.setXYZ(i * 2, 0, -50, 0); p.setXYZ(i * 2 + 1, 0, -50, 0); continue; }
      s[i * 3 + 1] -= dt * 150; if (s[i * 3 + 1] < 0) s[i * 3 + 1] += 90;
      const x = s[i * 3], y = s[i * 3 + 1], z = s[i * 3 + 2]; p.setXYZ(i * 2, x, y, z); p.setXYZ(i * 2 + 1, x + 0.6, y + 5, z);
    }
    p.needsUpdate = true;
  }

  // fény, ég, köd az idő és az időjárás szerint
  updateLighting(env) {
    const h = env.hour; const day = h >= 6 && h <= 19.5 ? Math.sin(clamp((h - 6) / 13.5, 0, 1) * Math.PI) : 0;
    const el = lerp(0.09, 1.2, day); const az = ((h - 6) / 13.5) * Math.PI;
    const wx = env.weather; const cloud = wx === 'rain' ? 0.75 : wx === 'cloud' ? 0.42 : 0;
    const dir = new THREE.Vector3(Math.cos(az) * 0.9, Math.max(0.12, el), -0.4 + Math.sin(az) * 0.2).normalize();
    this.sun.position.copy(dir).multiplyScalar(220); this.sun.target.position.set(0, 0, 0);
    const warm = 1 - smooth(0.05, 0.45, day); const sunCol = new THREE.Color().setRGB(1, lerp(0.96, 0.62, warm), lerp(0.88, 0.38, warm));
    const nightMix = 1 - smooth(0.0, 0.18, day);
    if (day <= 0.02) { this.sun.color.set(0x7d93c9); this.sun.position.set(-80, 160, 90); } else this.sun.color.copy(sunCol);
    this.sun.intensity = lerp(0.35, 3.3, smooth(0, 0.5, day)) * (1 - cloud * 0.8);
    const sky = new THREE.Color().setRGB(lerp(0.05, 0.62, smooth(0, 0.5, day)) + warm * 0.2 * day, lerp(0.07, 0.76, smooth(0, 0.5, day)) + warm * 0.05 * day, lerp(0.15, 0.9, smooth(0, 0.5, day)));
    const grey = new THREE.Color(0.55, 0.58, 0.62).multiplyScalar(lerp(0.15, 1, day)); sky.lerp(grey, cloud * 0.8);
    this.scene.background.copy(sky); this.scene.fog.color.copy(sky); const hz = this.tropical ? 0.75 : 1; this.scene.fog.near = (160 - cloud * 60) * hz; this.scene.fog.far = (4200 - cloud * 1800) * hz;
    this.hemi.color.copy(sky).lerp(new THREE.Color(1, 1, 1), 0.3); this.hemi.groundColor.set(0x5a4630).multiplyScalar(lerp(0.3, 1, day)); this.hemi.intensity = lerp(0.5, 1.15, day) * (1 - cloud * 0.25);
    { const ei = (0.1 + 0.75 * day * (1 - cloud * 0.45)) * (this._nv ? 0.25 : 1); for (const m of RIG_ENV.mats) m.envMapIntensity = ei; if (this.dropMat) { this.dropMat.envMap = RIG_ENV.tex; this.dropMat.envMapIntensity = ei * 0.5; } }
    this.fill.intensity = 0.1 + nightMix * 0.1;
    this.uniforms.uWet.value = cloud;
  }
  // nyomferomon-réteg (P): halvány korongok a talajon, ahol a hazatérő hangyák nyomot hagytak
  updatePhero(sim, dt) {
    if (!this.pheroOn) { if (this.pheroMesh) this.pheroMesh.visible = false; return; }
    if (!this.pheroMesh) { const g = new THREE.CircleGeometry(1, 10); g.rotateX(-Math.PI / 2); this.pheroMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0.55, depthWrite: false }), PN * PN); this.pheroMesh.frustumCulled = false; this.pheroMesh.renderOrder = 3; this.group.add(this.pheroMesh); this._pT = 0; }
    this.pheroMesh.visible = true; this._pT -= dt; if (this._pT > 0) return; this._pT = 0.5;
    const f = sim.phero, w = sim.world; if (!f) { this.pheroMesh.count = 0; return; } const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(); let c = 0;
    for (let j = 0; j < PN; j++) for (let i = 0; i < PN; i++) { const v = f[j * PN + i]; if (v < 0.12) continue; const x = -w.half + (i + 0.5) * PC, z = -w.half + (j + 0.5) * PC; const r = PC * 0.55 * Math.min(1, 0.4 + v * 0.6); P.set(x, heightAt(w, x, z) + 0.12, z); S.set(r, 1, r); M.compose(P, Q, S); this.pheroMesh.setMatrixAt(c++, M); }
    this.pheroMesh.count = c; this.pheroMesh.instanceMatrix.needsUpdate = true;
  }
  update(dt, sim, nestView) {
    this.updatePhero(sim, dt);
    this.time += dt; this.uniforms.uTime.value = this.time;
    this.moistT += dt; if (this.moistT > 4) { this.moistT = 0; this.updateMoistureColors(); }
    this.dynT += dt; if (this.dynT > 0.25) { this.dynT = 0; this.updateDynamic(sim); }
    this.ensureEntrance(sim); this.updateLighting(sim.env); this.updateRain(dt, sim.env.rain || 0);
    // metszetnézet: a talaj és a felszíni rendetlenség (fű, avar, kövek) eltűnik, a háttér a "föld keresztmetszete"; a fa kérge áttetsző
    if (this._nv !== nestView) { this._nv = nestView; const keep = new Set([this.terrain, this.farGround, ...(this.limbMeshes || [])]); for (const c of this.group.children) if (!keep.has(c)) c.visible = !nestView; this.farGround.visible = !nestView; this.terrain.visible = !nestView; }
    if (this.barkMat) { const bt = nestView ? 0.16 : 1; this.barkMat.opacity += (bt - this.barkMat.opacity) * Math.min(1, dt * 6); this.barkMat.transparent = this.barkMat.opacity < 0.99; this.barkMat.depthWrite = !this.barkMat.transparent; this.barkMat.clippingPlanes = null; }
  }
}
