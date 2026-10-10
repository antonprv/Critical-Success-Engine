// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { shallowReactive, watch, type WatchStopHandle } from "vue";
import { ButtonController } from "../Controls/ButtonController";
import { GameButtonController } from "../Controls/GameButtonController";
import { JoystickController } from "../Controls/JoystickController";
import type { UiChannels } from "./GameUi";

/** What the page offers the touch scheme (Core's PageUi). */
export interface TouchPage {
	readonly State: { loading: { visible: boolean; }; menu: { visible: boolean; }; };
	Pause(): void;
	SetTouchMode(enabled: boolean): void;
}

type TouchAction = { Name: string; Label: string; Touch: string; };
type Snapshot = { op: string; activeMap: string | null; touchLayout?: Layout; maps: { Name: string; Actions: TouchAction[]; }[]; };
/** Where each control's middle is, as shares of the screen, by its key ("MoveStick", "LookStick", "Button:Jump", "Pause"). */
type Layout = Record<string, { X: number; Y: number; }>;

const Round = (value: number): number => Math.round(value * 1000) / 1000;
const Clamp = (value: number): number => Round(Math.min(1, Math.max(0, value)));

/** How far a stick pushes an action, by the direction its name ends with (MoveForward, LookLeft, SteerRight...). */
function Push(name: string, x: number, y: number): number {
	if (/(Forward|Up)$/.test(name)) return Math.max(0, -y);
	if (/(Back|Down)$/.test(name)) return Math.max(0, y);
	if (name.endsWith("Left")) return Math.max(0, -x);
	return name.endsWith("Right") ? Math.max(0, x) : 0;
}

/**
 * The touch scheme on the page: sticks and buttons for the actions of the game's action map in force, over the game
 * while it plays. On with the "TouchControls" setting - with the keyboard and gamepad, not instead of them - and then
 * the game doesn't take the mouse (a phone has no pointer lock); its pause button stands in for Esc.
 */
export class TouchControls {
	// Shallow: what is on screen changes; the controls' own state is followed by their components.
	public readonly State = shallowReactive({
		Enabled: false,
		Visible: false,
		MoveStick: null as JoystickController | null,
		LookStick: null as JoystickController | null,
		Buttons: [] as { Action: string; Controller: GameButtonController; }[],
		/** The player is putting the controls where they want them. */
		Arranging: false,
		/** The key of the control being dragged. */
		Dragging: null as string | null,
		/** The player's layout for the game's input manifest (from the game), and the one being arranged. */
		Saved: {} as Layout,
		Draft: null as Layout | null,
	});
	public readonly PauseButton = new GameButtonController({ Label: "II" });
	public readonly DoneButton = new ButtonController({ Label: "Done", IsDefault: true });
	public readonly ResetButton = new ButtonController({ Label: "Reset" });
	private _back: (() => void) | undefined;

	private readonly _stops: (WatchStopHandle | (() => void))[] = [];

	public constructor(private readonly _channels: UiChannels, private readonly _page: TouchPage) {
		this._stops.push(_channels.On("settings", (payload) => {
			const message = payload as { op: string; values?: Record<string, unknown>; };
			if (message.op !== "definitions") return;
			const on = message.values?.["TouchControls"] === true;
			if (on === this.State.Enabled) return;
			this.State.Enabled = on;
			_page.SetTouchMode(on);
		}));
		this._stops.push(_channels.On("input", (payload) => {
			if ((payload as Snapshot).op === "bindings") this.Build(payload as Snapshot);
		}));
		this._stops.push(watch(() => this.State.Arranging || (this.State.Enabled && !_page.State.menu.visible && !_page.State.loading.visible), (visible) => {
			this.State.Visible = visible;
			if (visible) _channels.Post("input", { op: "request" }); // the actions of the map in force, now
		}, { immediate: true }));
		this.PauseButton.Events.On("click", () => this.Pause());
		this.DoneButton.Events.On("click", () => this.Done());
		this.ResetButton.Events.On("click", () => this.ResetLayout());
	}

	/** Where a control's middle is: where the player put it, else its default place. */
	public Position(key: string): { X: number; Y: number; } {
		// While arranging the draft is the whole layout (it starts as a copy of the saved one; empty: the defaults).
		const layout = this.State.Draft ?? this.State.Saved;
		return layout[key] ?? this.DefaultPosition(key);
	}

	/** Arranging: the controls show (also in the menu) and are dragged instead of pressed. back: where Done returns. */
	public StartArranging(back?: () => void): void {
		this._back = back;
		this.State.Draft = { ...this.State.Saved };
		this.State.Arranging = true;
	}

	/** A control dragged to a new middle (kept on the screen). */
	public MoveItem(key: string, x: number, y: number): void {
		this.State.Draft = { ...this.State.Draft, [key]: { X: Clamp(x), Y: Clamp(y) } };
	}

	/** Back to the default places (kept when Done). */
	public ResetLayout(): void {
		this.State.Draft = {};
	}

	/** Keeps the layout (the game stores it for its input manifest) and goes back. */
	public Done(): void {
		if (!this.State.Draft) return; // not arranging: nothing to keep (and the saved layout stays)
		const layout = this.State.Draft;
		this._channels.Post("input", { op: "touch-layout", layout });
		this.State.Saved = layout;
		this.State.Draft = null;
		this.State.Arranging = false;
		this.State.Dragging = null;
		this._back?.();
	}

	/** The default places: the sticks in the bottom corners, the buttons in rows above the right one, pause at the top. */
	private DefaultPosition(key: string): { X: number; Y: number; } {
		const defaults: Layout = { MoveStick: { X: 0.14, Y: 0.78 }, LookStick: { X: 0.86, Y: 0.78 }, Pause: { X: 0.95, Y: 0.08 } };
		if (defaults[key]) return defaults[key];
		const index = this.State.Buttons.findIndex((button) => `Button:${button.Action}` === key);
		if (index < 0) return { X: 0.5, Y: 0.5 };
		return { X: Round(0.92 - (index % 4) * 0.1), Y: Round(0.5 - Math.floor(index / 4) * 0.15) };
	}

	public Pause(): void {
		this._page.Pause();
	}

	public Dispose(): void {
		for (const stop of this._stops.splice(0)) stop();
	}

	private Build(snapshot: Snapshot): void {
		const actions = snapshot.maps.find((map) => map.Name === snapshot.activeMap)?.Actions ?? [];
		this.State.Saved = snapshot.touchLayout ?? {};
		const of = (kind: string) => actions.filter((action) => action.Touch === kind);
		this.State.MoveStick = this.Stick(of("MoveStick"));
		this.State.LookStick = this.Stick(of("LookStick"));
		this.State.Buttons = of("Button").map((action) => ({ Action: action.Name, Controller: this.Button(action) }));
	}

	private Stick(actions: TouchAction[]): JoystickController | null {
		if (actions.length === 0) return null;
		const stick = new JoystickController();
		stick.Events.On("move", (x, y) => {
			for (const action of actions) this.Touch(action.Name, Push(action.Name, x, y));
		});
		return stick;
	}

	private Button(action: TouchAction): GameButtonController {
		const button = new GameButtonController({ Label: action.Label });
		button.Events.On("press", () => this.Touch(action.Name, 1));
		button.Events.On("release", () => this.Touch(action.Name, 0));
		return button;
	}

	private Touch(action: string, value: number): void {
		this._channels.Post("input", { op: "touch", action, value });
	}
}
