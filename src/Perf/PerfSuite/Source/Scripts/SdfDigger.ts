// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import { SdfEditFlags, SdfOp, SdfShape } from "@cse/sdf";

/**
 * Keeps the SDF world busy: a hole circling through it (one edit, kept and
 * moved every frame: chunks remeshed all the time) and a pit dug every
 * `DigEvery` seconds (recent edits; the oldest fold into the base).
 */
export class SdfDigger extends Component {
	/** Radius of the hole's circle. */
	public Radius = 6;

	/** Radians per second around the circle. */
	public Speed = 0.6;

	/** Seconds between two pits; 0: no pits. */
	public DigEvery = 1;

	private _hole = 0;

	private _angle = 0;

	private _timer = 0;

	private _dug = 0;

	public override Start(): void {
		this._hole = this.Engine.Sdf.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothSubtract,
			Params: [ 1.5, 0, 0, 0 ],
			SmoothK: 0.4,
			MaterialId: 2,
			Flags: SdfEditFlags.Keep,
		} ).Id;
	}

	public override Update( dt: number ): void {
		this._angle += this.Speed * dt;
		this.Engine.Sdf.Update( this._hole, {
			Position: [
				Math.cos( this._angle ) * this.Radius,
				0.3,
				Math.sin( this._angle ) * this.Radius,
			],
		} );
		if ( this.DigEvery <= 0 ) {
			return;
		}
		this._timer += dt;
		if ( this._timer < this.DigEvery ) {
			return;
		}
		this._timer = 0;
		this._dug++;
		this.Engine.Sdf.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [
				( ( this._dug * 7 ) % 24 ) - 12,
				0,
				( ( this._dug * 11 ) % 24 ) - 12,
			],
			Params: [ 0.9, 0, 0, 0 ],
			MaterialId: 5,
		} );
	}
}
