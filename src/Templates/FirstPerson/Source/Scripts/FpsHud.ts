// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Inject } from "@cse/di";
import { Component } from "@cse/core/Engine/Core/Component";
import { IWorld } from "@cse/core/Engine/DI/Contracts";
import { Shooter } from "@cse/core/Engine/Gameplay/Scripts";
import { IGameUi } from "@cse/ui/game";

/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "FirstPersonHud";

/**
 * The first-person HUD: a UI document (Content/UI/FirstPersonHud.ui.json) with
 * the crosshair and the shot counter. It shows with the scene and goes when the
 * scene does. The count is the document's variable "Shots": its node graph
 * (the UI Designer's Nodes tab) writes it into the label, so the text is the
 * document's business. SetVariable sends only changes: setting it every frame
 * is cheap.
 */
export class FpsHud extends Component {
	/** The entity whose Shooter is counted. */
	public ShooterName = "Player";

	@Inject( IGameUi ) private readonly _ui!: IGameUi;

	@Inject( IWorld ) private readonly _world!: IWorld;

	private _showing = false;

	public override OnUIUpdate(): void {
		if ( !this._showing ) {
			this._showing = true;
			this._ui.Show( HudId );
		}
		const shots = this._world.FindByName( this.ShooterName )
			?.GetComponent( Shooter )?.ShotsFired ?? 0;

		this._ui.SetVariable( HudId, "Shots", shots );
	}

	public override OnDestroy(): void {
		if ( this._showing ) {
			this._ui.Hide( HudId );
		}
	}
}
