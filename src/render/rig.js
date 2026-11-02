// Animációs réteg: a GLB hálók (csontváz nélkül) csúcspont-szintű animációja a GPU-n.
// A hálók előkészítésekor minden csúcs kapott: aPart (testrész), aLid (végtag-azonosító), aW (0..1 súly a gyökértől a hegyig), aPivot (forgáspont).
// Példányonként két vec4 attribútum vezérli a mozgást: iA = (lépésfázis, mozgás, akció, akció-idő), iB = (fejforgatás, száj/csáprágó nyitás, potroh-görbítés, éberség).
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/addons/GLTFLoader.js';

export const PART = { BODY: 0, LEG: 1, ANTENNA: 2, MANDIBLE: 3, GASTER: 4, HEAD: 5 };
// kind: 0 hangya, 1 ászka, 2 pók
const GLSL_ATTR = /* glsl */`
attribute float aPart; attribute float aLid; attribute float aW; attribute vec3 aPivot;
attribute vec4 iA; attribute vec4 iB;
uniform float uKind; uniform float uTime; uniform vec3 uNeck; uniform vec3 uGaster; uniform float uAmp; uniform float uSwing;
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s, 0.,1.,0., s,0.,c);}
mat3 rotZ(float a){float c=cos(a),s=sin(a);return mat3(c,s,0., -s,c,0., 0.,0.,1.);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0., 0.,c,s, 0.,-s,c);}
vec3 rotAbout(mat3 R, vec3 p, vec3 pv){return pv + R*(p-pv);}
`;
const GLSL_DEFORM = /* glsl */`
vec3 p = position; float part = aPart; float mv = iA.y; float ph = iA.x; float lid = aLid;
float dig = (iA.z > 2.5 && iA.z < 3.5) ? 1.0 : 0.0;    // act = 3: földet fúr
float side = aPivot.z >= 0.0 ? 1.0 : -1.0;       // +Z = bal oldal
float wt = smoothstep(0.0, 0.85, aW);
if (uKind < 0.5 || uKind > 2.5) {            // ---- hangya / ugróvilla
  if (part > 0.5 && part < 1.5) {                  // láb (tripod járás)
    float k = floor(lid*0.5); float sd = mod(lid,2.0);
    float grp = mod(k + sd, 2.0);
    float f = ph + grp*3.14159;
    float mvc = smoothstep(0.03, 0.2, mv); float swing = sin(f) * uSwing * mvc;
    if (dig > 0.5 && k < 0.5) { float fd = uTime * 13.0 + sd * 3.14159; swing = sin(fd) * 0.55; }     // fúrás: az első láb kaparja a földet
    float lift = max(0.0, cos(f)) * (0.35 + uSwing * 0.5) * mvc; if (dig > 0.5 && k < 0.5) lift = max(0.0, cos(uTime * 13.0 + sd * 3.14159)) * 0.5;
    mat3 R = rotY(swing*side*wt) * rotX(-side*lift*wt);
    // állva is finom súlyáthelyezés
    p = rotAbout(R, p, aPivot);
  } else if (part > 1.5 && part < 2.5) {           // csáp
    float t = uTime*(2.0+3.0*iB.w) + lid*1.7;
    float a = sin(t)*0.30*(0.35+iB.w) + sin(t*2.3+1.0)*0.12;
    float b = sin(t*0.8+2.0)*0.18*(0.4+iB.w);
    p = rotAbout(rotY(a*wt)*rotZ(b*wt), p, aPivot);
  } else if (part > 2.5 && part < 3.5) {           // rágó (nyitás oldalra)
    float sgn = lid > 0.5 ? 1.0 : -1.0;
    float a = -sgn * iB.y * 0.75;
    p = rotAbout(rotY(a), p, aPivot);
  }
  if ((part > 3.5 && part < 4.5) || part < 0.5) {   // potroh: lélegzés + szúrás/görbítés; a törzs a nyél körül fokozatosan követi (nincs szakadás)
    float wg = 1.0 - smoothstep(uGaster.x - 0.05, uGaster.x + 0.05, position.x);   // (fordított élű smoothstep nem definiált GLSL-ben)
    float br = sin(uTime*1.7+iA.x*0.2)*0.025;
    p = rotAbout(rotZ((iB.z*0.95 + br + sin(ph*2.0)*0.03*mv)*wg), p, uGaster);
  }
  if (part > 5.5) {                                // ugróvilla: a hasi villa kinyúlik ugráskor
    p = rotAbout(rotZ(-iB.z*1.5*wt), p, aPivot);
  }
  if (part < 0.5 || (part > 1.5 && part < 3.5) || (part > 4.5 && part < 5.5)) {    // fej-csoport: fejforgatás a nyakon át; a törzs/fej határán fokozatos súly (nem szakad el a háló)
    float wn = (part > 1.5 && part < 3.5) ? 1.0 : smoothstep(uNeck.x - 0.05, uNeck.x + 0.05, position.x);
    p = rotAbout(rotY(iB.x*wn)*rotZ((-0.12*iB.w - dig*(0.45 + 0.2*sin(uTime*9.0)))*wn), p, uNeck);   // fúrás: a fej lefelé, ütemesen
  }
  p.y += abs(sin(ph))*0.012*mv*uAmp;               // járás közbeni finom emelkedés
  p.z += sin(ph)*0.006*mv;
} else if (uKind < 1.5) {     // ---- ászka (metachron lábhullám + test hullámzás)
  if (part > 0.5 && part < 1.5) {
    float f = ph + lid*0.95 + (side < 0.0 ? 3.14159 : 0.0);
    float swing = sin(f)*0.50*mv; float lift = max(0.0, cos(f))*0.45*mv;
    p = rotAbout(rotY(swing*side*wt)*rotX(-side*lift*wt), p, aPivot);
  } else if (part > 1.5 && part < 2.5) {
    float t = uTime*3.0; p = rotAbout(rotY(sin(t)*0.35*wt), p, aPivot);
  }
  p.z += sin(p.x*7.0 - ph*1.0)*0.012*mv*step(part,0.5);
  p.y += abs(sin(ph*0.5))*0.004*mv;
} else {                      // ---- pók
  if (part > 0.5 && part < 1.5) {                  // járólábak (tetrapod)
    float k = floor(lid*0.5); float sd = mod(lid,2.0);
    float grp = mod(k + sd, 2.0);
    float f = ph + grp*3.14159;
    float swing = sin(f)*0.42*mv; float lift = max(0.0, cos(f))*0.78*mv;
    float raise = iB.w*(k < 0.5 ? 0.35 : 0.0);
    p = rotAbout(rotY(swing*side*wt)*rotX(-side*(lift+raise)*wt), p, aPivot);
  } else if (part > 1.5 && part < 2.5) {           // elülső végtagok: tapogatás / támadáskor felemelés és előrecsapás
    float t = uTime*2.2 + lid*2.0;
    float probe = sin(t)*0.22*(0.4+mv);
    float up = iB.w*0.95;                          // éberség/ támadás: felemelés
    float strike = iA.z > 0.5 ? sin(clamp(iA.w,0.0,1.0)*3.14159)*0.7 : 0.0;
    p = rotAbout(rotY((probe + strike)*side*wt)*rotX(-side*up*wt), p, aPivot);
  } else if (part > 2.5 && part < 3.5) {           // tapogatók
    float t = uTime*5.0 + lid*1.3; p = rotAbout(rotY(sin(t)*0.18*wt)*rotZ(sin(t*0.7)*0.1*wt), p, aPivot);
  } else if (part > 3.5 && part < 4.5) {           // csáprágók: nyitás lefelé/oldalra
    float sgn = lid > 0.5 ? 1.0 : -1.0;
    p = rotAbout(rotZ(-iB.y*0.9)*rotY(sgn*iB.y*0.3), p, aPivot);
  }
  p.y += abs(sin(ph))*0.01*mv;
}
vec3 transformed = p;
`;

