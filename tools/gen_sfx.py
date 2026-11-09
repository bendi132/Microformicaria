#!/usr/bin/env python3
"""Hangeffektek generálása kóddal (járás, peterakás) + a mellékelt felvételek (tücsök, állkapocs) feldolgozása.
Kimenet: assets/sfx/*.wav  (járás/peterakás: 48 kHz, 24 bit, mono; előtte-utána rövid csend).
Futtatás:  python3 tools/gen_sfx.py [tücsök.mp3 [snap.mp3]]
"""
import sys, wave, subprocess, os
import numpy as np
from scipy import signal

SR = 48000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx')
os.makedirs(OUT, exist_ok=True)


def write_wav(path, x, sr, bits=24):
    x = np.clip(x, -1, 1)
    if bits == 24:
        v = np.round(x * 8388607).astype(np.int32)
        b = np.empty((len(v), 3), dtype=np.uint8)
        b[:, 0] = v & 0xFF; b[:, 1] = (v >> 8) & 0xFF; b[:, 2] = (v >> 16) & 0xFF
        data = b.tobytes(); sw = 3
    else:
        data = np.round(x * 32767).astype('<i2').tobytes(); sw = 2
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(sw); w.setframerate(sr); w.writeframes(data)


def band(x, lo, hi, order=2, sr=SR):
    sos = signal.butter(order, [lo, hi], btype='band', fs=sr, output='sos')
    return signal.sosfilt(sos, x)


def hp(x, f, order=2, sr=SR):
    return signal.sosfilt(signal.butter(order, f, btype='high', fs=sr, output='sos'), x)


def lp(x, f, order=2, sr=SR):
    return signal.sosfilt(signal.butter(order, f, btype='low', fs=sr, output='sos'), x)


def add(buf, i, s):
    if i < 0: s = s[-i:]; i = 0
    n = min(len(s), len(buf) - i)
    if n > 0: buf[i:i + n] += s[:n]


# ------------------------------------------------------------------ 1) járás
def tap(rng, amp):
    """Egy lábfej érintkezése: aprócska, száraz kopp (zajimpulzus + kis rezonancia)."""
    n = int(SR * 0.012); t = np.arange(n) / SR
    tau = rng.uniform(0.0004, 0.0011)
    s = rng.standard_normal(n) * np.exp(-t / tau)
    s = band(s, rng.uniform(2200, 4200), rng.uniform(6500, 11000))
    f0 = rng.uniform(900, 2600)
    s += 0.35 * np.sin(2 * np.pi * f0 * t) * np.exp(-t / rng.uniform(0.0018, 0.0042))   # az aljzat finom csengése
    return s * amp


def scratch(rng, amp):
    """Karmocska száraz súrlódása az aljzaton."""
    n = int(SR * rng.uniform(0.006, 0.020)); t = np.linspace(0, 1, n)
    s = hp(rng.standard_normal(n), 3000)
    mod = lp(np.abs(rng.standard_normal(n)), 900, 1) + 0.15
    return s * np.sin(np.pi * t) ** 2 * mod * amp


def gen_walk(seed=7):
    rng = np.random.default_rng(seed)
    total, lead, tail = 7.0, 0.55, 0.55
    buf = np.zeros(int(SR * total))
    t = lead + 0.03
    end = total - tail - 0.04
    # a ciklusidő lassan változik, néha megáll egy pillanatra (csápmozgatás), néha gyorsabb
    T = 0.098; pause_at = sorted(rng.uniform(1.6, 5.2, 2))
    while t < end - 0.05:
        T = float(np.clip(T + rng.normal(0, 0.006), 0.075, 0.125))
        if pause_at and t > pause_at[0]:
            t += rng.uniform(0.22, 0.38); pause_at.pop(0)
            if t >= end - 0.05: break
        for ph in (0, 1):                                  # háromlábas járás: két lábcsoport váltakozva
            base = t + ph * T / 2 * rng.uniform(0.94, 1.06)
            if base >= end: break
            gain = rng.uniform(0.55, 1.0) * (0.85 if ph else 1.0)
            for leg in range(3):
                off = rng.uniform(0, 0.0045)
                add(buf, int((base + off) * SR), tap(rng, gain * rng.uniform(0.55, 1.0)))
                if rng.random() < 0.5:
                    add(buf, int((base + off + rng.uniform(0.001, 0.004)) * SR), scratch(rng, 0.16 * gain))
        t += T
    buf = hp(buf, 500); buf = lp(buf, 15000)
    buf *= 0.5 / np.max(np.abs(buf))
    write_wav(os.path.join(OUT, 'walk.wav'), buf, SR)
    return lead, total - tail


