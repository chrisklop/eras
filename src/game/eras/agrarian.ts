import { get } from 'svelte/store';
import { game, spend, logEvent, type GameState } from '../game';
import { legacyPlowMultiplier, legacyGrainCapMultiplier, legacyPopGrowthBonus, legacyProductionMultiplier } from '../legacy';
import { grainProdAchMult, popGrowthAchBonus } from '../achievements';
import { returnBuffMultiplier } from '../offline';

// =============================================================================
// Cost & cap constants — single source of truth.
// Invariant: for any upgrade U with cost growth k_cost paid from resource R
// whose cap grows by k_cap per feeder unit, k_cap MUST be >= k_cost or the
// curves cross and progression walls. See /home/klop/.claude/plans/wild-coalescing-russell.md.
// =============================================================================

const PLOW_BASE_COST = 10;
const PLOW_COST_GROWTH = 1.13;
const PLOW_BASE_OUTPUT = 0.5;

const IRRIGATION_BASE_COST = 80;
const IRRIGATION_COST_GROWTH = 2.0;
const IRRIGATION_MAX = 5;
const IRRIGATION_PER_LEVEL = 1.3;

const GRANARY_BASE_COST = 25;
const GRANARY_COST_GROWTH = 1.25;

const DWELLING_BASE_COST = 15;
const DWELLING_COST_GROWTH = 1.15;

// Multiplier magnitudes — kept small to avoid pacing collapse.
const CROP_ROTATION_MULT = 1.5;
const BRONZE_TOOLS_MULT = 1.5;
const WRITING_POP_OUTPUT = 0.2;

const BASE_GRAIN_CAP = 50;
const WATTLE_FENCES_BONUS = 75;
const PRE_POTTERY_CAP_PER_GRANARY = 50;
const POTTERY_CAP_MULT = 1.5;

const BASE_POP_CAP = 5;
const BASE_POP_GROWTH = 0.15;

// Housing tiers — each project flag overrides the lower tier.
// Era-themed names for the foundational agrarian buildings. They keep
// producing the same grain/storage/water/labor mechanics throughout the
// game, but the flavor escalates with the player's tech level.
export const PLOW_TIERS = [
  { era: 'algorithmic' as const, name: 'Vertical Farm',     desc: 'Stacked hydroponics under LEDs.' },
  { era: 'information' as const, name: 'Industrial Farm',   desc: 'Combines, fertilizer, monoculture.' },
  { era: 'industrial'  as const, name: 'Mechanized Plow',   desc: 'Steel-bladed, ox-team, broad furrows.' },
  { era: 'agrarian'    as const, name: 'Wooden Plow',       desc: 'Auto-gather grain. Cost scales with current plow efficiency.' },
];
export const GRANARY_TIERS = [
  { era: 'algorithmic' as const, name: 'Smart Silo',        desc: 'Sensor-monitored, pest-sealed grain bank.' },
  { era: 'information' as const, name: 'Grain Elevator',    desc: 'Rail-fed concrete tower for bulk storage.' },
  { era: 'industrial'  as const, name: 'Warehouse Granary', desc: 'Brick-lined, ventilated, foreman-managed.' },
  { era: 'agrarian'    as const, name: 'Granary',           desc: 'Stores grain. Pre-Pottery: +50 cap. Post-Pottery: ×1.5 cap each.' },
];
export const IRRIG_TIERS = [
  { era: 'algorithmic' as const, name: 'Drip System',       desc: 'Per-plant moisture sensors.' },
  { era: 'information' as const, name: 'Pivot Irrigation',  desc: 'Center-pivot sprinklers across the plains.' },
  { era: 'industrial'  as const, name: 'Reservoir Ditch',   desc: 'Steam-pumped from new reservoirs.' },
  { era: 'agrarian'    as const, name: 'Irrigation Ditch',  desc: 'Each level boosts plow yield by 30%.' },
];

export function tierByEra<T extends { era: 'agrarian' | 'industrial' | 'information' | 'algorithmic' }>(
  tiers: T[],
  era: string,
): T {
  for (const t of tiers) {
    if (era === t.era) return t;
    if (era === 'posthuman' || era === 'cosmic') return tiers[0]; // future-proof
  }
  // Fall through by era order: algorithmic > information > industrial > agrarian
  const order = ['algorithmic', 'information', 'industrial', 'agrarian'];
  for (const e of order.slice(order.indexOf(era))) {
    const t = tiers.find(x => x.era === e);
    if (t) return t;
  }
  return tiers[tiers.length - 1];
}

