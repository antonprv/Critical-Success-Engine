// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Code of guide 06 (docs/guides/06-ui.md).

// <<health
import { Component } from "../../Engine/Core/Component";
import type { UiService } from "../../Engine/Services/UiService";

/** Hit points with a bar on the HUD. Anything that wants to hurt this entity calls `Damage`. */
export class Health extends Component {
	public Max = 100;
	public Current = 100;

	public Damage(amount: number): void {
		this.Current = Math.max(0, this.Current - amount);
	}

	public override OnUIUpdate(ui: UiService): void {
		ui.SetBar("hp", `HP ${this.Current}/${this.Max}`, this.Current / this.Max);
	}
}
// >>
