// Visible hull damage (game/damage.js): branching cracks and impact stars in the cockpit canopy, and
// scorch marks and scrapes on the ship model (in flight and in the hangar).
// Both are seeded, so the same damage always looks the same; more wear reveals more marks.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Canopy ---------- */
const CW = 1024, CH = 576;
let canopyMarks = null;

// Marks in the order they appear: first small impacts with short cracks, then long
// fractures that run across the glass and branch, more impacts, soot late
function canopyPlan() {
  const r = rng(4711), list = [];
  for (let i = 0; i < 18; i++) {
    const at = (i + 1) / 18 * 0.92;
    const type = i % 3 === 0 ? 'impact' : at > 0.55 && r() < 0.25 ? 'soot' : 'fracture';
    // Keep the middle of the view mostly clear
    let x = r(), y = r();
    if (Math.abs(x - 0.5) < 0.2 && Math.abs(y - 0.5) < 0.22) x = x < 0.5 ? x - 0.22 : x + 0.22;
    list.push({ at, type, x, y, a: r() * Math.PI * 2, len: 220 + r() * 320,
      alpha: 0.5 + r() * 0.3, size: 70 + r() * 90 + at * 80, seed: Math.floor(r() * 1e9) });
  }
  return list;
}

// One crack in the glass: a jagged run of short segments that thins out and splits
// into side branches. Drawn twice: a dark seam and a bright edge where light catches it.
function crack(g, r, x, y, a, len, w, alpha, depth) {
  const pts = [[x, y]];
  const kids = [];
  let run = 0;
  while (run < len) {
    const seg = 6 + r() * 16;
    a += (r() - 0.5) * (r() < 0.12 ? 1.1 : 0.3);   // glass cracks run fairly straight, with sudden kinks
    x += Math.cos(a) * seg; y += Math.sin(a) * seg;
    run += seg;
    pts.push([x, y]);
    if (depth > 0 && r() < 0.06 + 0.025 * depth) {
      const side = r() < 0.5 ? -1 : 1;
      kids.push([x, y, a + side * (0.35 + r() * 0.8), (len - run) * (0.35 + r() * 0.45) + 20, depth - 1]);
    }
  }
  // Tapered: draw in pieces, thinner towards the end
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const t = 1 - i / pts.length, lw = Math.max(0.6, w * (0.35 + 0.65 * t));
      g.lineWidth = pass ? lw : lw + 2;
      g.strokeStyle = pass ? `rgba(228,240,246,${alpha * (0.45 + 0.55 * t)})` : `rgba(4,8,12,${0.35 * alpha})`;
      const o = pass ? 0 : 1;
      g.beginPath(); g.moveTo(pts[i - 1][0] + o, pts[i - 1][1] + o); g.lineTo(pts[i][0] + o, pts[i][1] + o); g.stroke();
    }
  }
  for (const [kx, ky, ka, kl, kd] of kids) crack(g, r, kx, ky, ka, kl, w * 0.6, alpha * 0.85, kd);
}

