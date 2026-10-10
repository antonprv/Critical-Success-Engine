// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EventHub } from "../Core/EventHub.ts";

/**
 * Modules in the manner of Unreal Engine. A module is a class with StartupModule / ShutdownModule (IModuleInterface),
 * described by a descriptor (name, type, loading phase, dependencies) and loaded on demand: its code is a dynamic
 * import, so Vite puts it in its own chunk, fetched only when the module loads. Each thread (worker) has its own
 * ModuleManager, as each Unreal process has its own FModuleManager.
 */

/** Which builds load a module (EHostType). */
export const enum ModuleType {
	/** Everywhere. */
	Runtime = "Runtime",
	/** Only in the editor. */
	Editor = "Editor",
	/** In the editor and in development builds of the game. */
	Developer = "Developer",
}

/** When a module loads during startup (ELoadingPhase), in order; None means only on demand. */
export const enum LoadingPhase {
	EarliestPossible = "EarliestPossible",
	PostConfigInit = "PostConfigInit",
	PreEarlyLoadingScreen = "PreEarlyLoadingScreen",
	PreLoadingScreen = "PreLoadingScreen",
	PreDefault = "PreDefault",
	Default = "Default",
	PostDefault = "PostDefault",
	PostEngineInit = "PostEngineInit",
	None = "None",
}

export const LoadingPhases: readonly LoadingPhase[] = [
	LoadingPhase.EarliestPossible, LoadingPhase.PostConfigInit, LoadingPhase.PreEarlyLoadingScreen, LoadingPhase.PreLoadingScreen,
	LoadingPhase.PreDefault, LoadingPhase.Default, LoadingPhase.PostDefault, LoadingPhase.PostEngineInit,
];

/** Which thread (realm) a module runs in: each has its own ModuleManager, as each Unreal process has its own. */
export const enum ModuleThread {
	/** The page: the DOM, Vue, what is drawn over the game. */
	Main = "Main",
	/** The game logic worker: scenes, scripts. The default. */
	GameLogic = "GameLogic",
	/** Every thread (the engine module). */
	Any = "Any",
}

/** What is being built and run: the game, or the editor (which also loads Editor and Developer modules). */
export const enum BuildTarget {
	Game = "Game",
	Editor = "Editor",
}

/** Why a load failed (EModuleLoadResult). */
export const enum ModuleLoadResult {
	Success = "Success",
	/** No module of that name is registered. */
	FileNotFound = "FileNotFound",
	/** The module is not for this target (an Editor module in the game). */
	FileIncompatible = "FileIncompatible",
	/** Its code could not be fetched (the chunk failed to load). */
	CouldNotBeLoadedByOS = "CouldNotBeLoadedByOS",
	/** StartupModule threw, a dependency failed, or the dependencies form a cycle. */
	FailedToInitialize = "FailedToInitialize",
}

export const enum ModuleChangeReason {
	ModuleLoaded = "ModuleLoaded",
	ModuleUnloaded = "ModuleUnloaded",
}

/** IModuleInterface: override what the module needs. */
export class ModuleInterface {
	/** The module was loaded: register what it provides. */
	public StartupModule(): void { /* hook */ }
	/** The module is about to go away: undo StartupModule. */
	public ShutdownModule(): void { /* hook */ }
	public PostLoadCallback(): void { /* hook */ }
	public PreUnloadCallback(): void { /* hook */ }
	/** Whether it may be unloaded while the program runs. */
	public SupportsDynamicReloading(): boolean { return true; }
	public IsGameModule(): boolean { return false; }
}

/** FDefaultGameModuleImpl: the base of game modules. */
export class GameModule extends ModuleInterface {
	public override IsGameModule(): boolean { return true; }
}

export interface ModuleDescriptor {
	Name: string;
	Type: ModuleType;
	LoadingPhase: LoadingPhase;
	/** Modules that must be loaded first (PublicDependencyModuleNames). */
	Dependencies?: string[];
	/** The project's primary game module (IMPLEMENT_PRIMARY_GAME_MODULE). */
	Primary?: boolean;
	/** The thread it runs in (GameLogic when absent). */
	Thread?: ModuleThread;
	/** Fetches the module's code: `() => import("./MyModule")`, whose default export is the module class. */
	Load: () => Promise<{ default: new () => ModuleInterface; }>;
}

export interface ModuleStatus { Name: string; Type: ModuleType; LoadingPhase: LoadingPhase; IsLoaded: boolean; }
export interface ModuleLoadOutcome { Module: ModuleInterface | null; Result: ModuleLoadResult; Reason: string; }
export interface ModuleFailure { Name: string; Result: ModuleLoadResult; Reason: string; }

