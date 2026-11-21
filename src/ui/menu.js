// Main menu, pause screen and the "ship destroyed" screen share one overlay.
import { openTips } from './tips.js';
import { G } from '../ctx.js';
import { INSURANCE } from '../config.js';
import { SYSTEMS } from '../game/galaxy.js';
import { missionGoal, TYPE_LABEL } from '../game/missions.js';
import { storyStep, storyGoal, CHAPTERS } from '../game/story.js';
import { rankOf } from '../game/save.js';
import { bounty, legalStatus } from '../game/law.js';

function storyLine() {
  const st = G.profile && storyStep();
  if (!st || st.type === 'end') return '';
  return `<div class="pause-jobs"><h3 class="sect">Geschichte <small>Kapitel ${st.ch}: ${CHAPTERS[st.ch]}</small></h3><div class="pj"><b>${storyGoal()}</b></div></div>`;
}

function missionList() {
  const p = G.profile;
  if (!p || !p.missions.length) return '';
  return `<div class="pause-jobs"><h3 class="sect">Aufträge</h3>${p.missions.map(m => {
    const left = Math.max(0, m.due - p.playTime);
    return `<div class="pj"><b>${TYPE_LABEL[m.type]}: ${m.title}</b><span>${missionGoal(m)} · noch ${Math.ceil(left / 60)} min</span></div>`;
  }).join('')}</div>`;
}
import { fmt } from '../utils.js';
import { openAbout } from './about.js';

function careerLine() {
  const p = G.profile;
  if (!p) return '';
  const r = rankOf(p), b = bounty();
  return `<p class="sub">Rang <b class="tint">${r.name}</b> · ${p.score || 0} Punkte${r.next ? ` (${r.next.name} ab ${r.next.at})` : ''} · Status ${legalStatus(b)}${b > 0 ? ` (${b} Cr Kopfgeld)` : ''}</p>`;
}

const el = () => document.getElementById('menu');

