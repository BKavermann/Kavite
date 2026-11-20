// Screen markers: brackets around pirates, a diamond on the nav target,
// rings on nearby canisters, a spinning ring on the locked target,
// and edge arrows when targets are off-screen.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { fmtDist } from '../utils.js';
import { currentNav, navLabel } from '../game/nav.js';
import { visibleWrecks } from '../game/missions.js';
import { lockValid, lockLabel } from '../game/targeting.js';

const $ = id => document.getElementById(id);
const enemyMarks = [], pickupMarks = [];
let navMark, enemyArrow, navArrow, lockMark, lockArrow;
const cs = new THREE.Vector3(), ndc = new THREE.Vector3();
const proj = { on: false, sx: 0, sy: 0, d: 0, cx: 0, cy: 0 };

function make(cls, withLabel) {
  const el = document.createElement('div');
  el.className = cls;
  el.hidden = true;
  if (withLabel) el.appendChild(document.createElement('span'));
  $('marks').appendChild(el);
  return el;
}

export function initMarks() {
  for (let i = 0; i < 6; i++) enemyMarks.push(make('mark', true));
  for (let i = 0; i < 4; i++) pickupMarks.push(make('pmark', false));
  navMark = make('navmark', true);
  lockMark = make('lockmark', true);
  lockArrow = make('arrow lock', false);
  enemyArrow = $('enemyArrow');
  navArrow = $('navArrow');
}

function project(pos) {
  cs.copy(pos).applyMatrix4(G.camera.matrixWorldInverse);
  ndc.copy(pos).project(G.camera);
  proj.d = cs.length();
  proj.on = cs.z < 0 && Math.abs(ndc.x) < 0.98 && Math.abs(ndc.y) < 0.98;
  proj.sx = (ndc.x + 1) / 2 * innerWidth;
  proj.sy = (1 - ndc.y) / 2 * innerHeight;
  proj.cx = cs.x; proj.cy = -cs.y;
  if (Math.hypot(proj.cx, proj.cy) < 0.001) proj.cy = 1;   // dead astern: point down
  return proj;
}

function placeArrow(el, x, y) {
  const len = Math.hypot(x, y), dx = x / len, dy = y / len;
  const W = innerWidth, H = innerHeight, mx = W / 2 - 34, my = H / 2 - 74;
  const t = Math.min(mx / Math.max(1e-4, Math.abs(dx)), my / Math.max(1e-4, Math.abs(dy)));
  el.style.transform = `translate(${(W / 2 + dx * t).toFixed(1)}px,${(H / 2 + dy * t).toFixed(1)}px) rotate(${Math.atan2(dy, dx)}rad)`;
  el.hidden = false;
}

const hideAll = () => {
  enemyMarks.forEach(m => { m.hidden = true; });
  pickupMarks.forEach(m => { m.hidden = true; });
  navMark.hidden = enemyArrow.hidden = navArrow.hidden = lockMark.hidden = lockArrow.hidden = true;
};

export function updateMarks() {
  if (G.mode !== 'flight' && G.mode !== 'docking') { hideAll(); return; }

  let mi = 0, offX = 0, offY = 0, offD = Infinity;
  for (const e of G.enemies) {
    const r = project(e.pos);
    if (r.on) {
      if (mi >= enemyMarks.length) continue;
      const m = enemyMarks[mi++], size = Math.max(22, Math.min(90, 1100 / r.d));
      m.style.width = m.style.height = size + 'px';
      m.style.transform = `translate(${(r.sx - size / 2).toFixed(1)}px,${(r.sy - size / 2).toFixed(1)}px)`;
      m.firstChild.textContent = `${e.police ? 'Polizei · ' : e.name ? e.name + ' · ' : ''}${fmtDist(r.d)} · ${'▮'.repeat(Math.max(0, e.hp))}`;
      m.classList.toggle('boss', !!e.name);
      m.classList.toggle('police', e.police);
      m.hidden = false;
    } else if (r.d < offD) { offD = r.d; offX = r.cx; offY = r.cy; }
  }
  for (; mi < enemyMarks.length; mi++) enemyMarks[mi].hidden = true;
  if (offD < Infinity) placeArrow(enemyArrow, offX, offY); else enemyArrow.hidden = true;

  const t = currentNav();
  if (t) {
    const r = project(t.pos);
    if (r.on) {
      navMark.style.transform = `translate(${r.sx.toFixed(1)}px,${r.sy.toFixed(1)}px)`;
      navMark.style.setProperty('--tint', t.hex);
      navMark.firstChild.textContent = `${navLabel(t)} · ${fmtDist(Math.max(0, r.d - t.r))}`;
      navMark.hidden = false;
      navArrow.hidden = true;
    } else {
      navMark.hidden = true;
      navArrow.style.setProperty('--tint', t.hex);
      placeArrow(navArrow, r.cx, r.cy);
    }
  } else { navMark.hidden = true; navArrow.hidden = true; }

  if (lockValid()) {
    const r = project(G.lock.obj.pos);
    if (r.on) {
      lockMark.style.transform = `translate(${r.sx.toFixed(1)}px,${r.sy.toFixed(1)}px)`;
      lockMark.firstChild.textContent = `◎ ${lockLabel()} · ${fmtDist(r.d)}${G.player.align ? ' · AUSRICHTEN' : ''}`;
      lockMark.hidden = false;
      lockArrow.hidden = true;
    } else { lockMark.hidden = true; placeArrow(lockArrow, r.cx, r.cy); }
  } else { lockMark.hidden = true; lockArrow.hidden = true; }

  let pi = 0;
  for (const w of visibleWrecks()) {
    if (pi >= pickupMarks.length) break;
    const r = project(w.pos);
    if (!r.on) continue;
    const m = pickupMarks[pi++];
    m.style.transform = `translate(${r.sx.toFixed(1)}px,${r.sy.toFixed(1)}px)`;
    m.hidden = false;
  }
  for (const p of G.pickups) {
    if (pi >= pickupMarks.length) break;
    const r = project(p.pos);
    if (!r.on || r.d > 160) continue;
    const m = pickupMarks[pi++];
    m.style.transform = `translate(${r.sx.toFixed(1)}px,${r.sy.toFixed(1)}px)`;
    m.hidden = false;
  }
  for (; pi < pickupMarks.length; pi++) pickupMarks[pi].hidden = true;
}
