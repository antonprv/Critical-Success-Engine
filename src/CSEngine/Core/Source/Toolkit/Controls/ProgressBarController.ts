// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

/** Vista and 7 colour the bar by state (PBST_NORMAL / PBST_PAUSED / PBST_ERROR): green, yellow, red. */
export const enum ProgressState {
	Normal = 0,
	Paused,
	Error,
}

export interface ProgressBarOptions extends ControlOptions {
	Min?: number;
	Max?: number;
	Value?: number;
	StepSize?: number;
	Marquee?: boolean;
	State?: ProgressState;
}

export type ProgressBarEvents = {
	change: [value: number];
	complete: [];
	"state-change": [state: ProgressState];
	"marquee-change": [marquee: boolean];
};

export class ProgressBarController extends ControlBase<ProgressBarEvents> {
	public readonly Min: number;
	public readonly Max: number;
	public StepSize: number;

	private _value: number;
	private _marquee: boolean;
	private _state: ProgressState;

	public constructor(options: ProgressBarOptions = {}) {
		super(options);
		this.Min = options.Min ?? 0;
		this.Max = options.Max ?? 100;
		this.StepSize = options.StepSize ?? 10;
		this._value = this.Clamp(options.Value ?? this.Min);
		this._marquee = options.Marquee ?? false;
		this._state = options.State ?? ProgressState.Normal;
	}

	public get Value(): number { return this._value; }
	public get Marquee(): boolean { return this._marquee; }
	public get State(): ProgressState { return this._state; }

	public get Percent(): number {
		return this.Max === this.Min ? 0 : ((this._value - this.Min) / (this.Max - this.Min)) * 100;
	}

	public SetValue(value: number): void {
		const clamped = this.Clamp(value);
		if (clamped === this._value) return;
		this._value = clamped;
		this.Emit("change", clamped);
		if (clamped === this.Max) this.Emit("complete");
	}

	public Step(): void {
		this.SetValue(this._value + this.StepSize);
	}

	public SetMarquee(marquee: boolean): void {
		if (this._marquee === marquee) return;
		this._marquee = marquee;
		this.Emit("marquee-change", marquee);
	}

	public SetState(state: ProgressState): void {
		if (this._state === state) return;
		this._state = state;
		this.Emit("state-change", state);
	}

	private Clamp(value: number): number {
		return Math.min(this.Max, Math.max(this.Min, value));
	}
}
