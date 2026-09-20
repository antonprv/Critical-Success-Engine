// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Runtime.CompilerServices;

namespace Framework.FastMath.Core
{
	public static partial class FMath
	{
		// ----------------------------------------------------------------
		// FastAtan / FastAtan2
		//
		// Strategy - octant reduction:
		//   r = (x ± |y|) / (|y| ± x)   →   r ∈ [−1, 1]
		//   atan2(y, x) = base_angle − atan(r)
		//
		// Two quality levels:
		//   Fast (default) - cubic polynomial,  error < 0.005 rad (≈ 0.28°)
		//   Precise        - 5th-order Horner,  error < 0.001 rad  (≈ 0.06°)
		//
		// Both bounds verified numerically (Chebyshev-node minimax fit,
		// checked on a dense grid) - the previous claims of 0.0038/0.0002 rad
		// were aspirational, not measured, and the "precise" coefficients
		// were simply wrong (see CHANGELOG).
		//
		// Hot-path optimisations:
		//   • Absolute value / sign restoration via FloatToInt32Bits
		//     / Int32BitsToFloat - same single-instruction (movd) codegen as a
		//     raw pointer cast, but without `unsafe` or AllowUnsafeBlocks.
		// ----------------------------------------------------------------

		// --- cubic atan polynomial on [−1, 1]: atan(x) ≈ (C1 + C3·x²)·x ---
		// Re-derived and numerically verified (Chebyshev-node minimax via LP,
		// checked on a 20001-point grid) - the original coefficients here
		// were wrong; see CHANGELOG for details.
		private const float ATAN_C1 = 0.97239412f;
		private const float ATAN_C3 = -0.19194796f;

		// --- 5th-order minimax polynomial: atan(x) ≈ x·(P0 + x²·(P2 + x²·P4)) ---
		// Also re-derived and verified the same way. The previous coefficients
		// blew up specifically near |x| = 1 (0.073 rad error there, ~370x the
		// claimed bound) - everything below |x| ≈ 0.6 looked fine, which is
		// why it slipped through casual testing.
		private const float ATAN_P0 = 0.99535768f;
		private const float ATAN_P2 = -0.28868936f;
		private const float ATAN_P4 = 0.07933841f;

		/// <summary>
		/// Fast arctangent. Returns angle in radians, range [−π/2, π/2].
		/// <para>Fast mode error:    &lt; 0.005 rad (≈ 0.28°)</para>
		/// <para>Precise mode error: &lt; 0.001 rad  (≈ 0.06°)</para>
		/// </summary>
		/// <param name="x">Input value.</param>
		/// <param name="precise">Use higher-order polynomial for better accuracy.</param>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAtan( float x, bool precise = false )
		{
			// Split sign bit and absolute value without a branch.
			int xBits = FloatToInt32Bits( x );
			int signBit = xBits & SIGN_BIT_MASK;
			int absXInt = xBits & ABS_MASK;
			float absX = Int32BitsToFloat( absXInt );

			float result;

			if ( absX <= 1f )
			{
				// Direct polynomial for |x| ≤ 1.
				result = precise ? AtanUnitPrecise( absX ) : AtanUnit( absX );
			}
			else
			{
				// Identity: atan(x) = π/2 − atan(1/|x|)  for |x| > 1.
				// One division is cheaper than a full atan branch tree.
				float inv = 1f / absX;
				result = HALF_PI - ( precise ? AtanUnitPrecise( inv ) : AtanUnit( inv ) );
			}

			// Restore original sign in one OR - result is always ≥ 0 here,
			// so its sign bit is 0 and we can safely OR in the input sign bit.
			int resBits = FloatToInt32Bits( result );
			int signed = resBits | signBit;
			return Int32BitsToFloat( signed );
		}

