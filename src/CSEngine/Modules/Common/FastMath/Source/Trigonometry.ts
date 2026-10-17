// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Local copies on purpose: V8 reads imported bindings through the module's
// cells instead of folding them, which costs these functions ~40% of their
// speed.
const PI = Math.PI;
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const INV_TWO_PI = 1 / ( Math.PI * 2 );

// Polynomials within 2e-6 of Math's results (sin and cos within 2e-11); in V8
// FastSin and FastCos are about 2x faster than Math.sin/cos and FastAtan2 about
// 1.35x faster than Math.atan2 (Bench/Bench.mjs). V8's acos/asin are already as
// fast as a polynomial: the fast versions only clamp their input.

// sin(x) ≈ x (1 + S1 x² + ... + S5 x¹⁰) on [-π/2, π/2]: within 2e-11, and
// fitted with sin(π/2) = 1 so the result never leaves [-1, 1].
const S1 = -0.16666666601683996;
const S2 = 0.008333330316855408;
const S3 = -0.00019840782247248584;
const S4 = 0.0000027521549430449777;
const S5 = -2.382841134207858e-8;

// atan(x) ≈ x (A0 + A1 x² + ... + A5 x¹⁰) on [-1, 1].
const A0 = 0.99997726;
const A1 = -0.33262347;
const A2 = 0.19354346;
const A3 = -0.11643287;
const A4 = 0.05265332;
const A5 = -0.0117212;

/** Sine of any finite angle in radians. */
export function FastSin( angle: number ): number {
	// Into [-π, π], then mirrored into [-π/2, π/2] where the polynomial holds.
	let x = angle - TWO_PI * Math.floor( angle * INV_TWO_PI + 0.5 );

	if ( x > HALF_PI ) {
		x = PI - x;
	} else if ( x < -HALF_PI ) {
		x = -PI - x;
	}

	const x2 = x * x;

	return x * ( 1 + x2 * ( S1 + x2 * ( S2 + x2 * ( S3 + x2 * ( S4 + x2
		* S5 ) ) ) ) );
}

/** Cosine of any finite angle in radians. */
export function FastCos( angle: number ): number {
	return FastSin( angle + HALF_PI );
}

/** Tangent; relative error grows near the poles at ±π/2. */
export function FastTan( angle: number ): number {
	return FastSin( angle ) / FastCos( angle );
}

/** The polynomial itself, for |x| <= 1. */
function AtanUnit( x: number ): number {
	const x2 = x * x;

	return x * ( A0 + x2 * ( A1 + x2 * ( A2 + x2 * ( A3 + x2 * ( A4 + x2
		* A5 ) ) ) ) );
}

/** Arctangent in (-π/2, π/2). */
export function FastAtan( x: number ): number {
	if ( x > 1 ) {
		return HALF_PI - AtanUnit( 1 / x );
	}

	if ( x < -1 ) {
		return -HALF_PI - AtanUnit( 1 / x );
	}

	return AtanUnit( x );
}

/** The angle of (x, y) in (-π, π]; (0, 0) gives 0. */
export function FastAtan2( y: number, x: number ): number {
	const ax = Math.abs( x );
	const ay = Math.abs( y );

	if ( ax === 0 && ay === 0 ) {
		return 0;
	}

	let angle = ax >= ay ? AtanUnit( ay / ax ) : HALF_PI - AtanUnit( ax / ay );

	if ( x < 0 ) {
		angle = PI - angle;
	}

	return y < 0 ? -angle : angle;
}

/**
 * Arccosine in [0, π]: Math.acos (V8's is as fast as any polynomial) with the
 * input clamped to [-1, 1], so a dot product a hair over 1 gives 0, not NaN.
 */
export function FastAcos( x: number ): number {
	return Math.acos( x > 1 ? 1 : x < -1 ? -1 : x );
}

/** Arcsine in [-π/2, π/2], input clamped like FastAcos. */
export function FastAsin( x: number ): number {
	return Math.asin( x > 1 ? 1 : x < -1 ? -1 : x );
}
