// Station screen: market, shipyard with fuel and ammunition, star map.
// Rows stay in the DOM and only their numbers update, so press-and-hold keeps working.
import { G } from '../ctx.js';
import { UPGRADES, HYPER, AMMO, RAIL, MISSILE, ARMS_SOLD, SHIPS, TRADE_IN, RANKS, RANK_GATE } from '../config.js';
import { payFine, bounty, legalStatus, customsAtDock } from '../game/law.js';
import { GOODS, buyPrice, sellPrice, marketItem, goodById, isIllegal, isContraband, illegalGoods, blackBuyPrice, blackSellPrice } from '../game/economy.js';
import { LAWLESS, CUSTOMS_FEE } from '../config.js';
import { capacity, cargoUsed, maxShield, maxAmmo, marketFor, saveProfile, hasHyper, hyperRange, shipDef, rankOf } from '../game/save.js';
import { attachPlayerModel } from '../entities/player.js';
import { refreshHangarShip } from '../world/hangar.js';
import { openMap } from './galaxy-ui.js';
import { offersFor, backroomOffersFor, jobsOpen, backroomOpen, accept, abandon, blockReason, missionGoal, MAX_ACTIVE, RISK, TYPE_LABEL } from '../game/missions.js';
import { SYSTEMS } from '../game/galaxy.js';
import { storyStep, storyGoal, storyChoose, CHAPTERS } from '../game/story.js';
import { rules } from '../game/difficulty.js';
import { hullOf, hullPct, repairCost, repairQuote, repairHull, damageOn } from '../game/damage.js';
import { sfxClick, sfxDeny, startMusic, stopMusic } from '../core/audio.js';
import { fmt, fmtLY } from '../utils.js';
import { focusHangar, DOORS } from '../world/hangar.js';
import { backroomImage, bouncerImage } from './backroom-art.js';
import { maybePromotion } from './promotion.js';

const root = () => document.getElementById('station');
// One line of hangar chatter under the station name
const FLAVOR = {
  agrar: 'Luft aus den Gewächshäusern, 21 °C',
  industrie: 'Schichtwechsel in Halle 3, Lärmschutz empfohlen',
  bergbau: 'Erzstaub in der Luft, Filter aktiv',
  hightech: 'Reinraumstufe B, Fremdsysteme gesperrt',
};
// view: 'hangar' (overview with the three exits) or the screen behind one exit
let view = 'hangar', tab = 'market', note = '';
const EXIT_INFO = {
  market: { title: 'Markt', sub: () => 'Waren kaufen und verkaufen' },
  yard: { title: 'Werft', sub: () => hullOf(G.profile) < 1 ? `Reparatur nötig · Hülle ${hullPct(G.profile)} %` : 'Ausbau, Treibstoff, Munition' },
  jobs: { title: 'Bar', sub: () => { const n = offersFor(G.systemId, G.profile.station).length; return `${G.profile.story?.unread ? 'Neue Nachricht · ' : ''}Aufträge · ${n} Angebot${n === 1 ? '' : 'e'}`; } },
};
const cssColor = c => `rgb(${c.map(v => Math.min(255, Math.round(v * 115))).join(',')})`;

const ctx = () => {
  const p = G.profile, i = p.station, def = G.stations[i].def;
  return { p, def, m: marketFor(p, G.systemId, i, def) };
};

export function openStation(msgs = []) {
  const seized = customsAtDock(), fine = payFine();
  yardTab = null;                 // each visit the yard opens on service
  const dmg = hullOf(G.profile) < 1 ? `Hülle ${hullPct(G.profile)} % · Reparatur in der Werft` : '';
  note = [seized, fine, ...msgs, dmg].filter(Boolean).join(' · ') || 'Schilde aufgeladen · Spielstand gespeichert';
  if (seized || fine) saveProfile(G.profile);
  root().hidden = false;
  setView(msgs.length ? 'jobs' : 'hangar');
  maybePromotion(ctx().def.name);
}

function setView(v) {
  view = v;
  if (v !== 'hangar' && v !== 'backroom' && v !== 'bouncer') tab = v;
  const spot = v === 'backroom' || v === 'bouncer' ? 'jobs' : v;   // the back room lies behind the bar
  focusHangar(v === 'hangar' ? null : spot);
  v === 'hangar' ? stopMusic() : startMusic(spot);   // waltz in the yard as in Elite, a band in the bar, disco at the market
  render();
}

addEventListener('keydown', e => {
  if (e.key !== 'Escape' || root().hidden || view === 'hangar') return;
  if (document.querySelector('#galaxy:not([hidden]), #settings:not([hidden])')) return;
  setView(view === 'backroom' || view === 'bouncer' ? 'jobs' : 'hangar');
});
export function closeStation() { root().hidden = true; document.querySelector('.buy-confirm')?.remove(); stopMusic(); }

function hubHtml(def) {
  return `
  <div class="st-hub" style="--tint:${def.hex}">
    <header class="hub-top glass">
      <div class="st-title">
        <p class="eyebrow">${def.kind} · System ${G.system.name}</p>
        <h2>${def.name}</h2>
        <p class="st-flavor">Landeplatz 07 · ${FLAVOR[def.econ] || FLAVOR.hightech}</p>
        ${def.bh ? '<p class="st-flavor bh-note">Schwarzes Loch in der Nähe · bessere Preise</p>' : ''}
      </div>
      <div class="st-stats">
        <div><span class="label">Credits</span><b data-k="credits"></b></div>
        <div><span class="label">Fracht</span><b data-k="cargo"></b></div>
        <div><span class="label">Rang</span><b>${rankOf(G.profile).name}</b></div>
        ${hullOf(G.profile) < 1 ? `<div class="hull-stat"><span class="label">Hülle</span><b>${hullPct(G.profile)} %</b></div>` : ''}
      </div>
    </header>
    <div class="hub-bottom">
      <nav class="hub-exits" aria-label="Bereiche der Station">
    ${[...DOORS].reverse().map(d => `
    <button type="button" class="exit" data-go="${d.key}" style="--c:${cssColor(d.color)}">
      <b>${EXIT_INFO[d.key].title}</b><small>${EXIT_INFO[d.key].sub()}</small>
    </button>`).join('')}
      </nav>
      <p class="st-note" data-k="note"></p>
      <footer class="st-foot glass">
        <button type="button" class="ghost" data-act="map">Sternenkarte</button>
        <button type="button" class="ghost" data-act="settings" aria-label="Einstellungen">⚙</button>
        <button type="button" class="primary" data-act="undock">Abdocken</button>
      </footer>
    </div>
  </div>`;
}

