// Intro before the main menu: five short camera shots of the game world (a ship racing
// toward the planet, a station with traffic, a dogfight, a black hole, the hyperspace tunnel).
// Skippable with the button, Esc, Space, Enter or the Android back key. Everything is placed
// in system coordinates and shifted by G.origin each frame, so the floating origin can move.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { SUN, VERSION } from '../config.js';
import { cloneModel, buildFallbackShip } from '../core/assets.js';
import { haulerModel } from '../world/traffic.js';
import { slotDir, stationUp } from '../world/station.js';
import { populateAsteroids, clearAsteroids } from '../world/asteroids.js';
import { emit } from '../world/particles.js';
import { enterSystem } from '../game/hyper.js';
import { SYSTEMS } from '../game/galaxy.js';
import { lookQuat } from '../utils.js';
import { applyView } from '../entities/player.js';
import { HELP } from './menu.js';
import { ITEMS } from './howto.js';
import { initAudio, audioRunning, startMusic, stopMusic } from '../core/audio.js';

const SHOTS = [
  { len: 7, title: 'KAVITE', text: 'Ein Weltraumspiel von Björn Kavermann', big: true },
  { len: 7, title: 'Handel', text: 'Hundert Sternsysteme, Stationen mit Markt, Werft und Bar' },
  { len: 6.5, title: 'Kampf', text: 'Piraten jagen, Kopfgeld kassieren, der Polizei entkommen' },
  { len: 7.5, title: 'Schwarze Löcher', text: 'Wer ihnen zu nahe kommt, kehrt nicht zurück' },
  { len: 4.5, title: 'Bereit zum Sprung?', text: '' },
];
const FADE = 0.6;
// After the last shot the guide rolls up into the stars, until it is through or tapped
const CRAWL = { lines: 2, delay: 1.2 };   // speed in text lines per second

// The guide for the crawl: a short opening, the controls (how-to screen), the tips (main menu)
function crawlText() {
  const tips = [...new DOMParser().parseFromString(HELP, 'text/html').querySelectorAll('dt')]
    .map(dt => [dt.textContent, dt.nextElementSibling?.textContent || '']);
  const sec = (title, list) => `<h3>${title}</h3>` + list.map(([t, d]) => `<p><b>${t}.</b> ${d}</p>`).join('');
  return `<h2>Kavite</h2>
    <p class="lead">Hundert Sternsysteme, ein kleines Schiff und hundert Credits. Händler suchen Fracht, Piraten suchen Beute,
    die Polizei sucht beide. Dein alter Fluglehrer Jona Brekk ist verschwunden, und in der Bar wartet eine Nachricht von ihm.
    Was du daraus machst, liegt bei dir, Kommandant.</p>`
    + sec('Steuerung', ITEMS) + sec('Spielinfos', tips)
    + '<p class="lead">Gute Reise.</p>';
}

let run = null;
const root = () => document.getElementById('intro');
const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), w = new THREE.Vector3();
const camSys = new THREE.Vector3(), lookSys = new THREE.Vector3();
// Camera up for the current shot; a portrait screen may roll the camera to fit a wide subject
const camUp = new THREE.Vector3(0, 1, 0);
// Portrait phones see far less to the sides (the field of view is set vertically), so shots
// pull their side-to-side action closer to the middle there
const portrait = () => innerWidth < innerHeight;

export const introActive = () => !!run;

function ship(kind) {
  const o = new THREE.Group();
  o.add(cloneModel(kind) || buildFallbackShip(kind === 'pirate' ? 'pirate' : 'player'));
  run.group.add(o);
  return o;
}

// Moves an actor from a to b (system coordinates) between t0 and t1, nose along the path
function fly(o, a, b, t0, t1, t, ease = 0) {
  const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  o.visible = t >= t0 && t <= t1 + 0.3;
  const kk = ease ? k * k : k;
  o.position.lerpVectors(a, b, kk).sub(G.origin);
  lookQuat(v.subVectors(b, a), up, o.quaternion);
}

function bolt() {
  const m = new THREE.Mesh(run.boltGeo, run.boltMat);
  m.visible = false;
  run.group.add(m);
  return m;
}

