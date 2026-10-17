// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The scripts of the "Coin Hunt" sample game - the finished result of guide 07
// (docs/en/guides/07-coin-hunt.md).

import type { Subscription } from "@cse/datastream";
import { Inject } from "@cse/di";
import { FromCSharp, Implements } from "@cse/scripting";
import { FMath } from "@cse/fastmath";
import { CoinHuntRules } from "../Data/CoinHuntRules";
import { Component } from "@cse/core/Engine/Core/Component";
import type { Entity } from "@cse/core/Engine/Core/Entity";
import {
	CharacterBody,
} from "@cse/core/Engine/Components/Physics/CharacterBody";
import { TriggerArea } from "@cse/core/Engine/Components/Physics/TriggerAreas";
import { Vec3, type Vec3Tuple } from "@cse/core/Engine/Math/Vec3";
import {
	IDataAssets, IDataStream, IScenes, ISettingsSubsystem, IUiSubsystem, IWorld,
} from "@cse/core/Engine/DI/Contracts";
import type { InputService } from "@cse/core/Engine/Services/InputService";
import { IGameUi } from "@cse/ui/game";
import { IRound, IStreaks } from "../Contracts/CoinHunt.contract.ts";

export const enum CoinHuntState {
	Playing = 0,
	Won,
	Lost,
}

/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "CoinHuntHud";

/** What a coin publishes when the player picks it up (on "Coin.Collected"). */
export interface CoinCollected {
	Coin: string;
}

/**
 * The referee: counts coins, runs the clock, decides win/lose, restarts on R.
 * It knows no coin: coins publish "Coin.Collected" on the DataStream, it
 * listens. Everything it uses of the engine comes by contract (@Inject).
 *
 * It talks with C# through Source/Contracts/CoinHunt.contract: it is the
 * round (IRound) the C# StreakTracker on its entity asks, and it asks that
 * StreakTracker for the best streak (IStreaks) when the round is won.
 */
@Implements( IRound )
export class GameRules extends Component implements IRound {
	@Inject( IGameUi ) private readonly _ui!: IGameUi;

	@Inject( IUiSubsystem ) private readonly _toasts!: IUiSubsystem;

	@Inject( IWorld ) private readonly _world!: IWorld;

	@Inject( IDataAssets ) private readonly _data!: IDataAssets;

	@Inject(
		ISettingsSubsystem,
	) private readonly _settings!: ISettingsSubsystem;

	@Inject( IScenes ) private readonly _scenes!: IScenes;

	@Inject( IDataStream ) private readonly _stream!: IDataStream;

	// the C# StreakTracker on this entity
	@FromCSharp( IStreaks ) private readonly _streaks!: IStreaks;

	private _collected: Subscription | null = null;

	private _showing = false;

	private readonly _hudText = new Map<string, string>();

	public TimeLimitSeconds = 60;

	/** The data asset with the rules (Content/Data/CoinHuntRules.csedata). */
	public RulesId = "CoinHuntRules";

	public CoinTag = "coin";

	public Total = 0;

	public Collected = 0;

	public TimeLeft = 0;

	public State: CoinHuntState = CoinHuntState.Playing;

	public override Start(): void {
		// Start runs after EVERY entity's Awake, so all coins already exist
		// here (Awake would be too early to count them).
		this.Total = this._world.FindByTag( this.CoinTag ).length;
		this._collected = this._stream.Subscribe<CoinCollected>(
			"Coin.Collected",
			() => this.Collect(),
		);
		// Coin Hunt's own setting: the time limit (it applies when a game
		// starts). Its default and choices come from the project's
		// CoinHuntRules data asset; a project without one uses this component's
		// own limit.
		const rules = this._data.Has( this.RulesId )
			? this._data.Get( CoinHuntRules, this.RulesId )
			: null;
		const own = String( rules?.TimeLimitSeconds ?? this.TimeLimitSeconds );
		const choices = [
			...new Set(
				[
					...( rules?.TimeLimitChoices
						?? [30, 60, 90] ).map( String ),
					own,
				],
			),
		].sort( ( a, b ) => Number( a ) - Number( b ) );
		const limit = this._settings.Declare(
			{
				Key: "TimeLimit",
				Label: "Time limit (seconds)",
				Category: "Coin Hunt",
				Kind: "Choice",
				Default: own,
				Choices: choices,
			},
		);
		this.TimeLimitSeconds = Number( limit );
		this.TimeLeft = this.TimeLimitSeconds;
	}