function render() {
  const { def } = ctx();
  if (view === 'hangar') {
    root().innerHTML = hubHtml(def);
    bind();
    refresh();
    return;
  }
  if (view === 'backroom' && !backroomOpen()) view = 'bouncer';
  if (view === 'bouncer' || view === 'backroom') {
    root().innerHTML = view === 'bouncer' ? bouncerViewHtml(def) : backroomViewHtml(def);
    bind();
    refresh();
    return;
  }
  root().innerHTML = `
  <div class="panel st-panel" style="--tint:${def.hex}">
    <header class="st-head">
      <button type="button" class="ghost small back" data-act="hangar" aria-label="Zurück in den Hangar">‹ Hangar</button>
      <div class="st-title">
        <p class="eyebrow">${def.kind} · System ${G.system.name}</p>
        <h2>${def.name}</h2>
        <p class="st-flavor">Landeplatz 07 · ${FLAVOR[def.econ] || FLAVOR.hightech}</p>
        ${def.bh ? '<p class="st-flavor bh-note">Schwarzes Loch in der Nähe · bessere Preise</p>' : ''}
      </div>
      <div class="st-stats">
        <div><span class="label">Credits</span><b data-k="credits"></b></div>
        <div><span class="label">Fracht</span><b data-k="cargo"></b></div>
      </div>
    </header>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" data-tab="market" aria-selected="${tab === 'market'}">Markt</button>
      <button type="button" role="tab" data-tab="yard" aria-selected="${tab === 'yard'}">Werft</button>
      <button type="button" role="tab" data-tab="jobs" aria-selected="${tab === 'jobs'}">Bar</button>
    </div>
    <section class="st-body">${tab === 'market' ? marketHtml() : tab === 'yard' ? yardHtml() : jobsHtml()}</section>
    <p class="st-note" data-k="note"></p>
    <footer class="st-foot">
      <button type="button" class="ghost" data-act="map">Sternenkarte</button>
      <button type="button" class="ghost" data-act="settings" aria-label="Einstellungen">⚙</button>
      <button type="button" class="primary" data-act="undock">Abdocken</button>
    </footer>
  </div>`;
  bind();
  refresh();
}

// Goods banned here belong to the back room; the market only lists them while some are aboard
function marketHtml() {
  const shown = GOODS.filter(g => !isIllegal(g.id, G.system) || (G.profile.cargo[g.id] || 0) > 0);
  return `<div class="goods">${shown.map(g => `
    <div class="good${isContraband(g.id) ? ' contra' : ''}" data-id="${g.id}">
      <div class="g-name"><b>${g.name}</b><small class="g-info"></small></div>
      <div class="g-price"><span><span class="label">Kauf</span><b class="g-buy"></b></span><span><span class="label">Verkauf</span><b class="g-sell"></b></span></div>
      <div class="g-held"><span class="label">An Bord</span><b></b></div>
      <div class="g-btns">
        <button type="button" class="qty" data-act="sell" aria-label="${g.name} verkaufen">−</button>
        <button type="button" class="qty" data-act="buy" aria-label="${g.name} kaufen">+</button>
      </div>
    </div>`).join('')}
    <button type="button" class="ghost small" data-act="sellall">Gesamte Ladung verkaufen</button>
    <p class="note">${illegalGoods(G.system).length ? `In ${G.system.name} verboten: ${illegalGoods(G.system).map(g => g.name).join(', ')}. Sie stehen nur im Markt, solange du welche an Bord hast: Der Zoll nimmt sie gegen eine kleine Fundprämie, das Hinterzimmer der Bar zahlt mehr (ab Rang ${RANKS[RANK_GATE.backroom].name}).` : `${G.system.name} ist gesetzlos: Waffen und Narkotika werden offen gehandelt.`}</p>
  </div>`;
}

// The back room behind the bar: its own room, a picture of a card game with the menu over it.
// Banned goods at a premium (only where they are banned) and shady jobs.
function blackMarketHtml() {
  const list = illegalGoods(G.system);
  if (!list.length) return '<p class="note">Hier ist nichts verboten, der Schwarzmarkt hat nichts zu bieten. Krumme Geschäfte gibt es trotzdem.</p>';
  return `<h3 class="sect">Schwarzmarkt <small>hier verboten</small></h3>
    <div class="goods black">${list.map(g => `
    <div class="good contra" data-id="${g.id}" data-black="1">
      <div class="g-name"><b>${g.name}</b><small class="g-info"></small></div>
      <div class="g-price"><span><span class="label">Kauf</span><b class="g-buy"></b></span><span><span class="label">Verkauf</span><b class="g-sell"></b></span></div>
      <div class="g-held"><span class="label">An Bord</span><b></b></div>
      <div class="g-btns">
        <button type="button" class="qty" data-act="sell" aria-label="${g.name} verkaufen">−</button>
        <button type="button" class="qty" data-act="buy" aria-label="${g.name} kaufen">+</button>
      </div>
    </div>`).join('')}</div>`;
}

