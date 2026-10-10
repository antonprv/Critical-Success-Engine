// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The scripts of the "Coin Hunt" sample game - the finished result of guide 07 (docs/guides/07-coin-hunt.md).

import { CoinHuntRules } from "../Data/CoinHuntRules";
import { Component } from "@cse/core/Engine/Core/Component";
import type { Entity } from "@cse/core/Engine/Core/Entity";
import { CharacterBody } from "@cse/core/Engine/Components/Physics/CharacterBody";
import { TriggerArea } from "@cse/core/Engine/Components/Physics/TriggerAreas";
import { Vec3, type Vec3Tuple } from "@cse/core/Engine/Math/Vec3";
import type { InputService } from "@cse/core/Engine/Services/InputService";
import { GetGameUi, type GameUi } from "@cse/ui/game";

export const enum CoinHuntState {
	Playing = 0,
	Won,
	Lost,
}

/**
 * The referee: counts coins, runs the clock, decides win/lose, restarts on R. One of these lives on an entity called
 * "Game"; everything else finds it by name.
 */
/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "CoinHuntHud";

export class GameRules extends Component {
	private _ui: GameUi | null = null;
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
		// Start runs after EVERY entity's Awake, so all coins already exist here (Awake would be too early to count them).
		this.Total = this.Engine.World.FindByTag(this.CoinTag).length;
		// Coin Hunt's own setting: the time limit (it applies when a game starts). Its default and choices come from the
		// project's CoinHuntRules data asset; a project without one uses this component's own limit.
		const rules = this.Engine.Data.Has(this.RulesId) ? this.Engine.Data.Get(CoinHuntRules, this.RulesId) : null;
		const own = String(rules?.TimeLimitSeconds ?? this.TimeLimitSeconds);
		const choices = [...new Set([...(rules?.TimeLimitChoices ?? [30, 60, 90]).map(String), own])].sort((a, b) => Number(a) - Number(b));
		const limit = this.Engine.Settings.Declare({ Key: "TimeLimit", Label: "Time limit (seconds)", Category: "Coin Hunt", Kind: "Choice", Default: own, Choices: choices });
		this.TimeLimitSeconds = Number(limit);
		this.TimeLeft = this.TimeLimitSeconds;
	}

	public Collect(): void {
		if (this.State !== CoinHuntState.Playing) return;

		this.Collected++;
		if (this.Collected >= this.Total) {
			this.State = CoinHuntState.Won;
			const seconds = (this.TimeLimitSeconds - this.TimeLeft).toFixed(1);
			this.Engine.Ui.Toast(`All coins collected in ${seconds} s! Press R to play again.`);
		}
	}

	public override Update(dt: number): void {
		if (this.State !== CoinHuntState.Playing) return;

		this.TimeLeft = Math.max(0, this.TimeLeft - dt);
		if (this.TimeLeft === 0) {
			this.State = CoinHuntState.Lost;
			this.Engine.Ui.Toast("Time's up! Press R to try again.");
		}
	}

	public override OnInputUpdate(input: InputService): void {
		if (this.State !== CoinHuntState.Playing && input.ActionJustPressed("Restart")) {
			const scene = this.Engine.Scenes.CurrentSceneId;
			if (scene) void this.Engine.Scenes.Load(scene); // everything, this component included, is rebuilt from the manifest
		}
	}

	/** The HUD is a UI document (Content/UI/CoinHuntHud.ui.json): shown with the game, its labels changed when their text does. */
	public override OnUIUpdate(): void {
		if (!this._ui) {
			this._ui = GetGameUi();
			this._ui.Show(HudId);
		}
		this.SetHudText("Coins", `Coins: ${this.Collected} / ${this.Total}`);
		this.SetHudText("Time", this.State === CoinHuntState.Playing ? `Time: ${this.TimeLeft.toFixed(1)}` : this.State === CoinHuntState.Won ? "YOU WIN - R to restart" : "TIME'S UP - R to restart");
	}

	/** Leaving the scene (or restarting it) takes the HUD away; the new game shows it again. */
	public override OnDestroy(): void {
		this._ui?.Hide(HudId);
	}

	private SetHudText(widget: string, text: string): void {
		if (this._hudText.get(widget) === text) return;
		this._hudText.set(widget, text);
		this._ui!.SetText(HudId, widget, text);
	}
}

/** A pickup: a sensor volume that vanishes when the player touches it. */
export class Coin extends TriggerArea {
	protected override OnBodyEntered(body: Entity): void {
		// Only the player picks coins up (a crate or a bullet drifting through does nothing).
		if (!body.Tags.has("player")) return;

		this.Engine.World.FindByName("Game")?.GetComponent(GameRules)?.Collect();
		this.Entity.Destroy();
	}
}

/** Falls off the arena -> back to the start. List it BEFORE the mover so the mover starts its tick from the cleared velocity. */
export class FallRespawn extends Component {
	public KillY = -8;
	public SpawnPoint: Vec3Tuple = [0, 1.2, 8];

	public override OnPhysicsUpdate(): void {
		if (this.Transform.Position.Y >= this.KillY) return;
		this.Entity.RequireComponent(CharacterBody).Teleport(Vec3.FromTuple(this.SpawnPoint));
	}
}
