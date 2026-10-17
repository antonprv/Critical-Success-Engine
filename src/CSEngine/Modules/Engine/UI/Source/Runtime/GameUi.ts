// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Task, TaskCompletionSource } from "@cse/task";
import { EventHub } from "../Core/EventHub";
import type { GraphValue } from "../Documents/Graph";
import type { JsonValue } from "../Documents/Json";
import type { DialogOutcome, QuasarOptions } from "../Quasar/QuasarServices";

/**
 * The UI plugin's game-thread side: what game scripts call to show the project's UI documents and to hear from them.
 * The documents live on the page (UiHostBridge); this posts commands over the "ui" channel and receives events back.
 */

export const UiChannel = "ui";

export type UiCommand =
	| { op: "show" | "hide" | "toggle"; id: string; }
	| { op: "set-text"; id: string; widget: string; text: string; }
	| { op: "set-visible"; id: string; widget: string; visible: boolean; }
	| { op: "set-enabled"; id: string; widget: string; enabled: boolean; }
	| { op: "set-value"; id: string; widget: string; value: JsonValue; }
	| { op: "set-items"; id: string; widget: string; items: JsonValue[]; }
	| { op: "set-prop"; id: string; widget: string; key: string; value: JsonValue | null; }
	| { op: "notify"; options: QuasarOptions; }
	| { op: "dialog" | "bottom-sheet"; request: number; options: QuasarOptions; }
	| { op: "loading"; show: boolean; options: QuasarOptions; }
	| { op: "loading-bar"; action: "start" | "stop" | "increment"; amount?: number; }
	| { op: "fullscreen"; }
	| { op: "set-variable"; id: string; name: string; value: GraphValue; }
	| { op: "listen"; id: string; widget: string; event: string; };

export type UiReport =
	| { op: "event"; id: string; widget: string; event: string; args: unknown[]; }
	| { op: "reply"; request: number; ok: boolean; data: JsonValue; }
	| { op: "error"; message: string; };

/** What a thread's channels offer (the engine's ChannelHub). */
export interface UiChannels {
	Post(channel: string, payload: unknown): void;
	On(channel: string, handler: (payload: unknown) => void): () => void;
}

const Key = (id: string, widget: string, event: string): string => `${id}\u0000${widget}\u0000${event}`;

export class GameUi {
	/** "error": what the page could not do (an unknown document or widget). */
	public readonly Events = new EventHub<{ error: [message: string]; }>();
	private readonly _handlers = new Map<string, Set<(...args: unknown[]) => void>>();
	private readonly _variables = new Map<string, GraphValue>();
	private readonly _replies = new Map<number, TaskCompletionSource<DialogOutcome>>();
	private _nextRequest = 1;

	public constructor(private readonly _channels: UiChannels) {
		_channels.On(UiChannel, (payload) => this.Receive(payload as UiReport));
	}

	/** Shows a UI document by its manifest Id. */
	public Show(id: string): void { this.Post({ op: "show", id }); }
	public Hide(id: string): void { this.Post({ op: "hide", id }); }
	public Toggle(id: string): void { this.Post({ op: "toggle", id }); }
	/** A widget's text: a label's, a button's, a text box's value, a window's title, a status bar's first panel. */
	public SetText(id: string, widget: string, text: string): void { this.Post({ op: "set-text", id, widget, text }); }
	public SetVisible(id: string, widget: string, visible: boolean): void { this.Post({ op: "set-visible", id, widget, visible }); }
	public SetEnabled(id: string, widget: string, enabled: boolean): void { this.Post({ op: "set-enabled", id, widget, enabled }); }
	/**
	 * A widget's value: a progress bar's, slider's or spinner's number (a progress bar runs 0..100 unless its document
	 * says otherwise); a Quasar widget's model (a toggle's flag, an input's text, a select's option...).
	 */
	public SetValue(id: string, widget: string, value: JsonValue): void { this.Post({ op: "set-value", id, widget, value }); }
	/** A list box's items; a Quasar widget's list (a select's options, a table's rows, a tree's nodes). */
	public SetItems(id: string, widget: string, items: JsonValue[]): void { this.Post({ op: "set-items", id, widget, items }); }
	/** A prop of a Quasar widget (its colour, its label, a table's columns...); null takes it off. */
	public SetProp(id: string, widget: string, key: string, value: JsonValue | null): void { this.Post({ op: "set-prop", id, widget, key, value }); }

	//#region Quasar's services: on the page, over the game

	/** A notification: a text, or Quasar's Notify options (type, caption, position, timeout...). */
	public Notify(options: QuasarOptions): void { this.Post({ op: "notify", options }); }
	/** A dialog (Quasar's Dialog: alert, confirm, prompt, options): completes with OK and its data, or with cancel. */
	public Dialog(options: QuasarOptions): Task<DialogOutcome> { return this.Ask("dialog", options); }
	/** A bottom sheet of actions (Quasar's BottomSheet): completes with OK and the action picked, or with cancel. */
	public BottomSheet(options: QuasarOptions): Task<DialogOutcome> { return this.Ask("bottom-sheet", options); }
	/** The page-wide loading screen, with Quasar's Loading options (a message, a spinner colour...). */
	public ShowLoading(options: QuasarOptions = {}): void { this.Post({ op: "loading", show: true, options }); }
	public HideLoading(): void { this.Post({ op: "loading", show: false, options: {} }); }
	/** The loading bar at the page's edge. */
	public LoadingBar(action: "start" | "stop" | "increment", amount?: number): void { this.Post(amount === undefined ? { op: "loading-bar", action } : { op: "loading-bar", action, amount }); }
	/** The page full screen, or back (a browser asks for a click before: call it from a click's handler). */
	public ToggleFullscreen(): void { this.Post({ op: "fullscreen" }); }

	private Ask(op: "dialog" | "bottom-sheet", options: QuasarOptions): Task<DialogOutcome> {
		const request = this._nextRequest++;
		const reply = new TaskCompletionSource<DialogOutcome>();
		this._replies.set(request, reply);
		this.Post({ op, request, options });
		return reply.Task;
	}

	//#endregion

	/**
	 * A variable of a document (its node graph reads and tests it): how a component hands its parameters to the UI.
	 * Sent only when the value changes, so a component may set it every frame; kept by the page while the document is hidden.
	 */
	public SetVariable(id: string, name: string, value: GraphValue): void {
		const key = Key(id, name, "");
		if (this._variables.get(key) === value) return;
		this._variables.set(key, value);
		this.Post({ op: "set-variable", id, name, value });
	}

	/** Hears a widget's event (click, change...) whenever the document is on screen; returns the unsubscribe function. */
	public On(id: string, widget: string, event: string, handler: (...args: unknown[]) => void): () => void {
		const key = Key(id, widget, event);
		let handlers = this._handlers.get(key);
		if (!handlers) {
			handlers = new Set();
			this._handlers.set(key, handlers);
			this.Post({ op: "listen", id, widget, event });
		}
		handlers.add(handler);
		return () => handlers.delete(handler);
	}

	private Post(command: UiCommand): void {
		this._channels.Post(UiChannel, command);
	}

	private Receive(report: UiReport): void {
		if (report.op === "error") {
			this.Events.Emit("error", report.message);
			return;
		}
		if (report.op === "reply") {
			const reply = this._replies.get(report.request);
			this._replies.delete(report.request);
			reply?.TrySetResult({ Ok: report.ok, Data: report.data });
			return;
		}
		for (const handler of [...(this._handlers.get(Key(report.id, report.widget, report.event)) ?? [])]) handler(...report.args);
	}
}
