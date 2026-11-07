"""Skorpió (GLB, 10 külön háló, szegmentált végtagok) -> egy animálható GLB: 8 járólábas, 2 ollós tapogató, farok (szúró)."""
import sys, numpy as np, trimesh, fast_simplification
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
sys.path.insert(0, '.')
from rig_lib import *
IN, OUT = sys.argv[1], sys.argv[2]
R = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], float)          # elöl +Z -> +X
sc = trimesh.load(IN); parts = sc.dump()
ROLE = {0: 7, 1: 0, 2: 2, 3: 2, 4: 0, 5: 2, 6: 0, 7: 1, 8: 1, 9: 1}   # 0 test, 1 láb, 2 tapogató (olló), 7 farok
Vs, Fs, Cs, Rs, Cid = [], [], [], [], []; off = 0; cid0 = 0
for k, g in enumerate(parts):
    g = g.copy(); g.merge_vertices(); col = g.visual.to_color().vertex_colors[:, :3] / 255.0
    cc = trimesh.graph.connected_components(g.edges, nodes=np.arange(len(g.vertices)))
    lab = np.zeros(len(g.vertices), int)
    for i, c in enumerate(cc): lab[c] = cid0 + i
    cid0 += len(cc)
    Vs.append(np.asarray(g.vertices) @ R.T); Fs.append(np.asarray(g.faces) + off); Cs.append(col); Rs.append(np.full(len(g.vertices), ROLE[k])); Cid.append(lab); off += len(g.vertices)
V = np.vstack(Vs); F = np.vstack(Fs); C = np.vstack(Cs); role = np.concatenate(Rs); cid = np.concatenate(Cid)
# a szegmensek (darabok) csoportosítása végtagokká: közeli darabok összetartoznak
par = {}
def fnd(a):
    while par.setdefault(a, a) != a: par[a] = par[par[a]]; a = par[a]
    return a
for r in (1, 2):
    idx = np.where(role == r)[0]; sub = idx[::3]; tr = cKDTree(V[sub])
    for a, b in tr.query_pairs(1.6):
        la, lb = cid[sub[a]], cid[sub[b]]
        if la != lb: par[fnd(la)] = fnd(lb)
grp = np.array([fnd(c) if role[i] in (1, 2) else -1 for i, c in enumerate(cid)])
for r in (1, 2):
    ids, cnt = np.unique(grp[role == r], return_counts=True)
    print('role', r, 'groups', len(ids), 'sizes', sorted(cnt.tolist(), reverse=True)[:14])
np.savez('/tmp/scorpion_pre.npz', V=V, F=F, C=C, role=role, grp=grp)
# tapogatók két oldalra: a darabok súlypontjának oldala szerint
pal = np.where(role == 2)[0]
side_of = {}
for c in np.unique(cid[pal]): side_of[c] = np.sign(V[cid == c][:, 2].mean())
pside = np.zeros(len(V)); pside[pal] = [side_of[c] for c in cid[pal]]
grp = np.where(role == 2, 100000 + (pside > 0).astype(int), grp)
# egyszerűsítés szerepenként (a címkék pontosak maradnak)
ratio = {0: 0.30, 1: 0.14, 2: 0.16, 7: 0.75}
Vn, Fn, Cn, Rn, Gn = [], [], [], [], []; o = 0
for r in (0, 1, 2, 7):
    fm = role[F[:, 0]] == r; fr = F[fm]; used = np.unique(fr); remap = -np.ones(len(V), int); remap[used] = np.arange(len(used))
    vv = V[used]; ff = remap[fr]
    v2, f2 = fast_simplification.simplify(vv.astype(np.float32), ff.astype(np.int32), target_reduction=1 - ratio[r], agg=5)
    _, nn = cKDTree(vv).query(v2)
    Vn.append(v2); Fn.append(f2 + o); Cn.append(C[used][nn]); Rn.append(np.full(len(v2), r)); Gn.append(grp[used][nn]); o += len(v2)
    print('role', r, len(ff), '->', len(f2))
