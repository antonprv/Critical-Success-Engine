// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Injected by Vite's `define` (see vite.config.ts; vitest.config.ts sets it to true).
// true in `vite` / `vite build --mode development`, false in `vite build`.
// Any code guarded by `if (__DEV__)` is dead-code-eliminated in production
// builds, so debug-only dependencies never end up in the shipped bundle.
declare const __DEV__: boolean;

// The project the engine is built for (BuildTools/ProjectPlugin.ts).
declare module "virtual:cse/project" {
	import type { ModuleDescriptor } from "./Engine/Modules/ModuleManager";
	import type { CseProject } from "./Engine/Projects/ProjectDescriptor";
	import type { PluginDescriptor } from "./Engine/Modules/Plugins";
	export const Project: CseProject;
	/** The project's modules; Load fetches each one's code on demand. */
	export const ProjectModules: ModuleDescriptor[];
	export const UiManifest: { FileVersion: number; Documents: { Id: string; Path: string; Script: string; }[]; };
	/** A UI document's text, by its manifest path. */
	export function LoadUiDocument(path: string): Promise<string>;
	/** The project's input manifests by Id, read at build time, and the one in use at start. */
	export const InputManifests: Record<string, import("./Engine/Input/InputActions").InputManifest>;
	export const DefaultInputManifest: string;
	/** The project's data assets by Id: data/<Id>.csedata, next to the game. */
	export const DataAssetUrls: Record<string, string>;
	/** The engine plugins installed: a .cseplugin in each folder of Modules/Engine. */
	export const InstalledPlugins: PluginDescriptor[];
}
