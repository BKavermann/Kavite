// Cheat mode for testing (Björn's wish): SOS morsed on the screen during the intro (short and
// long taps) or typed as S-O-S opens this editor for the saved game. Everything can be set:
// credits, rank points, ship, hull, fuel, ammunition, upgrades, cargo, position, record, and
// the whole save as JSON for the rest.
import { SHIPS, UPGRADES, RANKS, HYPER } from '../config.js';
import { GOODS } from '../game/economy.js';
import { SYSTEMS } from '../game/galaxy.js';
import { loadProfile, newProfile, saveProfile, rankOf } from '../game/save.js';
import { showMainMenu } from './menu.js';
import { STEPS, CHAPTERS } from '../game/story.js';

let el = null, p = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Björn: drop-down lists instead of numbers wherever there is a fixed set of choices
const pick = (label, key, opts, cur) =>
  `<label class="ch-f"><span>${label}</span><select data-k="${key}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
// Upgrade levels by name: "nein", "ja" or the level names (Klasse 1 …); short enough for a phone
const upOpts = u => [[0, 'nein'], ...Array.from({ length: u.max }, (_, k) =>
  [k + 1, u.levels?.[k]?.name?.replace(u.name, '').trim() || (u.max === 1 ? 'ja' : `Stufe ${k + 1}/${u.max}`)])];
const HULL_STEPS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 1];
const hullOpts = cur => [...new Set([...HULL_STEPS, cur])].sort((a, b) => b - a).map(v => [v, `${v} %`]);
const WEAPONS = [['laser', 'Laser'], ['rail', 'Railgun'], ['missile', 'Raketen']];
const STEP_TYPE = { dock: 'andocken', fight: 'Kampf', find: 'suchen', choice: 'Entscheidung', end: 'Ende' };
const storyOpts = () => [['', 'noch nicht begonnen'], ...Object.entries(STEPS).map(([id, st]) =>
  [id, `${st.type === 'end' ? 'Ende' : `Kap. ${st.ch} ${CHAPTERS[st.ch]} · ${STEP_TYPE[st.type] || st.type}`}${id.startsWith('end') ? (id === 'endF' ? ' (Flotte)' : ' (Kartell)') : id === 'c6f' ? ' (Flotte)' : id === 'c6k' ? ' (Kartell)' : ''}`])];
const num = (label, key, val, min = 0, max = 1e9, step = 1) =>
  `<label class="ch-f"><span>${label}</span><input type="number" data-k="${key}" value="${val}" min="${min}" max="${max}" step="${step}" inputmode="decimal"></label>`;

function form() {
  const r = rankOf(p), sys = SYSTEMS[p.system] || SYSTEMS[0];
  return `
  <div class="panel ch-panel">
    <p class="eyebrow">Cheat-Modus · nur zum Testen</p>
    <h1>Spielstand</h1>
    <section class="ch-grid">
      ${num('Credits', 'credits', p.credits)}
      ${num('Rangpunkte', 'score', p.score || 0)}
      <label class="ch-f"><span>Rang</span><select data-k="rank">${RANKS.map((x, i) => `<option value="${x.at}" ${i === r.index ? 'selected' : ''}>${x.name} (ab ${x.at})</option>`).join('')}</select></label>
      <label class="ch-f"><span>Schiff</span><select data-k="ship">${SHIPS.map(s => `<option value="${s.id}" ${s.id === p.ship ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>
      ${pick('Hülle', 'hull', hullOpts(Math.round((p.hull ?? 1) * 100)), Math.round((p.hull ?? 1) * 100))}
      ${pick('Gewählte Waffe', 'weapon', WEAPONS, p.weapon || 'laser')}
      ${num('Treibstoff LJ', 'fuel', +(p.fuel || 0).toFixed(1), 0, HYPER.ranges[HYPER.ranges.length - 1], 0.1)}
      ${num('Munition', 'ammo', p.ammo || 0)}
      ${num('Railgun-Schuss', 'slugs', p.slugs || 0)}
      ${num('Raketen', 'missiles', p.missiles || 0)}
      ${num('Abschüsse', 'kills', p.kills || 0)}
    </section>
    <h3 class="sect">Ausbauten</h3>
    <section class="ch-grid">${UPGRADES.map(u => pick(u.name, 'up.' + u.id, upOpts(u), p.upgrades[u.id] || 0)).join('')}</section>
    <h3 class="sect">Fracht <small>t</small></h3>
    <section class="ch-grid">${GOODS.map(g => num(g.name, 'cargo.' + g.id, p.cargo[g.id] || 0)).join('')}</section>
    <h3 class="sect">Standort <small>beim Weiterspielen</small></h3>
    <section class="ch-grid">
      <label class="ch-f"><span>System</span><select data-k="system">${SYSTEMS.map(s => `<option value="${s.id}" ${s.id === p.system ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="ch-f"><span>Station</span><select data-k="station">${sys.stations.map((s, i) => `<option value="${i}" ${i === p.station ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    </section>
    <h3 class="sect">Geschichte</h3>
    <section class="ch-grid ch-wide">${pick('Stand der Geschichte', 'story', storyOpts(), p.story?.id || '')}</section>
    <label class="ch-check"><input type="checkbox" data-k="clean"> Strafregister löschen (Kopfgeld und Zollfunde in allen Systemen)</label>
    <label class="ch-check"><input type="checkbox" data-k="missions"> Laufende Aufträge entfernen</label>
    <details class="ch-json">
      <summary>Alles als JSON bearbeiten</summary>
      <textarea spellcheck="false" autocapitalize="off" autocomplete="off">${esc(JSON.stringify(p, null, 1))}</textarea>
      <button type="button" class="ghost small" data-act="json">JSON übernehmen und speichern</button>
    </details>
    <p class="note ch-msg" aria-live="polite"></p>
    <div class="row">
      <button type="button" class="ghost" data-act="close">Abbrechen</button>
      <button type="button" class="primary" data-act="save">Speichern</button>
    </div>
  </div>`;
}

const val = k => el.querySelector(`[data-k="${k}"]`);
const n = (k, def = 0) => { const v = parseFloat(val(k)?.value); return Number.isFinite(v) ? v : def; };

function apply() {
  p.credits = Math.max(0, Math.round(n('credits', p.credits)));
  p.score = Math.max(0, Math.round(n('score', p.score)));
  p.ship = val('ship').value;
  p.hull = Math.min(1, Math.max(0.01, n('hull', 100) / 100));
  p.fuel = Math.max(0, n('fuel'));
  for (const k of ['ammo', 'slugs', 'missiles', 'kills']) p[k] = Math.max(0, Math.round(n(k)));
  for (const u of UPGRADES) p.upgrades[u.id] = Math.min(u.max, Math.max(0, Math.round(n('up.' + u.id))));
  p.weapon = val('weapon').value;
  if (p.weapon === 'rail' && !p.upgrades.rail || p.weapon === 'missile' && !p.upgrades.missile) p.weapon = 'laser';
  // story: jump to the chosen step with fresh step flags; the log is kept
  const sid = val('story').value;
  if (sid && sid !== p.story?.id) {
    p.story ||= { log: [], unread: true };
    Object.assign(p.story, { id: sid, t: 0, spawned: false, got: false, hold: 0, asked: false, obj: null, guards: false, unread: true });
  } else if (!sid) delete p.story;
  for (const g of GOODS) { const q = Math.max(0, Math.round(n('cargo.' + g.id))); if (q) p.cargo[g.id] = q; else delete p.cargo[g.id]; }
  p.system = +val('system').value;
  p.station = Math.min(SYSTEMS[p.system].stations.length - 1, +val('station').value);
  if (!p.visited.includes(p.system)) p.visited.push(p.system);
  if (val('clean').checked) { p.wanted = {}; p.caught = {}; }
  if (val('missions').checked) p.missions = [];
  p.over = false;
}

function done() {
  saveProfile(p);
  close();
  showMainMenu(true);
}

export function openCheat() {
  p = loadProfile() || newProfile();
  el = document.getElementById('cheat');
  if (!el) { el = document.createElement('div'); el.id = 'cheat'; document.body.append(el); }
  el.innerHTML = form();
  el.hidden = false;
  // Rank picks the points, the system picks its stations
  val('rank').addEventListener('change', () => { val('score').value = val('rank').value; });
  val('system').addEventListener('change', () => {
    const s = SYSTEMS[+val('system').value];
    val('station').innerHTML = s.stations.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('');
  });
  el.querySelector('[data-act="close"]').addEventListener('click', close);
  el.querySelector('[data-act="save"]').addEventListener('click', () => { apply(); done(); });
  el.querySelector('[data-act="json"]').addEventListener('click', () => {
    try {
      const q = JSON.parse(el.querySelector('textarea').value);
      if (!q || q.v !== 2 || typeof q.upgrades !== 'object') throw new Error('Kein Kavite-Spielstand (v: 2 fehlt)');
      p = q; p.over = false;
      done();
    } catch (e) {
      el.querySelector('.ch-msg').textContent = 'Fehler: ' + e.message;
    }
  });
}
export function close() { if (el) { el.hidden = true; el.innerHTML = ''; } }
addEventListener('keydown', e => { if (e.key === 'Escape' && cheatOpen()) { e.stopImmediatePropagation(); close(); } }, true);
export const cheatOpen = () => !!el && !el.hidden;