export function patchMaterial(mat, uniforms, isDepth = false) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GLSL_ATTR)
      .replace('#include <begin_vertex>', GLSL_DEFORM);
  };
  mat.customProgramCacheKey = () => 'rig' + (isDepth ? 'd' : 'm') + uniforms.uKind.value;
  return mat;
}

const loader = new GLTFLoader();
const cache = new Map();
export function loadCreatureGeometry(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((res, rej) => loader.load(url, (g) => {
    let mesh = null; g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    const geo = mesh.geometry;
    const ren = { _part: 'aPart', _lid: 'aLid', _w: 'aW', _pivot: 'aPivot' };
    for (const k in ren) if (geo.getAttribute(k)) { geo.setAttribute(ren[k], geo.getAttribute(k)); geo.deleteAttribute(k); }
    const extras = g.parser.json.extras || {};
    res({ geometry: geo, material: mesh.material, extras });
  }, undefined, rej));
  cache.set(url, p); return p;
}

// Egy faj (modell) összes példányát egyetlen InstancedMesh rajzolja.
export class CreatureBatch {
  constructor({ geometry, material, extras }, { kind, capacity, color = 0xffffff, castShadow = true, amp = 1, swing = 0.55 }) {
    this.kind = kind; this.capacity = capacity; this.count = 0; this.extras = extras;
    this.height = extras.height || 0.3; this.bounds = extras.bounds;
    const geo = geometry.clone();
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
    this.iA = geo.getAttribute('iA'); this.iB = geo.getAttribute('iB');
    this.uniforms = {
      uKind: { value: kind }, uTime: { value: 0 }, uAmp: { value: amp }, uSwing: { value: swing },
      uNeck: { value: new THREE.Vector3(...(extras.headPivot || [0.2, 0.15, 0])) },
      uGaster: { value: new THREE.Vector3(...(extras.gasterPivot || [-0.15, 0.1, 0])) },
    };
    const m = material.clone(); m.side = THREE.DoubleSide;
    if (geo.getAttribute('color')) m.vertexColors = true;
    if (!geo.getAttribute('color')) m.color = new THREE.Color(color);
    patchMaterial(m, this.uniforms);
    this.mesh = new THREE.InstancedMesh(geo, m, capacity);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = castShadow; this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dm = patchMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), this.uniforms, true);
    this.mesh.customDepthMaterial = dm;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._c = new THREE.Color(); this._bx = new THREE.Vector3(); this._by = new THREE.Vector3(); this._bz = new THREE.Vector3();
  }
  begin() { this.count = 0; }
  // pos: világkoordináta (láb alatti pont), yaw/pitch/roll: radián, size: testhossz mm, anim: [fázis,mozgás,akció,akcióIdő], pose: [fej,nyitás,potroh,éberség]
  add(pos, yaw, pitch, roll, size, anim, pose, tint) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this._e.set(pitch, yaw, roll, 'YXZ'); this._q.setFromEuler(this._e); this._s.set(size, size, size);
    this._m.compose(pos, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
    this.iA.setXYZW(i, anim[0], anim[1], anim[2], anim[3]); this.iB.setXYZW(i, pose[0], pose[1], pose[2], pose[3]);
    if (tint !== undefined) { this._c.set(tint); this.mesh.setColorAt(i, this._c); }
    return i;
  }
  // orientáció bázisvektorokból: előre (f), felfelé (u); a modell előre=+X, fel=+Y, bal=+Z
  addBasis(pos, f, u, size, anim, pose, tint) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    const X = this._bx.set(f[0], f[1], f[2]).normalize(); const Y = this._by.set(u[0], u[1], u[2]);
    Y.addScaledVector(X, -Y.dot(X)).normalize(); const Z = this._bz.crossVectors(X, Y);
    this._m.makeBasis(X, Y, Z); this._m.scale(this._s.set(size, size, size)); this._m.setPosition(pos);
    this.mesh.setMatrixAt(i, this._m);
    this.iA.setXYZW(i, anim[0], anim[1], anim[2], anim[3]); this.iB.setXYZW(i, pose[0], pose[1], pose[2], pose[3]);
    if (tint !== undefined) { this._c.set(tint); this.mesh.setColorAt(i, this._c); }
    return i;
  }
  end(time) {
    this.mesh.count = this.count; this.uniforms.uTime.value = time;
    this.mesh.instanceMatrix.needsUpdate = true; this.iA.needsUpdate = true; this.iB.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