// The bouncer in front of the door: greenhorns are sent back to the bar
const BOUNCER_LINES = [
  'Greenhorns kommen hier nicht rein. Komm wieder, wenn du {rank} bist.',
  'Hier drin spielen Leute, die schon mal geschossen haben. Werd {rank}, dann reden wir.',
  'Privat. Für dich erst ab {rank}. Die Bar ist da hinten.',
  'Netter Versuch, Kadett. Ab {rank} vielleicht. Vielleicht.',
];
function bouncerViewHtml(def) {
  const p = G.profile, need = RANKS[RANK_GATE.backroom], r = rankOf(p);
  const line = BOUNCER_LINES[Math.floor(Math.random() * BOUNCER_LINES.length)].replace('{rank}', need.name);
  return `
  <div class="backroom bouncer" style="--tint:${def.hex}">
    <img class="br-art" src="${bouncerImage()}" alt="Ein gehörnter Türsteher mit verschränkten Armen vor der Tür zum Hinterzimmer">
    <div class="panel br-panel">
      <header class="st-head">
        <button type="button" class="ghost small back" data-act="bar" aria-label="Zurück in die Bar">‹ Bar</button>
        <div class="st-title">
          <p class="eyebrow">Hinter der Bar · ${def.name}</p>
          <h2>Türsteher</h2>
        </div>
        <div class="st-stats">
          <div><span class="label">Credits</span><b data-k="credits"></b></div>
          <div><span class="label">Fracht</span><b data-k="cargo"></b></div>
        </div>
      </header>
      <blockquote class="bouncer-say">„${line}“</blockquote>
      <p class="note">Dein Rang: <b>${r.name}</b> mit ${p.score || 0} Punkten. ${need.name} ab ${need.at} Punkten. Punkte gibt es für abgeschossene Piraten, Hilfe bei Begegnungen und die Geschichte.</p>
      <p class="st-note" data-k="note"></p>
      <footer class="st-foot">
        <button type="button" class="ghost" data-act="bar">Zurück in die Bar</button>
        <button type="button" class="primary" data-act="undock">Abdocken</button>
      </footer>
    </div>
  </div>`;
}

function backroomViewHtml(def) {
  const p = G.profile;
  const offers = backroomOffersFor(G.systemId, p.station);
  const board = offers.map(o => offerHtml(o)).join('');
  return `
  <div class="backroom" style="--tint:${def.hex}">
    <img class="br-art" src="${backroomImage()}" alt="Hinterzimmer: Menschen und zwielichtige Außerirdische beim Kartenspiel">
    <div class="panel br-panel">
      <header class="st-head">
        <button type="button" class="ghost small back" data-act="bar" aria-label="Zurück in die Bar">‹ Bar</button>
        <div class="st-title">
          <p class="eyebrow">Hinter der Bar · ${def.name}</p>
          <h2>Hinterzimmer</h2>
          <p class="st-flavor">Karten auf dem Tisch, keiner fragt nach Namen</p>
        </div>
        <div class="st-stats">
          <div><span class="label">Credits</span><b data-k="credits"></b></div>
          <div><span class="label">Fracht</span><b data-k="cargo"></b></div>
        </div>
      </header>
      <section class="st-body">
        <div class="jobs">
          ${blackMarketHtml()}
          <h3 class="sect">Krumme Geschäfte <small>${p.missions.length}/${MAX_ACTIVE} Aufträge</small></h3>
          ${board || '<p class="note">Heute will keiner etwas loswerden. Später wiederkommen.</p>'}
          <p class="note">Verbotene Ware, Diebesgut und versteckte Passagiere: Beim Anflug auf eine Station kann der Zoll scannen${p.upgrades.hold ? ', dein Schmuggelfach verbirgt sie meistens' : ''}. Erwischt: Strafe, und beim nächsten Andocken in diesem System ist alles weg. In gesetzlosen Systemen scannt niemand.</p>
        </div>
      </section>
      <p class="st-note" data-k="note"></p>
      <footer class="st-foot">
        <button type="button" class="ghost" data-act="map">Sternenkarte</button>
        <button type="button" class="ghost" data-act="settings" aria-label="Einstellungen">⚙</button>
        <button type="button" class="primary" data-act="undock">Abdocken</button>
      </footer>
    </div>
  </div>`;
}

// Björn: the yard is split into tabs: service, ships, weapons and other equipment
const WEAPON_UPS = new Set(['laser', 'rail', 'missile', 'rear', 'magazine', 'aim']);
const YARD_TABS = [
  { id: 'service', label: 'Wartung', sub: 'Reparatur · Tanken' },
  { id: 'ships', label: 'Schiffe', sub: 'Kaufen · Tauschen' },
  { id: 'weapons', label: 'Waffen', sub: 'Laser · Raketen' },
  { id: 'gear', label: 'Ausrüstung', sub: 'Antrieb · Schild' },
];
let yardTab = null;
function yardHtml() {
  const { p } = ctx();
  if (!yardTab) yardTab = 'service';
  const t = yardTab;
  const page = t === 'ships' ? shipsHtml(p) : t === 'weapons' ? upgradesHtml(p, u => WEAPON_UPS.has(u.id))
    : t === 'gear' ? upgradesHtml(p, u => !WEAPON_UPS.has(u.id)) : serviceHtml(p);
  return `<div class="yard">
    <p class="note yard-hint">Dein Schiff steht im Dock: ziehen zum Drehen, mit zwei Fingern oder dem Mausrad zoomen.</p>
    <div class="yard-tabs" role="tablist">${YARD_TABS.map(y => `
      <button type="button" role="tab" data-ytab="${y.id}" aria-selected="${t === y.id}"><span>${y.label}${y.id === 'service' && damageOn() && hullOf(p) < 1 ? '<i class="dot" aria-label="Reparatur nötig"></i>' : ''}</span><small>${y.sub}</small></button>`).join('')}
    </div>
    ${page}
  </div>`;
}

