import { writable, get } from 'svelte/store';
import { game, initialState, logEvent, type GameState } from './game';

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
  { id: 'oralTradition',  name: 'Oral Tradition',   cost: 1,  desc: 'Begin each run with 12 grain instead of 0.' },
  { id: 'ancestralTools', name: 'Ancestral Tools',  cost: 3,  desc: '+10% plow output, applied multiplicatively.' },
  { id: 'folkMemory',     name: 'Folk Memory',      cost: 6,  desc: '−10% on all project costs.' },
  { id: 'stoneGranaries', name: 'Stone Granaries',  cost: 10, desc: '+50% base grain storage cap.' },
  { id: 'bloodlines',     name: 'Bloodlines',       cost: 15, desc: '+0.1/sec base population growth.' },
  { id: 'ironInheritance',name: 'Iron Inheritance', cost: 25, desc: 'Begin runs with Bronze Tools researched.', requires: 'ancestralTools' },
  { id: 'sacredLibrary',  name: 'Sacred Library',   cost: 40, desc: 'Begin runs with Writing researched.',      requires: 'folkMemory' },
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
  if (nodes.ironInheritance) flags.bronzeTools = true;
  if (nodes.sacredLibrary)   flags.writing     = true;
  return {
    ...initialState,
    resources: {
      ...initialState.resources,
      grain: nodes.oralTradition ? 12 : 0,
    },
    flags,
    peakPop: 0,
    peakOutput: 0,
    startedAt: Date.now(),
    lastTick: Date.now(),
  };
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
  const earned = legacyEarnedAt(s.peakPop ?? 0, s.peakOutput ?? 0);
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
