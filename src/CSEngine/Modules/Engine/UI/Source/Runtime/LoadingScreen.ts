// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { GameUi } from "./GameUi";

/** Which widgets of the document show the progress and the status (Progress and Status unless named otherwise). */
export interface LoadingScreenParts {
	Bar?: string;
	Label?: string;
}

/**
 * A loading screen made of any UI document with a progress bar (and a label): show it wherever the game loads something,
 * drive it with a fraction, hide it when done.
 *
 *   const loading = new LoadingScreen(GetGameUi(), "LevelLoading");
 *   loading.Show("Loading the level");
 *   loading.SetProgress(0.4);          // 40% on the bar
 *   loading.Hide();
 */
export class LoadingScreen {
	private readonly _bar: string;
	private readonly _label: string;
	private _progress = 0;
	private _shownPercent = -1;
	private _shownLabel: string | null = null;

	public constructor(private readonly _ui: GameUi, private readonly _id: string, parts: LoadingScreenParts = {}) {
		this._bar = parts.Bar ?? "Progress";
		this._label = parts.Label ?? "Status";
	}

	/** The last fraction given (0..1). */
	public get Progress(): number { return this._progress; }

	public Show(label?: string): void {
		this._ui.Show(this._id);
		if (label !== undefined) this.SetLabel(label);
	}

	/** The share done, 0..1 (kept within): the bar shows it as a percentage, sent only when the percentage changes. */
	public SetProgress(fraction: number): void {
		this._progress = fraction;
		const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
		if (percent === this._shownPercent) return;
		this._shownPercent = percent;
		this._ui.SetValue(this._id, this._bar, percent);
	}

	public SetLabel(text: string): void {
		if (text === this._shownLabel) return;
		this._shownLabel = text;
		this._ui.SetText(this._id, this._label, text);
	}

	public Hide(): void {
		this._ui.Hide(this._id);
	}
}
