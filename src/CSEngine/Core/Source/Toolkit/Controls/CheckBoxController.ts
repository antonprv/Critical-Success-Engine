// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export const enum CheckState {
	Unchecked = 0,
	Checked,
	/** The grey "some of them" state of three-state boxes. */
	Indeterminate,
}

export interface CheckBoxOptions extends ControlOptions {
	Label?: string;
	State?: CheckState;
	/** Clicking cycles through Indeterminate too (BS_AUTO3STATE). */
	ThreeState?: boolean;
}

export type CheckBoxEvents = { change: [state: CheckState, previous: CheckState]; };

export class CheckBoxController extends ControlBase<CheckBoxEvents> {
	public Label: string;
	public ThreeState: boolean;

	private _state: CheckState;

	public constructor(options: CheckBoxOptions = {}) {
		super(options);
		this.Label = options.Label ?? "";
		this.ThreeState = options.ThreeState ?? false;
		this._state = options.State ?? CheckState.Unchecked;
	}

	public get State(): CheckState { return this._state; }

	public get Checked(): boolean { return this._state === CheckState.Checked; }
	public set Checked(checked: boolean) { this.SetState(checked ? CheckState.Checked : CheckState.Unchecked); }

	public SetState(state: CheckState): void {
		if (this._state === state) return;
		const previous = this._state;
		this._state = state;
		this.Emit("change", state, previous);
	}

	/** What a click does: Unchecked -> Checked -> (Indeterminate if three-state) -> Unchecked. */
	public Toggle(): void {
		if (!this.Enabled) return;
		if (this._state === CheckState.Unchecked) this.SetState(CheckState.Checked);
		else if (this._state === CheckState.Checked && this.ThreeState) this.SetState(CheckState.Indeterminate);
		else this.SetState(CheckState.Unchecked);
	}

	public KeyDown(code: string): void {
		if (code === "Space") this.Toggle();
	}
}
