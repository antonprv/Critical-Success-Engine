// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { searchForWorkspaceRoot, type Plugin } from "vite";
import { ParseInputManifest } from "../Source/Engine/Input/InputActions.ts";
import { ParsePlugin, ParseProject, type CseProject, type ProjectModule } from "../Source/Engine/Projects/ProjectDescriptor.ts";
import { FindProject, RegistryPath } from "./Projects.ts";

/**
 * Brings the project the engine is built for into the build, as `virtual:cse/project`: its descriptor, its modules (each
 * entry is a dynamic import, so its own chunk) and its UI documents (read on demand). CSE_PROJECT chooses the project:
 * a .cseproject, a project folder, or the name of a registered project.
 */

export const ProjectVirtualId = "virtual:cse/project";

export interface ResolvedProject {
	File: string;
	Directory: string;
	Project: CseProject;
}

export interface ProjectPluginOptions {
	/** What CSE_PROJECT would say; read from the environment when absent. */
	Request?: string;
	/** The project registry; the user's when absent. */
	Registry?: string;
	/** The project built when nothing is asked for. */
	Default: string;
	/** The engine's folder: bare imports in the project's files resolve from here. */
	EngineRoot?: string;
	/** Other folders whose files the project's modules use (templates): treated like the project's own. */
	ImportRoots?: string[];
	/** Folders of installed engine plugins: each subfolder with a .cseplugin is a plugin (Modules/Engine). */
	PluginsDirectories?: string[];
	/** The thread this build is for (the page, or a worker): other threads' modules are described but not bundled. */
	Thread?: string;
}

/** The single .cseproject of a folder. */
function DescriptorIn(directory: string): string {
	const files = readdirSync(directory).filter((f) => f.endsWith(".cseproject")).sort();
	if (files.length === 0) throw new Error(`${directory} has no .cseproject`);
	if (files.length > 1) throw new Error(`${directory} has more than one .cseproject: ${files.join(", ")}`);
	return join(directory, files[0]!);
}

/** Finds the project to build: a .cseproject, a folder holding one, a registered project's name, or the default. */
export function ResolveProject(request: string | undefined, options: { Registry: string; Default: string; }): ResolvedProject {
	const asked = request || options.Default;
	const path = resolve(asked);
	let file: string;
	if (existsSync(path) && statSync(path).isDirectory()) file = DescriptorIn(path);
	else if (existsSync(path)) file = path;
	else {
		const registered = FindProject(options.Registry, asked);
		if (!registered) throw new Error(`No project "${asked}": not a .cseproject, not a project folder, and not registered in ${options.Registry}`);
		file = registered.File;
	}
	return { File: file, Directory: dirname(file), Project: ParseProject(readFileSync(file, "utf8")) };
}

const Json = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * A module descriptor in source form: its fields, and Load importing its Entry from `from`. A module of another thread
 * than the build's is not imported (that would bundle its code here): its Load says where it runs.
 */
function ModuleSource(module: ProjectModule, from: string, thread?: string): string {
	const { Entry, ...descriptor } = module;
	const here = thread === undefined || module.Thread === "Any" || module.Thread === thread;
	const load = here ? `import(${JSON.stringify(join(from, Entry))})` : `Promise.reject(new Error(${JSON.stringify(`${module.Name} runs on the ${module.Thread} thread`)}))`;
	return `${Json(descriptor).slice(0, -2)},\n  Load: () => ${load}\n}`;
}

/** Every installed plugin in the folders, by folder name: its descriptor, its modules loading from its own folder. */
function PluginsSource(directories: string[], thread?: string): string {
	const plugins: string[] = [];
	for (const directory of directories.filter((d) => existsSync(d))) {
		for (const folder of readdirSync(directory).sort()) {
			const path = join(directory, folder);
			const file = statSync(path).isDirectory() ? readdirSync(path).find((f) => f.endsWith(".cseplugin")) : undefined;
			if (!file) continue;
			const parsed = ParsePlugin(readFileSync(join(path, file), "utf8"));
			const plugin = { Name: parsed.Name, FriendlyName: parsed.FriendlyName, Version: parsed.Version, Description: parsed.Description, Category: parsed.Category, EnabledByDefault: parsed.EnabledByDefault, Plugins: parsed.Plugins };
			plugins.push(`${Json(plugin).slice(0, -2)},\n  Modules: [${parsed.Modules.map((m) => ModuleSource(m, path, thread)).join(", ")}]\n}`);
		}
	}
	return `export const InstalledPlugins = [${plugins.join(", ")}];`;
}

/** Where a data asset sits next to the game (and where the dev server serves it). */
const DataUrl = (id: string): string => `data/${id}.csedata`;

