// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { FileEntry } from "../../../../Modules/Editor/Solution/Source/FileSystem.ts";
import { NodeFileSystem } from "../../../../Modules/Editor/Solution/Source/NodeFileSystem.ts";

export interface SolutionServiceOptions {
	/** Deletes into the recycle bin (shell.trashItem). */
	Trash?: (absolutePath: string) => Promise<void>;
	/** How long the watchers wait for changes to settle (ms). */
	Settle?: number;
}

/**
 * Solution Explorer's files, in the main process: a project's folder (the folder of its .cseproject) on the real
 * disk, for the tools' pages (UIDesigner, the table editor, the project browser), which keep their solution model
 * themselves. Every path is inside the project; watchers are counted so a page's last one stops the folder's.
 */
export class SolutionService {
	private readonly _systems = new Map<string, NodeFileSystem>();
	private readonly _watches = new Map<number, () => void>();
	private _next = 1;

	public constructor(private readonly _options: SolutionServiceOptions = {}) {}

	public List(project: string): Promise<FileEntry[]> { return this.Files(project).List(); }
	public CreateFolder(project: string, path: string): Promise<void> { return this.Files(project).CreateFolder(path); }
	public Move(project: string, from: string, to: string): Promise<void> { return this.Files(project).Move(from, to); }
	public Copy(project: string, from: string, to: string): Promise<void> { return this.Files(project).Copy(from, to); }
	public Delete(project: string, path: string): Promise<void> { return this.Files(project).Delete(path); }
	public ReadText(project: string, path: string): Promise<string | null> { return this.Files(project).ReadText(path); }
	public WriteText(project: string, path: string, text: string): Promise<void> { return this.Files(project).WriteText(path, text); }

	/** Watches the project's folder for `changed`; returns the watch's id, for Unwatch. */
	public Watch(project: string, changed: () => void): number {
		const id = this._next++;
		this._watches.set(id, this.Files(project).Watch(changed));
		return id;
	}

	public Unwatch(id: number): void {
		this._watches.get(id)?.();
		this._watches.delete(id);
	}

	/** Stops every watch (the app quits). */
	public Dispose(): void {
		for (const id of [...this._watches.keys()]) this.Unwatch(id);
	}

	private Files(project: string): NodeFileSystem {
		if (!project.endsWith(".cseproject") || !existsSync(project)) throw new Error(`${project} is not a project`);
		let files = this._systems.get(project);
		if (!files) {
			files = new NodeFileSystem(dirname(project), { ...(this._options.Trash ? { Trash: this._options.Trash } : {}), ...(this._options.Settle === undefined ? {} : { Settle: this._options.Settle }) });
			this._systems.set(project, files);
		}
		return files;
	}
}
