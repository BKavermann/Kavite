import './style.css';
import * as THREE from 'three';
import { G } from './ctx.js';
import { INSURANCE, HYPER, CRUISE, RAIL, MISSILE } from './config.js';
import { initRenderer, resizeRenderer, render, setGlowStrength } from './core/renderer.js';
import { initInput, readInput, onAction, resetSticks, placeIdleSticks } from './core/input.js';
import { initAudio, setVolume, startHum, stopHum, sfxDeny } from './core/audio.js';
import { loadModels } from './core/assets.js';
import { initSky, updateSky } from './world/sky.js';
import { initDust, updateDust } from './world/dust.js';
import { initParticles, updateParticles } from './world/particles.js';
import { initAsteroids, updateAsteroids, populateAsteroids } from './world/asteroids.js';
import { updateStations } from './world/station.js';
import { updateHoles } from './world/blackhole.js';
import { enterHangar, exitHangar, updateHangar, hangarView, resizeHangar, refreshHangarShip } from './world/hangar.js';
import { updatePickups, clearPickups } from './world/pickups.js';
import { updateTraffic } from './world/traffic.js';
import { updateMissions, missionsOnDeath } from './game/missions.js';
import { cycleNav } from './game/nav.js';
import { initPlayer, attachPlayerModel, updatePlayer, updateBolts, updateCamera, layoutCockpit, snapCamera, toggleCruise, ejectPlayer, toggleLookBack } from './entities/player.js';
import { spawnEnemy, updateEnemies, clearEnemies } from './entities/enemies.js';
import { updateDockingChecks, requestDock, updateAutoDock, dockAt, undock } from './game/docking.js';
import { updateDirector, resetPirateTimer } from './game/director.js';
import { updateMissiles, updateBeams, cycleWeapon } from './entities/weapons.js';
import { tapTarget, lockAhead, toggleAlign } from './game/targeting.js';
import { enterSystem, placeNear, toggleHyper, updateHyper, tunnelProgress } from './game/hyper.js';
import { newProfile, loadProfile, saveProfile, clearProfile, loadSettings, saveSettings, cargoUsed, maxAmmo, hasHyper, hyperRange } from './game/save.js';
import { initHud, updateHud } from './ui/hud.js';
import { initRadar, sizeRadar, drawRadar } from './ui/radar.js';
import { initMarks, updateMarks } from './ui/marks.js';
import { initWarp, sizeWarp, drawWarp } from './ui/warp.js';
import { openStation, closeStation } from './ui/station-ui.js';
import { openMap, closeMap, mapOpen } from './ui/galaxy-ui.js';
import { showMainMenu, showPause, showDeath, showGameOver, hideMenu } from './ui/menu.js';
import { openSettings, closeSettings, settingsOpen } from './ui/settings.js';
import { openHowto, closeHowto, howtoOpen, maybeFirstHowto } from './ui/howto.js';
import { updateLaw, updateCustoms } from './game/law.js';
import { updateEncounters } from './game/encounters.js';
import { updateStory, storyOnDeath } from './game/story.js';
import { updateSun } from './game/sun.js';
import { playIntro, updateIntro, introActive, introWarp } from './ui/intro.js';
import { openCheat } from './ui/cheat.js';
import { aboutOpen, closeAbout } from './ui/about.js';
import { tipsOpen, closeTips } from './ui/tips.js';

const $ = id => document.getElementById(id);

function resizeAll() {
  resizeRenderer();
  resizeHangar();
  layoutCockpit();
  sizeRadar();
  sizeWarp();
  placeIdleSticks();
}

// Loads the respawn system (if needed) and docks at the respawn station.
function goToDock() {
  const p = G.profile;
  if (G.systemId !== p.system || !G.stations.length) enterSystem(p.system);
  dockAt(p.station);
}

/* ---------- Game flow ---------- */
G.events = {
  startGame(fresh) {
    initAudio();
    G.profile = (!fresh && loadProfile()) || newProfile();
    saveProfile(G.profile);
    attachPlayerModel();
    hideMenu();
    enterSystem(G.profile.system);
    goToDock();
  },
  docked(st, msgs) {
    resetSticks();
    enterHangar(st.def);
    startHum();
    openStation(msgs);
  },
  undock() {
    initAudio();
    closeMap();
    closeStation();
    exitHangar();
    stopHum();
    undock();
    resetPirateTimer(35);
    G.navTarget = (G.profile.station + 1) % G.stations.length;
    maybeFirstHowto();
  },
  // insured: the pilot got out in time (ejected) or the game-over rule is off; the
  // insurance replaces the ship. Otherwise the pilot went down with it: game over, save gone.
  onDeath(insured, ejected = false) {
    const p = G.profile;
    resetSticks();
    if (!insured) {
      const lost = { credits: p.credits, cargo: cargoUsed(p), upgrades: Object.values(p.upgrades).reduce((a, b) => a + b, 0) };
      p.over = true;              // nothing may save this commander again
      clearProfile();
      setTimeout(() => showGameOver(p, lost), 1800);
      return;
    }
    const lost = cargoUsed(p);
    const fee = Math.min(p.credits, INSURANCE);
    missionsOnDeath();
    storyOnDeath();
    setTimeout(() => {
      p.cargo = {};
      p.credits -= fee;
      p.hull = 1;                 // the insurance ship comes without damage
      p.fuel = hyperRange(p);
      p.ammo = maxAmmo(p);
      if (p.upgrades.rail) p.slugs = Math.max(p.slugs, RAIL.magazine);
      if (p.upgrades.missile) p.missiles = Math.max(p.missiles, MISSILE.rack);
      saveProfile(p);
      showDeath(lost, fee, ejected);
    }, 1800);
  },
  respawn() {
    hideMenu();
    clearEnemies();
    clearPickups();
    goToDock();
  },
  resume() {
    hideMenu();
    G.paused = false;
  },
  setGlow(on) {
    G.settings.glow = on && !!G.composer;
    saveSettings(G.settings);
    resizeAll();
  },
  setGlowStrength(v) {
    setGlowStrength(v);
    saveSettings(G.settings);
  },
  setQuality(q) {
    G.settings.quality = q;
    saveSettings(G.settings);
    resizeAll();
  },
  openSettings,
  // Hull damage switched on or off: marks on or off the ship
  rulesChanged() { if (G.profile) { attachPlayerModel(); refreshHangarShip(); } },
  openHowto: () => openHowto(),
  setView(view) {
    G.settings.view = view;
    saveSettings(G.settings);
    snapCamera();
  },
};

