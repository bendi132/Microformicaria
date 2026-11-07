// Entitás-gyárak: hangya, ászka, pók, fiasítás. Minden mező egyszerű adat (mentheto JSON).
import { SPECIES, ISOPOD, ELEODES, SPIDER, SPRINGTAIL, DAY } from './config.js';

const ANIM = () => ({ phase: 0, mv: 0, act: 0, actT: 0, head: 0, open: 0, curl: 0, alert: 0 });

export function makeAnt(sim, caste, x, z, extra = {}) {
  const sp = SPECIES[sim.speciesId];
  const maxHp = sp.health[caste] || sp.health.worker;
  const len = sp.size[caste] || sp.size.worker;
  const a = {
    id: sim.nextId++, kind: 'ant', caste, len, x, y: 0, z, yaw: sim.rng.range(0, 6.28), pitch: 0, up: [0, 1, 0],
    loc: 'ground', node: 0, path: null, seg: 0, segT: 0, limb: 0, ls: 0, lth: 0, ox: 0, oz: 0,
    hp: maxHp, maxHp, energy: 80, hyd: 80, stress: 0, rest: 0, age: 0, crop: 0, carry: null,
    task: 'idle', st: '', tmr: 0, cd: 0, stun: 0, tx: 0, tz: 0, target: null, home: 0,
    mand: 1, jumpCd: 0, leap: 0, plugging: false, dodgeT: 0, kills: 0, lastHunt: -999, decide: sim.rng.range(0, 3),
    anim: ANIM(), moved: 0, dead: false, inNest: false, fightT: 0, fleeT: 0, speedMul: 1, noPlugUntil: 0,
  };
  Object.assign(a, extra);
  return a;
}

export function makeIsopod(sim, cls, x, z, hidden = true) {
  const desert = sim.world.biome === 'desert'; const c = (desert ? ELEODES : ISOPOD).classes[cls];      // sivatagban a sötétbogár (Eleodes) veszi át az ászka szerepét
  const len = sim.rng.range(c.len[0], c.len[1]);
  const food = Math.pow(len, 3) * ISOPOD.energyPerMm3 * (desert ? 0.4 : 1);
  const hp = c.hp * (len / ((c.len[0] + c.len[1]) / 2));
  return {
    id: sim.nextId++, kind: 'isopod', cls, len, x, y: 0, z, yaw: sim.rng.range(0, 6.28), hp, maxHp: hp, armor: c.armor * sim.rng.range(0.85, 1.15), speed: c.speed * sim.rng.range(0.85, 1.15),
    food, foodLeft: food, state: hidden ? 'hidden' : 'forage', cover: null, tmr: sim.rng.range(2, 12), tx: x, tz: z, alert: 0, dry: 0, dead: false, fresh: 1, held: 0, para: 0,
    anim: ANIM(), moved: 0, threat: null, wild: sim.rng.range(0.7, 1.3), sp: desert ? 'eleodes' : 'isopod',
  };
}

export function makeSpider(sim, cls, lair) {
  const c = SPIDER.classes[cls];
  const len = c.len * sim.rng.range(0.9, 1.1);
  return {
    id: sim.nextId++, kind: 'spider', cls, len, x: lair.x, y: 0, z: lair.z, yaw: sim.rng.range(0, 6.28), hp: c.hp, maxHp: c.hp, lair: lair.id, state: 'lair', tmr: sim.rng.range(5, 25),
    target: null, cd: 0, tx: lair.x, tz: lair.z, sat: 0.3, stay: sim.rng.range(0.6, 2.0), spotted: false, carry: null, anim: ANIM(), moved: 0, dead: false, lunge: 0, lungeDir: 0, heard: 0, hunted: 0,
    pitch: 0, onSurface: true, sp: cls === 'scorpion' ? 'scorpion' : 'spider',
  };
}

export function makeBrood(sim, stage, nodeId) {
  return { id: sim.nextId++, kind: 'brood', stage, node: nodeId, prog: 0, fed: 0.6, hp: 1, ox: sim.rng.range(-1, 1), oz: sim.rng.range(-1, 1), age: 0, caste: 'worker' };
}

export function makeSpringtail(sim, x, z, juvenile = false) {
  const c = SPRINGTAIL;
  let len = sim.rng.range(c.len[0], c.len[1]) * (juvenile ? 0.6 : 1);
  const food = Math.pow(len, 3) * c.energyPerMm3;
  return {
    id: sim.nextId++, kind: 'springtail', len, x, y: 0, z, yaw: sim.rng.range(0, 6.28), hp: 2, maxHp: 2, armor: 0, food, foodLeft: food, state: 'forage', tmr: sim.rng.range(1, 6),
    tx: x, tz: z, cd: 0, jt: 0, jfx: x, jfz: z, jtx: x, jtz: z, leap: 0, dead: false, fresh: 1, anim: { phase: 0, mv: 0, act: 0, actT: 0, head: 0, open: 0, curl: 0, alert: 0 }, moved: 0,
    juvenile, grow: juvenile ? 1 : 0, layT: sim.rng.range(0.4, 1.5) * 150, held: 0, para: 0, threat: null, speed: c.speed * sim.rng.range(0.8, 1.2), wild: 1,
  };
}
// tojáscsomó: owner = 'springtail' | 'isopod' | 'spider'; host = az anya (ászka / pók) azonosítója
export function makeClutch(sim, owner, x, z, n, o = {}) {
  const per = { springtail: 0.35, isopod: 0.7, spider: 1.2 }[owner];
  const days = { springtail: SPRINGTAIL.eggDays, isopod: ISOPOD.brood, spider: SPIDER.sacDays }[owner];
  return Object.assign({ id: sim.nextId++, kind: 'clutch', owner, x, y: 0, z, n, n0: n, per, hatchLeft: days * DAY * sim.rng.range(0.85, 1.15), cover: null, host: null, dead: false, hidden: true, taken: 0 }, o);
}
