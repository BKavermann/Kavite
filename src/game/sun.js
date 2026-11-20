// Flying close to the sun (G.star, placed by world/sky.js). Inside the corona the hull heats up;
// with a fuel scoop the hyperdrive tank fills, fastest close to the surface where it is hottest.
// Above the critical temperature the shield burns away, at the surface the ship is lost.
// All distances are in star radii (SUN in config.js).
import { G } from '../ctx.js';
import { SUN } from '../config.js';
import { hasHyper, hyperRange } from './save.js';
import { hurtPlayer } from '../entities/player.js';
import { toast, showBanner } from '../ui/hud.js';
import { sfxChime, sfxDeny } from '../core/audio.js';
import { clamp } from '../utils.js';

let warnT = 0, burnAcc = 0, burnT = 0, inZone = false, hinted = false;

// Distance from the sun's centre in star radii
export const sunDist = pos => (G.star ? pos.distanceTo(G.star.pos) / G.star.R : Infinity);

export function sunNavPoint() {
  const S = G.star;
  return S ? { kind: 'star', name: 'Sonne', pos: S.pos, hex: S.hex, r: S.R } : null;
}

export function updateSun(dt) {
  const P = G.player, p = G.profile;
  if (!G.star || !p) return;
  if (G.mode !== 'flight') {
    P.scooping = false;
    P.temp = Math.max(0, P.temp - SUN.coolDown * dt);
    return;
  }
  const x = sunDist(G.ship.position);
  P.sunDist = x;
  if (x < SUN.burn) {
    showBanner('IN DER SONNE VERGLÜHT', 3);
    P.invuln = 0;
    hurtPlayer(9999, true);
    return;
  }

  // Hull temperature follows the depth in the corona, a bit slowly
  const depth = clamp((SUN.hot - x) / (SUN.hot - SUN.burn), 0, 1);
  const target = depth * SUN.maxTemp * G.star.heat;
  P.temp = target > P.temp ? Math.min(target, P.temp + SUN.heatUp * dt) : Math.max(target, P.temp - SUN.coolDown * dt);
  warnT -= dt;
  if (P.temp > 1) {
    burnAcc += SUN.dps * (0.5 + (P.temp - 1) * 4) * dt;
    if ((burnT -= dt) <= 0) { hurtPlayer(burnAcc, false); burnAcc = 0; burnT = 0.5; }
    if (warnT <= 0) { showBanner('HITZE KRITISCH', 1.4); sfxDeny(); warnT = 2.5; }
  } else {
    burnAcc = 0;
    if (P.temp > 0.75 && warnT <= 0) { toast('Temperatur hoch – mehr Abstand zur Sonne'); warnT = 5; }
  }

  // Scooping
  const k = clamp((SUN.scoop - x) / (SUN.scoop - SUN.best), 0, 1);
  P.scooping = false;
  if (k <= 0) { inZone = false; if (x > SUN.masslock * 1.2) hinted = false; return; }
  if (!p.upgrades.scoop || !hasHyper(p)) {
    if (!hinted) {
      hinted = true;
      toast(!hasHyper(p) ? 'Ohne Hyperantrieb gibt es keinen Tank zum Füllen' : 'Ohne Treibstoffsammler kein Schöpfen (Werft)');
    }
    return;
  }
  const cap = hyperRange(p);
  if (p.fuel >= cap - 1e-6) {
    if (!inZone) { inZone = true; toast('Tank schon voll'); }
    return;
  }
  if (!inZone) { inZone = true; showBanner('TREIBSTOFF WIRD GESCHÖPFT', 1.8); }
  p.fuel = Math.min(cap, p.fuel + cap * SUN.scoopRate * k * k * dt);
  P.scooping = true;
  if (p.fuel >= cap - 1e-6) { toast('Tank voll – Abstand zur Sonne gewinnen'); sfxChime(); }
}
