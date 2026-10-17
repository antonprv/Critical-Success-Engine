// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Inject } from "@cse/di";
import { Component } from "@cse/core/Engine/Core/Component";
import { IGameUi } from "@cse/ui/game";

/**
 * The UI load: the Stress document's labels (L0..Ln) all get a new text every
 * frame.
 */
export class UiLoad extends Component {
	public Labels = 120;

	@Inject( IGameUi ) private readonly _ui!: IGameUi;

	private _shown = false;

	private _frame = 0;

	public override OnUIUpdate(): void {
		if ( !this._shown ) {
			this._shown = true;
			this._ui.Show( "Stress" );
		}
		this._frame++;
		for ( let i = 0; i < this.Labels; i++ ) {
			this._ui.SetText(
				"Stress",
				`L${ i }`,
				`${ i }: ${ ( this._frame + i ) % 1000 }`,
			);
		}
	}
}
