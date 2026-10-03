// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysBodyType, PhysObjectKind } from "../../../Workers/Common/CommonEnums";
import type { PhysicsShapeDescriptor } from "../../../Workers/Protocol/PhysicsGameLogicProtocol";
import { Component } from "../../Core/Component";
import { CollisionLayer } from "../../Core/CollisionLayer";
import { Shapes } from "../../Core/Shapes";
import { Quat } from "../../Math/Quat";
import { Vec3 } from "../../Math/Vec3";
import type { BodyState } from "../../Services/PhysicsService";

/**
 * Common plumbing of every body component (BepuBody3D in the Godot project): collision layer/mask fields and
 * registering/removing the body with the physics world under this entity's id.
 */
export abstract class PhysicsBody extends Component {
	public Shape: PhysicsShapeDescriptor = Shapes.Box(1, 1, 1);
	public Layer: number = CollisionLayer.World;
	public Mask: number = CollisionLayer.All;

	protected abstract readonly BodyType: PhysBodyType;
	protected readonly ObjectKind: PhysObjectKind = PhysObjectKind.Solid;

	protected GetSpawnExtras(): { mass?: number; continuousDetection?: boolean; } { return {}; }

	public override Awake(): void {
		this.Engine.Physics.SpawnBody({
			entityId: this.Entity.Id,
			bodyType: this.BodyType,
			shape: this.Shape,
			transform: this.Transform.ToFlat(),
			layer: this.Layer,
			mask: this.Mask,
			objectKind: this.ObjectKind,
			...this.GetSpawnExtras(),
		});
	}

	public override OnDestroy(): void {
		this.Engine.Physics.RemoveBody(this.Entity.Id);
	}

	protected get BodyState(): BodyState | undefined {
		return this.Engine.Physics.GetBodyState(this.Entity.Id);
	}
}

/** Immobile level geometry (BepuStaticBody3D). Any shape, including Shapes.TriangleMesh. Baked into the broadphase - never moves. */
export class StaticBody extends PhysicsBody {
	protected readonly BodyType = PhysBodyType.Static;
}

/** Regular dynamic object (BepuRigidBody3D): the simulation owns its pose, this component copies it onto the Transform. */
export class RigidBody extends PhysicsBody {
	public Mass = 1;
	/** Sweep-based collision for fast, small bodies. */
	public ContinuousDetection = false;

	protected readonly BodyType = PhysBodyType.Dynamic;

	protected override GetSpawnExtras(): { mass: number; continuousDetection: boolean; } {
		return { mass: this.Mass, continuousDetection: this.ContinuousDetection };
	}

	public override Awake(): void {
		super.Awake();
		this.Transform.IsPhysicsDriven = true;
		this.Transform.PreviousPosition.CopyFrom(this.Transform.Position);
		this.Transform.PreviousRotation.CopyFrom(this.Transform.Rotation);
	}

	public override OnPhysicsSync(): void {
		const state = this.BodyState;
		if (state) this.Transform.PushPhysicsPose(state.Position, state.Rotation);
	}

	/** Latest simulated linear velocity (as of the last physics step). */
	public get LinearVelocity(): Vec3 { return this.BodyState?.LinearVelocity ?? new Vec3(); }
	public get AngularVelocity(): Vec3 { return this.BodyState?.AngularVelocity ?? new Vec3(); }

	public SetLinearVelocity(velocity: Vec3): void { this.Engine.Physics.SetLinearVelocity(this.Entity.Id, velocity); }
	public SetAngularVelocity(velocity: Vec3): void { this.Engine.Physics.SetAngularVelocity(this.Entity.Id, velocity); }

	/** `worldPoint` is where the impulse is applied (world space); the body centre is its transform position. */
	public ApplyImpulse(impulse: Vec3, worldPoint?: Vec3): void {
		const offset = worldPoint ? worldPoint.Sub(this.Transform.Position) : new Vec3();
		this.Engine.Physics.ApplyImpulse(this.Entity.Id, impulse, offset);
	}

	public Teleport(position: Vec3, rotation: Quat = this.Transform.Rotation): void {
		this.Transform.Teleport(position, rotation);
		this.Engine.Physics.SetPose(this.Entity.Id, this.Transform.ToFlat());
	}
}

/**
 * Kinematic body driven by whatever moves this entity's Transform - an Update script, a tween, anything
 * (BepuAnimatableBody3D). It never reacts to forces, but everything else collides with it and gets carried along:
 * each physics step the pose is pushed to the simulation, which derives velocity from the movement since last time.
 */
export class KinematicBody extends PhysicsBody {
	protected readonly BodyType = PhysBodyType.Kinematic;

	public override OnPhysicsUpdate(): void {
		this.Engine.Physics.SetKinematicPose(this.Entity.Id, this.Transform.ToFlat());
	}
}
