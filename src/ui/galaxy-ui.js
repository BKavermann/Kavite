// Star map: pick a hyperspace target within range.
// The inner circle is what the current fuel reaches, the dashed one the drive's maximum.
// Zoom with pinch, mouse wheel or the +/− buttons; drag to pan.
import { G } from '../ctx.js';
import { HYPER } from '../config.js';
import { SYSTEMS, systemDist, dangerLabel } from '../game/galaxy.js';
import { ECONOMIES } from '../game/economy.js';
import { canReach } from '../game/hyper.js';
import { missionSystems } from '../game/missions.js';
import { storySystem, storyGoal } from '../game/story.js';
import { saveProfile, hasHyper, hyperRange } from '../game/save.js';
import { fmtLY } from '../utils.js';
import { sfxClick } from '../core/audio.js';

const root = () => document.getElementById('galaxy');
let selected = null, pausedByMap = false;

// Visible part of the 80 × 50 map, in map units. Phones get a square view.
const MAP_W = 80, MAP_H = 50, MIN_W = 10;
const FAR_W = 34;      // zoomed out further: only names of reachable and chosen systems
const aspect = () => (innerWidth < 700 ? 1 : MAP_H / MAP_W);      // height / width
const maxW = () => Math.min(MAP_W, MAP_H / aspect());
let view = { x: 0, y: 0, w: MAP_W };
const viewBox = () => `${view.x} ${view.y} ${view.w} ${view.w * aspect()}`;

function setView(w, cx, cy) {
  view.w = Math.min(maxW(), Math.max(MIN_W, w));
  const h = view.w * aspect();
  view.x = Math.min(MAP_W - view.w, Math.max(0, cx - view.w / 2));
  view.y = Math.min(MAP_H - h, Math.max(0, cy - h / 2));
}
const centre = () => [view.x + view.w / 2, view.y + view.w * aspect() / 2];

// "Alles": the systems only fill the middle of the map, so fit their bounding box
function showAll() {
  const xs = SYSTEMS.map(s => s.x), ys = SYSTEMS.map(s => s.y), pad = 4;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  setView(Math.max(x1 - x0, (y1 - y0) / aspect()), (x0 + x1) / 2, (y0 + y1) / 2);
}

// Zoom by factor around a fixed map point
function zoomAt(f, px, py) {
  const w = Math.min(maxW(), Math.max(MIN_W, view.w / f)), k = w / view.w;
  const [cx, cy] = centre();
  setView(w, px + (cx - px) * k, py + (cy - py) * k);
}

export function openMap() {
  if (!G.profile) return;
  selected = G.profile.hyperTarget ?? G.systemId;
  showAll();
  if (G.mode === 'flight' && !G.paused) { G.paused = true; pausedByMap = true; }
  render();
  root().hidden = false;
}

export function closeMap() {
  root().hidden = true;
  if (pausedByMap) { G.paused = false; pausedByMap = false; }
}

export const mapOpen = () => !root().hidden;

