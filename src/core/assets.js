// glTF model loading with a procedural fallback, so the game still runs
// when a .glb is missing or broken.
//
// Model conventions (see README): nose along -Z, up +Y, 1 unit = 1 m.
// Material names the game looks for: "Hull" (flashes when hit), "EngineGlow".
// Empty nodes the game looks for: "Gun_L", "Gun_R" (muzzle positions).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODELS } from '../config.js';
import { applyHullTextures } from './hull-texture.js';

const models = {};
export const modelStatus = {};

// A single-file build can embed the .glb files as base64 in this global.
const embedded = globalThis.__ASTEROID_DRIFT_MODELS__ || {};
function base64ToBuffer(b64) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function loadModels() {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(MODELS).map(async ([key, url]) => {
    try {
      const gltf = embedded[key]
        ? await loader.parseAsync(base64ToBuffer(embedded[key]), '')
        : await loader.loadAsync(url);
      gltf.scene.traverse(o => {
        if (o.isMesh) {
          o.material.side = THREE.DoubleSide;
          // Engines and navigation lights stay visible in the haze
          if (o.material.name === 'EngineGlow' || o.material.name.startsWith('Nav')) o.material.fog = false;
        }
      });
      applyHullTextures(gltf.scene);
      models[key] = gltf.scene;
      modelStatus[key] = 'glb';
    } catch (e) {
      console.warn('Modell konnte nicht geladen werden:', url, e);
      models[key] = null;
      modelStatus[key] = 'fallback';
    }
  }));
}

export function cloneModel(key) {
  const m = models[key];
  return m ? m.clone(true) : null;
}

// ---- Procedural fallback: the wedge fighter from the first prototype ----
let wedgeGeo = null;
function wedge() {
  if (wedgeGeo) return wedgeGeo;
  const V = { N: [0, 0, -3.6], L: [-3.4, -0.1, 1.4], R: [3.4, -0.1, 1.4], T: [0, 0.85, 0.9], B: [0, -0.55, 0.9],
    RL: [-1.3, 0.25, 1.6], RR: [1.3, 0.25, 1.6], BL: [-1.3, -0.35, 1.6], BR: [1.3, -0.35, 1.6] };
  const F = [['N','L','T'], ['N','T','R'], ['T','L','RL'], ['T','RL','RR'], ['T','RR','R'],
    ['N','L','B'], ['N','B','R'], ['B','L','BL'], ['B','BL','BR'], ['B','BR','R'],
    ['RL','RR','BR'], ['RL','BR','BL'], ['L','RL','BL'], ['R','BR','RR']];
  const arr = [];
  F.forEach(f => f.forEach(k => arr.push(...V[k])));
  wedgeGeo = new THREE.BufferGeometry();
  wedgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  wedgeGeo.computeVertexNormals();
  return wedgeGeo;
}

export function buildFallbackShip(kind) {
  const root = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({
    name: 'Hull', color: kind === 'player' ? 0x9ea4ad : 0x8a3a30,
    metalness: 0.45, roughness: 0.42, flatShading: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(wedge(), hull);
  if (kind === 'player') mesh.scale.set(1.5, 1.1, 1.2);
  else mesh.scale.setScalar(1.25);
  root.add(mesh);
  const engine = new THREE.MeshBasicMaterial({ name: 'EngineGlow', color: new THREE.Color(2.2, 0.7, 0.25), side: THREE.DoubleSide, fog: false });
  const s = mesh.scale;
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * s.x, 0.38 * s.y), engine);
    e.position.set(0.65 * side * s.x, -0.05 * s.y, 1.62 * s.z);
    root.add(e);
    const gun = new THREE.Object3D();
    gun.name = side < 0 ? 'Gun_L' : 'Gun_R';
    gun.position.set(0.9 * side * s.x, -0.3, -2.6 * s.z);
    root.add(gun);
  }
  return root;
}
