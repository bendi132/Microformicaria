// Hangeffektek (WebAudio). Mind a három a játék közben szól (a főmenüben és a bevezetőben nem):
//  • járás  – folyamatos, vágatlan hurok: a kamera közelében mozgó hangyák száma és távolsága szabja a hangerejét
//  • peterakás – a királynő petézésekor (térbeli: távolodva halkul, a képernyő szélén oldalra tolódik)
//  • állkapocs-csattanás – amikor egy hangya elejti (megöli) a zsákmányt; a felvétel kicsit lehalkítva
//  • madár- és tücsökzaj – általános természeti háttér (assets/sfx/ambient.mp3); este/éjjel hangosabb, esőben halkabb, föld alatt tompább
// A fájlok: assets/sfx/*.wav  (a járás és a peterakás kódból generált: tools/gen_sfx.py)
import * as THREE from 'three';

const FILES = { walk: 'assets/sfx/walk.wav', lay: 'assets/sfx/lay.wav', snap: 'assets/sfx/snap.wav', crickets: 'assets/sfx/ambient.mp3' };
const WALK_LOOP = [0.55, 6.45];            // a hurok az elejének és végének csendje nélkül (lásd gen_sfx.py)
const SNAP_GAIN = 0.5;                      // "egy kicsit lehalkítva"
const REF = { walk: 30, lay: 22, snap: 30 };   // mm: ennél közelebb teljes hangerő

let ctx = null, bus = null, buffers = null, loading = null, vol = 0.6, running = false;
let walk = null, crickets = null, cur = { walk: 0, cr: 0 };
const _v = new THREE.Vector3();

export function setSfxVolume(v) { vol = Math.max(0, Math.min(1, v)); if (bus) bus.gain.setTargetAtTime(vol, ctx.currentTime, 0.05); }

function ensureCtx() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  try { ctx = new AC(); } catch { return false; }
  bus = ctx.createGain(); bus.gain.value = vol; bus.connect(ctx.destination);
  return true;
}
async function load() {
  if (buffers) return buffers;
  if (!loading) loading = (async () => {
    const out = {};
    await Promise.all(Object.entries(FILES).map(async ([k, url]) => {
      try { const r = await fetch(url); const a = await r.arrayBuffer(); out[k] = await new Promise((res, rej) => ctx.decodeAudioData(a, res, rej)); }
      catch (e) { console.warn('sfx', k, e); }
    }));
    buffers = out; return out;
  })();
  return loading;
}
// a böngésző csak felhasználói művelet után engedi a hangot: az első érintés/kattintás/billentyű felébreszti
function wake() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }
addEventListener('pointerdown', wake, { passive: true }); addEventListener('keydown', wake);

function loopSrc(buf, gainNode, start, end) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
  if (start !== undefined) { s.loopStart = start; s.loopEnd = end; }
  s.connect(gainNode); return s;
}

// a játék indulásakor
export async function sfxStart() {
  if (!ensureCtx()) return; wake(); const B = await load(); if (!ctx) return;
  sfxStop(true); running = true;
  if (B.walk) { const g = ctx.createGain(); g.gain.value = 0; g.connect(bus); const s = loopSrc(B.walk, g, WALK_LOOP[0], WALK_LOOP[1]); s.start(0, WALK_LOOP[0] + Math.random() * 2); walk = { s, g }; }
  if (B.crickets) { const g = ctx.createGain(); g.gain.value = 0; g.connect(bus); const s = loopSrc(B.crickets, g); s.start(0, Math.random() * 3); crickets = { s, g }; }
  cur = { walk: 0, cr: 0 };
}
// kilépéskor / új játék előtt
export function sfxStop(now) {
  running = false;
  for (const l of [walk, crickets]) { if (!l) continue; const { s, g } = l; try { g.gain.cancelScheduledValues(0); g.gain.setTargetAtTime(0, ctx.currentTime, now ? 0.01 : 0.25); s.stop(ctx.currentTime + (now ? 0.05 : 1.2)); } catch {} }
  walk = crickets = null;
}
export function sfxHush() { if (!running) return; const t = ctx.currentTime; walk && walk.g.gain.setTargetAtTime(0, t, 0.08); crickets && crickets.g.gain.setTargetAtTime(0, t, 0.15); cur.walk = cur.cr = 0; }

