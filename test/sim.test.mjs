// Fejlesztői teszt: a szimuláció megjelenítés nélkül, minden fajjal. Használat: node test/sim.test.mjs [faj] [nap] [nehézség] [mag]
import { Sim } from '../src/sim/sim.js';
import { DAY } from '../src/sim/config.js';
const species = process.argv[2] ? [process.argv[2]] : ['ponera', 'cephalotes', 'odonto', 'proceratium'];
const days = +(process.argv[3] || 6), diff = process.argv[4] || 'normal', seed = +(process.argv[5] || 12345);
for (const sp of species) {
  const t0 = Date.now(); const s = new Sim({ species: sp, seed, difficulty: diff });
  console.log(`\n=== ${sp} (${diff}, mag ${seed}) ===`);
  let lastDay = -1; const ev = {};
  for (let i = 0; i < days * DAY * 10; i++) {
    s.step(0.1);
    for (const f of s.fx) ev[f.type] = (ev[f.type] || 0) + 1; s.fx.length = 0;
    const d = Math.floor(s.t / DAY * 2) / 2;
    if (d !== lastDay && (i % (DAY * 5) === 0)) {
      lastDay = d; const q = s.ants.find((a) => a.caste === 'queen' && !a.dead); const w = s.ants.filter((a) => !a.dead && a.caste !== 'queen');
      const br = { egg: 0, larva: 0, pupa: 0 }; s.brood.forEach((b) => br[b.stage]++);
      const tasks = {}; w.forEach((a) => tasks[a.task] = (tasks[a.task] || 0) + 1);
      console.log(`nap ${(s.t / DAY).toFixed(1)} óra ${s.env.hour.toFixed(0)} ${s.env.weather} | Q:${q ? `${q.task}/${q.st} E${q.energy | 0} H${q.hyd | 0} HP${q.hp | 0} ${q.loc}` : 'HALOTT'} | dolg:${w.length} peték ${br.egg} lárva ${br.larva} báb ${br.pupa} | készlet P${s.colony.store.prey.toFixed(0)} S${s.colony.store.sugar.toFixed(0)} V${s.colony.store.water.toFixed(0)} | ászka ${s.isopods.filter(p => !p.dead).length} ugró ${s.springtails.filter(p => !p.dead).length} tojás ${s.clutches.length} pók ${s.spiders.filter(p => !p.dead).length} | ${JSON.stringify(tasks)}`);
    }
    if (s.over) break;
  }
  console.log('stat', JSON.stringify(s.stats));
  console.log('események:', JSON.stringify(ev), 'ido(ms)', Date.now() - t0, 'ant dead?', s.queenDead);
  const js = s.serialize(); const s2 = Sim.deserialize(js); s2.step(0.1); console.log('mentés mérete', (js.length / 1024).toFixed(0), 'kB; betöltés ok, hangyák:', s2.ants.length);
}
