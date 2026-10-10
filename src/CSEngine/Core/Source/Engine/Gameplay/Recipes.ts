// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Small, self-contained examples from guide 08 (docs/guides/08-recipes.md). Each one is a normal component - copy the
// ones you need into your own scripts.

import { CollisionLayer } from "../Core/CollisionLayer";
import { Component } from "../Core/Component";
import { Comp, Ent } from "../Core/EntityManifest";
import type { Entity } from "../Core/Entity";
import { MeshForShape, Shapes } from "../Core/Shapes";
import { MeshRenderer } from "../Components/MeshRenderer";
import { MoverComponent } from "../Components/Mover/MoverComponent";
import {
	Doom3FrictionTrait, Doom3GroundAccelTrait, GravityTrait, JumpTrait, StrafeAirControlTrait,
} from "../Components/Mover/Traits/Traits";
import { MovementTrait, type IMovementTrait, type MovementContext } from "../Components/Mover/MovementTypes";
import { CharacterBody } from "../Components/Physics/CharacterBody";
import { RigidBody } from "../Components/Physics/PhysicsBodies";
import { TriggerArea } from "../Components/Physics/TriggerAreas";
import { Vec3, type Vec3Tuple } from "../Math/Vec3";
import type { InputService } from "../Services/InputService";

/**
 * A sliding door: rises while the player is within `TriggerDistance`, sinks back otherwise. Put it on an entity with a
 * KinematicBody, listed BEFORE the KinematicBody (it moves the Transform, the body then reports that pose to the physics world).
 */
export class Door extends Component {
	public PlayerName = "Player";
	public TriggerDistance = 4;
	public OpenHeight = 3;
	public Speed = 3;

	private _closedY = 0;
	private _player: Entity | undefined;

	public override Start(): void {
		this._closedY = this.Transform.Position.Y;
	}

	public override OnPhysicsUpdate(dt: number): void {
		this._player ??= this.Engine.World.FindByName(this.PlayerName);
		if (!this._player) return;

		const position = this.Transform.Position;
		const near = position.DistanceTo(this._player.Transform.Position) < this.TriggerDistance;
		const target = this._closedY + (near ? this.OpenHeight : 0);

		const maxStep = this.Speed * dt;
		const y = position.Y + Math.max(-maxStep, Math.min(maxStep, target - position.Y));
		this.Transform.PushPhysicsPose(new Vec3(position.X, y, position.Z), this.Transform.Rotation);
	}
}

/** Drops a physics crate above this entity every few seconds; once `MaxCrates` exist, the oldest one disappears. */
export class CrateSpawner extends Component {
	public IntervalSeconds = 2;
	public MaxCrates = 10;
	public CrateSize = 0.6;

	private _timer = 0;
	private _crates: Entity[] = [];

	public override Update(dt: number): void {
		this._timer += dt;
		if (this._timer < this.IntervalSeconds) return;
		this._timer = 0;

		this._crates = this._crates.filter((crate) => !crate.IsDestroyed);
		if (this._crates.length >= this.MaxCrates) this._crates.shift()!.Destroy();

		const shape = Shapes.Box(this.CrateSize, this.CrateSize, this.CrateSize);
		const origin = this.Transform.Position;
		const jitter = (Math.random() - 0.5) * 0.5;

		this._crates.push(this.Engine.World.Spawn(Ent("Crate", [
			Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: [0.75, 0.55, 0.3] }),
			Comp(RigidBody, { Shape: shape, Mass: 1, Layer: CollisionLayer.Prop }),
		], { position: [origin.X + jitter, origin.Y, origin.Z + jitter] })));
	}
}

/** Sends the player back to a spawn point when they get closer than `Radius` (move this entity with PlatformMover for a patrol). */
export class Hazard extends Component {
	public PlayerName = "Player";
	public Radius = 1.2;
	public SpawnPoint: Vec3Tuple = [0, 1.2, 8];

	public override OnPhysicsUpdate(): void {
		const player = this.Engine.World.FindByName(this.PlayerName);
		if (!player) return;

		if (this.Transform.Position.DistanceTo(player.Transform.Position) >= this.Radius) return;

		player.GetComponent(CharacterBody)?.Teleport(Vec3.FromTuple(this.SpawnPoint));
		this.Engine.Ui.Toast("Ouch!");
	}
}

/**
 * Extra jumps in mid-air. Traits are small objects the mover runs in list order every physics step; this one only acts
 * when a jump was requested this tick, nobody else consumed it (`ctx.JumpConsumed`) and we are airborne.
 */
export class DoubleJumpTrait extends MovementTrait {
	public MaxAirJumps = 1;
	private _airJumpsLeft = 0;

	public override Process(ctx: MovementContext, velocity: Vec3, _delta: number): void {
		if (ctx.IsOnFloor) {
			this._airJumpsLeft = this.MaxAirJumps;
			return;
		}
		if (!ctx.JumpRequested || ctx.JumpConsumed || this._airJumpsLeft <= 0) return;

		this._airJumpsLeft--;
		velocity.Y = Math.sqrt(2 * Math.max(0.0001, -ctx.Gravity.Y) * ctx.Profile.JumpHeight);
		ctx.JumpConsumed = true;
	}
}

/** The QuakeStrafeDoom2016 preset's traits plus a double jump. Use it with `InitialMode: MovementPreset.Custom`. */
export class DoubleJumpMover extends MoverComponent {
	protected override GetCustomTraits(): IMovementTrait[] {
		return [
			new GravityTrait(),
			new JumpTrait(),
			new DoubleJumpTrait(),
			new Doom3FrictionTrait(),
			new Doom3GroundAccelTrait(),
			new StrafeAirControlTrait(),
		];
	}
}

/**
 * Launch pad: anything with a mover that steps on it gets shot upwards. Changing a character's Velocity from a trigger
 * callback is fine: overlap callbacks run inside the physics step, right before every OnPhysicsUpdate - which is exactly
 * where the mover reads its velocity.
 */
export class LaunchPad extends TriggerArea {
	public Speed = 14;

	protected override OnBodyEntered(body: Entity): void {
		const mover = body.GetComponent(MoverComponent);
		if (mover) mover.Velocity.Y = this.Speed;
	}
}

/** Hold Left Shift to run faster. Works by scaling the mover's profile (the profile is shared by all movement modes). */
export class Sprint extends Component {
	public Multiplier = 1.6;
	/** The input action that sprints (Shift, the left stick's click). */
	public Action = "Sprint";

	private _baseSpeed = 0;
	private _mover!: MoverComponent;

	public override Start(): void {
		this._mover = this.Entity.RequireComponent(MoverComponent);
		this._baseSpeed = this._mover.Profile!.MaxSpeed; // the mover created its profile in Awake, which ran before every Start
	}

	public override OnInputUpdate(input: InputService): void {
		this._mover.Profile!.MaxSpeed = this._baseSpeed * (input.IsActionDown(this.Action) ? this.Multiplier : 1);
	}
}
