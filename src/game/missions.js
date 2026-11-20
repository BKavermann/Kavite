// Station mission boards: courier ("bring this there"), bounty ("kill that one")
// and search ("find the wreck, bring back the black box"). The bar's back room adds shady
// deliveries: stolen goods ('stolen') and a wanted criminal ('fugitive'). They pay well, but
// customs look for them like for contraband (law.js), and getting caught costs the job.
// Higher risk means more pirates and more pay. Deadlines run on flight time
// (profile.playTime), which only counts while flying, so reading menus is free.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { SYSTEMS, hopsFrom } from './galaxy.js';
import { capacity, cargoUsed, hasHyper, rankOf } from './save.js';
import { spawnEnemy } from '../entities/enemies.js';
import { inSafeZone } from '../world/station.js';
import { showBanner, toast } from '../ui/hud.js';
import { sfxAlarm, sfxScoop, sfxChime, sfxDeny } from '../core/audio.js';
import { dotTexture, pick } from '../utils.js';
import { rules } from './difficulty.js';
import { storyMarks } from './story.js';
import { LAWLESS, RANKS, RANK_GATE } from '../config.js';

export const MAX_ACTIVE = 3;
export const RISK = ['niedrig', 'mittel', 'hoch'];
const OFFER_TTL = 600;            // seconds of flight time before a board refreshes
const DETECT = 900;               // wreck shows on screen and scanner from here

const PIRATE_TAG = ['Krähe', 'Rote Elster', 'Schakal', 'Natter', 'Grauwolf', 'Eisenhand', 'Funke', 'Kobra', 'Witwe', 'Sturmvogel'];
const PIRATE_NAME = ['Morvan', 'Ilsa Kade', 'Brack', 'Varek', 'Sorn', 'Teague', 'Okoro', 'Lindqvist', 'Mara Voss', 'Dusan'];
const CARGO = [
  { t: 'Medizinische Vorräte', tons: 2, risk: 0, why: 'dringend benötigt' },
  { t: 'Ersatzteile für die Lebenserhaltung', tons: 3, risk: 0, why: 'die Station wartet darauf' },
  { t: 'Saatgutproben', tons: 1, risk: 0, why: 'empfindlich, aber harmlos' },
  { t: 'Diplomatenpost', tons: 1, risk: 1, why: 'nicht jeder will, dass sie ankommt' },
  { t: 'ein Prototyp-Triebwerk', tons: 3, risk: 1, why: 'Konkurrenten sind interessiert' },
  { t: 'verschlüsselte Datenkerne', tons: 1, risk: 2, why: 'ein Syndikat jagt sie' },
  { t: 'unverzollte Fracht', tons: 2, risk: 2, why: 'keine Fragen, aber Verfolger' },
];
const STOLEN = [
  { t: 'Kisten mit gestohlenen Medikamenten', tons: 2, why: 'aus einem Lazarettfrachter, die Nummern sind noch drauf' },
  { t: 'abgezweigte Triebwerksteile', tons: 3, why: 'eine Werft vermisst sie bereits' },
  { t: 'Schmuck aus einem Raub auf der Promenade', tons: 1, why: 'die Versicherung hat eine Belohnung ausgesetzt' },
  { t: 'Waffenteile aus einem Flottendepot', tons: 2, why: 'die Flotte sucht sie mit Nachdruck' },
  { t: 'gestohlene Datenkerne', tons: 1, why: 'jemand will sie sehr gern zurück' },
];
const FUGITIVES = [
  { who: 'Dorn Velasko', why: 'Kopf einer Fälscherbande' },
  { who: '„die Schwester“', why: 'gesucht wegen Frachtraub' },
  { who: 'Ilmo Raske', why: 'aus der Haft auf Riem entkommen' },
  { who: 'Vex Tal’Rhun', why: 'ein Spieler, der zu oft gewonnen hat' },
  { who: 'Corran Fay', why: 'Buchhalter des Kartells, sagt gegen niemanden aus' },
];
const WRECKS = ['Frachter Aurelia', 'Erzschlepper Brask-7', 'Kurierschiff Nilo', 'Rettungskapsel der Sigrun', 'Forschungssonde Ostwind', 'Shuttle Halden', 'Tanker Morgenrot'];

