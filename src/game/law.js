// Criminal record, police and customs. Shooting traders, police or stations puts a bounty on
// the player in that system (profile.wanted[systemId]). While wanted, police ships launch
// from the nearest station; fugitives may not dock. The bounty fades with flight time.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { LAW, CUSTOMS } from '../config.js';
import { contrabandAboard, goodById } from './economy.js';
import { spawnEnemy } from '../entities/enemies.js';
import { nearestStation } from '../world/station.js';
import { toast, showBanner, comms } from '../ui/hud.js';
import { sfxAlarm } from '../core/audio.js';
import { hotMissions, markCaught, seizeCaught } from './missions.js';

let policeT = 0, toastT = 0;
const dir = new THREE.Vector3(), pos = new THREE.Vector3();

export const bounty = (sys = G.systemId) => Math.round(G.profile?.wanted?.[sys] || 0);
export const legalStatus = b => b <= 0 ? 'Sauber' : b < LAW.fugitive ? 'Straftäter' : 'Flüchtig';
export const isFugitive = () => bounty() >= LAW.fugitive;

export function commitCrime(amount, what) {
  const p = G.profile;
  if (!p || G.mode !== 'flight') return;
  const before = bounty();
  p.wanted[G.systemId] = (p.wanted[G.systemId] || 0) + amount;
  const after = bounty();
  if (before <= 0) {
    showBanner('GESUCHT', 1.8);
    sfxAlarm();
    policeT = Math.min(policeT, 3);
  } else if (before < LAW.fugitive && after >= LAW.fugitive) {
    showBanner('FLÜCHTIG', 1.8);
    sfxAlarm();
  }
  if (before <= 0 || toastT <= 0) { toast(`Straftat: ${what} · Kopfgeld ${after} Cr`); toastT = 2.5; }
}

// At the station: offenders pay their bounty as a fine; returns a line for the station note or ''
export function payFine() {
  const p = G.profile, b = bounty();
  if (b <= 0) return '';
  const paid = Math.min(p.credits, b);
  p.credits -= paid;
  const left = b - paid;
  if (left > 0) p.wanted[G.systemId] = left; else delete p.wanted[G.systemId];
  return left > 0 ? `Strafe ${paid} Cr bezahlt, ${left} Cr offen` : `Strafe ${paid} Cr bezahlt · Strafregister gelöscht`;
}

export function updateLaw(dt) {
  const p = G.profile;
  toastT -= dt;
  if (!p || G.mode !== 'flight') return;
  const b = p.wanted[G.systemId] || 0;
  if (b > 0) {
    const nb = b - LAW.decay * dt;
    if (nb <= 0) { delete p.wanted[G.systemId]; delete p.caught[G.systemId]; toast('Strafregister gelöscht: Du bist wieder sauber'); return; }
    p.wanted[G.systemId] = nb;
  } else return;

  // Police launch from the nearest station while you are within its range
  const ns = nearestStation(G.ship.position);
  if (!ns.st || ns.d > LAW.policeRange) return;
  if ((policeT -= dt) > 0) return;
  const max = LAW.policeMax[b >= LAW.fugitive ? 1 : 0];
  const have = G.enemies.filter(e => e.police).length;
  if (have >= max) return;
  policeT = LAW.policeEvery;
  dir.subVectors(G.ship.position, ns.st.pos).normalize();
  // Out of the station when it is close, otherwise from its direction a little way off
  if (ns.d > 600 && ns.d < 1200) pos.copy(ns.st.pos).addScaledVector(dir, ns.st.radius + 40);
  else pos.copy(G.ship.position).addScaledVector(dir.lengthSq() ? dir : dir.set(0, 0, 1), ns.d < 600 ? 350 : -450);
  const n = Math.min(max - have, b >= LAW.fugitive ? 2 : 1);
  for (let i = 0; i < n; i++) spawnEnemy(pos.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(14 * i)), 0.45, { police: true, hp: LAW.policeHp });
  showBanner('POLIZEI', 1.4);
  sfxAlarm();
}

/* ---------- Customs ---------- */
// Entering the zone around a station with banned cargo may start a scan. It runs for
// CUSTOMS.time seconds; flying off (or jumping) breaks it, docking completes it on the spot.
let scan = null;
const approached = new Set();

