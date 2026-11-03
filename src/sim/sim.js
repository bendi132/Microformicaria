// A szimuláció gyökere: idő, időjárás, világ, fészek, hangyák, ászkák, ugróvillások, pókok, tojáscsomók.
// A megjelenítéstől teljesen független (Node-ban is fut), és teljes egészében menthető/betölthető.
import { RNG } from '../core/rng.js';
import { clamp, dist } from '../core/util.js';
import { SPECIES, DIFFICULTY, DAY, GAME_START_HOUR, SPIDER, ISOPOD, CLIMATE } from './config.js';
import { createWorld, stepWorld, newDew, moistureAt, heightAt, limbPoint } from './world.js';
import { createNest, addDigJob, updateClimate, node, chambers } from './nest.js';
import { makeAnt } from './entities.js';
import { initColony, colonyNeeds, stepBrood, queen, workers, storeCap } from './colony.js';
import { updateAnt, entrancePos } from './ant.js';
import { updateIsopod } from './isopod.js';
import { updateSpringtail } from './springtail.js';
import { updateSpider } from './spider.js';
import { initEcology, stepEcology } from './ecology.js';
import { placeAnt, placeInNode } from './motion.js';

export const SAVE_VERSION = 3;
const H = 0.1;                                   // fix szimulációs lépés (mp)

export class Sim {
  constructor(opts = {}) {
    if (opts._empty) return;
    this.seed = opts.seed ?? (Date.now() & 0xffffff); this.speciesId = opts.species || 'ponera'; this.difficulty = opts.difficulty || 'normal';
    this.diff = DIFFICULTY[this.difficulty]; this.rng = new RNG(this.seed); this.nextId = 1; this.t = 0; this.acc = 0;
    this.world = createWorld(this.seed, this.speciesId); this.nest = null; this.nestSite = null;
    this.ants = []; this.isopods = []; this.springtails = []; this.spiders = []; this.clutches = []; this.brood = [];
    this.logs = []; this.fx = []; this.queenDead = false; this.over = false; this.preyScarcity = 0; this.surfaceDanger = 0.1; this.threatNearNest = false; this.nestDirty = true;
    this.player = { active: false, antId: 0 }; this.input = freshInput();
    this.env = { t: 0, step: 0, hour: GAME_START_HOUR, day: 0, night: false, dusk: false, dawn: false, temp: 18, tempMean: 19, humidity: 0.55, rain: 0, weather: 'clear', wxLeft: DAY * 0.9, forecast: null, light: 1 };
    initColony(this); this.needs = colonyNeeds({ ...this, nest: null, brood: [], ants: [], colony: this.colony, speciesId: this.speciesId });
    const q = makeAnt(this, 'queen', this.world.spawn.x, this.world.spawn.z); q.energy = 82; q.hyd = 72; q.loc = 'ground'; this.ants.push(q); placeAnt(this, q);
    this.updateEnv(0); initEcology(this);
    this.needs = this.nest ? colonyNeeds(this) : { protein: 0.6, sugar: 0.5, water: 0.6, nurse: 0, dig: 0, repair: 0, guard: 0.1 };
  }
  // ------------------------------------------------------------ segédek
  log(text, level = 'info', id = 0) { this.logs.push({ t: this.t, text, level, id }); if (this.logs.length > 160) this.logs.shift(); }
  event(type, e) { if (this.fx.length < 200) this.fx.push({ type, id: e.id, x: e.x, y: e.y, z: e.z, kind: e.kind, t: this.t }); }
  noteThreat(spider, ant) { const l = this.world.lairs.find((q) => q.id === spider.lair); if (l) l.known = true; spider.spotted = true; }
  get queen() { return queen(this); }
  localMoist(a) { return a.loc === 'nest' ? 0.7 : moistureAt(this.world, a.x, a.z); }
  colonySize() { return this.ants.filter((a) => !a.dead && a.caste !== 'queen').length; }
  groupSize(a, r, prey) { let n = 0; for (const o of this.ants) { if (o === a || o.dead || o.loc !== 'ground' || o.caste === 'queen') continue; if (o.task === 'hunt' && (o.st === 'attack' || o.st === 'approach') && dist(o.x, o.z, a.x, a.z) < r) n++; } return n; }
  // veszély egy helyen (0..1): ébren lévő pókok és ismert pókfészkek
  dangerAt(x, z, a) {
    let d = 0; const caution = this.colony.dir.caution;
    for (const s of this.spiders) {
      if (s.dead) continue; const C = SPIDER.classes[s.cls]; const dd = dist(x, z, s.x, s.z);
      if (s.state !== 'lair') d = Math.max(d, clamp(1 - dd / (C.detect * 1.3), 0, 1)); else if (dd < (s.sac ? 16 : 9)) { const l = this.world.lairs.find((q) => q.id === s.lair); if (l && (l.known || a && a.caste === 'queen' && this.world.lairs.some((q) => q.known))) d = Math.max(d, clamp(0.9 - dd / 18, 0, 0.9) * (0.5 + caution)); }
    }
    return d;
  }
  controlTarget() { return this.player.active ? this.ants.find((a) => a.id === this.player.antId) : null; }
  possess(id) { const a = this.ants.find((q) => q.id === id && !q.dead); if (!a) return false; this.player.active = true; this.player.antId = id; this.input = freshInput(); a.task = 'manual'; a.st = ''; a.carry = a.carry; return true; }
  // közvetlen parancs a kijelölt hangyának: a megadott ászkát/ugróvillát (élőt vagy tetemet) vadássza le / egye meg
  order(id, kind, tid) {
    const a = this.ants.find((q) => q.id === id && !q.dead); const sp = SPECIES[this.speciesId];
    if (!a || a.caste === 'queen' && !this.nest || this.player.antId === id && this.player.active) return false;
    if (!sp.hunt.live && !sp.hunt.scavenge) return false; if (sp.hunt.eggs) return false;
    const p = (kind === 'isopod' ? this.isopods : this.springtails).find((q) => q.id === tid); if (!p) return false;
    a.task = 'hunt'; a.st = 'approach'; a.target = { kind, id: tid }; a.tmr = 0; a.lost = 0; a.noTarget = 0; a.wp = null; a.order = { until: this.t + 70 }; a.decide = 5; return true;
  }
  release() { const a = this.controlTarget(); this.player.active = false; if (a) { a.task = 'idle'; a.decide = 0; a.nseg = null; a.hiding = false; a.slow = false; a.climbing = false; a.cb = 1; a._dig = false; } }
  createNest(site) { this.nest = createNest(this.world, this.speciesId, site); this.nestDirty = true; if (site.kind === 'cavity') { const first = this.nest.nodes.find((q) => q.kind === 'chamber' && q.ready); if (first) first.role = 'brood'; } return this.nest; }
  addDig(fromId, target, role) { if (!this.nest) return null; return addDigJob(this.nest, SPECIES[this.speciesId], this.world, fromId, target, role); }
  setRole(nodeId, role) { const n = node(this.nest, nodeId); if (n && n.kind === 'chamber') n.role = role; }

