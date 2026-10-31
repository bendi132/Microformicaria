"""Közös segédfüggvények a modellek előkészítéséhez (egyszerűsítés, vastagságmérés, végtag-szétválasztás, GLB-írás)."""
import numpy as np, trimesh, json, struct
import fast_simplification
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

def simplify(v, f, target_faces):
    if len(f) <= target_faces: return v, f
    ratio = 1.0 - target_faces / len(f)
    v2, f2 = fast_simplification.simplify(v.astype(np.float32), f.astype(np.int32), target_reduction=ratio, agg=5)
    return v2.astype(np.float64), f2.astype(np.int64)

def local_thickness(mesh, max_d=1.0):
    """Lokális átmérő: a csúcsból a normál ellentétes irányába lőtt sugár első metszéspontjáig mért távolság."""
    n = mesh.vertex_normals
    org = mesh.vertices - n * 1e-4
    d = -n
    try:
        from trimesh.ray.ray_pyembree import RayMeshIntersector
        rm = RayMeshIntersector(mesh)
    except Exception:
        rm = mesh.ray
    loc, ridx, _ = rm.intersects_location(org, d, multiple_hits=False)
    th = np.full(len(mesh.vertices), max_d)
    th[ridx] = np.linalg.norm(loc - org[ridx], axis=1)
    return th

def vertex_components(n, faces, mask):
    """Összefüggő komponensek a mask-kal kijelölt csúcsokon (a lapok élei mentén)."""
    e = np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    keep = mask[e[:, 0]] & mask[e[:, 1]]
    e = e[keep]
    g = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n))
    k, lab = connected_components(g, directed=False)
    lab = np.where(mask, lab, -1)
    return lab

def write_glb(path, meshes, extra_json=None):
    """meshes: list of dict(name, positions, normals, indices, attrs{name:(array,ncomp)}, color(rgba)/texture bytes, uv)"""
    bin_chunks = bytearray(); views = []; accs = []
    def add(arr, target=None, comptype=5126, typ='SCALAR', minmax=False):
        nonlocal bin_chunks
        arr = np.ascontiguousarray(arr)
        while len(bin_chunks) % 4: bin_chunks += b'\0'
        off = len(bin_chunks); bin_chunks += arr.tobytes()
        bv = {'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes}
        if target: bv['target'] = target
        views.append(bv)
        acc = {'bufferView': len(views) - 1, 'componentType': comptype, 'count': int(arr.shape[0]), 'type': typ}
        if minmax: acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
        accs.append(acc); return len(accs) - 1
    gm, nodes, mats, images, textures = [], [], [], [], []
    for m in meshes:
        attrs = {}
        attrs['POSITION'] = add(m['positions'].astype(np.float32), 34962, 5126, 'VEC3', True)
        if m.get('normals') is not None: attrs['NORMAL'] = add(m['normals'].astype(np.float32), 34962, 5126, 'VEC3')
        if m.get('uv') is not None: attrs['TEXCOORD_0'] = add(m['uv'].astype(np.float32), 34962, 5126, 'VEC2')
        for k, (a, nc) in m.get('attrs', {}).items():
            attrs[k] = add(a.astype(np.float32), 34962, 5126, {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[nc])
        idx = m['indices'].astype(np.uint32).reshape(-1)
        ii = add(idx, 34963, 5125, 'SCALAR')
        mat = {'name': m.get('name', 'mat'), 'pbrMetallicRoughness': {'baseColorFactor': list(m.get('color', [0.5, 0.5, 0.5, 1])),
               'metallicFactor': m.get('metallic', 0.0), 'roughnessFactor': m.get('roughness', 0.6)}, 'doubleSided': True}
        if m.get('texture') is not None:
            while len(bin_chunks) % 4: bin_chunks += b'\0'
            off = len(bin_chunks); bin_chunks += m['texture']
            views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(m['texture'])})
            images.append({'bufferView': len(views) - 1, 'mimeType': 'image/jpeg'})
            textures.append({'source': len(images) - 1})
            mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(textures) - 1}
            mat['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, 1]
        mats.append(mat)
        gm.append({'name': m.get('name', 'mesh'), 'primitives': [{'attributes': attrs, 'indices': ii, 'material': len(mats) - 1}]})
        nodes.append({'mesh': len(gm) - 1, 'name': m.get('name', 'mesh')})
    js = {'asset': {'version': '2.0', 'generator': 'microformicaria-tools'}, 'scene': 0,
          'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': gm, 'materials': mats,
          'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_chunks)}]}
    if images: js['images'] = images; js['textures'] = textures
    if extra_json: js['extras'] = extra_json
    jb = json.dumps(js, separators=(',', ':')).encode()
    while len(jb) % 4: jb += b' '
    while len(bin_chunks) % 4: bin_chunks += b'\0'
    total = 12 + 8 + len(jb) + 8 + len(bin_chunks)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, total))
        fh.write(struct.pack('<II', len(jb), 0x4E4F534A)); fh.write(jb)
        fh.write(struct.pack('<II', len(bin_chunks), 0x004E4942)); fh.write(bin_chunks)
