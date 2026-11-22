// Game controllers (PS5 DualSense, Xbox and others) through the browser's Gamepad API.
// In flight the sticks steer like the touch sticks and the buttons trigger the same
// actions as the keyboard. While a menu or panel is open the D-pad moves a highlight
// over its buttons, Cross presses, Circle goes back.
import { G } from '../ctx.js';
import { emitAction } from './input.js';
import { toast } from '../ui/hud.js';
import { padOrbit } from '../world/hangar.js';

export const pad = { lx: 0, ly: 0, rx: 0, ry: 0, fire: false };

// Standard mapping: 0 Cross, 1 Circle, 2 Square, 3 Triangle, 4 L1, 5 R1, 6 L2, 7 R2,
// 8 Create, 9 Options, 10 L3, 11 R3, 12-15 D-pad up/down/left/right, 16 PS, 17 touchpad
const FLIGHT = { 0: 'dock', 1: 'target', 2: 'weapon', 3: 'rear', 4: 'lock', 5: 'cruise', 6: 'align', 8: 'map', 12: 'hyper', 13: 'eject', 14: 'view', 15: 'view', 17: 'map' };
const OVERLAYS = ['.buy-confirm', '#promo', '#cheat', '#intro', '#tips', '#about', '#howto', '#settings', '#galaxy', '#menu', '#station'];
const FOCUSABLE = 'button, select, input, a[href], summary, [tabindex]:not([tabindex="-1"])';
const DZ = 0.15;

let prev = [], padIndex = -1, focus = null, lastRoot = null;
let held = null, heldT = 0, crossT = 0, lastPoll = 0;

function deadzone(x, y) {
  const m = Math.hypot(x, y);
  if (m < DZ) return [0, 0];
  const s = Math.min(1, (m - DZ) / (1 - DZ)) / m;
  return [x * s, y * s];
}

const shown = el => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
function topOverlay() {
  for (const sel of OVERLAYS) { const el = document.querySelector(sel); if (shown(el)) return el; }
  return null;
}

function candidates(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(e => !e.disabled && shown(e) && !e.closest('[hidden]') && getComputedStyle(e).pointerEvents !== 'none');
}

// A selector that finds the same control again after a panel has redrawn itself
const KEY_ATTRS = ['id', 'data-id', 'data-act', 'data-go', 'data-ytab', 'data-tab', 'data-k', 'data-rule', 'data-buy', 'data-sell', 'data-pick', 'data-area', 'data-c', 'data-svc', 'data-ship', 'data-story', 'data-black'];
function keyOf(el) {
  const sel = KEY_ATTRS.filter(a => el.hasAttribute(a)).map(a => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join('');
  return sel ? el.tagName.toLowerCase() + sel : null;
}
let focusKey = null;

function setFocus(el) {
  if (focus === el) return;
  focus?.classList.remove('pad-focus');
  focus = el;
  if (!el) return;
  focusKey = keyOf(el);
  el.classList.add('pad-focus');
  try { el.focus({ preventScroll: true }); } catch (_) {}
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

// Navigation by rows: up/down goes to the nearest row above or below and there to the control
// closest in x, left/right stays in the row
function move(root, dx, dy) {
  const list = candidates(root);
  if (!list.length) return;
  if (!focus || !list.includes(focus)) { setFocus(list.find(el => el.matches('.sel, [aria-selected="true"]')) || list[0]); return; }
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height, l: r.left, r: r.right }; };
  const a = box(focus), others = list.filter(el => el !== focus).map(el => ({ el, ...box(el) }));
  let best = null;
  if (dy) {
    const ahead = others.filter(o => (o.y - a.y) * dy > 4);
    if (!ahead.length) return;
    const rowY = dy > 0 ? Math.min(...ahead.map(o => o.y)) : Math.max(...ahead.map(o => o.y));
    const row = ahead.filter(o => Math.abs(o.y - rowY) < 14);
    best = row.reduce((m, o) => Math.abs(o.x - a.x) < Math.abs(m.x - a.x) ? o : m);
  } else {
    const row = others.filter(o => Math.abs(o.y - a.y) < Math.max(a.h, o.h) / 2 && (o.x - a.x) * dx > 4);
    if (row.length) best = row.reduce((m, o) => Math.abs(o.x - a.x) < Math.abs(m.x - a.x) ? o : m);
  }
  if (best) setFocus(best.el);
}

