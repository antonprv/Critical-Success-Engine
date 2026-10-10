// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { CodeHost } from "./Code/CodeSession";
import { reactive } from "vue";
import type { UiManifestEntry } from "@cse/ui";
import type { DesignerController } from "./DesignerController";
import { GenerateGraphScript, GraphClassName } from "./GraphCodegen";

export interface DesignerProject { Name: string; File: string; Documents: UiManifestEntry[]; }

/** What the designer asks of the desktop app about a project (its main process keeps the files). */
export interface DesignerApi {
	Open(file: string): Promise<DesignerProject>;
	Read(file: string, id: string): Promise<string>;
	IdProblem(file: string, id: string): Promise<string | null>;
	Save(file: string, document: { Id: string; Layout: string; Script?: { ClassName: string; Text: string; }; }): Promise<UiManifestEntry[]>;
	/** The project's code (its Source folder), for the code editor. */
	CodeFiles(file: string): Promise<string[]>;
	ReadCode(file: string, path: string): Promise<string>;
	WriteCode(file: string, path: string, text: string): Promise<void>;
}

/** The projects the tools know (the project browser's list), for choosing one. */
export interface KnownProjects {
	List(): Promise<{ Name: string; File: string; Exists: boolean; Template: string; Genre: string; }[]>;
}

/** The desktop app's preload puts its APIs here. */
declare global {
	interface Window { cse?: { designer?: DesignerApi; projects?: KnownProjects; }; }
}

/**
 * The designer on a project (the desktop app): the project's UI documents (its UI manifest) - open one, save it back,
 * add one. Saving writes the layout into the project and, when it has node scripting, the class generated from it.
 */
export class ProjectSession {
	public readonly State = reactive({ Name: "", File: "", Documents: [] as UiManifestEntry[], Current: null as string | null });

	private constructor(private readonly _api: DesignerApi) {}

	/** Opens the project on its first document (none yet: a blank layout, saved once it has an Id). */
	public static async Start(api: DesignerApi, file: string, designer: DesignerController): Promise<ProjectSession> {
		const session = new ProjectSession(api);
		const project = await api.Open(file);
		Object.assign(session.State, { Name: project.Name, File: project.File, Documents: project.Documents });
		const first = project.Documents[0];
		if (first) await session.OpenDocument(first.Id, designer);
		return session;
	}

	/** The project's code (its Source folder) for the code editor, through the desktop app. */
	public Code(): CodeHost {
		const file = this.State.File;
		return {
			Files: () => this._api.CodeFiles(file),
			Read: (path) => this._api.ReadCode(file, path),
			Write: (path, text) => this._api.WriteCode(file, path, text),
		};
	}

	/** Loads a document into the designer; returns null, or why it couldn't. */
	public async OpenDocument(id: string, designer: DesignerController): Promise<string | null> {
		try {
			const problem = designer.Import(await this._api.Read(this.State.File, id));
			if (problem === null) this.State.Current = id;
			return problem;
		} catch (error) {
			return (error as Error).message;
		}
	}

	/** Writes the open document into the project; returns what happened. */
	public async Save(designer: DesignerController): Promise<string> {
		if (this.State.Current === null) return "Name a new document first (Project panel).";
		const layout = designer.Layout;
		const script = (layout.Graph?.Nodes.length ?? 0) > 0 ? { ClassName: GraphClassName(layout), Text: GenerateGraphScript(layout) } : undefined;
		try {
			this.State.Documents = await this._api.Save(this.State.File, { Id: this.State.Current, Layout: designer.Export(), ...(script ? { Script: script } : {}) });
			return `Saved ${this.State.Current} to ${this.State.Name}`;
		} catch (error) {
			return (error as Error).message;
		}
	}

	/** A new document: its Id checked, a blank layout of that name, saved into the project (so it is listed). */
	public async NewDocument(id: string, designer: DesignerController): Promise<string> {
		const problem = await this._api.IdProblem(this.State.File, id);
		if (problem) return problem;
		designer.New(id);
		this.State.Current = id;
		return this.Save(designer);
	}
}
