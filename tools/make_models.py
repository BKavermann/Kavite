#!/usr/bin/env python3
"""Generates the placeholder ship models as binary glTF (.glb).

    python3 tools/make_models.py        -> public/models/kestrel.glb, viper.glb, hornet.glb, atlas.glb

No dependencies. The files follow the same conventions a Blender export
must follow (see README):
  * glTF axes: +Y up, nose along -Z, 1 unit = 1 metre
  * material names: "Hull", "HullDark", "Trim", "Canopy", "EngineGlow", "Nav*" (lights)
  * empty nodes "Gun_L" and "Gun_R" mark the laser muzzles
"""
import json
import math
import os
import struct

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models')


def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


class Glb:
    def __init__(self, generator='asteroid-drift make_models.py'):
        self.bin = bytearray()
        self.j = {
            'asset': {'version': '2.0', 'generator': generator},
            'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
            'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': [],
        }
        self.mat_index = {}

    def material(self, name, color, metal, rough, emissive=None, strength=1.0):
        m = {'name': name, 'doubleSided': True,
             'pbrMetallicRoughness': {'baseColorFactor': [*color, 1.0], 'metallicFactor': metal, 'roughnessFactor': rough}}
        if emissive:
            m['emissiveFactor'] = list(emissive)
            if strength != 1.0:
                m['extensions'] = {'KHR_materials_emissive_strength': {'emissiveStrength': strength}}
                used = self.j.setdefault('extensionsUsed', [])
                if 'KHR_materials_emissive_strength' not in used:
                    used.append('KHR_materials_emissive_strength')
        self.mat_index[name] = len(self.j['materials'])
        self.j['materials'].append(m)

    def _view(self, data):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        self.j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': 34962})
        return len(self.j['bufferViews']) - 1

    def _accessor(self, view, count, mn=None, mx=None):
        a = {'bufferView': view, 'componentType': 5126, 'count': count, 'type': 'VEC3'}
        if mn is not None:
            a['min'], a['max'] = mn, mx
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def mesh(self, name, prims, centroid):
        """prims: list of (material_name, [triangle, ...]). A triangle is either
        (v0, v1, v2), flat shaded, or ((v0, n0), (v1, n1), (v2, n2)) with its own
        smooth normals (see loft()). With a centroid, flat triangles are flipped to
        face away from it; pass None when the parts were already oriented one by one."""
        out = []
        for mat, tris in prims:
            if not tris:
                continue
            pos, nrm = [], []
            for t in tris:
                if isinstance(t[0][0], tuple):          # smooth: normals come with the vertices
                    for v, n in t:
                        pos.append(v)
                        nrm.append(n)
                    continue
                v0, v1, v2 = t
                n = norm(cross(sub(v1, v0), sub(v2, v0)))
                c = tuple((v0[i] + v1[i] + v2[i]) / 3 for i in range(3))
                if centroid is not None and dot(n, sub(c, centroid)) < 0:   # make it face outward
                    v1, v2 = v2, v1
                    n = (-n[0], -n[1], -n[2])
                for v in (v0, v1, v2):
                    pos.append(v)
                    nrm.append(n)
            mn = [min(p[i] for p in pos) for i in range(3)]
            mx = [max(p[i] for p in pos) for i in range(3)]
            pa = self._accessor(self._view(struct.pack('<%df' % (len(pos) * 3), *[c for p in pos for c in p])), len(pos), mn, mx)
            na = self._accessor(self._view(struct.pack('<%df' % (len(nrm) * 3), *[c for p in nrm for c in p])), len(nrm))
            out.append({'attributes': {'POSITION': pa, 'NORMAL': na}, 'material': self.mat_index[mat], 'mode': 4})
        self.j['meshes'].append({'name': name, 'primitives': out})
        return len(self.j['meshes']) - 1

    def node(self, name, mesh=None, translation=None, children=None):
        n = {'name': name}
        if mesh is not None:
            n['mesh'] = mesh
        if translation:
            n['translation'] = list(translation)
        if children:
            n['children'] = children
        self.j['nodes'].append(n)
        return len(self.j['nodes']) - 1

    def write(self, path, root):
        self.j['scenes'][0]['nodes'] = [root]
        while len(self.bin) % 4:
            self.bin.append(0)
        self.j['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(self.j, separators=(',', ':')).encode('utf-8')
        js += b' ' * ((4 - len(js) % 4) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A))
            f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942))
            f.write(self.bin)
        print('wrote', os.path.relpath(path), total, 'bytes')


def tris(V, faces):
    return [tuple(V[k] for k in f) for f in faces]


def quad(a, b, c, d):
    return [(a, b, c), (a, c, d)]


