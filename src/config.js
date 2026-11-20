// Central tuning values. Change numbers here, not deep inside the modules.

// Version shown in the settings. tools/build_apk.sh writes it into the Android manifest
// (versionName 0.40, versionCode 40), so raise it for every release.
export const VERSION = '0.85';
export const COPYRIGHT = '© 2026 Björn Kavermann';
// Impressum in "Über Kavite" (Björn's details, § 5 DDG)
export const IMPRINT = { name: 'Björn Kavermann', street: 'Burgwedel 44b', city: '22457 Hamburg', country: 'Deutschland', email: 'b@kavs.de' };

// Units: 1 = 1 metre, speeds in m/s, hyperspace distances in light-years (LJ).

export const WORLD = 800;           // edge of the cube in which the local asteroid field wraps
export const HALF = WORLD / 2;
export const REBASE_DIST = 2000;    // floating origin: re-centre when the ship is this far out

export const TIERS = [              // asteroid sizes: large, medium, small
  { r: 14, dmg: 34 },
  { r: 7, dmg: 20 },
  { r: 3.5, dmg: 10 },
];
export const ROCK_TARGET = 26;      // asteroid "mass" kept around the ship (large = 1), times system density

export const FLIGHT = { pitch: 1.5, yaw: 1.3, roll: 2.3, accel: 55, maxSpeed: 110, minSpeed: -18 };
export const PLAYER_RADIUS = 2.6;
export const SEAT = [0, 0.95, -1.7];    // pilot eye point in ship space
export const CHASE = [0, 4.2, 17];      // chase camera offset in ship space

// In-system cruise drive: fast travel between stations, blocked near masses
export const CRUISE = { speed: 3000, accel: 1400, masslockStation: 700, masslockEnemy: 900, dropDist: 900, turnScale: 0.5 };

// Hyperdrive between systems
// ranges: jump range in LJ for drive class 1, 2, 3 (the tank holds one full jump)
export const HYPER = { ranges: [7, 15, 30], countdown: 5, tunnel: 2.6, fuelPrice: 6, masslock: 700 };

export const LASER = { speed: 300, life: 1.1 };
export const LASER_LEVELS = [
  { interval: 0.12, dmg: 1, color: [0.55, 1.6, 1.25] },
  { interval: 0.085, dmg: 2, color: [1.5, 0.8, 2.1] },
];
// Laser heat: every shot heats the guns, they cool down when you stop firing.
// Overheated guns stay blocked until they are back below `resume`.
export const LASER_HEAT = { perShot: [0.03, 0.026], coolFiring: 0.1, cool: 0.4, coolDelay: 0.35, resume: 0.35, warn: 0.8 };
export const AMMO = { base: 300, perMagazine: 150, perCredit: 8 };   // 1 Cr buys 8 shots

// Railgun: magnetically accelerated solid slugs (no beam), continuous fire while the trigger is held
export const RAIL = { dmg: 2, speed: 1100, life: 0.8, interval: 0.1, magazine: 1000, price: 1 };
// Missiles: need a locked pirate, home in on it on their own
export const MISSILE = { dmg: 30, speed: 150, accel: 90, maxSpeed: 260, turn: 2.8, life: 9, interval: 0.9, rack: 6, price: 90 };
// Where railgun slugs and missiles can be restocked
export const ARMS_SOLD = { slugs: ['industrie', 'hightech'], missiles: ['industrie', 'hightech'] };
// Tap on screen within this many pixels of an object to lock it
export const LOCK = { pickRadius: 56, rockRange: 700 };

export const ENEMY = { boltSpeed: 230, boltLife: 1.6, boltDmg: 7, bounty: 120, hitRadius: 4 };

