"""A fázis: betöltés, kanonikus tájolás (előre = +X, fel = +Y), tisztítás, egyszerűsítés, vastagságmérés."""
import sys, glob, numpy as np, trimesh
from scipy.spatial import cKDTree
sys.path.insert(0, '.')
from rig_lib import *
OUT = sys.argv[1]; which = sys.argv[2]
A = '/mnt/user-data/attachments/*/'
cfg = {
  'ponera':   dict(face=30000),
  'cephalotes': dict(face=40000),
  'odonto':   dict(face=40000),
  'proceratium': dict(face=40000),
  'springtail': dict(face=30000),
}[which]
colors = None
if which == 'ponera':
    g = list(trimesh.load(glob.glob(A + '073d24ae*.glb')[0]).geometry.values())[0]; g.merge_vertices()
    g.update_faces(g.area_faces > 1e-12); g.remove_unreferenced_vertices()
    V, F = g.vertices, g.faces
    R = np.array([[-1, 0, 0], [0, 1, 0], [0, 0, -1]], float)
elif which in ('proceratium', 'springtail'):
    fn = {'proceratium': 'd7317f64*.glb', 'springtail': '903ad58f*.glb'}[which]
    g = list(trimesh.load(glob.glob(A + fn)[0]).geometry.values())[0]; g.merge_vertices()
    g.update_faces(g.area_faces > 1e-12); g.remove_unreferenced_vertices()
    V, F = g.vertices, g.faces
    R = np.eye(3)
elif which == 'cephalotes':
    m = trimesh.load(glob.glob(A + 'e8a53946*.stl')[0]); m.merge_vertices()
    m.update_faces(m.area_faces > 1e-12); m.remove_unreferenced_vertices()
    V = m.vertices - np.array([0, 1.3, 0]); F = m.faces
    R = np.array([[-1, 0, 0], [0, 0, -1], [0, -1, 0]], float)
else:
    S = sys.argv[3]
    V = np.load(S + '/od_V.npy'); F = np.load(S + '/od_F.npy'); C = np.load(S + '/od_C.npy')
    R = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], float)
    # szárnyak eltávolítása (dealát királynő): a tor fölé nyúló lapok
    # (a csúcsok y>0.27 felett), utána a lebegő darabok eldobása
V = V @ R.T
if which == 'odonto':
    fy = V[F][:, :, 1].max(1)
    keep = V[F][:, :, 1].min(1) < 0.27
    F = F[keep]
    nv = len(V); used = np.zeros(nv, bool); used[F] = True
    idx = -np.ones(nv, int); idx[used] = np.arange(used.sum()); V = V[used]; C = C[used]; F = idx[F]
v, f = simplify(V, F, cfg['face'])
m = trimesh.Trimesh(v, f, process=True); m.remove_unreferenced_vertices()
# legnagyobb összefüggő darabok megtartása
cc = trimesh.graph.connected_components(m.edges, nodes=np.arange(len(m.vertices)), min_len=60)
keepv = np.zeros(len(m.vertices), bool)
for c in cc: keepv[c] = True
m.update_vertices(keepv); m.remove_unreferenced_vertices()
m.fix_normals()
if which == 'odonto':
    _, ii = cKDTree(V).query(m.vertices); colors = C[ii]
th = local_thickness(m)
np.savez(OUT, v=m.vertices, f=m.faces, th=th, colors=colors if colors is not None else np.zeros((0, 3)))
print(which, len(m.vertices), len(m.faces), 'bounds', m.bounds.round(2).tolist(), 'th pct', np.percentile(th, [5, 25, 50, 75]).round(3))
