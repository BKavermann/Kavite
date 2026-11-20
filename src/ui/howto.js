// "Steuerung": explains the touch controls on a sketch of the flight screen.
// Opens by itself before the very first flight, later from the main menu and the pause screen.
import { G } from '../ctx.js';
import { saveSettings } from '../game/save.js';
import { resetSticks } from '../core/input.js';

const root = () => document.getElementById('howto');
let pausedByHelp = false, onClose = null;

// Numbered spots on the sketch: [number, left %, top %]
const SPOTS = [[1, 14, 74], [2, 86, 74], [3, 77, 36], [4, 57, 36], [5, 64, 8], [6, 67, 20], [7, 79, 30], [8, 32, 86], [9, 36, 62], [10, 24, 8]];

export const ITEMS = [
  ['Lenken', 'Daumen irgendwo auf die linke Hälfte setzen und ziehen: Die Nase folgt (hoch, runter, links, rechts). Der Stick erscheint dort, wo der Daumen landet.'],
  ['Schub und Rolle', 'Rechte Hälfte: nach oben oder unten ziehen stellt den Schub ein, er bleibt beim Loslassen stehen. Ganz nach unten fliegt das Schiff langsam rückwärts. Nach links oder rechts ziehen rollt das Schiff.'],
  ['Feuer', 'Gedrückt halten für Dauerfeuer. Gefeuert wird die gewählte Waffe.'],
  ['Ziel markieren', 'Kurz auf einen Felsen, Piraten oder eine Station tippen. Raketen und „Ausrichten“ brauchen ein markiertes Ziel.'],
  ['Reise · Karte · Pause', '„Reise“ schaltet den Reiseantrieb für weite Strecken an und aus; er bremst vor dem Ziel selbst. „Karte“ öffnet die Sternenkarte, „II“ pausiert.'],
  ['Navigationsziel', 'Antippen wechselt das Ziel (Stationen, Auftragspunkte). Ein Pfeil am Rand zeigt, wohin du drehen musst.'],
  ['Waffe', 'Wechselt zwischen Laser, Railgun und Raketen, sobald du sie gekauft hast. „Heck“ daneben (Taste G) schaltet den Blick nach hinten; mit Hecklaser feuerst du dort. Mit Zielcomputer erscheint daneben „Ausrichten“.'],
  ['Scanner', 'Zeigt, was um dich herum ist, vorn ist oben. Jeder Punkt steht auf einem Strich: Seine Länge zeigt, wie weit er über dir (durchgezogen) oder unter dir (gestrichelt) ist. Stationen als Quadrat, Piraten rot, Polizei blau, Felsen sandfarben, schwarze Löcher als violetter Ring. Ein blinkender Pfeil am Rand zeigt zu einer Begegnung.'],
  ['Andocken', 'Langsam (unter 55) vor den Schlitz der Station fliegen, Nase zur Station. Mit Andockcomputer erscheint „ANDOCKEN“ zum Antippen, sonst selbst durchfliegen. Mit gesetztem Sprungziel erscheint oben „Sprung“.'],
  ['Anzeigen', 'Credits, Schild und Hülle (in Prozent), Schub, Fracht, Treibstoff und Munition.'],
];

function sketch() {
  return `
  <div class="ht-screen" aria-hidden="true">
    <div class="ht-half l"><span>Lenken</span></div>
    <div class="ht-half r"><span>Schub · Rolle</span></div>
    <div class="ht-stick" style="left:14%;top:74%"></div>
    <div class="ht-stick" style="left:86%;top:74%"></div>
    <div class="ht-fire" style="left:86%;top:44%">FEUER</div>
    <div class="ht-cross" style="left:50%;top:44%"></div>
    <div class="ht-target" style="left:60%;top:47%"></div>
    <div class="ht-chips" style="right:3%;top:4%"><i>Reise</i><i>Karte</i><i>II</i></div>
    <div class="ht-chips" style="right:3%;top:16%"><i class="wide">▸ Station · 4 km</i></div>
    <div class="ht-chips" style="right:3%;top:27%"><i>Laser</i></div>
    <div class="ht-radar" style="left:50%;top:83%"></div>
    <div class="ht-dock" style="left:50%;top:62%">ANDOCKEN</div>
    <div class="ht-hud" style="left:3%;top:5%"><b>Cr</b><i></i><i></i><i></i></div>
    ${SPOTS.map(([n, x, y]) => `<b class="ht-num" style="left:${x}%;top:${y}%">${n}</b>`).join('')}
  </div>`;
}

function html(first) {
  return `
  <div class="panel ht-panel">
    <h1>STEUERUNG</h1>
    <p class="sub">${first ? 'Kurz bevor es losgeht: So fliegst du mit dem Touchscreen. Am besten im Querformat.' : 'So fliegst du mit dem Touchscreen. Am besten im Querformat.'}</p>
    ${sketch()}
    <ol class="ht-list">${ITEMS.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol>
    <h3 class="sect">In der Station und auf der Karte</h3>
    <dl class="help">
      <dt>Hangar</dt><dd>Unten Markt, Werft oder Bar antippen, „‹ Hangar“ führt zurück. „Abdocken“ startet.</dd>
      <dt>Hangar und Werft</dt><dd>Ziehen dreht dein Schiff, zwei Finger zoomen.</dd>
      <dt>Sternenkarte</dt><dd>System antippen, dann „Als Sprungziel setzen“. Zwei Finger zoomen, ziehen verschiebt.</dd>
      <dt>Zurück-Taste</dt><dd>In der Android-App wirkt sie wie Pause oder Zurück.</dd>
    </dl>
    <details class="ht-keys"><summary>Tastatur am Rechner</summary>
      <p class="note">WASD lenken · Q/E rollen · ↑/↓ Schub · Leertaste feuern · F andocken · J Reiseantrieb · M Karte · H Hypersprung · V Ansicht · T Navigationsziel · R Waffe · X Ziel vor dem Bug · C Ausrichten · Esc Pause</p>
    </details>
    <div class="menu-btns"><button type="button" class="primary" data-act="close">${first ? 'LOS GEHT’S' : 'SCHLIESSEN'}</button></div>
  </div>`;
}

export function openHowto({ first = false, then = null } = {}) {
  onClose = then;
  root().innerHTML = html(first);
  root().hidden = false;
  root().querySelector('.panel').scrollTop = 0;
  if (G.mode === 'flight' && !G.paused) { G.paused = true; pausedByHelp = true; resetSticks(); }
  root().querySelector('[data-act="close"]').addEventListener('click', closeHowto);
}

export function closeHowto() {
  if (root().hidden) return;
  root().hidden = true;
  G.settings.helpSeen = true;
  saveSettings(G.settings);
  if (pausedByHelp) { G.paused = false; pausedByHelp = false; }
  const fn = onClose; onClose = null;
  fn?.();
}

export const howtoOpen = () => !root().hidden;

// Before the first flight on this device
export function maybeFirstHowto() {
  if (G.settings.helpSeen) return;
  openHowto({ first: true });
}
