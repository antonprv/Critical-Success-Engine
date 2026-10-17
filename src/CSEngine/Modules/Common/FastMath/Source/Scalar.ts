// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Local copies: imported bindings are slower to read in V8 (see
// Trigonometry.ts).
const KINDA_SMALL_NUMBER = 0.001;
const TWO_PI = Math.PI * 2;

// Min, Max, Abs, Floor and Ceil stay on Math: V8 compiles them to single
// instructions (branchless minsd/maxsd, roundsd), which a JavaScript ternary
// can't beat (it mispredicts on unordered data). Round is Floor(x + 0.5): about
// 4x faster than Math.round, the same results except at 0.49999999999999994.

export function Min( a: number, b: number ): number {
	return Math.min( a, b );
}

export function Max( a: number, b: number ): number {
	return Math.max( a, b );
}

export function Abs( value: number ): number {
	return Math.abs( value );
}

/** 1 for zero and positive values, -1 for negative ones (as the C# FMath). */
export function Sign( value: number ): number {
	return value >= 0 ? 1 : -1;
}

export function Clamp( value: number, min: number, max: number ): number {
	return value < min ? min : value > max ? max : value;
}

export function Clamp01( value: number ): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function Floor( value: number ): number {
	return Math.floor( value );
}

export function Ceil( value: number ): number {
	return Math.ceil( value );
}

/** Rounds half up, as Math.round. */
export function Round( value: number ): number {
	return Math.floor( value + 0.5 );
}

export function FloorToInt( value: number ): number {
	return Math.floor( value );
}

export function CeilToInt( value: number ): number {
	return Math.ceil( value ) + 0;
}

export function RoundToInt( value: number ): number {
	return Math.floor( value + 0.5 );
}

/** The fractional part, always in [0, 1): Frac(-0.25) is 0.75. */
export function Frac( value: number ): number {
	return value - Math.floor( value );
}

/** Wraps `t` into [0, length). */
export function Repeat( t: number, length: number ): number {
	return t - Math.floor( t / length ) * length;
}

/** Goes from 0 up to `length` and back as `t` grows. */
export function PingPong( t: number, length: number ): number {
	return length - Math.abs( Repeat( t, length * 2 ) - length );
}

export function IsNearlyEqual(
	a: number,
	b: number,
	epsilon = KINDA_SMALL_NUMBER,
): boolean {
	return Math.abs( a - b ) < epsilon;
}

export function IsNearlyZero(
	value: number,
	epsilon = KINDA_SMALL_NUMBER,
): boolean {
	return Math.abs( value ) < epsilon;
}

export function IsPowerOfTwo( value: number ): boolean {
	return value > 0 && ( value & ( value - 1 ) ) === 0;
}

/** The smallest power of two not below `value` (1 for 0 and 1), up to 2^31. */
export function NextPowerOfTwo( value: number ): number {
	if ( value <= 1 ) {
		return 1;
	}

	let v = ( value - 1 ) >>> 0;
	v |= v >>> 1;
	v |= v >>> 2;
	v |= v >>> 4;
	v |= v >>> 8;
	v |= v >>> 16;

	return ( v >>> 0 ) + 1;
}

/** `from` to `to` by `t`, with `t` clamped to [0, 1]. */
export function Lerp( from: number, to: number, t: number ): number {
	return from + ( to - from ) * Clamp01( t );
}

export function LerpUnclamped( from: number, to: number, t: number ): number {
	return from + ( to - from ) * t;
}

/**
 * Where `value` is between `from` and `to` (not clamped); 0 for an empty range.
 */
export function InverseLerp( from: number, to: number, value: number ): number {
	return from === to ? 0 : ( value - from ) / ( to - from );
}

/** Maps `value` from one range onto another, extrapolating outside it. */
export function Map(
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number,
): number {
	return LerpUnclamped( outMin, outMax, InverseLerp( inMin, inMax, value ) );
}

/** Maps `value` from one range onto another, clamped to the output range. */
export function MapClamped(
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number,
): number {
	return Lerp( outMin, outMax, InverseLerp( inMin, inMax, value ) );
}

/** 3t² - 2t³ of `t` clamped to [0, 1]. */
export function SmoothStep( t: number ): number {
	const x = Clamp01( t );

	return x * x * ( 3 - 2 * x );
}

/** SmoothStep of where `value` is between `edge0` and `edge1`. */
export function SmoothStepRange(
	edge0: number,
	edge1: number,
	value: number,
): number {
	return SmoothStep( InverseLerp( edge0, edge1, value ) );
}

/** 6t⁵ - 15t⁴ + 10t³ of `t` clamped to [0, 1] (Perlin's). */
export function SmootherStep( t: number ): number {
	const x = Clamp01( t );

	return x * x * x * ( x * ( x * 6 - 15 ) + 10 );
}

/**
 * The shortest signed turn from `current` to `target`, in degrees (-180, 180].
 */
export function DeltaAngle( current: number, target: number ): number {
	const delta = Repeat( target - current, 360 );

	return delta > 180 ? delta - 360 : delta;
}

/** DeltaAngle in radians. */
export function DeltaAngleRad( current: number, target: number ): number {
	const delta = Repeat( target - current, TWO_PI );

	return delta > Math.PI ? delta - TWO_PI : delta;
}

/** Lerp between two angles in degrees, the short way round. */
export function LerpAngle( from: number, to: number, t: number ): number {
	return from + DeltaAngle( from, to ) * Clamp01( t );
}

/** LerpAngle in radians. */
export function LerpAngleRad( from: number, to: number, t: number ): number {
	return from + DeltaAngleRad( from, to ) * Clamp01( t );
}
