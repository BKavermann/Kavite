// Space stations in six hull shapes (world/station-shapes.js), docking slot in the
// flat +Z face. Detail layers: panel texture with lit windows,
// hull bands, solar wings,
// antenna dish, a lit docking tunnel, and an economy-specific module on the
// back (greenhouses, smoke stacks, ore tanks, sensor ring).
// Each station draws its look from a seed of its name: hull shape, paint, window light,
// trim colour, number of bands, wing layout, habitat ring, mast and tanks.
// All parts reuse the shared geometries; a station adds only a few materials.
// The station spins slowly around its slot axis, so a manual approach has to
// match the roll. Stations live in system coordinates; scene pos = sysPos - G.origin.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { SAFE_RADIUS } from '../config.js';
import { stationDefsFor } from '../game/economy.js';
import { dotTexture, rng, hashStr } from '../utils.js';
import { buildHoles, clearHoles } from './blackhole.js';
import { S as SIZE, SLOT_W as SW, SLOT_H as SH, SHAPES, buildHull } from './station-shapes.js';

export const STATION_SIZE = SIZE;    // the slot face sits at z = S
export const SLOT_W = SW;
export const SLOT_H = SH;
// Flat elliptical ring (a, b outer semi-axes, w width), facing +z, two-sided for the light rings
function ellipseRing(a, b, w) {
  const s = new THREE.Shape().absellipse(0, 0, a, b, 0, Math.PI * 2);
  s.holes.push(new THREE.Path().absellipse(0, 0, a - w, b - w, 0, Math.PI * 2, true));
  return new THREE.ShapeGeometry(s, 64);
}
// Inside the elliptical slot mouth (x, y in the slot plane), with a margin in metres
export const inSlotMouth = (x, y, mx = 0, my = 0) => (x / (SLOT_W / 2 + mx)) ** 2 + (y / (SLOT_H / 2 + my)) ** 2 < 1;
const SPIN = 0.14;
const TUNNEL = 30;
const Y = new THREE.Vector3(0, 1, 0);
let shared = null;

/* ---------- Procedural textures: panels + windows ---------- */
function hullTextures() {
  const r = rng(907);
  const N = 512;
  const base = document.createElement('canvas'), em = document.createElement('canvas');
  base.width = base.height = em.width = em.height = N;
  const g = base.getContext('2d'), e = em.getContext('2d');
  g.fillStyle = '#4a5058'; g.fillRect(0, 0, N, N);
  e.fillStyle = '#000'; e.fillRect(0, 0, N, N);
  for (let y = 0; y < N; y += 32) {
    for (let x = 0; x < N; ) {
      const wide = r() < 0.3 ? 64 : 32;
      const s = 128 + r() * 46;
      g.fillStyle = `rgb(${s},${s + 4},${s + 10})`;
      g.fillRect(x + 1, y + 1, wide - 2, 30);
      const roll = r();
      if (roll < 0.12) {              // vent grille
        g.fillStyle = '#3a3f46';
        for (let k = 0; k < 5; k++) g.fillRect(x + 6, y + 6 + k * 4, wide - 12, 2);
      } else if (roll < 0.17) {       // hazard stripes
        for (let k = -4; k < wide / 6; k++) {
          g.fillStyle = k % 2 ? '#d9a62a' : '#24272b';
          g.beginPath();
          g.moveTo(x + k * 6, y + 30); g.lineTo(x + k * 6 + 6, y + 30); g.lineTo(x + k * 6 + 14, y + 22); g.lineTo(x + k * 6 + 8, y + 22);
          g.fill();
        }
      } else if (roll < 0.45) {       // row of windows
        for (let wx = x + 4; wx < x + wide - 6; wx += 7) {
          g.fillStyle = '#161b22';
          g.fillRect(wx, y + 12, 4, 6);
          if (r() < 0.65) {
            e.fillStyle = r() < 0.75 ? '#ffd9a0' : '#bfe6ff';
            e.fillRect(wx, y + 12, 4, 6);
          }
        }
      } else if (roll < 0.52) {       // hatch
        g.strokeStyle = '#5c626a';
        g.strokeRect(x + 8, y + 6, wide - 16, 20);
      }
      x += wide;
    }
  }
  const mk = cv => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { map: mk(base), emissiveMap: mk(em) };
}

function solarTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa3ad'; g.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 128; y += 16) for (let x = 0; x < 256; x += 16) {
    g.fillStyle = `rgb(${18 + Math.random() * 10},${34 + Math.random() * 12},${70 + Math.random() * 20})`;
    g.fillRect(x + 1, y + 1, 14, 14);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ensureShared() {
  if (shared) return shared;
  const S = STATION_SIZE;
  const tex = hullTextures();
  const m = (o) => new THREE.MeshStandardMaterial(o);
  shared = {
    hullMat: m({ color: 0xffffff, map: tex.map, emissive: 0xffffff, emissiveMap: tex.emissiveMap, emissiveIntensity: 1.6,
      metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }),
    collar: new THREE.TorusGeometry(1, 1, 8, 32),
    box: new THREE.BoxGeometry(1, 1, 1),
    // elliptical slot parts: tunnel tube (unit radius, unit length along z), rings and the end plate
    tube: new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).rotateX(Math.PI / 2),
    innerRing: ellipseRing(SLOT_W / 2 - 0.05, SLOT_H / 2 - 0.05, 0.3),
    rimRing: ellipseRing(SLOT_W / 2 + 0.5, SLOT_H / 2 + 0.5, 0.5),
    slotDisc: new THREE.ShapeGeometry(new THREE.Shape().absellipse(0, 0, SLOT_W / 2 - 0.1, SLOT_H / 2 - 0.1, 0, Math.PI * 2), 48),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
    trimMat: m({ color: 0x3a4048, metalness: 0.7, roughness: 0.4 }),
    darkMat: m({ color: 0x23282f, metalness: 0.6, roughness: 0.5 }),
    whiteMat: m({ color: 0xd8dde3, metalness: 0.3, roughness: 0.35 }),
    solarMat: m({ map: solarTexture(), metalness: 0.7, roughness: 0.25 }),
    tunnelMat: m({ color: 0x2b3038, metalness: 0.5, roughness: 0.6, side: THREE.BackSide }),
    dish: new THREE.SphereGeometry(6, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.32),
    dome: new THREE.SphereGeometry(6.5, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat: m({ color: 0x9fdcae, emissive: 0x2a6a3a, emissiveIntensity: 0.9, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.6 }),
    rustMat: m({ color: 0x8a5a3a, metalness: 0.5, roughness: 0.7 }),
    containerMats: [0xa8402f, 0x2f5fa8, 0xc58a2a, 0x6d7680].map(c => m({ color: c, metalness: 0.3, roughness: 0.6 })),
    ring: new THREE.TorusGeometry(S * 1.55, 1.3, 8, 72),
    ringGlow: new THREE.TorusGeometry(S * 1.55, 0.35, 6, 72),
    red: new THREE.Color(2, 0.3, 0.25),
    white: new THREE.Color(1.6, 1.6, 1.6),
  };
  return shared;
}

// The giant mining rock would vanish in the dust fog (FogExp2) beyond 300 m. Its materials get
// a third of the fog density, so the rock and its rigs stay visible out to about a kilometre.
const THIN_FOG = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * 0.1 * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
function thinFog(group, owned) {
  const map = new Map();
  group.traverse(o => {
    if (!o.isMesh || !o.material.fog) return;
    let m = map.get(o.material);
    if (!m) {
      m = o.material.clone();
      m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', THIN_FOG); };
      m.customProgramCacheKey = () => 'thinfog';
      map.set(o.material, m);
      owned.push(m);
    }
    o.material = m;
  });
}

