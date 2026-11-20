// Settings screen: sound, controls, display and save game in one place.
// Opens above the main menu, the pause screen and the station.
import { G } from '../ctx.js';
import { SAVE_KEY, OLD_SAVE_KEY, RULES_DEFAULT, PIRATE_AMOUNT } from '../config.js';
import { saveSettings } from '../game/save.js';
import { setVolume, sfxClick, trackChanged, canPlay } from '../core/audio.js';
import { setTrack, clearTrack, trackName } from '../core/music-files.js';

export const DEFAULT_SETTINGS = { intro: true, volume: 0.8, invertY: false, sensitivity: 1, view: 'cockpit', glow: true, glowStrength: 0.35, quality: 'mid', difficulty: 'normal', pirateSpeed: 1, pirateAmount: 3 };

const DIFF_NOTE = {
  easy: 'Weniger Piraten, höchstens zwei auf einmal. Sie zielen schlechter und treffen schwächer. Kein Spielende: Geht das Schiff verloren, ersetzt es immer die Versicherung.',
  normal: 'Piraten wie vorgesehen.',
  hard: 'Mehr und bessere Piraten, bis zu fünf auf einmal. Ihre Laser treffen härter.',
};

// key, label, slider min/max/step (percent, or credits for the start capital)
const RULES = [
  ['goods', 'Warenpreise', 50, 200, 5],
  ['rewards', 'Auftragsbelohnungen', 50, 300, 10],
  ['bounty', 'Kopfgeld für Piraten', 50, 300, 10],
  ['yard', 'Preise für Ausbauten', 25, 200, 5],
  ['supplies', 'Treibstoff und Munition', 25, 200, 5],
  ['startCredits', 'Startkapital', 0, 10000, 100],
];
const fmtRule = (k, v) => (k === 'startCredits' ? Math.round(v).toLocaleString('de-DE') + ' Cr' : pct(v) + ' %');
let advOpen = false;

// Station areas with music the player can replace by an own file
const MUSIC = [['yard', 'Werft', 'Donauwalzer'], ['jobs', 'Bar', 'Bar-Band'], ['market', 'Markt', 'Disco']];

const root = () => document.getElementById('settings');
export const settingsOpen = () => !root().hidden;

const pct = v => Math.round(v * 100);
const seg = (id, val, opts) => `<div class="seg" role="radiogroup" data-seg="${id}">${opts.map(([v, label]) =>
  `<button type="button" role="radio" aria-checked="${v === val}" data-v="${v}">${label}</button>`).join('')}</div>`;

