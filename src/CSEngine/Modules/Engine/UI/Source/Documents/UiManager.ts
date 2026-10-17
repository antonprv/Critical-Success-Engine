// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { markRaw, reactive } from "vue";
import { EventHub } from "../Core/EventHub";
import type { DialogResult } from "./DialogResult";
import type { GraphValue } from "./Graph";
import { DialogService } from "./Dialogs";
import { ParseLayout, type UiLayout } from "./Layout";
import type { UiManifest } from "./UiManifest";
import { UiDocument, type UiNavigator } from "./UiDocument";
import type { UiScriptRegistry } from "./UiScript";
import type { WidgetRegistry } from "./Widgets";
import { Task } from "@cse/task";

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
	private readonly _showing = new Map<string, Task<UiDocument>>();
	private readonly _variables = new Map<string, Record<string, GraphValue>>();
	/** The screens an app went through (Navigate), the current one last. */
	private readonly _history: string[] = reactive([]);

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
	public Show(id: string): Task<UiDocument> {
		const shown = this.Get(id);
		if (shown) return Task.FromResult(shown);
		const pending = this._showing.get(id);
		if (pending) return pending;
		const showing = Task.From(this.Load(id)).then((layout) => {
			// The document itself stays plain (its controllers are reactive already): Get returns the very object Show did.
			const document = markRaw(new UiDocument(layout, { ...this.DocumentOptions(), Variables: this.Variables(id) }));
			// A document that closes itself (a button's DialogResult, its close box) leaves the screen.
			document.Events.On("closed", () => this.Hide(id));
			this.Shown.push({ Id: id, Document: document });
			this.Events.Emit("shown", id, document);
			return document;
		}).finally(() => this._showing.delete(id));
		this._showing.set(id, showing);
		return showing;
	}

	/** The variables the game set for a document (what it starts with when it shows). */
	public Variables(id: string): Readonly<Record<string, GraphValue>> {
		return this._variables.get(id) ?? {};
	}

	/** Sets a document's variable: kept for when it shows, and put on it now when it is shown. */
	public SetVariable(id: string, name: string, value: GraphValue): void {
		this._variables.set(id, { ...this.Variables(id), [name]: value });
		this.Get(id)?.SetVariable(name, value);
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

	//#region navigation (an app's screens)

	/** The screens navigated through, the current one last. */
	public get History(): readonly string[] { return this._history; }

	/**
	 * Goes to another screen: the current one (the last navigated to) hides, this one shows and is remembered. Moves
	 * between screens happen one after another, in the order asked (a graph's "go there, then back" does both).
	 */
	public Navigate(id: string): Promise<UiDocument> {
		return this.InTurn(async () => {
			const current = this._history.at(-1);
			if (current === id) return this.Show(id);
			const document = await this.Show(id);
			if (current !== undefined) this.Hide(current);
			this._history.push(id);
			return document;
		});
	}

	/** Back to the screen before; false when there is none. */
	public Back(): Promise<boolean> {
		return this.InTurn(async () => {
			if (this._history.length < 2) return false;
			const current = this._history.pop()!;
			await this.Show(this._history.at(-1)!);
			this.Hide(current);
			return true;
		});
	}

	private _turn: Promise<unknown> = Promise.resolve();

	private InTurn<T>(move: () => Promise<T>): Promise<T> {
		const next = this._turn.then(move);
		this._turn = next.catch(() => undefined);
		return next;
	}

	//#endregion

	/** Shows a document as a modal dialog; resolves with how it was closed. */
	public async ShowDialog(id: string): Promise<DialogResult> {
		return this.Dialogs.ShowDialog(await this.Load(id), this.DocumentOptions());
	}

	private DocumentOptions() {
		const { Scripts, Widgets } = this._options;
		return { Dialogs: this.Dialogs, Navigator: this as UiNavigator, ...(Scripts ? { Scripts } : {}), ...(Widgets ? { Widgets } : {}) };
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
