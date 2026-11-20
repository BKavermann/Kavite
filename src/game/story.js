// The story "Kavite": six chapters and an epilogue on top of the free game.
// Jona Brekk, the player's old flight teacher, found a vein of Kavite crystals at the
// black hole of Desox and was taken by the Schwarzglas cartel. The player follows his
// trail, frees him and finally decides who gets the vein: the space fleet or the cartel.
//
// Each step is one of
//   dock   – dock at a station (optionally with goods on board, which are handed over)
//   fight  – named cartel ships attack in a system once you are outside the station zones
//   find   – fly to a spot near a station (wreck or prisoner transport), maybe guarded
//   choice – pick a side in the bar
//   end    – the story is over, free play goes on
// Progress lives in profile.story; texts land in the bar (log) and come by radio in flight.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { SYSTEMS } from './galaxy.js';
import { hasHyper, saveProfile } from './save.js';
import { navTargets } from './nav.js';
import { spawnEnemy, removeEnemy, KARTELL, addScore } from '../entities/enemies.js';
import { haulerModel } from '../world/traffic.js';
import { inSafeZone } from '../world/station.js';
import { emit } from '../world/particles.js';
import { comms, showBanner, toast } from '../ui/hud.js';
import { sfxAlarm, sfxChime, sfxHyper } from '../core/audio.js';
import { dotTexture } from '../utils.js';
import { wreckModel } from './encounters.js';

export const CHAPTERS = ['', 'Die Nachricht', 'Der Datenkern', 'Am Rand des Lochs', 'Das Hinterzimmer', 'Befreiung', 'Die Entscheidung', 'Epilog'];
const LAST = 6;

const VENN = 'Orlo Venn, „der Graf“';
const stName = (sys, st) => SYSTEMS[sys].stations[st].name;
const at = (sys, st) => `${stName(sys, st)} (System ${SYSTEMS[sys].name})`;
const hyperHint = () => (hasHyper(G.profile) ? '' : ' Dafür brauchst du einen Hyperantrieb aus einer Werft (1000 Cr).');

