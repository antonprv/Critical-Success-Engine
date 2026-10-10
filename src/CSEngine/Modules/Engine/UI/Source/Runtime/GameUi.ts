// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EventHub } from "../Core/EventHub";

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
	| { op: "set-value"; id: string; widget: string; value: number; }
	| { op: "set-items"; id: string; widget: string; items: string[]; }
	| { op: "listen"; id: string; widget: string; event: string; };

export type UiReport =
	| { op: "event"; id: string; widget: string; event: string; args: unknown[]; }
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
	/** A progress bar's, slider's or spinner's value (a progress bar runs 0..100 unless its document says otherwise). */
	public SetValue(id: string, widget: string, value: number): void { this.Post({ op: "set-value", id, widget, value }); }
	/** A list box's items. */
	public SetItems(id: string, widget: string, items: string[]): void { this.Post({ op: "set-items", id, widget, items }); }

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
		for (const handler of [...(this._handlers.get(Key(report.id, report.widget, report.event)) ?? [])]) handler(...report.args);
	}
}
