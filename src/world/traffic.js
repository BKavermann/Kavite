// Civilian haulers that leave and enter the stations near the player.
// No collisions with the player, but they can be shot: that is a crime (game/law.js),
// a destroyed hauler spills its cargo.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { STATION_SIZE } from './station.js';
import { lookQuat } from '../utils.js';
import { hullTextures } from '../core/hull-texture.js';
import { LAW } from '../config.js';
import { commitCrime } from '../game/law.js';
import { emit } from './particles.js';
import { spawnPickup } from './pickups.js';
import { sfxBoom } from '../core/audio.js';
import { hitMarker } from '../ui/hud.js';
import { segDist2, pick } from '../utils.js';

let template = null;
const dir = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3();

function makeTemplate() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x8c939b, metalness: 0.5, roughness: 0.5, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.6, roughness: 0.55, flatShading: true });
  const cab = new THREE.MeshStandardMaterial({ color: 0xd4d8dc, metalness: 0.3, roughness: 0.4, flatShading: true });
  const pod = new THREE.MeshStandardMaterial({ color: 0xb0662f, metalness: 0.3, roughness: 0.6, flatShading: true });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, metalness: 0.2, roughness: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.5), side: THREE.DoubleSide });
  const win = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.3, 0.9) });
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.2, 0.1) });
  const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.2, 0.5) });
  // Panel texture, repeated a few times across each (stretched) box face
  const t = hullTextures(), map = t.map.clone(), bump = t.bump.clone();
  map.repeat.set(2, 2); bump.repeat.set(2, 2);
  for (const m of [hull, cab, pod, dark]) Object.assign(m, { map, bumpMap: bump, bumpScale: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2);
  const bell = new THREE.CylinderGeometry(0.75, 1, 1, 10, 1, true).rotateX(Math.PI / 2);
  const add = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  add(box, hull, 0, 0, 0, 1.4, 1.4, 14);                      // spine
  for (const z of [-5, -0.75, 3.5]) add(box, dark, 0, 0, z, 1.8, 1.8, 0.5);   // spine ribs
  add(box, cab, 0, 0.3, -7.5, 3.2, 2.2, 3);                   // cab
  add(box, cab, 0, 1.6, -7.2, 2.2, 0.6, 1.8);                 // bridge deck
  add(box, win, 0, 0.75, -9.02, 2.6, 0.35, 0.05);             // bridge windows
  add(box, win, 0, 1.7, -8.12, 1.8, 0.22, 0.05);
  add(box, dark, 0.7, 2.4, -6.8, 0.08, 1.2, 0.08);            // antenna
  add(cyl, dark, -0.7, 2.05, -6.8, 0.35, 0.35, 0.2);          // dish base
  for (const z of [-3, 1.5]) for (const sd of [-1, 1]) {
    add(box, pod, sd * 1.9, 0, z, 2.4, 2.4, 4);               // cargo pods
    add(box, stripe, sd * 1.9, 0, z - 1.2, 2.48, 2.48, 0.35);  // pod bands
    add(box, dark, sd * 3.12, 0, z, 0.06, 1.6, 3.2);          // side hatches
  }
  add(box, hull, 0, 0, 7.4, 3.4, 1.6, 1);                     // engine block
  for (const sd of [-1, 1]) {
    add(box, dark, sd * 2.2, 0, 6.6, 0.1, 2.6, 1.6);          // radiators
    add(bell, dark, sd * 0.9, 0, 8.3, 0.6, 0.6, 0.8);         // engine bells
    const e = add(new THREE.CircleGeometry(0.55, 10), glow, sd * 0.9, 0, 8.25, 1, 1, 1);
    e.rotation.y = Math.PI;
    add(box, sd < 0 ? red : green, sd * 3.2, 0, 1.5, 0.15, 0.15, 0.15);   // nav lights
  }
  return g;
}

// A parked copy for the hangar
export function haulerModel() {
  if (!template) template = makeTemplate();
  return template.clone();
}

