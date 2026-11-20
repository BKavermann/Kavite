// Procedural hull surface: panel seams, rivets, access hatches and grime, painted
// into a canvas once and shared by all ships. Seams live in the texture (with a
// matching bump map), not in the geometry, so mipmapping keeps them from flickering.
import * as THREE from 'three';
import { rng } from '../utils.js';

const SIZE = 512;
const SCALE = 0.2;          // texture repeats every 5 m of hull
let cache = null;

function panels(ctx, bump, r) {
  // Split the square into panels recursively; every cut is a seam
  const rects = [];
  const split = (x, y, w, h, depth) => {
    if (depth > 4 || (w < 90 && h < 90) || (depth > 1 && r() < 0.18)) { rects.push([x, y, w, h]); return; }
    if (w > h ? r() < 0.8 : r() < 0.2) { const c = Math.round(w * (0.3 + r() * 0.4)); split(x, y, c, h, depth + 1); split(x + c, y, w - c, h, depth + 1); }
    else { const c = Math.round(h * (0.3 + r() * 0.4)); split(x, y, w, c, depth + 1); split(x, y + c, w, h - c, depth + 1); }
  };
  split(0, 0, SIZE, SIZE, 0);
  for (const [x, y, w, h] of rects) {
    const v = 214 + Math.round((r() - 0.5) * 26);
    ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
    ctx.fillRect(x, y, w, h);
    bump.fillStyle = '#fff';
    bump.fillRect(x, y, w, h);
    // Seam: dark groove with a light upper edge
    ctx.strokeStyle = 'rgba(30,34,40,.85)'; ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 3, y + 3.5); ctx.lineTo(x + w - 3, y + 3.5); ctx.stroke();
    bump.strokeStyle = '#000'; bump.lineWidth = 4;
    bump.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    // Rivets along the long edges of larger panels
    if (w * h > 9000 && r() < 0.7) {
      const step = 14;
      ctx.fillStyle = 'rgba(40,44,50,.6)'; bump.fillStyle = '#999';
      for (let i = x + 9; i < x + w - 6; i += step) for (const yy of [y + 8, y + h - 8]) {
        ctx.beginPath(); ctx.arc(i, yy, 1.6, 0, Math.PI * 2); ctx.fill();
        bump.beginPath(); bump.arc(i, yy, 1.8, 0, Math.PI * 2); bump.fill();
      }
    }
    // Some panels get a hatch, a vent grille or a stencil mark
    const k = r();
    if (w > 70 && h > 50 && k < 0.22) {
      const hw = w * 0.45, hh = h * 0.4, hx = x + (w - hw) / 2, hy = y + (h - hh) / 2;
      ctx.strokeStyle = 'rgba(30,34,40,.7)'; ctx.lineWidth = 2; ctx.strokeRect(hx, hy, hw, hh);
      bump.strokeStyle = '#333'; bump.lineWidth = 2; bump.strokeRect(hx, hy, hw, hh);
    } else if (w > 60 && h > 40 && k < 0.4) {
      ctx.fillStyle = 'rgba(25,28,33,.75)'; bump.fillStyle = '#222';
      const gx = x + w * 0.2, gy = y + h * 0.3, gw = w * 0.6;
      for (let i = 0; i < 6; i++) { ctx.fillRect(gx, gy + i * 5, gw, 2.5); bump.fillRect(gx, gy + i * 5, gw, 2.5); }
    } else if (w > 80 && h > 40 && k < 0.5) {
      ctx.fillStyle = 'rgba(200,80,30,.8)';            // orange warning chevrons
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const cx = x + 14 + i * 12, cy = y + h - 16;
        ctx.moveTo(cx, cy); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx + 12, cy + 8); ctx.lineTo(cx + 6, cy + 8); ctx.closePath(); ctx.fill();
      }
    }
  }
}

function grime(ctx, r) {
  for (let i = 0; i < 60; i++) {
    const x = r() * SIZE, y = r() * SIZE, rad = 10 + r() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(20,18,16,${0.05 + r() * 0.08})`);
    g.addColorStop(1, 'rgba(20,18,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Fine streaks, as if from exhaust and dust
  ctx.strokeStyle = 'rgba(30,26,22,.06)';
  for (let i = 0; i < 140; i++) {
    const x = r() * SIZE, y = r() * SIZE;
    ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 6, y + 10 + r() * 40); ctx.stroke();
  }
}

// Cockpit glass: dark tinted panes between frame struts, with a soft reflection
function glass() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#2c4a5c'); grad.addColorStop(0.5, '#0d1a24'); grad.addColorStop(1, '#1d3442');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,.12)';
  g.beginPath(); g.moveTo(30, 0); g.lineTo(90, 0); g.lineTo(20, 256); g.lineTo(-40, 256); g.closePath(); g.fill();
  g.strokeStyle = '#8d949c'; g.lineWidth = 10;
  for (const x of [0, 128, 256]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.lineWidth = 8;
  for (const y of [0, 140, 256]) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  return c;
}

function canvasTex(c, color) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function hullTextures() {
  if (cache) return cache;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = SIZE; return c; };
  const cc = mk(), bc = mk();
  const ctx = cc.getContext('2d'), bump = bc.getContext('2d');
  const r = rng(90210);
  panels(ctx, bump, r);
  grime(ctx, r);
  cache = { map: canvasTex(cc, true), bump: canvasTex(bc, false), glass: canvasTex(glass(), true) };
  return cache;
}

// Box-mapped UVs for flat-shaded meshes without their own: each triangle is
// projected along its dominant normal axis, 1 m = SCALE texture units.
export function boxUVs(geo, scale = SCALE) {
  if (geo.getAttribute('uv')) return;
  const pos = geo.getAttribute('position'), n = pos.count;
  const uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
  const idx = geo.index;
  const vi = i => (idx ? idx.getX(i) : i);
  const tris = idx ? idx.count : n;
  for (let i = 0; i < tris; i += 3) {
    a.fromBufferAttribute(pos, vi(i)); b.fromBufferAttribute(pos, vi(i + 1)); c.fromBufferAttribute(pos, vi(i + 2));
    nrm.subVectors(c, b).cross(b.clone().sub(a)).set(Math.abs(nrm.x), Math.abs(nrm.y), Math.abs(nrm.z));
    for (let k = 0; k < 3; k++) {
      const j = vi(i + k);
      const p = [a, b, c][k];
      let u, v;
      if (nrm.y >= nrm.x && nrm.y >= nrm.z) { u = p.x; v = p.z; }
      else if (nrm.x >= nrm.z) { u = p.z; v = p.y; }
      else { u = p.x; v = p.y; }
      uv[j * 2] = u * scale; uv[j * 2 + 1] = v * scale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const PAINTED = new Set(['Hull', 'HullLight', 'HullDark', 'Trim']);
// Give a loaded ship model the shared hull textures
export function applyHullTextures(scene) {
  const t = hullTextures();
  scene.traverse(o => {
    if (o.isMesh && o.material.name === 'Canopy' && !o.material.map) {
      boxUVs(o.geometry, 0.7);
      o.material.map = t.glass;
      o.material.emissiveMap = t.glass;
      o.material.color.setScalar(1);
      o.material.needsUpdate = true;
      return;
    }
    if (!o.isMesh || !PAINTED.has(o.material.name) || o.material.map) return;
    boxUVs(o.geometry);
    o.material.map = t.map;
    o.material.bumpMap = t.bump;
    o.material.bumpScale = o.material.name === 'HullDark' ? 0.6 : 1.2;
    o.material.needsUpdate = true;
  });
}