def orient(tl, center=None):
    """Flip triangles so they face away from the part's own centre (parts are convex)."""
    if center is None:
        pts = [v for t in tl for v in t]
        center = tuple(sum(p[i] for p in pts) / len(pts) for i in range(3))
    out = []
    for v0, v1, v2 in tl:
        n = cross(sub(v1, v0), sub(v2, v0))
        c = tuple((v0[i] + v1[i] + v2[i]) / 3 for i in range(3))
        out.append((v0, v2, v1) if dot(n, sub(c, center)) < 0 else (v0, v1, v2))
    return out


def hexa(p):
    """8 corners (0-3 front face, 4-7 back face, same order) -> 12 triangles."""
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (3, 2, 6, 7), (0, 3, 7, 4), (1, 2, 6, 5)]
    t = []
    for a, b, c, d in f:
        t += quad(p[a], p[b], p[c], p[d])
    return orient(t)


def box(cx, cy, cz, sx, sy, sz):
    x0, x1, y0, y1, z0, z1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2
    return hexa([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])


def frustum(z0, r0, z1, r1):
    """Tapered box along z. r = (x0, x1, y0, y1) at each end."""
    a, b = r0, r1
    return hexa([(a[0], a[2], z0), (a[1], a[2], z0), (a[1], a[3], z0), (a[0], a[3], z0),
                 (b[0], b[2], z1), (b[1], b[2], z1), (b[1], b[3], z1), (b[0], b[3], z1)])


def ring(cx, cy, z, r, n, phase=0.0):
    return [(cx + math.cos(phase + 2 * math.pi * i / n) * r, cy + math.sin(phase + 2 * math.pi * i / n) * r, z) for i in range(n)]


def tube(cx, cy, z0, r0, z1, r1, n=16, cap0=True, cap1=True):
    """Cylinder or cone section along z, with optional end caps."""
    a, b = ring(cx, cy, z0, r0, n), ring(cx, cy, z1, r1, n)
    t = []
    for i in range(n):
        j = (i + 1) % n
        t += quad(a[i], a[j], b[j], b[i])
    for cap, rr, z in ((cap0, a, z0), (cap1, b, z1)):
        if cap:
            c = (cx, cy, z)
            t += [(c, rr[i], rr[(i + 1) % n]) for i in range(n)]
    return orient(t, (cx, cy, (z0 + z1) / 2))


def disc(cx, cy, z, r, n=10):
    c = (cx, cy, z)
    rr = ring(cx, cy, z, r, n)
    return [(c, rr[i], rr[(i + 1) % n]) for i in range(n)]


def fin(x, pts, thick):
    """Vertical plate in the y/z plane at x: pts = [(y, z), ...] convex outline."""
    a = [(x - thick / 2, y, z) for y, z in pts]
    b = [(x + thick / 2, y, z) for y, z in pts]
    n = len(pts)
    t = []
    for i in range(1, n - 1):
        t += [(a[0], a[i], a[i + 1]), (b[0], b[i], b[i + 1])]
    for i in range(n):
        j = (i + 1) % n
        t += quad(a[i], a[j], b[j], b[i])
    return orient(t)


def subdivide(tl, levels=1):
    for _ in range(levels):
        nxt = []
        for a, b, c in tl:
            ab, bc, ca = [tuple((p[i] + q[i]) / 2 for i in range(3)) for p, q in ((a, b), (b, c), (c, a))]
            nxt += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
        tl = nxt
    return tl


def paint(tl, rule, levels=2):
    """Split faces into smaller coplanar triangles and sort them into materials by
    rule(centroid) -> material name. No overlapping layers, so nothing can flicker."""
    out = {}
    for t in subdivide(tl, levels):
        c = tuple((t[0][i] + t[1][i] + t[2][i]) / 3 for i in range(3))
        out.setdefault(rule(c), []).append(t)
    return out


def mirror(tl):
    out = []
    for t in tl:
        if isinstance(t[0][0], tuple):      # smooth: mirror normals too and keep the winding outward
            out.append(tuple(((-v[0], v[1], v[2]), (-n[0], n[1], n[2])) for v, n in reversed(t)))
        else:
            out.append(tuple((-v[0], v[1], v[2]) for v in t))
    return out


def both(tl):
    return tl + mirror(tl)


# --- Smooth hulls: cross sections lofted into one surface with averaged normals ---

