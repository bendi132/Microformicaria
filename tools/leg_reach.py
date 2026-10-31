"""Lábak hegyének vízszintes távolsága a csípőponttól (testhossz = 1), hangyamodellenként."""
import json, struct, sys, numpy as np
def rd(p):
    b = open(p, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20+jl]); bin_ = b[20+jl+8:]
    pr = j['meshes'][0]['primitives'][0]['attributes']
    def acc(k):
        a = j['accessors'][pr[k]]; bv = j['bufferViews'][a['bufferView']]; nc = {'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
        o = bv.get('byteOffset',0)+a.get('byteOffset',0); return np.frombuffer(bin_, np.float32, a['count']*nc, o).reshape(-1, nc)
    return acc, j
for n in sys.argv[1:]:
    acc, j = rd(f'assets/models/{n}.glb'); P = acc('POSITION'); part = acc('_PART')[:,0]; w = acc('_W')[:,0]; pv = acc('_PIVOT')
    m = (part == 1) & (w > 0.93); d = np.hypot(P[m,0]-pv[m,0], P[m,2]-pv[m,2])
    print(n, 'tip reach (body lengths) mean %.3f' % d.mean(), 'n', int(m.sum()), 'height', round(float(P[:,1].max()),3))
