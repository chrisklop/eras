// =============================================================================
// Information era — Of Wire & Signal
//
// New primary currency: Insight (produced by Signal Stations from Goods).
// Storage: Archive — linear pre-Movable Type, ×1.5 cap each after.
// Multiplier: Printing Press — each level ×1.15 Insight production.
// Efficiency: Wire Network — each level −10% Goods drain per station.
//
// Invariant: cost_growth < cap_growth, multipliers bounded to project flags.
// =============================================================================

import { get } from 'svelte/store';
import { game, spend, logEvent, type GameState } from '../game';
import { bulkCost, affordableCount, laborFraction } from './agrarian';
import { insightProdAchMult } from '../achievements';
import { legacyProductionMultiplier } from '../legacy';
import { returnBuffMultiplier } from '../offline';

const STATION_BASE_COST = 40000;            // paid in goods
const STATION_COST_GROWTH = 1.22;
const STATION_GOODS_DRAIN = 30;             // per second
const STATION_INSIGHT_BASE = 1.0;
// Population produces a baseline trickle of Insight from the moment you
// enter the Information era — so Movable Type isn't gated behind your
// first Station. Boosted by Public Education.
const BASE_POP_INSIGHT = 0.005;
const PUBLIC_EDUCATION_POP_INSIGHT = 0.05;
const TELEGRAPH_NETWORK_MULT = 1.8;
const MECHANICAL_COMPUTING_MULT = 1.5;
const RADIO_MULT = 1.5;
const PRESS_PER_LEVEL = 1.15;

const PRESS_BASE_COST = 100000;             // paid in goods
const PRESS_COST_GROWTH = 1.16;

const ARCHIVE_BASE_COST = 30000;            // paid in goods
const ARCHIVE_COST_GROWTH = 1.13;

const WIRE_BASE_COST = 20000;               // paid in insight
const WIRE_COST_GROWTH = 1.18;
const WIRE_MAX_PRE = 7;
const WIRE_MAX_POST = 14;                   // after Mass Communications

const BASE_INSIGHT_CAP = 4000;
const PRE_MOVABLE_TYPE_CAP_PER_ARCHIVE = 4000;
const MOVABLE_TYPE_CAP_MULT = 1.5;

const WORKERS_PER_STATION = 80;

export interface InformationUpgrade {
  id: string;
  name: string;
  desc: string;
  cost: (level: number) => { goods?: number; insight?: number };
  effect: string;
  max?: number;
  visible?: (s: GameState) => boolean;
}

export const informationUpgrades: InformationUpgrade[] = [
  {
    id: 'signalStation',
    name: 'Signal Station',
    desc: 'Burns Goods to produce Insight. Each needs 80 workers.',
    cost: (lvl) => ({ goods: Math.ceil(STATION_BASE_COST * Math.pow(STATION_COST_GROWTH, lvl)) }),
    effect: '+0.5 insight/sec',
  },
  {
    id: 'archive',
    name: 'Archive',
    desc: 'Stores Insight. Pre-Movable Type: +4K cap. Post: ×1.5 cap each.',
    cost: (lvl) => ({ goods: Math.ceil(ARCHIVE_BASE_COST * Math.pow(ARCHIVE_COST_GROWTH, lvl)) }),
    effect: '+Insight storage',
    visible: s => (s.upgrades.signalStation ?? 0) >= 1,
  },
  {
    id: 'printingPress',
    name: 'Printing Press',
    desc: 'Type, ink, news. Each level boosts Insight production by +15%.',
    cost: (lvl) => ({ goods: Math.ceil(PRESS_BASE_COST * Math.pow(PRESS_COST_GROWTH, lvl)) }),
    effect: '+15% Insight/sec',
    visible: s => (s.upgrades.signalStation ?? 0) >= 2,
  },
  {
    id: 'wireNetwork',
    name: 'Wire Network',
    desc: 'Copper across continents. Each level cuts station Goods drain by 10% (floor 30%).',
    cost: (lvl) => ({ insight: Math.ceil(WIRE_BASE_COST * Math.pow(WIRE_COST_GROWTH, lvl)) }),
    effect: '−10% Goods drain',
    max: WIRE_MAX_PRE,
    visible: s => (s.upgrades.archive ?? 0) >= 1,
  },
];

