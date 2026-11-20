import * as THREE from 'three';
import { G } from '../ctx.js';
import { LAW, BLACKHOLE, SUN, CRUISE, LASER, LASER_LEVELS, LASER_HEAT, RAIL, MISSILE, TIERS, SEAT, CHASE, REBASE_DIST, ENEMY } from '../config.js';
import { cloneModel, buildFallbackShip } from '../core/assets.js';
import { applyAddons } from '../world/ship-addons.js';
import { breakAsteroid, clearAsteroids } from '../world/asteroids.js';
import { trafficHit, damageTraffic } from '../world/traffic.js';
import { commitCrime } from '../game/law.js';
import { emit, shiftParticles } from '../world/particles.js';
import { nearestStation, stationHit } from '../world/station.js';
import { holePull, nearestHole } from '../world/blackhole.js';
import { currentNav, navLabel } from '../game/nav.js';
import { damageEnemy } from './enemies.js';
import { fireRail, fireMissile, tickWeapons, clearWeapons, shiftWeapons } from './weapons.js';
import { alignInput } from '../game/targeting.js';
import { sfxLaser, sfxBoom, sfxDeny, sfxCruise, sfxShieldHit, sfxHullHit, sfxCrash } from '../core/audio.js';
import { flash, toast, showBanner } from '../ui/hud.js';
import { segDist2, clamp } from '../utils.js';
import { maxShield, shieldRegen, shipDef } from '../game/save.js';
import { sunDist } from '../game/sun.js';
import { hullHit, updateDamage, engineFactor, engineCut, wearOf, wearStep, resetDamageFx, damageOn, gameOverOn } from '../game/damage.js';
import { buildCanopy, updateCanopy, applyHullMarks, damageFx } from '../world/ship-damage.js';

const ship = new THREE.Object3D();
const P = {
  speed: 0, vel: new THREE.Vector3(), knock: new THREE.Vector3(), grav: new THREE.Vector3(), angVel: new THREE.Vector3(),
  fwd: new THREE.Vector3(0, 0, -1), shield: 100, invuln: 0, fireCd: 0, gun: 0,
  cruise: false, cruiseSpeed: 0, align: false,
  heat: 0, overheat: false, sinceShot: 9,
  temp: 0, sunDist: Infinity, scooping: false,   // hull temperature near a sun (game/sun.js)
};
let model = null, flightFx = null, guns = [], glows = [], markStep = -1, sparkT = 0, shake = 0, hitSfxT = 0, cockpit = null, snap = true, ammoWarnT = 0, gravWarnT = 0;
const parts = {}, rparts = {};
let rearPit = null;
const boltGeo = new THREE.CylinderGeometry(0.11, 0.11, 5, 6, 1, true).rotateX(Math.PI / 2);
let boltMats = [];
const seat = new THREE.Vector3(...SEAT), chaseOff = new THREE.Vector3(...CHASE);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.07);
// Rear view (rear laser selected): the camera turned half round
const flipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
// Björn: looking back works always; only with the rear laser can you fire back there
export const rearView = () => G.mode === 'flight' && !!P.lookBack;
export function toggleLookBack() {
  if (G.mode !== 'flight') return;
  P.lookBack = !P.lookBack;
  snap = true;
}

export function initPlayer() {
  G.ship = ship;
  G.player = P;
  G.scene.add(ship);
  boltMats = LASER_LEVELS.map(l => new THREE.MeshBasicMaterial({ color: new THREE.Color(...l.color), fog: false }));
  cockpit = buildCockpit();
  G.camera.add(cockpit);
  rearPit = buildRearPit();
  G.camera.add(rearPit);
}

// The flown ship's handling, camera points and collision radius (see SHIPS)
const flight = () => shipDef(G.profile).flight;
const radius = () => shipDef(G.profile).radius;

