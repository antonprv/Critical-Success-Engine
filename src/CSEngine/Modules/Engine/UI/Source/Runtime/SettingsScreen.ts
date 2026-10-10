// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { UiDocument } from "../Documents/UiDocument";
import type { UiManager } from "../Documents/UiManager";
import { EngineSettingsId } from "./EngineScreens";
import type { UiChannels } from "./GameUi";

export { EngineSettingsId } from "./EngineScreens";

type SettingValue = boolean | number | string;

/** A setting as the game describes it (the engine's SettingDefinition). */
interface Setting {
	Key: string;
	Label: string;
	Category: string;
	Kind: "Toggle" | "Number" | "Choice";
	Default: SettingValue;
	Min?: number;
	Max?: number;
	Step?: number;
	Choices?: string[];
}

const Channel = "settings";

/** How many decimals a step shows (0.1: one). */
const Decimals = (step = 1): number => (String(step).split(".")[1] ?? "").length;

/**
 * The settings screen (the engine's EngineSettings document): the game's general and own settings with their values;
 * the player picks one and changes it with Less and More. The game is told at once; it keeps the values (in its
 * SettingsStorage) - this screen only shows them.
 */
export class SettingsScreen {
	private _settings: Setting[] = [];
	private _values: Record<string, SettingValue> = {};
	private _picked = -1;
	private readonly _off: () => void;

	public constructor(private readonly _manager: UiManager, private readonly _channels: UiChannels, private readonly _openControls: () => void = () => undefined) {
		this._off = _channels.On(Channel, (payload) => this.Receive(payload as { op: string; definitions: Setting[]; values: Record<string, SettingValue>; }));
		_manager.Events.On("shown", (id, document) => { if (id === EngineSettingsId) this.Wire(document); });
	}

	/** The values as last told by the game (and changed here). */
	public get Values(): Record<string, SettingValue> { return this._values; }

	public Open(): void {
		void this._manager.Show(EngineSettingsId).then(() => this.Draw());
	}

	public Dispose(): void {
		this._off();
	}

	private Receive(message: { op: string; definitions: Setting[]; values: Record<string, SettingValue>; }): void {
		if (message.op !== "definitions") return;
		this._settings = message.definitions;
		this._values = { ...message.values };
		this.Draw();
	}

	private Wire(screen: UiDocument): void {
		screen.On("Settings", "selection-change", (indices) => { this._picked = (indices as number[])[0] ?? -1; });
		screen.On("LessButton", "click", () => this.Change(-1));
		screen.On("MoreButton", "click", () => this.Change(1));
		screen.On("BackButton", "click", () => this._manager.Hide(EngineSettingsId));
		screen.On("ControlsButton", "click", () => this._openControls());
	}

	private Change(direction: 1 | -1): void {
		const setting = this._settings[this._picked];
		if (!setting) return;
		const value = this.Next(setting, this._values[setting.Key] ?? setting.Default, direction);
		this._values[setting.Key] = value;
		this._channels.Post(Channel, { op: "set", key: setting.Key, value });
		this.Draw();
	}

	private Next(setting: Setting, value: SettingValue, direction: 1 | -1): SettingValue {
		switch (setting.Kind) {
			case "Toggle":
				return !value;
			case "Choice": {
				const choices = setting.Choices ?? [];
				const index = Math.min(choices.length - 1, Math.max(0, choices.indexOf(String(value)) + direction));
				return choices[index]!;
			}
			case "Number": {
				const next = Math.min(setting.Max ?? Infinity, Math.max(setting.Min ?? -Infinity, Number(value) + direction * (setting.Step ?? 1)));
				return Number(next.toFixed(Decimals(setting.Step)));
			}
		}
	}

	private Text(setting: Setting): string {
		const value = this._values[setting.Key] ?? setting.Default;
		const shown = setting.Kind === "Toggle" ? (value ? "On" : "Off")
			: setting.Kind === "Number" ? Number(value).toFixed(Decimals(setting.Step)) : String(value);
		return `[${setting.Category}] ${setting.Label}: ${shown}`;
	}

	/** Redraws the list on an open screen, keeping the picked row. */
	private Draw(): void {
		const screen = this._manager.Get(EngineSettingsId);
		if (!screen) return;
		const list = screen.Controller<{ SetItems(items: { text: string; }[]): void; Select(indices: Iterable<number>): void; }>("Settings");
		const picked = this._picked;
		list.SetItems(this._settings.map((setting) => ({ text: this.Text(setting) })));
		if (picked >= 0) list.Select([picked]);
	}
}
