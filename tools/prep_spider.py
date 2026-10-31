"""Pók (GLB) -> egy hálóba olvasztott, animálható GLB: 8 járólábas + 2 elülső végtag + tapogatók + csáprágók."""
import sys, glob, numpy as np, trimesh
sys.path.insert(0, '.')
from rig_lib import *
IN, OUT = sys.argv[1], sys.argv[2]
sc = trimesh.load(IN)
R = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], float)     # elöl +Z -> +X
Vs = []; Fs = []; Cs = []; Ps = []; Ls = []; Ws = []; Pv = []; off = 0
def comps(g):
    g.merge_vertices(); return g, trimesh.graph.connected_components(g.edges, nodes=np.arange(len(g.vertices)))
def color(g):
    c = np.array(g.visual.material.baseColorFactor, float) / 255.0 if np.max(g.visual.material.baseColorFactor) > 1 else np.array(g.visual.material.baseColorFactor, float)
    return c
names = ['Object_0', 'Object_1', 'Object_2', 'Object_3']
for name in names:
    g, cc = comps(sc.geometry[name]); v = g.vertices @ R.T; n = len(v)
    part = np.zeros(n, np.float32); lid = np.zeros(n, np.float32); w = np.zeros(n, np.float32); pv = np.zeros((n, 3), np.float32)
    col = np.tile(color(g), (n, 1)); col[:, 3] = 1
    if name == 'Object_0':
        for c in cc:
            if len(c) == 81:        # csáprágók
                part[c] = 4; ctr = v[c]; r = ctr[np.argmax(ctr[:, 1])]; pv[c] = [ctr[:, 0].min(), ctr[:, 1].max(), ctr[:, 2].mean()]
                dist = np.linalg.norm(ctr - pv[c][0], axis=1); w[c] = dist / dist.max(); lid[c] = float(ctr[:, 2].mean() > 0)
    if name == 'Object_2':
        info = []
        for i, c in enumerate(cc):
            cen = v[c].mean(0); info.append((i, c, cen, len(c)))
        legs = [t for t in info if t[3] > 600 and abs(t[2][2]) > 0.25 and t[2][0] > -1.2 or (t[3] > 600 and abs(t[2][2]) > 0.25)]
        palps = [t for t in info if t[3] in (1184, 130, 32) and abs(t[2][2]) < 0.35 and t[2][0] > 0.4]
        for side in (1, -1):
            sl = sorted([t for t in legs if np.sign(t[2][2]) == side], key=lambda t: -t[2][0])
            for j, (i, c, cen, sz) in enumerate(sl):
                pts = v[c]; r = pts[np.argmin(np.abs(pts[:, 2]))]
                dist = np.linalg.norm(pts - r, axis=1); w[c] = dist / dist.max()
                part[c] = 2 if j == 0 else 1; lid[c] = (j - 1 if j > 0 else 0) * 2 + (0 if side > 0 else 1) if j > 0 else (0 if side > 0 else 1); pv[c] = r
        for (i, c, cen, sz) in palps:
            pts = v[c]; r = pts[np.argmin(pts[:, 0])]
            dist = np.linalg.norm(pts - r, axis=1); w[c] = dist / max(dist.max(), 1e-6); part[c] = 3; lid[c] = float(cen[2] < 0); pv[c] = r
        print('legs found', len(legs), 'palps pieces', len(palps), 'walking', int((part == 1).sum() > 0))
    Vs.append(v); Fs.append(g.faces + off); Cs.append(col); Ps.append(part); Ls.append(lid); Ws.append(w); Pv.append(pv); off += n
V = np.vstack(Vs); F = np.vstack(Fs); C = np.vstack(Cs); P = np.concatenate(Ps); L = np.concatenate(Ls); W = np.concatenate(Ws); PV = np.vstack(Pv)
body_len = V[:, 0].max() - V[:, 0].min(); body_only = V[P == 0]
bl = body_only[:, 0].max() - body_only[:, 0].min()
offv = np.array([(body_only[:, 0].max() + body_only[:, 0].min()) / 2, V[:, 1].min(), 0.0])
V2 = (V - offv) / bl; PV2 = ((PV - offv) / bl) * (P[:, None] > 0)
nrm = trimesh.Trimesh(V2, F, process=False).vertex_normals
mesh = dict(name='spider', positions=V2, normals=nrm, indices=F, attrs={'_PART': (P, 1), '_LID': (L, 1), '_W': (W, 1), '_PIVOT': (PV2, 3), 'COLOR_0': (C, 4)}, color=[1, 1, 1, 1], roughness=0.6)
write_glb(OUT, [mesh], dict(bodyLength=1.0, height=float(V2[:, 1].max()), bounds=[V2.min(0).tolist(), V2.max(0).tolist()]))
print('ok', len(V2), len(F), V2.min(0).round(2), V2.max(0).round(2), 'parts', {int(k): int((P == k).sum()) for k in np.unique(P)})