// távolság- és oldalirány-függő egyszeri hang
function spatial(e, cam, ref, gain, rate, underView) {
  if (!ctx || !buffers) return;
  _v.set(e.x, e.y || 0, e.z); const d = _v.distanceTo(cam.position);
  let g = gain / (1 + Math.pow(d / ref, 1.6));
  const ug = e.loc === 'nest' || e.y < -1.5; if (ug !== underView) g *= 0.3;           // a talaj elnyeli
  if (g < 0.004) return;
  cam.worldToLocal(_v); const pan = Math.max(-0.8, Math.min(0.8, _v.x / Math.max(8, d) * 1.6));
  const s = ctx.createBufferSource(); s.buffer = e.buf; s.playbackRate.value = rate;
  const gn = ctx.createGain(); gn.gain.value = g; let tail = gn;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; gn.connect(p); tail = p; }
  tail.connect(bus); s.start();
}

// minden képkockában (a játék futása közben)
export function sfxFrame(sim, o) {
  if (!running || !ctx || !buffers) return;
  const cam = o.cam, now = ctx.currentTime, ctlId = o.ctlId, under = !!o.underView;
  // ---- járás: a közeli, mozgó hangyák összege
  let sum = 0, speedAvg = 0, n = 0;
  for (const a of sim.ants) {
    if (a.dead || !(a.anim.mv > 0.2)) continue;
    _v.set(a.x, a.y || 0, a.z); const d = _v.distanceTo(cam.position);
    const own = a.id === ctlId; let w = own ? 1.5 : 1 / (1 + Math.pow(d / REF.walk, 1.7));
    const ug = a.loc === 'nest'; if (!own && ug !== under) w *= 0.3;
    if (a.caste === 'queen') w *= 0.8;
    sum += w * a.anim.mv; n++; speedAvg += own && sim.input.sprint ? 1.35 : 1;
  }
  const wt = (1 - Math.exp(-sum * 0.9)) * (o.speed > 1 ? 0.5 : 1) * 0.85;
  if (walk) { walk.g.gain.setTargetAtTime(wt, now, 0.09); const r = n ? speedAvg / n : 1; walk.s.playbackRate.setTargetAtTime(Math.min(1.5, r * (1 + 0.04 * (o.speed - 1))), now, 0.15); }
  // ---- tücsök: este hangosabb, esőben halkabb, föld alatt tompább
  const e = sim.env, nf = e.night ? 1 : (e.dusk || e.dawn) ? 0.65 : 0.12;
  const ct = (0.3 + 0.7 * nf) * (1 - 0.75 * (e.rain || 0)) * (under ? 0.22 : 1) * 0.55;
  if (crickets) crickets.g.gain.setTargetAtTime(ct, now, 0.5);
  // ---- események
  if (o.speed > 4) return;
  const B = buffers;
  for (const f of sim.fx) {
    if (f.type === 'kill' && B.snap) spatial({ x: f.x, y: f.y, z: f.z, loc: f.loc, buf: B.snap }, cam, REF.snap, SNAP_GAIN, 0.94 + Math.random() * 0.12, under);
    else if (f.type === 'lay' && B.lay) spatial({ x: f.x, y: f.y, z: f.z, loc: f.loc, buf: B.lay }, cam, REF.lay, 1, 1, under);
  }
}
window.__sfx = () => ({ ctx: ctx && ctx.state, running, bufs: buffers && Object.keys(buffers), walk: walk && +walk.g.gain.value.toFixed(3), cr: crickets && +crickets.g.gain.value.toFixed(3), vol });