function serviceHtml(p) {
  return `
    <div class="service">
      ${damageOn() ? `<div class="svc${hullOf(p) < 1 ? ' damaged' : ''}" data-svc="hull">
        <div><span class="label">Hülle</span><b data-k="hull"></b><small>${hullOf(p) < 1 ? 'Kratzer, Brandspuren und Technikschäden vom letzten Gefecht' : 'Keine Schäden'}</small></div>
        <button type="button" class="buy" data-act="repair"></button>
      </div>` : ''}
      <div class="svc" data-svc="fuel">
        <div><span class="label">Treibstoff</span><b data-k="fuel"></b><small>${fmtNum(fuelPrice())} Cr pro Lichtjahr</small></div>
        <button type="button" class="buy" data-act="refuel"></button>
      </div>
      <div class="svc" data-svc="ammo">
        <div><span class="label">Munition</span><b data-k="ammo"></b><small>1 Cr für ${fmtNum(shotsPerCredit())} Schuss</small></div>
        <button type="button" class="buy" data-act="rearm"></button>
      </div>
      ${ARMS.filter(a => p.upgrades[a.needs]).map(a => `
      <div class="svc" data-svc="${a.id}">
        <div><span class="label">${a.label}</span><b data-k="${a.id}"></b><small>${soldHere(ARMS_SOLD[a.id]) ? `${fmtNum(a.unit())} Cr pro ${a.per}` : `Nur auf ${econList(ARMS_SOLD[a.id])}-Stationen`}</small></div>
        <button type="button" class="buy" data-act="arms" data-id="${a.id}"></button>
      </div>`).join('')}
    </div>
    <div class="ship-stats">
      <div><span class="label">Schiff</span><b>${shipDef(p).name} · ${shipDef(p).role}</b></div>
      <div><span class="label">Laderaum</span><b>${capacity(p)} t</b></div>
      <div><span class="label">Schild</span><b>${maxShield(p)}</b></div>
      ${damageOn() ? `<div><span class="label">Hülle</span><b>${hullPct(p)} % von ${shipDef(p).hull}</b></div>` : ''}
      <div><span class="label">Magazin</span><b>${maxAmmo(p)}</b></div>
      <div><span class="label">Hyperantrieb</span><b>${hasHyper(p) ? `Klasse ${p.upgrades.hyper} · ${fmtLY(hyperRange(p))}` : 'keiner'}</b></div>
      <div><span class="label">Waffen</span><b>${[p.upgrades.laser ? 'Puls Mk II' : 'Laser', p.upgrades.rail && 'Railgun', p.upgrades.missile && 'Raketen'].filter(Boolean).join(', ')}</b></div>
      <div><span class="label">Zielcomputer</span><b>${p.upgrades.aim ? 'eingebaut' : 'keiner'}</b></div>
      <div><span class="label">Rang</span><b>${rankOf(p).name} · ${p.score || 0} P.</b></div>
      <div><span class="label">Abschüsse</span><b>${p.kills}</b></div>
    </div>`;
}

function shipsHtml(p) {
  return `
    <h3 class="sect">Schiffe <small>Inzahlungnahme ${fmt(tradeIn(p))} Cr</small></h3>
    ${SHIPS.map(sh => {
      const own = sh.id === shipDef(p).id, here = soldHere(sh.sold), cost = shipCost(p, sh), why = shipBlock(p, sh);
      const label = own ? 'Dein Schiff' : !here ? 'Nicht hier' : why || `${fmt(cost)} Cr`;
      return `<div class="upgrade ship-offer${own || here ? '' : ' elsewhere'}" data-ship="${sh.id}">
        <div><b>${sh.name} · ${sh.role}</b><small>${sh.desc} Laderaum ${sh.cargo} t, Schild ${sh.shield}, Hülle ${sh.hull}, bis ${sh.flight.maxSpeed} m/s · Neupreis ${fmt(sh.price)} Cr${own || here ? '' : ` · erhältlich auf ${econList(sh.sold)}-Stationen`}</small></div>
        <button type="button" class="buy" data-act="ship" ${own || !here || why || p.credits < cost ? 'disabled' : ''}>${label}</button>
      </div>`;
    }).join('')}
    <p class="note">Ausbauten, Munition und Treibstoff wandern auf das neue Schiff mit.</p>`;
}

function upgradesHtml(p, pick) {
  return `
    <h3 class="sect">Ausbauten dieser Werft</h3>
    ${UPGRADES.filter(pick).sort((a, b) => (soldHere(upgradeSold(b, p.upgrades[b.id] || 0)) && lawOk(b)) - (soldHere(upgradeSold(a, p.upgrades[a.id] || 0)) && lawOk(a))).map(u => {
      const lvl = p.upgrades[u.id] || 0, maxed = lvl >= u.max, price = upgradePrice(u, lvl), sold = upgradeSold(u, lvl), here = soldHere(sold) && lawOk(u);
      const step = u.levels?.[Math.min(lvl, u.max - 1)], name = step?.name || u.name, desc = maxed && u.levels ? `${name} eingebaut` : step?.desc || u.desc;
      const label = maxed ? (u.max === 1 ? 'Eingebaut' : 'Maximum') : here ? fmt(price) + ' Cr' : 'Nicht hier';
      return `<div class="upgrade${here || maxed ? '' : ' elsewhere'}" data-id="${u.id}">
        <div><b>${maxed && u.levels ? u.name : name}</b><small>${desc} · Stufe ${lvl}/${u.max}${here || maxed ? '' : u.lawless ? ' · erhältlich in gesetzlosen Systemen (Piraten hoch)' : ` · erhältlich auf ${econList(sold)}-Stationen`}</small></div>
        <button type="button" class="buy" data-act="upgrade" ${maxed || !here || p.credits < price ? 'disabled' : ''}>${label}</button>
      </div>`;
    }).join('')}`;
}

// The story: chapter, the latest texts, the next goal, and the choice when it comes
const esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function storyHtml() {
  const p = G.profile, s = p.story, st = storyStep();
  if (!s || !st) return '';
  const fresh = s.unread;
  s.unread = false;
  const entries = s.log.filter(e => e.ch === st.ch);
  const older = s.log.filter(e => !entries.includes(e));
  const line = e => `<p class="story-line"><b>${esc(e.from)}</b>${esc(e.text)}</p>`;
  return `<section class="story${fresh ? ' fresh' : ''}">
    <p class="eyebrow">Geschichte · ${st.type === 'end' ? 'Ende' : `Kapitel ${st.ch} von 6`}${fresh ? ' · neu' : ''}</p>
    <h3>${CHAPTERS[st.ch]}</h3>
    ${entries.slice(-4).map(line).join('')}
    ${st.type === 'choice' ? `<div class="story-choice">${st.options.map((o, i) => `
      <button type="button" class="buy" data-story="${i}"><b>${o.label}</b><small>${o.desc}</small></button>`).join('')}</div>`
      : st.type !== 'end' ? `<p class="story-goal">Ziel: ${storyGoal()}</p>` : ''}
    ${older.length ? `<details class="story-old"><summary>Bisherige Geschichte</summary>${older.map(line).join('')}</details>` : ''}
  </section>`;
}

const fmtMin = s => s >= 60 ? `${Math.floor(s / 60)} min` : `${Math.max(0, Math.round(s))} s`;
const riskChip = r => `<span class="risk r${r}">Risiko ${RISK[r]}</span>`;