export function attachPlayerModel() {
  if (model) ship.remove(model);
  const def = shipDef(G.profile);
  seat.fromArray(def.seat);
  chaseOff.fromArray(def.chase);
  model = cloneModel(def.model) || buildFallbackShip('player');
  markStep = G.profile ? wearStep(G.profile) : 0;
  applyHullMarks(model, wearOf(G.profile));       // before the add-ons, so the marks sit on the hull
  flightFx?.dispose();
  flightFx = damageFx(model, { smoke: false });
  applyAddons(model, def.model, G.profile?.upgrades);
  ship.add(model);
  guns = ['Gun_L', 'Gun_R'].map(n => model.getObjectByName(n)).filter(Boolean);
  glows = [];
  model.traverse(o => { if (o.isMesh && o.material?.name === 'EngineGlow') glows.push(o); });
}

/* ---------- Cockpit frame: canopy pillars and a dashboard sill ---------- */
function buildCockpit() {
  const g = new THREE.Group();
  // a little self-light like the rear canopy, so the frame stays visible against black space (Björn missed it)
  const frame = new THREE.MeshStandardMaterial({ color: 0x2c333d, metalness: 0.6, roughness: 0.5, emissive: 0x1a2028, fog: false });
  const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.5, 1.2), fog: false });
  const warn = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.9, 0.2), fog: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const k of ['pillarL', 'pillarR', 'sill', 'brow']) { parts[k] = new THREE.Mesh(box, frame); g.add(parts[k]); }
  parts.strip = new THREE.Mesh(box, strip); g.add(parts.strip);
  parts.lampL = new THREE.Mesh(box, warn); g.add(parts.lampL);
  parts.lampR = new THREE.Mesh(box, warn); g.add(parts.lampR);
  parts.glass = buildCanopy(); g.add(parts.glass);   // scratches and cracks once the hull is hit
  return g;
}

// Rear gunner's canopy (rear laser selected): a rounder bubble frame with corner braces,
// a low turret console with two hand grips, a red sight strip and the same glass damage
function buildRearPit() {
  const g = new THREE.Group();
  // a little self-light: looking back, the sun rarely lights the frame from the front
  const frame = new THREE.MeshStandardMaterial({ color: 0x2c333d, metalness: 0.6, roughness: 0.5, emissive: 0x1a2028, fog: false });
  const grip = new THREE.MeshStandardMaterial({ color: 0x0e1014, metalness: 0.3, roughness: 0.8, fog: false });
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.35, 0.25), fog: false });
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  for (const k of ['pillarL', 'pillarR', 'brow', 'cornerL', 'cornerR', 'sill', 'lowL', 'lowR']) { rparts[k] = new THREE.Mesh(box, frame); g.add(rparts[k]); }
  for (const k of ['gripL', 'gripR']) { rparts[k] = new THREE.Mesh(cyl, grip); g.add(rparts[k]); }
  for (const k of ['strip', 'lampL', 'lampR']) { rparts[k] = new THREE.Mesh(box, red); g.add(rparts[k]); }
  rparts.glass = buildCanopy(); g.add(rparts.glass);
  g.visible = false;
  return g;
}

function placeBeam(mesh, a, b, w, depth) {
  tmp.subVectors(b, a);
  const len = tmp.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.scale.set(w, len, depth);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, tmp.normalize());
}

export function layoutCockpit() {
  const cam = G.camera, d = 0.5;
  const hh = d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), hw = hh * cam.aspect;
  layoutRearPit(cam, d, hh, hw);
  placeBeam(parts.pillarL, new THREE.Vector3(-hw * 1.05, -hh * 0.7, -d), new THREE.Vector3(-hw * 0.52, hh * 1.1, -d), hh * 0.075, hh * 0.05);
  placeBeam(parts.pillarR, new THREE.Vector3(hw * 1.05, -hh * 0.7, -d), new THREE.Vector3(hw * 0.52, hh * 1.1, -d), hh * 0.075, hh * 0.05);
  placeBeam(parts.brow, new THREE.Vector3(-hw * 0.6, hh * 1.04, -d), new THREE.Vector3(hw * 0.6, hh * 1.04, -d), hh * 0.06, hh * 0.05);
  parts.sill.position.set(0, -hh * 0.98, -d);
  parts.sill.scale.set(hw * 2.4, hh * 0.44, hh * 0.3);
  parts.sill.rotation.x = -0.35;
  parts.strip.position.set(0, -hh * 0.77, -d + 0.02);
  parts.strip.scale.set(hw * 0.9, hh * 0.012, 0.002);
  // The canopy sheet sits just behind the frame and fills the view
  const dg = 0.56, hg = dg * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  parts.glass.position.set(0, 0, -dg);
  parts.glass.scale.set(hg * cam.aspect * 2.02, hg * 2.02, 1);
  for (const [k, s] of [['lampL', -1], ['lampR', 1]]) {
    parts[k].position.set(s * hw * 0.62, -hh * 0.79, -d + 0.02);
    parts[k].scale.set(hh * 0.05, hh * 0.025, 0.002);
  }
}

