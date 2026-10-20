// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { FileEntry, ProjectFileSystem } from "./FileSystem";

/**
 * The project file calls the desktop app's preload offers its pages (window.cse.solution): every one names the
 * project by its .cseproject, the main process keeps the disk.
 */
export interface ProjectFilesApi {
	List(project: string): Promise<FileEntry[]>;
	CreateFolder(project: string, path: string): Promise<void>;
	Move(project: string, from: string, to: string): Promise<void>;
	Copy(project: string, from: string, to: string): Promise<void>;
	Delete(project: string, path: string): Promise<void>;
	ReadText(project: string, path: string): Promise<string | null>;
	WriteText(project: string, path: string, text: string): Promise<void>;
	/** Calls `changed` when the project's folder changes; returns the way to stop. */
	Watch(project: string, changed: () => void): () => void;
}

/** A project's files in a page of the desktop app, through its preload. */
export class BridgeFileSystem implements ProjectFileSystem {
	public constructor(private readonly _api: ProjectFilesApi, private readonly _project: string) {}

	public List(): Promise<FileEntry[]> { return this._api.List(this._project); }
	public CreateFolder(path: string): Promise<void> { return this._api.CreateFolder(this._project, path); }
	public Move(from: string, to: string): Promise<void> { return this._api.Move(this._project, from, to); }
	public Copy(from: string, to: string): Promise<void> { return this._api.Copy(this._project, from, to); }
	public Delete(path: string): Promise<void> { return this._api.Delete(this._project, path); }
	public ReadText(path: string): Promise<string | null> { return this._api.ReadText(this._project, path); }
	public WriteText(path: string, text: string): Promise<void> { return this._api.WriteText(this._project, path, text); }
	public Watch(changed: () => void): () => void { return this._api.Watch(this._project, changed); }
}
