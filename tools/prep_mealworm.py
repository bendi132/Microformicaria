"""Lisztkukac (Tenebrio molitor lárva) – procedurális, animálható GLB.
A referenciafotók alapján: hengeres, 13 szelvényes test (fej + 3 torszelvény + 9 potrohszelvény), a szelvényhatárokon barnás sáv,
a szelvények közepe világos borostyánsárga, a fej és az első torszelvény sötétebb narancsbarna, sötét szájrész, három pár rövid láb,
két rövid csáp, a potroh végén két apró sötét tüske (urogomphi). A hossz = 1 (X tengely, fej +X), a talp y = 0.
Csúcsattribútumok (rig.js): _PART (0 test, 1 láb, 2 csáp, 3 rágó), _LID, _W, _PIVOT."""
import sys, numpy as np, trimesh
sys.path.insert(0, '.')
from rig_lib import write_glb

OUT = sys.argv[1] if len(sys.argv) > 1 else '../assets/models/mealworm.glb'
M = 20                                   # körvonal-pontok száma
V, F, COL, PART, LID, W, PIV = [], [], [], [], [], [], []

def add(v, f, col, part, lid=0.0, w=0.0, piv=(0, 0, 0)):
    b = len(V); n = len(v)
    V.extend(v.tolist()); F.extend((f + b).tolist())
    COL.extend((np.broadcast_to(col, (n, 3)) if np.ndim(col) == 1 else col).tolist())
    PART.extend([part] * n); LID.extend([lid] * n)
    W.extend((w if np.ndim(w) else np.full(n, w)).tolist()); PIV.extend((np.broadcast_to(piv, (n, 3))).tolist())

def lerp(a, b, t): return np.array(a) * (1 - t) + np.array(b) * t

# ---- szelvény-beosztás (a farktól a fej felé): potroh 9, torkörnyék 3, fej
L_HEAD, L_THO, N_AB = 0.085, 0.072, 9
L_AB = (1.0 - L_HEAD - 3 * L_THO) / N_AB
segs = []                                # (x0, x1, típus, index)
x = -0.5
for i in range(N_AB): segs.append((x, x + L_AB, 'ab', i)); x += L_AB
for i in range(3): segs.append((x, x + L_THO, 'th', i)); x += L_THO
segs.append((x, x + L_HEAD, 'head', 0))

def radius(kind, i, u):
    """hengeres szelvény sugara a szelvényen belül u∈[0,1]: a hátsó él alá bújik, az elülső kidudorodik (teleszkóp-hatás)"""
    if kind == 'ab':
        R = 0.071 - 0.0036 * (N_AB - 1 - i) ** 1.12              # a fej felé szélesedik, a farok felé keskenyedik
        if i == 0: R *= 0.86
    elif kind == 'th': R = 0.073 - 0.0012 * i
    else: R = 0.058
    bulge = 0.80 + 0.20 * np.sin(np.pi * np.clip(u * 0.92 + 0.04, 0, 1)) ** 0.55
    return R * bulge

AMBER_MID = np.array([0.90, 0.64, 0.21]); AMBER_EDGE = np.array([0.55, 0.28, 0.07]); PALE = np.array([0.93, 0.76, 0.38])
THO_COL = np.array([0.80, 0.46, 0.13]); HEAD_COL = np.array([0.60, 0.27, 0.06]); MOUTH = np.array([0.20, 0.09, 0.05])

def body_color(kind, i, u):
    if kind == 'head': return lerp(HEAD_COL, MOUTH, np.clip((u - 0.78) * 4.5, 0, 1))
    mid = THO_COL if kind == 'th' else lerp(AMBER_MID, PALE, 0.15 + 0.05 * (i % 2))
    edge = lerp(AMBER_EDGE, mid, 0.25)
    t = np.clip(np.abs(u - 0.5) * 2, 0, 1) ** 2.2                   # a szelvényhatáron sötétebb sáv
    k = lerp(mid, edge, t) if kind != 'ab' else lerp(mid, edge, t)
    if kind == 'ab' and u < 0.14: k = lerp(PALE * 0.9, edge, u / 0.14)   # a hártyás összekötő sáv
    return k