function layoutRearPit(cam, d, hh, hw) {
  const V = (x, y) => new THREE.Vector3(x, y, -d), R = rparts;
  // near-vertical side pillars, bending in at the top into corner braces and a heavy brow
  placeBeam(R.pillarL, V(-hw * 0.98, -hh * 0.62), V(-hw * 0.9, hh * 0.62), hh * 0.08, hh * 0.05);
  placeBeam(R.pillarR, V(hw * 0.98, -hh * 0.62), V(hw * 0.9, hh * 0.62), hh * 0.08, hh * 0.05);
  placeBeam(R.cornerL, V(-hw * 0.9, hh * 0.6), V(-hw * 0.62, hh * 0.98), hh * 0.08, hh * 0.05);
  placeBeam(R.cornerR, V(hw * 0.9, hh * 0.6), V(hw * 0.62, hh * 0.98), hh * 0.08, hh * 0.05);
  placeBeam(R.brow, V(-hw * 0.64, hh * 0.99), V(hw * 0.64, hh * 0.99), hh * 0.09, hh * 0.05);
  placeBeam(R.lowL, V(-hw * 0.98, -hh * 0.6), V(-hw * 0.7, -hh * 0.86), hh * 0.08, hh * 0.05);
  placeBeam(R.lowR, V(hw * 0.98, -hh * 0.6), V(hw * 0.7, -hh * 0.86), hh * 0.08, hh * 0.05);
  // turret console with the sight strip and two hand grips
  R.sill.position.set(0, -hh * 1.0, -d);
  R.sill.scale.set(hw * 1.5, hh * 0.34, hh * 0.3);
  R.sill.rotation.x = -0.3;
  R.strip.position.set(0, -hh * 0.84, -d + 0.02);
  R.strip.scale.set(hw * 0.5, hh * 0.012, 0.002);
  for (const [k, s] of [['gripL', -1], ['gripR', 1]]) {
    R[k].position.set(s * hw * 0.42, -hh * 0.86, -d + 0.03);
    R[k].scale.set(hh * 0.035, hh * 0.2, hh * 0.035);
    R[k].rotation.set(0.5, 0, -s * 0.25);
  }
  for (const [k, s] of [['lampL', -1], ['lampR', 1]]) {
    R[k].position.set(s * hw * 0.3, -hh * 0.86, -d + 0.02);
    R[k].scale.set(hh * 0.04, hh * 0.02, 0.002);
  }
  const dg = 0.56, hg = dg * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  R.glass.position.set(0, 0, -dg);
  R.glass.scale.set(hg * cam.aspect * 2.02, hg * 2.02, 1);
}

export function applyView() {
  // Björn: looking back never shows the ship; the cockpit view gets the rear canopy frame,
  // the chase view a free look back without any frame
  const rear = rearView();
  const chase = G.settings.view === 'chase';
  const flying = ['flight', 'docking', 'menu', 'hyper'].includes(G.mode);
  if (model) model.visible = chase && flying && !rear;
  cockpit.visible = !chase && flying && !rear;
  rearPit.visible = !chase && rear;
  document.body.classList.toggle('rear-view', rear);
  const w = G.profile ? wearOf(G.profile) : 0;
  updateCanopy(rear ? rparts.glass : parts.glass, w, G.profile ? wearStep(G.profile) : 0, G.camera.aspect);
  const low = (P.shield < 30 || w > 0.5) && G.mode === 'flight';
  parts.lampL.visible = parts.lampR.visible = rparts.lampL.visible = rparts.lampR.visible = !low || Math.sin(G.time * 10) > 0;
}

