// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { UiDocument } from "../Documents/UiDocument";
import type { UiManager } from "../Documents/UiManager";
import { BindingName } from "./BindingNames";
import { EngineControlsId } from "./EngineScreens";
import type { UiChannels } from "./GameUi";

export { EngineControlsId } from "./EngineScreens";

type Slot = "KeyboardPrimary" | "KeyboardSecondary" | "Gamepad";
type Binding = { Keyboard: [string, string]; Gamepad: string; };
type Row = { Map: string; Name: string; Label: string; Category: string; Binding: Binding; };
type FromGame =
	| { op: "bindings"; maps: { Name: string; Actions: Omit<Row, "Map">[]; }[]; }
	| { op: "error"; message: string; };

/** Where the screen hears the player while it waits for a binding (the browser's window and gamepads by default). */
export interface ControlsInput {
	Target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
	Gamepads: () => ({ connected: boolean; buttons: readonly { value: number; }[]; axes: readonly number[]; } | null)[];
	Frame: (callback: () => void) => void;
}

const Channel = "input";
const Idle = "Pick an action, then the binding to change.";
const PadButtons = ["Pad:A", "Pad:B", "Pad:X", "Pad:Y", "Pad:LB", "Pad:RB", "Pad:LT", "Pad:RT", "Pad:Back", "Pad:Start", "Pad:LS", "Pad:RS", "Pad:DUp", "Pad:DDown", "Pad:DLeft", "Pad:DRight", "Pad:Home"];
const Sticks = ["Pad:LeftStickLeft", "Pad:LeftStickRight", "Pad:LeftStickUp", "Pad:LeftStickDown", "Pad:RightStickLeft", "Pad:RightStickRight", "Pad:RightStickUp", "Pad:RightStickDown"];

const BrowserInput = (): ControlsInput => ({
	Target: window,
	Gamepads: () => [...(navigator.getGamepads?.() ?? [])],
	Frame: (callback) => { requestAnimationFrame(callback); },
});

/**
 * The controls screen (the engine's EngineControls document): every action of the input manifest in use, by action map,
 * with its main and spare key and its gamepad binding. The player picks an action and a slot, then presses what should
 * do it: a key or mouse button for the keyboard slots, a gamepad button or stick for the gamepad one. The game rebinds
 * and keeps it (its SettingsStorage); this screen only shows and asks.
 */
export class ControlsScreen {
	private _rows: Row[] = [];
	private _picked = -1;
	private _stopListening: (() => void) | null = null;
	private readonly _off: () => void;

	/** arrange: hands over to the touch controls' arranging. */
	public constructor(
		private readonly _manager: UiManager,
		private readonly _channels: UiChannels,
		private readonly _input: ControlsInput = BrowserInput(),
		private readonly _arrange: () => void = () => undefined,
	) {
		this._off = _channels.On(Channel, (payload) => this.Receive(payload as FromGame));
		_manager.Events.On("shown", (id, document) => { if (id === EngineControlsId) this.Wire(document); });
	}

	public Open(): void {
		void this._manager.Show(EngineControlsId).then(() => this._channels.Post(Channel, { op: "request" }));
	}

	public Dispose(): void {
		this._off();
		this.StopListening();
	}

	private Receive(message: FromGame): void {
		if (message.op === "error") this.Hint(message.message);
		if (message.op !== "bindings") return;
		this._rows = message.maps.flatMap((map) => map.Actions.map((action) => ({ ...action, Map: map.Name })));
		this.Draw();
	}

	private Wire(screen: UiDocument): void {
		screen.On("Bindings", "selection-change", (indices) => { this._picked = (indices as number[])[0] ?? -1; });
		screen.On("MainButton", "click", () => this.Listen("KeyboardPrimary"));
		screen.On("SpareButton", "click", () => this.Listen("KeyboardSecondary"));
		screen.On("PadButton", "click", () => this.Listen("Gamepad"));
		screen.On("ResetButton", "click", () => this._channels.Post(Channel, { op: "reset" }));
		screen.On("ArrangeButton", "click", () => this._arrange());
		screen.On("BackButton", "click", () => {
			this.StopListening();
			this._manager.Hide(EngineControlsId);
		});
	}

