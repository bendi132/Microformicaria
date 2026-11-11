"""Levéltetű (zöld őszibarack-levéltetű jellegű) – a feltöltött 3D-szkennelt hálóból animálható GLB.
Lépések: a belső (második) héj eltávolítása, egyszerűsítés + simítás, tájolás (fej +X, hossz = 1, a láb-hegyek y = 0),
a testtől távoli részek láb-komponensekre bontása (közép- és hátsó pár), az HIÁNYZÓ ELSŐ LÁBPÁR pótlása a középső láb átalakított másolatából,
rövid csápok, zöld színezés (csúcsszín). Csúcsattribútumok (rig.js): _PART (0 test, 1 láb, 2 csáp), _LID (láb-pár: 0 első, 1 közép, 2 hátsó), _W, _PIVOT.
Használat: python3 prep_aphid.py <forrás.glb> <cél.glb>"""
import sys, numpy as np, trimesh
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
sys.path.insert(0, '.')
from rig_lib import write_glb

SRC = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else '../assets/models/aphid.glb'
m = trimesh.load(SRC, force='mesh')
parts = sorted(m.split(only_watertight=False), key=lambda c: -len(c.vertices))
G, R = parts[0], parts[1]                                     # G: külső héj (test + lábak), R: belső testhéj (csak a láb-szétválasztáshoz kell)
# ---- test: a (belső) sima testhéj egyszerűsítve és a külső felületig felfújva; lábak: a nagy felbontású hálóból kinyert középvonalak mentén épített csövek
INFL = 0.016                                                   # a külső és a belső héj távolsága
Bd = R.simplify_quadric_decimation(face_count=3200)
trimesh.smoothing.filter_taubin(Bd, lamb=0.5, nu=-0.53, iterations=6)
trimesh.repair.fill_holes(Bd)
BV = np.array(Bd.vertices) + np.array(Bd.vertex_normals) * INFL; BF = np.array(Bd.faces)
GV = np.array(G.vertices); GF = np.array(G.faces)
dBody, _ = cKDTree(R.vertices).query(GV)
LEG_T = 0.035; leg = dBody > LEG_T
n = len(GV); ok = leg[GF].all(axis=1); ff = GF[ok]
A = coo_matrix((np.ones(len(ff) * 3), (np.r_[ff[:, 0], ff[:, 1], ff[:, 2]], np.r_[ff[:, 1], ff[:, 2], ff[:, 0]])), shape=(n, n))
_, lab = connected_components(A, directed=False)
sizes = np.bincount(lab[leg], minlength=lab.max() + 1)
big = [c for c in np.argsort(-sizes) if sizes[c] >= 400][:8]
comp = np.full(n, -1)
for k, c in enumerate(big): comp[(lab == c) & leg] = k
bigmask = comp >= 0; tb = cKDTree(GV[bigmask]); idxb = np.where(bigmask)[0]
for i in np.where(leg & ~bigmask)[0]:
    d, j = tb.query(GV[i]); comp[i] = comp[idxb[j]] if d < 0.06 else -1
def tr(P):                                                      # régi z = hossz (fej +z), régi x = oldal → új x = hossz, új z = -oldal
    P = np.array(P, float); return np.stack([P[:, 2], P[:, 1], -P[:, 0]], 1)
S = 1.0 / (R.vertices[:, 2].max() - R.vertices[:, 2].min() + 2 * INFL)
BV = tr(BV) * S; GV = tr(GV) * S; dBody = dBody * S
cx = (BV[:, 0].max() + BV[:, 0].min()) / 2; BV[:, 0] -= cx; GV[:, 0] -= cx
legs = []
for k in range(len(big)):
    idx = np.where(comp == k)[0]
    if len(idx) < 300: continue
    legs.append(dict(idx=idx, side=1 if GV[idx, 2].mean() > 0 else -1, tipx=GV[idx, 0].min()))
for sd in (1, -1):
    L = sorted([l for l in legs if l['side'] == sd], key=lambda l: l['tipx'])
    for i, l in enumerate(L): l['pair'] = 2 if i == 0 else 1
print('láb-komponensek:', [(l['side'], l['pair'], len(l['idx'])) for l in legs])
# oldalanként/páronként egyesítés, középvonal: a testhez legközelebbi ponttól mért távolság szerinti rekeszek középpontjai
cl = {}
for sd in (1, -1):
    for pr in (1, 2):
        idx = np.concatenate([l['idx'] for l in legs if l['side'] == sd and l['pair'] == pr] or [np.array([], int)])
        if len(idx) < 50: continue
        P = GV[idx]; root = P[np.argmin(dBody[idx])]; s_ = np.linalg.norm(P - root, axis=1); sm = s_.max()
        bins = np.linspace(0, sm * 1.0001, 10); pts = [root]
        for q in range(9):
            sel = (s_ >= bins[q]) & (s_ < bins[q + 1])
            if sel.sum() >= 3: pts.append(P[sel].mean(0))
        pts = np.array(pts)
        cl[(sd, pr)] = pts
