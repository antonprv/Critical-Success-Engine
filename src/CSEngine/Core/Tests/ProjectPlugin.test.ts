// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { searchForWorkspaceRoot, type Plugin, type UserConfig } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectModuleSource, ProjectPlugin, ProjectVirtualId, ResolveProject } from "../BuildTools/ProjectPlugin";
import { RegisterProject } from "../BuildTools/Projects";

let sandbox = "";
beforeEach(() => { sandbox = mkdtempSync(join(tmpdir(), "cse-project-plugin-")); });
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function Write(path: string, text: string): void {
	mkdirSync(resolve(path, ".."), { recursive: true });
	writeFileSync(path, text);
}

function MakeProject(name: string, withUi = true): string {
	const directory = join(sandbox, name);
	Write(join(directory, `${name}.cseproject`), JSON.stringify({
		FileVersion: 1, Name: name, Genre: "Collectathon",
		Modules: [{ Name: name, Primary: true, Dependencies: ["Engine"], Entry: `Source/${name}Module.ts` }, { Name: `${name}Tools`, Type: "Editor", LoadingPhase: "None", Entry: "Source/Tools.ts" }],
		Plugins: [{ Name: "UI", Enabled: true }],
	}));
	if (withUi) {
		Write(join(directory, "Content/UI/Ui.manifest.json"), JSON.stringify({ Documents: [{ Id: "Hud", Path: "Hud.ui.json" }, { Id: "Pause", Path: "Menus/Pause.ui.json", Script: "PauseScript" }] }));
		Write(join(directory, "Content/UI/Hud.ui.json"), "{}");
	}
	return directory;
}

describe("ResolveProject: which project the engine builds (CSE_PROJECT)", () => {
	it("a .cseproject, a project folder, a registered name, or the default", () => {
		const directory = MakeProject("Starfall");
		const file = join(directory, "Starfall.cseproject");
		const registry = join(sandbox, "Projects.json");
		RegisterProject(registry, file);
		const options = { Registry: registry, Default: file };
		for (const request of [file, directory, "Starfall", undefined, ""]) {
			const project = ResolveProject(request, options);
			expect([project.File, project.Directory, project.Project.Name], String(request)).toEqual([file, directory, "Starfall"]);
		}
	});

	it("says why it can't find one", () => {
		const registry = join(sandbox, "Projects.json");
		mkdirSync(join(sandbox, "Empty"));
		const two = MakeProject("Two");
		Write(join(two, "Other.cseproject"), "{}");
		const options = { Registry: registry, Default: "" };
		expect(() => ResolveProject("Nowhere", options)).toThrow(`No project "Nowhere": not a .cseproject, not a project folder, and not registered in ${registry}`);
		expect(() => ResolveProject(join(sandbox, "Empty"), options)).toThrow(`${join(sandbox, "Empty")} has no .cseproject`);
		expect(() => ResolveProject(two, options)).toThrow(`${two} has more than one .cseproject: Other.cseproject, Two.cseproject`);
	});
});

