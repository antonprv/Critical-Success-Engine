// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Runtime.CompilerServices;

namespace FastMath
{
	/// <summary>
	/// Full-float-precision versions of the fast functions: what a physics solver needs where the plain ones (tuned
	/// for rendering and gameplay: 0.5% sine, 0.06° arccosine) would drift. Still no calls into the runtime's math:
	/// polynomials and the bit-hack root, so they cost the same in a build without SIMD or hardware intrinsics.
	/// </summary>
	public static partial class FMath
	{
		// Minimax fit of sin on [-π/2, π/2], degree 11 (the TypeScript FastMath's): error ≈ 2e-11 in doubles, below a
		// float's rounding here.
		private const float SIN_P1 = -0.16666666601683996f;
		private const float SIN_P2 = 0.008333330316855408f;
		private const float SIN_P3 = -0.00019840782247248584f;
		private const float SIN_P4 = 0.0000027521549430449777f;
		private const float SIN_P5 = -2.382841134207858e-8f;

		// Abramowitz & Stegun 4.4.46: acos(x) = sqrt(1 - x) · P(x) on [0, 1], |error| ≤ 2e-8.
		private const float ACOS_A0 = 1.5707963050f;
		private const float ACOS_A1 = -0.2145988016f;
		private const float ACOS_A2 = 0.0889789874f;
		private const float ACOS_A3 = -0.0501743046f;
		private const float ACOS_A4 = 0.0308918810f;
		private const float ACOS_A5 = -0.0170881256f;
		private const float ACOS_A6 = 0.0066700901f;
		private const float ACOS_A7 = -0.0012624911f;

		/// <summary>
		/// 1/√x to a float's precision: <see cref="FastInvSqrt"/>'s precise result plus one more Newton-Raphson step.
		/// For x ≤ 0 the result is meaningless (as 1/√x is): callers guard.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastInvSqrtPrecise( float x )
		{
			float y = FastInvSqrt( x, true );
			return y * ( 1.5f - 0.5f * x * y * y );
		}

		/// <summary>√x to a float's precision (relative error ≤ 2e-7); 0 for x ≤ 0, never NaN.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastSqrtPrecise( float x ) => x <= 0f ? 0f : x * FastInvSqrtPrecise( x );

		/// <summary>sin(x) to a float's precision near the origin (absolute error ≤ 2e-7 for |x| ≤ 2π), any finite x.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastSinPrecise( float x )
		{
			x -= TWO_PI * Round( x * INV_TWO_PI );
			if ( x > HALF_PI )
			{
				x = PI - x;
			}
			else if ( x < -HALF_PI )
			{
				x = -PI - x;
			}
			float x2 = x * x;
			return x * ( 1f + x2 * ( SIN_P1 + x2 * ( SIN_P2 + x2 * ( SIN_P3 + x2 * ( SIN_P4 + x2 * SIN_P5 ) ) ) ) );
		}

		/// <summary>cos(x), as <see cref="FastSinPrecise"/>(x + π/2).</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastCosPrecise( float x ) => FastSinPrecise( x + HALF_PI );

		/// <summary>tan(x), as sin/cos (<see cref="FastSinPrecise"/>, <see cref="FastCosPrecise"/>).</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastTanPrecise( float x ) => FastSinPrecise( x ) / FastCosPrecise( x );

		/// <summary>acos(x) in [0, π], absolute error ≤ 4e-7; x is clamped to [-1, 1].</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAcosPrecise( float x )
		{
			bool negative = x < 0f;
			float a = negative ? -x : x;
			if ( a > 1f )
			{
				a = 1f;
			}
			float p = ACOS_A0 + a * ( ACOS_A1 + a * ( ACOS_A2 + a * ( ACOS_A3 + a * ( ACOS_A4 + a * ( ACOS_A5 + a * ( ACOS_A6 + a * ACOS_A7 ) ) ) ) ) );
			float r = FastSqrtPrecise( 1f - a ) * p;
			return negative ? PI - r : r;
		}

		/// <summary>asin(x) in [-π/2, π/2], as π/2 - <see cref="FastAcosPrecise"/>(x).</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAsinPrecise( float x ) => HALF_PI - FastAcosPrecise( x );
	}
}