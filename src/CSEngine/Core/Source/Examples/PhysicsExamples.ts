// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Code of guide 04 (docs/guides/04-physics.md).

// <<imports
import { CollisionLayer } from "../Engine/Core/CollisionLayer";
import { Component } from "../Engine/Core/Component";
import type { Entity } from "../Engine/Core/Entity";
import { RigidBody } from "../Engine/Components/Physics/PhysicsBodies";
import { Vec3 } from "../Engine/Math/Vec3";
// >>

// <<bumper
/** Pushes any rigid body that hits this entity away from it. Put it next to a StaticBody (or any body). */
export class Bumper extends Component {
	public Strength = 8;

	public override OnCollisionEnter(other: Entity): void {
		const body = other.GetComponent(RigidBody);
		if (!body) return;

		const away = other.Transform.Position.Sub(this.Transform.Position);
		away.Y = 0.3; // a little lift
		body.ApplyImpulse(away.Normalized().Mul(this.Strength));
	}
}
// >>

// <<range-finder
/** Shows the distance to whatever is in front of this entity. Physics queries are asynchronous: they return promises. */
export class RangeFinder extends Component {
	public MaxDistance = 50;

	private _inFlight = false;

	public override OnPhysicsUpdate(): void {
		if (this._inFlight) return; // one question at a time
		this._inFlight = true;

		const forward = this.Transform.Rotation.Rotate(Vec3.Forward());

		void this.Engine.Physics
			.SweepSphere(
				this.Transform.Position, forward, this.MaxDistance, 0.05,
				CollisionLayer.All, CollisionLayer.World | CollisionLayer.Prop, this.Entity.Id
			)
			.then((result) => {
				this._inFlight = false;
				this.Engine.Ui.SetHud("range", result.hit ? `Range: ${result.distance.toFixed(1)} m` : "Range: -");
			});
	}
}
// >>