// dmg: enemy laser damage, skill: added to pirate skill (aim, agility, hull),
// rate: how fast the next pirate group comes, max: pirates at once
// Pirate amount from the settings (Björn: from very few to very many), on top of the difficulty:
// rate = how often a group comes, max = cap of pirates at once, extra = chance of a bigger group
export const PIRATE_AMOUNT = {
  1: { label: 'Kaum', rate: 0.25, max: 0.5, extra: 0 },
  2: { label: 'Wenig', rate: 0.55, max: 0.75, extra: 0 },
  3: { label: 'Normal', rate: 1, max: 1, extra: 0 },
  4: { label: 'Viele', rate: 1.6, max: 1.5, extra: 0.4 },
  5: { label: 'Massen', rate: 2.4, max: 2, extra: 0.8 },
};
export const DIFFICULTY = {
  easy: { dmg: 0.6, skill: -0.25, rate: 0.6, max: 2 },
  normal: { dmg: 1, skill: 0, rate: 1, max: 4 },
  hard: { dmg: 1.4, skill: 0.25, rate: 1.4, max: 5 },
};

// Advanced settings, as multipliers (1 = as designed). Prices for goods scale
// buying and selling alike; mission rewards apply to newly posted offers.
// damage: hull damage once the shield is gone (off = an empty shield destroys the ship, as before v54).
// gameOver: destroyed without ejecting ends the game (only with damage on and from difficulty Normal up;
// off = insurance as before).
export const RULES_DEFAULT = { goods: 1, rewards: 1, bounty: 1, yard: 1, supplies: 1, startCredits: 100, damage: true, gameOver: true };

export const RADAR_RANGE = 300;
export const SAFE_RADIUS = 600;     // around stations: pirates break off, none spawn
export const PICKUP_LIFE = 75;

export const MODELS = {
  player: 'models/kestrel.glb',
  pirate: 'models/viper.glb',
  hornet: 'models/hornet.glb',
  atlas: 'models/atlas.glb',
};

// Ships the player can fly. cargo, shield, regen: base values before the yard upgrades.
// hull: points the hull takes once the shield is down (see HULL).
// flight replaces FLIGHT, seat and chase replace SEAT and CHASE, radius is for collisions.
// price: new price; buying another ship trades the old one in for TRADE_IN of its price.
// Upgrades, ammunition and fuel move over to the new ship.
export const SHIPS = [
  { id: 'kestrel', model: 'player', name: 'Kestrel', role: 'Allrounder', price: 2500, cargo: 20, shield: 100, regen: 1.5, hull: 80,
    flight: FLIGHT, seat: SEAT, chase: CHASE, radius: 2.6, sold: ['agrar', 'industrie', 'bergbau', 'hightech'],
    desc: 'Ausgewogen: ordentlicher Laderaum, wendig genug für Piraten.' },
  { id: 'hornet', model: 'hornet', name: 'Hornet', role: 'Jäger', price: 7000, cargo: 8, shield: 130, regen: 2.4, hull: 70,
    flight: { pitch: 2.0, yaw: 1.75, roll: 3.0, accel: 80, maxSpeed: 150, minSpeed: -25 }, seat: [0, 0.78, -2.1], chase: [0, 3.6, 15], radius: 2.2,
    sold: ['industrie', 'hightech'], desc: 'Schnell und sehr wendig, starker Schild, kaum Laderaum. Für Kopfgeldjäger.' },
  { id: 'atlas', model: 'atlas', name: 'Atlas', role: 'Frachter', price: 9500, cargo: 60, shield: 170, regen: 1.8, hull: 130,
    flight: { pitch: 0.95, yaw: 0.85, roll: 1.4, accel: 34, maxSpeed: 85, minSpeed: -12 }, seat: [0, 2.05, -5.3], chase: [0, 8, 32], radius: 4.2,
    sold: ['agrar', 'industrie', 'bergbau'], desc: 'Riesiger Laderaum und dicker Schild, aber träge. Für Händler.' },
];
export const TRADE_IN = 0.6;

