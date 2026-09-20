# LanternFestival threading architecture

What changed, why it's split this way, and what to check before you rely on
any of it.

## Before / after

**Before:** `app.ts` synchronously imported `game/Game.ts`, which created a
Babylon `Engine`/`Scene` directly on the main thread's `<canvas>`, and used
Babylon's default Havok (WASM) plugin for physics if/when one was added. One
thread did input, game logic, physics, and rendering, in whatever order
Babylon's render loop happened to call them.

**After:** `app.ts` boots `src/workers/orchestrator.ts`, which owns nothing
but four `Worker` instances and the DOM event listeners that can only exist
on the main thread (keyboard/pointer events, `AudioContext` unlock gesture,
window resize). Everything else moved into its own worker:

| Worker | Owns | Does not own |
|---|---|---|
| `render.worker.ts` | OffscreenCanvas, Babylon `Engine`/`Scene`, meshes, `AssetLoader` | game state, physics |
| `physics.worker.ts` | the BEPU simulation (via `physics-wasm`), fixed-timestep stepping | mesh objects, gameplay rules |
| `gamelogic.worker.ts` | entity registry, input handling, gameplay/AI | rendering, physics internals |
| `audio.worker.ts` | `AudioContext`, sound playback | everything else |

## Why these four, and not more/fewer

You chose "maximally split - one worker per system" over the router asked.
The four above are the systems that currently exist in this codebase. If you
add a fifth system later (streaming/asset-prefetch, networking, a dedicated
AI/pathfinding worker), give it its own file and its own `MessageChannel`
edge to whichever worker needs its output - `orchestrator.ts`'s `wireWorkers`
is the one place that creates channels and hands out ports, so that's the
only file a new worker's wiring touches.

## Why message-passing, not SharedArrayBuffer

You picked `postMessage`/structured-clone over `SharedArrayBuffer` + Atomics.
That trade-off in plain terms:

- **What you get**: no COOP/COEP response headers required anywhere the game
  is hosted (`Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp` - easy to forget, easy to break
  by adding one third-party `<script src>` later, and outside your control if
  you ever host on a platform that doesn't let you set response headers).
- **What it costs**: every transform batch, spawn command, and event is
  copied (structured clone) between worker realms every tick, instead of
  multiple threads reading the same memory. For the entity counts a
  single-player web game like this deals in, that cost is very unlikely to
  matter; if transform-batch messages ever show up as a profiler hotspot,
  the fix is `Transferable` objects (send a `Float64Array`'s underlying
  `ArrayBuffer` with `postMessage(msg, [buffer])` instead of a plain array -
  zero-copy, still no SharedArrayBuffer/Atomics/COOP/COEP needed) before
  reaching for shared memory.

## Why physics is real BEPU-via-WASM, not a JS physics library

You specifically asked to port the Bepu integration from your Godot project,
not adopt Rapier/Cannon/etc. `physics-wasm/` compiles your actual
`Framework.Physics` + vendored `BepuPhysics`/`BepuUtilities` (copied from
`Setup.7z`) to a browser wasm module via .NET 8's `wasm-tools` workload, and
`physics.worker.ts` calls into it through `[JSExport]`
(`physics-wasm/Bridge/PhysicsBridge.cs`). See `physics-wasm/BUILD.md` for the
actual build steps and, importantly, the caveats - **I have not built or run
this myself** (no NuGet access in the sandbox I wrote it in), so treat the
wasm side as unverified until you've run through BUILD.md's smoke test.

`physics.worker.ts` degrades gracefully if the wasm module fails to load
(logs an error, stops stepping) rather than crashing the other three workers
- useful for iterating on rendering/gameplay before the physics build exists.

## Message flow for one physics tick

```
physics.worker (setInterval, fixedTimestepMs)
  -> PhysicsBridge.Step(dt)                          [wasm call, in-thread]
  -> postMessage("transforms", ...) on physics<->gamelogic port
gamelogic.worker
  -> postMessage("transform-batch", ...) on gamelogic<->render port
render.worker
  -> applies each entity's new position/rotation to its Babylon mesh
  -> next engine.runRenderLoop() frame picks it up
```

Physics steps and render frames are decoupled - physics runs its own fixed
60Hz loop regardless of render framerate, and render just draws whatever the
latest `transform-batch` said. There is no interpolation between physics
steps and render frames here; add it in `render.worker.ts`'s
`applyTransform` (blend between the last two received transforms based on
time-since-last-batch) if 60Hz physics against a faster/uneven display
refresh rate starts looking visually stepped.

## Dev tooling

Babylon's Inspector (`scene.debugLayer`) creates its own DOM overlay and
needs `document`, which doesn't exist in a worker. It's not wired up in
`render.worker.ts` for that reason. Two ways forward if you want it back
during development:

1. Keep a second, non-worker boot path for `pnpm dev` specifically (import
   `Game.ts`'s old direct-Babylon setup instead of the orchestrator when
   `__DEV__` is true), accepting that dev and prod then diverge structurally.
2. Forward whatever Inspector needs to inspect back to the main thread and
   render a custom, non-Babylon-Inspector debug UI there instead (more work,
   but keeps dev/prod using the same worker split).

Neither is implemented - `Game.ts` is left in the repo (marked superseded)
specifically so option 1 is a small diff if you want it.

## Known gaps

- `AddConvexHullShape`, `AddTriangleMeshShape`, `SweepProjectile`,
  `SweepSphereCast` aren't exposed through `PhysicsBridge` yet - see that
  file's doc comment and `BUILD.md`'s "Extending the bridge" for the pattern.
- The loading screen no longer tracks real background-asset progress (see the
  `TODO` in `app.ts`) since `AssetLoader` now runs inside `render.worker.ts`,
  out of the main thread's direct sight.
- No transform interpolation between physics steps and render frames (see
  above).
- `gamelogic.worker.ts`'s demo scene (one falling sphere, one static ground
  box, space bar = impulse) exists only to prove the pipeline end to end once
  `physics-wasm` is built - replace `spawnDemoScene` with real level/entity
  spawning.