const objs = new Map();             // mission id -> wreck object in the current system
const v = new THREE.Vector3();
let objTemplate = null;
const navCache = new Map();

const ri = n => (Math.random() * n) | 0;
const stationName = (sys, st) => SYSTEMS[sys].stations[st].name;

/* ---------- Offers ---------- */
function makeCourier(p, here) {
  const hops = hopsFrom(here.sys);
  const dests = [];
  for (const s of SYSTEMS) {
    if (hops[s.id] > (hasHyper(p) ? 2 : 0)) continue;   // without a hyperdrive only this system
    s.stations.forEach((_, i) => { if (!(s.id === here.sys && i === here.st)) dests.push({ sys: s.id, st: i, h: hops[s.id] }); });
  }
  if (!dests.length) return null;
  const to = pick(dests);
  const c = pick(CARGO);
  const risk = Math.min(2, c.risk + (Math.random() < 0.2 ? 1 : 0));
  const reward = Math.round((90 + 170 * to.h + Math.random() * 60) * (1 + risk * 0.6) / 5) * 5;
  const where = to.sys === here.sys ? `${stationName(to.sys, to.st)} hier im System` : `${stationName(to.sys, to.st)} im System ${SYSTEMS[to.sys].name}`;
  return {
    type: 'courier', risk, reward, tons: c.tons, hops: to.h,
    deadline: (6 + 6 * to.h) * 60,
    title: `${c.t[0].toUpperCase() + c.t.slice(1)} nach ${stationName(to.sys, to.st)}`,
    desc: `${c.tons} t ${c.t}, ${c.why}. Abliefern auf ${where}.`,
    to: { sys: to.sys, st: to.st },
  };
}

function makeBounty(p, here) {
  const hops = hopsFrom(here.sys);
  const cands = SYSTEMS.filter(s => hops[s.id] <= (hasHyper(p) ? 1 : 0));
  const sys = cands.sort((a, b) => b.danger - a.danger + (Math.random() - 0.5) * 0.6)[0];
  const risk = ri(3);
  const name = `„${pick(PIRATE_TAG)}“ ${pick(PIRATE_NAME)}`;
  const reward = Math.round((450 + risk * 380 + hops[sys.id] * 120 + Math.random() * 150) / 10) * 10;
  return {
    type: 'bounty', risk, reward, tons: 0, hops: hops[sys.id],
    deadline: 22 * 60,
    title: `Kopfgeld: ${name}`,
    desc: `Pirat${risk ? ` mit ${risk} Begleiter${risk > 1 ? 'n' : ''}` : ', fliegt allein'}, zuletzt im System ${sys.name} gesehen${sys.id === here.sys ? ' – also hier' : ''}. Er findet dich, sobald du dort außerhalb der Stationszonen fliegst.`,
    target: { sys: sys.id },
    boss: { name, escorts: risk, skill: 0.55 + risk * 0.2, hp: 7 + risk * 3 },
  };
}

function makeSearch(p, here) {
  const hops = hopsFrom(here.sys);
  const cands = SYSTEMS.filter(s => hops[s.id] <= (hasHyper(p) ? 1 : 0));
  const sys = pick(cands);
  const st = sys.stations[ri(sys.stations.length)];
  // Search area 2.5–4.5 km from a station, wreck somewhere within 900 m of its centre
  const a = Math.random() * Math.PI * 2, d = 2500 + Math.random() * 2000;
  const center = [st.pos[0] + Math.cos(a) * d, st.pos[1] + (Math.random() - 0.5) * 600, st.pos[2] + Math.sin(a) * d];
  v.randomDirection().multiplyScalar(Math.random() * 900);
  const obj = [center[0] + v.x, center[1] + v.y * 0.4, center[2] + v.z];
  const wreck = pick(WRECKS);
  const risk = ri(3);
  const reward = Math.round((280 + risk * 240 + hops[sys.id] * 130 + Math.random() * 80) / 10) * 10;
  const trap = ['', ' Funkverkehr deutet auf Plünderer hin.', ' Das Wrack könnte eine Falle sein.'][risk];
  return {
    type: 'search', risk, reward, tons: 0, hops: hops[sys.id],
    deadline: (12 + 7 * hops[sys.id]) * 60,
    title: `Vermisst: ${wreck}`,
    desc: `Blackbox bergen. Letztes Signal ${(d / 1000).toFixed(1).replace('.', ',')} km von ${st.name} (System ${sys.name}). Zurückbringen hierher.${trap}`,
    search: { sys: sys.id, center, obj, wreck },
  };
}