export function informationUpgradeVisible(u: InformationUpgrade, s: GameState): boolean {
  if ((s.upgrades[u.id] ?? 0) > 0) return true;
  return u.visible ? u.visible(s) : true;
}

export function insightCap(s: GameState = get(game)): number {
  const archives = s.upgrades.archive ?? 0;
  const wonderMult = s.flags.statueOfLiberty ? 1.5 : 1;
  if (s.flags.movableType) {
    return Math.floor(BASE_INSIGHT_CAP * wonderMult * Math.pow(MOVABLE_TYPE_CAP_MULT, archives));
  }
  return Math.floor((BASE_INSIGHT_CAP + PRE_MOVABLE_TYPE_CAP_PER_ARCHIVE * archives) * wonderMult);
}

export function wireMax(s: GameState = get(game)): number {
  return s.flags.massCommunications ? WIRE_MAX_POST : WIRE_MAX_PRE;
}

/** Bounded cost multiplier for stations — project flags only. */
export function stationCostMult(s: GameState = get(game)): number {
  const telegraph = s.flags.telegraphNetwork ? TELEGRAPH_NETWORK_MULT : 1;
  const compute = s.flags.mechanicalComputing ? MECHANICAL_COMPUTING_MULT : 1;
  const radio = s.flags.radio ? RADIO_MULT : 1;
  return telegraph * compute * radio;
}

export function stationStaticMult(s: GameState = get(game)): number {
  const presses = s.upgrades.printingPress ?? 0;
  const wonderMult = s.flags.empireState ? 1.25 : 1;
  return Math.pow(PRESS_PER_LEVEL, presses) * stationCostMult(s) * wonderMult;
}

export function laborInfoDemand(s: GameState = get(game)): number {
  return (s.upgrades.signalStation ?? 0) * WORKERS_PER_STATION;
}

export function stationGoodsDrainPerSec(s: GameState = get(game)): number {
  const wires = Math.min(wireMax(s), s.upgrades.wireNetwork ?? 0);
  const reduction = Math.max(0.3, 1 - 0.1 * wires);
  const wonderMult = s.flags.hooverDam ? 0.5 : 1;
  return (s.upgrades.signalStation ?? 0) * STATION_GOODS_DRAIN * reduction * wonderMult;
}

export function insightPerSec(s: GameState = get(game)): number {
  // Only kicks in once Information era is reached.
  if (s.era !== 'information' && s.era !== 'algorithmic' && s.era !== 'posthuman') return 0;
  const stations = s.upgrades.signalStation ?? 0;
  const labor = laborFraction(s);
  const pop = Math.max(0, (s.resources.pop ?? 0) - laborInfoDemand(s));
  const popRate = s.flags.publicEducation ? PUBLIC_EDUCATION_POP_INSIGHT : BASE_POP_INSIGHT;
  const popInsight = pop * popRate;
  return (stations * STATION_INSIGHT_BASE * stationStaticMult(s) * labor + popInsight) * insightProdAchMult() * legacyProductionMultiplier() * returnBuffMultiplier();
}

const INFORMATION_MULTS: Record<string, (s: GameState) => number> = {
  signalStation: s => stationCostMult(s),
  printingPress: () => 1,
  archive: () => 1,
  wireNetwork: () => 1,
};

const INFORMATION_CURVES: Record<
  string,
  { base: number; growth: number; max?: number; payRes: 'goods' | 'insight' }
> = {
  signalStation: { base: STATION_BASE_COST, growth: STATION_COST_GROWTH, payRes: 'goods' },
  archive:       { base: ARCHIVE_BASE_COST, growth: ARCHIVE_COST_GROWTH, payRes: 'goods' },
  printingPress: { base: PRESS_BASE_COST,   growth: PRESS_COST_GROWTH,   payRes: 'goods' },
  wireNetwork:   { base: WIRE_BASE_COST,    growth: WIRE_COST_GROWTH,    payRes: 'insight', max: WIRE_MAX_PRE },
};

