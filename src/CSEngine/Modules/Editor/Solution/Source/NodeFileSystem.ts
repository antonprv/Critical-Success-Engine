// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { watch, type FSWatcher } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { FileEntry, ProjectFileSystem } from "./FileSystem";
import { Normalize } from "./Paths";

export interface NodeFileSystemOptions {
	/** Deletes into the recycle bin (Electron's shell.trashItem); without it a delete is final. */
	Trash?: (absolutePath: string) => Promise<void>;
	/** How long the watcher waits for more changes before telling (ms). */
	Settle?: number;
	/** Folders never listed or watched (by name, anywhere): what tools and builds make. */
	Skip?: readonly string[];
	/** Stands in for node:fs's watch (the tests). */
	Watcher?: (root: string, listener: (event: string, name: string | null) => void) => Pick<FSWatcher, "close" | "on">;
}

export const DefaultSkip: readonly string[] = ["node_modules", ".git", "bin", "obj", "Binaries", "coverage", "dist"];

/** A project folder on the real disk (the desktop app's main process). */
export class NodeFileSystem implements ProjectFileSystem {
	private readonly _root: string;
	private readonly _skip: Set<string>;

	public constructor(root: string, private readonly _options: NodeFileSystemOptions = {}) {
		this._root = resolve(root);
		this._skip = new Set(_options.Skip ?? DefaultSkip);
	}

	public async List(): Promise<FileEntry[]> {
		const out: FileEntry[] = [];
		const walk = async (folder: string): Promise<void> => {
			for (const entry of await readdir(folder, { withFileTypes: true })) {
				if (entry.isDirectory() && this._skip.has(entry.name)) continue;
				const absolute = join(folder, entry.name);
				const path = relative(this._root, absolute).split(sep).join("/");
				if (entry.isDirectory()) {
					out.push({ Path: path, Folder: true });
					await walk(absolute);
				} else out.push({ Path: path, Folder: false });
			}
		};
		await walk(this._root);
		return out;
	}

	public async CreateFolder(path: string): Promise<void> {
		const target = await this.Free(path);
		await mkdir(target);
	}

	public async Move(from: string, to: string): Promise<void> {
		const source = this.Inside(from);
		const target = await this.Free(to);
		await rename(source, target);
	}

	public async Copy(from: string, to: string): Promise<void> {
		const source = this.Inside(from);
		const target = await this.Free(to);
		await cp(source, target, { recursive: true, errorOnExist: true, force: false });
	}

	public async Delete(path: string): Promise<void> {
		const target = this.Inside(path);
		if (target === this._root) throw new Error("The project folder can't be deleted");
		await stat(target);
		if (this._options.Trash) await this._options.Trash(target);
		else await rm(target, { recursive: true });
	}

	public async ReadText(path: string): Promise<string | null> {
		try {
			return await readFile(this.Inside(path), "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	}

	public async WriteText(path: string, text: string): Promise<void> {
		const target = this.Inside(path);
		await mkdir(dirname(target), { recursive: true });
		// Written next to it and moved over it: a crash mid-write leaves the old file whole.
		const temporary = `${target}.${process.pid}.tmp`;
		await writeFile(temporary, text);
		await rename(temporary, target);
	}

	public Watch(changed: () => void): () => void {
		let timer: ReturnType<typeof setTimeout> | null = null;
		const settle = this._options.Settle ?? 100;
		const start = this._options.Watcher ?? ((root, listener) => watch(root, { recursive: true }, listener));
		const watcher = start(this._root, (_event, name) => {
			const path = name === null ? "" : Normalize(name);
			if (path.split("/").some((part) => this._skip.has(part)) || path.endsWith(".tmp")) return;
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				changed();
			}, settle);
		});
		watcher.on("error", () => watcher.close());
		return () => {
			if (timer !== null) clearTimeout(timer);
			watcher.close();
		};
	}

	/** The absolute path, if it stays inside the project's folder. */
	private Inside(path: string): string {
		const target = resolve(this._root, Normalize(path));
		const way = relative(this._root, target);
		if (way === ".." || way.startsWith(`..${sep}`) || isAbsolute(way)) throw new Error(`${path} is outside the project`);
		return target;
	}

	/** The absolute path of a new item: inside, not there yet (bar a case-only rename of itself), its folder there. */
	private async Free(path: string): Promise<string> {
		const target = this.Inside(path);
		if (target === this._root) throw new Error("The project folder exists already");
		await stat(dirname(target));
		const siblings = await readdir(dirname(target));
		const name = target.slice(dirname(target).length + 1);
		if (siblings.includes(name)) throw new Error(`${name} exists already`);
		return target;
	}
}
