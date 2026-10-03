# Critical Success Engine threading architecture

> **Update:** there are now **five** workers - a `UiWorker` was added (UI state/logic; Vue + Quasar on the main thread
> only render it), and `gamelogic` became a component/scene runtime. The reasoning below still holds; for the current
> picture and the scripting model read [ENGINE_ARCHITECTURE.md](ENGINE_ARCHITECTURE.md) and the guides in
> [guides/](guides/00-index.md). File names below use the old lowercase names (`render.worker.ts`...); the current ones
> are `RenderWorker.ts`, `PhysicsWorker.ts`, `GameLogicWorker.ts`, `AudioWorker.ts`, `UiWorker.ts`.

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

## Message flow (current)

```
PhysicsWorker (setInterval + accumulator, fixed 60 Hz)
  -> PhysicsWorld.Step(dt)                            [wasm call, in-thread]
  -> postMessage(Step snapshot: bodies, characters, overlaps)   -> GameLogicWorker
GameLogicWorker (physics clock)
  -> OnPhysicsSync -> overlap callbacks -> OnPhysicsUpdate for every component
  -> postMessage({ commands: [...] }) back to PhysicsWorker       (one batch per tick)

RenderWorker (display clock, once per displayed frame, max 2 outstanding)
  -> "frame-request"                                  -> GameLogicWorker
GameLogicWorker (render clock)
  -> OnInputUpdate -> Update -> OnUIUpdate for every component
  -> "Frame": interpolated poses of all renderables + camera pose  (Transferable buffer)
RenderWorker draws the latest frame it has received.
```

Physics steps and render frames are decoupled. Interpolation between the last two physics poses happens in GameLogic
(`Transform.WriteInterpolated`), so the render worker just applies what it is told.

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

- The whole `PhysicsWorld` API is exposed through `PhysicsBridge`. `PhysicsBridge.cs` was compile-checked against the
  real Integration/Bepu sources (C# only, net8 reference assemblies); the browser-wasm build itself
  (`dotnet workload install wasm-tools`, net10) and the runtime behaviour in a browser have NOT been run by the author of
  this change - build it per `Physics/Bridge/BUILD.md` and walk through the character test scene before trusting it.
- The loading screen shows scene-loading progress, not real background-asset download progress.
- A character move that arrives after its step already ran is skipped (commands are consumed exactly once); this only shows
  after a stall, when the physics worker catches up with several steps at once.
