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
    # dolgozó modell (Text3D-6148): előre = +X, fel = +Y, már kanonikus tájolású
    g = list(trimesh.load(glob.glob(A + 'd06e06c7*.glb')[0]).geometry.values())[0]; g.merge_vertices()
    g.update_faces(g.area_faces > 1e-12); g.remove_unreferenced_vertices()
    V, F = g.vertices, g.faces
    R = np.eye(3)
else:
    # Odontomachus davidsoni dolgozó (szárny nélkül): 5 darab, textúrával; a színeket csúcsszínre visszük át
    sc = trimesh.load(glob.glob(A + '924c5a84*.glb')[0]); parts = sc.dump()
    Vs, Fs, Cs, off = [], [], [], 0
    for g in parts:
        cc = g.visual.to_color().vertex_colors[:, :3] / 255.0
        Vs.append(np.asarray(g.vertices)); Fs.append(np.asarray(g.faces) + off); Cs.append(cc); off += len(g.vertices)
    V = np.vstack(Vs); F = np.vstack(Fs); C = np.vstack(Cs)
    # azonos helyzetű csúcsok összevonása (a darabok és a UV-varratok mentén), a színeket átlagoljuk
    key = np.round(V / (np.ptp(V, axis=0).max() * 1e-6)).astype(np.int64)
    _, uidx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.reshape(-1)
    Cn = np.zeros((len(uidx), 3)); cnt = np.zeros(len(uidx)); np.add.at(Cn, inv, C); np.add.at(cnt, inv, 1)
    V = V[uidx]; C = Cn / cnt[:, None]; F = inv[F]
    F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    R = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], float)
V = V @ R.T
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
