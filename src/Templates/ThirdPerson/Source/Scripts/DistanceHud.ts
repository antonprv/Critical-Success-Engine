// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Inject } from "@cse/di";
import { FMath } from "@cse/fastmath";
import { Component } from "@cse/core/Engine/Core/Component";
import { IWorld } from "@cse/core/Engine/DI/Contracts";
import { IGameUi } from "@cse/ui/game";

/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "ThirdPersonHud";

/**
 * The third-person HUD (Content/UI/ThirdPersonHud.ui.json): how far the player
 * has walked, in whole metres.
 */
export class DistanceHud extends Component {
	public PlayerName = "Player";

	/** Metres covered on the ground (height changes, jumps, don't count). */
	public Walked = 0;

	@Inject( IGameUi ) private readonly _ui!: IGameUi;

	@Inject( IWorld ) private readonly _world!: IWorld;

	private _showing = false;

	private _last: { X: number; Z: number; } | null = null;

	private _shown = -1;

	public override Update(): void {
		const player = this._world.FindByName( this.PlayerName );

		if ( !player ) {
			return;
		}
		const { X, Z } = player.Transform.Position;

		if ( this._last ) {
			this.Walked += FMath.Length2( X - this._last.X, Z - this._last.Z );
		}
		this._last = { X, Z };
	}

	public override OnUIUpdate(): void {
		if ( !this._showing ) {
			this._showing = true;
			this._ui.Show( HudId );
		}
		const metres = FMath.Floor( this.Walked );

		if ( metres === this._shown ) {
			return;
		}
		this._shown = metres;
		this._ui.SetText( HudId, "Distance", `Distance: ${ metres } m` );
	}

	public override OnDestroy(): void {
		if ( this._showing ) {
			this._ui.Hide( HudId );
		}
	}
}
