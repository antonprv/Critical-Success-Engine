// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface GameButtonOptions extends ControlOptions {
	Label?: string;
}

export type GameButtonEvents = {
	press: [];
	release: [];
	/** Let go over the button. */
	click: [];
};

/**
 * A game button (touch controls): pressed while a finger holds it - one finger at a time, so others can press other
 * buttons. Letting go over it is a click.
 */
export class GameButtonController extends ControlBase<GameButtonEvents> {
	public Label: string;
	private _finger: number | null = null;

	public constructor(options: GameButtonOptions = {}) {
		super(options);
		this.Label = options.Label ?? "";
	}

	public get Pressed(): boolean { return this._finger !== null; }

	/** A finger (pointer id) went down on it. */
	public Press(finger: number): void {
		if (!this.Enabled || this._finger !== null) return;
		this._finger = finger;
		this.Events.Emit("press");
	}

	/** A finger went up; over: still over the button. */
	public Release(finger: number, over: boolean): void {
		if (this._finger !== finger) return;
		this._finger = null;
		this.Events.Emit("release");
		if (over) this.Events.Emit("click");
	}
}