// Hull damage once the shield is gone (game/damage.js). Wear 0 = intact, 1 = destroyed.
// The effects start at these wear levels; repair: a full repair costs this share of the ship's price.
export const HULL = {
  radar: 0.15,      // scanner flickers
  engine: 0.3,      // engine sputters
  critical: 0.65,   // steady warning tone
  repair: 0.1,
};
// Ramming a station: damage = base + perSpeed × impact speed (m/s); pierce = share that goes
// straight into the hull, past the shield (with hull damage switched on)
export const STATION_RAM = { base: 6, perSpeed: 0.3, pierce: 0.5 };

// Combat ranks (space fleet): points from kills, a named bounty pirate counts 3
export const RANKS = [
  { name: 'Kadett', at: 0 }, { name: 'Fähnrich', at: 4 }, { name: 'Leutnant', at: 10 },
  { name: 'Lt. Commander', at: 20 }, { name: 'Commander', at: 40 }, { name: 'Kapitän', at: 80 },
  { name: 'Kommodore', at: 160 }, { name: 'Konteradmiral', at: 320 }, { name: 'Admiral', at: 640 },
];
// Banned goods handed over to customs in the market: share of the base price paid as finder's fee
export const CUSTOMS_FEE = 0.25;
// From which rank (index in RANKS) the bar's job board and the back room open (Björn: 2nd and 3rd rank)
export const RANK_GATE = { jobs: 1, backroom: 2 };

// Criminal record, per system: bounty in Cr on the player's head.
// Offender below `fugitive`, Fugitive from there on (docking refused). The bounty fades
// with flight time; police come out of the stations while you are wanted.
export const LAW = {
  fugitive: 400, decay: 1, policeRange: 6000, policeEvery: 28, policeMax: [1, 3],
  hitTrader: 60, killTrader: 500, hitPolice: 40, killPolice: 900, hitStation: 15,
  traderHp: 14, policeHp: 9,
};

export const SAVE_KEY = 'asteroid-drift-save-v2';
export const OLD_SAVE_KEY = 'asteroid-drift-save-v1';
export const SETTINGS_KEY = 'asteroid-drift-settings';
export const START_CREDITS = 100;
export const INSURANCE = 150;       // deductible when the ship is lost

// sold: station economies whose shipyard offers the part (farm stations have no heavy weapons)
export const UPGRADES = [
  { id: 'hyper', name: 'Hyperantrieb', desc: 'Sprünge zu anderen Systemen, bis 7 LJ, mit vollem Tank', price: 1000, max: 3, sold: ['industrie', 'bergbau', 'hightech'],
    levels: [
      { name: 'Hyperantrieb Klasse 1', desc: 'Sprünge zu anderen Systemen, bis 7 LJ, mit vollem Tank', price: 1000 },
      { name: 'Hyperantrieb Klasse 2', desc: 'Ersetzt den eingebauten Antrieb: bis 15 LJ pro Sprung, größerer Tank, voll getankt', price: 4000, sold: ['industrie', 'hightech'] },
      { name: 'Hyperantrieb Klasse 3', desc: 'Ersetzt den eingebauten Antrieb: bis 30 LJ pro Sprung, größter Tank, voll getankt', price: 12000, sold: ['hightech'] },
    ] },
  { id: 'dock', name: 'Andockcomputer', desc: 'Übernimmt das Andocken, sobald du langsam im Anflugkorridor bist', price: 500, max: 1, sold: ['agrar', 'industrie', 'hightech'] },
  { id: 'cargo', name: 'Laderaum-Erweiterung', desc: '+10 t Frachtraum', price: 450, max: 3, sold: ['agrar', 'industrie', 'bergbau'] },
  { id: 'magazine', name: 'Munitionsmagazin', desc: '+150 Schuss Kapazität', price: 300, max: 2, sold: ['agrar', 'industrie', 'bergbau'] },
  { id: 'shield', name: 'Schildgenerator', desc: '+40 Schild, schnellere Regeneration', price: 800, max: 2, sold: ['industrie', 'hightech'] },
  { id: 'laser', name: 'Pulslaser Mk II', desc: 'Schnellere Schussfolge, doppelter Schaden', price: 1200, max: 1, sold: ['industrie', 'bergbau', 'hightech'] },
  { id: 'rail', name: 'Railgun', desc: 'Dauerfeuer mit 10 magnetisch beschleunigten Metallprojektilen pro Sekunde (1100 m/s), eigene Munition (1000 Schuss)', price: 1600, max: 1, sold: ['industrie', 'hightech'] },
  { id: 'missile', name: 'Raketenwerfer', desc: 'Aufgeschaltete Piraten werden verfolgt und zerstört (6 Raketen)', price: 2200, max: 1, sold: ['industrie'] },
  { id: 'rear', name: 'Hecklaser', desc: 'Zwillingslaser im Heck gegen Verfolger: im Blick nach hinten (Knopf „Heck“, Taste G) feuerst du damit (Laser-Munition)', price: 1400, max: 1, sold: ['industrie', 'bergbau', 'hightech'] },
  { id: 'hold', name: 'Schmuggelfach', desc: 'Abgeschirmtes Fach im Frachtraum: Zollscans finden Schmuggelware meist nicht', price: 1800, max: 1, sold: ['industrie', 'bergbau', 'hightech'], lawless: true },
  { id: 'scoop', name: 'Treibstoffsammler', desc: 'Schöpft dicht an einer Sonne Treibstoff für den Hyperantrieb', price: 1500, max: 1, sold: ['industrie', 'bergbau', 'hightech'] },
  { id: 'aim', name: 'Zielcomputer', desc: 'Richtet das Schiff auf das markierte Ziel aus', price: 900, max: 1, sold: ['industrie', 'hightech'] },
];

