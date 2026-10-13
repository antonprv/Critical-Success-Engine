**English** | [Русский](../../ru/guides/16-desktop.md)

# 16. The desktop app and the Project Manager

The editor's tools run as a separate program in operating system windows, not in browser tabs.
The shell is **Electron**, plugged into our Vite build: it brings its own Chromium, so the tools see the same
WebGL/WebGPU, wasm and workers that our E2E tests check, on all three OSes.

```
src/CSEngine/
  Programs/Desktop/              @cse/desktop - the program: the Electron main process, preload, IPC
  Modules/Editor/ProjectBrowser/ @cse/project-browser - the Project Manager (an editor module)
  Modules/Editor/UIDesigner/     @cse/ui-designer - the UI designer (an editor module)
```

## Running

The easiest way is the scripts from `devops/`: they check the Node and pnpm versions, install the dependencies, build the Project Manager,
the designer and the Electron main process, and then launch the program:

```bash
bash devops/build-all.sh --skip-physics    # PowerShell: pwsh devops/build-all.ps1 -SkipPhysics
bash devops/start-desktop.sh               # PowerShell: pwsh devops/start-desktop.ps1
```

`start-desktop` with the `--build` flag (`-Build` in PowerShell) runs the build itself before launching, and with `--designer`
(`-Designer`) it opens the designer on its own. If something isn't built, the script says what's missing. All the options are
in [devops-commands.md](../devops-commands.md); building by hand, step by step, is in [manual-build.md](../manual-build.md).

The program opens on the Project Manager. The Electron binary is downloaded on first launch (this is how the
Electron 44 package works: it has no install script), and after that it's taken from `node_modules/electron/dist`. For development the pages can be taken from the Vite dev servers:
`CSE_PROJECT_BROWSER_URL=http://127.0.0.1:5177/`, `CSE_UI_DESIGNER_URL=http://127.0.0.1:5175/`. The templates folder and
the project registry are set by `CSE_TEMPLATES_DIR` and `CSE_PROJECTS_REGISTRY` (by default - `src/Templates` and the
user's registry, see guide 13).

## The Project Manager

The manager's windows are toolkit UI documents (`Content/ProjectBrowser.ui.json`, `Content/NewProject.ui.json`). They have a single frame -
that of the OS window itself: the document's window is marked **Frameless** (no title bar and frame, guide 11) and stretched by anchors over the whole page;
**New project...** opens as the same kind of page over the list, not a window in a window. The layout
relies on anchors and adapts to the window size.

- **The list** of projects known to the engine and the tools (the registry); one that's gone missing from disk is marked `[missing]`.
- **New project...** - a genre, then the templates of that genre with a description (like in Unreal), a name (validated on the fly: the engine's
  rules and names already taken), a folder (by default `~/CSE Projects`, **Browse...** - a system dialog). **Create** copies the
  template with all the template code and registers the project.
- **Open in UI Designer** - the designer in its own OS window, the project is passed to it in the address (`?project=...`).
- **Run** and **Build**, each with a combo box for the mode - run a project and make a finished build of it (see below).
- **Remove from list** - the project is forgotten, its files stay.
- **Theme** - all the toolkit's themes: 12 classic ones and Tailwind light and dark.
- **The status line** at the bottom of the window says what's going on: "Starting the dev server...", "Built ... : <folder>", the error text if a run or a build failed.

The list rows look like `Name - Template (Genre) - path`. Open in UI Designer, Run and Build work on the picked project and are disabled for one that is missing from disk.

### Running and building a project

**Build** makes a finished build of the picked project in a folder next to its `.cseproject`, `Binaries/<Platform>/<Configuration>`, so the targets never overwrite each other:

| Target | Folder | What's there |
|---|---|---|
| Web - Dev, Web - Prod | `Binaries/Web/Dev`, `Binaries/Web/Prod` | the static site; the URLs are relative, so the folder can be hosted anywhere (a sub-path, a static host) |
| Desktop - Dev, Desktop - Prod | `Binaries/Desktop/Dev`, `Binaries/Desktop/Prod` | the same site plus an Electron shell (`electron-main.cjs` and a `package.json`): `electron .` in the folder opens the game in its own window |

Dev is a development build (`--mode development`: the `__DEV__` branches and debug logs are on), Prod is the production one. Under the hood the manager runs the engine's Vite (`pnpm exec vite build` in `src/CSEngine/Core`) with `CSE_PROJECT` set to the project and `CSE_OUT_DIR` to the target folder; the folder is emptied first. While a build runs, Run and Build are disabled; if it fails, the status line shows the end of the build's output.

**Run** starts the project in the mode chosen in its combo box:

| Mode | What happens |
|---|---|
| dev | the engine's Vite dev server starts for this project on a free port (once per project: a second Run reuses the running one) and the page opens in the system browser. If the server doesn't answer within 60 seconds, that's an error |
| Web - Dev, Web - Prod | the finished build is served by a local static server (`127.0.0.1`, a free port) and opened in the system browser |
| Desktop - Dev, Desktop - Prod | the finished build opens in its own Electron window (run by the manager's own Electron) |

`dev` is always available. The build modes are greyed out in the combo box until that build exists in the project's `Binaries`; after a Build the list is refreshed by itself. The dev servers and the local servers stop when the manager is closed.

What it needs: `pnpm` in the PATH and the dependencies installed (`pnpm install` in `src/CSEngine`) - the builds are made by the Core's Vite. The Core folder is found next to the program; `CSE_CORE_DIR` points to another one. The physics a game runs on is the engine's physics build (`devops/build-physics.sh`, or `build-all` without `--skip-physics`): without it a project still runs, but with no simulation (guide 01).

## How it works

The page talks to the main process only through `window.cse.projects`, which the preload provides
(`contextIsolation`, `sandbox`, no Node on the page). Each call is an IPC channel (`projects:list`, `projects:create`, `projects:run-modes`, `projects:run`, `projects:build`...);
the main process answers `{ ok, value }` or `{ ok: false, error }`, and the page receives an ordinary error with the text from
the main process. The work with projects is done by `ProjectsService` on top of `Core/BuildTools/Projects.ts`; running and building
is `ProjectRunner` (`Programs/Desktop/Source/Main/ProjectRunner.ts`), which spawns the Core's Vite and the Electron shells.

The preload is built in a separate pass into a single file: a preload in a `sandbox` can only import `electron`.

In an ordinary browser (without the program) the manager works on in-memory projects (`MemoryProjectsApi`) - for previews and
tests; there is nothing to really run or build there.

## Tests

The unit tests of the main process, IPC and preload run in Node with a stand-in `electron`; the E2E tests (`pnpm test:e2e`) launch
the real program through Playwright - on Linux without a screen under `xvfb-run`. Under root (containers) Chromium requires
`--no-sandbox`: the E2E tests pass it only then.

## The designer in the program

The designer works directly with a project:

- from the Project Manager (**Open in UI Designer**) - in its own OS window on the chosen project;
- on its own: `pnpm start -- --ui-designer` (or `bash devops/start-desktop.sh --designer`) - it first asks which project we're making the UI for (a list of known
  projects), then opens it.

On the left is the **Project** panel: the documents from the project's UI manifest (the open one is highlighted, a click opens another) and a field for
a new document (the Id is validated: an identifier that isn't taken). **Save** (the button, the File menu, Ctrl+S / Cmd+S) writes the
document into the project instead of downloading it:

- the layout - into its own `.ui.json` (a new document - `<Id>.ui.json` next to the manifest) and an entry in the manifest; it is
  validated (not a layout - not saved) and stored indented, readable;
- if the document has a node script - the generated class in the project's `Source/UI/<Class>.ts`.

The files are written by the main process (`DesignerService`, the channels `designer:open`, `designer:read`, `designer:id-problem`,
`designer:save`); every path is checked - neither reading nor writing goes outside the project's folder (nor to another drive in
Windows). In an ordinary browser the designer, as before, opens on examples and saves by downloading.

Both pages are built with relative paths (`base: "./"`): the program opens them from disk.

## The code editor

The designer's **Code** tab is a code editor on Monaco (the VS Code editor engine): highlighting, an understanding of
TypeScript and JavaScript (type errors are underlined, code autocompletion), each language has its own worker.

- In the program it works with the project's code - its `Source` folder (only that: neither the other project files nor anything outside
  it is accessible); in an ordinary browser - with an in-memory example (the code generated from the example's nodes, and the game's file).