export function snapCamera() { snap = true; }

/* ---------- Cruise drive ---------- */
export function toggleCruise() {
  if (G.mode !== 'flight') return;
  if (P.cruise) { dropCruise('Reiseantrieb aus'); return; }
  const ns = nearestStation(ship.position);
  if (ns.st && ns.d < CRUISE.masslockStation) { toast('Massesperre: Station zu nah'); sfxDeny(); return; }
  if (G.enemies.some(e => e.pos.distanceTo(ship.position) < CRUISE.masslockEnemy)) { toast('Massesperre: Feinde in der Nähe'); sfxDeny(); return; }
  if (nearestHole(ship.position).d < BLACKHOLE.masslock) { toast('Massesperre: Schwarzes Loch'); sfxDeny(); return; }
  if (sunDist(ship.position) < SUN.masslock) { toast('Massesperre: Sonne'); sfxDeny(); return; }
  P.cruise = true;
  P.cruiseSpeed = Math.max(P.speed, 0);
  clearAsteroids();             // the local field is left behind; it refills after the drop
  showBanner('REISEANTRIEB', 1.2);
  sfxCruise(true);
}

export function dropCruise(msg) {
  if (!P.cruise) return;
  P.cruise = false;
  P.speed = Math.min(flight().maxSpeed, 80);
  if (msg) toast(msg);
  sfxCruise(false);
}

function updateCruise(dt) {
  const t = currentNav();
  const dTarget = t ? t.pos.distanceTo(ship.position) : Infinity;
  const dropAt = !t ? 0 : t.kind === 'station' ? CRUISE.dropDist : t.kind === 'star' ? t.r * SUN.masslock + 300 : 350;
  // Slow down smoothly on the approach to the nav target
  const brake = Math.max(250, (dTarget - dropAt) * 1.3);
  P.cruiseSpeed = Math.min(P.cruiseSpeed + CRUISE.accel * dt, CRUISE.speed, brake);
  if (t && dTarget < dropAt) { dropCruise(`Ankunft: ${navLabel(t)}`); return; }
  const ns = nearestStation(ship.position);
  if (ns.st && (!t || ns.st !== t.st) && ns.d < CRUISE.masslockStation) dropCruise(`Massesperre: ${ns.st.def.name}`);
  else if (nearestHole(ship.position).d < BLACKHOLE.masslock) dropCruise('Massesperre: Schwarzes Loch');
  else if (sunDist(ship.position) < SUN.masslock) dropCruise('Massesperre: Sonne');
}