export const HOUSING_TIERS = [
  { flag: 'apartmentBlocks', name: 'Apartment Block', popPer: 60, maxDwellings: 80 },
  { flag: 'tenements',       name: 'Tenement',         popPer: 30, maxDwellings: 60 },
  { flag: 'cityPlanning',    name: 'Insula',           popPer: 15, maxDwellings: 40 },
  { flag: 'masonry',         name: 'Brick House',      popPer: 8,  maxDwellings: 25 },
  { flag: null,              name: 'Hut',              popPer: 4,  maxDwellings: 15 },
] as const;

export function currentHousingTier(s: GameState = get(game)) {
  for (const t of HOUSING_TIERS) {
    if (t.flag === null || s.flags[t.flag]) return t;
  }
  return HOUSING_TIERS[HOUSING_TIERS.length - 1];
}
const POP_GROWTH_PER_DWELLING = 0.08;
const MAX_POP_GROWTH = 2;

// Food consumption — base 0.3 grain/sec per citizen, multiplicatively reduced
// by efficiency techs. See popConsumptionPerSec().
const BASE_FOOD_PER_POP = 0.15;
// Pop only grows when there's a real surplus, not just a hair above zero net.
// Prevents the "pop creeps up until they eat 99% of production" trap.
const POP_GROWTH_SURPLUS_RATIO = 0.2;

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

/** Compute the grain cost for an upgrade at level `lvl`, given full game state. */
export function agrarianCostAt(id: string, lvl: number, s: GameState = get(game)): number {
  const curve = UPGRADE_CURVES[id];
  if (!curve) return 0;
  return Math.ceil(curve.base * Math.pow(curve.growth, lvl) * curve.mult(s));
}

export const agrarianUpgrades: Upgrade[] = [
  {
    id: 'plow',
    name: 'Wooden Plow',
    desc: 'Auto-gather grain. Cost scales with current plow efficiency.',
    cost: (lvl) => ({ grain: agrarianCostAt('plow', lvl) }),
    effect: '+grain/sec',
  },
  {
    id: 'irrigation',
    name: 'Irrigation Ditch',
    desc: 'Each level boosts plow yield by 30%.',
    cost: (lvl) => ({ grain: agrarianCostAt('irrigation', lvl) }),
    effect: '×1.3 plow yield',
    max: IRRIGATION_MAX,
  },
  {
    id: 'granary',
    name: 'Granary',
    desc: 'Stores grain. Pre-Pottery: +50 cap. Post-Pottery: ×1.5 cap each.',
    cost: (lvl) => ({ grain: agrarianCostAt('granary', lvl) }),
    effect: '+storage',
  },
  {
    id: 'dwelling',
    name: 'Dwelling',
    desc: 'A roof for citizens. +pop cap; tier grows with tech.',
    cost: (lvl) => ({ grain: agrarianCostAt('dwelling', lvl) }),
    effect: '+pop cap',
  },
];

export function grainCap(s: GameState = get(game)): number {
  const granaries = s.upgrades.granary ?? 0;
  const base = BASE_GRAIN_CAP + (s.flags.wattleFences ? WATTLE_FENCES_BONUS : 0);
  const legacyMult = legacyGrainCapMultiplier();
  const wonderMult = s.flags.pyramids ? 2 : 1;
  if (s.flags.pottery) {
    return Math.floor(base * legacyMult * wonderMult * Math.pow(POTTERY_CAP_MULT, granaries));
  }
  return Math.floor((base + PRE_POTTERY_CAP_PER_GRANARY * granaries) * legacyMult * wonderMult);
}

export function popCap(s: GameState = get(game)): number {
  const tier = currentHousingTier(s);
  return BASE_POP_CAP + tier.popPer * (s.upgrades.dwelling ?? 0);
}

export function dwellingMaxLevel(s: GameState = get(game)): number {
  return currentHousingTier(s).maxDwellings;
}

export function popGrowthPerSec(s: GameState = get(game)): number {
  const dwellings = s.upgrades.dwelling ?? 0;
  const compassBoost = s.flags.compass ? 0.2 : 0;
  const wonderBoost = s.flags.stonehenge ? 0.2 : 0;
  const raw = BASE_POP_GROWTH + POP_GROWTH_PER_DWELLING * dwellings + compassBoost
            + legacyPopGrowthBonus() + wonderBoost + popGrowthAchBonus();
  const capped = Math.min(MAX_POP_GROWTH, raw);
  // Logistic taper: growth halves at 50% pop/cap, near-zero at 95%+.
  // This makes pop a real commodity — it doesn't auto-fill housing.
  const pop = s.resources.pop ?? 0;
  const cap = popCap(s);
  if (cap <= 0) return 0;
  const headroom = Math.max(0, 1 - pop / cap);
  // Gentle taper near cap (linear-ish); steep slowdown only past 75% full.
  return capped * Math.pow(headroom, 0.8);
}