// A stone strike: a crushed white spot, cracks radiating out like a star, and short jagged
// rings between them (the spider web)
function impact(g, r, x, y, size, alpha) {
  const glow = g.createRadialGradient(x, y, 0, x, y, size * 0.22);
  glow.addColorStop(0, `rgba(235,244,250,${0.75 * alpha})`);
  glow.addColorStop(1, 'rgba(235,244,250,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(x, y, size * 0.22, 0, Math.PI * 2); g.fill();
  const arms = 7 + Math.floor(r() * 6), ang = [];
  for (let k = 0; k < arms; k++) {
    const a = (k / arms) * Math.PI * 2 + (r() - 0.5) * 0.5;
    ang.push(a);
    crack(g, r, x, y, a, size * (0.6 + r() * 0.9), 2.6, alpha, k % 3 === 0 ? 2 : 1);
  }
  ang.sort((p, q) => p - q);
  for (const ring of [0.3, 0.55, 0.8]) {
    for (let k = 0; k < arms; k++) {
      if (r() < 0.35) continue;                 // the web is broken in places
      const a0 = ang[k], a1 = ang[(k + 1) % arms] + (k + 1 === arms ? Math.PI * 2 : 0);
      const rr = size * ring * (0.85 + r() * 0.3);
      const x0 = x + Math.cos(a0) * rr, y0 = y + Math.sin(a0) * rr, x1 = x + Math.cos(a1) * rr * (0.9 + r() * 0.2), y1 = y + Math.sin(a1) * rr * (0.9 + r() * 0.2);
      const mx = (x0 + x1) / 2 + (r() - 0.5) * 10, my = (y0 + y1) / 2 + (r() - 0.5) * 10;
      g.lineWidth = 1.6;
      g.strokeStyle = `rgba(225,238,244,${alpha * (0.75 - ring * 0.4)})`;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(mx, my); g.lineTo(x1, y1); g.stroke();
    }
  }
}

function drawCanopy(c, wear) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  canopyMarks ||= canopyPlan();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const p of canopyMarks) {
    if (p.at > wear) break;
    const x = p.x * W, y = p.y * H, r = rng(p.seed);
    if (p.type === 'impact') impact(g, r, x, y, p.size, p.alpha);
    else if (p.type === 'fracture') {
      // A long crack, split from where it started into two directions
      crack(g, r, x, y, p.a, p.len, 2.8, p.alpha, 2);
      crack(g, r, x, y, p.a + Math.PI + (r() - 0.5) * 0.6, p.len * (0.3 + r() * 0.4), 2.2, p.alpha, 2);
    } else {
      // Soot and burn haze at the edges of a hit
      const grad = g.createRadialGradient(x, y, 0, x, y, p.size * 1.4);
      grad.addColorStop(0, `rgba(30,24,20,${0.3 + p.alpha * 0.4})`);
      grad.addColorStop(1, 'rgba(30,24,20,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, p.size * 1.4, 0, Math.PI * 2); g.fill();
    }
  }
}

// A sheet of "glass" in the cockpit, just behind the frame. updateCanopy() redraws it.
export function buildCanopy() {
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.75, 0.78, 0.8), transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = 10;
  mesh.visible = false;
  mesh.userData = { canvas: c, tex, step: -1 };
  return mesh;
}

// aspect: the view's width / height; the sheet is drawn in the same shape, so the
// scratches are not stretched when the phone is held upright
export function updateCanopy(mesh, wear, step, aspect = 16 / 9) {
  mesh.visible = wear > 0;
  if (!mesh.visible) return;
  const u = mesh.userData, portrait = aspect < 1;
  if (u.portrait !== portrait) {
    u.portrait = portrait;
    u.canvas.width = portrait ? CH : CW;
    u.canvas.height = portrait ? CW : CH;
    u.tex.dispose();
    u.step = -1;
  }
  if (mesh.userData.step === step) return;
  mesh.userData.step = step;
  drawCanopy(mesh.userData.canvas, wear);
  mesh.userData.tex.needsUpdate = true;
}

/* ---------- Hull marks on the model ---------- */
let markMats = null;
function canvasTex(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function materials() {
  if (markMats) return markMats;
  const scorch = canvasTex(g => {
    const r = rng(99);
    for (let i = 0; i < 9; i++) {
      const x = 64 + (r() - 0.5) * 40, y = 64 + (r() - 0.5) * 40, s = 18 + r() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, s);
      gr.addColorStop(0, 'rgba(12,9,8,.85)');
      gr.addColorStop(0.6, 'rgba(30,22,16,.45)');
      gr.addColorStop(1, 'rgba(30,22,16,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,140,60,.5)';            // a still glowing pit
    g.beginPath(); g.arc(64, 64, 3, 0, Math.PI * 2); g.fill();
  });
  const scrape = canvasTex(g => {
    const r = rng(7);
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const y = 30 + r() * 68, a = (r() - 0.5) * 0.4;
      g.strokeStyle = `rgba(${200 + r() * 40},${200 + r() * 40},${205 + r() * 40},${0.45 + r() * 0.4})`;
      g.lineWidth = 1 + r() * 2.2;
      g.beginPath(); g.moveTo(8 + r() * 20, y); g.lineTo(100 + r() * 20, y + Math.tan(a) * 100); g.stroke();
    }
    g.fillStyle = 'rgba(20,16,14,.35)';
    g.fillRect(0, 54, 128, 20);
  });
  const opts = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 1, metalness: 0.2 };
  markMats = [
    new THREE.MeshStandardMaterial({ ...opts, map: scorch }),
    new THREE.MeshStandardMaterial({ ...opts, map: scrape, metalness: 0.6, roughness: 0.5 }),
  ];
  return markMats;
}

