// Bought upgrades made visible on the ship: cargo pods, hyperdrive coils, shield emitters,
// laser cooling rings, ammo drums, a railgun, missile racks, a fuel scoop and the small
// sensors of the docking and targeting computers. Used for the flown ship and for the
// ship on the hangar pad. The smuggling hold stays hidden, that is its point.
//
// Mount points are per model (nose -Z, up +Y, metres, see tools/make_models.py); laser
// rings and ammo drums follow the Gun_L/Gun_R nodes. Parts take their colours from the
// ship's own materials so they look like they belong to it.
import * as THREE from 'three';

const MOUNTS = {
  // Kestrel: allrounder, nacelles at the wing roots
  player: {
    cargo: [
      [{ p: [-1.2, -0.74, 0], r: 0.27, len: 1.9, up: 0.24 }, { p: [1.2, -0.74, 0], r: 0.27, len: 1.9, up: 0.24 }],
      [{ p: [-2.68, -0.5, 0.45], r: 0.22, len: 1.6, up: 0.2 }, { p: [2.68, -0.5, 0.45], r: 0.22, len: 1.6, up: 0.2 }],
      [{ p: [0, -0.92, 1.35], r: 0.3, len: 1.5, up: 0.28 }],
    ],
    hyper: { engines: [[-1.9, -0.05, 0.56], [1.9, -0.05, 0.56]], z: [2.15, 1.8, 1.45] },
    shield: [[-3.55, 0.06, 1.05], [3.55, 0.06, 1.05], [-0.75, 0.86, 1.0], [0.75, 0.86, 1.0]],
    shieldR: 0.2,
    gunR: 0.1, mag: [0, -0.24, 1.45], magStep: 0.42,
    rail: { x: 0, y: -0.68, z0: -2.05, z1: 0.55, below: true },
    missile: [[-4.28, -0.24, 0.95], [4.28, -0.24, 0.95]], missileLen: 1.2,
    scoop: { p: [0, -0.4, -3.45], w: 0.42, h: 0.22, len: 0.7 },
    dock: [-0.5, 0.36, -3.45], aim: [0.5, 0.36, -3.45], sensorUp: 0.12,
    rear: { p: [0, -0.57, 1.9], s: 0.3 },
  },
  // Hornet: fighter, guns at the wing tips, intake under the body
  hornet: {
    cargo: [
      [{ p: [-1.75, -0.36, 0.7], r: 0.18, len: 1.3, up: 0.18 }, { p: [1.75, -0.36, 0.7], r: 0.18, len: 1.3, up: 0.18 }],
      [{ p: [-2.5, -0.28, 0.85], r: 0.15, len: 1.0, up: 0.15 }, { p: [2.5, -0.28, 0.85], r: 0.15, len: 1.0, up: 0.15 }],
      [{ p: [0, -0.98, 0.25], r: 0.22, len: 1.5, up: 0.24 }],
    ],
    hyper: { engines: [[0, -0.02, 0.62]], z: [3.25, 2.85, 2.45] },
    shield: [[-2.15, 0.13, 1.0], [2.15, 0.13, 1.0], [-0.42, 0.62, 0.15], [0.42, 0.62, 0.15]],
    shieldR: 0.16,
    gunR: 0.08, mag: [0, -0.2, 1.9], magStep: 0.38,
    rail: { x: 0, y: 0.8, z0: -0.55, z1: 1.2, below: false },
    missile: [[-3.0, -0.2, 1.05], [3.0, -0.2, 1.05]], missileLen: 1.0,
    scoop: { p: [0, -0.3, -3.15], w: 0.34, h: 0.17, len: 0.6 },
    dock: [-0.32, 0.26, -3.55], aim: [0.32, 0.26, -3.55], sensorUp: 0.1,
    rear: { p: [0, -0.48, 3.4], s: 0.26 },
  },
  // Atlas: freighter, four engines, cargo pods go on the roof
  atlas: {
    cargo: [
      [{ p: [-0.8, 2.48, -1.8], r: 0.48, len: 2.0, up: -0.42 }, { p: [0.8, 2.48, -1.8], r: 0.48, len: 2.0, up: -0.42 }],
      [{ p: [-0.8, 2.48, 0.45], r: 0.48, len: 2.0, up: -0.42 }, { p: [0.8, 2.48, 0.45], r: 0.48, len: 2.0, up: -0.42 }],
      [{ p: [-0.8, 2.48, 2.7], r: 0.48, len: 1.9, up: -0.42 }, { p: [0.8, 2.48, 2.7], r: 0.48, len: 1.9, up: -0.42 }],
    ],
    hyper: { engines: [[-1.45, -0.6, 0.66], [1.45, -0.6, 0.66], [-1.45, 0.75, 0.66], [1.45, 0.75, 0.66]], z: [7.4, 7.1, 6.8] },
    shield: [[-3.7, -0.15, 2.4], [3.7, -0.15, 2.4], [-2.0, 1.62, -2.0], [2.0, 1.62, -2.0]],
    shieldR: 0.3,
    gunR: 0.13, mag: [0, -0.3, 1.8], magStep: 0.5,
    rail: { x: 0, y: -1.82, z0: -3.7, z1: -0.4, below: true },
    missile: [[-3.6, -0.72, 2.3], [3.6, -0.72, 2.3]], missileLen: 1.5,
    scoop: { p: [0, -1.12, -6.6], w: 0.62, h: 0.3, len: 0.9 },
    dock: [-1.0, 0.86, -6.85], aim: [1.0, 0.86, -6.85], sensorUp: 0.16,
    rear: { p: [0, -1.53, 5.4], s: 0.45 },
  },
};