export interface ModuleManagerOptions {
	Target?: BuildTarget;
	/** The thread this manager belongs to (GameLogic when absent). */
	Thread?: ModuleThread;
	/** A development (not shipping) build: Developer modules load in the game too. */
	Development?: boolean;
}

export type ModuleManagerEvents = { "modules-changed": [name: string, reason: ModuleChangeReason]; };

const CircularPrefix = "Circular dependency: ";

export class ModuleManager {
	private static _instance: ModuleManager | null = null;

	/** The manager of this thread (FModuleManager::Get()). */
	public static Get(): ModuleManager {
		return ModuleManager._instance ??= new ModuleManager();
	}

	/** Creates this thread's manager with its options (before anything calls Get). */
	public static Initialize(options: ModuleManagerOptions): ModuleManager {
		if (ModuleManager._instance) throw new Error("This thread's ModuleManager already exists.");
		return ModuleManager._instance = new ModuleManager(options);
	}

	public readonly Events = new EventHub<ModuleManagerEvents>();
	public readonly Target: BuildTarget;
	public readonly Thread: ModuleThread;
	private readonly _development: boolean;
	private readonly _descriptors = new Map<string, ModuleDescriptor>();
	private readonly _loaded = new Map<string, ModuleInterface>();
	private readonly _loading = new Map<string, Promise<ModuleLoadOutcome>>();
	private readonly _loadOrder: string[] = [];
	private _primary: string | null = null;

	public constructor(options: ModuleManagerOptions = {}) {
		this.Target = options.Target ?? BuildTarget.Game;
		this.Thread = options.Thread ?? ModuleThread.GameLogic;
		this._development = options.Development ?? false;
	}

	/** Makes a module known (what IMPLEMENT_MODULE and the descriptors do in Unreal). */
	public Register(descriptor: ModuleDescriptor): this {
		if (this._descriptors.has(descriptor.Name)) throw new Error(`A module named "${descriptor.Name}" is already registered.`);
		if (descriptor.Primary) {
			if (this._primary) throw new Error(`"${this._primary}" is already the primary game module.`);
			this._primary = descriptor.Name;
		}
		this._descriptors.set(descriptor.Name, descriptor);
		return this;
	}

	public get PrimaryGameModule(): ModuleInterface | null {
		return this._primary === null ? null : this._loaded.get(this._primary) ?? null;
	}

	public IsModuleLoaded(name: string): boolean {
		return this._loaded.has(name);
	}

	public QueryModule(name: string): ModuleStatus | null {
		const descriptor = this._descriptors.get(name);
		return descriptor ? { Name: name, Type: descriptor.Type, LoadingPhase: descriptor.LoadingPhase, IsLoaded: this._loaded.has(name) } : null;
	}

	public QueryModules(): ModuleStatus[] {
		return [...this._descriptors.keys()].map((name) => this.QueryModule(name)!);
	}

	/** The loaded module, or null (never loads: use LoadModule for that). */
	public GetModule<T extends ModuleInterface = ModuleInterface>(name: string): T | null {
		return (this._loaded.get(name) as T | undefined) ?? null;
	}

	public GetModuleChecked<T extends ModuleInterface = ModuleInterface>(name: string): T {
		const module = this.GetModule<T>(name);
		if (!module) throw new Error(`Module "${name}" is not loaded.`);
		return module;
	}

	public async LoadModule<T extends ModuleInterface = ModuleInterface>(name: string): Promise<T | null> {
		return (await this.LoadModuleWithFailureReason(name)).Module as T | null;
	}

	public async LoadModuleChecked<T extends ModuleInterface = ModuleInterface>(name: string): Promise<T> {
		const outcome = await this.LoadModuleWithFailureReason(name);
		if (!outcome.Module) throw new Error(`Module "${name}" failed to load: ${outcome.Reason}`);
		return outcome.Module as T;
	}

	public LoadModuleWithFailureReason(name: string): Promise<ModuleLoadOutcome> {
		return this.Load(name, []);
	}

	/** Loads every module of a phase this target allows; returns the ones that failed. */
	public async LoadModulesForPhase(phase: LoadingPhase): Promise<ModuleFailure[]> {
		if (phase === LoadingPhase.None) return [];
		const failures: ModuleFailure[] = [];
		for (const descriptor of this._descriptors.values()) {
			if (descriptor.LoadingPhase !== phase || this.Incompatibility(descriptor)) continue;
			const outcome = await this.LoadModuleWithFailureReason(descriptor.Name);
			if (!outcome.Module) failures.push({ Name: descriptor.Name, Result: outcome.Result, Reason: outcome.Reason });
		}
		return failures;
	}

