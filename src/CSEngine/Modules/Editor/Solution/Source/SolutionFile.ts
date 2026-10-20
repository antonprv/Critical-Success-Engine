// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Normalize } from "./Paths";

/**
 * The .uisolution file: how a project's files are *shown*, never which files there are (that is the disk, and the
 * manifests the tools keep). It lies next to the project's .cseproject, is plain indented JSON (readable, diffs well)
 * and holds only visual things: the solution's visual projects and sub-projects, virtual folders, where items were
 * moved to in the solution view, hidden files, the expanded nodes and the chosen mode.
 *
 * Places in the solution view are written as references:
 * - `s` - the solution itself (its top level, as Visual Studio's solution items);
 * - `p:<id>` - a visual project;
 * - `v:<id>` - a virtual folder;
 * - `d:<path>` - a real folder (as shown inside the project bound to it).
 */

export const SolutionFileVersion = 1;
export const SolutionExtension = ".uisolution";

/** Folder View (the real files) or the Solution view (projects and virtual folders), as Visual Studio's two modes. */
export const enum ViewMode {
	Files = "Files",
	Solution = "Solution",
}

/** Where something sits in the solution view. */
export type PlaceRef = "s" | `p:${string}` | `v:${string}` | `d:${string}`;

export interface VisualProject {
	Id: string;
	Name: string;
	/** The real folder whose files it shows (a sub-project bound to a sub-folder); null: a purely visual one. */
	Folder: string | null;
	/** The project or virtual folder it sits under (`s`: right under the solution). */
	Parent: PlaceRef;
}

export interface VirtualFolder {
	Id: string;
	Name: string;
	Parent: PlaceRef;
}

export interface SolutionData {
	FileVersion: number;
	Mode: ViewMode;
	/** The first one is the project itself (bound to its whole folder); the others are added by the user. */
	Projects: VisualProject[];
	VirtualFolders: VirtualFolder[];
	/** Files and real folders the user moved in the solution view: path → where it is shown instead of its folder. */
	Placements: Record<string, PlaceRef>;
	/** Paths hidden in the solution view. */
	Hidden: string[];
	/** Names hidden in the solution view wherever they are (the solution file, the project files). */
	HiddenPatterns: string[];
	/** Hidden things are shown anyway, greyed (Visual Studio's "Show All Files"). */
	ShowHidden: boolean;
	/** The expanded node ids of each mode. */
	Expanded: Record<ViewMode, string[]>;
}

/** The project itself, as the first visual project. */
export const MainProjectId = "main";

export const DefaultHiddenPatterns: readonly string[] = ["*.uisolution", "*.cseproject", "*.csproj", "*.esproj", "*.slnx", "*.sln"];

/** What a project with no .uisolution looks like: one project over the whole folder, so both modes show the same. */
export function DefaultSolution(projectName: string): SolutionData {
	return {
		FileVersion: SolutionFileVersion,
		Mode: ViewMode.Solution,
		Projects: [{ Id: MainProjectId, Name: projectName, Folder: "", Parent: "s" }],
		VirtualFolders: [],
		Placements: {},
		Hidden: [],
		HiddenPatterns: [...DefaultHiddenPatterns],
		ShowHidden: false,
		Expanded: { [ViewMode.Files]: [], [ViewMode.Solution]: [`p:${MainProjectId}`] },
	};
}

class SolutionFileError extends Error {
	public constructor(reason: string) {
		super(`Not a .uisolution: ${reason}`);
	}
}

type Json = Record<string, unknown>;
const IsObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const Strings = (value: unknown, what: string): string[] => {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new SolutionFileError(`${what} must be a list of strings`);
	return value;
};
const PlaceRefPattern = /^(s$|p:.|v:.|d:)/;

function ReadRef(value: unknown, what: string): PlaceRef {
	if (typeof value !== "string" || !PlaceRefPattern.test(value)) throw new SolutionFileError(`${what} must be a place (s, p:, v: or d:)`);
	return (value.startsWith("d:") ? `d:${Normalize(value.slice(2))}` : value) as PlaceRef;
}

function ReadId(raw: Json, what: string): string {
	const id = raw["Id"];
	if (typeof id !== "string" || id === "") throw new SolutionFileError(`${what} has no Id`);
	return id;
}

