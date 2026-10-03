// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface StatusPanel {
	Text: string;
	/** Fixed width in pixels; panels without one share the rest. */
	Width?: number;
}

export interface StatusBarOptions extends ControlOptions {
	Panels: StatusPanel[];
}

export type StatusBarEvents = { change: [index: number, text: string]; };

export class StatusBarController extends ControlBase<StatusBarEvents> {
	public readonly Panels: StatusPanel[];

	public constructor(options: StatusBarOptions) {
		super(options);
		this.Panels = options.Panels;
	}

	public SetText(index: number, text: string): void {
		const panel = this.Panels[index];
		if (!panel || panel.Text === text) return;
		panel.Text = text;
		this.Emit("change", index, text);
	}
}
