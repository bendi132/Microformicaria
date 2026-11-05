// Filmszerű bevezető: négy jelenet a feltöltött fotókból (házasodási repülés → a királynő → alapítás → a kolónia).
// Csak DOM + CSS + Web Animations + egy könnyű részecskevászon; nincs külső függőség. A képek: assets/intro/s1..s4.jpg (~0,75 MB összesen).
// Koppintás / kattintás / Esc / Enter / szóköz: kihagyás. Visszatér, amikor vége (vagy kihagyták) – utána indul a játék.
const LANG = 'en';   // 'en' | 'hu' – a megadott angol feliratok az alapértelmezettek
const SCENES = [
  { img: 'assets/intro/s1.jpg', pos: '68% 42%', kicker: { en: 'I · Nuptial flight', hu: 'I · Nászrepülés' }, text: { en: 'Every colony begins with a new beginning.', hu: 'Minden kolónia egy új kezdettel indul.' },
    move: { from: { s: 1.04, x: -1.6, y: 0.6 }, mid: { s: 1.1, x: 0.2, y: -0.9 }, to: { s: 1.17, x: 1.8, y: -0.5 }, r: [-0.5, 0.4], o: '64% 40%', ease: 'ease-in-out' }, enter: 'fade', exit: 'fade', cap: 'rise', align: 'left', grade: 'rgba(40,34,14,.28)', fx: { col: [255, 236, 190], n: 1, vx: 5, vy: -6, a: 0.55, r: [0.8, 2.6], glow: 1 } },
  { img: 'assets/intro/s2.jpg', pos: '42% 50%', kicker: { en: 'II · The queen', hu: 'II · A királynő' }, text: { en: 'One queen. One chance. A new generation.', hu: 'Egy királynő. Egyetlen esély. Egy új nemzedék.' },
    move: { from: { s: 1.0, x: 0.3, y: 0 }, to: { s: 1.24, x: -0.2, y: -0.3 }, r: [0, 0], o: '44% 52%', ease: 'cubic-bezier(.2,.6,.25,1)', focus: [9, 0] }, enter: 'blur', exit: 'zoom', cap: 'track', align: 'center', grade: 'rgba(28,20,10,.34)', fx: { col: [226, 214, 190], n: 0.7, vx: 2, vy: -1.5, a: 0.4, r: [0.6, 1.8], glow: 0 } },
  { img: 'assets/intro/s3.jpg', pos: '46% 62%', kicker: { en: 'III · Colony foundation', hu: 'III · Az alapítás' }, text: { en: 'Build your colony from the ground up.', hu: 'Építsd fel a kolóniádat a semmiből.' },
    move: { from: { s: 1.08, x: 0.2, y: 2.2 }, to: { s: 1.12, x: -0.2, y: -2.4 }, r: [0.9, -0.7], o: '46% 64%', ease: 'linear' }, enter: 'rise', exit: 'sink', cap: 'wipe', align: 'left', grade: 'rgba(64,34,14,.62)', filt: 'sepia(.9) hue-rotate(-28deg) saturate(.8) contrast(1.12) brightness(.72)', fx: { col: [150, 108, 70], n: 1, vx: 0.6, vy: 7, a: 0.5, r: [0.7, 2.2], glow: 0 } },
  { img: 'assets/intro/s4.jpg', pos: '58% 52%', kicker: { en: 'IV · Survival', hu: 'IV · Túlélés' }, text: { en: 'Adapt. Develop. Survive.', hu: 'Alkalmazkodj. Fejlődj. Éld túl.' },
    move: { from: { s: 1.2, x: 0.4, y: 0.3 }, to: { s: 1.02, x: -0.5, y: -0.2 }, r: [-0.6, 0], o: '58% 50%', ease: 'cubic-bezier(.3,.05,.2,1)' }, enter: 'flash', exit: 'fade', cap: 'words', align: 'left', grade: 'rgba(34,24,12,.3)', fx: { col: [232, 206, 160], n: 0.8, vx: 3, vy: -2, a: 0.42, r: [0.6, 2.0], glow: 1 } },
];
const SC_T = 3.9, SC_LEN = 4.7, FADE = 1.2;     // jelenet-kezdetek közti idő, jelenethossz, keresztáttűnés (mp)
const CSS = `
#intro{position:fixed;inset:0;z-index:20;background:#040302;overflow:hidden;cursor:pointer;opacity:1;touch-action:manipulation}
#intro .sc{position:absolute;inset:0;opacity:0;will-change:opacity}
#intro .lay{position:absolute;inset:-6%;will-change:transform}
#intro .bg{background-size:cover;filter:blur(22px) brightness(.5) saturate(.9)}
#intro .fg{background-size:cover;filter:contrast(1.07) saturate(.9) brightness(.9);-webkit-mask-image:radial-gradient(ellipse 74% 72% at 50% 50%,#000 52%,rgba(0,0,0,.0) 100%);mask-image:radial-gradient(ellipse 74% 72% at 50% 50%,#000 52%,rgba(0,0,0,0) 100%)}
#intro .grade{position:absolute;inset:0;mix-blend-mode:multiply}
#intro .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,rgba(0,0,0,0) 38%,rgba(2,1,0,.72) 100%),linear-gradient(to top,rgba(2,1,0,.78),rgba(2,1,0,0) 42%)}
#intro .grain{position:absolute;inset:-20%;pointer-events:none;opacity:.09;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");animation:introGrain .7s steps(6) infinite}
@keyframes introGrain{0%{transform:translate(0,0)}20%{transform:translate(-3%,2%)}40%{transform:translate(2%,-3%)}60%{transform:translate(-2%,-1%)}80%{transform:translate(3%,3%)}100%{transform:translate(0,0)}}
#intro canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#intro .bar{position:absolute;left:0;right:0;height:5.5vh;background:#000;z-index:3}#intro .bar.t{top:0}#intro .bar.b{bottom:0}
#intro .cap{position:absolute;left:8vw;right:8vw;bottom:15vh;z-index:2;pointer-events:none;color:#efe6d6;text-shadow:0 2px 24px rgba(0,0,0,.85)}
#intro .cap .k{font:500 clamp(10px,1.15vw,14px)/1 system-ui,sans-serif;letter-spacing:.42em;text-transform:uppercase;color:#d3a35c;margin-bottom:1.4vh;opacity:0}
#intro .cap .rule{width:0;height:1px;background:linear-gradient(90deg,#d3a35c,rgba(211,163,92,0));margin:0 0 2vh}
#intro .cap .t{font:300 clamp(21px,3.5vw,50px)/1.18 Georgia,"Times New Roman",serif;letter-spacing:.015em;max-width:21em;opacity:0}
#intro .final{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2;opacity:0;pointer-events:none;text-align:center}
#intro .final b{font:700 clamp(26px,6vw,78px)/1 Georgia,serif;letter-spacing:.16em;color:#efe6d6;text-shadow:0 4px 40px #000}
#intro .final i{font:normal 400 clamp(10px,1.2vw,14px)/1 system-ui,sans-serif;letter-spacing:.42em;text-transform:uppercase;color:#a8977f;margin-top:2vh}
#intro .skip{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(calc(5.5vh + 10px),env(safe-area-inset-bottom));z-index:4;background:rgba(0,0,0,.35);border:1px solid rgba(220,180,120,.3);color:#cdbf9f;font:500 12px system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;padding:9px 14px;border-radius:20px;opacity:0;cursor:pointer}
@media (max-aspect-ratio:1/1){#intro .cap{left:6vw;right:6vw;bottom:19vh}#intro .cap .t{font-size:clamp(22px,6.4vw,38px)}}
`;

