// Chance encounters in open space, one at a time, announced by radio and marked as a nav target:
//  distress – a hauler under pirate attack; drive the pirates off before its hull gives out
//  wreck    – a drifting wreck with cargo canisters, now and then a pirate trap
//  stranded – a trader with an empty hyperdrive tank; fly up slowly and hand over 1 LY of fuel
import * as THREE from 'three';
import { G } from '../ctx.js';
import { ENCOUNTER, SAFE_RADIUS, BLACKHOLE, HYPER } from '../config.js';
import { lootable } from './missions.js';
import { haulerModel } from '../world/traffic.js';
import { nearestStation } from '../world/station.js';
import { nearestHole } from '../world/blackhole.js';
import { spawnEnemy, addScore } from '../entities/enemies.js';
import { spawnPickup } from '../world/pickups.js';
import { emit } from '../world/particles.js';
import { navTargets } from './nav.js';
import { sunDist } from './sun.js';
import { rules } from './difficulty.js';
import { comms, showBanner, toast } from '../ui/hud.js';
import { sfxAlarm, sfxBoom, sfxChime } from '../core/audio.js';
import { pick, dotTexture } from '../utils.js';

const NAMES = ['Morgenstern', 'Albatros', 'Kranich', 'Lotte', 'Elster', 'Seestern', 'Hummel', 'Möwe', 'Kormoran', 'Fidelio', 'Wanderfalke', 'Greta'];
const LOOT = ['minerals', 'machinery', 'computers', 'luxuries', 'textiles', 'food', 'weapons', 'narcotics'];
const HEX = { distress: '#ff7a5c', wreck: '#c9b48a', stranded: '#ffd34d' };

let enc = null, timer = ENCOUNTER.first, wreckMat = null, beaconMat = null;
const v = new THREE.Vector3(), fwd = new THREE.Vector3();

export const encounterNavPoints = () => (enc && enc.nav ? [enc.nav] : []);
export const activeEncounter = () => enc;

export function clearEncounter() {
  if (enc) { G.scene.remove(enc.mesh, enc.halo); enc.halo.material.dispose(); }
  enc = null;
}

export function wreckModel() {
  const m = haulerModel();
  wreckMat ||= new THREE.MeshStandardMaterial({ color: 0x4a4541, metalness: 0.45, roughness: 0.85, flatShading: true });
  const drop = [];
  m.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.isMeshBasicMaterial) drop.push(o);   // lights and engine glow are dead
    else o.material = wreckMat;
  });
  for (const c of m.children) if (Math.random() < 0.2) drop.push(c);   // parts torn off
  drop.forEach(o => o.parent?.remove(o));
  return m;
}

function strandedModel() {
  const m = haulerModel();
  m.traverse(o => { if (o.isMesh && o.geometry.type === 'CircleGeometry') o.visible = false; });   // engines cold
  return m;
}

// A blinking orange beacon on top of the hull
function addBeacon(mesh) {
  beaconMat ||= new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(2.4, 1.2, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const s = new THREE.Sprite(beaconMat.clone());
  s.position.set(0, 2.6, -6.8);
  s.scale.setScalar(4);
  mesh.add(s);
  return s;
}

// A pulsing light in the encounter colour that grows with distance, so the spot can be seen from kilometres away
function addHalo(hex) {
  const m = new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(hex).multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true });
  const s = new THREE.Sprite(m);
  G.scene.add(s);
  return s;
}

// Where something lies, as words: "3,2 km voraus, links oben"
const rel = new THREE.Vector3(), invQ = new THREE.Quaternion();
export function directionWords(pos) {
  invQ.copy(G.ship.quaternion).invert();
  rel.subVectors(pos, G.ship.position);
  const d = rel.length();
  rel.applyQuaternion(invQ).normalize();
  const parts = [rel.z < -0.5 ? 'voraus' : rel.z > 0.5 ? 'hinter dir' : 'seitlich'];
  if (Math.abs(rel.x) > 0.25) parts.push(rel.x < 0 ? 'links' : 'rechts');
  if (Math.abs(rel.y) > 0.25) parts.push(rel.y > 0 ? 'oben' : 'unten');
  return `${(d / 1000).toFixed(1).replace('.', ',')} km ${parts[0]}${parts.length > 1 ? ', ' + parts.slice(1).join(' ') : ''}`;
}

// A free spot 2.6–4.2 km out, roughly ahead, away from stations and black holes
function findSpot(out) {
  fwd.copy(G.player.fwd);
  for (let i = 0; i < 10; i++) {
    v.randomDirection().multiplyScalar(0.8).add(fwd).normalize();
    out.copy(G.ship.position).addScaledVector(v, ENCOUNTER.dist[0] + Math.random() * (ENCOUNTER.dist[1] - ENCOUNTER.dist[0]));
    if (nearestStation(out).d < SAFE_RADIUS + 900) continue;
    if (G.holes.length && nearestHole(out).d < BLACKHOLE.masslock + 400) continue;
    return true;
  }
  return false;
}

