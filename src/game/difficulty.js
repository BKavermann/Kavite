// Game rules from the settings screen: difficulty (pirates) and the advanced
// economy multipliers. Everything reads them through these two helpers.
import { G } from '../ctx.js';
import { DIFFICULTY, RULES_DEFAULT } from '../config.js';

export const difficulty = () => DIFFICULTY[G.settings.difficulty] || DIFFICULTY.normal;
export const rules = () => ({ ...RULES_DEFAULT, ...G.settings.rules });