function adjust(el, dir) {
  if (el.tagName === 'SELECT') {
    const i = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + dir));
    if (i !== el.selectedIndex) { el.selectedIndex = i; el.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  }
  if (el.tagName === 'INPUT' && el.type === 'range') {
    dir > 0 ? el.stepUp() : el.stepDown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

function press(el) {
  if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
  if (el.tagName === 'INPUT' && el.type === 'range') return;
  if (typeof el.click === 'function') el.click();
  else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

// Sent from the body, not the focused control: the game ignores keys typed into input fields
const key = k => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true }));

function menuInput(root, gp, down) {
  if (root !== lastRoot) { lastRoot = root; setFocus(null); focusKey = null; }
  if (root.id === 'intro') { if (down(0) || down(1) || down(9)) key('Escape'); return; }
  if (focus && (!focus.isConnected || !root.contains(focus))) {
    const again = focusKey && root.querySelector(focusKey);
    setFocus(null);
    if (again && candidates(root).includes(again)) setFocus(again);
  }

  // Direction from D-pad or left stick, repeating while held
  const b = i => gp.buttons[i]?.pressed;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const dir = b(12) || ay < -0.6 ? 'u' : b(13) || ay > 0.6 ? 'd' : b(14) || ax < -0.6 ? 'l' : b(15) || ax > 0.6 ? 'r' : null;
  const now = performance.now();
  if (dir && (dir !== held || now >= heldT)) {
    heldT = now + (dir !== held ? 400 : 150);
    held = dir;
    const [dx, dy] = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[dir];
    if (!(dx && focus && adjust(focus, dx))) move(root, dx, dy);
  } else if (!dir) held = null;

  if (down(0)) {
    if (!focus || !focus.isConnected) move(root, 0, 0);
    else { press(focus); crossT = now + 400; }
  } else if (gp.buttons[0]?.pressed && focus?.matches('.qty') && !focus.disabled && now >= crossT) {
    press(focus);   // holding ✕ on + or − in the market keeps buying or selling
    crossT = now + 110;
  }
  if (down(1) || down(9)) key('Escape');   // back, like Esc on the keyboard
  if (down(8) || down(17)) emitAction('map');
}

export function pollGamepad() {
  const t = performance.now(), dt = Math.min(0.05, (t - (lastPoll || t)) / 1000);
  lastPoll = t;
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = list[padIndex];
  if (!gp || !gp.connected) { gp = null; for (const g of list) if (g && g.connected) { gp = g; padIndex = g.index; break; } }
  if (!gp) { pad.lx = pad.ly = pad.rx = pad.ry = 0; pad.fire = false; return; }

  const now = gp.buttons.map(btn => btn.pressed || btn.value > 0.5);
  const down = i => now[i] && !prev[i];
  const [lx, ly] = deadzone(gp.axes[0] || 0, gp.axes[1] || 0);
  const [rx, ry] = deadzone(gp.axes[2] || 0, gp.axes[3] || 0);
  if (now.some(Boolean) || lx || ly || rx || ry) document.body.classList.add('pad');

  const root = topOverlay();
  const flying = !root && G.mode === 'flight' && !G.paused;
  if (root) {
    pad.lx = pad.ly = pad.rx = pad.ry = 0; pad.fire = false;
    menuInput(root, gp, down);
    // In the station the right stick turns the view round the ship, L2/R2 zoom
    if (root.id === 'station') padOrbit(rx, ry, (gp.buttons[6]?.value || 0) - (gp.buttons[7]?.value || 0), dt);
  } else {
    if (focus) setFocus(null);
    lastRoot = null;
    pad.lx = flying ? lx : 0; pad.ly = flying ? ly : 0; pad.rx = flying ? rx : 0; pad.ry = flying ? ry : 0;
    pad.fire = flying && ((gp.buttons[7]?.value || 0) > 0.25 || !!gp.buttons[7]?.pressed);
    if (down(9)) emitAction('pause');
    if (flying) for (const i in FLIGHT) if (down(+i)) emitAction(FLIGHT[i]);
  }
  prev = now;
}

// Short rumble on hits, if the controller supports it
export function rumble(strength = 0.5, ms = 150) {
  const gp = navigator.getGamepads?.()[padIndex];
  try { gp?.vibrationActuator?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: Math.min(1, strength + 0.2) }); } catch (_) {}
}

export function initGamepad() {
  addEventListener('gamepadconnected', e => { padIndex = e.gamepad.index; document.body.classList.add('pad'); toast('Controller verbunden'); });
  addEventListener('gamepaddisconnected', e => {
    if (e.gamepad.index === padIndex) { padIndex = -1; prev = []; setFocus(null); document.body.classList.remove('pad'); toast('Controller getrennt'); }
  });
  // Touching the screen brings the touch controls back
  addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') document.body.classList.remove('pad'); }, true);
}