export const STEPS = {
  c1a: {
    ch: 1, type: 'dock', sys: 0, st: 1, next: 'c1b',
    goal: () => `Brekks Schließfach in der ${at(0, 1)} öffnen`,
    log: [['Jona Brekk (Aufzeichnung)', 'Pilot, wenn du das hörst, bin ich seit drei Tagen überfällig. Ich hab dir das Fliegen beigebracht, jetzt brauch ich deine Hilfe. In der Ferrum-Werft hier im Kessel-System liegt ein Schließfach auf meinen Namen. Hol, was drin ist, und zeig es niemandem.']],
    done: {
      credits: 400,
      log: [['Schließfach', 'Darin liegen 400 Cr, ein versiegelter Datenkern und ein fingerlanger Kristall, der von innen blau leuchtet. Auf einem Zettel steht nur ein Wort: Kavite.'],
        ['Hafenmeisterin Ada Rusk', 'Zwei Leute in schwarzen Vipern haben gestern nach Brekk gefragt. Gold auf dem Rumpf, das Zeichen des Schwarzglas-Kartells. Pass auf, wenn du ablegst.']],
    },
  },
  c1b: {
    ch: 1, type: 'fight', sys: 0, delay: 6, next: 'c2a',
    goal: () => 'Die Kartellschiffe abwehren, sobald du die Ferrum-Werft verlässt',
    group: [{ name: 'Schwarzglas-Schläger', skill: 0.15 }, { skill: 0.1 }],
    radio: ['Unbekannt', 'Den Kristall, Pilot. Dann darfst du weiterfliegen.'],
    done: { log: [['Bordcomputer', 'Beide Angreifer flogen für das Schwarzglas-Kartell. Brekks Datenkern ist verschlüsselt. Eine Hightech-Station könnte ihn knacken, etwa der Vopha-Kern im Nachbarsystem Vopha.']] },
  },
  c2a: {
    ch: 2, type: 'dock', sys: 4, st: 0, next: 'c3a',
    goal: () => `Den Datenkern im ${at(4, 0)} entschlüsseln lassen.${hyperHint()}`,
    done: {
      log: [['Dr. Neela Osk, Vopha-Kern', 'Brekks Verschlüsselung ist gut, meine ist besser. Letzter Eintrag: Er hat am schwarzen Loch bei der Desox-Mine eine Kavite-Ader gefunden. Kavite wächst nur dort, wo kein Licht mehr entkommt, und ein Splitter wie Ihrer treibt einen Hyperantrieb ein ganzes Jahr. Sein letztes Notsignal kam aus Desox, zwei Sprünge von hier. Halten Sie Abstand vom Loch, es zieht.']],
    },
  },
  c3a: {
    ch: 3, type: 'find', sys: 14, st: 0, what: 'wreck', name: 'Wrack der Lerche', reach: 45, next: 'c3b',
    goal: () => `Brekks Schiff, die Lerche, bei der ${at(14, 0)} finden`,
    found: ['Bordcomputer', 'Schwaches Notsignal der Lerche. Ziel ▸ gesetzt.'],
    done: { log: [['Bordcomputer', 'Die Lerche ist leer, die Rettungskapsel fehlt. Letzter Logbucheintrag: „Kartell hat mich. Sie bringen mich zu Kroll.“']] },
  },
  c3b: {
    ch: 3, type: 'fight', sys: 14, delay: 2.5, near: true, next: 'c4a',
    goal: () => 'Venn und seine Begleiter vertreiben',
    group: [{ name: VENN, hp: 16, skill: 0.5, flee: 6 }, { skill: 0.3 }, { skill: 0.25 }],
    radio: ['Orlo Venn', 'Sie sind also Brekks Schüler. Frau Kroll hätte ihren Kristall gern zurück.'],
    flee: ['Orlo Venn', 'Für heute reicht es. Wir sehen uns, Pilot.'],
    done: { log: [['Bordcomputer', 'Venns Sprungspur führt nach Riem. Im Hinterzimmer der Riem-Schmiede sitzt einer, der für das Kartell arbeitet und trotzdem mit jedem redet.']] },
  },
  c4a: {
    ch: 4, type: 'dock', sys: 12, st: 0, next: 'c5a', need: { id: 'computers', t: 3 },
    goal: s => `Den Informanten „Ruß“ in der ${at(12, 0)} treffen${s.asked ? ', mit 3 t Computern an Bord' : ''}`,
    asked: ['Ruß', 'Information kostet. Bring mir 3 t Computer, dann reden wir. Die Hightech-Stationen in Vopha haben welche.'],
    done: {
      log: [['Ruß', 'Gute Ware. Also: Kroll hält Brekk auf einem Gefangenentransport fest. Der wartet im Asteroidenfeld bei der Phator-Grube, bis Brekk verrät, wo die Ader liegt. Drei Wachschiffe. Und Pilot: Du warst nie hier.']],
    },
  },
  c5a: {
    ch: 5, type: 'find', sys: 1, st: 0, what: 'transport', name: 'Gefangenentransport', reach: 70, hold: 2.5, next: 'c5b',
    goal: () => `Brekk vom Gefangenentransport bei der ${at(1, 0)} befreien`,
    found: ['Bordcomputer', 'Kartell-Transponder geortet. Ziel ▸ gesetzt.'],
    guards: [{ skill: 0.4 }, { skill: 0.35 }, { skill: 0.3 }],
    guardRadio: ['Kartell-Wache', 'Unbekanntes Schiff, drehen Sie ab, oder wir schießen!'],
    done: { log: [['Jona Brekk', 'Wurde auch Zeit, Pilot! Ich steig bei dir um. Bring mich zum Kessel-Ring, da wartet jemand von der Raumflotte auf mich.']] },
  },
  c5b: {
    ch: 5, type: 'dock', sys: 0, st: 0, next: 'c6',
    goal: () => `Brekk zum ${at(0, 0)} bringen`,
    done: {
      credits: 800,
      log: [['Jona Brekk', 'Danke, Pilot. Hier sind 800 Cr, mehr hab ich gerade nicht. Und das ist Kommandantin Telmar.'],
        ['Kommandantin Aris Telmar, Raumflotte', 'Mit Brekks Koordinaten kann die Flotte die Kavite-Ader schützen und das Kartell zerschlagen. Kroll wird angreifen, sobald sie davon hört. Ich brauche einen Piloten, der sie abfängt. Die Flotte zahlt 2500 Cr.'],
        ['Vesna Kroll (verschlüsselt)', 'Zehntausend Credits für eine Kopie von Brekks Koordinaten. Bringen Sie sie zur Riem-Schmiede. Brekk muss nie davon erfahren.']],
    },
  },
  c6: {
    ch: 6, type: 'choice',
    goal: () => 'Entscheide dich in der Bar: Raumflotte oder Kartell',
    options: [
      { label: 'Mit der Raumflotte', desc: 'Kroll am schwarzen Loch von Desox abfangen. 2500 Cr.', next: 'c6f' },
      { label: 'Mit dem Kartell', desc: 'Die Koordinaten zur Riem-Schmiede bringen. 10 000 Cr, aber die Flotte vergisst das nicht.', next: 'c6k' },
    ],
  },
  c6f: {
    ch: 6, type: 'fight', sys: 14, delay: 4, next: 'endF',
    goal: () => `Vesna Kroll bei der ${at(14, 0)} abfangen`,
    log: [['Kommandantin Telmar', 'Kroll sammelt ihre Schiffe bei Desox. Die Flotte sichert die Ader, Sie fangen Kroll ab, bevor sie dort ankommt. Viel Glück.']],
    group: [{ name: 'Vesna Kroll', hp: 30, skill: 0.7, scale: 1.7 }, { name: VENN, hp: 14, skill: 0.55 }, { skill: 0.4 }, { skill: 0.35 }],
    radio: ['Vesna Kroll', 'Brekks kleiner Held. Die Ader gehört mir, und Sie gehören gleich dem Loch.'],
    done: {
      credits: 2500, score: 10,
      log: [['Kommandantin Telmar', 'Kroll ist erledigt, das Kartell zerfällt. Die Ader steht jetzt unter dem Schutz der Flotte. Gut geflogen, Pilot. 2500 Cr sind überwiesen.']],
    },
  },
  c6k: {
    ch: 6, type: 'dock', sys: 12, st: 0, next: 'endK',
    goal: () => `Die Koordinaten zur ${at(12, 0)} bringen`,
    log: [['Vesna Kroll', 'Riem-Schmiede, Hinterzimmer. Kommen Sie allein.']],
    done: {
      credits: 10000, wanted: { sys: 0, cr: 450 },
      log: [['Vesna Kroll', 'Zehntausend, wie versprochen. Ein Vergnügen, mit Ihnen Geschäfte zu machen.'],
        ['Kommandantin Telmar', 'Wir wissen, was Sie getan haben. Im Kessel-System sind Sie zur Fahndung ausgeschrieben.'],
        ['Jona Brekk', 'Ich hab dir das Fliegen beigebracht. Das hier nicht.']],
    },
  },
  endF: {
    ch: 7, type: 'end',
    log: [['Epilog', 'Die Kavite-Ader am Rand des Lochs steht unter dem Schutz der Flotte. Brekk fliegt ein neues Schiff und erzählt in jeder Bar, wer ihn rausgeholt hat. Die Galaxie ist groß, Pilot. Sie gehört dir.']],
  },
  endK: {
    ch: 7, type: 'end',
    log: [['Epilog', 'Das Kartell baut am Rand des Lochs ab, und du bist reich. Im Kessel-System sucht man dich, und Brekk spricht nicht mehr mit dir. Die Galaxie ist groß, Pilot. Irgendwo vergisst man schneller.']],
  },
};

