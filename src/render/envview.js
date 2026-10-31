// Környezeti modellek (növények, fák, avar) a játéktér körül, VALÓS MÉRETARÁNNYAL.
// 1 játékegység = 1 mm. A játéktér 180 mm széles, ezért a növények (pl. 4,1 m-es banánfa, 25 cm-es broméliarózsa) hangyaléptékben óriásiak:
// ezek a játékteret körülvevő gyűrűben állnak (a szimuláció hangyái nem léphetnek oda). Ez a méretarány-hatás szándékos.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/GLTFLoader.js';
import { KTX2Loader } from '../../vendor/three/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from '../../vendor/three/jsm/libs/meshopt_decoder.module.js';
import { FBXLoader } from '../../vendor/three/jsm/loaders/FBXLoader.js';
import { RNG } from '../core/rng.js';

// Valós méretek (mm). dim: 'h' = magasság, 'm' = a legnagyobb kiterjedés. A modellek saját egysége bizonytalan, ezért a határolódoboz alapján skálázunk.
// A "becsült" jelű értékek nincsenek a modell leírásában; ésszerű valós méretre vannak állítva (lásd docs/KORNYEZET.md).
export const ENV_MODELS = {
  banana:   { url: 'assets/env/banana.glb',          size: 4100, dim: 'h', note: 'banánfa, ~4,1 m' },
  bromeliad:{ url: 'assets/env/bromeliads.glb',      size: 300,  dim: 'm', note: 'broméliarózsa-csoport, ~30 cm (becsült)' },
  flower:   { url: 'assets/env/bromelia_flower.glb', size: 260,  dim: 'm', note: 'virágzó bromélia, ~26 cm (becsült)' },
  roots:    { url: 'assets/env/jungle_roots.glb',    size: 1000, dim: 'm', note: 'gyökeres, leveles trópusi talajfolt, ~1 m (becsült)', flat: true },
  trunk:    { url: 'assets/env/broken_trunk.glb',    size: 2500, dim: 'm', note: 'letört törzs, ~2,5 m' },
  tree1:    { url: 'assets/env/tree_lowpoly.glb',    size: 9000, dim: 'h', part: 'Tree 1', note: 'mérsékelt övi fa, ~9 m' },
  tree2:    { url: 'assets/env/tree_lowpoly.glb',    size: 8200, dim: 'h', part: 'Tree 2', note: 'mérsékelt övi fa, ~8 m' },
  oak:      { url: 'assets/env/oak_litter.glb',      size: 1000, dim: 'm', note: 'tölgyavar-folt, ~1 m (becsült)', flat: true },
  branch:   { url: 'assets/env/mossy/branch.fbx',    size: 1200, dim: 'm', note: 'mohás ág, ~1,2 m (becsült)', fbx: true },
};
// elhelyezés éghajlatonként: [modell, darab, rmin, rmax]
const PLAN = {
  tropical: [['roots', 3, 600, 1500], ['bromeliad', 6, 150, 800], ['flower', 5, 160, 700], ['trunk', 1, 800, 1000], ['banana', 4, 1700, 3400], ['banana', 3, 4200, 7000]],
  temperate: [['oak', 4, 600, 1900], ['branch', 3, 220, 900], ['trunk', 1, 800, 1000], ['tree1', 2, 2400, 3600], ['tree2', 2, 2500, 3700], ['tree1', 3, 4200, 8000], ['tree2', 3, 4400, 8200]],
};

