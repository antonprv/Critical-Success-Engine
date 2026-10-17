// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { SdfShape } from "../Edits/SdfEdit";

/**
 * Signed distances of the edit shapes at a point in the shape's own frame
 * (centered, unrotated, unscaled): negative inside. The formulas are the
 * well-known closed forms (Inigo Quilez's catalogue of distance functions).
 */
export function ShapeDistance(
	shape: SdfShape,
	p: Readonly<[ number, number, number, number ]>,
	x: number,
	y: number,
	z: number,
): number {
	switch ( shape ) {
		case SdfShape.Sphere:
			return FMath.Length3( x, y, z ) - p[0];
		case SdfShape.Box:
			return RoundBox( x, y, z, p[0], p[1], p[2], 0 );
		case SdfShape.RoundBox:
			return RoundBox( x, y, z, p[0], p[1], p[2], p[3] );
		case SdfShape.Capsule: {
			const along = FMath.Clamp( y, -p[0], p[0] );

			return FMath.Length3( x, y - along, z ) - p[1];
		}
		case SdfShape.Torus:
			return FMath.Length2( FMath.Length2( x, z ) - p[0], y ) - p[1];
		case SdfShape.Cylinder: {
			const dr = FMath.Length2( x, z ) - p[1];
			const dy = FMath.Abs( y ) - p[0];

			return FMath.Min( FMath.Max( dr, dy ), 0 )
				+ FMath.Length2( FMath.Max( dr, 0 ), FMath.Max( dy, 0 ) );
		}
		case SdfShape.Ellipsoid:
			return Ellipsoid( x, y, z, p[0], p[1], p[2] );
	}
}

/**
 * Box with rounded corners; `r` = 0 gives the sharp box. The half extents
 * are the outer ones (the rounding stays inside them).
 */
function RoundBox(
	x: number,
	y: number,
	z: number,
	hx: number,
	hy: number,
	hz: number,
	r: number,
): number {
	const qx = FMath.Abs( x ) - hx + r;
	const qy = FMath.Abs( y ) - hy + r;
	const qz = FMath.Abs( z ) - hz + r;

	return FMath.Length3(
		FMath.Max( qx, 0 ),
		FMath.Max( qy, 0 ),
		FMath.Max( qz, 0 ),
	) + FMath.Min( FMath.Max( qx, FMath.Max( qy, qz ) ), 0 ) - r;
}

/**
 * Ellipsoid: a bound, exact on the axes and never larger than the true
 * distance by more than the radii ratio (plan.md 10.6: a Lipschitz shape).
 */
function Ellipsoid(
	x: number,
	y: number,
	z: number,
	rx: number,
	ry: number,
	rz: number,
): number {
	const k0 = FMath.Length3( x / rx, y / ry, z / rz );
	const k1 = FMath.Length3(
		x / ( rx * rx ),
		y / ( ry * ry ),
		z / ( rz * rz ),
	);

	if ( k1 === 0 ) {
		// the very center: as deep as the smallest radius
		return -FMath.Min( rx, FMath.Min( ry, rz ) );
	}
	return k0 * ( k0 - 1 ) / k1;
}

/**
 * Radius of a sphere around the shape's center that holds the whole shape,
 * in local units: the edit's reach, before scale and smoothing.
 */
export function ShapeRadius(
	shape: SdfShape,
	p: Readonly<[ number, number, number, number ]>,
): number {
	switch ( shape ) {
		case SdfShape.Sphere:
			return p[0];
		case SdfShape.Box:
		case SdfShape.RoundBox:
			return FMath.Length3( p[0], p[1], p[2] );
		case SdfShape.Capsule:
			return p[0] + p[1];
		case SdfShape.Torus:
			return p[0] + p[1];
		case SdfShape.Cylinder:
			return FMath.Length2( p[0], p[1] );
		case SdfShape.Ellipsoid:
			return FMath.Max( p[0], FMath.Max( p[1], p[2] ) );
	}
}