function start(type) {
  const pos = new THREE.Vector3();
  if (!findSpot(pos)) return false;
  const name = pick(NAMES);
  const mesh = type === 'wreck' ? wreckModel() : type === 'stranded' ? strandedModel() : haulerModel();
  mesh.position.copy(pos);
  mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  G.scene.add(mesh);
  enc = {
    type, name, mesh, pos, sysPos: pos.clone().add(G.origin), state: 'call', t: 0, hp: ENCOUNTER.distressHp,
    pirates: [], hold: 0, beacon: addBeacon(mesh), halo: addHalo(HEX[type]),
    spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(type === 'wreck' ? 0.25 : 0.02),
    nav: { kind: 'encounter', name: type === 'distress' ? `Notruf ${name}` : type === 'wreck' ? 'Wrack' : `Frachter ${name}`, hex: HEX[type], r: 0, pos },
  };
  // Always the nav target: marker on screen, arrow at the edge, cruise drive takes you there
  const i = navTargets().indexOf(enc.nav);
  if (i >= 0) G.navTarget = i;
  const where = `Position: ${directionWords(pos)}, Ziel ▸ gesetzt.`;
  if (type === 'distress') {
    comms(`Frachter ${name}`, `Mayday, Mayday! Piraten greifen uns an, bitte helfen Sie! ${where}`, 10);
    showBanner('NOTRUF', 1.8);
    sfxAlarm();
  } else if (type === 'wreck') {
    comms('Bordcomputer', `Signal eines treibenden Wracks, vielleicht mit Fracht. ${where}`, 9);
    showBanner('WRACKSIGNAL', 1.6);
  } else {
    comms(`Frachter ${name}`, `Hier ist die ${name}, unser Hyperantrieb ist trocken. Können Sie 1 LJ Treibstoff abgeben? Langsam heranfliegen, wir zahlen gut. ${where}`, 11);
    showBanner('FUNKSPRUCH', 1.6);
  }
  return true;
}

// Starts one right away (tests, debugging)
export function startEncounter(type) { clearEncounter(); return start(type); }

function pickType() {
  const p = G.profile, r = Math.random();
  const canFuel = p.upgrades.hyper && p.fuel >= 1.5;
  if (r < 0.42) return 'distress';
  if (r < 0.75 || !canFuel) return 'wreck';
  return 'stranded';
}

function reward(base) {
  return Math.round(base * rules().rewards / 10) * 10;
}

function finish(state) {
  enc.state = state;
  enc.t = 0;
  enc.nav = null;
}

export function updateEncounters(dt) {
  const p = G.profile;
  if (!p) return;
  if (G.mode === 'docked') { clearEncounter(); return; }
  if (G.mode !== 'flight' && G.mode !== 'docking') return;

  if (!enc) {
    if ((timer -= dt) > 0) return;
    timer = 20;   // try again soon when the moment is wrong
    if (G.enemies.length || G.hyper || nearestStation(G.ship.position).d < SAFE_RADIUS + 300 || sunDist(G.ship.position) < 3) return;
    if (start(pickType())) timer = ENCOUNTER.every[0] + Math.random() * (ENCOUNTER.every[1] - ENCOUNTER.every[0]);
    return;
  }

  enc.t += dt;
  enc.pos.copy(enc.sysPos).sub(G.origin);
  enc.mesh.position.copy(enc.pos);
  enc.mesh.rotation.x += enc.spin.x * dt;
  enc.mesh.rotation.y += enc.spin.y * dt;
  enc.mesh.rotation.z += enc.spin.z * dt;
  if (enc.beacon) enc.beacon.material.opacity = Math.sin(G.time * 6) > 0.2 ? 1 : 0.1;
  const d = enc.pos.distanceTo(G.ship.position);
  // Far halo: only while the spot still matters, fades out up close
  enc.halo.position.copy(enc.pos);
  enc.halo.scale.setScalar(Math.max(20, d * 0.03));
  enc.halo.material.opacity = enc.nav ? Math.min(1, Math.max(0, (d - 300) / 600)) * (0.55 + 0.45 * Math.sin(G.time * 4)) : 0;

  // Done: the hauler leaves, the wreck stays until you are gone
  if (enc.state === 'leave') {
    v.set(0, 0, -1).applyQuaternion(enc.mesh.quaternion);
    enc.sysPos.addScaledVector(v, Math.min(160, 10 + enc.t * 25) * dt);
    if (enc.t > 14) clearEncounter();
    return;
  }
  if (enc.state === 'over') {
    if (d > 3500 || enc.t > 120) clearEncounter();
    return;
  }
  if (enc.state === 'call' && enc.t > ENCOUNTER.expire) {
    toast(enc.type === 'wreck' ? 'Wracksignal verloren' : `Funkkontakt zur ${enc.name} abgerissen`);
    clearEncounter();
    return;
  }
  if (d > 12000) { clearEncounter(); return; }

  if (enc.type === 'distress') updateDistress(dt, d);
  else if (enc.type === 'wreck') updateWreck(d);
  else updateStranded(dt, d, p);
}

