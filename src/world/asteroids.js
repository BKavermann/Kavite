import * as THREE from 'three';
import { G } from '../ctx.js';
import { TIERS, WORLD } from '../config.js';
import { wrapNear } from '../utils.js';
import { emit } from './particles.js';
import { spawnPickup } from './pickups.js';
import { sfxBoom } from '../core/audio.js';
import { hitMarker } from '../ui/hud.js';

const geos = [];
const hues = [0x7d756a, 0x8b7f70, 0x6c6966, 0x86745f, 0x75706b];
const v = new THREE.Vector3(), v2 = new THREE.Vector3();

export function initAsteroids() {
  for (let k = 0; k < 7; k++) {
    const g = new THREE.IcosahedronGeometry(1, k % 2 ? 1 : 2);
    const p = g.attributes.position, jitter = new Map();
    const sx = 0.8 + Math.random() * 0.45, sy = 0.7 + Math.random() * 0.35, sz = 0.85 + Math.random() * 0.4;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const key = v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3);
      if (!jitter.has(key)) jitter.set(key, 1 + (Math.random() - 0.5) * 0.42);
      v.multiplyScalar(jitter.get(key));
      p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
    }
    g.computeVertexNormals();
    geos.push(g);
  }
}

export function spawnAsteroid(tier, pos, baseVel) {
  const mat = new THREE.MeshStandardMaterial({ color: hues[(Math.random() * hues.length) | 0], roughness: 0.95, metalness: 0.04, flatShading: true });
  mat.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
  const mesh = new THREE.Mesh(geos[(Math.random() * geos.length) | 0], mat);
  const r = TIERS[tier].r;
  mesh.scale.setScalar(r);
  mesh.position.copy(pos);
  mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  G.scene.add(mesh);
  const speed = [5, 11, 18][tier] * (0.5 + Math.random());
  const vel = new THREE.Vector3().randomDirection().multiplyScalar(speed);
  if (baseVel) vel.addScaledVector(baseVel, 0.6);
  const a = { mesh, pos: mesh.position, vel, tier, r,
    spinAxis: new THREE.Vector3().randomDirection(), spin: (Math.random() - 0.5) * (3.2 / (tier + 1)) };
  G.asteroids.push(a);
  return a;
}

export function removeAsteroid(a) {
  G.scene.remove(a.mesh);
  a.mesh.material.dispose();
  const i = G.asteroids.indexOf(a);
  if (i >= 0) G.asteroids.splice(i, 1);
}

// Splits the rock. Small rocks shot by the player may drop an ore canister.
export function breakAsteroid(a, byPlayer) {
  const { tier, r } = a;
  const p = a.pos.clone(), vel = a.vel.clone();
  emit(p, [80, 45, 24][tier], [32, 24, 18][tier], 0.06);
  emit(p, [30, 16, 8][tier], [14, 10, 8][tier], 0.55);
  sfxBoom(r);
  removeAsteroid(a);
  if (byPlayer) hitMarker();
  if (tier < 2) {
    for (let i = 0; i < 2; i++) spawnAsteroid(tier + 1, v2.randomDirection().multiplyScalar(TIERS[tier + 1].r).add(p), vel);
  }
  const dropChance = tier === 2 ? 0.5 : tier === 1 ? 0.12 : 0;
  if (byPlayer && Math.random() < dropChance) spawnPickup(p, vel.multiplyScalar(0.3), 'minerals', 1);
}

export function updateAsteroids(dt) {
  const center = G.ship.position;
  const corona = G.star && center.distanceTo(G.star.pos) < G.star.R * 2.2;   // no rocks near a sun
  for (let i = G.asteroids.length - 1; i >= 0; i--) {
    const a = G.asteroids[i];
    a.pos.addScaledVector(a.vel, dt);
    a.mesh.rotateOnAxis(a.spinAxis, a.spin * dt);
    if (corona && a.pos.distanceToSquared(center) > 320 * 320) { removeAsteroid(a); continue; }
    wrapNear(a.pos, center);
    // Keep rocks off the stations
    for (const st of G.stations) {
      v.subVectors(a.pos, st.pos);
      const d = v.length(), min = st.radius * 1.35 + a.r;
      if (d < min) {
        v.divideScalar(d || 1);
        a.pos.copy(st.pos).addScaledVector(v, min);
        const vn = a.vel.dot(v);
        if (vn < 0) a.vel.addScaledVector(v, -2 * vn);
      }
    }
    for (const h of G.holes) {
      v.subVectors(a.pos, h.pos);
      const d = v.length();
      if (d < 500) a.pos.copy(h.pos).addScaledVector(v.divideScalar(d || 1), 500);
    }
  }
}

export function clearAsteroids() {
  while (G.asteroids.length) removeAsteroid(G.asteroids[0]);
}

export const asteroidWeight = () => G.asteroids.reduce((s, a) => s + [1, 0.4, 0.15][a.tier], 0);

export function populateAsteroids(n) {
  let placed = 0, tries = 0;
  while (placed < n && tries++ < n * 20) {
    v.set((Math.random() - 0.5) * WORLD, (Math.random() - 0.5) * WORLD, (Math.random() - 0.5) * WORLD).add(G.ship.position);
    if (v.distanceTo(G.ship.position) < 90) continue;
    if (G.stations.some(st => v.distanceTo(st.pos) < st.radius * 2.5)) continue;
    if (G.holes.some(h => v.distanceTo(h.pos) < 600)) continue;
    spawnAsteroid(0, v);
    placed++;
  }
}
