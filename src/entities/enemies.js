// Pirate fighters with a small state machine:
//   attack  – turn toward the lead point, fire bursts when lined up
//   evade   – break away after a close pass or when hit
//   retreat – the player is near a station: leave the safe zone
//   patrol  – nobody to chase (menu, docked, dead)
import * as THREE from 'three';
import { G } from '../ctx.js';
import { ENEMY, SAFE_RADIUS, LAW, RANKS } from '../config.js';
import { cloneModel, buildFallbackShip } from '../core/assets.js';
import { emit } from '../world/particles.js';
import { spawnPickup } from '../world/pickups.js';
import { nearestStation, stationHit } from '../world/station.js';
import { difficulty, rules } from '../game/difficulty.js';
import { hurtPlayer } from './player.js';
import { sfxBoom, sfxLaser } from '../core/audio.js';
import { toast, hitMarker, showBanner, comms } from '../ui/hud.js';
import { promotedInFlight } from '../ui/promotion.js';
import { onBossKilled, lootable } from '../game/missions.js';
import { storyOnKill } from '../game/story.js';
import { commitCrime, bounty } from '../game/law.js';
import { rankOf } from '../game/save.js';
import { segDist2, pick } from '../utils.js';

const boltGeo = new THREE.CylinderGeometry(0.11, 0.11, 5, 6, 1, true).rotateX(Math.PI / 2);
const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.25), fog: false });
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fwd = new THREE.Vector3();
const desired = new THREE.Vector3(), axis = new THREE.Vector3(), lead = new THREE.Vector3();
const avoid = new THREE.Vector3(), lat = new THREE.Vector3();
const rotQ = new THREE.Quaternion(), invQ = new THREE.Quaternion();

// Police paint: blue and white instead of the pirates' red and yellow
const POLICE = { Hull: 0x2b4f94, HullLight: 0x3c66b0, Trim: 0xeef3f8, Canopy: 0x0a1830, NavRed: 0x3a7bff };
// Schwarzglas cartel (story): black hulls with gold trim
export const KARTELL = { Hull: 0x17171c, HullLight: 0x2a2a31, Trim: 0xd4a520, Canopy: 0x1c1306, NavRed: 0xffb020 };

// opts: { name, hp, missionId } for bounty targets, { police: true } for police,
// { paint, story } for the cartel ships of the story
export function spawnEnemy(pos, skill = 0, opts = {}) {
  skill = Math.min(1.2, Math.max(0, skill + difficulty().skill));
  const root = new THREE.Object3D();
  const body = new THREE.Group();
  root.add(body);
  const model = cloneModel('pirate') || buildFallbackShip('pirate');
  body.add(model);
  // Own copies of the hull materials so a hit flash only lights this ship
  const flashMats = [];
  model.traverse(o => {
    if (!o.isMesh || !o.material || o.material.name === 'EngineGlow' || !o.material.emissive) return;
    o.material = o.material.clone();
    const paint = opts.paint || (opts.police && POLICE), tint = paint && paint[o.material.name];
    if (tint != null) {
      o.material.color.setHex(tint);
      if (o.material.name === 'NavRed') o.material.emissive.setHex(tint);
    }
    flashMats.push({ m: o.material, base: o.material.emissive.clone() });
  });
  root.position.copy(pos);
  root.lookAt(G.ship.position);
  root.rotateY(Math.PI);            // lookAt aims +Z; our noses point along -Z
  G.scene.add(root);
  const e = {
    root, body, flashMats, pos: root.position, vel: new THREE.Vector3(),
    hp: opts.hp ?? 3 + Math.round(skill * 2), state: 'attack', timer: 0,
    name: opts.name || null, missionId: opts.missionId || null, police: !!opts.police, story: !!opts.story,
    evadeDir: new THREE.Vector3().randomDirection(), speed: 60,
    turn: 1.05 + skill * 0.7, spread: 0.055 - skill * 0.04,
    fireCd: 1.5 + Math.random(), burst: 0, flash: 0, bank: 0,
  };
  G.enemies.push(e);
  return e;
}

