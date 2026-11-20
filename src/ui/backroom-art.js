// The bar's back room as a painted picture (drawn once with canvas 2D): a smoky room, a card
// table under a single lamp, humans and shady aliens playing cards. Figures are dark shapes
// lit from the lamp, with glowing eyes and cigarettes.
const W = 1280, H = 720;
let LX = 640, LY = 205;   // lamp position, per picture
let url = null, bouncerUrl = null;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fill a shape dark, then light it from the lamp
function lit(g, path, base = '#0e0b10', warm = 0.42) {
  g.fillStyle = base;
  g.fill(path);
  g.save();
  g.clip(path);
  const gr = g.createRadialGradient(LX, LY, 30, LX, LY, 620);
  gr.addColorStop(0, `rgba(255,196,120,${warm})`);
  gr.addColorStop(0.5, `rgba(200,120,70,${warm * 0.35})`);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.restore();
}

const glowDot = (g, x, y, r, color) => {
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff8e8';
  g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.fill();
};

// Light falls from the lamp: a warm rim on the side facing it, shadow on the far side
function shade(g, path, x, y, s, k = 1) {
  const dx = x - LX, dy = y - LY, l = Math.hypot(dx, dy) || 1;
  g.save();
  g.clip(path);
  g.strokeStyle = `rgba(255,205,150,${0.5 * k})`; g.lineWidth = 5 * s; g.stroke(path);
  g.translate(dx / l * 10 * s, dy / l * 10 * s + 4 * s);
  g.fillStyle = `rgba(0,0,0,${0.45 * k})`; g.fill(path);
  g.restore();
}
// A lit, rimmed and shaded shape
function form(g, path, base, warm, x, y, s, k = 1) { lit(g, path, base, warm); shade(g, path, x, y, s, k); }
// A path built around (0,0), moved to x,y, turned by a, scaled by s
function xf(build, x, y, a = 0, s = 1) {
  const p = new Path2D(), m = new Path2D();
  build(p);
  m.addPath(p, new DOMMatrix().translate(x, y).rotate(a * 180 / Math.PI).scale(s));
  return m;
}
function stroke(g, pts, color, w) {
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
}
// Speckles inside a shape: skin spots, stubble, scales
function speckle(g, path, x0, y0, w, h, n, color, size, r) {
  g.save(); g.clip(path); g.fillStyle = color;
  for (let k = 0; k < n; k++) { g.beginPath(); g.arc(x0 + r() * w, y0 + r() * h, size * (0.4 + r()), 0, Math.PI * 2); g.fill(); }
  g.restore();
}

// Shoulders and arms down to the table edge
function torso(x, y, w, h) {
  const p = new Path2D();
  p.moveTo(x - w * 0.5, y + h);
  p.bezierCurveTo(x - w * 0.55, y + h * 0.3, x - w * 0.42, y, x - w * 0.18, y);
  p.lineTo(x + w * 0.18, y);
  p.bezierCurveTo(x + w * 0.42, y, x + w * 0.55, y + h * 0.3, x + w * 0.5, y + h);
  p.closePath();
  return p;
}