function render() {
  const s = G.settings, glowOk = !!G.composer, r = { ...RULES_DEFAULT, ...s.rules };
  root().innerHTML = `
  <div class="panel set-panel">
    <header class="map-head">
      <div><p class="eyebrow">Kavite</p><h2>Einstellungen</h2></div>
      <button type="button" class="ghost close" data-act="close">Fertig</button>
    </header>
    <div class="set-tabs" role="tablist">
      <button type="button" role="tab" data-tab="gen" aria-selected="${!advOpen}">Allgemein<small>Spiel · Ton · Steuerung · Anzeige</small></button>
      <button type="button" role="tab" data-tab="adv" aria-selected="${advOpen}">Erweitert<small>Wirtschaft · Piraten · Schäden</small></button>
    </div>
    <div class="set-page" ${advOpen ? 'hidden' : ''}>

    <h3 class="sect">Spiel</h3>
    <div class="set-row"><span>Schwierigkeitsgrad</span>${seg('difficulty', s.difficulty, [['easy', 'Leicht'], ['normal', 'Normal'], ['hard', 'Schwer']])}</div>
    <p class="note">${DIFF_NOTE[s.difficulty] || DIFF_NOTE.normal}</p>

    <h3 class="sect">Ton</h3>
    <label class="set-row"><span>Lautstärke <b data-out="volume">${pct(s.volume)} %</b></span>
      <input type="range" data-k="volume" min="0" max="100" step="5" value="${pct(s.volume)}"></label>
    <p class="note">Musik in der Station: Eine eigene Audiodatei (zum Beispiel MP3) ersetzt die eingebaute Musik. Sie bleibt nur in diesem Browser. Am Rechner kannst du die Datei auch auf die Zeile ziehen.</p>
    ${MUSIC.map(([k, label, builtin]) => `<div class="set-row"><span>${label}: <b data-track="${k}">${builtin}</b></span>
      <div class="set-btns"><button type="button" class="ghost small" data-pick="${k}">Datei wählen</button>
      <input type="file" class="file-in" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac" data-file="${k}" tabindex="-1" aria-hidden="true">
      <button type="button" class="ghost small" data-act="track-clear" data-area="${k}">Eingebaute Musik</button></div></div>`).join('')}

    <h3 class="sect">Steuerung</h3>
    <label class="set-row"><span>Empfindlichkeit der Sticks <b data-out="sensitivity">${pct(s.sensitivity)} %</b></span>
      <input type="range" data-k="sensitivity" min="50" max="150" step="5" value="${pct(s.sensitivity)}"></label>
    <label class="set-check"><input type="checkbox" data-k="invertY" ${s.invertY ? 'checked' : ''}> Y-Achse invertieren (Stick nach vorn = Nase hoch)</label>

    <h3 class="sect">Anzeige</h3>
    <div class="set-row"><span>Ansicht</span>${seg('view', s.view, [['cockpit', 'Cockpit'], ['chase', 'Außen']])}</div>
    <div class="set-row"><span>Bildqualität</span>${seg('quality', s.quality, [['low', 'Akku'], ['mid', 'Standard'], ['high', 'Scharf']])}</div>
    <label class="set-check"><input type="checkbox" data-k="glow" ${s.glow ? 'checked' : ''} ${glowOk ? '' : 'disabled'}> Glow-Effekt</label>
    <label class="set-check"><input type="checkbox" data-k="intro" ${s.intro !== false ? 'checked' : ''}> Intro beim Start zeigen</label>
    <label class="set-row"><span>Glow-Stärke <b data-out="glowStrength">${pct(s.glowStrength ?? 0.35)} %</b></span>
      <input type="range" data-k="glowStrength" min="0" max="100" step="5" value="${pct(s.glowStrength ?? 0.35)}" ${glowOk && s.glow ? '' : 'disabled'}></label>

    <h3 class="sect">Spielstand</h3>
    <p class="note">Gespeichert wird bei jedem Andocken, im Browser dieses Geräts.</p>
    <div class="set-btns">
      <button type="button" class="ghost small" data-act="defaults">Einstellungen zurücksetzen</button>
      <button type="button" class="ghost small danger" data-act="wipe">Spielstand löschen</button>
    </div>
    </div>
    <div class="set-page set-adv" ${advOpen ? '' : 'hidden'}>
      <h3 class="sect">Wirtschaft</h3>
      <p class="note">100 % ist das Spiel wie vorgesehen. Belohnungen gelten für neu ausgeschriebene Aufträge, das Startkapital für ein neues Spiel.</p>
      ${RULES.map(([k, label, min, max, step]) => {
        const v = r[k];
        return `<label class="set-row"><span>${label} <b data-out="rule-${k}">${fmtRule(k, v)}</b></span>
          <input type="range" data-rule="${k}" min="${min}" max="${max}" step="${step}" value="${k === 'startCredits' ? v : pct(v)}"></label>`;
      }).join('')}
      <button type="button" class="ghost small" data-act="rules-default">Wirtschaft auf 100 %</button>
      <h3 class="sect">Piraten</h3>
      <div class="set-row"><span>Anzahl der Piraten</span>${seg('pirateAmount', String(s.pirateAmount ?? 3), Object.entries(PIRATE_AMOUNT).map(([k, a]) => [k, a.label]))}</div>
      <label class="set-row"><span>Tempo der Piraten <b data-out="pirateSpeed">${pct(s.pirateSpeed ?? 1)} %</b></span>
        <input type="range" data-k="pirateSpeed" min="50" max="120" step="5" value="${pct(s.pirateSpeed ?? 1)}"></label>
      <p class="note">Die Anzahl bestimmt, wie oft Piraten auftauchen und wie viele gleichzeitig angreifen. Langsamere Piraten fliegen und wenden gemächlicher, gut zum Üben der Steuerung; das Tempo gilt auch für die Polizei. Aufträge und Geschichte schicken ihre Gegner unabhängig davon.</p>
      <h3 class="sect">Schäden und Spielende</h3>
      <label class="set-check"><input type="checkbox" data-rulecheck="damage" ${r.damage !== false ? 'checked' : ''}> Schiffsschäden: Ist der Schild leer, wird die Hülle beschädigt (Kratzer, Scanner, Triebwerk, Warnton, Reparatur in der Werft)</label>
      <label class="set-check"><input type="checkbox" data-rulecheck="gameOver" ${r.gameOver !== false ? 'checked' : ''} ${r.damage !== false ? '' : 'disabled'}> Spielende (ab Normal): Wer nicht rechtzeitig aussteigt, verliert Kapital, Ladung und alle Ausbauten</label>
      <p class="note">Aus: Ist der Schild leer, ist das Schiff verloren, und die Versicherung ersetzt es wie früher. Das Spielende und „Aussteigen“ gibt es nur mit Schiffsschäden und ab Schwierigkeitsgrad Normal.</p>
    </div>
  </div>`;
  bind();
}

