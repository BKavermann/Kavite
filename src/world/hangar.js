// Hangar interior shown behind the station screen while docked: the player's
// ship parked on a lit landing pad inside a vaulted bay, the bay opening onto
// space behind a shimmering force field. Own scene and camera; the renderer
// switches to it while the station screen is open (hangarView()).
// Lighting and props follow the station's economy; each station adds its own
// variation from the seed of its name (wall paint, accent hue, haze, lamps,
// props, a parked hauler, the planet outside).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { G } from '../ctx.js';
import { cloneModel, buildFallbackShip } from '../core/assets.js';
import { skyPlanetTexture } from './sky.js';
import { stationLook } from './station.js';
import { haulerModel } from './traffic.js';
import { shipDef } from '../game/save.js';
import { applyAddons, addonKey } from './ship-addons.js';
import { applyHullMarks, damageFx } from './ship-damage.js';
import { wearOf, wearStep } from '../game/damage.js';
import { dotTexture, radialTexture, rng, hashStr } from '../utils.js';

const R = 21;              // vault radius
const LEN = 64;            // vault length along z; the opening is at +z
const PAD_R = 9;

// Per economy: key light, wall accents, fog, extra props
const THEMES = {
  agrar: { key: 0xffe2b8, accent: [0.6, 2.2, 1.2], fill: 0x3a6a4a, fog: 0x0b1410, grow: true },
  industrie: { key: 0xffc890, accent: [2.4, 1.1, 0.3], fill: 0x6a4020, fog: 0x140c06, crates: 14 },
  bergbau: { key: 0xffd0a8, accent: [1.6, 0.9, 2.4], fill: 0x4a3060, fog: 0x0e0a12, ore: true },
  hightech: { key: 0xe8f4ff, accent: [0.5, 1.6, 2.6], fill: 0x2a4a70, fog: 0x060c14, holo: true },
};

// The exits: position along the left wall (between the vault ribs), sign colour, station screen they open
export const DOORS = [
  { key: 'yard', label: 'WERFT', z: -13, color: [2.2, 1.1, 0.3] },
  { key: 'market', label: 'MARKT', z: -1, color: [0.5, 2.0, 1.6] },
  { key: 'jobs', label: 'BAR', z: 11, color: [2.2, 0.45, 1.6] },
];
const WALL_X = 20.55;

let H = null, active = false, focus = null;

