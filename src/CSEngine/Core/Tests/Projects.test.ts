// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CreateProject, FindProject, ListProjects, ListTemplates, ProjectNameProblem, ReadRegistry, RegisterProject, RegistryPath, TemplateToken,
	UnregisterProject,
} from "../BuildTools/Projects";
import { ParseProject } from "../Source/Engine/Projects/ProjectDescriptor";

let sandbox = "";
beforeEach(() => { sandbox = mkdtempSync(join(tmpdir(), "cse-projects-")); });
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function Write(path: string, text: string): void {
	mkdirSync(resolve(path, ".."), { recursive: true });
	writeFileSync(path, text);
}

/** A tiny template: its descriptor, a module named after the project, a UI manifest. */
function MakeTemplate(root: string, name = "Mini", extra: Record<string, unknown> = {}): void {
	Write(join(root, name, "Template.json"), JSON.stringify({ Name: name, Title: `${name} game`, Description: "d", Genre: "FirstPerson", Order: 1, ...extra }));
	Write(join(root, name, `${TemplateToken}.cseproject`), JSON.stringify({ FileVersion: 1, Name: TemplateToken, Modules: [{ Name: TemplateToken, Primary: true, Entry: `Source/${TemplateToken}Module.ts` }] }));
	Write(join(root, name, "Source", `${TemplateToken}Module.ts`), `export default class ${TemplateToken}Module {}\n`);
	Write(join(root, name, "Content", "UI", "Ui.manifest.json"), '{ "Documents": [] }\n');
	Write(join(root, name, "Content", "logo.png"), "\u0089PNG binary TemplateProject stays");
}

function MakeProject(directory: string, name: string): string {
	const file = join(directory, `${name}.cseproject`);
	Write(file, JSON.stringify({ FileVersion: 1, Name: name, Template: "Mini", Genre: "TopDown", Modules: [] }));
	return file;
}

