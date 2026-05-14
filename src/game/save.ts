import type { GameState } from './game';
import { game, initialState } from './game';

const KEY = 'eras:save:v1';

export function saveState(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('save failed', e);
  }
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    // Offline progress is intentionally not applied yet — comes in a later milestone.
    parsed.lastTick = Date.now();
    return parsed;
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