	public Collect(): void {
		if ( this.State !== CoinHuntState.Playing ) {
			return;
		}

		this.Collected++;
		if ( this.Collected >= this.Total ) {
			this.State = CoinHuntState.Won;
			const seconds = ( this.TimeLimitSeconds - this.TimeLeft ).toFixed(
				1,
			);
			this._toasts.Toast(
				`All coins collected in ${ seconds } s! Press R to play again.`,
			);
			this.ToastBestStreak();
		}
	}

	/** IRound, for C#: coins still to find. */
	public CoinsLeft(): number {
		return this.Total - this.Collected;
	}

	/** IRound, for C#: seconds before time runs out. */
	public SecondsLeft(): number {
		return this.TimeLeft;
	}

	/** Asks C# (the StreakTracker) for the round's best streak. */
	private ToastBestStreak(): void {
		try {
			const best = this._streaks.Best();

			if ( best >= 2 ) {
				this._toasts.Toast( `Best streak: x${ best }` );
			}
		} catch {
			// the project's C# scripts aren't running: no streaks to tell
		}
	}

	public override Update( dt: number ): void {
		if ( this.State !== CoinHuntState.Playing ) {
			return;
		}

		this.TimeLeft = FMath.Max( 0, this.TimeLeft - dt );
		if ( this.TimeLeft === 0 ) {
			this.State = CoinHuntState.Lost;
			this._toasts.Toast( "Time's up! Press R to try again." );
		}
	}

	public override OnInputUpdate( input: InputService ): void {
		if ( this.State !== CoinHuntState.Playing
			&& input.ActionJustPressed( "Restart" ) ) {
			const scene = this._scenes.CurrentSceneId;

			// everything, this component included, is rebuilt from the manifest
			if ( scene ) {
				void this._scenes.Load( scene );
			}
		}
	}

	/**
	 * The HUD is a UI document (Content/UI/CoinHuntHud.ui.json): shown with the
	 * game, its labels changed when their text does.
	 */
	public override OnUIUpdate(): void {
		if ( !this._showing ) {
			this._showing = true;
			this._ui.Show( HudId );
		}
		this.SetHudText(
			"Coins",
			`Coins: ${ this.Collected } / ${ this.Total }`,
		);
		this.SetHudText(
			"Time",
			this.State === CoinHuntState.Playing
				? `Time: ${ this.TimeLeft.toFixed( 1 ) }`
				: this.State === CoinHuntState.Won
					? "YOU WIN - R to restart"
					: "TIME'S UP - R to restart",
		);
	}

	/**
	 * Leaving the scene (or restarting it) takes the HUD away; the new game
	 * shows it again.
	 */
	public override OnDestroy(): void {
		this._collected?.Dispose();
		if ( this._showing ) {
			this._ui.Hide( HudId );
		}
	}

	private SetHudText( widget: string, text: string ): void {
		if ( this._hudText.get( widget ) === text ) {
			return;
		}
		this._hudText.set( widget, text );
		this._ui.SetText( HudId, widget, text );
	}
}

/**
 * A pickup: a sensor volume that vanishes when the player touches it. It
 * doesn't know the rules: it says "Coin.Collected" on the DataStream (the
 * GameRules count it, the C# StreakTracker counts streaks).
 */
export class Coin extends TriggerArea {
	@Inject( IDataStream ) private readonly _stream!: IDataStream;

	protected override OnBodyEntered( body: Entity ): void {
		// Only the player picks coins up (a crate or a bullet drifting through
		// does nothing).
		if ( !body.Tags.has( "player" ) ) {
			return;
		}

		this._stream.Publish<CoinCollected>(
			"Coin.Collected",
			{ Coin: this.Entity.Name },
		);
		this.Entity.Destroy();
	}
}

/**
 * Falls off the arena -> back to the start. List it BEFORE the mover so the
 * mover starts its tick from the cleared velocity.
 */
export class FallRespawn extends Component {
	public KillY = -8;

	public SpawnPoint: Vec3Tuple = [0, 1.2, 8];

	public override OnPhysicsUpdate(): void {
		if ( this.Transform.Position.Y >= this.KillY ) {
			return;
		}
		this.Entity.RequireComponent( CharacterBody )
			.Teleport( Vec3.FromTuple( this.SpawnPoint ) );
	}
}
