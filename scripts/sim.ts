// Headless simulation of an Agrarian playthrough.
// Plays greedily: at every tick, complete the cheapest available project, then
// buy the cheapest upgrade you can afford whose cost <= cap.
//
// Asserts the core invariant: at no point should an upgrade we want to buy
// have cost > cap of its pay resource. If it does, the curve is broken.
//
// Run: npx tsx scripts/sim.ts

import { agrarianUpgrades, grainCap, popCap, popGrowthPerSec, grainPerSec, grainConsumedPerSec } from '../src/game/eras/agrarian';
import { industrialUpgrades, outputCap, outputPerSec, grainDrainPerSec, coalCap, coalPerSec, coalDrainPerSec } from '../src/game/eras/industrial';
import { informationUpgrades, insightCap, insightPerSec, stationGoodsDrainPerSec } from '../src/game/eras/information';
import { algorithmicUpgrades, computeCap, computePerSec, rackInsightDrainPerSec } from '../src/game/eras/algorithmic';
import { posthumanUpgrades, sentienceCap, sentiencePerSec, engineComputeDrainPerSec, popExtractedPerEngine } from '../src/game/eras/posthuman';
import { cosmicUpgrades, reachCap, reachPerSec, shipSentienceDrainPerSec, popDeployedPerShip } from '../src/game/eras/cosmic';
import { projects, projectAvailable, canAffordProject } from '../src/game/projects';
import { initialState, type GameState } from '../src/game/game';

const TICK_DT = 0.1; // sim resolution: 100ms steps
const MAX_SIM_TIME_SEC = 16 * 60 * 60; // bail after 16 simulated hours
// Skip dumb buys: don't buy if wait time would exceed this many seconds.
// A real player saves for bigger purchases instead.
const SKIP_WAIT_OVER_SEC = 180;

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s));
}

function spendResource(s: GameState, res: string, amt: number): boolean {
  if ((s.resources[res] ?? 0) < amt) return false;
  s.resources[res] = (s.resources[res] ?? 0) - amt;
  return true;
}

function applyProject(s: GameState, projId: string) {
  const p = projects.find(x => x.id === projId)!;
  for (const [res, amt] of Object.entries(p.cost)) {
    s.resources[res] = (s.resources[res] ?? 0) - (amt ?? 0);
  }
  const patch = p.apply(s);
  Object.assign(s, patch);
  if (patch.flags) s.flags = patch.flags;
  s.completedProjects = { ...s.completedProjects, [projId]: true };
}

