// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";

/** An axis-aligned box: min x, y, z, then max x, y, z. */
export type Aabb = Float64Array;

export function CreateAabb(
	minX = Infinity,
	minY = Infinity,
	minZ = Infinity,
	maxX = -Infinity,
	maxY = -Infinity,
	maxZ = -Infinity,
): Aabb {
	return Float64Array.of( minX, minY, minZ, maxX, maxY, maxZ );
}

/** A box around a sphere. */
export function SphereAabb(
	x: number,
	y: number,
	z: number,
	radius: number,
	out: Aabb = CreateAabb(),
): Aabb {
	out[0] = x - radius;
	out[1] = y - radius;
	out[2] = z - radius;
	out[3] = x + radius;
	out[4] = y + radius;
	out[5] = z + radius;
	return out;
}

/** Whether the box holds nothing (a fresh CreateAabb()). */
export function IsEmptyAabb( box: Aabb ): boolean {
	return box[0]! > box[3]! || box[1]! > box[4]! || box[2]! > box[5]!;
}

export function Overlaps( a: Aabb, b: Aabb ): boolean {
	return a[0]! <= b[3]! && a[3]! >= b[0]!
		&& a[1]! <= b[4]! && a[4]! >= b[1]!
		&& a[2]! <= b[5]! && a[5]! >= b[2]!;
}

/** Grows `into` to hold `box` too. */
export function Enclose( into: Aabb, box: Aabb ): Aabb {
	into[0] = FMath.Min( into[0]!, box[0]! );
	into[1] = FMath.Min( into[1]!, box[1]! );
	into[2] = FMath.Min( into[2]!, box[2]! );
	into[3] = FMath.Max( into[3]!, box[3]! );
	into[4] = FMath.Max( into[4]!, box[4]! );
	into[5] = FMath.Max( into[5]!, box[5]! );
	return into;
}

/** A copy of `box` grown by `margin` on every side. */
export function Expanded( box: Aabb, margin: number ): Aabb {
	return CreateAabb(
		box[0]! - margin,
		box[1]! - margin,
		box[2]! - margin,
		box[3]! + margin,
		box[4]! + margin,
		box[5]! + margin,
	);
}

/**
 * Where a ray enters the box: the distance along the (not necessarily unit)
 * direction, 0 when it starts inside, -1 when it misses or the box is beyond
 * `tMax`.
 */
export function RayAabb(
	box: Aabb,
	ox: number,
	oy: number,
	oz: number,
	dx: number,
	dy: number,
	dz: number,
	tMax: number,
): number {
	let near = 0;
	let far = tMax;
	const origin = [ ox, oy, oz ];
	const dir = [ dx, dy, dz ];

	for ( let axis = 0; axis < 3; axis++ ) {
		const o = origin[axis]!;
		const d = dir[axis]!;
		const lo = box[axis]!;
		const hi = box[axis + 3]!;

		if ( d === 0 ) {
			if ( o < lo || o > hi ) {
				return -1;
			}
			continue;
		}

		const inv = 1 / d;
		const t0 = ( lo - o ) * inv;
		const t1 = ( hi - o ) * inv;

		near = FMath.Max( near, FMath.Min( t0, t1 ) );
		far = FMath.Min( far, FMath.Max( t0, t1 ) );
		if ( near > far ) {
			return -1;
		}
	}
	return near;
}
