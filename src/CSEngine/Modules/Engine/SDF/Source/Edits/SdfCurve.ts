// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { RotationFromY } from "./SdfSplat";
import { ALL_LAYERS, SdfOp, SdfShape, type SdfEditInit } from "./SdfEdit";

type Point = readonly [ number, number, number ];

/**
 * A tube along a curve: through the points (a Catmull-Rom spline), its
 * radius going from each point's to the next one's. As edits: a round cone
 * per piece, each ending in the sphere the next one starts with, so the tube
 * has no seams where they meet.
 */
export interface SdfCurveInit {
	/** What the curve passes through, in order (two at least). */
	Points: readonly Point[];
	/** The radius at each point; fewer than the points: the last repeats. */
	Radii: readonly number[];
	/** Pieces between two points. Default 6. */
	Segments?: number;
	/** Default SmoothUnion: the tube melts into what it meets. */
	Op?: SdfOp;
	/** The blend with what it meets. Default a quarter of the first radius. */
	SmoothK?: number;
	MaterialId?: number;
	Layer?: number;
	Mask?: number;
}

/** The edits a curve is made of, a round cone per piece, in order. */
export function CurveEdits( curve: SdfCurveInit ): SdfEditInit[] {
	const points = curve.Points;
	const pieces = Math.max( 1, Math.round( curve.Segments ?? 6 ) );
	const radius = ( i: number ): number => curve.Radii[Math.min(
		i,
		curve.Radii.length - 1,
	)] ?? 0.1;
	const edits: SdfEditInit[] = [];

	if ( points.length < 2 ) {
		return edits;
	}

	let last = points[0]!;
	let lastRadius = radius( 0 );

	for ( let span = 0; span + 1 < points.length; span++ ) {
		for ( let piece = 1; piece <= pieces; piece++ ) {
			const t = piece / pieces;
			const next = CurvePoint( points, span, t );
			const nextRadius = radius( span ) + ( radius( span + 1 ) - radius(
				span,
			) ) * t;

			edits.push(
				SegmentEdit( last, next, lastRadius, nextRadius, curve ),
			);
			last = next;
			lastRadius = nextRadius;
		}
	}
	return edits;
}

/**
 * One piece of a tube: a round cone from `a` (radius ra) to `b` (rb). What
 * else it takes (op, blend, material, layers) is the curve's.
 */
export function SegmentEdit(
	a: Point,
	b: Point,
	ra: number,
	rb: number,
	curve: Omit<SdfCurveInit, "Points" | "Radii"> = {},
): SdfEditInit {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const dz = b[2] - a[2];
	const length = Math.sqrt( dx * dx + dy * dy + dz * dz );
	const [ ux, uy, uz ] = length > 0
		? [ dx / length, dy / length, dz / length ]
		: [ 0, 1, 0 ];

	return {
		Shape: SdfShape.RoundCone,
		Op: curve.Op ?? SdfOp.SmoothUnion,
		Position: [
			( a[0] + b[0] ) / 2,
			( a[1] + b[1] ) / 2,
			( a[2] + b[2] ) / 2,
		],
		// local +Y from a to b: a's end is -Y (radius P1), b's +Y (P2)
		Rotation: RotationFromY( ux, uy, uz ),
		Params: [ length / 2, ra, rb, 0 ],
		SmoothK: curve.SmoothK ?? ra * 0.25,
		MaterialId: curve.MaterialId ?? 0,
		Layer: curve.Layer ?? 1,
		Mask: curve.Mask ?? ALL_LAYERS,
	};
}

/**
 * The point of span `span` (between points span and span + 1) at t in
 * 0..1: a Catmull-Rom spline through the points, the ends' neighbours
 * mirrored.
 */
export function CurvePoint(
	points: readonly Point[],
	span: number,
	t: number,
): [ number, number, number ] {
	const p1 = points[span]!;
	const p2 = points[span + 1]!;
	const p0 = points[span - 1] ?? Mirror( p2, p1 );
	const p3 = points[span + 2] ?? Mirror( p1, p2 );
	const t2 = t * t;
	const t3 = t2 * t;
	const out: [ number, number, number ] = [ 0, 0, 0 ];

	for ( let axis = 0; axis < 3; axis++ ) {
		out[axis] = 0.5 * (
			2 * p1[axis]!
			+ ( p2[axis]! - p0[axis]! ) * t
			+ ( 2 * p0[axis]! - 5 * p1[axis]! + 4 * p2[axis]! - p3[axis]! ) * t2
			+ ( 3 * p1[axis]! - p0[axis]! - 3 * p2[axis]! + p3[axis]! ) * t3
		);
	}
	return out;
}

/** `p` mirrored through `about`. */
function Mirror( p: Point, about: Point ): Point {
	return [ 2 * about[0] - p[0], 2 * about[1] - p[1], 2 * about[2] - p[2] ];
}
