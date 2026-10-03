// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysBodyType, PhysObjectKind } from "../../../Workers/Common/CommonEnums";
import type { Entity } from "../../Core/Entity";
import { CollisionLayer } from "../../Core/CollisionLayer";
import { Shapes } from "../../Core/Shapes";
import { Vec3 } from "../../Math/Vec3";
import { PhysicsBody } from "./PhysicsBodies";

/** Implement on any component of a projectile's entity to get the single, unambiguous "first hit" callback. */
export interface IProjectileHitListener {
	OnProjectileHit(point: Vec3, normal: Vec3, hitEntity: Entity | undefined): void;
}

function IsHitListener(component: object): component is IProjectileHitListener {
	return typeof (component as IProjectileHitListener).OnProjectileHit === "function";
}

/**
 * Small fast-moving body (bullets, rockets, grenades) - port of BepuProjectile3D. Each physics step it sweeps a sphere
 * along `Velocity * dt` instead of leaning on the solver: a solver contact means "bounce/rest", a sweep hit means "stop
 * here, tell me exactly what and where, once" - and it cannot tunnel at any speed, because the sweep IS the movement.
 *
 * The sweep runs in the physics worker, so the answer arrives a little later; time that passes while a query is in
 * flight is accumulated and swept in the next one, so the projectile never slows down because of the round trip.
 */
export class Projectile extends PhysicsBody {
	public Radius = 0.05;
	public MaxLifetimeSeconds = 5;
	public DestroyOnHit = true;
	public ApplyGravity = false;
	public Gravity = -20;

	public readonly Velocity = new Vec3();

	protected readonly BodyType = PhysBodyType.Kinematic;
	protected override readonly ObjectKind = PhysObjectKind.Projectile;

	private _lifetime = 0;
	private _resolved = false;
	private _queryInFlight = false;
	private _pendingDt = 0;

	public constructor() {
		super();
		this.Layer = CollisionLayer.Projectile;
		this.Mask = CollisionLayer.World;
	}

	public override Awake(): void {
		this.Shape = Shapes.Sphere(this.Radius);
		super.Awake();
	}

	public override OnPhysicsUpdate(dt: number): void {
		if (this._resolved) return;

		this._lifetime += dt;
		this._pendingDt += dt;
		if (this.ApplyGravity) this.Velocity.Y += this.Gravity * dt;

		if (this._lifetime >= this.MaxLifetimeSeconds) {
			this._resolved = true;
			this.Entity.Destroy();
			return;
		}
		if (this._queryInFlight) return;

		this._queryInFlight = true;
		const sweepDt = this._pendingDt;
		this._pendingDt = 0;

		void this.Engine.Physics
			.SweepProjectile(this.Entity.Id, this.Transform.Position, this.Velocity, sweepDt, this.Radius, this.Layer, this.Mask)
			.then((result) => {
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
				if (this.DestroyOnHit) this.Entity.Destroy();
			});
	}
}