// Shot set-up: called once when a shot starts; returns its per-frame function
const SETUP = [
  // 1. Over the asteroids toward the planet, a Kestrel races past
  () => {
    const st = G.stations[0], P = new THREE.Vector3().fromArray(G.system.planet.dir).normalize();
    slotDir(st, v);
    const side = new THREE.Vector3().crossVectors(P, up).normalize();
    const start = st.sysPos.clone().addScaledVector(v, 2600).addScaledVector(side, 700);
    const kes = ship('player');
    G.ship.position.copy(start).sub(G.origin);
    populateAsteroids(22);
    const a = start.clone().addScaledVector(P, -40).addScaledVector(side, 9).addScaledVector(up, -4);
    const b = start.clone().addScaledVector(P, 820).addScaledVector(side, -20).addScaledVector(up, 30);
    // Look partly towards the sun, so the planet is seen lit with the sun beside it
    const sunDir = new THREE.Vector3().fromArray(G.system.sun).normalize().multiplyScalar(SUN.dist).sub(start).normalize();
    const look = sunDir.clone().lerp(P, 0.58).normalize();
    if (portrait()) {
      // Sun above, planet below: roll the camera so the two line up vertically, the planet
      // a bit below the middle and the sun as close as it fits
      const sep = P.angleTo(sunDir), axis = new THREE.Vector3().crossVectors(P, sunDir).normalize();
      look.copy(P).applyAxisAngle(axis, Math.min(0.42, sep * 0.45));
      camUp.copy(sunDir).addScaledVector(look, -sunDir.dot(look)).normalize();
    }
    return t => {
      camSys.copy(start).addScaledVector(P, t * 32);
      lookSys.copy(camSys).addScaledVector(look, 1000).addScaledVector(camUp, 60 - t * 6);
      fly(kes, a, b, 1.2, 7, t);
    };
  },
  // 2. A station: a hauler leaves the slot, an Atlas crosses the picture
  () => {
    const st = G.stations[0], S = st.S, slot = slotDir(st, new THREE.Vector3()), sUp = stationUp(st, new THREE.Vector3());
    const side = new THREE.Vector3().crossVectors(slot, sUp).normalize();
    const hauler = haulerModel();
    run.group.add(hauler);
    const atlas = ship('atlas');
    const h0 = st.sysPos.clone().addScaledVector(slot, S * 0.4), h1 = st.sysPos.clone().addScaledVector(slot, S + 520).addScaledVector(side, -60);
    const c0 = st.sysPos.clone().addScaledVector(slot, S + 150).addScaledVector(side, 85).addScaledVector(sUp, 28);
    // Portrait: the Atlas passes farther from the camera and less wide, so it stays in the picture
    // and the camera stands farther back so more of the station fits; thinner haze to match,
    // or the extra distance would sink the station into the dark
    const pt = portrait(), near = pt ? -60 : -45, wide = pt ? 0.5 : 1, back = pt ? 120 : 0;
    if (pt) G.scene.fog.density = run.fog * 0.6;
    const a0 = c0.clone().addScaledVector(slot, near).addScaledVector(side, -260 * wide).addScaledVector(sUp, -6);
    const a1 = c0.clone().addScaledVector(slot, near + 20).addScaledVector(side, 240 * wide).addScaledVector(sUp, 12);
    return t => {
      camSys.copy(c0).addScaledVector(side, -t * 9).addScaledVector(slot, t * 4 + back);
      lookSys.copy(st.sysPos).addScaledVector(slot, S * 0.6).addScaledVector(sUp, -35);
      fly(hauler, h0, h1, 0, 7, t, 1);
      fly(atlas, a0, a1, 2.2, 6.4, t);
    };
  },
  // 3. Dogfight: a pirate rushes at the camera, a Hornet behind it fires; the pirate blows up
  () => {
    const st = G.stations[0], slot = slotDir(st, new THREE.Vector3());
    // Look across the sunlight, never into the sun
    const sun = new THREE.Vector3().fromArray(G.system.sun).normalize();
    const D = new THREE.Vector3().crossVectors(up, sun).normalize().addScaledVector(up, 0.1).normalize(), side = new THREE.Vector3().crossVectors(D, up).normalize();
    const A = st.sysPos.clone().addScaledVector(slot, 3200).addScaledVector(side, 1800);
    const pirate = ship('pirate'), hornet = ship('hornet');
    // Both cross the picture from left to right, the Hornet behind the pirate
    // Portrait: narrower crossing, and the camera aims at the spot where the pirate blows up
    const pt = portrait(), k = pt ? 0.5 : 1;
    const p0 = A.clone().addScaledVector(D, 52).addScaledVector(side, -120 * k).addScaledVector(up, 12), p1 = A.clone().addScaledVector(D, 34).addScaledVector(side, 120 * k).addScaledVector(up, 4);
    const h0 = A.clone().addScaledVector(D, 66).addScaledVector(side, -200 * k).addScaledVector(up, 16), h1 = A.clone().addScaledVector(D, 16).addScaledVector(side, 150 * k).addScaledVector(up, 1);
    const aim = pt ? p0.clone().lerp(p1, (2.7 - 0.3) / 4.3).sub(A).normalize() : D;
    const bolts = Array.from({ length: 10 }, bolt);
    let boom = false;
    return t => {
      camSys.copy(A).addScaledVector(up, 6 + Math.sin(t * 9) * 0.25 * Math.min(1, t));
      lookSys.copy(A).addScaledVector(aim, 400).addScaledVector(up, pt ? 0 : -25);
      if (!boom) fly(pirate, p0, p1, 0.3, 4.6, t);
      fly(hornet, h0, h1, 0.5, 5.8, t);
      // Bolts: short red streaks from the Hornet toward the pirate
      bolts.forEach((b, i) => {
        const age = ((t * 6 + i * 0.6) % 6) / 6;
        b.visible = t > 1 && !boom;
        if (!b.visible) return;
        w.copy(pirate.position).add(G.origin);
        v.copy(hornet.position).add(G.origin).lerp(w, age);
        b.position.copy(v).sub(G.origin);
        b.lookAt(pirate.position);
      });
      if (!boom && t > 2.7) {
        boom = true;
        pirate.visible = false;
        emit(pirate.position, 240, 45, 0.05);
        emit(pirate.position, 90, 28, 0.58);
        emit(pirate.position, 60, 60, 0.12);
      }
    };
  },
  // 4. A black hole: the camera circles it, a Kestrel streaks past along the disk
  () => {
    const sys = SYSTEMS.find(s => s.stations.some(x => x.bh));
    if (sys) enterSystem(sys.id);
    const h = G.holes[0];
    const H = h ? h.sysPos.clone() : G.stations[0].sysPos.clone();
    G.ship.position.copy(H).sub(G.origin);
    populateAsteroids(10);
    const kes = ship('player');
    const a = H.clone().add(new THREE.Vector3(-700, 40, 260)), b = H.clone().add(new THREE.Vector3(700, -20, 200));
    return t => {
      const ang = 0.9 + t * 0.07, r = 760 - t * 30;
      camSys.set(Math.cos(ang) * r, 130 - t * 6, Math.sin(ang) * r).add(H);
      lookSys.copy(H);
      G.ship.position.copy(camSys).sub(G.origin);
      fly(kes, a, b, 2.5, 6.5, t);
    };
  },
  // 5. Into hyperspace (the warp overlay does the work)
  () => {
    const fwd = new THREE.Vector3().subVectors(lookSys, camSys).normalize();
    const c = camSys.clone();
    return t => {
      camSys.copy(c).addScaledVector(fwd, t * t * 40);
      lookSys.copy(camSys).addScaledVector(fwd, 100);
    };
  },
];

