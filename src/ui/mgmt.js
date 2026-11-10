// Kolónia-vezetés kezelőfelülete: panel (munkaerő / készlet / jelentés), döntéskártya és napi jelentés-kártya.
// A DOM-ot egyszer építi fel; a frissítés csak a szükséges elemeket írja át, így a csúszkák húzás közben sem ugranak vissza.
import { SPECIES, DAY } from '../sim/config.js';
import * as M from '../sim/manage.js';

const COLOR = { hunt: '#c9775f', forage: '#e0a24a', water: '#6fb3e0', nurse: '#bf9ad6', dig: '#a98a5e', guard: '#d9573f', rest: '#6f6556' };
const ICON = { hunt: '🎯', forage: '🍯', water: '💧', nurse: '🐛', dig: '⛏', guard: '🛡', caution: '⚠' };
const HINT = {
  hunt: 'Hány dolgozó indul zsákmányért (vagy petéért).', forage: 'Táplálék-gyűjtés: nektár, magok.', water: 'Vízhordás a raktárba és a fiasításnak.',
  nurse: 'Lárvák etetése, fiasítás költöztetése.', dig: 'Új kamrák ásása és a járatok javítása.', guard: 'Bejárat-őrzés és védekezés veszély esetén.', caution: 'Mennyire kerülik a felszíni veszélyt (pók, skorpió).',
};
const STORES = [['prey', '🍖', 'Zsákmány', 'protein', '#c9775f'], ['sugar', '🍯', 'Cukor / nektár', 'sugar', '#e0a24a'], ['water', '💧', 'Víz', 'water', '#6fb3e0'], ['seed', '🌾', 'Magtár', null, '#c8b05a']];
const n1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(Math.round(v * 10) / 10).toString().replace('.', ',');
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function spark(vals, color, w = 74, h = 22) {
  if (!vals || vals.length < 2) return `<svg class="spk" width="${w}" height="${h}"></svg>`;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1, pad = 3;
  const pts = vals.map((v, i) => [pad + (i / (vals.length - 1)) * (w - pad * 2), hi === lo ? h / 2 : h - pad - ((v - lo) / span) * (h - pad * 2)]);
  const last = pts[pts.length - 1];
  return `<svg class="spk" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.2" fill="${color}"/></svg>`;
}
const setHtml = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };

export function initMgmt({ $, G, toast, setSpeed }) {
  const hud = $('hud'); let sim = null, open = false, tab = 'labor', seenDay = -1, seenResult = 0, seenAsked = 0, repT = 0, evSig = '', rowsSig = '';
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  // ---- panel
  const panel = mk('div', 'card mg'); panel.id = 'mgmt';
  panel.innerHTML = `
    <div class="mg-h"><div><b>Kolónia-vezetés</b><small id="mgSub"></small></div><button id="mgX" title="Bezár (M)">✕</button></div>
    <div class="mg-tabs"><button data-t="labor" class="on">Munkaerő</button><button data-t="stock">Készlet</button><button data-t="rep">Jelentés<i class="dot" id="mgDot"></i></button></div>
    <div class="mg-body">
      <section data-p="labor">
        <div class="mg-lbl"><span>Aktuális munkaelosztás</span><span id="mgTot"></span></div>
        <div class="lbar" id="mgBar"></div><div class="lleg" id="mgLeg"></div>
        <div class="mg-lbl"><span>Irányelv</span></div>
        <div class="pols" id="mgPols"></div><div class="mg-desc" id="mgPolDesc"></div>
        <div class="mg-lbl"><span>Prioritások</span><span class="mg-sm">csúszka = hány dolgozó végezze</span></div>
        <div id="mgRows"></div>
        <div class="mg-lbl"><span>Aktív intézkedések</span></div><div id="mgMods"></div>
      </section>
      <section data-p="stock" hidden>
        <div class="mg-lbl"><span>Készletek</span><span class="mg-sm">trend: az elmúlt nap</span></div><div id="mgStores"></div>
        <div class="mg-lbl"><span>Népesség és hely</span></div><div id="mgPop"></div>
      </section>
      <section data-p="rep" hidden><div id="mgRep"></div></section>
    </div>`;
  hud.appendChild(panel);
  const q = (id) => panel.querySelector('#' + id);

  // ---- döntéskártya és napi jelentés-kártya
  const evc = mk('div', 'card evcard'); evc.id = 'evcard'; evc.style.display = 'none'; hud.appendChild(evc);
  const repc = mk('div', 'card repcard'); repc.id = 'repcard'; repc.style.display = 'none'; hud.appendChild(repc);

  function setTab(t) { tab = t; for (const b of panel.querySelectorAll('.mg-tabs button')) b.classList.toggle('on', b.dataset.t === t); for (const s of panel.querySelectorAll('section')) s.hidden = s.dataset.p !== t; if (t === 'rep' && sim) M.ackReport(sim); render(); }
  panel.querySelectorAll('.mg-tabs button').forEach((b) => { b.onclick = () => setTab(b.dataset.t); });
  q('mgX').onclick = () => close();
  function setOpen(v) { open = v; panel.classList.toggle('on', v); document.body.classList.toggle('mgopen', v); $('bMgmt').classList.toggle('on', v); if (v) { if (sim && tab === 'rep') M.ackReport(sim); render(true); } }
  function close() { setOpen(false); }

  // ---- felépítés egy új játékhoz
  function buildRows() {
    const sp = SPECIES[sim.speciesId], hunter = sp.hunt.live || sp.hunt.eggs || sp.hunt.scavenge, seeds = !!(sp.diet && sp.diet.seeds);
    const defs = [];
    if (hunter) defs.push(['hunt', sp.hunt.eggs ? 'Petelopás' : 'Vadászat', 2]);
    if (sp.nest.type === 'tree' || seeds) defs.push(['forage', seeds ? 'Magok gyűjtése' : 'Nektár-gyűjtés', 2]);
    defs.push(['water', 'Vízkeresés', 2], ['nurse', 'Dajkálás', 2]);
    if (sp.nest.type === 'soil') defs.push(['dig', 'Ásás és javítás', 2]);
    defs.push(['guard', 'Őrség', 2], ['caution', 'Óvatosság', 1]);
    q('mgRows').innerHTML = defs.map(([k, name, mx]) => `<div class="prow" data-k="${k}" title="${HINT[k]}" style="--c:${COLOR[k === 'caution' ? 'guard' : k]}">
      <span class="pi">${k === 'hunt' && sp.hunt.eggs ? '🥚' : ICON[k]}</span>
      <div class="pm"><div class="pt"><span>${name}</span><span><em class="pmod"></em><b class="pv"></b></span></div><input type="range" min="0" max="${mx}" step="0.05" data-k="${k}"></div>
      <span class="pc">${k === 'caution' ? '' : '<b>0</b>'}</span></div>`).join('');
    for (const el of q('mgRows').querySelectorAll('input')) {
      el.value = sim.colony.dir[el.dataset.k];
      el.oninput = () => { M.setDir(sim, el.dataset.k, el.value); render(); };
    }
    q('mgPols').innerHTML = Object.entries(M.POLICIES).map(([id, p]) => `<button data-id="${id}" title="${p.desc}"><span>${p.icon}</span>${p.name}</button>`).join('');
    for (const b of q('mgPols').querySelectorAll('button')) b.onclick = () => { M.applyPolicy(sim, b.dataset.id); for (const el of q('mgRows').querySelectorAll('input')) el.value = sim.colony.dir[el.dataset.k]; render(); };
    rowsSig = sim.speciesId;
  }

  // ---- megjelenítés
  function renderLabor(mg) {
    const L = M.laborCensus(sim), tot = Math.max(1, L.total);
    setHtml(q('mgBar'), M.GROUPS.map((g) => L.groups[g] ? `<i style="flex:${L.groups[g]};background:${COLOR[g]}" title="${M.GROUP_NAME[g]}: ${L.groups[g]}"></i>` : '').join('') || '<i style="flex:1;background:#3a2f23"></i>');
    q('mgTot').textContent = `${L.total} dolgozó`;
    setHtml(q('mgLeg'), M.GROUPS.filter((g) => L.groups[g]).map((g) => `<span><i style="background:${COLOR[g]}"></i>${M.GROUP_NAME[g]} <b>${L.groups[g]}</b></span>`).join(''));
    const pol = M.POLICIES[mg.policy];
    for (const b of q('mgPols').querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === mg.policy);
    q('mgPolDesc').textContent = pol ? pol.desc : 'Egyéni beállítás: a csúszkák kézzel állítva.';
    const eff = M.effDir(sim), mods = M.activeMods(sim);
    for (const row of q('mgRows').children) {
      const k = row.dataset.k, g = k === 'caution' ? null : k; const v = sim.colony.dir[k];
      row.querySelector('.pv').textContent = k === 'caution' ? `${Math.round(v * 100)}%` : `×${n1(v)}`;
      const m = mods.filter((x) => x.k === k).reduce((a, x) => a * x.mul, 1); const me = row.querySelector('.pmod');
      me.textContent = m !== 1 ? `×${n1(m)}` : ''; me.className = 'pmod' + (m > 1 ? ' up' : m < 1 ? ' dn' : '');
      if (g) row.querySelector('.pc b').textContent = L.groups[g];
    }
    setHtml(q('mgMods'), mods.length ? mods.map((m) => `<div class="mod"><span class="${m.mul >= 1 ? 'up' : 'dn'}">${m.name} ×${n1(m.mul)}</span><small>${Math.max(1, Math.round(m.left / DAY * 24))} óra</small></div>`).join('') : '<div class="mg-empty">Nincs aktív intézkedés. A döntések (kártyák) időszakos módosítókat adnak.</div>');
  }
  function renderStock(mg) {
    const sp = SPECIES[sim.speciesId], cap = M.capacity(sim), st = sim.colony.store, nd = sim.needs || {};
    const seeds = !!(sp.diet && sp.diet.seeds) || (st.seed || 0) > 0;
    setHtml(q('mgStores'), STORES.filter((s) => s[0] !== 'seed' || seeds).map(([k, ic, name, need, col]) => {
      const v = st[k] || 0, c = cap.store[k] || 1, tr = M.trendOf(mg.samples, k), short = need && nd[need] > 0.6;
      return `<div class="srow"><span class="si">${ic}</span><div class="sm"><div class="sn"><span>${name}${short ? ' <em class="short">hiány</em>' : ''}</span><b>${n1(v)} / ${c}</b></div><div class="sbar"><i style="width:${Math.min(100, v / c * 100)}%;background:${col}"></i></div></div><span class="trd ${tr > 0 ? 'up' : tr < 0 ? 'dn' : ''}">${tr > 0 ? '▲' : tr < 0 ? '▼' : '■'}</span>${spark(mg.samples.map((s) => s[k]), col)}</div>`;
    }).join(''));
    const L = M.laborCensus(sim), soldiers = sim.ants.filter((a) => !a.dead && a.caste === 'soldier').length, c = (s) => sim.brood.filter((b) => b.stage === s).length;
    const bp = cap.brood.cap ? Math.min(100, cap.brood.used / cap.brood.cap * 100) : 0;
    setHtml(q('mgPop'), `
      <div class="srow"><span class="si">🐜</span><div class="sm"><div class="sn"><span>Dolgozók${soldiers ? ` <small>(ebből ${soldiers} katona)</small>` : ''}</span><b>${L.total}</b></div></div><span></span>${spark(mg.samples.map((s) => s.w), '#e0c890')}</div>
      <div class="srow"><span class="si">🥚</span><div class="sm"><div class="sn"><span>Fiasítás <small>🥚${c('egg')} 🐛${c('larva')} 🫘${c('pupa')}</small></span><b>${sim.brood.length}</b></div></div><span></span>${spark(mg.samples.map((s) => s.b), '#bf9ad6')}</div>
      <div class="srow"><span class="si">🏠</span><div class="sm"><div class="sn"><span>Kamrák kihasználtsága</span><b>${cap.brood.used} / ${cap.brood.cap}</b></div><div class="sbar"><i style="width:${bp}%;background:${bp > 85 ? '#d9573f' : '#8fbf5a'}"></i></div></div><span></span><span style="width:74px"></span></div>
      ${(() => { const m = M.moldOf(sim).max; return m > 0.04 ? `<div class="srow"><span class="si">🍄</span><div class="sm"><div class="sn"><span>Penész${m > 0.28 ? ' <em class="short">veszély</em>' : ''}</span><b>${Math.round(m * 100)}%</b></div><div class="sbar"><i style="width:${Math.min(100, m * 100)}%;background:${m > 0.45 ? '#c0503a' : m > 0.28 ? '#d6b23a' : '#8fbf5a'}"></i></div></div><span></span><span style="width:74px"></span></div>` : ''; })()}
      <div class="mg-note">Kamrák: <b>${cap.chambers}</b> / ${cap.maxChambers}${cap.building ? ` · ${cap.building} épül` : ''}. Új kamra: ⛏ eszköz.</div>`);
  }
  function repHtml(r) {
    const d = (v, ic, t) => `<div class="chip"><span>${ic}</span><b>${v}</b><small>${t}</small></div>`;
    return `<div class="rep-h"><b>${r.day}. nap jelentése</b><small>${r.decisions ? r.decisions + ' döntés' : 'nem volt döntés'}</small></div>
      <div class="chips">${d(r.workers, '🐜', 'dolgozó')}${d(sgn(r.born - r.died), '👥', `${r.born} új · ${r.died} elesett`)}${d(r.brood.egg + r.brood.larva + r.brood.pupa, '🥚', `${r.brood.larva} lárva · ${r.brood.pupa} báb`)}${d(sgn(r.incTotal), '🍖', 'beszerzés')}${d(r.kills, '🎯', 'zsákmány')}${d(r.lost, '💔', 'elveszett fióka')}</div>
      <ul class="tips">${r.tips.map((t) => `<li><span>${t.icon}</span>${esc(t.text)}</li>`).join('')}</ul>`;
  }
  function renderRep(mg) {
    const logH = mg.log.length ? mg.log.map((e) => `<div class="dec"><span class="dk ${e.good === true ? 'ok' : e.good === false ? 'no' : 'mid'}">${e.good === true ? '✓' : e.good === false ? '✗' : '•'}</span><div><b>${e.icon} ${esc(e.title)}</b><small>${e.day}. nap · ${esc(e.opt)}${e.auto ? ' (automatikus)' : ''}</small><p>${esc(e.text)}</p></div></div>`).join('') : '<div class="mg-empty">Még nem volt döntés. Ha a kolónia eléri a 6 dolgozót, döntési helyzetek érkeznek.</div>';
    const old = mg.reports.slice(1).map((r) => `<div class="oldr"><b>${r.day}. nap</b><span>🐜 ${r.workers} (${sgn(r.born - r.died)})</span><span>🍖 ${sgn(r.incTotal)}</span><span>🥚 ${r.brood.egg + r.brood.larva + r.brood.pupa}</span></div>`).join('');
    setHtml(q('mgRep'), `${mg.reports.length ? `<div class="repbox">${repHtml(mg.reports[0])}</div>` : '<div class="mg-empty">Az első napi jelentés a nap végén érkezik.</div>'}
      <div class="mg-lbl"><span>Döntések</span><span class="mg-sm">${mg.decisions} összesen · ${mg.good} sikeres</span></div>${logH}
      ${old ? `<div class="mg-lbl"><span>Korábbi napok</span></div>${old}` : ''}`);
  }
  function render(force) {
    if (!sim || !open && !force) return; const mg = sim.colony.mg; if (!mg) return;
    q('mgSub').textContent = ` Nap ${sim.env.day + 1} · ${M.POLICIES[mg.policy] ? M.POLICIES[mg.policy].name : 'Egyéni'}`;
    q('mgDot').style.display = mg.unread && tab !== 'rep' ? 'inline-block' : 'none';
    if (tab === 'labor') renderLabor(mg); else if (tab === 'stock') renderStock(mg); else renderRep(mg);
  }

  // ---- döntéskártya
  function renderEvent() {
    const v = M.eventView(sim);
    if (!v || v.phase !== 'ask') { evc.style.display = 'none'; evSig = ''; return; }
    const sig = v.id + ':' + sim.colony.mg.asked;
    if (sig !== evSig) {
      evSig = sig; evc.style.display = 'block';
      evc.innerHTML = `<div class="ev-h"><span class="ev-ic">${v.icon}</span><div><b>${esc(v.title)}</b><small id="evT"></small></div></div><p class="ev-t">${esc(v.text)}</p>
        <div class="ev-o">${v.opts.map((o) => `<button data-id="${o.id}" class="${o.id === v.def ? 'def' : ''}"><b>${esc(o.label)}</b><span>${esc(o.note)}</span>${o.fx ? `<em>${esc(o.fx)} · ${v.days === 1 ? '1 nap' : n1(v.days) + ' nap'}</em>` : ''}</button>`).join('')}</div>
        <div class="ev-bar"><i id="evB"></i></div><div class="ev-f">Döntés nélkül: „${esc(v.opts.find((o) => o.id === v.def).label)}”</div>`;
      for (const b of evc.querySelectorAll('.ev-o button')) b.onclick = () => { if (M.chooseEvent(sim, b.dataset.id)) { evc.style.display = 'none'; render(); } };
    }
    const T = evc.querySelector('#evT'), B = evc.querySelector('#evB');
    if (T) T.textContent = `Döntés szükséges · még ${Math.ceil(v.left)} mp`; if (B) B.style.width = (v.left / v.total * 100) + '%';
  }
  // ---- napi jelentés-kártya (rövid ideig látszik, ha a panel zárva van)
  function renderRepCard(dt) {
    const mg = sim.colony.mg, r = mg.reports[0];
    if (r && r.day !== seenDay) { seenDay = r.day; if (!open) { repT = 14; repc.innerHTML = `<div class="rc-h"><b>📋 ${r.day}. nap jelentése</b><button class="rc-x" title="Elrejt">✕</button></div>
      <div class="rc-s"><span>🐜 ${r.workers}</span><span>${sgn(r.born - r.died)} 👥</span><span>🍖 ${sgn(r.incTotal)}</span><span>🥚 ${r.brood.egg + r.brood.larva + r.brood.pupa}</span></div><div class="rc-t">${r.tips[0].icon} ${esc(r.tips[0].text)}</div><button class="rc-o">Részletek</button>`;
      repc.style.display = 'block'; repc.querySelector('.rc-x').onclick = () => { repT = 0; repc.style.display = 'none'; }; repc.querySelector('.rc-o').onclick = () => { repT = 0; repc.style.display = 'none'; setTab('rep'); setOpen(true); }; } }
    repc.style.visibility = evSig ? 'hidden' : 'visible';          // döntéskártya alatt a jelentés-kártya nem zavar
    if (repT > 0) { repT -= dt; if (repT <= 0 || open) repc.style.display = 'none'; }
  }

  function update(s, dt = 0.2) {
    sim = s; const mg = s.colony.mg; if (!mg) return;
    const ev = mg.ev && mg.ev.phase === 'ask';
    $('bMgmt').classList.toggle('alert', !!ev); $('bMgmt').classList.toggle('note', !ev && mg.unread);
    // új döntési helyzet: lassítás 1×-ra (különben a döntési idő elfut), első személyben csak értesítés
    if (ev && mg.asked !== seenAsked) { seenAsked = mg.asked; if (G.speed > 1) setSpeed(1); if (G.fpv) toast(`📋 Döntés vár: ${M.EVENTS[mg.ev.id].title} (kilépés: Q)`, 5000, 'warn'); }
    if (mg.result && mg.result.seq !== seenResult) { const r = mg.result; if (seenResult || mg.result.seq > 0) toast(`${r.icon} ${r.title}: ${r.text}${r.xp ? `  (+${r.xp} XP)` : ''}`, 7000, r.good === true ? true : r.good === false ? false : 'warn'); seenResult = r.seq; }
    if (!G.fpv) { renderEvent(); renderRepCard(dt); render(); } else { evc.style.display = 'none'; evSig = ''; }
  }
  function attach(s) {
    sim = s; seenDay = s.colony.mg && s.colony.mg.reports[0] ? s.colony.mg.reports[0].day : -1; seenResult = s.colony.mg ? (s.colony.mg.result ? s.colony.mg.result.seq : 0) : 0; seenAsked = s.colony.mg ? (s.colony.mg.asked || 0) : 0;
    evSig = ''; repT = 0; evc.style.display = 'none'; repc.style.display = 'none'; panel._h = null; buildRows(); setOpen(false); setTab('labor');
    for (const k of ['mgBar', 'mgLeg', 'mgMods', 'mgStores', 'mgPop', 'mgRep']) { const e = q(k); if (e) e._h = null; }
  }
  function detach() { sim = null; setOpen(false); evc.style.display = 'none'; repc.style.display = 'none'; }
  return { attach, detach, update, toggle: () => setOpen(!open), close, isOpen: () => open, openReport: () => { setTab('rep'); setOpen(true); } };
}
