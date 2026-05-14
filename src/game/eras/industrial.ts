// =============================================================================
// Era-extension recipe — follow this for every new era after Industrial.
//
// 1. Introduce a NEW primary currency (Output for this era; later: Influence,
//    Compute, Substrate, Mass). Add it to initialState.resources.
//
// 2. Add a STORAGE BUILDING with the same pre/post-paradigm-shift pattern as
//    granaries: linear cap first, paradigm-shift project flips it to
//    exponential. Invariant: storage_cap_mult >= upgrade_cost_mult.
//
// 3. Add at least one GLOBAL MULTIPLIER project so prior eras' production
//    stays relevant when this era's costs balloon.
//
// 4. Wire the era's tick into src/game/tick.ts. Earlier eras keep ticking
//    (their resources feed the new economy).
// =============================================================================

import { get } from 'svelte/store';
import { game, spend, logEvent } from '../game';

export interface IndustrialUpgrade {
  id: string;
  name: string;
  desc: string;
  cost: (level: number) => { grain?: number; output?: number };
  effect: string;
  max?: number;
}

export const industrialUpgrades: IndustrialUpgrade[] = [
  {
    id: 'factory',
    name: 'Steam Factory',
    desc: 'Consumes 2 grain/sec, produces 1 output/sec.',
    cost: (lvl) => ({ grain: Math.ceil(500 * Math.pow(1.3, lvl)) }),
    effect: '+1 output/sec',
  },
];

export function outputPerSec(s = get(game)): number {
  return s.upgrades.factory ?? 0;
}

export function grainDrainPerSec(s = get(game)): number {
  return (s.upgrades.factory ?? 0) * 2;
}

export function buyIndustrialUpgrade(id: string) {
  const s = get(game);
  const def = industrialUpgrades.find(u => u.id === id);
  if (!def) return;
  const lvl = s.upgrades[id] ?? 0;
  if (def.max && lvl >= def.max) return;
  const cost = def.cost(lvl);
  if (cost.grain !== undefined && !spend('grain', cost.grain)) return;
  if (cost.output !== undefined && !spend('output', cost.output)) return;
  game.update(s => ({
    ...s,
    upgrades: { ...s.upgrades, [id]: lvl + 1 },
  }));
  if (lvl === 0) logEvent(`First ${def.name.toLowerCase()} built.`);
}

export function tickIndustrial(dt: number) {
  const s = get(game);
  const factories = s.upgrades.factory ?? 0;
  if (factories <= 0) return;

  const grainNeeded = factories * 2 * dt;
  const grainAvail = s.resources.grain ?? 0;
  const grainUsed = Math.min(grainNeeded, grainAvail);
  const factoriesRunning = grainUsed / (2 * dt || 1);
  const outputGained = factoriesRunning * dt;

  game.update(s => ({
    ...s,
    resources: {
      ...s.resources,
      grain: (s.resources.grain ?? 0) - grainUsed,
      output: (s.resources.output ?? 0) + outputGained,
    },
  }));
}
