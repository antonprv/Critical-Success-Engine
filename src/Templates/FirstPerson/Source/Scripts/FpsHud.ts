// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import { Shooter } from "@cse/core/Engine/Gameplay/Scripts";
import { GetGameUi, type GameUi } from "@cse/ui/game";

/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "FirstPersonHud";

/**
 * The first-person HUD: a UI document (Content/UI/FirstPersonHud.ui.json) with the crosshair and the shot counter. It
 * shows with the scene, updates the counter when the player's Shooter fires, and goes when the scene does.
 */
export class FpsHud extends Component {
	/** The entity whose Shooter is counted. */
	public ShooterName = "Player";

	private _ui: GameUi | null = null;
	private _shots = -1;

	public override OnUIUpdate(): void {
		if (!this._ui) {
			this._ui = GetGameUi();
			this._ui.Show(HudId);
		}
		const shots = this.Engine.World.FindByName(this.ShooterName)?.GetComponent(Shooter)?.ShotsFired ?? 0;
		if (shots === this._shots) return;
		this._shots = shots;
		this._ui.SetText(HudId, "Shots", `Shots: ${shots}`);
	}

	public override OnDestroy(): void {
		this._ui?.Hide(HudId);
	}
}