function spriteMat(color) {
  return new THREE.SpriteMaterial({ map: dotTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
}

// A box stretched between two points (girders, masts)
function beam(geo, mat, a, b, thick) {
  const mesh = new THREE.Mesh(geo, mat);
  const d = new THREE.Vector3().subVectors(b, a);
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.scale.set(thick, d.length(), thick);
  mesh.quaternion.setFromUnitVectors(Y, d.normalize());
  return mesh;
}

/* ---------- Per-station look ---------- */
const PAINT = [0xffffff, 0xf2e3c2, 0xe0b9a6, 0xb9cbe6, 0xc6dcc2, 0x9a9ea6, 0xf0d28c, 0xd8c8ec];
const WINDOW = [0xffffff, 0xffc890, 0xbfe0ff, 0xd0ffd8];
const TRIM = [0x3a4048, 0x3a4048, 0x8a2a22, 0xc07a1a, 0x22508a, 0x2a6a4a, 0xd8dde3];

export function stationLook(def) {
  const r = rng(hashStr(def.name + def.pos.join(',')));
  const pick = a => a[Math.floor(r() * a.length)];
  return {
    r,
    shape: def.econ === 'bergbau' ? (pick(SHAPES), 'rock') : /Ring/.test(def.name) ? 'wheel' : pick(SHAPES),   // mining: built into an asteroid
    spokes: pick([3, 4, 6]),
    paint: pick(PAINT), window: pick(WINDOW), trim: pick(TRIM),
    bands: pick([[0], [-0.45, 0.45], [-0.45, 0, 0.45], [-0.6, -0.2, 0.2, 0.6]]),
    wings: pick(['two', 'two', 'four', 'none', 'long']),
    panels: 1 + Math.floor(r() * 3),
    ring: r() < 0.35,
    mast: pick(['dish', 'twin', 'needle', 'tower']),
    tanks: Math.floor(r() * 5),
  };
}

/* ---------- Economy modules on the back (-Z) face ---------- */
function econModule(econ, group, tint, owned, yard) {
  const sh = ensureShared(), S = STATION_SIZE;
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz);
    group.add(o);
    return o;
  };
  if (econ === 'agrar') {
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2;
      add(sh.dome, sh.domeMat, Math.cos(a) * 15, Math.sin(a) * 15, -S - 0.6, 1, 1, 1, -Math.PI / 2);
    }
    add(sh.dome, sh.domeMat, 0, 0, -S - 0.6, 1.3, 1.3, 1.3, -Math.PI / 2);
  } else if (econ === 'industrie') {
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.8, 0.2) });
    owned.push(glow);
    for (const [x, y, h] of [[-10, 6, 18], [0, -8, 24], [11, 5, 15]]) {
      add(sh.cyl, sh.darkMat, x, y, -S - h / 2, 2.8, h, 2.8, Math.PI / 2);
      add(sh.cyl, glow, x, y, -S - h - 0.2, 2.2, 0.5, 2.2, Math.PI / 2);
    }
    // container yard on the underside
    if (yard) for (let i = 0; i < 12; i++) {
      add(sh.box, sh.containerMats[i % 4], -12 + (i % 4) * 8, -S - 1.4 - Math.floor(i / 8) * 2.6, -8 + (Math.floor(i / 4) % 2) * 3.2, 6.5, 2.5, 2.8);
    }
  } else if (econ === 'bergbau') {
    for (const x of [-9, 9]) add(sh.cyl, sh.rustMat, x, 0, -S - 7, 6, 22, 6, 0, 0, Math.PI / 2 * 0);
    add(sh.cyl, sh.rustMat, 0, 12, -S - 5, 4, 10, 4, Math.PI / 2);
    // crane: mast plus boom
    group.add(beam(sh.box, sh.trimMat, new THREE.Vector3(0, -6, -S), new THREE.Vector3(0, -6, -S - 26), 1.2));
    group.add(beam(sh.box, sh.trimMat, new THREE.Vector3(0, -6, -S - 26), new THREE.Vector3(18, -16, -S - 30), 0.9));
  } else {
    add(sh.ring, sh.trimMat, 0, 0, -S * 0.55);
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...tint) });
    owned.push(glowMat);
    add(sh.ringGlow, glowMat, 0, 0, -S * 0.55 + 1.4);
    for (let k = 0; k < 4; k++) {           // spokes
      const a = k / 4 * Math.PI * 2 + Math.PI / 4;
      group.add(beam(sh.box, sh.trimMat, new THREE.Vector3(Math.cos(a) * S * 0.5, Math.sin(a) * S * 0.5, -S * 0.55),
        new THREE.Vector3(Math.cos(a) * S * 1.55, Math.sin(a) * S * 1.55, -S * 0.55), 1.1));
    }
    for (let k = 0; k < 6; k++) group.add(beam(sh.cyl, sh.whiteMat, new THREE.Vector3(-15 + k * 6, 4, -S), new THREE.Vector3(-15 + k * 6, 4, -S - 10 - (k % 3) * 5), 0.35));
  }
}

