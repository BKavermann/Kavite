import * as THREE from 'three';
import { WORLD, HALF } from './config.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = n => Math.round(n).toLocaleString('de-DE');
export const fmtDist = d => d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' m';
export const fmtLY = n => Math.max(0, n).toFixed(1).replace('.', ',') + ' LJ';

// Small seeded random generator (mulberry32): same seed, same galaxy.
export function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Stable 32-bit hash of a string (FNV-1a), used to seed per-station looks
export function hashStr(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export const pick = arr => arr[(Math.random() * arr.length) | 0];

// Move p to the copy of itself that lies closest to c in the periodic world.
export function wrapNear(p, c) {
  if (p.x - c.x > HALF) p.x -= WORLD; else if (p.x - c.x < -HALF) p.x += WORLD;
  if (p.y - c.y > HALF) p.y -= WORLD; else if (p.y - c.y < -HALF) p.y += WORLD;
  if (p.z - c.z > HALF) p.z -= WORLD; else if (p.z - c.z < -HALF) p.z += WORLD;
}

// Squared distance from point c to segment a-b (for fast projectiles).
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3();
export function segDist2(c, a, b) {
  _ab.subVectors(b, a);
  const l2 = _ab.lengthSq();
  let t = l2 > 0 ? _ac.subVectors(c, a).dot(_ab) / l2 : 0;
  t = clamp(t, 0, 1);
  return _ac.copy(a).addScaledVector(_ab, t).distanceToSquared(c);
}

export function radialTexture(stops, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let _dot = null;
export function dotTexture() {
  if (!_dot) _dot = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]);
  return _dot;
}

// Quaternion for an object whose nose (-Z) points along `forward` with `up` as its top.
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
export function lookQuat(forward, up, out) {
  _z.copy(forward).negate().normalize();
  _x.crossVectors(up, _z).normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

export const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
