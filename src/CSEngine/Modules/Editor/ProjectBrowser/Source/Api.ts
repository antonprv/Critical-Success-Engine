// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** A project the engine and the tools know (the registry's entry, and whether its file is still there). */
export interface ProjectRow {
	Name: string;
	File: string;
	Template: string;
	Genre: string;
	LastOpened: string;
	Exists: boolean;
}

/** A template a project starts from. */
export interface TemplateRow {
	Name: string;
	Title: string;
	Description: string;
	Genre: string;
}

/** How a project runs: the dev server in a browser, or a finished build of a platform and configuration (Binaries/<Web|Desktop>/<Dev|Prod>). */
export type RunMode = "dev" | "web:dev" | "web:prod" | "desktop:dev" | "desktop:prod";
export type BuildConfiguration = "Dev" | "Prod";
/** Web: the static site. Desktop: the same site and an Electron shell. Each goes to Binaries/<platform>/<configuration>. */
export type BuildPlatform = "Web" | "Desktop";

/** What the project browser asks of its host: the desktop app (over IPC), or the memory (a browser, tests). */
export interface ProjectsApi {
	List(): Promise<ProjectRow[]>;
	Templates(): Promise<TemplateRow[]>;
	/** Why a name can't be a project's (null: it can). */
	NameProblem(name: string): Promise<string | null>;
	/** Where new projects go unless the player chooses another folder. */
	DefaultLocation(): Promise<string>;
	/** A folder chosen in the system's dialog (null: cancelled). */
	PickFolder(): Promise<string | null>;
	Create(options: { Template: string; Name: string; Location: string; }): Promise<{ File: string; }>;
	/** Forgets a project (its files stay). */
	Remove(file: string): Promise<void>;
	OpenInDesigner(file: string): Promise<void>;
	/** Which run modes a project can use now (a build mode needs that build in Binaries/<platform>/<configuration>). */
	RunModes(file: string): Promise<Record<RunMode, boolean>>;
	/** dev starts the dev server and opens the browser; web:* opens the finished build in the browser, desktop:* in its Electron window. */
	Run(file: string, mode: RunMode): Promise<void>;
	/** Builds into the project's Binaries/<platform>/<configuration>; resolves with that folder. */
	Build(file: string, platform: BuildPlatform, configuration: BuildConfiguration): Promise<{ Directory: string; }>;
}

/** The desktop app's preload puts its API here. */
declare global {
	interface Window { cse?: { projects?: ProjectsApi; }; }
}

const Identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Projects in memory: the project browser in a plain browser (a preview), and its tests. Same naming rules as the engine's. */
export class MemoryProjectsApi implements ProjectsApi {
	public readonly Opened: string[] = [];
	public readonly Ran: { File: string; Mode: RunMode; }[] = [];
	public readonly Built: { File: string; Platform: BuildPlatform; Configuration: BuildConfiguration; }[] = [];
	private readonly _builds = new Set<string>();
	/** What the "system dialog" answers next. */
	public NextFolder: string | null = null;

	public constructor(private readonly _projects: ProjectRow[] = [], private readonly _templates: TemplateRow[] = [], private readonly _location = "/projects") {}

	public async List(): Promise<ProjectRow[]> { return this._projects.map((p) => ({ ...p })); }
	public async Templates(): Promise<TemplateRow[]> { return this._templates.map((t) => ({ ...t })); }
	public async DefaultLocation(): Promise<string> { return this._location; }
	public async PickFolder(): Promise<string | null> { return this.NextFolder; }

	public async NameProblem(name: string): Promise<string | null> {
		if (!Identifier.test(name)) return `"${name}" must start with a letter and hold only letters, digits and _`;
		if (this._projects.some((p) => p.Name === name)) return `There is a project called ${name} already`;
		return null;
	}

	public async Create(options: { Template: string; Name: string; Location: string; }): Promise<{ File: string; }> {
		const problem = await this.NameProblem(options.Name);
		if (problem) throw new Error(problem);
		const template = this._templates.find((t) => t.Name === options.Template);
		if (!template) throw new Error(`There is no template "${options.Template}"`);
		const file = `${options.Location}/${options.Name}/${options.Name}.cseproject`;
		this._projects.unshift({ Name: options.Name, File: file, Template: template.Name, Genre: template.Genre, LastOpened: new Date(0).toISOString(), Exists: true });
		return { File: file };
	}

	public async Remove(file: string): Promise<void> {
		const index = this._projects.findIndex((p) => p.File === file);
		if (index >= 0) this._projects.splice(index, 1);
	}

	public async OpenInDesigner(file: string): Promise<void> { this.Opened.push(file); }

	public async RunModes(file: string): Promise<Record<RunMode, boolean>> {
		const has = (platform: BuildPlatform, configuration: BuildConfiguration): boolean => this._builds.has(`${file}|${platform}|${configuration}`);
		return { "dev": true, "web:dev": has("Web", "Dev"), "web:prod": has("Web", "Prod"), "desktop:dev": has("Desktop", "Dev"), "desktop:prod": has("Desktop", "Prod") };
	}

	public async Run(file: string, mode: RunMode): Promise<void> {
		if (!(await this.RunModes(file))[mode]) throw new Error(`There is no build for ${mode}`);
		this.Ran.push({ File: file, Mode: mode });
	}

	public async Build(file: string, platform: BuildPlatform, configuration: BuildConfiguration): Promise<{ Directory: string; }> {
		this._builds.add(`${file}|${platform}|${configuration}`);
		this.Built.push({ File: file, Platform: platform, Configuration: configuration });
		return { Directory: `${file.slice(0, file.lastIndexOf("/"))}/Binaries/${platform}/${configuration}` };
	}
}
