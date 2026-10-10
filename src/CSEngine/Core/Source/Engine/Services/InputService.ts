// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { InputEvtType } from "../../Workers/Common/CommonEnums";
import type { InputEvent } from "../../Workers/Protocol/GameLogicProtocol";
import { InputSystem, PadAxes, PadButtons, type InputMap } from "../Input/InputActions";

/**
 * Keyboard and mouse state ("Mouse0", "Mouse1"... for buttons). While `CapturePlayerInput` is false every query reports
 * nothing pressed. `JustPressed` lasts one rendered frame; `JustPressedPhysics` lasts until the next physics step.
 */
/** How far a stick must move before it counts; past it, the value is rescaled to start at 0. */
const DeadZone = 0.2;

export class InputService {
	/** The project's input manifests and the action map in force (the engine defines no actions of its own). */
	public readonly System = new InputSystem();
	/** The action map in force. */
	public get Map(): InputMap { return this.System.Map; }
	private _capture = false;
	/** Gamepad buttons and stick directions, 0..1. */
	private readonly _pad = new Map<string, number>();
	/** Actions pressed from the screen (the touch scheme), 0..1, by action name. */
	private readonly _touch = new Map<string, number>();
	private readonly _touchDown = new Set<string>();
	private readonly _touchJustFrame = new Set<string>();
	private readonly _touchJustPhysics = new Set<string>();
	private readonly _down = new Set<string>();
	private readonly _justPressedFrame = new Set<string>();
	private readonly _justPressedPhysics = new Set<string>();
	private _lookDx = 0;
	private _lookDy = 0;
	private _cursor: [number, number] | null = null;
	private _wheel = 0;

	public get CapturePlayerInput(): boolean { return this._capture; }

	public set CapturePlayerInput(value: boolean) {
		if (this._capture === value) return;
		this._capture = value;
		if (!value) this.ReleaseAll();
	}

	public Handle(event: InputEvent): void {
		switch (event.kind) {
			case InputEvtType.KeyDown:
				this.Press(event.code);
				break;
			case InputEvtType.KeyUp:
				this._down.delete(event.code);
				break;
			case InputEvtType.PointerDown:
				this.Press(`Mouse${event.button}`);
				break;
			case InputEvtType.PointerUp:
				this._down.delete(`Mouse${event.button}`);
				break;
			case InputEvtType.PointerMove:
				if (this._capture) {
					this._lookDx += event.dx;
					this._lookDy += event.dy;
				}
				// A locked pointer has no position: the last one known stays.
				if (event.x !== undefined && event.y !== undefined) this._cursor = [event.x, event.y];
				break;
			case InputEvtType.Gamepad:
				this.HandleGamepad(event.buttons, event.axes);
				break;
			case InputEvtType.PointerLeave:
				this._cursor = null;
				break;
			case InputEvtType.Wheel:
				if (this._capture) this._wheel += event.dy;
				break;
			case InputEvtType.ReleaseAll:
				this.ReleaseAll();
				break;
		}
	}

	/** Gamepad values become codes like keys: pressed past half way (a stick too), with their analog value kept. */
	private HandleGamepad(buttons: number[], axes: number[]): void {
		const values = new Map<string, number>();
		PadButtons.forEach((code, i) => values.set(code, buttons[i] ?? 0));
		for (let stick = 0; stick < 4; stick++) {
			const v = axes[stick] ?? 0;
			const beyond = Math.max(0, (Math.abs(v) - DeadZone) / (1 - DeadZone));
			values.set(PadAxes[stick * 2]!, v < 0 ? beyond : 0);
			values.set(PadAxes[stick * 2 + 1]!, v > 0 ? beyond : 0);
		}
		for (const [code, value] of values) {
			this._pad.set(code, value);
			if (value > 0.5) this.Press(code);
			else this._down.delete(code);
		}
	}

