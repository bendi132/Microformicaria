// Belépési pont: főmenü, fajválasztó, játékhurok, kamerák (szabad/felső/first person), bemenet, HUD, mentés.
import { initTouch, isTouchDevice } from './touch.js';
import * as THREE from 'three';
import { Sim } from './sim/sim.js';
import { SPECIES, TASK_HU, DIFFICULTY, CLIMATE } from './sim/config.js';
import { manualTargets } from './sim/tasks.js';
import { node } from './sim/nest.js';
import { heightAt } from './sim/world.js';
import { WorldView } from './render/worldview.js';
import { CreatureLayer } from './render/creatures.js';
import { EnvView } from './render/envview.js';
import { MenuScene } from './render/menu3d.js';
import { SPECIES_TEXT } from './ui/texts.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'mf.save1', SET_KEY = 'mf.settings';
// telefon / táblagép: alapból takarékos beállítások (alacsony minőség, árnyék nélkül, kisebb felbontás), mert a GPU és az akkumulátor szűkös
const MOBILE = isTouchDevice() && Math.min(screen.width, screen.height) < 1000;
const S = Object.assign({ quality: MOBILE ? 'low' : 'medium', shadow: MOBILE ? 0 : 1, scale: MOBILE ? 0.8 : 1, sens: 1, inv: 0, auto: 1, dyn: 1 }, (() => { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch { return {}; } })());
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(S)); } catch {} };

// ---------------------------------------------------------------- renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' }); renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = !!S.shadow; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
function resize() { const k = (G.dynScale || S.scale) * Math.min(window.devicePixelRatio, MOBILE ? 2 : 2); renderer.setPixelRatio(k); renderer.setSize(window.innerWidth, window.innerHeight, false); canvas.style.width = '100%'; canvas.style.height = '100%'; if (G.cam) { G.cam.aspect = innerWidth / innerHeight; G.cam.updateProjectionMatrix(); } }
const G = { mode: 'menu', sim: null, speed: 1, paused: false, nestView: false, sel: null, dig: false, fpv: false, cam: null, orbit: { x: 0, y: 0, z: 0, yaw: 0.6, pitch: 0.95, dist: 70 }, keys: {}, rmb: false };
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- képernyők
const screens = ['title', 'species', 'settings', 'hud', 'fpv', 'pause'];
function show(...names) { for (const s of screens) $(s).classList.toggle('on', names.includes(s)); }
const menu = new MenuScene(renderer);
let menuReady = menu.load().then(() => { $('loading').style.display = 'none'; });
const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } };
function refreshTitle() { $('bCont').disabled = !hasSave(); }

// ---------------------------------------------------------------- fajok
let spMode = 'new', spSel = 'ponera';
const ANTS = ['ponera', 'cephalotes', 'odonto', 'proceratium'], ALL = [...ANTS, 'isopod', 'spider', 'springtail'];
function openSpecies(mode) {
  spMode = mode; const list = mode === 'new' ? ANTS : ALL; if (!list.includes(spSel)) spSel = list[0];
  $('spList').innerHTML = ''; for (const id of list) { const t = SPECIES_TEXT[id]; const b = document.createElement('button'); b.dataset.id = id; b.innerHTML = `${t.name}<small>${t.group}</small>`; b.onclick = () => selectSpecies(id); $('spList').appendChild(b); }
  $('spStart').style.display = $('diffWrap').style.display = mode === 'new' ? '' : 'none'; show('species'); menu.setMode('stage', spSel); selectSpecies(spSel);
}
function selectSpecies(id) {
  spSel = id; const t = SPECIES_TEXT[id]; menu.setMode('stage', id);
  for (const b of $('spList').children) b.classList.toggle('on', b.dataset.id === id);
  const d = t.diff ? `<div class="dots" style="margin:6px 0">${[1, 2, 3].map((i) => `<i class="${i <= t.diff ? 'f' : ''}"></i>`).join('')} <span style="color:var(--dim);margin-left:6px">${t.diffName}</span></div>` : '';
  $('spInfo').innerHTML = `<h2>${t.name}</h2><div class="lat">${t.latin}</div>${SPECIES[id] ? `<span class="tag">${CLIMATE[SPECIES[id].climate].name} éghajlat</span>` : ''}${d}<p>${t.blurb}</p><p class="bio"><span class="tag">biológia</span>${t.bio}</p><p class="game"><span class="tag">játékbeli egyszerűsítés</span>${t.game}</p>`;
}
$('bNew').onclick = () => openSpecies('new'); $('bSpecies').onclick = () => openSpecies('all'); $('bSet').onclick = () => { G.back = 'title'; show('settings'); };
$('spBack').onclick = () => { menu.setMode('title'); show('title'); };
$('spStart').onclick = () => startGame({ species: spSel, difficulty: $('diffSel').value });
$('bCont').onclick = () => { try { startGame(null, Sim.deserialize(localStorage.getItem(SAVE_KEY))); } catch (e) { toast('A mentés nem tölthető be.'); } };
$('setBack').onclick = () => { saveSettings(); show(G.back === 'game' ? 'pause' : 'title'); };
$('pSet').onclick = () => { G.back = 'game'; show('settings'); };
function bindSettings() {
  const map = [['sQual', 'quality'], ['sShadow', 'shadow'], ['sScale', 'scale'], ['sSens', 'sens'], ['sInv', 'inv'], ['sAuto', 'auto'], ['sDyn', 'dyn']];
  for (const [id, key] of map) { const el = $(id); el.value = S[key]; el.onchange = el.oninput = () => { S[key] = typeof S[key] === 'number' ? parseFloat(el.value) : el.value; if (key === 'shadow') { renderer.shadowMap.enabled = !!S.shadow; if (G.view) G.view.sun.castShadow = !!S.shadow; } if (key === 'scale') resize(); saveSettings(); }; }
}
$('sScale').addEventListener('input', () => { G.dynScale = null; resize(); }); $('sDyn').addEventListener('change', () => { G.dynScale = null; resize(); });
// teljes képernyő (Android / asztali böngésző; iPhone Safari nem támogatja): fekvő tájolásra is kérünk zárat
if (document.fullscreenEnabled) { $('bFull').style.display = ''; $('bFull').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); try { await screen.orientation.lock('landscape'); } catch {} } } catch {} }; }
bindSettings();