function infoScaledBase(id: string, s: GameState): number {
  const curve = INFORMATION_CURVES[id];
  const m = INFORMATION_MULTS[id] ? INFORMATION_MULTS[id](s) : 1;
  return curve.base * m;
}

function effectiveMax(id: string, def: InformationUpgrade, s: GameState): number | undefined {
  if (id === 'wireNetwork') return wireMax(s);
  return def.max;
}

export function buyInformationUpgrade(id: string, count: number | 'max' = 1) {
  const s = get(game);
  const def = informationUpgrades.find(u => u.id === id);
  const curve = INFORMATION_CURVES[id];
  if (!def || !curve) return;
  const lvl = s.upgrades[id] ?? 0;
  const max = effectiveMax(id, def, s);
  if (max !== undefined && lvl >= max) return;
  const remaining = max !== undefined ? max - lvl : Infinity;
  // payRes is the internal key; for goods that's 'output' in resources.
  const resKey = curve.payRes === 'goods' ? 'output' : 'insight';
  const available = s.resources[resKey] ?? 0;
  const effectiveBase = infoScaledBase(id, s);
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

export function nextInfoBulkCost(id: string, count: number | 'max', state?: GameState): { total: number; n: number; res: 'goods' | 'insight' } {
  const s = state ?? get(game);
  const curve = INFORMATION_CURVES[id];
  if (!curve) return { total: 0, n: 0, res: 'goods' };
  const lvl = s.upgrades[id] ?? 0;
  const def = informationUpgrades.find(u => u.id === id)!;
  const max = effectiveMax(id, def, s);
  const resKey = curve.payRes === 'goods' ? 'output' : 'insight';
  const available = s.resources[resKey] ?? 0;
  const effectiveBase = infoScaledBase(id, s);
  let n =
    count === 'max'
      ? affordableCount(effectiveBase, curve.growth, lvl, available, max)
      : Math.min(count, max !== undefined ? max - lvl : Infinity);
  return { total: bulkCost(effectiveBase, curve.growth, lvl, n), n, res: curve.payRes };
}

export function tickInformation(dt: number) {
  const s = get(game);
  const stations = s.upgrades.signalStation ?? 0;
  const cap = insightCap(s);

  // Station path: drain goods → produce station insight; pop trickle layered on top.
  if (stations > 0) {
    const goodsNeeded = stationGoodsDrainPerSec(s) * dt;
    const goodsAvail = s.resources.output ?? 0;
    const fraction = goodsNeeded > 0 ? Math.min(1, goodsAvail / goodsNeeded) : 1;
    const goodsUsed = goodsNeeded * fraction;
    // Station portion is rate-limited by fuel fraction; pop trickle is unaffected.
    const pop = Math.max(0, (s.resources.pop ?? 0) - laborInfoDemand(s));
    const popRate = s.flags.publicEducation ? PUBLIC_EDUCATION_POP_INSIGHT : BASE_POP_INSIGHT;
    const labor = laborFraction(s);
    const stationInsight = stations * STATION_INSIGHT_BASE * stationStaticMult(s) * labor * fraction;
    const totalRate = (stationInsight + pop * popRate) * insightProdAchMult();
    const newInsight = Math.min(cap, (s.resources.insight ?? 0) + totalRate * dt);
    game.update(s2 => ({
      ...s2,
      resources: {
        ...s2.resources,
        output: Math.max(0, (s2.resources.output ?? 0) - goodsUsed),
        insight: newInsight,
      },
    }));
    return;
  }

  // No stations yet: just the pop trickle, no goods drain.
  const rate = insightPerSec(s);
  if (rate <= 0) return;
  const newInsight = Math.min(cap, (s.resources.insight ?? 0) + rate * dt);
  game.update(s2 => ({
    ...s2,
    resources: { ...s2.resources, insight: newInsight },
  }));
}
