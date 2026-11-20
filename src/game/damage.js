// Hull damage. While the shield holds, hits only drain the shield. Once it is empty they
// wear down the hull (profile.hull, 1 = intact, 0 = lost): the canopy gets scratched, the
// scanner flickers, the engine sputters and a warning tone sounds. Only when the hull gives
// out is the ship destroyed. The damage stays on the ship until a shipyard repairs it.
import { G } from '../ctx.js';
import { HULL } from '../config.js';
import { shipDef } from './save.js';
import { rules } from './difficulty.js';
import { sfxAlarm, sfxSputter, sfxWarn } from '../core/audio.js';
import { showBanner, toast } from '../ui/hud.js';

// With hull damage switched off in the settings the hull always counts as intact
export const damageOn = () => rules().damage !== false;
// Ejecting and the game over only from difficulty Normal up (Björn: too hard for Leicht)
export const gameOverOn = () => damageOn() && rules().gameOver !== false && G.settings.difficulty !== 'easy';
export const hullOf = p => damageOn() ? Math.max(0, Math.min(1, p?.hull ?? 1)) : 1;
export const wearOf = p => 1 - hullOf(p);
// Shown as a whole percentage; a scratched hull never reads 100 %
export const hullPct = p => { const h = hullOf(p); return h >= 1 ? 100 : Math.min(99, Math.ceil(h * 100)); };
// Coarse steps, so the ship's marks are only rebuilt now and then
export const wearStep = p => Math.ceil(wearOf(p) * 12);

let hitT = 0, alarmT = 0;

// Damage that got through the shield. Returns true when the hull is gone.
export function hullHit(amount) {
  const p = G.profile, before = wearOf(p);
  p.hull = Math.max(0, hullOf(p) - amount / shipDef(p).hull);
  const w = wearOf(p);
  if (p.hull <= 0) return true;
  const crossed = lvl => before < lvl && w >= lvl;
  if (before <= 0) showBanner('HÜLLE GETROFFEN', 1.6);
  else if (crossed(HULL.critical)) showBanner('HÜLLE KRITISCH · AUSSTEIGEN?', 2.2);
  if (crossed(HULL.radar)) toast('Scanner beschädigt');
  if (crossed(HULL.engine)) toast('Triebwerk beschädigt');
  if (hitT <= 0) { sfxAlarm(); hitT = 1.4; alarmT = 2.5; }
  return false;
}

/* ---------- Effects, ticked while flying ---------- */
const radar = { off: false, t: 2, jitter: 0 };
const engine = { cut: false, t: 3, k: 1, cough: 0 };
const rnd = (a, b) => a + Math.random() * (b - a);

export function updateDamage(dt) {
  hitT -= dt;
  const w = G.profile ? wearOf(G.profile) : 0;
  // Steady warning tone once the hull is critical
  if (w >= HULL.critical && (alarmT -= dt) <= 0) { sfxWarn(); alarmT = 2.4; }
  // Scanner: drops out now and then, contacts jitter
  if (w < HULL.radar) { radar.off = false; radar.jitter = 0; }
  else {
    const k = (w - HULL.radar) / (1 - HULL.radar);
    radar.jitter = 0.5 + k * 3.5;
    if ((radar.t -= dt) <= 0) {
      radar.off = !radar.off;
      radar.t = radar.off ? rnd(0.08, 0.3) + k * 0.6 : rnd(0.6, 3.5) * (1 - k * 0.7);
    }
  }
  // Engine: coughs, the thrust drops for a moment
  if (w < HULL.engine) { engine.cut = false; engine.k = 1; return; }
  const k = (w - HULL.engine) / (1 - HULL.engine);
  if ((engine.t -= dt) <= 0) {
    engine.cut = !engine.cut;
    engine.t = engine.cut ? rnd(0.2, 0.5) + k * 0.5 : rnd(1.5, 5) * (1 - k * 0.6);
    if (engine.cut) sfxSputter();
  }
  if (!engine.cut) { engine.k = Math.min(1, engine.k + dt * 3); return; }
  if ((engine.cough -= dt) <= 0) {
    engine.cough = rnd(0.05, 0.12);
    engine.k = rnd(0.1, 0.5);
    if (Math.random() < 0.25) sfxSputter(0.5);
  }
}

// Thrust share the engine delivers right now (1 = fine)
export const engineFactor = () => engine.k;
export const engineCut = () => engine.cut;
// { off: scanner blacked out, jitter: contact shake in px }
export const radarState = () => radar;

export function resetDamageFx() {
  radar.off = false; radar.t = 2;
  engine.cut = false; engine.k = 1; engine.t = 3;
  hitT = 0; alarmT = 0;
}

/* ---------- Shipyard ---------- */
// Price of a full repair from a wrecked hull: a share of the ship's price
const perWear = p => shipDef(p).price * HULL.repair * rules().yard;
export const repairCost = p => Math.ceil(wearOf(p) * perWear(p) - 1e-9);
// What a full repair costs, and how much of it the player can afford right now
export function repairQuote(p) {
  const need = wearOf(p), w = Math.min(need, p.credits / perWear(p));
  return { need, w, cost: Math.ceil(w * perWear(p) - 1e-9) };
}
export function repairHull(p) {
  const q = repairQuote(p);
  if (q.need <= 0 || q.w <= 0) return 0;
  p.hull = Math.min(1, hullOf(p) + q.w);
  if (1 - p.hull < 1e-6) p.hull = 1;
  p.credits = Math.max(0, p.credits - q.cost);
  return q.cost;
}
