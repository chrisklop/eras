import { writable, get } from 'svelte/store';
import { game, logEvent, type GameState } from './game';

// =============================================================================
// Achievements — passive milestone tracking with permanent +1% buffs.
// Stored in a separate persistent slot so they survive collapses.
// Each achievement, when earned, contributes a small flat buff to one
// stat. They never interact with cost growth or cap growth slopes.
// =============================================================================

const ACH_KEY = 'eras:achievements:v1';

export type AchBuff =
  | 'grainProd'        // +1% grain/sec
  | 'goodsProd'        // +1% goods/sec
  | 'insightProd'      // +1% insight/sec
  | 'popGrowth'        // +0.01/sec base pop growth
  | 'legacyGain';      // +5% legacy points per collapse

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  buff: AchBuff;
  check: (s: GameState, ach: AchievementsState) => boolean;
}

export interface AchievementsState {
  earned: Record<string, true>;
}

export const achievements = writable<AchievementsState>({ earned: {} });

export const ACHIEVEMENTS: Achievement[] = [
  // Pop milestones (+pop growth)
  { id: 'pop50',    name: 'A Village',          desc: 'Reach 50 population.',     buff: 'popGrowth', check: s => (s.peakPop ?? 0) >= 50 },
  { id: 'pop500',   name: 'A Town',             desc: 'Reach 500 population.',    buff: 'popGrowth', check: s => (s.peakPop ?? 0) >= 500 },
  { id: 'pop5000',  name: 'A City',             desc: 'Reach 5,000 population.',  buff: 'popGrowth', check: s => (s.peakPop ?? 0) >= 5000 },

  // Grain milestones (+grain prod)
  { id: 'grain1K',  name: 'Full Stores',        desc: 'Accumulate 1K grain.',     buff: 'grainProd', check: s => (s.resources.grain ?? 0) >= 1000 },
  { id: 'grain1M',  name: 'Granary State',      desc: 'Accumulate 1M grain.',     buff: 'grainProd', check: s => (s.resources.grain ?? 0) >= 1_000_000 },
  { id: 'grain1B',  name: 'Bread for All',      desc: 'Accumulate 1B grain.',     buff: 'grainProd', check: s => (s.resources.grain ?? 0) >= 1_000_000_000 },

  // Goods milestones (+goods prod)
  { id: 'goods1K',  name: 'Workshop Floor',     desc: 'Accumulate 1K goods.',     buff: 'goodsProd', check: s => (s.resources.output ?? 0) >= 1000 },
  { id: 'goods1M',  name: 'Industrial Capacity',desc: 'Accumulate 1M goods.',     buff: 'goodsProd', check: s => (s.resources.output ?? 0) >= 1_000_000 },
  { id: 'goods1B',  name: 'Global Industry',    desc: 'Accumulate 1B goods.',     buff: 'goodsProd', check: s => (s.resources.output ?? 0) >= 1_000_000_000 },

  // Insight milestones (+insight prod)
  { id: 'insight1K',name: 'First Press',        desc: 'Accumulate 1K insight.',   buff: 'insightProd', check: s => (s.resources.insight ?? 0) >= 1000 },
  { id: 'insight1M',name: 'Mass Literacy',      desc: 'Accumulate 1M insight.',   buff: 'insightProd', check: s => (s.resources.insight ?? 0) >= 1_000_000 },

  // Project milestones (+legacy gain)
  { id: 'firstEra', name: 'Smoke Rises',        desc: 'Complete the Industrial Revolution.', buff: 'legacyGain', check: s => !!s.completedProjects.industrialRevolution },
  { id: 'secondEra',name: 'Wires Hum',          desc: 'Complete the Telegraph.',  buff: 'legacyGain', check: s => !!s.completedProjects.telegraph },
  { id: 'thirdEra', name: 'Network Awake',      desc: 'Complete The Internet.',   buff: 'legacyGain', check: s => !!s.completedProjects.theInternet },

  // Wonder milestones
  { id: 'firstWonder', name: 'Architect',       desc: 'Build any one Wonder.',    buff: 'legacyGain', check: s => countWonders(s) >= 1 },
  { id: 'threeWonders',name: 'Civilization-Builder', desc: 'Build 3 Wonders in one run.', buff: 'legacyGain', check: s => countWonders(s) >= 3 },
];

function countWonders(s: GameState): number {
  const ids = ['stonehenge','pyramids','hangingGardens','crystalPalace','eiffelTower','transcontinentalRailroad','statueOfLiberty','empireState','hooverDam'];
  return ids.filter(id => s.completedProjects[id]).length;
}

export function earnedBuffTotal(buff: AchBuff, a: AchievementsState = get(achievements)): number {
  let n = 0;
  for (const ach of ACHIEVEMENTS) {
    if (a.earned[ach.id] && ach.buff === buff) n += 1;
  }
  return n;
}

export function grainProdAchMult(a: AchievementsState = get(achievements)): number {
  return 1 + 0.01 * earnedBuffTotal('grainProd', a);
}
export function goodsProdAchMult(a: AchievementsState = get(achievements)): number {
  return 1 + 0.01 * earnedBuffTotal('goodsProd', a);
}
export function insightProdAchMult(a: AchievementsState = get(achievements)): number {
  return 1 + 0.01 * earnedBuffTotal('insightProd', a);
}
export function popGrowthAchBonus(a: AchievementsState = get(achievements)): number {
  return 0.01 * earnedBuffTotal('popGrowth', a);
}
export function legacyGainAchMult(a: AchievementsState = get(achievements)): number {
  return 1 + 0.05 * earnedBuffTotal('legacyGain', a);
}

export function checkAchievements() {
  const s = get(game);
  const a = get(achievements);
  let changed = false;
  let earned = { ...a.earned };
  for (const ach of ACHIEVEMENTS) {
    if (earned[ach.id]) continue;
    if (ach.check(s, a)) {
      earned[ach.id] = true;
      changed = true;
      logEvent(`Achievement unlocked: ${ach.name}.`);
    }
  }
  if (changed) {
    achievements.set({ earned });
    saveAchievements();
  }
}

export function saveAchievements() {
  try {
    localStorage.setItem(ACH_KEY, JSON.stringify(get(achievements)));
  } catch {
    /* ignore */
  }
}

export function hydrateAchievements() {
  try {
    const raw = localStorage.getItem(ACH_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<AchievementsState>;
    achievements.set({ earned: parsed.earned ?? {} });
  } catch {
    /* ignore */
  }
}
