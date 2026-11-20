// Black holes next to some stations (station def.bh, see game/galaxy.js).
// Look: one sphere per hole whose shader traces light rays through the hole's
// gravity (Schwarzschild bending): the black shadow, the thin photon ring, the
// accretion disk with its far side lensed into arcs above and below, Doppler
// beaming (the side turning towards you is brighter and bluer) and a hot corona.
// The sphere is drawn from the inside (BackSide), so it also works up close.
// Gameplay: the hole pulls the player's ship; past the event horizon it is lost.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { BLACKHOLE } from '../config.js';
import { radialTexture } from '../utils.js';

const RB = 26;                 // traced volume radius in units of M
const STEPS = { low: 48, mid: 64, high: 90 };   // ray steps per pixel by quality setting
let shared = null;

const vert = /* glsl */`
  varying vec3 vLocal;
  void main() {
    vLocal = position * ${RB.toFixed(1)};
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const frag = /* glsl */`
  uniform vec3 uCam;          // camera in hole units (M = 1), disk in the xz plane
  uniform float uTime;
  varying vec3 vLocal;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  // Hot inner disk white-blue, outer disk orange to deep red
  vec3 diskRamp(float t) {
    return mix(mix(vec3(1.0, 0.3, 0.06), vec3(1.0, 0.66, 0.28), smoothstep(0.0, 0.45, t)),
               vec3(1.0, 0.93, 0.82), smoothstep(0.6, 1.0, t));
  }

  void main() {
    vec3 dir = normalize(vLocal - uCam);
    vec3 p = uCam;
    float R = ${RB.toFixed(1)};
    float c2 = dot(uCam, uCam);
    if (c2 > R * R) {                        // start where the ray enters the traced sphere
      float b = dot(uCam, dir), disc = b * b - (c2 - R * R);
      if (disc < 0.0) discard;
      p = uCam + dir * (-b - sqrt(disc));
    }
    vec3 v = dir;
    vec3 hv = cross(p, v);
    float h2 = dot(hv, hv);
    vec3 col = vec3(0.0);
    float a = 0.0;
    for (int i = 0; i < STEPS; i++) {
      float r2 = dot(p, p), r = sqrt(r2);
      float dt = clamp(0.09 * r, 0.05, 2.0);
      vec3 pn = p + v * dt;
      v = normalize(v - 1.5 * h2 * p / (r2 * r2 * r) * dt);
      // Crossing the disk plane: sample the accretion disk
      if (p.y * pn.y < 0.0) {
        vec3 c = mix(p, pn, p.y / (p.y - pn.y));
        float rc = length(c.xz);
        if (rc > 4.6 && rc < 15.0) {          // from about the innermost stable orbit outwards
          float t = clamp(1.0 - (rc - 4.6) / 10.4, 0.0, 1.0);
          float ang = atan(c.z, c.x) - uTime * 2.2 / pow(rc, 1.5);
          float streak = 0.55 + 0.45 * noise(vec2(ang * 5.0, rc * 2.2)) * (0.6 + 0.4 * noise(vec2(ang * 17.0, rc * 7.0)));
          vec3 orbit = normalize(vec3(-c.z, 0.0, c.x));
          float beta = clamp(0.42 / sqrt(rc / 5.0), 0.0, 0.45);
          float dop = 1.0 / (1.0 - beta * dot(orbit, -v));
          float bright = (0.25 + pow(t, 1.4) * 0.9) * streak * pow(dop, 2.5);
          vec3 dc = diskRamp(t * 0.8 + (dop - 1.0) * 0.35) * bright;
          float da = smoothstep(4.6, 5.6, rc) * smoothstep(15.0, 10.5, rc) * (0.5 + 0.45 * streak);
          col += (1.0 - a) * dc * da;
          a += (1.0 - a) * da * 0.85;
        }
      }
      // Corona: thin hot gas above and below the inner disk, and the photon sphere at r = 3
      float hz = abs(p.y);
      col += (1.0 - a) * (vec3(0.6, 0.75, 1.0) * exp(-max(r - 3.0, 0.0) * 0.4 - hz * 0.6) * 0.012 * step(3.0, r)
                        + vec3(1.0, 0.8, 0.55) * exp(-pow((r - 3.0) * 6.0, 2.0)) * 0.05) * dt;
      if (r < 2.0) { a = 1.0; break; }       // event horizon: the shadow
      if (r > R && dot(pn, v) > 0.0) break;   // left the volume
      if (a > 0.98) break;
      p = pn;
    }
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function ensureShared() {
  if (shared) return shared;
  shared = {
    sphere: new THREE.SphereGeometry(1, 48, 24),
    halo: radialTexture([[0, 'rgba(255,200,140,.9)'], [0.25, 'rgba(255,150,80,.35)'], [1, 'rgba(255,120,60,0)']], 128),
  };
  return shared;
}

// Where a station's hole sits: behind the station ("with" the pull while docking),
// in front and a little off the approach ("against" it), or to the side.
function holePosition(st, out) {
  const { mode, dist, ang } = st.def.bh;
  st.group.updateMatrixWorld(true);
  const q = st.group.quaternion;
  const slot = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const side = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), ang).applyQuaternion(q);
  if (mode === 'with') out.copy(slot).multiplyScalar(-dist);
  else if (mode === 'against') out.copy(slot).multiplyScalar(Math.cos(0.45)).addScaledVector(side, Math.sin(0.45)).multiplyScalar(dist);
  else out.copy(side).multiplyScalar(dist);
  return out.add(st.sysPos);
}