  // ------------------------------------------------------------ környezet
  updateEnv(dt) {
    const e = this.env; e.t = this.t; e.step++;
    const hours = GAME_START_HOUR + (this.t / DAY) * 24; e.hour = hours % 24; const dnew = Math.floor(hours / 24);
    e.night = e.hour >= 21 || e.hour < 5; e.dusk = (e.hour >= 18.5 && e.hour < 21); e.dawn = e.hour >= 5 && e.hour < 7;
    e.light = e.night ? 0.07 : e.dusk ? 0.35 : e.dawn ? 0.45 : 1;
    if (dnew > e.day) { e.day = dnew; this.onNewDay(); }
    // időjárás-állapot
    e.wxLeft -= dt; const rng = this.rng;
    if (e.forecast) e.forecast.eta = Math.max(0, e.wxLeft);
    if (!e.forecast && e.wxLeft < DAY * 0.35 && !e.fcDone) { e.forecast = { type: this.nextWeather(), eta: e.wxLeft }; e.fcDone = true; }
    if (e.wxLeft <= 0) { e.weather = e.forecast ? e.forecast.type : this.nextWeather(); e.forecast = null; e.fcDone = false; e.wxLeft = DAY * rng.range(0.5, 1.6); if (e.weather === 'rain') { this.log('Eső érkezett.', 'info'); } }
    const CL = CLIMATE[SPECIES[this.speciesId].climate || 'temperate']; const meanT = { clear: 20, cloud: 17, rain: 14.5, heat: 28, cold: 9 }[e.weather] + CL.tempShift;
    e.tempMean += (meanT - e.tempMean) * Math.min(1, dt / (DAY * 0.25));
    const diurnal = 5.5 * CL.tempAmp * Math.sin(((e.hour - 9) / 24) * Math.PI * 2) * (e.weather === 'cloud' || e.weather === 'rain' ? 0.5 : 1);
    e.temp = e.tempMean + diurnal;
    const rainTarget = e.weather === 'rain' ? 0.55 + 0.4 * Math.sin(this.t / 40) ** 2 : 0; e.rain += (rainTarget - e.rain) * Math.min(1, dt / 20);
    const hum = Math.min(1, { clear: 0.5, cloud: 0.62, rain: 0.95, heat: 0.28, cold: 0.6 }[e.weather] + CL.humShift); e.humidity += (hum - e.humidity) * Math.min(1, dt / 60);
  }
  nextWeather() {
    const e = this.env, r = this.rng.next(), hard = this.difficulty === 'hard' ? 1.3 : this.difficulty === 'easy' ? 0.7 : 1;
    if (e.weather === 'rain') return r < 0.6 ? 'cloud' : 'clear';
    const CL = CLIMATE[SPECIES[this.speciesId].climate || 'temperate']; const pr = 0.22 + CL.rainBias, ph = 0.12 * hard * CL.heatBias, pc = 0.08 * hard * CL.coldBias;
    if (r < pr) return 'rain'; if (r < pr + ph) return 'heat'; if (r < pr + ph + pc) return 'cold'; if (r < 0.62) return 'cloud'; return 'clear';
  }
  onNewDay() {
    newDew(this.world, this.rng, 4 + this.rng.int(0, 3));
    const lowPrey = this.rng.chance(0.12 * (this.difficulty === 'hard' ? 1.5 : 1));
    this.preyScarcity = lowPrey ? 0.7 : Math.max(0, this.preyScarcity - 0.25);
  }
  // heves esőben: a mély járatok elöntése és beomlás
  rainDamage(dt) {
    const n = this.nest, e = this.env; if (!n || e.rain < 0.6) return;
    this.rainT = (this.rainT || 0) + dt;
    if (this.rainT > 25) {
      this.rainT = 0; const rng = this.rng;
      if (SPECIES[this.speciesId].nest.type === 'soil') {
        const low = n.nodes.filter((q) => q.kind !== 'entrance' && q.y < -9 && q.flood <= 0);
        if (low.length && rng.chance(0.25 * (this.difficulty === 'hard' ? 1.4 : 1))) { const q = rng.pick(low); q.flood = 1; this.nestDirty = true; }
        const shallow = n.edges.filter((q) => !q.collapsed && node(n, q.a).y > -6 && node(n, q.b).y > -6 && q.w > 2.4);
        if (shallow.length && rng.chance(0.18)) { const q = rng.pick(shallow); q.collapsed = true; this.nestDirty = true; this.log('Egy járat beomlott.', 'info'); }
      }
    }
  }

