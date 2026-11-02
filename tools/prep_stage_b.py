"""B fázis: végtagok azonosítása (vastagságmérés + összefüggő komponensek), animációs attribútumok kiszámítása, GLB kiírás."""
import sys, numpy as np, trimesh, json
sys.path.insert(0, '.')
from rig_lib import *
IN, OUT, which = sys.argv[1], sys.argv[2], sys.argv[3]
d = np.load(IN); v = d['v']; f = d['f']; th = d['th']; col = d['colors']
n = len(v)
CFG = {
  # thr: vastagsági küszöb a vékony végtagokhoz; head_x/gaster_x: a fej és a potroh határa kanonikus (előre=+X) koordinátában
  'ponera':     dict(thr=0.10, head_x=0.25, gaster_x=-0.20, ant=lambda c, s, mn: c[0] > 0.5, leg=lambda c, s, mn: s >= 300, grow=0.17),
  'cephalotes': dict(thr=0.12, head_x=0.33, gaster_x=-0.18, ant=lambda c, s, mn: False, leg=lambda c, s, mn: s >= 900, grow=0.16, ycut=0.19),
  'odonto':     dict(thr=0.04, head_x=0.37, gaster_x=-0.15, ant=lambda c, s, mn: c[0] > 0.5 and 300 < s < 800 and abs(c[2]) > 0.1, leg=lambda c, s, mn: s >= 1000 and c[0] < 0.6, grow=0.06),
  'proceratium': dict(thr=0.12, head_x=0.45, gaster_x=-0.25, ant=lambda c, s, mn: c[0] > 0.7 and s > 300, leg=lambda c, s, mn: s >= 700 and abs(c[2]) > 0.15 and c[1] < 0.1 and c[0] < 0.6, grow=0.15),
  'springtail': dict(thr=0.12, head_x=0.50, gaster_x=-99, ant=lambda c, s, mn: c[0] > 0.7 and s > 300 and c[1] < 0.3, leg=lambda c, s, mn: s >= 300 and abs(c[2]) > 0.15 and c[1] < 0.1 and c[0] < 0.6, grow=0.15),
}[which if which != 'cephalotes_q' else 'cephalotes']
part = np.zeros(n, np.float32); lid = np.zeros(n, np.float32); w = np.zeros(n, np.float32); piv = np.zeros((n, 3), np.float32)
lab = vertex_components(n, f, th < CFG['thr'])
ids, cnt = np.unique(lab[lab >= 0], return_counts=True)
legs = []; ants = []
for i, c in zip(ids, cnt):
    if c < 60: continue
    idx = np.where(lab == i)[0]; cen = v[idx].mean(0)
    mn = v[idx].min(0)
    if CFG['ant'](cen, c, mn): ants.append((i, idx, cen))
    elif CFG['leg'](cen, c, mn): legs.append((i, idx, cen))
print(which, 'legs', len(legs), 'antennae', len(ants))
# szomszédság a gyökér meghatározásához
nb = [[] for _ in range(n)]
for a, b in zip(np.r_[f[:, 0], f[:, 1], f[:, 2]], np.r_[f[:, 1], f[:, 2], f[:, 0]]): nb[a].append(b)
def root_of(idx):
    s = set(idx.tolist()); bnd = [k for k in idx if any(j not in s for j in nb[k])]
    if not bnd: bnd = list(idx)
    bnd = np.array(bnd); return v[bnd[np.argmin(np.abs(v[bnd][:, 2]) + 0.0 * v[bnd][:, 1])]]
# lábak: oldal (z előjele) és elöl-hátul sorrend
def grow(idx, thr2, other):
    s = set(idx.tolist()); front = list(idx)
    while front:
        nxt = []
        for k in front:
            for j in nb[k]:
                if j not in s and th[j] < thr2 and not other[j]:
                    s.add(j); nxt.append(j)
        front = nxt
    return np.array(sorted(s))
taken = np.zeros(n, bool)
for _, idx, _ in legs + ants: taken[idx] = True
legs = [(i, grow(idx, CFG['grow'], taken), cen) for i, idx, cen in legs]
ants = [(i, grow(idx, CFG['grow'], taken), cen) for i, idx, cen in ants]
legs.sort(key=lambda t: (-t[2][0]))
order = []
for side in (1, -1):
    sl = [t for t in legs if np.sign(t[2][2] if t[2][2] != 0 else 1) == side]
    sl.sort(key=lambda t: -t[2][0]); order.append(sl)