// Labor demand — every building needs workers from population.
// Later-era buildings scale up worker demand so population stays a real
// economic constraint. With 10K pop you can run ~20 racks comfortably; growing
// past that requires growing pop too.
// Every building needs workers — keeps population from accumulating as dead weight.
// Early-game (Agrarian) numbers are tiny so pop is still abundant.
const WORKERS_PER_PLOW = 2;
const WORKERS_PER_IRRIGATION = 1;
const WORKERS_PER_GRANARY = 1;
const WORKERS_PER_MINE = 5;
const WORKERS_PER_COALYARD = 2;
const WORKERS_PER_WAREHOUSE = 2;
const WORKERS_PER_WORKSHOP = 5;
const WORKERS_PER_FACTORY = 30;
const WORKERS_PER_RAILROAD = 4;
const WORKERS_PER_ARCHIVE = 5;
const WORKERS_PER_PRESS = 10;
const WORKERS_PER_WIRE = 5;
const WORKERS_PER_STATION = 120;
const WORKERS_PER_DATACENTER = 10;
const WORKERS_PER_LAB = 20;
const WORKERS_PER_FIBER = 10;
const WORKERS_PER_RACK = 500;
const WORKERS_PER_GRID = 30;
const WORKERS_PER_FOUNDRY = 40;
const WORKERS_PER_TAP = 20;
const WORKERS_PER_ENGINE = 200;
const WORKERS_PER_YARD = 30;
const WORKERS_PER_BAY = 50;
const WORKERS_PER_SAIL = 20;
const WORKERS_PER_SHIP = 300;

export function laborDemand(s: GameState = get(game)): number {
  return (
    (s.upgrades.plow ?? 0) * WORKERS_PER_PLOW +
    (s.upgrades.irrigation ?? 0) * WORKERS_PER_IRRIGATION +
    (s.upgrades.granary ?? 0) * WORKERS_PER_GRANARY +
    (s.upgrades.mine ?? 0) * WORKERS_PER_MINE +
    (s.upgrades.coalYard ?? 0) * WORKERS_PER_COALYARD +
    (s.upgrades.warehouse ?? 0) * WORKERS_PER_WAREHOUSE +
    (s.upgrades.workshop ?? 0) * WORKERS_PER_WORKSHOP +
    (s.upgrades.factory ?? 0) * WORKERS_PER_FACTORY +
    (s.upgrades.railroad ?? 0) * WORKERS_PER_RAILROAD +
    (s.upgrades.archive ?? 0) * WORKERS_PER_ARCHIVE +
    (s.upgrades.printingPress ?? 0) * WORKERS_PER_PRESS +
    (s.upgrades.wireNetwork ?? 0) * WORKERS_PER_WIRE +
    (s.upgrades.signalStation ?? 0) * WORKERS_PER_STATION +
    (s.upgrades.dataCenter ?? 0) * WORKERS_PER_DATACENTER +
    (s.upgrades.algorithmLab ?? 0) * WORKERS_PER_LAB +
    (s.upgrades.fiberOptic ?? 0) * WORKERS_PER_FIBER +
    (s.upgrades.serverRack ?? 0) * WORKERS_PER_RACK +
    (s.upgrades.surveillanceGrid ?? 0) * WORKERS_PER_GRID +
    (s.upgrades.memeticFoundry ?? 0) * WORKERS_PER_FOUNDRY +
    (s.upgrades.neuralTap ?? 0) * WORKERS_PER_TAP +
    (s.upgrades.cognitionEngine ?? 0) * WORKERS_PER_ENGINE +
    (s.upgrades.orbitalYard ?? 0) * WORKERS_PER_YARD +
    (s.upgrades.terraformingBay ?? 0) * WORKERS_PER_BAY +
    (s.upgrades.solarSail ?? 0) * WORKERS_PER_SAIL +
    (s.upgrades.colonyShip ?? 0) * WORKERS_PER_SHIP
  );
}

/** Fraction of workers available vs needed. 1 = fully manned. */
export function laborFraction(s: GameState = get(game)): number {
  const demand = laborDemand(s);
  if (demand <= 0) return 1;
  const pop = s.resources.pop ?? 0;
  return Math.min(1, pop / demand);
}

/** Population scales production via labor. Pre-existing factory bonus retired. */
export function popFactoryMultiplier(s: GameState = get(game)): number {
  return laborFraction(s);
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
  if (s.flags.hangingGardens) mult *= 0.8;
  if (s.flags.behavioralConditioning) return 0;
  return BASE_FOOD_PER_POP * mult;
}

export function grainConsumedPerSec(s: GameState = get(game)): number {
  return (s.resources.pop ?? 0) * consumptionPerPop(s);
}