V = np.vstack(Vn); F = np.vstack(Fn); C = np.vstack(Cn); role = np.concatenate(Rn); grp = np.concatenate(Gn); n = len(V)
part = np.zeros(n, np.float32); lid = np.zeros(n, np.float32); w = np.zeros(n, np.float32); pv = np.zeros((n, 3), np.float32)
# lábak
lg = [g for g in np.unique(grp[role == 1])]
info = []
for g in lg:
    idx = np.where((role == 1) & (grp == g))[0]; P = V[idx]; piv = P[np.argmin(np.abs(P[:, 2]))]
    info.append((g, idx, piv, np.sign(P[:, 2].mean())))
for side in (1, -1):
    sl = sorted([t for t in info if t[3] == side], key=lambda t: -t[2][0])
    for j, (g, idx, piv, sd) in enumerate(sl):
        d = np.linalg.norm(V[idx] - piv, axis=1); w[idx] = d / d.max(); part[idx] = 1; lid[idx] = j * 2 + (0 if side > 0 else 1); pv[idx] = piv
        print('leg', j, 'side', side, 'pivot', piv.round(1))
# tapogatók (ollók)
for gid in (100000, 100001):
    idx = np.where((role == 2) & (grp == gid))[0]; P = V[idx]; sel = P[np.abs(P[:, 2]) > 9]; piv = sel[np.argsort(np.abs(sel[:, 2]))[:max(8, len(sel) // 60)]].mean(0)
    d = np.linalg.norm(P - piv, axis=1); w[idx] = d / d.max(); part[idx] = 2; lid[idx] = float(gid == 100000); pv[idx] = piv
    print('palp', gid, 'pivot', piv.round(1), 'n', len(idx))
# farok: a törzshöz legközelebbi pont = tőpont; a súly a hálón mért (geodéziai) távolság a tőponttól
ti = np.where(role == 7)[0]; bi = np.where(role == 0)[0]
tt = ti[V[ti][:, 1] > 30]; bz = V[tt][:, 1]; bp = V[tt][bz < bz.min() + 4].mean(0); base = tt[np.argmin(np.linalg.norm(V[tt] - bp, axis=1))]
loc = -np.ones(n, int); loc[ti] = np.arange(len(ti))
fm = (role[F[:, 0]] == 7); ft = loc[F[fm]]
e = np.vstack([ft[:, [0, 1]], ft[:, [1, 2]], ft[:, [2, 0]]]); el = np.linalg.norm(V[ti][e[:, 0]] - V[ti][e[:, 1]], axis=1)
Gm = coo_matrix((np.r_[el, el], (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(len(ti), len(ti))).tocsr()
geo = dijkstra(Gm, indices=loc[base]); geo[~np.isfinite(geo)] = 0
part[ti] = 7; w[ti] = geo / geo.max(); pv[ti] = [bp[0], bp[1], 0.0]; print('tail base', V[base].round(1), 'verts', len(ti))
# normalizálás: a törzs (farok nélkül) hossza = 1, talp y = 0, középre
bo = V[role == 0]; bl = bo[:, 0].max() - bo[:, 0].min()
offv = np.array([(bo[:, 0].max() + bo[:, 0].min()) / 2, V[:, 1].min(), 0.0])
V2 = (V - offv) / bl; PV2 = ((pv - offv) / bl) * (part[:, None] > 0)
col = np.c_[np.clip(C * 1.0 + 0.02, 0, 1), np.ones(n)]
nrm = trimesh.Trimesh(V2, F, process=False).vertex_normals
mesh = dict(name='scorpion', positions=V2, normals=nrm, indices=F, attrs={'_PART': (part, 1), '_LID': (lid, 1), '_W': (w, 1), '_PIVOT': (PV2, 3), 'COLOR_0': (col, 4)}, color=[1, 1, 1, 1], roughness=0.5)
write_glb(OUT, [mesh], dict(bodyLength=1.0, height=float(V2[:, 1].max()), bounds=[V2.min(0).tolist(), V2.max(0).tolist()], tailBase=PV2[base].tolist()))
print('ok', n, len(F), V2.min(0).round(2), V2.max(0).round(2))