// Back room: a fence wants goods moved, someone needs to vanish. Destinations within two jumps.
function shadyDest(p, here) {
  const hops = hopsFrom(here.sys), dests = [];
  for (const s of SYSTEMS) {
    if (hops[s.id] > (hasHyper(p) ? 2 : 0)) continue;
    s.stations.forEach((_, i) => { if (!(s.id === here.sys && i === here.st)) dests.push({ sys: s.id, st: i, h: hops[s.id] }); });
  }
  return dests.length ? pick(dests) : null;
}
function makeStolen(p, here) {
  const to = shadyDest(p, here);
  if (!to) return null;
  const c = pick(STOLEN), risk = 1 + ri(2);
  const reward = Math.round((260 + 260 * to.h + c.tons * 60 + Math.random() * 80) * (1 + risk * 0.4) / 5) * 5;
  return {
    type: 'stolen', risk, reward, tons: c.tons, hops: to.h, deadline: (6 + 6 * to.h) * 60,
    title: `Hehlerware nach ${stationName(to.sys, to.st)}`,
    desc: `${c.tons} t ${c.t}, ${c.why}. Ein Hehler auf ${stationName(to.sys, to.st)} (System ${SYSTEMS[to.sys].name}) wartet. Findet der Zoll sie, ist die Ware weg und du wirst gesucht.`,
    to: { sys: to.sys, st: to.st },
  };
}
function makeFugitive(p, here) {
  const to = shadyDest(p, here);
  if (!to) return null;
  const f = pick(FUGITIVES), risk = 2;
  const reward = Math.round((480 + 320 * to.h + Math.random() * 120) / 5) * 5;
  return {
    type: 'fugitive', risk, reward, tons: 1, hops: to.h, deadline: (5 + 5 * to.h) * 60,
    title: `Passagier ohne Namen: ${f.who}`,
    desc: `${f.who}, ${f.why}, muss nach ${stationName(to.sys, to.st)} (System ${SYSTEMS[to.sys].name}). Reist versteckt im Frachtraum (1 t). Kopfgeldjäger sind unterwegs, und findet der Zoll den Passagier, folgt die Verhaftung und du giltst als Fluchthelfer.`,
    to: { sys: to.sys, st: to.st }, who: f.who,
  };
}

// The back room's own board, refreshed like the bar's
// The bar's job board and the back room open with rank
export const jobsOpen = (p = G.profile) => rankOf(p).index >= RANK_GATE.jobs;
export const backroomOpen = (p = G.profile) => rankOf(p).index >= RANK_GATE.backroom;
// Loot: weapons and narcotics only drop for pilots who may enter the back room to sell them
export const lootable = ids => backroomOpen() ? ids : ids.filter(id => id !== 'weapons' && id !== 'narcotics');

export function backroomOffersFor(sysId, stIdx) {
  const p = G.profile;
  p.offers ||= {};
  const key = 'b' + sysId + ':' + stIdx;
  const cur = p.offers[key];
  if (cur && p.playTime - cur.t < OFFER_TTL) return cur.list;
  const here = { sys: sysId, st: stIdx }, list = [];
  for (let i = 0, n = 2 + ri(2); i < n; i++) {
    const o = Math.random() < 0.6 ? makeStolen(p, here) : makeFugitive(p, here);
    if (!o) continue;
    o.reward = Math.max(5, Math.round(o.reward * rules().rewards / 5) * 5);
    o.id = 'o' + (p.missionSeq = (p.missionSeq || 0) + 1);
    o.from = { sys: sysId, st: stIdx };
    o.board = key;
    list.push(o);
  }
  p.offers[key] = { t: p.playTime, list };
  return list;
}

