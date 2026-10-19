// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import { CollisionLayer } from "@cse/core/Engine/Core/CollisionLayer";
import { Comp, Ent, type EntityManifest } from "@cse/core/Engine/Core/EntityManifest";
import { Despawn, EntityPool } from "@cse/core/Engine/Core/EntityPool";
import { Shapes } from "@cse/core/Engine/Core/Shapes";
import { RigidBody } from "@cse/core/Engine/Components/Physics/PhysicsBodies";
import { SdfBody } from "@cse/core/Engine/Components/Sdf/SdfBody";
import { Vec3 } from "@cse/core/Engine/Math/Vec3";
import { SdfOp, SdfShape } from "@cse/sdf";

/**
 * Fires balls of the SDF world (rigid bodies drawn as SDF spheres, on a
 * layer of their own: they don't melt into what they hit) at whatever is in
 * front of it (-Z), sweeping side to side; each lives `Life` seconds and
 * goes back to the pool.
 */
export class SdfCannon extends Component {
	/** Seconds between two shots. */
	public Every = 0.35;

	/** Metres per second. */
	public Speed = 26;

	/**
	 * Metres per second up: the drop over the flight made up, so the balls
	 * hit at the height they're fired from.
	 */
	public Lift = 2.3;

	/** Balls in the air at most (the pool's size). */
	public InFlight = 8;

	/** Radians either side it sweeps. */
	public Sweep = 0.35;

	public Fired = 0;

	private _pool: EntityPool | null = null;

	private _timer = 0;

	public override Update( dt: number ): void {
		this._pool ??= new EntityPool( this.Engine.World, SdfCannon.Ball, { MaxSize: this.InFlight } );
		this._timer += dt;
		while ( this._timer >= this.Every ) {
			this._timer -= this.Every;
			this.Fire();
		}
	}

	private Fire(): void {
		const yaw = Math.sin( this.Fired++ * 0.9 ) * this.Sweep;
		const velocity = new Vec3(
			Math.sin( yaw ) * this.Speed,
			this.Lift,
			-Math.cos( yaw ) * this.Speed,
		);

		this._pool!.Acquire( this.Transform.Position.Clone(), ( ball ) => {
			ball.RequireComponent( Launch ).Velocity = velocity;
		} );
	}

	private static Ball(): EntityManifest {
		return Ent( "Shot", [
			Comp( RigidBody, { Shape: Shapes.Sphere( 0.25 ), Mass: 4, Layer: CollisionLayer.Prop, ContinuousDetection: true } ),
			Comp( SdfBody, {
				Shape: SdfShape.Sphere,
				Params: [ 0.25, 0, 0, 0 ],
				Op: SdfOp.Union,
				SmoothK: 0,
				MaterialId: 6,
				Layer: 2,
				Mask: 2,
			} ),
			Comp( Launch ),
		] );
	}
}

/** Sets off a body with a velocity when it starts (again, out of a pool), and sends it back after `Life` seconds. */
export class Launch extends Component {
	public Velocity = new Vec3();

	public Life = 4;

	private _age = 0;

	public override Start(): void {
		this.Go();
	}

	public override OnEnable(): void {
		this.Go();
	}

	public override Update( dt: number ): void {
		this._age += dt;
		if ( this._age >= this.Life ) {
			Despawn( this.Entity );
		}
	}

	private Go(): void {
		this._age = 0;
		this.Entity.RequireComponent( RigidBody ).SetLinearVelocity( this.Velocity );
	}
}