function html() {
  return `<div class="in-fade"></div>
    <div class="in-cap"><h1></h1><p></p><small class="in-ver">Version ${VERSION}</small></div>
    <button type="button" class="ghost small in-skip">Überspringen ›</button>
    <button type="button" class="ghost small in-sound" hidden>♪ Ton an</button>`;
}

function showShot(i) {
  const s = SHOTS[i], el = root();
  el.querySelector('h1').textContent = s.title;
  el.querySelector('p').textContent = s.text;
  el.querySelector('.in-cap').classList.toggle('big', !!s.big);
}

// Browsers start sound only after a tap; the Android app may play right away
const wakeSound = () => initAudio();

function onKey(e) {
  if (['Escape', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); skipIntro(); return; }
  // Cheat mode: S-O-S typed
  if (e.key.length === 1) { run.typed = (run.typed + e.key.toLowerCase()).slice(-3); if (run.typed === 'sos') cheat(); }
}

// Cheat mode: SOS morsed on the screen (· · · − − − · · ·): short tap = dot, long press = dash
const SOS = '...---...', DASH = 0.28, GAP = 1.6;
function onDown(e) {
  if (!run || e.target.closest?.('button')) return;
  clearTimeout(run.pendingSkip);
  run.press = performance.now();
}
function onUp() {
  if (!run || run.press == null) return;
  const now = performance.now(), held = (now - run.press) / 1000;
  if (now - run.lastTap > GAP * 1000) run.morse = '';
  run.press = null; run.lastTap = now;
  run.morse = (run.morse + (held >= DASH ? '-' : '.')).slice(-SOS.length);
  if (run.morse === SOS) cheat();
}
function cheat() { run.cheat = true; endIntro(); }