# a test: gyűrűk a középvonal mentén; az ív enyhén ívelt (a fotókon is felfelé ívelődik)
def cy(xc): return 0.078 + 0.022 * (1 - (xc / 0.5) ** 2) - 0.012 * max(0, (xc - 0.30) / 0.2) ** 2
rings = []   # (x, sugár, szín, y-közép)
for (x0, x1, kind, i) in segs:
    nr = 7
    for k in range(nr):
        u = k / (nr - 1); xc = x0 + (x1 - x0) * u
        rings.append((xc, radius(kind, i, u), body_color(kind, i, u), kind, i, u))
# farok-zárás (kúp) és fej-zárás (kupola)
tailx = rings[0][0]; headx = rings[-1][0]
body_rings = []
for k, (xc, r, c, kind, i, u) in enumerate(rings):
    body_rings.append((xc, r, c))
tail = [(tailx - 0.012 * (1 + j), rings[0][1] * np.sqrt(max(0.0, 1 - ((j + 1) / 3) ** 2)) , rings[0][2] * (0.8 if j == 2 else 0.95)) for j in range(3)]
head_cap = [(headx + 0.010 * (1 + j), rings[-1][1] * np.sqrt(max(0.0, 1 - ((j + 1) / 3.2) ** 2)), MOUTH) for j in range(3)]
allr = tail[::-1] + body_rings + head_cap
n = len(allr); ang = np.linspace(0, 2 * np.pi, M, endpoint=False)
v = np.zeros((n * M, 3)); col = np.zeros((n * M, 3))
for k, (xc, r, c) in enumerate(allr):
    ry = r * 0.93; yc = cy(xc)
    for j, a in enumerate(ang):
        v[k * M + j] = [xc, yc + np.sin(a) * ry * (1.0 if np.sin(a) > 0 else 0.86), np.cos(a) * r]
        shade = 1.0 - 0.18 * max(0, -np.sin(a)) + 0.05 * max(0, np.sin(a))          # a has világosabb, a hát kicsit sötétebb-fényes
        col[k * M + j] = np.array(c) * shade * (1.0 + 0.06 * np.cos(a * 2))
faces = []
for k in range(n - 1):
    for j in range(M):
        a0 = k * M + j; a1 = k * M + (j + 1) % M; b0 = (k + 1) * M + j; b1 = (k + 1) * M + (j + 1) % M
        faces += [[a0, a1, b0], [a1, b1, b0]]
# fedő
for cap_k, rev in ((0, True), (n - 1, False)):
    ci = len(v) ; v = np.vstack([v, [allr[cap_k][0], cy(allr[cap_k][0]), 0]]); col = np.vstack([col, np.array(allr[cap_k][2])])
    for j in range(M):
        a0 = cap_k * M + j; a1 = cap_k * M + (j + 1) % M
        faces.append([a1, a0, ci] if rev else [a0, a1, ci])
faces = np.array(faces)
nb = len(v)
add(v, faces, col, 0)
body_v = v

# ---- fej-testhatár: a nyak X-pozíciója (rig: uNeck)
neck_x = headx - L_HEAD * 0.0 - 0.012

# ---- lábak: 3 pár a torszelvényeken (rövid, kitines, 3 ízelt)
def tube(p0, p1, r0, r1, seg=7):
    d = p1 - p0; L = np.linalg.norm(d); d = d / L
    t = np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0]); a = np.cross(d, t); a /= np.linalg.norm(a); b = np.cross(d, a)
    ring = []
    for s in (0, 1):
        for j in range(seg):
            th = 2 * np.pi * j / seg; rr = r0 if s == 0 else r1
            ring.append((p0 if s == 0 else p1) + (a * np.cos(th) + b * np.sin(th)) * rr)
    ring = np.array(ring); f = []
    for j in range(seg):
        j2 = (j + 1) % seg; f += [[j, j2, seg + j], [j2, seg + j2, seg + j]]
    # végek lezárása
    c0 = len(ring); ring = np.vstack([ring, p0, p1])
    for j in range(seg):
        j2 = (j + 1) % seg; f.append([j2, j, c0]); f.append([seg + j, seg + j2, c0 + 1])
    return ring, np.array(f)
