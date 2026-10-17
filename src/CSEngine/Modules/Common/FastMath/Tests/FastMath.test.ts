// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { FMath } from "../Source/Index.ts";

/** Evenly spread samples over [from, to] (endpoints included). */
function Samples( from: number, to: number, count = 20001 ): number[] {
	const result: number[] = [];

	for ( let i = 0; i < count; i++ ) {
		result.push( from + ( to - from ) * i / ( count - 1 ) );
	}

	return result;
}

/** Largest absolute difference between `fast` and `exact` over the samples. */
function MaxError(
	samples: number[],
	fast: ( x: number ) => number,
	exact: ( x: number ) => number,
): number {
	let worst = 0;

	for ( const x of samples ) {
		worst = Math.max( worst, Math.abs( fast( x ) - exact( x ) ) );
	}

	return worst;
}

describe( "FMath constants: the same values as the C# FMath", () => {
	it( "angles, reciprocals and the epsilons", () => {
		expect( FMath.PI ).toBe( Math.PI );
		expect( FMath.TWO_PI ).toBe( Math.PI * 2 );
		expect( FMath.HALF_PI ).toBe( Math.PI / 2 );
		expect( FMath.QUARTER_PI ).toBe( Math.PI / 4 );
		expect( FMath.INV_PI ).toBe( 1 / Math.PI );
		expect( FMath.INV_TWO_PI ).toBe( 1 / ( Math.PI * 2 ) );
		expect( FMath.Deg2Rad * 180 ).toBeCloseTo( Math.PI, 15 );
		expect( FMath.Rad2Deg * Math.PI ).toBeCloseTo( 180, 12 );
		expect( FMath.SQRT2 ).toBe( Math.SQRT2 );
		expect( FMath.INV_SQRT2 ).toBe( Math.SQRT1_2 );
		expect( [
			FMath.KINDA_SMALL_NUMBER,
			FMath.SMALL_NUMBER,
			FMath.ACTUALLY_SMALL_NUMBER,
		] ).toEqual( [ 0.001, 0.00001, 1e-4 ] );
	} );
} );

describe( "FMath: comparisons and rounding", () => {
	it( "Min, Max, Abs, Sign and Clamp", () => {
		expect( [ FMath.Min( 2, -3 ), FMath.Max( 2, -3 ) ] )
			.toEqual( [ -3, 2 ] );
		expect( [ FMath.Abs( -4.5 ), FMath.Abs( 4.5 ) ] )
			.toEqual( [ 4.5, 4.5 ] );
		expect( [ FMath.Sign( -0.1 ), FMath.Sign( 0 ), FMath.Sign( 3 ) ] )
			.toEqual( [ -1, 1, 1 ] );
		expect( [
			FMath.Clamp( 5, 0, 1 ),
			FMath.Clamp( -5, 0, 1 ),
			FMath.Clamp( 0.5, 0, 1 ),
		] ).toEqual( [ 1, 0, 0.5 ] );
		expect(
			[ FMath.Clamp01( 2 ), FMath.Clamp01( -1 ), FMath.Clamp01( 0.25 ) ],
		)
			.toEqual( [ 1, 0, 0.25 ] );
	} );

	it(
		"Floor, Ceil and Round (half up, as Math.round), and their Int forms",
		() => {
			for ( const x of [ -2.5, -2.4, -0.5, 0, 0.49, 0.5, 2.5, 7.99 ] ) {
				expect( FMath.Round( x ) ).toBe( Math.round( x ) + 0 );
				expect( FMath.Floor( x ) ).toBe( Math.floor( x ) );
				expect( FMath.Ceil( x ) ).toBe( Math.ceil( x ) );
				expect( FMath.RoundToInt( x ) ).toBe( Math.round( x ) + 0 );
				expect( FMath.FloorToInt( x ) ).toBe( Math.floor( x ) );
				expect( FMath.CeilToInt( x ) ).toBe( Math.ceil( x ) + 0 );
			}
		},
	);

	it( "Frac, Repeat and PingPong wrap into their range", () => {
		expect( FMath.Frac( 2.25 ) ).toBeCloseTo( 0.25, 12 );
		expect( FMath.Frac( -0.25 ) ).toBeCloseTo( 0.75, 12 );
		expect( FMath.Repeat( 7, 3 ) ).toBeCloseTo( 1, 12 );
		expect( FMath.Repeat( -1, 3 ) ).toBeCloseTo( 2, 12 );
		expect( FMath.PingPong( 4, 3 ) ).toBeCloseTo( 2, 12 );
		expect( FMath.PingPong( 1, 3 ) ).toBeCloseTo( 1, 12 );
	} );

	it( "IsNearlyEqual and IsNearlyZero, KINDA_SMALL_NUMBER by default", () => {
		expect( FMath.IsNearlyEqual( 1, 1.0009 ) ).toBe( true );
		expect( FMath.IsNearlyEqual( 1, 1.002 ) ).toBe( false );
		expect( FMath.IsNearlyEqual( 1, 1.002, 0.01 ) ).toBe( true );
		expect( FMath.IsNearlyZero( -0.0009 ) ).toBe( true );
		expect( FMath.IsNearlyZero( 0.5, 0.1 ) ).toBe( false );
	} );

	it( "powers of two", () => {
		expect( [ 1, 2, 64 ].every( FMath.IsPowerOfTwo ) ).toBe( true );
		expect( [ 0, 3, -4 ].some( FMath.IsPowerOfTwo ) ).toBe( false );
		expect( [ 0, 1, 5, 64, 65 ].map( FMath.NextPowerOfTwo ) )
			.toEqual( [ 1, 1, 8, 64, 128 ] );
	} );
} );

