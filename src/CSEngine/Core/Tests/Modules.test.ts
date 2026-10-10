// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import {
	BuildTarget, GameModule, LoadingPhase, LoadingPhases, ModuleChangeReason, ModuleInterface, ModuleLoadResult, ModuleManager, ModuleType,
	type ModuleDescriptor,
} from "../Source/Engine/Modules/ModuleManager";
import { InitEngine, PluginManager, type PluginDescriptor, type ProjectDescriptor } from "../Source/Engine/Modules/Plugins";

/** A module class that records its lifecycle into a shared log. */
function Recording(name: string, log: string[], options: { Reloadable?: boolean; Fails?: boolean; Game?: boolean; } = {}): new () => ModuleInterface {
	const Base = options.Game ? GameModule : ModuleInterface;
	return class extends Base {
		public override StartupModule(): void {
			if (options.Fails) throw new Error(`${name} could not start`);
			log.push(`start ${name}`);
		}
		public override ShutdownModule(): void { log.push(`stop ${name}`); }
		public override PostLoadCallback(): void { log.push(`loaded ${name}`); }
		public override PreUnloadCallback(): void { log.push(`unloading ${name}`); }
		public override SupportsDynamicReloading(): boolean { return options.Reloadable ?? true; }
	};
}

function Module(name: string, log: string[], extra: Partial<ModuleDescriptor> = {}, options: Parameters<typeof Recording>[2] = {}): ModuleDescriptor {
	const loader = vi.fn(async () => ({ default: Recording(name, log, options) }));
	return { Name: name, Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.Default, Load: loader, ...extra };
}

