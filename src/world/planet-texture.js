// Planet surfaces for the sky: painted on the sphere from 3D value noise, so there are no
// seams or squashed poles. Gas giants get turbulent bands and a storm spot, rock planets
// craters and dark plains, ice planets cracks and polar caps.
// The full texture takes a while, so a quarter-size version is painted at once and the full
// size follows in slices over a few frames; the last few results are cached.
import { rng } from '../utils.js';

// Seeded 3D value noise (permutation table and lattice values)
function noise3(seed) {
  const r = rng(seed), P = new Int32Array(512), V = new Float32Array(512);
  for (let i = 0; i < 256; i++) P[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0, q = P[i];
    P[i] = P[j]; P[j] = q;
  }
  for (let i = 0; i < 256; i++) { P[i + 256] = P[i]; V[i] = V[i + 256] = r(); }
  return { P, V };
}
function noise(N, x, y, z) {
  const { P, V } = N;
  let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  x -= X; y -= Y; z -= Z;
  X &= 255; Y &= 255; Z &= 255;
  const u = x * x * (3 - 2 * x), v = y * y * (3 - 2 * y), w = z * z * (3 - 2 * z);
  const a = P[X] + Y, b = P[X + 1] + Y, aa = P[a] + Z, ab = P[a + 1] + Z, ba = P[b] + Z, bb = P[b + 1] + Z;
  const l1 = V[aa] + (V[ba] - V[aa]) * u, l2 = V[ab] + (V[bb] - V[ab]) * u;
  const l3 = V[aa + 1] + (V[ba + 1] - V[aa + 1]) * u, l4 = V[ab + 1] + (V[bb + 1] - V[ab + 1]) * u;
  const m1 = l1 + (l2 - l1) * v, m2 = l3 + (l4 - l3) * v;
  return m1 + (m2 - m1) * w;
}
// Fractal sum of `oct` octaves, 0..1
function fbm(N, x, y, z, oct) {
  let s = 0, a = 0.5, t = 0;
  for (let i = 0; i < oct; i++) {
    s += noise(N, x, y, z) * a;
    t += a;
    x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; z = z * 2.03 + 9.3;
    a *= 0.5;
  }
  return s / t;
}
// HSL (hue in degrees, s and l 0..1) to 0..255 RGB
function hsl(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

// Paints rows y0..y1 of a W×H equirectangular RGBA image
function paintRows(D, W, H, hue, seed, kind, y0 = 0, y1 = H) {
  const r = rng(seed * 7 + 5), n1 = noise3(seed), n2 = noise3(seed + 101);
  const ice = kind === 'ice', lut = new Float32Array(768), cw = new Float32Array(W), sw = new Float32Array(W);
  for (let i = 0; i < W; i++) {
    const a = ((i + 0.5) / W) * Math.PI * 2;
    cw[i] = Math.cos(a); sw[i] = Math.sin(a);
  }
  const randDir = () => {
    const x = r() * 2 - 1, y = r() * 2 - 1, z = r() * 2 - 1, m = Math.hypot(x, y, z) || 1;
    return [x / m, y / m, z / m];
  };

  if (kind === 'gas') {
    // Bands from three sine waves over a noise-warped latitude, fine streaks, one storm
    const fa = 15 + r() * 20, fb = 40 + r() * 40, fc = 5 + r() * 8, ph = r() * 6, size = 0.09 + r() * 0.07, c = randDir();
    c[1] *= 0.45;
    const m = Math.hypot(...c), sx = c[0] / m, sy = c[1] / m, sz = c[2] / m;
    for (let k = 0; k < 256; k++) {
      const p = (k / 255) * 2.4 - 1.2;
      lut.set(hsl(hue + p * 16, 0.34 + p * 0.14, 0.33 + p * 0.11), k * 3);
    }
    const storm = hsl(hue + 28, 0.55, 0.5);
    for (let j = y0; j < y1; j++) {
      const th = ((j + 0.5) / H) * Math.PI, y = Math.cos(th), sr = Math.sin(th), pole = 1 - 0.2 * Math.abs(y) ** 6;
      for (let i = 0; i < W; i++) {
        const x = cw[i] * sr, z = sw[i] * sr;
        const warp = fbm(n1, x * 2.2, y * 2.2, z * 2.2, 3) - 0.5, fine = fbm(n2, x * 9, y * 26, z * 9, 2) - 0.5;
        const dx = x - sx, dy = y - sy, dz = z - sz, sd = (dx * dx + dy * dy * 2.6 + dz * dz) / (size * size);
        const s = sd < 2.6 ? Math.exp(-sd * 1.4) : 0, sdr = s > 0 ? Math.sqrt(sd) : 0;
        const lat = y * 0.5 + 0.5 + warp * 0.075 * (1 - s) + fine * 0.02 + s * Math.sin(sdr * 7 + ph) * 0.02;
        const p = Math.sin(lat * fa) * 0.5 + Math.sin(lat * fb + 1.3) * 0.25 + Math.sin(lat * fc + ph) * 0.45 + fine * 0.5;
        const k = Math.max(0, Math.min(255, (((p + 1.2) / 2.4) * 255) | 0)) * 3, b = pole * (1 + fine * 0.18);
        let R = lut[k] * b, G = lut[k + 1] * b, B = lut[k + 2] * b;
        if (s > 0) {
          const q = Math.min(1, s * 1.25), sb = 1 + Math.cos(sdr * 5) * 0.1;
          R += (storm[0] * sb - R) * q; G += (storm[1] * sb - G) * q; B += (storm[2] * sb - B) * q;
        }
        const o = (j * W + i) * 4;
        D[o] = R; D[o + 1] = G; D[o + 2] = B; D[o + 3] = 255;
      }
    }
    return;
  }

  // Rock and ice: height from noise, craters with raised rims; rock gets dark plains,
  // ice gets cracks and polar caps
  const craters = [];
  for (let k = 0, n = ice ? 8 : 46; k < n; k++) craters.push(...randDir(), 0.018 + r() ** 2.6 * (ice ? 0.07 : 0.12));
  const base = ice ? 190 + (hue % 30) : (hue % 50) + 10, plains = r() * 0.2;
  for (let k = 0; k < 256; k++) {
    const p = k / 255;
    lut.set(ice ? hsl(base + (1 - p) * 25, 0.18 + (1 - p) * 0.2, p) : hsl(base + (p - 0.3) * 30, 0.2 + p * 0.25, p), k * 3);
  }
  for (let j = y0; j < y1; j++) {
    const th = ((j + 0.5) / H) * Math.PI, y = Math.cos(th), sr = Math.sin(th);
    const cap = ice ? Math.min(1, Math.max(0, (Math.abs(y) - 0.78) * 7)) : 0;
    for (let i = 0; i < W; i++) {
      const x = cw[i] * sr, z = sw[i] * sr, h = fbm(n1, x * 2.6, y * 2.6, z * 2.6, 5);
      let c = 0;
      for (let q = 0; q < craters.length; q += 4) {
        const dx = x - craters[q], dy = y - craters[q + 1], dz = z - craters[q + 2], cr = craters[q + 3], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < cr * cr * 1.82) {
          const d = Math.sqrt(d2) / cr;
          c += d < 1 ? -0.55 * (1 - d * d) + 0.35 * d ** 8 : 0.3 * ((1.35 - d) / 0.35) ** 2;
        }
      }
      let l;
      if (ice) {
        const crack = 1 - Math.min(1, Math.abs(fbm(n2, x * 5, y * 5, z * 5, 3) - 0.5) * 16);
        l = 0.64 + (h - 0.5) * 0.4 - crack * 0.11 + c * 0.08;
        l += (0.93 - l) * cap;
      } else {
        const m = fbm(n2, x * 1.3 + 4, y * 1.3, z * 1.3, 3), mare = m < 0.42 + plains ? Math.min(0.07, (0.42 + plains - m) * 1.4) : 0;
        l = 0.27 + (h - 0.5) * 0.55 + (noise(n2, x * 24, y * 24, z * 24) - 0.5) * 0.06 - mare + c * 0.13;
      }
      const k = Math.max(0, Math.min(255, (l * 255) | 0)) * 3, o = (j * W + i) * 4;
      D[o] = lut[k]; D[o + 1] = lut[k + 1]; D[o + 2] = lut[k + 2]; D[o + 3] = 255;
    }
  }
}