describe( "FMath: interpolation", () => {
	it( "Lerp, LerpUnclamped, InverseLerp, Map and MapClamped", () => {
		expect( FMath.Lerp( 10, 20, 0.25 ) ).toBe( 12.5 );
		expect( FMath.Lerp( 10, 20, 2 ) ).toBe( 20 );
		expect( FMath.LerpUnclamped( 10, 20, 2 ) ).toBe( 30 );
		expect( FMath.InverseLerp( 10, 20, 12.5 ) ).toBe( 0.25 );
		// an empty range has no position in it
		expect( FMath.InverseLerp( 5, 5, 5 ) ).toBe( 0 );
		expect( FMath.Map( 15, 10, 20, 0, 100 ) ).toBe( 50 );
		expect( FMath.Map( 30, 10, 20, 0, 100 ) ).toBe( 200 );
		expect( FMath.MapClamped( 30, 10, 20, 0, 100 ) ).toBe( 100 );
		expect( FMath.Map( 3, 3, 3, 0, 100 ) ).toBe( 0 );
	} );

	it(
		"SmoothStep and SmootherStep: 0 and 1 at the ends, eased between",
		() => {
			expect(
				[
					FMath.SmoothStep( 0 ),
					FMath.SmoothStep( 1 ),
					FMath.SmoothStep( 0.5 ),
				],
			)
				.toEqual( [ 0, 1, 0.5 ] );
			expect( FMath.SmoothStep( -1 ) ).toBe( 0 );
			expect( FMath.SmoothStep( 2 ) ).toBe( 1 );
			expect( FMath.SmoothStep( 0.25 ) ).toBeCloseTo( 0.15625, 12 );
			expect( FMath.SmoothStepRange( 10, 20, 15 ) ).toBe( 0.5 );
			expect(
				[
					FMath.SmootherStep( 0 ),
					FMath.SmootherStep( 1 ),
					FMath.SmootherStep( 0.5 ),
				],
			)
				.toEqual( [ 0, 1, 0.5 ] );
			expect( FMath.SmootherStep( 0.25 ) ).toBeCloseTo( 0.103515625, 12 );
		},
	);

	it(
		"angles: the shortest signed difference, and lerping the short way "
			+ "round",
		() => {
			expect( FMath.DeltaAngle( 350, 10 ) ).toBeCloseTo( 20, 9 );
			expect( FMath.DeltaAngle( 10, 350 ) ).toBeCloseTo( -20, 9 );
			expect( FMath.DeltaAngle( 0, 180 ) ).toBeCloseTo( 180, 9 );
			expect( FMath.DeltaAngleRad( 0.1, FMath.TWO_PI - 0.1 ) )
				.toBeCloseTo( -0.2, 9 );
			expect( FMath.DeltaAngleRad( 0, 1 ) ).toBeCloseTo( 1, 12 );
			expect( FMath.LerpAngle( 350, 10, 0.5 ) ).toBeCloseTo( 360, 9 );
			expect( FMath.LerpAngle( 350, 10, 3 ) ).toBeCloseTo( 370, 9 );
			expect( FMath.LerpAngleRad( 0.1, FMath.TWO_PI - 0.1, 0.5 ) )
				.toBeCloseTo( 0, 9 );
		},
	);
} );