/* ---------- Flight ---------- */
export function updatePlayer(dt, inp) {
  if (G.mode === 'docking' || G.mode === 'docked' || G.mode === 'hyper') { P.vel.set(0, 0, 0); P.grav.set(0, 0, 0); return; }
  const flying = G.mode === 'flight';
  if (flying) alignInput(inp);
  const turn = P.cruise ? CRUISE.turnScale : 1;
  const k = Math.min(1, dt * 6);
  const F = flight();
  // Looking back over the rear laser the stick steers the view, as if the tail were the nose
  const m = rearView() ? -1 : 1;
  P.angVel.x += (m * inp.pitch * F.pitch * turn - P.angVel.x) * k;
  P.angVel.y += (m * inp.yaw * F.yaw * turn - P.angVel.y) * k;
  P.angVel.z += (m * inp.roll * F.roll - P.angVel.z) * k;
  ship.rotateX(P.angVel.x * dt);
  ship.rotateY(P.angVel.y * dt);
  ship.rotateZ(P.angVel.z * dt);

  if (P.cruise && flying) updateCruise(dt);
  else if (flying) P.speed = clamp(P.speed + inp.throttle * F.accel * dt, F.minSpeed, F.maxSpeed);
  else P.speed *= Math.exp(-1.5 * dt);

  P.fwd.set(0, 0, -1).applyQuaternion(ship.quaternion);
  P.knock.multiplyScalar(Math.exp(-2.2 * dt));
  if (flying) gravity(dt);
  // A damaged engine sputters: the thrust drops for a moment (less so on the cruise drive)
  const eng = flying ? engineFactor() : 1;
  P.vel.copy(P.fwd).multiplyScalar(P.cruise ? P.cruiseSpeed * (0.6 + 0.4 * eng) : P.speed * eng).add(P.knock).add(P.grav);
  ship.position.addScaledVector(P.vel, dt);
  rebase();
  if (flying && G.holes.length && nearestHole(ship.position).d < BLACKHOLE.horizonKill) {
    showBanner('VOM SCHWARZEN LOCH VERSCHLUCKT', 3);
    P.invuln = 0;
    hurtPlayer(9999, true);
    return;
  }

  P.fireCd -= dt;
  P.invuln -= dt;
  ammoWarnT -= dt;
  tickWeapons(dt);
  coolLasers(dt);
  if (!flying) return;
  P.shield = Math.min(maxShield(G.profile), P.shield + shieldRegen(G.profile) * dt);
  hullFx(dt);
  if (P.cruise) return;
  const lv = LASER_LEVELS[G.profile.upgrades.laser] || LASER_LEVELS[0];
  if (inp.fire && P.fireCd <= 0) {
    const w = G.profile.weapon;
    if (rearView()) {
      if (G.profile.upgrades.rear) { fireLaser(lv, true); P.fireCd = lv.interval; }
      else if (ammoWarnT <= 0) { toast('Kein Hecklaser – in der Werft nachrüsten'); sfxDeny(); ammoWarnT = 2.5; }
    }
    else if (w === 'rail') { fireRail(); P.fireCd = RAIL.interval; }
    else if (w === 'missile') { fireMissile(); P.fireCd = MISSILE.interval; }
    else { fireLaser(lv); P.fireCd = lv.interval; }
  }
  asteroidCollisions();
}

// Black holes pull the ship. The pull builds up a drift (P.grav) on top of the
// ship's own speed, damped a little so it stays flyable. Warnings get louder
// as the ship gets closer.
const gAcc = new THREE.Vector3();
function gravity(dt) {
  if (!G.holes.length) { P.grav.set(0, 0, 0); return; }
  gAcc.set(0, 0, 0);
  const d = holePull(ship.position, gAcc);
  P.grav.addScaledVector(gAcc, dt).multiplyScalar(Math.exp(-BLACKHOLE.drag * dt));
  P.gravAccel = gAcc.length();
  P.holeDist = d;
  gravWarnT -= dt;
  if (gravWarnT > 0) return;
  if (d < BLACKHOLE.warn) { showBanner('STARKER SOG', 1.4); sfxDeny(); gravWarnT = 2.5; }
  else if (P.gravAccel > 6) { toast(`Gravitationssog: Schwarzes Loch · ${Math.round(d)} m`); gravWarnT = 6; }
}

// Floating origin: when the ship is far from the scene origin, move the whole
// scene back so coordinates stay small and precise. G.origin keeps the offset.
function rebase() {
  if (ship.position.lengthSq() < REBASE_DIST * REBASE_DIST) return;
  const d = tmp2.copy(ship.position);
  G.origin.add(d);
  ship.position.set(0, 0, 0);
  G.camera.position.sub(d);
  for (const st of G.stations) st.pos.sub(d);
  for (const h of G.holes) h.pos.sub(d);
  if (G.star) G.star.pos.sub(d);
  for (const a of G.asteroids) a.pos.sub(d);
  for (const e of G.enemies) e.pos.sub(d);
  for (const p of G.pickups) p.pos.sub(d);
  for (const t of G.traffic) t.mesh.position.sub(d);
  for (const b of G.bolts) { b.pos.sub(d); b.prev.sub(d); }
  for (const b of G.enemyBolts) { b.pos.sub(d); b.prev.sub(d); }
  shiftWeapons(d);
  shiftParticles(tmp.copy(d).negate());
}

function coolLasers(dt) {
  P.sinceShot += dt;
  const rate = P.sinceShot > LASER_HEAT.coolDelay ? LASER_HEAT.cool : LASER_HEAT.coolFiring;
  P.heat = Math.max(0, P.heat - rate * dt);
  if (P.overheat && P.heat < LASER_HEAT.resume) { P.overheat = false; toast('Laser abgekühlt'); }
}

