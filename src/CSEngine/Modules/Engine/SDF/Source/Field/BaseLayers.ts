// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";

/**
 * Layer L0 (plan.md 4): the analytic, static ground the edits apply on top
 * of. Cached in bricks like the edits; it only changes with its parameters.
 */
export interface SdfBaseLayer {
	/**
	 * Signed distance (or a bound of it: never larger than the true one by
	 * more than 1 / Lipschitz) at a world point.
	 */
	Distance( x: number, y: number, z: number ): number;

	/** Material of the ground (at the point of the last Distance). */
	readonly MaterialId: number;

	/**
	 * Where the base fades between two materials (a baked layer): the second
	 * one and its share there. Default: none.
	 */
	readonly MaterialB?: number;
	readonly MaterialMix?: number;

	/** Its layer (an index) at the point of the last Distance. Default 0. */
	readonly LayerIndex?: number;
}

/** A flat ground: solid below `Height`. */
export class GroundPlane implements SdfBaseLayer {
	public constructor(
		public readonly Height = 0,
		public readonly MaterialId = 0,
	) {
	}

	public Distance( _x: number, y: number, _z: number ): number {
		return y - this.Height;
	}
}

export interface NoiseTerrainOptions {
	/** Mean ground height. */
	Height?: number;
	/** Height of the largest hills above (and dips below) the mean. */
	Amplitude?: number;
	/** Hills per world unit of the first octave. */
	Frequency?: number;
	/** Octaves of value noise, each twice as fine and half as tall. */
	Octaves?: number;
	Seed?: number;
	MaterialId?: number;
}

/**
 * Rolling hills: a height field of value-noise octaves. The distance is the
 * height above the ground divided by the steepest possible slope, a bound
 * that keeps sphere tracing from stepping through a hillside.
 */
export class NoiseTerrain implements SdfBaseLayer {
	public readonly Height: number;

	public readonly Amplitude: number;

	public readonly Frequency: number;

	public readonly Octaves: number;

	public readonly Seed: number;

	public readonly MaterialId: number;

	/** 1 / sqrt(1 + steepest slope^2). */
	private readonly _lipschitz: number;

	public constructor( options: NoiseTerrainOptions = {} ) {
		this.Height = options.Height ?? 0;
		this.Amplitude = options.Amplitude ?? 4;
		this.Frequency = options.Frequency ?? 0.05;
		this.Octaves = options.Octaves ?? 4;
		this.Seed = options.Seed ?? 1;
		this.MaterialId = options.MaterialId ?? 0;

		// the quintic fade's steepest slope is 15/8 per cell; every octave
		// adds the same (twice the frequency, half the height)
		const slope = this.Amplitude * this.Frequency * 1.875 * this.Octaves;

		this._lipschitz = 1 / FMath.Sqrt( 1 + slope * slope );
	}

	/** Ground height at (x, z). */
	public HeightAt( x: number, z: number ): number {
		let sum = 0;
		let amplitude = this.Amplitude;
		let frequency = this.Frequency;
		let norm = 0;

		for ( let octave = 0; octave < this.Octaves; octave++ ) {
			sum += amplitude * ValueNoise(
				x * frequency,
				z * frequency,
				this.Seed + octave * 101,
			);
			norm += amplitude;
			amplitude *= 0.5;
			frequency *= 2;
		}
		return this.Height + sum * this.Amplitude / norm;
	}

	public Distance( x: number, y: number, z: number ): number {
		return ( y - this.HeightAt( x, z ) ) * this._lipschitz;
	}
}

/** Value noise in [-1, 1]: a hashed value per lattice point, faded. */
export function ValueNoise( x: number, z: number, seed: number ): number {
	const ix = FMath.Floor( x );
	const iz = FMath.Floor( z );
	const fx = Fade( x - ix );
	const fz = Fade( z - iz );
	const a = Hash( ix, iz, seed );
	const b = Hash( ix + 1, iz, seed );
	const c = Hash( ix, iz + 1, seed );
	const d = Hash( ix + 1, iz + 1, seed );

	return FMath.LerpUnclamped(
		FMath.LerpUnclamped( a, b, fx ),
		FMath.LerpUnclamped( c, d, fx ),
		fz,
	);
}

/** The quintic fade 6t^5 - 15t^4 + 10t^3. */
function Fade( t: number ): number {
	return t * t * t * ( t * ( t * 6 - 15 ) + 10 );
}

/** A lattice point's value in [-1, 1]. */
function Hash( x: number, z: number, seed: number ): number {
	let h = Math.imul( x | 0, 0x27d4eb2d ) ^ Math.imul( z | 0, 0x165667b1 )
		^ Math.imul( seed | 0, 0x9e3779b1 );

	h = Math.imul( h ^ ( h >>> 15 ), 0x85ebca6b );
	h = Math.imul( h ^ ( h >>> 13 ), 0xc2b2ae35 );
	h ^= h >>> 16;
	return ( h >>> 0 ) / 0xffffffff * 2 - 1;
}
