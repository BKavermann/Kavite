// Railgun and missiles. The laser lives in player.js; both of these use their
// own ammunition from the profile (slugs, missiles).
import * as THREE from 'three';
import { G } from '../ctx.js';
import { RAIL, MISSILE, ENEMY, LAW } from '../config.js';
import { breakAsteroid } from '../world/asteroids.js';
import { emit } from '../world/particles.js';
import { damageEnemy } from './enemies.js';
import { stationHit } from '../world/station.js';
import { trafficHit, damageTraffic } from '../world/traffic.js';
import { commitCrime } from '../game/law.js';
import { lockValid } from '../game/targeting.js';
import { sfxRail, sfxMissile, sfxBoom, sfxDeny } from '../core/audio.js';
import { toast } from '../ui/hud.js';
import { segDist2, dotTexture } from '../utils.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3(), tmp3 = new THREE.Vector3();
let warnT = 0;

const deny = msg => { if (warnT <= 0) { toast(msg); sfxDeny(); warnT = 2; } };
export function tickWeapons(dt) { warnT -= dt; }

/* ---------- Railgun: a solid slug, magnetically accelerated, flies ballistic ---------- */
let slugGeo = null, slugMat = null, streakGeo = null, glowMat = null;
function slugMesh() {
  if (!slugGeo) {
    slugGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.1, 8).rotateX(Math.PI / 2);
    slugMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.2), fog: false });
    glowMat = new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(1.4, 1.2, 1.0), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
    streakGeo = new THREE.CylinderGeometry(0.05, 0.28, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(slugGeo, slugMat));
  // Short glowing wake of the hot slug, stretched with its speed
  const streak = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.9, 1.6), transparent: true, opacity: 0.55,
    fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  streak.scale.set(1, 1, 0.01);                      // grows as the slug leaves the muzzle
  g.add(streak);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(2.2);
  g.add(glow);
  return g;
}

// One slug per call; player.js keeps calling while fire is held (RAIL.interval)
let side = 1;
export function fireRail() {
  const p = G.profile, P = G.player, ship = G.ship;
  if (p.slugs <= 0) { deny('Keine Railgun-Munition – in der Werft kaufen'); return false; }
  p.slugs--;
  side = -side;                                       // alternate between two rails under the nose
  const mesh = slugMesh();
  mesh.position.set(side * 0.6, -0.5, -4.6).applyQuaternion(ship.quaternion).add(ship.position);
  mesh.quaternion.copy(ship.quaternion);
  G.scene.add(mesh);
  G.beams.push({ mesh, pos: mesh.position, prev: mesh.position.clone(), life: RAIL.life, dist: 0,
    vel: P.fwd.clone().multiplyScalar(RAIL.speed).add(P.vel) });   // slugs keep the ship's own motion
  P.knock.addScaledVector(P.fwd, -0.8);               // recoil
  sfxRail();
  if (p.slugs === 50) toast('Railgun-Munition knapp');
  return true;
}

function slugHit(b, i, at) {
  emit(at, 24, 22, 0.55, 0.7);
  G.scene.remove(b.mesh);
  b.mesh.children[1].material.dispose();
  G.beams.splice(i, 1);
}

export function updateBeams(dt) {
  const r2 = (ENEMY.hitRadius + 2.5) ** 2;          // slugs are tiny, but the pirate's wings count
  for (let i = G.beams.length - 1; i >= 0; i--) {
    const b = G.beams[i];
    b.prev.copy(b.pos);
    b.pos.addScaledVector(b.vel, dt);
    b.life -= dt;
    // Test the path flown this frame, nearest hit first
    let best = Infinity, hit = null;
    const along = pos => tmp.subVectors(pos, b.prev).dot(tmp2.copy(b.vel).normalize());
    const step = b.vel.length() * dt;
    for (const e of G.enemies) {
      const t = along(e.pos);
      if (t > -2 && t < best && t < step + 2 && segDist2(e.pos, b.prev, b.pos) < r2) { best = t; hit = { e }; }
    }
    for (const a of G.asteroids) {
      const t = along(a.pos) - a.r;
      if (t < best && t < step && segDist2(a.pos, b.prev, b.pos) < a.r * a.r) { best = t; hit = { a }; }
    }
    for (const st of G.stations) {
      if (segDist2(st.pos, b.prev, b.pos) > st.radius * st.radius) continue;
      for (let k = 1; k <= 6; k++) {                 // walk the path; hulls are not round any more
        tmp3.lerpVectors(b.prev, b.pos, k / 6);
        if (stationHit(st, tmp3)) { const t = step * (k - 1) / 6; if (t < best) { best = t; hit = { st }; } break; }
      }
    }
    if (!hit) { const t = trafficHit(b.prev, b.pos); if (t) { damageTraffic(t, RAIL.dmg, b.pos); slugHit(b, i, b.pos); continue; } }
    if (hit) {
      to.copy(b.vel).normalize().multiplyScalar(Math.max(0, Math.min(step, best))).add(b.prev);
      if (hit.e) damageEnemy(hit.e, RAIL.dmg, to);
      else if (hit.a) breakAsteroid(hit.a, true);
      else if (hit.st) commitCrime(LAW.hitStation, 'Beschuss einer Station');
      slugHit(b, i, to);
      continue;
    }
    if (b.life <= 0) { G.scene.remove(b.mesh); b.mesh.children[1].material.dispose(); G.beams.splice(i, 1); continue; }
    b.dist += step;
    b.mesh.children[1].scale.z = Math.min(18, b.dist);
    if (b.life < 0.15) b.mesh.children[1].material.opacity = 0.55 * b.life / 0.15;
  }
}

