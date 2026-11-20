// A fixed, seeded galaxy. Every player gets the same map.
// Systems are grown outward from the start system, each new one 3.2–6.8 LJ
// from an existing one, so the whole map is reachable with a 7 LJ drive.
// The first 20 systems are the original map; the growth just continues to 100.
// Looks (star, planet, sky) and black holes come from a second seed per system,
// so adding them changed none of the original systems.
import { rng } from '../utils.js';

const SEED = 4711;
const COUNT = 100;
const SYL = ['kor', 'an', 'vel', 'ti', 'mar', 'os', 'zen', 'ri', 'dra', 'ku', 'sel', 'em', 'tor', 'ga',
  'lin', 'ur', 'pha', 'des', 'ny', 'ox', 'bel', 'ka', 'sur', 'ion', 'mi', 'ra', 'the', 'vo'];
const SUFFIX = {
  agrar: ['Ring', 'Garten', 'Hof'],
  industrie: ['Werft', 'Schmiede', 'Hütte'],
  bergbau: ['Mine', 'Grube', 'Schacht'],
  hightech: ['Labor', 'Hub', 'Kern'],
};
const ECON_KEYS = ['agrar', 'industrie', 'bergbau', 'hightech'];
const GOOD_IDS = ['food', 'textiles', 'minerals', 'machinery', 'computers', 'luxuries'];

function makeName(r, used) {
  for (let i = 0; i < 60; i++) {
    const n = 2 + (r() < 0.3 ? 1 : 0);
    let s = '';
    for (let k = 0; k < n; k++) s += SYL[(r() * SYL.length) | 0];
    if (s.length > 9) continue;
    s = s[0].toUpperCase() + s.slice(1);
    if (!used.has(s)) { used.add(s); return s; }
  }
  return 'Sektor ' + used.size;
}

// Stations lie 4–14 km from the system centre and at least 3.5 km apart.
function placeStations(r, count) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries++ < 300) {
    const rad = 4000 + r() * 10000, ang = r() * Math.PI * 2;
    const p = [Math.cos(ang) * rad, (r() - 0.5) * 800, Math.sin(ang) * rad];
    if (out.some(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 3500)) continue;
    out.push(p);
  }
  return out;
}

function finish(s, r) {
  s.priceVar = {};
  for (const g of GOOD_IDS) s.priceVar[g] = 0.88 + r() * 0.24;
  s.planet = { hue: r() * 360, size: 380 + r() * 420, dir: [r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5] };
  s.sun = [r() - 0.5, 0.2 + r() * 0.5, r() - 0.5];
  s.rocks = s.econ === 'bergbau' ? 1.4 : 0.6 + r() * 0.6;
  return s;
}

function startSystem(r, used) {
  used.add('Kessel');
  return finish({
    id: 0, name: 'Kessel', x: 38, y: 26, econ: 'agrar', danger: 0.15,
    stations: [
      { name: 'Kessel-Ring', econ: 'agrar', pos: [0, 0, -4000], rot: [0, 0, 0] },
      { name: 'Ferrum-Werft', econ: 'industrie', pos: [9000, 600, 5000], rot: [0.3, 2.2, 0] },
      { name: 'Schacht Neun', econ: 'bergbau', pos: [-7500, -400, 7000], rot: [-0.2, 4.0, 0] },
    ],
  }, r);
}

function makeSystem(id, x, y, r, used) {
  const econ = ECON_KEYS[(r() * 4) | 0];
  const name = makeName(r, used);
  const count = 1 + Math.min(4, Math.floor(r() * 3 + r() * 2.8));   // 1–5 stations
  const stations = placeStations(r, count).map((pos, k) => {
    const e = k === 0 ? econ : (r() < 0.45 ? econ : ECON_KEYS[(r() * 4) | 0]);
    const suffix = SUFFIX[e][(r() * 3) | 0];
    const base = k === 0 ? name : makeName(r, used);
    return { name: `${base}-${suffix}`, econ: e, pos, rot: [(r() - 0.5) * 0.6, r() * Math.PI * 2, 0] };
  });
  return finish({ id, name, x, y, econ, danger: r(), stations }, r);
}

