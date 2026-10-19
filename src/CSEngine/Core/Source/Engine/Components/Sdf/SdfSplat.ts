// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	ALL_LAYERS,
	RotationFromY,
	SdfOp,
	SdfShape,
} from "@cse/sdf";
import { Component } from "../../Core/Component";
import type { Entity } from "../../Core/Entity";
import type { Vec3 } from "../../Math/Vec3";
import {
	Projectile,
	type IProjectileHitListener,
} from "../Physics/Projectile";

/**
 * A splat in flight (plan: the SDF's L2, what sticks): put it on an entity
 * with a Projectile. While it flies it is a dynamic edit - a blob of the
 * SDF world drawn by the GPU, stretched along its velocity, merging with
 * what it nears if its mask allows - and where the projectile hits, it
 * stays: Engine.Sdf.Splat leaves an edit flattened against the surface. Any
 * number thrown pile up (the oldest fold into the world's base).
 */
export class SdfSplat extends Component implements IProjectileHitListener {
	/** Its size (the edit it leaves keeps this volume). */
	public Radius = 0.25;

	public MaterialId = 0;

	/** Its layer and the layers it merges with, flying and stuck. */
	public Layer = 1;

	public Mask = ALL_LAYERS;

	/** How flat it lies where it landed (see SdfSplatInit.Flatness). */
	public Flatness = 0.45;

	/** How long it stretches along its velocity: length per m/s. */
	public Stretch = 0.03;

	/**
	 * Where it hits it takes matter away instead of sticking: a crater, and
	 * shots that keep hitting the same place go through.
	 */
	public Carve = false;

	private _blob = 0;

	public override Start(): void {
		this.Show();
	}

	/** Taken out of a pool again: flying anew. */
	public override OnEnable(): void {
		this.Show();
	}

	private Show(): void {
		if ( this._blob !== 0 ) {
			return;
		}
		this._blob = this.Engine.Sdf.AddDynamic( {
			Shape: SdfShape.Ellipsoid,
			Op: SdfOp.SmoothUnion,
			Position: this.Transform.Position.ToTuple(),
			Params: [ this.Radius, this.Radius, this.Radius, 0 ],
			SmoothK: this.Radius * 0.6,
			MaterialId: this.MaterialId,
			Layer: this.Layer,
			Mask: this.Mask,
		} ).Id;
	}

	public override Update(): void {
		if ( this._blob === 0 ) {
			return;
		}

		const velocity = this.Entity.RequireComponent( Projectile ).Velocity;
		const speed = velocity.Length();
		// longer along its flight, thinner across (its volume kept)
		const along = this.Radius * ( 1 + speed * this.Stretch );
		const across = this.Radius * Math.sqrt( this.Radius / along );
		const rotation = speed > 1e-6
			? RotationFromY(
				velocity.X / speed,
				velocity.Y / speed,
				velocity.Z / speed,
			)
			: [ 0, 0, 0, 1 ] as [ number, number, number, number ];

		this.Engine.Sdf.UpdateDynamic( this._blob, {
			Position: this.Transform.Position.ToTuple(),
			Rotation: rotation,
			Params: [ across, along, across, 0 ],
		} );
	}

	public OnProjectileHit(
		point: Vec3,
		normal: Vec3,
		_hit: Entity | undefined,
	): void {
		this.Engine.Sdf.Splat( {
			Position: point.ToTuple(),
			Normal: normal.ToTuple(),
			Radius: this.Radius,
			Flatness: this.Flatness,
			MaterialId: this.MaterialId,
			Layer: this.Layer,
			Mask: this.Mask,
			Carve: this.Carve,
		} );
	}

	/** Back in a pool, or destroyed: no blob any more. */
	public override OnDisable(): void {
		this.Hide();
	}

	public override OnDestroy(): void {
		this.Hide();
	}

	private Hide(): void {
		if ( this._blob !== 0 ) {
			this.Engine.Sdf.RemoveDynamic( this._blob );
			this._blob = 0;
		}
	}
}