// ---------------------------------------------------------------- játék indítása
async function startGame(opts, loaded) {
  $('loading').style.display = 'flex'; await new Promise((r) => setTimeout(r, 30));
  disposeGame();
  const sim = loaded || new Sim({ species: opts.species, difficulty: opts.difficulty, seed: (Math.random() * 1e6) | 0 }); G.sim = sim;
  G.scene = new THREE.Scene(); G.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 16000);
  G.view = new WorldView(G.scene, renderer, S.quality); G.view.sun.castShadow = !!S.shadow; G.view.build(sim);
  G.layer = new CreatureLayer(G.scene); await G.layer.load(sim.speciesId);
  G.env = new EnvView(G.scene, renderer, SPECIES[sim.speciesId].climate, sim.seed, MOBILE || S.quality === 'low'); G.env.build().catch((e) => console.warn('env', e));
  const q = sim.queen; G.orbit.x = q ? q.x : 0; G.orbit.z = q ? q.z : 0; G.orbit.y = 0; G.orbit.dist = 55; G.orbit.pitch = 0.95; G.follow = true; setFollowBtn();
  G.mode = 'game'; G.speed = 1; G.paused = false; G.nestView = false; G.sel = q ? { kind: 'ant', id: q.id } : null; G.fpv = false; G.logIdx = sim.logs.length; G.autoT = 0; G.over = false;
  buildDirs(sim); setSpeed(1); show('hud'); $('loading').style.display = 'none'; $('bNestV').classList.remove('on'); resize();
}
function disposeGame() { if (G.env) { G.env.dispose(); G.env = null; } if (G.view) { G.view.dispose(); } if (G.layer) G.scene.remove(G.layer.group); G.view = G.layer = G.scene = null; }
function quitToMenu() { if (G.fpv) exitFpv(); disposeGame(); G.mode = 'menu'; G.sim = null; menu.setMode('title'); refreshTitle(); show('title'); }

