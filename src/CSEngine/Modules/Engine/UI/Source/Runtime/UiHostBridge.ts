// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ControlBase } from "../Core/ControlBase";
import { Actions } from "../Documents/Graph";
import type { UiDocument } from "../Documents/UiDocument";
import type { UiManager } from "../Documents/UiManager";
import { UiChannel, type UiChannels, type UiCommand } from "./GameUi";

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

/**
 * The UI plugin's page side: runs the game's commands on the UI documents, in order (a Show and the SetText right after
 * it work, though loading is asynchronous), and sends the events the game listens to back.
 */
export class UiHostBridge {
	private _queue: Promise<void> = Promise.resolve();
	private readonly _listens: Listen[] = [];
	private readonly _subscriptions: (() => void)[] = [];
	private _disposed = false;

	public constructor(private readonly _manager: UiManager, private readonly _channels: UiChannels) {
		this._subscriptions.push(_channels.On(UiChannel, (payload) => this.Enqueue(payload as UiCommand)));
		this._subscriptions.push(_manager.Events.On("shown", (id, document) => {
			for (const listen of this._listens) if (listen.id === id) this.Attach(listen, document);
		}));
	}

	public Dispose(): void {
		this._disposed = true;
		for (const off of this._subscriptions.splice(0)) off();
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
				const control = this.Shown(command.id).Controller<{ SetValue?: (value: number) => void; }>(command.widget);
				if (!control.SetValue) throw new Error(`Widget "${command.widget}" has no value`);
				control.SetValue(command.value);
				break;
			}
			case "set-items": {
				const control = this.Shown(command.id).Controller<{ SetItems?: (items: { text: string; }[]) => void; }>(command.widget);
				if (!control.SetItems) throw new Error(`Widget "${command.widget}" has no items`);
				control.SetItems(command.items.map((text) => ({ text })));
				break;
			}
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
