// Target lock: tap an object on screen (pirate, station, asteroid, canister)
// to mark it. Missiles need a locked pirate; the targeting computer turns
// the ship toward whatever is locked.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { LOCK, LASER, RAIL } from '../config.js';
import { toast } from '../ui/hud.js';
import { sfxClick, sfxDeny } from '../core/audio.js';

const ndc = new THREE.Vector3(), cs = new THREE.Vector3(), aim = new THREE.Vector3(), inv = new THREE.Quaternion();
const LIST = { enemy: () => G.enemies, rock: () => G.asteroids, pickup: () => G.pickups, station: () => G.stations };

export function lockValid() {
  const l = G.lock;
  if (!l) return false;
  if (!LIST[l.kind]().includes(l.obj)) { G.lock = null; G.player.align = false; return false; }
  return true;
}

export function lockLabel(l = G.lock) {
  if (!l) return '';
  if (l.kind === 'enemy') return l.obj.name || 'Pirat';
  if (l.kind === 'station') return l.obj.def.name;
  if (l.kind === 'rock') return 'Asteroid';
  return 'Frachtbehälter';
}

function candidates() {
  const out = [];
  const near = (pos, max) => pos.distanceTo(G.ship.position) < max;
  for (const e of G.enemies) out.push({ kind: 'enemy', obj: e, bonus: 1.4 });
  for (const st of G.stations) out.push({ kind: 'station', obj: st, bonus: 1 });
  for (const p of G.pickups) if (near(p.pos, 400)) out.push({ kind: 'pickup', obj: p, bonus: 1.1 });
  for (const a of G.asteroids) if (near(a.pos, LOCK.rockRange)) out.push({ kind: 'rock', obj: a, bonus: 0.8 });
  return out;
}

// Screen position of a world point, or null when behind the camera
function toScreen(pos) {
  cs.copy(pos).applyMatrix4(G.camera.matrixWorldInverse);
  if (cs.z >= 0) return null;
  ndc.copy(pos).project(G.camera);
  return { x: (ndc.x + 1) / 2 * innerWidth, y: (1 - ndc.y) / 2 * innerHeight, d: -cs.z };
}

function pickAt(x, y) {
  let best = null, bestScore = Infinity;
  for (const c of candidates()) {
    const s = toScreen(c.obj.pos);
    if (!s) continue;
    // Big things close by cover more screen, so they are easier to hit
    const r = c.obj.radius || c.obj.r || 2;
    const size = r / s.d * innerHeight;
    const dist = Math.hypot(s.x - x, s.y - y) - size;
    if (dist > LOCK.pickRadius) continue;
    const score = dist / c.bonus;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function setLock(c) {
  G.lock = c ? { kind: c.kind, obj: c.obj } : null;
  if (!c) G.player.align = false;
}

// Tap on the screen
export function tapTarget(x, y) {
  if (G.mode !== 'flight') return;
  const c = pickAt(x, y);
  if (c) { setLock(c); toast(`Ziel: ${lockLabel()}`); sfxClick(); }
  else if (G.lock) { setLock(null); toast('Ziel gelöst'); }
}

// Keyboard: lock whatever is closest to the crosshair
export function lockAhead() {
  if (G.mode !== 'flight') return;
  const c = pickAt(innerWidth / 2, innerHeight / 2) || pickNearestEnemy();
  if (c) { setLock(c); toast(`Ziel: ${lockLabel()}`); sfxClick(); } else { toast('Kein Ziel vor dem Bug'); sfxDeny(); }
}
function pickNearestEnemy() {
  let best = null, bd = Infinity;
  for (const e of G.enemies) { const d = e.pos.distanceTo(G.ship.position); if (d < bd) { bd = d; best = { kind: 'enemy', obj: e }; } }
  return best;
}

export function toggleAlign() {
  const P = G.player;
  if (G.mode !== 'flight') return;
  if (!G.profile.upgrades.aim) { toast('Zielcomputer in der Werft kaufen'); sfxDeny(); return; }
  if (!lockValid()) { toast('Erst ein Ziel antippen'); sfxDeny(); return; }
  P.align = !P.align;
  toast(P.align ? `Ausrichten auf ${lockLabel()}` : 'Ausrichten aus');
  sfxClick();
}

// While aligning, steer pitch and yaw toward the target unless the pilot steers.
// Pirates are led by the laser flight time so the bolts meet them.
export function alignInput(inp) {
  const P = G.player;
  if (!P.align || !lockValid()) return;
  const l = G.lock, ship = G.ship;
  aim.copy(l.obj.pos);
  const shotSpeed = { laser: LASER.speed, rail: RAIL.speed }[G.profile.weapon];
  if (l.kind === 'enemy' && shotSpeed) {
    const t = aim.distanceTo(ship.position) / shotSpeed;
    aim.addScaledVector(l.obj.vel, t).addScaledVector(P.vel, -t);
  }
  aim.sub(ship.position).applyQuaternion(inv.copy(ship.quaternion).invert());
  const pitch = Math.atan2(aim.y, -aim.z), yaw = Math.atan2(-aim.x, -aim.z);
  const c = v => Math.max(-1, Math.min(1, v));
  if (Math.abs(inp.pitch) < 0.08) inp.pitch = c(pitch * 2.5);
  if (Math.abs(inp.yaw) < 0.08) inp.yaw = c(yaw * 2.5);
}
