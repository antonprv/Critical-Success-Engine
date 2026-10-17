**English** | [Русский](README.ru.md)

# Critical Success Engine

A browser game engine: TypeScript + [Babylon.js](https://www.babylonjs.com/) for rendering, CSPhysics (C#, compiled to WebAssembly) for physics, Vue 3 + Quasar for the interface. Every subsystem runs in its own worker. The build is [Vite](https://vite.dev/), the tests are Vitest (unit/integration) and Playwright (in a real browser).

Detailed guides: [`docs/en/guides/00-index.md`](docs/en/guides/00-index.md).

## Requirements

- [Node.js](https://nodejs.org/) 22.12+
- [pnpm](https://pnpm.io/) 10+ - the only supported package manager
- for physics (optional): the .NET 10 SDK and the `wasm-tools` workload (without it the game runs, but without physics; the Project Manager doesn't need it)

## Quick start: the Project Manager (Electron)

The editor's tools - the Project Manager and the UI Designer - run as a desktop program. The scripts in [`devops/`](devops) check the Node and pnpm versions, install the dependencies, build everything needed and launch the program.

Bash:

```bash
bash devops/build-all.sh --skip-physics   # install dependencies and build
bash devops/start-desktop.sh              # launch the Project Manager
```

PowerShell:

```powershell
pwsh devops/build-all.ps1 -SkipPhysics
pwsh devops/start-desktop.ps1
```

`--skip-physics` is fine for the manager itself, but projects you **Run** from it use the physics build: drop the flag (this needs the .NET SDK) if you want them to have physics.

After the first build it's enough to run `start-desktop`; `--build` (`-Build`) rebuilds before launching, `--designer` (`-Designer`) opens the UI Designer on its own. The Electron binary is downloaded on first launch.

- [`docs/en/devops-commands.md`](docs/en/devops-commands.md) - all the scripts and their options (including `--web` to build the web game and the physics build).
- [`docs/en/manual-build.md`](docs/en/manual-build.md) - building by hand, step by step: dependencies, the dev server, the web game, physics (wasm), the desktop app, checks.
- [`docs/en/guides/16-desktop.md`](docs/en/guides/16-desktop.md) - how the desktop app and the Project Manager work, including creating a project from a template, and **Run** / **Build** for a project (Web or Desktop, Dev or Prod, into the project's `Binaries/`).

## Building and running the web game

The web game (`src/CSEngine/Core`) and the physics are built by hand, or with `bash devops/build-all.sh --web`. See [`docs/en/manual-build.md`](docs/en/manual-build.md): installing dependencies, `pnpm dev` (a dev server with hot reload at `http://127.0.0.1:5173`), `pnpm build`, and building the physics runtime in wasm.

## Checks and tests

Run in `src/CSEngine/Core`:

```bash
pnpm verify       # typecheck + lint + tests (100% coverage) + build + E2E
```

The individual commands (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`) and the one-time browser install for E2E are in [`docs/en/manual-build.md`](docs/en/manual-build.md). Details about the tests are in [`docs/en/guides/01-getting-started.md`](docs/en/guides/01-getting-started.md).

## UI Toolkit

Separate from the game: a set of Vue components in the Windows 98 - 7 style (windows with a desktop and a taskbar, menus, lists, trees, tabs, text boxes, combo boxes, scroll bars, message boxes, tooltips...) in two style kits: Classic (12 Windows themes) and Tailwind (26 accent and 9 neutral Tailwind palettes, light and dark mode, a radius scale). Every element has a controller in pure TypeScript: all the state in public fields, events with subscription. The demo gallery is the `Modules/Engine/UI` module (`pnpm dev` in the module folder, then `http://127.0.0.1:5176/`); the description is in [`docs/en/guides/10-ui-toolkit.md`](docs/en/guides/10-ui-toolkit.md).

## UI Designer

The editor module `Modules/Editor/UIDesigner` (it's easiest to open from the Project Manager; on its own - `pnpm dev` in its folder, then `http://127.0.0.1:5175/`): an interface is assembled with the mouse from a palette, saved as a `.ui.json` asset and brought to life by a script class (`UiScript`) that finds widgets by the names from the editor - like a Widget Blueprint in Unreal. A Windows Forms model (focus, lifecycle, validation by a button with context, `DialogResult`, `ShowDialog`), skins with 9-slice sprites for every state, and connecting your own Vue widgets. Description - [`docs/en/guides/11-ui-designer.md`](docs/en/guides/11-ui-designer.md).

## Assets

- Files imported from code (`import url from "./rock.png"`, as well as `.glb`, `.gltf`, `.babylon`, `.env`, `.dds`) are hashed by Vite and put in `assets/`.
- `src/CSEngine/Core/public/` is copied into the build as is: `public/assets/level.bin` will be available at `/assets/level.bin`.

## CI

`.github/workflows/ci.yml` on every push/PR to `main`:

1. publishes the physics to wasm;
2. installs the dependencies (`pnpm install --frozen-lockfile`);
3. runs `typecheck`, `lint` and `test` with the coverage threshold;
4. builds the site;
5. runs the E2E tests, including on the real wasm physics;
6. builds every template, and checks the UI module, the UI Designer, the Project Browser and the desktop app.

Artifacts: the build, the coverage report, and on failure the Playwright report.

## Structure

```
src/
  CSEngine/                   the pnpm workspace (pnpm-workspace.yaml): the engine and its modules
    Core/                     @cse/core - the engine: game, physics, rendering, modules (web project, Vite)
      index.html              the game's HTML entry point
      Source/                 source code (the game: Source/App.ts)
      public/                 static files, copied into the build as is
      Assets/index.css        styles of the first-load screen
      BuildTools/             Vite plugins: serving/copying the physics, projects, the log sidecar
      Tests/                  Vitest
      E2E/                    Playwright (specs, server, a stand-in physics runtime)
      vite.config.ts, vitest.config.ts, playwright.config.ts, tsconfig*.json, eslint.config.js
      Core.esproj             a project for Visual Studio
    Modules/
      Engine/UI/              @cse/ui - the engine's UI module: toolkit, UI document runtime, gallery
      Editor/ProjectBrowser/  @cse/project-browser - the Project Manager (an editor module)
      Editor/UIDesigner/      @cse/ui-designer - the UI designer (tooling, not a part of the game)
      Physics/                C#: CSPhysics, the integration and the bridge to JS (Bridge)
      Scripting/              components in C#: the C# library and game SDK, @cse/scripting (the TypeScript side),
                              .contract files: the contract compiler and the bridge between C# and TypeScript
      Common/Math/            C#: FastMath
      Common/FastMath/        @cse/fastmath - FastMath for TypeScript
      Common/DataStream/      @cse/datastream - tagged messages between TypeScript and C# (+ C#: DotNet/), MessagePack
      Common/DI/              @cse/di - dependency injection: contracts, installers, @Inject (+ C#: DotNet/)
      Common/Task/            @cse/task - Promise-compatible tasks: synchronous continuations, frame waits, cancellation
    Programs/Desktop/         @cse/desktop - the desktop app (Electron) for the editor's tools
    Tools/                    auxiliary tools (RetroTexturizer)
    Binaries/                 build results (not kept in git)
  Templates/                  project templates (Blank, FirstPerson, ThirdPerson, TopDown, CoinHunt)
devops/                       build and launch scripts (see docs/en/devops-commands.md)
docs/                         architecture, guides, manual build (docs/en - English, docs/ru - Russian)
.github/workflows/            CI
```

## Opening in an IDE

`src/CSEngine/CSEngine.slnx` - in Visual Studio or JetBrains Rider; the repository can also be opened as a folder in VS Code (there are tasks for launching Vite and for debugging in the browser).
