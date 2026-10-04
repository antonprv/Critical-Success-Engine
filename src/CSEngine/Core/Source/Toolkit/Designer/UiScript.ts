// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { MessageBoxButtons, MessageBoxIcon, MessageBoxResult } from "../Controls/MessageBoxController";
import type { DialogResult } from "./DialogResult";
import type { DialogService } from "./Dialogs";
import type { UiLayout } from "./Layout";
import type { FormClosingEvent, UiDocument, UiDocumentOptions, ValidationContext, Validator } from "./UiDocument";

/**
 * The behaviour of a UI made in the designer (UMG: the widget blueprint's graph; WinForms: the form's code-behind).
 * Subclass it, register it under a name, and set that name as the layout's Script. Widgets are reached by the names
 * they have in the designer. Override the hooks you need:
 *
 *   OnConstruct / OnLoad   the widgets exist (UMG NativeConstruct, WinForms Load)
 *   OnShown                the UI is on screen for the first time
 *   OnValidating / OnValidated   around a validation run (prepare the context; add form-level errors)
 *   OnClosing / OnClosed   the form is closing (cancelable) / closed, with its DialogResult
 *   OnDestruct / OnDisposed   the UI goes away
 */
export abstract class UiScript {
	private _document: UiDocument | null = null;
	private readonly _subscriptions: (() => void)[] = [];

	public OnConstruct(): void { /* hook */ }
	public OnLoad(): void { /* hook */ }
	public OnShown(): void { /* hook */ }
	public OnValidating(_context: ValidationContext): void { /* hook */ }
	public OnValidated(_context: ValidationContext): void { /* hook */ }
	public OnClosing(_event: FormClosingEvent): void { /* hook */ }
	public OnClosed(_result: DialogResult): void { /* hook */ }
	public OnDestruct(): void { /* hook */ }
	public OnDisposed(): void { /* hook */ }

	protected get Document(): UiDocument { return this._document!; }

	/** The controller of the widget with this name (throws if there is none). */
	protected Widget<T>(name: string): T {
		return this.Document.Controller<T>(name);
	}

	/** Subscribes to an event of a named widget for as long as the script lives (controller events, enter, leave, validated). */
	protected On(name: string, event: string, handler: (...args: unknown[]) => void): void {
		this._subscriptions.push(this.Document.On(name, event, handler));
	}

	/** Adds a validator to a widget for as long as the script lives. */
	protected Validate(name: string, validator: Validator): void {
		this._subscriptions.push(this.Document.Validate(name, validator));
	}

	/** Shows another layout as a modal dialog; resolves with its DialogResult. */
	protected ShowDialog(layout: UiLayout, options: UiDocumentOptions = {}): Promise<DialogResult> {
		// A script only exists in a document that was given a script registry: nested dialogs use the same one.
		return this.Service().ShowDialog(layout, { Scripts: this.Document.Scripts!, Widgets: this.Document.Widgets, ...options });
	}

	/** Shows a message box; resolves with the button chosen. */
	protected MessageBox(text: string, title?: string, buttons?: MessageBoxButtons, icon?: MessageBoxIcon): Promise<MessageBoxResult> {
		return this.Service().MessageBox(text, title, buttons, icon);
	}

	private Service(): DialogService {
		const dialogs = this.Document.Dialogs;
		if (!dialogs) throw new Error("This UI has no dialog service: create its UiDocument with { Dialogs }");
		return dialogs;
	}

	/** Used by UiDocument. */
	public Attach(document: UiDocument): void {
		this._document = document;
		this.OnConstruct();
		this.OnLoad();
	}

	/** Used by UiDocument. */
	public Detach(): void {
		this.OnDestruct();
		this.OnDisposed();
		for (const off of this._subscriptions.splice(0)) off();
	}
}

/** Script classes by name: layouts refer to their script by this name. */
export class UiScriptRegistry {
	private readonly _scripts = new Map<string, new () => UiScript>();

	public get Names(): string[] { return [...this._scripts.keys()]; }

	public Register(name: string, script: new () => UiScript): this {
		if (this._scripts.has(name)) throw new Error(`A UI script named "${name}" is already registered.`);
		this._scripts.set(name, script);
		return this;
	}

	public Create(name: string): UiScript | null {
		const script = this._scripts.get(name);
		return script ? new script() : null;
	}
}