print('középvonalak:', {k: len(v) for k, v in cl.items()})
body_axis_z = lambda sd: 0.0
def tube_path(pts, r0, r1, seg=7):
    """csőtest a középvonal-pontok mentén (sugár r0 → r1), gyűrűnként; (csúcsok, lapok, t∈[0,1] a csúcsonként)"""
    pts = np.array(pts, float); n = len(pts); verts = []; ts = []
    for i in range(n):
        tdir = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]; tdir /= (np.linalg.norm(tdir) + 1e-9)
        ref = np.array([0, 1.0, 0]) if abs(tdir[1]) < 0.9 else np.array([1.0, 0, 0]); a = np.cross(tdir, ref); a /= np.linalg.norm(a); b = np.cross(tdir, a)
        t = i / max(1, n - 1); r = r0 + (r1 - r0) * t
        for j in range(seg):
            th = 2 * np.pi * j / seg; verts.append(pts[i] + (a * np.cos(th) + b * np.sin(th)) * r); ts.append(t)
    f = []
    for i in range(n - 1):
        for j in range(seg):
            j2 = (j + 1) % seg; a0 = i * seg + j; a1 = i * seg + j2; b0 = (i + 1) * seg + j; b1 = (i + 1) * seg + j2; f += [[a0, a1, b0], [a1, b1, b0]]
    c0 = len(verts); verts.append(pts[0]); ts.append(0.0); c1 = len(verts); verts.append(pts[-1]); ts.append(1.0)
    for j in range(seg):
        j2 = (j + 1) % seg; f.append([j2, j, c0]); f.append([(n - 1) * seg + j, (n - 1) * seg + j2, c1])
    return np.array(verts), np.array(f), np.array(ts)
# a lábgyökér kicsit a testbe nyúlik; a lábak simítása
def smooth_path(p):
    p = np.array(p); q = p.copy()
    for _ in range(2): q[1:-1] = 0.25 * q[:-2] + 0.5 * q[1:-1] + 0.25 * q[2:]
    return q
V_all = [BV]; F_all = [BF]; PART = [np.zeros(len(BV), np.float32)]; LID = [np.zeros(len(BV), np.float32)]; W = [np.zeros(len(BV), np.float32)]; PIV = [np.zeros((len(BV), 3), np.float32)]
def add_leg(pts, pair, root):
    pts = smooth_path(pts); v, f, t = tube_path(pts, 0.021, 0.007)
    base = sum(len(x) for x in V_all); V_all.append(v); F_all.append(f + base)
    PART.append(np.ones(len(v), np.float32)); LID.append(np.full(len(v), pair, np.float32)); W.append(np.minimum(1, t * 1.5).astype(np.float32) ** 1.1); PIV.append(np.tile(root, (len(v), 1)).astype(np.float32))
for (sd, pr), pts in cl.items():
    p = np.array(pts); inward = np.array([0, 0, -0.5 * sd * 0.0]); p0 = p[0] + np.array([0.0, 0.0, -sd * 0.04]); p = np.vstack([p0, p]); add_leg(p, pr, p[0])
# ---- hiányzó ELSŐ lábpár: a középső láb átalakított másolata (a mellkas elején indul, előre-kifelé nyúlik)
for sd in (1, -1):
    if (sd, 1) not in cl: continue
    p = np.array(cl[(sd, 1)]); rel = p - p[0]
    ang = np.radians(64); c, sn = np.cos(ang), np.sin(ang)
    rx = rel[:, 0] * c - (rel[:, 2] * sd) * sn; rz = (rel[:, 0] * sn + (rel[:, 2] * sd) * c) * sd
    new = np.stack([rx, rel[:, 1], rz], 1) * 0.86
    root = np.array([p[0][0] + 0.16, p[0][1] - 0.01, p[0][2] * 0.98]); q = new + root; q = np.vstack([q[0] + np.array([0.0, 0.0, -sd * 0.04]), q]); add_leg(q, 0, q[0])
