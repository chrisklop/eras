<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { game, logEvent, buyMode, type BuyMode } from './game/game';
  import { agrarianUpgrades, buyUpgrade, nextAgrarianBulkCost, grainPerSec, grainConsumedPerSec, consumptionPerPop, grainCap, popCap, gatherGrain, currentHousingTier, dwellingMaxLevel } from './game/eras/agrarian';
  import { industrialUpgrades, buyIndustrialUpgrade, nextBulkCost, outputPerSec, grainDrainPerSec, outputCap } from './game/eras/industrial';
  import { projects, projectAvailable, projectIncomplete, completeProject } from './game/projects';
  import { startLoop, stopLoop } from './game/tick';
  import { hydrate, resetGame } from './game/save';

  onMount(() => {
    hydrate();
    startLoop();
  });
  onDestroy(stopLoop);

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
  $: visibleProjects = projects.filter(p => projectIncomplete(p, $game));
  $: completedCount = Object.keys($game.completedProjects ?? {}).length;

  const buyModes: BuyMode[] = [1, 10, 100, 'max'];
  function setMode(m: BuyMode) { buyMode.set(m); }

  function hardReset() {
    if (confirm('Wipe save and restart?')) {
      resetGame();
      logEvent('A new settlement gathers by the river.');
    }
  }
</script>

