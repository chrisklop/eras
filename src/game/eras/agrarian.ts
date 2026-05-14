import { get } from 'svelte/store';
import { game, spend, logEvent, type GameState } from '../game';

// =============================================================================
// Cost & cap constants — single source of truth.
// Invariant: for any upgrade U with cost growth k_cost paid from resource R
// whose cap grows by k_cap per feeder unit, k_cap MUST be >= k_cost or the
// curves cross and progression walls. See /home/klop/.claude/plans/wild-coalescing-russell.md.
// =============================================================================

const PLOW_BASE_COST = 10;
const PLOW_COST_GROWTH = 1.15;

const IRRIGATION_BASE_COST = 100;
const IRRIGATION_COST_GROWTH = 2.5;
const IRRIGATION_MAX = 8;

const GRANARY_BASE_COST = 30;
const GRANARY_COST_GROWTH = 1.4;

const DWELLING_BASE_COST = 20;
const DWELLING_COST_GROWTH = 1.3;

const BASE_GRAIN_CAP = 50;
const WATTLE_FENCES_BONUS = 75;
const PRE_POTTERY_CAP_PER_GRANARY = 50;
const POTTERY_CAP_MULT = 1.5;

const BASE_POP_CAP = 5;
const POP_PER_DWELLING = 5;
const BASE_POP_GROWTH = 0.3;
const POP_GROWTH_PER_DWELLING = 0.1;
const MAX_POP_GROWTH = 3;

// Food consumption — base 0.3 grain/sec per citizen, multiplicatively reduced
// by efficiency techs. See popConsumptionPerSec().
const BASE_FOOD_PER_POP = 0.3;

// Granary-based spoilage reduction: each granary cuts consumption by 0.5%,
// capped at -40%. Multiplied with other tech reductions.
const GRANARY_CONSUMPTION_REDUCTION_PER = 0.005;
const GRANARY_CONSUMPTION_REDUCTION_MAX = 0.4;

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  cost: (level: number) => { grain: number };
  effect: string;
  max?: number;
}

export const agrarianUpgrades: Upgrade[] = [
  {
    id: 'plow',
    name: 'Wooden Plow',
    desc: 'Auto-gather 1 grain/sec per plow.',
    cost: (lvl) => ({ grain: Math.ceil(PLOW_BASE_COST * Math.pow(PLOW_COST_GROWTH, lvl)) }),
    effect: '+1 grain/sec',
  },
  {
    id: 'irrigation',
    name: 'Irrigation Ditch',
    desc: 'Each level doubles plow output.',
    cost: (lvl) => ({ grain: Math.ceil(IRRIGATION_BASE_COST * Math.pow(IRRIGATION_COST_GROWTH, lvl)) }),
    effect: '×2 plow output',
    max: IRRIGATION_MAX,
  },
  {
    id: 'granary',
    name: 'Granary',
    desc: 'Stores grain. Pre-Pottery: +50 cap. Post-Pottery: ×1.5 cap each.',
    cost: (lvl) => ({ grain: Math.ceil(GRANARY_BASE_COST * Math.pow(GRANARY_COST_GROWTH, lvl)) }),
    effect: '+storage',
  },
  {
    id: 'dwelling',
    name: 'Dwelling',
    desc: 'A roof for five. +5 to population cap, faster growth.',
    cost: (lvl) => ({ grain: Math.ceil(DWELLING_BASE_COST * Math.pow(DWELLING_COST_GROWTH, lvl)) }),
    effect: '+5 pop cap',
  },
];

export function grainCap(s: GameState = get(game)): number {
  const granaries = s.upgrades.granary ?? 0;
  const base = BASE_GRAIN_CAP + (s.flags.wattleFences ? WATTLE_FENCES_BONUS : 0);
  if (s.flags.pottery) {
    return Math.floor(base * Math.pow(POTTERY_CAP_MULT, granaries));
  }
  return base + PRE_POTTERY_CAP_PER_GRANARY * granaries;
}

export function popCap(s: GameState = get(game)): number {
  return BASE_POP_CAP + POP_PER_DWELLING * (s.upgrades.dwelling ?? 0);
}

export function popGrowthPerSec(s: GameState = get(game)): number {
  const dwellings = s.upgrades.dwelling ?? 0;
  const compassBoost = s.flags.compass ? 0.5 : 0;
  return Math.min(MAX_POP_GROWTH, BASE_POP_GROWTH + POP_GROWTH_PER_DWELLING * dwellings + compassBoost);
}

/** Per-pop grain consumption per second, after all tech reductions. */
export function consumptionPerPop(s: GameState = get(game)): number {
  let mult = 1;
  if (s.flags.pottery) mult *= 0.80;
  if (s.flags.cropRotation) mult *= 0.85;
  if (s.flags.writing) mult *= 0.75;
  if (s.flags.threeField) mult *= 0.70;
  if (s.flags.plowAgriculture) mult *= 0.80;
  const granaries = s.upgrades.granary ?? 0;
  const granaryRed = Math.min(
    GRANARY_CONSUMPTION_REDUCTION_MAX,
    granaries * GRANARY_CONSUMPTION_REDUCTION_PER,
  );
  mult *= 1 - granaryRed;
  return BASE_FOOD_PER_POP * mult;
}

export function grainConsumedPerSec(s: GameState = get(game)): number {
  return (s.resources.pop ?? 0) * consumptionPerPop(s);
}

export function grainPerSec(s: GameState = get(game)): number {
  const plows = s.upgrades.plow ?? 0;
  const irrig = s.upgrades.irrigation ?? 0;
  const cropMult = s.flags.cropRotation ? 2 : 1;
  const toolMult = s.flags.bronzeTools ? 3 : 1;
  const plowOutput = plows * Math.pow(2, irrig) * cropMult * toolMult;
  const popOutput = s.flags.writing ? (s.resources.pop ?? 0) * 0.5 : 0;
  return plowOutput + popOutput;
}

