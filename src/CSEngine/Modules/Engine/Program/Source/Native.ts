// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

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

	public async Quit(): Promise<void> {
		this._window.close();
	}
}

/** The window's native side: the desktop app's preload, else the browser's stand-in. */
export function NativeOf(target: Pick<Window, "cseProgram"> = window): ProgramNative {
	return target.cseProgram ?? new BrowserNative();
}
