// Docking: manual (fly through the slot), or the docking computer that
// takes over once you are slow and lined up in the approach corridor.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { STATION_RAM } from '../config.js';
import { slotDir, stationUp, stationHit, SLOT_W, SLOT_H } from '../world/station.js';
import { rerollMarket } from './economy.js';
import { saveProfile, maxShield, marketFor } from './save.js';
import { missionsOnDocked } from './missions.js';
import { storyOnDocked } from './story.js';
import { clearEnemies } from '../entities/enemies.js';
import { clearBolts, hurtPlayer, resetFlight, snapCamera } from '../entities/player.js';
import { clearNearby } from './director.js';
import { isFugitive, customsUndock } from './law.js';
import { showBanner, toast } from '../ui/hud.js';
import { sfxChime, sfxDeny } from '../core/audio.js';
import { lookQuat, ease, clamp } from '../utils.js';

const local = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3();
const targetQ = new THREE.Quaternion(), entry = new THREE.Vector3(), inside = new THREE.Vector3();
const safe = new THREE.Vector3();       // last ship position outside every hull
let auto = null, dockCd = 0;

export function updateDockingChecks(dt) {
  dockCd -= dt;
  G.dockCandidate = null;
  const ship = G.ship, P = G.player;
  let hit = false;
  for (const st of G.stations) {
    local.copy(ship.position);
    st.group.worldToLocal(local);
    const S = st.S;
    const inSlot = local.z > S - 5 && local.z < S + 3 && Math.abs(local.x) < SLOT_W / 2 - 1 && Math.abs(local.y) < SLOT_H / 2 + 0.6;
    if (inSlot && dockCd <= 0) { completeDock(st); return; }

    // Hull collision (the slot mouth is open): back to the last free spot, knocked outward
    if (stationHit(st, ship.position, 1.5) && !(local.z > S - 6 && Math.abs(local.x) < SLOT_W / 2 && Math.abs(local.y) < SLOT_H / 2 + 1)) {
      const impact = Math.abs(P.speed) + P.knock.length() * 0.3;
      if (safe.distanceTo(ship.position) < 40) ship.position.copy(safe);
      dir.subVectors(ship.position, st.pos).normalize();
      if (stationHit(st, ship.position, 1.5)) ship.position.copy(st.pos).addScaledVector(dir, st.radius + 0.5);
      hit = true;
      P.knock.addScaledVector(dir, 40);
      P.grav.multiplyScalar(0.2);
      P.speed *= 0.2;
      // The bigger the bang, the more it hurts; half of it goes through the shield into the hull
      if (P.invuln <= 0) { P.invuln = 0.8; hurtPlayer(STATION_RAM.base + impact * STATION_RAM.perSpeed, true, STATION_RAM.pierce); }
      continue;
    }

    // Approach corridor: in front of the slot, inside a cone, slow, facing in
    const along = local.z - S;
    if (!P.cruise && along > 2 && along < 170 && Math.hypot(local.x, local.y) < along * 0.5 + 12 && Math.abs(P.speed) < 55) {
      slotDir(st, dir);
      if (P.fwd.dot(dir) < -0.75) G.dockCandidate = st;
    }
  }
  if (!hit) safe.copy(ship.position);
}

export function requestDock() {
  if (G.mode !== 'flight' || !G.dockCandidate) return;
  if (!G.profile.upgrades.dock) { toast('Kein Andockcomputer – selbst durch den Schlitz fliegen'); sfxDeny(); return; }
  if (isFugitive()) { refuse(); return; }
  const st = G.dockCandidate;
  auto = { st, phase: 0, t: 0, from: G.ship.position.clone(), fromQ: G.ship.quaternion.clone(), dur: 0 };
  slotDir(st, dir);
  entry.copy(st.pos).addScaledVector(dir, st.S + 30);
  auto.dur = clamp(entry.distanceTo(G.ship.position) / 35, 1.5, 4.5);
  G.mode = 'docking';
  G.dockCandidate = null;
  showBanner('ANDOCKCOMPUTER', 1.6);
}

export function updateAutoDock(dt) {
  if (!auto) return;
  const { st } = auto;
  slotDir(st, dir);
  stationUp(st, up);
  lookQuat(dir.clone().negate(), up, targetQ);
  entry.copy(st.pos).addScaledVector(dir, st.S + 30);
  inside.copy(st.pos).addScaledVector(dir, st.S * 0.4);
  auto.t += dt;
  if (auto.phase === 0) {
    const k = ease(Math.min(1, auto.t / auto.dur));
    G.ship.position.lerpVectors(auto.from, entry, k);
    G.ship.quaternion.slerpQuaternions(auto.fromQ, targetQ, k);
    if (auto.t >= auto.dur) { auto.phase = 1; auto.t = 0; }
  } else {
    const k = Math.min(1, auto.t / 1.6);
    G.ship.position.lerpVectors(entry, inside, k * k);
    G.ship.quaternion.copy(targetQ);
    if (k >= 1) completeDock(st);
  }
}

// Puts the ship into the station and opens the station screen.
// The station in the current system becomes the respawn point.
export function dockAt(index) {
  const st = G.stations[index];
  auto = null;
  G.mode = 'docked';
  G.dockCandidate = null;
  G.hyper = null;
  G.profile.system = G.systemId;
  G.profile.station = index;
  marketFor(G.profile, G.systemId, index, st.def);
  slotDir(st, dir);
  G.ship.position.copy(st.pos).addScaledVector(dir, st.S * 0.4);
  resetFlight();
  G.player.shield = maxShield(G.profile);
  clearEnemies();
  clearBolts();
  const msgs = [...missionsOnDocked(G.systemId, index), ...storyOnDocked(G.systemId, index)];
  saveProfile(G.profile);
  G.events.docked?.(st, msgs);
}

function completeDock(st) {
  if (isFugitive()) {
    // Refused: pushed back out of the slot
    auto = null;
    if (G.mode === 'docking') G.mode = 'flight';
    slotDir(st, dir);
    G.ship.position.copy(st.pos).addScaledVector(dir, st.S + 12);
    G.player.knock.copy(dir).multiplyScalar(30);
    G.player.speed = 0;
    dockCd = 3;
    refuse();
    return;
  }
  sfxChime();
  dockAt(st.index);
}

function refuse() {
  toast('Andocken verweigert: Du wirst gesucht (flüchtig)');
  showBanner('ANDOCKEN VERWEIGERT', 1.8);
  sfxDeny();
}

export function undock() {
  const st = G.stations[G.profile.station];
  G.stations.forEach((s, i) => rerollMarket(s.def, marketFor(G.profile, G.systemId, i, s.def)));
  slotDir(st, dir);
  stationUp(st, up);
  G.ship.position.copy(st.pos).addScaledVector(dir, st.S + 14);
  lookQuat(dir, up, G.ship.quaternion);
  resetFlight();
  G.player.speed = 25;
  G.player.invuln = 3;
  dockCd = 5;
  customsUndock(st);
  clearNearby(G.ship.position, 90);
  G.mode = 'flight';
  snapCamera();
  saveProfile(G.profile);
}
