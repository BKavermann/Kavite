// Cargo canisters: ore from small asteroids, loot from pirates. Fly through to scoop.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { PICKUP_LIFE } from '../config.js';
import { dotTexture } from '../utils.js';
import { goodById } from '../game/economy.js';
import { capacity, cargoUsed } from '../game/save.js';
import { toast } from '../ui/hud.js';
import { sfxScoop, sfxDeny } from '../core/audio.js';

let boxGeo, boxMat, glowMat, fullT = 0;

function ensure() {
  if (boxGeo) return;
  boxGeo = new THREE.BoxGeometry(1.4, 1, 1);
  boxMat = new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.6, roughness: 0.38, emissive: 0x2a1c04 });
  glowMat = new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(1.8, 1.3, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}

export function spawnPickup(pos, vel, good, qty) {
  ensure();
  const mesh = new THREE.Mesh(boxGeo, boxMat);
  mesh.position.copy(pos);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(2.4);
  mesh.add(glow);
  G.scene.add(mesh);
  G.pickups.push({ mesh, pos: mesh.position, vel: vel.clone(), good, qty, life: PICKUP_LIFE,
    spinAxis: new THREE.Vector3().randomDirection() });
}

function remove(i) {
  G.scene.remove(G.pickups[i].mesh);
  G.pickups.splice(i, 1);
}

export function clearPickups() { while (G.pickups.length) remove(0); }

export function updatePickups(dt) {
  fullT -= dt;
  const ship = G.ship.position;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.vel.multiplyScalar(Math.exp(-0.4 * dt));
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.rotateOnAxis(p.spinAxis, dt * 1.5);
    p.life -= dt;
    if (p.life <= 0 || p.pos.distanceTo(ship) > 2000) { remove(i); continue; }
    if (G.mode !== 'flight' || p.pos.distanceTo(ship) > 5.5) continue;
    const prof = G.profile;
    if (capacity(prof) - cargoUsed(prof) >= p.qty) {
      prof.cargo[p.good] = (prof.cargo[p.good] || 0) + p.qty;
      toast(`+${p.qty} t ${goodById(p.good).name}`);
      sfxScoop();
      remove(i);
    } else if (fullT <= 0) {
      toast('Frachtraum voll');
      sfxDeny();
      fullT = 3;
    }
  }
}
