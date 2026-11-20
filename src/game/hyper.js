// Systems and the hyperdrive: entering a system, charging a jump,
// the tunnel, and arrival at the edge of the target system.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { HYPER } from '../config.js';
import { SYSTEMS, systemDist } from './galaxy.js';
import { buildStations, nearestStation } from '../world/station.js';
import { applySystemSky } from '../world/sky.js';
import { clearAsteroids, populateAsteroids } from '../world/asteroids.js';
import { clearPickups } from '../world/pickups.js';
import { clearTraffic } from '../world/traffic.js';
import { missionsOnEnterSystem } from './missions.js';
import { storyOnEnterSystem } from './story.js';
import { resetCustoms } from './law.js';
import { clearEncounter } from './encounters.js';
import { clearEnemies } from '../entities/enemies.js';
import { clearBolts, resetFlight, snapCamera, dropCruise } from '../entities/player.js';
import { resetPirateTimer } from './director.js';
import { rerollMarket } from './economy.js';
import { marketFor, hasHyper, hyperRange } from './save.js';
import { showBanner, toast } from '../ui/hud.js';
import { sfxTick, sfxHyper, sfxDeny } from '../core/audio.js';
import { lookQuat } from '../utils.js';

const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

export function enterSystem(id) {
  G.systemId = id;
  G.system = SYSTEMS[id];
  clearEnemies();
  clearPickups();
  clearBolts();
  clearAsteroids();
  clearTraffic();
  clearEncounter();
  resetCustoms();
  G.origin.set(0, 0, 0);
  buildStations(G.system);
  applySystemSky(G.system);
  G.navTarget = 0;
  G.lock = null;
  G.dockCandidate = null;
  const p = G.profile;
  if (p) {
    if (!p.visited.includes(id)) p.visited.push(id);
    // Time has passed for markets you have seen here before
    G.stations.forEach((s, i) => { if (p.markets[id + ':' + i]) rerollMarket(s.def, marketFor(p, id, i, s.def)); });
  }
  missionsOnEnterSystem();
  storyOnEnterSystem();
}

// Hyperspace exit point: 2.5 km from the main station, facing it.
export function placeArrival() {
  const st = G.stations[0];
  const a = Math.random() * Math.PI * 2;
  v.set(Math.cos(a), (Math.random() - 0.5) * 0.2, Math.sin(a)).normalize();
  G.ship.position.copy(st.pos).addScaledVector(v, 2500);
  lookQuat(v.negate(), up, G.ship.quaternion);
  resetFlight();
  G.player.speed = 40;
  populateAsteroids(Math.round(16 * G.system.rocks));
  snapCamera();
}

// Same, but parked just outside a station (menu backdrop).
export function placeNear(index, dist) {
  const st = G.stations[index];
  v.set(0, 0, 1).applyQuaternion(st.group.quaternion);
  G.ship.position.copy(st.pos).addScaledVector(v, dist);
  lookQuat(v.clone().negate(), up, G.ship.quaternion);
  snapCamera();
}

export function canReach(target) {
  const p = G.profile;
  return hasHyper(p) && target != null && target !== G.systemId && systemDist(G.systemId, target) <= Math.min(hyperRange(p), p.fuel) + 1e-6;
}

export function toggleHyper() {
  if (G.hyper) { G.hyper = null; toast('Sprung abgebrochen'); return; }
  const p = G.profile;
  if (G.mode !== 'flight' || p.hyperTarget == null) return;
  if (!hasHyper(p)) { toast('Kein Hyperantrieb – in der Werft kaufen'); sfxDeny(); return; }
  const dist = systemDist(G.systemId, p.hyperTarget);
  if (dist > p.fuel) { toast('Zu wenig Treibstoff'); sfxDeny(); return; }
  if (nearestStation(G.ship.position).d < HYPER.masslock) { toast('Massesperre: Station zu nah'); sfxDeny(); return; }
  G.hyper = { phase: 'charge', t: HYPER.countdown, target: p.hyperTarget, dist, arrived: false };
  showBanner(`HYPERSPRUNG ${HYPER.countdown}`, 0.9);
  sfxTick();
}

export function updateHyper(dt) {
  const h = G.hyper;
  if (!h) return;
  if (G.mode === 'dead' || G.mode === 'docked' || G.mode === 'docking') { G.hyper = null; return; }
  if (h.phase === 'charge') {
    const before = Math.ceil(h.t);
    h.t -= dt;
    const now = Math.ceil(h.t);
    if (now !== before && now > 0) { showBanner(`HYPERSPRUNG ${now}`, 0.9); sfxTick(); }
    if (h.t <= 0) {
      dropCruise();
      G.profile.fuel = Math.max(0, G.profile.fuel - h.dist);
      h.phase = 'tunnel';
      h.t = HYPER.tunnel;
      G.mode = 'hyper';
      sfxHyper();
    }
    return;
  }
  h.t -= dt;
  if (!h.arrived && h.t <= HYPER.tunnel * 0.5) {
    h.arrived = true;
    enterSystem(h.target);
    placeArrival();
    G.profile.hyperTarget = null;
  }
  if (h.t <= 0) {
    G.hyper = null;
    G.mode = 'flight';
    showBanner(G.system.name.toUpperCase(), 2.6);
    // Dangerous systems may greet you with an ambush
    resetPirateTimer(Math.random() < G.system.danger * 0.5 ? 6 + Math.random() * 6 : 30 + Math.random() * 30);
  }
}

// 0..1 progress of the tunnel, for the warp effect
export const tunnelProgress = () => (G.hyper && G.hyper.phase === 'tunnel' ? 1 - G.hyper.t / HYPER.tunnel : 0);