export function playIntro(opts = {}) {
  return new Promise((resolve) => {
    const lang = opts.lang || LANG; const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = document.createElement('div'); root.id = 'intro';
    root.innerHTML = '<div class="bar t"></div><div class="bar b"></div>' + SCENES.map((s) => `<div class="sc"><div class="lay bg" style="background-image:url(${s.img});background-position:${s.pos}${s.filt ? `;filter:blur(22px) ${s.filt}` : ''}"></div><div class="lay fg" style="background-image:url(${s.img});background-position:${s.pos}${s.filt ? `;filter:${s.filt}` : ''}"></div><div class="grade" style="background:${s.grade}"></div></div>`).join('')
      + '<canvas></canvas><div class="vig"></div><div class="grain"></div><div class="cap"><div class="k"></div><div class="rule"></div><div class="t"></div></div>'
      + `<div class="final"><b>MICROFORMICARIA</b><i>${opts.sub || ''}</i></div><button class="skip">${lang === 'hu' ? 'Kihagyás' : 'Skip'} ›</button>`;
    document.body.appendChild(root);
    const sc = [...root.querySelectorAll('.sc')], cap = root.querySelector('.cap'), kEl = cap.querySelector('.k'), rule = cap.querySelector('.rule'), tEl = cap.querySelector('.t'), fin = root.querySelector('.final'), skip = root.querySelector('.skip'), cv = root.querySelector('canvas');
    const anims = []; const A = (el, kf, o) => { const a = el.animate(kf, { fill: 'forwards', ...o }); anims.push(a); return a; };
    let done = false, timers = [], raf = 0, scene = 0;
    const T = (fn, s) => timers.push(setTimeout(fn, s * 1000));
    // ---- részecskék (könnyű 2D vászon)
    const ctx = cv.getContext('2d'); let W = 0, H = 0; const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const size = () => { W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr); }; size(); addEventListener('resize', size);
    const N = (matchMedia('(pointer:coarse)').matches ? 38 : 70); const P = []; let fx = SCENES[0].fx, fxAlpha = 0;
    const spawn = (p, anywhere) => { p.x = Math.random() * W; p.y = anywhere ? Math.random() * H : (fx.vy < 0 ? H + 10 : -10); p.z = Math.random(); p.r = (fx.r[0] + Math.random() * (fx.r[1] - fx.r[0])) * dpr * (0.5 + p.z); p.ph = Math.random() * 6.28; p.a = 0.3 + Math.random() * 0.7; };
    for (let i = 0; i < N; i++) { const p = {}; spawn(p, true); P.push(p); }
    let last = performance.now(), t0 = last;
    const tick = (now) => { raf = requestAnimationFrame(tick); const dt = Math.min(0.05, (now - last) / 1000); last = now; ctx.clearRect(0, 0, W, H);
      fxAlpha += ((done ? 0 : 1) - fxAlpha) * Math.min(1, dt * 1.5); const [r, g, b] = fx.col;
      for (const p of P) { p.x += (fx.vx * (0.4 + p.z) + Math.sin(now / 1700 + p.ph) * 6) * dt * dpr; p.y += fx.vy * (0.4 + p.z) * dt * dpr; if (p.y < -12 || p.y > H + 12 || p.x < -12 || p.x > W + 12) spawn(p, false);
        const al = p.a * fx.a * fxAlpha * (0.6 + 0.4 * Math.sin(now / 900 + p.ph)); if (fx.glow) { const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2); gr.addColorStop(0, `rgba(${r},${g},${b},${al})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, 6.283); ctx.fill(); }
        else { ctx.fillStyle = `rgba(${r},${g},${b},${al})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); } } };
    raf = requestAnimationFrame(tick);
    // ---- jelenetek
    const ENTER = {
      fade: [{ opacity: 0 }, { opacity: 1 }],
      blur: [{ opacity: 0, filter: 'blur(18px)' }, { opacity: 1, filter: 'blur(0px)' }],
      rise: [{ opacity: 0, transform: 'translateY(8%)' }, { opacity: 1, transform: 'none' }],
      flash: [{ opacity: 0, filter: 'brightness(2.6) saturate(.5)' }, { opacity: 1, filter: 'brightness(1) saturate(1)' }],
    };
    const EXIT = {
      fade: [{ opacity: 1 }, { opacity: 0 }],
      zoom: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.14)' }],
      sink: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-7%)' }],
    };
    const capA = []; const C = (el, kf, o) => { const a = A(el, kf, o); capA.push(a); return a; };
    function capIn(S) {
      capA.forEach((a) => a.cancel()); capA.length = 0;
      const ctr = S.align === 'center'; cap.style.textAlign = ctr ? 'center' : ''; tEl.style.margin = ctr ? '0 auto' : ''; rule.style.margin = ctr ? '0 auto 2vh' : '';
      kEl.textContent = S.kicker[lang]; tEl.textContent = S.text[lang];
      const ease = 'cubic-bezier(.2,.7,.2,1)';
      if (S.cap === 'track') {            // betűköz összehúzódás (II)
        C(kEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 1200 });
        C(rule, [{ width: 0 }, { width: '9em' }], { duration: 1500, easing: 'ease-out' });
        C(tEl, [{ opacity: 0, letterSpacing: '.28em' }, { opacity: 1, letterSpacing: '.015em' }], { duration: 2000, delay: 200, easing: 'ease-out' });
      } else if (S.cap === 'wipe') {      // balról jobbra felfedő maszk (III)
        C(kEl, [{ opacity: 0, transform: 'translateX(-18px)' }, { opacity: 1, transform: 'none' }], { duration: 900, easing: 'ease-out' });
        C(rule, [{ width: 0 }, { width: '9em' }], { duration: 900, easing: 'ease-in-out' });
        C(tEl, [{ opacity: 1, clipPath: 'inset(0 100% 0 0)', transform: 'translateX(-14px)' }, { opacity: 1, clipPath: 'inset(0 0% 0 0)', transform: 'none' }], { duration: 1500, delay: 350, easing: 'cubic-bezier(.65,0,.25,1)' });
      } else if (S.cap === 'words') {     // szavanként (IV)
        C(kEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
        C(rule, [{ width: 0 }, { width: '9em' }], { duration: 1100, easing: 'ease-out' });
        tEl.innerHTML = S.text[lang].split(' ').map((w) => `<span style="display:inline-block;opacity:0;margin-right:.28em">${w}</span>`).join('');
        C(tEl, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 });
        [...tEl.children].forEach((w, j) => C(w, [{ opacity: 0, transform: 'translateY(.6em) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 250 + j * 380, easing: ease }));
      } else {                            // alap: felúszó, élesedő sor (I)
        C(kEl, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 900, easing: 'ease-out' });
        C(rule, [{ width: 0 }, { width: '9em' }], { duration: 1300, easing: 'ease-out' });
        C(tEl, [{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 1500, delay: 250, easing: ease });
      }
    }
    function capOut() { for (const e of [kEl, tEl, rule]) C(e, [{ opacity: 1 }, { opacity: 0 }], { duration: 600 }); }
    const FG0 = 'contrast(1.07) saturate(.9) brightness(.9)';
    function show(i) {
      scene = i; const S = SCENES[i], el = sc[i], [bg, fg] = el.querySelectorAll('.lay'); const m = S.move, k = reduce ? 0 : 1;
      const tr = (q, par, sc2, rot) => `translate(${q.x * par * k}%,${q.y * par * k}%) rotate(${(rot || 0) * k * (par < 0 ? 1.4 : 1)}deg) scale(${q.s * sc2})`;
      el.style.opacity = 0; A(el, ENTER[S.enter], { duration: i === 0 ? 1600 : (S.enter === 'flash' ? 1500 : S.enter === 'blur' ? 1700 : FADE * 1000), easing: 'ease-in-out' });
      for (const [lay, par, sc2] of [[fg, 1, 1], [bg, -0.55, 1.08]]) {
        lay.style.transformOrigin = m.o;
        const kf = [{ transform: tr(m.from, par, sc2, m.r && m.r[0]) }]; if (m.mid) kf.push({ transform: tr(m.mid, par, sc2, m.r && (m.r[0] + m.r[1]) / 2), offset: 0.5 }); kf.push({ transform: tr(m.to, par, sc2, m.r && m.r[1]) });
        A(lay, kf, { duration: (SC_LEN + 0.8) * 1000, easing: m.ease });
      }
      if (m.focus && !S.filt && !reduce) A(fg, [{ filter: `${FG0} blur(${m.focus[0]}px)` }, { filter: `${FG0} blur(${m.focus[1]}px)`, offset: 0.4 }, { filter: `${FG0} blur(${m.focus[1]}px)` }], { duration: (SC_LEN + 0.8) * 1000, easing: 'ease-out' });
      fx = S.fx; for (const p of P) if (Math.random() < 0.5) spawn(p, true);
      T(() => { if (!done) capIn(S); }, 0.9);
      T(() => { if (!done) capOut(); }, SC_LEN - 0.75);
    }
    // sorrend
    A(root.querySelector('.bar.t'), [{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: 1400, easing: 'ease-out' }); A(root.querySelector('.bar.b'), [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 1400, easing: 'ease-out' });
    SCENES.forEach((_, i) => T(() => { if (i > 0) { const pv = SCENES[i - 1]; A(sc[i - 1], EXIT[pv.exit] || EXIT.fade, { duration: FADE * 1000, easing: 'ease-in-out' }); } show(i); }, i * SC_T));
    T(() => A(skip, [{ opacity: 0 }, { opacity: 0.85 }], { duration: 600 }), 0.8);
    const tEnd = 3 * SC_T + SC_LEN;
    T(() => { if (done) return; A(sc[3], [{ opacity: 1 }, { opacity: 0 }], { duration: 1100, easing: 'ease-in' }); fin.style.opacity = 0; A(fin, [{ opacity: 0 }, { opacity: 1 }], { duration: 1200, delay: 500, easing: 'ease-out' }); }, tEnd - 0.4);
    T(() => finish(false), tEnd + 2.6);
    function finish(quick) {
      if (done) return; done = true; timers.forEach(clearTimeout);
      const d = quick ? 380 : 900; root.style.pointerEvents = 'none'; const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, fill: 'forwards', delay: quick ? 0 : 150 });
      document.removeEventListener('keydown', onKey);
      a.onfinish = () => { cancelAnimationFrame(raf); removeEventListener('resize', size); root.remove(); st.remove(); resolve(); };
    }
    // a kihagyás nem vágja el durván: gyors áttűnés a feketébe
    const onKey = (e) => { if (['Escape', 'Enter', 'Space', 'KeyQ'].includes(e.code)) { e.preventDefault(); finish(true); } };
    document.addEventListener('keydown', onKey); root.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); finish(true); });
  });
}
