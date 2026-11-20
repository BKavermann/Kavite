// Pooled additive particles for explosions and sparks.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { dotTexture } from '../utils.js';

const N = 1200;
const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
const vel = new Float32Array(N * 3), base = new Float32Array(N * 3);
const life = new Float32Array(N), max = new Float32Array(N);
let geo, cursor = 0;
const c = new THREE.Color(), d = new THREE.Vector3();

export function initParticles() {
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1.6, vertexColors: true, map: dotTexture(), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  G.scene.add(pts);
}

export function emit(p, count, speed, hue, light = 0.55) {
  for (let n = 0; n < count; n++) {
    const i = cursor;
    cursor = (cursor + 1) % N;
    d.randomDirection().multiplyScalar(speed * (0.25 + Math.random()));
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    vel[i * 3] = d.x; vel[i * 3 + 1] = d.y; vel[i * 3 + 2] = d.z;
    max[i] = life[i] = 0.5 + Math.random() * 0.9;
    c.setHSL(hue + Math.random() * 0.06, 0.9, light + Math.random() * 0.25);
    base[i * 3] = c.r * 1.8; base[i * 3 + 1] = c.g * 1.8; base[i * 3 + 2] = c.b * 1.8;
  }
}

export function shiftParticles(v) {
  for (let i = 0; i < N; i++) { pos[i * 3] += v.x; pos[i * 3 + 1] += v.y; pos[i * 3 + 2] += v.z; }
}

export function updateParticles(dt) {
  const drag = Math.exp(-1.5 * dt);
  for (let i = 0; i < N; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    const f = Math.max(0, life[i] / max[i]);
    vel[i * 3] *= drag; vel[i * 3 + 1] *= drag; vel[i * 3 + 2] *= drag;
    pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    col[i * 3] = base[i * 3] * f; col[i * 3 + 1] = base[i * 3 + 1] * f * f; col[i * 3 + 2] = base[i * 3 + 2] * f * f;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
}
