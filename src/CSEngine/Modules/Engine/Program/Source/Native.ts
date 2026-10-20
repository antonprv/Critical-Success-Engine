// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ProjectFilesApi } from "@cse/solution";

/**
 * What a program's window may ask of its main process (the preload puts it on window.cseProgram): the command line,
 * the system's open and save dialogs, the files they picked, the window's title, quitting. A page never gets the file
 * system itself: only the files the user picked in a dialog (or that the program was started with) can be read and
 * written. In a plain browser (the dev server without Electron) BrowserNative stands in.
 */

export interface FileFilter {
	Name: string;
	/** Without the dot: ["cstables"]. */
	Extensions: string[];
}

export interface OpenOptions {
	Title?: string;
	Filters?: FileFilter[];
	Multiple?: boolean;
	/** A folder instead of files. */
	Folder?: boolean;
}

export interface SaveOptions {
	Title?: string;
	Filters?: FileFilter[];
	/** The name (or path) the dialog starts with. */
	DefaultPath?: string;
}

export interface ProgramNative {
	/** The command line after the program itself (flags included). */
	Args(): Promise<string[]>;
	/** The files given on the command line, a double-clicked file included (absolute paths). */
	StartFiles(): Promise<string[]>;
	/** Files picked in the system's dialog (empty: cancelled). */
	OpenDialog(options?: OpenOptions): Promise<string[]>;
	/** Where to save, picked in the system's dialog (null: cancelled). */
	SaveDialog(options?: SaveOptions): Promise<string | null>;
	/** Reads a file the user picked (or the program was started with). */
	ReadText(path: string): Promise<string>;
	/** Writes a file the user picked to save to (atomically: a crash leaves the old one whole). */
	WriteText(path: string, text: string): Promise<void>;
	SetTitle(title: string): Promise<void>;
	/**
	 * The project a file belongs to: the nearest folder above it holding a .cseproject (null: none). The folder is then
	 * granted, as one picked in a dialog is.
	 */
	ProjectOf(file: string): Promise<string | null>;
	/**
	 * The granted folders' files (a folder picked with OpenDialog({ Folder: true }), a ProjectOf folder), by the folder
	 * and paths inside it: what Solution Explorer's model works on (BridgeFileSystem).
	 */
	Files: ProjectFilesApi;
	/** Files handed over by a second launch (a file double-clicked while the program runs); returns the way to stop. */
	OnOpenFiles(listener: (files: string[]) => void): () => void;
	Quit(code?: number): Promise<void>;
}

declare global {
	interface Window { cseProgram?: ProgramNative; }
}

/**
 * The browser's stand-in: no command line, dialogs that pick nothing, files kept in memory by name, the tab's title,
 * a close of the tab. Enough to run and see a program's forms in the dev server.
 */
export class BrowserNative implements ProgramNative {
	private readonly _files = new Map<string, string>();

	public constructor(private readonly _window: Pick<Window, "close"> & { document: { title: string; }; } = window) {}

	public async Args(): Promise<string[]> { return []; }
	public async StartFiles(): Promise<string[]> { return []; }
	public async OpenDialog(): Promise<string[]> { return []; }
	public async SaveDialog(): Promise<string | null> { return null; }

	public async ReadText(path: string): Promise<string> {
		const text = this._files.get(path);
		if (text === undefined) throw new Error(`There is no ${path} in this browser`);
		return text;
	}

	public async WriteText(path: string, text: string): Promise<void> {
		this._files.set(path, text);
	}

	public async SetTitle(title: string): Promise<void> {
		this._window.document.title = title;
	}

	public OnOpenFiles(): () => void {
		return () => undefined;
	}

	public async ProjectOf(): Promise<string | null> { return null; }

	/** No folders in a browser: every call says so. */
	public readonly Files: ProjectFilesApi = BrowserFolders;

	public async Quit(): Promise<void> {
		this._window.close();
	}
}

const NoFolders = async (): Promise<never> => {
	throw new Error("A browser has no folders: open the program in its desktop window");
};

const BrowserFolders: ProjectFilesApi = {
	List: NoFolders, CreateFolder: NoFolders, Move: NoFolders, Copy: NoFolders, Delete: NoFolders, ReadText: NoFolders, WriteText: NoFolders,
	Watch: () => () => undefined,
};

/** The window's native side: the desktop app's preload, else the browser's stand-in. */
export function NativeOf(target: Pick<Window, "cseProgram"> = window): ProgramNative {
	return target.cseProgram ?? new BrowserNative();
}
