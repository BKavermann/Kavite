// Renders the app icon's K-shaped spaceship with three.js (same PBR look and hull
// textures as the game). Bundled and run by tools/icon/render.cjs; the page calls
// window.renderIcon(size) and gets a transparent PNG (data URL) back.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { hullTextures } from '../../src/core/hull-texture.js';
import { rng } from '../../src/utils.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

// Stroke outlines of the K in the xy plane, 2 units high
const STEM = [V2(-0.92, -1), V2(-0.36, -1), V2(-0.36, 1), V2(-0.92, 1)];
const ARM = [V2(-0.40, -0.12), V2(-0.40, 0.42), V2(0.50, 1), V2(1.08, 1), V2(0.10, 0.18)];
const LEG = [V2(-0.08, 0.02), V2(0.30, 0.30), V2(1.12, -1), V2(0.52, -1)];

// Outline with every corner rounded off (radius r, or less where an edge is short)
function roundedShape(pts, r) {
  const shape = new THREE.Shape(), n = pts.length;
  const corner = i => {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const k = Math.min(r, a.distanceTo(p) * 0.45, b.distanceTo(p) * 0.45);
    return [p.clone().lerp(a, k / a.distanceTo(p)), p, p.clone().lerp(b, k / b.distanceTo(p))];
  };
  const c0 = corner(0);
  shape.moveTo(c0[2].x, c0[2].y);
  for (let i = 1; i <= n; i++) {
    const [s0, p, s1] = corner(i % n);
    shape.lineTo(s0.x, s0.y);
    shape.quadraticCurveTo(p.x, p.y, s1.x, s1.y);
  }
  return shape;
}