function buildStation(def, index) {
  const sh = ensureShared(), S = STATION_SIZE;
  const group = new THREE.Group();
  const owned = [];
  const tint = new THREE.Color(...def.tint);
  const look = stationLook(def);
  const hullMat = sh.hullMat.clone();
  hullMat.color.setHex(look.paint);
  hullMat.emissive.setHex(look.window);
  const trimMat = sh.trimMat.clone();
  trimMat.color.setHex(look.trim);
  owned.push(hullMat, trimMat);
  const hull = buildHull(look.shape, { group, hullMat, trimMat, owned, sh, beam, look });

  // Solar wings: two or four arms, or none; panels per arm vary
  const arms = hull.noWings ? [] : { two: [0, Math.PI], long: [0, Math.PI], four: [Math.PI / 6, -Math.PI / 6, Math.PI * 5 / 6, Math.PI * 7 / 6], none: [] }[look.wings];
  const a0 = hull.armStart;
  const reach = look.wings === 'long' ? 70 : look.wings === 'four' ? 34 : 46;
  for (const a of arms) {
    const arm = new THREE.Group();
    arm.rotation.z = a;
    arm.position.z = hull.armZ;
    group.add(arm);
    arm.add(beam(sh.cyl, trimMat, new THREE.Vector3(a0, 0, 0), new THREE.Vector3(a0 + 4 + reach, 0, 0), 0.9));
    const len = (reach - 8) / look.panels;
    for (let k = 0; k < look.panels; k++) for (const z of [-7, 7]) {
      const panel = new THREE.Mesh(sh.box, sh.solarMat);
      panel.position.set(a0 + 6 + len * (k + 0.5), 0, z);
      panel.scale.set(len - 2, 0.3, 11);
      arm.add(panel);
    }
  }

  // Habitat ring around the hull on four spokes
  if (look.ring && hull.ring) {
    const { r: rr, z: rz, inner } = hull.ring;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 4.5, 10, 64), hullMat);
    ring.position.z = rz;
    owned.push(ring.geometry);
    group.add(ring);
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + Math.PI / 4;
      const c = Math.cos(a), sn = Math.sin(a);
      group.add(beam(sh.cyl, trimMat, new THREE.Vector3(c * inner, sn * inner, rz), new THREE.Vector3(c * rr, sn * rr, rz), 1));
    }
  }

  // Tanks strapped to the underside
  if (hull.tanks) for (let k = 0; k < look.tanks; k++) {
    const x = (k - (look.tanks - 1) / 2) * 9;
    const tank = new THREE.Mesh(sh.cyl, k % 2 ? sh.whiteMat : trimMat);
    tank.position.set(x, hull.tanks.y, hull.tanks.z);
    tank.rotation.x = Math.PI / 2;
    tank.scale.set(3.2, 22, 3.2);
    group.add(tank);
  }

  // Mast on +Y with a red light on top: dish, twin dishes, a needle or a tower
  const mast = new THREE.Group();
  mast.position.copy(hull.mast);
  group.add(mast);
  const top = look.mast === 'needle' ? 44 : look.mast === 'tower' ? 30 : 24;
  mast.add(beam(sh.cyl, sh.whiteMat, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, top, 0), look.mast === 'tower' ? 2.2 : 0.7));
  const dishAt = (x, y, z, rx, sc = 1) => {
    const dish = new THREE.Mesh(sh.dish, sh.whiteMat);
    dish.position.set(x, y, z);
    dish.rotation.x = rx;
    dish.scale.setScalar(sc);
    mast.add(dish);
  };
  if (look.mast === 'dish') dishAt(0, 16, 0, Math.PI * 0.62);
  else if (look.mast === 'twin') { dishAt(0, 12, 0, Math.PI * 0.62, 0.7); dishAt(0, 20, 0, -Math.PI * 0.62, 0.7); }
  else if (look.mast === 'tower') for (const y of [10, 18, 26]) {
    const deck = new THREE.Mesh(sh.cyl, trimMat);
    deck.position.set(0, y, 0);
    deck.scale.set(5, 1.6, 5);
    mast.add(deck);
  }
  const topMat = spriteMat(sh.red);
  owned.push(topMat);
  const topLight = new THREE.Sprite(topMat);
  topLight.position.set(0, top + 1, 0);
  topLight.scale.setScalar(3);
  mast.add(topLight);

  // Docking tunnel behind the slot, elliptical like the mouth, with light rings
  const tunnel = new THREE.Mesh(sh.tube, sh.tunnelMat);
  tunnel.position.z = S - TUNNEL / 2;
  tunnel.scale.set(SLOT_W / 2, SLOT_H / 2, TUNNEL);
  group.add(tunnel);
  const frameMat = new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(0.8), side: THREE.DoubleSide });
  const endMat = new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(0.25) });
  owned.push(frameMat, endMat);
  for (let k = 1; k <= 4; k++) {
    const z = S - k * 6.5;
    const f = new THREE.Mesh(sh.innerRing, frameMat);
    f.position.z = z;
    group.add(f);
  }
  const end = new THREE.Mesh(sh.slotDisc, endMat);
  end.position.z = S - TUNNEL + 0.4;
  group.add(end);

  // Slot rim lights
  const stripMat = new THREE.MeshBasicMaterial({ color: tint, fog: false });
  owned.push(stripMat);
  const rim = new THREE.Mesh(sh.rimRing, stripMat);
  rim.position.z = S + 0.15;
  group.add(rim);

  const back = new THREE.Group();
  back.position.z = hull.back + S;           // modules were laid out for a back face at z = -S
  group.add(back);
  if (!hull.rock) econModule(def.econ, back, def.tint, owned, hull.yard);

  // Blinking vertex lights
  const lights = hull.lights.map((v, i) => {
    const mat = spriteMat(i % 2 ? sh.red : sh.white);
    owned.push(mat);
    const sp = new THREE.Sprite(mat);
    sp.position.copy(v);
    sp.scale.setScalar(2.4);
    group.add(sp);
    return { sp, phase: i * 0.37 };
  });
  lights.push({ sp: topLight, phase: 0.9 });
  // Steady work lamps (mining rigs): big enough to stay a calm dot instead of shimmering
  for (const v of hull.lamps || []) {
    const mat = spriteMat(new THREE.Color(1.7, 1.25, 0.7));
    owned.push(mat);
    const sp = new THREE.Sprite(mat);
    sp.position.copy(v);
    sp.scale.setScalar(3.5);
    group.add(sp);
  }

  // Approach lights on the slot axis, chasing toward the slot
  const approach = [];
  for (let k = 0; k < 6; k++) {
    const mat = spriteMat(tint);
    owned.push(mat);
    const sp = new THREE.Sprite(mat);
    sp.position.set(0, -SLOT_H, S + 18 + k * 22);
    sp.scale.setScalar(1.8);
    group.add(sp);
    approach.push(sp);
  }

  const beaconMat = spriteMat(tint.clone().multiplyScalar(0.5));
  owned.push(beaconMat);
  const beacon = new THREE.Sprite(beaconMat);
  group.add(beacon);

  if (hull.rock) thinFog(group, owned);
  group.rotation.set(...def.rot);
  const sysPos = new THREE.Vector3().fromArray(def.pos);
  group.position.copy(sysPos).sub(G.origin);
  G.scene.add(group);
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  return { def, index, group, pos: group.position, sysPos, S, radius: hull.extent, fadeAt: hull.rock ? 900 : Math.min(hull.extent * 4, 340), hit: hull.hit, inv, shape: look.shape, lights, approach, beacon, owned, trafficT: 3 + Math.random() * 6 };
}