/** Full multiplier on per-plow output (includes level-stacked irrigation). */
export function plowMultiplier(s: GameState = get(game)): number {
  const irrig = s.upgrades.irrigation ?? 0;
  return Math.pow(IRRIGATION_PER_LEVEL, irrig) * plowCostMultiplier(s) * legacyPlowMultiplier();
}

/** Bounded multiplier used for cost scaling (project flags only — no level
 *  compounding, or cost would outrun grain cap. See sim notes 2026-05-14. */
export function plowCostMultiplier(s: GameState = get(game)): number {
  const cropMult = s.flags.cropRotation ? CROP_ROTATION_MULT : 1;
  const toolMult = s.flags.bronzeTools ? BRONZE_TOOLS_MULT : 1;
  return cropMult * toolMult;
}

export function grainPerSec(s: GameState = get(game)): number {
  const plows = s.upgrades.plow ?? 0;
  const labor = laborFraction(s);
  const plowOutput = plows * PLOW_BASE_OUTPUT * plowMultiplier(s) * labor;
  const surplus = Math.max(0, (s.resources.pop ?? 0) - laborDemand(s));
  const popBase = s.flags.writing ? WRITING_POP_OUTPUT : 0.05;
  const popOutput = surplus * popBase;
  return (plowOutput + popOutput) * grainProdAchMult() * legacyProductionMultiplier() * returnBuffMultiplier();
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

function effectiveMax(id: string, def: Upgrade, s: GameState): number | undefined {
  if (id === 'dwelling') return dwellingMaxLevel(s);
  return def.max;
}

export function nextAgrarianBulkCost(id: string, count: number | 'max', state?: GameState): { total: number; n: number } {
  const s = state ?? get(game);
  const curve = UPGRADE_CURVES[id];
  if (!curve) return { total: 0, n: 0 };
  const lvl = s.upgrades[id] ?? 0;
  const def = agrarianUpgrades.find(u => u.id === id)!;
  const max = effectiveMax(id, def, s);
  const grain = s.resources.grain ?? 0;
  const remaining = max !== undefined ? Math.max(0, max - lvl) : Infinity;
  const effectiveBase = scaledBase(id, s);
  let n =
    count === 'max'
      ? affordableCount(effectiveBase, curve.growth, lvl, grain, max)
      : Math.min(count, remaining);
  return { total: bulkCost(effectiveBase, curve.growth, lvl, n), n };
}

// Each upgrade's `mult` is the production multiplier applied to its output.
// Costs are also scaled by this so that wait-time stays stable when multipliers
// stack. Without this, multipliers collapse wait times (the bug we just fixed).
const UPGRADE_CURVES: Record<
  string,
  { base: number; growth: number; max?: number; mult: (s: GameState) => number }
> = {
  plow:       { base: PLOW_BASE_COST,       growth: PLOW_COST_GROWTH,       mult: s => plowCostMultiplier(s) },
  irrigation: { base: IRRIGATION_BASE_COST, growth: IRRIGATION_COST_GROWTH, max: IRRIGATION_MAX, mult: () => 1 },
  granary:    { base: GRANARY_BASE_COST,    growth: GRANARY_COST_GROWTH,    mult: () => 1 },
  dwelling:   { base: DWELLING_BASE_COST,   growth: DWELLING_COST_GROWTH,   mult: () => 1 },
};

function scaledBase(id: string, s: GameState): number {
  const curve = UPGRADE_CURVES[id];
  return curve.base * curve.mult(s);
}

export function buyUpgrade(id: string, count: number | 'max' = 1) {
  const s = get(game);
  const def = agrarianUpgrades.find(u => u.id === id);
  const curve = UPGRADE_CURVES[id];
  if (!def || !curve) return;
  const lvl = s.upgrades[id] ?? 0;
  const max = effectiveMax(id, def, s);
  if (max !== undefined && lvl >= max) return;
  const remaining = max !== undefined ? max - lvl : Infinity;
  const grain = s.resources.grain ?? 0;
  const effectiveBase = scaledBase(id, s);
  let n =
    count === 'max'
      ? affordableCount(effectiveBase, curve.growth, lvl, grain, max)
      : Math.min(count, remaining);
  if (n <= 0) return;
  while (n > 0 && bulkCost(effectiveBase, curve.growth, lvl, n) > grain) n--;
  if (n <= 0) return;
  const total = bulkCost(effectiveBase, curve.growth, lvl, n);
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
  const rate = grainPerSec(get(game));
  const reward = Math.max(1, Math.floor(Math.sqrt(rate)));
  adjustGrain(reward);
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
  // Require a meaningful surplus, not just net > 0. Otherwise pop grows until
  // they eat virtually all production and you can't stockpile.
  const surplusNeeded = Math.max(0.5, consumption * POP_GROWTH_SURPLUS_RATIO);
  const wellFed = production - consumption >= surplusNeeded && grainCurrent > 0;
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
