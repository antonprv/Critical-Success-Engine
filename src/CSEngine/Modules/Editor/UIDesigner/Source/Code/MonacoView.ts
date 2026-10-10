// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { watch, type WatchStopHandle } from "vue";
import type * as Monaco from "monaco-editor";
import type { CodeSession } from "./CodeSession";

/**
 * A CodeSession shown in Monaco: a model for every code file of the project (so the language service sees the whole
 * project: its own imports resolve), the active tab's model in the editor, and every edit told to the session. A closed
 * tab's model goes back to the file's saved text (a file outside the project's list is freed). Monaco is passed in (the
 * real one in the browser, a stand-in in tests).
 */
export class MonacoView {
	private readonly _editor: Monaco.editor.IStandaloneCodeEditor;
	private readonly _models = new Map<string, Monaco.editor.ITextModel>();
	/** Each project file's text as saved: a closed tab's model goes back to it. */
	private readonly _saved = new Map<string, string>();
	/** Done loading the project's files into the language service. */
	public readonly Loaded: Promise<void>;
	private readonly _stop: WatchStopHandle;

	public constructor(private readonly _monaco: typeof Monaco, element: HTMLElement, private readonly _session: CodeSession, dark = false) {
		this._editor = _monaco.editor.create(element, { model: null, automaticLayout: true, fontSize: 13, minimap: { enabled: false }, theme: dark ? "vs-dark" : "vs" });
		this._stop = watch(() => [_session.State.Active, _session.State.Tabs.map((tab) => tab.Path).join("\n")], () => this.Show(), { immediate: true });
		this.Loaded = this.LoadProject();
	}

	/** The project's TypeScript and JavaScript files, as models the language service sees (not shown until opened). */
	private async LoadProject(): Promise<void> {
		for (const [path, text] of Object.entries(await this._session.ReadAll())) {
			if (!/\.(ts|tsx|js)$/.test(path) || this._models.has(path)) continue;
			this._saved.set(path, text);
			this.Make(path, text, this._session.Tab(path)?.Language ?? (path.endsWith(".js") ? "javascript" : "typescript"));
		}
		// Check again what is shown: its errors were worked out before the rest of the project was there.
		const defaults = this._monaco.typescript?.typescriptDefaults;
		defaults?.setDiagnosticsOptions(defaults.getDiagnosticsOptions());
	}

	public get Editor(): Monaco.editor.IStandaloneCodeEditor { return this._editor; }

	public SetDark(dark: boolean): void {
		this._monaco.editor.setTheme(dark ? "vs-dark" : "vs");
	}

	public Dispose(): void {
		this._stop();
		for (const model of this._models.values()) model.dispose();
		this._models.clear();
		this._editor.dispose();
	}

	private Show(): void {
		for (const tab of this._session.State.Tabs) this._saved.set(tab.Path, tab.Saved);
		const open = new Set(this._session.State.Tabs.map((tab) => tab.Path));
		const project = new Set(this._session.State.Files);
		for (const [path, model] of this._models) {
			if (open.has(path)) continue;
			if (project.has(path)) {
				// Closed: what the language service sees is the file again, not edits that were let go.
				const saved = this._saved.get(path)!;
				if (model.getValue() !== saved) model.setValue(saved);
				continue;
			}
			model.dispose();
			this._models.delete(path);
		}
		const active = this._session.State.Active;
		this._editor.setModel(active === null ? null : this.Model(active));
	}

	private Model(path: string): Monaco.editor.ITextModel {
		const existing = this._models.get(path);
		if (existing) return existing;
		const tab = this._session.Tab(path)!;
		return this.Make(path, tab.Text, tab.Language);
	}

	private Make(path: string, text: string, language: string): Monaco.editor.ITextModel {
		const model = this._monaco.editor.createModel(text, language, this._monaco.Uri.parse(`file:///${path}`));
		model.onDidChangeContent(() => this._session.Edit(path, model.getValue()));
		this._models.set(path, model);
		return model;
	}
}
