// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { Genres, ParseProject, SerializeProject, type Genre } from "../Source/Engine/Projects/ProjectDescriptor.ts";

/**
 * Projects on this machine, as Unreal's launcher knows them: a per-user registry of .cseproject files, the engine's
 * templates, and creating a project from a template. Used by the engine's build and by the editor tools.
 */

/** The placeholder a template uses for the project's name, in file names and in text. */
export const TemplateToken = "TemplateProject";

export interface RegisteredProject {
	Name: string;
	/** The project's .cseproject (absolute). */
	File: string;
	Template: string;
	Genre: string;
	/** When it was last registered or opened (ISO time). */
	LastOpened: string;
}

export interface ProjectRegistry { Projects: RegisteredProject[]; }

export interface TemplateInfo {
	Name: string;
	Title: string;
	Description: string;
	Genre: Genre;
	Order: number;
	Directory: string;
}

export interface CreateProjectOptions {
	TemplatesDirectory: string;
	Template: string;
	Name: string;
	/** The folder the project's own folder is created in. */
	Location: string;
	Registry: string;
	Now?: Date;
}

const IsObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const Identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const Reserved = ["engine", "core", "ui", "editor", "modules", "templates"];
const TextFiles = [".ts", ".vue", ".json", ".cseproject", ".md", ".html", ".css", ".txt"];

//#region registry

/** Projects.json in the user's settings folder (or CSE_PROJECTS_REGISTRY). */
export function RegistryPath(system: { platform?: string; env?: Record<string, string | undefined>; home?: string; } = {}): string {
	const { platform = process.platform, env = process.env, home = homedir() } = system;
	if (env["CSE_PROJECTS_REGISTRY"]) return env["CSE_PROJECTS_REGISTRY"];
	const settings = platform === "win32" ? env["APPDATA"] ?? join(home, "AppData", "Roaming")
		: platform === "darwin" ? join(home, "Library", "Application Support")
			: env["XDG_CONFIG_HOME"] ?? join(home, ".config");
	return join(settings, "CriticalSuccessEngine", "Projects.json");
}

/** The registry; a missing file is an empty registry, a damaged one is an error (never silently replaced). */
export function ReadRegistry(registry: string): ProjectRegistry {
	if (!existsSync(registry)) return { Projects: [] };
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(registry, "utf8"));
	} catch {
		throw new Error(`The project registry ${registry} is damaged: not JSON`);
	}
	const entries = IsObject(raw) && Array.isArray(raw["Projects"]) ? raw["Projects"] : [];
	return {
		Projects: entries.filter((e): e is Record<string, unknown> => IsObject(e) && typeof e["Name"] === "string" && typeof e["File"] === "string").map((e) => ({
			Name: e["Name"] as string, File: e["File"] as string, Template: String(e["Template"] ?? ""), Genre: String(e["Genre"] ?? ""), LastOpened: String(e["LastOpened"] ?? ""),
		})),
	};
}

function WriteRegistry(registry: string, contents: ProjectRegistry): void {
	mkdirSync(dirname(registry), { recursive: true });
	writeFileSync(registry, `${JSON.stringify(contents, null, 2)}\n`);
}

/** Adds a project (by its .cseproject), or refreshes it if it is registered already. */
export function RegisterProject(registry: string, projectFile: string, now = new Date()): RegisteredProject {
	const contents = ReadRegistry(registry);
	const file = resolve(projectFile);
	const project = ParseProject(readFileSync(file, "utf8"));
	const entry: RegisteredProject = { Name: project.Name, File: file, Template: project.Template, Genre: project.Genre, LastOpened: now.toISOString() };
	WriteRegistry(registry, { Projects: [...contents.Projects.filter((p) => p.File !== file), entry] });
	return entry;
}

/** A registered project by name or by its .cseproject path. */
export function FindProject(registry: string, nameOrFile: string): RegisteredProject | undefined {
	const file = resolve(nameOrFile);
	return ReadRegistry(registry).Projects.find((p) => p.Name === nameOrFile || p.File === file);
}

/** Every registered project, and whether its file is still there. */
export function ListProjects(registry: string): (RegisteredProject & { Exists: boolean; })[] {
	return ReadRegistry(registry).Projects.map((p) => ({ ...p, Exists: existsSync(p.File) }));
}

export function UnregisterProject(registry: string, nameOrFile: string): boolean {
	const found = FindProject(registry, nameOrFile);
	if (!found) return false;
	WriteRegistry(registry, { Projects: ReadRegistry(registry).Projects.filter((p) => p.File !== found.File) });
	return true;
}

//#endregion

//#region templates and new projects

/** The templates in a folder (each has a Template.json), by their Order, then title. */
export function ListTemplates(templatesDirectory: string): TemplateInfo[] {
	if (!existsSync(templatesDirectory)) return [];
	const templates: TemplateInfo[] = [];
	for (const name of readdirSync(templatesDirectory)) {
		const descriptor = join(templatesDirectory, name, "Template.json");
		if (!existsSync(descriptor)) continue;
		let raw: unknown;
		try {
			raw = JSON.parse(readFileSync(descriptor, "utf8"));
		} catch {
			continue;
		}
		if (!IsObject(raw) || !Genres.includes(raw["Genre"] as Genre)) continue;
		templates.push({
			Name: String(raw["Name"]), Title: String(raw["Title"]), Description: String(raw["Description"] ?? ""), Genre: raw["Genre"] as Genre,
			Order: typeof raw["Order"] === "number" ? raw["Order"] : 100, Directory: join(templatesDirectory, name),
		});
	}
	return templates.sort((a, b) => a.Order - b.Order || a.Title.localeCompare(b.Title));
}

/** Why a name can't be a project's, or null. */
export function ProjectNameProblem(name: string): string | null {
	if (name === "") return "A project needs a name";
	if (!Identifier.test(name)) return "A project name is an identifier: letters, digits and _, not starting with a digit";
	if (Reserved.includes(name.toLowerCase())) return `"${name}" is the name of an engine module`;
	return null;
}

/** Copies a template folder, putting the project's name where the template says TemplateProject. */
function CopyTemplate(source: string, target: string, name: string, root = true): void {
	mkdirSync(target, { recursive: true });
	for (const entry of readdirSync(source)) {
		if (root && entry === "Template.json") continue;
		const from = join(source, entry);
		const to = join(target, entry.replaceAll(TemplateToken, name));
		if (statSync(from).isDirectory()) CopyTemplate(from, to, name, false);
		else if (TextFiles.includes(extname(from))) writeFileSync(to, readFileSync(from, "utf8").replaceAll(TemplateToken, name));
		else copyFileSync(from, to);
	}
}

/** A new project from a template, registered so the engine and the tools know it. */
export function CreateProject(options: CreateProjectOptions): { Directory: string; File: string; } {
	const problem = ProjectNameProblem(options.Name);
	if (problem) throw new Error(problem);
	const template = ListTemplates(options.TemplatesDirectory).find((t) => t.Name === options.Template);
	if (!template) throw new Error(`There is no template "${options.Template}" in ${options.TemplatesDirectory}`);
	const directory = resolve(options.Location, options.Name);
	if (existsSync(directory)) throw new Error(`${directory} already exists`);

	CopyTemplate(template.Directory, directory, options.Name);
	const file = join(directory, `${options.Name}.cseproject`);
	const project = ParseProject(readFileSync(file, "utf8"));
	writeFileSync(file, SerializeProject({ ...project, Template: template.Name, Genre: template.Genre }));
	RegisterProject(options.Registry, file, options.Now);
	return { Directory: directory, File: file };
}

//#endregion