function render() {
  const p = G.profile, here = SYSTEMS[G.systemId];
  const jobs = missionSystems(), plot = storySystem();
  const dots = SYSTEMS.map(s => {
    const e = ECONOMIES[s.econ];
    const isHere = s.id === G.systemId, isSel = s.id === selected, isTarget = s.id === p.hyperTarget;
    const reach = canReach(s.id);
    const seen = p.visited.includes(s.id);
    return `<g class="sys${reach ? ' reach' : ''}${isSel ? ' sel' : ''}" data-id="${s.id}" tabindex="0" role="button" aria-label="${s.name}">
      <circle class="hit" cx="${s.x}" cy="${s.y}" r="2.4"></circle>
      ${isTarget ? `<circle class="tgt" cx="${s.x}" cy="${s.y}" r="1.9"></circle>` : ''}
      ${isHere ? `<circle class="here" cx="${s.x}" cy="${s.y}" r="1.5"></circle>` : ''}
      ${jobs.has(s.id) ? `<path class="job" d="M${s.x} ${s.y - 2.7}l.7 .9-.7 .9-.7-.9z"></path>` : ''}
      ${plot === s.id ? `<circle class="story" cx="${s.x}" cy="${s.y}" r="2.3"></circle>` : ''}
      ${s.stations.some(st => st.bh) ? `<circle class="bh" cx="${s.x - 1.25}" cy="${s.y + 1.25}" r=".42"></circle>` : ''}
      <circle class="dot" cx="${s.x}" cy="${s.y}" r="${0.55 + s.stations.length * 0.12}" fill="${e.hex}" opacity="${seen || reach || isHere ? 1 : 0.45}"></circle>
      <text x="${s.x + 1.3}" y="${s.y - 1.1}">${s.name}</text>
    </g>`;
  }).join('');
  root().innerHTML = `
  <div class="panel map-panel">
    <header class="map-head">
      <div><p class="eyebrow">Sternenkarte · ${hasHyper(p) ? `Treibstoff ${fmtLY(p.fuel)} von ${fmtLY(hyperRange(p))}` : 'Kein Hyperantrieb'}</p><h2>System ${here.name}</h2></div>
      <button type="button" class="ghost close" data-act="close">Schließen</button>
    </header>
    <div class="map-wrap">
      <div class="map-zoom">
        <button type="button" class="chip" data-zoom="in" aria-label="Hineinzoomen">+</button>
        <button type="button" class="chip" data-zoom="out" aria-label="Herauszoomen">−</button>
        <button type="button" class="chip" data-zoom="all" aria-label="Ganze Karte">Alles</button>
      </div>
      <svg viewBox="${viewBox()}" class="map${view.w > FAR_W ? ' far' : ''}" preserveAspectRatio="xMidYMid meet">
        <defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" class="gridline"/></pattern></defs>
        <rect width="80" height="50" fill="url(#grid)"></rect>
        ${hasHyper(p) ? `<circle class="range-max" cx="${here.x}" cy="${here.y}" r="${hyperRange(p)}"></circle>` : ''}
        <circle class="range" cx="${here.x}" cy="${here.y}" r="${Math.max(0.01, p.fuel)}"></circle>
        ${dots}
      </svg>
    </div>
    <div class="map-info" data-k="info"></div>
  </div>`;
  info();
  root().querySelector('[data-act="close"]').addEventListener('click', closeMap);
  bindZoom(root().querySelector('svg.map'));
  root().querySelectorAll('.sys').forEach(g => {
    const pickIt = () => { selected = +g.dataset.id; sfxClick(); render(); };
    g.addEventListener('click', pickIt);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickIt(); } });
  });
}

function bindZoom(svg) {
  const apply = () => { svg.setAttribute('viewBox', viewBox()); svg.classList.toggle('far', view.w > FAR_W); };
  const toMap = (x, y) => {
    const m = svg.getScreenCTM();
    return m ? new DOMPoint(x, y).matrixTransform(m.inverse()) : { x: centre()[0], y: centre()[1] };
  };
  root().querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    const [cx, cy] = centre();
    if (b.dataset.zoom === 'all') showAll();
    else zoomAt(b.dataset.zoom === 'in' ? 1.6 : 1 / 1.6, cx, cy);
    apply();
  }));
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const p = toMap(e.clientX, e.clientY);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    apply();
  }, { passive: false });

  // Drag pans, two fingers pinch. A drag must not count as a tap on a system.
  const pts = new Map();
  let dragged = false, startX = 0, startY = 0, anchor = null, pinchD = 0;
  const pinch = () => { const [a, b] = [...pts.values()]; return [Math.hypot(a.x - b.x, a.y - b.y), (a.x + b.x) / 2, (a.y + b.y) / 2]; };
  svg.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { dragged = false; startX = e.clientX; startY = e.clientY; anchor = toMap(e.clientX, e.clientY); }
    if (pts.size === 2) pinchD = pinch()[0];
  });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      dragged = true;
      const [d, mx, my] = pinch(), p = toMap(mx, my);
      if (pinchD > 0) zoomAt(d / pinchD, p.x, p.y);
      pinchD = d;
      apply();
      return;
    }
    if (!dragged && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
    if (!dragged) { dragged = true; try { svg.setPointerCapture(e.pointerId); } catch (_) {} }
    // Keep the map point under the finger where it was when the drag started
    const p = toMap(e.clientX, e.clientY), [cx, cy] = centre();
    setView(view.w, cx + anchor.x - p.x, cy + anchor.y - p.y);
    apply();
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size === 1) { const [q] = pts.values(); anchor = toMap(q.x, q.y); }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('click', e => { if (dragged) { e.stopPropagation(); dragged = false; } }, true);
}

