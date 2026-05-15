import { get } from 'svelte/store';
import { game, logEvent, type GameState } from './game';
import { grainPerSec, grainConsumedPerSec, grainCap } from './eras/agrarian';
import { outputPerSec, outputCap, coalPerSec, coalCap, coalDrainPerSec, grainDrainPerSec } from './eras/industrial';
import { insightPerSec, insightCap, stationGoodsDrainPerSec } from './eras/information';
import { computePerSec, computeCap, rackInsightDrainPerSec } from './eras/algorithmic';

// =============================================================================
// Offline catch-up + return buff
//
// On hydrate, compute time since lastTick:
//  - If ≥ 2 min: award 25% of net production rates × elapsed (capped at
//    1 hour of elapsed time, and each resource clamped to its storage cap).
//  - If ≥ 30 min: grant a ×2 production buff for 5 minutes of real time.
//
// Both rewards are bounded by storage caps and time; they cannot break the
// cost/cap invariant.
// =============================================================================

const CATCHUP_MIN_SEC = 120;            // 2 min — below this, ignore
const CATCHUP_MAX_SEC = 60 * 60;        // 1 hour cap on catch-up duration
const CATCHUP_RATE = 0.25;              // 25% of production
const BUFF_THRESHOLD_SEC = 30 * 60;     // 30 min away triggers buff
const BUFF_DURATION_MS = 5 * 60 * 1000; // 5 min buff
const BUFF_MULT = 2;

export interface OfflineReport {
  awaySec: number;
  catchup: Record<string, number>;
  buffMs: number;
}

/** Multiplier currently provided by the return buff (1 if expired). */
export function returnBuffMultiplier(s: GameState = get(game)): number {
  const buff = s.returnBuff;
  if (!buff) return 1;
  if (Date.now() >= buff.until) return 1;
  return buff.mult;
}

/** Returns true while a buff is active. */
export function returnBuffActive(s: GameState = get(game)): boolean {
  return !!s.returnBuff && Date.now() < s.returnBuff.until;
}

/** Seconds remaining on the active buff, or 0. */
export function returnBuffRemaining(s: GameState = get(game)): number {
  if (!s.returnBuff) return 0;
  return Math.max(0, (s.returnBuff.until - Date.now()) / 1000);
}

/** Apply offline catch-up & maybe buff on game hydrate. Returns a report. */
export function applyOffline(): OfflineReport | null {
  const now = Date.now();
  const s = get(game);
  const lastTick = s.lastTick ?? now;
  const awaySec = (now - lastTick) / 1000;
  if (awaySec < CATCHUP_MIN_SEC) return null;

  const effectiveSec = Math.min(awaySec, CATCHUP_MAX_SEC);

  // Compute net rates at current era and apply CATCHUP_RATE × time, clamped to caps.
  const newRes = { ...s.resources };
  const catchup: Record<string, number> = {};

  // Grain (net of consumption)
  const grainNet = grainPerSec(s) - grainConsumedPerSec(s);
  if (grainNet > 0) {
    const gCap = grainCap(s);
    const gAdd = Math.max(0, Math.min(gCap - (newRes.grain ?? 0), grainNet * effectiveSec * CATCHUP_RATE));
    if (gAdd > 0) { newRes.grain = (newRes.grain ?? 0) + gAdd; catchup.grain = gAdd; }
  }

  // Era-specific resource flows
  if (s.era === 'industrial' || s.era === 'information' || s.era === 'algorithmic') {
    const coalNet = coalPerSec(s) - coalDrainPerSec(s);
    if (coalNet > 0) {
      const cCap = coalCap(s);
      const cAdd = Math.max(0, Math.min(cCap - (newRes.coal ?? 0), coalNet * effectiveSec * CATCHUP_RATE));
      if (cAdd > 0) { newRes.coal = (newRes.coal ?? 0) + cAdd; catchup.coal = cAdd; }
    }
    const goodsNet = outputPerSec(s) - (s.era === 'industrial' ? 0 : stationGoodsDrainPerSec(s));
    if (goodsNet > 0) {
      const oCap = outputCap(s);
      const oAdd = Math.max(0, Math.min(oCap - (newRes.output ?? 0), goodsNet * effectiveSec * CATCHUP_RATE));
      if (oAdd > 0) { newRes.output = (newRes.output ?? 0) + oAdd; catchup.output = oAdd; }
    }
  }
  if (s.era === 'information' || s.era === 'algorithmic') {
    const insNet = insightPerSec(s) - (s.era === 'algorithmic' ? rackInsightDrainPerSec(s) : 0);
    if (insNet > 0) {
      const iCap = insightCap(s);
      const iAdd = Math.max(0, Math.min(iCap - (newRes.insight ?? 0), insNet * effectiveSec * CATCHUP_RATE));
      if (iAdd > 0) { newRes.insight = (newRes.insight ?? 0) + iAdd; catchup.insight = iAdd; }
    }
  }
  if (s.era === 'algorithmic') {
    const cmpNet = computePerSec(s);
    if (cmpNet > 0) {
      const cmpCap = computeCap(s);
      const cmpAdd = Math.max(0, Math.min(cmpCap - (newRes.compute ?? 0), cmpNet * effectiveSec * CATCHUP_RATE));
      if (cmpAdd > 0) { newRes.compute = (newRes.compute ?? 0) + cmpAdd; catchup.compute = cmpAdd; }
    }
  }

  // Maybe grant a return buff
  let buff: GameState['returnBuff'] = s.returnBuff;
  let buffMs = 0;
  if (awaySec >= BUFF_THRESHOLD_SEC) {
    buff = { until: now + BUFF_DURATION_MS, mult: BUFF_MULT };
    buffMs = BUFF_DURATION_MS;
  }

  game.update(g => ({
    ...g,
    resources: newRes,
    lastTick: now,
    returnBuff: buff,
  }));

  // Log it
  const min = Math.floor(awaySec / 60);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(catchup)) {
    if (v < 1) continue;
    parts.push(`+${v < 1000 ? v.toFixed(0) : (v / 1000).toFixed(1) + 'K'} ${k}`);
  }
  if (parts.length > 0) {
    logEvent(`Idle ${min}m — caught up: ${parts.join(', ')}.`);
  }
  if (buffMs > 0) {
    logEvent(`Return buff: ×${BUFF_MULT} production for 5 minutes.`);
  }

  return { awaySec, catchup, buffMs };
}
