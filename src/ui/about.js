// "Über Kavite": version, copyright and licences, opened from the main menu.
import { VERSION, COPYRIGHT, IMPRINT } from '../config.js';

const root = () => document.getElementById('about');
const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

export function openAbout() {
  root().innerHTML = `
  <div class="panel about-panel">
    <h1>KAVITE</h1>
    <p class="sub">Version ${VERSION} · ${COPYRIGHT}</p>
    <p class="note about">Idee, Gestaltung und Spieltests: Björn Kavermann. Programmiert mit KI-Unterstützung (Claude von Anthropic).</p>
    <p class="note about">Freie Software unter der GNU General Public License, Version 3 oder neuer: Du darfst Kavite nutzen, weitergeben und verändern, solange es frei bleibt. Ohne jede Gewährleistung. Lizenztext: ${link('licenses/GPL-3.0.txt', 'GPL-3.0')}.</p>
    <p class="note about">Verwendet three.js (${link('licenses/three.js-MIT.txt', 'MIT-Lizenz')}), die Schriften Chakra Petch und IBM Plex Mono (${link('fonts/OFL-ChakraPetch.txt', 'SIL Open Font License')}) und den Donauwalzer von Johann Strauss und den Walkürenritt von Richard Wagner (beide gemeinfrei, eigene Fassungen im Amiga-Stil).</p>
    <section class="imprint">
      <h3 class="sect">Impressum</h3>
      <p class="note">Angaben gemäß § 5 DDG</p>
      <address>${IMPRINT.name}<br>${IMPRINT.street}<br>${IMPRINT.city}<br>${IMPRINT.country}${IMPRINT.email ? `<br>E-Mail: <a href="mailto:${IMPRINT.email}">${IMPRINT.email}</a>` : ''}</address>
    </section>
    <div class="menu-btns"><button type="button" class="primary" data-act="close">ZURÜCK</button></div>
  </div>`;
  root().hidden = false;
  root().querySelector('[data-act="close"]').addEventListener('click', closeAbout);
}

export function closeAbout() { root().hidden = true; }
export const aboutOpen = () => !root().hidden;