- On the left is a file tree by folders, at the top are the tabs of open files; a changed tab is marked **●**, **Ctrl+S**
  (Cmd+S) saves it, a changed one can be closed only with a confirmation.
- On the Code tab the layout's properties panel is hidden - the space is given to the code.

How it's built: the editor's state (files, tabs, modified flags, saving) is `CodeSession` on top of `CodeHost`
(listing, reading, writing), without Monaco; `MonacoView` shows it in Monaco (a model per tab); `MonacoSetup`
configures the workers and TypeScript. In the program the files are written by the main process (the channels `designer:code-files`,
`designer:code-read`, `designer:code-write`).

### The engine's and the project's types

The editor knows the engine's types: when the designer is built, `Core/BuildTools/EngineTypes.ts` compiles the sources of `@cse/core`
and `@cse/ui` into declarations (`.d.ts`) and puts them where an import looks for them (`file:///node_modules/@cse/...`); the short
names from the export maps (`@cse/core/modules`, `@cse/ui/game`...) get redirect files. This way the engine's imports
are found, and its API is suggested (on a `Component` subclass - `Engine`, `Entity`, `OnCollisionEnter`...).

The language service sees all the project's code, not only the open files: when the Code tab is opened, all the project's TS/JS files
are loaded into it (a closed tab returns the file's saved text - discarded edits aren't visible), so the project's
relative imports are found too. A real template script (`Source/Scripts/CoinHunt.ts`) opens without
a single error - the program's E2E test checks this.

### Where the code sits

**View** → "Code as a tab" (the default), "Code on the right", "Code on the left", "Code below", "Code above": the code is a
separate tab or next to the design on any side, with a splitter between them (it can be dragged). The choice is marked in the
menu and remembered between launches. When the code is alongside, Ctrl+S saves whatever has the keyboard right now: in the code editor -
the file, on the canvas - the layout; the canvas scrolls in the narrowed area.

Next: floating OS windows - the code or the design in its own window.
