// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ParseProject } from "../../../../Core/Source/Engine/Projects/ProjectDescriptor.ts";
import { ParseUiManifest, SerializeUiManifest, UpsertManifestEntry, type UiManifest, type UiManifestEntry } from "../../../../Modules/Engine/UI/Source/Documents/UiManifest.ts";

/** A project as the UI designer sees it: its name and the UI documents its manifest lists. */
export interface DesignerProject {
	Name: string;
	File: string;
	Documents: UiManifestEntry[];
}

/** A document to save: its layout file, and the UiScript class generated from its node graph (when it has one). */
export interface DocumentToSave {
	Id: string;
	Layout: string;
	Script?: { ClassName: string; Text: string; };
}

const Identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The layout as it is kept on disk (indented), after checking it is one. */
function Readable(text: string): string {
	let layout: unknown;
	try {
		layout = JSON.parse(text);
	} catch {
		throw new Error("Not a layout: not JSON");
	}
	const root = (layout as { Root?: unknown; } | null)?.Root;
	if (typeof layout !== "object" || Array.isArray(layout) || typeof root !== "object" || root === null) throw new Error("Not a layout: it has no Root");
	return `${JSON.stringify(layout, null, 2)}\n`;
}

/**
 * The UI designer's work on a project's files, in the main process: reading the project's UI manifest and documents,
 * and saving a document into the project (its .ui.json next to the manifest, the generated script in Source/UI) with
 * its manifest entry. Nothing is read or written outside the project's folder.
 */
export class DesignerService {
	public Open(projectFile: string): DesignerProject {
		const { project } = this.Project(projectFile);
		return { Name: project.Name, File: projectFile, Documents: this.Manifest(projectFile).manifest.Documents };
	}

	public Read(projectFile: string, id: string): string {
		const { manifest, folder } = this.Manifest(projectFile);
		const entry = manifest.Documents.find((d) => d.Id === id);
		if (!entry) throw new Error(`The project has no UI document "${id}"`);
		return readFileSync(this.Inside(projectFile, join(folder, entry.Path)), "utf8");
	}

	/** Why a new document can't have this Id (null: it can). */
	public IdProblem(projectFile: string, id: string): string | null {
		if (!Identifier.test(id)) return `"${id}" must start with a letter and hold only letters, digits and _`;
		return this.Manifest(projectFile).manifest.Documents.some((d) => d.Id === id) ? `There is a document called "${id}" already` : null;
	}

	/**
	 * Saves the document (a new one gets <Id>.ui.json next to the manifest, kept readable) and lists it in the manifest;
	 * returns the manifest's documents. A layout that isn't one is refused before anything is written.
	 */
	public Save(projectFile: string, document: DocumentToSave): UiManifestEntry[] {
		const layout = Readable(document.Layout);
		const { manifest, file, folder } = this.Manifest(projectFile);
		const existing = manifest.Documents.find((d) => d.Id === document.Id);
		if (!existing) {
			const problem = this.IdProblem(projectFile, document.Id);
			if (problem) throw new Error(problem);
		}
		const entry: UiManifestEntry = existing ?? { Id: document.Id, Path: `${document.Id}.ui.json`, Script: "" };
		this.Write(projectFile, join(folder, entry.Path), layout);
		if (document.Script) {
			if (!Identifier.test(document.Script.ClassName)) throw new Error(`"${document.Script.ClassName}" is not a class name`);
			this.Write(projectFile, join(dirname(projectFile), "Source", "UI", `${document.Script.ClassName}.ts`), document.Script.Text);
		}
		const saved = UpsertManifestEntry(manifest, entry);
		this.Write(projectFile, file, SerializeUiManifest(saved));
		return saved.Documents;
	}

	//#region the project's code (the code editor)

	/** Every file under the project's Source folder, as paths from the project's folder ("Source/..."). */
	public CodeFiles(projectFile: string): string[] {
		const source = join(dirname(projectFile), "Source");
		if (!existsSync(source)) return [];
		return readdirSync(source, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => relative(dirname(projectFile), join(entry.parentPath, entry.name)).split(sep).join("/"))
			.sort();
	}

	public ReadCode(projectFile: string, path: string): string {
		const file = this.InSource(projectFile, path);
		if (!existsSync(file)) throw new Error(`There is no ${path}`);
		return readFileSync(file, "utf8");
	}

	public WriteCode(projectFile: string, path: string, text: string): void {
		this.Write(projectFile, this.InSource(projectFile, path), text);
	}

	/** The path, if it is inside the project's Source folder (the code editor reaches nothing else). */
	private InSource(projectFile: string, path: string): string {
		const target = resolve(dirname(projectFile), path);
		const way = relative(resolve(dirname(projectFile), "Source"), target);
		if (way === "" || way === ".." || way.startsWith(`..${sep}`) || isAbsolute(way)) throw new Error(`${path} is not in the project's Source folder`);
		return target;
	}

	//#endregion

	private Project(projectFile: string) {
		return { project: ParseProject(readFileSync(projectFile, "utf8")) };
	}

	/** The project's UI manifest (none yet: an empty one, written on the first save). */
	private Manifest(projectFile: string): { manifest: UiManifest; file: string; folder: string; } {
		const { project } = this.Project(projectFile);
		const file = this.Inside(projectFile, join(dirname(projectFile), project.Ui.Manifest));
		const manifest = existsSync(file) ? ParseUiManifest(readFileSync(file, "utf8")) : { FileVersion: 1, Documents: [] };
		return { manifest, file, folder: dirname(file) };
	}

	private Write(projectFile: string, path: string, text: string): void {
		const target = this.Inside(projectFile, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, text);
	}

	/** The path, if it stays inside the project's folder. */
	private Inside(projectFile: string, path: string): string {
		const target = resolve(path);
		const way = relative(resolve(dirname(projectFile)), target);
		// Up and out of the folder, or on another drive (Windows): not the project's.
		if (way === ".." || way.startsWith(`..${sep}`) || isAbsolute(way)) throw new Error(`${path} is outside the project`);
		return target;
	}
}