lid_counter = 0
leg_info = []
for side_i, sl in enumerate(order):
    for k, (i, idx, cen) in enumerate(sl):
        r = root_of(idx); dist = np.linalg.norm(v[idx] - r, axis=1); w[idx] = dist / dist.max()
        part[idx] = 1; lid[idx] = k * 2 + side_i; piv[idx] = r; leg_info.append((k, side_i, r.tolist()))
for j, (i, idx, cen) in enumerate(sorted(ants, key=lambda t: -t[2][2])):
    r = root_of(idx); dist = np.linalg.norm(v[idx] - r, axis=1); w[idx] = dist / dist.max()
    part[idx] = 2; lid[idx] = j; piv[idx] = r
# a vékony héjszerű felületek (fejtető, tor) ne váljanak lábbá: a láb a magasságmetszet alatt marad, súlya a magasságból jön
if 'ycut' in CFG and legs:
    lv = np.concatenate([idx for _, idx, _ in legs]); feet0 = v[lv, 1].min(); nl = np.ones(n, bool); nl[lv] = False
    bl0 = v[nl, 0].max() - v[nl, 0].min(); yc = feet0 + CFG['ycut'] * bl0
    hi = (part == 1) & (v[:, 1] > yc); part[hi] = 0; w[hi] = 0; lid[hi] = 0
    lg_ = part == 1; w[lg_] = np.clip((yc - v[lg_, 1]) / (yc - feet0), 0, 1); print('ycut: demoted', int(hi.sum()), 'leg verts', int(lg_.sum()))
# rágók (csak Odontomachus): a fej elülső blokkja
free = part == 0
if which == 'odonto':
    mm = free & (v[:, 0] > 0.62) & (np.abs(v[:, 2]) < 0.1) & (v[:, 1] < 0.12)
    part[mm] = 3; lid[mm] = (v[mm, 2] > 0).astype(np.float32); w[mm] = np.clip((v[mm, 0] - 0.62) / 0.2, 0, 1)
    piv[mm] = np.stack([np.full(mm.sum(), 0.62), np.full(mm.sum(), 0.06), np.sign(v[mm, 2]) * 0.03], 1)
free = part == 0
if which == 'springtail':     # ugróvilla (furcula): a hasi oldalon, a test alatt hátul
    fm = free & (v[:, 1] < -0.04) & (v[:, 0] < -0.12) & (th < 0.12) & (np.abs(v[:, 2]) < 0.2)
    if fm.sum() > 20:
        x0 = v[fm, 0].min(); x1 = v[fm, 0].max()
        part[fm] = 6; w[fm] = (v[fm, 0] - x0) / (x1 - x0); piv[fm] = [x0, float(v[fm, 1].mean()), 0.0]; print('furcula verts', int(fm.sum()))
free = part == 0
head = free & (v[:, 0] > CFG['head_x']); part[head] = 5
gas = free & (v[:, 0] < CFG['gaster_x']); part[gas] = 4
# testhossz (fej eleje - potroh vége) a nem végtag csúcsokon
body = (part == 0) | (part == 4) | (part == 5) | (part == 3) | (part == 6)
bl = v[body, 0].max() - v[body, 0].min()
cx = (v[body, 0].max() + v[body, 0].min()) / 2
feet = v[part == 1, 1].min()
off = np.array([cx, feet, 0.0])
v2 = (v - off) / bl
piv2 = ((piv - off) / bl) * (part[:, None] >= 1) * ((part[:, None] <= 3) | (part[:, None] == 6))
head_piv = (np.array([CFG['head_x'], float(np.median(v[head, 1])), 0.0]) - off) / bl
gas_piv = (np.array([CFG['gaster_x'], float(np.median(v[gas, 1])), 0.0]) - off) / bl
m = trimesh.Trimesh(v2, f, process=False); nrm = m.vertex_normals
attrs = {'_PART': (part, 1), '_LID': (lid, 1), '_W': (w, 1), '_PIVOT': (piv2, 3)}
mesh = dict(name=which, positions=v2, normals=nrm, indices=f, attrs=attrs, roughness=0.55,
            color=[0.07, 0.06, 0.05, 1] if which in ('ponera', 'proceratium', 'cephalotes_q') else ([0.55, 0.52, 0.48, 1] if which == 'springtail' else None) or ([0.07, 0.065, 0.06, 1] if which == 'cephalotes' else [1, 1, 1, 1]))