describe("the project's virtual module", () => {
	it("exports the descriptor, the project's modules (loaded on demand) and its UI documents (loaded on demand)", () => {
		const directory = MakeProject("Starfall");
		const source = ProjectModuleSource(ResolveProject(directory, { Registry: join(sandbox, "r.json"), Default: "" }));
		expect(source).toContain('"Name": "Starfall"');
		expect(source).toContain(`Load: () => import(${JSON.stringify(join(directory, "Source/StarfallModule.ts"))})`);
		expect(source).toContain(`Load: () => import(${JSON.stringify(join(directory, "Source/Tools.ts"))})`);
		expect(source).toContain('"Type": "Editor"');
		expect(source).toContain('"Thread": "GameLogic"');
		expect(source).toContain(`"Hud.ui.json": () => import(${JSON.stringify(`${join(directory, "Content/UI/Hud.ui.json")}?raw`)})`);
		expect(source).toContain(`"Menus/Pause.ui.json": () => import(${JSON.stringify(`${join(directory, "Content/UI/Menus/Pause.ui.json")}?raw`)})`);
		expect(source).toContain('"Script": "PauseScript"');
		expect(source).toContain("export function LoadUiDocument(path)");
	});

	it("a project without a UI manifest has no documents", () => {
		const directory = MakeProject("Bare", false);
		const source = ProjectModuleSource(ResolveProject(directory, { Registry: join(sandbox, "r.json"), Default: "" }));
		expect(source).toContain('export const UiManifest = {\n  "FileVersion": 1,\n  "Documents": []\n};');
	});

	it("the generated module works: modules and documents load; an unknown document says so", async () => {
		const directory = MakeProject("Starfall");
		const source = ProjectModuleSource(ResolveProject(directory, { Registry: join(sandbox, "r.json"), Default: "" }))
			.replace(/import\("([^"]+)"\)/g, (_all, path: string) => `Promise.resolve({ default: ${JSON.stringify(path)} })`)
			.replaceAll("export const", "const").replace("export function LoadUiDocument", "function LoadUiDocument");
		const module = new Function(`${source}\nreturn { Project, ProjectModules, UiManifest, LoadUiDocument };`)() as {
			ProjectModules: { Load: () => Promise<{ default: string; }>; }[];
			LoadUiDocument: (path: string) => Promise<string>;
		};
		expect((await module.ProjectModules[0]!.Load()).default).toBe(join(directory, "Source/StarfallModule.ts"));
		expect(await module.LoadUiDocument("Hud.ui.json")).toBe(`${join(directory, "Content/UI/Hud.ui.json")}?raw`);
		await expect(module.LoadUiDocument("Missing.ui.json")).rejects.toThrow('The project has no UI document file "Missing.ui.json"');
	});
});

describe("ProjectPlugin", () => {
	it("serves the virtual module and lets Vite read the project's folder", () => {
		const directory = MakeProject("Starfall");
		const plugin = ProjectPlugin({ Request: directory, Registry: join(sandbox, "r.json"), Default: "" }) as Plugin & {
			resolveId: (id: string) => string | undefined; load: (id: string) => string | undefined; config: () => UserConfig;
		};
		expect(plugin.name).toBe("cse-project");
		expect(plugin.resolveId(ProjectVirtualId)).toBe(`\0${ProjectVirtualId}`);
		expect(plugin.resolveId("vue")).toBeUndefined();
		expect(plugin.load(`\0${ProjectVirtualId}`)).toContain('"Name": "Starfall"');
		expect(plugin.load("other")).toBeUndefined();
		// Listing folders turns off Vite's own workspace root: it is listed too, or the engine's own files would be refused.
		expect(plugin.config().server!.fs!.allow).toEqual([directory, searchForWorkspaceRoot(process.cwd())]);
	});

	it("bare imports in the project's files resolve as if written in the engine (the project can live anywhere on disk)", async () => {
		const directory = MakeProject("Starfall");
		const plugin = ProjectPlugin({ Request: directory, Registry: join(sandbox, "r.json"), Default: "", EngineRoot: "/engine" }) as Plugin & {
			resolveId: (this: unknown, id: string, importer?: string) => Promise<unknown> | string | undefined;
		};
		const calls: unknown[][] = [];
		const context = { resolve: async (...args: unknown[]) => { calls.push(args); return { id: "/engine/resolved.ts" }; } };
		const fromProject = join(directory, "Source/StarfallModule.ts");
		expect(await plugin.resolveId.call(context, "@cse/core/modules", fromProject)).toEqual({ id: "/engine/resolved.ts" });
		expect(calls).toEqual([["@cse/core/modules", join("/engine", "index.html"), { skipSelf: true }]]);
		expect(await plugin.resolveId.call(context, "./Scenes/Level", fromProject)).toBeUndefined(); // relative: left to Vite
		expect(await plugin.resolveId.call(context, "/abs/file.ts", fromProject)).toBeUndefined();
		expect(await plugin.resolveId.call(context, "@cse/core/modules", "/engine/Source/x.ts")).toBeUndefined(); // the engine's own imports
		expect(await plugin.resolveId.call(context, "@cse/core/modules")).toBeUndefined();
		expect(calls).toHaveLength(1);
	});

	it("takes the project from CSE_PROJECT by default", () => {
		const directory = MakeProject("FromEnv");
		const previous = process.env["CSE_PROJECT"];
		process.env["CSE_PROJECT"] = directory;
		try {
			const plugin = ProjectPlugin({ Registry: join(sandbox, "r.json"), Default: "" }) as Plugin & { load: (id: string) => string; };
			expect(plugin.load(`\0${ProjectVirtualId}`)).toContain('"Name": "FromEnv"');
		} finally {
			if (previous === undefined) delete process.env["CSE_PROJECT"];
			else process.env["CSE_PROJECT"] = previous;
		}
	});
});

