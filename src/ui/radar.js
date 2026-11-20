// Kavite scanner: a round scope seen slightly from above (forward is up) with a slow sweep.
// Each contact stands on a stalk from its spot on your plane: the stalk length is its height,
// solid above you, dashed below. Far nav targets (encounters, search areas) blink at the rim.
// Top left: the space compass pointing at the navigation target
// (filled dot = ahead, hollow = behind).
import * as THREE from 'three';
import { G } from '../ctx.js';
import { RADAR_RANGE } from '../config.js';
import { currentNav } from '../game/nav.js';
import { visibleWrecks } from '../game/missions.js';
import { radarState } from '../game/damage.js';

let canvas, ctx, dpr = 1;
const invQ = new THREE.Quaternion(), v = new THREE.Vector3();

export function initRadar() {
  canvas = document.getElementById('radar');
  ctx = canvas.getContext('2d');
}

export function sizeRadar() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
}

const TAU = Math.PI * 2;

export function drawRadar() {
  if (G.mode !== 'flight' && G.mode !== 'docking') return;
  if (canvas.width < 10) sizeRadar();   // it had no size while hidden
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h * 0.54, R = Math.min(w, h) * 0.44, K = 0.66;   // K: tilt of the disc
  const HS = R * 0.85;                   // stalk length at full range height
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = dpr;
  const dmg = radarState();
  if (dmg.off) { drawStatic(cx, cy, R, K); return; }

  // Disc, rings, sweep: drawn as a circle, squashed by K
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(1, K);
  const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  bg.addColorStop(0, 'rgba(10,28,30,.72)');
  bg.addColorStop(1, 'rgba(4,10,14,.55)');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  const a0 = (G.time * 1.6) % TAU - Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(127,224,196,${0.09 - i * 0.014})`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0 - (i + 1) * 0.12, a0 - i * 0.12); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(127,224,196,.5)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.ellipse(cx, cy, R, R * K, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = dpr;
  ctx.strokeStyle = 'rgba(127,224,196,.15)';
  for (const f of [0.67, 0.34]) { ctx.beginPath(); ctx.ellipse(cx, cy, R * f, R * K * f, 0, 0, TAU); ctx.stroke(); }
  ctx.setLineDash([2 * dpr, 4 * dpr]);
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R * K); ctx.lineTo(cx, cy + R * K);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(127,224,196,.35)';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R * K); ctx.stroke();
  ctx.fillStyle = 'rgba(127,224,196,.75)';   // notch at the front
  ctx.beginPath(); ctx.moveTo(cx, cy - R * K + dpr); ctx.lineTo(cx - 4 * dpr, cy - R * K - 5 * dpr); ctx.lineTo(cx + 4 * dpr, cy - R * K - 5 * dpr); ctx.closePath(); ctx.fill();

  invQ.copy(G.ship.quaternion).invert();
  const ship = G.ship.position;
  const contact = (pos, color, shape, size) => {
    v.subVectors(pos, ship).applyQuaternion(invQ);
    if (v.length() > RADAR_RANGE) return;
    let px = cx + v.x / RADAR_RANGE * R, py = cy + v.z / RADAR_RANGE * R * K;
    if (dmg.jitter) { px += (Math.random() - 0.5) * dmg.jitter * dpr; py += (Math.random() - 0.5) * dmg.jitter * dpr; }
    const ty = Math.min(h - 4 * dpr, Math.max(4 * dpr, py - v.y / RADAR_RANGE * HS));
    ctx.fillStyle = color; ctx.strokeStyle = color;
    // Stalk: solid above you, dashed below; a small foot on the disc
    if (Math.abs(ty - py) > 1.5 * dpr) {
      if (v.y < 0) ctx.setLineDash([2 * dpr, 2 * dpr]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, ty); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillRect(px - 1.5 * dpr, py - 0.5 * dpr, 3 * dpr, dpr);
    }
    const s = size * dpr;
    ctx.beginPath();
    if (shape === 'diamond') { ctx.moveTo(px, ty - s); ctx.lineTo(px + s, ty); ctx.lineTo(px, ty + s); ctx.lineTo(px - s, ty); ctx.closePath(); }
    else if (shape === 'square') ctx.rect(px - s, ty - s, s * 2, s * 2);
    else if (shape === 'ring') { ctx.arc(px, ty, s, 0, TAU); ctx.lineWidth = 1.5 * dpr; ctx.stroke(); ctx.lineWidth = dpr; return; }
    else ctx.arc(px, ty, s, 0, TAU);
    ctx.fill();
  };
  for (const a of G.asteroids) contact(a.pos, 'rgba(201,180,138,.85)', 'dot', [3, 2.3, 1.7][a.tier]);
  for (const p of G.pickups) contact(p.pos, '#ffd34d', 'dot', 2);
  for (const st of G.stations) contact(st.pos, st.def.hex, 'square', 4.5);
  for (const hl of G.holes) contact(hl.pos, '#b58cff', 'ring', 5);
  for (const wr of visibleWrecks()) contact(wr.pos, '#ffd34d', 'diamond', 3.5);
  for (const t of G.traffic) contact(t.mesh.position, '#c9d3dc', 'dot', 2.6);
  for (const e of G.enemies) contact(e.pos, e.police ? '#4da3ff' : e.name ? '#ffd34d' : '#ff5a4e', 'diamond', e.name ? 5 : 4);

  // Own ship in the middle
  ctx.fillStyle = '#e6efec';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5 * dpr); ctx.lineTo(cx - 3.5 * dpr, cy + 3.5 * dpr); ctx.lineTo(cx, cy + 2 * dpr); ctx.lineTo(cx + 3.5 * dpr, cy + 3.5 * dpr);
  ctx.closePath(); ctx.fill();

  const st = currentNav();
  if (!st) return;
  // A far nav target that is not a station blinks on the rim in its direction
  v.subVectors(st.pos, ship).applyQuaternion(invQ);
  if (st.kind !== 'station' && v.length() > RADAR_RANGE && Math.sin(G.time * 7) > -0.3) {
    const ang = Math.atan2(v.z, v.x), ex = cx + Math.cos(ang) * R, ey = cy + Math.sin(ang) * R * K;
    ctx.fillStyle = st.hex;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(7 * dpr, 0); ctx.lineTo(-3 * dpr, -5 * dpr); ctx.lineTo(-3 * dpr, 5 * dpr); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Space compass, in the free corner
  const r = Math.min(w, h) * 0.12, ccx = r + 2 * dpr, ccy = r + 2 * dpr;
  ctx.strokeStyle = 'rgba(127,224,196,.5)';
  ctx.fillStyle = 'rgba(6,14,18,.65)';
  ctx.beginPath(); ctx.arc(ccx, ccy, r, 0, TAU); ctx.fill(); ctx.stroke();
  v.normalize();
  const dx = ccx + v.x * r * 0.75, dy = ccy - v.y * r * 0.75;
  ctx.beginPath(); ctx.arc(dx, dy, 2.4 * dpr, 0, TAU);
  if (v.z < 0) { ctx.fillStyle = st.hex; ctx.fill(); }
  else { ctx.strokeStyle = st.hex; ctx.stroke(); }
}

// A damaged scanner drops out for a moment: only snow on the disc
function drawStatic(cx, cy, R, K) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(1, K);
  ctx.fillStyle = 'rgba(8,18,20,.6)';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * R;
    ctx.fillStyle = `rgba(127,224,196,${0.15 + Math.random() * 0.5})`;
    ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, (1 + Math.random() * 2) * dpr, dpr);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,90,78,.55)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.ellipse(cx, cy, R, R * K, 0, 0, TAU); ctx.stroke();
}