// Hyperdrive coil colour per drive class
const HYPER_GLOW = [[0.35, 0.85, 2.4], [0.7, 0.55, 2.6], [1.7, 0.45, 2.6]];

/* ---------- Materials ---------- */
const glowCache = new Map();
function glow(rgb) {
  const k = rgb.join(',');
  if (!glowCache.has(k)) glowCache.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), fog: false }));
  return glowCache.get(k);
}
const matCache = new Map();
// Plain copies of the ship's own paints (without the hull panel texture, which needs box UVs)
function paints(model, key) {
  if (matCache.has(key)) return matCache.get(key);
  const found = {};
  model.traverse(o => { if (o.isMesh && o.material && !found[o.material.name]) found[o.material.name] = o.material; });
  const copy = (name, hex) => {
    const m = found[name];
    return new THREE.MeshStandardMaterial({
      color: m ? m.color.clone() : new THREE.Color(hex), metalness: m ? m.metalness : 0.5, roughness: m ? m.roughness : 0.45,
      side: THREE.DoubleSide,
    });
  };
  const set = {
    hull: copy('Hull', 0x9ea4ad), dark: copy('HullDark', 0x2a2e34), trim: copy('Trim', 0xd86a20),
    metal: new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.85, roughness: 0.3 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb8682e, metalness: 0.9, roughness: 0.35 }),
  };
  matCache.set(key, set);
  return set;
}

/* ---------- Geometry (shared, unit sized where possible) ---------- */
const geo = {};
const G0 = (k, make) => geo[k] || (geo[k] = make());
const box = () => G0('box', () => new THREE.BoxGeometry(1, 1, 1));
const cylZ = () => G0('cylZ', () => new THREE.CylinderGeometry(1, 1, 1, 18).rotateX(Math.PI / 2));
const cylX = () => G0('cylX', () => new THREE.CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2));
const sphere = () => G0('sphere', () => new THREE.SphereGeometry(1, 18, 12));
const half = () => G0('half', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
const torus = t => G0('torus' + t, () => new THREE.TorusGeometry(1, t, 8, 32));
const capsule = (r, len) => G0(`cap${r},${len}`, () => new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 16).rotateX(Math.PI / 2));
const cone = () => G0('cone', () => new THREE.ConeGeometry(1, 1, 14).rotateX(-Math.PI / 2));     // tip towards -Z
const funnel = () => G0('funnel', () => new THREE.CylinderGeometry(1, 0.62, 1, 24, 1, true).rotateX(-Math.PI / 2));   // wide end at -Z

function put(parent, g, m, x, y, z, sx = 1, sy = sx, sz = sx) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

/* ---------- Parts ---------- */
// Rounded cargo pod along the ship's axis, with two paint bands and a pylon to the hull
function pod(g, M, { p: [x, y, z], r, len, up }) {
  put(g, capsule(r, len), M.hull, x, y, z);
  for (const s of [-0.28, 0.28]) put(g, torus(0.06), M.trim, x, y, z + s * len, r * 1.02, r * 1.02, r * 1.02);
  put(g, box(), M.dark, x, y + Math.sign(up) * (r + Math.abs(up) / 2 - 0.05), z, r * 0.45, Math.abs(up) + 0.1, len * 0.55);
}