function offerHtml(o) {
  const why = blockReason(o);
  const where = o.to ? `${SYSTEMS[o.to.sys].name}${o.hops ? ` · ${o.hops} Sprung${o.hops > 1 ? 'e' : ''}` : ' · dieses System'}`
    : `${SYSTEMS[(o.target || o.search).sys].name}${o.hops ? ' · 1 Sprung' : ' · dieses System'}`;
  return `
    <div class="job" data-id="${o.id}">
      <div class="job-top"><span class="job-type t-${o.type}">${TYPE_LABEL[o.type]}</span>${riskChip(o.risk)}<span class="job-pay">${fmt(o.reward)} Cr</span></div>
      <b>${o.title}</b>
      <p>${o.desc}</p>
      <div class="job-facts"><span>${where}</span><span>Frist ${fmtMin(o.deadline)}</span>${o.tons ? `<span>${o.tons} t ${o.type === 'fugitive' ? 'Platz' : 'Fracht'}</span>` : ''}</div>
      <button type="button" class="buy" data-act="accept" ${why ? 'disabled' : ''}>${why || 'Annehmen'}</button>
    </div>`;
}

// The door to the back room; the bouncer only lets in pilots from the third rank on
function backroomDoorHtml(p) {
  if (!backroomOpen(p)) return `
    <button type="button" class="br-door locked" data-act="backroom">
      <span class="br-door-ico" aria-hidden="true">♠</span>
      <span><b>Hinterzimmer</b><small>Für Greenhorns geschlossen · erst ab Rang ${RANKS[RANK_GATE.backroom].name}</small></span>
      <span class="br-door-go" aria-hidden="true">🔒</span>
    </button>`;
  const n = backroomOffersFor(G.systemId, p.station).length;
  return `
    <button type="button" class="br-door" data-act="backroom">
      <span class="br-door-ico" aria-hidden="true">♠</span>
      <span><b>Hinterzimmer</b><small>${illegalGoods(G.system).length ? 'Schwarzmarkt und krumme Geschäfte' : 'Krumme Geschäfte'} · ${n} Angebot${n === 1 ? '' : 'e'}</small></span>
      <span class="br-door-go" aria-hidden="true">›</span>
    </button>`;
}

function jobsHtml() {
  const p = G.profile, { def } = ctx();
  const offers = offersFor(G.systemId, p.station);
  const active = p.missions.map(m => `
    <div class="job active" data-id="${m.id}">
      <div class="job-top"><span class="job-type t-${m.type}">${TYPE_LABEL[m.type]}</span>${riskChip(m.risk)}<span class="job-pay">${fmt(m.reward)} Cr</span></div>
      <b>${m.title}</b>
      <div class="job-facts"><span>Ziel: ${missionGoal(m)}</span><span>Frist: ${fmtMin(m.due - p.playTime)} Flugzeit</span>${m.type === 'search' && m.collected ? '<span class="ok">Blackbox an Bord</span>' : ''}</div>
      <button type="button" class="ghost small" data-act="abandon">Auftrag abbrechen</button>
    </div>`).join('');
  const board = offers.map(o => offerHtml(o)).join('');
  return `<div class="jobs">
    ${storyHtml()}
    <h3 class="sect">Deine Aufträge <small>${p.missions.length}/${MAX_ACTIVE}</small></h3>
    ${active || '<p class="note">Keine laufenden Aufträge.</p>'}
    <h3 class="sect">Auftragsbrett ${def.name}</h3>
    ${jobsOpen() ? '' : `<p class="note gate">Die Vermittlung gibt Aufträge erst an Piloten ab Rang <b>${RANKS[RANK_GATE.jobs].name}</b> heraus. Rangpunkte gibt es für abgeschossene Piraten, Hilfe bei Begegnungen und die Geschichte.</p>`}
    ${board || '<p class="note">Im Moment keine Angebote. Später wiederkommen.</p>'}
    <p class="note">Fristen zählen nur Flugzeit. Kopfgeldziele zahlen beim Abschuss, Lieferungen und Bergungen beim Andocken am Ziel.</p>
    ${backroomDoorHtml(p)}
  </div>`;
}

// Shipyard prices after the advanced settings
const fuelPrice = () => HYPER.fuelPrice * rules().supplies;
const shotsPerCredit = () => AMMO.perCredit / rules().supplies;
const upgradePrice = (u, lvl) => Math.round((u.levels?.[lvl]?.price ?? u.price * (lvl + 1)) * rules().yard / 10) * 10;
// Higher classes of a part can be sold at fewer shipyards
const upgradeSold = (u, lvl) => u.levels?.[Math.min(lvl, u.max - 1)]?.sold || u.sold;
// Ships: the old one is traded in; the new one keeps upgrades, ammunition and fuel
// A damaged ship is worth its repair less
const tradeIn = p => Math.max(0, Math.round((shipDef(p).price * TRADE_IN * rules().yard - repairCost(p)) / 10) * 10);
const shipCost = (p, sh) => Math.max(0, Math.round(sh.price * rules().yard / 10) * 10 - tradeIn(p));
function shipBlock(p, sh) {
  if (p.credits < shipCost(p, sh)) return '';
  const extra = 10 * p.upgrades.cargo;
  if (cargoUsed(p) > sh.cargo + extra) return `Erst Ladung verkaufen (${sh.cargo + extra} t)`;
  return '';
}
function buyShip(id) {
  const { p } = ctx();
  const sh = SHIPS.find(x => x.id === id), cost = shipCost(p, sh);
  if (!sh || sh.id === p.ship || !soldHere(sh.sold) || shipBlock(p, sh) || p.credits < cost) return false;
  p.credits -= cost;
  p.ship = sh.id;
  p.hull = 1;
  attachPlayerModel();
  refreshHangarShip();
  G.player.shield = maxShield(p);
  note = `Neues Schiff: ${sh.name} (${sh.role})`;
  return true;
}
// What this station's shipyard sells depends on its economy
const ECON_SHORT = { agrar: 'Agrar', industrie: 'Industrie', bergbau: 'Bergbau', hightech: 'Hightech' };
const soldHere = list => !list || list.includes(ctx().def.econ);
// Parts for the shady side (smuggling hold) only in lawless systems
const lawOk = u => !u.lawless || G.system.danger >= LAWLESS;
const econList = list => list.map(e => ECON_SHORT[e]).join('-, ').replace(/-, ([^,]*)$/, '- und $1');

