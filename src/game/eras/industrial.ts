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
import { game, spend, logEvent, type GameState } from '../game';
import { bulkCost, affordableCount, popFactoryMultiplier } from './agrarian';

const FACTORY_BASE_COST = 500;
const FACTORY_COST_GROWTH = 1.3;
const FACTORY_GRAIN_DRAIN = 2;          // grain/sec/factory
const FACTORY_OUTPUT_BASE = 1;          // output/sec/factory

const WORKSHOP_BASE_COST = 2000;
const WORKSHOP_COST_GROWTH = 1.25;      // each lvl: +20% factory output

// Warehouses are physical infrastructure — paid in grain like other buildings.
// (Paying output to store output is narratively odd; player enters Industrial
// with plenty of grain anyway.)
const WAREHOUSE_BASE_COST = 1000;       // in grain
const WAREHOUSE_COST_GROWTH = 1.35;

// Railroads ARE output (manufactured iron rails) — pay in output.
const RAILROAD_BASE_COST = 500;
const RAILROAD_COST_GROWTH = 1.4;       // each lvl: -10% factory grain drain

const BASE_OUTPUT_CAP = 400;
const PRE_LOGISTICS_CAP_PER_WAREHOUSE = 200;
const LOGISTICS_CAP_MULT = 1.5;         // post-Logistics paradigm shift

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
    desc: 'Burns grain to produce output.',
    cost: (lvl) => ({ grain: Math.ceil(FACTORY_BASE_COST * Math.pow(FACTORY_COST_GROWTH, lvl)) }),
    effect: '+1 output/sec, -2 grain/sec',
  },
  {
    id: 'workshop',
    name: 'Workshop',
    desc: 'Tools, dies, jigs. Each level boosts factory output by +20%.',
    cost: (lvl) => ({ grain: Math.ceil(WORKSHOP_BASE_COST * Math.pow(WORKSHOP_COST_GROWTH, lvl)) }),
    effect: '+20% factory output',
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    desc: 'Stores output. Pre-Logistics: +200 cap. Post-Logistics: ×1.5 cap each.',
    cost: (lvl) => ({ grain: Math.ceil(WAREHOUSE_BASE_COST * Math.pow(WAREHOUSE_COST_GROWTH, lvl)) }),
    effect: '+output storage',
  },
  {
    id: 'railroad',
    name: 'Railroad',
    desc: 'Move grain efficiently. Each level cuts factory grain demand by 10% (floor 30%).',
    cost: (lvl) => ({ output: Math.ceil(RAILROAD_BASE_COST * Math.pow(RAILROAD_COST_GROWTH, lvl)) }),
    effect: '-10% grain drain',
    max: 7,
  },
];

export function outputCap(s: GameState = get(game)): number {
  const warehouses = s.upgrades.warehouse ?? 0;
  if (s.flags.logistics) {
    return Math.floor(BASE_OUTPUT_CAP * Math.pow(LOGISTICS_CAP_MULT, warehouses));
  }
  return BASE_OUTPUT_CAP + PRE_LOGISTICS_CAP_PER_WAREHOUSE * warehouses;
}

export function factoryOutputMult(s: GameState = get(game)): number {
  const workshops = s.upgrades.workshop ?? 0;
  const electricMult = s.flags.electricity ? 2 : 1;
  const massProdMult = s.flags.massProduction ? 2 : 1;
  return (1 + 0.2 * workshops) * electricMult * massProdMult * popFactoryMultiplier(s);
}

export function factoryGrainMult(s: GameState = get(game)): number {
  const railroads = Math.min(7, s.upgrades.railroad ?? 0);
  return Math.max(0.3, 1 - 0.1 * railroads);
}

export function outputPerSec(s: GameState = get(game)): number {
  return (s.upgrades.factory ?? 0) * FACTORY_OUTPUT_BASE * factoryOutputMult(s);
}

export function grainDrainPerSec(s: GameState = get(game)): number {
  return (s.upgrades.factory ?? 0) * FACTORY_GRAIN_DRAIN * factoryGrainMult(s);
}

// Mirror of cost curves for bulk-buy lookups. Each industrial upgrade pays
// in either grain or output — track which.
const INDUSTRIAL_CURVES: Record<
  string,
  { base: number; growth: number; max?: number; payRes: 'grain' | 'output' }
> = {
  factory:   { base: FACTORY_BASE_COST,   growth: FACTORY_COST_GROWTH,   payRes: 'grain' },
  workshop:  { base: WORKSHOP_BASE_COST,  growth: WORKSHOP_COST_GROWTH,  payRes: 'grain' },
  warehouse: { base: WAREHOUSE_BASE_COST, growth: WAREHOUSE_COST_GROWTH, payRes: 'grain' },
  railroad:  { base: RAILROAD_BASE_COST,  growth: RAILROAD_COST_GROWTH,  payRes: 'output', max: 7 },
};

export function buyIndustrialUpgrade(id: string, count: number | 'max' = 1) {
  const s = get(game);
  const def = industrialUpgrades.find(u => u.id === id);
  const curve = INDUSTRIAL_CURVES[id];
  if (!def || !curve) return;
  const lvl = s.upgrades[id] ?? 0;
  if (def.max !== undefined && lvl >= def.max) return;
  const remaining = def.max !== undefined ? def.max - lvl : Infinity;
  const available = s.resources[curve.payRes] ?? 0;
  let n =
    count === 'max'
      ? affordableCount(curve.base, curve.growth, lvl, available, def.max)
      : Math.min(count, remaining);
  if (n <= 0) return;
  while (n > 0 && bulkCost(curve.base, curve.growth, lvl, n) > available) n--;
  if (n <= 0) return;
  const total = bulkCost(curve.base, curve.growth, lvl, n);
  if (!spend(curve.payRes, total)) return;
  game.update(s => ({
    ...s,
    upgrades: { ...s.upgrades, [id]: lvl + n },
  }));
  if (lvl === 0) logEvent(`First ${def.name.toLowerCase()} built.`);
}

export function nextBulkCost(id: string, count: number | 'max', state?: GameState): { total: number; n: number; res: 'grain' | 'output' } {
  const s = state ?? get(game);
  const curve = INDUSTRIAL_CURVES[id];
  if (!curve) return { total: 0, n: 0, res: 'grain' };
  const lvl = s.upgrades[id] ?? 0;
  const def = industrialUpgrades.find(u => u.id === id)!;
  const available = s.resources[curve.payRes] ?? 0;
  let n =
    count === 'max'
      ? affordableCount(curve.base, curve.growth, lvl, available, def.max)
      : Math.min(count, def.max !== undefined ? def.max - lvl : Infinity);
  return { total: bulkCost(curve.base, curve.growth, lvl, n), n, res: curve.payRes };
}

export function tickIndustrial(dt: number) {
  const s = get(game);
  const factories = s.upgrades.factory ?? 0;
  if (factories <= 0) return;

  const drainRate = grainDrainPerSec(s);
  const outRate = outputPerSec(s);
  const cap = outputCap(s);

  const grainNeeded = drainRate * dt;
  const grainAvail = s.resources.grain ?? 0;
  const grainUsed = Math.min(grainNeeded, grainAvail);
  const fraction = grainNeeded > 0 ? grainUsed / grainNeeded : 1;
  const outputGained = outRate * dt * fraction;
  const newOutput = Math.min(cap, (s.resources.output ?? 0) + outputGained);

  game.update(s => ({
    ...s,
    resources: {
      ...s.resources,
      grain: (s.resources.grain ?? 0) - grainUsed,
      output: newOutput,
    },
  }));
}