		/// <summary>
		/// Fast four-quadrant arctangent of (y, x).
		/// Returns angle in radians, range [−π, π].
		/// Matches the sign convention of <c>Mathf.Atan2</c>.
		/// <para>Fast mode error:    &lt; 0.005 rad (≈ 0.28°)</para>
		/// <para>Precise mode error: &lt; 0.001 rad  (≈ 0.06°)</para>
		/// </summary>
		/// <param name="y">Vertical component.</param>
		/// <param name="x">Horizontal component.</param>
		/// <param name="precise">Use higher-order polynomial for better accuracy.</param>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAtan2( float y, float x, bool precise = false )
		{
			// Absolute value of y: clear sign bit (no branch, no float mask).
			int yBits = FloatToInt32Bits( y );
			int absYInt = yBits & ABS_MASK;
			float absY = Int32BitsToFloat( absYInt );

			// Degenerate case: x = 0.
			if ( x == 0f )
			{
				if ( absYInt == 0 ) return 0f;   // atan2(0, 0) → 0 (matches Unity/Godot)
												 // Return ±π/2 preserving sign of y.
				return ( yBits & SIGN_BIT_MASK ) == 0 ? HALF_PI : -HALF_PI;
			}

			// Octant reduction - maps (x, y) to r ∈ [−1, 1] and chooses base angle.
			//   x ≥ 0 : r = (x − |y|) / (x + |y|),  base = π/4
			//   x < 0 : r = (x + |y|) / (|y| − x),  base = 3π/4
			//
			// Identity: atan2(y, x) = base − atan(r)
			float r, angle;

			if ( x >= 0f )
			{
				r = ( x - absY ) / ( x + absY );
				angle = QUARTER_PI;
			}
			else
			{
				r = ( x + absY ) / ( absY - x );
				angle = THREE_QTR_PI;
			}

			// Subtract atan(r) - both fast and precise polys handle negative r correctly.
			angle -= precise ? AtanUnitPrecise( r ) : AtanUnit( r );

			// Restore sign of y: negate if y < 0.
			return ( yBits & SIGN_BIT_MASK ) != 0 ? -angle : angle;
		}

		// ----------------------------------------------------------------
		// Private atan(x) polynomial helpers.
		// Both accept x ∈ [−1, 1] and return values in [−π/4, π/4].
		// The same polys are reused by FastAtan and FastAtan2 so the
		// code is compiled once and inlined at each call site.
		// ----------------------------------------------------------------

		/// <summary>
		/// Cubic atan approximation: (C1 + C3·x²)·x, error &lt; 0.005 rad.
		/// Naturally odd (handles negative x correctly).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		private static float AtanUnit( float x )
		  => ( ATAN_C1 + ATAN_C3 * x * x ) * x;

		/// <summary>
		/// 5th-degree minimax atan via Horner's scheme, error &lt; 0.001 rad.
		/// Naturally odd (handles negative x correctly).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		private static float AtanUnitPrecise( float x )
		{
			float x2 = x * x;
			return x * ( ATAN_P0 + x2 * ( ATAN_P2 + x2 * ATAN_P4 ) );
		}

		// ==================================================================
		// FastSin / FastCos
		//
		// Single source of truth for the whole library - previously this
		// exact polynomial pair was duplicated in FastQuaternion.cs and
		// FromEuler.cs under different names (FastSin/FastCos vs.
		// FastSinHalf/FastCosHalf). Consolidated here so a future coefficient
		// tweak can't accidentally drift between the two copies.
		//
		// Two tiers, matching the FastAtan/FastAtan2 pattern:
		//
		//   FastSinUnsafe / FastCosUnsafe
		//     5th/4th-order Horner polynomial. Only accurate for
		//     x ∈ [−π/2, π/2] (error < 0.47% at the domain edge). No range
		//     checking at all - garbage in, garbage out. Use ONLY where the
		//     input domain is guaranteed by construction (documented at each
		//     call site). This is the historical "FastSin/FastCos" from the
		//     original library, renamed to make the precondition explicit.
		//
		//     NOTE: public (not internal) here because Godot/FastMath and
		//     Numerics/FastMath live in separate assemblies and call these
		//     directly (via `using static`) from their FastQuaternion.cs -
		//     see the domain proof at each call site there.
		//
		//   FastSin / FastCos
		//     General-purpose, safe for ANY finite input. Reduces x into
		//     [−π, π] first, then reflects into [−π/2, π/2] where the
		//     polynomial above is valid, before evaluating it. This fixes a
		//     real bug in the original FromEuler.cs: half-angles built from
		//     un-normalized/accumulated Euler input (e.g. |yaw| > π) used to
		//     silently feed the polynomial outside its valid domain with no
		//     diagnostic.
		//
		//     Measured cost (not "negligible" as an earlier draft of this
		//     comment claimed - that was an unverified guess, corrected after
		//     actually benchmarking it): ~2.6x FastSinUnsafe's cost even when
		//     the input is already in-domain (the Round() float->int cast
		//     dominates), and up to ~11x for genuinely out-of-range input
		//     (unpredictable reflection branches). In absolute terms this is
		//     still a few nanoseconds - fine for a once-per-frame FromEuler/
		//     Exp call - but NOT free, and NOT safe to sprinkle into a tight
		//     per-vertex/per-particle loop without thinking about it. Use
		//     FastSinUnsafe directly (with a documented domain proof at the
		//     call site, as FastSlerp does) whenever the input range is
		//     actually known - see BENCHMARKS.md for the measured numbers.
		// ==================================================================