function info() {
  const p = G.profile, s = SYSTEMS[selected], e = ECONOMIES[s.econ];
  const el = root().querySelector('[data-k="info"]');
  const econs = [...new Set(s.stations.map(st => ECONOMIES[st.econ].name))].join(', ');
  const isHere = s.id === G.systemId;
  const d = systemDist(G.systemId, s.id);
  const jobs = missionSystems();
  const bhSt = s.stations.find(st => st.bh);
  let action = '';
  if (isHere) action = '<p class="note">Du bist hier.</p>';
  else if (!hasHyper(p)) action = '<p class="note warn">Kein Hyperantrieb eingebaut. In der Werft einer Station kaufen.</p>';
  else if (d > hyperRange(p)) action = '<p class="note warn">Außerhalb der Reichweite des Hyperantriebs. Über andere Systeme springen.</p>';
  else if (p.hyperTarget === s.id) action = '<button type="button" class="ghost" data-act="clear">Sprungziel entfernen</button>';
  else action = `<button type="button" class="primary" data-act="set">Als Sprungziel setzen</button>${d > p.fuel ? '<p class="note warn">Der Tank reicht dafür noch nicht. An einer Station tanken.</p>' : ''}`;
  el.innerHTML = `
    <div class="map-facts" style="--tint:${e.hex}">
      <div><span class="label">System</span><b class="tint">${s.name}</b></div>
      <div><span class="label">Entfernung</span><b>${isHere ? '–' : fmtLY(d)}</b></div>
      <div><span class="label">Stationen</span><b>${s.stations.length}</b></div>
      <div><span class="label">Piraten</span><b>${dangerLabel(s.danger)}</b></div>
      <div class="wide"><span class="label">Wirtschaft</span><b>${econs}</b></div>
      <div class="wide"><span class="label">Stern</span><b>${s.star.kind}${s.planet.ring ? ' · Ringplanet' : ''}</b></div>
    </div>
    ${action}
    ${bhSt ? `<p class="note bh-note">● Schwarzes Loch bei ${bhSt.name}: starker Sog beim Anflug, dafür bessere Preise.</p>` : ''}
    ${jobs.has(s.id) ? '<p class="note job-note">◆ Hier liegt ein Ziel aus deinen Aufträgen.</p>' : ''}
    ${storySystem() === s.id ? `<p class="note story-note">◎ Geschichte: ${storyGoal()}</p>` : ''}
    <p class="note">${p.visited.includes(s.id) ? 'Bereits besucht.' : 'Noch nicht besucht.'} Springen kannst du nur im Flug, mindestens 700 m von Stationen entfernt.</p>`;
  el.querySelector('[data-act="set"]')?.addEventListener('click', () => { p.hyperTarget = s.id; saveProfile(p); sfxClick(); render(); });
  el.querySelector('[data-act="clear"]')?.addEventListener('click', () => { p.hyperTarget = null; saveProfile(p); sfxClick(); render(); });
}
