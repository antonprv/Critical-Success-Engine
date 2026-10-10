// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { JsonValue, SettingsStorage } from "../Storage/SettingsStorage";

/**
 * Game settings the player changes in the pause menu. The engine's general ones (touch controls, mouse sensitivity...)
 * are always there; a game's own are declared by the components that use them when their scene starts, and go with
 * the scene (the player's values stay). The player's values live in the SettingsStorage (key "Settings"); the page
 * shows the settings and sends changes over the "settings" plugin channel.
 */

export type SettingValue = boolean | number | string;

export interface SettingDefinition {
	Key: string;
	Label: string;
	/** Where the settings screen lists it ("Controls", "Camera", a game's own...). */
	Category: string;
	Kind: "Toggle" | "Number" | "Choice";
	Default: SettingValue;
	/** Number: its range and step. */
	Min?: number;
	Max?: number;
	Step?: number;
	/** Choice: the options. */
	Choices?: string[];
}

export const SettingsChannel = "settings";

/** What the engine's own subsystems read. Multipliers start at 1. */
export const GeneralSettings: readonly SettingDefinition[] = [
	{ Key: "TouchControls", Label: "Touch controls", Category: "Controls", Kind: "Toggle", Default: false },
	{ Key: "MouseSensitivity", Label: "Mouse sensitivity", Category: "Controls", Kind: "Number", Default: 1, Min: 0.2, Max: 3, Step: 0.1 },
	{ Key: "InvertLook", Label: "Invert looking up and down", Category: "Controls", Kind: "Toggle", Default: false },
	{ Key: "PadLookSpeed", Label: "Gamepad look speed", Category: "Controls", Kind: "Number", Default: 1, Min: 0.2, Max: 3, Step: 0.1 },
];

/** What a thread's channels offer (the engine's ChannelHub). */
interface Channels {
	Post(channel: string, payload: unknown): void;
	On(channel: string, handler: (payload: unknown) => void): () => void;
}

type FromPage = { op: "set"; key: string; value: SettingValue; };

/** The storage key of the player's values. */
const StorageKey = "Settings";

/** A value that fits the definition, or undefined. */
function Fit(definition: SettingDefinition, value: unknown): SettingValue | undefined {
	switch (definition.Kind) {
		case "Toggle":
			return typeof value === "boolean" ? value : undefined;
		case "Choice":
			return typeof value === "string" && definition.Choices?.includes(value) ? value : undefined;
		case "Number": {
			if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
			let fitted = Math.min(definition.Max ?? Infinity, Math.max(definition.Min ?? -Infinity, value));
			if (definition.Step) {
				const from = definition.Min ?? 0;
				fitted = Math.round(Math.round((fitted - from) / definition.Step) * definition.Step * 1e6) / 1e6 + from;
			}
			return fitted;
		}
	}
}

export class SettingsService {
	private readonly _definitions = new Map<string, SettingDefinition>(GeneralSettings.map((d) => [d.Key, d]));
	/** The player's values, also for settings not declared (yet): a game's own come back with its scene. */
	private readonly _values = new Map<string, SettingValue>();

	/** channels: to the page that shows the settings; storage: where the player's values live between sessions. */
	public constructor(private readonly _channels?: Channels, private readonly _storage?: SettingsStorage) {
		const kept = _storage?.Get<JsonValue>(StorageKey, {});
		if (kept && typeof kept === "object" && !Array.isArray(kept)) for (const [key, value] of Object.entries(kept)) this._values.set(key, value as SettingValue);
		_channels?.On(SettingsChannel, (payload) => this.Receive(payload as FromPage));
		this.Tell();
	}

	public get Definitions(): SettingDefinition[] { return [...this._definitions.values()]; }

	/** Every declared setting's current value. */
	public get Values(): Record<string, SettingValue> {
		return Object.fromEntries(this.Definitions.map((d) => [d.Key, this.Get(d.Key)!]));
	}

	/** A game's own setting (declared once, by the component that uses it); returns its current value. */
	public Declare(definition: SettingDefinition): SettingValue {
		if (!this._definitions.has(definition.Key)) {
			this._definitions.set(definition.Key, definition);
			this.Tell();
		}
		return this.Get(definition.Key)!;
	}

	/** The scene went: its settings leave the list (their values stay). */
	public ClearScene(): void {
		for (const key of [...this._definitions.keys()]) if (!GeneralSettings.some((d) => d.Key === key)) this._definitions.delete(key);
		this.Tell();
	}

	/** A declared setting's value (the player's, else the default); undefined when nothing declares it. */
	public Get(key: string): SettingValue | undefined {
		const definition = this._definitions.get(key);
		if (!definition) return undefined;
		return Fit(definition, this._values.get(key)) ?? definition.Default;
	}

	public Toggle(key: string): boolean { return this.Get(key) === true; }
	public Number(key: string): number { const value = this.Get(key); return typeof value === "number" ? value : 0; }
	public Text(key: string): string { const value = this.Get(key); return typeof value === "string" ? value : ""; }

	/** Changes a value (kept within the setting's range, on its step, among its choices). */
	public Set(key: string, value: SettingValue): void {
		const definition = this._definitions.get(key);
		if (!definition) {
			this._values.set(key, value); // not declared yet: kept for when it is
			return;
		}
		const fitted = Fit(definition, value);
		if (fitted === undefined) return;
		this._values.set(key, fitted);
		this._storage?.Set(StorageKey, Object.fromEntries(this._values));
		this.Tell();
	}

	private Receive(message: FromPage): void {
		if (message.op === "set") this.Set(message.key, message.value);
	}

	/** The page shows what there is and its values. */
	private Tell(): void {
		this._channels?.Post(SettingsChannel, { op: "definitions", definitions: this.Definitions, values: this.Values });
	}
}