// Deliveries that end at a station: courier jobs and the shady ones
const DELIVERY = ['courier', 'stolen', 'fugitive'];
const isDelivery = m => DELIVERY.includes(m.type);
// Shady jobs aboard that customs would find (none count in lawless systems)
export function hotMissions(p = G.profile, sys = G.system) {
  if (!p || (sys?.danger || 0) >= LAWLESS) return [];
  return p.missions.filter(m => m.type === 'stolen' || m.type === 'fugitive');
}
// Customs found them: the goods are seized and the passenger arrested at the next docking here
export function markCaught(sysId) { for (const m of hotMissions()) m.caught = sysId; }
export function seizeCaught(sysId) {
  const out = [];
  let tons = 0;
  for (const m of [...G.profile.missions]) {
    if (m.caught !== sysId) continue;
    if (m.type === 'fugitive') out.push(`Polizei verhaftet ${m.who}`);
    else tons += m.tons;
    removeMission(m);
  }
  if (tons) out.unshift(`Zoll beschlagnahmt ${tons} t Hehlerware`);
  return out;
}

export function offersFor(sysId, stIdx) {
  const p = G.profile;
  p.offers ||= {};
  const key = sysId + ':' + stIdx;
  const cur = p.offers[key];
  if (cur && p.playTime - cur.t < OFFER_TTL) return cur.list;
  const here = { sys: sysId, st: stIdx };
  const list = [];
  const n = 3 + ri(3);
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    const o = r < 0.45 ? makeCourier(p, here) : r < 0.7 ? makeBounty(p, here) : makeSearch(p, here);
    if (!o) continue;
    o.reward = Math.max(5, Math.round(o.reward * rules().rewards / 5) * 5);
    o.id = 'o' + (p.missionSeq = (p.missionSeq || 0) + 1);
    o.from = { sys: sysId, st: stIdx };
    list.push(o);
  }
  p.offers[key] = { t: p.playTime, list };
  return list;
}

// Why an offer can't be taken right now, or '' if it can
export function blockReason(o) {
  const p = G.profile;
  const gate = o.board?.[0] === 'b' ? RANK_GATE.backroom : RANK_GATE.jobs;
  if (rankOf(p).index < gate) return `Erst ab Rang ${RANKS[gate].name}`;
  if (p.missions.length >= MAX_ACTIVE) return `Höchstens ${MAX_ACTIVE} Aufträge gleichzeitig`;
  if (o.hops && !hasHyper(p)) return 'Braucht einen Hyperantrieb';
  if (o.tons && capacity(p) - cargoUsed(p) < o.tons) return `Braucht ${o.tons} t freien Frachtraum`;
  return '';
}

export function accept(o) {
  const p = G.profile;
  if (blockReason(o)) return false;
  const m = { ...o, due: p.playTime + o.deadline, spawned: false, collected: false, guards: false, sysT: 0,
    delay: 15 + Math.random() * 20 };
  p.missions.push(m);
  const board = p.offers[o.board || o.from.sys + ':' + o.from.st];
  if (board) board.list = board.list.filter(x => x.id !== o.id);
  if (m.type === 'search' && m.search.sys === G.systemId) ensureObj(m);
  return true;
}

export function abandon(id) {
  const p = G.profile;
  const m = p.missions.find(x => x.id === id);
  if (!m) return;
  removeMission(m);
}

function removeMission(m) {
  const p = G.profile;
  p.missions = p.missions.filter(x => x !== m);
  dropObj(m.id);
  for (const e of G.enemies) if (e.missionId === m.id) e.missionId = null;
}

function fail(m, why) {
  removeMission(m);
  toast(`Auftrag gescheitert: ${why}`);
  sfxDeny();
}

function pay(m, msg) {
  G.profile.credits += m.reward;
  removeMission(m);
  return `${msg} · +${m.reward} Cr`;
}

/* ---------- Hooks from the rest of the game ---------- */
export function missionsOnEnterSystem() {
  for (const id of [...objs.keys()]) dropObj(id);
  const p = G.profile;
  if (!p) return;
  for (const m of p.missions) {
    m.spawned = false; m.sysT = 0; m.guards = false;
    if (m.type === 'search' && !m.collected && m.search.sys === G.systemId) ensureObj(m);
  }
}

