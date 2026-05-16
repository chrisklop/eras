// =============================================================================
// Cosmic era — Of Engine & Star
//
// New primary currency: Reach (light-years of confirmed colonization).
// New mechanic: COLONY SHIPS DEPLOY POPULATION OFF-WORLD.
// Unlike Cognition Engines (which destroy pop), Colony Ships *send* pop —
// tracked as 'colonized' rather than 'extracted'. Same constraint, kinder
// ledger.
//
// Tone is intentionally ambiguous: triumphant space narrative on the surface,
// with the AI from Chapter V occasionally still narrating between the lines.
// =============================================================================

import { get } from 'svelte/store';
import { game, spend, logEvent, type GameState } from '../game';
import { bulkCost, affordableCount } from './agrarian';
import { eventMultiplier } from '../events';

const SHIP_BASE_COST = 30000;
const SHIP_COST_GROWTH = 1.22;
const SHIP_SENTIENCE_DRAIN = 20;
const SHIP_REACH_BASE = 1.0;
const SHIP_POP_DEPLOY = 200;            // pop sent off-world per ship
const SHIP_POP_DEPLOY_REDUCED = 100;    // after Compressed Crew
const GEN_SHIPS_MULT = 1.8;
const SOLAR_EMPIRE_MULT = 1.5;
const ASTEROID_MINING_MULT = 1.5;
const BAY_PER_LEVEL = 1.15;

const BAY_BASE_COST = 60000;
const BAY_COST_GROWTH = 1.16;

const YARD_BASE_COST = 20000;
const YARD_COST_GROWTH = 1.13;

const SAIL_BASE_COST = 15000;
const SAIL_COST_GROWTH = 1.18;
const SAIL_MAX_PRE = 7;
const SAIL_MAX_POST = 14;               // after Lunar Spaceport

const BASE_REACH_CAP = 4000;
const PRE_MARS_CAP_PER_YARD = 4000;
const MARS_CAP_MULT = 1.5;

export interface CosmicUpgrade {
  id: string;
  name: string;
  desc: string;
  cost: (level: number) => { sentience?: number; reach?: number };
  effect: string;
  max?: number;
  visible?: (s: GameState) => boolean;
}

export function popDeployedPerShip(s: GameState = get(game)): number {
  return s.flags.compressedCrew ? SHIP_POP_DEPLOY_REDUCED : SHIP_POP_DEPLOY;
}

export const cosmicUpgrades: CosmicUpgrade[] = [
  {
    id: 'colonyShip',
    name: 'Colony Ship',
    desc: 'Sentience and souls, hurled across vacuum. Deploys 200 colonists off-world per ship and needs 300 workers ongoing.',
    cost: (lvl) => ({ sentience: Math.ceil(SHIP_BASE_COST * Math.pow(SHIP_COST_GROWTH, lvl)) }),
    effect: '+1 reach/sec',
  },
  {
    id: 'orbitalYard',
    name: 'Orbital Yard',
    desc: 'Permanent staging in low orbit. Pre-Mars: +4K cap. Post: ×1.5 cap each.',
    cost: (lvl) => ({ sentience: Math.ceil(YARD_BASE_COST * Math.pow(YARD_COST_GROWTH, lvl)) }),
    effect: '+Reach storage',
    visible: s => (s.upgrades.colonyShip ?? 0) >= 1,
  },
  {
    id: 'terraformingBay',
    name: 'Terraforming Bay',
    desc: 'Atmospheric processors, microbiome seeders. Each level boosts ship output by +15%.',
    cost: (lvl) => ({ sentience: Math.ceil(BAY_BASE_COST * Math.pow(BAY_COST_GROWTH, lvl)) }),
    effect: '+15% Reach/sec',
    visible: s => (s.upgrades.colonyShip ?? 0) >= 2,
  },
  {
    id: 'solarSail',
    name: 'Solar Sail',
    desc: 'Photon-pressure propulsion. Each level cuts Sentience drain per ship by 10% (floor 30%).',
    cost: (lvl) => ({ reach: Math.ceil(SAIL_BASE_COST * Math.pow(SAIL_COST_GROWTH, lvl)) }),
    effect: '−10% Sentience drain',
    max: SAIL_MAX_PRE,
    visible: s => (s.upgrades.orbitalYard ?? 0) >= 1,
  },
];