export function buildHoles() {
  clearHoles();
  const sh = ensureShared(), M = BLACKHOLE.M;
  for (const st of G.stations) {
    if (!st.def.bh) continue;
    const group = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, defines: { STEPS: STEPS[G.settings.quality] || STEPS.mid },
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 } },
      side: THREE.BackSide, transparent: true, depthWrite: false, premultipliedAlpha: true, fog: false,
    });
    const body = new THREE.Mesh(sh.sphere, mat);
    body.scale.setScalar(RB * M);
    body.frustumCulled = false;
    group.add(body);
    const haloMat = new THREE.SpriteMaterial({ map: sh.halo, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
    const halo = new THREE.Sprite(haloMat);
    group.add(halo);
    // Tilt the disk so every hole looks a bit different
    const a = st.def.bh.ang;
    group.rotation.set(0.35 + Math.sin(a) * 0.3, a, 0.2 * Math.cos(a));
    const sysPos = holePosition(st, new THREE.Vector3());
    group.position.copy(sysPos).sub(G.origin);
    G.scene.add(group);
    G.holes.push({ st, group, body, mat, halo, haloMat, sysPos, pos: group.position, horizon: 2 * M });
  }
}

export function clearHoles() {
  for (const h of G.holes) {
    G.scene.remove(h.group);
    h.mat.dispose();
    h.haloMat.dispose();
  }
  G.holes.length = 0;
}

const cam = new THREE.Vector3();
export function updateHoles() {
  const M = BLACKHOLE.M;
  for (const h of G.holes) {
    h.pos.copy(h.sysPos).sub(G.origin);
    h.group.updateMatrixWorld(true);
    cam.copy(G.camera.position);
    h.group.worldToLocal(cam).multiplyScalar(1 / M);
    h.mat.uniforms.uCam.value.copy(cam);
    h.mat.uniforms.uTime.value = G.time;
    // From far away the hole is a faint orange star, like the station beacons
    const d = h.pos.distanceTo(G.camera.position);
    h.haloMat.opacity = Math.min(0.8, Math.max(0, (d - 2500) / 3000));
    h.halo.scale.setScalar(Math.max(400, d * 0.03));
  }
}

// Pull on a point (scene coordinates), added into acc; returns the distance to the nearest hole
export function holePull(pos, acc) {
  let near = Infinity;
  for (const h of G.holes) {
    const dx = h.pos.x - pos.x, dy = h.pos.y - pos.y, dz = h.pos.z - pos.z;
    const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
    near = Math.min(near, r);
    const a = Math.min(BLACKHOLE.maxAccel, BLACKHOLE.pull / Math.max(r2, 1)) / Math.max(r, 1e-3);
    acc.x += dx * a; acc.y += dy * a; acc.z += dz * a;
  }
  return near;
}

export function nearestHole(pos) {
  let best = null, bd = Infinity;
  for (const h of G.holes) { const d = h.pos.distanceTo(pos); if (d < bd) { bd = d; best = h; } }
  return { h: best, d: bd };
}
