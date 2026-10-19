// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import { SdfDynamicFlags, SdfOp, SdfShape } from "@cse/sdf";

/**
 * Keeps the SDF world busy: `Holes` dynamic edits circling through it (moved
 * every frame: drawn by the GPU, never written anywhere; with `Physics` the
 * chunks they reach are remeshed for the physics alone, so balls fall into
 * the holes and roll over the blobs) - holes, and every other one a blob -
 * and a pit dug every `DigEvery` seconds (recent edits, remeshed and given to
 * the physics; the oldest fold into the base).
 */
export class SdfDigger extends Component {
	/** Dynamic edits circling (at most MAX_DYNAMIC_EDITS). */
	public Holes = 1;

	/** Radius of their circle. */
	public Radius = 6;

	/** Radians per second around the circle. */
	public Speed = 0.6;

	/** Whether the circling edits shape the physics too. */
	public Physics = true;

	/** Seconds between two pits; 0: no pits. */
	public DigEvery = 1;

	private readonly _holes: number[] = [];

	private _angle = 0;

	private _timer = 0;

	private _dug = 0;

	public override Start(): void {
		for ( let i = 0; i < this.Holes; i++ ) {
			const blob = i % 2 === 1;

			this._holes.push( this.Engine.Sdf.AddDynamic( {
				Shape: SdfShape.Sphere,
				Op: blob ? SdfOp.SmoothUnion : SdfOp.SmoothSubtract,
				Params: [ blob ? 0.8 : 1.5, 0, 0, 0 ],
				SmoothK: 0.4,
				MaterialId: blob ? 6 : 2,
				Flags: this.Physics ? SdfDynamicFlags.Physics : SdfDynamicFlags.None,
			} ).Id );
		}
	}

	public override Update( dt: number ): void {
		this._angle += this.Speed * dt;
		for ( let i = 0; i < this._holes.length; i++ ) {
			// spread around the circle, and over three rings
			const angle = this._angle + i * Math.PI * 2 / this._holes.length;
			const radius = this.Radius * ( 0.5 + ( i % 3 ) * 0.25 );

			this.Engine.Sdf.UpdateDynamic( this._holes[i]!, {
				Position: [
					Math.cos( angle ) * radius,
					0.3,
					Math.sin( angle ) * radius,
				],
			} );
		}
		if ( this.DigEvery <= 0 ) {
			return;
		}
		this._timer += dt;
		while ( this._timer >= this.DigEvery ) {
			this._timer -= this.DigEvery;
			this.Dig();
		}
	}

	/**
	 * A pit somewhere on the ground: a recent edit, remeshed. Where: the R2
	 * sequence over a 24 m square - never the same place twice, spread evenly
	 * however many were dug.
	 */
	private Dig(): void {
		this._dug++;

		const spot = ( step: number ): number => (
			( ( 0.5 + this._dug * step ) % 1 ) * 24 - 12
		);

		this.Engine.Sdf.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			// 1 / g and 1 / g^2, g the plastic number
			Position: [ spot( 0.7548776662 ), 0, spot( 0.5698402910 ) ],
			Params: [ 0.9, 0, 0, 0 ],
			MaterialId: 5,
		} );
	}
}
