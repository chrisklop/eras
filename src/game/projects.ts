import { get } from 'svelte/store';
import { game, logEvent, type GameState, type EraId } from './game';

export interface Project {
  id: string;
  name: string;
  desc: string;
  cost: { grain?: number; output?: number };
  era: EraId | 'any';
  requires: (s: GameState) => boolean;
  requirementsText: string;
  apply: (s: GameState) => Partial<GameState>;
  onComplete?: () => void;
}

export const projects: Project[] = [
  {
    id: 'wattleFences',
    name: 'Wattle Fences',
    desc: 'Weave thorny branches into protective walls. +75 grain storage.',
    cost: { grain: 30 },
    era: 'agrarian',
    requires: s => (s.upgrades.plow ?? 0) >= 3,
    requirementsText: 'Requires 3 plows',
    apply: s => ({ flags: { ...s.flags, wattleFences: true } }),
  },
  {
    id: 'cropRotation',
    name: 'Crop Rotation',
    desc: 'Alternate fields to keep the soil alive. Plows produce 2× base output.',
    cost: { grain: 200 },
    era: 'agrarian',
    requires: s => (s.upgrades.irrigation ?? 0) >= 2,
    requirementsText: 'Requires 2 irrigation ditches',
    apply: s => ({ flags: { ...s.flags, cropRotation: true } }),
  },
  {
    id: 'pottery',
    name: 'Pottery',
    desc: 'Fire clay vessels to hold the harvest. Each granary now stores 100.',
    cost: { grain: 150 },
    era: 'agrarian',
    requires: s => (s.upgrades.granary ?? 0) >= 1,
    requirementsText: 'Requires 1 granary',
    apply: s => ({ flags: { ...s.flags, pottery: true } }),
  },
  {
    id: 'bronzeTools',
    name: 'Bronze Tools',
    desc: 'Cast harder blades. Plows produce 3× more.',
    cost: { grain: 800 },
    era: 'agrarian',
    requires: s => (s.upgrades.plow ?? 0) >= 12,
    requirementsText: 'Requires 12 plows',
    apply: s => ({ flags: { ...s.flags, bronzeTools: true } }),
  },
  {
    id: 'writing',
    name: 'Writing',
    desc: 'Scribes record yields. Population now slowly produces grain.',
    cost: { grain: 1500 },
    era: 'agrarian',
    requires: s => (s.resources.pop ?? 0) >= 30,
    requirementsText: 'Requires 30 population',
    apply: s => ({ flags: { ...s.flags, writing: true } }),
  },
  {
    id: 'industrialRevolution',
    name: 'The Industrial Revolution',
    desc: 'Steam and smoke. Begin the next era. Grain remains, but Output is the new measure.',
    cost: { grain: 5000 },
    era: 'agrarian',
    requires: s =>
      !!s.completedProjects.bronzeTools &&
      !!s.completedProjects.writing &&
      (s.resources.pop ?? 0) >= 80,
    requirementsText: 'Requires Bronze Tools, Writing, 80 population',
    apply: _s => ({ era: 'industrial' as EraId }),
    onComplete: () => {
      logEvent('Smoke rises. The age of grain ends.');
    },
  },
];

export function projectAvailable(p: Project, s: GameState): boolean {
  if (s.completedProjects[p.id]) return false;
  return p.requires(s);
}

export function projectIncomplete(p: Project, s: GameState): boolean {
  return !s.completedProjects[p.id];
}

export function canAffordProject(p: Project, s: GameState): boolean {
  for (const [res, amt] of Object.entries(p.cost)) {
    if ((s.resources[res] ?? 0) < (amt ?? 0)) return false;
  }
  return true;
}

export function completeProject(id: string) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const s = get(game);
  if (!projectAvailable(p, s)) return;
  if (!canAffordProject(p, s)) return;

  const newResources = { ...s.resources };
  for (const [res, amt] of Object.entries(p.cost)) {
    newResources[res] = (newResources[res] ?? 0) - (amt ?? 0);
  }
  const patch = p.apply(s);
  game.update(cur => ({
    ...cur,
    ...patch,
    resources: { ...newResources, ...(patch.resources ?? {}) },
    completedProjects: { ...cur.completedProjects, [p.id]: true },
  }));
  logEvent(`Project complete: ${p.name}.`);
  p.onComplete?.();
}