function fireLaser(lv, back = false) {
  if (P.overheat) {
    if (ammoWarnT <= 0) { sfxDeny(); ammoWarnT = 1.2; }
    return;
  }
  if (G.profile.ammo <= 0) { fire(lv, back); return; }
  const before = P.heat;
  P.heat = Math.min(1, P.heat + (LASER_HEAT.perShot[G.profile.upgrades.laser] ?? LASER_HEAT.perShot[0]));
  P.sinceShot = 0;
  if (before < LASER_HEAT.warn && P.heat >= LASER_HEAT.warn) toast('Laser heiß – Feuerpausen einlegen');
  if (P.heat >= 1) { P.overheat = true; showBanner('LASER ÜBERHITZT', 1.6); sfxDeny(); }
  fire(lv, back);
}

function fire(lv, back = false) {
  const p = G.profile;
  if (p.ammo <= 0) {
    if (ammoWarnT <= 0) { toast('Keine Munition – an einer Station nachkaufen'); sfxDeny(); ammoWarnT = 2.5; }
    return;
  }
  p.ammo--;
  if (p.ammo === 50) toast('Munition knapp');
  const mesh = new THREE.Mesh(boltGeo, boltMats[p.upgrades.laser] || boltMats[0]);
  if (back) {                                   // rear laser: twin barrels in the tail turret
    const rg = model?.getObjectByName('Gun_Rear');
    if (rg) rg.getWorldPosition(mesh.position); else mesh.position.set(0, -0.5, radius() + 1).applyQuaternion(ship.quaternion).add(ship.position);
    mesh.position.add(tmp.set(P.gun % 2 ? 0.18 : -0.18, 0, 0).applyQuaternion(ship.quaternion));
    mesh.quaternion.copy(ship.quaternion).multiply(flipQ);
  } else {
    if (guns.length) guns[P.gun % guns.length].getWorldPosition(mesh.position);
    else mesh.position.set(P.gun % 2 ? 1.2 : -1.2, -0.6, -3).applyQuaternion(ship.quaternion).add(ship.position);
    mesh.quaternion.copy(ship.quaternion);
  }
  P.gun++;
  G.scene.add(mesh);
  G.bolts.push({ mesh, pos: mesh.position, prev: mesh.position.clone(),
    vel: P.fwd.clone().multiplyScalar(back ? -LASER.speed : LASER.speed).add(P.vel), life: LASER.life, dmg: lv.dmg });
  sfxLaser(p.upgrades.laser ? 1900 : 1500, p.upgrades.laser ? 320 : 220);
}

export function updateBolts(dt) {
  const hr2 = ENEMY.hitRadius * ENEMY.hitRadius;
  for (let i = G.bolts.length - 1; i >= 0; i--) {
    const b = G.bolts[i];
    b.prev.copy(b.pos);
    b.pos.addScaledVector(b.vel, dt);
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) for (const a of G.asteroids) {
      const hr = a.r * 0.95 + 0.4;
      if (segDist2(a.pos, b.prev, b.pos) < hr * hr) { breakAsteroid(a, true); dead = true; break; }
    }
    if (!dead) for (const e of G.enemies) {
      if (segDist2(e.pos, b.prev, b.pos) < hr2) { damageEnemy(e, b.dmg, b.pos); dead = true; break; }
    }
    if (!dead) { const t = trafficHit(b.prev, b.pos); if (t) { damageTraffic(t, b.dmg, b.pos); dead = true; } }
    if (!dead) for (const st of G.stations) {
      if (stationHit(st, b.pos)) { emit(b.pos, 6, 8, 0.5); commitCrime(LAW.hitStation, 'Beschuss einer Station'); dead = true; break; }
    }
    if (dead) { G.scene.remove(b.mesh); G.bolts.splice(i, 1); }
  }
}

export function clearBolts() {
  for (const b of G.bolts) G.scene.remove(b.mesh);
  G.bolts.length = 0;
  clearWeapons();
}

