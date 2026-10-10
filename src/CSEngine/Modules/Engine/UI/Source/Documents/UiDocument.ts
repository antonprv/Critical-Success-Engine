// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { reactive } from "vue";
import type { ButtonController } from "../Controls/ButtonController";
import { CancelableEvent, EventHub } from "../Core/EventHub";
import { DialogResult } from "./DialogResult";
import type { DialogService } from "./Dialogs";
import { GraphRunner } from "./Graph";
import type { LayoutNode, UiLayout } from "./Layout";
import type { UiScript, UiScriptRegistry } from "./UiScript";
import { BuiltInWidgets, WidgetType, type WidgetRegistry } from "./Widgets";

export interface UiDocumentOptions {
	/** Scripts the layout may name. */
	Scripts?: UiScriptRegistry;
	/** Widget types the layout uses (built-ins by default). */
	Widgets?: WidgetRegistry;
	/** Where ShowDialog / MessageBox calls of this UI's script put their modals. */
	Dialogs?: DialogService;
}

export interface UiWidget {
	Node: LayoutNode;
	/** The live control, or null for widgets without behaviour (canvas, label, image, group box). */
	Controller: object | null;
}

/** WinForms' FormClosingEvent: the result the form is closing with; Cancel() keeps it open. */
export class FormClosingEvent extends CancelableEvent {
	public constructor(public readonly Result: DialogResult) {
		super();
	}
}

/**
 * One validation run (WinForms' ValidateChildren): which container is checked, what triggered it, data validators can
 * share, and the errors they found.
 */
export class ValidationContext {
	public readonly Errors: { Widget: string; Message: string; }[] = [];

	public constructor(
		/** The container whose widgets are validated. */
		public readonly Container: string,
		/** The button that started it, or null when started from code. */
		public readonly Trigger: string | null,
		/** Anything validators want to share: limits, lookups, results of earlier checks. */
		public readonly Data: Record<string, unknown> = {},
	) {}

	public get IsValid(): boolean { return this.Errors.length === 0; }

	public Error(widget: string, message: string): void {
		this.Errors.push({ Widget: widget, Message: message });
	}

	/** Fails the whole run with a message that belongs to no single widget. */
	public Cancel(message: string): void {
		this.Error("", message);
	}

	public ErrorsFor(widget: string): string[] {
		return this.Errors.filter((error) => error.Widget === widget).map((error) => error.Message);
	}
}

export type Validator = (context: ValidationContext, widget: UiWidget) => void;

export type UiDocumentEvents = {
	"widget-event": [name: string, event: string, args: unknown[]];
	validated: [context: ValidationContext];
	closing: [event: FormClosingEvent];
	closed: [result: DialogResult];
};

type Subscribable = { Events: EventHub<Record<string, unknown[]>>; };

/** Events the document adds to every widget: focus (WinForms Enter/Leave) and the result of a validating button. */
const DocumentEvents = new Set(["enter", "leave", "validated"]);

let NextDocumentId = 1;

/**
 * A UI layout brought to life: a controller for every widget, found by name, the layout's script running, and the form
 * behaviour of WinForms (lifecycle, focus events, validation, dialog results, accept and cancel buttons).
 */
export class UiDocument {
	public readonly Events = new EventHub<UiDocumentEvents>();
	/** Unique per document: views key on it, so a rebuilt document gets fresh components (they bind their controller once). */
	public readonly Id = NextDocumentId++;
	/** Set when the layout names a script the registry doesn't have. */
	public readonly MissingScript: string | null = null;
	public readonly Widgets: WidgetRegistry;
	public readonly Scripts: UiScriptRegistry | null;
	public readonly Dialogs: DialogService | null;

	private readonly _widgets = new Map<string, UiWidget>();
	private readonly _parents = new Map<string, string>();
	private readonly _subscriptions: (() => void)[] = [];
	private readonly _validators = new Map<string, Validator[]>();
	private readonly _errors = reactive(new Map<string, string>());
	private readonly _validClick = new Map<string, boolean>();
	private readonly _script: UiScript | null = null;
	private _shown = false;
	private _result: DialogResult | null = null;
	private readonly _graph: GraphRunner | null = null;

	public constructor(public readonly Layout: UiLayout, options: UiDocumentOptions = {}) {
		this.Widgets = options.Widgets ?? BuiltInWidgets;
		this.Scripts = options.Scripts ?? null;
		this.Dialogs = options.Dialogs ?? null;
		this.Build(Layout.Root, null);

		if (Layout.Script) {
			this._script = options.Scripts?.Create(Layout.Script) ?? null;
			if (this._script) this._script.Attach(this);
			else this.MissingScript = Layout.Script;
		}
		// The node graph runs after the script's own handlers; a button's DialogResult closes the form after both.
		if (Layout.Graph) this._graph = new GraphRunner(this, Layout.Graph);
		this.WireDialogResults(Layout.Root);
	}

	public get Script(): UiScript | null { return this._script; }
	public get Closed(): boolean { return this._result !== null; }
	/** How the form was closed; null while it is open. */
	public get Result(): DialogResult | null { return this._result; }

	public Find(name: string): UiWidget | undefined {
		return this._widgets.get(name);
	}

	public Controller<T>(name: string): T {
		const widget = this._widgets.get(name);
		if (!widget) throw new Error(`No widget named "${name}".`);
		if (!widget.Controller) throw new Error(`"${name}" (${widget.Node.Type}) has no controller.`);
		return widget.Controller as T;
	}

	/** Subscribes to an event of a named widget (its controller's events, or enter / leave / validated); returns the unsubscribe function. */
	public On(name: string, event: string, handler: (...args: unknown[]) => void): () => void {
		const controller = this.Controller<Subscribable>(name);
		if (!DocumentEvents.has(event)) return controller.Events.On(event, handler);
		return this.Events.On("widget-event", (widget, fired, args) => {
			if (widget === name && fired === event) handler(...args);
		});
	}

