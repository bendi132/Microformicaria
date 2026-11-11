// Gazdanövények (a levéltetvek növényei) – a mellékelt „Undergrowth pack” (low-poly) modelljeivel: pitypang, csorbóka (Lactuca), útifű; kind-onként 5 változat.
// A modellt egyszer töltjük be; a változatokat egységnyi magasságra normalizáljuk (talpuk y=0), és változatonként egy InstancedMesh rajzolja őket.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/GLTFLoader.js';
import { hostKindOf } from '../sim/aphids.js';

let cache = null;
export function loadUndergrowth() {
  if (cache) return cache;
  cache = new Promise((res) => {
    new GLTFLoader().load('assets/models/undergrowth.glb', (g) => {
      const vars = { dandelion: [], lactuca: [], plantain: [] };
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if (!o.isMesh) return; const k = /Dandelion/.test(o.name) ? 'dandelion' : /Lactuca/.test(o.name) ? 'lactuca' : /Plantain/.test(o.name) ? 'plantain' : null; if (!k) return;     // a talaj és az ember-referencia kimarad
        const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingBox(); const b = geo.boundingBox, h = b.max.y - b.min.y || 1;
        geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); geo.scale(1 / h, 1 / h, 1 / h);
        const mat = o.material.clone(); mat.transparent = false; mat.alphaTest = 0.5; mat.depthWrite = true; mat.side = THREE.DoubleSide; mat.metalness = 0; mat.roughness = 0.85;
        vars[k].push({ geo, mat });
      });
      res(vars);
    }, undefined, () => res(null));
  });
  return cache;
}

export function buildHostMesh(w, heightAt, vars) {
  if (!vars || !w.hosts || !w.hosts.length) return null; const grp = new THREE.Group(), by = new Map();
  for (const h of w.hosts) {
    const kind = hostKindOf(h.key) ? hostKindOf(h.key).model : 'dandelion', list = vars[kind]; if (!list || !list.length) continue;
    const v = list[Math.floor(h.seed * 1000) % list.length]; if (!by.has(v)) by.set(v, []); by.get(v).push(h);
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (const [v, hs] of by) {
    const im = new THREE.InstancedMesh(v.geo, v.mat, hs.length); im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
    hs.forEach((h, i) => { Q.setFromAxisAngle(Y, h.yaw || 0); M.compose(P.set(h.x, heightAt(w, h.x, h.z) - 0.1, h.z), Q, S.set(h.h, h.h, h.h)); im.setMatrixAt(i, M); });
    im.instanceMatrix.needsUpdate = true; grp.add(im);
  }
  return grp;
}
