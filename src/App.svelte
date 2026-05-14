<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { game, logEvent, buyMode, type BuyMode } from './game/game';
  import { agrarianUpgrades, buyUpgrade, nextAgrarianBulkCost, grainPerSec, grainConsumedPerSec, consumptionPerPop, grainCap, popCap, gatherGrain, currentHousingTier, dwellingMaxLevel, laborDemand, laborFraction } from './game/eras/agrarian';
  import { industrialUpgrades, buyIndustrialUpgrade, nextBulkCost, outputPerSec, grainDrainPerSec, outputCap, coalCap, coalPerSec, coalDrainPerSec } from './game/eras/industrial';
  import { projects, projectAvailable, projectIncomplete, projectVisible, completeProject, effectiveProjectCost } from './game/projects';
  import { industrialUpgradeVisible } from './game/eras/industrial';
  import { startLoop, stopLoop } from './game/tick';
  import { hydrate, resetGame } from './game/save';
  import {
    legacy,
    LEGACY_NODES,
    legacyEarnedAt,
    canCollapse,
    nodeOwned,
    nodeAvailable,
    buyNode,
    collapse,
    hydrateLegacy,
  } from './game/legacy';

  let showLegacy = false;

  onMount(() => {
    hydrateLegacy();
    hydrate();
    startLoop();
  });
  onDestroy(stopLoop);

  // Apply era class to <body> for theme tokens.
  $: if (typeof document !== 'undefined') {
    document.body.className = `era-${$game.era}`;
  }

  const eraRoman: Record<string, string> = {
    agrarian: 'I',
    industrial: 'II',
    information: 'III',
    algorithmic: 'IV',
    posthuman: 'V',
    cosmic: 'VI',
  };
  const eraName: Record<string, string> = {
    agrarian: 'Of Grain & Field',
    industrial: 'Of Steam & Steel',
    information: 'Of Wire & Signal',
    algorithmic: 'Of Code & Compute',
    posthuman: 'Beyond the Body',
    cosmic: 'Among the Stars',
  };

  function gather() {
    gatherGrain();
  }

  function fmt(n: number): string {
    if (n < 1000) return n.toFixed(n < 10 ? 1 : 0);
    if (n < 1e6) return (n / 1e3).toFixed(2) + 'K';
    if (n < 1e9) return (n / 1e6).toFixed(2) + 'M';
    return n.toExponential(2);
  }

  $: grainAmt = $game.resources.grain ?? 0;
  $: cap = grainCap($game);
  $: grainFull = grainAmt >= cap - 0.01;
  $: outputAmt = $game.resources.output ?? 0;
  $: popAmt = $game.resources.pop ?? 0;
  $: popMax = popCap($game);
  $: grainProduction = grainPerSec($game);
  $: grainConsumption = grainConsumedPerSec($game);
  $: grainNet = grainProduction - grainConsumption;
  $: perPop = consumptionPerPop($game);
  $: visibleProjects = projects.filter(p => projectVisible(p, $game));
  $: visibleIndustrialUpgrades = industrialUpgrades.filter(u => industrialUpgradeVisible(u, $game));
  $: laborDemandVal = laborDemand($game);
  $: laborFractionVal = laborFraction($game);
  $: idleWorkers = Math.max(0, Math.floor(popAmt - laborDemandVal));
  $: shortWorkers = Math.max(0, Math.ceil(laborDemandVal - popAmt));
  $: completedCount = Object.keys($game.completedProjects ?? {}).length;

  const buyModes: BuyMode[] = [1, 10, 100, 'max'];
  function setMode(m: BuyMode) { buyMode.set(m); }

  /** Affordability ratio (0..1) for an upgrade card. */
  function fillRatio(cost: number, res: 'grain' | 'output'): number {
    if (!cost || cost <= 0) return 0;
    const have = res === 'grain' ? grainAmt : outputAmt;
    return Math.max(0, Math.min(1, have / cost));
  }

  /** Find the nearest locked project for a given era — the "horizon". */
  function nextHorizon(era: 'agrarian' | 'industrial' | 'information') {
    const locked = projects.filter(p =>
      projectIncomplete(p, $game) &&
      !projectAvailable(p, $game) &&
      (p.era === era || (p.era === 'agrarian' && era === 'agrarian'))
    );
    // If no locked projects, look at unlocked-but-unaffordable as next horizon.
    if (locked.length === 0) {
      const unaffordable = projects.filter(p =>
        projectIncomplete(p, $game) &&
        projectAvailable(p, $game) &&
        p.era === era
      ).sort((a, b) => (a.cost.grain ?? a.cost.output ?? 0) - (b.cost.grain ?? b.cost.output ?? 0));
      return unaffordable[0] ?? null;
    }
    return locked.sort((a, b) => (a.cost.grain ?? a.cost.output ?? 0) - (b.cost.grain ?? b.cost.output ?? 0))[0];
  }

  $: upgradesHorizon = nextHorizon($game.era === 'industrial' || $game.era === 'information' ? 'industrial' : 'agrarian');

  function hardReset() {
    if (confirm('Wipe save and restart? (Legacy points are kept — use the Legacy panel to wipe those.)')) {
      resetGame();
      logEvent('A new settlement gathers by the river.');
    }
  }

  $: peakPop = $game.peakPop ?? 0;
  $: peakOutput = $game.peakOutput ?? 0;
  $: pendingLegacy = legacyEarnedAt(peakPop, peakOutput);

  function doCollapse() {
    if (!canCollapse($game)) return;
    if (!confirm(`Collapse this civilization for +${pendingLegacy} Legacy?\nCurrent run is reset; Legacy points and nodes persist.`)) return;
    const r = collapse();
    if (r) showLegacy = true;
  }
