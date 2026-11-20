// Spielinfos (formerly Spieltipps): their own page from the main menu and the pause (Björn: the start menu was too long).
import { HELP } from './menu.js';

const root = () => document.getElementById('tips');

export function openTips() {
  root().innerHTML = `
  <div class="panel tips-panel" role="dialog" aria-modal="true" aria-labelledby="tips-h">
    <h1 id="tips-h">SPIELINFOS</h1>
    ${HELP.replace(/<h3 class="sect">Spielinfos<\/h3>/, '')}
    <div class="menu-btns"><button type="button" class="primary" data-act="close">ZURÜCK</button></div>
  </div>`;
  root().hidden = false;
  root().querySelector('[data-act="close"]').addEventListener('click', closeTips);
  root().querySelector('[data-act="close"]').focus({ preventScroll: true });
  root().querySelector('.panel').scrollTop = 0;
}

export function closeTips() { root().hidden = true; }
export const tipsOpen = () => !!root() && !root().hidden;