// ---------------------------------------------------------------- HUD
function buildDirs(sim) {
  const sp = SPECIES[sim.speciesId]; const defs = [['hunt', sp.hunt.eggs ? '🥚' : '🎯', 2], ['forage', '🍯', 2], ['water', '💧', 2], ['nurse', '🐛', 2], ['dig', '⛏', 2], ['guard', '🛡', 2], ['caution', '⚠', 1]];
  $('dirs').innerHTML = defs.map(([k, ic, mx]) => `<div class="dirrow"><span class="ic">${ic}</span><input type="range" min="0" max="${mx}" step="0.05" value="${sim.colony.dir[k]}" data-k="${k}"></div>`).join('');
  for (const el of $('dirs').querySelectorAll('input')) el.oninput = () => { sim.colony.dir[el.dataset.k] = parseFloat(el.value); };
}
function setSpeed(k) { G.speed = k; G.paused = false; for (const [id, v] of [['bS1', 1], ['bS2', 2], ['bS4', 4], ['bS8', 8]]) $(id).classList.toggle('on', v === k); $('bPause').classList.remove('on'); }
$('bS1').onclick = () => setSpeed(1); $('bS2').onclick = () => setSpeed(2); $('bS4').onclick = () => setSpeed(4); $('bS8').onclick = () => setSpeed(8);
$('bPause').onclick = () => { G.paused = !G.paused; $('bPause').classList.toggle('on', G.paused); };
$('bTop').onclick = () => { G.orbit.pitch = 1.5; G.orbit.yaw = 0; };
$('bFollow').onclick = () => { G.follow = !G.follow; setFollowBtn(); };
function setFollowBtn() { $('bFollow').classList.toggle('on', !!G.follow); }
$('bNestV').onclick = () => toggleNest();
function toggleNest() { G.autoNestOn = false; G.nestView = !G.nestView; $('bNestV').classList.toggle('on', G.nestView); const n = G.sim && G.sim.nest; if (G.nestView && n) { const f = G.sel && selEntity(); if (!(f && f.loc === 'nest')) { const e = n.nodes[Math.min(2, n.nodes.length - 1)]; G.orbit.x = e.x; G.orbit.z = e.z; G.follow = false; setFollowBtn(); G.orbit.dist = Math.min(G.orbit.dist, 36); } } }
$('bDig').onclick = () => { G.dig = !G.dig; $('bDig').classList.toggle('on', G.dig); $('digOpts').style.display = G.dig ? '' : 'none'; if (G.dig && !G.nestView) toggleNest(); };
$('bSave').onclick = () => saveGame(true); $('pSave').onclick = () => saveGame(true);
$('bMenu').onclick = () => { G.back = 'game'; show('pause'); G.paused = true; }; $('pResume').onclick = () => { show('hud'); G.paused = false; }; $('pQuit').onclick = () => { saveGame(false); quitToMenu(); };
$('bPoss').onclick = () => enterFpv();
function saveGame(msg) { if (!G.sim || G.sim.over) return; try { localStorage.setItem(SAVE_KEY, G.sim.serialize()); if (msg) toast('Mentve', 1200, true); } catch (e) { toast('A mentés nem sikerült.'); } }
let toastT = 0; function toast(t, ms = 6000, soft) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; el.style.background = soft ? 'rgba(40,70,30,.9)' : 'rgba(120,20,10,.92)'; clearTimeout(toastT); toastT = setTimeout(() => { el.style.display = 'none'; }, ms); }
const pct = (v) => Math.max(0, Math.min(100, v)) + '%';
const WX = { clear: '☀', cloud: '☁', rain: '🌧', heat: '🔥', cold: '❄' };
function selEntity() { const s = G.sel; if (!s || !G.sim) return null; const sim = G.sim; const L = { ant: sim.ants, spider: sim.spiders, isopod: sim.isopods, springtail: sim.springtails }[s.kind]; return L && L.find((e) => e.id === s.id && !e.dead) || null; }
function updateHud() {
  const sim = G.sim, e = sim.env; const hh = Math.floor(e.hour), mm = Math.floor((e.hour % 1) * 60);
  const fc = e.forecast ? ` → ${WX[e.forecast.type] || ''}` : '';
  $('hClock').textContent = `Nap ${e.day + 1} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; $('hWx').textContent = (e.night ? '🌙' : WX[e.weather] || '☀') + fc + ` ${Math.round(e.temp)}°`;
  const q = sim.queen; if (q) { $('qE').style.width = pct(q.energy); $('qH').style.width = pct(q.hyd); $('qL').style.width = pct(q.hp / q.maxHp * 100); } else { $('qE').style.width = $('qH').style.width = $('qL').style.width = '0%'; }
  const wk = sim.ants.filter((a) => !a.dead && a.caste !== 'queen').length; const cnt = (s) => sim.brood.filter((b) => b.stage === s).length;
  $('hWork').textContent = `🐜 ${wk}`; $('hBrood').textContent = `🥚${cnt('egg')} 🐛${cnt('larva')} 🫘${cnt('pupa')}`;
  const n = sim.nest; if (n) { const ch = n.nodes.filter((x) => x.kind === 'chamber' && x.role === 'brood'); const c0 = ch[0]; $('hClim').textContent = c0 ? `🌡${Math.round(c0.temp)}° 💧${Math.round(c0.hum * 100)}%` : '🌡 – 💧 –'; }
  const st = sim.colony.store, cap = 40; $('sP').style.width = pct(st.prey / cap * 100); $('sS').style.width = pct(st.sugar / cap * 100); $('sW').style.width = pct(st.water / cap * 100);
  document.getElementById('vig').style.boxShadow = `inset 0 0 170px 45px rgba(210,20,10,${Math.min(0.55, sim.surfaceDanger * 0.6 + (sim.threatNearNest ? 0.1 : 0))})`;
  // kijelölés
  const en = selEntity(); const box = $('sel'); $('bPoss').disabled = !(en && G.sel.kind === 'ant');
  if (!en) { box.style.display = 'none'; return; } box.style.display = 'block';
  if (G.sel.kind === 'ant') { const carry = en.carry ? { prey: '🍖', sugar: '🍯', water: '💧', eggs: '🥚', soil: '🟤', brood: '🥚' }[en.carry.kind] || '' : '';
    box.innerHTML = `<div style="display:flex;justify-content:space-between"><b>${en.caste === 'queen' ? '👑 Királynő' : en.caste === 'soldier' ? '🛡 Katona' : '🐜 Dolgozó'}</b><span>${carry}</span></div><div style="color:var(--dim);margin:3px 0">${TASK_HU[en.task] || en.task}</div>
    <div class="row"><span class="ic">⚡</span><div class="bar"><i style="width:${pct(en.energy)}"></i></div></div><div class="row"><span class="ic">💧</span><div class="bar"><i style="width:${pct(en.hyd)};background:var(--water)"></i></div></div><div class="row"><span class="ic">♥</span><div class="bar"><i style="width:${pct(en.hp / en.maxHp * 100)};background:var(--bad)"></i></div></div>`;
  } else { const ic = { spider: '🕷', isopod: '🪲', springtail: '🦗' }[G.sel.kind]; box.innerHTML = `<b>${ic} ${SPECIES_TEXT[G.sel.kind].name}</b><div style="color:var(--dim)">${en.len.toFixed(1)} mm${en.dead ? ' · elpusztult' : ''}</div><div class="row"><span class="ic">♥</span><div class="bar"><i style="width:${pct((en.hp / (en.maxHp || 1)) * 100)};background:var(--bad)"></i></div></div>`; }
  // csak kritikus események jelennek meg szövegesen
  while (G.logIdx < sim.logs.length) { const l = sim.logs[G.logIdx++]; if (l && l.level === 'critical') toast(l.text); }
  if (sim.over && !G.over) { G.over = true; G.paused = true; show('pause'); }
}
function updateFpvHud() {
  const sim = G.sim, a = sim.controlTarget(); if (!a) return; $('fE').style.width = pct(a.energy); $('fH').style.width = pct(a.hyd); $('fL').style.width = pct(a.hp / a.maxHp * 100);
  const od = SPECIES[sim.speciesId].id === 'odonto'; $('fMand').style.display = od ? '' : 'none'; $('fM').style.width = pct(a.mand * 100); $('kJ').style.display = od ? '' : 'none'; $('kR').textContent = TOUCH ? (od ? '⌃' : '⌄') : (od ? 'RMB ⌃' : 'RMB ⌄');
  $('fCarry').textContent = a.carry ? { prey: '🍖', sugar: '🍯', water: '💧', eggs: '🥚', soil: '🟤', brood: '🥚' }[a.carry.kind] || '' : '';
  let cls = ''; const tg = a.loc !== 'nest' ? manualTargets(sim, a, Math.max(SPECIES[sim.speciesId].hunt.reach * a.len * 1.4, 3.2)) : [];
  if (tg.length) { const k = tg[0]; cls = k.kind === 'spider' ? 'enemy' : k.kind === 'clutch' ? 'egg' : k.p.dead ? 'src' : 'prey'; }
  else { const ur = Math.max(3.4, a.len * 0.75 + 1.5); for (const d of sim.world.droplets) if (Math.hypot(d.x - a.x, d.z - a.z) < ur) { cls = 'src'; break; } if (!cls) for (const f of sim.world.foods) if (f.limb === undefined && Math.hypot(f.x - a.x, f.z - a.z) < ur) { cls = 'src'; break; } }
  $('cross').className = 'cross ' + cls;
  if (sim.note) { toast(sim.note === 'noDig' ? 'Ez a faj nem ás a talajban' : 'Előbb fészek kell az ásáshoz', 2500); sim.note = null; }
}

// ---------------------------------------------------------------- first person
function enterFpv() {
  const en = selEntity(); if (!en || G.sel.kind !== 'ant') return; if (!G.sim.possess(en.id)) return;
  G.fpv = true; show('fpv'); G.fpvPos = null; G.cam.fov = 78; G.cam.near = 0.03; G.cam.updateProjectionMatrix(); canvas.requestPointerLock && canvas.requestPointerLock();
}
function exitFpv() { if (!G.fpv) return; G.topNest = false; $('cross').style.display = ''; G.sim && G.sim.release(); G.fpv = false; G.cam.fov = 50; G.cam.near = 0.05; G.cam.updateProjectionMatrix(); if (document.pointerLockElement) document.exitPointerLock(); show('hud'); const a = G.sel && selEntity(); if (a) { G.orbit.x = a.x; G.orbit.z = a.z; } $('click').style.display = 'none'; }
document.addEventListener('pointerlockchange', () => { if (G.fpv && !G.topNest) $('click').style.display = document.pointerLockElement ? 'none' : 'block'; });
const fv = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3() };
function placeFpvCam(a, dt) {
  const f = [0, 0, 1], up = [0, 1, 0]; G.layer.antFrame(G.sim, a, f, up);
  const fl = Math.hypot(...f) || 1; f[0] /= fl; f[1] /= fl; f[2] /= fl; const d = f[0] * up[0] + f[1] * up[1] + f[2] * up[2]; f[0] -= up[0] * d; f[1] -= up[1] * d; f[2] -= up[2] * d; const l2 = Math.hypot(...f) || 1; f[0] /= l2; f[1] /= l2; f[2] /= l2;
  const h = a.len * 0.34, fw = a.len * 0.34; const P = fv.p.set(a.x + up[0] * h + f[0] * fw, a.y + up[1] * h + f[1] * fw, a.z + up[2] * h + f[2] * fw);
  if (!G.fpvPos) G.fpvPos = P.clone(); else G.fpvPos.lerp(P, Math.min(1, dt * 18));
  const an = a.anim || {}; const pl = (a.pitchLook || 0) - 0.5 * (an.feedS || 0) - (an.act === 3 && a.loc === 'ground' ? 0.35 : 0), c = Math.cos(pl), s = Math.sin(pl);   // evés / ásás közben a nézet lehajlik
  fv.t.set(G.fpvPos.x + f[0] * c + up[0] * s, G.fpvPos.y + f[1] * c + up[1] * s, G.fpvPos.z + f[2] * c + up[2] * s);
  G.cam.position.copy(G.fpvPos); G.cam.up.set(up[0], up[1], up[2]); G.cam.lookAt(fv.t);
}
// ---- föld alatti felülnézet: belépéskor a fészekbe automatikusan átvált; a hangya továbbra is a játékos irányítása alatt áll
G.nestCam = { yaw: 0, pitch: 1.38, dist: 24 }; G.nestT = new THREE.Vector3();
function setTopNest(on) {
  G.topNest = on; G.fpvPos = null; $('cross').style.display = on ? 'none' : '';
  if (on) { if (document.pointerLockElement) document.exitPointerLock(); $('click').style.display = 'none'; G.cam.fov = 46; G.cam.near = 0.05; G.nestT.set(0, 0, 0); G.nestFresh = true; }
  else if (G.fpv) { G.cam.fov = 78; G.cam.near = 0.03; $('click').style.display = document.pointerLockElement ? 'none' : 'block'; }
  G.cam.updateProjectionMatrix();
}
function nestInput(a, inp, dt) {
  const k = G.keys, dx = (k.d ? 1 : 0) - (k.a ? 1 : 0), dz = (k.s ? 1 : 0) - (k.w ? 1 : 0); inp.strafe = 0; inp.sprint = !!k.shift;
  if (!dx && !dz) { inp.fwd = 0; return; }
  const sy = Math.sin(G.nestCam.yaw), cy = Math.cos(G.nestCam.yaw); const wx = dx * cy + dz * sy, wz = -dx * sy + dz * cy, l = Math.hypot(wx, wz) || 1;
  const want = Math.atan2(wx, wz); let diff = ((want - (a.yaw || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI; inp.yawD = diff * Math.min(1, dt * 12);
  const n = G.sim.nest;
  if (a.nseg && n) { const A = n.nodes.find((q) => q.id === a.nseg.from), B = n.nodes.find((q) => q.id === a.nseg.to); if (A && B) { const sx = B.x - A.x, sz = B.z - A.z, sl = Math.hypot(sx, sz) || 1; inp.fwd = (wx / l) * (sx / sl) + (wz / l) * (sz / sl) >= -0.05 ? 1 : -1; return; } }
  inp.fwd = 1;
}
function placeNestCam(a, dt) {
  const o = G.nestCam, t = G.nestT; if (G.nestFresh) { t.set(a.x, a.y, a.z); G.nestFresh = false; } else t.lerp(fv.p.set(a.x, a.y, a.z), Math.min(1, dt * 6));
  o.pitch = Math.max(0.6, Math.min(1.5, o.pitch)); o.dist = Math.max(8, Math.min(80, o.dist)); const cp = Math.cos(o.pitch) * o.dist;
  G.cam.position.set(t.x + Math.sin(o.yaw) * cp, t.y + Math.sin(o.pitch) * o.dist, t.z + Math.cos(o.yaw) * cp); G.cam.up.set(0, 1, 0); G.cam.lookAt(t);
}
function placeOrbitCam(dt) {
  const o = G.orbit; const f = G.sel && selEntity(); if (G.follow && f) { o.x += (f.x - o.x) * Math.min(1, dt * 4); o.z += (f.z - o.z) * Math.min(1, dt * 4); }
  const sp = (o.dist * 0.9) * dt; const kx = (G.keys.d ? 1 : 0) - (G.keys.a ? 1 : 0), kz = (G.keys.s ? 1 : 0) - (G.keys.w ? 1 : 0);
  if (kx || kz) { G.follow = false; const sy = Math.sin(o.yaw), cy = Math.cos(o.yaw); o.x += (kx * cy + kz * sy) * sp; o.z += (-kx * sy + kz * cy) * sp; }
  const lim = G.sim.world.half + 10; o.x = Math.max(-lim, Math.min(lim, o.x)); o.z = Math.max(-lim, Math.min(lim, o.z)); o.pitch = Math.max(0.12, Math.min(1.55, o.pitch)); o.dist = Math.max(4, Math.min(260, o.dist));
  const gy = heightAt(G.sim.world, Math.max(-90, Math.min(90, o.x)), Math.max(-90, Math.min(90, o.z))); const nn = G.sim.nest; const ncy = nn && nn.site.kind === 'cavity' ? nn.nodes.reduce((s, q) => s + q.y, 0) / nn.nodes.length : -6; const under = G.nestView && f && f.loc === 'nest' ? f.y : ncy; o.y += ((G.nestView ? under : gy) - o.y) * Math.min(1, dt * 5);
  const cp = Math.cos(o.pitch) * o.dist; G.cam.position.set(o.x + Math.sin(o.yaw) * cp, o.y + Math.sin(o.pitch) * o.dist, o.z + Math.cos(o.yaw) * cp); G.cam.up.set(0, 1, 0); G.cam.lookAt(o.x, o.y, o.z);
  G.cam.near = Math.max(0.05, o.dist * 0.02);
  if (G.cam.position.y < gy + 0.6 && !G.nestView) G.cam.position.y = gy + 0.6;
  G.cam.updateProjectionMatrix();
}

// ---------------------------------------------------------------- bemenet
const KEYMAP = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd', ShiftLeft: 'shift', ShiftRight: 'shift', Space: 'space' };
window.addEventListener('keydown', (e) => {
  if (G.mode !== 'game' || e.target.tagName === 'SELECT') return; const k = KEYMAP[e.code]; if (k) { G.keys[k] = true; if (k === 'space' && G.fpv) { G.sim.input.jump = true; e.preventDefault(); } }
  if (G.fpv) { const inp = G.sim.input; if (e.code === 'KeyE') { inp.use = true; inp.useHold = true; } else if (e.code === 'KeyF') { if (!e.repeat) inp.climb = true; } else if (e.code === 'KeyG') inp.drop = true; else if (e.code === 'KeyX') { inp.digSurf = true; if (G.topNest) inp.dig = true; } else if (e.code === 'KeyQ' || e.code === 'Tab') { exitFpv(); e.preventDefault(); } return; }
  if ((e.code === 'KeyE' || e.code === 'KeyX') && G.sel && G.sel.kind === 'ant' && !G.dig) { enterFpv(); if (G.fpv) { const inp = G.sim.input; if (e.code === 'KeyE') { inp.use = true; inp.useHold = true; } else inp.digSurf = true; } e.preventDefault(); return; }
  if (e.code === 'KeyP' && G.view) { G.view.pheroOn = !G.view.pheroOn; e.preventDefault(); return; }
  if (e.code === 'KeyT') $('bTop').click(); else if (e.code === 'KeyN') toggleNest(); else if (e.code === 'KeyF') enterFpv(); else if (e.code === 'Space') { $('bPause').click(); e.preventDefault(); }
  else if (e.code === 'Escape') { if (G.dig) $('bDig').click(); else { show('pause'); G.paused = true; } } else if (e.code === 'KeyC') { G.follow = !G.follow; setFollowBtn(); }
  else if (e.code.startsWith('Digit')) { const v = { 1: 1, 2: 2, 3: 4, 4: 8 }[e.code.slice(5)]; if (v) setSpeed(v); }
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) G.keys[k] = false; if (G.fpv && e.code === 'KeyE') G.sim.input.useHold = false; if (G.fpv && e.code === 'KeyX') { G.sim.input.digSurf = false; if (G.topNest) G.sim.input.dig = false; } });
document.querySelectorAll('#fpv .key.kb').forEach((el) => {
  const k = el.dataset.k, press = (on) => { if (!G.fpv || !G.sim) return; const inp = G.sim.input;
    if (k === 'B') { if (on) inp.act1 = true; } else if (k === 'A') inp.act2 = on; else if (k === 'J') { if (on) inp.jump = true; } else if (k === 'Q') { if (on) exitFpv(); }
    else if (k === 'E') { inp.use = on; inp.useHold = on; } else if (k === 'X') { inp.digSurf = on; if (G.topNest) inp.dig = on; } else if (k === 'F') { if (on) inp.climb = true; } else if (k === 'G') { if (on) inp.drop = true; } };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); press(true); }); el.addEventListener('pointerup', () => press(false)); el.addEventListener('pointerleave', () => press(false));
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
let drag = null;
canvas.addEventListener('mousedown', (e) => {
  if (G.mode !== 'game') return;
  if (G.fpv && G.topNest) { if (e.button === 0) G.sim.input.dig = true; drag = { x: e.clientX, y: e.clientY, b: e.button, moved: 0, nest: true }; return; }
  if (G.fpv) { if (!document.pointerLockElement) { canvas.requestPointerLock(); return; } if (e.button === 0) G.sim.input.act1 = true; if (e.button === 2) G.sim.input.act2 = true; return; }
  drag = { x: e.clientX, y: e.clientY, b: e.button, moved: 0 };
});
window.addEventListener('mouseup', (e) => {
  if (G.fpv && G.topNest) { if (e.button === 0 && G.sim) G.sim.input.dig = false; drag = null; return; }
  if (G.fpv) { if (e.button === 2 && G.sim) G.sim.input.act2 = false; return; }
  if (!drag) return; const d = drag; drag = null; if (d.b === 0 && d.moved < 5 && G.mode === 'game') click(e.clientX, e.clientY);
});
window.addEventListener('mousemove', (e) => {
  if (G.fpv && document.pointerLockElement) { const s = 0.0024 * S.sens, inp = G.sim.input; inp.yawD -= e.movementX * s; inp.pitchD += (S.inv ? 1 : -1) * e.movementY * s; return; }
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  if (drag.nest) { G.nestCam.yaw -= dx * 0.006; G.nestCam.pitch += dy * 0.005; return; }
  if (drag.b === 2) { G.orbit.yaw -= dx * 0.006; G.orbit.pitch += dy * 0.005; }          // jobb gomb: forgatás
  else if (drag.b === 0 || drag.b === 1) {                                                     // bal (vagy középső) gomb: mozgatás a térképen
    const sp = G.orbit.dist * 0.002, sy = Math.sin(G.orbit.yaw), cy = Math.cos(G.orbit.yaw);
    G.orbit.x -= (dx * cy - dy * sy) * sp; G.orbit.z -= (-dx * sy - dy * cy) * sp; G.follow = false; setFollowBtn();
  }
});
canvas.addEventListener('wheel', (e) => { if (G.mode !== 'game') return; if (G.fpv && !G.topNest) return; if (G.topNest) { G.nestCam.dist *= Math.exp(e.deltaY * 0.0011); e.preventDefault(); return; } G.orbit.dist *= Math.exp(e.deltaY * 0.0011); e.preventDefault(); }, { passive: false });
canvas.addEventListener('dblclick', () => { if (G.mode === 'game' && !G.fpv && G.sel && G.sel.kind === 'ant') enterFpv(); });
const ray = new THREE.Raycaster(), v3 = new THREE.Vector3();
function click(cx, cy) {
  const sim = G.sim; const W = innerWidth, H = innerHeight;
  if (G.dig) {
    ray.setFromCamera({ x: (cx / W) * 2 - 1, y: -(cy / H) * 2 + 1 }, G.cam); const hit = ray.intersectObject(G.view.terrain)[0]; if (!hit || !sim.nest) return;
    const depth = parseFloat($('digDepth').value); const from = sim.nest.nodes.filter((n) => n.ready !== false && n.kind !== 'entrance' || n.kind === 'entrance').sort((a, b) => Math.hypot(a.x - hit.point.x, a.z - hit.point.z) - Math.hypot(b.x - hit.point.x, b.z - hit.point.z))[0];
    const r = sim.addDig(from.id, { x: hit.point.x, y: depth, z: hit.point.z }, $('digRole').value); if (r && r.error) toast(r.error, 3000); else { G.dig = false; $('bDig').classList.remove('on'); $('digOpts').style.display = 'none'; } return;
  }
  let best = null, bd = 28 * 28;
  const test = (kind, e, hgt) => { v3.set(e.x, (e.y || heightAt(sim.world, e.x, e.z)) + hgt, e.z).project(G.cam); if (v3.z > 1) return; const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H; const d = (sx - cx) ** 2 + (sy - cy) ** 2; if (d < bd) { bd = d; best = { kind, id: e.id }; } };
  for (const a of sim.ants) if (!a.dead && (a.loc !== 'nest' || G.nestView)) test('ant', a, a.len * 0.2);
  for (const s of sim.spiders) if (!s.dead && s.state !== 'lair') test('spider', s, s.len * 0.2);
  for (const p of sim.isopods) if (p.state !== 'hidden') test('isopod', p, p.len * 0.2);
  for (const p of sim.springtails) test('springtail', p, p.len * 0.2);
  const cur = G.sel && G.sel.kind === 'ant' ? sim.ants.find((q) => q.id === G.sel.id && !q.dead) : null;
  if (cur && best && (best.kind === 'isopod' || best.kind === 'springtail') && sim.order(cur.id, best.kind, best.id)) { G.orderMark = { kind: best.kind, id: best.id, t: performance.now() }; toast('🎯', 900, true); return; }
  G.sel = best; if (best && best.kind === 'ant') { const a = selEntity(); if (a) { G.orbit.x = a.x; G.orbit.z = a.z; } }
}
const touchCtl = initTouch({ G, canvas, S, click, enterFpv, setFollowBtn }); const TOUCH = document.body.classList.contains('touch'); if (TOUCH) $('kL').textContent = '🦷';
// figyelmeztető nyilak a közeli pókokra
const ind = $('ind'); const arrows = [];
function updateHome(a) {
  const el = $('home'); const sim = G.sim; if (!a || !sim.nest) { el.style.display = 'none'; return; } const e = sim.nest.nodes[sim.nest.entranceId] || sim.nest.nodes[0]; const inNest = a.loc === 'nest'; const gy = e.y !== undefined ? e.y : heightAt(sim.world, e.x, e.z);
  const d = Math.hypot(e.x - a.x, e.z - a.z); if (!inNest && d < 8) { el.style.display = 'none'; return; }
  v3.set(e.x, gy + (inNest ? 0.5 : 1), e.z).project(G.cam); let x = v3.x, y = v3.y; if (v3.z > 1) { x = -x; y = -y; } const on = v3.z <= 1 && Math.abs(x) < 0.9 && Math.abs(y) < 0.85; if (!on) { const m = Math.max(Math.abs(x), Math.abs(y), 1e-3); x *= 0.88 / m; y *= 0.82 / m; }
  el.style.display = 'block'; el.style.left = ((x * 0.5 + 0.5) * innerWidth) + 'px'; el.style.top = ((-y * 0.5 + 0.5) * innerHeight) + 'px'; el.style.opacity = on ? 0.9 : 0.7;
}
function updateArrows(a0) {
  const sim = G.sim; const list = []; if (a0) for (const s of sim.spiders) { if (s.dead || s.state === 'lair') continue; const d = Math.hypot(s.x - a0.x, s.z - a0.z); if (d < 60) list.push([s, d]); }
  while (arrows.length < list.length) { const b = document.createElement('b'); b.textContent = '▲'; ind.appendChild(b); arrows.push(b); }
  arrows.forEach((b, i) => {
    if (i >= list.length) { b.style.display = 'none'; return; } const [s, d] = list[i]; v3.set(s.x, heightAt(sim.world, s.x, s.z) + s.len * 0.3, s.z).project(G.cam); let x = v3.x, y = v3.y; const behind = v3.z > 1; if (behind) { x = -x; y = -y; }
    const on = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.9; if (on && !G.fpv) { b.style.display = 'none'; return; } const m = Math.max(Math.abs(x), Math.abs(y), 1e-3); const k = on ? 1 : 0.9 / m; x *= k; y *= k;
    b.style.display = 'block'; b.style.left = ((x * 0.5 + 0.5) * innerWidth) + 'px'; b.style.top = ((-y * 0.5 + 0.5) * innerHeight) + 'px'; b.style.opacity = Math.max(0.25, 1 - d / 60); b.style.transform = `rotate(${on ? 180 : Math.atan2(x, y) * 180 / Math.PI}deg)`;
  });
}

// ---------------------------------------------------------------- hurok
let last = performance.now(), hudT = 0;
let fAcc = 0, fN = 0;
function dynRes(raw) {   // dinamikus felbontás: ha a képkockaidő tartósan magas, a belső felbontás csökken (és vissza nő, ha van tartalék)
  if (!S.dyn || raw > 1.5 || document.hidden) return; fAcc += raw; fN++; if (fAcc < 1.6) return; const avg = fAcc / fN; fAcc = 0; fN = 0; const top = S.scale, cur = G.dynScale || top;
  let nx = cur; if (avg > 0.036) nx = Math.max(0.4, cur * 0.86); else if (avg < 0.021 && cur < top) nx = Math.min(top, cur * 1.07);
  if (Math.abs(nx - cur) > 0.01) { G.dynScale = nx; resize(); }
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); dynRes((now - last) / 1000); last = now; requestAnimationFrame(frame);
  if (G.mode === 'menu') { menu.render(dt); return; }
  const sim = G.sim; if (!sim || !G.view) return;
  touchCtl.tick();
  if (!G.paused) {
    if (G.fpv) { const k = G.keys, inp = sim.input; const c0 = sim.controlTarget();
      if (c0 && c0.loc === 'nest') nestInput(c0, inp, dt);          // föld alatt felülnézet: a billentyűk a képernyő irányait jelentik
      else { inp.fwd = (k.w ? 1 : 0) - (k.s ? 1 : 0); inp.strafe = (k.a ? 1 : 0) - (k.d ? 1 : 0); inp.sprint = !!k.shift; if (G.joy.on) { inp.fwd = G.joy.y; inp.strafe = -G.joy.x; inp.sprint = G.joy.sprint; } } }
    sim.advance(dt, G.speed); if (G.fpv && !sim.player.active) exitFpv();
  }
  const ctl = G.fpv ? sim.controlTarget() : null; const under = !!ctl && ctl.loc === 'nest';
  G.view.update(dt, sim, G.nestView || under); if (G.env) G.env.group.visible = !(G.nestView || under);
  { const fx = ctl ? ctl.x : G.orbit.x, fz = ctl ? ctl.z : G.orbit.z; G.view.uniforms.uFocus.value.set(fx, fz, ctl ? 3.5 : Math.min(60, 8 + G.orbit.dist * 0.3)); }
  { const sa = !G.fpv && G.sel && G.sel.kind === 'ant' ? selEntity() : null;
    if (sa && sa.loc === 'nest') { if (G.autoNestId !== sa.id) { G.autoNestId = sa.id; if (!G.nestView) { toggleNest(); G.autoNestOn = true; } G.orbit.pitch = 1.5; G.orbit.dist = 22; G.follow = true; setFollowBtn(); } }
    else if (G.autoNestOn && G.nestView) { G.autoNestOn = false; G.autoNestId = null; toggleNest(); if (sa) { G.orbit.pitch = 0.85; G.orbit.dist = 18; G.follow = true; setFollowBtn(); } } }
  if (G.nestView || under) { G.scene.background.set(0x1c130c); G.scene.fog.color.set(0x1c130c); G.scene.fog.near = 60; G.scene.fog.far = 420; G.view.hemi.intensity = 1.5; G.view.sun.intensity = 0.9; }
  if (under !== !!G.topNest) setTopNest(under);
  G.layer.update(sim, performance.now() / 1000, G.nestView || under, G.cam.position, under ? null : ctl);
  if (G.fpv && ctl && under) placeNestCam(ctl, dt); else if (G.fpv && ctl) placeFpvCam(ctl, dt); else placeOrbitCam(dt);
  if (G.fpv) updateHome(ctl); else $('home').style.display = 'none';
  // kijelölés-gyűrű
  hudT += dt; if (hudT > 0.2) { hudT = 0; if (G.fpv) { updateFpvHud(); } else updateHud(); const foc = ctl || sim.queen || null; updateArrows(foc); }
  sim.fx.length = 0;
  G.autoT += dt; if (S.auto && G.autoT > 60) { G.autoT = 0; saveGame(false); }
  renderer.render(G.scene, G.cam);
}
resize(); refreshTitle(); requestAnimationFrame(frame);
window.__G = G; window.__startGame = startGame;
