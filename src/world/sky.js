// Stars, a gas giant and the sun. The group follows the camera like a skybox.
// It is drawn first and writes no depth, so distant stations always show in front.
// Each system recolours the planet and moves the sun (applySystemSky); from the
// system's look it also picks the star colour, a gas, rock or ice planet, a ring,
// a moon and a faint nebula. All of it reuses the same few meshes.
// The sun is a real place far out in the system (G.star, see game/sun.js). Being so far away,
// it is drawn as part of the sky: a glowing ball in its true direction whose size follows the
// true distance, so it grows as you fly towards it.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { SUN } from '../config.js';
import { dotTexture, radialTexture } from '../utils.js';
import { paintPlanet } from './planet-texture.js';

const ringPlanet = { value: new THREE.Vector4() };   // planet centre relative to the camera, radius
let sky, planet, atmo, ring, moon, nebulae, sunSprite, sunBall, sunLight, hemi, pcanvas, ptex;
const SKY_R = 2900;                 // where the sun is drawn inside the sky
const rel = new THREE.Vector3();
// Surface colours per star type: cool granule edges and hot granule centres
const SURFACE = {
  gelb: [[0.85, 0.38, 0.06], [1, 0.86, 0.48]],
  'weiß': [[0.72, 0.7, 0.68], [1, 1, 0.97]],
  orange: [[0.72, 0.24, 0.04], [1, 0.7, 0.32]],
  rot: [[0.5, 0.08, 0.03], [1, 0.42, 0.18]],
  blau: [[0.3, 0.45, 0.95], [0.86, 0.93, 1]],
};
const sunDir = new THREE.Vector3(-0.55, 0.35, -0.75).normalize();

export function initSky() {
  const { scene } = G;
  sunLight = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sunLight.position.copy(sunDir);
  scene.add(sunLight);
  hemi = new THREE.HemisphereLight(0x34587a, 0x140c08, 1.1);
  scene.add(hemi);

  sky = new THREE.Group();
  scene.add(sky);

  const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    v.randomDirection().multiplyScalar(3200);
    pos.set([v.x, v.y, v.z], i * 3);
    c.setHSL(Math.random() < 0.7 ? 0.6 : 0.08, 0.35, 0.55 + Math.random() * 0.4);
    const k = 0.35 + Math.random() ** 3 * 0.9;
    col.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, vertexColors: true, map: dotTexture(),
    transparent: true, depthWrite: false, fog: false,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -3;
  sky.add(stars);

  pcanvas = document.createElement('canvas');
  pcanvas.width = 1024; pcanvas.height = 512;
  ptex = new THREE.CanvasTexture(pcanvas);
  ptex.colorSpace = THREE.SRGBColorSpace;
  ptex.anisotropy = 8;
  planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), planetMaterial(ptex));
  planet.renderOrder = -2;
  sky.add(planet);
  atmo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 32), atmosphereMaterial());
  atmo.renderOrder = -1;
  sky.add(atmo);

  // Planet ring: a flat annulus with soft bands, and a small moon
  const rc = document.createElement('canvas');
  rc.width = 256; rc.height = 1;
  const rg = rc.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const a = (0.35 + 0.35 * Math.sin(x * 0.21) * Math.sin(x * 0.047 + 1)) * Math.min(1, x / 20, (255 - x) / 30);
    rg.fillStyle = `rgba(230,220,200,${Math.max(0, a).toFixed(3)})`;
    rg.fillRect(x, 0, 1, 1);
  }
  const ringTex = new THREE.CanvasTexture(rc);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  const rgeo = new THREE.RingGeometry(1.18, 2.2, 128, 1);
  const uv = rgeo.getAttribute('uv'), rp = rgeo.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.hypot(rp.getX(i), rp.getY(i)) - 1.18) / 1.02, 0.5);
  // The sky writes no depth (it must never hide the world), so the ring hides its own
  // far side behind the planet: fragments whose view ray hits the planet first are dropped.
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
  ringMat.onBeforeCompile = sh => {
    sh.uniforms.uPlanet = ringPlanet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRel;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRel = (modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRel;\nuniform vec4 uPlanet;')
      .replace('void main() {', `void main() {
        float len = length(vRel);
        vec3 dir = vRel / len;
        float b = dot(uPlanet.xyz, dir), c = dot(uPlanet.xyz, uPlanet.xyz) - uPlanet.w * uPlanet.w;
        float disc = b * b - c;
        if (disc > 0.0 && b - sqrt(disc) < len) discard;`);
  };
  ring = new THREE.Mesh(rgeo, ringMat);
  ring.renderOrder = -1;
  sky.add(ring);
  moon = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 1, fog: false, depthWrite: false, transparent: true }));
  moon.renderOrder = -2;
  sky.add(moon);
  // Nebula: two soft additive clouds, tinted per system
  const nebTex = radialTexture([[0, 'rgba(255,255,255,.55)'], [0.4, 'rgba(255,255,255,.18)'], [1, 'rgba(255,255,255,0)']], 128);
  nebulae = [0, 1].map(() => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.22 }));
    sp.renderOrder = -3;
    sky.add(sp);
    return sp;
  });

  const sunTex = radialTexture([[0, 'rgba(255,250,235,1)'], [0.12, 'rgba(255,236,190,1)'], [0.3, 'rgba(255,190,110,.35)'], [1, 'rgba(255,160,80,0)']], 256);
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: new THREE.Color(1.3, 1.3, 1.3), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunSprite.scale.setScalar(900);
  sunSprite.renderOrder = -1;
  sky.add(sunSprite);
  sunBall = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), sunMaterial());
  sunBall.renderOrder = -1.5;
  sunBall.frustumCulled = false;
  sky.add(sunBall);
  G.star = { pos: new THREE.Vector3(), R: 1000, kind: 'gelb', heat: 1, name: 'Sonne', hex: '#ffd36b' };
}