		private const float SIN_S0 = 1.00000000f;
		private const float SIN_S2 = -0.16666667f;   // -1/6
		private const float SIN_S4 = 0.00833333f;    //  1/120

		private const float COS_C0 = 1.00000000f;
		private const float COS_C2 = -0.50000000f;   // -1/2
		private const float COS_C4 = 0.04166667f;    //  1/24

		/// <summary>
		/// Fast sin, Horner scheme. PRECONDITION: x ∈ [−π/2, π/2] - not checked.
		/// Error: ~0.47% at |x| = π/2 (worst case). Naturally odd.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastSinUnsafe( float x )
		{
			float x2 = x * x;
			return x * ( SIN_S0 + x2 * ( SIN_S2 + x2 * SIN_S4 ) );
		}

		/// <summary>
		/// Fast cos, Horner scheme. PRECONDITION: x ∈ [−π/2, π/2] - not checked.
		/// cos(x) ≈ 1 − x²/2 + x⁴/24.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastCosUnsafe( float x )
		{
			float x2 = x * x;
			return COS_C0 + x2 * ( COS_C2 + x2 * COS_C4 );
		}

		/// <summary>
		/// General-purpose fast sin - valid for any finite input.
		/// Range-reduces to [−π, π], reflects into the polynomial's safe
		/// domain [−π/2, π/2], then evaluates. Same error bound as
		/// <see cref="FastSinUnsafe"/> (~0.47% worst case) but never silently
		/// degrades outside that bound. Use this unless you can prove the
		/// input is already inside [−π/2, π/2].
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastSin( float x )
		{
			// Reduce to [-π, π].
			x -= TWO_PI * Round( x * INV_TWO_PI );

			// Reflect into [-π/2, π/2]: sin(π - x) = sin(x), sin(-π - x) = sin(x).
			if ( x > HALF_PI ) x = PI - x;
			else if ( x < -HALF_PI ) x = -PI - x;

			return FastSinUnsafe( x );
		}

		/// <summary>
		/// General-purpose fast cos - valid for any finite input.
		/// Implemented as FastSin(x + π/2) to reuse the same range reduction
		/// and polynomial without a second code path to keep in sync.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastCos( float x ) => FastSin( x + HALF_PI );

		/// <summary>
		/// Fast arccosine. Returns angle in radians, range [0, π].
		/// Implemented via FastAtan2, so shares its error bounds and avoids
		/// a separate polynomial fit to keep in sync.
		/// <para>Fast mode error:    &lt; 0.005 rad (≈ 0.28°)</para>
		/// <para>Precise mode error: &lt; 0.001 rad  (≈ 0.06°)</para>
		/// </summary>
		/// <param name="x">Input value, clamped to [−1, 1].</param>
		/// <param name="precise">Use higher-order polynomial for better accuracy.</param>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAcos( float x, bool precise = false )
		{
			// Clamp defensively - callers routinely pass dot products that drift
			// a hair outside [-1, 1] due to float error; Sqrt would return NaN otherwise.
			if ( x < -1f ) x = -1f;
			else if ( x > 1f ) x = 1f;

			// acos(x) = atan2(sqrt(1 - x²), x) - reuses the same octant-reduction
			// machinery and polynomial as FastAtan2 instead of a separate fit.
			float s = FastSqrt( 1f - x * x );
			return FastAtan2( s, x, precise );
		}
	}
}
