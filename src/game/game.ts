import { writable, derived, get } from 'svelte/store';

export type EraId = 'agrarian' | 'industrial' | 'information' | 'algorithmic' | 'posthuman' | 'cosmic';

export interface GameState {
  era: EraId;
  resources: Record<string, number>;
  upgrades: Record<string, number>;
  flags: Record<string, boolean>;
  completedProjects: Record<string, true>;
  log: string[];
  startedAt: number;
  lastTick: number;
  peakPop?: number;
  peakOutput?: number;
  /** Active return buff: production × mult until `until` (epoch ms). */
  returnBuff?: { until: number; mult: number };
}

export const initialState: GameState = {
  era: 'agrarian',
  resources: { grain: 0, land: 1, pop: 3, output: 0, coal: 0, insight: 0, compute: 0, sentience: 0, popExtracted: 0 },
  upgrades: { plow: 0, irrigation: 0, granary: 0, factory: 0, mine: 0, coalYard: 0, signalStation: 0, archive: 0, printingPress: 0, wireNetwork: 0, serverRack: 0, dataCenter: 0, algorithmLab: 0, fiberOptic: 0, cognitionEngine: 0, surveillanceGrid: 0, memeticFoundry: 0, neuralTap: 0 },
  flags: {},
  completedProjects: {},
  log: ['A small settlement gathers by the river.'],
  startedAt: Date.now(),
  lastTick: Date.now(),
  peakPop: 0,
  peakOutput: 0,
};

export const game = writable<GameState>(initialState);

export type BuyMode = 1 | 10 | 100 | 'max';
export const buyMode = writable<BuyMode>(1);

export function logEvent(msg: string) {
  game.update(s => ({ ...s, log: [msg, ...s.log].slice(0, 50) }));
}

export function spend(res: string, amount: number): boolean {
  const s = get(game);
  if ((s.resources[res] ?? 0) < amount) return false;
  game.update(s => ({
    ...s,
    resources: { ...s.resources, [res]: s.resources[res] - amount },
  }));
  return true;
}

export function gain(res: string, amount: number) {
  game.update(s => ({
    ...s,
    resources: { ...s.resources, [res]: (s.resources[res] ?? 0) + amount },
  }));
}
