import { get } from 'svelte/store';
import { game, spend, gain, logEvent } from '../game';

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
    desc: '+50 grain storage. Slowly grows population.',
    cost: (lvl) => ({ grain: Math.ceil(50 * Math.pow(1.4, lvl)) }),
    effect: '+50 cap',
  },
];

const BASE_GRAIN_CAP = 75;

export function grainCap(s = get(game)): number {
  const perGranary = s.flags.pottery ? 100 : 50;
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

  const granaries = s.upgrades.granary ?? 0;
  if (granaries > 0) {
    const popPerSec = granaries / 30;
    const before = Math.floor(s.resources.pop);
    gain('pop', popPerSec * dt);
    const after = Math.floor(get(game).resources.pop);
    if (after > before && after % 10 === 0) {
      logEvent(`Population reaches ${after}.`);
    }
  }

}