export const scanProgress = () => (scan ? Math.min(1, scan.t / CUSTOMS.time) : -1);
export const scanChance = (sys = G.system) => Math.max(0.1, CUSTOMS.chance - (sys?.danger || 0) * CUSTOMS.dangerCut);

export function resetCustoms() { scan = null; approached.clear(); }
// Leaving a station: no scan on the way out
export function customsUndock(st) { scan = null; approached.add(st); }

// The scan result: true when contraband was found (bounty added, goods marked for seizure)
function finishScan(atDock) {
  const p = G.profile, st = scan.st;
  scan = null;
  const found = contrabandAboard(p, G.system), hot = hotMissions(p, G.system);
  if (!found.length && !hot.length) return false;
  if (p.upgrades.hold && Math.random() < CUSTOMS.hide) {
    comms(`Zoll ${st.def.name}`, 'Scan abgeschlossen. Keine Beanstandung, gute Weiterreise.');
    return false;
  }
  // Stolen goods count like contraband by weight, a hidden fugitive weighs heavier
  const value = found.reduce((s, f) => s + goodById(f.id).base * f.q, 0)
    + hot.reduce((s, m) => s + (m.type === 'fugitive' ? 400 : m.tons * 150), 0);
  const names = [...new Set([...found.map(f => goodById(f.id).name),
    ...hot.map(m => m.type === 'fugitive' ? `gesuchte Person (${m.who})` : 'Diebesgut')])];
  const fugitive = hot.some(m => m.type === 'fugitive');
  const fine = Math.min(CUSTOMS.maxFine, Math.max(CUSTOMS.minFine, Math.round(value * CUSTOMS.fineRate)));
  p.caught[G.systemId] = true;
  if (hot.length) markCaught(G.systemId);
  if (atDock) p.wanted[G.systemId] = (p.wanted[G.systemId] || 0) + fine;
  else {
    commitCrime(fine, fugitive ? 'Fluchthilfe' : 'Schmuggel');
    showBanner(fugitive ? 'GESUCHTE PERSON AN BORD' : 'SCHMUGGELWARE ENTDECKT', 2.2);
    comms(`Zoll ${st.def.name}`, `Verbotene Ladung festgestellt: ${names.join(', ')}. Strafe ${fine} Cr. Beidrehen und andocken!`);
  }
  return true;
}

export function updateCustoms(dt) {
  const p = G.profile;
  if (!p || G.mode !== 'flight') return;
  const ns = nearestStation(G.ship.position);
  if (!ns.st) return;
  if (scan) {
    if (ns.st !== scan.st || ns.d > CUSTOMS.abort) {
      scan = null;
      toast('Zollscan abgebrochen');
      return;
    }
    if ((scan.t += dt) >= CUSTOMS.time) finishScan(false);
    return;
  }
  for (const st of approached) if (st.pos.distanceTo(G.ship.position) > CUSTOMS.abort) approached.delete(st);
  if (ns.d > CUSTOMS.range || approached.has(ns.st)) return;
  approached.add(ns.st);
  if ((!contrabandAboard(p, G.system).length && !hotMissions(p, G.system).length) || Math.random() > scanChance()) return;
  scan = { st: ns.st, t: 0 };
  showBanner('ZOLLSCAN', 1.6);
  comms(`Zoll ${ns.st.def.name}`, 'Routinekontrolle. Halten Sie Kurs, wir scannen Ihre Ladung.');
}

// When docking: a running scan finishes at the door, found contraband is seized.
// Returns a line for the station note or ''.
export function customsAtDock() {
  const p = G.profile;
  if (scan) finishScan(true);
  if (!p.caught[G.systemId]) return '';
  const found = contrabandAboard(p, G.system);
  delete p.caught[G.systemId];
  const lines = seizeCaught(G.systemId);
  for (const f of found) delete p.cargo[f.id];
  if (found.length) lines.unshift(`Zoll beschlagnahmt: ${found.map(f => `${f.q} t ${goodById(f.id).name}`).join(', ')}`);
  return lines.join(' · ');
}
