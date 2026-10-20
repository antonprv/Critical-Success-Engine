// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Anything with a distance at a point (a field, a program, a base). */
export interface SdfDistanceSource {
	Distance( x: number, y: number, z: number ): number;
}

/** What a place to stand must offer (FindStandingPlace). */
export interface StandingOptions {
	/** How far from the given point to look. Default 20. */
	Radius?: number;
	/** Room above the floor (a body's height). Default 2. */
	Height?: number;
	/** And around the body's axis. Default 0.4. */
	Clearance?: number;
	/** The floor's normal's least upward part (0.7: 45 degrees). */
	MinUp?: number;
	/** Places tried at most. Default 400. */
	Tries?: number;
}

/** A floor to stand on: the point under the feet and its normal. */
export interface StandingPlace {
	Position: [ number, number, number ];
	Normal: [ number, number, number ];
}

/** The golden angle: points of the spiral spread evenly. */
const Golden = Math.PI * ( 3 - Math.sqrt( 5 ) );

/**
 * A place to stand near `near` (S6-27: the game starts "on the surface"):
 * points tried in a spiral outward from it - the nearest first - each one
 * in open air dropped straight down onto the floor below, which must face
 * up enough and leave room for a body above it. Deterministic: the same
 * world, the same place. Null if none within the radius.
 */
export function FindStandingPlace(
	field: SdfDistanceSource,
	near: readonly [ number, number, number ],
	options: StandingOptions = {},
): StandingPlace | null {
	const radius = options.Radius ?? 20;
	const height = options.Height ?? 2;
	const clearance = options.Clearance ?? 0.4;
	const minUp = options.MinUp ?? 0.7;
	const tries = options.Tries ?? 400;

	for ( let k = 0; k < tries; k++ ) {
		// a spiral in a ball: the radius grows with the cube root of k
		const r = radius * Math.cbrt( ( k + 0.5 ) / tries );
		const y = 1 - 2 * ( ( k * 0.618034 ) % 1 );
		const ring = Math.sqrt( 1 - y * y );
		const a = k * Golden;
		const x0 = near[0] + r * ring * Math.cos( a );
		const y0 = near[1] + r * y;
		const z0 = near[2] + r * ring * Math.sin( a );

		if ( field.Distance( x0, y0, z0 ) < clearance ) {
			continue;
		}

		const floor = Drop( field, x0, y0, z0, radius * 2 );

		if ( floor === null ) {
			continue;
		}

		const normal = NormalAt( field, x0, floor, z0 );

		if ( normal[1] < minUp
			|| !Room( field, x0, floor, z0, height, clearance ) ) {
			continue;
		}
		return { Position: [ x0, floor, z0 ], Normal: normal };
	}
	return null;
}

/** The height of the floor straight below, within `depth`, or null. */
function Drop(
	field: SdfDistanceSource,
	x: number,
	y: number,
	z: number,
	depth: number,
): number | null {
	let t = 0;

	for ( let step = 0; step < 256 && t < depth; step++ ) {
		const d = field.Distance( x, y - t, z );

		if ( d < 1e-3 ) {
			return y - t;
		}
		t += Math.max( d, 1e-3 );
	}
	return null;
}

/** The field's gradient, normalized (central differences). */
function NormalAt(
	field: SdfDistanceSource,
	x: number,
	y: number,
	z: number,
): [ number, number, number ] {
	const e = 0.05;
	const gx = field.Distance( x + e, y, z ) - field.Distance( x - e, y, z );
	const gy = field.Distance( x, y + e, z ) - field.Distance( x, y - e, z );
	const gz = field.Distance( x, y, z + e ) - field.Distance( x, y, z - e );
	const length = Math.hypot( gx, gy, gz ) || 1;

	return [ gx / length, gy / length, gz / length ];
}

/**
 * Whether a body's column above the floor is in the air: its axis and a
 * ring of its radius, every half radius up to its height (a fractal's
 * distances are bounds, often far under the truth: their sign is what can
 * be trusted).
 */
function Room(
	field: SdfDistanceSource,
	x: number,
	y: number,
	z: number,
	height: number,
	clearance: number,
): boolean {
	for ( let h = clearance; h <= height + 1e-9; h += clearance * 0.5 ) {
		for ( let k = 0; k <= 8; k++ ) {
			// the axis, then eight around it
			const a = k * Math.PI / 4;
			const r = k === 0 ? 0 : clearance;

			if ( field.Distance(
				x + r * Math.cos( a ),
				y + h,
				z + r * Math.sin( a ),
			) <= 0 ) {
				return false;
			}
		}
	}
	return true;
}
