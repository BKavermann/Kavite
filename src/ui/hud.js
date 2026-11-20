import * as THREE from 'three';
import { G } from '../ctx.js';
import { CRUISE, LASER_HEAT, LAW, HULL } from '../config.js';
import { bounty, legalStatus, scanProgress } from '../game/law.js';
import { contrabandAboard } from '../game/economy.js';
import { capacity, cargoUsed, maxShield, maxAmmo, shipDef } from '../game/save.js';
import { SYSTEMS, systemDist } from '../game/galaxy.js';
import { fmt, fmtDist, fmtLY } from '../utils.js';
import { currentNav, navLabel } from '../game/nav.js';
import { WEAPON_NAME, weaponAmmo } from '../entities/weapons.js';
import { lockValid } from '../game/targeting.js';
import { hullOf, hullPct, damageOn, gameOverOn } from '../game/damage.js';
import { ejectPending } from '../entities/player.js';

const $ = id => document.getElementById(id);
let hintedStation = null;
let els = null, bannerT = 0, toastT = 0, commsT = 0, slowT = 0, lastMode = '';
const last = {};
const aim = new THREE.Vector3();

export function initHud() {
  els = {
    credits: $('credits'), shieldBar: $('shieldBar'), shield: $('shieldBar').firstElementChild, shieldNum: $('shieldNum'),
    hullBar: $('hullBar'), hull: $('hullBar').firstElementChild, hullNum: $('hullNum'),
    speed: $('speedBar').firstElementChild, speedBar: $('speedBar'), heat: $('heatBar').firstElementChild, heatBar: $('heatBar'), tempRow: $('tempRow'), tempBar: $('tempBar'), temp: $('tempBar').firstElementChild, cargo: $('cargo'), fuel: $('fuel'), ammo: $('ammo'),
    foes: $('foes'), law: $('law'), lawRow: $('lawRow'), nav: $('navBtn'), hyper: $('hyperBtn'), cruise: $('cruiseBtn'),
    weapon: $('weaponBtn'), rear: $('rearBtn'), align: $('alignBtn'), eject: $('ejectBtn'),
    dock: $('dockBtn'), toast: $('toast'), banner: $('banner'), comms: $('comms'),
    flash: $('flash'), cross: $('cross'),
  };
}

const setText = (key, el, text) => { if (last[key] !== text) { el.textContent = text; last[key] = text; } };