export function cosmicUpgradeVisible(u: CosmicUpgrade, s: GameState): boolean {
  if ((s.upgrades[u.id] ?? 0) > 0) return true;
  return u.visible ? u.visible(s) : true;
}

export function reachCap(s: GameState = get(game)): number {
  const yards = s.upgrades.orbitalYard ?? 0;
  const wonderMult = s.flags.marsSpire ? 1.5 : 1;
  if (s.flags.marsOutpost) {
    return Math.floor(BASE_REACH_CAP * wonderMult * Math.pow(MARS_CAP_MULT, yards));
  }
  return Math.floor((BASE_REACH_CAP + PRE_MARS_CAP_PER_YARD * yards) * wonderMult);
}

export function sailMax(s: GameState = get(game)): number {
  return s.flags.lunarSpaceport ? SAIL_MAX_POST : SAIL_MAX_PRE;
}

export function shipCostMult(s: GameState = get(game)): number {
  const gen = s.flags.generationShips ? GEN_SHIPS_MULT : 1;
  const sol = s.flags.solarEmpire ? SOLAR_EMPIRE_MULT : 1;
  const ast = s.flags.asteroidMining ? ASTEROID_MINING_MULT : 1;
  return gen * sol * ast;
}

export function shipStaticMult(s: GameState = get(game)): number {
  const bays = s.upgrades.terraformingBay ?? 0;
  const wonderMult = s.flags.generationVault ? 1.25 : 1;
  return Math.pow(BAY_PER_LEVEL, bays) * shipCostMult(s) * wonderMult;
}

export function shipSentienceDrainPerSec(s: GameState = get(game)): number {
  const sails = Math.min(sailMax(s), s.upgrades.solarSail ?? 0);
  const reduction = Math.max(0.3, 1 - 0.1 * sails);
  const wonderMult = s.flags.dysonLattice ? 0.5 : 1;
  return (s.upgrades.colonyShip ?? 0) * SHIP_SENTIENCE_DRAIN * reduction * wonderMult;
}

export function reachPerSec(s: GameState = get(game)): number {
  const ships = s.upgrades.colonyShip ?? 0;
  return ships * SHIP_REACH_BASE * shipStaticMult(s) * eventMultiplier('reach');
}

const COSMIC_MULTS: Record<string, (s: GameState) => number> = {
  colonyShip:      s => shipCostMult(s),
  terraformingBay: () => 1,
  orbitalYard:     () => 1,
  solarSail:       () => 1,
};

const COSMIC_CURVES: Record<
  string,
  { base: number; growth: number; max?: number; payRes: 'sentience' | 'reach' }
> = {
  colonyShip:      { base: SHIP_BASE_COST, growth: SHIP_COST_GROWTH, payRes: 'sentience' },
  orbitalYard:     { base: YARD_BASE_COST, growth: YARD_COST_GROWTH, payRes: 'sentience' },
  terraformingBay: { base: BAY_BASE_COST,  growth: BAY_COST_GROWTH,  payRes: 'sentience' },
  solarSail:       { base: SAIL_BASE_COST, growth: SAIL_COST_GROWTH, payRes: 'reach', max: SAIL_MAX_PRE },
};

function cosmicScaledBase(id: string, s: GameState): number {
  const curve = COSMIC_CURVES[id];
  const m = COSMIC_MULTS[id] ? COSMIC_MULTS[id](s) : 1;
  return curve.base * m;
}

function effectiveMax(id: string, def: CosmicUpgrade, s: GameState): number | undefined {
  if (id === 'solarSail') return sailMax(s);
  return def.max;
}

