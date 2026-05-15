import { writable, get } from 'svelte/store';
import { game, initialState, logEvent, type GameState } from './game';
import { legacyGainAchMult } from './achievements';

// =============================================================================
// Legacy / Prestige
// -----------------------------------------------------------------------------
// Reset the world; keep Legacy points and purchased nodes. Earnings scale by
// sqrt of peak so doubling your peak ≈ 1.4× legacy — always rewarded for going
// further, never trivialized by skipping. Node effects are bounded, additive
// to starting conditions or small multiplicative buffs. None of them affect
// cost-growth slopes or cap-growth slopes; the cost/cap invariant is untouched.
// =============================================================================

const LEGACY_KEY = 'eras:legacy:v1';
const MIN_POP_FOR_COLLAPSE = 10;

export interface LegacyState {
  points: number;
  lifetimeEarned: number;
  collapses: number;
  nodes: Record<string, boolean>;
}

const initialLegacy: LegacyState = {
  points: 0,
  lifetimeEarned: 0,
  collapses: 0,
  nodes: {},
};

export const legacy = writable<LegacyState>(initialLegacy);

export interface LegacyNode {
  id: string;
  name: string;
  cost: number;
  desc: string;
  requires?: string;
}

export const LEGACY_NODES: LegacyNode[] = [
  { id: 'oralTradition',  name: 'Oral Tradition',     cost: 1,   desc: 'Begin each run with 12 grain instead of 0.' },
  { id: 'ancestralTools', name: 'Ancestral Tools',    cost: 3,   desc: '+10% plow yield, applied multiplicatively.' },
  { id: 'folkMemory',     name: 'Folk Memory',        cost: 6,   desc: '−10% on all project costs.' },
  { id: 'stoneGranaries', name: 'Stone Granaries',    cost: 10,  desc: '+50% base grain storage cap.' },
  { id: 'bloodlines',     name: 'Bloodlines',         cost: 15,  desc: '+0.1/sec base population growth.' },
  { id: 'ironInheritance',name: 'Iron Inheritance',   cost: 25,  desc: 'Begin runs with Bronze Tools researched.',     requires: 'ancestralTools' },
  { id: 'sacredLibrary',  name: 'Sacred Library',     cost: 40,  desc: 'Begin runs with Writing researched.',          requires: 'folkMemory' },
  { id: 'ancientPottery', name: 'Ancient Pottery',    cost: 60,  desc: 'Begin runs with Pottery researched (exponential grain storage).', requires: 'stoneGranaries' },
  { id: 'longHarvest',    name: 'Long Harvest',       cost: 80,  desc: '+25% to all production rates (grain, goods, insight, compute).' },
  { id: 'heritageOfSteel',name: 'Heritage of Steel',  cost: 120, desc: 'Begin runs with Crop Rotation researched.',    requires: 'ancientPottery' },
  { id: 'lineageBuilders',name: 'Lineage of Builders',cost: 180, desc: '+1 free dwelling at the start of each run.' },
  { id: 'eternalGranary', name: 'Eternal Granary',    cost: 250, desc: '+1 free granary at the start of each run.',    requires: 'heritageOfSteel' },
  { id: 'remembered',     name: 'A People Remembered',cost: 350, desc: '+50% to all production rates (stacks with Long Harvest).', requires: 'longHarvest' },
  { id: 'firstFire',      name: 'First Fire',         cost: 500, desc: 'Begin runs with The Industrial Revolution complete (skip to Steam & Steel).', requires: 'remembered' },
  { id: 'wireNation',     name: 'A Wired Nation',     cost: 1000,desc: 'Begin runs with The Telegraph complete (skip to Wire & Signal).',           requires: 'firstFire' },
];

export function legacyEarnedAt(peakPop: number, peakOutput: number): number {
  const fromPop    = Math.sqrt(Math.max(0, peakPop) / 5);
  const fromOutput = Math.sqrt(Math.max(0, peakOutput) / 50);
  return Math.floor(fromPop + fromOutput);
}

export function canCollapse(s: GameState): boolean {
  return (s.peakPop ?? 0) >= MIN_POP_FOR_COLLAPSE;
}

export function nodeOwned(id: string, l: LegacyState = get(legacy)): boolean {
  return !!l.nodes[id];
}

export function nodeAvailable(node: LegacyNode, l: LegacyState = get(legacy)): boolean {
  if (nodeOwned(node.id, l)) return false;
  if (node.requires && !nodeOwned(node.requires, l)) return false;
  return true;
}