// Two taps (or B twice) within 3 s, so the ship is not given up by accident
function eject() {
  const r = ejectPlayer();
  if (r === 'armed') sfxDeny();   // the button now asks "Wirklich aussteigen?"
}

function togglePause() {
  if (howtoOpen()) { closeHowto(); return; }
  if (aboutOpen()) { closeAbout(); return; }
  if (tipsOpen()) { closeTips(); return; }
  if (settingsOpen()) { closeSettings(); return; }
  if (mapOpen()) { closeMap(); return; }
  if (G.paused) { G.events.resume(); return; }
  if (G.mode !== 'flight' && G.mode !== 'docking') return;
  G.paused = true;
  resetSticks();
  showPause();
}

function toggleMap() {
  if (mapOpen()) { closeMap(); return; }
  if (G.mode !== 'flight' && G.mode !== 'docked') return;
  resetSticks();
  openMap();
}

function cycleTarget() { cycleNav(); }

/* ---------- Loop ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.paused) {
    G.time += dt;
    const inp = readInput();
    updatePlayer(dt, inp);
    if (G.mode === 'docking') updateAutoDock(dt);
    updateHyper(dt);
    updateStations(dt);
    updateHoles();
    if (G.mode === 'flight') updateDockingChecks(dt);
    updateAsteroids(dt);
    updateEnemies(dt);
    updateBolts(dt);
    updateMissiles(dt);
    updateBeams(dt);
    updatePickups(dt);
    updateTraffic(dt);
    updateMissions(dt);
    updateParticles(dt);
    if (G.profile) { updateDirector(dt); updateLaw(dt); updateCustoms(dt); updateEncounters(dt); updateSun(dt); updateStory(dt); }
  }
  if (introActive()) updateIntro(dt); else updateCamera(dt);
  updateHangar(dt);
  updateSky();
  updateDust();
  G.camera.updateMatrixWorld();
  updateHud(dt);
  updateMarks();
  drawRadar();
  render(dt, hangarView());

  // Streaks: light while cruising, full tunnel in hyperspace with a flash at the switch
  const tp = tunnelProgress(), iw = introWarp();
  if (iw) drawWarp(dt, ...iw);
  else if (tp > 0) drawWarp(dt, 1, Math.min(0.85, tp * 3), Math.max(0, 1 - Math.abs(tp - 0.5) * 6));
  else drawWarp(dt, G.player && G.player.cruise ? (G.player.cruiseSpeed / CRUISE.speed) * 0.55 : 0);
  requestAnimationFrame(frame);
}

/* ---------- Boot ---------- */
async function boot() {
  loadSettings(G.settings);
  setVolume(G.settings.volume ?? 0.8);
  initRenderer($('stage'));
  initSky();
  initDust();
  initParticles();
  initAsteroids();
  initPlayer();
  initInput();
  initHud();
  initMarks();
  initRadar();
  initWarp();

  // Menu backdrop: parked in front of the Kessel-Ring slot
  enterSystem(0);
  placeNear(0, 190);
  resizeAll();

  addEventListener('resize', resizeAll);
  addEventListener('orientationchange', () => setTimeout(resizeAll, 200));
  onAction('dock', requestDock);
  onAction('pause', togglePause);
  onAction('target', cycleTarget);
  onAction('cruise', toggleCruise);
  onAction('map', toggleMap);
  onAction('hyper', toggleHyper);
  onAction('tap', tapTarget);
  onAction('lock', lockAhead);
  onAction('align', toggleAlign);
  onAction('weapon', cycleWeapon);
  onAction('rear', toggleLookBack);
  $('rearBtn').addEventListener('click', toggleLookBack);
  onAction('view', () => G.events.setView(G.settings.view === 'chase' ? 'cockpit' : 'chase'));
  $('dockBtn').addEventListener('click', requestDock);
  $('navBtn').addEventListener('click', cycleTarget);
  $('cruiseBtn').addEventListener('click', toggleCruise);
  $('mapBtn').addEventListener('click', toggleMap);
  $('hyperBtn').addEventListener('click', toggleHyper);
  $('weaponBtn').addEventListener('click', cycleWeapon);
  $('alignBtn').addEventListener('click', toggleAlign);
  $('pauseBtn').addEventListener('click', togglePause);
  $('ejectBtn').addEventListener('click', eject);
  onAction('eject', eject);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'flight' && !G.paused) togglePause(); });

  requestAnimationFrame(t => { last = t; frame(t); });

  await loadModels();
  $('loading').hidden = true;
  attachPlayerModel();
  let cheat = false;
  if (G.settings.intro !== false) {
    cheat = await playIntro();
    enterSystem(0);
    placeNear(0, 190);
  }
  populateAsteroids(16);
  spawnEnemy(G.ship.position.clone().add(new THREE.Vector3(-40, 12, -60).applyQuaternion(G.ship.quaternion)), 0);
  showMainMenu(!!loadProfile());
  if (cheat) openCheat();
}

boot();