const SUITS = [['♠', '#1d1d1d'], ['♥', '#b8322a'], ['♦', '#b8322a'], ['♣', '#1d1d1d']];
const RANKS = ['A', 'K', 'D', 'B', '7', '9', '10'];
// One card: the face with rank and suit, or the patterned back
function card(g, w, h, back, k) {
  g.fillStyle = '#efe6d2';
  g.beginPath(); g.roundRect(-w / 2, -h, w, h, w * 0.12); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.8; g.stroke();
  if (back) {
    g.fillStyle = '#6e1820';
    g.beginPath(); g.roundRect(-w / 2 + 2, -h + 2, w - 4, h - 4, w * 0.08); g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(255,215,160,.28)'; g.lineWidth = 0.8;
    for (let d = -h; d < w + h; d += 4) { g.beginPath(); g.moveTo(-w / 2 + d, -h); g.lineTo(-w / 2 + d - h, 0); g.stroke(); g.beginPath(); g.moveTo(-w / 2 + d - h, -h); g.lineTo(-w / 2 + d, 0); g.stroke(); }
    g.restore();
    return;
  }
  const [suit, col] = SUITS[k % 4];
  g.fillStyle = col;
  g.font = `700 ${w * 0.36}px Georgia, serif`; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText(RANKS[(k * 3) % RANKS.length], -w / 2 + w * 0.1, -h + h * 0.05);
  g.font = `${w * 0.5}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(suit, 0, -h * 0.45);
}
function cardsFan(g, x, y, n, ang, s = 1, back = false) {
  for (let i = 0; i < n; i++) {
    g.save();
    g.translate(x, y);
    g.rotate(ang + (i - (n - 1) / 2) * 0.17);
    card(g, 19 * s, 28 * s, back, i + n);
    g.restore();
  }
}
// A hand with fingers, palm at (x,y), fingers pointing along angle a (0 = up)
function hand(g, x, y, s, a, base, warm = 0.5, long = 1, fingers = 4) {
  const p = xf(p => {
    p.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2);
    for (let k = 0; k < fingers; k++) p.ellipse((k - (fingers - 1) / 2) * 4.4, -9 * long, 2.3, 6.5 * long, (k - 1.5) * 0.08, 0, Math.PI * 2);
    p.ellipse(-9, -2, 2.6, 6, -0.9, 0, Math.PI * 2);   // thumb
  }, x, y, a, s);
  form(g, p, base, warm, x, y, s * 0.4, 0.8);
}
// An arm from the shoulder to the hand, as a tapering tube
function arm(g, x0, y0, x1, y1, bend, w0, w1, base, warm) {
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
  const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
  const ux = nx / l, uy = ny / l;
  const p = new Path2D();
  p.moveTo(x0 + ux * w0, y0 + uy * w0);
  p.quadraticCurveTo(mx + ux * (w0 + w1) / 2, my + uy * (w0 + w1) / 2, x1 + ux * w1, y1 + uy * w1);
  p.lineTo(x1 - ux * w1, y1 - uy * w1);
  p.quadraticCurveTo(mx - ux * (w0 + w1) / 2, my - uy * (w0 + w1) / 2, x0 - ux * w0, y0 - uy * w0);
  p.closePath();
  form(g, p, base, warm, mx, my, 1, 0.8);
  return p;
}

function smoke(g, x, y, len, r) {
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = `rgba(200,200,210,${0.08 - k * 0.018})`;
    g.lineWidth = 3 + k * 5;
    g.beginPath(); g.moveTo(x, y);
    let cx = x, cy = y;
    for (let s = 0; s < 5; s++) {
      const nx = cx + (r() - 0.5) * 40, ny = cy - len / 5;
      g.quadraticCurveTo(cx + (r() - 0.5) * 50, (cy + ny) / 2, nx, ny);
      cx = nx; cy = ny;
    }
    g.stroke();
  }
}
function cigarette(g, r, x, y, a, s) {
  const ex = x + Math.cos(a) * 24 * s, ey = y + Math.sin(a) * 24 * s;
  stroke(g, [[x, y], [ex, ey]], '#e8e0d0', 4 * s);
  stroke(g, [[x, y], [x + Math.cos(a) * 6 * s, y + Math.sin(a) * 6 * s]], '#b8823a', 4.2 * s);
  glowDot(g, ex, ey, 3 * s, 'rgba(255,120,40,.85)');
  smoke(g, ex, ey - 2, 170 * s, r);
}

/* ---------- The players ---------- */
// Human gambler in a coat and fedora, cigarette in the corner of the mouth.
// o.back: seen from behind (front row), o.beard, o.patch (eye patch), o.tie colour
function hatMan(g, r, x, y, s, o = {}) {
  const coat = o.coat || '#1d1716', skin = o.skin || '#5a3c2e', hy = y + 30 * s;
  const body = torso(x, y + 60 * s, 180 * s, 160 * s);
  form(g, body, coat, 0.42, x, y + 120 * s, s);
  // seams and creases of the coat
  g.save(); g.clip(body);
  stroke(g, [[x - 62 * s, y + 90 * s], [x - 52 * s, y + 200 * s]], 'rgba(0,0,0,.45)', 2 * s);
  stroke(g, [[x + 62 * s, y + 90 * s], [x + 54 * s, y + 200 * s]], 'rgba(0,0,0,.45)', 2 * s);
  stroke(g, [[x - 70 * s, y + 80 * s], [x - 40 * s, y + 70 * s]], 'rgba(255,210,160,.12)', 2 * s);
  g.restore();
  if (!o.back) {
    // shirt, tie, lapels, pocket square
    const shirt = new Path2D(); shirt.moveTo(x - 20 * s, y + 62 * s); shirt.lineTo(x + 20 * s, y + 62 * s); shirt.lineTo(x, y + 140 * s); shirt.closePath();
    lit(g, shirt, '#8a8070', 0.55);
    const tie = new Path2D(); tie.moveTo(x - 5 * s, y + 66 * s); tie.lineTo(x + 5 * s, y + 66 * s); tie.lineTo(x + 8 * s, y + 128 * s); tie.lineTo(x, y + 138 * s); tie.lineTo(x - 8 * s, y + 128 * s); tie.closePath();
    lit(g, tie, o.tie || '#6e1016', 0.5);
    for (const sx of [-1, 1]) {
      const lp = new Path2D(); lp.moveTo(x + sx * 20 * s, y + 60 * s); lp.lineTo(x + sx * 44 * s, y + 98 * s); lp.lineTo(x + sx * 30 * s, y + 104 * s); lp.lineTo(x + sx * 3 * s, y + 150 * s); lp.lineTo(x + sx * 12 * s, y + 92 * s); lp.closePath();
      form(g, lp, '#262020', 0.45, x + sx * 25 * s, y + 95 * s, s * 0.6);
    }
    const sq = new Path2D(); sq.moveTo(x - 52 * s, y + 112 * s); sq.lineTo(x - 36 * s, y + 104 * s); sq.lineTo(x - 34 * s, y + 114 * s); sq.closePath();
    lit(g, sq, '#a8a090', 0.4);
  } else {
    // collar from behind
    const col = new Path2D(); col.moveTo(x - 30 * s, y + 58 * s); col.quadraticCurveTo(x, y + 72 * s, x + 30 * s, y + 58 * s); col.lineTo(x + 26 * s, y + 74 * s); col.quadraticCurveTo(x, y + 86 * s, x - 26 * s, y + 74 * s); col.closePath();
    form(g, col, '#2a2220', 0.45, x, y + 66 * s, s);
  }
  // neck, ears, head
  const neck = new Path2D(); neck.rect(x - 14 * s, y + 50 * s, 28 * s, 18 * s);
  lit(g, neck, skin, 0.4);
  for (const sx of [-1, 1]) { const ear = new Path2D(); ear.ellipse(x + sx * 30 * s, hy + 4 * s, 6 * s, 10 * s, 0, 0, Math.PI * 2); form(g, ear, skin, 0.5, x + sx * 30 * s, hy, s * 0.4); }
  const head = new Path2D(); head.ellipse(x, hy, 30 * s, 36 * s, 0, 0, Math.PI * 2);
  if (o.back) {
    form(g, head, '#1a1210', 0.4, x, hy, s);
    speckle(g, head, x - 30 * s, hy - 10 * s, 60 * s, 46 * s, 160, 'rgba(0,0,0,.4)', 1.4 * s, r);   // short hair
  } else {
    form(g, head, skin, 0.6, x, hy, s);
    // shadow under the brim, eyes glinting out of it
    g.save(); g.clip(head);
    const sh = g.createLinearGradient(0, hy - 36 * s, 0, hy + 6 * s);
    sh.addColorStop(0, 'rgba(0,0,0,.8)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(x - 40 * s, hy - 40 * s, 80 * s, 46 * s);
    g.restore();
    for (const sx of [-1, 1]) {
      if (o.patch && sx < 0) {
        g.fillStyle = '#080606'; g.beginPath(); g.ellipse(x - 11 * s, hy - 2 * s, 8 * s, 6 * s, 0.1, 0, Math.PI * 2); g.fill();
        stroke(g, [[x - 30 * s, hy - 10 * s], [x + 28 * s, hy - 14 * s]], '#080606', 1.6 * s);
        continue;
      }
      g.fillStyle = '#d8cbb0'; g.beginPath(); g.ellipse(x + sx * 11 * s, hy - 2 * s, 4 * s, 2 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a120c'; g.beginPath(); g.arc(x + sx * 11 * s + 1 * s, hy - 2 * s, 1.6 * s, 0, Math.PI * 2); g.fill();
      stroke(g, [[x + sx * 5 * s, hy - 8 * s], [x + sx * 17 * s, hy - 9 * s]], 'rgba(10,6,4,.9)', 2.4 * s);   // brows
    }
    // nose, cheekbone, mouth, scar
    const nose = new Path2D(); nose.moveTo(x + 1 * s, hy - 2 * s); nose.lineTo(x + 7 * s, hy + 13 * s); nose.lineTo(x - 2 * s, hy + 15 * s); nose.closePath();
    form(g, nose, skin, 0.65, x, hy + 6 * s, s * 0.35);
    stroke(g, [[x - 2 * s, hy + 15 * s], [x + 7 * s, hy + 13 * s]], 'rgba(20,10,6,.7)', 1.4 * s);
    stroke(g, [[x - 20 * s, hy + 6 * s], [x - 12 * s, hy + 14 * s]], 'rgba(255,210,170,.2)', 2 * s);
    stroke(g, [[x - 9 * s, hy + 23 * s], [x + 2 * s, hy + 24 * s], [x + 10 * s, hy + 22 * s]], 'rgba(25,10,8,.9)', 2 * s);
    g.fillStyle = '#e0b040'; g.fillRect(x + 3 * s, hy + 22 * s, 3 * s, 2.5 * s);   // gold tooth
    stroke(g, [[x + 16 * s, hy - 4 * s], [x + 22 * s, hy + 12 * s]], 'rgba(230,170,150,.45)', 1.6 * s);
    if (o.beard) {
      const bd = new Path2D(); bd.moveTo(x - 26 * s, hy + 8 * s); bd.quadraticCurveTo(x - 22 * s, hy + 42 * s, x, hy + 44 * s); bd.quadraticCurveTo(x + 22 * s, hy + 42 * s, x + 26 * s, hy + 8 * s);
      bd.quadraticCurveTo(x + 14 * s, hy + 30 * s, x + 10 * s, hy + 20 * s); bd.lineTo(x - 10 * s, hy + 20 * s); bd.quadraticCurveTo(x - 14 * s, hy + 30 * s, x - 26 * s, hy + 8 * s);
      form(g, bd, '#2a1c14', 0.35, x, hy + 30 * s, s * 0.5);
      speckle(g, bd, x - 26 * s, hy + 8 * s, 52 * s, 36 * s, 90, 'rgba(255,220,180,.18)', 0.8 * s, r);
    } else speckle(g, head, x - 24 * s, hy + 12 * s, 48 * s, 22 * s, 120, 'rgba(10,6,4,.35)', 0.7 * s, r);   // stubble
    cigarette(g, r, x + 9 * s, hy + 23 * s, -0.35, s);
  }
  // fedora: brim, crown with its crease, band
  const hat = o.hat || '#141011';
  const brim = new Path2D(); brim.ellipse(x, y + 4 * s, 64 * s, 14 * s, -0.05, 0, Math.PI * 2);
  form(g, brim, hat, 0.4, x, y + 4 * s, s);
  const crown = new Path2D();
  crown.moveTo(x - 33 * s, y + 6 * s); crown.lineTo(x - 28 * s, y - 32 * s); crown.quadraticCurveTo(x - 14 * s, y - 42 * s, x, y - 34 * s);
  crown.quadraticCurveTo(x + 14 * s, y - 42 * s, x + 28 * s, y - 32 * s); crown.lineTo(x + 33 * s, y + 6 * s); crown.closePath();
  form(g, crown, hat, 0.45, x, y - 12 * s, s);
  const band = new Path2D(); band.moveTo(x - 32 * s, y - 2 * s); band.lineTo(x + 32 * s, y - 2 * s); band.lineTo(x + 33 * s, y + 6 * s); band.lineTo(x - 33 * s, y + 6 * s); band.closePath();
  lit(g, band, o.band || '#3a1014', 0.4);
  stroke(g, [[x, y - 34 * s], [x + 2 * s, y - 14 * s]], 'rgba(0,0,0,.5)', 2 * s);
  stroke(g, [[x - 60 * s, y + 6 * s], [x - 20 * s, y + 15 * s]], 'rgba(255,210,150,.22)', 1.6 * s);
}

// Grey with a big head, huge black eyes and long fingers; a glowing badge on a high collar
function grey(g, r, x, y, s) {
  const skin = '#3e4a43';
  const body = torso(x, y + 84 * s, 128 * s, 140 * s);
  form(g, body, '#16201f', 0.45, x, y + 140 * s, s);
  // high collar, seams, badge
  const col = new Path2D(); col.moveTo(x - 30 * s, y + 70 * s); col.lineTo(x - 22 * s, y + 104 * s); col.lineTo(x, y + 112 * s); col.lineTo(x + 22 * s, y + 104 * s); col.lineTo(x + 30 * s, y + 70 * s); col.lineTo(x + 14 * s, y + 88 * s); col.lineTo(x - 14 * s, y + 88 * s); col.closePath();
  form(g, col, '#24302d', 0.5, x, y + 90 * s, s * 0.6);
  stroke(g, [[x, y + 112 * s], [x, y + 220 * s]], 'rgba(120,240,220,.25)', 1.4 * s);
  glowDot(g, x - 34 * s, y + 124 * s, 3.5 * s, 'rgba(90,240,255,.9)');
  // thin neck and the head
  const neck = new Path2D(); neck.rect(x - 8 * s, y + 66 * s, 16 * s, 26 * s);
  lit(g, neck, skin, 0.45);
  const head = new Path2D();
  head.moveTo(x, y + 80 * s);
  head.bezierCurveTo(x - 30 * s, y + 70 * s, x - 62 * s, y + 10 * s, x - 50 * s, y - 25 * s);
  head.bezierCurveTo(x - 36 * s, y - 62 * s, x + 36 * s, y - 62 * s, x + 50 * s, y - 25 * s);
  head.bezierCurveTo(x + 62 * s, y + 10 * s, x + 30 * s, y + 70 * s, x, y + 80 * s);
  form(g, head, skin, 0.62, x, y + 10 * s, s);
  speckle(g, head, x - 50 * s, y - 50 * s, 100 * s, 120 * s, 60, 'rgba(0,0,0,.18)', 1.6 * s, r);
  // forehead folds, cheekbones
  for (let k = 0; k < 3; k++) stroke(g, [[x - 26 * s + k * 3 * s, y - 30 * s + k * 7 * s], [x, y - 34 * s + k * 7 * s], [x + 26 * s - k * 3 * s, y - 30 * s + k * 7 * s]], 'rgba(0,0,0,.35)', 1.3 * s);
  for (const sx of [-1, 1]) stroke(g, [[x + sx * 38 * s, y + 24 * s], [x + sx * 22 * s, y + 46 * s]], 'rgba(255,220,180,.18)', 2.4 * s);
  // eyes with wet highlights and a faint green glow inside
  for (const sx of [-1, 1]) {
    g.save();
    g.translate(x + sx * 22 * s, y + 18 * s); g.rotate(sx * 0.45);
    g.fillStyle = '#010202';
    g.beginPath(); g.ellipse(0, 0, 18 * s, 9.5 * s, 0, 0, Math.PI * 2); g.fill();
    const ig = g.createRadialGradient(0, 2 * s, 0, 0, 2 * s, 14 * s);
    ig.addColorStop(0, 'rgba(60,200,150,.35)'); ig.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ig; g.beginPath(); g.ellipse(0, 0, 17 * s, 9 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(230,255,245,.85)';
    g.beginPath(); g.ellipse(-5 * s, -3.5 * s, 4.5 * s, 2 * s, -0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(6 * s, 3 * s, 1.2 * s, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  for (const sx of [-1, 1]) { g.fillStyle = 'rgba(0,0,0,.7)'; g.beginPath(); g.ellipse(x + sx * 3 * s, y + 42 * s, 1.4 * s, 2.2 * s, 0, 0, Math.PI * 2); g.fill(); }
  stroke(g, [[x - 8 * s, y + 58 * s], [x, y + 59 * s], [x + 8 * s, y + 57 * s]], 'rgba(0,0,0,.75)', 1.6 * s);
}

// The back row's arms come after the table, so the hands rest on its edge
function greyHands(g, x, y, s) {
  arm(g, x - 50 * s, y + 104 * s, x - 22 * s, y + 150 * s, -10 * s, 9 * s, 5 * s, '#1c2624', 0.45);
  arm(g, x + 50 * s, y + 104 * s, x + 22 * s, y + 150 * s, 10 * s, 9 * s, 5 * s, '#1c2624', 0.45);
  cardsFan(g, x, y + 150 * s, 5, 0, 1.05 * s, true);
  hand(g, x - 14 * s, y + 150 * s, s * 0.95, 0.5, '#3e4a43', 0.55, 1.6, 3);
  hand(g, x + 14 * s, y + 150 * s, s * 0.95, -0.5, '#3e4a43', 0.55, 1.6, 3);
}
function manHands(g, x, y, s) {
  arm(g, x - 72 * s, y + 104 * s, x - 34 * s, y + 150 * s, -14 * s, 16 * s, 8 * s, '#1d1716', 0.45);
  cardsFan(g, x - 40 * s, y + 146 * s, 5, -0.25, 1.05 * s, true);
  hand(g, x - 34 * s, y + 152 * s, s, -0.3, '#5a3c2e', 0.6);
  g.strokeStyle = '#e0b84a'; g.lineWidth = 2 * s; g.beginPath(); g.ellipse(x - 34 * s, y + 144 * s, 3 * s, 1.5 * s, -0.3, 0, Math.PI * 2); g.stroke();
  arm(g, x + 72 * s, y + 104 * s, x + 40 * s, y + 152 * s, 14 * s, 16 * s, 8 * s, '#1d1716', 0.45);
  hand(g, x + 40 * s, y + 156 * s, s, 1.3, '#5a3c2e', 0.6);
}
function squidHands(g, x, y, s) {
  const tx = x + 70 * s, ty = y + 150 * s;
  const reach = new Path2D();
  reach.moveTo(x + 50 * s, y + 92 * s); reach.quadraticCurveTo(x + 100 * s, y + 110 * s, tx + 8 * s, ty);
  reach.quadraticCurveTo(tx - 10 * s, ty + 4 * s, tx - 12 * s, ty - 8 * s); reach.quadraticCurveTo(x + 86 * s, y + 116 * s, x + 44 * s, y + 104 * s); reach.closePath();
  cardsFan(g, tx, ty - 2 * s, 4, -0.15, 1.05 * s, true);
  form(g, reach, '#3a2244', 0.6, x + 80 * s, y + 120 * s, s * 0.6);
  g.strokeStyle = '#e0b84a'; g.lineWidth = 2.4 * s; g.beginPath(); g.ellipse(x + 92 * s, y + 124 * s, 3 * s, 7 * s, 0.6, 0, Math.PI * 2); g.stroke();
  // a second tentacle pushes chips forward
  const t2 = new Path2D();
  t2.moveTo(x - 50 * s, y + 96 * s); t2.quadraticCurveTo(x - 80 * s, y + 130 * s, x - 40 * s, y + 158 * s);
  t2.quadraticCurveTo(x - 60 * s, y + 132 * s, x - 38 * s, y + 104 * s); t2.closePath();
  form(g, t2, '#3a2244', 0.6, x - 60 * s, y + 130 * s, s * 0.6);
}

// Squid face: mottled head, a monocle, tentacles with suckers over a fur collar
function squid(g, r, x, y, s) {
  const skin = '#40284a';
  const body = torso(x, y + 70 * s, 190 * s, 150 * s);
  form(g, body, '#1a1320', 0.42, x, y + 130 * s, s);
  // fur collar: a ragged ring of tufts
  const fur = new Path2D();
  fur.moveTo(x - 80 * s, y + 92 * s);
  for (let k = 0; k <= 20; k++) {
    const t = k / 20, fx = x - 80 * s + t * 160 * s, fy = y + 76 * s + Math.sin(t * Math.PI) * -6 * s;
    fur.lineTo(fx, fy + (k % 2 ? -10 : 4) * s * (0.6 + r() * 0.6));
  }
  fur.lineTo(x + 70 * s, y + 112 * s); fur.quadraticCurveTo(x, y + 128 * s, x - 70 * s, y + 112 * s); fur.closePath();
  form(g, fur, '#3a3028', 0.5, x, y + 96 * s, s);
  speckle(g, fur, x - 80 * s, y + 66 * s, 160 * s, 60 * s, 160, 'rgba(255,230,200,.12)', 1 * s, r);
  // head with spots
  const head = new Path2D(); head.ellipse(x, y + 10 * s, 46 * s, 54 * s, 0, 0, Math.PI * 2);
  form(g, head, skin, 0.6, x, y + 10 * s, s);
  speckle(g, head, x - 46 * s, y - 44 * s, 92 * s, 90 * s, 40, 'rgba(10,0,16,.35)', 4 * s, r);
  speckle(g, head, x - 46 * s, y - 44 * s, 92 * s, 90 * s, 30, 'rgba(255,190,240,.12)', 2.4 * s, r);
  // brow ridges and the eyes, a gold monocle on the right one
  for (const sx of [-1, 1]) {
    stroke(g, [[x + sx * 8 * s, y - 6 * s], [x + sx * 22 * s, y - 10 * s], [x + sx * 32 * s, y - 2 * s]], 'rgba(0,0,0,.55)', 4 * s);
    g.fillStyle = '#120a08'; g.beginPath(); g.ellipse(x + sx * 20 * s, y + 4 * s, 9 * s, 6 * s, 0, 0, Math.PI * 2); g.fill();
    glowDot(g, x + sx * 20 * s, y + 4 * s, 4 * s, 'rgba(255,214,90,.85)');
    g.fillStyle = '#100800'; g.fillRect(x + sx * 20 * s - 1 * s, y - 1 * s, 2 * s, 10 * s);   // slit pupil
  }
  g.strokeStyle = '#d8a83a'; g.lineWidth = 2.2 * s;
  g.beginPath(); g.arc(x + 20 * s, y + 4 * s, 12 * s, 0, Math.PI * 2); g.stroke();
  stroke(g, [[x + 31 * s, y + 9 * s], [x + 40 * s, y + 40 * s], [x + 36 * s, y + 80 * s]], 'rgba(216,168,58,.7)', 1 * s);
  // tentacles with rows of suckers
  for (let k = 0; k < 7; k++) {
    const bx = x + (k - 3) * 11 * s, len = (60 + r() * 40) * s, ex = bx + (r() - 0.5) * 30 * s, ey = y + 35 * s + len, cx = bx + (r() - 0.5) * 40 * s;
    const t = new Path2D();
    t.moveTo(bx - 6 * s, y + 35 * s);
    t.quadraticCurveTo(cx - 4 * s, y + 35 * s + len * 0.6, ex, ey);
    t.quadraticCurveTo(cx + 6 * s, y + 35 * s + len * 0.5, bx + 6 * s, y + 35 * s);
    form(g, t, '#3a2244', 0.6, bx, y + 60 * s, s * 0.5);
    for (let q = 1; q < 6; q++) {
      const u = q / 6, px = (1 - u) * (1 - u) * bx + 2 * u * (1 - u) * cx + u * u * ex, py = (1 - u) * (1 - u) * (y + 35 * s) + 2 * u * (1 - u) * (y + 35 * s + len * 0.55) + u * u * ey;
      g.fillStyle = 'rgba(255,200,220,.35)'; g.beginPath(); g.arc(px, py, (2.6 - u * 1.4) * s, 0, Math.PI * 2); g.fill();
    }
  }
}

// A horned brute, wide as a door: tusks, nose ring, arms crossed over a studded harness
function brute(g, r, x, y, s) {
  const skin = '#3a221c';
  const body = torso(x, y + 50 * s, 270 * s, 200 * s);
  form(g, body, '#24140f', 0.42, x, y + 140 * s, s);
  // harness straps with studs
  g.save(); g.clip(body);
  for (const sx of [-1, 1]) {
    stroke(g, [[x + sx * 70 * s, y + 60 * s], [x - sx * 60 * s, y + 260 * s]], '#100806', 14 * s);
    for (let k = 0; k < 7; k++) { const u = k / 7; glowDot(g, x + sx * 70 * s - sx * u * 130 * s, y + 60 * s + u * 200 * s, 1.4 * s, 'rgba(255,220,160,.35)'); }
  }
  g.restore();
  // crossed forearms
  for (const sx of [-1, 1]) {
    const fa = new Path2D(); fa.ellipse(x + sx * 8 * s, y + 118 * s + sx * 8 * s, 84 * s, 22 * s, sx * 0.12, 0, Math.PI * 2);
    form(g, fa, skin, 0.45, x, y + 118 * s, s);
    hand(g, x - sx * 70 * s, y + 112 * s + sx * 6 * s, s * 1.4, -sx * 1.3, skin, 0.45, 0.8);
  }
  stroke(g, [[x - 40 * s, y + 108 * s], [x - 20 * s, y + 126 * s]], 'rgba(230,170,150,.35)', 2 * s);   // a scar
  // neck and head: heavy brow, small red eyes, tusks
  const neck = new Path2D(); neck.rect(x - 34 * s, y + 46 * s, 68 * s, 20 * s);
  lit(g, neck, skin, 0.4);
  const head = new Path2D(); head.ellipse(x, y + 30 * s, 42 * s, 40 * s, 0, 0, Math.PI * 2);
  form(g, head, skin, 0.55, x, y + 30 * s, s);
  speckle(g, head, x - 42 * s, y - 10 * s, 84 * s, 80 * s, 50, 'rgba(0,0,0,.3)', 2 * s, r);
  const brow = new Path2D(); brow.moveTo(x - 36 * s, y + 18 * s); brow.quadraticCurveTo(x, y + 4 * s, x + 36 * s, y + 18 * s); brow.quadraticCurveTo(x, y + 26 * s, x - 36 * s, y + 18 * s);
  form(g, brow, '#2a1814', 0.55, x, y + 16 * s, s * 0.5);
  for (const sx of [-1, 1]) {
    glowDot(g, x + sx * 15 * s, y + 28 * s, 3 * s, 'rgba(255,50,30,.95)');
    const tusk = new Path2D(); tusk.moveTo(x + sx * 18 * s, y + 52 * s); tusk.quadraticCurveTo(x + sx * 30 * s, y + 40 * s, x + sx * 26 * s, y + 26 * s); tusk.quadraticCurveTo(x + sx * 22 * s, y + 42 * s, x + sx * 12 * s, y + 52 * s);
    form(g, tusk, '#8a8068', 0.6, x + sx * 22 * s, y + 40 * s, s * 0.3);
  }
  const nose = new Path2D(); nose.ellipse(x, y + 40 * s, 10 * s, 7 * s, 0, 0, Math.PI * 2);
  form(g, nose, '#4a2c24', 0.55, x, y + 40 * s, s * 0.4);
  g.strokeStyle = '#d8a83a'; g.lineWidth = 2 * s; g.beginPath(); g.arc(x, y + 50 * s, 5 * s, 0.2, Math.PI - 0.2); g.stroke();
  stroke(g, [[x - 14 * s, y + 58 * s], [x + 14 * s, y + 58 * s]], 'rgba(0,0,0,.7)', 2 * s);
  // horns with growth rings
  for (const sx of [-1, 1]) {
    const h = new Path2D();
    h.moveTo(x + sx * 24 * s, y + 6 * s);
    h.quadraticCurveTo(x + sx * 72 * s, y - 10 * s, x + sx * 66 * s, y - 56 * s);
    h.quadraticCurveTo(x + sx * 52 * s, y - 14 * s, x + sx * 14 * s, y + 18 * s);
    form(g, h, '#3a3028', 0.6, x + sx * 50 * s, y - 10 * s, s * 0.6);
    g.save(); g.clip(h);
    for (let k = 1; k < 7; k++) stroke(g, [[x + sx * (20 + k * 7) * s, y - (k * 6 - 20) * s], [x + sx * (34 + k * 7) * s, y - (k * 8 - 4) * s]], 'rgba(0,0,0,.45)', 1.6 * s);
    g.restore();
  }
}

// Insect: carapace in segments, compound eyes, mandibles, antennae, four thin arms
function insect(g, r, x, y, s) {
  const shell = '#1e2a1c';
  const body = torso(x, y + 80 * s, 120 * s, 140 * s);
  form(g, body, '#121a10', 0.5, x, y + 140 * s, s);
  g.save(); g.clip(body);
  for (let k = 0; k < 6; k++) stroke(g, [[x - 70 * s, y + (100 + k * 22) * s], [x, y + (108 + k * 22) * s], [x + 70 * s, y + (100 + k * 22) * s]], 'rgba(160,220,140,.14)', 2 * s);
  g.restore();
  for (const sx of [-1, 1]) {
    const pl = new Path2D(); pl.ellipse(x + sx * 44 * s, y + 90 * s, 26 * s, 13 * s, sx * 0.4, 0, Math.PI * 2);
    form(g, pl, '#26341f', 0.55, x + sx * 44 * s, y + 90 * s, s * 0.6);
  }
  // four jointed arms: the upper pair holds cards, the lower pair a chip and a glass
  arm(g, x + 46 * s, y + 96 * s, x + 66 * s, y + 140 * s, 20 * s, 5 * s, 4 * s, '#1a2416', 0.5);
  arm(g, x + 66 * s, y + 140 * s, x + 66 * s, y + 124 * s, 0, 4 * s, 3 * s, '#1a2416', 0.5);
  arm(g, x - 46 * s, y + 96 * s, x - 76 * s, y + 140 * s, -16 * s, 5 * s, 4 * s, '#1a2416', 0.5);
  arm(g, x - 30 * s, y + 130 * s, x - 50 * s, y + 175 * s, -8 * s, 4 * s, 3 * s, '#1a2416', 0.5);
  hand(g, x - 76 * s, y + 140 * s, s * 0.7, -0.4, '#2a3a24', 0.5, 1.8, 3);
  g.fillStyle = '#c23b2c'; g.beginPath(); g.ellipse(x - 50 * s, y + 180 * s, 9 * s, 4 * s, 0, 0, Math.PI * 2); g.fill();
  hand(g, x - 50 * s, y + 175 * s, s * 0.6, 0.2, '#2a3a24', 0.5, 1.8, 3);
  // head: narrow, segmented, compound eyes and mandibles
  const head = new Path2D();
  head.moveTo(x - 26 * s, y + 10 * s); head.quadraticCurveTo(x, y - 40 * s, x + 26 * s, y + 10 * s);
  head.quadraticCurveTo(x + 14 * s, y + 70 * s, x, y + 78 * s); head.quadraticCurveTo(x - 14 * s, y + 70 * s, x - 26 * s, y + 10 * s);
  form(g, head, shell, 0.65, x, y + 20 * s, s);
  stroke(g, [[x, y - 14 * s], [x, y + 74 * s]], 'rgba(0,0,0,.4)', 1.6 * s);
  for (let k = 0; k < 3; k++) stroke(g, [[x - 18 * s + k * 3 * s, y + (30 + k * 12) * s], [x + 18 * s - k * 3 * s, y + (30 + k * 12) * s]], 'rgba(0,0,0,.3)', 1.2 * s);
  for (const sx of [-1, 1]) {
    // compound eye: a dome of facets
    const eye = new Path2D(); eye.ellipse(x + sx * 18 * s, y + 14 * s, 11 * s, 15 * s, sx * 0.3, 0, Math.PI * 2);
    g.fillStyle = '#0a1608'; g.fill(eye);
    g.save(); g.clip(eye);
    for (let fy = -16; fy < 16; fy += 4) for (let fx = -12; fx < 12; fx += 4) {
      g.fillStyle = `rgba(120,255,90,${0.15 + 0.5 * Math.max(0, 1 - Math.hypot(fx + 4, fy + 6) / 14)})`;
      g.beginPath(); g.arc(x + sx * 18 * s + (fx + (fy / 4 % 2 ? 2 : 0)) * s, y + 14 * s + fy * s, 1.5 * s, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    glowDot(g, x + sx * 15 * s, y + 8 * s, 1.6 * s, 'rgba(160,255,120,.7)');
    const md = new Path2D(); md.moveTo(x + sx * 6 * s, y + 64 * s); md.quadraticCurveTo(x + sx * 22 * s, y + 74 * s, x + sx * 8 * s, y + 92 * s); md.quadraticCurveTo(x + sx * 14 * s, y + 76 * s, x + sx * 2 * s, y + 70 * s); md.closePath();
    form(g, md, '#3a3a20', 0.6, x + sx * 10 * s, y + 76 * s, s * 0.3);
    // antennae with glowing tips
    g.strokeStyle = 'rgba(140,170,120,.6)'; g.lineWidth = 2.2 * s;
    g.beginPath(); g.moveTo(x + sx * 8 * s, y - 14 * s); g.quadraticCurveTo(x + sx * 40 * s, y - 70 * s, x + sx * 70 * s, y - 60 * s); g.stroke();
    glowDot(g, x + sx * 70 * s, y - 60 * s, 2.4 * s, 'rgba(160,255,120,.8)');
  }
}

export function backroomImage() {
  if (url) return url;
  LX = 640; LY = 205;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(4242);

  // Room: dark warm walls, shelves of bottles, a neon glow far left
  const wall = g.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#120c12'); wall.addColorStop(0.6, '#1b1214'); wall.addColorStop(1, '#0a0709');
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.03)'; g.lineWidth = 2;
  for (let x = 40; x < W; x += 120) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H * 0.62); g.stroke(); }
  for (const sy of [150, 230]) {
    g.fillStyle = '#0a0607'; g.fillRect(860, sy, 340, 8);
    for (let k = 0; k < 11; k++) {
      const bx = 875 + k * 30 + r() * 8, bh = 30 + r() * 30;
      const hue = [30, 120, 200, 340, 45][Math.floor(r() * 5)];
      g.fillStyle = `hsla(${hue},60%,${18 + r() * 14}%,.9)`;
      g.fillRect(bx, sy - bh, 14, bh);
      g.fillRect(bx + 4, sy - bh - 12, 6, 12);
      g.fillStyle = `hsla(${hue},80%,70%,.25)`;
      g.fillRect(bx + 2, sy - bh + 4, 3, bh - 8);
    }
  }
  const neon = g.createRadialGradient(120, 160, 0, 120, 160, 260);
  neon.addColorStop(0, 'rgba(255,40,140,.32)'); neon.addColorStop(1, 'rgba(255,40,140,0)');
  g.fillStyle = neon; g.fillRect(0, 0, 500, 500);
  g.font = 'italic 700 46px Georgia, serif';
  g.fillStyle = 'rgba(255,90,170,.85)';
  g.shadowColor = 'rgba(255,60,160,.9)'; g.shadowBlur = 24;
  g.fillText('Lucky 7', 40, 175);
  g.shadowBlur = 0;

  // The lamp and its cone of light
  g.strokeStyle = '#050405'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(LX, 0); g.lineTo(LX, LY - 40); g.stroke();
  const cone = g.createRadialGradient(LX, LY, 10, LX, LY + 250, 520);
  cone.addColorStop(0, 'rgba(255,214,150,.42)'); cone.addColorStop(0.45, 'rgba(255,170,90,.12)'); cone.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = cone;
  g.beginPath(); g.moveTo(LX - 40, LY); g.lineTo(LX - 520, H); g.lineTo(LX + 520, H); g.lineTo(LX + 40, LY); g.closePath(); g.fill();
  g.fillStyle = '#16100c';
  g.beginPath(); g.moveTo(LX - 26, LY - 42); g.lineTo(LX + 26, LY - 42); g.lineTo(LX + 62, LY); g.lineTo(LX - 62, LY); g.closePath(); g.fill();
  glowDot(g, LX, LY + 2, 14, 'rgba(255,220,160,.9)');

  // Standing in the shadows at the back: the bouncer
  brute(g, r, 1040, 300, 1.15);
  // Around the table, back row
  squid(g, r, 410, 300, 1.0);
  grey(g, r, 640, 290, 0.95);
  hatMan(g, r, 860, 300, 1.0, { beard: true, tie: '#1c3a5a' });

  // The table: felt, wooden rim, cards, chips, glasses
  const TY = 545;
  g.fillStyle = '#2b1a10';
  g.beginPath(); g.ellipse(LX, TY + 10, 430, 122, 0, 0, Math.PI * 2); g.fill();
  const felt = g.createRadialGradient(LX, TY - 20, 20, LX, TY, 420);
  felt.addColorStop(0, '#2f7a46'); felt.addColorStop(0.7, '#164a2a'); felt.addColorStop(1, '#0c2416');
  g.fillStyle = felt;
  g.beginPath(); g.ellipse(LX, TY, 405, 106, 0, 0, Math.PI * 2); g.fill();
  // cards in the middle, chips, credits
  for (let k = 0; k < 5; k++) {
    g.save(); g.translate(LX - 90 + k * 44, TY - 6); g.scale(1, 0.4); g.rotate((r() - 0.5) * 0.3);
    g.fillStyle = '#f2ead8'; g.fillRect(-16, -24, 32, 46);
    g.fillStyle = k % 2 ? '#b8322a' : '#1d1d1d'; g.fillRect(-10, -18, 7, 7);
    g.restore();
  }
  for (const [cx, cy, col] of [[LX - 230, TY + 18, '#c23b2c'], [LX + 210, TY + 12, '#2b62c2'], [LX + 30, TY + 40, '#d9b02a'], [LX - 120, TY - 40, '#e8e8e8']]) {
    for (let k = 0; k < 4 + Math.floor(r() * 5); k++) {
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(cx, cy - k * 5 + 1, 15, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy - k * 5, 15, 6, 0, 0, Math.PI * 2); g.fill();
    }
  }
  for (const [gx, gy] of [[LX - 310, TY - 18], [LX + 320, TY - 22]]) {
    g.fillStyle = 'rgba(200,170,90,.35)'; g.fillRect(gx - 9, gy - 30, 18, 28);
    g.strokeStyle = 'rgba(255,240,210,.5)'; g.lineWidth = 1.5; g.strokeRect(gx - 9, gy - 30, 18, 28);
  }

  // The back row's hands on the table edge, an ashtray, dice
  squidHands(g, 410, 300, 1.0);
  greyHands(g, 640, 290, 0.95);
  manHands(g, 860, 300, 1.0);
  g.fillStyle = '#0c0c0e'; g.beginPath(); g.ellipse(LX + 120, TY - 34, 26, 9, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(200,200,210,.45)'; g.lineWidth = 2; g.stroke();
  stroke(g, [[LX + 110, TY - 36], [LX + 140, TY - 44]], '#6a4424', 5);
  glowDot(g, LX + 140, TY - 44, 2.4, 'rgba(255,120,40,.85)');
  smoke(g, LX + 140, TY - 46, 200, r);
  for (const [dx, dy, a] of [[LX - 40, TY + 30, 0.3], [LX - 14, TY + 36, -0.2]]) {
    g.save(); g.translate(dx, dy); g.rotate(a);
    g.fillStyle = '#e8e2d4'; g.beginPath(); g.roundRect(-8, -8, 16, 16, 3); g.fill();
    g.fillStyle = '#1a1a1a'; for (const [px, py] of [[-4, -4], [4, 4], [0, 0]]) { g.beginPath(); g.arc(px, py, 1.6, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }

  // Front: two players with their backs half to us, hands of cards
  insect(g, r, 230, 470, 1.05);
  hatMan(g, r, 1080, 480, 1.15, { back: true, coat: '#201a22', hat: '#1a1416', band: '#5a4a20' });
  cardsFan(g, 302, 598, 5, 0.5, 1.4);
  hand(g, 296, 604, 1.2, 0.5, '#2a3a24', 0.5, 1.8, 3);
  cardsFan(g, 985, 610, 4, -0.5, 1.5);
  hand(g, 992, 616, 1.4, -0.5, '#4a3226', 0.4);

  // Smoke hanging under the ceiling, vignette, grain
  for (let k = 0; k < 9; k++) {
    const sx = r() * W, sy = 80 + r() * 260, sr = 120 + r() * 200;
    const sm = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sm.addColorStop(0, 'rgba(150,140,150,.07)'); sm.addColorStop(1, 'rgba(150,140,150,0)');
    g.fillStyle = sm; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }
  const vig = g.createRadialGradient(LX, H * 0.55, H * 0.35, LX, H * 0.55, W * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.78)');
  g.fillStyle = vig; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);

  url = c.toDataURL('image/jpeg', 0.86);
  return url;
}

// A forearm from the elbow to the wrist: thick muscle near the elbow, a rounded wrist
function forearm(g, x0, y0, x1, y1, w0, w1, base) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const P = (t, o) => [x0 + dx * t + nx * o, y0 + dy * t + ny * o];
  const a = Math.atan2(ny, nx), p = new Path2D();
  p.moveTo(...P(0, w0));
  p.bezierCurveTo(...P(0.3, w0 * 1.3), ...P(0.7, w1 * 1.1), ...P(1, w1));
  p.arc(x1, y1, w1, a, a - Math.PI, true);
  p.bezierCurveTo(...P(0.7, -w1 * 1.05), ...P(0.3, -w0 * 1.15), ...P(0, -w0));
  p.closePath();
  form(g, p, base, 0.55, (x0 + x1) / 2, (y0 + y1) / 2, 1, 0.75);
  return p;
}

// A clenched fist: a block with knuckles and a thumb laid over the fingers; a = direction of the knuckles
function fist(g, x, y, a, sc, base) {
  const p = xf(p => { p.roundRect(-16, -13, 32, 26, 9); }, x, y, a, sc);
  form(g, p, base, 0.55, x, y, sc * 0.35, 0.8);
  g.save(); g.translate(x, y); g.rotate(a); g.scale(sc, sc);
  for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(10, -10 + k * 6.6); g.lineTo(16, -10 + k * 6.6); g.stroke(); }
  g.fillStyle = 'rgba(255,210,180,.16)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(13, -9 + k * 6.6, 2.4, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-10, 6); g.quadraticCurveTo(2, 2, 8, -6); g.stroke();   // thumb
  g.restore();
}

// The bouncer up close: horned, tusked, bare arms crossed over a leather vest
function bigBouncer(g, r) {
  const skin = '#4a2a22', dark = '#2a1612';
  // Torso in a leather vest, wide shoulders
  const body = new Path2D();
  body.moveTo(290, 720); body.bezierCurveTo(296, 560, 300, 400, 340, 345);
  body.quadraticCurveTo(380, 300, 450, 292); body.lineTo(830, 292);
  body.quadraticCurveTo(900, 300, 940, 345); body.bezierCurveTo(980, 400, 984, 560, 990, 720); body.closePath();
  form(g, body, '#1a100e', 0.45, 640, 480, 1.2, 0.6);
  // leather sheen and seams
  g.save(); g.clip(body);
  for (const x of [470, 810]) stroke(g, [[x, 300], [x + (x < 640 ? -20 : 20), 720]], 'rgba(0,0,0,.5)', 3);
  for (let k = 0; k < 9; k++) glowDot(g, 452 + k * 47, 304, 2.2, 'rgba(255,220,160,.4)');   // studs along the yoke
  const sheen = g.createLinearGradient(400, 300, 520, 620);
  sheen.addColorStop(0, 'rgba(255,220,190,.10)'); sheen.addColorStop(1, 'rgba(255,220,190,0)');
  g.fillStyle = sheen; g.fillRect(300, 290, 300, 430);
  g.restore();
  // bare chest in the vest's V, a gold chain
  const chest = new Path2D(); chest.moveTo(570, 292); chest.lineTo(710, 292); chest.lineTo(640, 460); chest.closePath();
  form(g, chest, skin, 0.55, 640, 360, 1);
  speckle(g, chest, 570, 292, 140, 170, 140, 'rgba(0,0,0,.25)', 1.2, r);
  stroke(g, [[612, 330], [640, 350], [668, 330]], 'rgba(0,0,0,.35)', 2.5);
  g.strokeStyle = 'rgba(225,180,80,.85)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(585, 300); g.quadraticCurveTo(640, 410, 695, 300); g.stroke();
  for (let k = 0; k < 12; k++) { const u = k / 11, x = (1 - u) * (1 - u) * 585 + 2 * u * (1 - u) * 640 + u * u * 695, y = (1 - u) * (1 - u) * 300 + 2 * u * (1 - u) * 410 + u * u * 300; glowDot(g, x, y, 1.6, 'rgba(255,220,140,.5)'); }
  // upper arms hanging at the sides, with a tattoo on the left one
  const upper = sx => {
    const p = new Path2D(), x = 640 + sx * 300;
    p.moveTo(x - sx * 50, 298);
    p.bezierCurveTo(x + sx * 40, 284, x + sx * 92, 330, x + sx * 80, 410);     // round shoulder
    p.bezierCurveTo(x + sx * 74, 470, x + sx * 56, 540, x + sx * 22, 586);     // biceps down to the elbow
    p.lineTo(x - sx * 54, 586);
    p.bezierCurveTo(x - sx * 70, 520, x - sx * 74, 420, x - sx * 62, 340); p.closePath();
    return p;
  };
  for (const sx of [-1, 1]) {
    const ua = upper(sx), x = 640 + sx * 300;
    form(g, ua, skin, 0.5, x, 430, 1.2, 0.7);
    speckle(g, ua, x - 80, 300, 160, 280, 120, 'rgba(0,0,0,.22)', 1.4, r);
    stroke(g, [[x + sx * 40, 360], [x + sx * 52, 420], [x + sx * 40, 480]], 'rgba(255,200,170,.18)', 4);   // biceps
    stroke(g, [[x - sx * 30, 350], [x - sx * 22, 420]], 'rgba(0,0,0,.3)', 3);
  }
  g.save(); g.clip(upper(-1));
  g.strokeStyle = 'rgba(40,140,150,.45)'; g.lineWidth = 4;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(300, 360 + k * 26); g.lineTo(326, 348 + k * 26); g.lineTo(352, 364 + k * 26); g.lineTo(378, 350 + k * 26); g.stroke(); }
  g.font = '700 46px Georgia, serif'; g.fillStyle = 'rgba(40,140,150,.4)'; g.textAlign = 'center'; g.fillText('♠', 345, 470);
  g.restore();
  // crossed forearms: the left one under, the right one over it, round elbows at the sides
  for (const sx of [-1, 1]) { const el = new Path2D(); el.ellipse(640 + sx * 280, 556, 52, 42, 0, 0, Math.PI * 2); form(g, el, skin, 0.5, 640 + sx * 280, 556, 1, 0.7); }
  forearm(g, 380, 566, 822, 490, 46, 30, skin);
  fist(g, 852, 482, -0.5, 2.0, skin);                     // its fist pressed against the right biceps
  const fr = forearm(g, 900, 566, 456, 490, 48, 32, skin);
  g.save(); g.clip(fr);
  stroke(g, [[840, 548], [640, 520], [500, 506]], 'rgba(255,200,170,.14)', 3);   // tendons
  stroke(g, [[800, 562], [640, 538]], 'rgba(0,0,0,.25)', 2.5);
  speckle(g, fr, 450, 470, 450, 110, 120, 'rgba(0,0,0,.2)', 1.3, r);
  g.restore();
  fist(g, 428, 484, Math.PI + 0.5, 2.1, skin);            // and the other one on the left biceps
  for (let k = 0; k < 3; k++) { g.strokeStyle = '#d8a83a'; g.lineWidth = 2.6; g.beginPath(); g.ellipse(406 + k * 3, 470 + k * 13, 4, 6, 0.4, 0, Math.PI * 2); g.stroke(); }   // knuckle rings
  stroke(g, [[700, 470], [760, 520]], 'rgba(230,170,150,.4)', 3);   // a scar over the forearm

  // thick neck with folds
  const neck = new Path2D(); neck.moveTo(578, 230); neck.lineTo(702, 230); neck.quadraticCurveTo(712, 286, 770, 302); neck.lineTo(510, 302); neck.quadraticCurveTo(568, 286, 578, 230); neck.closePath();
  form(g, neck, skin, 0.5, 640, 270, 1.2);
  stroke(g, [[590, 286], [640, 294], [690, 286]], 'rgba(0,0,0,.35)', 3);
  // head: broad jaw, narrow crown
  const head = new Path2D();
  head.moveTo(640, 108); head.bezierCurveTo(700, 108, 730, 150, 728, 200);
  head.bezierCurveTo(728, 250, 708, 284, 640, 290); head.bezierCurveTo(572, 284, 552, 250, 552, 200);
  head.bezierCurveTo(550, 150, 580, 108, 640, 108); head.closePath();
  // pointed ears with rings first, behind the head
  for (const sx of [-1, 1]) {
    const ear = new Path2D(); ear.moveTo(640 + sx * 82, 186); ear.quadraticCurveTo(640 + sx * 128, 160, 640 + sx * 136, 150); ear.quadraticCurveTo(640 + sx * 116, 200, 640 + sx * 84, 222); ear.closePath();
    form(g, ear, skin, 0.5, 640 + sx * 105, 190, 1);
    for (let k = 0; k < 3; k++) { g.strokeStyle = '#d8a83a'; g.lineWidth = 2; g.beginPath(); g.arc(640 + sx * (112 - k * 7), 184 + k * 9, 4, 0, Math.PI * 2); g.stroke(); }
  }
  form(g, head, skin, 0.62, 640, 190, 1.2, 0.75);
  speckle(g, head, 550, 108, 180, 182, 260, 'rgba(0,0,0,.22)', 1.6, r);
  speckle(g, head, 550, 108, 180, 182, 60, 'rgba(255,210,180,.1)', 1.4, r);
  // heavy brow, deep eyes glowing red
  const brow = new Path2D(); brow.moveTo(570, 172); brow.quadraticCurveTo(640, 140, 710, 172); brow.quadraticCurveTo(640, 166, 570, 182); brow.closePath();
  form(g, brow, '#3a2018', 0.6, 640, 160, 1);
  for (const sx of [-1, 1]) {
    g.fillStyle = '#0c0504'; g.beginPath(); g.ellipse(640 + sx * 30, 186, 17, 9, sx * -0.15, 0, Math.PI * 2); g.fill();
    glowDot(g, 640 + sx * 30, 186, 4.5, 'rgba(255,50,30,.95)');
    stroke(g, [[640 + sx * 50, 196], [640 + sx * 44, 214]], 'rgba(0,0,0,.35)', 2);
  }
  stroke(g, [[598, 140], [612, 174], [606, 206]], 'rgba(230,170,150,.4)', 2.5);   // scar through the brow
  // broad nose with a gold ring
  const nose = new Path2D(); nose.moveTo(628, 190); nose.quadraticCurveTo(616, 222, 618, 232); nose.quadraticCurveTo(640, 244, 662, 232); nose.quadraticCurveTo(664, 222, 652, 190); nose.closePath();
  form(g, nose, '#55322a', 0.6, 640, 220, 0.8);
  for (const sx of [-1, 1]) { g.fillStyle = 'rgba(0,0,0,.75)'; g.beginPath(); g.ellipse(640 + sx * 10, 232, 5, 3, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#e0b04a'; g.lineWidth = 3; g.beginPath(); g.arc(640, 242, 8, 0.15, Math.PI - 0.15); g.stroke();
  // mouth, lower tusks
  stroke(g, [[598, 262], [620, 266], [660, 266], [682, 262]], 'rgba(10,4,2,.9)', 3.5);
  for (const sx of [-1, 1]) {
    const tusk = new Path2D(); tusk.moveTo(640 + sx * 28, 268); tusk.quadraticCurveTo(640 + sx * 46, 250, 640 + sx * 40, 222); tusk.quadraticCurveTo(640 + sx * 36, 248, 640 + sx * 18, 266); tusk.closePath();
    form(g, tusk, '#a89878', 0.65, 640 + sx * 34, 248, 0.6);
  }
  // horns with growth rings
  for (const sx of [-1, 1]) {
    const h = new Path2D();
    h.moveTo(640 + sx * 34, 126); h.bezierCurveTo(640 + sx * 90, 90, 640 + sx * 150, 80, 640 + sx * 160, 14);
    h.bezierCurveTo(640 + sx * 136, 76, 640 + sx * 104, 112, 640 + sx * 76, 162); h.closePath();
    form(g, h, '#4a3c30', 0.65, 640 + sx * 100, 90, 1);
    g.save(); g.clip(h);
    for (let k = 0; k < 9; k++) { const u = k / 9; stroke(g, [[640 + sx * (60 + u * 80), 150 - u * 120], [640 + sx * (80 + u * 84), 120 - u * 100]], 'rgba(0,0,0,.4)', 2); }
    g.restore();
  }
  // earpiece with its coiled cable into the collar
  glowDot(g, 554, 204, 4, 'rgba(90,240,255,.9)');
  g.strokeStyle = 'rgba(200,210,220,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(552, 210);
  for (let k = 0; k < 14; k++) g.lineTo(550 + (k % 2 ? 6 : -6), 214 + k * 6);
  g.stroke();
}

/* ---------- The bouncer, painted for realism (Björn: more detail, less comic) ----------
   No outlines: every part is filled, lit by a soft highlight toward the lamp, given skin or
   leather grain, and darkened at its edges with a blurred stroke, so it reads as volume. */
let grain = null;
function grainPattern(g) {
  if (grain) return grain;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), img = x.createImageData(256, 256), r = rng(99);
  for (let i = 0; i < img.data.length; i += 4) { const v = 110 + r() * 40 + (r() < 0.04 ? -60 : 0); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  for (let k = 0; k < 90; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '40,30,25' : '200,180,160'},.12)`; x.beginPath(); x.arc(r() * 256, r() * 256, 2 + r() * 9, 0, Math.PI * 2); x.fill(); }
  return (grain = g.createPattern(c, 'repeat'));
}
// Fill a part: base colour, a soft key light at (hx, hy), grain, darkened edges
function soft(g, path, base, hx, hy, rad, o = {}) {
  const k = o.k ?? 1;
  g.save();
  g.clip(path);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const gr = g.createRadialGradient(hx, hy, 0, hx, hy, rad);
  gr.addColorStop(0, `rgba(255,212,165,${0.42 * k})`); gr.addColorStop(0.55, `rgba(240,170,120,${0.13 * k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  if (o.sheen) {   // leather or ivory: a sharper glossy streak
    const sg = g.createRadialGradient(hx, hy, 0, hx, hy, rad * 0.35);
    sg.addColorStop(0, `rgba(255,236,210,${o.sheen})`); sg.addColorStop(1, 'rgba(255,236,210,0)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
  }
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = o.grain ?? 0.55;
  g.fillStyle = grainPattern(g); g.fillRect(0, 0, W, H);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.filter = `blur(${o.blur ?? 9}px)`;
  g.strokeStyle = `rgba(8,4,3,${o.edge ?? 0.7})`; g.lineWidth = o.edgeW ?? 24; g.stroke(path);
  g.filter = 'none';
  g.restore();
}
// A soft line: wrinkles, creases, veins, scars
function sline(g, pts, color, w, blur = 1.5) {
  g.save(); g.filter = `blur(${blur}px)`;
  stroke(g, pts, color, w);
  g.restore();
}
// A soft blob of light or shadow
function blob(g, x, y, rx, ry, color, blur = 8, a = 0) {
  g.save(); g.filter = `blur(${blur}px)`; g.fillStyle = color;
  g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill(); g.restore();
}

function realBouncer(g, r) {
  const skin = '#5a3a2e', skinD = '#3a241c', leather = '#0e0909';
  const L = (x, y) => [640 + (x - 640) * 0.35, 40 + (y - 40) * 0.35];   // highlight leans toward the lamp above
  // Cast shadow on the door behind him
  blob(g, 660, 330, 300, 240, 'rgba(0,0,0,.55)', 30);

  // Torso in a leather vest
  const body = new Path2D();
  body.moveTo(290, 720); body.bezierCurveTo(296, 560, 300, 400, 340, 345);
  body.quadraticCurveTo(380, 300, 450, 292); body.lineTo(830, 292);
  body.quadraticCurveTo(900, 300, 940, 345); body.bezierCurveTo(980, 400, 984, 560, 990, 720); body.closePath();
  soft(g, body, leather, 560, 320, 260, { k: 0.35, sheen: 0.08, grain: 0.5, edgeW: 40, blur: 16 });
  for (const [x, y, a] of [[520, 420, 0.3], [770, 430, -0.3], [600, 650, 0.1]]) blob(g, x, y, 14, 90, 'rgba(255,225,200,.07)', 12, a);   // leather sheen
  g.save(); g.clip(body);
  for (const x of [470, 810]) { sline(g, [[x, 300], [x + (x < 640 ? -22 : 22), 720]], 'rgba(0,0,0,.6)', 4, 1); g.setLineDash([5, 6]); sline(g, [[x + 7, 300], [x + 7 + (x < 640 ? -22 : 22), 720]], 'rgba(200,170,130,.25)', 1.2, 0.3); g.setLineDash([]); }
  for (let k = 0; k < 6; k++) sline(g, [[380 + k * 40, 600 + (k % 2) * 30], [420 + k * 40, 640 + (k % 3) * 20]], 'rgba(255,220,190,.05)', 8, 6);   // creases
  for (let k = 0; k < 9; k++) { const x = 452 + k * 47; blob(g, x, 306, 4, 4, '#3a3028', 0.5); blob(g, x - 1, 304.5, 1.6, 1.6, 'rgba(255,240,210,.9)', 0.6); }
  g.restore();
  // Bare chest in the vest's V: pecs, hair, a heavy gold chain
  const chest = new Path2D(); chest.moveTo(566, 292); chest.lineTo(714, 292); chest.lineTo(640, 470); chest.closePath();
  soft(g, chest, skin, 640, 320, 170, { edgeW: 30, blur: 12 });
  g.save(); g.clip(chest);
  sline(g, [[600, 352], [640, 372], [680, 352]], 'rgba(0,0,0,.45)', 5, 4);
  sline(g, [[640, 300], [640, 460]], 'rgba(0,0,0,.25)', 4, 3);
  for (let k = 0; k < 160; k++) { const x = 600 + r() * 80, y = 330 + r() * 100; sline(g, [[x, y], [x + (r() - 0.5) * 6, y + 4 + r() * 4]], 'rgba(20,10,6,.5)', 0.9, 0.2); }
  g.restore();
  for (let k = 0; k < 22; k++) {
    const u = k / 21, x = (1 - u) * (1 - u) * 584 + 2 * u * (1 - u) * 640 + u * u * 696, y = (1 - u) * (1 - u) * 298 + 2 * u * (1 - u) * 418 + u * u * 298;
    g.save(); g.translate(x, y); g.rotate(u * 3);
    g.fillStyle = '#7a5a1a'; g.beginPath(); g.ellipse(0, 0, 5, 3.4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8c060'; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = 'rgba(255,245,200,.9)'; g.beginPath(); g.arc(-1.5, -1.5, 1, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // Upper arms: deltoid, biceps, a faded tattoo, veins
  const upper = sx => {
    const p = new Path2D(), x = 640 + sx * 300;
    p.moveTo(x - sx * 50, 298);
    p.bezierCurveTo(x + sx * 40, 284, x + sx * 92, 330, x + sx * 80, 410);
    p.bezierCurveTo(x + sx * 74, 470, x + sx * 56, 540, x + sx * 22, 586);
    p.lineTo(x - sx * 54, 586);
    p.bezierCurveTo(x - sx * 70, 520, x - sx * 74, 420, x - sx * 62, 340); p.closePath();
    return p;
  };
  for (const sx of [-1, 1]) {
    const ua = upper(sx), x = 640 + sx * 300;
    soft(g, ua, skin, x - sx * 10, 340, 220, { edgeW: 36, blur: 14 });
    g.save(); g.clip(ua);
    blob(g, x - sx * 40, 470, 40, 120, 'rgba(0,0,0,.35)', 18);                // the side away from the light
    blob(g, x + sx * 28, 440, 34, 60, 'rgba(255,200,160,.16)', 14);           // biceps
    blob(g, x + sx * 10, 330, 60, 30, 'rgba(255,210,170,.18)', 14);           // deltoid
    sline(g, [[x + sx * 6, 380], [x + sx * 20, 470], [x + sx * 4, 560]], 'rgba(0,0,0,.35)', 6, 5);   // the cleft
    sline(g, [[x + sx * 40, 470], [x + sx * 46, 520], [x + sx * 38, 570]], 'rgba(80,50,60,.5)', 2, 0.8);   // vein
    g.restore();
  }
  g.save(); g.clip(upper(-1));
  g.globalAlpha = 0.5; g.filter = 'blur(0.8px)';
  g.strokeStyle = '#1f4a50'; g.lineWidth = 3.5;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(300, 360 + k * 26); g.lineTo(326, 348 + k * 26); g.lineTo(352, 364 + k * 26); g.lineTo(378, 350 + k * 26); g.stroke(); }
  g.font = '700 46px Georgia, serif'; g.fillStyle = '#1f4a50'; g.textAlign = 'center'; g.fillText('♠', 345, 470);
  g.restore();

  // Crossed forearms: elbows, the left forearm under, the right over it, fists
  for (const sx of [-1, 1]) { const el = new Path2D(); el.ellipse(640 + sx * 280, 556, 52, 42, 0, 0, Math.PI * 2); soft(g, el, skinD, 640 + sx * 270, 530, 70, { edgeW: 26, blur: 10 }); }
  const fore = (x0, y0, x1, y1, w0, w1) => {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    const P = (t, o) => [x0 + dx * t + nx * o, y0 + dy * t + ny * o];
    const a = Math.atan2(ny, nx), p = new Path2D();
    p.moveTo(...P(0, w0)); p.bezierCurveTo(...P(0.3, w0 * 1.3), ...P(0.7, w1 * 1.1), ...P(1, w1));
    p.arc(x1, y1, w1, a, a - Math.PI, true);
    p.bezierCurveTo(...P(0.7, -w1 * 1.05), ...P(0.3, -w0 * 1.15), ...P(0, -w0)); p.closePath();
    return p;
  };
  const f1 = fore(380, 566, 822, 490, 46, 30);
  soft(g, f1, skinD, 600, 500, 300, { edgeW: 30, blur: 12 });
  const fistAt = (x, y, a, sc) => {
    const p = xf(p => { p.roundRect(-16, -13, 32, 26, 10); }, x, y, a, sc);
    soft(g, p, skin, x, y - 10, 50, { edgeW: 18, blur: 7 });
    g.save(); g.translate(x, y); g.rotate(a); g.scale(sc, sc);
    for (let k = 0; k < 4; k++) { blob(g, 12, -9 + k * 6.6, 3, 2.6, 'rgba(255,210,180,.22)', 1.2); sline(g, [[8, -6 + k * 6.6], [16, -6 + k * 6.6]], 'rgba(0,0,0,.45)', 1, 0.5); }
    sline(g, [[-11, 7], [2, 2], [9, -6]], 'rgba(0,0,0,.5)', 1.6, 0.8);
    g.restore();
  };
  fistAt(852, 482, -0.5, 2.0);
  const f2 = fore(900, 566, 456, 490, 48, 32);
  soft(g, f2, skin, 680, 500, 320, { edgeW: 32, blur: 12 });
  g.save(); g.clip(f2);
  blob(g, 760, 520, 120, 18, 'rgba(255,205,170,.16)', 10, -0.17);   // the muscle's crest
  sline(g, [[840, 548], [700, 528], [560, 512], [500, 506]], 'rgba(70,40,50,.5)', 2.2, 0.8);   // vein
  sline(g, [[700, 470], [760, 520]], 'rgba(220,150,140,.6)', 3, 1);    // scar
  sline(g, [[703, 474], [763, 524]], 'rgba(0,0,0,.4)', 1.4, 0.6);
  g.restore();
  fistAt(428, 484, Math.PI + 0.5, 2.1);
  for (let k = 0; k < 3; k++) { g.strokeStyle = '#c89a3a'; g.lineWidth = 3; g.beginPath(); g.ellipse(406 + k * 3, 470 + k * 13, 4, 6, 0.4, 0, Math.PI * 2); g.stroke(); blob(g, 404 + k * 3, 466 + k * 13, 1.4, 1.4, 'rgba(255,240,200,.9)', 0.4); }

  // Neck
  const neck = new Path2D(); neck.moveTo(578, 230); neck.lineTo(702, 230); neck.quadraticCurveTo(712, 286, 770, 302); neck.lineTo(510, 302); neck.quadraticCurveTo(568, 286, 578, 230); neck.closePath();
  soft(g, neck, skinD, 640, 250, 120, { edgeW: 30, blur: 12 });
  sline(g, [[600, 280], [640, 290], [680, 280]], 'rgba(0,0,0,.4)', 4, 3);
  blob(g, 640, 300, 110, 14, 'rgba(0,0,0,.5)', 8);   // chin shadow on the neck

  // Ears with rings, behind the head
  for (const sx of [-1, 1]) {
    const ear = new Path2D(); ear.moveTo(640 + sx * 82, 186); ear.quadraticCurveTo(640 + sx * 128, 160, 640 + sx * 136, 150); ear.quadraticCurveTo(640 + sx * 116, 200, 640 + sx * 84, 222); ear.closePath();
    soft(g, ear, skinD, 640 + sx * 110, 170, 40, { edgeW: 10, blur: 4 });
    for (let k = 0; k < 3; k++) { g.strokeStyle = '#c89a3a'; g.lineWidth = 2; g.beginPath(); g.arc(640 + sx * (112 - k * 7), 184 + k * 9, 4, 0, Math.PI * 2); g.stroke(); }
  }
  // Head
  const head = new Path2D();
  head.moveTo(640, 108); head.bezierCurveTo(700, 108, 730, 150, 728, 200);
  head.bezierCurveTo(728, 250, 708, 284, 640, 290); head.bezierCurveTo(572, 284, 552, 250, 552, 200);
  head.bezierCurveTo(550, 150, 580, 108, 640, 108); head.closePath();
  soft(g, head, skin, 636, 132, 150, { edgeW: 30, blur: 12, grain: 0.75 });
  g.save(); g.clip(head);
  // modelling: cheekbones, temples, jaw
  for (const sx of [-1, 1]) {
    blob(g, 640 + sx * 50, 222, 22, 14, 'rgba(255,205,170,.17)', 8);
    blob(g, 640 + sx * 72, 160, 16, 30, 'rgba(0,0,0,.25)', 10);
    blob(g, 640 + sx * 52, 262, 30, 16, 'rgba(0,0,0,.3)', 10);
  }
  // pores and stubble
  for (let k = 0; k < 700; k++) { const x = 560 + r() * 160, y = 110 + r() * 180; g.fillStyle = r() < 0.5 ? 'rgba(20,10,6,.25)' : 'rgba(255,210,180,.08)'; g.fillRect(x, y, 1.2, 1.2); }
  for (let k = 0; k < 260; k++) { const x = 586 + r() * 108, y = 240 + r() * 46; g.fillStyle = 'rgba(15,8,5,.45)'; g.fillRect(x, y, 1, 1.6); }
  // forehead folds
  for (let k = 0; k < 3; k++) sline(g, [[602 + k * 4, 130 + k * 8], [640, 124 + k * 8], [678 - k * 4, 130 + k * 8]], 'rgba(0,0,0,.35)', 2.2, 1.4);
  g.restore();
  // Heavy brow, deep sockets, glowing eyes
  const brow = new Path2D(); brow.moveTo(568, 172); brow.quadraticCurveTo(640, 138, 712, 172); brow.quadraticCurveTo(640, 166, 568, 184); brow.closePath();
  soft(g, brow, skin, 640, 150, 80, { edgeW: 8, blur: 4, k: 1.3 });
  for (const sx of [-1, 1]) {
    blob(g, 640 + sx * 30, 188, 26, 14, 'rgba(0,0,0,.75)', 5);
    g.fillStyle = '#2a0a06'; g.beginPath(); g.ellipse(640 + sx * 30, 187, 13, 6.5, sx * -0.15, 0, Math.PI * 2); g.fill();
    const ir = g.createRadialGradient(640 + sx * 30, 187, 0, 640 + sx * 30, 187, 7);
    ir.addColorStop(0, '#ffd0a0'); ir.addColorStop(0.3, '#ff4020'); ir.addColorStop(1, 'rgba(120,10,0,0)');
    g.fillStyle = ir; g.beginPath(); g.ellipse(640 + sx * 30, 187, 7, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#100200'; g.fillRect(640 + sx * 30 - 1, 182, 2, 10);   // slit pupil
    blob(g, 640 + sx * 30, 187, 18, 12, 'rgba(255,60,30,.35)', 8);         // glow
    blob(g, 640 + sx * 30 - 4, 184, 1.6, 1.2, 'rgba(255,255,255,.9)', 0.3);
    sline(g, [[640 + sx * 44, 196], [640 + sx * 50, 210]], 'rgba(0,0,0,.4)', 2, 1);   // crow's feet
  }
  sline(g, [[598, 140], [612, 174], [606, 206]], 'rgba(200,130,120,.7)', 3, 0.8);   // scar through the brow
  sline(g, [[601, 140], [615, 174], [609, 206]], 'rgba(0,0,0,.4)', 1.4, 0.5);
  // Nose with a gold ring
  const nose = new Path2D(); nose.moveTo(628, 188); nose.quadraticCurveTo(614, 222, 616, 234); nose.quadraticCurveTo(640, 246, 664, 234); nose.quadraticCurveTo(666, 222, 652, 188); nose.closePath();
  soft(g, nose, skin, 638, 206, 40, { edgeW: 10, blur: 4, k: 1.2 });
  for (const sx of [-1, 1]) blob(g, 640 + sx * 10, 233, 5, 3, 'rgba(10,3,2,.9)', 1);
  g.strokeStyle = '#c89a3a'; g.lineWidth = 3.2; g.beginPath(); g.arc(640, 243, 8, 0.15, Math.PI - 0.15); g.stroke();
  blob(g, 634, 249, 1.6, 1.2, 'rgba(255,240,200,.9)', 0.4);
  // Mouth, lips, lower tusks
  sline(g, [[596, 262], [620, 267], [660, 267], [684, 262]], 'rgba(8,2,1,.95)', 3.5, 0.8);
  blob(g, 640, 274, 30, 5, 'rgba(255,200,170,.12)', 3);
  for (const sx of [-1, 1]) {
    const tusk = new Path2D(); tusk.moveTo(640 + sx * 28, 268); tusk.quadraticCurveTo(640 + sx * 48, 250, 640 + sx * 41, 220); tusk.quadraticCurveTo(640 + sx * 36, 248, 640 + sx * 17, 266); tusk.closePath();
    soft(g, tusk, '#b8a888', 640 + sx * 38, 232, 30, { edgeW: 6, blur: 2.5, sheen: 0.5, grain: 0.3 });
    sline(g, [[640 + sx * 30, 258], [640 + sx * 36, 246]], 'rgba(60,40,20,.5)', 1, 0.4);   // a crack
  }
  // Horns: gradient from dark root to pale tip, growth grooves
  for (const sx of [-1, 1]) {
    const h = new Path2D();
    h.moveTo(640 + sx * 34, 126); h.bezierCurveTo(640 + sx * 90, 90, 640 + sx * 150, 80, 640 + sx * 160, 14);
    h.bezierCurveTo(640 + sx * 136, 76, 640 + sx * 104, 112, 640 + sx * 76, 162); h.closePath();
    soft(g, h, '#3a3028', 640 + sx * 110, 70, 90, { edgeW: 8, blur: 3, sheen: 0.25 });
    g.save(); g.clip(h);
    const tip = g.createLinearGradient(640 + sx * 60, 140, 640 + sx * 160, 14);
    tip.addColorStop(0, 'rgba(0,0,0,0)'); tip.addColorStop(1, 'rgba(220,205,170,.55)');
    g.fillStyle = tip; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 12; k++) { const u = k / 12; sline(g, [[640 + sx * (58 + u * 86), 150 - u * 124], [640 + sx * (80 + u * 84), 118 - u * 100]], 'rgba(0,0,0,.45)', 1.6, 0.7); }
    g.restore();
  }
  // Earpiece with its coiled cable
  blob(g, 554, 204, 5, 5, '#1a1c20', 0.5);
  glowDot(g, 554, 204, 2.6, 'rgba(90,240,255,.9)');
  g.save(); g.filter = 'blur(0.4px)'; g.strokeStyle = 'rgba(180,190,200,.45)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(552, 210);
  for (let k = 0; k < 16; k++) g.lineTo(550 + (k % 2 ? 5 : -5), 213 + k * 5.5);
  g.stroke(); g.restore();
}

// The bouncer in front of the back room's door (Björn: a real bouncer when the door is closed).
// Same painter as the card players: a narrow corridor, a heavy door with a peephole, a caged lamp,
// a velvet rope, and the horned brute filling the doorway.
export function bouncerImage() {
  if (bouncerUrl) return bouncerUrl;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(707);
  LX = 640; LY = 34;

  // Corridor: warm dark walls, wainscot, a floor running away
  const wall = g.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#1a0f10'); wall.addColorStop(0.7, '#241416'); wall.addColorStop(1, '#0c0708');
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 64) { g.fillStyle = `rgba(255,220,200,${0.015 + r() * 0.02})`; g.fillRect(x, 0, 2, H * 0.62); }
  g.fillStyle = '#120a0a'; g.fillRect(0, H * 0.62, W, 6);
  const floor = g.createLinearGradient(0, H * 0.63, 0, H);
  floor.addColorStop(0, '#140c0c'); floor.addColorStop(1, '#060404');
  g.fillStyle = floor; g.fillRect(0, H * 0.63, W, H);
  g.strokeStyle = 'rgba(255,255,255,.03)'; g.lineWidth = 2;
  for (let k = -8; k <= 8; k++) { g.beginPath(); g.moveTo(640 + k * 30, H * 0.63); g.lineTo(640 + k * 190, H); g.stroke(); }

  // The door: dark wood, brass studs, a lit peephole, a sign above it
  const door = new Path2D(); door.rect(440, 70, 400, 400);
  lit(g, door, '#1c100c', 0.5);
  g.strokeStyle = '#0a0505'; g.lineWidth = 10; g.strokeRect(440, 70, 400, 400);
  for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(465 + k * 0, 95 + k * 95, 350, 80); }
  for (let y = 90; y < 470; y += 38) for (const x of [455, 825]) glowDot(g, x, y, 2, 'rgba(255,200,120,.35)');
  g.fillStyle = '#ffcf7a'; g.fillRect(600, 128, 80, 12);
  g.fillStyle = 'rgba(255,200,120,.25)'; g.fillRect(590, 120, 100, 28);
  g.font = '700 46px Georgia, serif'; g.textAlign = 'center';
  g.fillStyle = 'rgba(255,70,90,.9)'; g.shadowColor = 'rgba(255,40,70,.95)'; g.shadowBlur = 26;
  g.fillText('♠ PRIVAT ♠', 640, 58);
  g.shadowBlur = 0;
  const neon = g.createRadialGradient(640, 50, 0, 640, 50, 420);
  neon.addColorStop(0, 'rgba(255,40,80,.22)'); neon.addColorStop(1, 'rgba(255,40,80,0)');
  g.fillStyle = neon; g.fillRect(0, 0, W, H);

  // Caged lamp and its cone
  const cone = g.createRadialGradient(LX, LY, 10, LX, LY + 300, 640);
  cone.addColorStop(0, 'rgba(255,214,150,.38)'); cone.addColorStop(0.5, 'rgba(255,170,90,.1)'); cone.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = cone;
  g.beginPath(); g.moveTo(LX - 30, LY); g.lineTo(LX - 620, H); g.lineTo(LX + 620, H); g.lineTo(LX + 30, LY); g.closePath(); g.fill();

  // Velvet rope between brass posts on either side
  for (const sx of [-1, 1]) {
    const px = 640 + sx * 470;
    const post = new Path2D(); post.rect(px - 7, 470, 14, 190); post.ellipse(px, 466, 12, 12, 0, 0, Math.PI * 2); post.ellipse(px, 662, 30, 9, 0, 0, Math.PI * 2);
    form(g, post, '#6a4a1c', 0.7, px, 560, 1.4);
    g.strokeStyle = '#5a0e18'; g.lineWidth = 11; g.lineCap = 'round';
    g.beginPath(); g.moveTo(px, 480); g.quadraticCurveTo(px - sx * 120, 580, px - sx * 230, 500); g.stroke();
    g.strokeStyle = 'rgba(255,120,140,.25)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(px, 476); g.quadraticCurveTo(px - sx * 120, 576, px - sx * 230, 496); g.stroke();
  }

  // The bouncer himself, filling the door; an earpiece with a blinking light, a chain
  // Depth of field: the corridor behind him goes soft
  const bg = document.createElement('canvas'); bg.width = W; bg.height = H; bg.getContext('2d').drawImage(c, 0, 0);
  g.filter = 'blur(3px)'; g.drawImage(bg, 0, 0); g.filter = 'none';
  realBouncer(g, r);
  // Colour grade: warm light from above, cool shadows below
  g.globalCompositeOperation = 'soft-light';
  const grade = g.createLinearGradient(0, 0, 0, H);
  grade.addColorStop(0, 'rgba(255,170,90,.5)'); grade.addColorStop(1, 'rgba(40,60,110,.55)');
  g.fillStyle = grade; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';

  // Smoke, vignette, grain
  for (let k = 0; k < 7; k++) {
    const sx = r() * W, sy = 60 + r() * 300, sr = 140 + r() * 200;
    const sm = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sm.addColorStop(0, 'rgba(150,140,150,.06)'); sm.addColorStop(1, 'rgba(150,140,150,0)');
    g.fillStyle = sm; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }
  const vig = g.createRadialGradient(640, H * 0.45, H * 0.3, 640, H * 0.45, W * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.8)');
  g.fillStyle = vig; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);

  LX = 640; LY = 205;
  bouncerUrl = c.toDataURL('image/jpeg', 0.86);
  return bouncerUrl;
}
