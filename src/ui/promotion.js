// Promotion ceremony (Björn missed his promotion in the heat of battle): in flight a fanfare,
// a long banner and a radio message from fleet command; at the next docking a ceremony with the
// new shoulder board, what the rank unlocks and how far the next one is.
// p.rankSeen remembers the last rank that got its ceremony (old saves get one for their rank).
import { G } from '../ctx.js';
import { RANKS, RANK_GATE } from '../config.js';
import { rankOf, saveProfile } from '../game/save.js';
import { sfxFanfare } from '../core/audio.js';

let el = null;

// Rank badge in space-opera style (Björn found the shoulder boards dull): a bevelled fleet shield
// in polished metal with an enamel field. Silver with chevrons for the junior ranks, gold with
// faceted stars from Lt. Commander, a planet ring from Commander, a sun corona and a crimson
// field with a jewel for the flag officers. Deliberately a shield, not an arrowhead (no borrowed emblem). Drawn once per rank on a canvas.
const boards = new Map();
const METALS = {
  silver: ['#4a525b', '#aab4be', '#ffffff', '#c9d1d8', '#5d6670'],
  gold: ['#6e4f10', '#d6a83a', '#fff3c0', '#f7d774', '#8a6514'],
};
export function insigniaImage(index) {
  if (boards.has(index)) return boards.get(index);
  const W = 560, H = 400, cx = W / 2, cy = 185, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const flag = index >= 6, metal = METALS[index >= 3 ? 'gold' : 'silver'];
  const sheen = (x0, y0, x1, y1, m = metal) => { const q = g.createLinearGradient(x0, y0, x1, y1); [0, 0.3, 0.5, 0.7, 1].forEach((t, k) => q.addColorStop(t, m[k])); return q; };
  const dark = index >= 3 ? 'rgba(70,48,10,.85)' : 'rgba(30,36,44,.85)';

  // soft glow behind the badge
  const glow = g.createRadialGradient(cx, cy, 10, cx, cy, 250);
  glow.addColorStop(0, flag ? 'rgba(255,190,90,.38)' : index >= 3 ? 'rgba(255,205,110,.3)' : 'rgba(150,200,255,.28)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  // Björn found wings too much and wanted the theme instead (suns, ringed planets)
  // the ring: a flat band like a ringed planet's, with grooves; back half behind the shield, front half over it
  const hasRing = index >= 4, RY = 214, TILT = -0.16;
  const ringBand = front => {
    const ell = (rx, ry) => g.ellipse(cx, RY, rx, ry, TILT, 0, Math.PI * 2);
    g.save();
    g.translate(cx, RY); g.rotate(TILT);
    g.beginPath(); g.rect(-400, front ? 0 : -400, 800, 400); g.clip();       // half-plane along the ring's long axis
    g.rotate(-TILT); g.translate(-cx, -RY);
    g.beginPath(); ell(196, 50); ell(150, 33); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 10; g.shadowOffsetY = 5;
    g.fillStyle = sheen(cx - 196, RY - 50, cx + 196, RY + 50); g.fill('evenodd'); g.shadowColor = 'transparent';
    for (const [rx, ry, a] of [[188, 47, 0.5], [176, 42, 0.35], [163, 37, 0.45]]) { g.beginPath(); ell(rx, ry); g.strokeStyle = `rgba(40,28,6,${a})`; g.lineWidth = 1.4; g.stroke(); }
    g.beginPath(); ell(196, 50); g.strokeStyle = dark; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); ell(150, 33); g.stroke();
    g.restore();
  };
  if (flag) {
    // sun corona: faceted metal rays, long and short, lit from the upper left
    const n = 24;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 - Math.PI / 2, long = k % 2 === 0, L = long ? 192 : 152, w = long ? 0.12 : 0.09;
      const P = (ang, r) => [cx + Math.cos(ang) * r, 188 + Math.sin(ang) * r];
      const lit = -Math.cos(a) - Math.sin(a) > 0;
      g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
      g.beginPath(); g.moveTo(...P(a - w, 80)); g.lineTo(...P(a, L)); g.lineTo(...P(a + w, 80)); g.closePath(); g.fillStyle = metal[0]; g.fill(); g.restore();
      for (const side of [-1, 1]) {
        g.beginPath(); g.moveTo(...P(a, 80)); g.lineTo(...P(a, L)); g.lineTo(...P(a + side * w, 80)); g.closePath();
        g.fillStyle = (side < 0) === lit ? metal[2] : metal[side < 0 ? 1 : 3]; g.fill();
      }
      g.beginPath(); g.moveTo(...P(a - w, 80)); g.lineTo(...P(a, L)); g.lineTo(...P(a + w, 80)); g.strokeStyle = dark; g.lineWidth = 0.8; g.stroke();
    }
  }
  if (hasRing) ringBand(false);

  // the fleet shield: arched top with pointed shoulders, tapering to a point; outer bevel, inner bevel, enamel field
  const delta = (k, dy = 0) => {
    const P = (x, y) => [cx + (x - cx) * k, cy + dy + (y - cy) * k];
    g.beginPath(); g.moveTo(...P(cx - 112, 48));
    g.quadraticCurveTo(...P(cx - 56, 50), ...P(cx, 26));
    g.quadraticCurveTo(...P(cx + 56, 50), ...P(cx + 112, 48));
    g.lineTo(...P(cx + 106, 170));
    g.quadraticCurveTo(...P(cx + 98, 282), ...P(cx, 344));
    g.quadraticCurveTo(...P(cx - 98, 282), ...P(cx - 106, 170));
    g.closePath();
  };
  g.save(); g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 22; g.shadowOffsetY = 9;
  delta(1); g.fillStyle = sheen(cx - 110, 30, cx + 110, 340); g.fill(); g.restore();
  delta(1); g.strokeStyle = dark; g.lineWidth = 1.5; g.stroke();
  delta(0.91, 2); g.fillStyle = sheen(cx + 110, 340, cx - 110, 30); g.fill();
  delta(0.8, 4);
  const en = g.createRadialGradient(cx - 20, cy - 30, 8, cx, cy + 20, 160);
  if (flag) { en.addColorStop(0, '#7a1424'); en.addColorStop(0.6, '#3e0712'); en.addColorStop(1, '#1c0208'); }
  else { en.addColorStop(0, '#24407a'); en.addColorStop(0.6, '#10224a'); en.addColorStop(1, '#060d22'); }
  g.fillStyle = en; g.fill();
  g.save(); delta(0.8, 4); g.clip();
  // a few fixed stars in the enamel and a glossy reflection across the top
  let seed = 7 + index;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`; g.fillRect(cx - 90 + rnd() * 180, 50 + rnd() * 260, 1.4, 1.4); }
  const gl = g.createLinearGradient(cx - 80, 50, cx + 40, 200); gl.addColorStop(0, 'rgba(255,255,255,.22)'); gl.addColorStop(0.45, 'rgba(255,255,255,.05)'); gl.addColorStop(0.46, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(0, 0, W, H);
  g.restore();
  delta(0.8, 4); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.stroke();
  if (hasRing) ringBand(true);

  // faceted star: ten triangles, lit from the upper left
  const star = (x, y, r) => {
    const pts = [];
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.42 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
    g.beginPath(); pts.forEach(p => g.lineTo(...p)); g.closePath(); g.fillStyle = metal[0]; g.fill(); g.restore();
    for (let k = 0; k < 10; k++) {
      const a = pts[k], b = pts[(k + 1) % 10], mx = (a[0] + b[0]) / 2 - x, my = (a[1] + b[1]) / 2 - y;
      const lit = (-mx - my) / (Math.hypot(mx, my) * Math.SQRT2);       // facing the light
      g.beginPath(); g.moveTo(x, y); g.lineTo(...a); g.lineTo(...b); g.closePath();
      g.fillStyle = metal[lit > 0.5 ? 2 : lit > 0 ? 3 : lit > -0.5 ? 1 : 4]; g.fill();
    }
    g.beginPath(); pts.forEach(p => g.lineTo(...p)); g.closePath(); g.strokeStyle = dark; g.lineWidth = 1; g.stroke();
  };
  // bevelled chevron pointing up
  const chevron = (y) => {
    const w = 64, h = 30, t = 18;
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 5; g.shadowOffsetY = 3;
    g.beginPath(); g.moveTo(cx - w, y + h); g.lineTo(cx, y); g.lineTo(cx + w, y + h); g.lineTo(cx + w, y + h + t); g.lineTo(cx, y + t); g.lineTo(cx - w, y + h + t); g.closePath();
    g.fillStyle = sheen(cx - w, y, cx + w, y + h + t); g.fill(); g.restore();
    g.strokeStyle = dark; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.moveTo(cx - w + 3, y + h + 1); g.lineTo(cx, y + 2); g.lineTo(cx + w - 3, y + h + 1); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.stroke();
  };
  if (index <= 2) for (let k = 0; k <= index; k++) chevron(150 + k * 40 - index * 14);
  else {
    const n = flag ? index - 5 : index - 2, r = n === 3 ? 27 : n === 2 ? 32 : 38, y = flag ? 215 : 180;
    for (let k = 0; k < n; k++) {
      const x = cx + (k - (n - 1) / 2) * (r * 2.05);
      star(x, y + (n === 3 && k === 1 ? -26 : 0), r);
    }
  }
  // jewel for the flag officers: a cut ruby set in metal
  if (flag) {
    const jy = 120;
    g.beginPath(); g.arc(cx, jy, 17, 0, Math.PI * 2); g.fillStyle = sheen(cx - 17, jy - 17, cx + 17, jy + 17); g.fill();
    const jr = g.createRadialGradient(cx - 4, jy - 5, 1, cx, jy, 13); jr.addColorStop(0, '#ffd0d6'); jr.addColorStop(0.25, '#ff3a52'); jr.addColorStop(0.7, '#8a0a1c'); jr.addColorStop(1, '#3a0008');
    g.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; g.lineTo(cx + Math.cos(a) * 13, jy + Math.sin(a) * 13); } g.closePath(); g.fillStyle = jr; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.stroke();
  }
  // a sharp highlight at the tip
  const tip = g.createRadialGradient(cx - 100, 52, 0, cx - 100, 52, 18); tip.addColorStop(0, 'rgba(255,255,255,.55)'); tip.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = tip; g.fillRect(cx - 135, 20, 70, 70);

  const url = c.toDataURL('image/png');
  boards.set(index, url);
  return url;
}

function unlocks(i) {
  if (i === RANK_GATE.jobs) return 'Ab sofort darfst du in der Bar Aufträge annehmen.';
  if (i === RANK_GATE.backroom) return 'Ab sofort lässt dich der Türsteher ins Hinterzimmer der Bar.';
  return '';
}

// In flight: fanfare and a long banner (called by addScore)
export function promotedInFlight(r) {
  sfxFanfare();
  return `BEFÖRDERT ZUM ${r.name.toUpperCase()}`;
}

// At the station: the ceremony, once per new rank
export function maybePromotion(stationName) {
  const p = G.profile, r = rankOf(p);
  if (p.rankSeen == null) p.rankSeen = 0;
  if (r.index <= p.rankSeen) return false;
  p.rankSeen = r.index;
  saveProfile(p);
  showCeremony(r, stationName);
  return true;
}

function showCeremony(r, stationName) {
  const p = G.profile;
  el = document.getElementById('promo');
  if (!el) { el = document.createElement('div'); el.id = 'promo'; document.body.append(el); }
  const next = r.next ? `Nächster Rang: ${r.next.name} ab ${r.next.at} Punkten · du hast ${p.score || 0}.` : 'Höher geht es in der Flotte nicht.';
  const un = unlocks(r.index);
  el.innerHTML = `
  <div class="promo-card" role="dialog" aria-modal="true" aria-labelledby="promo-h">
    <p class="eyebrow">Flottenkommando · ${stationName || 'Station'}</p>
    <h1 id="promo-h">Beförderung</h1>
    <div class="promo-board"><img src="${insigniaImage(r.index)}" alt="Rangabzeichen ${r.name}"><i class="promo-glint" style="--m:url(${insigniaImage(r.index)})"></i></div>
    <p class="promo-rank">${r.name}</p>
    <p class="promo-text">Für deine Verdienste im Kampf gegen die Piraterie wirst du mit sofortiger Wirkung zum ${r.name} befördert. Die Flotte dankt dir.</p>
    ${un ? `<p class="promo-unlock">${un}</p>` : ''}
    <p class="note">${next}</p>
    <button type="button" class="primary" data-act="salute">Salutieren</button>
  </div>`;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  sfxFanfare(true);
  const close = () => { el.classList.remove('show'); el.hidden = true; el.innerHTML = ''; removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.stopImmediatePropagation(); e.preventDefault(); close(); } };
  addEventListener('keydown', onKey, true);
  el.querySelector('[data-act="salute"]').addEventListener('click', close);
  el.querySelector('[data-act="salute"]').focus();
}
export const promotionOpen = () => !!el && !el.hidden;
