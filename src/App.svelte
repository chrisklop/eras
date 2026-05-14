<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { game, logEvent } from './game/game';
  import { agrarianUpgrades, buyUpgrade, grainPerSec, grainCap, gatherGrain } from './game/eras/agrarian';
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

  function canAfford(id: string): boolean {
    const lvl = $game.upgrades[id] ?? 0;
    const def = agrarianUpgrades.find(u => u.id === id)!;
    return ($game.resources.grain ?? 0) >= def.cost(lvl).grain;
  }

  function hardReset() {
    if (confirm('Wipe save and restart?')) {
      resetGame();
      logEvent('A new settlement gathers by the river.');
    }
  }
</script>

<main>
  <header>
    <h1>Eras</h1>
    <span class="era">— {$game.era}</span>
    <button class="reset" on:click={hardReset}>reset</button>
  </header>

  <section class="resources">
    {@const grain = $game.resources.grain ?? 0}
    {@const cap = grainCap($game)}
    {@const full = grain >= cap - 0.01}
    <div class="res">
      <span class="label">Grain</span>
      <span class="val" class:full>{fmt(grain)} / {fmt(cap)}</span>
      <span class="rate">{full ? 'storage full' : `+${fmt(grainPerSec($game))}/s`}</span>
    </div>
    <div class="res">
      <span class="label">Population</span>
      <span class="val">{Math.floor($game.resources.pop ?? 0)}</span>
    </div>
  </section>

  <section class="action">
    <button class="big" on:click={gather}>Gather grain</button>
  </section>

  <section class="upgrades">
    <h2>Upgrades</h2>
    {#each agrarianUpgrades as u}
      {@const lvl = $game.upgrades[u.id] ?? 0}
      {@const cost = u.cost(lvl).grain}
      {@const maxed = u.max !== undefined && lvl >= u.max}
      <button
        class="upgrade"
        disabled={maxed || !canAfford(u.id)}
        on:click={() => buyUpgrade(u.id)}
      >
        <div class="row">
          <strong>{u.name}</strong>
          <span class="lvl">Lv {lvl}{u.max ? `/${u.max}` : ''}</span>
        </div>
        <div class="desc">{u.desc}</div>
        <div class="cost">{maxed ? 'maxed' : `${fmt(cost)} grain`}</div>
      </button>
    {/each}
  </section>

  <section class="log">
    <h2>Log</h2>
    <ul>
      {#each $game.log as line}
        <li>{line}</li>
      {/each}
    </ul>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #1a1612;
    color: #e8dfc8;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  h1 { margin: 0; font-size: 1.75rem; letter-spacing: 0.05em; }
  .era { opacity: 0.5; font-size: 0.9rem; }
  .reset {
    margin-left: auto;
    background: none;
    border: 1px solid #444;
    color: #888;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
  }
  .resources {
    display: flex;
    gap: 2rem;
    padding: 1rem;
    background: #221c16;
    border: 1px solid #3a2f24;
    margin-bottom: 1rem;
  }
  .res { display: flex; flex-direction: column; }
  .label { font-size: 0.75rem; opacity: 0.6; text-transform: uppercase; }
  .val { font-size: 1.5rem; font-weight: bold; }
  .val.full { color: #d88a6a; }
  .rate { font-size: 0.8rem; opacity: 0.7; color: #a8d8a8; }
  .action { margin-bottom: 1.5rem; }
  .big {
    width: 100%;
    padding: 1rem;
    background: #3a5a3a;
    color: #fff;
    border: none;
    font: inherit;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .big:active { background: #2a4a2a; }
  .upgrades h2, .log h2 {
    font-size: 0.85rem;
    text-transform: uppercase;
    opacity: 0.6;
    letter-spacing: 0.1em;
    margin: 1rem 0 0.5rem;
  }
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
  }
  .upgrade:hover:not(:disabled) { border-color: #6a5a3a; }
  .upgrade:disabled { opacity: 0.4; cursor: not-allowed; }
  .row { display: flex; justify-content: space-between; }
  .lvl { opacity: 0.6; font-size: 0.85rem; }
  .desc { font-size: 0.85rem; opacity: 0.75; margin: 0.25rem 0; }
  .cost { font-size: 0.85rem; color: #d4b87a; }
  .log ul {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 0.85rem;
    max-height: 200px;
    overflow-y: auto;
  }
  .log li {
    padding: 0.25rem 0;
    border-bottom: 1px solid #2a241c;
    opacity: 0.85;
  }
</style>