export function missionsOnDeath() {
  const p = G.profile;
  for (const m of [...p.missions]) {
    if (m.type === 'courier' || m.type === 'stolen') fail(m, 'Fracht beim Abschuss verloren');
    else if (m.type === 'fugitive') fail(m, `${m.who} hat den Abschuss nicht überlebt`);
    else if (m.type === 'search' && m.collected) fail(m, 'Blackbox beim Abschuss verloren');
    else m.spawned = false;
  }
}

// Returns messages for the station screen
export function missionsOnDocked(sys, st) {
  const p = G.profile, msgs = [];
  for (const m of [...p.missions]) {
    if (isDelivery(m) && m.to.sys === sys && m.to.st === st) {
      msgs.push(pay(m, m.type === 'stolen' ? 'Der Hehler nimmt die Ware' : m.type === 'fugitive' ? `${m.who} verschwindet in der Menge` : 'Lieferung angekommen'));
      sfxChime();
    }
    if (m.type === 'search' && m.collected && m.from.sys === sys && m.from.st === st) { msgs.push(pay(m, `Blackbox der ${m.search.wreck} abgegeben`)); sfxChime(); }
  }
  return msgs;
}

export function onBossKilled(id) {
  const p = G.profile;
  const m = p.missions.find(x => x.id === id);
  if (!m) return;
  p.credits += m.reward;
  removeMission(m);
  showBanner('ZIEL ELIMINIERT', 2);
  toast(`Kopfgeld ${m.boss.name}: +${m.reward} Cr`);
}

// Courier cargo being chased raises the pirate rate (used by the director)
export function chaseFactor() {
  const p = G.profile;
  if (!p) return 0;
  return p.missions.reduce((s, m) => s + (isDelivery(m) ? m.risk * 0.5 : 0), 0);
}

/* ---------- Per-frame ---------- */
export function updateMissions(dt) {
  const p = G.profile;
  if (!p) return;
  if (G.mode === 'flight' || G.mode === 'docking' || G.mode === 'hyper') p.playTime += dt;
  for (const m of [...p.missions]) if (p.playTime > m.due) fail(m, `${m.title} – Frist abgelaufen`);

  for (const [id, o] of objs) {
    o.pos.fromArray(o.sys).sub(G.origin);
    o.mesh.position.copy(o.pos);
    o.mesh.rotation.y += dt * 0.4;
    o.mesh.rotation.x += dt * 0.15;
    o.light.material.opacity = Math.sin(G.time * 5) > 0 ? 1 : 0.15;
  }
  if (G.mode !== 'flight') return;
  const ship = G.ship.position;
  for (const m of [...p.missions]) {
    if (m.type === 'bounty' && m.target.sys === G.systemId && !m.spawned && !inSafeZone(ship)) {
      m.sysT += dt;
      if (m.sysT > m.delay) spawnBoss(m);
    }
    if (m.type === 'search' && !m.collected && m.search.sys === G.systemId) {
      const o = objs.get(m.id);
      if (!o) continue;
      const d = o.pos.distanceTo(ship);
      if (m.risk > 0 && !m.guards && d < 1500) {
        m.guards = true;
        const n = m.risk + (m.risk === 2 ? 1 : 0);
        for (let i = 0; i < n; i++) spawnEnemy(v.randomDirection().multiplyScalar(60 + Math.random() * 60).add(o.pos), 0.35 + m.risk * 0.2);
        showBanner('HINTERHALT');
        sfxAlarm();
      }
      if (d < 7) {
        if (capacity(p) - cargoUsed(p) < 1) { if (!o.warned) { toast('Frachtraum voll – 1 t für die Blackbox nötig'); o.warned = true; } continue; }
        m.collected = true;
        dropObj(m.id);
        sfxScoop();
        toast(`Blackbox geborgen – zurück nach ${stationName(m.from.sys, m.from.st)}`);
      }
    }
  }
}

function spawnBoss(m) {
  m.spawned = true;
  const center = v.randomDirection().multiplyScalar(650).add(G.ship.position).clone();
  const boss = spawnEnemy(center, m.boss.skill, { name: m.boss.name, hp: m.boss.hp, missionId: m.id });
  boss.turn += 0.2;
  for (let i = 0; i < m.boss.escorts; i++) spawnEnemy(v.randomDirection().multiplyScalar(25 + i * 15).add(center), 0.4 + m.risk * 0.15);
  showBanner('KOPFGELDZIEL GEORTET');
  toast(m.boss.name);
  sfxAlarm();
}