const v = new THREE.Vector3();
let obj = null;          // wreck or transport in the current system
let lastSys = -1;

const S = () => G.profile?.story;
export const storyStep = () => (S() ? STEPS[S().id] : null);
export const storyDone = () => storyStep()?.type === 'end';

// What to do next, as one line (bar, pause screen, radio)
export function storyGoal() {
  const s = S(), st = storyStep();
  return st && st.goal ? st.goal(s) : '';
}

// Begins the story for new and old save games alike (on the first docking)
function begin(p) {
  p.story = { id: null, log: [], unread: true };
  enter('c1a');
}

function addLog(list, ch) {
  const s = S();
  for (const [from, text] of list || []) s.log.push({ ch, from, text });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
  if (list?.length) s.unread = true;
}

function enter(id) {
  const s = S(), st = STEPS[id];
  s.id = id;
  s.t = 0; s.spawned = false; s.got = false; s.hold = 0; s.asked = false; s.obj = null; s.guards = false;
  addLog(st.log, st.ch);
}

// Finishes the current step: rewards, texts, next step. inFlight shows the texts by radio.
function complete(inFlight) {
  const p = G.profile, s = p.story, st = STEPS[s.id], d = st.done || {};
  if (d.credits) p.credits += d.credits;
  if (d.score) addScore(d.score);
  if (d.wanted) p.wanted[d.wanted.sys] = Math.max(p.wanted[d.wanted.sys] || 0, d.wanted.cr);
  if (st.need) { p.cargo[st.need.id] -= st.need.t; if (p.cargo[st.need.id] <= 0) delete p.cargo[st.need.id]; }
  addLog(d.log, STEPS[st.next].ch);   // what you learn at the end of a chapter leads into the next one
  dropObj();
  enter(st.next);
  const nx = STEPS[st.next];
  if (inFlight) {
    const last = d.log?.[d.log.length - 1];
    if (last) comms(last[0], last[1], 14);
    if (nx.type === 'end') showBanner('GESCHICHTE ABGESCHLOSSEN', 3.5);
    else if (nx.ch !== st.ch) showBanner(`KAPITEL ${nx.ch}: ${CHAPTERS[nx.ch].toUpperCase()}`, 3);
    else if (nx.log) comms(nx.log[0][0], nx.log[0][1], 12);
    if (d.credits) toast(`+${d.credits} Cr`);
    sfxChime();
  }
  saveProfile(p);
}

