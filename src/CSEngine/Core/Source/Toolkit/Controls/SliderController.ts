// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface SliderOptions extends ControlOptions {
	Min?: number;
	Max?: number;
	Step?: number;
	PageSize?: number;
	/** Distance between tick marks; 0 = no ticks. */
	TickFrequency?: number;
	Value?: number;
}

export type SliderEvents = { change: [value: number]; };

/** Trackbar: a thumb on a track, snapped to `Step`, moved by mouse or keys. */
export class SliderController extends ControlBase<SliderEvents> {
	public readonly Min: number;
	public readonly Max: number;
	public readonly Step: number;
	public PageSize: number;
	public TickFrequency: number;

	private _value: number;

	public constructor(options: SliderOptions = {}) {
		super(options);
		this.Min = options.Min ?? 0;
		this.Max = options.Max ?? 100;
		this.Step = options.Step ?? 1;
		this.PageSize = options.PageSize ?? 10;
		this.TickFrequency = options.TickFrequency ?? 0;
		this._value = this.Snap(options.Value ?? this.Min);
	}

	public get Value(): number { return this._value; }

	public get Fraction(): number {
		return this.Max === this.Min ? 0 : (this._value - this.Min) / (this.Max - this.Min);
	}

	public get Ticks(): number[] {
		const ticks: number[] = [];
		for (let v = this.Min; this.TickFrequency > 0 && v <= this.Max; v += this.TickFrequency) ticks.push(v);
		return ticks;
	}

	public SetValue(value: number): void {
		const snapped = this.Snap(value);
		if (snapped === this._value) return;
		this._value = snapped;
		this.Emit("change", snapped);
	}

	/** Where along the track (0..1) the user put the thumb. */
	public SetFraction(fraction: number): void {
		if (!this.Enabled) return;
		this.SetValue(this.Min + fraction * (this.Max - this.Min));
	}

	public KeyDown(code: string): void {
		if (!this.Enabled) return;
		switch (code) {
			case "ArrowRight": case "ArrowUp": this.SetValue(this._value + this.Step); break;
			case "ArrowLeft": case "ArrowDown": this.SetValue(this._value - this.Step); break;
			case "PageUp": this.SetValue(this._value + this.PageSize); break;
			case "PageDown": this.SetValue(this._value - this.PageSize); break;
			case "Home": this.SetValue(this.Min); break;
			case "End": this.SetValue(this.Max); break;
		}
	}

	private Snap(value: number): number {
		const stepped = this.Min + Math.round((value - this.Min) / this.Step) * this.Step;
		return Math.min(this.Max, Math.max(this.Min, stepped));
	}
}
