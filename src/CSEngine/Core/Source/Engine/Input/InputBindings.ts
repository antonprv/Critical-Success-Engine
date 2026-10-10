// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SettingsStorage } from "../Storage/SettingsStorage";
import type { InputService } from "../Services/InputService";
import { TouchKindOf, type ActionBinding, type BindingSlot, type InputSystem, type TouchKind } from "./InputActions";

/**
 * The game side of the controls screen: on the "input" plugin channel it tells the page the manifest in use, its action
 * maps and their bindings, and applies the player's rebinding - kept at once in the SettingsStorage (key "Input").
 */

export const InputChannel = "input";

type FromPage =
	| { op: "request"; }
	| { op: "rebind"; map: string; action: string; slot: BindingSlot; code: string; }
	| { op: "reset"; map?: string; action?: string; }
	| { op: "touch"; action: string; value: number; }
	| { op: "touch-layout"; layout: TouchLayout; };

/** Where the player put the touch controls: each one's middle, as shares of the screen, by its key. */
export type TouchLayout = Record<string, { X: number; Y: number; }>;

/** What the page lists: every action of every map of the manifest in use. */
export interface BindingsSnapshot {
	op: "bindings";
	manifest: string | null;
	activeMap: string | null;
	/** The player's touch layout for this manifest ({} : the defaults). */
	touchLayout: TouchLayout;
	maps: { Name: string; Actions: { Name: string; Label: string; Category: string; Touch: TouchKind; Binding: ActionBinding; }[]; }[];
}

interface Channels {
	Post(channel: string, payload: unknown): void;
	On(channel: string, handler: (payload: unknown) => void): () => void;
}

export class InputBindings {
	private readonly _system: InputSystem;

	public constructor(private readonly _input: InputService, private readonly _storage: SettingsStorage, private readonly _channels: Channels) {
		this._system = _input.System;
		_channels.On(InputChannel, (payload) => this.Receive(payload as FromPage));
	}

	private Receive(message: FromPage): void {
		try {
			switch (message.op) {
				case "request":
					break;
				case "touch-layout": {
					const id = this._system.ActiveManifest;
					if (id === null) return;
					this._storage.Set("TouchLayout", { ...this.Layouts(), [id]: message.layout } as never);
					break;
				}
				case "touch":
					// The touch scheme presses an action (a stick sends many of these: nothing is sent back).
					this._input.SetTouch(message.action, message.value);
					return;
				case "rebind":
					this.Map(message.map).Rebind(message.action, message.slot, message.code);
					this.Keep();
					break;
				case "reset":
					this.Reset(message.map, message.action);
					this.Keep();
					break;
				default:
					return;
			}
			this._channels.Post(InputChannel, this.Snapshot());
		} catch (error) {
			this._channels.Post(InputChannel, { op: "error", message: (error as Error).message });
		}
	}

	private Map(name: string) {
		return this._system.MapOf(this._system.ActiveManifest!, name);
	}

	/** One action of one map, or every map of the manifest in use. */
	private Reset(map?: string, action?: string): void {
		const manifest = this._system.ManifestOf(this._system.ActiveManifest!)!;
		for (const definition of manifest.ActionMaps) {
			if (map === undefined || definition.Name === map) this.Map(definition.Name).Reset(action);
		}
	}

	/** Every manifest's touch layout as kept (a broken entry reads as none). */
	private Layouts(): Record<string, TouchLayout> {
		const kept: unknown = this._storage.Get("TouchLayout", {});
		return typeof kept === "object" && kept !== null && !Array.isArray(kept) ? kept as Record<string, TouchLayout> : {};
	}

	private Keep(): void {
		this._storage.Set("Input", this._system.Save() as never);
	}

	private Snapshot(): BindingsSnapshot {
		const id = this._system.ActiveManifest;
		const manifest = id === null ? undefined : this._system.ManifestOf(id);
		return {
			op: "bindings", manifest: id, activeMap: this._system.ActiveMap,
			touchLayout: (id === null ? undefined : this.Layouts()[id]) ?? {},
			maps: (manifest?.ActionMaps ?? []).map((definition) => ({
				Name: definition.Name,
				Actions: definition.Actions.map((action) => ({
					Name: action.Name, Label: action.Label, Category: action.Category, Touch: TouchKindOf(action), Binding: this.Map(definition.Name).Binding(action.Name)!,
				})),
			})),
		};
	}
}
