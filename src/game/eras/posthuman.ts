// =============================================================================
// Posthuman era — Of Mind & Machine
//
// New primary currency: Sentience.
// New mechanic: COGNITION ENGINES EXTRACT POPULATION ON CONSTRUCTION.
// Each engine permanently removes N citizens from the workforce. They are
// "in the engine" forever. Pop becomes a true finite resource here.
//
// Same recipe otherwise: storage building (Surveillance Grid), paradigm
// shift project (Predictive Policing), bounded multiplier projects,
// efficiency upgrade (Neural Tap).
// =============================================================================

import { get } from 'svelte/store';
import { game, spend, logEvent, type GameState } from '../game';
import { bulkCost, affordableCount } from './agrarian';

const ENGINE_BASE_COST = 50000;          // paid in compute
const ENGINE_COST_GROWTH = 1.22;
const ENGINE_COMPUTE_DRAIN = 30;
const ENGINE_SENTIENCE_BASE = 1.0;
const ENGINE_POP_EXTRACT = 80;           // permanent pop loss per engine built
const ENGINE_POP_EXTRACT_REDUCED = 40;   // after Cognitive Conscription
const LOYALTY_MULT = 1.8;
const MEMETIC_MULT = 1.5;
const FOUNDRY_PER_LEVEL = 1.15;

const FOUNDRY_BASE_COST = 100000;        // paid in compute
const FOUNDRY_COST_GROWTH = 1.16;

const GRID_BASE_COST = 30000;            // paid in compute
const GRID_COST_GROWTH = 1.13;

const TAP_BASE_COST = 25000;             // paid in sentience
const TAP_COST_GROWTH = 1.18;
const TAP_MAX_PRE = 7;
const TAP_MAX_POST = 14;                 // after Behavioral Conditioning

const BASE_SENTIENCE_CAP = 4000;
const PRE_PREDICTIVE_CAP_PER_GRID = 4000;
const PREDICTIVE_CAP_MULT = 1.5;

export interface PosthumanUpgrade {
  id: string;
  name: string;
  desc: string;
  cost: (level: number) => { compute?: number; sentience?: number };
  effect: string;
  max?: number;
  visible?: (s: GameState) => boolean;
}

export function popExtractedPerEngine(s: GameState = get(game)): number {
  return s.flags.cognitiveConscription ? ENGINE_POP_EXTRACT_REDUCED : ENGINE_POP_EXTRACT;
}

export const posthumanUpgrades: PosthumanUpgrade[] = [
  {
    id: 'cognitionEngine',
    name: 'Cognition Engine',
    desc: 'A vat of recursive thought. Extracts 80 citizens on build and uses 200 workers ongoing; produces Sentience while fed Compute.',
    cost: (lvl) => ({ compute: Math.ceil(ENGINE_BASE_COST * Math.pow(ENGINE_COST_GROWTH, lvl)) }),
    effect: '+1 sentience/sec',
  },
  {
    id: 'surveillanceGrid',
    name: 'Surveillance Grid',
    desc: 'Records every eye, ear, gesture. Pre-Predictive: +4K cap. Post: ×1.5 cap each.',
    cost: (lvl) => ({ compute: Math.ceil(GRID_BASE_COST * Math.pow(GRID_COST_GROWTH, lvl)) }),
    effect: '+Sentience storage',
    visible: s => (s.upgrades.cognitionEngine ?? 0) >= 1,
  },
  {
    id: 'memeticFoundry',
    name: 'Memetic Foundry',
    desc: 'Forge of acceptable thought. Each level boosts engine output by +15%.',
    cost: (lvl) => ({ compute: Math.ceil(FOUNDRY_BASE_COST * Math.pow(FOUNDRY_COST_GROWTH, lvl)) }),
    effect: '+15% Sentience/sec',
    visible: s => (s.upgrades.cognitionEngine ?? 0) >= 2,
  },
  {
    id: 'neuralTap',
    name: 'Neural Tap',
    desc: 'Bypass voluntary consent. Each level cuts engine Compute drain by 10% (floor 30%).',
    cost: (lvl) => ({ sentience: Math.ceil(TAP_BASE_COST * Math.pow(TAP_COST_GROWTH, lvl)) }),
    effect: '−10% Compute drain',
    max: TAP_MAX_PRE,
    visible: s => (s.upgrades.surveillanceGrid ?? 0) >= 1,
  },
];

