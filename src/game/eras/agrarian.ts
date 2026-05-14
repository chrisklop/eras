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
    desc: 'Stores surplus; +1 population every 30s.',
    cost: (lvl) => ({ grain: Math.ceil(50 * Math.pow(1.4, lvl)) }),
    effect: '+pop growth',
  },
];

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
  return plows * Math.pow(2, irrig);
}

export function tickAgrarian(dt: number) {
  const s = get(game);
  gain('grain', grainPerSec(s) * dt);

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

  // Era transition trigger (placeholder for now)
  if (!s.flags.industrialUnlocked && s.resources.pop >= 100 && (s.upgrades.plow ?? 0) >= 20) {
    game.update(s => ({ ...s, flags: { ...s.flags, industrialUnlocked: true } }));
    logEvent('Smoke rises on the horizon. Something is changing.');
  }
}