export const HELP = `
  <h3 class="sect">Spielinfos</h3>
  <dl class="help">
    <dt>Geschichte</dt><dd>Dein alter Fluglehrer Jona Brekk ist verschwunden. Seine Nachrichten und alle, die von ihm wissen, findest du in der Bar. Das nächste Ziel der Geschichte steht auch in der Pause und auf der Sternenkarte (Ring um das System). Daneben kannst du frei handeln, Aufträge fliegen und erkunden.</dd>
    <dt>Schild und Hülle</dt><dd>Treffer nehmen zuerst den Schild (Balken „Schild“, lädt sich wieder auf), man hört und spürt sie im Schiff. Ist er leer, wird die Hülle beschädigt, ein Aufprall auf eine Station trifft sie auch bei vollem Schild: Kratzer und Risse auf der Kanzel, flackernder Scanner, stotterndes Triebwerk und Warnton. Die Hülle heilt nicht von selbst: In jeder Werft reparieren lassen. Mit beschädigter Hülle erscheint „Aussteigen“ (zweimal tippen, Taste B): Du rettest dich in der Kapsel, die Versicherung ersetzt das Schiff, Ausbauten bleiben. Wird das Schiff bei 0 % Hülle mit dir an Bord zerstört, ist das Spiel zu Ende: Kapital, Ladung und alle Ausbauten sind weg. Auf „Leicht“ gibt es kein Spielende, die Versicherung ersetzt das Schiff immer.</dd>
    <dt>Waffen</dt><dd>Laser überhitzen bei Dauerfeuer (Balken „Hitze“): kurze Feuerpausen einlegen, sonst sind sie gesperrt, bis sie abgekühlt sind. Railgun und Raketen werden nicht heiß, brauchen aber Munition. Raketen treffen nur einen markierten Piraten. Mit „Heck“ (Taste G) schaust du nach hinten; die Steuerung fühlt sich dabei an, als wäre das Heck die Nase. Feuern kannst du dort nur mit einem Hecklaser aus der Werft.</dd>
    <dt>Schiffe</dt><dd>In der Werft gibt es neben der Kestrel den Jäger Hornet und den Frachter Atlas. Dein altes Schiff wird in Zahlung genommen, Ausbauten bleiben.</dd>
    <dt>Gesetz</dt><dd>Wer Händler, Polizei oder Stationen beschießt, wird gesucht. Dann jagt dich die Polizei, und als Flüchtiger darfst du nicht andocken. Das Kopfgeld sinkt mit der Zeit, im Nachbarsystem bist du sauber.</dd>
    <dt>Schmuggel</dt><dd>Waffen und Narkotika sind in friedlichen Systemen verboten, in gesetzlosen (Piraten „hoch“) frei handelbar. Verbotenes kauft und verkauft das Hinterzimmer der Bar teuer. Beim Anflug kann der Zoll scannen: erwischt heißt Strafe und Beschlagnahme. Ein Schmuggelfach (nur in gesetzlosen Systemen) versteckt die Ware meistens.</dd>
    <dt>Hinterzimmer</dt><dd>Eine Tür am Ende der Bar führt ins Hinterzimmer: Schwarzmarkt und krumme Geschäfte. Hehlerware und gesuchte Personen bringen viel Geld, belegen Frachtraum und locken Verfolger an. Findet der Zoll sie, sind Ware oder Passagier beim nächsten Andocken weg.</dd>
    <dt>Begegnungen</dt><dd>Unterwegs kommen Funksprüche: Frachter in Not gegen Piraten verteidigen, treibende Wracks nach Fracht absuchen (Vorsicht, manchmal eine Falle) oder liegengebliebenen Händlern 1 LJ Treibstoff abgeben. Das Ziel landet unter ▸.</dd>
    <dt>Sonne</dt><dd>Die Sonne jedes Systems lässt sich anfliegen (unter ▸ „Sonne“). Mit einem Treibstoffsammler aus der Werft füllt sich dicht über der Oberfläche der Hyperraumtank, je näher, desto schneller. Dabei wird die Hülle heiß: im roten Bereich schmilzt der Schild, wer die Oberfläche berührt, verglüht. Blaue Sonnen sind am heißesten, rote am mildesten.</dd>
    <dt>Werften</dt><dd>Jede Station verkauft, was zu ihr passt: Agrarstationen haben keine Waffen und keinen Hyperantrieb, Raketenwerfer gibt es nur bei der Industrie.</dd>
    <dt>Reise</dt><dd>Stationen liegen kilometerweit auseinander. Ziel wählen (Knopf mit ▸), Reiseantrieb an: Er bremst vor dem Ziel selbst ab. Nicht nutzbar nahe Stationen oder Piraten.</dd>
    <dt>Andocken</dt><dd>Selbst durch den Schlitz fliegen, die Station dreht sich mit. Mit Andockcomputer (Werft, 500 Cr) reicht es, langsam (unter 55) vor den Schlitz zu fliegen, Nase zur Station, dann „ANDOCKEN“ antippen.</dd>
    <dt>Hyperraum</dt><dd>Den Hyperantrieb zuerst in der Werft kaufen (1000 Cr). Dann auf der Sternenkarte ein System als Sprungziel setzen, im Flug „⇢“ antippen. Kostet Treibstoff je Lichtjahr. Klasse 1 springt bis 7 LJ, Klasse 2 (Industrie, Hightech) bis 15 LJ, Klasse 3 (nur Hightech) bis 30 LJ.</dd>
    <dt>Vorräte</dt><dd>Treibstoff und Munition sind begrenzt. In der Werft jeder Station nachkaufen.</dd>
    <dt>Versicherung</dt><dd>Geht dein Schiff verloren, stellt die Versicherung ein neues bereit (Selbstbeteiligung bis 150 Cr), Ausbauten bleiben. Die Ladung ist dann weg, außer du hast in der Werft (Reiter Ausrüstung) eine Warenversicherung gekauft: Sie ersetzt die Ware, nur Waffen, Narkotika und Auftragsfracht nicht.</dd>
    <dt>Handel</dt><dd>Agrarwelten liefern Nahrung, Industrie Maschinen, Hightech Computer und Luxusgüter, Bergbaukolonien Mineralien. Kleine Felsen geben Erz, Piraten Beute.</dd>
  </dl>`;

// Björn: "Spielinfos" first in the menu
const infoBtn = '<button type="button" class="ghost" data-act="tips">SPIELINFOS</button>';
const settingsBtn = '<button type="button" class="ghost" data-act="howto">STEUERUNG</button><button type="button" class="ghost" data-act="settings">EINSTELLUNGEN</button>';
const bindOptions = () => {
  el().querySelector('[data-act="settings"]').addEventListener('click', () => G.events.openSettings?.());
  el().querySelector('[data-act="howto"]').addEventListener('click', () => G.events.openHowto?.());
  el().querySelector('[data-act="tips"]').addEventListener('click', openTips);
};