// Star, planet and sky variations, and now and then a black hole next to a station
const STARS = [
  { kind: 'gelb', color: [1, 0.94, 0.85], size: 1 },
  { kind: 'weiß', color: [0.92, 0.95, 1], size: 0.9 },
  { kind: 'orange', color: [1, 0.78, 0.55], size: 1.2 },
  { kind: 'rot', color: [1, 0.55, 0.4], size: 1.6 },
  { kind: 'blau', color: [0.7, 0.82, 1], size: 0.75 },
];
// The planet should not stand in front of the sun, or only its dark night side shows:
// if it is closer than about 57° to the sun, turn it around the vertical axis until it is not
// (or, when both stand nearly overhead, move it below the horizon)
function keepPlanetLit(s) {
  const d = s.planet.dir, u = s.sun, dl = Math.hypot(...d), ul = Math.hypot(...u);
  const dx = d[0] / dl, sx = u[0] / ul, sy = u[1] / ul, sz = u[2] / ul, dz = d[2] / dl;
  let dy = d[1] / dl;
  if (dx * sx + dy * sy + dz * sz <= 0.55) return;
  const rh = Math.hypot(dx, dz), rs = Math.hypot(sx, sz);
  if (dy * sy - rh * rs > 0.55) dy = -dy;      // both nearly overhead: turning cannot help, put the planet below
  if (dx * sx + dy * sy + dz * sz <= 0.55) { s.planet.dir = [dx, dy, dz]; return; }
  const k = Math.max(-1, Math.min(1, (0.55 - dy * sy) / (rh * rs || 1)));
  const side = dx * sz - dz * sx < 0 ? -1 : 1, ang = Math.atan2(sz, sx) + side * Math.acos(k);
  s.planet.dir = [Math.cos(ang) * rh, dy, Math.sin(ang) * rh];
}
function addLook(s) {
  keepPlanetLit(s);
  const r = rng(SEED * 7 + s.id * 131);
  s.star = STARS[Math.floor(r() * STARS.length)];
  s.planet.kind = ['gas', 'gas', 'rock', 'ice'][Math.floor(r() * 4)];
  s.planet.ring = r() < 0.35;
  s.planet.moon = r() < 0.5;
  s.nebula = r() < 0.6 ? { hue: r() * 360, dir: [r() - 0.5, r() - 0.5, r() - 0.5] } : null;
  // Black holes: about one system in five, never at the start
  if (s.id > 0 && r() < 0.22) {
    const st = s.stations[Math.floor(r() * s.stations.length)];
    st.bh = { mode: ['with', 'against', 'side'][Math.floor(r() * 3)], dist: 1000 + r() * 400, ang: r() * Math.PI * 2 };
  }
}

export const SYSTEMS = (() => {
  const r = rng(SEED);
  const used = new Set();
  const sys = [startSystem(r, used)];
  let tries = 0;
  while (sys.length < COUNT && tries++ < 60000) {
    const base = sys[(r() * sys.length) | 0];
    const ang = r() * Math.PI * 2, d = 3.2 + r() * 3.6;
    const x = base.x + Math.cos(ang) * d, y = base.y + Math.sin(ang) * d;
    if (x < 3 || x > 77 || y < 3 || y > 47) continue;
    if (sys.some(s => Math.hypot(s.x - x, s.y - y) < 2.8)) continue;
    sys.push(makeSystem(sys.length, x, y, r, used));
  }
  sys.forEach(addLook);
  return sys;
})();

// Number of hyperjumps (max 7 LJ each) from one system to every other.
export function hopsFrom(start, range = 7) {
  const hops = SYSTEMS.map(() => Infinity);
  hops[start] = 0;
  const q = [start];
  while (q.length) {
    const a = q.shift();
    for (const s of SYSTEMS) {
      if (hops[s.id] === Infinity && systemDist(a, s.id) <= range) { hops[s.id] = hops[a] + 1; q.push(s.id); }
    }
  }
  return hops;
}

export const systemDist = (a, b) => Math.hypot(SYSTEMS[a].x - SYSTEMS[b].x, SYSTEMS[a].y - SYSTEMS[b].y);
export const dangerLabel = d => d < 0.33 ? 'niedrig' : d < 0.66 ? 'mittel' : 'hoch';
