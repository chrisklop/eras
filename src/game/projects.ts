import { get } from 'svelte/store';
import { game, logEvent, type GameState, type EraId } from './game';
import { legacyProjectCostMultiplier } from './legacy';

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
    cost: { grain: 25 },
    era: 'agrarian',
    requires: s => (s.upgrades.plow ?? 0) >= 3,
    requirementsText: 'Requires 3 plows',
    apply: s => ({ flags: { ...s.flags, wattleFences: true } }),
  },
  {
    id: 'cropRotation',
    name: 'Crop Rotation',
    desc: 'Alternate fields to keep the soil alive. Plows produce 2× base output.',
    cost: { grain: 300 },
    era: 'agrarian',
    requires: s => (s.upgrades.irrigation ?? 0) >= 2,
    requirementsText: 'Requires 2 irrigation ditches',
    apply: s => ({ flags: { ...s.flags, cropRotation: true } }),
  },
  {
    id: 'pottery',
    name: 'Pottery',
    desc: 'Fire clay vessels. Each granary now multiplies storage by 1.5× instead of adding a fixed bit. Paradigm shift.',
    cost: { grain: 80 },
    era: 'agrarian',
    requires: s => (s.upgrades.granary ?? 0) >= 1,
    requirementsText: 'Requires 1 granary',
    apply: s => ({ flags: { ...s.flags, pottery: true } }),
  },
  {
    id: 'masonry',
    name: 'Masonry',
    desc: 'Stack stones, fire brick. Build Brick Houses: each holds 12 (was 5), max 30.',
    cost: { grain: 400 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.pottery,
    requirementsText: 'Requires Pottery',
    apply: s => ({ flags: { ...s.flags, masonry: true } }),
  },
  {
    id: 'cityPlanning',
    name: 'City Planning',
    desc: 'Roads, water, sewers. Insulae: each holds 25, max 50.',
    cost: { grain: 3000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.masonry,
    requirementsText: 'Requires Masonry',
    apply: s => ({ flags: { ...s.flags, cityPlanning: true } }),
  },
  {
    id: 'threeField',
    name: 'Three-Field System',
    desc: 'Rotate winter wheat, spring legumes, fallow. Citizens need 30% less grain.',
    cost: { grain: 1000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.cropRotation,
    requirementsText: 'Requires Crop Rotation',
    apply: s => ({ flags: { ...s.flags, threeField: true } }),
  },
  {
    id: 'bronzeTools',
    name: 'Bronze Tools',
    desc: 'Cast harder blades. Plows produce 3× more.',
    cost: { grain: 2500 },
    era: 'agrarian',
    requires: s => (s.upgrades.plow ?? 0) >= 10,
    requirementsText: 'Requires 10 plows',
    apply: s => ({ flags: { ...s.flags, bronzeTools: true } }),
  },
  {
    id: 'plowAgriculture',
    name: 'Plow Agriculture',
    desc: 'Deep furrows, ox-drawn iron. Citizens need a further 20% less grain.',
    cost: { grain: 4000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.bronzeTools,
    requirementsText: 'Requires Bronze Tools',
    apply: s => ({ flags: { ...s.flags, plowAgriculture: true } }),
  },
  {
    id: 'writing',
    name: 'Writing',
    desc: 'Scribes record yields. Population now slowly produces grain.',
    cost: { grain: 5000 },
    era: 'agrarian',
    requires: s => (s.resources.pop ?? 0) >= 30,
    requirementsText: 'Requires 30 population',
    apply: s => ({ flags: { ...s.flags, writing: true } }),
  },
  {
    id: 'compass',
    name: 'Compass',
    desc: 'Maps and direction. Trade flourishes; population grows faster.',
    cost: { grain: 12000 },
    era: 'agrarian',
    requires: s => !!s.completedProjects.bronzeTools && !!s.completedProjects.writing,
    requirementsText: 'Requires Bronze Tools, Writing',
    apply: s => ({ flags: { ...s.flags, compass: true } }),
  },
  {
    id: 'industrialRevolution',
    name: 'The Industrial Revolution',
    desc: 'Steam and smoke. Begin the next era. Grain remains, but Output is the new measure.',
    cost: { grain: 40000 },
    era: 'agrarian',
    requires: s =>
      !!s.completedProjects.bronzeTools &&
      !!s.completedProjects.writing &&
      !!s.completedProjects.compass &&
      (s.resources.pop ?? 0) >= 80,
    requirementsText: 'Requires Bronze Tools, Writing, Compass, 80 population',
    apply: _s => ({ era: 'industrial' as EraId }),
    onComplete: () => {
      logEvent('Smoke rises. The age of grain ends.');
    },
  },

  // ============================== Industrial era ==============================

  {
    id: 'bessemer',
    name: 'Bessemer Process',
    desc: 'Coal-fired steel. Factories now require coal alongside grain, but produce 3× output.',
    cost: { output: 300 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.factory ?? 0) >= 3 && (s.upgrades.mine ?? 0) >= 1,
    requirementsText: 'Requires 3 factories, 1 mine',
    apply: s => ({ flags: { ...s.flags, bessemer: true } }),
  },
  {
    id: 'massProduction',
    name: 'Mass Production',
    desc: 'Standard parts, assembly lines. Factories produce 2× output.',
    cost: { output: 1200 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.factory ?? 0) >= 4,
    requirementsText: 'Requires 4 factories',
    apply: s => ({ flags: { ...s.flags, massProduction: true } }),
  },
  {
    id: 'logistics',
    name: 'Logistics',
    desc: 'Ledgers, trains, schedules. Warehouses multiply storage instead of adding to it.',
    cost: { output: 3000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.warehouse ?? 0) >= 3,
    requirementsText: 'Requires 3 warehouses',
    apply: s => ({ flags: { ...s.flags, logistics: true } }),
  },
  {
    id: 'refining',
    name: 'Coal Refining',
    desc: 'Coke ovens, gas works. Coal Yards multiply storage instead of adding to it.',
    cost: { output: 2000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.coalYard ?? 0) >= 3,
    requirementsText: 'Requires 3 coal yards',
    apply: s => ({ flags: { ...s.flags, refining: true } }),
  },
  {
    id: 'steelMills',
    name: 'Steel Mills',
    desc: 'Vertical integration. Coal mines produce 2× coal.',
    cost: { output: 4000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && !!s.completedProjects.bessemer && (s.upgrades.mine ?? 0) >= 8,
    requirementsText: 'Requires Bessemer, 8 mines',
    apply: s => ({ flags: { ...s.flags, steelMills: true } }),
  },
  {
    id: 'electricity',
    name: 'Electricity',
    desc: 'Wire the cities. Factory output doubles again.',
    cost: { output: 25000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && !!s.completedProjects.massProduction && (s.upgrades.factory ?? 0) >= 12,
    requirementsText: 'Requires Mass Production, 12 factories',
    apply: s => ({ flags: { ...s.flags, electricity: true } }),
  },
  {
    id: 'tenements',
    name: 'Tenements',
    desc: 'Cramped urban housing. Each tenement holds 60, max 80.',
    cost: { output: 6000 },
    era: 'industrial',
    requires: s => s.era === 'industrial' && (s.upgrades.factory ?? 0) >= 5,
    requirementsText: 'Requires 5 factories',
    apply: s => ({ flags: { ...s.flags, tenements: true } }),
  },
  {
    id: 'apartmentBlocks',
    name: 'Apartment Blocks',
    desc: 'Steel-framed high-rises. Each holds 150, max 120.',
    cost: { output: 60000 },
    era: 'industrial',
    requires: s => !!s.completedProjects.electricity,
    requirementsText: 'Requires Electricity',
    apply: s => ({ flags: { ...s.flags, apartmentBlocks: true } }),
  },
  {
    id: 'telegraph',
    name: 'Telegraph',
    desc: 'Instantaneous communication. Unlocks the next era.',
    cost: { output: 200000 },
    era: 'industrial',
    requires: s =>
      s.era === 'industrial' &&
      !!s.completedProjects.electricity &&
      !!s.completedProjects.logistics,
    requirementsText: 'Requires Electricity, Logistics',
    apply: _s => ({ era: 'information' as EraId }),
    onComplete: () => {
      logEvent('The wires hum. Information now travels faster than thought.');
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

export function effectiveProjectCost(p: Project): Record<string, number> {
  const mult = legacyProjectCostMultiplier();
  const out: Record<string, number> = {};
  for (const [res, amt] of Object.entries(p.cost)) {
    if (amt !== undefined) out[res] = Math.ceil(amt * mult);
  }
  return out;
}

export function canAffordProject(p: Project, s: GameState): boolean {
  for (const [res, amt] of Object.entries(effectiveProjectCost(p))) {
    if ((s.resources[res] ?? 0) < amt) return false;
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
  for (const [res, amt] of Object.entries(effectiveProjectCost(p))) {
    newResources[res] = (newResources[res] ?? 0) - amt;
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