	//#region lifecycle

	/** Called by the view once it is on screen: runs the script's OnShown, once. */
	public NotifyShown(): void {
		if (this._shown) return;
		this._shown = true;
		this._script?.OnShown();
	}

	/** Closes the form with a result, unless OnClosing (or a "closing" subscriber) cancels. Returns whether it closed. */
	public Close(result: DialogResult = DialogResult.Cancel): boolean {
		if (this.Closed) return false;
		const closing = new FormClosingEvent(result);
		this._script?.OnClosing(closing);
		this.Events.Emit("closing", closing);
		if (closing.Canceled) return false;
		this._result = result;
		this._script?.OnClosed(result);
		this.Events.Emit("closed", result);
		return true;
	}

	/** Ends the script (OnDestruct, OnDisposed) and stops reporting widget events. */
	public Dispose(): void {
		this._script?.Detach();
		this._graph?.Dispose();
		for (const off of this._subscriptions.splice(0)) off();
	}

	//#endregion

	//#region validation

	/** Adds a validator to a widget; returns the function that removes it. */
	public Validate(name: string, validator: Validator): () => void {
		if (!this._widgets.has(name)) throw new Error(`No widget named "${name}".`);
		const list = this._validators.get(name) ?? [];
		list.push(validator);
		this._validators.set(name, list);
		return () => {
			const index = list.indexOf(validator);
			if (index >= 0) list.splice(index, 1);
		};
	}

	/**
	 * Validates every widget inside a container (WinForms' ValidateChildren): the script's OnValidating prepares the
	 * context, each widget's validators run in tree order, then OnValidated. Errors are shown on the widgets.
	 */
	public ValidateChildren(container: string = this.Layout.Root.Name, data: Record<string, unknown> = {}, trigger: string | null = null): ValidationContext {
		const context = new ValidationContext(container, trigger, { ...data });
		const inside = this.Descendants(container);
		this._script?.OnValidating(context);
		for (const name of inside) {
			for (const validator of this._validators.get(name) ?? []) validator(context, this._widgets.get(name)!);
		}
		this._script?.OnValidated(context);

		for (const name of inside) this._errors.delete(name);
		for (const error of context.Errors) {
			if (inside.includes(error.Widget) && !this._errors.has(error.Widget)) this._errors.set(error.Widget, error.Message);
		}
		this.Events.Emit("validated", context);
		return context;
	}

	/** The first error the last validation found on a widget, or null. */
	public ErrorOf(name: string): string | null {
		return this._errors.get(name) ?? null;
	}

	//#endregion

	/** Enter and Escape inside a window: its AcceptButton / CancelButton (Escape with none closes the form with Cancel). */
	public DialogKey(window: string, code: string): boolean {
		const props = this._widgets.get(window)!.Node.Props;
		const button = code === "Enter" ? props["AcceptButton"] : code === "Escape" ? props["CancelButton"] : undefined;
		if (button === undefined) return false;
		const target = this._widgets.get(button as string)?.Controller as ButtonController | undefined;
		if (target) target.PerformClick();
		else if (code === "Escape") this.Close(DialogResult.Cancel);
		return target !== undefined || code === "Escape";
	}

	private Descendants(container: string): string[] {
		const out: string[] = [];
		const walk = (node: LayoutNode): void => {
			for (const child of node.Children ?? []) {
				out.push(child.Name);
				walk(child);
			}
		};
		walk(this._widgets.get(container)!.Node);
		return out;
	}

	private Build(node: LayoutNode, parent: LayoutNode | null): void {
		const definition = this.Widgets.Get(node.Type)!;
		const controller = definition.CreateController?.(node) ?? null;
		this._widgets.set(node.Name, { Node: node, Controller: controller });
		if (parent) this._parents.set(node.Name, parent.Name);

		const report = (event: string, args: unknown[]): void => this.Events.Emit("widget-event", node.Name, event, args);
		for (const event of definition.Events) {
			this._subscriptions.push((controller as Subscribable).Events.On(event, (...args) => report(event, args)));
		}
		if (controller) {
			this._subscriptions.push((controller as Subscribable).Events.On("focus-change", (focused) => report(focused ? "enter" : "leave", [])));
		}
		if (node.Type === WidgetType.Button && node.Props["CausesValidation"]) {
			// Validation runs before the click handlers: they can read the outcome from the "validated" event.
			this._subscriptions.push((controller as Subscribable).Events.On("click", () => {
				const context = this.ValidateChildren(parent!.Name, {}, node.Name);
				this._validClick.set(node.Name, context.IsValid);
				report("validated", [context]);
			}));
		}
		if (node.Type === WidgetType.Window && parent === this.Layout.Root) {
			// The close box of a top-level window closes the form, with Cancel.
			this._subscriptions.push((controller as Subscribable).Events.On("closing", (event) => {
				if (!this.Close(DialogResult.Cancel)) (event as CancelableEvent).Cancel();
			}));
		}
		for (const child of node.Children ?? []) this.Build(child, node);
	}

	private WireDialogResults(node: LayoutNode): void {
		const result = node.Props["DialogResult"] as DialogResult | undefined;
		if (node.Type === WidgetType.Button && result !== DialogResult.None) {
			this._subscriptions.push((this._widgets.get(node.Name)!.Controller as Subscribable).Events.On("click", () => {
				if (node.Props["CausesValidation"] && !this._validClick.get(node.Name)) return;
				this.Close(result);
			}));
		}
		for (const child of node.Children ?? []) this.WireDialogResults(child);
	}
}
