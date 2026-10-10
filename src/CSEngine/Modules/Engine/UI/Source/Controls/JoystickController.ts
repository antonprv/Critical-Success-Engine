// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface JoystickOptions extends ControlOptions {
	/** How far the knob travels from the middle, in pixels. */
	Radius?: number;
	/** The share of the travel in the middle that counts as nothing (0..1). */
	DeadZone?: number;
}

export type JoystickEvents = {
	/** The stick's position changed: -1..1 each way, up and left negative (as a gamepad's stick). */
	move: [x: number, y: number];
	release: [];
};

/**
 * A virtual stick (touch controls): the knob follows the finger within its radius; X and Y go -1..1 past a dead zone in
 * the middle. Let go, it springs back to the middle (Returning is set for the animation).
 */
export class JoystickController extends ControlBase<JoystickEvents> {
	public DeadZone: number;
	private _radius: number;
	private _active = false;
	private _returning = false;
	private _knobX = 0;
	private _knobY = 0;
	private _x = 0;
	private _y = 0;

	public constructor(options: JoystickOptions = {}) {
		super(options);
		this._radius = options.Radius ?? 40;
		this.DeadZone = options.DeadZone ?? 0.1;
	}

	public get Radius(): number { return this._radius; }
	public get Active(): boolean { return this._active; }
	/** The knob is springing back to the middle (let go). */
	public get Returning(): boolean { return this._returning; }
	/** The knob's offset from the middle, in pixels. */
	public get KnobX(): number { return this._knobX; }
	public get KnobY(): number { return this._knobY; }
	public get X(): number { return this._x; }
	public get Y(): number { return this._y; }

	/** The travel follows the widget's size. */
	public SetRadius(radius: number): void {
		this._radius = Math.max(1, radius);
	}

	/** A finger went down at this offset from the middle. */
	public Press(dx: number, dy: number): void {
		if (!this.Enabled) return;
		this._active = true;
		this._returning = false;
		this.MoveTo(dx, dy);
	}

	/** The finger moved: the knob follows, held at the radius. */
	public MoveTo(dx: number, dy: number): void {
		if (!this._active) return;
		const length = Math.hypot(dx, dy);
		const scale = length > this._radius ? this._radius / length : 1;
		this._knobX = dx * scale;
		this._knobY = dy * scale;
		const travel = Math.min(1, length / this._radius);
		const past = travel <= this.DeadZone ? 0 : (travel - this.DeadZone) / (1 - this.DeadZone);
		const along = length === 0 ? 0 : past / length;
		this.Set(dx * along, dy * along);
	}

	public Release(): void {
		if (!this._active) return;
		this._active = false;
		this._returning = true;
		this._knobX = 0;
		this._knobY = 0;
		this.Set(0, 0);
		this.Events.Emit("release");
	}

	private Set(x: number, y: number): void {
		if (x === this._x && y === this._y) return;
		this._x = x;
		this._y = y;
		this.Events.Emit("move", x, y);
	}
}