/**
 * Total cost to buy `count` levels of an upgrade starting at currentLvl,
 * given a geometric cost function. Uses closed-form sum of a geometric series.
 */
export function bulkCost(
  base: number,
  growth: number,
  currentLvl: number,
  count: number,
): number {
  if (count <= 0) return 0;
  // sum from k=0..count-1 of base * growth^(currentLvl+k)
  //   = base * growth^currentLvl * (growth^count - 1) / (growth - 1)
  if (growth === 1) return base * count;
  const sum = base * Math.pow(growth, currentLvl) * (Math.pow(growth, count) - 1) / (growth - 1);
  return Math.ceil(sum);
}

/**
 * How many levels of an upgrade can be bought with `grain` available,
 * given base/growth cost, starting at currentLvl. Closed-form inverse.
 */
export function affordableCount(
  base: number,
  growth: number,
  currentLvl: number,
  available: number,
  maxLevel?: number,
): number {
  if (available <= 0) return 0;
  // available >= base * growth^currentLvl * (growth^k - 1) / (growth - 1)
  // (growth^k - 1) <= available * (growth - 1) / (base * growth^currentLvl)
  // growth^k <= 1 + available * (growth - 1) / (base * growth^currentLvl)
  const cap = 1 + (available * (growth - 1)) / (base * Math.pow(growth, currentLvl));
  if (cap <= 1) return 0;
  let k = Math.floor(Math.log(cap) / Math.log(growth));
  // floor may be off by 1 due to float; verify and adjust.
  while (bulkCost(base, growth, currentLvl, k + 1) <= available) k++;
  while (k > 0 && bulkCost(base, growth, currentLvl, k) > available) k--;
  if (maxLevel !== undefined) k = Math.min(k, maxLevel - currentLvl);
  return Math.max(0, k);
}

export function nextAgrarianBulkCost(id: string, count: number | 'max'): { total: number; n: number } {
  const s = get(game);
  const curve = UPGRADE_CURVES[id];
  if (!curve) return { total: 0, n: 0 };
  const lvl = s.upgrades[id] ?? 0;
  const def = agrarianUpgrades.find(u => u.id === id)!;
  const grain = s.resources.grain ?? 0;
  let n =
    count === 'max'
      ? affordableCount(curve.base, curve.growth, lvl, grain, def.max)
      : Math.min(count, def.max !== undefined ? def.max - lvl : Infinity);
  return { total: bulkCost(curve.base, curve.growth, lvl, n), n };
}

// Upgrade growth constants for bulk-buy lookups (mirror the table above).
const UPGRADE_CURVES: Record<string, { base: number; growth: number; max?: number }> = {
  plow:       { base: PLOW_BASE_COST,       growth: PLOW_COST_GROWTH },
  irrigation: { base: IRRIGATION_BASE_COST, growth: IRRIGATION_COST_GROWTH, max: IRRIGATION_MAX },
  granary:    { base: GRANARY_BASE_COST,    growth: GRANARY_COST_GROWTH },
  dwelling:   { base: DWELLING_BASE_COST,   growth: DWELLING_COST_GROWTH },
};

export function buyUpgrade(id: string, count: number | 'max' = 1) {
  const s = get(game);
  const def = agrarianUpgrades.find(u => u.id === id);
  const curve = UPGRADE_CURVES[id];
  if (!def || !curve) return;
  const lvl = s.upgrades[id] ?? 0;
  if (def.max !== undefined && lvl >= def.max) return;
  const remaining = def.max !== undefined ? def.max - lvl : Infinity;
  const grain = s.resources.grain ?? 0;
  let n =
    count === 'max'
      ? affordableCount(curve.base, curve.growth, lvl, grain, def.max)
      : Math.min(count, remaining);
  if (n <= 0) return;
  // Clamp to what's actually affordable.
  while (n > 0 && bulkCost(curve.base, curve.growth, lvl, n) > grain) n--;
  if (n <= 0) return;
  const total = bulkCost(curve.base, curve.growth, lvl, n);
  if (!spend('grain', total)) return;
  game.update(s => ({
    ...s,
    upgrades: { ...s.upgrades, [id]: lvl + n },
  }));
  if (lvl === 0) logEvent(`First ${def.name.toLowerCase()} built.`);
}

function adjustGrain(delta: number) {
  const s = get(game);
  const cap = grainCap(s);
  const next = Math.max(0, Math.min(cap, (s.resources.grain ?? 0) + delta));
  game.update(s => ({ ...s, resources: { ...s.resources, grain: next } }));
}

export function gatherGrain() {
  adjustGrain(1);
}

export function tickAgrarian(dt: number) {
  const s = get(game);
  const production = grainPerSec(s);
  const consumption = grainConsumedPerSec(s);
  adjustGrain((production - consumption) * dt);

  const grainCurrent = get(game).resources.grain ?? 0;
  const pop = s.resources.pop ?? 0;
  const popMax = popCap(s);
  // Well-fed = positive net food flow AND non-empty grain stockpile.
  const wellFed = production > consumption && grainCurrent > 0;
  if (wellFed && pop < popMax) {
    const before = Math.floor(pop);
    const next = Math.min(popMax, pop + popGrowthPerSec(s) * dt);
    game.update(s2 => ({ ...s2, resources: { ...s2.resources, pop: next } }));
    const after = Math.floor(next);
    if (after > before && after % 10 === 0) {
      logEvent(`Population reaches ${after}.`);
    }
  }
}
