import { SAVE_KEY, OLD_SAVE_KEY, SETTINGS_KEY, START_CREDITS, HYPER, AMMO, SHIPS, RANKS } from '../config.js';
import { createMarket, completeMarket } from './economy.js';
import { rules } from './difficulty.js';

// profile.system / profile.station: where the player last docked (respawn point).
export function newProfile() {
  return {
    v: 2,
    credits: rules().startCredits ?? START_CREDITS,
    cargo: {},
    upgrades: { hyper: 0, dock: 0, cargo: 0, magazine: 0, shield: 0, laser: 0, rail: 0, missile: 0, aim: 0, hold: 0, scoop: 0, cargoins: 0 },
    system: 0,
    station: 0,
    kills: 0,
    score: 0,            // rank points (see RANKS)
    ship: 'kestrel',     // id in SHIPS
    wanted: {},          // bounty on the player per system id
    caught: {},          // systems whose customs found contraband (seized at the next docking there)
    fuel: 0,             // the hyperdrive is bought at a shipyard and comes with a full tank
    ammo: AMMO.base,
    slugs: 0,            // railgun ammunition
    missiles: 0,
    weapon: 'laser',     // laser | rail | missile
    hyperTarget: null,
    visited: [0],
    markets: {},          // key "system:station"
    missions: [],         // accepted missions
    offers: {},           // mission boards, key "system:station"
    missionSeq: 0,
    playTime: 0,          // flight seconds, drives mission deadlines
    hull: 1,              // hull condition, 1 = intact (game/damage.js); repaired at a shipyard
  };
}

function migrateV1(old) {
  const p = newProfile();
  p.credits = old.credits ?? p.credits;
  p.cargo = old.cargo || {};
  p.upgrades = { ...p.upgrades, hyper: 1, ...old.upgrades };
  p.fuel = HYPER.ranges[0];
  p.kills = old.kills || 0;
  p.station = old.station === 1 ? 1 : 0;      // Kessel-Ring and Ferrum-Werft keep their slots
  return p;
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.v === 2) {
        p.missions ||= []; p.offers ||= {}; p.missionSeq ||= 0; p.playTime ||= 0;
        p.upgrades.hyper ??= 1;   // saves from before the drive was sold already have one
        p.upgrades.dock ??= 1;    // saves from before the docking computer was sold keep it
        p.slugs ||= 0; p.missiles ||= 0; p.weapon ||= 'laser'; if (p.weapon === 'rear') p.weapon = 'laser';   // 0.75 had the rear laser as a weapon choice
        p.ship ||= 'kestrel'; p.score ??= p.kills || 0; p.wanted ||= {}; p.caught ||= {}; p.upgrades.hold ||= 0; p.upgrades.scoop ||= 0; p.hull ??= 1;
        return p;
      }
    }
    const old = localStorage.getItem(OLD_SAVE_KEY);
    if (old) {
      const p = JSON.parse(old);
      if (p && p.v === 1) return migrateV1(p);
    }
  } catch (_) {}
  return null;
}

// Game over: the commander is gone
export function clearProfile() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_SAVE_KEY); } catch (_) {}
}

export function saveProfile(p) {
  if (p?.over) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch (_) {}
}

export function loadSettings(target) {
  try { Object.assign(target, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (_) {}
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (_) {}
}

export function marketFor(p, systemId, index, def) {
  const key = systemId + ':' + index;
  return p.markets[key] ? completeMarket(def, p.markets[key]) : (p.markets[key] = createMarket(def));
}

export const hasHyper = p => !!p.upgrades.hyper;
// Jump range (and tank size) of the installed drive class
export const hyperRange = p => p.upgrades.hyper ? HYPER.ranges[Math.min(p.upgrades.hyper, HYPER.ranges.length) - 1] : 0;
export const shipDef = p => SHIPS.find(s => s.id === p?.ship) || SHIPS[0];
export const capacity = p => shipDef(p).cargo + 10 * p.upgrades.cargo;
// Mission cargo (courier packages, stolen goods, a hidden passenger, recovered black boxes) takes hold space too
export const missionTons = p => (p.missions || []).reduce((s, m) =>
  s + (['courier', 'stolen', 'fugitive'].includes(m.type) ? m.tons : m.type === 'search' && m.collected ? 1 : 0), 0);
export const cargoUsed = p => Object.values(p.cargo).reduce((a, b) => a + b, 0) + missionTons(p);
export const maxShield = p => shipDef(p).shield + 40 * p.upgrades.shield;
export const shieldRegen = p => shipDef(p).regen + 1.5 * p.upgrades.shield;
// Combat rank from points: { index, name, next } (next = following rank or null)
export function rankOf(p) {
  let i = 0;
  while (i + 1 < RANKS.length && (p.score || 0) >= RANKS[i + 1].at) i++;
  return { index: i, name: RANKS[i].name, next: RANKS[i + 1] || null };
}
export const maxAmmo = p => AMMO.base + AMMO.perMagazine * (p.upgrades.magazine || 0);