	private Press(code: string): void {
		if (!this._capture) return;
		if (!this._down.has(code)) {
			this._justPressedFrame.add(code);
			this._justPressedPhysics.add(code);
		}
		this._down.add(code);
	}

	private ReleaseAll(): void {
		this._touch.clear();
		this._touchDown.clear();
		this._down.clear();
		this._justPressedFrame.clear();
		this._justPressedPhysics.clear();
		this._lookDx = 0;
		this._lookDy = 0;
		this._wheel = 0;
		this._pad.clear();
	}

	public IsKeyDown(code: string): boolean { return this._capture && this._down.has(code); }
	public JustPressed(code: string): boolean { return this._capture && this._justPressedFrame.has(code); }
	public JustPressedPhysics(code: string): boolean { return this._capture && this._justPressedPhysics.has(code); }

	//#region actions

	public IsActionDown(name: string): boolean { return this._touchDown.has(name) || this.Map.Codes(name).some((code) => this.IsKeyDown(code)); }
	public ActionJustPressed(name: string): boolean { return this._touchJustFrame.has(name) || this.Map.Codes(name).some((code) => this.JustPressed(code)); }
	public ActionJustPressedPhysics(name: string): boolean { return this._touchJustPhysics.has(name) || this.Map.Codes(name).some((code) => this.JustPressedPhysics(code)); }

	/** An action pressed from the screen (the touch scheme): 0..1, pressed past half way - with the keys and the gamepad. */
	public SetTouch(name: string, value: number): void {
		if (!this._capture) return;
		this._touch.set(name, value);
		if (value <= 0.5) {
			this._touchDown.delete(name);
			return;
		}
		if (this._touchDown.has(name)) return;
		this._touchDown.add(name);
		this._touchJustFrame.add(name);
		this._touchJustPhysics.add(name);
	}

	/** How hard the action is pressed, 0..1: 1 for a key, the trigger's or stick's travel for a gamepad. */
	public ActionValue(name: string): number {
		if (!this._capture) return 0;
		return Math.max(this._touch.get(name) ?? 0, ...this.Map.Codes(name).map((code) => this._pad.get(code) ?? (this._down.has(code) ? 1 : 0)));
	}

	/**
	 * Godot's Input.GetVector(left, right, forward, back) over the Move actions (keys and the stick together):
	 * x = right - left, y = back - forward (so pushing forward gives a NEGATIVE y). Length is clamped to 1.
	 */
	public GetMoveVector(): [number, number] {
		const x = this.ActionValue("MoveRight") - this.ActionValue("MoveLeft");
		const y = this.ActionValue("MoveBack") - this.ActionValue("MoveForward");
		const length = Math.hypot(x, y);
		return length > 1 ? [x / length, y / length] : [x, y];
	}

	/** The move vector's old name. */
	public GetInputVector(): [number, number] { return this.GetMoveVector(); }

	//#endregion

	/** Where the cursor is on the game view, 0..1 from the top left (free-cursor scenes); null when it is outside or the game has no input. */
	public get Cursor(): [number, number] | null { return this._capture ? this._cursor : null; }

	/** Wheel movement since the last call, in the browser's units (about 100 per notch; positive: towards the user). */
	public ConsumeWheel(): number {
		const wheel = this._wheel;
		this._wheel = 0;
		return wheel;
	}

	/** Mouse movement in pixels since the last call (Godot's GetCameraVector - reading it resets it). */
	public ConsumeLookDelta(): [number, number] {
		const result: [number, number] = [this._lookDx, this._lookDy];
		this._lookDx = 0;
		this._lookDy = 0;
		return result;
	}

	/** Called by the runtime at the end of each rendered frame. */
	public EndFrame(): void {
		this._justPressedFrame.clear();
		this._touchJustFrame.clear();
	}

	/** Called by the runtime after each physics step's scripts ran. */
	public EndPhysicsStep(): void {
		this._justPressedPhysics.clear();
		this._touchJustPhysics.clear();
	}
}