describe( "FMath: roots and lengths", () => {
	it(
		"Sqrt and InvSqrt are exact (V8 has a sqrt instruction; no bit tricks)",
		() => {
			for ( const x of [ 0.0001, 0.5, 2, 1e6 ] ) {
				expect( FMath.Sqrt( x ) ).toBe( Math.sqrt( x ) );
				expect( FMath.InvSqrt( x ) ).toBe( 1 / Math.sqrt( x ) );
			}
		},
	);

	it(
		"Length2, Length3, LengthSq3 and Distance3 replace Math.hypot (which "
			+ "is several times slower)",
		() => {
			expect( FMath.Length2( 3, 4 ) ).toBe( 5 );
			expect( FMath.Length3( 2, 3, 6 ) ).toBe( 7 );
			expect( FMath.LengthSq3( 2, 3, 6 ) ).toBe( 49 );
			expect( FMath.Distance3( 1, 1, 1, 3, 4, 7 ) ).toBe( 7 );
		},
	);
} );

describe( "FMath: trigonometry within 2e-6 of Math, faster in V8", () => {
	const wide = Samples( -1000, 1000 );
	const unit = Samples( -1, 1 );

	it(
		"FastSin and FastCos, for any finite angle, never outside [-1, 1]",
		() => {
			expect( MaxError( wide, FMath.FastSin, Math.sin ) )
				.toBeLessThan( 1e-9 );
			expect( MaxError( wide, FMath.FastCos, Math.cos ) )
				.toBeLessThan( 1e-9 );
			expect( wide.every( ( x ) => Math.abs( FMath.FastSin( x ) ) <= 1 ) )
				.toBe( true );
			expect( FMath.FastSin( 0 ) ).toBe( 0 );
			expect( FMath.FastSin( Math.PI / 2 ) ).toBeLessThanOrEqual( 1 );
			expect( FMath.FastCos( 0 ) ).toBeCloseTo( 1, 12 );
		},
	);

	it( "FastTan away from its poles", () => {
		const range = Samples( -1.4, 1.4 );
		const relative = ( x: number ) => ( FMath.FastTan( x ) - Math.tan(
			x,
		) ) /
			Math.max( 1, Math.abs( Math.tan( x ) ) );

		expect( MaxError( range, relative, () => 0 ) ).toBeLessThan( 2e-5 );
	} );

	it( "FastAtan and FastAtan2 in every quadrant, (0, 0) is 0", () => {
		expect( MaxError( wide, FMath.FastAtan, Math.atan ) )
			.toBeLessThan( 2e-6 );

		let worst = 0;

		for ( const y of Samples( -5, 5, 201 ) ) {
			for ( const x of Samples( -5, 5, 201 ) ) {
				worst = Math.max(
					worst,
					Math.abs( FMath.FastAtan2( y, x ) - Math.atan2( y, x ) ),
				);
			}
		}

		expect( worst ).toBeLessThan( 2e-6 );
		expect( FMath.FastAtan2( 0, 0 ) ).toBe( 0 );
		expect( FMath.FastAtan2( 1, 0 ) ).toBeCloseTo( Math.PI / 2, 6 );
		expect( FMath.FastAtan2( 0, -1 ) ).toBeCloseTo( Math.PI, 6 );
	} );

	it(
		"FastAcos and FastAsin; input a hair outside [-1, 1] is clamped, not "
			+ "NaN",
		() => {
			expect( MaxError( unit, FMath.FastAcos, Math.acos ) )
				.toBeLessThan( 2e-6 );
			expect( MaxError( unit, FMath.FastAsin, Math.asin ) )
				.toBeLessThan( 2e-6 );
			expect( FMath.FastAcos( 1.0000001 ) ).toBe( 0 );
			expect( FMath.FastAcos( -1.0000001 ) ).toBeCloseTo( Math.PI, 6 );
			expect( FMath.FastAsin( 2 ) ).toBeCloseTo( Math.PI / 2, 6 );
			expect( FMath.FastAsin( -2 ) ).toBeCloseTo( -Math.PI / 2, 6 );
		},
	);
} );
