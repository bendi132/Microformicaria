"""Zajos fotogrammetriás háló (vegyes körüljárás, repedések) -> zárt, kifelé néző háló: felületi voxelezés + kitöltés + marching cubes.
Használat: remesh_scan.py in.glb out.npz [felbontás]   (out: v, f, c — csúcsszínek a legközelebbi eredeti csúcsról)"""
import sys, numpy as np, trimesh
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes
src, out = sys.argv[1], sys.argv[2]; res = int(sys.argv[3]) if len(sys.argv) > 3 else 300
parts = trimesh.load(src).dump()
P = []; C = []
for g in parts:
    s, fi = trimesh.sample.sample_surface(g, 4000000 // len(parts))
    col = g.visual.to_color().vertex_colors[:, :3]
    P.append(s); C.append(col[g.faces[fi][:, 0]])
P = np.vstack(P); C = np.vstack(C)
lo = P.min(0); hi = P.max(0); pitch = (hi - lo).max() / res
idx = np.floor((P - lo) / pitch).astype(int) + 3; shape = tuple(idx.max(0) + 4)
occ = np.zeros(shape, bool); occ[idx[:, 0], idx[:, 1], idx[:, 2]] = True
# a szkennelt héj lyukas: oszlopos kitöltés (a bogár hátoldala magasságtérkép) a hasi és hátfelszín között
colmask = ndimage.binary_closing(occ.any(axis=1), iterations=2)
ymin = np.full(colmask.shape, 10**6); ymax = np.full(colmask.shape, -1)
np.minimum.at(ymin, (idx[:, 0], idx[:, 2]), idx[:, 1]); np.maximum.at(ymax, (idx[:, 0], idx[:, 2]), idx[:, 1])
yy = np.arange(shape[1])[None, :, None]
solid = (yy >= ymin[:, None, :]) & (yy <= ymax[:, None, :]) & colmask[:, None, :]
occ = ndimage.binary_closing(solid | occ, iterations=1)
vol = ndimage.gaussian_filter(occ.astype(np.float32), 0.8)
v, f, n, _ = marching_cubes(vol, 0.5)
v = (v - 3) * pitch + lo + pitch * 0.5
_, ii = cKDTree(P).query(v)
col = C[ii] / 255.0
print('remesh', len(v), len(f), 'shape', shape)
np.savez(out, v=v, f=f, c=col)