// Railgun slugs and missiles
const ARMS = [
  { id: 'slugs', needs: 'rail', label: 'Railgun-Munition', per: 'Schuss', max: () => RAIL.magazine, unit: () => RAIL.price * rules().supplies,
    get: p => p.slugs, add: (p, n) => { p.slugs += n; } },
  { id: 'missiles', needs: 'missile', label: 'Raketen', per: 'Rakete', max: () => MISSILE.rack, unit: () => MISSILE.price * rules().supplies,
    get: p => p.missiles, add: (p, n) => { p.missiles += n; } },
];
function armsQuote(p, a) {
  const need = Math.max(0, a.max() - a.get(p)), unit = Math.max(1, Math.round(a.unit()));
  const n = Math.min(need, Math.floor(p.credits / unit));
  return { need, n, cost: n * unit };
}
function rearmArms(id) {
  const { p } = ctx(), a = ARMS.find(x => x.id === id), q = armsQuote(p, a);
  if (!soldHere(ARMS_SOLD[id]) || q.need <= 0 || q.n <= 0) return false;
  a.add(p, q.n);
  p.credits -= q.cost;
  note = `${q.n} ${a.label} geladen für ${fmt(q.cost)} Cr`;
  return true;
}

const fmtNum = v => (Math.round(v * 10) / 10).toString().replace('.', ',');

// What a full refill would cost, and what the player can afford right now
function fuelQuote(p) {
  const need = hasHyper(p) ? Math.max(0, hyperRange(p) - p.fuel) : 0;
  const ly = Math.min(need, p.credits / fuelPrice());
  return { need, ly, cost: Math.ceil(ly * fuelPrice() - 1e-9) };
}
function ammoQuote(p) {
  const need = Math.max(0, maxAmmo(p) - p.ammo);
  const rounds = Math.min(need, Math.floor(p.credits * shotsPerCredit()));
  return { need, rounds, cost: Math.ceil(rounds / shotsPerCredit()) };
}

function refresh() {
  const { p, def, m } = ctx();
  const el = root();
  el.querySelector('[data-k="credits"]').textContent = fmt(p.credits) + ' Cr';
  const used = cargoUsed(p), cap = capacity(p);
  el.querySelector('[data-k="cargo"]').textContent = `${used}/${cap} t`;
  el.querySelector('[data-k="note"]').textContent = note;
  const sellAllBtn = el.querySelector('[data-act="sellall"]');
  if (sellAllBtn) sellAllBtn.disabled = !Object.keys(p.cargo).some(id => !isIllegal(id, G.system));
  el.querySelectorAll('.good').forEach(row => {
    const id = row.dataset.id, it = marketItem(m, id), f = def.baseFactors[id], held = p.cargo[id] || 0;
    row.querySelector('.g-held b').textContent = held + ' t';
    if (row.dataset.black) {
      const bp = blackBuyPrice(def, m, id);
      row.querySelector('.g-buy').textContent = bp;
      row.querySelector('.g-sell').textContent = blackSellPrice(def, m, id);
      row.querySelector('.g-info').textContent = `Unter der Theke ${it.black} t`;
      row.querySelector('[data-act="buy"]').disabled = it.black <= 0 || p.credits < bp || used >= cap;
      row.querySelector('[data-act="sell"]').disabled = held <= 0;
      return;
    }
    if (isIllegal(id, G.system)) {     // banned here: no buying, but customs takes it for a finder's fee
      row.querySelector('.g-buy').textContent = '–';
      row.querySelector('.g-sell').textContent = customsFee(id);
      row.querySelector('.g-info').textContent = backroomOpen() ? 'Verboten · Zoll zahlt Fundprämie, Hinterzimmer mehr' : 'Verboten · beim Zoll abgeben gegen Fundprämie';
      row.dataset.tag = 'verboten';
      row.querySelector('[data-act="buy"]').disabled = true;
      row.querySelector('[data-act="sell"]').disabled = held <= 0;
      return;
    }
    const bp = buyPrice(def, m, id), sp = sellPrice(def, m, id);
    row.querySelector('.g-buy').textContent = bp;
    row.querySelector('.g-sell').textContent = sp;
    const tag = f < 0.85 ? 'Erzeugnis' : f > 1.2 ? 'gefragt' : '';
    row.querySelector('.g-info').textContent = `Lager ${it.stock} t${tag ? ' · ' + tag : ''}${isContraband(id) ? ' · hier erlaubt' : ''}`;
    row.dataset.tag = tag;
    row.querySelector('[data-act="buy"]').disabled = it.stock <= 0 || p.credits < bp || used >= cap;
    row.querySelector('[data-act="sell"]').disabled = held <= 0;
  });
  const fuelEl = el.querySelector('[data-k="fuel"]');
  if (fuelEl) {
    fuelEl.textContent = `${fmtLY(p.fuel)} / ${fmtLY(hyperRange(p))}`;
    const fq = fuelQuote(p), fb = el.querySelector('[data-act="refuel"]');
    fb.disabled = fq.need < 0.05 || fq.ly < 0.05;
    fb.textContent = !hasHyper(p) ? 'Kein Antrieb' : fq.need < 0.05 ? 'Voll' : fq.ly < fq.need - 1e-6 ? `${fmtLY(fq.ly)} · ${fmt(fq.cost)} Cr` : `Volltanken · ${fmt(fq.cost)} Cr`;
    const hq = repairQuote(p), hb = el.querySelector('[data-act="repair"]');
    if (hb) el.querySelector('[data-k="hull"]').textContent = `${hullPct(p)} %`;
    if (hb) hb.disabled = hq.need <= 0 || hq.w <= 0;
    if (hb) hb.textContent = hq.need <= 0 ? 'Intakt' : hq.w < hq.need - 1e-6 ? `Teilweise · ${fmt(hq.cost)} Cr` : `Reparieren · ${fmt(hq.cost)} Cr`;
    el.querySelector('[data-k="ammo"]').textContent = `${p.ammo} / ${maxAmmo(p)}`;
    const aq = ammoQuote(p), ab = el.querySelector('[data-act="rearm"]');
    ab.disabled = aq.need <= 0 || aq.rounds <= 0;
    for (const a of ARMS) {
      const b = el.querySelector(`[data-act="arms"][data-id="${a.id}"]`);
      if (!b) continue;
      const q = armsQuote(p, a), here = soldHere(ARMS_SOLD[a.id]);
      el.querySelector(`[data-k="${a.id}"]`).textContent = `${a.get(p)} / ${a.max()}`;
      b.disabled = !here || q.need <= 0 || q.n <= 0;
      b.textContent = !here ? 'Nicht hier' : q.need <= 0 ? 'Voll' : q.n < q.need ? `${q.n} · ${fmt(q.cost)} Cr` : `Auffüllen · ${fmt(q.cost)} Cr`;
    }
    ab.textContent = aq.need <= 0 ? 'Voll' : aq.rounds < aq.need ? `${aq.rounds} Schuss · ${fmt(aq.cost)} Cr` : `Auffüllen · ${fmt(aq.cost)} Cr`;
  }
}

