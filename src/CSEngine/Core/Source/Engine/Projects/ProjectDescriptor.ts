// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { LoadingPhase, LoadingPhases, ModuleThread, ModuleType } from "../Modules/ModuleManager.ts";
import type { PluginReference } from "../Modules/Plugins.ts";

/**
 * A project's descriptor: <Name>.cseproject at the project's root, as Unreal's .uproject. The engine builds the project
 * it describes; the tools (project browser, UI designer) find projects through it.
 */

export const ProjectFileVersion = 1;

/** What kind of game a project starts as: each genre has a template. */
export const enum Genre {
	Blank = "Blank",
	FirstPerson = "FirstPerson",
	ThirdPerson = "ThirdPerson",
	TopDown = "TopDown",
	Collectathon = "Collectathon",
}

export const Genres: readonly Genre[] = [Genre.Blank, Genre.FirstPerson, Genre.ThirdPerson, Genre.TopDown, Genre.Collectathon];

/** A module of the project: like a module descriptor, with the source file that default-exports its class. */
export interface ProjectModule {
	Name: string;
	Type: ModuleType;
	LoadingPhase: LoadingPhase;
	Primary: boolean;
	Dependencies: string[];
	/** The thread it runs in. */
	Thread: ModuleThread;
	/** Path from the project root, e.g. "Source/StarfallModule.ts". */
	Entry: string;
}

export interface CseProject {
	FileVersion: number;
	Name: string;
	Description: string;
	/** The template it was created from ("" when made by hand). */
	Template: string;
	Genre: Genre;
	Modules: ProjectModule[];
	Plugins: PluginReference[];
	/** Where the project's UI documents are listed. */
	Ui: { Manifest: string; };
	/** The project's input manifests (its actions and bindings), by Id, and the one in use at start. */
	Input: { Manifests: { Id: string; Path: string; }[]; Default: string; };
	/** The project's data assets (.csedata), by Id: they sit next to the game, editable without a rebuild. */
	Data: { Id: string; Path: string; }[];
}

class ProjectError extends Error {
	public constructor(reason: string, kind = "project") {
		super(`Not a ${kind} file: ${reason}`);
	}
}

/** A .cseplugin: a named, versioned bundle of modules (each with its Entry, from the plugin's folder), as Unreal's .uplugin. */
export interface CsePlugin {
	FileVersion: number;
	Name: string;
	FriendlyName: string;
	Version: string;
	Description: string;
	Category: string;
	EnabledByDefault: boolean;
	Modules: ProjectModule[];
	Plugins: PluginReference[];
}

const IsObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const Identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const Types: string[] = [ModuleType.Runtime, ModuleType.Editor, ModuleType.Developer];
const Phases: string[] = [...LoadingPhases, LoadingPhase.None];
const Threads: string[] = [ModuleThread.Main, ModuleThread.GameLogic, ModuleThread.Any];

function ReadModule(raw: unknown, kind = "project"): ProjectModule {
	if (!IsObject(raw) || typeof raw["Name"] !== "string") throw new ProjectError("a module has no Name", kind);
	const name = raw["Name"];
	if (typeof raw["Entry"] !== "string") throw new ProjectError(`module "${name}" has no Entry`, kind);
	const type = raw["Type"] ?? ModuleType.Runtime;
	if (!Types.includes(type as string)) throw new ProjectError(`module "${name}" has an unknown Type "${String(type)}"`);
	const phase = raw["LoadingPhase"] ?? LoadingPhase.Default;
	if (!Phases.includes(phase as string)) throw new ProjectError(`module "${name}" has an unknown LoadingPhase "${String(phase)}"`);
	const thread = raw["Thread"] ?? ModuleThread.GameLogic;
	if (!Threads.includes(thread as string)) throw new ProjectError(`module "${name}" has an unknown Thread "${String(thread)}"`);
	const dependencies = Array.isArray(raw["Dependencies"]) ? raw["Dependencies"].filter((d): d is string => typeof d === "string") : [];
	return { Name: name, Type: type as ModuleType, LoadingPhase: phase as LoadingPhase, Primary: raw["Primary"] === true, Dependencies: dependencies, Thread: thread as ModuleThread, Entry: raw["Entry"] };
}

function ReadPlugin(raw: unknown): PluginReference {
	if (!IsObject(raw) || typeof raw["Name"] !== "string") throw new ProjectError("a plugin reference needs a Name");
	return { Name: raw["Name"], Enabled: raw["Enabled"] !== false };
}