export function clearStations() {
  clearHoles();
  for (const st of G.stations) {
    G.scene.remove(st.group);
    st.owned.forEach(m => m.dispose());
  }
  G.stations.length = 0;
}

export function buildStations(system) {
  clearStations();
  stationDefsFor(system).forEach((def, i) => G.stations.push(buildStation(def, i)));
  buildHoles();
}

export function updateStations(dt) {
  const t = G.time, cam = G.camera.position, S = STATION_SIZE;
  for (const st of G.stations) {
    st.pos.copy(st.sysPos).sub(G.origin);
    st.group.rotateZ(SPIN * dt);
    st.group.updateMatrixWorld(true);
    st.inv.copy(st.group.matrixWorld).invert();
    for (const l of st.lights) l.sp.material.opacity = Math.sin(t * 2.6 + l.phase * 7) > 0.55 ? 1 : 0.18;
    const lit = Math.floor(t * 7) % 9;
    st.approach.forEach((sp, k) => { sp.material.opacity = (st.approach.length - 1 - k) === lit ? 1 : 0.15; });
    // Halo: hidden up close, grows with distance so far stations stay visible as a star
    const d = st.pos.distanceTo(cam);
    st.beacon.material.opacity = Math.min(1, Math.max(0, (d - st.fadeAt) / 300));   // the mining rock stays visible itself out to ~1 km
    st.beacon.scale.setScalar(Math.max(S * 3.2, d * 0.022));
  }
}

export const slotDir = (st, out) => out.set(0, 0, 1).applyQuaternion(st.group.quaternion);
export const stationUp = (st, out) => out.set(0, 1, 0).applyQuaternion(st.group.quaternion);

export function nearestStation(pos) {
  let best = null, bd = Infinity;
  for (const st of G.stations) {
    const d = st.pos.distanceTo(pos);
    if (d < bd) { bd = d; best = st; }
  }
  return { st: best, d: bd };
}

// True when a point (scene coordinates) is inside the station's hull, grown by margin m
const hitP = new THREE.Vector3();
export function stationHit(st, p, m = 0) {
  if (p.distanceToSquared(st.pos) > (st.radius + m) ** 2) return false;
  return st.hit(hitP.copy(p).applyMatrix4(st.inv), m);
}

export const inSafeZone = pos => nearestStation(pos).d < SAFE_RADIUS;