// Glowing surface: darker towards the rim, slowly boiling granulation
function sunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 0.94, 0.85) }, uCool: { value: new THREE.Color() }, uHot: { value: new THREE.Color() }, uTime: { value: 0 } },
    depthWrite: false,
    vertexShader: `
      varying vec3 vN; varying vec3 vP;
      void main() {
        vP = position;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor, uCool, uHot; uniform float uTime;
      varying vec3 vN; varying vec3 vP;
      float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        float mu = clamp(abs(vN.z), 0.0, 1.0);
        float limb = 0.3 + 0.7 * pow(mu, 0.5);
        vec3 q = vP * 14.0 + vec3(0.0, uTime * 0.05, uTime * 0.03);
        float g = n3(q) * 0.5 + n3(q * 3.1 - uTime * 0.08) * 0.3 + n3(q * 9.7 + uTime * 0.1) * 0.2;
        float spots = smoothstep(0.8, 0.92, n3(vP * 2.2 + 3.1)) * 0.5;
        vec3 c = mix(uCool, uHot, smoothstep(0.3, 0.75, g)) * limb * (1.0 - spots);
        c += uColor * pow(1.0 - mu, 3.0) * 0.2;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// Planet lit by the sun only: day side, a soft terminator with a warm edge, a faint night side
function planetMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uSun: { value: sunLight.position }, uLc: { value: sunLight.color } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv; varying vec3 vN;
      void main() {
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec3 uSun; uniform vec3 uLc;
      varying vec2 vUv; varying vec3 vN;
      void main() {
        vec3 n = normalize(vN), l = normalize(uSun), a = texture2D(map, vUv).rgb;
        float nl = dot(n, l), day = smoothstep(-0.12, 0.35, nl), df = max(nl, 0.0) * 0.85 + 0.15 * day;
        vec3 c = a * (df * 1.15 * mix(vec3(1.0), uLc, 0.5) + 0.02)
               + vec3(0.25, 0.08, 0.0) * a * clamp(1.0 - abs(nl - 0.02) / 0.25, 0.0, 1.0) * 0.5;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Atmosphere: a thin glowing rim around the planet and a haze over its edge, brighter on the
// sun side and when looking towards the sun. Ray-sphere test against the planet (ringPlanet).
function atmosphereMaterial() {
  const col = new THREE.Color(0x4aa8ff);
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: col }, uSun: { value: sunLight.position }, uPlanet: ringPlanet, uStr: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vRel;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vRel = w.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uCol; uniform vec3 uSun; uniform vec4 uPlanet; uniform float uStr;
      varying vec3 vRel;
      void main() {
        vec3 dir = normalize(vRel), c = uPlanet.xyz, l = normalize(uSun), nr;
        float R = uPlanet.w, b = dot(c, dir), a;
        vec3 cp = dir * b - c;
        float d = length(cp);
        if (d < R) {                       // over the planet: haze towards its edge
          vec3 p = dir * (b - sqrt(R * R - d * d)) - c;
          nr = p / R;
          a = pow(1.0 - max(dot(nr, -dir), 0.0), 3.0) * 0.55;
        } else {                           // beside it: the glowing rim
          float h = (d - R) / (R * 0.09);
          if (h > 1.0 || b < 0.0) discard;
          nr = cp / d;
          a = pow(1.0 - h, 2.2) * 0.8;
        }
        a *= (smoothstep(-0.35, 0.45, dot(nr, l)) + pow(max(dot(dir, l), 0.0), 6.0) * 1.2) * uStr;
        gl_FragColor = vec4(uCol * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  m.color = col;                           // so applySystemSky can tint it like before
  return m;
}

export function applySystemSky(system) {
  const p = system.planet;
  paintPlanet(pcanvas, ptex, p.hue, system.id * 977 + 13, p.kind);
  planet.scale.setScalar(p.size);
  planet.position.fromArray(p.dir).normalize().multiplyScalar(2700);
  planet.rotation.set(0.35, system.id, 0.42);
  atmo.scale.setScalar(p.size);
  atmo.position.copy(planet.position);
  atmo.material.color.setHSL(((p.hue + 20) % 360) / 360, 0.8, 0.6);
  if (p.kind === 'ice') atmo.material.color.setHSL((195 + (p.hue % 25)) / 360, 0.6, 0.65);
  atmo.material.uniforms.uStr.value = p.kind === 'gas' ? 1 : p.kind === 'ice' ? 0.7 : 0.45;
  ring.visible = !!p.ring;
  ring.scale.setScalar(p.size);
  ring.position.copy(planet.position);
  ringPlanet.value.set(planet.position.x, planet.position.y, planet.position.z, p.size * 0.995);
  ring.rotation.set(1.2 + (system.id % 5) * 0.08, 0.3, 0.2);
  ring.material.color.setHSL((p.hue % 360) / 360, 0.15, 0.85);
  moon.visible = !!p.moon;
  moon.scale.setScalar(p.size * 0.18);
  moon.position.copy(planet.position).add(new THREE.Vector3(p.size * 2.6, p.size * 0.6, -p.size * 0.8));
  const neb = system.nebula;
  nebulae.forEach((sp, i) => {
    sp.visible = !!neb;
    if (!neb) return;
    sp.material.color.setHSL(((neb.hue + i * 40) % 360) / 360, 0.7, 0.5);
    sp.position.fromArray(neb.dir).normalize().multiplyScalar(3100).add(new THREE.Vector3(i * 700, i * -400, i * 300));
    sp.scale.setScalar(2600 - i * 900);
  });
  // Star colour and size
  const star = system.star || { color: [1, 0.94, 0.85], size: 1 };
  sunLight.color.setRGB(...star.color);
  sunSprite.material.color.setRGB(star.color[0] * 1.3, star.color[1] * 1.3, star.color[2] * 1.3);
  sunSprite.scale.setScalar(900 * star.size);
  hemi.color.setRGB(0.2 + star.color[0] * 0.05, 0.3 + star.color[1] * 0.05, 0.4 + star.color[2] * 0.08);
  sunDir.fromArray(system.sun).normalize();
  sunLight.position.copy(sunDir);
  const u = sunBall.material.uniforms, sf = SURFACE[star.kind] || SURFACE.gelb;
  u.uColor.value.setRGB(...star.color);
  u.uCool.value.setRGB(...sf[0]);
  u.uHot.value.setRGB(...sf[1]);
  const S = G.star;
  S.kind = star.kind || 'gelb';
  S.R = SUN.radius * star.size;
  S.heat = SUN.heat[S.kind] ?? 1;
  S.pos.copy(sunDir).multiplyScalar(SUN.dist).sub(G.origin);
  S.hex = '#' + new THREE.Color(...star.color).getHexString();
  updateSun();
}

// Places the sun ball and its glow in the sky from the true distance; the light comes from it
function updateSun() {
  const S = G.star;
  rel.subVectors(S.pos, G.camera.position);
  const d = Math.max(rel.length(), S.R * 1.001);
  rel.divideScalar(d);
  const s = SKY_R * S.R / d;
  sunBall.position.copy(rel).multiplyScalar(SKY_R);
  sunBall.scale.setScalar(s);
  sunBall.rotation.y = G.time * 0.004;
  sunBall.material.uniforms.uTime.value = G.time;
  sunSprite.position.copy(sunBall.position);
  const glow = s * 9;
  sunSprite.scale.setScalar(Math.min(glow, 12000));
  sunSprite.material.opacity = Math.max(0.22, Math.min(1, 4500 / glow));   // close up only a faint haze
  sunLight.position.copy(rel);
}

export function updateSky() {
  sky.position.copy(G.camera.position);
  if (G.star) updateSun();
}

// The current planet texture, reused for the view out of the hangar
export const skyPlanetTexture = () => ptex;
