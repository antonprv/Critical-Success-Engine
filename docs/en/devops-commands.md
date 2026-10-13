**English** | [Русский](../ru/devops-commands.md)

# devops scripts

The `devops/` folder holds scripts for building and launching. Each has a PowerShell version (`.ps1`, `pwsh`) and a Bash version (`.sh`).
Run them from the repository root.

## Quick start: the Project Manager (Electron)

```bash
# Bash
bash devops/build-all.sh --skip-physics
bash devops/start-desktop.sh
```

```powershell
# PowerShell
pwsh devops/build-all.ps1 -SkipPhysics
pwsh devops/start-desktop.ps1
```

The first command installs the dependencies and builds the Project Manager, the UI Designer and the Electron program; the second launches the program.
The Electron binary is downloaded on first launch.

`--skip-physics` is enough for the manager itself. But the **Run** and **Build** buttons for projects use the engine's physics build, so to run projects with physics
leave the flag out (this needs the .NET SDK) or run `build-physics` separately. What those buttons do is in [guide 16](guides/16-desktop.md).

## build-all - the full build

Builds step by step: dependencies, physics (wasm), Project Browser, UI Designer, Desktop (Electron), the tools. Before starting it checks for Node.js 22.12+ and pnpm.
If `dotnet` isn't found or the physics fails to build, it prints a warning and carries on without it (the game then runs without a simulation).
The physics publish log is `devops/publish.log`.

The tools step goes through every folder of `src/CSEngine/Tools` that has a `package.json`: the VSCodium extension (`CSEngineSupport`) is built and packed
into a `.vsix`, both in `src/CSEngine/Binaries/Tools/CSEngineSupport`. Packing fetches `@vscode/vsce`, so it needs the network; if that fails the build
prints a warning and the unpacked extension is still there.

| Bash | PowerShell | What it does |
|---|---|---|
| `--skip-install` | `-SkipInstall` | don't run `pnpm install` |
| `--skip-physics` | `-SkipPhysics` | don't publish the physics wasm (faster; the Project Manager doesn't need physics) |
| `--web` | `-Web` | additionally build the web game (Core) into `src/CSEngine/Binaries/Core` |

```bash
bash devops/build-all.sh                  # full build
bash devops/build-all.sh --skip-physics   # without physics, faster
bash devops/build-all.sh --skip-install --web
```

```powershell
pwsh devops/build-all.ps1                 # full build
pwsh devops/build-all.ps1 -SkipPhysics    # without physics, faster
pwsh devops/build-all.ps1 -SkipInstall -Web
```

## start-desktop - launching the Project Manager

Launches the desktop program (Electron). If something isn't built, it says what's missing and suggests the build command.

| Bash | PowerShell | What it does |
|---|---|---|
| `--build` | `-Build` | build first (`build-all` without physics) |
| `--designer` | `-Designer` | open the UI Designer on its own (it asks which project to work with) |

The `CSE_PROJECT_BROWSER_URL` and `CSE_UI_DESIGNER_URL` environment variables replace the built pages with the addresses of Vite dev servers
(and then the script doesn't check that those pages are built). More in [guide 16](guides/16-desktop.md).

## build-physics - physics only

```bash
cd devops && bash build-physics.sh      # Windows: build-physics.bat
```

Publishes `Physics/Bridge` to wasm (`dotnet publish`, Release) and writes the log to `publish.log`. It must be run from the `devops` folder:
the paths in the script are relative. CI does the same. Details are in the [manual build](manual-build.md).

## Utility scripts

| Script | What it does |
|---|---|
| `log-specs.sh` / `log-specs.ps1` | prints the machine's specs: processor, memory, graphics card, drives (handy to attach to a performance report) |
| `write-tree.sh` | writes the list of git-tracked files to `git-filetree.txt` in the repository root (run from `devops`) |
| `write-tree.ps1` | draws a directory tree into `file-tree.txt`, skipping `.git`, `.vs`, `node_modules`, `bin`, `obj`, `dist`; parameters `-RootPath` and `-OutputPath` |
