// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface RadioOption<T> {
	Value: T;
	Label: string;
	Disabled?: boolean;
}

export interface RadioGroupOptions<T> extends ControlOptions {
	Options: RadioOption<T>[];
	Value?: T | null;
}

export type RadioGroupEvents<T> = { change: [value: T, previous: T | null]; };

/** A set of radio buttons: one value at a time; the arrow keys move the selection, as in a Windows dialog. */
export class RadioGroupController<T> extends ControlBase<RadioGroupEvents<T>> {
	public Options: RadioOption<T>[];

	private _value: T | null;

	public constructor(options: RadioGroupOptions<T>) {
		super(options);
		this.Options = options.Options;
		this._value = options.Value ?? null;
	}

	public get Value(): T | null { return this._value; }

	public Select(value: T): void {
		if (!this.Enabled || value === this._value) return;
		const option = this.Options.find((o) => o.Value === value);
		if (!option || option.Disabled) return;
		const previous = this._value;
		this._value = value;
		this.Emit("change", value, previous);
	}

	public KeyDown(code: string): void {
		if (!this.Enabled) return;
		if (code === "ArrowDown" || code === "ArrowRight") this.Move(1);
		else if (code === "ArrowUp" || code === "ArrowLeft") this.Move(-1);
	}

	private Move(direction: 1 | -1): void {
		const enabled = this.Options.filter((o) => !o.Disabled);
		if (enabled.length === 0) return;
		const index = enabled.findIndex((o) => o.Value === this._value);
		const next = index < 0 ? 0 : (index + direction + enabled.length) % enabled.length;
		this.Select(enabled[next]!.Value);
	}
}