export function spawnPirateGroup(count, skill, dist = 270) {
  const center = new THREE.Vector3().randomDirection().multiplyScalar(dist + Math.random() * 40).add(G.ship.position);
  for (let i = 0; i < count; i++) spawnEnemy(tmp.randomDirection().multiplyScalar(18 * i).add(center), skill);
}

export function removeEnemy(e) {
  G.scene.remove(e.root);
  e.flashMats.forEach(f => f.m.dispose());
  const i = G.enemies.indexOf(e);
  if (i >= 0) G.enemies.splice(i, 1);
}

export function clearEnemies() {
  while (G.enemies.length) removeEnemy(G.enemies[0]);
  for (const b of G.enemyBolts) G.scene.remove(b.mesh);
  G.enemyBolts.length = 0;
}

export function damageEnemy(e, dmg, at) {
  if (e.police && e.hp - dmg > 0) commitCrime(LAW.hitPolice, 'Angriff auf die Polizei');
  e.hp -= dmg;
  e.flash = 0.09;
  emit(at, 14, 14, 0.1);
  hitMarker();
  if (e.hp <= 0) destroyEnemy(e, true);
  else if (e.state === 'attack' && Math.random() < 0.45) {
    e.state = 'evade'; e.timer = 1.2 + Math.random();
    e.evadeDir.randomDirection();
  }
}

function destroyEnemy(e, byPlayer) {
  emit(e.pos, 150, 36, 0.05);
  emit(e.pos, 50, 22, 0.58);
  emit(e.pos, 30, 50, 0.12);
  sfxBoom(20);
  if (byPlayer && G.profile) {
    const p = G.profile;
    p.kills++;
    if (!e.police) addScore(e.missionId || (e.story && e.name) ? 3 : 1);   // shooting police earns a bounty, not rank
    if (e.police) commitCrime(LAW.killPolice, 'Polizist abgeschossen');
    else {
      const reward = Math.round(ENEMY.bounty * rules().bounty);
      p.credits += reward;
      if (!e.missionId) toast(`+${reward} Cr Kopfgeld`);
      if (Math.random() < 0.6) spawnPickup(e.pos, tmp.copy(e.vel).multiplyScalar(0.25), pick(lootable(['textiles', 'machinery', 'computers', 'luxuries', 'luxuries', 'weapons', 'narcotics'])), 1);
    }
  }
  if (byPlayer && e.missionId) onBossKilled(e.missionId);
  if (byPlayer && e.story) storyOnKill(e);
  removeEnemy(e);
}

// Rank points; a promotion is announced
export function addScore(n) {
  const p = G.profile, before = rankOf(p).index;
  p.score = (p.score || 0) + n;
  const r = rankOf(p);
  if (r.index > before) {
    showBanner(promotedInFlight(r), 6);
    comms('Flottenkommando', `Glückwunsch, ${r.name}! Die Beförderung wird beim nächsten Andocken feierlich vollzogen.`, 9);
  }
}

function fireEnemy(e) {
  const dir = tmp2.copy(fwd);
  dir.x += (Math.random() - 0.5) * e.spread * 2;
  dir.y += (Math.random() - 0.5) * e.spread * 2;
  dir.z += (Math.random() - 0.5) * e.spread * 2;
  dir.normalize();
  const mesh = new THREE.Mesh(boltGeo, boltMat);
  mesh.position.copy(e.pos).addScaledVector(fwd, 4.5);
  mesh.quaternion.setFromUnitVectors(Z_AXIS, dir);
  G.scene.add(mesh);
  G.enemyBolts.push({ mesh, pos: mesh.position, prev: mesh.position.clone(),
    vel: dir.clone().multiplyScalar(ENEMY.boltSpeed).add(e.vel), life: ENEMY.boltLife });
  const d = e.pos.distanceTo(G.ship.position);
  sfxLaser(800, 140, 0.07 * Math.max(0.15, 1 - d / 260), 'square');
}