const plane = new THREE.PlaneGeometry(1, 1);
const ray = new THREE.Raycaster();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), nrm = new THREE.Vector3(), inv = new THREE.Matrix4();
const HULL_MATS = ['Hull', 'HullLight', 'HullDark', 'Trim'];

// A hole torn into the plating: black inside, a dark ring of burnt paint, bright torn edges
let holeMat = null, canopyCrackMat = null, shardMat = null, emberMat = null;
const CABLE_MATS = [0xb02a20, 0xd6a21c, 0x1f2226].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.1 }));
function holeTex() {
  return canvasTex(g => {
    const r = rng(31);
    const pts = [];
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, d = 26 + r() * 22; pts.push([64 + Math.cos(a) * d, 64 + Math.sin(a) * d]); }
    const soot = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    soot.addColorStop(0, 'rgba(20,14,10,.9)'); soot.addColorStop(1, 'rgba(20,14,10,0)');
    g.fillStyle = soot; g.fillRect(0, 0, 128, 128);
    g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
    g.fillStyle = '#030303'; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(190,195,200,.85)'; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,150,60,.7)';     // still glowing edge
    g.beginPath(); pts.forEach(([x, y], k) => { const q = [64 + (x - 64) * 0.9, 64 + (y - 64) * 0.9]; k ? g.lineTo(...q) : g.moveTo(...q); }); g.closePath(); g.stroke();
  });
}
function damageMats() {
  if (holeMat) return;
  const opts = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 };
  holeMat = new THREE.MeshStandardMaterial({ ...opts, map: holeTex(), roughness: 0.9, metalness: 0.3 });
  // Cracks in the canopy as seen from outside, drawn like the ones inside
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  impact(g, rng(77), 128, 128, 120, 0.95);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  canopyCrackMat = new THREE.MeshBasicMaterial({ ...opts, map: t, color: new THREE.Color(1.2, 1.25, 1.3), fog: true });
  shardMat = new THREE.MeshStandardMaterial({ color: 0x5d6168, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });
  emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.7, 0.15), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
}

