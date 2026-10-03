// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysBodyType, PhysObjectKind } from "../../../Workers/Common/CommonEnums";
import type { Entity } from "../../Core/Entity";
import { CollisionLayer } from "../../Core/CollisionLayer";
import { Shapes } from "../../Core/Shapes";
import { Despawn } from "../../Core/EntityPool";
import { Vec3 } from "../../Math/Vec3";
import { PhysicsBody } from "./PhysicsBodies";
import { DefaultGravity } from "../../../Workers/Common/EngineConstants";

/** Implement on any component of a projectile's entity to get the single, unambiguous "first hit" callback. */
export interface IProjectileHitListener {
	OnProjectileHit(point: Vec3, normal: Vec3, hitEntity: Entity | undefined): void;
}

function IsHitListener(component: object): component is IProjectileHitListener {
	return typeof (component as IProjectileHitListener).OnProjectileHit === "function";
}

/**
 * Fast body (bullets, rockets), port of BepuProjectile3D. Each step it sweeps a sphere along `Velocity * dt` instead of
 * using the solver, so it can't tunnel. Time spent waiting for a sweep result is added to the next sweep.
 */
export class Projectile extends PhysicsBody {
	public Radius = 0.05;
	public MaxLifetimeSeconds = 5;
	public DestroyOnHit = true;
	public ApplyGravity = false;
	public Gravity = DefaultGravity[1];

	public readonly Velocity = new Vec3();

	protected readonly BodyType = PhysBodyType.Kinematic;
	protected override readonly ObjectKind = PhysObjectKind.Projectile;

	private _lifetime = 0;
	private _resolved = false;
	private _queryInFlight = false;
	private _pendingDt = 0;
	/** Bumped on every reuse, so a sweep answer from a previous life is recognised and dropped. */
	private _life = 0;

	public constructor() {
		super();
		this.Layer = CollisionLayer.Projectile;
		this.Mask = CollisionLayer.World;
	}

	public override Awake(): void {
		this.Shape = Shapes.Sphere(this.Radius);
		super.Awake();
	}

	public override OnEnable(): void {
		this._life++;
		this._lifetime = 0;
		this._resolved = false;
		this._queryInFlight = false;
		this._pendingDt = 0;
		super.OnEnable();
	}

	public override OnPhysicsUpdate(dt: number): void {
		if (this._resolved) return;

		this._lifetime += dt;
		this._pendingDt += dt;
		if (this.ApplyGravity) this.Velocity.Y += this.Gravity * dt;

		if (this._lifetime >= this.MaxLifetimeSeconds) {
			this._resolved = true;
			Despawn(this.Entity);
			return;
		}
		if (this._queryInFlight) return;

		this._queryInFlight = true;
		const sweepDt = this._pendingDt;
		const life = this._life;
		this._pendingDt = 0;

		void this.Engine.Physics
			.SweepProjectile(this.Entity.Id, this.Transform.Position, this.Velocity, sweepDt, this.Radius, this.Layer, this.Mask)
			.then((result) => {
				if (life !== this._life) return;
				this._queryInFlight = false;
				if (this._resolved || this.Entity.IsDestroyed) return;

				this.Transform.Teleport(Vec3.FromTuple(result.position));
				this.Engine.Physics.SetPose(this.Entity.Id, this.Transform.ToFlat());

				if (!result.hit) return;
				this._resolved = true;

				const hitEntity = this.Engine.World.Get(result.hitEntityId);
				for (const component of this.Entity.Components) {
					if (IsHitListener(component)) component.OnProjectileHit(Vec3.FromTuple(result.point), Vec3.FromTuple(result.normal), hitEntity);
				}
				if (this.DestroyOnHit) Despawn(this.Entity);
			});
	}
}
