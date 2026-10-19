// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import { Comp, Ent, type EntityManifest } from "@cse/core/Engine/Core/EntityManifest";
import { EntityPool } from "@cse/core/Engine/Core/EntityPool";
import { Projectile } from "@cse/core/Engine/Components/Physics/Projectile";
import { SdfSplat } from "@cse/core/Engine/Components/Sdf/SdfSplat";
import { Vec3 } from "@cse/core/Engine/Math/Vec3";
import { ALL_LAYERS } from "@cse/sdf";

/**
 * Throws SDF splats at whatever is in front of it (-Z), fanned out a little,
 * from a pool: each a projectile and a splat - a blob of the world while it
 * flies, an edit stuck where it lands. Every other one is on a layer of its
 * own (it sticks without merging), the rest merge with what they hit.
 */
export class SplatGun extends Component {
	/** Seconds between two throws. */
	public Every = 0.08;

	/** Metres per second. */
	public Speed = 14;

	/** Splats in flight at most (the pool's size). */
	public InFlight = 12;

	/**
	 * The shots take matter away where they hit (craters: SdfSplat.Carve)
	 * instead of sticking, all of one kind.
	 */
	public Carve = false;

	/** How wide the fan of directions is (1: a patch, 0: one spot). */
	public Spread = 1;

	/** The lowest of the fan's elevations (radians). */
	public Pitch = 0.2;

	/** Spots aimed at in turn, side by side (radians apart): a hole each. */
	public Spots = 1;

	public SpotGap = 0.2;

	/** How many stuck so far (thrown and landed). */
	public Thrown = 0;

	private _pool: EntityPool | null = null;

	private _timer = 0;

	public override Update( dt: number ): void {
		this._pool ??= new EntityPool(
			this.Engine.World,
			SplatGun.Splat,
			{ MaxSize: this.InFlight },
		);
		this._timer += dt;
		while ( this._timer >= this.Every ) {
			this._timer -= this.Every;
			this.Throw();
		}
	}

	private Throw(): void {
		const n = this.Thrown++;
		// a fan of directions that repeats: the pile grows over a patch
		const spot = ( n % this.Spots ) - ( this.Spots - 1 ) / 2;
		const yaw = ( ( n * 7 ) % 11 - 5 ) * 0.035 * this.Spread
			+ spot * this.SpotGap;
		const pitch = this.Pitch + ( ( n * 5 ) % 7 ) * 0.03 * this.Spread;
		const own = !this.Carve && n % 2 === 1;

		this._pool!.Acquire( this.Transform.Position.Clone(), ( entity ) => {
			entity.RequireComponent( Projectile ).Velocity.Set(
				Math.sin( yaw ) * this.Speed,
				Math.sin( pitch ) * this.Speed,
				-Math.cos( yaw ) * this.Speed,
			);

			const splat = entity.RequireComponent( SdfSplat );

			splat.MaterialId = this.Carve ? 1 : own ? 5 : 2;
			splat.Layer = own ? 2 : 1;
			splat.Mask = own ? 2 : ALL_LAYERS;
			splat.Carve = this.Carve;
		} );
	}

	private static Splat(): EntityManifest {
		return Ent( "Splat", [
			Comp( Projectile, {
				Radius: 0.15,
				ApplyGravity: true,
				// a lob, lighter than the engine's game gravity
				Gravity: -9.81,
				MaxLifetimeSeconds: 3,
			} ),
			Comp( SdfSplat, { Radius: 0.22 } ),
		] );
	}
}
