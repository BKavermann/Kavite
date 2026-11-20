// 2D star streaks over the 3D view: faint while cruising, full during hyperspace.
let cv, ctx, dpr = 1, visible = false;
const parts = [];

const spawn = (p, fresh) => {
  p.a = Math.random() * Math.PI * 2;
  p.r = fresh ? Math.random() : 0.02 + Math.random() * 0.05;
  p.v = 0.5 + Math.random() * 0.9;
  p.hue = Math.random() < 0.8 ? 190 : 30;
  return p;
};

export function initWarp() {
  cv = document.getElementById('warp');
  ctx = cv.getContext('2d');
  for (let i = 0; i < 170; i++) parts.push(spawn({}, true));
}

export function sizeWarp() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
}

// intensity 0..1 controls streak speed and brightness; veil darkens the scene;
// flash adds a white-out (used at the moment of arrival).
export function drawWarp(dt, intensity, veil = 0, flash = 0) {
  if (intensity < 0.01 && veil < 0.01 && flash < 0.01) {
    if (visible) { ctx.clearRect(0, 0, cv.width, cv.height); cv.hidden = true; visible = false; }
    return;
  }
  if (!visible) { cv.hidden = false; visible = true; if (cv.width < 10) sizeWarp(); }
  const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
  ctx.clearRect(0, 0, w, h);
  if (veil > 0) { ctx.fillStyle = `rgba(3,8,20,${veil})`; ctx.fillRect(0, 0, w, h); }
  ctx.lineCap = 'round';
  for (const p of parts) {
    p.r += dt * p.v * (0.08 + p.r) * (0.6 + intensity * 4);
    if (p.r > 1.15) spawn(p, false);
    const len = 0.04 + intensity * 0.35 * p.r;
    const c = Math.cos(p.a), s = Math.sin(p.a);
    ctx.strokeStyle = `hsla(${p.hue},90%,80%,${Math.min(1, intensity * 1.2) * Math.min(1, p.r * 3)})`;
    ctx.lineWidth = (0.6 + p.r * 2) * dpr;
    ctx.beginPath();
    ctx.moveTo(cx + c * p.r * R, cy + s * p.r * R);
    ctx.lineTo(cx + c * p.r * R * (1 + len), cy + s * p.r * R * (1 + len));
    ctx.stroke();
  }
  if (flash > 0) { ctx.fillStyle = `rgba(230,245,255,${flash})`; ctx.fillRect(0, 0, w, h); }
}