<div class="app">
  <header class="topbar">
    <h1>Eras</h1>
    <span class="era">— {$game.era}</span>
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
        <span class="val" class:full={popAmt >= popMax}>{Math.floor(popAmt)} / {popMax}</span>
        <span class="rate">
          {#if grainNet <= 0 && grainAmt < 1}underfed
          {:else if popAmt >= popMax}housing full
          {:else if grainNet > 0 && grainAmt > 0}growing
          {:else}stable{/if}
        </span>
      </div>
      {#if $game.era === 'industrial' || $game.era === 'information'}
        <div class="res">
          <span class="label">Output</span>
          <span class="val">{fmt(outputAmt)} / {fmt(outputCap($game))}</span>
          <span class="rate">+{fmt(outputPerSec($game))}/s</span>
        </div>
      {/if}
    </div>
    <button class="big" on:click={gather}>Gather grain</button>
    <button class="reset" on:click={hardReset}>reset</button>
  </header>

  <main class="grid">
    <section class="pane upgrades-pane">
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
          {@const bulk = nextAgrarianBulkCost(u.id, $buyMode)}
          {@const buyable = !maxed && bulk.n > 0 && grainAmt >= bulk.total}
          <button class="upgrade" disabled={!buyable} on:click={() => buyUpgrade(u.id, $buyMode)}>
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
          {#each industrialUpgrades as u}
            {@const lvl = $game.upgrades[u.id] ?? 0}
            {@const maxed = u.max !== undefined && lvl >= u.max}
            {@const bulk = nextBulkCost(u.id, $buyMode)}
            {@const have = bulk.res === 'grain' ? grainAmt : outputAmt}
            {@const buyable = !maxed && bulk.n > 0 && have >= bulk.total}
            <button class="upgrade" disabled={!buyable} on:click={() => buyIndustrialUpgrade(u.id, $buyMode)}>
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
        {@const grainOk = p.cost.grain === undefined || grainAmt >= p.cost.grain}
        {@const outputOk = p.cost.output === undefined || outputAmt >= p.cost.output}
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
              {p.cost.grain !== undefined ? `${fmt(p.cost.grain)} grain` : ''}
              {p.cost.output !== undefined ? ` ${fmt(p.cost.output)} output` : ''}
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
  :global(body) {
    margin: 0;
    background: #1a1612;
    color: #e8dfc8;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }
  :global(html, body) { height: 100%; }
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "topbar"
      "grid"
      "logbar";
  }

  /* Top bar — era, resources, reset */
  .topbar {
    grid-area: topbar;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    background: #221c16;
    border-bottom: 1px solid #3a2f24;
    flex-wrap: wrap;
  }
  h1 { margin: 0; font-size: 1.5rem; letter-spacing: 0.05em; }
  .era { opacity: 0.5; font-size: 0.85rem; }
  .resource-strip { display: flex; gap: 2rem; margin-left: 1rem; flex-wrap: wrap; }
  .res { display: flex; flex-direction: column; min-width: 140px; }
  .label { font-size: 0.7rem; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.08em; }
  .val { font-size: 1.15rem; font-weight: bold; }
  .val.full { color: #d88a6a; }
  .val.starving { color: #e44; }
  .rate { font-size: 0.75rem; opacity: 0.7; color: #a8d8a8; }
  .reset {
    margin-left: auto;
    background: none;
    border: 1px solid #444;
    color: #888;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
  }
  .reset:hover { color: #ccc; border-color: #666; }

  /* Three-column grid body */
  .grid {
    grid-area: grid;
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: 1px;
    background: #0a0805;
    overflow: hidden;
    min-height: 0;
  }
  .pane {
    background: #1a1612;
    padding: 1rem 1.25rem;
    overflow-y: auto;
    min-height: 0;
  }
  .pane h2 {
    font-size: 0.8rem;
    text-transform: uppercase;
    opacity: 0.55;
    letter-spacing: 0.1em;
    margin: 0;
  }
  .pane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: 0 0 0.75rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid #2a241c;
  }
  .pane h2.sub {
    margin-top: 1rem;
  }
  .mode { display: flex; gap: 0.25rem; }
  .mode button {
    background: #221c16;
    border: 1px solid #3a2f24;
    color: #b8b09a;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
    border-radius: 3px;
  }
  .mode button:hover { border-color: #6a5a3a; }
  .mode button.active { background: #4a3a24; color: #fff; border-color: #8a6a3a; }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 0.5rem;
  }

  /* Bottom log */
  .logbar {
    grid-area: logbar;
    background: #15110d;
    border-top: 1px solid #2a241c;
    padding: 0.5rem 1.25rem;
    max-height: 160px;
    overflow-y: auto;
  }
  .logbar h2 {
    margin: 0 0 0.25rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    opacity: 0.5;
    letter-spacing: 0.1em;
  }
  .logbar ul { list-style: none; padding: 0; margin: 0; font-size: 0.8rem; }
  .logbar li { padding: 0.15rem 0; opacity: 0.85; }

  /* Action button (now in top bar) */
  .big {
    background: #3a5a3a;
    color: #fff;
    border: none;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    margin-left: 0.5rem;
  }
  .big:hover { background: #4a6a4a; }
  .big:active { background: #2a4a2a; }

  /* Upgrades */
  .upgrade {
    display: block;
    width: 100%;
    text-align: left;
    background: #221c16;
    border: 1px solid #3a2f24;
    color: inherit;
    font: inherit;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    cursor: pointer;
    border-radius: 3px;
  }
  .upgrade:hover:not(:disabled) { border-color: #6a5a3a; background: #2a221a; }
  .upgrade:disabled { opacity: 0.4; cursor: not-allowed; }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .lvl { opacity: 0.6; font-size: 0.85rem; }
  .desc { font-size: 0.85rem; opacity: 0.75; margin: 0.25rem 0; line-height: 1.35; }
  .cost { font-size: 0.85rem; color: #d4b87a; }

  /* Projects */
  .project {
    display: block;
    width: 100%;
    text-align: left;
    background: #1d2225;
    border: 1px solid #2f3a44;
    color: inherit;
    font: inherit;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    cursor: pointer;
    border-radius: 3px;
  }
  .project:hover:not(:disabled) { border-color: #5a7a9a; background: #232a30; }
  .project:disabled { opacity: 0.45; cursor: not-allowed; }
  .project.locked { background: #18191a; border-style: dashed; border-color: #3a3a3a; }
  .project.locked .desc { font-style: italic; opacity: 0.7; }
  .locked-tag { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.6; }
  .empty { opacity: 0.5; font-size: 0.85rem; font-style: italic; }

  /* Narrow screen: stack panes */
  @media (max-width: 900px) {
    .app { height: auto; min-height: 100vh; }
    .grid {
      grid-template-columns: 1fr;
      gap: 0;
    }
    .pane { max-height: none; }
    .logbar { max-height: 240px; }
  }
</style>