describe("ModuleManager (FModuleManager)", () => {
	it("loads a module on demand: its code is fetched once, StartupModule then PostLoadCallback run, the change is reported", async () => {
		const log: string[] = [];
		const manager = new ModuleManager();
		const descriptor = Module("Inventory", log);
		manager.Register(descriptor);
		const changes: string[] = [];
		manager.Events.On("modules-changed", (name, reason) => changes.push(`${name} ${reason}`));
		expect(manager.IsModuleLoaded("Inventory")).toBe(false);
		expect(manager.GetModule("Inventory")).toBeNull();
		const [a, b] = await Promise.all([manager.LoadModule("Inventory"), manager.LoadModule("Inventory")]);
		expect(a).toBe(b);
		expect(await manager.LoadModule("Inventory")).toBe(a);
		expect(descriptor.Load).toHaveBeenCalledTimes(1);
		expect(log).toEqual(["start Inventory", "loaded Inventory"]);
		expect(changes).toEqual([`Inventory ${ModuleChangeReason.ModuleLoaded}`]);
		expect(manager.GetModuleChecked("Inventory")).toBe(a);
		expect(manager.QueryModule("Inventory")).toEqual({ Name: "Inventory", Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.Default, IsLoaded: true });
		expect(manager.QueryModules().map((m) => m.Name)).toEqual(["Inventory"]);
		expect(manager.QueryModule("Nope")).toBeNull();
	});

	it("loads dependencies first (PublicDependencyModuleNames) and refuses to unload a module others depend on", async () => {
		const log: string[] = [];
		const manager = new ModuleManager();
		manager.Register(Module("Core", log)).Register(Module("Physics", log, { Dependencies: ["Core"] })).Register(Module("Game", log, { Dependencies: ["Physics", "Core"] }));
		await manager.LoadModuleChecked("Game");
		expect(log.filter((l) => l.startsWith("start"))).toEqual(["start Core", "start Physics", "start Game"]);
		expect(manager.UnloadModule("Core")).toBe(false);
		expect(manager.UnloadModule("Game")).toBe(true);
		expect(manager.UnloadModule("Game")).toBe(false);
		expect(log.slice(-2)).toEqual(["unloading Game", "stop Game"]);
		expect(manager.IsModuleLoaded("Game")).toBe(false);
	});

	it("says why a module could not be loaded (ModuleLoadResult)", async () => {
		const log: string[] = [];
		const manager = new ModuleManager({ Target: BuildTarget.Game });
		manager
			.Register(Module("Broken", log, {}, { Fails: true }))
			.Register({ ...Module("Missing", log), Load: () => Promise.reject(new Error("chunk 404")) })
			.Register(Module("Tools", log, { Type: ModuleType.Editor }))
			.Register(Module("Profiler", log, { Type: ModuleType.Developer }))
			.Register(Module("A", log, { Dependencies: ["B"] }))
			.Register(Module("B", log, { Dependencies: ["A"] }))
			.Register(Module("NeedsBroken", log, { Dependencies: ["Broken"] }));
		const reason = async (name: string) => {
			const { Module: loaded, Result, Reason } = await manager.LoadModuleWithFailureReason(name);
			return [loaded, Result, Reason];
		};
		expect(await reason("Nowhere")).toEqual([null, ModuleLoadResult.FileNotFound, 'No module named "Nowhere" is registered']);
		expect(await reason("Missing")).toEqual([null, ModuleLoadResult.CouldNotBeLoadedByOS, "Its code could not be loaded: chunk 404"]);
		expect(await reason("Broken")).toEqual([null, ModuleLoadResult.FailedToInitialize, "StartupModule failed: Broken could not start"]);
		expect(await reason("Tools")).toEqual([null, ModuleLoadResult.FileIncompatible, "Editor modules are not loaded in the Game target"]);
		expect(await reason("Profiler")).toEqual([null, ModuleLoadResult.FileIncompatible, "Developer modules are not loaded in the Game target"]);
		expect(await reason("A")).toEqual([null, ModuleLoadResult.FailedToInitialize, "Circular dependency: A -> B -> A"]);
		expect(await reason("NeedsBroken")).toEqual([null, ModuleLoadResult.FailedToInitialize, 'Dependency "Broken": StartupModule failed: Broken could not start']);
		expect(await manager.LoadModule("Broken")).toBeNull();
		await expect(manager.LoadModuleChecked("Broken")).rejects.toThrow('Module "Broken" failed to load: StartupModule failed: Broken could not start');
		expect(() => manager.GetModuleChecked("Broken")).toThrow('Module "Broken" is not loaded');
		expect(manager.IsModuleLoaded("Broken")).toBe(false);

		const development = new ModuleManager({ Target: BuildTarget.Game, Development: true });
		development.Register(Module("Profiler", log, { Type: ModuleType.Developer }));
		expect(await development.LoadModule("Profiler")).not.toBeNull();
		const editor = new ModuleManager({ Target: BuildTarget.Editor });
		editor.Register(Module("Tools", log, { Type: ModuleType.Editor })).Register(Module("Profiler", log, { Type: ModuleType.Developer }));
		expect(await editor.LoadModule("Tools")).not.toBeNull();
		expect(await editor.LoadModule("Profiler")).not.toBeNull();
	});

	it("loading phases: StartupPhases loads every phase in order, skipping None (on demand only) and modules the target excludes", async () => {
		expect(LoadingPhases).toEqual([
			LoadingPhase.EarliestPossible, LoadingPhase.PostConfigInit, LoadingPhase.PreEarlyLoadingScreen, LoadingPhase.PreLoadingScreen,
			LoadingPhase.PreDefault, LoadingPhase.Default, LoadingPhase.PostDefault, LoadingPhase.PostEngineInit,
		]);
		const log: string[] = [];
		const manager = new ModuleManager();
		manager
			.Register(Module("Late", log, { LoadingPhase: LoadingPhase.PostEngineInit }))
			.Register(Module("OnDemand", log, { LoadingPhase: LoadingPhase.None }))
			.Register(Module("Game", log))
			.Register(Module("Early", log, { LoadingPhase: LoadingPhase.EarliestPossible }))
			.Register(Module("EditorOnly", log, { Type: ModuleType.Editor }))
			.Register(Module("Broken", log, { LoadingPhase: LoadingPhase.PreDefault }, { Fails: true }));
		const failures = await manager.StartupPhases();
		expect(log.filter((l) => l.startsWith("start"))).toEqual(["start Early", "start Game", "start Late"]);
		expect(failures).toEqual([{ Name: "Broken", Result: ModuleLoadResult.FailedToInitialize, Reason: "StartupModule failed: Broken could not start" }]);
		expect(manager.IsModuleLoaded("OnDemand")).toBe(false);
		expect(await manager.LoadModulesForPhase(LoadingPhase.None)).toEqual([]);
	});

	it("the primary game module (IMPLEMENT_PRIMARY_GAME_MODULE) is the one marked Primary; there is only one", async () => {
		const log: string[] = [];
		const manager = new ModuleManager();
		expect(manager.PrimaryGameModule).toBeNull();
		manager.Register(Module("Shooter", log, { Primary: true }, { Game: true }));
		expect(() => manager.Register(Module("Racer", log, { Primary: true }))).toThrow('"Shooter" is already the primary game module');
		expect(() => manager.Register(Module("Shooter", log))).toThrow('A module named "Shooter" is already registered');
		expect(manager.PrimaryGameModule).toBeNull(); // not loaded yet
		const shooter = await manager.LoadModuleChecked<GameModule>("Shooter");
		expect(manager.PrimaryGameModule).toBe(shooter);
		expect([shooter.IsGameModule(), new ModuleInterface().IsGameModule(), new ModuleInterface().SupportsDynamicReloading()]).toEqual([true, false, true]);
	});

	it("modules that can't reload stay; ShutdownAll stops everything in reverse load order; base hooks do nothing", async () => {
		const log: string[] = [];
		const manager = new ModuleManager();
		manager.Register(Module("Core", log, {}, { Reloadable: false })).Register(Module("Game", log, { Dependencies: ["Core"] }));
		await manager.LoadModuleChecked("Game");
		manager.UnloadModule("Game");
		expect(manager.UnloadModule("Core")).toBe(false); // SupportsDynamicReloading() is false
		await manager.LoadModuleChecked("Game");
		log.length = 0;
		manager.ShutdownAll();
		expect(log).toEqual(["unloading Game", "stop Game", "unloading Core", "stop Core"]);
		expect(manager.QueryModules().every((m) => !m.IsLoaded)).toBe(true);
		const plain = new ModuleInterface();
		expect(() => { plain.StartupModule(); plain.ShutdownModule(); plain.PostLoadCallback(); plain.PreUnloadCallback(); }).not.toThrow();
	});

	it("ModuleManager.Get() is one manager per thread (realm)", () => {
		expect(ModuleManager.Get()).toBe(ModuleManager.Get());
		expect(ModuleManager.Get().Target).toBe(BuildTarget.Game);
	});
});

