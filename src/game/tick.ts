import { get } from 'svelte/store';
import { game } from './game';
import { tickAgrarian } from './eras/agrarian';
import { tickIndustrial } from './eras/industrial';
import { tickInformation } from './eras/information';
import { tickAlgorithmic } from './eras/algorithmic';
import { tickPosthuman } from './eras/posthuman';
import { saveState } from './save';
import { checkAchievements } from './achievements';

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

    // Agrarian systems keep running in later eras (grain still flows).
    tickAgrarian(dt);
    if (s.era === 'industrial' || s.era === 'information' || s.era === 'algorithmic') {
      tickIndustrial(dt);
    }
    if (s.era === 'information' || s.era === 'algorithmic' || s.era === 'posthuman') {
      tickInformation(dt);
    }
    if (s.era === 'algorithmic' || s.era === 'posthuman') {
      tickAlgorithmic(dt);
    }
    if (s.era === 'posthuman' || s.era === 'cosmic') {
      tickPosthuman(dt);
    }

    // Track peaks for legacy calculation.
    const after = get(game);
    const pop = after.resources.pop ?? 0;
    const output = after.resources.output ?? 0;
    if (pop > (after.peakPop ?? 0) || output > (after.peakOutput ?? 0)) {
      game.update(g => ({
        ...g,
        peakPop: Math.max(g.peakPop ?? 0, pop),
        peakOutput: Math.max(g.peakOutput ?? 0, output),
      }));
    }

    checkAchievements();

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