function tick(s: GameState, dt: number) {
  // Agrarian production / consumption
  const cap = grainCap(s);
  const grainProd = grainPerSec(s);
  const grainCons = grainConsumedPerSec(s);
  let grainDelta = (grainProd - grainCons) * dt;

  // Industrial: mines → coal; factories drain grain (+ coal) → produce output
  if (s.era === 'industrial' || s.era === 'information' || s.era === 'algorithmic') {
    // Coal production from mines
    const cCap = coalCap(s);
    s.resources.coal = Math.min(cCap, (s.resources.coal ?? 0) + coalPerSec(s) * dt);

    const factories = s.upgrades.factory ?? 0;
    if (factories > 0) {
      const grainNeeded = grainDrainPerSec(s) * dt;
      const coalNeeded = coalDrainPerSec(s) * dt;
      const grainAvail = Math.max(0, (s.resources.grain ?? 0) + grainDelta);
      const coalAvail = s.resources.coal ?? 0;
      const grainFraction = grainNeeded > 0 ? Math.min(1, grainAvail / grainNeeded) : 1;
      const coalFraction  = coalNeeded  > 0 ? Math.min(1, coalAvail / coalNeeded)   : 1;
      const fraction = Math.min(grainFraction, coalFraction);
      grainDelta -= grainNeeded * fraction;
      s.resources.coal = Math.max(0, coalAvail - coalNeeded * fraction);
      const oCap = outputCap(s);
      s.resources.output = Math.min(oCap, (s.resources.output ?? 0) + outputPerSec(s) * dt * fraction);
    }
  }

  // Information: signal stations drain goods → produce insight
  if (s.era === 'information' || s.era === 'algorithmic') {
    const stations = s.upgrades.signalStation ?? 0;
    if (stations > 0) {
      const goodsNeeded = stationGoodsDrainPerSec(s) * dt;
      const goodsAvail = s.resources.output ?? 0;
      const f = goodsNeeded > 0 ? Math.min(1, goodsAvail / goodsNeeded) : 1;
      s.resources.output = Math.max(0, goodsAvail - goodsNeeded * f);
      const iCap = insightCap(s);
      s.resources.insight = Math.min(iCap, (s.resources.insight ?? 0) + insightPerSec(s) * dt * f);
    }
  }

  // Algorithmic: server racks drain insight → produce compute
  if (s.era === 'algorithmic' || s.era === 'posthuman') {
    const racks = s.upgrades.serverRack ?? 0;
    if (racks > 0) {
      const insNeeded = rackInsightDrainPerSec(s) * dt;
      const insAvail = s.resources.insight ?? 0;
      const f = insNeeded > 0 ? Math.min(1, insAvail / insNeeded) : 1;
      s.resources.insight = Math.max(0, insAvail - insNeeded * f);
      const cCap = computeCap(s);
      s.resources.compute = Math.min(cCap, (s.resources.compute ?? 0) + computePerSec(s) * dt * f);
    }
  }

  // Posthuman: cognition engines drain compute → produce sentience
  if (s.era === 'posthuman' || s.era === 'cosmic') {
    const engines = s.upgrades.cognitionEngine ?? 0;
    const sCap = sentienceCap(s);
    if (engines > 0) {
      const cmpNeeded = engineComputeDrainPerSec(s) * dt;
      const cmpAvail = s.resources.compute ?? 0;
      const f = cmpNeeded > 0 ? Math.min(1, cmpAvail / cmpNeeded) : 1;
      s.resources.compute = Math.max(0, cmpAvail - cmpNeeded * f);
      s.resources.sentience = Math.min(sCap, (s.resources.sentience ?? 0) + sentiencePerSec(s) * dt * f);
    } else {
      s.resources.sentience = Math.min(sCap, (s.resources.sentience ?? 0) + sentiencePerSec(s) * dt);
    }
  }

  // Cosmic: colony ships drain sentience → produce reach
  if (s.era === 'cosmic') {
    const ships = s.upgrades.colonyShip ?? 0;
    const rCap = reachCap(s);
    if (ships > 0) {
      const sNeeded = shipSentienceDrainPerSec(s) * dt;
      const sAvail = s.resources.sentience ?? 0;
      const f = sNeeded > 0 ? Math.min(1, sAvail / sNeeded) : 1;
      s.resources.sentience = Math.max(0, sAvail - sNeeded * f);
      s.resources.reach = Math.min(rCap, (s.resources.reach ?? 0) + reachPerSec(s) * dt * f);
    }
  }
  s.resources.grain = Math.max(0, Math.min(cap, (s.resources.grain ?? 0) + grainDelta));

  const pop = s.resources.pop ?? 0;
  const pCap = popCap(s);
  const surplusNeeded = Math.max(0.5, grainCons * 0.2);
  const wellFed = grainProd - grainCons >= surplusNeeded && (s.resources.grain ?? 0) > 0;
  if (wellFed && pop < pCap) {
    s.resources.pop = Math.min(pCap, pop + popGrowthPerSec(s) * dt);
  }
}

interface PhaseLog {
  t: number;
  event: string;
  grain: number;
  cap: number;
  pop: number;
}

