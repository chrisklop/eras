import { get } from 'svelte/store';
import { game } from './game';
import { tickAgrarian } from './eras/agrarian';
import { saveState } from './save';

const TICK_MS = 100;
const SAVE_EVERY_MS = 5000;

let tickHandle: number | null = null;
let lastSave = Date.now();

export function startLoop() {
  if (tickHandle !== null) return;
  tickHandle = window.setInterval(() => {
    const now = Date.now();
    const s = get(game);
    const dt = (now - s.lastTick) / 1000;
    game.update(s => ({ ...s, lastTick: now }));

    switch (s.era) {
      case 'agrarian':
        tickAgrarian(dt);
        break;
      // future eras here
    }

    if (now - lastSave > SAVE_EVERY_MS) {
      saveState(get(game));
      lastSave = now;
    }
  }, TICK_MS);
}

export function stopLoop() {
  if (tickHandle !== null) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}
