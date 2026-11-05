// Háttérzene a főmenühöz és a bevezető slideshow-hoz. A böngészők csak felhasználói érintés után engedik a hangot,
// ezért az első kattintás/billentyű/érintés indítja. A játék indulásakor halkan elhalkul.
const URL = 'assets/music/theme.m4a';
let el = null, want = false, target = 0.5, timer = 0, unlocked = false;
function audio() {
  if (!el) { el = new Audio(URL); el.loop = true; el.preload = 'auto'; el.volume = 0; window.__music = el; }
  return el;
}
function ramp(to, ms, then) {
  clearInterval(timer); const a = audio(); const from = a.volume, t0 = performance.now();
  timer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k >= 1) { clearInterval(timer); if (then) then(); }
  }, 50);
}
export function setMusicVolume(v) { target = Math.max(0, Math.min(1, v)); if (want && el && !el.paused) el.volume = target; }
export function musicPlay() {
  want = true; if (target <= 0) return;
  const a = audio(); if (!a.paused && a.volume > 0) return;
  a.play().then(() => ramp(target, 1200)).catch(() => {});
}
export function musicStop() {
  want = false; if (!el) return;
  ramp(0, 900, () => el.pause());
}
// az első felhasználói esemény elindítja a zenét, ha a menüben vagy a bevezetőben kellene szólnia
function unlock() { if (unlocked) return; unlocked = true; if (want) musicPlay(); }
addEventListener('pointerdown', unlock, { passive: true });
addEventListener('keydown', unlock);