// Hyperdrive: glowing field coils around each engine, one per drive class, in the class colour,
// each held by two thin dark collars
function hyperCoils(g, M, H, lvl) {
  const c = glow(HYPER_GLOW[Math.min(lvl, 3) - 1]);
  for (const [x, y, r] of H.engines) {
    for (let i = 0; i < Math.min(lvl, H.z.length); i++) {
      const z = H.z[i], R = r + 0.02;
      put(g, torus(0.07), c, x, y, z, R + 0.03);
      for (const d of [-0.09, 0.09]) put(g, torus(0.05), M.metal, x, y, z + d, R);
    }
  }
}

// Shield emitter: a glowing half dome on a dark collar
function emitter(g, M, [x, y, z], r) {
  put(g, cylZ(), M.dark, x, y + 0.02, z, r * 1.3, r * 1.3, 0.08).rotation.x = Math.PI / 2;
  put(g, half(), glow([0.45, 1.5, 2.4]), x, y + 0.05, z, r, r * 0.8, r);
}

// Pulse laser Mk II: cooling rings along the barrel and a red-hot focus ring at the muzzle
function laserRings(g, M, gun, rb) {
  const { x, y, z } = gun.position;
  put(g, torus(0.3), glow([2.6, 0.35, 0.25]), x, y, z + 0.12, rb * 1.25);
  for (const d of [0.38, 0.6, 0.82]) put(g, torus(0.35), M.metal, x, y, z + d, rb * 1.6);
}

// Ammo drum below the barrel, with a feed to it
function drum(g, M, gun, off, dz) {
  const { x, y, z } = gun.position;
  const px = x + off[0], py = y + off[1], pz = z + off[2] + dz;
  put(g, cylX(), M.dark, px, py, pz, 0.3, 0.15, 0.15);
  put(g, cylX(), M.trim, px, py, pz, 0.08, 0.158, 0.158);
  put(g, box(), M.metal, px, (py + y) / 2, pz - 0.05, 0.05, Math.abs(y - py), 0.08);
}

// Railgun: two rails with copper coils and a blue charge strip, on a mounting block
function railgun(g, M, R) {
  const len = R.z1 - R.z0, zc = (R.z0 + R.z1) / 2, s = R.below ? 1 : -1;
  put(g, box(), M.dark, R.x, R.y + s * 0.13, zc + len * 0.12, 0.34, 0.12, len * 0.6);
  for (const dx of [-0.1, 0.1]) put(g, box(), M.metal, R.x + dx, R.y, zc, 0.06, 0.1, len);
  put(g, box(), glow([0.6, 1.4, 2.6]), R.x, R.y, zc, 0.04, 0.03, len * 0.96);
  for (let z = R.z0 + 0.35; z < R.z1 - 0.2; z += 0.42) put(g, torus(0.22), M.copper, R.x, R.y, z, 0.2, 0.15, 0.2);
}

// Missile rack: a pylon and three missiles with red noses
function rack(g, M, [x, y, z], len) {
  put(g, box(), M.dark, x, y + 0.05, z, 0.1, 0.12, len * 0.7);
  const r = 0.07 * (len / 1.1);
  for (const [dx, dy] of [[-0.15, -0.08], [0.15, -0.08], [0, -0.26]]) {
    const mx = x + dx * (len / 1.1), my = y + dy * (len / 1.1);
    put(g, cylZ(), M.hull, mx, my, z + 0.1, r, r, len * 0.72);
    put(g, cone(), glow([2.2, 0.35, 0.2]), mx, my, z + 0.1 - len * 0.36 - len * 0.08, r, r, len * 0.16);
    put(g, cylZ(), M.dark, mx, my, z + 0.1 + len * 0.36, r * 0.8, r * 0.8, len * 0.08);
  }
}