  // ------------------------------------------------------------ léptetés
  advance(realDt, speed) {
    if (this.over) return; this.acc += Math.min(realDt, 0.1) * speed; let k = 0;
    while (this.acc >= H && k < 30) { this.step(H); this.acc -= H; k++; }
    if (k >= 30) this.acc = 0;
  }
  step(dt) {
    this.t += dt; this.updateEnv(dt);
    stepWorld(this.world, dt, this.env);
    if (this.nest && this.env.step % 10 === 0) updateClimate(this.nest, this.world, this.env, dt * 10, SPECIES[this.speciesId]);
    stepEcology(this, dt);
    for (const p of this.isopods) updateIsopod(this, p, dt);
    for (const p of this.springtails) updateSpringtail(this, p, dt);
    for (const s of this.spiders) if (!s.dead) updateSpider(this, s, dt);
    if (this.env.step % 10 === 0) { this.needs = this.nest ? colonyNeeds(this) : this.needs; this.updateDanger(); }
    for (const a of this.ants) if (!a.dead) updateAnt(this, a, dt);
    if (this.nest) { stepBrood(this, dt); this.rainDamage(dt); this.updateNestEffects(dt); }
    this.colony.store.prey = Math.max(0, this.colony.store.prey - this.colony.store.prey * dt * 0.00008);
    this.cleanup(); this.checkEnd();
  }
  updateNestEffects(dt) {
    const n = this.nest;
    // az elöntött kamrákból a hangyák elmenekülnek (a fiasítást a dajkák költöztetik)
    for (const e of n.edges) if (e.collapsed && this.rng.chance(0)) e.collapsed = false;
  }
  updateDanger() {
    const n = this.nest; let dng = 0, near = false;
    const base = n ? n.nodes[0] : (this.queen || { x: 0, z: 0 });
    for (const s of this.spiders) {
      if (s.dead || s.state === 'lair') continue; const d = dist(s.x, s.z, base.x, base.z);
      if (d < 55) dng = Math.max(dng, clamp(1 - (d - 12) / 45, 0.15, 1)); if (d < 28) near = true;
    }
    this.surfaceDanger += (dng - this.surfaceDanger) * 0.5; this.threatNearNest = near;
  }
  cleanup() {
    for (const a of this.ants) if (a.dead) { a.deadT = (a.deadT || 0) + H; }
    this.ants = this.ants.filter((a) => !a.dead || a.deadT < 0.01 ? true : false);
    if (this.player.active && !this.ants.some((a) => a.id === this.player.antId)) { this.player.active = false; }
    this.spiders = this.spiders.filter((s) => { if (s.dead) { if (s.food === undefined) { s.food = Math.pow(s.len, 3) * ISOPOD.energyPerMm3 * 0.8; s.foodLeft = s.food; s.fresh = 1; } s.deadT = (s.deadT || 0) + H; s.fresh -= H / (DAY * 1.4); const eaten = s.foodLeft <= 0.05; if (eaten) s.huskT = (s.huskT || 0) + H; if ((eaten && s.huskT > 30) || (!eaten && s.fresh <= 0) || (!eaten && s.deadT > 25 && !s.beingEaten && s.deadT > DAY * 0.8)) { const l = this.world.lairs.find((q) => q.id === s.lair); if (l) l.occupied = false; return false; } } return true; });
    for (const s of this.spiders) if (!s.dead && s.hp > 0) { const l = this.world.lairs.find((q) => q.id === s.lair); if (l) l.occupied = true; }
  }
  checkEnd() {
    const q = queen(this); const alive = this.ants.filter((a) => !a.dead).length;
    if (!q && !this.queenDead) this.queenDead = true;
    if (this.queenDead && alive === 0) { this.over = true; this.log('A kolónia kihalt.', 'critical'); }
  }
  // ------------------------------------------------------------ mentés
  serialize() {
    const w = this.world; const W = { ...w, moist: Array.from(w.moist) };
    return JSON.stringify({ v: SAVE_VERSION, seed: this.seed, speciesId: this.speciesId, difficulty: this.difficulty, t: this.t, rng: this.rng.getState(), nextId: this.nextId, world: W, nest: this.nest, nestSite: this.nestSite,
      ants: this.ants, isopods: this.isopods, springtails: this.springtails, spiders: this.spiders, clutches: this.clutches, brood: this.brood, colony: this.colony, env: this.env,
      queenDead: this.queenDead, over: this.over, preyScarcity: this.preyScarcity, logs: this.logs.slice(-40), ecoT: this.ecoT, spiderCheck: this.spiderCheck },
      (k, v) => ((k === 'threat' || k === 'target') && v && typeof v === 'object' && v.kind && v.x !== undefined ? undefined : v));   // élő hivatkozások (zsákmány ↔ ragadozó) körkörösek: betöltéskor úgyis törlődnek
  }
  static deserialize(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json; if (d.v !== SAVE_VERSION) throw new Error('A mentés verziója nem kompatibilis.');
    const s = new Sim({ _empty: true });
    Object.assign(s, { seed: d.seed, speciesId: d.speciesId, difficulty: d.difficulty, diff: DIFFICULTY[d.difficulty], rng: new RNG(1), nextId: d.nextId, t: d.t, acc: 0, nest: d.nest, nestSite: d.nestSite,
      ants: d.ants, isopods: d.isopods, springtails: d.springtails, spiders: d.spiders, clutches: d.clutches, brood: d.brood, colony: d.colony, env: d.env, queenDead: d.queenDead, over: d.over, preyScarcity: d.preyScarcity,
      logs: d.logs || [], fx: [], surfaceDanger: 0.1, threatNearNest: false, nestDirty: true, player: { active: false, antId: 0 }, input: freshInput(), ecoT: d.ecoT, spiderCheck: d.spiderCheck });
    s.rng.setState(d.rng); const w = d.world; w.moist = Float32Array.from(w.moist); s.world = w;
    // a hivatkozott entitások (célpontok) azonosító alapján újra feloldódnak
    for (const a of s.ants) { if (a.target && typeof a.target === 'object' && a.target.kind === 'spider') a.target = null; if (a.target && a.target.ref) a.target = null; a.threat = null; }
    for (const p of s.isopods) p.threat = null; for (const p of s.springtails) p.threat = null;
    for (const sp of s.spiders) sp.target = null;
    s.needs = s.nest ? colonyNeeds(s) : { protein: 0.6, sugar: 0.5, water: 0.6, nurse: 0, dig: 0, repair: 0, guard: 0.1 };
    return s;
  }
}
export function freshInput() { return { fwd: 0, strafe: 0, yawD: 0, pitchD: 0, sprint: false, act1: false, act2: false, use: false, useHold: false, jump: false, drop: false, dig: false, climb: false, digSurf: false }; }
