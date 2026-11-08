// Érintésvezérlés telefonra/táblagépre. Egérrel/billentyűzettel továbbra is minden a régi; itt csak a Pointer Events 'touch' ágát kezeljük.
//  - Felülnézet: 1 ujj húzás = térkép mozgatása, koppintás = kijelölés / parancs, dupla koppintás = átvétel (első személy),
//                2 ujj: csippentés = nagyítás, csavarás = forgatás, függőleges húzás = dőlésszög.
//  - Első személy / földalatti irányítás: bal oldalon lebegő joystick (mozgás, teljes kitérésnél futás), jobb oldalon húzás = körbenézés,
//                gombok: harapás, E, F, X, G (+ ugrás, kilépés).
export const isTouchDevice = () => (window.matchMedia && matchMedia('(pointer:coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export function initTouch(ctx) {
  const { G, canvas, S, click, enterFpv, setFollowBtn } = ctx;
  const touch = ctx.enabled !== undefined ? !!ctx.enabled : isTouchDevice(); document.body.classList.toggle('touch', touch);
  G.joy = { x: 0, y: 0, on: false, sprint: false };
  if (!touch) return { tick() {} };
  const ptr = new Map(); let joyId = null, joyO = null, lookId = null, lastTap = { t: 0, x: 0, y: 0 }, pinch = null;
  const knob = document.createElement('div'); knob.id = 'joy'; knob.innerHTML = '<i></i>'; document.body.appendChild(knob);
  const R = 56, DEAD = 0.14;
  // a joystick rögzített helyen (bal alul) van, mindig látszik első személyben: a bázis középpontjához viszonyítunk
  const setKnob = (vx, vy) => { knob.firstChild.style.transform = `translate(${vx * R}px,${vy * R}px)`; };
  const inGame = () => G.mode === 'game' && !G.paused;
  const fpvLike = () => G.fpv;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !inGame()) return; e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch {}
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0 }; ptr.set(e.pointerId, p);
    if (fpvLike()) {
      if (e.clientX < innerWidth * 0.45 && joyId === null) { joyId = e.pointerId; const r = knob.getBoundingClientRect(); joyO = { x: r.left, y: r.top }; G.joy.on = true; }
      else if (lookId === null) lookId = e.pointerId;
      else if (G.topNest) startPinch();
      return;
    }
    if (ptr.size === 2) startPinch();
  });
  const pts = () => [...ptr.values()];
  function startPinch() { const [a, b] = pts(); if (!a || !b) return; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cy: (a.y + b.y) / 2 }; }
  canvas.addEventListener('pointermove', (e) => {
    const p = ptr.get(e.pointerId); if (!p || e.pointerType !== 'touch') return; e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.moved += Math.abs(dx) + Math.abs(dy); p.x = e.clientX; p.y = e.clientY;
    if (fpvLike()) {
      if (e.pointerId === joyId) { const vx = (p.x - joyO.x) / R, vy = (p.y - joyO.y) / R, l = Math.hypot(vx, vy), nx = l ? vx / l : 0, ny = l ? vy / l : 0, m = Math.min(1, l), k = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
        G.joy.x = nx * k; G.joy.y = -ny * k; G.joy.sprint = l > 1.25; setKnob(nx * m, ny * m); }
      else if (e.pointerId === lookId && G.sim) { const inp = G.sim.input;
        if (G.topNest) { G.nestCam.yaw -= dx * 0.006; G.nestCam.pitch += dy * 0.005; }
        else { const s = 0.0042 * S.sens; inp.yawD -= dx * s; inp.pitchD += (S.inv ? 1 : -1) * dy * s; } }
      else if (G.topNest && ptr.size >= 2 && pinch) doPinch(true);
      return;
    }
    if (ptr.size === 1) { // egy ujj: a térkép mozgatása
      if (G.topNest) return; const sp = G.orbit.dist * 0.0022, sy = Math.sin(G.orbit.yaw), cy = Math.cos(G.orbit.yaw);
      if (p.moved > 8) { G.orbit.x -= (dx * cy - dy * sy) * sp; G.orbit.z -= (-dx * sy - dy * cy) * sp; if (G.follow) { G.follow = false; setFollowBtn(); } }
    } else if (ptr.size === 2 && pinch) doPinch(false);
  });
  function doPinch(nest) {
    const [a, b] = pts(); const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), cy = (a.y + b.y) / 2;
    const o = nest ? G.nestCam : G.orbit; if (d > 8 && pinch.d > 8) o.dist *= pinch.d / d;
    let da = ang - pinch.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; o.yaw += da; o.pitch += (cy - pinch.cy) * 0.004;
    pinch = { d, ang, cy };
  }
  const end = (e) => {
    const p = ptr.get(e.pointerId); if (!p || e.pointerType !== 'touch') return; ptr.delete(e.pointerId);
    if (e.pointerId === joyId) { joyId = null; G.joy.on = false; G.joy.x = G.joy.y = 0; G.joy.sprint = false; setKnob(0, 0); }
    if (e.pointerId === lookId) lookId = null;
    if (ptr.size < 2) pinch = null;
    if (!fpvLike() && e.type === 'pointerup' && p.moved < 12 && performance.now() - p.t0 < 450 && ptr.size === 0) {
      const now = performance.now(), dbl = now - lastTap.t < 330 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 36; lastTap = { t: now, x: p.x, y: p.y };
      if (dbl && G.sel && G.sel.kind === 'ant') enterFpv(); else click(p.x, p.y);
    }
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  // a böngésző saját görgetése / nagyítása ne zavarjon
  document.addEventListener('gesturestart', (e) => e.preventDefault()); document.addEventListener('contextmenu', (e) => e.preventDefault());
  return {
    // a joystick a billentyű-állapotot is hajtja (felülnézeti pásztázás, földalatti irányítás); első személyben analóg értéket ad
    tick() {
      const k = G.keys, j = G.joy;
      if (j.on || j._was) { const t = 0.35; k.w = j.y > t; k.s = j.y < -t; k.a = j.x < -t; k.d = j.x > t; k.shift = !!j.sprint; j._was = j.on; }
      document.body.classList.toggle('tfpv', !!G.fpv);
    },
  };
}
