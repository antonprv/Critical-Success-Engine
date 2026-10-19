// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ALL_LAYERS, SdfOp, SegmentEdit } from "@cse/sdf";
import { Component } from "../../Core/Component";

/**
 * A curve of the SDF world that grows: its head wanders from where the
 * entity stands, and every `Piece` metres the tube behind it gets a piece -
 * a round cone from the last point to the head (Engine.Sdf.Add: a real edit,
 * felt by the physics; the oldest fold into the world's base). Its radius
 * swells and thins along its length. A worm, a root, a vine; with Op
 * Subtract, a burrow.
 */
export class SdfWorm extends Component {
	/** Metres a second the head moves. */
	public Speed = 1.5;

	/** The tube's radius, and how much it swells and thins (a share of it). */
	public Radius = 0.35;

	public Pulse = 0.3;

	/** The length of a piece (an edit each). */
	public Piece = 0.4;

	/** Radians a second the head turns at most. */
	public Turn = 1.2;

	/** How far its axis rises and dips around where it started. */
	public Rise = 0.4;

	/** It turns back inside a square this far around where it started. */
	public Area = 8;

	/** It stops growing past this length (metres; 0: never). */
	public MaxLength = 0;

	public Op = SdfOp.SmoothUnion;

	public SmoothK = 0.15;

	public MaterialId = 0;

	public Layer = 1;

	public Mask = ALL_LAYERS;

	/** How long it has grown (metres). */
	public Length = 0;

	/** Pieces laid. */
	public Pieces = 0;

	private _start: [ number, number, number ] = [ 0, 0, 0 ];

	private _head: [ number, number, number ] = [ 0, 0, 0 ];

	private _last: [ number, number, number ] = [ 0, 0, 0 ];

	private _lastRadius = 0;

	private _heading = 0;

	private _time = 0;

	public override Start(): void {
		this._start = this.Transform.Position.ToTuple();
		this._head = [ ...this._start ];
		this._last = [ ...this._start ];
		this._lastRadius = this.RadiusAt( 0 );
	}

	public override Update( dt: number ): void {
		if ( this.MaxLength > 0 && this.Length >= this.MaxLength ) {
			return;
		}
		this._time += dt;

		// wandering: the turn rate drifts; outside the area, back to the middle
		const dx = this._start[0] - this._head[0];
		const dz = this._start[2] - this._head[2];
		const outside = Math.max( Math.abs( dx ), Math.abs( dz ) ) > this.Area;
		const home = Math.atan2( dz, dx );
		const drift = Math.sin( this._time * 0.7 ) * 0.6 + Math.sin(
			this._time * 1.9 + 1,
		) * 0.4;
		// the way home as an angle off the heading, -pi..pi: full turn when
		// heading away (a sine of it would be 0 there)
		const off = Math.atan2(
			Math.sin( home - this._heading ),
			Math.cos( home - this._heading ),
		);
		const turn = outside ? off * 2 : drift;

		this._heading += Math.max( -1, Math.min( 1, turn ) ) * this.Turn * dt;

		const step = this.Speed * dt;

		this._head[0] += Math.cos( this._heading ) * step;
		this._head[2] += Math.sin( this._heading ) * step;
		this.Length += step;
		this._head[1] = this._start[1] + Math.sin(
			this.Length * 0.6,
		) * this.Rise;

		const gone = Math.hypot(
			this._head[0] - this._last[0],
			this._head[1] - this._last[1],
			this._head[2] - this._last[2],
		);

		if ( gone < this.Piece ) {
			return;
		}

		const radius = this.RadiusAt( this.Length );

		this.Engine.Sdf.Add(
			SegmentEdit( this._last, this._head, this._lastRadius, radius, {
				Op: this.Op,
				SmoothK: this.SmoothK,
				MaterialId: this.MaterialId,
				Layer: this.Layer,
				Mask: this.Mask,
			} ),
		);
		this.Pieces++;
		this._last = [ ...this._head ];
		this._lastRadius = radius;
	}

	/** The radius at a length along it. */
	private RadiusAt( length: number ): number {
		return this.Radius * ( 1 + this.Pulse * Math.sin( length * 1.7 ) );
	}
}
