// Mászás: F-re a hangya felmászik egy kőre; tetején y > talaj; ismételt F-re leszáll.
import { Sim } from '../src/sim/sim.js';
import { climbHeight, heightAt } from '../src/sim/world.js';
const s = new Sim({ species: 'ponera', seed: 321, difficulty: 'normal' });
for (let i = 0; i < 100; i++) s.step(0.1);
const a = s.queen; s.possess(a.id); a.loc = 'ground'; a.node = null; a.nseg = null;
const st = s.world.stones.find((q) => !q.trunk && Math.abs(q.x) < 55 && Math.abs(q.z) < 55); console.log('kő', st.r.toFixed(1), st.h.toFixed(1));
a.x = st.x - st.r * 1.5; a.z = st.z; a.yaw = Math.PI / 2; s.step(0.1);
const y0 = a.y; let blocked = a.x;
for (let i = 0; i < 60; i++) { s.input.fwd = 1; s.step(0.1); } console.log('F nélkül x', a.x.toFixed(2), 'kő széle', (st.x - st.r).toFixed(2), 'y', a.y.toFixed(2));
a.x = st.x - st.r * 1.5; a.z = st.z; s.input.climb = true; s.step(0.1);
for (let i = 0; i < 90; i++) { s.input.fwd = 1; s.step(0.1); if (a.climbing && climbHeight(s.world, a.x, a.z) && i % 6 === 0) console.log(' lépés', i, 'x', a.x.toFixed(2), 'y', a.y.toFixed(2), 'talaj', heightAt(s.world, a.x, a.z).toFixed(2)); }
console.log('mászik', a.climbing, 'y', a.y.toFixed(2), 'talaj', heightAt(s.world, a.x, a.z).toFixed(2));
s.input.fwd = 0; s.input.climb = true; s.step(0.1); for (let i = 0; i < 30; i++) s.step(0.1); console.log('leszállt', !a.climbing, 'y', a.y.toFixed(2), 'talaj', heightAt(s.world, a.x, a.z).toFixed(2));
