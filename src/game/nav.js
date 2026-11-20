// Navigation targets in the current system: all stations, then story and mission points, encounters, the sun.
import { G } from '../ctx.js';
import { missionNavPoints, stationHasMission } from './missions.js';
import { encounterNavPoints } from './encounters.js';
import { sunNavPoint } from './sun.js';
import { storyNavPoints, storyStation } from './story.js';

export function navTargets() {
  const list = G.stations.map(st => ({
    kind: 'station', name: st.def.name, pos: st.pos, hex: st.def.hex, r: st.S, st,
    mission: stationHasMission(G.systemId, st.index) || storyStation(G.systemId, st.index),
  }));
  const sun = sunNavPoint();
  return list.concat(storyNavPoints(), missionNavPoints(), encounterNavPoints(), sun ? [sun] : []);
}

export function currentNav() {
  const l = navTargets();
  if (!l.length) return null;
  if (G.navTarget >= l.length) G.navTarget = 0;
  return l[G.navTarget];
}

export function cycleNav() {
  const n = navTargets().length;
  if (n) G.navTarget = (G.navTarget + 1) % n;
}

export const navLabel = t => (t.mission ? '★ ' : '') + t.name;