describe("ProjectPlugin: modules from elsewhere (a project made of templates' modules)", () => {
	it("folders in ImportRoots are treated like the project's own: readable by the dev server, bare imports resolved by the engine", async () => {
		const directory = MakeProject("Starfall");
		const templates = join(sandbox, "Templates");
		const plugin = ProjectPlugin({ Request: directory, Registry: join(sandbox, "r.json"), Default: "", EngineRoot: "/engine", ImportRoots: [templates] }) as Plugin & {
			resolveId: (this: unknown, id: string, importer?: string) => Promise<unknown> | string | undefined; config: () => UserConfig;
		};
		expect(plugin.config().server!.fs!.allow).toEqual([directory, templates, searchForWorkspaceRoot(process.cwd())]);
		const context = { resolve: async () => ({ id: "/engine/x.ts" }) };
		expect(await plugin.resolveId.call(context, "@cse/core/modules", join(templates, "CoinHunt/Source/Module.ts"))).toEqual({ id: "/engine/x.ts" });
		expect(await plugin.resolveId.call(context, "@cse/core/modules", join(sandbox, "Elsewhere/Module.ts"))).toBeUndefined();
	});
});

describe("ProjectPlugin: installed engine plugins (as Unreal finds .uplugin files)", () => {
	it("every <folder>/<Plugin>/*.cseplugin in PluginsDirectories is installed; its modules load from its folder", () => {
		const directory = MakeProject("Starfall");
		const engine = join(sandbox, "Modules", "Engine");
		Write(join(engine, "UI", "UI.cseplugin"), JSON.stringify({ Name: "UI", Modules: [{ Name: "UIHost", Thread: "Main", Entry: "Source/Host.ts" }] }));
		Write(join(engine, "Audio", "Audio.cseplugin"), JSON.stringify({ Name: "Audio", EnabledByDefault: true, Modules: [] }));
		mkdirSync(join(engine, "NotAPlugin"), { recursive: true });
		writeFileSync(join(engine, "README.md"), "#");
		const source = ProjectModuleSource(ResolveProject(directory, { Registry: join(sandbox, "r.json"), Default: "" }), [engine, join(sandbox, "missing")]);
		expect(source).toContain("export const InstalledPlugins = [");
		expect(source).toContain('"Name": "Audio"');
		expect(source).toContain('"FriendlyName": "UI"');
		expect(source).toContain(`Load: () => import(${JSON.stringify(join(engine, "UI", "Source/Host.ts"))})`);
		const installed = source.slice(source.indexOf("export const InstalledPlugins"));
		expect(installed.indexOf('"Name": "Audio"')).toBeLessThan(installed.indexOf('"Name": "UI"')); // by folder name
		expect(ProjectModuleSource(ResolveProject(directory, { Registry: join(sandbox, "r.json"), Default: "" }))).toContain("export const InstalledPlugins = [];");
	});

	it("the plugin passes its PluginsDirectories on, and lets Vite read them", () => {
		const directory = MakeProject("Starfall");
		const engine = join(sandbox, "Engine");
		mkdirSync(engine);
		const plugin = ProjectPlugin({ Request: directory, Registry: join(sandbox, "r.json"), Default: "", PluginsDirectories: [engine] }) as Plugin & { load: (id: string) => string; config: () => UserConfig; };
		expect(plugin.load(`\0${ProjectVirtualId}`)).toContain("export const InstalledPlugins = [];");
		expect(plugin.config().server!.fs!.allow).toContain(engine);
	});
});