/* ---------- Hooks ---------- */
// Docking: starts the story, finishes dock steps. Returns notes for the station screen.
export function storyOnDocked(sys, st) {
  const p = G.profile, msgs = [];
  if (!p) return msgs;
  if (!p.story) { begin(p); msgs.push('Eine Nachricht von Jona Brekk wartet in der Bar'); }
  const step = storyStep();
  if (step?.type === 'dock' && step.sys === sys && step.st === st) {
    const n = step.need;
    if (n && (p.cargo[n.id] || 0) < n.t) {
      if (!p.story.asked) { p.story.asked = true; addLog([step.asked], step.ch); }
      msgs.push(`${step.asked[0]} wartet in der Bar`);
    } else {
      complete(false);
      msgs.push(STEPS[p.story.id].type === 'end' ? 'Geschichte abgeschlossen · Epilog in der Bar' : `Geschichte · Kapitel ${STEPS[p.story.id].ch}: ${CHAPTERS[STEPS[p.story.id].ch]}`);
      if (step.done?.credits) msgs.push(`+${step.done.credits} Cr`);
    }
  }
  return msgs;
}

export function storyChoose(i) {
  const step = storyStep();
  if (step?.type !== 'choice' || !step.options[i]) return false;
  addLog([['Du', step.options[i].label]], step.ch);
  enter(step.options[i].next);
  S().unread = true;
  saveProfile(G.profile);
  return true;
}

export function storyOnEnterSystem() {
  dropObj();
  const s = S();
  if (s) { s.spawned = false; s.guards = false; s.t = 0; s.hold = 0; }
  lastSys = -1;
}

export function storyOnDeath() {
  const s = S();
  if (s) { s.spawned = false; s.guards = false; s.t = 0; s.hold = 0; }
}

// A story ship with an escape plan was shot down anyway
export function storyOnKill(e) {
  if (e.flee) comms('Bordcomputer', `${e.name} hat sich in einer Rettungskapsel abgesetzt.`, 6);
}

/* ---------- Per frame ---------- */
export function updateStory(dt) {
  const p = G.profile, s = p?.story, step = storyStep();
  if (!s || !step || (G.mode !== 'flight' && G.mode !== 'docking')) return;
  // Arriving in the system of the current goal: a reminder by radio
  if (G.systemId !== lastSys) {
    lastSys = G.systemId;
    if (step.sys === G.systemId && step.type !== 'find' && G.mode === 'flight') comms('Geschichte', storyGoal(), 9);
  }
  if (step.sys !== G.systemId) return;
  if (step.type === 'fight') updateFight(dt, s, step);
  else if (step.type === 'find') updateFind(dt, s, step);
}

const storyShips = () => G.enemies.filter(e => e.story);

function spawnGroup(list, center) {
  return list.map((g, i) => {
    const e = spawnEnemy(v.randomDirection().multiplyScalar(i ? 30 + i * 18 : 0).add(center), g.skill, {
      name: g.name, hp: g.hp, paint: KARTELL, story: true,
    });
    if (g.flee) e.flee = g.flee;
    if (g.scale) e.body.scale.setScalar(g.scale);
    return e;
  });
}

function updateFight(dt, s, step) {
  if (G.mode !== 'flight') return;
  if (!s.spawned) {
    if (inSafeZone(G.ship.position)) return;
    if ((s.t += dt) < step.delay) return;
    s.spawned = true;
    const center = v.randomDirection().multiplyScalar(step.near ? 380 : 600).add(G.ship.position).clone();
    const ships = spawnGroup(step.group, center);
    G.lock = { kind: 'enemy', obj: ships[0] };
    if (step.radio) comms(step.radio[0], step.radio[1], 9);
    showBanner(step.ch === LAST ? 'KROLL GREIFT AN' : 'KARTELL', 2);
    sfxAlarm();
    return;
  }
  // Ships that give up jump away
  for (const e of storyShips()) {
    if (!e.flee || e.hp > e.flee) continue;
    emit(e.pos, 90, 30, 0.6);
    sfxHyper();
    removeEnemy(e);
    if (step.flee) comms(step.flee[0], step.flee[1], 7);
    toast(`${e.name} springt in den Hyperraum`);
  }
  if (!storyShips().length) complete(true);
}