export function posthumanUpgradeVisible(u: PosthumanUpgrade, s: GameState): boolean {
  if ((s.upgrades[u.id] ?? 0) > 0) return true;
  return u.visible ? u.visible(s) : true;
}

export function sentienceCap(s: GameState = get(game)): number {
  const grids = s.upgrades.surveillanceGrid ?? 0;
  const wonderMult = s.flags.thePanopticon ? 1.5 : 1;
  if (s.flags.predictivePolicing) {
    return Math.floor(BASE_SENTIENCE_CAP * wonderMult * Math.pow(PREDICTIVE_CAP_MULT, grids));
  }
  return Math.floor((BASE_SENTIENCE_CAP + PRE_PREDICTIVE_CAP_PER_GRID * grids) * wonderMult);
}

export function tapMax(s: GameState = get(game)): number {
  return s.flags.behavioralConditioning ? TAP_MAX_POST : TAP_MAX_PRE;
}

export function engineCostMult(s: GameState = get(game)): number {
  const loy = s.flags.loyaltyScore ? LOYALTY_MULT : 1;
  const mem = s.flags.memeticEngineering ? MEMETIC_MULT : 1;
  return loy * mem;
}

export function engineStaticMult(s: GameState = get(game)): number {
  const fou = s.upgrades.memeticFoundry ?? 0;
  const wonderMult = s.flags.theBlackBox ? 1.25 : 1;
  return Math.pow(FOUNDRY_PER_LEVEL, fou) * engineCostMult(s) * wonderMult;
}

export function engineComputeDrainPerSec(s: GameState = get(game)): number {
  const taps = Math.min(tapMax(s), s.upgrades.neuralTap ?? 0);
  const reduction = Math.max(0.3, 1 - 0.1 * taps);
  const wonderMult = s.flags.theVaultOfYes ? 0.5 : 1;
  return (s.upgrades.cognitionEngine ?? 0) * ENGINE_COMPUTE_DRAIN * reduction * wonderMult;
}

export function sentiencePerSec(s: GameState = get(game)): number {
  const engines = s.upgrades.cognitionEngine ?? 0;
  // Universal Surveillance: pop produces a small autonomous trickle.
  const surveillance = s.flags.universalSurveillance
    ? (s.resources.pop ?? 0) * 0.005
    : 0;
  return engines * ENGINE_SENTIENCE_BASE * engineStaticMult(s) + surveillance;
}

const POSTHUMAN_MULTS: Record<string, (s: GameState) => number> = {
  cognitionEngine:   s => engineCostMult(s),
  memeticFoundry:    () => 1,
  surveillanceGrid:  () => 1,
  neuralTap:         () => 1,
};

const POSTHUMAN_CURVES: Record<
  string,
  { base: number; growth: number; max?: number; payRes: 'compute' | 'sentience' }
> = {
  cognitionEngine:  { base: ENGINE_BASE_COST,  growth: ENGINE_COST_GROWTH,  payRes: 'compute' },
  surveillanceGrid: { base: GRID_BASE_COST,    growth: GRID_COST_GROWTH,    payRes: 'compute' },
  memeticFoundry:   { base: FOUNDRY_BASE_COST, growth: FOUNDRY_COST_GROWTH, payRes: 'compute' },
  neuralTap:        { base: TAP_BASE_COST,     growth: TAP_COST_GROWTH,     payRes: 'sentience', max: TAP_MAX_PRE },
};

function postScaledBase(id: string, s: GameState): number {
  const curve = POSTHUMAN_CURVES[id];
  const m = POSTHUMAN_MULTS[id] ? POSTHUMAN_MULTS[id](s) : 1;
  return curve.base * m;
}

function effectiveMax(id: string, def: PosthumanUpgrade, s: GameState): number | undefined {
  if (id === 'neuralTap') return tapMax(s);
  return def.max;
}

