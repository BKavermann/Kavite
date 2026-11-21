// Station hulls in six shapes: sphere, tetrahedron, wheel, pyramid, dumbbell, cube, and for
// mining stations a giant asteroid with the station built into it ('rock').
// Every hull has the docking slot in a flat face at z = S, the tunnel behind it
// and the approach on +Z, so docking and traffic work the same for all of them.
// Each builder adds its meshes to the group and returns how the rest of the
// station fits on: bounding radius, a hit test in local coordinates, where the
// wings, mast, economy module, ring, tanks and blinking lights go.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const S = 40;                 // the slot face sits at z = S
export const SLOT_W = S * 0.5;
export const SLOT_H = S * 0.18;
export const SHAPES = ['sphere', 'tetra', 'wheel', 'pyramid', 'dumbbell', 'cube'];

const HULL_R = S * 1.1;              // sphere radius
const BACK_Z = -S * 0.9;             // flat back face of the sphere
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Scale UVs so the panel texture keeps roughly the same panel size
function scaleUV(geo, su, sv) {
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

// Flat face at z = S with the (elliptical) slot cut out; outline is a circle radius or a list of xy points
function slotFace(outline) {
  const shape = new THREE.Shape();
  if (typeof outline === 'number') shape.absarc(0, 0, outline, 0, Math.PI * 2, false);
  else outline.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
  // Björn: an elliptical mouth instead of a rectangular one
  shape.holes.push(new THREE.Path().absellipse(0, 0, SLOT_W / 2, SLOT_H / 2, 0, Math.PI * 2, true));
  const face = new THREE.ShapeGeometry(shape, 48).translate(0, 0, S);
  const uv = face.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / (S * 0.8), uv.getY(i) / (S * 0.8));
  return face;
}

/* ---------- Bodies of revolution: sphere and dumbbell ---------- */
// prof: list of [z, r] from back to front; the hull is closed at the back by a
// point and cut flat at z = S in front. Hit test: inside the radius at that z.
function lathe(prof) {
  const pts = [new THREE.Vector2(0.01, prof[0][0]), ...prof.map(([z, r]) => new THREE.Vector2(r, z))];
  const shell = scaleUV(new THREE.LatheGeometry(pts, 64).rotateX(Math.PI / 2), 9, 4);
  const radiusAt = z => {
    if (z < prof[0][0] || z > prof[prof.length - 1][0]) return -1;
    for (let i = 1; i < prof.length; i++) if (z <= prof[i][0]) {
      const [z0, r0] = prof[i - 1], [z1, r1] = prof[i];
      return r0 + (r1 - r0) * (z - z0) / (z1 - z0 || 1);
    }
    return -1;
  };
  return { shell, radiusAt, front: prof[prof.length - 1][1], back: prof[0][1] };
}

const arc = (cz, R, z0, z1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const z = z0 + (z1 - z0) * i / n;
  return [z, Math.sqrt(Math.max(0, R * R - (z - cz) ** 2))];
});

/* ---------- Convex polyhedra: tetrahedron, pyramid, cube ---------- */
// faces: vertex index lists, face 0 is the front face at z = S
function polyhedron(verts, faces) {
  const c = verts.reduce((a, v) => a.add(v), V(0, 0, 0)).multiplyScalar(1 / verts.length);
  const planes = [], pos = [], uvs = [], edges = new Map();
  faces.forEach((f, fi) => {
    let n = new THREE.Vector3().subVectors(verts[f[1]], verts[f[0]]).cross(new THREE.Vector3().subVectors(verts[f[2]], verts[f[0]])).normalize();
    if (n.dot(new THREE.Vector3().subVectors(verts[f[0]], c)) < 0) { f = [...f].reverse(); n.negate(); }
    planes.push({ n, d: n.dot(verts[f[0]]) });
    f.forEach((a, i) => { const b = f[(i + 1) % f.length], k = Math.min(a, b) + ',' + Math.max(a, b); edges.set(k, [verts[a], verts[b]]); });
    if (fi === 0) return;
    const e1 = new THREE.Vector3().subVectors(verts[f[1]], verts[f[0]]).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1);
    for (let i = 1; i < f.length - 1; i++) for (const k of [f[0], f[i], f[i + 1]]) {
      const p = verts[k];
      pos.push(p.x, p.y, p.z);
      uvs.push(p.dot(e1) / 14, p.dot(e2) / 14);
    }
  });
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  sides.computeVertexNormals();
  const front = slotFace(faces[0].map(i => verts[i]));
  const hit = (p, m) => planes.every(({ n, d }) => n.dot(p) - d < m);
  return { sides, front, hit, edges: [...edges.values()], extent: Math.max(...verts.map(v => v.length())) + 1 };
}