export function updateEnemies(dt) {
  const playing = G.mode === 'flight';
  const ship = G.ship.position, pvel = G.player.vel;
  const playerSafe = playing && nearestStation(ship).d < SAFE_RADIUS;
  const wanted = bounty();

  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    fwd.set(0, 0, -1).applyQuaternion(e.root.quaternion);
    tmp.subVectors(ship, e.pos);
    const dist = tmp.length();
    if (dist > 2500) { removeEnemy(e); continue; }     // left far behind
    lead.copy(ship).addScaledVector(pvel, dist / ENEMY.boltSpeed);
    e.timer -= dt;

    if (!playing) e.state = 'patrol';
    else if (e.police) {
      // Police ignore the station zones, and fly home once the player is clean again
      if (wanted <= 0) { e.state = 'patrol'; if (dist > 900) { removeEnemy(e); continue; } }
      else if (e.state === 'patrol' || e.state === 'retreat') e.state = 'attack';
    }
    else if (playerSafe && e.state !== 'retreat') e.state = 'retreat';
    else if (!playerSafe && (e.state === 'retreat' || e.state === 'patrol')) e.state = 'attack';

    // Pirate tempo from the settings (Björn: slower pirates for pilots still learning to steer);
    // turning slows less than speed so they still come round to fight
    const pf = G.settings.pirateSpeed ?? 1, tf = 0.4 + 0.6 * pf;
    if (e.state === 'attack') {
      desired.subVectors(lead, e.pos).normalize();
      if (dist < 34) {
        e.state = 'evade'; e.timer = 1.6 + Math.random();
        e.evadeDir.randomDirection().addScaledVector(fwd, 1.3).normalize();
      }
      e.speed += ((dist > 120 ? 88 : 62) * pf - e.speed) * Math.min(1, dt * 1.5);
    } else if (e.state === 'evade') {
      desired.copy(e.evadeDir);
      e.speed += (95 * pf - e.speed) * Math.min(1, dt * 2);
      if (e.timer <= 0) e.state = 'attack';
    } else {
      const ns = nearestStation(e.pos);
      if (e.state === 'retreat' && ns.d < SAFE_RADIUS + 260) {
        desired.subVectors(e.pos, ns.st.pos).normalize();
        e.speed += (95 * pf - e.speed) * Math.min(1, dt * 2);
      } else {
        if (e.timer <= 0) { e.evadeDir.randomDirection(); e.timer = 3 + Math.random() * 2; }
        desired.copy(fwd).addScaledVector(e.evadeDir, 0.6).normalize();
        e.speed += (45 * pf - e.speed) * Math.min(1, dt);
      }
    }

    // Steer around asteroids and stations on the flight path
    avoid.set(0, 0, 0);
    const obstacle = (center, r, look) => {
      tmp2.subVectors(center, e.pos);
      const ahead = tmp2.dot(fwd);
      if (ahead < -r || ahead > look) return;
      lat.copy(tmp2).addScaledVector(fwd, -ahead);
      const clear = r, ll = lat.length();
      if (ll >= clear) return;
      if (ll < 0.01) lat.set(0, 1, 0).applyQuaternion(e.root.quaternion); else lat.divideScalar(ll);
      avoid.addScaledVector(lat, -(1 - ll / clear) * (1 - Math.max(0, ahead) / look) * 3.5);
    };
    for (const a of G.asteroids) obstacle(a.pos, a.r + 8, 75);
    for (const st of G.stations) obstacle(st.pos, st.radius + 14, 140);
    for (const h of G.holes) obstacle(h.pos, 420, 600);
    desired.add(avoid).normalize();

    // Turn at a limited rate and bank into the turn
    const ang = Math.acos(Math.max(-1, Math.min(1, fwd.dot(desired))));
    let bankTarget = 0;
    if (ang > 1e-4) {
      axis.crossVectors(fwd, desired);
      if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0).applyQuaternion(e.root.quaternion);
      axis.normalize();
      const step = Math.min(ang, e.turn * tf * dt);
      rotQ.setFromAxisAngle(axis, step);
      e.root.quaternion.premultiply(rotQ);
      invQ.copy(e.root.quaternion).invert();
      lat.copy(axis).applyQuaternion(invQ);
      bankTarget = lat.y * (step / (e.turn * tf * dt)) * 0.9;
    }
    e.bank += (bankTarget - e.bank) * Math.min(1, dt * 4);
    e.body.rotation.z = e.bank;

    fwd.set(0, 0, -1).applyQuaternion(e.root.quaternion);
    e.vel.copy(fwd).multiplyScalar(e.speed);
    e.pos.addScaledVector(e.vel, dt);

    // Weapons: bursts of three when the lead point is inside the gun cone
    e.fireCd -= dt;
    if (playing && e.state === 'attack' && dist < 230 && e.fireCd <= 0) {
      tmp2.subVectors(lead, e.pos).normalize();
      if (fwd.dot(tmp2) > 0.985) {
        fireEnemy(e);
        if (++e.burst >= 3) { e.burst = 0; e.fireCd = 1.1 + Math.random() * 0.9; }
        else e.fireCd = 0.18;
      }
    }

    e.flash -= dt;
    for (const f of e.flashMats) {
      if (e.flash > 0) f.m.emissive.setScalar(0.9); else f.m.emissive.copy(f.base);
    }

    // Bump off rocks and station hulls
    for (const a of G.asteroids) {
      tmp2.subVectors(e.pos, a.pos);
      const d = tmp2.length(), min = a.r * 0.9 + 3;
      if (d < min && d > 0.001) {
        e.pos.addScaledVector(tmp2.divideScalar(d), min - d);
        if (e.state === 'attack') { e.state = 'evade'; e.timer = 1; e.evadeDir.copy(tmp2); }
      }
    }
    for (const st of G.stations) {
      tmp2.subVectors(e.pos, st.pos);
      const d = tmp2.length(), min = st.radius + 4;
      if (d < min && d > 0.001) e.pos.addScaledVector(tmp2.divideScalar(d), min - d);
    }
    // Pilots keep clear of black holes; one that strays in anyway is torn apart
    if (G.holes.some(h => e.pos.distanceTo(h.pos) < h.horizon * 1.5)) { destroyEnemy(e, false); continue; }

    // Ramming the player
    if (playing && e.pos.distanceTo(ship) < 4.8) {
      G.player.knock.add(tmp.subVectors(ship, e.pos).normalize().multiplyScalar(50));
      hurtPlayer(24, true);
      destroyEnemy(e, !e.police);   // a police ship ramming you is not your kill
    }
  }

  // Enemy lasers
  for (let i = G.enemyBolts.length - 1; i >= 0; i--) {
    const b = G.enemyBolts[i];
    b.prev.copy(b.pos);
    b.pos.addScaledVector(b.vel, dt);
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && playing && segDist2(ship, b.prev, b.pos) < 2.6 * 2.6) {
      hurtPlayer(ENEMY.boltDmg * difficulty().dmg, false);
      dead = true;
    }
    if (!dead) for (const a of G.asteroids) {
      const hr = a.r * 0.95;
      if (segDist2(a.pos, b.prev, b.pos) < hr * hr) { emit(b.pos, 8, 10, 0.02); dead = true; break; }
    }
    if (!dead) for (const st of G.stations) {
      if (stationHit(st, b.pos)) { emit(b.pos, 6, 8, 0.02); dead = true; break; }
    }
    if (dead) { G.scene.remove(b.mesh); G.enemyBolts.splice(i, 1); }
  }
}