describe("plugins and the project (.uplugin, .uproject)", () => {
	const log: string[] = [];
	const Plugin = (name: string, extra: Partial<PluginDescriptor> = {}): PluginDescriptor => ({
		Name: name, FriendlyName: name, Version: "1.0", EnabledByDefault: false, Modules: [Module(`${name}Module`, log)], ...extra,
	});

	it("the project enables plugins (and what they need); their modules become loadable", () => {
		const manager = new ModuleManager();
		const plugins = new PluginManager(manager);
		plugins.AddPlugin(Plugin("UiToolkit")).AddPlugin(Plugin("UiDesigner", { Plugins: [{ Name: "UiToolkit", Enabled: true }] })).AddPlugin(Plugin("Analytics", { EnabledByDefault: true })).AddPlugin(Plugin("Unused"));
		expect(() => plugins.AddPlugin(Plugin("Unused"))).toThrow('A plugin named "Unused" is already added');
		const project: ProjectDescriptor = { Name: "Game", Modules: [], Plugins: [{ Name: "UiDesigner", Enabled: true }, { Name: "Analytics", Enabled: false }, { Name: "Ghost", Enabled: true }] };
		const errors = plugins.Mount(project);
		expect(errors).toEqual(['The project enables "Ghost", which is not installed']);
		expect(plugins.GetEnabledPlugins().map((p) => p.Name)).toEqual(["UiToolkit", "UiDesigner"]);
		expect(manager.QueryModules().map((m) => m.Name)).toEqual(["UiToolkitModule", "UiDesignerModule"]);
		expect(plugins.FindPlugin("Unused")?.Name).toBe("Unused");
		expect(plugins.FindPlugin("Nope")).toBeUndefined();
		expect(plugins.IsEnabled("Unused")).toBe(false);
		expect(plugins.GetPlugins()).toHaveLength(4);
	});

	it("a plugin needing one that isn't installed is reported and not enabled; enabled-by-default plugins come on without being listed", () => {
		const manager = new ModuleManager();
		const plugins = new PluginManager(manager);
		plugins.AddPlugin(Plugin("Broken", { Plugins: [{ Name: "Nowhere", Enabled: true }, { Name: "Optional", Enabled: false }] })).AddPlugin(Plugin("Default", { EnabledByDefault: true }));
		expect(plugins.Mount({ Name: "Game", Modules: [], Plugins: [{ Name: "Broken", Enabled: true }] })).toEqual(['"Broken" needs "Nowhere", which is not installed']);
		expect(plugins.GetEnabledPlugins().map((p) => p.Name)).toEqual(["Default"]);
		expect(new PluginManager(new ModuleManager()).Mount({ Name: "Empty", Modules: [] })).toEqual([]);
	});

	it("InitEngine registers the project's modules and enabled plugins, then runs the loading phases", async () => {
		const order: string[] = [];
		const manager = new ModuleManager();
		const project: ProjectDescriptor = {
			Name: "Game",
			Modules: [Module("Game", order, { Primary: true, Dependencies: ["UiToolkitModule"] }, { Game: true })],
			Plugins: [{ Name: "UiToolkit", Enabled: true }],
		};
		const result = await InitEngine(project, [Plugin("UiToolkit", { Modules: [Module("UiToolkitModule", order, { LoadingPhase: LoadingPhase.PostDefault })] })], manager);
		expect(order.filter((l) => l.startsWith("start"))).toEqual(["start UiToolkitModule", "start Game"]); // a dependency loads early, on demand
		expect(result).toEqual({ Modules: manager, Errors: [], Failures: [] });
		expect(manager.PrimaryGameModule?.IsGameModule()).toBe(true);
	});
});