// Smuggling: goods with illegalBelow (economy.js) are banned in systems below that danger level.
// Approaching a station with banned cargo may trigger a customs scan (range m, time s);
// chance = chance - danger * dangerCut; the smuggling hold hides the goods with probability hide.
export const LAWLESS = 0.66;        // from this danger on (Piraten „hoch“) everything is legal
export const CUSTOMS = { range: 1500, abort: 2100, time: 5, chance: 0.85, dangerCut: 0.6, hide: 0.7, fineRate: 0.6, minFine: 120, maxFine: 350 };   // the fine alone never makes you a fugitive
export const BLACK_MARKET = { buy: 1.75, sell: 1.45 };

// Chance encounters in open space (game/encounters.js): seconds between them, distance of the spot
export const ENCOUNTER = { first: 70, every: [100, 190], dist: [2600, 4200], expire: 240, distressHp: 60, distressDps: 1.4, trap: 0.25 };

// Black holes next to some stations: mass in metres (event horizon = 2 M), pull a = pull / r² (m/s², capped),
// drift damping, cruise mass lock and the warning distance
// Every system's sun is a real place (game/sun.js): it sits `dist` metres out along the sky
// direction of the sun, radius = radius × star size. Distances below are in star radii:
// masslock drops the cruise drive, scoop = outer edge of the scooping zone (fastest at best),
// hot = the hull starts to heat up, burn = the ship burns up. scoopRate = share of the tank per
// second at the best spot. temp 1 = critical; maxTemp is reached at burn, times the star's heat.
export const SUN = {
  dist: 65000, radius: 2400, masslock: 1.75, scoop: 1.6, best: 1.1, hot: 1.45, burn: 1.03,
  scoopRate: 0.05, maxTemp: 1.35, heatUp: 0.22, coolDown: 0.3, dps: 14,
  heat: { blau: 1.25, 'weiß': 1.12, gelb: 1, orange: 0.9, rot: 0.8 },
};

export const BLACKHOLE = { M: 30, pull: 7.5e6, maxAccel: 140, drag: 0.35, masslock: 1800, warn: 650, horizonKill: 75, priceBonus: 1.22 };
