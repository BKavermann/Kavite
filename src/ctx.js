// Shared game state. Modules read and write through G instead of importing
// each other's variables, which keeps circular imports harmless.

export const G = {
  mode: 'menu',        // intro | menu | flight | docking | docked | hyper | dead
  paused: false,
  time: 0,

  renderer: null, scene: null, camera: null, composer: null,
  origin: null,        // floating origin: system coordinates of scene point (0,0,0)
  ship: null,          // THREE.Object3D of the player
  player: null,        // flight state (speed, shield, cruise, ...)

  systemId: 0,         // system the ship is in right now
  system: null,
  hyper: null,         // running hyperjump (countdown / tunnel)

  asteroids: [],
  enemies: [],
  bolts: [],           // player lasers
  missiles: [],        // player missiles in flight
  beams: [],           // railgun slugs in flight
  lock: null,          // tapped target { kind, obj }, obj has .pos
  enemyBolts: [],
  stations: [],
  holes: [],           // black holes next to some stations (world/blackhole.js)
  pickups: [],
  traffic: [],         // civilian haulers around stations

  navTarget: 0,        // index into stations
  dockCandidate: null, // station whose approach corridor the player is in

  profile: null,       // persistent save data
  settings: { intro: true, volume: 0.8, invertY: false, sensitivity: 1, glow: true, glowStrength: 0.35, view: 'cockpit', quality: 'mid', difficulty: 'normal' },

  events: {},          // callbacks wired up in main.js
};
