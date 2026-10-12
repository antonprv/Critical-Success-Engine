**English** | [Русский](../../ru/guides/01-getting-started.md)

# 01. Getting started

## What you need

- **Node 22+** and **pnpm**.
- For physics: the **.NET 10 SDK** and the `wasm-tools` workload (`dotnet workload install wasm-tools`).
  Without them everything else works (rendering, menus, scripts) - the bodies just don't move, see below.

## Running

```bash
cd src/CSEngine          # the pnpm workspace: the engine and its modules
pnpm install
cd Core
pnpm dev            # http://127.0.0.1:5173
```

What you'll see if **the physics hasn't been built yet**: the loading screen, then the scene and a toast
*"Physics failed to load - the scene runs without a simulation"*. That's fine: the physics worker reports the error right away,
the engine doesn't wait for it, and scenes, menus, scripts and rendering all work. The ball in *Bouncing ball* just hangs in the air.

## Building the physics (wasm)

Details are in `src/CSEngine/Physics/Bridge/BUILD.md`. In short:

```bash
cd devops
bash build-physics.sh        # Windows: build-physics.bat - CI does exactly the same
```

The result: `src/CSEngine/Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework`. That's where `pnpm dev`
serves the files from, at `/physics-wasm/_framework/…` - there's nothing to copy, just refresh the page.
`pnpm build` copies this folder to `Binaries/Core/physics-wasm/_framework`, so the finished build loads the physics from the same
address. You can point to a different folder with the `PHYSICS_WASM_DIR` environment variable.

**First check that the physics is alive:** open the *Bouncing ball* scene (the ball should fall and rest on the slab, Space
tosses it up), then *Character test room* (run, jump, step onto the lift - it should carry you).

## Controls

Press **Play** (the browser only hands the mouse to the game on a click). Then:

| Key | Action |
|---|---|
| `W A S D`, mouse | move, look |
| `Space` | jump |
| `N` | noclip (fly through walls) |
| `1`…`5` | movement mode: Quake, Realistic, Hybrid, Doom 3, Quake-Strafe-Doom2016 |
| `V` | camera: first / third person |
| `LMB` | shoot (in the *Character test room* scene) |
| `R` | restart (in *Coin Hunt* after a win/loss) |
| `Esc` | the browser releases the mouse - the menu with the scene list opens |

## Project map

```
src/CSEngine/
  Core/                         ← everything TypeScript
    Source/
      App.ts                    main-thread entry point: brings up the Vue UI and the Orchestrator
      Ui/                       Vue + Quasar (interface RENDERING only)
      Workers/                  five workers and the protocols between them
        GameLogicWorker.ts        a thin shell over Engine/Runtime
        RenderWorker.ts           Babylon on an OffscreenCanvas
        PhysicsWorker.ts          the fixed-step loop
        Physics/PhysicsWorld.ts   the ONLY place that talks to the wasm bridge
        UiWorker.ts, Ui/UiController.ts   state and logic of the menu/loading screen
        Protocol/                 message types between the workers
      Engine/                   the engine core - runs inside GameLogic
        Core/                     Component, Entity, EntityWorld, manifests, Shapes, CollisionLayer
        Components/               ready-made components: MeshRenderer, bodies, Mover, Camera…
        Services/                 Physics / Render / Input / Ui / Audio for scripts
        Scenes/                   SceneManager (load/unload), SceneRegistry
        Runtime/GameLogicRuntime  two "ticks": the frame (Update) and physics (OnPhysicsUpdate)
        Math/                     Vec3, Quat
      Game/                     ← YOUR GAME
        GameScenes.ts             the scene list (what shows up in the menu)
        Scenes/                   scene manifests
        Scripts/                  your components
        GuideExamples/            the code from these guides
    Tests/                      Vitest: unit and integration tests (including the whole runtime on fake ports)
    E2E/                        Playwright: tests of the built site in a real browser
    BuildTools/                 Vite plugins: physics (serving/copying), the log sidecar
    public/                     static files, copied into the build as is (public/assets/x → /assets/x)
    index.html                  the Vite HTML entry point
    vite.config.ts              the build and the dev server
  Physics/
    Bridge/PhysicsBridge.cs     the C# bridge: the only thing written in C#
    Vendor/                     BEPU and the Integration glue
```

The principle everything rests on: **C# exists only for the physics and the bridge to it**. Everything else is TypeScript.

## The development loop

1. Edit files in `Source/Game/**`.
2. Refresh the page (worker changes are applied by reloading; Vue components update on the fly).
3. `pnpm test` - Vitest. It runs the **real** GameLogicRuntime with fake workers (scripts and scenes are checked
   without a browser), plus the Vue UI, the bridges, the worker shells and the build plugins. Coverage is measured, and the run fails
   if any file drops below 100% on lines, branches or functions: new code arrives together with tests.
4. `pnpm typecheck` (it uses `vue-tsc` inside, which understands `.vue`; plain `tsc` complains about them) and `pnpm lint`.
5. `pnpm test:e2e` - Playwright: builds the site the same way as `pnpm build`, serves it through `vite preview` and plays it
   in Chromium like a user (menu, keyboard, mouse, scene changes, pixels on screen). The browser is installed once:
   `pnpm exec playwright install chromium`. These tests take the physics from a stand-in runtime (`E2E/fixtures/mock-physics`)
   so they don't depend on .NET; with `E2E_REAL_PHYSICS=1` a run on the real wasm physics is added (CI does this).

Everything at once: `pnpm verify` (types, lint, tests, build, E2E).

Worker logs go to the browser console. If the sidecar logger is running (`vite dev` starts it by itself), they are also written to a file.
The file `Tools/LogServer.mjs` was not in the archive sent to me; if you don't have it either, the sidecar won't start and the logs will stay only in the browser console (this shouldn't get in the game's way).

Next → [02. First scene](02-first-scene.md)