function updateDistress(dt, d) {
  // Sparks on the hull while it is under fire
  if (Math.random() < dt * 3) emit(v.randomDirection().multiplyScalar(4).add(enc.pos), 8, 10, 0.1);
  if (enc.state === 'call' && d < 1500) {
    enc.state = 'fight';
    const n = 2 + (Math.random() < G.system.danger ? 1 : 0);
    for (let i = 0; i < n; i++) enc.pirates.push(spawnEnemy(v.randomDirection().multiplyScalar(70 + Math.random() * 70).add(enc.pos), 0.3 + G.system.danger * 0.4));
    showBanner('KONTAKT');
    sfxAlarm();
  }
  if (enc.state !== 'fight') return;
  const alive = enc.pirates.filter(e => G.enemies.includes(e)).length;
  enc.hp -= alive * ENCOUNTER.distressDps * dt;
  enc.nav.name = `Notruf ${enc.name} · Hülle ${Math.max(0, Math.round(enc.hp / ENCOUNTER.distressHp * 100))} %`;
  if (enc.hp <= 0) {
    emit(enc.pos, 160, 40, 0.05);
    emit(enc.pos, 60, 26, 0.58);
    sfxBoom(24);
    for (let k = 0; k < 3; k++) spawnPickup(enc.pos.clone().add(v.randomDirection().multiplyScalar(4)), new THREE.Vector3().randomDirection().multiplyScalar(4), pick(LOOT.slice(0, 6)), 1);
    toast(`Die ${enc.name} ist verloren`);
    G.scene.remove(enc.mesh);
    finish('over');
    enc.mesh = new THREE.Object3D();
    return;
  }
  if (alive === 0) {
    const cr = reward(250 + 130 * enc.pirates.length);
    G.profile.credits += cr;
    addScore(2);
    comms(`Frachter ${enc.name}`, `Danke, Pilot! Ohne Sie wären wir erledigt. Wir überweisen ${cr} Cr.`, 7);
    sfxChime();
    finish('leave');
  }
}

function updateWreck(d) {
  if (enc.state === 'call' && d < 650) {
    enc.state = 'near';
    const n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      spawnPickup(v.randomDirection().multiplyScalar(14 + Math.random() * 20).add(enc.pos), new THREE.Vector3().randomDirection().multiplyScalar(1.5), pick(lootable(LOOT)), Math.random() < 0.3 ? 2 : 1);
    }
    toast('Frachtbehälter treiben um das Wrack');
    if (Math.random() < ENCOUNTER.trap + G.system.danger * 0.2) {
      const n2 = 2 + (Math.random() < G.system.danger ? 1 : 0);
      for (let i = 0; i < n2; i++) spawnEnemy(v.randomDirection().multiplyScalar(160 + Math.random() * 60).add(enc.pos), 0.3 + G.system.danger * 0.35);
      showBanner('FALLE');
      comms('Unbekannt', 'Danke fürs Vorbeischauen. Die Ladung gehört uns, und Ihre gleich mit.', 6);
      sfxAlarm();
    }
    finish('over');
  }
}

function updateStranded(dt, d, p) {
  if (d > 80 || Math.abs(G.player.speed) > 25 || G.player.cruise) {
    if (enc.hold > 0) toast('Übergabe unterbrochen');
    enc.hold = 0;
    return;
  }
  if (p.fuel < 1) {
    if (!enc.warned) { toast('Zu wenig Treibstoff an Bord: 1 LJ nötig'); enc.warned = true; }
    return;
  }
  if (enc.hold === 0) toast('Treibstoffübergabe läuft …');
  enc.hold += dt;
  if (enc.hold < 3) return;
  p.fuel -= 1;
  const cr = reward(200 + Math.random() * 120 + HYPER.fuelPrice * 10);
  p.credits += cr;
  addScore(1);
  comms(`Frachter ${enc.name}`, `Tank voll genug für den Sprung. Vielen Dank, ${cr} Cr sind unterwegs. Gute Reise!`, 7);
  sfxChime();
  enc.mesh.traverse(o => { if (o.isMesh && o.geometry.type === 'CircleGeometry') o.visible = true; });
  finish('leave');
}