// Plays the intro; resolves when it ends or is skipped (with true when SOS asked for the cheat editor)
export function playIntro() {
  return new Promise(resolve => {
    const el = root();
    el.innerHTML = html();
    el.hidden = false;
    run = {
      shot: -1, t: 0, step: null, resolve, morse: '', typed: '', press: null, lastTap: 0, cheat: false, prevMode: G.mode, fog: G.scene.fog.density,
      group: new THREE.Group(),
      boltGeo: new THREE.CylinderGeometry(0.22, 0.22, 9, 5).rotateX(Math.PI / 2),
      boltMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.4) }),
    };
    G.scene.add(run.group);
    // Fill light from the camera, so ships seen against the sun are not black silhouettes
    run.fill = new THREE.DirectionalLight(0xc8d8ff, 1.6);
    G.scene.add(run.fill, run.fill.target);
    G.mode = 'intro';
    G.ship.visible = false;   // the camera sits where the (hidden) ship is
    el.querySelector('.in-skip').addEventListener('click', skipIntro);
    el.querySelector('.in-sound').addEventListener('click', wakeSound);
    addEventListener('keydown', onKey, true);
    addEventListener('pointerdown', wakeSound, true);
    addEventListener('pointerdown', onDown, true);
    addEventListener('pointerup', onUp, true);
    initAudio();
    startMusic('intro');   // Ride of the Valkyries; waits for the first tap where sound is locked
    next();
  });
}

function next() {
  run.shot++;
  run.t = 0;
  // Clear the previous shot's actors
  for (const c of [...run.group.children]) run.group.remove(c);
  if (run.shot >= SHOTS.length) { startCrawl(); return; }
  camUp.set(0, 1, 0);
  G.scene.fog.density = run.fog;
  run.step = SETUP[run.shot]();
  showShot(run.shot);
}

export function skipIntro() { if (run) endIntro(); }