/* ---------- Canvas textures ---------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function floorTex() {
  const r = rng(51);
  return canvasTex(512, 512, (g, N) => {
    g.fillStyle = '#1c2026'; g.fillRect(0, 0, N, N);
    for (let y = 0; y < N; y += 64) for (let x = 0; x < N; x += 64) {
      const s = 34 + r() * 12;
      g.fillStyle = `rgb(${s},${s + 3},${s + 7})`;
      g.fillRect(x + 2, y + 2, 60, 60);
      g.fillStyle = 'rgba(0,0,0,.35)';
      for (const [bx, by] of [[7, 7], [55, 7], [7, 55], [55, 55]]) g.fillRect(x + bx, y + by, 3, 3);
      if (r() < 0.15) {                                         // grating
        g.fillStyle = '#15181c';
        for (let k = 0; k < 8; k++) g.fillRect(x + 10, y + 10 + k * 6, 44, 3);
      }
      if (r() < 0.25) { g.fillStyle = `rgba(0,0,0,${r() * 0.25})`; g.beginPath(); g.ellipse(x + 32, y + 32, 10 + r() * 30, 8 + r() * 20, r() * 3, 0, 7); g.fill(); }
    }
  });
}

function padTex() {
  return canvasTex(512, 512, (g, N) => {
    const c = N / 2;
    g.fillStyle = '#2a2f36'; g.fillRect(0, 0, N, N);
    for (const [rr, col, w] of [[250, '#3a4048', 10], [214, '#d9a62a', 3], [150, '#4a5058', 2], [90, '#d9a62a', 2]]) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(c, c, rr, 0, Math.PI * 2); g.stroke();
    }
    // Hazard ring
    for (let k = 0; k < 48; k++) {
      g.fillStyle = k % 2 ? '#d9a62a' : '#16181b';
      g.beginPath(); g.arc(c, c, 238, k / 48 * Math.PI * 2, (k + 1) / 48 * Math.PI * 2); g.arc(c, c, 222, (k + 1) / 48 * Math.PI * 2, k / 48 * Math.PI * 2, true); g.fill();
    }
    // Landing chevrons and pad number
    g.fillStyle = 'rgba(230,236,240,.75)';
    for (let k = 0; k < 4; k++) {
      g.save(); g.translate(c, c); g.rotate(k * Math.PI / 2);
      g.beginPath(); g.moveTo(-26, -200); g.lineTo(0, -176); g.lineTo(26, -200); g.lineTo(26, -188); g.lineTo(0, -164); g.lineTo(-26, -188); g.fill();
      g.restore();
    }
    g.font = '700 120px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(230,236,240,.18)'; g.fillText('07', c, c);
  });
}

function wallTex() {
  const r = rng(77);
  const base = canvasTex(512, 512, (g, N) => {
    g.fillStyle = '#30363e'; g.fillRect(0, 0, N, N);
    for (let y = 0; y < N; y += 48) for (let x = 0; x < N; ) {
      const w = r() < 0.4 ? 128 : 64, s = 62 + r() * 26;
      g.fillStyle = `rgb(${s},${s + 4},${s + 9})`;
      g.fillRect(x + 2, y + 2, w - 4, 44);
      if (r() < 0.12) { g.fillStyle = '#23282e'; for (let k = 0; k < 6; k++) g.fillRect(x + 8, y + 8 + k * 6, w - 16, 3); }
      else if (r() < 0.1) { g.strokeStyle = '#4a5058'; g.lineWidth = 2; g.strokeRect(x + 10, y + 8, w - 20, 30); }
      x += w;
    }
  });
  const em = canvasTex(512, 512, (g, N) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
    for (let y = 0; y < N; y += 48) for (let x = 0; x < N; x += 32) {
      if (r() < 0.06) { g.fillStyle = r() < 0.7 ? '#ffcf90' : '#9fd8ff'; g.fillRect(x + 6, y + 18, 18, 5); }
    }
  });
  return { base, em };
}

function screenTex(accent) {
  const r = rng(5);
  const col = `rgb(${Math.min(255, accent[0] * 110)},${Math.min(255, accent[1] * 110)},${Math.min(255, accent[2] * 110)})`;
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#04080c'; g.fillRect(0, 0, w, h);
    g.fillStyle = col; g.strokeStyle = col;
    for (let i = 0; i < 9; i++) g.fillRect(10, 10 + i * 12, 30 + r() * 80, 4);
    g.lineWidth = 2; g.beginPath();
    for (let x = 0; x < 100; x++) g.lineTo(140 + x, 70 - Math.sin(x * 0.15) * 20 - r() * 10);
    g.stroke();
    g.strokeRect(136, 12, 108, 104);
  });
}

function signTex(label, color) {
  const css = `rgb(${Math.min(255, color[0] * 120)},${Math.min(255, color[1] * 120)},${Math.min(255, color[2] * 120)})`;
  const t = canvasTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(6,10,14,.75)'; g.fillRect(8, 14, w - 16, h - 28);
    g.strokeStyle = css; g.lineWidth = 4; g.shadowColor = css; g.shadowBlur = 16;
    g.strokeRect(12, 18, w - 24, h - 36);
    g.font = '700 64px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.shadowBlur = 24; g.fillText(label.split('').join(' '), w / 2, h / 2 + 3);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// What you see through an open door: a lit corridor in the door's colour
function corridorTex(color) {
  const c = color.map(v => Math.min(255, v * 90));
  return canvasTex(256, 256, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h * 0.55, 8, w / 2, h * 0.55, w * 0.7);
    grd.addColorStop(0, `rgb(${c[0]},${c[1]},${c[2]})`); grd.addColorStop(1, '#05070a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(w / 2 + (x ? 30 : -30), h * 0.55 + (y ? 34 : -34)); g.stroke(); }
    g.strokeRect(w / 2 - 30, h * 0.55 - 34, 60, 68);
  });
}

/* ---------- Build once ---------- */
function build() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 3000);
  const pmrem = new THREE.PMREMGenerator(G.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  scene.background = new THREE.Color(0x020306);
  scene.fog = new THREE.Fog(0x0a0c10, 40, 140);

  const m = o => new THREE.MeshStandardMaterial(o);
  const wt = wallTex();
  wt.base.repeat.set(10, 5); wt.em.repeat.set(10, 5);
  const mats = {
    floor: m({ map: (() => { const t = floorTex(); t.repeat.set(12, 12); return t; })(), metalness: 0.3, roughness: 0.7 }),
    wall: m({ map: wt.base, emissive: 0xffffff, emissiveMap: wt.em, emissiveIntensity: 1.4, metalness: 0.45, roughness: 0.6, side: THREE.BackSide }),
    trim: m({ color: 0x272c33, metalness: 0.75, roughness: 0.35 }),
    dark: m({ color: 0x15181c, metalness: 0.6, roughness: 0.5 }),
    pad: m({ map: padTex(), metalness: 0.5, roughness: 0.45 }),
    padSide: m({ color: 0x23282e, metalness: 0.7, roughness: 0.4 }),
    strip: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) }),        // recoloured per theme
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.1, 1.0) }),        // soft, just at the glow threshold
    containers: [0xa8402f, 0x2f5fa8, 0xc58a2a, 0x6d7680, 0x3f7a4a].map(c => m({ color: c, metalness: 0.35, roughness: 0.6 })),
  };
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent = scene) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z); o.scale.set(sx, sy, sz);
    parent.add(o);
    return o;
  };

  // Floor, vault, ribs and the back wall
  const floor = add(new THREE.PlaneGeometry(2 * R, LEN), mats.floor, 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  // Half cylinder along z, arching over the floor
  scene.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, LEN, 64, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), mats.wall));
  const ribGeo = new THREE.TorusGeometry(R - 0.3, 0.45, 8, 48, Math.PI);
  for (let z = -LEN / 2 + 4; z <= LEN / 2; z += 6) add(ribGeo, mats.trim, 0, 0, z);
  const backWall = add(new THREE.CircleGeometry(R, 48, 0, Math.PI), mats.wall, 0, 0, -LEN / 2);
  backWall.material = mats.backWall = mats.wall.clone();
  backWall.material.side = THREE.FrontSide;
  // Opening frame at the far end
  add(new THREE.TorusGeometry(R - 0.6, 1.2, 10, 48, Math.PI), mats.trim, 0, 0, LEN / 2);

  // One soft light strip along the ceiling, walkways on both sides
  const strips = [];
  for (const a of [0.5]) {
    const ang = a * Math.PI, x = Math.cos(ang) * (R - 0.9), y = Math.sin(ang) * (R - 0.9);
    const s = add(box, a === 0.5 ? mats.lamp : mats.strip, x, y, 0, 0.5, 0.25, LEN - 6);
    s.rotation.z = ang - Math.PI / 2;
    strips.push(s);
  }
  for (const sx of [-1, 1]) {
    add(box, mats.trim, sx * (R - 4), 5, 0, 5, 0.4, LEN - 4);                         // walkway deck
    add(box, mats.trim, sx * (R - 6.5), 6.1, 0, 0.08, 0.08, LEN - 4);               // railing
    for (let z = -LEN / 2 + 3; z < LEN / 2; z += 4) add(box, mats.trim, sx * (R - 6.5), 5.6, z, 0.12, 1.1, 0.12);
    for (let z = -LEN / 2 + 6; z < LEN / 2 - 6; z += 12) {
      const near = sx < 0 && DOORS.find(d => Math.abs(d.z - z) < 6);
      const zz = near ? near.z + (z < near.z ? -6 : 6) : z;
      add(box, mats.trim, sx * (R - 6.5), 2.5, zz, 0.5, 5, 0.5);
    }
  }

  // Landing pad with glowing rim, plus landing guide lights in the floor
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R, PAD_R + 0.4, 0.4, 64), [mats.padSide, mats.pad, mats.padSide]);
  pad.position.y = 0.2;
  scene.add(pad);
  const padRing = add(new THREE.TorusGeometry(PAD_R + 0.15, 0.08, 6, 96), mats.strip, 0, 0.42, 0);
  padRing.rotation.x = Math.PI / 2;
  const guides = [];
  for (let k = 0; k < 7; k++) guides.push(add(box, mats.strip, 0, 0.03, PAD_R + 2 + k * 3, 0.6, 0.05, 1.2));

  // Lamp bridge over the pad, hung from the ceiling
  for (const sx of [-1, 1]) add(box, mats.trim, sx * 11, 16.5, -2, 0.15, 9, 0.15);
  add(box, mats.trim, 0, 12, -2, 25, 0.8, 0.8);
  const bridgeLamps = [-7.5, -5, -2.5, 0, 2.5, 5, 7.5].map(x => add(box, mats.lamp, x, 11.5, -2, 1.4, 0.15, 0.5));

  // Exits in the left wall, under the walkway: market, shipyard, bar
  const doors = [];
  const doorGeo = new THREE.BoxGeometry(0.2, 3.6, 1.6);
  for (const d of DOORS) {
    const g = new THREE.Group();
    g.position.set(-WALL_X, 0, d.z);
    const glow = new THREE.Color(...d.color);
    const lit = new THREE.MeshBasicMaterial({ color: glow });
    add(box, mats.trim, 0.05, 1.9, -2, 0.5, 3.8, 0.35, g);                     // frame
    add(box, mats.trim, 0.05, 1.9, 2, 0.5, 3.8, 0.35, g);
    add(box, mats.trim, 0.05, 3.95, 0, 0.5, 0.4, 4.35, g);
    add(box, lit, 0.32, 3.72, 0, 0.06, 0.08, 3.6, g);                         // light bar over the door
    const corridor = add(new THREE.PlaneGeometry(3.4, 3.6), new THREE.MeshBasicMaterial({ map: corridorTex(d.color), color: new THREE.Color(1.3, 1.3, 1.3) }), -0.12, 1.8, 0, 1, 1, 1, g);
    corridor.rotation.y = Math.PI / 2;
    const left = add(doorGeo, mats.padSide, 0, 1.8, -0.8, 1, 1, 1, g), right = add(doorGeo, mats.padSide, 0, 1.8, 0.8, 1, 1, 1, g);
    for (const p of [left, right]) add(box, lit, 0.12, 0, 0, 0.02, 3.4, 0.06, p);   // glowing seam
    // Neon sign under the walkway edge, and a light strip on the floor leading in
    const sign = add(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: signTex(d.label, d.color), transparent: true, depthWrite: false, color: new THREE.Color(1.8, 1.8, 1.8) }), 0.7, 4.45, 0, 1, 1, 1, g);
    sign.rotation.y = Math.PI / 2;
    add(box, lit, 2.6, 0.02, 0, 4.6, 0.04, 0.12, g);
    const lamp = new THREE.PointLight(glow, 25, 0, 2);
    lamp.position.set(1.5, 2.5, 0);
    g.add(lamp);
    scene.add(g);
    doors.push({ ...d, group: g, left, right, sign, open: 0 });
  }

  // Consoles with glowing screens along the walls
  const consoles = new THREE.Group();
  scene.add(consoles);

  // Crates, fuel tanks: rebuilt per theme in this group
  const props = new THREE.Group();
  scene.add(props);

  // Space behind the opening: stars, the system's planet, a force field
  const sky = new THREE.Group();
  sky.position.z = LEN / 2;
  scene.add(sky);
  const N = 900, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.4 - 0.2, 0.6 + Math.random()).normalize().multiplyScalar(1400);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, map: dotTexture(), color: 0xb8c8e0, transparent: true, depthWrite: false, fog: false })));
  const planet = new THREE.Mesh(new THREE.SphereGeometry(260, 48, 24), new THREE.MeshBasicMaterial({ map: skyPlanetTexture(), color: 0xb0b0b0, fog: false }));
  planet.position.set(-220, -140, 900);
  sky.add(planet);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(275, 48, 24), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.12, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  atmo.position.copy(planet.position);
  sky.add(atmo);
  const field = new THREE.Mesh(new THREE.CircleGeometry(R - 1, 48, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.08,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  field.position.z = LEN / 2 - 0.5;
  scene.add(field);

  // Lights: key spot on the ship, coloured fills on the walls, cool rim from the opening
  const hemi = new THREE.HemisphereLight(0x8090a0, 0x101014, 0.35);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xffffff, 320, 0, 0.6, 0.7, 2);
  key.position.set(0, 18, -3);
  key.target.position.set(0, 0, 0);
  scene.add(key, key.target);
  const fills = [new THREE.PointLight(0xffffff, 70, 0, 2), new THREE.PointLight(0xffffff, 70, 0, 2)];
  fills[0].position.set(-14, 7, -10); fills[1].position.set(14, 7, 8);
  scene.add(...fills);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.6);
  rim.position.set(0, 4, 20);
  scene.add(rim);

  // Floating dust in the light
  const D = 500, dpos = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) dpos.set([(Math.random() - 0.5) * 30, Math.random() * 14, (Math.random() - 0.5) * 34], i * 3);
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.07, map: dotTexture(), color: 0xfff2d8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);


  // Warning beacons on the opening frame
  const beacons = [];
  for (const a of [0.12, 0.88, 0.5]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(2.2, 0.9, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    sp.position.set(Math.cos(a * Math.PI) * (R - 1), Math.sin(a * Math.PI) * (R - 1), LEN / 2 - 1);
    sp.scale.setScalar(1.6);
    scene.add(sp);
    beacons.push(sp);
  }

  H = { scene, camera, mats, box, cyl, add, doors, bridgeLamps, consoles, props, key, fills, hemi, rim, strips, padRing, guides, field, dust, beacons,
    planet, atmo, ship: null, shipKey: null, t: 0, look: new THREE.Vector3(), wantLook: new THREE.Vector3(), wantPos: new THREE.Vector3(), zoom: 1, snap: true };
}

