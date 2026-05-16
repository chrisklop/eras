// =============================================================================
// Algorithmic era — Of Code & Compute
//
// New primary currency: Compute (produced by Server Racks from Insight).
// Storage: Data Center — linear pre-Compiler, ×1.5 cap each after.
// Multiplier: Algorithm Lab — each level ×1.15 Compute production.
// Efficiency: Fiber Optic — each level −10% Insight drain per rack.
//
// Same recipe as prior eras. Invariant: cost_growth < cap_growth,
// multipliers bounded to project flags only.
// =============================================================================

import { get } from 'svelte/store';
import { game, spend, logEvent, type GameState } from '../game';
import { bulkCost, affordableCount, laborFraction } from './agrarian';
import { legacyProductionMultiplier } from '../legacy';
import { returnBuffMultiplier } from '../offline';

const RACK_BASE_COST = 50000;               // paid in insight
const RACK_COST_GROWTH = 1.22;
const RACK_INSIGHT_DRAIN = 30;
const RACK_COMPUTE_BASE = 1.0;
const OS_MULT = 1.8;
const ML_MULT = 1.5;
const CLOUD_MULT = 1.5;
const LAB_PER_LEVEL = 1.15;

const LAB_BASE_COST = 120000;               // paid in insight
const LAB_COST_GROWTH = 1.16;

const DATACENTER_BASE_COST = 40000;         // paid in insight
const DATACENTER_COST_GROWTH = 1.13;

const FIBER_BASE_COST = 25000;              // paid in compute
const FIBER_COST_GROWTH = 1.18;
const FIBER_MAX_PRE = 7;
const FIBER_MAX_POST = 14;                  // after Broadband

const BASE_COMPUTE_CAP = 4000;
const PRE_COMPILER_CAP_PER_DC = 4000;
const COMPILER_CAP_MULT = 1.5;

export interface AlgorithmicUpgrade {
  id: string;
  name: string;
  desc: string;
  cost: (level: number) => { insight?: number; compute?: number };
  effect: string;
  max?: number;
  visible?: (s: GameState) => boolean;
}

export const algorithmicUpgrades: AlgorithmicUpgrade[] = [
  {
    id: 'serverRack',
    name: 'Server Rack',
    desc: 'Burns Insight into Compute cycles. Each needs 500 workers.',
    cost: (lvl) => ({ insight: Math.ceil(RACK_BASE_COST * Math.pow(RACK_COST_GROWTH, lvl)) }),
    effect: '+1 compute/sec',
  },
  {
    id: 'dataCenter',
    name: 'Data Center',
    desc: 'Stores Compute. Pre-Compiler: +4K cap. Post: ×1.5 cap each.',
    cost: (lvl) => ({ insight: Math.ceil(DATACENTER_BASE_COST * Math.pow(DATACENTER_COST_GROWTH, lvl)) }),
    effect: '+Compute storage',
    visible: s => (s.upgrades.serverRack ?? 0) >= 1,
  },
  {
    id: 'algorithmLab',
    name: 'Algorithm Lab',
    desc: 'Loops, hashes, heuristics. Each level boosts Compute output by +15%.',
    cost: (lvl) => ({ insight: Math.ceil(LAB_BASE_COST * Math.pow(LAB_COST_GROWTH, lvl)) }),
    effect: '+15% Compute/sec',
    visible: s => (s.upgrades.serverRack ?? 0) >= 2,
  },
  {
    id: 'fiberOptic',
    name: 'Fiber Optic',
    desc: 'Glass at light speed. Each level cuts rack Insight drain by 10% (floor 30%).',
    cost: (lvl) => ({ compute: Math.ceil(FIBER_BASE_COST * Math.pow(FIBER_COST_GROWTH, lvl)) }),
    effect: '−10% Insight drain',
    max: FIBER_MAX_PRE,
    visible: s => (s.upgrades.dataCenter ?? 0) >= 1,
  },
];

export function algorithmicUpgradeVisible(u: AlgorithmicUpgrade, s: GameState): boolean {
  if ((s.upgrades[u.id] ?? 0) > 0) return true;
  return u.visible ? u.visible(s) : true;
}

export function computeCap(s: GameState = get(game)): number {
  const dcs = s.upgrades.dataCenter ?? 0;
  const wonderMult = s.flags.internetBackbone ? 1.5 : 1;
  if (s.flags.compiler) {
    return Math.floor(BASE_COMPUTE_CAP * wonderMult * Math.pow(COMPILER_CAP_MULT, dcs));
  }
  return Math.floor((BASE_COMPUTE_CAP + PRE_COMPILER_CAP_PER_DC * dcs) * wonderMult);
}

export function fiberMax(s: GameState = get(game)): number {
  return s.flags.broadband ? FIBER_MAX_POST : FIBER_MAX_PRE;
}

export function rackCostMult(s: GameState = get(game)): number {
  const os = s.flags.operatingSystem ? OS_MULT : 1;
  const ml = s.flags.machineLearning ? ML_MULT : 1;
  const cloud = s.flags.cloudComputing ? CLOUD_MULT : 1;
  return os * ml * cloud;
}

export function rackStaticMult(s: GameState = get(game)): number {
  const labs = s.upgrades.algorithmLab ?? 0;
  const wonderMult = s.flags.quantumLab ? 1.25 : 1;
  return Math.pow(LAB_PER_LEVEL, labs) * rackCostMult(s) * wonderMult;
}

