**English** | [Русский](../../ru/guides/00-index.md)

# How to make a game on Critical Success Engine - guide series

These are step-by-step guides to what the engine already has. Read them in order: each one builds on the previous.
All the code in the guides is real: it lives in `Core/Source/Examples/**` and in the project templates (`src/Templates/*/Source`), is compiled by `pnpm typecheck` and exercised by the
tests (`pnpm test`), so when the engine API changes the guides don't silently go stale.

| # | Guide | What's in it |
|---|-------|--------------|
| 01 | [Getting started](01-getting-started.md) | Running, controls, project map, building the physics (wasm), the development loop |
| 02 | [First scene](02-first-scene.md) | A scene as data: entities, components, the manifest. We build "Ball pit" |
| 03 | [Custom components](03-components.md) | Scripts: lifecycle hooks, fields, finding entities, spawning and destroying |
| 04 | [Physics](04-physics.md) | Bodies, layers and masks, triggers, collisions, impulses, platforms, queries, projectiles |
| 05 | [Player and camera](05-player-and-camera.md) | Character controller, profiles, movement modes, custom traits, the camera |
| 06 | [UI](06-ui.md) | HUD, toasts, menus, how it all works and how to add your own widget |
| 07 | [Coin Hunt: a whole game](07-coin-hunt.md) | Building a real mini-game: coins, timer, win/lose, restart |
| 08 | [Recipes](08-recipes.md) | Door, spawner, trap, trampoline, sprint, double jump |
| 09 | [When something doesn't work](09-troubleshooting.md) | Symptom → cause → what to do |
| 10 | [UI Toolkit](10-ui-toolkit.md) | Windows 98 - 7 style components: windows, menus, lists, trees, 12 themes, events and state |
| 11 | [UI Designer](11-ui-designer.md) | Build a UI with the mouse, bring it to life with a script; WinForms-style forms; skins; custom widgets |
| 12 | [Modules](12-modules.md) | Modules and plugins as in Unreal: on-demand loading, phases, dependencies, the game as the main module |
| 13 | [Projects](13-projects.md) | A project and its descriptor, the project registry, templates, the game's UI documents and UiManager |
| 14 | [Input](14-input.md) | A project's input files, action maps (on foot, vehicle...), primary and fallback key, gamepad |
| 15 | [Data files](15-data-assets.md) | `.csedata`: typed project parameters in JSON, editable without a rebuild |
| 16 | [Desktop app](16-desktop.md) | Electron, the Project Manager (templates by genre, themes), the designer on a project: documents, Save into the project |
| 17 | [Logging](17-logging.md) | The Logger: levels, what stays in a production build, the log sidecar, logs in tests |
| 18 | [Components in C#](18-csharp-scripting.md) | Writing a component in C#, next to TypeScript ones; building, the editor, how it runs |
| 19 | [DataStream](19-datastream.md) | Tagged messages between parts that don't know each other: TypeScript, C#, workers; R3-style operators, MessagePack |
| 20 | [Dependency injection](20-dependency-injection.md) | `@Inject` fields, contracts, installers (Zenjex-style bindings), the game's and a scene's containers |
| 21 | [Tasks](21-tasks.md) | Promise-compatible tasks: synchronous continuations, waiting in frames and game time, cancellation |
| 22 | [Contracts](22-contracts.md) | `.contract` files: C# and TypeScript calling each other through DI (`@FromCSharp`, `[FromTypeScript]`), DI in C# |
| 23 | [Performance](23-performance.md) | `pnpm perf`: the perf harness, its metrics and scenarios, `?scene=` and `?uncapped` |
| 24 | [The SDF world](24-sdf.md) | The edit list, the exact field, bricks, the mesh tier, the ray-marched layer in a Babylon scene |
| 25 | [Quasar in UI documents](25-quasar.md) | Every Quasar component as a widget, the three kits, Quasar's plugins as services, bindings, shortcuts, screens |
| 26 | [Solution Explorer](26-solution-explorer.md) | A project's files in two modes (real files, virtual folders) as in Visual Studio, `.uisolution`, the tree widget |
| 27 | [Programs](27-programs.md) | Applications without the engine (the Program template): Application, Form, an .exe |

## The model in one paragraph

A game is **scenes**. A scene is **data**: a list of entities, each entity with a list of components
(`Ent("Name", [Comp(Component, { field: value }), …])`). Behaviour is written in **components** - ordinary TypeScript (or C#, guide 18) classes
with hooks (`Awake`, `Start`, `Update`, `OnPhysicsUpdate`, `OnCollisionEnter`, …). Everything else (rendering, physics, menus)
is services that a component reaches through `this.Engine`.

## Where to look if you want to…

- …create a level → 02
- …bring an object to life with a script → 03
- …make something fall, bounce, or trigger on touch → 04
- …change how the player runs and jumps → 05
- …show a score, a health bar, a message → 06
- …see how it all fits together in a finished game → 07
- …build an interface from Windows-style windows, menus and lists → 10
- …draw an interface with the mouse, bring it to life with a script, make a skin or a custom widget → 11
- …split the game and tools into modules and load them on demand → 12
- …create a project from a template, show a UI document from a script → 13
- …make action-based controls, connect a gamepad → 14
- …move the game's parameters into files that can be edited without a rebuild → 15
- …create a project in the Project Manager, run the tools as a desktop app → 16
- …find out what the game logs and where it goes → 17
- …write a component in C# → 18
- …let parts of the game (TypeScript and C#) talk without knowing each other → 19
- …get the engine's subsystems and your own services by interface → 20
- …call C# from TypeScript and TypeScript from C#, or register services across languages → 22
- …measure how fast the game runs, find what slows it down → 23
- …show a project's files as Visual Studio's Solution Explorer does (real files and virtual folders) → 26
- …make an application without the engine (a tool, a utility) and build it into an .exe → 27