	/** Waits for the next key or mouse button (keyboard slots) or gamepad button or stick (the gamepad slot). */
	private Listen(slot: Slot): void {
		const row = this._rows[this._picked];
		if (!row) return;
		this.StopListening();
		const gamepad = slot === "Gamepad";
		const which = slot === "KeyboardPrimary" ? "main" : "spare";
		this.Hint(gamepad
			? `Press a gamepad button or push a stick for ${row.Label}. Esc cancels, Delete clears.`
			: `Press a key or a mouse button for ${row.Label} (${which}). Esc cancels, Delete clears.`);
		const bind = (code: string): void => {
			this.StopListening();
			this._channels.Post(Channel, { op: "rebind", map: row.Map, action: row.Name, slot, code });
		};

		const onKey = (event: Event): void => {
			const { code } = event as KeyboardEvent;
			event.preventDefault();
			if (code === "Escape") this.StopListening();
			else if (code === "Delete" || code === "Backspace") bind("");
			else if (!gamepad) bind(code);
		};
		const onMouse = (event: Event): void => {
			event.preventDefault();
			bind(`Mouse${(event as MouseEvent).button}`);
		};
		this._input.Target.addEventListener("keydown", onKey, { capture: true });
		if (!gamepad) this._input.Target.addEventListener("mousedown", onMouse, { capture: true });

		// The Gamepad API has no events: read it every frame; what was held when listening began doesn't count.
		const held = gamepad ? this.PadCodes() : new Set<string>();
		let listening = true;
		const poll = (): void => {
			if (!listening) return;
			const pressed = [...this.PadCodes()].find((code) => !held.has(code));
			for (const code of held) if (!this.PadCodes().has(code)) held.delete(code);
			if (pressed) bind(pressed);
			else this._input.Frame(poll);
		};
		if (gamepad) this._input.Frame(poll);

		this._stopListening = () => {
			listening = false;
			this._input.Target.removeEventListener("keydown", onKey, { capture: true });
			this._input.Target.removeEventListener("mousedown", onMouse, { capture: true });
		};
	}

	private StopListening(): void {
		if (!this._stopListening) return;
		this._stopListening();
		this._stopListening = null;
		this.Hint(Idle);
	}

	/** Every gamepad button pressed past half way and stick pushed past half way, right now. */
	private PadCodes(): Set<string> {
		const codes = new Set<string>();
		for (const pad of this._input.Gamepads()) {
			if (!pad?.connected) continue;
			pad.buttons.forEach((button, i) => { if (button.value > 0.5 && PadButtons[i]) codes.add(PadButtons[i]); });
			pad.axes.slice(0, 4).forEach((value, axis) => { if (Math.abs(value) > 0.5) codes.add(Sticks[axis * 2 + (value > 0 ? 1 : 0)]!); });
		}
		return codes;
	}

	private Hint(text: string): void {
		const screen = this._manager.Get(EngineControlsId);
		if (screen) (screen.Controller<{ Label: string; }>("Hint")).Label = text;
	}

	/** Redraws the list on an open screen, keeping the picked row. */
	private Draw(): void {
		const screen = this._manager.Get(EngineControlsId);
		if (!screen) return;
		const list = screen.Controller<{ SetItems(items: { text: string; }[]): void; Select(indices: Iterable<number>): void; }>("Bindings");
		const picked = this._picked;
		list.SetItems(this._rows.map((row) => ({
			text: `[${row.Map} · ${row.Category}] ${row.Label}: ${BindingName(row.Binding.Keyboard[0])} · ${BindingName(row.Binding.Keyboard[1])} · ${BindingName(row.Binding.Gamepad)}`,
		})));
		if (picked >= 0) list.Select([picked]);
	}
}