/* ---------- Missiles: home in on the locked pirate ---------- */
let missileGeo = null, missileMat = null;
function missileMesh() {
  if (!missileGeo) {
    missileGeo = new THREE.ConeGeometry(0.35, 2.4, 8).rotateX(-Math.PI / 2);
    missileMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.2, 0.4), fog: false });
  }
  return new THREE.Mesh(missileGeo, missileMat);
}

export function fireMissile() {
  const p = G.profile, P = G.player, ship = G.ship;
  if (p.missiles <= 0) { deny('Keine Raketen – in der Werft kaufen'); return false; }
  if (!lockValid() || G.lock.kind !== 'enemy') { deny('Erst einen Piraten antippen'); return false; }
  p.missiles--;
  const mesh = missileMesh();
  mesh.position.set(G.missiles.length % 2 ? 1.6 : -1.6, -0.9, -1.5).applyQuaternion(ship.quaternion).add(ship.position);
  G.scene.add(mesh);
  G.missiles.push({ mesh, pos: mesh.position, prev: mesh.position.clone(), target: G.lock.obj,
    vel: P.fwd.clone().multiplyScalar(MISSILE.speed + Math.max(0, P.speed)), life: MISSILE.life, trailT: 0 });
  sfxMissile();
  return true;
}

function explode(m, i) {
  emit(m.pos, 60, 26, 0.07);
  sfxBoom(6);
  G.scene.remove(m.mesh);
  G.missiles.splice(i, 1);
}

export function updateMissiles(dt) {
  for (let i = G.missiles.length - 1; i >= 0; i--) {
    const m = G.missiles[i], e = m.target;
    m.prev.copy(m.pos);
    m.life -= dt;
    const alive = G.enemies.includes(e);
    const speed = Math.min(MISSILE.maxSpeed, m.vel.length() + MISSILE.accel * dt);
    if (alive) {
      // Lead the target a little and turn toward it at a limited rate
      const d = m.pos.distanceTo(e.pos);
      tmp.copy(e.vel).multiplyScalar(Math.min(1.5, d / speed)).add(e.pos).sub(m.pos).normalize();
      tmp2.copy(m.vel).normalize();
      const ang = tmp2.angleTo(tmp), maxA = MISSILE.turn * dt;
      if (ang > 1e-4) tmp2.lerp(tmp, Math.min(1, maxA / ang)).normalize();
      m.vel.copy(tmp2).multiplyScalar(speed);
    } else m.vel.setLength(speed);
    m.pos.addScaledVector(m.vel, dt);
    m.mesh.quaternion.setFromUnitVectors(tmp.set(0, 0, -1), tmp2.copy(m.vel).normalize());
    if ((m.trailT -= dt) <= 0) { m.trailT = 0.03; emit(m.pos, 2, 3, 0.08, 0.6); }
    if (alive && segDist2(e.pos, m.prev, m.pos) < (ENEMY.hitRadius + 1.5) ** 2) { damageEnemy(e, MISSILE.dmg, m.pos); explode(m, i); continue; }
    const rock = G.asteroids.find(a => segDist2(a.pos, m.prev, m.pos) < a.r * a.r);
    if (rock) { breakAsteroid(rock, true); explode(m, i); continue; }
    if (m.life <= 0 || G.stations.some(st => stationHit(st, m.pos))) explode(m, i);
  }
}

export function clearWeapons() {
  for (const m of G.missiles) G.scene.remove(m.mesh);
  for (const b of G.beams) { G.scene.remove(b.mesh); b.mesh.children[1].material.dispose(); }
  G.missiles.length = 0;
  G.beams.length = 0;
}

// Floating origin shift
export function shiftWeapons(d) {
  for (const m of G.missiles) { m.pos.sub(d); m.prev.sub(d); }
  for (const b of G.beams) { b.pos.sub(d); b.prev.sub(d); }
}

/* ---------- Weapon selection ---------- */
export const WEAPON_NAME = { laser: 'Laser', rail: 'Railgun', missile: 'Raketen', rear: 'Hecklaser' };
export const ownedWeapons = p => ['laser', ...(p.upgrades.rail ? ['rail'] : []), ...(p.upgrades.missile ? ['missile'] : [])];   // the rear laser fires in the rear view

export function cycleWeapon() {
  const p = G.profile;
  if (!p || G.mode !== 'flight') return;
  const list = ownedWeapons(p);
  if (list.length < 2) { toast('Railgun und Raketen gibt es in der Werft'); return; }
  p.weapon = list[(list.indexOf(p.weapon) + 1) % list.length];
  toast(`Waffe: ${WEAPON_NAME[p.weapon]}`);
}

export function weaponAmmo(p) {
  return p.weapon === 'rail' ? p.slugs : p.weapon === 'missile' ? p.missiles : p.ammo;
}