function updateFind(dt, s, step) {
  ensureObj(s, step);
  if (!obj) return;
  obj.pos.fromArray(s.obj).sub(G.origin);
  obj.mesh.position.copy(obj.pos);
  obj.mesh.rotation.x += obj.spin * dt;
  obj.mesh.rotation.y += obj.spin * 0.7 * dt;
  const d = obj.pos.distanceTo(G.ship.position);
  obj.halo.position.copy(obj.pos);
  obj.halo.scale.setScalar(Math.max(20, d * 0.03));
  obj.halo.material.opacity = Math.min(1, Math.max(0, (d - 300) / 600)) * (0.55 + 0.45 * Math.sin(G.time * 4));
  if (G.mode !== 'flight') return;
  if (step.guards && !s.guards && d < 1800) {
    s.guards = true;
    spawnGroup(step.guards, v.randomDirection().multiplyScalar(90).add(obj.pos).clone());
    if (step.guardRadio) comms(step.guardRadio[0], step.guardRadio[1], 7);
    showBanner('KONTAKT');
    sfxAlarm();
  }
  if (d > step.reach) { s.hold = 0; return; }
  if (!step.hold) { complete(true); return; }
  if (storyShips().length) { if (!obj.warned) { toast('Erst die Wachen ausschalten'); obj.warned = true; } return; }
  if (Math.abs(G.player.speed) > 30 || G.player.cruise) { if (s.hold > 0) toast('Andocken unterbrochen: langsamer fliegen'); s.hold = 0; return; }
  if (s.hold === 0) toast('Schleusen koppeln …');
  if ((s.hold += dt) >= step.hold) complete(true);
}

/* ---------- The wreck or transport ---------- */
// Lies 3.2 km from the station, on the side away from its black hole
function placeObj(s, step) {
  const st = G.stations[step.st];
  if (!st) return;
  const hole = G.holes.find(h => h.st === st);
  if (hole) v.subVectors(st.sysPos, hole.sysPos).setY(0).normalize();
  else v.set(Math.cos(step.sys * 2.1), 0, Math.sin(step.sys * 2.1));
  v.multiplyScalar(3200).add(st.sysPos);
  v.y += 180;
  s.obj = v.toArray();
}

function ensureObj(s, step) {
  if (obj || s.got) return;
  if (!s.obj) placeObj(s, step);
  if (!s.obj) return;
  const mesh = step.what === 'wreck' ? wreckModel() : haulerModel();
  mesh.rotation.set(0.4, 1.2, step.what === 'wreck' ? 0.9 : 0);
  G.scene.add(mesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color('#ffd34d').multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true }));
  G.scene.add(halo);
  obj = { mesh, halo, pos: new THREE.Vector3().fromArray(s.obj).sub(G.origin), spin: step.what === 'wreck' ? 0.12 : 0, name: step.name,
    nav: { kind: 'story', name: step.name, hex: '#ffd34d', r: 0, pos: null } };
  obj.nav.pos = obj.pos;
  mesh.position.copy(obj.pos);
  const i = navTargets().indexOf(obj.nav);
  if (i >= 0) G.navTarget = i;
  if (step.found && G.mode === 'flight') comms(step.found[0], step.found[1], 8);
}

function dropObj() {
  if (!obj) return;
  // Keep the nav selection on the same target when the list gets shorter
  const i = navTargets().indexOf(obj.nav);
  if (i >= 0 && G.navTarget === i) G.navTarget = 0;
  else if (i >= 0 && G.navTarget > i) G.navTarget--;
  G.scene.remove(obj.mesh, obj.halo);
  obj.halo.material.dispose();
  obj = null;
}

/* ---------- For navigation, star map and markers ---------- */
export const storyNavPoints = () => (obj ? [obj.nav] : []);
export const storyMarks = () => (obj && obj.pos.distanceTo(G.ship.position) < 900 ? [obj] : []);

// System of the current goal (null when there is none, e.g. a choice)
export function storySystem() {
  const st = storyStep();
  return st && st.sys != null && st.type !== 'end' ? st.sys : null;
}
export function storyStation(sys, i) {
  const st = storyStep();
  return !!st && st.type === 'dock' && st.sys === sys && st.st === i;
}