	/** Startup: every phase in order (what the engine loop does while it initialises). */
	public async StartupPhases(): Promise<ModuleFailure[]> {
		const failures: ModuleFailure[] = [];
		for (const phase of LoadingPhases) failures.push(...await this.LoadModulesForPhase(phase));
		return failures;
	}

	/** Unloads a module, unless it can't reload or a loaded module depends on it. */
	public UnloadModule(name: string): boolean {
		const module = this._loaded.get(name);
		if (!module || !module.SupportsDynamicReloading() || this.HasLoadedDependents(name)) return false;
		this.Shutdown(name, module);
		return true;
	}

	/** Program exit: every loaded module, in reverse load order. */
	public ShutdownAll(): void {
		for (const name of [...this._loadOrder].reverse()) this.Shutdown(name, this._loaded.get(name)!);
	}

	//#region internals

	private Incompatibility(descriptor: ModuleDescriptor): string | null {
		const thread = descriptor.Thread ?? ModuleThread.GameLogic;
		if (thread !== ModuleThread.Any && thread !== this.Thread) return `${descriptor.Name} runs on the ${thread} thread, not ${this.Thread}`;
		const allowed = descriptor.Type === ModuleType.Runtime
			|| this.Target === BuildTarget.Editor
			|| (descriptor.Type === ModuleType.Developer && this._development);
		return allowed ? null : `${descriptor.Type} modules are not loaded in the ${this.Target} target`;
	}

	private HasLoadedDependents(name: string): boolean {
		return [...this._loaded.keys()].some((loaded) => this._descriptors.get(loaded)!.Dependencies?.includes(name));
	}

	private Shutdown(name: string, module: ModuleInterface): void {
		module.PreUnloadCallback();
		module.ShutdownModule();
		this._loaded.delete(name);
		this._loadOrder.splice(this._loadOrder.indexOf(name), 1);
		this.Events.Emit("modules-changed", name, ModuleChangeReason.ModuleUnloaded);
	}

	private Load(name: string, stack: string[]): Promise<ModuleLoadOutcome> {
		const loaded = this._loaded.get(name);
		if (loaded) return Promise.resolve({ Module: loaded, Result: ModuleLoadResult.Success, Reason: "" });
		// A cycle is found on the stack before waiting on a load in progress (which would wait for itself).
		if (stack.includes(name)) return Promise.resolve(Failed(ModuleLoadResult.FailedToInitialize, `${CircularPrefix}${[...stack, name].join(" -> ")}`));
		const pending = this._loading.get(name);
		if (pending) return pending;
		const loading = this.LoadFresh(name, [...stack, name]).finally(() => this._loading.delete(name));
		this._loading.set(name, loading);
		return loading;
	}

	private async LoadFresh(name: string, stack: string[]): Promise<ModuleLoadOutcome> {
		const descriptor = this._descriptors.get(name);
		if (!descriptor) return Failed(ModuleLoadResult.FileNotFound, `No module named "${name}" is registered`);
		const incompatible = this.Incompatibility(descriptor);
		if (incompatible) return Failed(ModuleLoadResult.FileIncompatible, incompatible);

		for (const dependency of descriptor.Dependencies ?? []) {
			const outcome = await this.Load(dependency, stack);
			if (outcome.Module) continue;
			return outcome.Reason.startsWith(CircularPrefix) ? outcome : Failed(ModuleLoadResult.FailedToInitialize, `Dependency "${dependency}": ${outcome.Reason}`);
		}

		let ModuleClass: new () => ModuleInterface;
		try {
			ModuleClass = (await descriptor.Load()).default;
		} catch (error) {
			return Failed(ModuleLoadResult.CouldNotBeLoadedByOS, `Its code could not be loaded: ${(error as Error).message}`);
		}
		const module = new ModuleClass();
		try {
			module.StartupModule();
		} catch (error) {
			return Failed(ModuleLoadResult.FailedToInitialize, `StartupModule failed: ${(error as Error).message}`);
		}
		this._loaded.set(name, module);
		this._loadOrder.push(name);
		module.PostLoadCallback();
		this.Events.Emit("modules-changed", name, ModuleChangeReason.ModuleLoaded);
		return { Module: module, Result: ModuleLoadResult.Success, Reason: "" };
	}

	//#endregion
}

const Failed = (Result: ModuleLoadResult, Reason: string): ModuleLoadOutcome => ({ Module: null, Result, Reason });