// Bent shards of plating standing out of a hole's rim, in the hole's own frame (z = outward)
function shardGeo(r, rad) {
  const pos = [];
  const n = 6 + Math.floor(r() * 4);
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + r() * 0.4, w = 0.35 + r() * 0.4;
    const bx = Math.cos(a), by = Math.sin(a), tx = -by, ty = bx;
    const len = rad * (0.3 + r() * 0.5), out = 0.5 + r() * 0.7, b = rad * 0.8;
    const b0 = [bx * b + tx * rad * w * 0.5, by * b + ty * rad * w * 0.5, 0];
    const b1 = [bx * b - tx * rad * w * 0.5, by * b - ty * rad * w * 0.5, 0];
    const tip = [bx * (b + len * 0.4), by * (b + len * 0.4), len * out];
    pos.push(...b0, ...b1, ...tip);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// Pushes a dent into every hull mesh near (center, normal), in world space. Moved vertices
// get the normal of their crumpled face, so the dent catches the light.
const tv = new THREE.Vector3(), lc = new THREE.Vector3(), ln = new THREE.Vector3();
const fa = new THREE.Vector3(), fb = new THREE.Vector3(), fc = new THREE.Vector3();
function dent(meshes, center, normal, radius, depth) {
  for (const m of meshes) {
    const scale = m.matrixWorld.getMaxScaleOnAxis() || 1;
    inv.copy(m.matrixWorld).invert();
    lc.copy(center).applyMatrix4(inv);
    ln.copy(normal).transformDirection(inv);
    const R = radius / scale, D = depth / scale;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere;
    if (bs.center.distanceTo(lc) > bs.radius + R) continue;
    let pos = m.geometry.attributes.position, touched = null;
    for (let i = 0; i < pos.count; i++) {
      tv.fromBufferAttribute(pos, i);
      const d = tv.distanceTo(lc);
      if (d >= R) continue;
      if (!m.userData.baseGeo) {          // the geometry is shared with other copies of the model
        m.userData.baseGeo = m.geometry;
        m.geometry = m.geometry.clone();
        pos = m.geometry.attributes.position;
      }
      const f = (1 - (d / R) ** 2) ** 2;
      const h = Math.sin(tv.x * 91.7 + tv.y * 37.3) * Math.sin(tv.z * 53.1 - tv.x * 17.9);   // crumple
      tv.addScaledVector(ln, -D * f * (0.8 + 0.4 * h));
      pos.setXYZ(i, tv.x, tv.y, tv.z);
      (touched ||= new Set()).add(i - (i % 3));
    }
    if (!touched) continue;
    pos.needsUpdate = true;
    const nor = m.geometry.attributes.normal;
    if (nor && !m.geometry.index) {
      for (const t of touched) {
        fa.fromBufferAttribute(pos, t); fb.fromBufferAttribute(pos, t + 1); fc.fromBufferAttribute(pos, t + 2);
        fb.sub(fa); fc.sub(fa); fb.cross(fc).normalize();
        for (let k = 0; k < 3; k++) nor.setXYZ(t + k, fb.x, fb.y, fb.z);
      }
      nor.needsUpdate = true;
    } else m.geometry.computeVertexNormals();
    m.geometry.computeBoundingSphere();
  }
}

function restore(model) {
  const old = model.getObjectByName('hullMarks');
  if (old) model.remove(old);
  model.traverse(o => {
    if (o.isMesh && o.userData.baseGeo) { o.geometry.dispose(); o.geometry = o.userData.baseGeo; delete o.userData.baseGeo; }
  });
  model.userData.damage = null;
}

// Real damage on the model, more with more wear: dents pressed into the hull, scorch marks and
// scrapes, holes torn open with bent shards, cables hanging out, a loose plate, cracks in the
// canopy. Call it with the model before add-ons are attached. model.userData.damage keeps the
// holes for the sparks and smoke of damageFx().
export function applyHullMarks(model, wear) {
  restore(model);
  const w = Math.min(1, wear);
  const n = Math.round(w * 24);
  if (n <= 0) return;
  damageMats();
  model.updateMatrixWorld(true);
  const meshes = [], hull = [], glass = [];
  model.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const name = o.material.name || '';
    if (name === 'Canopy') glass.push(o);
    else if (name !== 'EngineGlow' && !name.startsWith('Nav')) meshes.push(o);
    if (HULL_MATS.includes(name)) hull.push(o);
  });
  const box = new THREE.Box3();
  for (const m of meshes) box.expandByObject(m);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z), reach = span * 1.2;
  const group = new THREE.Group();
  group.name = 'hullMarks';
  const mats = materials(), r = rng(1234);
  // Where the hits landed (before anything is bent)
  const hits = [];
  for (let tries = 0; hits.length < n && tries < n * 4; tries++) {
    // Mostly from above and the sides, where the player sees the hull
    v1.set(r() * 2 - 1, r() * 1.4 - 0.3, r() * 2 - 1).normalize();
    v2.set((r() - 0.5) * size.x * 0.6, (r() - 0.5) * size.y * 0.4, (r() - 0.5) * size.z * 0.8).add(center);
    ray.set(v1.clone().multiplyScalar(reach).add(v2), v1.clone().negate());
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit || !hit.face) continue;
    hits.push({ point: hit.point.clone(), normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld), mat: hit.object.material, rnd: [r(), r(), r(), r()] });
  }
  const glassHits = [];
  if (glass.length) {
    const gb = new THREE.Box3();
    for (const m of glass) gb.expandByObject(m);
    const gc = gb.getCenter(new THREE.Vector3()), gs = gb.getSize(new THREE.Vector3());
    for (let tries = 0; glassHits.length < Math.ceil(w * 4) && tries < 30; tries++) {
      v1.set(r() * 2 - 1, 0.5 + r(), r() * 2 - 1).normalize();
      v2.set((r() - 0.5) * gs.x * 0.7, 0, (r() - 0.5) * gs.z * 0.7).add(gc);
      ray.set(v1.clone().multiplyScalar(reach).add(v2), v1.clone().negate());
      const hit = ray.intersectObjects(glass, false)[0];
      if (hit && hit.face) glassHits.push({ obj: hit.object, point: hit.point.clone(), normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld), s: 0.1 + r() * 0.08 });
    }
  }

  const place = (mesh, point, normal, lift) => {
    mesh.position.copy(point).addScaledVector(normal, lift);
    mesh.lookAt(v2.copy(mesh.position).add(normal));
    return mesh;
  };
  const holes = [];
  hits.forEach((h, i) => {
    const [ra, rb, rc, rd] = h.rnd;
    let depth = 0;
    if (i % 2 === 0) {                                   // a dent where it hit hard
      const rad = span * (0.06 + ra * 0.07);
      depth = rad * (0.3 + rb * 0.3) * (0.7 + w * 0.6);
      dent(hull, h.point, h.normal, rad, depth);
    }
    const p = h.point.clone().addScaledVector(h.normal, -depth);
    if (i % 3 === 1 && w > 0.2) {                       // torn open
      const rad = span * (0.028 + rc * 0.025) * (0.7 + w * 0.5);
      const hole = place(new THREE.Mesh(plane, holeMat), p, h.normal, span * 0.002);
      hole.scale.set(rad * 2.6, rad * 2.6, 1);
      hole.rotateZ(rd * Math.PI * 2);
      group.add(hole);
      const shards = place(new THREE.Mesh(shardGeo(rng(i * 7 + 3), rad), shardMat), p, h.normal, 0);
      shards.rotateZ(ra * Math.PI * 2);
      group.add(shards);
      const ember = place(new THREE.Mesh(plane, emberMat), p, h.normal, -rad * 0.2);
      ember.scale.setScalar(rad * 1.2);
      group.add(ember);
      holes.push({ p, n: h.normal.clone(), rad, ember });
    } else {
      const mark = place(new THREE.Mesh(plane, mats[0]), p, h.normal, span * 0.002);
      const s = span * (0.1 + ra * 0.12);
      mark.scale.set(s, s, 1);
      mark.rotateZ(rb * Math.PI * 2);
      group.add(mark);
    }
  });
  // Cables hanging out of the first holes
  holes.slice(0, w > 0.35 ? 2 : 0).forEach((h, k) => {
    const rr = rng(k * 13 + 5), down = new THREE.Vector3(0, -1, 0);
    for (let c = 0; c < 2 + Math.floor(rr() * 2); c++) {
      const len = span * (0.08 + rr() * 0.08);
      const side = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).multiplyScalar(h.rad);
      const a = h.p.clone().addScaledVector(h.n, -h.rad * 0.3).add(side);
      const b = a.clone().addScaledVector(h.n, len * 0.45);
      const c2 = b.clone().addScaledVector(down, len * 0.5).addScaledVector(h.n, len * 0.15);
      const d = c2.clone().addScaledVector(down, len * 0.35).add(side.clone().multiplyScalar(1.5));
      const curve = new THREE.CatmullRomCurve3([a, b, c2, d]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, span * 0.004, 5), CABLE_MATS[c % 3]));
      h.tips ||= [];
      h.tips.push(d);
    }
  });
  // One plate torn loose, standing out of the hull
  if (w > 0.5 && hits[1]) {
    const h = hits[1], s = span * 0.07;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(s * 1.4, s, s * 0.06), h.mat);
    place(plate, h.point, h.normal, 0);
    plate.rotateX(-0.75);
    plate.translateY(s * 0.5);
    plate.translateZ(s * 0.25);
    group.add(plate);
  }
  // Cracks in the canopy, as seen from outside
  // Projected onto the glass itself, so they end at the canopy's edge (Björn: they ran over it)
  if (w > 0.04) for (const g of glassHits) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), g.normal);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), g.s * 40));
    const d = span * g.s;
    const geo = new DecalGeometry(g.obj, g.point, new THREE.Euler().setFromQuaternion(q), new THREE.Vector3(d, d, d * 0.5));
    if (geo.attributes.position.count) group.add(new THREE.Mesh(geo, canopyCrackMat));
    else geo.dispose();
  }
  // Into the model's own space
  inv.copy(model.matrixWorld).invert();
  for (const o of group.children) o.applyMatrix4(inv);
  for (const h of holes) { h.p.applyMatrix4(inv); h.n.transformDirection(inv); h.tips?.forEach(t => t.applyMatrix4(inv)); h.rad *= 1 / (model.matrixWorld.getMaxScaleOnAxis() || 1); }
  model.add(group);
  model.userData.damage = { holes, wear: w, span: span / (model.matrixWorld.getMaxScaleOnAxis() || 1) };
}

