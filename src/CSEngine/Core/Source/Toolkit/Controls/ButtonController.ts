// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface ButtonOptions extends ControlOptions {
	Label?: string;
	/** The dialog's default button: drawn with a thicker frame, pressed by Enter anywhere in the dialog. */
	IsDefault?: boolean;
}

export type ButtonEvents = { press: []; release: []; click: []; };

/** Push button: pressed while the mouse button or Space is held, clicked on release over the button. */
export class ButtonController extends ControlBase<ButtonEvents> {
	public Label: string;
	public IsDefault: boolean;

	private _pressed = false;

	public constructor(options: ButtonOptions = {}) {
		super(options);
		this.Label = options.Label ?? "";
		this.IsDefault = options.IsDefault ?? false;
	}

	public get Pressed(): boolean { return this._pressed; }

	public Press(): void {
		if (!this.Enabled || this._pressed) return;
		this._pressed = true;
		this.Emit("press");
	}

	/** `inside`: the pointer is still over the button (releasing elsewhere cancels the click, as in Windows). */
	public Release(inside: boolean): void {
		if (!this._pressed) return;
		this._pressed = false;
		this.Emit("release");
		if (inside) this.Emit("click");
	}

	public PerformClick(): void {
		if (!this.Enabled) return;
		this.Emit("click");
	}

	public KeyDown(code: string): void {
		if (code === "Space") this.Press();
		else if (code === "Enter") this.PerformClick();
	}

	public KeyUp(code: string): void {
		if (code === "Space") this.Release(true);
	}

	protected override OnBlur(): void {
		this.Release(false);
	}

	protected override OnDisabled(): void {
		this.Release(false);
	}
}