let job = null;
const cache = new Map();
// Paints the planet into `canvas` (and flags `tex` for upload): a quick preview now, full size soon
export function paintPlanet(canvas, tex, hue, seed, kind = 'gas') {
  const W = canvas.width, H = canvas.height, g = canvas.getContext('2d'), key = `${seed}|${kind}|${hue}`;
  job = null;
  const hit = cache.get(key);
  if (hit) { g.putImageData(hit, 0, 0); tex.needsUpdate = true; return; }

  const small = document.createElement('canvas');
  small.width = W / 4; small.height = H / 4;
  const sg = small.getContext('2d'), si = sg.createImageData(small.width, small.height);
  paintRows(si.data, small.width, small.height, hue, seed, kind);
  sg.putImageData(si, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, W, H);
  tex.needsUpdate = true;

  const img = g.createImageData(W, H), mine = { row: 0 };
  job = mine;
  const step = () => {
    if (job !== mine) return;            // another system was entered meanwhile
    const t0 = performance.now();
    while (mine.row < H && performance.now() - t0 < 6) {
      const to = Math.min(H, mine.row + 4);
      paintRows(img.data, W, H, hue, seed, kind, mine.row, to);
      mine.row = to;
    }
    if (mine.row < H) { requestAnimationFrame(step); return; }
    job = null;
    g.putImageData(img, 0, 0);
    tex.needsUpdate = true;
    cache.set(key, img);
    if (cache.size > 4) cache.delete(cache.keys().next().value);
  };
  requestAnimationFrame(step);
}