describe("where the project registry lives (as Unreal's launcher keeps its list per user)", () => {
	it("per OS, unless CSE_PROJECTS_REGISTRY says otherwise", () => {
		expect(RegistryPath({ platform: "win32", env: { APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, home: "C:\\Users\\a" })).toBe(join("C:\\Users\\a\\AppData\\Roaming", "CriticalSuccessEngine", "Projects.json"));
		expect(RegistryPath({ platform: "win32", env: {}, home: "/h" })).toBe(join("/h", "AppData", "Roaming", "CriticalSuccessEngine", "Projects.json"));
		expect(RegistryPath({ platform: "darwin", env: {}, home: "/Users/a" })).toBe(join("/Users/a", "Library", "Application Support", "CriticalSuccessEngine", "Projects.json"));
		expect(RegistryPath({ platform: "linux", env: { XDG_CONFIG_HOME: "/cfg" }, home: "/home/a" })).toBe(join("/cfg", "CriticalSuccessEngine", "Projects.json"));
		expect(RegistryPath({ platform: "linux", env: {}, home: "/home/a" })).toBe(join("/home/a", ".config", "CriticalSuccessEngine", "Projects.json"));
		expect(RegistryPath({ platform: "linux", env: { CSE_PROJECTS_REGISTRY: "/x/p.json" }, home: "/h" })).toBe("/x/p.json");
		expect(RegistryPath()).toMatch(/Projects\.json$/);
	});
});

describe("the project registry", () => {
	it("is empty until something registers; registering reads the descriptor; registering again updates, not duplicates", () => {
		const registry = join(sandbox, "reg", "Projects.json");
		expect(ReadRegistry(registry)).toEqual({ Projects: [] });
		const file = MakeProject(join(sandbox, "Starfall"), "Starfall");
		const first = RegisterProject(registry, file, new Date("2026-10-06T10:00:00Z"));
		expect(first).toEqual({ Name: "Starfall", File: file, Template: "Mini", Genre: "TopDown", LastOpened: "2026-10-06T10:00:00.000Z" });
		RegisterProject(registry, file, new Date("2026-10-07T10:00:00Z"));
		expect(ReadRegistry(registry).Projects).toEqual([{ ...first, LastOpened: "2026-10-07T10:00:00.000Z" }]);
	});

	it("finds a project by name or by file, lists the ones whose files are gone, and forgets them", () => {
		const registry = join(sandbox, "Projects.json");
		const a = MakeProject(join(sandbox, "A"), "Alpha");
		const b = MakeProject(join(sandbox, "B"), "Beta");
		RegisterProject(registry, a);
		RegisterProject(registry, b);
		expect(FindProject(registry, "Beta")?.File).toBe(b);
		expect(FindProject(registry, a)?.Name).toBe("Alpha");
		expect(FindProject(registry, "Gamma")).toBeUndefined();
		rmSync(join(sandbox, "B"), { recursive: true });
		expect(ListProjects(registry).map((p) => [p.Name, p.Exists])).toEqual([["Alpha", true], ["Beta", false]]);
		expect(UnregisterProject(registry, "Beta")).toBe(true);
		expect(UnregisterProject(registry, "Beta")).toBe(false);
		expect(ReadRegistry(registry).Projects.map((p) => p.Name)).toEqual(["Alpha"]);
	});

	it("a damaged registry is reported, never silently overwritten; entries that make no sense are skipped", () => {
		const registry = join(sandbox, "Projects.json");
		writeFileSync(registry, "{ broken");
		expect(() => ReadRegistry(registry)).toThrow(`The project registry ${registry} is damaged: not JSON`);
		expect(() => RegisterProject(registry, MakeProject(join(sandbox, "P"), "P"))).toThrow(/is damaged/);
		expect(readFileSync(registry, "utf8")).toBe("{ broken");
		writeFileSync(registry, JSON.stringify({ Projects: [{ Name: "Ok", File: "/x/Ok.cseproject", Template: "", Genre: "Blank", LastOpened: "" }, { Name: 5 }, "x"] }));
		expect(ReadRegistry(registry).Projects.map((p) => p.Name)).toEqual(["Ok"]);
		writeFileSync(registry, JSON.stringify({ Projects: "nope" }));
		expect(ReadRegistry(registry)).toEqual({ Projects: [] });
	});
});

describe("templates and new projects", () => {
	it("lists templates by their order, skipping folders that aren't templates", () => {
		MakeTemplate(sandbox, "Shooter", { Order: 2 });
		MakeTemplate(sandbox, "Blank", { Order: 0, Genre: "Blank" });
		MakeTemplate(sandbox, "Racer", { Order: 2, Title: "A racer" });
		mkdirSync(join(sandbox, "NotATemplate"));
		Write(join(sandbox, "Broken", "Template.json"), "{");
		Write(join(sandbox, "WrongGenre", "Template.json"), JSON.stringify({ Name: "X", Title: "X", Genre: "Racing" }));
		writeFileSync(join(sandbox, "README.md"), "#");
		expect(ListTemplates(sandbox).map((t) => t.Name)).toEqual(["Blank", "Racer", "Shooter"]);
		expect(ListTemplates(join(sandbox, "missing"))).toEqual([]);
		expect(ListTemplates(sandbox)[0]).toEqual({ Name: "Blank", Title: "Blank game", Description: "d", Genre: "Blank", Order: 0, Directory: join(sandbox, "Blank") });
	});

	it("checks a project's name", () => {
		expect(ProjectNameProblem("Starfall")).toBeNull();
		expect(ProjectNameProblem("")).toBe("A project needs a name");
		expect(ProjectNameProblem("2Fast")).toBe("A project name is an identifier: letters, digits and _, not starting with a digit");
		expect(ProjectNameProblem("My Game")).toBe("A project name is an identifier: letters, digits and _, not starting with a digit");
		expect(ProjectNameProblem("Engine")).toBe('"Engine" is the name of an engine module');
		expect(ProjectNameProblem("ui")).toBe('"ui" is the name of an engine module');
	});

	it("creates a project from a template: copies it under the project's name, records template and genre, and registers it", () => {
		const templates = join(sandbox, "Templates");
		MakeTemplate(templates);
		const registry = join(sandbox, "Projects.json");
		const created = CreateProject({ TemplatesDirectory: templates, Template: "Mini", Name: "Starfall", Location: join(sandbox, "Games"), Registry: registry });
		expect(created.Directory).toBe(join(sandbox, "Games", "Starfall"));
		expect(created.File).toBe(join(sandbox, "Games", "Starfall", "Starfall.cseproject"));
		const project = ParseProject(readFileSync(created.File, "utf8"));
		expect([project.Name, project.Template, project.Genre, project.Modules[0]!.Entry]).toEqual(["Starfall", "Mini", "FirstPerson", "Source/StarfallModule.ts"]);
		expect(readFileSync(join(created.Directory, "Source", "StarfallModule.ts"), "utf8")).toBe("export default class StarfallModule {}\n");
		expect(readFileSync(join(created.Directory, "Content", "logo.png"), "utf8")).toContain("TemplateProject stays"); // binary files are copied as they are
		expect(existsSync(join(created.Directory, "Template.json"))).toBe(false);
		expect(FindProject(registry, "Starfall")?.File).toBe(created.File);
	});

	it("refuses a bad name, an unknown template and a folder that is already there", () => {
		const templates = join(sandbox, "Templates");
		MakeTemplate(templates);
		const base = { TemplatesDirectory: templates, Template: "Mini", Location: sandbox, Registry: join(sandbox, "Projects.json") };
		expect(() => CreateProject({ ...base, Name: "my game" })).toThrow("A project name is an identifier");
		expect(() => CreateProject({ ...base, Name: "Ok", Template: "Nope" })).toThrow('There is no template "Nope"');
		mkdirSync(join(sandbox, "Taken"));
		expect(() => CreateProject({ ...base, Name: "Taken" })).toThrow(`${join(sandbox, "Taken")} already exists`);
	});

	it("the engine's own Blank template creates a working project", () => {
		const templates = resolve("../../Templates");
		expect(ListTemplates(templates).map((t) => t.Name)).toContain("Blank");
		const created = CreateProject({ TemplatesDirectory: templates, Template: "Blank", Name: "Sandbox", Location: sandbox, Registry: join(sandbox, "Projects.json") });
		const project = ParseProject(readFileSync(created.File, "utf8"));
		expect(project).toMatchObject({ Name: "Sandbox", Template: "Blank", Genre: "Blank", Ui: { Manifest: "Content/UI/Ui.manifest.json" } });
		expect(existsSync(join(created.Directory, project.Modules[0]!.Entry))).toBe(true);
		expect(existsSync(join(created.Directory, project.Ui.Manifest))).toBe(true);
	});
});

describe("hand-written registry entries and templates", () => {
	it("missing optional fields read as empty, and a template without an order sorts last", () => {
		const registry = join(sandbox, "Projects.json");
		writeFileSync(registry, JSON.stringify({ Projects: [{ Name: "Bare", File: "/x/Bare.cseproject" }] }));
		expect(ReadRegistry(registry).Projects).toEqual([{ Name: "Bare", File: "/x/Bare.cseproject", Template: "", Genre: "", LastOpened: "" }]);
		Write(join(sandbox, "T", "Plain", "Template.json"), JSON.stringify({ Name: "Plain", Title: "Plain", Genre: "Blank" }));
		Write(join(sandbox, "T", "First", "Template.json"), JSON.stringify({ Name: "First", Title: "Z", Genre: "Blank", Order: 1 }));
		expect(ListTemplates(join(sandbox, "T")).map((t) => [t.Name, t.Order, t.Description])).toEqual([["First", 1, ""], ["Plain", 100, ""]]);
	});
});