def spline(keys, steps=5):
    """Catmull-Rom through tuples of numbers; steps samples per segment."""
    out = []
    for i in range(len(keys) - 1):
        p0, p1, p2, p3 = keys[max(i - 1, 0)], keys[i], keys[i + 1], keys[min(i + 2, len(keys) - 1)]
        for k in range(steps):
            t = k / steps
            out.append(tuple(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t ** 3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(keys[-1])
    return out


def section(z, w, ht, hb, yc, n=28, p=2.5, x0=0.0):
    """Rounded cross section in the x/y plane: half width w, height ht above and hb
    below the centre yc. p = 2 is an ellipse, larger p gets squarer."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        x = x0 + max(w, 0.01) * math.copysign(abs(c) ** (2 / p), c)
        y = yc + max(ht if s > 0 else hb, 0.01) * math.copysign(abs(s) ** (2 / p), s)
        pts.append((x, y, z))
    return pts


def airfoil(x, le, te, thick, yc, n=22):
    """Wing section in the y/z plane at span position x: rounded nose at le, thin trailing edge at te."""
    mid, hc = (le + te) / 2, (te - le) / 2
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        pts.append((x, yc + thick / 2 * s * (1 - 0.45 * c) / 1.1, mid + hc * c))
    return pts


def loft(rings, cap0=True, cap1=True):
    """Skin a list of equally sized rings into smooth triangles; flat end caps."""
    K, N = len(rings), len(rings[0])
    cen = [tuple(sum(p[i] for p in r) / N for i in range(3)) for r in rings]
    nr = []
    for k in range(K):
        row = []
        for i in range(N):
            tu = sub(rings[k][(i + 1) % N], rings[k][i - 1])
            tv = sub(rings[min(k + 1, K - 1)][i], rings[max(k - 1, 0)][i])
            n = norm(cross(tu, tv))
            if dot(n, sub(rings[k][i], cen[k])) < 0:
                n = (-n[0], -n[1], -n[2])
            row.append(n)
        nr.append(row)
    out = []
    for k in range(K - 1):
        for i in range(N):
            j = (i + 1) % N
            a, b, c, d = [(rings[kk][ii], nr[kk][ii]) for kk, ii in ((k, i), (k, j), (k + 1, j), (k + 1, i))]
            for t in ((a, b, c), (a, c, d)):
                fn = cross(sub(t[1][0], t[0][0]), sub(t[2][0], t[0][0]))
                avg = tuple(t[0][1][q] + t[1][1][q] + t[2][1][q] for q in range(3))
                out.append(t if dot(fn, avg) >= 0 else (t[0], t[2], t[1]))
    for cap, k, o in ((cap0, 0, 1), (cap1, K - 1, K - 2)):
        if cap:
            c = cen[k]
            out += orient([(c, rings[k][i], rings[k][(i + 1) % N]) for i in range(N)], cen[o])
    return out


def split(tl, rule):
    """Sort triangles (flat or smooth) into materials by rule(centroid)."""
    out = {}
    for t in tl:
        ps = [v[0] for v in t] if isinstance(t[0][0], tuple) else t
        c = tuple((ps[0][i] + ps[1][i] + ps[2][i]) / 3 for i in range(3))
        out.setdefault(rule(c), []).append(t)
    return out


def hull_loft(keys, steps=5, n=28, p=2.5, x0=0.0):
    """Fuselage-like body from key sections (z, w, ht, hb, yc)."""
    return loft([section(z, w, ht, hb, yc, n, p, x0) for z, w, ht, hb, yc in spline(keys, steps)])


def wing(xs, le, te, thick, yc, n=22):
    """Lofted wing along +x; le, te, thick, yc are functions of x."""
    return loft([airfoil(x, le(x), te(x), thick(x), yc(x), n) for x in xs])


def nav_mats(g):
    g.material('EngineGlow', (1.0, 0.45, 0.15), 0.0, 1.0, emissive=(1.0, 0.45, 0.15), strength=4.0)
    g.material('NavRed', (1.0, 0.1, 0.05), 0.0, 1.0, emissive=(1.0, 0.1, 0.05), strength=3.0)
    g.material('NavGreen', (0.1, 1.0, 0.3), 0.0, 1.0, emissive=(0.1, 1.0, 0.3), strength=3.0)
    g.material('NavWhite', (1.0, 1.0, 1.0), 0.0, 1.0, emissive=(1.0, 1.0, 1.0), strength=2.0)


def kestrel():
    """Player trader/fighter: rounded body, bubble canopy, broad wings with engine
    nacelles at the roots. Span ~10.5 m."""
    # Fuselage sections (z, half width, height above, depth below, centre y)
    body = hull_loft([
        (-4.45, 0.12, 0.06, 0.06, -0.05),
        (-4.1, 0.55, 0.28, 0.25, -0.02),
        (-3.2, 0.95, 0.52, 0.42, 0.02),
        (-1.8, 1.3, 0.8, 0.58, 0.08),
        (-0.2, 1.55, 0.92, 0.7, 0.1),
        (1.2, 1.6, 0.82, 0.72, 0.08),
        (2.1, 1.45, 0.62, 0.6, 0.04),
        (2.35, 1.3, 0.5, 0.5, 0.0),
    ], steps=6, n=32, p=2.6)
    canopy = hull_loft([
        (-3.05, 0.08, 0.03, 0.02, 0.55),
        (-2.6, 0.38, 0.2, 0.05, 0.66),
        (-1.8, 0.55, 0.36, 0.1, 0.82),
        (-1.0, 0.55, 0.34, 0.1, 0.95),
        (-0.55, 0.35, 0.18, 0.08, 1.0),
        (-0.4, 0.1, 0.04, 0.04, 1.0),
    ], steps=5, n=24, p=2.2)
    # Wings from inside the body to rounded tips
    xs = [1.0 + 0.25 * i for i in range(17)] + [5.1, 5.2]
    wings = both(wing(xs,
                      le=lambda x: -2.2 + (x - 1.0) * 0.75 + max(0, x - 4.9) * 1.6,
                      te=lambda x: 2.0 - (x - 1.0) * 0.08 - max(0, x - 4.9) * 1.2,
                      thick=lambda x: (0.5 - (x - 1.0) * 0.095) * (1 - max(0, x - 4.9) * 2.2),
                      yc=lambda x: -0.05 - (x - 1.0) * 0.02))

    # Engine nacelles at the wing roots, with glowing nozzles
    nacelles, nozzles, glow = [], [], []
    for x in (-1.9, 1.9):
        nacelles += hull_loft([(-0.1, 0.12, 0.12, 0.12, -0.05), (0.3, 0.38, 0.38, 0.38, -0.05), (1.1, 0.52, 0.52, 0.52, -0.05),
                               (2.2, 0.55, 0.55, 0.55, -0.05), (2.5, 0.5, 0.5, 0.5, -0.05)], steps=4, n=24, p=2.0, x0=x)
        nozzles += tube(x, -0.05, 2.5, 0.48, 2.85, 0.42, 24, cap1=False)
        glow += disc(x, -0.05, 2.7, 0.38, 24)
    glow += disc(0, 0.0, 2.37, 0.36, 20)                                    # centre thruster

    # Wing tip fins, under-wing pods, root turrets, radiator vanes
    tips = both(fin(4.85, [(-0.05, 0.9), (0.85, 1.65), (0.85, 1.95), (-0.15, 1.85)], 0.08))
    pods = both(tube(3.2, -0.45, -0.4, 0.17, 1.6, 0.19, 12) + box(3.2, -0.3, 0.6, 0.08, 0.25, 1.2))
    turrets = both(tube(2.6, 0.22, -0.5, 0.18, 0.3, 0.22, 12) + box(2.6, 0.22, -0.95, 0.08, 0.08, 0.9))
    vanes = []
    for i in range(4):
        vanes += both(box(2.75 + i * 0.3, 0.15 - i * 0.02, 1.5, 0.06, 0.14, 0.4))
    # Sensor dome and antenna on the back
    dome = tube(0, 0.88, 0.5, 0.3, 0.85, 0.12, 12)
    mast = box(0.5, 1.15, 1.4, 0.05, 0.7, 0.05)

    # Laser barrels under the nose, with muzzles
    barrels = []
    for x in (-0.9, 0.9):
        barrels += tube(x, -0.42, -3.9, 0.08, -2.2, 0.12, 10) + tube(x, -0.42, -4.05, 0.05, -3.9, 0.09, 10)

    # Navigation lights: red port, green starboard, white tail
    red = box(-5.12, -0.14, 1.3, 0.16, 0.1, 0.16)
    green = box(5.12, -0.14, 1.3, 0.16, 0.1, 0.16)
    white = box(0.5, 1.55, 1.4, 0.1, 0.1, 0.1)

    # Paint: dark nose cap and belly, orange band near the tail and on the wing tips
    def body_paint(c):
        x, y, z = abs(c[0]), c[1], c[2]
        if z < -3.75:
            return 'HullDark'
        if 1.3 < z < 1.55:
            return 'Trim'
        if y < -0.38:
            return 'HullDark'
        return 'HullLight' if z > 1.55 and y > 0.2 else 'Hull'
    def wing_paint(c):
        x, y = abs(c[0]), c[1]
        if x > 4.55:
            return 'Trim'
        return 'HullDark' if y < -0.05 - (x - 1.0) * 0.02 else 'Hull'
    coat = split(body, body_paint)
    wcoat = split(wings, wing_paint)

    g = Glb()
    g.material('Hull', (0.62, 0.64, 0.68), 0.5, 0.38)
    g.material('HullLight', (0.72, 0.73, 0.75), 0.45, 0.42)
    g.material('HullDark', (0.16, 0.18, 0.21), 0.6, 0.5)
    g.material('Trim', (0.85, 0.42, 0.12), 0.4, 0.45)
    g.material('Canopy', (0.04, 0.08, 0.12), 0.9, 0.08, emissive=(0.1, 0.35, 0.4), strength=1.0)
    nav_mats(g)
    m = g.mesh('Kestrel_Hull', [
        ('Hull', coat.get('Hull', []) + wcoat.get('Hull', []) + nacelles + tips),
        ('HullLight', coat.get('HullLight', [])),
        ('HullDark', coat.get('HullDark', []) + wcoat.get('HullDark', []) + barrels + nozzles + pods + turrets + vanes + mast + dome),
        ('Trim', coat.get('Trim', []) + wcoat.get('Trim', [])),
        ('Canopy', canopy), ('EngineGlow', glow),
        ('NavRed', red), ('NavGreen', green), ('NavWhite', white)], None)
    hullnode = g.node('Kestrel_Hull', mesh=m)
    gl = g.node('Gun_L', translation=(-0.9, -0.42, -4.05))
    gr = g.node('Gun_R', translation=(0.9, -0.42, -4.05))
    root = g.node('Kestrel', children=[hullnode, gl, gr])
    g.write(os.path.join(OUT, 'kestrel.glb'), root)


def viper():
    """Pirate interceptor: slim rounded body, delta wings, twin tails, wing cannons and
    hazard stripes. Span ~8.5 m."""
    body = hull_loft([
        (-4.6, 0.08, 0.05, 0.05, 0.0),
        (-4.0, 0.4, 0.25, 0.2, 0.0),
        (-2.6, 0.68, 0.48, 0.35, 0.03),
        (-0.6, 0.85, 0.62, 0.42, 0.05),
        (1.2, 0.8, 0.5, 0.4, 0.03),
        (2.1, 0.65, 0.38, 0.35, 0.0),
    ], steps=6, n=28, p=2.3)
    canopy = hull_loft([
        (-3.1, 0.06, 0.02, 0.02, 0.42),
        (-2.6, 0.25, 0.14, 0.05, 0.48),
        (-1.8, 0.36, 0.26, 0.08, 0.58),
        (-1.1, 0.32, 0.22, 0.08, 0.64),
        (-0.7, 0.12, 0.06, 0.04, 0.66),
    ], steps=5, n=22, p=2.2)
    # Delta wings; ring spacing follows the hazard stripes
    xs = [0.5, 0.9, 1.3, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7, 2.9, 3.1, 3.5, 3.9, 4.15, 4.25]
    def wle(x): return -2.6 + (x - 0.5) * 0.95 + max(0, x - 4.0) * 1.4
    def wte(x): return 2.0 - (x - 0.5) * 0.1 - max(0, x - 4.0) * 1.0
    def wyc(x): return -(x - 0.5) * 0.032
    wings = both(wing(xs, wle, wte, lambda x: (0.38 - (x - 0.5) * 0.08) * (1 - max(0, x - 4.0) * 2.4), wyc, 20))
    # Twin tail fins and side intakes
    tails = both(fin(1.25, [(0.3, 0.5), (1.7, 1.7), (1.7, 2.15), (0.25, 2.0)], 0.08))
    intakes = both(hull_loft([(-1.1, 0.26, 0.2, 0.2, -0.12), (-0.6, 0.3, 0.24, 0.22, -0.12), (0.6, 0.3, 0.22, 0.22, -0.1),
                              (1.0, 0.2, 0.15, 0.15, -0.08)], steps=3, n=20, p=2.6, x0=0.95))
    intake_dark = both(disc(0.95, -0.12, -1.12, 0.2, 16))
    # Wing cannons and missile rails
    guns = both(tube(2.6, -0.18, -2.4, 0.07, 0.2, 0.1, 10) + tube(2.6, -0.18, -0.2, 0.14, 1.1, 0.14, 12))
    rails = both(box(3.6, -0.22, 0.9, 0.1, 0.08, 1.0))
    # Engine pods with glowing nozzles
    pods, glow, noz = [], [], []
    for x in (-0.6, 0.6):
        pods += hull_loft([(0.4, 0.15, 0.15, 0.15, -0.05), (0.9, 0.32, 0.32, 0.32, -0.05), (2.0, 0.36, 0.36, 0.36, -0.05),
                           (2.25, 0.33, 0.33, 0.33, -0.05)], steps=3, n=20, p=2.0, x0=x)
        noz += tube(x, -0.05, 2.25, 0.32, 2.55, 0.27, 20, cap1=False)
        glow += disc(x, -0.05, 2.4, 0.26, 20)
    red = box(-4.2, -0.15, 1.3, 0.14, 0.1, 0.14)
    green = box(4.2, -0.15, 1.3, 0.14, 0.1, 0.14)

    # Paint: dark nose cap and belly, yellow hazard stripes on the wing tops
    def body_paint(c):
        if c[2] < -3.9 or c[1] < -0.2:
            return 'HullDark'
        return 'Hull'
    def wing_paint(c):
        x, y, z = abs(c[0]), c[1], c[2]
        if y < wyc(x):
            return 'HullDark'
        if 1.9 < x < 3.1 and int((x - 1.9) / 0.4) % 2 == 0 and z > wle(x) + 0.5:
            return 'Trim'
        return 'Hull'
    coat = split(body, body_paint)
    wcoat = split(wings, wing_paint)

    g = Glb()
    g.material('Hull', (0.45, 0.13, 0.1), 0.45, 0.36)
    g.material('HullLight', (0.56, 0.18, 0.12), 0.4, 0.42)
    g.material('HullDark', (0.12, 0.12, 0.14), 0.6, 0.5)
    g.material('Trim', (0.9, 0.7, 0.1), 0.3, 0.5)
    g.material('Canopy', (0.05, 0.05, 0.06), 0.9, 0.08, emissive=(0.5, 0.08, 0.05), strength=1.0)
    nav_mats(g)
    m = g.mesh('Viper_Hull', [
        ('Hull', coat.get('Hull', []) + wcoat.get('Hull', []) + tails + intakes),
        ('HullDark', coat.get('HullDark', []) + wcoat.get('HullDark', []) + guns + rails + pods + noz + intake_dark),
        ('Trim', wcoat.get('Trim', [])), ('Canopy', canopy), ('EngineGlow', glow),
        ('NavRed', red), ('NavGreen', green)], None)
    hull = g.node('Viper_Hull', mesh=m)
    gl = g.node('Gun_L', translation=(-2.6, -0.18, -2.45))
    gr = g.node('Gun_R', translation=(2.6, -0.18, -2.45))
    root = g.node('Viper', children=[hull, gl, gr])
    g.write(os.path.join(OUT, 'viper.glb'), root)


def hornet():
    """Player fighter: slim body, forward canopy, swept mid wings with tip cannons,
    one big main engine and twin canted tails. Span ~7.4 m, length ~8 m."""
    body = hull_loft([
        (-4.3, 0.08, 0.05, 0.05, -0.02),
        (-3.8, 0.42, 0.26, 0.22, 0.0),
        (-2.6, 0.72, 0.5, 0.36, 0.04),
        (-1.0, 0.9, 0.62, 0.45, 0.06),
        (0.8, 0.95, 0.58, 0.5, 0.04),
        (2.4, 0.85, 0.5, 0.5, 0.0),
        (3.2, 0.7, 0.45, 0.45, 0.0),
    ], steps=6, n=30, p=2.4)
    canopy = hull_loft([
        (-3.3, 0.06, 0.02, 0.02, 0.38),
        (-2.8, 0.3, 0.18, 0.05, 0.46),
        (-2.0, 0.42, 0.32, 0.08, 0.58),
        (-1.2, 0.38, 0.26, 0.08, 0.66),
        (-0.7, 0.12, 0.06, 0.04, 0.68),
    ], steps=5, n=24, p=2.2)
    xs = [0.6 + 0.2 * i for i in range(15)] + [3.55, 3.6]
    def wle(x): return -1.0 + (x - 0.6) * 0.62 + max(0, x - 3.3) * 1.5
    def wte(x): return 1.9 - (x - 0.6) * 0.12 - max(0, x - 3.3) * 1.3
    def wyc(x): return -0.08 + (x - 0.6) * 0.03
    wings = both(wing(xs, wle, wte, lambda x: (0.34 - (x - 0.6) * 0.07) * (1 - max(0, x - 3.3) * 2.6), wyc, 20))
    # Canards near the nose
    canards = both(wing([0.5, 0.8, 1.1, 1.35, 1.45], lambda x: -3.0 + (x - 0.5) * 0.5, lambda x: -2.2 - (x - 0.5) * 0.15,
                        lambda x: 0.12 * (1 - max(0, x - 1.3) * 5), lambda x: -0.05, 16))
    # Twin canted tails
    tails = both(fin(0.55, [(0.3, 1.3), (1.4, 2.4), (1.4, 2.85), (0.25, 3.0)], 0.07))
    # Main engine and two small ones, with glowing nozzles
    main = hull_loft([(2.2, 0.55, 0.5, 0.5, -0.02), (3.3, 0.62, 0.56, 0.56, -0.02), (3.6, 0.58, 0.52, 0.52, -0.02)], steps=3, n=24, p=2.0)
    noz = tube(0, -0.02, 3.6, 0.52, 4.0, 0.46, 24, cap1=False)
    glow = disc(0, -0.02, 3.8, 0.44, 24)
    for x in (-0.95, 0.95):
        noz += tube(x, -0.1, 2.4, 0.2, 3.2, 0.18, 14, cap1=False)
        glow += disc(x, -0.1, 3.0, 0.16, 14)
    # Wing tip cannons and an intake under the body
    guns = both(tube(3.45, wyc(3.45), -1.6, 0.07, 1.0, 0.11, 10) + tube(3.45, wyc(3.45), -1.85, 0.05, -1.6, 0.08, 10))
    intake = hull_loft([(-0.9, 0.36, 0.1, 0.22, -0.48), (0.2, 0.42, 0.1, 0.26, -0.5), (1.4, 0.3, 0.08, 0.2, -0.45)], steps=3, n=20, p=2.8)
    intake_dark = disc(0, -0.52, -0.92, 0.2, 14)
    red = box(-3.62, wyc(3.6), 0.9, 0.12, 0.08, 0.12)
    green = box(3.62, wyc(3.6), 0.9, 0.12, 0.08, 0.12)
    white = box(-0.55 if False else 0.0, 0.62, 2.9, 0.08, 0.08, 0.08)

    def body_paint(c):
        x, y, z = abs(c[0]), c[1], c[2]
        if z < -3.95 or y < -0.3:
            return 'HullDark'
        if -0.2 < z < 0.1 or (y > 0.45 and x < 0.12 and z > 0.0):
            return 'Trim'
        return 'Hull'
    def wing_paint(c):
        x, y = abs(c[0]), c[1]
        if y < wyc(x):
            return 'HullDark'
        return 'Trim' if 2.5 < x < 2.8 else 'Hull'
    coat = split(body, body_paint)
    wcoat = split(wings, wing_paint)

    g = Glb()
    g.material('Hull', (0.78, 0.8, 0.83), 0.45, 0.36)
    g.material('HullLight', (0.86, 0.87, 0.88), 0.4, 0.4)
    g.material('HullDark', (0.14, 0.16, 0.19), 0.6, 0.5)
    g.material('Trim', (0.12, 0.62, 0.58), 0.4, 0.4)
    g.material('Canopy', (0.04, 0.08, 0.12), 0.9, 0.08, emissive=(0.1, 0.35, 0.4), strength=1.0)
    nav_mats(g)
    m = g.mesh('Hornet_Hull', [
        ('Hull', coat.get('Hull', []) + wcoat.get('Hull', []) + tails + canards + main),
        ('HullDark', coat.get('HullDark', []) + wcoat.get('HullDark', []) + guns + noz + intake + intake_dark),
        ('Trim', coat.get('Trim', []) + wcoat.get('Trim', [])),
        ('Canopy', canopy), ('EngineGlow', glow),
        ('NavRed', red), ('NavGreen', green), ('NavWhite', white)], None)
    hull = g.node('Hornet_Hull', mesh=m)
    gl = g.node('Gun_L', translation=(-3.45, wyc(3.45), -1.9))
    gr = g.node('Gun_R', translation=(3.45, wyc(3.45), -1.9))
    root = g.node('Hornet', children=[hull, gl, gr])
    g.write(os.path.join(OUT, 'hornet.glb'), root)


def atlas():
    """Player freighter: big rounded box body with a raised bridge, cargo bay bands,
    stub wings and four engines. Span ~9 m, length ~15 m."""
    body = hull_loft([
        (-7.4, 0.6, 0.4, 0.4, -0.1),
        (-6.8, 1.7, 1.1, 0.95, 0.0),
        (-5.6, 2.5, 1.6, 1.35, 0.05),
        (-3.6, 2.9, 1.9, 1.6, 0.05),
        (2.0, 3.0, 1.95, 1.65, 0.05),
        (5.6, 2.8, 1.8, 1.55, 0.05),
        (6.8, 2.4, 1.5, 1.35, 0.05),
        (7.1, 2.1, 1.3, 1.2, 0.05),
    ], steps=6, n=36, p=2.6)
    bridge = hull_loft([
        (-6.6, 0.3, 0.1, 0.1, 1.2),
        (-6.0, 1.1, 0.45, 0.2, 1.5),
        (-4.8, 1.3, 0.62, 0.2, 1.75),
        (-3.6, 1.2, 0.55, 0.2, 1.85),
        (-3.0, 0.6, 0.2, 0.15, 1.85),
    ], steps=5, n=26, p=2.6)
    canopy = hull_loft([
        (-6.45, 0.25, 0.06, 0.04, 1.42),
        (-6.0, 0.95, 0.2, 0.06, 1.62),
        (-5.5, 1.12, 0.24, 0.06, 1.82),
        (-5.1, 1.1, 0.14, 0.06, 1.96),
        (-4.9, 0.6, 0.05, 0.04, 2.0),
    ], steps=4, n=24, p=2.6)
    # Stub wings with nav lights
    xs = [2.6, 3.0, 3.4, 3.8, 4.2, 4.4, 4.5]
    def wle(x): return 0.6 + (x - 2.6) * 0.5
    def wte(x): return 4.2 - (x - 2.6) * 0.2
    wings = both(wing(xs, wle, wte, lambda x: 0.5 * (1 - max(0, x - 4.2) * 3), lambda x: -0.4, 18))
    # Four engines in two pairs
    nac, noz, glow = [], [], []
    for x in (-1.45, 1.45):
        for y in (-0.6, 0.75):
            nac += tube(x, y, 6.6, 0.62, 7.6, 0.66, 20)
            noz += tube(x, y, 7.6, 0.58, 8.05, 0.5, 20, cap1=False)
            glow += disc(x, y, 7.85, 0.48, 20)
    # Cargo bay: raised ribs along the body sides, docking hatch, antenna, radiators
    ribs = []
    for z in (-2.4, 1.2, 4.8):
        ribs += both(tube(2.55, 0.05, z - 0.9, 0.42, z + 0.9, 0.42, 16))      # cargo pods along the flanks
    hatch = box(0, 2.0, 1.2, 1.8, 0.08, 3.4)
    mast = box(0.9, 2.6, 4.6, 0.08, 1.2, 0.08)
    dish = tube(-0.9, 2.15, 4.2, 0.45, 4.5, 0.2, 14)
    rads = both(box(2.3, 1.6, 5.6, 0.1, 0.6, 1.6))
    # Twin cannons under the nose
    guns = []
    for x in (-1.0, 1.0):
        guns += tube(x, -1.35, -7.2, 0.1, -5.2, 0.14, 10) + tube(x, -1.35, -7.45, 0.07, -7.2, 0.1, 10)
    red = box(-4.55, -0.4, 3.3, 0.16, 0.12, 0.16)
    green = box(4.55, -0.4, 3.3, 0.16, 0.12, 0.16)
    white = box(0.9, 3.25, 4.6, 0.12, 0.12, 0.12)

    def body_paint(c):
        x, y, z = abs(c[0]), c[1], c[2]
        if z < -6.9 or y < -1.1:
            return 'HullDark'
        if (-3.3 < z < -2.9) or (5.9 < z < 6.3):
            return 'Trim'
        if y > 1.5 and -2.0 < z < 5.2:
            return 'HullLight'
        return 'Hull'
    coat = split(body, body_paint)

    g = Glb()
    g.material('Hull', (0.66, 0.64, 0.6), 0.45, 0.42)
    g.material('HullLight', (0.76, 0.74, 0.7), 0.4, 0.45)
    g.material('HullDark', (0.16, 0.17, 0.19), 0.6, 0.5)
    g.material('Trim', (0.92, 0.6, 0.1), 0.35, 0.45)
    g.material('Canopy', (0.04, 0.08, 0.12), 0.9, 0.08, emissive=(0.1, 0.35, 0.4), strength=1.0)
    nav_mats(g)
    m = g.mesh('Atlas_Hull', [
        ('Hull', coat.get('Hull', []) + bridge + wings + nac + ribs),
        ('HullLight', coat.get('HullLight', [])),
        ('HullDark', coat.get('HullDark', []) + noz + hatch + mast + dish + rads + guns),
        ('Trim', coat.get('Trim', [])),
        ('Canopy', canopy), ('EngineGlow', glow),
        ('NavRed', red), ('NavGreen', green), ('NavWhite', white)], None)
    hull = g.node('Atlas_Hull', mesh=m)
    gl = g.node('Gun_L', translation=(-1.0, -1.35, -7.5))
    gr = g.node('Gun_R', translation=(1.0, -1.35, -7.5))
    root = g.node('Atlas', children=[hull, gl, gr])
    g.write(os.path.join(OUT, 'atlas.glb'), root)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    kestrel()
    viper()
    hornet()
    atlas()