# ------------------------------------------------------------------ 2) peterakás
def gen_lay(seed=11):
    rng = np.random.default_rng(seed)
    total = 4.0; buf = np.zeros(int(SR * total))

    def rustle(t0, dur, amp, lo=1500, hi=6500):
        n = int(SR * dur); t = np.linspace(0, 1, n)
        s = band(rng.standard_normal(n), lo, hi)
        env = np.sin(np.pi * t) ** 2.2 * (0.55 + 0.45 * lp(np.abs(rng.standard_normal(n)), 35, 1) / 0.35)
        env = np.clip(env, 0, None)
        add(buf, int(t0 * SR), s * env * amp)

    rustle(0.62, 0.62, 0.22)                 # a potroh finom mozdulata
    rustle(1.30, 0.50, 0.30, 1200, 5200)
    rustle(1.78, 0.28, 0.20, 1800, 7000)
    # a kibocsátás: nagyon halk, lágy, "száraz" közép-mély lehelet (nem nedves)
    n = int(SR * 0.16); t = np.linspace(0, 1, n)
    rel = band(rng.standard_normal(n), 300, 1500) * np.sin(np.pi * t) ** 2 * 0.22
    add(buf, int(2.02 * SR), rel)
    # a pete érintkezése az aljzattal: apró, tompa koppanás
    n = int(SR * 0.05); tt = np.arange(n) / SR
    tick = (np.sin(2 * np.pi * 1850 * tt) * np.exp(-tt / 0.0050) * 0.55 + np.sin(2 * np.pi * 3100 * tt) * np.exp(-tt / 0.0030) * 0.25
            + band(rng.standard_normal(n), 2500, 9000) * np.exp(-tt / 0.0007) * 0.5) * 0.30
    add(buf, int(2.19 * SR), tick)
    rustle(2.45, 0.40, 0.14, 1400, 5000)     # a potroh visszatér
    rustle(2.95, 0.22, 0.07, 1800, 6000)
    buf = hp(buf, 250); buf = lp(buf, 14000)
    buf *= 0.35 / np.max(np.abs(buf))
    write_wav(os.path.join(OUT, 'lay.wav'), buf, SR)


# ------------------------------------------------------------------ 3) mellékelt felvételek
def decode(path, sr):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def gen_cricket(src, cut_end=2.0, sr=24000):
    x = decode(src, sr)
    x = x[:len(x) - int(cut_end * sr)]            # az utolsó két másodpercben emberi hang van: levágva
    # az 5. másodperc körüli mély puffanás (nem tücsök) ismétlődő hangnál zavaró: a 1,5 kHz alatti sáv ott lecsengetve
    sos = signal.butter(4, 1500, 'low', fs=sr, output='sos'); low = signal.sosfilt(sos, x); duck = np.ones(len(x))
    a, b = int(4.10 * sr), int(5.10 * sr); w = 0.5 - 0.5 * np.cos(np.linspace(0, 2 * np.pi, b - a)); duck[a:b] = 1 - 0.85 * w
    x = (x - low) + low * duck
    c = int(0.8 * sr)                             # varrat nélküli ismétléshez: a vég átkeverése az elejébe
    y = x[c:].copy()
    f = np.linspace(0, 1, c)
    y[-c:] = x[-c:] * np.cos(f * np.pi / 2) + x[:c] * np.sin(f * np.pi / 2)
    y *= 0.8 / np.max(np.abs(y))
    return len(y) / sr


def gen_snap(src, sr=24000):
    x = decode(src, sr)
    thr = 0.02 * np.max(np.abs(x)); idx = np.where(np.abs(x) > thr)[0]
    a = max(0, idx[0] - int(0.01 * sr)); b = min(len(x), idx[-1] + int(0.05 * sr))
    y = x[a:b].copy(); fo = int(0.03 * sr); y[-fo:] *= np.linspace(1, 0, fo)
    y *= 0.9 / np.max(np.abs(y))
    write_wav(os.path.join(OUT, 'snap.wav'), y, sr, 16)
    return len(y) / sr


if __name__ == '__main__':
    lead, tail_start = gen_walk(); gen_lay()
    print('walk loop', lead, tail_start)
    if len(sys.argv) > 1: print('cricket s', gen_cricket(sys.argv[1]))
    if len(sys.argv) > 2: print('snap s', gen_snap(sys.argv[2]))