describe("plugin dependency chains and the engine module", () => {
	const log: string[] = [];
	const Plugin = (name: string, needs: PluginDescriptor["Plugins"] = []): PluginDescriptor => ({
		Name: name, FriendlyName: name, Version: "1.0", EnabledByDefault: false, Modules: [Module(`${name}Module`, log)], Plugins: needs,
	});

	it("a shared dependency is enabled once; references switched off are skipped; a missing plugin deep in a chain disables the whole chain", () => {
		const manager = new ModuleManager();
		const plugins = new PluginManager(manager);
		plugins
			.AddPlugin(Plugin("Core"))
			.AddPlugin(Plugin("Ui", [{ Name: "Core", Enabled: true }, { Name: "Telemetry", Enabled: false }]))
			.AddPlugin(Plugin("Editor", [{ Name: "Core", Enabled: true }, { Name: "Ui", Enabled: true }]))
			.AddPlugin(Plugin("Middle", [{ Name: "Gone", Enabled: true }]))
			.AddPlugin(Plugin("Top", [{ Name: "Middle", Enabled: true }]));
		const errors = plugins.Mount({ Name: "Game", Modules: [], Plugins: ["Editor", "Top"].map((Name) => ({ Name, Enabled: true })) });
		expect(plugins.GetEnabledPlugins().map((p) => p.Name)).toEqual(["Core", "Ui", "Editor"]);
		expect(errors).toEqual(['"Middle" needs "Gone", which is not installed']);
	});

	it("the engine module provides the scene registry and never unloads", async () => {
		const { default: EngineModule } = await import("../Source/Engine/EngineModule");
		const manager = new ModuleManager();
		manager.Register({ Name: "Engine", Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.EarliestPossible, Load: async () => ({ default: EngineModule }) });
		const engine = await manager.LoadModuleChecked<InstanceType<typeof EngineModule>>("Engine");
		expect(engine.Scenes).toBeDefined();
		expect(manager.UnloadModule("Engine")).toBe(false);
	});
});

describe("threads (each worker is its own realm, like Unreal's processes)", () => {
	it("a manager loads only modules for its thread; Any loads everywhere; the reason is given", async () => {
		const { ModuleThread } = await import("../Source/Engine/Modules/ModuleManager");
		const log: string[] = [];
		const main = new ModuleManager({ Thread: ModuleThread.Main });
		main
			.Register(Module("Engine", log, { Thread: ModuleThread.Any }))
			.Register(Module("Game", log, { Thread: ModuleThread.GameLogic }))
			.Register(Module("Host", log, { Thread: ModuleThread.Main }))
			.Register(Module("Unspecified", log));
		expect(await main.StartupPhases()).toEqual([]); // other threads' modules are skipped, not failures
		expect(main.QueryModules().filter((m) => m.IsLoaded).map((m) => m.Name)).toEqual(["Engine", "Host"]);
		expect((await main.LoadModuleWithFailureReason("Game")).Reason).toBe("Game runs on the GameLogic thread, not Main");
		expect((await main.LoadModuleWithFailureReason("Unspecified")).Reason).toBe("Unspecified runs on the GameLogic thread, not Main");
		expect(new ModuleManager().Thread).toBe(ModuleThread.GameLogic);
		expect(ModuleManager.Get().Thread).toBe(ModuleThread.GameLogic);
	});

	it("Initialize sets this thread's manager up once (the main thread does it before anything loads)", async () => {
		const { ModuleThread } = await import("../Source/Engine/Modules/ModuleManager");
		vi.resetModules();
		const { ModuleManager: Fresh } = await import("../Source/Engine/Modules/ModuleManager");
		const manager = Fresh.Initialize({ Thread: ModuleThread.Main });
		expect(Fresh.Get()).toBe(manager);
		expect(manager.Thread).toBe(ModuleThread.Main);
		expect(() => Fresh.Initialize({})).toThrow("This thread's ModuleManager already exists");
	});
});
