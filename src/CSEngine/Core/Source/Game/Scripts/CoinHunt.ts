// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The scripts of the "Coin Hunt" sample game - the finished result of guide 07 (docs/guides/07-coin-hunt.md).

import { Component } from "../../Engine/Core/Component";
import type { Entity } from "../../Engine/Core/Entity";
import { CharacterBody } from "../../Engine/Components/Physics/CharacterBody";
import { TriggerArea } from "../../Engine/Components/Physics/TriggerAreas";
import { Vec3, type Vec3Tuple } from "../../Engine/Math/Vec3";
import type { InputService } from "../../Engine/Services/InputService";
import type { UiService } from "../../Engine/Services/UiService";

type GameState = "playing" | "won" | "lost";

/**
 * The referee: counts coins, runs the clock, decides win/lose, restarts on R. One of these lives on an entity called
 * "Game"; everything else finds it by name.
 */
export class GameRules extends Component {
	public TimeLimitSeconds = 60;
	public CoinTag = "coin";

	public Total = 0;
	public Collected = 0;
	public TimeLeft = 0;
	public State: GameState = "playing";

	public override Start(): void {
		// Start runs after EVERY entity's Awake, so all coins already exist here (Awake would be too early to count them).
		this.Total = this.Engine.World.FindByTag(this.CoinTag).length;
		this.TimeLeft = this.TimeLimitSeconds;
	}

	public Collect(): void {
		if (this.State !== "playing") return;

		this.Collected++;
		if (this.Collected >= this.Total) {
			this.State = "won";
			const seconds = (this.TimeLimitSeconds - this.TimeLeft).toFixed(1);
			this.Engine.Ui.Toast(`All coins collected in ${seconds} s! Press R to play again.`);
		}
	}

	public override Update(dt: number): void {
		if (this.State !== "playing") return;

		this.TimeLeft = Math.max(0, this.TimeLeft - dt);
		if (this.TimeLeft === 0) {
			this.State = "lost";
			this.Engine.Ui.Toast("Time's up! Press R to try again.");
		}
	}

	public override OnInputUpdate(input: InputService): void {
		if (this.State !== "playing" && input.JustPressed("KeyR")) {
			const scene = this.Engine.Scenes.CurrentSceneId;
			if (scene) void this.Engine.Scenes.Load(scene); // everything, this component included, is rebuilt from the manifest
		}
	}

	public override OnUIUpdate(ui: UiService): void {
		ui.SetHud("game.coins", `Coins: ${this.Collected} / ${this.Total}`);
		ui.SetHud("game.time", this.State === "playing" ? `Time: ${this.TimeLeft.toFixed(1)}` : this.State === "won" ? "YOU WIN - R to restart" : "TIME'S UP - R to restart");
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
