// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Inject } from "@cse/di";
import { Component } from "@cse/core/Engine/Core/Component";
import type { Entity } from "@cse/core/Engine/Core/Entity";
import { MeshRenderer } from "@cse/core/Engine/Components/MeshRenderer";
import { TriggerArea } from "@cse/core/Engine/Components/Physics/TriggerAreas";
import { IDataStream, IWorld } from "@cse/core/Engine/DI/Contracts";
import { IGameUi } from "@cse/ui/game";

/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "TopDownHud";

/**
 * A pad on the floor: the player stepping on it visits it (once), and it turns
 * green. Give it the tag "pad".
 */
export class VisitPad extends TriggerArea {
	@Inject( IWorld ) private readonly _world!: IWorld;

	@Inject( IDataStream ) private readonly _stream!: IDataStream;

	public Visited = false;

	protected override OnBodyEntered( body: Entity ): void {
		if ( this.Visited || !body.Tags.has( "player" ) ) {
			return;
		}
		this.Visited = true;
		this.Entity.GetComponent( MeshRenderer )
			?.SetColor( [0.25, 0.85, 0.35] );
		// for whoever follows the tour (the C# VisitTimer does)
		const pads = this._world.FindByTag( "pad" )
			.map( ( pad ) => pad.GetComponent( VisitPad )! );
		this._stream.Publish( "Pad.Visited", {
			Pad: this.Entity.Name,
			Visited: pads.filter( ( pad ) => pad.Visited ).length,
			Total: pads.length,
		} );
	}
}

/**
 * The rules: visit every pad. The HUD (Content/UI/TopDownHud.ui.json) counts
 * them.
 */
export class PadCounter extends Component {
	@Inject( IGameUi ) private readonly _ui!: IGameUi;

	@Inject( IWorld ) private readonly _world!: IWorld;

	private _showing = false;

	private _shown = "";

	public override OnUIUpdate(): void {
		if ( !this._showing ) {
			this._showing = true;
			this._ui.Show( HudId );
		}
		const pads = this._world.FindByTag( "pad" )
			.map( ( pad ) => pad.GetComponent( VisitPad )! );
		const visited = pads.filter( ( pad ) => pad.Visited ).length;
		const text = visited === pads.length
			? "All pads visited!"
			: `Visited: ${ visited } / ${ pads.length }`;

		if ( text === this._shown ) {
			return;
		}
		this._shown = text;
		this._ui.SetText( HudId, "Visited", text );
	}

	public override OnDestroy(): void {
		if ( this._showing ) {
			this._ui.Hide( HudId );
		}
	}
}