const WORKERS_PER_RACK = 500;
export function laborAlgoDemand(s: GameState = get(game)): number {
  return (s.upgrades.serverRack ?? 0) * WORKERS_PER_RACK;
}

export function rackInsightDrainPerSec(s: GameState = get(game)): number {
  const fibers = Math.min(fiberMax(s), s.upgrades.fiberOptic ?? 0);
  const reduction = Math.max(0.3, 1 - 0.1 * fibers);
  const wonderMult = s.flags.renewableGrid ? 0.5 : 1;
  return (s.upgrades.serverRack ?? 0) * RACK_INSIGHT_DRAIN * reduction * wonderMult;
}

export function computePerSec(s: GameState = get(game)): number {
  const racks = s.upgrades.serverRack ?? 0;
  const labor = laborFraction(s);
  const openSrc = s.flags.openSource
    ? Math.max(0, (s.resources.pop ?? 0)) * 0.02
    : 0;
  return (racks * RACK_COMPUTE_BASE * rackStaticMult(s) * labor + openSrc) * legacyProductionMultiplier() * returnBuffMultiplier();
}

const ALGO_MULTS: Record<string, (s: GameState) => number> = {
  serverRack:   s => rackCostMult(s),
  algorithmLab: () => 1,
  dataCenter:   () => 1,
  fiberOptic:   () => 1,
};

const ALGO_CURVES: Record<
  string,
  { base: number; growth: number; max?: number; payRes: 'insight' | 'compute' }
> = {
  serverRack:   { base: RACK_BASE_COST,       growth: RACK_COST_GROWTH,       payRes: 'insight' },
  dataCenter:   { base: DATACENTER_BASE_COST, growth: DATACENTER_COST_GROWTH, payRes: 'insight' },
  algorithmLab: { base: LAB_BASE_COST,        growth: LAB_COST_GROWTH,        payRes: 'insight' },
  fiberOptic:   { base: FIBER_BASE_COST,      growth: FIBER_COST_GROWTH,      payRes: 'compute', max: FIBER_MAX_PRE },
};

function algoScaledBase(id: string, s: GameState): number {
  const curve = ALGO_CURVES[id];
  const m = ALGO_MULTS[id] ? ALGO_MULTS[id](s) : 1;
  return curve.base * m;
}

function effectiveMax(id: string, def: AlgorithmicUpgrade, s: GameState): number | undefined {
  if (id === 'fiberOptic') return fiberMax(s);
  return def.max;
}

export function buyAlgorithmicUpgrade(id: string, count: number | 'max' = 1) {
  const s = get(game);
  const def = algorithmicUpgrades.find(u => u.id === id);
  const curve = ALGO_CURVES[id];
  if (!def || !curve) return;
  const lvl = s.upgrades[id] ?? 0;
  const max = effectiveMax(id, def, s);
  if (max !== undefined && lvl >= max) return;
  const remaining = max !== undefined ? max - lvl : Infinity;
  const resKey = curve.payRes;
  const available = s.resources[resKey] ?? 0;
  const effectiveBase = algoScaledBase(id, s);
  let n =
    count === 'max'
      ? affordableCount(effectiveBase, curve.growth, lvl, available, max)
      : Math.min(count, remaining);
  if (n <= 0) return;
  while (n > 0 && bulkCost(effectiveBase, curve.growth, lvl, n) > available) n--;
  if (n <= 0) return;
  const total = bulkCost(effectiveBase, curve.growth, lvl, n);
  if (!spend(resKey, total)) return;
  game.update(s => ({
    ...s,
    upgrades: { ...s.upgrades, [id]: lvl + n },
  }));
  if (lvl === 0) logEvent(`First ${def.name.toLowerCase()} built.`);
}

export function nextAlgoBulkCost(id: string, count: number | 'max', state?: GameState): { total: number; n: number; res: 'insight' | 'compute' } {
  const s = state ?? get(game);
  const curve = ALGO_CURVES[id];
  if (!curve) return { total: 0, n: 0, res: 'insight' };
  const lvl = s.upgrades[id] ?? 0;
  const def = algorithmicUpgrades.find(u => u.id === id)!;
  const max = effectiveMax(id, def, s);
  const resKey = curve.payRes;
  const available = s.resources[resKey] ?? 0;
  const effectiveBase = algoScaledBase(id, s);
  let n =
    count === 'max'
      ? affordableCount(effectiveBase, curve.growth, lvl, available, max)
      : Math.min(count, max !== undefined ? max - lvl : Infinity);
  return { total: bulkCost(effectiveBase, curve.growth, lvl, n), n, res: curve.payRes };
}

export function tickAlgorithmic(dt: number) {
  const s = get(game);
  const racks = s.upgrades.serverRack ?? 0;
  if (racks <= 0) return;

  const insightNeeded = rackInsightDrainPerSec(s) * dt;
  const insightAvail = s.resources.insight ?? 0;
  const fraction = insightNeeded > 0 ? Math.min(1, insightAvail / insightNeeded) : 1;
  const insightUsed = insightNeeded * fraction;
  const computeGained = computePerSec(s) * dt * fraction;
  const cap = computeCap(s);
  const newCompute = Math.min(cap, (s.resources.compute ?? 0) + computeGained);

  game.update(s2 => ({
    ...s2,
    resources: {
      ...s2.resources,
      insight: Math.max(0, (s2.resources.insight ?? 0) - insightUsed),
      compute: newCompute,
    },
  }));
}