function ReadName(raw: Json, id: string): string {
	return typeof raw["Name"] === "string" ? raw["Name"] : id;
}

/**
 * Reads a .uisolution. Unknown fields are dropped, missing ones take the defaults, so an older or hand-edited file
 * still opens; what can't be meant (a project without an Id, a place that is no place) is an error.
 */
export function ParseSolution(text: string, projectName: string): SolutionData {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new SolutionFileError("not JSON");
	}
	if (!IsObject(raw)) throw new SolutionFileError("not an object");
	const defaults = DefaultSolution(projectName);
	const projects = (Array.isArray(raw["Projects"]) ? raw["Projects"] : []).map((item: unknown, index): VisualProject => {
		if (!IsObject(item)) throw new SolutionFileError(`project ${index} is not an object`);
		const id = ReadId(item, `project ${index}`);
		const folder = item["Folder"];
		return {
			Id: id,
			Name: ReadName(item, id),
			Folder: typeof folder === "string" ? Normalize(folder) : null,
			Parent: item["Parent"] === undefined || item["Parent"] === null ? "s" : ReadRef(item["Parent"], `the parent of project ${id}`),
		};
	});
	if (!projects.some((project) => project.Id === MainProjectId)) projects.unshift(defaults.Projects[0]!);
	const folders = (Array.isArray(raw["VirtualFolders"]) ? raw["VirtualFolders"] : []).map((item: unknown, index): VirtualFolder => {
		if (!IsObject(item)) throw new SolutionFileError(`virtual folder ${index} is not an object`);
		const id = ReadId(item, `virtual folder ${index}`);
		return { Id: id, Name: ReadName(item, id), Parent: ReadRef(item["Parent"], `the parent of virtual folder ${id}`) };
	});
	const ids = new Set<string>();
	for (const id of [...projects.map((p) => `p:${p.Id}`), ...folders.map((f) => `v:${f.Id}`)]) {
		if (ids.has(id)) throw new SolutionFileError(`two places are called "${id}"`);
		ids.add(id);
	}
	const placements: Record<string, PlaceRef> = {};
	const rawPlacements = raw["Placements"];
	if (rawPlacements !== undefined && !IsObject(rawPlacements)) throw new SolutionFileError("Placements must be an object");
	for (const [path, place] of Object.entries(rawPlacements ?? {})) placements[Normalize(path)] = ReadRef(place, `the place of ${path}`);
	const expanded = IsObject(raw["Expanded"]) ? raw["Expanded"] : {};
	return {
		FileVersion: SolutionFileVersion,
		Mode: raw["Mode"] === ViewMode.Files ? ViewMode.Files : ViewMode.Solution,
		Projects: projects,
		VirtualFolders: folders,
		Placements: placements,
		Hidden: Strings(raw["Hidden"], "Hidden").map(Normalize),
		HiddenPatterns: raw["HiddenPatterns"] === undefined ? defaults.HiddenPatterns : Strings(raw["HiddenPatterns"], "HiddenPatterns"),
		ShowHidden: raw["ShowHidden"] === true,
		Expanded: {
			[ViewMode.Files]: Strings(expanded[ViewMode.Files], "Expanded.Files"),
			[ViewMode.Solution]: expanded[ViewMode.Solution] === undefined ? defaults.Expanded[ViewMode.Solution] : Strings(expanded[ViewMode.Solution], "Expanded.Solution"),
		},
	};
}

/** The file's text: indented JSON, keys in a fixed order, placements sorted, so saving twice gives the same bytes. */
export function SerializeSolution(data: SolutionData): string {
	const placements = Object.fromEntries(Object.entries(data.Placements).sort(([a], [b]) => (a < b ? -1 : 1)));
	const ordered = {
		FileVersion: data.FileVersion,
		Mode: data.Mode,
		Projects: data.Projects,
		VirtualFolders: data.VirtualFolders,
		Placements: placements,
		Hidden: [...data.Hidden].sort(),
		HiddenPatterns: data.HiddenPatterns,
		ShowHidden: data.ShowHidden,
		Expanded: { [ViewMode.Files]: [...data.Expanded[ViewMode.Files]].sort(), [ViewMode.Solution]: [...data.Expanded[ViewMode.Solution]].sort() },
	};
	return `${JSON.stringify(ordered, null, 2)}\n`;
}
