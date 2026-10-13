**English** | [Русский](../ru/manual-build.md)

# Manual build

This describes, step by step, what the scripts in `devops/` do for you. You need it if you want to build individual parts,
are troubleshooting the build, or the scripts don't suit you. The quick path is in the [README](../../README.md) and in [devops-commands.md](devops-commands.md).

## Requirements

- [Node.js](https://nodejs.org/) 22.12+
- [pnpm](https://pnpm.io/) 10+ - the only supported package manager
- for physics: the .NET 10 SDK and the `wasm-tools` workload (`dotnet workload install wasm-tools`); without it the game runs, but without physics

## Installing dependencies

All packages are one pnpm workspace in `src/CSEngine`:

```bash
cd src/CSEngine          # the pnpm workspace: the engine and its modules
pnpm install
```

## The web game (Core)

The web project lives in `src/CSEngine/Core`; the commands below are run from there:

```bash
cd src/CSEngine/Core
pnpm dev
```

The Vite dev server with hot reload at `http://127.0.0.1:5173`. It takes the physics straight from the .NET publish folder (see below), so after rebuilding the physics it's enough to refresh the page.

```bash
pnpm build        # production build into src/CSEngine/Binaries/Core (minification, hashes, source maps)
pnpm build:dev    # with the __DEV__ branches enabled (debug logs), without source maps
pnpm preview      # serve the finished build at http://127.0.0.1:4173
pnpm rebuild      # clean + production build
```

## Physics (WebAssembly)

```bash
cd devops && bash build-physics.sh      # Windows: build-physics.bat
```

The script must be run from the `devops` folder (the paths inside are relative). The publish puts the runtime in `src/CSEngine/Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework`, and the log in `devops/publish.log`. `pnpm dev` serves the runtime from there, and `pnpm build` copies it to `Binaries/Core/physics-wasm/_framework`. You can point to a different folder with the `PHYSICS_WASM_DIR` environment variable. Details are in [`src/CSEngine/Physics/Bridge/BUILD.md`](../../src/CSEngine/Physics/Bridge/BUILD.md).

## The desktop app: Project Manager and UI Designer (Electron)

Three steps in order (from the repository root, after `pnpm install`):

```bash
cd src/CSEngine/Modules/Editor/ProjectBrowser && pnpm build
cd src/CSEngine/Modules/Editor/UIDesigner && pnpm build
cd src/CSEngine/Programs/Desktop && pnpm build && pnpm start
```

The build output is in `src/CSEngine/Binaries` (`Programs/Desktop/main.cjs`, `preload.cjs`, the editor modules' pages). The Electron binary is downloaded on first launch.

For development the pages can be taken from the Vite dev servers instead of the built ones:

```bash
cd src/CSEngine/Modules/Editor/ProjectBrowser && pnpm dev    # http://127.0.0.1:5177/
cd src/CSEngine/Modules/Editor/UIDesigner && pnpm dev        # http://127.0.0.1:5175/
```

and launch the program with the variables `CSE_PROJECT_BROWSER_URL=http://127.0.0.1:5177/` and `CSE_UI_DESIGNER_URL=http://127.0.0.1:5175/`. The designer on its own: `pnpm start -- --ui-designer` in `src/CSEngine/Programs/Desktop`. Details are in [guide 16](guides/16-desktop.md).

The same builds the Project Manager's **Build** and **Run** buttons make can be made by hand, from `src/CSEngine/Core` (the engine's Vite builds whichever project it's told to):

```bash
CSE_PROJECT=/path/to/MyGame.cseproject CSE_OUT_DIR=/path/to/MyGame/Binaries/Web/Prod pnpm exec vite build
CSE_PROJECT=/path/to/MyGame.cseproject pnpm exec vite --host 127.0.0.1    # the dev server that "Run - dev" starts
```

For a Dev build add `--mode development`; the Desktop shell (`electron-main.cjs`, `package.json`) is added only by the manager, see [guide 16](guides/16-desktop.md).

## Checks and tests

The commands are run in `src/CSEngine/Core` (the other modules have a similar set, see their `package.json`):

```bash
pnpm typecheck    # vue-tsc (sources + .vue) and tsc for configs, build scripts and tests
pnpm lint         # ESLint (typescript-eslint); pnpm lint:fix - with auto-fix
pnpm test         # Vitest with coverage; fails if any file is below 100% on any metric
pnpm test:e2e     # Playwright: builds the site and plays it in Chromium like a user
pnpm verify       # everything above + the build
```

`pnpm test:e2e` needs a browser: run `pnpm exec playwright install chromium` once. Details about the tests are in [guide 01](guides/01-getting-started.md).