function bind() {
  const s = G.settings, el = root();
  el.querySelector('[data-act="close"]').addEventListener('click', closeSettings);
  el.querySelectorAll('input[type="range"][data-k]').forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.k, v = inp.value / 100;
    el.querySelector(`[data-out="${k}"]`).textContent = inp.value + ' %';
    if (k === 'volume') { s.volume = v; setVolume(v); }
    else if (k === 'sensitivity') s.sensitivity = v;
    else if (k === 'pirateSpeed') s.pirateSpeed = v;
    else if (k === 'glowStrength') G.events.setGlowStrength?.(v);
    saveSettings(s);
  }));
  el.querySelector('input[type="range"][data-k="volume"]').addEventListener('change', () => sfxClick());
  MUSIC.forEach(([k]) => trackName(k).then(n => { const b = el.querySelector(`[data-track="${k}"]`); if (n && b) b.textContent = n; }));
  // A plain button opens the hidden file input; tapping a <label> is unreliable on phones
  el.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', () => {
    const inp = el.querySelector(`[data-file="${btn.dataset.pick}"]`);
    inp.value = '';
    try { inp.showPicker ? inp.showPicker() : inp.click(); } catch (e) { inp.click(); }
  }));
  const useFile = async (k, file) => {
    const b = el.querySelector(`[data-track="${k}"]`);
    if (!file) return;
    b.textContent = 'Lade …';
    if (!await canPlay(file)) { b.textContent = 'Format nicht abspielbar'; return; }
    const kept = await setTrack(k, file);
    b.textContent = kept ? file.name : file.name + ' (nur bis zum Neustart)';
    trackChanged(k);
  };
  el.querySelectorAll('[data-file]').forEach(inp => inp.addEventListener('change', () => useFile(inp.dataset.file, inp.files[0])));
  // On a computer the file can also be dropped onto its row (works where the file dialog is blocked)
  el.querySelectorAll('[data-pick]').forEach(btn => {
    const row = btn.closest('.set-row'), k = btn.dataset.pick;
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drop'); });
    row.addEventListener('dragleave', () => row.classList.remove('drop'));
    row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('drop'); useFile(k, e.dataTransfer.files[0]); });
  });
  el.querySelectorAll('[data-act="track-clear"]').forEach(btn => btn.addEventListener('click', async () => {
    const k = btn.dataset.area;
    try { await clearTrack(k); } catch (e) {}
    el.querySelector(`[data-track="${k}"]`).textContent = MUSIC.find(m => m[0] === k)[2];
    trackChanged(k);
    sfxClick();
  }));
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { advOpen = b.dataset.tab === 'adv'; sfxClick(); render(); el.querySelector('.set-panel').scrollTop = 0; }));
  el.querySelectorAll('[data-rule]').forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.rule, v = k === 'startCredits' ? +inp.value : inp.value / 100;
    s.rules = { ...s.rules, [k]: v };
    el.querySelector(`[data-out="rule-${k}"]`).textContent = fmtRule(k, v);
    saveSettings(s);
  }));
  el.querySelectorAll('[data-rulecheck]').forEach(inp => inp.addEventListener('change', () => {
    s.rules = { ...s.rules, [inp.dataset.rulecheck]: inp.checked };
    saveSettings(s);
    sfxClick();
    G.events.rulesChanged?.();
    render();
  }));
  el.querySelector('[data-act="rules-default"]').addEventListener('click', () => { s.rules = { ...RULES_DEFAULT, damage: s.rules?.damage ?? true, gameOver: s.rules?.gameOver ?? true }; saveSettings(s); sfxClick(); render(); });
  el.querySelector('[data-k="invertY"]').addEventListener('change', e => { s.invertY = e.target.checked; saveSettings(s); });
  el.querySelector('[data-k="intro"]').addEventListener('change', e => { s.intro = e.target.checked; saveSettings(s); });
  el.querySelector('[data-k="glow"]').addEventListener('change', e => { G.events.setGlow?.(e.target.checked); render(); });
  el.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.v;
    if (g.dataset.seg === 'view') G.events.setView?.(v);
    else if (g.dataset.seg === 'quality') G.events.setQuality?.(v);
    else if (g.dataset.seg === 'pirateAmount') { s.pirateAmount = +v; saveSettings(s); }
    else { s.difficulty = v; saveSettings(s); }
    sfxClick();
    render();
  })));
  el.querySelector('[data-act="defaults"]').addEventListener('click', () => {
    Object.assign(s, DEFAULT_SETTINGS, { rules: { ...RULES_DEFAULT } });
    setVolume(s.volume);
    G.events.setGlowStrength?.(s.glowStrength);
    G.events.setGlow?.(s.glow);
    G.events.setQuality?.(s.quality);
    G.events.setView?.(s.view);
    render();
  });
  const wipe = el.querySelector('[data-act="wipe"]');
  let armed = false;
  wipe.addEventListener('click', () => {
    if (!armed) { armed = true; wipe.textContent = 'Wirklich? Alles geht verloren'; return; }
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_SAVE_KEY); } catch (_) {}
    location.reload();
  });
}

let pausedBySettings = false;
export function openSettings() {
  if (G.mode === 'flight' && !G.paused) { G.paused = true; pausedBySettings = true; }
  render();
  root().hidden = false;
}
export function closeSettings() {
  root().hidden = true;
  if (pausedBySettings) { G.paused = false; pausedBySettings = false; }
}
