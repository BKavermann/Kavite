// Fine space dust in a small box around the camera: gives a sense of speed.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { dotTexture } from '../utils.js';

const N = 420, BOX = 150;
const pos = new Float32Array(N * 3);
let geo, pts;

export function initDust() {
  for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * BOX;
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.45, color: 0x8fa6b8, map: dotTexture(), transparent: true, depthWrite: false }));
  pts.frustumCulled = false;
  G.scene.add(pts);
}

export function updateDust() {
  pts.visible = !(G.player && G.player.cruise) && G.mode !== 'hyper';   // the warp streaks take over
  if (!pts.visible) return;
  const c = G.camera.position, h = BOX / 2;
  const cc = [c.x, c.y, c.z];
  for (let i = 0; i < N; i++) {
    for (let a = 0; a < 3; a++) {
      let v = pos[i * 3 + a];
      if (v - cc[a] > h) v -= BOX; else if (v - cc[a] < -h) v += BOX;
      pos[i * 3 + a] = v;
    }
  }
  geo.attributes.position.needsUpdate = true;
}
