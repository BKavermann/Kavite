// Two floating virtual sticks, a fire button and keyboard controls.
import { G } from '../ctx.js';

const keys = {};
const handlers = {};
const KEY_ACTIONS = { KeyF: 'dock', KeyV: 'view', KeyT: 'target', KeyJ: 'cruise', KeyM: 'map', KeyH: 'hyper', KeyR: 'weapon', KeyX: 'lock', KeyC: 'align', Escape: 'pause', KeyP: 'pause', KeyB: 'eject', KeyG: 'rear' };
const STICK_R = 56;

const sticks = {};
let fireHeld = false;

export function onAction(name, fn) { (handlers[name] ||= []).push(fn); }
function emitAction(name, ...args) { (handlers[name] || []).forEach(fn => fn(...args)); }

const active = () => G.mode === 'flight' && !G.paused;
const curve = v => v * (0.35 + 0.65 * Math.abs(v));   // finer control near the centre

export function initInput() {
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (!e.repeat && KEY_ACTIONS[e.code]) emitAction(KEY_ACTIONS[e.code]);
    if (active() && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; resetSticks(); });

  for (const k of ['L', 'R']) {
    const el = document.getElementById('stick' + k);
    sticks[k] = { el, knob: el.firstElementChild, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  }

  const layer = document.getElementById('touch');
  layer.addEventListener('pointerdown', e => {
    if (!active()) return;
    const s = e.clientX < innerWidth / 2 ? sticks.L : sticks.R;
    if (s.id !== null) return;
    e.preventDefault();
    try { layer.setPointerCapture(e.pointerId); } catch (_) {}
    s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0;
    s.t0 = performance.now(); s.moved = 0;
    s.el.style.left = s.ox + 'px'; s.el.style.top = s.oy + 'px';
    s.el.classList.remove('idle');
    setKnob(s);
  });
  layer.addEventListener('pointermove', e => {
    for (const s of [sticks.L, sticks.R]) {
      if (s.id !== e.pointerId) continue;
      let dx = (e.clientX - s.ox) / STICK_R, dy = (e.clientY - s.oy) / STICK_R;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      s.x = dx; s.y = dy;
      s.moved = Math.max(s.moved, m);
      setKnob(s);
    }
  });
  const release = e => {
    for (const s of [sticks.L, sticks.R]) {
      if (s.id !== e.pointerId) continue;
      // A short tap without stick movement selects a target instead
      if (e.type === 'pointerup' && performance.now() - s.t0 < 260 && s.moved < 0.2) emitAction('tap', e.clientX, e.clientY);
      s.id = null; s.x = s.y = 0; setKnob(s); s.el.classList.add('idle');
    }
    placeIdleSticks();
  };
  layer.addEventListener('pointerup', release);
  layer.addEventListener('pointercancel', release);
  layer.addEventListener('contextmenu', e => e.preventDefault());

  const fire = document.getElementById('fire');
  fire.addEventListener('pointerdown', e => {
    e.preventDefault();
    fireHeld = true; fire.classList.add('on');
    try { fire.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const up = () => { fireHeld = false; fire.classList.remove('on'); };
  fire.addEventListener('pointerup', up);
  fire.addEventListener('pointercancel', up);
  fire.addEventListener('contextmenu', e => e.preventDefault());
}

function setKnob(s) { s.knob.style.transform = `translate(${s.x * STICK_R}px, ${s.y * STICK_R}px)`; }

export function resetSticks() {
  for (const s of Object.values(sticks)) { s.id = null; s.x = s.y = 0; setKnob(s); s.el.classList.add('idle'); }
  fireHeld = false;
  placeIdleSticks();
}

export function placeIdleSticks() {
  const b = 100;
  for (const k of ['L', 'R']) {
    const s = sticks[k];
    if (!s || s.id !== null) continue;
    s.el.style.left = (k === 'L' ? b : innerWidth - b) + 'px';
    s.el.style.top = (innerHeight - b) + 'px';
  }
}

const out = { pitch: 0, yaw: 0, roll: 0, throttle: 0, fire: false };
const c1 = v => Math.max(-1, Math.min(1, v));
export function readInput() {
  if (!active()) { out.pitch = out.yaw = out.roll = out.throttle = 0; out.fire = false; return out; }
  const inv = G.settings.invertY, k = G.settings.sensitivity ?? 1;
  const kb = (a, b) => (keys[a] ? 1 : 0) - (keys[b] ? 1 : 0);
  out.pitch = c1(k * curve(sticks.L.y) * (inv ? 1 : -1) + kb('KeyW', 'KeyS') * (inv ? -1 : 1));
  out.yaw = c1(-k * curve(sticks.L.x) + kb('KeyA', 'KeyD'));
  out.roll = c1(-k * curve(sticks.R.x) + kb('KeyQ', 'KeyE'));
  out.throttle = c1(-sticks.R.y + (keys.ArrowUp || keys.ShiftLeft ? 1 : 0) - (keys.ArrowDown || keys.ControlLeft ? 1 : 0));
  out.fire = fireHeld || !!keys.Space;
  return out;
}
