// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysBodyType, PhysObjectKind } from "../../../Workers/Common/CommonEnums";
import { CollisionLayer } from "../../Core/CollisionLayer";
import { Shapes } from "../../Core/Shapes";
import { Quat } from "../../Math/Quat";
import { Vec3 } from "../../Math/Vec3";
import { PhysicsBody } from "./PhysicsBodies";

/**
 * Kinematic capsule character controller - port of BepuCharacterBody3D. Drop-in replacement for Godot's
 * CharacterBody3D for code that computes a velocity and calls `MoveAndSlide` once per physics step: set `Velocity`,
 * call `MoveAndSlide(dt)`, then read `IsOnFloor`.
 *
 * Where the work happens: the collide-and-slide sweep (PhysicsWorld.MoveCharacter in C#) and the moving-platform carry
 * run inside the physics worker, right before the simulation step that consumes the command. The result - new
 * position, floor state, plane-clipped velocity - comes back with that step's snapshot, i.e. at the start of the NEXT
 * OnPhysicsUpdate. That is why `Velocity`/`IsOnFloor` are refreshed in OnPhysicsSync (before any script's
 * OnPhysicsUpdate): a script that does "read floor state -> compute velocity -> MoveAndSlide" sees exactly the same
 * sequence of values it would see with the synchronous Godot call, just one tick later in wall-clock terms.
 */
export class CharacterBody extends PhysicsBody {
	/** Total capsule height including both caps (Godot CapsuleShape3D.Height); `Radius` is the cap/cylinder radius. */
	public Radius = 0.5;
	public Height = 2;

	public MaxSlideIterations = 4;
	public SkinWidth = 0.015;
	/** Slopes steeper than this are walls, not floor. */
	public MaxFloorAngleDegrees = 46;
	public FloorProbeDistance = 0.08;

	/** Velocity in world space; the character moves by Velocity * dt on MoveAndSlide, sliding along what it hits. */
	public readonly Velocity = new Vec3();
	public IsOnFloor = false;
	public readonly FloorNormal = Vec3.Up();
	/** Entity standing under the character (0 / undefined = none). */
	public GroundEntityId = 0;

	protected readonly BodyType = PhysBodyType.Kinematic;
	protected override readonly ObjectKind = PhysObjectKind.Character;

	/** Set once the first MoveAndSlide result has been received - before that, the physics state is just defaults. */
	private _moveSent = false;
	private _hasResult = false;

	public constructor() {
		super();
		this.Layer = CollisionLayer.Character;
		this.Mask = CollisionLayer.All;
	}

	/** Gravity of the loaded world (Godot: IPhysicsWorld.Gravity). */
	public get Gravity(): Vec3 { return this.Engine.Physics.Gravity; }

	/** True when at least one MoveAndSlide round trip has completed, i.e. Velocity/IsOnFloor are real simulation results. */
	protected get HasMoveResult(): boolean { return this._hasResult; }

	public override Awake(): void {
		this.Shape = Shapes.Capsule(this.Radius, this.Height);
		super.Awake();

		this.Engine.Physics.RegisterCharacter(this.Entity.Id);
		this.Transform.IsPhysicsDriven = true;
		this.Transform.PreviousPosition.CopyFrom(this.Transform.Position);
	}

	public override OnPhysicsSync(): void {
		const body = this.BodyState;
		if (body) this.Transform.PushPhysicsPose(body.Position, this.Transform.Rotation);

		const state = this.Engine.Physics.GetCharacterState(this.Entity.Id);
		if (state && this._moveSent) {
			this._hasResult = true;
			this.IsOnFloor = state.IsOnFloor;
			this.FloorNormal.CopyFrom(state.FloorNormal);
			this.GroundEntityId = state.GroundEntityId;

			// Feed the plane-clipped velocity back, same as id's `current.velocity = clipVelocity` and Godot's own
			// MoveAndSlide: without this a wall/corner hit stops the position but leaves Velocity pointing full-speed
			// into the obstacle - the corner-stuck bug.
			this.Velocity.CopyFrom(state.Velocity);
		}
	}

	/**
	 * Queues one move: Velocity * dt, sliding along anything hit. Call once per OnPhysicsUpdate. (Position is not
	 * changed immediately - see the class comment.)
	 */
	public MoveAndSlide(_dt: number): void {
		this.Engine.Physics.MoveCharacter(this.Entity.Id, this.Velocity, this.Layer, this.Mask, {
			maxSlideIterations: this.MaxSlideIterations,
			skinWidth: this.SkinWidth,
			maxFloorAngleDegrees: this.MaxFloorAngleDegrees,
			floorProbeDistance: this.FloorProbeDistance,
		});
		this._moveSent = true;
	}

	/**
	 * Teleport without sliding (respawn, cutscenes). Momentum is cleared too - otherwise a respawn after a long fall would
	 * keep the fall speed. Call it BEFORE the mover in the entity's component list (or from a script that runs earlier),
	 * so the mover starts its tick from the cleared velocity.
	 */
	public Teleport(position: Vec3): void {
		this.Velocity.Set(0, 0, 0);
		this.Transform.Teleport(position);
		this.Engine.Physics.SetPose(this.Entity.Id, this.Transform.ToFlat());
	}

	public Face(rotation: Quat): void { this.Transform.Rotation.CopyFrom(rotation); }
}