/* ---------- Per station: theme, props, ship ---------- */
function dress(def) {
  const th = THEMES[def.econ] || THEMES.hightech, { mats, add, box, cyl, props, consoles } = H;
  const r = rng(hashStr(def.name + def.econ)), look = stationLook(def);
  // Accent hue drifts up to ±40° from the economy colour, so stations of one kind differ
  const accent = new THREE.Color(...th.accent);
  accent.offsetHSL((r() - 0.5) * 0.22, 0, 0);
  mats.strip.color.copy(accent);
  H.key.color.set(th.key).lerp(new THREE.Color(r() < 0.5 ? 0xffd8b0 : 0xd8e8ff), r() * 0.5);
  H.key.intensity = 260 + r() * 140;
  H.fills.forEach(f => f.color.copy(accent).multiplyScalar(0.45));
  H.hemi.color.set(th.fill);
  H.scene.fog.color.set(th.fog);
  H.scene.fog.near = 25 + r() * 25;                    // some bays hazier than others
  // Walls take the station's hull paint and window light; trim its accent colour, darkened
  for (const w of [mats.wall, mats.backWall]) { w.color.setHex(look.paint); w.color.multiply(w.color); w.emissive.setHex(look.window); }
  mats.trim.color.setHex(look.trim).lerp(new THREE.Color(0x272c33), 0.6);
  const lamps = 3 + Math.floor(r() * 5);
  H.bridgeLamps.forEach((l, i) => { l.visible = Math.abs(i - 3) <= (lamps - 1) / 2; });
  // The planet outside sits somewhere else for every station
  const pa = (r() - 0.5) * 1.4, pd = 760 + r() * 400;
  H.planet.position.set(Math.sin(pa) * pd, -220 + r() * 260, Math.cos(pa) * pd);
  H.planet.scale.setScalar(0.6 + r() * 0.8);
  H.atmo.position.copy(H.planet.position);
  H.atmo.scale.copy(H.planet.scale);
  H.atmo.material.color.setHSL(((G.system.planet.hue + 20) % 360) / 360, 0.8, 0.6);
  H.planet.material.map = skyPlanetTexture();

  for (const grp of [props, consoles]) {
    for (const o of [...grp.children]) { grp.remove(o); }
  }
  // The left wall holds the three exits; props stay on the right and at the back
  const scr = new THREE.MeshBasicMaterial({ map: screenTex(th.accent), color: new THREE.Color(1.6, 1.6, 1.6) });
  for (const [x, z, ry] of [[11, -13, -0.5], [-8, -24, 0.2]]) {
    const g = new THREE.Group();
    add(box, mats.dark, 0, 0.6, 0, 2.6, 1.2, 1.2, g);
    const s = add(new THREE.PlaneGeometry(2.4, 1.2), scr, 0, 1.9, -0.2, 1, 1, 1, g);
    s.rotation.x = -0.3;
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    consoles.add(g);
  }
  // Stacked containers at the back and along the right wall
  const crates = th.crates || 7;
  for (let i = 0; i < crates; i++) {
    const back = i < 6, stack = 1 + Math.floor(r() * 2);
    const x = back ? -14 + i * 5.6 : 15.5 + r(), z = back ? -27 - r() : -26 + (i - 6) * 6.2;
    for (let k = 0; k < stack; k++) {
      const c = add(box, mats.containers[Math.floor(r() * mats.containers.length)], x, 1.25 + k * 2.5, z, 2.6, 2.4, 5.6, props);
      if (back) c.rotation.y = Math.PI / 2;
    }
  }
  for (const z of [-19, -15]) {
    add(cyl, mats.padSide, 13.5, 3, z, 1.8, 6, 1.8, props);
    add(cyl, mats.strip, 13.5, 5.2, z, 1.85, 0.12, 1.85, props);
  }
  if (th.grow) {                    // planters under pink grow lights
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: 0.8 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.6, 1.8) });
    for (const z of [2, 8, 14, 20]) {
      add(box, mats.dark, 15, 0.6, z, 3, 1.2, 4.6, props);
      for (let k = 0; k < 5; k++) add(new THREE.SphereGeometry(0.7, 10, 8), leaf, 15 + (r() - 0.5) * 2, 1.5, z + (k - 2) * 0.9, 1, 0.8 + r() * 0.6, 1, props);
      add(box, glow, 15, 4.2, z, 2.4, 0.12, 4, props);
    }
  }
  if (th.ore) {                     // ore heaps and a drill head
    const ore = new THREE.MeshStandardMaterial({ color: 0x6e4e3a, roughness: 0.9, flatShading: true });
    for (const [x, z, sc] of [[14, 4, 2.4], [15, 11, 1.8], [13.5, 17, 2.1]]) add(new THREE.DodecahedronGeometry(1, 0), ore, x, sc * 0.5, z, sc, sc * 0.7, sc, props);
    const drill = add(new THREE.ConeGeometry(1.4, 4, 12), mats.trim, 15, 2, -6, 1, 1, 1, props);
    drill.rotation.z = -Math.PI / 2;
  }
  if (th.holo) {                    // holographic ring display
    const holo = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.8), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let k = 0; k < 3; k++) {
      const ring = add(new THREE.TorusGeometry(1.6 + k * 0.5, 0.03, 6, 48), holo, 13, 3 + k * 0.2, 6, 1, 1, 1, props);
      ring.rotation.x = Math.PI / 2 + k * 0.3;
      ring.userData.spin = 0.3 + k * 0.25;
    }
    add(cyl, mats.dark, 13, 0.4, 6, 1.2, 0.8, 1.2, props);
  }

  // Now and then a hauler is parked by the opening
  if (r() < 0.55) {
    const hauler = haulerModel();
    hauler.scale.setScalar(0.62);
    hauler.position.set(-8 + r() * 2, 1.4, 21);
    hauler.rotation.y = Math.PI * (0.38 + r() * 0.2);
    props.add(hauler);
  }
  // Hazard stripes painted across the floor in some bays
  if (r() < 0.5) {
    const paint = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.35) });
    for (const z of [-PAD_R - 2.5, 26]) for (let k = -7; k <= 7; k++) {
      const s = add(box, paint, k * 2.4, 0.02, z, 1, 0.02, 0.5, props);
      s.rotation.y = 0.6;
    }
  }

  placeShip();
}

