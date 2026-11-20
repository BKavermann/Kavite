import { clamp } from '../utils.js';
import { BLACKHOLE, LAWLESS, BLACK_MARKET } from '../config.js';
import { rules } from './difficulty.js';

export const GOODS = [
  { id: 'food', name: 'Nahrung', base: 12 },
  { id: 'textiles', name: 'Textilien', base: 22 },
  { id: 'minerals', name: 'Mineralien', base: 30 },
  { id: 'machinery', name: 'Maschinen', base: 62 },
  { id: 'computers', name: 'Computer', base: 92 },
  { id: 'luxuries', name: 'Luxusgüter', base: 115 },
  // Contraband: banned in systems whose danger is below illegalBelow
  { id: 'weapons', name: 'Waffen', base: 70, illegalBelow: 0.33 },
  { id: 'narcotics', name: 'Narkotika', base: 110, illegalBelow: LAWLESS },
];
export const goodById = id => GOODS.find(g => g.id === id);
export const isContraband = id => goodById(id)?.illegalBelow != null;
export const isIllegal = (id, sys) => isContraband(id) && !!sys && sys.danger < goodById(id).illegalBelow;
export const illegalGoods = sys => GOODS.filter(g => isIllegal(g.id, sys));
// Banned goods in the hold here: [{ id, q }]
export const contrabandAboard = (p, sys) => Object.entries(p.cargo).filter(([id, q]) => q > 0 && isIllegal(id, sys)).map(([id, q]) => ({ id, q }));

// factor < 1: produced here (cheap, large stock). factor > 1: in demand.
export const ECONOMIES = {
  agrar: {
    name: 'Agrarwelt', hex: '#7fe0c4', tint: [0.5, 1.8, 1.4],
    factors: { food: 0.55, textiles: 0.8, minerals: 1.35, machinery: 1.3, computers: 1.25, luxuries: 1.15, weapons: 1.4, narcotics: 0.7 },
  },
  industrie: {
    name: 'Industriewelt', hex: '#ffb347', tint: [2.0, 1.1, 0.35],
    factors: { food: 1.5, textiles: 1.25, minerals: 1.5, machinery: 0.65, computers: 0.72, luxuries: 0.92, weapons: 0.75, narcotics: 1.3 },
  },
  bergbau: {
    name: 'Bergbaukolonie', hex: '#c9a0ff', tint: [1.3, 0.8, 2.0],
    factors: { food: 1.45, textiles: 1.3, minerals: 0.6, machinery: 1.4, computers: 1.2, luxuries: 1.35, weapons: 1.3, narcotics: 1.5 },
  },
  hightech: {
    name: 'Hightech-Welt', hex: '#6fc3ff', tint: [0.5, 1.2, 2.2],
    factors: { food: 1.3, textiles: 1.1, minerals: 1.25, machinery: 0.95, computers: 0.6, luxuries: 0.7, weapons: 1.15, narcotics: 1.2 },
  },
};

// Station definitions for one system: economy factors times the system's own price mood.
export function stationDefsFor(system) {
  return system.stations.map(st => {
    const e = ECONOMIES[st.econ];
    const factors = {};
    for (const g of GOODS) {
      // Next to a black hole few traders come by: what the station makes is cheaper, what it needs pays more
      const f = e.factors[g.id], b = st.bh ? (f < 1 ? 1 / BLACKHOLE.priceBonus : BLACKHOLE.priceBonus) : 1;
      // Goods added later have no generated price mood; derive a fixed one from the ids
      const pv = system.priceVar[g.id] ?? 0.88 + 0.24 * hash01(system.id * 7.31 + g.base);
      factors[g.id] = f * b * pv;
    }
    return { ...st, kind: e.name, hex: e.hex, tint: e.tint, factors, baseFactors: e.factors };
  });
}

const hash01 = x => { const s = Math.sin(x * 12.9898) * 43758.5453; return s - Math.floor(s); };

function createItem(def, g) {
  const f = def.baseFactors[g.id];
  return { id: g.id, drift: 0.92 + Math.random() * 0.16,
    stock: f < 1 ? 35 + Math.floor(Math.random() * 25) : 4 + Math.floor(Math.random() * 10),
    ...(g.illegalBelow != null && { black: Math.floor(Math.random() * 7) }) };   // back-room stock
}

export function createMarket(def) {
  return GOODS.map(g => createItem(def, g));
}

// Saved markets from before new goods existed get the missing rows
export function completeMarket(def, m) {
  for (const g of GOODS) if (!m.some(x => x.id === g.id)) m.push(createItem(def, g));
  return m;
}

export const marketItem = (m, id) => m.find(x => x.id === id);

// Back room in the bar: banned goods at a premium, small stock
// Banned goods are always scarce there, even where the economy would make them
const blackBase = (def, m, id) => goodById(id).base * Math.max(def.factors[id], 1.15) * marketItem(m, id).drift * rules().goods;
export const blackBuyPrice = (def, m, id) => Math.round(blackBase(def, m, id) * BLACK_MARKET.buy);
export const blackSellPrice = (def, m, id) => Math.round(blackBase(def, m, id) * BLACK_MARKET.sell);

export function buyPrice(def, m, id) {
  return Math.max(1, Math.round(goodById(id).base * def.factors[id] * marketItem(m, id).drift * rules().goods));
}
export const sellPrice = (def, m, id) => Math.max(1, Math.round(buyPrice(def, m, id) * 0.9));

// Time passes: prices wander, stock drifts back toward normal.
export function rerollMarket(def, m) {
  for (const it of m) {
    it.drift = clamp(it.drift * (1 + (Math.random() - 0.5) * 0.14), 0.8, 1.25);
    const target = def.baseFactors[it.id] < 1 ? 50 : 10;
    it.stock = Math.max(0, Math.round(it.stock + (target - it.stock) * 0.35));
    if (it.black != null) it.black = Math.max(0, Math.round(it.black + (3 - it.black) * 0.4 + (Math.random() - 0.5) * 3));
  }
}

export const cargoValue = p => Object.entries(p.cargo).reduce((s, [id, q]) => s + goodById(id).base * q, 0);