const geoCache = {};
function polyGeo(shape) {
  if (geoCache[shape]) return geoCache[shape];
  let verts, faces;
  if (shape === 'tetra') {
    const F = 2 * Math.SQRT2 * 25, s = Math.sin(Math.PI / 3);         // front circumradius for inradius 25
    verts = [V(0, F, S), V(-F * s, -F / 2, S), V(F * s, -F / 2, S), V(0, 0, S - 100)];
    faces = [[0, 1, 2], [0, 3, 1], [1, 3, 2], [2, 3, 0]];
  } else if (shape === 'pyramid') {
    const P = 46;
    verts = [V(-P, -P, S), V(P, -P, S), V(P, P, S), V(-P, P, S), V(0, 0, S - 100)];
    faces = [[0, 1, 2, 3], [0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]];
  } else {
    verts = [];
    for (const z of [S, -S]) for (const [x, y] of [[-S, -S], [S, -S], [S, S], [-S, S]]) verts.push(V(x, y, z));
    faces = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  }
  return (geoCache[shape] = polyhedron(verts, faces));
}

/* ---------- Mining stations: built into a giant asteroid ---------- */
// Björn: mining stations need something to mine. The rock sits behind the slot plane (z = S):
// its front is cut flat where the docking module is bolted on, a shaft is carved for the tunnel.
// Shape: noisy sphere (value noise plus craters), stretched; the hit test uses the same function.
const ROCK_R = 105, PLATE_R = 30, COLLAR = 14;
function valueNoise(r) {
  const seed = Math.floor(r() * 1e9);
  const hash = (x, y, z) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
    return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
      lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
  };
}
function rockShape(r) {
  const n = valueNoise(r);
  const craters = Array.from({ length: 9 }, () => ({ c: V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1.4).normalize(), a: 0.14 + r() * 0.24, d: 0.05 + r() * 0.06 }));
  const scale = V(1.2 + r() * 0.25, 0.8 + r() * 0.15, 1);
  // Radius in a direction (unit vector, before stretching)
  const radius = d => {
    let f = 0, amp = 0.5, fr = 1.6;
    for (let o = 0; o < 5; o++) { f += (n(d.x * fr + 7, d.y * fr + 3, d.z * fr + 11) - 0.5) * amp; amp *= 0.5; fr *= 2.1; }
    let k = 1 + f * 0.5;
    for (const c of craters) {
      const t = Math.acos(Math.min(1, d.dot(c.c))) / c.a;
      if (t < 1) k -= c.d * (1 - t * t);
      else if (t < 1.3) k += c.d * 0.35 * (1 - (t - 1) / 0.3);    // raised rim
    }
    return ROCK_R * k;
  };
  const front = radius(V(0, 0, 1)) * scale.z;
  const center = V(0, 0, S - 2 - front * 0.92);
  return { radius, scale, center, n };
}
let rockMat = null, rockWinMat = null, rockConcrete = null, rigSteel = null, rigOchre = null, rigTank = null, latMat = null, galMat = null;
// Derrick lattice: posts, girts and X-braces on a transparent canvas; repeats per 3.2 m panel
function latticeMat() {
  if (latMat) return latMat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = '#a0583a'; x.lineCap = 'square';
  x.lineWidth = 7; x.strokeRect(3.5, 3.5, 121, 121);                    // posts and girts
  x.lineWidth = 4; x.beginPath(); x.moveTo(4, 4); x.lineTo(124, 124); x.moveTo(124, 4); x.lineTo(4, 124); x.stroke();
  x.globalCompositeOperation = 'source-atop';                           // grime and wear
  for (let k = 0; k < 400; k++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '30,20,15' : '170,120,90'},${0.15 + Math.random() * 0.25})`; x.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (latMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.6 }));
}
function buildRock(ctx) {
  const { group, owned, sh, beam, trimMat, look } = ctx;
  const r = look.r, R = rockShape(r);
  rockMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.08, emissive: 0x2a2018, emissiveIntensity: 0.55 });   // a little glow, so the shadow side is not black
  // Geometry: a fine icosphere pushed out to the radius, cut flat in front, a shaft for the tunnel
  let geo = new THREE.IcosahedronGeometry(1, 40);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.getAttribute('position'), col = new Float32Array(pos.count * 3), d = V(0, 0, 0), p = V(0, 0, 0);
  const base = new THREE.Color(0x6b6158), dark = new THREE.Color(0x2e2925), ore = new THREE.Color(0x9a6a3a), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const rr = R.radius(d);
    p.copy(d).multiplyScalar(rr).multiply(R.scale).add(R.center);
    const h = Math.hypot(p.x, p.y);
    if (h < PLATE_R - 2) p.z = Math.min(p.z, S - 34);           // shaft behind the docking module
    else p.z = Math.min(p.z, S - 2 - Math.max(0, h - PLATE_R) * 0.04);   // the flat cut face
    pos.setXYZ(i, p.x, p.y, p.z);
    // colour: darker in hollows, rusty ore veins, lighter on ridges
    const k = rr / ROCK_R, vein = R.n(d.x * 9 + 1, d.y * 9 + 2, d.z * 9 + 3);
    c.copy(dark).lerp(base, Math.min(1, Math.max(0, (k - 0.82) * 3)));
    if (vein > 0.72) c.lerp(ore, (vein - 0.72) * 2.6);
    c.multiplyScalar(0.85 + R.n(d.x * 30, d.y * 30, d.z * 30) * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  owned.push(geo);
  group.add(new THREE.Mesh(geo, rockMat));
  const surf = (dir, lift = 0) => { const dd = dir.clone().normalize(); return dd.clone().multiplyScalar(R.radius(dd) + lift).multiply(R.scale).add(R.center); };
  const normalAt = dir => { const a = surf(dir), b = surf(dir.clone().add(V(0.02, 0, 0))), e = surf(dir.clone().add(V(0, 0.02, 0.01))); return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(e, a)).normalize().multiplyScalar(-1); };
  const outward = dir => { const nn = normalAt(dir); return nn.dot(dir) < 0 ? nn.negate() : nn; };

  // The docking module bolted onto the cut face: a collar, the plate with the slot, a rim
  const collar = new THREE.Mesh(sh.cyl, trimMat);
  collar.rotation.x = Math.PI / 2; collar.scale.set(PLATE_R, COLLAR, PLATE_R); collar.position.z = S - COLLAR / 2;
  group.add(collar);
  const face = geoCache.rockFace || (geoCache.rockFace = slotFace(PLATE_R));
  group.add(new THREE.Mesh(face, ctx.hullMat));
  for (const z of [S, S - COLLAR]) { const t = new THREE.Mesh(new THREE.TorusGeometry(PLATE_R, 1.4, 10, 64), sh.trimMat); t.position.z = z; owned.push(t.geometry); group.add(t); }
  // Struts from the collar into the rock
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
    group.add(beam(sh.cyl, trimMat, V(cs * PLATE_R, sn * PLATE_R, S - 4), V(cs * (PLATE_R + 22), sn * (PLATE_R + 22), S - 8), 1.6));
  }

  // Mining rigs on the rock: a platform, a derrick, a drill into the rock, a steady lamp on top;
  // conveyor pipes between them, habitat domes.
  // v0.65 (Björn: rigs hard to see, lights flicker): everything twice the size, industrial yellow,
  // lit cabins, and steady lamps big enough not to shimmer as sub-pixel dots while the rock turns.
  const lights = [], lamps = [];
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; lights.push(V(Math.cos(a) * (PLATE_R + 2), Math.sin(a) * (PLATE_R + 2), S + 0.5)); }
  rigSteel ||= new THREE.MeshStandardMaterial({ color: 0x7a3f2c, metalness: 0.55, roughness: 0.6 });   // red-oxide primer
  rigOchre ||= new THREE.MeshStandardMaterial({ color: 0x8c7440, metalness: 0.4, roughness: 0.65 });
  rigTank ||= new THREE.MeshStandardMaterial({ color: 0x7a8076, metalness: 0.4, roughness: 0.55 });
  rockConcrete ||= new THREE.MeshStandardMaterial({ color: 0x55524d, metalness: 0.1, roughness: 0.9, emissive: 0x1a1814, emissiveIntensity: 0.6 });
  const winMat = rockWinMat || (rockWinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.25, 0.6), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  const up = V(0, 1, 0), q = new THREE.Quaternion(), RS = 1;

  // v0.66 (Björn: rigs hung in the air or stood crooked in the rock): a site is levelled like a
  // real building plot. The ground is sampled on a ring around the spot, a plane is fitted, the
  // platform sits on the highest sample and a concrete plinth reaches below the lowest one.
  // Plots that are too steep (crater walls) are rejected.
  const onRock = p => surf(p.clone().sub(R.center).divide(R.scale));
  const site = (dir, half) => {
    const c = surf(dir);
    if (c.z > S - 12) return null;                                  // the flat cut face
    const n0 = c.clone().sub(R.center).normalize();
    const t1 = V(0, 0, 1).cross(n0); if (t1.lengthSq() < 0.01) t1.set(1, 0, 0).cross(n0); t1.normalize();
    const t2 = n0.clone().cross(t1);
    const pts = [];
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, rr = k % 2 ? half : half * 0.6;
      pts.push(onRock(c.clone().addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr)));
    }
    // plane normal: sum of the cross products around the ring (Newell's method)
    const nrm = V(0, 0, 0);
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k].clone().sub(c), q2 = pts[(k + 1) % pts.length].clone().sub(c);
      nrm.add(p.cross(q2));
    }
    nrm.normalize(); if (nrm.dot(n0) < 0) nrm.negate();
    if (nrm.dot(n0) < 0.8) return null;                              // too steep
    let hi = 0, lo = 0;
    for (const p of [c, ...pts]) { const h = p.clone().sub(c).dot(nrm); hi = Math.max(hi, h); lo = Math.min(lo, h); }
    if (hi - lo > half * 0.6 || pts.some(p => p.z > S - 6)) return null;
    return { pos: c.clone().addScaledVector(nrm, hi), nrm, depth: hi - lo + 4, quat: new THREE.Quaternion().setFromUnitVectors(up, nrm) };
  };
  // Plinth: concrete block from the platform down into the rock
  const plinth = (g, w, d, depth) => { const m = new THREE.Mesh(sh.box, rockConcrete); m.scale.set(w, depth, d); m.position.y = -depth / 2 + 0.01; g.add(m); };

  const rigs = [];
  for (let tries = 0; rigs.length < 9 && tries < 400; tries++) {
    const dir = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1.3).normalize();
    if (dir.z > 0.3 || rigs.some(x => x.dir.dot(dir) > 0.9)) continue;
    const st = site(dir, 12);
    if (st) rigs.push({ dir, st });
  }
  // v0.67 (Björn: rigs far too big and comic-like): real proportions (derrick 14–24 m on a
  // 14 × 18 m deck), a lattice derrick drawn as a see-through texture on a tapered frame
  // (mipmaps keep the fine lattice from shimmering at range), muted red-oxide steel, no glowing
  // outlines; just a small steady lamp on the crown and one lit window in the crew hut.
  rigs.forEach((rig, i) => {
    const { st } = rig;
    const g = new THREE.Group();
    g.position.copy(st.pos);
    g.quaternion.copy(st.quat);
    g.scale.setScalar(RS); g.name = 'rig';
    group.add(g);
    plinth(g, 14, 18, st.depth / RS);
    const deck = new THREE.Mesh(sh.box, sh.darkMat); deck.scale.set(14, 1.2, 18); deck.position.y = 0.6; g.add(deck);
    const hgt = 14 + (i % 3) * 5, dz = -3.5, b0 = 2.6, b1 = 0.8, y0 = 1.2;
    // lattice faces and four solid corner legs
    const frame = new THREE.CylinderGeometry(b1 * Math.SQRT2, b0 * Math.SQRT2, hgt - y0, 4, 1, true);
    frame.rotateY(Math.PI / 4);
    const uv = frame.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 4, uv.getY(k) * (hgt - y0) / 3.2);
    owned.push(frame);
    const lat = new THREE.Mesh(frame, latticeMat()); lat.position.set(0, y0 + (hgt - y0) / 2, dz); g.add(lat);
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(beam(sh.cyl, rigSteel, V(x * b0, y0, z * b0 + dz), V(x * b1, hgt, z * b1 + dz), 0.22));
    // crown block with its sheave, a small monkey board, the drill string through the deck
    const crown = new THREE.Mesh(sh.box, rigSteel); crown.scale.set(2.4, 1.2, 2.4); crown.position.set(0, hgt + 0.6, dz); g.add(crown);
    const shv = new THREE.Mesh(sh.cyl, trimMat); shv.scale.set(0.9, 0.5, 0.9); shv.rotation.z = Math.PI / 2; shv.position.set(0, hgt + 1.5, dz); g.add(shv);
    const mb = new THREE.Mesh(sh.box, rigSteel); mb.scale.set(2.8, 0.2, 1.2); mb.position.set(0, hgt * 0.7, dz + 1.6); g.add(mb);
    const dl = hgt + st.depth / RS + 4;
    const drill = new THREE.Mesh(sh.cyl, trimMat); drill.scale.set(0.3, dl, 0.3); drill.position.set(0, hgt - dl / 2, dz); g.add(drill);
    // drawworks beside the derrick, crew hut with one lit window, pipe rack, mud tank
    const dw = new THREE.Mesh(sh.box, rigOchre); dw.scale.set(3.2, 1.8, 2.2); dw.position.set(4.2, y0 + 0.9, dz); g.add(dw);
    const hut = new THREE.Mesh(sh.box, sh.whiteMat); hut.scale.set(6, 3, 3.6); hut.position.set(-3.2, y0 + 1.5, 5.6); g.add(hut);
    const hw = new THREE.Mesh(sh.box, winMat); hw.scale.set(3.6, 0.6, 0.12); hw.position.set(-3.2, y0 + 1.9, 7.42); g.add(hw);
    for (const x of [1.6, 5.6]) { const sw = new THREE.Mesh(sh.box, rigSteel); sw.scale.set(0.3, 1.2, 5); sw.position.set(x, y0 + 0.6, 4.5); g.add(sw); }
    for (let k = 0; k < 5; k++) { const pp = new THREE.Mesh(sh.cyl, sh.rustMat); pp.scale.set(0.22, 5, 0.22); pp.rotation.z = Math.PI / 2; pp.position.set(3.6, y0 + 1.4 + (k % 2) * 0.4, 2.9 + k * 0.55); g.add(pp); }
    if (i % 2) { const tank = new THREE.Mesh(sh.cyl, rigTank); tank.scale.set(1.4, 4.4, 1.4); tank.rotation.x = Math.PI / 2; tank.position.set(-5, y0 + 1.5, -4); g.add(tank); }
    g.updateMatrix();
    lamps.push(V(0, hgt + 2.4, dz).applyMatrix4(g.matrix));
    rig.out = V(7, 1.6, 4.5).applyMatrix4(g.matrix);
  });
  // Conveyor pipes between neighbouring rigs: they follow the ground on stilts
  for (let i = 1; i < rigs.length; i++) {
    const a = rigs[i - 1], b = rigs[i];
    if (a.dir.dot(b.dir) < 0.55) continue;
    const da = a.out.clone().sub(R.center).divide(R.scale).normalize(), db = b.out.clone().sub(R.center).divide(R.scale).normalize();
    const N = 8, path = [a.out];
    for (let k = 1; k < N; k++) {
      const d = da.clone().lerp(db, k / N).normalize(), g0 = surf(d), up0 = g0.clone().sub(R.center).normalize();
      const p = g0.clone().addScaledVector(up0, 2.5);
      path.push(p);
      group.add(beam(sh.cyl, rigSteel, p, g0.clone().addScaledVector(up0, -2), 0.25));   // stilt
    }
    path.push(b.out);
    for (let k = 1; k < path.length; k++) group.add(beam(sh.cyl, sh.rustMat, path[k - 1], path[k], 0.6));
  }
  // Habitat domes on levelled plinths
  const domes = [];
  for (let tries = 0; domes.length < 3 && tries < 300; tries++) {
    const dir = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1.2).normalize();
    if (dir.z > 0.3 || [...rigs, ...domes].some(x => x.dir.dot(dir) > 0.9)) continue;
    const st = site(dir, 26);
    if (!st) continue;
    domes.push({ dir });
    const g = new THREE.Group(); g.position.copy(st.pos); g.quaternion.copy(st.quat); group.add(g);
    const base = new THREE.Mesh(sh.cyl, rockConcrete); base.scale.set(23, st.depth, 23); base.position.y = -st.depth / 2 + 0.01; g.add(base);
    const ring = new THREE.Mesh(sh.cyl, trimMat); ring.scale.set(23.4, 0.8, 23.4); ring.position.y = -0.6; g.add(ring);
    const dome = new THREE.Mesh(sh.dome, sh.domeMat); dome.scale.setScalar(3.2); g.add(dome);
  }
  // Small lit windows of the galleries inside the rock: a short row of slits near each rig
  galMat ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 0.78, 0.45), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  for (const rig of rigs) {
    const side = V(0, 0, 1).cross(rig.dir).normalize().multiplyScalar(0.022), off = rig.dir.clone().add(V(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.1)).add(side.clone().multiplyScalar(5));
    for (let k = 0; k < 3; k++) {
      const dir = off.clone().add(side.clone().multiplyScalar(k)).normalize();
      const w = new THREE.Mesh(sh.box, galMat);
      w.position.copy(surf(dir, 0.15));
      w.quaternion.copy(q.setFromUnitVectors(up, outward(dir)));
      w.scale.set(1.8, 0.6, 0.9);
      group.add(w);
    }
  }
  // Floodlights on the cut face, aimed at the slot
  // Antenna mast on top: stands on the highest ground around its spot, with a plinth below
  const mDir = [V(0, 1, 0.15), V(0.15, 1, 0), V(-0.15, 1, -0.1), V(0, 1, -0.3)].find(d => ![...rigs, ...domes].some(x => x.dir.dot(d.clone().normalize()) > 0.93)) || V(0, 1, 0.15);
  const m0 = surf(mDir);
  let mTop = -Infinity, mLow = Infinity;
  for (let k = 0; k < 9; k++) { const a = k / 8 * Math.PI * 2, rr = k ? 7 : 0; const y = onRock(m0.clone().add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr))).y; mTop = Math.max(mTop, y); mLow = Math.min(mLow, y); }
  const top = V(m0.x, mTop + 1.5, m0.z);
  { const pl = new THREE.Mesh(sh.box, rockConcrete); const dd = mTop - mLow + 6; pl.scale.set(12, dd, 12); pl.position.set(top.x, top.y - dd / 2, top.z); group.add(pl); }
  const extent = R.center.length() + ROCK_R * 1.35 * Math.max(R.scale.x, R.scale.y, R.scale.z);
  const hit = (pp, m) => {
    const h = Math.hypot(pp.x, pp.y);
    if (h < PLATE_R + m && pp.z > S - COLLAR - m) return pp.z < S + m;
    if (pp.z > S - 2 + m) return false;
    p.copy(pp).sub(R.center).divide(R.scale);
    const l = p.length();
    return l < 1e-3 || l < R.radius(p.divideScalar(l)) + m;
  };
  return { extent, armStart: 0, armZ: 0, noWings: true, mast: top, back: R.center.z - ROCK_R, ring: null, tanks: null, yard: false, rock: true, lights, lamps, hit };
}

/* ---------- Builders ---------- */
// ctx: { group, hullMat, trimMat, owned, sh, beam, look }
export function buildHull(shape, ctx) {
  if (shape === 'rock') return buildRock(ctx);
  const { group, hullMat, trimMat, owned, sh, beam } = ctx;
  const mesh = (geo, mat = hullMat) => { const m = new THREE.Mesh(geo, mat); group.add(m); return m; };
  const torus = (r, t, z, mat = sh.trimMat) => {
    const m = mesh(new THREE.TorusGeometry(r, t, 10, 72), mat);
    m.position.z = z;
    owned.push(m.geometry);
    return m;
  };

  if (shape === 'sphere' || shape === 'dumbbell') {
    let prof, cfg;
    if (shape === 'sphere') {
      prof = arc(0, HULL_R, BACK_Z, S, 32);
      cfg = { extent: HULL_R + 1, armStart: S * 0.9, armZ: 0, mast: V(0, S, 0), back: BACK_Z,
        ring: { r: HULL_R + 16, z: -S * 0.3, inner: HULL_R * 0.9 }, tanks: { y: -HULL_R * 0.93, z: -S * 0.15 }, yard: true,
        lights: [[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0], [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1]]
          .map(v => V(...v).normalize().multiplyScalar(HULL_R * 1.03)) };
    } else {
      // front ball (centre z 12, r 34), neck (r 6), back ball (centre z -100, r 26)
      prof = [...arc(-100, 26, -120, -74.7, 14), ...arc(12, 34, -21.5, S, 22)];
      cfg = { extent: 122, armStart: 5, armZ: -48, mast: V(0, 25, -100), back: -120,
        ring: { r: 46, z: -48, inner: 6 }, tanks: null, yard: false,
        lights: [V(0, 35, 12), V(0, -35, 12), V(35, 0, 12), V(-35, 0, 12), V(27, 0, -100), V(-27, 0, -100), V(0, -27, -100), V(0, 0, -122)] };
    }
    const L = geoCache[shape] || (geoCache[shape] = lathe(prof));
    mesh(L.shell);
    mesh(geoCache[shape + 'Face'] || (geoCache[shape + 'Face'] = slotFace(L.front)));
    // Rims of the flat faces, hull bands on the sphere
    torus(L.front, 1.4, S);
    torus(L.back, 1.4, prof[0][0]);
    if (shape === 'sphere') for (const f of ctx.look.bands) torus(Math.sqrt(HULL_R ** 2 - (f * S) ** 2) + 0.2, 0.9, f * S, trimMat);
    else for (const z of [-70, -26]) torus(6.6, 1.2, z, trimMat);
    cfg.hit = (p, m) => { const r = L.radiusAt(p.z); return r > 0 && Math.hypot(p.x, p.y) < r + m; };
    return cfg;
  }

  if (shape === 'wheel') {
    const HUB = 17, HB = -34, RR = 72, RT = 8, RZ = -6, n = ctx.look.spokes;
    const g = geoCache.wheel || (geoCache.wheel = {
      hub: scaleUV(new THREE.CylinderGeometry(HUB, HUB, S - HB, 40, 1, true).rotateX(Math.PI / 2).translate(0, 0, (S + HB) / 2), 3, 3),
      front: slotFace(HUB),
      cap: new THREE.CircleGeometry(HUB, 40).rotateY(Math.PI).translate(0, 0, HB),
      rim: scaleUV(new THREE.TorusGeometry(RR, RT, 16, 120), 30, 2),
    });
    mesh(g.hub); mesh(g.front); mesh(g.cap);
    mesh(g.rim).position.z = RZ;
    torus(HUB, 1.4, S);
    torus(HUB, 1.4, HB);
    for (const z of [RZ - RT * 0.75, RZ + RT * 0.75]) torus(RR, 0.9, z, trimMat);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      group.add(beam(sh.cyl, trimMat, V(c * HUB, s * HUB, RZ), V(c * (RR - RT * 0.6), s * (RR - RT * 0.6), RZ), 2.4));
    }
    const lights = [];
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; lights.push(V(Math.cos(a) * (RR + RT + 0.6), Math.sin(a) * (RR + RT + 0.6), RZ)); }
    lights.push(V(HUB + 1, 0, S), V(-HUB - 1, 0, S));
    const hit = (p, m) => {
      const r = Math.hypot(p.x, p.y);
      if (r < HUB + m && p.z > HB - m && p.z < S + m) return true;
      if (Math.hypot(r - RR, p.z - RZ) < RT + m) return true;
      if (Math.abs(p.z - RZ) < 2.4 + m && r > HUB && r < RR) {
        const step = Math.PI * 2 / n, a = Math.atan2(p.y, p.x) - Math.PI / 2;
        const off = a - Math.round(a / step) * step;
        return r * Math.abs(Math.sin(off)) < 2.4 + m;
      }
      return false;
    };
    return { extent: RR + RT + 1, armStart: 0, armZ: 0, noWings: true, mast: V(0, RR + RT - 1, RZ), back: HB,
      ring: null, tanks: null, yard: false, lights, hit };
  }

  // Polyhedra
  const P = polyGeo(shape);
  mesh(P.sides); mesh(P.front);
  for (const [a, b] of P.edges) group.add(beam(sh.cyl, trimMat, a, b, 1.3));
  const lights = [];
  for (const [a, b] of P.edges) lights.push(a.clone().multiplyScalar(1.02), a.clone().add(b).multiplyScalar(0.51));
  const cfg = { extent: P.extent, hit: P.hit, lights: lights.filter((v, i, l) => l.findIndex(w => w.distanceTo(v) < 1) === i) };
  if (shape === 'cube') {
    Object.assign(cfg, { armStart: S, armZ: 0, mast: V(0, S, 0), back: -S, ring: { r: 74, z: -12, inner: S }, tanks: { y: -S - 2.6, z: 0 }, yard: true });
  } else {
    // Apex at the back: a round cap carries the economy module
    const apex = S - 100;
    const cap = new THREE.Mesh(sh.cyl, trimMat);
    cap.position.z = apex + 3;
    cap.rotation.x = Math.PI / 2;
    cap.scale.set(14, 4, 14);
    group.add(cap);
    const tip = shape === 'tetra' ? V(0, 2 * Math.SQRT2 * 25 - 2, S - 2) : V(0, 44, S - 2);
    Object.assign(cfg, { armStart: shape === 'tetra' ? 22 : 26, armZ: 0, mast: tip, back: apex + 1, ring: null, tanks: null, yard: false });
  }
  return cfg;
}