export function showMainMenu(hasSave) {
  el().innerHTML = `
  <div class="panel">
    <h1>KAVITE</h1>
    <p class="sub">Bergbau, Handel und Piraten in hundert Sternsystemen</p>
    <div class="menu-btns">
      ${infoBtn}
      ${hasSave ? '<button type="button" class="primary" data-act="continue">WEITERFLIEGEN</button>' : ''}
      <button type="button" class="${hasSave ? 'ghost' : 'primary'}" data-act="new">NEUES SPIEL</button>
      ${settingsBtn}
      <button type="button" class="ghost" data-act="about">ÜBER KAVITE</button>
    </div>
    <p class="note">Querformat empfohlen. Gespeichert wird bei jedem Andocken.</p>
  </div>`;
  el().hidden = false;
  bindOptions();
  el().querySelector('[data-act="continue"]')?.addEventListener('click', () => G.events.startGame?.(false));
  el().querySelector('[data-act="about"]').addEventListener('click', openAbout);
  const nb = el().querySelector('[data-act="new"]');
  let armed = !hasSave;
  nb.addEventListener('click', () => {
    if (!armed) { armed = true; nb.textContent = 'SICHER? SPIELSTAND WIRD GELÖSCHT'; return; }
    G.events.startGame?.(true);
  });
}

// Destroyed without getting out: the commander is lost with everything they owned
export function showGameOver(p, lost) {
  const r = rankOf(p), min = Math.round((p.playTime || 0) / 60);
  el().innerHTML = `
  <div class="panel">
    <h1 class="warn">SPIEL ZU ENDE</h1>
    <p class="sub">Dein Schiff wurde zerstört, bevor du aussteigen konntest. Mit ihm sind dein ganzes Kapital, die Ladung und alle Ausbauten verloren. Der Spielstand ist gelöscht.</p>
    <dl class="help">
      <dt>Kapital verloren</dt><dd>${fmt(lost.credits)} Cr</dd>
      <dt>Ladung verloren</dt><dd>${lost.cargo} t</dd>
      <dt>Ausbauten verloren</dt><dd>${lost.upgrades}</dd>
      <dt>Rang</dt><dd>${r.name} · ${p.score || 0} Punkte · ${p.kills} Abschüsse</dd>
      <dt>Flugzeit</dt><dd>${min} min</dd>
    </dl>
    <p class="note">Tipp: Ist die Hülle beschädigt, erscheint im Flug „Aussteigen“. Wer rechtzeitig aussteigt, behält Geld und Ausbauten.</p>
    <div class="menu-btns">
      <button type="button" class="primary" data-act="new">NEUES SPIEL</button>
      <button type="button" class="ghost" data-act="menu">HAUPTMENÜ</button>
    </div>
  </div>`;
  el().hidden = false;
  el().querySelector('[data-act="new"]').addEventListener('click', () => G.events.startGame?.(true));
  el().querySelector('[data-act="menu"]').addEventListener('click', () => showMainMenu(false));
}

export function showPause() {
  el().innerHTML = `
  <div class="panel">
    <h1>PAUSE</h1>
    ${careerLine()}
    ${storyLine()}
    ${missionList()}
    <div class="menu-btns">${infoBtn}<button type="button" class="primary" data-act="resume">WEITER</button>${settingsBtn}</div>
  </div>`;
  el().hidden = false;
  bindOptions();
  el().querySelector('[data-act="resume"]').addEventListener('click', () => G.events.resume?.());
}

export function showDeath(lostCargo, fee, ejected, replaced = 0) {
  const p = G.profile;
  const name = SYSTEMS[p.system].stations[p.station].name;
  el().innerHTML = `
  <div class="panel">
    <h1 class="warn">${ejected ? 'AUSGESTIEGEN' : 'SCHIFF ZERSTÖRT'}</h1>
    <p class="sub">${ejected ? 'Du bist rechtzeitig in die Rettungskapsel gestiegen, dein Schiff ist verloren. ' : ''}Die Versicherung stellt ein neues Schiff auf ${name} (System ${SYSTEMS[p.system].name}) bereit, voll getankt und munitioniert. Ausbauten bleiben erhalten.</p>
    <dl class="help">
      ${replaced ? `<dt>Ladung ersetzt</dt><dd>${replaced} t (Warenversicherung)</dd>` : ''}
      <dt>Ladung verloren</dt><dd>${lostCargo} t${!replaced && !p.upgrades.cargoins && lostCargo ? ' · eine Warenversicherung gibt es in jeder Werft' : ''}</dd>
      <dt>Selbstbeteiligung</dt><dd>${fmt(fee)} Cr (max. ${INSURANCE} Cr)</dd>
    </dl>
    <div class="menu-btns"><button type="button" class="primary" data-act="respawn">NEUES SCHIFF</button></div>
  </div>`;
  el().hidden = false;
  el().querySelector('[data-act="respawn"]').addEventListener('click', () => G.events.respawn?.());
}

export function hideMenu() { el().hidden = true; }
