// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { markRaw, reactive } from "vue";
import { EventHub } from "../Core/EventHub";
import type { DialogResult } from "./DialogResult";
import { DialogService } from "./Dialogs";
import { ParseLayout, type UiLayout } from "./Layout";
import type { UiManifest } from "./UiManifest";
import { UiDocument } from "./UiDocument";
import type { UiScriptRegistry } from "./UiScript";
import type { WidgetRegistry } from "./Widgets";

export interface UiManagerOptions {
	Manifest: UiManifest;
	/** Reads a document file (a path from the manifest) as text: fetch, a bundler glob, the file system. */
	Load: (path: string) => Promise<string>;
	Scripts?: UiScriptRegistry;
	Widgets?: WidgetRegistry;
	/** Where modal documents go; the manager makes its own when none is given. */
	Dialogs?: DialogService;
}

export interface ShownDocument { Id: string; Document: UiDocument; }

export type UiManagerEvents = { shown: [id: string, document: UiDocument]; hidden: [id: string]; };

/**
 * What a game's scripts use to show its UI: documents by their manifest Id, loaded on first use. WinUiHost draws what
 * is shown.
 *
 *   await ui.Show("Hud");     ui.Hide("PauseMenu");     const result = await ui.ShowDialog("ConfirmQuit");
 */
export class UiManager {
	public readonly Events = new EventHub<UiManagerEvents>();
	public readonly Dialogs: DialogService;
	/** What is on screen, oldest first (WinUiHost draws newer ones on top). */
	public readonly Shown: ShownDocument[] = reactive([]);

	private readonly _layouts = new Map<string, UiLayout>();
	private readonly _showing = new Map<string, Promise<UiDocument>>();

	public constructor(private readonly _options: UiManagerOptions) {
		this.Dialogs = _options.Dialogs ?? new DialogService();
	}

	public get Ids(): string[] {
		return this._options.Manifest.Documents.map((d) => d.Id);
	}

	public IsShown(id: string): boolean {
		return this.Shown.some((s) => s.Id === id);
	}

	public Get(id: string): UiDocument | null {
		return this.Shown.find((s) => s.Id === id)?.Document ?? null;
	}

	/** Shows a document (loading it the first time); if it is shown already, returns it. */
	public Show(id: string): Promise<UiDocument> {
		const shown = this.Get(id);
		if (shown) return Promise.resolve(shown);
		const pending = this._showing.get(id);
		if (pending) return pending;
		const showing = this.Load(id).then((layout) => {
			// The document itself stays plain (its controllers are reactive already): Get returns the very object Show did.
			const document = markRaw(new UiDocument(layout, this.DocumentOptions()));
			// A document that closes itself (a button's DialogResult, its close box) leaves the screen.
			document.Events.On("closed", () => this.Hide(id));
			this.Shown.push({ Id: id, Document: document });
			this.Events.Emit("shown", id, document);
			return document;
		}).finally(() => this._showing.delete(id));
		this._showing.set(id, showing);
		return showing;
	}

	public Hide(id: string): boolean {
		const index = this.Shown.findIndex((s) => s.Id === id);
		if (index < 0) return false;
		const [entry] = this.Shown.splice(index, 1);
		entry!.Document.Dispose();
		this.Events.Emit("hidden", id);
		return true;
	}

	/** Shows the document if it is hidden, hides it if it is shown; returns whether it is shown now. */
	public async Toggle(id: string): Promise<boolean> {
		if (this.Hide(id)) return false;
		await this.Show(id);
		return true;
	}

	public HideAll(): void {
		for (const entry of [...this.Shown]) this.Hide(entry.Id);
	}

	/** Shows a document as a modal dialog; resolves with how it was closed. */
	public async ShowDialog(id: string): Promise<DialogResult> {
		return this.Dialogs.ShowDialog(await this.Load(id), this.DocumentOptions());
	}

	private DocumentOptions() {
		const { Scripts, Widgets } = this._options;
		return { Dialogs: this.Dialogs, ...(Scripts ? { Scripts } : {}), ...(Widgets ? { Widgets } : {}) };
	}

	private async Load(id: string): Promise<UiLayout> {
		const cached = this._layouts.get(id);
		if (cached) return cached;
		const entry = this._options.Manifest.Documents.find((d) => d.Id === id);
		if (!entry) throw new Error(`No UI document "${id}" in the manifest`);
		let layout: UiLayout;
		try {
			layout = ParseLayout(await this._options.Load(entry.Path), this._options.Widgets);
		} catch (error) {
			throw new Error(`UI document "${id}" (${entry.Path}): ${(error as Error).message}`);
		}
		if (entry.Script) layout.Script = entry.Script;
		this._layouts.set(id, layout);
		return layout;
	}
}
