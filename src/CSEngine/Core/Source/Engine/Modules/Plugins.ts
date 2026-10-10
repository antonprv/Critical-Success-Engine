// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ModuleManager, type ModuleDescriptor, type ModuleFailure } from "./ModuleManager";

/** A plugin reference in a project or another plugin: { "Name": "...", "Enabled": true }. */
export interface PluginReference { Name: string; Enabled: boolean; }

/** What a .uplugin file says: a named, versioned bundle of modules that a project can switch on or off. */
export interface PluginDescriptor {
	Name: string;
	FriendlyName: string;
	Version: string;
	Description?: string;
	Category?: string;
	EnabledByDefault: boolean;
	Modules: ModuleDescriptor[];
	/** Plugins this one needs. */
	Plugins?: PluginReference[];
}

/** What a .uproject file says: the game's own modules and which plugins it uses. */
export interface ProjectDescriptor {
	Name: string;
	Modules: ModuleDescriptor[];
	Plugins?: PluginReference[];
}

/** IPluginManager: knows the installed plugins, enables the ones a project uses and registers their modules. */
export class PluginManager {
	private readonly _plugins = new Map<string, PluginDescriptor>();
	private readonly _enabled: PluginDescriptor[] = [];

	public constructor(private readonly _modules: ModuleManager) {}

	public AddPlugin(plugin: PluginDescriptor): this {
		if (this._plugins.has(plugin.Name)) throw new Error(`A plugin named "${plugin.Name}" is already added.`);
		this._plugins.set(plugin.Name, plugin);
		return this;
	}

	public FindPlugin(name: string): PluginDescriptor | undefined {
		return this._plugins.get(name);
	}

	public GetPlugins(): PluginDescriptor[] {
		return [...this._plugins.values()];
	}

	public GetEnabledPlugins(): PluginDescriptor[] {
		return [...this._enabled];
	}

	public IsEnabled(name: string): boolean {
		return this._enabled.some((plugin) => plugin.Name === name);
	}

	/**
	 * Enables the plugins the project asks for (and the ones on by default it doesn't switch off), each after the plugins
	 * it needs, and registers their modules. Returns what could not be enabled and why.
	 */
	public Mount(project: ProjectDescriptor): string[] {
		const errors: string[] = [];
		const wanted = new Map<string, boolean>();
		for (const plugin of this._plugins.values()) if (plugin.EnabledByDefault) wanted.set(plugin.Name, true);
		for (const reference of project.Plugins ?? []) wanted.set(reference.Name, reference.Enabled);

		for (const [name, enabled] of wanted) {
			if (!enabled) continue;
			if (!this._plugins.has(name)) errors.push(`The project enables "${name}", which is not installed`);
			else this.Enable(this._plugins.get(name)!, errors);
		}
		for (const plugin of this._enabled) for (const module of plugin.Modules) this._modules.Register(module);
		return errors;
	}

	/** Enables a plugin after what it needs; false (with the reason in errors) when something it needs is missing. */
	private Enable(plugin: PluginDescriptor, errors: string[]): boolean {
		if (this.IsEnabled(plugin.Name)) return true;
		for (const reference of plugin.Plugins ?? []) {
			if (!reference.Enabled) continue;
			const needed = this._plugins.get(reference.Name);
			if (!needed) {
				errors.push(`"${plugin.Name}" needs "${reference.Name}", which is not installed`);
				return false;
			}
			if (!this.Enable(needed, errors)) return false;
		}
		this._enabled.push(plugin);
		return true;
	}
}

export interface EngineInitResult {
	Modules: ModuleManager;
	/** Plugins the project asked for that could not be enabled. */
	Errors: string[];
	/** Modules that failed to load during startup. */
	Failures: ModuleFailure[];
}

/** Engine startup: the project's modules and its enabled plugins are registered, then every loading phase runs. */
export async function InitEngine(project: ProjectDescriptor, plugins: PluginDescriptor[], modules: ModuleManager = ModuleManager.Get()): Promise<EngineInitResult> {
	for (const module of project.Modules) modules.Register(module);
	const manager = new PluginManager(modules);
	for (const plugin of plugins) manager.AddPlugin(plugin);
	const errors = manager.Mount(project);
	const failures = await modules.StartupPhases();
	return { Modules: modules, Errors: errors, Failures: failures };
}
