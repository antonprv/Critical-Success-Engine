// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SdfBaseLayer } from "./BaseLayers";

/** A Mandelbulb as the world's base (MandelbulbBase). */
export interface MandelbulbOptions {
	/** The power of the triplex map (8: the classic bulb). Default 8. */
	Power?: number;
	/** Iterations at most. Default 10. */
	Iterations?: number;
	/** Where a point counts as escaped (|z|). Default 4. */
	Bailout?: number;
	/**
	 * The Julia constant added every iteration; null: the point itself
	 * (the Mandelbulb proper). Default null.
	 */
	Julia?: readonly [ number, number, number ] | null;
	/**
	 * Inverts space in a sphere of this radius (fractal units) around the
	 * center before iterating: the bulb's outside folds into a cave around
	 * the center, the bulb becomes its walls - "inside the Mandelbulb".
	 * 0: no inversion. Default 0.
	 */
	Invert?: number;
	/** World units per fractal unit. Default 1. */
	Scale?: number;
	/** Where the fractal's origin lies in the world. Default 0, 0, 0. */
	Center?: readonly [ number, number, number ];
	/**
	 * The surface lies this far (world units) outside the set, as a ray
	 * marcher stops a hair before it: the field is the estimate less this.
	 * About half the finest cell. Default 0.02.
	 */
	Thickness?: number;
	/**
	 * Shrinks the estimate: it is a bound only near the set (and the
	 * inversion's scale is taken at the point). Default 0.5.
	 */
	DistanceScale?: number;
	/**
	 * The two materials the orbit trap fades between (how close the orbit
	 * came to the origin). Default 1 and 3.
	 */
	Materials?: readonly [ number, number ];
}

/**
 * The world's base L0 as a Mandelbulb (plan.md 12.1): the triplex map
 * z -> z^P + c in spherical coordinates, the distance estimated from the
 * orbit's end (0.5 r ln r / dr; negative where it stays inside the unit
 * sphere: continuous across the set's edge, and close to the set at any
 * iteration count).
 * With `Julia` the constant c is fixed; with `Invert` space is turned
 * inside out in a sphere first (p -> R^2 p / |p|^2, as in "Inside the
 * Mandelbulb", machina-infinitum), and the estimate is taken back to world
 * units by the inversion's scale at the point (|p|^2 / R^2: an inversion
 * is conformal) instead of a hand-tuned factor.
 *
 * The materials come from an orbit trap: how near the origin the orbit
 * passed, faded between two ids.
 */
export class MandelbulbBase implements SdfBaseLayer {
	public readonly Power: number;

	public readonly Iterations: number;

	public readonly Bailout: number;

	public readonly Julia: readonly [ number, number, number ] | null;

	public readonly Invert: number;

	public readonly Scale: number;

	public readonly Center: readonly [ number, number, number ];

	public readonly Thickness: number;

	public readonly DistanceScale: number;

	public readonly Materials: readonly [ number, number ];

	/** Material at the point of the last Distance. */
	public MaterialId: number;

	public MaterialB: number;

	public MaterialMix = 0;

	public constructor( options: MandelbulbOptions = {} ) {
		this.Power = options.Power ?? 8;
		this.Iterations = options.Iterations ?? 10;
		this.Bailout = options.Bailout ?? 4;
		this.Julia = options.Julia ?? null;
		this.Invert = options.Invert ?? 0;
		this.Scale = options.Scale ?? 1;
		this.Center = options.Center ?? [ 0, 0, 0 ];
		this.Thickness = options.Thickness ?? 0.02;
		this.DistanceScale = options.DistanceScale ?? 0.5;
		this.Materials = options.Materials ?? [ 1, 3 ];
		this.MaterialId = this.Materials[0];
		this.MaterialB = this.Materials[1];
	}