// The player's ship, engines idling low, on three landing struts. Bigger ships are
// scaled down a little so every ship fits the pad; the struts follow the hull size.
function placeShip() {
  const model = shipDef(G.profile).model, key = model + addonKey(G.profile.upgrades) + ':' + wearStep(G.profile);
  if (H.ship && H.shipKey === key) return;
  if (H.ship) H.scene.remove(H.ship);
  const { mats, add } = H;
  const ship = cloneModel(model) || buildFallbackShip('player');
  ship.traverse(o => {
    if (o.isMesh && o.material && o.material.name === 'EngineGlow') {
      o.material = o.material.clone();
      o.material.color && o.material.color.multiplyScalar(0.35);
      if (o.material.emissive) o.material.emissiveIntensity = 0.25;
    }
  });
  const box3 = new THREE.Box3().setFromObject(ship), size = box3.getSize(new THREE.Vector3());
  applyHullMarks(ship, wearOf(G.profile));          // damage from the last flight, until the yard repairs it
  H.fx?.dispose();
  H.fx = damageFx(ship);                             // sparks from the holes, smoke when it is bad
  applyAddons(ship, model, G.profile.upgrades);      // after measuring, so add-ons do not lift the ship
  const k = Math.min(1, 11 / Math.max(size.x, size.z));
  ship.scale.setScalar(k);
  const floor = 0.44, gearH = 1.5, belly = floor + gearH;
  ship.position.y = belly - box3.min.y * k;
  const holder = new THREE.Group();
  holder.add(ship);
  const gear = new THREE.Group();
  const w = size.x * k * 0.16, zf = box3.min.z * k * 0.55, zb = box3.max.z * k * 0.4;
  for (const [x, z] of [[0, zf], [-w, zb], [w, zb]]) {
    add(H.cyl, mats.trim, x, floor + gearH / 2 + 0.06, z, 0.12 * Math.max(1, 1 / k), gearH + 0.12, 0.12 * Math.max(1, 1 / k), gear);
    add(H.cyl, mats.dark, x, floor + 0.06, z, 0.35, 0.12, 0.35, gear);
  }
  holder.add(gear);
  holder.rotation.y = Math.PI * 0.22;        // three-quarter view, nose towards the camera side
  H.scene.add(holder);
  H.ship = holder;
  H.shipKey = key;
}

