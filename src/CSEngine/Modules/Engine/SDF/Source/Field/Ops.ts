// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { SdfOp } from "../Edits/SdfEdit";

/**
 * Polynomial smooth minimum: equals min(a, b) when they differ by more than
 * `k`, and blends below that (the quadratic smin).
 */
export function SmoothMin( a: number, b: number, k: number ): number {
	const gap = FMath.Abs( a - b );

	// also two infinities (their gap is NaN) and k <= 0
	if ( !( gap < k ) ) {
		return FMath.Min( a, b );
	}

	const h = ( k - gap ) / k;

	return FMath.Min( a, b ) - h * h * k * 0.25;
}

/** Smooth maximum, the mirror of SmoothMin. */
export function SmoothMax( a: number, b: number, k: number ): number {
	return -SmoothMin( -a, -b, k );
}

/**
 * Combines what is already there (`scene`) with an edit's distance (`edit`).
 * An empty scene is +Infinity, so a first union is the edit itself and a
 * first subtraction leaves nothing.
 */
export function ApplyOp(
	op: SdfOp,
	scene: number,
	edit: number,
	k: number,
): number {
	switch ( op ) {
		case SdfOp.Union:
			return FMath.Min( scene, edit );
		case SdfOp.Subtract:
			return FMath.Max( scene, -edit );
		case SdfOp.Intersect:
			return FMath.Max( scene, edit );
		case SdfOp.SmoothUnion:
			return SmoothMin( scene, edit, k );
		case SdfOp.SmoothSubtract:
			return SmoothMax( scene, -edit, k );
		case SdfOp.SmoothIntersect:
			return SmoothMax( scene, edit, k );
	}
}
