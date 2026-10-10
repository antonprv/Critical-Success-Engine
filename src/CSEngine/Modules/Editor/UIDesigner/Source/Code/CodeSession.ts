// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { reactive } from "vue";

/** Where the code editor's files live: the project's Source folder (the desktop app), or memory (a browser, tests). */
export interface CodeHost {
	/** Every code file, as paths from the project's folder ("Source/..."). */
	Files(): Promise<string[]>;
	Read(path: string): Promise<string>;
	Write(path: string, text: string): Promise<void>;
}

/** Files in memory: the designer in a plain browser (a preview), and tests. */
export class MemoryCodeHost implements CodeHost {
	private readonly _files: Map<string, string>;

	public constructor(files: Record<string, string> = {}) {
		this._files = new Map(Object.entries(files));
	}

	public async Files(): Promise<string[]> { return [...this._files.keys()].sort(); }

	public async Read(path: string): Promise<string> {
		const text = this._files.get(path);
		if (text === undefined) throw new Error(`There is no ${path}`);
		return text;
	}

	public async Write(path: string, text: string): Promise<void> { this._files.set(path, text); }
}

/** The editor's language for a file (Monaco's names). */
export function LanguageOf(path: string): string {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return ({ ts: "typescript", tsx: "typescript", js: "javascript", json: "json", md: "markdown", css: "css" } as Record<string, string>)[extension] ?? "plaintext";
}

export interface CodeTab {
	Path: string;
	Language: string;
	/** What the editor shows now. */
	Text: string;
	/** What the file holds (as last read or saved). */
	Saved: string;
	Changed: boolean;
}

/**
 * The code editor's state, apart from whatever draws it: the project's code files, the tabs open on them (which one is
 * active, which are changed) and saving through the host. Nothing changed is lost by closing without being asked.
 */
export class CodeSession {
	public readonly State = reactive({ Files: [] as string[], Tabs: [] as CodeTab[], Active: null as string | null });

	public constructor(private readonly _host: CodeHost) {}

	public async Refresh(): Promise<void> {
		this.State.Files = await this._host.Files();
	}

	/** Every code file's text, for the editor's language service to see the whole project (one that can't be read is left out). */
	public async ReadAll(): Promise<Record<string, string>> {
		const texts = await Promise.all(this.State.Files.map(async (path) => [path, await this._host.Read(path).catch(() => null)] as const));
		return Object.fromEntries(texts.filter(([, text]) => text !== null)) as Record<string, string>;
	}

	public Tab(path: string): CodeTab | undefined {
		return this.State.Tabs.find((tab) => tab.Path === path);
	}

	/** Opens the file in a tab (or makes its tab active); says what went wrong, if anything. */
	public async Open(path: string): Promise<string | null> {
		if (!this.Tab(path)) {
			let text: string;
			try {
				text = await this._host.Read(path);
			} catch (error) {
				return `Could not open ${path}: ${(error as Error).message}`;
			}
			this.State.Tabs.push({ Path: path, Language: LanguageOf(path), Text: text, Saved: text, Changed: false });
		}
		this.State.Active = path;
		return null;
	}

	public Activate(path: string): void {
		if (this.Tab(path)) this.State.Active = path;
	}

	/** The editor's text changed. */
	public Edit(path: string, text: string): void {
		const tab = this.Tab(path);
		if (!tab) return;
		tab.Text = text;
		tab.Changed = text !== tab.Saved;
	}

	/** Saves the active tab; returns what to tell the player. */
	public async Save(): Promise<string> {
		const tab = this.State.Active === null ? undefined : this.Tab(this.State.Active);
		if (!tab) return "No file is open";
		if (!tab.Changed) return `${tab.Path} has no changes`;
		const text = tab.Text;
		try {
			await this._host.Write(tab.Path, text);
		} catch (error) {
			return `Could not save ${tab.Path}: ${(error as Error).message}`;
		}
		tab.Saved = text;
		tab.Changed = tab.Text !== text;
		return `Saved ${tab.Path}`;
	}

	/** Closes a tab; a changed one only when confirmed. Returns whether it closed. */
	public Close(path: string, confirmed = false): boolean {
		const index = this.State.Tabs.findIndex((tab) => tab.Path === path);
		if (index < 0 || (this.State.Tabs[index]!.Changed && !confirmed)) return false;
		this.State.Tabs.splice(index, 1);
		if (this.State.Active === path) this.State.Active = (this.State.Tabs[index] ?? this.State.Tabs[index - 1])?.Path ?? null;
		return true;
	}
}