// Fuel scoop: a flattened intake funnel under the nose, glowing amber inside, trim rim at the front
function scoop(g, M, S) {
  const [x, y, z] = S.p;
  put(g, funnel(), M.dark, x, y, z, S.w, S.h, S.len);
  put(g, torus(0.09), M.trim, x, y, z - S.len / 2, S.w, S.h, S.w);
  const back = put(g, sphere(), glow([2.4, 1.3, 0.35]), x, y, z + S.len * 0.42, S.w * 0.6, S.h * 0.6, 0.04);
  back.renderOrder = 1;
}

// Docking (green beacon) and targeting computer (red lens): small sensor heads on stalks
function sensor(g, M, [x, y, z], up, rgb, dish) {
  put(g, cylZ(), M.metal, x, y + up / 2, z, 0.025, 0.025, up).rotation.x = Math.PI / 2;
  put(g, sphere(), M.dark, x, y + up, z, 0.08);
  put(g, sphere(), glow(rgb), x, y + up, z - 0.065, 0.04);
  if (dish) put(g, cone(), M.hull, x, y + up + 0.02, z + 0.06, 0.11, 0.11, 0.06).rotation.y = Math.PI;
}

// Rear laser: a small turret under the tail with twin barrels pointing back (+Z), red muzzles.
// Gun_Rear marks the muzzle for the bolts and the rear-view camera.
function rearTurret(g, M, { p: [x, y, z], s }) {
  const t = new THREE.Group();
  t.position.set(x, y, z);
  t.scale.setScalar(s);
  g.add(t);
  put(t, cylZ(), M.dark, 0, -0.08, 0, 0.9, 0.9, 0.16).rotation.x = Math.PI / 2;      // mounting ring
  put(t, half(), M.hull, 0, -0.1, 0, 0.75, -0.8, 0.75);                              // turret dome, hanging down
  put(t, box(), M.dark, 0, -0.55, 0.45, 0.9, 0.42, 0.9);                              // gun housing
  for (const dx of [-0.24, 0.24]) {
    put(t, cylZ(), M.metal, dx, -0.55, 1.45, 0.09, 0.09, 1.6);                        // barrels
    put(t, torus(0.35), M.trim, dx, -0.55, 1.0, 0.15);
    put(t, cylZ(), glow([2.6, 0.35, 0.25]), dx, -0.55, 2.27, 0.07, 0.07, 0.06);       // muzzle glow
  }
  const muzzle = new THREE.Object3D();
  muzzle.name = 'Gun_Rear';
  muzzle.position.set(0, -0.55, 2.4);
  t.add(muzzle);
}

/* ---------- Public ---------- */
// What is visible for these upgrades, so callers can tell when to rebuild
export const addonKey = up => ['hyper', 'dock', 'cargo', 'magazine', 'shield', 'laser', 'rail', 'missile', 'scoop', 'aim', 'rear']
  .map(k => (up && up[k]) || 0).join('');

// Adds (or replaces) the add-on group on a ship model built from MODELS[key]
export function applyAddons(model, key, up) {
  const old = model.getObjectByName('Addons');
  if (old) model.remove(old);
  const A = MOUNTS[key];
  if (!A || !up) return;
  const M = paints(model, key);
  const g = new THREE.Group();
  g.name = 'Addons';
  const guns = ['Gun_L', 'Gun_R'].map(n => model.getObjectByName(n)).filter(Boolean);

  for (let i = 0; i < Math.min(up.cargo || 0, A.cargo.length); i++) A.cargo[i].forEach(c => pod(g, M, c));
  if (up.hyper) hyperCoils(g, M, A.hyper, up.hyper);
  A.shield.slice(0, 2 * Math.min(up.shield || 0, 2)).forEach(p => emitter(g, M, p, A.shieldR));
  if (up.laser) guns.forEach(gun => laserRings(g, M, gun, A.gunR));
  for (let i = 0; i < Math.min(up.magazine || 0, 2); i++) guns.forEach(gun => drum(g, M, gun, A.mag, i * A.magStep));
  if (up.rail) railgun(g, M, A.rail);
  if (up.missile) A.missile.forEach(p => rack(g, M, p, A.missileLen));
  if (up.scoop) scoop(g, M, A.scoop);
  if (up.dock) sensor(g, M, A.dock, A.sensorUp, [0.3, 2.4, 0.6], true);
  if (up.aim) sensor(g, M, A.aim, A.sensorUp, [2.6, 0.3, 0.25], false);
  if (up.rear && A.rear) rearTurret(g, M, A.rear);
  model.add(g);
}