function buy(id, black) {
  const { p, def, m } = ctx();
  const it = marketItem(m, id);
  if (black) {
    const price = blackBuyPrice(def, m, id);
    if (it.black <= 0 || p.credits < price || cargoUsed(p) >= capacity(p)) return false;
    p.credits -= price;
    it.black--;
    p.cargo[id] = (p.cargo[id] || 0) + 1;
    note = `${goodById(id).name} unter der Theke gekauft für ${price} Cr`;
    return true;
  }
  if (isIllegal(id, G.system)) return false;
  const price = buyPrice(def, m, id);
  if (it.stock <= 0 || p.credits < price || cargoUsed(p) >= capacity(p)) return false;
  p.credits -= price;
  it.stock--;
  p.cargo[id] = (p.cargo[id] || 0) + 1;
  note = `${goodById(id).name} gekauft für ${price} Cr`;
  return true;
}

// Customs pays a quarter of the base price for banned goods handed over (no questions asked)
const customsFee = id => Math.round(goodById(id).base * CUSTOMS_FEE);
function sell(id, black, all) {
  const { p, def, m } = ctx();
  if (!p.cargo[id]) return false;
  if (black) {
    const price = blackSellPrice(def, m, id);
    p.credits += price;
    marketItem(m, id).black++;
    if (--p.cargo[id] <= 0) delete p.cargo[id];
    note = `${goodById(id).name} im Hinterzimmer verkauft für ${price} Cr`;
    return true;
  }
  if (isIllegal(id, G.system)) {
    if (all) return false;           // "sell everything" never hands contraband over
    const fee = customsFee(id);
    p.credits += fee;
    if (--p.cargo[id] <= 0) delete p.cargo[id];
    note = `${goodById(id).name} beim Zoll abgegeben · Fundprämie ${fee} Cr`;
    return true;
  }
  const price = sellPrice(def, m, id);
  p.credits += price;
  marketItem(m, id).stock++;
  if (--p.cargo[id] <= 0) delete p.cargo[id];
  note = `${goodById(id).name} verkauft für ${price} Cr`;
  return true;
}

function sellAll() {
  const { p } = ctx();
  let total = 0;
  for (const id of Object.keys(p.cargo)) {
    while (p.cargo[id]) { const before = p.credits; if (!sell(id, false, true)) break; total += p.credits - before; }
  }
  note = `Ladung verkauft für ${fmt(total)} Cr${contrabandHeld(p) ? ' · verbotene Ware bleibt an Bord' : ''}`;
}

const contrabandHeld = p => Object.keys(p.cargo).some(id => isIllegal(id, G.system));

function refuel() {
  const { p } = ctx();
  const q = fuelQuote(p);
  if (q.need < 0.05 || q.ly < 0.05) return false;
  p.fuel = Math.min(hyperRange(p), p.fuel + q.ly);
  p.credits = Math.max(0, p.credits - q.cost);
  note = `${fmtLY(q.ly)} getankt für ${q.cost} Cr`;
  return true;
}

function repair() {
  const { p } = ctx();
  const before = hullPct(p), cost = repairHull(p);
  if (!cost) return false;
  note = hullOf(p) >= 1 ? `Hülle repariert für ${fmt(cost)} Cr` : `Hülle teilweise repariert (${before} → ${hullPct(p)} %) für ${fmt(cost)} Cr`;
  attachPlayerModel();       // the marks come off the ship
  refreshHangarShip();
  return true;
}

function rearm() {
  const { p } = ctx();
  const q = ammoQuote(p);
  if (q.need <= 0 || q.rounds <= 0) return false;
  p.ammo += q.rounds;
  p.credits = Math.max(0, p.credits - q.cost);
  note = `${q.rounds} Schuss geladen für ${q.cost} Cr`;
  return true;
}

function buyUpgrade(id) {
  const { p } = ctx();
  const u = UPGRADES.find(x => x.id === id), lvl = p.upgrades[id] || 0, price = upgradePrice(u, lvl);
  if (lvl >= u.max || !soldHere(upgradeSold(u, lvl)) || !lawOk(u) || p.credits < price) return false;
  p.credits -= price;
  p.upgrades[id] = lvl + 1;
  if (id === 'shield') G.player.shield = maxShield(p);
  if (id === 'hyper') p.fuel = hyperRange(p);
  if (id === 'rail') { p.slugs = Math.max(p.slugs || 0, RAIL.magazine); p.weapon = 'rail'; }
  if (id === 'missile') { p.missiles = Math.max(p.missiles || 0, MISSILE.rack); p.weapon = 'missile'; }
  note = `${u.levels?.[lvl]?.name || u.name} eingebaut`;
  attachPlayerModel();       // the new part shows on the ship
  refreshHangarShip();
  return true;
}

