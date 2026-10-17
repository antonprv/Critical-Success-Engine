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

Without `CSE_PROJECT` the engine builds **Games Sample** - the engine's own project that holds the games of all the templates (Blank, First Person, Coin Hunt, Third Person, Top-Down); their scenes are in the `Esc` menu. To work on one project, point to it: `CSE_PROJECT=../../Templates/CoinHunt pnpm dev` (a template is a project too), or a project you created in the Project Manager (guides 13 and 16).

What you'll see if **the physics hasn't been built yet**: the loading screen, then the scene and a toast
*"Physics failed to load - the scene runs without a simulation"*. That's fine: the physics worker reports the error right away,
the engine doesn't wait for it, and scenes, menus, scripts and rendering all work. The ball in *Bouncing ball* just hangs in the air.

## Building the physics (wasm)

Details are in `src/CSEngine/Modules/Physics/Bridge/BUILD.md`. In short:

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

These are the default keys: the game takes them from the project's input files, and the player can remap them (guide 14). The exception is `1`…`5`: those are keys of `MoverComponent` itself.

## Project map

```
src/
  CSEngine/
    Core/                         <- everything TypeScript (@cse/core)
      Source/
        App.ts                    main-thread entry point: brings up the Vue UI and the Orchestrator
        Project.ts                the engine's modules and the project being built (CSE_PROJECT)
        Ui/                       Vue + Quasar (DRAWING only): HUD, toasts, fallback menu and loading screens
        Workers/                  five workers and the protocols between them
          Orchestrator.ts           starts the workers and connects them with channels
          GameLogicWorker.ts        a thin shell over Engine/Runtime
          RenderWorker.ts           Babylon on an OffscreenCanvas
          PhysicsWorker.ts          the fixed-step loop
          Physics/PhysicsWorld.ts   the ONLY place that talks to the wasm bridge
          UiWorker.ts, Ui/UiController.ts   state and logic of the menu/loading screen
          Protocol/                 message types between the workers
        Engine/                   the engine core - runs inside GameLogic
          Core/                     Component, Entity, EntityWorld, EntityPool, manifests, Shapes, CollisionLayer
          Components/               ready-made components: MeshRenderer, bodies, Mover, Camera...
          Gameplay/                 ready-made scripts (Scripts.ts) and recipes (Recipes.ts, guide 08)
          Services/                 Physics / Render / Input / Ui / Audio / Settings for scripts
          Input/, Data/, Storage/   input actions, data files, SettingsStorage (guides 14, 15)
          Modules/, Projects/       modules and plugins, the project descriptor (guides 12, 13)
          Scenes/                   SceneManager (load/unload), SceneRegistry, SceneHelpers (StaticBox...)
          Runtime/GameLogicRuntime  two "ticks": the frame (Update) and physics (OnPhysicsUpdate)
          Math/                     Vec3, Quat
        Logging/                  Logger (guide 17)
        Examples/                 the code from these guides (checked by Tests/GuideExamples.test.ts)
      Samples/                    Games Sample: the engine's project that holds the games of all the templates
      Tests/                      Vitest: unit and integration tests (including the whole runtime on fake ports)
      E2E/                        Playwright: tests of the built site in a real browser
      BuildTools/                 Vite plugins: physics (serving/copying), projects, the log sidecar
      public/                     static files, copied into the build as is (public/assets/x -> /assets/x)
      index.html                  the Vite HTML entry point
      vite.config.ts              the build and the dev server
    Modules/                    Engine/UI (@cse/ui), Editor/ProjectBrowser, Editor/UIDesigner
    Programs/Desktop/           the desktop app (Electron), guide 16
    Physics/
      Bridge/PhysicsBridge.cs     the C# bridge: the only thing written in C#
      Vendor/                     CSPhysics and the Integration glue
  Templates/                    <- YOUR GAME starts here: project templates
    CoinHunt/
      TemplateProject.cseproject          the project descriptor
      Source/TemplateProjectModule.ts     the game's main module: registers the scenes
      Source/Scenes/, Scripts/, Data/     scenes, your components, data classes
      Content/UI/, Input/, Data/          UI documents, input files, .csedata files
```

A game is a **project** (guide 13): its code lives in the project's own `Source/`, not inside `Core`. The whole model is the
`src/Templates/CoinHunt` template. Engine imports in a project's code go through `@cse/core/...` (for example `@cse/core/Engine/Core/Component`).

The principle everything rests on: **C# exists only for the physics and the bridge to it**. Everything else is TypeScript.

## The development loop

1. Edit your project's code (the project's `Source/**`; for a template - `src/Templates/<Name>/Source`).
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

Worker logs go to the browser console, and on a local dev server they can also be sent to a log file by the sidecar. How that works is in [guide 17](17-logging.md).

Next → [02. First scene](02-first-scene.md)