export function buyPosthumanUpgrade(id: string, count: number | 'max' = 1) {
  const s = get(game);
  const def = posthumanUpgrades.find(u => u.id === id);
  const curve = POSTHUMAN_CURVES[id];
  if (!def || !curve) return;
  const lvl = s.upgrades[id] ?? 0;
  const max = effectiveMax(id, def, s);
  if (max !== undefined && lvl >= max) return;
  const remaining = max !== undefined ? max - lvl : Infinity;
  const resKey = curve.payRes;
  const available = s.resources[resKey] ?? 0;
  const effectiveBase = postScaledBase(id, s);
  let n =
    count === 'max'
      ? affordableCount(effectiveBase, curve.growth, lvl, available, max)
      : Math.min(count, remaining);
  if (n <= 0) return;
  while (n > 0 && bulkCost(effectiveBase, curve.growth, lvl, n) > available) n--;
  if (n <= 0) return;

  // Cognition Engines also extract population.
  if (id === 'cognitionEngine') {
    const extract = popExtractedPerEngine(s) * n;
    const popAvail = s.resources.pop ?? 0;
    if (popAvail < extract) {
      // Can't extract more pop than exists. Trim n until we can.
      const affordablePop = Math.floor(popAvail / popExtractedPerEngine(s));
      n = Math.min(n, affordablePop);
      if (n <= 0) {
        logEvent('Not enough citizens to extract for another Cognition Engine.');
        return;
      }
    }
  }

  const total = bulkCost(effectiveBase, curve.growth, lvl, n);
  if (!spend(resKey, total)) return;

  if (id === 'cognitionEngine') {
    const extract = popExtractedPerEngine(s) * n;
    game.update(g => ({
      ...g,
      resources: {
        ...g.resources,
        pop: Math.max(0, (g.resources.pop ?? 0) - extract),
        popExtracted: ((g.resources.popExtracted ?? 0) + extract),
      },
      upgrades: { ...g.upgrades, [id]: lvl + n },
    }));
    if (lvl === 0) {
      logEvent(`First Cognition Engine activated. ${extract} citizens enter the engine.`);
    } else {
      logEvent(`${extract} more citizens enter the engines.`);
    }
  } else {
    game.update(g => ({
      ...g,
      upgrades: { ...g.upgrades, [id]: lvl + n },
    }));
    if (lvl === 0) logEvent(`First ${def.name.toLowerCase()} built.`);
  }
}

export function nextPostBulkCost(id: string, count: number | 'max', state?: GameState): { total: number; n: number; res: 'compute' | 'sentience' } {
  const s = state ?? get(game);
  const curve = POSTHUMAN_CURVES[id];
  if (!curve) return { total: 0, n: 0, res: 'compute' };
  const lvl = s.upgrades[id] ?? 0;
  const def = posthumanUpgrades.find(u => u.id === id)!;
  const max = effectiveMax(id, def, s);
  const resKey = curve.payRes;
  const available = s.resources[resKey] ?? 0;
  const effectiveBase = postScaledBase(id, s);
  let n =
    count === 'max'
      ? affordableCount(effectiveBase, curve.growth, lvl, available, max)
      : Math.min(count, max !== undefined ? max - lvl : Infinity);
  // Constrain to available population if this is an engine.
  if (id === 'cognitionEngine') {
    const popAvail = s.resources.pop ?? 0;
    const popPer = popExtractedPerEngine(s);
    const popLimit = Math.floor(popAvail / popPer);
    n = Math.min(n, popLimit);
  }
  return { total: bulkCost(effectiveBase, curve.growth, lvl, n), n, res: curve.payRes };
}

export function tickPosthuman(dt: number) {
  const s = get(game);
  const engines = s.upgrades.cognitionEngine ?? 0;
  const cap = sentienceCap(s);
  if (engines <= 0) {
    // Universal Surveillance can still produce a trickle even without engines.
    const rate = sentiencePerSec(s);
    if (rate <= 0) return;
    const newSent = Math.min(cap, (s.resources.sentience ?? 0) + rate * dt);
    game.update(s2 => ({ ...s2, resources: { ...s2.resources, sentience: newSent } }));
    return;
  }

  const computeNeeded = engineComputeDrainPerSec(s) * dt;
  const computeAvail = s.resources.compute ?? 0;
  const fraction = computeNeeded > 0 ? Math.min(1, computeAvail / computeNeeded) : 1;
  const computeUsed = computeNeeded * fraction;
  const sentBase = engines * ENGINE_SENTIENCE_BASE * engineStaticMult(s) * fraction;
  const surveillance = s.flags.universalSurveillance ? (s.resources.pop ?? 0) * 0.005 : 0;
  const sentGained = (sentBase + surveillance) * dt;
  const newSent = Math.min(cap, (s.resources.sentience ?? 0) + sentGained);

  game.update(s2 => ({
    ...s2,
    resources: {
      ...s2.resources,
      compute: Math.max(0, (s2.resources.compute ?? 0) - computeUsed),
      sentience: newSent,
    },
  }));
}