describe("ProjectPlugin: one build per thread", () => {
	it("with a Thread, modules of other threads are described but not imported (the worker's bundle never pulls in the page's code)", async () => {
		const directory = MakeProject("Starfall");
		const engine = join(sandbox, "Engine");
		Write(join(engine, "UI", "UI.cseplugin"), JSON.stringify({ Name: "UI", Modules: [{ Name: "UIHost", Thread: "Main", Entry: "Source/Host.ts" }, { Name: "UIGame", Entry: "Source/Game.ts" }] }));
		const resolved = ResolveProject(directory, { Registry: join(sandbox, "r.json"), Default: "" });
		const worker = ProjectModuleSource(resolved, [engine], "GameLogic");
		expect(worker).not.toContain("Source/Host.ts");
		expect(worker).toContain(JSON.stringify(join(engine, "UI", "Source/Game.ts")));
		expect(worker).toContain('Load: () => Promise.reject(new Error("UIHost runs on the Main thread"))');
		const page = ProjectModuleSource(resolved, [engine], "Main");
		expect(page).toContain(JSON.stringify(join(engine, "UI", "Source/Host.ts")));
		expect(page).not.toContain(JSON.stringify(join(directory, "Source/StarfallModule.ts"))); // the game's module is GameLogic's: not imported
		const plugin = ProjectPlugin({ Request: directory, Registry: join(sandbox, "r.json"), Default: "", PluginsDirectories: [engine], Thread: "Main" }) as Plugin & { load: (id: string) => string; };
		expect(plugin.load(`\0${ProjectVirtualId}`)).not.toContain("Source/Game.ts");
		const rejected = await (new Function(`return ${'() => Promise.reject(new Error("UIHost runs on the Main thread"))'}`)() as () => Promise<unknown>)().catch((e: Error) => e.message);
		expect(rejected).toBe("UIHost runs on the Main thread");
	});
});

describe("ProjectPlugin: the project's input manifests", () => {
	const manifest = (name: string) => JSON.stringify({ Name: name, ActionMaps: [{ Name: "OnFoot", Actions: [{ Name: "Jump", Default: { Keyboard: ["Space", ""], Gamepad: "Pad:A" } }] }] });

	it("are read at build time and handed to the engine by Id, with the default", () => {
		const directory = MakeProject("Starfall");
		const file = join(directory, "Starfall.cseproject");
		const project = JSON.parse(readFileSync(file, "utf8"));
		project.Input = { Manifests: [{ Id: "Walk", Path: "Content/Input/Walk.input.json" }, { Id: "Drive", Path: "Content/Input/Drive.input.json" }], Default: "Drive" };
		writeFileSync(file, JSON.stringify(project));
		Write(join(directory, "Content/Input/Walk.input.json"), manifest("Walk"));
		Write(join(directory, "Content/Input/Drive.input.json"), manifest("Drive"));
		const source = ProjectModuleSource(ResolveProject(directory, { Registry: join(sandbox, "r.json"), Default: "" }));
		expect(source).toContain('export const DefaultInputManifest = "Drive";');
		const module = new Function(`${source.replaceAll("export const", "const").replace(/export function[\s\S]*$/, "")}\nreturn InputManifests;`)() as Record<string, { Name: string; DefaultMap: string; }>;
		expect(Object.keys(module)).toEqual(["Walk", "Drive"]);
		expect([module["Drive"]!.Name, module["Drive"]!.DefaultMap]).toEqual(["Drive", "OnFoot"]);
	});

	it("a broken one fails the build, naming it and its file; none at all is fine", () => {
		const directory = MakeProject("Starfall");
		const file = join(directory, "Starfall.cseproject");
		const project = JSON.parse(readFileSync(file, "utf8"));
		project.Input = { Manifests: [{ Id: "Walk", Path: "Content/Input/Walk.input.json" }] };
		writeFileSync(file, JSON.stringify(project));
		Write(join(directory, "Content/Input/Walk.input.json"), "{");
		expect(() => ProjectModuleSource(ResolveProject(directory, { Registry: join(sandbox, "r.json"), Default: "" })))
			.toThrow(`Input manifest "Walk" (${join(directory, "Content/Input/Walk.input.json")}): Not an input manifest: not JSON`);
		const bare = MakeProject("Bare");
		const source = ProjectModuleSource(ResolveProject(bare, { Registry: join(sandbox, "r.json"), Default: "" }));
		expect(source).toContain("export const InputManifests = {};");
		expect(source).toContain('export const DefaultInputManifest = "";');
	});
});

