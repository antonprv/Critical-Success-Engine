// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CreateProject, FindProject, ListProjects, ListTemplates, ProjectNameProblem, UnregisterProject } from "../../../../Core/BuildTools/Projects.ts";

export interface ProjectRow { Name: string; File: string; Template: string; Genre: string; LastOpened: string; Exists: boolean; }
export interface TemplateRow { Name: string; Title: string; Description: string; Genre: string; }

/** The project browser's work in the desktop app: the engine's project registry and templates (Core/BuildTools/Projects). */
export class ProjectsService {
	public constructor(private readonly _options: { Registry: string; TemplatesDirectory: string; Home?: string; }) {}

	public List(): ProjectRow[] {
		return ListProjects(this._options.Registry).map((p) => ({ Name: p.Name, File: p.File, Template: p.Template, Genre: p.Genre, LastOpened: p.LastOpened, Exists: p.Exists }));
	}

	public Templates(): TemplateRow[] {
		return ListTemplates(this._options.TemplatesDirectory).map((t) => ({ Name: t.Name, Title: t.Title, Description: t.Description, Genre: t.Genre }));
	}

	/** Why a name can't be a new project's: the engine's naming rules, and a project of that name already known. */
	public NameProblem(name: string): string | null {
		return ProjectNameProblem(name) ?? (FindProject(this._options.Registry, name) ? `There is a project called ${name} already` : null);
	}

	/** Where new projects go unless the player chooses another folder. */
	public DefaultLocation(): string {
		return join(this._options.Home ?? homedir(), "CSE Projects");
	}

	public Create(options: { Template: string; Name: string; Location: string; }): { File: string; } {
		const { File } = CreateProject({ ...options, TemplatesDirectory: this._options.TemplatesDirectory, Registry: this._options.Registry });
		return { File };
	}

	/** Forgets a project (its files stay). */
	public Remove(file: string): void {
		UnregisterProject(this._options.Registry, file);
	}

	public Exists(file: string): boolean { return existsSync(file); }
}