function asteroidCollisions() {
  for (const a of G.asteroids) {
    if (a.pos.distanceTo(ship.position) >= a.r * 0.88 + radius()) continue;
    tmp2.subVectors(ship.position, a.pos).normalize();
    P.knock.addScaledVector(tmp2, 45);
    P.speed *= 0.35;
    if (P.invuln <= 0) { P.invuln = 0.8; hurtPlayer(TIERS[a.tier].dmg, true); }
    breakAsteroid(a, false);
    break;
  }
}

// The shield takes the hit first; what gets through wears down the hull (game/damage.js).
// pierce: share that goes straight to the hull (a ram into a station). 9999 is certain death
// (black hole, plunging into a sun).
export function hurtPlayer(amount, strong, pierce = 0) {
  if (G.mode !== 'flight') return;
  hitFeedback(amount, strong, damageOn() && (pierce > 0 || amount > Math.max(0, P.shield)));
  if (!damageOn()) {              // switched off in the settings: an empty shield is the end of the ship
    P.shield -= amount;
    flash(strong);
    if (navigator.vibrate) try { navigator.vibrate(strong ? 60 : 25); } catch (_) {}
    if (P.shield <= 0) killPlayer();
    return;
  }
  const direct = amount * pierce;
  amount -= direct;
  const shield = Math.max(0, P.shield), rest = Math.max(0, amount - shield) + direct;
  P.shield = Math.max(0, shield - amount);
  flash(strong || rest > 0);
  if (navigator.vibrate) try { navigator.vibrate(strong || rest > 0 ? 60 : 25); } catch (_) {}
  if (amount >= 9999 || (rest > 0 && hullHit(rest))) killPlayer();
}

// You hear and feel a hit: the ship shudders (camera shake), a sound for shield, hull or a crash.
// collision hits (strong) are louder and shake harder.
function hitFeedback(amount, strong, hull) {
  if (amount >= 9999) return;
  const k = Math.min(1, amount / 30);
  shake = Math.min(1, shake + 0.2 + k * 0.5 + (strong ? 0.25 : 0) + (hull ? 0.15 : 0));
  const now = performance.now();
  if (now - hitSfxT < 70) return;          // rapid fire: one sound is enough
  hitSfxT = now;
  if (strong) sfxCrash(k);
  else if (hull) sfxHullHit(k);
  else sfxShieldHit(k);
  if (strong && hull) sfxHullHit(k);
}
const shakeQ = new THREE.Quaternion(), shakeE = new THREE.Euler();
function applyShake(cam, dt) {
  if (shake < 0.002) { shake = 0; return; }
  const a = shake * Math.sqrt(shake), s = radius();
  cam.position.x += (Math.random() - 0.5) * 0.18 * s * a;
  cam.position.y += (Math.random() - 0.5) * 0.18 * s * a;
  shakeE.set((Math.random() - 0.5) * 0.08 * a, (Math.random() - 0.5) * 0.08 * a, (Math.random() - 0.5) * 0.05 * a);
  cam.quaternion.multiply(shakeQ.setFromEuler(shakeE));
  shake *= Math.exp(-4.5 * dt);
}

// Hull damage while flying: warning tone, scanner and engine trouble, fresh marks on the
// model, sparks in the outside view, flickering engine glow
function hullFx(dt) {
  updateDamage(dt);
  const p = G.profile, w = wearOf(p), step = wearStep(p);
  if (step !== markStep && model) {
    markStep = step;
    applyHullMarks(model, w);
    flightFx?.dispose();
    flightFx = damageFx(model, { smoke: false });
  }
  if (G.settings.view === 'chase') flightFx?.update(dt);
  const cut = engineCut();
  for (const g of glows) g.visible = !cut || Math.random() < 0.3;
  if (w < 0.35 || G.settings.view !== 'chase' || (sparkT -= dt) > 0) return;
  sparkT = (0.15 + Math.random() * 0.6) / w;
  tmp.set((Math.random() - 0.5), (Math.random() - 0.2) * 0.6, (Math.random() - 0.5)).multiplyScalar(radius() * 1.2)
    .applyQuaternion(ship.quaternion).add(ship.position);
  emit(tmp, 2 + Math.floor(w * 3), 5, 0.07, 0.5);
}