describe("ProjectPlugin: the project's data assets (.csedata) sit next to the game, editable without a rebuild", () => {
	function WithData(): string {
		const directory = MakeProject("Starfall");
		const file = join(directory, "Starfall.cseproject");
		const project = JSON.parse(readFileSync(file, "utf8"));
		project.Data = [{ Id: "Rules", Path: "Content/Data/Rules.csedata" }];
		writeFileSync(file, JSON.stringify(project));
		Write(join(directory, "Content/Data/Rules.csedata"), JSON.stringify({ FileVersion: 1, Type: "Rules", Values: { TimeLimit: 45 } }));
		return directory;
	}

	it("the engine gets their addresses by Id (data/<Id>.csedata)", () => {
		const source = ProjectModuleSource(ResolveProject(WithData(), { Registry: join(sandbox, "r.json"), Default: "" }));
		expect(source).toContain('export const DataAssetUrls = {\n  "Rules": "data/Rules.csedata"\n};');
		expect(ProjectModuleSource(ResolveProject(MakeProject("Bare"), { Registry: join(sandbox, "r.json"), Default: "" }))).toContain("export const DataAssetUrls = {};");
	});

	it("the build copies them as they are (not into the code); a file that isn't JSON fails the build, naming it", () => {
		const directory = WithData();
		const plugin = ProjectPlugin({ Request: directory, Registry: join(sandbox, "r.json"), Default: "" }) as Plugin & { generateBundle: (this: unknown) => void; };
		const emitted: unknown[] = [];
		plugin.generateBundle.call({ emitFile: (file: unknown) => emitted.push(file) });
		expect(emitted).toEqual([{ type: "asset", fileName: "data/Rules.csedata", source: readFileSync(join(directory, "Content/Data/Rules.csedata"), "utf8") }]);
		writeFileSync(join(directory, "Content/Data/Rules.csedata"), "{ oops");
		expect(() => plugin.generateBundle.call({ emitFile: () => undefined })).toThrow(`Data asset "Rules" (${join(directory, "Content/Data/Rules.csedata")}) is not JSON`);
	});

	it("the dev server reads them from the project at every request (an edit shows on reload); other requests pass on", () => {
		const directory = WithData();
		const plugin = ProjectPlugin({ Request: directory, Registry: join(sandbox, "r.json"), Default: "" }) as Plugin & {
			configureServer: (server: { middlewares: { use: (handler: (req: { url?: string; }, res: unknown, next: () => void) => void) => void; }; }) => void;
		};
		let handler: ((req: { url?: string; }, res: unknown, next: () => void) => void) | undefined;
		plugin.configureServer({ middlewares: { use: (h) => { handler = h; } } });
		const respond = (url: string) => {
			const res = { headers: {} as Record<string, string>, body: "", setHeader(name: string, value: string) { this.headers[name] = value; }, end(body: string) { this.body = body; } };
			const next = vi.fn();
			handler!({ url }, res, next);
			return { res, next };
		};
		writeFileSync(join(directory, "Content/Data/Rules.csedata"), JSON.stringify({ Type: "Rules", Values: { TimeLimit: 30 } }));
		const { res } = respond("/data/Rules.csedata?t=1");
		expect([JSON.parse(res.body).Values.TimeLimit, res.headers["Content-Type"]]).toEqual([30, "application/json"]);
		expect(respond("/data/Other.csedata").next).toHaveBeenCalled();
		expect(respond("/index.html").next).toHaveBeenCalled();
		expect(respond(undefined as never).next).toHaveBeenCalled();
	});
});
