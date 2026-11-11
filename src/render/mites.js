// Atkák a fiasításon (a „Atkák a fiasításon” esemény): valódi, animált (csontvázas) atka-modell – Osian3D, CC-BY-4.0.
// A modellt első használatkor töltjük be; minden atka külön példány (kevés van belőlük), a járás-animáció egyenként kevert fázisú.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/GLTFLoader.js';

const SCALE = 2.3 / 0.92;                  // a modell hossza ~0,92 egység → ~1,7 mm
export class MiteLayer {
  constructor(parent) { this.group = new THREE.Group(); parent.add(this.group); this.items = []; this.buf = null; this.busy = false; this.last = 0; this.group.visible = false; }
  async _grow(n) {
    if (this.busy) return; this.busy = true;
    try {
      if (!this.buf) this.buf = await (await fetch('assets/models/mite.glb')).arrayBuffer();
      const loader = new GLTFLoader();
      while (this.items.length < n) {
        const g = await loader.parseAsync(this.buf.slice(0), ''); const root = g.scene; root.scale.setScalar(SCALE); root.visible = false;
        root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
        const mixer = new THREE.AnimationMixer(root); const act = mixer.clipAction(g.animations[0]); act.play(); mixer.update(Math.random() * 1.3);
        this.group.add(root); this.items.push({ root, mixer });
      }
    } catch (e) { console.warn('Atka-modell nem tölthető:', e && e.message); this.failed = true; }
    this.busy = false;
  }
  // list: [{x, y, z, yaw}] – az atkák helye (a fiasításon); üres lista: elrejti őket
  update(time, list) {
    const dt = Math.min(0.1, Math.max(0, time - this.last)); this.last = time;
    if (!list || !list.length) { this.group.visible = false; return; }
    if (this.items.length < list.length && !this.failed) this._grow(list.length);
    this.group.visible = true;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i], p = list[i];
      if (!p) { it.root.visible = false; continue; }
      it.root.visible = true; it.root.position.set(p.x, p.y, p.z); it.root.rotation.y = p.yaw; it.mixer.update(dt * 0.9);
    }
  }
}