/* ---------- Sparks and smoke from the holes (hangar, outside view) ---------- */
let smokeTex = null;
export function damageFx(model, { smoke = true } = {}) {
  const dmg = model.userData.damage;
  if (!dmg || !dmg.holes.length) return null;
  const S = dmg.span, N = 70;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(2.2, 1.3, 0.5), size: S * 0.006,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false;
  model.add(sparks);
  smokeTex ||= canvasTex(g => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(70,70,74,.55)'); gr.addColorStop(1, 'rgba(70,70,74,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const puffs = [];
  const timers = dmg.holes.map(() => Math.random() * 1.5);
  let cursor = 0, smokeT = 0;
  const burst = h => {
    const from = h.tips && Math.random() < 0.5 ? h.tips[Math.floor(Math.random() * h.tips.length)] : h.p;
    for (let k = 0; k < 7 + Math.random() * 6; k++) {
      const i = cursor; cursor = (cursor + 1) % N;
      pos[i * 3] = from.x; pos[i * 3 + 1] = from.y; pos[i * 3 + 2] = from.z;
      const sp = S * (0.15 + Math.random() * 0.35);
      vel[i * 3] = (h.n.x + (Math.random() - 0.5) * 1.4) * sp;
      vel[i * 3 + 1] = (h.n.y + Math.random() * 0.8) * sp;
      vel[i * 3 + 2] = (h.n.z + (Math.random() - 0.5) * 1.4) * sp;
      life[i] = 0.4 + Math.random() * 0.5;
    }
  };
  return {
    update(dt) {
      dmg.holes.forEach((h, k) => {
        h.ember.material.opacity = 0.55 + Math.random() * 0.45;
        if ((timers[k] -= dt) <= 0) { burst(h); timers[k] = 0.5 + Math.random() * (3.2 - dmg.wear * 2); }
      });
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -1e5; continue; }
        life[i] -= dt;
        vel[i * 3 + 1] -= S * 1.2 * dt;            // they fall
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      if (!smoke || dmg.wear < 0.4) return;
      if ((smokeT -= dt) <= 0 && puffs.length < 14) {
        smokeT = 0.35;
        const h = dmg.holes[Math.floor(Math.random() * Math.min(2, dmg.holes.length))];
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
        sp.position.copy(h.p);
        sp.userData = { t: 0, life: 2.6 + Math.random(), drift: new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.12, (Math.random() - 0.5) * 0.04).multiplyScalar(S) };
        model.add(sp);
        puffs.push(sp);
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const sp = puffs[i], u = sp.userData;
        u.t += dt;
        const f = u.t / u.life;
        sp.position.addScaledVector(u.drift, dt);
        sp.scale.setScalar(S * (0.03 + f * 0.12));
        sp.material.opacity = Math.min(1, f * 5) * (1 - f) * 0.8;
        if (f >= 1) { model.remove(sp); sp.material.dispose(); puffs.splice(i, 1); }
      }
    },
    dispose() {
      model.remove(sparks); geo.dispose(); sparks.material.dispose();
      for (const sp of puffs) { model.remove(sp); sp.material.dispose(); }
      puffs.length = 0;
    },
  };
}
