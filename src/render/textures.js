// Procedurális textúrák (nincs külső kép): talaj, kő, kéreg, moha. Albedo + normáltérkép egy magasságmezőből.
import * as THREE from 'three';
import { fbm } from '../core/util.js';

function heightCanvas(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size);
  return h;
}
function toTextures(size, h, colorFn, normStrength, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const img = g.createImageData(size, size);
  const n = document.createElement('canvas'); n.width = n.height = size; const gn = n.getContext('2d'); const imn = gn.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4; const v = at(x, y);
    const col = colorFn(v, x / size, y / size);
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    const dx = (at(x + 1, y) - at(x - 1, y)) * normStrength, dy = (at(x, y + 1) - at(x, y - 1)) * normStrength;
    const l = Math.hypot(dx, dy, 1);
    imn.data[i] = (-dx / l * 0.5 + 0.5) * 255; imn.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; imn.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; imn.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); gn.putImageData(imn, 0, 0);
  const map = new THREE.CanvasTexture(c), normalMap = new THREE.CanvasTexture(n);
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4; }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap };
}
// körkörösen ismétlődő zaj (hogy a csempézés ne látsszon)
function tile(u, v, f, seed) { const a = fbm(u * f, v * f, seed), b = fbm((u - 1) * f, v * f, seed), c = fbm(u * f, (v - 1) * f, seed), d = fbm((u - 1) * f, (v - 1) * f, seed); return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v; }

export function soilTextures(size = 256) {
  const h = heightCanvas(size, (u, v) => tile(u, v, 9, 3) * 0.6 + tile(u, v, 34, 8) * 0.3 + tile(u, v, 90, 15) * 0.25);
  return toTextures(size, h, (v, u, w) => {
    const t = Math.min(1, Math.max(0, (v - 0.2) / 0.9)); const grain = (Math.sin(u * 900) * Math.sin(w * 830)) * 4;
    return [60 + t * 70 + grain, 42 + t * 50 + grain, 28 + t * 34 + grain];
  }, 3.2, 26);
}
export function stoneTextures(size = 256) {
  const h = heightCanvas(size, (u, v) => tile(u, v, 6, 21) * 0.7 + tile(u, v, 30, 22) * 0.4 + tile(u, v, 80, 23) * 0.15);
  return toTextures(size, h, (v, u, w) => { const t = 0.5 + v * 0.5; const sp = tile(u, w, 60, 5) > 0.58 ? 25 : 0; return [108 * t + sp, 106 * t + sp, 100 * t + sp]; }, 2.4, 2);
}
export function barkTextures(size = 256) {
  const h = heightCanvas(size, (u, v) => { const r = tile(u * 0.25 + 0.0, v, 14, 31); return Math.abs(Math.sin(u * 40 + r * 8)) * 0.55 + tile(u, v, 50, 33) * 0.3; });
  return toTextures(size, h, (v, u, w) => { const t = 0.35 + v * 0.8; return [86 * t, 60 * t, 40 * t]; }, 4, 3);
}
export function rottenWoodTextures(size = 256) {
  const h = heightCanvas(size, (u, v) => Math.abs(Math.sin(u * 30 + tile(u, v, 10, 41) * 6)) * 0.5 + tile(u, v, 40, 43) * 0.4);
  return toTextures(size, h, (v, u, w) => { const t = 0.4 + v * 0.8; const m = tile(u, w, 12, 47); return [92 * t + m * 12, 70 * t + m * 22, 48 * t]; }, 3, 2);
}
export function mossTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4; const u = x / size, v = y / size; const n = tile(u, v, 28, 61) * 0.7 + tile(u, v, 70, 62) * 0.5;
    img.data[i] = 40 + n * 50; img.data[i + 1] = 80 + n * 90; img.data[i + 2] = 28 + n * 30; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function softDot(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return new THREE.CanvasTexture(c);
}