// The guide as a crawl, slanted into the stars; the camera keeps still on the star field
function startCrawl() {
  const el = root();
  run.crawl = { y: 0 };
  run.step = () => {};
  // Plain stars behind the text: look away from the sun and the planet, no rocks around
  const sun = new THREE.Vector3().fromArray(G.system.sun).normalize(), P = new THREE.Vector3().fromArray(G.system.planet.dir).normalize();
  const away = new THREE.Vector3().crossVectors(sun, P).normalize();
  if (away.lengthSq() < 0.5) away.set(1, 0, 0);
  away.addScaledVector(sun.add(P).normalize(), -0.4).normalize();
  lookSys.copy(camSys).addScaledVector(away, 100);
  clearAsteroids();
  el.querySelector('.in-cap').style.opacity = '0';
  el.insertAdjacentHTML('beforeend', `<div class="in-crawl"><div class="in-crawl-text">${crawlText()}</div></div>`);
  // A tap leads to the main menu, a moment later, unless it was the start of a morse code
  el.querySelector('.in-crawl').addEventListener('click', () => { clearTimeout(run.pendingSkip); run.pendingSkip = setTimeout(skipIntro, 700); });
  el.querySelector('.in-skip').textContent = 'Hauptmenü ›';
}
function updateCrawl() {
  const el = root(), text = el.querySelector('.in-crawl-text'), h = innerHeight;
  const t = Math.max(0, run.t - CRAWL.delay);
  // From just below the screen up past the vanishing point, at a steady reading pace
  run.crawl.line ||= parseFloat(getComputedStyle(text).fontSize) * 1.45;
  const y = h - t * CRAWL.lines * run.crawl.line;
  text.style.transform = `rotateX(26deg) translateY(${y.toFixed(1)}px)`;
  el.querySelector('.in-fade').style.opacity = Math.max(0, 1 - run.t / FADE).toFixed(3);
  if (y < -text.offsetHeight - h * 0.4) endIntro();
}

// For tests: jump to a moment of a shot
export function introJump(shot, t) {
  if (!run) return;
  run.shot = shot - 1;
  next();
  const step = 1 / 30;
  for (let x = 0; x < t; x += step) { run.t += step; run.step(run.t); }
  return run;
}

function endIntro() {
  const r = run;
  run = null;
  removeEventListener('keydown', onKey, true);
  removeEventListener('pointerdown', wakeSound, true);
  removeEventListener('pointerdown', onDown, true);
  removeEventListener('pointerup', onUp, true);
  clearTimeout(r.pendingSkip);
  stopMusic();
  G.scene.remove(r.group, r.fill, r.fill.target);
  G.scene.fog.density = r.fog;
  r.boltGeo.dispose();
  r.boltMat.dispose();
  root().hidden = true;
  root().innerHTML = '';
  G.mode = r.prevMode;
  G.ship.visible = true;
  r.resolve(r.cheat);
}

export function updateIntro(dt) {
  if (!run) return;
  run.t += dt;
  if (run.crawl) {
    const cam = G.camera;
    cam.position.copy(camSys).sub(G.origin);
    cam.lookAt(v.copy(lookSys).sub(G.origin));
    G.ship.position.copy(cam.position);
    updateCrawl();
    return;
  }
  const s = SHOTS[run.shot];
  if (run.t >= s.len) { next(); if (!run || run.crawl) return; }
  const t = run.t, len = SHOTS[run.shot].len;
  run.step(t);
  applyView();   // hides the cockpit frame in 'intro' mode
  const cam = G.camera;
  cam.position.copy(camSys).sub(G.origin);
  cam.up.copy(camUp);
  cam.lookAt(v.copy(lookSys).sub(G.origin));
  run.fill.position.copy(cam.position).addScaledVector(up, 30);
  run.fill.target.position.copy(v);
  if (run.shot !== 3) G.ship.position.copy(cam.position);   // asteroids and dust gather around the camera
  // Fades between shots, the caption in between
  const el = root();
  el.querySelector('.in-sound').hidden = audioRunning();
  const fade = Math.max(0, 1 - t / FADE, 1 - (len - t) / FADE);
  el.querySelector('.in-fade').style.opacity = run.shot === SHOTS.length - 1 ? Math.max(0, 1 - t / FADE) : fade.toFixed(3);
  const cap = Math.min(1, Math.max(0, (t - 0.7) / 0.6), Math.max(0, (len - 0.5 - t) / 0.5));
  el.querySelector('.in-cap').style.opacity = cap.toFixed(3);
}

// Warp overlay for the last shot: [intensity, veil, flash] or null
export function introWarp() {
  if (!run || run.crawl || run.shot !== SHOTS.length - 1) return null;
  const t = run.t, len = SHOTS[run.shot].len;
  return [Math.min(1, t / 1.2), Math.min(0.85, t / len * 1.2), Math.max(0, 1 - Math.abs(t - (len - 0.4)) * 4)];
}
