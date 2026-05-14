import { get } from 'svelte/store';
import { game, spend, logEvent } from '../game';

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
    cost: (lvl) => ({ grain: Math.ceil(10 * Math.pow(1.15, lvl)) }),
    effect: '+1 grain/sec',
  },
  {
    id: 'irrigation',
    name: 'Irrigation Ditch',
    desc: 'Each level doubles plow output.',
    cost: (lvl) => ({ grain: Math.ceil(100 * Math.pow(2.5, lvl)) }),
    effect: '×2 plow output',
    max: 8,
  },
  {
    id: 'granary',
    name: 'Granary',
    desc: '+50 grain storage.',
    cost: (lvl) => ({ grain: Math.ceil(50 * Math.pow(1.12, lvl)) }),
    effect: '+50 cap',
  },
  {
    id: 'dwelling',
    name: 'Dwelling',
    desc: 'A roof for five. +5 to population cap.',
    cost: (lvl) => ({ grain: Math.ceil(25 * Math.pow(1.18, lvl)) }),
    effect: '+5 pop cap',
  },
];

const BASE_POP_CAP = 10;
const POP_PER_DWELLING = 5;
const POP_GROWTH_PER_SEC = 0.5;

export function popCap(s = get(game)): number {
  return BASE_POP_CAP + POP_PER_DWELLING * (s.upgrades.dwelling ?? 0);
}

const BASE_GRAIN_CAP = 75;

export function grainCap(s = get(game)): number {
  const perGranary = s.flags.pottery ? 150 : 50;
  const base = BASE_GRAIN_CAP + (s.flags.wattleFences ? 75 : 0);
  return base + perGranary * (s.upgrades.granary ?? 0);
}

export function buyUpgrade(id: string) {
  const s = get(game);
  const def = agrarianUpgrades.find(u => u.id === id);
  if (!def) return;
  const lvl = s.upgrades[id] ?? 0;
  if (def.max && lvl >= def.max) return;
  const cost = def.cost(lvl);
  if (!spend('grain', cost.grain)) return;
  game.update(s => ({
    ...s,
    upgrades: { ...s.upgrades, [id]: lvl + 1 },
  }));
  if (lvl === 0) logEvent(`First ${def.name.toLowerCase()} built.`);
}

export function grainPerSec(s = get(game)): number {
  const plows = s.upgrades.plow ?? 0;
  const irrig = s.upgrades.irrigation ?? 0;
  const baseMult = s.flags.cropRotation ? 2 : 1;
  const toolMult = s.flags.bronzeTools ? 3 : 1;
  const plowOutput = plows * Math.pow(2, irrig) * baseMult * toolMult;
  const popOutput = s.flags.writing ? (s.resources.pop ?? 0) * 0.5 : 0;
  return plowOutput + popOutput;
}

function gainGrainCapped(amount: number) {
  const s = get(game);
  const cap = grainCap(s);
  const next = Math.min(cap, (s.resources.grain ?? 0) + amount);
  game.update(s => ({ ...s, resources: { ...s.resources, grain: next } }));
}

export function gatherGrain() {
  gainGrainCapped(1);
}

export function tickAgrarian(dt: number) {
  const s = get(game);
  gainGrainCapped(grainPerSec(s) * dt);

  const pop = s.resources.pop ?? 0;
  const cap = popCap(s);
  const fed = (s.resources.grain ?? 0) > 0;
  if (fed && pop < cap) {
    const before = Math.floor(pop);
    const next = Math.min(cap, pop + POP_GROWTH_PER_SEC * dt);
    game.update(s => ({ ...s, resources: { ...s.resources, pop: next } }));
    const after = Math.floor(next);
    if (after > before && after % 10 === 0) {
      logEvent(`Population reaches ${after}.`);
    }
  }
}