LEG_COL = np.array([0.72, 0.42, 0.12]); LEG_TIP = np.array([0.30, 0.15, 0.06])
tho = [s for s in segs if s[2] == 'th']
for j, (x0, x1, kind, i) in enumerate(tho):
    xm = (x0 + x1) / 2; yb = cy(xm); r = radius('th', i, 0.5)
    for side in (1, -1):
        root = np.array([xm, yb - r * 0.62, side * r * 0.62])
        knee = root + np.array([0.012 - 0.008 * i, -0.012, side * 0.034])
        foot = knee + np.array([0.020 + 0.006 * (1 - i), 0, side * 0.006]); foot[1] = 0.0
        knee[1] = max(knee[1], 0.020)
        for (a, b, ra, rb, c) in ((root, knee, 0.0135, 0.0105, LEG_COL), (knee, foot, 0.0105, 0.0045, LEG_TIP * 0.4 + LEG_COL * 0.6)):
            vv, ff = tube(a, b, ra, rb)
            wgt = np.linalg.norm(vv - root, axis=1); wgt = np.clip(wgt / max(1e-6, np.linalg.norm(foot - root)), 0, 1)
            add(vv, ff, c, 1, lid=float(j), w=wgt, piv=root * 1.0 * np.array([1, 1, side]) * np.array([1, 1, side]))
# a láb-pivot z előjele jelzi az oldalt (rig: side = pivot.z >= 0)

# ---- csápok (rövid, 4 ízű), a fej elején
for side in (1, -1):
    root = np.array([headx + 0.020, cy(headx) + 0.012, side * 0.028])
    pts = [root, root + [0.020, 0.010, side * 0.020], root + [0.038, 0.012, side * 0.034], root + [0.052, 0.008, side * 0.046]]
    for q in range(3):
        vv, ff = tube(pts[q], pts[q + 1], 0.0050 - 0.0008 * q, 0.0042 - 0.0008 * q, 6)
        wgt = np.clip(np.linalg.norm(vv - root, axis=1) / 0.07, 0, 1)
        add(vv, ff, np.array([0.45, 0.24, 0.07]), 2, lid=0.0 if side > 0 else 1.0, w=wgt, piv=root)

# ---- rágók (két sötét, háromszögletes tüske a fej alján-elején)
for side in (1, -1):
    root = np.array([headx + 0.026, cy(headx) - 0.018, side * 0.012])
    tip = root + np.array([0.030, -0.012, side * -0.004])
    vv, ff = tube(root, tip, 0.0085, 0.0015, 6)
    add(vv, ff, np.array([0.12, 0.06, 0.03]), 3, lid=1.0 if side > 0 else 0.0, w=np.clip(np.linalg.norm(vv - root, axis=1) / 0.035, 0, 1), piv=root)

# ---- urogomphi: két apró sötét, felfelé hajló tüske a potroh végén (a test része, part 0)
for side in (1, -1):
    r0 = np.array([tailx - 0.002, cy(tailx) + 0.012, side * 0.008]); r1 = r0 + np.array([-0.026, 0.020, side * 0.010])
    vv, ff = tube(r0, r1, 0.0070, 0.0010, 6)
    add(vv, ff, np.array([0.30, 0.14, 0.05]), 0)

V = np.array(V); F = np.array(F); COL = np.array(COL); PART = np.array(PART, np.float32); LID = np.array(LID, np.float32); W = np.array(W, np.float32); PIV = np.array(PIV, np.float32)
# a talp: a láb-végek y=0, a test alja kicsit felette
V[:, 1] -= V[:, 1].min() if V[:, 1].min() < 0 else 0
mesh_n = trimesh.Trimesh(V, F, process=False).vertex_normals
col4 = np.clip(COL, 0, 1)
mesh = dict(name='mealworm', positions=V, normals=mesh_n, indices=F,
            attrs={'COLOR_0': (col4, 3), '_PART': (PART, 1), '_LID': (LID, 1), '_W': (W, 1), '_PIVOT': (PIV, 3)},
            color=[1, 1, 1, 1], roughness=0.42)
write_glb(OUT, [mesh], dict(bodyLength=1.0, height=float(V[:, 1].max()), bounds=[V.min(0).tolist(), V.max(0).tolist()],
                            headPivot=[float(neck_x), float(cy(neck_x)), 0.0], gasterPivot=[-0.3, 0.07, 0.0]))
print('ok', len(V), len(F), V.min(0).round(3), V.max(0).round(3))