function strokeGeo(pts, depth, bevel, round) {
  const shape = roundedShape(pts, round);
  const g = new THREE.ExtrudeGeometry(shape, { depth, curveSegments: 14, bevelEnabled: true, bevelThickness: bevel * 1.6, bevelSize: bevel, bevelSegments: 10, steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  // planar UVs (front view) so the panel texture keeps its scale
  const p = g.getAttribute('position'), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 1.3 + p.getZ(i) * 1.3; uv[i * 2 + 1] = p.getY(i) * 1.3 + p.getZ(i) * 0.6; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function build(scene) {
  const t = hullTextures();
  const hull = new THREE.MeshPhysicalMaterial({ color: 0xc8d2da, roughnessMap: t.map, bumpMap: t.bump, bumpScale: 1.4, metalness: 0.75, roughness: 0.34, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const hull2 = hull.clone(); hull2.color.set(0xc2ccd4);
  const side = hull.clone(); side.color.set(0x4e6674); side.roughness = 0.45;     // painted flanks
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3138, metalness: 0.8, roughness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a96a0, metalness: 0.95, roughness: 0.25 });
  const glow = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), toneMapped: false });
  const teal = glow([0.45, 1.3, 1.1]), warm = glow([1.3, 0.95, 0.55]), hot = glow([2.4, 1.3, 0.5]);
  const ship = new THREE.Group();
  scene.add(ship);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = ship) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // Hull: the stem is the main body, arm and leg sit a little flatter
  add(strokeGeo(STEM, 0.40, 0.09, 0.26), [hull, side]);
  add(strokeGeo(ARM, 0.22, 0.08, 0.2), [hull2, side]);
  add(strokeGeo(LEG, 0.22, 0.08, 0.2), [hull2, side]);
  const zf = 0.20 + 0.09 * 1.6;         // front face of the stem
  const za = 0.11 + 0.08 * 1.6;         // front face of arm and leg

  // Dark bands around the stem (rounded like the hull), with window rows between them
  const band = new THREE.ExtrudeGeometry(roundedShape([V2(-0.38, -0.39), V2(0.38, -0.39), V2(0.38, 0.39), V2(-0.38, 0.39)], 0.3), { depth: 0.05, bevelEnabled: false, curveSegments: 12 })
    .translate(0, 0, -0.025).rotateX(Math.PI / 2);
  for (const y of [-0.62, -0.22, 0.26, 0.66]) add(band, dark, -0.64, y, 0);
  const win = new THREE.CapsuleGeometry(0.014, 0.03, 4, 8).rotateZ(Math.PI / 2);
  for (const y of [0.4, 0.47, -0.08, -0.01]) for (let x = -0.82; x < -0.45; x += 0.07) add(win, warm, x, y, zf + 0.005);
  // Glowing stripes inset along arm and leg
  const stripe = (a, b, w) => {
    const d = new THREE.Vector2().subVectors(b, a), ang = Math.atan2(d.y, d.x);
    const groove = add(new THREE.BoxGeometry(d.length() + 0.04, w * 2.6, 0.02), dark, (a.x + b.x) / 2, (a.y + b.y) / 2, za + 0.002);
    const m = add(new THREE.BoxGeometry(d.length(), w, 0.02), teal, (a.x + b.x) / 2, (a.y + b.y) / 2, za + 0.008);
    groove.rotation.z = m.rotation.z = ang;
  };
  stripe(V2(0.0, 0.42), V2(0.62, 0.86), 0.022);
  stripe(V2(0.42, -0.05), V2(0.84, -0.8), 0.022);

  // Engines on the left: bells with hot cores
  const bell = new THREE.LatheGeometry([V2(0.09, 0), V2(0.11, 0.06), V2(0.15, 0.2), V2(0.17, 0.24), V2(0.16, 0.25)], 24).rotateZ(Math.PI / 2);
  for (const y of [-0.62, 0, 0.62]) {
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 20).rotateZ(Math.PI / 2), dark, -0.98, y, 0);
    add(bell, steel, -1.02, y, 0);
    const core = add(new THREE.CircleGeometry(0.14, 24).rotateY(-Math.PI / 2), hot, -1.24, y, 0);
    core.material.side = THREE.DoubleSide;
  }
  // Side greebles on the stem
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const g = add(new THREE.BoxGeometry(0.04 + r() * 0.06, 0.04 + r() * 0.12, 0.05 + r() * 0.14), r() < 0.5 ? dark : steel, -0.93 - r() * 0.02, -0.95 + r() * 1.9, (r() - 0.5) * 0.5);
    if (Math.abs(g.position.y) % 0.62 < 0.2) g.position.y += 0.2;
  }

  // Cockpit canopy in the joint
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x0b2a3a, metalness: 0.2, roughness: 0.05, clearcoat: 1, emissive: 0x0a4a5a, emissiveIntensity: 0.6 }));
  canopy.rotation.set(Math.PI / 2, 0, 0.55); canopy.scale.set(0.22, 0.09, 0.12); canopy.position.set(0.08, 0.22, za);
  ship.add(canopy);

  // Guns on the tips, nav lights
  const gun = new THREE.CylinderGeometry(0.025, 0.035, 0.5, 12);
  const g1 = add(gun, steel, 0.98, 1.08, 0); g1.rotation.z = -0.57;
  const g2 = add(gun, steel, 1.0, -1.08, 0); g2.rotation.z = 0.6;
  add(new THREE.SphereGeometry(0.035, 12, 8), glow([3, 0.3, 0.2]), 0.78, 1.02, za);
  add(new THREE.SphereGeometry(0.035, 12, 8), glow([0.3, 3, 0.8]), 0.82, -1.02, za);
  // Antenna on top of the stem
  add(new THREE.CylinderGeometry(0.012, 0.018, 0.34, 8), steel, -0.5, 1.22, 0);
  add(new THREE.SphereGeometry(0.03, 10, 8), glow([3, 3, 3]), -0.5, 1.4, 0);

  return ship;
}

window.renderIcon = (size = 1024) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;
  const key = new THREE.DirectionalLight(0xfff1dc, 4.2); key.position.set(-4, 5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fe0c4, 3.5); rim.position.set(4, 1, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x4060a0, 0.8); fill.position.set(2, -3, 3); scene.add(fill);
  const ship = build(scene);
  ship.rotation.set(0.1, 0.42, 0.04);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  cam.position.set(0.0, 0.25, 7.3);
  cam.lookAt(-0.3, 0.02, 0);
  renderer.render(scene, cam);
  // Screen positions of the engine mouths, for the exhaust glow painted afterwards
  ship.updateMatrixWorld(true);
  const engines = [-0.62, 0, 0.62].map(y => {
    const v = new THREE.Vector3(-1.24, y, 0).applyMatrix4(ship.matrixWorld).project(cam);
    const w = new THREE.Vector3(-2.2, y, 0).applyMatrix4(ship.matrixWorld).project(cam);
    return [(v.x + 1) / 2, (1 - v.y) / 2, (w.x + 1) / 2, (1 - w.y) / 2];
  });
  return { png: renderer.domElement.toDataURL('image/png'), engines };
};
