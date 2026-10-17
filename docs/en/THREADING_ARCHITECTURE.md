**English** | [Русский](../ru/THREADING_ARCHITECTURE.md)

# Threading architecture

The engine runs in the page (the main thread) and five workers. This document says who owns what, why the split looks like this, and
what to keep in mind when relying on it. The code is in `src/CSEngine/Core/Source/Workers`; the model of scripting and scenes is in
[ENGINE_ARCHITECTURE.md](ENGINE_ARCHITECTURE.md) and the [guides](guides/00-index.md).

## Who owns what

| Thread | Owns | Does not own |
|---|---|---|
| main thread (`App.ts`, `Orchestrator.ts`) | DOM listeners (keyboard, pointer, pointer lock, window size), the `AudioContext` playback, drawing the UI state (Vue/Quasar) | game state, physics, rendering |
| `RenderWorker.ts` | the OffscreenCanvas, Babylon `Engine`/`Scene`, meshes, `AssetLoader` | game state, physics |
| `PhysicsWorker.ts` | the CSPhysics simulation (through the wasm bridge), fixed-step stepping | mesh objects, gameplay rules |
| `GameLogicWorker.ts` | entities, components, scenes, input state, the frame and physics ticks | rendering, physics internals |
| `AudioWorker.ts` | sound decoding | playback (that is on the main thread) |
| `UiWorker.ts` | the state and logic of the menu / loading screen (`Workers/Ui/UiController.ts`) | drawing (Vue on the main thread draws the state) |

`Workers/Orchestrator.ts` starts the workers; `Workers/OrchestratorUtils/GameWorkers.ts` wires them: the main thread talks to every worker, and
GameLogic gets a direct `MessageChannel` to each of the render, physics, audio and UI workers (port 1 goes to GameLogic, port 2 to the other worker).
The message types are in `Workers/Protocol/`. A new system (asset streaming, networking, a pathfinding worker) gets its own file and its own channel to
whoever needs its output; the channels are created in one place, `GameWorkers`.

## Why messages and not SharedArrayBuffer

The engine uses `postMessage` / structured clone, not `SharedArrayBuffer` + Atomics. In plain terms:

- **What you get**: no COOP/COEP response headers anywhere the game is hosted (`Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp`). They are easy to forget, easy to break by adding a single third-party `<script src>`, and out of your
  control on a platform that doesn't let you set response headers.
- **What it costs**: every batch of transforms, spawn command and event is copied between worker realms on each tick, instead of several threads
  reading the same memory. At the entity counts of a single-player web game this hardly matters. If transform messages ever show up in a profile, the
  first step is `Transferable` objects (send the underlying `ArrayBuffer` of a `Float64Array` with `postMessage(msg, [buffer])` - no copy, still no
  SharedArrayBuffer, no COOP/COEP), before reaching for shared memory.

## Why the physics is real CSPhysics through WASM

The physics is the real CSPhysics, not a JS library: `Modules/Physics/Bridge` compiles the engine's `Physics.Integration` (with the vendored `CSPhysics` /
`CSPhysics.Utilities` and `FastMath`) to a browser wasm module with the .NET `wasm-tools` workload, and `Workers/Physics/PhysicsWorld.ts` is the only place that
calls it (`[JSExport]` methods of `PhysicsBridge.cs`). How to build it: `devops/build-physics.sh` (or `build-all` without `--skip-physics`), details in
`Modules/Physics/Bridge/BUILD.md`.

`PhysicsWorker.ts` degrades gracefully if the wasm module fails to load: it reports the error, the game shows a toast and carries on without a simulation, and
the other workers keep working. That is handy for working on rendering and gameplay without a physics build.

## The message flow

```
PhysicsWorker (setInterval + accumulator, a fixed 60 Hz)
  -> PhysicsWorld.Step(dt)                            [a wasm call, in the same thread]
  -> postMessage(step snapshot: bodies, characters, overlaps)   -> GameLogicWorker
GameLogicWorker (the physics tick)
  -> OnPhysicsSync -> overlap callbacks -> every component's OnPhysicsUpdate
  -> postMessage({ commands: [...] }) back to PhysicsWorker       (one batch per tick)

RenderWorker (the display tick, once per shown frame, at most 2 pending)
  -> "frame-request"                                  -> GameLogicWorker
GameLogicWorker (the render tick)
  -> OnInputUpdate -> Update -> OnUIUpdate of every component
  -> "Frame": interpolated poses of everything drawn + the camera pose  (a Transferable buffer)
RenderWorker draws the latest frame it received.
```

Physics steps and render frames are decoupled. The interpolation between the last two physics poses happens in GameLogic
(`Transform.WriteInterpolated`), so the render worker just applies what it is told.

## Developer tools

Babylon's Inspector (`scene.debugLayer`) builds its own DOM overlay and needs `document`, which a worker doesn't have, so the render worker's
`SetInspectorVisible` is deliberately a no-op. If you want an Inspector during development there are two ways:

1. Keep a second, non-worker launch path just for `pnpm dev` (a direct Babylon setup on the page's canvas instead of the orchestrator), accepting that dev and
   prod then differ in structure.
2. Send whatever the Inspector needs back to the main thread and draw your own debug UI there (more work, but dev and prod share the same worker split).

Neither is implemented.

## Known gaps

- The loading screen shows the scene-load progress, not the real progress of background asset loading.
- A character move that arrives after its step has already run is skipped (commands are consumed exactly once); this is visible only after a stall, when the
  physics worker catches up with several steps at once.