	public Distance( x: number, y: number, z: number, detail = 0 ): number {
		const scale = this.Scale;
		let px = ( x - this.Center[0] ) / scale;
		let py = ( y - this.Center[1] ) / scale;
		let pz = ( z - this.Center[2] ) / scale;
		// world units per unit of the iterated space at this point
		let toWorld = scale;
		const radius = this.Invert;
		// nearer than this to the center nothing can be: the set lies within
		// the bailout sphere, its inverse outside the sphere of R^2 / bailout
		let clear = -Infinity;

		if ( radius > 0 ) {
			const r2 = px * px + py * py + pz * pz;
			// the center itself goes to infinity: far outside the set
			const s = radius * radius / Math.max( r2, 1e-30 );

			clear = ( radius
				* radius
				/ this.Bailout - Math.sqrt( r2 ) ) * scale;
			px *= s;
			py *= s;
			pz *= s;
			toWorld /= s;
		}

		const raw = this.Estimate( px, py, pz, detail / toWorld );
		// at the inversion's center the orbit starts at infinity: no
		// estimate there, the bound answers
		const estimate = raw > -1e30 && raw < 1e30 ? raw : 0;

		// the estimate is scaled by the inversion at the point: near the
		// center that shrinks it to nothing, the bound keeps it honest
		return Math.max(
			estimate * toWorld * this.DistanceScale,
			clear,
		) - this.Thickness;
	}

	/**
	 * The estimate at a point of the iterated space: 0.5 r ln r / dr at the
	 * orbit's end; the orbit stops early where its next features would be
	 * finer than `detail` (in this space's units: plan.md 21.8 item 13).
	 * Sets the materials.
	 */
	private Estimate(
		qx: number,
		qy: number,
		qz: number,
		detail: number,
	): number {
		const power = this.Power;
		const bailout = this.Bailout;
		const julia = this.Julia;
		const cx = julia ? julia[0] : qx;
		const cy = julia ? julia[1] : qy;
		const cz = julia ? julia[2] : qz;
		// d|z|/d|q|: the Mandelbulb's grows by 1 each step (c moves with
		// q), a Julia set's doesn't
		const step = julia ? 0 : 1;
		let zx = qx;
		let zy = qy;
		let zz = qz;
		let dr = 1;
		let r = Math.sqrt( zx * zx + zy * zy + zz * zz );
		let trap = r;

		for ( let i = 0; i < this.Iterations && r <= bailout; i++ ) {
			// what the next iteration adds is about 1 / dr across here:
			// finer than the detail asked for, it would only alias
			if ( detail * dr > 1 ) {
				break;
			}
			if ( power === 2 ) {
				// the triplex square without trigonometry: r^2 and the
				// doubled angles in closed form (one root, no acos/atan2)
				const rho = Math.sqrt( zx * zx + zy * zy );
				const scale = rho > 0 ? 2 * zz / rho : 0;
				const x = zx;

				dr = 2 * r * dr + step;
				zx = scale * ( x * x - zy * zy ) + cx;
				zy = scale * 2 * x * zy + cy;
				zz = zz * zz - rho * rho + cz;
			} else {
				const theta = Math.acos(
					Math.max( -1, Math.min( 1, zz / ( r || 1 ) ) ),
				)
					* power;
				const phi = Math.atan2( zy, zx ) * power;
				const rp = Math.pow( r, power - 1 );

				dr = rp * power * dr + step;

				const zr = rp * r;
				const sinTheta = Math.sin( theta );

				zx = zr * sinTheta * Math.cos( phi ) + cx;
				zy = zr * sinTheta * Math.sin( phi ) + cy;
				zz = zr * Math.cos( theta ) + cz;
			}
			r = Math.sqrt( zx * zx + zy * zy + zz * zz );
			trap = Math.min( trap, r );
		}

		this.MaterialMix = Math.min( 1, trap / bailout * 2 );
		// from wherever the orbit ended, escaped or not: continuous across
		// the set's edge, negative where it stays in the unit sphere. The
		// set maps onto itself, so an orbit cut short (coarser detail) still
		// ends near the unit sphere on its edge: the shape at any iteration
		// count stays close to the set's (the level of the bailout sphere
		// instead would swell it with every iteration left out)
		return 0.5 * Math.log( Math.max( r, 1e-30 ) ) * r / dr;
	}
}
