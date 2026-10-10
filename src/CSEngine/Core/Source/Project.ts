// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { InstalledPlugins as Discovered, Project, ProjectModules } from "virtual:cse/project";
import { LoadingPhase, ModuleThread, ModuleType, type ModuleDescriptor } from "./Engine/Modules/ModuleManager";
import type { PluginDescriptor, ProjectDescriptor } from "./Engine/Modules/Plugins";

/** The engine's modules, registered in every thread before the project's. */
export const EngineModules: ModuleDescriptor[] = [
	{ Name: "Engine", Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.EarliestPossible, Thread: ModuleThread.Any, Load: () => import("./Engine/EngineModule") },
];

/** The project being built (CSE_PROJECT; see BuildTools/ProjectPlugin.ts): its primary module is the game. */
export const GameProject: ProjectDescriptor = { Name: Project.Name, Modules: ProjectModules, Plugins: Project.Plugins };

/** Installed plugins: every Modules/Engine/<Plugin>/<Plugin>.cseplugin (as Unreal finds .uplugin files); the project enables some. */
export const InstalledPlugins: PluginDescriptor[] = Discovered;
