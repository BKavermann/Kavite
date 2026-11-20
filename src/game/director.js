// Keeps the local asteroid field topped up and sends pirates now and then.
// Pirates come more often in dangerous systems and the richer you are.
// While cruising they can pull you out of the cruise drive (interdiction).
import * as THREE from 'three';
import { G } from '../ctx.js';
import { ROCK_TARGET, SAFE_RADIUS, PIRATE_AMOUNT } from '../config.js';
import { asteroidWeight, spawnAsteroid, removeAsteroid } from '../world/asteroids.js';
import { spawnPirateGroup } from '../entities/enemies.js';
import { dropCruise } from '../entities/player.js';
import { nearestStation } from '../world/station.js';
import { cargoValue } from './economy.js';
import { chaseFactor } from './missions.js';
import { difficulty } from './difficulty.js';
import { rankOf } from './save.js';
import { showBanner } from '../ui/hud.js';
import { sfxAlarm } from '../core/audio.js';
import { sunDist } from './sun.js';

let rockT = 0, pirateT = 40;
const v = new THREE.Vector3();

export function resetPirateTimer(t = 35) { pirateT = t; }

export function threat() {
  const p = G.profile;
  if (!p) return 0;
  return Math.min(1, (p.credits + cargoValue(p) + p.kills * 150) / 6000);
}

const danger = () => (G.system ? G.system.danger : 0.3);

export function updateDirector(dt) {
  const P = G.player;
  rockT -= dt;
  if (rockT <= 0 && !P.cruise && G.mode !== 'hyper' && sunDist(G.ship.position) > 2.2) {   // no rocks in the corona
    rockT = 0.3;
    const target = ROCK_TARGET * (G.system ? G.system.rocks : 1);
    const w = asteroidWeight();
    const n = w < target * 0.5 ? 4 : w < target ? 1 : 0;   // refill fast after a drop
    for (let i = 0; i < n; i++) spawnRockAway();
  }
  if (G.mode !== 'flight') return;
  if (nearestStation(G.ship.position).d < SAFE_RADIUS + 60) return;
  const amt = PIRATE_AMOUNT[G.settings.pirateAmount] || PIRATE_AMOUNT[3];
  pirateT -= dt * (P.cruise ? 0.6 : 1) * (1 + chaseFactor()) * difficulty().rate * amt.rate;
  if (pirateT > 0) return;

  const t = threat(), dg = danger();
  const veteran = G.profile && rankOf(G.profile).index >= 6 ? 0.2 : 0;   // from Kommodore on the pirates send better pilots
  pirateT = (45 + Math.random() * 45) * (1.4 - dg * 0.8) - t * 20;
  const cap = Math.max(1, Math.round(difficulty().max * amt.max));
  if (G.enemies.length >= cap) return;
  let count = 1 + (Math.random() < t + dg * 0.3 ? 1 : 0) + (Math.random() < (t + dg) * 0.35 ? 1 : 0) + (Math.random() < amt.extra ? 1 : 0) + (Math.random() < amt.extra - 0.5 ? 1 : 0);
  count = Math.max(1, Math.min(count, cap - G.enemies.length));
  if (P.cruise) {
    dropCruise();
    spawnPirateGroup(count, Math.min(1.2, t + dg * 0.3 + veteran), 180);
    // Mark the leader so its marker shows where the attack comes from
    if (!G.lock) G.lock = { kind: 'enemy', obj: G.enemies[G.enemies.length - count] };
    showBanner('ABGEFANGEN');
  } else {
    spawnPirateGroup(count, Math.min(1.2, t + dg * 0.3 + veteran));
    showBanner('KONTAKT');
  }
  sfxAlarm();
}

function spawnRockAway() {
  for (let tries = 0; tries < 6; tries++) {
    v.randomDirection().multiplyScalar(320 + Math.random() * 60).add(G.ship.position);
    const ns = nearestStation(v);
    if (ns.st && ns.d < ns.st.radius * 2.5) continue;
    spawnAsteroid(0, v);
    return;
  }
}

export function clearNearby(pos, radius) {
  for (let i = G.asteroids.length - 1; i >= 0; i--) {
    const a = G.asteroids[i];
    if (a.pos.distanceTo(pos) < radius + a.r) removeAsteroid(a);
  }
}