/** The project's input manifests, read now: a broken one fails the build, naming it and its file. */
function InputManifestsOf(directory: string, project: CseProject): Record<string, unknown> {
	return Object.fromEntries(project.Input.Manifests.map(({ Id, Path }) => {
		const file = join(directory, Path);
		try {
			return [Id, ParseInputManifest(readFileSync(file, "utf8"))];
		} catch (error) {
			throw new Error(`Input manifest "${Id}" (${file}): ${(error as Error).message}`);
		}
	}));
}

/** The source of `virtual:cse/project` for a resolved project (and the engine plugins installed in pluginsDirectories). */
export function ProjectModuleSource({ Directory, Project }: ResolvedProject, pluginsDirectories: string[] = [], thread?: string): string {
	const modules = Project.Modules.map((m) => ModuleSource(m, Directory, thread));
	const manifestFile = join(Directory, Project.Ui.Manifest);
	const manifest = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, "utf8")) as { Documents?: { Id: string; Path: string; Script?: string; }[]; }) : {};
	const documents = (manifest.Documents ?? []).map((d) => ({ Id: d.Id, Path: d.Path, Script: d.Script ?? "" }));
	const loaders = documents.map((d) => `  ${JSON.stringify(d.Path)}: () => import(${JSON.stringify(`${join(dirname(manifestFile), d.Path)}?raw`)})`);
	return [
		`export const Project = ${Json(Project)};`,
		`export const ProjectModules = [${modules.join(", ")}];`,
		`export const UiManifest = ${Json({ FileVersion: 1, Documents: documents })};`,
		`export const InputManifests = ${Json(InputManifestsOf(Directory, Project))};`,
		`export const DefaultInputManifest = ${JSON.stringify(Project.Input.Default)};`,
		`export const DataAssetUrls = ${Json(Object.fromEntries(Project.Data.map(({ Id }) => [Id, DataUrl(Id)])))};`,
		PluginsSource(pluginsDirectories, thread),
		`const UiDocuments = {\n${loaders.join(",\n")}\n};`,
		"export function LoadUiDocument(path) {",
		"  const load = UiDocuments[path];",
		"  if (!load) return Promise.reject(new Error(`The project has no UI document file \"${path}\"`));",
		"  return load().then((module) => module.default);",
		"}",
		"",
	].join("\n");
}

export function ProjectPlugin(options: ProjectPluginOptions): Plugin {
	const project = ResolveProject(options.Request ?? process.env["CSE_PROJECT"], { Registry: options.Registry ?? RegistryPath(), Default: options.Default });
	const anchor = join(options.EngineRoot ?? process.cwd(), "index.html");
	const roots = [project.Directory, ...(options.ImportRoots ?? []), ...(options.PluginsDirectories ?? [])];
	const inProject = (file: string | undefined): boolean => file !== undefined && roots.some((root) => file.startsWith(root));
	return {
		name: "cse-project",
		// The project may live anywhere on disk: the dev server may read it (and the workspace, which listing turns off).
		config: () => ({ server: { fs: { allow: [...roots, searchForWorkspaceRoot(process.cwd())] } } }),
		resolveId(id, importer) {
			if (id === ProjectVirtualId) return `\0${ProjectVirtualId}`;
			// "@cse/core/...", "vue"... from the project's files: resolved as if imported by the engine, wherever the project is.
			if (inProject(importer) && !id.startsWith(".") && !id.startsWith("/")) return this.resolve(id, anchor, { skipSelf: true });
			return undefined;
		},
		load: (id) => (id === `\0${ProjectVirtualId}` ? ProjectModuleSource(project, options.PluginsDirectories, options.Thread) : undefined),
		// Data assets are copied next to the game as they are (not into the code): editable without a rebuild.
		generateBundle() {
			for (const { Id, Path } of project.Project.Data) {
				const file = join(project.Directory, Path);
				const source = readFileSync(file, "utf8");
				try {
					JSON.parse(source);
				} catch {
					throw new Error(`Data asset "${Id}" (${file}) is not JSON`);
				}
				this.emitFile({ type: "asset", fileName: DataUrl(Id), source });
			}
		},
		// In development, read from the project at every request: an edit shows on reload.
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const path = (request.url ?? "").split("?")[0]!;
				const asset = project.Project.Data.find(({ Id }) => path === `/${DataUrl(Id)}`);
				if (!asset) {
					next();
					return;
				}
				response.setHeader("Content-Type", "application/json");
				response.end(readFileSync(join(project.Directory, asset.Path), "utf8"));
			});
		},
	};
}