V2 = np.vstack(V_all); F2 = np.vstack(F_all); PART = np.concatenate(PART); LID = np.concatenate(LID); W = np.concatenate(W); PIV = np.vstack(PIV)
V = V2; head_x = BV[:, 0].max()
ground = V[PART == 1, 1].min(); V = V - np.array([0, ground, 0]); PIV = PIV - np.array([0, ground, 0])
V2 = V; dBody = None; LEG_T = 0.0
# ---- csápok: két rövid, ívelt cső előre-kifelé a fejen
def tube(p0, p1, r0, r1, seg=6):
    d = p1 - p0; L = np.linalg.norm(d); d = d / L
    t = np.array([0, 1.0, 0]) if abs(d[1]) < 0.9 else np.array([1.0, 0, 0]); a = np.cross(d, t); a /= np.linalg.norm(a); b = np.cross(d, a)
    ring = [(p0 if s == 0 else p1) + (a * np.cos(2 * np.pi * j / seg) + b * np.sin(2 * np.pi * j / seg)) * (r0 if s == 0 else r1) for s in (0, 1) for j in range(seg)]
    f = []
    for j in range(seg): j2 = (j + 1) % seg; f += [[j, j2, seg + j], [j2, seg + j2, seg + j]]
    return np.array(ring), np.array(f)
head_x = V2[PART == 0, 0].max(); yc = V2[(PART == 0) & (V2[:, 0] > head_x - 0.1), 1].mean()
ant_V, ant_F, ant_P, ant_W, ant_L, ant_Piv = [], [], [], [], [], []
for s in (1, -1):
    root = np.array([head_x - 0.03, yc + 0.02, s * 0.05])
    pts = [root, root + [0.07, 0.04, s * 0.04], root + [0.14, 0.06, s * 0.10], root + [0.20, 0.04, s * 0.17]]
    for q in range(3):
        vv, ff2 = tube(pts[q], pts[q + 1], 0.013 - 0.002 * q, 0.011 - 0.002 * q)
        base = len(V2) + sum(len(x) for x in ant_V)
        ant_V.append(vv); ant_F.append(ff2 + base); ant_P.append(np.full(len(vv), 2, np.float32)); ant_L.append(np.full(len(vv), 0 if s > 0 else 1, np.float32))
        ant_W.append(np.clip(np.linalg.norm(vv - root, axis=1) / 0.4, 0, 1).astype(np.float32)); ant_Piv.append(np.tile(root, (len(vv), 1)))
V3 = np.vstack([V2] + ant_V); F3 = np.vstack([F2] + ant_F)
PART = np.r_[PART, np.concatenate(ant_P)]; LID = np.r_[LID, np.concatenate(ant_L)]; W = np.r_[W, np.concatenate(ant_W)]; PIV = np.vstack([PIV, np.vstack(ant_Piv)])

# ---- szín: zöld test (hasa világosabb, háta enyhén sötétebb), világosabb zöldessárga láb sötétebb hegyekkel, csáp sötétebb
body_n = (PART == 0)
col = np.zeros((len(V3), 3), np.float32)
ymax = V3[:, 1].max()
rel_y = np.clip((V3[:, 1] - V3[body_n, 1].min()) / (V3[body_n, 1].max() - V3[body_n, 1].min() + 1e-6), 0, 1)
GREEN = np.array([0.42, 0.74, 0.16]); BELLY = np.array([0.66, 0.85, 0.34]); DARK = np.array([0.20, 0.42, 0.08]); LEGC = np.array([0.55, 0.78, 0.26])
col[:] = BELLY * (1 - rel_y[:, None]) + GREEN * rel_y[:, None]
col[body_n] *= (1.0 + 0.10 * np.sin(V3[body_n, 0] * 22)[:, None])         # halvány szelvényezés a háton
hd = V3[:, 0] > head_x - 0.10; col[hd & body_n] = col[hd & body_n] * 0.85 + np.array([0.06, 0.10, 0.0])         # fej enyhén sötétebb
lm = PART == 1; col[lm] = LEGC * (1 - W[lm][:, None] * 0.55) + DARK * (W[lm][:, None] * 0.55)
am = PART == 2; col[am] = LEGC * 0.8
col = np.clip(col, 0, 1)

mesh_n = trimesh.Trimesh(V3, F3, process=False).vertex_normals
mesh = dict(name='aphid', positions=V3, normals=mesh_n, indices=F3,
            attrs={'COLOR_0': (col, 3), '_PART': (PART, 1), '_LID': (LID.astype(np.float32), 1), '_W': (W.astype(np.float32), 1), '_PIVOT': (PIV.astype(np.float32), 3)},
            color=[1, 1, 1, 1], roughness=0.38)
write_glb(OUT, [mesh], dict(bodyLength=1.0, height=float(V3[:, 1].max()), bounds=[V3.min(0).tolist(), V3.max(0).tolist()],
                            headPivot=[float(head_x - 0.12), float(yc), 0.0], gasterPivot=[-0.3, float(yc), 0.0]))
print('ok', len(V3), len(F3), V3.min(0).round(3), V3.max(0).round(3))