// Destroyed with the pilot still aboard: the game is over (main.js onDeath), unless
// that rule is switched off in the settings; then the insurance steps in as before
function killPlayer() {
  P.shield = 0;
  P.cruise = false;
  G.mode = 'dead';
  G.hyper = null;
  emit(tmp.copy(P.fwd).multiplyScalar(6).add(ship.position), 200, 34, 0.04);
  emit(ship.position, 60, 20, 0.58);
  sfxBoom(20);
  G.events.onDeath?.(!gameOverOn());
}

// "Aussteigen": only with a damaged hull. The pilot leaves in the escape pod, the ship is
// given up and blows up behind it; the insurance replaces it as before.
let ejectArmed = 0;
export function ejectPlayer() {
  if (G.mode !== 'flight' || G.paused || wearOf(G.profile) <= 0 || !gameOverOn()) return false;
  if (performance.now() - ejectArmed > 3000) { ejectArmed = performance.now(); return 'armed'; }
  ejectArmed = 0;
  P.cruise = false;
  G.mode = 'dead';
  G.hyper = null;
  showBanner('RETTUNGSKAPSEL GESTARTET', 2.2);
  sfxCruise(false);
  emit(ship.position, 30, 14, 0.12, 0.7);
  setTimeout(() => {
    emit(tmp.copy(P.fwd).multiplyScalar(6).add(ship.position), 160, 30, 0.04);
    sfxBoom(16);
  }, 700);
  G.events.onDeath?.(true, true);
  return true;
}
export const ejectPending = () => performance.now() - ejectArmed < 3000;

/* ---------- Camera ---------- */
export function updateCamera(dt) {
  const cam = G.camera;
  applyView();
  if (G.mode === 'docked') {
    const st = G.stations[G.profile ? G.profile.station : 0];
    if (!st) return;
    const a = G.time * 0.1;
    cam.position.set(Math.cos(a) * 150, 35 + Math.sin(a * 0.7) * 15, Math.sin(a) * 150).add(st.pos);
    cam.lookAt(st.pos);
    snap = true;
    return;
  }
  if (G.mode === 'dead') return;   // the camera hangs where the ship exploded
  const rear = rearView();
  if (G.settings.view === 'chase' && !rear) {
    // behind the ship (looking back uses the tail position in both views, without the ship in the picture)
    tmp.copy(chaseOff).applyQuaternion(ship.quaternion).add(ship.position);
    tmpQ.copy(ship.quaternion).multiply(tiltQ);
    if (snap || P.cruise) { cam.position.copy(tmp); cam.quaternion.copy(tmpQ); }
    else {
      cam.position.lerp(tmp, 1 - Math.exp(-9 * dt));
      cam.quaternion.slerp(tmpQ, 1 - Math.exp(-10 * dt));
    }
  } else {
    if (rear) {                                  // from the tail turret, looking back
      const rg = model?.getObjectByName('Gun_Rear');
      if (rg) { rg.getWorldPosition(cam.position); cam.position.add(tmp.set(0, 0.6, 0.6).applyQuaternion(ship.quaternion)); }
      else cam.position.set(0, 0.4, radius() + 1).applyQuaternion(ship.quaternion).add(ship.position);
      cam.quaternion.copy(ship.quaternion).multiply(flipQ);
    } else {
      cam.position.copy(seat).applyQuaternion(ship.quaternion).add(ship.position);
      cam.quaternion.copy(ship.quaternion);
    }
  }
  if (G.mode === 'flight') applyShake(cam, dt); else shake = 0;
  snap = false;
}

export function resetFlight() {
  P.speed = 0; P.vel.set(0, 0, 0); P.knock.set(0, 0, 0); P.grav.set(0, 0, 0); P.angVel.set(0, 0, 0);
  P.invuln = 2; P.fireCd = 0;
  P.cruise = false; P.cruiseSpeed = 0; P.align = false; P.lookBack = false;
  P.heat = 0; P.overheat = false; P.sinceShot = 9;
  P.temp = 0; P.scooping = false;
  P.shield = G.profile ? maxShield(G.profile) : 100;
  resetDamageFx();
  for (const g of glows) g.visible = true;
}