// Confirmation before buying a ship or a part: what it is, what it costs, what is left
function upgradeConfirm(id) {
  const p = G.profile, u = UPGRADES.find(x => x.id === id), lvl = p.upgrades[id] || 0, price = upgradePrice(u, lvl);
  const step = u.levels?.[lvl], name = step?.name || u.name;
  return { title: `${name} einbauen?`, desc: step?.desc || u.desc,
    rows: [['Preis', `${fmt(price)} Cr`], ['Danach übrig', `${fmt(p.credits - price)} Cr`]], ok: `Kaufen · ${fmt(price)} Cr` };
}
function shipConfirm(id) {
  const p = G.profile, sh = SHIPS.find(x => x.id === id), cost = shipCost(p, sh), now = shipDef(p);
  return { title: `${sh.name} kaufen?`, desc: `${sh.role}: Laderaum ${sh.cargo} t, Schild ${sh.shield}, Hülle ${sh.hull}. Ausbauten, Munition und Treibstoff wandern mit.`,
    rows: [['Neupreis', `${fmt(Math.round(sh.price * rules().yard / 10) * 10)} Cr`], [`Inzahlungnahme ${now.name}`, `− ${fmt(tradeIn(p))} Cr`], ['Zu zahlen', `${fmt(cost)} Cr`], ['Danach übrig', `${fmt(p.credits - cost)} Cr`]],
    ok: `Kaufen · ${fmt(cost)} Cr` };
}
function confirmBuy(q, yes) {
  document.querySelector('.buy-confirm')?.remove();
  const box = document.createElement('div');
  box.className = 'buy-confirm';
  box.innerHTML = `
    <div class="buy-card" role="alertdialog" aria-modal="true" aria-labelledby="buy-h">
      <h3 id="buy-h">${q.title}</h3>
      <p class="note">${q.desc}</p>
      <dl>${q.rows.map(([k, v], i) => `<div${i === q.rows.length - 2 || q.rows.length === 2 && i === 0 ? ' class="sum"' : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="buy-acts">
        <button type="button" class="ghost" data-c="no">Abbrechen</button>
        <button type="button" class="primary" data-c="yes">${q.ok}</button>
      </div>
    </div>`;
  const close = () => { box.remove(); removeEventListener('keydown', onKey, true); };
  const onKey = e => {
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); }
    else if (e.key === 'Enter') { e.stopImmediatePropagation(); e.preventDefault(); close(); yes(); }
  };
  addEventListener('keydown', onKey, true);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelector('[data-c="no"]').addEventListener('click', close);
  box.querySelector('[data-c="yes"]').addEventListener('click', () => { close(); yes(); });
  document.body.append(box);      // outside the station panel, whose layout would trap a fixed overlay
  box.querySelector('[data-c="yes"]').focus();
}

// Press and hold repeats; keyboard activation uses the click event.
function holdRepeat(btn, fn) {
  let t1 = null, t2 = null;
  const step = () => { const ok = fn(); ok ? sfxClick() : sfxDeny(); refresh(); return ok; };
  const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; saveProfile(G.profile); };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!step()) return;
    t1 = setTimeout(() => { t2 = setInterval(() => { if (!step()) stop(); }, 80); }, 380);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener('click', e => { if (e.detail === 0) { step(); saveProfile(G.profile); } });
}

const once = (sel, fn, rerender) => {
  root().querySelector(sel)?.addEventListener('click', () => {
    if (fn()) { sfxClick(); saveProfile(G.profile); rerender ? render() : refresh(); } else sfxDeny();
  });
};

function bind() {
  const el = root();
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setView(b.dataset.tab)));
  el.querySelectorAll('[data-ytab]').forEach(b => b.addEventListener('click', () => { yardTab = b.dataset.ytab; sfxClick(); render(); }));
  el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { sfxClick(); setView(b.dataset.go); }));
  el.querySelector('[data-act="hangar"]')?.addEventListener('click', () => setView('hangar'));
  el.querySelectorAll('[data-act="bar"]').forEach(b => b.addEventListener('click', () => setView('jobs')));
  el.querySelector('[data-act="backroom"]')?.addEventListener('click', () => {
    if (!backroomOpen()) { sfxDeny(); setView('bouncer'); return; }
    sfxClick(); setView('backroom');
  });
  el.querySelectorAll('.good').forEach(row => {
    const id = row.dataset.id;
    const black = !!row.dataset.black;
    holdRepeat(row.querySelector('[data-act="buy"]'), () => buy(id, black));
    holdRepeat(row.querySelector('[data-act="sell"]'), () => sell(id, black));
  });
  once('[data-act="sellall"]', () => { sellAll(); return true; });
  once('[data-act="refuel"]', refuel, true);
  once('[data-act="rearm"]', rearm, true);
  once('[data-act="repair"]', repair, true);
  el.querySelectorAll('[data-act="arms"]').forEach(b => b.addEventListener('click', () => {
    if (rearmArms(b.dataset.id)) { sfxClick(); saveProfile(G.profile); render(); } else sfxDeny();
  }));
  // Björn: purchases on the ship are confirmed first, with the costs
  el.querySelectorAll('[data-act="ship"]').forEach(b => b.addEventListener('click', () => {
    const id = b.closest('.ship-offer').dataset.ship;
    sfxClick();
    confirmBuy(shipConfirm(id), () => {
      if (buyShip(id)) { sfxClick(); saveProfile(G.profile); render(); } else sfxDeny();
    });
  }));
  el.querySelectorAll('[data-act="upgrade"]').forEach(b => b.addEventListener('click', () => {
    const id = b.closest('.upgrade').dataset.id;
    sfxClick();
    confirmBuy(upgradeConfirm(id), () => {
      if (buyUpgrade(id)) { sfxClick(); saveProfile(G.profile); render(); } else sfxDeny();
    });
  }));
  el.querySelectorAll('[data-act="accept"]').forEach(b => b.addEventListener('click', () => {
    const id = b.closest('.job').dataset.id;
    const o = [...offersFor(G.systemId, G.profile.station), ...backroomOffersFor(G.systemId, G.profile.station)].find(x => x.id === id);
    if (o && accept(o)) { note = `Angenommen: ${o.title}`; sfxClick(); saveProfile(G.profile); render(); } else sfxDeny();
  }));
  el.querySelectorAll('[data-story]').forEach(b => b.addEventListener('click', () => {
    if (storyChoose(+b.dataset.story)) { note = `Entschieden: ${b.querySelector('b').textContent}`; sfxClick(); render(); } else sfxDeny();
  }));
  el.querySelectorAll('[data-act="abandon"]').forEach(b => {
    let armed = false;
    b.addEventListener('click', () => {
      if (!armed) { armed = true; b.textContent = 'Wirklich abbrechen?'; return; }
      abandon(b.closest('.job').dataset.id);
      note = 'Auftrag abgebrochen';
      saveProfile(G.profile);
      render();
    });
  });
  el.querySelector('[data-act="map"]')?.addEventListener('click', openMap);
  el.querySelector('[data-act="settings"]')?.addEventListener('click', () => G.events.openSettings?.());
  el.querySelector('[data-act="undock"]').addEventListener('click', () => G.events.undock?.());
}
