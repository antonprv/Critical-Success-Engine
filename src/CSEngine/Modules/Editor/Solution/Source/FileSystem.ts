// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { IsWithin, NameOf, ParentOf, Rebase } from "./Paths";

/** A file or folder of a project, by its path inside the project (see Paths). */
export interface FileEntry {
	Path: string;
	Folder: boolean;
}

/**
 * The project's files as the solution sees them: one project folder, paths inside it. The desktop app gives the real
 * disk (NodeFileSystem, in its main process, reached over IPC); tests and the browser give MemoryFileSystem. Every
 * method refuses paths that leave the project.
 */
export interface ProjectFileSystem {
	/** Every file and folder under the project's folder (not the folder itself). */
	List(): Promise<FileEntry[]>;
	CreateFolder(path: string): Promise<void>;
	/** Moves or renames a file or folder; the target must not exist. */
	Move(from: string, to: string): Promise<void>;
	/** Copies a file or a folder with everything in it; the target must not exist. */
	Copy(from: string, to: string): Promise<void>;
	/** Deletes a file or a folder with everything in it (the desktop app: to the recycle bin). */
	Delete(path: string): Promise<void>;
	ReadText(path: string): Promise<string | null>;
	WriteText(path: string, text: string): Promise<void>;
	/** Calls `changed` (coalesced) when anything under the folder changes from outside; returns the way to stop. */
	Watch(changed: () => void): () => void;
}

/** Files in memory: the tests, and the designer in a browser without the desktop app. */
export class MemoryFileSystem implements ProjectFileSystem {
	private readonly _folders = new Set<string>();
	private readonly _files = new Map<string, string>();
	private readonly _watchers = new Set<() => void>();

	/** Files (path → text) and folders (paths ending in "/") to start with; the folders of every path are made too. */
	public constructor(entries: Record<string, string> = {}) {
		for (const [path, text] of Object.entries(entries)) {
			if (path.endsWith("/")) this.AddFolders(path.slice(0, -1));
			else {
				this.AddFolders(ParentOf(path));
				this._files.set(path, text);
			}
		}
	}

	public async List(): Promise<FileEntry[]> {
		return [...[...this._folders].map((path) => ({ Path: path, Folder: true })), ...[...this._files.keys()].map((path) => ({ Path: path, Folder: false }))];
	}

	public async CreateFolder(path: string): Promise<void> {
		this.Free(path);
		this.Need(ParentOf(path));
		this._folders.add(path);
	}

	public async Move(from: string, to: string): Promise<void> {
		this.Exists(from);
		this.Free(to);
		this.Need(ParentOf(to));
		if (this._folders.has(from) && IsWithin(to, from)) throw new Error(`Can't move ${from} into itself`);
		for (const folder of [...this._folders].filter((f) => IsWithin(f, from))) {
			this._folders.delete(folder);
			this._folders.add(Rebase(folder, from, to));
		}
		for (const [path, text] of [...this._files].filter(([f]) => IsWithin(f, from))) {
			this._files.delete(path);
			this._files.set(Rebase(path, from, to), text);
		}
	}

	public async Copy(from: string, to: string): Promise<void> {
		this.Exists(from);
		this.Free(to);
		this.Need(ParentOf(to));
		if (this._folders.has(from) && IsWithin(to, from)) throw new Error(`Can't copy ${from} into itself`);
		for (const folder of [...this._folders].filter((f) => IsWithin(f, from))) this._folders.add(Rebase(folder, from, to));
		for (const [path, text] of [...this._files].filter(([f]) => IsWithin(f, from))) this._files.set(Rebase(path, from, to), text);
	}

	public async Delete(path: string): Promise<void> {
		this.Exists(path);
		for (const folder of [...this._folders].filter((f) => IsWithin(f, path))) this._folders.delete(folder);
		for (const file of [...this._files.keys()].filter((f) => IsWithin(f, path))) this._files.delete(file);
	}

	public async ReadText(path: string): Promise<string | null> {
		return this._files.get(path) ?? null;
	}

	public async WriteText(path: string, text: string): Promise<void> {
		if (this._folders.has(path)) throw new Error(`${path} is a folder`);
		this.AddFolders(ParentOf(path));
		this._files.set(path, text);
	}

	public Watch(changed: () => void): () => void {
		this._watchers.add(changed);
		return () => this._watchers.delete(changed);
	}

	/** Stands in for a change made outside the tools (another program): changes the files, then tells the watchers. */
	public External(change: (files: this) => void): void {
		change(this);
		for (const watcher of this._watchers) watcher();
	}

	/** Synchronous edits for External. */
	public Put(path: string, text = ""): void {
		this.AddFolders(ParentOf(path));
		this._files.set(path, text);
	}

	public Remove(path: string): void {
		for (const folder of [...this._folders].filter((f) => IsWithin(f, path))) this._folders.delete(folder);
		for (const file of [...this._files.keys()].filter((f) => IsWithin(f, path))) this._files.delete(file);
	}

	private AddFolders(path: string): void {
		for (let folder = path; folder !== ""; folder = ParentOf(folder)) this._folders.add(folder);
	}

	private Has(path: string): boolean {
		return this._folders.has(path) || this._files.has(path);
	}

	private Exists(path: string): void {
		if (!this.Has(path)) throw new Error(`There is no ${path}`);
	}

	private Free(path: string): void {
		if (path === "" || this.Has(path)) throw new Error(`${path === "" ? "The project folder" : NameOf(path)} exists already`);
	}

	private Need(folder: string): void {
		if (folder !== "" && !this._folders.has(folder)) throw new Error(`There is no folder ${folder}`);
	}
}

/** A name for a copy next to the original that isn't taken: "Name - Copy.ext", "Name - Copy (2).ext"... */
export function CopyName(name: string, taken: (name: string) => boolean): string {
	const dot = name.indexOf(".", 1);
	const stem = dot < 0 ? name : name.slice(0, dot);
	const extension = dot < 0 ? "" : name.slice(dot);
	for (let n = 1; ; n++) {
		const candidate = `${stem} - Copy${n === 1 ? "" : ` (${n})`}${extension}`;
		if (!taken(candidate)) return candidate;
	}
}