if which == 'cephalotes_q':   # királynő: fekete, a potrohon krémszínű foltok; vörösbarna láb- és fejperem (referenciafotók szerint)
    gv = part == 4; gx0, gx1 = v[gv, 0].min(), v[gv, 0].max(); gy = v[gv, 1].mean(); base = np.tile(np.array([0.045, 0.04, 0.036]), (n, 1))
    u = (v[:, 0] - gx0) / (gx1 - gx0); lat = v[:, 2] / max(1e-6, np.abs(v[gv, 2]).max()); dors = v[:, 1] > gy - 0.02
    for cu, cl, ru, rl in [(0.24, 0.5, 0.36, 0.62), (0.72, -0.45, 0.30, 0.55)]:
        dd = ((u - cu) / ru) ** 2 + ((lat - cl) / rl) ** 2; m = gv & dors & (dd < 1); k = np.clip((1 - dd) * 2.2, 0, 1); base[m] = base[m] * (1 - k[m, None]) + np.array([0.97, 0.90, 0.66]) * k[m, None]
    lg = part == 1; t = w[lg][:, None]; base[lg] = np.array([0.07, 0.05, 0.04]) * (1 - t) + np.array([0.30, 0.12, 0.06]) * t
    hd = (part == 5) & (v[:, 0] > v[part == 5, 0].max() - 0.05); base[hd] = base[hd] * 0.4 + np.array([0.28, 0.10, 0.05]) * 0.6
    col = np.clip(base, 0, 1) ** 2.2
if len(col) and which == 'odonto':   # referenciafotók szerint, testrészenként; az eredeti színek csak az árnyalást adják
    lum = np.clip(col.mean(1) / max(col.mean(1).mean(), 1e-6), 0.6, 1.4)[:, None]
    base = np.tile(np.array([0.24, 0.07, 0.04]), (n, 1))                      # tora: sötét vörösesbarna
    base[part == 5] = [0.78, 0.33, 0.06]                                       # fej: élénk narancs
    base[part == 4] = [0.82, 0.42, 0.08]                                       # potroh: borostyán-narancs
    base[part == 3] = [0.33, 0.07, 0.05]                                       # rágó: sötétvörös
    base[part == 2] = [0.55, 0.38, 0.20]                                       # csáp: világos barna
    lg = part == 1; t = w[lg][:, None]
    base[lg] = np.array([0.80, 0.45, 0.10]) * (1 - t) + np.array([0.30, 0.12, 0.05]) * t   # láb: borostyán, a vége sötétedik
    col = np.clip(base * lum, 0, 1) ** 2.2
if len(col) or which == 'cephalotes_q': mesh['attrs']['COLOR_0'] = (np.c_[col, np.ones(len(col))].astype(np.float32), 4)
extras = dict(bodyLength=1.0, headPivot=head_piv.tolist(), gasterPivot=gas_piv.tolist(), legs=len(legs), antennae=len(ants),
              bounds=[(v2.min(0)).tolist(), (v2.max(0)).tolist()], height=float(v2[:, 1].max()), origBodyLength=float(bl))
write_glb(OUT, [mesh], extras)
print('ok', OUT, 'bodyLen(orig)', round(bl, 3), 'extras', json.dumps(extras)[:300])
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig, ax = plt.subplots(2, 1, figsize=(12, 10)); colr = ['gray', 'red', 'blue', 'green', 'orange', 'purple', 'cyan']
for p in range(7):
    s = part == p; ax[0].scatter(v2[s, 0], v2[s, 2], s=0.6, c=colr[p]); ax[1].scatter(v2[s, 0], v2[s, 1], s=0.6, c=colr[p])
ax[0].set_aspect('equal'); ax[1].set_aspect('equal'); plt.savefig(OUT.replace('.glb', '_parts.png'), dpi=55)
