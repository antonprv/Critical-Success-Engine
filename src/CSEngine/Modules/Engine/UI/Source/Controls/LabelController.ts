// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface LabelOptions extends ControlOptions {
	Label?: string;
}

/** A label's live state: scripts change its text (Label) and visibility like any widget's. */
export class LabelController extends ControlBase<Record<string, unknown[]>> {
	public Label: string;

	public constructor(options: LabelOptions = {}) {
		super(options);
		this.Label = options.Label ?? "";
	}
}
