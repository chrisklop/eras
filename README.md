# Eras

A narrative incremental game in the spirit of Universal Paperclips. You guide a civilization through escalating eras — Agrarian → Industrial → Information → Algorithmic → Post-human → Cosmic. The core resource renames itself as the story shifts.

## Status

Early scaffold. Agrarian era is playable: gather grain, buy plows/irrigation/granaries, watch population grow. Era transitions, projects panel, and remaining eras are stubs.

## Stack

Svelte 5 + TypeScript + Vite. localStorage saves. Static deploy.

## Run

```
npm install
npm run dev
```

## Design

Each era is a config module under `src/game/eras/` so content iterates independently of engine code. Tick loop in `src/game/tick.ts` runs every 100ms and dispatches to the active era. State lives in a single Svelte writable store (`src/game/game.ts`).

## Roadmap

1. Agrarian polish + projects panel (paperclips-style narrative beats)
2. Industrial era + transition mechanic
3. Eras 3–6 + ending
4. Sound, juice, mobile layout
5. Cloud saves + leaderboards