</script>

<div class="app">
  <header class="topbar">
    <div class="chapter">
      <span class="chapter-num">{eraRoman[$game.era] ?? ''}</span>
      <div class="chapter-titles">
        <span class="chapter-kicker">Chapter</span>
        <h1 class="chapter-name">{eraName[$game.era] ?? $game.era}</h1>
      </div>
    </div>
    <div class="resource-strip">
      <div class="res">
        <span class="label">Grain</span>
        <span class="val" class:full={grainFull} class:starving={grainNet < 0 && grainAmt < 1}>
          {fmt(grainAmt)} / {fmt(cap)}
        </span>
        <span class="rate" title={`Per citizen: ${perPop.toFixed(3)} grain/sec`}>
          +{fmt(grainProduction)} − {fmt(grainConsumption)} = {grainNet >= 0 ? '+' : ''}{fmt(grainNet)}/s
        </span>
      </div>
      <div class="res">
        <span class="label">Population</span>
        <span class="val" class:full={popAmt >= popMax} class:starving={shortWorkers > 0}>{Math.floor(popAmt)} / {popMax}</span>
        <span class="rate">
          {#if shortWorkers > 0}{shortWorkers} unmanned · {Math.round(laborFractionVal * 100)}%
          {:else if idleWorkers > 0}{idleWorkers} idle · ready
          {:else if grainNet <= 0 && grainAmt < 1}underfed
          {:else if popAmt >= popMax}housing full
          {:else if grainNet > 0 && grainAmt > 0}growing
          {:else}stable{/if}
        </span>
      </div>
      {#if $game.era === 'industrial' || $game.era === 'information'}
        {@const coalAmt = $game.resources.coal ?? 0}
        {@const coalProd = coalPerSec($game)}
        {@const coalDrain = coalDrainPerSec($game)}
        {#if coalProd > 0 || coalAmt > 0 || $game.flags.bessemer}
          <div class="res">
            <span class="label">Coal</span>
            <span class="val">{fmt(coalAmt)} / {fmt(coalCap($game))}</span>
            <span class="rate">+{fmt(coalProd)} − {fmt(coalDrain)} = {coalProd - coalDrain >= 0 ? '+' : ''}{fmt(coalProd - coalDrain)}/s</span>
          </div>
        {/if}
        <div class="res">
          <span class="label">Goods</span>
          <span class="val">{fmt(outputAmt)} / {fmt(outputCap($game))}</span>
          <span class="rate">+{fmt(outputPerSec($game))}/s</span>
        </div>
      {/if}
    </div>
    <button class="legacy-chip" on:click={() => (showLegacy = true)} title="Open Legacy panel">
      <span class="legacy-label">Legacy</span>
      <span class="legacy-val">{$legacy.points}</span>
    </button>
    <button class="reset" on:click={hardReset}>reset</button>
  </header>

  {#if showLegacy}
    <div class="modal-backdrop" on:click={() => (showLegacy = false)}>
      <div class="modal" on:click|stopPropagation>
        <header class="modal-head">
          <h2>Legacy</h2>
          <button class="close" on:click={() => (showLegacy = false)}>×</button>
        </header>
        <div class="legacy-summary">
          <div><strong>{$legacy.points}</strong> <span class="dim">points</span></div>
          <div class="dim small">{$legacy.lifetimeEarned} earned · {$legacy.collapses} collapses</div>
        </div>

        <section class="legacy-collapse">
          <div class="row">
            <div>
              <div class="dim small">This civilization</div>
              <div>Peak pop {Math.floor(peakPop)} · peak output {fmt(peakOutput)}</div>
            </div>
            <div class="collapse-cta">
              <div class="dim small">Collapse for</div>
              <div class="cta-num">+{pendingLegacy} legacy</div>
              <button
                class="collapse-btn"
                disabled={!canCollapse($game) || pendingLegacy < 1}
                on:click={doCollapse}
              >
                {canCollapse($game) ? 'Collapse civilization' : `Need pop ≥ 10 (have ${Math.floor(peakPop)})`}
              </button>
            </div>
          </div>
        </section>

        <section class="legacy-nodes">
          <h3>Permanent benefits</h3>
          {#each LEGACY_NODES as n (n.id)}
            {@const owned = nodeOwned(n.id, $legacy)}
            {@const avail = nodeAvailable(n, $legacy)}
            {@const affordable = $legacy.points >= n.cost}
            <div class="node" class:owned class:locked={!avail && !owned}>
              <div class="node-head">
                <strong>{n.name}</strong>
                <span class="node-cost">
                  {#if owned}acquired{:else}{n.cost} pts{/if}
                </span>
              </div>
              <div class="node-desc">{n.desc}</div>
              {#if n.requires && !owned}
                <div class="node-req dim small">Requires: {LEGACY_NODES.find(x => x.id === n.requires)?.name}</div>
              {/if}
              {#if !owned}
                <button
                  class="node-buy"
                  disabled={!avail || !affordable}
                  on:click={() => buyNode(n.id)}
                >
                  {#if !avail}locked{:else if !affordable}need {n.cost - $legacy.points} more{:else}acquire{/if}
                </button>
              {/if}
            </div>
          {/each}
        </section>
      </div>
    </div>
  {/if}

  <main class="grid">
    <section class="pane upgrades-pane">
      <button class="big" on:click={gather}>
        Gather grain
        <span class="big-sub">+{fmt(Math.max(1, Math.floor(Math.sqrt(grainProduction))))} per click</span>
      </button>

      {#if upgradesHorizon}
        {@const horCost = upgradesHorizon.cost.grain ?? upgradesHorizon.cost.output ?? 0}
        {@const horRes = upgradesHorizon.cost.grain !== undefined ? 'grain' : 'goods'}
        {@const horHave = horRes === 'grain' ? grainAmt : outputAmt}
        {@const horPct = Math.max(0, Math.min(1, horHave / horCost))}
        <div class="horizon">
          <div class="horizon-fill" style="width: {horPct * 100}%"></div>
          <div class="horizon-text">
            <span class="horizon-kicker">Next</span>
            <span class="horizon-name">{upgradesHorizon.name}</span>
            <span class="horizon-cost">
              {#if projectAvailable(upgradesHorizon, $game)}
                {fmt(horHave)} / {fmt(horCost)} {horRes}
              {:else}
                {upgradesHorizon.requirementsText}
              {/if}
            </span>
          </div>
        </div>
      {/if}
      <div class="pane-head">
        <h2>Upgrades</h2>
        <div class="mode">
          {#each buyModes as m}
            <button class:active={$buyMode === m} on:click={() => setMode(m)}>{m === 'max' ? 'Max' : `×${m}`}</button>
          {/each}
        </div>
      </div>

      <div class="card-grid">
        {#each agrarianUpgrades as u}
          {@const lvl = $game.upgrades[u.id] ?? 0}
          {@const isDwelling = u.id === 'dwelling'}
          {@const displayName = isDwelling ? currentHousingTier($game).name : u.name}
          {@const max = isDwelling ? dwellingMaxLevel($game) : u.max}
          {@const maxed = max !== undefined && lvl >= max}
          {@const bulk = nextAgrarianBulkCost(u.id, $buyMode, $game)}
          {@const buyable = !maxed && bulk.n > 0 && grainAmt >= bulk.total}
          <button
            class="upgrade"
            disabled={!buyable}
            style="--fill: {fillRatio(bulk.total, 'grain') * 100}%"
            on:click={() => buyUpgrade(u.id, $buyMode)}
          >
            <div class="row">
              <strong>{displayName}</strong>
              <span class="lvl">Lv {lvl}{max !== undefined ? `/${max}` : ''}</span>
            </div>
            <div class="desc">
              {#if isDwelling}
                Each holds {currentHousingTier($game).popPer}. Research next tier for more density.
              {:else}{u.desc}{/if}
            </div>
            <div class="cost">
              {#if maxed}maxed — research next tier
              {:else if bulk.n === 0}—
              {:else}
                buy {bulk.n} · {fmt(bulk.total)} grain
              {/if}
            </div>
          </button>
        {/each}
      </div>

      {#if $game.era === 'industrial' || $game.era === 'information'}
        <div class="pane-head">
          <h2 class="sub">Industry</h2>
        </div>
        <div class="card-grid">
          {#each visibleIndustrialUpgrades as u}
            {@const lvl = $game.upgrades[u.id] ?? 0}
            {@const maxed = u.max !== undefined && lvl >= u.max}
            {@const bulk = nextBulkCost(u.id, $buyMode, $game)}
            {@const have = bulk.res === 'grain' ? grainAmt : outputAmt}
            {@const buyable = !maxed && bulk.n > 0 && have >= bulk.total}
            <button
              class="upgrade"
              disabled={!buyable}
              style="--fill: {fillRatio(bulk.total, bulk.res) * 100}%"
              on:click={() => buyIndustrialUpgrade(u.id, $buyMode)}
            >
              <div class="row">
                <strong>{u.name}</strong>
                <span class="lvl">Lv {lvl}{u.max ? `/${u.max}` : ''}</span>
              </div>
              <div class="desc">{u.desc}</div>
              <div class="cost">
                {#if maxed}maxed
                {:else if bulk.n === 0}—
                {:else}
                  buy {bulk.n} · {fmt(bulk.total)} {bulk.res}
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section class="pane projects-pane">
      <div class="pane-head">
        <h2>Projects {completedCount > 0 ? `(${completedCount} done)` : ''}</h2>
      </div>
      <div class="card-grid">
      {#if visibleProjects.length === 0}
        <p class="empty">All projects complete. The world holds its breath.</p>
      {/if}
      {#each visibleProjects as p (p.id)}
        {@const unlocked = projectAvailable(p, $game)}
        {@const eff = effectiveProjectCost(p)}
        {@const grainOk = eff.grain === undefined || grainAmt >= eff.grain}
        {@const outputOk = eff.output === undefined || outputAmt >= eff.output}
        {@const affordable = grainOk && outputOk}
        <button
          class="project"
          class:locked={!unlocked}
          disabled={!unlocked || !affordable}
          on:click={() => completeProject(p.id)}
        >
          <div class="row">
            <strong>{unlocked ? p.name : '???'}</strong>
            {#if !unlocked}<span class="locked-tag">locked</span>{/if}
          </div>
          <div class="desc">{unlocked ? p.desc : p.requirementsText}</div>
          <div class="cost">
            {#if unlocked}
              {eff.grain !== undefined ? `${fmt(eff.grain)} grain` : ''}
              {eff.output !== undefined ? ` ${fmt(eff.output)} goods` : ''}
            {/if}
          </div>
        </button>
      {/each}
      </div>
    </section>
  </main>

  <footer class="logbar">
    <h2>Log</h2>
    <ul>
      {#each $game.log as line}
        <li>{line}</li>
      {/each}
    </ul>
  </footer>
</div>

<style>
  .app {
    position: relative;
    z-index: 2;
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    grid-template-areas: "topbar" "grid" "logbar";
  }

  /* ================================ Top bar =============================== */
  .topbar {
    grid-area: topbar;
    display: flex;
    align-items: center;
    gap: 1.75rem;
    padding: 1rem 2rem 1.1rem;
    background: var(--parchment-2);
    border-bottom: 2px double var(--rule);
    flex-wrap: wrap;
    transition: background-color 800ms ease, border-color 800ms ease;
  }

  .chapter {
    display: flex;
    align-items: baseline;
    gap: 0.9rem;
    line-height: 1;
  }
  .chapter-num {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 3.4rem;
    font-weight: 300;
    font-variation-settings: var(--display-italic-settings);
    color: var(--rubric);
    line-height: 0.85;
    letter-spacing: -0.02em;
  }
  .chapter-titles { display: flex; flex-direction: column; gap: 0.15rem; }
  .chapter-kicker {
    font-family: var(--font-body);
    font-size: 0.7rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .chapter-name {
    font-family: var(--font-display);
    font-size: 1.45rem;
    font-weight: 400;
    font-variation-settings: var(--display-settings);
    color: var(--ink);
    margin: 0;
    letter-spacing: -0.005em;
  }

  .resource-strip {
    display: flex;
    gap: 2.25rem;
    margin-left: 1rem;
    flex-wrap: wrap;
    align-items: flex-end;
  }
  .res {
    display: flex;
    flex-direction: column;
    min-width: 130px;
    border-left: 1px solid var(--rule);
    padding-left: 0.9rem;
  }
  .label {
    font-family: var(--font-body);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--ink-dim);
    margin-bottom: 0.15rem;
  }
  .val {
    font-family: var(--font-mono);
    font-size: 1.15rem;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .val.full { color: var(--rubric); }
  .val.starving { color: var(--rubric); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
  .rate {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--ink-dim);
    margin-top: 0.1rem;
  }

  .big {
    display: block;
    width: 100%;
    background: var(--rubric);
    color: var(--parchment);
    border: 1px solid var(--rubric);
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.15rem;
    font-variation-settings: var(--display-italic-settings);
    cursor: pointer;
    padding: 0.85rem 1rem;
    margin-bottom: 1.25rem;
    letter-spacing: 0.01em;
    transition: transform 120ms ease, box-shadow 200ms ease, background 200ms ease;
    box-shadow: 0 2px 0 var(--shadow);
  }
  .big:hover { transform: translateY(-1px); box-shadow: 0 4px 0 var(--shadow); background: color-mix(in srgb, var(--rubric) 85%, var(--gilt)); }
  .big:active { transform: translateY(1px); box-shadow: 0 0 0 var(--shadow); }

  .reset {
    background: transparent;
    border: 1px solid var(--rule);
    color: var(--ink-dim);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .reset:hover { color: var(--ink); border-color: var(--ink); }

  /* ================================= Grid ================================= */
  .grid {
    grid-area: grid;
    display: grid;
    grid-template-columns: 3fr 2fr;
    background: var(--parchment);
    overflow: hidden;
    min-height: 0;
  }
  .pane {
    background: transparent;
    padding: 1.5rem 2rem 2rem;
    overflow-y: auto;
    min-height: 0;
  }
  .upgrades-pane { border-right: 1px solid var(--rule); }

  /* ============================== Horizon strap =========================== */
  .horizon {
    position: relative;
    background: var(--parchment-3);
    border: 1px solid var(--rule);
    margin-bottom: 1.25rem;
    padding: 0.55rem 0.9rem 0.6rem;
    overflow: hidden;
  }
  .horizon-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(90deg, var(--gilt) 0%, rgba(184, 134, 44, 0.35) 100%);
    opacity: 0.5;
    transition: width 300ms ease;
    z-index: 0;
  }
  .horizon-text {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .horizon-kicker {
    font-family: var(--font-body);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--ink-dim);
  }
  .horizon-name {
    font-family: var(--font-display);
    font-style: italic;
    font-variation-settings: var(--display-italic-settings);
    font-size: 1.05rem;
    color: var(--ink);
    flex: 1;
  }
  .horizon-cost {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--ink);
  }

  .pane-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin: 0 0 1rem;
    padding-bottom: 0.55rem;
    border-bottom: 1px solid var(--rule);
  }
  .pane h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-variation-settings: var(--display-settings);
    font-size: 1.4rem;
    color: var(--ink);
    letter-spacing: -0.005em;
  }
  .pane h2.sub {
    font-size: 1.1rem;
    font-style: italic;
    font-variation-settings: var(--display-italic-settings);
    color: var(--rubric);
  }

  /* ================================ Toggle ================================ */
  .mode { display: flex; gap: 0; border: 1px solid var(--rule); }
  .mode button {
    background: transparent;
    border: 0;
    border-right: 1px solid var(--rule);
    color: var(--ink-dim);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    transition: background 150ms ease, color 150ms ease;
  }
  .mode button:last-child { border-right: 0; }
  .mode button:hover { background: var(--parchment-3); color: var(--ink); }
  .mode button.active { background: var(--ink); color: var(--parchment); }

  /* =============================== Cards ================================== */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.75rem;
  }

  .upgrade, .project {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--parchment-2);
    border: 1px solid var(--rule);
    color: inherit;
    font: inherit;
    padding: 0.85rem 1rem 0.9rem;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: transform 120ms ease, background 200ms ease, box-shadow 200ms ease;
  }
  .upgrade::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--fill, 0%);
    background: linear-gradient(90deg, rgba(184, 134, 44, 0.22) 0%, rgba(184, 134, 44, 0.06) 100%);
    pointer-events: none;
    transition: width 250ms ease;
    z-index: 0;
  }
  .upgrade > * { position: relative; z-index: 1; }
  .upgrade:hover:not(:disabled),
  .project:hover:not(:disabled):not(.locked) {
    background: var(--parchment-3);
    transform: translateY(-1px);
    box-shadow: 0 2px 0 var(--shadow);
  }
  .upgrade:disabled, .project:disabled { opacity: 0.45; cursor: not-allowed; }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }
  .row strong {
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 1.05rem;
    font-variation-settings: var(--display-settings);
    color: var(--ink);
    letter-spacing: -0.005em;
  }
  .lvl {
    font-family: var(--font-mono);
    color: var(--ink-dim);
    font-size: 0.75rem;
    letter-spacing: 0.04em;
  }
  .desc {
    font-family: var(--font-body);
    font-size: 0.88rem;
    color: var(--ink-dim);
    margin: 0.35rem 0 0.55rem;
    line-height: 1.4;
  }
  .cost {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    color: var(--gilt);
    border-top: 1px solid var(--rule);
    padding-top: 0.4rem;
    letter-spacing: 0.01em;
  }

  /* Projects — illuminated entries */
  .project {
    background: var(--parchment-2);
    border-left: 3px solid var(--rubric);
  }
  .project.locked {
    border-style: solid;
    border-color: var(--rule);
    border-left-color: var(--ink-dim);
    background: transparent;
    opacity: 0.55;
  }
  .project.locked .row strong { font-style: italic; color: var(--ink-dim); }
  .project.locked .desc { font-style: italic; }
  .locked-tag {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--ink-dim);
  }

  .empty {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 0.9rem;
    color: var(--ink-dim);
    padding: 1rem 0;
  }

  /* ================================ Log =================================== */
  .logbar {
    grid-area: logbar;
    background: var(--parchment-2);
    border-top: 2px double var(--rule);
    padding: 0.6rem 2rem 0.8rem;
    max-height: 140px;
    overflow-y: auto;
  }
  .logbar h2 {
    margin: 0 0 0.25rem;
    font-family: var(--font-display);
    font-style: italic;
    font-variation-settings: var(--display-italic-settings);
    font-size: 0.85rem;
    color: var(--ink-dim);
    letter-spacing: 0.04em;
  }
  .logbar ul {
    list-style: none;
    padding: 0;
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.85rem;
    column-count: 2;
    column-gap: 2.5rem;
  }
  .logbar li {
    padding: 0.1rem 0;
    color: var(--ink-dim);
    break-inside: avoid;
    line-height: 1.35;
  }
  .logbar li:first-child { color: var(--ink); }

  /* ============================== Responsive ============================== */
  @media (max-width: 960px) {
    .app { height: auto; min-height: 100vh; }
    .grid { grid-template-columns: 1fr; }
    .upgrades-pane { border-right: 0; border-bottom: 1px solid var(--rule); }
    .logbar { max-height: 200px; }
    .logbar ul { column-count: 1; }
    .topbar { padding: 0.85rem 1.25rem; gap: 1rem; }
    .chapter-num { font-size: 2.6rem; }
    .resource-strip { gap: 1.5rem; }
    .res { min-width: 100px; padding-left: 0.6rem; }
    .big { margin-left: 0; }
  }

  .big-sub {
    display: block; font-size: 0.7rem; letter-spacing: 0.1em;
    text-transform: uppercase; opacity: 0.65; margin-top: 0.25rem;
    font-family: var(--font-mono, monospace);
  }

  .legacy-chip {
    display: inline-flex; flex-direction: column; align-items: center;
    padding: 0.4rem 0.9rem; margin-right: 0.6rem;
    background: transparent; border: 1px solid var(--gilt, #d4a13a);
    color: var(--gilt, #d4a13a); border-radius: 4px;
    cursor: pointer; font-family: inherit;
  }
  .legacy-chip:hover { background: rgba(212, 161, 58, 0.1); }
  .legacy-label { font-size: 0.65rem; letter-spacing: 0.15em; text-transform: uppercase; opacity: 0.75; }
  .legacy-val { font-family: var(--font-mono, monospace); font-size: 1.1rem; font-weight: 600; }

  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.65);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  }
  .modal {
    background: var(--bg, #1d1610); border: 1px solid var(--gilt, #d4a13a);
    width: min(640px, 92vw); max-height: 88vh; overflow-y: auto;
    padding: 1.4rem 1.6rem; border-radius: 6px;
    color: var(--ink, #e4d3a8);
  }
  .modal-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1rem; }
  .modal-head h2 { margin: 0; font-family: var(--font-display, serif); letter-spacing: 0.04em; }
  .modal-head .close {
    background: transparent; border: none; color: inherit; font-size: 1.8rem;
    cursor: pointer; line-height: 1; padding: 0 0.4rem;
  }
  .legacy-summary { text-align: center; margin-bottom: 1.2rem; padding: 0.8rem; border: 1px solid rgba(212,161,58,0.25); border-radius: 4px; }
  .legacy-summary strong { font-size: 2rem; font-family: var(--font-mono, monospace); color: var(--gilt, #d4a13a); }
  .dim { opacity: 0.6; }
  .small { font-size: 0.78rem; letter-spacing: 0.04em; }

  .legacy-collapse { margin-bottom: 1.4rem; padding: 0.9rem; border: 1px solid rgba(197,88,58,0.4); border-radius: 4px; }
  .legacy-collapse .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .collapse-cta { text-align: right; }
  .cta-num { font-family: var(--font-mono, monospace); font-size: 1.3rem; color: var(--ember, #c5583a); margin-bottom: 0.4rem; }
  .collapse-btn {
    background: var(--ember, #c5583a); color: var(--bg, #1d1610);
    border: none; padding: 0.5rem 0.9rem; cursor: pointer; font-family: inherit;
    letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.8rem;
  }
  .collapse-btn:disabled { background: rgba(197,88,58,0.25); color: rgba(228,211,168,0.4); cursor: not-allowed; }

  .legacy-nodes h3 { font-family: var(--font-display, serif); letter-spacing: 0.03em; margin-bottom: 0.6rem; }
  .node { padding: 0.7rem 0.9rem; margin-bottom: 0.5rem; border: 1px solid rgba(212,161,58,0.2); border-radius: 4px; }
  .node.owned { border-color: var(--gilt, #d4a13a); background: rgba(212,161,58,0.08); }
  .node.locked { opacity: 0.45; }
  .node-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.2rem; }
  .node-cost { font-family: var(--font-mono, monospace); font-size: 0.85rem; color: var(--gilt, #d4a13a); }
  .node-desc { font-size: 0.88rem; opacity: 0.85; margin-bottom: 0.3rem; }
  .node-req { margin-bottom: 0.3rem; }
  .node-buy {
    background: transparent; border: 1px solid var(--gilt, #d4a13a); color: var(--gilt, #d4a13a);
    padding: 0.3rem 0.7rem; cursor: pointer; font-family: inherit; font-size: 0.78rem;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .node-buy:hover:not(:disabled) { background: rgba(212,161,58,0.15); }
  .node-buy:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