/** Reads a .cseproject; throws "Not a project file: ..." with what is wrong. */
export function ParseProject(text: string): CseProject {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new ProjectError("not JSON");
	}
	const record = IsObject(raw) ? raw : {};
	const version = typeof record["FileVersion"] === "number" ? record["FileVersion"] : ProjectFileVersion;
	if (version > ProjectFileVersion) throw new ProjectError(`FileVersion ${version} is newer than this engine understands (${ProjectFileVersion})`);
	if (typeof record["Name"] !== "string") throw new ProjectError("Name must be a string");
	if (!Identifier.test(record["Name"])) throw new ProjectError(`Name "${record["Name"]}" must be an identifier (letters, digits, _; not starting with a digit)`);
	const genre = record["Genre"] ?? Genre.Blank;
	if (!Genres.includes(genre as Genre)) throw new ProjectError(`unknown Genre "${String(genre)}"`);
	if (record["Modules"] !== undefined && !Array.isArray(record["Modules"])) throw new ProjectError("Modules must be a list");
	const modules = ((record["Modules"] as unknown[] | undefined) ?? []).map((m) => ReadModule(m));
	if (modules.filter((m) => m.Primary).length > 1) throw new ProjectError("more than one primary game module");
	const input = ReadInput(record["Input"]);
	const data = ReadData(record["Data"]);
	const ui = IsObject(record["Ui"]) ? record["Ui"] : {};
	if (ui["Manifest"] !== undefined && typeof ui["Manifest"] !== "string") throw new ProjectError("Ui.Manifest must be a path");

	return {
		FileVersion: version,
		Name: record["Name"],
		Description: typeof record["Description"] === "string" ? record["Description"] : "",
		Template: typeof record["Template"] === "string" ? record["Template"] : "",
		Genre: genre as Genre,
		Modules: modules,
		Plugins: (Array.isArray(record["Plugins"]) ? record["Plugins"] : []).map(ReadPlugin),
		Ui: { Manifest: (ui["Manifest"] as string | undefined) ?? "Content/UI/Ui.manifest.json" },
		Input: input,
		Data: data,
	};
}

function ReadData(raw: unknown): CseProject["Data"] {
	if (raw !== undefined && !Array.isArray(raw)) throw new ProjectError("Data must be a list");
	const assets = ((raw as unknown[] | undefined) ?? []).map((entry) => {
		if (!IsObject(entry) || typeof entry["Id"] !== "string") throw new ProjectError("a data asset has no Id");
		if (!Identifier.test(entry["Id"])) throw new ProjectError(`data asset Id "${entry["Id"]}" must be an identifier`);
		if (typeof entry["Path"] !== "string") throw new ProjectError(`data asset "${entry["Id"]}" has no Path`);
		return { Id: entry["Id"], Path: entry["Path"] };
	});
	const ids = new Set<string>();
	for (const { Id } of assets) {
		if (ids.has(Id)) throw new ProjectError(`two data assets are called "${Id}"`);
		ids.add(Id);
	}
	return assets;
}

function ReadInput(raw: unknown): CseProject["Input"] {
	const record = IsObject(raw) ? raw : {};
	if (record["Manifests"] !== undefined && !Array.isArray(record["Manifests"])) throw new ProjectError("Input.Manifests must be a list");
	const manifests = ((record["Manifests"] as unknown[] | undefined) ?? []).map((entry) => {
		if (!IsObject(entry) || typeof entry["Id"] !== "string") throw new ProjectError("an input manifest has no Id");
		if (typeof entry["Path"] !== "string") throw new ProjectError(`input manifest "${entry["Id"]}" has no Path`);
		return { Id: entry["Id"], Path: entry["Path"] };
	});
	const ids = new Set<string>();
	for (const { Id } of manifests) {
		if (ids.has(Id)) throw new ProjectError(`two input manifests are called "${Id}"`);
		ids.add(Id);
	}
	const fallback = manifests[0]?.Id ?? "";
	const chosen = typeof record["Default"] === "string" ? record["Default"] : fallback;
	if (manifests.length > 0 && !ids.has(chosen)) throw new ProjectError(`Input.Default "${chosen}" is not one of its input manifests`);
	return { Manifests: manifests, Default: manifests.length > 0 ? chosen : "" };
}

/** Reads a .cseplugin; throws "Not a plugin file: ..." with what is wrong. */
export function ParsePlugin(text: string): CsePlugin {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new ProjectError("not JSON", "plugin");
	}
	const record = IsObject(raw) ? raw : {};
	if (typeof record["Name"] !== "string") throw new ProjectError("Name must be a string", "plugin");
	const text_ = (key: string, fallback: string): string => (typeof record[key] === "string" ? record[key] as string : fallback);
	return {
		FileVersion: typeof record["FileVersion"] === "number" ? record["FileVersion"] : ProjectFileVersion,
		Name: record["Name"],
		FriendlyName: text_("FriendlyName", record["Name"]),
		Version: text_("Version", "1.0"),
		Description: text_("Description", ""),
		Category: text_("Category", ""),
		EnabledByDefault: record["EnabledByDefault"] === true,
		Modules: (Array.isArray(record["Modules"]) ? record["Modules"] : []).map((m) => ReadModule(m, "plugin")),
		Plugins: (Array.isArray(record["Plugins"]) ? record["Plugins"] : []).map(ReadPlugin),
	};
}

export function SerializeProject(project: CseProject): string {
	return `${JSON.stringify(project, null, 2)}\n`;
}
