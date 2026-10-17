// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ControlBase } from "../Core/ControlBase";
import { Actions } from "../Documents/Graph";
import type { UiDocument } from "../Documents/UiDocument";
import type { UiManager } from "../Documents/UiManager";
import { UiChannel, type UiChannels, type UiCommand } from "./GameUi";
import { Task } from "@cse/task";
import type { JsonValue } from "../Documents/Json";
import { GetQuasarServices } from "../Quasar/QuasarServices";

type Listen = { id: string; widget: string; event: string; };

/** Only what can cross to another thread: anything else (a function, a class with methods) travels as text. */
function Portable(value: unknown): unknown {
	try {
		structuredClone(value);
		return value;
	} catch {
		return String(value);
	}
}

/** A change of a widget (or a variable): the same key twice means the second replaces the first. */
function ChangeKey(command: UiCommand): string | null {
	switch (command.op) {
		case "set-text": case "set-visible": case "set-enabled": case "set-value": case "set-items":
			return `${command.op}\u0000${command.id}\u0000${command.widget}`;
		case "set-prop":
			return `${command.op}\u0000${command.id}\u0000${command.widget}\u0000${command.key}`;
		case "set-variable":
			return `${command.op}\u0000${command.id}\u0000${command.name}`;
		default:
			return null;
	}
}

/**
 * The UI plugin's page side: runs the game's commands on the UI documents, in order (a Show and the SetText right after
 * it work, though loading is asynchronous), and sends the events the game listens to back.
 *
 * Changes of widgets are applied once per display frame, the last of each winning: a game running far above the
 * display's rate (no frame limit) would otherwise redo the page's work hundreds of times a second for nothing. A
 * change still happens before any show, hide or listen that came after it.
 */
export class UiHostBridge {
	private _queue: Task = Task.CompletedTask;
	private readonly _changes = new Map<string, UiCommand>();
	private _frameRequested = false;
	private readonly _listens: Listen[] = [];
	private readonly _subscriptions: (() => void)[] = [];
	private _disposed = false;

	public constructor(private readonly _manager: UiManager, private readonly _channels: UiChannels) {
		this._subscriptions.push(_channels.On(UiChannel, (payload) => this.Receive(payload as UiCommand)));
		this._subscriptions.push(_manager.Events.On("shown", (id, document) => {
			for (const listen of this._listens) if (listen.id === id) this.Attach(listen, document);
		}));
	}

	public Dispose(): void {
		this._disposed = true;
		for (const off of this._subscriptions.splice(0)) off();
	}

	private Receive(command: UiCommand): void {
		const key = ChangeKey(command);
		if (key === null) {
			this.FlushChanges();
			this.Enqueue(command);
			return;
		}
		this._changes.delete(key); // re-added at the end: the order of different changes is kept
		this._changes.set(key, command);
		if (!this._frameRequested) {
			this._frameRequested = true;
			requestAnimationFrame(() => this.FlushChanges());
		}
	}

	private FlushChanges(): void {
		this._frameRequested = false;
		for (const change of this._changes.values()) this.Enqueue(change);
		this._changes.clear();
	}

	private Enqueue(command: UiCommand): void {
		this._queue = this._queue.then(() => this.Run(command).catch((error: Error) => {
			this._channels.Post(UiChannel, { op: "error", message: error.message });
		}));
	}

	private async Run(command: UiCommand): Promise<void> {
		if (this._disposed) return;
		switch (command.op) {
			case "show": await this._manager.Show(command.id); break;
			case "hide": this._manager.Hide(command.id); break;
			case "toggle": await this._manager.Toggle(command.id); break;
			case "set-text": Actions.SetText(this.Shown(command.id), command.widget, command.text); break;
			case "set-visible": this.Shown(command.id).Controller<ControlBase>(command.widget).SetVisible(command.visible); break;
			case "set-enabled": this.Shown(command.id).Controller<ControlBase>(command.widget).SetEnabled(command.enabled); break;
			case "set-value": {
				const control = this.Shown(command.id).Controller<{ SetValue?: (value: JsonValue) => void; }>(command.widget);
				if (!control.SetValue) throw new Error(`Widget "${command.widget}" has no value`);
				control.SetValue(command.value);
				break;
			}
			case "set-items": {
				const control = this.Shown(command.id).Controller<{ SetItems?: (items: JsonValue[]) => void; Row?: unknown; }>(command.widget);
				if (!control.SetItems) throw new Error(`Widget "${command.widget}" has no items`);
				// A Quasar widget takes the items as they are; a toolkit list box, as rows of text.
				control.SetItems(control.Row ? command.items : command.items.map((text) => ({ text: String(text) })));
				break;
			}
			case "set-prop": {
				const control = this.Shown(command.id).Controller<{ SetProp?: (key: string, value: JsonValue) => void; Props?: Record<string, JsonValue>; }>(command.widget);
				if (!control.SetProp) throw new Error(`Widget "${command.widget}" has no props to set (only Quasar's widgets have)`);
				if (command.value === null) delete control.Props![command.key];
				else control.SetProp(command.key, command.value);
				break;
			}
			case "notify": await GetQuasarServices().Notify(command.options); break;
			case "dialog": case "bottom-sheet": {
				// Not awaited: the game's other commands go on while the dialog is open.
				const services = GetQuasarServices();
				const ask = command.op === "dialog" ? services.Dialog(command.options) : services.BottomSheet(command.options).then((data) => ({ Ok: data !== null, Data: data }));
				void ask.then((outcome) => this._channels.Post(UiChannel, { op: "reply", request: command.request, ok: outcome.Ok, data: outcome.Data }));
				break;
			}
			case "loading": await (command.show ? GetQuasarServices().ShowLoading(command.options) : GetQuasarServices().HideLoading()); break;
			case "loading-bar": await GetQuasarServices().LoadingBar(command.action, command.amount); break;
			case "fullscreen": await GetQuasarServices().ToggleFullscreen(); break;
			case "set-variable": this._manager.SetVariable(command.id, command.name, command.value); break;
			case "listen": {
				const listen = { id: command.id, widget: command.widget, event: command.event };
				this._listens.push(listen);
				const shown = this._manager.Get(command.id);
				if (shown) this.Attach(listen, shown);
				break;
			}
		}
	}

	private Shown(id: string): UiDocument {
		const document = this._manager.Get(id);
		if (!document) throw new Error(`UI document "${id}" is not shown`);
		return document;
	}

	private Attach(listen: Listen, document: UiDocument): void {
		document.On(listen.widget, listen.event, (...args) => {
			this._channels.Post(UiChannel, { op: "event", ...listen, args: args.map(Portable) });
		});
	}
}
