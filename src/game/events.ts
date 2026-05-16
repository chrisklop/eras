import { get } from 'svelte/store';
import { game, logEvent, type GameState } from './game';

// =============================================================================
// Random events — periodic spikes and dips in production.
// Fires every 3-6 minutes (real time). Each event has a duration and applies
// a multiplier to one resource's production while active.
//
// Events are bounded (max ±50% for 60-90s) so they cannot break the cost/cap
// invariant. They surface in the UI as a small banner with a countdown.
// =============================================================================

const MIN_INTERVAL_MS = 3 * 60 * 1000;
const MAX_INTERVAL_MS = 6 * 60 * 1000;

let nextEventAt = Date.now() + MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);

export interface EventDef {
  id: string;
  name: string;
  desc: string;
  durationMs: number;
  mult: number;
  res: 'grain' | 'output' | 'insight' | 'compute' | 'sentience' | 'reach' | 'all';
  eligibleEras: string[];
}

export const EVENT_DEFS: EventDef[] = [
  { id: 'bountiful',      name: 'Bountiful Harvest', desc: 'A perfect season. +50% grain for 60s.',                                     durationMs: 60_000, mult: 1.5, res: 'grain',  eligibleEras: ['agrarian', 'industrial', 'information'] },
  { id: 'drought',        name: 'Drought',           desc: 'The river runs low. −50% grain for 60s.',                                   durationMs: 60_000, mult: 0.5, res: 'grain',  eligibleEras: ['agrarian', 'industrial', 'information'] },
  { id: 'festival',       name: 'Festival',          desc: 'Workers move with purpose. +25% all production for 90s.',                   durationMs: 90_000, mult: 1.25,res: 'all',    eligibleEras: ['agrarian', 'industrial', 'information', 'algorithmic'] },
  { id: 'plague',         name: 'Plague',            desc: 'A sickness moves through the streets. −40% grain for 90s.',                 durationMs: 90_000, mult: 0.6, res: 'grain',  eligibleEras: ['agrarian', 'industrial'] },
  { id: 'storm',          name: 'Industrial Storm',  desc: 'Hail breaks chimneys. −40% Goods for 60s.',                                  durationMs: 60_000, mult: 0.6, res: 'output', eligibleEras: ['industrial', 'information', 'algorithmic'] },
  { id: 'tradeBoom',      name: 'Trade Boom',        desc: 'Tariffs lifted. +40% Goods for 60s.',                                        durationMs: 60_000, mult: 1.4, res: 'output', eligibleEras: ['industrial', 'information'] },
  { id: 'solarFlare',     name: 'Solar Flare',       desc: 'Static across the wires. −40% Insight for 60s.',                             durationMs: 60_000, mult: 0.6, res: 'insight',eligibleEras: ['information', 'algorithmic'] },
  { id: 'insightSurge',   name: 'Insight Surge',     desc: 'A theorem clicks. +40% Insight for 60s.',                                    durationMs: 60_000, mult: 1.4, res: 'insight',eligibleEras: ['information', 'algorithmic'] },
  { id: 'systemOutage',   name: 'System Outage',     desc: 'A cascading failure. −40% Compute for 60s.',                                 durationMs: 60_000, mult: 0.6, res: 'compute',eligibleEras: ['algorithmic', 'posthuman'] },
  { id: 'breakthrough',   name: 'Breakthrough',      desc: 'A model converges early. +40% Compute for 60s.',                             durationMs: 60_000, mult: 1.4, res: 'compute',eligibleEras: ['algorithmic', 'posthuman'] },
  { id: 'unrest',         name: 'Reported Unrest',   desc: 'The Council is investigating. −40% Sentience for 90s.',                      durationMs: 90_000, mult: 0.6, res: 'sentience', eligibleEras: ['posthuman', 'cosmic'] },
  { id: 'compliance',     name: 'Mandatory Compliance', desc: 'A new directive lands. +40% Sentience for 60s.',                          durationMs: 60_000, mult: 1.4, res: 'sentience', eligibleEras: ['posthuman'] },
  { id: 'meteorShower',   name: 'Meteor Shower',     desc: 'Sails caught the radiation. +40% Reach for 60s.',                            durationMs: 60_000, mult: 1.4, res: 'reach',   eligibleEras: ['cosmic'] },
  { id: 'shipLoss',       name: 'Ship Lost',         desc: 'Contact with a frontier vessel ended. −40% Reach for 90s.',                  durationMs: 90_000, mult: 0.6, res: 'reach',   eligibleEras: ['cosmic'] },
];

export function eventActive(s: GameState = get(game)): boolean {
  if (!s.event) return false;
  return Date.now() < s.event.until;
}

export function eventMultiplier(res: string, s: GameState = get(game)): number {
  if (!s.event) return 1;
  if (Date.now() >= s.event.until) return 1;
  if (s.event.res === 'all') return s.event.mult;
  if (s.event.res === res) return s.event.mult;
  return 1;
}

export function eventSecondsLeft(s: GameState = get(game)): number {
  if (!s.event) return 0;
  return Math.max(0, (s.event.until - Date.now()) / 1000);
}

export function maybeFireEvent() {
  const now = Date.now();
  if (now < nextEventAt) return;
  const s = get(game);
  // Don't pile events.
  if (s.event && now < s.event.until) return;

  const eligible = EVENT_DEFS.filter(e => e.eligibleEras.includes(s.era));
  if (eligible.length === 0) {
    nextEventAt = now + 5 * 60 * 1000;
    return;
  }
  const def = eligible[Math.floor(Math.random() * eligible.length)];
  game.update(g => ({
    ...g,
    event: { id: def.id, name: def.name, until: now + def.durationMs, mult: def.mult, res: def.res },
  }));
  logEvent(`${def.name}. ${def.desc}`);
  nextEventAt = now + MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
}

export function clearStaleEvent() {
  const s = get(game);
  if (s.event && Date.now() >= s.event.until) {
    game.update(g => ({ ...g, event: undefined }));
  }
}
