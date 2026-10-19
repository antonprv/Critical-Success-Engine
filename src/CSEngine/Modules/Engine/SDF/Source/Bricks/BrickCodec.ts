// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";

/** Cells along a brick's edge (plan.md 5.1). */
export const BRICK_CELLS = 8;

/**
 * Samples stored along a brick's edge: the 9 nodes of its 8 cells plus one
 * apron node below, so the hardware's trilinear filter never reads another
 * brick's texels (plan.md 5.1, variant a). Node n (-1..8) sits at texel n + 1.
 */
export const BRICK_STORED = 10;

/** Bytes of one stored brick. */
export const BRICK_VOLUME = BRICK_STORED * BRICK_STORED * BRICK_STORED;

/**
 * The encoded distance range, in sample spacings on each side of the
 * surface: twice the half diagonal, so sphere tracing and normals have room
 * (plan.md 5.2).
 */
export const RANGE_SPACINGS = 2.5;

/** What a brick turned out to hold. */
export const enum BrickClass {
	/** Every sample is far outside: no brick needed. */
	Empty = 0,
	/** Every sample is far inside: no brick needed. */
	Solid = 1,
	/** The surface passes through: a brick in the atlas. */
	Surface = 2,
}

/**
 * A distance as one R8_UNORM byte: 0 is `-range`, 255 is `+range`, the
 * surface sits at 0.5 (plan.md 5.2: UNORM, because SNORM can't be rendered
 * to). `spacing` is the sample spacing h of the level.
 */
export function EncodeDistance( d: number, spacing: number ): number {
	const t = FMath.Clamp( d / ( RANGE_SPACINGS * spacing ), -1, 1 );

	return FMath.Round( ( t * 0.5 + 0.5 ) * 255 );
}

/** The distance a byte stands for (within one step of 2 * range / 255). */
export function DecodeDistance( byte: number, spacing: number ): number {
	return ( byte / 255 - 0.5 ) * 2 * RANGE_SPACINGS * spacing;
}

/** Index of node (x, y, z), each -1..8, inside a stored brick. */
export function BrickIndex( x: number, y: number, z: number ): number {
	return ( x + 1 )
		+ ( y + 1 ) * BRICK_STORED
		+ ( z + 1 ) * BRICK_STORED * BRICK_STORED;
}

/**
 * Fills `out` with a brick's samples: node n of each axis lies at
 * `origin + n * spacing` (the brick's corner is node 0). Returns what the
 * brick holds; for an empty or solid one `out` is still written. `sampled`
 * hears of each node right after its distance (its index in `out`): what
 * else the caller keeps of it (the materials). The distances are encoded
 * as for this `unit` of spacing (the range is RANGE_SPACINGS of it): the
 * spacing itself, or wider for a wider range.
 */
export function BuildBrick(
	distance: ( x: number, y: number, z: number ) => number,
	originX: number,
	originY: number,
	originZ: number,
	spacing: number,
	out: Uint8Array,
	sampled: ( ( index: number ) => void ) | null = null,
	unit = spacing,
): BrickClass {
	let below = false;
	let above = false;
	let i = 0;

	for ( let z = -1; z <= BRICK_CELLS; z++ ) {
		const wz = originZ + z * spacing;

		for ( let y = -1; y <= BRICK_CELLS; y++ ) {
			const wy = originY + y * spacing;

			for ( let x = -1; x <= BRICK_CELLS; x++ ) {
				const byte = EncodeDistance(
					distance( originX + x * spacing, wy, wz ),
					unit,
				);

				sampled?.( i );
				out[i++] = byte;
				below ||= byte < 255;
				above ||= byte > 0;
			}
		}
	}
	return !below ? BrickClass.Empty
		: !above ? BrickClass.Solid
			: BrickClass.Surface;
}
