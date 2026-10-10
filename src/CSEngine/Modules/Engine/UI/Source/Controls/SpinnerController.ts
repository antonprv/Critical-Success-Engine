// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface SpinnerOptions extends ControlOptions {
	Min?: number;
	Max?: number;
	Step?: number;
	Value?: number;
	/** Stepping past an end goes round to the other end (UDS_WRAP). */
	Wrap?: boolean;
}

export type SpinnerEvents = { change: [value: number]; };

/** Up-down control with its buddy edit box: arrows step, PageUp/PageDown step by ten, typed numbers are checked. */
export class SpinnerController extends ControlBase<SpinnerEvents> {
	public readonly Min: number;
	public readonly Max: number;
	public readonly Step: number;
	public Wrap: boolean;

	private _value: number;

	public constructor(options: SpinnerOptions = {}) {
		super(options);
		this.Min = options.Min ?? 0;
		this.Max = options.Max ?? 100;
		this.Step = options.Step ?? 1;
		this.Wrap = options.Wrap ?? false;
		this._value = this.Clamp(options.Value ?? this.Min);
	}

	public get Value(): number { return this._value; }

	public SetValue(value: number): void {
		const next = this.Clamp(value);
		if (next === this._value) return;
		this._value = next;
		this.Emit("change", next);
	}

	public Increment(): void {
		this.StepBy(this.Step);
	}

	public Decrement(): void {
		this.StepBy(-this.Step);
	}

	/** Text typed into the edit box; returns false (value unchanged) when it is not a number. */
	public CommitText(text: string): boolean {
		const parsed = parseFloat(text);
		if (!this.Enabled || Number.isNaN(parsed)) return false;
		this.SetValue(parsed);
		return true;
	}

	public KeyDown(code: string): void {
		if (!this.Enabled) return;
		switch (code) {
			case "ArrowUp": this.Increment(); break;
			case "ArrowDown": this.Decrement(); break;
			case "PageUp": this.StepBy(this.Step * 10); break;
			case "PageDown": this.StepBy(-this.Step * 10); break;
			case "Home": this.SetValue(this.Min); break;
			case "End": this.SetValue(this.Max); break;
		}
	}

	private StepBy(delta: number): void {
		if (!this.Enabled) return;
		const next = this._value + delta;
		if (this.Wrap && next > this.Max) this.SetValue(this.Min);
		else if (this.Wrap && next < this.Min) this.SetValue(this.Max);
		else this.SetValue(next);
	}

	private Clamp(value: number): number {
		return Math.min(this.Max, Math.max(this.Min, value));
	}
}
