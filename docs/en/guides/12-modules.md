**English** | [Русский](../../ru/guides/12-modules.md)

# 12. Modules: as in Unreal Engine

The engine, the game and the tools are assembled from modules. A module is a class with `StartupModule` / `ShutdownModule`, described by a
descriptor (a name, a type, a loading phase, dependencies). Its code is attached with a dynamic `import()`, so Vite puts
the module in a separate file, and the browser downloads it only when the module is loaded. The main module is the game.

The code: `Source/Engine/Modules/ModuleManager.ts` (modules), `Source/Engine/Modules/Plugins.ts` (plugins, the project),
`Source/Project.ts` (this repository's project).

## The Unreal correspondence

| Unreal | Here |
|---|---|
| `IModuleInterface` | the `ModuleInterface` class: `StartupModule`, `ShutdownModule`, `PostLoadCallback`, `PreUnloadCallback`, `SupportsDynamicReloading`, `IsGameModule` |
| `FDefaultGameModuleImpl` | `GameModule` |
| `IMPLEMENT_PRIMARY_GAME_MODULE` | `Primary: true` in the descriptor; `ModuleManager.Get().PrimaryGameModule` |
| `FModuleManager::Get()` | `ModuleManager.Get()` - a separate one in each thread (worker), like a separate one in each process |
| `LoadModule`, `LoadModuleChecked`, `LoadModuleWithFailureReason` | the same names; loading is asynchronous (`await`) |
| `GetModule`, `GetModuleChecked`, `IsModuleLoaded`, `QueryModule(s)`, `UnloadModule` | the same names |
| `OnModulesChanged` | the `modules-changed` event (`ModuleLoaded`, `ModuleUnloaded`) |
| `EModuleLoadResult` | `ModuleLoadResult`: `FileNotFound`, `FileIncompatible`, `CouldNotBeLoadedByOS`, `FailedToInitialize` |
| `ELoadingPhase` | `LoadingPhase`: `EarliestPossible` ... `PostEngineInit`, `None` - on demand only |
| `EHostType` | `ModuleType`: `Runtime`, `Editor`, `Developer` |
| `PublicDependencyModuleNames` | `Dependencies` |
| `.uplugin`, `IPluginManager` | `PluginDescriptor`, `PluginManager` |
| `.uproject` | `ProjectDescriptor` |

## Your own module

```ts
// Source/Game/InventoryModule.ts
export default class InventoryModule extends ModuleInterface {
	public readonly Items = new ItemDatabase();
	public override StartupModule(): void { /* registers what the module provides */ }
	public override ShutdownModule(): void { /* undoes StartupModule */ }
}

// Source/Project.ts - in the project's Modules (or in a plugin's Modules)
{ Name: "Inventory", Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.None, Dependencies: ["Engine"],
  Load: () => import("./Game/InventoryModule") }

// where it's needed
const inventory = await ModuleManager.Get().LoadModuleChecked<InventoryModule>("Inventory");
```

A module gets what other modules provide the same way as in Unreal: `ModuleManager.Get().GetModuleChecked<EngineModule>("Engine")`.
This is how the game's main module (`Source/Game/GamesSampleModule.ts`) registers its scenes in the engine module.

## Loading

- At startup `InitEngine(project, plugins)` registers the modules of the project and the enabled plugins and goes through the phases in
  order. A module with the `None` phase doesn't load by itself - only via `LoadModule`.
- Dependencies are loaded before the module, even if their phase is later. A dependency cycle is detected and named:
  `Circular dependency: A -> B -> A`.
- The build target: in the game (`BuildTarget.Game`) `Editor` modules aren't loaded, `Developer` ones only in a debug build;
  in the editor (`BuildTarget.Editor`) everything is loaded.
- You can't unload a module that a loaded one depends on, nor a module with `SupportsDynamicReloading() === false`
  (this is how the `Engine` module is built).
- Simultaneous `LoadModule` calls for one module wait for the same load.

## Threads

The engine runs in several threads (the page and the workers), and each has its own `ModuleManager` - like each process
in Unreal. The descriptor's `Thread` field says where the module runs: `GameLogic` (the default - the game, scenes, scripts),
`Main` (the page: DOM, Vue, what's drawn over the game) or `Any` (the `Engine` module). A thread's manager loads only
its own modules; at startup it skips the others', and an explicit `LoadModule` is answered with a reason
(`Host runs on the Main thread, not GameLogic`). The page brings up its own manager (`ModuleManager.Initialize`) before
the workers start.

## Channels between threads

The halves of a plugin in different threads talk through the `Engine` module's `Channels` (`Core/Source/Engine/Core/Channels.ts`):

```ts
const channels = ModuleManager.Get().GetModuleChecked<EngineModule>("Engine").Channels;
channels.Post("ui", { op: "show", id: "Hud" });           // to another thread
const off = channels.On("ui", (payload) => { /* ... */ }); // from another thread
```

The engine doesn't know what's inside the messages: it only carries them (the game worker <-> the UI worker <-> the page). What
is sent before a thread connects waits and goes out in order.

## Plugins and the project

A plugin is a named set of modules with a version. `EnabledByDefault` turns it on if the project hasn't turned it off; the project
lists the plugins it needs (`{ Name, Enabled }`); a plugin can require other plugins - they're enabled earlier.
What's missing, `InitEngine` returns as a list, and the game's thread writes it to the log instead of crashing.

## What's already a module

- `Engine` - the engine services (the scene registry); the `EarliestPossible` phase.
- `GamesSample` - the game's main module; the `Default` phase.

Next, the toolkit, the UI designer and the code editor are moving into modules (the `Editor` type, loaded on demand).
