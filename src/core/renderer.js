import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from '../ctx.js';

export function initRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060c);
  scene.fog = new THREE.FogExp2(0x04060c, 0.0052);

  // Far plane covers a whole system so station beacons stay visible
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 40000);
  scene.add(camera);   // the cockpit frame hangs off the camera
  G.origin = new THREE.Vector3();

  // Bloom only catches truly bright pixels (above 1.0 in linear HDR):
  // lasers, engines, lights, the sun. Lit hulls stay below the threshold.
  let composer = null;
  try {
    composer = new EffectComposer(renderer);
    G.renderPass = new RenderPass(scene, camera);
    composer.addPass(G.renderPass);
    G.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.3, 1.0);
    composer.addPass(G.bloom);
    composer.addPass(new OutputPass());   // tone mapping + sRGB at the end of the chain
  } catch (e) {
    console.warn('Bloom nicht verfügbar', e);
    composer = null;
  }
  Object.assign(G, { renderer, scene, camera, composer });
  if (!composer) G.settings.glow = false;
  setGlowStrength(G.settings.glowStrength ?? 0.35);
}

// 0..1 from the settings slider
export function setGlowStrength(v) {
  G.settings.glowStrength = v;
  if (G.bloom) G.bloom.strength = v * 1.2;
}

export function resizeRenderer() {
  const { renderer, camera, composer } = G;
  const w = innerWidth, h = innerHeight;
  // Quality: low saves battery, high uses the full screen resolution
  const cap = { low: 1, mid: G.settings.glow ? 1.75 : 2, high: 3 }[G.settings.quality] ?? 2;
  const dpr = Math.min(devicePixelRatio || 1, cap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 82 : 70;
  camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); }
}

// view: optional { scene, camera } drawn instead of space (the hangar while docked)
export function render(dt, view = null) {
  const scene = view ? view.scene : G.scene, camera = view ? view.camera : G.camera;
  if (G.settings.glow && G.composer) {
    G.renderPass.scene = scene;
    G.renderPass.camera = camera;
    G.composer.render(dt);
  } else G.renderer.render(scene, camera);
}
