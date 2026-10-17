// A component written in TypeScript that listens to one written in C#:
// BallWatcher (Source/Scripts/BallWatcher.cs) publishes "Ball.Landed" on the
// DataStream when the ball lands; this shows it. Neither knows the other - only
// the tag and the data.

import type { Subscription } from "@cse/datastream";
import { Inject } from "@cse/di";
import { Component } from "@cse/core/Engine/Core/Component";
import { IDataStream, IUiSubsystem } from "@cse/core/Engine/DI/Contracts";

/**
 * What BallWatcher's record Landing( int Count, float Height ) is here: plain
 * data.
 */
export interface Landing {
	Count: number;
	Height: number;
}

export class LandingToast extends Component {
	// the engine's parts it needs, by contract (the game's GameInstaller binds
	// them)
	@Inject( IDataStream ) private readonly _stream!: IDataStream;

	@Inject( IUiSubsystem ) private readonly _ui!: IUiSubsystem;

	private _landed: Subscription | null = null;

	public override Start(): void {
		this._landed = this._stream.Subscribe<Landing>(
			"Ball.Landed",
			( landing ) => this._ui.Toast(
				`Landing ${ landing.Count }, `
					+ `from ${ landing.Height.toFixed( 1 ) } m`,
			),
		);
	}

	public override OnDestroy(): void {
		this._landed?.Dispose();
	}
}