export function buyNode(id: string) {
  const node = LEGACY_NODES.find(n => n.id === id);
  if (!node) return;
  const l = get(legacy);
  if (!nodeAvailable(node, l)) return;
  if (l.points < node.cost) return;
  legacy.update(x => ({
    ...x,
    points: x.points - node.cost,
    nodes: { ...x.nodes, [id]: true },
  }));
  saveLegacy();
  logEvent(`Legacy node acquired: ${node.name}.`);
}

/** Starting state for a new run, accounting for legacy nodes. */
export function legacyStartingState(): GameState {
  const l = get(legacy);
  const nodes = l.nodes;
  const flags: Record<string, boolean> = {};
  if (nodes.ironInheritance)  flags.bronzeTools = true;
  if (nodes.sacredLibrary)    flags.writing     = true;
  if (nodes.ancientPottery)   flags.pottery     = true;
  if (nodes.heritageOfSteel)  flags.cropRotation = true;
  const upgrades = { ...initialState.upgrades } as Record<string, number>;
  if (nodes.lineageBuilders) upgrades.dwelling = Math.max(1, upgrades.dwelling ?? 0);
  if (nodes.eternalGranary)  upgrades.granary  = Math.max(1, upgrades.granary  ?? 0);
  let era: GameState['era'] = 'agrarian';
  const completedProjects: Record<string, true> = {};
  if (nodes.firstFire) {
    era = 'industrial';
    completedProjects.industrialRevolution = true;
    completedProjects.bronzeTools = true;
    completedProjects.writing = true;
    completedProjects.compass = true;
    flags.bronzeTools = true;
    flags.writing = true;
    flags.compass = true;
  }
  if (nodes.wireNation) {
    era = 'information';
    completedProjects.telegraph = true;
    completedProjects.electricity = true;
    completedProjects.logistics = true;
    completedProjects.massProduction = true;
    flags.electricity = true;
    flags.logistics = true;
    flags.massProduction = true;
  }
  return {
    ...initialState,
    era,
    resources: {
      ...initialState.resources,
      grain: nodes.oralTradition ? 12 : 0,
    },
    upgrades,
    flags,
    completedProjects,
    peakPop: 0,
    peakOutput: 0,
    startedAt: Date.now(),
    lastTick: Date.now(),
  };
}

/** Universal production multiplier from Long Harvest / Remembered nodes. */
export function legacyProductionMultiplier(l: LegacyState = get(legacy)): number {
  let m = 1;
  if (l.nodes.longHarvest) m *= 1.25;
  if (l.nodes.remembered)  m *= 1.5;
  return m;
}

/** Production-time multipliers exposed to game systems. */
export function legacyPlowMultiplier(l: LegacyState = get(legacy)): number {
  return nodeOwned('ancestralTools', l) ? 1.1 : 1;
}
export function legacyProjectCostMultiplier(l: LegacyState = get(legacy)): number {
  return nodeOwned('folkMemory', l) ? 0.9 : 1;
}
export function legacyGrainCapMultiplier(l: LegacyState = get(legacy)): number {
  return nodeOwned('stoneGranaries', l) ? 1.5 : 1;
}
export function legacyPopGrowthBonus(l: LegacyState = get(legacy)): number {
  return nodeOwned('bloodlines', l) ? 0.1 : 0;
}

export function collapse(): { earned: number; total: number } | null {
  const s = get(game);
  if (!canCollapse(s)) return null;
  const earned = Math.floor(legacyEarnedAt(s.peakPop ?? 0, s.peakOutput ?? 0) * legacyGainAchMult());
  legacy.update(x => ({
    ...x,
    points: x.points + earned,
    lifetimeEarned: x.lifetimeEarned + earned,
    collapses: x.collapses + 1,
  }));
  saveLegacy();
  game.set(legacyStartingState());
  logEvent(`The civilization falls. +${earned} legacy carried forward.`);
  return { earned, total: get(legacy).points };
}

export function saveLegacy() {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(get(legacy)));
  } catch (e) {
    console.warn('legacy save failed', e);
  }
}

export function hydrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<LegacyState>;
    legacy.set({
      points: parsed.points ?? 0,
      lifetimeEarned: parsed.lifetimeEarned ?? 0,
      collapses: parsed.collapses ?? 0,
      nodes: parsed.nodes ?? {},
    });
  } catch {
    /* ignore */
  }
}

export function wipeLegacy() {
  localStorage.removeItem(LEGACY_KEY);
  legacy.set(initialLegacy);
}