export function buyCosmicUpgrade(id: string, count: number | 'max' = 1) {
  const s = get(game);
  const def = cosmicUpgrades.find(u => u.id === id);
  const curve = COSMIC_CURVES[id];
  if (!def || !curve) return;
  const lvl = s.upgrades[id] ?? 0;
  const max = effectiveMax(id, def, s);
  if (max !== undefined && lvl >= max) return;
  const remaining = max !== undefined ? max - lvl : Infinity;
  const resKey = curve.payRes;
  const available = s.resources[resKey] ?? 0;
  const effectiveBase = cosmicScaledBase(id, s);
  let n =
    count === 'max'
      ? affordableCount(effectiveBase, curve.growth, lvl, available, max)
      : Math.min(count, remaining);
  if (n <= 0) return;
  while (n > 0 && bulkCost(effectiveBase, curve.growth, lvl, n) > available) n--;
  if (n <= 0) return;

  if (id === 'colonyShip') {
    const deploy = popDeployedPerShip(s) * n;
    const popAvail = s.resources.pop ?? 0;
    if (popAvail < deploy) {
      const affordable = Math.floor(popAvail / popDeployedPerShip(s));
      n = Math.min(n, affordable);
      if (n <= 0) {
        logEvent('Not enough citizens to crew another ship.');
        return;
      }
    }
  }

  const total = bulkCost(effectiveBase, curve.growth, lvl, n);
  if (!spend(resKey, total)) return;

  if (id === 'colonyShip') {
    const deploy = popDeployedPerShip(s) * n;
    game.update(g => ({
      ...g,
      resources: {
        ...g.resources,
        pop: Math.max(0, (g.resources.pop ?? 0) - deploy),
        colonized: ((g.resources.colonized ?? 0) + deploy),
      },
      upgrades: { ...g.upgrades, [id]: lvl + n },
    }));
    if (lvl === 0) {
      logEvent(`First Colony Ship departs. ${deploy} colonists bound for the next sky.`);
    } else {
      logEvent(`${deploy} more colonists leave for the stars.`);
    }
  } else {
    game.update(g => ({
      ...g,
      upgrades: { ...g.upgrades, [id]: lvl + n },
    }));
    if (lvl === 0) logEvent(`First ${def.name.toLowerCase()} built.`);
  }
}

export function nextCosmicBulkCost(id: string, count: number | 'max', state?: GameState): { total: number; n: number; res: 'sentience' | 'reach' } {
  const s = state ?? get(game);
  const curve = COSMIC_CURVES[id];
  if (!curve) return { total: 0, n: 0, res: 'sentience' };
  const lvl = s.upgrades[id] ?? 0;
  const def = cosmicUpgrades.find(u => u.id === id)!;
  const max = effectiveMax(id, def, s);
  const resKey = curve.payRes;
  const available = s.resources[resKey] ?? 0;
  const effectiveBase = cosmicScaledBase(id, s);
  let n =
    count === 'max'
      ? affordableCount(effectiveBase, curve.growth, lvl, available, max)
      : Math.min(count, max !== undefined ? max - lvl : Infinity);
  if (id === 'colonyShip') {
    const popAvail = s.resources.pop ?? 0;
    const per = popDeployedPerShip(s);
    n = Math.min(n, Math.floor(popAvail / per));
  }
  return { total: bulkCost(effectiveBase, curve.growth, lvl, n), n, res: curve.payRes };
}

export function tickCosmic(dt: number) {
  const s = get(game);
  const ships = s.upgrades.colonyShip ?? 0;
  const cap = reachCap(s);
  if (ships <= 0) return;

  const sentNeeded = shipSentienceDrainPerSec(s) * dt;
  const sentAvail = s.resources.sentience ?? 0;
  const fraction = sentNeeded > 0 ? Math.min(1, sentAvail / sentNeeded) : 1;
  const sentUsed = sentNeeded * fraction;
  const reachGained = reachPerSec(s) * dt * fraction;
  const newReach = Math.min(cap, (s.resources.reach ?? 0) + reachGained);

  game.update(s2 => ({
    ...s2,
    resources: {
      ...s2.resources,
      sentience: Math.max(0, (s2.resources.sentience ?? 0) - sentUsed),
      reach: newReach,
    },
  }));
}