export function updateHud(dt) {
  if (G.mode !== lastMode) { document.body.dataset.mode = G.mode; lastMode = G.mode; }
  if (bannerT > 0 && (bannerT -= dt) <= 0) els.banner.classList.remove('show');
  if (toastT > 0 && (toastT -= dt) <= 0) els.toast.classList.remove('show');
  if (commsT > 0 && (commsT -= dt) <= 0) els.comms.classList.remove('show');
  const p = G.profile, P = G.player;
  if (!p || (G.mode !== 'flight' && G.mode !== 'docking')) return;

  setText('cr', els.credits, fmt(p.credits) + ' Cr');
  const ms = maxShield(p);
  els.shield.style.width = (Math.max(0, P.shield) / ms * 100).toFixed(1) + '%';
  els.shieldBar.classList.toggle('low', P.shield < ms * 0.3);
  setText('sh', els.shieldNum, Math.ceil(Math.max(0, P.shield) / ms * 100) + ' %');
  els.shieldNum.classList.toggle('low', P.shield < ms * 0.3);
  // Hull: only goes down once the shield is gone, repaired at a shipyard
  const hull = hullOf(p), crit = 1 - hull >= HULL.critical;
  els.hull.style.width = (hull * 100).toFixed(1) + '%';
  els.hullBar.classList.toggle('dmg', hull < 1 && !crit);
  els.hullBar.classList.toggle('crit', crit);
  setText('hull', els.hullNum, hullPct(p) + ' %');
  els.hullNum.classList.toggle('dmg', hull < 1 && !crit);
  els.hullNum.classList.toggle('low', crit);
  // Escape pod, only with a damaged hull; the second tap within 3 s gives the ship up
  els.eject.hidden = hull >= 1 || G.mode !== 'flight' || !gameOverOn();
  els.hullBar.parentElement.hidden = !damageOn();
  const armed = ejectPending();
  els.eject.classList.toggle('armed', armed);
  setText('ej', els.eject, armed ? 'Wirklich aussteigen?' : 'Aussteigen');
  const s = P.cruise ? P.cruiseSpeed / CRUISE.speed : P.speed >= 0 ? P.speed / shipDef(p).flight.maxSpeed : P.speed / shipDef(p).flight.minSpeed;
  els.speed.style.width = (Math.abs(s) * 100).toFixed(1) + '%';
  els.speed.classList.toggle('rev', !P.cruise && P.speed < 0);
  els.speedBar.classList.toggle('cruise', P.cruise);
  els.heat.style.width = (P.heat * 100).toFixed(1) + '%';
  els.heatBar.classList.toggle('hot', P.heat >= LASER_HEAT.warn && !P.overheat);
  els.heatBar.classList.toggle('over', P.overheat);
  // Hull temperature, only near a sun
  els.tempRow.hidden = P.temp < 0.02;
  els.temp.style.width = (Math.min(1, P.temp) * 100).toFixed(1) + '%';
  els.tempBar.classList.toggle('hot', P.temp >= 0.75 && P.temp <= 1);
  els.tempBar.classList.toggle('over', P.temp > 1);
  const used = cargoUsed(p), cap = capacity(p);
  setText('cargo', els.cargo, `${used}/${cap} t`);
  els.cargo.classList.toggle('full', used >= cap);
  setText('ammo', els.ammo, `${p.ammo}/${maxAmmo(p)}`);
  els.ammo.classList.toggle('full', p.ammo < 60);

  if ((slowT -= dt) <= 0) {
    slowT = 0.2;
    setText('fuel', els.fuel, fmtLY(p.fuel));
    els.fuel.classList.toggle('full', p.fuel < 1 && !P.scooping);
    els.fuel.classList.toggle('scoop', P.scooping);
    const b = bounty(), sc = scanProgress(), contra = contrabandAboard(p, G.system).length > 0;
    els.lawRow.hidden = b <= 0 && sc < 0 && !contra;
    setText('law', els.law, sc >= 0 ? `Zollscan ${Math.round(sc * 100)} %` : b > 0 ? `${legalStatus(b)} · ${b} Cr` : 'Schmuggelware an Bord');
    els.law.classList.toggle('full', b >= LAW.fugitive || sc >= 0);
    els.law.classList.toggle('warn', b <= 0 && sc < 0 && contra);
    const cops = G.enemies.filter(e => e.police).length, n = G.enemies.length - cops;
    setText('foes', els.foes, [n && `${n} Pirat${n > 1 ? 'en' : ''}`, cops && `${cops} Polizei`].filter(Boolean).join(' · '));
    const t = currentNav();
    if (t) {
      const d = Math.max(0, t.pos.distanceTo(G.ship.position) - t.r);
      setText('nav', els.nav, `▸ ${navLabel(t)} · ${fmtDist(d)}`);
      els.nav.style.setProperty('--tint', t.hex);
    }
    // Hyperjump button: target name, or the countdown with a cancel option
    if (G.hyper && G.hyper.phase === 'charge') {
      setText('hyper', els.hyper, `Abbrechen · ${Math.ceil(G.hyper.t)}`);
      els.hyper.hidden = false;
    } else if (p.hyperTarget != null) {
      setText('hyper', els.hyper, `⇢ ${SYSTEMS[p.hyperTarget].name} · ${fmtLY(systemDist(G.systemId, p.hyperTarget))}`);
      els.hyper.hidden = false;
    } else els.hyper.hidden = true;
    const back = G.mode === 'flight' && !!P.lookBack;
    setText('weapon', els.weapon, back ? (p.upgrades.rear ? `Hecklaser · ${p.ammo}` : 'Heck · keine Waffe') : `${WEAPON_NAME[p.weapon] || 'Laser'} · ${weaponAmmo(p)}`);
    els.rear.classList.toggle('on', back);
    els.rear.setAttribute('aria-pressed', back);
    els.align.hidden = !(p.upgrades.aim && lockValid());
    els.align.classList.toggle('on', !!P.align);
    els.cruise.classList.toggle('on', P.cruise);
    setText('cruise', els.cruise, P.cruise ? 'Reise aus' : 'Reise');
  }
  // Docking button only with a docking computer; without one, a hint once per approach
  els.dock.hidden = !(G.mode === 'flight' && G.dockCandidate && p.upgrades.dock);
  if (G.dockCandidate && !p.upgrades.dock && G.dockCandidate !== hintedStation) {
    hintedStation = G.dockCandidate;
    toast('Ohne Andockcomputer: langsam durch den Schlitz fliegen');
  }

  // Crosshair: screen centre in the cockpit, projected aim point outside
  if (G.settings.view === 'chase') {
    aim.copy(P.fwd).multiplyScalar(160).add(G.ship.position).project(G.camera);
    els.cross.style.left = ((aim.x + 1) / 2 * innerWidth).toFixed(1) + 'px';
    els.cross.style.top = ((1 - aim.y) / 2 * innerHeight).toFixed(1) + 'px';
  } else {
    els.cross.style.left = '50%';
    els.cross.style.top = '50%';
  }
}

export function showBanner(text, dur = 2.2) {
  els.banner.textContent = text;
  els.banner.classList.add('show');
  bannerT = dur;
}

// Radio message: sender and text, shown for a few seconds below the toast
export function comms(from, text, dur = 7) {
  if (!els) return;
  els.comms.querySelector('b').textContent = from;
  els.comms.querySelector('p').textContent = text;
  els.comms.classList.add('show');
  commsT = dur;
}

export function hideComms() { if (els) { els.comms.classList.remove('show'); commsT = 0; } }

export function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  toastT = 2.4;
}

export function flash(strong) {
  els.flash.style.opacity = strong ? 0.75 : 0.4;
  setTimeout(() => { els.flash.style.opacity = 0; }, strong ? 90 : 60);
}

export function hitMarker() {
  const c = els.cross;
  c.classList.remove('hit');
  void c.offsetWidth;
  c.classList.add('hit');
}