// After buying a ship or an upgrade while docked
export function refreshHangarShip() { if (H) placeShip(); }

/* ---------- Public ---------- */
export function enterHangar(def) {
  if (!H) { build(); bindOrbit(G.renderer.domElement); }
  dress(def);
  H.t = 0;
  frameT = 0;
  focus = null;
  H.snap = true;
  H.doors.forEach(d => { d.open = 0; });
  active = true;
  resizeHangar();
}
export function exitHangar() { active = false; }
// Fly to an exit ('market', 'jobs'), to the ship for the shipyard ('yard'), or back to the overview (null)
export function focusHangar(key) {
  hubOrbit = false;   // back in the overview: the slow drift until the player grabs the ship again
  if (key === 'yard' && focus !== 'yard') Object.assign(orbit, { yaw: -0.9, pitch: 0.32, dist: innerWidth < innerHeight ? 21 : 14, idle: 0 });
  focus = key;
  frameT = 0;
}

/* ---------- Touch and mouse orbit for the shipyard view and the hangar overview ---------- */
// In the overview the camera drifts until the player drags or zooms; from then on it orbits
// the ship like in the shipyard (Björn's wish), starting from where the camera is.
const orbit = { yaw: -0.9, pitch: 0.32, dist: 14, idle: 0 };
const pointers = new Map();
let pinch = 0, hubOrbit = false;
const maxDist = () => focus ? 26 : 34;
function grabHub() {
  if (focus || hubOrbit || !H) return;
  const rel = H.camera.position.clone().sub(new THREE.Vector3(0, 1.9, 0)), d = rel.length();
  Object.assign(orbit, { yaw: Math.atan2(rel.x, rel.z), pitch: Math.min(1.25, Math.max(0.04, Math.asin(rel.y / d))), dist: Math.min(maxDist(), d), idle: 0 });
  hubOrbit = true;
}
function bindOrbit(canvas) {
  const on = () => active && (focus === 'yard' || !focus);
  canvas.addEventListener('pointerdown', e => {
    if (!on()) return;
    grabHub();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId);
    orbit.idle = 0;
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p || !on()) return;
    if (pointers.size === 1) {
      orbit.yaw -= (e.clientX - p.x) * 0.008;
      orbit.pitch = Math.min(1.25, Math.max(0.04, orbit.pitch + (e.clientY - p.y) * 0.006));
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) orbit.dist = Math.min(maxDist(), Math.max(8, orbit.dist * pinch / d));
      pinch = d;
    }
    orbit.idle = 0;
  });
  const up = e => { pointers.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => {
    if (!on()) return;
    e.preventDefault();
    grabHub();
    orbit.dist = Math.min(maxDist(), Math.max(8, orbit.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    orbit.idle = 0;
  }, { passive: false });
}
export const hangarView = () => (active && H ? H : null);

export function resizeHangar() {
  if (!H) return;
  H.camera.aspect = innerWidth / innerHeight;
  // updateHangar renders the centre quarter of a twice as large view and widens the field of view to match
  H.baseFov = innerWidth < innerHeight ? 78 : 55;
}

// Where the ship should appear on screen: in the free space left of the
// station panel, or above it on portrait phones. Measured from the panel itself.
let frame = { fx: 0.5, fy: 0.5, dist: 20 }, frameT = 0;
function framing(dt) {
  if ((frameT -= dt) > 0) return frame;
  frameT = 0.4;
  const w = innerWidth, h = innerHeight, el = document.querySelector('#station:not([hidden]) .panel');
  const r = el && el.getBoundingClientRect();
  const left = r ? r.left : 0, top = r ? r.top : 0;
  if (left / w > 0.22 && left / w >= top / h) frame = { fx: left / 2 / w, fy: 0.5, dist: 19 * Math.min(1.6, Math.max(1, 0.5 / (left / w))) };
  else if (top / h > 0.2) frame = { fx: 0.5, fy: top / 2 / h, dist: w < h ? 22 : 20 };
  else frame = { fx: 0.5, fy: 0.5, dist: 20 };
  return frame;
}

const tmpV = new THREE.Vector3();
export function updateHangar(dt) {
  if (!active) return;
  H.fx?.update(dt);
  const t = (H.t += dt), cam = H.camera;
  const f = framing(dt);
  // Camera target: overview from across the bay (ship in front, exits behind it),
  // or close in front of the chosen exit
  const door = focus && focus !== 'yard' && H.doors.find(d => d.key === focus);
  if (focus === 'yard' || (!focus && hubOrbit)) {
    // Shipyard (and the overview once grabbed): orbit the ship by dragging, pinch or wheel to zoom; it only moves when the player moves it
    orbit.idle += dt;
    H.wantLook.set(0, 1.9, 0);
    const cp = Math.cos(orbit.pitch);
    H.wantPos.set(Math.sin(orbit.yaw) * cp * orbit.dist, 1.9 + Math.sin(orbit.pitch) * orbit.dist, Math.cos(orbit.yaw) * cp * orbit.dist);
  } else if (door) {
    H.wantLook.set(-WALL_X, 2.1, door.z);
    H.wantPos.set(-9, 3, door.z - 0.8);
  } else {
    const a = Math.atan2(22, -7) + 0.12 * Math.sin(t * 0.06), d = 23;
    H.wantLook.set(-7, 2.6, -1);
    H.wantPos.set(-7 + Math.sin(a) * d, 2.6 + 3.9 + Math.sin(t * 0.07) * 0.8, -1 + Math.cos(a) * d);
  }
  const k = H.snap ? 1 : 1 - Math.exp(-dt * ((focus === 'yard' || hubOrbit) && orbit.idle < 0.6 ? 9 : 2.2));
  H.snap = false;
  cam.position.lerp(H.wantPos, k);
  H.look.lerp(H.wantLook, k);
  cam.lookAt(H.look);
  // Off-centre projection: the view sits where the panel leaves room
  const w = innerWidth, h = innerHeight;
  cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(2 * Math.tan(THREE.MathUtils.degToRad(H.baseFov / 2)) * (focus ? 1 : H.zoom)));
  cam.setViewOffset(2 * w, 2 * h, w * (1 - f.fx), h * (1 - f.fy), w, h);
  cam.updateMatrixWorld();

  // Doors slide open for the chosen exit; the overview widens until all signs are in view
  let worst = 0;
  for (const d of H.doors) {
    tmpV.set(-WALL_X + 0.7, 4.45, d.z).project(cam);
    worst = Math.max(worst, Math.abs(tmpV.x), tmpV.z < 1 ? 0 : 2);
    d.open += ((focus === d.key ? 1 : 0) - d.open) * (1 - Math.exp(-dt * 4));
    d.left.position.z = -0.8 - d.open * 1.55;
    d.right.position.z = 0.8 + d.open * 1.55;
  }
  if (!focus && hubOrbit) H.zoom = Math.max(1, H.zoom - dt * 0.5);
  else if (!focus) {
    if (worst > 0.8) H.zoom = Math.min(1.8, H.zoom + dt * 0.9);
    else if (worst < 0.55) H.zoom = Math.max(1, H.zoom - dt * 0.25);
  }

  // Life in the bay
  H.beacons.forEach((b, i) => { b.material.opacity = Math.sin(t * 3 + i * 2) > 0.4 ? 1 : 0.15; });
  H.field.material.opacity = 0.06 + Math.sin(t * 1.7) * 0.02 + Math.sin(t * 5.3) * 0.01;
  const lit = Math.floor(t * 6) % 10;
  H.guides.forEach((g, k) => { g.visible = (H.guides.length - 1 - k) !== lit; });
  const p = H.dust.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i) + dt * 0.12 * (0.3 + (i % 7) / 7);
    if (y > 14) y = 0;
    p.setY(i, y);
    p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.05);
  }
  p.needsUpdate = true;
  for (const o of H.props.children) if (o.userData.spin) o.rotation.z += o.userData.spin * dt;
  H.planet.rotation.y += dt * 0.004;
}