export class EnvView {
  constructor(scene, renderer, climate, seed) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group); this.climate = climate; this.rng = new RNG((seed ^ 0xb10b) >>> 0); this.cache = new Map();
    this.ktx = new KTX2Loader().setTranscoderPath('vendor/three/jsm/libs/basis/').detectSupport(renderer);
    this.gltf = new GLTFLoader().setKTX2Loader(this.ktx).setMeshoptDecoder(MeshoptDecoder); const mgr = new THREE.LoadingManager(); mgr.setURLModifier((u) => { const m = /mossybranch_1001_(\w+)\.jpg/i.exec(u); return m ? `assets/env/mossy/${m[1].toLowerCase()}.jpg` : u; }); this.fbx = new FBXLoader(mgr); this.tex = new THREE.TextureLoader();
  }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.ktx.dispose(); }
  async loadModel(key) {
    if (this.cache.has(key)) return this.cache.get(key); const def = ENV_MODELS[key];
    const p = (async () => {
      let root;
      if (def.fbx) {
        root = await this.fbx.loadAsync(def.url); const L = (n) => { const t = this.tex.load(`assets/env/mossy/${n}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
        const map = L('basecolor'); map.colorSpace = THREE.SRGBColorSpace; const mat = new THREE.MeshStandardMaterial({ map, normalMap: L('normal'), roughnessMap: L('roughness'), aoMap: L('ao'), roughness: 1 });
        root.traverse((o) => { if (o.isMesh) { o.material = mat; if (o.geometry.attributes.uv && !o.geometry.attributes.uv1) o.geometry.setAttribute('uv1', o.geometry.attributes.uv); } });
      } else root = (await this.gltf.loadAsync(def.url)).scene;
      if (def.part) { const drop = []; root.traverse((o) => { if (o.isMesh && !o.name.replace(/[_ ]/g, '').includes(def.part.replace(/[_ ]/g, ''))) drop.push(o); }); for (const o of drop) o.parent.remove(o); }
      root.traverse((o) => { if (!o.isMesh) return; const m = o.material; const ms = Array.isArray(m) ? m : [m];
        const fixed = ms.map((q) => { let r = q; if (q.isMeshBasicMaterial) { r = new THREE.MeshStandardMaterial({ map: q.map, color: q.color, roughness: 0.9 }); } r.side = THREE.DoubleSide; if (r.transparent && !r.alphaTest) { r.alphaTest = 0.4; r.transparent = false; r.depthWrite = true; } return r; });
        o.material = Array.isArray(m) ? fixed : fixed[0]; o.castShadow = false; o.receiveShadow = false; });
      // méretezés: határolódoboz szerint valós méretre, talpa y=0, középre igazítva
      root.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(root), sz = box.getSize(new THREE.Vector3());
      const ref = def.dim === 'h' ? sz.y : Math.max(sz.x, sz.y, sz.z); const k = def.size / Math.max(1e-6, ref);
      const holder = new THREE.Group(); holder.add(root); root.scale.multiplyScalar(k); root.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(root); const c = b2.getCenter(new THREE.Vector3());
      root.position.x -= c.x; root.position.y -= b2.min.y; root.position.z -= c.z; holder.userData = { size: b2.getSize(new THREE.Vector3()), scale: k }; return holder;
    })();
    this.cache.set(key, p); return p;
  }
  async build(onProgress) {
    const plan = PLAN[this.climate] || PLAN.temperate; const rng = this.rng; this.placed = [];
    for (const [key, n, r0, r1] of plan) {
      let holder; try { holder = await this.loadModel(key); } catch (e) { console.warn('Környezeti modell nem tölthető:', key, e && e.message); continue; }
      const def = ENV_MODELS[key]; const off = rng.next();
      for (let i = 0; i < n; i++) {
        const o = holder.clone(true); const ang = ((i + rng.next() * 0.6) / n + off) * 6.2832, r = r0 + (r1 - r0) * ((i + rng.next() * 0.7) / n); const s = rng.range(0.85, 1.15);
        o.scale.setScalar(s); o.position.set(Math.cos(ang) * r, def.flat ? 0.25 + i * 0.05 : 0, Math.sin(ang) * r); o.rotation.y = rng.range(0, 6.28);
        if (key === 'trunk' || key === 'branch') o.rotation.z = rng.range(-0.06, 0.06); this.group.add(o); this.placed.push({ key, r, ang });
      }
      onProgress && onProgress(key);
    }
  }
}