function spawn(st, outbound) {
  if (!template) template = makeTemplate();
  const mesh = template.clone();
  G.scene.add(mesh);
  const S = STATION_SIZE;
  const side = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0);
  const t = { st, mesh, outbound, s: outbound ? S * 0.3 : S + 1400, off: side, speed: outbound ? 8 : 90, life: 60, hp: LAW.traderHp, panic: 0,
    exitDir: new THREE.Vector3().randomDirection() };
  G.traffic.push(t);
}

function remove(i) {
  G.scene.remove(G.traffic[i].mesh);
  G.traffic.splice(i, 1);
}

export function clearTraffic() { while (G.traffic.length) remove(0); }

// A shot from prev to pos: the hauler it hits (the hull is about 17 m long), or null
const fwdT = new THREE.Vector3(), pt = new THREE.Vector3();
export function trafficHit(prev, pos) {
  for (const t of G.traffic) {
    if (segDist2(t.mesh.position, prev, pos) > 12 * 12) continue;
    fwdT.set(0, 0, 1).applyQuaternion(t.mesh.quaternion);
    for (const k of [-6, -2, 2, 6]) {
      pt.copy(t.mesh.position).addScaledVector(fwdT, k);
      if (segDist2(pt, prev, pos) < 3.2 * 3.2) return t;
    }
  }
  return null;
}

export function damageTraffic(t, dmg, at) {
  t.hp -= dmg;
  emit(at, 12, 12, 0.1);
  hitMarker();
  t.panic = 1;
  if (t.hp > 0) { commitCrime(LAW.hitTrader, 'Angriff auf einen Händler'); return; }
  const i = G.traffic.indexOf(t);
  emit(t.mesh.position, 160, 40, 0.05);
  emit(t.mesh.position, 60, 26, 0.58);
  sfxBoom(24);
  for (let k = 0; k < 3; k++) spawnPickup(t.mesh.position.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(4)), new THREE.Vector3().randomDirection().multiplyScalar(4), pick(['food', 'textiles', 'machinery', 'computers', 'luxuries', 'minerals']), 1);
  commitCrime(LAW.killTrader, 'Händler zerstört');
  if (i >= 0) remove(i);
}

export function updateTraffic(dt) {
  if (G.mode === 'hyper') return;
  const ship = G.ship.position;
  for (const st of G.stations) {
    if (st.pos.distanceTo(ship) > 3000) continue;
    st.trafficT -= dt;
    if (st.trafficT <= 0 && G.traffic.length < 4) {
      st.trafficT = 14 + Math.random() * 18;
      spawn(st, Math.random() < 0.5);
    }
  }
  for (let i = G.traffic.length - 1; i >= 0; i--) {
    const t = G.traffic[i], st = t.st;
    t.life -= dt;
    dir.set(0, 0, 1).applyQuaternion(st.group.quaternion);
    up.set(0, 1, 0).applyQuaternion(st.group.quaternion);
    const S = STATION_SIZE;
    if (t.outbound) {
      t.speed = Math.min(t.panic ? 140 : 70, t.speed + (t.panic ? 40 : 14) * dt);
      t.s += t.speed * dt;
      // Out of the slot along the axis, then bend away
      const bend = Math.max(0, t.s - (S + 120)) / 600;
      tmp.copy(dir).multiplyScalar(t.s).add(st.pos);
      tmp.addScaledVector(t.exitDir, bend * bend * 400);
      const fwd = dir.clone().lerp(t.exitDir, Math.min(1, bend)).normalize();
      t.mesh.position.copy(tmp);
      lookQuat(fwd, up, t.mesh.quaternion);
      if (t.s > S + 1500 || t.life <= 0) { remove(i); continue; }
    } else {
      // Glide in along the axis, slowing down before the slot
      t.speed = Math.max(t.panic ? 60 : 10, Math.min(90, (t.s - S) * 0.25));
      t.s -= t.speed * dt;
      t.mesh.position.copy(dir).multiplyScalar(t.s).add(st.pos);
      lookQuat(tmp.copy(dir).negate(), up, t.mesh.quaternion);
      if (t.s < S * 0.2 || t.life <= 0) { remove(i); continue; }
    }
  }
}