/* ---------- Wreck objects ---------- */
function makeObjTemplate() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xd06a2c, metalness: 0.4, roughness: 0.5 });
  const band = new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: 0.3, roughness: 0.4 });
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 3.2, 4, 10), body);
  cap.rotation.z = Math.PI / 2;
  g.add(cap);
  for (const x of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.4, 12), band);
    b.rotation.z = Math.PI / 2;
    b.position.x = x;
    g.add(b);
  }
  // debris plates around it
  const plate = new THREE.MeshStandardMaterial({ color: 0x5b6169, metalness: 0.6, roughness: 0.5, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 3, 0.2, 1 + Math.random() * 2), plate);
    d.position.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 16);
    d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    g.add(d);
  }
  return g;
}

function ensureObj(m) {
  if (objs.has(m.id)) return;
  if (!objTemplate) objTemplate = makeObjTemplate();
  const mesh = objTemplate.clone();
  const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(2.2, 1.2, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  light.scale.setScalar(4);
  light.position.y = 1.6;
  mesh.add(light);
  G.scene.add(mesh);
  objs.set(m.id, { mesh, light, sys: m.search.obj, pos: new THREE.Vector3().fromArray(m.search.obj).sub(G.origin), name: m.search.wreck });
}

function dropObj(id) {
  const o = objs.get(id);
  if (!o) return;
  G.scene.remove(o.mesh);
  o.light.material.dispose();
  objs.delete(id);
}

// Wrecks close enough to show on screen and scanner
export function visibleWrecks() {
  const out = [];
  for (const o of objs.values()) if (o.pos.distanceTo(G.ship.position) < DETECT) out.push(o);
  return out.concat(storyMarks());
}

/* ---------- Navigation helpers ---------- */
// Extra nav points in this system: search areas (or the wreck once it is in range)
export function missionNavPoints() {
  const p = G.profile, out = [];
  if (!p) return out;
  for (const m of p.missions) {
    if (m.type !== 'search' || m.collected || m.search.sys !== G.systemId) continue;
    let n = navCache.get(m.id);
    if (!n) { n = { kind: 'mission', hex: '#ffd34d', r: 0, pos: new THREE.Vector3(), name: '' }; navCache.set(m.id, n); }
    const o = objs.get(m.id);
    if (o && o.pos.distanceTo(G.ship.position) < DETECT) { n.pos.copy(o.pos); n.name = o.name; }
    else { n.pos.fromArray(m.search.center).sub(G.origin); n.name = `Suchgebiet ${m.search.wreck}`; }
    out.push(n);
  }
  return out;
}

export function stationHasMission(sys, st) {
  const p = G.profile;
  if (!p) return false;
  return p.missions.some(m => (isDelivery(m) && m.to.sys === sys && m.to.st === st) ||
    (m.type === 'search' && m.collected && m.from.sys === sys && m.from.st === st));
}

// System ids the star map should flag
export function missionSystems() {
  const p = G.profile, set = new Set();
  if (!p) return set;
  for (const m of p.missions) {
    if (isDelivery(m)) set.add(m.to.sys);
    else if (m.type === 'bounty') set.add(m.target.sys);
    else set.add(m.collected ? m.from.sys : m.search.sys);
  }
  return set;
}

export function missionGoal(m) {
  if (isDelivery(m)) return `${stationName(m.to.sys, m.to.st)} · ${SYSTEMS[m.to.sys].name}`;
  if (m.type === 'bounty') return `System ${SYSTEMS[m.target.sys].name}`;
  return m.collected ? `${stationName(m.from.sys, m.from.st)} · ${SYSTEMS[m.from.sys].name}` : `System ${SYSTEMS[m.search.sys].name}`;
}

export const TYPE_LABEL = { courier: 'Kurier', bounty: 'Kopfgeld', search: 'Suche', stolen: 'Hehlerware', fugitive: 'Fluchthilfe' };