function fmt(n: number): string {
  if (n < 1000) return n.toFixed(0);
  if (n < 1e6) return (n / 1e3).toFixed(2) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(2) + 'M';
  return (n / 1e9).toFixed(2) + 'B';
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function simulate(): { phases: PhaseLog[]; violations: string[]; reachedIR: boolean; finalState: GameState; elapsed: number } {
  const s: GameState = clone({
    ...initialState,
    startedAt: 0,
    lastTick: 0,
  });
  const phases: PhaseLog[] = [];
  const violations: string[] = [];
  let t = 0;
  let lastClickTime = 0;
  let lastPurchaseTime = 0;
  const CLICK_RATE = 2; // 2 clicks/sec while needing grain manually
  const STALL_THRESHOLD_SEC = 120; // no purchase for 2 min == wall

  function logPhase(event: string) {
    phases.push({
      t,
      event,
      grain: s.resources.grain ?? 0,
      cap: grainCap(s),
      pop: s.resources.pop ?? 0,
    });
  }

  logPhase('start');

  while (t < MAX_SIM_TIME_SEC) {
    t += TICK_DT;

    // Manual clicks: real players keep clicking until production is comfortably
    // ahead of consumption (net > 2/sec or 10+ plows built).
    const netRate = grainPerSec(s) - grainConsumedPerSec(s);
    const clicksHelpful = (s.upgrades.plow ?? 0) < 10 || netRate < 2;
    if (clicksHelpful && t - lastClickTime >= 1 / CLICK_RATE) {
      lastClickTime = t;
      const cap = grainCap(s);
      s.resources.grain = Math.min(cap, (s.resources.grain ?? 0) + 1);
    }

    tick(s, TICK_DT);

    // Complete any available, affordable project (cheapest first).
    const buyable = projects
      .filter(p => projectAvailable(p, s) && canAffordProject(p, s))
      .sort((a, b) => (a.cost.grain ?? 0) - (b.cost.grain ?? 0));
    if (buyable.length > 0) {
      const p = buyable[0];
      applyProject(s, p.id);
      logPhase(`project: ${p.name}`);
      lastPurchaseTime = t;
      if (p.id === 'kardashevII') {
        return { phases, violations, reachedIR: true, finalState: s, elapsed: t };
      }
      continue;
    }

    const cap = grainCap(s);
    const grain = s.resources.grain ?? 0;
    const output = s.resources.output ?? 0;

    // Real wall detection: no purchase for STALL_THRESHOLD_SEC, grain capped,
    // no project completable. Means the player is stuck producing grain that
    // overflows storage with nothing to buy.
    if (
      t - lastPurchaseTime > STALL_THRESHOLD_SEC &&
      grain >= cap - 0.5 &&
      projects.filter(p => projectAvailable(p, s)).length === 0
    ) {
      // Find what's blocking us.
      const cheapestUpgrade = agrarianUpgrades
        .map(u => {
          const lvl = s.upgrades[u.id] ?? 0;
          if (u.max !== undefined && lvl >= u.max) return null;
          return { name: u.name, cost: u.cost(lvl).grain };
        })
        .filter((x): x is { name: string; cost: number } => x !== null)
        .sort((a, b) => a.cost - b.cost)[0];
      violations.push(
        `t=${fmtTime(t)} WALL: stalled ${STALL_THRESHOLD_SEC}s at cap=${fmt(cap)}, ` +
          `cheapest upgrade is ${cheapestUpgrade?.name} at ${fmt(cheapestUpgrade?.cost ?? 0)}`,
      );
      return { phases, violations, reachedIR: false, finalState: s, elapsed: t };
    }

    // Smarter buy: pick the cheapest affordable upgrade. Skip if it'd be
    // sized so we should be saving for something bigger (cost > 30% of cap).
    type BuyOpt = { id: string; cost: number; res: 'grain' | 'output' | 'insight' | 'compute' | 'sentience'; era: 'agrarian' | 'industrial' | 'information'; name: string };
    let bestUpgrade: BuyOpt | null = null;
    const insightAmt = s.resources.insight ?? 0;
    const computeAmt2 = s.resources.compute ?? 0;
    const sentienceAmt = s.resources.sentience ?? 0;
    const considerSet = (upgrades: any[], era: 'agrarian' | 'industrial' | 'information') => {
      for (const u of upgrades) {
        // Skip if not visible — mirrors real player UI.
        if (typeof u.visible === 'function' && (s.upgrades[u.id] ?? 0) === 0 && !u.visible(s)) continue;
        const lvl = s.upgrades[u.id] ?? 0;
        const maxVal = u.max;
        if (maxVal !== undefined && lvl >= maxVal) continue;
        const c = u.cost(lvl);
        const cost = c.grain ?? c.output ?? c.goods ?? c.insight ?? c.compute ?? c.sentience ?? 0;
        const resRaw =
          c.grain !== undefined ? 'grain' :
          c.output !== undefined ? 'output' :
          c.goods !== undefined ? 'output' :
          c.insight !== undefined ? 'insight' :
          c.compute !== undefined ? 'compute' :
          'sentience';
        const res = resRaw as 'grain' | 'output' | 'insight' | 'compute' | 'sentience';
        const have =
          res === 'grain' ? grain :
          res === 'output' ? output :
          res === 'insight' ? insightAmt :
          res === 'compute' ? computeAmt2 :
          sentienceAmt;
        if (cost > have) continue;
        if (!bestUpgrade || cost < bestUpgrade.cost) {
          bestUpgrade = { id: u.id, cost, res, era, name: u.name };
        }
      }
    };
    // Consider current-era buildings first so the sim doesn't permanently
    // prefer cheap prior-era upgrades and stall progression.
    if (s.era === 'cosmic') {
      considerSet(cosmicUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(posthumanUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(algorithmicUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(informationUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(industrialUpgrades as any, 'industrial');
      if (!bestUpgrade) considerSet(agrarianUpgrades, 'agrarian');
    } else if (s.era === 'posthuman') {
      considerSet(posthumanUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(algorithmicUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(informationUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(industrialUpgrades as any, 'industrial');
      if (!bestUpgrade) considerSet(agrarianUpgrades, 'agrarian');
    } else if (s.era === 'algorithmic') {
      considerSet(algorithmicUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(informationUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(industrialUpgrades as any, 'industrial');
      if (!bestUpgrade) considerSet(agrarianUpgrades, 'agrarian');
    } else if (s.era === 'information') {
      considerSet(informationUpgrades as any, 'information');
      if (!bestUpgrade) considerSet(industrialUpgrades as any, 'industrial');
      if (!bestUpgrade) considerSet(agrarianUpgrades, 'agrarian');
    } else if (s.era === 'industrial') {
      considerSet(industrialUpgrades as any, 'industrial');
      if (!bestUpgrade) considerSet(agrarianUpgrades, 'agrarian');
    } else {
      considerSet(agrarianUpgrades, 'agrarian');
    }

    if (bestUpgrade) {
      const lvl = s.upgrades[bestUpgrade.id] ?? 0;
      if (bestUpgrade.id === 'cognitionEngine') {
        const extract = popExtractedPerEngine(s);
        const popAvail = s.resources.pop ?? 0;
        if (popAvail < extract) continue;
        s.resources.pop = popAvail - extract;
      }
      if (bestUpgrade.id === 'colonyShip') {
        const deploy = popDeployedPerShip(s);
        const popAvail = s.resources.pop ?? 0;
        if (popAvail < deploy) continue;
        s.resources.pop = popAvail - deploy;
      }
      spendResource(s, bestUpgrade.res, bestUpgrade.cost);
      s.upgrades[bestUpgrade.id] = lvl + 1;
      lastPurchaseTime = t;
      if (lvl === 0 || (lvl + 1) % 5 === 0) {
        logPhase(`${bestUpgrade.name} → lvl ${lvl + 1}`);
      }
    }
  }

  return { phases, violations, reachedIR: false, finalState: s, elapsed: t };
}

const result = simulate();

console.log('\n=== Agrarian Era Simulation ===\n');
console.log('Time     | Event                              | Grain    / Cap     | Pop');
console.log('---------|------------------------------------|--------------------|------');
for (const p of result.phases) {
  const event = p.event.padEnd(34);
  const grain = `${fmt(p.grain)} / ${fmt(p.cap)}`.padEnd(18);
  console.log(`${fmtTime(p.t).padEnd(8)} | ${event} | ${grain} | ${Math.floor(p.pop)}`);
}

console.log('\n=== Result ===\n');
console.log(`Reached Information era (Telegraph): ${result.reachedIR ? 'YES' : 'NO'}`);
console.log(`Total simulated time: ${fmtTime(result.elapsed)}`);
console.log(`Curve violations (cost > cap): ${result.violations.length}`);

if (result.violations.length > 0) {
  console.log('\nVIOLATIONS:');
  for (const v of result.violations.slice(0, 20)) console.log('  ' + v);
  if (result.violations.length > 20) {
    console.log(`  ... and ${result.violations.length - 20} more`);
  }
  process.exit(1);
}

if (!result.reachedIR) {
  console.log('\nFAILED: simulation timed out without reaching the Information era.');
  process.exit(1);
}

console.log('\nAll curves stable. ✓');
