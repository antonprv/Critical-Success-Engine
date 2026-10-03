// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { InputEvtType } from "../../Workers/Common/CommonEnums";
import type { InputEvent } from "../../Workers/Protocol/GameLogicProtocol";

/**
 * Keyboard/mouse state as the game sees it. Mouse buttons are addressed as "Mouse0", "Mouse1", ... so everything is
 * queried the same way (`IsKeyDown("Mouse0")`).
 *
 * Mirrors Engine.Services.Input.InputService from the Godot project: while `CapturePlayerInput` is false (the pause
 * menu is up, nothing has the pointer) every query reports "nothing pressed" and mouse movement is not accumulated.
 *
 * "Just pressed" has two clocks, because scripts run on two: `JustPressed` is true for the rendered frame in which the
 * key went down (use from Update / OnInputUpdate), `JustPressedPhysics` stays true until the next physics step has
 * seen it (use from OnPhysicsUpdate - a tap shorter than one step is never lost).
 */
export class InputService {
	private _capture = false;
	private readonly _down = new Set<string>();
	private readonly _justPressedFrame = new Set<string>();
	private readonly _justPressedPhysics = new Set<string>();
	private _lookDx = 0;
	private _lookDy = 0;

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
				break;
			case InputEvtType.ReleaseAll:
				this.ReleaseAll();
				break;
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
		this._down.clear();
		this._justPressedFrame.clear();
		this._justPressedPhysics.clear();
		this._lookDx = 0;
		this._lookDy = 0;
	}

	public IsKeyDown(code: string): boolean { return this._capture && this._down.has(code); }
	public JustPressed(code: string): boolean { return this._capture && this._justPressedFrame.has(code); }
	public JustPressedPhysics(code: string): boolean { return this._capture && this._justPressedPhysics.has(code); }

	/**
	 * Godot's Input.GetVector(left, right, forward, back) for WASD/arrows: x = right - left, y = back - forward
	 * (so pushing forward gives a NEGATIVE y). Returned as [x, y]; length is clamped to 1.
	 */
	public GetInputVector(): [number, number] {
		if (!this._capture) return [0, 0];

		const x = (this.IsKeyDown("KeyD") || this.IsKeyDown("ArrowRight") ? 1 : 0)
			- (this.IsKeyDown("KeyA") || this.IsKeyDown("ArrowLeft") ? 1 : 0);
		const y = (this.IsKeyDown("KeyS") || this.IsKeyDown("ArrowDown") ? 1 : 0)
			- (this.IsKeyDown("KeyW") || this.IsKeyDown("ArrowUp") ? 1 : 0);

		const length = Math.hypot(x, y);
		return length > 1 ? [x / length, y / length] : [x, y];
	}

	/** Mouse movement in pixels since the last call (Godot's GetCameraVector - reading it resets it). */
	public ConsumeLookDelta(): [number, number] {
		const result: [number, number] = [this._lookDx, this._lookDy];
		this._lookDx = 0;
		this._lookDy = 0;
		return result;
	}

	/** Called by the runtime at the end of each rendered frame. */
	public EndFrame(): void { this._justPressedFrame.clear(); }

	/** Called by the runtime after each physics step's scripts ran. */
	public EndPhysicsStep(): void { this._justPressedPhysics.clear(); }
}
