"""Ászka (STL) -> animálható GLB: 14 láb + csáp attribútumokkal."""
import sys, numpy as np, trimesh
sys.path.insert(0, '.')
from rig_lib import *
IN, OUT = sys.argv[1], sys.argv[2]
d = np.load(IN); v = d['v'].copy(); f = d['f']; th = d['th']; n = len(v)
v[:, 0] *= -1; v[:, 2] *= -1          # fej: -X -> +X (előre), a kézség megmarad
f = f[:, [0, 2, 1]] if False else f
f = f.copy()
# 180 fokos forgatás Y körül nem tükröz, a lapok sorrendje marad
part = np.zeros(n, np.float32); lid = np.zeros(n, np.float32); w = np.zeros(n, np.float32); piv = np.zeros((n, 3), np.float32)
lab = vertex_components(n, f, th < 0.14)
ids, cnt = np.unique(lab[lab >= 0], return_counts=True)
nb = [[] for _ in range(n)]
for a, b in zip(np.r_[f[:, 0], f[:, 1], f[:, 2]], np.r_[f[:, 1], f[:, 2], f[:, 0]]): nb[a].append(b)
legs = []; ants = []
for i, c in zip(ids, cnt):
    idx = np.where(lab == i)[0]; cen = v[idx].mean(0)
    if c > 90 and cen[0] > 1.8 and cen[1] < 0.8: ants.append((idx, cen))
    elif c > 90 and c < 400 and cen[1] < 0.65 and abs(cen[2]) > 0.4: legs.append((idx, cen))
print('legs', len(legs), 'antennae', len(ants))
def root_of(idx):
    s = set(idx.tolist()); bnd = [k for k in idx if any(j not in s for j in nb[k])]
    bnd = np.array(bnd if bnd else idx)
    return v[bnd[np.argmin(np.abs(v[bnd][:, 2]))]]
k = 0
for side in (1, -1):
    sl = sorted([t for t in legs if np.sign(t[1][2]) == side], key=lambda t: -t[1][0])
    for j, (idx, cen) in enumerate(sl):
        r = root_of(idx); dist = np.linalg.norm(v[idx] - r, axis=1); w[idx] = dist / dist.max()
        part[idx] = 1; lid[idx] = j; piv[idx] = r
for idx, cen in ants:
    r = root_of(idx); dist = np.linalg.norm(v[idx] - r, axis=1); w[idx] = dist / dist.max(); part[idx] = 2; piv[idx] = r
body = part == 0
bl = v[body, 0].max() - v[body, 0].min()
off = np.array([(v[body, 0].max() + v[body, 0].min()) / 2, v[part == 1, 1].min(), 0.0])
v2 = (v - off) / bl; piv2 = ((piv - off) / bl) * (part[:, None] > 0)
nrm = trimesh.Trimesh(v2, f, process=False).vertex_normals
mesh = dict(name='isopod', positions=v2, normals=nrm, indices=f, attrs={'_PART': (part, 1), '_LID': (lid, 1), '_W': (w, 1), '_PIVOT': (piv2, 3)},
            color=[0.42, 0.40, 0.38, 1], roughness=0.5)
write_glb(OUT, [mesh], dict(bodyLength=1.0, height=float(v2[:, 1].max()), bounds=[v2.min(0).tolist(), v2.max(0).tolist()]))
print('ok', len(v2), len(f), v2.min(0).round(2), v2.max(0).round(2))
