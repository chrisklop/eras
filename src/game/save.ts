import type { GameState } from './game';
import { game, initialState } from './game';

const KEY = 'eras:save:v3';
const OLD_KEYS = ['eras:save:v2', 'eras:save:v1'];

export function saveState(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('save failed', e);
  }
}

export function loadState(): GameState | null {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      for (const k of OLD_KEYS) {
        raw = localStorage.getItem(k);
        if (raw) { localStorage.removeItem(k); break; }
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameState>;
    const migrated: GameState = {
      era: parsed.era ?? 'agrarian',
      resources: { grain: 0, land: 1, pop: 3, output: 0, coal: 0, insight: 0, compute: 0, ...(parsed.resources ?? {}) },
      upgrades: { plow: 0, irrigation: 0, granary: 0, factory: 0, mine: 0, coalYard: 0, signalStation: 0, archive: 0, printingPress: 0, wireNetwork: 0, serverRack: 0, dataCenter: 0, algorithmLab: 0, fiberOptic: 0, ...(parsed.upgrades ?? {}) },
      flags: parsed.flags ?? {},
      completedProjects: parsed.completedProjects ?? {},
      log: parsed.log ?? [],
      startedAt: parsed.startedAt ?? Date.now(),
      lastTick: Date.now(),
    };
    return migrated;
  } catch {
    return null;
  }
}

export function hydrate() {
  const loaded = loadState();
  if (loaded) game.set(loaded);
}

export function resetGame() {
  localStorage.removeItem(KEY);
  game.set({ ...initialState, startedAt: Date.now(), lastTick: Date.now() });
}
